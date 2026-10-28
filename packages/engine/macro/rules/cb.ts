// T04-06: central bank rule, scheduled and emergency decisions (04 §3.6.2–§3.6.4, §3.6.6; E-41 B2, E-45 item 5, E-54).
// Pure functions first; the ctx-bound pieces (publishedData, runMeeting, appointGovernor) come last.
import { EngineFault, GAME_DAYS_PER_QUARTER, roundHalfEven, TICKS_PER_GAME_DAY, type ParamsView, type PhaseCtx, type StoreRead } from '@tycoon/engine-core';
import { BLOC_DEFAULTS } from '../blocs';
import { cbkId } from '@tycoon/engine-ledger';
import { publicRuleTerms } from '../gapest';
import { meetingId } from '../ids';
import type { MacroPorts } from '../ports';
import { macroTables, type BlocId, type BlocMacroState, type CbDecision, type CentralBank, type CurveState, type ForwardGuidance, type GlobalMacroState, type PublicMacroView } from '../schema';
import { S } from '../streams';
import { memberPreference, tally } from './cbVotes';
import { credibilityOneOff } from './credibility';
import { statementKey } from './guidance';

export interface RuleCoeffs { phiPi: number; phiX: number; phiFs: number; phiFx: number; bias: number; rho: number }
/** Published inputs only (§3.6.3). `xGdpPub` is the CB's own estimate x̂ (E-45 item 4 / E-54), never the true gap. */
export interface PublishedData { piCb: number; xGdpPub: number; uPub: number; fsi: number; depYoy: number }
type RuleTerms = CbDecision['ruleTerms'];
export type EmergencyTrigger = 'FSI' | 'EQUITY_DROP' | 'INTERBANK' | 'CURRENCY' | 'CRISIS_POLICY';

export const RATE_STEP = 0.0025;           // §3.6.4 step 4: 25 bp grid
export const HOLD_BAND = 0.00125;          // §3.6.4 step 3: |Δraw| < 12.5 bp holds
const GRID_EPS = 1e-12;                   // float noise at an exact threshold (0.03 − 0.01 = 0.019999999999999997)
export const WIDE_GAP = 0.02;              // §3.6.4 step 4: |i* − i| ≥ 2 pp opens the wide clamp
export const FX_DEFENCE_MAX = 0.05;        // §3.6.6: FX-defence hikes up to +5 pp
export const RULE_TERMS_INTERNAL = 0.0001; // E-45 item 5: internal 0.01 pp half-even
const RULE_TERM_KEYS = ['neutral', 'inflation', 'inflationGap', 'outputGap', 'finStress', 'fx', 'bias'] as const;

/** x/step rounded half-even to an integer count of steps. The quotient is first snapped to 1e-6 so float noise in
 *  e.g. 0.00875/0.0025 = 3.4999999999999996 cannot flip a .5 tie (the spec quantities are exact decimals). */
export function stepsHalfEven(x: number, step: number): number {
  return roundHalfEven(roundHalfEven((x / step) * 1e6) / 1e6);
}
export function roundToStep(x: number, step: number): number { return stepsHalfEven(x, step) * step; }

/** §3.6.2 derived coefficients. φ_fs = macro_cb_phi_fs, ρ = macro_cb_smoothing, φ_fx from the bloc table. */
export function coeffsFromHawk(b: BlocId, hawk: number, mandate: CentralBank['mandate'], p: ParamsView): RuleCoeffs {
  const phiX0 = 0.5 - 0.5 * (hawk - 0.5);
  return { phiPi: 0.5 + 0.6 * (hawk - 0.5), phiX: mandate === 'PRICE_STABILITY' ? phiX0 * 0.7 : phiX0, phiFs: p.num('macro_cb_phi_fs'),
    phiFx: BLOC_DEFAULTS[b].phiFx, bias: 0.005 * (hawk - 0.5), rho: p.num('macro_cb_smoothing') };
}

/** §3.6.3 x_cb = 0.5·x_gdp_pub + 0.5·(−2·(u_pub − u*)). */
export function cbOutputGap(d: PublishedData, nairu: number): number {
  return 0.5 * d.xGdpPub + 0.5 * (-2 * (d.uPub - nairu));
}

/** §3.6.3 fxTerm: SRL max(0, dep − 0.15); PYN dep (both directions); others 0. */
export function fxTerm(b: BlocId, depYoy: number): number {
  if (b === 'SRL') return depYoy > 0.15 ? depYoy - 0.15 : 0;
  if (b === 'PYN') return depYoy;
  return 0;
}

/** §3.6.3 i* = r*_cb + π_cb + φ_π(π_cb − π*) + φ_x·x_cb − φ_fs·max(0, FSI − 0.3) + φ_fx·fxTerm + bias.
 *  ruleTerms (full precision here) sum to iStar. */
