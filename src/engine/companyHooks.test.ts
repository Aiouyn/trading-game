import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createWorld, stepMany } from './sim';
import { DEFAULT_CATALYSTS, dayOfTick } from './catalysts';
import { DEFAULT_REGIMES, defaultConfig, normalizeLoadings } from './config';
import { COMPANY } from '@/content/company';
import { DEFAULT_COMPANY_RULES } from './restrictions';
import { contractId } from './options';
import { ecologyLog } from './ecology';
import { delist } from './listings';
import {
  grantLockedShares, listCompanyStock, printCompanyValue, tenderOffer, vwap30,
} from './companyAssets';
import { addBuyback, cancelPlan, commitPlan, editPlan, programsDay } from './programs';
import { lockedQty, restrictionsOf, setLockup, setWindow } from './restrictions';
import { cancelOrder, modifyOrder, openAccount, placeOrder, setAccountPermissions, tradeOption } from './trading';
import type { AssetDef, Fill, RegimeDef, RegimeId, StepEvent, WorldState } from './types';

const TPD = 10;

function calmRegimes(): Record<RegimeId, RegimeDef> {
  const out = {} as Record<RegimeId, RegimeDef>;
  for (const [id, r] of Object.entries(DEFAULT_REGIMES) as [RegimeId, RegimeDef][]) {
    out[id] = { ...r, equityDrift: 0, volMult: 1, jumpMult: 1, jumpUpShift: 0, marketLoadMult: 1, idioMult: 1, meanDays: 1e12 };
  }
  return out;
}

/** a nearly frozen stock, so tests control the price by editing state */
function flat(id: string, extra: Partial<AssetDef> = {}): AssetDef {
  return normalizeLoadings({
    id, name: id, assetClass: 'stock', sector: 'x', initialPrice: 100, sharesOutstanding: 1e6,
    vol: 1e-7, drift: 0, cycleBeta: 0, wMarket: 0.5, wSector: 0.5, wCrypto: 0,
    halfLifeDays: 1e9, jumpsPerYear: 0, jumpUpMean: 0.04, jumpDownMean: 0.06, jumpUpProb: 0.5,
    floor: 0.01, circuitBreaker: false, spreadBps: 10, advNotional: 1e9, qtyStep: 1, ...extra,
  });
}

/** a company stock: value moves only through prints; the same frozen price unless a test gives it vol */
function coStock(id: string, extra: Partial<AssetDef> = {}): AssetDef {
  return flat(id, { valueSource: 'company', ...extra });
}

function world(assets: AssetDef[], extra: Parameters<typeof defaultConfig>[0] = {}, seed = 't'): WorldState {
  return createWorld(seed, defaultConfig({ ticksPerDay: TPD, regimes: calmRegimes(), assets, indices: [], ...extra }));
}

const run = (s: WorldState, n: number): WorldState => stepMany(s, n).state;
const runAll = (s: WorldState, n: number) => stepMany(s, n);
const idx = (s: WorldState, id: string) => s.config.assets.findIndex((a) => a.id === id);
const lnPOf = (s: WorldState, id: string) => s.assets[idx(s, id)]!.lnP;
const lnVOf = (s: WorldState, id: string) => s.assets[idx(s, id)]!.lnV;
const cashOf = (s: WorldState, id: string) => s.accounts[id]!.cash;
const heldOf = (s: WorldState, pid: string, id: string) => s.accounts[pid]?.positions[id]?.qty ?? 0;
/** the session at day d: the state whose next tick opens day d */
const atDay = (s: WorldState, d: number) => run(s, d * TPD - s.tick);
const sha = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');

