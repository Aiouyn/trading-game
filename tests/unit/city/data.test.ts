import { describe, expect, it } from 'vitest';
import { CityStore, applyDelta, publicSnapshot, renderInputHash } from '@/city/data/store';
import { canonicalBytes, canonicalJson } from '@/city/data/canonical';
import { tableRows } from '@/city/table/rows';
import type { CityDelta, CityManifest, CitySnapshot } from '@/city/data/types';
import { buildWorld, diff, generateCity, publish, sha256, worldV2 } from '../../e2e/city/fixtures/generate-city';

const delta = (base: number, v: number, extra: Partial<CityDelta> = {}): CityDelta => {
  const s = generateCity().snapshot;
  return { schemaVersion: 1, cityId: s.cityId, baseVersion: base, stateVersion: v, publicSnapshotTick: 99, ccy: s.ccy, ground: s.ground, districts: [], entities: [], chunks: [], ...extra };
};

describe('C-08 setData', () => {
  it('is idempotent by stateVersion', () => {
    const { snapshot } = generateCity();
    const s = new CityStore();
    expect(s.apply(snapshot).status).toBe('applied');
    expect(s.apply(snapshot).status).toBe('same');
    expect(s.apply({ ...snapshot, stateVersion: 0 }).status).toBe('stale');
  });
  it('a delta with an unknown base asks for a snapshot; a known base applies (tombstones remove)', () => {
    const { snapshot } = generateCity();
    const s = new CityStore();
    s.apply(snapshot);
    expect(s.apply(delta(7, 9)).status).toBe('needs-snapshot');
    const gone = snapshot.entities[0].id;
    const r = s.apply(delta(1, 2, { entities: [{ id: gone, removed: true }] }));
    expect(r.status).toBe('applied');
    expect(s.snapshot!.entities.some((e) => e.id === gone)).toBe(false);
    expect(s.snapshot!.publicSnapshotTick).toBe(99);
  });
});

describe('Wire formats (Systems rulings)', () => {
  it('apply(snapshot(v1), delta(v1→v2)) reproduces snapshot(v2) byte for byte (SR Q4)', () => {
    const w1 = buildWorld();
    const a = publish(w1, 1, 100).snapshot;
    const b = publish(worldV2(w1), 2, 200).snapshot;
    const d = diff(a, b);
    expect(d.entities.length).toBeGreaterThan(0);
    expect(sha256(canonicalBytes(applyDelta(a, d)))).toBe(sha256(canonicalBytes(b)));
    // and through the client store
    const st = new CityStore();
    st.apply(JSON.parse(new TextDecoder().decode(canonicalBytes(a))) as CitySnapshot);
    st.apply(JSON.parse(new TextDecoder().decode(canonicalBytes(d))) as CityDelta);
    expect(canonicalJson(st.snapshot)).toBe(canonicalJson(b));
  });
  it('the manifest is the only file not addressed by its content hash (SR Q1, Q2)', () => {
    const { files, manifests } = generateCity();
    for (const [url, bytes] of files) expect(url).toMatch(new RegExp(`/h/${sha256(bytes)}\\.(json|bin)$`));
    const m = manifests.get(2) as CityManifest;
    expect(m.deltas.map((d) => d.base)).toEqual([1]);
    for (const c of m.chunks) expect(c.chunkKey).toMatch(/^-?\d+_-?\d+$/);
  });
  it('money is a decimal string; no float outside 1e-4 ratios; no city-wide return, brief or lag field', () => {
    const { snapshot } = generateCity();
    const text = canonicalJson(snapshot); // throws on any float finer than 1e-4
    for (const d of snapshot.districts) for (const u of Object.values(d.byUse)) expect(u!.rentPerM2PerGD).toMatch(/^\d+\.\d{2}$/);
    expect(snapshot.ccy).toBe('FDL');
    expect(text).not.toMatch(/"(dayReturn|brief|lagTicks|development)"/);
  });
  it('fixtures use 22 ids and names (8 Port Avalon districts, no West Bank)', () => {
    const { snapshot } = generateCity();
    expect(snapshot.districts.map((d) => d.id).sort()).toEqual(
      ['eastside_docks', 'financial_mile', 'glasshill', 'industrial_basin', 'midtown', 'old_harbor', 'riverside_lofts', 'summit_estates_on_gilt_hill'].map((x) => `dist_port_avalon_${x}`),
    );
    const crowns = snapshot.entities.filter((e) => e.kind === 'crown_tower');
    expect(crowns.every((c) => c.companyId && c.name !== 'Private')).toBe(true);
    expect(snapshot.entities.every((e) => /^(bnd|lmk)_/.test(e.id) && e.parcelId.startsWith('pcl_'))).toBe(true);
  });
});

describe('C-14 privacy (17-AT-21)', () => {
  it('worlds that differ only in private data publish byte-identical files', () => {
    // same public records; different owners, cost bases, live quotes, trades and online times
    const a = publish(buildWorld(undefined, 1), 1, 100);
    const b = publish(buildWorld(undefined, 987654), 1, 100);
    expect(a.files.size).toBe(b.files.size);
    for (const [url, bytes] of a.files) expect(sha256(b.files.get(url)!)).toBe(sha256(bytes));
    expect(JSON.stringify(a.manifest)).toBe(JSON.stringify(b.manifest));
    const text = new TextDecoder().decode(canonicalBytes(a.snapshot));
    expect(text).not.toMatch(/ownerAccountId|privateCostBasis|liveQuoteBp|acc_/);
  });
  it('the client store drops anything off the allowlist; only "mine" differs in the table', () => {
    const a = generateCity().snapshot;
    const b = JSON.parse(JSON.stringify(a));
    b.entities.forEach((e: Record<string, unknown>, i: number) => {
      e.ownerId = `player-${i % 7}`;
      e.privateTrades = [{ qty: i, price: '10.00' }];
    });
    b.me = { cash: '123.00' };
    const sa = new CityStore(), sb = new CityStore();
    sa.apply(a);
    sb.apply(b);
    expect(renderInputHash(sb.snapshot!)).toBe(renderInputHash(sa.snapshot!));
    expect(canonicalJson(sb.snapshot)).toBe(canonicalJson(publicSnapshot(a)));
    const noMine = new Set<string>();
    const id = a.entities[5].id;
    const ra = tableRows(sa.snapshot!, noMine), rb = tableRows(sb.snapshot!, new Set([id]));
    const diffRows = rb.filter((r, i) => JSON.stringify(r) !== JSON.stringify(ra[i]));
    expect(diffRows.map((r) => [r.entityId, r.mine])).toEqual([[id, true]]);
  });
});
