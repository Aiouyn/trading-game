// T02-03: Black-Scholes price and greeks with continuous dividend yield (02 §3.8; used by 06). T in years, vega per 1.00 vol,
// theta per year (calendar convention of the caller).
import { EngineFault } from '../types';
import { exp, ln } from './exp';
import { normCdf, normPdf } from './special';

export type OptionKind = 'CALL' | 'PUT';
export interface BsInput { kind: OptionKind; S: number; K: number; T: number; r: number; q: number; sigma: number }
export interface BsGreeks { delta: number; gamma: number; vega: number; theta: number; rho: number }

function check(i: BsInput): void {
  for (const v of [i.S, i.K, i.T, i.r, i.q, i.sigma]) if (v !== v) throw new EngineFault('I0.nan', 'bs input NaN');
  if (i.kind !== 'CALL' && i.kind !== 'PUT') throw new EngineFault('I0.domain', `bs kind ${String(i.kind)}`);
}
const degenerate = (i: BsInput): boolean => i.T <= 0 || i.sigma <= 0;

function d12(i: BsInput): { d1: number; d2: number; sq: number } {
  const sq = i.sigma * Math.sqrt(i.T);
  const d1 = (ln(i.S / i.K) + (i.r - i.q + i.sigma * i.sigma / 2) * i.T) / sq;
  return { d1, d2: d1 - sq, sq };
}

export function bsPrice(i: BsInput): number {
  check(i);
  const fS = i.S * exp(-i.q * i.T), fK = i.K * exp(-i.r * i.T);
  if (degenerate(i)) { const v = i.kind === 'CALL' ? fS - fK : fK - fS; return v > 0 ? v : 0; }   // card step 6 edge
  const { d1, d2 } = d12(i);
  return i.kind === 'CALL' ? fS * normCdf(d1) - fK * normCdf(d2) : fK * normCdf(-d2) - fS * normCdf(-d1);
}

/** Standard closed forms. T ≤ 0 or σ ≤ 0: EngineFault('I0.domain') (the card defines only the price edge; open question). */
export function bsGreeks(i: BsInput): BsGreeks {
  check(i);
  if (degenerate(i)) throw new EngineFault('I0.domain', 'bsGreeks requires T > 0 and sigma > 0');
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