describe('bare engine is unchanged', () => {
  it('a world with no company stocks and no restrictions steps to the same state as before the company hooks', () => {
    // digests taken from the engine before the company hooks (src/engine at 76e4b0a): gameConfig and gameConfig with
    // the full ecology, both with one order and a sell, 3 + 2 game days
    const cfg = defaultConfig({ ticksPerDay: 720, catalysts: DEFAULT_CATALYSTS });
    const id = cfg.assets[0]!.id;
    let s = openAccount(createWorld('bare-1', cfg), 'p1');
    s = placeOrder(s, { playerId: 'p1', assetId: id, side: 'buy', type: 'market', qty: 5 }).state;
    s = stepMany(s, 720 * 3).state;
    s = placeOrder(s, { playerId: 'p1', assetId: id, side: 'sell', type: 'market', qty: 2 }).state;
    s = stepMany(s, 720 * 2).state;
    const eco = defaultConfig({ ticksPerDay: 720, catalysts: DEFAULT_CATALYSTS, ecology: { mode: 'full' } });
    let e = openAccount(createWorld('bare-2', eco), 'p1');
    e = placeOrder(e, { playerId: 'p1', assetId: id, side: 'buy', type: 'market', qty: 5 }).state;
    e = stepMany(e, 720 * 2).state;
    expect(sha(s)).toBe('61f445d2d39954626952ba005b7059361efe4a5ef931a94d8b4ba15de7311726');
    expect(sha(e)).toBe('e80f9cd00f42cbc14f9af5d55817999b6dc7146e0e194d2c3ea2eea9e5d0846d');
  });
});

describe('hook 1: a company stock moves only through prints', () => {
  it('lnV is still while the price diffuses, and a print moves it by exactly the print', () => {
    let s = world([coStock('CO', { vol: 0.4, jumpsPerYear: 300 }), flat('STK', { vol: 0.4, jumpsPerYear: 300 })]);
    const v0 = lnVOf(s, 'CO');
    const p0 = lnPOf(s, 'CO');
    const stk0 = lnVOf(s, 'STK');
    const events: StepEvent[] = [];
    for (let k = 0; k < 400; k++) {
      const r = stepMany(s, 1);
      s = r.state;
      events.push(...r.events);
    }
    expect(lnVOf(s, 'CO')).toBe(v0);
    expect(lnPOf(s, 'CO')).not.toBe(p0); // the price does move
    expect(lnVOf(s, 'STK')).not.toBe(stk0); // an ordinary stock's value does
    expect(events.some((e) => e.type === 'jump' && e.assetId === 'CO')).toBe(false); // no jumps on a company stock
    expect(events.some((e) => e.type === 'jump' && e.assetId === 'STK')).toBe(true);
    s = printCompanyValue(s, 'CO', 0.1);
    const printed = run(s, 1);
    expect(lnVOf(printed, 'CO') - v0).toBeCloseTo(0.1, 12);
    expect(lnVOf(run(printed, 60), 'CO') - v0).toBeCloseTo(0.1, 12); // and nothing else moves it afterwards
  });

  it('the price takes the print in full at once (companyPrintShare 1), and half with 0.5', () => {
    const a = world([coStock('CO')]);
    const b = printCompanyValue(a, 'CO', 0.1);
    const pa = run(a, 1);
    const pb = run(b, 1);
    expect(lnPOf(pb, 'CO') - lnPOf(pa, 'CO')).toBeCloseTo(0.1, 12);
    const half = world([coStock('CO', { companyPrintShare: 0.5 })]);
    const ph = run(printCompanyValue(half, 'CO', 0.1), 1);
    expect(lnPOf(ph, 'CO') - lnPOf(run(half, 1), 'CO')).toBeCloseTo(0.05, 12);
    expect(lnVOf(ph, 'CO') - lnVOf(run(half, 1), 'CO')).toBeCloseTo(0.1, 12); // the value takes all of it
  });

  it('the ecology close prints a company print through the value pool at its share', () => {
    const cfg = defaultConfig({ ticksPerDay: TPD, regimes: calmRegimes(), assets: [coStock('CO'), flat('STK')], indices: [], ecology: { mode: 'full' } });
    let s = createWorld('eco-co', cfg);
    s = stepMany(s, 3).state;
    s = printCompanyValue(s, 'CO', 0.1);
    s = stepMany(s, TPD - 3).state; // to the close of day 0
    const day0 = ecologyLog(s).find((d) => d.day === 0)!;
    const co = day0.assets.find((a) => a.id === 'CO')!;
    const stk = day0.assets.find((a) => a.id === 'STK')!;
    expect(co.cause.news).toBeCloseTo(0.1, 6);
    expect(stk.cause.news).toBe(0);
  });

  it('no catalysts and no options for a company stock; an ordinary stock still gets them', () => {
    const cfg = defaultConfig({
      ticksPerDay: TPD, regimes: calmRegimes(), catalysts: DEFAULT_CATALYSTS, indices: [],
      assets: [coStock('CO'), flat('STK')],
      options: { underlyings: ['CO', 'STK'], expiryEvery: 5, expiries: 3, strikeSteps: [0.9, 1, 1.1], multiplier: 100, halfSpread: 0.02, minHalfSpread: 0.01, feePerContract: 1 },
    });
    let s = openAccount(createWorld('cat', cfg), 'p1');
    s = setAccountPermissions(s, 'p1', { canOptions: true });
    const events: StepEvent[] = [];
    for (let k = 0; k < 1400; k++) {
      const r = stepMany(s, 1);
      s = r.state;
      events.push(...r.events);
    }
    const reports = (id: string) => events.filter((e) => (e.type === 'earnings' || e.type === 'preview' || e.type === 'rumor') && 'assetId' in e && e.assetId === id).length;
    expect(reports('STK')).toBeGreaterThan(0);
    expect(reports('CO')).toBe(0);
    const c = contractId({ underlying: 'CO', kind: 'call', strike: 100, expiryDay: 10 });
    expect(tradeOption(s, 'p1', c, 'buy', 1).error).toBe('no listed options on company stock');
  });
});

