import { describe, expect, it } from 'vitest';
import { createWorld, step, stepMany } from './sim';
import { DEFAULT_REGIMES, defaultConfig, normalizeLoadings } from './config';
import {
  buyingPower, cancelOrder, equityOf, grossExposure, marginConfig, openAccount, placeOrder, portfolio, setAccountPermissions, tradeOption,
} from './trading';
import { blackScholes, listedExpiries, optionChain, optionQuote, parseContract } from './options';
import { DEFAULT_OPTIONS } from './options';
import { DEFAULT_RATES } from './rates';
import { universeConfig, GAME_ASSETS } from './universe';
import type { AssetDef, OrderRequest, RegimeDef, RegimeId, StepEvent, WorldState } from './types';

function calmRegimes(): Record<RegimeId, RegimeDef> {
  const out = {} as Record<RegimeId, RegimeDef>;
  for (const [id, r] of Object.entries(DEFAULT_REGIMES) as [RegimeId, RegimeDef][]) {
    out[id] = { ...r, equityDrift: 0, volMult: 1, jumpMult: 1, jumpUpShift: 0, marketLoadMult: 1, idioMult: 1, meanDays: 1e12 };
  }
  return out;
}

function flat(id: string, extra: Partial<AssetDef> = {}): AssetDef {
  return normalizeLoadings({
    id, name: id, assetClass: 'stock', sector: 'x', initialPrice: 100, sharesOutstanding: 1e6,
    vol: 1e-7, drift: 0, cycleBeta: 0, wMarket: 0.5, wSector: 0.5, wCrypto: 0,
    halfLifeDays: 1e9, jumpsPerYear: 0, jumpUpMean: 0.04, jumpDownMean: 0.06, jumpUpProb: 0.5,
    floor: 0.01, circuitBreaker: false, spreadBps: 10, advNotional: 1e9, qtyStep: 1, ...extra,
  });
}

function world(perms: { maxLeverage?: number; canShort?: boolean; canOptions?: boolean } = {}, extra: Parameters<typeof defaultConfig>[0] = {}): WorldState {
  const w = openAccount(createWorld('adv', defaultConfig({ ticksPerDay: 10, regimes: calmRegimes(), assets: [flat('STK'), flat('ALT')], indices: [], ...extra })), 'p1', 10000);
  return setAccountPermissions(w, 'p1', perms);
}

function setPrice(s: WorldState, id: string, price: number): WorldState {
  return { ...s, assets: s.assets.map((a) => (a.id === id ? { ...a, lnP: Math.log(price), lnV: Math.log(price) } : a)) };
}

function place(s: WorldState, req: Partial<OrderRequest>) {
  return placeOrder(s, { playerId: 'p1', assetId: 'STK', side: 'buy', type: 'market', qty: 1, ...req });
}

describe('short selling', () => {
  it('is refused on a cash account and allowed with canShort', () => {
    expect(place(world(), { side: 'sell', qty: 10 }).order.rejectReason).toBe('insufficient position');
    const r = place(world({ canShort: true, maxLeverage: 2 }), { side: 'sell', qty: 10 });
    expect(r.order.status).toBe('open');
    const s = step(r.state).state;
    const pf = portfolio(s, 'p1');
    expect(pf.positions[0]!.qty).toBe(-10);
    expect(pf.cash).toBeGreaterThan(10000 + 990); // proceeds credited
  });

  it('profits when the price falls and books realized P&L on the cover', () => {
    let s = step(place(world({ canShort: true, maxLeverage: 2 }), { side: 'sell', qty: 10 }).state).state;
    const entry = portfolio(s, 'p1').positions[0]!.avgCost;
    s = setPrice(s, 'STK', 80);
    expect(portfolio(s, 'p1').unrealizedPnl).toBeGreaterThan(150);
    s = step(place(s, { side: 'buy', qty: 10 }).state).state;
    const pf = portfolio(s, 'p1');
    expect(pf.positions).toHaveLength(0);
    expect(pf.realizedPnl).toBeGreaterThan(10 * (entry - 81));
    // the accounting identity holds through a short round trip
    expect(pf.realizedPnl + pf.unrealizedPnl).toBeCloseTo(pf.equity - pf.startingCash, 6);
  });

  it('flips from long to short in one fill', () => {
    let s = step(place(world({ canShort: true, maxLeverage: 2 }), { qty: 5 }).state).state;
    s = step(place(s, { side: 'sell', qty: 12 }).state).state;
    expect(portfolio(s, 'p1').positions[0]!.qty).toBe(-7);
  });
});

