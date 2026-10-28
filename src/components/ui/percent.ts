// Percent from a bare decimal string in percent units ("-4.2" -> "−4.2%", FR "−4,2 %"). The digits are the
// server's, kept verbatim (no float maths); only the locale's punctuation comes from Intl: decimal mark, grouping and
// the percent sign and where it sits (FR puts a space before "%", always the narrow no-break U+202F). Negative uses U+2212.
import { MINUS } from "./money";

const DEC = /^([-+])?(\d+)(?:\.(\d+))?$/;

/** null when `value` is not a plain decimal (the caller shows it as sent). */
export function formatPercent(value: string, locale: string): string | null {
  const m = DEC.exec(value);
  if (!m) return null;
  const [, sign, int, frac] = m;
  const zero = /^0+$/.test(int) && !/[1-9]/.test(frac ?? "");
  // Template: a negative percent with one fraction digit gives every piece in locale order (sign, integer, decimal,
  // fraction, literal spacing, percent sign).
  const parts = new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).formatToParts(-0.015);
  const grouped = new Intl.NumberFormat(locale, { useGrouping: true }).format(BigInt(int));
  let out = "";
  for (const p of parts) {
    if (p.type === "minusSign") out += sign === "-" && !zero ? MINUS : "";
    else if (p.type === "integer") out += grouped;
    else if (p.type === "decimal") out += frac ? p.value : "";
    else if (p.type === "fraction") out += frac ?? "";
    // The space before "%" is always the narrow no-break space U+202F (French typography, Producer ruling); CLDR
    // ships a full U+00A0 there for fr, which Chromium and Node both print.
    else if (p.type === "literal" && /^\s$/u.test(p.value)) out += "\u202F";
    else out += p.value; // percentSign
  }
  return out;
}
