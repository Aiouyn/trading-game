import { describe, expect, it } from 'vitest';
import { generateCity } from '../../e2e/city/fixtures/generate-city';
import { decodeChunk, type DecodedChunk } from '@/city/worker/decode';
import { buildModel, pickableEntityIds } from '@/city/renderer/model';
import { buildRamps } from '@/city/art/ramps';
import { anchors } from '@/city/art/materials';
import { FLAT_BRASS, partColors } from '@/city/renderer/overlay';
import { tableRows } from '@/city/table/rows';
import type { CityOverlay } from '@/city';
import { inkBrass } from './tokens-fixture';

// Engine schema (packages/engine/city/schema.ts:98-100): ParcelRow.ownerId / buildingId /
// reservedFor are `Id | null`. A part whose owner is null (or whose entity was tombstoned by a
// delta) reaches the client as an id slot that resolves to no snapshot entity. It must render as
// unowned: base facade, never brass, not pickable, no crash.
const { snapshot: full, files, manifests } = generateCity();
const url = new Map(manifests.get(1)!.chunks.map((c) => [c.contentHash, c.url]));
const decoded = new Map<string, DecodedChunk>();
for (const c of full.chunks) {
  const b = files.get(url.get(c.contentHash)!)!;
  decoded.set(c.contentHash, decodeChunk(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer));
}
// the fixture part with no owner: the crown tower (brass if misattributed), dropped from the snapshot
const crown = full.entities.find((e) => e.kind === 'crown_tower')!;
const snapshot = { ...full, entities: full.entities.filter((e) => e !== crown) };
const OVERLAYS: CityOverlay[] = ['none', 'my_places', 'districts', 'sectors', 'for_sale', 'auctions', 'movers', 'development'];

describe('null-owner parts (card 2)', () => {
  const ref = buildModel(full, decoded);
  const m = buildModel(snapshot, decoded);
  const crownParts = ref.partsOf.get(full.entities.indexOf(crown))!;
  it('the fixture has owner-less parts, and they resolve to entity -1, unpickable, not table rows', () => {
    expect(crownParts.length).toBeGreaterThan(0);
    expect(m.entity.length).toBe(ref.entity.length); // geometry unchanged
    for (const p of crownParts) expect(m.entity[p]).toBe(-1);
    expect([...m.partsOf.values()].flat()).not.toEqual(expect.arrayContaining([crownParts[0]]));
    expect(pickableEntityIds(snapshot, m).has(crown.id)).toBe(false);
    expect(tableRows(snapshot, new Set([crown.id])).some((r) => r.entityId === crown.id)).toBe(false);
  });
  it('render as unowned: base facade, no brass, in every overlay, with materials and "mine" naming the lost id', () => {
    const r = buildRamps(inkBrass);
    for (const overlay of OVERLAYS) {
      const { colors, flat } = partColors(
        { entity: m.entity, style: m.style, entities: snapshot.entities, districts: snapshot.districts, mine: new Set([crown.id]), overlay, myCityOverlay: true, quote: () => 0.01, materials: { anchors: anchors(inkBrass), cityId: snapshot.cityId } },
        r,
      );
      for (const p of crownParts) {
        expect(flat[p]).not.toBe(FLAT_BRASS);
        const c = Array.from(colors.subarray(p * 3, p * 3 + 3));
        expect(c.every(Number.isFinite)).toBe(true);
        const base = r.facades[m.style[p] & 3];
        if (overlay === 'none' || overlay === 'my_places') expect(c).toEqual(Array.from(Float32Array.from(base)));
      }
    }
  });
});
