// Full world snapshot. Floats and typed arrays live in world.bin so a reload is bit-exact.
// JSON keeps the shape: maps in insertion order, people as people, shock defs by id.
import fs from 'node:fs';
import path from 'node:path';
import { EventLog } from '../../kernel/events.ts';
import { Ledger } from '../../kernel/ledger.ts';
import type { World } from '../../kernel/index.ts';
import { SHOCKS } from '../economy/content.ts';
import { People, setEffScaled, setFirmScale, setSimDay } from '../economy/people.ts';
import { dumpRng, restoreRng } from './rngbox.ts';

const MAGIC = 0x314c5641;
const SKIP = Symbol('skip');

const TARRAY: Record<string, { ctor: new (n: number) => ArrayBufferView; bytes: number }> = {
  Float64Array: { ctor: Float64Array, bytes: 8 },
  Float32Array: { ctor: Float32Array, bytes: 4 },
  Int32Array: { ctor: Int32Array, bytes: 4 },
  Int16Array: { ctor: Int16Array, bytes: 2 },
  Int8Array: { ctor: Int8Array, bytes: 1 },
  Uint32Array: { ctor: Uint32Array, bytes: 4 },
  Uint16Array: { ctor: Uint16Array, bytes: 2 },
  Uint8Array: { ctor: Uint8Array, bytes: 1 },
  Uint8ClampedArray: { ctor: Uint8ClampedArray, bytes: 1 },
};

interface Tag { $: string; t?: string; o: number; n?: number; i?: number }

class Saver {
  chunks: Buffer[] = [];
  size = 0;
  floats: number[] = [];
  tags: Tag[] = [];
  stack = new WeakSet<object>();

  pad(): void {
    const p = (8 - (this.size % 8)) % 8;
    if (p) { this.chunks.push(Buffer.alloc(p)); this.size += p; }
  }
  blob(view: ArrayBufferView): number {
    this.pad();
    const o = this.size;
    const raw = Buffer.from(view.buffer, view.byteOffset, view.byteLength);
    this.chunks.push(Buffer.from(raw));
    this.size += raw.length;
    return o;
  }
  num(n: number): number | { $: string; v?: string; i?: number } {
    if (Object.is(n, -0)) return { $: 'num', v: '-0' };
    if (n !== n) return { $: 'num', v: 'NaN' };
    if (n === Infinity) return { $: 'num', v: 'Infinity' };
    if (n === -Infinity) return { $: 'num', v: '-Infinity' };
    if (Number.isSafeInteger(n)) return n;
    const i = this.floats.length;
    this.floats.push(n);
    const tag: Tag = { $: 'f', o: 0, i };
    return tag;
  }
  enc(v: unknown): unknown {
    if (v === null || v === undefined) return v;
    const t = typeof v;
    if (t === 'number') return this.num(v as number);
    if (t === 'string' || t === 'boolean') return v;
    if (t === 'function') return SKIP;
    if (t !== 'object') throw new Error(`cannot save ${t}`);
    const o = v as object;
    if (this.stack.has(o)) throw new Error('save: shared or cyclic object');
    this.stack.add(o);
    try {
      if (ArrayBuffer.isView(o) && !(o instanceof DataView)) {
        const name = o.constructor.name;
        const spec = TARRAY[name];
        if (!spec) throw new Error(`cannot save ${name}`);
        const tag: Tag = { $: 'ta', t: name, o: this.blob(o as ArrayBufferView), n: (o as { length: number }).length };
        this.tags.push(tag);
        return tag;
      }
      if (o instanceof People) return this.mark('people', o as unknown as Record<string, unknown>);
      if (o instanceof Ledger) return this.mark('ledger', o as unknown as Record<string, unknown>);
      if (o instanceof EventLog) return this.mark('events', o as unknown as Record<string, unknown>);
      if (SHOCKS.includes(o as (typeof SHOCKS)[number])) return { $: 'shock', id: (o as { id: string }).id };
      if (o instanceof Map) return this.map(o);
      if (o instanceof Set) return { $: 'set', e: [...o].map((x) => this.enc(x)) };
      if (Array.isArray(o)) return o.map((x) => this.enc(x));
      return this.plain(o as Record<string, unknown>);
    } finally { this.stack.delete(o); }
  }
  mark(kind: string, o: Record<string, unknown>): Record<string, unknown> {
    const out = this.plain(o);
    out.$ = kind;
    return out;
  }
  plain(o: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) {
      if (k === '$') throw new Error('save: object already has $');
      const ev = this.enc(o[k]);
      if (ev !== SKIP && ev !== undefined) out[k] = ev;
    }
    return out;
  }
  map(m: Map<unknown, unknown>): unknown {
    if (m.size === 0) return { $: 'map', e: [] };
    let numK = true, strK = true, numV = true;
    for (const [k, v] of m) {
      if (typeof v !== 'number') numV = false;
      if (typeof k !== 'number' || !Number.isSafeInteger(k) || k < -2147483648 || k > 2147483647) numK = false;
      if (typeof k !== 'string') strK = false;
    }
    if (numV && numK) {
      const k = new Int32Array(m.size), val = new Float64Array(m.size);
      let i = 0;
      for (const [key, v] of m) { k[i] = key as number; val[i] = v as number; i++; }
      return { $: 'nmap', k: this.enc(k), v: this.enc(val) };
    }
    if (numV && strK) {
      const k: string[] = [];
      const val = new Float64Array(m.size);
      let i = 0;
      for (const [key, v] of m) { k.push(key as string); val[i] = v as number; i++; }
      return { $: 'smap', k, v: this.enc(val) };
    }
    const e: unknown[] = [];
    for (const [k, v] of m) e.push([this.enc(k), this.enc(v)]);
    return { $: 'map', e };
  }
  pack(json: unknown): { text: string; bin: Buffer } {
    const header = 8 + this.floats.length * 8;
    for (const tag of this.tags) tag.o += header;
    const body = this.chunks.length ? Buffer.concat(this.chunks) : Buffer.alloc(0);
    const bin = Buffer.alloc(header + body.length);
    bin.writeUInt32LE(MAGIC, 0);
    bin.writeUInt32LE(this.floats.length, 4);
    for (let i = 0; i < this.floats.length; i++) bin.writeDoubleLE(this.floats[i], 8 + i * 8);
    body.copy(bin, header);
    return { text: JSON.stringify(json), bin };
  }
}

