import { LP, TPD } from './constants';
import type { LpToken } from './types';

/**
 * Vesting of the creator's allocation (lead-launchpad.md L5): nothing unlocks before the cliff at 2 game days after launch,
 * then the allocation unlocks linearly to all of it at 14 game days. Locked tokens cannot be sold. The curve checks it at every
 * sell, and after graduation the engine order path checks the same figure against the creator's position (game.ts).
 */

/** The unlocked share of the allocation at a tick, from 0 to 1. */
export function vestFraction(t: LpToken, tick: number): number {
  const days = (tick - t.createdTick) / TPD;
  if (days < LP.VEST_CLIFF_DAYS) return 0;
  if (days >= LP.VEST_END_DAYS) return 1;
  return (days - LP.VEST_CLIFF_DAYS) / (LP.VEST_END_DAYS - LP.VEST_CLIFF_DAYS);
}

/** The creator's allocation still locked at a tick (before it is capped at what the creator holds). */
export function lockedAmount(t: LpToken, tick: number): number {
  if (t.creatorId === null || t.allocation <= 0) return 0;
  return Math.ceil(t.allocation * (1 - vestFraction(t, tick)));
}

/** The tokens of a curve holder that are locked at a tick: only the creator's allocation is, capped at what they hold. */
export function lockedOf(t: LpToken, pid: string, tick: number): number {
  if (t.creatorId === null || pid !== t.creatorId) return 0;
  return Math.min(lockedAmount(t, tick), t.bal[pid] ?? 0);
}

/** The game day the allocation is fully unlocked (the launch day plus the end of the schedule). */
export function vestEndDay(t: LpToken): number {
  return t.day0 + LP.VEST_END_DAYS;
}

/** The game day the cliff ends (the first day anything unlocks). */
export function vestCliffDay(t: LpToken): number {
  return t.day0 + LP.VEST_CLIFF_DAYS;
}
