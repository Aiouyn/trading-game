// T04-01: 04 macro schema. Enums and entity interfaces of 04 §2.1–§2.13, transcribed field for field (bloc ids are currency
// codes, 24 R39), plus the storage additions the card decides, and the macro tables (module '04', COORD-homed, no home function).
import type { Ccy, Id, Money, Price, Qty, SortedMap, Tick } from '@tycoon/engine-core';
import type { TableDef } from '@tycoon/engine-core';

// ───────── §2.1 identifiers and enums ─────────
// Bloc ids are currency codes (24 R39): 04's two-letter ids are aliases only.
export type BlocId = 'FDL' | 'EUN' | 'PYN' | 'NKR' | 'SRL';
export const BLOC_ALIAS: Readonly<Record<'FU' | 'EC' | 'PL' | 'NA' | 'SC', BlocId>> = Object.freeze({ FU: 'FDL', EC: 'EUN', PL: 'PYN', NA: 'NKR', SC: 'SRL' });
/** 04's FU, EC, PL, NA, SC draw order (§3.19). */
export const BLOC_ORDER: readonly BlocId[] = Object.freeze(['FDL', 'EUN', 'PYN', 'NKR', 'SRL'] as const);
export type Regime = 'EXPANSION' | 'OVERHEATING' | 'CONTRACTION' | 'RECOVERY';
export type FxRegimeKind = 'FREE_FLOAT' | 'MANAGED_BAND' | 'MANAGED_FLOAT' | 'HARD_PEG';
export type Tenor = 'B3M' | 'B6M' | 'B1Y' | 'N2Y' | 'N5Y' | 'N10Y' | 'N30Y' | 'L10Y';   // bills, nominal notes/bonds, 10y inflation-linked
export type ReleaseKind = 'CPI' | 'JOBS' | 'GDP_ADV' | 'GDP_REV1' | 'GDP_REV2' | 'PMI' | 'RETAIL' | 'TRADE' | 'SENTIMENT'
  | 'HOUSING' | 'CREDIT' | 'FISCAL' | 'CB_DECISION' | 'CB_GUIDANCE' | 'CB_MINUTES' | 'RESERVES';
export type CrisisKind = 'EQUITY_BUBBLE_BURST' | 'CREDIT_CRUNCH' | 'BANKING_PANIC' | 'CRYPTO_WINTER' | 'OIL_SHOCK'
  | 'CURRENCY_CRISIS' | 'SOVEREIGN_DEBT_CRISIS' | 'AI_BUBBLE' | 'CYBER_PANDEMIC' | 'FLASH_CRASH'
  | 'HOUSING_CRASH' | 'STAGFLATION' | 'SECURITIZATION_CRISIS' | 'FUNDING_RUN' | 'TRADE_WAR';
export type StormKind = 'RATE_SCARE' | 'OIL_SPIKE_LITE' | 'CRYPTO_FLUSH' | 'CREDIT_WOBBLE' | 'FX_SQUALL'
  | 'SECTOR_ROTATION' | 'EARNINGS_SCARE' | 'LIQUIDITY_HICCUP';
export type RippleKind = 'SECTOR_SHOCK' | 'COMMODITY_SUPPLY' | 'COMMODITY_DEMAND' | 'REGULATORY_NOTE' | 'LOCAL_BOOM';
export type EventTier = 'RIPPLE' | 'STORM' | 'MAJOR';
export type CrisisPhase = 'PRECURSOR' | 'TRIGGER' | 'CONTAGION' | 'POLICY' | 'RECOVERY' | 'ENDED';
/** Value lists of the §2.1 enums (for schemas and tests). */
export const REGIMES: readonly Regime[] = ['EXPANSION', 'OVERHEATING', 'CONTRACTION', 'RECOVERY'];
export const FX_REGIME_KINDS: readonly FxRegimeKind[] = ['FREE_FLOAT', 'MANAGED_BAND', 'MANAGED_FLOAT', 'HARD_PEG'];
export const TENORS: readonly Tenor[] = ['B3M', 'B6M', 'B1Y', 'N2Y', 'N5Y', 'N10Y', 'N30Y', 'L10Y'];
export const RELEASE_KINDS: readonly ReleaseKind[] = ['CPI', 'JOBS', 'GDP_ADV', 'GDP_REV1', 'GDP_REV2', 'PMI', 'RETAIL', 'TRADE', 'SENTIMENT',
  'HOUSING', 'CREDIT', 'FISCAL', 'CB_DECISION', 'CB_GUIDANCE', 'CB_MINUTES', 'RESERVES'];
