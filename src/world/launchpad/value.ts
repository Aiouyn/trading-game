import type { GameState } from '../types';
import { spotAt } from './curve';

/**
 * What a player's curve holdings are worth (net worth, L3): each live or dead token's balance at the curve's spot price. A
 * graduated token is an engine position and is counted in the markets. Pure, and free of world imports so core.ts can use it.
 */
export function curveHoldingsValue(g: GameState, pid: string): number {
  const s = g.launchpad;
  if (!s) return 0;
  let v = 0;
  for (const t of Object.values(s.tokens)) {
    if (t.status === 'graduated') continue;
    const q = t.bal[pid];
    if (q && q > 0) v += q * spotAt(t.y);
  }
  return v;
}
