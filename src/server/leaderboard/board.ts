// M2-03 world net-worth board: every saved ledger valued at one server quote snapshot, the Portfolio way
// (src/market/valuation.ts). Pure; the route feeds it AuthService.readStandings rows and the market snapshot taken in
// the same locked step.
import { ASSET_BY_ID } from "@/market/catalog";
import { LEADERBOARD_TOP, type LeaderboardRow, type LeaderboardView } from "@/market/leaderboard";
import { parseMinor, type MarketSnapshot } from "@/market/quoteSnapshot";
import { centsOf, netWorthMinor } from "@/market/valuation";
import type { StandingInput } from "@/server/auth";
import { fmt } from "@/shell/contracts/mockFeed";

/** Server mark (minor units) per asset at this snapshot; null for an unknown asset or an unreadable price. */
export function snapshotMark(snap: MarketSnapshot): (assetId: string) => number | null {
  return (id) => {
    const a = ASSET_BY_ID[id], r = snap.quotes.rows[id];
    if (!a || !r) return null;
    const m = parseMinor(r.last, a.displayDecimals);
    return m !== null && m > 0 ? m : null;
  };
}

/**
 * Rank by net worth, highest first. Ties share a rank (1, 2, 2, 4) and are listed by handle (case-insensitive key, then
 * account id as a last resort), so the order is the same on every read. A ledger that cannot be valued is not ranked.
 */
export function buildLeaderboard(inputs: readonly StandingInput[], snap: MarketSnapshot, selfId: string | null, top = LEADERBOARD_TOP): LeaderboardView {
  const mark = snapshotMark(snap);
  const valued = inputs.flatMap((p) => {
    // Launchpad coins at the same indicative liquidation value Portfolio adds; only the total, never the holdings.
    const nw = netWorthMinor(p.cashCents, p.positions, (id, qty) => {
      const m = mark(id);
      return m === null ? null : centsOf(ASSET_BY_ID[id]?.displayDecimals ?? 2, m * qty);
    });
    return nw === null ? [] : [{ p, nw: nw + p.coinCents }];
  });
  valued.sort((a, b) => b.nw - a.nw || (a.p.handleKey < b.p.handleKey ? -1 : a.p.handleKey > b.p.handleKey ? 1 : a.p.accountId < b.p.accountId ? -1 : 1));
  let self: LeaderboardRow | null = null;
  const rows: LeaderboardRow[] = [];
  let rank = 0;
  valued.forEach((v, i) => {
    if (i === 0 || v.nw !== valued[i - 1]!.nw) rank = i + 1;
    const r: LeaderboardRow = { rank, handle: v.p.handle, nw: fmt(v.nw, 2), self: v.p.accountId === selfId };
    if (r.self) self = r;
    if (i < top) rows.push(r);
  });
  return { worldId: snap.worldId, tick: snap.tick, players: valued.length, rows, self };
}