describe('hook 2: IPO listing and delisting', () => {
  it('appends a company stock at the IPO price with its value per share, and keeps the ecology arrays aligned', () => {
    const cfg = defaultConfig({ ticksPerDay: TPD, regimes: calmRegimes(), assets: [flat('STK')], indices: [], ecology: { mode: 'full' } });
    let s = createWorld('ipo', cfg);
    s = stepMany(s, 5).state;
    const def = coStock('NEW', { sharesOutstanding: 4e5, sector: 'x' });
    const n = listCompanyStock(s, def, 90, 100);
    expect(n.config.assets.length).toBe(2);
    expect(n.assets.length).toBe(2);
    expect(n.ecology!.assets.length).toBe(2);
    expect(Math.exp(lnPOf(n, 'NEW'))).toBeCloseTo(90, 9);
    expect(Math.exp(lnVOf(n, 'NEW'))).toBeCloseTo(100, 9);
    expect(n.config.assets[1]!.listedDay).toBe(dayOfTick(5, TPD));
    expect(() => listCompanyStock(s, flat('X'), 90, 100)).toThrow(/not a company stock/);
    expect(() => listCompanyStock(s, def, 90, 100)).not.toThrow();
  });

  it('delisting settles every holder at the price in cash and removes the stock', () => {
    let s = openAccount(world([coStock('CO'), flat('STK')]), 'p1');
    s = openAccount(s, 'p2');
    s = grantLockedShares(s, 'p1', 'CO', 10, 100, 0);
    s = grantLockedShares(s, 'p2', 'CO', 4, 100, 0);
    const before = cashOf(s, 'p1') + cashOf(s, 'p2');
    const next = delist(s, idx(s, 'CO'), 80);
    expect(cashOf(next, 'p1') - cashOf(s, 'p1')).toBeCloseTo(800, 9);
    expect(cashOf(next, 'p2') - cashOf(s, 'p2')).toBeCloseTo(320, 9);
    expect(cashOf(next, 'p1') + cashOf(next, 'p2') - before).toBeCloseTo(80 * 14, 9); // money conserved against the settlement
    expect(next.config.assets[idx(s, 'CO')]!.delisted).toBe(true);
    expect(heldOf(next, 'p1', 'CO')).toBe(0);
  });
});

