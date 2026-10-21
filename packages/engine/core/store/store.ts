// T02-09: per-partition engine state store (G6 TableDef/StoreRead/Store; 02 §3.6.3; 19 Rules 3.6.3, 3.6.6; 20 Rule 3.2.5).
// Step 1 data structure: per table a committed SortedMap<Id, Entity> plus an open-tick overlay SortedMap<Id, Entity | TOMBSTONE>;
// `current` reads the overlay first, commit merges it into the base. The undo log is the ordered WriteRecord list.
import { cmpStr } from '../order';
import { SortedMap, SortedSet } from '../sorted';
import { EngineFault, phaseIndex, type Id, type PhaseId } from '../types';
import { entityHash, logicalTerm, MOD_2_256, merkleOfLeaves, partitionLeaf, cmpLeaf } from './hash';
import { type TableDef, type TableRegistry } from './table';
import { copyBytesOut, hasBytes, normalizeEntity, type WriteRecord } from './undo';
import { sortBy } from '../order';

export type { WriteRecord } from './undo';
export interface StoreRead { get<T>(table: string, id: Id): T | undefined; iter<T>(table: string): Iterable<T>; range<T>(table: string, fromId: Id, toId: Id): Iterable<T>;
  index<T>(table: string, indexName: string, key: string): Iterable<T>; count(table: string): number }     // G6
export interface Store extends StoreRead { put<T>(table: string, entity: T): void; del(table: string, id: Id): void }   // G6
/** 19 Rule 3.6.3: a write by a module that does not own the table. Code 'INV-ENG-001'; aborts the tick (safe mode). */
export class OwnershipViolation extends EngineFault {
  constructor(message: string, entityIds: Id[] = []) { super('INV-ENG-001', message, entityIds); this.name = 'OwnershipViolation'; }
}
export interface StoreBinding { module: string; phase: PhaseId; entityScope?: Id }
export interface ReadStamp { table: string; id: Id; readerPhase: PhaseId; writerPhase: PhaseId; readerModule: string }
export interface StoreViolation { partitionId: string; module: string; table: string; id: Id; phase: PhaseId }

const TOMB = Symbol('tombstone');
type Slot = { v: unknown; eh: Uint8Array; bytes?: true } | typeof TOMB;
/** E-73: values holding bytes are copied on every read. */
const out = (s: { v: unknown; bytes?: true }): unknown => (s.bytes ? copyBytesOut(s.v) : s.v);
interface OverlayEntry { slot: Slot; phase: PhaseId }
interface Tbl {
  def: TableDef<unknown>;
  base: SortedMap<Id, { v: unknown; eh: Uint8Array; bytes?: true }>;
  overlay: SortedMap<Id, OverlayEntry>;
  /** current-state secondary indexes: index name -> key -> ids. */
  idx: SortedMap<string, SortedMap<string, SortedSet<Id>>>;
  leaves: Uint8Array[] | null;   // cached sorted leaves of the committed base (null = dirty)
}

/** Merge of the base and overlay maps in id order (overlay wins; tombstones drop). */
function* merged(t: Tbl, from?: Id, to?: Id): Generator<[Id, { v: unknown; eh: Uint8Array; bytes?: true }, OverlayEntry | undefined]> {
  const b = from === undefined ? t.base.entries() : t.base.range(from, to!), o = from === undefined ? t.overlay.entries() : t.overlay.range(from, to!);
  let nb = b.next(), no = o.next();
  while (!nb.done || !no.done) {
    const c = nb.done ? 1 : no.done ? -1 : cmpStr(nb.value[0], no.value[0]);
    if (c < 0) { yield [nb.value[0], nb.value[1], undefined]; nb = b.next(); continue; }
    const [id, e] = no.value;
    if (e.slot !== TOMB) yield [id, e.slot, e];
    no = o.next(); if (c === 0) nb = b.next();
  }
}

export class PartitionStore {
  private readonly t = new SortedMap<string, Tbl>();
  private log: WriteRecord[] = [];
  private seq = 0;
  private stamps: ReadStamp[] = [];
  private viol: StoreViolation[] = [];
  private sum = 0n;            // logicalStateHash of current
  readonly committed: StoreRead;
  readonly current: StoreRead;

  constructor(tables: TableRegistry, readonly partitionId: string, private readonly opts: { testMode?: boolean } = {}) {
    for (const def of tables.all()) {
      const idx = new SortedMap<string, SortedMap<string, SortedSet<Id>>>();
      for (const i of def.indexes ?? []) idx.set(i.name, new SortedMap());
      this.t.set(def.name, { def, base: new SortedMap(), overlay: new SortedMap(), idx, leaves: [] });
    }
    this.committed = this.reader('committed');
    this.current = this.reader('current');
  }

