// T04-04 (04 §3.4): output gap through the named channels (§3.4.1), potential growth and levels (§3.4.2), Okun unemployment and wages
// (§3.4.3) and the hidden neutral rate (§3.4.4). Macro step 4, per bloc in BLOC_ORDER. All exp/ln/pow through dmath; Δ = 1/364.
import { dmath, safeDiv, type ParamsView } from '@tycoon/engine-core';
import { BLOC_DEFAULTS } from '../blocs';
import type { BlocId, BlocMacroState, Regime } from '../schema';

const DT = 1 / 364;
const SQRT_DT = Math.sqrt(DT);

export interface GapInputs { i: number; piE1: number; rStar: number; regime: Regime; fiscalImpulse: number; sovStress: number; atElb: boolean;
  creditConditions: number; openness: number; xOthers: number; realFxGap: number; energyYoyLn: number; commodityExporter: number; fear: number;
  eqIndex: number | null; eqMean364: number | null; housePriceGap: number; wtiNow: number; wtiMean364: number; worldHackRate: number; shockSum: number }
export interface GapTerms { monetary: number; fiscal: number; credit: number; external: number; realFx: number; energy: number; fear: number; wealth: number; trade: number; cyber: number; shocks: number; xReg: number }

/** §3.4.1 step 1, E-87 (7): R = i − π_e1 − r* (true r*); R̃ ← R̃ + (R − R̃)·α with α = 1 − 2^(−1/macro_policy_lag_days) (0.0057596 at 120). */
export function smoothRealRateGap(prevRtilde: number, i: number, piE1: number, rStar: number, p: ParamsView): number {
  const R = i - piE1 - rStar;
  const alpha = 1 - dmath.pow(2, -1 / p.num('macro_policy_lag_days'));
  return prevRtilde + (R - prevRtilde) * alpha;
}

const XREG_KEY: Readonly<Record<Regime, string>> = Object.freeze({
  EXPANSION: 'macro_xreg_exp', OVERHEATING: 'macro_xreg_ovh', CONTRACTION: 'macro_xreg_con', RECOVERY: 'macro_xreg_rec' });

/** §3.4.1 steps 2–3: the regime attractor and the 11 channel terms (coefficient keys fixed by the card: macro_x_a_r … macro_x_a_k). */
export function gapTerms(g: GapInputs, Rtilde: number, p: ParamsView): GapTerms {
  const m = p.num('macro_x_m') * (1 - 0.5 * g.sovStress) * (g.atElb ? 1.25 : 1);
  const eq = g.eqIndex === null || g.eqMean364 === null ? 0 : dmath.ln(safeDiv(g.eqIndex, g.eqMean364, 1));
  return {
    monetary: -p.num('macro_x_a_r') * Rtilde,
    fiscal: m * g.fiscalImpulse,
    credit: p.num('macro_x_a_c') * g.creditConditions,
    external: p.num('macro_x_a_e') * g.openness * g.xOthers,
    realFx: -p.num('macro_x_a_q') * g.realFxGap,
    energy: -p.num('macro_x_a_o') * dmath.clamp(g.energyYoyLn, -1.5, 1.5) * (1 - 1.5 * g.commodityExporter),
    fear: -p.num('macro_x_a_f') * (g.fear - 30) / 20,
    wealth: p.num('macro_x_a_w') * eq + p.num('macro_x_a_h') * g.housePriceGap,
    trade: p.num('macro_x_a_t') * g.openness * dmath.ln(safeDiv(g.wtiNow, g.wtiMean364, 1)),
    cyber: -p.num('macro_x_a_k') * Math.max(0, g.worldHackRate - 70) / 30,
    shocks: g.shockSum,
    xReg: p.num(XREG_KEY[g.regime]),
  };
}

/** §3.4.1 step 4: clamp(x_reg + Σ terms, −0.12, +0.08); terms summed in GapTerms declaration order. */
export function outputGapTarget(t: GapTerms): number {
  const sum = t.monetary + t.fiscal + t.credit + t.external + t.realFx + t.energy + t.fear + t.wealth + t.trade + t.cyber + t.shocks;
  return dmath.clamp(t.xReg + sum, -0.12, 0.08);
}

/** §3.4.1 step 5: x + θ_x(x_target − x)Δ + σ_x√Δ·ε, θ_x = ln2 / macro_gap_halflife_years, σ_x = macro_gap_vol; ε is draw 1 on S.shock(b). */
export function stepOutputGap(x: number, xTarget: number, eps: number, p: ParamsView): number {
  const theta = dmath.ln(2) / p.num('macro_gap_halflife_years');
  return x + theta * (xTarget - x) * DT + p.num('macro_gap_vol') * SQRT_DT * eps;
}

/** §3.4.2: g_pot = potentialGrowth0 + macro_ai_productivity_max × (aiRaceIndex − 50)/50 × techShare (caller passes 50 when missing). */
export function potentialGrowth(b: BlocId, aiRaceIndex: number, p: ParamsView): number {
  const d = BLOC_DEFAULTS[b];
  return d.potentialGrowth0 + p.num('macro_ai_productivity_max') * (aiRaceIndex - 50) / 50 * d.techShare;
}

/** §3.4.2: potentialGdpIndex × exp(g_pot/364); realGdpIndex = potentialGdpIndex × (1 + x) with x the already-stepped outputGap. */
export function stepLevels(st: Pick<BlocMacroState, 'potentialGdpIndex' | 'realGdpIndex' | 'outputGap'>, gPot: number): { potentialGdpIndex: number; realGdpIndex: number } {
  const potentialGdpIndex = st.potentialGdpIndex * dmath.exp(gPot / 364);
  return { potentialGdpIndex, realGdpIndex: potentialGdpIndex * (1 + st.outputGap) };
}

/** §3.4.2: 4 × ln(real_t / real_{t−91}); the caller passes genesis 100 before day 91. */
export function gdpGrowthQoQAnn(realNow: number, real91: number): number {
  return 4 * dmath.ln(safeDiv(realNow, real91, 1));
}

/** §3.4.3 Okun: u_target = u* − 0.5x; u + (u_target − u)(1 − 2^(−Δ/0.2)); clamp [0.015, 0.30]. */
export function stepUnemployment(u: number, nairu: number, x: number): number {
  const target = nairu - 0.5 * x;
  return dmath.clamp(u + (target - u) * (1 - dmath.pow(2, -DT / 0.2)), 0.015, 0.30);
}

/** §3.4.3: w = π_e1 + (g_pot − laborForceGrowth) − 0.5(u − u*). */
export function wageGrowth(piE1: number, gPot: number, lfGrowth: number, u: number, nairu: number): number {
  return piE1 + (gPot - lfGrowth) - 0.5 * (u - nairu);
}

/** §3.4.3: wageIndex × exp(w/364). */
export function stepWageIndex(w: number, wageIndex: number): number {
  return wageIndex * dmath.exp(w / 364);
}

/** §3.4.4: RW + 0.001·√Δ·ε (ε = draw 2 on S.shock(b)), clamped so r* = r*_0 + 0.5(g_pot − potentialGrowth0) + RW stays in r*_0 ± 0.01. */
export function stepNeutralRate(rw: number, eps: number, b: BlocId, gPot: number): { rw: number; rStar: number } {
  const d = BLOC_DEFAULTS[b];
  const tilt = 0.5 * (gPot - d.potentialGrowth0);
  const next = dmath.clamp(rw + 0.001 * SQRT_DT * eps, -0.01 - tilt, 0.01 - tilt);
  return { rw: next, rStar: d.rStar0 + tilt + next };
}