describe('hook 3: trading windows and lockups', () => {
  function windowed(): WorldState {
    let s = world([coStock('CO'), flat('STK')]);
    s = openAccount(s, 'p1');
    s = openAccount(s, 'p2');
    s = { ...s, restrictions: setWindow(restrictionsOf(s), 'CO', { covered: ['p1'], open: [[5, 20]] }) };
    return s;
  }

  it('a covered account is refused outside its window with closedWindow and the next open day', () => {
    const s = atDay(windowed(), 3);
    const r = placeOrder(s, { playerId: 'p1', assetId: 'CO', side: 'buy', type: 'market', qty: 1 });
    expect(r.order.status).toBe('rejected');
    expect(r.order.rejectReason).toBe('closedWindow');
    expect(r.order.rejectUntil).toBe(5);
    const ok = placeOrder(s, { playerId: 'p2', assetId: 'CO', side: 'buy', type: 'market', qty: 1 });
    expect(ok.order.status).toBe('open'); // not covered: never checked
  });

  it('accepted inside the window, with windowClosing in the last five open days', () => {
    const early = placeOrder(atDay(windowed(), 14), { playerId: 'p1', assetId: 'CO', side: 'buy', type: 'market', qty: 1 });
    expect(early.order.status).toBe('open');
    expect(early.warning).toBeUndefined();
    const late = placeOrder(atDay(windowed(), 16), { playerId: 'p1', assetId: 'CO', side: 'buy', type: 'market', qty: 1 });
    expect(late.order.status).toBe('open');
    expect(late.warning).toEqual({ code: 'windowClosing', closesDay: 20 });
  });

  it('an open covered order is cancelled at the first tick after its window shuts, and that is recorded', () => {
    const s = atDay(windowed(), 14);
    const placed = placeOrder(s, { playerId: 'p1', assetId: 'CO', side: 'buy', type: 'limit', limitPrice: 1, qty: 1 }).state;
    // the tick before day 21 is still open (the last open tick is the close of day 20); the first tick of day 21 cancels
    const last = runAll(placed, 21 * TPD - s.tick);
    expect(last.state.orders.find((o) => o.playerId === 'p1' && o.assetId === 'CO')!.status).toBe('open');
    const after = runAll(last.state, 1);
    const order = after.state.orders.find((o) => o.playerId === 'p1' && o.assetId === 'CO')!;
    expect(order.status).toBe('cancelled');
    expect(order.rejectReason).toBe('closedWindow');
    expect(after.events).toContainEqual(expect.objectContaining({ type: 'restricted', code: 'closedWindow', playerId: 'p1' }));
  });

  it('a sell outside the window is refused; a lockup refuses sells until its day and not buys', () => {
    let s = windowed();
    s = grantLockedShares(s, 'p1', 'CO', 10, 100, 30);
    const inWin = placeOrder(atDay(s, 14), { playerId: 'p1', assetId: 'CO', side: 'sell', type: 'market', qty: 5 });
    expect(inWin.order.rejectReason).toBe('lockup');
    expect(inWin.order.rejectUntil).toBe(30);
    const buy = placeOrder(atDay(s, 14), { playerId: 'p1', assetId: 'CO', side: 'buy', type: 'market', qty: 1 });
    expect(buy.order.status).toBe('open');
    const out = placeOrder(atDay(s, 3), { playerId: 'p1', assetId: 'CO', side: 'sell', type: 'market', qty: 5 });
    expect(out.order.rejectReason).toBe('closedWindow');
  });

  it('options on a covered stock are refused while its window is closed', () => {
    const cfg = defaultConfig({
      ticksPerDay: TPD, regimes: calmRegimes(), assets: [flat('CO'), flat('STK')], indices: [],
      options: { underlyings: ['CO'], expiryEvery: 5, expiries: 3, strikeSteps: [1], multiplier: 100, halfSpread: 0.02, minHalfSpread: 0.01, feePerContract: 1 },
    });
    let s = openAccount(createWorld('opt', cfg), 'p1');
    s = setAccountPermissions(s, 'p1', { canOptions: true });
    s = { ...s, restrictions: setWindow(restrictionsOf(s), 'CO', { covered: ['p1'], open: [[5, 20]] }) };
    const c = contractId({ underlying: 'CO', kind: 'call', strike: 100, expiryDay: 30 });
    expect(tradeOption(atDay(s, 3), 'p1', c, 'buy', 1).error).toBe('closedWindow');
  });
});

