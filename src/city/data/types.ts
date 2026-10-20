// Public city wire shapes. Owner: Spec 2 (client side); the publisher is module 10's.
// Follows the Systems rulings on PR #4 (/workspace/specs/pr4-systems-answers.md, "SR"):
// - one manifest per city is the only mutable file; everything else is content-addressed (SR Q1);
// - a snapshot and a delta share one shape (10 PublicCityState), a delta has a base (SR Q4);
// - money is a decimal string plus the city currency, never a float (SR Q6, G3);
// - geometry and polygons are integer centimetres (SR Q2, Q3, Q7);
// - no city-wide return, no brief text, no progress fraction, no anonymous tower (SR headline, Q8, Q9).

/** A decimal string with no exponent, e.g. "12.35". Display only through the shared format module. */
export type MoneyString = string;
/** ISO-like currency code; Port Avalon is FDL (22 §3.1). */
export type Ccy = string;

/** 10 §2 `UseClass`. */
export type UseClass = 'RES' | 'OFFICE' | 'RETAIL' | 'INDUSTRIAL' | 'HOSPITALITY' | 'DATACENTER' | 'CIVIC' | 'GREEN';
/** 06 `SectorId`. */
export type SectorId =
  | 'TECH' | 'SEMI' | 'ENERGY' | 'MATERIALS' | 'INDUSTRIALS' | 'FINANCIALS'
  | 'HEALTH' | 'STAPLES' | 'DISCRETIONARY' | 'REAL_ESTATE' | 'MEDIA' | 'SECURITY';
/** 10 §3.21 `ParcelLifecycle`. */
export type ParcelLifecycle = 'PLANNED' | 'SERVICED' | 'BUILDING' | 'OCCUPIED' | 'VACANT' | 'DERELICT' | 'REUSE' | 'STALLED';
export type DistrictTier = 'working' | 'mid' | 'prime' | 'trophy';

export type EntityKind = 'company_hq' | 'storefront' | 'property' | 'landmark' | 'crown_tower' | 'listing';

/** One public, pickable thing on the map (a 10 binding). Only these fields are ever read. */
export interface CityEntity {
  /** Persistent id (bnd_…, lmk_…), never a render id (SR Q13e). */
  id: string;
  kind: EntityKind;
  parcelId: string;
  /** Sign text / landmark / company name. null for a property without OWNERSHIP_PUBLIC. */
  name: string | null;
  districtId: string;
  /** Company or awning sector; null where 10 publishes none. */
  sector: SectorId | null;
  /** HQ / crown owner company: the market-lights overlay reads its quote from the market view. */
  companyId: string | null;
  forSale: boolean;
  atAuction: boolean;
  lifecycle: ParcelLifecycle;
  heightLevel: number;
  /** Crown towers only (10 §3.22). */
  title?: 'city_crown' | null;
  archetypeId?: string;
}

export interface DistrictUse {
  rentPerM2PerGD: MoneyString;
  /** 0..1, rounded to 1e-4 */
  vacancy: number;
  pressure: number;
}

export interface CityDistrict {
  id: string; // dist_<city>_<district>
  nameKey: string;
  tier: DistrictTier;
  rentIndex: number;
  priceIndex: number;
  byUse: Partial<Record<UseClass, DistrictUse>>;
  listings: number;
  /** Outline in integer cm on the city plane, [x, z] pairs. */
  polygon: [number, number][];
}

/** chunkKey = "{cx}_{cz}" on the 128 m grid; content-addressed (sha256 of the uncompressed bytes). */
export interface ChunkRef {
  chunkKey: string;
  contentHash: string;
}

export interface GroundRef {
  contentHash: string;
  /** cells per side */
  size: number;
  /** 200 cm by default */
  cellCm: number;
  /** cell (0,0) corner, cm, a multiple of the 12,800 cm chunk grid */
  originCm: [number, number];
}

/** Module 10 PublicCityState: a snapshot has baseVersion null, a delta names its base. */
export interface PublicCityState {
  schemaVersion: 1;
  cityId: string;
  stateVersion: number;
  baseVersion: number | null;
  publicSnapshotTick: number;
  ccy: Ccy;
  ground: GroundRef;
  districts: CityDistrict[];
  /** Snapshot: every binding. Delta: changed ones, removals as tombstones. */
  entities: (CityEntity | Tombstone)[];
  chunks: (ChunkRef | ChunkTombstone)[];
}

export interface Tombstone {
  id: string;
  removed: true;
}
export interface ChunkTombstone {
  chunkKey: string;
  removed: true;
}

export interface CitySnapshot extends PublicCityState {
  baseVersion: null;
  entities: CityEntity[];
  chunks: ChunkRef[];
}

export interface CityDelta extends PublicCityState {
  baseVersion: number;
}

export interface ManifestFile {
  url: string;
  contentHash: string;
}

/** The only mutable file (short cache). Lists every immutable artifact by content hash (SR Q1). */
export interface CityManifest {
  schemaVersion: 1;
  cityId: string;
  stateVersion: number;
  publicSnapshotTick: number;
  snapshot: ManifestFile & { stateVersion: number };
  /** Deltas from the last 2 versions only. */
  deltas: (ManifestFile & { base: number })[];
  chunks: (ManifestFile & { chunkKey: string })[];
  ground: ManifestFile;
  t0: (ManifestFile & { w: number; h: number; rotation: number })[];
}

export function isTombstone(e: CityEntity | Tombstone): e is Tombstone {
  return (e as Tombstone).removed === true;
}
