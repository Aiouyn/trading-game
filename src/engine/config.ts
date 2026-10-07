import type { AssetDef, IndexDef, RegimeDef, RegimeId, TradingConfig, WorldConfig } from './types';

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

function stock(spec: AssetSpec & { marketCap: number }): AssetDef {
  const { marketCap, ...rest } = spec;
  // 01 §7.2: mega caps ~2 bps, small caps ~25 bps; daily turnover ~0.4% of market cap
  const spreadBps = marketCap >= 100e9 ? 2 : marketCap >= 40e9 ? 6 : marketCap >= 25e9 ? 12 : 25;
  return normalizeLoadings({
    spreadBps, advNotional: marketCap * 0.004, qtyStep: 1,
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
  const sys = a.wMarket ** 2 + a.wSector ** 2 + a.wCrypto ** 2;
  if (sys <= 0.95) return a;
  const k = Math.sqrt(0.95 / sys);
  return { ...a, wMarket: a.wMarket * k, wSector: a.wSector * k, wCrypto: a.wCrypto * k };
}

/**
 * Expected total annualized volatility of an asset: diffusion plus compound Poisson jumps.
 * Kou jumps with exponential sizes of mean η have E[J²] = 2η², so
 *   expectedVol² = (vol · volMult)² + λ · jumpMult · (p · 2ηUp² + (1 − p) · 2ηDown²)
 * GARCH has long-run mean h = 1, so it does not change the expectation.
 * Without a regime this is the neutral calibration target that balance bands compare against.
 */
export function expectedVol(a: AssetDef, regime?: RegimeDef): number {
  const volMult = regime?.volMult ?? 1;
  const jumpMult = regime?.jumpMult ?? 1;
  const p = Math.min(0.95, Math.max(0.05, a.jumpUpProb + (regime?.jumpUpShift ?? 0)));
  const ej2 = p * 2 * a.jumpUpMean ** 2 + (1 - p) * 2 * a.jumpDownMean ** 2;
  return Math.sqrt((a.vol * volMult) ** 2 + a.jumpsPerYear * jumpMult * ej2);
}

export function idioLoading(a: AssetDef): number {
  return Math.sqrt(Math.max(0, 1 - a.wMarket ** 2 - a.wSector ** 2 - a.wCrypto ** 2));
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
  crypto({ id: 'LTX', name: 'Lattice', sector: 'crypto', initialPrice: 2300, vol: 0.80, cycleBeta: 1.8, spreadBps: 8, advNotional: 8e9 }),
  crypto({ id: 'SYN', name: 'Synapse', sector: 'crypto', initialPrice: 3.4, vol: 1.10, cycleBeta: 2.2, wCrypto: 0.6, jumpsPerYear: 12, spreadBps: 60, advNotional: 300e6 }),

  commodity({ id: 'GOLD', name: 'Gold', sector: 'metals', initialPrice: 2100, vol: 0.15, cycleBeta: -0.4, wMarket: -0.15, wSector: 0.7, drift: 0.03 }),
  commodity({ id: 'OIL', name: 'Crude Oil', sector: 'energy', initialPrice: 78, vol: 0.35, cycleBeta: 0.8, wMarket: 0.3, wSector: 0.75, jumpsPerYear: 6 }),
];

export const DEFAULT_INDICES: IndexDef[] = [
  {
    id: 'GX', name: 'GX Index', base: 1000,
    members: DEFAULT_ASSETS.filter((a) => a.assetClass === 'stock').map((a) => a.id),
  },
];

/** 01 §7 and the bible: $5,000 start; commission 0.10% (min $1) on stocks and commodities, 0.20% on crypto. */
export const DEFAULT_TRADING: TradingConfig = {
  startingCash: 5000,
  fees: {
    stock: { rate: 0.001, min: 1 },
    commodity: { rate: 0.001, min: 1 },
    crypto: { rate: 0.002, min: 0 },
  },
  impactY: 0.8,
  permanentImpactShare: 0.5,
  maxAdvPerTick: 3,
  closedOrdersKept: 500,
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
    regimes: DEFAULT_REGIMES,
    assets: DEFAULT_ASSETS,
    indices: DEFAULT_INDICES,
    ...overrides,
  };
}
