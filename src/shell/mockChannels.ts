// Mock provider for the clock / rank / me channels (Spec 1 §2). Replaced by the gateway later.
// Mock server for the clock / rank / me channels (stands in for the gateway). Query params script a character:
// ?rank=R3&lic=LIC2&nw=150000&flags=character.day3,api.eligible&guest=0&prot=1&onb=5&onbDone=0
import type { Channels, ClockChannel, RankChannel, ShellId } from "./channels";
import { MOCK_HOOKS } from "./hooks";
import { RANKS, type Rank } from "./registry";

export const TICK_MS = 5000;
/** 14's rank thresholds as the server would publish them (17 header): R1 $20k … R5 $2B. */
export const RANK_THRESHOLDS = ["20000", "250000", "5000000", "100000000", "2000000000"] as const;
export const TICKS_PER_DAY = 720;

export function mockChannels(q: URLSearchParams): Channels {
  const rankParam = q.get("rank") ?? "R2";
  const rank: Rank = (RANKS as readonly string[]).includes(rankParam) ? (rankParam as Rank) : "R2";
  const flags = (q.get("flags") ?? "").split(",").filter(Boolean);
  return {
    clock: clockAt(Number(q.get("tick") ?? 38 * TICKS_PER_DAY + 340)),
    rank: { rank, thresholds: [...RANK_THRESHOLDS], nextAt: RANK_THRESHOLDS[RANKS.indexOf(rank)] ?? null, ...mockShells(q, rank) },
    system: { connection: q.get("conn") === "reconnecting" ? "reconnecting" : "live", halted: q.get("halted") === "1", held: q.get("held") === "1", load: q.get("load")?.startsWith("fail") ? "error" : "ok", offline: false },
    me: {
      nw: q.get("nw") ?? "412860.15",
      todayPct: q.get("pct") ?? "+0.78",
      todayChg: q.get("chg") ?? "+3204.10",
      license: q.get("lic") ?? "LIC1",
      charters: (q.get("charters") ?? "").split(",").filter(Boolean),
      flags,
      onboardingMin: Number(q.get("onb") ?? 60),
      onboardingDone: q.get("onbDone") !== "0",
      myPlaces: (q.get("places") ?? "").split(",").filter(Boolean),
      guest: q.get("guest") === "1",
      protectionEndsRealMs: q.get("prot") === "1" ? 41 * 60_000 + 12_000 : null,
    },
  };
}

/** Clock from a tick: 720 ticks per game day, each tick = 2 game minutes. */
export function clockAt(tick: number): ClockChannel {
  const gameDay = Math.floor(tick / TICKS_PER_DAY);
  const tickOfDay = tick % TICKS_PER_DAY;
  const minute = tickOfDay * 2;
  const phase = minute < 9 * 60 + 30 ? "pre" : minute < 16 * 60 ? "continuous" : "after";
  return { tick, gameDay, tickOfDay, phase };
}

export function clockLabel(c: ClockChannel): { day: number; hhmm: string } {
  const m = c.tickOfDay * 2;
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return { day: c.gameDay, hhmm: `${hh}:${mm}` };
}

const isShellId = (v: string): v is ShellId => /^r[0-6]$/.test(v) || /^cosmetic_[a-z0-9_]+$/.test(v);
/**
 * Shells for the rank channel: every rank shell up to the current rank by default. In dev / e2e builds only
 * (build-gated, src/shell/hooks.ts) a URL script can list them: `shells=r0,r1,cosmetic_glass&owned=cosmetic_glass`.
 */
export function mockShells(q: URLSearchParams, rank: Rank): Pick<RankChannel, "shellsEarned" | "shellsOwned"> {
  const byRank = RANKS.slice(0, RANKS.indexOf(rank) + 1).map((r) => r.toLowerCase() as ShellId);
  if (!MOCK_HOOKS) return { shellsEarned: byRank, shellsOwned: [] };
  const list = (k: string) => (q.get(k) ?? "").split(",").filter(isShellId);
  const shells = q.get("shells");
  return { shellsEarned: shells === null ? byRank : list("shells"), shellsOwned: list("owned") };
}
