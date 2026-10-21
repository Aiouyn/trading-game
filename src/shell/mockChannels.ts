// Mock server for the clock / rank / me channels (stands in for the gateway). Query params script a character:
// rank, lic, nw, flags, guest, prot, onb, onbDone, … (dev and e2e builds only; see hooks.ts).
import type { Channels, ClockChannel } from "./channels";
import { MOCK_HOOKS } from "./hooks";
import { RANKS, type Rank } from "./registry";

export const TICK_MS = 5000;
/** 14's rank thresholds as the server would publish them (17 header): R1 $20k … R5 $2B. */
export const RANK_THRESHOLDS = ["20000", "250000", "5000000", "100000000", "2000000000"] as const;
export const TICKS_PER_DAY = 720;

const DEFAULT_TICK = 38 * TICKS_PER_DAY + 340;

/** The unscripted mock character (what a no-flag production build always serves). */
export function defaultChannels(): Channels {
  return {
    clock: clockAt(DEFAULT_TICK),
    rank: { rank: "R2", thresholds: [...RANK_THRESHOLDS], nextAt: RANK_THRESHOLDS[RANKS.indexOf("R2")] ?? null },
    system: { connection: "live", halted: false, held: false, load: "ok", offline: false },
    me: {
      nw: "412860.15", todayPct: "+0.78", todayChg: "+3204.10", license: "LIC1", charters: [], flags: [],
      onboardingMin: 60, onboardingDone: true, myPlaces: [], guest: false, protectionEndsRealMs: null,
    },
  };
}

/** Mock channels scripted by the URL. Gated at build time (src/shell/hooks.ts): off, the overrides are compiled out. */
export function mockChannels(q: URLSearchParams): Channels {
  const d = defaultChannels();
  if (!MOCK_HOOKS) return d;
  const rankParam = q.get("rank") ?? d.rank.rank;
  const rank: Rank = (RANKS as readonly string[]).includes(rankParam) ? (rankParam as Rank) : "R2";
  const list = (k: string) => (q.get(k) ?? "").split(",").filter(Boolean);
  return {
    clock: clockAt(Number(q.get("tick") ?? DEFAULT_TICK)),
    rank: { rank, thresholds: [...RANK_THRESHOLDS], nextAt: RANK_THRESHOLDS[RANKS.indexOf(rank)] ?? null },
    system: { connection: q.get("conn") === "reconnecting" ? "reconnecting" : "live", halted: q.get("halted") === "1", held: q.get("held") === "1", load: q.get("load")?.startsWith("fail") ? "error" : "ok", offline: false },
    me: {
      nw: q.get("nw") ?? d.me.nw,
      todayPct: q.get("pct") ?? d.me.todayPct,
      todayChg: q.get("chg") ?? d.me.todayChg,
      license: q.get("lic") ?? d.me.license,
      charters: list("charters"),
      flags: list("flags"),
      onboardingMin: Number(q.get("onb") ?? d.me.onboardingMin),
      onboardingDone: q.get("onbDone") !== "0",
      myPlaces: list("places"),
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
