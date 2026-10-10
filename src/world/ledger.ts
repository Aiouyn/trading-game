import type { Fill, Side, StepEvent } from '@/engine';
import { equityOf } from '@/engine';
import { LEDGER } from '@/content/learning';
import { findOrder, today } from './core';
import type {
  FillReason, LedgerFill, OpenTrip, PlanState, PlayerLedger, PosMirror, RoundTrip,
} from './ledger-types';
import type { GameState } from './types';

/**
 * The trade ledger (Phase 3, D-3): every fill, settlement and expiry on a human player's books, with its reason, and the
 * closed round trips they make up. The world owns it and it rides in the snapshot. Realized P&L is the engine's own
 * average-cost arithmetic (trading.ts `book`), replayed here on a mirror of each position that is reconciled to the
 * account at the end of every tick, so the ledger sums to the account's realized P&L to the cent (tested).
 */

const EPS = 1e-9;

export function emptyPlans(): PlanState {
  return { seq: 0, recurring: [], drip: [], carry: {}, blocks: [], tags: {} };
}

/** Engine average-cost booking of one stock fill on a mirror position. Same arithmetic as trading.ts `book`. */
export function bookStock(pos: PosMirror, side: Side, q: number, price: number, fee: number): { pos: PosMirror; realized: number } {
  const s = side === 'buy' ? 1 : -1;
  const Q = pos.qty;
  // effective price per unit with the fee folded in: buys pay more, sells receive less
  const e = price + (s * fee) / q;
  let realized = 0;
  let qty = Q;
  let avg = pos.avgCost;
  let rem = q;
  if (Q !== 0 && Math.sign(Q) !== s) {
    const close = Math.min(rem, Math.abs(Q));
    realized = close * (e - avg) * Math.sign(Q);
    qty = Q + s * close;
    rem -= close;
    if (Math.abs(qty) <= EPS) { qty = 0; avg = 0; }
  }
  if (rem > EPS) {
    const newQty = qty + s * rem;
    avg = (Math.abs(qty) * avg + rem * e) / Math.abs(newQty);
    qty = newQty;
  }
  return { pos: { qty, avgCost: avg }, realized };
}

function mirrorOf(src: Record<string, { qty: number; avgCost: number }>): Record<string, PosMirror> {
  const out: Record<string, PosMirror> = {};
  for (const [id, p] of Object.entries(src)) if (p.qty !== 0) out[id] = { qty: p.qty, avgCost: p.avgCost };
  return out;
}

export function ledgerOf(g: GameState, pid: string): PlayerLedger | undefined {
  return g.ledgers?.[pid];
}

/** The ledger for a human player, created on first need (join, or the first tick of an older save). Null for NPCs. */
export function ensureLedger(g: GameState, pid: string): PlayerLedger | null {
  const p = g.players[pid];
  const acct = g.market.accounts[pid];
  if (!p || p.npc || !acct) return null;
  g.ledgers ??= {};
  const have = g.ledgers[pid];
  if (have) return have;
  const d = today(g);
  const L: PlayerLedger = {
    startCash: acct.startingCash, startDay: d, seq: 0, fills: [], trips: [], open: {},
    pos: mirrorOf(acct.positions), opt: mirrorOf(acct.options ?? {}), plans: emptyPlans(), ghosts: null, days: {}, closes: [],
  };
  // the open record of the first day: the net worth and equity the player started with
  const eq = equityOf(g.market, acct);
  L.days[d - 1] = { day: d - 1, nw: p.markNetWorth ?? p.netWorth, equity: eq, qty: {}, ghosts: { basket: acct.cash, random: acct.cash, momentum: acct.cash } };
  g.ledgers[pid] = L;
  return L;
}

function pushCapped<T>(xs: T[], x: T, keep: number): void {
  xs.push(x);
  if (xs.length > keep) xs.splice(0, xs.length - keep);
}

/** Start the open trip for a key (the asset, or the option contract) and store it under that key. */
function openTrip(L: PlayerLedger, key: string, id: string, assetId: string, kind: 'stock' | 'option', side: 'long' | 'short', tick: number): OpenTrip {
  const t: OpenTrip = { id, assetId, kind, side, openedTick: tick, openQty: 0, entryNotional: 0, exitQty: 0, exitNotional: 0, realizedPnl: 0, fees: 0, fills: 0 };
  L.open[key] = t;
  return t;
}

function closeTrip(L: PlayerLedger, key: string, t: OpenTrip, tick: number, reason: FillReason): void {
  const rt: RoundTrip = {
    id: t.id, assetId: t.assetId, kind: t.kind, side: t.side, openedTick: t.openedTick, closedTick: tick, qty: t.openQty,
    avgEntry: t.openQty > 0 ? t.entryNotional / t.openQty : 0,
    avgExit: t.exitQty > 0 ? t.exitNotional / t.exitQty : 0,
    realizedPnl: t.realizedPnl, fees: t.fees, fills: t.fills, closeReason: reason,
  };
  pushCapped(L.trips, rt, LEDGER.tripsKeep);
  delete L.open[key];
}

