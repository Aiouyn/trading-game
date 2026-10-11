import type { RngState } from './rng';
import type { WorldEventKind, WorldEventsConfig, WorldEventsState } from './worldEvents';
import type { ListingsConfig } from './listings';
import type { CompanyRules, TradingRestrictions } from './restrictions';

export type AssetClass = 'stock' | 'crypto' | 'commodity' | 'forex' | 'bond' | 'realestate';

/** Which yield a rate-sensitive asset (bonds, property) reprices on. */
export type YieldKey = 'y2' | 'y10' | 'y30';

export type RegimeId = 'expansion' | 'overheating' | 'contraction' | 'recovery';

/** Static definition of one tradeable asset. All annual figures are per game year. */
export interface AssetDef {
  id: string;
  name: string;
  assetClass: AssetClass;
  /** sector key (stocks) or class key; assets sharing a sector share a sector factor */
  sector: string;
  initialPrice: number;
  /** used for cap-weighted indices (stocks only) */
  sharesOutstanding?: number;
  /** total annualized volatility at h = 1 in a neutral regime */
  vol: number;
  /** idiosyncratic annual log drift of fundamental value, before the regime term */
  drift: number;
  /** multiplier on the regime's equity drift (1 = moves with the market cycle, <0 = counter-cyclical) */
  cycleBeta: number;
  /** factor loadings on unit-variance shocks; normalized so that wMarket²+wSector²+wCrypto²+wIdio² = 1 */
  wMarket: number;
  wSector: number;
  wCrypto: number;
  /** half-life of the pull of price toward fundamental value, in game days */
  halfLifeDays: number;
  /** base jump intensity, jumps per game year */
  jumpsPerYear: number;
  /** mean absolute log size of up and down jumps (Kou double exponential) */
  jumpUpMean: number;
  jumpDownMean: number;
  /** probability a jump is upward in a neutral regime */
  jumpUpProb: number;
  /** price floor (hard bound, see 01 §2.2) */
  floor: number;
  /** whether the single-asset circuit breaker applies */
  circuitBreaker: boolean;
  /** full bid-ask spread in a calm market, in basis points (01 §7.2); default 10 */
  spreadBps?: number;
  /** average daily traded value in $, for square-root impact (01 §7.3); default $1B */
  advNotional?: number;
  /** quantity granularity: 1 = whole units (stocks), 0 = fractional; default 1 for stocks, 0 otherwise */
  qtyStep?: number;
  /** economic region (stocks, FX); assets sharing a region share a region factor when wRegion > 0 */
  region?: string;
  /** loading on the region factor (default 0); counted in the unit-variance budget */
  wRegion?: number;
  /** false = priced by the engine but not tradable on the order book (property district indices) */
  listed?: boolean;
  /** delisted by a bankruptcy, merger or spin-off settlement: no trading, price frozen, out of the indices and pools */
  delisted?: boolean;
  /** game day (0-based) an evolving-universe listing began; absent = listed at the start (seasoned for index reviews) */
  listedDay?: number;
  /** one-line flavor text for the UI */
  blurb?: string;
  /** a yearly cycle in value (commodities); absent = none */
  seasonal?: SeasonalDef;
  /** rate sensitivity: a +0.01 change in the keyed yield moves ln price by −0.01·duration (bonds, property) */
  duration?: number;
  /** the yield this asset reprices on and earns as carry (bonds) */
  yieldKey?: YieldKey;
  /** extra annual carry over the keyed yield (credit spread for corporate bonds) */
  carrySpread?: number;
  /** annual dividend yield paid in cash to holders at each day boundary */
  dividendYield?: number;
  /** annual stock-borrow fee for shorts; default by class */
  borrowFee?: number;
  /**
   * A company stock (quant-company-building v1.7): its lnV moves only through prints (printCompanyValue), never through
   * a diffusive value shock, jumps, catalysts or options. Absent = an ordinary asset, byte for byte as before.
   */
  valueSource?: 'company';
  /** the share of a company print that moves the price at once, and the ecology close (1 = full print, G21). Absent = 1. */
  companyPrintShare?: number;
  /**
   * A company stock's other side: the NPC book account that holds its unsold float. Every fill against NPC liquidity on this
   * asset is then a transfer with that account: a buy draws on the float the book holds (it cannot buy shares that do not
   * exist), a sell adds to it, and the book pays for what it takes and earns the commission. So the holdings always sum to
   * the shares out (X11, company-tests.md section 5). Absent = NPC liquidity, as for every other asset.
   */
  supplyAccount?: string;
}

/** One closed game day of a company stock: the close, the day's traded value and units (VWAP30 for the takeover floor). */
export interface DayBar {
  c: number;
  n: number;
  u: number;
}

export interface FeeSchedule {
  /** commission as a fraction of notional */
  rate: number;
  /** minimum commission per fill, $ */
  min: number;
}

export interface TradingConfig {
  startingCash: number;
  fees: Record<AssetClass, FeeSchedule>;
  /** square-root impact coefficient Y (01 §7.3) */
  impactY: number;
  /** share of temporary impact that permanently moves the price (it then decays via the pull to value) */
  permanentImpactShare: number;
  /** max fill per order per tick, as a multiple of daily volume; the rest stays open */
  maxAdvPerTick: number;
  /** closed orders kept in state for history (oldest pruned first); per player when archiving */
  closedOrdersKept: number;
  /** move closed orders out of the live book into per-player history (large worlds) */
  archiveClosed?: boolean;
}

