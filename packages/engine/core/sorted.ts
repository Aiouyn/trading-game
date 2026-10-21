import { cmpStr } from './order';
import { EngineFault } from './types';

function lowerBound(keys: readonly string[], k: string): number {
  let lo = 0, hi = keys.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (cmpStr(keys[mid]!, k) < 0) lo = mid + 1; else hi = mid; }
  return lo;
}

/** Ordered map over string keys (ascending cmpStr). Iterators throw if the map is mutated while they run. */
export class SortedMap<K extends string, V> {
  private ks: K[] = []; private vs: V[] = []; private ver = 0;
  constructor(entries?: Iterable<readonly [K, V]>) { if (entries) for (const [k, v] of entries) this.set(k, v); }
  get size(): number { return this.ks.length; }
  private at(k: K): number { const i = lowerBound(this.ks, k); return i < this.ks.length && this.ks[i] === k ? i : -1; }
  get(k: K): V | undefined { const i = this.at(k); return i < 0 ? undefined : this.vs[i]; }
  has(k: K): boolean { return this.at(k) >= 0; }
  set(k: K, v: V): SortedMap<K, V> {
    const i = lowerBound(this.ks, k);
    if (i < this.ks.length && this.ks[i] === k) { this.vs[i] = v; return this; }
    this.ks.splice(i, 0, k); this.vs.splice(i, 0, v); this.ver++; return this;
  }
  delete(k: K): boolean { const i = this.at(k); if (i < 0) return false; this.ks.splice(i, 1); this.vs.splice(i, 1); this.ver++; return true; }
  private *walk(from: number, to: number): IterableIterator<[K, V]> {
    const v0 = this.ver;
    for (let i = from; i < to; i++) {
      if (this.ver !== v0) throw new EngineFault('I0.sorted_mutation', 'SortedMap mutated during iteration');
      yield [this.ks[i]!, this.vs[i]!];
    }
    if (this.ver !== v0) throw new EngineFault('I0.sorted_mutation', 'SortedMap mutated during iteration');
  }
  entries(): IterableIterator<[K, V]> { return this.walk(0, this.ks.length); }
  *keys(): IterableIterator<K> { for (const [k] of this.entries()) yield k; }
  *values(): IterableIterator<V> { for (const [, v] of this.entries()) yield v; }
  range(fromInclusive: K, toExclusive: K): IterableIterator<[K, V]> {
    const a = lowerBound(this.ks, fromInclusive), b = lowerBound(this.ks, toExclusive);
    return this.walk(a, b < a ? a : b);
  }
  first(): [K, V] | undefined { return this.ks.length ? [this.ks[0]!, this.vs[0]!] : undefined; }
  last(): [K, V] | undefined { const n = this.ks.length; return n ? [this.ks[n - 1]!, this.vs[n - 1]!] : undefined; }
  clone(): SortedMap<K, V> { const m = new SortedMap<K, V>(); m.ks = this.ks.slice(); m.vs = this.vs.slice(); return m; }
  [Symbol.iterator](): IterableIterator<[K, V]> { return this.entries(); }
}

export class SortedSet<K extends string> {
  private m = new SortedMap<K, true>();
  constructor(items?: Iterable<K>) { if (items) for (const k of items) this.m.set(k, true); }
  get size(): number { return this.m.size; }
  add(k: K): SortedSet<K> { this.m.set(k, true); return this; }
  delete(k: K): boolean { return this.m.delete(k); }
  has(k: K): boolean { return this.m.has(k); }
  values(): IterableIterator<K> { return this.m.keys(); }
  [Symbol.iterator](): IterableIterator<K> { return this.m.keys(); }
  clone(): SortedSet<K> { const s = new SortedSet<K>(); s.m = this.m.clone(); return s; }
}
