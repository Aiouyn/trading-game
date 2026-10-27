# 10 — Real Estate and Cities

Owner module: 10. Status: complete specification, 2026-10-18.
Scope (00 §1): cities and districts, property economics, mortgages, development, management, the city map, addresses, growth, the procedural city.
Depends on: 02 (clock, RNG streams, `step()`), 03 (ledger, reason codes, taxes, consolidation), 04 (bloc macro state, rates, inflation, credit conditions), 05 (equity prices for listed-company HQ overlays and REIT fundamentals), 06 (commodity indices for construction inputs, FX), 07 (bank lending, capital, credit creation), 08 (property funds, securitization, insurance), 09 (businesses that occupy premises, construction and developer businesses, employment), 13 (zoning disputes, foreclosure law, sanctions), 14 (homes as lifestyle, Prestige, Legacy, home city), 15 (property exchange, contracts, escrow, boards), 16 (aggregate households, named NPC landlords and developers, causal news, politics), 17 (layouts), 19 (storage, protocol, CDN), 22 (names).

**Time conventions in this file.** One tick = 2 game minutes. One game day (GD) = 720 ticks = 1 real hour (L9). One game week = 7 GD. Game month per 4-4-5 (02). Game year (GY) = 364 GD. Rates quoted "per GY" are converted per tick or per GD with `dt`. Real-estate processes run in **P9 real**, staggered per entity by `hash(id) mod 30` across the game hour (00 §5.1). All rent, interest, upkeep, tax and management accruals post at **day close, t = 719** (00 §5.1). Real estate trades 7 days a week (no session closure), but mortgages, permits and court actions on weekends follow the same clock.

---

## §1 Purpose

1. **A quieter wealth-building path with real economics** (old E01–E08). Property gives recurring income, leverage, appreciation and development profit, and needs far less attention than trading, companies or AI. A player can make property their main playstyle and win.
2. **Everything is physical and addressed.** Every property is a real building (or a unit inside one) on a real parcel with a permanent address in a procedural city that is the same on every device. Every business occupies real premises. Every listed company has a headquarters. The city is the economy drawn as a place (old 06 §1, LC01–LC05).
3. **Cities are economies.** Each city has a population, households, jobs, rents, vacancies and a construction pipeline. Rents and values come from demand against supply by district and use. A rate hike, an employer arriving, a district being redeveloped or a credit crunch all move property for explainable reasons on the same tick they happen (V3 §2.4).
4. **Growth is caused.** A city grows when sustained demand exceeds usable supply and someone (NPC developer or player) builds. It declines when demand leaves. The visible city is a projection of this one simulation; it never grows from a decorative score (LC07 adopted, old 06 §7 superseded).
5. **Leverage is how fortunes are made and lost.** Mortgages with LTV covenants, refinancing risk and forced sales tie property to 04 rates and 07 credit; a housing crisis can emerge from rules.
6. **Status with a privacy contract.** Addresses, storefronts, headquarters, homes, recognition and cosmetic flex exist, but the public city is built from an allowlist of public facts and never reveals positions, P&L or presence (L11, LC16).

---

## §2 Entities

Types follow 00 §3.1–3.2. `Id` string. `Tick` integer. `Money` bigint micro-units with a `Ccy`. `Rate` is float64 per GY unless noted. `Area` is integer square metres (m²). Persisted fractions use integer ×1e6 (`Ppm`).

### §2.1 World geography

```ts
type BlocId = 'FDL' | 'EUN' | 'PYN' | 'NKR' | 'SRL';        // 00 §5.7
type Ccy = BlocId;                                          // currency code = bloc code
type DistrictTier = 'working' | 'mid' | 'prime' | 'trophy'; // 00 §5.8
type UseClass = 'RES' | 'OFFICE' | 'RETAIL' | 'INDUSTRIAL' | 'HOSPITALITY' | 'DATACENTER' | 'CIVIC' | 'GREEN';

interface City {
  id: Id;                       // 'cty_' + slug, e.g. 'cty_port_avalon' (authored, stable)
  name: string;                 // string key 'city.port_avalon.name' (L8)
  bloc: BlocId | null;          // null only for Isla Serena
  ccy: Ccy;                     // Isla Serena: 'FDL'
  personalityId: Id;            // §3.19, authored data file
  worldSeedStream: string;      // RNG stream name 'city/<id>' (02)
  openedTick: Tick;             // 0 for launch cities, later for opened cities (§3.2.3)
  unlockRank: 'R0' | 'R2' | 'R6';  // §3.2.4
  districts: Id[];              // 6..10 (Isla Serena: 1)
  // macro state (P2 day close, §3.3)
  population: number;           // game-scale residents (float64)
  households: number;
  hhSize: number;               // persons per household, default per personality
  laborForce: number;
  jobsBySector: Record<SectorId, number>;    // from 09/16 (§3.3)
  medianHhIncomePerGY: Money;   // from 16 hh sector
  cityGdpShare: number;         // share of bloc GDP, sums to 1 per bloc
  propertyTaxRate: Rate;        // PARAM.property_tax_rate_<city>, per GY on assessed value
  stampDutyRate: number;        // PARAM.stamp_duty_rate, default 0.01
  priceIndex: number;           // city house-price index (1.0 at launch), §3.8.4
  stateVersion: number;         // public city state version stamp (§3.26)
  manifestId: Id;               // current public CityManifest (§2.11)
}

interface District {
  id: Id;                       // 'dst_' + city slug + '_' + district slug (authored, stable)
  cityId: Id;
  name: string;                 // string key
  tier: DistrictTier;
  terrainRole: 'waterfront' | 'hill' | 'flat_center' | 'riverside' | 'industrial_shore' | 'island' | 'reclaimed' | 'edge';
  heritage: boolean;            // height and demolition limits (§3.11.7)
  heightCapM: number;           // personality cap for the district
  // per-use market state, updated at day close (§3.4–§3.5)
  market: Record<UseClass, DistrictUseMarket>;
  desirability: DesirabilityState;   // §3.5
  crimeIndex: number;           // 0..100, from 16/12 physical-crime events, 50 = city mean
  capexMomentum91: Money;       // renovation + development capex completed in last 91 GD
  landmarkParcelId: Id;         // exactly one landmark per district (§3.19.6)
  priceIndexByUse: Record<UseClass, number>;  // §3.8.4
}

interface DistrictUseMarket {
  supplyArea: Area;             // usable (occupied + vacant, excludes under-construction and derelict)
  occupiedArea: Area;
  demandArea: number;           // required area this GD (float64), §3.4
  vacancy: number;              // 1 − occupied/supply
  naturalVacancy: number;       // PARAM.natural_vacancy_<use>
  pressure: number;             // EWMA (§3.4.3), 1.0 = balanced
  pressureHighDays: number;     // consecutive GD with pressure > PARAM.growth_pressure_threshold
  pressureLowDays: number;      // consecutive GD with pressure < PARAM.decline_pressure_threshold
  marketRentPerM2PerGD: Money;  // R_{d,u} (§3.6.1), in city ccy
  rentIndex: number;            // 1.0 at launch
  capRate: Rate;                // §3.8.2
  txnCount91: number;           // arm's-length transactions last 91 GD (for comps)
}
```

### §2.2 Parcels, buildings, units, occupants (LC05)

The four layers are separate so that a tower can hold many storefronts, a shop can change owner, a business can occupy space it does not own, and redevelopment can replace a structure while the parcel and address stay.

```ts
interface Parcel {
  id: Id;                       // 'pcl_' + cityId + '_' + persistentFeatureSeq (never contains generator version, LC15)
  cityId: Id; districtId: Id; regionId: Id;     // generation region (§3.19.2)
  polygon: FixedPointPolygon;   // integer centimetres in city plane
  areaM2: Area;
  frontageM: number;
  access: ('ROAD' | 'FOOT' | 'CANAL')[];
  zoning: Zoning;
  landValueV: number;           // generator land-value field sample (§3.19.4), static
  attributes: { waterView: number /*0..1*/; transitDist: number /*m*/; slope: number; cornerLot: boolean; mainAvenue: boolean };
  lifecycle: ParcelLifecycle;   // §3.21
  devPriority: number;          // §3.21.3, recomputed at day close, never accumulated
  ownerId: Id | null;           // land owner: city land authority (npc), NPC landlord, player chr/cmp/fnd, or null for public land
  buildingId: Id | null;
  reservedFor: 'CROWN' | 'LANDMARK' | 'HALL_OF_PATRONS' | 'CIVIC' | 'CORRIDOR' | null;
  address: Address;
}

type ParcelLifecycle = 'PLANNED' | 'SERVICED' | 'BUILDING' | 'OCCUPIED' | 'VACANT' | 'DERELICT' | 'REUSE' | 'STALLED';

interface Zoning {
  allowed: UseClass[];          // uses permitted by right
  maxHeightM: number;           // min(district heightCapM, parcel slope rule)
  maxFar: number;               // floor-area ratio cap
  heritageLocked: boolean;
}

interface Address {
  number: number;               // street number from frontage order
  streetId: Id;                 // persistent road feature id
  streetName: string;           // generated from personality name banks (22), stable
  districtId: Id; cityId: Id;
  unitLabel?: string;           // for units: 'Unit 3B', 'Shop 2'
  display: string;              // '14 Quayside Row, Old Harbor, Port Avalon'
}

interface Building {
  id: Id;                       // 'bld_' + ulid (02 deterministic id)
  parcelId: Id;
  archetypeId: Id;              // personality archetype (§3.19.5)
  propertyType: PropertyType;   // economic type (§3.6.2)
  use: UseClass;                // primary use; mixed buildings list units with their own use
  floors: number; heightM: number;
  grossAreaM2: Area;
  qualityGrade: 'A' | 'B' | 'C';
  builtTick: Tick;              // genesis buildings get a synthetic pre-genesis age (§3.19.7)
  condition: number;            // 0..100, float64, building-level for whole-building owners
  units: Id[];                  // 1 for single-unit types
  visual: BuildingVisual;       // parts and parameters (§3.19.5), public
  physicalState: 'OCCUPIED' | 'VACANT' | 'DERELICT' | 'CONSTRUCTION' | 'STALLED_SHELL';
  ownership: 'WHOLE' | 'STRATA';     // STRATA: units owned separately
  wholeOwnerPropId: Id | null;  // prop id when owned whole
  npcPoolKey: string | null;    // '<districtId>|<use>|<grade>' when NPC-owned and aggregated (§3.0)
}

interface Unit {
  id: Id;                       // 'unt_' + ulid
  buildingId: Id;
  use: UseClass;
  areaM2: Area;
  floor: number;
  storefront: boolean;          // ground-floor street-facing retail/commercial slot
  slotClass: 'CORNER_AVENUE' | 'AVENUE' | 'SIDE_STREET' | 'ALLEY' | 'UPPER' | null;
  propId: Id | null;            // prop id when separately owned (strata) or null if part of a whole-building prop / NPC pool
  occupantId: Id | null;        // tenant: hh-aggregate marker, npc, biz, chr (owner-occupier)
  leaseId: Id | null;
}
```

### §2.3 Property (the balance-sheet entity `prop`)

A `prop` (00 §5.3) is the ownable economic asset. It is either one whole building or one strata unit, or a land parcel, or a unique asset. It has its own balance sheet in 03's chart of accounts (rent receivable, deposits, capitalized improvements, mortgage liability link) and an `ownerId` chain ending at a chr, npc, gov or sys.

```ts
type PropertyType =
  | 'ROOM' | 'STUDIO' | 'APARTMENT' | 'TOWNHOUSE' | 'PENTHOUSE' | 'APARTMENT_BLOCK' | 'VILLA'
  | 'MANSION' | 'ESTATE' | 'OFFICE_FLOOR' | 'OFFICE_TOWER' | 'RETAIL_UNIT' | 'SHOPPING_MALL'
  | 'WAREHOUSE' | 'DATACENTER_SITE' | 'HOTEL' | 'LAND' | 'PRIVATE_ISLAND';

type PropUseMode = 'RENTED' | 'OWNER_OCCUPIED' | 'COMPANY_PREMISES' | 'VACANT_HELD' | 'UNDER_RENOVATION' | 'UNDER_DEVELOPMENT';

interface Property {
  id: Id;                       // 'prop_' + ulid
  type: PropertyType;
  ownerId: Id;                  // chr | cmp | fnd | spv | npc | hh (pooled owner-occupiers) | gov
  ccy: Ccy;
  cityId: Id; districtId: Id;
  parcelId: Id;
  buildingId: Id | null;        // null for LAND
  unitIds: Id[];                // whole building: all units; strata: one unit
  areaM2: Area;
  condition: number;            // 0..100 (§3.7.1)
  qualityGrade: 'A' | 'B' | 'C';
  amenityMult: number;          // §3.6.3, derived from parcel attributes and grade, recomputed on change
  useMode: PropUseMode;
  useModeChangedTick: Tick;     // owner-occupied switch cooldown (§3.14)
  managerContractId: Id | null; // §2.8
  policyId: Id;                 // ManagementPolicy (§2.8); default policy if self-managed
  groupId: Id | null;           // PortfolioGroup (§2.8)
  mortgageIds: Id[];            // at most PARAM.max_liens_per_property = 2 (first + second lien)
  lastAppraisal: Appraisal;
  costBasis: Money;             // purchase price + capitalized improvements (for 03 capital-gains tax)
  acquiredTick: Tick;
  insurancePolicyId: Id | null; // 08
  listingId: Id | null;
  heldByCourt: boolean;         // 13 asset freeze / lis pendens
  publicRecord: PublicPropertyRecord;  // what the public city may show (§3.24)
  uniqueAssetId: Id | null;     // islands, landmark-name rights (§2.10)
}

interface Appraisal {
  tick: Tick;
  valueIncome: Money;           // V_inc (§3.8.3)
  valueComp: Money;             // V_comp
  weightIncome: number;
  value: Money;                 // blended appraised value
  priceIndexAtAppraisal: number;// district price index for the property's use at appraisal tick
  appraiser: 'SYSTEM' | 'NPC_FIRM' | 'PLAYER_FIRM';  // player appraisal firms (09) cannot appraise related parties (§3.9.6)
}
```

### §2.4 Leases and tenants

```ts
type TenantKind = 'HH_AGGREGATE' | 'NPC_FIRM' | 'NAMED_NPC' | 'PLAYER_BUSINESS' | 'PLAYER_CHARACTER' | 'PLAYER_COMPANY';

interface Lease {
  id: Id;                       // 'lse_' + ulid
  propId: Id; unitIds: Id[];
  landlordId: Id; tenantId: Id; tenantKind: TenantKind;
  use: UseClass;
  rentPerGD: Money;             // contractual rent, accrues at day close
  revenueSharePct: number;      // HOTEL and RETAIL in malls: % of tenant revenue on top of base (0 otherwise)
  startTick: Tick; endTick: Tick;          // term (§3.6.5)
  indexation: 'CPI' | 'FIXED';  // CPI: rent × (1+π_city) at each lease anniversary (04 inflation)
  depositHeld: Money;           // in escrow (15 Clearing House), PARAM.lease_deposit_months
  breakFeeGD: number;           // rent-days owed on early break
  status: 'ACTIVE' | 'NOTICE' | 'ARREARS' | 'ENDED' | 'EVICTING';
  arrearsGD: number;
  relatedParty: boolean;        // landlord and tenant share an owner chain (03 consolidation, §3.15)
  contractId: Id | null;        // when written through 15's contract engine (player tenants)
}
```

### §2.5 Mortgages

Mortgages are loans in 07's loan book. 07 owns the loan record, bank capital and funding; 10 owns the property-secured product rules (eligibility, LTV, covenants, cure, foreclosure). The fields below are the property-specific part, stored on 07's `Loan` as an extension.

```ts
type MortgageProduct = 'RES_FIXED' | 'RES_FLOAT' | 'COMM_FIXED' | 'COMM_FLOAT' | 'CONSTRUCTION' | 'BRIDGE' | 'SECOND_LIEN';

interface MortgageExt {
  loanId: Id;                   // 07 Loan id 'lon_' + ulid
  propId: Id;
  lenderId: Id;                 // bnk (NPC or player bank, 07)
  borrowerId: Id;               // prop owner
  product: MortgageProduct;
  lienRank: 1 | 2;
  principalOriginal: Money; balance: Money; ccy: Ccy;
  rateFixed: Rate | null;       // fixed coupon per GY
  spread: Rate;                 // over reference (§3.10.3)
  refRate: 'BLOC_10Y' | 'POLICY';   // 04
  resetEveryGD: number;         // floating reset period, default 7
  amortization: 'ANNUITY' | 'INTEREST_ONLY';
  termGD: number;               // 5, 10, 25 GY options × 364
  paymentEveryGD: number;       // 7 (game week)
  nextPaymentTick: Tick;
  maxLtvCovenant: number;       // origination max + PARAM.ltv_covenant_buffer
  minDscrCovenant: number | null;  // income property only
  recourse: 'FULL' | 'LIMITED' | 'NON_RECOURSE';   // §3.10.6
  status: 'CURRENT' | 'LATE' | 'COVENANT_BREACH' | 'CURE' | 'FORECLOSING' | 'PAID' | 'WRITTEN_OFF';
  cureDeadlineTick: Tick | null;
  prepayPenaltyPct: number;     // fixed only, declining (§3.10.7)
  originatedTick: Tick;
  poolId: Id | null;            // 08 securitization pool if sold
}
```

### §2.6 Development projects

