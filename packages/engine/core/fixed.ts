// T02-04: fixed-point and money conversion (02 §3.9, D022). The only float-to-money path of the game.
import { CCYS, EngineFault, type Ccy, type Money, type Price, type Qty } from './types';
import { sortBy } from './order';
import { SortedMap } from './sorted';

export const MICRO = 1_000_000;
export const MICRO_N = 1_000_000n;
const TWO53 = 9_007_199_254_740_992;   // 2^53
const TWO52 = 4_503_599_627_370_496;   // 2^52
const TWO31 = 2_147_483_648n;          // 2^31

export function assertFinite(x: number, ctx: string): number {
  if (!Number.isFinite(x)) throw new EngineFault('I0.nan', `${ctx}: ${x}`);
  return x;
}

/** 02 §3.9.1 verbatim; |x| ≥ 2^52 is already an integer and returned unchanged (the subtraction is only exact below 2^52). */
export function roundHalfEven(x: number): number {
  assertFinite(x, 'roundHalfEven');
  if (Math.abs(x) >= TWO52) return x;
  const f = Math.floor(x);
  const d = x - f;                       // exact for |x| < 2^52
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return (f % 2 === 0) ? f : f + 1;      // tie
}

/** b === 0 -> fallback; a non-finite result -> fallback. */
export function safeDiv(a: number, b: number, fallback: number): number {
  if (b === 0) return fallback;
  const q = a / b;
  return Number.isFinite(q) ? q : fallback;
}

/** −0 -> +0 (02 §3.7.2 rule 3). */
export function normZero(x: number): number { return x === 0 ? 0 : x; }

/** 02 §3.9.2 verbatim (x in whole currency units, result in micro-units). */
export function toMoney(x: number, ccy: Ccy): Money {
  assertFinite(x, 'toMoney');
  if (!CCYS.includes(ccy)) throw new EngineFault('I0.ccy', `toMoney: unknown currency ${String(ccy)}`);
  const v = x * MICRO;                    // one IEEE multiply, deterministic
  if (Math.abs(v) < TWO53) return BigInt(roundHalfEven(v));
  return BigInt(v);                       // |v| >= 2^53 is already an integer-valued float
}

/** x in whole asset units; lotScale = base lots per unit (≤ 2^31). HALF_EVEN (default) or LOT_FLOOR (toward zero). */
export function toQty(x: number, lotScale: bigint, mode: 'HALF_EVEN' | 'LOT_FLOOR' = 'HALF_EVEN'): Qty {
  assertFinite(x, 'toQty');
  if (lotScale <= 0n || lotScale > TWO31) throw new EngineFault('I0.lot_scale', `toQty: lotScale ${lotScale} outside 1..2^31`);
  const v = x * Number(lotScale);
  assertFinite(v, 'toQty');
  return BigInt(mode === 'LOT_FLOOR' ? Math.trunc(v) : roundHalfEven(v));
}

/** Price micro-units, half-even, with toMoney's ≥ 2^53 branch. */
export function toPrice(x: number): Price {
  assertFinite(x, 'toPrice');
  const v = x * MICRO;
  if (Math.abs(v) < TWO53) return BigInt(roundHalfEven(v));
  return BigInt(v);
}

/** Number(m) / 1e6: model inputs only (never written back without toMoney). */
export function fromMoney(m: Money): number { return Number(m) / 1e6; }

/** n / d rounded half to even; d > 0. Correct for negative n. */
export function divRoundHalfEven(n: bigint, d: bigint): bigint {
  if (d <= 0n) throw new EngineFault('I0.div_zero', `divRoundHalfEven: d = ${d}`);
  const q = n / d;                        // truncating
  const r = n - q * d;
  const r2 = 2n * (r < 0n ? -r : r);
  const away = n < 0n ? -1n : 1n;
  if (r2 > d) return q + away;
  if (r2 === d) return q % 2n === 0n ? q : q + away;
  return q;
}

// 02 §3.9.3 table formulas, verbatim.
export function mulRate(m: Money, rateE6: bigint): Money { return divRoundHalfEven(m * rateE6, 1_000_000n); }
export function mulRateE12(m: Money, rateE12: bigint): Money { return divRoundHalfEven(m * rateE12, 10n ** 12n); }
/** Act/364 daily interest (03 §3.3.7). */
export function accrue(m: Money, annualRateE6: bigint, days: number): Money {
  if (!Number.isSafeInteger(days)) throw new EngineFault('I0.accrue_days', `accrue: days ${days} is not a safe integer`); // E-55: before BigInt()
  return divRoundHalfEven(m * annualRateE6 * BigInt(days), 1_000_000n * 364n);
}
export function notional(qty: Qty, price: Price, lotScale: bigint): Money { return divRoundHalfEven(qty * price, lotScale); }
/** rate = units of target per unit of source, micro. */
export function fxConvert(m: Money, rateE6: bigint): Money { return divRoundHalfEven(m * rateE6, 1_000_000n); }

/** Largest remainder: base_i = floor(total·w_i / W); the remainder goes one unit each to the largest fractional remainders
 *  (total·w_i mod W), ties by id (cmpStr). Negative totals allocate |total| and negate. Parts always sum exactly to total.
 *  Returns a Map (G6 signature) whose insertion order is ascending id (cmpStr), so its iteration order is deterministic. */
export function allocate(total: bigint, weights: readonly { id: string; w: bigint }[]): Map<string, bigint> {
  let W = 0n;
  for (const { id, w } of weights) {
    if (w < 0n) throw new EngineFault('I0.allocate', `allocate: negative weight for ${id}`);
    W += w;
  }
  if (W <= 0n) throw new EngineFault('I0.allocate', 'allocate: total weight must be > 0');
  const byId = sortBy(weights, (x) => [x.id]);
  for (let i = 1; i < byId.length; i++) if (byId[i - 1]!.id === byId[i]!.id) throw new EngineFault('I0.allocate_dup', `allocate: duplicate id ${byId[i]!.id}`);
  const neg = total < 0n, T = neg ? -total : total;
  const parts = byId.map((x) => ({ id: x.id, base: (T * x.w) / W, rem: (T * x.w) % W }));
  let R = T;
  for (const p of parts) R -= p.base;
  const order = sortBy(parts, (p) => [-p.rem, p.id]);
  for (let i = 0; i < Number(R); i++) order[i]!.base += 1n;
  // eslint-disable-next-line no-restricted-globals -- G6 signature returns Map; built in ascending id order (deterministic insertion order)
  const out = new Map<string, bigint>();
  for (const p of parts) out.set(p.id, neg ? -p.base : p.base);
  return out;
}

/** allocate over the holdings (weights = holdings), as a SortedMap. */
export function proRata(total: bigint, holdings: SortedMap<string, bigint>): SortedMap<string, bigint> {
  const ws: { id: string; w: bigint }[] = [];
  for (const [id, w] of holdings) ws.push({ id, w });
  const out = new SortedMap<string, bigint>();
  for (const [id, v] of allocate(total, ws)) out.set(id, v);
  return out;
}

