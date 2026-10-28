// T10A-01: every 10A record shape (10 §2.1–§2.4, §2.11) and its table (module '10', `city.*`). Fields are 10 §2 verbatim;
// the only additions are CityRow.slug / rendererKey (card exports, step 2). Types 10 §2 names but never defines are marked SPEC GAP:
// each is the narrowest shape the cited spec text supports, and is listed as a spec question in the PR.
import { EngineFault, type Ccy, type Id, type Money, type TableDef, type Tick } from '@tycoon/engine-core';
import type { SectorId } from '@tycoon/content';
import type { BlocId } from '@tycoon/engine-macro';
import type { FixedPointCoord, FixedPointPolygon, FixedPointPolyline, FixedPointRect, StreetClass } from './geom';

export type { BlocId };
/** Integer square metres (10 §2 preamble). */
export type Area = number;
/** float64 per game year (10 §2 preamble). */
export type Rate = number;

export type DistrictTier = 'working' | 'mid' | 'prime' | 'trophy';
export const DISTRICT_TIERS: readonly DistrictTier[] = ['working', 'mid', 'prime', 'trophy'];
export type UseClass = 'RES' | 'OFFICE' | 'RETAIL' | 'INDUSTRIAL' | 'HOSPITALITY' | 'DATACENTER' | 'CIVIC' | 'GREEN';
export const USE_CLASSES: readonly UseClass[] = ['RES', 'OFFICE', 'RETAIL', 'INDUSTRIAL', 'HOSPITALITY', 'DATACENTER', 'CIVIC', 'GREEN'];
export type TerrainRole = 'waterfront' | 'hill' | 'flat_center' | 'riverside' | 'industrial_shore' | 'island' | 'reclaimed' | 'edge';
export const TERRAIN_ROLES: readonly TerrainRole[] = ['waterfront', 'hill', 'flat_center', 'riverside', 'industrial_shore', 'island', 'reclaimed', 'edge'];
/** E-88 (3): the rank ladder. */
export type RankId = 'R0' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6';
export const RANK_IDS: readonly RankId[] = ['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6'];
/** E-88 (3): replaces 10 §2.1 `unlockRank`. Viewing and buying are gated separately; islandRank is Isla Serena's island-asset gate. */
export interface CityAccess { viewRank: RankId; homeBlocOwnRank: RankId; otherBlocOwnRank: RankId; islandRank: RankId | null }
/** E-88 (3): the Isla Serena city id. */
export const ISLA_SERENA_CITY_ID = 'cty_isla_serena';
/** E-88 (3): an ordinary city is R0 / R0 / R2 / null. */
export const ORDINARY_CITY_ACCESS: Readonly<CityAccess> = Object.freeze({ viewRank: 'R0', homeBlocOwnRank: 'R0', otherBlocOwnRank: 'R2', islandRank: null });
/** E-88 (3): Isla Serena is R0 / R4 / R4 / R6. */
export const SERENA_CITY_ACCESS: Readonly<CityAccess> = Object.freeze({ viewRank: 'R0', homeBlocOwnRank: 'R4', otherBlocOwnRank: 'R4', islandRank: 'R6' });
/** E-88 (3): the CityAccess of a city (T10A-02 builds the rows and checks them against cityProfile). */
export const cityAccessOf = (cityId: Id): Readonly<CityAccess> => (cityId === ISLA_SERENA_CITY_ID ? SERENA_CITY_ACCESS : ORDINARY_CITY_ACCESS);
/** E-88 (3): a city's own rank for a player: homeBlocOwnRank when city.bloc is the player's home bloc, otherBlocOwnRank otherwise. */
export const ownRankFor = (access: CityAccess, cityBloc: BlocId | null, homeBloc: BlocId): RankId =>
  (cityBloc === homeBloc ? access.homeBlocOwnRank : access.otherBlocOwnRank);

/** Card step 2: the renderer's city key grammar (`prototypes/cities/src/parcel-id.js`). */
export const RENDERER_KEY_RE = /^[a-z][a-z0-9-]*$/;