export const CRISIS_KINDS: readonly CrisisKind[] = ['EQUITY_BUBBLE_BURST', 'CREDIT_CRUNCH', 'BANKING_PANIC', 'CRYPTO_WINTER', 'OIL_SHOCK',
  'CURRENCY_CRISIS', 'SOVEREIGN_DEBT_CRISIS', 'AI_BUBBLE', 'CYBER_PANDEMIC', 'FLASH_CRASH', 'HOUSING_CRASH', 'STAGFLATION', 'SECURITIZATION_CRISIS',
  'FUNDING_RUN', 'TRADE_WAR'];
export const STORM_KINDS: readonly StormKind[] = ['RATE_SCARE', 'OIL_SPIKE_LITE', 'CRYPTO_FLUSH', 'CREDIT_WOBBLE', 'FX_SQUALL', 'SECTOR_ROTATION',
  'EARNINGS_SCARE', 'LIQUIDITY_HICCUP'];
export const RIPPLE_KINDS: readonly RippleKind[] = ['SECTOR_SHOCK', 'COMMODITY_SUPPLY', 'COMMODITY_DEMAND', 'REGULATORY_NOTE', 'LOCAL_BOOM'];
export const EVENT_TIERS: readonly EventTier[] = ['RIPPLE', 'STORM', 'MAJOR'];
export const CRISIS_PHASES: readonly CrisisPhase[] = ['PRECURSOR', 'TRIGGER', 'CONTAGION', 'POLICY', 'RECOVERY', 'ENDED'];

// ───────── §2.2 bloc ─────────
export interface BlocDef {
  id: BlocId; name: string; ccy: Ccy;
  cbkId: string; govId: string; excId: string; regId: string; crtId: string;
  cityIds: [string, string, string];          // 3 cities per bloc (10, 22)
  gdpShare0: number;                          // share of world nominal GDP at genesis
  potentialGrowth0: number;                   // g_pot, real, per game year
  inflationTarget: number;                    // π_target
  rStar0: number;                             // neutral real rate r*
  nairu: number;                              // u*
  laborForceGrowth: number;                   // per game year
  openness: number;                           // exports / GDP
  commodityExporter: number;                  // −1 net importer … +1 net exporter of energy
  foodWeight: number;                         // CPI weight of food
  energyWeight: number;                       // CPI weight of energy
  fxPassThrough: number;                      // share of yoy effective depreciation passed into core inflation
  fiscalRule: FiscalRule;
  fxRegime0: FxRegimeKind;
  negativeRatesAllowed: boolean;
  elb: number;                                // effective lower bound on the policy rate
  sovereignBaseHazard: number;                // λ0, annual, §3.11
  debtReference: number;                      // d*
  fxDebtShare0: number;                       // share of sovereign debt denominated in FDL
  sectorWeights: number[];                    // 12 entries (old 01 §3.2 sector order), sum 1
  cycleCoupling: number;                      // how strongly the global regime drives this bloc
  personality: { hawkMin: number; hawkMax: number; credibility0: number; communicationClarity: number };
}
export type FiscalRule =
  | { kind: 'FLEXIBLE' }                                     // FU
  | { kind: 'DEFICIT_CAP'; cap: number; debtRef: number }    // EC Compact rule
  | { kind: 'BALANCED_CYCLE'; tolerance: number }            // PL
  | { kind: 'SURPLUS_SWF'; targetSurplus: number }           // NA
  | { kind: 'PROCYCLICAL'; boomSpendShare: number };         // SC

// ───────── §2.3 true macro state per bloc (never sent to clients) ─────────
export type ImbalanceKey = 'credit' | 'valuation' | 'curve' | 'inflation' | 'house' | 'oil' | 'fiscal' | 'fear' | 'contagion' | 'policy' | 'overheat' | 'trade'
  | 'stimulus';   // card: §3.3.3 row
export const IMBALANCE_KEYS: readonly ImbalanceKey[] = ['credit', 'valuation', 'curve', 'inflation', 'house', 'oil', 'fiscal', 'fear', 'contagion',
  'policy', 'overheat', 'trade', 'stimulus'];