export interface RegimeDef {
  id: RegimeId;
  /** equity drift added to every asset's fundamental drift × cycleBeta, per game year */
  equityDrift: number;
  /** multiplier on every asset's vol */
  volMult: number;
  /** multiplier on jump intensity */
  jumpMult: number;
  /** additive shift to jumpUpProb (negative = more crashes) */
  jumpUpShift: number;
  /** crisis correlation: market loading multiplier (01 §2.1) */
  marketLoadMult: number;
  /** crisis correlation: idiosyncratic loading multiplier */
  idioMult: number;
  /** expected length in game days */
  meanDays: number;
  /** where we go when we leave this regime (probabilities sum to 1) */
  next: Partial<Record<RegimeId, number>>;
}

/** A yearly cycle in value: log amplitude `amp`, highest on game-year day `peakDay` (0..daysPerYear-1). */
export interface SeasonalDef {
  amp: number;
  peakDay: number;
}

/**
 * Membership rule for the quarterly review (indices.ts): a listed asset of this class, in these sectors and/or regions,
 * that has been listed at least `everyDays` joins. Absent = the index takes no additions (delisted names still leave).
 */
export interface IndexRule {
  assetClass: AssetClass;
  sectors?: string[];
  regions?: string[];
}

export interface IndexDef {
  id: string;
  name: string;
  /** asset ids; cap-weighted by sharesOutstanding */
  members: string[];
  base: number;
  /** who may join at a quarterly review; absent = no additions */
  rule?: IndexRule;
}

/** Quarterly index review (indices.ts): when it runs, and how far ahead the change is announced. Off when absent. */
export interface IndexReviewConfig {
  /** game days between reviews (63 = quarterly); a review takes effect at the open of day k * everyDays */
  everyDays: number;
  /** game days of notice on the Wire before a review takes effect */
  announceDays: number;
}

/** Live state of one index once a review has run (absent = the config's members with the config's divisor). */
export interface IndexState {
  /** current members, in config order */
  members: string[];
  /** level = base · Σ(shares · price) / divisor. Reset at each reconstitution so the level does not jump. */
  divisor: number;
}

/** Squeeze (trading.ts): forced buy-ins of shorts in one asset, in one day, as a share of ADV. Off when absent. */
export interface SqueezeConfig {
  /** forced short covering in a day, as a share of the asset's ADV, that counts as a squeeze */
  adv: number;
}

export interface WorldConfig {
  /** 1 tick = 5 real seconds; 1 market day = 1 real hour = 720 ticks */
  ticksPerDay: number;
  /** trading days per game year */
  daysPerYear: number;
  /** GARCH(1,1) on daily standardized returns */
  garchAlpha: number;
  garchBeta: number;
  garchMin: number;
  garchMax: number;
  /** Student-t degrees of freedom for idiosyncratic noise */
  studentNu: number;
  /** share of each diffusive shock and each jump that is news about value (moves V); the rest is noise that reverts */
  permanentShare: number;
  /** share of a jump (news) that moves fundamental value; default: permanentShare */
  jumpPermanent?: number;
  /** share of a jump that prints in the price at once; the gap to value drifts in via the pull. Default 1 */
  jumpImmediate?: number;
  /** add the Merton compensator so jumps don't change an asset's expected (arithmetic) return. Default false */
  jumpCompensation?: boolean;
  /** single-asset circuit breaker: halt after this move from the day open */
  haltThreshold: number;
  /** halt length in ticks (10 real minutes = 120 ticks) */
  haltTicks: number;
  initialRegime: RegimeId;
  /** order execution and accounts; defaults to DEFAULT_TRADING */
  trading?: TradingConfig;
  /** volume model; defaults to DEFAULT_VOLUME */
  volume?: VolumeConfig;
  /** earnings, previews, rumors and post-earnings drift; off when absent */
  catalysts?: CatalystConfig;
  /** company trading rules (plan lead, price hold, window warning, buyback cap, tender floor); the defaults are content's COMPANY.trading */
  companyRules?: Partial<CompanyRules>;
  /** interest rates, inflation, growth and the central bank; off when absent */
  rates?: RatesConfig;
  /** listed options; off when absent */
  options?: OptionsConfig;
  /** quarterly index review (indices.ts); off when absent */
  indexReview?: Partial<IndexReviewConfig>;
  /** short squeezes (trading.ts): forced covering past a share of ADV; off when absent */
  squeeze?: Partial<SqueezeConfig>;
  /** margin, shorting and liquidation; defaults to DEFAULT_MARGIN */
  margin?: MarginConfig;
  /**
   * Alt-peak guard (Quant's rule C5): when today's net crowd flow on an asset passes thr × ADV, or the last 5 game
   * days' net flow passes K × ADV, peak / rank marks stop at the close before the flow began, through the next day.
   * Off when absent.
   */
  markGuard?: { thr: number; K: number };
  /**
   * Market ecology (specs/quant-market-ecology.md, ported from engine-staging). Absent or mode 'off' = the live engine.
   * 'full' (the game universe): six trader pools set every game day's close. 'shadow' computes them beside the live
   * path without moving prices; 'hybrid' blends (weight 0.25 or 1).
   */
  ecology?: Partial<EcologyConfig>;
  /** NPC rival funds; they trade inside the ecology pools and need the ecology on. Absent or [] = none */
  rivals?: RivalDef[];
  /** shared world events (crash, bubble, crisis week, flash; specs/quant-world-events.md); off when absent */
  worldEvents?: Partial<WorldEventsConfig>;
  /** evolving universe: NPC IPOs, bankruptcies, mergers and spin-offs (listings.ts); off when absent */
  listings?: Partial<ListingsConfig>;
  regimes: Record<RegimeId, RegimeDef>;
  assets: AssetDef[];
  indices: IndexDef[];
}

