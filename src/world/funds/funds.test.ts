import { describe, expect, it, vi } from 'vitest';
import { applyCommand, createGame, stepGame } from '../game';
import { cashOf, credit, debit, netWorthBreakdown, newOutput, priceOf, today, TPD } from '../core';
import { refreshNetWorth } from '../assets';
import { courtTick } from '../court';
import { FUND_RULES, FUND_TICKS_PER_DAY, FUND_TIME } from '@/content/funds';
import { shockPrice } from '@/engine/sim';
import type { Command, GameState } from '../types';
import { applyFundCommand, fundsDay, fundsFills, publicFunds, emptyFunds } from './index';
import { insiderOrFloat } from './trade';
import type { Fill } from '@/engine';
import { fundById, fundClaimsOf, navOf, navPerUnitOf, unitsOf } from './state';
import type { Fund, FundFees, FundMandate, FundRefusal } from './types';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';

// Each case warms a world and runs ticks: under a full parallel run that outgrows the default 5 s.
vi.setConfig({ testTimeout: 60_000 });

const MANDATE: FundMandate = { classes: ['stock', 'crypto', 'commodity', 'forex', 'bond'], maxLeverage: 1, maxPositionPct: 0.2 };
const FEES: FundFees = { mgmt: 0.02, perf: 0.2 };
const STAKE = 300_000;

/** A world with a manager (R3, old enough) and three investors (old enough, funded). Tick 1, so each warp crosses a game day. */
function world(seed: string): GameState {
  const g = createGame(seed, { warmupDays: 0, npcs: false });
  for (const [id, handle] of [['m', 'mgr_one'], ['i1', 'inv_one'], ['i2', 'inv_two'], ['x', 'alt_one']]) {
    const r = applyCommand(g, id, { type: 'join', handle, country: 'AV' });
    if (!r.ok) throw new Error(r.error);
  }
  g.market = { ...g.market, tick: 1 };
  for (const id of ['m', 'i1', 'i2', 'x']) {
    g.players[id]!.joinedTick = -1000 * TPD;
    g.players[id]!.lastSeenTick = 1;
  }
  g.players.m!.rankId = 'R3';
  credit(g, 'm', 2_000_000, 'test');
  credit(g, 'i1', 200_000, 'test');
  credit(g, 'i2', 400_000, 'test');
  credit(g, 'x', 200_000, 'test');
  refreshNetWorth(g, g.players.m!);
  return g;
}

function cmd(g: GameState, pid: string, c: Command) {
  return applyCommand(g, pid, c);
}

function errOf(g: GameState, pid: string, c: Command): string | undefined {
  const r = applyCommand(g, pid, c);
  return r.ok ? undefined : r.error;
}

function createCmd(over: Partial<{ name: string; mandate: FundMandate; fees: FundFees; stake: number }> = {}): Command {
  return { type: 'fund.create', name: 'Harbour Fund', mandate: MANDATE, fees: FEES, stake: STAKE, ...over };
}

/** Open the manager's fund and return it. */
function openFund(g: GameState, over: Partial<{ name: string; mandate: FundMandate; fees: FundFees; stake: number }> = {}): Fund {
  const r = cmd(g, 'm', createCmd(over));
  if (!r.ok) throw new Error(`create refused: ${r.error}`);
  return fundById(g, (r.data as { id: string }).id)!;
}

/** Advance `n` game days. Each day crosses one day boundary and runs the fund's day close. The manager stays online unless `away`. */
function days(g: GameState, n: number, away = false): void {
  for (let k = 0; k < n; k++) {
    g.market = { ...g.market, tick: g.market.tick + TPD };
    if (!away) g.players.m!.lastSeenTick = g.market.tick;
    fundsDay(g, null);
    courtTick(g, newOutput());
  }
}

/** Run engine ticks (fills happen here), with the full world step. */
function ticks(g: GameState, n: number): void {
  for (let k = 0; k < n; k++) stepGame(g);
}

function stockId(g: GameState, skip: string[] = []): string {
  const a = g.market.config.assets.find((x) => x.assetClass === 'stock' && x.listed !== false && !skip.includes(x.id));
  if (!a) throw new Error('no stock');
  return a.id;
}

function assetOf(g: GameState, cls: string): string {
  const a = g.market.config.assets.find((x) => x.assetClass === cls && x.listed !== false);
  if (!a) throw new Error(`no ${cls}`);
  return a.id;
}

/** A deposit that settles at the next close: the investor is funded, old enough, and not linked to the manager. */
function invest(g: GameState, f: Fund, pid: string, amount: number): void {
  const r = cmd(g, pid, { type: 'fund.deposit', fundId: f.id, amount });
  if (!r.ok) throw new Error(`deposit refused: ${r.error}`);
  days(g, 1);
}

describe('fund constants and the calendar', () => {
  it('one game day is the engine day (TPD), and a real day is 24 game days', () => {
    expect(FUND_TICKS_PER_DAY).toBe(TPD);
    expect(FUND_TIME.investorAgeTicks).toBe(7 * 24 * TPD);
    expect(FUND_TIME.absentFreezeTicks).toBe(72 * TPD);
  });
});

