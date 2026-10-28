// T04-06: forward guidance, dots, statement keys, minutes (04 §3.6.1, §3.6.5).
import { dmath, EngineFault, type ParamsView, type PhaseCtx } from '@tycoon/engine-core';
import { cbkId } from '@tycoon/engine-ledger';
import { BLOC_DEFAULTS } from '../blocs';
import { publicRuleTerms } from '../gapest';
import { meetingId } from '../ids';
import { macroTables, type BlocId, type BlocMacroState, type CbDecision, type CentralBank, type ForwardGuidance } from '../schema';
import { S } from '../streams';
import { cbOutputGap, coeffsFromHawk, publishedData, ruleRate, scheduledStep, stepsHalfEven, RATE_STEP, type CbDecisionRow,
  type PublishedData, type RuleCoeffs } from './cb';
import { memberPreference } from './cbVotes';

type GuidanceText = 'VERY_DOVISH' | 'DOVISH' | 'NEUTRAL' | 'HAWKISH' | 'VERY_HAWKISH';
type Dir = 'HIKE' | 'CUT' | 'HOLD';
const TERM_KEYS = ['inflation', 'inflationGap', 'outputGap', 'finStress', 'fx', 'bias'] as const;   // ruleTerms without `neutral`
const RISK_KEYS = ['inflationGap', 'outputGap', 'finStress', 'fx'] as const;   // E-100 (e): tie order
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
 *  E-100 (f): depYoy rolls out of its 4-quarter window, dep_q = depYoy × max(0, 1 − q/4)), then the rule, then one `scheduledStep`.
 *  Exactly 4 entries, horizons 1, 2, 4, 8. */
export function dots(i: number, rStarCb: number, d: PublishedData, target: number, nairu: number, b: BlocId, c: RuleCoeffs, elb: number, p: ParamsView):
  { horizonQuarters: 1 | 2 | 4 | 8; rate: number }[] {
  const fPi = dmath.pow(2, -0.25 / 0.75), fX = dmath.pow(2, -0.25 / 0.5), fFsi = dmath.pow(2, -0.25 / 0.25);
  let data = d, rate = i;
  const out: { horizonQuarters: 1 | 2 | 4 | 8; rate: number }[] = [];
  for (let q = 1; q <= 8; q++) {
    data = { piCb: target + (data.piCb - target) * fPi, xGdpPub: data.xGdpPub * fX, uPub: nairu + (data.uPub - nairu) * fX,
      fsi: 0.2 + (data.fsi - 0.2) * fFsi, depYoy: d.depYoy * Math.max(0, 1 - q / 4) };
    rate = scheduledStep(rate, ruleRate(rStarCb, data, target, nairu, b, c).iStar, elb, c.rho, p);
    for (const h of DOT_HORIZONS) if (h === q) out.push({ horizonQuarters: h, rate });
  }
  return out;
}

function sizeKey(steps: number): string {
  if (steps === 0) return 'SIZE0';   // E-100 (d): HOLD is always SIZE0
  if (steps <= 4) return `SIZE${steps * 25}`;
  return 'LARGE';
}

/** Dominant ruleTerms component by |value|, `neutral` excluded; ties keep the 04 §2.1 key order. */
export function dominantTerm(terms: CbDecision['ruleTerms']): string {
  let best: string = TERM_KEYS[0], bestAbs = -1;
  for (const k of TERM_KEYS) { const a = Math.abs(terms[k]); if (a > bestAbs) { best = k; bestAbs = a; } }
  return best;
}

/** E-100 (d): 'cb.stmt.<HIKE|CUT|HOLD>.<SIZE0|SIZE25|SIZE50|SIZE75|SIZE100|LARGE>.<MATCH|SURPRISE|UNGUIDED>.<dominantTerm>'. Direction and
 *  size from the actual move (LARGE > 100 bp). MATCH iff the decision direction equals the guidance band direction; no guidance for this
 *  meeting (every emergency meeting, a pre-genesis guidance tick) is UNGUIDED. */
export function statementKey(prev: number, next: number, guidance: ForwardGuidance | null, terms: CbDecision['ruleTerms']): string {
  const steps = stepsHalfEven(next - prev, RATE_STEP);
  const dir: Dir = steps > 0 ? 'HIKE' : steps < 0 ? 'CUT' : 'HOLD';
  const match = guidance === null ? 'UNGUIDED' : guidanceDirection(guidance.score) === dir ? 'MATCH' : 'SURPRISE';
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

/** E-100 (e): `cb.risk.<inflationGap|outputGap|finStress|fx>.<UP|DOWN>`, one key per term whose published value (0.25 pp half-even, the
 *  macro.cb.decision publicRuleTerms of the stored row) is non-zero; sorted by |value| descending, ties in RISK_KEYS order. 0–4 keys. */
export function riskKeysOf(row: CbDecisionRow, b: BlocId, mandate: CentralBank['mandate'], p: ParamsView): string[] {
  const c = coeffsFromHawk(b, row.hawkAtMeeting, mandate, p);
  const pub = publicRuleTerms(row.ruleTerms, c.phiX, cbOutputGap(row.dataAtMeeting, BLOC_DEFAULTS[b].nairu));
  const keys: { k: string; a: number; ord: number }[] = [];
  RISK_KEYS.forEach((k, ord) => { const v = pub[k]; if (v !== 0) keys.push({ k: `cb.risk.${k}.${v > 0 ? 'UP' : 'DOWN'}`, a: Math.abs(v), ord }); });
  keys.sort((x, y) => (y.a - x.a) || (x.ord - y.ord));
  return keys.map((e) => e.k);
}

/** §3.6.1 minutes, read from the stored decision row of `mid` (no draw, no recompute at minutesTick): dissent = { higher, lower } copied
 *  from the tally stored on the SEALED row (E-100 (a); higher + lower = voteAgainst); riskKeys per E-100 (e). */
export function minutesAt(ctx: PhaseCtx, b: BlocId, mid: string): void {
  const cb = cbRow(ctx, b);
  let row: CbDecisionRow | null = null;
  for (const d of cb.lastDecisions) if (d.meetingId === mid) { row = d as CbDecisionRow; break; }
  if (row === null) throw new EngineFault('MAC_STATE_MISSING', `${b}: no decision ${mid}`, [mid]);
  ctx.emit('macro.cb.minutes', [cbkId(b)], { bloc: b, meetingId: mid, dissent: { higher: row.dissentHigher, lower: row.dissentLower },
    riskKeys: riskKeysOf(row, b, cb.mandate, ctx.params) }, 'PUBLIC');
}
