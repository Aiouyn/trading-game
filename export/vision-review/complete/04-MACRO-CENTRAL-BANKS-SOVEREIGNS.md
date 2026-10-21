# 04 — Macro, Central Banks and Sovereigns

Module owner: 04. Status: complete specification, 2026-10-18.
Scope (00 §1): regions and blocs, macro state, business cycle, inflation, central banks and their tools, fiscal policy, sovereign debt, ratings inputs, FX regimes, crises, and the weekly report of the Stabilizer and money-supply index (both defined in 03 §3.7–§3.8; ruling in 24).
Depends on: 02 (clock, calendar hooks, RNG streams, deterministic math `dmath`), 03 (ledger postings, reason codes, player-economy aggregates), 05 (order submission for NPC flows, published prices, fear inputs), 06 (instrument registry: bond lines, FX pairs, CDS, commodity prices), 07 (banks, interbank, credit conditions, CCP), 08 (rating agencies grade sovereigns from the inputs defined here), 10 (house price index, mortgage pricing reads curves), 11 (AI-race index), 12 (world hack rate), 13 (regulators, charters, courts for holdout litigation), 15 (Wire, filings), 16 (news text, politics and lobbying outcomes, named NPC actors), 22 (names of blocs, banks, treasuries, statistics offices, agencies).

All institutions, currencies and places are fictional (L6). All model math runs in `float64` through 02's deterministic math library; money crosses into the ledger only through `toMoney` (00 §3.1).

---

## §1 Purpose

The macro layer is the one shared state every price, business, loan and property in the world reads (V3 Part 2.4). It exists so that:

1. **Prices have reasons.** A rate hike, a CPI surprise, a downgrade or a currency defence hits bonds, mortgages, growth stocks, bank margins, cap rates, carry trades and leveraged funds on the same tick, through named transmission channels that the "Why it moved" ladder (05 §3.12) can cite.
2. **Recessions are caused, not random** (old 01 §5.3). Imbalances (credit growth, valuation stretch, an inverted curve, tight real rates, oil shocks) raise the hazard of a downturn, so a careful player can see one building.
3. **Central banks, treasuries and sovereign bond markets are real machinery** (V3 Part 3.2): policy rates with a corridor, reserves, standing facilities, asset purchases, forward guidance, deficits that are financed by auctions, debt that can be downgraded and restructured, currencies that can be defended and can break.
4. **Crises emerge from rules** (V3 T2) and also arrive on a calibrated schedule so the world has rhythm (one major crisis in about 35% of chapters, storms every game quarter, ripples every game week).
5. **The money stays honest.** The Stabilizer controller keeps the player economy on its designed path, and the Money Supply Index deflates rankings so inflation cannot pump rank (old 01 §8.2–8.3).

### §1.1 Ownership boundaries

| Topic | 04 owns | Others own |
|---|---|---|
| Bloc macro state (growth, gap, inflation, unemployment, wages, expectations) | all of it | 16 writes news text from 04 events |
| Business cycle regimes and hazards | all of it | 05 reads regime for volatility and jump multipliers |
| Central bank rule, meetings, guidance, corridor, reserve requirement, facilities' terms, QE/QT/YCC, swap lines, macroprudential settings | all of it | 07 runs interbank lending, deposit flows and applies capital, LTV and reserve rules |
| Sovereign yield curve (OIS + term premium + sovereign spread), market-implied policy path | all of it | 06 prices each bond, future and swap off these curves |
| Fiscal accounts, deficits, debt, issuance calendar, primary auctions, buybacks, syndications, restructurings | all of it | 06 holds bond instruments; 13 hears holdout litigation |
| Sovereign PD, spread and the credit inputs | all of it | 08 agencies assign the published grade |
| FX fair value, FX regimes, intervention, reserves, capital controls | all of it | 05 runs the FX books; 06 forwards (covered parity by construction) |
| Global indicators: Fear Index, Financial Stress Index, world trade index | all of them | 11 owns the AI-race index; 12 the world hack rate; 16 geopolitical tension |
| Crisis scheduler, crisis anatomy, shock vectors on 04 variables | all of it | each module applies the hooks listed in §3.16.6 |
| Stabilizer controller, levers, Money Supply Index (MSI) | weekly report only (§3.17) | 03 owns the controller, levers and MSI (03 §3.7–§3.8; ruling in 24) |
| Macro data releases (calendar, measurement, consensus, revisions) | all of it | 16 news text; 17 calendars |

---

## §2 Entities

### §2.1 Identifiers and enums

```ts
type BlocId = 'FU' | 'EC' | 'PL' | 'NA' | 'SC';          // Federal Union, Euran Compact, Pacific League, Nordic Alliance, Southern Coalition
type Ccy = 'FDL' | 'EUN' | 'PYN' | 'NKR' | 'SRL';         // 00 §3.1; FDL is the unit of account and reserve currency
type Regime = 'EXPANSION' | 'OVERHEATING' | 'CONTRACTION' | 'RECOVERY';
type FxRegimeKind = 'FREE_FLOAT' | 'MANAGED_BAND' | 'MANAGED_FLOAT' | 'HARD_PEG';
type Tenor = 'B3M' | 'B6M' | 'B1Y' | 'N2Y' | 'N5Y' | 'N10Y' | 'N30Y' | 'L10Y';   // bills, nominal notes/bonds, 10y inflation-linked
type ReleaseKind = 'CPI' | 'JOBS' | 'GDP_ADV' | 'GDP_REV1' | 'GDP_REV2' | 'PMI' | 'RETAIL' | 'TRADE' | 'SENTIMENT'
                 | 'HOUSING' | 'CREDIT' | 'FISCAL' | 'CB_DECISION' | 'CB_GUIDANCE' | 'CB_MINUTES' | 'RESERVES';
type CrisisKind = 'EQUITY_BUBBLE_BURST' | 'CREDIT_CRUNCH' | 'BANKING_PANIC' | 'CRYPTO_WINTER' | 'OIL_SHOCK'
                | 'CURRENCY_CRISIS' | 'SOVEREIGN_DEBT_CRISIS' | 'AI_BUBBLE' | 'CYBER_PANDEMIC' | 'FLASH_CRASH'
                | 'HOUSING_CRASH' | 'STAGFLATION' | 'SECURITIZATION_CRISIS' | 'FUNDING_RUN' | 'TRADE_WAR';
type StormKind = 'RATE_SCARE' | 'OIL_SPIKE_LITE' | 'CRYPTO_FLUSH' | 'CREDIT_WOBBLE' | 'FX_SQUALL'
               | 'SECTOR_ROTATION' | 'EARNINGS_SCARE' | 'LIQUIDITY_HICCUP';
type RippleKind = 'SECTOR_SHOCK' | 'COMMODITY_SUPPLY' | 'COMMODITY_DEMAND' | 'REGULATORY_NOTE' | 'LOCAL_BOOM';
type EventTier = 'RIPPLE' | 'STORM' | 'MAJOR';
type CrisisPhase = 'PRECURSOR' | 'TRIGGER' | 'CONTAGION' | 'POLICY' | 'RECOVERY' | 'ENDED';
```

IDs: `cbk_FU`, `gov_FU`, `exc_FU`, `reg_FU`, `crt_FU` for the five per-bloc institutions (authored, 00 §3.2); `npc_CSF` for the Concord Stability Facility (§2.13); `sys_STAB` for the Stabilizer; `macro_rel_<bloc>_<kind>_<seq>`, `mtg_<bloc>_<seq>`, `auc_<bloc>_<tenor>_<seq>`, `crs_<seq>` generated by 02's deterministic ID rule.

### §2.2 Bloc (static definition, authored in 22, defaults here)

```ts
interface BlocDef {
  id: BlocId; name: string; ccy: Ccy;
  cbkId: string; govId: string; excId: string; regId: string; crtId: string;
  cityIds: [string, string, string];          // 3 cities per bloc (10, 22)
  gdpShare0: number;                          // share of world nominal GDP at genesis
  potentialGrowth0: number;                   // g_pot, real, per game year
  inflationTarget: number;                    // π_target
  rStar0: number;                             // neutral real rate r*
  nairu: number;                              // u*
  laborForceGrowth: number;                   // per game year
  openness: number;                           // exports / GDP, couples to world demand
  commodityExporter: number;                  // −1 net importer … +1 net exporter of energy
  foodWeight: number;                         // CPI weight of food
  energyWeight: number;                       // CPI weight of energy
  fxPassThrough: number;                      // share of yoy effective depreciation passed into core inflation
  fiscalRule: FiscalRule;
  fxRegime0: FxRegimeKind;
  negativeRatesAllowed: boolean;
  elb: number;                                // effective lower bound on the policy rate
  sovereignBaseHazard: number;                // λ0, annual, §3.11
  debtReference: number;                      // d*, debt/GDP at which spreads start to rise faster
  fxDebtShare0: number;                       // share of sovereign debt denominated in FDL
  sectorWeights: number[];                    // 12 entries (old 01 §3.2 sector order), sum 1; NPC economy mix
  cycleCoupling: number;                      // how strongly the global regime drives this bloc
  personality: { hawkMin: number; hawkMax: number; credibility0: number; communicationClarity: number };
}

type FiscalRule =
  | { kind: 'FLEXIBLE' }                                     // FU
  | { kind: 'DEFICIT_CAP'; cap: number; debtRef: number }    // EC Compact rule
  | { kind: 'BALANCED_CYCLE'; tolerance: number }            // PL
  | { kind: 'SURPLUS_SWF'; targetSurplus: number }           // NA, surplus to its sovereign wealth fund
  | { kind: 'PROCYCLICAL'; boomSpendShare: number };         // SC
```

Default bloc table (DEFAULT, Mathis may override; 22 may rename but must keep the numbers unless 24 changes them):

| Field | FU (FDL) | EC (EUN) | PL (PYN) | NA (NKR) | SC (SRL) |
|---|---|---|---|---|---|
| Personality (old 01 §5.1) | big, tech-heavy, deep markets, reserve | slow growth, luxury and industry | manufacturing and chips, export-driven | energy and wealth, low volatility | emerging, commodities, high growth, high risk, high rates |
| `gdpShare0` | 0.32 | 0.22 | 0.24 | 0.07 | 0.15 |
| `potentialGrowth0` | 2.5% | 1.3% | 4.0% | 1.8% | 4.5% |
| `inflationTarget` | 2.0% | 2.0% | 2.5% | 2.0% | 4.0% |
| `rStar0` | 0.75% | 0.25% | 1.00% | 0.50% | 2.00% |
| `nairu` | 4.5% | 7.0% | 3.5% | 4.0% | 8.0% |
| `laborForceGrowth` | 0.6% | 0.1% | 0.3% | 0.5% | 1.2% |
| `openness` | 0.25 | 0.45 | 0.60 | 0.55 | 0.40 |
| `commodityExporter` | 0.0 | −0.6 | −0.8 | +0.9 | +0.6 |
| `foodWeight` / `energyWeight` | 0.12 / 0.08 | 0.13 / 0.09 | 0.15 / 0.08 | 0.11 / 0.07 | 0.20 / 0.09 |
| `fxPassThrough` | 0.05 | 0.08 | 0.10 | 0.08 | 0.25 |
| `fiscalRule` | FLEXIBLE | DEFICIT_CAP 3%, debtRef 60% | BALANCED_CYCLE 1.5% | SURPLUS_SWF +2% | PROCYCLICAL 0.6 |
| `fxRegime0` | FREE_FLOAT | FREE_FLOAT | MANAGED_BAND ±3% vs basket | FREE_FLOAT | MANAGED_FLOAT |
| `negativeRatesAllowed`, `elb` | no, 0.00% | yes, −0.50% | no, 0.00% | yes, −0.25% | no, 0.50% |
| `sovereignBaseHazard` λ0 | 0.0005 | 0.0030 | 0.0020 | 0.0003 | 0.0200 |
| `debtReference` d* | 110% | 60% | 70% | 60% | 50% |
| `fxDebtShare0` | 0.00 | 0.00 | 0.05 | 0.00 | 0.30 |
| initial debt/GDP | 95% | 88% | 60% | 40% | 70% |
| initial primary balance / GDP | −2.0% | −1.0% | −1.0% | +3.0% | −1.5% |
| initial policy rate | 3.00% | 2.25% | 2.75% | 2.50% | 9.50% |
| `cycleCoupling` | 0.8 | 1.0 | 1.2 | 0.7 | 1.3 |
| hawkishness draw (hidden, §3.6.2) | U(0.40, 0.65) | U(0.55, 0.85) | U(0.30, 0.60) | U(0.45, 0.75) | U(0.20, 0.70) |
| `credibility0` | 0.85 | 0.90 | 0.75 | 0.85 | 0.45 |
| `communicationClarity` | 0.8 | 0.7 | 0.5 | 0.9 | 0.4 |
| initial FX rate (FDL per unit) | 1.0000 | 1.1000 | 0.1500 | 0.0950 | 0.2000 |
| sector tilt (highest weights) | Tech, Semis, Financials | Luxury, Industrials, Staples | Semis, Industrials, Logistics | Energy, Materials, Financials | Materials, Energy, Real estate |

Isla Serena (00 §5.7) belongs to no bloc. It uses FDL, reads FU rates, and its local activity index is `0.5 × FU output gap + 0.5 × top-1% player wealth growth` (10 consumes `islaSerenaIndex()`).

### §2.3 True macro state per bloc (`BlocMacroState`, never sent to clients)

```ts
interface BlocMacroState {
  bloc: BlocId; tick: Tick;                    // last update tick
  regime: Regime; regimeSinceTick: Tick;       // true regime (hidden; the public label lags, §3.3.6)
  outputGap: number;                           // x, fraction (0.01 = 1%)
  outputGapTarget: number;                     // x_target this day (§3.4.1), diagnostics
  potentialGrowth: number;                     // g_pot including AI productivity, per game year
  realGdpIndex: number;                        // level, 100 at genesis
  potentialGdpIndex: number;
  nominalGdp: Money;                           // annualized, local ccy, micro-units (§3.2)
  gdpGrowthQoQAnn: number;                     // trailing 91-day annualized real growth
  coreInflation: number;                       // yoy rate
  headlineInflation: number;
  inflationExp1y: number;                      // π_e1
  inflationExp5y5y: number;                    // π_e5 (long anchor)
  cpiLevel: number;                            // 100 at genesis, headline
  coreCpiLevel: number;
  wageIndex: number;                           // 100 at genesis
  wageGrowth: number;
  unemployment: number;
  rStar: number;                               // true neutral real rate (hidden)
  creditGap: number;                           // credit/GDP minus trend, from 07 aggregates (§3.14.4)
  creditGrowth: number;                        // yoy
  creditConditions: number;                    // −1 (tight) … +1 (loose), from 07
  housePriceGap: number;                       // from 10, ln(index / trend)
  realRateGapSmoothed: number;                 // R̃, §3.4.1
  fiscal: FiscalState;                         // §2.7
  fx: FxState;                                 // §2.9
  sovereign: SovereignCreditState;             // §2.8
  imbalance: Record<ImbalanceKey, number>;     // z-scores computed at day close, §3.3.3
  shocks: ActiveShock[];                       // crisis and event shocks currently applied, §3.16
}
type ImbalanceKey = 'credit' | 'valuation' | 'curve' | 'inflation' | 'house' | 'oil' | 'fiscal' | 'fear' | 'contagion' | 'policy' | 'overheat' | 'trade';
interface ActiveShock { id: string; target: string; value: number; startTick: Tick; endTick: Tick; shape: 'STEP' | 'RAMP' | 'DECAY'; halfLifeDays?: number; sourceCrisisId?: string; }
```

### §2.4 Public macro view (`PublicMacroView`, sent on the `macro:{bloc}` channel, 17 §2.6)

```ts
interface PublicMacroView {
  bloc: BlocId; asOfTick: Tick;
  prints: Record<ReleaseKind, LatestPrint | null>;   // last published value of each release
  cycleLabel: Regime | 'UNDETERMINED'; cycleLabelSinceDay: number;   // declared by the Cycle Committee, lagged
  policyRate: number; depositRate: number; lendingRate: number; reserveRequirement: number;
  nextMeeting: { tick: Tick; guidanceTick: Tick } ;
  guidance: { tick: Tick; score: number; text: string } | null;      // hawk/dove score −1..+1
  dots: { horizonQuarters: 1 | 2 | 4 | 8; rate: number }[];          // CB published projection
  marketImpliedPath: { horizonQuarters: 1 | 2 | 4 | 8; rate: number }[];
  curve: CurvePoint[];                                               // 3M … 30Y sovereign yields
  ois: CurvePoint[]; breakeven10y: number; termPremium10y: number;
  sovereignSpread10y: number; sovereignPd1y: number;                 // market-implied (from spread, §3.11.3)
  fiscalPrints: { deficitGdp: number; debtGdp: number; primaryBalanceGdp: number; asOfQuarter: number };
  fx: { spotVsFdl: number; regime: FxRegimeKind; band?: { center: number; halfWidth: number };
        reservesFdl: string; reserveCoverMonths: number; capitalControls: 0 | 1 | 2 | 3 };
  qeHoldingsGdp: number; ccyb: number; ltvCapResidential: number; ltvCapCommercial: number;
  credibilityPublic: number;                   // 0..100, published as the "Credibility gauge"
}
interface LatestPrint { kind: ReleaseKind; tick: Tick; actual: number; consensus: number; prior: number; revisedPrior?: number; surprise: number; }
interface CurvePoint { tenorYears: number; yield: number; }
```

Rule: the public view contains only released prints, policy settings, and market-implied quantities. It never contains `regime`, `outputGap`, `rStar`, hawkishness, `creditGap` or any planned crisis. 17 and 19 may cache it; nothing else is ever sent.

### §2.5 Global macro state

