// The Broker's order depth read (engine depthByPool) as a pure selector, so the rule is tested without React.
import { depthByPool, ecologyLog, type DepthByPool, type WorldState } from '@/engine';

/**
 * The newest closed day whose log row holds this asset, read through depthByPool. A listing that postdates the
 * last close has no row yet, and an asset with no ecology has no log at all: both give null, never a throw (the
 * engine throws for a day or asset the log does not hold, so the row is found first).
 */
export function latestDepth(world: WorldState, assetId: string): DepthByPool | null {
  const idx = world.config.assets.findIndex((a) => a.id === assetId);
  if (idx < 0) return null;
  const log = ecologyLog(world);
  for (let k = log.length - 1; k >= 0; k--) {
    const row = log[k]!;
    if (row.assets[idx] !== undefined) return depthByPool(world, assetId, row.day);
  }
  return null;
}
