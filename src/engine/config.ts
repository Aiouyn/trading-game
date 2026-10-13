import { DEFAULT_CATALYSTS } from './catalysts';
import { DEFAULT_RATES } from './rates';
import { regimeTimeShares } from './regimeShares';
import {
  RATE_VAR_SEED, RATE_VAR_YEARS, RATE_YIELD_DAILY_VAR, RATE_YIELD_VARIANCE_RATIO, YIELD_HORIZONS, simulateYieldVariance,
  type YieldVarByRegime, type YieldVarianceRatio,
} from './ratevar';
import type {
  AssetDef, CatalystConfig, IndexDef, RatesConfig, RegimeDef, RegimeId, TradingConfig, VolumeConfig, WorldConfig, YieldKey,
} from './types';

/** 01 §5.3. Lengths: Expansion 1.5–3 game yrs, the others 0.5–1 yr (252 trading days per year). */
export const DEFAULT_REGIMES: Record<RegimeId, RegimeDef> = {
  expansion: {
    id: 'expansion', equityDrift: 0.10, volMult: 0.9, jumpMult: 1.0, jumpUpShift: 0,
    marketLoadMult: 1, idioMult: 1, meanDays: 567,
    next: { overheating: 0.8, contraction: 0.2 },
  },
  overheating: {
    id: 'overheating', equityDrift: 0.04, volMult: 1.15, jumpMult: 1.3, jumpUpShift: -0.05,
    marketLoadMult: 1.1, idioMult: 1, meanDays: 189,
    next: { contraction: 0.85, expansion: 0.15 },
  },
  contraction: {
    id: 'contraction', equityDrift: -0.27, volMult: 1.4, jumpMult: 2.0, jumpUpShift: -0.15,
    marketLoadMult: 1.3, idioMult: 0.6, meanDays: 189,
    next: { recovery: 1 },
  },
  recovery: {
    id: 'recovery', equityDrift: 0.25, volMult: 1.2, jumpMult: 1.2, jumpUpShift: 0.05,
    marketLoadMult: 1, idioMult: 1, meanDays: 189,
    next: { expansion: 0.9, contraction: 0.1 },
  },
};

type AssetSpec = Pick<AssetDef, 'id' | 'name' | 'sector' | 'initialPrice' | 'vol'> & Partial<AssetDef>;

/** R-10-4: the smallest share step a stock or ETF trades in (fractional shares). */
export const FRACTIONAL_SHARE = 0.0001;

/**
 * R-10-2: a stock's full spread at normal volatility by market cap, in bps: large caps (40B and up) 2, mid caps (15B to 40B) 7,
 * small caps (5B to 15B) 20, micro caps 35. The volatility regime widens it (trading.ts halfSpread).
 */
export function spreadForCap(marketCap: number): number {
  return marketCap >= 40e9 ? 2 : marketCap >= 15e9 ? 7 : marketCap >= 5e9 ? 20 : 35;
}

function stock(spec: AssetSpec & { marketCap: number }): AssetDef {
  const { marketCap, ...rest } = spec;
  // R-10-2 (real-world full spread): large caps 2 bps, mid caps 7, small caps 20 to 35; daily turnover ~0.4% of market cap
  const spreadBps = spreadForCap(marketCap);
  return normalizeLoadings({
    spreadBps, advNotional: marketCap * 0.004, qtyStep: FRACTIONAL_SHARE,
    assetClass: 'stock', drift: 0.02, cycleBeta: 1, wMarket: 0.55, wSector: 0.45, wCrypto: 0,
    halfLifeDays: 20, jumpsPerYear: 3, jumpUpMean: 0.04, jumpDownMean: 0.06, jumpUpProb: 0.5,
    floor: 0.01, circuitBreaker: true,
    sharesOutstanding: marketCap / spec.initialPrice,
    ...rest,
  });
}

function crypto(spec: AssetSpec): AssetDef {
  return normalizeLoadings({
    assetClass: 'crypto', drift: 0.0, cycleBeta: 1.5, wMarket: 0.25, wSector: 0, wCrypto: 0.75,
    halfLifeDays: 120, jumpsPerYear: 8, jumpUpMean: 0.10, jumpDownMean: 0.14, jumpUpProb: 0.5,
    floor: 0.000001, circuitBreaker: false, spreadBps: 10, advNotional: 2e9, qtyStep: 0,
    ...spec,
  });
}

