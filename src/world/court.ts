import { TPD, cashOf, spendableCash, creditExternal, debit, keyedRng, notify, pushWire, transfer } from './core';
import { FUND_RULES, FUND_TIME } from '@/content/funds';
import { advanceToInvestors, cancelStake } from './funds/flows';
import { emptyFunds, fundById } from './funds/state';
import { startWindDown } from './funds/risk';
import { say } from './say';
import { bumpDeals } from './social';
import { rugVerdict } from './launchpad/rug';
import { SEVERITY } from './court-scale';
import { ECA_TUNE } from './eca-tune';
import { usd } from './text/template';
import { textProvider } from './text';
import type { CommandResult, CourtCase, GameState, Player, StepOutput } from './types';
import type { Msg } from '@/i18n';

/**
 * Courts (bible 03 §8–§10). A case needs evidence points against a filing bar (civil 40,
 * tribunal 55, criminal 70). The verdict is a logistic on (evidence − bar), and counsel can shift
 * it by at most ±0.75 logit, so money can't buy a verdict. Fines are a share of net worth by
 * severity, 85% destroyed, 10% to the victim, 5% to the whistleblower fund. Nothing takes a player
 * below $5,000 (the floor). Held is a temporary freeze (≤ 24 game days), never a wipe.
 */

export const COUNSEL_COST = [0, 5_000, 25_000, 120_000];
/** The flat filing fee; counsel is added on top (COUNSEL_COST). The Legal CommitBar shows the same figure. */
export const FILING_FEE = 2_000;
/** The claim kinds, as the filing takes them. */
export const COURT_KINDS: CourtCase['kind'][] = ['cyber intrusion', 'model theft', 'loan default', 'contract breach'];
/** A claim's bar in evidence points (a model theft needs more). A case needs half the bar to be filed at all. */
export function filingBar(kind: CourtCase['kind']): number {
  return kind === 'model theft' ? 55 : 40;
}
/** The evidence points below which the filing is refused (half the bar): the Legal app disables File under it. */
export function filingMinimum(kind: CourtCase['kind']): number {
  return filingBar(kind) * 0.5;
}
const HEARING_DAYS = 2;
/** the claim's name as a message key (the filing notice names it in the viewer's language) */
const CLAIM_KEY: Record<string, string> = {
  'cyber intrusion': 'court.claim.intrusion', 'model theft': 'court.claim.theft', 'loan default': 'court.claim.default', 'contract breach': 'court.claim.breach',
};

// the fine scale lives in court-scale.ts, so the Launchpad's rug verdict reads the same table (lead-launchpad.md L5)

export const FLOOR = 5_000;
/** The tribunal bar (03 §4.4, §8.1): a regulator's file needs 55 evidence points before a tribunal decides. */
export const TRIBUNAL_BAR = 55;
/** The ECA's S5 cap: one verdict's fine is at most 35% of net worth (03 §1). */
export const ECA_CAP_PCT = 0.35;
/** The S5 repeat modifier (03 §1): x1.5 per prior conviction in the same season, at most x2.5. */
export const ECA_REPEAT_X = 1.5;
export const ECA_REPEAT_MAX = 2.5;

