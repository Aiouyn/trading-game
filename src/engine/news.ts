import { DEFAULT_CATALYSTS } from './catalysts';
import type { WorldConfig } from './types';

/**
 * Priced-in bands for news (ported from engine-staging news.ts, Quant). A news move does not print all at once:
 * a jump prints `jumpImmediate` at once and the rest drifts in with the asset's half-life; an earnings report gaps
 * the price, then post-earnings drift adds `peadShare` more over `peadDays`. The Wire shows how far that drift has
 * run in four bands, never the exact share: the number would hand the player the remaining move.
 */
export type NewsBand = 'early' | 'mid' | 'late' | 'done';
export type NewsKind = 'jump' | 'earnings';

/** Share of a news move already in the price, `ageTicks` after it printed. 1 = fully priced in. */
export function newsPricedIn(cfg: WorldConfig, assetId: string, kind: NewsKind, ageTicks: number): number {
  const days = Math.max(0, ageTicks / cfg.ticksPerDay);
  if (kind === 'earnings') {
    const c = cfg.catalysts ?? DEFAULT_CATALYSTS;
    if (!(c.peadShare > 0) || !(c.peadDays > 0)) return 1;
    return (1 + c.peadShare * Math.min(1, days / c.peadDays)) / (1 + c.peadShare);
  }
  const imm = cfg.jumpImmediate ?? 1;
  if (imm >= 1) return 1;
  const half = cfg.assets.find((a) => a.id === assetId)?.halfLifeDays ?? 20;
  return Math.min(1, 1 - (1 - imm) * Math.exp((-Math.LN2 * days) / half));
}

/**
 * Band for a priced-in share. Cuts are the exact share after 1, 2 and about 4 half-lives of a normal stock
 * (0.85, 0.93, 0.98), so a fresh jump at 0.70 reads Early and a finished drift reads Done.
 */
export function bandOf(x: number): NewsBand {
  if (x >= 0.98) return 'done';
  if (x >= 0.93) return 'late';
  if (x >= 0.85) return 'mid';
  return 'early';
}

export function newsBand(cfg: WorldConfig, assetId: string, kind: NewsKind, ageTicks: number): NewsBand {
  return bandOf(newsPricedIn(cfg, assetId, kind, ageTicks));
}
