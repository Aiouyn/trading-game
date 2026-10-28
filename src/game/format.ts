/** Number formatting per DESIGN.md: separators, 2 decimals, real minus U+2212. */
export const MINUS = '\u2212';

const nf = (min: number, max: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });
const NF2 = nf(2, 2);

function decimalsFor(price: number): number {
  const a = Math.abs(price);
  if (a >= 1) return 2;
  if (a >= 0.01) return 4;
  return 6;
}

/** Plain price, no currency sign: 1,284.10 or 0.0342 for sub-dollar assets. */
export function price(n: number): string {
  const d = decimalsFor(n);
  return fixMinus(nf(d, d).format(n));
}

/** Signed change in the quote's own precision: +0.04 on a $141 stock, not +0.0394. */
export function signedChange(change: number, ref: number): string {
  const d = decimalsFor(ref);
  const s = nf(d, d).format(Math.abs(change));
  return `${change < 0 && Number(s.replace(/,/g, '')) !== 0 ? MINUS : '+'}${s}`;
}

/** $48,212.40 */
export function money(n: number): string {
  const s = NF2.format(Math.abs(n));
  return n < 0 && Math.abs(n) >= 0.005 ? `${MINUS}$${s}` : `$${s}`;
}

/** +$1,284.10 / −$292.80 */
export function signedMoney(n: number): string {
  if (Math.abs(n) < 0.005) return '$0.00';
  return `${n > 0 ? '+' : MINUS}$${NF2.format(Math.abs(n))}`;
}

/** Fraction in, +2.74% out. */
export function signedPct(fraction: number): string {
  const v = fraction * 100;
  if (Math.abs(v) < 0.005) return '0.00%';
  return `${v > 0 ? '+' : MINUS}${NF2.format(Math.abs(v))}%`;
}

/** Fraction in, 12.40% out (weights). */
export function pct(fraction: number): string {
  return fixMinus(`${NF2.format(fraction * 100)}%`);
}

/** Quantities: whole units as 40, fractional up to 4 decimals. */
export function qty(n: number): string {
  return fixMinus(Number.isInteger(n) ? nf(0, 0).format(n) : nf(0, 4).format(n));
}

export function tone(n: number): 'gain' | 'loss' | 'flat' {
  if (n > 1e-9) return 'gain';
  if (n < -1e-9) return 'loss';
  return 'flat';
}

export const toneText = { gain: 'text-gain', loss: 'text-loss', flat: 'text-fg-muted' } as const;

function fixMinus(s: string): string {
  return s.replace(/-/g, MINUS);
}
