import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cmpEntityCanonical, cmpKey, cmpStr, EngineFault, sortBy } from './index';

describe('cmpStr / sortBy (T02-01)', () => {
  it('cmpStr is UTF-16 code-unit order', () => {
    expect(cmpStr('B', 'a')).toBe(-1);
    expect(cmpStr('é', 'f')).toBe(1);
    expect(cmpStr('a', 'a')).toBe(0);
  });
  it('sortBy is stable with duplicate keys', () => {
    const xs = [{ k: 'b', i: 0 }, { k: 'a', i: 1 }, { k: 'b', i: 2 }, { k: 'a', i: 3 }];
    expect(sortBy(xs, (x) => [x.k]).map((x) => x.i)).toEqual([1, 3, 0, 2]);
  });
  it('mixed key types and NaN are EngineFault I0.sort_key', () => {
    expect(() => cmpKey(['a'], [1])).toThrow(EngineFault);
    expect(() => sortBy([1, NaN], (x) => [x])).toThrow(/NaN/);
  });
  it('property: sortBy of a permutation of unique keys equals sortBy of the original; idempotent', () => {
    fc.assert(fc.property(fc.uniqueArray(fc.string()), fc.integer(), (xs, seed) => {
      const perm = sortBy(xs.map((x, i) => ({ x, r: (i * 7919 + seed) % 1009 })), (o) => [o.r, o.x]).map((o) => o.x);
      const a = sortBy(xs, (x) => [x]); const b = sortBy(perm, (x) => [x]);
      expect(b).toEqual(a);
      expect(sortBy(a, (x) => [x])).toEqual(a);
    }));
  });
  it('cmpEntityCanonical: by KIND_TAG_ORDER, then cmpStr', () => {
    expect(cmpEntityCanonical('sys_x', 'chr_a')).toBe(-1);
    expect(cmpEntityCanonical('chr_a', 'chr_b')).toBe(-1);
    expect(cmpEntityCanonical('zzz_a', 'chr_a')).toBe(1);
  });
});