export interface AssetState {
  id: string;
  /** ln market price */
  lnP: number;
  /** ln fundamental value */
  lnV: number;
  /** GARCH variance multiplier (long-run mean 1) */
  h: number;
  /** ln price at the start of the current game day */
  lnOpen: number;
  /** tick at which an active halt ends (exclusive); -1 when not halted */
  haltUntil: number;
  haltedToday: boolean;
  /** sum of today's jump log sizes; excluded from the GARCH input so jumps don't feed vol clustering */
  dayJump: number;
  /**
   * the part of dayJump that is the rates layer's yield and surprise moves (rates.ts), summed the same way. The closing
   * auction prints it at the rates share (EcologyConfig.ratePrint), not the news share. Absent (undefined) = 0.
   */
  dayRate?: number;
  /**
   * sum of today's per-tick diffusive shocks (sigma · sqrt(dt) · shock, no jumps, no pull, no drift). GARCH standardizes
   * this, not the close-to-close return, so E[z^2 | h] = h for every asset. Absent (undefined) = 0 at the first tick.
   */
  dayDiff?: number;
  /**
   * today's lnV change split by source (the parts sum to the day's change in lnV). Accumulated per tick only while the
   * ecology is on, reset at the day boundary, read at the close (ecologyDay) and archived per asset. Absent = zeros.
   */
  dayLnV?: LnVParts;
  /**
   * Test shocks (shockPrice, test-only, never in the app): the price move it made since the last close, in log units. The
   * close reads it into the Test shock row (tape-research-desk.md section 3) and clears it. Absent = 0.
   */
  dayShock?: number;
  /** a test shockValue's lnV move not yet booked in today's split (booked at the next tick, after the day's reset). Absent = 0. */
  pendingValueShock?: number;
  /** a company print (ln value) waiting for the next tick (printCompanyValue, companyAssets.ts). Absent = 0. */
  pendingPrint?: number;
  /** company stocks only: the last 30 closed days, oldest first (VWAP30 for the takeover floor). Absent on others. */
  bars?: DayBar[];
  /** the part of dayJump that is world-event price moves, summed per tick. Ecology-on only. */
  dayEvent?: number;
  /** log return accumulated while halted; applied in the reopening auction */
  pending: number;
  rng: RngState;
  /** volume noise stream ('volume:<id>'); separate so volume never changes prices */
  vrng: RngState;
  /** traded units this tick (NPC flow plus player fills) */
  volume: number;
  /** traded value this tick, $ */
  notional: number;
  /** units traded since the start of the game day (this tick included) */
  dayVolume: number;
  /** $ traded since the start of the game day */
  dayNotional: number;
  /** units traded since the world began (monotonic; bucket volume = difference) */
  cumVolume: number;
  /** attention after news, jumps and halts: extra volume multiplier that decays */
  heat: number;
  /**
   * Notional ALL accounts traded TODAY on this asset, per side (shared permanent-impact tally, Ledger 2026-10-09):
   * the day's permanent move is charged on the running total, so N accounts or 720 clips move the price like one
   * order of the same total. Absent, or stamped with an earlier day = nothing traded yet today.
   */
  dayTraded?: DayTraded;
  /**
   * Notional (at the tick's pre-trade mid) ALL accounts already filled THIS tick on this asset, per side, plus that
   * mid. Temporary impact and the maxAdvPerTick cap are charged on it, so splitting inside one tick costs what one
   * order would. Absent, or stamped with another tick = nothing filled yet this tick.
   */
  tickTraded?: TickTraded;
  /**
   * Alt-peak mark guard (config.markGuard): after a day (or a rolling 5 days) of one-sided crowd flow, peak / rank /
   * licence marks value longs at min(mid, anchor) (dir 1, buy pump) or shorts at max(mid, anchor) (dir −1, dump),
   * anchor = the close before the flow began. Live through untilDay. Absent when no guard is on.
   */
  markGuard?: { lnAnchor: number; anchorDay: number; untilDay: number; dir: 1 | -1 };
  /** the last 5 game days' net crowd flow / ADV and each day's open (index 4 = `day`); absent once all 5 are flat */
  markFlow?: { day: number; net: number[]; lnOpen: number[] };
  /**
   * Forced buy-ins of shorts today (squeeze on only): notional covered, and whether the squeeze fired (the event is
   * sent once a day). Stamped with the game day; absent or another day = nothing covered yet today.
   */
  coverTally?: { day: number; notional: number; fired: boolean };
  // ---- catalysts (stocks only, when config.catalysts is set; all optional so old saves load) ----
  /** earnings stream ('earnings:<id>'); separate so catalysts never shift the price stream */
  erng?: RngState;
  /** game day index (0-based) of the next earnings report, released before that day's open */
  nextEarnings?: number;
  /** published analyst lean for the next report in [-1, 1]; null until the preview */
  consensus?: number | null;
  /** hidden standardized surprise of the next report, drawn at the preview */
  surprise?: number | null;
  /** direction of the rumor about the next report, if one went out */
  rumor?: 1 | -1 | null;
  /** post-earnings drift: log move added each tick until peadUntil */
  peadPerTick?: number;
  peadUntil?: number;
  /** the last report, for the UI */
  lastEarnings?: { day: number; surprise: number; move: number } | null;
}

