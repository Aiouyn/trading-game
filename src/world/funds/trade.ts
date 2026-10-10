import { equityOf, grossExposure, placeOrder, type AssetDef, type Side } from '@/engine';
import { FUND_RULES } from '@/content/funds';
import { priceOf } from '../core';
import type { CommandResult, GameState } from '../types';
import { mandateAt } from './rules';
import { fundById, linked, navOf } from './state';
import type { Fund, FundFiling } from './types';

/**
 * The manager's trades. Every order passes the fund's gate before it reaches the engine: the fund is open and not in its
 * breaker, the asset is listed and in the mandate, the fund does not cross the manager's or a linked account's open orders,
 * the position stays inside its cap (20% of NAV, or 5% when the manager is an insider or holds at least 1% of the float), and
 * gross exposure stays inside the leverage limit. Trades always go to the market (the engine's impact, fees and margin apply).
 */

const ok = (data?: unknown): CommandResult => ({ ok: true, ...(data !== undefined ? { data } : {}) });
const fail = (error: string, data?: unknown): CommandResult => ({ ok: false, error, ...(data !== undefined ? { data } : {}) });

/** An asset the manager is an insider of (the company module names the insider in `insiderId`), or holds at least 1% of the float of. */
export function insiderOrFloat(g: GameState, f: Fund, assetId: string): boolean {
  const def = g.market.config.assets.find((a) => a.id === assetId) as (AssetDef & { insiderId?: string }) | undefined;
  if (!def) return false;
  if (def.insiderId !== undefined && def.insiderId === f.managerId) return true;
  const own = g.market.accounts[f.managerId]?.positions[assetId]?.qty ?? 0;
  return own > 0 && !!def.sharesOutstanding && own / def.sharesOutstanding >= FUND_RULES.floatFilingPct;
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

  // the fund does not match against the manager or a linked account: no opposite open order of theirs in this asset
  const crossed = g.market.orders.some((o) => o.status === 'open' && o.assetId === c.assetId && o.side !== c.side && o.playerId !== f.accountId && linked(g, o.playerId, pid));
  if (crossed) return fail('fundSelfMatch');

  const acct = g.market.accounts[f.accountId];
  if (!acct) return fail('fundClosed');
  const held = acct.positions[c.assetId]?.qty ?? 0;
  if (c.side === 'sell' && c.qty > Math.max(0, held) + 1e-9) return fail('fundOrderRejected', { reason: 'insufficient position' });
  const signed = c.side === 'buy' ? c.qty : -c.qty;
  const after = held + signed;
  const px = priceOf(g, c.assetId);
  const insider = insiderOrFloat(g, f, c.assetId);
  if (Math.abs(after) > Math.abs(held) + 1e-9) {
    const cap = insider ? FUND_RULES.insiderPositionMaxPct : mandate.maxPositionPct;
    if (Math.abs(after) * px > cap * Math.max(0, navOf(g, f)) + 1e-6) return fail(insider ? 'fundInsiderCap' : 'fundPosition');
    const equity = equityOf(g.market, acct);
    const grossAfter = grossExposure(g.market, acct) + (Math.abs(after) - Math.abs(held)) * px;
    if (grossAfter > mandate.maxLeverage * equity + 1e-6) return fail('fundLeverage');
  }

  const r = placeOrder(g.market, {
    playerId: f.accountId, assetId: c.assetId, side: c.side, type, qty: c.qty, tif: 'gtc',
    ...(type === 'limit' ? { limitPrice: c.limitPrice } : {}),
  });
  g.market = r.state;
  if (r.order.status === 'rejected') return fail('fundOrderRejected', { reason: r.order.rejectReason ?? 'rejected' });
  if (insider && !f.filings.some((x) => x.assetId === c.assetId)) {
    const shares = def.sharesOutstanding ?? 0;
    const own = g.market.accounts[f.managerId]?.positions[c.assetId]?.qty ?? 0;
    const filing: FundFiling = { assetId: c.assetId, tick, pct: shares > 0 ? Math.max(0, own) / shares : 0 };
    f.filings.push(filing);
  }
  return ok({ orderId: r.order.id });
}
