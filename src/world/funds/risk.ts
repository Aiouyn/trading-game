import { placeOrder, setAccountPermissions } from '@/engine';
import { FUND_RULES, FUND_TICKS_PER_DAY, FUND_TIME } from '@/content/funds';
import { TPD } from '../core';
import type { GameState, StepOutput } from '../types';
import { payOut, tellHolders } from './flows';
import { crystallize } from './fees';
import { navOf, requestSeq, unitsOf } from './state';
import type { Fund } from './types';

/**
 * The day-level rules of a fund: a mandate change takes effect when its notice runs out; a manager away for 72 real hours
 * freezes trading and opens redemptions gate-free (the freeze lifts if they come back); a freeze that lasts 14 game days
 * winds the fund down at market; and a 30% fall from the one-week high trips the breaker for a game day.
 */

/** Apply a due mandate change: the new mandate, and the account's leverage. */
export function applyDueMandate(g: GameState, f: Fund, out: StepOutput | null): void {
  const pending = f.pendingMandate;
  if (!pending || g.market.tick < pending.effectiveTick) return;
  f.mandate = pending.mandate;
  f.pendingMandate = null;
  g.market = setAccountPermissions(g.market, f.accountId, { maxLeverage: f.mandate.maxLeverage, canShort: false });
  tellHolders(g, f, out, { key: 'funds.mandate.applied', vars: { fund: f.name } });
}

/** A manager away 72 real hours freezes trading; back again, the freeze lifts; frozen 14 game days, the fund winds down. */
export function absenceDay(g: GameState, f: Fund, out: StepOutput | null): void {
  const tick = g.market.tick;
  if (f.status !== 'open' && f.status !== 'frozen') return;
  const m = g.players[f.managerId];
  const absent = !m || tick - m.lastSeenTick >= FUND_TIME.absentFreezeTicks;
  if (f.status === 'open' && absent) {
    f.status = 'frozen';
    f.frozenTick = tick;
    tellHolders(g, f, out, { key: 'funds.frozen', vars: { fund: f.name, hours: FUND_TIME.absentFreezeTicks / FUND_TICKS_PER_DAY, days: FUND_TIME.windDownDays } });
  } else if (f.status === 'frozen' && !absent) {
    f.status = 'open';
    f.frozenTick = null;
    tellHolders(g, f, out, { key: 'funds.thawed', vars: { fund: f.name } });
  } else if (f.status === 'frozen' && tick - (f.frozenTick ?? tick) >= FUND_TIME.windDownDays * TPD) {
    startWindDown(g, f, out);
  }
}

/** Wind-down: every holder's units are redeemed (gate-free, as the fund is no longer open), and the positions go to market. */
export function startWindDown(g: GameState, f: Fund, out: StepOutput | null): void {
  f.status = 'winding';
  f.windDownTick = g.market.tick;
  f.frozenTick = null;
  f.pendingMandate = null;
  for (const pid of Object.keys(f.holders)) {
    const u = f.holders[pid]!;
    delete f.holders[pid];
    if (!(u > 0)) continue;
    f.reserved[pid] = (f.reserved[pid] ?? 0) + u;
    f.requests.push({ id: requestSeq(f), kind: 'redeem', investorId: pid, amount: 0, units: u, tick: g.market.tick });
  }
  tellHolders(g, f, out, { key: 'funds.windDown', vars: { fund: f.name } });
}

/** A winding fund sells its longs at market while none of its own orders are open, and closes when nothing is left to pay. */
export function windProgress(g: GameState, f: Fund, out: StepOutput | null): void {
  if (f.status !== 'winding') return;
  const acct = g.market.accounts[f.accountId];
  const openOwn = g.market.orders.some((o) => o.status === 'open' && o.playerId === f.accountId);
  if (acct && !openOwn) {
    for (const [id, p] of Object.entries(acct.positions)) {
      if (!(p.qty > 1e-9)) continue;
      const r = placeOrder(g.market, { playerId: f.accountId, assetId: id, side: 'sell', type: 'market', qty: p.qty, tif: 'gtc' });
      g.market = r.state;
    }
  }
  if (unitsOf(f) === 0 && f.requests.length === 0) {
    crystallize(g, f);
    payOut(g, f, out);
  }
  const positions = acct ? Object.values(acct.positions).some((p) => Math.abs(p.qty) > 1e-9) : false;
  const owed = Object.keys(f.payable).length > 0 || f.feePayable > 1e-9 || f.feeAccrued > 1e-9;
  if (!positions && !owed && unitsOf(f) === 0 && f.requests.length === 0) {
    f.status = 'closed';
    tellHolders(g, f, out, { key: 'funds.closed', vars: { fund: f.name } });
  }
}

/**
 * The day-close record: NAV per unit and AUM go on the public history, and the breaker trips when NAV per unit is at least
 * 30% below its high over the last game week.
 */
export function recordNav(g: GameState, f: Fund, day: number, out: StepOutput | null): void {
  const nav = navOf(g, f);
  const units = unitsOf(f);
  const px = units > 0 ? nav / units : f.navPerUnit;
  f.navPerUnit = px;
  f.navHist.push({ day, navPerUnit: px, aum: Math.max(0, nav) });
  if (f.navHist.length > FUND_RULES.navHistoryKeep) f.navHist.splice(0, f.navHist.length - FUND_RULES.navHistoryKeep);
  const peak = f.navHist.filter((h) => h.day > day - FUND_TIME.breakerWindowDays).reduce((m, h) => Math.max(m, h.navPerUnit), 0);
  if (peak > 0 && px <= (1 - FUND_RULES.breakerDropPct) * peak) {
    f.breakerUntil = g.market.tick + FUND_TIME.breakerFreezeTicks;
    tellHolders(g, f, out, { key: 'funds.breaker', vars: { fund: f.name, pct: Math.round(FUND_RULES.breakerDropPct * 100) } });
  }
}