/** The evidence points a claim would rest on (the engine's count; the Legal app reads the same numbers through the view). */
export function evidenceFor(g: GameState, plaintiffId: string, defendantId: string, kind: CourtCase['kind']): number {
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
  const filingFee = FILING_FEE + COUNSEL_COST[lvl]!;
  if (cashOf(g, pid) < filingFee) return { ok: false, error: 'not enough cash for fees' };
  const evidence = evidenceFor(g, pid, defendantId, kind);
  const bar = filingBar(kind);
  const minimum = filingMinimum(kind);
  if (evidence < minimum) return { ok: false, error: `not enough evidence (${evidence} of ${minimum} points)`, msg: { key: 'court.refuse.evidence', vars: { n: `#n:${evidence},0,1`, bar: `#n:${minimum},0,1` } } };
  debit(g, pid, filingFee, 'legal fees');
  g.court.seq++;
  const id = `case${g.court.seq}`;
  g.court.cases[id] = {
    id, plaintiffId: pid, defendantId, kind, evidence, bar, counselPlaintiff: lvl, counselDefendant: 0,
    filedTick: g.market.tick, hearingTick: g.market.tick + HEARING_DAYS * TPD, status: 'filed', damages: 0, fine: 0,
  };
  // evidence is consumed by the case
  delete g.cyber.evidence[`${defendantId}>${pid}`];
  notify(g, out, defendantId, { kind: 'court', tone: 'warn', text: `${g.players[pid]!.handle} is suing you for ${kind}. Hearing in ${HEARING_DAYS} game days. You can offer a settlement.`, msg: { key: 'court.msg.suing', vars: { plaintiff: g.players[pid]!.handle, claim: `@${CLAIM_KEY[kind]!}`, days: HEARING_DAYS } } });
  pushWire(g, out, {
    kind: 'court', tag: 'Court', tone: 'warn', text: `${g.players[pid]!.handle} sues ${d.handle} for ${kind}`,
    msg: textProvider.newsroom({ kind: 'lawsuit', id: `${id}:filed`, handle: g.players[pid]!.handle, defendant: d.handle, law: kind }),
  });
  return { ok: true, data: { id } };
}

export function offerSettlement(g: GameState, pid: string, caseId: string, amount: number, out: StepOutput | null): CommandResult {
  const c = g.court.cases[caseId];
  if (!c || c.defendantId !== pid || c.status !== 'filed') return { ok: false, error: 'no open case against you' };
  if (!(amount > 0) || spendableCash(g, pid) < amount) return { ok: false, error: 'enter an amount you can pay' };
  c.settlementOffer = amount;
  notify(g, out, c.plaintiffId, { kind: 'court', tone: 'info', text: `${g.players[pid]!.handle} offers $${Math.round(amount).toLocaleString('en-US')} to settle.`, msg: { key: 'court.msg.offer', vars: { offerer: g.players[pid]!.handle, amount: `#n:${Math.round(amount)},0,0` } } });
  return { ok: true };
}

