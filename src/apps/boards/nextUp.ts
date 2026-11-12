// Card 12: the closest player above on the public net-worth board, from the rows already shown.
// No engine fields, no invented neighbour when that row is not in the sent top list.
import type { LeaderboardView } from "@/market/leaderboard";

export type NextUp =
  | { kind: "ahead"; handle: string; ahead: string }
  | { kind: "lead" }
  | { kind: "tied"; others: number; nw: string }
  | { kind: "none" };

function cents(nw: string): number | null {
  const m = /^(-?)(\d+)\.(\d{2})$/.exec(nw);
  if (!m) return null;
  const n = Number(m[2]) * 100 + Number(m[3]);
  return m[1] === "-" ? -n : n;
}

function money(c: number): string {
  const sign = c < 0 ? "-" : "";
  const a = Math.abs(c);
  return `${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

export function nextUpFromView(view: Pick<LeaderboardView, "rows" | "self">): NextUp {
  const self = view.self;
  if (!self) return { kind: "none" };
  if (!view.rows.some((r) => r.self || r.handle === self.handle)) return { kind: "none" };
  const me = cents(self.nw);
  if (me === null) return { kind: "none" };

  let closest: { handle: string; nw: number } | null = null;
  for (const r of view.rows) {
    if (r.handle === self.handle) continue;
    const c = cents(r.nw);
    if (c === null || c <= me) continue;
    // Best-first list: a smaller still-above net worth is closer; the last of a tied higher amount is the neighbour.
    if (!closest || c <= closest.nw) closest = { handle: r.handle, nw: c };
  }
  if (closest) return { kind: "ahead", handle: closest.handle, ahead: money(closest.nw - me) };

  const others = view.rows.filter((r) => r.handle !== self.handle && r.nw === self.nw).length;
  if (others > 0) return { kind: "tied", others, nw: self.nw };
  return { kind: "lead" };
}
