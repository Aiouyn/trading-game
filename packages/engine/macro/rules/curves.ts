// T04-07 (04 §3.7.3, §3.7.4, §3.7.6, §3.7.7) pure curve pieces T04-09 needs: OIS from the expected path, term premium, breakevens,
// cross-currency basis. The curve build (buildCurve / recomputeCurve) is not here yet (MISSING EXPORT: T04-18 activeShockSum, T04-20 inputSnapshot).
import { dmath } from '@tycoon/engine-core';
import { BLOC_DEFAULTS } from '../blocs';
import type { BlocId } from '../schema';

export const CURVE_NODES = Object.freeze([0.25, 0.5, 1, 2, 5, 10, 30] as const);
type Path = Record<1 | 2 | 4 | 8, number>;

export function nInfinity(rStarCb: number, piE5: number): number { return rStarCb + piE5; }

/** f(s): linear through (0,i), (0.25,E1), (0.5,E2), (1,E4), (2,E8); beyond 2: nInf + (E8 − nInf)·2^(−(s−2)/2). */
export function forwardRate(s: number, i: number, E: Path, nInf: number): number {
  const xs = [0, 0.25, 0.5, 1, 2], ys = [i, E[1], E[2], E[4], E[8]];
  if (s > 2) return nInf + (E[8] - nInf) * dmath.pow(2, -(s - 2) / 2);
  for (let k = 1; k < xs.length; k++) if (s <= xs[k]!) return ys[k - 1]! + ((ys[k]! - ys[k - 1]!) * (s - xs[k - 1]!)) / (xs[k]! - xs[k - 1]!);
  return E[8];
}

/** (1/τ)∫₀^τ f, trapezoid on the k/52 grid; a τ below one grid step (overnight) uses the single trapezoid [0, τ]. */
export function oisZero(tau: number, i: number, E: Path, nInf: number): number {
  const n = Math.floor(tau * 52 + 1e-9);
  if (n === 0) return (forwardRate(0, i, E, nInf) + forwardRate(tau, i, E, nInf)) / 2;
  let sum = 0;
  for (let k = 0; k < n; k++) sum += (forwardRate(k / 52, i, E, nInf) + forwardRate((k + 1) / 52, i, E, nInf)) / 2 / 52;
  return sum / tau;
}

export interface TermPremiumInputs { b: BlocId; piE5: number; target: number; debtGdp: number; dStar: number; qeHoldingsGdp: number; fear: number; shockSum: number }
/** tpBase + 0.25·|π_e5 − π*| + 0.15·(debt − d*)/0.5·0.01 − 0.00025·(qe/0.01) + tpFear·(F − 50)/10 + shockSum, clamp [−0.01, 0.04]. */
export function termPremium10(x: TermPremiumInputs): number {
  const d = BLOC_DEFAULTS[x.b];
  const tp = d.tpBase + 0.25 * (Math.abs(x.piE5 - x.target) / 0.01) * 0.01 + 0.15 * ((x.debtGdp - x.dStar) / 0.5) * 0.01
    - 0.00025 * (x.qeHoldingsGdp / 0.01) + (d.tpFear * (x.fear - 50)) / 10 + x.shockSum;
  return Math.min(0.04, Math.max(-0.01, tp));
}
export function termPremiumAt(tp10: number, tau: number): number { return (tp10 * (1 - dmath.exp(-tau / 4))) / (1 - dmath.exp(-2.5)); }

export function breakevenAt(tau: number, piE1: number, piE5: number, irp: number): number {
  const be10 = 0.6 * piE5 + 0.4 * piE1 + irp;
  if (tau <= 1) return piE1;
  return tau <= 10 ? piE1 + ((be10 - piE1) * (tau - 1)) / 9 : be10;
}

/** EUN/PYN/NKR −(0.0005 + 0.006·max(0, FSI − 0.3)); SRL −(0.003 + 0.015·FSI); FDL 0; an active swap line floors it at −0.0025. */
export function crossCurrencyBasis(b: BlocId, fsi: number, swapLineActive: boolean): number {
  if (b === 'FDL') return 0;
  const raw = b === 'SRL' ? -(0.003 + 0.015 * fsi) : -(0.0005 + 0.006 * Math.max(0, fsi - 0.3));
  return swapLineActive ? Math.max(raw, -0.0025) : raw;
}
