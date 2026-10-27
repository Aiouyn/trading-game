# 08 — Funds, Structured Credit, Rating Agencies and Insurance

Owner module: 08. Phase: P8 `finance` (fund NAV, ETF primary market, SPV waterfalls, insurance accounting), with NPC actions in P4 and catastrophe rolls in P3.
Scope (00 §1): player and NPC funds, ETFs (creation/redemption), securitization and tranches, rating agencies, insurance and reinsurance, catastrophe bonds.
Depends on: 02 (clock, RNG streams, math library), 03 (ledger, reason codes, statements, consolidation, taxes), 04 (macro state, sovereign PD, T-bill yields), 05 (orders, marks, auctions), 06 (instrument registry, CDS), 07 (loans, CCP custody, prime brokerage, margin), 10 (properties, mortgages), 12 (cyber events), 13 (charters, regulators, courts), 14 (ranks, licenses, Reputation), 15 (contracts, filings, Mandate), 16 (NPC actors, world events, news), 22 (names).

All money is `Money` (bigint micro-units) per 00 §3.1. Rates are per game year unless stated. "Game day" = 720 ticks = 1 real hour. "Real day" = 24 game days. Old-vision numbers given in real hours are converted 1 real hour = 1 game day (L9).

---

## §1 Purpose

This module is the buy-side and risk-transfer half of the institutional layer (V3 Part 3.5, 3.6, 3.8):