// ───────── §2.1 world geography ─────────
export interface CityRow {
  id: Id;                       // cityId(slug)
  slug: string;                 // card exports: the authored slug behind id
  rendererKey: string;          // card step 2: RENDERER_KEY_RE, mapped 1:1 from the row
  name: string;                 // string key 'city.<slug>.name' (L8)
  bloc: BlocId | null;          // null only for Isla Serena
  ccy: Ccy;                     // Isla Serena: 'FDL'
  personalityId: Id;
  worldSeedStream: string;      // 'city/<id>' (02)
  openedTick: Tick;
  access: CityAccess;           // E-88 (3): amends 10 §2.1 unlockRank
  districts: Id[];              // 6..10 (Isla Serena: 1)
  population: number;
  households: number;
  hhSize: number;
  laborForce: number;
  jobsBySector: Record<SectorId, number>;
  medianHhIncomePerGY: Money;
  cityGdpShare: number;
  propertyTaxRate: Rate;
  stampDutyRate: number;
  priceIndex: number;
  stateVersion: number;
  manifestId: Id;
}

export interface DistrictUseMarket {
  supplyArea: Area; occupiedArea: Area; demandArea: number; vacancy: number; naturalVacancy: number;
  pressure: number; pressureHighDays: number; pressureLowDays: number;
  marketRentPerM2PerGD: Money; rentIndex: number; capRate: Rate; txnCount91: number;
}

/** E-88 (2a) accepted (10 §2.1 names it; §3.5 gives only the terms): the seven §3.5 terms, tierOffset, and `value` = D_d. Each term is in [−1, 1]. */
export interface DesirabilityState {
  jobsAccess: number; services: number; transit: number; environment: number; safety: number; prestige: number; momentum: number;
  tierOffset: number; value: number;
}

export interface DistrictRow {
  id: Id; cityId: Id; name: string; tier: DistrictTier; terrainRole: TerrainRole; heritage: boolean; heightCapM: number;
  market: Record<UseClass, DistrictUseMarket>;
  desirability: DesirabilityState;
  crimeIndex: number;           // 0..100, 50 = city mean
  capexMomentum91: Money;
  landmarkParcelId: Id;
  priceIndexByUse: Record<UseClass, number>;
}

// ───────── §2.2 parcels, buildings, units ─────────
export type ParcelLifecycle = 'PLANNED' | 'SERVICED' | 'BUILDING' | 'OCCUPIED' | 'VACANT' | 'DERELICT' | 'REUSE' | 'STALLED';
export const PARCEL_LIFECYCLES: readonly ParcelLifecycle[] = ['PLANNED', 'SERVICED', 'BUILDING', 'OCCUPIED', 'VACANT', 'DERELICT', 'REUSE', 'STALLED'];
export type ParcelAccess = 'ROAD' | 'FOOT' | 'CANAL';
export type ParcelReservation = 'CROWN' | 'LANDMARK' | 'HALL_OF_PATRONS' | 'CIVIC' | 'CORRIDOR';
export interface Zoning { allowed: UseClass[]; maxHeightM: number; maxFar: number; heritageLocked: boolean }
export interface Address {
  number: number; streetId: Id; streetName: string; districtId: Id; cityId: Id;
  unitLabel?: string;           // units only: 'Unit 3B', 'Shop 2'
  display: string;
}
export interface ParcelAttributes { waterView: number /* 0..1 */; transitDist: number /* m */; slope: number; cornerLot: boolean; mainAvenue: boolean }
export interface ParcelRow {
  id: Id; cityId: Id; districtId: Id; regionId: Id;
  polygon: FixedPointPolygon;
  areaM2: Area; frontageM: number;
  access: ParcelAccess[];
  zoning: Zoning;
  landValueV: number;
  attributes: ParcelAttributes;
  lifecycle: ParcelLifecycle;
  devPriority: number;
  ownerId: Id | null;
  buildingId: Id | null;
  reservedFor: ParcelReservation | null;
  address: Address;
}

export type PropertyType =
  | 'ROOM' | 'STUDIO' | 'APARTMENT' | 'TOWNHOUSE' | 'PENTHOUSE' | 'APARTMENT_BLOCK' | 'VILLA'
  | 'MANSION' | 'ESTATE' | 'OFFICE_FLOOR' | 'OFFICE_TOWER' | 'RETAIL_UNIT' | 'SHOPPING_MALL'
  | 'WAREHOUSE' | 'DATACENTER_SITE' | 'HOTEL' | 'LAND' | 'PRIVATE_ISLAND';
