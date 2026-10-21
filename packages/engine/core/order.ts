import { EngineFault } from './types';

/** UTF-16 code-unit order (JS string `<`). Never localeCompare. */
export function cmpStr(a: string, b: string): -1 | 0 | 1 { return a < b ? -1 : a > b ? 1 : 0; }

export type SortKeyPart = string | number | bigint;

export function cmpKey(a: readonly SortKeyPart[], b: readonly SortKeyPart[]): -1 | 0 | 1 {
  const n = a.length < b.length ? a.length : b.length;
  for (let i = 0; i < n; i++) {
    const x = a[i]!, y = b[i]!;
    if (typeof x !== typeof y) throw new EngineFault('I0.sort_key', `mixed sort key types at position ${i}`);
    if (typeof x === 'number' && (x !== x || (y as number) !== (y as number))) throw new EngineFault('I0.sort_key', `NaN in sort key at position ${i}`);
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return a.length < b.length ? -1 : a.length > b.length ? 1 : 0;
}

/** Stable, total sort; returns a new array. */
export function sortBy<T>(arr: readonly T[], key: (t: T) => SortKeyPart[]): T[] {
  const dec = arr.map((v, i) => ({ v, i, k: key(v) }));
  dec.sort((p, q) => cmpKey(p.k, q.k) || (p.i - q.i));
  return dec.map((d) => d.v);
}
