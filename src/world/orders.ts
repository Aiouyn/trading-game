import { placeOrder, type OrderRequest } from '@/engine';
import { RANKS, licenseFor, rankIndex } from '@/content/lifestyle';
import { SIMPLE_MODE } from '@/content/learning';
import { cashOf, priceOf } from './core';
import { crossRefusal } from './funds/guard';
import { tagOrder } from './ledger';
import type { FillReason } from './ledger-types';
import type { CommandResult, GameState, Player } from './types';

const fail = (error: string): CommandResult => ({ ok: false, error });

/**
 * The checks an order must pass before it reaches the engine: the license class, the court hold, and simple mode's cap on
 * buys until Hustler (SIMPLE_MODE). The same gate serves a click, a keyboard order, and a plan the world places.
 */
export function orderError(g: GameState, p: Player, req: Omit<OrderRequest, 'playerId'>): string | null {
  const def = g.market.config.assets.find((a) => a.id === req.assetId);
  if (!def) return 'unknown asset';
  // a personal order may not match a fund's open order that belongs to the player or a linked account (funds/guard.ts)
  const cross = crossRefusal(g, p.id, req.assetId, req.side, { fund: false });
  if (cross) return cross;
  const lic = licenseFor(p.rankId);
  if (!lic.classes.includes(def.assetClass)) return `${def.name} needs the Pro license (Owner, $250k)`;
  if (p.heldUntil > g.market.tick && req.side === 'buy') return 'your assets are held by the court';
  if (!p.npc && req.side === 'buy' && rankIndex(p.rankId) < rankIndex(SIMPLE_MODE.untilRank)) {
    const px = priceOf(g, req.assetId);
    if (req.qty * px > cashOf(g, p.id) * SIMPLE_MODE.capFraction + 1e-6) {
      const to = RANKS.find((r) => r.id === SIMPLE_MODE.untilRank)?.name ?? SIMPLE_MODE.untilRank;
      return `Simple mode caps a buy at ${Math.round(SIMPLE_MODE.capFraction * 100)}% of cash until ${to}.`;
    }
  }
  return null;
}

/**
 * Place an order through the gate. `reason` tags a world-placed order (recurring buy, DRIP, block slice) so its fill
 * is reason-coded in the ledger; a player's own order passes null and is coded 'order' or 'stop' when it fills.
 */
export function placeChecked(
  g: GameState, p: Player, req: Omit<OrderRequest, 'playerId'>, reason: FillReason | null,
): CommandResult {
  const err = orderError(g, p, req);
  if (err) return fail(err);
  const r = placeOrder(g.market, { ...req, playerId: p.id });
  g.market = r.state;
  if (r.order.status === 'rejected') return { ok: false, error: r.order.rejectReason ?? 'rejected', data: r.order };
  if (reason) tagOrder(g, p.id, r.order.id, reason);
  return { ok: true, data: r.order };
}
