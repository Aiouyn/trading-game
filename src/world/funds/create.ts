import { openAccount, setAccountPermissions } from '@/engine';
import { FUND_TICKS_PER_DAY, FUND_TIME } from '@/content/funds';
import { today, transfer } from '../core';
import { say } from '../say';
import { usd } from '../text/template';
import type { CommandResult, GameState, Player, StepOutput } from '../types';
import { FUND_ACCOUNT_PREFIX, fundById, navOf } from './state';
import { cleanName, managerRefusal, validFees, validMandate } from './rules';
import type { Fund, FundFees, FundMandate, FundRefusal, FundsState } from './types';

/**
 * Opening a fund and changing its mandate. Opening moves the manager's stake into a new engine account (the fund's custody)
 * and issues the stake's units at NAV 1. A mandate change needs 24 real hours of notice, and takes effect by itself.
 */

const fail = (error: FundRefusal): CommandResult => ({ ok: false, error });
const ok = (data?: unknown): CommandResult => ({ ok: true, ...(data !== undefined ? { data } : {}) });

export function createFund(
  g: GameState, p: Player, a: { name: string; mandate: FundMandate; fees: FundFees; stake: number }, out: StepOutput | null,
): CommandResult {
  const name = cleanName(a.name);
  if (!name) return fail('fundTerms');
  const mErr = validMandate(a.mandate);
  if (mErr) return fail(mErr);
  const fErr = validFees(a.fees);
  if (fErr) return fail(fErr);
  const rErr = managerRefusal(g, p, a.stake);
  if (rErr) return fail(rErr);

  const fs: FundsState = (g.funds ??= { funds: {}, seq: 0, bans: {}, convicted: {} });
  fs.seq++;
  const id = `fund${fs.seq}`;
  const accountId = `${FUND_ACCOUNT_PREFIX}${id}`;
  g.market = openAccount(g.market, accountId, 0);
  g.market = setAccountPermissions(g.market, accountId, { maxLeverage: a.mandate.maxLeverage, canShort: false, canOptions: false });
  transfer(g, p.id, accountId, a.stake);
  const f: Fund = {
    id, name, managerId: p.id, accountId, createdTick: g.market.tick,
    mandate: { classes: [...a.mandate.classes], maxLeverage: a.mandate.maxLeverage, maxPositionPct: a.mandate.maxPositionPct },
    pendingMandate: null, fees: { mgmt: a.fees.mgmt, perf: a.fees.perf }, status: 'open', frozenTick: null, windDownTick: null,
    holders: { [p.id]: a.stake }, reserved: {}, payable: {}, feeAccrued: 0, feePayable: 0, hwm: 1, navPerUnit: 1,
    requests: [], reqSeq: 0, depositedTick: { [p.id]: g.market.tick }, breakerUntil: -1,
    navHist: [{ day: today(g), navPerUnit: 1, aum: a.stake }], lastDay: today(g), managerFills: [], filings: [],
    caseId: null, evidence: 0, harm: 0, managerReceived: 0, managerEntitled: 0, credited: {}, paidOut: {},
  };
  fs.funds[id] = f;
  say(g, out, p.id, 'fund', 'brass', { key: 'funds.created', vars: { fund: name, stake: usd(a.stake) } });
  return ok({ id, accountId, nav: navOf(g, f) });
}

/** The manager's mandate change: validated now, in force after 24 real hours (the notice gate-free redemptions run in). */
export function changeMandate(g: GameState, pid: string, fundId: string, mandate: FundMandate, out: StepOutput | null): CommandResult {
  const f = fundById(g, fundId);
  if (!f) return fail('fundNoFund');
  if (f.managerId !== pid) return fail('fundNotManager');
  if (f.status === 'closed' || f.status === 'winding') return fail('fundClosed');
  const mErr = validMandate(mandate);
  if (mErr) return fail(mErr);
  f.pendingMandate = {
    mandate: { classes: [...mandate.classes], maxLeverage: mandate.maxLeverage, maxPositionPct: mandate.maxPositionPct },
    effectiveTick: g.market.tick + FUND_TIME.mandateNoticeTicks,
  };
  for (const h of Object.keys(f.holders)) say(g, out, h, 'fund', 'warn', { key: 'funds.mandate.notice', vars: { fund: f.name, hours: Math.round(FUND_TIME.mandateNoticeTicks / FUND_TICKS_PER_DAY) } });
  return ok({ effectiveTick: f.pendingMandate.effectiveTick });
}