```ts
type DevPhase = 'LAND' | 'PERMIT' | 'SITE_PREP' | 'STRUCTURE' | 'FIT_OUT' | 'LEASE_UP' | 'COMPLETE' | 'PAUSED' | 'STALLED' | 'CANCELLED';

interface DevelopmentProject {
  id: Id;                       // 'dev_' + ulid
  developerId: Id;              // chr | cmp | npc developer
  parcelIds: Id[];              // assembled parcels, contiguous, one block
  cityId: Id; districtId: Id;
  kind: 'NEW_BUILD' | 'CONVERSION' | 'REDEVELOPMENT' | 'RENOVATION_MAJOR';
  targetType: PropertyType;
  targetUse: UseClass[];        // mixed use allowed (e.g. RETAIL ground + RES above)
  grossAreaM2: Area; floors: number; heightM: number;
  archetypeId: Id;              // chosen from personality archetypes allowed for the zoning (§3.19.5)
  facadeKitId: Id | null;       // cosmetic (§3.25)
  phase: DevPhase;
  phaseStartTick: Tick; phaseEndTick: Tick;
  budget: DevBudget;
  spent: Money;
  contractor: { kind: 'NPC_BUDGET' | 'NPC_STANDARD' | 'NPC_PREMIUM' | 'PLAYER'; bizId: Id | null; feePct: number; overrunSigma: number; delayProb: number };
  permitId: Id | null;
  financing: { equity: Money; constructionLoanId: Id | null; presaleDeposits: Money };
  presales: Presale[];          // strata residential only
  overrunsRealized: number[];   // per phase realized cost multiplier (SEALED until phase end, then PARTIES)
  delaysRealizedTicks: number[];
  resultBuildingId: Id | null;
}

interface DevBudget { land: Money; hard: Money; soft: Money; contractorFee: Money; contingency: Money; financingCostEst: Money; total: Money; projectedValue: Money }
interface Presale { unitPlanId: string; buyerId: Id; price: Money; deposit: Money; status: 'ACTIVE' | 'CLOSED' | 'REFUNDED' }

interface Permit {
  id: Id; projectId: Id; cityId: Id;
  kind: 'BY_RIGHT' | 'VARIANCE' | 'REZONING' | 'DEMOLITION' | 'HERITAGE';
  feePaid: Money; submittedTick: Tick; decisionTick: Tick;
  pApprove: number;             // shown to player before submission (legibility)
  status: 'QUEUED' | 'REVIEW' | 'APPROVED' | 'REJECTED' | 'APPEALED';
  rejectionReason?: 'HERITAGE' | 'ACCESS' | 'HEIGHT' | 'USE' | 'OBJECTION' | 'CAPACITY';
}
```

### §2.7 Listings, offers, auctions

```ts
interface Listing {
  id: Id;                       // 'lst_' + ulid
  propId: Id; sellerId: Id;
  askPrice: Money; ccy: Ccy;
  minAcceptable: Money | null;  // private auto-accept floor
  listedTick: Tick;
  venue: 'OPEN_MARKET' | 'P2P_EXCHANGE' | 'AUCTION' | 'ESTATE_SALE' | 'FORECLOSURE';
  status: 'ACTIVE' | 'UNDER_OFFER' | 'SOLD' | 'WITHDRAWN' | 'EXPIRED';
  npcHazardPerGH: number;       // §3.9.2 (SEALED to seller as an estimate band only)
}

interface Offer { id: Id; listingId: Id; buyerId: Id; price: Money; financingLoanQuoteId: Id | null; expiresTick: Tick; status: 'OPEN' | 'ACCEPTED' | 'REJECTED' | 'LAPSED' }
```

### §2.8 Management

```ts
interface ManagementPolicy {
  id: Id; ownerId: Id;
  rentTarget: 'MARKET' | 'MARKET_PLUS' | 'MARKET_MINUS' | 'MAX_OCCUPANCY';  // ask = market × {1.00, 1.06, 0.94, 0.90}
  tenantScreening: 'STRICT' | 'NORMAL' | 'LENIENT';   // §3.6.6
  maintenanceLevel: number;     // f in [0, 1.5], share of required maintenance funded (§3.7.1)
  capexAutoApproveLimit: Money; // manager may approve repairs up to this per event
  renewalPolicy: 'RENEW_MARKET' | 'RENEW_HOLD' | 'NO_RENEW';
  arrearsAction: 'PATIENT' | 'STANDARD' | 'FAST_EVICT';  // eviction after 14 / 7 / 3 GD arrears
  insuranceAuto: boolean;       // keep 08 cover renewed
}

interface ManagerContract {
  id: Id; propIds: Id[];        // or group
  managerKind: 'SELF' | 'NPC_AGENCY' | 'PLAYER_AGENCY' | 'AI_MODEL';
  managerRef: Id | null;        // biz id of a 09 property management agency, or an 11 deployment id
  feePctOfCollectedRent: number;// NPC 0.08 (old 01), player agency sets its own (0.03..0.15)
  skill: number;                // 1..5 stars; affects let speed, arrears recovery, maintenance efficiency (§3.13)
  exceptionThreshold: Money;    // events above this are surfaced to the owner (E03)
  startTick: Tick; noticeGD: number;
}

interface PortfolioGroup { id: Id; ownerId: Id; name: string; propIds: Id[]; policyId: Id; managerContractId: Id | null }  // E06
```

### §2.9 Household and firm demand (city-level, consumed from 16 and 09)

10 does not simulate individual NPC tenants. Residential demand is from the city's aggregate household sector `hh` (00 §5.3, owned by 16 for income and consumption; 10 owns counts, location choice and housing). Commercial and industrial demand is from employment (09 for player and named businesses, 16 for the aggregate firm sector `frm`).

```ts
interface CityDemandInputs {          // assembled at P2 day close (§3.3)
  cityId: Id;
  employmentBySectorUse: Record<UseClass, number>;   // jobs needing that use: OFFICE, RETAIL, INDUSTRIAL, HOSPITALITY
  retailSpendIndex: number;           // 16 hh consumption, 1.0 at launch
  tourismIndex: number;               // 16 / 04, 1.0 at launch
  dcPowerDemandMW: number;            // 11 data-center siting demand (§3.4.2)
  pendingEmploymentDeltas: EmploymentDelta[];        // E05 events, applied on their effectiveTick
}

interface EmploymentDelta { id: Id; cityId: Id; districtId: Id | null; sector: SectorId; jobs: number; use: UseClass; effectiveTick: Tick; cause: Id /* 09/16 event id */ }
```

### §2.10 Unique and civic assets

```ts
interface UniqueAsset {
  id: Id;                       // 'unq_' + slug, e.g. 'unq_serena_cay_03'
  kind: 'PRIVATE_ISLAND' | 'LANDMARK_NAME_RIGHT' | 'CROWN_PARCEL' | 'HALL_OF_PATRONS_SEAT' | 'PUBLIC_SPACE_SPONSORSHIP';
  cityId: Id; parcelId: Id | null;
  holderId: Id | null;
  termEndTick: Tick | null;     // name rights and sponsorships are time-limited
  reserve: Money | null;
  publicLabel: string | null;   // moderated text (15 moderation)
}

interface HallOfPatronsSeat { cityId: Id; position: number /* 1..12 */; chrId: Id | null; snapshotTick: Tick; boardBand: 'TOP1' | 'TOP3' | 'TOP12' }
```

### §2.11 The public city records (procedural city, LC15)

```ts
interface CityManifest {
  id: Id; worldId: Id; cityId: Id;
  macroPlanVersion: string;     // generator package id for the macro plan
  stateVersion: number;         // increments when public state changes
  publicSnapshotTick: Tick;     // day-close tick the public state reflects
  regions: { regionId: Id; generatorPackage: string; contentHash: string }[];
  chunks: { chunkKey: string; contentHash: string; url: string }[];
  schemaVersion: number;
}

interface CityRegion { id: Id; cityId: Id; bounds: FixedPointRect; boundaryContracts: BoundaryContract[]; generatorPackage: string; generatedTick: Tick; status: 'RESERVED' | 'GENERATED' }
interface BoundaryContract { edge: 'N' | 'E' | 'S' | 'W'; crossings: { at: FixedPointCoord; streetClass: StreetClass; widthCm: number; elevationCm: number }[]; waterEdges: FixedPointPolyline[] }

interface PublicCityState {            // allowlisted public payload (§3.24)
  cityId: Id; stateVersion: number; baseVersion: number | null;
  parcelStates: { parcelId: Id; lifecycle: ParcelLifecycle; heightLevel: number; archetypeId: Id }[];  // delta
  bindings: PublicBinding[];
  transitions: CityTransition[];
}

type PublicBinding =
  | { kind: 'HQ'; parcelId: Id; companyId: Id }
  | { kind: 'STOREFRONT'; unitId: Id; signText: string; sectorAwning: SectorId; status: 'OPEN' | 'CLOSED' | 'FIT_OUT' }
  | { kind: 'OWNERSHIP_PUBLIC'; propId: Id; ownerDisplay: string }          // only where the owner opted in (§3.24)
  | { kind: 'HALL_SEAT'; cityId: Id; position: number; displayName: string | null; band: string }
  | { kind: 'LANDMARK_NAME'; parcelId: Id; label: string }
  | { kind: 'PLAQUE'; parcelId: Id; text: string; chrDisplay: string }
  | { kind: 'COMPANY_BUILDING'; parcelId: Id; companyId: Id; facadeKitId: Id | null };

interface CityTransition { id: Id; parcelId: Id; cause: 'DEVELOPMENT_COMPLETE' | 'CONSTRUCTION_START' | 'CONVERSION' | 'VACANCY' | 'DERELICT' | 'REUSE' | 'STOREFRONT_OPEN' | 'STOREFRONT_CLOSE' | 'HQ_RELOCATION' | 'DISTRICT_EVENT'; fromState: string; toState: string; publishedTick: Tick; sourceEventId: Id }

interface PrivateCityOverlay { chrId: Id; myPropIds: Id[]; myUnitIds: Id[]; myBizUnitIds: Id[]; homeUnitId: Id | null; bookmarks: CityBookmark[] }   // never in public artifacts
interface CityBookmark { id: Id; kind: 'MY_BEGINNINGS' | 'FOLLOW_DISTRICT' | 'USER'; parcelId: Id; unitId: Id | null; label: string; createdTick: Tick }
```

`FixedPointCoord` is `{ x: number; z: number }` in integer centimetres; `FixedPointPolygon` is an array of them in counter-clockwise order; `StreetClass` is `'HIGHWAY' | 'ARTERIAL' | 'COLLECTOR' | 'LOCAL' | 'ALLEY' | 'PEDESTRIAN' | 'CANAL' | 'RAIL'`.

---

## §3 Rules and formulas

### §3.0 Aggregation rule (W11)

The world has roughly 1.5M housing units and 60k–90k commercial units at launch (§3.2.2). Only buildings and units that are **bound** carry full per-entity economic simulation: any `prop` owned by a player, player company, player fund or bank-foreclosed asset, any listed unit, any HQ, any storefront slot occupied by a 09 business, any project under development, and any unique asset. Every other building belongs to an **NPC pool** keyed `<districtId>|<use>|<grade>`. A pool holds totals (supply area, occupied area, rent roll, condition mean, owner mix by NPC landlord) and is simulated exactly like a property but in aggregate. When a pooled building is bought, listed, leased by a business or redeveloped, it is **carved out**: a `prop` is created with the pool's mean condition (± deterministic per-building jitter `N(0, 6)` clamped, from stream `prop/<buildingId>`), its share of pool rent roll and tenants, and the pool totals are reduced by exactly the carved amounts. Carving never creates or destroys area, tenants or money. Selling back to an NPC buyer re-pools the building after its leases expire or immediately if vacant.

### §3.1 Phases and schedule

| What | Phase | When |
|---|---|---|
| Intent validation for `prop.*`, `city.*` | P1 | every tick |
| City macro step (population, households, jobs, demand inputs) | P2 calendar | day close t = 719, after 04's macro step |
| District market step (demand, supply, vacancy, pressure, rent index, cap rate, price index) | P2 calendar | day close, after the city macro step |
| Property operations (letting, arrears, condition, manager actions, exceptions) | P9 real | once per game hour per prop, offset `hash(propId) mod 30` |
| Accruals (rent, interest, upkeep, tax, management fee, insurance premium) | P9 real at t = 719 → postings in P13 | day close |
| Listing hazard draws (NPC buyers) | P9 real | once per game hour per listing |
| Development phase progress, overrun and delay draws | P9 real | once per game hour per project; draws at phase boundaries |
| Mortgage payments, covenant tests | P9 real | payment ticks (weekly) and weekly appraisal ticks |
| Appraisals | P9 real | every 7 GD per prop, staggered by `hash(propId) mod 7`, plus on trigger events |
| City lifecycle, growth starts, decline, publication | P14 emit (state) and an off-tick worker (geometry) | day close; geometry never inside the tick (§3.26) |

RNG: every draw uses 02's named streams `re/<cityId>/<purpose>/<entityId>` so replay is exact.

### §3.2 World geography

#### §3.2.1 Launch cities

Fifteen cities, three per bloc, plus Isla Serena (00 §5.7). Names are proposals; 22 is authoritative for every name. If 22's names differ, 22's names win and the personality parameters below map to the city in the same bloc slot. `DEFAULT (Mathis may override)`.

| Bloc | Slot | City | Role and geography | Launch pop (game scale) | Districts | Unlock |
|---|---|---|---|---|---|---|
| FDL | 1 | **Port Avalon** | Harbor capital, crescent bay, the exchange | 240,000 | 8 | R0 |
| FDL | 2 | **Lakemont** | Inland lake city, tech campuses, lakefront towers | 180,000 | 7 | R0 |
| FDL | 3 | **Redmesa** | Sunbelt desert city, energy, data centers, sprawl | 150,000 | 7 | R0 |
| EUN | 1 | **Meridia** | Lagoon, canals, banks and grand hotels | 200,000 | 8 | R2 |
| EUN | 2 | **Valcourt** | River city of old industry and luxury ateliers | 150,000 | 7 | R2 |
| EUN | 3 | **Belmara** | Alpine lakeside resort and private banking | 90,000 | 6 | R2 |
| PYN | 1 | **Kaiyo City** | Dense neon bay city, elevated rail loop | 320,000 | 8 | R2 |
| PYN | 2 | **Tessan** | Chip and manufacturing port on a delta | 210,000 | 7 | R2 |
| PYN | 3 | **Mirako** | Terraced hill city, temples, tourism | 110,000 | 6 | R2 |
| NKR | 1 | **Nordhaven City** | Fjord city of design and quiet wealth | 120,000 | 7 | R2 |
| NKR | 2 | **Skarvik** | Energy port, offshore industry, rugged islands | 80,000 | 6 | R2 |
| NKR | 3 | **Vintra** | Inland lake and hydro valley, cool-climate data centers | 70,000 | 6 | R2 |
| SRL | 1 | **Sundara Coast** | Beach boom strip, marina, volatile growth | 190,000 | 7 | R2 |
| SRL | 2 | **Cobreval** | Mining and copper port with a hillside old town | 140,000 | 7 | R2 |
| SRL | 3 | **Alta Verde** | Highland capital, agriculture and government | 160,000 | 7 | R2 |
| — | — | **Isla Serena** | Trophy archipelago, 9 islands, FDL-denominated | 0 (estates only) | 1 (The Cays) | view R0, own R6 |

Game-scale population is the simulated resident count. It is smaller than a real metropolis by design so that one generated building represents a believable number of people (§3.19.7). Displays show the game-scale number.

#### §3.2.2 Districts

Every city has 6 to 10 districts, each with one tier. Tier mix rule: at least 1 working, 2 mid, 1 prime per city; trophy only in the bloc capital (slot 1) and in Belmara and Lakemont. Launch district list (names proposed for 22, `DEFAULT`):

| City | Districts (tier) |
|---|---|
| Port Avalon | Eastside Docks (working), Industrial Basin (working), Old Harbor (mid), Riverside Lofts (mid), Midtown (mid), Financial Mile (prime, CBD), Glasshill (prime), Summit Estates on Gilt Hill (trophy) |
| Lakemont | Rail Yards (working), Northshore (mid), Campus Quarter (mid), Old Town (mid), Lakefront (prime, CBD), Cedar Point (prime), The Bluffs (trophy) |
| Redmesa | Powerline Flats (working), Depot District (working), Mesa Heights (mid), Sunwell (mid), Canyon Row (mid), Central Plaza (prime, CBD), Saguaro Hills (prime) |
| Meridia | Arsenal Yards (working), Lido Strand (mid), Mainland Gate (mid), Business District (prime, CBD), San Telmo Islands (mid, heritage), Rialto Court (prime, heritage), Grand Canal (trophy, heritage), New Lagoon (mid, reclaimed) |
| Valcourt | Foundry Bank (working), Lock Quarter (mid), Cathedral Rise (mid), Atelier Row (prime), Bourse Square (prime, CBD), Southern Mills (working), Parkside (mid) |
| Belmara | Station Quarter (mid), Old Spa (mid, heritage), Lakeside Promenade (prime, CBD), Vineyard Slopes (prime), Pinecrest (trophy), Valley Works (working) |
| Kaiyo City | Harbor Freight (working), Neon Ward (mid), Delta Markets (mid), Loop Central (prime, CBD), Reclaim Grid (mid, reclaimed), Shinbashi Heights (trophy), Riverbend (mid), Shiomi Docks (working) |
| Tessan | Fab Island (working), Delta Wharf (working), Market Bridge (mid), Old Ward (mid, heritage), Tower Bund (prime, CBD), Hillgarden (prime), Canal Homes (mid) |
| Mirako | Terrace Steps (mid, heritage), Temple Hill (prime, heritage), Riverside Arcades (mid), Station Center (prime, CBD), Kiln Yard (working), Maple Slopes (mid) |
| Nordhaven City | Harbor Works (working), Gamla Town (mid, heritage), Terrace Row (mid), Fjord Quarter (prime), Opera Quay (prime, CBD), Birch Hills (mid), Isle Mouth (working) |
| Skarvik | Rig Yards (working), Herring Quay (mid, heritage), Rockside (mid), Harbor Exchange (prime, CBD), Skerries (prime), Northfield (working) |
| Vintra | Turbine Valley (working), Lakeside (mid), Old Mill (mid), Vintra Center (prime, CBD), Spruce Ridge (prime), Hydro Flats (working) |
| Sundara Coast | Sunset Strip (working), Coastal Spine (mid), Hill Barrios (working), Marina Quarter (mid), Palm Bay (prime), Ocean Towers (prime, CBD), Cliffside (mid) |
| Cobreval | Smelter Flats (working), Ore Docks (working), Old Town Hill (mid, heritage), Plaza Mayor (prime, CBD), Copper Terraces (mid), Mirador (prime), Riverside Colonia (mid) |
| Alta Verde | Market Valley (working), Government Hill (prime, CBD), Colonial Center (mid, heritage), Coffee Slopes (mid), Highland Park (prime), Southern Ring (working), University Mesa (mid) |
| Isla Serena | The Cays (trophy) |