describe('margin', () => {
  it('leverage raises buying power to maxLeverage × equity', () => {
    expect(buyingPower(world(), 'p1')).toBeCloseTo(10000, 6);
    expect(buyingPower(world({ maxLeverage: 2 }), 'p1')).toBeCloseTo(20000, 6);
    expect(place(world({ maxLeverage: 2 }), { qty: 150 }).order.status).toBe('open');
    expect(place(world({ maxLeverage: 2 }), { qty: 250 }).order.rejectReason).toBe('insufficient buying power');
  });

  it('issues a margin call, then liquidates a leveraged long that collapses', () => {
    let s = step(place(world({ maxLeverage: 2 }), { qty: 190 }).state).state;
    expect(portfolio(s, 'p1').cash).toBeLessThan(0); // borrowed
    const mc = marginConfig(s);
    const cash = s.accounts.p1!.cash;
    const qty = 190;
    // equity = cash + qty * price (cash is negative), gross = qty * price
    const priceFor = (ratio: number) => cash / (qty * (ratio - 1));
    const ratioAt = (price: number) => {
      const next = setPrice(s, 'STK', price);
      return equityOf(next, next.accounts.p1!) / grossExposure(next, next.accounts.p1!);
    };
    const fine = priceFor(mc.maintenance + 0.02);
    expect(ratioAt(fine)).toBeGreaterThan(mc.maintenance);
    s = setPrice(s, 'STK', fine);
    let r = step(s);
    expect(r.events.some((e) => e.type === 'margin_call' || e.type === 'liquidation')).toBe(false);
    const between = (mc.maintenance + mc.liquidation) / 2;
    expect(ratioAt(priceFor(between))).toBeLessThan(mc.maintenance);
    expect(ratioAt(priceFor(between))).toBeGreaterThan(mc.liquidation);
    s = setPrice(r.state, 'STK', priceFor(between));
    r = step(s);
    expect(r.events.some((e) => e.type === 'margin_call')).toBe(true);
    s = setPrice(r.state, 'STK', priceFor(mc.liquidation / 2));
    r = step(s);
    const liq = r.events.filter((e): e is Extract<StepEvent, { type: 'liquidation' }> => e.type === 'liquidation');
    expect(liq).toHaveLength(1);
    expect(portfolio(r.state, 'p1').positions).toHaveLength(0);
    expect(r.state.orders.some((o) => o.forced)).toBe(true);
  });
});

