import type { PickResult } from '../index';
import type { CitySnapshot, EntityKind } from '../data/types';

export type RowKind = EntityKind | 'district';

export interface TableRow {
  kind: RowKind;
  entityId: string;
  parcelId: string;
  name: string;
  district: string;
  dayReturn: number | null;
  rent: number | null;
  mine: boolean;
}

export const KIND_LABEL: Record<RowKind, string> = {
  company_hq: 'Company HQ',
  storefront: 'Storefront',
  property: 'Property',
  landmark: 'Landmark',
  crown_tower: 'Crown tower',
  listing: 'Listing',
  district: 'District',
};

/** Every pickable thing on the map, from the same snapshot the map draws (CTY-05). */
export function tableRows(s: CitySnapshot, mine: ReadonlySet<string>): TableRow[] {
  const districtName = new Map(s.districts.map((d) => [d.id, d.name]));
  const rows: TableRow[] = s.districts.map((d) => ({
    kind: 'district',
    entityId: d.id,
    parcelId: d.id,
    name: d.name,
    district: d.name,
    dayReturn: null,
    rent: d.rent,
    mine: false,
  }));
  for (const e of s.entities) {
    rows.push({
      kind: e.kind,
      entityId: e.id,
      parcelId: e.parcelId,
      name: e.name,
      district: districtName.get(e.districtId) ?? '',
      dayReturn: e.kind === 'company_hq' || e.kind === 'storefront' ? e.dayReturn : null,
      rent: null,
      mine: mine.has(e.id),
    });
  }
  return rows;
}

export function matches(row: TableRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [row.name, row.district, KIND_LABEL[row.kind], row.parcelId].some((t) => t.toLowerCase().includes(q));
}

export function rowPick(row: TableRow, screen: { x: number; y: number }): PickResult {
  return { kind: row.kind, entityId: row.entityId, parcelId: row.parcelId, screen };
}
