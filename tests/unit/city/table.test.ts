import { describe, expect, it } from 'vitest';
import { generateCity } from '../../e2e/city/fixtures/generate-city';
import { decodeChunk, type DecodedChunk } from '@/city/worker/decode';
import { buildModel, pickableEntityIds } from '@/city/renderer/model';
import { tableRows, rowPick } from '@/city/table/rows';

describe('C-02 map ↔ table', () => {
  it('every entity pickable on the map is a table row and vice versa (reference seed)', () => {
    const { snapshot, files } = generateCity();
    const decoded = new Map<string, DecodedChunk>();
    for (const c of snapshot.chunks) {
      const b = files.get(c.url)!;
      decoded.set(c.hash, decodeChunk(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer));
    }
    const model = buildModel(snapshot, decoded);
    const map = [...pickableEntityIds(snapshot, model)].sort();
    const rows = tableRows(snapshot, new Set()).map((r) => r.entityId).sort();
    expect(rows).toEqual(map);
    expect(rows.length).toBe(snapshot.entities.length + snapshot.districts.length);
    const kinds = new Set(tableRows(snapshot, new Set()).map((r) => r.kind));
    expect([...kinds].sort()).toEqual(['company_hq', 'crown_tower', 'district', 'landmark', 'listing', 'property', 'storefront']);
  });
  it('a row pick carries kind, entityId and parcelId', () => {
    const { snapshot } = generateCity();
    const row = tableRows(snapshot, new Set()).find((r) => r.kind === 'company_hq')!;
    expect(rowPick(row, { x: 1, y: 2 })).toEqual({ kind: 'company_hq', entityId: row.entityId, parcelId: row.parcelId, screen: { x: 1, y: 2 } });
  });
});
