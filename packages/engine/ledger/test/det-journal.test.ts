// #57 survivor (QA): SortedMap.delete must mark the key dirty (E-84 store-layer dirty set). The ledger relies on it when an account
// leaves the live map (dormant move, world.ts) and when the staging rollback deletes a key that was absent before the tick.
import { describe, expect, it } from 'vitest';
import { SortedMap } from '../src/det';

describe('E-84 dirty set: SortedMap.delete marks the entry dirty', () => {
  it('a delete after resetWrites() records the key with its value before the delete', () => {
    const m = new SortedMap<string, number>([['a', 1], ['b', 2]]);
    m.trackWrites();
    expect(m.delete('b')).toBe(true);
    expect([m.writeCount, m.writes()]).toEqual([1, [['b', 2]]]);
    expect(m.has('b')).toBe(false);
  });
  it('set then delete keeps the first pre-write value; deleting an absent key is still a write (pre-value undefined)', () => {
    const m = new SortedMap<string, number>([['a', 1]]);
    m.trackWrites();
    m.set('a', 5); m.delete('a');
    expect(m.delete('z')).toBe(false);
    expect(m.writes()).toEqual([['a', 1], ['z', undefined]]);
  });
  it('resetWrites() empties the set and a later delete is recorded again; tracking off records nothing', () => {
    const m = new SortedMap<string, number>([['a', 1], ['b', 2]]);
    m.delete('a');
    expect(m.writeCount).toBe(0);
    m.trackWrites(); m.set('b', 3); m.resetWrites();
    m.delete('b');
    expect(m.writes()).toEqual([['b', 3]]);
  });
});
