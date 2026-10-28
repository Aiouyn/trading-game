// Money formatting for MoneyText (17 §3.4.1, 17-AT-05). Server amounts are decimal strings; this module only
// rearranges their digits, never converting to floats [P]. src/game/format.ts is number-based (no 3-significant-figure
// or T unit) and, since #83 deleted the legacy sim, has no src caller that routes numbers here via decimalString.

export const MINUS = "\u2212";

export interface ParsedAmount { negative: boolean; int: string; frac: string }

/** "-1234.5" -> { negative: true, int: "1234", frac: "50" }. Throws on anything but a decimal string. */
export function parseAmount(amount: string): ParsedAmount {
  const m = /^([-+]?)(\d+)(?:\.(\d+))?$/.exec(amount.trim());
  if (!m) throw new Error(`MoneyText: not a decimal string: ${amount}`);
  const int = m[2].replace(/^0+(?=\d)/, "");
  const frac = (m[3] ?? "").padEnd(2, "0").slice(0, 2);
  const zero = /^0+$/.test(int) && /^0*$/.test(m[3] ?? "");
  return { negative: m[1] === "-" && !zero, int, frac };
}

export const isZero = (p: ParsedAmount) => /^0+$/.test(p.int) && /^0*$/.test(p.frac);

const group = (int: string) => int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Full precision without sign or symbol: "12,400.00". */
export const fullDigits = (p: ParsedAmount) => `${group(p.int)}.${p.frac}`;

/** Lists, chips and sentences abbreviate from 10,000 (17 §3.4.1). */
export const shouldAbbreviate = (p: ParsedAmount) => p.int.length >= 5;

const UNITS: readonly (readonly [number, string])[] = [[12, "T"], [9, "B"], [6, "M"], [3, "k"]];

/** The one compact-money formatter for wealth (Studio #67 condition, sign ruling 2026-10-28): 3 significant figures,
 *  the magnitude ALWAYS truncated toward zero whatever the sign, trailing zeros dropped: 412860.15 -> "412k",
 *  1999999 -> "1.99M", 4200000000000 -> "4.2T". The caller adds the sign, so −412,000.01 reads −$412k, never −$413k:
 *  a compact figure never shows more than the real magnitude. Dropped digits (cents included) never round up, so only
 *  the whole part is needed. From 1,000T up the whole number of T is shown (no larger unit in 17 §3.4.1). Digits only:
 *  no locale variant exists yet (FR i18n pass). */
export function abbreviateDigits(int: string): string {
  const unit = UNITS.find(([d]) => int.length > d);
  if (!unit) return int;
  const intLen = int.length - unit[0];
  const sig = int.slice(0, Math.max(3, intLen));
  const whole = sig.slice(0, intLen);
  const dec = sig.slice(intLen).replace(/0+$/, "");
  return `${whole}${dec ? `.${dec}` : ""}${unit[1]}`;
}

/** MoneyText's text for an abbreviating context (list, chip, sentence), for plain-string callers such as legacy toasts:
 *  "250000" -> "$250k", "-412860.15" -> "−$412k", "5000" -> "$5,000.00" (abbreviates from 10,000), "0" -> "$0.00".
 *  Same parse, zero rule, threshold and truncation as MoneyText (pinned by a parity test). */
export function compactMoneyText(amount: string): string {
  const p = parseAmount(amount);
  if (isZero(p)) return "$0.00";
  const digits = shouldAbbreviate(p) ? abbreviateDigits(p.int) : fullDigits(p);
  return `${p.negative ? MINUS : ""}$${digits}`;
}
