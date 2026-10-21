import type { PickResult } from '../index';
import type { CitySnapshot, EntityKind, MoneyString, Ccy } from '../data/types';
import { districtName } from '../data/names';

export type RowKind = EntityKind | 'district';

/** A company's day return as the market view publishes it; null = no quote ("unavailable"). */
export type QuoteBp = number | null;

export interface TableRow {
  kind: RowKind;
  entityId: string;
  parcelId: string;
  name: string;
  district: string;
  /** Districts only: office rent per m² per game day. */
  rent: { amount: MoneyString; ccy: Ccy } | null;
  /** HQs only: the owner's published day return in basis points, or null when unavailable. */
  today: { bp: QuoteBp } | null;
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

/** Unnamed properties (no OWNERSHIP_PUBLIC) show their parcel, never an owner. */
export function displayName(name: string | null, parcelId: string): string {
  return name ?? `Parcel ${parcelId.replace(/^pcl_[a-z_]*?_(?=\d)/, '').replace(/^0+(?=\d)/, '')}`;
}

/**
 * Every pickable thing on the map, from the same snapshot the map draws (CTY-05).
 * Quotes are not in the city payload (SR Q8): `quote` reads the market view; without one → null.
 */
export function tableRows(s: CitySnapshot, mine: ReadonlySet<string>, quote: (companyId: string) => QuoteBp = () => null): TableRow[] {
  const dName = new Map(s.districts.map((d) => [d.id, districtName(d.nameKey)]));
  const rows: TableRow[] = s.districts.map((d) => {
    const office = d.byUse.OFFICE ?? Object.values(d.byUse)[0];
    return {
      kind: 'district',
      entityId: d.id,
      parcelId: d.id,
      name: dName.get(d.id)!,
      district: dName.get(d.id)!,
      rent: office ? { amount: office.rentPerM2PerGD, ccy: s.ccy } : null,
      today: null,
      mine: false,
    };
  });
  for (const e of s.entities) {
    rows.push({
      kind: e.kind,
      entityId: e.id,
      parcelId: e.parcelId,
      name: displayName(e.name, e.parcelId),
      district: dName.get(e.districtId) ?? '',
      rent: null,
      today: e.kind === 'company_hq' ? { bp: e.companyId ? quote(e.companyId) : null } : null,
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
