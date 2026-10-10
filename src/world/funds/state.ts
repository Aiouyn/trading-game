import { equityOf, type WorldState } from '@/engine';
import type { GameState } from '../types';
import type { Fund, FundsState } from './types';

/**
 * The fund arithmetic. NAV is the fund account's equity less what the fund owes (accrued and crystallized fees, redemption
 * payouts not yet paid, and deposits waiting for the next day close). Units share NAV. Every claim on the fund (a holder's
 * units, a holder's payable, a manager's fees, a pending deposit) adds up to the fund's equity: that identity is the
 * NAV-conservation invariant the property test checks.
 */

export const FUND_ACCOUNT_PREFIX = 'FUND:';

export function emptyFunds(): FundsState {
  return { funds: {}, seq: 0, bans: {}, convicted: {} };
}

/** The funds state, or an empty one for a save made before funds existed (read paths only: it does not create the field). */
export function fundsOf(g: GameState): FundsState {
  return g.funds ?? emptyFunds();
}

export function fundById(g: GameState, id: string): Fund | undefined {
  return g.funds?.funds[id];
}

/** The manager's fund that is not closed, or undefined. */
export function managedBy(g: GameState, pid: string): Fund | undefined {
  return Object.values(g.funds?.funds ?? {}).find((f) => f.managerId === pid && f.status !== 'closed');
}

export function fundByAccount(g: GameState, accountId: string): Fund | undefined {
  return Object.values(g.funds?.funds ?? {}).find((f) => f.accountId === accountId);
}

/** Two accounts are linked when they are the same player, or members of one alliance (the rule the investor and self-match checks use). */
export function linked(g: GameState, a: string, b: string): boolean {
  if (a === b) return true;
  const pa = g.players[a];
  const pb = g.players[b];
  return !!pa?.allianceId && pa.allianceId === pb?.allianceId;
}

export function fundEquity(world: WorldState, f: Fund): number {
  const acct = world.accounts[f.accountId];
  return acct ? equityOf(world, acct) : 0;
}

/** Dollars the fund owes: fees, redemption payouts, and deposits waiting for the next day close. */
export function liabilitiesOf(f: Fund): number {
  let l = f.feeAccrued + f.feePayable;
  for (const v of Object.values(f.payable)) l += v;
  for (const r of f.requests) if (r.kind === 'deposit') l += r.amount;
  return l;
}

/** Units outstanding: held plus reserved for redemption. */
export function unitsOf(f: Fund): number {
  let u = 0;
  for (const v of Object.values(f.holders)) u += v;
  for (const v of Object.values(f.reserved)) u += v;
  return u;
}

export function navOf(g: GameState, f: Fund): number {
  return fundEquity(g.market, f) - liabilitiesOf(f);
}

/** NAV per unit now (the live mark). With no units outstanding, the last day close's price stands. */
export function navPerUnitOf(g: GameState, f: Fund): number {
  const u = unitsOf(f);
  return u > 0 ? navOf(g, f) / u : f.navPerUnit;
}

export function unitsHeld(f: Fund, pid: string): number {
  return (f.holders[pid] ?? 0) + (f.reserved[pid] ?? 0);
}

/**
 * What a player holds in funds, in dollars: units at NAV, deposits waiting to settle, redemption payouts owed, and (for a
 * manager) fees accrued or owed. Net worth counts it, so moving cash into a fund is not a loss of rank.
 */
export function fundClaimsOf(g: GameState, pid: string): number {
  const funds = g.funds?.funds;
  if (!funds) return 0;
  let total = 0;
  for (const f of Object.values(funds)) {
    const u = unitsHeld(f, pid);
    if (u > 0) total += u * navPerUnitOf(g, f);
    total += f.payable[pid] ?? 0;
    for (const r of f.requests) if (r.kind === 'deposit' && r.investorId === pid) total += r.amount;
    if (pid === f.managerId) total += f.feeAccrued + f.feePayable;
  }
  return total;
}

/** A holder's fund units for the 25%-of-NW check and the public filing (the manager's stake counts). */
export function ownedValue(g: GameState, f: Fund, pid: string): number {
  return unitsHeld(f, pid) * navPerUnitOf(g, f) + (f.payable[pid] ?? 0) + f.requests.reduce((s, r) => s + (r.kind === 'deposit' && r.investorId === pid ? r.amount : 0), 0);
}

/** The largest holder other than the manager (the case's plaintiff stands for the holders), or null. */
export function victimOf(f: Fund): string | null {
  let best: string | null = null;
  let bestUnits = 0;
  for (const [pid, u] of Object.entries(f.holders)) {
    if (pid === f.managerId) continue;
    if (u > bestUnits || (u === bestUnits && best !== null && pid < best)) { best = pid; bestUnits = u; }
  }
  return best;
}

export function requestSeq(f: Fund): string {
  f.reqSeq++;
  return `q${f.reqSeq}`;
}