export interface ActiveShock { id: string; target: string; value: number; startTick: Tick; endTick: Tick; shape: 'STEP' | 'RAMP' | 'DECAY'; halfLifeDays?: number; sourceCrisisId?: string }
export interface BlocMacroState {
  bloc: BlocId; tick: Tick;
  regime: Regime; regimeSinceTick: Tick;
  outputGap: number; outputGapTarget: number; potentialGrowth: number;
  realGdpIndex: number; potentialGdpIndex: number;
  nominalGdp: Money;
  gdpGrowthQoQAnn: number;
  coreInflation: number; headlineInflation: number;
  inflationExp1y: number; inflationExp5y5y: number;
  cpiLevel: number; coreCpiLevel: number;
  wageIndex: number; wageGrowth: number;
  unemployment: number;
  rStar: number;
  creditGap: number; creditGrowth: number; creditConditions: number;
  housePriceGap: number;
  realRateGapSmoothed: number;
  fiscal: FiscalState; fx: FxState; sovereign: SovereignCreditState;
  imbalance: Record<ImbalanceKey, number>;
  shocks: ActiveShock[];
  // card additions (stored state used by later 04 rules)
  rStarRw: number;                 // §3.4.4 random walk
  gapEstNoise: number;             // T04-01b: ε of outputGapEstimate (hidden: with x̂ public it would reveal x)
  credit: number; credit0: number /* E-90 (1): genesis credit, float, never changes */; creditGdpTrend: number; peNorm: number; fiscalImpulse: number; unemployment12mLow: number;
  dep: number;                     // effective depreciation yoy
  sentiment: number; consumptionSignal: number;
  highSpreadTradingDays?: number;  // T04-13: consecutive trading days with s10 > 0.15 (POLITICAL trigger)
}

// ───────── §2.4 public macro view ─────────
/** E-81: `actual` is the headline value (CPI: headline yoy). `extra` carries the same release's other fields, `{}` for kinds without
 *  extras; CPI: `coreYoy`, `headlineMom`, `coreMom`; JOBS: `payrollIndex`. */
export interface LatestPrint { kind: ReleaseKind; tick: Tick; actual: number; consensus: number; prior: number; revisedPrior?: number; surprise: number;
  extra: Readonly<Record<string, number>> }
export interface CurvePoint { tenorYears: number; yield: number }
export interface PublicMacroView {
  bloc: BlocId; asOfTick: Tick;
  prints: Record<ReleaseKind, LatestPrint | null>;
  cycleLabel: Regime | 'UNDETERMINED'; cycleLabelSinceDay: number;
  policyRate: number; depositRate: number; lendingRate: number; reserveRequirement: number;
  nextMeeting: { tick: Tick; guidanceTick: Tick };
  guidance: { tick: Tick; score: number; text: string } | null;
  dots: { horizonQuarters: 1 | 2 | 4 | 8; rate: number }[];
  marketImpliedPath: { horizonQuarters: 1 | 2 | 4 | 8; rate: number }[];
  curve: CurvePoint[];
  ois: CurvePoint[]; breakeven10y: number; termPremium10y: number;
  sovereignSpread10y: number; sovereignPd1y: number;
  fiscalPrints: { deficitGdp: number; debtGdp: number; primaryBalanceGdp: number; asOfQuarter: number };
  fx: { spotVsFdl: number; regime: FxRegimeKind; band?: { center: number; halfWidth: number };
        reservesFdl: string; reserveCoverMonths: number; capitalControls: 0 | 1 | 2 | 3 };
  qeHoldingsGdp: number; ccyb: number; ltvCapResidential: number; ltvCapCommercial: number;
  credibilityPublic: number;
}

// ───────── §2.5 global macro state ─────────
export interface GlobalMacroState {
  tick: Tick;
  globalRegime: Regime; globalRegimeSinceTick: Tick;
  fearIndex: number; riskAppetite: number; financialStressIndex: number;
  worldTradeIndex: number; tariffLevel: number; worldScale: number;
  tariffBase: number;   // policy tariff before shocks (16), genesis 0.03; tariffLevel = effectiveTariff(tariffBase, shock sum) (E-94 (a))
  worldNominalGdpFdl: Money;
  energyIndex: number; foodIndex: number;
  aiRaceIndex: number; worldHackRate: number; geopoliticalTension: number;
  chapterIndex: number;
  scheduler: CrisisSchedulerState;
  stabilizer: StabilizerState;
}

