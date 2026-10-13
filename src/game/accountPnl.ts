import { commission, portfolio, type WorldState } from '@/engine';

/** An asset's definition as the engine's commission reads it (the store's config.assets entry). */
type AssetDefOf = (id: string) => Parameters<typeof commission>[1] | undefined;

/**
 * The account's open P&L: each open position's unrealised P&L less the exit fee it would pay if sold now (the same figure the
 * Positions table calls "if sold"). Summed over the positions. Every account-level display of open P&L reads this one function,
 * so the top strip, the Portfolio window and each Broker's Positions line show the same number.
 */
export function accountOpenPnl(world: WorldState, playerId: string, defOf: AssetDefOf): number {
  const pf = portfolio(world, playerId);
  let sum = 0;
  for (const p of pf.positions) {
    const def = defOf(p.assetId);
    const exitFee = def ? commission(world, def, Math.abs(p.marketValue)) : 0;
    sum += p.unrealizedPnl - exitFee;
  }
  return sum;
}