/** Scheduled earnings, analyst previews, rumors and post-earnings drift (ENGINE.md, Catalysts). */
export interface CatalystConfig {
  /** game days between reports (63 = quarterly) */
  everyDays: number;
  /** ± random days on each next report date */
  jitterDays: number;
  /** analysts publish their consensus this many days before the report */
  previewDays: number;
  /** a rumor may go out this many days before the report */
  rumorDays: number;
  rumorProb: number;
  /** chance the rumor points the right way */
  rumorAccuracy: number;
  /** spread of the published consensus before clamping to [-1, 1] */
  consensusSd: number;
  /** correlation between consensus and the real surprise */
  rho: number;
  /** log move per unit surprise for a 30%-vol stock (scales with the stock's vol) */
  moveScale: number;
  /** extra drift after the report, as a share of the report move */
  peadShare: number;
  peadDays: number;
}

/** Macro layer: inflation and growth follow the business cycle; a Taylor-rule central bank sets the policy rate. */
export interface RatesConfig {
  /** neutral real rate */
  neutralReal: number;
  inflationTarget: number;
  /** per-regime targets for inflation and real growth (annual fractions) and the 10y term premium */
  targets: Record<RegimeId, { inflation: number; growth: number; termPremium: number }>;
  /** daily mean-reversion speed of inflation and growth toward the regime target */
  reversion: number;
  /** daily noise on inflation and growth */
  noise: number;
  /** game days between central bank meetings */
  meetingEvery: number;
  /** max move per meeting (0.005 = 50 bp) and the step size (0.0025 = 25 bp) */
  maxMove: number;
  stepSize: number;
  /** game days between macro data releases (CPI and jobs alternate) */
  releaseEvery: number;
  initial: { policy: number; inflation: number; growth: number };
}

export interface RatesState {
  policy: number;
  inflation: number;
  growth: number;
  y2: number;
  y10: number;
  y30: number;
  /** what the market expects at the next meeting (policy rate change, fraction) */
  expectedMove: number;
  /** 0-based game day of the next central bank meeting and the next data release */
  nextMeeting: number;
  nextRelease: number;
  releaseKind: 'cpi' | 'jobs';
  rng: RngState;
}

export interface OptionsConfig {
  /** assets with listed options */
  underlyings: string[];
  /** game days between expiries (5 = weekly) and how many expiries are listed */
  expiryEvery: number;
  expiries: number;
  /** strikes as fractions of spot around the money */
  strikeSteps: number[];
  /** units per contract */
  multiplier: number;
  /** half-spread as a fraction of premium, and the minimum half-spread in $ per unit */
  halfSpread: number;
  minHalfSpread: number;
  /** commission per contract */
  feePerContract: number;
}

export interface MarginConfig {
  /** maintenance requirement as a fraction of gross exposure; below it a margin call goes out */
  maintenance: number;
  /** below this equity/gross ratio the engine liquidates */
  liquidation: number;
  /** spread over the policy rate charged on negative cash (annual) */
  loanSpread: number;
  /** interest paid on positive cash as a share of the policy rate */
  cashInterestShare: number;
  /** default annual borrow fee for shorts by class */
  borrowFee: Record<AssetClass, number>;
  /** policy rate to use when the rates layer is off */
  fallbackRate: number;
}

export interface VolumeConfig {
  /** σ of the lognormal per-tick noise */
  noise: number;
  /** tick activity = moveBase + moveSlope · min(|r| / σ_tick, zCap) */
  moveBase: number;
  moveSlope: number;
  zCap: number;
  /** half-life of heat, in game days */
  heatHalfLifeDays: number;
  /** heat added per unit of |jump| (log size): a 6% jump adds 0.06 · jumpHeat */
  jumpHeat: number;
  haltHeat: number;
  reopenHeat: number;
  /** intraday U shape amplitude for session assets (stocks, commodities); crypto trades flat */
  uShape: number;
}

export interface RegimeChange {
  tick: number;
  from: RegimeId;
  to: RegimeId;
}

export type Side = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop' | 'stop_limit' | 'trailing';
export type OrderStatus = 'open' | 'filled' | 'cancelled' | 'rejected' | 'expired';

export interface OrderRequest {
  playerId: string;
  assetId: string;
  side: Side;
  type: OrderType;
  qty: number;
  limitPrice?: number;
  stopPrice?: number;
  /** 'gtc' (default) stays open until filled or cancelled; 'day' expires at the next game-day boundary */
  tif?: 'day' | 'gtc';
  /** trailing stop: distance from the best price since placement, as a fraction (0.05 = 5%) */
  trailPct?: number;
  /** bracket: on a full fill of this order, place a take-profit limit and a stop-loss (one cancels the other) */
  takeProfit?: number;
  stopLoss?: number;
  /** only ever reduces an existing position (bracket children, close buttons) */
  reduceOnly?: boolean;
  /** a company program's order (restrictions.ts): a plan's sell out of its escrow, or a buyback's buy */
  program?: string;
}

