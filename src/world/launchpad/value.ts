import type { GameState } from '../types';
import { quoteSell } from './curve';
import { lockedOf } from './vest';

/**
 * What a player's curve holdings are worth (net worth, L3 and the gate's measure): the liquidation value of each live or dead
 * token's sellable balance, the curve's net proceeds for selling it all in one fill (the curve's slippage and the 1% fee included).
 * The creator's vesting-locked tokens cannot be sold, so they count for nothing. A graduated token is an engine position and is
 * counted in the markets. Pure, and free of world imports so core.ts can use it.
 */
export function curveHoldingsValue(g: GameState, pid: string): number {
  const s = g.launchpad;
  if (!s) return 0;
  let v = 0;
  for (const t of Object.values(s.tokens)) {
    if (t.status === 'graduated') continue;
    const q = t.bal[pid];
    if (!q || q <= 0) continue;
    const sellable = q - lockedOf(t, pid, g.market.tick);
    if (sellable <= 0) continue;
    const quote = quoteSell(t.y, sellable);
    if (quote.ok) v += quote.netCents / 100;
  }
  return v;
}
