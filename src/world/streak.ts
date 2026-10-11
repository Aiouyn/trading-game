import { rankIndex } from '@/content/lifestyle';
import { TPD, credit, notify } from './core';
import type { CommandResult, GameState, Player, StepOutput, StreakState } from './types';

/**
 * The daily streak (lead-phase6.md 6D): consecutive real days, each with a login and one action, claimed by the player.
 *
 * A real day is 24 game days (one game day is one real hour), so `realDayOf(tick)` is the calendar day of the world clock.
 * Rewards are fixed and carry no chance. Cash is at most 100 x the rank index per day, and it grows with the streak only up
 * to 7 days (the day-7 amount is the daily maximum). Milestones at 3, 7, 14 and 30 days give a badge (and a title at 7 and
 * 30). One rest day a week: a single missed day keeps half the streak (rounded down, then today's claim adds one) once per
 * week; a longer gap restarts it at 1. Palette accents come with the 3, 7 and 14 day milestones (recorded on the streak; the
 * shell's picker reads them). No push nags: the only message is the claim's own line.
 *
 * Presence and actions are recorded as the player plays: `markStreakAction` runs after each successful player command
 * (game.ts), and the login is the player's last-seen tick, which the same command path updates.
 */

export const STREAK = {
  /** cash per day: 100 x the rank index at most */
  cashPerRank: 100,
  /** the growth cap in days: the cash per day stops growing here */
  capDays: 7,
  milestones: [
    { days: 3, badge: 'streak3', accent: 'phosphor' },
    { days: 7, badge: 'streak7', title: 'regular', accent: 'riviera' },
    { days: 14, badge: 'streak14', accent: 'broadsheet' },
    { days: 30, badge: 'streak30', title: 'ironclad' },
  ] as { days: number; badge: string; title?: string; accent?: string }[],
} as const;

export const REAL_DAY_TICKS = 24 * TPD;
const WEEK_DAYS = 7;

export function realDayOf(tick: number): number {
  return Math.floor(tick / REAL_DAY_TICKS);
}

export function emptyStreak(): StreakState {
  return { count: 0, lastDay: -1, restWeek: -1, actedDay: -1, badges: [], titles: [] };
}

/** Cash for a streak of this many days at this rank: linear to the cap, never above 100 x the rank index. */
export function streakCash(count: number, rankId: string): number {
  const idx = Math.max(0, rankIndex(rankId));
  const day = Math.min(count, STREAK.capDays);
  return Math.round(STREAK.cashPerRank * idx * (day / STREAK.capDays) * 100) / 100;
}

/** Records that the player acted today. Called after each successful player command (not for presence or the claim). */
export function markStreakAction(g: GameState, pid: string): void {
  const p = g.players[pid];
  if (!p || p.npc) return;
  p.streak ??= emptyStreak();
  p.streak.actedDay = realDayOf(g.market.tick);
}

/** Whether the player logged in today (the last-seen tick falls in today's real day, or they are online now). */
function loggedInToday(g: GameState, p: Player, day: number): boolean {
  return p.online || realDayOf(p.lastSeenTick) === day;
}

/** The new streak count after a claim on `day`, and whether the rest day was used. */
export function nextStreak(s: StreakState, day: number): { count: number; restUsed: boolean } {
  if (s.lastDay < 0) return { count: 1, restUsed: false };
  const gap = day - s.lastDay;
  if (gap === 1) return { count: s.count + 1, restUsed: false };
  const week = Math.floor(day / WEEK_DAYS);
  if (gap === 2 && s.restWeek !== week) return { count: Math.floor(s.count / 2) + 1, restUsed: true };
  return { count: 1, restUsed: false };
}

/** Why the claim is closed now, as a refusal code (the client turns it into copy), or null when it is open. */
export function streakClaimBlock(g: GameState, pid: string): 'noPlayer' | 'streakClaimed' | 'streakLogin' | 'streakAction' | null {
  const p = g.players[pid];
  if (!p || p.npc) return 'noPlayer';
  const day = realDayOf(g.market.tick);
  const s = p.streak ?? emptyStreak();
  if (s.lastDay === day) return 'streakClaimed';
  if (!loggedInToday(g, p, day)) return 'streakLogin';
  if (s.actedDay !== day) return 'streakAction';
  return null;
}

/** Claim today's streak: cash (booked as a faucet), and any milestone badge or title it reaches. */
export function claimStreak(g: GameState, pid: string, out: StepOutput | null = null): CommandResult {
  const block = streakClaimBlock(g, pid);
  if (block) return { ok: false, error: block };
  const p = g.players[pid]!;
  const day = realDayOf(g.market.tick);
  const s = p.streak ?? emptyStreak();
  const { count, restUsed } = nextStreak(s, day);
  const cash = streakCash(count, p.rankId);
  const newBadges: string[] = [];
  const newTitles: string[] = [];
  const newAccents: string[] = [];
  s.accents ??= [];
  for (const m of STREAK.milestones) {
    if (count < m.days) continue;
    if (!s.badges.includes(m.badge)) { s.badges.push(m.badge); newBadges.push(m.badge); }
    if ('title' in m && m.title && !s.titles.includes(m.title)) { s.titles.push(m.title); newTitles.push(m.title); }
    if ('accent' in m && m.accent && !s.accents.includes(m.accent)) { s.accents.push(m.accent); newAccents.push(m.accent); }
  }
  s.count = count;
  s.lastDay = day;
  if (restUsed) s.restWeek = Math.floor(day / WEEK_DAYS);
  p.streak = s;
  if (cash > 0) credit(g, pid, cash, 'daily streak');
  notify(g, out, pid, {
    kind: 'system', tone: 'gain',
    text: `Day ${count} of your streak: $${cash.toFixed(2)}.`,
    msg: { key: 'streak.claimed', vars: { days: count, cash: cash.toFixed(2) } },
  });
  return { ok: true, data: { count, cash, newBadges, newTitles, newAccents, restUsed } };
}

export interface StreakView {
  count: number;
  canClaim: boolean;
  /** the refusal code the claim gives, or null when the claim is open */
  block: 'noPlayer' | 'streakClaimed' | 'streakLogin' | 'streakAction' | null;
  cashToday: number;
  restAvailable: boolean;
  badges: string[];
  titles: string[];
  accents: string[];
  nextMilestone: number | null;
}

export function streakView(g: GameState, pid: string | null): StreakView | null {
  const p = pid ? g.players[pid] : undefined;
  if (!p || p.npc) return null;
  const s = p.streak ?? emptyStreak();
  const day = realDayOf(g.market.tick);
  const block = streakClaimBlock(g, p.id);
  const next = nextStreak(s, day);
  const nextM = STREAK.milestones.find((m) => m.days > s.count);
  return {
    count: s.count,
    canClaim: block === null,
    block,
    cashToday: streakCash(next.count, p.rankId),
    restAvailable: s.restWeek !== Math.floor(day / WEEK_DAYS),
    badges: [...s.badges],
    titles: [...s.titles],
    accents: [...(s.accents ?? [])],
    nextMilestone: nextM ? nextM.days : null,
  };
}
