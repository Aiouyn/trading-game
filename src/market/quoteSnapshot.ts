// Shared quote snapshot for the single-process Port Avalon clock (M1-05).
// The server builds this from one MockFeed. Clients parse it and do not evolve prices themselves.
import { ASSETS, type AssetFixture } from "@/market/catalog";
import type { TickerBody, TickerRow } from "@/shell/contracts/channels";
import { PORT_AVALON_MARKET_SEED, PORT_AVALON_WORLD_ID } from "@/shell/worldIdentity";

export interface MarketSnapshot {
  readonly worldId: typeof PORT_AVALON_WORLD_ID;
  readonly marketSeed: number;
  readonly tick: number;
  readonly tickMs: number;
  readonly quotes: TickerBody;
  /** 04 §3.14.1 Fear Index F (0–100), PUBLIC macro.fear. Required on live server snapshots. */
  readonly fear?: number;
  /** 04 §3.14.1 risk appetite RA = 1 − F/50. */
  readonly riskAppetite?: number;
  /** L4 runtime listings (server snapshot; clients read them from the raw reply, src/market/listings.ts). */
  readonly listVersion?: number;
  readonly listed?: readonly AssetFixture[];
}

/** Integer minor units from a decimal price string. Null when the shape does not match `dp`. */
export function parseMinor(price: string, dp: number): number | null {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(price);
  if (!m) return null;
  const frac = m[3] ?? "";
  if (frac.length > dp) return null;
  const minor = Number(m[2]) * 10 ** dp + Number(frac.padEnd(dp, "0"));
  if (!Number.isSafeInteger(minor)) return null;
  return m[1] === "-" && minor !== 0 ? -minor : minor;
}

function isRow(raw: unknown, assetId: string, dp: number): raw is TickerRow {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Record<string, unknown>;
  if (r.assetId !== assetId) return false;
  if (typeof r.last !== "string" || typeof r.chg !== "string" || typeof r.chgPct !== "string" || typeof r.vol !== "string") return false;
  if (!/^\d+$/.test(r.vol)) return false;
  if (r.state !== "CONTINUOUS" || r.halted !== false) return false;
  if (parseMinor(r.last, dp) === null || parseMinor(r.chg, dp) === null) return false;
  if (!/^-?\d+\.\d{2}$/.test(r.chgPct)) return false;
  return true;
}

/** Accept only the Port Avalon seed-17 book. Anything else is ignored by the client. */
export function parseMarketSnapshot(raw: unknown): MarketSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.worldId !== PORT_AVALON_WORLD_ID) return null;
  if (o.marketSeed !== PORT_AVALON_MARKET_SEED) return null;
  if (!Number.isSafeInteger(o.tick) || (o.tick as number) < 0) return null;
  if (!Number.isSafeInteger(o.tickMs) || (o.tickMs as number) <= 0) return null;
  const quotes = o.quotes;
  if (!quotes || typeof quotes !== "object") return null;
  const q = quotes as Record<string, unknown>;
  if (q.listId !== "wl_default" || !q.rows || typeof q.rows !== "object") return null;
  const rowsIn = q.rows as Record<string, unknown>;
  const rows: Record<string, TickerRow> = {};
  for (const a of ASSETS) {
    const row = rowsIn[a.assetId];
    if (!isRow(row, a.assetId, a.displayDecimals)) return null;
    rows[a.assetId] = {
      assetId: a.assetId,
      last: row.last,
      chg: row.chg,
      chgPct: row.chgPct,
      vol: row.vol,
      state: "CONTINUOUS",
      halted: false,
    };
  }
  let fear: number | undefined;
  let riskAppetite: number | undefined;
  if (o.fear !== undefined || o.riskAppetite !== undefined) {
    if (typeof o.fear !== "number" || !Number.isFinite(o.fear) || o.fear < 0 || o.fear > 100) return null;
    if (typeof o.riskAppetite !== "number" || !Number.isFinite(o.riskAppetite)) return null;
    fear = o.fear;
    riskAppetite = o.riskAppetite;
  }
  return {
    worldId: PORT_AVALON_WORLD_ID,
    marketSeed: PORT_AVALON_MARKET_SEED,
    tick: o.tick as number,
    tickMs: o.tickMs as number,
    quotes: { listId: "wl_default", rows },
    ...(fear !== undefined ? { fear, riskAppetite } : {}),
  };
}
