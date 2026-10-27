import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { canonEncode } from '../canon';
import { sha256, sha256Concat } from '../crypto/sha256';
import { toHex } from '../crypto/hex';
import { merkleRoot } from '../merkle';
import { toMoney, toPrice, toQty } from '../fixed';
import type { InvariantCtx, TruthStoreRead } from '../invariants';
import { EngineFault, type Ccy } from '../types';
import * as prov from './provenance';
import { INV_ENG_002 } from '../rng/invariants';
import { INV_ENG_003 } from '../ids';
import {
  entityHash, FACT_READ_STAMPS, FACT_STORE_VIOLATIONS, hex256, INV_ENG_001, INV_ENG_006, logicalTerm, MoneyProvenance, OwnershipViolation,
  PartitionStore, partitionMerkle, provenanceWrappers, setActiveProvenance, TableError, TableRegistry,
} from './index';

interface Chr { id: string; n: number; tag?: string }
const reg = (): TableRegistry => {
  const r = new TableRegistry();
  r.add({ name: 'chr.entity', module: '04', idOf: (e: Chr) => e.id, indexes: [{ name: 'byTag', key: (e: Chr) => e.tag ?? null }] });
  r.add({ name: 'led.account', module: '03', idOf: (e: Chr) => e.id });
  return r;
};
const ids = <T extends { id: string }>(it: Iterable<T>): string[] => [...it].map((e) => e.id);
const lcg = (seed: number) => { let s = seed >>> 0; return (): number => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; }; };

describe('T02-09 TableRegistry', () => {
  it('rejects bad names, duplicates and unknown owners', () => {
    const r = reg();
    expect(() => r.add({ name: 'chr.entity', module: '04', idOf: (e: Chr) => e.id })).toThrow(expect.objectContaining({ code: 'TBL_DUPLICATE' }));
    expect(() => r.add({ name: 'Chr.x', module: '04', idOf: (e: Chr) => e.id })).toThrow(expect.objectContaining({ code: 'TBL_BAD_NAME' }));
    expect(() => r.add({ name: 'c.x', module: '04', idOf: (e: Chr) => e.id })).toThrow(TableError);
    expect(() => r.owner('nope.x')).toThrow(expect.objectContaining({ code: 'TBL_UNKNOWN' }));
    expect(r.owner('led.account')).toBe('03');
    expect(r.all().map((d) => d.name)).toEqual(['chr.entity', 'led.account']);
  });
});