```ts
interface GlobalMacroState {
  tick: Tick;
  globalRegime: Regime; globalRegimeSinceTick: Tick;
  fearIndex: number;               // F, 0..100, public ("Fear Index", the game VIX)
  riskAppetite: number;            // RA = 1 − F/50, in [−1, +1], public
  financialStressIndex: number;    // FSI, 0..1, public on MKT-07 (§3.14.2)
  worldTradeIndex: number;         // 100 at genesis
  tariffLevel: number;             // average tariff, 0..0.4, set by TRADE_WAR shocks and 16 politics
  worldScale: number;              // S_world, §3.2
  worldNominalGdpFdl: Money;
  energyIndex: number;             // from 06 crude, gas, MWh; 100 at genesis
  foodIndex: number;               // from 06 grains, coffee, cocoa
  aiRaceIndex: number;             // from 11 (0..100)
  worldHackRate: number;           // from 12 (0..100)
  geopoliticalTension: number;     // from 16 (0..100)
  chapterIndex: number;
  scheduler: CrisisSchedulerState; // §2.10
  stabilizer: StabilizerState;     // §2.11
}
```

### §2.6 Central bank

```ts
interface CentralBank {
  id: string; bloc: BlocId; name: string;          // names in 22
  mandate: 'PRICE_STABILITY' | 'DUAL';             // EC, NA, SC price stability; FU, PL dual
  hawkishness: number;                             // hidden, drawn at genesis from the bloc range (§3.6.2)
  hawkDrift: number;                               // hidden slow random walk component
  credibility: number;                             // 0..1, published ×100
  smoothing: number;                               // ρ, share of the gap closed per scheduled meeting
  phiPi: number; phiX: number; phiFs: number; phiFx: number; bias: number;   // derived, §3.6.2
  rStarEstimate: number;                           // CB's own estimate of r* (hidden)
  policyRate: number;
  corridorHalfWidth: number;                       // deposit = i − w, lending = i + w
  reserveRequirement: number;                      // share of eligible deposits (07 applies)
  iorTierMultiple: number;                         // reserves up to this × requirement earn the policy rate
  meetings: MeetingSchedule;
  lastDecisions: CbDecision[];                     // last 16
  guidance: ForwardGuidance | null;
  dots: { horizonQuarters: number; rate: number }[];
  qe: AssetPurchaseProgram;
  ycc: YieldCurveControl | null;                   // PL only by default
  macroprudential: { ccyb: number; ltvCapResidential: number; ltvCapCommercial: number; dtiCap: number };
  facilities: FacilityTerms;
  swapLinesOut: SwapLine[];                        // lines this CB provides (FU by default)
  reserves: { fdl: Money; gold: Qty; otherFx: Record<Ccy, Money> };   // FX reserves (gold valued at 06 spot)
  balanceSheet: { govBonds: Money; corpBonds: Money; abs: Money; loansToBanks: Money; elaOutstanding: Money; bankReserves: Money; currencyInCirculation: Money };
  emergencyCountQuarter: number;
}

interface MeetingSchedule { scheduledTicks: Tick[]; guidanceLeadTicks: number; minutesLagTicks: number; }
interface CbDecision {
  meetingId: string; tick: Tick; emergency: boolean;
  previousRate: number; newRate: number;
  ruleRate: number;                                // i* this meeting
  ruleTerms: { neutral: number; inflation: number; inflationGap: number; outputGap: number; finStress: number; fx: number; bias: number };
  voteFor: number; voteAgainst: number;            // 9-member board, §3.6.5
  qeChangePerMonth: Money; statementKey: string; reasons: string[];   // reason keys for 16 and the explain ladder
}
interface ForwardGuidance { meetingId: string; tick: Tick; score: number; impliedMove: -2 | -1 | 0 | 1 | 2; textKey: string; }
interface AssetPurchaseProgram {
  state: 'NONE' | 'QE' | 'HOLD' | 'QT';
  purchasesPerMonth: Money;                       // local ccy, gross
  eligible: { govBonds: number; corpIG: number; abs: number };   // weights sum 1
  holdingsCapGdp: number;                         // default 0.35
  qtRunoffCapPerMonth: number;                    // share of holdings
  startedTick?: Tick;
}
interface YieldCurveControl { tenorYears: 10; capYield: number; active: boolean; startedTick: Tick; }
interface FacilityTerms {
  lendingRate: number; depositRate: number;
  collateralHaircuts: Record<string, number>;     // by RatingGrade bucket and asset kind, §3.8.3
  elaPenaltySpread: number;
  maxTermDays: number;                            // longest standing repo term
}
interface SwapLine { counterpartyCbk: string; limit: Money; spread: number; active: boolean; drawn: Money; }
```

### §2.7 Treasury, fiscal state, issuance and auctions

```ts
interface FiscalState {
  revenueGdp: number; spendingGdp: number; interestGdp: number;
  primaryBalanceGdp: number; deficitGdp: number;            // deficit = −(primary − interest)
  debt: Money; debtGdp: number; fxDebt: Money;              // fxDebt in FDL micro-units (SC only by default)
  averageCoupon: number; averageMaturityYears: number;
  cashBuffer: Money;                                        // treasury account at the CB
  grossFinancingNeedQuarter: Money;
  programs: FiscalProgram[];
  austerityMode: boolean;
  swfAssets: Money;                                         // NA only; mirrors 08 SWF NPC entity
}
interface FiscalProgram {
  id: string; bloc: BlocId; kind: 'INFRASTRUCTURE' | 'GREEN_ENERGY' | 'AI_COMPUTE' | 'HOUSING' | 'DEFENSE_SECURITY'
                              | 'TAX_CUT' | 'HOUSEHOLD_TRANSFER' | 'INDUSTRIAL_SUBSIDY' | 'AUSTERITY';
  sizeGdpPerYear: number;            // + spending or − (austerity, tax rise)
  sectorDemand: Record<number, number>;   // sector index → demand multiplier add (09 consumes)
  incentive?: { target: 'CAPEX_SECTOR' | 'COMPUTE_SPEND' | 'MORTGAGE_RATE' | 'HIRING'; sector?: number; rate: number };
  budget: Money; spent: Money;             // incentives stop when spent ≥ budget (§3.9.4)
  startTick: Tick; endTick: Tick;
  source: 'AUTOMATIC' | 'POLITICS' | 'CRISIS_RESPONSE' | 'CONCORD_CONDITIONALITY';
  sponsorActorIds: string[];          // 16 lobbying sponsors (public after passage)
}
interface SovereignIssue {             // 06 creates the bond asset from this
  assetId: string; govId: string; tenor: Tenor; ccy: Ccy;
  couponRate: number; issueTick: Tick; maturityTick: Tick; faceOutstanding: Qty;
  inflationLinked: boolean; fxDenominated: boolean; cac: { threshold: number; aggregated: boolean };
  onTheRun: boolean;
}
interface SovAuction {
  id: string; govId: string; assetId: string; tenor: Tenor; reopening: boolean;
  announceTick: Tick; bidOpenTick: Tick; auctionTick: Tick;   // §3.10.2
  offeredFace: Qty; whenIssuedYield: number | null;
  bids: AuctionBid[];                    // sealed until auctionTick; never published individually
  result?: { stopYield: number; allotmentAtStopPct: number; bidToCover: number; tailBp: number;
             awardedFace: Qty; npcShare: number; playerShare: number; failed: boolean };
}
interface AuctionBid {
  bidId: string; auctionId: string; bidderId: string;   // entity id (chr, cmp, fnd, bnk, npc)
  kind: 'COMPETITIVE' | 'NONCOMPETITIVE';
  yieldBp?: number;                     // competitive only, integer basis points ×100 (1e-6)
  face: Qty; cashHoldId: string;        // 07/03 hold for face × max price
  submittedTick: Tick; primaryDealer: boolean;
}
interface Buyback { id: string; govId: string; assetIds: string[]; maxFace: Qty; tick: Tick; offers: { offerId: string; holderId: string; assetId: string; face: Qty; minPrice: Price }[]; }
interface Syndication { id: string; govId: string; assetId: string; size: Qty; leadManagers: string[]; bookOpenTick: Tick; pricingTick: Tick; guidanceSpreadBp: number; feeRate: number; }
```

### §2.8 Sovereign credit

```ts
interface SovereignCreditState {
  hazard: number;                       // λ, annual default intensity, §3.11.1
  pd1y: number; pd5y: number;           // 1 − e^(−λ·T), with term structure §3.11.2
  spread10y: number;                    // credit spread over OIS, decimal
  liquidityPremium: number;
  convenienceYield: number;             // negative spread for the reserve issuer
  stressIndex: number;                  // 0..1 sovereign stress composite
  failedAuctions21d: number;
  status: 'PERFORMING' | 'GRACE' | 'SELECTIVE_DEFAULT' | 'RESTRUCTURING' | 'POST_RESTRUCTURING';
  defaultCase?: SovereignDefaultCase;
  ratingInputs: SovereignRatingInputs;  // handed to 08 every day close
}
interface SovereignRatingInputs {
  govId: string; tick: Tick; debtGdp: number; interestRevenue: number; primaryBalanceGdp: number;
  realGrowthTrend: number; inflationVol: number; reserveCoverMonths: number; fxDebtShare: number;
  cbCredibility: number; politicalStability: number;   // from 16, 0..1
  marketPd1y: number; modelPd1y: number;
}
interface SovereignDefaultCase {
  id: string; govId: string; triggerTick: Tick; trigger: 'FAILED_ROLLOVER' | 'FX_SERVICE' | 'POLITICAL' | 'HAZARD';
  missedPayment: { assetId: string; amount: Money; dueTick: Tick };
  graceEndsTick: Tick;
  offers: ExchangeOffer[];
  resolvedTick?: Tick; recoveryNpv?: number;
}
interface ExchangeOffer {
  id: string; round: 1 | 2 | 3; openTick: Tick; closeTick: Tick;
  haircutNpv: number;                   // 0.20..0.60
  newBonds: { tenor: Tenor; couponRate: number; maturityYears: number; facePer100: number }[];
  consentSoFar: number;                 // share of eligible face voting ACCEPT
  status: 'OPEN' | 'ACCEPTED' | 'FAILED';
}
```

### §2.9 FX state

```ts
interface FxState {
  ccy: Ccy;
  fairValueLn: number;                  // ln fundamental FDL per unit (05 uses as value layer V)
  pppLn: number;                        // ln PPP fair rate
  realExchangeGap: number;              // ln(S·P_local/P_FDL) − ln(PPP real), q̃
  regime: FxRegimeKind;
  band?: { centerLn: number; halfWidth: number; basket: Partial<Record<Ccy, number>> };
  reservesFdl: Money; reservesTarget: Money; reserveCoverMonths: number;
  currentAccountGdp: number; capitalFlowIndex: number;      // −1 outflow … +1 inflow
  exchangeMarketPressure: number;       // EMP, §3.13.5
  capitalControls: 0 | 1 | 2 | 3;
  capitalControlsUntilTick?: Tick;
  interventionToday: Money;             // signed, FDL micro-units; + = CB buying local currency
  crisisFlag: boolean;
}
```

### §2.10 Crisis scheduler and crises

```ts
interface CrisisSchedulerState {
  lastMajorEndTick: Tick | null; lastMajorStartTick: Tick | null; majorsThisChapter: number;
  playerCausedSuppressUntil: Tick | null;
  timezoneBandNext: 0 | 1 | 2;          // rotates start-hour band for majors, §3.16.3
  crisisWeek: { announcedTick: Tick; startTick: Tick; endTick: Tick } | null;
  crisisWeekUsedThisChapter: boolean;
  activeMajorId: string | null; activeStormIds: string[]; activeRippleIds: string[];
}
interface WorldEvent {
  id: string; tier: EventTier; kind: CrisisKind | StormKind | RippleKind;
  blocs: BlocId[]; sectors: number[]; assetsHint: string[];   // never sent to clients before public news exists
  phase: CrisisPhase; phaseSinceTick: Tick;
  precursorStartTick: Tick; triggerTick: Tick; plannedEndTick: Tick;   // hidden
  origin: 'SCHEDULED' | 'EMERGENT' | 'PLAYER_CAUSED';
  severity: number;                     // 0.5..1.5 drawn, scales shock vectors
  shocks: ActiveShock[];                // applied to 04 variables and to other modules via hooks
  publicTitleKey: string | null;        // set once the first public news is emitted
  causeChain: { tick: Tick; key: string; refs: string[] }[];   // causal record for 16 and the archive
}
```

### §2.11 Stabilizer

```ts
interface StabilizerState {
  errorLog: number;                     // e, copied from 03 §3.7.2 for the weekly report (§3.17)
  integral: number;                     // copied from 03 §3.7.3 (03 owns)
  msi: number;                          // copied from 03 §3.8 (03 owns)
  levers: {
    // read-only mirror of 03 StabilizerState.levers (03 §2.8, §3.7.4); 04 never writes them (ruling in 24)
    L1_demand: number; L2_lifestyle_price: number; L3_levy_bp: number; L4_upkeep: number;
  };
  lastPublishedReportTick: Tick;
  diagnostics: { faucetsWeek: Money; sinksWeek: Money; netMintWeek: Money; npcToPlayerWealthRatio: number; m0Index: number; m2Index: number };
}
```

### §2.12 Data releases

```ts
interface ReleaseSchedule { bloc: BlocId; kind: ReleaseKind; rule: 'MONTHLY_DAY' | 'QUARTERLY_DAY' | 'WEEKLY_DAY'; dayOffset: number; tickOfDay: number; }
interface DataRelease {
  id: string; bloc: BlocId; kind: ReleaseKind; scheduledTick: Tick; releasedTick: Tick;
  referencePeriod: { kind: 'MONTH' | 'QUARTER' | 'WEEK'; index: number };
  trueValue: number;                    // hidden
  actual: number;                       // published value (true + measurement error, rounded)
  consensus: number;                    // NPC analyst consensus, published 1 game day before
  consensusDispersion: number;          // published as "range"
  prior: number; revisedPrior?: number;
  surprise: number;                     // (actual − consensus) / historical σ of surprises for this kind
}
```

### §2.13 Concord Stability Facility

```ts
interface ConcordFacility {           // npc_CSF, a supranational lender funded by quotas of the five blocs
  id: 'npc_CSF'; quotas: Record<BlocId, Money>;          // FDL micro-units; default quota = 2% of bloc GDP
  lendingCapacity: Money;                                 // Σ quotas × 3
  programs: { bloc: BlocId; size: Money; drawn: Money; rate: number; startTick: Tick; endTick: Tick;
              conditions: { primaryBalanceStepPerYear: number; cbIndependence: boolean; capitalControlsPhaseOutDays: number };
              compliance: number }[];
}
```

---
## §3 Rules and formulas

Notation follows 00 §3.4. In this module `Δ = 1/364` game years (one game day), `d` is one game day, "trading day" is Mon–Fri. All rates are annual decimals unless stated. `EWMA(x, h)` is an exponentially weighted moving average with half-life `h`, updated once per game day as `m ← m + (x − m)·(1 − 2^(−1/h))`. All random draws use 02's named streams (§3.19).

### §3.1 What runs when

| Phase (00 §5.2) | Cadence | 04 work |
|---|---|---|
| P2 calendar | every tick | release ticks: publish due `DataRelease`s, recompute market expectations and curves for that bloc (§3.7); CB decision and guidance ticks (§3.6); auction announcements (§3.10); FX regime events at their tick |
| P2 calendar | every 30 ticks (game hour), offset 0 | Fear Index and FSI update (§3.14) |
| P2 calendar | day close, t = 719, every calendar day (weekends included) | the **macro day step**, in this exact order: (1) read inputs from other modules (committed through tick 718); (2) global indicators; (3) regimes (§3.3); (4) output gap, growth, unemployment, wages (§3.4); (5) inflation and expectations (§3.5); (6) fiscal accounts (§3.9); (7) sovereign credit (§3.11); (8) FX fair values and regime checks (§3.13); (9) curves (§3.7); (10) macroprudential settings (§3.8.8); (11) crisis scheduler (§3.16); (12) Stabilizer (§3.17); (13) emit events |
| P4 npc | every tick | CB, treasury and Concord NPC orders are handed to 05 as pool orders (§6.3) |
| P6 match (FINANCE partition, 19) | auction ticks | primary auctions, buybacks, syndication pricing (§3.10) |
| P8 finance | day close | coupons and redemptions of sovereign bonds, facility interest, IOR, reserve shortfall penalties (§3.18) |

Macro state is world-global and lives on the COORD partition (19 §3); FINANCE partitions read it through the snapshot published at the end of P2 of the same tick.

### §3.2 World scale and GDP

1. Activity-weighted players `N_a` come from 02/15 (`N_a = Σ e^(−daysSinceActive/7)`, real days).
2. World scale target `S* = clamp(N_a / PARAM.macro_scale_ref_players, PARAM.macro_scale_min, PARAM.macro_scale_max)` with `macro_scale_ref_players = 5,000`, `macro_scale_min = 0.2`, `macro_scale_max = 400`.
3. Each day close: `S ← S + clamp(S* − S, −0.005·S, +0.005·S)` (at most ±0.5% per game day, so scale never jumps).
4. Bloc nominal GDP in local currency (annualized flow):
   `nominalGdp_b = toMoney(PARAM.macro_world_gdp_ref × S × gdpShare0_b × (realGdpIndex_b/100) × (cpiLevel_b/100) / fx0_b, ccy_b)` with `macro_world_gdp_ref = 100e12` FDL per game year at `S = 1`. `fx0_b` is the genesis FDL-per-unit rate (§2.2). Bloc shares therefore drift with relative real growth and inflation.
5. World nominal GDP in FDL `= Σ_b nominalGdp_b × spot_b` (05 last FX prints).
6. City activity for 10 and 09: `cityActivity(cityId) = cityGdpShare_c × (1 + cycleBeta_c × x_b)` and `cityNominalGdp_c = nominalGdp_b × cityActivity_c`. `cityGdpShare_c` (sums to 1 within a bloc) and `cycleBeta_c` (0.6 stable … 1.8 volatile, Sundara Coast highest, Nordhaven City lowest) are authored in 22; 10 may add development-score effects on top.
7. Monitor (not a control): `npcToPlayerWealthRatio = worldNominalGdpFdl / Σ player-economy NW` (03). Target band `[20, 200]` (old 01 §14.1 "about 50×"). 20 reports breaches.

