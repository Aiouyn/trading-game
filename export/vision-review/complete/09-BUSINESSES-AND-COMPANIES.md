# 09 — Businesses and Companies

Owner module: 09. Phase: P9 `real` (hourly-staggered business operations, daily close of business books), with NPC competitor and customer behaviour in P3/P4, corporate actions and M&A settlement in P8/P9, and governance votes in P12.
Scope (00 §1): the business catalog, demand and market share, operations, upgrades, staff, supply chains, contracts with NPC customers, company building, corporate finance, IPOs, M&A, LBOs, restructuring.
Depends on: 02 (clock, RNG streams), 03 (ledger, statements, consolidation, taxes), 04 (macro: output gap, inflation, wages, rates, FX), 05 (orders, marks, auctions, fundamental-value interface), 06 (commodities, bonds, claims instruments), 07 (loans, credit conditions, DIP lenders), 08 (insurance, ratings, funds as investors), 10 (cities, districts, storefront slots, premises, population), 11 (AI operators, data, compute), 12 (attack surface, staff loyalty, espionage), 13 (regulators, antitrust, courts, sanctions, insider rules), 14 (ranks, licenses, Reputation, Prestige), 15 (contracts engine, filings, alliances, syndicates), 16 (households, NPC firms, named actors, news), 22 (names and per-category data).

Conventions: Money is `Money` (bigint micro-units). "Game day" = 720 ticks = 1 real hour; "game hour" = 30 ticks; "real day" = 24 game days. Old-vision durations stated in real hours are converted 1 real hour = 1 game day (L9). Business tiers are named B1–B6 (00 §5.8); the old vision called them T1–T6.

---

## §1 Purpose

Businesses are the steady engine of wealth (the tycoon half; markets are the volatile half, 01 §4). Companies are how a player turns businesses into an institution: found a company, build products, hire, borrow, compete for customers, publish earnings, list on the exchange, acquire rivals, survive distress.

What the module guarantees:
1. **Real shared competition.** Every business sells into a demand pool shared with every other player and NPC competitor in its market (city or district × product category × segment). A logit share model decides who wins customers (01 §4.1). Similar firms coexist; nothing consumes a unique worldwide slot except named unique infrastructure (C03).
2. **Distinct economics.** Each business belongs to one of 16 economic archetypes with its own formula (footfall retail, local service, B2B contract, commodity producer, processor, platform, subscription, hit-driven, tourism, transport capacity, regulated utility, compute provider, trial binary, financial institution, trophy, flip trading). A niche is a combination of archetype, category, segment, location, operating model and promise (C02), not just a new name (C04, R01).
3. **Customers with requirements.** NPC customers post tenders with price caps, reliability, certification, response time and confidentiality requirements; switching takes effort; concentration has risks (C05–C08).
4. **Company building in depth** (Mathis directive 2026-10-09, STONKS-9800 spirit): R&D, product lines, marketing, hiring, production and capacity, pricing, expansion, financing; real operating economics; filings and earnings that feed the market; IPO onto the same exchange.
5. **Corporate finance and control**: capital structure, covenants, dividends, buybacks, issuance, IPOs, takeovers and defences, activism, LBOs, restructuring with absolute priority. A bankrupt company is a market, not just a delisting (V3 3.7).
6. **Honest money.** Revenue from NPC customers is a faucet, costs paid to NPCs are sinks, everything between players is a transfer; diminishing returns (logit share, exponential upgrade costs, finite demand) and the offline cap keep business income from running away (01 §8.3).

---

## §2 Entities

### §2.1 Enumerations

```ts
type BizTier = 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6';
type BizSector =                                    // the 13 business sectors (MASTER-BIBLE: ~150 businesses across 13 sectors)
  'FOOD_HOSPITALITY' | 'RETAIL_CONSUMER' | 'REAL_ESTATE_SERVICES' | 'LOGISTICS_TRANSPORT' | 'ENERGY'
  | 'MINING_AGRICULTURE' | 'MANUFACTURING' | 'TECH_AI' | 'FINANCE' | 'MEDIA_ENTERTAINMENT' | 'HEALTH'
  | 'LUXURY' | 'SECURITY_LEGAL_INTEL';
type MarketSector = number;                          // 1..12, the listed-market sectors of 01 §3.2 (mapping table in §3.1.4)

type Archetype =
  'FOOTFALL_RETAIL' | 'LOCAL_SERVICE' | 'B2B_CONTRACT' | 'COMMODITY_PRODUCER' | 'PROCESSOR'
  | 'PLATFORM_COMMISSION' | 'SUBSCRIPTION' | 'HIT_DRIVEN' | 'TOURISM' | 'TRANSPORT_CAPACITY'
  | 'REGULATED_UTILITY' | 'COMPUTE_PROVIDER' | 'TRIAL_BINARY' | 'FINANCIAL_INSTITUTION' | 'TROPHY' | 'FLIP_TRADING';

type Segment = 'BUDGET' | 'MAINSTREAM' | 'PREMIUM' | 'B2B' | 'INSTITUTIONAL';
type OperatingModel = 'OWNED_PREMISES' | 'LEASED_PREMISES' | 'MOBILE' | 'ONLINE' | 'FIELD_SERVICE' | 'SITE';   // SITE = mines, farms, plants
type Promise = 'PRICE' | 'QUALITY' | 'SPEED' | 'RELIABILITY' | 'CERTIFIED' | 'CONFIDENTIAL';
type DemandSource = 'HOUSEHOLD' | 'BUSINESS_DERIVED' | 'TOURISM' | 'GOVERNMENT' | 'PLAYER_SERVICES' | 'COMMODITY_MARKET' | 'FLOW_TAKE';
type MarketScope = 'DISTRICT' | 'CITY' | 'BLOC' | 'WORLD';

type BizStatus = 'SETTING_UP' | 'OPEN' | 'IDLE' | 'CLOSED_EVENT' | 'STRIKE' | 'UNDER_REPAIR' | 'FOR_SALE' | 'SOLD' | 'FAILED' | 'SEIZED';
type MgmtMode = 'OWNER_OPERATED' | 'MANAGED' | 'PROFESSIONAL_CEO' | 'AI_OPERATOR';
```

### §2.2 Catalog definitions (static content; 22 lists every row)

```ts
interface BusinessType {
  typeId: string;                        // e.g. 'coffee_cart'
  name: string;                          // string key (L8)
  sector: BizSector; marketSector: MarketSector; tier: BizTier; archetype: Archetype;
  c0: Money;                             // base price at launch (FDL), indexed to the price level (§3.1.3)
  category: string;                      // product category id (22), e.g. 'coffee_to_go'
  defaultSegment: Segment; allowedSegments: Segment[];
  defaultModel: OperatingModel; allowedModels: OperatingModel[];
  marketScope: MarketScope;
  unique: false | 'PER_CITY' | 'PER_BLOC' | 'CONCESSION_PER_CITY' | 'CONCESSION_PER_BLOC';
  setupDays: number;                     // §3.1.5
  ref: ArchetypeRef;                     // calibration inputs (§3.2.4)
  inputs: InputLine[];                   // bill of materials per unit (§3.7)
  staffPerCapacity: Record<StaffRole, number>;
  dataRateDquPerUnit: number;            // data by-product (11)
  hackable: boolean;                     // exposes data/ops surface to 12
  rankRequired: 'R0'|'R1'|'R2'|'R3'|'R4'|'R5';
  licenseRequired?: string;              // e.g. CH_BANK for a bank
  twistRules: string[];                  // rule ids implemented in §3.4.6
}

interface ArchetypeRef {
  refPrice: Money;                       // per unit at launch price level
  cogsRatio: number;                     // κ: variable cost / revenue at ref (inputs + energy + transaction)
  fixedRatio: number;                    // φ: daily fixed costs (wages, rent, upkeep, insurance baseline) / daily revenue at ref
  capacityPerHour0: number;              // units per game hour at capacity level 0
  hoursOpen: number[];                   // tick-of-day hours (0..23) the business sells; others 0 demand
  hourProfile: number[];                 // 24 weights, sum 1 over open hours
  weekendFactor: number;                 // demand multiplier Sat/Sun
  cycleSensitivity: number;              // elasticity to 04 output gap (−1..+3)
  incomeElasticity: number;              // ε for household categories
  priceElasticity: number;               // η for category-level price response (§3.3.5)
  seasonality: number[];                 // 52 weekly multipliers over the game year (mean 1.0)
}

interface InputLine { inputId: string; kind: 'COMMODITY' | 'INTERMEDIATE' | 'ENERGY_MWH' | 'COMPUTE_GPUH' | 'DATA_DQU'; qtyPerUnit: number; }
type StaffRole = 'OPERATIONS' | 'SALES' | 'ENGINEERING' | 'RESEARCH' | 'MANAGEMENT' | 'COMPLIANCE' | 'SECURITY';
```

### §2.3 Business unit (a `biz` entity, 00 §5.3)

```ts
interface Business {
  id: `biz_${string}`; typeId: string; name: string;      // name moderated (21)
  ownerId: EntityId;                     // chr (only B1–B2) or cmp
  cityId: string; districtId: string; storefrontSlotId?: string;   // 10 assigns slots
  premises: { kind: 'OWNED' | 'LEASED' | 'NONE'; propId?: string; leaseId?: string };   // 10
  segment: Segment; model: OperatingModel; promise: Promise;
  status: BizStatus; statusUntilTick?: Tick;
  openedTick: Tick; hourOffset: number;  // hash(id) mod 30 (00 §5.1)
  levels: { capacity: number; quality: number; efficiency: number; automation: number };   // 0..25
  marketingPerDay: Money;                // flow spend (axis 4)
  campaigns: { startTick: Tick; amount: Money; brandBoost: number }[];
  chainId?: string;                      // expansion chain (axis 6)
  price: Money;                          // set by owner within ±30% of ref (§3.3.4)
  productLineId?: string;                // for product-based businesses (§3.5.4)
  condition: number;                     // 0..100
  upkeepBudgetPerDay: Money;             // maintenance spend
  staff: StaffBlock;
  managerId?: string;                    // NPC manager or AI operator
  mgmtMode: MgmtMode;
  inventory: Record<string, bigint>;     // goods archetypes: finished units and inputs
  reorderPolicy?: { daysOfCover: number; maxPrice?: Money };
  supplyContracts: string[];             // 15 contract ids (inputs bought)
  customerContracts: string[];           // tender awards and B2B contracts (sold)
  internalAllocations: InternalAllocation[];     // §3.7.4
  certifications: { certId: string; validUntilTick: Tick }[];
  share: number;                         // current market share (smoothed)
  reliability28: number;                 // on-time fill rate trailing 28 game days
  brand: number;                         // brand term in attractiveness (chain + campaigns + events)
  incidentFlags: string[];               // inspection, review, strike history (public subset)
  dayAcc: DayAccumulator;                // hourly results for the current game day
  books: BizBooks;                       // trailing statistics for valuation
  insurancePolicyIds: string[];
}

interface StaffBlock {
  headcount: Record<StaffRole, number>;
  wagePerHeadDay: Record<StaffRole, Money>;
  skillAvg: number;                      // 1..5
  morale: number;                        // 0..100
  loyalty: number;                       // 0..100 (12 reads for espionage)
  keyStaff: string[];                    // named NPC staff ids (B3+)
  vacancies: Record<StaffRole, number>; hiringUntilTick?: Tick;
}

interface DayAccumulator { units: number; revenue: Money; varCost: Money; lostSales: number; hoursOpen: number; demandSeen: number; }
interface BizBooks {
  dailyProfit: Money[];                  // last 91 game days, operating profit after all opex, before interest and tax
  revenue91: Money; profit7Avg: Money; profit28Avg: Money; growth28: number;
  capexToDate: Money; upgradesSpent: Money; lastUpgradeTick?: Tick;
}
interface InternalAllocation { toEntityId: EntityId; capacityPct: number; transferPrice: 'COST' | 'ARMS_LENGTH'; sinceTick: Tick; }
```

### §2.4 Markets, competitors and customers

```ts
interface Market {
  marketId: string;                      // `${scopeId}:${category}:${segment}`
  scope: MarketScope; scopeId: string;   // districtId / cityId / blocCode / 'WORLD'
  category: string; segment: Segment;
  demandDay: number;                     // units per game day, recomputed at t = 0 daily (§3.2)
  npcField: { weight: number; price: Money; quality: number; weight0: number };   // aggregate NPC competition
  namedNpcFirms: string[];               // 16 named private firms competing here (their own u)
  participants: string[];                // biz ids
  shares: Record<string, number>;        // smoothed shares incl. 'NPC'
  hourOffset: number;                    // market share recompute offset hash(marketId) mod 30
  hhi: number; topOwnerShare: number; topOwnerId?: EntityId;
  avgPrice: Money;
}

interface Tender {
  id: string; issuerId: EntityId;        // npc, frm, gov, hh-procurement, or a player cmp running a tender
  cityId: string; category: string;
  volumePerDay: number; durationDays: number; startTick: Tick;
  priceCap: Money;                       // per unit
  requirements: {
    minReliability: number;              // trailing on-time rate, 0..1
    certifications: string[];
    maxResponseHours: number;            // max lead time: capacity headroom must cover a day's volume within this
    minConfidentiality?: number;         // minimum defense posture DP_eff (12) for confidential work
    minRating?: RatingGrade;             // for large tenders: supplier composite rating (08)
    localPresence: boolean;              // supplier must have a business in the city
  };
  weights: { price: number; reliability: number; reputation: number; incumbency: number; quality: number };
  penaltyPerShortUnit: Money;
  switchingCostDays: number;             // qualification time if the winner is not the incumbent
  incumbentBizId?: string;
  bidDeadlineTick: Tick; status: 'OPEN' | 'AWARDED' | 'CANCELLED';
  paymentTermsDays: 0 | 7 | 14 | 28;
}

interface TenderBid { tenderId: string; bidderId: EntityId; leadBizId: string; partners: { bizId: string; volumeShare: number }[]; consortiumContractId?: string; pricePerUnit: Money; volumeOffered: number; submittedTick: Tick; }

interface Receivable { id: string; sellerBizId: string; customerId: EntityId; amount: Money; dueTick: Tick; status: 'OPEN' | 'PAID' | 'LATE' | 'DEFAULTED' | 'SOLD'; securitizedSpvId?: string; }

interface Certification { certId: string; name: string; cost: Money; prepDays: number; validityDays: number; auditPerQuarterProb: number; requirements: { minQualityLevel?: number; minCondition?: number; minComplianceStaff?: number } }
```

### §2.5 Companies and corporate finance

```ts
interface Company {
  id: `cmp_${string}`; name: string; ticker?: string;
  founderId: EntityId; foundedTick: Tick;
  jurisdiction: string;                  // bloc code (tax, court, regulator)
  homeCityId: string; hqPropId?: string; // 10 HQ building
  kind: 'OPERATING' | 'HOLDING' | 'STARTUP' | 'NPC_LISTED' | 'NPC_PRIVATE' | 'SPV_CO';
  listed: boolean; listingTick?: Tick; exchangeId?: string;
  businesses: string[]; subsidiaries: { cmpId: string; ownershipPct: number }[];
  shareClasses: ShareClass[];
  capTable: CapTableEntry[];             // derived from 03 ownership records
  debt: string[];                        // 07 loans, 06 bonds, convertibles
  covenants: Covenant[];
  board: Board; ceo: { personId: string; kind: 'PLAYER' | 'NPC' | 'AI'; salaryPerDay: Money };
  productLines: string[]; rdProjects: string[];
  insiders: EntityId[];                  // board, officers, ≥10% holders
  status: 'ACTIVE' | 'DISTRESSED' | 'IN_REORG' | 'LIQUIDATING' | 'DISSOLVED' | 'MERGED';
  defences: { poisonPill?: PoisonPill; staggeredBoard: boolean; goldenParachute?: Money };
  dividendPolicy?: { perShare: Money; everyDays: number };
  buybackProgram?: { maxShares: bigint; perDayPctFloat: number; untilTick: Tick };
  blackout: { fromTick: Tick; toTick: Tick }[];
  guidance?: { epsNextQ: Money; issuedTick: Tick };
  ratingIds: string[];
  filings: string[];                     // 15 filing ids
  flags: { delistReviewSinceTick?: Tick; antitrustCaseIds: string[]; relatedPartyStrikes: number };
}

interface ShareClass {
  classId: string; kind: 'COMMON' | 'PREFERRED' | 'FOUNDER_SUPERVOTE';
  votesPerShare: number;                 // listed companies: 1 for all classes (§3.12.1)
  sharesOutstanding: bigint;
  preferred?: { liquidationPrefMultiple: number; participating: boolean; dividendRate: number; cumulative: boolean;
                conversionRatio: number; antiDilution: 'NONE' | 'BROAD_WEIGHTED_AVG' | 'FULL_RATCHET'; seniority: number; originalIssuePrice: Money };
}
interface CapTableEntry { holderId: EntityId; classId: string; shares: bigint; vestedShares: bigint; acquiredTick: Tick; lockupUntilTick?: Tick; }

interface Covenant {
  covenantId: string; debtRef: string;
  kind: 'MAX_NET_LEVERAGE' | 'MIN_ICR' | 'MIN_LIQUIDITY' | 'MAX_CAPEX' | 'NO_DIVIDENDS_IF_LEVERAGE_ABOVE' | 'CHANGE_OF_CONTROL';
  threshold: number; testEveryDays: number;   // quarterly by default
  status: 'OK' | 'BREACHED' | 'WAIVED' | 'CURE_PERIOD'; cureUntilTick?: Tick;
}

interface Board { seats: number; members: { seatId: string; holderNominee: EntityId; personId: string; termEndsTick: Tick; independent: boolean }[]; classTerms: boolean; }
interface PoisonPill { adoptedTick: Tick; triggerPct: number; discountPct: number; expiresTick: Tick; shareholderApproved: boolean; }

interface ProductLine {
  id: string; companyId: string; category: string; segment: Segment; name: string;
  version: number; quality: number;      // absolute quality index (NPC frontier starts 1.0)
  features: number;                      // innovation index vs category frontier
  unitCostMult: number;                  // cost per unit vs category ref (process R&D lowers it)
  brand: number; launchTick: Tick;
  stage: 'DEVELOPMENT' | 'LAUNCH' | 'GROWTH' | 'MATURE' | 'DECLINE';
  businessesSelling: string[];           // biz ids that sell this line
}

interface RdProject {
  id: string; companyId: string; productLineId?: string;
  kind: 'PRODUCT_QUALITY' | 'NEW_FEATURES' | 'PROCESS_COST' | 'NEW_PRODUCT' | 'CERT_PREP';
  budget: Money; spent: Money; startTick: Tick; durationDays: number;
  researchers: number; researcherSkill: number;  // 1..5 (from staff RESEARCH role or 11 AI assistance)
  status: 'RUNNING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
  outcome?: { qualityGain?: number; featureGain?: number; costMultDelta?: number };
}

interface TenderOffer {
  id: string; bidderId: EntityId; targetCmpId: string; classId: string;
  pricePerShare: Money; consideration: 'CASH' | 'STOCK' | 'MIXED'; stockRatio?: number;
  minAcceptancePct: number; maxSharesPct?: number;
  openTick: Tick; closeTick: Tick;       // ≥ 7 game days
  conditions: ('MIN_ACCEPTANCE' | 'ANTITRUST' | 'FINANCING' | 'PILL_REDEEMED')[];
  financing: { cashEscrowed: Money; loanIds: string[] };
  status: 'OPEN' | 'EXTENDED' | 'SUCCEEDED' | 'FAILED' | 'WITHDRAWN' | 'SUPERSEDED';
  tendered: Record<string, bigint>;
}

interface StartupProfile {               // NPC startups and player startups seeking venture money
  cmpId: string; pitch: { sector: BizSector; category: string; teamScore: number; marketScore: number; burnPerDay: Money; roundSize: Money };
  hiddenFate: { outcomeMultiple: number; resolveTick: Tick; failTick?: Tick };    // NPC startups only, drawn at creation
  stage: 'SEED' | 'A' | 'B' | 'C' | 'GROWTH' | 'EXITED' | 'FAILED';
  rounds: VentureRound[];
}
interface VentureRound { roundId: string; stage: string; preMoney: Money; raise: Money; pricePerShare: Money; classId: string; leadId: EntityId; participants: { investorId: EntityId; amount: Money }[]; optionPoolTopUpPct: number; closeTick: Tick; }

interface Restructuring {
  id: string; cmpId: string; kind: 'OUT_OF_COURT_EXCHANGE' | 'PROTECTED_REORGANIZATION' | 'LIQUIDATION';
  openedTick: Tick; caseId?: string;     // 13 court case
  classes: ClaimClass[]; dip?: { lenderId: EntityId; amount: Money; rate: number };
  plan?: ReorgPlan; exclusivityUntilTick: Tick; deadlineTick: Tick;
  reorgValue?: Money; liquidationValue?: Money;
  status: 'OPEN' | 'PLAN_FILED' | 'VOTING' | 'CONFIRMED' | 'CRAMDOWN' | 'CONVERTED_TO_LIQUIDATION' | 'CLOSED';
}
interface ClaimClass { classId: string; rank: number; kind: 'DIP' | 'ADMIN' | 'SECURED' | 'SENIOR_UNSECURED' | 'TRADE' | 'SUBORDINATED' | 'PREFERRED_EQUITY' | 'COMMON_EQUITY'; claims: { holderId: EntityId; amount: Money }[]; collateralRefs?: string[]; claimAssetId?: string; }
interface ReorgPlan { proposerId: EntityId; recoveries: { classId: string; cashPct: number; newDebtPct: number; newEquityPct: number }[]; newCapital?: { investorId: EntityId; amount: Money; equityPct: number }; votes: Record<string, { forAmount: Money; againstAmount: Money; forCount: number; againstCount: number }>; }
```