describe('T02-09 PartitionStore', () => {
  it('ownership: a non-owner write throws OwnershipViolation (INV-ENG-001) and is recorded; the owner write lands', () => {
    const s = new PartitionStore(reg(), 'p1'); s.beginTick(1);
    const w = s.bind({ module: '03', phase: 'P5' });
    expect(() => w.put('chr.entity', { id: 'chr_A', n: 1 })).toThrow(OwnershipViolation);
    try { w.del('chr.entity', 'chr_A'); } catch (e) { expect((e as EngineFault).code).toBe('INV-ENG-001'); }
    expect(s.violations()).toEqual([{ partitionId: 'p1', module: '03', table: 'chr.entity', id: 'chr_A', phase: 'P5' }, { partitionId: 'p1', module: '03', table: 'chr.entity', id: 'chr_A', phase: 'P5' }]);
    expect(s.current.get('chr.entity', 'chr_A')).toBeUndefined();
    s.bind({ module: '04', phase: 'P5' }).put('chr.entity', { id: 'chr_A', n: 1 });
    expect(s.writeSet()).toMatchObject([{ table: 'chr.entity', id: 'chr_A', module: '04', phase: 'P5', kind: 'PUT', seq: 0 }]);
  });

  it('committed vs current, commitTick, rollbackTick and rollbackEntity restore state, indexes and hashes', () => {
    const s = new PartitionStore(reg(), 'p1'); const sys = (): ReturnType<PartitionStore['bind']> => s.bind({ module: '04', phase: 'P3' });
    s.beginTick(1); sys().put('chr.entity', { id: 'chr_A', n: 1, tag: 'x' }); sys().put('chr.entity', { id: 'chr_B', n: 2, tag: 'x' });
    expect(s.committed.count('chr.entity')).toBe(0); expect(s.current.count('chr.entity')).toBe(2);
    const c1 = s.commitTick(); expect(c1.dirty).toBe(2);
    const h1 = toHex(s.stateHash()), l1 = s.logicalStateHash();
    s.beginTick(2);
    sys().put('chr.entity', { id: 'chr_A', n: 9, tag: 'y' }); sys().del('chr.entity', 'chr_B'); sys().put('chr.entity', { id: 'chr_C', n: 3 });
    expect(s.committed.get<Chr>('chr.entity', 'chr_A')!.n).toBe(1); expect(s.current.get<Chr>('chr.entity', 'chr_A')!.n).toBe(9);
    expect(ids(s.current.iter<Chr>('chr.entity'))).toEqual(['chr_A', 'chr_C']); expect(s.current.count('chr.entity')).toBe(2);
    expect(ids(s.current.index<Chr>('chr.entity', 'byTag', 'x'))).toEqual([]); expect(ids(s.current.index<Chr>('chr.entity', 'byTag', 'y'))).toEqual(['chr_A']);
    expect(toHex(s.stateHash())).not.toBe(h1); expect(s.logicalStateHash()).not.toBe(l1);
    s.rollbackEntity('chr.entity', 'chr_A');
    expect(s.current.get<Chr>('chr.entity', 'chr_A')!.n).toBe(1); expect(s.writeSet().map((w) => w.id)).toEqual(['chr_B', 'chr_C']);
    s.rollbackTick();
    expect(ids(s.current.iter<Chr>('chr.entity'))).toEqual(['chr_A', 'chr_B']); expect(s.writeSet()).toEqual([]);
    expect(ids(s.current.index<Chr>('chr.entity', 'byTag', 'x'))).toEqual(['chr_A', 'chr_B']);
    expect(toHex(s.stateHash())).toBe(h1); expect(s.logicalStateHash()).toBe(l1);
    expect(() => { s.beginTick(3); sys().put('chr.entity', { id: 'chr_Z', n: 0 }); s.beginTick(4); }).toThrow(expect.objectContaining({ code: 'I0.store_open_tick' }));
  });

  it('iteration and range are in id order (cmpStr) regardless of insertion order; range is [from, to)', () => {
    const s = new PartitionStore(reg(), 'p1'); s.beginTick(1); const w = s.bind({ module: '04', phase: 'P1' });
    for (const id of ['chr_b', 'chr_B', 'chr_a', 'chr_C', 'chr_A']) w.put('chr.entity', { id, n: 0 });
    expect(ids(s.current.iter<Chr>('chr.entity'))).toEqual(['chr_A', 'chr_B', 'chr_C', 'chr_a', 'chr_b']);
    expect(ids(s.current.range<Chr>('chr.entity', 'chr_B', 'chr_a'))).toEqual(['chr_B', 'chr_C']);
    s.commitTick(); s.beginTick(2); w.del('chr.entity', 'chr_C'); w.put('chr.entity', { id: 'chr_BB', n: 1 });
    expect(ids(s.current.range<Chr>('chr.entity', 'chr_B', 'chr_a'))).toEqual(['chr_B', 'chr_BB']);
    expect(ids(s.committed.range<Chr>('chr.entity', 'chr_B', 'chr_a'))).toEqual(['chr_B', 'chr_C']);
  });

  it('02 §3.7.2 normalisation: -0 -> +0, NaN/Infinity fault I0.nan, Map/Set/class rejected, stored copy is frozen', () => {
    const s = new PartitionStore(reg(), 'p1'); s.beginTick(1); const w = s.bind({ module: '04', phase: 'P1' });
    const src = { id: 'chr_A', n: -0, deep: { v: [-0, 1n] }, gone: undefined };
    w.put('chr.entity', src);
    const got = s.current.get<{ n: number; deep: { v: unknown[] } }>('chr.entity', 'chr_A')!;
    expect(Object.is(got.n, 0)).toBe(true); expect(Object.is(got.deep.v[0], 0)).toBe(true); expect('gone' in got).toBe(false);
    expect(Object.isFrozen(got) && Object.isFrozen(got.deep) && Object.isFrozen(got.deep.v)).toBe(true);
    src.n = 5; expect(got.n).toBe(0);
    expect(toHex(s.entityHash('chr.entity', 'chr_A')!)).toBe(toHex(entityHash({ id: 'chr_A', n: 0, deep: { v: [0, 1n] } })));
    for (const bad of [NaN, Infinity]) expect(() => w.put('chr.entity', { id: 'chr_N', n: bad })).toThrow(expect.objectContaining({ code: 'I0.nan' }));
    for (const bad of [new Map(), new Set(), new Date(0)]) expect(() => w.put('chr.entity', { id: 'chr_M', n: 0, x: bad })).toThrow(expect.objectContaining({ code: 'I0.store_type' }));
    expect(() => w.put('chr.entity', { id: 'chr_U', n: 0, x: [undefined] })).toThrow(expect.objectContaining({ code: 'I0.store_type' }));
    expect(s.current.get('chr.entity', 'chr_N')).toBeUndefined();
  });

  it('logicalStateHash worked example: Σ u256(SHA-256(id ‖ SHA-256(canonEncode(e)))) mod 2^256, partition-independent', () => {
    const a = { id: 'chr_A', n: 1 }, b = { id: 'led_B', n: 2 };
    const term = (e: { id: string }): bigint => BigInt(`0x${toHex(sha256Concat(e.id, sha256(canonEncode(e))))}`);
    expect(logicalTerm(a.id, entityHash(a))).toBe(term(a));
    const one = new PartitionStore(reg(), 'p1'); one.beginTick(1);
    one.bind({ module: '04', phase: 'P1' }).put('chr.entity', a); one.bind({ module: '03', phase: 'P1' }).put('led.account', b); one.commitTick();
    const p1 = new PartitionStore(reg(), 'p1'), p2 = new PartitionStore(reg(), 'p2');
    p1.beginTick(1); p1.bind({ module: '04', phase: 'P1' }).put('chr.entity', a); p1.commitTick();
    p2.beginTick(1); p2.bind({ module: '03', phase: 'P1' }).put('led.account', b); p2.commitTick();
    const expected = (term(a) + term(b)) % (1n << 256n);
    expect(one.logicalStateHash()).toBe(expected);
    expect((p1.logicalStateHash() + p2.logicalStateHash()) % (1n << 256n)).toBe(expected);
    expect(hex256(expected)).toMatch(/^[0-9a-f]{64}$/); expect(hex256(-1n)).toBe('f'.repeat(64));
  });

  it('partition stateHash = Merkle over (table, id, eh) in kindTag, table, id order; empty = sha256("TYC/empty")', () => {
    const s = new PartitionStore(reg(), 'p1');
    expect(toHex(s.stateHash())).toBe(toHex(sha256Concat('TYC/empty')));
    s.beginTick(1);
    s.bind({ module: '04', phase: 'P1' }).put('chr.entity', { id: 'chr_A', n: 1 }); s.bind({ module: '03', phase: 'P1' }).put('led.account', { id: 'bnk_Z', n: 1 });
    const want = partitionMerkle([{ table: 'chr.entity', id: 'chr_A', eh: entityHash({ id: 'chr_A', n: 1 }) }, { table: 'led.account', id: 'bnk_Z', eh: entityHash({ id: 'bnk_Z', n: 1 }) }]);
    expect(toHex(s.stateHash())).toBe(toHex(want));
    expect(toHex(s.commitTick().stateHash)).toBe(toHex(want));
    expect(toHex(s.stateHash())).toBe(toHex(want));   // cached leaves path
  });
  it('partition stateHash worked example: leaf = sha256(table ‖ 0x00 ‖ id ‖ 0x00 ‖ eh), T02-07 tree, order kindTag → table → id', () => {
    const r = reg(); r.add({ name: 'chr.other', module: '04', idOf: (e: Chr) => e.id });
    const s = new PartitionStore(r, 'p1'); s.beginTick(1);
    const w4 = s.bind({ module: '04', phase: 'P1' }), w3 = s.bind({ module: '03', phase: 'P1' });
    const es: [string, Chr][] = [['led.account', { id: 'chr_A', n: 1 }], ['chr.other', { id: 'chr_0', n: 2 }], ['chr.entity', { id: 'chr_B', n: 3 }], ['led.account', { id: 'bnk_Z', n: 4 }]];
    for (const [t, e] of es) (t === 'led.account' ? w3 : w4).put(t, e);
    const leaf = (t: string, e: Chr): Uint8Array => sha256Concat(t, Uint8Array.of(0), e.id, Uint8Array.of(0), sha256(canonEncode(e)));
    // bnk before chr (KIND_TAG_ORDER); within chr: table first (chr.entity < chr.other < led.account), then id
    const order = [es[3]!, es[2]!, es[1]!, es[0]!];
    // odd leaf count: the last node is promoted, not duplicated (T02-07 shape); 3 leaves
    const s3 = new PartitionStore(r, 'p1'); s3.beginTick(1);
    for (const [tb, e] of es.slice(1)) (tb === 'led.account' ? s3.bind({ module: '03', phase: 'P1' }) : s3.bind({ module: '04', phase: 'P1' })).put(tb, e);
    const l3 = [es[3]!, es[2]!, es[1]!].map(([tb, e]) => leaf(tb, e)), lh = (x: Uint8Array): Uint8Array => sha256Concat(Uint8Array.of(0), x);
    const promoted = sha256Concat(Uint8Array.of(1), sha256Concat(Uint8Array.of(1), lh(l3[0]!), lh(l3[1]!)), lh(l3[2]!));
    expect(toHex(s3.stateHash())).toBe(toHex(promoted)); expect(toHex(s3.stateHash())).toBe(toHex(merkleRoot(l3)));
    const dup = sha256Concat(Uint8Array.of(1), sha256Concat(Uint8Array.of(1), lh(l3[0]!), lh(l3[1]!)), sha256Concat(Uint8Array.of(1), lh(l3[2]!), lh(l3[2]!)));
    expect(toHex(s3.stateHash())).not.toBe(toHex(dup));
    expect(toHex(s.stateHash())).toBe(toHex(merkleRoot(order.map(([t, e]) => leaf(t, e)))));
  });

  it('determinism: 100,000 random ops, run twice from the same seed, give identical hashes; state equals a plain-model replay', () => {
    const run = (): { h: string; l: bigint; model: string } => {
      const r = lcg(42), s = new PartitionStore(reg(), 'p1'), model: Record<string, number> = {};
      const w = s.bind({ module: '04', phase: 'P4' });
      s.beginTick(0);
      for (let i = 0; i < 100_000; i++) {
        const id = `chr_${Math.floor(r() * 500)}`, op = r();
        if (op < 0.6) { const n = Math.floor(r() * 1000); w.put('chr.entity', { id, n }); model[id] = n; }
        else if (op < 0.8) { w.del('chr.entity', id); delete model[id]; }
        else if (op < 0.85) { const snap = { ...model }; s.commitTick(); s.beginTick(i); void snap; }
        else if (op < 0.86) { s.rollbackTick(); for (const k of Object.keys(model)) delete model[k]; for (const e of s.committed.iter<Chr>('chr.entity')) model[e.id] = e.n; }
      }
      s.commitTick();
      const got = [...s.committed.iter<Chr>('chr.entity')].map((e) => `${e.id}=${e.n}`).join(',');
      const want = Object.keys(model).sort().map((k) => `${k}=${model[k]}`).join(',');
      expect(got).toBe(want);
      return { h: toHex(s.stateHash()), l: s.logicalStateHash(), model: got };
    };
    const a = run(), b = run();
    expect(a).toEqual(b);
  }, 120_000);

  it('phase stamps: reads of this-tick writes are stamped; INV-ENG-006 fails a read from an earlier phase than the write', () => {
    const s = new PartitionStore(reg(), 'p1'); s.beginTick(1);
    s.bind({ module: '04', phase: 'P7' }).put('chr.entity', { id: 'chr_A', n: 1, tag: 't' });
    const early = s.bind({ module: '04', phase: 'P3' }), late = s.bind({ module: '04', phase: 'P9' });
    early.get('chr.entity', 'chr_A'); late.get('chr.entity', 'chr_A'); void [...early.iter('chr.entity')]; void [...early.index('chr.entity', 'byTag', 't')];
    expect(s.readStamps()).toEqual([
      { table: 'chr.entity', id: 'chr_A', readerPhase: 'P3', writerPhase: 'P7', readerModule: '04' },
      { table: 'chr.entity', id: 'chr_A', readerPhase: 'P9', writerPhase: 'P7', readerModule: '04' },
      { table: 'chr.entity', id: 'chr_A', readerPhase: 'P3', writerPhase: 'P7', readerModule: '04' },
      { table: 'chr.entity', id: 'chr_A', readerPhase: 'P3', writerPhase: 'P7', readerModule: '04' },
    ]);
    const ctx = (facts: Record<string, unknown>): InvariantCtx => ({ ...ctxBase, facts: { get: <T,>(k: string) => facts[k] as T | undefined } });
    expect(INV_ENG_006.check(ctx({ [FACT_READ_STAMPS]: s.readStamps().slice(1, 2) }))).toEqual({ ok: true });
    expect(INV_ENG_006.check(ctx({ [FACT_READ_STAMPS]: s.readStamps() }))).toMatchObject({ ok: false, entityIds: ['chr_A', 'chr_A', 'chr_A'] });
    // P10 vs P9: index order, not string order ('P10' < 'P9' as strings)
    expect(INV_ENG_006.check(ctx({ [FACT_READ_STAMPS]: [{ table: 't.x', id: 'chr_A', readerPhase: 'P10', writerPhase: 'P9', readerModule: '04' }] }))).toEqual({ ok: true });
    expect(INV_ENG_006.check(ctx({}))).toEqual({ ok: true });
    // same-phase read of a same-phase write is allowed (reader index == writer index)
    expect(INV_ENG_006.check(ctx({ [FACT_READ_STAMPS]: [{ table: 'chr.entity', id: 'chr_A', readerPhase: 'P7', writerPhase: 'P7', readerModule: '04' }] }))).toEqual({ ok: true });
    s.commitTick(); s.beginTick(2); early.get('chr.entity', 'chr_A'); expect(s.readStamps()).toEqual([]);
  });

  it('INV-ENG-001 fails on any recorded violation and passes on none', () => {
    const s = new PartitionStore(reg(), 'p1'); s.beginTick(1);
    expect(() => s.bind({ module: '03', phase: 'P2' }).put('chr.entity', { id: 'chr_A', n: 1 })).toThrow(OwnershipViolation);
    const ctx = (v: unknown): InvariantCtx => ({ ...ctxBase, facts: { get: <T,>(k: string) => (k === FACT_STORE_VIOLATIONS ? v : undefined) as T | undefined } });
    expect(INV_ENG_001.check(ctx(s.violations()))).toEqual({ ok: false, entityIds: ['chr_A'], observed: 'module=03 table=chr.entity', expected: 'writes only by the owning module' });
    expect(INV_ENG_001.check(ctx([]))).toEqual({ ok: true }); expect(INV_ENG_001.check(ctx(undefined))).toEqual({ ok: true });
    expect([INV_ENG_001.def, INV_ENG_006.def]).toMatchObject([{ id: 'INV-ENG-001', scope: 'TICK', severity: 'FATAL' }, { id: 'INV-ENG-006', scope: 'TICK', severity: 'FATAL' }]);
  });

  it('StoreRead satisfies the T20A-01 TruthStoreRead structurally', () => { const s = new PartitionStore(reg(), 'p1'); const r: TruthStoreRead = s.current; expect(r.count('chr.entity')).toBe(0); });
  it('asSystem() bypasses ownership in testMode only', () => {
    expect(() => new PartitionStore(reg(), 'p1').asSystem()).toThrow(expect.objectContaining({ code: 'I0.test_only' }));
    const s = new PartitionStore(reg(), 'p1', { testMode: true }); s.beginTick(1);
    s.asSystem().put('led.account', { id: 'bnk_A', n: 1 }); s.asSystem().put('chr.entity', { id: 'chr_A', n: 1 });
    expect(s.writeSet().map((w) => w.module)).toEqual(['03', '04']); expect(s.violations()).toEqual([]);
  });
});