export interface Order extends OrderRequest {
  id: string;
  status: OrderStatus;
  placedTick: number;
  /** stop orders: true once the stop price was crossed (the order then executes like a market order) */
  triggered: boolean;
  filledQty: number;
  avgFillPrice: number;
  feesPaid: number;
  rejectReason?: string;
  closedTick?: number;
  /** trailing stops: best mid since placement (highest for sells, lowest for buys) */
  trailRef?: number;
  /** bracket children share their parent's id here; a fill on one cancels the other */
  ocoGroup?: string;
  /** set by the engine when it closes a position for the player (margin liquidation) */
  forced?: boolean;
  /** a refused restriction (closedWindow, lockup): the game day it lifts, when the schedule has one */
  rejectUntil?: number;
  /** a plan order: its last limit check failed on price (after the spread), so an unsold remainder is a price hold */
  priceMissed?: boolean;
  /** a plan order: the founder's daily sell cap clipped it (its unsold remainder is a cap skip) */
  capMissed?: boolean;
}

export interface Fill {
  orderId: string;
  playerId: string;
  assetId: string;
  side: Side;
  qty: number;
  price: number;
  fee: number;
  tick: number;
  /** the asset's pre-trade mid this tick (the price the fill is measured against for the explain's slippage) */
  mid: number;
}

export interface Position {
  /** signed: negative is a short */
  qty: number;
  /** average entry per unit: longs include buy commissions, shorts are net of sell commissions */
  avgCost: number;
  realizedPnl: number;
}

export interface OptionPosition {
  /** contracts held (long only) */
  qty: number;
  /** average premium paid per unit, fees included */
  avgCost: number;
}

export interface Account {
  playerId: string;
  cash: number;
  startingCash: number;
  positions: Record<string, Position>;
  realizedPnl: number;
  feesPaid: number;
  peakEquity: number;
  maxDrawdown: number;
  dayStartEquity: number;
  /** gross exposure allowed as a multiple of equity (1 = cash account, the default) */
  maxLeverage?: number;
  /** may sell what it does not hold */
  canShort?: boolean;
  /** may trade options */
  canOptions?: boolean;
  /** listed options held, by contract id */
  options?: Record<string, OptionPosition>;
  /** running totals */
  interestPaid?: number;
  interestEarned?: number;
  dividends?: number;
  borrowPaid?: number;
  /** tick a margin call went out (cleared when the account recovers) */
  marginCallTick?: number;
  /** an NPC persona's account: its flow clears as Retail and never counts toward Players or You (P1). Absent = a human. */
  npc?: boolean;
}

export interface WorldState {
  version: 1;
  seed: string;
  tick: number;
  regime: RegimeId;
  regimeLog: RegimeChange[];
  macroRng: RngState;
  sectorRng: Record<string, RngState>;
  assets: AssetState[];
  accounts: Record<string, Account>;
  /** open orders plus the most recent closed ones, in placement order */
  orders: Order[];
  orderSeq: number;
  config: WorldConfig;
  /** closed orders by player, oldest first (when config.trading.archiveClosed) */
  closedOrders?: Record<string, Order[]>;
  /** region factor streams ('region:<r>'), present when any asset loads on a region */
  regionRng?: Record<string, RngState>;
  /** interest rates and macro, present when config.rates is set */
  rates?: RatesState;
  /** every account's long and short units per asset, recomputed at each tick's mark (crowd-exit liquidation marks) */
  crowd?: Record<string, CrowdHold>;
  /** market ecology state (pools, maker, cause log); present once a step ran with the ecology on. Server-only. */
  ecology?: EcologyState;
  /** shared world events; present once a world with events on has stepped a day. Server-only (the app gets worldEventView). */
  worldEvents?: WorldEventsState;
  /** company trading windows, lockups and programs (restrictions.ts); absent until a company world sets one */
  restrictions?: TradingRestrictions;
  /** listings stream and sequence (evolving universe); present once a listing day has rolled */
  listings?: { rng: RngState; seq: number };
  /** index membership and divisors, present once a review has run or been announced (indices.ts) */
  indices?: Record<string, IndexState>;
  /**
   * The pension pool's reshuffle flow on the effective day of a review: per asset, equal-weight units of index change
   * (weight change × members). Read by the ecology close on that day only (ecoDayInput).
   */
  reshuffle?: { day: number; eq: Record<string, number> };
}

export interface CrowdHold {
  long: number;
  /** units short, as a positive number */
  short: number;
}

// ---------------------------------------------------------------- market ecology (shadow)

export type EcologyMode = 'off' | 'shadow' | 'hybrid' | 'full';
export type EcoPool = 'value' | 'trend' | 'retail' | 'pension';
/** terms of the daily cause vector, in log return; they sum to the shadow close-to-close move */
export type EcoCause = 'value' | 'trend' | 'retail' | 'pension' | 'maker' | 'news' | 'event' | 'own' | 'shock';

/**
 * One asset's day change in ln value, by source; the parts sum to the day's change in lnV exactly, on any day that has
 * a split (a day that began before a save with no split has none). drift is the asset's own deterministic part (alpha,
 * carry, seasonal, the jump compensator and the variance drag). market is the factor shock (market and crypto) plus the
 * regime's equity drift, scaled by the asset's cycle beta. sector is the sector and region shock. idio is the company's
 * own shock. news is the jumps, catalysts and rate shocks. event is the world-event value move. The diffusive parts
 * carry lnVScale and the permanent share, as the value does.
 */
