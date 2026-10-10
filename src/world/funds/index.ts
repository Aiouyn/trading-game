import { today } from '../core';
import type { CommandResult, GameState, Command, StepOutput } from '../types';
import { applyDueMandate, absenceDay, recordNav, windProgress } from './risk';
import { accrueDay, crystallize, isQuarterDay } from './fees';
import { payOut, raiseCash, requestDeposit, requestRedeem, settleDay } from './flows';
import { changeMandate, createFund } from './create';
import { fundTrade } from './trade';
import { fundById } from './state';

/**
 * Player-run funds (ROADMAP 2.2, Phase 4 A4): the world's entry points. The day hook runs at the first tick of each game
 * day, after the market has moved, and the fill hook runs after every tick's fills (surveil.ts). Commands arrive through
 * `applyFundCommand`. Everything is deterministic: no random draws, so a snapshot and the command log replay exactly.
 */

export { fundsFills } from './surveil';
export { crossRefusal, fundsBeforeStep, pendingOf } from './guard';
export { publicFund, publicFunds, aumBucketOf } from './view';
export { emptyFunds, fundClaimsOf, fundsOf } from './state';
export { FUND_ACCOUNT_PREFIX } from './state';
export type { Fund, FundFees, FundMandate, FundPublic, FundRefusal, FundsState, FundStatus } from './types';

export type FundCommand = Extract<Command, { type: `fund.${string}` }>;

/** The day close for every fund, in id order: mandate, absence, fees, quarter crystallization, settlement, payouts, cash, NAV. */
export function fundsDay(g: GameState, out: StepOutput | null): void {
  if (!g.funds) return;
  const day = today(g);
  for (const id of Object.keys(g.funds.funds).sort()) {
    const f = g.funds.funds[id]!;
    if (f.status === 'closed' || day <= f.lastDay) continue;
    f.lastDay = day;
    applyDueMandate(g, f, out);
    absenceDay(g, f, out);
    accrueDay(g, f);
    if (isQuarterDay(day)) crystallize(g, f);
    settleDay(g, f, out);
    payOut(g, f, out);
    raiseCash(g, f);
    recordNav(g, f, day, out);
    windProgress(g, f, out);
  }
}

/** A fund command from a player. Refusals are returned as codes (FundRefusal), with the copy in en.json and fr.json. */
export function applyFundCommand(g: GameState, pid: string, cmd: FundCommand, out: StepOutput | null): CommandResult {
  switch (cmd.type) {
    case 'fund.create': {
      const p = g.players[pid];
      if (!p) return { ok: false, error: 'fundNotManager' };
      return createFund(g, p, cmd, out);
    }
    case 'fund.mandate': return changeMandate(g, pid, cmd.fundId, cmd.mandate, out);
    case 'fund.trade': return fundTrade(g, pid, cmd);
    case 'fund.deposit': {
      const f = fundById(g, cmd.fundId);
      if (!f) return { ok: false, error: 'fundNoFund' };
      return requestDeposit(g, pid, f, cmd.amount, out);
    }
    case 'fund.redeem': {
      const f = fundById(g, cmd.fundId);
      if (!f) return { ok: false, error: 'fundNoFund' };
      return requestRedeem(g, pid, f, cmd.units, out);
    }
  }
}