describe('E-73 store ACs', () => {
  it('AC-02-09-VIOLATIONS: violations() is a new array in (partition, key) order; mutating it leaves the store unchanged', () => {
    const s = new PartitionStore(reg(), 'p1'); s.beginTick(1);
    const bad = (m: string, ph: 'P2' | 'P9', t: string, id: string): void => { expect(() => s.bind({ module: m, phase: ph }).put(t, { id, n: 0 })).toThrow(OwnershipViolation); };
    bad('03', 'P9', 'chr.entity', 'chr_B'); bad('05', 'P2', 'led.account', 'bnk_A'); bad('03', 'P2', 'chr.entity', 'chr_A'); bad('01', 'P2', 'chr.entity', 'chr_B');
    const v = s.violations();
    expect(v.map((x) => `${x.partitionId}|${x.table}|${x.id}|${x.module}`)).toEqual(['p1|chr.entity|chr_A|03', 'p1|chr.entity|chr_B|01', 'p1|chr.entity|chr_B|03', 'p1|led.account|bnk_A|05']);
    expect(s.violations()).not.toBe(v);
    v.pop(); v[0]!.module = 'zz'; v.reverse();
    expect(s.violations().map((x) => x.module)).toEqual(['03', '01', '03', '05']);
    const p2 = new PartitionStore(reg(), 'p2'); p2.beginTick(1);
    expect(() => p2.bind({ module: '03', phase: 'P2' }).put('chr.entity', { id: 'chr_A', n: 0 })).toThrow(OwnershipViolation);
    expect(sortVi([...p2.violations(), ...s.violations()]).map((x) => x.partitionId)).toEqual(['p1', 'p1', 'p1', 'p1', 'p2']);
  });
  it('AC-02-09-BYTES-ISOLATION: mutating the input after a write, or any read result, leaves the stored bytes unchanged', () => {
    const s = new PartitionStore(reg(), 'p1'); s.beginTick(1); const w = s.bind({ module: '04', phase: 'P1' });
    const buf = Uint8Array.from([1, 2, 3]), src = { id: 'chr_A', n: 0, b: buf, nest: [{ c: Uint8Array.from([9]) }] };
    w.put('chr.entity', src); const h0 = toHex(s.entityHash('chr.entity', 'chr_A')!);
    buf[0] = 99; src.nest[0]!.c[0] = 99;
    type E = { b: Uint8Array; nest: { c: Uint8Array }[] };
    const reads = (): E[] => [s.current.get<E>('chr.entity', 'chr_A')!, [...s.current.iter<E>('chr.entity')][0]!, [...s.current.range<E>('chr.entity', 'chr_A', 'chr_B')][0]!,
      w.get<E>('chr.entity', 'chr_A')!, ...(s.writeSet()[0]!.after ? [s.writeSet()[0]!.after as E] : [])];
    for (const r of reads()) { expect([...r.b]).toEqual([1, 2, 3]); expect([...r.nest[0]!.c]).toEqual([9]); r.b[0] = 77; r.nest[0]!.c[0] = 77; }
    for (const r of reads()) { expect([...r.b]).toEqual([1, 2, 3]); expect([...r.nest[0]!.c]).toEqual([9]); }
    s.commitTick();
    for (const r of [s.committed.get<E>('chr.entity', 'chr_A')!, [...s.committed.iter<E>('chr.entity')][0]!, [...s.committed.range<E>('chr.entity', 'chr_A', 'chr_B')][0]!]) { r.b[1] = 77; }
    expect([...s.committed.get<E>('chr.entity', 'chr_A')!.b]).toEqual([1, 2, 3]);
    expect(toHex(s.entityHash('chr.entity', 'chr_A')!)).toBe(h0);
    // bytes held only inside an array are copied on read as well
    s.beginTick(2); w.put('chr.entity', { id: 'chr_Q', n: 0, arr: [Uint8Array.from([5])] });
    const q = s.current.get<{ arr: Uint8Array[] }>('chr.entity', 'chr_Q')!; q.arr[0]![0] = 66;
    expect([...s.current.get<{ arr: Uint8Array[] }>('chr.entity', 'chr_Q')!.arr[0]!]).toEqual([5]);
    expect(toHex(s.entityHash('chr.entity', 'chr_A')!)).toBe(toHex(entityHash({ id: 'chr_A', n: 0, b: Uint8Array.from([1, 2, 3]), nest: [{ c: Uint8Array.from([9]) }] })));
  });
});