This keeps every district name used by the old vision (01 §3.8, 04 §6.1, 06 §5) and adds the rest.

#### §3.2.3 Opening new cities

1. A new city opens each time `N_a` (activity-weighted players, 15) crosses the next multiple of `PARAM.new_city_na_step = 4,000` above its launch value (old 01 §14.1, 02 §2.1), checked at each chapter's week boundary.
2. Bloc choice: the bloc with the highest `N_a_home / cities_in_bloc` ratio (players with a home city in that bloc per city), ties broken by lower bloc id order FDL, EUN, PYN, NKR, SRL.
3. The city uses the next personality in 22's queue for that bloc. A personality must have a distinct geographic constraint (LC04); mixing palettes alone is not allowed.
4. Launch population of a new city = 60% of the bloc's mean launch city population; its NPC economy gets a fresh demand pool; its land authority lists `PARAM.new_city_land_auction_parcels = 40` serviced parcels in the first 28 GD; NPC landlords list at 2× the normal listing rate for 28 GD ("frontier moment").
5. A new coastal city adds one trophy island to Isla Serena's queue (§3.18) until Isla Serena holds `PARAM.serena_island_max = 15`.
6. Caps: at most 12 cities per bloc and `PARAM.max_cities = 60` world-wide. A Wire event "A new city opens" is emitted 7 GD before opening, with the name and bloc, so everyone can prepare.

#### §3.2.4 Access and home city

- **Home city.** At sign-up the player picks one of the 3 FDL cities (00 §5.9). It sets the city board cut, Hall of Patrons eligibility and the default City view. Change: once per chapter, fee `PARAM.home_city_change_fee_real = $25,000` real (× MSI; owned by 14 §3.1.5, sink `ACCT_HOME_CITY_FEE`; ruling in 24). A newly opened city allows free moves into it for its first 14 GD. The home city is an identity setting only; it does not reveal a residence (LC10). A player's home **property** (owner-occupied) can be in any city.
- **City access by rank.** Property and business purchases in the home bloc's cities: R0. Other blocs' cities: R2 (Owner). Isla Serena: viewing open to everyone; free-zone company domicile (03 §3.12.2) and any non-island asset from R4 (14 §3.2.6); the islands themselves R6 (Dynasty) (ruling in 24). `DEFAULT (Mathis may override)`; this resolves the old 06 unlock list for 15 cities.
- **Cross-bloc settlement delay.** Buying property or opening premises in a bloc other than the player's home bloc settles `PARAM.cross_bloc_settle_delay_ticks = 720` (1 GD) later, unless the player owns a light jet (home bloc) or long-range jet (any bloc) from 14 (old 04 §7.5 flag, adopted).
- **Currency.** Prices, rents and mortgages are in the city currency. Net worth converts at 06's FX mid (03).

### §3.3 City macro step (day close)

Run per city at P2 after 04's bloc macro step. Inputs from 04: bloc GDP growth `g_b` (per GY), inflation `π_b`, unemployment `u_b`, policy rate `i_b`, 10-year yield `y10_b`, credit conditions `c_b ∈ [−1, 1]` (−1 tight), fear index `F` (0..100). From 16: household income index and consumption. From 09: employment by city and sector.

1. **Jobs.** `jobs_c = Σ_sector jobsBySector_c`. Each sector maps to a use class: office sectors (finance, tech, media, professional services, government) → OFFICE; retail and food → RETAIL; manufacturing, logistics, energy, mining → INDUSTRIAL; tourism → HOSPITALITY. Jobs come from 09 (every player and named business reports `staff` and its `cityId`) plus 16's aggregate `frm` sector employment for the city, which 16 sizes so the city's employment rate starts at `1 − u_b`. Apply `EmploymentDelta`s whose `effectiveTick` has passed.
2. **Labor force and migration.**
   ```
   laborForce_c = population_c · PARAM.lf_share (0.50)
   jobGap_c     = jobs_c / laborForce_c − (1 − u_b)            // >0 means labor shortage
   affordability_c = medianHhIncome_c / (12 · medianRes2BedRent_c · 30.33)   // income ÷ annualized rent of a 75 m² mid unit
   attract_c    = 1.5·jobGap_c + 0.4·ln(affordability_c / affordability_bloc_mean) + 0.002·(50 − crimeIndex_city_mean)
   migration_c  = PARAM.migration_speed (0.6 per GY) · (attract_c − mean_bloc(attract))
   population_c ← population_c · (1 + (PARAM.natural_growth (0.004) + 0.3·g_b + migration_c) / 364)
   ```
   Clamp daily population change to ±0.05%. Migration between blocs is not modelled (each bloc's population is closed); within a bloc, migration sums to zero (the mean is subtracted).
3. **Households.** `households_c = population_c / hhSize_c` (hhSize per personality, 1.9–2.6).
4. **City GDP share.** `cityGdpShare_c ∝ jobs_c · productivity_personality_c`, normalised per bloc; 04 uses it to apportion bloc GDP for city-level indicators.
5. Publish `CityDemandInputs` for §3.4.

### §3.4 District demand, supply, vacancy and pressure

#### §3.4.1 Residential demand (household location choice)

Households split across districts by a nested choice: first tier by income, then district within tier by desirability and rent.

```
tierShare_c(tier)   = personality base shares (working 0.40, mid 0.40, prime 0.17, trophy 0.03 when the city has trophy; else trophy's share goes to prime)
                      shifted by income: shares tilt toward higher tiers by 0.5·ln(medianHhIncome_c / medianHhIncome_launch_c) per tier step, renormalised
U_d                 = 1.0·D_d − 1.2·ln(R_{d,RES} / R̄_{tier,RES}) + 0.5·ln(availableArea_d / meanAvailableArea_tier)
share_d|tier        = exp(U_d) / Σ_{d' in tier} exp(U_d')
hhDemand_d          = households_c · tierShare_c(tier_d) · share_d|tier
demandArea_{d,RES}  = hhDemand_d · PARAM.m2_per_household[tier_d]    // working 55, mid 70, prime 110, trophy 260 m²
```

`D_d` is the desirability score (§3.5), `R̄` the tier mean rent. Households that cannot be housed in their tier spill to the adjacent lower tier (overflow demand), which is what makes working districts tighten when prime districts are full.

#### §3.4.2 Commercial, industrial, hospitality and data-center demand

```
demandArea_{d,OFFICE}     = jobs_{c,OFFICE} · PARAM.m2_per_office_job (14) · officeShare_d
demandArea_{d,RETAIL}     = population_c · PARAM.retail_m2_per_capita (1.4) · retailSpendIndex_c · retailShare_d
demandArea_{d,INDUSTRIAL} = jobs_{c,INDUSTRIAL} · PARAM.m2_per_industrial_job (55) · industrialShare_d
demandArea_{d,HOSPITALITY}= PARAM.hotel_m2_per_capita (0.35) · population_c · tourismIndex_c · hospitalityShare_d
demandMW_{d,DATACENTER}   = Σ data-center clusters (11) sited or seeking sites in d
```

District shares for non-residential uses use the same logit form as households, with use-specific weights: OFFICE `U = 1.2·D_d + 2.0·cbd_d − 1.0·ln(R/R̄)` (`cbd_d` = 1 for the CBD district, 0.4 for other prime, 0 else); RETAIL `U = 0.8·D_d + 0.8·ln(hhDemand_d/mean) − 1.0·ln(R/R̄)`; INDUSTRIAL `U = 1.0·port_d + 0.8·ln(landCheapness) − 0.6·ln(R/R̄)`; HOSPITALITY `U = 0.8·D_d + 0.6·waterfront_d + 0.5·landmarks_d − 0.8·ln(R/R̄)`.

Data-center sites are not leased by area. A DATACENTER_SITE is a parcel with a power hookup capacity in MW (§3.6.2). Demand is the count of clusters (11 §2) requesting a site; supply is serviced industrial parcels with grid capacity. The city's grid capacity per district is `PARAM.grid_mw_<district>` and rises only when a power-utility business (09) or the city invests (§6.3).

#### §3.4.3 Supply, vacancy, pressure

```
supply_{d,u}    = Σ usable area of buildings with use u in d (OCCUPIED or VACANT lifecycle; excludes BUILDING, STALLED, DERELICT)
occupied_{d,u}  = min(demandArea_{d,u}, supply_{d,u} · (1 − PARAM.frictional_vacancy (0.02)))    for pooled stock,
                  plus bound units actually leased (§3.6.4); bound units and pools compete in the same letting model
vacancy_{d,u}   = 1 − occupied / supply
demandRatio     = demandArea / max(supply · (1 − naturalVacancy_u), PARAM.capacity_floor_m2 (500))
pressure_t      = 0.90 · pressure_{t−1} + 0.10 · clamp(demandRatio, 0.5, 1.5)          (LC07, per GD)
```

Natural vacancy by use: RES 0.05, OFFICE 0.08, RETAIL 0.06, INDUSTRIAL 0.07, HOSPITALITY 0.10 (`PARAM.natural_vacancy_<use>`).
Counters: `pressureHighDays` increments while `pressure > PARAM.growth_pressure_threshold (1.10)`, else resets; `pressureLowDays` increments while `pressure < PARAM.decline_pressure_threshold (0.85)`, else resets.

### §3.5 Desirability

```
D_d = 0.30·jobsAccess_d + 0.20·services_d + 0.15·transit_d + 0.15·environment_d
    + 0.10·safety_d + 0.05·prestige_d + 0.05·momentum_d + tierOffset_d        (each term in [−1, 1])
jobsAccess_d  = tanh( 2·(jobsWithinCity_weighted_d / mean_d − 1) )        // jobs in d and adjacent districts, adjacency weight 0.5
services_d    = tanh( 2·(retailOccupiedArea_d / hhDemand_d) / cityMeanRatio − 2 )
transit_d     = 1 − 2·clamp(meanTransitDist_d / 1500 m, 0, 1)             // static from the generator, +0.3 after a transit improvement event
environment_d = 2·(0.5·meanWaterView_d + 0.3·parkShare_d + 0.2·(1 − slopePenalty_d)) − 1
safety_d      = (50 − crimeIndex_d) / 50
prestige_d    = tanh( (landmarks_d + 0.5·trophyAssets_d) / 3 )
momentum_d    = min(1, (capexMomentum91_d / districtValue_d) / PARAM.momentum_cap_ratio (0.04))    // gentrification, bounded
tierOffset    = working −0.4, mid 0, prime +0.5, trophy +0.9
```

- **Gentrification is bounded** (old 01 §3.8 kept, made safe): `momentum_d` saturates when completed capex in 91 GD reaches 4% of district value, so its contribution is at most +0.05 of `D_d`, worth roughly +6% rent over time. Capex counts only completed, arm's-length work (renovations and developments with contractor cost actually paid); related-party contractor payments count at cost, not at the price paid.
- **District events (E05).** 09 and 16 emit `EmploymentDelta`s (a hospital expansion, a plant closure), `TransitImprovement` (+0.3 transit for named districts, 16 politics or city investment), crime events (16, 12 physical ops), and amenity events (a new park from a sponsorship, a stadium). Each shows on the Wire with its cause (16 causal news) and feeds the terms above on its effective tick. Consequences propagate on their own schedule: jobs change at once, households migrate over weeks (§3.3), rents follow pressure (§3.6.1), developers respond after the pressure counters run (§3.21).

### §3.6 Rent and letting

#### §3.6.1 Market rent index

Per district and use, at day close:

```
ΔlnR_{d,u} = π_city/364 + PARAM.rent_pressure_k (0.8) · (pressure_{d,u} − 1) / 364
           + PARAM.rent_desirability_k (0.15) · (D_d − D_d,90-day-ago) / 90
ΔlnR clamped to ±PARAM.rent_daily_move_cap (0.005)
R_{d,u}(t+1) = R_{d,u}(t) · exp(ΔlnR)
```

`π_city = π_b` (bloc inflation, 04). Launch base rents per m² per GD, Port Avalon (FDL), `PARAM.base_rent_<use>_<tier>`:

| Use \ tier | working | mid | prime | trophy |
|---|---|---|---|---|
| RES | $0.30 | $0.55 | $1.60 | $4.00 |
| OFFICE | $0.25 | $0.50 | $1.20 | — |
| RETAIL | $0.45 | $0.80 | $2.00 | $3.50 |
| INDUSTRIAL | $0.12 | $0.16 | — | — |
| HOSPITALITY | $0.35 | $0.60 | $1.40 | $3.00 |

Other cities: `base × cityRentMult_personality` (Kaiyo 1.25, Meridia 1.10, Lakemont 1.05, Nordhaven 1.05, Belmara 1.20, Sundara 0.85, Valcourt 0.90, Tessan 0.95, Mirako 0.80, Skarvik 0.85, Vintra 0.75, Redmesa 0.75, Cobreval 0.65, Alta Verde 0.60; Port Avalon 1.00), in local currency at launch FX parity (06 sets launch FX so a $ figure means the same purchasing power, `DEFAULT`).

#### §3.6.2 Property types

| Type | Use | Typical area | Districts | Units | Rank to buy | Notes |
|---|---|---|---|---|---|---|
| ROOM | RES | 18 m² | working, mid | rent-only | — | the R0 rented room (14); not sellable |
| STUDIO | RES | 30 | working, mid | 1 | R1 | strata unit |
| APARTMENT | RES | 75 | all but trophy | 1 | R1 | strata unit |
| TOWNHOUSE | RES | 140 | mid, prime | 1 | R1 | whole building |
| PENTHOUSE | RES | 400 | prime | 1 | R3 | top-floor strata unit of a tower |
| APARTMENT_BLOCK | RES | 1,560 (24 × 65) | working, mid, prime | 24 | R2 | whole building |
| VILLA | RES | 400 + grounds | prime, trophy | 1 | R3 | whole building |
| MANSION | RES | 1,500 + grounds | prime, trophy | 1 | R4 | 04 storage, staff |
| ESTATE | RES | 4,000 + grounds | trophy | 1 | R5 | 04 storage, staff |
| OFFICE_FLOOR | OFFICE | 1,200 | mid, prime | 1 | R2 | strata floor of a tower |
| OFFICE_TOWER | OFFICE | 30,000 (25 floors) | prime | 25 | R3 | whole building |
| RETAIL_UNIT | RETAIL | 120 | mid, prime, trophy | 1 | R1 | storefront slot |
| SHOPPING_MALL | RETAIL | 25,000 | mid, prime | 60–120 | R3 | base rent + revenue share |
| WAREHOUSE | INDUSTRIAL | 5,000 | working | 1 | R2 | logistics premises |
| DATACENTER_SITE | DATACENTER | land 8,000 + shell | working | 1 | R3 | sold with MW capacity (§3.4.2) |
| HOTEL | HOSPITALITY | 8,000 (120 rooms) | all | 1 | R3 | leased to an operator (09) at base + 8% of revenue |
| LAND | — | parcel | any serviced parcel | — | R2 | development (§3.11) |
| PRIVATE_ISLAND | RES | island | Isla Serena | 1 | R6 | unique, auction (§3.18) |

Typical values at launch (Port Avalon, condition 85, grade B, at market): studio Riverside Lofts ≈ $90,000; loft apartment ≈ $450,000 (a 140 m² top-floor loft); penthouse Glasshill ≈ $6,000,000; mansion Summit Estates ≈ $45,000,000; estate ≈ $350,000,000. The income model alone lands within about ±20% of these figures; the genesis calibration of `comp_base` (§3.8.4) is set so that the blended appraisal of the reference unit in each named district equals 14's homes table (old 04 §6.1) exactly at launch, and both then move with the market.

#### §3.6.3 Unit rent

```
amenityMult = clamp( exp(0.25·waterView + 0.15·(1 − transitDist/1500) + 0.10·frontageBonus + gradeOffset), 0.70, 1.60 )
              gradeOffset: A +0.12, B 0, C −0.15; frontageBonus: CORNER_AVENUE 1, AVENUE 0.6, SIDE_STREET 0.2, else 0
conditionMult = 0.55 + 0.45 · condition / 100
marketRent_unit_perGD = R_{d,u} · area · amenityMult · conditionMult
```

#### §3.6.4 Letting model (vacant bound units and pools)

A vacant unit with an asking rent `ask` lets in a game hour with probability

```
p_let_GD = clamp( PARAM.base_let_rate (0.25) · ((1 − vacancy_{d,u}) / (1 − naturalVacancy_u))^2 · exp(−6 · (ask / marketRent − 1)) · screeningMult · managerMult, 0.005, 0.90 )
p_let_GH = 1 − (1 − p_let_GD)^(1/24)
```

`screeningMult`: STRICT 0.8, NORMAL 1.0, LENIENT 1.2. `managerMult` = 0.85 + 0.075·skill (SELF counts as skill 2). Bound units and pooled NPC units draw from the same demand: each GD the district's net new demand (`demandArea − occupied`) is allocated to vacant units in proportion to their `p_let_GD × area`, and a bound unit's let event consumes demand area. A player cannot let a unit when the district has no unmet demand except by undercutting existing tenants' renewals (tenants at renewal compare their rent with the cheapest vacant equivalent; §3.6.5).

#### §3.6.5 Lease terms, renewal and turnover

| Use | Term | Deposit | Break fee | Indexation |
|---|---|---|---|---|
| RES | 91 GD | 1 month (28 GD rent) | 28 GD | CPI at renewal |
| OFFICE | 364–1,092 GD (tenant choice weighted by sector stability) | 3 months | 91 GD | CPI annual |
| RETAIL | 364 GD | 3 months | 91 GD | CPI annual, malls + revenue share |
| INDUSTRIAL | 728 GD | 3 months | 91 GD | CPI annual |
| HOSPITALITY | 1,820 GD (5 GY) | 6 months | 182 GD | base CPI + 8% of operator revenue |

At lease end the tenant renews with probability `p_renew = clamp(0.75 − 2.0·(rent/marketRent − 1) + 0.1·(conditionMult − 0.9) + renewalPolicyShift, 0.05, 0.97)`; `renewalPolicyShift`: RENEW_MARKET 0 (rent reset to market), RENEW_HOLD +0.10 (rent kept, CPI only), NO_RENEW forces exit. Move-outs between renewals: RES 0.6% per game month baseline. Player-business tenants (09) follow their owner's decisions, not this model.

#### §3.6.6 Arrears and default

Per tenant per GD: `p_default = baseDefault_use · (1 + 3·max(0, u_b − u_b,launch)/0.05) · screeningDefaultMult · sectorStress`. `baseDefault`: RES 0.0002, OFFICE 0.0001, RETAIL 0.0003, INDUSTRIAL 0.0001, HOSPITALITY 0.0002 (per GD). `screeningDefaultMult`: STRICT 0.6, NORMAL 1.0, LENIENT 1.6. `sectorStress` from 09/16 sector default rates (1.0 normal). A defaulting tenant stops paying; arrears accrue. Recovery: the deposit is applied first; then after the policy's arrears window the lease moves to EVICTING (cost 14 GD of rent, 7 GD duration, through 13's tribunal automatically), the unit becomes vacant, and 50% of remaining arrears are recovered over 28 GD (manager skill adds 5% per star above 2). Player tenants in arrears are handled through 15's contract engine and 13 civil court, never automatic eviction of their business without notice (7 GD notice, then eviction; the business relocates or pauses per 09).

