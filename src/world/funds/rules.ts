import { FUND_RULES, FUND_TIME } from '@/content/funds';
import { rankIndex } from '@/content/lifestyle';
import { netWorthBreakdown, sanitize, spendableCash } from '../core';
import type { GameState, Player } from '../types';
import { fundsOf, linked, navOf, navPerUnitOf, ownedValue, unitsHeld } from './state';
import type { Fund, FundFees, FundMandate, FundRefusal } from './types';

/**
 * The rules a fund command must pass before it moves any money: the mandate and fee terms, who may run a fund, and who may
 * invest in one. Each rule returns a refusal code (FundRefusal) or null, so the UI can say what happened and why.
 */

export function validMandate(m: FundMandate | undefined): FundRefusal | null {
  if (!m || !Array.isArray(m.classes) || m.classes.length === 0) return 'fundMandateInvalid';
  const allowed = new Set<string>(FUND_RULES.classes);
  if (new Set(m.classes).size !== m.classes.length) return 'fundMandateInvalid';
  if (!m.classes.every((c) => allowed.has(c))) return 'fundMandateInvalid';
  if (!Number.isFinite(m.maxLeverage) || m.maxLeverage < FUND_RULES.leverageMin || m.maxLeverage > FUND_RULES.leverageMax) return 'fundMandateInvalid';
  if (!Number.isFinite(m.maxPositionPct) || m.maxPositionPct <= 0 || m.maxPositionPct > FUND_RULES.positionMaxPct) return 'fundMandateInvalid';
  return null;
}

export function validFees(fees: FundFees | undefined): FundRefusal | null {
  if (!fees) return 'fundTerms';
  if (!Number.isFinite(fees.mgmt) || fees.mgmt < 0 || fees.mgmt > FUND_RULES.mgmtFeeMax) return 'fundTerms';
  if (!Number.isFinite(fees.perf) || fees.perf < 0 || fees.perf > FUND_RULES.perfFeeMax) return 'fundTerms';
  return null;
}

/** A fund name: control characters stripped, length within the rule. Returns the cleaned name or null. */
export function cleanName(raw: string): string | null {
  const name = sanitize(String(raw ?? ''), FUND_RULES.maxNameLength);
  return name.length >= FUND_RULES.minNameLength ? name : null;
}

/** Who may open a fund: rank, account age, no ban, no conviction within 8 weeks, one fund at a time, and the stake. */
export function managerRefusal(g: GameState, p: Player, stake: number): FundRefusal | null {
  const tick = g.market.tick;
  if (rankIndex(p.rankId) < rankIndex(FUND_RULES.managerMinRank)) return 'fundRank';
  if (tick - p.joinedTick < FUND_TIME.managerAgeTicks) return 'fundAge';
  const fs = fundsOf(g);
  if ((fs.bans[p.id] ?? -Infinity) > tick) return 'fundBanned';
  if (fs.convicted[p.id] !== undefined && tick - fs.convicted[p.id]! < FUND_TIME.eightWeeksTicks) return 'fundConviction';
  const open = Object.values(fs.funds).filter((f) => f.managerId === p.id && f.status !== 'closed').length;
  if (open >= FUND_RULES.maxFundsPerManager) return 'fundOwnsOne';
  if (!Number.isFinite(stake) || stake < FUND_RULES.managerMinStake) return 'fundStake';
  if (spendableCash(g, p.id) < stake) return 'fundCash';
  return null;
}

/** The AUM the fund carries after a deposit: NAV plus deposits waiting to settle. */
export function aumAfter(g: GameState, f: Fund, extra: number): number {
  let pending = 0;
  for (const r of f.requests) if (r.kind === 'deposit') pending += r.amount;
  return Math.max(0, navOf(g, f)) + pending + extra;
}

/**
 * Who may put money into a fund now: the fund is open, the amount is at least the minimum, the manager's stake still covers
 * 10% of AUM and AUM stays within 10x the stake (and the young cap). An investor (not the manager) must also be at least 7
 * real days old, unlinked to the manager, and keep the fund within 25% of their own net worth. Cash must be spendable.
 */
export function depositRefusal(g: GameState, f: Fund, pid: string, amount: number): FundRefusal | null {
  const tick = g.market.tick;
  if (f.status === 'frozen') return 'fundFrozen';
  if (f.status !== 'open') return 'fundClosed';
  if (!Number.isFinite(amount) || amount < FUND_RULES.minDeposit) return 'fundDeposit';
  if (spendableCash(g, pid) < amount) return 'fundCash';
  if (pid !== f.managerId) {
    const p = g.players[pid];
    if (!p || tick - p.joinedTick < FUND_TIME.investorAgeTicks) return 'fundInvestorAge';
    if (linked(g, pid, f.managerId)) return 'fundInvestorLink';
    const nw = netWorthBreakdown(g, pid).total;
    if (ownedValue(g, f, pid) + amount > FUND_RULES.investorMaxNwPct * nw + 1e-6) return 'fundInvestorLimit';
  }
  // a manager's own deposit is his stake, so it counts toward the stake before the check
  const mgrValue = unitsHeld(f, f.managerId) * navPerUnitOf(g, f) + (pid === f.managerId ? amount : 0);
  const aum = aumAfter(g, f, amount);
  if (mgrValue < FUND_RULES.stakeMinPct * aum - 1e-6) return 'fundStakeLow';
  if (aum > FUND_RULES.aumPerStake * mgrValue + 1e-6) return 'fundAumCap';
  if (tick - f.createdTick < FUND_TIME.youngFundTicks && aum > FUND_RULES.youngAumCap) return 'fundAumCap';
  return null;
}

/** Whether anyone other than the manager has units, or a deposit, in the fund: the investors the stake floor protects. */
export function investorsIn(f: Fund): boolean {
  const others = (m: Record<string, number>) => Object.entries(m).some(([pid, u]) => pid !== f.managerId && u > 1e-9);
  return others(f.holders) || others(f.reserved) || f.requests.some((r) => r.kind === 'deposit' && r.investorId !== f.managerId);
}

/**
 * Who may ask to redeem: the fund is open, frozen, or winding (not closed), and the units are the holder's own. The manager's
 * own stake is held at the floor while investors are in (ROADMAP 2.2: at least 10% of AUM and $250k at all times): a
 * manager's redemption that would leave less is refused. Once he is the only holder, the stake may go to zero.
 */
export function redeemRefusal(g: GameState, f: Fund, pid: string, units: number): FundRefusal | null {
  if (f.status === 'closed') return 'fundClosed';
  if (!Number.isFinite(units) || units <= 0) return 'fundRedeem';
  if ((f.holders[pid] ?? 0) + 1e-9 < units) return 'fundRedeem';
  if (pid === f.managerId && (f.status === 'open' || f.status === 'frozen') && investorsIn(f)) {
    const px = navPerUnitOf(g, f);
    const aum = aumAfter(g, f, -units * px);
    const stake = (unitsHeld(f, pid) - units) * px;
    if (stake < Math.max(FUND_RULES.stakeMinPct * aum, FUND_RULES.managerMinStake) - 1e-6) return 'fundStakeLow';
  }
  return null;
}

/** The mandate in force at a tick: a pending change applies once its notice has run out. */
export function mandateAt(f: Fund, tick: number): FundMandate {
  return f.pendingMandate && tick >= f.pendingMandate.effectiveTick ? f.pendingMandate.mandate : f.mandate;
}