### §3.3 Business cycle regimes

#### §3.3.1 Base chain (old 01 §5.3, docs/ENGINE.md, converted to the 364-day year)

| From | To (base probability) | Mean length (game days) | Minimum length |
|---|---|---|---|
| EXPANSION | OVERHEATING 0.80, CONTRACTION 0.20 | 819 (2.25 game years; band 1.5–3) | 182 |
| OVERHEATING | CONTRACTION 0.85, EXPANSION 0.15 (soft landing) | 273 | 63 |
| CONTRACTION | RECOVERY 1.00 | 273 | 91 |
| RECOVERY | EXPANSION 0.90, CONTRACTION 0.10 (double dip) | 273 | 91 |

Parameters: `PARAM.macro_regime_mean_days_{exp,ovh,con,rec}` and `PARAM.macro_regime_min_days_{…}` as in the table.

#### §3.3.2 Daily transition algorithm (per bloc, and once for the global chain)

1. If days in regime `< min_s`, no transition.
2. Base hazard `λ_s = 1 / (mean_s − min_s)` per game day.
3. For each allowed target `s'`: multiplier `M_{s→s'} = exp( Σ_k w_{s→s',k} · clamp(z_k, −2, 3) )` (weights §3.3.4).
4. For a bloc (not the global chain), coupling: if the global regime is CONTRACTION, `M_{s→CONTRACTION} ×= exp(0.6 × cycleCoupling_b)`; if the global regime is RECOVERY or EXPANSION and the bloc is in CONTRACTION, `M_{CONTRACTION→RECOVERY} ×= exp(0.4 × cycleCoupling_b)`.
5. Total hazard `H = λ_s × Σ_{s'} P_base(s→s') × M_{s→s'}`. Draw `u ~ U(0,1)` from `macro:<bloc>:regime`. Transition if `u < 1 − e^(−H)`.
6. If transitioning, choose `s'` with probability `P_base(s→s') × M_{s→s'} / Σ`. A second draw from the same stream picks it.
7. A crisis shock may force a regime (§3.16.6 "force CONTRACTION"); a forced transition ignores the minimum length and is logged with the crisis id.

#### §3.3.3 Imbalance z-scores (computed at day close, step 1 of the macro step)

| Key | Formula | Source |
|---|---|---|
| `credit` | `creditGap / 0.05` | 07 aggregates (§3.14.4) |
| `valuation` | `ln(PE_agg_b / PE_norm_b) / 0.25`, PE of the bloc's equity index | 05 prices, 06/09 earnings; `PE_norm_b` = 5-game-year trailing mean, genesis value from 22 |
| `curve` | if `y10 − y3m < 0`: `(inversionDays/63) + (y3m − y10)/0.005`, else `−0.5` | §3.7 |
| `inflation` | `(coreInflation − π_target)/0.015` | §3.5 |
| `house` | `housePriceGap / 0.15` | 10 |
| `oil` | `ln(energyIndex_t / energyIndex_{t−63})/0.30` (sign flipped for exporters: `× (1 − 2·max(0, commodityExporter))`) | 06 |
| `fiscal` | `sovereign.stressIndex / 0.25` | §3.11 |
| `fear` | `(F − 50)/20` | §3.14 |
| `contagion` | `(share of world GDP of other blocs in CONTRACTION − 0.2)/0.2` | §3.3 |
| `policy` | `realRateGapSmoothed / 0.015` (positive = tight) | §3.4.1 |
| `overheat` | `outputGap / 0.01` | §3.4 |
| `trade` | `−ln(WTI_t / WTI_{t−182})/0.05` | §3.14 |
| `stimulus` | `(−realRateGapSmoothed + fiscalImpulse)/0.01` | §3.4, §3.9 |

All z are clamped to [−3, 4] at storage. The global chain uses the GDP-weighted average of bloc z.

#### §3.3.4 Hazard weights `w_{s→s',k}` (DEFAULT; 20 calibrates within ±50%)

| Transition | Weights |
|---|---|
| EXP→OVH | overheat 0.5, inflation 0.4, credit 0.3, valuation 0.2, policy −0.4 |
| EXP→CON | credit 0.4, valuation 0.35, curve 0.5, policy 0.45, oil 0.3, fear 0.4, contagion 0.6, house 0.3, fiscal 0.2, trade 0.3 |
| OVH→CON | the EXP→CON weights plus inflation 0.3 |
| OVH→EXP | credit −0.4, inflation −0.3, valuation −0.2 |
| CON→REC | stimulus 0.4, contagion −0.4, fear −0.3 |
| REC→EXP | stimulus 0.2, fear −0.2 |
| REC→CON | fear 0.4, policy 0.4, contagion 0.5 |

#### §3.3.5 Effects of the regime
- **On the economy** (04): the attractor gap `x_reg` (§3.4.1).
- **On prices** (05 §3.3): volatility, jump intensity, jump skew, crisis correlation multipliers keyed by the bloc regime (05 owns the multiplier table).
- **On credit** (07): NPC bank lending standards drift looser in EXPANSION and OVERHEATING, tighter in CONTRACTION (V3 3.1 credit cycle; 07 owns the rule, 04 supplies the regime).

#### §3.3.6 Public cycle label (the Cycle Committee)
The true regime is hidden. Each bloc's statistics office has a Cycle Committee (name in 22). At each day close, the label changes to the true regime `s` when all hold: (a) the true regime has lasted ≥ `PARAM.macro_cycle_label_lag_days = 21` game days; (b) for CONTRACTION: the latest published GDP_ADV or GDP_REV q/q annualized growth is below 0, or published unemployment is ≥ 0.5 pp above its 12-month low; for EXPANSION or RECOVERY: the latest published growth is above 0; for OVERHEATING: published core CPI ≥ target + 1 pp and published unemployment below NAIRU. Until a regime is declared after genesis, the label is `UNDETERMINED`. Event `macro.cycle.declared` (PUBLIC). Reading the regime before the committee does is a research skill.

### §3.4 Output gap, growth, unemployment, wages

#### §3.4.1 Output gap
Each day close, per bloc:
1. Real rate gap `R = i − π_e1 − r*`. Smoothed transmission `R̃ ← EWMA(R, PARAM.macro_policy_lag_days = 120)`.
2. Attractor by regime `x_reg`: EXPANSION +0.5%, OVERHEATING +2.5%, CONTRACTION −4.0%, RECOVERY −1.0% (`PARAM.macro_xreg_*`).
3. Channel terms (each a `PARAM.macro_x_*` coefficient):

| Channel | Term added to `x_target` | Default coefficient |
|---|---|---|
| Monetary | `−a_r × R̃` | `a_r = 0.5` |
| Fiscal | `+m × FI` (fiscal impulse §3.9.5; `m = 0.8 × (1 − 0.5 × stress)`, ×1.25 when the policy rate is at the ELB) | 0.8 |
| Credit | `+a_c × creditConditions` | `a_c = 0.012` |
| External demand | `+a_e × openness × x_others` (GDP-weighted gap of the other four blocs) | `a_e = 0.4` |
| Real exchange rate | `−a_q × q̃` (q̃ > 0 means overvalued) | `a_q = 0.10` |
| Energy | `−a_o × e_yoy × (1 − 1.5 × commodityExporter)` with `e_yoy = ln(energyIndex/energyIndex_{−364})`, clamped ±1.5 | `a_o = 0.03` |
| Fear | `−a_f × (F − 30)/20` | `a_f = 0.010` |
| Wealth | `+a_w × ln(EQ_b / mean364(EQ_b)) + a_h × housePriceGap` (EQ_b bloc equity index, 05) | `a_w = 0.05`, `a_h = 0.08` |
| Trade | `+a_t × openness × ln(WTI / mean364(WTI))` | `a_t = 0.2` |
| Cyber | `−a_k × max(0, worldHackRate − 70)/30` | `a_k = 0.010` |
| Crisis shocks | `+Σ shock.value` for active shocks targeting `x_target` | §3.16 |

4. `x_target = clamp(x_reg + Σ terms, −0.12, +0.08)`.
5. `x ← x + θ_x × (x_target − x) × Δ + σ_x × √Δ × ε`, with `θ_x = ln2 / PARAM.macro_gap_halflife_years (0.30)`, `σ_x = PARAM.macro_gap_vol = 0.008`, `ε ~ N(0,1)` from `macro:<bloc>:gap`.

#### §3.4.2 Growth and levels
- Potential growth `g_pot = potentialGrowth0 + PARAM.macro_ai_productivity_max (0.005) × (aiRaceIndex − 50)/50 × techShare_b` (techShare FU 1.0, PL 0.9, EC 0.5, NA 0.5, SC 0.3), recomputed daily.
- `potentialGdpIndex ← potentialGdpIndex × e^(g_pot·Δ)`; `realGdpIndex = potentialGdpIndex × (1 + x)`.
- `gdpGrowthQoQAnn = 4 × ln(realGdpIndex_t / realGdpIndex_{t−91})`.

#### §3.4.3 Unemployment and wages
- Okun: `u_target = u* − 0.5 × x`; `u ← u + (u_target − u) × (1 − 2^(−Δ/0.2))`; floor 1.5%, cap 30%.
- Nominal wage growth `w = π_e1 + (g_pot − laborForceGrowth) − 0.5 × (u − u*)`; `wageIndex ← wageIndex × e^(w·Δ)`. 09 indexes NPC and staff wages to `wageIndex` (old 01 §5.5: inflation raises wages; strikes when wages lag, 09).

#### §3.4.4 Neutral rate
`r* ← r*_0 + 0.5 × (g_pot − potentialGrowth0) + RW`, where `RW` is a random walk with `σ = 0.001/√yr` on `macro:<bloc>:rstar`, clamped to `r*_0 ± 1.0%`. Hidden. The central bank estimates it as `r*_cb = r* + bias_rstar` where `bias_rstar ~ U(−0.5%, +0.5%)` is drawn at each governor appointment (§6.1).

### §3.5 Inflation, expectations and price indices

There are two inflations (old 01 §5.5). **World inflation** is this section: it drives rates, NPC prices, wages, rents and input costs, and it erodes cash. **Game monetary inflation** is the player money supply relative to its designed path; the Stabilizer (§3.17) keeps it near zero.