### §3.7 Operating costs

#### §3.7.1 Condition and maintenance

```
replacementCost = area · buildCostPerM2(type, city) (§3.11.4)
requiredMaintPerGD = replacementCost · PARAM.maint_rate_<use> / 364        // RES 0.010, OFFICE 0.012, RETAIL 0.012, INDUSTRIAL 0.008, HOSPITALITY 0.015, DATACENTER 0.010 per GY
spend = f · requiredMaintPerGD,   f = policy.maintenanceLevel ∈ [0, 1.5]
Δcondition per GD = (f − 1) · PARAM.condition_drift (0.08) − ageWear,   ageWear = 0.01 · max(0, ageGY − 20)/20
condition clamped [0, 100]; f > 1 raises condition up to 100 at most +0.04 per GD
```

At f = 0 a building loses about 29 condition points per GY; at f = 1 it holds. Random repair events: per prop per GD `p_repair = 0.004 · (1 + (100 − condition)/50)`, cost `replacementCost · U(0.002, 0.02)` from stream `re/<city>/repair/<propId>`; the manager pays it automatically if ≤ `capexAutoApproveLimit`, else it is an **exception** (§3.13). An unpaid repair lowers condition by `cost / replacementCost · 400` points and amenity by 5% until fixed. Insurable perils (fire, storm, flood) are 08's events: 08 pays claims to the policy owner; uninsured damage is the owner's loss (REVALUE + repair cost).

#### §3.7.2 Recurring charges (posted at day close)

| Charge | Formula per GD | Reason code (class proposed, 03 authoritative) |
|---|---|---|
| Rent received | Σ active leases `rentPerGD` (+ revenue share settled weekly) | `RE_RENT_IN` (FAUCET when tenant is hh/frm/npc sector; TRANSFER when tenant is a player entity) |
| Property tax | `assessedValue · propertyTaxRate_city / 364`; assessed value = last appraisal × 0.9, reassessed each game quarter | `RE_PROPERTY_TAX` (TRANSFER to the bloc `gov`, posted as 03 `TAX_PROPERTY`; E-9, E-27) |
| Maintenance | `spend` (§3.7.1) | `RE_MAINTENANCE` (SINK when paid to NPC contractors; TRANSFER to a player maintenance or cleaning business 09) |
| Management fee | `feePct · collectedRent` | `RE_MGMT_FEE` (SINK NPC agency; TRANSFER player agency) |
| Insurance premium | 08's premium | 08 reason codes |
| Utilities on vacant units | `0.02 · marketRent_unit` per vacant unit | `RE_VACANT_COST` (SINK) |
| Household staff (MANSION/ESTATE/ISLAND, owner-occupied) | 14's staff line | 14 reason codes |

Property tax rates (`PARAM.property_tax_rate_<city>`, per GY of assessed value): FDL cities 0.010, EUN 0.012, PYN 0.008, NKR 0.009, SRL 0.015, Isla Serena 0.004. 03 owns the tax engine; 10 supplies the rate and the assessed value.

### §3.8 Value, cap rates and price indices

#### §3.8.1 Net operating income

```
NOI_GD = Σ rent collected (expected, at current occupancy) − maintenance(f=1) − property tax − insurance − mgmt fee (8% notional if self-managed, for valuation only) − vacancy costs
NOI_stabilized_GY = 364 · [ marketRent_total · (1 − max(vacancy_{d,u}, naturalVacancy_u)) · (1 − creditLoss_u) − opex_GD ]
```

Valuation uses stabilized NOI (market rent at district vacancy), not the current lease roll, so a single empty month does not crater a mark; leases above or below market add a lease-adjustment term `Σ_leases (rent − marketRent) · remainingGD · 0.9`.

#### §3.8.2 Cap rates

```
capRate_{d,u} = clamp( y10_0 + m·(β_y·(y10_b − y10_0) + k_s·stress) + PARAM.cap_premium_<use>_<tier> + PARAM.illiquidity_premium (0.004)
                       − g_c · g_rent_expected, PARAM.cap_floor (0.015), PARAM.cap_ceiling (0.12) )
// E-41/E-43, PROVISIONAL [Quant]: β_y 0.3, k_s 0.005, g_c 0.25 (were 1, 0.01, 0.5); m = crunch severity, 1 outside the 10#35 scenario;
// in the scenario m = μ_m·exp(σ_m·Z − σ_m²/2), σ_m 0.70, μ_m 1.05, one draw per scenario on `re.crunch_severity:<scenarioId>`, shared by all cities
stress         = clamp( (F − 50)/50, 0, 1 ) · 0.5 + clamp(−c_b, 0, 1) · 0.5
g_rent_expected= 0.5 · trailing 364-GD rent growth + 0.5 · π_b
```

Cap premiums (`PARAM.cap_premium_<use>_<tier>`): RES working 0.030, mid 0.020, prime 0.015, trophy 0.010; OFFICE mid 0.030, prime 0.022; RETAIL mid 0.035, prime 0.025, trophy 0.018; INDUSTRIAL 0.030; HOSPITALITY +0.010 over the RES premium of the tier; DATACENTER 0.035. With `y10 = 3%` and 0.5% expected growth, a mid residential cap is about 4.6%, prime 4.1%, working 6.1%, in line with old 01's 1.5–6% band at normal rates. A rate hike in 04 changes `y10_b` and therefore every cap rate on the same day close: the transmission channel V3 §2.4 asks for.

#### §3.8.3 Appraisal

```
V_inc  = NOI_stabilized_GY / capRate + leaseAdjustment
V_comp = PI_{d,u} · area · amenityMult · conditionMult · comp_base_{d,u}         // comp_base is $/m² at PI = 1, fixed at genesis (§3.8.4)
w_inc  = income property (rented, office, retail, industrial, hotel): 0.7 ; owner-occupied residential and LAND: 0.3 ; MANSION/ESTATE/ISLAND: 0.2
value  = w_inc · V_inc + (1 − w_inc) · V_comp
```

LAND: `V_inc` is replaced by the residual land value `max(0, GDV_best − buildCost_best·(1 + 0.15)) · 0.9` for the best by-right project on the parcel. Appraisals run every 7 GD (staggered) and on triggers: purchase, completion of renovation or development, lease signing above 10% of rent roll, mortgage application, foreclosure. Between appraisals, the **daily mark** used for net worth (03) is `lastAppraisal.value · PI_now / PI_at_appraisal`.

#### §3.8.4 District price index (comparables)

```
modelPI_{d,u}(t) = [ R_{d,u}(t) / R_{d,u}(0) ] · [ capRate_{d,u}(0) / capRate_{d,u}(t) ]
txnPI_{d,u}(t)   = trimmed mean over arm's-length sales in last 91 GD of ( price / (area·amenityMult·conditionMult·comp_base) ), trimming the top and bottom 10%
n                = count of qualifying sales in 91 GD
PI_{d,u}(t)      = EWMA_0.1( (n/(n + PARAM.comp_n0 (8))) · txnPI + (PARAM.comp_n0/(n + PARAM.comp_n0)) · modelPI )
```

Qualifying sales exclude: related-party transfers (shared owner chain, 03), sales flagged by 15 anti-funneling (price more than 10% from appraisal between linked accounts), foreclosure and forced sales (they count in a separate distressed index shown to players but not used for marks), and sales that close within 7 GD of the same property's previous sale. `comp_base` is calibrated at genesis so that `V_comp = V_inc` for a grade-B, condition-85 unit at launch in every district, except the districts named in 14's homes table, where it is set so the blended value of the reference home equals 14's list price. The city price index is the household-weighted mean of the RES district indices.

### §3.9 Buying and selling

#### §3.9.1 Sources of supply

1. **NPC listings.** Each GD, NPC landlords list `PARAM.npc_listing_rate (0.002)` of their pooled stock per district, rounded down with a deterministic carry, at `ask = appraisal · (1 + U(0, 0.06))`. Listings carve out (§3.0) only when someone buys. Rate doubles for 28 GD in a newly opened city and halves when `stress > 0.6` (sellers wait in a crisis), and NPC distressed sellers add `0.001 · pDefaultMortgage_d` of stock at `appraisal · (1 − 0.12)` in a credit crunch (16).
2. **Land authority.** Each city's land authority (an `npc` institution per city, owned by the bloc `gov`) holds every unbuilt SERVICED parcel. It runs a **weekly sealed-bid land auction** of `max(4, 0.5% of serviced parcels)` parcels chosen by highest development priority (§3.21.3), reserve = residual land value (§3.8.3). Ties: highest bid, then earliest bid tick, then lower bidder id hash. Proceeds are `RE_LAND_SALE` = `PROP_LAND_AUCTION`, a TRANSFER to the treasury of the city land authority (owned by the bloc `gov`), per E-9 (Producer ruling E-39).
3. **Player listings** on the open market (NPC buyers can buy them) or on 15's P2P property exchange.
4. **Foreclosures and estate sales** (§3.10.5, 14 dormancy).

#### §3.9.2 Selling to NPC buyers (time to sell)

For a listing on the open market, each game hour an NPC buyer arrives with probability `1 − exp(−1 / (meanGD · 24))`:

```
meanGD = clamp( 2 · exp(12 · (ask/appraisal − 0.95)) · liquidityMult, 0.5, 48 )
liquidityMult = (1 + 2·stress) · (1 + max(0, −c_b)) · tierMult      // tierMult: working 0.8, mid 1.0, prime 1.3, trophy 2.0, unique 4.0
```

At ask = appraisal in a normal market a mid property sells in about 3.6 GD (≈ 3.6 real hours), which sits inside old 01's 2–24 real-hour band; at ask 10% over appraisal about 12 GD. An arriving NPC buyer pays the ask. Each NPC buyer is financed by a 07 NPC bank mortgage if `c_b` allows; in a credit freeze (`c_b < −0.6`) half of NPC buyers fail financing and the arrival counts as a viewing (shown to the seller).

#### §3.9.3 Instant sale

`prop.sellToFund` sells immediately to the city's NPC property fund at `appraisal · (1 − PARAM.instant_sale_discount (0.10) − 0.15·stress)`. The fund has a daily capacity of `PARAM.instant_sale_fund_capacity_share (0.5%)` of the city's NPC pooled value; beyond it the request queues to the next day (forced sales jump the queue, §3.10.5).

#### §3.9.4 Transaction costs

Buyer pays `PARAM.transaction_cost (0.03)` (`RE_TXN_COST` = `PROP_TXN_COST_NPC`, TRANSFER to the NPC brokerage (frm) sector account (E-9, NPC money closed T16A-05; E-39 amendment; class and rate [Quant] confirm, E-39); to the NPC brokerage, or TRANSFER to a player brokerage 09 when the player hires one, which then charges its own fee instead) and stamp duty `stampDutyRate (0.01)` (`RE_STAMP_DUTY`, TRANSFER to the bloc `gov`, posted as 03 `TAX_STAMP_DUTY`; E-9, E-27). P2P trades additionally pay 15's 2% P2P transfer tax and 0.5% contract fee (old 02 §8.2). Capital gains tax on sale is 03's (sale price − cost basis − transaction costs).

#### §3.9.5 Settlement

Purchases settle atomically in P13: cash (and mortgage proceeds) from buyer, title to buyer, existing leases transfer with the property, deposits move with the leases in escrow, any existing mortgage is paid off from proceeds before the seller receives the remainder (or assumed by the buyer when the lender allows, `PARAM.mortgage_assumable` = false by default). Cross-bloc settlement waits the delay in §3.2.4; the cash is held in escrow meanwhile.

#### §3.9.6 Appraisal integrity

Players who own a 09 appraisal or brokerage business cannot appraise or broker properties owned by anyone in their owner chain or collusion cluster (15). SYSTEM appraisals are the only ones used for net worth and LTV tests; player appraisals are advisory products sold to other players and are recorded with the appraiser's id (13 can use a wildly wrong appraisal sold to a lender as fraud evidence).

### §3.10 Mortgages

#### §3.10.1 Eligibility

