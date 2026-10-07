import { orderHistory, portfolio } from '@/engine';
import type { AssetClass, Order, WorldState } from '@/engine';

export type Slice = { id: AssetClass | 'cash'; label: string; value: number; weight: number };

const CLASS_LABEL: Record<AssetClass, string> = { stock: 'Stocks', crypto: 'Crypto', commodity: 'Commodities', forex: 'Forex', bond: 'Bonds', realestate: 'Property' };

/** Equity split by asset class plus cash, largest first, cash always last. Weights sum to 1 when equity > 0. */
export function allocation(w: WorldState, playerId: string): Slice[] {
  const pf = portfolio(w, playerId);
  const byClass = new Map<AssetClass, number>();
  for (const p of pf.positions) {
    const def = w.config.assets.find((a) => a.id === p.assetId);
    if (!def) continue;
    byClass.set(def.assetClass, (byClass.get(def.assetClass) ?? 0) + p.marketValue);
  }
  const total = pf.equity > 0 ? pf.equity : 1;
  const slices: Slice[] = [...byClass]
    .filter(([, v]) => v !== 0)
    .map(([id, value]) => ({ id, label: CLASS_LABEL[id], value, weight: value / total }))
    .sort((a, b) => b.value - a.value);
  slices.push({ id: 'cash', label: 'Cash', value: pf.cash, weight: pf.cash / total });
  return slices;
}

/** Closed and open orders, newest first. */
export function orderLog(w: WorldState, playerId: string, limit = 50): Order[] {
  return [...orderHistory(w, playerId)]
    .sort((a, b) => (b.closedTick ?? b.placedTick) - (a.closedTick ?? a.placedTick) || b.placedTick - a.placedTick)
    .slice(0, limit);
}