function decode(v: unknown, bin: Buffer, floats: Float64Array): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => decode(x, bin, floats));
  const o = v as Record<string, unknown>;
  if (o.$ === 'num') {
    if (o.v === '-0') return -0;
    if (o.v === 'NaN') return NaN;
    if (o.v === 'Infinity') return Infinity;
    if (o.v === '-Infinity') return -Infinity;
    throw new Error(`bad number ${String(o.v)}`);
  }
  if (o.$ === 'f') return floats[o.i as number];
  if (o.$ === 'ta') {
    const spec = TARRAY[o.t as string];
    if (!spec) throw new Error(`bad array ${String(o.t)}`);
    const n = o.n as number;
    const arr = new spec.ctor(n);
    if (n) Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).set(bin.subarray(o.o as number, (o.o as number) + n * spec.bytes));
    return arr;
  }
  if (o.$ === 'nmap') {
    const k = decode(o.k, bin, floats) as Int32Array;
    const val = decode(o.v, bin, floats) as Float64Array;
    const m = new Map<number, number>();
    for (let i = 0; i < k.length; i++) m.set(k[i], val[i]);
    return m;
  }
  if (o.$ === 'smap') {
    const k = o.k as string[];
    const val = decode(o.v, bin, floats) as Float64Array;
    const m = new Map<string, number>();
    for (let i = 0; i < k.length; i++) m.set(k[i], val[i]);
    return m;
  }
  if (o.$ === 'map') {
    const m = new Map<unknown, unknown>();
    for (const pair of o.e as unknown[]) {
      const [k, val] = pair as [unknown, unknown];
      m.set(decode(k, bin, floats), decode(val, bin, floats));
    }
    return m;
  }
  if (o.$ === 'set') {
    const s = new Set<unknown>();
    for (const e of o.e as unknown[]) s.add(decode(e, bin, floats));
    return s;
  }
  if (o.$ === 'shock') {
    const id = o.id as string;
    const def = SHOCKS.find((s) => s.id === id);
    if (!def) throw new Error(`unknown shock ${id}`);
    return def;
  }
  let proto: object | null = null;
  if (o.$ === 'people') proto = People.prototype;
  else if (o.$ === 'ledger') proto = Ledger.prototype;
  else if (o.$ === 'events') proto = EventLog.prototype;
  const out: Record<string, unknown> = proto ? Object.create(proto) : {};
  for (const k of Object.keys(o)) if (k !== '$') out[k] = decode(o[k], bin, floats);
  return out;
}