Each day close, per bloc:
1. Effective depreciation `dep = −ln(S_eff,t / S_eff,t−364)` where `S_eff` is the trade-weighted value of the currency against the other four (weights = other blocs' GDP shares). FDL uses the same definition.
2. Core target: `π_core* = π_e1 + κ × mean90(x) + fxPassThrough × dep`, `κ = PARAM.macro_phillips_slope = 0.25`.
3. `π_core ← π_core + θ_π × (π_core* − π_core) × Δ + σ_π × √Δ × ε`, `θ_π = ln2/0.5`, `σ_π = 0.003`, stream `macro:<bloc>:infl`; clamp [−5%, 60%].
4. `coreCpiLevel ← coreCpiLevel × e^(π_core·Δ)`.
5. Headline level `cpiLevel = coreCpiLevel × (E_loc,t / E_loc,0)^energyWeight × (Fd_loc,t / Fd_loc,0)^foodWeight`, where `E_loc = energyIndex / spot_b` and `Fd_loc = foodIndex / spot_b` (commodities priced in FDL, converted at the bloc spot). `headlineInflation = ln(cpiLevel_t / cpiLevel_{t−364})`.
6. Expectations, with `cred = credibility` (0..1):
   - `π_e1 ← π_e1 + θ_e1 × ((1 − cred) × headlineInflation + cred × π_target − π_e1) × Δ`, `θ_e1 = ln2/0.25`.
   - `π_e5 ← π_e5 + θ_e5 × ((1 − cred)² × π_e1 + (1 − (1 − cred)²) × π_target − π_e5) × Δ`, `θ_e5 = ln2/1.0`.
7. Price indices served to other modules (`priceIndex(bloc, kind)`): `CPI` (= cpiLevel), `CORE`, `WAGE`, `ENERGY_LOCAL`, `FOOD_LOCAL`. 09 (input costs, wages), 10 (rents, construction) and 14 (lifestyle prices, together with 03's Stabilizer lever L2, 03 §3.7.4) read them. Rule: nominal prices in the game are authored at genesis levels and multiplied by the relevant index ratio; nobody else compounds inflation.

### §3.6 Central bank policy

#### §3.6.1 Meeting calendar
- Scheduled meetings: `PARAM.macro_cb_meetings_per_year = 4` per bloc, one per game quarter. Each quarter has 65 trading days; the meeting is on trading day `q_b` of the quarter: NA 15, SC 27, FU 39, EC 51, PL 63, at `t = PARAM.macro_cb_decision_tick = 420`. So some central bank decides about every 12 trading days (about 0.7 real day).
- **Resolves an old inconsistency:** old 01 §1 put central bank meetings in the quarterly rhythm, old 01 §5.4 said "every ~6 real days". This spec keeps quarterly meetings per bloc (about every 3.8 real days per bloc, staggered across the five blocs).
- Forward guidance: published `guidanceLeadTicks = 24 × 720` (24 game days, one real day) before the meeting, at `t = 420`, moved to the previous trading day if it lands on a weekend.
- Minutes: published 14 game days after the meeting at `t = 420` (next trading day if a weekend).
- Emergency meetings: §3.6.6.

#### §3.6.2 Personality (hidden)
At genesis and at each governor appointment (§6.1) draw `hawk ~ U(hawkMin_b, hawkMax_b)` on `macro:<bloc>:cb`. Between appointments `hawk` drifts as a random walk with `σ = 0.05/√yr`, clamped to the bloc range. Derived coefficients:
- `φ_π = 0.5 + 0.6 × (hawk − 0.5)` (0.2 … 0.8)
- `φ_x = 0.5 − 0.5 × (hawk − 0.5)` (0.25 … 0.75); for `mandate = PRICE_STABILITY`, `φ_x × 0.7`
- `bias = 0.005 × (hawk − 0.5)`
- `φ_fs = PARAM.macro_cb_phi_fs = 1.5`
- `φ_fx`: SC 0.30 (on depreciation beyond 15% yoy), PL 0.20 (on any yoy move; leans against appreciation too), others 0.
- `ρ = PARAM.macro_cb_smoothing = 0.5`.

#### §3.6.3 The rule (old 01 §5.4 Taylor rule, extended)
The CB uses published data only:
- `π_cb` = latest published core CPI yoy.
- `x_cb = 0.5 × x_gdp_pub + 0.5 × (−2 × (u_pub − u*))`, where `x_gdp_pub` is the true gap at the tick of the latest GDP print plus that print's measurement error (§3.15.2), and `u_pub` the latest published unemployment.
- `FSI_ex = max(0, FSI − 0.3)`.
- `fxTerm`: SC `max(0, dep_yoy − 0.15)`; PL `dep_yoy`; others 0.

`i* = r*_cb + π_cb + φ_π × (π_cb − π_target) + φ_x × x_cb − φ_fs × FSI_ex + φ_fx × fxTerm + bias`

The decomposition `ruleTerms` is stored on every decision so the explain ladder and the CB statement can cite causes.

#### §3.6.4 Decision at a scheduled meeting
1. Recompute `i*` at the meeting tick.
2. `Δraw = ρ × (i* − i)`.
3. If `|Δraw| < 0.00125` (12.5 bp): hold.
4. Else `Δ = 0.0025 × roundHalfEven(Δraw / 0.0025)`, clamped to ±0.0050, or ±0.0075 when `|i* − i| ≥ 0.02` (`PARAM.macro_cb_max_step = 0.005`, `PARAM.macro_cb_max_step_wide = 0.0075`).
5. `i_new = max(elb_b, i + Δ)`.
6. QE/QT and YCC decisions (§3.8.5, §3.8.6) are taken at the same meeting.
7. Votes: 9 members, each with a fixed offset `o_j ~ N(0, 0.15)` drawn at appointment. Member preference = the rule rate computed with `hawk + o_j`, smoothed the same way. A member votes FOR if `|pref_j − i_new| ≤ 0.0025`, else AGAINST. The tally is in the decision; the direction of dissent ("two members preferred a larger hike") appears in the minutes. This is the main public clue to hidden hawkishness.
8. Emit `macro.cb.decision` (PUBLIC) with the new corridor rates, statement key (chosen from 16's template library by: direction, size, guidance match, dominant `ruleTerms` component) and reasons.

#### §3.6.5 Forward guidance and dots
- At the guidance tick: `i*_proj` = the rule rate on data published so far; `impliedMove = clamp(roundHalfEven(ρ × (i*_proj − i)/0.0025), −2, +2)`; `score = clamp(impliedMove/2 + (1 − communicationClarity) × N(0, 0.3), −1, 1)` on `macro:<bloc>:cb`. Text key from the score band (very dovish < −0.6, dovish < −0.2, neutral, hawkish > 0.2, very hawkish > 0.6).
- Dots: projections at +1, +2, +4, +8 quarters, computed by iterating the rule quarterly from today's published data with the CB's own forecast paths: `π_cb` converges to `π_target` with half-life 0.75 game years, `x_cb` to 0 with half-life 0.5, FSI to 0.2 with half-life 0.25; apply smoothing and step limits each quarter.
- **Credibility effects:** a decision against the guidance direction (score ≥ +0.25 then a cut, or ≤ −0.25 then a hike) costs `−PARAM.macro_cred_guidance_break = 0.05`. A move that differs from `impliedMove` by ≥ 2 steps when no release since guidance had `|surprise| ≥ 2` costs `−0.03`.

#### §3.6.6 Emergency meetings
Triggered at a day close (or at the hourly FSI check) if any holds: `FSI ≥ 0.7`; the bloc equity index fell ≥ 15% over 5 trading days; the interbank spread over policy (07) ≥ 1.5%; for SC or PL, the currency fell ≥ 10% over 3 trading days; a major crisis in this bloc entered POLICY phase. Limit `PARAM.macro_cb_max_emergency_per_quarter = 2`.
- Timing: at `t = 45` of the next trading day (pre-market, so the opening auction absorbs it).
- Size: cuts up to `−0.0100` (`PARAM.macro_cb_emergency_step`), computed as the scheduled rule with ρ = 1 and the wider clamp; FX-defence hikes (SC, PL only, when the currency trigger fired) up to `+0.0500`.
- Usually accompanied by tools: facility term extension to 91 days (LTRO), swap line activation, QE start if at ELB, CCyB release.

#### §3.6.7 Credibility (0..1, published ×100 as the Credibility gauge)
Each day close:
- If `|π_e5 − π_target| < 0.005` and `|π_core − π_target| < 0.01`: `cred += 0.10 × (1 − cred) × Δ`.
- If `|π_core − π_target| > 0.02` for more than 182 consecutive game days: `cred −= 0.30 × cred × Δ`.
- If QE is active while `π_core > π_target + 0.02` (monetary-financing perception): `cred −= 0.10 × cred × Δ`.
- One-off: guidance breaks (§3.6.5); a decisive emergency hike in a currency defence `+0.05`; a peg break or YCC abandonment `−0.10`; a new governor `±0.05` toward the bloc's `credibility0`.
- Clamp [0.05, 0.98].

### §3.7 Market expectations and curves

#### §3.7.1 When curves are recomputed
At every release tick of the bloc, every CB guidance, decision or minutes tick, every sovereign rating action (08 event), every FX regime event, and at day close. Between recomputes the curve is constant; intraday bond price moves come from 05 (flow, rates factor noise, news). 06 prices every bond line, future and swap off the latest curve as its value anchor.

#### §3.7.2 Market-implied policy path
1. The market's estimate of hawkishness `ĥ` (hidden; NPC macro pool belief): genesis `ĥ = 0.5`; after each decision, `hawk_implied` is solved from the decision (the hawk value that would have produced `i_new` under the rule with published data, bisection on [0,1]); `ĥ ← ĥ + 0.2 × (hawk_implied − ĥ)`.
2. `modelPath(h)` = the rule iterated as for the dots (§3.6.5) but with `ĥ` and the market's `r*_mkt = r*_cb` reading (published dots imply it; DEFAULT simplification: the market knows `r*_cb`).
3. `E_mkt[i at h] = cred × dots(h) + (1 − cred) × modelPath(h)` for h ∈ {1, 2, 4, 8} quarters. Beyond 2 years the path converges to `n∞ = r*_cb + π_e5` with half-life 2 game years.

#### §3.7.3 OIS curve
Forward policy path `f(s)` is piecewise linear through `(0, i)`, `(0.25, E1)`, `(0.5, E2)`, `(1, E4)`, `(2, E8)` and then `n∞ + (E8 − n∞) × 2^(−(s − 2)/2)`. `OIS(τ) = (1/τ) ∫₀^τ f(s) ds`, numerically with step 1/52 year.

#### §3.7.4 Term premium
`TP10 = tpBase_b + 0.25 × |π_e5 − π_target|/0.01 × 0.01 + 0.15 × (debtGdp − d*)/0.5 × 0.01 − 0.00025 × (qeHoldingsGdp / 0.01) + tpFear_b × (F − 50)/10 + Σ storm/crisis shocks on TP`

| Bloc | `tpBase` | `tpFear` (per 10 points of F) |
|---|---|---|
| FU | 0.50% | −0.040% (flight to quality) |
| EC | 0.40% | +0.020% |
| PL | 0.60% | 0.000% |
| NA | 0.30% | −0.020% |
| SC | 1.20% | +0.060% |

Clamp TP10 to [−1%, +4%]. `TP(τ) = TP10 × (1 − e^(−τ/4)) / (1 − e^(−2.5))`.

#### §3.7.5 Government curve
`y_gov(τ) = OIS(τ) + TP(τ) + s_sov(τ) + liq_b − conv_b` (zero rates, continuous compounding), nodes τ ∈ {0.25, 0.5, 1, 2, 5, 10, 30}. Interpolation for any maturity uses a Nelson-Siegel fit to the nodes (old 01 §3.6) with `λ_NS = PARAM.macro_ns_lambda = 1.8` years: least squares for `(L, S, C)`; the published `CurvePoint`s are the nodes, the NS parameters go to 06 for pricing. `s_sov` in §3.11.2. The slope inverts before recessions as the market prices cuts, which is the learnable signal of old 01 §3.6.

#### §3.7.6 Inflation curve
`breakeven(10) = 0.6 × π_e5 + 0.4 × π_e1 + PARAM.macro_irp = 0.002`; `breakeven(τ)` blends from `π_e1` at τ ≤ 1 to the 10-year value linearly. 06 prices L10Y linkers at real yield `y_gov(τ) − breakeven(τ)` on CPI-indexed principal (`cpiLevel`).

#### §3.7.7 Cross-currency basis (06 forwards consume)
`b_X = −(0.0005 + 0.006 × max(0, FSI − 0.3))` for EUN, PYN, NKR; `b_SRL = −(0.003 + 0.015 × FSI)`. While a swap line to that bloc is active: `b_X ≥ −0.0025`.

### §3.8 Central bank tools

#### §3.8.1 Corridor
`lendingRate = i + w`, `depositRate = i − w`, `w = PARAM.macro_corridor_halfwidth = 0.0025`. If `negativeRatesAllowed = false`, `depositRate = max(0, i − w)`. 07 keeps the overnight interbank rate inside `[depositRate, lendingRate]` and reports it.

#### §3.8.2 Reserves and interest on reserves
- Requirement `rr` on eligible deposits of banks chartered in the bloc (07 measures): FU 1%, EC 1%, PL 5%, NA 1%, SC 10% (`PARAM.macro_rr_*`). SC raises `rr` by 2 pp (cap 20%) in a currency defence and lowers it by 2 pp at most once per quarter when easing.
- Interest on reserves at day close: balance up to `iorTierMultiple = 3 ×` required earns `i`; the excess earns `depositRate`. Posted as `CBK_IOR_P` (FAUCET) to player-economy banks, `CBK_IOR_W` (TRANSFER) to NPC banks.
- Shortfall below requirement at day close: penalty `(lendingRate + 0.02) × shortfall × Δ`, `CBK_RESERVE_PENALTY` (SINK for player banks, TRANSFER for NPC banks). 07 applies.

#### §3.8.3 Standing lending facility (overnight to 7-day repo with the CB)
- Counterparties: banks with `CH_BANK` (13) in that bloc; primary dealers (§3.10.5) for their own bloc.
- Collateral eligibility and haircuts (`PARAM.macro_cb_haircut_*`; rating grades from 08):

| Collateral | AAA–AA | A | BBB | BB (crisis waiver only) | below BB |
|---|---|---|---|---|---|
| Own-bloc government bonds and bills | 1% | 2% | 4% | 15% | ineligible |
| Other-bloc government bonds | 3% | 5% | 10% | ineligible | ineligible |
| Corporate bonds | 5% | 7% | 12% | ineligible | ineligible |
| Senior ABS and covered bonds (08) | 8% | 12% | 20% | ineligible | ineligible |
| Credit claims (bank loans, 07) | ELA only, 30% | | | | |
| Equities | ELA only, 40% | | | | |

  Add 0.5 pp per year of remaining maturity above 5 years. A crisis waiver for BB own-bloc sovereign collateral is granted automatically while a CSF program is active.
- Rate: `lendingRate`. Term: 1–7 game days (`maxTermDays = 7`), 91 days at `i` (LTRO) during an emergency or a major crisis POLICY phase.
- Disclosure: only bloc aggregates are published (daily). No named usage is ever published (L11).

#### §3.8.4 Emergency liquidity assistance (ELA)
For a bank that cannot meet a run with eligible collateral: requires 07's solvency test (capital ratio ≥ minimum) at request time. Rate `lendingRate + elaPenaltySpread (0.015)`, term ≤ 90 game days, collateral per the table's ELA rows. The CB notifies the bloc regulator (13) with a SEALED event. If the bank is insolvent, ELA is refused and 07's resolution procedure runs.

#### §3.8.5 Asset purchases (QE) and runoff (QT)
- **Start QE** at a meeting (or emergency meeting) when `i = elb` and `i* < elb − 0.005`, or when `FSI > 0.6` and 05's bond market depth index for the bloc stays below 0.5 for 3 trading days ("market dysfunction" purchases).
- Size: `purchasesPerMonth = clamp(0.0025 × (elb − i*)/0.01, 0.0025, 0.015) × nominalGdp_b`, with a 0.005 × GDP floor in dysfunction mode. Eligible mix: govBonds 0.8, corpIG 0.2 when FSI > 0.5 (else govBonds 1.0); ABS only during a SECURITIZATION_CRISIS (0.1, taken from corpIG).
- Execution (05 §6.2, CB pool): daily amount = monthly ÷ trading days in the game month; split across bond lines pro rata to outstanding with maturity 2–30 years; executed as patient buy orders across the session at participation ≤ 10% of each line's ADV per tick. Caps: total holdings ≤ `holdingsCapGdp = 0.35` of GDP; ≤ 50% of any one line's outstanding face.
- Stock effect on the term premium (§3.7.4): −2.5 bp per 1% of GDP held.
- **Taper and hold:** when `i* > elb + 0.0025`, state → HOLD (maturities reinvested, no net purchases).
- **QT:** when `i ≥ r*_cb + π_target − 0.005` and holdings > 0: no reinvestment of maturing bonds, capped at `qtRunoffCapPerMonth = 0.015` of holdings; active sales none (FU, EC, NA, SC) or up to 0.5% of holdings per month (PL).
- QE trades are ordinary trades at market prices (TRANSFER); the CB pays with new reserves. Coupons on CB holdings go to the CB, which remits its profit to its treasury at each quarter end (world-internal TRANSFER).

#### §3.8.6 Yield curve control (PL by default, `PARAM.macro_ycc_bloc = 'PL'`)
- Start when PL's policy rate is at ELB and `y10 − i > 0.01` for 10 consecutive trading days: cap `capYield = i + 0.005`.
- Execution: the CB pool posts a resting bid at the price corresponding to `capYield` on the on-the-run 10y line each tick, size `2 × ADV` replenished, bounded by the holdings caps of §3.8.5. Because it is a real order, the cap holds as long as the CB has capacity and breaks visibly if it does not.
- Exit: when `π_core > π_target + 0.005` for 63 trading days, raise the cap by 0.25 pp per meeting; remove it after two raises. A cap removal is a credibility event (−0.10 if removed while holdings are at the cap).

#### §3.8.7 Swap lines (FU central bank provides)
Standing lines from FU to EC, NA and PL with limit 3% of the counterparty's GDP in FDL. Activated when `b_X < −0.004` or `FSI > 0.6`; rate = FDL OIS overnight + 0.25%. SC gets a line only while a Concord program is active. Draws are made by the counterparty CB and on-lent to its banks through 07 (FDL funding facility at the same rate + 0.10%).

#### §3.8.8 Macroprudential settings (07 and 10 apply)
- Countercyclical capital buffer: `ccyb = clamp(0.005 × floor(max(0, creditGap − 0.02)/0.02), 0, 0.025)`; increases take effect 91 game days after announcement; releases (to 0) are immediate when the bloc is in CONTRACTION or `FSI > 0.5`.
- Residential LTV cap: 80% baseline; −5 pp when `housePriceGap > 0.15`; −10 pp when `> 0.30`. Commercial LTV cap: 65% baseline; −5 pp when `creditGap > 0.06`. Debt-service-to-income cap 40% (10 applies to household and player mortgages). These are regulatory caps; NPC bank lending standards can be tighter (07; the CREDIT_CRUNCH crisis tightens new lending by 20 LTV points, old 01 §5.6).
- Changes are announced at scheduled meetings only, except releases.

### §3.9 Fiscal policy

#### §3.9.1 Revenue
`revenue = revBase_b × nominalGdp × (1 + 1.2 × x) + commodityRevenue`, `revBase`: FU 0.30, EC 0.42, PL 0.25, NA 0.40, SC 0.27 (`PARAM.macro_rev_base_*`). `commodityRevenue = nominalGdp × max(0, commodityExporter) × 0.06 × (energyIndex/100)` for NA and SC. Player taxes (03) are SINKs from the player economy; they are not added to the treasury's macro revenue (the NPC-economy model already contains the tax base).

#### §3.9.2 Spending
`spending = spendBase_b × nominalGdp + autoStab + Σ programs + interest`. `spendBase_b = revBase_b − primaryBalance0_b` (so genesis matches §2.2). Automatic stabilizers `autoStab = 0.4 × max(0, u − u*) × nominalGdp`. Interest = Σ over bond lines of coupon × face (accrued daily) + bill discount accretion.

#### §3.9.3 Fiscal rules (checked at the start of each game year and at mid-year, trading day 1 and 131 of the year)

| Rule | Behaviour |
|---|---|
| FLEXIBLE (FU) | CONTRACTION declared: stimulus program of 1.5% GDP for 1 game year (half INFRASTRUCTURE, half HOUSEHOLD_TRANSFER). If `debtGdp > 1.30` and `s10 > 0.015`: consolidation (AUSTERITY 0.5% GDP per year) |
| DEFICIT_CAP (EC) | If `deficitGdp > 0.03`: AUSTERITY sized to cut the deficit by 0.5% GDP per year. Escape clause: suspended while EC is in CONTRACTION and `FSI > 0.5`; then a 1% GDP INFRASTRUCTURE program is allowed |
| BALANCED_CYCLE (PL) | Target cyclically adjusted primary balance `pb − 0.4 × x ∈ [−1.5%, +1.5%]`; outside it, a program of the needed size (≤ 1% GDP) in the correcting direction; CONTRACTION: INDUSTRIAL_SUBSIDY 1% GDP |
| SURPLUS_SWF (NA) | Target primary surplus +2%; excess above target is transferred to the sovereign wealth fund (08 SWF NPC entity); in CONTRACTION draws up to 1% GDP from the SWF to fund GREEN_ENERGY or HOUSEHOLD_TRANSFER |
| PROCYCLICAL (SC) | EXPANSION/OVERHEATING: spends 60% of any revenue above trend (HOUSEHOLD_TRANSFER); CONTRACTION with `s10 > 0.05`: forced AUSTERITY 1.5% GDP; with a Concord program: its conditionality replaces this rule |

#### §3.9.4 Programs from politics (16)
16 may propose a `FiscalProgram` (from elections, lobbying, crises). 04 validates: if the program would breach the bloc's fiscal rule, it passes only as a "rule breach" (`macro.fiscal.rule_breach`, PUBLIC) that adds +0.0025 to the sovereign liquidity premium for 182 game days. Programs carry demand and incentives:
- `sectorDemand`: additive multipliers on 09's city-sector demand pools for the bloc (e.g. INFRASTRUCTURE: Industrials +6%, Materials +4%, Real estate services +3%; GREEN_ENERGY: Energy renewables +8%; AI_COMPUTE: Semis +5%, Tech +3%; HOUSING: Real estate +5%; DEFENSE_SECURITY: Security & Defense +8%), scaled by `sizeGdpPerYear / 0.01`.
- `incentive` (optional): `{ target: 'CAPEX_SECTOR' | 'COMPUTE_SPEND' | 'MORTGAGE_RATE' | 'HIRING', sector?: number, rate: number }`. 09, 10 and 11 apply it; payments to player-economy entities are FAUCET `GOV_SUBSIDY_P`. Default rates: CAPEX_SECTOR 10%, COMPUTE_SPEND 8%, MORTGAGE_RATE −0.50 pp, HIRING 5% of wages. Each program has a budget; incentives stop when its budget is spent.

#### §3.9.5 Fiscal impulse
`FI = deficitPrimary_t − mean364(deficitPrimary)` as a share of GDP (positive = expansionary), used in §3.4.1 with multiplier `m`.

#### §3.9.6 Debt accumulation
Each day close: `debt ← debt + (spending − revenue) × Δ` (FDL debt is translated at spot for ratios); `debtGdp = debt / nominalGdp`. Cash flows actually move through the treasury's cash account (financed by auctions, §3.10); the difference between the accrual and the cash position is the cash buffer.

### §3.10 Debt management and primary markets

#### §3.10.1 Gross financing need and issuance mix
Each quarter start (trading day 1 of the quarter): `GFN_q = (deficit_q forecast) + maturities in the quarter + (cashTarget − cashBuffer)`, with `cashTarget = 4 game weeks of spending`. The deficit forecast is the current annualized deficit ÷ 4. Mix of GFN by tenor (`PARAM.macro_issue_mix_*`):

| Tenor | FU, EC, PL, NA | SC |
|---|---|---|
| Bills B3M + B6M + B1Y | 30% (12/12/6) | 40% (16/16/8) |
| N2Y | 15% | 15% |
| N5Y | 20% | 15% |
| N10Y | 22% | 10% local + 20% FDL-denominated ("SC Global FDL 10Y", syndicated) |
| N30Y | 8% (syndicated new lines, auctioned reopenings) | 0% |
| L10Y | 5% | 0% |

#### §3.10.2 Calendar (each auction is announced 3 trading days ahead at `t = PARAM.macro_auction_announce_tick = 420` (E-51; independent of `macro_cb_decision_tick`); bloc offsets apply only to N2Y, N5Y and N10Y; bids accepted from announcement to the auction tick − 1; auction at `t = PARAM.macro_auction_tick = 330`; settlement T+0 at the auction tick, P13)
- B3M and B6M: every Monday. B1Y: every fourth Monday.
- N2Y, N5Y: monthly, trading day 8 of the game month (+ bloc offset FU 0, EC 1, PL 2, NA 3, SC 4).
- N10Y: monthly, trading day 10 (+ offset); a new line in the first month of each quarter, reopenings in the other two months.
- N30Y: new line by syndication once per game year (§3.10.6); reopening auctions quarterly, trading day 12 of the second month.
- L10Y: quarterly, trading day 12 of the third month.
- Size of each auction = the tenor's share of `GFN_q` ÷ number of auctions of that tenor in the quarter, rounded down to 1,000,000 face units.
- Coupon on a new line: `floor(y_WI / 0.00125) × 0.00125` (so price ≤ 100). Reopenings keep the coupon.
- `y_WI` (when-issued yield) = 05's last secondary yield of the same line, or the curve yield at that maturity (§3.7.5) for a new line.

#### §3.10.3 Bidders and validation (intent `mkt.sov.bid`, §4)
- Noncompetitive bids: any entity with LIC2 (Pro) or above; max `PARAM.macro_auction_noncomp_max_face = 10,000,000` face per beneficial-owner group per auction; filled in full at the stop yield; total noncompetitive ≤ 20% of offered (pro rata if exceeded).
- Competitive bids: LIC4 (Institutional), or a `CH_BANK`, `CH_FUND` or primary dealer. Yield in basis points with 0.1 bp resolution.
- Award cap: 35% of offered per beneficial-owner group (15's link graph groups linked accounts; 07 groups an entity with its controlled subsidiaries). Bids above the cap are cut before clearing.
- Cash hold at submission: face × price at `yield − 50 bp` (07/03 hold), released after settlement.

#### §3.10.4 Clearing algorithm (uniform price, deterministic)
1. Build the NPC bid ladder: total NPC cumulative face at yield ≤ y: `B(y) = offered × BTC_npc × Φ((y − y_WI − μ)/s)`, discretized at 41 yields from `y_WI − 3s` to `y_WI + μ + 4s` (each level a separate NPC bid, owner = the bloc's NPC dealer pool). Parameters: `BTC_npc = 2.4 × (1 − 0.5 × stress) × (1 − 0.3 × max(0, (F − 50)/50))` for EC, PL, NA, SC; for FU `× (1 + 0.2 × max(0, (F − 50)/50))` instead of the fear cut (flight to safety). `μ = 0.5 bp + 10 bp × stress + 3 bp × max(0, size/avgSize − 1)`. `s = 1.5 bp + 8 bp × stress`. Here `stress` is the sovereign stress index (§3.11.1).
2. Allocate noncompetitive first. `Q_c = offered − noncompetitive filled`.
3. Sort competitive bids (player and NPC) by yield ascending; ties by bid size descending, then by `hash(bidId, auctionId)` (deterministic, not by arrival).
4. Walk the sorted list summing face until the cumulative reaches `Q_c`. The stop yield `y*` is the marginal bid's yield. Bids below `y*` fill in full; bids at `y*` fill pro rata (`allotmentAtStopPct`), rounded down to lots with the remainder given in hash order.
5. Every winner pays the price of the line at `y*` (06 computes price from yield, coupon, maturity). Postings `GOV_AUCTION_SETTLE` (TRANSFER: cash to treasury, bond face to winner).
6. Results: `bidToCover = total bid face / offered`, `tailBp = (y* − y_WI) × 10,000`, player and NPC shares (aggregate only). Individual bids are never published.
7. **Failed or weak auction:** if total bids < offered, everything bid is awarded and `failed = true`. Then: sovereign stress +0.15 for 21 game days, `failedAuctions21d++`, shortfall added to next week's bill auction; if `cashBuffer` cannot cover the next 21 game days' maturities, the CB backstop rule applies (FU, PL, NA: the CB may buy up to 100% of the shortfall in the secondary market over the next 5 trading days; SC: up to 50%; EC: forbidden by the Compact rule unless a Concord program is active). A tail > 3 bp or a cover < 1.5 is a "weak auction" (stress +0.05 for 21 days, Wire item).

#### §3.10.5 Primary dealers
- NPC dealers: 8 per bloc (names in 22), modelled as one NPC dealer pool per bloc in the auction.
- Player application (`bank.primaryDealer.apply`): requires a `CH_BANK` chartered in the bloc, or the 08 §3.1.20 SWF co-investment privilege; equity ≥ 0.05% of the bloc's debt stock; Reputation not in the lowest band (14).
- Obligations: bid in ≥ 90% of the bloc's auctions in a game quarter, each time for at least `offered / (numberOfDealers × 2)` at yields ≤ `y_WI + 5 bp`. Three misses in a quarter → status revoked for 2 game quarters.
- Privileges: competitive bidding without LIC4; standing facility access for own-bloc collateral; eligibility as syndication lead (§3.10.6); a small quarterly league table (public, aggregate share of auctions won, opt-in to be named).

#### §3.10.6 Syndications
Used for new N30Y lines (once per game year) and SC FDL bonds (quarterly). Lead managers = the top three dealers by auction share over the last two quarters (players can qualify). Book open for 1 game day (`bookOpenTick` to `pricingTick`); orders via `mkt.sov.syndicationOrder` with an optional limit spread. Initial guidance = curve yield + 5 bp new-issue premium; if the book exceeds 2× size, the spread tightens 1 bp per 0.5× of extra cover, at most 5 bp. Allocation pro rata to orders at or inside the final spread, with leads allocated up to 15% each. Fee 0.15% of size split among leads: `GOV_SYNDICATION_FEE_P` (FAUCET) to player leads, TRANSFER to NPC leads.

#### §3.10.7 Buybacks
When `cashBuffer > 2 × cashTarget` and stress < 0.2, or when 05's depth index for off-the-run lines < 0.5 with FSI > 0.5: a reverse auction for off-the-run lines, `maxFace = min(excess cash, 2% of debt)`. Holders offer via `mkt.sov.buybackOffer` with a minimum price; the treasury accepts the lowest prices first up to `cap price = 06 fair price + 0.10` per 100 face. Settlement TRANSFER `GOV_BUYBACK`.

### §3.11 Sovereign credit risk

#### §3.11.1 Hazard
Each day close, per bloc:
- `z1 = (debtGdp − d*)/0.40`, weight 1.2
- `z2 = pbGap / 0.03`, weight 0.8, where `pbGap = (r_eff − g_nom) × debtGdp − primaryBalanceGdp` is the gap to the debt-stabilizing primary balance (`r_eff` = average coupon, `g_nom` = trend nominal growth = g_pot + π_target)
- `z3 = fxDebtShare × max(0, dep_vs_FDL_yoy)/0.10`, weight 1.0
- `z4 = max(0, (6 − reserveCoverMonths)/3)`, weight 0.6 (MANAGED_* and HARD_PEG regimes only)
- `z5 = (F − 50)/25`, weight 0.4 (FU −0.2, NA −0.1)
- `z6 = (0.5 − politicalStability)/0.25`, weight 0.5 (16 supplies stability 0..1)
- `z7 = failedAuctions21d`, weight 0.7
- `z8 = max(0, π_core − π_target)/0.05`, weight 0.3
- Raw `λ_raw = clamp(λ0 × exp(Σ w × clamp(z, −3, 4)), 1e-5, 0.60)`; FU capped at 0.02, NA at 0.03.
- Modifiers: Concord program active `× 0.6`; POST_RESTRUCTURING: `λ_raw = max(λ_raw, 0.08 × 2^(−daysSince/182))`.
- Smoothing: `λ ← λ + (λ_raw − λ) × (1 − 2^(−1/5))` (5-day half-life). A crisis shock on the hazard applies to `λ_raw` and bypasses smoothing on its trigger day.
- `stressIndex = clamp(ln(λ/λ0)/ln(50), 0, 1)` (0 at baseline, 1 at 50× baseline).

#### §3.11.2 Spread
`LGD = PARAM.macro_sov_lgd = 0.6`. Hazard term shape `h(τ) = 0.6 + 0.4 × min(1, τ/5)` normally; when `λ > 0.08` (distress) `h(τ) = 1.3 − 0.3 × min(1, τ/5)` (inverted credit curve). `s_sov(τ) = LGD × λ × h(τ)`. Liquidity premium `liq = 0.0010 × (1 + 2 × (1 − depthIndex_b))` (depth from 05; FU 0), plus any rule-breach premium (§3.9.4). Convenience yield `conv`: FU 0.0020, NA 0.0005, others 0.
`pd(T) = 1 − e^(−λ × T × h(T))`.

#### §3.11.3 Model PD versus market PD
- Model PD = §3.11.2 with today's λ.
- Market PD: from 05's traded on-the-run 10y yield: `λ_mkt = max(0, (y10_mkt − OIS(10) − TP(10) − liq + conv)) / (LGD × h(10))`, and from 06's sovereign CDS where listed (CDS takes precedence when its ADV ≥ the bond's). Players who trade bonds or CDS move the market PD; the model PD moves only with fundamentals. Both go to 08 in `SovereignRatingInputs`; 08's agencies rate from them with their own methods.

#### §3.11.4 Cliff effects of ratings (08 assigns grades; 04, 05, 07 react)
- Investment-grade sovereign index (08 index family): membership requires two of three agencies at BBB− or better. Exclusion triggers the mandate pool (05 §6.2) to sell 25% of NPC holdings of that sovereign's bonds over 10 trading days.
- CB collateral haircuts follow the §3.8.3 table by the lowest of the two best grades; CCP haircuts (07) do the same with 07's table.
- Bank capital risk weights on sovereign exposure (07): 0% for AA− or better own-bloc, rising by 07's table.

### §3.12 Sovereign default and restructuring

#### §3.12.1 Triggers (checked at day close; no player can trigger a default directly)
1. **FAILED_ROLLOVER:** two failed auctions within 21 game days, `cashBuffer` below the next 21 game days of maturities, and the CB backstop unavailable or exhausted.
2. **FX_SERVICE:** FDL-denominated debt service due within 21 game days exceeds FX reserves minus a floor of 1 month of imports, and no Concord program can be agreed (§3.13.6).
3. **POLITICAL:** 16's politics model decides a restructuring; allowed only when `debtGdp > 1.5` and `s10 > 0.15` for 63 trading days (FU and NA: never).
4. **HAZARD:** if `λ > 0.10`, a daily draw `u < 1 − e^(−0.25 × λ × Δ)` on `macro:<bloc>:sov` (only a quarter of the hazard is "surprise"; the rest flows through triggers 1–3).

#### §3.12.2 Procedure
1. The next coupon or principal due is missed: status GRACE for `PARAM.macro_sov_grace_days = 7` game days; 06 flags all lines; Wire item.
2. Grace ends unpaid: status SELECTIVE_DEFAULT; `macro.sov.default` (PUBLIC) with the credit-event payload for 06/08 (CDS settlement auction in 06; agencies move to D in 08). Coupons stop on all lines.
3. Exchange offer round 1 opens 7 game days later, open for 14 game days.
   - Haircut `h = clamp(1 − d_sus/debtGdp, 0.20, 0.60)` with `d_sus = d* + 0.20`.
   - New bonds: 50% of new face in a line maturing in 8 years, 50% in 15 years, coupon `max(0.02, 0.6 × pre-crisis 10y yield)`; `facePer100` chosen so that the present value of the new bonds at the exit yield `y_exit = OIS(10) + 0.06` equals `100 × (1 − h)`.
   - Votes via `mkt.sov.exchangeVote`. Eligible face = all affected local and FDL lines. NPC holders vote per holding block: ACCEPT if `u < σ((recoveryNpv − preOfferPrice/100 + 0.05)/0.05)`, draws on `macro:<bloc>:sov`.
   - Single-limb aggregated collective action clause: if ACCEPT ≥ `PARAM.macro_cac_threshold = 0.75` of eligible face, every line is exchanged, including for holders who rejected or abstained (bound by the clause).
4. If round 1 fails: round 2 after 28 game days with recovery NPV +5 points; round 3 the same. If round 3 fails, the treasury executes the exchange anyway; rejecting holders receive the new bonds and a holdout claim in 13's civil court for the difference to par (13 decides; recoveries paid by the treasury are TRANSFERs).
5. After exchange: status POST_RESTRUCTURING for 364 game days; auction sizes capped at 50% of plan; a Concord program is opened if not already; old lines are removed and new lines created (`SOV_EXCHANGE`, TRANSFER of instruments). The change in holders' value is REVALUE, not a sink.
6. Contagion: other blocs' z5 sees a fear shock (+10 F, decays over 21 days); banks with exposure take 07's mark-to-market losses.

### §3.13 FX

#### §3.13.1 Fair value (the value layer `V` 05 uses for each XXX/FDL pair; FDL is the base)
`S_X` = FDL per unit of X. Each day close and at release and CB ticks for the shock terms:
- `ln F_X ← ln F_X + [ −υ × (i_X − i_FDL) + θ_ppp × (ln PPP_X − ln F_X) + κ_ca × CA_X ] × Δ + β_risk_X × ΔRA + β_oil_X × Δln energyIndex + 0.03 × policySurprise_X − 0.03 × policySurprise_FDL + Σ FX shocks`
- `υ = PARAM.macro_fx_uip_share = 0.5` (half of the rate differential is expected to be lost to depreciation, so carry earns about half the differential on average and blows up in crises, old 01 §3.5).
- `θ_ppp = ln2/1.5` per game year (old 01 §3.5 half-life ~1.5 game years).
- Relative PPP: `ln PPP_X = ln PPP_X,0 + ln(cpi_FDL/cpi_FDL,0) − ln(cpi_X/cpi_X,0)`, with `PPP_X,0` = genesis spot.
- Current account `CA_X = CA0_X − 0.3 × q̃_X + 0.5 × openness × (x_others − x_X) + 0.04 × commodityExporter × ln(energyIndex/100)`; `CA0`: FU −3%, EC +2%, PL +3%, NA +5%, SC −2%. `κ_ca = 0.5`.
- `β_risk` (per unit change of RA): SRL +0.12, PYN +0.03, EUN +0.01, NKR +0.04. `β_oil`: NKR +0.25, SRL +0.10, others 0.
- `policySurprise` = decision rate minus the market-implied rate for that meeting just before it, in percentage points.
- `q̃_X = ln(S_X × cpi_X / cpi_FDL) − ln(PPP_X,0)` (real overvaluation).
05 forms the traded spot from flow around this value (05 §3.4), so fair value is the anchor and spot can overshoot.

#### §3.13.2 Regimes
| Regime | Rule |
|---|---|
| FREE_FLOAT | no intervention except a coordinated intervention during a world crisis when spot is ≥ 25% from fair value (rare, CB pool, §6.3) |
| MANAGED_BAND (PL) | band half-width 3% around a center `c`. The center drifts with the basket: `c = c0 + 0.3 × ln(S_EUN/S_EUN,0) + 0.2 × ln(S_NKR/S_NKR,0)` (basket FDL 0.5 / EUN 0.3 / NKR 0.2). The CB pool rests sell orders of PYN at the strong edge and buy orders at the weak edge, size `2 × ADV` per tick while reserves allow; inside the outer 20% of the band it leans with `5% × ADV × (distance into the outer zone / zone width)` per tick |
| MANAGED_FLOAT (SC) | lean against the wind: when `|5-day change| > 4%`, the CB pool sells reserves (or buys) at up to 2% of reserves per trading day, spread across ticks; stops when reserve cover < 3 months (unless a Concord program funds it) |
| HARD_PEG (option after a hyperinflation) | spot fixed to FDL at parity `p`; the CB pool offers unlimited two-sided liquidity at `p ± 0.1%` backed by reserves; the policy rate becomes `i_FDL + spread(λ)`; the peg breaks when reserves < 80% of the monetary base |

#### §3.13.3 Band realignment (PL, at scheduled meetings)
If spot has been within 0.5% of the weak edge for ≥ 21 trading days and cover < 6 months: devalue `c` by 3%. If within 0.5% of the strong edge for ≥ 21 trading days and cover > 15 months: revalue by 2%. Under extreme pressure (reserves < 3 months), the band widens to ±6% at an emergency meeting.

#### §3.13.4 Reserves
Reserves change with interventions (filled CB pool orders, in FDL at fill prices), with the current account (`CA × nominalGdp × Δ`, converted at spot, for managed regimes only: the CB absorbs the flow), with Concord disbursements and with the valuation of gold (06 spot). `reserveCoverMonths = reservesFdl / (imports per month in FDL)`, imports per month = `openness × nominalGdp_FDL / 12 × (364/28/13)`, simplified as `openness × nominalGdp_FDL / 13` per game month.

#### §3.13.5 Exchange market pressure and the speculative attack
`EMP = −Δ5d ln S_X / σ_5d + (−Δ5d reserves / reserves) / 0.05 + Δ5d i / 0.01`, standardized. During a speculative attack, players and NPC pools selling X are real flow against the CB pool; the CB's capacity is the reserves.
- **Break rule (SC, and PL if its band is exhausted):** when `reserveCoverMonths < 3` and `EMP > 2` for 5 consecutive trading days, at the next `t = 45`: if a Concord program can be agreed (§3.13.6: `λ < 0.15` after the program's modifier), take it and widen tolerance; otherwise move to FREE_FLOAT: a fair-value shock `ln F_X −= (0.15 + 0.25 × severity)` (severity 0.6–1.4 from `macro.fx:<base>:<quote>` (e.g. `macro.fx:EUN:FDL`; E-63)), capital controls level 2 for 3 game days then level 1 for 28 game days, emergency hike (§3.6.6).
- **Hard peg adoption:** only if `π_core > 0.25` for 91 game days after a break: a currency board at the then-spot, at a meeting (DEFAULT, Mathis may override).

#### §3.13.6 Concord Stability Facility (`npc_CSF`)
- Quotas: 2% of each bloc's GDP (FDL), lending capacity 3× quotas.
- A bloc qualifies when in crisis (currency break pending, FX_SERVICE trigger pending, or `s10 > 0.08`) and `λ × 0.6 < 0.15`. Program size: up to 3× the bloc's quota, disbursed in four tranches every 91 game days subject to compliance.
- Conditions: primary balance improves by 1.5% GDP per game year (an AUSTERITY program is added), CB independence kept (no monetary financing), capital controls phased out within 91 game days.
- Effects: λ × 0.6, swap line to SC enabled, BB sovereign collateral waiver at the CB, the program rate `= FDL OIS(5) + 0.02` paid by the treasury (world-internal TRANSFER).
- Compliance below 0.7 at a tranche date suspends the next tranche (Wire item; spreads widen through λ).

#### §3.13.7 Capital controls (SC and PL only)
| Level | Effect on players (validated by 05 at P1) | Ledger |
|---|---|---|
| 1 Outflow levy | 1% levy on any conversion of X into another currency | `CAPCON_LEVY` (SINK) |
| 2 Conversion hold | orders selling X for another currency are rejected except reduce-only closes of existing FX derivative positions; trading X-denominated assets within X continues (old 01 §5.6 "can't withdraw SRL assets for 3 days") | none |
| 3 Full controls | level 2 plus dividends, coupons and rents in X stay in X accounts (no auto-conversion) for the duration | none |
Default durations: level 2 for 3 game days, level 3 for 72 game days (3 real days), stepping down one level at expiry. Announcement and expiry ticks are public.

### §3.14 Global indicators

#### §3.14.1 Fear Index F (0–100, every game hour)
`F_raw = 100 × σ( −1.2 + 3.0 × (rv21_GX − 0.16)/0.16 + 2.0 × (creditSpreadIdx − 1) + 2.5 × FSI + 1.0 × crisisTerm + 0.8 × (geopoliticalTension − 50)/50 + 0.5 × (worldHackRate − 50)/50 + 2.0 × max(0, −r_GX,today)/0.03 − 0.5 × r_GX,63d/0.10 )`
- `rv21_GX`: annualized realized vol of the GX world equity index over 21 trading days (05); `r_GX,today` the index return since the day open; `creditSpreadIdx`: IG credit spread index ÷ its 364-day mean (06/07); `crisisTerm`: 1 while a major is in TRIGGER or CONTAGION, 0.5 while a storm is active, else 0.
- `F ← F + (F_raw − F) × (1 − 2^(−1/2))` per game hour (2-hour half-life). Genesis `F = 22`.
- `riskAppetite RA = 1 − F/50`.
- 06 derives the implied-volatility level from F (06 owns the surface; DEFAULT anchor `IV_ATM,GX ≈ 0.10 + 0.004 × F`).

#### §3.14.2 Financial Stress Index FSI (0..1, every game hour, public on MKT-07)
Weighted average of components, each normalized to [0,1] by the divisor and clamped:

| Component | Source | Divisor | Weight |
|---|---|---|---|
| Interbank spread over policy rate | 07 | 1.5% | 0.20 |
| Repo haircut index change vs 1y mean | 07 | 10 pts | 0.10 |
| CCP default-fund usage | 07 | 25% of fund | 0.10 |
| NPC bank equity drawdown from 364-day high | 05 | 50% | 0.15 |
| IG credit spread | 06/07 | 3% | 0.20 |
| Largest stablecoin depeg | 06 | 10% | 0.05 |
| ETF discount index | 08 | 5% | 0.05 |
| Largest sovereign stress index | §3.11 | 1 | 0.15 |

#### §3.14.3 World trade index
`WTI = 100 × (Σ_b gdpShare0_b × realGdpIndex_b/100)^1.5 × ((1 − tariffLevel)/(1 − 0.03))^2`. Genesis tariff 3%. TRADE_WAR and 16 trade policy change `tariffLevel` (bilateral detail is aggregated into the world level and into bloc-specific x-shocks).

#### §3.14.4 Credit aggregates (07 supplies, 04 transforms)
07 supplies per bloc each day close: total NPC and player credit outstanding to the non-bank sector (loans + corporate bonds), `creditConditions ∈ [−1, 1]` (lending standards), and the interbank spread. 04 computes `creditGdp = credit / nominalGdp`, trend = `EWMA(creditGdp, 3 × 364 days)`, `creditGap = creditGdp − trend`, `creditGrowth` yoy. Until 07 supplies values (genesis and in tests without 07), fallback: `creditConditions = 0.5 × tanh(−2 × R̃/0.01) + regimeTilt` (EXP +0.2, OVH +0.3, CON −0.5, REC 0) and credit grows with nominal GDP × (1 + creditConditions × 0.5).

#### §3.14.5 Other inputs
`energyIndex = 100 × (0.5 × crude/crude0 + 0.3 × gas/gas0 + 0.2 × MWh/MWh0)` and `foodIndex = 100 × (0.3 × wheat + 0.3 × corn + 0.2 × coffee + 0.2 × cocoa, each ÷ genesis)` from 06 day-close prices; `aiRaceIndex` from 11; `worldHackRate` from 12; `geopoliticalTension` and `politicalStability_b` from 16. Missing inputs hold their last value.

### §3.15 Macro data releases

#### §3.15.1 Calendar (trading-day index within the game month; bloc offsets FU 0, EC 1, PL 2, NA 3, SC 4 added)
| Kind | Cadence | Day | Tick | What is printed |
|---|---|---|---|---|
| PMI | monthly | 1 | 45 | composite PMI `50 + 2.5 × (g − g_pot)/0.01 + N(0,1)`, 1 decimal |
| JOBS | monthly | 2 | 45 | unemployment (1 decimal), payroll change index |
| RESERVES | monthly | 4 | 300 | FX reserves (FDL), cover months; PL and SC also intervention total |
| CPI | monthly | 6 | 45 | headline and core yoy, mom (1 decimal) |
| RETAIL | monthly | 9 | 45 | retail sales mom: `consumption growth = g + 0.5 × Δwage real + N(0, 0.4%)` |
| TRADE | monthly | 12 | 45 | trade balance and current account (% GDP, trailing) |
| HOUSING | monthly | 14 | 45 | house price index (10), transactions |
| CREDIT | monthly | 16 | 300 | credit growth, lending standards survey (07) |
| SENTIMENT | weekly | Friday | 300 | consumer sentiment `100 + 300 × x − 100 × (π_e1 − π_target) − 0.5 × (F − 30)` |
| GDP_ADV | quarterly | trading day 10 of the next quarter | 45 | q/q annualized real growth |
| GDP_REV1 / GDP_REV2 | quarterly | +20 / +40 trading days after ADV | 45 | revisions |
| FISCAL | quarterly | trading day 15 of the next quarter | 300 | deficit, primary balance, debt (% GDP) |
| CB_GUIDANCE, CB_DECISION, CB_MINUTES | §3.6.1 | | 420 | |

If a release day exceeds the month's trading days it moves to the month's last trading day. Releases never fall on weekends (they are defined on trading days).

#### §3.15.2 Measurement, consensus and surprise
- `actual = round(trueValue + N(0, σ_meas,k), decimals_k)`, stream `macro:<bloc>:release`. `σ_meas`: CPI 0.1 pp, JOBS 0.1 pp, GDP_ADV 0.6 pp, GDP_REV1 0.3, GDP_REV2 0.1, PMI 1.0, RETAIL 0.3, TRADE 0.2, HOUSING 0.5, CREDIT 0.3, SENTIMENT 2.0. Revisions replace the prior print's value in `revisedPrior`.
- NPC consensus, published 1 game day before at `t = 420` (literal, not `macro_cb_decision_tick`; E-51) (calendar shows it to Terminal-tier subscribers, 16): `consensus = trueValue + N(0, σ_cons,k)`; `σ_cons`: CPI 0.2 pp, JOBS 0.15 pp, GDP 1.0 pp, PMI 1.5, RETAIL 0.5, others 1.5 × σ_meas. Dispersion published = `0.6 × σ_cons`.
- Research nowcasts (11 and 16 sell the access): `nowcast(chrId, releaseId) = trueValue + N(0, σ_cons,k × (1 − 0.8 × quality))`, `quality ∈ [0,1]` from the player's data and model quality (11). Each nowcast draw is per (player, release) on stream `macro.nowcast:<chrId>:<releaseId>` (02 §3.10.4, E-63) so repeated queries return the same number.
- `surprise = (actual − consensus) / σ_surp,k`, `σ_surp,k = √(σ_meas² + σ_cons²)`.
- Distribution: every release is PUBLIC to everyone at the release tick (macro prints have no tiered early access; DEFAULT, Mathis may override). The engine applies the expectation update (§3.7.1) in the same tick's P2; orders sealed in P0 of that tick were placed without the print, so no one can trade on it inside that tick (02 §3.3 rule, old 01 §9).
- Risk reaction (handed to 05 as a news jump on factors, 16 names it): market factor jump for the bloc `J = −0.003 × s` for CPI; `+0.004 × s × (1 − 1.5 × clamp((π_core − π_target − 0.01)/0.02, 0, 1))` for GDP, JOBS (sign flipped for unemployment), PMI, RETAIL; FX value jump `+0.003 × s` for CPI and growth prints. Rates move through the curve recompute, not a separate jump.

### §3.16 Crises and world events

#### §3.16.1 Tiers and base rates (ROADMAP §2.8, old 01 §5.6)
| Tier | Scope | Rate | Telegraph | Concurrency |
|---|---|---|---|---|
| RIPPLE | one sector, commodity or city, ±3–8% over 1–3 game days | Poisson 1 per 7 game days (≈ 3.4 per real day) | none (it is news) | ≤ 3 active |
| STORM | multi-asset regime push | Poisson 1 per 91 game days | 1–2 game days of precursors | ≤ 1 active, ≥ 7 game days apart |
| MAJOR | the crisis catalog §3.16.4 | `λ_m(t) = PARAM.macro_major_base_rate × V(t)` per game day, `macro_major_base_rate = 3.6e-4` (calibrated so P(≥ 1 major per chapter) ≈ 35% after the constraints below; 20 verifies 35% ± 5%) | ≥ 8 game days (8 real hours) of precursors for scheduled majors | ≤ 1 active |
| CRISIS WEEK | themed real week (168 game days): storms ×2, one guaranteed storm, major rate ×1.5 | at chapter start, with probability 0.6, placed uniformly in real weeks 2–7 of the chapter; ≤ 1 per chapter | announced 48 real hours (48 game days) ahead | none |

`V(t) = Σ_k elig_k × base_k × e^(vuln_k) / V̄`, with `V̄ = 3.0` (the long-run mean of the numerator in calibration runs; 20 re-measures). The old Phase-0 rates (crash 0.03% and bubble 0.02% per game day, storms 1.3% per game day) are superseded by this table.

#### §3.16.2 Constraints on scheduled majors
1. At most one major active (from PRECURSOR to ENDED).
2. At least `PARAM.macro_major_min_gap_days = 504` game days (3 real weeks) between the trigger ticks of two majors.
3. No scheduled major may trigger in the final 48 game days of a chapter (no ladder lottery; 15 also averages the finish).
4. After a PLAYER_CAUSED major, scheduled majors are suppressed for 336 game days (2 real weeks).
5. Emergent majors (§3.16.5) are never blocked; they count toward 1–4 for later scheduling.
6. No scheduled MAJOR or STORM may start in the first 24 game days (24 real hours) of a chapter (aligned with 16 §3.7.3; ruling in 24). 04 §3.16 is authoritative for crisis tiers, rates, constraints and the Crisis Week; 16 §3.7 draws the non-financial shock content within these limits.

#### §3.16.3 Scheduling algorithm (macro day step, step 11)
1. Ripples: draw count `~ Poisson(1/7)` on `macro:events`; for each, pick a kind uniformly from RippleKind, then a target (sector weighted by sector size, commodity uniformly, city weighted by activity), sign 50/50, size `U(0.03, 0.08)`, length `U(1, 3)` game days. Within COMMODITY_SUPPLY and SECTOR_SHOCK (and storm CREDIT_WOBBLE), a sub-def is drawn by weight (E-35 §5, PROVISIONAL [Quant]; T04-18 lists them: drought, crop disease, chip fab, shipping lane with C18 delays, company-scope recall/scandal/cyber, data-center with C17, BANK_RUN_LOCAL); sub-defs never change the kind rates, so the total stays 0.154 per GD.
2. Storms: if none active and ≥ 7 days since the last ended: start with probability `1 − e^(−rate)`, rate 1/91 (× 2 in a crisis week; plus a forced storm on day 3 of a crisis week if none happened); kind uniformly from StormKind; precursor 1–2 game days.
3. Majors: if constraints allow, start with probability `1 − e^(−λ_m)`. Choose the kind with weights `elig_k × base_k × e^(vuln_k)` (second draw on `macro:events:kind`); bloc(s) as the table says; severity `U(0.6, 1.4)`; precursor length `U(8, 16)` game days; trigger tick = the first tick after the precursor whose real UTC hour (02's tick→UTC map) lies in the band `timezoneBandNext` (bands 00–08, 08–16, 16–24 UTC), then rotate the band.
4. During PRECURSOR the event applies its precursor shocks (real state changes that players can observe: spreads, valuations, guidance, data); it is not announced. At trigger, the trigger shocks apply and 16 publishes the first headline (`publicTitleKey` set).

#### §3.16.4 Major crisis catalog
Every entry lists eligibility, the base weight, its vulnerability `vuln`, the shocks (on 04 variables and through the hooks of §3.16.6), the crisis-specific policy response (on top of the automatic rules), and calibration targets (old 01 §5.6) that 20 checks as bands over 200 seeds. Shock sizes scale with severity.

| Kind | Eligible when / base / vuln | Precursor (8–16 d) | Trigger and contagion shocks | Specific response | Calibration target |
|---|---|---|---|---|---|
| EQUITY_BUBBLE_BURST | valuation z ≥ 1 in a bloc with ≥ 20% world GDP / 1.0 / valuation z | equity risk premium −0.3% ramp (06 `erpShock`), CB guidance hawkish tilt +0.2 | 06 `erpShock +2.5%` decaying with half-life 120 d; F +25; `x_target −1.5%` for 180 d; trend pool flips (05 emergent) | CB cuts via rule; CCyB release | index −30% to −45% over 14–42 game days; tech −60%; gold +15% |
| CREDIT_CRUNCH | credit z ≥ 0.5 or rising default rate / 1.0 / credit z | IG spreads +5 bp per game week; lending standards tighten −0.1 | 07 `corporatePdMultiplier ×3` for 120 d; `creditConditions −0.6`; new-loan LTV −20 pts (07, 10); `x_target −2.5%` | FSI-driven cuts; QE with corpIG; LTRO | credit spreads ×3; banks −50%; real estate −25% |
| BANKING_PANIC | ≥ 1 NPC bank below 1.2× its capital minimum, or FSI ≥ 0.4 / 0.6 / (FSI − 0.3)/0.1 | interbank spread +20 bp; bank equities −10% | 07 `depositConfidenceShock −0.4` on the 1–3 weakest NPC banks; interbank spread +1.5%; F +20 | ELA; deposit guarantee raised (07); rescue merger proposals (16, 07) | FSI > 0.7 at peak; at least one bank resolution or rescue |
| CRYPTO_WINTER | crypto hype (06) ≥ 0.5 or a stablecoin backing ratio < 1.02 / 0.8 / 2 × (hype − 0.5)/0.5 | stablecoin redemptions +; exchange outflow rumors (16) | 06 `stablecoinDepeg(0.85–0.97)` or `venueCollapse`; hype → 0 | none (no CB backstop for crypto) | crypto −70% to −90% over 30–90 d; lasts until the chapter ends or 600 d |
| OIL_SHOCK | always / 0.8 / (geopoliticalTension − 40)/20 | tension +10; crude +5% | 06 `commoditySupplyShock(crude −8%, gas −5%)` for 60–180 d; F +15 | CBs look through energy at first (rule uses core); fiscal energy subsidies (16) | crude +80%; airlines −40%; headline inflation +3 pp; rates up |
| CURRENCY_CRISIS | SC (or PL) with cover < 9 months or CA < −2% / 0.8 / (9 − cover)/3 | capital flow index −0.2; reserves fall | capital flow index −0.8 for 30 d → attack dynamics §3.13.5; fair value shock −10% at trigger | §3.13.5 break rule; Concord | SRL −40%; capital controls 3 game days |
| SOVEREIGN_DEBT_CRISIS | some bloc λ ≥ 0.01 / 0.6 / ln(λ/0.01) | weak auctions; political stability −0.1 | political stability −0.3 (16); λ_raw ×3 for 63 d; auction demand cut (stress +0.3) | Concord; austerity; restructuring if triggers fire (§3.12) | s10 > 10% at peak in that bloc |
| AI_BUBBLE | AI-race index ≥ 70 and semis valuation z ≥ 1 / 0.7 / (aiRace − 70)/10 | compute spot +20% (06) | 11 `aiRaceIndexShock −30`; 06 compute demand −40% for 120 d | none | compute −60%; semis −70%; AI tokens −85% |
| CYBER_PANDEMIC | emergent only, from 12 (world hack rate ≥ 85 for 2 game days) / none / none | none | 12 zero-day hook (12 §5.4); insurance claims surge (08) | CyberCert patch (12, 13) | security stocks +50%; others −10% |
| FLASH_CRASH | always / 0.6 / F/50 | none beyond the generic 8 days (book depth −10%) | 05 `makerWithdrawal(depth × 0.2, 30 ticks)` and `npcSellProgram(GX constituents, 3% ADV per tick, 20 ticks)` | circuit breakers (05) | −10% within the session, 70% recovered within a game day |
| HOUSING_CRASH | house gap ≥ 15% / 0.7 / house z | mortgage approvals −; listings + | 10 `housePriceShock −20% to −35%` over 180 d and `transactionFreeze 0.5`; banks −15% | LTV cap releases; HOUSING program | values −20% to −35%; multi-chapter recovery |
| STAGFLATION | world headline inflation > 3.5% / 0.5 / (π_world − 0.035)/0.01 | π_e1 +0.5% | π_e1 +2%, π_e5 +0.8%, credibility −0.15, energy supply −3% | CBs hike (rule) | bonds −10%; equities −15% |
| SECURITIZATION_CRISIS | 08 pool underwriting quality ≤ 0.6 / 0.5 / (0.7 − quality)/0.1 | ABS spreads +; mortgage delinquencies + | 08 `correlationShock +0.2`, `pdShock ×2` on mortgage pools; 07 repo haircut on ABS +15 pts | QE ABS; LTRO | mezzanine tranches −50%; funding freeze (FSI > 0.6) |
| FUNDING_RUN | 07 repo leverage index ≥ 1.2 / 0.5 / (lev − 1.2)/0.2 | repo rates +10 bp | 07 `repoHaircutShock +10 pts`, prime-broker margin calls; procyclical CCP margin (07) | swap lines; LTRO | hedge-fund deleveraging; FSI > 0.6 |
| TRADE_WAR | geopoliticalTension ≥ 50 / 0.5 / (tension − 50)/15 | tariff talk (16) | `tariffLevel +0.10`; PL `x_target −2%`, FU −0.7%; PYN fair value −5% | fiscal support | PL equities −20%; PYN −8% |

Storm shocks (scaled by severity U(0.6, 1.4)): RATE_SCARE term premium +40 bp in one bloc over 5 game days, decays 30 d; OIL_SPIKE_LITE crude supply −3% for 20 d; CRYPTO_FLUSH hype −0.4 plus 05 crypto maker depth × 0.5 for 1 game day (target −30%); CREDIT_WOBBLE 07 corporate PD × 1.4 for 30 d (IG +40 bp); FX_SQUALL one of SRL, PYN capital flow index −0.4 for 10 d (−6%); SECTOR_ROTATION 06 sector risk premium +1% on one sector, −0.5% on another; EARNINGS_SCARE 06/09 consensus EPS −5% broad; LIQUIDITY_HICCUP 05 maker depth × 0.5 for 60 ticks in one asset class.

Phase lengths: TRIGGER 1 game day; CONTAGION `U(5, 30)` game days; POLICY starts when any CB emergency or crisis-specific response fires and overlaps CONTAGION; RECOVERY until `F < 40` and `FSI < 0.3` for 10 consecutive trading days, or 180 game days at most; then ENDED. Shocks decay on their own schedules regardless of phase labels.

#### §3.16.5 Emergent crises (labels for consequences that rules already produced)
At each game hour check: `FSI ≥ 0.75` for 3 consecutive days → BANKING_PANIC or FUNDING_RUN (whichever FSI component dominates); GX drawdown ≥ 20% within 21 trading days → EQUITY_BUBBLE_BURST (label "market crash"); a currency break (§3.13.5) → CURRENCY_CRISIS; a sovereign default → SOVEREIGN_DEBT_CRISIS; world hack rate ≥ 85 for 2 days → CYBER_PANDEMIC (origin PLAYER_CAUSED when 12 attributes ≥ 50% of the hack volume to player ops); a stablecoin depeg > 10% → CRYPTO_WINTER; an index-level market-wide halt (05) → FLASH_CRASH. Emergent events apply no extra trigger shocks (the damage already happened); they open the WorldEvent record, phases and history, and the automatic policy rules respond as usual.

#### §3.16.6 Hooks other modules implement (exact interfaces assumed)
| Hook | Owner | Signature (all deterministic, applied from the next tick) |
|---|---|---|
| `erpShock(bloc \| 'WORLD', sector \| null, deltaPremium, halfLifeDays)` | 06 | adds to the equity risk premium in the PE formula |
| `corporatePdMultiplier(bloc \| 'WORLD', mult, days)` | 07 | multiplies NPC corporate default intensities |
| `depositConfidenceShock(bankIds[], delta)` | 07 | lowers depositor confidence state |
| `repoHaircutShock(assetKind, deltaPts, days)` | 07 | adds to repo haircuts |
| `stablecoinDepeg(assetId, target, days)` / `venueCollapse(venueId)` | 06 | |
| `commoditySupplyShock(commodityId, pct, days)` | 06 | |
| `aiRaceIndexShock(delta)` | 11 | |
| `makerWithdrawal(assetFilter, depthMult, ticks)` / `npcSellProgram(assetFilter, advPerTick, ticks)` | 05 | §05 §6 |
| `housePriceShock(cityIds[] \| 'WORLD', pct, days)` / `transactionFreeze(cityIds[], level, days)` | 10 | |
| `correlationShock(poolKind, delta)` / `pdShock(poolKind, mult, days)` | 08 | |
| `zeroDay(severity)` | 12 | |
| `politicalStabilityShock(bloc, delta, days)` / `fiscalProgramProposal(program)` | 16 | |

Each hook call carries the WorldEvent id so every downstream event can cite it (16 builds the causal chain).

### §3.17 The Stabilizer and the Money Supply Index

The Stabilizer (diegetic "Stabilizer Board", name in 22), its designed wealth path, error, controller, modes, guards and levers are defined **once, in 03 §3.7**, and the Money Supply Index and NWI in **03 §3.8** (ruling in 24; 03 owns the ledger and the Stabilizer per 00 §5.4). 04 runs no controller and keeps no separate lever set. 04's former levers map onto 03's list: `demandMult` = 03 L1, `priceLevelAdj` = 03 L2, `highVolumeFeeMult` = 03 L3 (transaction levy); `equityDriftAdj` and `topBracket` do not exist (00 §5.4: FAUCET and SINK flows only).

04's only Stabilizer duties:
1. Read 03's lever values at `t = 0` of each game day where 04 needs them (none of 04's own rules use them).
2. Publish the weekly report (kept as §3.17.5 for citations; every Monday, t = 45; PUBLIC; 17 MKT-08): a weekly digest of 03's published daily values: MSI, the lever values and their direction, `e` (as "Money vs designed path: +12%"), faucets and sinks by reason-code class for the past game week (03), net mint, M0 and M2 indices (03), NPC-to-player wealth ratio, crisis count this chapter. No individual data. Event `macro.stab.report`; `macro.stab.msi` republishes 03's daily MSI.

### §3.18 Ledger postings queued by 04 (classes per 00 §5.4; 03 registers the codes)

Suffix `_P` = the counterparty is a player-economy entity (chr and entities whose owner chain ends at a chr); `_W` = a world entity (npc, gov, cbk, hh, frm, row). A code belongs to exactly one class.

| Code | Class | When |
|---|---|---|
| `CBK_IOR_P` / `CBK_IOR_W` | FAUCET / TRANSFER | interest on reserves at day close |
| `CBK_RESERVE_PENALTY_P` / `_W` | SINK / TRANSFER | reserve shortfall penalty |
| `CBK_REPO_OPEN`, `CBK_REPO_CLOSE` | TRANSFER | facility cash out and back (collateral is pledged in 07, not moved) |
| `CBK_FACILITY_INTEREST_P` / `_W` | SINK / TRANSFER | lending facility and ELA interest |
| `CBK_DEPOSIT_INTEREST_P` / `_W` | FAUCET / TRANSFER (negative rates reverse direction: SINK) | deposit facility remuneration |
| `GOV_AUCTION_SETTLE` | TRANSFER | primary auction and syndication settlement |
| `GOV_COUPON_P` / `GOV_COUPON_W` | FAUCET / TRANSFER | coupons paid by the treasury (schedule from 06) |
| `GOV_REDEMPTION` | TRANSFER | principal at maturity |
| `GOV_BUYBACK` | TRANSFER | buyback settlement |
| `GOV_SYNDICATION_FEE_P` / `_W` | FAUCET / TRANSFER | lead manager fees |
| `GOV_SUBSIDY_P` | FAUCET | program incentives (posted by 09, 10, 11 using 04's program rate) |
| `SOV_EXCHANGE` | TRANSFER | restructuring exchange of instruments |
| `CAPCON_LEVY` | SINK | capital-control levy |
| `CBK_PROFIT_REMIT`, `CSF_DISBURSE`, `CSF_REPAY`, `SWF_TRANSFER` | TRANSFER | world-internal flows |
QE and FX intervention are ordinary trades through 05 (`MKT_TRADE`, 05 §3.13). Revaluation of holdings from rate changes is REVALUE (03). Postings are queued in P8 (day-close accruals) or P6 (auctions) and committed at P13.

### §3.19 Determinism and random streams
Streams (02 derives each from the world seed and the key; adding a stream never changes another): `macro:global` (global regime), `macro:<bloc>:regime`, `macro:<bloc>:gap`, `macro:<bloc>:infl`, `macro:<bloc>:rstar`, `macro:<bloc>:cb` (personality, member offsets, guidance noise), `macro:<bloc>:release`, `macro:<bloc>:sov`, `macro.fx:<base>:<quote>` (e.g. `macro.fx:EUN:FDL`; E-63), `macro:events`, `macro:events:kind`, `macro:auction:<bloc>` (only for tie hashes; NPC bids are deterministic functions), `macro.nowcast:<chrId>:<releaseId>` (E-63). Binding key spellings are the 02 §3.10.4 registry; T04-01 `streams.ts` maps the remaining names above. Draw order inside the macro day step is fixed: global, then blocs in the order FU, EC, PL, NA, SC, each in the step order of §3.1. Iteration over maps is always by sorted key. The macro step reads only state committed through tick 718 plus 04's own state, so its output is a pure function of (seed, state).

---
## §4 Player intents

All intents use the 00 §5.5 envelope, count toward the 20-intents-per-tick limit, and are validated in P1. Humans, player AIs and delegated operators use the same intents. Held characters (13) cannot submit new bids or facility draws manually; standing bids stay live.

| Kind | Payload | Validation | Effect |
|---|---|---|---|
| `mkt.sov.bid` | `{ auctionId, kind: 'COMPETITIVE' \| 'NONCOMPETITIVE', face: string, yieldBp?: number, accountId }` | auction is between announce and auction tick − 1; license per §3.10.3; `face` multiple of 1,000 face units and ≥ 10,000; competitive needs `yieldBp` with 0.1 bp resolution within `y_WI ± 200 bp`; noncompetitive face ≤ 10,000,000 per owner group; cash hold succeeds (03/07); capital controls level ≥ 2 forbid bids that require converting X into another currency | bid stored sealed; `macro.sov.bid.accepted` (PRIVATE) |
| `mkt.sov.bidCancel` | `{ bidId }` | own bid, before auction tick − 1 | hold released |
| `mkt.sov.buybackOffer` | `{ buybackId, assetId, face, minPrice }` | holder owns ≥ face unpledged (07); buyback open | stored sealed; settled at the buyback tick if accepted |
| `mkt.sov.syndicationOrder` | `{ syndicationId, face, limitSpreadBp? }` | book open; competitive bidder eligibility (§3.10.3); hold | allocated at pricing |
| `mkt.sov.exchangeVote` | `{ offerId, vote: 'ACCEPT' \| 'REJECT' }` | holder of eligible face at the vote snapshot (offer open tick); one vote per holding; changeable until close | counted toward the CAC tally (aggregate published daily) |
| `bank.cb.repo` | `{ bloc, bankId, amount, termDays: 1..7 \| 91, collateral: { assetId, qty }[] }` | bank has `CH_BANK` in the bloc or primary-dealer status; collateral eligible (§3.8.3) and unpledged; post-haircut value ≥ amount; 91-day term only while LTRO is open | cash to bank (`CBK_REPO_OPEN`), collateral pledged by 07, interest accrues daily |
| `bank.cb.repoRepay` | `{ repoId }` | own repo; cash available | early repayment, interest to date |
| `bank.cb.deposit` / `bank.cb.depositWithdraw` | `{ bloc, bankId, amount }` | bank chartered in the bloc | moves reserves between current account and deposit facility (07 keeps reserve balances) |
| `bank.cb.elaRequest` | `{ bloc, bankId, amount, collateral[] }` | 07 solvency test passes; ELA collateral rules | ELA granted at the next tick or refused with a reason |
| `bank.primaryDealer.apply` / `bank.primaryDealer.resign` | `{ bloc, bankId }` | §3.10.5 requirements | status from the next game quarter start; resign takes effect at quarter end |

Validation errors return reason keys (`SOV_AUCTION_CLOSED`, `SOV_LICENSE`, `SOV_FACE_STEP`, `SOV_YIELD_RANGE`, `SOV_HOLD_FAILED`, `SOV_CAP_EXCEEDED`, `CBK_NOT_ELIGIBLE`, `CBK_COLLATERAL_INELIGIBLE`, `CBK_HAIRCUT_SHORT`, `CBK_ELA_INSOLVENT`, `CAPCON_BLOCKED`).

Players influence macro outcomes only through these intents, through markets (05), through banks and lending (07), and through politics and lobbying (16). There is no intent that sets a rate, a rating or a fiscal program.

---

## §5 Engine events

Envelope per 00 §5.6. All `macro.*` events also feed 20 (Truth Machine) and the world archive (16).

| Kind | Visibility | Payload (main fields) |
|---|---|---|
| `macro.release.consensus` | PUBLIC | bloc, kind, scheduledTick, consensus, dispersion |
| `macro.release.published` | PUBLIC | bloc, kind, actual, consensus, prior, revisedPrior, surprise, riskReaction vector |
| `macro.cycle.declared` | PUBLIC | bloc, regime, sinceDay |
| `macro.cb.guidance` | PUBLIC | bloc, meetingId, score, textKey |
| `macro.cb.decision` | PUBLIC | bloc, previousRate, newRate, corridor, emergency, votes, ruleTerms (published as rounded contributions), qe change, statementKey, reasons |
| `macro.cb.minutes` | PUBLIC | bloc, meetingId, dissent direction counts, risk assessment keys |
| `macro.cb.tool` | PUBLIC | bloc, tool (QE_START, QE_HOLD, QT_START, YCC_START, YCC_RAISE, YCC_END, LTRO_OPEN, SWAPLINE_ON/OFF, RR_CHANGE, CCYB_CHANGE, LTV_CHANGE), parameters |
| `macro.cb.facility.daily` | PUBLIC | bloc aggregate repo outstanding, ELA outstanding, deposits (no names) |
| `macro.cb.repo` / `macro.cb.ela` | PARTIES (+ SEALED copy to the bloc regulator for ELA) | bankId, amount, term, collateral summary |
| `macro.fiscal.quarter` | PUBLIC | bloc, deficit, primary, debtGdp (same as the FISCAL release) |
| `macro.fiscal.program` | PUBLIC | program fields, sponsors (16 decides who is named) |
| `macro.fiscal.rule_breach` | PUBLIC | bloc, rule, programId |
| `macro.sov.auction.announced` | PUBLIC | auction fields, offered face |
| `macro.sov.auction.result` | PUBLIC | stopYield, bidToCover, tailBp, allotmentAtStop, NPC/player shares (aggregate) |
| `macro.sov.bid.result` | PRIVATE | bidder's own awarded face, price |
| `macro.sov.buyback.result`, `macro.sov.syndication.priced` | PUBLIC | aggregates |
| `macro.sov.status` | PUBLIC | govId, status, trigger kind (for GRACE and later) |
| `macro.sov.default` | PUBLIC | credit-event payload for 06/08 (lines, missed amount) |
| `macro.sov.exchange.open` / `.tally` / `.result` | PUBLIC | offer terms; daily aggregate consent; outcome |
| `macro.fx.intervention.daily` | PUBLIC, published the next trading day | bloc, net intervention (FDL), reserves |
| `macro.fx.regime` | PUBLIC | bloc, old, new, band, devaluation size |
| `macro.fx.capcontrols` | PUBLIC | bloc, level, untilTick |
| `macro.csf.program` | PUBLIC | bloc, size, conditions, tranche dates, compliance |
| `macro.fear` | PUBLIC (hourly) | F, RA |
| `macro.fsi` | PUBLIC (hourly) | FSI and components |
| `macro.event.trigger` | PUBLIC | event id, tier, kind, blocs, publicTitleKey (no planned length, no planned moves) |
| `macro.event.phase` | PUBLIC | event id, phase |
| `macro.event.ended` | PUBLIC | event id, measured outcomes (for the archive) |
| `macro.event.internal` | SEALED (Truth Machine only; never revealed by discovery because it is world state, not evidence) | full plan: precursor shocks, trigger tick, severity |
| `macro.stab.msi` | PUBLIC (daily) | MSI |
| `macro.stab.report` | PUBLIC (weekly) | §3.17.5 contents |
| `macro.governor.appointed` | PUBLIC | bloc, governor npc id (16), term end |

---

## §6 NPC behaviour

### §6.1 Central banks and governors
Each CB follows §3.6 exactly. A named governor (16 actor, name in 22) heads it: term `PARAM.macro_governor_term_days = 2,912` game days (8 game years, about 2.2 chapters). At term end, or early if 16's politics model forces a replacement (allowed only when unemployment > NAIRU + 3 pp for 182 days, or after a peg break), a new hawkishness is drawn from the bloc range and member offsets are redrawn; the market's `ĥ` resets halfway toward 0.5. 16 writes speeches as text from the guidance score and `ruleTerms`; speeches never contain information beyond the published guidance (B09 rule: prose cannot create economic truth).

### §6.2 Treasuries
Follow §3.9 and §3.10 exactly. They respond to 16's political programs through §3.9.4 validation. They never trade in secondary markets except buybacks.

### §6.3 Orders handed to 05 (CB pool, treasury and Concord flows)
In P4 of each tick 04 emits to 05 a set of `NpcPoolOrder { poolId: 'CB:<bloc>' | 'TSY:<bloc>', assetId, side, qty, limitPrice?, tif: 'TICK' | 'RESTING' }`:
- QE/QT purchases and sales: daily amounts split evenly across the session ticks of each line, IOC limit at fair value + 2 × half-spread (they pay up to a small cost, never chase).
- YCC: resting bid at the cap price, size per §3.8.6.
- FX intervention: MANAGED_BAND edge orders resting each tick; lean-against-wind IOC orders sized per §3.13.2.
- Coordinated interventions (FREE_FLOAT in crisis): IOC orders up to 1% of reserves per trading day.
These orders clear in 05's auction like any order and produce real impact; their fills post as `MKT_TRADE`.

### §6.4 NPC primary dealers and investors
Primary dealer pools bid per §3.10.4. NPC holders of sovereign bonds (banks 07, funds 08, insurers 08, foreign CBs as reserve managers) are modelled by 05's pools in secondary markets and by the vote rule of §3.12.2 in restructurings. Foreign reserve managers hold FDL bonds (60% of reserves), EUN (20%), gold (10%), NKR and PYN (5% each); they rebalance quarterly through the CB pool, which gives FDL its reserve-currency bid.

### §6.5 Statistics offices and analysts
Statistics offices publish releases per §3.15 and declare cycles per §3.3.6. NPC analysts produce the consensus. 16 may name individual NPC economists whose forecasts are the consensus plus their own bias (each named economist's personal bias `~ N(0, 0.5 σ_cons)` fixed), giving players a track record to judge (same mechanism as rumor sources, ROADMAP §2.5).

### §6.6 Concord Stability Facility
Follows §3.13.6. Its managing director is a 16 actor; conditionality speeches are text only.

### §6.7 Rating agencies (08)
08's three NPC agencies read `SovereignRatingInputs` every day close, review each sovereign quarterly and on any `macro.sov.*` or `macro.fx.regime` event, and publish grades and outlooks. 04 reacts to grades only through §3.11.4 cliff effects and §3.7.1 recomputes.

### §6.8 Politics (16)
16 owns elections, lobbying and policy proposals. Its inputs from 04: unemployment, inflation, growth, debt, spreads, crisis state. Its outputs to 04: `FiscalProgram` proposals, `politicalStability_b`, `geopoliticalTension`, tariff changes, governor replacement requests, and the POLITICAL default decision under §3.12.1 conditions. Rules a player lobbied for apply to everyone, including them (V3 3.11).

---

## §7 Screens

17 owns layouts. This module's data appears on these screens (17 IDs):

| Screen | What it shows from 04 |
|---|---|
| MKT-02 Calendars | every scheduled release with consensus once published, CB meetings with guidance dates, sovereign auctions with offered size, crisis-week announcements, capital-control expiries |
| MKT-03 Macro dashboard (per bloc) | latest prints with surprise chips, history charts, the Cycle Committee label, credit conditions, fiscal prints, FX regime, comparison table across blocs; never hidden variables |
| MKT-04 Central bank page | governor, policy rate history, corridor, decision statements and vote tallies, guidance line, dots versus market-implied path, QE/QT holdings and pace, YCC cap, swap lines, reserve requirement, CCyB and LTV caps, Credibility gauge, next meeting countdown, minutes archive |
| MKT-05 Rates and curves | sovereign curves with prior overlays, OIS, term premium estimate, breakevens, 2Y–10Y spreads with the "Inverted" label, cross-currency basis, carry table |
| MKT-06 Sovereigns and ratings | debt/GDP, deficit, maturity wall, auction results table (cover, tail), spreads and market PD, grades and outlooks (08), status (GRACE, SD, restructuring with the exchange offer, CAC tally and a vote button for holders), Concord programs |
| MKT-07 System | Fear Index, FSI with components, emergent crisis labels and phases |
| MKT-08 Stabilizer and integrity report | MSI, levers, designed-path deviation, weekly faucet/sink summary |
| Sovereign auction ticket (opened from MKT-06 or MKT-02) | auction terms, WI yield, bid entry (competitive yield or noncompetitive face), cash hold preview, own bid status and results |
| Institutions app (17 §3.2.4 #16): Bank console tabs "Central bank" and "Primary dealer" | facility draws and collateral, reserve position versus requirement, IOR estimate, ELA status; dealer obligations tracker |
| Wire (16, 17 WIR) | release headlines, decisions, auction results, crisis headlines with cause links |
| Research Desk (17 RD) | macro attribution terms in dossiers (05 §3.12) |

---

## §8 Edge cases

1. **Policy at the ELB and the rule wants more easing:** rate stays at `elb`; QE logic (§3.8.5) takes over; guidance score is clamped at −1.
2. **Negative rates:** only EC and NA; the deposit facility rate can go negative, reversing the `CBK_DEPOSIT_INTEREST` direction (a charge, class SINK for player banks). 07 passes negative rates to deposits only for corporate deposits above 10M (DEFAULT).
3. **Hyperinflation guard:** `π_core` clamps at 60%; at > 25% for 91 days the hard-peg option opens (§3.13.5); CPI levels are floats (no overflow).
4. **Deflation:** `π_core` floors at −5%; real rates rise mechanically; the rule cuts toward ELB.
5. **A release day with a market-wide halt:** the release still publishes; 05 queues orders; the reopening auction absorbs it.
6. **Weekends:** macro day steps still run (state evolves); releases, meetings and auctions are on trading days only; FX regime breaks happen at the next `t = 45` of a trading day, except SC capital controls, which can start on a weekend day close if a weekend crisis trigger fires (crypto-driven contagion).
7. **Meeting on a day with an emergency already held that week:** the scheduled meeting still occurs; the emergency count resets each quarter.
8. **Two triggers on the same day close:** process in the fixed order of §3.1; only one major can be active; an emergent label during an active major is attached to it as a sub-phase rather than a second major.
9. **Chapter boundary inside a crisis:** crises continue; the chapter counters reset; the scheduler's "final 48 game days" rule applies only to new triggers.
10. **Auction with no player bids:** NPC ladder alone clears it; results are still published.
11. **Auction award rounding:** pro-rata remainders in lots go in hash order; the sum of awards never exceeds offered.
12. **A bidder's cash hold fails at settlement** (cannot happen because the hold is taken at submission; if a hold is released by 13 for a Held character, the bid is cancelled at P1 of the auction tick and the auction clears without it).
13. **Capital controls while a player holds SRL cash and an FDL margin call (07):** margin calls in another currency are met from that currency first; if impossible, 07 liquidates FDL positions; SRL cannot be converted at level ≥ 2. This is intended crisis risk and shown on the margin forecast (RSK-03).
14. **Restructuring vote by a holder whose bonds are lent out (07 securities lending):** the vote belongs to the borrower holding the bonds at the snapshot (as in real markets); lenders can recall before the snapshot.
15. **Bonds pledged as CB repo collateral when the line is restructured:** the CB revalues the new bonds; if collateral is short, 07 calls for top-up within 1 game day.
16. **Default of a bloc whose bonds are CCP collateral:** 07 haircut tables react through grades; no special rule.
17. **N_a collapses (world empties):** scale shrinks at most 0.5% per game day and floors at 0.2; nominal quantities shrink smoothly; outstanding debts are not rescaled (only flows and pools scale), so debt/GDP rises if the world shrinks fast, which is reported but capped in hazard z1 by the clamp.
18. **No 07 yet (early builds and unit tests):** the §3.14.4 fallback provides credit inputs; facility intents return `CBK_NOT_ELIGIBLE`.
19. **Release measurement noise moves a print across a threshold** (e.g. the Cycle Committee condition): the committee reads published prints, so noise can delay or hasten a declaration; this is intended.
20. **YCC and QE caps both binding:** the YCC bid shrinks to the remaining capacity; the cap can break; Wire item "YCC under pressure".
21. **Peg break while players hold FX forwards (06):** forwards settle at market; no special rule.
22. **Two blocs meet within the same tick** (cannot happen by calendar; meetings are on distinct trading days of the quarter).
23. **Missing input from another module this day:** last value holds; the event log records `macro.input.stale` (internal) for 20.
24. **Stabilizer with a tiny population:** OBSERVE mode below 03's `PARAM.stab_min_sample` engaged characters (03 §3.7.5); MSI per 03 §3.8.
25. **Stabilizer lever at a bound for more than 14 real days:** emits an internal alert to 21's admin console and 20; no automatic widening (Mathis or live-ops decide).

---

## §9 Exploits and counters

| # | Exploit | Counter |
|---|---|---|
| 1 | Trading on a release before others see it | releases apply in P2 of the release tick; orders for that tick were sealed in P0 before publication; news and fills publish together at P14 (02, old 01 §9) |
| 2 | Predicting releases or meetings from the seed | world seed is server-secret, entropy commit-reveal (02); clients never run the macro step |
| 3 | Inferring planned crises from server behaviour | planned shocks and lengths are SEALED internal state; the public sees only real state changes (§2.4 rule), identical in shape for a 10-day or a 30-day event |
| 4 | Cornering an auction to squeeze shorts | 35% award cap per beneficial-owner group (15 links alts); ECA surveillance (05/13) on auction-plus-secondary patterns; NPC dealer ladder always bids |
| 5 | Alts splitting bids to dodge the cap | owner-group aggregation by 15's link graph; awards to flagged groups are reduced to the cap at settlement |
| 6 | Interest-on-reserves farming (park cash in a player bank to earn the policy rate) | tiered remuneration: only up to 3× required reserves earns the policy rate, the rest the deposit rate; IOR is a counted FAUCET the Stabilizer sees; banking charters cost and carry capital rules (07, 13) |
| 7 | Borrowing at the standing facility to lend at a profit | the facility rate is the corridor ceiling (penalty rate) and needs haircut collateral; profitable only when markets are stressed, which is the intended role |
| 8 | Pushing a sovereign into default to profit from CDS | a default requires deterministic triggers (§3.12.1) driven by fundamentals and auctions; market pressure alone moves the market PD, not the model hazard; coordinated false stories are S5 manipulation (05, 13); legitimate speculation against a weak sovereign is allowed (it is real finance) |
| 9 | Speculative attack on the SRL band | intended gameplay; the CB defends with real orders, rate hikes and controls; attackers face carry cost (high SRL rates), controls risk and the possibility the CB holds |
| 10 | Bribing a governor, a statistics office or an agency | crimes under 12/13 (bribery S5); the macro engine ignores bribes (no mechanical effect), so the only gain is information already in the public data or 12's insider-tip mechanics |
| 11 | Lobbying a stimulus to pump one's own businesses | lawful lobbying (16) is allowed and the program applies to every firm in the sector, including rivals; incentives have budgets; bribery is separate (13) |
| 12 | Gaming the Stabilizer (alts at the designed path to bias the median) | population is 03's engaged set weighted by activity (03 §3.7.2); the median is robust; 15's alt detection removes linked accounts from the population |
| 13 | Gaming MSI to change NWI ranks | MSI is a common divisor for everyone, so it cannot reorder players at one time; it affects only cross-time comparisons |
| 14 | Exploiting capital-control timing (convert just before controls) | controls start at the next tick after the break rule fires at `t = 45`, and the break is preceded by public pressure (reserves, EMP); this is intended "read the warning signs" play; a level-1 levy applies first in most paths |
| 15 | Voting a restructuring with borrowed bonds | allowed (real-world rule); 07 lenders can recall before the snapshot; collusion between linked accounts is voided by 15 |
| 16 | Forcing a CB emergency cut by crashing the bloc index | emergency triggers need broad stress (index −15% over 5 days, FSI, interbank), which a single whale cannot cheaply produce given 05's depth and the NPC economy size; market manipulation is surveilled |

---

## §10 Acceptance tests

1. Same seed and same intents give byte-identical `BlocMacroState`, `GlobalMacroState`, releases, decisions and auction results over 5 game years.
2. Removing all player intents does not change the macro path except through scale `S` (players' activity), and with `N_a` held constant the path is identical.
3. Adding a new random stream key elsewhere does not change any macro output.
4. Over 200 seeds × 10 game years with no players, mean regime durations are within ±15% of 819/273/273/273 game days and every regime transition is along an allowed edge.
5. With imbalance weights set to 0, transition rates equal the base chain within statistical tolerance; with a credit z of +2 sustained, the EXP→CON hazard is `e^(0.8)` times the base within 10%.
6. An inverted 10y–3m curve for ≥ 63 trading days precedes at least 60% of CONTRACTION entries in the 200-seed run (recessions are caused and readable).
7. A 1 pp permanent rise in the policy rate lowers the output gap by 0.4–0.6 pp after 1 game year, all else fixed (unit test with shocks off).
8. With credibility 0.9, a 1-game-year energy shock that lifts headline inflation by 3 pp moves `π_e5` by less than 0.3 pp; with credibility 0.3 it moves by more than 0.8 pp.
9. The policy rule reproduces old 01 §5.4 when `hawk = 0.5` and FSI, FX terms are 0: `i* = r* + π + 0.5(π − π*) + 0.5x` within 1e-9.
10. Scheduled decisions are always multiples of 25 bp, never exceed ±50 bp (±75 bp when the gap ≥ 2 pp), and never go below the ELB.
11. Over 200 seeds, guidance direction matches the decision direction in ≥ 80% of meetings for clarity 0.8 and ≥ 60% for clarity 0.4.
12. Minutes dissent counts are consistent with the 9 member offsets: recomputing members' preferences from saved state reproduces the tally.
13. Every scheduled release appears in the calendar ≥ 1 game day ahead with its consensus, is published at its scheduled tick, and never on a weekend.
14. Over 1,000 releases, the mean of `actual − trueValue` is within 0.1 σ_meas of 0, and consensus error has standard deviation σ_cons within 10%.
15. No field marked hidden (§2.4 rule) ever appears in any client payload or PUBLIC event (schema test over the event stream).
16. An order sealed in tick N cannot react to a release published in tick N: a test bot that conditions on the release only gets fills at tick ≥ N+1.
17. The government curve satisfies `y(0.25) ≈ OIS(0.25) + small spreads` and `y(30) → n∞ + TP(30) + s_sov(30)` within 5 bp in a steady state.
18. A CPI surprise of +2σ in FU raises the FU 2y yield by 5–25 bp at the release tick (through the path recompute) and the 10y less than the 2y.
19. QE of 10% of GDP lowers FU TP10 by 25 bp ± 1 bp (stock effect) and the CB holds ≤ 50% of any line.
20. YCC: while active with capacity, the PL 10y closing yield never exceeds the cap by more than 2 bp; when capacity is exhausted, the yield can exceed it.
21. Primary auctions are uniform price: every winning bid pays the stop-yield price; the sum of awards ≤ offered; no owner group gets more than 35%.
22. An auction where player bids are absent clears with bid-to-cover between 2.0 and 2.8 in calm conditions (stress 0, F ≤ 30).
23. A failed auction increments `failedAuctions21d`, adds stress, and pushes the shortfall into the next bill auction; two failures with an insufficient buffer and no backstop open a default case (EC test).
24. FU never enters GRACE in 200 seeds × 10 game years, and NA never does; SC enters GRACE in 5%–25% of 10-year runs (calibration band, 20 adjusts λ0).
25. A restructuring with ≥ 75% ACCEPT exchanges all lines including rejecters; with < 75% after round 3 the unilateral exchange runs and holdout claims are filed in 13.
26. Restructuring postings conserve money: total cash before and after the exchange is equal; only instrument values change (REVALUE).
27. Over 200 seeds × 10 game years, carry (long SRL vs FDL, funded) earns a positive mean return and its worst 5-day loss is ≥ 15% in at least half the seeds (carry works on average and blows up).
28. Cross rates have no arbitrage: every non-FDL cross is quoted as a product of two FDL pairs (05 test referenced here).
29. The PL band holds within ±3% while reserve cover ≥ 3 months, and realignments happen only at meetings.
30. A speculative attack that drains SC reserves below 3 months with EMP > 2 for 5 trading days produces either a Concord program or a break with a 15%–40% fair-value drop and level-2 capital controls for 3 game days.
31. At capital-control level 2, an order selling SRL for FDL is rejected with `CAPCON_BLOCKED`, a reduce-only close of an existing SRL/FDL future is accepted, and trading an SRL-denominated stock for SRL is accepted.
32. Fear Index stays in [15, 35] for ≥ 70% of calm-expansion days and exceeds 60 during ≥ 80% of major-crisis CONTAGION phases.
33. Over 1,000 simulated chapters with the default rates, the share with ≥ 1 major crisis is 35% ± 5%; storms occur 12–18 times per chapter; ripples 150–230 per chapter.
34. No two majors are active at once; no scheduled major triggers within 504 game days of the previous trigger, nor in the last 48 game days of a chapter; precursor phases last ≥ 8 game days.
35. Trigger ticks of scheduled majors rotate across the three UTC bands (each band gets 33% ± 10% over 300 majors).
36. Each major kind, when forced on a clean seed, hits its calibration band (§3.16.4) in ≥ 70% of 50 forced runs (e.g. EQUITY_BUBBLE_BURST: GX −30% to −45% within 42 game days).
37. A world event's public view on day 3 is identical whether its planned length is 10 or 30 game days (no time-remaining leak).
38. The weekly report (§3.17.5) shows exactly 03's lever values and `e` for that Monday's day close; 04 contains no second Stabilizer controller or lever set (static check).
39. `macro.stab.msi` equals 03's MSI (03 §3.8) for the same day, and NWI rankings at one tick are identical to NW rankings (common divisor).
40. All 04 postings carry a registered reason code of exactly one class, and the P13 invariant (03) passes on every tick of the 5-year run.
41. IOR above 3× required reserves is paid at the deposit rate, not the policy rate.
42. A standing-facility draw is refused for ineligible collateral, for a non-chartered entity, and when the post-haircut value is short; accepted otherwise, and no named usage appears in PUBLIC events.
43. Disabling 07 (fallback) leaves the macro step runnable with credit inputs from §3.14.4.
44. Old open question resolutions hold: old 01 §5.4 "~6 real days" meetings is not used; meetings are quarterly per bloc staggered (test the calendar).
45. A FiscalProgram that breaches a fiscal rule raises the liquidity premium by 25 bp for 182 game days and emits `macro.fiscal.rule_breach`.
46. Macro day step runtime ≤ 5 ms on the reference server for 5 blocs (19 performance budget); hourly F and FSI ≤ 0.5 ms.
