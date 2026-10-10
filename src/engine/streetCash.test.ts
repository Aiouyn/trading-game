import { describe, expect, it } from 'vitest';
import { createWorld, stepMany } from './sim';
import { DEFAULT_REGIMES, defaultConfig, normalizeLoadings } from './config';
import { DEFAULT_OPTIONS, listedExpiries, optionChain } from './options';
import { placeOrder, portfolio, setAccountPermissions, tradeOption, openAccount } from './trading';
import type { AssetDef, Fill, RegimeDef, RegimeId, WorldState } from './types';

/**
 * The Street's side of a fill (O-3): an asset with no company book fills against the Street, which is not an account. The
 * engine keeps that side on each account as `streetCash`, commission included, so the world identity can read it. These
 * tests pin the Street tally to the trader's own cash on each path that has no counterparty account.
 */

const TPD = 10;

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

function world(extra: Parameters<typeof defaultConfig>[0] = {}): WorldState {
  const w = openAccount(createWorld('street', defaultConfig({ ticksPerDay: TPD, regimes: calmRegimes(), assets: [flat('STK')], indices: [], ...extra })), 'p1', 10000);
  return setAccountPermissions(w, 'p1', {});
}

/** The trader's cash from the fills alone: a buy pays notional and commission, a sell receives notional less commission. */
function cashOfFills(fills: Fill[], pid: string): number {
  return fills.filter((f) => f.playerId === pid).reduce((t, f) => t + (f.side === 'buy' ? -(f.qty * f.price + f.fee) : f.qty * f.price - f.fee), 0);
}

describe('the Street tally on an ordinary stock (O-3)', () => {
  it('a market buy and a market sell book the trader cash flow, commission included, as the Street tally', () => {
    let s = world();
    s = placeOrder(s, { playerId: 'p1', assetId: 'STK', side: 'buy', type: 'market', qty: 40 }).state;
    const r1 = stepMany(s, TPD);
    expect(r1.fills.filter((f) => f.playerId === 'p1').length).toBeGreaterThan(0);
    const street1 = r1.state.accounts.p1!.streetCash!;
    expect(street1).toBeCloseTo(cashOfFills(r1.fills, 'p1'), 6);
    expect(street1).toBeLessThan(0);

    s = placeOrder(r1.state, { playerId: 'p1', assetId: 'STK', side: 'sell', type: 'market', qty: 15 }).state;
    const r2 = stepMany(s, TPD);
    const street2 = r2.state.accounts.p1!.streetCash!;
    expect(street2 - street1).toBeCloseTo(cashOfFills(r2.fills, 'p1'), 6);
    expect(street2 - street1).toBeGreaterThan(0);
  });

  it('an account that never traded an ordinary stock has no Street tally (old snapshots read it as zero)', () => {
    const s = stepMany(world(), TPD).state;
    expect(s.accounts.p1!.streetCash).toBeUndefined();
  });

  it('an option premium is the Street tally: the buy premium out, the sell proceeds in, commissions included', () => {
    const cfg = { options: { ...DEFAULT_OPTIONS, underlyings: ['STK'] } };
    let s = setAccountPermissions(world(cfg), 'p1', { canOptions: true });
    const e = listedExpiries(s)[0]!;
    const call = optionChain(s, 'STK', e).find((r) => r.strike === 100)!.call;
    const buy = tradeOption(s, 'p1', call.id, 'buy', 2);
    expect(buy.error).toBeUndefined();
    s = buy.state;
    expect(s.accounts.p1!.streetCash).toBeCloseTo(-buy.fill!.total, 6);
    const sell = tradeOption(s, 'p1', call.id, 'sell', 1);
    expect(sell.error).toBeUndefined();
    s = sell.state;
    expect(s.accounts.p1!.streetCash).toBeCloseTo(-buy.fill!.total + sell.fill!.total, 6);
  });

  it('an option expiry payout is a Street payment: it moves the tally by the payout the event reports', () => {
    const cfg = { options: { ...DEFAULT_OPTIONS, underlyings: ['STK'] } };
    let s = setAccountPermissions(world(cfg), 'p1', { canOptions: true });
    const e = listedExpiries(s)[0]!;
    const call = optionChain(s, 'STK', e).find((r) => r.strike === 100)!.call;
    s = tradeOption(s, 'p1', call.id, 'buy', 1).state;
    const premiumTally = s.accounts.p1!.streetCash!;
    // spot above the strike at expiry: the call is in the money and the Street pays it out
    s = { ...s, assets: s.assets.map((a) => (a.id === 'STK' ? { ...a, lnP: Math.log(110), lnV: Math.log(110) } : a)) };
    const r = stepMany(s, (e + 2) * TPD - s.tick);
    const payouts = r.events.filter((x) => x.type === 'option_expiry' && x.playerId === 'p1').reduce((t, x) => t + (x.type === 'option_expiry' ? x.payout : 0), 0);
    expect(payouts).toBeGreaterThan(0);
    expect(r.state.accounts.p1!.streetCash! - premiumTally).toBeCloseTo(payouts, 6);
    expect(portfolio(r.state, 'p1').cash).toBeGreaterThan(0);
  });
});