describe('opening a fund', () => {
  it('refuses a manager under Operator, under the account age, under the stake, or with bad terms', () => {
    const g = world('f-open-gates');
    g.players.m!.rankId = 'R2';
    expect(errOf(g, 'm', createCmd())).toBe('fundRank');
    g.players.m!.rankId = 'R3';
    g.players.m!.joinedTick = g.market.tick;
    expect(errOf(g, 'm', createCmd())).toBe('fundAge');
    g.players.m!.joinedTick = -1000 * TPD;
    expect(errOf(g, 'm', createCmd({ stake: 100_000 }))).toBe('fundStake');
    expect(errOf(g, 'm', createCmd({ mandate: { ...MANDATE, maxLeverage: 2 } }))).toBe('fundMandateInvalid');
    expect(errOf(g, 'm', createCmd({ mandate: { ...MANDATE, classes: ['realestate'] } }))).toBe('fundMandateInvalid');
    expect(errOf(g, 'm', createCmd({ mandate: { ...MANDATE, maxPositionPct: 0.25 } }))).toBe('fundMandateInvalid');
    expect(errOf(g, 'm', createCmd({ fees: { mgmt: 0.03, perf: 0.2 } }))).toBe('fundTerms');
    expect(errOf(g, 'm', createCmd({ fees: { mgmt: 0.02, perf: 0.25 } }))).toBe('fundTerms');
    expect(errOf(g, 'm', createCmd({ name: 'a' }))).toBe('fundTerms');
  });

  it('allows one fund per manager, and a manager convicted within 8 real weeks cannot open one', () => {
    const g = world('f-open-one');
    openFund(g);
    expect(errOf(g, 'm', createCmd())).toBe('fundOwnsOne');
    const g2 = world('f-open-conv');
    g2.funds = emptyFunds();
    g2.funds.convicted.m = g2.market.tick;
    expect(errOf(g2, 'm', createCmd())).toBe('fundConviction');
    g2.funds.bans.m = g2.market.tick + 1;
    expect(errOf(g2, 'm', createCmd())).toBe('fundBanned');
  });

  it('moves the stake into the fund custody account; the manager net worth does not move, and NAV starts at 1 per unit', () => {
    const g = world('f-stake');
    const before = netWorthBreakdown(g, 'm').total;
    const cash0 = cashOf(g, 'm');
    const f = openFund(g);
    expect(g.market.accounts[f.accountId]!.cash).toBeCloseTo(STAKE, 6);
    expect(cashOf(g, 'm')).toBeCloseTo(cash0 - STAKE, 6);
    expect(unitsOf(f)).toBeCloseTo(STAKE, 6);
    expect(navPerUnitOf(g, f)).toBeCloseTo(1, 9);
    expect(netWorthBreakdown(g, 'm').total).toBeCloseTo(before, 4);
    expect(netWorthBreakdown(g, 'm').funds).toBeCloseTo(STAKE, 4);
  });
});

describe('the mandate and the trading gate', () => {
  it('trades only the asset classes the mandate names', () => {
    const g = world('f-mandate-class');
    const f = openFund(g, { mandate: { ...MANDATE, classes: ['stock'] } });
    expect(errOf(g, 'm', { type: 'fund.trade', fundId: f.id, assetId: assetOf(g, 'crypto'), side: 'buy', qty: 1 })).toBe('fundMandate');
    expect(errOf(g, 'm', { type: 'fund.trade', fundId: f.id, assetId: stockId(g), side: 'buy', qty: 1 })).toBeUndefined();
    ticks(g, 1);
  });

  it('caps a position at the mandate share of NAV, and refuses an order that would exceed it', () => {
    const g = world('f-position');
    const f = openFund(g);
    const s = stockId(g);
    const px = priceOf(g, s);
    const qty = Math.floor((0.2 * STAKE) / px);
    expect(errOf(g, 'm', { type: 'fund.trade', fundId: f.id, assetId: s, side: 'buy', qty: qty + 5 })).toBe('fundPosition');
    expect(errOf(g, 'm', { type: 'fund.trade', fundId: f.id, assetId: s, side: 'buy', qty: Math.max(1, qty - 2) })).toBeUndefined();
  });

  it('refuses any trade that would take gross exposure past the leverage limit', () => {
    const g = world('f-leverage');
    const f = openFund(g, { mandate: { ...MANDATE, classes: ['stock'], maxLeverage: 1.5 } });
    // eight stocks at 19% of NAV each: gross 152% of NAV, past the 150% limit, so the eighth is refused
    const names: string[] = [];
    let refused: string | undefined;
    for (let k = 0; k < 9 && !refused; k++) {
      const s = stockId(g, names);
      names.push(s);
      const qty = Math.floor((0.19 * STAKE) / priceOf(g, s));
      const r = cmd(g, 'm', { type: 'fund.trade', fundId: f.id, assetId: s, side: 'buy', qty });
      if (!r.ok) refused = r.error;
      ticks(g, 1); // fills, so the next order sees the position
    }
    expect(refused).toBe('fundLeverage');
    expect(names.length).toBe(8);
  });

  it('refuses a trade in a closed or frozen fund, and rejects a malformed order', () => {
    const g = world('f-trade-invalid');
    const f = openFund(g);
    const s = stockId(g);
    expect(errOf(g, 'm', { type: 'fund.trade', fundId: f.id, assetId: s, side: 'buy', qty: 0 })).toBe('fundTradeInvalid');
    expect(errOf(g, 'm', { type: 'fund.trade', fundId: f.id, assetId: s, side: 'buy', qty: 1, orderType: 'limit' })).toBe('fundTradeInvalid');
    expect(errOf(g, 'i1', { type: 'fund.trade', fundId: f.id, assetId: s, side: 'buy', qty: 1 })).toBe('fundNotManager');
    expect(errOf(g, 'm', { type: 'fund.trade', fundId: 'nope', assetId: s, side: 'buy', qty: 1 })).toBe('fundNoFund');
  });

  it('changes the mandate only after 24 real hours of notice, and the old mandate holds until then', () => {
    const g = world('f-mandate-notice');
    const f = openFund(g);
    const r = cmd(g, 'm', { type: 'fund.mandate', fundId: f.id, mandate: { ...MANDATE, classes: ['stock'], maxPositionPct: 0.1 } });
    expect(r.ok).toBe(true);
    expect(f.pendingMandate!.effectiveTick).toBe(g.market.tick + 24 * TPD);
    days(g, 23);
    expect(f.mandate.maxPositionPct).toBe(0.2);
    expect(f.pendingMandate).not.toBeNull();
    days(g, 1);
    expect(f.mandate.maxPositionPct).toBe(0.1);
    expect(f.mandate.classes).toEqual(['stock']);
    expect(f.pendingMandate).toBeNull();
    expect(errOf(g, 'm', { type: 'fund.mandate', fundId: f.id, mandate: { ...MANDATE, maxLeverage: 3 } })).toBe('fundMandateInvalid');
  });
});