describe('advanced order types', () => {
  it('trailing sell stop follows the high and fires on the pullback', () => {
    let s = step(place(world(), { qty: 10 }).state).state;
    s = place(s, { side: 'sell', type: 'trailing', trailPct: 0.05, qty: 10 }).state;
    s = step(setPrice(s, 'STK', 120)).state; // new high, trail moves up to 114
    expect(s.orders.find((o) => o.type === 'trailing')!.trailRef).toBeCloseTo(120, 6);
    s = step(setPrice(s, 'STK', 116)).state; // above 114: still open
    expect(portfolio(s, 'p1').positions).toHaveLength(1);
    s = step(setPrice(s, 'STK', 113)).state; // below 114: fires
    expect(portfolio(s, 'p1').positions).toHaveLength(0);
  });

  it('stop-limit triggers on the stop, then only fills at the limit or better', () => {
    let s = step(place(world(), { qty: 10 }).state).state;
    s = place(s, { side: 'sell', type: 'stop_limit', stopPrice: 95, limitPrice: 94, qty: 10 }).state;
    s = step(setPrice(s, 'STK', 90)).state; // gaps below the limit: triggered, not filled
    const o = s.orders.find((x) => x.type === 'stop_limit')!;
    expect(o.triggered).toBe(true);
    expect(o.status).toBe('open');
    s = step(setPrice(s, 'STK', 95)).state; // back above the limit: fills
    expect(portfolio(s, 'p1').positions).toHaveLength(0);
  });

  it('a bracket places take-profit and stop-loss legs; one fill cancels the other', () => {
    let s = place(world(), { qty: 10, takeProfit: 110, stopLoss: 92 }).state;
    s = step(s).state;
    const legs = s.orders.filter((o) => o.ocoGroup);
    expect(legs.map((o) => o.type).sort()).toEqual(['limit', 'stop']);
    expect(legs.every((o) => o.reduceOnly && o.qty === 10)).toBe(true);
    s = step(setPrice(s, 'STK', 112)).state; // take-profit fills
    expect(portfolio(s, 'p1').positions).toHaveLength(0);
    expect(s.orders.find((o) => o.ocoGroup && o.type === 'stop')!.status).toBe('cancelled');
  });

  it('rejects a bracket with the legs on the wrong side', () => {
    expect(place(world(), { qty: 1, takeProfit: 90, stopLoss: 95 }).order.status).toBe('rejected');
  });

  it('reduce-only legs cancel themselves when the position is gone', () => {
    let s = place(world(), { qty: 10, stopLoss: 92 }).state;
    s = step(s).state;
    s = step(place(s, { side: 'sell', qty: 10 }).state).state;
    s = step(setPrice(s, 'STK', 80)).state;
    const leg = s.orders.find((o) => o.ocoGroup)!;
    expect(leg.status).toBe('cancelled');
    expect(portfolio(s, 'p1').positions).toHaveLength(0);
  });

  it('cancel still works on a trailing order', () => {
    const r = place(world(), { side: 'buy', type: 'trailing', trailPct: 0.1, qty: 1 });
    expect(cancelOrder(r.state, 'p1', r.order.id).orders.at(-1)!.status).toBe('cancelled');
  });
});

describe('options', () => {
  it('Black-Scholes satisfies put-call parity', () => {
    const S = 100, K = 105, T = 0.25, r = 0.03, v = 0.3;
    const c = blackScholes('call', S, K, T, r, v).price;
    const p = blackScholes('put', S, K, T, r, v).price;
    expect(c - p).toBeCloseTo(S - K * Math.exp(-r * T), 6);
  });

  it('lists weekly expiries and a chain around spot; needs the license to trade', () => {
    const cfg = { options: { ...DEFAULT_OPTIONS, underlyings: ['STK'] } };
    let s = world({}, cfg);
    const exp = listedExpiries(s);
    expect(exp).toHaveLength(4);
    expect(exp[1]! - exp[0]!).toBe(5);
    const chain = optionChain(s, 'STK', exp[0]!);
    expect(chain.length).toBeGreaterThan(5);
    const atm = chain.find((r) => r.strike === 100)!;
    expect(atm.call.ask).toBeGreaterThan(atm.call.bid);
    expect(tradeOption(s, 'p1', atm.call.id, 'buy', 1).error).toMatch(/Derivatives/);
    s = setAccountPermissions(s, 'p1', { canOptions: true });
    const r = tradeOption(s, 'p1', atm.call.id, 'buy', 2);
    expect(r.error).toBeUndefined();
    expect(portfolio(r.state, 'p1').cash).toBeCloseTo(10000 - r.fill!.total, 6);
  });

  it('cash-settles in the money at expiry and pays nothing out of the money', () => {
    const cfg = { options: { ...DEFAULT_OPTIONS, underlyings: ['STK'] } };
    let s = setAccountPermissions(world({}, cfg), 'p1', { canOptions: true });
    const e = listedExpiries(s)[0]!;
    const chain = optionChain(s, 'STK', e);
    const call = chain.find((r) => r.strike === 100)!.call;
    const put = chain.find((r) => r.strike === 100)!.put;
    s = tradeOption(s, 'p1', call.id, 'buy', 1).state;
    s = tradeOption(s, 'p1', put.id, 'buy', 1).state;
    s = setPrice(s, 'STK', 110);
    const cash0 = portfolio(s, 'p1').cash;
    const r = stepMany(s, (e + 2) * 10 - s.tick);
    const ex = r.events.filter((x) => x.type === 'option_expiry');
    expect(ex).toHaveLength(2);
    expect(portfolio(r.state, 'p1').cash - cash0).toBeCloseTo(10 * 100, 0);
    expect(r.state.accounts.p1!.options).toEqual({});
  });

  it('parses contract ids', () => {
    expect(parseContract('HLCN|12|C|180')).toMatchObject({ underlying: 'HLCN', expiryDay: 12, kind: 'call', strike: 180 });
    expect(parseContract('nope')).toBeNull();
  });

  it('quotes decay toward intrinsic as expiry nears', () => {
    const cfg = { options: { ...DEFAULT_OPTIONS, underlyings: ['STK'] } };
    const s = world({}, cfg);
    const c = { id: 'STK|20|C|100', underlying: 'STK', kind: 'call' as const, strike: 100, expiryDay: 20 };
    const early = optionQuote(s, c).mid;
    const late = optionQuote({ ...s, tick: 205 }, c).mid;
    expect(late).toBeLessThan(early);
  });
});