describe('hook 4: sell-only plans with escrow', () => {
  function withHolding(): WorldState {
    let s = world([coStock('CO'), flat('STK')]);
    s = openAccount(s, 'p1');
    return grantLockedShares(s, 'p1', 'CO', 100, 100, 0);
  }
  const plan = (over: Partial<Parameters<typeof commitPlan>[1]> = {}) => ({
    id: 'pl1', playerId: 'p1', assetId: 'CO', side: 'sell' as const, qtyPerDay: 10, days: [70, 71, 72], minPrice: 50, ...over,
  });

  it('refuses every commit the v1.7 rules forbid, and changes nothing', () => {
    const s = withHolding();
    expect(commitPlan(s, plan({ side: 'buy' as never })).reject).toEqual({ code: 'planSellOnly' });
    expect(commitPlan(s, plan({ days: [30, 31] })).reject).toEqual({ code: 'planTooSoon', earliestDay: 63 });
    const high = commitPlan(s, plan({ minPrice: 90 })).reject;
    expect(high?.code).toBe('planFloorTooHigh');
    expect((high as { maxFloor: number }).maxFloor).toBeCloseTo(80, 6);
    expect(commitPlan(s, plan({ qtyPerDay: 60 })).reject).toEqual({ code: 'planUnfunded', shortfall: 80 });
    const withLock = { ...s, restrictions: setLockup(restrictionsOf(s), 'CO', 'p1', 75) };
    expect(commitPlan(withLock, plan()).reject).toEqual({ code: 'planInLockup' });
    const banned = { ...s, restrictions: { ...restrictionsOf(s), bans: { p1: 500 } } };
    expect(commitPlan(banned, plan()).reject).toEqual({ code: 'planBanned', untilDay: 500 });
    const ok = commitPlan(s, plan());
    expect(ok.reject).toBeUndefined();
    expect(commitPlan(ok.state, plan({ id: 'pl1' })).reject).toEqual({ code: 'planExists' });
  });

  it('allows at most two live plans per account and asset, and a plan is immutable once committed', () => {
    let s = withHolding();
    s = commitPlan(s, plan({ id: 'a', qtyPerDay: 5 })).state;
    s = commitPlan(s, plan({ id: 'b', qtyPerDay: 5 })).state;
    expect(commitPlan(s, plan({ id: 'c', qtyPerDay: 5 })).reject).toEqual({ code: 'planLimit' });
    expect(editPlan(s).reject).toEqual({ code: 'planImmutable' });
    expect(cancelPlan(s).reject).toEqual({ code: 'planImmutable' });
    expect(editPlan(s).state).toBe(s);
  });

  it('locks the plan quantity: manual sells cannot touch escrow, and a plan sells out of its escrow only', () => {
    let s = commitPlan(withHolding(), plan()).state;
    expect(lockedQty(restrictionsOf(s), 'p1', 'CO', 0)).toBe(30);
    expect(placeOrder(s, { playerId: 'p1', assetId: 'CO', side: 'sell', type: 'market', qty: 71 }).order.rejectReason).toBe('stacking');
    expect(placeOrder(s, { playerId: 'p1', assetId: 'CO', side: 'sell', type: 'market', qty: 70 }).order.status).toBe('open');
    // a plan order cannot buy, through any route
    const buy = placeOrder(s, { playerId: 'p1', assetId: 'CO', side: 'buy', type: 'market', qty: 1, program: 'pl1' });
    expect(buy.order.rejectReason).toBe('planSellOnly');
    // day 70: the plan sells its 10 and its escrow falls by the same amount
    s = atDay(s, 70);
    s = programsDay(s).state;
    s = run(s, 1);
    expect(heldOf(s, 'p1', 'CO')).toBe(90);
    expect(restrictionsOf(s).programs.pl1!.escrow).toBe(20);
    // escrowed shares are sold once: the 20 still locked cannot be sold outside the plan
    expect(placeOrder(s, { playerId: 'p1', assetId: 'CO', side: 'sell', type: 'market', qty: 71 }).order.rejectReason).toBe('stacking');
    expect(placeOrder(s, { playerId: 'p1', assetId: 'CO', side: 'sell', type: 'market', qty: 70 }).order.status).toBe('open');
  });

  it('skips a day on price (held to the end day + 63), releases a halt, and completes on the last day', () => {
    let s = commitPlan(withHolding(), plan()).state;
    s = atDay(s, 70);
    s = run(programsDay(s).state, 1);
    s = atDay(s, 71);
    s = { ...s, assets: s.assets.map((a) => (a.id === 'CO' ? { ...a, lnP: Math.log(40) } : a)) };
    const skipped = programsDay(s);
    expect(skipped.events).toContainEqual(expect.objectContaining({ type: 'planSkipped', reason: 'price', qty: 10 }));
    s = skipped.state;
    // the skipped 10 are held to the end day (72) + 63; the 10 for day 72 stay in escrow until that day runs
    expect(lockedQty(restrictionsOf(s), 'p1', 'CO', 71)).toBe(20);
    expect(lockedQty(restrictionsOf(s), 'p1', 'CO', 72 + 63)).toBe(20);
    expect(lockedQty(restrictionsOf(s), 'p1', 'CO', 72 + 64)).toBe(10);
    s = atDay(s, 72);
    s = { ...s, assets: s.assets.map((a) => (a.id === 'CO' ? { ...a, lnP: Math.log(100) } : a)) };
    const done = stepMany(programsDay(s).state, 1);
    expect(done.events).toContainEqual(expect.objectContaining({ type: 'planEnded', reason: 'completed' }));
    expect(restrictionsOf(done.state).programs.pl1!.escrow).toBe(0);
    expect(lockedQty(restrictionsOf(done.state), 'p1', 'CO', 72 + 64)).toBe(0);
  });

  it('a halt at the open releases the day (no price hold)', () => {
    let s = commitPlan(withHolding(), plan()).state;
    s = atDay(s, 70);
    s = { ...s, assets: s.assets.map((a) => (a.id === 'CO' ? { ...a, haltUntil: s.tick + 1000 } : a)) };
    const out = programsDay(s);
    expect(out.events).toContainEqual(expect.objectContaining({ type: 'planSkipped', reason: 'halt', qty: 10 }));
    expect(restrictionsOf(out.state).programs.pl1!.priceHold).toBe(0);
    expect(restrictionsOf(out.state).programs.pl1!.escrow).toBe(20);
  });

  it('a plan runs through a closed window (the one exception to the window)', () => {
    let s = withHolding();
    s = { ...s, restrictions: setWindow(restrictionsOf(s), 'CO', { covered: ['p1'], open: [[5, 20]] }) };
    s = commitPlan(s, plan()).state;
    s = atDay(s, 70); // the window is closed on day 70
    s = run(programsDay(s).state, 1);
    expect(heldOf(s, 'p1', 'CO')).toBe(90);
  });
});

