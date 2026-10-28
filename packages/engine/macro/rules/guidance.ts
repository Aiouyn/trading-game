// T04-06: forward guidance, dots, statement keys, minutes (04 §3.6.1, §3.6.5).
import { dmath, EngineFault, type ParamsView, type PhaseCtx } from '@tycoon/engine-core';
import { cbkId } from '@tycoon/engine-ledger';
import { BLOC_DEFAULTS } from '../blocs';
import { roundToQuarterPp } from '../gapest';
import { meetingId } from '../ids';
import { macroTables, type BlocId, type BlocMacroState, type CbDecision, type CentralBank, type ForwardGuidance } from '../schema';
import { S } from '../streams';
import { coeffsFromHawk, publishedData, ruleRate, scheduledStep, stepsHalfEven, RATE_STEP, type CbDecisionRow,
  type PublishedData, type RuleCoeffs } from './cb';
import { memberPreference } from './cbVotes';

type GuidanceText = 'VERY_DOVISH' | 'DOVISH' | 'NEUTRAL' | 'HAWKISH' | 'VERY_HAWKISH';
type Dir = 'HIKE' | 'CUT' | 'HOLD';
const TERM_KEYS = ['inflation', 'inflationGap', 'outputGap', 'finStress', 'fx', 'bias'] as const;   // ruleTerms without `neutral`
const DOT_HORIZONS = [1, 2, 4, 8] as const;

/** §3.6.5 text band: < −0.6 VERY_DOVISH, < −0.2 DOVISH, > 0.6 VERY_HAWKISH, > 0.2 HAWKISH, else NEUTRAL. */
export function guidanceTextKey(score: number): GuidanceText {
  if (score < -0.6) return 'VERY_DOVISH';
  if (score < -0.2) return 'DOVISH';
  if (score > 0.6) return 'VERY_HAWKISH';
  if (score > 0.2) return 'HAWKISH';
  return 'NEUTRAL';
}

/** Guidance band direction (card 04#11 / step 3): score > 0.2 hike, < −0.2 cut, else hold. */
export function guidanceDirection(score: number): Dir { return score > 0.2 ? 'HIKE' : score < -0.2 ? 'CUT' : 'HOLD'; }

/** impliedMove = clamp(roundHalfEven(ρ(i*_proj − i)/0.0025), −2, 2). */
export function impliedMove(i: number, iStarProj: number, rho: number): -2 | -1 | 0 | 1 | 2 {
  const m = stepsHalfEven(rho * (iStarProj - i), RATE_STEP);
  return (m > 2 ? 2 : m < -2 ? -2 : m === 0 ? 0 : m) as -2 | -1 | 0 | 1 | 2;   // m === 0 folds −0 to 0
}

/** score = clamp(impliedMove/2 + (1 − clarity)·0.3·eps, −1, 1). */
export function guidanceScore(move: number, clarity: number, eps: number): number {
  return dmath.clamp(move / 2 + (1 - clarity) * 0.3 * eps, -1, 1);
}

/** §3.6.5 dots: iterate quarterly (Δ = 0.25 yr) from today's published data. Each quarter the CB's forecast paths decay first
 *  (π_cb → π* half-life 0.75 yr, x_cb → 0 half-life 0.5 yr applied to both x_gdp_pub and u_pub − u*, FSI → 0.2 half-life 0.25 yr;
 *  depYoy held), then the rate takes one `scheduledStep`. Horizons 1, 2, 4, 8. */
export function dots(i: number, rStarCb: number, d: PublishedData, target: number, nairu: number, b: BlocId, c: RuleCoeffs, elb: number, p: ParamsView):
  { horizonQuarters: 1 | 2 | 4 | 8; rate: number }[] {
  const fPi = dmath.pow(2, -0.25 / 0.75), fX = dmath.pow(2, -0.25 / 0.5), fFsi = dmath.pow(2, -0.25 / 0.25);
  let data = d, rate = i;
  const out: { horizonQuarters: 1 | 2 | 4 | 8; rate: number }[] = [];
  for (let q = 1; q <= 8; q++) {
    data = { piCb: target + (data.piCb - target) * fPi, xGdpPub: data.xGdpPub * fX, uPub: nairu + (data.uPub - nairu) * fX,
      fsi: 0.2 + (data.fsi - 0.2) * fFsi, depYoy: data.depYoy };
    rate = scheduledStep(rate, ruleRate(rStarCb, data, target, nairu, b, c).iStar, elb, c.rho, p);
    for (const h of DOT_HORIZONS) if (h === q) out.push({ horizonQuarters: h, rate });
  }
  return out;
}

function sizeKey(steps: number): string {
  if (steps === 0) return 'SIZE0';   // HOLD: the card's size enum has no hold entry (question batched)
  if (steps <= 4) return `SIZE${steps * 25}`;
  return 'LARGE';
}

/** Dominant ruleTerms component by |value|, `neutral` excluded; ties keep the 04 §2.1 key order. */
export function dominantTerm(terms: CbDecision['ruleTerms']): string {
  let best: string = TERM_KEYS[0], bestAbs = -1;
  for (const k of TERM_KEYS) { const a = Math.abs(terms[k]); if (a > bestAbs) { best = k; bestAbs = a; } }
  return best;
}