export function acceptSettlement(g: GameState, pid: string, caseId: string, out: StepOutput | null): CommandResult {
  const c = g.court.cases[caseId];
  if (!c || c.plaintiffId !== pid || c.status !== 'filed' || !c.settlementOffer) return { ok: false, error: 'no settlement on the table' };
  const amt = Math.max(0, Math.min(c.settlementOffer, spendableCash(g, c.defendantId)));
  transfer(g, c.defendantId, c.plaintiffId, amt);
  c.status = 'settled';
  c.damages = amt;
  c.verdictText = `Settled for $${Math.round(amt).toLocaleString('en-US')}`;
  c.verdictMsg = { key: 'court.verdict.settled', vars: { amount: `#n:${Math.round(amt)},0,0` } };
  notify(g, out, c.defendantId, { kind: 'court', tone: 'info', text: `Your settlement was accepted.`, msg: { key: 'court.msg.settlementAccepted' } });
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
      const dismissed: Msg = { key: 'court.verdict.dismissed', vars: { pct: `#n:${Math.round(p * 100)},0,0` } };
      c.verdictMsg = dismissed;
      notify(g, out, c.plaintiffId, { kind: 'court', tone: 'loss', text: `You lost the case against ${df.handle}. ${c.verdictText}`, msg: { key: 'court.msg.lostCase', vars: { handle: df.handle, verdict: dismissed } } });
      notify(g, out, c.defendantId, { kind: 'court', tone: 'gain', text: `The case brought by ${pl.handle} was dismissed.`, msg: { key: 'court.msg.dismissedFor', vars: { handle: pl.handle } } });
      continue;
    }
    c.status = 'won';
    pl.stats.casesWon++;
    if (c.kind === 'fund abuse') { fundVerdict(g, c, out, df); continue; }
    if (c.kind === 'rug') { rugVerdict(g, c, out, df); continue; }
    const sevIdx = c.kind === 'model theft' ? 3 : c.kind === 'cyber intrusion' ? 2 : 1;
    const sev = SEVERITY[sevIdx]!;
    const headroom = Math.max(0, df.netWorth - FLOOR);
    const fine = Math.min(headroom * 0.5, Math.min(sev.cap, Math.max(sev.floor, df.netWorth * sev.pct)));
    let damages = 0;
    if (c.kind === 'loan default') {
      const d = Object.values(g.deals).find((x) => x.status === 'defaulted' && x.fromId === c.plaintiffId && x.toId === c.defendantId);
      damages = Math.min(headroom - fine, d?.outstanding ?? 0);
      // R-9-5 (Phase 9 rulings): a default collected in part keeps the remainder open. The deal stays defaulted with what is
      // still owed, so the lender can sue again and the borrower's rank basis keeps subtracting the debt. Nothing is written off.
      if (d) {
        d.paid += damages;
        d.outstanding = Math.max(0, (d.outstanding ?? 0) - damages);
        if (d.outstanding <= 0.005) { d.status = 'repaid'; d.outstanding = 0; }
        bumpDeals(g);
      }
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
    const held = df.heldUntil > g.market.tick;
    c.verdictText = `Liable: $${Math.round(damages).toLocaleString('en-US')} in damages and a $${Math.round(fine).toLocaleString('en-US')} fine${held ? '; assets held for 24 game days' : ''}.`;
    const liable: Msg = { key: held ? 'court.verdict.liableHeld' : 'court.verdict.liable', vars: { damages: `#n:${Math.round(damages)},0,0`, fine: `#n:${Math.round(fine)},0,0` } };
    c.verdictMsg = liable;
    notify(g, out, c.plaintiffId, { kind: 'court', tone: 'gain', text: `You won against ${df.handle}. ${c.verdictText}`, msg: { key: 'court.msg.wonCase', vars: { handle: df.handle, verdict: liable } } });
    notify(g, out, c.defendantId, { kind: 'court', tone: 'loss', text: `Verdict for ${pl.handle}. ${c.verdictText}`, msg: { key: 'court.msg.verdictAgainst', vars: { handle: pl.handle, verdict: liable } } });
    pushWire(g, out, {
      kind: 'court', tag: 'Verdict', tone: 'loss', text: `Court finds ${df.handle} liable for ${c.kind}; ${pl.handle} awarded damages`,
      msg: textProvider.newsroom({ kind: 'verdict', id: `${c.id}:verdict`, defendant: df.handle, plaintiff: pl.handle, law: c.kind }),
    });
  }
}

/**
 * The S5 verdict on a fund abuse (ROADMAP 2.2, 03 §9.6 and §9.9). The fine is 8% of net worth, floor $100k, at most 35% of net
 * worth. The award is 100% disgorgement of the manager's gain on the flagged trades, plus restitution of 1.5x the harm to the
 * fund. The manager's stake pays first (its units are cancelled up to the award, which raises the other holders' share of NAV),
 * then cash down to the court floor. What is still unpaid gets an advance of 50% from the Victim Compensation Fund, paid
 * straight to the non-manager investors pro rata to their units at the verdict, never into the fund, so the manager's claim
 * is unchanged by it (the recovery from garnishment is not modelled yet). The manager is banned from opening a fund for 8 real
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
    const room = Math.max(0, spendableCash(g, c.defendantId) - FLOOR);
    const cash = Math.min(owed - paid, room);
    if (cash > 0) { transfer(g, c.defendantId, f.accountId, cash); paid += cash; }
    advance = advanceToInvestors(g, f, Math.max(0, s5.vcfAdvancePct * (owed - paid)), out);
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
  c.verdictMsg = { key: 'court.verdict.restored', vars: { restored: `#n:${paid},2,2`, fine: `#n:${fine},2,2` } };
}

/** R-6C-2: the insider fine's floor (the S5 scale's $100k floor does not apply to the ECA's insider penalty any more). */
export const ECA_FINE_FLOOR = 1_000;
/** R-6C-4: the counsel term is at most this many logits, for each side (the M30 counsel rule, as in courtTick). */
export const COUNSEL_LOGIT_MAX = 0.75;