describe('hook 5: buybacks', () => {
  function treasury(): WorldState {
    let s = world([coStock('CO'), flat('STK')]);
    s = openAccount(s, 'T', 1e6);
    return { ...s, restrictions: setWindow(restrictionsOf(s), 'CO', { covered: ['T'], open: [[5, 20]] }) };
  }

  it('refuses a program over 1% of float a day, and any day outside the treasury window', () => {
    const s = treasury();
    expect(addBuyback(s, { id: 'bb', playerId: 'T', assetId: 'CO', qtyPerDay: 20, days: [5], floatShares: 1000 }).reject)
      .toEqual({ code: 'buybackTooLarge', maxPerDay: 10 });
    expect(addBuyback(s, { id: 'bb', playerId: 'T', assetId: 'CO', qtyPerDay: 10, days: [3, 4], floatShares: 1000 }).reject)
      .toEqual({ code: 'closedWindow', untilDay: 5 });
    expect(addBuyback(s, { id: 'bb', playerId: 'T', assetId: 'CO', qtyPerDay: 10, days: [5, 6, 7], floatShares: 1000 }).reject).toBeUndefined();
  });

  it('buys its fixed quantity on each scheduled day inside the window, paid from treasury cash, conserving cash', () => {
    let s = addBuyback(treasury(), { id: 'bb', playerId: 'T', assetId: 'CO', qtyPerDay: 10, days: [5, 6], floatShares: 1000 }).state;
    const cash0 = cashOf(atDay(s, 5), 'T');
    const fills: Fill[] = [];
    for (const d of [5, 6]) {
      s = programsDay(atDay(s, d)).state;
      const r = runAll(s, TPD);
      s = r.state;
      fills.push(...r.fills);
    }
    const spent = fills.filter((f) => f.playerId === 'T').reduce((x, f) => x + f.qty * f.price + f.fee, 0);
    expect(heldOf(s, 'T', 'CO')).toBe(20);
    expect(cashOf(s, 'T')).toBeCloseTo(cash0 - spent, 6);
  });

  it('a buy outside the window is refused for the treasury like any covered order', () => {
    const s = atDay(treasury(), 3);
    expect(placeOrder(s, { playerId: 'T', assetId: 'CO', side: 'buy', type: 'market', qty: 1 }).order.rejectReason).toBe('closedWindow');
  });
});