export interface LnVParts {
  drift: number;
  market: number;
  sector: number;
  idio: number;
  news: number;
  event: number;
  /** a test shockValue's move in the value line (test-only); absent on saves from before it = 0 */
  shock?: number;
}

export interface EcologyConfig {
  /**
   * 'shadow' computes the pools beside the live path (prices unchanged). 'hybrid' (migration step 2) sets each
   * close to (1 − weight) · live + weight · ecology; it needs `weight` in HYBRID_WEIGHTS (0.25 or 1). 'full'
   * (migration step 3, the 100% save field) lets the ecology set every close: weight absent or exactly 1; it is the
   * same path as hybrid weight 1 and as enterSimMode(). Any other mode or weight is off: today's engine, byte for byte.
   */
  mode: EcologyMode;
  /** hybrid: 0.25 (step 2) or 1 (step 3). full: absent or 1. Anything else = off. */
  weight?: number;
  /** game days of per-asset detail kept in state.ecology.log */
  logDays: number;
  /** game days of compact archive records (cause, lnV parts, close, players) kept for explainMove and explainTrade */
  archiveDays: number;
  /** capacity cut on a pool adding to its own side: 1 / (1 + capacity · |position / size|) */
  capacity: number;
  /** share of the clearing impact that stays in the price; the rest is the maker's skew and unwinds */
  permanentShare: number;
  /** share of the maker's skew and inventory worked off each day */
  makerUnwind: number;
  /** maker inventory, in ADV-days, that counts as "full" for depth */
  makerSize: number;
  /** depth = clamp(1 / (1 + depthInv · |inv / makerSize| + depthH · max(0, h − 1)), depthMin, 1) */
  depthInv: number;
  depthH: number;
  depthMin: number;
  /** value pool: closes this share of the lnV − lnP gap per day if nobody else trades, order capped at maxAdv */
  valueClose: number;
  valueMaxAdv: number;
  /** share of a jump (news) that prints in the shadow at once; the rest is a gap the pools trade. Absent = the live jumpImmediate */
  newsPrint?: number;
  /**
   * share of the day's rates-layer move (yield repricing and policy or data surprises, AssetState.dayRate) that prints in
   * the close. Absent = newsPrint's default (0.5). Kept apart from newsPrint so the rate-driven bond vol that Tape
   * calibrated stays where it was. The rate term of expectedVol is taken at the close's print pass-through (ratePrintOf), so the
   * print share that bond vol is measured at is the one expectedVol uses; the option horizon uses the full move (print 1).
   */
  ratePrint?: number;
  /**
   * share of the day's non-jump value move (factor and idiosyncratic diffusion, drift) that quotes reprice at once,
   * before any pool trades; the rest is a gap the value pool trades like any other. Absent = 0 (shipping: off; it
   * lifts vol to live level but fails IC1 and IC63, see docs/ENGINE.md "Vol level").
   */
  valuePrint?: number;
  /**
   * full / hybrid / enterSimMode only (ignored in shadow, off and legacy, which stay byte-identical): the ecology's own
   * value line moves by drift + jumpPermanent·jump + valueVolScale·(the rest of the day's lnV change), i.e. only the
   * non-jump diffusive innovation (factor and idiosyncratic shocks) is scaled; the deterministic drift and the jumps
   * are not. The value pool trades toward that line. Live lnV and live prices are untouched. Absent = 1.
   */
  valueVolScale?: number;
  /**
   * SWEEP knob, full ecology only (enterSimMode or weight 1): multiplies the non-jump diffusive shock (perm · diff) of the
   * world's own lnV (the public value players see) by this. Drift and jumps unscaled; the live intraday price shock
   * is not scaled (it only feels lnV through the pull). 25%, shadow, off and legacy ignore it. Absent = FULL_MODE_DEFAULTS
   * (1.15) in full mode; set 1 to turn it off.
   */
  lnVVolScale?: number;
  /** value pool size cap in σ_daily: it never tries to move the price more than this in one day (0 = no cap) */
  valueGapCap: number;
  /** trend pool: kTrend · tanh(63-day vol-scaled return) − kFade · tanh(5-day vol-scaled return), in ADV */
  trendK: number;
  fadeK: number;
  /** retail: N(0,1) · retailNoise + retailHeadline · (decayed sign of past headlines), in ADV */
  retailNoise: number;
  retailHeadline: number;
  /**
   * R1 blur (Tape, measured): on a folded day with a human trade, the public Retail figure (depth and the explain row) carries
   * a server-only draw of this sd, in ADV. The price does not change: the day's impact is split over the blurred flows, which
   * always sum to the same impact. 0 turns it off.
   */
  foldBlur?: number;
  headlineHalfLifeDays: number;
  /** pension: in the last pensionDays of every quarter, trades pensionK · (drift from policy weight) per day, in ADV per unit log drift */
  pensionK: number;
  /** cap on the pension pool's drift-driven order, ADV a day (either side): a passive pool's rebalance is bounded (Phase 1 whale check) */
  pensionMaxAdv: number;
  pensionDays: number;
  quarterDays: number;
  /** pool sizes in ADV-days (capacity scale) and position half-lives in game days (positions age out to long holders) */
  sizes: Record<EcoPool, number>;
  halfLives: Record<EcoPool, number>;
  /**
   * index reviews: on the effective day the pension pool trades reshuffleK ADV per equal-weight unit of index change
   * (an added name buys, the rest of the index sells a little). Before the capacity cut, like every pool.
   */
  reshuffleK: number;
}