describe('#45 QA pins', () => {
  it('E-73 (4): an index key function that writes into its argument cannot touch the stored bytes or stale the entity hash', () => {
    interface B { id: string; b: Uint8Array }
    const r = new TableRegistry();
    r.add({ name: 'chr.blob', module: '04', idOf: (e: B) => e.id, indexes: [{ name: 'k', key: (e: B) => { const k = String(e.b[0]); e.b[0] = 222; return k; } }] });
    const s = new PartitionStore(r, 'p1'); s.beginTick(1); const w = s.bind({ module: '04', phase: 'P1' });
    w.put('chr.blob', { id: 'chr_A', b: Uint8Array.from([1, 2]) });
    const h = toHex(s.entityHash('chr.blob', 'chr_A')!);
    expect([...s.current.get<B>('chr.blob', 'chr_A')!.b]).toEqual([1, 2]);
    expect(h).toBe(toHex(entityHash({ id: 'chr_A', b: Uint8Array.from([1, 2]) })));
    expect([...s.current.index<B>('chr.blob', 'k', '1')].map((e) => [...e.b])).toEqual([[1, 2]]);
    w.put('chr.blob', { id: 'chr_A', b: Uint8Array.from([3]) });   // reindex calls key(before) and key(after)
    s.commitTick();
    expect([...s.committed.index<B>('chr.blob', 'k', '3')].map((e) => [...e.b])).toEqual([[3]]);   // committed path calls key() per row
    expect([...s.committed.get<B>('chr.blob', 'chr_A')!.b]).toEqual([3]);
    expect(toHex(s.entityHash('chr.blob', 'chr_A')!)).toBe(toHex(entityHash({ id: 'chr_A', b: Uint8Array.from([3]) })));
  });
  it('writeSet().before bytes are copied', () => {
    const s = new PartitionStore(reg(), 'p1'); s.beginTick(1); const w = s.bind({ module: '04', phase: 'P1' });
    w.put('chr.entity', { id: 'chr_A', n: 0, b: Uint8Array.from([1]) }); s.commitTick(); s.beginTick(2);
    w.put('chr.entity', { id: 'chr_A', n: 1, b: Uint8Array.from([2]) });
    const before = s.writeSet()[0]!.before as { b: Uint8Array }; before.b[0] = 99;
    expect([...(s.writeSet()[0]!.before as { b: Uint8Array }).b]).toEqual([1]);
    expect([...s.committed.get<{ b: Uint8Array }>('chr.entity', 'chr_A')!.b]).toEqual([1]);
  });
  it('table-name regex is exactly ^[a-z]{2,8}\\.[a-z0-9_]+$ (1 and 9 letters fail, 2 and 8 pass)', () => {
    const ok = (n: string): boolean => { try { new TableRegistry().add({ name: n, module: '04', idOf: (e: Chr) => e.id }); return true; } catch { return false; } };
    expect([ok('a.x'), ok('ab.x'), ok('abcdefgh.x'), ok('abcdefghi.x'), ok('ab.'), ok('ab.X'), ok('ab.x_9'), ok('a1.x')]).toEqual([false, true, true, false, false, false, true, false]);
  });
});