function commodity(spec: AssetSpec): AssetDef {
  return normalizeLoadings({
    assetClass: 'commodity', drift: 0.02, cycleBeta: 0.3, wMarket: 0.2, wSector: 0.6, wCrypto: 0,
    halfLifeDays: 40, jumpsPerYear: 4, jumpUpMean: 0.05, jumpDownMean: 0.05, jumpUpProb: 0.5,
    floor: 0.01, circuitBreaker: false, spreadBps: 3, advNotional: 30e9, qtyStep: 0,
    ...spec,
  });
}

/**
 * Scale market/sector/crypto loadings so they never exceed total variance, and derive the
 * idiosyncratic share: wIdio = sqrt(1 - wM² - wS² - wC²).
 */
export function normalizeLoadings(a: AssetDef): AssetDef {
  const wR = a.wRegion ?? 0;
  const sys = a.wMarket ** 2 + a.wSector ** 2 + a.wCrypto ** 2 + wR ** 2;
  if (sys <= 0.95) return a;
  const k = Math.sqrt(0.95 / sys);
  return {
    ...a, wMarket: a.wMarket * k, wSector: a.wSector * k, wCrypto: a.wCrypto * k,
    ...(a.wRegion !== undefined ? { wRegion: a.wRegion * k } : {}),
  };
}

/** Long-run share of game days in each default regime (regimeShares.ts): the weights of the no-regime expectation. */
export const DEFAULT_REGIME_SHARES = regimeTimeShares(DEFAULT_REGIMES);

/** Trading days in a year, the calendar the rates layer's daily variance is annualized on (defaultConfig). */
const DAYS_PER_YEAR = 252;

/** E[J²] of one jump of a (Kou, exponential sizes of mean η: E[J²] = 2η²), with up-probability p in the regime. */
function jumpSecondMoment(a: AssetDef, shift: number): number {
  const p = Math.min(0.95, Math.max(0.05, a.jumpUpProb + shift));
  return p * 2 * a.jumpUpMean ** 2 + (1 - p) * 2 * a.jumpDownMean ** 2;
}

/**
 * The share of a day's rate move that is in the close-to-close return, given the share that prints at the close (ratePrint).
 * The rest of the move sits in lnV and the value pool trades it the next day (ecology.ts), so the day's return is
 * printPrint · move_t + (1 − printPrint) · move_(t−1): its variance is (print² + (1 − print)²) x the move's variance.
 */
export function ratePassThrough(print: number): number {
  return print * print + (1 - print) * (1 - print);
}

/** What expectedVol reads from a world config besides the asset. A key that is present with null or undefined turns that term off. */
export interface ExpectedVolWorld {
  rates?: RatesConfig | null;
  catalysts?: CatalystConfig | null;
  /** the horizon in game days the vol is for (options: days to expiry). Default 1, the daily band. */
  horizonDays?: number;
}

interface YieldTables { variance: YieldVarByRegime; ratio: YieldVarianceRatio }
const DEFAULT_YIELD_TABLES: YieldTables = { variance: RATE_YIELD_DAILY_VAR, ratio: RATE_YIELD_VARIANCE_RATIO };

/** The yield tables for a rates config and regime table: the generated constants for the defaults, else a memoized simulation. */
const yieldCache = new WeakMap<RatesConfig, WeakMap<Record<RegimeId, RegimeDef>, YieldTables>>();
function yieldTables(rates: RatesConfig, regimes: Record<RegimeId, RegimeDef>): YieldTables {
  if (rates === DEFAULT_RATES && regimes === DEFAULT_REGIMES) return DEFAULT_YIELD_TABLES;
  let byRegimes = yieldCache.get(rates);
  if (!byRegimes) { byRegimes = new WeakMap(); yieldCache.set(rates, byRegimes); }
  let t = byRegimes.get(regimes);
  if (!t) {
    const sim = simulateYieldVariance(rates, regimes, RATE_VAR_YEARS, RATE_VAR_SEED);
    t = { variance: sim.variance, ratio: sim.ratio };
    byRegimes.set(regimes, t);
  }
  return t;
}