/** 'cb.stmt.<HIKE|CUT|HOLD>.<SIZE25|50|75|100|LARGE>.<MATCH|SURPRISE>.<dominantTerm>'. MATCH iff the decision direction equals the
 *  guidance band direction; no guidance is SURPRISE (question batched). */
export function statementKey(prev: number, next: number, guidance: ForwardGuidance | null, terms: CbDecision['ruleTerms']): string {
  const steps = stepsHalfEven(next - prev, RATE_STEP);
  const dir: Dir = steps > 0 ? 'HIKE' : steps < 0 ? 'CUT' : 'HOLD';
  const match = guidance !== null && guidanceDirection(guidance.score) === dir ? 'MATCH' : 'SURPRISE';
  return `cb.stmt.${dir}.${sizeKey(Math.abs(steps))}.${match}.${dominantTerm(terms)}`;
}

function cbRow(ctx: PhaseCtx, b: BlocId): CentralBank {
  const cb = ctx.store.get<CentralBank>(macroTables.cb.name, cbkId(b));
  if (cb === undefined) throw new EngineFault('MAC_STATE_MISSING', `cb ${cbkId(b)}`, [cbkId(b)]);
  return cb;
}

/** §3.6.5 at the guidance tick: i*_proj on data published so far, impliedMove, score with one normal() on S.cbDecision(b) (the only
 *  draw), text band, dots. Stores `guidance` and `dots` on the CB row and emits macro.cb.guidance (PUBLIC). The meetingId is minted
 *  here and reused by the scheduled decision (runMeeting). */
export function guidanceAt(ctx: PhaseCtx, b: BlocId): ForwardGuidance {
  const cb = cbRow(ctx, b);
  const bloc = ctx.store.get<BlocMacroState>(macroTables.bloc.name, b);
  if (bloc === undefined) throw new EngineFault('MAC_STATE_MISSING', `bloc ${b}`, [b]);
  const d0 = BLOC_DEFAULTS[b];
  const data = publishedData(ctx.store, b);
  const c = coeffsFromHawk(b, cb.hawkishness, cb.mandate, ctx.params);
  const rStarCb = bloc.rStar + cb.rStarBias;
  const move = impliedMove(cb.policyRate, ruleRate(rStarCb, data, d0.inflationTarget, d0.nairu, b, c).iStar, c.rho);
  const score = guidanceScore(move, d0.personality.communicationClarity, ctx.rng(S.cbDecision(b)).normal());
  const g: ForwardGuidance = { meetingId: meetingId(ctx), tick: ctx.tick, score, impliedMove: move, textKey: guidanceTextKey(score) };
  ctx.store.put<CentralBank>(macroTables.cb.name, { ...cb, guidance: g,
    dots: dots(cb.policyRate, rStarCb, data, d0.inflationTarget, d0.nairu, b, c, d0.elb, ctx.params) });
  ctx.emit('macro.cb.guidance', [cbkId(b)], { bloc: b, meetingId: g.meetingId, score, textKey: g.textKey }, 'PUBLIC');
  return g;
}

/** Recomputes the 9 member preferences of a stored decision from its SEALED diagnostics (offsets, hawk, data, r*_cb at the meeting). */
export function memberPrefsOf(row: CbDecisionRow, b: BlocId, mandate: CentralBank['mandate'], p: ParamsView): number[] {
  const d0 = BLOC_DEFAULTS[b];
  const out: number[] = [];
  for (const o of row.offsetsAtMeeting) out.push(memberPreference(row.previousRate, row.rStarCbAtMeeting, row.dataAtMeeting, d0.inflationTarget, d0.nairu, b,
    row.hawkAtMeeting, o, mandate, d0.elb, p));
  return out;
}

/** §3.6.1 minutes. The event schema's dissent is {hike, hold, cut}: each AGAINST member counted by the move it preferred relative to
 *  the previous rate (sum = voteAgainst; question batched vs the card's dissentHigher/dissentLower). riskKeys: `cb.risk.<term>.<UP|DOWN>`
 *  for each non-neutral term whose published (0.25 pp) value is non-zero, in key order (format question batched). */
export function minutesAt(ctx: PhaseCtx, b: BlocId, mid: string): void {
  const cb = cbRow(ctx, b);
  let row: CbDecisionRow | null = null;
  for (const d of cb.lastDecisions) if (d.meetingId === mid) { row = d as CbDecisionRow; break; }
  if (row === null) throw new EngineFault('MAC_STATE_MISSING', `${b}: no decision ${mid}`, [mid]);
  const dissent = { hike: 0, hold: 0, cut: 0 };
  for (const pref of memberPrefsOf(row, b, cb.mandate, ctx.params)) {
    if (Math.abs(pref - row.newRate) <= RATE_STEP + 1e-12) continue;
    const s = stepsHalfEven(pref - row.previousRate, RATE_STEP);
    if (s > 0) dissent.hike++; else if (s < 0) dissent.cut++; else dissent.hold++;
  }
  const riskKeys: string[] = [];
  for (const k of TERM_KEYS) {
    const v = roundToQuarterPp(row.ruleTerms[k]);
    if (v !== 0) riskKeys.push(`cb.risk.${k}.${v > 0 ? 'UP' : 'DOWN'}`);
  }
  ctx.emit('macro.cb.minutes', [cbkId(b)], { bloc: b, meetingId: mid, dissent, riskKeys }, 'PUBLIC');
}