1. **Funds** let capital be pooled and managed under a mandate: players run hedge funds, long-only funds, funds of funds, credit funds, venture and private-equity funds, money-market funds, ETFs and (at Dynasty rank) sovereign wealth funds. Investors (players and NPC allocators) buy units at NAV. Track record, trust and betrayal are public (MASTER-BIBLE VI #2). Theft is impossible by construction; market abuse through a fund is possible and prosecutable (roadmap Q6, resolved §3.1.12).
2. **ETFs** are funds with listed units and a primary market. Authorized participants (APs) create and redeem baskets to keep price near NAV. ETF flows move the underlying; in a crisis, basket illiquidity opens real discounts.
3. **Securitization** turns pools of loans, mortgages, receivables and leases into tranches (senior, mezzanine, equity) sold to investors. Default correlation, underwriting standards and rating methodology together can produce a 2008-style event from rules, never from a script.
4. **Rating agencies** grade sovereigns, corporates, banks, insurers, funds and tranches. Grades move spreads and trip collateral, mandate and capital rules, so cliff effects create gameplay.
5. **Insurance and reinsurance** price and absorb operational, property, cyber, liability and catastrophe risk. Losses from storms, cyber pandemics and unrest propagate from policyholders to insurers, reinsurers and cat-bond holders.

Design rules: every flow is a ledger posting with a reason code (03); every price comes from a model a player can learn or from an auction; no actor gets private information (L11); every institution can fail by rule and leaves a public record.

---

## §2 Entities

### §2.1 Shared types used in this module

```ts
type FundId = `fnd_${string}`; type SpvId = `spv_${string}`; type InsId = `ins_${string}`; type RatId = `rat_${string}`;
type EntityId = string;                // any 00 §5.3 entity id
type Bps = number;                     // basis points (float in math, persisted as int ×100 per 00 §3.1)
type Ccy = 'FDL' | 'EUN' | 'NKR' | 'PYN' | 'SRL';

type RatingGrade =
  'AAA'|'AA+'|'AA'|'AA-'|'A+'|'A'|'A-'|'BBB+'|'BBB'|'BBB-'|
  'BB+'|'BB'|'BB-'|'B+'|'B'|'B-'|'CCC'|'CC'|'C'|'D';      // 20 grades; index 0 = AAA … 19 = D
type Outlook = 'POSITIVE' | 'STABLE' | 'NEGATIVE' | 'DEVELOPING';

interface Mandate {                    // generic shape assumed from 15 (delegation contract); 08 adds FundMandate fields
  mandateId: string; principalId: EntityId; operatorId: EntityId;
  allowedAssetClasses: AssetClass[];   // 06 enum
  maxLeverage: number;                 // gross exposure / NAV
  maxPositionPctNav: number;           // per instrument
  maxDrawdownPct: number;              // breaker
  noticeTicksForChange: number;
}
```

### §2.2 Funds

```ts
type FundKind = 'HEDGE' | 'LONG_ONLY' | 'FUND_OF_FUNDS' | 'CREDIT' | 'VENTURE' | 'PRIVATE_EQUITY'
              | 'ETF' | 'MONEY_MARKET' | 'SOVEREIGN_WEALTH';
type FundStructure = 'OPEN_ENDED' | 'CLOSED_ENDED' | 'LISTED_CLOSED_END' | 'ETF';
type StrategyClass = 'MACRO' | 'RELATIVE_VALUE' | 'EVENT_DRIVEN' | 'QUANT' | 'CREDIT' | 'LONG_SHORT_EQUITY'
                   | 'LONG_ONLY_EQUITY' | 'MULTI_ASSET' | 'CRYPTO' | 'VENTURE' | 'BUYOUT' | 'CASH' | 'INDEX';
type FundStatus = 'FUNDRAISING' | 'ACTIVE' | 'FROZEN' | 'GATED' | 'SUSPENDED' | 'WINDING_DOWN' | 'CLOSED';
type Transparency = 'NAV_ONLY' | 'EXPOSURES' | 'TOP_POSITIONS_DELAYED' | 'FULL_DELAYED';

interface Fund {
  id: FundId; name: string; ticker?: string;          // ticker only for ETF / listed closed-end
  kind: FundKind; structure: FundStructure; strategy: StrategyClass;
  sponsorId: EntityId;                // legal sponsor: chr, cmp, npc, gov (SWF)
  managerId: EntityId;                // operator who trades (chr, npc, or an AI model operating under the mandate, 11)
  baseCcy: Ccy; homeBloc: string;
  createdTick: Tick; launchTick?: Tick; status: FundStatus; statusSinceTick: Tick;
  mandate: FundMandate;
  fees: FeeSchedule;
  custodyAccount: string;             // account at the CCP custodian (07); fund assets live only here
  primeBrokerId?: EntityId;           // 07 prime broker providing leverage
  unitsOutstanding: bigint;           // units ×1e6 (fixed point)
  navPerUnit: Price;                  // last struck NAV per unit
  navTick: Tick;
  shadowNavPerUnit?: Price;           // money-market funds: market-value NAV vs stable $1
  hwmSeries: boolean;                 // true: per-investor HWM via series (§3.1.5)
  managerStakeUnits: bigint;          // first-loss stake held by manager (§3.1.10)
  gate: GateConfig;
  lockupTicks: number;                // per subscription
  noticeTicks: number;                // redemption notice
  sidePocketIds: string[];
  transparency: Transparency;
  trackRecord: TrackRecordStats;      // derived, cached at day close
  ratingIds: string[];                // fund ratings (MMF and credit funds may be rated)
  closedEnd?: ClosedEndTerms;         // VENTURE, PRIVATE_EQUITY
  etf?: EtfSpec;                      // ETF only
  flags: { breakerUntilTick?: Tick; absentManagerSinceTick?: Tick; banEndsTick?: Tick; regulatorHold?: boolean };
}

interface FundMandate extends Mandate {
  allowedRegions: string[];           // bloc codes
  maxGrossLeverage: number;           // ≤ PARAM.fund_max_leverage_player (1.5) for player funds
  maxNetExposurePct: number;          // |long − short| / NAV
  maxPositionPctNav: number;          // ≤ PARAM.fund_max_position_pct (0.20)
  maxIlliquidPctNav: number;          // Level-3 assets (§3.1.3) ≤ PARAM.fund_max_level3_pct (0.10) open-ended
  minLiquidityDays: number;           // ≥ 1: fraction of NAV liquidatable within N game days at ≤ 20% ADV
  benchmarkId?: string;               // index for reporting
  derivativesAllowed: boolean;        // needs manager LIC3
  shortAllowed: boolean;
  esgLikeExclusions: string[];        // fictional sector exclusions, optional
}

interface FeeSchedule {
  mgmtFeeRate: number;                // per game year on NAV, ≤ PARAM.fund_mgmt_fee_cap (0.02)
  perfFeeRate: number;                // ≤ PARAM.fund_perf_fee_cap (0.20)
  hurdleRate: number;                 // per game year; 0 = none
  hurdleType: 'NONE' | 'SOFT' | 'HARD';
  crystallization: 'QUARTERLY' | 'ANNUAL';   // default QUARTERLY (game quarter end)
  subscriptionFeeRate: number;        // paid INTO the fund (anti-dilution), ≤ 0.01
  earlyExitFeeRate: number;           // paid INTO the fund; default PARAM.fund_early_exit_fee (0.01)
  custodyFeeRate: number;             // fixed PARAM.fund_custody_fee (0.0025) to CCP, a SINK
}

interface GateConfig {
  enabled: boolean;
  maxRedeemPctNavPerDay: number;      // default PARAM.fund_gate_pct_per_day (0.20)
  suspendAllowed: boolean;            // only via §3.1.9 conditions
}

interface ClosedEndTerms {
  commitmentsTotal: Money; calledTotal: Money; distributedTotal: Money;
  investmentPeriodEndTick: Tick;      // default 1 game year after first close
  termEndTick: Tick;                  // default 4 game years after first close
  extensionsUsed: number;             // max 2 × 0.5 game year, LP vote
  waterfall: 'EUROPEAN' | 'AMERICAN'; // default EUROPEAN
  gpCommitPct: number;                // ≥ PARAM.fund_manager_stake_min_pct (0.10) for player funds
  defaultingLpPenaltyPct: number;     // forfeits PARAM.fund_lp_default_forfeit (0.5) of paid-in
}

interface FundPosition {               // an investor's holding (one row per investor per series)
  fundId: FundId; investorId: EntityId; seriesId: string;
  units: bigint; costBasis: Money;
  hwmNavPerUnit: Price;               // series HWM
  subscribedTick: Tick; lockupUntilTick: Tick;
  commitment?: Money; paidIn?: Money; // closed-end
  isManagerStake: boolean;
}

interface FundRequest {
  reqId: string; fundId: FundId; investorId: EntityId;
  kind: 'SUBSCRIBE' | 'REDEEM' | 'CAPITAL_CALL' | 'DISTRIBUTION';
  amount?: Money; units?: bigint;      // subscribe by cash, redeem by units or cash
  submittedTick: Tick; dealingTick: Tick;  // the NAV strike it will use
  status: 'PENDING' | 'PARTIAL' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  filledUnits: bigint; filledCash: Money; carriedForward: Money;  // gated remainder
}

interface NavRecord {
  fundId: FundId; tick: Tick;
  grossAssets: Money; liabilities: Money; accruedMgmt: Money; accruedPerf: Money;
  nav: Money; navPerUnit: Price; unitsOutstanding: bigint;
  level1Pct: number; level2Pct: number; level3Pct: number;
  grossLeverage: number; netExposure: number; liquidity1d: number; liquidity5d: number;
}

interface SidePocket { id: string; fundId: FundId; assetIds: string[]; createdTick: Tick; units: Map<EntityId, bigint>; valuation: Money; }

interface TrackRecordStats {
  inceptionTick: Tick; daysOfHistory: number;
  returnSinceInception: number; annualizedReturn: number; annualizedVol: number;
  sharpe: number; maxDrawdown: number; currentDrawdown: number;
  aumAvg90d: Money; quartersReported: number;
  benchmarkExcess: number; styleDriftScore: number;   // §3.1.13
  publicIncidents: string[];                            // event ids of breaches, freezes, convictions
}
```

### §2.3 ETFs and indices

```ts
type IndexMethod = 'CAP_WEIGHT' | 'FLOAT_CAP_WEIGHT' | 'EQUAL_WEIGHT' | 'PRICE_WEIGHT' | 'FACTOR_TILT' | 'DURATION_BUCKET' | 'FIXED_WEIGHTS';

interface IndexDef {                   // 06 owns the listed index instruments; 08 owns methodology + rebalancing for ETF indices
  indexId: string; name: string; method: IndexMethod;
  universeRule: { assetClass: AssetClass; regions: string[]; sectors?: string[]; minFloatCap?: Money; minAdv?: Money; ratingFloor?: RatingGrade };
  constituentCount: number | 'ALL';
  capPerConstituent: number;          // e.g. 0.10
  rebalanceEvery: 'QUARTER' | 'MONTH';
  announceLeadDays: number;           // default PARAM.index_announce_lead_days (5)
  divisor: number; level: number;
  constituents: { assetId: string; weight: number; shares?: bigint }[];
  sponsorId: EntityId;                // NPC index provider or player sponsor
  public: true;                       // methodology always public (§3.2.6)
}

interface EtfSpec {
  listedAssetId: string;              // the ETF's tradeable instrument in 06
  indexId?: string;                   // passive ETF tracks an index; active ETF has none
  active: boolean;
  leverage: -3 | -2 | -1 | 1 | 2 | 3; // daily-reset leveraged/inverse ETFs (LIC3 to trade)
  creationUnit: bigint;               // default PARAM.etf_creation_unit (50,000 units)
  basket: { assetId: string; qty: bigint }[];  // per creation unit, published each day
  cashComponent: Money;
  inKind: boolean;                    // false: cash creation (used for bond / illiquid ETFs)
  creationFeeFixed: Money; redemptionFeeFixed: Money;    // default $500 each per CU, paid to fund
  cashCreationSpreadBps: number;      // charged on cash creations to cover execution
  apIds: EntityId[];                  // registered APs
  inav: Price; inavTick: Tick;        // indicative NAV, every tick
  premiumBps: number;                 // (mid − iNAV) / iNAV
  trackingDifference90d: number;
}

interface ApRegistration { apId: EntityId; etfId: FundId; sinceTick: Tick; dailyCuLimit: number; npc: boolean; }
interface CreationOrder { id: string; etfId: FundId; apId: EntityId; side: 'CREATE' | 'REDEEM'; cus: number; submittedTick: Tick; settleTick: Tick; status: 'PENDING'|'SETTLED'|'FAILED'; }
```

### §2.4 Securitization

```ts
type PoolAssetKind = 'MORTGAGE_RES' | 'MORTGAGE_CRE' | 'CORPORATE_LOAN' | 'SME_LOAN' | 'CONSUMER_LOAN'
                   | 'AUTO_LOAN' | 'CARD_RECEIVABLE' | 'TRADE_RECEIVABLE' | 'EQUIPMENT_LEASE' | 'ABS_TRANCHE';
type DealType = 'RMBS' | 'CMBS' | 'CLO' | 'ABS' | 'CDO_OF_ABS';

interface PoolAsset {
  ref: string;                         // 07 loan id, 07 cohort id, 10 mortgage id, 09 receivable id, or tranche id
  kind: PoolAssetKind;
  isCohort: boolean;                   // a homogeneous NPC cohort (07) stands for N loans
  count: number;                       // 1 for single loans
  balance: Money; rate: number; remainingTermDays: number;
  pdAnnualAtCut: number; lgdAtCut: number; ltvAtCut?: number;
  originatorId: EntityId; originationStandards: number;  // 07 standards index 0..1 at origination (1 = strict)
  region: string; sector?: string; obligorId?: EntityId;
}

interface Spv {
  id: SpvId; name: string; dealType: DealType; ccy: Ccy;
  sponsorId: EntityId; originatorIds: EntityId[]; servicerId: EntityId; trusteeId: EntityId;  // trustee = NPC
  pool: PoolAsset[]; poolBalance: Money; poolCutTick: Tick;
  tranches: Tranche[];
  reserveAccount: Money; reserveTarget: Money;           // default 1% of original pool
  waterfall: WaterfallSpec;
  status: 'STRUCTURING' | 'RATING' | 'MARKETING' | 'CLOSED_ACTIVE' | 'TRIGGERED' | 'AMORTIZING' | 'CALLED' | 'DEFAULTED' | 'MATURED';
  closingTick?: Tick; legalFinalTick?: Tick; nextPaymentTick?: Tick;
  riskRetention: { form: 'VERTICAL' | 'HORIZONTAL'; pct: number };  // ≥ PARAM.sec_risk_retention (0.05)
  cumulativeDefaults: Money; cumulativeLosses: Money; cumulativeRecoveries: Money;
  reports: DealReport[];
}

interface Tranche {
  id: string; spvId: SpvId; cls: string;               // 'A1','A2','B','C','D','E','EQ'
  assetId?: string;                                     // listed in 06 once closed
  seniority: number;                                    // 0 = most senior
  attach: number; detach: number;                       // as fraction of original pool
  originalPrincipal: Money; principal: Money;
  coupon: { type: 'FIXED' | 'FLOAT'; fixedRate?: number; spreadBps?: number; refRate?: 'POLICY_FDL' | 'BILL_3M' };
  interestShortfall: Money; writedownCum: Money;
  ratings: { agencyId: RatId; grade: RatingGrade; outlook: Outlook; tick: Tick }[];
  ocTrigger?: number; icTrigger?: number;               // tests at this class
  isEquity: boolean;
}

interface WaterfallSpec {
  paymentEveryDays: number;            // default PARAM.sec_payment_every_days (7) game days
  principalMode: 'SEQUENTIAL' | 'PRO_RATA_UNTIL_TRIGGER';
  seniorFeesBps: { trustee: number; servicer: number; manager: number };   // per game year on pool balance
  turboOnTrigger: boolean;             // all excess interest pays down most senior when any test fails
  cleanUpCallPct: number;              // sponsor may call when pool ≤ this (default 0.10)
}

interface DealReport { tick: Tick; poolBalance: Money; delinquent30: Money; defaultsPeriod: Money; lossesPeriod: Money; cdr: number; cpr: number; ocByClass: Record<string, number>; icByClass: Record<string, number>; }
```

### §2.5 Rating agencies

```ts
type RatedKind = 'SOVEREIGN' | 'CORPORATE' | 'BANK' | 'INSURER_FSR' | 'TRANCHE' | 'FUND_MMF' | 'FUND_CREDIT' | 'BOND_ISSUE' | 'CAT_BOND';

interface RatingAgency {
  id: RatId; name: string; npcId: string;              // always NPC-controlled (§3.4.1)
  style: 'CONSERVATIVE' | 'MODERATE' | 'ISSUER_FRIENDLY';
  method: {
    pdMultiplier: number;              // scales the base PD estimate (1.0 neutral)
    rhoAssumptionBase: number;         // assumed asset correlation for pools
    lookbackDays: number;              // history window for estimating PD and correlation
    stressWeight: number;              // 0..1 blend toward a stressed scenario
    outlookThresholdNotches: number;
  };
  leniency: number;                    // 0..0.5 current, §3.4.4
  reputation: number;                  // 0..100 public
  structuredRevenueShare: number;      // trailing 1 game year, drives conflict index
  analystCapacityPerDay: number;       // ratings it can process per game day
  accuracyStats: { cohortDefaultsVsExpected: number; downgrades3NotchPlus: number };
}

interface Rating {
  id: string; agencyId: RatId; subjectId: string; kind: RatedKind;
  grade: RatingGrade; outlook: Outlook; watch: 'NONE' | 'UPGRADE' | 'DOWNGRADE';
  pdImplied: number;                   // annual PD the grade maps to (§3.4.2)
  score: number;                       // raw methodology score before grade mapping
  assignedTick: Tick; reviewDueTick: Tick;
  solicited: boolean; published: boolean; feePaid: Money;
  history: { tick: Tick; grade: RatingGrade; reason: string }[];
}
```

### §2.6 Insurance and reinsurance

```ts
type Line =
  'PROPERTY' | 'BUSINESS_INTERRUPTION' | 'CYBER' | 'RANSOMWARE_BI' | 'COLLECTIBLES' | 'MODEL_IP'
  | 'LEGAL_EXPENSE' | 'PRODUCT_LIABILITY' | 'DIRECTORS_OFFICERS' | 'TRADE_CREDIT' | 'KEY_PERSON'
  | 'MARINE_CARGO' | 'ENERGY_ASSET' | 'CONSTRUCTION_ALL_RISK' | 'PROFESSIONAL_INDEMNITY'
  | 'HH_PROPERTY' | 'HH_MOTOR' | 'HH_LIFE';            // HH_* written only to hh sectors, in aggregate

type Peril = 'STORM' | 'FLOOD' | 'QUAKE' | 'WILDFIRE' | 'FIRE' | 'CYBER_PANDEMIC' | 'UNREST' | 'CONTAGION' | 'THEFT' | 'BREACH' | 'LIABILITY' | 'CREDIT';

interface Insurer {
  id: InsId; name: string; ownerId: EntityId;           // cmp (player) or npc
  isNpc: boolean; isReinsurer: boolean; homeBloc: string;
  charterId?: string;                  // 13 CH_INSURER
  lines: LineAppetite[];
  capital: Money;                      // equity (derived from 03 balance sheet, cached)
  unearnedPremiumReserve: Money; caseReserves: Money; ibnr: Money;
  investedAssetsPolicy: { bills: number; govBonds: number; corpBonds: number; equities: number; cash: number };  // weights sum 1
  solvency: { scr: Money; ratio: number; minCapitalFloor: Money; lastCalcTick: Tick };
  pml200: Money;                       // net 1-in-200 annual cat loss (§3.5.6)
  treaties: string[];                  // ReinsuranceTreaty ids where cedent
  status: 'ACTIVE' | 'RESTRICTED' | 'RUNOFF' | 'INSOLVENT' | 'RESOLVED';
  modelQuality: number;                // 0..1, from data + AI (11); reduces pricing error
  claimsStats: { lossRatio1y: number; combinedRatio1y: number };
}

interface LineAppetite {
  line: Line; open: boolean; maxLimitPerPolicy: Money; maxAggregateLimit: Money;
  load: number;                        // pricing multiplier on expected loss (player sets; NPC per §6.4)
  minDeductiblePct: number;            // ≥ PARAM.insurance_deductible_pct (0.10)
  regions: string[];
}

interface Policy {
  id: string; insurerId: InsId; holderId: EntityId; line: Line;
  insuredRefs: string[];               // biz, prop, model, item, cmp ids
  perils: Peril[];
  limit: Money; deductiblePct: number; deductibleMin: Money;
  premiumAnnual: Money; premiumPaidThroughTick: Tick; billing: 'DAILY' | 'UPFRONT';
  startTick: Tick; endTick: Tick; autoRenew: boolean;
  exclusions: string[];                // codes, see §3.5.1
  status: 'QUOTED' | 'BOUND' | 'LAPSED' | 'CANCELLED' | 'EXPIRED' | 'EXHAUSTED';
  aggregatePaid: Money;                // limit is annual aggregate
  quoteInputsHash: string;             // for fraud audits
}

interface Claim {
  id: string; policyId: string; insurerId: InsId; holderId: EntityId;
  triggerEventId: string;              // engine event that caused the loss
  peril: Peril; grossLoss: Money; deductible: Money; covered: Money;
  reserve: Money; paid: Money;
  openedTick: Tick; settleDueTick: Tick;
  status: 'OPEN' | 'APPROVED' | 'PAID' | 'DENIED' | 'DISPUTED' | 'FRAUD_REVIEW' | 'PRORATED';
  fraudScore: number; denialReason?: string; caseId?: string;   // 13 case
}

type TreatyType = 'QUOTA_SHARE' | 'SURPLUS' | 'PER_RISK_XOL' | 'CAT_XOL' | 'STOP_LOSS';
interface ReinsuranceTreaty {
  id: string; cedentId: InsId; reinsurerId: InsId; type: TreatyType;
  lines: Line[]; perils: Peril[];
  cessionPct?: number;                 // QS
  retention?: Money; limit?: Money;    // XOL layers
  rateOnLine?: number;                 // premium / limit for XOL
  cedingCommissionPct?: number;        // QS
  reinstatements: number; reinstatementsUsed: number;
  startTick: Tick; endTick: Tick; premium: Money; recoveriesPaid: Money;
  status: 'ACTIVE' | 'EXPIRED' | 'COMMUTED' | 'DEFAULTED';
}

interface CatBond {
  id: string; spvId: SpvId; sponsorId: InsId; assetId: string;  // listed in 06 as an OTC/RFQ instrument
  trigger: 'INDEMNITY' | 'INDUSTRY_INDEX' | 'PARAMETRIC';
  peril: Peril; regions: string[]; cities?: string[];
  attachment: Money; exhaustion: Money;   // on the trigger variable (indemnity loss / industry loss), or parametric intensity 0..10
  attachIntensity?: number; exhaustIntensity?: number;
  principal: Money; outstanding: Money;
  spreadBps: number;                   // over BILL_3M
  collateral: Money;                   // held in 3-month bills of the bond's ccy (04)
  issueTick: Tick; maturityTick: Tick; status: 'ACTIVE' | 'TRIGGERED' | 'MATURED';
  expectedLossAnnual: number;          // modelled, published
}

interface CatEvent {
  id: string; peril: Peril; cityIds: string[]; districtIds: string[];
  intensity: number;                   // 0..10 public scale
  damageRatioByDistrict: Record<string, number>;   // fraction of insured value destroyed
  industryLoss: Money; startTick: Tick; durationDays: number;
  biDays: number;                      // business interruption days
}

interface PolicyholderGuaranteeScheme { blocCode: string; fundBalance: Money; levyRate: number; coverPct: number; coverCapPerClaim: Money; }
```

---
## §3 Rules and formulas

### §3.1 Funds

#### §3.1.1 Who may launch which fund

| Kind | Structure | Sponsor requirements (all also need a clean record: no S4+ conviction in the last 1,344 game days = 1 chapter = 8 real weeks) | Outside investors |
|---|---|---|---|
| HEDGE, FUND_OF_FUNDS, CREDIT | OPEN_ENDED | `CH_FUND` charter (13), manager holds LIC3, rank ≥ R3, account age ≥ 336 game days (14 real days) | players + NPC allocators |
| LONG_ONLY | OPEN_ENDED | `CH_FUND`, LIC2, rank ≥ R3, account age ≥ 336 game days | players + NPC allocators |
| VENTURE, PRIVATE_EQUITY | CLOSED_ENDED | `CH_FUND`, LIC4, rank ≥ R4 | players + NPC allocators |
| MONEY_MARKET | OPEN_ENDED (stable NAV) | `CH_FUND`, LIC4, rank ≥ R4 | players + hh sector (NPC retail cash) |
| ETF (passive, leveraged, active) | ETF | `CH_FUND`, LIC4, rank ≥ R4; index must satisfy §3.2.6 | anyone with the license to trade the ETF on 05 |
| LISTED_CLOSED_END (any strategy) | LISTED_CLOSED_END | as the strategy, plus rank ≥ R4; listing follows the IPO process of 09 §3.10 with the float rules relaxed (100% float allowed) | anyone on 05 |
| SOVEREIGN_WEALTH | perpetual, CLOSED to outside players | rank R6 Dynasty; sponsor is the player's top `cmp`; optional NPC government co-investment (§3.1.20) | sponsor entities and the bloc treasury only |

NPC funds exist in every kind (§6.1). A player may sponsor at most `PARAM.fund_max_per_sponsor = 5` live funds. The manager can be the sponsor, a hired NPC manager (salary per 09 §3.6 staff rules, skill 1–5), or an AI model operating under the fund mandate (11 owns model operation; the human principal remains responsible in 13).

#### §3.1.2 Launch

1. `fund.create` with kind, strategy, mandate, fees, gate, transparency, base currency. Validation per §4. The fund entity `fnd_` is created with status `FUNDRAISING`, its custody account opened at the CCP custodian (07, `CH_CUSTODIAN` function), its own balance sheet in 03.
2. The manager seeds the fund with a manager stake ≥ max(`PARAM.fund_manager_stake_min_abs` = $250,000, 10% of the declared target AUM). Seed is a subscription like any other (§3.1.5) flagged `isManagerStake`.
3. When the seed settles, status → `ACTIVE`, initial `navPerUnit = PARAM.fund_initial_nav = $100.000000`. A `fund.launched` PUBLIC event is emitted (name, kind, strategy, fees, gate, manager handle; never holdings).
4. A fund that stays in `FUNDRAISING` for 28 game days without its seed closes and refunds any pending cash.

#### §3.1.3 Valuation hierarchy

Every position in a fund (and every asset held by an SPV or insurer) is valued at day close in this order:

| Level | Assets | Mark |
|---|---|---|
| 1 | Instruments with a trade in today's session or closing auction on 05 | 05 closing mark (closing auction price; for 24h products the 05 day-close mark at t = 719) |
| 2 | Instruments with no trade today but a model price: bonds, OTC derivatives, CDS, tranches with dealer quotes, other fund units (NAV), cat bonds | 06 model price (or the fund's struck NAV for fund units) |
| 3 | Private stakes (09 private companies, venture rounds), side-pocket assets, properties held by funds (10), defaulted claims without a market | Independent NPC valuer each game quarter using `09.valuePrivateStake()` / `10.appraise()`; between valuations the last value is rolled with the relevant sector index return × β = 1.0 |

Rules: an open-ended fund may hold at most `PARAM.fund_max_level3_pct = 0.10` of NAV in Level 3. If drift takes it above 0.10, new subscriptions pause automatically until it is back below. Above `PARAM.fund_level3_suspend_pct = 0.25` the fund must move the excess into a side pocket (§3.1.9) within 3 game days or it is frozen. A manager can never set a mark; there is no manual valuation input.

#### §3.1.4 NAV strike (every game day, t = 719, phase P8)

Single gross NAV per unit `G` for the fund plus per-series performance-fee accruals (series accounting):

```
1. grossAssets  = Σ_positions qty × mark(level)            (long positions, cash, receivables, fund units)
2. liabilities  = PB borrowings (07) + |short positions| × mark + payables + accrued custody + accrued mgmt + pending redemptions payable
3. mgmtAccrual  = navBeforeFees × mgmtFeeRate / 364         (accrued every game day, paid at each game-month end)
4. custodyAccrual = navBeforeFees × PARAM.fund_custody_fee / 364
5. G            = (grossAssets − liabilities) / unitsOutstanding
6. For each series s:
     hurdleLevel_s = H_s × (1 + hurdleRate)^(daysSinceCrystallization_s / 364)     (HARD or SOFT; NONE → H_s)
     if hurdleType = HARD: a_s = perfFeeRate × max(0, G − max(H_s, hurdleLevel_s))
     if hurdleType = SOFT: a_s = (G > hurdleLevel_s) ? perfFeeRate × max(0, G − H_s) : 0
     if hurdleType = NONE: a_s = perfFeeRate × max(0, G − H_s)
     netNavPerUnit_s = G − a_s
7. Reported NAV (boards, iNAV for listed products) = netNavPerUnit of the lead series (the oldest series at or above HWM).
```

Swing pricing (protects remaining investors from the cost of large flows): if |net subscriptions − redemptions dealing today| > `PARAM.fund_swing_threshold = 0.05` × NAV, then `G_deal = G × (1 ± swingFactor)` for today's dealing only (minus for net redemptions, plus for net subscriptions), where `swingFactor = min(PARAM.fund_swing_cap = 0.03, estimatedLiquidationCost / NAV)` and `estimatedLiquidationCost = Σ_assets sold pro rata (halfSpread + 0.8 × σ_daily × √(qty / ADV)) × value` (05 §impact). The swing amount stays in the fund.

All fee accruals are fund liabilities; the NAV record (§2.2 `NavRecord`) is written and a `fund.navStruck` event (PARTIES visibility: investors and manager) is emitted. Board statistics use the PUBLIC subset (§3.1.14).

#### §3.1.5 Subscriptions

1. `fund.subscribe { fundId, amount }` moves `amount` from the investor's cash into the fund's subscription escrow at the CCP immediately (P13 of the intent's tick), status PENDING. Escrowed cash is not invested and not counted in NAV.
2. Dealing day: requests received before `PARAM.fund_dealing_cutoff_tod = 539` (closing auction) deal at today's strike; later requests deal at the next game day's strike (forward pricing; no stale-NAV trading).
3. At the strike: `units = amount × (1 − subscriptionFeeRate) / G_deal`; the subscription fee stays in the fund. A new series is opened with `H_s = G_deal` (series of the same dealing day are merged). `lockupUntilTick = strikeTick + lockupTicks`.
4. Rejections at strike (cash returned, reason code `FUND_SUB_REFUND`): fund not ACTIVE; investor would exceed `PARAM.fund_investor_max_nw_pct = 0.25` of the investor's NW (NW at strike, including the new units); investor account younger than `PARAM.fund_investor_min_age_days = 168` game days (7 real days); investor linked to the manager (19 link score ≥ `PARAM.fund_link_score_block = 0.6`, or same alliance treasury signatory); AUM cap breached (§3.1.10); manager stake would fall below 10%; ticket < `PARAM.fund_min_ticket = $1,000`.
5. Partial acceptance: if only part fits the cap, the accepted part is filled and the rest refunded.

#### §3.1.6 Redemptions

1. `fund.redeem { fundId, units | amount }`. Same dealing cutoff as §3.1.5. Units still under lockup are rejected.
2. Gate: if enabled, total redemptions dealing on one day are capped at `maxRedeemPctNavPerDay` (default 0.20) of NAV. If requests exceed the cap, every request is filled pro rata; the unfilled remainder is carried forward to the next dealing day with no priority over new requests (all pro rata again). Gate-free windows (mandate change notice, breaker, absent manager, wind-down notice) ignore the cap.
3. Payment per unit = `netNavPerUnit_s` at `G_deal`. The investor's series performance fee `a_s × units` is crystallized to the manager at the same time (§3.1.7).
4. Early exit: redemptions of units held fewer than `PARAM.fund_early_exit_days = 48` game days (2 real days) pay `earlyExitFeeRate` (default 0.01) into the fund.
5. Cash: payment is made from fund cash at the strike. If cash (plus undrawn PB credit, 07) is insufficient, the shortfall becomes a `redemptionPayable` liability and the engine generates liquidation orders for the fund in the next ticks (P4): pro rata across Level-1 positions, each order ≤ `PARAM.fund_liquidation_adv_cap = 0.20` of the asset's ADV per game day, sent through normal 05 order intents tagged `actor = fund engine`. The payable is settled as cash arrives, oldest first. If it is still unpaid after `PARAM.fund_redemption_max_delay_days = 1` game day, the fund status becomes `GATED` and §3.1.9 applies. The payment amount was fixed at the strike; later price moves while selling are borne by remaining investors (this is the real first-mover incentive that makes fund runs possible; the gate and swing pricing are the counters).
6. In-kind redemption: a redeeming investor holding ≥ 10% of the fund may request in-kind; the fund delivers a pro-rata slice of Level-1 positions (rounded to lots) plus cash for the rest.

#### §3.1.7 Fees (all transfers except custody)

| Fee | When | Paid by → to | Reason code (class) |
|---|---|---|---|
| Management | accrued daily (§3.1.4), paid at each game-month end | fund → manager entity | `FUND_MGMT_FEE` (TRANSFER); on the NPC-investor share: `FUND_MGMT_FEE_NPC` (FAUCET) |
| Performance | crystallized at each game-quarter end (or ANNUAL), and on redemption | fund → manager entity, paid in cash; the investor's units are reduced by `a_s × units / G` and those units cancelled, so `G` is unchanged | `FUND_PERF_FEE` (TRANSFER); NPC share `FUND_PERF_FEE_NPC` (FAUCET) |
| Custody | accrued daily, paid monthly | fund → CCP (07) | `FUND_CUSTODY_FEE` (SINK) |
| Subscription / early exit / swing | at dealing | investor → fund | `FUND_ANTI_DILUTION` (TRANSFER) |
| Creation / redemption (ETF) | at settlement | AP → fund | `ETF_CU_FEE` (TRANSFER) |

After crystallization `H_s = G` for every series that paid a fee; series at or above the lead series HWM are merged into it. There are no per-trade fees to the manager (no churning incentive). Fund trading costs (05 fees, spreads) are paid by the fund.

FAUCET classification rule (03 owns the class registry): a fee paid out of value attributable to NPC investors is a FAUCET because it moves NPC money into the player economy; the NPC investors' capital itself is not player wealth and is excluded from player NW and from the Stabilizer's `M` (03 consolidates NPC-owned units outside the player economy).

#### §3.1.8 Mandate enforcement

Pre-trade, in P1, for every order whose actor is a fund (manager trading for the fund):

1. Instrument's asset class ∈ `allowedAssetClasses`, region ∈ `allowedRegions`, `shortAllowed` and `derivativesAllowed` respected (and the manager holds the license the instrument needs).
2. Post-trade gross leverage (Σ|exposure| / NAV, using delta-adjusted notional for derivatives from 06) ≤ `maxGrossLeverage` (player funds ≤ `PARAM.fund_max_leverage_player = 1.5`; NPC funds per §6.1).
3. Post-trade position ≤ `maxPositionPctNav` (player ≤ `PARAM.fund_max_position_pct = 0.20`).
4. Related-party cap: if the manager (or any entity in the manager's ownership chain or 19-linked accounts) personally holds ≥ `PARAM.fund_related_float_pct = 0.01` of the instrument's float, or is an insider of the issuer (09 §3.10 insider list), the fund's position is capped at `PARAM.fund_related_cap_pct = 0.05` of NAV, and every fund trade in that instrument is filed publicly within 1 game day (`fund.relatedHoldingFiled`).
5. Self-match: 05 never matches a fund order against an order from the manager or a linked account (the same rule as wash-trade prevention).

A failing order is rejected with the rule code; nothing else happens. Post-trade drift (prices move) never forces a trade, except: leverage above `1.1 × maxGrossLeverage` hands control to 07 margin rules; a position above 1.25 × `maxPositionPctNav` must be reduced within `PARAM.fund_drift_cure_days = 3` game days or the fund is FROZEN until it is.

Mandate change: `fund.updateMandate` takes effect after `PARAM.fund_mandate_notice_days = 24` game days (24 real hours). During the notice every investor may redeem gate-free and without early-exit fee. Fee increases follow the same notice; fee cuts are immediate.

#### §3.1.9 Freezes, breakers, side pockets, suspension

| Trigger | Effect | Ends |
|---|---|---|
| Absent manager: the human principal of the manager has not logged in for `PARAM.fund_absent_freeze_days = 72` game days (72 real hours) | status FROZEN: no new trades except engine liquidation for redemptions; redemptions gate-free | manager returns (unfreeze next tick) |
| Absent manager ≥ `PARAM.fund_absent_winddown_days = 336` game days (14 real days) | automatic wind-down (§3.1.11) | final distribution |
| Drawdown breaker: lead-series net NAV falls `PARAM.fund_breaker_dd = 0.30` below its HWM within any 7-game-day window | FROZEN for `PARAM.fund_breaker_freeze_days = 1` game day; gate-free redemptions for that day | timer |
| Level 3 > 0.25 of NAV | must create a side pocket within 3 game days, else FROZEN | side pocket created |
| More than 50% of NAV in instruments under a 05 trading halt | dealing SUSPENDED (no subs or redemptions) | halt lifts; max 3 game days, then dealing resumes with Level-2 marks |
| Regulator order (13) | SUSPENDED / FROZEN as ordered | per 13 |

Side pocket: the manager (or the engine when forced) moves named Level-3 assets into a side pocket. Every investor at that tick receives side-pocket units in proportion to fund units. Side-pocket units cannot be redeemed; they are paid out when the assets are sold or valued at a liquidity event. New investors do not participate in existing side pockets. Performance fee on side pockets is charged only on realization.

#### §3.1.10 Skin in the game and AUM caps

- Manager stake value ≥ `PARAM.fund_manager_stake_min_pct = 0.10` × AUM at all times, and ≥ $250,000. If AUM growth or manager losses push it below, new subscriptions pause (rejected at strike) until restored. The manager cannot redeem stake units that would breach this (except in wind-down).
- AUM ≤ `PARAM.fund_aum_stake_multiple = 10` × manager stake value.
- AUM ≤ `PARAM.fund_new_aum_cap = $10,000,000` until the fund is `PARAM.fund_new_period_days = 336` game days old (14 real days).
- The stake is first-loss for restitution only: if a court orders fund-related restitution (13), the stake units are cancelled first and their value distributed to the other investors pro rata; only after the stake is exhausted does 13 collect from the manager's other assets.

#### §3.1.11 Wind-down and closure

`fund.close` (manager) or an automatic trigger starts `WINDING_DOWN`: notice to investors, all redemptions gate-free, no new subscriptions, the engine sells Level-1 positions over at most `PARAM.fund_winddown_days = 5` game days at ≤ 20% ADV per game day, settles derivatives and PB debt, then distributes cash pro rata at a final NAV. Side pockets distribute as their assets are sold (the engine lists Level-3 private stakes on the 09 private-stake market and 10 property listings). Status CLOSED; the track record stays public forever (Legacy, 14). Abrupt closure is legal but appears on the fund page as an incident if it occurs within 91 game days of a fee increase or after a drawdown breaker.

#### §3.1.12 Betrayal: what is possible and what is punished (resolves roadmap Q6, option A)

Theft is impossible by construction: fund assets are only in custody; the manager has trade rights and no withdrawal path except crystallized fees and his own units. No "exit scam" exists (roadmap Q6 option B rejected). What remains is market abuse, all public and prosecutable:

| Abuse | Detection | 13 offence |
|---|---|---|
| Fund as exit liquidity (manager dumps personal holdings into fund buying) | §3.1.8 rule 4 filings + 13 surveillance comparing manager sells vs fund buys within 1 game day | S5 market abuse |
| Front-running the fund | manager's personal trades in the same asset and direction within 1 game day before fund trades of ≥ 2× the personal size | S5 |
| Related-party valuation (fund buys manager's private stake) | Level-3 assets bought from a related party must price within 10% of the NPC valuer's appraisal, else blocked; +30 surveillance score on attempt (09 §3.12 shares the rule) | S4 if attempted repeatedly |
| Style drift within mandate | style-drift score on the page (§3.1.13); not an offence | none |
| Abrupt closure | page incident (§3.1.11) | none |

Penalties for S5 fund abuse bind as in the roadmap §2.2: fine 8% of NW (floor $100,000, per-verdict cap 35% of NW), 100% disgorgement, 1.5× restitution paid first from the manager stake (§3.1.10), the Victim Compensation Fund advances 50% of restitution immediately (13), a fund-management ban of 1,344 game days (8 real weeks) during which all the manager's funds wind down, and a permanent line on the profile and fund page. 13 owns the sanction mechanics; this module emits the evidence events (§5).

#### §3.1.13 Style drift

Each game week the engine regresses the fund's daily returns over the trailing 91 game days on the 05 factor set (market, sector, region, rates, risk appetite, FX, crypto beta). The declared strategy maps to a reference exposure profile (table in 22: e.g. `LONG_SHORT_EQUITY`: market β 0.3–0.7, rates |β| < 0.3; `MACRO`: rates and FX loadings allowed, equity β < 0.5). `styleDriftScore = 100 × Σ_k max(0, |β_k − clamp(β_k, lo_k, hi_k)|) / Σ_k (hi_k − lo_k)`, capped at 100. Shown publicly after 2 game quarters of history. The score reveals no positions (aggregate regression only, L11 safe).

#### §3.1.14 Track record and the fund board

- Daily net return `r_d` = lead-series net NAV change. `annualizedReturn = (Π(1+r_d))^(364/n) − 1`. `annualizedVol = stdev(r_d) × √364`. `sharpe = (mean(r_d) − rf_d) / stdev(r_d) × √364` with `rf_d` = 04 FDL 3-month bill yield / 364.
- Public on the fund page: name, manager, kind, strategy, fees, gate, AUM band (log buckets: <$1M, $1–10M, $10–100M, $100M–1B, $1–10B, >$10B), net return, vol, Sharpe, max drawdown, current drawdown, style-drift score, incidents, investor count band. Never positions (L11), except legally required filings (§3.1.16).
- Fund board (15 renders it): eligible when AUM ≥ `PARAM.fund_board_min_aum = $1,000,000` and history ≥ `PARAM.fund_board_min_days = 182` game days (2 game quarters). Ranked by Sharpe; tabs for 1-quarter and since-inception return.

#### §3.1.15 Transparency to investors (opt-in disclosure)

The manager chooses the transparency level; investors see only that level, and every investor is bound by an automatic NDA clause (15) on what they receive:

| Level | Investors receive |
|---|---|
| NAV_ONLY | daily NAV, monthly return summary |
| EXPOSURES | plus asset-class, region and sector exposure buckets (5% granularity), leverage, liquidity profile |
| TOP_POSITIONS_DELAYED | plus the top 5 positions as % of NAV, delayed 7 game days |
| FULL_DELAYED | plus the full position list, delayed 28 game days |

Default `EXPOSURES` (DEFAULT, Mathis may override). An investor who republishes NDA-protected data (detected by 12/13 provenance tags on the data) faces a civil claim under the NDA clause.

#### §3.1.16 Legal filing rules that apply to funds

- Ownership thresholds (15 owns): the fund's and its manager's holdings in an issuer are aggregated for the 5% / 20% / 50% filings.
- Holdings report: every fund files 15 §3.8's `HOLDINGS_QUARTERLY` (up to 20 long listed-equity positions, each ≥ 0.5% of its reportable book, with quantity) at each game-quarter end, due 21 game days later. 15 owns the rule and its timing (ruling in 24); `PARAM.fund_filing_aum` is retired.
- Active ETFs publish their basket daily (§3.2.8); that is part of choosing the ETF structure.

#### §3.1.17 NPC capital in player funds (the "hedge fund business" faucet, 01 §4.4)

NPC allocators (pension funds, endowments, family offices, 16 named actors) allocate capital to eligible player funds:

1. Eligibility: on the fund board (§3.1.14), no S4+ incident in the last 2 game quarters, Reputation of manager ≥ 40 (14).
2. Each game-quarter end, each allocator scores every eligible fund: `score = 0.5·z(sharpe) + 0.2·z(ln(daysOfHistory)) − 0.2·z(maxDrawdown) + 0.1·z(managerReputation) − 0.3·incidents4q − 0.2·max(0, styleDriftScore − 30)/70`, where `z` is the cross-sectional z-score among eligible funds of that strategy.
3. The allocator's player-fund budget `B_alloc = allocatorAUM × PARAM.npc_alloc_player_share (0.02) × stabilizerLever (03/04, in [0.5, 1.5])` is spread over the top `PARAM.npc_alloc_top_k = 10` funds by softmax(score / 0.5), each allocation capped so that NPC capital ≤ `PARAM.fund_npc_max_share = 0.50` of the fund's AUM and the fund still satisfies §3.1.10.
4. Allocations subscribe through §3.1.5 like any investor. Allocators redeem fully (gate applies) when the fund breaches the drawdown breaker, gets an S4+ incident, or drops out of their top-k for 2 consecutive quarters.
5. NPC capital and its returns belong to the NPC allocator (not player wealth). Only fees on it are FAUCET (§3.1.7). The Stabilizer can scale this faucet through `stabilizerLever`.

#### §3.1.18 Closed-end funds (VENTURE, PRIVATE_EQUITY)

1. Fundraising: LPs commit amounts (`fund.commit`); first close when commitments ≥ manager's declared minimum and the GP commitment ≥ 10% of total commitments (`PARAM.fund_manager_stake_min_pct`). Final close ≤ 91 game days after first close.
2. Capital calls: the manager calls up to the undrawn commitment with `PARAM.fund_call_notice_days = 10` game days notice. Called cash moves at the due tick. An LP who fails a call (insufficient cash after 3 game days grace) forfeits `PARAM.fund_lp_default_forfeit = 0.5` of its paid-in value to the other LPs and loses further commitment; the forfeiture is a TRANSFER.
3. Investment period 364 game days (1 game year); term 1,456 game days (4 game years); up to 2 extensions of 182 game days by LP vote (> 50% of commitments).
4. Valuation: Level 3 each game quarter (§3.1.3). Management fee on commitments during the investment period, on invested cost after.
5. Distributions (European waterfall, DEFAULT): proceeds go (a) 100% to LPs until they receive paid-in capital, (b) 100% to LPs until a `PARAM.fund_pref_return = 0.08` per game year compounded preferred return, (c) 100% to GP until GP has 20% of cumulative profits (catch-up), (d) 80/20 LP/GP. AMERICAN (deal-by-deal) is selectable with a GP clawback at term: GP repays excess carry net of tax, secured by escrow of 30% of carry.
6. LP interests are transferable only through a 15 transfer contract with GP consent; secondary sales use normal contract pricing and the 2% P2P tax (15).
7. Venture funds invest through 09 §3.11 rounds; PE funds acquire companies through 09 §3.13–§3.14 (M&A, LBO), the fund being the acquirer entity.

#### §3.1.19 Money-market funds

1. Eligible assets: 3-month and shorter government bills (04), repo with the CCP or banks rated ≥ A- (07), commercial paper of issuers rated ≥ A- maturing ≤ 91 game days. Weighted-average maturity ≤ `PARAM.mmf_max_wam_days = 60` game days. Weekly-liquid assets (maturing ≤ 7 game days, bills, cash) ≥ `PARAM.mmf_min_weekly_liquid = 0.30`.
2. Units are priced at a stable $1.000000 (amortized cost). The engine also computes `shadowNav` from marks every day.
3. If `shadowNav < PARAM.mmf_break_level = 0.9950`, the fund "breaks the buck": units float at shadow NAV for the next 28 game days; a liquidity fee of `PARAM.mmf_liquidity_fee = 0.02` and a gate of 10% per day may be applied by the manager (NPC MMFs apply both). A PUBLIC `fund.mmfBrokeBuck` event fires (16 news).
4. If weekly-liquid assets fall below 0.15, the gate is automatic.
5. NPC MMF holders are the household sectors `hh` of each city: their MMF balance is a share `PARAM.hh_mmf_share = 0.08` of hh liquid savings (16 owns hh balances); hh redemption pressure each day = `base 0.002 + 0.05·fear + 0.4·max(0, 0.9990 − shadowNav)/0.0040` of their MMF holdings (capped 0.25/day). This is the run channel into repo and bill markets (07, 04).

#### §3.1.20 Sovereign wealth fund (Dynasty)

1. Sponsor: an R6 player's top company. Capital comes only from entities in the sponsor's ownership chain; no outside player investors (no AUM-from-others rules apply, the stake rule is moot).
2. Optional co-investment: the sponsor may sign a `PARAM.swf_cofund_max = 0.25` co-investment mandate with one bloc treasury (04) whose NPC capital joins the fund (at most 25% of NAV) in exchange for a commitment to hold ≥ 30% in that bloc's assets and to underwrite that bloc's bond auctions (04 primary dealer status). Fees on the treasury's share are capped at 0.5% per game year and no performance fee (FAUCET, small).
3. Privileges: primary-dealer status in the co-investing bloc's sovereign auctions (04), eligibility to bid for exchange and clearing concessions (09 §3.8) as a consortium leader, 49% cap per issuer instead of 25% for NPC companies (05 cap still bounds per-order size).
4. A SWF never redeems; it distributes to its sponsor by `fund.distribute`.

#### §3.1.21 Fund of funds

Holds units of other funds (player or NPC) as Level-2 positions at their NAV. Its own dealing terms must be no more liquid than its holdings: `FoF.noticeTicks ≥ max(underlying.noticeTicks)` and its gate ≤ the tightest underlying gate (validation at create and at each new holding). Gates in an underlying pass through: FoF redemption payable waits for underlying cash. Look-through leverage (Σ underlying leverage × weight) is shown to FoF investors at EXPOSURES level and above.

#### §3.1.22 Leverage, prime brokerage and limited liability

Funds borrow only through a prime broker (07): cash margin loans and short borrows, cross-margined. Margin calls on a fund are met from fund cash; failing that 07 liquidates per its rules. Investors' loss is limited to their units: if a fund's equity goes negative after a PB liquidation, the deficit is a PB loss handled by 07's default waterfall, never charged to investors or the manager beyond their units (except via court restitution for abuse).

### §3.2 ETFs and indices

#### §3.2.1 Listing, NAV and iNAV

An ETF is a `Fund` with `structure = ETF` and an `EtfSpec`. Its units are a tradeable instrument registered in 06 (asset class `ETF`, lot 1 unit) and trade in the 05 batch auction like a stock, in the session of its underlying (equity ETFs follow the equity session; crypto ETFs trade 24/7; bond ETFs follow bonds). NAV is struck daily at t = 719 by §3.1.4 (ETFs have no performance fee; `mgmtFeeRate` ≤ `PARAM.etf_max_fee = 0.0075`).

iNAV is recomputed every tick in P8 from the last 05 prices of the basket: `iNAV = (Σ basket qty × lastPrice + cashComponent) / creationUnit`. iNAV and `premiumBps = (ETF mid − iNAV) / iNAV × 10,000` are PUBLIC every tick (no leak: the basket is public by structure).

#### §3.2.2 Primary market: creation and redemption

1. Only registered APs may create or redeem. An AP needs LIC4 and `CH_EXCHANGE_MEMBER` (13); NPC APs are the NPC dealer banks (§6.2). `fund.etf.registerAp` sets a daily CU limit (default `PARAM.etf_ap_daily_cu_limit = 40`).
2. Orders `fund.etf.create { cus }` / `fund.etf.redeem { cus }` are accepted until the cutoff (t = 539 for session-based ETFs, t = 719 for 24h ETFs) and settle at t = 719 the same game day at the struck NAV.
3. In-kind create: at settlement the AP's custody must hold `cus × basket qty` of each line plus `cus × (cashComponent + creationFeeFixed)` cash. The engine moves the basket into the fund and mints `cus × creationUnit` units to the AP. Redeem: the AP delivers units (must hold them, including units bought today), receives the basket plus cash component minus fee.
4. Cash create (when `inKind = false`, e.g. bond and illiquid ETFs): the AP pays `cus × creationUnit × NAV × (1 + cashCreationSpreadBps / 10,000) + fee`; the fund itself buys the basket over the next game day through 05 (fund engine orders). Cash redeem is symmetric (fund sells; AP receives NAV × (1 − spread)).
5. Failure: if the AP lacks the basket or units at settlement, the order FAILS, the AP pays `PARAM.etf_fail_fee = 0.005` × CU value to the fund (TRANSFER), and 3 fails in 7 game days suspend the AP for 7 game days.
6. Units are minted and burned only by this process (and by fund closure); `unitsOutstanding` changes only here.

#### §3.2.3 AP arbitrage band

Each tick, an AP compares the ETF's market to iNAV. The no-arbitrage band half-width is:

```
band = (creationFeeFixed / CUvalue) + basketExecCost + PARAM.etf_ap_margin_bps (5 bps)
basketExecCost = Σ_lines w_line × (halfSpread_line + 0.8 × σ_daily,line × √(qty_line × cus / ADV_line))     (05 impact law)
```

If `premiumBps > band`: the AP sells ETF units and buys the basket in the same tick (two sets of 05 orders), then creates at the close. If `premiumBps < −band`: buys ETF units, sells the basket (or shorts it, if borrow is available from 07), redeems at the close. NPC AP size per tick = min(remaining daily CU limit, CUs needed to bring the premium inside the band at the estimated impact, the AP's balance-sheet room from 07). In a crisis: 05 NPC depth thins by `(1 − 0.6·fear)`, basket costs rise and 07 tightens dealer balance-sheet limits, so the band widens and ETFs trade at real discounts (most visible for bond and small-cap ETFs). Nothing in this module scripts the discount.

#### §3.2.4 Flows into the underlying

Creations require the AP to buy the basket in the market; redemptions require it to sell. Index rebalances (§3.2.6) and leveraged-ETF rebalances (§3.2.5) trade in the closing auction. All this flow goes through 05 orders and therefore through 05 impact, so heavy ETF inflows lift constituents and outflows press them. 05's agent pools do not double-count this flow (they see it as ordinary orders).

#### §3.2.5 Leveraged and inverse ETFs

`leverage ∈ {−3, −2, −1, 2, 3}`. Exposure is held through futures and total-return swaps (06) with the CCP or a dealer. At each close the fund re-sets exposure to `L × NAV`: required change `ΔE = L(L − 1) × r_day × NAV_prev` (r_day = the underlying's return for the day), traded in the closing auction (t = 540) of the next session for equity underlyings, at t = 719 for 24h underlyings. The resulting volatility decay is real and shown in the ETF's product sheet (17). Buying them requires LIC3. They may not be held by MMFs or LONG_ONLY funds.

#### §3.2.6 Indices: methodology and rebalancing

- NPC index providers (22: e.g. the GX 100, regional indices, 12 sector indices, a dividend index, an IG and an HY bond index, a crypto basket) publish methodology. A player ETF sponsor may define a new index; methodology is always public and fully rule-based: the engine computes constituents and weights from `IndexDef.universeRule` and `method`; there is no discretionary pick.
- Eligibility guard for player indices: each constituent must have float market cap ≥ `PARAM.index_min_float_cap = $200,000,000` and ADV ≥ `PARAM.index_min_adv = $2,000,000`; weight cap `capPerConstituent ≤ 0.10` (excess redistributed pro rata); ≥ 20 constituents (≥ 10 for bond and crypto). An instrument where the sponsor, its funds or linked accounts hold ≥ 1% of float cannot be added (blocked at rebalance with a public note).
- Rebalance: every game quarter (or month if declared). Changes are announced `announceLeadDays` (default 5) game days ahead as a PUBLIC event; effective in the closing auction of the rebalance day. Index-tracking funds trade there. Trading ahead of announced changes is legal (it is public information).
- Index level: `level = Σ price_i × shares_i / divisor`; the divisor is adjusted at every rebalance and corporate action (splits, spin-offs, issuance; 09 §3.15 events) so the level is continuous.

#### §3.2.7 Tracking and income

Securities lending income from lending ETF holdings through 07 goes to the fund. `trackingDifference90d = ETF NAV return − index return` over 91 game days, public.

#### §3.2.8 Active ETFs

An active ETF has no index; the manager trades it under its mandate like a fund. By choosing this structure the sponsor accepts daily public disclosure of the basket at t = 719 (it is the basket APs deliver). DEFAULT (Mathis may override): daily disclosure is required, consistent with L11 because it is a legal filing rule the sponsor opts into.

### §3.3 Securitization and tranches

#### §3.3.1 Who securitizes

- Players: sponsor with LIC4 and either `CH_BANK` (07) or `CH_FUND`. NPC banks (07, 16) securitize per §6.3.
- Assets: loans the sponsor owns (07 loan book), mortgages it owns (10 via 07), trade receivables of companies it owns (09 §3.9), equipment leases, or loans bought from NPC banks through 07's whole-loan sale market. For `CDO_OF_ABS`, existing ABS tranches.
- The originating loans keep being modelled by their owner modules (07 for credit events and payments, 10 for the property side of mortgages). This module only aggregates their cash flows and losses.

#### §3.3.2 Pool eligibility

| Rule | Default |
|---|---|
| Obligors (cohort counts each contained loan) | ≥ `PARAM.sec_min_obligors = 50` |
| Single obligor share | ≤ `PARAM.sec_max_obligor_pct = 0.02` (CLO ≤ 0.025) |
| Loan status | performing, ≤ 30 game days delinquent never in the last 91 game days |
| Remaining term | ≥ 28 game days |
| Currency | all = deal currency |
| Deal type match | RMBS = MORTGAGE_RES; CMBS = MORTGAGE_CRE; CLO = CORPORATE_LOAN ≥ 80%; ABS = consumer/auto/card/trade/lease; CDO_OF_ABS = ABS_TRANCHE rated BBB+ … BB- only, never a CDO_OF_ABS tranche (one level of re-securitization only, DEFAULT) |
| Pool size | ≥ `PARAM.sec_min_pool = $25,000,000` |

#### §3.3.3 Structure

Tranches are contiguous slices `[attach, detach)` covering `[0, 1)` of the original pool balance; the equity tranche is `[0, a_1)`; at most `PARAM.sec_max_tranches = 8`. Coupons are FIXED or FLOAT (reference = 04 FDL policy rate or 3-month bill of the deal currency). The sponsor must retain `PARAM.sec_risk_retention = 0.05` either as a 5% vertical slice of every tranche or as ≥ 5% of the original pool in the most junior tranches (horizontal). Retention may not be hedged or sold for the life of the deal (13 offence S4 if circumvented through a linked account). The regulator parameter is lobbyable within [0, 0.10] by 16's politics model.

#### §3.3.4 Pool loss model (used by ratings and model prices)

One-factor Gaussian copula, large homogeneous pool (Vasicek). For a horizon `H` in game years (the pool's weighted-average life, WAL):

```
PD_pool   = Σ balance_i × pdAnnual_i / Σ balance_i
PD_H      = 1 − (1 − PD_pool)^H
LGD       = Σ balance_i × lgd_i / Σ balance_i
Conditional pool loss given systematic factor Z ~ N(0,1):
   L(Z)   = LGD × Φ( (Φ⁻¹(PD_H) − √ρ · Z) / √(1 − ρ) )
E[min(L, K)] = Σ_{n=1..32} w_n × min(L(z_n), K)            (32-node Gauss–Hermite, nodes for N(0,1); 02 math library)
Tranche [a, d) expected loss fraction:  EL_ad = (E[min(L,d)] − E[min(L,a)]) / (d − a)
Probability the tranche is hit:         P_hit = P(L > a) = Φ( (Φ⁻¹(PD_H) − √(1−ρ)·Φ⁻¹(a / LGD)) / √ρ )   for a < LGD, else 0
Annualized tranche PD:                  pdAnn = 1 − (1 − P_hit)^(1/H)
```

`Φ`, `Φ⁻¹` and Gauss–Hermite weights come from the deterministic math library of 02 (`normCdf`, `normInv`, `ghNodes32`). For `CDO_OF_ABS` the pool "loans" are the underlying tranches with `pd = pdAnn(their composite rating)` and `lgd = PARAM.sec_cdo_tranche_lgd = 0.80`.

#### §3.3.5 Where correlation comes from (the 2008 mechanism)

The world's real defaults are produced by 07 and 10: each loan's daily default hazard loads on shared bloc and city factors (unemployment, house-price index, policy rate, sector output) with loadings that rise in downturns. Interface assumed from 07: `loanHazard(loan, macroState) = baseHazard × exp(Σ_k λ_k(regime) × factor_k)` with `λ` larger in the 04 `RECESSION` and `CRISIS` regimes. Realized correlation is therefore low in a long boom and high in a bust. Nothing in 08 sets it.

Rating agencies estimate correlation from history (§3.4.3): over a lookback of `method.lookbackDays` they observe each asset class's monthly cohort default rates `DR_t` (07 publishes them per bloc and asset class each game month) and solve `Var(DR) = Φ₂(Φ⁻¹(PD̂), Φ⁻¹(PD̂); ρ̂) − PD̂²` for `ρ̂` by bisection on [0.001, 0.6] (bivariate normal CDF from the 02 library, 20-point Gauss–Legendre). After a long calm period `ρ̂` and `PD̂` are low; ratings of senior and mezzanine tranches are then generous; underwriting standards (07's `standardsIndex`, which loosens with competition and calm) drift down; sponsors size AAA tranches large. When the regime turns, realized defaults cluster, tranches are downgraded in batches, NPC buyers bound by rating floors sell (§3.4.7), model prices gap down, repo haircuts on tranches rise (07), and funding freezes. Every step is a rule; a well-informed player can see it coming in the public dashboards (§3.6) and position for it, profit from it or avert it.

#### §3.3.6 Issuance (book-build and uniform-price auction)

1. `fund.sec.createPool` → status STRUCTURING. `addAssets` / `removeAssets` until `fund.sec.structure` fixes tranches.
2. `fund.sec.requestRating { agencyIds }` → status RATING. Each agency returns a private preliminary rating per tranche within `PARAM.rating_turnaround_days = 3` game days (queue capacity §3.4.5). The sponsor chooses which to publish (§3.4.5).
3. `fund.sec.launch { minSpreads? }` → status MARKETING for `PARAM.sec_book_days = 1` game day. Investors (players with LIC4, NPC buyers per §6.3) submit bids per tranche: `{ trancheId, notional, maxSpreadBps }` (a lower spread is a higher price). Bids are sealed until close.
4. At the book close (t = 719): per tranche, sort bids by spread ascending; the clearing spread is the lowest spread at which cumulative notional ≥ tranche size; all filled bids pay par at that coupon spread (uniform). Bids at the clearing spread are filled pro rata. If total bids < size, the sponsor keeps the unsold notional. If the sponsor set a `minSpread` floor per tranche, it is ignored for bids (it is a reserve the other way: `maxSpreadAccepted`; above it the sponsor withdraws that tranche and keeps it).
5. FIXED tranches price at par with coupon = swap rate of WAL (06 curve) + clearing spread; FLOAT = ref + clearing spread.

#### §3.3.7 Closing

At settlement (the tick after book close, P8): true sale of pool assets from originators to the SPV (ownership in 07/10 records changes; servicing stays with the servicer), investors pay par into the SPV, the SPV pays the sponsor the purchase price, the reserve account is funded from proceeds (`reserveTarget = PARAM.sec_reserve_pct = 0.01` × pool). Tranches are registered in 06 as instruments of class `ABS` (LIC4 to trade; OTC/RFQ and a weekly batch auction on 05). Status `CLOSED_ACTIVE`; `legalFinalTick = max loan maturity + 364 game days`.

Consolidation (03 rule, DEFAULT): if the sponsor holds > 50% of the equity tranche and its group is the servicer, the SPV is consolidated into the sponsor's group statements (no off-balance-sheet relief); otherwise it is a separate entity and the sponsor reports only its retained tranches.

#### §3.3.8 Collections and the payment waterfall

Daily at t = 719, collections from pool assets (interest, scheduled principal, prepayments, recoveries) posted by 07/10 arrive in the SPV collection account. Every `paymentEveryDays` (default 7) game days at t = 719:

```
Interest waterfall (from interest collections + reserve if needed):
 1. Trustee fee, servicer fee, manager fee (bps per game year × days/364 × pool balance)
 2. Class A interest (pro rata across A1, A2…)
 3. If A OC and A IC tests pass: Class B interest; else divert all remaining interest to pay Class A principal (turbo) and stop
 4. … repeat for each mezzanine class with its own tests
 5. Reserve account top-up to target
 6. Writedown reimbursement (reverse any principal writedowns, most senior first)
 7. Residual to the equity tranche
Principal waterfall (from principal collections + diverted interest):
 SEQUENTIAL: all principal to the most senior outstanding class until zero, then next.
 PRO_RATA_UNTIL_TRIGGER: principal pro rata by outstanding principal across non-equity classes while all tests pass
   and cumulative losses < PARAM.sec_cum_loss_trigger (0.06) of original pool; sequential after any breach (permanent).
Loss allocation: realized losses this period write down principal in reverse seniority (equity first, then the most junior class above it).
Unpaid interest on a deferrable class (all except the most senior) accrues as interestShortfall and is paid before current interest when cash allows.
```

Tests per class `c` (computed on the payment date):

```
OC_c = performing pool balance / Σ principal of classes senior to and including c        trigger default: A 1.25, B 1.15, C 1.08, D 1.03
IC_c = interest collections net of senior fees / interest due on classes senior to and including c   trigger default: A 1.20, B 1.10, C 1.05, D 1.02
```

(For a deal the sponsor may set trigger values within ±0.10 of defaults; ratings react to them.)

Event of default: senior class interest unpaid for 2 consecutive payment dates → status `DEFAULTED`; acceleration (all cash pays the most senior class); senior holders > 50% may vote to liquidate the pool (assets sold at 07 whole-loan market prices).

#### §3.3.9 Defaults, recoveries and losses

When 07/10 emits `loan.defaulted` for a pool asset, its balance moves to "defaulted" (non-performing, out of OC numerator). Recoveries arrive on 07's workout schedule (`loan.recovery`). The loss is recognized at final recovery or at `PARAM.sec_chargeoff_days = 182` game days after default, whichever is first (remaining balance charged off; later recoveries are paid as principal collections). For cohort assets, 07 reports the number and balance of defaulted loans per day.

#### §3.3.10 Servicer, clean-up call, maturity

- Servicer fee `PARAM.sec_servicer_fee_bps = 25` per game year. If the servicer becomes insolvent or misses two remittances, senior holders (> 50%) may replace it with an NPC servicer (`fund.sec.replaceServicer`); fee then 40 bps.
- Clean-up call: when pool balance ≤ `cleanUpCallPct` (default 0.10) of original, the sponsor may buy the remaining pool at par of outstanding tranches plus accrued interest (`fund.sec.callDeal`).
- At legal final maturity, any unpaid principal is written off.

#### §3.3.11 Model prices and secondary trading

06 asks this module for a model price per tranche each day (Level 2):

```
spread_model = EL_ad / WAL × riskPremiumMult + liquidityPremium
riskPremiumMult = PARAM.sec_risk_premium_base (1.8) × (1 + 1.5 × fear)
liquidityPremium = PARAM.sec_liq_premium_bps (20) × (1 + 4 × fear) × (seniority-adjusted: equity ×3, mezz ×1.5, senior ×1)
EL_ad computed with ρ_market = clamp(ρ̂_market + 0.3 × fear, 0.03, 0.6) and PD from the pool's current 07 pd estimates
price = PV of projected cash flows (scenario at expected CDR/CPR) discounted at curve + spread_model
```

Dealer quotes (NPC, §6.3) are posted around the model price with half-spread `PARAM.sec_dealer_halfspread_bps = 25 × (1 + 3·fear)`. Players trade at quotes via RFQ or in the weekly auction. CDS on tranches is offered by 06 with this module's losses as the credit event (writedown or interest shortfall > 2 payment dates).

#### §3.3.12 Deal reporting (public)

On each payment date a `DealReport` is published (PUBLIC): pool balance, 30-day delinquency, defaults and losses this period, constant default rate (CDR, annualized), prepayment rate (CPR), OC/IC by class, tranche balances and ratings. Pool loan-level data (borrower identities) are never published; only aggregates, so no player's loans or mortgages are exposed (L11).

### §3.4 Rating agencies

#### §3.4.1 The agencies

Three NPC agencies (names in 22; DEFAULT names below), each a 16 named actor with a balance sheet, revenue from issuer fees, and a parent company:

| Agency | Style | pdMultiplier | rhoAssumptionBase | lookbackDays | stressWeight | Initial leniency | Parent |
|---|---|---|---|---|---|---|---|
| Sterling & Vane Ratings | CONSERVATIVE | 1.15 | 0.12 | 1,092 (3 game years) | 0.35 | 0.00 | private (dynasty-owned, 16) |
| Meridian Credit Opinion | MODERATE | 1.00 | 0.08 | 728 (2 game years) | 0.20 | 0.05 | listed NPC company |
| Orion Ratings Service | ISSUER_FRIENDLY | 0.90 | 0.05 | 546 (1.5 game years) | 0.10 | 0.10 | listed NPC company |

Players cannot own or charter a rating agency (DEFAULT, Mathis may override: an issuer-owned agency would be a structural conflict). A player may hold at most `PARAM.rating_parent_max_stake = 0.099` of a listed parent; larger orders are blocked by 05 position caps for this issuer.

#### §3.4.2 Grade scale and PD mapping

Annual PD anchors (log-linear interpolation between anchors for the +/− notches):

| Grade | AAA | AA | A | BBB | BB | B | CCC | CC | C | D |
|---|---|---|---|---|---|---|---|---|---|---|
| PD per game year | 0.0001 | 0.0003 | 0.0008 | 0.0025 | 0.010 | 0.040 | 0.15 | 0.30 | 0.50 | defaulted |

Notch PDs: for grade g with neighbours, `pd(g+) = pd(g)^(2/3) × pd(better)^(1/3)` and `pd(g−) = pd(g)^(2/3) × pd(worse)^(1/3)`. Mapping a PD to a grade picks the grade whose PD is nearest in log space. Investment grade = BBB− or better.

#### §3.4.3 Methodologies

Every methodology yields a score `z`, a `PD = σ(z)` (or a direct PD), then `PD_agency = PD × pdMultiplier × (1 + stressWeight × (stressFactor − 1))`, with `stressFactor = 2.0` for corporates, banks and insurers and `1.6` for sovereigns, and finally the grade by §3.4.2. Inputs come only from public or regulator-reported data (03 statements, 04 macro, 07 bank reports, 13 records); agencies never use private player information.

| Kind | Score (DEFAULT coefficients; 20 calibrates) |
|---|---|
| SOVEREIGN | `PD = 04.sovereignPD(govId)` (04 owns the fiscal model: debt/GDP, deficit, FX reserves, rollover need, inflation, political risk). Agencies then apply their multiplier and stress |
| CORPORATE / BOND_ISSUE | `z = −5.8 + 0.9·ln(1 + Debt/EBITDA_ann) − 0.6·ln(1 + ICR) − 0.25·ln(1 + Revenue_ann / $100M) + 2.0·marginVol + sectorRisk + 0.15·S3plusConvictions_3y + 1.5·fear`. `marginVol` = stdev of quarterly operating margin over 8 quarters; `sectorRisk` from 22 (−0.3 utilities … +0.6 airlines/biotech). Issue ratings: senior secured +1 notch, subordinated −2 notches vs issuer |
| BANK | `z = −5.2 + 30·max(0, 0.12 − CET1) + 8·NPL − 4·max(0, LCR − 1) + 3·depositConcentration + 1.2·fear − 0.3·ln(1 + assets / $10B)` (inputs from 07 reports) |
| INSURER_FSR | `z = −5.0 − 2.0·ln(solvencyRatio) + 1.5·max(0, PML200/capital − 0.3) + 2.0·max(0, combinedRatio_1y − 1) − 0.5·reinsuranceQuality + 1.0·fear` (reinsuranceQuality = recoverables-weighted average of reinsurer PD rank in [0,1], 1 = all AA or better) |
| TRANCHE | §3.3.4 with the agency's `PD̂ × pdMultiplier` and `ρ_agency = max(rhoAssumptionBase, ρ̂) × (1 − leniency)`; grade from `pdAnn` |
| CAT_BOND | grade from annual expected loss `EL` using the same PD table (EL treated as PD) |
| FUND_MMF | AAAm if WAM ≤ 50, weekly liquid ≥ 0.35 and all holdings ≥ A; AAm if WAM ≤ 60 and liquid ≥ 0.30; Am otherwise; withdrawn on a broken buck |
| FUND_CREDIT | weighted average holding PD × (1 + 0.5 × (leverage − 1)) → grade (fund ratings carry an "f" suffix in UI only) |

#### §3.4.4 Leniency, conflict and reputation

Each game quarter, for each agency:

```
conflict    = structuredRevenueShare (trailing 364 game days)
pressure    = share of structured deals in that window that published a rival's rating but not this agency's
leniency'   = clamp(leniency + 0.05 × (pressure − 1/3) × (1 + conflict) − 0.10 × reputationShock, 0, PARAM.rating_max_leniency (0.5))
reputation' = clamp(reputation + 2 − 20 × max(0, cohortDefaultRatio − 1.5) − 3 × multiNotchDowngrades_q, 0, 100)
   cohortDefaultRatio = realized defaults / defaults implied by the agency's ratings over the trailing 2 game years
   reputationShock = 1 if reputation fell ≥ 10 this quarter, else 0
```

If reputation < `PARAM.rating_review_threshold = 40`, the bloc regulator (13) opens a review: leniency is forced to 0 for 364 game days and methodology parameters revert to CONSERVATIVE values for that period. Reputation is public.

#### §3.4.5 Process, fees and shopping

- Solicited ratings: `fund.rat.request { subjectId, agencyIds }` by the issuer. Fee per agency `PARAM.rating_fee_bps = 5` of the issue size (min $25,000) for tranches and bonds, `PARAM.rating_fee_issuer = $250,000` per game year for an issuer rating; paid on request (TRANSFER to the NPC agency's balance sheet, which is outside the player economy → class SINK, code `RATING_FEE`).
- Each agency processes at most `analystCapacityPerDay` (default 10) requests per game day, FIFO; turnaround 3 game days after the request reaches the head of the queue.
- The preliminary result is private to the issuer (`fund.rat.preliminary`, PRIVATE). `fund.rat.publish { ratingId, publish: true|false }`. Unpublished ratings are never shown to anyone else.
- Rating shopping is legal by default. Regulator parameter `PARAM.rating_disclose_preliminary = false`; when 16's politics sets it true, every solicited preliminary rating must be disclosed as "requested" (agency name, no grade) on the deal page. This is a policy lever players can lobby for or against (16).
- Unsolicited ratings (PUBLIC, no fee): every sovereign; every company with listed bonds; every bank and insurer with assets ≥ $1B; every NPC-issued tranche.
- Appeal: `fund.rat.appeal` once per rating action, re-reviewed in 3 game days; the agency changes the grade only if the inputs changed.

#### §3.4.6 Surveillance

Every rating is reviewed each game quarter, and immediately when the subject's score implies a grade ≥ 2 notches away: the rating goes on WATCH (public) and is resolved within `PARAM.rating_watch_days = 10` game days. A single action moves at most 3 notches, except a move to D on default or to CCC on a missed payment. Outlook: NEGATIVE if the score implies 1 notch worse, POSITIVE if 1 better, else STABLE. Every action is a PUBLIC `fund.rat.action` event (16 news).

#### §3.4.7 Composite rating and cliff effects

Mechanics use the composite: median of published ratings (two ratings: the worse; one: that one; none: `NR`). Consumers (each owner defines its own table; the thresholds below are the contract this module promises to support):

| Consumer | Rule |
|---|---|
| 07 repo haircuts, bank risk weights, CCP collateral eligibility | by composite grade; NR treated as BB− |
| MMF eligibility (§3.1.19) | ≥ A− |
| Insurer admissible assets (§3.5.5) | bonds ≥ BBB− count fully; BB at 50%; below B not admissible |
| Fund mandates | optional `ratingFloor` per mandate; breach on downgrade = must sell within 20 game days |
| NPC investment-grade-only buyers (§6.3) | "fallen angel": on a downgrade below BBB−, they sell over `PARAM.fallen_angel_sell_days = 20` game days at ≤ 10% of ADV per day |
| Indices (§3.2.6) | IG and HY indices re-classify at the next rebalance |

These cliffs are the gameplay: a one-notch downgrade can force sellers, raise funding costs and trip covenants (09 §3.12).

#### §3.4.8 Influence: lawful and unlawful

Lawful: paying fees, choosing which ratings to publish, improving the inputs (deleveraging, raising capital, buying reinsurance), lobbying for methodology or disclosure changes (16), publishing research that disputes a rating (15 publication). Unlawful: the abstract espionage verb "Sway an analyst" (12 owns resolution) that, if it succeeds, improves one pending rating by up to 2 notches; it leaves evidence (12/13) and if proven is S5 for the issuer and a −20 reputation hit for the agency. No real-world technique is described or needed.

### §3.5 Insurance and reinsurance

#### §3.5.1 Lines of business

| Line | Covers (loss source module) | Standard exclusions | Default deductible | Settles after | Available to |
|---|---|---|---|---|---|
| PROPERTY | physical damage to `prop` and `biz` premises from FIRE, STORM, FLOOD, QUAKE, WILDFIRE, UNREST (10, 09, §3.5.6) | wear and condition decay, war (except UNREST if endorsed), assets with a provenance flag | 10% | 3 game days | owners of prop/biz |
| BUSINESS_INTERRUPTION | lost operating profit while a business is closed by an insured physical peril (09 reports `biDays` and lost profit) | closures by court, regulator, strike, owner choice; first 1 game day (waiting period) | 10% | 3 game days | biz owners |
| CYBER | cash loot, forensic cost, restore time from 12 breach events | fines, own crimes, losses on surface units left at coverage < 0.5 (12), ransom | 10% | 1 game day | any entity with a 12 attack surface |
| RANSOMWARE_BI | lost business income while paused by a 12 ransomware op, capped at 3 game days | ransom payments (never insurable) | 10% | 1 game day | biz, lab owners |
| COLLECTIBLES | theft (12 E5), fire, flood of lifestyle items (14) | items with a provenance flag | 10% | 3 game days | item owners |
| MODEL_IP | replacement cost of a stolen model (13 damages basis), up to limit | models with no watermark (11) | 10% | 7 game days | lab owners |
| LEGAL_EXPENSE | counsel fees as defendant or claimant (13) | fines, restitution, Held time | 10% | on invoice | anyone |
| PRODUCT_LIABILITY | judgments and settlements for product defects of the holder's businesses (09 product events, 13 verdicts) | intentional misconduct, fines | 10% | after verdict / settlement | biz owners |
| DIRECTORS_OFFICERS | defence costs and damages in suits against directors and fund managers (13 shareholder, derivative and class actions) | fraud proven at trial (then the insurer claws back paid defence costs), fines | 10% | after verdict / settlement | cmp, fnd |
| TRADE_CREDIT | unpaid receivables when a B2B customer defaults (09 §3.9, 07) | related-party customers, receivables > 91 game days overdue at bind | 10% | 14 game days after default | cmp/biz |
| KEY_PERSON | profit loss when a named key staff member is poached or leaves (09 §3.6, 12 E3) | voluntary dismissal by holder | 10% | 7 game days | cmp/biz/lab |
| MARINE_CARGO | goods in transit lost in STORM or logistics events (09 supply chain) | delay without loss | 10% | 3 game days | logistics and trading businesses |
| ENERGY_ASSET | wells, plants, refineries, farms (09 energy businesses) outages and damage | regulatory shutdowns | 10% | 7 game days | energy biz |
| CONSTRUCTION_ALL_RISK | damage to developments under construction (10), including cost overrun from insured perils | design changes, delays from financing | 10% | 7 game days | developers |
| PROFESSIONAL_INDEMNITY | negligence claims against service businesses (accounting, law, security, PM agencies; 09) | fraud | 10% | after verdict | service biz |
| HH_PROPERTY, HH_MOTOR, HH_LIFE | aggregate household books (16 hh sector), NPC insurers only | n/a | n/a | aggregate | hh |

Rules common to all lines:
- Insurable interest: the holder must own the insured ref, or hold a contractual interest in it through a 15 contract (lender, lessee), at bind and at loss. No policy on assets one does not own or finance (this keeps insurance from becoming a bet, L5).
- The limit is an annual aggregate; when `aggregatePaid = limit` the policy is EXHAUSTED until renewal.
- "Other insurance": if several policies cover one loss, each pays `loss × limit_i / Σ limits` up to its limit; total recovery never exceeds the loss.
- A deductible is `max(deductiblePct × grossLoss, deductibleMin)` with `deductibleMin = PARAM.ins_deductible_min = $500`; `deductiblePct ≥ PARAM.insurance_deductible_pct = 0.10` (so insured players still feel a loss, 03 §11.2).

#### §3.5.2 Pricing

Every quote, NPC or player, is built from the same components:

```
premium_annual = EL_est × load × history × rep × posture × cycle + expenseLoad + catLoad
EL_est   = EL_true × exp(ε),  ε ~ N(0, σ_q²) from stream 'ins:quote:<insurerId>:<holderId>:<line>',  σ_q = PARAM.ins_model_err (0.30) × (1 − modelQuality)
EL_true  (line-specific, engine-computed, never shown exactly):
   PROPERTY  = insuredValue × (Σ_perils λ(city,peril) × E[DR | peril] × vuln) + insuredValue × fireRate × E[DR_fire]
   BI        = dailyProfit_90d × E[biDays per game year]
   CYBER     = Σ_units value × p_breach_est × p_loss_given_breach                (12 supplies the estimates, 03 §11.2)
   LIABILITY = revenue_ann × productRate(sector)                                 (22 table, e.g. 0.002 food, 0.008 pharma)
   D&O       = suitFreq(listed?, size, convictions) × meanSeverity                (13 statistics, updated quarterly)
   TRADE_CREDIT = receivablesAvg × PD(customer composite rating) × 0.6
   others    = limit × base rate from 22 (KEY_PERSON 0.03, MARINE_CARGO 0.004 × cargo value, MODEL_IP p_theft × replacement)
load     = NPC: 1.35 cyber (Aegis, 03 §11.2), 1.30 property, 1.40 liability/D&O, 1.25 trade credit; player insurers set any load ≥ 1.0
history  = min(2.0, 1 + 0.25 × claims by this holder in the last 1,344 game days)
rep      = 1.20 if holder Reputation < 30; 1.00 for 30–70; 0.85 above 70 (14; Reputation lowers premiums, MASTER-BIBLE decision 5)
posture  = cyber: 0.8 if 12 coverage ≥ 1 and patch ≥ 1.0, else 1.0; property: 0.9 if condition ≥ 70, 1.0 if 40–70, 1.3 if < 40
cycle    = clamp(1 + 0.8 × (industryLossRatio_1y(lineGroup) − PARAM.ins_target_lr (0.65)) / 0.65, 0.85, 1.60)   (hard/soft market)
expenseLoad = PARAM.ins_expense_fixed ($50 per policy per game year) + 0.05 × EL_est
catLoad  = for peril-exposed lines: 0.10 × marginal PML200 contribution of this policy to the insurer (§3.5.6)
```

Premiums are billed DAILY by default (posted at day close, `INS_PREMIUM`); UPFRONT billing earns a 3% discount. Unpaid premium: 3 game days grace, then the policy LAPSES (no cover from the lapse tick). World hack rate raises cyber `EL_true` for everyone through 12's `p_breach_est` (01 §7.4).

#### §3.5.3 Quote, bind, renew, cancel

1. `fund.ins.requestQuote { line, insuredRefs, limit, deductiblePct, termDays }` (term 91 or 364 game days). The request goes to all NPC insurers of the holder's bloc and to every player insurer whose appetite (`LineAppetite`) matches; holder identity, insured refs, values and loss history are visible to quoting insurers (needed to price; PARTIES visibility). Nothing else about the holder is shared.
2. NPC insurers quote in the same tick (P8). Player insurers auto-quote by their appetite rules (load, max limit, regions) in the same tick, or, if they set `manualQuotes`, within 1 game day.
3. Quotes are valid for 1 game day. `fund.ins.bind { quoteId }` creates the policy from the next tick. Moratorium: no new PROPERTY / BI / CONSTRUCTION cover including a peril under an active warning for the insured's city can be bound (§3.5.6); renewals of existing cover are allowed.
4. Auto-renew requotes at the renewal tick with current inputs; the holder can switch insurer at renewal.
5. Cancellation by holder: pro-rata premium refund minus 10% short-rate fee. Cancellation by insurer: only at renewal, or for non-payment, or for proven fraud.

#### §3.5.4 Claims

```
on engine loss event E (12 breach/loot, 09 business damage/BI, 10 property damage, 13 verdict/fees, 07/09 customer default, 14 theft):
  for each BOUND policy P with insuredRef ∈ E.subjects, peril(E) ∈ P.perils, P.startTick ≤ E.tick < P.endTick:
     grossLoss = E.lossAmount for P's insured ref        (engine-determined; no player estimate exists)
     if exclusion applies → claim DENIED with reason code
     deductible = max(P.deductiblePct × grossLoss, P.deductibleMin)
     covered    = min(grossLoss − deductible, P.limit − P.aggregatePaid)  then apply "other insurance" pro rata
     claim OPEN, reserve = covered, settleDueTick = E.tick + settleDays(line)
     fraudScore = 19.collusionScore(holder, E.attacker?) + 0.3 × [holder bound or raised cover in the 7 game days before E] + 0.3 × [E's counterparty shares a cluster with holder]
     if fraudScore ≥ PARAM.ins_fraud_review (0.6) → FRAUD_REVIEW: 13 opens a review (≤ 14 game days); cleared → APPROVED; not cleared → DENIED and S4 case (insurance fraud, 03 §11.3)
  at settleDueTick: insurer pays covered (INS_CLAIM_*), aggregatePaid += covered, reinsurance recoveries computed (§3.5.8)
```

Claims for losses with no automatic engine event (rare: e.g. a negotiated settlement) use `fund.ins.fileClaim` with the event id; the engine verifies the event and amount. Disputes: `fund.ins.disputeClaim` opens a 13 civil case; the court reads the policy and the event log.

Cyber-pandemic sublimit: during a 12 zero-day world event, NPC insurers cap payouts per policyholder at `PARAM.ins_pandemic_sublimit = 0.25` of the limit (03 §11.2). Player insurers may include or exclude a pandemic sublimit in their appetite.

#### §3.5.5 Reserving, investments and accounts

- Premium is earned pro rata daily; `unearnedPremiumReserve` holds the unearned part of upfront premiums.
- Case reserves = Σ open claim reserves.
- IBNR (incurred but not reported; covers losses from events that occurred but whose claims settle later, mainly liability and D&O) per line per game quarter: `IBNR = max(0, earnedPremium_q × ELR_line − (paid_q + case_q))` where `ELR_line` = the insurer's priced expected loss ratio (EL_est / premium averaged); released as claims settle (Bornhuetter–Ferguson simplified).
- Invested assets: player insurers invest their float through normal 05/06 intents; admissibility: assets ≥ 100% of technical reserves (UPR + case + IBNR) must be held in cash, bills, government bonds and bonds ≥ BBB− (BB at 50%), listed equities at most 30% of admissible assets. A shortfall makes the insurer RESTRICTED (§3.5.7).
- Insurer statements (03): premiums written and earned, losses incurred, expense ratio, combined ratio, investment income, reserves, capital.

#### §3.5.6 Catastrophe model

Natural perils rolled by this module (P3, at t = 0 of each game day, through 16's scheduler hook `rollCatastrophes(day)`):

| Peril | Frequency class per city (22 assigns; DEFAULT λ per game year) | Telegraphed? | Damage curve `d_max, I50, s` | Typical footprint |
|---|---|---|---|---|
| STORM | HIGH 0.30, MED 0.12, LOW 0.03 (coastal cities only) | yes: warning 1–3 game days ahead, intensity forecast ± 1.0 | 0.60, 7.5, 0.8 | coastal districts, then inland at I ≥ 7 |
| FLOOD | HIGH 0.20, MED 0.08, LOW 0.02 (river and coastal) | 1 game day warning for river floods; none for flash floods (50/50) | 0.50, 7.0, 1.0 | low-lying districts (10 flags) |
| QUAKE | HIGH 0.06, MED 0.02 (Pacific League cities and 22-flagged faults) | no | 0.80, 8.0, 0.7 | city-wide, damage decays from epicentre district by 0.15 per district hop |
| WILDFIRE | HIGH 0.25, MED 0.08 (Southern Coalition and 22-flagged) | yes: 1 game day | 0.70, 7.5, 0.9 | peripheral and hill districts |

Generation for each city and peril with λ > 0:

```
p_day = 1 − exp(−λ × cycleClimateMult / 364)        cycleClimateMult = 1.0 (DEFAULT; 16 eras may change it)
if U < p_day:  intensity I = min(10, 3 + Exp(rate = PARAM.cat_intensity_rate (0.9)))      → P(I ≥ 5) = e^(−1.8) ≈ 0.17, P(I ≥ 7) = e^(−3.6) ≈ 0.027
   footprint districts per the table; centre district drawn weighted by insured exposure
   damage ratio per asset: DR = d_max × σ((I_d − I50)/s) × vuln × (1 − mitigation)
      I_d = I − 0.15 × hops from centre (QUAKE), I for others within footprint
      vuln = 1.3 − 0.6 × condition/100 (10, 09 condition)
      mitigation ∈ [0, 0.5] from 10 property upgrades (flood barriers, retrofits)
   industryLoss = Σ insured assets in footprint × DR (insured value only)
   biDays (for businesses with DR ≥ 0.05) = ceil(DR × PARAM.cat_bi_days_per_dr (20)) game days
emit fund.cat.event (PUBLIC) → 10 applies physical damage, 09 applies closures, this module opens claims
```

All draws use streams `cat:<peril>:<cityId>` (02). Telegraphed perils first emit `fund.cat.warning` with a forecast intensity `I + N(0, 1)` clipped to [3, 10] and a landfall day; the actual event is drawn at warning time and then fixed (the forecast error is real; news in 16).

Non-natural catastrophes are emitted by other modules and only aggregated here: `CYBER_PANDEMIC` (12 zero-day world event), `UNREST` (16 political events / 04 crises), `CONTAGION` (16 health event; BI-heavy). Their `industryLoss` is the sum of claims they trigger.

PML200 (for solvency and catLoad): at each game-week end, the engine evaluates every insurer's current net exposure per (city, peril, line) against a fixed stochastic event set of `PARAM.cat_eventset_years = 2,000` simulated years generated once per chapter from stream `cat:eventset:<chapter>` with the same frequencies and severities. `PML200` = 99.5th percentile of simulated annual net loss (after reinsurance per treaty terms). The event set is a model of the world's own rules, so a well-capitalised insurer survives most real years.

#### §3.5.7 Solvency and failure

```
R_prem   = Σ_lines premiumRiskFactor_line × netPremiumEarned_1y          (factors in 22: 0.10 property … 0.30 cyber, 0.25 D&O)
R_res    = 0.10 × net technical reserves
R_cat    = PML200
R_mkt    = 0.39 × equities + 0.12 × corporate bonds × modified duration / 5 + 0.05 × government bonds × duration / 5 + 0.25 × FX-unhedged assets
R_cred   = Σ reinsurance recoverables × PD(reinsurer composite rating) × 0.5 × 10    (stress multiple 10)
SCR      = sqrt( Rᵀ · C · R ) over R = (R_prem + R_res, R_cat, R_mkt, R_cred), C = [[1,.25,.25,.5],[.25,1,.25,.5],[.25,.25,1,.25],[.5,.5,.25,1]]
minCapitalFloor = max(PARAM.ins_min_capital ($1,000,000), PARAM.ins_limit_floor_pct (0.20) × Σ net retained per-policy limits on CYBER, RANSOMWARE_BI, MODEL_IP, COLLECTIBLES, LEGAL_EXPENSE)
solvencyRatio = capital / max(SCR, minCapitalFloor)
```

The 20%-of-limits rule of 03 §11.3 is kept as the floor for the conflict-related lines it was written for, measured net of reinsurance (DEFAULT: applying it to property limits would make property insurance impossible; reinsurance relief is the intended counter).

| Solvency ratio | Status | Effect |
|---|---|---|
| ≥ 1.0 | ACTIVE | normal |
| 0.75 – 1.0 | RESTRICTED | no new policies (renewals allowed), dividends blocked, 28 game days to file a recovery plan (raise capital, buy reinsurance, shrink) |
| 0.0 – 0.75 | RUNOFF (regulator order, 13) | no new or renewed policies; existing ones run to expiry |
| < 0, or a due claim cannot be paid within 1 game day | INSOLVENT → RESOLVED | resolution below |

Resolution of an insolvent insurer: the bloc regulator (13) appoints the bloc's NPC bridge insurer; policies continue to expiry under the bridge; claims are paid by the bloc's Policyholder Guarantee Scheme at `PARAM.pgs_cover_pct = 0.80` up to `PARAM.pgs_cap_per_claim = $10,000,000` per claim; the owner's equity is wiped; remaining assets are realized and paid to the scheme and creditors by absolute priority (09 §3.16 rules); 13 investigates the owner. The scheme is funded by an annual levy of `PARAM.pgs_levy = 0.005` of gross written premium on all insurers in the bloc (up to 0.02 in emergency years). Levies paid by player insurers are SINKs; PGS payouts to players are FAUCETs only to the extent the levy pool came from NPC insurers (03 classification).

#### §3.5.8 Reinsurance

Treaty types and recovery math:

| Type | Recovery on a claim / event of size X (cedent net before treaty) |
|---|---|
| QUOTA_SHARE | `cessionPct × X`; reinsurer receives `cessionPct × premium`, pays a ceding commission `cedingCommissionPct` (default 0.30) of ceded premium |
| SURPLUS | cession share = `max(0, (limit_i − retention) / limit_i)` per policy, capped at `limit` lines |
| PER_RISK_XOL | `min(limit, max(0, X_risk − retention))` per risk |
| CAT_XOL | `min(limit, max(0, X_event − retention))` per event (event = one `CatEvent` or one 12 world event, aggregated over 7 game days) |
| STOP_LOSS | on the annual loss ratio: `min(limit, max(0, lossRatio − attachLR) × premium)` |

Pricing by NPC reinsurers: `premium = 1.5 × EL_layer × cycle` (03 §11.3's "1.5× expected loss"), with `EL_layer` computed from the event set (CAT_XOL) or from the cedent's book (others). XOL layers have `reinstatements` (default 1) at a reinstatement premium of `ROL × limit × (recovered / limit)`. Player reinsurers (`isReinsurer`, rank ≥ R5, capital ≥ `PARAM.reins_min_capital = $500,000,000`) quote treaties to any cedent. A reinsurer's insolvency turns its recoverables into claims in its resolution (§3.5.7), which feeds `R_cred` of every cedent.

#### §3.5.9 Catastrophe bonds

1. A sponsor insurer (rank ≥ R4, LIC4) issues a cat bond through an SPV: `fund.ins.sponsorCatBond { peril, regions/cities, trigger, attachment, exhaustion, principal, termDays }`, term `PARAM.catbond_term_days = 728` game days (2 game years) by default.
2. Investors buy at par in a 1-game-day book-build (same uniform clearing as §3.3.6, bids by spread). Principal is held as collateral in 3-month bills of the bond's currency (04), rolled at maturity.
3. Coupon each game quarter = bill yield + spread on outstanding principal, paid from the bills' yield plus the sponsor's premium.
4. Trigger variable X: INDEMNITY = the sponsor's own net losses from qualifying events in covered regions (only policies bound ≥ 28 game days before the event count, to block exposure stuffing); INDUSTRY_INDEX = Σ `industryLoss` of qualifying events; PARAMETRIC = the event intensity at the named city. Loss fraction `f = clamp((X − attach) / (exhaust − attach), 0, 1)` per risk period (annual aggregate for INDEMNITY and INDUSTRY, per event for PARAMETRIC). Determined: PARAMETRIC 1 game day after the event, INDUSTRY 14 game days, INDEMNITY 28 game days.
5. `f × outstanding` is released from collateral to the sponsor (`CATBOND_PAYOUT`, TRANSFER); outstanding reduces. At maturity the remaining collateral returns to holders.
6. Model: `expectedLossAnnual` computed from the event set (published). NPC cat-bond buyers (16 cat funds and pensions) demand `spread ≥ max(PARAM.catbond_min_spread_bps = 150, EL × multiple)`, multiple = 2.5 in a soft market rising to 4.0 when `cycle` ≥ 1.4.
7. Cat bonds are 06 instruments (class `CAT_BOND`, LIC4), tradeable by RFQ and in the weekly auction.

### §3.6 Systemic dashboards, ledger codes and money classification

#### §3.6.1 Public systemic indicators (published each game day at t = 719; 17 renders the "Systemic Risk" panel, 15 includes them in the Wire digest)

| Indicator | Definition |
|---|---|
| Fund leverage | AUM-weighted gross leverage of all funds, and of hedge funds alone |
| Redemption pressure | Σ redemptions requested today / Σ NAV, all open-ended funds; count of GATED/FROZEN funds |
| ETF dislocation | AUM-weighted average |premium|, and the five worst discounts (names only) |
| MMF stress | min shadow NAV across MMFs; hh MMF outflows today |
| Structured credit | average AAA, A, BBB, BB tranche model spreads by deal type; 30-day delinquency and CDR of all pools; count of OC/IC breaches |
| Ratings drift | net downgrades last 7 game days by kind; fallen angels this quarter |
| Insurance | industry solvency ratio (premium-weighted), insurers RESTRICTED/RUNOFF/INSOLVENT, industry loss year-to-date, `cycle` per line group |
| Cat bonds | outstanding, triggered this chapter |

All are aggregates; no indicator identifies a player's positions (L11).

#### §3.6.2 Reason codes introduced by this module (03 registers them; class fixed per code)

| Code | Class | Flow |
|---|---|---|
| `FUND_SUB_ESCROW` / `FUND_SUB_REFUND` | TRANSFER | investor ↔ escrow |
| `FUND_SUB_ISSUE` / `FUND_REDEEM_PAY` | TRANSFER | escrow → fund / fund → investor |
| `FUND_MGMT_FEE`, `FUND_PERF_FEE` | TRANSFER | fund → manager (player-owned capital share) |
| `FUND_MGMT_FEE_NPC`, `FUND_PERF_FEE_NPC` | FAUCET | fund → manager (NPC-owned capital share) |
| `FUND_CUSTODY_FEE` | SINK | fund → CCP |
| `FUND_ANTI_DILUTION` | TRANSFER | investor → fund |
| `FUND_CARRY` | TRANSFER (FAUCET on NPC LP share) | closed-end fund → GP |
| `ETF_CU_FEE`, `ETF_FAIL_FEE` | TRANSFER | AP → fund |
| `SEC_SALE_PROCEEDS` / `SEC_SALE_PROCEEDS_NPC` | TRANSFER / FAUCET (NPC buyers paying for tranches is the NPC side of a sale, exactly like an NPC fill on 05; the loans leave the player economy in exchange) | buyers → SPV → sponsor |
| `SEC_COUPON`, `SEC_PRINCIPAL` | TRANSFER between player entities; FAUCET when paid to players from an NPC-originated pool's cash flows; SINK when a player SPV pays NPC holders | SPV → holders |
| `SEC_SERVICER_FEE`, `SEC_TRUSTEE_FEE` | TRANSFER / SINK (to NPC trustee) | SPV → servicer / trustee |
| `RATING_FEE` | SINK | issuer → NPC agency |
| `INS_PREMIUM` / `INS_PREMIUM_NPC` | TRANSFER (player insurer) / SINK (to NPC insurer) | holder → insurer |
| `INS_CLAIM` / `INS_CLAIM_NPC` | TRANSFER / FAUCET (from NPC insurer; 01 §8.1) | insurer → holder |
| `INS_REINS_PREMIUM`, `INS_REINS_RECOVERY` | TRANSFER (player↔player) / SINK / FAUCET (to/from NPC reinsurer) | cedent ↔ reinsurer |
| `PGS_LEVY`, `PGS_PAYOUT` | SINK / FAUCET | insurer → scheme / scheme → holder |
| `CATBOND_COUPON`, `CATBOND_PAYOUT`, `CATBOND_REDEMPTION` | TRANSFER / SINK / FAUCET by counterparty kind | |

General rule this module assumes from 03: any flow between a player-economy entity and an NPC entity uses the `_NPC` variant of the code, whose class is FAUCET (NPC → player) or SINK (player → NPC); flows inside the player economy are TRANSFER. Where a single code is listed with two classes above, 03 registers two codes with the `_NPC` suffix for the NPC side.

---

## §4 Player intents

All intents use the 00 §5.5 envelope, namespace `fund.*`, and are validated in P1 (licenses, charters, holds, Held state, balances, rate limits). Effects run in P8 unless stated. Every rejection returns a rule code to the actor only. Humans, AI operators and delegated managers use the same intents.

### §4.1 Funds

| Kind | Payload | Validation | Effect |
|---|---|---|---|
| `fund.create` | `{ name, kind, structure, strategy, baseCcy, mandate: FundMandate, fees: FeeSchedule, gate, lockupDays, noticeDays, transparency, managerId, targetAum, closedEnd?: { commitmentsTarget, waterfall, termDays } }` | §3.1.1 requirements; fees within caps; mandate limits within §3.1.8 caps; name passes 21 moderation and is unique; ≤ 5 live funds per sponsor; managerId is self, own hired NPC manager, or own AI model (11) | fund created FUNDRAISING (§3.1.2) |
| `fund.seed` | `{ fundId, amount }` | actor = manager; amount ≥ §3.1.2 minimum | subscription flagged manager stake |
| `fund.subscribe` | `{ fundId, amount }` | §3.1.5 checks that can be done now (license, cash, fund ACTIVE, age, link); the rest at strike | escrow; units at strike |
| `fund.redeem` | `{ fundId, units? , amount? , inKind?: boolean }` | holds units; not locked up; in-kind only if ≥ 10% holder | §3.1.6 |
| `fund.cancelRequest` | `{ reqId }` | before the dealing cutoff of its dealing day | escrow refunded / request removed |
| `fund.commit` | `{ fundId, amount }` | closed-end fund in FUNDRAISING; investor checks of §3.1.5 | commitment recorded |
| `fund.capitalCall` | `{ fundId, amount, dueInDays ≥ 10 }` | manager; investment period or follow-on reserve; ≤ undrawn | call notices to LPs |
| `fund.distribute` | `{ fundId, amount }` | manager; cash available | waterfall distribution (§3.1.18) or pro-rata (SWF) |
| `fund.updateMandate` | `{ fundId, mandate }` | manager; within caps | pending change after 24 game days; gate-free window |
| `fund.updateFees` | `{ fundId, fees }` | within caps | increase: 24-game-day notice; cut: immediate |
| `fund.setTransparency` | `{ fundId, level }` | manager | effective next day; lowering takes 7 game days |
| `fund.sidePocket` | `{ fundId, assetIds[] }` | assets are Level 3; total side pockets ≤ 25% NAV | §3.1.9 |
| `fund.close` | `{ fundId }` | manager | wind-down (§3.1.11) |
| `fund.trade` | the normal `mkt.*` order payload with `onBehalfOf: fundId` | actor is the fund's manager or its AI operator; §3.1.8 checks | order enters 05 as the fund |
| `fund.transferInterest` | `{ fundId, toId, units | commitmentShare, price }` | closed-end only; GP consent (a 15 contract signature) | interest moves; 2% P2P tax (15) |
| `fund.hireManager` | `{ fundId, npcCandidateId | modelId }` | sponsor; candidate from 09 §3.6 labour market or own model | operator changes after 1 game day |
| `fund.allocateNpcRival` | `{ npcFundId, amount }` | player investing in an NPC rival fund (N5); same investor checks | subscription into the NPC fund |

### §4.2 ETFs and indices

| Kind | Payload | Validation | Effect |
|---|---|---|---|
| `fund.etf.defineIndex` | `IndexDef` minus computed fields | sponsor of an ETF-capable fund; §3.2.6 guards | index created; first constituents computed at next t = 719 |
| `fund.etf.launch` | `{ fundId, indexId? , active, leverage, creationUnit?, inKind, fees }` | fund kind ETF, seeded ≥ $2,500,000 (`PARAM.etf_min_seed`) | 06 lists the ETF instrument next session; status ACTIVE |
| `fund.etf.registerAp` | `{ etfId, dailyCuLimit }` | LIC4 + CH_EXCHANGE_MEMBER | AP registered |
| `fund.etf.create` | `{ etfId, cus }` | registered AP, ≤ daily limit, before cutoff | settles at t = 719 (§3.2.2) |
| `fund.etf.redeem` | `{ etfId, cus }` | same | same |

### §4.3 Securitization

| Kind | Payload | Validation | Effect |
|---|---|---|---|
| `fund.sec.createPool` | `{ name, dealType, ccy, servicerId? }` | §3.3.1 | SPV in STRUCTURING |
| `fund.sec.addAssets` / `fund.sec.removeAssets` | `{ spvId, refs[] }` | actor owns the assets; eligibility §3.3.2 (checked per asset; pool-level rules checked at `structure`) | pool updated; assets reserved (cannot be sold elsewhere) |
| `fund.sec.buyWholeLoans` | `{ cohortFilter, maxAmount, maxPrice }` | LIC4 + CH_BANK/CH_FUND | 07 whole-loan purchase, then usable in a pool |
| `fund.sec.structure` | `{ spvId, tranches: [{ cls, attach, detach, couponType, refRate? }], principalMode, triggers?, retention }` | §3.3.3 | tranches defined; pool-level eligibility checked |
| `fund.sec.requestRating` | `{ spvId, agencyIds[] }` | structured; fees payable | RATING (§3.4.5) |
| `fund.sec.launch` | `{ spvId, maxSpreadAccepted?: Record<cls, bps> }` | at least one rating published, or the sponsor flags the deal as unrated | MARKETING book for 1 game day |
| `fund.sec.bid` | `{ trancheId, notional, maxSpreadBps }` | LIC4; cash or credit for notional at book close | sealed bid |
| `fund.sec.withdraw` | `{ spvId }` | before book close | pool assets released, SPV closed, fees not refunded |
| `fund.sec.callDeal` | `{ spvId }` | sponsor; pool ≤ cleanUpCallPct | §3.3.10 |
| `fund.sec.replaceServicer` | `{ spvId, newServicerId }` | holders > 50% of most senior outstanding (votes are intents `fund.sec.vote`) | servicer replaced |
| `fund.sec.vote` | `{ spvId, motion: 'REPLACE_SERVICER' | 'LIQUIDATE' | 'EXTEND', yes: boolean }` | holds the voting class | tallied at t = 719 |

### §4.4 Ratings

| Kind | Payload | Validation | Effect |
|---|---|---|---|
| `fund.rat.request` | `{ subjectId, agencyIds[] }` | actor is the issuer or controls it | queued; fee paid |
| `fund.rat.publish` | `{ ratingId, publish }` | issuer; preliminary rating exists | published or kept private |
| `fund.rat.appeal` | `{ ratingId, note }` | once per action | re-review in 3 game days |

### §4.5 Insurance

| Kind | Payload | Validation | Effect |
|---|---|---|---|
| `fund.ins.charter` | `{ cmpId, initialCapital, lines: LineAppetite[], isReinsurer }` | 13 `CH_INSURER`; for player insurers capital ≥ max($1M, line minima); reinsurer per §3.5.8 | insurer entity created ACTIVE (capital moved from the company; the 10% setup fee of 09 §3.8 applies if founded through the catalog) |
| `fund.ins.setAppetite` | `{ insurerId, lines: LineAppetite[], manualQuotes }` | owner | appetite updated next tick |
| `fund.ins.setInvestmentPolicy` | `{ insurerId, weights }` | weights sum 1, equities ≤ 0.3 | the insurer's own orders follow normal `fund.trade` on its behalf |
| `fund.ins.requestQuote` | `{ line, insuredRefs[], limit, deductiblePct, termDays }` | insurable interest; deductible ≥ 10% | quotes returned |
| `fund.ins.respondQuote` | `{ requestId, premiumAnnual }` | player insurer in manual mode, within 1 game day | quote delivered |
| `fund.ins.bind` | `{ quoteId, billing }` | quote valid; moratorium (§3.5.3); cash for first premium | policy BOUND next tick |
| `fund.ins.cancel` | `{ policyId }` | holder | §3.5.3 |
| `fund.ins.setAutoRenew` | `{ policyId, on }` | holder | flag |
| `fund.ins.fileClaim` | `{ policyId, eventId }` | the event exists and involves the insured ref | claim opened per §3.5.4 |
| `fund.ins.disputeClaim` | `{ claimId }` | claim DENIED or PRORATED | 13 civil case |
| `fund.ins.requestTreaty` | `{ cedentId, type, lines, perils, retention?, limit?, cessionPct?, termDays }` | cedent owner | quotes from NPC and player reinsurers |
| `fund.ins.bindTreaty` | `{ treatyQuoteId }` | | treaty ACTIVE |
| `fund.ins.sponsorCatBond` | §3.5.9 payload | §3.5.9 | SPV + book-build |
| `fund.ins.bidCatBond` | `{ catBondId, notional, maxSpreadBps }` | LIC4 | sealed bid |

---

## §5 Engine events

Envelope per 00 §5.6. Visibility: PUBLIC (everyone; Wire-eligible), PARTIES (named parties), PRIVATE (the actor), SEALED (court evidence, 13 discovery).

| Event | Visibility | Payload (main fields) | Consumers |
|---|---|---|---|
| `fund.launched` / `fund.closed` | PUBLIC | fundId, name, kind, strategy, fees, manager handle | 15 boards, 16 news, 17 |
| `fund.navStruck` | PARTIES (investors, manager); PUBLIC subset for board funds (return, AUM band) | NavRecord | 17, 15, 20 |
| `fund.subscriptionFilled` / `fund.redemptionFilled` | PARTIES | reqId, units, cash, gatedRemainder | 03, 17 |
| `fund.gated` / `fund.frozen` / `fund.suspended` / `fund.breaker` | PUBLIC | fundId, reason, until | 16 news, 15, 20 |
| `fund.mandateChangeNotice` / `fund.feeChangeNotice` | PARTIES | old, new, effectiveTick | investors |
| `fund.relatedHoldingFiled` | PUBLIC | fundId, assetId, size band | 15 filings, 13 |
| `fund.managerTradeShadow` | SEALED | manager personal trade vs fund trade pair within 1 game day | 13 surveillance |
| `fund.mmfBrokeBuck` | PUBLIC | fundId, shadowNav | 16 news, 07 |
| `fund.etf.created` / `fund.etf.redeemed` | PUBLIC (aggregate CUs per ETF per day, no AP identity) | etfId, cus | 05 flows view, 16 |
| `fund.etf.apFailed` | PARTIES | apId, etfId | 17 |
| `fund.index.rebalanceAnnounced` / `fund.index.rebalanced` | PUBLIC | indexId, adds, deletes, weights | 05, 16, 17 |
| `fund.sec.dealLaunched` / `fund.sec.dealClosed` | PUBLIC | spvId, dealType, size, tranches, published ratings, clearing spreads | 16, 15, 17 |
| `fund.sec.payment` | PARTIES (holders) + PUBLIC DealReport | DealReport | 06 pricing, 17, 20 |
| `fund.sec.triggerBreached` / `fund.sec.eventOfDefault` | PUBLIC | spvId, test, value | 06 CDS, 16, 07 haircuts |
| `fund.sec.writedown` | PUBLIC | trancheId, amount | 06 CDS credit event |
| `fund.rat.preliminary` | PRIVATE (issuer) | ratingId, grades | 17 |
| `fund.rat.action` | PUBLIC | subjectId, agency, old → new, outlook, watch, reason | 07, 05, 06, 16, 13 |
| `fund.rat.reputation` | PUBLIC (quarterly) | agencyId, reputation, leniency band (LOW/MED/HIGH) | 16 |
| `fund.ins.policyBound` / `fund.ins.policyLapsed` | PARTIES | policyId, line, limit, premium | 03, 17 |
| `fund.ins.claimOpened` / `fund.ins.claimPaid` / `fund.ins.claimDenied` | PARTIES | claimId, amounts, reason | 03, 17, 13 |
| `fund.ins.fraudReview` | SEALED + PARTIES notice | claimId, score inputs | 13 |
| `fund.ins.solvencyStatus` | PUBLIC on status change | insurerId, status, ratio band | 16, 13, 15 |
| `fund.ins.insolvent` | PUBLIC | insurerId, bridge, PGS cover | 16, 13 |
| `fund.cat.warning` | PUBLIC | peril, cityId, forecast intensity, landfall day | 16 news, 17, 09, 10 |
| `fund.cat.event` | PUBLIC | CatEvent | 10, 09, 16, 05 (sector shocks), 04 (regional output) |
| `fund.catbond.triggered` | PUBLIC | catBondId, f, amount | 06, 16 |
| `fund.systemic.daily` | PUBLIC | §3.6.1 indicators | 17, 15 Wire digest, 20 |

---

## §6 NPC behaviour

### §6.1 NPC funds

- Roster (22 names): `PARAM.npc_fund_count = 40` NPC funds at launch across kinds and strategies (12 hedge, 10 long-only, 4 credit, 3 venture, 3 private equity, 5 MMF, 3 ETF sponsors running the index ETFs, plus one SWF per bloc = 5 extra SWFs counted under 04 treasuries). Includes the rival funds Hale & Ward (value, reachable rival at $7,000), Pinn Partners (momentum) and Vetch (crypto degen) from roadmap M12, which keep their exact rules: named slices of the 05 value, trend and crypto-trend pools, each slice ≤ 5% of ADV per rebalance, same order path and impact as everyone.
- Trading: an NPC hedge or long-only fund is a named slice of a 05 agent pool with the pool's decision rule and the fund's own mandate; it trades through the same intents. Leverage caps: NPC hedge 3.0×, credit 2.0×, long-only 1.0×.
- Flows into NPC funds from hh and NPC allocators follow trailing 1-quarter performance: `flow_q = 0.5 × (return_q − peerMedian_q) × AUM`, clamped ±25% per quarter, so performance chasing and redemptions in drawdowns are real.
- Players may invest in NPC funds with 2/20 fees, HWM and a 20% gate (N5). Their NAV is the slice's marked P&L.
- NPC PE funds run buyouts of NPC private companies (09 §3.14) when credit conditions (07 lending standards) are loose; their buyout rate per bloc per game quarter = `0.5 × (standardsLooseness) × N_privateTargets / 100`.

### §6.2 NPC authorized participants and dealers

Each bloc has 2 NPC dealer banks (07) registered as APs on every NPC ETF and on player ETFs that request them (`PARAM.etf_npc_ap_default = true`). Rule per §3.2.3, balance-sheet room from 07 (shrinks with fear and with the bank's capital ratio). NPC dealers also quote tranches (§3.3.11) and cat bonds.

### §6.3 NPC securitizers and structured-credit buyers

- NPC banks securitize when `bankLoanGrowth > depositGrowth` or capital ratio < target + 1%: they pool 30–60% of new mortgage and consumer cohorts each game quarter into deals with a standard structure (A 0–80% senior … equity 0–4% in a calm market; the AAA size per deal = the largest attach point at which the median agency rates AAA). Their deal flow therefore rises in booms.
- NPC buyers per bloc: banks (any grade ≥ BBB−, capacity from 07), insurers (≥ A, ≤ 15% of their portfolio), pensions (≥ AA), MMFs (AAA only and ≤ 1 game year WAL), credit funds (any), cat funds (cat bonds only). Each class has reservation spreads by grade `s_res(g) = baseSpread(g) × (1 + 2·fear)`, base AAA 60 bps, AA 90, A 140, BBB 250, BB 500, B 800, equity N/A (equity bought only by credit funds at an expected IRR ≥ 15%/game year), and a capacity in Money. They bid in book-builds at `s_res` up to capacity.
- Rating floors: on any downgrade below a class's floor, that class sells over 20 game days (fallen angels, §3.4.7).

### §6.4 NPC insurers and reinsurers

- One primary NPC insurer per bloc (22; DEFAULT names: Aegis Mutual FDL, Halden Assurance EUN, Kaiyo Marine & Fire PYN, Nordvik Mutual NKR, Solano Seguros SRL), two global reinsurers (Bastion Re, Halvorsen Re), one Policyholder Guarantee Scheme and one bridge insurer per bloc.
- They write every line to players at the loads of §3.5.2 with `modelQuality = 0.6`, and the HH_* lines for every hh sector in aggregate (premium = hh insured value × aggregate rate; claims from cat events hit them).
- Capital management: target solvency ratio 1.6; below 1.3 they raise loads by +10% per game week until restored, and buy CAT_XOL from the reinsurers; below 1.1 they stop writing new player cyber business (players must find player insurers, a market opening). NPC insurers can fail under the same §3.5.7 rules; the PGS then pays.
- NPC reinsurers price at 1.5 × EL × cycle; after an industry cat loss > 2% of industry capital, `cycle` rises (§3.5.2) and they cut capacity by 20% for 182 game days (hard market), which is when player reinsurers and cat-bond sponsors earn most.

### §6.5 Rating agencies

Act per §3.4: unsolicited coverage, quarterly reviews, watches, leniency drift. They never use private information and never act on a player's identity; only on reported data.

---

## §7 Screens

17 owns layouts; this module needs these screens and panels (names as used in 17's screen list):

| Screen / panel | Shows | Main actions |
|---|---|---|
| **Funds — Marketplace** | all public funds: name, manager, kind, strategy, fees, gate, AUM band, net return, Sharpe, max DD, style-drift, incidents; filters; NPC rival funds | open fund page, subscribe |
| **Fund page** | public track-record chart (net NAV), stats table, terms sheet (fees, gate, lockup, notice, transparency), incidents, filings; for investors: their units, series HWM, pending requests, the transparency-level data | subscribe, redeem, cancel |
| **Fund Manager desk** | NAV breakdown (Level 1/2/3), leverage, liquidity profile (1-day and 5-day), mandate limits with live headroom bars, pending flows for next strike, gate forecast, fee accruals, AUM caps (stake ×10, new-fund cap), breaker distance, style drift, investor list (handles and unit bands) | trade (opens the 05 terminal in fund mode), update mandate/fees/transparency, side pocket, capital call, distribute, close |
| **ETF product sheet** | price vs iNAV (every tick), premium/discount, basket, creation unit, AP list (count), fees, tracking difference, leverage decay explainer for leveraged ETFs | trade; for APs: create/redeem panel with band estimate |
| **Index page** | methodology, constituents, weights, next rebalance and announced changes | define index (sponsors) |
| **Structured Credit desk** | deal list (public reports), tranche quotes, model spread vs dealer quote, OC/IC tests, CDR/CPR charts; for sponsors: the Deal Builder | RFQ, bid in books, build deals |
| **Deal Builder** | pool composition (count, WA PD, LGD, LTV, concentrations), eligibility checks, tranche editor with live loss-distribution chart (Vasicek curve) and per-agency predicted grade ranges, retention, fees, triggers | add/remove assets, structure, request ratings, publish ratings, launch |
| **Ratings** | rating lists by kind, rating actions feed, agency reputation and style, watchlists, a subject's rating history | request, publish, appeal |
| **Insurance — Cover** (holder view) | every insured and uninsured asset with suggested lines, current policies, premiums, deductibles, limits, claims, warnings and moratoria | request quotes, compare, bind, cancel, auto-renew, file/dispute claims |
| **Insurer console** | book by line (premium, EL, loss ratio, combined ratio), exposures map by city and peril, PML200, solvency ratio and SCR breakdown, reinsurance programme, invested assets and admissibility, claims queue, cycle per line | set appetite and loads, manual quotes, treaties, sponsor cat bonds, investment policy |
| **Catastrophe map** | world/city overlay of current warnings, active events, footprints, historical events, industry loss | link to Cover |
| **Systemic Risk panel** | §3.6.1 indicators with history | none (read) |

Simple/advanced views (D04): every screen has a Simple mode issuing the same intents (e.g. Cover shows "Protect this café: $X per game day" with one tap), and Advanced mode with full terms.

---

## §8 Edge cases

1. **Fund with zero units outstanding** (all redeemed except none): NAV per unit is undefined; the fund moves to WINDING_DOWN automatically and closes when positions are flat.
2. **Manager stake falls below 10% because the manager redeemed elsewhere?** Impossible: stake units cannot be redeemed below the floor. If losses push the absolute stake below $250,000, subscriptions pause; existing investors are unaffected.
3. **Investor's NW falls so the fund exceeds 25% of NW**: the cap applies only at subscription; no forced redemption.
4. **Investor goes bankrupt (14 fresh start)**: fund units are assets; 14's bankruptcy liquidates them through `fund.redeem` at the next strike (gate applies; the estate waits like anyone).
5. **Investor Held (13)**: Held blocks new intents; pending requests still execute at strike.
6. **Manager convicted mid-quarter**: performance fees accrued but not crystallized are forfeited to the fund; the fund winds down (ban).
7. **Fund holds an asset that is delisted or bankrupt (09)**: becomes Level 3 at the recovery estimate until the 09 restructuring distributes; may force a side pocket.
8. **Cross-currency funds**: positions in other currencies are marked and converted at the 05 FX close mark; FX hedges are normal positions.
9. **Weekend NAVs**: struck every game day; equity marks unchanged on weekends, crypto marks move.
10. **ETF with zero APs** (all suspended): no creations or redemptions; it trades freely at any premium; a PUBLIC notice warns; the sponsor may add NPC APs.
11. **Basket constituent halted**: in-kind creations exclude the halted line and substitute cash at its last mark plus 1% (`PARAM.etf_halt_cash_premium`).
12. **Index constituent count below minimum** after deletions: the next eligible instruments by the method's ranking are added at the next rebalance; until then the index runs short.
13. **Leveraged ETF NAV approaching zero** (underlying moves > 1/L in a day): if NAV per unit falls below 5% of its 28-day average, the ETF terminates and distributes at the next close.
14. **SPV pool asset prepays fully**: principal collection; the pool shrinks; tranches amortize.
15. **Pool asset's borrower is a player who goes bankrupt**: 07's bankruptcy rules decide recovery; the SPV is a creditor like any other.
16. **Sponsor bank fails (07)**: the SPV is bankruptcy-remote: it continues; servicing moves to an NPC servicer at 40 bps; the sponsor's retained tranches go to its estate.
17. **All bids below a tranche's size**: unsold notional stays with the sponsor; the deal still closes if the senior-most tranche is ≥ 90% placed, otherwise the sponsor chooses close (keeping the unsold) or withdraw.
18. **Rating agency capacity saturated**: requests wait; deals cannot launch rated until ratings arrive; a deal may launch unrated (NPC buyers with rating floors will not bid).
19. **Composite rating with an even number of ratings ≥ 4**: impossible (3 agencies).
20. **Rated subject disappears (merger)**: ratings transfer to the surviving entity and are put on WATCH.
21. **Policy insuring an asset that is sold**: cover ends at transfer; pro-rata refund; the buyer must bind its own cover.
22. **Claim exceeding the insurer's cash**: the insurer has 1 game day to raise cash (sell assets, draw reinsurance, capital injection); otherwise INSOLVENT (§3.5.7).
23. **Two cat events in the same week**: CAT_XOL treats each as an event; reinstatements are consumed in order; the 7-game-day aggregation applies only to the same peril and city.
24. **Cat event during a moratorium on a policy bound before the warning**: covered (cover bound before the warning is valid).
25. **Cat bond trigger hit after maturity date but for an event during the term**: covered if the event started during the term; determination continues after maturity, with collateral held until determined.
26. **Insurer is also the holder's alliance member**: allowed; the fraud score weights shared clusters; claims are still engine-determined.
27. **Money-market fund holds a bill of a sovereign that defaults (04)**: shadow NAV drops by the loss; likely break the buck.
28. **Fund-of-funds redeems from a gated underlying**: its own redemption payable waits; it may gate itself.
29. **Fund in custody at a CCP that is under default-waterfall stress (07)**: custody assets are segregated and never used for the CCP's waterfall.
30. **Investor tries to subscribe with ad cash (L12) inside the restricted window**: rejected (00 §5.9 and roadmap C5: ad cash cannot fund ops, margin or P2P for 72 game days; fund subscriptions count as P2P).

---

## §9 Exploits and counters

| # | Exploit | Counter |
|---|---|---|
| 1 | **Manager steals deposits** | impossible: custody only, no withdrawal path (§3.1.12) |
| 2 | **Alt-account investors pump a fund's AUM / track record** | investor age ≥ 168 game days, link score block, 25%-of-NW cap, board needs 182 game days and $1M; NPC allocators weight history length |
| 3 | **Fund as exit liquidity** | related-party cap 5% NAV + public filing; surveillance pairing; S5 |
| 4 | **Late trading on stale NAV** | forward pricing with the t = 539 cutoff; NAV always uses today's close marks |
| 5 | **Stale Level-3 marks to inflate NAV / fees** | managers never set marks; Level 3 ≤ 10%; NPC valuer; performance fees on side pockets only on realization |
| 6 | **Churning for fees** | no per-trade manager fees |
| 7 | **Redemption run front-running** (redeem first, leave others with costs) | swing pricing, gate pro-rata, in-kind for large holders |
| 8 | **Self-dealing between a player's fund and the player's company** (fund buys the company's bonds above value) | related-party cap and 10%-of-appraisal rule (§3.1.12), consolidated surveillance |
| 9 | **Securitize junk loans at inflated value to NPC buyers** (mint money) | ratings are model-based on reported PDs from 07 (sponsor cannot set PDs); risk retention 5% kept for life; NPC buyers bid only at their reservation spreads; 07 originations to linked borrowers are flagged by 07 |
| 10 | **Exposure stuffing before a cat-bond trigger** | indemnity counts only policies bound ≥ 28 game days before the event |
| 11 | **Buy insurance once a storm is forecast** | binding moratorium for warned perils |
| 12 | **Insure someone else's asset and attack it** (betting on loss) | insurable interest rule; attack-and-claim collusion flagged by fraud score; S4 |
| 13 | **Stage a breach with a linked account and claim** | collusion graph + shared-cluster test → FRAUD_REVIEW; S4 (03 §11.3) |
| 14 | **Player insurer sells cheap policies, collects premium, then lets the insurer fail** | solvency floor and SCR block new writing early; RESTRICTED blocks dividends; owner equity wiped; 13 investigates; premiums are daily by default so float stays small |
| 15 | **Rating shopping** | legal by default but visible in deal results; agencies' leniency and reputation feedback; regulator disclosure lever (§3.4.5) |
| 16 | **Bribing an analyst** | abstract op with evidence trail (12/13); S5; agency reputation hit |
| 17 | **Index inclusion pump** (sponsor adds own stock) | rule-based constituents; holdings guard ≥ 1% float blocks inclusion |
| 18 | **ETF creation with borrowed basket then default** | settlement requires assets in custody; failure fees; suspension |
| 19 | **Closed-end fund carry farmed by an alt LP** | European waterfall default; clawback escrow for AMERICAN; LP checks as open-ended |
| 20 | **Wash circulation of fund units to fake AUM** | units are not transferable for open-ended funds; subscriptions are real cash in custody |
| 21 | **Using the SWF to absorb NPC treasury money** | co-investment ≤ 25%, fees ≤ 0.5%, no performance fee, treasury capital stays NPC-owned |
| 22 | **Gaming PML200 with exposure just after the weekly calculation** | new policies above `PARAM.ins_pml_recalc_trigger = 0.10` of PML (estimated marginally at bind) force a recalculation at the next day close; quotes include marginal catLoad |

---

## §10 Acceptance tests

Each is checkable by a unit, property or harness test (20). "Given" states are built with the test engine hook.

1. **08-AT-01** A fund can be created only when every §3.1.1 requirement holds; removing any one (license, charter, rank, age, clean record) makes `fund.create` fail with the matching rule code.
2. **08-AT-02** NAV strike: for a fund with known positions and marks, `G` equals `(grossAssets − liabilities)/units` to the micro-unit, computed via `toMoney` only at the boundary.
3. **08-AT-03** A subscription submitted at tick-of-day ≤ 539 deals at that day's strike; one at 540 deals at the next day's strike.
4. **08-AT-04** Performance fee: a series subscribed at G = 100, fund rising to G = 120 with 20% fee and no hurdle accrues `a = 4`; after quarter crystallization the investor's units fall by `4 × units / 120`, the manager receives `4 × units` cash, and `G` is unchanged.
5. **08-AT-05** Hard hurdle 8%: after exactly one game year at G = 106 from H = 100, `a = 0`; at G = 110, `a = 0.2 × (110 − 108)`.
6. **08-AT-06** HWM: a series that fell to G = 90 and recovered to 100 pays no performance fee.
7. **08-AT-07** Gate: redemptions totalling 35% of NAV on one day fill 20% pro rata; the remainder fills next day pro rata with new requests.
8. **08-AT-08** Swing pricing applies when net redemptions exceed 5% of NAV and never exceeds 3%; the swing amount remains in the fund (fund NAV for remaining investors is higher than without swing).
9. **08-AT-09** Manager cannot withdraw any fund asset: no intent sequence by the manager (fuzzed over 10,000 random intent sequences) moves fund custody value to the manager except crystallized fees and his own redemptions above the 10% floor.
10. **08-AT-10** Mandate: an order breaching any of leverage, position, asset class, region, short, derivative rules is rejected in P1; an order matching against the manager's own account never fills.
11. **08-AT-11** Absent manager: at 72 game days without login the fund is FROZEN and redemptions are gate-free; at 336 it winds down and distributes within 5 game days.
12. **08-AT-12** Drawdown breaker fires when lead NAV is ≥ 30% below HWM inside a 7-day window, and not at 29.9%.
13. **08-AT-13** AUM caps: subscriptions that would take AUM above 10× stake or above $10M in the first 336 game days are cut to the cap.
14. **08-AT-14** Investors younger than 168 game days, linked to the manager, or exceeding 25% of NW are refused at strike, with cash returned.
15. **08-AT-15** Fees paid on the NPC-owned share of a fund post with FAUCET codes; fees on player-owned share post TRANSFER; custody posts SINK; Σ postings match Δcash across 60 seeds.
16. **08-AT-16** NPC allocators: a fund with Sharpe in the top decile, 2+ quarters and no incidents receives NPC capital; NPC share never exceeds 50% of AUM nor breaks the stake rule.
17. **08-AT-17** MMF: when shadow NAV < 0.9950 the fund floats and emits `fund.mmfBrokeBuck`; hh redemptions increase as defined.
18. **08-AT-18** ETF: with premium above band, the NPC AP sells ETF units and buys basket in the same tick and the premium falls inside the band within 3 ticks in a calm market (fear < 0.2) across 60 seeds.
19. **08-AT-19** ETF crisis discount: in a harness crisis (fear ≥ 0.8) the median bond-ETF discount exceeds 100 bps at some point, without any scripted discount code path (code-path check: no branch on fear in §3.2 other than through basketExecCost and 07 limits).
20. **08-AT-20** Units outstanding change only through creations, redemptions and closure (property test).
21. **08-AT-21** Leveraged ETF rebalance trade equals `L(L−1) r NAV` within one lot.
22. **08-AT-22** Player index cannot include an instrument where the sponsor holds ≥ 1% of float; the rebalance publishes the block.
23. **08-AT-23** Vasicek: for PD_H = 2%, ρ = 0.15, LGD = 0.5, the computed `P(L > 0.05)` matches a 1,000,000-path Monte Carlo of the same model within 0.1 percentage points.
24. **08-AT-24** Waterfall: on a hand-built deal, interest and principal distributions match a reference spreadsheet to the micro-unit for 10 payment dates including an OC breach (turbo) and a writedown.
25. **08-AT-25** Losses never write down a senior class while any junior class has principal > 0.
26. **08-AT-26** Risk retention: a sponsor cannot sell or transfer retained tranches (any intent attempting it is rejected) for the life of the deal.
27. **08-AT-27** 2008 emergence: in a 200-seed harness with a 6-game-year boom followed by a 04 recession, the share of AAA-rated RMBS tranches downgraded ≥ 3 notches within 1 game year of the recession start is ≥ 10% in at least 30% of seeds and < 1% in seeds with no recession; no code path references "crisis" in §3.3 or §3.4 (emergence, not script).
28. **08-AT-28** Ratings: the grade-PD table round-trips (`grade(pd(g)) = g` for all 19 non-D grades).
29. **08-AT-29** A single rating action moves at most 3 notches except to CCC/D on payment events.
30. **08-AT-30** Composite rating = median of 3, worse of 2, the one of 1, NR for 0.
31. **08-AT-31** Unpublished preliminary ratings never appear in any event visible to non-issuers (event-stream audit).
32. **08-AT-32** Fallen angel: after a downgrade from BBB− to BB+, NPC IG-only holders' positions fall to zero over 20 game days with per-day sales ≤ 10% ADV.
33. **08-AT-33** Insurance claim: for a cyber loot of $100,000 with 10% deductible and $50,000 limit, the claim pays $50,000; with $500,000 limit it pays $90,000.
34. **08-AT-34** Other insurance: two policies of limits 1M and 3M on a 2M loss pay 0.5M and 1.5M minus deductibles pro rata; total ≤ loss.
35. **08-AT-35** No policy can be bound on an asset without insurable interest.
36. **08-AT-36** Moratorium: during an active STORM warning for a city, binding new PROPERTY cover with STORM peril there fails; renewals succeed.
37. **08-AT-37** Fraud: a staged breach between linked accounts reaches FRAUD_REVIEW and is not paid before 13 clears it.
38. **08-AT-38** Solvency status transitions follow the §3.5.7 table exactly at the ratio boundaries 1.0, 0.75 and 0.
39. **08-AT-39** Insolvency: the PGS pays 80% of covered claims up to $10M each; owner equity is zero after resolution; Σ ledger is conserved.
40. **08-AT-40** Cat frequency: over 2,000 simulated years per city, observed event counts per peril are within 3 standard errors of λ × years.
41. **08-AT-41** Cat determinism: the same seed yields byte-identical CatEvents, damages and claims on replay.
42. **08-AT-42** CAT_XOL: an event net loss X = 150M on a 100M xs 50M layer recovers 100M and consumes one reinstatement with the correct reinstatement premium.
43. **08-AT-43** Cat bond indemnity excludes policies bound fewer than 28 game days before the event.
44. **08-AT-44** Parametric cat bond: intensity at attach pays 0; midway pays 50%; at or above exhaust pays 100% of outstanding.
45. **08-AT-45** Systemic indicators are computed from aggregates only: a property test confirms no indicator changes when one player's positions are relabelled to another player (privacy invariance).
46. **08-AT-46** Rival-fund compatibility: with `rivals: []` the market price fingerprint equals the field-absent run (roadmap M12 acceptance kept); each rival's median 5-game-year multiple lies in [0.4, 2.5] over 60 seeds.
47. **08-AT-47** Money conservation: across 60 seeds × 1 chapter with funds, ETFs, SPVs, insurers and cat bonds active, every tick's P13 invariant holds and Σ FAUCET − Σ SINK equals the change in player-economy money (03 invariant).
