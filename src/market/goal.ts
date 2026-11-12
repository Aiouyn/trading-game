// M2-02 "Goal: grow $10k" (V1 board): the start is the server's starting cash (START_CASH_CENTS, $10,000) and the target
// the first rank threshold (RANK_THRESHOLDS[0], $20,000: R0 Broke → R1 Hustler; DESIGN §6b step 6 "Reach $20k
// (Hustler)"). Progress is for the bar only, from a net worth the server's ledger and marks produced (`me.nw`); it is
// never shown as money and never feeds a balance.
import { DEMO_STARTER_NW } from "@/shell/accountDemoBoundary";
import { RANK_THRESHOLDS } from "@/shell/mockChannels";

export const GOAL_START = DEMO_STARTER_NW; // "10000.00"
export const GOAL_TARGET = RANK_THRESHOLDS[0]; // "20000"

/** Decimal money string → integer minor units; null when it is not a plain decimal. */
function minor(m: string): number | null {
  if (!/^-?\d+(\.\d{1,2})?$/.test(m)) return null;
  const [i, f = ""] = m.replace("-", "").split(".");
  const v = Number(i) * 100 + Number(f.padEnd(2, "0"));
  return m.startsWith("-") ? -v : v;
}

export interface GoalProgress { /** whole percent 0..100 from start to target */ pct: number; below: boolean; reached: boolean }

export function goalProgress(nw: string): GoalProgress {
  const s = minor(GOAL_START)!, t = minor(GOAL_TARGET)!, n = minor(nw);
  if (n === null) return { pct: 0, below: false, reached: false };
  const pct = Math.min(100, Math.max(0, Math.floor(((n - s) * 100) / (t - s))));
  return { pct, below: n < s, reached: n >= t };
}
