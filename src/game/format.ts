import { currentLocale, type Locale } from '@/i18n';
import { dexDigits, priceRule, type AssetClass } from '@/engine';

/**
 * Number formatting per DESIGN.md: separators, 2 decimals, real minus U+2212. Every figure follows the viewer's locale
 * (src/i18n): en reads $1,284.10, +2.74%, 250k; fr reads 1 284,10 $, +2,74 %, 250 k$ (decimal comma, a no-break space
 * before the dollar sign or the percent, the dollar sign after the figure, as the French copy writes it).
 */
export const MINUS = '−';
const NBSP = ' ';

const TAG: Record<Locale, string> = { en: 'en-US', fr: 'fr-FR' };
const formatters = new Map<string, Intl.NumberFormat>();

/** Digits with the viewer's separators, `min` to `max` decimals. The formatter is built once per locale and digit count. */
export function fmtNumber(n: number, min: number, max: number): string {
  const loc = currentLocale();
  const key = `${loc}:${min}:${max}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(TAG[loc], { minimumFractionDigits: min, maximumFractionDigits: max });
    formatters.set(key, f);
  }
  return f.format(n);
}

const isFr = () => currentLocale() === 'fr';

/** A dollar figure with its sign: $1,284.10 in English, 1 284,10 $ in French. */
function dollars(sign: string, figure: string): string {
  return isFr() ? `${sign}${figure}${NBSP}$` : `${sign}$${figure}`;
}

/** A percent figure with its sign: +2.74% in English, +2,74 % in French. */
function percentOf(sign: string, figure: string): string {
  return isFr() ? `${sign}${figure}${NBSP}%` : `${sign}${figure}%`;
}

/**
 * A decimal figure with `d` digits and no thousands separator, in the viewer's decimal separator: 2.74 in English, 2,74
 * in French. For the rates, multipliers and day counts that `toFixed` used to print.
 */
export function dec(n: number, d: number): string {
  const loc = currentLocale();
  const key = `dec:${loc}:${d}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(TAG[loc], { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false });
    formatters.set(key, f);
  }
  return f.format(n);
}

/** The percent sign alone, for a figure built outside this module (a whole percent on a chart label). */
export function pctUnit(): string {
  return isFr() ? `${NBSP}%` : '%';
}

function decimalsFor(price: number): number {
  const a = Math.abs(price);
  if (a >= 1) return 2;
  if (a >= 0.01) return 4;
  return 6;
}

/** Plain price, no currency sign: 1,284.10 or 0.0342 for sub-dollar assets (1 284,10 in French). Prefer assetPrice. */
export function price(n: number): string {
  const d = decimalsFor(n);
  return fixMinus(fmtNumber(n, d, d));
}

const SUBSCRIPT = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];

/**
 * A price in its asset's own precision (R-10-3): the one formatter every price display uses (ticket, watchlist, chart axis and
 * legend, positions, tape). The rules are priceRule in the engine (tick and decimals per class); a memecoin below a tenth of
 * a cent is written in the DEX subscript form, 0.0₅82, with the zeros counted in a subscript. No currency sign.
 */
export function assetPrice(def: { assetClass: AssetClass }, n: number): string {
  const r = priceRule(def.assetClass, n);
  if (r.dex && n > 0) {
    const zeros = String(r.dex.zeros).split('').map((c) => SUBSCRIPT[Number(c)]).join('');
    return `${isFr() ? '0,0' : '0.0'}${zeros}${dexDigits(n, r.dex.zeros, r.dex.digits)}`;
  }
  return fixMinus(fmtNumber(n, r.decimals, r.decimals));
}

/** Signed change in the quote's own precision: +0.04 on a $141 stock, not +0.0394. */
export function signedChange(change: number, ref: number): string {
  const d = decimalsFor(ref);
  const s = fmtNumber(Math.abs(change), d, d);
  const zero = !/[1-9]/.test(s);
  return `${change < 0 && !zero ? MINUS : '+'}${s}`;
}

/** $48,212.40 (48 212,40 $ in French) */
export function money(n: number): string {
  return dollars(n < 0 && Math.abs(n) >= 0.005 ? MINUS : '', fmtNumber(Math.abs(n), 2, 2));
}

/** +$1,284.10 / −$292.80 (+1 284,10 $ / −292,80 $) */
export function signedMoney(n: number): string {
  if (Math.abs(n) < 0.005) return dollars('', fmtNumber(0, 2, 2));
  return dollars(n > 0 ? '+' : MINUS, fmtNumber(Math.abs(n), 2, 2));
}

/**
 * A money figure split for the hero type (DESIGN §3): the whole part, and the cents in a smaller span. `prefix` and
 * `suffix` carry the sign and the currency outside the cents, so the figure reads the viewer's way in either language.
 */
export function moneyParts(n: number): { prefix: string; whole: string; cents: string; suffix: string } {
  const s = fmtNumber(Math.abs(n), 2, 2);
  const whole = s.slice(0, -3);
  const cents = s.slice(-3);
  const neg = n < 0;
  return isFr()
    ? { prefix: neg ? MINUS : '', whole, cents, suffix: `${NBSP}$` }
    : { prefix: `${neg ? MINUS : ''}$`, whole, cents, suffix: '' };
}

/** Fraction in, +2.74% out. */
export function signedPct(fraction: number): string {
  const v = fraction * 100;
  if (Math.abs(v) < 0.005) return percentOf('', fmtNumber(0, 2, 2));
  return percentOf(v > 0 ? '+' : MINUS, fmtNumber(Math.abs(v), 2, 2));
}

/** Fraction in, 12.40% out (weights). */
export function pct(fraction: number): string {
  return fixMinus(percentOf('', fmtNumber(fraction * 100, 2, 2)));
}

/** Quantities: whole units as 40, fractional up to 4 decimals. */
export function qty(n: number): string {
  return fixMinus(Number.isInteger(n) ? fmtNumber(n, 0, 0) : fmtNumber(n, 0, 4));
}

/** Compact, chips and progress bars only: $5.2k, $20k, $1.4M (5,2 k$, 20 k$, 1,4 M$ in French). */
export function compactMoney(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? MINUS : '';
  const fmt = (v: number, enSuffix: string, frSuffix: string) => {
    const r = (v >= 100 ? Math.round(v).toString() : (Math.round(v * 10) / 10).toString()).replace(/\.0$/, '');
    return isFr() ? `${sign}${r.replace('.', ',')}${NBSP}${frSuffix}$` : `${sign}$${r}${enSuffix}`;
  };
  if (a >= 1e9) return fmt(a / 1e9, 'B', 'Md');
  if (a >= 1e6) return fmt(a / 1e6, 'M', 'M');
  if (a >= 1e3) return fmt(a / 1e3, 'k', 'k');
  return isFr() ? `${sign}${Math.round(a)}${NBSP}$` : `${sign}$${Math.round(a)}`;
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