  private tbl(name: string): Tbl {
    const t = this.t.get(name);
    if (!t) throw new EngineFault('TBL_UNKNOWN', `unknown table '${name}'`);
    return t;
  }

  private reader(view: 'committed' | 'current', b?: StoreBinding): StoreRead {
    const stamp = (table: string, id: Id, e: OverlayEntry | undefined): void => {
      if (b && e) this.stamps.push({ table, id, readerPhase: b.phase, writerPhase: e.phase, readerModule: b.module });
    };
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- generator members cannot be arrows
    const self = this;
    return {
      get<T>(table: string, id: Id): T | undefined {
        const t = self.tbl(table);
        if (view === 'current') {
          const e = t.overlay.get(id);
          if (e) { stamp(table, id, e); return e.slot === TOMB ? undefined : (out(e.slot) as T); }
        }
        const b0 = t.base.get(id); return b0 ? (out(b0) as T) : undefined;
      },
      *iter<T>(table: string): Iterable<T> {
        const t = self.tbl(table);
        if (view === 'committed') { for (const v of t.base.values()) yield out(v) as T; return; }
        for (const [id, s, e] of merged(t)) { stamp(table, id, e); yield out(s) as T; }
      },
      *range<T>(table: string, fromId: Id, toId: Id): Iterable<T> {
        const t = self.tbl(table);
        if (view === 'committed') { for (const [, v] of t.base.range(fromId, toId)) yield out(v) as T; return; }
        for (const [id, s, e] of merged(t, fromId, toId)) { stamp(table, id, e); yield out(s) as T; }
      },
      *index<T>(table: string, indexName: string, key: string): Iterable<T> {
        const t = self.tbl(table), d = t.def.indexes?.find((i) => i.name === indexName);
        if (!d) throw new EngineFault('TBL_UNKNOWN', `unknown index '${indexName}' on '${table}'`);
        if (view === 'committed') { for (const v of t.base.values()) if (d.key(v.v) === key) yield out(v) as T; return; }
        for (const id of t.idx.get(indexName)!.get(key) ?? []) {
          const e = t.overlay.get(id); stamp(table, id, e);
          const s = e ? e.slot : t.base.get(id);
          if (s && s !== TOMB) yield out(s) as T;
        }
      },
      count(table: string): number {
        const t = self.tbl(table);
        if (view === 'committed') return t.base.size;
        let n = t.base.size;
        for (const [id, e] of t.overlay) n += (e.slot === TOMB ? 0 : 1) - (t.base.has(id) ? 1 : 0);
        return n;
      },
    };
  }

  /** Current value of (table, id) as a slot, for undo/index bookkeeping. */
  private cur(t: Tbl, id: Id): { v: unknown; eh: Uint8Array } | undefined {
    const e = t.overlay.get(id);
    return e ? (e.slot === TOMB ? undefined : e.slot) : t.base.get(id);
  }
  private reindex(t: Tbl, id: Id, before: unknown, after: unknown): void {
    for (const d of t.def.indexes ?? []) {
      const m = t.idx.get(d.name)!;
      const kb = before === undefined ? null : d.key(before), ka = after === undefined ? null : d.key(after);
      if (kb === ka) continue;
      if (kb !== null) { const s = m.get(kb)!; s.delete(id); if (s.size === 0) m.delete(kb); }
      if (ka !== null) { let s = m.get(ka); if (!s) { s = new SortedSet(); m.set(ka, s); } s.add(id); }
    }
  }
  /** Replace the current slot of (table, id), keeping the running logical sum and indexes in step. */
  private setCurrent(t: Tbl, id: Id, next: OverlayEntry | null): void {
    const old = this.cur(t, id);
    if (old) this.sum = (this.sum - logicalTerm(id, old.eh) + MOD_2_256) % MOD_2_256;
    if (next) t.overlay.set(id, next); else t.overlay.delete(id);
    const now = this.cur(t, id);
    if (now) this.sum = (this.sum + logicalTerm(id, now.eh)) % MOD_2_256;
    this.reindex(t, id, old?.v, now?.v);
  }

  private write(b: StoreBinding, table: string, id: Id, entity: unknown | typeof TOMB): void {
    const t = this.t.get(table);
    if (!t) throw new EngineFault('TBL_UNKNOWN', `unknown table '${table}'`);
    if (t.def.module !== b.module) {
      this.viol.push({ partitionId: this.partitionId, module: b.module, table, id, phase: b.phase });
      throw new OwnershipViolation(`module '${b.module}' wrote table '${table}' owned by '${t.def.module}'`, [id]);
    }
    const before = this.cur(t, id)?.v;
    const slot: Slot = entity === TOMB ? TOMB : (() => { const v = normalizeEntity(entity, table, id); return hasBytes(v) ? { v, eh: entityHash(v), bytes: true as const } : { v, eh: entityHash(v) }; })();
    this.setCurrent(t, id, { slot, phase: b.phase });
    this.log.push({ table, id, module: b.module, phase: b.phase, kind: entity === TOMB ? 'DEL' : 'PUT', before, after: slot === TOMB ? undefined : slot.v, seq: this.seq++ });
  }