---
## §3 Rules and formulas

### §3.1 Ownership, catalog and tiers

#### §3.1.1 Who owns what

- A character (`chr`) may own B1 and B2 businesses directly (sole proprietorship). B3 and above must be owned by a company (`cmp`) (DEFAULT, Mathis may override): the company is where corporate finance, consolidation and listing live.
- `biz.corp.found` creates a `cmp` in a chosen bloc jurisdiction for `PARAM.cmp_founding_fee = $1,000` (SINK `CMP_FOUNDING_FEE`). A company can own businesses, properties (10), labs (11), funds' sponsor roles (08), other companies (subsidiaries) and financial assets. 03 consolidates controlled subsidiaries (> 50% voting) and reports minority interests; intercompany flows net out (I06).
- A player may move a directly owned business into his company at its EV (an internal transfer; no tax, no haircut, consolidation unchanged).
- Alliances (15) can hold businesses through a syndicate company whose cap table is the members; profits flow by the 15 equity-stake clause.

#### §3.1.2 Tiers

| Tier | C0 range (launch price level) | Base payback (game days, net of all opex, at reference crowding) | Opens at rank (14) | Setup time | EV multiple `multipleDays(tier)` |
|---|---|---|---|---|---|
| B1 Hustle | $1k – $10k | 6 | R0 (start) | 1 game hour | 6 |
| B2 Small business | $25k – $200k | 12 | R1 ($20k) | 1 game day | 12 |
| B3 Company | $250k – $3M | 24 | R2 ($250k) | 3 game days | 24 |
| B4 Corporation | $5M – $50M | 48 | R3 ($5M) | 7 game days | 48 |
| B5 Conglomerate | $100M – $1B | 96 | R4 ($100M) | 14 game days | 96 |
| B6 Megaproject | $2B – $25B, unique per city or bloc, auctioned or concession | 200 (+ Prestige) | R5 ($2B) | per type (28–182 game days) | 200 |

Resolves roadmap Q2 (business pace) and conflict C4: **option A, the bible pace** (payback 6 game days at B1, because one real hour is one game day: this is the "~6 h" of 01 §4.4). The roadmap's worry that early businesses would print money before wages and upkeep exist does not apply: payback here is defined net of wages, rent, upkeep, energy and inputs, under the reference crowding of §3.2.4, and the offline cap (§3.4.4) bounds income per real day. DEFAULT (Mathis may override). 20's balance harness checks the 01 §8.4 wealth curve (day 1 median ≈ $15k, Hustler within the first 1–2 real days).

Rank thresholds are 14's; the gates above use the rank, and rank is never lost (04 §3.1).

#### §3.1.3 Price level indexing

`c0`, `refPrice`, wages and fixed costs are stated at launch prices. Every day they are multiplied by the bloc price index `CPI_bloc(t) / CPI_bloc(0)` from 04 (wages by the 04 wage index), so real margins are stable under inflation and the Stabilizer's lever 3 (01 §8.2) reads as world inflation.

#### §3.1.4 The catalog

All businesses of 01 §4.4 are kept, with their C0 and twists, now mapped to archetypes. The niche businesses of C04 are added as catalog rows built from the same archetypes. 22 holds the full per-type data (`BusinessType`), including names in EN and FR. Market-sector mapping (for listed fundamentals): FOOD_HOSPITALITY → 9, RETAIL_CONSUMER → 8, REAL_ESTATE_SERVICES → 10, LOGISTICS_TRANSPORT → 5, ENERGY → 3, MINING_AGRICULTURE → 4, MANUFACTURING → 5 (chip fab → 2), TECH_AI → 1 (data center, cloud → 2), FINANCE → 6, MEDIA_ENTERTAINMENT → 11, HEALTH → 7, LUXURY → 9, SECURITY_LEGAL_INTEL → 12.

| Sector | Business | Tier | C0 | Archetype | Scope | Twist rule (§3.4.6) |
|---|---|---|---|---|---|---|
| Food & Hospitality | Coffee cart | B1 | $2,500 | FOOTFALL_RETAIL | DISTRICT | coffee commodity input |
| | Food truck | B1 | $6,000 | FOOTFALL_RETAIL (MOBILE) | DISTRICT | may move district once per game day; festival events boost |
| | Café | B2 | $40,000 | FOOTFALL_RETAIL | DISTRICT | coffee input; cluster bonus |
| | Restaurant | B2 | $150,000 | FOOTFALL_RETAIL (quality-heavy) | DISTRICT | critic review events ±20% share |
| | Restaurant chain | B3 | $1,800,000 | FOOTFALL_RETAIL | CITY | expansion-native: opens with 3 sites across districts |
| | Boutique hotel | B3 | $3,000,000 | TOURISM | CITY | needs Hotel property type (10) or lease |
| | Food delivery app | B4 | $15,000,000 | PLATFORM_COMMISSION | CITY | commission on all café/restaurant revenue in the city incl. other players'; data |
| | Hotel chain | B4 | $40,000,000 | TOURISM | BLOC | tourism + business travel; recession-sensitive |
| | Resort & island | B5 | $600,000,000 | TOURISM (+TROPHY) | WORLD (Isla Serena) | doubles as lifestyle trophy (14 Prestige) |
| Retail & Consumer | Phone repair kiosk | B1 | $3,000 | LOCAL_SERVICE | DISTRICT | very low variance |
| | Sneaker resale | B1 | $8,000 | FLIP_TRADING | CITY | buys drops, flips them; hype-driven |
| | Convenience store | B2 | $90,000 | FOOTFALL_RETAIL | DISTRICT | defensive (cycleSensitivity −0.2) |
| | Supermarket | B3 | $2,500,000 | FOOTFALL_RETAIL | CITY | thin margin, huge volume; inflation pass-through |
| | Supermarket chain | B4 | $30,000,000 | FOOTFALL_RETAIL | BLOC | data |
| | E-commerce marketplace | B5 | $800,000,000 | PLATFORM_COMMISSION | BLOC | cut of all retail volume in the bloc; lots of data |
| Real-estate services | Cleaning service | B1 | $4,000 | LOCAL_SERVICE (B2B) | CITY | demand rises with players' property count |
| | Property management agency | B2 | $120,000 | B2B_CONTRACT (PLAYER_SERVICES) | CITY | 8% fee on managed rents; players hire it (10) |
| | Construction company | B3 | $2,000,000 | B2B_CONTRACT | CITY | builds for developers (10); steel/lumber input; delays |
| | Real-estate developer | B4 | $25,000,000 | PROCESSOR (projects) | CITY | builds and sells/holds (10 development); shapes desirability |
| Logistics & Transport | Courier bikes | B1 | $5,000 | LOCAL_SERVICE | CITY | scales with retail and e-commerce volume |
| | Moving company | B2 | $60,000 | LOCAL_SERVICE | CITY | scales with real-estate transactions (10) |
| | Trucking fleet | B3 | $1,500,000 | TRANSPORT_CAPACITY | BLOC | fuel input |
| | Port terminal | B5 | $500,000,000 | PLATFORM_COMMISSION | CITY, CONCESSION_PER_CITY (coastal) | trade-volume fees; concession (§3.8.3) |
| | Shipping line | B5 | $700,000,000 | TRANSPORT_CAPACITY | WORLD | freight rates spike in supply shocks |
| | Airline | B5 | $900,000,000 | TRANSPORT_CAPACITY | WORLD | fuel and recession sensitive; thin margins |
| Energy | Rooftop solar installer | B2 | $80,000 | B2B_CONTRACT | CITY | policy subsidy events (16) |
| | Oil well | B3 | $3,000,000 | COMMODITY_PRODUCER | SITE | barrels × crude − lifting cost |
| | Solar farm | B3 | $2,500,000 | COMMODITY_PRODUCER (MWh) | BLOC grid | can supply own data centers |
| | Wind farm | B4 | $20,000,000 | COMMODITY_PRODUCER (MWh) | BLOC grid | weather variance |
| | Refinery | B5 | $600,000,000 | PROCESSOR | BLOC | crack spread |
| | Power utility | B6 | $5,000,000,000 | REGULATED_UTILITY | CONCESSION_PER_CITY | sells energy to all data centers in the city |
| | Nuclear plant | B6 | $12,000,000,000 | COMMODITY_PRODUCER (baseload MWh) | CONCESSION_PER_BLOC | 182-game-day build; regulatory events |
| Mining & Agriculture | Family farm | B2 | $70,000 | COMMODITY_PRODUCER | SITE | wheat/corn; weather and season |
| | Coffee/cocoa plantation | B3 | $1,200,000 | COMMODITY_PRODUCER | SITE | vertical link to cafés |
| | Gold mine | B4 | $35,000,000 | COMMODITY_PRODUCER | SITE | ounces × gold − AISC; crisis hedge |
| | Lithium mine | B4 | $45,000,000 | COMMODITY_PRODUCER | SITE | EV/AI boom link |
| | Rare-earth mine | B5 | $400,000,000 | COMMODITY_PRODUCER | SITE | embargo events (04/16) |
| Manufacturing | Print shop | B1 | $7,000 | LOCAL_SERVICE (B2B) | CITY | local orders |
| | Furniture workshop | B2 | $100,000 | PROCESSOR | CITY | lumber in; housing-cycle sensitive |
| | Electronics assembly | B3 | $3,000,000 | PROCESSOR (B2B_CONTRACT) | BLOC | chip supply input |
| | EV/auto factory | B5 | $1,000,000,000 | PROCESSOR | BLOC | lithium/steel/chip inputs; sells to dealerships |
| | Chip fab | B6 | $20,000,000,000 | PROCESSOR | CONCESSION_PER_BLOC | strategic; supplies data centers and electronics |
| Technology & AI | Freelance dev studio | B1 | $5,000 | B2B_CONTRACT | CITY | skill upgrades only (quality axis) |
| | Mobile app studio | B2 | $150,000 | HIT_DRIVEN | WORLD | power law; data |
| | SaaS company | B3 | $3,000,000 | SUBSCRIPTION | BLOC | recurring, low churn; rate-sensitive valuation |
| | Data center | B4 | $40,000,000 | COMPUTE_PROVIDER | BLOC | sells GPUh at the compute price; energy input (11) |
| | AI lab | B4 | $50,000,000 | (lab, 11) | — | gateway to 11; purchase creates a lab entity |
| | Social network | B5 | $900,000,000 | SUBSCRIPTION (ads) | WORLD | hackable; data-leak events |
| | Cloud provider | B5 | $1,000,000,000 | COMPUTE_PROVIDER | BLOC | region-wide compute supply |
| Finance | Currency exchange booth | B1 | $6,000 | FOOTFALL_RETAIL (FX spread) | DISTRICT | tourist-flow driven |
| | Accounting firm | B2 | $90,000 | B2B_CONTRACT (PLAYER_SERVICES) | CITY | fees; reduces client tax by up to 5% (03 hook) |
| | Brokerage | B3 | $3,000,000 | PLATFORM_COMMISSION | BLOC | commission on NPC retail flow only (never on player trades) |
| | Insurance company | B4 | $30,000,000 | FINANCIAL_INSTITUTION | BLOC | becomes an 08 insurer (§3.8.1) |
| | Bank | B5 | $800,000,000 | FINANCIAL_INSTITUTION | BLOC | becomes a 07 bank (CH_BANK) |
| | Hedge fund | B5 | $300,000,000 | FINANCIAL_INSTITUTION | WORLD | becomes an 08 fund manager (§3.8.1) |
| | Stock exchange | B6 | $15,000,000,000 | PLATFORM_COMMISSION | CONCESSION_PER_BLOC | fee on the bloc's trading volume, capped (§3.8.3) |
| Media & Entertainment | Content channel | B1 | $2,000 | HIT_DRIVEN | WORLD | viral events |
| | Marketing agency | B2 | $120,000 | B2B_CONTRACT (PLAYER_SERVICES) | CITY | sells marketing to other businesses |
| | Nightclub | B2 | $180,000 | FOOTFALL_RETAIL (night hours) | DISTRICT | status venue (14 hosting) |
| | Record label | B3 | $2,000,000 | HIT_DRIVEN | WORLD | power law |
| | News outlet | B3 | $2,500,000 | SUBSCRIPTION | BLOC | can publish stories (16); false or self-serving stories = manipulation (13) |
| | Esports team | B3 | $3,000,000 | HIT_DRIVEN (seasonal prizes) | WORLD | prize + sponsorship |
| | Streaming studio | B4 | $40,000,000 | SUBSCRIPTION | WORLD | content slate (hits) feeds churn |
| | Sports franchise | B6 | $3,000,000,000 | TROPHY | PER_CITY (auctioned, owned outright) | Prestige + tickets |
| Health | Pharmacy | B2 | $150,000 | FOOTFALL_RETAIL | DISTRICT | defensive |
| | Clinic | B3 | $2,000,000 | LOCAL_SERVICE | CITY | steady |
| | Biotech lab | B4 | $30,000,000 | TRIAL_BINARY | WORLD | trials: 35% pass, 10–30× payout; can IPO on a win |
| | Hospital network | B5 | $700,000,000 | REGULATED_UTILITY | BLOC | regulated, defensive |
| Luxury | Watch boutique | B3 | $2,500,000 | FOOTFALL_RETAIL (PREMIUM) | DISTRICT | sells to players (14 items) and NPC |
| | Car dealership | B3 | $3,000,000 | FOOTFALL_RETAIL (PREMIUM) | CITY | buys cars from factories (§3.7) |
| | Watch manufacture | B4 | $45,000,000 | PROCESSOR (limited editions) | WORLD | creates collectible items (14) |
| | Fashion house | B5 | $500,000,000 | PROCESSOR (brand) | WORLD | hype cycles |
| | Yacht builder | B5 | $800,000,000 | PROCESSOR (long orders) | WORLD | order book of 91–182 game days |
| Security, Legal & Intel | IT support shop | B1 | $4,000 | LOCAL_SERVICE (B2B) | CITY | path into security |
| | Law firm | B3 | $1,500,000 | B2B_CONTRACT (PLAYER_SERVICES) | BLOC | earns from court cases (13); more in a litigious world |
| | Cybersecurity firm | B3 | $3,000,000 | B2B_CONTRACT (PLAYER_SERVICES) | BLOC | defence contracts (12); scales with world hack rate |
| | Data broker | B3 | $2,500,000 | PROCESSOR (data) | WORLD | buys/sells data (11); fencing stolen data is illegal |
| | Private intelligence firm | B4 | $25,000,000 | B2B_CONTRACT (PLAYER_SERVICES) | WORLD | investigations, due diligence (13 forensic) |
| Niches (C04) | Medical courier | B1 | $9,000 | LOCAL_SERVICE (CERTIFIED, cert MedGrade) | CITY | derived demand from clinics, pharmacies, hospitals |
| | Refrigerated storage | B2 | $180,000 | B2B_CONTRACT (cold-chain capacity) | CITY | derived from supermarkets, pharma, food delivery; heatwave cost events |
| | Industrial equipment repair | B2 | $110,000 | B2B_CONTRACT (FIELD_SERVICE) | CITY | derived from factories, mines, plants; response-time tenders |
| | Efficient cooling contractor | B3 | $900,000 | B2B_CONTRACT | BLOC | derived from data-center MW (11) |
| | Regional data supplier | B3 | $1,400,000 | PROCESSOR (data, legal provenance) | BLOC | sells permitted datasets to labs (11) |
| | Port maintenance firm | B3 | $1,600,000 | B2B_CONTRACT | CITY (coastal) | derived from port-terminal throughput |
| | Cold-chain transporter | B3 | $1,200,000 | TRANSPORT_CAPACITY (CERTIFIED) | BLOC | the S01 scenario: pharma contracts |

