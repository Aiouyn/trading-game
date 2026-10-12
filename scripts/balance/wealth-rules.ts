/**
 * Site and exit rules of the wealth bot (Phase 9 9B.4). Pure: no game state is touched here, so the rules are unit-tested
 * (`wealth-rules.test.ts`) and `wealth.ts` calls them.
 *
 * The bot is a greedy investor that prices competition. A new business in a city-sector pool earns the share the world's
 * logit share gives it (`recomputeShares` in src/world/assets.ts): every business in the pool, the bot's and the NPCs', adds
 * to the pool's mass, so a crowded pool pays each shop less. The bot scores a candidate by its income per dollar times that
 * share factor, so a second shop goes to the pool with room, not to the densest one. A checked-in owner sells a shop that
 * has lost money for two straight weeks (the valued income is trailing net, so a shop that stays under water is worth 0.6 of
 * its cost and its costs keep running).
 */
import { SHOP } from '../../src/content/shops';

/** Mass of the businesses already in a city-sector pool: how many, and the sum of e^appeal over them (every owner). */
export interface PoolMass {
  count: number;
  expAppeal: number;
}

/**
 * The share factor a new business would earn in a pool, by the world's share formula (recomputeShares): M = 3 + 0.3 x the
 * pool's count including the new business; share = e^a / (M + the pool's mass including the new business); the factor is
 * share x (M + 1), clamped to [0.35, 1.8].
 */
export function shareFactorFor(newExpAppeal: number, pool: PoolMass): number {
  const n = pool.count + 1;
  const M = 3 + 0.3 * n;
  const share = newExpAppeal / (M + pool.expAppeal + newExpAppeal);
  return Math.min(1.8, Math.max(0.35, share * (M + 1)));
}

/** Expected return per dollar of a candidate: its income per dollar of cost, times the share factor it would earn. */
export function siteScore(income: number, cost: number, newExpAppeal: number, pool: PoolMass): number {
  return (income / cost) * shareFactorFor(newExpAppeal, pool);
}

/** The appeal a new business starts with: marketing at the level the style runs (0 for none). */
export function startAppeal(marketing: number): number {
  return Math.exp(SHOP.marketing.appealPerLevel * marketing);
}

/**
 * Exit rule: a checked-in owner sells a shop whose net has been negative in total over the last `windowDays` game days
 * (the shop's `net` holds one entry per game day). A shop with less history than the window is kept.
 */
export function shouldExit(net: number[], windowDays = 14): boolean {
  if (net.length < windowDays) return false;
  let sum = 0;
  for (let k = net.length - windowDays; k < net.length; k++) sum += net[k]!;
  return sum < 0;
}
