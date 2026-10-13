/**
 * Shell context (DECISIONS C-09, C-03, P2-003). The only shell module that reads rank data.
 * It turns the earned rank into the facts the pure reducer needs: which apps are unlocked and
 * how many workspaces exist. The reducer never reads the shell look or the store.
 */

import { RANKS } from '../content/lifestyle';
import { APPS, type AppId } from './apps';
import { planLayout } from './layouts';
import type { WmCtx } from './wm';

/** Rank ids in order, from src/content/lifestyle.ts (R0 Broke ... R6 Dynasty). */
export const RANK_ORDER: readonly string[] = RANKS.map((r) => r.id);

/** Index of a rank id, or 0 for an unknown id (a hand-edited save earns the least). */
export function rankOrdinal(rank: string): number {
  const i = RANK_ORDER.indexOf(rank);
  return i < 0 ? 0 : i;
}

/** The rank gate for an app: the app's minRank must be reached. Hidden apps are not handled here. */
export function isAppUnlocked(app: AppId, rank: string): boolean {
  const need = APPS[app].minRank;
  if (need === null) return true;
  return rankOrdinal(rank) >= rankOrdinal(need);
}

/**
 * Workspace slots from the earned rank (F:60, V:79, DECISIONS C-03), in tab order: 0 Trade, 1 News, 2 Portfolio,
 * 3 Empire. R0 and R1 have Trade and News (the Wire is open to everyone), R2 adds Portfolio, R3 and up adds Empire.
 * The slots are a prefix, so every index below the count is open. The rank's look never changes this.
 */
export function workspaceCount(rank: string): number {
  const i = rankOrdinal(rank);
  if (i >= 3) return 4;
  if (i >= 2) return 3;
  return 2;
}

/**
 * Builds the reducer context for an earned rank. The built-in layout planner is wired here, so
 * wm.ts never imports layouts.ts (DECISIONS "Module purity").
 */
export function makeWmCtx(
  rank: string,
  hasPendingOrder: (ticker: string) => boolean = () => false,
): WmCtx {
  const unlocked = (app: AppId): boolean => isAppUnlocked(app, rank);
  return {
    unlocked,
    workspaces: workspaceCount(rank),
    hasPendingOrder,
    plan: (name, vp, opts) => planLayout(name, vp, unlocked, opts).placements,
    skipped: (name, vp, opts) => planLayout(name, vp, unlocked, opts).skipped,
  };
}
