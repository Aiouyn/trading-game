// GET /api/leaderboard (M2-03): the shared world's net-worth board. Public-safe only: rank, the account's public
// handle and its net worth (src/market/valuation.ts) at ONE server quote tick. Never an account id, cash, holdings,
// orders or any auth detail. `self` marks the caller's own row (the server knows it from the session).
import { PORT_AVALON_WORLD_ID } from "@/shell/worldIdentity";

export interface LeaderboardRow {
  readonly rank: number;
  readonly handle: string;
  /** Net worth, decimal string with 2 dp (Money). */
  readonly nw: string;
  readonly self: boolean;
}

export interface LeaderboardView {
  readonly worldId: typeof PORT_AVALON_WORLD_ID;
  /** The server quote tick every row is valued at. */
  readonly tick: number;
  /** Ranked accounts (all of them, not only the rows sent). */
  readonly players: number;
  /** Top rows, best first; ties share a rank and are ordered by handle. */
  readonly rows: readonly LeaderboardRow[];
  /** The caller's row (also inside `rows` when it is in the top); null if the caller's ledger cannot be valued. */
  readonly self: LeaderboardRow | null;
}

/** Rows sent: the top of the board (alpha-sized world); the caller's own row always comes separately in `self`. */
export const LEADERBOARD_TOP = 100;

const HANDLE_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,31}$/;
const MONEY_RE = /^-?\d+\.\d{2}$/;

function row(raw: unknown): LeaderboardRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (Object.keys(r).some((k) => !["rank", "handle", "nw", "self"].includes(k))) return null;
  if (!Number.isSafeInteger(r.rank) || (r.rank as number) < 1) return null;
  if (typeof r.handle !== "string" || !HANDLE_RE.test(r.handle)) return null;
  if (typeof r.nw !== "string" || !MONEY_RE.test(r.nw)) return null;
  if (typeof r.self !== "boolean") return null;
  return { rank: r.rank as number, handle: r.handle, nw: r.nw, self: r.self };
}

/** Client parse: anything off-shape (or with extra fields) is rejected, never shown. */
export function parseLeaderboard(raw: unknown): LeaderboardView | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.worldId !== PORT_AVALON_WORLD_ID) return null;
  if (!Number.isSafeInteger(o.tick) || (o.tick as number) < 0) return null;
  if (!Number.isSafeInteger(o.players) || (o.players as number) < 0) return null;
  if (!Array.isArray(o.rows) || o.rows.length > LEADERBOARD_TOP) return null;
  const rows: LeaderboardRow[] = [];
  for (const x of o.rows) { const r = row(x); if (!r) return null; rows.push(r); }
  const self = o.self === null ? null : row(o.self);
  if (o.self !== null && !self) return null;
  if (rows.filter((r) => r.self).length > 1) return null;
  return { worldId: PORT_AVALON_WORLD_ID, tick: o.tick as number, players: o.players as number, rows, self };
}