const TPD = 24;

describe('rates and macro', () => {
  it('the central bank meets on schedule, data releases alternate, and both are deterministic', () => {
    const cfg = universeConfig({ ticksPerDay: TPD });
    // a game year: the bank meets every 32 days (about 8 a year, as real central banks do), so 252 days hold 7 meetings
    const a = stepMany(createWorld('macro', cfg), TPD * 252);
    const b = stepMany(createWorld('macro', cfg), TPD * 252);
    const meetings = a.events.filter((e) => e.type === 'rates');
    const releases = a.events.filter((e): e is Extract<StepEvent, { type: 'macro' }> => e.type === 'macro');
    expect(meetings.length).toBe(Math.floor(252 / DEFAULT_RATES.meetingEvery));
    expect(releases.length).toBeGreaterThanOrEqual(40);
    expect(new Set(releases.map((r) => r.kind))).toEqual(new Set(['cpi', 'jobs']));
    expect(a.state.rates).toEqual(b.state.rates);
    for (const m of meetings) if (m.type === 'rates') expect(Math.abs(m.change)).toBeLessThanOrEqual(DEFAULT_RATES.maxMove + 1e-12);
  }, 60_000); // a game year of the full universe, run twice: longer than vitest's 5 s default on a loaded machine

  it('long bonds fall when yields rise (duration)', () => {
    const cfg = universeConfig({ ticksPerDay: TPD });
    let s = createWorld('dur', cfg);
    const i10 = cfg.assets.findIndex((a) => a.id === 'AV30');
    const before = s.assets[i10]!.lnP;
    // force a yield shock: raise inflation sharply, the next day's curve moves up
    s = { ...s, rates: { ...s.rates!, inflation: 0.09 } };
    const r = stepMany(s, TPD + 1);
    const moved = r.state.assets[i10]!.lnP - before;
    expect(r.state.rates!.y30).toBeGreaterThan(s.rates!.y30);
    expect(moved).toBeLessThan(0);
  });

  it('a rate shock is news, not volatility: GARCH does not read it, with the ecology off too', () => {
    // a 2% yield jump on an 8.5-duration fund is a ~17% price move. Booked as diffusion it would drive GARCH h to its cap.
    const cfg = universeConfig({ ticksPerDay: TPD, ecology: undefined, worldEvents: undefined, catalysts: undefined, listings: undefined });
    const i10 = cfg.assets.findIndex((a) => a.id === 'AV10');
    const w = createWorld('garch-rate', cfg);
    const s = { ...w, rates: { ...w.rates!, inflation: 0.09 } };
    // the shock lands in the day that opens at tick TPD; GARCH first reads it at the next day boundary (tick 2 * TPD)
    const r = stepMany(s, 2 * TPD + 1).state;
    expect(r.assets[i10]!.h).toBeLessThan(2);
  });

  it('turning rates on leaves the bare-engine price streams of non-rate assets alone on day 0', () => {
    const base = defaultConfig({ ticksPerDay: TPD });
    const withRates = defaultConfig({ ticksPerDay: TPD, rates: DEFAULT_RATES });
    const a = stepMany(createWorld('same', base), TPD - 1).state;
    const b = stepMany(createWorld('same', withRates), TPD - 1).state;
    expect(b.assets.map((x) => x.lnP)).toEqual(a.assets.map((x) => x.lnP));
  });
});