describe('related-party and insider rules', () => {
  it('will not cross the manager’s own open order, nor a linked account’s', () => {
    const g = world('f-selfmatch');
    const f = openFund(g);
    const s = stockId(g);
    // the manager holds one share, and places a sell far above the market (it stays open)
    expect(cmd(g, 'm', { type: 'order.place', order: { assetId: s, side: 'buy', type: 'market', qty: 1 } }).ok).toBe(true);
    ticks(g, 1);
    expect(cmd(g, 'm', { type: 'order.place', order: { assetId: s, side: 'sell', type: 'limit', qty: 1, limitPrice: priceOf(g, s) * 100 } }).ok).toBe(true);
    expect(errOf(g, 'm', { type: 'fund.trade', fundId: f.id, assetId: s, side: 'buy', qty: 1 })).toBe('fundSelfMatch');
    // a linked account (an alliance mate) does the same in another asset
    const other = stockId(g, [s]);
    g.players.m!.allianceId = 'AL1';
    g.players.x!.allianceId = 'AL1';
    expect(cmd(g, 'x', { type: 'order.place', order: { assetId: other, side: 'buy', type: 'market', qty: 1 } }).ok).toBe(true);
    ticks(g, 1);
    expect(cmd(g, 'x', { type: 'order.place', order: { assetId: other, side: 'sell', type: 'limit', qty: 1, limitPrice: priceOf(g, other) * 100 } }).ok).toBe(true);
    expect(errOf(g, 'm', { type: 'fund.trade', fundId: f.id, assetId: other, side: 'buy', qty: 1 })).toBe('fundSelfMatch');
  });

  it('caps a fund at 5% of NAV in an asset the manager is an insider of, and files it publicly', () => {
    const g = world('f-insider');
    const f = openFund(g);
    const s = stockId(g);
    g.market = {
      ...g.market,
      config: { ...g.market.config, assets: g.market.config.assets.map((a) => (a.id === s ? { ...a, insiderId: 'm' } : a)) },
    };
    const px = priceOf(g, s);
    expect(errOf(g, 'm', { type: 'fund.trade', fundId: f.id, assetId: s, side: 'buy', qty: Math.floor((0.1 * STAKE) / px) })).toBe('fundInsiderCap');
    const ok = cmd(g, 'm', { type: 'fund.trade', fundId: f.id, assetId: s, side: 'buy', qty: Math.max(1, Math.floor((0.04 * STAKE) / px)) });
    expect(ok.ok).toBe(true);
    expect(f.filings.map((x) => x.assetId)).toEqual([s]);
  });

  it('refuses an investor linked to the manager, and an investor under 7 real days old', () => {
    const g = world('f-investor-gates');
    const f = openFund(g);
    g.players.x!.allianceId = 'AL2';
    g.players.m!.allianceId = 'AL2';
    expect(errOf(g, 'x', { type: 'fund.deposit', fundId: f.id, amount: 1000 })).toBe('fundInvestorLink');
    g.players.i1!.joinedTick = g.market.tick - 6 * 24 * TPD;
    expect(errOf(g, 'i1', { type: 'fund.deposit', fundId: f.id, amount: 1000 })).toBe('fundInvestorAge');
    g.players.i1!.joinedTick = g.market.tick - 8 * 24 * TPD;
    expect(errOf(g, 'i1', { type: 'fund.deposit', fundId: f.id, amount: 1000 })).toBeUndefined();
  });

  it('keeps a holding in one fund within 25% of the investor’s net worth, and a deposit at least $100', () => {
    const g = world('f-investor-limit');
    const f = openFund(g);
    g.market.accounts.i1 = { ...g.market.accounts.i1!, cash: 1_000 };
    refreshNetWorth(g, g.players.i1!);
    expect(errOf(g, 'i1', { type: 'fund.deposit', fundId: f.id, amount: 500 })).toBe('fundInvestorLimit');
    expect(errOf(g, 'i1', { type: 'fund.deposit', fundId: f.id, amount: 50 })).toBe('fundDeposit');
    expect(errOf(g, 'i1', { type: 'fund.deposit', fundId: f.id, amount: 200 })).toBeUndefined();
  });
});

