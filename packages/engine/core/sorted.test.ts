import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cmpStr, SortedMap, SortedSet } from './index';

describe('SortedMap / SortedSet (T02-01)', () => {
  it('property: random set/delete sequences match a reference model sorted by cmpStr', () => {
    const op = fc.record({ del: fc.boolean(), k: fc.string({ maxLength: 3 }), v: fc.integer() });
    fc.assert(fc.property(fc.array(op, { maxLength: 200 }), (ops) => {
      const m = new SortedMap<string, number>(); const ref: Record<string, number> = Object.create(null);
      for (const o of ops) if (o.del) { m.delete(o.k); delete ref[o.k]; } else { m.set(o.k, o.v); ref[o.k] = o.v; }
      const want = Object.keys(ref).sort(cmpStr).map((k) => [k, ref[k]]);
      expect([...m.entries()]).toEqual(want);
      expect(m.size).toBe(want.length);
    }));
  });
  it('range() is [from, to); first/last; clone is independent', () => {
    const m = new SortedMap<string, number>([['c', 3], ['a', 1], ['b', 2], ['d', 4]]);
    expect([...m.range('b', 'd')]).toEqual([['b', 2], ['c', 3]]);
    expect([...m.range('d', 'b')]).toEqual([]);
    expect(m.first()).toEqual(['a', 1]); expect(m.last()).toEqual(['d', 4]);
    const c = m.clone(); c.delete('a'); expect(m.has('a')).toBe(true);
    expect(m.set('e', 5)).toBe(m);
  });
  it('QA M06: the guard fires on the very next step after a mutation, mid-walk and at the end', () => {
    const m = new SortedMap<string, number>([['a', 1], ['b', 2], ['c', 3]]);
    const it1 = m.entries(); expect(it1.next().value).toEqual(['a', 1]); m.set('aa', 0);
    expect(() => it1.next()).toThrow(/mutated during iteration/);
    const one = new SortedMap<string, number>([['a', 1]]); const it2 = one.entries(); it2.next(); one.delete('a');
    expect(() => it2.next()).toThrow(/mutated during iteration/);
    const r = m.range('a', 'z'); r.next(); m.delete('c'); expect(() => r.next()).toThrow(/mutated/);
  });
  it('mutation during iteration throws', () => {
    const m = new SortedMap<string, number>([['a', 1], ['b', 2]]);
    expect(() => { for (const [k] of m) m.set(`${k}x`, 0); }).toThrow(/mutated during iteration/);
    const s = new SortedSet(['b', 'a']);
    expect([...s]).toEqual(['a', 'b']);
    expect(() => { for (const k of s) s.delete(k); }).toThrow(/mutated/);
  });
});