/**
 * The ECA tribunal (ROADMAP 2.5, 03 §9.2, §10.2, R-6C-2 and R-6C-4). The regulator is the plaintiff. At the tribunal bar the verdict
 * is a logistic on (evidence − bar) over the slope ECA_TUNE.tribunalSlope, with the counsel term (at most ±0.75 logit, the regulator's
 * counsel less the defence's, at 0.25 a level as in courtTick) added before the draw, from a keyed stream so replays agree. It is
 * uncertain by design: far above the bar convicts, the bar is a coin flip, and the counsel can move it, but not far.
 *
 * A conviction is the insider penalty: the gain is disgorged in full (the FIFO realized gain on the tipped lots, from cash above
 * the $5k floor), and the fine is k × gain (ECA_TUNE.insiderK) with the $1,000 floor, times the season repeat factor, capped at 35%
 * of net worth (ECA_CAP_PCT) and at what the season has left. Both are sinks: an insider trade has no identifiable victim to pay
 * (03 §1). Nothing here moves cash to another player. The S5 scale (court-scale.ts) is unchanged for the other offences.
 */
export function regulatorVerdict(
  g: GameState,
  c: {
    id: string; evidence: number; playerId: string; gain: number; priorConvictions?: number; seasonFinesLeft?: number;
    /** counsel levels (0 to 3, as for a case); both 0 when unset */
    counsel?: { regulator?: number; defence?: number };
  },
): { convicted: boolean; fine: number; disgorged: number; p: number } {
  const counsel = Math.max(-COUNSEL_LOGIT_MAX, Math.min(COUNSEL_LOGIT_MAX, 0.25 * ((c.counsel?.regulator ?? 0) - (c.counsel?.defence ?? 0))));
  const z = (c.evidence - TRIBUNAL_BAR) / ECA_TUNE.tribunalSlope + counsel;
  const p = 1 / (1 + Math.exp(-z));
  const won = keyedRng(g, `eca:verdict:${c.id}`).chance(p);
  const df = g.players[c.playerId];
  if (!won || !df) return { convicted: false, fine: 0, disgorged: 0, p };
  const nw = df.netWorth;
  // the debit comes from cash, never below the floor (03 §13.5, ROADMAP 2.6): the disgorgement is owed first, then the fine
  const cashRoom = Math.max(0, cashOf(g, c.playerId) - FLOOR);
  const gain = Math.max(0, c.gain);
  const disgorged = Math.min(cashRoom, gain);
  // the repeat modifier (03 §1): x1.5 per prior conviction in the season, at most x2.5; then the per-verdict cap of 35% of net worth
  const repeat = Math.min(ECA_REPEAT_MAX, ECA_REPEAT_X ** Math.max(0, c.priorConvictions ?? 0));
  const scheduled = Math.max(ECA_FINE_FLOOR, ECA_TUNE.insiderK * gain) * repeat;
  const fine = Math.max(0, Math.min(cashRoom - disgorged, ECA_CAP_PCT * nw, scheduled, c.seasonFinesLeft ?? Infinity));
  debit(g, c.playerId, disgorged, 'eca disgorgement');
  debit(g, c.playerId, fine, 'eca fines');
  df.reputation -= 10;
  return { convicted: true, fine, disgorged, p };
}
