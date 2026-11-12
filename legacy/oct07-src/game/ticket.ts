import { estimateFill, orderHistory, quote } from '@/engine';
import type { AssetDef, OrderType, Side, WorldState } from '@/engine';

/**
 * Trade ticket rules that live in the app, not the engine.
 * Simple mode (04 §2): the first trade is capped at 20% of cash. "First trade" means the
 * player has never had a fill; once anything fills, the cap is gone.
 */
export const FIRST_TRADE_CAP = 0.2;

export function hasTraded(state: WorldState, playerId: string): boolean {
  return orderHistory(state, playerId).some((o) => o.filledQty > 0);
}

/** Max buy notional (qty × est. price + fee) allowed by Simple mode, or Infinity when uncapped. */
export function firstTradeCap(state: WorldState, playerId: string): number {
  if (hasTraded(state, playerId)) return Infinity;
  const acct = state.accounts[playerId];
  return acct ? acct.cash * FIRST_TRADE_CAP : 0;
}

export function assetDef(state: WorldState, assetId: string): AssetDef {
  const def = state.config.assets.find((a) => a.id === assetId);
  if (!def) throw new Error(`unknown asset ${assetId}`);
  return def;
}

export function isWhole(def: AssetDef): boolean {
  return def.assetClass === 'stock' || def.qtyStep === 1;
}

/** Round a quantity down to what the asset allows (whole shares, or 4 decimals). */
export function roundQty(def: AssetDef, q: number): number {
  if (!Number.isFinite(q) || q <= 0) return 0;
  if (isWhole(def)) return Math.floor(q + 1e-9);
  return Math.floor(q * 1e4 + 1e-9) / 1e4;
}

/** Cash not tied up in open buy orders (approximate: engine reserves at worst-case price). */
export function buyingPower(state: WorldState, playerId: string): number {
  const acct = state.accounts[playerId];
  return acct ? acct.cash : 0;
}

/**
 * Largest quantity whose total (with fee and impact) fits a budget. Binary search on the
 * engine's own estimate so the chip never offers an order the engine would reject.
 */
export function maxQtyForBudget(state: WorldState, assetId: string, budget: number, limitPrice?: number): number {
  const def = assetDef(state, assetId);
  if (budget <= 0) return 0;
  const px = limitPrice ?? quote(state, assetId).price;
  let lo = 0;
  let hi = roundQty(def, (budget / px) * 1.05 + 1);
  const fits = (q: number) => q === 0 || totalFor(state, assetId, 'buy', q, limitPrice) <= budget + 1e-9;
  for (let k = 0; k < 40 && hi - lo > (isWhole(def) ? 1 : 1e-4); k++) {
    const m = roundQty(def, (lo + hi) / 2);
    if (m === lo) break;
    if (fits(m)) lo = m;
    else hi = m;
  }
  if (fits(hi)) lo = hi;
  return roundQty(def, lo);
}

function totalFor(state: WorldState, assetId: string, side: Side, q: number, limitPrice?: number): number {
  const est = estimateFill(state, { assetId, side, qty: q, limitPrice });
  if (limitPrice !== undefined && side === 'buy') {
    const fee = est.fee * (limitPrice / est.price);
    return q * limitPrice + fee;
  }
  return est.total;
}

export interface TicketInput {
  assetId: string;
  side: Side;
  type: OrderType;
  qty: number;
  limitPrice?: number;
  stopPrice?: number;
}

export interface TicketPreview {
  /** expected execution price per unit */
  price: number;
  notional: number;
  fee: number;
  slippage: number;
  slippageBps: number;
  total: number;
  /** cash after the order fills */
  cashAfter: number;
  /** Simple-mode cap in dollars, Infinity when lifted */
  cap: number;
  /** why the button is disabled, or null */
  block: string | null;
}

export function previewTicket(state: WorldState, playerId: string, t: TicketInput): TicketPreview {
  const def = assetDef(state, t.assetId);
  const acct = state.accounts[playerId];
  const cash = acct?.cash ?? 0;
  const q = Math.max(0, t.qty || 0);
  const mid = quote(state, t.assetId).price;
  const limit = t.type === 'limit' ? t.limitPrice : undefined;
  const est = estimateFill(state, { assetId: t.assetId, side: t.side, qty: q, limitPrice: limit });
  // a limit order fills at the limit or better, so show the worse of the two as the expected price
  const price = limit !== undefined && limit > 0 ? (t.side === 'buy' ? Math.min(limit, est.price) : Math.max(limit, est.price)) : est.price;
  const notional = q * price;
  const fee = q > 0 ? est.fee * (price / est.price || 1) : 0;
  const total = t.side === 'buy' ? notional + fee : notional - fee;
  const slippage = q * Math.abs(est.price - mid);
  const cap = t.side === 'buy' ? firstTradeCap(state, playerId) : Infinity;
  const held = acct?.positions[t.assetId]?.qty ?? 0;

  let block: string | null = null;
  if (q <= 0) block = 'Enter a quantity';
  else if (isWhole(def) && !Number.isInteger(q)) block = 'Whole shares only';
  else if (t.type === 'limit' && !(t.limitPrice && t.limitPrice > 0)) block = 'Set a limit price';
  else if (t.type === 'stop' && !(t.stopPrice && t.stopPrice > 0)) block = 'Set a stop price';
  else if (t.side === 'buy' && total > cash + 1e-9) block = 'Not enough cash';
  else if (t.side === 'buy' && total > cap + 1e-9) block = 'Over the first-trade cap';
  else if (t.side === 'sell' && q > held + 1e-9) block = held > 0 ? 'More than you hold' : 'You hold none';

  return {
    price,
    notional,
    fee,
    slippage,
    slippageBps: est.slippageBps,
    total,
    cashAfter: t.side === 'buy' ? cash - total : cash + total,
    cap,
    block,
  };
}

/** Quantity for a 10/25/50/Max chip. Buys use cash (and the first-trade cap), sells use the position. */
export function chipQty(state: WorldState, playerId: string, t: Omit<TicketInput, 'qty'>, fraction: number): number {
  const def = assetDef(state, t.assetId);
  const acct = state.accounts[playerId];
  if (!acct) return 0;
  if (t.side === 'sell') return roundQty(def, (acct.positions[t.assetId]?.qty ?? 0) * fraction);
  const budget = Math.min(acct.cash * fraction, firstTradeCap(state, playerId));
  return maxQtyForBudget(state, t.assetId, budget, t.type === 'limit' ? t.limitPrice : undefined);
}
