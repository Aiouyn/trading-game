// Turns a lesson hint into the one thing the player can press. The hint text stays the simulation's.
import { presentNote } from "@/components/ui/format";

export interface LessonDo {
  label: string;
  line: string;
}

const LABEL: Record<string, (rest: string) => string> = {
  sheet: () => "Check the sheet",
  deposit: (rest) => `Deposit $${rest || "50"}`,
  buy: (rest) => {
    const n = rest.split(/\s+/).find((p) => /^\d+$/.test(p)) || "1";
    return `Buy ${n}`;
  },
  why: () => "Read why it moved",
  ask: () => "Ask",
  borrow: (rest) => (rest ? `Borrow $${rest}` : "Borrow"),
  repay: (rest) => (rest ? `Repay $${rest}` : "Repay"),
};

/** The next press, read from the hint. A "then type" line waits first; the type appears once the wait is done. */
export function lessonDo(hint: string): LessonDo | null {
  const text = hint.trim();
  if (!text) return null;
  const thenType = /then type\s+/i.test(text);
  const wantsWait = /\bWait\b/.test(text);
  if (wantsWait && (thenType || !/Type\s+[a-z]/i.test(text))) {
    return { label: "Let a day pass", line: "wait 1d" };
  }
  const typed = text.match(/Type\s+([a-z][a-z0-9]*)\s*([^.]*)\./i);
  if (!typed) return null;
  const verb = typed[1].toLowerCase();
  const rest = typed[2].trim();
  const label = LABEL[verb]?.(rest) ?? `Do this: ${verb}${rest ? ` ${rest}` : ""}`;
  return { label, line: `${verb}${rest ? ` ${rest}` : ""}` };
}

/** The aim, as a sentence a new player can read. */
export function goalSpeak(goal?: string): string {
  const g = (goal ?? "").trim();
  if (!g || /^no goal$/i.test(g)) return "No goal. Live the years.";
  if (/^net worth\b/i.test(g)) return `Reach ${g}`;
  if (/^a dynasty\b/i.test(g)) return `Build ${g}`;
  return g.charAt(0).toUpperCase() + g.slice(1);
}

export function timeSpeak(timeLeft?: string): string {
  if (!timeLeft || timeLeft === "open-ended") return "No clock";
  return timeLeft.replace(/\b1 months\b/, "1 month").replace(/\b1 years\b/, "1 year").replace(/\b1 days\b/, "1 day");
}

/** The hint, without ledger ids or a command the button already runs. */
export function hintSpeak(hint: string): string {
  const cleaned = hint
    .replace(/Type ask \d+\s+frm_[A-Za-z0-9_]+\./gi, "Ask them.")
    .replace(/Type buy frm_[A-Za-z0-9_]+ (\d+)\./gi, "Buy $1.")
    .replace(/Type why price frm_[A-Za-z0-9_]+\./gi, "Read why the price moved.")
    .replace(/Type\s+sheet\s*\./gi, "Check the sheet.")
    .replace(/Type\s+deposit\s+([^.]*)\./gi, (_, rest: string) => `Deposit $${rest.trim()}.`)
    .replace(/Type\s+([a-z][a-z0-9 ]*)\./gi, (_, rest: string) => {
      const line = rest.trim();
      return `${line.charAt(0).toUpperCase()}${line.slice(1)}.`;
    });
  return presentNote(cleaned);
}
