import { SortedMap, cmpStr } from './det';

export type Ccy = 'FDL' | 'EUN' | 'PYN' | 'NKR' | 'SRL';
export const CCYS: readonly Ccy[] = ['EUN', 'FDL', 'NKR', 'PYN', 'SRL']; // sorted byte order (spec §2.5 Δ8 rule 2)
export type Money = bigint;
export type Qty = bigint;
export type Price = bigint;
export type Tick = number;
export type Id = string;
export const MONEY_SCALE = 1_000_000n;

export function isCcy(s: string): s is Ccy {
  return (CCYS as readonly string[]).includes(s);
}

/** Round-half-even integer division (V3 02 §3.9). d > 0n. */
export function divRoundHalfEven(n: bigint, d: bigint): bigint {
  if (d <= 0n) throw new Error('divRoundHalfEven: d must be > 0n');
  let q = n / d;
  let r = n % d;
  if (r < 0n) { q -= 1n; r += d; } // floor division
  const twice = 2n * r;
  if (twice > d || (twice === d && q % 2n !== 0n)) q += 1n;
  return q;
}

/** Round half to even on a float64 (V3 02 §3.9.2). */
function roundHalfEvenNum(v: number): number {
  const f = Math.floor(v); const r = v - f;
  return r > 0.5 ? f + 1 : r < 0.5 ? f : f % 2 === 0 ? f : f + 1;
}
/** The ONLY float -> Money path (spec §2.1), V3 02 §3.9.2 verbatim: one IEEE multiply x * 1e6, then round half-even (PR #3 review F4). */
export function toMoney(x: number, ccy: Ccy): Money {
  void ccy; // the scale is the same for every Ccy (G3); kept for the binding signature
  if (!Number.isFinite(x)) throw new Error(`toMoney: non-finite ${x}`);
  const v = x * 1_000_000;
  return Math.abs(v) < 9_007_199_254_740_992 ? BigInt(roundHalfEvenNum(v)) : BigInt(v);
}

export function mulRate(m: Money, rateE6: bigint): Money {
  return divRoundHalfEven(m * rateE6, 1_000_000n);
}

/** Largest remainder; ties by id byte order (T02-04). Exact: Σ result === total. Zero weights get 0n. */
export function allocate(total: Money, weights: SortedMap<Id, bigint>): SortedMap<Id, Money> {
  const ids = weights.keys();
  const W = ids.reduce((s, k) => s + (weights.get(k) as bigint), 0n);
  if (W <= 0n) throw new Error('allocate: Σ weights must be > 0n');
  if (total < 0n) throw new Error('allocate: total must be ≥ 0n');
  const out = new SortedMap<Id, Money>();
  const rem: [Id, bigint][] = [];
  let given = 0n;
  for (const k of ids) {
    const w = weights.get(k) as bigint;
    if (w < 0n) throw new Error('allocate: negative weight');
    const base = (total * w) / W;
    out.set(k, base);
    given += base;
    rem.push([k, (total * w) % W]);
  }
  rem.sort((a, b) => (a[1] === b[1] ? cmpStr(a[0], b[0]) : a[1] > b[1] ? -1 : 1));
  for (let i = 0; given < total; i++, given++) out.set(rem[i][0], (out.get(rem[i][0]) as bigint) + 1n);
  return out;
}

export function fmtMoney(m: Money): string { return m.toString(); } // Money crossing the protocol is a decimal string (G3)