interface TradeRec {
  key: string;
  kind: 'stock' | 'option';
  assetId: string;
  tick: number;
  side: Side;
  qty: number;
  price: number;
  fee: number;
  realized: number;
  reason: FillReason;
  orderId: string | null;
  /** signed position before this fill, and its average cost (for a trip that opened before the ledger did) */
  qtyBefore: number;
  avgBefore: number;
}

/** Books one trade: the fill row, and the round trip it belongs to (adds, reductions, closes and flips). */
function recordTrade(L: PlayerLedger, r: TradeRec): void {
  const s = r.side === 'buy' ? 1 : -1;
  const Q0 = r.qtyBefore;
  const Q1 = Q0 + s * r.qty;
  L.seq++;
  const row: LedgerFill = {
    id: `f${L.seq}`, tick: r.tick, assetId: r.assetId, kind: r.kind, side: r.side, qty: r.qty, price: r.price, fee: r.fee,
    reason: r.reason, orderId: r.orderId, realizedPnl: r.realized,
  };
  pushCapped(L.fills, row, LEDGER.fillsKeep);

  let trip = L.open[r.key];
  if (Q0 === 0 || Math.sign(Q0) === s) {
    // opening or adding to the position
    if (!trip) trip = openTrip(L, r.key, `t${L.seq}`, r.assetId, r.kind, s > 0 ? 'long' : 'short', r.tick);
    trip.openQty += r.qty;
    trip.entryNotional += r.qty * r.price;
    trip.fees += r.fee;
    trip.fills++;
    return;
  }
  // reducing, closing or flipping: the part that closes the old side is the exit
  const closeQ = Math.min(r.qty, Math.abs(Q0));
  if (!trip) {
    // the position predates the ledger: start its trip at its average cost
    trip = openTrip(L, r.key, `t${L.seq}`, r.assetId, r.kind, Q0 > 0 ? 'long' : 'short', r.tick);
    trip.openQty = Math.abs(Q0);
    trip.entryNotional = Math.abs(Q0) * r.avgBefore;
  }
  trip.exitQty += closeQ;
  trip.exitNotional += closeQ * r.price;
  trip.realizedPnl += r.realized;
  trip.fees += r.fee;
  trip.fills++;
  if (Math.abs(Q1) <= EPS) {
    closeTrip(L, r.key, trip, r.tick, r.reason);
    return;
  }
  if (Math.sign(Q1) !== Math.sign(Q0)) {
    // a flip: close the old side, open the new one with the rest of the fill
    closeTrip(L, r.key, trip, r.tick, r.reason);
    const rest = r.qty - closeQ;
    const nt = openTrip(L, r.key, `t${L.seq}b`, r.assetId, r.kind, Q1 > 0 ? 'long' : 'short', r.tick);
    nt.openQty = rest;
    nt.entryNotional = rest * r.price;
    nt.fills = 1;
    return;
  }
  L.open[r.key] = trip;
}

/** The reason a stock fill carries: a world-placed order's tag, a liquidation, a stop, or a plain order. */
export function reasonFor(g: GameState, pid: string, orderId: string, liquidated: boolean): FillReason {
  const tag = ledgerOf(g, pid)?.plans.tags[orderId];
  if (tag) return tag;
  if (liquidated) return 'liquidation';
  const o = findOrder(g, pid, orderId);
  if (o?.forced) return 'liquidation';
  if (o && (o.type === 'stop' || o.type === 'stop_limit' || o.type === 'trailing')) return 'stop';
  return 'order';
}

/** Tag a world-placed order so its fill carries the reason (recurring buy, DRIP, block slice). */
export function tagOrder(g: GameState, pid: string, orderId: string, reason: FillReason): void {
  const L = ensureLedger(g, pid);
  if (L) L.plans.tags[orderId] = reason;
}

/**
 * The stock fills and the non-trade events of one tick, in engine order: listing settlements and option expiries first
 * (the engine runs listings before the tick's clearing), then the fills. Mirrors are updated in place, then reconciled.
 */
