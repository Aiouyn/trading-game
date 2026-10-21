// TODO(unit-02): minimal local stand-ins for the unit-02 determinism kit (SortedMap, cmpStr, canonEncode, hash). ctx.newId is the per-world counter in world.ts).
// Replace with the @tycoon/core exports when unit 02 lands. This is the only file allowed to use Map (lint override).

/** Byte-order string comparison (G8: never localeCompare). UTF-16 code-unit order equals byte order for ASCII ids. */
export function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Map whose iteration order is the byte order of its keys, independent of insertion order. */
export class SortedMap<K extends string, V> {
  private readonly m = new Map<K, V>();
  private sorted: K[] | null = null;
  /** Incremented on every write; lets the ledger detect writes to committed state (INV-LED-009). */
  version = 0;
  constructor(entries?: Iterable<readonly [K, V]>) {
    if (entries) for (const [k, v] of entries) this.m.set(k, v);
  }
  get size(): number { return this.m.size; }
  get(k: K): V | undefined { return this.m.get(k); }
  has(k: K): boolean { return this.m.has(k); }
  set(k: K, v: V): this { if (!this.m.has(k)) this.sorted = null; this.m.set(k, v); this.version++; return this; }
  delete(k: K): boolean { this.sorted = null; this.version++; return this.m.delete(k); }
  keys(): K[] { return [...(this.sorted ??= [...this.m.keys()].sort(cmpStr))]; }
  entries(): [K, V][] { return this.keys().map((k) => [k, this.m.get(k) as V]); }
  values(): V[] { return this.keys().map((k) => this.m.get(k) as V); }
  [Symbol.iterator](): IterableIterator<[K, V]> { return this.entries()[Symbol.iterator](); }
  clone(): SortedMap<K, V> { return new SortedMap(this.entries()); }
}

/** Deterministic encoding: object keys sorted, bigint tagged, NaN/Infinity rejected (G8). Never JSON.stringify. */
export function canonEncode(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  switch (typeof v) {
    case 'bigint': return `${v}n`;
    case 'number':
      if (!Number.isFinite(v)) throw new Error('canonEncode: non-finite number');
      return String(v);
    case 'boolean': return v ? 'true' : 'false';
    case 'string': return quote(v);
    case 'object': {
      if (v instanceof SortedMap) return `M{${v.entries().map(([k, x]) => `${quote(k)}:${canonEncode(x)}`).join(',')}}`;
      if (Array.isArray(v)) return `[${v.map(canonEncode).join(',')}]`;
      const o = v as Record<string, unknown>;
      const ks = Object.keys(o).filter((k) => o[k] !== undefined).sort(cmpStr);
      return `{${ks.map((k) => `${quote(k)}:${canonEncode(o[k])}`).join(',')}}`;
    }
    default: throw new Error(`canonEncode: unsupported ${typeof v}`);
  }
}
function quote(s: string): string {
  let r = '"';
  for (const ch of s) r += ch === '"' || ch === '\\' ? `\\${ch}` : ch;
  return `${r}"`;
}

/** FNV-1a 64-bit over UTF-16 code units, hex. TODO(unit-02): replace with the unit-02 sha256 of canonEncode. */
export function hashHex(s: string): string {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < s.length; i++) h = ((h ^ BigInt(s.charCodeAt(i))) * 0x100000001b3n) & 0xffffffffffffffffn;
  return h.toString(16).padStart(16, '0');
}