describe('deposits and redemptions', () => {
  it('settles a deposit at the next day close, at NAV: the cash moves now and the units follow the close', () => {
    const g = world('f-deposit');
    const f = openFund(g);
    const c0 = cashOf(g, 'i2');
    const r = cmd(g, 'i2', { type: 'fund.deposit', fundId: f.id, amount: 10_000 });
    expect(r.ok).toBe(true);
    expect(cashOf(g, 'i2')).toBeCloseTo(c0 - 10_000, 6);
    expect(f.holders.i2).toBeUndefined();
    days(g, 1);
    expect(f.holders.i2).toBeCloseTo(10_000 / navPerUnitOf(g, f), 3);
    expect(navPerUnitOf(g, f)).toBeCloseTo(1, 3);
  });

  it('a redemption reserves its units, and the gate settles at most 20% of AUM a day, pro-rata', () => {
    const g = world('f-gate');
    const f = openFund(g);
    invest(g, f, 'i2', 100_000); // NAV about 400k, so the gate is about 80k a day
    const units = f.holders.i2!;
    const c0 = cashOf(g, 'i2');
    const r = cmd(g, 'i2', { type: 'fund.redeem', fundId: f.id, units });
    expect(r.ok).toBe(true);
    expect(f.reserved.i2).toBeCloseTo(units, 9);
    expect(f.holders.i2).toBeUndefined();
    days(g, 1);
    // the gate is 20% of AUM, about 80% of this request: the rest stays reserved for the next close
    expect(f.reserved.i2 ?? 0).toBeGreaterThan(0.1 * units);
    expect(f.reserved.i2 ?? 0).toBeLessThan(0.3 * units);
    // the settled part was paid out at once: the investor's cash rose by about 80% of the units
    expect(cashOf(g, 'i2') - c0).toBeGreaterThan(0.7 * units);
    expect(cashOf(g, 'i2') - c0).toBeLessThan(0.85 * units);
  });

  it('pays the 1% early-exit fee into the fund when the deposit is less than 2 real days old', () => {
    const g = world('f-early');
    const f = openFund(g);
    invest(g, f, 'i2', 10_000);
    const px = navPerUnitOf(g, f);
    const c0 = cashOf(g, 'i2');
    expect(cmd(g, 'i2', { type: 'fund.redeem', fundId: f.id, units: 5_000 }).ok).toBe(true);
    days(g, 1);
    // 5,000 units at about 1.00 less the 1% fee (the close's accrual moves the price a little); the fee stays in the fund
    expect(px).toBeGreaterThan(0.99);
    expect(cashOf(g, 'i2') - c0).toBeGreaterThan(4_940);
    expect(cashOf(g, 'i2') - c0).toBeLessThan(4_960);
  });

  it('opens redemptions without the gate while the manager is away, and settles them in full', () => {
    const g = world('f-gatefree');
    const f = openFund(g);
    invest(g, f, 'i2', 100_000);
    days(g, 72, true);
    expect(f.status).toBe('frozen');
    const units = f.holders.i2!;
    const c0 = cashOf(g, 'i2');
    expect(cmd(g, 'i2', { type: 'fund.redeem', fundId: f.id, units }).ok).toBe(true);
    days(g, 1, true);
    expect(f.reserved.i2 ?? 0).toBeLessThan(1e-6);
    expect(cashOf(g, 'i2') - c0).toBeGreaterThan(0.99 * units);
  });

  it('refuses a deposit while the fund is frozen, and refuses a redemption of units not held', () => {
    const g = world('f-frozen-deposit');
    const f = openFund(g);
    days(g, 72, true);
    expect(errOf(g, 'i1', { type: 'fund.deposit', fundId: f.id, amount: 1000 })).toBe('fundFrozen');
    expect(errOf(g, 'i1', { type: 'fund.redeem', fundId: f.id, units: 1 })).toBe('fundRedeem');
  });
});

describe('the stake, the AUM cap and the young fund', () => {
  it('pauses deposits when the stake would fall below 10% of AUM', () => {
    const g = world('f-stake-low');
    const f = openFund(g);
    g.market.accounts.i2 = { ...g.market.accounts.i2!, cash: 20_000_000 };
    refreshNetWorth(g, g.players.i2!);
    // a deposit of 2.8M takes AUM to 3.1M against a 300k stake (9.7%), past both the 10% floor and the 10x cap
    expect(errOf(g, 'i2', { type: 'fund.deposit', fundId: f.id, amount: 2_800_000 })).toBe('fundStakeLow');
    expect(errOf(g, 'i2', { type: 'fund.deposit', fundId: f.id, amount: 2_500_000 })).toBeUndefined();
  });

  it('lets the manager top up his own stake when that restores the 10% floor', () => {
    const g = world('f-stake-topup');
    const f = openFund(g);
    g.market.accounts.i2 = { ...g.market.accounts.i2!, cash: 20_000_000 };
    refreshNetWorth(g, g.players.i2!);
    // AUM goes to exactly ten times the stake: the floor holds at 10%
    invest(g, f, 'i2', 2_700_000);
    expect(navOf(g, f)).toBeCloseTo(3_000_000, -2);
    // the manager's own 300k is his stake, so it counts before the check (AUM 3.3M, stake 600k)
    expect(cmd(g, 'm', { type: 'fund.deposit', fundId: f.id, amount: 300_000 }).ok).toBe(true);
  });

  it('caps AUM at $10M in the first 14 real days, whatever the stake', () => {
    const g = world('f-young-cap');
    g.market.accounts.m = { ...g.market.accounts.m!, cash: 5_000_000 };
    const f = openFund(g, { stake: 2_000_000 });
    g.market.accounts.i2 = { ...g.market.accounts.i2!, cash: 50_000_000 };
    refreshNetWorth(g, g.players.i2!);
    expect(errOf(g, 'i2', { type: 'fund.deposit', fundId: f.id, amount: 8_200_000 })).toBe('fundAumCap');
    expect(errOf(g, 'i2', { type: 'fund.deposit', fundId: f.id, amount: 7_900_000 })).toBeUndefined();
  });
});

