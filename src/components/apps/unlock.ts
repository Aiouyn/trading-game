// The unlock line for a locked tile or app (Stage 4): what opens it, the peak net worth it needs, and where the player
// is now. Rank keys off the peak (players.ts), so the line uses netWorthPeak and never the current net worth.
import { RANKS, rankIndex } from '@/content/lifestyle';
import { money } from '@/game/format';
import { t } from '@/i18n';

/** The fraction of the way from the player's peak to the rank threshold, in 0..100. */
export function unlockProgress(peak: number, threshold: number): number {
  if (threshold <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((peak / threshold) * 100)));
}

/** "Opens at Owner: $250,000 peak net worth, you are at $5,300". */
export function unlockLine(rankId: string, peak: number): { text: string; progress: number } {
  const need = RANKS.find((r) => r.id === rankId) ?? RANKS[0]!;
  const text = t('unlock.opensAt', { rank: t(`rank.${need.id}`), threshold: money(need.threshold), peak: money(peak) });
  return { text, progress: rankIndex(need.id) === 0 ? 100 : unlockProgress(peak, need.threshold) };
}