The full catalog has `PARAM.catalog_size_target = 150` types (MASTER-BIBLE ~150 across 13 sectors). The 81 rows above are binding; 22 adds the remaining types by combining archetypes, categories and segments under the same formulas (content list in the notes file), so no type needs a new mechanic.

#### §3.1.5 Buying a business from the catalog

1. `biz.buy { typeId, cityId, districtId?, segment?, model?, promise?, ownerId }`. Validation: rank, license, owner type (§3.1.1), cash ≥ c0 (indexed), unique availability, the district has a free slot of the right kind or the 10 frontier can add one, the city is not under an active catastrophe closure for that district.
2. Payment `c0` → SINK `BIZ_PURCHASE_NPC` (establishing a business buys fit-out and goodwill from the NPC economy). For FINANCIAL_INSTITUTION types see §3.8.1.
3. 10 assigns a storefront slot (06-cities §6.2 rule: chosen district if passed, else deterministic by hash over free slots weighted by district demand). Premises: B1 FOOTFALL and LOCAL types include their stall or kiosk; B2+ FOOTFALL types need premises: owned property of a suitable type (10), a lease the engine arranges at the district's market rent (10, posted as rent at day close), or the default "included fit-out lease" at rent = 15% of `fixedRatio` budget (DEFAULT).
4. Status SETTING_UP for `setupDays`, then OPEN. Starting state: all levels 0, condition 100, staff hired to the reference headcount (hiring at reference wages is instant at setup; later hires follow §3.6), price = refPrice, brand 0, segment default.

### §3.2 Demand

#### §3.2.1 Markets

