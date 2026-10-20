// Data shapes for the City renderer. Owner: Spec 2.
// V3 10 §3.26 names the payload (district indices, rents, listings count, public building changes,
// city brief items) but not a wire format; these shapes are our proposal [P].

export type EntityKind =
  | 'company_hq'
  | 'storefront'
  | 'property'
  | 'landmark'
  | 'crown_tower'
  | 'listing';

/** One public, pickable thing on the map. Only these fields are ever read (privacy, 17-AT-21). */
export interface CityEntity {
  id: string;
  kind: EntityKind;
  parcelId: string;
  name: string;
  districtId: string;
  sector: string;
  /** Daily return of the owner's listed stock, for the movers overlay and window lights. */
  dayReturn: number;
  forSale: boolean;
  atAuction: boolean;
  /** 0..1: how far a development project has progressed; 1 = complete. */
  development: number;
}

export interface CityDistrict {
  id: string;
  name: string;
  /** Centre in world metres (x, z). */
  center: [number, number];
  index: number;
  rent: number;
  listings: number;
}

/** A 128 m × 128 m render/transport chunk, content-hashed and immutable. */
export interface ChunkRef {
  cx: number;
  cz: number;
  url: string;
  hash: string;
}

export interface CitySnapshot {
  type: 'snapshot';
  cityId: string;
  stateVersion: number;
  /** Ticks between the latest simulation tick and this publication (≤ 1,440). */
  lagTicks: number;
  /** City-wide market return of the day, for the market lights (10 §3.26). */
  dayReturn: number;
  /** World extent in metres, centred on the origin. */
  extent: number;
  /** Land/water mask, 1 byte per cell (0 water, 1 land, 2 park, 3 road), size × size. */
  ground: { url: string; size: number };
  districts: CityDistrict[];
  entities: CityEntity[];
  chunks: ChunkRef[];
  brief: string[];
}

export interface CityDelta {
  type: 'delta';
  cityId: string;
  baseVersion: number;
  stateVersion: number;
  lagTicks: number;
  dayReturn?: number;
  districts?: CityDistrict[];
  upsert?: CityEntity[];
  remove?: string[];
  /** Chunks whose content changed (new hash). */
  chunks?: ChunkRef[];
  brief?: string[];
}