  /** A Store view whose writes are checked against b.module and stamped with b.phase; its reads record phase stamps. */
  bind(b: StoreBinding): Store {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- object-literal methods
    const self = this, r = this.reader('current', b);
    return {
      ...r,
      get: r.get, iter: r.iter, range: r.range, index: r.index, count: r.count,
      put<T>(table: string, entity: T): void { const t = self.tbl(table); self.write(b, table, t.def.idOf(entity), entity); },
      del(table: string, id: Id): void { self.write(b, table, id, TOMB); },
    };
  }

  beginTick(tick: number): void {
    if (this.log.length > 0 || [...this.t.values()].some((t) => t.overlay.size > 0)) throw new EngineFault('I0.store_open_tick', 'beginTick with an open tick');
    void tick; this.stamps = []; this.viol = []; this.seq = 0;
  }
  /** New records each call; before/after holding bytes are copied (E-73 AC-02-09-BYTES-ISOLATION). */
  writeSet(): readonly WriteRecord[] { return this.log.map((w) => ({ ...w, before: copyBytesOut(w.before), after: copyBytesOut(w.after) })); }
  readStamps(): readonly ReadStamp[] { return this.stamps.slice(); }
  /** OwnershipViolation records caught this tick (the engine supplies them as fact 'core.store.violations' to INV-ENG-001). */
  /** E-73 AC-02-09-VIOLATIONS: a new array of new records, ordered by partition, then key (table, id), then module and phase;
   *  ties keep write order (sortBy is stable). */
  violations(): StoreViolation[] {
    return sortBy(this.viol, (v) => [v.partitionId, v.table, v.id, v.module, phaseIndex(v.phase)]).map((v) => ({ ...v }));
  }

  rollbackTick(): void {
    for (const t of this.t.values()) for (const id of [...t.overlay.keys()]) this.setCurrent(t, id, null);
    this.log = [];
  }
  rollbackEntity(table: string, id: Id): void {
    const t = this.tbl(table);
    if (t.overlay.has(id)) this.setCurrent(t, id, null);
    this.log = this.log.filter((w) => !(w.table === table && w.id === id));
  }

  commitTick(): { stateHash: Uint8Array; logicalStateHash: bigint; dirty: number } {
    let dirty = 0;
    for (const t of this.t.values()) {
      if (t.overlay.size > 0) t.leaves = null;
      for (const [id, e] of t.overlay) { dirty++; if (e.slot === TOMB) t.base.delete(id); else t.base.set(id, e.slot); }
      t.overlay = new SortedMap();
    }
    this.log = [];
    return { stateHash: this.stateHash(), logicalStateHash: this.sum, dirty };
  }

  logicalStateHash(): bigint { return this.sum; }
  /** Partition Merkle of current; committed tables' sorted leaf lists are cached and rebuilt only when dirty. */
  stateHash(): Uint8Array {
    const all: { table: string; id: Id; leaf: Uint8Array }[] = [];
    for (const [name, t] of this.t) {
      if (t.overlay.size === 0) {
        if (!t.leaves) t.leaves = [...t.base.entries()].map(([id, s]) => partitionLeaf(name, id, s.eh));
        let i = 0; for (const id of t.base.keys()) all.push({ table: name, id, leaf: t.leaves[i++]! });
      } else for (const [id, s] of merged(t)) all.push({ table: name, id, leaf: partitionLeaf(name, id, s.eh) });
    }
    all.sort(cmpLeaf);
    return merkleOfLeaves(all.map((e) => e.leaf));
  }
  entityHash(table: string, id: Id): Uint8Array | undefined { return this.cur(this.tbl(table), id)?.eh; }

  /** Test-only bypass of ownership (TestWorld.asSystem, G6): writes as the owning module of each table, phase P0. */
  asSystem(): Store {
    if (!this.opts.testMode) throw new EngineFault('I0.test_only', 'asSystem() requires a store created with { testMode: true }');
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- object-literal methods
    const self = this, r = this.reader('current');
    return {
      ...r, get: r.get, iter: r.iter, range: r.range, index: r.index, count: r.count,
      put<T>(table: string, entity: T): void { const t = self.tbl(table); self.write({ module: t.def.module, phase: 'P0' }, table, t.def.idOf(entity), entity); },
      del(table: string, id: Id): void { const t = self.tbl(table); self.write({ module: t.def.module, phase: 'P0' }, table, id, TOMB); },
    };
  }
}