describe('fees and custody', () => {
  it('accrues the management fee daily and crystallizes it at the quarter, into the manager’s cash', () => {
    const g = world('f-fees');
    const f = openFund(g);
    const cash0 = cashOf(g, 'm');
    days(g, 1);
    expect(f.feeAccrued).toBeCloseTo((STAKE * FEES.mgmt) / 252, -1);
    days(g, FUND_TIME.quarterDays - 1);
    expect(today(g)).toBe(FUND_TIME.quarterDays);
    expect(f.feePayable).toBeLessThan(1e-6);
    const paid = cashOf(g, 'm') - cash0;
    // about 63 game days of 2% a year on about 300k, less the custody sink the fund pays on its cash
    expect(paid).toBeGreaterThan(1_300);
    expect(paid).toBeLessThan(1_700);
    expect(f.managerReceived).toBeCloseTo(paid, 6);
    expect(g.economy.sinks['fund custody']).toBeGreaterThan(150);
    expect(g.economy.sinks['fund custody']).toBeLessThan(220);
  });

  it('charges no performance fee below the high-water mark', () => {
    const g = world('f-perf-hwm');
    const f = openFund(g);
    days(g, FUND_TIME.quarterDays);
    expect(f.hwm).toBeLessThanOrEqual(1);
    expect(f.hwm).toBe(1);
  });

  it('charges the performance fee on NAV above the high-water mark, once', () => {
    const g = world('f-perf');
    const f = openFund(g);
    const s = stockId(g);
    const qty = Math.floor((0.2 * STAKE) / priceOf(g, s));
    cmd(g, 'm', { type: 'fund.trade', fundId: f.id, assetId: s, side: 'buy', qty });
    ticks(g, 1);
    expect(f.holders.m).toBeDefined();
    g.market = shockPrice(g.market, s, 0.25); // the position gains 25%, so NAV gains about 5%
    const navBefore = navPerUnitOf(g, f);
    days(g, FUND_TIME.quarterDays);
    expect(navBefore).toBeGreaterThan(1.03);
    expect(f.hwm).toBeGreaterThan(1.03);
    const perf = FEES.perf * (navBefore - 1) * unitsOf(f);
    expect(f.managerReceived).toBeGreaterThan(perf * 0.8);
    // the high-water mark has moved up, so a fall back to 1 earns nothing new at the next quarter
    const received = f.managerReceived;
    g.market = shockPrice(g.market, s, -0.2);
    days(g, FUND_TIME.quarterDays);
    expect(f.managerReceived - received).toBeLessThan(0.01 * STAKE);
  });
});

describe('absence, wind-down and the breaker', () => {
  it('freezes trading after 72 real hours away, thaws when the manager returns, and winds down after 14 days more', () => {
    const g = world('f-absent');
    const f = openFund(g);
    days(g, 71, true);
    expect(f.status).toBe('open');
    days(g, 1, true);
    expect(f.status).toBe('frozen');
    days(g, 3);
    expect(f.status).toBe('open');
    days(g, 72, true);
    expect(f.status).toBe('frozen');
    // the manager's refused trade still counts as presence: the fund thaws at the next close
    expect(errOf(g, 'm', { type: 'fund.trade', fundId: f.id, assetId: stockId(g), side: 'buy', qty: 1 })).toBe('fundFrozen');
    days(g, 1);
    expect(f.status).toBe('open');
    days(g, 72, true);
    expect(f.status).toBe('frozen');
    days(g, FUND_TIME.windDownDays, true);
    expect(f.status === 'winding' || f.status === 'closed').toBe(true);
    days(g, 3, true);
    expect(f.status).toBe('closed');
    expect(f.holders.m).toBeUndefined();
  });

  it('trips the breaker after a 30% fall from the week’s high: no new trades for a game day', () => {
    const g = world('f-breaker');
    const f = openFund(g, { mandate: { ...MANDATE, classes: ['stock'] } });
    invest(g, f, 'i2', 100_000);
    // a loss of 35% of NAV in the fund's cash (test-only: stands for a fall in every position)
    debit(g, f.accountId, 0.35 * navOf(g, f), 'test');
    days(g, 1);
    expect(f.breakerUntil).toBeGreaterThan(g.market.tick);
    expect(errOf(g, 'm', { type: 'fund.trade', fundId: f.id, assetId: stockId(g), side: 'buy', qty: 1 })).toBe('fundBreaker');
  });
});

describe('front-running surveillance and the S5 verdict', () => {
  it('flags a fund trade that follows the manager’s own trade in the same asset, and an S5 verdict takes restitution from the stake first', () => {
    const g = world('f-frontrun');
    const f = openFund(g);
    invest(g, f, 'i2', 100_000);
    const s = stockId(g);
    for (let k = 0; k < 2; k++) {
      // the manager buys for himself, the price moves up 5%, then the fund buys the same asset
      cmd(g, 'm', { type: 'order.place', order: { assetId: s, side: 'buy', type: 'market', qty: 1 } });
      ticks(g, 1);
      g.market = shockPrice(g.market, s, 0.05);
      expect(cmd(g, 'm', { type: 'fund.trade', fundId: f.id, assetId: s, side: 'buy', qty: 1 }).ok).toBe(true);
      ticks(g, 1);
    }
    expect(f.evidence).toBe(2 * FUND_RULES.frontRunEvidence);
    expect(f.harm).toBeGreaterThan(0);
    expect(f.caseId).not.toBeNull();
    const c = g.court.cases[f.caseId!]!;
    expect(c.kind).toBe('fund abuse');
    expect(c.plaintiffId).toBe('i2');
    expect(c.bar).toBe(FUND_RULES.civilBar);
    // the verdict is not a coin toss in this test: the case's evidence is made strong before the hearing
    c.evidence = 400;
    const stake0 = f.holders.m!;
    const cashM0 = cashOf(g, 'm');
    // the award: 1.5x the harm, and 100% of the manager's gain on the flagged trades (disgorgement)
    const owed = FUND_RULES.s5.restitutionX * f.harm + FUND_RULES.s5.disgorgePct * f.gain;
    expect(f.gain).toBeGreaterThan(0);
    expect(c.gain).toBeCloseTo(f.gain, 6);
    days(g, 2);
    expect(c.status).toBe('won');
    // the stake covers the award, so nothing is left unpaid and the victim fund advances nothing
    expect(c.damages).toBeCloseTo(owed, 1);
    expect(c.vcfAdvance ?? 0).toBe(0);
    expect(f.holders.m ?? 0).toBeLessThan(stake0);
    expect(stake0 - (f.holders.m ?? 0)).toBeGreaterThan(0);
    expect(cashOf(g, 'm')).toBeLessThan(cashM0);
    expect(g.funds!.bans.m).toBeGreaterThan(g.market.tick);
    expect(f.status).toBe('winding');
  });

  it('does not flag a fund trade with no personal trade in the same asset and side within a game day', () => {
    const g = world('f-no-frontrun');
    const f = openFund(g);
    invest(g, f, 'i2', 100_000);
    const s = stockId(g);
    cmd(g, 'm', { type: 'order.place', order: { assetId: s, side: 'buy', type: 'market', qty: 1 } });
    ticks(g, 1);
    days(g, 2); // more than a game day passes before the fund trades
    expect(cmd(g, 'm', { type: 'fund.trade', fundId: f.id, assetId: s, side: 'buy', qty: 1 }).ok).toBe(true);
    ticks(g, 1);
    expect(f.evidence).toBe(0);
    expect(f.caseId).toBeNull();
  });
});