/**
 * Variance ratio of a yield's change over `days` (ratevar.ts): log-linear between the table's horizons, 1 at one day, flat past
 * the last horizon. The rate term of a horizon vol is the daily variance times this ratio.
 */
export function yieldVarianceRatio(ratio: YieldVarianceRatio, key: YieldKey, days: number): number {
  const v = ratio[key];
  const last = YIELD_HORIZONS.length - 1;
  if (!(days > YIELD_HORIZONS[0]!)) return v[0]!;
  if (days >= YIELD_HORIZONS[last]!) return v[last]!;
  let i = 0;
  while (YIELD_HORIZONS[i + 1]! < days) i++;
  const h0 = YIELD_HORIZONS[i]!, h1 = YIELD_HORIZONS[i + 1]!;
  const t = (Math.log(days) - Math.log(h0)) / (Math.log(h1) - Math.log(h0));
  return v[i]! + t * (v[i + 1]! - v[i]!);
}

/**
 * E[s²] of the analyst surprise (catalysts.ts): s = ρ c/σ + sqrt(1 − ρ²) N, c = clamp(σ N1, −1, 1), so c/σ = clamp(N1, ±1/σ).
 * The clamped moment is a quadrature over N1 (fixed grid, so the same config always gives the same number).
 */
function surpriseSecondMoment(cat: CatalystConfig): number {
  const k = 1 / cat.consensusSd;
  const n = 2000, lo = -10, hi = 10, h = (hi - lo) / n;
  let acc = 0, wsum = 0;
  for (let i = 0; i <= n; i++) {
    const x = lo + i * h;
    const w = (i === 0 || i === n ? 1 : i % 2 ? 4 : 2) * Math.exp(-x * x / 2);
    const cl = Math.max(-k, Math.min(k, x));
    acc += w * cl * cl;
    wsum += w;
  }
  return cat.rho * cat.rho * (acc / wsum) + (1 - cat.rho * cat.rho);
}

/**
 * Annualized variance of the earnings gap (catalysts.ts): one report a everyDays, the day's jump J = moveScale (vol/0.3) s, and
 * the post-earnings drift adds peadShare x J spread over peadDays days, so a report's sum of squared daily moves is
 * J² (1 + peadShare² / peadDays). Only stocks report.
 */
function earningsVar(a: AssetDef, cat: CatalystConfig): number {
  const j2 = (cat.moveScale * (a.vol / 0.3)) ** 2 * surpriseSecondMoment(cat);
  return (DAYS_PER_YEAR / cat.everyDays) * j2 * (1 + (cat.peadShare * cat.peadShare) / cat.peadDays);
}

/**
 * Expected total annualized volatility of an asset (the model's own prediction of its daily close-to-close return vol):
 *   expectedVol² = D_diff + λ · jumpMult · E_p[J²] · jumpPrint² + earnings + D² · σ²_yield · 252 · ratePassThrough(ratePrint)
 * with the terms below. Each one is taken from the code that generates it, so it is a prediction, not a fit:
 * - diffusion (sim.ts): (vol · volMult · shockSd)², where shockSd is regimeShockSd (the regime's loading split, sim.ts). With a
 *   regime, that regime's values. Without one, the time average over the default regimes (regimeShares.ts), so E[volMult²] is
 *   1.18 on the defaults, not 1.
 * - jumps (sim.ts, Kou exponential sizes of mean η, E[J²] = 2η²): with a regime, that regime's jumpMult and jump up-shift.
 *   Without one, the time average over the regimes.
 * - earnings (catalysts.ts), stocks only, when `world.catalysts` is on: see earningsVar.
 * - rates (rates.ts, ratevar.ts): an asset with duration and yieldKey (bonds, property) adds D² x the daily yield variance of
 *   its key x 252 x the print pass-through. The yield table is the rates config's own (the generated constant for DEFAULT_RATES,
 *   a memoized simulation otherwise); with no rates layer (`world.rates` null) the term is 0.
 * Not in the expectation: flash crashes (about 1.3 a year, -8% on stocks, about 1 to 2% of stock vol), crisis weeks (about 4%
 * of days trade as contraction, about 1% of vol), crash and bubble drifts (spread over 10 to 40 days, negligible per day), and
 * the ecology's own dynamics: the value pull that shortens daily moves and the momentum and trend pools that lengthen them
 * over a horizon. Those two are the residuals the vol bands measure (bands.ts, V1-PHASE1 section 3o).
 *
 * horizonDays (default 1) is the horizon the vol is for: the rate term is multiplied by the yield variance ratio at that
 * horizon (ratevar.ts, RATE_YIELD_VARIANCE_RATIO). Options use their days to expiry; the daily bands use 1.
 *
 * jumpPrint and ratePrint are the shares that print in the close, for the daily-return vol the bands measure (closePrint,
 * ratePrintOf in ecology.ts). They default to 1: an option's vol is the full variance, since a move that prints late still
 * reaches the price. `regimes` is the config's regime table (default: the default regimes, which the bands use).
 * GARCH has long-run mean h = 1, so it does not change the expectation.
 */