export interface EcoAssetState {
  id: string;
  /** shadow log close (core + maker skew) */
  lnS: number;
  /** value (lnV) the pools saw at the last close; absent on ecology states saved before valuePrint (then no print that day) */
  lnV?: number;
  /** the ecology's own value line (valueVolScale ≠ 1 in full / hybrid only); absent = the live lnV */
  lnVe?: number;
  /** price before the maker's skew */
  core: number;
  /** the maker's temporary skew, in log price */
  skew: number;
  /** maker inventory, ADV-days (positive = long) */
  inv: number;
  /** pool positions, ADV-days */
  pos: Record<EcoPool, number>;
  /** last 64 shadow closes, oldest first */
  closes: number[];
  /** decayed sign of past headlines (retail reads it the next day) */
  headline: number;
  /** pension anchor: lnS at the last quarter-end rebalance */
  pensionAnchor: number;
  /** the player's signed flow today, ADV: human and NPC accounts together (the clamp acts on this total) */
  own: number;
  /** the NPC accounts' part of own, ADV (signed). It clears in the Retail row, never as Players or You. */
  npcOwn?: number;
  /**
   * Gross flow today per trading account (ADV), for the Players fold. Server-side only: the log keeps the count and
   * the largest share, never the ids. Reset at each close. Absent on older saves (then no players are counted).
   */
  ownBy?: Record<string, number>;
  /** retail stream eco:retail:<id> */
  rng: RngState;
}

export interface EcoLogAsset {
  id: string;
  lnS: number;
  lnV: number;
  /** desired orders after the capacity cut, ADV (own = the human accounts' fills, npc = the NPC accounts' fills) */
  desired: Record<EcoPool | 'own' | 'npc', number>;
  /** the day's lnV change by source (absent on logs written before the factor split, or on a day that was only partly seen) */
  lnVParts?: LnVParts;
  /** the day's player bucket: distinct accounts that traded the asset and the largest one's share of its gross flow */
  players?: { accounts: number; maxShare: number };
  /** the R1 blur draw on this day (ADV), set only on a day with a human trade (ecology.foldBlur) */
  blur?: number;
  net: number;
  /** gross shadow volume, ADV (sum of |orders|) */
  gross: number;
  depth: number;
  inv: number;
  cause: Record<EcoCause, number>;
  /**
   * Hybrid (weight < 1) only. The day's close move is (1 − weight) · live + weight · (sum of cause), where `live`
   * is the live engine's move from the same previous close; the ecology is then re-anchored on that close.
   */
  blend?: { weight: number; live: number };
}

export interface EcoLogDay {
  day: number;
  tick: number;
  regime: RegimeId;
  assets: EcoLogAsset[];
}

/**
 * One asset's compact closed-day record for the explain archive (D-16): the close, the cause vector, the lnV change by
 * source and the Players bucket. Far smaller than the detailed log, and kept for EcologyConfig.archiveDays days.
 */
export interface EcoArchiveAsset {
  id: string;
  lnS: number;
  lnV: number;
  cause: Record<EcoCause, number>;
  /** the same day's cause split over the R1-blurred Retail flow: the attribution a folded day shows (absent without a human trade) */
  foldCause?: Record<EcoCause, number>;
  lnVParts?: LnVParts;
  players?: { accounts: number; maxShare: number };
}

export interface EcoArchiveDay {
  day: number;
  assets: EcoArchiveAsset[];
}

export interface EcologyState {
  /** game day of the last shadow close */
  day: number;
  assets: EcoAssetState[];
  log: EcoLogDay[];
  /** the explain archive, oldest first. Absent on saves from before it: the detailed log stands in (ecoArchive). */
  archive?: EcoArchiveDay[];
  /** NPC rival funds (their trades are slices of the pools, rivals.ts); absent when none are configured */
  rivals?: RivalState[];
}

export type RivalStyle = 'value' | 'momentum' | 'degen';

/** An NPC rival fund: a name, a style and starting cash. Config only; no account, no order path, no chat. */
export interface RivalDef {
  id: string;
  name: string;
  style: RivalStyle;
  startingCash: number;
}

/** A rival's book. Server-side: the public surface is the name and equity only (rivalLeaderboard). */
export interface RivalState {
  id: string;
  cash: number;
  /** units per asset id; stocks whole shares, crypto fractional */
  units: Record<string, number>;
  /** the names chosen at the last rebalance */
  target: string[];
  /** highest equity seen at a close */
  peak: number;
}

export interface Quote {
  assetId: string;
  price: number;
  fundamental: number;
  halted: boolean;
  /** units traded this tick */
  volume: number;
  /** $ traded this tick */
  notional: number;
  /** units traded so far today */
  dayVolume: number;
  /** $ traded so far today */
  dayNotional: number;
  /** units traded since the world began; a bar's volume is the difference across its ticks */
  cumVolume: number;
  /** average daily volume in units at the current price (advNotional / price), the same ADV impact uses */
  adv: number;
}

export interface TickTraded {
  /** tick these totals belong to */
  tick: number;
  /** ln mid before the tick's first fill on this asset; every fill this tick prices off it */
  lnMid: number;
  /** notional at that mid, per side */
  buy: number;
  sell: number;
}