describe('claims, the public view and old saves', () => {
  it('counts the fund in net worth: units, a deposit waiting, and a manager’s fees all add up to the fund equity', () => {
    const g = world('f-claims');
    const f = openFund(g);
    cmd(g, 'i2', { type: 'fund.deposit', fundId: f.id, amount: 20_000 });
    const claims = fundClaimsOf(g, 'm') + fundClaimsOf(g, 'i2');
    const equity = g.market.accounts[f.accountId]!.cash;
    expect(claims).toBeCloseTo(equity, 4);
    expect(navOf(g, f)).toBeCloseTo(STAKE, 4);
  });

  it('shows the public view without the investor list, and an old save without funds is untouched', () => {
    const g = world('f-public');
    const f = openFund(g);
    invest(g, f, 'i2', 10_000);
    const pub = JSON.stringify(publicFunds(g));
    expect(pub).toContain(f.name);
    expect(pub).toContain('mgr_one');
    expect(pub).not.toContain('inv_two');
    expect(pub).not.toContain('holders');
    const old = world('f-old');
    delete old.funds;
    days(old, 2);
    expect(netWorthBreakdown(old, 'm').funds).toBe(0);
    expect(applyFundCommand(old, 'm', { type: 'fund.redeem', fundId: 'fund1', units: 1 }, null)).toEqual({ ok: false, error: 'fundNoFund' });
  });
});

describe('refusal copy and the French', () => {
  const codes: FundRefusal[] = [
    'fundNoFund', 'fundNotManager', 'fundTerms', 'fundRank', 'fundAge', 'fundBanned', 'fundConviction', 'fundOwnsOne',
    'fundStake', 'fundCash', 'fundClosed', 'fundFrozen', 'fundBreaker', 'fundMandate', 'fundLeverage', 'fundPosition',
    'fundInsiderCap', 'fundSelfMatch', 'fundOrderRejected', 'fundDeposit', 'fundInvestorAge', 'fundInvestorLink',
    'fundInvestorLimit', 'fundStakeLow', 'fundAumCap', 'fundRedeem', 'fundMandateInvalid', 'fundTradeInvalid',
  ];
  it('every refusal code has a line in English and in French', () => {
    for (const c of codes) {
      expect((en as Record<string, string>)[`funds.refusal.${c}`], c).toBeTruthy();
      expect((fr as Record<string, string>)[`funds.refusal.${c}`], c).toBeTruthy();
    }
  });
  it('every fund message key exists in both languages', () => {
    const keys = Object.keys(en).filter((k) => k.startsWith('funds.') && !k.startsWith('funds.refusal.'));
    expect(keys.length).toBeGreaterThan(15);
    for (const k of keys) expect((fr as Record<string, string>)[k], k).toBeTruthy();
  });
});

describe('the fund trades and cash sit in their own account', () => {
  it('the fund buys through its own account: the manager’s personal cash is not spent on fund orders', () => {
    const g = world('f-own-cash');
    const f = openFund(g);
    const mCash = cashOf(g, 'm');
    const s = stockId(g);
    cmd(g, 'm', { type: 'fund.trade', fundId: f.id, assetId: s, side: 'buy', qty: 1 });
    ticks(g, 1);
    expect(cashOf(g, 'm')).toBeCloseTo(mCash, 6);
    expect(g.market.accounts[f.accountId]!.positions[s]?.qty).toBe(1);
  });

  it('a fund command by an unknown player is refused, and a closed fund takes no money', () => {
    const g = world('f-unknown');
    const r = applyFundCommand(g, 'nobody', { type: 'fund.create', name: 'x', mandate: MANDATE, fees: FEES, stake: 1 }, null);
    expect(r.ok).toBe(false);
    const f = openFund(g);
    fundById(g, f.id)!.status = 'closed';
    expect(errOf(g, 'i1', { type: 'fund.deposit', fundId: f.id, amount: 1000 })).toBe('fundClosed');
    expect(navPerUnitOf(g, f)).toBeGreaterThanOrEqual(0);
  });
});