describe('AC-02-09-WRAPPERS (E-70 (2))', () => {
  it('E-73: exactly 1 notifyMoney call on success, 0 on a fault', () => {
    const p = new MoneyProvenance(); setActiveProvenance(p);
    const spy = vi.spyOn(MoneyProvenance.prototype, 'note');
    const calls: [() => unknown, boolean][] = [[() => provenanceWrappers.toMoney(1, 'FDL'), true], [() => provenanceWrappers.toMoney(NaN, 'FDL'), false],
      [() => provenanceWrappers.toQty(2, 1n), true], [() => provenanceWrappers.toQty(Infinity, 1n), false], [() => provenanceWrappers.toPrice(3), true], [() => provenanceWrappers.toPrice(NaN), false]];
    calls.push([() => provenanceWrappers.toQty(2, 0n), false], [() => provenanceWrappers.toQty(2, (1n << 31n) + 1n), false],
      [() => provenanceWrappers.toMoney(1, 'XXX' as Ccy), false], [() => provenanceWrappers.toQty(1e308, 1n << 31n), false]);
    for (const [f, okCall] of calls) { spy.mockClear(); if (okCall) f(); else expect(f).toThrow(EngineFault); expect(spy).toHaveBeenCalledTimes(okCall ? 1 : 0); }
    spy.mockRestore(); setActiveProvenance(null);
  });
  const cases = (): number[] => { const r = lcg(7), xs = [0, -0, 0.5, 1.25, -2.5, 1e12, 123.456789, 1e-9]; for (let i = 0; i < 2000; i++) xs.push((r() - 0.5) * 10 ** Math.floor(r() * 14)); return xs; };
  it('the list is exactly toMoney, toQty, toPrice', () => { expect(Object.keys(provenanceWrappers).sort()).toEqual(['toMoney', 'toPrice', 'toQty']); });
  it('property: each wrapper returns exactly what its base constructor returns, including faults', () => {
    const same = (a: () => unknown, b: () => unknown): void => {
      let ra: unknown, rb: unknown, ea: unknown, eb: unknown;
      try { ra = a(); } catch (e) { ea = e; } try { rb = b(); } catch (e) { eb = e; }
      expect(rb).toBe(ra); expect((eb as EngineFault | undefined)?.code).toBe((ea as EngineFault | undefined)?.code); expect(eb === undefined).toBe(ea === undefined);
    };
    for (const x of [...cases(), NaN, Infinity, 1e300]) {
      for (const c of ['FDL', 'EUN', 'PYN'] as Ccy[]) same(() => toMoney(x, c), () => provenanceWrappers.toMoney(x, c));
      for (const l of [1n, 100n]) for (const m of ['HALF_EVEN', 'LOT_FLOOR'] as const) same(() => toQty(x, l, m), () => provenanceWrappers.toQty(x, l, m));
      same(() => toQty(x, 10n), () => provenanceWrappers.toQty(x, 10n));
      same(() => toPrice(x), () => provenanceWrappers.toPrice(x));
    }
  });
  it('spy: notifyMoney is called exactly once per call with the returned value; nothing is recorded with no active log', () => {
    const p = new MoneyProvenance(); setActiveProvenance(p); p.begin();
    const m = provenanceWrappers.toMoney(1.25, 'FDL'), q = provenanceWrappers.toQty(3.5, 1n), pr = provenanceWrappers.toPrice(2.5);
    expect(p.rows()).toEqual([{ v: m, source: 'toMoney' }, { v: q, source: 'toQty' }, { v: pr, source: 'toPrice' }]);
    expect(p.has(m) && !p.has(-1n)).toBe(true);
    const spy = vi.spyOn(MoneyProvenance.prototype, 'note');
    for (let i = 0; i < 5; i++) { provenanceWrappers.toMoney(i, 'FDL'); provenanceWrappers.toQty(i, 1n); provenanceWrappers.toPrice(i); }
    expect(spy).toHaveBeenCalledTimes(15);
    expect(spy.mock.calls.map((c) => c[1])).toEqual(Array.from({ length: 5 }, () => ['toMoney', 'toQty', 'toPrice']).flat());
    setActiveProvenance(null); spy.mockClear(); provenanceWrappers.toPrice(1); expect(spy).not.toHaveBeenCalled();
    expect(prov.notifyMoney(7n, 'x')).toBe(7n);
    spy.mockRestore();
  });
});