export function ledgerTick(g: GameState, events: StepEvent[], fills: Fill[]): void {
  const mult = g.market.config.options?.multiplier ?? 100;
  const liquidated = new Set<string>();
  for (const e of events) {
    if (e.type === 'liquidation') liquidated.add(`${e.playerId}|${e.assetId}`);
    else if (e.type === 'listing' && (e.kind === 'bankruptcy' || e.kind === 'merger')) settleHolders(g, e.assetId, e.price, e.tick);
    else if (e.type === 'option_expiry') expireOption(g, e.playerId, e.contractId, e.qty, e.payout, e.tick, mult);
  }
  for (const f of fills) {
    const L = ledgerOf(g, f.playerId);
    if (!L) continue;
    const pos = L.pos[f.assetId] ?? { qty: 0, avgCost: 0 };
    const r = bookStock(pos, f.side, f.qty, f.price, f.fee);
    if (r.pos.qty === 0) delete L.pos[f.assetId]; else L.pos[f.assetId] = r.pos;
    recordTrade(L, {
      key: f.assetId, kind: 'stock', assetId: f.assetId, tick: f.tick, side: f.side, qty: f.qty, price: f.price, fee: f.fee,
      realized: r.realized, reason: reasonFor(g, f.playerId, f.orderId, liquidated.has(`${f.playerId}|${f.assetId}`)),
      orderId: f.orderId, qtyBefore: pos.qty, avgBefore: pos.avgCost,
    });
    if (L.plans.tags[f.orderId] && !isOpen(g, f.orderId)) delete L.plans.tags[f.orderId];
  }
  reconcileAll(g);
}

function isOpen(g: GameState, orderId: string): boolean {
  return g.market.orders.some((o) => o.id === orderId && o.status === 'open');
}

/** A delisting settles every holder in cash at the settlement price, with no fee (engine settleAsset). */
export function settleHolders(g: GameState, assetId: string, price: number, tick: number): void {
  for (const L of Object.values(g.ledgers ?? {})) {
    const pos = L.pos[assetId];
    if (!pos || pos.qty === 0) continue;
    const side: Side = pos.qty > 0 ? 'sell' : 'buy';
    const r = bookStock(pos, side, Math.abs(pos.qty), price, 0);
    delete L.pos[assetId];
    recordTrade(L, {
      key: assetId, kind: 'stock', assetId, tick, side, qty: Math.abs(pos.qty), price, fee: 0, realized: r.realized,
      reason: 'settlement', orderId: null, qtyBefore: pos.qty, avgBefore: pos.avgCost,
    });
  }
}

/** A listed option cash-settled at intrinsic value (engine: expiry or delisting). Realized as the engine books it. */
export function expireOption(g: GameState, pid: string, contractId: string, qty: number, payout: number, tick: number, mult: number): void {
  const L = ledgerOf(g, pid);
  if (!L) return;
  const pos = L.opt[contractId];
  if (!pos) return;
  const realized = payout - pos.avgCost * mult * qty;
  const price = qty !== 0 ? payout / (mult * qty) : 0;
  delete L.opt[contractId];
  recordTrade(L, {
    key: `opt:${contractId}`, kind: 'option', assetId: contractId, tick, side: 'sell', qty, price, fee: 0, realized,
    reason: 'option_expiry', orderId: null, qtyBefore: pos.qty, avgBefore: pos.avgCost,
  });
}

/**
 * An option trade made by a command (the engine's tradeOption already booked it). The realized amount is the engine's
 * own delta over the trade; the position mirror is then copied from the account.
 */
export function recordOptionTrade(
  g: GameState, pid: string, contractId: string, side: Side, qty: number, price: number, fee: number, realized: number, tick: number,
): void {
  const L = ensureLedger(g, pid);
  if (!L) return;
  const acct = g.market.accounts[pid];
  const pos = L.opt[contractId] ?? { qty: 0, avgCost: 0 };
  recordTrade(L, {
    key: `opt:${contractId}`, kind: 'option', assetId: contractId, tick, side, qty, price, fee, realized,
    reason: 'order', orderId: null, qtyBefore: pos.qty, avgBefore: pos.avgCost,
  });
  const now = acct?.options?.[contractId];
  if (now) L.opt[contractId] = { qty: now.qty, avgCost: now.avgCost };
  else delete L.opt[contractId];
}

/** Reconcile every human mirror to its account, so the next tick starts from exactly what the engine holds. */
export function reconcileAll(g: GameState): void {
  for (const pid of Object.keys(g.ledgers ?? {})) {
    const L = g.ledgers![pid]!;
    const acct = g.market.accounts[pid];
    if (!acct || !g.players[pid] || g.players[pid]!.npc) continue;
    L.pos = mirrorOf(acct.positions);
    L.opt = mirrorOf(acct.options ?? {});
  }
}

/** The fills and round trips for a player, newest last (the view slices them). */
export function tradesOf(g: GameState, pid: string): { fills: LedgerFill[]; trips: RoundTrip[] } {
  const L = ledgerOf(g, pid);
  return { fills: L?.fills ?? [], trips: L?.trips ?? [] };
}

/** Whether the ledger has any fill for this player (the benchmark's "no trades yet" branch). */
export function hasTrades(g: GameState, pid: string): boolean {
  return (ledgerOf(g, pid)?.fills.length ?? 0) > 0;
}

