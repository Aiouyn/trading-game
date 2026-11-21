// What order 131 put on the wire, as the screens read it: the quote facts, the order records and the one account snapshot.
// Nothing is priced here. Every number is the sim's; these are only the shapes and the words that go with them.
import { shortDate } from "@/shell/calendar";
import type { SimView } from "@/shell/simSession";

export interface QuoteFacts {
  instr: string; px: number; prev: number; chg: number; chgBase?: string; chgWindow?: string;
  vol: number; volSource?: "real" | "none"; barSource?: "traded" | "indicative";
  asOf?: "today" | "last session"; sessionDay?: number; sessionDate?: string;
  bid?: number; ask?: number; bidQty?: number; askQty?: number;
  mark?: number; markRule?: string; markInputs?: string;
  lastExecPx?: number; lastExecDay?: number; lastExecTick?: number;
  ret?: number | null; ret1y?: number | null; retWindow?: string; retSessions?: number;
}

export function quoteFacts(view: SimView, instr: string): QuoteFacts | null {
  const q = view.quotes.find((x) => x.instr === instr);
  return q ? (q as unknown as QuoteFacts) : null;
}

export interface OrderLife {
  id: number; book: string; instr: string; side: string; qty: number;
  status: "queued" | "working" | "filled" | "partial" | "rejected" | "cancelled";
  type: string; reserved: number; limit: number | null; next: string; reason: string;
  fills: { day: number; tick: number; qty: number; px: number; fee: number }[];
  rejectedQty: number; fee: number;
}

export function orderRecords(view: SimView): OrderLife[] {
  return Array.isArray(view.orderRecords) ? view.orderRecords : [];
}

export interface Account {
  rev: number; cash: number; deposits: number; shares: number; coins: number; bonds: number; business: number; goods: number;
  debts: number; shorts: number; owed: number; basis: number; fees: number; netWorth: number; residual: number;
  today: { dollars: number; pct: number; base: number; baseLabel: string };
  investment: number; spending: number; flows: number;
}

export function accountOf(view: SimView): Account | null {
  return view.account ?? null;
}

/** The exchange runs eight ticks a session: tick 0 is the open. */
export function tickWord(tick: number): string {
  if (tick <= 0) return "at the open";
  return `session slice ${tick + 1} of 8`;
}

/** When a quote's last real fill happened, in words. */
export function lastFillWord(f: QuoteFacts): string {
  if (!f.lastExecPx || (f.lastExecDay ?? -1) < 0) return "none yet";
  return `${shortDate(f.lastExecDay ?? 0)}, ${tickWord(f.lastExecTick ?? 0)}`;
}

export const STATUS_WORD: Record<OrderLife["status"], string> = {
  queued: "Queued", working: "Resting", filled: "Filled", partial: "Partly filled", rejected: "Rejected", cancelled: "Cancelled",
};
