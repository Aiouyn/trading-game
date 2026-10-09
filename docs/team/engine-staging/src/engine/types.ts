import type { RngState } from './rng';

export type AssetClass = 'stock' | 'crypto' | 'commodity';

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
  /** closed orders kept in state for history (oldest pruned first) */
  closedOrdersKept: number;
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

export interface IndexDef {
  id: string;
  name: string;
  /** asset ids; cap-weighted by sharesOutstanding */
  members: string[];
  base: number;
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
  /** news calendar; missing fields fall back to DEFAULT_NEWS */
  news?: Partial<NewsConfig>;
  /**
   * Market ecology (specs/quant-market-ecology.md). Absent or mode 'off' = today's engine, byte for byte.
   * 'shadow' computes the six pools beside the live path and logs them; it never moves live prices or volume.
   * There is no hybrid weight: no value of this field can change a live price.
   */
  ecology?: Partial<EcologyConfig>;
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
  /** log return accumulated while halted; applied in the reopening auction */
  pending: number;
  rng: RngState;
  /** volume noise stream ('volume:<id>'); separate so volume never changes prices */
  vrng: RngState;
  /**
   * Notional ALL accounts traded today on this asset, per side, for permanent impact (one shared tally: players,
   * any ghost/rival/fund account, and in enterSimMode the ecology pools at the close). Each fill pays
   * sign · log1p(f(D + q) − f(D)) with D this side's running total, so splitting an order into clips OR across
   * accounts moves the price like one order of the same total. Absent, or stamped with an earlier day = nothing
   * traded yet today (that is the game-day reset; a world nobody trades in never carries it).
   */
  dayTraded?: DayTraded;
  /**
   * Notional (at the tick's pre-trade mid) ALL accounts already filled THIS tick on this asset, per side, plus
   * that mid. Temporary impact and the maxAdvPerTick cap are charged on it, so splitting inside one tick (clips
   * or accounts) costs what one order would. Absent, or stamped with another tick = nothing filled yet this tick.
   */
  tickTraded?: TickTraded;
  /**
   * INTERNAL, only written by the harness-only mark variants C / D (full / sim): the previous-close mark guard after
   * a day whose net crowd buy imbalance passed the threshold. Absent in every shipped mode.
   */
  markGuard?: { lnAnchor: number; anchorDay: number; untilDay: number };
  /**
   * INTERNAL, only written by the harness-only mark variant C5: the last 5 game days' net crowd buy flow / ADV and
   * each day's open (index 4 = `day`, today). Absent in every shipped mode and once all 5 days are flat.
   */
  markFlow?: { day: number; net: number[]; lnOpen: number[] };
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
export type OrderType = 'market' | 'limit' | 'stop';
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
}

export interface Position {
  qty: number;
  /** average cost per unit, buy commissions included */
  avgCost: number;
  realizedPnl: number;
}

export interface Account {
  playerId: string;
  cash: number;
  startingCash: number;
  positions: Record<string, Position>;
  realizedPnl: number;
  feesPaid: number;
  /** highest liquidation equity seen (cash + every position sold at estimateFill), so a self-pumped mid can't lift it */
  peakEquity: number;
  maxDrawdown: number;
  dayStartEquity: number;
  /**
   * @deprecated Ignored. Permanent impact used to be keyed per account; it is now the asset's shared tally
   * (AssetState.dayTraded). Kept only so saves that carry it still type-check; never read or written.
   */
  dayTraded?: Record<string, DayTraded>;
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

export type NewsKind = 'earnings' | 'company' | 'macro';

export interface NewsConfig {
  /** a stock reports every this many game days, staggered by id */
  earningsEveryDays: number;
  /** one macro headline every this many game days */
  macroEveryDays: number;
  /** news items kept on the world (oldest dropped) */
  kept: number;
}

export interface NewsItem {
  id: string;
  tick: number;
  day: number;
  kind: NewsKind;
  /** absent for macro */
  assetId?: string;
  headline: string;
  /** log move this news put into the price this tick; 0 = a print with no surprise */
  logImpact: number;
}

export type NewsBand = 'early' | 'mid' | 'late' | 'done';

export interface NewsView extends NewsItem {
  /**
   * How far the drift has run, in four bands. The exact share is deliberately not on this view:
   * showing it would hand the player the remaining move.
   */
  band: NewsBand;
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
  /** newest at the end; absent on worlds saved before news existed */
  news?: NewsItem[];
  /** market ecology state; only present once a step ran with config.ecology.mode 'shadow' or a valid 'hybrid' (or in enterSimMode) */
  ecology?: EcologyState;
  config: WorldConfig;
}

// ---------------------------------------------------------------- market ecology (shadow)

export type EcologyMode = 'off' | 'shadow' | 'hybrid' | 'full';
export type EcoPool = 'value' | 'trend' | 'retail' | 'pension';
/** terms of the daily cause vector, in log return; they sum to the shadow close-to-close move */
export type EcoCause = 'value' | 'trend' | 'retail' | 'pension' | 'maker' | 'news' | 'own';

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
  headlineHalfLifeDays: number;
  /** pension: in the last pensionDays of every quarter, trades pensionK · (drift from policy weight) per day, in ADV per unit log drift */
  pensionK: number;
  pensionDays: number;
  quarterDays: number;
  /** pool sizes in ADV-days (capacity scale) and position half-lives in game days (positions age out to long holders) */
  sizes: Record<EcoPool, number>;
  halfLives: Record<EcoPool, number>;
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
  /** the player's signed flow today, ADV */
  own: number;
  /** retail stream eco:retail:<id> */
  rng: RngState;
}

export interface EcoLogAsset {
  id: string;
  lnS: number;
  lnV: number;
  /** desired orders after the capacity cut, ADV (own = the player's fills) */
  desired: Record<EcoPool | 'own', number>;
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

export interface EcologyState {
  /** game day of the last shadow close */
  day: number;
  assets: EcoAssetState[];
  log: EcoLogDay[];
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

export type StepEvent =
  | { type: 'regime'; tick: number; from: RegimeId; to: RegimeId }
  | { type: 'jump'; tick: number; assetId: string; logSize: number }
  | { type: 'halt'; tick: number; assetId: string; move: number }
  | { type: 'reopen'; tick: number; assetId: string; gap: number }
  | { type: 'news'; tick: number; item: NewsItem };

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
  /** cash + every position sold now at estimateFill (spread, impact and fees out): the value used for peak and drawdown */
  liquidationEquity: number;
  /** equity − startingCash (fees included) */
  totalPnl: number;
  /** equity − equity at the start of the current game day */
  dayPnl: number;
  feesPaid: number;
  /** highest liquidation equity so far */
  peakEquity: number;
  /** current liquidation equity vs its peak, as a fraction ≤ 0 */
  drawdown: number;
  /** worst drawdown so far, as a fraction ≤ 0 */
  maxDrawdown: number;
}
