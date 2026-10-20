import { describe, expect, it } from 'vitest';
import { generateCity } from '../../e2e/city/fixtures/generate-city';
import { decodeChunk, type DecodedChunk } from '@/city/worker/decode';
import { buildModel, pickableEntityIds } from '@/city/renderer/model';
import { tableRows, rowPick } from '@/city/table/rows';
import { moneyText, pnl } from '@/city/table/format';

describe('C-02 map ↔ table', () => {
  it('every entity pickable on the map is a table row and vice versa (reference seed)', () => {
    const { snapshot, files, manifests } = generateCity();
    const url = new Map(manifests.get(1)!.chunks.map((c) => [c.contentHash, c.url]));
    const decoded = new Map<string, DecodedChunk>();
    for (const c of snapshot.chunks) {
      const b = files.get(url.get(c.contentHash)!)!;
      decoded.set(c.contentHash, decodeChunk(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer));
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

describe('M4 table numbers', () => {
  it('rent is Money (decimal string + ccy) in its own column; Today is HQ-only and "unavailable" without a quote', () => {
    const { snapshot } = generateCity();
    const rows = tableRows(snapshot, new Set());
    const d = rows.find((r) => r.kind === 'district')!;
    expect(d.rent?.ccy).toBe('FDL');
    expect(d.today).toBeNull();
    const hq = rows.find((r) => r.kind === 'company_hq')!;
    expect(hq.rent).toBeNull();
    expect(hq.today).toEqual({ bp: null });
    expect(pnl(hq.today!.bp)).toEqual({ text: 'unavailable', tone: 'none' });
    const quoted = tableRows(snapshot, new Set(), () => -211).find((r) => r.kind === 'company_hq')!;
    expect(pnl(quoted.today!.bp)).toEqual({ text: '▼ \u22122.11%', tone: 'loss' });
    expect(pnl(588)).toEqual({ text: '▲ +5.88%', tone: 'gain' });
  });
  it('money goes through the shared format module, no float arithmetic', () => {
    expect(moneyText('1385.5', 'FDL')).toBe('$1,385.50');
    expect(moneyText('12.30', 'EUR')).toBe('12.30 EUR');
    expect(moneyText('not-a-number', 'FDL')).toBe('unavailable');
  });
  it('unnamed properties show their parcel, never an owner', () => {
    const { snapshot } = generateCity();
    const p = tableRows(snapshot, new Set()).find((r) => r.kind === 'property' && r.name.startsWith('Parcel'))!;
    expect(p.name).toMatch(/^Parcel \d+$/);
  });
});