export const PROPERTY_TYPES: readonly PropertyType[] = ['ROOM', 'STUDIO', 'APARTMENT', 'TOWNHOUSE', 'PENTHOUSE', 'APARTMENT_BLOCK', 'VILLA',
  'MANSION', 'ESTATE', 'OFFICE_FLOOR', 'OFFICE_TOWER', 'RETAIL_UNIT', 'SHOPPING_MALL', 'WAREHOUSE', 'DATACENTER_SITE', 'HOTEL', 'LAND', 'PRIVATE_ISLAND'];
export type QualityGrade = 'A' | 'B' | 'C';
export type BuildingPhysicalState = 'OCCUPIED' | 'VACANT' | 'DERELICT' | 'CONSTRUCTION' | 'STALLED_SHELL';

/** E-88 (2a): every numeric field is an integer, seed a u32 (10 §2.2 names it; §3.19.5: "parts (1–4) with base mesh id, size, quantised rotation, style id, seed, floor height, bay width,
 *  tint index"). Lengths are integer centimetres (§2.11 geometry rule); `size` is the part footprint and height. */
export interface BuildingVisualPart {
  baseMeshId: Id; size: { xCm: number; zCm: number; heightCm: number }; rotationQ: number; styleId: Id; seed: number;
  floorHeightCm: number; bayWidthCm: number; tintIndex: number;
}
export interface BuildingVisual { parts: BuildingVisualPart[] /* 1..4 */ }
/** 2^32 − 1: `seed` is a u32 from the `city.vis` hash (E-88 (2a)). */
export const U32_MAX = 4_294_967_295;
const badVisual = (msg: string): never => { throw new EngineFault('CITY_BAD_VISUAL', msg); };
/** E-88 (2a): throws CITY_BAD_VISUAL unless every numeric field is an integer (cm sizes, integer indices) and seed is in 0..2^32−1. */
export function assertBuildingVisualPart(p: BuildingVisualPart): void {
  const ints: readonly (readonly [string, number])[] = [['size.xCm', p.size.xCm], ['size.zCm', p.size.zCm], ['size.heightCm', p.size.heightCm],
    ['rotationQ', p.rotationQ], ['seed', p.seed], ['floorHeightCm', p.floorHeightCm], ['bayWidthCm', p.bayWidthCm], ['tintIndex', p.tintIndex]];
  for (const [k, v] of ints) if (!Number.isSafeInteger(v)) badVisual(`${k} ${v} is not an integer`);
  if (p.seed < 0 || p.seed > U32_MAX) badVisual(`seed ${p.seed} is outside 0..2^32−1`);
}
/** 10 §2.2: 1..4 parts, each valid. */
export function assertBuildingVisual(v: BuildingVisual): void {
  if (v.parts.length < 1 || v.parts.length > 4) badVisual(`visual has ${v.parts.length} parts (not 1..4)`);
  for (const p of v.parts) assertBuildingVisualPart(p);
}

export interface BuildingRow {
  id: Id; parcelId: Id; archetypeId: Id; propertyType: PropertyType; use: UseClass;
  floors: number; heightM: number; grossAreaM2: Area; qualityGrade: QualityGrade; builtTick: Tick;
  condition: number;            // 0..100
  units: Id[];
  visual: BuildingVisual;
  physicalState: BuildingPhysicalState;
  ownership: 'WHOLE' | 'STRATA';
  wholeOwnerPropId: Id | null;
  npcPoolKey: string | null;    // '<districtId>|<use>|<grade>'
}

export type SlotClass = 'CORNER_AVENUE' | 'AVENUE' | 'SIDE_STREET' | 'ALLEY' | 'UPPER';
export interface UnitRow {
  id: Id; buildingId: Id; use: UseClass; areaM2: Area; floor: number; storefront: boolean;
  slotClass: SlotClass | null; propId: Id | null; occupantId: Id | null; leaseId: Id | null;
}

// ───────── §2.3 property ─────────
export type PropUseMode = 'RENTED' | 'OWNER_OCCUPIED' | 'COMPANY_PREMISES' | 'VACANT_HELD' | 'UNDER_RENOVATION' | 'UNDER_DEVELOPMENT';
export const PROP_USE_MODES: readonly PropUseMode[] = ['RENTED', 'OWNER_OCCUPIED', 'COMPANY_PREMISES', 'VACANT_HELD', 'UNDER_RENOVATION', 'UNDER_DEVELOPMENT'];