// ───────── §2.6 central bank ─────────
export interface MeetingSchedule { scheduledTicks: Tick[]; guidanceLeadTicks: number; minutesLagTicks: number }
export interface CbDecision {
  meetingId: string; tick: Tick; emergency: boolean;
  previousRate: number; newRate: number;
  ruleRate: number;
  ruleTerms: { neutral: number; inflation: number; inflationGap: number; outputGap: number; finStress: number; fx: number; bias: number };
  voteFor: number; voteAgainst: number;
  qeChangePerMonth: Money; statementKey: string; reasons: string[];
}
export interface ForwardGuidance { meetingId: string; tick: Tick; score: number; impliedMove: -2 | -1 | 0 | 1 | 2; textKey: string }
export interface AssetPurchaseProgram {
  state: 'NONE' | 'QE' | 'HOLD' | 'QT';
  purchasesPerMonth: Money;
  eligible: { govBonds: number; corpIG: number; abs: number };
  holdingsCapGdp: number;
  qtRunoffCapPerMonth: number;
  startedTick?: Tick;
  // T04-09 program progress (unit decision: 04 leaves it implicit). month = first game day of the game month the totals belong to.
  month?: { start: number; bought: Money; sold: Money; runoff: Money };
  day?: { gameDay: number; rows: { assetId: string; side: 'BUY' | 'SELL'; face: Qty }[] };   // the day's plan; face = still to trade
}
export interface YieldCurveControl { tenorYears: 10; capYield: number; active: boolean; startedTick: Tick }
export interface FacilityTerms {
  lendingRate: number; depositRate: number;
  collateralHaircuts: Record<string, number>;
  elaPenaltySpread: number;
  maxTermDays: number;
}
export interface SwapLine { counterpartyCbk: string; limit: Money; spread: number; active: boolean; drawn: Money; calmDays?: number /* T04-09 */ }
/** §3.6.6 emergency triggers, declaration order (E-100 (c): declared here, re-exported by rules/cb.ts). */
export type EmergencyTrigger = 'FSI' | 'EQUITY_DROP' | 'INTERBANK' | 'CURRENCY' | 'CRISIS_POLICY';
export interface CentralBank {
  id: string; bloc: BlocId; name: string;
  mandate: 'PRICE_STABILITY' | 'DUAL';
  hawkishness: number; hawkDrift: number;
  credibility: number;
  smoothing: number;
  phiPi: number; phiX: number; phiFs: number; phiFx: number; bias: number;
  rStarEstimate: number;
  policyRate: number;
  corridorHalfWidth: number;
  reserveRequirement: number;
  iorTierMultiple: number;
  meetings: MeetingSchedule;
  lastDecisions: CbDecision[];
  guidance: ForwardGuidance | null;
  dots: { horizonQuarters: number; rate: number }[];
  qe: AssetPurchaseProgram;
  ycc: YieldCurveControl | null;
  macroprudential: { ccyb: number; ltvCapResidential: number; ltvCapCommercial: number; dtiCap: number };
  facilities: FacilityTerms;
  swapLinesOut: SwapLine[];
  reserves: { fdl: Money; gold: Qty; otherFx: Record<Ccy, Money> };   // card step 1: DEFAULT keep Money
  balanceSheet: { govBonds: Money; corpBonds: Money; abs: Money; loansToBanks: Money; elaOutstanding: Money; bankReserves: Money; currencyInCirculation: Money };
  emergencyCountQuarter: number;
  // card additions (04 §3.6.2, §3.6.4 step 7, §3.4.4, §6.1)
  memberOffsets: number[];         // 9, fixed at appointment
  rStarBias: number;
  governorNpcId: Id | null; governorTermEndTick: Tick;
  offTargetDays: number;           // consecutive days |π_core − target| > 0.02
  ycc10Streak: number; yccHighInflDays: number; yccRaises: number; lowDepthDays: number;
  ltroOpenUntilTick: Tick | null;
  backstop?: { assetId: string; face: Qty; days: number[]; done: number[] };   // T04-11 failed-auction secondary backstop: face over the listed trading days (T04-14 passes the orders to writePoolOrders)
  ccybPending: { value: number; effectiveTick: Tick } | null;
  emergencyQuarter: number;        // quarter index of emergencyCountQuarter, quarter = floor(game day / 91)
  pendingEmergency: { tick: Tick; triggers: EmergencyTrigger[] } | null;
  yccPressureWired?: boolean;      // T04-09 edge 20: the WIRE_ITEM hook of the current under-pressure episode is written
  rrEasingQuarter?: number;       // T04-08 adjustRr: quarter of the last SRL EASING change (at most one per quarter)   // E-100 (c): genesis null; set by T04-06 scheduleEmergency, cleared by the emergency runMeeting
}

