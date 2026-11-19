// Shell channels taken from a simulation view. Money strings are dollars.
import type { Channels, ClockChannel, LifeStat, MeChannel, RankChannel, SimSpeed } from "./channels";
import { defaultChannels, RANK_THRESHOLDS } from "./mockChannels";
import { RANKS, type Rank } from "./registry";
import type { ShellId } from "./types";

const RANK_DOLLARS = [20_000, 250_000, 5_000_000, 100_000_000, 2_000_000_000, 20_000_000_000];

export interface SimDate { year: number; month: number; day: number; abs: number }
export interface SimStat { id: string; label: string; word: string; hover: string; trend: -1 | 0 | 1; eventId: number }
export interface SimPause { why?: string; eventId?: number }

export interface ChannelView {
  date?: SimDate;
  live?: { label?: string; min?: number; session?: "open" | "closed" | "pre" | "after" };
  netWorth?: number;
  nwChange?: number;
  stats?: SimStat[];
  speed?: SimSpeed;
  pause?: SimPause | null;
}

export function simBootChannels(): Channels {
  const d = defaultChannels();
  return {
    ...d,
    clock: { tick: 0, gameDay: 0, tickOfDay: 0, phase: "after", sim: { year: 1, month: 1, day: 1, abs: 0, speed: "pause" } },
    rank: { rank: "R0", thresholds: [...RANK_THRESHOLDS], nextAt: RANK_THRESHOLDS[0] ?? null, shellsEarned: ["r0"] },
    me: {
      ...d.me,
      nw: "0.00",
      todayPct: "0.00",
      todayChg: "0.00",
      license: "LIC0",
      charters: [],
      flags: ["v1.businesses", "v1.property", "v1.banks"],
      onboardingMin: 0,
      onboardingDone: true,
      guest: false,
      source: "sim",
      life: [],
    },
  };
}

export function rankForCents(cents: number): { rank: Rank; nextAt: string | null } {
  const dollars = cents / 100;
  let i = 0;
  while (i < RANK_DOLLARS.length && dollars >= RANK_DOLLARS[i]) i++;
  const rank = RANKS[Math.min(i, RANKS.length - 1)] ?? "R0";
  return { rank, nextAt: i < RANK_DOLLARS.length ? String(RANK_DOLLARS[i]) : null };
}

function shellsFor(rank: Rank): ShellId[] {
  return RANKS.slice(0, RANKS.indexOf(rank) + 1).map((r) => r.toLowerCase() as ShellId);
}

function money(cents: number, signed: boolean): string {
  const n = (Math.abs(Math.round(cents)) / 100).toFixed(2);
  if (!signed) return (cents < 0 ? "-" : "") + n;
  if (cents < 0) return "-" + n;
  if (cents > 0) return "+" + n;
  return n;
}

function todayPct(change: number, now: number): string {
  const prev = now - change;
  if (!prev) return "0.00";
  const pct = (change / prev) * 100;
  const n = Math.abs(pct).toFixed(2);
  if (pct < 0) return "-" + n;
  if (pct > 0) return "+" + n;
  return n;
}

export function channelsFromView(prev: Channels, view: ChannelView): Channels {
  const cents = Math.round(view.netWorth ?? 0);
  const change = Math.round(view.nwChange ?? 0);
  const ranked = rankForCents(cents);
  const date = view.date ?? { year: 1, month: 1, day: 1, abs: 0 };
  const speed: SimSpeed = view.speed ?? "pause";
  const life: LifeStat[] = (view.stats ?? []).map((s) => ({
    id: s.id, label: s.label, word: s.word, hover: s.hover, trend: s.trend, eventId: s.eventId,
  }));
  const clock: ClockChannel = {
    tick: date.abs,
    gameDay: date.abs,
    tickOfDay: 0,
    phase: speed === "pause" ? "after" : "continuous",
    sim: {
      year: date.year,
      month: date.month,
      day: date.day,
      abs: date.abs,
      speed,
      pauseWhy: view.pause?.why,
      pauseEvent: view.pause?.eventId,
      label: view.live?.label,
      min: view.live?.min,
      session: view.live?.session,
    },
  };
  const rank: RankChannel = {
    rank: ranked.rank,
    thresholds: prev.rank.thresholds.length ? prev.rank.thresholds : [...RANK_THRESHOLDS],
    nextAt: ranked.nextAt,
    shellsEarned: shellsFor(ranked.rank),
  };
  const me: MeChannel = {
    ...prev.me,
    nw: money(cents, false),
    todayChg: money(change, true),
    todayPct: todayPct(change, cents),
    guest: false,
    source: "sim",
    life,
    onboardingDone: true,
  };
  return {
    ...prev,
    clock,
    rank,
    me,
    system: { ...prev.system, connection: "live", load: "ok", halted: false, offline: false },
  };
}