export function expectedVol(
  a: AssetDef, regime?: RegimeDef, jumpPrint = 1, ratePrint = jumpPrint, regimes: Record<RegimeId, RegimeDef> = DEFAULT_REGIMES,
  world: ExpectedVolWorld = { rates: DEFAULT_RATES, catalysts: null },
): number {
  const shares = regimes === DEFAULT_REGIMES ? DEFAULT_REGIME_SHARES : regimeTimeShares(regimes);
  const ids = Object.keys(regimes) as RegimeId[];
  let diffVar: number, jumpVar: number;
  if (regime) {
    diffVar = (a.vol * regime.volMult * regimeShockSd(a, regime)) ** 2;
    jumpVar = a.jumpsPerYear * regime.jumpMult * jumpSecondMoment(a, regime.jumpUpShift ?? 0);
  } else {
    diffVar = 0;
    jumpVar = 0;
    for (const id of ids) {
      const g = regimes[id];
      diffVar += shares[id] * (a.vol * g.volMult * regimeShockSd(a, g)) ** 2;
      jumpVar += shares[id] * a.jumpsPerYear * g.jumpMult * jumpSecondMoment(a, g.jumpUpShift ?? 0);
    }
  }
  let rateVar = 0;
  const rates = 'rates' in world ? world.rates : DEFAULT_RATES;
  if (a.duration && a.yieldKey && rates) {
    const { variance: table, ratio } = yieldTables(rates, regimes);
    const daily = regime ? table[regime.id]?.[a.yieldKey] ?? 0 : ids.reduce((acc, id) => acc + shares[id] * table[id][a.yieldKey!], 0);
    const horizon = yieldVarianceRatio(ratio, a.yieldKey, world.horizonDays ?? 1);
    rateVar = a.duration ** 2 * daily * DAYS_PER_YEAR * ratePassThrough(ratePrint) * horizon;
  }
  const cat = 'catalysts' in world ? world.catalysts : null;
  const earnVar = cat && a.assetClass === 'stock' ? earningsVar(a, cat) : 0;
  return Math.sqrt(diffVar + jumpVar * jumpPrint ** 2 + earnVar * jumpPrint ** 2 + rateVar);
}

/**
 * expectedVol for an asset in a world config: that config's regime table, rates layer and catalysts. A config without rates or
 * catalysts gets no rate or earnings term (the keys are passed explicitly, so a dropped layer is not priced in).
 */
export function expectedVolOf(
  a: AssetDef, cfg: Pick<WorldConfig, 'regimes' | 'rates' | 'catalysts'>, regime?: RegimeDef, jumpPrint = 1, ratePrint = jumpPrint,
  horizonDays = 1,
): number {
  return expectedVol(a, regime, jumpPrint, ratePrint, cfg.regimes ?? DEFAULT_REGIMES, {
    rates: cfg.rates ?? null, catalysts: cfg.catalysts ?? null, horizonDays,
  });
}