export function ruleRate(rStarCb: number, d: PublishedData, target: number, nairu: number, b: BlocId, c: RuleCoeffs): { iStar: number; terms: RuleTerms } {
  const fsiEx = d.fsi > 0.3 ? d.fsi - 0.3 : 0;
  const terms: RuleTerms = { neutral: rStarCb, inflation: d.piCb, inflationGap: c.phiPi * (d.piCb - target), outputGap: c.phiX * cbOutputGap(d, nairu),
    finStress: -c.phiFs * fsiEx, fx: c.phiFx * fxTerm(b, d.depYoy), bias: c.bias };
  let iStar = 0;
  for (const k of RULE_TERM_KEYS) iStar += terms[k];
  return { iStar, terms };
}

/** §3.6.4 steps 2–5: Δraw = ρ(i* − i); hold if |Δraw| < 12.5 bp; else 25-bp half-even, clamp ±max_step (±max_step_wide when
 *  |i* − i| ≥ 2 pp); floor at the ELB. */
export function scheduledStep(i: number, iStar: number, elb: number, rho: number, p: ParamsView): number {
  const raw = rho * (iStar - i);
  if (Math.abs(raw) < HOLD_BAND) return i;
  const cap = Math.abs(iStar - i) >= WIDE_GAP - GRID_EPS ? p.num('macro_cb_max_step_wide') : p.num('macro_cb_max_step');
  const delta = clampAbs(roundToStep(raw, RATE_STEP), cap);
  return Math.max(elb, i + delta);
}

/** §3.6.6 size: CUT = the scheduled rule with ρ = 1 and the wide clamp, bounded to [−macro_cb_emergency_step, 0], floored at the
 *  ELB. FX_DEFENCE (SRL/PYN, currency trigger): a hike of at least one emergency step (card worked number: i* − i = 0.002 → +0.01)
 *  and at most +0.05. */
export function emergencyStep(i: number, iStar: number, elb: number, kind: 'CUT' | 'FX_DEFENCE', p: ParamsView): number {
  const step = p.num('macro_cb_emergency_step');
  const d = roundToStep(iStar - i, RATE_STEP);
  if (kind === 'CUT') return Math.max(elb, i + (d < -step ? -step : d > 0 ? 0 : d));
  return i + (d < step ? step : d > FX_DEFENCE_MAX ? FX_DEFENCE_MAX : d);
}

/** §3.6.6 triggers (any holds). `eqDrop5d`/`fxDrop3d` are falls as positive fractions (null: no 5-/3-day history yet, so that trigger
 *  cannot fire); `interbankSpread` is 07's spread over policy (null until 07 supplies it); the currency trigger is SRL/PYN only. */
export function emergencyTriggers(x: { fsi: number; eqDrop5d: number | null; interbankSpread: number | null; fxDrop3d: number | null; bloc: BlocId;
  majorPolicyHere: boolean }): EmergencyTrigger[] {
  const out: EmergencyTrigger[] = [];
  if (x.fsi >= 0.7) out.push('FSI');
  if (x.eqDrop5d !== null && x.eqDrop5d >= 0.15) out.push('EQUITY_DROP');
  if (x.interbankSpread !== null && x.interbankSpread >= 0.015) out.push('INTERBANK');
  if ((x.bloc === 'SRL' || x.bloc === 'PYN') && x.fxDrop3d !== null && x.fxDrop3d >= 0.10) out.push('CURRENCY');
  if (x.majorPolicyHere) out.push('CRISIS_POLICY');
  return out;
}

/** §3.6.2 drift: hawk += 0.05·√Δ·ε (Δ = 1 game day = 1/364 yr), clamped to [hawkMin_b, hawkMax_b]. */
export function stepHawkDrift(cb: CentralBank, eps: number, range: [number, number]): number {
  const h = cb.hawkishness + 0.05 * Math.sqrt(1 / 364) * eps;
  return h < range[0] ? range[0] : h > range[1] ? range[1] : h;
}

/** E-45 item 5: internal ruleTerms rounded half-even to `step` (0.0001); the public 0.25 pp rounding is T04-01b's publicRuleTerms. */
export function roundRuleTerms(t: RuleTerms, step: number): RuleTerms {
  return { neutral: roundToStep(t.neutral, step), inflation: roundToStep(t.inflation, step), inflationGap: roundToStep(t.inflationGap, step),
    outputGap: roundToStep(t.outputGap, step), finStress: roundToStep(t.finStress, step), fx: roundToStep(t.fx, step), bias: roundToStep(t.bias, step) };
}

function clampAbs(x: number, cap: number): number { return x > cap ? cap : x < -cap ? -cap : x; }

// ───────── ctx-bound pieces ─────────

