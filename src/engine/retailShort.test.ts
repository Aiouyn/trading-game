/**
 * Shorting from R0 (the Retail license, cash-secured at 1x). The short's full notional is collateral on top of its proceeds:
 * buying power is the cash not already committed, so a short cannot exceed the cash and a later buy cannot spend the
 * proceeds. A margin call and a liquidation apply to a short account; a long-only 1x account is never called. The borrow
 * fee accrues daily on the short's value. Pro (2x) keeps its margin, and the fee comes out of buying power in both.
 */
import { describe, expect, it } from 'vitest';
import { createWorld, step, stepMany } from './sim';
import { DEFAULT_REGIMES, defaultConfig, normalizeLoadings } from './config';
import { DEFAULT_RATES } from './rates';
import { buyingPower, marginRuleApplies, openAccount, placeOrder, portfolio, setAccountPermissions } from './trading';
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

/** An account with $10,000 and the given permissions; the price of STK is set by the test. */
function world(perms: { maxLeverage?: number; canShort?: boolean }, rates = false): WorldState {
  const cfg = defaultConfig({ ticksPerDay: 10, regimes: calmRegimes(), assets: [flat('STK')], indices: [], ...(rates ? { rates: DEFAULT_RATES } : {}) });
  const w = openAccount(createWorld('retail-short', cfg), 'p1', 10000);
  return setAccountPermissions(w, 'p1', perms);
}

function setPrice(s: WorldState, id: string, price: number): WorldState {
  return { ...s, assets: s.assets.map((a) => (a.id === id ? { ...a, lnP: Math.log(price), lnV: Math.log(price) } : a)) };
}

function place(s: WorldState, req: Partial<OrderRequest>) {
  return placeOrder(s, { playerId: 'p1', assetId: 'STK', side: 'buy', type: 'market', qty: 1, ...req });
}

const RETAIL = { maxLeverage: 1, canShort: true };

describe('shorting from R0 (cash-secured at 1x)', () => {
  it('a short up to the cash is accepted; a short above it is refused for buying power', () => {
    expect(place(world(RETAIL), { side: 'sell', qty: 90 }).order.status).toBe('open');
    expect(place(world(RETAIL), { side: 'sell', qty: 101 }).order.rejectReason).toBe('insufficient buying power');
  });

  it('the full short notional is collateral: a later buy cannot spend the proceeds', () => {
    const s = step(place(world(RETAIL), { side: 'sell', qty: 50 }).state).state;
    // proceeds of $5,000 are in cash, but $5,000 of it is held back: buying power is the $10,000 equity less the $5,000 short
    expect(portfolio(s, 'p1').cash).toBeGreaterThan(14900);
    // equity (about $9,995 after the commission) less the $5,000 short: the collateral is not spendable
    expect(buyingPower(s, 'p1')).toBeGreaterThan(4900);
    expect(buyingPower(s, 'p1')).toBeLessThan(5000);
    // covering the 50 shares adds no exposure; going long past the cover adds it, and the proceeds cannot pay for it
    expect(place(s, { side: 'buy', qty: 50 }).order.status).toBe('open');
    expect(place(s, { side: 'buy', qty: 150 }).order.rejectReason).toBe('insufficient buying power');
    expect(place(s, { side: 'buy', qty: 149 }).order.status).toBe('open');
  });

  it('a margin call fires at 30% equity and the broker covers at 20%', () => {
    let s = step(place(world(RETAIL), { side: 'sell', qty: 50 }).state).state;
    // equity = cash - shares x price; the short is 50 shares: at 240 the ratio is under 30% but over 20%
    s = setPrice(s, 'STK', 240);
    const call = stepMany(s, 2);
    const kinds = (evs: StepEvent[]) => evs.map((e) => e.type);
    expect(kinds(call.events)).toContain('margin_call');
    expect(kinds(call.events)).not.toContain('liquidation');
    s = setPrice(call.state, 'STK', 270);
    const liq = stepMany(s, 2);
    expect(kinds(liq.events)).toContain('liquidation');
    expect(portfolio(liq.state, 'p1').positions).toHaveLength(0);
  });

  it('a long-only 1x account is never called, whatever the price does', () => {
    let s = step(place(world(RETAIL), { qty: 50 }).state).state;
    expect(marginRuleApplies(s.accounts.p1!)).toBe(false);
    s = setPrice(s, 'STK', 5);
    const out = stepMany(s, 3);
    expect(out.events.some((e) => e.type === 'margin_call' || e.type === 'liquidation')).toBe(false);
  });

  it('a 1x short account is subject to the margin rules; a Pro (2x) account keeps its margin', () => {
    const shorted = step(place(world(RETAIL), { side: 'sell', qty: 10 }).state).state;
    expect(marginRuleApplies(shorted.accounts.p1!)).toBe(true);
    // Pro: 2x equity of buying power, less the gross exposure (about $9,995 equity after the commission: 2 x 9,995 - 5,000)
    const pro = step(place(world({ maxLeverage: 2, canShort: true }), { qty: 50 }).state).state;
    expect(marginRuleApplies(pro.accounts.p1!)).toBe(true);
    expect(buyingPower(pro, 'p1')).toBeGreaterThan(14900);
    expect(buyingPower(pro, 'p1')).toBeLessThan(15000);
  });

  it('the fee comes out of buying power, so a 1x buy cannot spend its last dollar', () => {
    // $10,000 at 100 with a 0.10% commission (min $1): 99 shares is $9,900 + $9.90 fee, fits; 100 shares is $10,000 + fee, does not
    const s = world(RETAIL);
    expect(place(s, { qty: 99 }).order.status).toBe('open');
    expect(place(s, { qty: 100 }).order.rejectReason).toBe('insufficient buying power');
  });

  it('the borrow fee accrues daily on a short, and the account shows what it paid', () => {
    let s = step(place(world(RETAIL, true), { side: 'sell', qty: 50 }).state).state;
    expect(s.accounts.p1!.borrowPaid ?? 0).toBe(0);
    // ten ticks is one game day here (ticksPerDay 10): the daily finance runs at the new day
    s = stepMany(s, 12).state;
    expect(s.accounts.p1!.borrowPaid ?? 0).toBeGreaterThan(0);
  });
});
