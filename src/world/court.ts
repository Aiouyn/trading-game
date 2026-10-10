import { TPD, cashOf, credit, creditExternal, debit, keyedRng, notify, pushWire, transfer } from './core';
import { FUND_RULES, FUND_TIME } from '@/content/funds';
import { cancelStake } from './funds/flows';
import { emptyFunds, fundById } from './funds/state';
import { startWindDown } from './funds/risk';
import { say } from './say';
import { usd } from './text/template';
import type { CommandResult, CourtCase, GameState, Player, StepOutput } from './types';

/**
 * Courts (bible 03 §8–§10). A case needs evidence points against a filing bar (civil 40,
 * tribunal 55, criminal 70). The verdict is a logistic on (evidence − bar), and counsel can shift
 * it by at most ±0.75 logit, so money can't buy a verdict. Fines are a share of net worth by
 * severity, 85% destroyed, 10% to the victim, 5% to the whistleblower fund. Nothing takes a player
 * below $5,000 (the floor). Held is a temporary freeze (≤ 24 game days), never a wipe.
 */

export const COUNSEL_COST = [0, 5_000, 25_000, 120_000];
const HEARING_DAYS = 2;

const SEVERITY = [
  { pct: 0.001, floor: 1_000, cap: 5_000_000 },
  { pct: 0.005, floor: 5_000, cap: 25_000_000 },
  { pct: 0.01, floor: 10_000, cap: 100_000_000 },
  { pct: 0.03, floor: 50_000, cap: Infinity },
  { pct: 0.08, floor: 100_000, cap: Infinity },
  { pct: 0.15, floor: 250_000, cap: Infinity },
];

export const FLOOR = 5_000;

function evidenceFor(g: GameState, plaintiffId: string, defendantId: string, kind: CourtCase['kind']): number {
  if (kind === 'loan default') {
    const d = Object.values(g.deals).find((x) => x.status === 'defaulted' && x.fromId === plaintiffId && x.toId === defendantId);
    return d ? 80 : 0;
  }
  let ev = g.cyber.evidence[`${defendantId}>${plaintiffId}`] ?? 0;
  if (kind === 'model theft') {
    // watermark residue in the defendant's distilled models; forensics research doubles it
    const forensic = g.lab[plaintiffId]?.research.includes('watermark') ? 2 : 1;
    const residue = (g.lab[defendantId]?.models ?? []).filter((m) => m.residue > 0).reduce((s, m) => Math.max(s, m.residue), 0);
    ev += residue * 60 * forensic;
  }
  return ev;
}

/**
 * Open a case the world files for a player: a fund abuse case from front-running surveillance (funds/surveil.ts). The evidence
 * is the snapshot at filing, and the verdict is the same logistic as any case, against the bar of its kind.
 */
export function openCase(
  g: GameState, plaintiffId: string, defendantId: string, kind: CourtCase['kind'], evidence: number, out: StepOutput | null,
  extra: { harm?: number; gain?: number; fundId?: string } = {},
): CourtCase {
  g.court.seq++;
  const id = `case${g.court.seq}`;
  const bar = kind === 'model theft' ? 55 : kind === 'fund abuse' ? FUND_RULES.civilBar : 40;
  const c: CourtCase = {
    id, plaintiffId, defendantId, kind, evidence, bar, counselPlaintiff: 0, counselDefendant: 0,
    filedTick: g.market.tick, hearingTick: g.market.tick + HEARING_DAYS * TPD, status: 'filed', damages: 0, fine: 0,
    ...(extra.harm !== undefined ? { harm: extra.harm } : {}), ...(extra.gain !== undefined ? { gain: extra.gain } : {}),
    ...(extra.fundId ? { fundId: extra.fundId } : {}),
  };
  g.court.cases[id] = c;
  say(g, out, defendantId, 'court', 'warn', { key: 'funds.court.opened', vars: { days: HEARING_DAYS } });
  return c;
}