function must<T>(v: T | undefined, what: string, id: string): T {
  if (v === undefined) throw new EngineFault('MAC_STATE_MISSING', `${what} ${id}`, [id]);
  return v;
}

/** §3.6.3 published inputs: π_cb = latest CPI print's extra.coreYoy (E-81 note at errata :2248), u_pub = latest JOBS print's
 *  headline, x_gdp_pub = x̂ = x + gapEstNoise (T04-01b, E-45/E-54), FSI = global stress index, dep = bloc effective depreciation.
 *  A missing CPI or JOBS print throws MAC_STATE_MISSING (no spec fallback; question batched). */
export function publishedData(s: StoreRead, b: BlocId): PublishedData {
  const view = must(s.get<PublicMacroView>(macroTables.publicView.name, b), 'public_view', b);
  const bloc = must(s.get<BlocMacroState>(macroTables.bloc.name, b), 'bloc', b);
  const g = must(s.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL'), 'global', 'GLOBAL');
  const cpi = view.prints.CPI, jobs = view.prints.JOBS;
  if (cpi === null || cpi.extra.coreYoy === undefined) throw new EngineFault('MAC_STATE_MISSING', `${b}: no published core CPI`, [b]);
  if (jobs === null) throw new EngineFault('MAC_STATE_MISSING', `${b}: no published unemployment`, [b]);
  return { piCb: cpi.extra.coreYoy, xGdpPub: bloc.outputGap + bloc.gapEstNoise, uPub: jobs.actual, fsi: g.financialStressIndex, depYoy: bloc.dep };
}

/** Decision row plus the SEALED diagnostics 04#12 reads (hawk at the meeting, the published-data snapshot). Stored in
 *  `CentralBank.lastDecisions` (SEALED table); the PUBLIC event payload is built field by field and never carries them. */
export type CbDecisionRow = CbDecision & { hawkAtMeeting: number; dataAtMeeting: PublishedData; rStarCbAtMeeting: number; offsetsAtMeeting: number[] };

/** §3.6.4 (scheduled) or §3.6.6 (emergency) meeting: decide, vote, store, emit macro.cb.decision (PUBLIC, ruleTerms at 0.25 pp via publicRuleTerms with
 *  outputGap = φ_x × x_cb, the CB's own gap built from x̂ and u_pub).
 *  An emergency with the CURRENCY trigger in SRL/PYN is an FX-defence hike, any other emergency a cut. The quarter's emergency
 *  count is reset when `emergencyQuarter` is stale. QE/QT/YCC (T04-09 `onMeeting`) and the corridor (T04-08) are not called here. */
export function runMeeting(ctx: PhaseCtx, b: BlocId, emergency: boolean, trigger: EmergencyTrigger[] | null): CbDecision {
  const T = macroTables.cb.name, id = cbkId(b);
  const cb = must(ctx.store.get<CentralBank>(T, id), 'cb', id);
  const bloc = must(ctx.store.get<BlocMacroState>(macroTables.bloc.name, b), 'bloc', b);
  const d0 = BLOC_DEFAULTS[b];
  const data = publishedData(ctx.store, b);
  const c = coeffsFromHawk(b, cb.hawkishness, cb.mandate, ctx.params);
  const rStarCb = bloc.rStar + cb.rStarBias;
  const { iStar, terms } = ruleRate(rStarCb, data, d0.inflationTarget, d0.nairu, b, c);
  const i = cb.policyRate;
  const fxDefence = emergency && (b === 'SRL' || b === 'PYN') && trigger !== null && trigger.includes('CURRENCY');
  const iNew = emergency ? emergencyStep(i, iStar, d0.elb, fxDefence ? 'FX_DEFENCE' : 'CUT', ctx.params) : scheduledStep(i, iStar, d0.elb, c.rho, ctx.params);
  const prefs: number[] = [];
  for (const o of cb.memberOffsets) prefs.push(memberPreference(i, rStarCb, data, d0.inflationTarget, d0.nairu, b, cb.hawkishness, o, cb.mandate, d0.elb, ctx.params));
  const votes = tally(prefs, iNew);
  const internal = roundRuleTerms(terms, RULE_TERMS_INTERNAL);
  const g = freshGuidance(cb);
  const key = statementKey(i, iNew, g, internal);
  const mid = !emergency && g !== null ? g.meetingId : meetingId(ctx);
  const reasons: string[] = [];
  if (emergency && trigger !== null) for (const t of trigger) reasons.push(`cb.reason.emergency.${t}`);
  const row: CbDecisionRow = { meetingId: mid, tick: ctx.tick, emergency, previousRate: i, newRate: iNew, ruleRate: iStar, ruleTerms: internal,
    voteFor: votes.voteFor, voteAgainst: votes.voteAgainst, qeChangePerMonth: 0n, statementKey: key, reasons, hawkAtMeeting: cb.hawkishness, dataAtMeeting: data,
    rStarCbAtMeeting: rStarCb, offsetsAtMeeting: [...cb.memberOffsets] };
  let cred = cb.credibility;
  if (!emergency && g !== null && ((g.score >= 0.25 && iNew < i) || (g.score <= -0.25 && iNew > i))) cred = credibilityOneOff(cred, 'GUIDANCE_BREAK', undefined, ctx.params);
  if (fxDefence && iNew > i) cred = credibilityOneOff(cred, 'DEFENCE_HIKE');
  const q = Math.floor(ctx.tick / (TICKS_PER_GAME_DAY * GAME_DAYS_PER_QUARTER));
  const count = cb.emergencyQuarter === q ? cb.emergencyCountQuarter : 0;
  ctx.store.put<CentralBank>(T, { ...cb, policyRate: iNew, credibility: cred, lastDecisions: [row, ...cb.lastDecisions],
    emergencyCountQuarter: emergency ? count + 1 : count, emergencyQuarter: q });
  const half = cb.corridorHalfWidth;   // stand-in until T04-08's `corridor` (MISSING EXPORT: T04-06 corridor)
  ctx.emit('macro.cb.decision', [id], { bloc: b, meetingId: mid, previousRate: i, newRate: iNew, corridor: { depositRate: iNew - half, lendingRate: iNew + half },
    emergency, votes: { for: votes.voteFor, against: votes.voteAgainst }, ruleTerms: publicRuleTerms(internal, c.phiX, cbOutputGap(data, d0.nairu)), qeChangePerMonth: row.qeChangePerMonth.toString(),   // events carry Money as a decimal string (G3)
    statementKey: key, reasons }, 'PUBLIC');
  return row;
}

/** The guidance published for the coming scheduled meeting: `cb.guidance` unless a decision already used its meetingId. */
export function freshGuidance(cb: CentralBank): ForwardGuidance | null {
  const g = cb.guidance;
  if (g === null) return null;
  for (const d of cb.lastDecisions) if (d.meetingId === g.meetingId) return null;
  return g;
}

/** Card step 1 / §6.1. Draw order on S.cbPersonality(b), fixed count 11: hawk u, 9 offsets o_j = 0.15·normal(), rStarBias
 *  U(−0.005, 0.005). `ports.world.governorAppointment` (16, D325) overrides hawk (the draw is still consumed). ĥ (T04-07's
 *  CurveState.hHat) resets halfway to 0.5 when the curve row exists; credibility moves 0.05 toward credibility0 except at GENESIS
 *  (credibility0 is the genesis value); term end = tick + macro_governor_term_days·720. macro.governor.appointed is emitted only
 *  with a 16 npc id: the event schema's governorNpcId is a non-null id (question batched). */
export function appointGovernor(ctx: PhaseCtx, b: BlocId, reason: 'GENESIS' | 'TERM_END' | 'POLITICAL' | 'PEG_BREAK', ports: MacroPorts): void {
  const T = macroTables.cb.name, id = cbkId(b);
  const cb = must(ctx.store.get<CentralBank>(T, id), 'cb', id);
  const pers = BLOC_DEFAULTS[b].personality;
  const rng = ctx.rng(S.cbPersonality(b));
  const u = rng.next();
  const offsets: number[] = [];
  for (let j = 0; j < 9; j++) offsets.push(0.15 * rng.normal());
  const rStarBias = -0.005 + 0.01 * rng.next();
  const app = ports.world.governorAppointment(ctx.store, b, ctx.tick);
  const hawk = app !== null ? app.hawk0 : pers.hawkMin + (pers.hawkMax - pers.hawkMin) * u;
  const termEnd = ctx.tick + ctx.params.int('macro_governor_term_days') * TICKS_PER_GAME_DAY;
  const credibility = reason === 'GENESIS' ? cb.credibility : credibilityOneOff(cb.credibility, 'NEW_GOVERNOR', pers.credibility0);
  ctx.store.put<CentralBank>(T, { ...cb, hawkishness: hawk, memberOffsets: offsets, rStarBias, credibility,
    governorNpcId: app !== null ? app.governorNpcId : null, governorTermEndTick: termEnd });
  const curve = ctx.store.get<CurveState>(macroTables.curve.name, b);
  if (curve !== undefined && reason !== 'GENESIS') ctx.store.put<CurveState>(macroTables.curve.name, { ...curve, hHat: curve.hHat + 0.5 * (0.5 - curve.hHat) });
  if (app !== null) ctx.emit('macro.governor.appointed', [id], { bloc: b, governorNpcId: app.governorNpcId, termEndTick: termEnd }, 'PUBLIC');
}