export function idioLoading(a: AssetDef): number {
  return Math.sqrt(Math.max(0, 1 - a.wMarket ** 2 - a.wSector ** 2 - a.wCrypto ** 2 - (a.wRegion ?? 0) ** 2));
}

/**
 * Standard deviation of the unit-variance shock in a regime (sim.ts): market and idio loadings are scaled by the
 * regime's marketLoadMult and idioMult, the sector, crypto and region loadings are not. The day's diffusive variance is
 * def.vol^2 * volMult^2 * h * shockSd^2 * dt, so this is the piece of a regime's vol that volMult alone leaves out.
 */
export function regimeShockSd(a: AssetDef, g: RegimeDef): number {
  const wR = a.wRegion ?? 0;
  const v = (a.wMarket * g.marketLoadMult) ** 2 + a.wSector ** 2 + a.wCrypto ** 2 + wR ** 2 + (idioLoading(a) * g.idioMult) ** 2;
  return Math.sqrt(v);
}

/**
 * Phase 0 starter universe: the 12 example companies of 01 §3.1 (one per sector),
 * 3 crypto, gold and oil, and the GX index. Fictional names only.
 * Market caps in $; prices in $.
 */
export const DEFAULT_ASSETS: AssetDef[] = [
  stock({ id: 'HLCN', name: 'Halcyon Systems', sector: 'tech', initialPrice: 182, vol: 0.32, marketCap: 420e9, drift: 0.04, cycleBeta: 1.3 }),
  stock({ id: 'NMBS', name: 'Nimbus Compute', sector: 'semis', initialPrice: 96, vol: 0.45, marketCap: 260e9, drift: 0.05, cycleBeta: 1.6, jumpsPerYear: 5 }),
  stock({ id: 'VRDN', name: 'Verdane Energy', sector: 'energy', initialPrice: 64, vol: 0.28, marketCap: 140e9, cycleBeta: 0.9, wSector: 0.55, wMarket: 0.45 }),
  stock({ id: 'OSTV', name: 'Ostrava Steel', sector: 'materials', initialPrice: 38, vol: 0.34, marketCap: 22e9, cycleBeta: 1.3, halfLifeDays: 60 }),
  stock({ id: 'ATLF', name: 'Atlas Freight', sector: 'industrials', initialPrice: 71, vol: 0.27, marketCap: 48e9, cycleBeta: 1.1 }),
  stock({ id: 'MRDB', name: 'Meridia Bank', sector: 'financials', initialPrice: 52, vol: 0.26, marketCap: 180e9, cycleBeta: 1.4, wMarket: 0.65, wSector: 0.4 }),
  stock({ id: 'LMNP', name: 'Lumen Pharma', sector: 'health', initialPrice: 118, vol: 0.38, marketCap: 35e9, cycleBeta: 0.4, wMarket: 0.35, wSector: 0.3, jumpsPerYear: 6, jumpUpMean: 0.12, jumpDownMean: 0.18, halfLifeDays: 60 }),
  stock({ id: 'PLLS', name: 'Pallas Foods', sector: 'staples', initialPrice: 44, vol: 0.16, marketCap: 90e9, cycleBeta: 0.3, wMarket: 0.45, wSector: 0.4 }),
  stock({ id: 'CRVO', name: 'Corvo Motors', sector: 'discretionary', initialPrice: 210, vol: 0.55, marketCap: 75e9, drift: 0.03, cycleBeta: 1.5, jumpsPerYear: 6, halfLifeDays: 60 }),
  stock({ id: 'VLMS', name: 'Velour Maison', sector: 'discretionary', initialPrice: 640, vol: 0.27, marketCap: 160e9, cycleBeta: 1.2 }),
  stock({ id: 'AURH', name: 'Aurelius Holdings', sector: 'realestate', initialPrice: 29, vol: 0.30, marketCap: 18e9, cycleBeta: 1.2, halfLifeDays: 60 }),
  stock({ id: 'SNTL', name: 'Sentinel Cyber', sector: 'security', initialPrice: 88, vol: 0.33, marketCap: 30e9, cycleBeta: 0.2, wMarket: 0.35, wSector: 0.45, halfLifeDays: 60 }),

  crypto({ id: 'AUC', name: 'Aurum Coin', sector: 'crypto', initialPrice: 41000, vol: 0.65, spreadBps: 5, advNotional: 20e9 }),
  crypto({ id: 'LTX', name: 'Lattice', sector: 'crypto', initialPrice: 2300, vol: 0.80, cycleBeta: 1.8, spreadBps: 5, advNotional: 8e9 }),
  crypto({ id: 'SYN', name: 'Synapse', sector: 'crypto', initialPrice: 3.4, vol: 1.10, cycleBeta: 2.2, wCrypto: 0.6, jumpsPerYear: 12, spreadBps: 15, advNotional: 300e6 }),

  commodity({ id: 'GOLD', name: 'Gold', sector: 'metals', initialPrice: 2100, vol: 0.15, cycleBeta: -0.4, wMarket: -0.15, wSector: 0.7, drift: 0.03 }),
  commodity({ id: 'OIL', name: 'Crude Oil', sector: 'energy', initialPrice: 78, vol: 0.35, cycleBeta: 0.8, wMarket: 0.3, wSector: 0.75, jumpsPerYear: 6 }),
];