- Borrower must hold LIC1 Retail or above (13), not be Held (13), and pass the lender's credit score (07 `creditScore(borrower)` in [300, 850]).
- Max LTV at origination (`PARAM.max_ltv_<product>`): RES 0.80, COMM 0.65, CONSTRUCTION 0.60 of total cost (LTC), BRIDGE 0.70, SECOND_LIEN combined 0.85 (RES only). Credit conditions scale all limits: `maxLTV_eff = maxLTV · (1 + 0.25·min(0, c_b))` (a severe crunch at `c_b = −1` cuts LTV by a quarter, matching old 01's "LTV −20 pts" crisis note).
- Income properties need DSCR ≥ `PARAM.min_dscr (1.20)` at origination: `DSCR = NOI_stabilized / annualDebtService`. Owner-occupied residential needs debt service ≤ `PARAM.max_dti (0.40)` of the borrower's trailing 28-GD income (03 income statement: business profits, dividends, rent, salary-equivalents).
- A single borrower's total mortgage balance with one lender is capped by 07's large-exposure rule.

#### §3.10.2 Products and payments

- Terms: 5, 10 or 25 GY (`termGD = 364 × years`). Payments every 7 GD (`paymentEveryGD`), first payment 7 GD after funding.
- Annuity payment per period: `pmt = B · r / (1 − (1 + r)^(−n))`, `r = rate · 7 / 364`, `n` remaining periods. Interest-only: `pmt = B · r`, balloon at maturity.
- Interest accrues daily at day close: `interest_GD = balance · rate / 364` (`RE_MORTGAGE_INTEREST`, TRANSFER to the lender bank; 03 handles bank income). Principal repayment is `CREDIT_DESTROY` (00 §5.4). Origination is `CREDIT_CREATE` via 07 (`bank.originateLoan`), with an origination fee 0.5% (`RE_MORTGAGE_FEE`, TRANSFER to lender).
- Floating rate resets every `resetEveryGD (7)` to `ref + spread`; fixed holds for the term (fixed loans can be refinanced).

#### §3.10.3 Pricing

```
spread = PARAM.mortgage_base_spread_<product> (RES 0.015, COMM 0.020, CONSTRUCTION 0.030, BRIDGE 0.035, SECOND_LIEN 0.040)
       + 0.02 · max(0, LTV − 0.60) / 0.20
       + 0.01 · (700 − creditScore)/100   (floored at 0)
       + 0.005 · (tier == 'working')
       + lenderMarginAdj (07: bank funding cost and capital scarcity)
rateFixed = y10_b + spread ;   floating = i_b + spread + 0.005 (term premium offset removed)
```

Typical: a 75% LTV residential fixed at y10 = 3% ≈ 3% + 1.5% + 1.5% = 6.0%, inside old 01's "10y + 1.5–3%". Player banks (07) set their own spreads within 07's rules; the borrower sees all quotes side by side.

#### §3.10.4 Covenant tests and margin calls

On every SYSTEM appraisal of a mortgaged property (weekly) and on payment dates:
1. `LTV_now = balance_all_liens / appraisal.value`. Breach if `LTV_now > maxLtvCovenant = originationMax + PARAM.ltv_covenant_buffer (0.10)` (RES 0.90, COMM 0.75).
2. DSCR breach if income property and trailing 91-GD DSCR < `PARAM.dscr_covenant (1.05)`.
3. Late payment: a missed payment makes the loan LATE; a 2% late fee; three missed payments in a row is an event of default.
On breach the loan enters **CURE** with `cureDeadlineTick = now + PARAM.cure_period_ticks (2,160 = 3 GD)`. The borrower may (a) pay down principal to bring LTV to the covenant minus 2 points, (b) pledge additional collateral (another unencumbered property or 07-eligible securities at 07 haircuts), (c) sell the property (listing with the lender's consent; proceeds pay the loan first), or (d) refinance with another lender. A cured loan returns to CURRENT. Each cure event is recorded (PARTIES visibility) and raises the spread by 0.25% on the next reset.

#### §3.10.5 Foreclosure and forced sale

If not cured by the deadline, the loan goes FORECLOSING: the property is frozen (no sale except by the lender), the lender lists it at `appraisal · (1 − 0.05)` for `PARAM.foreclosure_auction_ticks (2,160)`; if unsold, it sells to the NPC property fund at `appraisal · (1 − 0.10 − 0.15·stress)` (fair value band, never the last distressed print; anti-cascade, old 01 §9). Proceeds pay costs (2% foreclosure cost, `PROP_FORECLOSURE_COST_NPC`, TRANSFER to the NPC firm sector account (E-39 amendment); class and rate [Quant] confirm, E-39), then lien 1, then lien 2, then the borrower. Shortfall handling by recourse (§3.10.6). Forced sales jump the instant-sale capacity queue, but a city's forced-sale volume per GD above 1% of its NPC pooled value is executed at the band price into a 07 "bad bank" NPC holder instead of the fund, so a cascade cannot exhaust buyers. The event goes to 13's record (S1 civil default, no fine) and 14 Reputation (−3 per foreclosure, only if the borrower had funds to cure, otherwise −1).

#### §3.10.6 Recourse

- Residential (owner-occupied or up to 4 residential units): `FULL` recourse, but collection respects 13's floor (nothing takes a player below $5,000 + one T1 business).
- Commercial and APARTMENT_BLOCK, OFFICE_TOWER, MALL, HOTEL, DATACENTER_SITE: `NON_RECOURSE` when owned by a company (cmp/spv); `LIMITED` (recourse up to 25% of original principal) when owned directly by a character.
- Construction loans: `LIMITED` with a completion guarantee: if the developer abandons, recourse up to 50% of drawn balance.

#### §3.10.7 Prepayment and refinancing

Floating: prepay any time free. Fixed: penalty `prepayPenaltyPct = 3% · remainingTermFraction`, minimum 0.5% (`RE_PREPAY_FEE`, TRANSFER to lender). Refinancing = new loan from any lender funding the payoff of the old one atomically in P13. A **cash-out refinance** is allowed up to the product max LTV on a fresh SYSTEM appraisal; to stop circular refinancing on inflated marks (old E08), a cash-out refi requires the property to have been held 28 GD since purchase or last cash-out, and the appraisal used is `min(new appraisal, last appraisal · 1.10)`.

#### §3.10.8 Securitization hook

Every mortgage is a 07 loan; a bank may sell pools to 08 SPVs. 10 provides each loan's live risk fields to 08 every day close: `balance, rate, LTV_now, DSCR, propertyType, tier, cityId, borrowerKind (chr/cmp/hh), status, monthsCurrent`. The property-level default event (foreclosure) is the only default 10 originates; aggregate household mortgage defaults for the hh sector are computed by 07/16 from 10's city price index and 04 unemployment, using `LTV distribution = launch distribution × (PI_launch / PI_now)`.

### §3.11 Development

#### §3.11.1 Who can develop

R2+ for TOWNHOUSE, VILLA, APARTMENT_BLOCK, WAREHOUSE and RETAIL units up to 3 floors; R3+ for towers, malls, hotels, data-center sites and any project over 10,000 m²; R4+ for any project over 40 floors or on a crown parcel (§3.22). A player may run at most `PARAM.max_concurrent_projects = 2 + rankIndex` projects personally; a company with a 09 Real-estate developer business may run `3 + 2·developerTier` more.

#### §3.11.2 Land

Land comes from land-authority auctions, from buying a whole building to demolish (REDEVELOPMENT), or from buying LAND props from other owners. Parcels may be assembled (contiguous parcels in one block, max 6) into one project; assembly merges the parcels' frontage and keeps the lowest parcel id as the primary address; the other addresses are retired but stay resolvable (old addresses redirect).

#### §3.11.3 Zoning and permits

1. **By right**: the project's use is in `zoning.allowed`, height ≤ `maxHeightM`, FAR ≤ `maxFar`. Permit review takes `PARAM.permit_days_by_right (2)` GD for ≤ 5,000 m² and 5 GD above; fee 0.4% of hard cost (`RE_PERMIT_FEE`, SINK); approval probability 0.98 (rejection only for ACCESS, a deterministic check shown before submission).
2. **Variance** (height up to +30% or FAR up to +25%): 7 GD, fee 1%, `pApprove = clamp(0.35 + 0.20·[pressure_{d,use} > 1.10] + 0.10·[grade A] − 0.25·heritage − 0.10·objections, 0.05, 0.85)`.
3. **Rezoning** (a use not allowed): 14 GD, fee 2%, `pApprove = clamp(0.20 + 0.25·[pressure of new use > 1.10] − 0.30·heritage + lobbyBonus (16, ≤ 0.15), 0.02, 0.70)`.
4. **Objections**: any player owning a property within 150 m may file an objection (fee $5,000, `PROP_OBJECTION_FEE`, TRANSFER to the city government; class and amount [Quant] confirm, E-39; max one per project per objector); each objection lowers pApprove by 0.05 up to −0.20. Objection by a competitor with no nearby property is impossible.
5. **Rejected**: fee is lost; the developer may appeal to 13's planning tribunal with `prop.dev.appeal` (cost $25k + 0.2%, `PROP_PLANNING_APPEAL_FEE`, SINK like 13's `LAW_COURT_FEE`; class and amount [Quant] confirm, E-39; 7 GD, success p = 0.30 if the rejection was by variance math, 0.0 for heritage locks).
Permit review capacity: each city's planning office processes at most `PARAM.planning_capacity_per_GD = 20 + 0.0001 · population` reviews per GD; extra applications queue FIFO. Players see their queue position.

#### §3.11.4 Construction cost

```
buildCostPerM2(type, city) = baseCost_type · cityCostMult_personality · inputIndex_b
inputIndex_b = 0.30·wageIndex_b + 0.25·steelIdx + 0.15·lumberIdx + 0.10·copperIdx + 0.20·CPI_b      // each 1.0 at launch; commodity indices from 06, wages and CPI from 04
```

`PARAM.base_cost_<type>` ($/m², FDL launch): STUDIO/APARTMENT in blocks 1,800; TOWNHOUSE 1,700; APARTMENT_BLOCK 1,800; PENTHOUSE fit-out 4,500; VILLA 3,000; MANSION 4,200; ESTATE 5,000; OFFICE_TOWER 3,000; OFFICE fit-out 600; RETAIL_UNIT 1,600; SHOPPING_MALL 2,200; WAREHOUSE 700; HOTEL 2,800; DATACENTER_SITE shell 1,500 + `PARAM.dc_hookup_cost_per_mw ($150,000)` per MW; premium for height: +1.2% per floor above 20. `cityCostMult` = the city's rent multiplier^0.5.

Budget lines: `hard = area · buildCostPerM2`; `soft = 0.10 · hard` (design, permits, legal); `contractorFee = feePct · hard`; `contingency` = player choice 0–15% of hard (unused contingency returns at completion); `financingCostEst` = construction loan interest at the current rate on the expected draw schedule. `projectedValue` = appraisal model applied to the completed building at today's market (§3.8.3).

#### §3.11.5 Schedule

Base durations (`PARAM.dev_days_<type>`, GD; 1 GD = 1 real hour): TOWNHOUSE 48, VILLA 72, MANSION 120, ESTATE 168, APARTMENT_BLOCK 96, OFFICE_TOWER 240, RETAIL_UNIT (shell) 24, SHOPPING_MALL 192, WAREHOUSE 72, HOTEL 168, DATACENTER_SITE 72, CONVERSION 0.5 × new-build, RENOVATION_MAJOR 0.25 × new-build. Size factor: `duration · (area / typicalArea)^0.3`. This places development between 2 and 10 real days as old 01 §3.8 set. Phases split the duration: SITE_PREP 15%, STRUCTURE 50%, FIT_OUT 35%. LEASE_UP starts at completion for rental projects (no fixed duration; it ends when occupancy reaches stabilized or after 91 GD).

#### §3.11.6 Contractors, overruns and delays

| Contractor | Fee | Overrun σ per phase | Delay probability per phase | Delay size |
|---|---|---|---|---|
| NPC_BUDGET | 8% | 0.12 | 0.18 | +10–40% of phase |
| NPC_STANDARD | 12% | 0.08 | 0.10 | +10–30% |
| NPC_PREMIUM | 18% | 0.04 | 0.05 | +5–20% |
| PLAYER (09 construction company) | its price | `0.12 − 0.02·qualityLevel/5` (clamp 0.03) | `0.15 − 0.02·reliabilityLevel/5` | its capacity rules |

At each phase start: `overrun = exp(N(μ_shock, σ))` where `μ_shock = 0.5·ln(inputIndex_now / inputIndex_at_budget)` (commodity shocks pass through), drawn from `re/<city>/dev/<projectId>/<phase>`. Phase cost = budgeted phase cost × overrun. Delay: Bernoulli(delayProb · (1 + 2·[commodity shortage event for steel or lumber active] + 1·[contractor capacity utilisation > 0.9])), size uniform in the band. Player construction companies have capacity in m² of active work (09); a project needing more than the contractor's free capacity cannot start with that contractor.

#### §3.11.7 Heritage

Heritage districts: demolition forbidden for buildings older than 50 GY at genesis; new height capped at the district cap; conversion allowed; facade must keep the archetype family (the game picks from the heritage archetype set). Heritage parcels never get variance or rezoning above caps.

#### §3.11.8 Financing and payments

Equity first, then construction loan draws (LTC ≤ 0.60, interest capitalised monthly into the balance), then presale deposits (released only for STRUCTURE and FIT_OUT phases and only up to 50% of deposits; the rest stays in escrow until completion). Each phase's cost is drawn into the project's escrow at phase start and paid out to the contractor over the phase per game hour (`RE_CONSTRUCTION_PAY`: SINK to NPC contractors, TRANSFER to player contractors; the materials share 60% of a player contractor's receipt is a SINK to NPC suppliers unless the contractor owns 09 supply businesses).

#### §3.11.9 Presales

Strata residential projects (APARTMENT_BLOCK sold as units, towers with apartments) may presell up to 70% of units at `price ≤ 0.95 · projectedUnitValue`, deposit 10% to escrow. NPC presale buyers arrive per GD with probability `0.08 · pressure_{d,RES}² · exp(−8·(price/projectedUnitValue − 0.90))` per unit offered. At completion buyers pay the balance (NPC buyers use NPC mortgages; if their financing fails in a crunch, the deposit is forfeit to the developer and the unit returns to inventory). If the project is cancelled, deposits are refunded from escrow in full.

#### §3.11.10 Completion

At FIT_OUT end: the building is created on the parcel (physical state CONSTRUCTION → OCCUPIED or VACANT), units created, a SYSTEM appraisal runs, presales close, the construction loan converts to a COMM or RES term loan if the developer elected conversion at origination (else it must be repaid within 28 GD; BRIDGE available), `capexMomentum91` of the district rises by the hard cost, supply rises, and a `DEVELOPMENT_COMPLETE` transition is published. Developer profit is realised only on sale (or recognised as REVALUE in the mark when held).

#### §3.11.11 Pause, stall and cancel

Pause: up to 28 GD, costs `0.03%` of hard cost per GD [Designer target, Quant tune; E-43/E-45; was 0.1%] (site security, `PROP_SITE_SECURITY_NPC`, TRANSFER to the NPC firm sector account (E-39 amendment); class and rate [Quant] confirm, E-39), no progress. Cancel: spent cost is lost (written off), the site becomes STALLED with a persistent "stalled shell" (Sundara's ghost tower archetype where the personality allows), the land and shell remain a sellable LAND prop with a shell credit of 40% of spent hard cost in its residual value. Stalled sites are resumable by any later owner at the remaining budget × inputIndex change.

#### §3.11.12 Renovation, conversion, redevelopment, demolition

- **Renovation** (minor): raises condition to a target ≤ 100 at cost `replacementCost · (Δcond/100) · 0.6`, duration `ceil(Δcond/10)` GD, tenants stay; rent multiplier rises on completion. **Grade upgrade** (C → B → A): RENOVATION_MAJOR project, cost 25% (C→B) or 35% (B→A) of replacement cost, tenants must vacate (leases run off or are bought out at 3 months' rent).
- **Conversion**: change of use within zoning (or with rezoning), e.g. warehouse → lofts, office → apartments; cost 45% of new-build for the target type, duration 50%; all leases must end first.
- **Redevelopment**: demolish (cost 4% of replacement, 7 GD, DEMOLITION permit; forbidden in heritage for old stock) then NEW_BUILD.
- Owned assets are never demolished, moved or revalued by any visual rule (LC08). Only these intents change structures.

### §3.12 District shocks and housing crises (emergent)

No housing crisis is scripted here. The mechanism: 04 raises `y10_b` or `c_b` turns negative → cap rates rise and NPC buyer liquidity falls (§3.8.2, §3.9.2) → appraisals and PI fall → LTV covenants breach (§3.10.4) → cures, forced sales, NPC distressed listings (§3.9.1) → transaction PI falls further, slowed by the comps EWMA and the fair-value band → 07 bank losses tighten `c_b` further (07) → pressure falls as households double up (§3.3 migration slows, household formation `hhSize` rises by 0.02 per GY of unemployment above launch, PARAM) → construction starts stop (§3.21). Recovery follows the reverse path. 16 may run its crisis templates (V3 Q4, decided by 16), but they act through 04/07 inputs, never by setting property prices directly. Target bands for 20: a severe crunch produces city price index falls of 20–35% peak to trough over 30–90 GD (old 01 §3.8), recovering over 1–3 chapters.

### §3.13 Management (E02, E03, E06)

1. **Default.** Every new prop gets the owner's default `ManagementPolicy` (rentTarget MARKET, screening NORMAL, maintenanceLevel 1.0, capexAutoApproveLimit = 0.5% of value, RENEW_MARKET, STANDARD arrears, insuranceAuto true) and `SELF` management. SELF management costs no fee but has skill 2 and surfaces every exception.
2. **Managers.** An owner can hire an NPC agency (fee 8% of collected rent, skill drawn 2–4 per city agency, `PARAM.npc_mgmt_fee`), a player's 09 Property management agency (fee and skill from that business; old 01 catalog: 8% reference), or an 11 operations model deployed as a property manager (fee = its inference cost; skill = `1 + 4·σ((opsMCS − 60)/40)`; 11 §3.9.4). Manager skill affects: let probability (§3.6.4), arrears recovery (+5% per star above 2), maintenance efficiency (`spend` buys `1 + 0.04·(skill − 3)` of required maintenance), repair cost (−3% per star above 3).
3. **What a manager does automatically each game hour:** sets asking rents per policy; screens and signs tenants; renews or ends leases; funds maintenance; pays repairs under the limit; files evictions per policy; renews insurance; keeps rent deposits in escrow.
4. **Exceptions surfaced to the owner** (one card each, grouped by portfolio group; E03): repair above the limit; tenant default of a commercial tenant; vacancy above `2 × naturalVacancy` for 14 GD; covenant breach or cure notice; condition below 50; insurance lapse; permit decisions; a buy offer above appraisal; a district event affecting the property. Nothing else interrupts the owner.
5. **Portfolio groups** (E06). An owner groups props by district, city or any set; a policy or manager applied to the group applies to all members; one exception card per group per kind per GD ("3 properties in Old Harbor have repairs above your limit: $41,200 total. Approve all / review"). Group actions are one intent regardless of size.
6. **Estimated net income** shown on every prop and group is after maintenance, tax, insurance, management and vacancy (E02), never gross rent.

### §3.14 Homes (owner-occupied)

- A home is a RES prop in OWNER_OCCUPIED mode. It earns no rent, counts toward net worth at its daily mark, and pays maintenance, property tax and insurance (old 01 §13 Velvet alignment). 14 reads the home's type, condition and district for storage capacity, Prestige, hosting eligibility and the Estate view.
- A character has at most one **primary home** (the Estate shown on Home); further owner-occupied props are second homes (14 Five Capitals set). Switching a prop between OWNER_OCCUPIED and RENTED has a cooldown `PARAM.home_mode_cooldown_ticks = 5,040` (1 game week). Switching to RENTED requires the unit vacant; switching to OWNER_OCCUPIED requires the lease to have ended.
- The **rented room** (R0 start, 14) is a lease on a ROOM unit in a working district of the home city. Its rent is the market rent of that unit (§3.6.3), about $5.40 per GD at launch in Eastside Docks (18 m² × $0.30). This supersedes old 04's $60 per GD figure, which was inconsistent with the rent model `DEFAULT (Mathis may override)`. 14 may set any rent-only lifestyle housing on top.
- Homes in MANSION, ESTATE and PRIVATE_ISLAND types need 14's household staff line; unpaid staff lowers condition 2 points per GD (old 04 §6.1, applied here to `condition`).
- Physical security wings (14) attach to the home prop and defend only 12's physical ops.

### §3.15 Company premises and business location (E07, I02, I06)

1. **Every business occupies premises.** When 09 creates or relocates a business, it requests a unit through `city.requestPremises(bizId, cityId, districtId?, use, minArea, slotPreference?)`. 10 returns a unit (a storefront slot for RETAIL/consumer businesses, an office floor, a warehouse, a hotel, a data-center site) and creates a lease from the unit's owner (NPC pool by default) at the unit's market rent. The business pays that rent as an operating cost (09).
2. **Slot choice.** If the player picks a slot on the map, they get it if free; if they pass a district only, 10 chooses `argmax` over free eligible units of `slotScore − 0.0001·hash(bizId, unitId)` where `slotScore` = frontage bonus (§3.6.3) + 0.5·D_d. If no unit is free, 10 reserves the business in a **pending placement** state (LC17): the business operates from a temporary unit at 90% capacity and the pending state is shown; it gets the next unit that frees or completes in that district, in queue order, never by blocking the purchase on generation.
3. **Location is explicit economics** (LC09 resolved). 09's attractiveness term `location_j` is supplied by 10: `location_j = 0.25·frontageBonus_unit + 0.50·D_d + 0.25·tanh(ln(hhDemand_d / meanHhDemand_city))`. A better location therefore helps the business and costs more rent through `amenityMult`; cosmetic purchases (§3.25) never change `location_j`, rent or demand.
4. **Owner-occupied premises.** If the business's owner chain also owns the unit, the lease is **related-party**: rent is an intercompany transfer that 03 eliminates on consolidation (no group profit), but the unit still shows its foregone market rent as an opportunity cost on the business and prop cards (I02). A related-party lease must be at market rent ±10%; outside that band 03 treats the difference as a distribution and 13 may review it for minority-shareholder harm when the business or prop sits in a company with outside shareholders (I07).
5. **Labs and data centers** request DATACENTER_SITE premises (11 §3.3.4) with a power requirement in MW; the site's grid capacity binds.
6. **Headquarters** for player companies: a company may designate an owned or leased OFFICE prop as its HQ; it appears as a COMPANY_BUILDING binding with the company's name (public, because a company and its HQ are public, LC05). A listed player company that reaches the top 25 market caps of its home city gets an HQ slot offer in the CBD (§3.20.1).

### §3.16 Funds, REITs, securitization and insurance hooks

- **REITs (listed NPC companies, 05/06).** Each listed REIT (22 lists 2 per bloc) owns a defined set of NPC pools (by district, use) at fixed weights. Its NAV per share is computed by 10 at day close: `NAV = Σ pool_share · pool_value − REIT debt`, supplied to 05 as the fundamental anchor for that equity. REIT dividends are 90% of pooled NOI attributable (05 pays them).
- **Player property funds (08).** A player fund (`fnd`) may hold props directly; all 10 rules apply with the fund as owner. 08 reads daily marks for NAV.
- **Securitization (08).** Mortgage fields per §3.10.8.
- **Insurance (08).** 10 exposes per prop: `{ propId, type, cityId, districtId, waterfront: boolean, value, condition, constructionYear }` for 08's peril model; 08 posts premiums and claims. Catastrophe events (16 world events: storm on a coastal city, flood on riverside districts) apply damage `damagePct` to condition and require repair; insured owners are paid by 08.

### §3.17 Taxes and accounting touchpoints (03)

10 tags every flow with a reason code (§3.7.2, §3.9.4, §3.10.2, §3.11.8) and supplies to 03: rental income per entity per GD, deductible expenses (maintenance, tax, mgmt, interest, insurance), depreciation basis (buildings depreciate for tax at 2.5% per GY of building cost basis; land does not), capital gains on sale, and related-party lease flags. 03 computes income and gains tax and consolidation.

### §3.18 Isla Serena and unique property

1. Isla Serena is a fixed archipelago (generated once from its seed at world genesis, then never regenerated) with 9 islands at launch (`PARAM.serena_islands_launch = 9`), each a PRIVATE_ISLAND prop owned initially by the Serena Trust (an `npc` institution).
2. **Auctions.** 3 islands are auctioned at world launch week, then 1 per chapter until all are sold (`DEFAULT`), through 15's auction house (English auction, anti-snipe +12 ticks), reserve `PARAM.island_reserve = $1,500,000,000` (old 04), buyer R6 only. Proceeds are `RE_UNIQUE_SALE` (SINK). New islands join the queue as new coastal cities open (§3.2.3), up to 15.
3. Upkeep: 4% of value per GY plus staff (14). Each island has a marina and airstrip (14 storage: unlimited cars, yachts, jets).
4. Islands can be sold P2P or at auction like other props (they keep R6 buyer eligibility). The 14/16 dormancy rule (old 01 §14.2) sends islands of accounts dormant 90 days to an Estate sale auction; proceeds are paid to the owner.
5. Visuals: each island shows its owner's estate only if the owner opted in (§3.24); otherwise a neutral private-estate treatment.

### §3.19 The procedural city (generation)

The generator turns a city's **personality** and seed into persistent geography, roads, blocks, parcels, buildings and landmarks. It runs on the server in a worker, never in the tick; its output is persisted and is the authoritative physical city. The economic stock (§3.0) is initialised from it.

#### §3.19.1 Determinism and packaging

- Pure TypeScript package `@game/citygen` with no DOM, no `Math.random`, no wall-clock reads (old 06 §4). RNG: 02's xoshiro128** with one stream per `(cityId, regionId, stage, featureId)`.
- All topology decisions use **fixed-point integer centimetres** and robust integer predicates (orientation, segment intersection); floats are allowed only for continuous fields (noise, land value) and are quantised before any discrete decision. The noise implementation is the package's own (no third-party library).
- The generator package version, its dependency lockfile and the Node runtime are pinned per region (LC14). Generated topology is **persisted** (19 tables) at the moment a region is generated; it is never regenerated by replay. Client code never runs topology steps (old 06 §8.2).

#### §3.19.2 Envelope, regions and chunks (LC14)

- Each city has a bounded **envelope** (`PARAM.city_envelope_km`: 6 km × 6 km standard, 9 × 9 for slot-1 capitals) with a **macro plan** generated at genesis for the whole envelope: terrain (2 m height grid at 16 m sampled macro resolution), water bodies, coastline, rivers planned at basin scale (not per chunk), protected land, the arterial skeleton, landmark axes, district plan, and **reserved development corridors**.
- The envelope is divided into **generation regions** of 512 m–2,048 m (sized by morphology: dense wards 512 m, suburbs 2,048 m). Each region has boundary contracts (crossing coordinates, street class, width, elevation, water edges). Adjacent regions consume those contracts, so seams match.
- Regions are generated (detail streets, blocks, parcels, buildings) at genesis for the developed core plus one ring, and later on demand when growth reaches a reserved corridor (§3.21.5). Generation of a region is idempotent and transactional: persist all features, then publish.
- **Render/transport chunks** of 128 m × 128 m are cut from generated regions after generation, for streaming only. A block, parcel or building crossing a chunk boundary has one owner chunk and references from others.

#### §3.19.3 Pipeline

| Stage | Output | Method |
|---|---|---|
| 1 Terrain and water | height, water mask, slope | domain-warped fBm (4–6 octaves, one warp); coastline as a personality signed-distance shape perturbed at two scales; rivers by basin-scale flow accumulation on the macro grid with smoothing; canals as authored polylines refined along the street field |
| 2 Skeleton | arterials, crossings, landmark axes, transit lines | authored constraints per personality (port basin, bridges, diagonal boulevard, rail loop, coastal spine) placed first, then arterials traced from the old centre, port and bridges along the tensor field with long separation |
| 3 Historic core | connected short-segment growth around old centres, quays and squares | agent-based growth: segments extend 20–60 m with ±25° wander, branch probability 0.3, snapping to nodes within 6 m, stop at water and steep slope; max unserved block 8,000 m² |
| 4 Planned extensions | collectors, local streets | tensor-field hyperstreamlines (grid, radial, boundary, heightmap basis fields per personality); separation: collectors 120–200 m, locals 40–90 m; orientation quantisation per district (strict 0°/90°, soft ±8°, free) |
| 5 Graph constraints | cleaned planar graph | intersection angle ≥ 35°, no edges < 8 m, no near-parallel duplicates within 10 m, connected arterial routes, every block reachable by ROAD or FOOT (pedestrian access is valid where the personality marks it, e.g. Meridia islands) |
| 6 Blocks and parcels | blocks, parcels | blocks = faces minus road widths; blocks under 300 m² become plazas, very irregular remainders parks; parcels by frontage-preserving oriented-bounding-box splits to the district's target frontage and depth (log-normal jitter); deep or irregular blocks use a courtyard fallback (perimeter strip parcels, interior court as green or shared yard) |
| 7 Land value and zoning | V field, zoning per parcel | §3.19.4 |
| 8 Buildings | archetype and parameters per parcel | shape grammar §3.19.5, heights from V and district caps |
| 9 Landmarks | one landmark per district | best parcel by V with frontage on a square or water; partly authored template plus procedural details |
| 10 Life | trees, traffic lanes, boat lanes, rail | cosmetic, seeded, client-side drawable data only |

#### §3.19.4 Land value field and zoning

```
V(p) = Σ_centres A_c · exp(−d(p,c)² / (2σ_c²)) + w_water · view(p) + w_hill · elevation(p) · prestige(district)
     + w_transit · exp(−d(p, station)/λ) + districtOffset(district) + ε · noise(p)
```

Coefficients `A_c, σ_c, w_*, λ, ε` per personality. District borders follow streets (a block belongs to one district), from the personality's district plan (seed point, preferred terrain role, target area). Zoning is a function of V, district tier and terrain: residential ladder (houses → row houses → mid-rise → high-rise), commercial (shops → offices → towers; ground floors of commercial parcels become storefront slots), industrial (warehouses, plants, port, data-center-eligible parcels where the grid allows), civic (stations, museum, city hall, stadium; never sellable), green. Slopes above the personality threshold become parks or stairs. `maxHeightM = min(districtCap, V-derived cap)`, `maxFar` per zoning class (house 0.6, row 1.2, mid-rise 3, high-rise 8, office tower 15, CBD 25).

#### §3.19.5 Building grammar

```
Lot   → Podium(h_p) Shaft(h_s) Crown        (towers)
      | Body(h) Roof                        (houses, row houses, mid-rise)
      | Shed(h) SawRoof                     (warehouses, plants)
Shaft → inset 10–30%, optional setbacks every k floors, optional twist (Kaiyo)
Crown → flat | spire | lantern | stepped | dome | helipad | antenna cluster | garden
Roof  → gable | hip | mansard | flat with props | sawtooth
```

Each district has 6–10 archetypes with parameter ranges (floor height, bay width, window style, material, setback rhythm, roof props). Heights: log-normal with median from V and district index at generation, clipped by caps, spatially correlated by a low-frequency height noise, with occasional outliers. Each building carries a seed; neighbours never share an identical parameter set except within an authored repeating terrace (tagged, LC18). `BuildingVisual` stores: parts (1–4) with base mesh id, size, quantised rotation, style id, seed, floor height, bay width, tint index. Economic mapping: archetype → `propertyType` and unit plan (e.g. mid-rise 6 floors × 4 units of 75 m² = APARTMENT_BLOCK variant with 24 units).

#### §3.19.6 Landmarks and personality signatures

Each district has exactly one landmark. Personality signatures (LC04 adopted, art-direction starting points):

| City | Recognisable image | Signature place |
|---|---|---|
| Port Avalon | crescent harbor, brick foreground, one concentrated CBD skyline, inhabited Gilt Hill | Exchange Steps toward the Customs House and harbor cranes; lighthouse; river suspension bridge; Gilt Hill observatory |
| Nordhaven City | dark fjord between terraces, mostly 2–6 floors | Fjord Forum (copper-roofed hall at the water), opera house on Opera Quay |
| Meridia | S-shaped canal, low roofscape, bell towers, modern skyline across the water | Canal Loggia framing the Business District; domed basilica |
| Sundara Coast | long beach, coastal boulevard, scattered towers, cranes | Palm Bay Marina breakwater; hotel tower |
| Kaiyo City | elevated rail loop, station tower clusters, reclaimed rectangular shore | Loop Gate where rail passes through a podium |
| others (10) | each personality file declares one geographic constraint (lake, desert mesa, delta, terraces, fjord islands, valley dam, highland plateau, mining slope, alpine lake, river locks) and one signature place | 22 names them |

#### §3.19.7 Genesis calibration (city size ↔ economy)

At genesis the generator develops parcels in priority order (§3.21.3) until the developed stock matches the launch economy: residential units = `households · (1 + naturalVacancy_RES)`, office area = launch office jobs × 14 m² × 1.08, retail = population × 1.4 m² × 1.06, industrial = industrial jobs × 55 × 1.07, hospitality = population × 0.35 × 1.10. Buildings get synthetic ages (log-normal median 35 GY, older in heritage districts) and conditions `clamp(N(80, 10), 40, 100)`. This guarantees the visible city and the economic stock are the same thing (pillar "everything is real", old 06 §2). Port Avalon at launch: about 104,000 households, about 15,000 residential buildings, 1,900 commercial buildings, 600 industrial; about 18,000 buildings total.

### §3.20 Binding the economy to the map

| Source | What appears | Where | Driven by |
|---|---|---|---|
| NPC base economy (pools) | ordinary fabric | by zoning | §3.0 pools and §3.21 lifecycle |
| Listed company (05/09) | HQ building with the company's name | CBD parcel of its home city | §3.20.1 |
| Player company | its office building (COMPANY_BUILDING) | the HQ prop it designates | §3.15.6 |
| Player business (09) | storefront with the shop's moderated name, awning by sector | its premises unit | §3.15 |
| Property (any owner) | the building/unit itself | its parcel | ownership shown only per §3.24 |
| Development project | construction site, crane, then building | its parcels | §3.11 |
| Hall of Patrons | civic building with 12 recognition positions | reserved parcel in each CBD | §3.22 |
| Lifestyle at home (14) | yacht in marina, cars in drive, helipad | the home prop | opt-in only |
| World events (16) | festivals, dark districts after a blackout, storm damage, construction booms | where they happen | causal events only |

#### §3.20.1 Listed-company HQs

- At genesis each listed company gets an HQ parcel in its home city: the K best commercial CBD parcels by V (K = companies in that city), assigned in order of genesis market-cap rank. Thereafter **companies never move because of rank** (old 06 Q6 resolved, LC05). An HQ relocates only on a real event: the company relocates by corporate decision (09 for player companies; 16 for NPC companies, at most once per game quarter), merges (the survivor keeps its HQ; the target's building is re-let as a normal office tower and keeps a then/now record), or is delisted (the building stays, the sign is removed, the tower re-lets).
- Height does not track market cap. A company's building is redeveloped (taller) only when 16/09 decides an expansion and a real development project runs.
- **Market lights overlay** (LC06): optional overlay where the HQ's lit-window ratio encodes the published day return: `r = clamp(dayReturn / 0.05, −1, 1)`, `litRatio = 0.50 + 0.30·r`, using the same published quote the market view shows, with a legend and the number on tap; missing quotes render "unavailable". The default view's windows follow time of day and occupancy only.

#### §3.20.2 Storefront and premises visuals

Sign text = the business's moderated display name (15 moderation); awning by 09 sector; storefront look upgrades with 09 upgrade levels (quality and marketing axes change frontage props). OPEN while operating; CLOSED when the business fails or is sold and not re-opened; FIT_OUT during the first 2 GD after purchase. A bankrupt player's storefront closes like any failed shop with no name attached to the failure (old 06 §10).

### §3.21 Physical lifecycle and growth

#### §3.21.1 Parcel lifecycle

`PLANNED → SERVICED → BUILDING → OCCUPIED ⇄ VACANT → DERELICT → REUSE → BUILDING …` and `BUILDING → STALLED` on cancellation (LC08). PLANNED parcels lie in reserved corridors not yet serviced; SERVICED have road and utilities and can be sold or developed.

#### §3.21.2 Who builds

- **Players** build through §3.11. Their projects are real supply.
- **NPC developers** (16 named actors per city, 2–4 each, plus an aggregate builder): each day close, for each district and use where `pressureHighDays ≥ PARAM.growth_days_required (7)`, NPC developers start projects on the highest-priority eligible parcels until the pipeline (area under construction for that use in the city) reaches `PARAM.npc_pipeline_target (0.6) × (demandArea − supply·(1 − naturalVacancy))⁺`, subject to the city-wide start cap. NPC projects use the same cost and schedule rules with NPC_STANDARD contractors, and are financed by 07 NPC bank construction loans, so they stop in a credit crunch. NPC developers also renovate and convert: when a district's RES pressure is high and OFFICE vacancy above 15% for 28 GD, they convert the lowest-grade office stock.
- **City-wide start cap** (LC08): new construction starts per GD ≤ `PARAM.start_cap_share (0.005)` of developed parcels, minimum 3, maximum 120; NPC starts are queued behind player starts (players are never blocked by the visual cap; their starts count toward it).

#### §3.21.3 Development priority

```
priority = 0.35·access + 0.30·adjacency + 0.20·demandFit + 0.15·planSuitability        (each normalised to [0,1], LC08)
access         = 1 − clamp(roadDistance / 400 m, 0, 1)  (pedestrian access counts where allowed)
adjacency      = share of the parcel's 8 neighbours that are developed (recomputed, never accumulated)
demandFit      = clamp(pressure_{d, zonedUse} − 0.85, 0, 0.65) / 0.65
planSuitability= 1 − slopePenalty − 0.5·[heritage] ; infill and reuse parcels get +0.2 (clamped)
tie-break      = stable parcel hash (no fresh randomness)
```

Eligibility filters before ranking: SERVICED; zoning permits the use; not reserved; connected to the serviced frontier (no isolated towers).

#### §3.21.4 Vacancy, decline and reuse

- Buildings whose occupancy falls below 30% for 30 GD show VACANT (fewer lit windows, "To let"). Pools mark their lowest-value buildings VACANT first, so the visual vacancy equals the economic vacancy.
- After `PARAM.derelict_after_days (30)` GD of `pressureLowDays` in a district, pooled VACANT buildings with condition < 40 become DERELICT (removed from usable supply; boarded look). Player-owned buildings never become DERELICT by a visual rule; they become derelict only if their condition reaches 0.
- Recovery: when pressure rises, DERELICT pooled buildings are renovated (REUSE) before new parcels are developed (infill first).
- At the city edge, DERELICT pooled buildings with no recovery for 364 GD may return to SERVICED land (demolished by the land authority).
- Offline or dormant players' properties are never darkened or derelicted because of absence (LC07, LC16).

#### §3.21.5 Corridor expansion

When serviced unbuilt parcels in a city fall below `PARAM.serviced_reserve_min (3%)` of developed parcels, the land authority services the next reserved corridor: its region is generated (if not yet), roads are graded (visible roads and lamp posts first), parcels become SERVICED in priority order, and the next land auctions include them. If the envelope is exhausted, a reviewed adjacent plan is added by an admin migration (21) with boundary contracts; existing neighbourhoods are never regenerated.

### §3.22 Recognition: Hall of Patrons and crown parcels

`DEFAULT (Mathis may override)`, resolving old 06 Q6/Q10 and LC10:
1. **Hall of Patrons.** Each city has one civic building on a reserved CBD parcel with 12 recognition positions. Eligibility: opt-in, home city = this city at the snapshot, rank in the top 12 of the city's Net Worth Index board (15) at the **chapter-start snapshot**. Positions are frozen for the chapter. Position 1–3 get the brass treatment (band TOP3, TOP1 for the first). Opted-out or unfilled positions show a neutral civic treatment that encodes nothing about anyone's finances. No anonymous "Private" tower exists.
2. **Crown parcels.** Each slot-1 capital and every CBD has `PARAM.crown_parcels_per_city = 6` reserved trophy parcels with height caps 1.5× the district cap. They are sold only at land-authority auction (one per chapter per city, reserve = residual value × 1.5) to R4+, and can host real towers through §3.11. The tallest completed building in a city carries the "city crown" title for its owner's company (public, since companies and buildings are public). This makes the skyline a real record of building, not a resizing wealth meter.
3. **No height from wealth.** No structure changes height from a net-worth number. Status on the map comes from buildings people actually built, the Hall (public board snapshot) and cosmetics.

### §3.23 Addresses, history and the city brief (LC01–LC03)

- Every parcel and unit has a permanent `Address`. Addresses survive sales, redevelopment and generator upgrades; assembled parcels keep their old addresses as redirects.
- **My beginnings.** When a player's first business opens, 10 creates an owner-only `MY_BEGINNINGS` bookmark to its unit. It survives a sale and gives no ownership.
- **Plaques.** An owner (or former owner with a My beginnings bookmark) may publish a founding plaque at an address for `PARAM.plaque_price = $2,500` (sink) if the founding record is public (the business opened under their public profile). Text is moderated, max 80 characters.
- **Then / now.** For each parcel, the public state keeps the current visual and at most one retained milestone state per chapter (the state before the latest structural transition) with the transition record. Older transitions aggregate into a chapter summary. Retention: 8 chapters of milestones per parcel, then summaries only (`PARAM.history_chapters_retained = 8`).
- **City brief.** On opening the City view, at most 3 items since the player's last visit, chosen from authorised public transitions and events, ranked: (1) events at or adjacent to the player's own places (private overlay match, computed client-side from public transitions), (2) districts the player follows, (3) city-wide largest completed developments. Each item links to its source record and position, with publication time. No streaks, rewards or pop-ups.

### §3.24 Privacy: the publication contract (L11, LC16)

The public city payload is built from an **allowlist**. Every field, association, derived appearance and retained history item below is permitted; nothing else is.

| Item | Public? | Condition |
|---|---|---|
| Geometry, roads, parcels, buildings, archetypes | yes | always |
| Parcel lifecycle (construction, vacant, derelict) of pooled stock | yes | always |
| Parcel lifecycle of a player-owned building | yes | it is a physical fact; never caused by private actions other than real development/renovation and condition 0 |
| Listed-company HQ association | yes | companies are public |
| Player company HQ / building | yes | company is public |
| Storefront name, sector, open/closed | yes | 09 business purchases are public records (old 06) |
| Owner name of a property | **no by default** | shown only if the owner sets `publicOwnership = true` on that prop |
| Home location | **no by default** | shown only if the owner opts into "visitable estate" (14), and then only the estate view, not the street address unless separately opted in |
| Hall of Patrons names | yes | opt-in, chapter snapshot |
| Plaques, sponsorship labels, landmark name rights | yes | moderated text the holder chose to publish |
| Positions, orders, P&L, balances, trading style, private company operating data, login or presence, last-seen | **never** | — |
| Lit windows | yes | time of day and occupancy (pools) or the public market-lights overlay; never driven by one player's presence or private position |

Rules: (1) public city state is computed only from public inputs; a test compares two worlds with identical public records and different private trades and activity (§10). (2) Opt-outs anonymise current presentation going forward; history keeps the anonymised form. (3) The private overlay (My City) is computed client-side from the player's own authorised data, never enters public artifacts, caches, telemetry labels or exports. (4) Low-population districts: no district-level statistic derived from fewer than 5 distinct owners is published (only the pooled aggregate).

### §3.25 Cosmetic city sinks (in-game money only)

All fixed prices with previews; none affects demand, rent, rank, location_j or odds (LC09, L7 respected because these are in-game money, never real money).

| Item | Price | Notes |
|---|---|---|
| Shop facade kits (awning, lettering, shutters) | free starter set of 3; $500–$250,000 premium kits | per storefront |
| Company architectural kit | $50,000–$25,000,000 | applies on the next completed development or renovation of a company building |
| Crown style for a building the player built | $1,000,000–$50,000,000 | within the archetype's crown envelope |
| Landmark naming right | auction per chapter, reserve $5,000,000 | one per landmark, moderated name, chapter term |
| Public-space sponsorship (park, plaza) | $250,000–$20,000,000 per chapter | plaque only; no control of rents or access |
| Founding plaque | $2,500 | §3.23 |
| Skyline portrait (framed print of public view) | $10,000 | 14 Vault item, no Prestige unless 14 says so |

Reason code `RE_COSMETIC` (SINK, BURN; payer account 5200 for a character, 5050 for a company), except landmark naming rights: the auction proceeds are a TRANSFER to the city government (`CITY_NAMING_RIGHT`, per E-9; E-29). Public-space sponsorships (park, plaza) are likewise a TRANSFER to the city government (`CITY_SPONSORSHIP`, E-33).

### §3.26 Publication and delivery (19 owns the protocol)

- At day close, after the district step, 10 marks dirty parcels and regions and queues a publication job. A worker builds the public state delta, writes static artifacts, then atomically advances the `CityManifest.stateVersion`. The tick carries one small stamp per city `city: { [cityId]: stateVersion }` (19); clients fetch state deltas over HTTP from the cache only when the City view or wallpaper is visible and the stamp moved (old 06 §8.5, LC17). A delta names its base version; a missing base forces a snapshot.
- Static chunk files are immutable and addressed by content hash. Prior snapshots are retained for 2 versions for interrupted clients.
- Publication may lag the economy by up to `PARAM.city_publish_max_lag_ticks (1,440)`; cards always link to live game data and mark "city update pending".
- Rendering (17 owns layouts; summary for builders): orthographic camera at 45° yaw and **30° elevation** (a true 2:1 diamond, LC11 correcting old 06's 26.565°), four quarter-turn rotations, continuous zoom 0.25×–4×, instanced prisms with shader-drawn windows, render tiers T0 picture / T1 light / T2 full, render on demand, zero frames while hidden, reduced motion stops autonomous movement, list view for every tappable category (accessibility), three.js behind a `CityRenderer` interface loaded only when the City view opens. Bounded resident detail: at most 12,000 visible building parts and 2 million canvas pixels on phones (LC12 starting limits).

### §3.27 Dormancy and absent owners

- After 30 real days without login (15/14 dormancy), every prop of the account switches to manager-run with the default policy (if SELF, an NPC agency is assigned at 8%); income continues (property is passive by nature; old 01's 50% dormant income rule applies to businesses, not rent).
- After 90 days, unique assets (islands, crown parcels, landmark rights) go to an estate sale (14/15); proceeds to the owner as cash.
- Mortgages continue; covenant breaches on a dormant account are cured automatically from the account's cash if available, otherwise standard foreclosure applies.

---

## §4 Player intents

Envelope per 00 §5.5. Common validation for every `prop.*` intent: actor is the owner or an operator acting under a Mandate that covers the action (15); actor not Held (13) unless the intent is a cure payment, a sale ordered by a court, or a policy change; property not `heldByCourt` except for court-permitted actions; rate limits per 00 §5.5. Money checks use available cash after holds. All amounts are in the property's currency; the client may submit in another currency and 06 converts at the tick's FX mid with 06's spread.

| Kind | Payload | Validation | Effect |
|---|---|---|---|
| `prop.buyListing` | `{ listingId, maxPrice, financing?: { loanQuoteId } }` | listing ACTIVE; `maxPrice ≥ ask`; rank and city access (§3.2.4, §3.6.2); cash ≥ ask·(1 − LTV) + 4% costs; quote valid; buyer not the seller's linked account at an off-market price (15) | settle per §3.9.5 at the next P13 (cross-bloc delay applies); carve out of pool if NPC; emits `prop.purchased` |
| `prop.offer` | `{ listingId, price, financing?, expiresInTicks ≤ 2,160 }` | as above with `price` | creates Offer; NPC sellers auto-accept if `price ≥ appraisal·(0.97 − 0.05·stress)`, else reject at next game hour; player sellers decide |
| `prop.respondOffer` | `{ offerId, accept: boolean }` | seller owns listing; offer OPEN | accept → settle; reject → REJECTED |
| `prop.list` | `{ propId, askPrice, venue: 'OPEN_MARKET' \| 'P2P_EXCHANGE' \| 'AUCTION', minAcceptable?, auction?: { reserve, endTick } }` | not under development; mortgage lender consent if LTV_now > 0.8·maxLTV (auto-granted when proceeds cover the loan) | creates Listing; NPC hazard begins (OPEN_MARKET); P2P listings go to 15's exchange |
| `prop.delist` | `{ listingId }` | seller; no accepted offer | WITHDRAWN |
| `prop.sellToFund` | `{ propId, minPrice }` | not frozen; `minPrice ≤ quote` | sells at §3.9.3 quote or queues |
| `prop.setUse` | `{ propId, mode: PropUseMode }` | §3.14 cooldown and vacancy rules; COMPANY_PREMISES only for a business of the same owner chain | changes mode; related-party lease if premises |
| `prop.setPolicy` | `{ target: propId \| groupId, policy: Partial<ManagementPolicy> }` | fields in range (`maintenanceLevel ∈ [0,1.5]`) | policy applied from next game hour |
| `prop.hireManager` | `{ target, managerKind, managerRef?, exceptionThreshold }` | player agency accepts (15 service contract); AI model deployment exists and is a PROPERTY_OPS product (11) | ManagerContract created |
| `prop.fireManager` | `{ contractId }` | owner | notice period runs (agency default 7 GD), then SELF |
| `prop.group` | `{ action: 'create' \| 'add' \| 'remove' \| 'delete', groupId?, name?, propIds? }` | owner owns all props | PortfolioGroup changed |
| `prop.approveException` | `{ exceptionIds: Id[], decision: 'APPROVE' \| 'DECLINE' \| 'DEFER' }` | owner | repairs paid or declined (declined repair → §3.7.1 penalty) |
| `prop.setRent` | `{ unitId, ask }` | vacant unit; `0.5·market ≤ ask ≤ 2·market` | overrides policy for that unit until let |
| `prop.leaseToPlayer` | `{ unitId, tenantId, rentPerGD, termGD, deposit }` (via 15 contract template "Lease") | tenant accepts in 15; anti-funneling band ±25% of market unless related-party (then ±10%) | Lease created with `contractId` |
| `prop.evict` | `{ leaseId }` | arrears ≥ policy window, or lease ended | EVICTING flow (§3.6.6) |
| `prop.renovate` | `{ propId, targetCondition?, gradeUpgrade?: 'B' \| 'A' }` | funds; tenants vacate rule for grade upgrades | creates renovation or RENOVATION_MAJOR project |
| `prop.insure` | `{ propId, cover }` | 08 product exists | delegates to 08 |
| `prop.publicOwnership` | `{ propId, public: boolean }` | owner | toggles OWNERSHIP_PUBLIC binding next publication |
| `prop.mortgage.quote` | `{ propId \| listingId, product, ltv, termGY, rateType }` | eligibility §3.10.1 | returns quotes from all lenders willing (NPC banks + player banks), valid 30 ticks |
| `prop.mortgage.accept` | `{ quoteId }` | quote valid; at purchase or on an owned unencumbered/second-lien-eligible prop | 07 originates (`CREDIT_CREATE`), lien recorded |
| `prop.mortgage.prepay` | `{ loanId, amount }` | cash | applies to principal; penalty if fixed |
| `prop.mortgage.refinance` | `{ loanId, quoteId }` | §3.10.7 seasoning for cash-out | atomic payoff and new loan |
| `prop.mortgage.cure` | `{ loanId, method: 'PAYDOWN' \| 'COLLATERAL' \| 'SELL' \| 'REFI', amount?, collateralIds?, quoteId? }` | loan in CURE | cure applied; status CURRENT if covenant restored |
| `prop.dev.bidLand` | `{ auctionId, parcelId, bid }` | rank §3.11.1; cash ≥ bid (held in escrow until auction close) | sealed bid; result at auction close |
| `prop.dev.plan` | `{ parcelIds, kind, targetType, uses, grossAreaM2, floors, archetypeId, contractor, contingencyPct, facadeKitId? }` | parcels owned by actor, contiguous ≤ 6; archetype allowed for zoning; area ≤ FAR; height ≤ cap or a permit request attached | creates DevelopmentProject in LAND/PERMIT with a full budget and pApprove shown; nothing spent |
| `prop.dev.applyPermit` | `{ projectId, kind }` | project planned; fee cash | Permit QUEUED |
| `prop.dev.object` | `{ projectId }` | objector owns a prop within 150 m; fee; one per project | pApprove −0.05 |
| `prop.dev.appeal` | `{ permitId }` | permit REJECTED, appellant is the developer; fee cash ($25k + 0.2%) | appeal filed; decided by 13's planning tribunal in 7 GD (p 0.30 variance math, 0 heritage) (E-39) |
| `prop.dev.start` | `{ projectId, financing: { equity, constructionQuoteId? } }` | permit APPROVED; concurrency cap; equity + loan ≥ phase 1 cost + 10% buffer; contractor capacity | phase SITE_PREP begins; escrow funded |
| `prop.dev.pause` / `prop.dev.resume` / `prop.dev.cancel` | `{ projectId }` | developer | §3.11.11 |
| `prop.dev.presell` | `{ projectId, units: number, price }` | strata project; ≤ 70% units | presale inventory offered |
| `prop.dev.demolish` | `{ propId }` | permit DEMOLITION approved; no active leases | building removed, LAND prop remains |
| `city.setHome` | `{ cityId }` | once per chapter (or free move into a new city within 14 GD); fee | home city updated at next day close |
| `city.follow` | `{ districtId, on: boolean }` | ≤ 20 follows | brief and notifications include it |
| `city.bookmark` | `{ parcelId, unitId?, label }` | ≤ 200 bookmarks | private bookmark |
| `city.hallOptIn` | `{ on: boolean }` | — | affects next chapter snapshot |
| `city.plaque` | `{ parcelId, text }` | §3.23 eligibility; moderation pass | PLAQUE binding next publication |
| `city.cosmetic.buy` | `{ itemId, targetRef }` | price; target eligible | cosmetic applied; `RE_COSMETIC` sink |
| `city.sponsor` | `{ parcelId (civic green), chapterCount, label }` | civic space free | sponsorship for the term |
| `city.placeBusiness` | `{ bizId, unitId }` | 09 business of actor awaiting premises or relocating; unit free and eligible | premises lease per §3.15 |

---

## §5 Engine events

All events use 00 §5.6. `PUBLIC` events feed the Wire (16 decides which become news), the city transitions and boards.

| Kind | Payload | Visibility |
|---|---|---|
| `city.dayClose` | `{ cityId, population, households, jobs, priceIndex, vacancyByUse, rentIndexByUse }` | PUBLIC (aggregates only) |
| `city.districtMarket` | `{ districtId, byUse: { rentIndex, vacancy, pressure, capRate, priceIndex } }` | PUBLIC |
| `city.employmentDelta` | `{ cityId, districtId, jobs, sector, cause }` | PUBLIC (from 09/16 public events) |
| `city.opened` / `city.opening` | `{ cityId, bloc, openTick }` | PUBLIC |
| `city.transition` | `CityTransition` | PUBLIC |
| `city.manifestPublished` | `{ cityId, stateVersion }` | PUBLIC |
| `prop.listed` / `prop.delisted` | `{ listingId, propId, type, districtId, ask }` (seller hidden unless public ownership) | PUBLIC |
| `prop.purchased` | `{ propId, type, districtId, price, buyerDisplay? }` | PUBLIC record of the sale (price public; buyer shown per §3.24); PARTIES full |
| `prop.leaseSigned` / `prop.leaseEnded` | lease fields | PARTIES |
| `prop.tenantDefault` / `prop.eviction` | `{ leaseId, arrears }` | PARTIES |
| `prop.appraised` | `Appraisal` | PRIVATE (owner), lender as PARTIES |
| `prop.exception` | `{ propId \| groupId, kind, amount }` | PRIVATE |
| `prop.conditionLow` | `{ propId, condition }` | PRIVATE |
| `prop.damage` | `{ propId, peril, damagePct }` | PARTIES (owner, insurer) |
| `mortgage.originated` / `paid` / `late` / `covenantBreach` / `cureStarted` / `cured` | loan fields | PARTIES (borrower, lender); 07 copies |
| `mortgage.foreclosure` | `{ loanId, propId, saleValue, shortfall }` | PARTIES; PUBLIC as an anonymous "foreclosure sale in District X" |
| `dev.planned` | project summary | PRIVATE |
| `dev.permitDecision` | `{ permitId, status, reason }` | PARTIES; PUBLIC for approved projects over 10,000 m² ("Planning approved: 32-floor office tower at 2 Exchange Steps") |
| `dev.phaseStart` / `dev.phaseEnd` | `{ projectId, phase, overrun, delayTicks }` | PRIVATE (developer); construction start PUBLIC as a transition |
| `dev.completed` | `{ projectId, buildingId, appraisal }` | PUBLIC transition; PRIVATE appraisal |
| `dev.cancelled` / `dev.stalled` | `{ projectId }` | PUBLIC transition (no name) |
| `land.auction` / `land.auctionResult` | `{ auctionId, parcels, results: { parcelId, price }[] }` | PUBLIC (winner shown only if public ownership) |
| `unique.auction` / `unique.sold` | island or right | PUBLIC |
| `hall.snapshot` | `{ cityId, seats }` | PUBLIC |
| `prop.relatedPartyLease` | lease id, deviation | SEALED (13 evidence for I07 cases) |
| `prop.appraisalByPlayerFirm` | appraisal, firm, client | SEALED (13 fraud evidence) |

---

## §6 NPC behaviour

### §6.1 Households (aggregate, `hh`)

Location choice §3.4.1; tenancy, renewals and defaults §3.6; owner-occupier share of RES stock per personality (40–65%) is held by the `hh` entity as pooled stock that never lists except through the NPC listing rate. Household formation responds to rents (`hhSize` +0.02 per GY while affordability is below 70% of launch). 16 owns hh income and consumption.

### §6.2 NPC landlords and funds

Per city, 3–6 named NPC landlords (16 actors; 22 names; e.g. "Harbor Realty Trust", "Gilt Hill Family Office") own the non-hh pooled stock in shares fixed at genesis. They set rents at market, list at the NPC listing rate (§3.9.1), sell instantly to nobody (the NPC property fund is the instant buyer), and follow balance-sheet limits: when a landlord's LTV exceeds 0.75 they double their listing rate; when cash exceeds 5% of their assets they bid in land auctions with `bid = reserve · U(1.00, 1.08)` on the top-priority parcels. Two of them per bloc are the listed REITs of §3.16.

### §6.3 Land authority and city government

Holds serviced unbuilt land, runs weekly land auctions, services corridors (§3.21.5), runs the planning office (§3.11.3), sets property tax (from the bloc `gov`, changed only by 16 politics events, at most ±0.2 percentage points per GY), invests in transit when 16's political model approves a city project (one per city per game year at most; +0.3 transit to 1–2 districts after a 182-GD build that shows as a real construction project), and adds grid capacity when the power utility (09 concession or NPC) invests.

### §6.4 NPC developers and contractors

§3.21.2. NPC developers have finite capital (16 balance sheets) and use 07 construction loans; in a crunch they cancel the lowest-margin projects first, producing stalled shells. NPC contractors have unlimited capacity at their price grades.

### §6.5 NPC buyers and the NPC property fund

Buyers arrive per §3.9.2 and buy at ask. The fund buys instantly at the discount (§3.9.3) within capacity, holds what it buys in pools, and re-lists at the NPC listing rate.

### §6.6 NPC banks

07 NPC banks originate mortgages to players and NPC buyers per §3.10 with credit conditions from 04 and their own capital (07). They foreclose per §3.10.5.

### §6.7 Named NPC companies

16 decides HQ relocations (rare) and expansions (development projects on owned or acquired parcels), employment deltas and closures, all through the same intents.

---

## §7 Screens (layouts in 17)

| Screen | Shows | Main actions |
|---|---|---|
| **City view** (Empire → City) | the procedural city, four rotations, zoom; overlays: My places (private), Districts (rent, vacancy, pressure heat), For sale, Under construction, Market lights, Companies (HQs by sector with pattern), History (then/now); City brief (≤ 3 items); tabs per city with locked cities labelled by rank | tap building → card; "Show on map" from any card |
| **Building / unit card** | address, type, use, area, condition band, public owner or "Private owner", occupants (storefront names), listed status and ask, district stats, then/now | buy, offer, follow district, bookmark, open company card |
| **District panel** | tier, rents and vacancy by use (sparkline 91 GD), pressure gauge, cap rates, price index, desirability breakdown, events, upcoming land auctions, projects under construction | follow, land auction bids |
| **Property manager** (Empire → Properties) | every prop and group: value, NOI after costs, occupancy, debt, LTV, DSCR, condition, exceptions; filter by city/district/type | set policy, hire manager, group, list, renovate, refinance |
| **Property detail** | full economics: rent roll, leases, arrears, costs, appraisal history (income and comps), mortgage schedule and covenant headroom, projected cash flow 91 GD | all `prop.*` |
| **Buy flow** | listing, appraisal, estimated NOI after costs, financing quotes side by side, total cash needed, costs (3% + 1% + taxes), time-to-sell estimate band for resale | buy, offer |
| **Mortgage desk** | quotes, schedule, covenant tests, cure options with costs | quote, accept, prepay, refinance, cure |
| **Development planner** | parcel(s), zoning envelope, archetype gallery for the zoning (preview in the city), budget lines, schedule, pApprove, contractor options with overrun and delay bands, financing, projected value and margin range (P10/P50/P90), presale demand estimate | plan, permit, start, presell, pause, cancel |
| **Land auctions** | weekly lots with reserve, zoning, priority, comps | sealed bid |
| **Exceptions inbox** | grouped exception cards | approve/decline/defer |
| **Home / Estate** (14) | the primary home rendered | — |
| **Hall of Patrons** (World → Boards → City) | the 12 seats, snapshot date | opt in |
| **Isla Serena** | archipelago vignette, islands, auctions | bid (R6) |

Legibility rule: every action shows its exact cost, the affected numbers before and after, and any probability (permit, overrun, time-to-sell) as a band before confirmation.

---

## §8 Edge cases

1. **Purchase and listing race in one tick.** Intents are ordered by P0 sequence; the first valid `buyListing` wins; later ones fail with `LISTING_SOLD`, holds released.
2. **NPC buyer arrival and player offer acceptance in the same game hour.** The NPC hazard is evaluated in P9 after intents; an accepted player offer (P1) takes precedence and cancels the NPC arrival.
3. **Owner becomes Held mid-cure.** Cure payments are still accepted; the cure deadline extends by the Held duration (13) up to 24 h.
4. **Covenant breach on a property under development.** Construction loans test LTC at each phase start; a breach blocks the next phase until cured; no foreclosure while a phase is mid-way unless payment default.
5. **Commodity spike mid-project.** Overrun shock applies at the next phase start only; a phase already drawn is not repriced.
6. **City currency crisis (04 capital controls).** Sales proceeds in that currency cannot leave the bloc during controls (04's rule); rents keep accruing; NW marks convert at 06's controlled rate.
7. **A property whose parcel is in a region later expanded.** Bindings persist; boundary contracts never touch existing parcels.
8. **Generator upgrade.** Existing regions keep their package; new regions may use a new package with boundary contracts; addresses unchanged.
9. **Business sold while pending placement.** The pending reservation transfers with the business; cancelled on closure.
10. **Two businesses request the last storefront.** Ordered by intent sequence; loser goes to pending placement.
11. **Strata building partly owned by players, rest NPC.** Maintenance of common parts is shared by area; whole-building renovations need ≥ 75% of area owners' consent (NPC owners consent when the renovation's appraisal gain exceeds its cost).
12. **Foreclosure with a second lien and a court freeze.** Court freeze (13) suspends the foreclosure clock; interest continues; the lender may petition 13.
13. **Mortgage on a property in a city that the borrower can no longer access by rank.** Rank is never lost (14), so access is permanent once gained.
14. **Island owner bankrupt.** 13 collection may force an auction of the island through the estate-sale venue at reserve = appraisal × 0.8.
15. **Zero demand district** (all jobs leave). Pressure floors at 0.5; rents fall at most 0.5%/GD; pooled stock goes derelict over time; player props keep operating with whatever tenants renew.
16. **Negative residual land value.** Land appraises at a floor of 5% of its genesis value; auctions with no bids are re-listed next week at a 10% lower reserve, floor 50% of genesis.
17. **Lease end while owner switches to OWNER_OCCUPIED.** Allowed only after the lease ends; the intent is queued until then if submitted as `queueUntilVacant: true`.
18. **Replay.** All draws are named-stream; publication jobs are idempotent by `stateVersion`.
19. **Dormant owner with a project mid-construction.** The project continues to completion with its funded escrow; further phases need funds; if unfunded, it pauses 28 GD then stalls.
20. **Partition boundary** (00 §5.7): a property sale between characters in different partitions settles by hold → settle (02/19); the listing shows "settling" until both sides commit.

---

## §9 Exploits and counters

| # | Exploit | Counter |
|---|---|---|
| 1 | Circular refinancing on inflated marks (E08) | SYSTEM appraisals only; comps exclude related-party and flagged sales; cash-out seasoning 28 GD and +10% cap per cash-out (§3.10.7) |
| 2 | Wash sales between alts to pump a district's comps | qualifying-sale filter (§3.8.4), trimming, n0 shrinkage, 15 collusion graph, 13 fraud case from SEALED events |
| 3 | Buy, renovate cheaply through own contractor, refinance at the new value | related-party contractor capex counts at cost; renovation value uplift is from condition and grade formulas, not the price paid |
| 4 | Gentrification farming (pour fake capex to raise momentum) | momentum capped at 4% of district value; only completed arm's-length work counts |
| 5 | Cornering a district's stock | NPC listing flow is finite (0.2% per GD); 13 CMA review when one owner chain holds > 25% of a district's RES area or > 40% of its office area (forced divestment of the excess over 91 GD); prices rise as listings thin |
| 6 | Hammering the instant-sale fund to crash a district's marks | instant sales and forced sales are excluded from the comps index; daily fund capacity; bad-bank overflow |
| 7 | Flipping homes between rented and owner-occupied for Prestige or tax | 1-game-week cooldown; vacancy and lease-end conditions |
| 8 | Using the city to infer private positions (market lights, lit windows, construction) | allowlist (§3.24); market lights use public quotes; no presence-based visuals; paired-world privacy tests |
| 9 | Objection spam against rivals' permits | objector must own property within 150 m, fee $5k, one per project, max −0.20 |
| 10 | Squatting all storefront slots with shell businesses | each business pays rent; 09 business upkeep; 13 CMA concentration rule extends to storefront slots (> 30% of a district's storefronts by one owner chain triggers review) |
| 11 | Exploiting cross-bloc delay to arbitrage FX | the price is fixed at intent time in local currency; FX moves are the buyer's risk |
| 12 | Default intentionally on non-recourse loans after cash-out | cash-out seasoning; non-recourse only for company-held commercial; a strategic default after a cash-out within 91 GD is evidence of fraud (13), and foreclosure Reputation −3 |
| 13 | Presale deposits as a free loan, then cancel | deposits refunded in full from escrow; developer cannot touch more than 50% and only for construction draws |
| 14 | Pending placement spam to block a district | pending reservations need an operating business that pays its upkeep; at most 3 pending per owner per city |
| 15 | Dumping a whole portfolio during a crisis to cascade others' covenants | fair-value band forced-sale pricing; comps exclude distressed sales; covenant tests use SYSTEM appraisal smoothing (EWMA) |
| 16 | Placing a business in a "nice-looking" slot via cosmetics for demand | cosmetics never touch `location_j` or rent (§3.15.3) |
| 17 | Recognition gaming by switching home city before the Hall snapshot | home city change once per chapter, and the snapshot uses the home city held at the snapshot with the account in that city for ≥ 14 GD |
| 18 | Timing purchases ahead of district events | E05 events become public at the same tick they enter the engine (16 causal news); no pre-announcement except scheduled public projects |

---

## §10 Acceptance tests

1. Genesis: for every launch city, residential units = households × 1.05 (±0.5%), and office, retail, industrial and hospitality stock match §3.19.7 within ±1%.
2. The same world seed and generator package produce byte-identical persisted regions on two machines; content hashes match.
3. Every parcel touches a street (ROAD or permitted FOOT/CANAL access); no parcel overlaps another parcel, a road or water; each district has exactly one landmark; every district in §3.2.2 exists on the map.
4. Region seams: every boundary-contract crossing has a matching street on both sides within 1 cm.
5. No generated building exceeds its parcel, its height cap or the slope rule.
6. Carving a pooled building into a prop and re-pooling it changes no pool totals except by the carved amounts; total area and total occupied area are conserved to the m².
7. A rent of a 30 m² Riverside Lofts studio, grade B, condition 85, amenity 1.0 at launch is 30 × $0.55 × 0.9325 = $15.39 per GD (±$0.01).
8. With pressure held at 1.2 for 364 GD and π = 0, the rent index rises by `exp(0.8·0.2) − 1 ≈ 17.4%` (±0.5%), and no daily move exceeds 0.5%.
9. Raising `y10_b` by 100 bp at a day close raises every cap rate in that bloc by 100 bp (unless clamped) and lowers every income-weighted appraisal at the next appraisal by the formula's amount; the change is visible on the same day close in daily marks via the model price index.
10. An open-market listing at ask = appraisal in a mid district with stress 0 sells with an expected time of 3.6 GD; over 10,000 seeded trials the mean is within ±5%.
11. Instant sale at stress 0 pays exactly 90% of appraisal; at stress 1 pays 75%.
12. A purchase posts transaction cost 3% as a TRANSFER to the NPC frm sector (`RE_TXN_COST` = `PROP_TXN_COST_NPC`, E-39 amendment; was SINK) and stamp duty 1% as a TRANSFER to the bloc `gov` (`RE_STAMP_DUTY`, E-27); ledger conservation holds (03 invariant).
13. A residential mortgage at LTV 0.80 cannot be originated above 0.80 × (1 + 0.25·min(0, c_b)); at `c_b = −1` the max is 0.60.
14. Annuity payments of a $400,000 25-GY loan at 6.0% equal `B·r/(1−(1+r)^−n)` with `r = 0.06·7/364`, `n = 1,300` (±1 micro-unit after rounding by `toMoney`).
15. A covenant breach that is not cured within 2,160 ticks results in a foreclosure listing; unsold after 2,160 ticks, the property sells at `appraisal·(1 − 0.10 − 0.15·stress)`; proceeds are distributed in the order costs, lien 1, lien 2, borrower.
16. A forced sale never enters the comps index; after 100 forced sales in one district, the district PI changes only through the model term.
17. Cash-out refinance within 28 GD of purchase is rejected with `SEASONING`.
18. A related-party lease outside ±10% of market rent is rejected at intent validation; within the band, 03 consolidation eliminates the rent from group profit.
19. A by-right permit under 5,000 m² is decided in 2 GD (1,440 ticks) after leaving the planning queue; queue order is FIFO.
20. Development durations: an APARTMENT_BLOCK of 1,560 m² with no delays completes in 96 GD; phase split 15/50/35%.
21. Overrun draws reproduce exactly on replay; their distribution over 10,000 seeds matches `exp(N(0, σ))` per contractor grade (KS test p > 0.01).
22. Cancelling a project leaves a STALLED parcel and a LAND prop with a 40% shell credit; presale deposits are refunded in full.
23. A business purchase with no free storefront enters pending placement within the same tick and receives the next unit that frees in that district in queue order.
24. `location_j` for a business is identical with and without any cosmetic purchase.
25. Home mode switching twice within 5,040 ticks is rejected with `COOLDOWN`.
26. Privacy pair test: two worlds with identical public records and different private trades, orders, presence and balances produce byte-identical public city state for 365 simulated GD.
27. No public binding names a property owner who has not set `publicOwnership = true`; a test scans every public artifact for owner ids.
28. Market lights: a company with published day return +2.5% shows `litRatio = 0.65`; with no quote shows "unavailable".
29. A listed company's HQ parcel never changes because of market-cap rank changes over a 365-GD simulation; it changes only with a relocation, merger or delisting event.
30. Growth: with district RES pressure held at 1.2, NPC construction starts begin on GD 8 (after 7 days above 1.10) on the highest-priority eligible parcels, never exceed the city start cap, and stop within 1 GD of pressure falling below 1.10 (no new starts; ongoing projects continue).
31. Decline: after 30 GD below 0.85 pressure, only pooled vacant buildings with condition < 40 become derelict; no player-owned building becomes derelict while its condition > 0.
32. A 365-GD simulated history with a crash, a recovery, 5,000 player transactions, a generator package upgrade and a worker restart keeps every address and binding stable and every invariant in tests 3–6.
33. New city opening triggers when `N_a` crosses the next 4,000 step, in the bloc chosen by §3.2.3 rule, with a Wire announcement 5,040 ticks before opening.
34. Hall of Patrons seats are identical for the whole chapter and change only at the chapter-start snapshot; opted-out players never appear and leave a neutral seat.
35. A severe crunch scenario (y10 +300 bp, `c_b` → −1 over 30 GD, F → 85) produces a city price-index drawdown between 20% and 35% within 90 GD across the 15 cities' median (20 balance band).
36. The ROOM rent at launch in Eastside Docks equals 18 m² × $0.30 × conditionMult × amenityMult of that unit.
37. Every money movement in this module has a reason code from §3.7.2, §3.9.4, §3.10.2, §3.11.8, §3.18, §3.25 and passes 03's conservation invariant every tick.
38. City publication never runs inside a tick: tick duration with and without the publication worker enabled differs by less than 1% at p99 in 19's load test.