export interface DayTraded {
  /** game day (0-based) these totals belong to */
  day: number;
  buy: number;
  sell: number;
}

export type StepEvent =
  | { type: 'regime'; tick: number; from: RegimeId; to: RegimeId }
  | { type: 'jump'; tick: number; assetId: string; logSize: number }
  /** the closing auction (ecology on): the pools' clearing price replaced the live last price; move per asset, fraction */
  | { type: 'auction'; tick: number; moves: Record<string, number> }
  /** a quarterly index review: announced (notice given) or effective (membership changed); adds and removes are asset ids */
  | { type: 'index'; tick: number; phase: 'announced' | 'effective'; indexId: string; day: number; adds: string[]; removes: string[] }
  /** a short squeeze: forced buy-ins of shorts in one asset passed the squeeze share of ADV (cover, fraction of ADV); no account */
  | { type: 'squeeze'; tick: number; assetId: string; cover: number }
  | { type: 'halt'; tick: number; assetId: string; move: number }
  | { type: 'reopen'; tick: number; assetId: string; gap: number }
  /** analysts publish their lean for an upcoming report */
  | { type: 'preview'; tick: number; assetId: string; consensus: number; daysAway: number }
  /** an unconfirmed tip about an upcoming report; right with probability rumorAccuracy */
  | { type: 'rumor'; tick: number; assetId: string; direction: 1 | -1 }
  /** the report itself, released before the open; move is the price gap it causes (fraction) */
  | { type: 'earnings'; tick: number; assetId: string; surprise: number; consensus: number; move: number }
  /** central bank decision; change is the policy rate move (0.0025 = +25 bp), expected what the market priced */
  | { type: 'rates'; tick: number; policy: number; change: number; expected: number }
  /** macro data release: actual vs consensus (annual fractions) */
  | { type: 'macro'; tick: number; kind: 'cpi' | 'jobs'; actual: number; consensus: number }
  /** a shared world event: announced (precursors), started, or ended (lastedDays and gxMove only on end) */
  | { type: 'world'; tick: number; phase: 'announced' | 'start' | 'end'; kind: WorldEventKind; id: string; headline: string; precursors?: string[]; lastedDays?: number; gxMove?: number }
  /** the evolving universe: a listing (ipo, spin-off child), a delisting (bankruptcy, merger), or a spin-off parent */
  | { type: 'listing'; tick: number; kind: 'ipo' | 'bankruptcy' | 'merger' | 'spinoff'; assetId: string; otherId?: string; price: number }
  /** a delisting settled the NPC rival books' units in cash (rival books are Street-side money, ruling O-22); the world books amount to the Street tally */
  | { type: 'street'; tick: number; assetId: string; amount: number; reason: 'rivalSettlement' }
  | { type: 'margin_call'; tick: number; playerId: string; equity: number; required: number }
  | { type: 'liquidation'; tick: number; playerId: string; assetId: string; qty: number; price: number }
  | { type: 'option_expiry'; tick: number; playerId: string; contractId: string; qty: number; payout: number; reason?: 'delisting' }
  /** a dividend credited at the day boundary (rates on): the cash paid to one holder in one asset; negative for a short */
  | { type: 'dividend'; tick: number; playerId: string; assetId: string; amount: number }
  /** a covered or locked order refused, or cancelled at the fill: a closed window (untilDay = the next open day) or a lockup */
  | { type: 'restricted'; tick: number; playerId: string; assetId: string; code: 'closedWindow' | 'lockup' | 'ceoExitFreeze'; untilDay?: number }
  /** a plan day that did not sell all of its quantity: price (the floor), volume (the ADV cap) or halt; qty is the shortfall */
  | { type: 'planSkipped'; tick: number; programId: string; playerId: string; assetId: string; reason: 'volume' | 'price' | 'cap' | 'halt'; qty: number }
  /** a plan ended: completed (its last day ran), terminated (delisting or default) or tender */
  | { type: 'planEnded'; tick: number; programId: string; playerId: string; assetId: string; reason: 'completed' | 'terminated' | 'tender' };

export interface StepResult {
  state: WorldState;
  events: StepEvent[];
  fills: Fill[];
}

export interface FillEstimate {
  /** expected execution price per unit (mid ± half spread ± impact) */
  price: number;
  fee: number;
  /** distance from mid, in basis points (always ≥ 0) */
  slippageBps: number;
  /** buy: cash out (qty·price + fee); sell: cash in (qty·price − fee) */
  total: number;
}

export interface PositionView {
  assetId: string;
  qty: number;
  avgCost: number;
  price: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPct: number;
  realizedPnl: number;
  /** share of equity */
  weight: number;
}

export interface PortfolioView {
  playerId: string;
  cash: number;
  equity: number;
  startingCash: number;
  positions: PositionView[];
  realizedPnl: number;
  unrealizedPnl: number;
  /** equity − startingCash (fees included) */
  totalPnl: number;
  /** equity − equity at the start of the current game day */
  dayPnl: number;
  feesPaid: number;
  peakEquity: number;
  /** cash + positions at their share of a crowd exit (spread, impact on everyone's units, fee); peaks use this */
  liquidationEquity: number;
  /** current drop from peak, as a fraction ≤ 0 */
  drawdown: number;
  /** worst drawdown so far, as a fraction ≤ 0 */
  maxDrawdown: number;
}
