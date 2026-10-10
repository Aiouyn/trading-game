import { CLOSE_FLAT_USD } from '@/content/learning';

/**
 * The direction of a closed day's net worth change (velvet-daily-close.md). The card's headline and the Copy summary both
 * read this one rule, so the two never disagree about a day that is under a dollar.
 */
export type CloseMove = 'flat' | 'up' | 'down';

export function closeMove(change: number): CloseMove {
  if (Math.abs(change) < CLOSE_FLAT_USD) return 'flat';
  return change > 0 ? 'up' : 'down';
}
