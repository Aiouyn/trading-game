import { placeOrder, type Order, type OrderRequest, type Position } from '@/engine';
import { licenseFor, rankIndex } from '@/content/lifestyle';
import { SIMPLE_MODE } from '@/content/learning';
import { cashOf, priceOf } from './core';
import { crossRefusal } from './funds/guard';
import { tagOrder } from './ledger';
import type { FillReason } from './ledger-types';
import type { CommandResult, GameState, Player } from './types';

const fail = (error: string): CommandResult => ({ ok: false, error });

/**
 * The notional a set of open orders already commits to open, at `px(asset)` (simple mode's aggregate cap). An open buy
 * commits its remaining shares. An open sell commits only the shares past what the account holds: that part is a short.
 * Reduce-only orders close a position and commit nothing. Pure: the world uses it, and so does the ticket's mirror.
 */
export function openingNotionalOf(orders: Order[], positions: Record<string, Position>, px: (assetId: string) => number): number {
  const buys = new Map<string, number>();
  const sells = new Map<string, number>();
  for (const o of orders) {
    if (o.status !== 'open' || o.reduceOnly) continue;
    const rem = o.qty - o.filledQty;
    const m = o.side === 'buy' ? buys : sells;
    m.set(o.assetId, (m.get(o.assetId) ?? 0) + rem);
  }
  let total = 0;
  for (const [assetId, q] of buys) total += q * px(assetId);
  for (const [assetId, q] of sells) total += Math.max(0, q - Math.max(0, positions[assetId]?.qty ?? 0)) * px(assetId);
  return total;
}

/**
 * The cash simple mode's cap is a share of: cash less what the open shorts owe back (their entry value). A short's proceeds
 * sit in cash until it is covered, so without this a short would raise the cap it is measured against. Pure: the ticket's mirror uses it.
 */
export function capBaseOf(cash: number, positions: Record<string, Position>): number {
  let owed = 0;
  for (const pos of Object.values(positions)) if (pos.qty < 0) owed += -pos.qty * pos.avgCost;
  return Math.max(0, cash - owed);
}

/** The same for one player in the world: their open orders at the live price. */
export function openOpeningNotional(g: GameState, playerId: string): number {
  const acct = g.market.accounts[playerId];
  const mine = g.market.orders.filter((o) => o.playerId === playerId);
  return openingNotionalOf(mine, acct?.positions ?? {}, (assetId) => priceOf(g, assetId));
}

/**
 * The checks an order must pass before it reaches the engine: the license class, the court hold, and simple mode's cap on the
 * first trade (SIMPLE_MODE), until Hustler. The cap is aggregate: the new order's opening notional (a buy, or a sell past the
 * shares held, which is a short) plus what the open orders already commit must stay within the cap share of cash (capBaseOf),
 * so three orders in one tick cannot pass it. The first fill lifts it, so later size is the license's buying power. Sells of
 * held shares are never capped. The same gate serves a click, a keyboard order, and a plan the world places.
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
  if (!p.npc && !req.reduceOnly && p.stats.trades === 0 && rankIndex(p.rankId) < rankIndex(SIMPLE_MODE.untilRank)) {
    const px = priceOf(g, req.assetId);
    const held = Math.max(0, g.market.accounts[p.id]?.positions[req.assetId]?.qty ?? 0);
    const opening = req.side === 'buy' ? req.qty : Math.max(0, req.qty - held);
    const cap = capBaseOf(cashOf(g, p.id), g.market.accounts[p.id]?.positions ?? {}) * SIMPLE_MODE.capFraction + 1e-6;
    if (opening > 0 && openOpeningNotional(g, p.id) + opening * px > cap) {
      return `Your first trade is capped at ${Math.round(SIMPLE_MODE.capFraction * 100)}% of cash.`;
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