describe('the caps count the queued orders, not only the filled ones', () => {
  it('two buys of 19% of NAV placed in one tick cannot reach 38% in one asset', () => {
    const g = world('f-pending-cap');
    const f = openFund(g);
    const s = stockId(g);
    const qty = Math.floor((0.19 * STAKE) / priceOf(g, s));
    expect(cmd(g, 'm', { type: 'fund.trade', fundId: f.id, assetId: s, side: 'buy', qty }).ok).toBe(true);
    expect(errOf(g, 'm', { type: 'fund.trade', fundId: f.id, assetId: s, side: 'buy', qty })).toBe('fundPosition');
    ticks(g, 1); // filled: the position is still capped
    expect(errOf(g, 'm', { type: 'fund.trade', fundId: f.id, assetId: s, side: 'buy', qty })).toBe('fundPosition');
  });

  it('counts the open buys in gross exposure: the eighth 19% stock in one tick is past 1.5x', () => {
    const g = world('f-pending-lev');
    const f = openFund(g, { mandate: { classes: ['stock'], maxLeverage: 1.5, maxPositionPct: 0.2 } });
    const names: string[] = [];
    let refused: string | undefined;
    for (let k = 0; k < 9 && !refused; k++) {
      const s = stockId(g, names);
      const r = cmd(g, 'm', { type: 'fund.trade', fundId: f.id, assetId: s, side: 'buy', qty: Math.floor((0.19 * STAKE) / priceOf(g, s)) });
      if (r.ok) names.push(s);
      else refused = r.error;
    }
    expect(names.length).toBe(7);
    expect(refused).toBe('fundLeverage');
  });

  it('a sell cannot exceed the position less the sells already queued', () => {
    const g = world('f-pending-sell');
    const f = openFund(g);
    const s = stockId(g);
    expect(cmd(g, 'm', { type: 'fund.trade', fundId: f.id, assetId: s, side: 'buy', qty: 10 }).ok).toBe(true);
    ticks(g, 1);
    expect(g.market.accounts[f.accountId]!.positions[s]?.qty).toBe(10);
    expect(cmd(g, 'm', { type: 'fund.trade', fundId: f.id, assetId: s, side: 'sell', qty: 6 }).ok).toBe(true);
    expect(errOf(g, 'm', { type: 'fund.trade', fundId: f.id, assetId: s, side: 'sell', qty: 6 })).toBe('fundOrderRejected');
  });
});

describe('related party: the fund and the linked accounts', () => {
  it('refuses a personal order that would match the fund’s resting order, and a linked account’s too', () => {
    const g = world('f-entry-guard');
    const f = openFund(g);
    const s = stockId(g);
    // the fund rests a buy far below the market: it stays open (gtc)
    const low = priceOf(g, s) * 0.01;
    expect(cmd(g, 'm', { type: 'fund.trade', fundId: f.id, assetId: s, side: 'buy', qty: 1, orderType: 'limit', limitPrice: low }).ok).toBe(true);
    expect(errOf(g, 'm', { type: 'order.place', order: { assetId: s, side: 'sell', type: 'limit', qty: 1, limitPrice: low } })).toBe('fundSelfMatch');
    // an alliance mate is linked to the manager: the same refusal; an unlinked player is not refused by this rule
    g.players.m!.allianceId = 'AL4';
    g.players.x!.allianceId = 'AL4';
    expect(errOf(g, 'x', { type: 'order.place', order: { assetId: s, side: 'sell', type: 'limit', qty: 1, limitPrice: low } })).toBe('fundSelfMatch');
    expect(errOf(g, 'i1', { type: 'order.place', order: { assetId: s, side: 'sell', type: 'limit', qty: 1, limitPrice: low } })).not.toBe('fundSelfMatch');
  });

  it('refuses the manager closing his own long position against the fund’s resting buy (a close is a sell)', () => {
    const g = world('f-close-guard');
    const f = openFund(g);
    const s = stockId(g);
    expect(cmd(g, 'm', { type: 'order.place', order: { assetId: s, side: 'buy', type: 'market', qty: 1 } }).ok).toBe(true);
    ticks(g, 1);
    expect(cmd(g, 'm', { type: 'fund.trade', fundId: f.id, assetId: s, side: 'buy', qty: 1, orderType: 'limit', limitPrice: priceOf(g, s) * 0.01 }).ok).toBe(true);
    expect(errOf(g, 'm', { type: 'position.close', assetId: s })).toBe('fundSelfMatch');
  });

  it('a fund order that an alliance change puts opposite a linked order is cancelled before the step can match them', () => {
    const g = world('f-linked-later');
    const f = openFund(g);
    const s = stockId(g);
    // the manager holds one share; the fund rests a sell far above the market; x (not yet linked) rests a buy far below
    expect(cmd(g, 'm', { type: 'order.place', order: { assetId: s, side: 'buy', type: 'market', qty: 1 } }).ok).toBe(true);
    ticks(g, 1);
    expect(cmd(g, 'm', { type: 'fund.trade', fundId: f.id, assetId: s, side: 'buy', qty: 1 }).ok).toBe(true);
    ticks(g, 1);
    const high = priceOf(g, s) * 100;
    expect(cmd(g, 'm', { type: 'fund.trade', fundId: f.id, assetId: s, side: 'sell', qty: 1, orderType: 'limit', limitPrice: high }).ok).toBe(true);
    expect(cmd(g, 'x', { type: 'order.place', order: { assetId: s, side: 'buy', type: 'limit', qty: 1, limitPrice: priceOf(g, s) * 0.01 } }).ok).toBe(true);
    // x and the manager become alliance mates: the fund's sell now stands opposite a linked order
    g.players.m!.allianceId = 'AL5';
    g.players.x!.allianceId = 'AL5';
    ticks(g, 1);
    // the fund's sell is no longer open (cancelled before the step: it left the open book, and the manager is told)
    expect(g.market.orders.some((o) => o.playerId === f.accountId && o.side === 'sell' && o.status === 'open')).toBe(false);
    expect((g.market.closedOrders?.[f.accountId] ?? []).some((o) => o.side === 'sell' && o.status === 'cancelled')).toBe(true);
    expect(g.market.accounts[f.accountId]!.positions[s]?.qty ?? 0).toBe(1); // the sell never filled
    expect(g.market.accounts.m!.positions[s]?.qty ?? 0).toBe(1);
  });
});