export interface AppraisalRec {
  tick: Tick; valueIncome: Money; valueComp: Money; weightIncome: number; value: Money; priceIndexAtAppraisal: number;
  appraiser: 'SYSTEM' | 'NPC_FIRM' | 'PLAYER_FIRM';
}
/** E-88 (2a): the three 10 §3.24 opt-ins; all default to false, and publicAddress counts only when visitableEstate is true. */
export interface PublicPropertyRecord { publicOwnership: boolean; visitableEstate: boolean; publicAddress: boolean }
export const DEFAULT_PUBLIC_RECORD: Readonly<PublicPropertyRecord> = Object.freeze({ publicOwnership: false, visitableEstate: false, publicAddress: false });
/** The effective opt-ins: publicAddress is false unless visitableEstate (E-88 (2a)). */
export const effectivePublicRecord = (r: PublicPropertyRecord): PublicPropertyRecord =>
  ({ publicOwnership: r.publicOwnership, visitableEstate: r.visitableEstate, publicAddress: r.visitableEstate && r.publicAddress });

export interface PropertyRow {
  id: Id; type: PropertyType; ownerId: Id; ccy: Ccy; cityId: Id; districtId: Id; parcelId: Id;
  buildingId: Id | null;        // null for LAND
  unitIds: Id[]; areaM2: Area; condition: number; qualityGrade: QualityGrade; amenityMult: number;
  useMode: PropUseMode; useModeChangedTick: Tick;
  managerContractId: Id | null; policyId: Id; groupId: Id | null;
  mortgageIds: Id[];            // ≤ PARAM.max_liens_per_property
  lastAppraisal: AppraisalRec;
  costBasis: Money; acquiredTick: Tick;
  insurancePolicyId: Id | null; listingId: Id | null; heldByCourt: boolean;
  publicRecord: PublicPropertyRecord;
  uniqueAssetId: Id | null;
}

// ───────── §2.4 leases ─────────
export type TenantKind = 'HH_AGGREGATE' | 'NPC_FIRM' | 'NAMED_NPC' | 'PLAYER_BUSINESS' | 'PLAYER_CHARACTER' | 'PLAYER_COMPANY';
export const TENANT_KINDS: readonly TenantKind[] = ['HH_AGGREGATE', 'NPC_FIRM', 'NAMED_NPC', 'PLAYER_BUSINESS', 'PLAYER_CHARACTER', 'PLAYER_COMPANY'];
export type LeaseStatus = 'ACTIVE' | 'NOTICE' | 'ARREARS' | 'ENDED' | 'EVICTING';
export const LEASE_STATUSES: readonly LeaseStatus[] = ['ACTIVE', 'NOTICE', 'ARREARS', 'ENDED', 'EVICTING'];
export interface LeaseRow {
  id: Id; propId: Id; unitIds: Id[]; landlordId: Id; tenantId: Id; tenantKind: TenantKind; use: UseClass;
  rentPerGD: Money; revenueSharePct: number; startTick: Tick; endTick: Tick; indexation: 'CPI' | 'FIXED';
  depositHeld: Money; breakFeeGD: number; status: LeaseStatus; arrearsGD: number; relatedParty: boolean; contractId: Id | null;
}

// ───────── §2.11 public city records ─────────
export interface CityManifestRow {
  id: Id; worldId: Id; cityId: Id; macroPlanVersion: string; stateVersion: number; publicSnapshotTick: Tick;
  regions: { regionId: Id; generatorPackage: string; contentHash: string }[];
  chunks: { chunkKey: string; contentHash: string; url: string }[];
  schemaVersion: number;
}
export interface BoundaryContract {
  edge: 'N' | 'E' | 'S' | 'W';
  crossings: { at: FixedPointCoord; streetClass: StreetClass; widthCm: number; elevationCm: number }[];
  waterEdges: FixedPointPolyline[];
}
export interface CityRegionRow {
  id: Id; cityId: Id; bounds: FixedPointRect; boundaryContracts: BoundaryContract[]; generatorPackage: string; generatedTick: Tick;
  status: 'RESERVED' | 'GENERATED';
}
export type PublicBinding =
  | { kind: 'HQ'; parcelId: Id; companyId: Id }
  | { kind: 'STOREFRONT'; unitId: Id; signText: string; sectorAwning: SectorId; status: 'OPEN' | 'CLOSED' | 'FIT_OUT' }
  | { kind: 'OWNERSHIP_PUBLIC'; propId: Id; ownerDisplay: string }
  | { kind: 'HALL_SEAT'; cityId: Id; position: number; displayName: string | null; band: string }
  | { kind: 'LANDMARK_NAME'; parcelId: Id; label: string }
  | { kind: 'PLAQUE'; parcelId: Id; text: string; chrDisplay: string }
  | { kind: 'COMPANY_BUILDING'; parcelId: Id; companyId: Id; facadeKitId: Id | null };
