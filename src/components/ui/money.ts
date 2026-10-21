// Money formatting for MoneyText (17 §3.4.1, 17-AT-05). Server amounts are decimal strings; this module
// only rearranges their digits. src/game/format.ts (number-based, no 3-significant-figure or T unit)
// cannot format them without converting to floats, so this thin string adapter does it instead [P].

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

/** 3 significant figures, half up, trailing zeros dropped: 12400 -> "12.4k", 4200000000000 -> "4.2T".
 *  From 1,000T up the whole number of T is shown (no larger unit in 17 §3.4.1). */
export function abbreviateDigits(int: string): string {
  let digits = int;
  const head = digits.slice(0, 3);
  if (Number(digits[3] ?? "0") >= 5) {
    const up = String(Number(head) + 1); // three digits at most: rounding, not money arithmetic
    digits = `${up}${digits.slice(3)}`; // 999 -> 1000 adds a digit, so the unit below may step up
  }
  const unit = UNITS.find(([d]) => digits.length > d);
  if (!unit) return digits;
  const intLen = digits.length - unit[0];
  const sig = digits.slice(0, Math.max(3, intLen));
  const whole = sig.slice(0, intLen);
  const dec = sig.slice(intLen).replace(/0+$/, "");
  return `${whole}${dec ? `.${dec}` : ""}${unit[1]}`;
}