// ───────── §2.7 treasury, fiscal, issuance, auctions ─────────
export interface FiscalProgram {
  id: string; bloc: BlocId; kind: 'INFRASTRUCTURE' | 'GREEN_ENERGY' | 'AI_COMPUTE' | 'HOUSING' | 'DEFENSE_SECURITY'
    | 'TAX_CUT' | 'HOUSEHOLD_TRANSFER' | 'INDUSTRIAL_SUBSIDY' | 'AUSTERITY';
  sizeGdpPerYear: number;
  sectorDemand: Record<number, number>;
  incentive?: { target: 'CAPEX_SECTOR' | 'COMPUTE_SPEND' | 'MORTGAGE_RATE' | 'HIRING'; sector?: number; rate: number };
  budget: Money; spent: Money;
  startTick: Tick; endTick: Tick;
  source: 'AUTOMATIC' | 'POLITICS' | 'CRISIS_RESPONSE' | 'CONCORD_CONDITIONALITY';
  sponsorActorIds: string[];
  breachUntilTick?: Tick;   // card addition (T04-10): passed against its fiscal rule; the 25 bp window is [until − 182·720, until)
}
export interface FiscalState {
  revenueGdp: number; spendingGdp: number; interestGdp: number;
  primaryBalanceGdp: number; deficitGdp: number;
  debt: Money; debtGdp: number; fxDebt: Money;
  averageCoupon: number; averageMaturityYears: number;
  cashBuffer: Money;
  grossFinancingNeedQuarter: Money;
  shortfallCarry?: Qty;   // T04-11: failed-auction shortfall (face) waiting for the next quarter's first B3M (none left in this quarter)
  programs: FiscalProgram[];
  austerityMode: boolean;
  swfAssets: Money;
}
export interface SovereignIssue {
  assetId: string; govId: string; tenor: Tenor; ccy: Ccy;
  couponRate: number; issueTick: Tick; maturityTick: Tick; faceOutstanding: Qty;
  inflationLinked: boolean; fxDenominated: boolean; cac: { threshold: number; aggregated: boolean };
  onTheRun: boolean;
}
export interface AuctionBid {
  bidId: string; auctionId: string; bidderId: string;
  kind: 'COMPETITIVE' | 'NONCOMPETITIVE';
  yieldBp?: number;
  face: Qty; cashHoldId: string;
  submittedTick: Tick; primaryDealer: boolean;
}
export interface SovAuction {
  id: string; govId: string; assetId: string; tenor: Tenor; reopening: boolean;
  announceTick: Tick; bidOpenTick: Tick; auctionTick: Tick;
  offeredFace: Qty; whenIssuedYield: number | null;
  bids: AuctionBid[];
  result?: { stopYield: number; allotmentAtStopPct: number; bidToCover: number; tailBp: number;
             awardedFace: Qty; npcShare: number; playerShare: number; failed: boolean };
}
export interface Buyback { id: string; govId: string; assetIds: string[]; maxFace: Qty; tick: Tick; offers: { offerId: string; holderId: string; assetId: string; face: Qty; minPrice: Price }[] }
export interface Syndication { id: string; govId: string; assetId: string; size: Qty; leadManagers: string[]; bookOpenTick: Tick; pricingTick: Tick; guidanceSpreadBp: number; feeRate: number;
  tenor?: 'N30Y' | 'N10Y_FDL' /* T04-12 */; curveYield?: number /* T04-12: curve zero at the maturity, fixed at book open */;
  pricedTick?: Tick /* T04-12: set at pricing; a priced book takes no orders */ }

// ───────── §2.8 sovereign credit ─────────
export interface SovereignRatingInputs {
  govId: string; tick: Tick; debtGdp: number; interestRevenue: number; primaryBalanceGdp: number;
  realGrowthTrend: number; inflationVol: number; reserveCoverMonths: number; fxDebtShare: number;
  cbCredibility: number; politicalStability: number;
  marketPd1y: number; modelPd1y: number;
}
export interface ExchangeOffer {
  id: string; round: 1 | 2 | 3; openTick: Tick; closeTick: Tick;
  haircutNpv: number;
  newBonds: { tenor: Tenor; couponRate: number; maturityYears: number; facePer100: number }[];
  consentSoFar: number;
  status: 'OPEN' | 'ACCEPTED' | 'FAILED';
}
export interface SovereignDefaultCase {
  id: string; govId: string; triggerTick: Tick; trigger: 'FAILED_ROLLOVER' | 'FX_SERVICE' | 'POLITICAL' | 'HAZARD';
  missedPayment: { assetId: string; amount: Money; dueTick: Tick };
  graceEndsTick: Tick;
  offers: ExchangeOffer[];
  resolvedTick?: Tick; recoveryNpv?: number;
}
export interface SovereignCreditState {
  hazard: number;
  pd1y: number; pd5y: number;
  spread10y: number;
  liquidityPremium: number;
  convenienceYield: number;
  stressIndex: number;
  failedAuctions21d: number;
  status: 'PERFORMING' | 'GRACE' | 'SELECTIVE_DEFAULT' | 'RESTRUCTURING' | 'POST_RESTRUCTURING';
  defaultCase?: SovereignDefaultCase;
  ratingInputs: SovereignRatingInputs;
}