describe('the game universe', () => {
  it('has the bible\'s breadth: 120 stocks in 12 sectors and 5 regions, 30 crypto (stables, majors, memes), FX, bonds and property', () => {
    const by = (c: string) => GAME_ASSETS.filter((a) => a.assetClass === c);
    expect(by('stock')).toHaveLength(120);
    expect(new Set(by('stock').map((a) => a.sector)).size).toBe(12);
    expect(new Set(by('stock').map((a) => a.region)).size).toBe(5);
    expect(by('crypto')).toHaveLength(30);
    expect(by('commodity').map((a) => a.id)).toEqual(expect.arrayContaining(['GOLD', 'OIL', 'CMPT', 'DATA', 'PWR']));
    expect(by('forex')).toHaveLength(4);
    expect(by('bond')).toHaveLength(5);
    expect(by('realestate').every((a) => a.listed === false)).toBe(true);
    expect(new Set(GAME_ASSETS.map((a) => a.id)).size).toBe(GAME_ASSETS.length);
  });

  it('runs a game day of the full universe quickly and stays finite', () => {
    const cfg = universeConfig();
    let s = createWorld('perf', cfg);
    const t0 = performance.now();
    s = stepMany(s, 720).state;
    const ms = performance.now() - t0;
    expect(s.assets.every((a) => Number.isFinite(a.lnP))).toBe(true);
    expect(ms / 720).toBeLessThan(5); // well under a millisecond per tick in practice
  });

  it('property indices refuse orders', () => {
    const s = openAccount(createWorld('re', universeConfig({ ticksPerDay: TPD })), 'p');
    const id = GAME_ASSETS.find((a) => a.assetClass === 'realestate')!.id;
    expect(placeOrder(s, { playerId: 'p', assetId: id, side: 'buy', type: 'market', qty: 1 }).order.rejectReason).toBe('not tradable');
  });
});

describe('market content (V1)', () => {
  it('stablecoins stay pinned near $1 for a game year', async () => {
    const { createWorld, stepMany, universeConfig } = await import('./index');
    const cfg = universeConfig({ ticksPerDay: 24 });
    const s = stepMany(createWorld('stable', cfg), 24 * 252).state;
    const i = cfg.assets.findIndex((a) => a.id === 'AUSD');
    const p = Math.exp(s.assets[i]!.lnP);
    expect(p).toBeGreaterThan(0.85);
    expect(p).toBeLessThan(1.05);
  }, 120_000);

  it('seasonal drift is a pure yearly cycle: zero over a full year, highest pull before the peak', async () => {
    const { seasonalDrift } = await import('./sim');
    const s = { amp: 0.12, peakDay: 0 };
    let sum = 0;
    for (let d = 0; d < 252; d++) sum += seasonalDrift(s, d * 10, 10, 252);
    expect(Math.abs(sum)).toBeLessThan(1e-9);
    expect(seasonalDrift(s, (252 - 63) * 10, 10, 252)).toBeGreaterThan(0); // a quarter before the peak: rising
    expect(seasonalDrift(s, 63 * 10, 10, 252)).toBeLessThan(0); // a quarter after: falling
  });
});
