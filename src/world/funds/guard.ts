import { cancelOrder, type Side } from '@/engine';
import { priceOf } from '../core';
import { say } from '../say';
import type { GameState, StepOutput } from '../types';
import { controllerOf, fundByAccount, isFundAccount } from './state';
import { linked } from './link';
import type { FundRefusal } from './types';

/**
 * The related-party guard (ROADMAP 2.2, safeguard 3). A fund never matches against its manager's or a linked account's
 * orders, and a manager's personal order never matches the fund. Two checks keep that true for every path:
 *   - at entry: a new order is refused when an open order it would be matched with belongs to a linked controller (a personal
 *     order is checked against fund orders only; a fund order against every order);
 *   - before each engine step: a fund order that now stands opposite a linked order (an alliance changed after both were
 *     placed) is cancelled, so the step cannot match them.
 * Pending fund orders are counted by the trade caps (funds/trade.ts), because orders fill at the next step.
 */

/** The open fund orders in one asset (remaining quantity by side), and the notional of every open fund buy. */
export interface FundPending {
  byAsset: Record<string, { buy: number; sell: number }>;
  grossBuy: number;
}

/** The refusal for a new order by `ctrl` in `assetId` on `side`, if it would match a linked controller's open order, or null. */
export function crossRefusal(
  g: GameState, ctrl: string, assetId: string, side: Side, opts: { fund: boolean; self?: string },
): FundRefusal | null {
  for (const o of g.market.orders) {
    if (o.status !== 'open' || o.assetId !== assetId || o.side === side) continue;
    if (opts.self !== undefined && o.playerId === opts.self) continue;
    if (!opts.fund && !isFundAccount(o.playerId)) continue;
    if (linked(g, controllerOf(g, o.playerId), ctrl)) return 'fundSelfMatch';
  }
  return null;
}

/** The open orders of one fund account: what the next steps may fill, by asset and side. */
export function pendingOf(g: GameState, accountId: string): FundPending {
  const byAsset: Record<string, { buy: number; sell: number }> = {};
  let grossBuy = 0;
  for (const o of g.market.orders) {
    if (o.status !== 'open' || o.playerId !== accountId) continue;
    const rem = Math.max(0, o.qty - o.filledQty);
    const e = byAsset[o.assetId] ?? (byAsset[o.assetId] = { buy: 0, sell: 0 });
    if (o.side === 'buy') {
      e.buy += rem;
      grossBuy += rem * priceOf(g, o.assetId);
    } else {
      e.sell += rem;
    }
  }
  return { byAsset, grossBuy };
}

/**
 * Before an engine step: cancel every open fund order that now stands opposite a linked controller's open order, and tell the
 * manager. Runs in order, so a cancelled order no longer conflicts with the next one.
 */
export function fundsBeforeStep(g: GameState, out: StepOutput | null): void {
  if (!g.funds) return;
  const fundOrders = g.market.orders.filter((o) => o.status === 'open' && isFundAccount(o.playerId)).map((o) => o.id);
  for (const id of fundOrders) {
    const o = g.market.orders.find((x) => x.id === id);
    if (!o || o.status !== 'open') continue;
    const f = fundByAccount(g, o.playerId);
    if (!f) continue;
    if (crossRefusal(g, f.managerId, o.assetId, o.side, { fund: true, self: o.playerId }) === null) continue;
    g.market = cancelOrder(g.market, o.playerId, o.id);
    say(g, out, f.managerId, 'fund', 'warn', { key: 'funds.order.cancelledLinked', vars: { fund: f.name } });
  }
}
