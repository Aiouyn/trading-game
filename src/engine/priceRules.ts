/**
 * Price precision per asset (R-10-3): each asset has a tick size and a display precision, and every price on every screen
 * is written by one formatter (src/game/format.ts assetPrice) that reads these rules. Pure: no locale here.
 *
 * - Stocks, ETFs, bonds, property, commodities: 2 decimals (4 below $1, a sub-dollar share).
 * - FX: 5 decimals below 10 (1.08123, 0.66123), then one fewer per factor of ten: 149.123 (3 decimals near 100, the
 *   JPY-like convention).
 * - Crypto: 2 decimals from $1 up; below $1, 4 significant digits (0.5123, 0.03420, 0.002100).
 * - Memecoins (crypto below $0.001): the DEX subscript notation, 0.0₅82 for 0.0000082: the zeros after the point counted in a
 *   subscript, then 4 significant digits (trailing zeros dropped). The tick is the last of those digits.
 */
import type { AssetClass } from './types';

export interface PriceRule {
  /** the decimals the price is written with (the DEX form counts its zeros in a subscript instead) */
  decimals: number;
  /** the smallest move the price can make: 10^−decimals (DEX: the last significant digit) */
  tick: number;
  /** the DEX subscript form: `zeros` zeros after the decimal point, then `digits` significant digits */
  dex?: { zeros: number; digits: number };
}

/** Below this price a crypto asset is written in the DEX subscript form. */
export const DEX_BELOW = 0.001;

const SIG = 4;

/** The rule for one asset at one price. `assetClass` decides the convention; `value` is the price (or a level) to write. */
export function priceRule(assetClass: AssetClass, value: number): PriceRule {
  const v = Math.abs(value);
  if (!(v > 0) || !Number.isFinite(v)) return { decimals: 2, tick: 0.01 };
  const mag = Math.floor(Math.log10(v));
  if (assetClass === 'forex') {
    const d = v < 1 ? 5 : Math.max(3, 5 - mag);
    return { decimals: d, tick: Number(`1e-${d}`) };
  }
  if (assetClass === 'crypto') {
    if (v < DEX_BELOW) {
      const zeros = -mag - 1;
      return { decimals: zeros + SIG, tick: Number(`1e-${zeros + SIG}`), dex: { zeros, digits: SIG } };
    }
    if (v >= 1) return { decimals: 2, tick: 0.01 };
    const d = Math.min(8, Math.max(4, SIG - 1 - mag));
    return { decimals: d, tick: Number(`1e-${d}`) };
  }
  const d = v < 1 ? 4 : 2;
  return { decimals: d, tick: Number(`1e-${d}`) };
}

/** The digits of a DEX price: `zeros` zeros after the point, then the first `digits` significant digits, trailing zeros dropped. */
export function dexDigits(value: number, zeros: number, digits: number): string {
  const scaled = Math.round(Math.abs(value) * 10 ** (zeros + digits));
  return String(scaled).padStart(digits, '0').replace(/0+$/, '') || '0';
}
