// T02-03: Black-Scholes price and greeks with continuous dividend yield (02 §3.8; used by 06). T in years, vega per 1.00 vol,
// theta per year (calendar convention of the caller).
import { EngineFault } from '../types';
import { exp, ln } from './exp';
import { normCdf, normPdf } from './special';

export type OptionKind = 'CALL' | 'PUT';
export interface BsInput { kind: OptionKind; S: number; K: number; T: number; r: number; q: number; sigma: number }
export interface BsGreeks { delta: number; gamma: number; vega: number; theta: number; rho: number }

/** Quant ruling on #33: fault only when sigma < 0, S ≤ 0, K ≤ 0 or an input is not finite (T ≤ 0 and sigma = 0 are limits). */
function check(i: BsInput): void {
  for (const v of [i.S, i.K, i.T, i.r, i.q, i.sigma]) {
    if (v !== v) throw new EngineFault('I0.nan', 'bs input NaN');
    if (!Number.isFinite(v)) throw new EngineFault('I0.domain', `bs input ${v} not finite`);
  }
  if (i.kind !== 'CALL' && i.kind !== 'PUT') throw new EngineFault('I0.domain', `bs kind ${String(i.kind)}`);
  if (i.sigma < 0 || i.S <= 0 || i.K <= 0) throw new EngineFault('I0.domain', `bs requires sigma ≥ 0, S > 0, K > 0 (sigma ${i.sigma}, S ${i.S}, K ${i.K})`);
}
const degenerate = (i: BsInput): boolean => i.T <= 0 || i.sigma === 0;
/** Discounted forward legs with T clamped to 0: F = S·e^{−qT}, Kd = K·e^{−rT}. */
function legs(i: BsInput): { T: number; eq: number; F: number; Kd: number } {
  const T = i.T > 0 ? i.T : 0, eq = exp(-i.q * T);
  return { T, eq, F: i.S * eq, Kd: i.K * exp(-i.r * T) };
}

function d12(i: BsInput): { d1: number; d2: number; sq: number } {
  const sq = i.sigma * Math.sqrt(i.T);
  const d1 = (ln(i.S / i.K) + (i.r - i.q + i.sigma * i.sigma / 2) * i.T) / sq;
  return { d1, d2: d1 - sq, sq };
}

export function bsPrice(i: BsInput): number {
  check(i);
  const { F: fS, Kd: fK } = legs(i);
  if (degenerate(i)) { const v = i.kind === 'CALL' ? fS - fK : fK - fS; return v > 0 ? v : 0; }   // card step 6 edge (T clamped to 0)
  const { d1, d2 } = d12(i);
  return i.kind === 'CALL' ? fS * normCdf(d1) - fK * normCdf(d2) : fK * normCdf(-d2) - fS * normCdf(-d1);
}

/** Standard closed forms; T ≤ 0 or σ = 0 use the limits of the Quant ruling on #33 (AC-02-03-GREEK-LIMITS). */
export function bsGreeks(i: BsInput): BsGreeks {
  check(i);
  if (degenerate(i)) return greekLimits(i);
  const { d1, d2, sq } = d12(i);
  const eq = exp(-i.q * i.T), er = exp(-i.r * i.T), pdf = normPdf(d1), rt = Math.sqrt(i.T);
  const gamma = eq * pdf / (i.S * sq), vega = i.S * eq * pdf * rt;
  const decay = -i.S * eq * pdf * i.sigma / (2 * rt);
  if (i.kind === 'CALL') {
    return { delta: eq * normCdf(d1), gamma, vega,
      theta: decay - i.r * i.K * er * normCdf(d2) + i.q * i.S * eq * normCdf(d1), rho: i.K * i.T * er * normCdf(d2) };
  }
  return { delta: -eq * normCdf(-d1), gamma, vega,
    theta: decay + i.r * i.K * er * normCdf(-d2) - i.q * i.S * eq * normCdf(-d1), rho: -i.K * i.T * er * normCdf(-d2) };
}

/** Limits (T clamped to 0, F = S·e^{−qT}, Kd = K·e^{−rT}): call delta = e^{−qT}·1[F > Kd] (½·e^{−qT} at an exact tie), put delta =
 *  call delta − e^{−qT}; gamma = vega = 0; theta = 0 at T ≤ 0; call rho = T·Kd·1[F > Kd], put rho = −T·Kd·1[F < Kd].
 *  σ = 0 with T > 0 (theta not given by the ruling): the σ → 0 limit of the closed form, call qF·1[F > Kd] − rKd·1[F > Kd],
 *  put rKd·1[F < Kd] − qF·1[F < Kd] (open question on #33). */
function greekLimits(i: BsInput): BsGreeks {
  const { T, eq, F, Kd } = legs(i);
  const itmCall = F > Kd, itmPut = F < Kd, live = T > 0;   // explicit branches: no −0 from 0·(negative)
  const callDelta = itmCall ? eq : F === Kd ? 0.5 * eq : 0;
  if (i.kind === 'CALL') {
    return { delta: callDelta, gamma: 0, vega: 0, theta: live && itmCall ? i.q * F - i.r * Kd : 0, rho: live && itmCall ? T * Kd : 0 };
  }
  return { delta: callDelta - eq, gamma: 0, vega: 0, theta: live && itmPut ? i.r * Kd - i.q * F : 0, rho: live && itmPut ? -T * Kd : 0 };
}