// ───────── §2.9 FX ─────────
export interface FxState {
  ccy: Ccy;
  fairValueLn: number; pppLn: number; realExchangeGap: number;
  regime: FxRegimeKind;
  band?: { centerLn: number; halfWidth: number; basket: Partial<Record<Ccy, number>> };
  reservesFdl: Money; reservesTarget: Money; reserveCoverMonths: number;
  currentAccountGdp: number; capitalFlowIndex: number;
  exchangeMarketPressure: number;
  capitalControls: 0 | 1 | 2 | 3;
  capitalControlsUntilTick?: Tick;
  interventionToday: Money;
  crisisFlag: boolean;
  // T04-14 card additions (04 leaves storage implicit)
  capconSchedule?: { level: 0 | 1 | 2 | 3; startTick: Tick; untilTick: Tick | null; reason: string };
  empDays?: number; breakArmed?: boolean; fxServicePending?: boolean;
  bandC0?: number; weakEdgeDays?: number; strongEdgeDays?: number; bandToleranceWide?: boolean;
  breakTick?: Tick; highCoreDays?: number; pegLn?: number;
  hist?: { lnS: number; res: Money; i: number }[] /* trading-day closes, last 370 */; lastRA?: number; lastEnergy?: number;
  pendingDaily?: { gameDay: number; net: Money; reserves: Money };
}

// ───────── §2.10 crisis scheduler and crises ─────────
export interface CrisisSchedulerState {
  lastMajorEndTick: Tick | null; lastMajorStartTick: Tick | null; majorsThisChapter: number;
  playerCausedSuppressUntil: Tick | null;
  timezoneBandNext: 0 | 1 | 2;
  crisisWeek: { announcedTick: Tick; startTick: Tick; endTick: Tick } | null;
  crisisWeekUsedThisChapter: boolean;
  activeMajorId: string | null; activeStormIds: string[]; activeRippleIds: string[];
}
export interface WorldEvent {
  id: string; tier: EventTier; kind: CrisisKind | StormKind | RippleKind;
  blocs: BlocId[]; sectors: number[]; assetsHint: string[];
  phase: CrisisPhase; phaseSinceTick: Tick;
  precursorStartTick: Tick; triggerTick: Tick; plannedEndTick: Tick;
  origin: 'SCHEDULED' | 'EMERGENT' | 'PLAYER_CAUSED';
  severity: number;
  shocks: ActiveShock[];
  publicTitleKey: string | null;
  causeChain: { tick: Tick; key: string; refs: string[] }[];
}

// ───────── §2.11 stabilizer (read-only mirror of 03, R04) ─────────
export interface StabilizerState {
  errorLog: number; integral: number; msi: number;
  levers: { L1_demand: number; L2_lifestyle_price: number; L3_levy_bp: number; L4_upkeep: number };
  lastPublishedReportTick: Tick;
  diagnostics: { faucetsWeek: Money; sinksWeek: Money; netMintWeek: Money; npcToPlayerWealthRatio: number; m0Index: number; m2Index: number };
}

// ───────── §2.12 data releases ─────────
export interface ReleaseSchedule { bloc: BlocId; kind: ReleaseKind; rule: 'MONTHLY_DAY' | 'QUARTERLY_DAY' | 'WEEKLY_DAY'; dayOffset: number; tickOfDay: number }
export interface DataRelease {
  id: string; bloc: BlocId; kind: ReleaseKind; scheduledTick: Tick; releasedTick: Tick;
  referencePeriod: { kind: 'MONTH' | 'QUARTER' | 'WEEK'; index: number };
  trueValue: number;
  actual: number; consensus: number; consensusDispersion: number;
  prior: number; revisedPrior?: number;
  surprise: number;
  extra: Readonly<Record<string, number>>;   // E-81, as LatestPrint.extra
}