export type TransitionCause = 'DEVELOPMENT_COMPLETE' | 'CONSTRUCTION_START' | 'CONVERSION' | 'VACANCY' | 'DERELICT' | 'REUSE' | 'STOREFRONT_OPEN'
  | 'STOREFRONT_CLOSE' | 'HQ_RELOCATION' | 'DISTRICT_EVENT';
export const TRANSITION_CAUSES: readonly TransitionCause[] = ['DEVELOPMENT_COMPLETE', 'CONSTRUCTION_START', 'CONVERSION', 'VACANCY', 'DERELICT', 'REUSE',
  'STOREFRONT_OPEN', 'STOREFRONT_CLOSE', 'HQ_RELOCATION', 'DISTRICT_EVENT'];
export interface CityTransition { id: Id; parcelId: Id; cause: TransitionCause; fromState: string; toState: string; publishedTick: Tick; sourceEventId: Id }
export interface PublicCityState {
  cityId: Id; stateVersion: number; baseVersion: number | null;
  parcelStates: { parcelId: Id; lifecycle: ParcelLifecycle; heightLevel: number; archetypeId: Id }[];
  bindings: PublicBinding[];
  transitions: CityTransition[];
}
/** Never in public artifacts (LC16). */
export interface PrivateCityOverlay { chrId: Id; myPropIds: Id[]; myUnitIds: Id[]; myBizUnitIds: Id[]; homeUnitId: Id | null; bookmarks: CityBookmark[] }
export interface CityBookmark { id: Id; kind: 'MY_BEGINNINGS' | 'FOLLOW_DISTRICT' | 'USER'; parcelId: Id; unitId: Id | null; label: string; createdTick: Tick }

// ───────── tables (module '10') ─────────
const T = <E>(table: string, idOf: (e: E) => Id, indexes?: { name: string; key(e: E): string | null }[]): TableDef<E> =>
  Object.freeze({ name: `city.${table}`, module: '10', idOf, ...(indexes ? { indexes } : {}) });
const byId = <E extends { id: string }>(e: E): Id => e.id;

/** Row key of a PublicCityState delta: one row per (city, stateVersion). */
export const publicStateKey = (cityId: Id, stateVersion: number): string => `${cityId}:${stateVersion}`;

export const cityTables = Object.freeze({
  city: T<CityRow>('city', byId),
  district: T<DistrictRow>('district', byId, [{ name: 'cityId', key: (e) => e.cityId }]),
  parcel: T<ParcelRow>('parcel', byId, [{ name: 'districtId', key: (e) => e.districtId }]),
  building: T<BuildingRow>('building', byId, [{ name: 'parcelId', key: (e) => e.parcelId }]),
  unit: T<UnitRow>('unit', byId, [{ name: 'buildingId', key: (e) => e.buildingId }]),
  prop: T<PropertyRow>('prop', byId, [{ name: 'ownerId', key: (e) => e.ownerId }]),
  lease: T<LeaseRow>('lease', byId, [{ name: 'propId', key: (e) => e.propId }]),
  manifest: T<CityManifestRow>('manifest', byId, [{ name: 'cityId', key: (e) => e.cityId }]),
  region: T<CityRegionRow>('region', byId, [{ name: 'cityId', key: (e) => e.cityId }]),
  publicState: T<PublicCityState>('public_state', (e) => publicStateKey(e.cityId, e.stateVersion), [{ name: 'cityId', key: (e) => e.cityId }]),
});
export const ALL_CITY_TABLES: TableDef<any>[] = [   // eslint-disable-line @typescript-eslint/no-explicit-any
  cityTables.city, cityTables.district, cityTables.parcel, cityTables.building, cityTables.unit, cityTables.prop, cityTables.lease,
  cityTables.manifest, cityTables.region, cityTables.publicState,
];
