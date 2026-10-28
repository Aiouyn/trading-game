// Positions number text (UI card 3, PF-3-02). Server strings are only regrouped for the locale and given a U+2212 minus;
// nothing is converted to a number (no Number(), no parseFloat), so digits and decimals stay exactly as sent.
import { MINUS } from "@/components/ui/money";
import { pfNumberLocale } from "../strings";
import type { Direction } from "./strings";

const DEC = /^([-+]?)(\d+)(?:\.(\d+))?$/;

/** "-1234.5" -> "−1,234.5" (en) / "−1 234,5" (fr). Anything that is not a decimal string is shown as sent. */
export function decText(s: string, locale: string): string {
  const m = DEC.exec(s);
  if (!m) return s;
  const frac = m[3] ?? "";
  // Intl.NumberFormat formats a decimal *string* exactly (no float step) when the fraction length is pinned.
  const body = new Intl.NumberFormat(pfNumberLocale(locale), { minimumFractionDigits: frac.length, maximumFractionDigits: frac.length })
    .format(`${m[2]}${frac ? `.${frac}` : ""}` as unknown as number);
  return `${m[1] === "-" ? MINUS : m[1]}${body}`;
}

/** Like decText, with an explicit "+" when the string is above zero (a sign, not maths): "4.4" -> "+4.4". */
export function signedText(s: string, locale: string): string {
  const t = decText(s, locale);
  return direction(s) === "up" && !s.startsWith("+") ? `+${t}` : t;
}

/** Direction from the leading sign of the string; zero ("0", "0.00", "-0.00") is flat. */
export function direction(s: string): Direction {
  const m = DEC.exec(s);
  if (!m || (/^0+$/.test(m[2]) && /^0*$/.test(m[3] ?? ""))) return "flat";
  return m[1] === "-" ? "down" : "up";
}

/** The digits of a signed decimal string without its sign, for speech ("-1.25" -> "1.25"). */
export const unsigned = (s: string) => s.replace(/^[-+]/, "");

export const ARROW: Record<Direction, string> = { up: "▲", down: "▼", flat: "" };
export const DIR_CLASS: Record<Direction, string> = { up: "gain", down: "loss", flat: "muted" };