// ───────── §2.13 Concord Stability Facility ─────────
export interface ConcordFacility {
  id: 'npc_CSF'; quotas: Record<BlocId, Money>;
  lendingCapacity: Money;
  programs: { bloc: BlocId; size: Money; drawn: Money; rate: number; startTick: Tick; endTick: Tick;
              conditions: { primaryBalanceStepPerYear: number; cbIndependence: boolean; capitalControlsPhaseOutDays: number };
              compliance: number;
              // T04-14 card additions
              id?: string; cause?: 'BREAK_PENDING' | 'FX_SERVICE' | 'SPREAD' | 'RESTRUCTURING'; trancheTicks?: Tick[]; tranchesPaid?: number; skipped?: number;
              repaid?: Money; accrued?: Money; pb0?: number; phaseOutTick?: Tick; closedTick?: Tick }[];
}

// ───────── additions decided by the card (04 leaves storage implicit) ─────────
type Ns = { L: number; S: number; C: number; lambda: number };
export interface CurveState { id: BlocId; tick: Tick; hHat: number; marketImplied: { horizonQuarters: 1 | 2 | 4 | 8; rate: number }[]; nInf: number;
  nodes: CurvePoint[]; ois: CurvePoint[]; ns: Ns; nsOis: Ns; nsReal: Ns; tp10: number; breakeven: CurvePoint[]; basis: number; inversionDays: number }
export interface DailyHistoryRow { id: string /* `${bloc}:${gameDay}` or `GLOBAL:${gameDay}` */; bloc: BlocId | 'GLOBAL'; gameDay: number;
  realGdpIndex: number; cpiLevel: number; coreCpiLevel: number; outputGap: number;
  outputGapEstimate: number /* E-45: public x̂ = x + ε, ε AR(1) per GD, ρ 0.98, σ 0.005, stream `macro.gapest:<bloc>`, PROVISIONAL [Quant] (T04-01b) */; energyIndex: number; foodIndex: number; worldTradeIndex: number;
  equityIndex: number | null; spotVsFdl: number; effectiveFx: number; reservesFdl: string; policyRate: number; y3m: number; y10: number;
  deficitPrimaryGdp: number; credit: number | null /* E-90 (1): closing bloc credit; null on GLOBAL rows */; creditGdp: number; housePriceIndex: number | null; fearIndex: number; fsi: number; regime: Regime }
export interface HookCall { id: Id; owner: '05' | '06' | '07' | '08' | '10' | '11' | '12' | '13' | '16' /* '13': T04-13 HOLDOUT_CLAIM */; hook: string; args: Record<string, number | string | string[] | null>;
  worldEventId: string; createdTick: Tick; startTick: Tick /* createdTick + 1 */ }
export interface NpcPoolOrder { id: Id; poolId: `CB:${BlocId}` | `TSY:${BlocId}` | 'CSF'; assetId: string; side: 'BUY' | 'SELL'; qty: Qty; limitPrice?: Price; tif: 'TICK' | 'RESTING'; tick: Tick;
  purpose: 'QE' | 'QT' | 'YCC' | 'FX_BAND' | 'FX_LEAN' | 'FX_COORD' | 'FX_PEG' | 'RESERVE_REBAL' | 'BACKSTOP' | 'MANDATE_SELL' }   // 04 §6.3
export interface FacilityLoan { id: Id; kind: 'REPO' | 'ELA' | 'LTRO' | 'SWAP_ONLEND'; bloc: BlocId; bankId: Id; amount: Money; ccy: Ccy; rate: number; openTick: Tick; maturityTick: Tick;
  collateral: { assetId: string; qty: Qty; haircut: number; valueAtOpen: Money }[]; accrued: Money; status: 'OPEN' | 'REPAID';
  holdIds?: Id[] /* T04-08: the collateral holds, released at close */ }
export interface DepositFacilityBalance { id: string /* `${bloc}:${bankId}` */; bloc: BlocId; bankId: Id; amount: Money; holdId?: Id /* T04-08 earmark */ }
export interface PrimaryDealerStatus { id: string /* `${bloc}:${entityId}` */; bloc: BlocId; entityId: Id; npc: boolean; status: 'APPLIED' | 'ACTIVE' | 'RESIGNING' | 'REVOKED';
  fromQuarter: number; revokedUntilQuarter: number | null; auctionsThisQuarter: number; auctionsBidThisQuarter: number; missesThisQuarter: number;
  awardedFaceQuarter: SortedMap<string, string> /* quarter -> face */;
  nameInLeague?: boolean /* T04-12: league-table opt-in (bank.primaryDealer.apply) */ }
