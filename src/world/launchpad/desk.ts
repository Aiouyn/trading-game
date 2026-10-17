import type { GameState } from '../types';
import type { LpToken } from './types';
import { ensureLaunchpad } from './state';

/** Hard limit for funded wallets copying one trader's established public record. */
export const MAX_DESK_FOLLOWERS = 108;

/**
 * A public desk is closed performance, not an open bag. Followers stay at zero until the
 * record is real: at least three closes and $500 ahead. One lucky sell copies nobody.
 * At a strong record the count reaches a few dozen. A loss copies nobody.
 */
export function followerCount(realized: number, closes: number): number {
  if (closes < 3 || !(realized >= 500)) return 0;
  return Math.min(MAX_DESK_FOLLOWERS, Math.floor(12 + (realized - 500) / 60));
}

/** Closed sells. A save from before desks existed counts the tokens that already booked a result. */
export function closesOf(g: GameState, pid: string): number {
  const booked = g.launchpad?.desks?.[pid]?.closes ?? 0;
  if (booked > 0) return booked;
  let marked = 0;
  for (const t of Object.values(g.launchpad?.tokens ?? {})) if (t.realized[pid] !== undefined) marked++;
  return marked;
}

/** Closed result across every launch coin, and the followers that result earns. */
export function scoreOf(g: GameState, pid: string): { realized: number; closes: number; followers: number } {
  let realized = 0;
  for (const t of Object.values(g.launchpad?.tokens ?? {})) realized += t.realized[pid] ?? 0;
  const closes = closesOf(g, pid);
  return { realized, closes, followers: followerCount(realized, closes) };
}

/** One closed sell by a human. NPC wallets are not desks. */
export function noteClose(g: GameState, pid: string): void {
  const p = g.players[pid];
  if (!p || p.npc) return;
  const s = ensureLaunchpad(g);
  const desks = s.desks ?? (s.desks = {});
  const row = desks[pid] ?? (desks[pid] = { closes: 0 });
  row.closes += 1;
}

/**
 * Queue a copy of this fill for the next tick. The same tick is never a copy.
 * A second clip on this tick adds to the same order. Dust under $20 arms nothing.
 */
export function noteFollow(t: LpToken, tick: number, pid: string, side: 'buy' | 'sell', usd: number): void {
  if (!(usd >= 20) || !pid) return;
  const due = tick + 1;
  const cur = t.follow;
  if (cur && cur.due === due && cur.pid === pid && cur.side === side) {
    cur.usd += usd;
    return;
  }
  if (cur && cur.due > tick) return;
  t.follow = { due, side, usd, pid };
}
