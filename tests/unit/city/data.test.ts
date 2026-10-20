import { describe, expect, it } from 'vitest';
import { CityStore, renderInputHash } from '@/city/data/store';
import { tableRows } from '@/city/table/rows';
import { generateCity } from '../../e2e/city/fixtures/generate-city';

describe('C-08 setData', () => {
  it('is idempotent by stateVersion', () => {
    const { snapshot } = generateCity();
    const s = new CityStore();
    expect(s.apply(snapshot).status).toBe('applied');
    expect(s.apply(snapshot).status).toBe('same');
    expect(s.apply({ ...snapshot, stateVersion: 0 }).status).toBe('stale');
  });
  it('a delta with an unknown base asks for a snapshot; a known base applies', () => {
    const { snapshot } = generateCity();
    const s = new CityStore();
    s.apply(snapshot);
    expect(s.apply({ type: 'delta', cityId: snapshot.cityId, baseVersion: 7, stateVersion: 9, lagTicks: 0 }).status).toBe('needs-snapshot');
    const r = s.apply({ type: 'delta', cityId: snapshot.cityId, baseVersion: 1, stateVersion: 2, lagTicks: 3, remove: ['e0'] });
    expect(r.status).toBe('applied');
    expect(s.snapshot!.entities.some((e) => e.id === 'e0')).toBe(false);
    expect(s.snapshot!.lagTicks).toBe(3);
  });
});

describe('C-14 privacy (17-AT-21)', () => {
  it('identical public records with different private trades → identical render input and table rows', () => {
    const a = generateCity().snapshot;
    // World B: same public records, plus private trade data on the wire that must never be rendered.
    const b = JSON.parse(JSON.stringify(a));
    b.entities.forEach((e: Record<string, unknown>, i: number) => {
      e.ownerId = `player-${i % 7}`;
      e.privateTrades = [{ qty: i, price: 10 + i }];
    });
    b.me = { cash: 123 };
    const sa = new CityStore(), sb = new CityStore();
    sa.apply(a);
    sb.apply(b);
    expect(renderInputHash(sb.snapshot!)).toBe(renderInputHash(sa.snapshot!));
    expect(JSON.stringify(sb.snapshot)).not.toContain('privateTrades');
    const noMine = new Set<string>();
    expect(tableRows(sb.snapshot!, noMine)).toEqual(tableRows(sa.snapshot!, noMine));
    // Only the client-only my-places column may differ.
    const mine = new Set(['e5']);
    const ra = tableRows(sa.snapshot!, noMine), rb = tableRows(sb.snapshot!, mine);
    const diff = rb.filter((r, i) => JSON.stringify(r) !== JSON.stringify(ra[i]));
    expect(diff.map((r) => [r.entityId, r.mine])).toEqual([['e5', true]]);
  });
});