export const DEFAULT_INDICES: IndexDef[] = [
  {
    id: 'GX', name: 'GX Index', base: 1000,
    members: DEFAULT_ASSETS.filter((a) => a.assetClass === 'stock').map((a) => a.id),
  },
];

/**
 * $5,000 start. R-10-2 fee schedule, close to a real retail broker: stocks and ETFs $0.005 a share, $1 minimum, at most 1% of
 * the value (IBKR-like); crypto 0.10% taker; FX $2 per $100k (0.2 bps); bonds and commodities 2 bps with no minimum (R-10-2 as
 * ruled; a $1k bond order pays $0.20). Options pay
 * feePerContract (options.ts). The fees are a booked sink (the Street or the book takes them), never a spread.
 */
export const DEFAULT_TRADING: TradingConfig = {
  startingCash: 5000,
  fees: {
    stock: { rate: 0, min: 1, perUnit: 0.005, max: 0.01 },
    commodity: { rate: 0.0002, min: 0 },
    crypto: { rate: 0.001, min: 0 },
    forex: { rate: 0.00002, min: 0 },
    bond: { rate: 0.0002, min: 0 },
    realestate: { rate: 0.01, min: 1 },
  },
  impactY: 0.8,
  permanentImpactShare: 0.5,
  maxAdvPerTick: 3,
  closedOrdersKept: 500,
};

/** Volume model (see ENGINE.md, Volume). Calibrated so the long-run mean day trades about advNotional. */
export const DEFAULT_VOLUME: VolumeConfig = {
  noise: 0.4,
  moveBase: 0.6,
  moveSlope: 0.5,
  zCap: 40,
  heatHalfLifeDays: 1 / 6,
  jumpHeat: 50,
  haltHeat: 1,
  reopenHeat: 2,
  uShape: 0.5,
};

export function defaultConfig(overrides: Partial<WorldConfig> = {}): WorldConfig {
  return {
    ticksPerDay: 720,
    daysPerYear: 252,
    garchAlpha: 0.08,
    garchBeta: 0.90,
    garchMin: 0.25,
    garchMax: 9,
    studentNu: 4,
    permanentShare: 0.8,
    haltThreshold: 0.15,
    haltTicks: 120,
    initialRegime: 'expansion',
    trading: DEFAULT_TRADING,
    volume: DEFAULT_VOLUME,
    regimes: DEFAULT_REGIMES,
    assets: DEFAULT_ASSETS,
    indices: DEFAULT_INDICES,
    ...overrides,
  };
}

/**
 * The config the game runs: the calibrated engine plus catalysts (scheduled earnings, analyst
 * previews, rumors, post-earnings drift). defaultConfig() stays catalyst-free so the engine's
 * calibration tests and balance bands keep measuring the bare price model.
 */
export function gameConfig(overrides: Partial<WorldConfig> = {}): WorldConfig {
  return defaultConfig({ catalysts: DEFAULT_CATALYSTS, ...overrides });
}
