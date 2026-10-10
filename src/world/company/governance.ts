import { COMPANY } from '@/content/company';
import { post } from './books';
import { salaryCapPerDay, recordPayout } from './failure';
import type { CompanyEnv, Outcome } from './company';
import type { Company, CompanyReject, CompanyWorld, ExecRole, ExecTrait, Executive, Holder } from './types';

/**
 * Governance of a company (quant-company-building v1.7 spec 9.1, and DECISIONS C4): who controls it, the CEO change and
 * its freeze, executives with traits, the guarantee of company debt, and the board vote. Pure over the company world: the
 * bridge moves engine state (the freeze) from the results. Numbers are in content/company.ts (governance).
 */

export const EXEC_ROLES: ExecRole[] = ['CEO', 'CFO', 'COO', 'CTO'];
export const EXEC_TRAITS = Object.keys(COMPANY.governance.exec.traits) as ExecTrait[];

/** The controlling holder (more than half the votes) is a founder, which in v1 is the only way to control (spec 9.1). */
export function controllerOf(c: Company): string | null {
  for (const [h, s] of Object.entries(c.capTable)) {
    if (h.startsWith('founder:') && s > c.shares / 2) return h.slice('founder:'.length);
  }
  return null;
}

/** The refusal for a governance command: a bankrupt company is closed, and only its controller may act on it. */
function gate(c: Company, playerId: string): CompanyReject | null {
  if (c.bankrupt) return { code: 'companyBankrupt' };
  if (controllerOf(c) !== playerId) return { code: 'notController' };
  return null;
}

/**
 * The multiplier an executive's trait puts on one coefficient (1 when no executive has the trait). The product over all
 * executives, so two executives with a trait on the same coefficient both count.
 */
export function execMult(c: Company, key: 'capacity' | 'rd' | 'wages' | 'demand' | 'cancel'): number {
  let m = 1;
  for (const e of Object.values(c.execs ?? {})) {
    if (!e) continue;
    const t = COMPANY.governance.exec.traits[e.trait];
    if (t.key === key) m *= 1 + t.size;
  }
  return m;
}

/** Hires an executive into an empty seat. A player's salary is capped (CB-050), and the company needs the runway of wages. */
export function hireExec(
  c: Company, env: CompanyEnv, playerId: string,
  args: { role: ExecRole; trait: ExecTrait; holder: Holder },
): Outcome<{ role: ExecRole; salary: number }> {
  const deny = gate(c, playerId);
  if (deny) return { ok: false, reject: deny };
  if (!EXEC_ROLES.includes(args.role) || !EXEC_TRAITS.includes(args.trait)) return { ok: false, reject: { code: 'unknownAction' } };
  if (c.execs?.[args.role]) return { ok: false, reject: { code: 'execFilled', role: args.role } };
  const salary = COMPANY.governance.exec.salary[args.role];
  if (args.holder.kind === 'player') {
    const cap = salaryCapPerDay(c);
    if (salary > cap) return { ok: false, reject: { code: 'execSalaryCap', cap } };
  }
  const need = salary * COMPANY.hireRunwayDays;
  if (c.cash < need) return { ok: false, reject: { code: 'insufficientFunds', shortfall: need - c.cash } };
  const ex: Executive = {
    role: args.role, trait: args.trait, holder: args.holder, hiredDay: env.day,
    termEnd: env.day + COMPANY.governance.exec.termDays, salary,
  };
  c.execs = { ...(c.execs ?? {}), [args.role]: ex };
  return { ok: true, value: { role: args.role, salary } };
}

/**
 * Lets an executive go: refused before the minimum term ends (`execTerm`). Severance is 21 gd of salary, a sink when the
 * executive is an NPC, and a transfer to the player's account when the holder is a player.
 */
export function fireExec(
  w: CompanyWorld, c: Company, env: CompanyEnv, playerId: string, role: ExecRole,
): Outcome<{ severance: number }> {
  const deny = gate(c, playerId);
  if (deny) return { ok: false, reject: deny };
  const ex = c.execs?.[role];
  if (!ex) return { ok: false, reject: { code: 'execNotFound', role } };
  if (env.day < ex.termEnd) return { ok: false, reject: { code: 'execTerm', untilDay: ex.termEnd } };
  const sev = ex.salary * COMPANY.governance.exec.severanceDays;
  if (ex.holder.kind === 'player') {
    post(w, c, env.day, 'severance', -sev, true);
    env.money.give?.(ex.holder.playerId, sev);
  } else {
    post(w, c, env.day, 'severance', -sev);
  }
  const next = { ...(c.execs ?? {}) };
  delete next[role];
  c.execs = next;
  return { ok: true, value: { severance: sev } };
}

/**
 * The day's executive salaries, paid from the opening cash (mandatory: a salary can take cash below zero, which is the
 * distress state). A player's salary is a covered payment (CB-044): its excess over the cap is clawable, and the executive
 * is an insider for the backstop.
 */