export interface MacroInputs { id: 'INPUTS' | 'HOURLY'; tick: Tick; staleKeys: string[]; values: Record<string, number> }   // last values of §3.14.5 inputs, held on miss (edge 23); 'INPUTS' daily (T04-05), 'HOURLY' the held hourly fear and FSI inputs (T04-15, E-93 (2))
export interface SovExchangeVote { id: string /* `${offerId}:${holderId}:${assetId}` */; offerId: string; holderId: Id; assetId: string; face: Qty; vote: 'ACCEPT' | 'REJECT' }
export interface SyndicationOrder { id: Id; syndicationId: string; bidderId: Id; face: Qty; limitSpreadBp: number | null; holdId: Id; tick: Tick }
export interface BuybackOffer { id: Id; buybackId: string; holderId: Id; assetId: string; face: Qty; minPrice: Price; holdId: Id; tick: Tick }

// ───────── tables (module '04'; COORD-homed: no home function) ─────────
const T = <E>(table: string, idOf: (e: E) => Id, indexes?: { name: string; key(e: E): string | null }[]): TableDef<E> =>
  Object.freeze({ name: `mac.${table}`, module: '04', idOf, ...(indexes ? { indexes } : {}) });
const byId = <E extends { id: string }>(e: E): Id => e.id;

export const macroTables = Object.freeze({
  bloc: T<BlocMacroState & { id: BlocId }>('bloc', byId),
  global: T<GlobalMacroState & { id: 'GLOBAL' }>('global', byId),
  cb: T<CentralBank>('cb', byId),
  curve: T<CurveState>('curve', byId),
  history: T<DailyHistoryRow>('history', byId),       // rows kept for days ≥ today − 400 and the 1st day of every older game month (pruned by T04-20)
  publicView: T<PublicMacroView & { id: BlocId }>('public_view', byId),
  release: T<DataRelease>('release', byId, [{ name: 'bloc', key: (e) => e.bloc }]),
  schedule: T<ReleaseSchedule & { id: string }>('schedule', byId),
  program: T<FiscalProgram>('program', byId),
  issue: T<SovereignIssue & { id: string }>('issue', byId),
  auction: T<SovAuction>('auction', byId, [{ name: 'govId', key: (e) => e.govId }]),
  bid: T<AuctionBid & { id: string }>('bid', byId, [{ name: 'auctionId', key: (e) => e.auctionId }]),
  buyback: T<Buyback>('buyback', byId),
  buybackOffer: T<BuybackOffer>('buyback_offer', byId),
  syndication: T<Syndication>('syndication', byId),
  syndicationOrder: T<SyndicationOrder>('syndication_order', byId),
  dealer: T<PrimaryDealerStatus>('dealer', byId),
  defaultCase: T<SovereignDefaultCase>('default_case', byId),
  vote: T<SovExchangeVote>('vote', byId),
  voteSnapshot: T<{ id: string /* `${offerId}:${holderId}:${assetId}` */; offerId: string; holderId: Id; assetId: string; face: Qty }>('vote_snapshot', byId),
  event: T<WorldEvent>('event', byId, [{ name: 'phase', key: (e) => e.phase }]),
  hookCall: T<HookCall>('hook_call', byId, [{ name: 'owner', key: (e) => e.owner }]),
  poolOrder: T<NpcPoolOrder>('pool_order', byId, [{ name: 'tick', key: (e) => String(e.tick).padStart(12, '0') }]),
  facility: T<FacilityLoan>('facility', byId, [{ name: 'bankId', key: (e) => e.bankId }]),
  depositFacility: T<DepositFacilityBalance>('deposit_facility', byId),
  csf: T<ConcordFacility>('csf', byId),
  stab: T<StabilizerState & { id: 'STAB' }>('stab', byId),
  inputs: T<MacroInputs>('inputs', byId),
});
export const ALL_MACRO_TABLES: TableDef<any>[] = [   // eslint-disable-line @typescript-eslint/no-explicit-any
  macroTables.bloc, macroTables.global, macroTables.cb, macroTables.curve, macroTables.history, macroTables.publicView, macroTables.release,
  macroTables.schedule, macroTables.program, macroTables.issue, macroTables.auction, macroTables.bid, macroTables.buyback, macroTables.buybackOffer,
  macroTables.syndication, macroTables.syndicationOrder, macroTables.dealer, macroTables.defaultCase, macroTables.vote, macroTables.voteSnapshot,
  macroTables.event, macroTables.hookCall, macroTables.poolOrder, macroTables.facility, macroTables.depositFacility, macroTables.csf, macroTables.stab,
  macroTables.inputs,
];
