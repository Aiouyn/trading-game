// T04-07 sovereign credit (04 §3.11.1–§3.11.4): pure parts. stepSovereignCredit / igExclusionCheck (store + ports) follow.
// exp / ln / pow via dmath (G8). BlocIds: FU = FDL, NA = NKR (BLOC_DEFAULTS conv FDL 0.002, NKR 0.0005).
import { dmath } from '@tycoon/engine-core';
import type { BlocId, FxState } from '../schema';

export const GRADES = ['AAA', 'AA+', 'AA', 'AA-', 'A+', 'A', 'A-', 'BBB+', 'BBB', 'BBB-', 'BB+', 'BB', 'BB-', 'B+', 'B', 'B-', 'CCC', 'CC', 'C', 'D'] as const;

export interface HazardInputs { b: BlocId; debtGdp: number; dStar: number; rEff: number; gPot: number; target: number; primaryBalanceGdp: number;
  fxDebtShare: number; depVsFdlYoy: number; reserveCoverMonths: number; fxRegime: FxState['regime']; fear: number; politicalStability: number;
  failedAuctions21d: number; coreInflation: number }

const LAMBDA_MIN = 1e-5, LAMBDA_MAX = 0.60, DISTRESS = 0.08;

/** z1..z8 unclamped, in order (§3.11.1). */
export function hazardZ(x: HazardInputs): number[] {
  const gNom = x.gPot + x.target, pbGap = (x.rEff - gNom) * x.debtGdp - x.primaryBalanceGdp;
  const reserveRegime = x.fxRegime === 'MANAGED_FLOAT' || x.fxRegime === 'MANAGED_BAND' || x.fxRegime === 'HARD_PEG';
  return [
    (x.debtGdp - x.dStar) / 0.40,
    pbGap / 0.03,
    x.fxDebtShare * Math.max(0, x.depVsFdlYoy) / 0.10,
    reserveRegime ? Math.max(0, (6 - x.reserveCoverMonths) / 3) : 0,
    (x.fear - 50) / 25,
    (0.5 - x.politicalStability) / 0.25,
    x.failedAuctions21d,
    Math.max(0, x.coreInflation - x.target) / 0.05,
  ];
}

/** [1.2, 0.8, 1.0, 0.6, w5, 0.5, 0.7, 0.3], w5 = FU −0.2, NA −0.1, else 0.4. */
export function hazardWeights(b: BlocId): number[] {
  return [1.2, 0.8, 1.0, 0.6, b === 'FDL' ? -0.2 : b === 'NKR' ? -0.1 : 0.4, 0.5, 0.7, 0.3];
}

/** λ_raw = clamp(λ0·exp(Σ w_k·clamp(z_k, −3, 4)), 1e−5, 0.60); FU cap 0.02, NA cap 0.03; then Concord × 0.6, POST_RESTRUCTURING
 *  floor 0.08·2^(−days/182), shock multiplier last, re-clamped to [1e−5, 0.60]. */
export function hazardRaw(lambda0: number, z: number[], w: number[], b: BlocId, mods: { concordActive: boolean; postRestructuringDays: number | null; shockMult: number }): number {
  let s = 0;
  for (let k = 0; k < z.length; k++) s += w[k]! * dmath.clamp(z[k]!, -3, 4);
  let l = dmath.clamp(lambda0 * dmath.exp(s), LAMBDA_MIN, LAMBDA_MAX);
  if (b === 'FDL') l = Math.min(l, 0.02); else if (b === 'NKR') l = Math.min(l, 0.03);
  if (mods.concordActive) l *= 0.6;
  if (mods.postRestructuringDays !== null) l = Math.max(l, 0.08 * dmath.pow(2, -mods.postRestructuringDays / 182));
  return dmath.clamp(l * mods.shockMult, LAMBDA_MIN, LAMBDA_MAX);
}

/** 5-day half-life λ ← λ + (λ_raw − λ)(1 − 2^(−1/5)); on a shock trigger day λ = λ_raw. */
export function stepHazard(lambda: number, lambdaRaw: number, shockTriggeredToday: boolean): number {
  return shockTriggeredToday ? lambdaRaw : lambda + (lambdaRaw - lambda) * (1 - dmath.pow(2, -1 / 5));
}

/** clamp(ln(λ/λ0)/ln 50, 0, 1). */
export function stressIndexOf(lambda: number, lambda0: number): number {
  return dmath.clamp(dmath.ln(lambda / lambda0) / dmath.ln(50), 0, 1);
}

/** Normal 0.6 + 0.4·min(1, τ/5); distress (λ > 0.08) 1.3 − 0.3·min(1, τ/5). */
export function hTerm(tau: number, lambda: number): number {
  const m = Math.min(1, tau / 5);
  return lambda > DISTRESS ? 1.3 - 0.3 * m : 0.6 + 0.4 * m;
}

/** LGD·λ·h(τ). */
export function sovSpread(tau: number, lambda: number, lgd: number): number { return lgd * lambda * hTerm(tau, lambda); }

/** 1 − e^(−λ·T·h(T)). */
export function pdAt(T: number, lambda: number): number { return 1 - dmath.exp(-lambda * T * hTerm(T, lambda)); }

/** FU 0 + breach premium; else 0.001(1 + 2(1 − depth)) + breach. */
export function liquidityPremium(b: BlocId, depthIndex: number, ruleBreachPremium: number): number {
  return b === 'FDL' ? ruleBreachPremium : 0.001 * (1 + 2 * (1 - depthIndex)) + ruleBreachPremium;
}

/** §3.11.3 market-implied λ = s / (LGD·h(τ)) (exploit 8: never feeds λ, triggers or the curve). τ is 5 (CDS) or 10 (bond), where h = 1 in both
 *  the normal and the distress shape, so λ = s / LGD. CDS takes precedence when listed with adv ≥ the on-the-run 10y line's adv (or no line adv);
 *  else from y10Mkt; neither → null. */
export function marketHazard(y10Mkt: number | null, ois10: number, tp10: number, liq: number, conv: number, lgd: number, cds: { spread5y: number; adv: number } | null, bondAdv: number | null): number | null {
  if (cds !== null && (bondAdv === null || cds.adv >= bondAdv)) return cds.spread5y / lgd;
  if (y10Mkt === null) return null;
  return Math.max(0, y10Mkt - ois10 - tp10 - liq + conv) / lgd;
}

const gradeIndex = (g: string): number => (GRADES as readonly string[]).indexOf(g);
const BBB_MINUS = gradeIndex('BBB-');

/** Two of three agencies at BBB- or better (unknown grades never count). */
export function isInvestmentGrade(grades: string[]): boolean {
  let n = 0;
  for (const g of grades) { const i = gradeIndex(g); if (i >= 0 && i <= BBB_MINUS) n++; }
  return n >= 2;
}

/** The grade of the second-best agency (collateral grade, §3.8.3); null with fewer than two known grades. */
export function lowestOfTwoBest(grades: string[]): string | null {
  const idx: number[] = [];
  for (const g of grades) { const i = gradeIndex(g); if (i >= 0) idx.push(i); }
  if (idx.length < 2) return null;
  idx.sort((a, c) => a - c);
  return GRADES[idx[1]!]!;
}