describe('hook 6: takeover tender', () => {
  function setup(): WorldState {
    let s = world([coStock('CO'), flat('STK')]);
    s = openAccount(s, 'p1');
    s = openAccount(s, 'p2');
    s = openAccount(s, 'p4', 1e6);
    s = openAccount(s, 'p5', 100);
    s = grantLockedShares(s, 'p1', 'CO', 10, 100, 0);
    s = grantLockedShares(s, 'p2', 'CO', 5, 100, 0);
    s = openAccount(s, 'p3', 100000);
    s = setAccountPermissions(s, 'p3', { canShort: true, maxLeverage: 2 });
    s = run(placeOrder(s, { playerId: 'p3', assetId: 'CO', side: 'sell', type: 'market', qty: 3 }).state, 1);
    return s;
  }

  it('refuses a price below 1.2 x VWAP30', () => {
    const s = setup();
    const r = tenderOffer(s, 'CO', 110, 'p4');
    expect(r.reject).toEqual({ code: 'tenderBelowFloor', floor: expect.any(Number) });
    expect((r.reject as { floor: number }).floor).toBeCloseTo(120, 3);
    expect(r.state).toBe(s);
  });

  it('settles every holder at one price (long, short and a plan) and conserves cash across all accounts', () => {
    let s = setup();
    s = commitPlan(s, { id: 'pl', playerId: 'p1', assetId: 'CO', side: 'sell', qtyPerDay: 2, days: [70, 71], minPrice: 50 }).state;
    const accts = ['p1', 'p2', 'p3', 'p4'];
    const before = Object.fromEntries(accts.map((p) => [p, cashOf(s, p)]));
    const t = tenderOffer(s, 'CO', 125, 'p4');
    expect(t.reject).toBeUndefined();
    const next = t.state;
    expect(cashOf(next, 'p1') - before.p1!).toBeCloseTo(10 * 125, 6);
    expect(cashOf(next, 'p2') - before.p2!).toBeCloseTo(5 * 125, 6);
    expect(cashOf(next, 'p3') - before.p3!).toBeCloseTo(-3 * 125, 6);
    const net = accts.reduce((x, p) => x + (cashOf(next, p) - before[p]!), 0);
    expect(net).toBeCloseTo(0, 6); // money conserved: the bidder paid what the holders received
    expect(next.config.assets[idx(next, 'CO')]!.delisted).toBe(true);
    for (const p of accts) expect(heldOf(next, p, 'CO')).toBe(0);
    expect(restrictionsOf(next).programs.pl!.ended?.reason).toBe('tender');
    expect(restrictionsOf(next).programs.pl!.escrow).toBe(0);
    expect(t.events).toContainEqual(expect.objectContaining({ type: 'listing', kind: 'merger', assetId: 'CO', price: 125 }));
    expect(t.events).toContainEqual(expect.objectContaining({ type: 'planEnded', reason: 'tender' }));
  });

  it('refuses a bidder that cannot pay, and the floor uses VWAP30 once there is volume', () => {
    const s = setup();
    const poor = tenderOffer(s, 'CO', 125, 'p5');
    expect(poor.reject?.code).toBe('tenderUnfunded');
    const v = run(s, 3 * TPD);
    const vw = vwap30(v, 'CO');
    expect(vw).not.toBeNull();
    expect(tenderOffer(v, 'CO', 1.2 * vw! - 0.01, 'p4').reject?.code).toBe('tenderBelowFloor');
    expect(tenderOffer(v, 'CO', 1.2 * vw! + 0.01, 'p4').reject).toBeUndefined();
  });
});

describe('determinism: a save mid-plan continues exactly', () => {
  it('JSON round-trip mid-plan gives the same state after the plan runs', () => {
    let s = openAccount(world([coStock('CO', { vol: 0.2 })]), 'p1');
    s = grantLockedShares(s, 'p1', 'CO', 100, 100, 0);
    s = commitPlan(s, { id: 'pl', playerId: 'p1', assetId: 'CO', side: 'sell', qtyPerDay: 5, days: [70, 71, 72], minPrice: 50 }).state;
    s = atDay(s, 70);
    s = run(programsDay(s).state, 1);
    const copy = JSON.parse(JSON.stringify(s)) as WorldState;
    const play = (x: WorldState) => {
      let y = x;
      for (const d of [71, 72]) {
        y = programsDay(atDay(y, d)).state;
        y = run(y, TPD);
      }
      return y;
    };
    expect(sha(play(copy))).toBe(sha(play(s)));
    expect(heldOf(play(copy), 'p1', 'CO')).toBe(85);
  });
});

