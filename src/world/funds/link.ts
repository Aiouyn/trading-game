import { isLinkedAccount } from '../collusion';
import type { GameState } from '../types';

/**
 * Two accounts are linked when they are the same player or in one collusion owner group (collusion.ts isLinkedAccount: an alliance,
 * a shared device, two funding links, or mirrored fills). The investor and self-match checks use the same graph as the company,
 * Launchpad and tip rules. Before the 9B fix this was the alliance alone, so a device- or gift-linked alt could deposit into the
 * manager's fund. This lives in its own module: core.ts imports funds/state.ts, and state.ts must not import collusion.ts (which
 * imports core.ts), or MIRROR_PRUNE_TICKS reads an undefined TPD.
 */
export function linked(g: GameState, a: string, b: string): boolean {
  return isLinkedAccount(g, a, b);
}
