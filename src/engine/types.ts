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
  peakEquity: number;
  maxDrawdown: number;
  dayStartEquity: number;
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
  | { type: 'earnings'; tick: number; assetId: string; surprise: number; consensus: number; move: number };

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