export function execDay(w: CompanyWorld, c: Company, env: CompanyEnv, day: number): void {
  for (const role of EXEC_ROLES) {
    const ex = c.execs?.[role];
    if (!ex) continue;
    if (ex.holder.kind === 'npc') {
      post(w, c, day, 'execSalary', -ex.salary);
      continue;
    }
    const pid = ex.holder.playerId;
    post(w, c, day, 'execSalary', -ex.salary, true);
    env.money.give?.(pid, ex.salary);
    recordPayout(c, {
      day, toPlayerId: pid, amount: ex.salary, covered: Math.max(0, ex.salary - salaryCapPerDay(c)), kind: 'salary',
      termsDay: ex.hiredDay, flagged: false, insider: true,
    });
  }
}

/**
 * Announces a CEO change (spec 9.1, X7). Only the controlling holder can call it. The change is public on the announcement
 * day A and takes effect at the open of A + 10. The freeze of the departing CEO runs from A to A + 10 + 21, and the ex-CEO
 * cannot return for 252 gd. A pending change cannot be replaced. The board's vote on it is the controller's own shares,
 * and the NPC pools abstain (no price is involved), so it passes by construction.
 */
export function announceCeoChange(
  c: Company, env: CompanyEnv, playerId: string, successor: Holder,
): Outcome<{ effectiveDay: number; freezeUntil: number }> {
  const deny = gate(c, playerId);
  if (deny) return { ok: false, reject: deny };
  if (c.ceoChange) return { ok: false, reject: { code: 'ceoChangePending', untilDay: c.ceoChange.effectiveDay } };
  if (successor.kind === 'player' && c.exCeo && c.exCeo.playerId === successor.playerId && env.day < c.exCeo.untilDay) {
    return { ok: false, reject: { code: 'exCeoCooling', untilDay: c.exCeo.untilDay } };
  }
  const K = COMPANY.governance.ceo;
  const effectiveDay = env.day + K.noticeDays;
  const freezeUntil = effectiveDay + K.exitFreezeDays;
  c.ceoChange = { announcedDay: env.day, effectiveDay, successor, exPlayerId: playerId };
  c.ceoFreeze = { playerId, untilDay: freezeUntil };
  return { ok: true, value: { effectiveDay, freezeUntil } };
}

/** At the open of the effective day the successor takes the seat and the ex-CEO's cooling starts (spec 9.1). */
export function ceoDay(c: Company, day: number): Holder | null {
  const ch = c.ceoChange;
  if (!ch || day < ch.effectiveDay) return null;
  c.ceo = ch.successor;
  c.exCeo = { playerId: ch.exPlayerId, untilDay: ch.effectiveDay + COMPANY.governance.ceo.cooldownDays };
  c.ceoChange = null;
  return ch.successor;
}

/** The day the departing CEO's freeze lifts, if the freeze holds for this player on this day (spec 9.1). */
export function ceoFreezeOn(c: Company, playerId: string, day: number): number | null {
  const f = c.ceoFreeze;
  if (!f || f.playerId !== playerId || day >= f.untilDay) return null;
  return f.untilDay;
}

/**
 * The guarantee: the founder's personal promise to cover company debts up to `amount`. The cap is a share of the founder's
 * cash at signing (a proxy for net worth, which the company world does not see). A zero amount removes the guarantee.
 */
export function setGuarantee(
  c: Company, env: CompanyEnv, playerId: string, amount: number,
): Outcome<{ amount: number }> {
  const deny = gate(c, playerId);
  if (deny) return { ok: false, reject: deny };
  if (!(Number.isFinite(amount) && amount >= 0)) return { ok: false, reject: { code: 'negativeAmount' } };
  const max = Math.floor(COMPANY.governance.guaranteeMaxShare * Math.max(0, env.money.cash(playerId)));
  if (amount > max) return { ok: false, reject: { code: 'guaranteeTooHigh', max } };
  c.guarantee = amount > 0 ? { playerId, amount } : null;
  return { ok: true, value: { amount } };
}

export interface BoardVote {
  yes: number;
  no: number;
  passed: boolean;
}

/**
 * A board vote, share-weighted (C4). The controller's shares vote `founderVote`. An NPC investor pool votes by rule: yes
 * when `price` is at or above `fairPerShare`, else no; or it abstains when `npcRule` is 'abstain' (no price involved). The
 * vote passes when yes shares exceed no shares, so a tie fails.
 */
export function boardVote(
  c: Company,
  o: { founderVote: 'yes' | 'no'; price?: number; fairPerShare?: number; npcRule: 'price' | 'abstain' },
): BoardVote {
  let yes = 0;
  let no = 0;
  for (const [holder, s] of Object.entries(c.capTable)) {
    if (holder.startsWith('founder:')) {
      if (o.founderVote === 'yes') yes += s;
      else no += s;
      continue;
    }
    if (o.npcRule === 'abstain') continue;
    const approve = o.price !== undefined && o.fairPerShare !== undefined && o.price >= o.fairPerShare;
    if (approve) yes += s;
    else no += s;
  }
  return { yes, no, passed: yes > no };
}
