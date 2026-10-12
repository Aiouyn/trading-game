import { equityOf, grossExposure, placeOrder, type AssetDef, type Side } from '@/engine';
import { FUND_RULES } from '@/content/funds';
import { priceOf } from '../core';
import { noteOrderPlaced } from '../eca';
import { controlledQty } from '../tips';
import type { CommandResult, GameState } from '../types';
import { crossRefusal, pendingOf } from './guard';
import { mandateAt } from './rules';
import { fundById, navOf } from './state';
import type { Fund, FundFiling } from './types';

/**
 * The manager's trades. Every order passes the fund's gate before it reaches the engine: the fund is open and not in its
 * breaker, the asset is listed and in the mandate, the fund does not cross a linked account's open orders (funds/guard.ts), the
 * position stays inside its cap (20% of NAV, or 5% when the manager is an insider or holds at least 1% of the float), and
 * gross exposure stays inside the leverage limit. The caps count the fund's open orders too: an order is queued and fills at
 * the next step, so two buys placed in the same tick must both fit. The caps are worst case: every open buy fills before this
 * one, and no open sell is counted against it. Trades always go to the market (the engine's impact, fees and margin apply).
 */

const ok = (data?: unknown): CommandResult => ({ ok: true, ...(data !== undefined ? { data } : {}) });
const fail = (error: string, data?: unknown): CommandResult => ({ ok: false, error, ...(data !== undefined ? { data } : {}) });

/** The insider or float test: the manager is the asset's insider (the company module names it in `insiderId`), or holds at least 1% of its float. */
export function insiderOrFloat(g: GameState, f: Fund, assetId: string): boolean {
  const def = g.market.config.assets.find((a) => a.id === assetId) as (AssetDef & { insiderId?: string; floatShares?: number }) | undefined;
  if (!def) return false;
  if (def.insiderId !== undefined && def.insiderId === f.managerId) return true;
  const own = g.market.accounts[f.managerId]?.positions[assetId]?.qty ?? 0;
  const float = def.floatShares ?? def.sharesOutstanding;
  return own > 0 && !!float && own / float >= FUND_RULES.floatFilingPct;
}

export interface FundOrderCmd {
  fundId: string;
  assetId: string;
  side: Side;
  qty: number;
  orderType?: 'market' | 'limit';
  limitPrice?: number;
}

export function fundTrade(g: GameState, pid: string, c: FundOrderCmd): CommandResult {
  const f = fundById(g, c.fundId);
  if (!f) return fail('fundNoFund');
  if (f.managerId !== pid) return fail('fundNotManager');
  if (f.status === 'frozen') return fail('fundFrozen');
  if (f.status !== 'open') return fail('fundClosed');
  const tick = g.market.tick;
  if (tick < f.breakerUntil) return fail('fundBreaker');

  const def = g.market.config.assets.find((a) => a.id === c.assetId);
  const mandate = mandateAt(f, tick);
  if (!def || def.listed === false || def.delisted || !mandate.classes.includes(def.assetClass)) return fail('fundMandate');
  if (c.side !== 'buy' && c.side !== 'sell') return fail('fundTradeInvalid');
  if (!Number.isFinite(c.qty) || c.qty <= 0) return fail('fundTradeInvalid');
  const type = c.orderType ?? 'market';
  if (type !== 'market' && type !== 'limit') return fail('fundTradeInvalid');
  if (type === 'limit' && !(c.limitPrice !== undefined && Number.isFinite(c.limitPrice) && c.limitPrice > 0)) return fail('fundTradeInvalid');

  // related party: no opposite open order of the manager, a linked account, or a linked manager's fund in this asset
  const crossed = crossRefusal(g, pid, c.assetId, c.side, { fund: true, self: f.accountId });
  if (crossed) return fail(crossed);

  const acct = g.market.accounts[f.accountId];
  if (!acct) return fail('fundClosed');
  const held = acct.positions[c.assetId]?.qty ?? 0;
  const pend = pendingOf(g, f.accountId);
  const open = pend.byAsset[c.assetId] ?? { buy: 0, sell: 0 };
  if (c.side === 'sell') {
    if (c.qty > Math.max(0, held - open.sell) + 1e-9) return fail('fundOrderRejected', { reason: 'insufficient position' });
  }
  const px = priceOf(g, c.assetId);
  if (c.side === 'buy') {
    const insider = insiderOrFloat(g, f, c.assetId);
    const cap = insider ? FUND_RULES.insiderPositionMaxPct : mandate.maxPositionPct;
    // worst case: the open buys fill first, then this one (a fund holds long positions only)
    const worst = held + open.buy + c.qty;
    if (worst * px > cap * Math.max(0, navOf(g, f)) + 1e-6) return fail(insider ? 'fundInsiderCap' : 'fundPosition');
    const equity = equityOf(g.market, acct);
    const gross = grossExposure(g.market, acct) + pend.grossBuy + c.qty * px;
    if (gross > mandate.maxLeverage * equity + 1e-6) return fail('fundLeverage');
  }

  const posBefore = controlledQty(g, pid, c.assetId);
  const r = placeOrder(g.market, {
    playerId: f.accountId, assetId: c.assetId, side: c.side, type, qty: c.qty, tif: 'gtc',
    ...(type === 'limit' ? { limitPrice: c.limitPrice } : {}),
  });
  g.market = r.state;
  if (r.order.status === 'rejected') return fail('fundOrderRejected', { reason: r.order.rejectReason ?? 'rejected' });
  // the manager's own trade is scored like a personal one: a fund is a route to the trade, not a way around the tip rules
  noteOrderPlaced(g, pid, c.assetId, c.side, c.qty, posBefore, r.order.id);
  // the manager's own order: its fills are discretionary for the front-running check (raiseCash and wind-down sells are not)
  f.managerOrders[r.order.id] = tick;
  const kept = Object.keys(f.managerOrders);
  for (const k of kept.slice(0, Math.max(0, kept.length - FUND_RULES.managerOrdersKeep))) delete f.managerOrders[k];
  if (insiderOrFloat(g, f, c.assetId) && !f.filings.some((x) => x.assetId === c.assetId)) {
    const shares = def.sharesOutstanding ?? 0;
    const own = g.market.accounts[f.managerId]?.positions[c.assetId]?.qty ?? 0;
    const filing: FundFiling = { assetId: c.assetId, tick, pct: shares > 0 ? Math.max(0, own) / shares : 0 };
    f.filings.push(filing);
  }
  return ok({ orderId: r.order.id });
}