describe('AC-02-09-PORT-MIGRATED (E-70/E-71): no invariant-port imports; INV-ENG-002 and INV-ENG-003 are on the T20A-01 types', () => {
  it('no module under packages/engine imports invariant-port, and the file is gone', () => {
    const root = join(__dirname, '..', '..'), hits: string[] = [];
    const walk = (d: string): void => { for (const n of readdirSync(d)) { if (n === 'node_modules') continue; const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx|mts|js)$/.test(n) && /from\s+['"][^'"]*invariant-port['"]/.test(readFileSync(p, 'utf8'))) hits.push(p); } };
    walk(root);
    expect(hits).toEqual([]);
    expect(() => statSync(join(__dirname, '..', 'invariant-port.ts'))).toThrow();
    for (const d of [INV_ENG_002.def, INV_ENG_003.def]) expect(d).toMatchObject({ module: '02', scope: 'TICK', severity: 'FATAL', sampling: 'NEVER', sinceEngineVersion: '1.0.0' });
  });
});

const sortVi = <T extends { partitionId: string }>(xs: T[]): T[] => [...xs].sort((a, b) => (a.partitionId < b.partitionId ? -1 : a.partitionId > b.partitionId ? 1 : 0));
const none: TruthStoreRead = { get: () => undefined, iter: () => [], count: () => 0 };
const ctxBase: InvariantCtx = { tick: 1, phase: 'P13', scope: 'TICK', partitionId: 'p1', safeMode: false, pre: none, post: none, writeSet: [], postings: [], events: [], facts: { get: () => undefined }, num: () => 0 };