export function fileCase(g: GameState, pid: string, defendantId: string, kind: CourtCase['kind'], counsel: number, out: StepOutput | null): CommandResult {
  const d = g.players[defendantId];
  if (!d || defendantId === pid) return { ok: false, error: 'pick a defendant' };
  if (!['cyber intrusion', 'model theft', 'loan default', 'contract breach'].includes(kind)) return { ok: false, error: 'unknown claim' };
  if (Object.values(g.court.cases).some((c) => c.status === 'filed' && c.plaintiffId === pid && c.defendantId === defendantId)) return { ok: false, error: 'you already have a case open against them' };
  const lvl = Math.max(0, Math.min(3, Math.round(counsel)));
  const filingFee = 2_000 + COUNSEL_COST[lvl]!;
  if (cashOf(g, pid) < filingFee) return { ok: false, error: 'not enough cash for fees' };
  const evidence = evidenceFor(g, pid, defendantId, kind);
  const bar = kind === 'model theft' ? 55 : 40;
  if (evidence < bar * 0.5) return { ok: false, error: `not enough evidence (${Math.round(evidence)} of ${bar} points)` };
  debit(g, pid, filingFee, 'legal fees');
  g.court.seq++;
  const id = `case${g.court.seq}`;
  g.court.cases[id] = {
    id, plaintiffId: pid, defendantId, kind, evidence, bar, counselPlaintiff: lvl, counselDefendant: 0,
    filedTick: g.market.tick, hearingTick: g.market.tick + HEARING_DAYS * TPD, status: 'filed', damages: 0, fine: 0,
  };
  // evidence is consumed by the case
  delete g.cyber.evidence[`${defendantId}>${pid}`];
  notify(g, out, defendantId, { kind: 'court', tone: 'warn', text: `${g.players[pid]!.handle} is suing you for ${kind}. Hearing in ${HEARING_DAYS} game days. You can offer a settlement.` });
  pushWire(g, out, { kind: 'court', tag: 'Court', tone: 'warn', text: `${g.players[pid]!.handle} sues ${d.handle} for ${kind}` });
  return { ok: true, data: { id } };
}

export function offerSettlement(g: GameState, pid: string, caseId: string, amount: number, out: StepOutput | null): CommandResult {
  const c = g.court.cases[caseId];
  if (!c || c.defendantId !== pid || c.status !== 'filed') return { ok: false, error: 'no open case against you' };
  if (!(amount > 0) || cashOf(g, pid) < amount) return { ok: false, error: 'enter an amount you can pay' };
  c.settlementOffer = amount;
  notify(g, out, c.plaintiffId, { kind: 'court', tone: 'info', text: `${g.players[pid]!.handle} offers $${Math.round(amount).toLocaleString('en-US')} to settle.` });
  return { ok: true };
}

export function acceptSettlement(g: GameState, pid: string, caseId: string, out: StepOutput | null): CommandResult {
  const c = g.court.cases[caseId];
  if (!c || c.plaintiffId !== pid || c.status !== 'filed' || !c.settlementOffer) return { ok: false, error: 'no settlement on the table' };
  const amt = Math.min(c.settlementOffer, cashOf(g, c.defendantId));
  transfer(g, c.defendantId, c.plaintiffId, amt);
  c.status = 'settled';
  c.damages = amt;
  c.verdictText = `Settled for $${Math.round(amt).toLocaleString('en-US')}`;
  notify(g, out, c.defendantId, { kind: 'court', tone: 'info', text: `Your settlement was accepted.` });
  return { ok: true };
}