function loadBin(bin: Buffer): Float64Array {
  if (bin.length < 8 || bin.readUInt32LE(0) !== MAGIC) throw new Error('world.bin is not a world snapshot');
  const n = bin.readUInt32LE(4);
  const floats = new Float64Array(n);
  for (let i = 0; i < n; i++) floats[i] = bin.readDoubleLE(8 + i * 8);
  return floats;
}

/** The price closure has to close over the restored book, not the one init threw away. */
function rebindMarkets(w: World): void {
  const state = w.state.markets as { stocks: { instr: string; last: number }[]; price: (instr: string) => number } | undefined;
  if (!state) return;
  let pricing = false;
  let byInstr: Map<string, { last: number }> | null = null;
  state.price = (instr: string): number => {
    if (!byInstr || byInstr.size !== state.stocks.length) byInstr = new Map(state.stocks.map((x) => [x.instr, x]));
    const hit = byInstr.get(instr);
    if (hit) return hit.last;
    if (!instr.startsWith('eq:fund_') || pricing) return 0;
    const issued = w.ledger.issued.get(instr) ?? 0;
    if (issued <= 0) return 0;
    pricing = true;
    let nw = 0;
    try { nw = w.ledger.netWorth(instr.slice(3), state.price); }
    finally { pricing = false; }
    return Math.max(0, Math.round(nw / issued));
  };
}

export function snapshotSeed(dir: string): string {
  const fd = fs.openSync(path.join(dir, 'world.json'), 'r');
  const buf = Buffer.alloc(256);
  const n = fs.readSync(fd, buf, 0, 256, 0);
  fs.closeSync(fd);
  const m = buf.toString('utf8', 0, n).match(/"seed":"([^"]*)"/);
  if (!m) throw new Error(`${dir} has no seed`);
  return m[1];
}

export function writeSnapshot(dir: string, w: World): void {
  const saver = new Saver();
  const json = {
    v: 1,
    seed: w.seed,
    day: w.day,
    ticksPerDay: w.ticksPerDay,
    genesis: w.genesis,
    rng: saver.enc(dumpRng(w)),
    ledger: saver.enc(w.ledger),
    events: saver.enc(w.events),
    state: saver.enc(w.state),
  };
  const packed = saver.pack(json);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'world.json'), packed.text);
  fs.writeFileSync(path.join(dir, 'world.bin'), packed.bin);
}

export function applySnapshot(w: World, dir: string): void {
  const lend = (w.state.banking as { lendFirm?: unknown } | undefined)?.lendFirm;
  const api = (w.state.bonds as { api?: unknown } | undefined)?.api;
  const text = fs.readFileSync(path.join(dir, 'world.json'), 'utf8');
  const bin = fs.readFileSync(path.join(dir, 'world.bin'));
  const data = decode(JSON.parse(text), bin, loadBin(bin)) as {
    seed: string; day: number; ticksPerDay: number; genesis: number;
    rng: Record<string, number[]>; ledger: Ledger; events: EventLog; state: Record<string, unknown>;
  };
  if (data.seed !== w.seed) throw new Error(`snapshot seed ${data.seed} does not match world ${w.seed}`);
  w.day = data.day;
  w.ticksPerDay = data.ticksPerDay;
  w.genesis = data.genesis;
  w.ledger = data.ledger;
  w.events = data.events;
  w.state = data.state;
  const banking = w.state.banking as { lendFirm?: unknown } | undefined;
  const bonds = w.state.bonds as { api?: unknown } | undefined;
  if (banking && lend) banking.lendFirm = lend;
  if (bonds && api) bonds.api = api;
  rebindMarkets(w);
  restoreRng(w, data.rng);
  resyncScales(w);
}

/** Morale scales live beside the people arrays, and the next morning multiplies wages by them. */
function resyncScales(w: World): void {
  setSimDay(w.day);
  setEffScaled(false);
  const s = w.state.economy as { firms?: { idx: number; staff: number[] }[]; P?: { mood: Uint8Array } } | undefined;
  if (!s?.firms || !s.P || !w.state.psyche) return;
  for (const f of s.firms) {
    let sum = 0;
    for (let i = 0; i < f.staff.length; i++) sum += s.P.mood[f.staff[i]];
    const avg = f.staff.length ? sum / f.staff.length : 67;
    setFirmScale(f.idx, 0.96 + 0.09 * (avg / 100));
  }
}