describe('restrictions do not touch unrelated accounts or assets', () => {
  it('an uncovered account trades a company stock normally in a closed window', () => {
    let s = world([coStock('CO'), flat('STK')]);
    s = openAccount(s, 'p2');
    s = { ...s, restrictions: setWindow(restrictionsOf(s), 'CO', { covered: ['p1'], open: [[50, 60]] }) };
    expect(placeOrder(s, { playerId: 'p2', assetId: 'CO', side: 'buy', type: 'market', qty: 1 }).order.status).toBe('open');
    expect(placeOrder(s, { playerId: 'p2', assetId: 'STK', side: 'buy', type: 'market', qty: 1 }).order.status).toBe('open');
  });
});

describe('program orders are the engine\'s alone (no route around a plan or a window)', () => {
  function planned(): WorldState {
    let s = openAccount(world([coStock('CO'), flat('STK')]), 'p1');
    s = grantLockedShares(s, 'p1', 'CO', 100, 100, 0);
    s = { ...s, restrictions: setWindow(restrictionsOf(s), 'CO', { covered: ['p1'], open: [[5, 20]] }) };
    return commitPlan(s, { id: 'pl1', playerId: 'p1', assetId: 'CO', side: 'sell', qtyPerDay: 10, days: [70, 71], minPrice: 50 }).state;
  }

  it('a manual order carrying a plan id is refused on the ordinary route, so the window exception stays with the plan', () => {
    const s = atDay(planned(), 3); // the covered window is closed on day 3
    const sneaky = placeOrder(s, { playerId: 'p1', assetId: 'CO', side: 'sell', type: 'market', qty: 10, program: 'pl1' });
    expect(sneaky.order.status).toBe('rejected');
    expect(sneaky.order.rejectReason).toBe('programOrderReserved');
    expect(heldOf(run(sneaky.state, 2), 'p1', 'CO')).toBe(100);
  });

  it('a plan order cannot be cancelled or re-priced below its floor by its owner', () => {
    let s = atDay(planned(), 70);
    s = programsDay(s).state;
    const id = s.orders.find((o) => o.program === 'pl1')!.id;
    expect(cancelOrder(s, 'p1', id)).toBe(s);
    expect(modifyOrder(s, 'p1', id, { limitPrice: 1 }).error).toBe('planImmutable');
  });

  it('a plan order sells only at or above its minimum price, even after the open', () => {
    let s = atDay(planned(), 70);
    s = programsDay(s).state;
    s = { ...s, assets: s.assets.map((a) => (a.id === 'CO' ? { ...a, lnP: Math.log(40), lnV: Math.log(40) } : a)) };
    const r = runAll(s, TPD - 1);
    expect(heldOf(r.state, 'p1', 'CO')).toBe(100); // not sold below 50
    expect(r.state.orders.find((o) => o.program === 'pl1')!.status).toBe('open');
  });
});

describe('the trading rules: content is the source, the engine defaults match it, and a world can override them', () => {
  it('engine defaults equal the content values', () => {
    expect(DEFAULT_COMPANY_RULES).toEqual(COMPANY.trading);
  });

  it('a world config override changes the plan lead', () => {
    const base = openAccount(world([coStock('CO')]), 'p1');
    const withAcct = grantLockedShares(base, 'p1', 'CO', 10, 100, 0);
    const plan = { id: 'x', playerId: 'p1', assetId: 'CO', side: 'sell' as const, qtyPerDay: 1, days: [20], minPrice: 50 };
    expect(commitPlan(withAcct, plan).reject?.code).toBe('planTooSoon');
    const relaxed = { ...withAcct, config: { ...withAcct.config, companyRules: { planLeadDays: 10 } } };
    expect(commitPlan(relaxed, plan).reject).toBeUndefined();
  });
});
