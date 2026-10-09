import type { RngState } from './rng';

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
  /** one-line flavor text for the UI */
  blurb?: string;
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
  /** interest rates, inflation, growth and the central bank; off when absent */
  rates?: RatesConfig;
  /** listed options; off when absent */
  options?: OptionsConfig;
  /** margin, shorting and liquidation; defaults to DEFAULT_MARGIN */
  margin?: MarginConfig;
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
  | { type: 'margin_call'; tick: number; playerId: string; equity: number; required: number }
  | { type: 'liquidation'; tick: number; playerId: string; assetId: string; qty: number; price: number }
  | { type: 'option_expiry'; tick: number; playerId: string; contractId: string; qty: number; payout: number };

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
  /** current drop from peak, as a fraction ≤ 0 */
  drawdown: number;
  /** worst drawdown so far, as a fraction ≤ 0 */
  maxDrawdown: number;
}
