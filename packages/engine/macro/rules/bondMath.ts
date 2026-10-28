// T04-11 bond math fallback (04 §3.10.2 T+0): clean price per 100 from a continuously compounded yield, used when 06 (ports.assets) has no price.
import { dmath } from '@tycoon/engine-core';

/** Coupons c/f·100 at T, T − 1/f, … (> 0) plus 100 at T, discounted at e^(−y·t); minus accrued c/f·100·(1 − t₁·f). freq 0 = zero coupon (bills). */
export function priceFromYieldLocal(couponRate: number, yearsToMaturity: number, yieldCc: number, freq: 0 | 1 | 2 | 4): number {
  const T = Math.max(0, yearsToMaturity);
  let pv = 100 * dmath.exp(-yieldCc * T);
  if (freq === 0) return pv;
  const cpn = (couponRate / freq) * 100, step = 1 / freq;
  let t = T;
  for (; t > 1e-12; t -= step) pv += cpn * dmath.exp(-yieldCc * t);
  const t1 = t + step;   // time to the first coupon still due
  return pv - cpn * (1 - t1 * freq);
}
