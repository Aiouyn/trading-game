// Mock provider for the clock / rank / me channels (Spec 1 §2). Replaced by the gateway later.
// Query params let tests script a character: ?rank=R3&lic=LIC2&nw=150000&day=3&flags=api.eligible&guest=0&prot=1
import type { Channels, ClockChannel } from "./channels";
import { RANKS, type Rank } from "./registry";

export const TICK_MS = 5000;
export const TICKS_PER_DAY = 720;

export function mockChannels(q: URLSearchParams): Channels {
  const rankParam = q.get("rank") ?? "R2";
  const rank: Rank = (RANKS as readonly string[]).includes(rankParam) ? (rankParam as Rank) : "R2";
  const flags = (q.get("flags") ?? "").split(",").filter(Boolean);
  return {
    clock: clockAt(Number(q.get("tick") ?? 38 * TICKS_PER_DAY + 340)),
    rank: { rank, nextAt: "5000000" },
    me: {
      nw: q.get("nw") ?? "412860.15",
      todayPct: q.get("pct") ?? "+0.78",
      license: q.get("lic") ?? "LIC1",
      charters: (q.get("charters") ?? "").split(",").filter(Boolean),
      flags,
      gameDay: Number(q.get("day") ?? 5),
      onboardingMin: Number(q.get("onb") ?? 60),
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