A market is (scope id, category, segment). FOOTFALL_RETAIL markets are per district; LOCAL_SERVICE, B2B_CONTRACT and most others per city; platforms and transport per bloc; HIT_DRIVEN and world-scope types per world. A business sells in exactly one market (its type's category and its chosen segment) plus any tender contracts it wins.

#### §3.2.2 Daily demand (computed at t = 0 each game day, P9)

```
HOUSEHOLD categories:
  D_city = perCapita(cat) × pop(c) × (income(c) / incomeRef)^ε(cat) × (1 + cycleSens(cat) × outputGap(bloc)) × season(cat, week) × shock(c, cat) × stab
BUSINESS_DERIVED categories (input-output, C10):
  D_city = Σ_driver ioCoef(cat, driverCat) × activity(c, driverCat) × stab
     activity = units sold yesterday by all businesses (player + NPC field) of the driver category in c, or a 10/11 quantity
     (e.g. cooling contractor ← data-center MW; moving company ← property transactions; cleaning ← properties owned by players and NPC)
TOURISM: D_city = tourismIndex(c) (10/16) × roomNightsPerIndex(cat) × season × stab
GOVERNMENT: procured only through tenders (§3.9)
PLAYER_SERVICES: demand is the sum of player purchases through service contracts (§3.9.6) plus an NPC share = perCapita × pop × stab
COMMODITY_MARKET: no demand pool; output sells at the 06 spot price (§3.4.2)
FLOW_TAKE: no demand pool; revenue = take rate × an observed flow (§3.4.2)
District split for DISTRICT-scope markets: D_district = D_city × footfall(district, cat) / Σ footfall   (10 supplies footfall weights)
```

`stab` is the Stabilizer demand lever (03/04 own its value; range [0.90, 1.10], 01 §8.2 lever 1). `pop` and `income` come from 10/16 and grow with the city (which grows with `N_a`, 01 §14.1), so demand scales with activity-weighted players, never sign-ups. `shock` aggregates active events (festival +40% for 1 game day, heatwave, catastrophe closures from 08, strikes in the city, embargoes), each from a causal event (W05).

#### §3.2.3 Hourly demand

`D_hour = D_day × hourProfile(hourOfDay) × (weekend ? weekendFactor : 1)` for hours in `hoursOpen`; 0 otherwise. Hour of day = floor(tickOfDay / 30).

#### §3.2.4 Calibration rule (how `perCapita` and coefficients are set at world genesis)

For each type, at launch prices, in the reference city (the median-population launch city):

```
π*        = c0 / paybackDays(tier)                         target daily operating profit
R*        = π* / (1 − κ − φ)                               target daily revenue (κ = cogsRatio, φ = fixedRatio)
units*    = R* / refPrice                                  target units per day
s_ref     = (1 − npcShare0) / PARAM.biz_calib_density      reference share: npcShare0 = 0.50 (DEFAULT, 01: NPCs take 30–60% in a fresh city),
                                                            biz_calib_density = 12 player businesses per market
D_ref     = units* / s_ref                                 reference market demand per day
perCapita = D_ref / pop(refCity)                           (HOUSEHOLD); ioCoef solved the same way against reference driver activity
capacityPerHour0 = 1.25 × units* / Σ_h hourProfile-weighted open hours   (capacity binds only above 125% of reference volume)
fixed cost per day F0 = φ × R*; split by 22's per-type split: wages, rent, upkeep, energy, insurance baseline
```

Types whose archetype has no demand pool (COMMODITY_PRODUCER, FLOW_TAKE platforms, COMPUTE_PROVIDER, TRIAL_BINARY, FINANCIAL_INSTITUTION, TROPHY, FLIP_TRADING) are calibrated by choosing their output rate or take rate so expected profit at launch macro equals π* (§3.4.2). Calibration runs once at genesis and is stored in 22's data; it is not re-run (later crowding and macro move profits; that is the game).

### §3.3 Market share and competition

#### §3.3.1 Attractiveness

```
u_j = a_s · ln(qEff_j) + b_s · ln(1 + mkt_j / M_ref) − c_s · ln(price_j / refPrice) + d · location_j + brand_j + r_s · (reliability28_j − 0.9) + promiseBonus_j
qEff_j     = qualityIndex_j × (0.5 + 0.5 × condition_j / 100) × staffFactor_j
qualityIndex_j = (1 + 0.04 × qualityLevel_j) × productQualityRel_j        (productQualityRel = product line quality / category frontier, 1 for non-product types)
mkt_j      = marketingPerDay_j + Σ campaigns_j decayed (half-life 14 game days)
M_ref      = 0.05 × R* (reference daily marketing)
location_j = district desirability z-score from 10 (DISTRICT scope) or 0
brand_j    = 0.05 × ln(1 + chainSize) + campaign/event boosts (bounded [−0.5, +0.8])
staffFactor= clamp(0.6 + 0.4 × staffed/required, 0.6, 1.0) × (0.9 + 0.02 × skillAvg) × (morale < 30 ? 0.85 : 1)
promiseBonus: the promise adds +0.3 to the matching coefficient's term weight (PRICE: c_s ×1.3 on the price term when price < ref; QUALITY: a_s × 1.3; RELIABILITY: r_s × 1.3; SPEED: +0.2 flat if capacity headroom ≥ 30%; CERTIFIED/CONFIDENTIAL: +0.3 flat in B2B and INSTITUTIONAL segments if the cert / posture is held) and costs +5% to fixed costs (DEFAULT)
```

Segment coefficients (DEFAULT; 20 tunes):

| Segment | a (quality) | b (marketing) | c (price) | r (reliability) | d (location) |
|---|---|---|---|---|---|
| BUDGET | 0.6 | 0.25 | 3.5 | 0.5 | 0.5 |
| MAINSTREAM | 1.0 | 0.30 | 2.0 | 0.8 | 0.5 |
| PREMIUM | 1.6 | 0.40 | 1.0 | 1.0 | 0.7 |
| B2B | 0.8 | 0.10 | 2.5 | 1.5 | 0.2 |
| INSTITUTIONAL | 1.0 | 0.05 | 1.5 | 2.5 | 0.1 |

Segment choice changes the business's `refPrice` (BUDGET × 0.75, PREMIUM × 1.6, B2B × 1.0, INSTITUTIONAL × 1.3) and costs (BUDGET κ × 0.85, PREMIUM κ × 1.25 and φ × 1.15), and the segment's share of the city category demand (22: e.g. coffee: 35% budget, 50% mainstream, 15% premium).

#### §3.3.2 Target and smoothed shares

At its market's hour offset each game hour (P9), the engine computes target shares:

```
W_j  = exp(u_j) for each participant business j (players and named NPC firms)
W_npc = npcField.weight × exp(u_npcField)       (u_npcField with quality 1.0, price = refPrice, marketing M_ref, brand 0, reliability 0.92)
s*_j = W_j / (W_npc + Σ_k W_k)
s_j(h) = s_j(h−1) + θ × (s*_j − s_j(h−1)),  θ = PARAM.biz_share_adjust_rate = 0.04 per game hour   (customer stickiness; half-life ≈ 17 game hours)
renormalize Σ s = 1 (NPC field gets the remainder)
A business that opens starts at s = 0 and ramps by θ; a business that closes or goes IDLE has its attractiveness weight multiplied by 0.5 (IDLE) or removed (closed) and its customers flow to others by the same θ dynamics.
```

#### §3.3.3 Sales with capacity reallocation

```
for the hour: demandShare_j = D_hour × s_j
cap_j = capacityPerHour0 × (1 + 0.12 × capacityLevel_j) × uptime_j × staffCapFactor_j   (uptime 0 if not OPEN)
sold_j = min(demandShare_j, cap_j, finishedInventory_j for goods)
overflow = Σ_j (demandShare_j − sold_j) over capacity-limited firms
second pass: overflow is offered to unconstrained firms (players and the NPC field) pro rata to s_j; each sells up to its remaining capacity; the rest is lost (lostSales, shown to owners as "unserved demand")
```

The NPC field has unlimited capacity. The second pass runs once (no iteration) for determinism and cost.

#### §3.3.4 Pricing

The owner sets `price` within `[0.7, 1.3] × refPrice_segment` (01 §4.1: ±30%). `biz.setPrice` takes effect at the next hour. A pricing assistant (free) shows the estimated profit-maximizing price: it holds competitors' attractiveness fixed, evaluates expected hourly profit `π(p) = min(D × s*(p), cap) × (p − mc) − fixed` with `s*(p)` from §3.3.2, and finds the maximum by golden-section search on `[0.7, 1.3] × refPrice` (20 iterations). AI operators (11) may set the price automatically within the same bounds.

#### §3.3.5 Category price response

The whole market's demand responds to the share-weighted average price: `D_eff = D × (avgPrice / refPrice)^(−η)` with η = `priceElasticity` (22, typical 0.3–1.2). This blocks collusion where all players in a market raise prices together (the NPC field also stays at ref price).

#### §3.3.6 NPC field dynamics (daily, t = 0, P4)

```
playerMargin = Σ player profit / Σ player revenue in the market over the last 7 game days
entry = PARAM.npc_entry_rate (0.02) × max(0, playerMargin − normalMargin(cat)) / normalMargin(cat)
exit  = PARAM.npc_exit_rate (0.01) × max(0, playerShare − 0.6) / 0.4
weight' = clamp(weight × (1 + entry − exit), PARAM.npc_field_floor (0.10) × weight0, PARAM.npc_field_cap (3.0) × weight0)
```

`normalMargin` per category is in 22 (typical 0.08–0.15). Fat margins attract NPC entrants; dominant players see NPCs slowly exit (01 §4.1), but never below 10% of the initial field (fresh entry always remains possible, F03). Named NPC firms (16) in a market follow their own decision models (expand, cut price, exit) and are counted as participants.

#### §3.3.7 Antitrust

If one consolidated owner group (03 group) holds > `PARAM.antitrust_share = 0.60` of a market for 7 consecutive game days (01 §9), 13's competition regulator opens a case automatically: outcome per 13 (fine, or forced sale of the smallest set of businesses that brings share below 0.50, sold to NPC at 85% of EV with an extra −15% forced-divestiture discount, 03 §12 #6). M&A is pre-screened by the same test (§3.13.6).

### §3.4 Operations

#### §3.4.1 The hourly loop (P9, at tick `t` where `(t − hourOffset) mod 30 = 0`)

For each OPEN business:

1. Demand and share from the market's current hour values (§3.3).
2. Units sold and revenue (archetype formula, §3.4.2). Revenue cash posts in this tick's P13: from NPC customers `BIZ_REVENUE_NPC` (FAUCET); from player customers `BIZ_REVENUE` (TRANSFER).
3. Variable costs: inputs consumed per unit (§3.7) at the input's cost basis (inventory FIFO cost, or spot for just-in-time), energy (MWh × 06 power price for the bloc), transaction fees. Posted as `BIZ_INPUT_NPC` (SINK) or `BIZ_INPUT` (TRANSFER when supplied by a player business).
4. Staff hours, inventory movements, data by-product (`dataRateDquPerUnit × units` to the owner's data inventory in 11, with provenance `OWN_OPERATIONS`).
5. Accumulate into `dayAcc`.

**First operation (18 §3.3.6; ruling in 24).** A newly bought or newly opened business also runs this loop once at `biz.firstOpTick = openedTick + 1`, with every quantity (demand, units, revenue, variable costs, staff hours) scaled by `k / 30`, where `k` = the number of ticks from `openedTick + 1` to its first regular stagger tick after it (`1 ≤ k ≤ 29`); if `openedTick + 1` is itself a stagger tick, that regular run is the first operation and no extra run happens. From the first stagger tick on it runs only on its slot. The first revenue posting therefore lands 5 real seconds after purchase, and no extra income is created.

At day close (t = 719, P9): fixed costs post (wages to hh `BIZ_WAGES_NPC` SINK, rent to the property owner via 10, upkeep `BIZ_UPKEEP_NPC` SINK, marketing `BIZ_MARKETING_NPC` SINK or `BIZ_MARKETING` TRANSFER to a player agency, insurance premiums via 08); condition updates (§3.5.3); books update (`dailyProfit` push); events roll (§3.4.5). Taxes on profit are 03's.

#### §3.4.2 Archetype formulas

| Archetype | Units and revenue per hour (beyond §3.3.3) | Costs and specifics |
|---|---|---|
| FOOTFALL_RETAIL | §3.3.3 with district markets | κ inputs per unit (coffee, groceries…); FX booth revenue = units × spread on 05 FX mid |
| LOCAL_SERVICE | §3.3.3 with city markets; units = service jobs | κ small (supplies); φ mostly wages |
| B2B_CONTRACT | spot units by §3.3.3 in the B2B segment market + contracted units (§3.9) served first from capacity | penalties for contract shortfalls; receivables on payment terms |
| COMMODITY_PRODUCER | `output_h = rate0 × (1 + 0.12 × capLevel) × uptime × resourceFactor × weatherFactor`; revenue = output × 06 spot price (sold to the NPC offtaker at spot, or delivered to own businesses at cost, or to contracts) | lifting/AISC cost per unit; reserves deplete (mines: `resourceFactor = (remaining/initial)^0.3`, mines have `reserveYears` from 22 and can buy exploration upgrades); weather from 16 for farms and wind |
| PROCESSOR | `units = min(capacity, inputs available / qtyPerUnit, demand)`; sells finished goods into its market (B2B or consumer) or to contracts | full bill of materials; refinery margin = product prices − crude (crack spread); chip fab output feeds data centers and electronics (§3.7) |
| PLATFORM_COMMISSION | revenue = takeRate × observedFlow × platformShare; `observedFlow` = city café+restaurant revenue (delivery app), bloc retail revenue (marketplace), NPC retail order flow notional on 05 (brokerage), port throughput value (terminal), bloc exchange volume (exchange concession); `platformShare` = logit share among platforms of that category in scope | takeRate ∈ [0.02, 0.18] by type (22); cannot take a cut of player 05 trades (brokerage) |
| SUBSCRIPTION | subscribers `N`: `N' = N × (1 − churn_h) + acquisitions_h`; `acquisitions_h = D_hour × s_j` (new sign-ups); `churn_h = churnBase × (refPrice / price)^(−c_s/2) × (2 − qEff/1.0)`; revenue = N × price per game day / 24 per hour | content or R&D spend lowers churn; ad-funded (social network) revenue = N × ARPU × ad index (16) |
| HIT_DRIVEN | each game week the business releases `k` titles (k from capacity); each title's lifetime revenue `= baseTitle × Pareto(α = 1.1, xm = 0.2)` × qEff, earned with exponential decay over 14 game days | variance is the point; marketing raises xm; data by-product |
| TOURISM | room-nights: `D_hour × s_j` capped by rooms; revenue = rooms sold × rate | occupancy shown; recession and catastrophe sensitive |
| TRANSPORT_CAPACITY | capacity units (trucks, ships, planes, cold vans) × utilization (logit share of freight demand) × freight rate (06 freight index, spikes in supply shocks) | fuel per unit-distance at 06 price; certified variants (cold chain) serve certified tenders |
| REGULATED_UTILITY | revenue = allowed return × rate base + pass-through costs; `allowedReturn = 04 10y yield + PARAM.utility_spread (0.03)` per game year on rate base (book value of assets), reset each game year by the regulator (13) | volume risk small; regulatory events |
| COMPUTE_PROVIDER | GPUh sold = min(capacity GPUh, demand share in the bloc compute market of 11) × price (11/06 compute price); internal allocation to own lab at cost (§3.7.4) | energy MWh per GPUh at the bloc power price; chips from fabs or market (11) |
| TRIAL_BINARY | runs one trial at a time: trial cost per game day; duration 28–91 game days; at the end `P(pass) = PARAM.biotech_pass (0.35) × qualityMult`; pass pays `U(10, 30) × trialCostTotal` as licensing revenue (NPC pharma buyer, FAUCET) and allows IPO on a win (§3.10.1 relaxed float) | between trials no revenue |
| FINANCIAL_INSTITUTION | no hourly loop here: the institution runs in 07 (bank) or 08 (insurer, fund) | §3.8.1 |
| TROPHY | ticket and sponsorship revenue = small TOURISM-like pool; Prestige per 14 | heavy upkeep (14, 01 §8.3) |
| FLIP_TRADING | each game day 0–3 "drops" (16 hype events) offer items at drop price; the owner buys up to capacity; resale price = dropPrice × hype(t) where hype follows a decaying random walk; the owner chooses when to sell | a mini trading game; sells to NPC buyers (FAUCET) or players |

#### §3.4.3 Inventory and reorder (goods archetypes)

Each input and finished good has inventory. Reorder at day close: if `daysOfCover < reorderPolicy.daysOfCover` (default 3), buy enough for `2 × daysOfCover` days of trailing usage from: (1) internal suppliers by allocation, (2) supply contracts, (3) spot (06 commodity market orders through 05 for exchange-traded inputs; the NPC wholesale market at ref cost × (1 + 3%) for intermediate goods). Stockouts stop sales of the affected product until the next delivery. Deliveries arrive at the next game hour (spot), on contract schedule, or after the transport lead time (cross-bloc: 1 game day).

#### §3.4.4 Offline cap and management modes

Business income is capped by owner attention to stop 24/7 idle printing (01 §1, §8.3):

```
capHours(game days counted since the controlling human's last session) =
   8                                          OWNER_OPERATED  (01: 8 real hours)
 + 8   if a manager (NPC manager or AI operator) is assigned to the business or to its company   (01: 16 with a manager)
 + 0.16 × automationLevel                     (≤ +4 at level 25)
   PROFESSIONAL_CEO (company with a hired CEO, B3+ company): 24
   listed companies: no cap (the company runs for its minority holders); after 24 game days without the controller's session, the CEO runs on autopilot policy at operating efficiency 0.9 (prices frozen at last values, reorder and staffing continue)
After the cap, the business becomes IDLE: no sales, no variable costs, staff furloughed (wages 0), rent and lease obligations continue, condition does not decay, attractiveness weight × 0.5 so its customers drift to competitors at θ. Returning sets OPEN at the next hour.
```

Dormant accounts (01 §14.2): after 30 real days (720 game days) without login the controller leaves active boards; businesses stay IDLE (not wiped). After 90 real days (2,160 game days) unique assets (B6, trophies, concessions) go to an estate auction and proceeds are paid to the owner as cash. (This resolves 01 §14.2 "run on managers at 50% income" against the offline cap: the 50% becomes the IDLE attractiveness weight, so share is held loosely rather than income paid. DEFAULT.)

#### §3.4.5 Business events (rolled once per game week per business at its day-close, stream `biz:events:<bizId>`)

| Event | Weekly probability | Effect | Causal link |
|---|---|---|---|
| Viral moment | 0.03 × (1 + marketing z) | +30% demand share for 2 game days | social/media index (16) |
| Bad review | 0.04 × (1.5 − qEff) clamped ≥ 0.01 | −15% demand for 3 game days; critic review ±20% for restaurants | quality |
| Health / safety inspection | 0.10 if condition < 50, else 0.01 | fine 2% of c0 (SINK `BIZ_FINE`); closure 1 game day if condition < 30 | condition |
| Staff strike | 0.25 if wage index lag > 3% vs 04 inflation over 91 days, else 0 | STRIKE 1–3 game days; morale −10 | wages vs inflation |
| Fire | 0.003 × (condition < 40 ? 3 : 1) | damage ratio U(0.1, 0.6): UNDER_REPAIR for ceil(DR × 20) game days; repair cost DR × (c0 + upgradesSpent) × 0.5; 08 PROPERTY/BI claims | condition |
| New NPC competitor | 0.05 × (1 + 4 × max(0, margin − normal)) | NPC field weight +10% in the market | margins (§3.3.6) |
| Supply shortage | 0.03 for goods archetypes | one input +25% cost for 5 game days | commodity events (06/16) |
| Celebrity endorsement | 0.01 | brand +0.2 for 7 game days | 16 |
| Data breach | 12 decides (hackable types) | 12 effects | 12 |

Catastrophes (08 §3.5.6) close affected businesses for their `biDays` and damage condition by `100 × DR`. Every event of a business with revenue ≥ $1M per game day is Wire-eligible news (16), others notify only the owner.

#### §3.4.6 Twist rules (implemented per type; ids referenced by `twistRules`)

- `MOVE_DAILY` (food truck): `biz.move { districtId }` once per game day; share resets toward 0 in the new district with θ, festivals (16) add +40% demand in their district.
- `CLUSTER` (§3.7.5), `CHAIN_NATIVE` (restaurant chain opens 3 sites), `VERTICAL_INPUT` (plantation → café), `CRITIC` (restaurant review ±20%), `PLAYER_SERVICE` (§3.9.6), `TAX_REDUCER` (accounting firm: client's taxable profit −5% max, 03 hook, only for clients with an active service contract), `NEWS_PUBLISHER` (news outlet may publish stories; 16 validates facts; false statements are 13 offences), `HACK_RATE` (security firm demand × world hack rate index from 12), `LITIGATION` (law firm demand × court caseload from 13), `TOURIST_FLOW` (FX booth), `LIMITED_EDITIONS` (watch manufacture creates numbered collectible items for 14), `LONG_ORDERS` (yacht builder: orders with 91–182 game-day delivery, 30% deposit, cancellation risk in recessions), `DROPS` (sneaker resale), `REGULATORY_EVENTS` (nuclear, utility, hospital), `EMBARGO` (rare earths: 04/16 embargo events cut sales to a bloc), `RESERVES` (mines deplete), `WEATHER` (farms, wind), `TRIALS` (biotech).

### §3.5 Upgrades, condition, product lines and R&D

#### §3.5.1 The six axes (01 §4.2, kept)

| Axis | Effect per level | Cost of level n (n = new level, 1..25) | Build time |
|---|---|---|---|
| Capacity | +12% max units (capacity term in §3.3.3) | `c0 × 0.10 × 1.18^n` | ceil(n/5) game days |
| Quality | +0.04 quality index per level (§3.3.1) | `c0 × 0.12 × 1.20^n` | ceil(n/5) game days |
| Efficiency | −4% COGS and energy per level, multiplicative (`κ × 0.96^n`) | `c0 × 0.10 × 1.22^n` | ceil(n/5) game days |
| Marketing | flow spend per day (`marketingPerDay`), diminishing via `ln(1 + m/M_ref)` | flow cost | immediate |
| Automation | −6% wages per level (`wages × 0.94^n`); +0.16 h offline cap per level; levels ≥ 10 need an 11 operations model of MCS ≥ 50 for AI-manager functions | `c0 × 0.15 × 1.25^n` | ceil(n/5) game days |
| Expansion | open the same type in another city or district at `PARAM.biz_expansion_cost = 0.80 × c0`; joins the chain; brand bonus `0.05 × ln(1 + chainSize)` shared across the chain | 80% of c0 per site | setupDays |

Levels cap at `PARAM.biz_level_cap = 25`. Costs are SINK (`BIZ_UPGRADE_NPC`), or TRANSFER when a player construction company is contracted for the work (§3.9.6). Effects apply when the build completes; during the build the business keeps operating.

#### §3.5.2 Valuation reflection (anti buy-upgrade-sell loop, 01 §9)

EV is profit-based (§3.12.5) and uses the trailing 7-game-day average profit, so an upgrade raises EV only once it has produced profit; and the NPC buyer pays 85% of EV. Upgrade costs are not added to EV directly. Net effect matches 01 §9's rule that upgrade costs are at most ~70% reflected in sale value at reference conditions (verified by 09-AT-15).

#### §3.5.3 Condition

`condition' = clamp(condition − PARAM.biz_decay_per_day (1.0) × (1 − min(1, upkeepBudgetPerDay / upkeepRequired)), 0, 100)` at each day close, where `upkeepRequired = PARAM.biz_upkeep_ratio (0.0015) × (c0 + upgradesSpent)` per game day (01 §4.2: 1%/day decay without upkeep). Paying the required upkeep holds condition; paying half halves the decay. Upkeep is part of the fixed costs φ at reference. Condition feeds quality (§3.3.1), fire risk, inspections, catastrophe vulnerability (08) and EV (via profit). `biz.repair` restores condition at `(100 − condition) × upkeepRequired × 1.5` immediately (SINK).

#### §3.5.4 Product lines (company building)

Product-based types (PROCESSOR, SUBSCRIPTION software, HIT_DRIVEN studios, LUXURY makers, biotech, consumer brands) sell a `ProductLine` owned by the company. Several businesses of the company can sell the same line (factories in several blocs, stores in several cities).

```
category frontier F_cat(t): starts at 1.0; each game quarter F' = F × (1 + techDrift(cat))   (22: 0% staples … 6% electronics, 8% software)
productQualityRel = productLine.quality / F_cat
features add to attractiveness: + 0.3 × ln(1 + features) in segments PREMIUM and B2B
unit cost multiplier unitCostMult scales κ for that line
lifecycle stage by age and relative quality: LAUNCH (first 14 game days, +0.2 brand), GROWTH, MATURE (age > 182), DECLINE (productQualityRel < 0.8)
```

NPC competitors improve with the frontier (the NPC field's quality is pinned at 1.0 relative = F_cat), so a product that stops investing in R&D slides down in relative quality and loses share: R&D is required to stay competitive.

#### §3.5.5 R&D projects

```
biz.corp.startRd { kind, productLineId?, budget, durationDays (7..182), researchers }
Requirements: RESEARCH staff ≥ researchers (hire per §3.6); budget spent evenly per game day (SINK `RD_SPEND_NPC`, or TRANSFER to a contracted player dev studio / lab)
Effective effort E = (budget / (c0_line × 0.1)) × (1 + 0.1 × (researcherSkill − 3)) × (1 + 0.15 × aiAssist)    aiAssist ∈ [0,1] from an 11 research model
At completion (stream 'biz:rd:<projectId>'):
   p_fail = PARAM.rd_fail_base (0.15) × (1 − (researcherSkill − 1)/5) × (durationDays < 14 ? 1.5 : 1)
   if U < p_fail → FAILED (nothing gained; 50% budget sunk is already sunk)
   gainRaw = PARAM.rd_gain_k (0.12) × ln(1 + E) × exp(N(0, 0.25 × (1.2 − researcherSkill/5)))
   PRODUCT_QUALITY : quality += gainRaw × F_cat
   NEW_FEATURES    : features += 2 × gainRaw
   PROCESS_COST    : unitCostMult × (1 − 0.5 × gainRaw)  (floor 0.6)
   NEW_PRODUCT     : creates a new ProductLine with quality = F_cat × (0.9 + gainRaw) in the chosen category/segment
   CERT_PREP       : completes a certification's prep in half its prepDays
   PARTIAL if gainRaw < 0.02 (reported as such)
```

R&D results are private to the company (L11) until the product launches; launches are public product news (16) for companies with revenue ≥ $1M/day.

#### §3.5.6 Marketing campaigns

`biz.campaign { bizIds | chainId, amount }`: one-off spend split across the businesses; `brandBoost = 0.25 × ln(1 + amount / (Σ R* × 3))`, decaying with half-life 14 game days; plus it feeds `mkt_j`. A player marketing agency can be contracted (TRANSFER, its capacity limits campaigns it serves; better agencies multiply `brandBoost` by `0.9 + 0.05 × agencyQualityLevel/5`).

### §3.6 Staff, managers and the labour market

#### §3.6.1 Headcount and wages

- Required headcount per role = `staffPerCapacity[role] × (1 + 0.12 × capacityLevel)` rounded up (22 per type; e.g. café: 4 operations, 1 management at level 0). Automation reduces operations headcount required by 3% per level (in addition to −6% wages).
- Wage per head per game day = `baseWage[role] × cityWageIndex(c) (10/16) × wageIndex_bloc(t) (04) × (0.8 + 0.1 × skill)`. The owner sets a wage multiplier `w ∈ [0.8, 1.5]` per business (`biz.setWages`); morale and hiring speed respond.
- Morale (daily): `morale' = clamp(morale + 0.05 × (60 − morale) + 20 × (w − 1) − 5 × [wage lag vs 04 inflation > 3% over 91 days] − 3 × [utilization > 95% for 3 straight days] + 1 × [profit growth28 > 0], 0, 100)`.
- Loyalty (12 reads it for espionage, staff poaching E3): `loyalty' = clamp(0.98 × loyalty + 0.02 × (40 + 0.4 × morale + 20 × (w − 1) + 5 × ln(1 + avgTenureDays/91)), 0, 100)`.

#### §3.6.2 Hiring

`biz.hire { bizId, role, count, wageMult }`: vacancies fill at `fillRate = PARAM.hire_fill_per_day (0.5) × laborSupply(c, role) × (0.5 + 0.5 × w)` heads per game day (laborSupply from 16's hh labour data, 0..1 tightness-adjusted; unemployment raises it). Skill of hires ~ city skill distribution (22), raised by paying `w ≥ 1.2` (+0.5 skill expectation). Firing: `biz.fire` immediate with severance 7 game days of wages (SINK).

#### §3.6.3 Managers and CEOs

- NPC managers (1–5 stars) from the city's manager pool (16 generates candidates daily): salary per game day `= PARAM.manager_salary_base ($150) × 2^(stars − 1) × tierMult (B1 1, B2 3, B3 10, B4 40, B5 150, B6 500)`. Effects: +8 h offline cap (§3.4.4), auto-run marketing and pricing at the pricing-assistant optimum with a quality of `stars/5` (lower stars set suboptimal prices with error ±(5 − stars) × 3%), auto-reorder and auto-hire, condition upkeep at the required level.
- Professional CEO for a company (B3+ holdings): salary `0.002 × company revenue per day` (min $5,000/day) + bonus 1% of profit growth; offline cap 24 game days for all its businesses; executes the owner's standing policy (D05 delegation, 15 Mandate: budgets, price bands, capex limits, hiring limits); surfaces material exceptions (losses 3 days in a row, covenant headroom < 10%, strike, catastrophe, takeover approach).
- AI operator: an 11 operations model may be assigned instead of an NPC manager (11 owns capability, cost and failure modes; effects must be through the same decisions: pricing, reorder, staffing, marketing allocation, demand forecasting; I05). No unexplained profit multiplier exists anywhere.
- Key staff (B3+): named NPC staff (head chef, lead engineer, head of research) with skill 3–5; they raise `staffFactor` (+0.05 each, max +0.15) and research skill; they can be poached (12 E3 and lawful counter-offers via `biz.poachOffer` with a 2× wage at a rival: accepted if `offerWage/currentWage × (1 − loyalty/150) > 1.3`). Key-person insurance (08) covers profit loss.

#### §3.6.4 Strikes

If the strike event fires (§3.4.5), the business is in STRIKE (no sales; wages not paid; fixed costs continue). `biz.settleStrike { wageMult }` with `w` raised by ≥ the inflation lag ends it at the next game hour.

### §3.7 Supply chains, integration and synergies

#### §3.7.1 Inputs

Each type's `inputs` lists commodities (06: coffee, cocoa, wheat, corn, crude, natural gas, gold, copper, lithium, steel, lumber, rare earths), energy (MWh, priced per bloc by 06/11), compute (GPUh, 11), data (DQU, 11) and intermediate goods (22 list: roasted coffee, furniture, electronics components, chips, cars, refined products, construction services, freight, cold storage, maintenance service, cooling service, software licenses). Exchange-traded inputs are bought by orders on 05 (the business owner's account pays; small orders are aggregated per owner per game hour). Intermediate goods are bought from (1) internal suppliers, (2) supply contracts with players or NPC firms, or (3) the NPC wholesale market at `refCost × (1 + 0.03) × shortageMult`.

#### §3.7.2 Supply contracts

A supply contract is a 15 typed contract (supply clause): `{ supplierBizId, buyerBizId, inputId, qtyPerDay, pricePerUnit | indexFormula, durationDays, penaltyPerShortUnit, qualityMin }`. Deliveries execute daily at t = 0 from the supplier's output first (priority over spot sales); shortfalls pay the penalty automatically. Price may be indexed: `price = indexPrice (06 spot) × (1 + spread)`. This is how players hedge input costs with each other; futures on 06 are the other way.

#### §3.7.3 Switching costs and qualification (C06)

A new supplier of an INTERMEDIATE input or B2B service to an NPC customer requires qualification: `switchingCostDays` (22 per category, 0–28 game days) during which the new supplier delivers at 50% of contracted volume. Players face the same rule when switching their own suppliers (`qualificationDays` per input), shown before commit. Bounded dependence: customers diversify when one supplier exceeds 60% of their supply for 28 days (NPC customers split the next tender, §3.9.4).

#### §3.7.4 Internal allocation and vertical integration (I01–I08)

- `biz.allocateInternal { supplierBizId, toEntityId, capacityPct, transferPrice }`: reserves a share of the supplier's capacity for an owned entity (another business, a lab, a property development). Units delivered internally are not sold outside (opportunity cost = lost external margin, shown before commit, I02).
- Transfer price: `COST` (variable cost + allocated fixed cost) when the supplier and receiver are 100% owned by the same group; `ARMS_LENGTH` (the current market price or NPC appraisal) is mandatory when either entity has minority holders (I07, minority protection). Using COST across a minority boundary is blocked (validation) and an attempt adds +30 surveillance score (13).
- Consolidation (03): internal sales net out of group revenue and profit; only the external sale creates group profit (I06). Internal flows are TRANSFER postings between group entities.
- Vertical integration benefits (01 §4.3): the input arrives at cost, without market price risk; integration also concentrates risk (I08): if the supplier is closed (event, strike, catastrophe), the dependent business's input falls back to spot at that hour.
- Expertise benefits follow real capability (I01): a construction company with capacity allocated to its owner's builds reduces that owner's 10 development and 11 data-center build cost by `PARAM.integration_build_discount = 0.15` and time by 10%; an energy producer allocated to an owned data center supplies MWh at cost; a regional data supplier supplies permitted datasets to the owner's lab at cost (11 provenance tag `OWN_SUPPLY`).
- Dependency map: the company screen shows a graph of internal dependencies with exposure (share of each business's inputs from each internal supplier, single points of failure flagged).

#### §3.7.5 Synergies

- Cluster: 3+ businesses of the same owner group in one district: +5% demand to each (foot traffic, 01 §4.3), applied as `D_share × 1.05` before capacity.
- Conglomerate: businesses in ≥ 5 business sectors: brand +0.05 across all, and access to group services (shared CEO and shared back office: fixed costs −3% on every business). (01 §4.3 also tied the holding structure needed for IPO to this; see §3.10.1.)
- Chain brand: §3.5.1 expansion.
- Data generation: platforms, consumer apps, delivery, social, fintech, retail chains produce `dataRateDquPerUnit × units` DQU per hour for the owner (11).

### §3.8 Financial institutions, unique infrastructure and trophies

#### §3.8.1 Financial-sector catalog items

Buying a FINANCIAL_INSTITUTION type founds an institution rather than buying a café:

| Type | Becomes | Payment split | Requirements |
|---|---|---|---|
| Insurance company (B4, $30M) | an 08 insurer (`fund.ins.charter`) | `PARAM.fin_setup_fee = 0.10` × c0 SINK (charter, systems, licensing); 0.90 × c0 becomes the insurer's initial capital (stays the player's equity) | rank R4, 13 `CH_INSURER` (14 §3.2.2; ruling in 24) |
| Bank (B5, $800M) | a 07 bank | 10% SINK, 90% initial capital | rank R4, 13 `CH_BANK` |
| Hedge fund (B5, $300M) | an 08 fund manager company with a launched HEDGE fund; 90% of c0 is the manager stake | 10% SINK, 90% stake | rank R4 (above 08's R3 minimum because this item includes NPC allocator introductions: the fund is eligible for 08 §3.1.17 allocations from day 1 instead of after 2 quarters, at half the normal allocation for 2 quarters), `CH_FUND` |
| Brokerage (B3, $3M) | a PLATFORM_COMMISSION business on NPC retail order flow | normal (SINK) | rank R2 |
| Stock exchange (B6, $15B) | an exchange concession (§3.8.3) | via concession auction | rank R5 |

Financial institutions are not on the payback curve; their returns come from 07/08 mechanics. This resolves V3 question 1 (player banks and exchange concessions earlier than Dynasty): banks and insurers open at R4, exchange concessions at R5, sovereign wealth funds at R6 (DEFAULT, Mathis may override; 07, 08 and 14 apply the same ranks; ruling in 24).

#### §3.8.2 Unique trophies owned outright

Sports franchises (one per city), the Isla Serena resort, private islands (10) are owned outright, auctioned when created (English auction, 15 auction house rules, anti-snipe extension +12 ticks), carry heavy upkeep (`PARAM.trophy_upkeep = 0.0006 × value` per game day, SINK) and Prestige (14). New ones appear when new cities open (10).

#### §3.8.3 Concessions (01 §14.2 rule 3)

Power utility (per city), stock exchange (per bloc), port terminal (per coastal city), chip fab (per bloc), nuclear plant (per bloc) are regulated concessions for one chapter (1,344 game days):

1. At each chapter boundary (P2 calendar hook), every concession is re-auctioned. Eligibility: rank R5 (port terminal: R4), clean record (no S4+ in the chapter), and for the exchange `CH_EXCHANGE_MEMBER`. Consortia may bid through a syndicate company (15).
2. Sealed-bid first-price auction for 1 game day before the boundary. A bid is a concession fee (SINK `CONCESSION_FEE`), paid upfront.
3. The incumbent receives a bid credit of `PARAM.concession_incumbent_credit = 0.10` (its bid counts as 1.10×).
4. If the incumbent is outbid, the winner pays the incumbent the built assets' book value (TRANSFER `CONCESSION_HANDOVER`); staff, contracts and upgrades transfer with the asset.
5. Fee caps keep the platforms from being infinite faucets: exchange fees ≤ `PARAM.exchange_fee_cap_bps = 0.5` of traded notional, and total exchange concession revenue per game day ≤ `PARAM.exchange_rev_cap = 0.02%` of the bloc's daily traded value; utility returns are regulated (§3.4.2); port fees ≤ 0.3% of throughput value.
6. Build periods for new concessions: chip fab and nuclear plant must be built (28–182 game days per type, 22) before operating; a concession with an unfinished build passes the work-in-progress at book value.

### §3.9 Contracts with NPC customers, receivables and player services

#### §3.9.1 The Tender Board

Each city has a Tender Board where NPC customers (16 named actors, aggregate NPC firm sectors `frm`, governments `gov`, hospitals, ports) and players running their own tenders post requests.

Generation (daily at t = 0, P3, stream `biz:tender:<cityId>`):

```
for each B2B / GOVERNMENT / INSTITUTIONAL category in the city:
   tenderedVolume = PARAM.tender_share (0.30) × D_city(cat) (B2B and institutional) ; government categories 100%
   expected new tenders per day = tenderedVolume × avgDuration⁻¹ / avgTenderSize    (avgTenderSize from 22 per category, e.g. cold storage 200 pallet-days/day)
   each new tender: volume ~ LogNormal(ln(avgTenderSize), 0.8), duration ∈ {28, 56, 91, 182} game days (weights 0.4/0.3/0.2/0.1),
      priceCap = refPrice_B2B × U(0.95, 1.20), requirements drawn from the category's requirement profile (22),
      issuer = a named NPC actor active in that category (16) weighted by size, else the frm sector
   named-actor tenders also arise from causal events (16): a hospital expansion needs cold storage, a plant opening needs repairs (W08)
```

The remaining 70% of B2B demand is spot (§3.3).

#### §3.9.2 Requirements and visibility (C05)

All requirements, the issuer's name, volume, duration, price cap, penalty, payment terms, switching cost and the incumbent (if any) are PUBLIC on the board before bidding. Each requirement maps to a game quantity:

| Requirement | Engine check at bid and during delivery |
|---|---|
| minReliability | bidder's `reliability28` (new businesses: 0.9 assumed for the first 28 days, capped at tenders ≤ 2× its capacity) |
| certifications | listed certs held and valid |
| maxResponseHours | `spareCapacityPerHour × maxResponseHours ≥ volumePerDay`, where spare capacity = capacity − already committed contract volume per hour (it can deliver a day's volume within the response time) |
| minConfidentiality | 12's effective defense posture `DP_eff` of the bidder's company ≥ threshold |
| minRating | the bidder company's composite rating (08) ≥ threshold (only large tenders ≥ $1M/day) |
| localPresence | a business of the bidder group in that city |

#### §3.9.3 Bidding and award

1. `biz.tender.bid { tenderId, leadBizId, pricePerUnit ≤ priceCap, volumeOffered, partners? }` until `bidDeadlineTick` (default 1 game day after posting). Sealed.
2. Score per eligible bid: `score = w_p × (priceCap − price)/priceCap + w_r × reliability28 + w_rep × reputation/100 + w_q × (qEff − 1) + w_inc × [incumbent] × (switchingCostDays / 28)`; default weights by requirement profile (price-led: 0.6/0.2/0.1/0.1/0.2; reliability-led: 0.3/0.4/0.1/0.2/0.3; certified-led: 0.3/0.3/0.2/0.2/0.3).
3. Award: highest score wins up to its offered volume; remaining volume goes to the next bids in order (split awards). NPC field suppliers bid at `priceCap × U(0.90, 1.0)` with reliability 0.92 and fill any unawarded volume.
4. The award creates a 15 supply contract with the NPC issuer as counterparty: daily delivery from the business's capacity first (before spot), payment per payment terms (receivables §3.9.5), penalty per short unit (TRANSFER to the issuer = SINK when the issuer is NPC), early termination if reliability28 < minReliability for 7 consecutive game days.
5. Renewal: at expiry the issuer re-tenders; the incumbent bonus applies.

#### §3.9.4 Concentration and bargaining (C07)

- A customer accounting for > 40% of a business's revenue over 28 days is flagged on the business screen ("concentration risk").
- Customer power at renewal: the new price cap is lowered by `bargain = clamp(0.05 × (customerShareOfSupplierRevenue − 0.3)/0.1, 0, 0.15)` when the supplier depends on the customer.
- Supplier power: when the supplier provides > 60% of the customer's supply and switching costs ≥ 14 days, the cap is raised by up to 10% at renewal; but the NPC customer then splits the next tender into 2 awards (diversification, F04).
- Players can decline any tender, negotiate a private contract instead (15), diversify, or partner.

#### §3.9.5 Receivables and trade credit

Sales on payment terms create `Receivable`s (B2B sales to NPC or players). Payment at `dueTick`; NPC customers pay late with probability `PD(customer)/12` per game month and default with their 07/16 PD (the receivable then has 40% recovery after 91 game days). Receivables are assets on 03's balance sheet, insurable (08 TRADE_CREDIT), factorable (sold to a 07 bank at `face × (1 − (rate × days/364) − 0.01)`), and securitizable (08 `TRADE_RECEIVABLE`). Payables to suppliers mirror them.

#### §3.9.6 Player-to-player services and subcontracting (C08)

- Service businesses (property management agency, marketing agency, law firm, cybersecurity firm, PI firm, construction company, accounting firm, freelance dev studio, cleaning service, IT support) list service offers on the 15 Services market: `{ service, pricePerUnit, capacity, qualityLevel, slaTerms }`. Buyers sign 15 service contracts (service-level clause). NPC providers are always available at reference price and quality 1.0.
- Effects of the bought service are real and specific: a property management agency runs 10's management policies for the client's properties at an 8% fee on managed rent, with its quality level reducing vacancy by 2% per 5 levels; a marketing agency multiplies campaign brandBoost (§3.5.6); a law firm's quality feeds 13's counsel quality; a cybersecurity firm adds defense per 12's service-contract rules; a construction company builds 10 developments and upgrades at its quoted price and time (its capacity limits concurrent projects; delays from input shortages); an accounting firm lowers the client's taxable profit by up to 5% (03) and reduces audit odds (13) by 10%.
- Payments between players are TRANSFER (with 15's contract fees). The 2% P2P tax applies to asset transfers, not to service fees (15 owns the tax rule; assumed).
- Subcontracting and consortium bids: a lead bidder lists partners and volume shares; the 15 consortium contract allocates payment, delivery responsibility and penalties; the engine checks each partner's deliveries and attributes shortfalls to the partner who missed (no free alliance bonus).

#### §3.9.7 Certifications

`biz.certify { bizId, certId }`: pay cost (SINK), wait `prepDays` (R&D CERT_PREP halves it), must meet requirements (quality level, condition, compliance staff). Valid for `validityDays`; quarterly audit probability `auditPerQuarterProb`: an audit failing the requirements revokes the cert and terminates contracts that require it after a 7-day cure. 22 lists certifications (DEFAULT names: MedGrade, ColdChain Assured, SecureVault, QualityMark, GridSafe, PortSafe, CleanLab, FinCompliance).

### §3.10 IPOs and listing (approved idea #1, roadmap §2.1)

#### §3.10.1 Eligibility

| Rule | Value |
|---|---|
| Issuer | a `cmp` (any kind except NPC) |
| Size | company EV (§3.12.5, consolidated) ≥ `PARAM.ipo_min_ev = $50,000,000` (01 §4.6) |
| History | company owned by the founder group ≥ `PARAM.ipo_min_owned_days = 336` game days (14 real days) and ≥ `PARAM.ipo_min_quarters = 3` reported game quarters of ledger-verified statements (03). Biotech after a trial pass: 1 quarter suffices (01 twist "can IPO on a trial win") |
| Founder | rank ≥ R3, holds LIC3 (L10: late-gated), no S4+ conviction in the last 1,344 game days |
| Sectors | no minimum (DEFAULT). The 01 §4.3 "5+ sectors → holding structure needed for IPO" rule is replaced by "any company may list": Mathis's company-building directive (2026-10-09) sets the path private → bigger tiers → IPO for a single-product company. The 5-sector conglomerate keeps its synergy bonus (§3.7.5) |

#### §3.10.2 Offering

1. `biz.ipo.file { cmpId, floatPct ∈ [0.15, 0.49], secondaryPct ≤ 0.10, exchangeId }`. Float minimum 15%, maximum 49% at IPO (roadmap). Proceeds are primary (cash into the company treasury); a founder secondary sale of at most `PARAM.ipo_max_secondary = 0.10` of the company is allowed inside the float (roadmap left it to Mathis; DEFAULT: allowed, Mathis may override).
2. NPC underwriter (a 07 NPC bank, chosen by the bloc) sets a price range `[0.9, 1.1] × EV / sharesPostMoney` and charges `PARAM.ipo_underwriting_fee = 0.05` of gross proceeds (`IPO_UNDERWRITING_FEE` = `CMP_UNDERWRITING_FEE`, TRANSFER to the NPC underwriter sector; Producer ruling E-44).
3. Prospectus (PUBLIC): 3 quarters of statements (03), business list by type and city, debt, cap table, risk flags (concentration, related parties, litigation from 13), use of proceeds. No private strategy beyond this.
4. Book: 1 game day. Bids `{ shares, limitPrice }` from players (LIC1+, account ≥ 168 game days, not linked to the founder in 19's collusion graph, not the founder's alliance) and NPC pools. NPC demand: value pools bid `V × U(0.92, 1.08)` (V from §3.12.5) with total capacity `PARAM.ipo_npc_demand_mult = 2.5 × offering size × (1 − fear)`.
5. Clearing: single uniform price = the highest price at which demand ≥ offering, clamped to the range (if demand at the range bottom < offering, the IPO fails: withdrawn, fee 1% of target, TRANSFER `CMP_IPO_FAIL_FEE` to the underwriter ([Quant] confirm, E-44), refile after 91 game days).
6. Allocation pro rata at the clearing price, capped at `PARAM.ipo_max_alloc_pct = 0.05` of float per buyer.
7. Listing: the stock is registered in 06 as an equity of the company's market sector and trades on 05 from the next session (opening auction). The company gets an HQ tower in the CBD queue (10, 06-cities §6.1).

#### §3.10.3 Post-listing rules (all from roadmap §2.1)

| Rule | Value |
|---|---|
| Founder lockup | `PARAM.ipo_lockup_days = 168` game days (7 real days) |
| Founder sales after lockup | ≤ `PARAM.founder_sell_cap = 0.02` of shares outstanding per game day, pre-announced 1 game day ahead through a public filing (15) |
| Blackout | founder, board, officers and the founder's alliance cannot trade the stock from 2 game days before an earnings release to 1 game day after |
| Related-party deals | price within 10% of NPC appraisal (§3.12.6) |
| Buybacks | announced program only, ≤ 1% of float per game day |
| Secondary offerings | 7 game days (1 game week) notice on the Wire |
| Short selling | opens 3 game days after listing |
| Ladder and leaderboard marks | `min(fair value V, 3-day VWAP)` (02 §6.4) so pumping your own stock does not pump your rank |
| Media flag | a player-owned news outlet publishing about a stock that it, its owner or the founder hold triggers a surveillance flag (13) |
| Insider trades | public within 1 game day (02 §8.3) |
| Position caps | any single player other than the controller ≤ 49% of a player company (01 §7.6) unless through a tender (§3.13.3) |
| Delisting review | EV < `PARAM.delist_ev = $10,000,000` for 5 straight game days → 13/exchange review: delist after 28 game days unless EV recovers above $15M |

#### §3.10.4 Fundamental value of a listed player company (the interface 05 uses)

`09.fundamentalValue(cmpId)` returns `V_share = (Σ_biz EV_biz × groupOwnership + Σ properties 10 appraisal + Σ financial assets at 05/06 marks + cash − debt at book − preferred liquidation preferences − minority interests' share) / dilutedShares`, recomputed at each day close. 05 uses this V as the fundamental anchor for player-listed stocks (its pull term, sentiment multiplier and agent pools work as for any stock). Player businesses are valued by their own EV rule (§3.12.5), not by an annual P/E, because the business layer runs on game-pace economics (payback in game days); this keeps IPO price, takeover price and NPC sale value consistent with each other. NPC listed companies keep 06 §3.4.2's P/E fundamental model; 06 §3.4.2 returns this V for player-listed companies (ruling in 24).

### §3.11 Startups and venture rounds (private markets, 01 §3.9)

#### §3.11.1 NPC startups

- Each game week, each bloc spawns `PARAM.startups_per_week = 3 × (N_a_bloc / 4,000)` (min 1) NPC startups (16 names founders; 22 category list). Pitch: sector, category, team score, market score, burn per game day, round size.
- Hidden fate drawn at creation (stream `biz:startup:<cmpId>`): outcome multiple on invested capital by the power law of 01 §3.9: 65% fail (multiple 0), 25% `U(0.5, 3)`, 9% `U(3, 20)`, 1% `Pareto(α = 1.1)` from 20 capped at 200; resolution time `U(1, 3)` chapters after the seed. Failure time for failures: `U(0.2, 1.0)` of the resolution time.
- Visible scores are noisy views of the fate: `teamScore_obs = clamp(50 + 15 × z_fate + N(0, σ_obs), 0, 100)`, `σ_obs = 25` for everyone, reduced by research: a player's hired analyst or a 11 research model with MCS m reduces σ_obs for that player to `25 × (1 − min(0.6, m / 500))` (the AI hook: better research, sharper estimates), and private-intelligence due diligence (§3.9.6) to ×0.7.
- Rounds: SEED (round size $0.5–2M, pre-money 3× raise), A ($5–15M), B ($20–60M), C ($80–250M), GROWTH. Between rounds (91–182 game days), a startup whose fate is not failure hits its milestone with probability 0.7 + 0.1 × (fate multiple ≥ 3); a hit raises the next round at pre-money = `previous post-money × U(2, 4)`; a miss raises a down-round at `× U(0.5, 0.9)` or fails if its runway (cash / burn) ends.
- Exits at resolution: IPO (if outcome ≥ 10× and size permits, §3.10) or trade sale to an NPC acquirer at `outcome × total invested`; failure returns liquidation value 5% of last post-money to preferred holders by preference.

#### §3.11.2 Investing (players, VENTURE funds of 08)

- Requires LIC4 (01 §3.9: Institutional). `biz.venture.invest { cmpId, roundId, amount }` within the round's allocation (lead investors: NPC VCs; players may lead with ≥ 40% of the round, setting the pre-money within ±20% of the NPC lead's terms).
- Terms (DEFAULT standard term sheet): series preferred, 1× non-participating liquidation preference, broad weighted-average anti-dilution, pro-rata rights for investors holding ≥ 1% fully diluted, an option pool top-up to 10% pre-money each round, one board seat for a round lead.
- Down-round anti-dilution: new conversion price `CP2 = CP1 × (A + B) / (A + C)` where A = fully diluted shares before, B = new money / CP1, C = new shares issued.
- Waterfall at exit: liquidation preferences by seniority (later rounds senior by default), each preferred class takes the greater of its preference or its as-converted share; common gets the rest.

#### §3.11.3 Player-founded startups

A player company founded in a product-based category may raise venture money: NPC VC term sheet pre-money = `max(1, revenueRunRate × 364 × revenueMultiple(cat) × (productQualityRel)^2, teamValue)` where `teamValue = $2M × (1 + founderTrackRecord)` (founder track record = number of past companies with EV ≥ $50M, cap 3); the NPC VC accepts only if `productQualityRel ≥ 0.9` or growth28 ≥ 0.2. The same preferred-share terms apply to the founder's cap table; down-rounds and liquidation preferences bite the founder exactly as they would anyone.

### §3.12 Corporate finance and valuation

#### §3.12.1 Share classes and voting

- Common shares: 1 vote. Preferred: per terms (§3.11.2), non-voting except on class matters.
- Founder super-voting shares are allowed before listing (votesPerShare up to 10) and convert 1:1 to common at IPO (DEFAULT, Mathis may override): listed companies are one share one vote, so hostile takeovers and proxy fights remain real routes against rich players (03 §12 #5).

#### §3.12.2 Debt

- Bank loans (term loans, revolvers) come from 07 (underwriting, pricing, covenants are 07's). 07 lends to operating companies against cash flow and collateral using its product table (07 §3.4.3; ruling in 24, 07 owns lending limits): business term loan ≤ 3.0 × EBITDA_annual with DSCR ≥ 1.25, revolver ≤ 1.0 × EBITDA_annual (so at most 4 × EBITDA of bank debt in total); there is no separate EV cap (E-45); the rate is `base + creditSpread(composite rating or 07 internal score)`.
- Bonds: `biz.corp.issueBond { cmpId, amount, tenorDays, couponType, seniority, covenants }`: sold through a 1-game-day book-build on 06 (uniform price on yield), rated by 08 agencies (issuer pays), listed on 06. Requires a composite rating or an unrated flag (unrated bonds sell only to players and HY funds).
- Convertibles: bond with conversion ratio; conversion at holder's option after 91 game days; 06 prices it.
- Interest accrues daily (`rate/364`) and posts at day close (`INTEREST` TRANSFER to player lenders, SINK to NPC lenders).

#### §3.12.3 Covenants

Tested every game quarter at quarter-end (and on any new borrowing):

```
netLeverage = (debt − cash) / EBITDA_annual          (EBITDA_annual = last quarter EBITDA × 4)
ICR         = EBITDA_annual / interest_annual
liquidity   = cash + undrawn revolver
```

Breach → `CURE_PERIOD` of `PARAM.covenant_cure_days = 28` game days: the company may cure (raise equity, repay), request a waiver (`biz.corp.requestWaiver`: NPC lenders accept with probability `σ(3 − 4 × breachSize)`; fee 0.5% of the facility, SINK), or default. An uncured breach is an event of default: lenders may accelerate (NPC lenders accelerate when `fear > 0.5` or breach size > 25%, else re-price +200 bps), leading to §3.16 if the company cannot pay.

#### §3.12.4 Dividends, buybacks, issuance, splits

- Dividends: `biz.corp.dividend { cmpId, perShare }` declared by the controller (private company) or by board vote (listed: the controller's board seats decide unless a special meeting overrides). Blocked if: post-dividend cash < 7 game days of fixed costs, equity < 0, a covenant forbids it, a restructuring is open. Ex-date the next game day; paid at that day close (`DIVIDEND` TRANSFER; to NPC holders SINK). For NPC listed companies, 01's dividend faucet is 16/05's.
- Buybacks: listed companies through an announced program (`biz.corp.buybackProgram { maxShares, untilTick }`), executed as company orders on 05 ≤ 1% of float per game day; private companies by 15 contract with the selling holder.
- Issuance: private: `biz.corp.issueShares { toId, shares, price }` (15 contract; anti-funnelling price check vs V, > 10% off → flagged). Listed: secondary offering with 7 game days notice, 1-game-day book, uniform price, discount ≤ 10% to 5-day VWAP; or a rights issue to all holders pro rata.
- Splits: when the share price exceeds $1,000 the controller may split (2:1 … 10:1); 05 adjusts orders and history (01 §3.1).

#### §3.12.5 Valuation of businesses and companies

```
EV_biz = max(floor, profit7Avg × multipleDays(tier) × sectorAdj(sector) × growthAdj)
   profit7Avg  = mean daily operating profit over the last 7 game days (IDLE days excluded from the mean; 0 if fewer than 3 open days)
   multipleDays= the tier table (§3.1.2): equals base payback, so a reference business is worth ≈ c0
   sectorAdj   = 22 (0.8 commodity producers … 1.3 subscription and platforms)
   growthAdj   = clamp(1 + 2 × growth28, 0.7, 1.5)   (growth28 = profit28Avg / profit28Avg 28 days ago − 1)
   floor       = 0.25 × (c0 + upgradesSpent) × condition / 100          (asset value)
EV_company = Σ_biz EV_biz × ownership + subsidiaries' EV × ownership + properties (10) + labs (11 appraisal) + financial assets at market
Equity value = EV_company − net debt − preferred preferences − minority interests
FINANCIAL_INSTITUTION units are valued at book equity × (1 + 0.5 × max(0, ROE_annual − 0.10)) capped at 2× book.
NPC legacy operations (absorbed NPC listed companies, §3.13.10): annual earnings × 05's sector P/E band midpoint.
```

EV is shown live on every business and company page (01 §4.6).

Interface for 08 (Level-3 marks of private stakes): `09.valuePrivateStake(cmpId, classId, shares)` = the value of those shares in a liquidation-preference waterfall (§3.11.2) run on `Equity value` above, i.e. each preferred class gets the greater of its preference or its as-converted share, common gets the rest, pro rata to `shares`. No minority or illiquidity discount is applied (DEFAULT); 08's NPC valuer uses this figure each game quarter.

#### §3.12.6 Related-party transactions (I07, roadmap §2.1 rule 3)

Any transaction between a company with minority holders (listed, or private with any outside holder) and its controller, the controller's other entities or linked accounts — asset sales, leases, loans, service contracts, internal allocations — must price within `PARAM.related_party_band = 0.10` of the NPC appraisal (EV rule, 10 appraisal, market price). Outside the band the transaction is blocked and the surveillance score gets +30 (13). Within the band it is allowed and listed in the company's next filing (public for listed companies).

#### §3.12.7 Selling

- To an NPC buyer: `biz.sell { bizId, toNpc: true }` instant at `PARAM.npc_sale_haircut = 0.85 × EV_biz` (01 §4.6; FAUCET `BIZ_SALE_NPC`, the 15% haircut is the sink effect). The business leaves the player economy (becomes part of the NPC field weight of its market: `npcField.weight += W_j`).
- To a player: via a 15 transfer contract at any price; 2% P2P tax (15); price > 10% from EV flagged (01 §9 anti-funnelling, account-age caps per 15).
- On the business & property exchange (15): listing with bids, settles at a tick.
- Companies: shares of private companies sell by contract; listed shares on 05.

### §3.13 M&A, takeovers, defences and activism

#### §3.13.1 Ownership thresholds (01 §7.5, 02 §8.3; 15 publishes filings)

| Threshold (of voting shares, aggregated over the holder's group and 19-linked accounts) | Consequence |
|---|---|
| ≥ 5% | public filing within 1 game day (L11: legal filing rule) |
| ≥ 10% | may requisition a special meeting; becomes an insider |
| ≥ 20% | entitled to nominate board seats in proportion (cumulative voting) |
| ≥ 50% | control: board majority at the next meeting; 03 consolidates |
| ≥ 90% | squeeze-out right at the tender price |

#### §3.13.2 Open-market accumulation limits (01 §7.6)

- NPC companies: ≤ 25% of float by open-market purchases; beyond that only by tender.
- Player companies: a single player other than the controller ≤ 49% unless by tender (no creeping past 49%, roadmap §2.1).
- Orders beyond the cap are rejected in P1.

#### §3.13.3 Tender offers (requires LIC4)

1. `biz.ma.tender { targetCmpId, pricePerShare, consideration, minAcceptancePct (≥ 0.50 for control bids), durationDays ≥ 7 }`. Price ≥ max(highest price the bidder group paid in the last 91 game days, 30-game-day VWAP). Cash consideration must be escrowed at the CCP (or committed financing: 07 loan commitment); stock consideration requires the bidder to be listed and, if new shares > 20% of its count, its own shareholder vote.
2. Same price to all holders (one class at a time). Offers may be raised (all tendering holders get the higher price) and extended; competing offers may be launched while one is open; holders may withdraw tendered shares until close.
3. NPC holders tender if `price ≥ reservation`, `reservation = max(V, market price) × (1 + PARAM.npc_tender_premium ~ U(0.05, 0.25))` per NPC holder block (16 named funds use their own), and they follow the target board's recommendation when the gap is within 5%.
4. At close: if acceptance ≥ minimum and all conditions hold (antitrust §3.13.6, pill redeemed or not triggered, financing), the bidder buys all tendered shares at the price (TRANSFER to player holders, SINK to NPC holders); else the offer lapses and shares return.
5. ≥ 90% after the tender: squeeze-out of the rest at the same price within 7 game days; the company delists if 100%.
6. Take-private by the controller of a listed company: tender to all holders at ≥ `PARAM.take_private_premium = 1.2` × 30-game-day VWAP (roadmap).

#### §3.13.4 Negotiated mergers

`biz.ma.mergerProposal { acquirerCmpId, targetCmpId, consideration, exchangeRatio?, cashPerShare? }` → both boards approve (controllers or board votes) → target shareholder vote (> 50% of shares outstanding) and acquirer vote if issuing > 20% new shares → antitrust review (§3.13.6) → closes 7 game days after the last approval. Target shares convert to acquirer shares or cash; the target becomes a subsidiary (or is merged into the acquirer's books). Dissenting holders of private companies may demand appraisal: paid at V (§3.10.4) instead of the deal price.

#### §3.13.5 NPC private companies

16 generates NPC private firms per city (they appear as named competitors in markets). `biz.ma.approachPrivate { npcCmpId, offer }`: the founder accepts if `offer ≥ EV × (1 + premium)` where `premium ~ U(0.10, 0.30)` and with probability `1 − founderIndependence` (W04: a founder preserving independence may refuse at any price, `founderIndependence ∈ [0, 0.9]` from 16; a family protecting control requires +20%). On acquisition its market presence converts into biz units of the matching catalog types at levels mapped from its capacity and quality (22 mapping), its staff and contracts transfer.

#### §3.13.6 Antitrust review

Any acquisition, merger or tender that would give one group > 60% of any market (§3.3.7) or > 40% of a bloc's supply of a strategic input (chips, rare earths, compute, energy) is referred to 13's competition regulator: review 14 game days; remedies: block, or approve with divestiture of named businesses within 28 game days (sold at 85% EV − 15%).

#### §3.13.7 Defences (01 §7.5, 03 §12 #5)

| Defence | Mechanics | Cost / approval |
|---|---|---|
| Poison pill (shareholder rights plan) | trigger `PARAM.pill_trigger = 0.20` of voting shares acquired without board approval; on trigger every other holder may buy 1 new share per share held at `PARAM.pill_discount = 0.50` of market price within 3 game days | board adopts; expires after 364 game days unless shareholders approve renewal; the board may redeem it (needed to complete a friendly bid); costs the company nothing until triggered, then dilutes the acquirer |
| Staggered board | only 1/3 of seats elected per AGM | adoptable only before IPO or by 2/3 shareholder vote |
| White knight | the target's board recommends a competing friendly bid (any player or NPC acquirer the board invites, via 15 contract) | none |
| Buyback defence | reduce float through an existing program | cash; limited by §3.12.4 |
| Pac-Man | the target tenders for the bidder (if listed) | same rules as §3.13.3 |
| Golden parachute | CEO payoff on change of control ≤ 1% of EV | paid by the acquired company (TRANSFER to a player CEO; TRANSFER `CMP_GOLDEN_PARACHUTE_NPC` to the NPC hh sector, E-44, amount [Quant] confirm) |
| Controller stake | keep ≥ 51% | opportunity cost |

#### §3.13.8 Activism and proxy fights

- `biz.ma.activistLetter { targetCmpId, demands: ('DIVIDEND' | 'BUYBACK' | 'SELL_BUSINESS' | 'REPLACE_CEO' | 'BOARD_SEATS' | 'REDEEM_PILL' | 'STOP_RELATED_PARTY')[] }`: requires ≥ 5%; PUBLIC.
- A holder with ≥ 10% may call a special meeting (held 7 game days later). At the AGM (each game year, at the company's founding anniversary) or a special meeting, motions are voted.
- Votes: players vote their shares (`biz.corp.vote`); NPC holders vote by the NPC proxy advisor (16 named actor "Proxy Advisory") recommendation: the advisor supports a motion if the engine's valuation gain `ΔV/V > 0.02` (computed: buyback when price < 0.9 V raises V per remaining share; dividend when cash > 20% of EV and the company's incremental return on cash < its cost of capital; selling a business when its EV contribution < its sale value; replacing a CEO when the company's 4-quarter return on equity is in the bottom quartile of its sector; redeem pill when a bid ≥ 1.2 × V exists; stop related party when a related-party flag exists). NPC holders follow the advisor with probability 0.8, else the board.
- Board seats by cumulative voting: a holder with share fraction f of votes cast can elect `floor(f × (seatsUp + 1))` seats.

#### §3.13.9 Insider information in M&A

Anyone who learns of an unannounced bid (bidder group, target board, advisers, a player who obtained it by espionage) is an insider for that target until the bid is public. 13's insider rules (roadmap §2.5: insider points on trades ≤ 1 game day before material events) apply; this module emits the SEALED `biz.ma.insiderWindow` events listing the insiders.

#### §3.13.10 Absorbing an NPC listed company

When a player group reaches ≥ 50% of an NPC listed company (via tender), it becomes a subsidiary `cmp` with an `NPC_LEGACY_OPERATIONS` business unit that runs 16's company model (revenue growth with sector demand × regional GDP, margin, debt; 01 §3.1) and pays its operating profit to the group daily (FAUCET `BIZ_REVENUE_NPC` net of its costs); the controller may merge it with own businesses (moving categories into catalog-type biz units by the 22 mapping), sell divisions, change dividend policy, and pays its debt. It remains listed (minority holders) unless taken private.

### §3.14 Leveraged buyouts

1. Acquirer: a player company or an 08 PRIVATE_EQUITY fund; target: a private company, a business set, or a listed company (by tender, §3.13.3).
2. Equity contribution ≥ `PARAM.lbo_min_equity = 0.30` of the purchase price.
3. Debt package (from 07 lenders and 06 high-yield bonds), sized by the lender's tests: `totalDebt ≤ min(PARAM.lbo_max_ev_ltv (0.65) × EV_target, PARAM.lbo_max_ebitda_mult (6) × EBITDA_annual)`, senior part ≤ 4× EBITDA; pricing = base + spread from 07's credit conditions + leverage add-on `75 bps × (Debt/EBITDA − 3)+`. PIK toggle notes allowed for the junior part (interest added to principal at +1%).
4. Debt push-down: at closing, the acquisition debt sits on an acquisition company that merges with the target (the target's cash flows service it).
5. Covenants: max net leverage stepping down 0.5× per game year, min ICR 2.0, cash sweep `PARAM.lbo_cash_sweep = 0.50` of excess cash flow each quarter applied to senior principal.
6. Maturity 3 game years (1,092 game days) senior, 4 junior; refinancing at maturity needs a new 07/06 deal at then-current conditions (refinancing risk is real; if credit conditions are tight and the deal fails, it goes to §3.16).
7. Exit routes: sale to an NPC strategic (EV × U(1.0, 1.2)), IPO, sale to another player, dividend recap (new debt to pay a dividend, subject to covenants).
8. The interlock (V3 3.7): rates (04), credit standards (07), operations (this module) and ratings (08) together decide LBO success.

### §3.15 Earnings, filings, governance and corporate actions

#### §3.15.1 Statements and earnings

- 03 produces each company's income statement, balance sheet and cash-flow statement every game quarter (91 game days); this module supplies segment data (per business revenue and profit) and KPIs (units, share, capacity utilization, subscriber counts, backlog).
- Listed companies release earnings (EPS, revenue, margin, guidance, optional `biz.corp.guidance { epsNextQ }`) on the report day and slot set by 06 §3.4.3 (quarter close + 5–24 game days, PRE t = 30 or POST t = 600; ruling in 24: 06 owns the earnings schedule for every listed issuer).
- Consensus: 09 supplies `E_q[EPS]` for a player company as `runRateEPS × (1 + 0.5 × growth28 annualized to the quarter) × 0.6 + guidance × 0.4` (guidance term only when given); 06 §3.4.3 step 2 applies the analyst noise and publishes the consensus. A better-informed player (data, research models) can estimate better (01 §3.1).
- Surprise `= actualEPS / E_cons − 1` is emitted with the release; 05 applies the earnings jump (01 §3.1: 2–4× surprise plus guidance change). Missing your own guidance by > 20% two quarters running adds an analyst-credibility penalty: consensus thereafter ignores guidance for 2 quarters.

#### §3.15.2 Disclosure obligations of listed companies

Material events must be disclosed within 1 game day (PUBLIC filing via 15): acquisitions or disposals > 10% of EV, new debt > 10% of EV, covenant breaches, rating actions (automatic), restructuring, CEO change, related-party transactions (in the quarterly filing), tender approaches the board has received (once the bidder announces). Late or false filings are 13 offences (S1–S5, 03 §12 #10).

#### §3.15.3 Governance

- Board: 7 seats for listed companies (5 for private companies with outside holders). Members are nominees of holders (players appoint themselves or NPC directors; NPC directors are independent). Terms 1 game year (or 3 with a staggered board).
- Decisions needing the board: dividends, buybacks, issuance ≤ 20%, CEO appointment, pill adoption, recommending a bid. Needing shareholders: issuance > 20%, mergers, charter changes (2/3), pill renewal, staggered board adoption (2/3).
- The controller's board majority decides board items; minority holders' protections are the related-party rule, appraisal rights, disclosure, and 13 derivative suits (D&O insurance in 08).
- Insiders: board members, CEO, officers, holders ≥ 10%; insider trades public within 1 game day; blackout windows §3.10.3.

#### §3.15.4 Spin-offs and carve-outs

`biz.corp.spinOff { parentCmpId, subsidiaryCmpId, mode: 'DISTRIBUTE' | 'IPO' }`: DISTRIBUTE gives parent holders subsidiary shares pro rata (the subsidiary lists if the parent is listed and it meets §3.10.1 size); IPO runs §3.10 for the subsidiary. 08 index divisors adjust.

### §3.16 Distress, restructuring and bankruptcy (company level; character bankruptcy is 14)

#### §3.16.1 Triggers

A company enters DISTRESSED when any of: a missed scheduled debt payment (after 3 game days grace), an accelerated facility it cannot repay, negative equity with cash < 7 game days of fixed costs, or a court judgment (13) it cannot pay within 7 game days.

#### §3.16.2 Out-of-court exchange

`biz.restructure.exchangeOffer { cmpId, offers: per debt class { newDebtPct, newEquityPct, cashPct } }`: open 14 game days; succeeds per class if holders of ≥ `PARAM.exchange_consent = 0.90` of the class accept (holdouts keep their original claims). NPC holders accept if their recovery value (computed at reorganization value, §3.16.4) ≥ their expected court recovery × 1.05.

#### §3.16.3 Protected Reorganization (court-supervised; 13 provides the court case)

1. Filing: by the company (`biz.restructure.file`) or forced by creditors holding ≥ 25% of debt after an uncured default. Effects: automatic stay (no creditor may seize collateral or sue; 07 margin calls on the company's secured loans are frozen), listed shares continue to trade with a "Q" flag, management continues (debtor in possession).
2. DIP financing: `biz.restructure.dip { lenderId, amount, rate }`; super-priority over all pre-filing claims; NPC DIP lenders (07) offer `≤ 15% of reorg value` at base + 600 bps.
3. Claims: every claim is classified (DIP, ADMIN (professional fees, unpaid wages up to 28 days), SECURED (to the value of collateral; deficiency becomes unsecured), SENIOR_UNSECURED, TRADE (supplier payables, contract penalties), SUBORDINATED, PREFERRED_EQUITY, COMMON_EQUITY). Each class with tradable claims becomes a 06 `CLAIM` instrument (RFQ and weekly auction) so distressed investing is a market (V3 3.7).
4. Exclusivity: the debtor has `PARAM.reorg_exclusivity_days = 28` game days to file a plan; after that any creditor class holding ≥ 20% may file a competing plan.
5. Plan content: recoveries per class (cash, new debt, new equity), optional new money from a plan investor in exchange for equity (rights offering to creditors).
6. Voting (14 game days): a class accepts if ≥ 2/3 of the amount voted and > 1/2 of the number of holders voting accept; unimpaired classes are deemed to accept.
7. Confirmation: if all impaired classes accept → CONFIRMED. Cram-down: if at least one impaired class accepts and every dissenting class is treated by absolute priority (no junior class receives anything unless the dissenting senior class is paid in full in value) → CRAMDOWN confirmed. Every class must receive at least its liquidation-value recovery (best-interests test).
8. Deadline: if no plan is confirmed within `PARAM.reorg_deadline_days = 91` game days of filing, or if reorg value < liquidation value, the case converts to liquidation.
9. Emergence: old equity is cancelled unless paid; new shares and debt are issued per plan; the company leaves IN_REORG; ratings (08) are reassigned; listing continues if the new equity float ≥ 15%, else it is delisted and the new shares trade on 15's private exchange.

#### §3.16.4 Valuations in restructuring

- Reorganization value = `0.8 × EV_company` (§3.12.5 with the last 28 days' profit instead of 7, to look through the distress), cross-checked by an NPC valuation expert (16) whose estimate is that figure × `U(0.9, 1.1)` (seeded) and is the value used.
- Liquidation value = Σ business NPC sale value at 85% EV × 0.85 (fire-sale) + properties at 10's forced-sale value + financial assets at market − liquidation costs 5%.

#### §3.16.5 Liquidation

The engine sells every business to NPC buyers (or to the highest player bid on the 15 business exchange within 7 game days, if higher), properties via 10 forced sale, and financial assets on 05 over ≤ 5 game days at ≤ 20% ADV; proceeds pay classes by absolute priority; the company is DISSOLVED. A player owner loses equity; personal guarantees (if signed in a 07 loan) pass the deficiency to the guarantor; otherwise limited liability holds. The 03 §13.5 floor (a character always keeps $5k liquid + one B1 business against crime and court) applies at character level through 14.

### §3.17 Money classification for this module (03 registers codes)

| Code | Class | Flow |
|---|---|---|
| `BIZ_PURCHASE_NPC` | SINK | buying a catalog business |
| `BIZ_REVENUE_NPC` / `BIZ_REVENUE` | FAUCET / TRANSFER | sales to NPC / to players |
| `BIZ_INPUT_NPC` / `BIZ_INPUT` | SINK / TRANSFER | inputs from NPC / players |
| `BIZ_WAGES_NPC` | SINK | wages to hh |
| `BIZ_UPKEEP_NPC`, `BIZ_UPGRADE_NPC`, `BIZ_MARKETING_NPC`, `RD_SPEND_NPC`, `CERT_FEE` | SINK | |
| `BIZ_MARKETING`, `BIZ_SERVICE_FEE` | TRANSFER | to player agencies and services |
| `BIZ_FINE` | SINK | inspection fines |
| `BIZ_SALE_NPC` | FAUCET | NPC buyer pays 85% EV |
| `TENDER_PENALTY_NPC` / `TENDER_PENALTY` | SINK / TRANSFER | contract shortfalls |
| `CMP_FOUNDING_FEE`, `CONCESSION_FEE`, `FIN_SETUP_FEE` | SINK | |
| `IPO_UNDERWRITING_FEE`, `WAIVER_FEE`, IPO failure fee | TRANSFER | to the NPC underwriter / lender (E-44) |
| `CONCESSION_HANDOVER` | TRANSFER | winner → incumbent |
| `DIVIDEND` / `DIVIDEND_NPC` | TRANSFER / TRANSFER | to player / NPC holder sector (E-44; NPC money closed) |
| `TENDER_OFFER_PAY` / `TENDER_OFFER_PAY_NPC` | TRANSFER / TRANSFER | bidder → holders (E-44) |
| `IPO_PROCEEDS` / `IPO_PROCEEDS_NPC` | TRANSFER / TRANSFER | buyers → company (E-44) |
| `INTEREST`, `PRINCIPAL` (with `_NPC` variants) | TRANSFER / SINK, CREDIT_DESTROY for bank principal (07) | |
| `INTERNAL_TRANSFER` | TRANSFER (eliminated in consolidation) | intra-group |
| `TRIAL_LICENSE_NPC`, `HIT_REVENUE_NPC`, `COMMODITY_SALE_NPC` | FAUCET | specific revenue types (for dashboards) |

---

## §4 Player intents

Namespace `biz.*` (00 §5.5). Validated in P1; effects in P9 (operations), P8 (financing settlements) or P12 (votes) as noted. Humans, AI operators (11) and delegated managers/CEOs (15 Mandate) use the same intents.

### §4.1 Businesses and operations

| Kind | Payload | Validation | Effect |
|---|---|---|---|
| `biz.buy` | `{ typeId, cityId, districtId?, segment?, model?, promise?, ownerId, name }` | §3.1.5 | business SETTING_UP |
| `biz.rename` | `{ bizId, name }` | 21 moderation; once per 7 game days | sign updates (10) |
| `biz.setPrice` | `{ bizId | chainId, price | priceMultiplier }` | within [0.7, 1.3] × segment ref | next hour |
| `biz.setSegment` / `biz.setPromise` | `{ bizId, segment | promise }` | allowed for type; once per 28 game days | share resets toward 0 at θ in the new market; costs change |
| `biz.setMarketing` | `{ bizId | chainId, perDay }` | ≥ 0 | flow spend |
| `biz.campaign` | `{ targets, amount, agencyContractId? }` | cash | §3.5.6 |
| `biz.upgrade` | `{ bizId, axis, toLevel }` | ≤ 25; one build per axis at a time; cash; automation ≥ 10 needs 11 model | build starts |
| `biz.expand` | `{ bizId, cityId, districtId? }` | as `biz.buy` at 80% c0 | new chain member |
| `biz.setUpkeep` | `{ bizId, perDay }` | ≥ 0 | §3.5.3 |
| `biz.repair` | `{ bizId }` | cash | condition 100 |
| `biz.move` | `{ bizId, districtId }` | food truck only; once per game day | §3.4.6 |
| `biz.setReorder` | `{ bizId, daysOfCover, maxPrice? }` | goods archetypes | policy |
| `biz.buyInput` | `{ bizId, inputId, qty, maxPrice }` | goods archetypes | spot purchase (05 order for exchange-traded inputs) |
| `biz.allocateInternal` | `{ supplierBizId, toEntityId, capacityPct, transferPrice }` | same group; minority rule §3.7.4; Σ allocations ≤ 100% | allocation |
| `biz.hire` / `biz.fire` | `{ bizId, role, count, wageMult? }` | headcount ≥ 0 | §3.6.2 |
| `biz.setWages` | `{ bizId, wageMult }` | [0.8, 1.5] | next day close |
| `biz.settleStrike` | `{ bizId, wageMult }` | in STRIKE; raise ≥ inflation lag | ends strike |
| `biz.assignManager` | `{ bizId | cmpId, candidateId | modelId, mode }` | candidate available; model owned/licensed (11) | management mode |
| `biz.setMandate` | `{ cmpId, mandate }` (budgets, price bands, capex limits, hire limits, exception rules) | CEO or AI operator assigned | 15 Mandate stored |
| `biz.poachOffer` | `{ targetStaffId, wageMult }` | own business with a vacancy of that role | §3.6.3 acceptance roll |
| `biz.certify` | `{ bizId, certId }` | requirements | §3.9.7 |
| `biz.sell` | `{ bizId, toNpc: true }` | not under a lien without lender consent (07), not SEIZED | §3.12.7 |
| `biz.list` | `{ bizId, askPrice }` | | listed on the 15 business exchange |
| `biz.close` | `{ bizId }` | | business FAILED/closed; assets to floor value scrap (FAUCET 10% of floor) |

### §4.2 Contracts and tenders

| Kind | Payload | Validation | Effect |
|---|---|---|---|
| `biz.tender.bid` | `{ tenderId, leadBizId, pricePerUnit, volumeOffered, partners? }` | requirements §3.9.2; partners have signed a 15 consortium contract | sealed bid |
| `biz.tender.withdraw` | `{ tenderId }` | before deadline | bid removed |
| `biz.tender.post` | `{ category, volumePerDay, durationDays, priceCap, requirements, weights }` | a player company as buyer | players' own tenders, bid on by NPC field and players |
| `biz.supply.offer` / `biz.supply.accept` | 15 supply clause payload | | supply contract |
| `biz.service.list` | `{ bizId, service, pricePerUnit, capacity, slaTerms }` | service-type business | listed on 15 Services market |
| `biz.receivable.factor` | `{ receivableIds[] }` | open receivables | sold to 07 bank (§3.9.5) |

### §4.3 Company building and R&D

| Kind | Payload | Validation | Effect |
|---|---|---|---|
| `biz.corp.found` | `{ name, jurisdiction, homeCityId }` | rank ≥ R2 (matches 17's Company app unlock and B3, the first tier that needs a company; ruling in 24); fee; name moderation | `cmp` created |
| `biz.corp.transferBiz` | `{ bizId, toCmpId }` | owner controls both | internal transfer at EV |
| `biz.corp.createProductLine` | `{ cmpId, category, segment, name }` | product-based category | DEVELOPMENT line (needs NEW_PRODUCT R&D or a starter version at quality 0.95 × F for 5% of c0_line) |
| `biz.corp.startRd` | `{ cmpId, kind, productLineId?, budget, durationDays, researchers }` | RESEARCH staff; cash for daily spend | §3.5.5 |
| `biz.corp.cancelRd` | `{ projectId }` | running | spent budget lost |
| `biz.corp.launchProduct` | `{ productLineId, bizIds[] }` | businesses of matching category | line sold by those businesses; LAUNCH stage |
| `biz.corp.hireCeo` | `{ cmpId, candidateId }` | B3+ company | §3.6.3 |
| `biz.corp.setHq` | `{ cmpId, propId }` | owned or leased office property (10) | HQ building shown |

### §4.4 Corporate finance

| Kind | Payload | Validation | Effect |
|---|---|---|---|
| `biz.corp.borrow` | `{ cmpId, lenderId, amount, termDays, type }` | via 07 underwriting | loan + covenants |
| `biz.corp.issueBond` | `{ cmpId, amount, tenorDays, couponType, seniority, covenants }` | §3.12.2 | 1-day book on 06 |
| `biz.corp.repay` | `{ debtRef, amount }` | cash | principal reduced |
| `biz.corp.requestWaiver` | `{ covenantId }` | breached, in cure | §3.12.3 |
| `biz.corp.dividend` | `{ cmpId, perShare }` | §3.12.4 tests | ex-date next day |
| `biz.corp.buybackProgram` | `{ cmpId, maxShares, untilTick }` | listed: public | program |
| `biz.corp.issueShares` | `{ cmpId, toId?, shares, price?, mode: 'PRIVATE' | 'SECONDARY' | 'RIGHTS' }` | §3.12.4 | issuance |
| `biz.corp.split` | `{ cmpId, ratio }` | price > $1,000 | split |
| `biz.corp.guidance` | `{ cmpId, epsNextQ }` | listed | public guidance |
| `biz.corp.spinOff` | `{ parentCmpId, subsidiaryCmpId, mode }` | §3.15.4 | spin-off |
| `biz.ipo.file` | §3.10.2 | §3.10.1 | prospectus + book |
| `biz.ipo.bid` | `{ ipoId, shares, limitPrice }` | §3.10.2 investor rules | sealed bid |
| `biz.venture.invest` | `{ cmpId, roundId, amount, lead?: { preMoney } }` | LIC4; round open | §3.11.2 |
| `biz.venture.raise` | `{ cmpId, raise, stage }` | player startup | NPC VC term sheet (§3.11.3) |

### §4.5 Control, M&A, governance, distress

| Kind | Payload | Validation | Effect |
|---|---|---|---|
| `biz.ma.tender` | §3.13.3 | LIC4, escrow/commitment, price floor | offer OPEN (PUBLIC) |
| `biz.ma.raiseTender` / `biz.ma.extendTender` / `biz.ma.withdrawTender` | `{ offerId, … }` | bidder; withdraw only if a condition failed or a competing higher offer exists | |
| `biz.ma.tenderShares` / `biz.ma.withdrawShares` | `{ offerId, shares }` | holder | |
| `biz.ma.mergerProposal` | §3.13.4 | both boards | approvals chain |
| `biz.ma.approachPrivate` | `{ npcCmpId, offer }` | | §3.13.5 roll |
| `biz.ma.lbo` | `{ targetRef, price, equity, debtPackage }` | §3.14 | closes on financing + approvals |
| `biz.ma.adoptPill` / `biz.ma.redeemPill` | `{ cmpId, triggerPct?, discountPct? }` | board | §3.13.7 |
| `biz.ma.activistLetter` | §3.13.8 | ≥ 5% | PUBLIC letter |
| `biz.corp.callMeeting` | `{ cmpId, motions[] }` | ≥ 10% | meeting in 7 game days |
| `biz.corp.vote` | `{ meetingId, motionId, votes: 'FOR' | 'AGAINST' | 'ABSTAIN' }` | holder at the record tick | tallied P12 at meeting tick |
| `biz.corp.nominate` | `{ cmpId, personId }` | holder ≥ 20% or for own seats | candidate |
| `biz.restructure.exchangeOffer` | §3.16.2 | DISTRESSED | offer |
| `biz.restructure.file` | `{ cmpId }` | DISTRESSED, or creditors ≥ 25% after default | §3.16.3 |
| `biz.restructure.dip` | `{ cmpId, lenderId, amount, rate }` | court approval (13 auto if ≤ 15% reorg value) | DIP |
| `biz.restructure.plan` | `ReorgPlan` | debtor in exclusivity or class ≥ 20% after | plan filed |
| `biz.restructure.votePlan` | `{ planId, classId, accept }` | claim holder | tally |

---

## §5 Engine events

| Event | Visibility | Payload | Consumers |
|---|---|---|---|
| `biz.opened` / `biz.closed` / `biz.sold` | PUBLIC (name, type, city, district; owner handle only if the owner's profile shows holdings, 06-cities §6) | bizId, typeId | 10 storefronts, 16, 17 |
| `biz.hourly` | PRIVATE (owner) | units, revenue, costs, share, lostSales | 17, 03 |
| `biz.dayClosed` | PRIVATE (owner) + aggregate PUBLIC per market (total sales band, number of competitors) | DayAccumulator, profit | 03, 17, 20 |
| `biz.marketShares` | PUBLIC aggregate: HHI and share bands of the top 3 (by business name, not owner identity unless public) | marketId, hhi | 17 market view, 13 antitrust |
| `biz.event` | PRIVATE; PUBLIC if revenue ≥ $1M/day | event kind, effect, duration | 16, 17 |
| `biz.upgradeCompleted` | PRIVATE | axis, level | 17 |
| `biz.strike` | PUBLIC (city news) | bizId, days | 16 |
| `biz.antitrustFlag` | PUBLIC | marketId, group share | 13 |
| `biz.tender.posted` / `biz.tender.awarded` | PUBLIC | Tender / winners and prices | 17, 16 |
| `biz.contract.shortfall` | PARTIES | contract, units short, penalty | 03, 17 |
| `biz.rd.completed` | PRIVATE | project outcome | 17 |
| `biz.product.launched` | PUBLIC (companies with revenue ≥ $1M/day) | line name, category, segment | 16 news |
| `biz.corp.earnings` | PUBLIC | cmpId, EPS, consensus, surprise, revenue, guidance | 05 jump, 16, 17, 15 |
| `biz.corp.filing` | PUBLIC | material event | 15, 16, 13 |
| `biz.corp.covenantBreach` | PARTIES (lenders, company); PUBLIC for listed | covenant, value | 07, 08 ratings |
| `biz.corp.dividendDeclared` / `biz.corp.buyback` | PUBLIC for listed | amounts | 05, 06 |
| `biz.ipo.filed` / `biz.ipo.priced` / `biz.ipo.listed` / `biz.ipo.failed` | PUBLIC | prospectus, price, allocation stats | 05, 06, 16, 15 |
| `biz.ma.stakeFiled` | PUBLIC | holder (group), target, threshold crossed | 15, 16 |
| `biz.ma.tenderLaunched` / `biz.ma.tenderResult` | PUBLIC | terms, acceptance | 05, 16 |
| `biz.ma.insiderWindow` | SEALED | insiders, target, window | 13 |
| `biz.ma.pillTriggered` | PUBLIC | cmpId, acquirer | 05, 16 |
| `biz.ma.meetingResult` | PUBLIC | motions, results, seats | 16, 15 |
| `biz.restructure.distressed` / `biz.restructure.filed` / `biz.restructure.planConfirmed` / `biz.restructure.liquidated` | PUBLIC | case, classes, recoveries | 06 claims, 07, 08, 16 |
| `biz.relatedPartyBlocked` | SEALED + PRIVATE notice | transaction, appraisal gap | 13 surveillance |
| `biz.concession.auctioned` | PUBLIC | concession, winner, fee | 16, 15 |
| `biz.startup.spawned` / `biz.startup.round` / `biz.startup.exit` | PUBLIC | pitch / terms / outcome | 17, 16 |

---

## §6 NPC behaviour

1. **NPC field** per market (§3.3.6): passive aggregate competitor at reference price and quality-relative 1.0; enters on fat margins, exits on player dominance, floor 10%.
2. **Named NPC private firms** (16; `PARAM.npc_private_firms_per_city = 40`): each is in 1–3 markets, has capacity, quality, price, a founder with goals (independence, growth, family control; W04) and a balance sheet. Monthly decisions (game month): expand capacity if utilization > 90% and margin > normal (debt-financed within 07 limits); cut price 5% if share fell > 20% in a quarter; exit a market if losses 2 quarters running; bid for tenders in its categories at `priceCap × U(0.88, 1.0)`. They never know private player plans (C09); they react only to public market data (shares, prices, tenders).
3. **NPC customers** issue tenders (§3.9.1) from their actual needs: a named hospital's expansion (16 causal event) creates cold-storage and medical-courier tenders; plant openings create maintenance tenders; data-center builds create cooling tenders (W08, C10).
4. **NPC acquirers** (16 strategic buyers, PE funds of 08): buy NPC private firms and approach players with unsolicited offers for businesses with EV ≥ $10M at `EV × U(1.0, 1.15)` at most once per business per game quarter (`biz.ma.offerReceived`, PRIVATE); players may accept by contract.
5. **NPC lenders** (07) price business loans and covenants; accelerate per §3.12.3.
6. **NPC shareholders and the proxy advisor** vote per §3.13.8; tender per §3.13.3.
7. **NPC analysts** publish consensus per §3.15.1 for every listed company.
8. **NPC startups and VCs** per §3.11.
9. **NPC managers, CEOs and key staff** labour pools per city (16), with salaries and stars.
10. **Labour market** reacts to unemployment (04/16): tight markets slow hiring and raise wage pressure (morale lag).

---

## §7 Screens

17 owns layouts. Needed screens:

| Screen | Shows | Main actions |
|---|---|---|
| **Businesses — Catalog** | types available at the player's rank by sector, tier, C0 (indexed), archetype explainer, expected payback band at current crowding in a chosen city (computed from current market data), unique availability | buy, compare cities |
| **City market explorer** | per city/district: demand by category (bands), number of competitors, NPC field share, average price, HHI, unserved demand, tenders | open a market, buy here |
| **Business page** (Simple / Advanced) | Simple: today's profit, share, one recommended action, condition, staff warning. Advanced: hourly sales chart, share vs competitors (names of businesses), price vs ref with assistant optimum, capacity utilization, lost sales, inventory and reorder, input costs and hedges, staff and morale, upgrades and builds, events, insurance status, EV and sale value, data output | every §4.1 intent |
| **Company HQ** | consolidated P&L, balance sheet, cash flow (03), segment table, dependency map (§3.7.4), product lines and R&D pipeline, staff and key people, CEO/mandate and exceptions, debt and covenant headroom, cap table, ratings, filings, EV and V/share | company intents |
| **Product & R&D lab** | product lines with relative quality vs frontier, features, unit cost, lifecycle, project planner with fail odds and expected gain bands, campaign planner | R&D, launch, campaigns |
| **Tender Board** | open tenders filtered by city/category with requirements, cap, volume, terms, incumbent; eligibility checks for each of the player's businesses; won contracts with reliability and penalties; concentration warnings | bid, consortium, withdraw, post own tender |
| **Services market** | player and NPC service offers | sign service contract |
| **Corporate Finance desk** | debt stack, rating, covenant tests, financing options from 07/06 with quotes, dividend/buyback/issuance planners, IPO readiness checklist (§3.10.1 items ticked) | finance intents, file IPO |
| **IPO book / Offering page** | prospectus, range, book status (demand multiple band only while open), result | bid |
| **M&A desk** | stake tracker (own stakes vs thresholds), target screener (public data only), tender builder with financing, defence panel for own companies, activism and meeting tracker | M&A intents |
| **Restructuring room** | claims classes and claim prices (06), plan builder with recovery waterfall, votes | restructuring intents |
| **Startups** | NPC startup pitches with observed scores and uncertainty bands, rounds, portfolio | invest |
| **Concessions** | current concessions, holders, next auction, eligibility | bid |

Notifications (17/15 caps apply): strike, fire, inspection fine, covenant breach, tender awarded/lost, contract termination warning, takeover approach, pill trigger, earnings day, IDLE reached.

---

## §8 Edge cases

1. **Owner offline exactly at cap**: cap is measured in ticks; the business turns IDLE at the first hour boundary after the cap tick.
2. **Two businesses of one owner in the same market**: allowed; they compete with each other in the logit (cannibalization is real); the cluster bonus applies.
3. **Market with zero participants**: NPC field takes 100%; demand still computed (used for explorer and entry estimates).
4. **Price at a boundary** (exactly 0.7 or 1.3 × ref): allowed; requests outside are clamped with a notice.
5. **Business sold while a build is running**: the build transfers with the business; cost already paid stays sunk for the seller (EV unaffected until profit shows).
6. **Supplier goes bankrupt mid-contract**: contract terminates; buyer falls back to spot; penalty becomes an unsecured claim in §3.16.
7. **Tender issuer (NPC) defaults** on receivables: §3.9.5 recovery; trade-credit insurance pays per 08.
8. **City closure by catastrophe in a tender's city**: deliveries are excused (force majeure) for the closure days; no penalty; reliability28 excludes those days.
9. **Business in a district demolished/redeveloped (10)**: business is relocated to the nearest free slot in the city at no cost; share ramps again at θ.
10. **A chain spans blocs**: each member uses its bloc's price level, wages and currency; brand is shared; the company consolidates in its reporting currency at 05 FX close marks.
11. **Upgrade build interrupted by IDLE**: builds continue while IDLE (contractors keep working).
12. **Strike during a tender contract**: shortfall penalties apply (strikes are not force majeure).
13. **Company with negative EV contribution** (loss-making businesses): EV_biz uses the floor; EV_company can be below debt (negative equity) → §3.16 triggers.
14. **Tender offer for a company under Protected Reorganization**: not allowed; buy claims instead.
15. **Founder Held (13)** during lockup expiry or a pending tender: Held blocks new intents; open offers and pre-announced sales still execute.
16. **Squeeze-out of a holder who is offline**: shares are converted to cash in their account at the tender price.
17. **Poison pill and an acquirer at exactly 20%**: trigger is "> 20%" acquired after adoption without approval; holdings acquired before adoption are grandfathered.
18. **IPO with zero player bids**: NPC demand alone may clear it; allocation per buyer cap still applies to named NPC funds (cap 5% each), the rest goes to the aggregate NPC pool.
19. **Dividend declared then a covenant breach before ex-date**: the dividend is cancelled automatically.
20. **Merger of two companies both controlled by the same player with minority holders**: requires an independent valuation (NPC appraiser) and the majority-of-minority vote of the target (DEFAULT) because it is a related-party transaction.
21. **Startup whose fate is failure receives a large player investment**: fate is not changed by money (hidden fate fixed at creation); bigger rounds only extend runway (failure time unchanged).
22. **Player founder leaves a startup (sells all shares)**: no effect on hidden mechanics for player startups (their outcome is operational, not fated).
23. **Concession winner fails to pay**: bid voided, the next highest bid wins, the defaulting bidder is barred for 1 chapter and pays a 5% penalty of its bid (SINK).
24. **Absorbed NPC listed company with debt in default**: §3.16 applies to it as a subsidiary; the parent is not liable beyond its equity (limited liability) unless it guaranteed.
25. **Business whose type is retired from 22 by a patch**: existing instances keep working with frozen data; no new purchases.

---

## §9 Exploits and counters

| # | Exploit | Counter |
|---|---|---|
| 1 | **Buy, upgrade, sell to NPC loop** | 85% NPC haircut; EV is profit-based with a 7-day trailing window; upgrade costs not added to EV (§3.5.2); 09-AT-15 |
| 2 | **Alt funnelling through business sales at off-market prices** | 15 P2P tax and age caps; price > 10% off EV flagged; collusion graph (19) |
| 3 | **Collusive price-fixing by players owning a market** | category price response η, NPC field at ref price, NPC entry on fat margins, antitrust at 60% |
| 4 | **Monopoly by buying every business in a market** | antitrust (§3.3.7, §3.13.6); NPC field floor; demand is finite so returns shrink |
| 5 | **Idle income while offline** | offline cap; IDLE state; listed-company autopilot at 0.9 efficiency only after 24 game days |
| 6 | **Fake tender wins via a linked buyer** (player posts tender, own business wins at inflated price) | player tenders are player money (TRANSFER): no faucet; related-party rule applies across groups with minority holders; collusion flags |
| 7 | **Transfer-pricing profit to a fully owned entity to dodge taxes** | 03 taxes consolidated group profit; arm's-length enforced across minority boundaries; 13 tax audits |
| 8 | **Pump own listed stock to raise rank** | rank marks use min(V, 3-day VWAP); V is SOTP of ledger profit, not price |
| 9 | **Inflate earnings by internal sales** | consolidation eliminates intra-group revenue; only external sales count |
| 10 | **IPO a shell with one-off profits** | 3 quarters of statements; EV uses trailing 7-day profit and growthAdj bounded; NPC book bids around V; lockup |
| 11 | **Insider trading ahead of own earnings or bids** | blackouts, pre-announced founder sales, insider windows (SEALED events) → 13 |
| 12 | **Creeping control without paying a premium** | 25%/49% open-market caps, tender required, same price to all |
| 13 | **Pill abuse to entrench forever** | pill expires after 364 game days unless shareholders renew; activists can call meetings |
| 14 | **LBO the company, pay a dividend recap, let it fail** | covenants on dividends, lenders' tests, fraudulent-conveyance review in 13: dividends paid within 91 game days before a filing while insolvent are clawed back (DEFAULT) |
| 15 | **Strategic default to wipe debt and keep the business** | absolute priority: equity is wiped first; the business goes to creditors |
| 16 | **Startup fate prediction by data mining the seed** | fate draws use a server-secret stream (02); observed scores are noisy; σ reduction is bounded |
| 17 | **Using R&D results to trade the market before launch** | R&D outcomes private; trading own listed stock on them is insider dealing (13) |
| 18 | **Certification without meeting requirements** | requirements checked at grant and by audits; revocation |
| 19 | **Self-dealing via internal allocation at COST to a minority-held entity** | blocked by validation, +30 surveillance on attempt |
| 20 | **Concession farming by alt bidders** | rank/record eligibility; collusion graph on consortia; incumbent credit only to the actual incumbent |
| 21 | **Flooding a district with cheap B1 businesses to block slots** | slots grow with demand (10 frontier); IDLE/failed businesses' slots free after 14 game days IDLE (DEFAULT) |

---

## §10 Acceptance tests

1. **09-AT-01** Calibration: in a fresh world, a reference business of each archetype with demand pools (all B1 types) in the reference city, under reference crowding (12 player businesses + NPC field at 50%), earns `c0 / payback ± 10%` per open game day over 60 seeds.
2. **09-AT-02** Wealth curve: a scripted engaged player (2 h online + offline cap per real day) following a greedy business strategy reaches the 01 §8.4 median curve (day 1 ≈ $15k, day 7 ≈ $500k) within ±50% (roadmap M15 gate), and reaches R1 ($20k) within 2 real days in ≥ 80% of seeds.
3. **09-AT-03** Logit shares sum to 1 per market after every recompute (property test); NPC field share ≥ the floor implied by `npc_field_floor`.
4. **09-AT-04** Smoothing: after a business doubles its marketing, its share approaches the new target with half-life within ±10% of `ln 2 / θ` game hours.
5. **09-AT-05** Capacity reallocation: overflow from capacity-limited firms is sold by unconstrained firms; units sold never exceed demand; one pass only.
6. **09-AT-06** Prices outside [0.7, 1.3] × ref are clamped; the pricing assistant's optimum is within 1% of a brute-force grid search.
7. **09-AT-07** Category price response: if every participant raises price 30%, total units fall by `1 − 1.3^(−η)` within 1%.
8. **09-AT-08** NPC entry: a market with player margins 2× normal for 28 game days increases NPC field weight; one with player share > 0.6 decreases it; never below 10% of initial.
9. **09-AT-09** Antitrust: a group holding > 60% of a market for 7 game days triggers exactly one 13 case.
10. **09-AT-10** Offline cap: an owner-operated business with no manager goes IDLE after 8 game days without a session; with a manager after 16 (+ automation); a listed company never goes IDLE.
11. **09-AT-11** IDLE businesses earn zero revenue, pay no wages, keep rent; condition unchanged.
12. **09-AT-12** Hourly stagger: each business runs exactly once per game hour at `hash(id) mod 30` (00 §5.1); replay identical.
13. **09-AT-13** Upgrade costs follow `c0 × k × g^n` exactly; level 26 is rejected.
14. **09-AT-14** Condition: with zero upkeep a business loses 1.0 condition per game day; with required upkeep it holds.
15. **09-AT-15** Buy-upgrade-sell loop: across 200 seeds, a bot that buys a business, buys k upgrades, waits for EV to update and sells to NPC never ends with more money than a bot that holds the same business for the same time, for k in 0..10.
16. **09-AT-16** EV of a reference business at reference conditions equals c0 within ±10%.
17. **09-AT-17** NPC sale pays exactly 85% of EV and posts `BIZ_SALE_NPC` (FAUCET).
18. **09-AT-18** Consolidation: an intra-group sale of $1M between two 100% owned businesses changes group revenue and profit by 0 (03 consolidation) and posts `INTERNAL_TRANSFER`.
19. **09-AT-19** Internal allocation at COST to an entity with minority holders is rejected and adds +30 surveillance.
20. **09-AT-20** Tender eligibility: a bid failing any requirement in §3.9.2 is rejected with the requirement code; requirements are visible before bidding (event audit).
21. **09-AT-21** Tender award picks the highest score; split awards fill remaining volume; NPC field fills unawarded volume.
22. **09-AT-22** Shortfall penalties are charged per short unit; force-majeure closure days are excused.
23. **09-AT-23** Switching cost: a non-incumbent winner delivers at most 50% of volume during qualification days.
24. **09-AT-24** R&D: over 10,000 simulated projects, the failure rate matches `p_fail` within 1 percentage point; gains follow the formula's distribution.
25. **09-AT-25** Frontier drift: a product line with no R&D for 4 game quarters in a category with 6% drift has `productQualityRel ≈ 1.06^−4` and loses share accordingly.
26. **09-AT-26** IPO eligibility: each §3.10.1 condition, when violated, blocks `biz.ipo.file`.
27. **09-AT-27** IPO clearing: uniform price equals the highest price at which demand ≥ offering within the range; no buyer exceeds 5% of float; linked and young accounts get zero.
28. **09-AT-28** Lockup and post-lockup sale caps are enforced; pre-announcement filing appears 1 game day before each founder sale.
29. **09-AT-29** Blackout: insider orders in the blackout window are rejected.
30. **09-AT-30** Rank marks of a player holding his own listed stock use min(V, 3-day VWAP) (pump test: buying the stock up 50% does not raise the holder's rank-basis NW above V).
31. **09-AT-31** Pump-and-dump harness bot (buy, promote via own outlet, sell) loses money in expectation once fines are included (roadmap §2.1 rule 8), across 200 seeds.
32. **09-AT-32** Fundamental value V of a listed player company equals the SOTP formula to the micro-unit at each day close.
33. **09-AT-33** Covenant breach → cure period → default if uncured; acceleration rule as specified.
34. **09-AT-34** Dividends are blocked when the post-dividend cash test fails.
35. **09-AT-35** Open-market purchase beyond 25% (NPC) / 49% (player company) is rejected; the same bidder can exceed it only by tender.
36. **09-AT-36** Tender: all tendering holders receive the same (final, raised) price; ≥ 90% triggers squeeze-out; take-private needs ≥ 1.2 × 30-day VWAP.
37. **09-AT-37** Poison pill: an acquirer crossing 20% post-adoption is diluted by the rights exercise exactly per the discount formula; the pill expires after 364 game days without renewal.
38. **09-AT-38** Proxy: NPC holders vote with the advisor 80% of the time over 1,000 motions (±3%); cumulative voting seats equal `floor(f × (seats+1))`.
39. **09-AT-39** LBO sizing never exceeds `min(0.65 × EV, 6 × EBITDA)`; cash sweep applies 50% of excess cash flow to senior debt quarterly.
40. **09-AT-40** Restructuring: a confirmed plan never gives value to a junior class while a dissenting senior class is impaired (absolute priority), and every class gets ≥ its liquidation-value recovery.
41. **09-AT-41** Plan voting thresholds (2/3 amount, > 1/2 count) are applied per class exactly.
42. **09-AT-42** Conversion to liquidation happens at 91 game days without confirmation.
43. **09-AT-43** Startup power law: over 100,000 NPC startups, outcome buckets match 65/25/9/1% within 0.5 points; money invested does not change fate.
44. **09-AT-44** Concessions: re-auction occurs at every chapter boundary; the incumbent's bid is credited ×1.10; an outbid incumbent receives book value.
45. **09-AT-45** Exchange concession revenue never exceeds its daily cap.
46. **09-AT-46** Financial catalog items: buying an Insurance company posts 10% SINK and creates an 08 insurer with 90% of c0 as capital.
47. **09-AT-47** Money conservation: across 60 seeds × 1 chapter of mixed business, M&A, IPO and restructuring activity, every tick's P13 invariant holds and every posting carries a code from §3.17.
48. **09-AT-48** Privacy: no PUBLIC event from this module contains a player's business-level profit, R&D result, holdings below filing thresholds, or strategy (event-stream audit, L11).
49. **09-AT-49** Determinism: identical seed and intents produce byte-identical business books, tenders, R&D outcomes and M&A results on replay.