/** Per tick: hold hearings that are due. */
export function courtTick(g: GameState, out: StepOutput): void {
  for (const c of Object.values(g.court.cases)) {
    if (c.status !== 'filed' || g.market.tick < c.hearingTick) continue;
    const rng = keyedRng(g, `verdict:${c.id}`);
    const counsel = Math.max(-0.75, Math.min(0.75, 0.25 * (c.counselPlaintiff - c.counselDefendant)));
    const z = (c.evidence - c.bar) / 12 + counsel;
    const p = 1 / (1 + Math.exp(-z));
    const won = rng.chance(p);
    const pl = g.players[c.plaintiffId];
    const df = g.players[c.defendantId];
    if (!pl || !df) { c.status = 'dismissed'; continue; }
    if (!won) {
      c.status = 'lost';
      c.verdictText = `Case dismissed (${Math.round(p * 100)}% odds on the evidence).`;
      notify(g, out, c.plaintiffId, { kind: 'court', tone: 'loss', text: `You lost the case against ${df.handle}. ${c.verdictText}` });
      notify(g, out, c.defendantId, { kind: 'court', tone: 'gain', text: `The case brought by ${pl.handle} was dismissed.` });
      continue;
    }
    c.status = 'won';
    pl.stats.casesWon++;
    if (c.kind === 'fund abuse') { fundVerdict(g, c, out, df); continue; }
    const sevIdx = c.kind === 'model theft' ? 3 : c.kind === 'cyber intrusion' ? 2 : 1;
    const sev = SEVERITY[sevIdx]!;
    const headroom = Math.max(0, df.netWorth - FLOOR);
    const fine = Math.min(headroom * 0.5, Math.min(sev.cap, Math.max(sev.floor, df.netWorth * sev.pct)));
    let damages = 0;
    if (c.kind === 'loan default') {
      const d = Object.values(g.deals).find((x) => x.status === 'defaulted' && x.fromId === c.plaintiffId && x.toId === c.defendantId);
      damages = Math.min(headroom - fine, d?.outstanding ?? 0);
      if (d) { d.status = 'repaid'; d.paid += damages; d.outstanding = 0; }
    } else {
      damages = Math.min(headroom - fine, Math.max(10_000, df.netWorth * 0.01));
    }
    damages = Math.max(0, damages);
    // the court collects from cash; the account may go negative and is then a margin loan
    transfer(g, c.defendantId, c.plaintiffId, damages);
    // 85% destroyed, 5% to the whistleblower fund (also out of circulation), 10% to the victim. The fine is a cost to the
    // defendant, the same as legal fees, so it stays in their day and arrival figures. The victim's share is a payment from
    // another player, so it is kept out of theirs, the same as damages.
    debit(g, c.defendantId, fine, 'fines');
    creditExternal(g, c.plaintiffId, fine * 0.1, 'victim fund');
    c.damages = damages;
    c.fine = fine;
    df.reputation -= 5;
    df.notoriety += 2;
    if (c.kind === 'model theft' && c.evidence >= 70) df.heldUntil = g.market.tick + 24 * TPD;
    c.verdictText = `Liable: $${Math.round(damages).toLocaleString('en-US')} in damages and a $${Math.round(fine).toLocaleString('en-US')} fine${df.heldUntil > g.market.tick ? '; assets held for 24 game days' : ''}.`;
    notify(g, out, c.plaintiffId, { kind: 'court', tone: 'gain', text: `You won against ${df.handle}. ${c.verdictText}` });
    notify(g, out, c.defendantId, { kind: 'court', tone: 'loss', text: `Verdict for ${pl.handle}. ${c.verdictText}` });
    pushWire(g, out, { kind: 'court', tag: 'Verdict', tone: 'loss', text: `Court finds ${df.handle} liable for ${c.kind}; ${pl.handle} awarded damages` });
  }
}

/**
 * The S5 verdict on a fund abuse (ROADMAP 2.2, 03 §9.6 and §9.9). The fine is 8% of net worth, floor $100k, at most 35% of net
 * worth. The award is 100% disgorgement of the manager's gain on the flagged trades, plus restitution of 1.5x the harm to the
 * fund. The manager's stake pays first (its units are cancelled up to the award, which raises the other holders' share of NAV),
 * then cash down to the court floor. What is still unpaid gets an advance of 50% from the Victim Compensation Fund, credited to
 * the fund at once (the recovery from garnishment is not modelled yet). The manager is banned from opening a fund for 8 real
 * weeks, and the convicted fund winds down.
 */
function fundVerdict(g: GameState, c: CourtCase, out: StepOutput | null, df: Player): void {
  const pl = g.players[c.plaintiffId]!;
  const s5 = FUND_RULES.s5;
  const nw = df.netWorth;
  const fine = Math.max(0, Math.min(s5.capPct * nw, Math.max(s5.floor, nw * s5.pct)));
  debit(g, c.defendantId, fine, 'fines');
  const owed = s5.disgorgePct * (c.gain ?? 0) + s5.restitutionX * (c.harm ?? 0);
  let paid = 0;
  let advance = 0;
  const f = c.fundId ? fundById(g, c.fundId) : undefined;
  if (f) {
    paid = cancelStake(g, f, owed);
    const room = Math.max(0, cashOf(g, c.defendantId) - FLOOR);
    const cash = Math.min(owed - paid, room);
    if (cash > 0) { transfer(g, c.defendantId, f.accountId, cash); paid += cash; }
    advance = Math.max(0, s5.vcfAdvancePct * (owed - paid));
    if (advance > 0) credit(g, f.accountId, advance, 'victim fund');
  }
  g.funds ??= emptyFunds();
  g.funds.convicted[c.defendantId] = g.market.tick;
  g.funds.bans[c.defendantId] = g.market.tick + FUND_TIME.eightWeeksTicks;
  c.damages = paid;
  c.fine = fine;
  c.vcfAdvance = advance;
  df.reputation -= 5;
  df.notoriety += 2;
  if (f) startWindDown(g, f, out);
  say(g, out, c.plaintiffId, 'court', 'gain', { key: 'funds.verdict.won', vars: { player: df.handle, restored: usd(paid), fine: usd(fine) } });
  say(g, out, c.defendantId, 'court', 'loss', { key: 'funds.verdict.lost', vars: { player: pl.handle, restored: usd(paid), fine: usd(fine) } });
  c.verdictText = `Restored ${usd(paid)} to the fund and a ${usd(fine)} fine.`;
}