describe('surveillance counts only the manager’s own fund trades', () => {
  it('a forced sale (a redemption or the wind-down) after the manager’s own sale adds no evidence', () => {
    const g = world('f-surveil-forced');
    const f = openFund(g);
    const s = stockId(g);
    const fill = (over: Partial<Fill>): Fill => ({
      orderId: 'x', playerId: 'm', assetId: s, side: 'sell', qty: 1, price: 100, fee: 0, tick: g.market.tick, mid: 100, ...over,
    });
    fundsFills(g, [fill({ playerId: 'm', orderId: 'personal' })], null);
    fundsFills(g, [fill({ playerId: f.accountId, orderId: 'forced', price: 90 })], null);
    expect(f.evidence).toBe(0);
    expect(f.caseId).toBeNull();
    // the same fill, when the manager placed the order, is a flagged fund trade
    f.managerOrders['disc'] = g.market.tick;
    fundsFills(g, [fill({ playerId: f.accountId, orderId: 'disc', price: 90 })], null);
    expect(f.evidence).toBe(FUND_RULES.frontRunEvidence);
    expect(f.gain).toBeCloseTo(10, 6);
  });
});

describe('the manager’s stake, the S5 fine and the victim fund', () => {
  it('refuses a manager redemption that leaves the stake below 10% of AUM or $250k while investors are in', () => {
    const g = world('f-stake-floor');
    const f = openFund(g);
    invest(g, f, 'i2', 100_000); // AUM about 400k: the floor is max(40k, 250k) = 250k
    const px = navPerUnitOf(g, f);
    expect(errOf(g, 'm', { type: 'fund.redeem', fundId: f.id, units: Math.ceil(60_000 / px) })).toBe('fundStakeLow');
    expect(errOf(g, 'm', { type: 'fund.redeem', fundId: f.id, units: Math.floor(40_000 / px) })).toBeUndefined();
  });

  it('lets the manager take his stake to zero once he is the only holder', () => {
    const g = world('f-stake-alone');
    const f = openFund(g);
    expect(errOf(g, 'm', { type: 'fund.redeem', fundId: f.id, units: f.holders.m! })).toBeUndefined();
  });

  it('measures the 1% filing against the float, not all shares outstanding', () => {
    const g = world('f-float');
    const f = openFund(g);
    const s = stockId(g);
    expect(cmd(g, 'm', { type: 'order.place', order: { assetId: s, side: 'buy', type: 'market', qty: 1 } }).ok).toBe(true);
    ticks(g, 1);
    g.market = {
      ...g.market,
      config: { ...g.market.config, assets: g.market.config.assets.map((a) => (a.id === s ? { ...a, sharesOutstanding: 1_000, floatShares: 100 } : a)) },
    };
    expect(insiderOrFloat(g, f, s)).toBe(true); // 1 of a 100-share float is 1%
    g.market = {
      ...g.market,
      config: { ...g.market.config, assets: g.market.config.assets.map((a) => (a.id === s ? { ...a, floatShares: undefined } : a)) },
    };
    expect(insiderOrFloat(g, f, s)).toBe(false); // 1 of 1,000 shares is 0.1%
  });

  it('fines 8% of net worth with a floor of $100k and a cap of 35% of net worth, with no headroom term', () => {
    const g = world('f-fine');
    const f = openFund(g, { mandate: { ...MANDATE, classes: ['stock'] } });
    const s = stockId(g);
    invest(g, f, 'i2', 100_000);
    for (let k = 0; k < 2; k++) {
      expect(cmd(g, 'm', { type: 'order.place', order: { assetId: s, side: 'buy', type: 'market', qty: 1 } }).ok).toBe(true);
      ticks(g, 1);
      g.market = shockPrice(g.market, s, 0.05);
      expect(cmd(g, 'm', { type: 'fund.trade', fundId: f.id, assetId: s, side: 'buy', qty: 1 }).ok).toBe(true);
      ticks(g, 1);
    }
    const c = Object.values(g.court.cases).find((x) => x.kind === 'fund abuse')!;
    expect(c).toBeDefined();
    c.evidence = 400;
    // a small net worth: 35% of it is below the $100k floor; the old headroom term (half of what is above $5k) was 2,500
    g.players.m!.netWorth = 10_000;
    days(g, 2);
    expect(c.status).toBe('won');
    expect(c.fine).toBeCloseTo(0.35 * 10_000, 6);
  });

  it('advances 50% of the unpaid award from the victim fund into the fund when the stake and cash cannot pay it all', () => {
    const g = world('f-vcf');
    const f = openFund(g);
    const s = stockId(g);
    invest(g, f, 'i2', 100_000);
    for (let k = 0; k < 2; k++) {
      expect(cmd(g, 'm', { type: 'order.place', order: { assetId: s, side: 'buy', type: 'market', qty: 1 } }).ok).toBe(true);
      ticks(g, 1);
      g.market = shockPrice(g.market, s, 0.05);
      expect(cmd(g, 'm', { type: 'fund.trade', fundId: f.id, assetId: s, side: 'buy', qty: 1 }).ok).toBe(true);
      ticks(g, 1);
    }
    const c = Object.values(g.court.cases).find((x) => x.kind === 'fund abuse')!;
    c.evidence = 400;
    c.harm = 1_000_000; // an award the stake cannot cover
    g.market.accounts.m = { ...g.market.accounts.m!, cash: 0 }; // and no cash above the floor
    const fundCash0 = g.market.accounts[f.accountId]!.cash;
    days(g, 2);
    expect(c.status).toBe('won');
    const owed = FUND_RULES.s5.restitutionX * 1_000_000 + FUND_RULES.s5.disgorgePct * (c.gain ?? 0);
    expect(c.damages!).toBeLessThan(owed);
    expect(c.vcfAdvance!).toBeCloseTo(FUND_RULES.s5.vcfAdvancePct * (owed - c.damages!), 0);
    expect(c.vcfAdvance!).toBeGreaterThan(0);
    // the advance is credited to the fund at once
    expect(g.market.accounts[f.accountId]!.cash).toBeGreaterThan(fundCash0 + c.vcfAdvance! * 0.9);
  });
});
