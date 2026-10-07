/**
 * Engine task #2: order execution and portfolio math (01 §7, Phase 0 single-player).
 *
 * Orders and accounts live inside WorldState, so a save is still plain JSON and a replay of
 * (seed, placed orders) is deterministic. Orders queue on placement and clear inside the next
 * step(), against NPC liquidity: mid ± half spread ± square-root impact.
 *
 * Phase 0 limits: long only (no shorting, no margin), fills sequential in order-id order within
 * a tick. The uniform-price batch auction between players comes with multiplayer.
 */
import { DEFAULT_TRADING } from './config';
import type {
  Account, AssetDef, Fill, FillEstimate, Order, OrderRequest, PortfolioView, PositionView,
  Side, TradingConfig, WorldState,
} from './types';

const EPS = 1e-9;

export function tradingConfig(state: WorldState): TradingConfig {
  return state.config.trading ?? DEFAULT_TRADING;
}

function assetIndex(state: WorldState, assetId: string): number {
  return state.config.assets.findIndex((a) => a.id === assetId);
}

function mid(state: WorldState, i: number): number {
  return Math.exp(state.assets[i]!.lnP);
}

/** current vol relative to calm: regime multiplier × GARCH */
function volScale(state: WorldState, i: number): number {
  return state.config.regimes[state.regime].volMult * Math.sqrt(state.assets[i]!.h);
}

/** half spread as a fraction of mid; widens with current volatility (01 §7.2) */
export function halfSpread(state: WorldState, i: number): number {
  const def = state.config.assets[i]!;
  return ((def.spreadBps ?? 10) / 2 / 1e4) * volScale(state, i);
}

/** temporary impact as a fraction of mid: Y · σ_daily · √(notional / ADV) (01 §7.3) */
export function impact(state: WorldState, i: number, notional: number): number {
  const def = state.config.assets[i]!;
  const t = tradingConfig(state);
  const sigmaDaily = (def.vol * volScale(state, i)) / Math.sqrt(state.config.daysPerYear);
  return t.impactY * sigmaDaily * Math.sqrt(Math.max(0, notional) / (def.advNotional ?? 1e9));
}

function sign(side: Side): 1 | -1 {
  return side === 'buy' ? 1 : -1;
}

function execPrice(state: WorldState, i: number, side: Side, qty: number): { price: number; imp: number } {
  const p = mid(state, i);
  const imp = impact(state, i, qty * p);
  return { price: p * (1 + sign(side) * (halfSpread(state, i) + imp)), imp };
}

export function commission(state: WorldState, def: AssetDef, notional: number): number {
  if (notional <= 0) return 0;
  const f = tradingConfig(state).fees[def.assetClass];
  return Math.max(f.min, f.rate * notional);
}

function qtyStep(def: AssetDef): number {
  return def.qtyStep ?? (def.assetClass === 'stock' ? 1 : 0);
}

function roundQty(def: AssetDef, q: number): number {
  return qtyStep(def) === 1 ? Math.floor(q + EPS) : q;
}

// ---------------------------------------------------------------- accounts

export function openAccount(state: WorldState, playerId: string, cash = tradingConfig(state).startingCash): WorldState {
  if (state.accounts[playerId]) throw new Error(`account ${playerId} already exists`);
  if (!(cash >= 0)) throw new Error('starting cash must be >= 0');
  const acct: Account = {
    playerId, cash, startingCash: cash, positions: {}, realizedPnl: 0, feesPaid: 0,
    peakEquity: cash, maxDrawdown: 0, dayStartEquity: cash,
  };
  return { ...state, accounts: { ...state.accounts, [playerId]: acct } };
}

function equityOf(state: WorldState, acct: Account): number {
  let eq = acct.cash;
  for (const [assetId, pos] of Object.entries(acct.positions)) {
    const i = assetIndex(state, assetId);
    if (i >= 0) eq += pos.qty * mid(state, i);
  }
  return eq;
}

// ---------------------------------------------------------------- orders

/** Live preview for the trade ticket: what this order would cost if it filled at the current price. */
export function estimateFill(state: WorldState, req: Pick<OrderRequest, 'assetId' | 'side' | 'qty' | 'limitPrice'>): FillEstimate {
  const i = assetIndex(state, req.assetId);
  if (i < 0) throw new Error(`unknown asset ${req.assetId}`);
  const def = state.config.assets[i]!;
  const p = mid(state, i);
  const qty = Math.max(0, req.qty);
  const price = execPrice(state, i, req.side, qty).price;
  const fee = commission(state, def, qty * price);
  return {
    price,
    fee,
    slippageBps: Math.abs(price / p - 1) * 1e4,
    total: req.side === 'buy' ? qty * price + fee : qty * price - fee,
  };
}

/** worst-case price used to reserve cash for an open buy */
function reservePrice(state: WorldState, i: number, o: OrderRequest, remaining: number): number {
  if (o.type === 'limit' && o.limitPrice) return o.limitPrice;
  const est = execPrice(state, i, 'buy', remaining).price;
  if (o.type === 'stop' && o.stopPrice) return Math.max(est, o.stopPrice * (est / mid(state, i)));
  return est;
}

function reservedCash(state: WorldState, playerId: string): number {
  let r = 0;
  for (const o of state.orders) {
    if (o.status !== 'open' || o.playerId !== playerId || o.side !== 'buy') continue;
    const i = assetIndex(state, o.assetId);
    const remaining = o.qty - o.filledQty;
    const px = reservePrice(state, i, o, remaining);
    r += remaining * px + commission(state, state.config.assets[i]!, remaining * px);
  }
  return r;
}

function reservedQty(state: WorldState, playerId: string, assetId: string): number {
  let r = 0;
  for (const o of state.orders) {
    if (o.status === 'open' && o.playerId === playerId && o.assetId === assetId && o.side === 'sell') r += o.qty - o.filledQty;
  }
  return r;
}

function validate(state: WorldState, req: OrderRequest): string | null {
  const acct = state.accounts[req.playerId];
  if (!acct) return 'no account';
  const i = assetIndex(state, req.assetId);
  if (i < 0) return 'unknown asset';
  const def = state.config.assets[i]!;
  if (req.side !== 'buy' && req.side !== 'sell') return 'bad side';
  if (!['market', 'limit', 'stop'].includes(req.type)) return 'bad order type';
  if (!Number.isFinite(req.qty) || req.qty <= 0) return 'qty must be > 0';
  if (qtyStep(def) === 1 && !Number.isInteger(req.qty)) return 'whole units only';
  if (req.type === 'limit' && !(req.limitPrice !== undefined && req.limitPrice > 0)) return 'limit price required';
  if (req.type === 'stop' && !(req.stopPrice !== undefined && req.stopPrice > 0)) return 'stop price required';
  if (req.side === 'buy') {
    const px = reservePrice(state, i, req, req.qty);
    const need = req.qty * px + commission(state, def, req.qty * px);
    if (need > acct.cash - reservedCash(state, req.playerId) + EPS) return 'insufficient cash';
  } else {
    const held = acct.positions[req.assetId]?.qty ?? 0;
    if (req.qty > held - reservedQty(state, req.playerId, req.assetId) + EPS) return 'insufficient position';
  }
  return null;
}

export function placeOrder(state: WorldState, req: OrderRequest): { state: WorldState; order: Order } {
  const seq = state.orderSeq + 1;
  const reason = validate(state, req);
  const order: Order = {
    playerId: req.playerId, assetId: req.assetId, side: req.side, type: req.type, qty: req.qty,
    ...(req.limitPrice !== undefined ? { limitPrice: req.limitPrice } : {}),
    ...(req.stopPrice !== undefined ? { stopPrice: req.stopPrice } : {}),
    tif: req.tif ?? 'gtc',
    id: `${req.playerId}-${seq}`,
    status: reason ? 'rejected' : 'open',
    placedTick: state.tick,
    triggered: false,
    filledQty: 0,
    avgFillPrice: 0,
    feesPaid: 0,
    ...(reason ? { rejectReason: reason, closedTick: state.tick } : {}),
  };
  return { state: { ...state, orderSeq: seq, orders: prune(state, [...state.orders, order]) }, order };
}

export function cancelOrder(state: WorldState, playerId: string, orderId: string): WorldState {
  const idx = state.orders.findIndex((o) => o.id === orderId);
  if (idx < 0) throw new Error(`unknown order ${orderId}`);
  const o = state.orders[idx]!;
  if (o.playerId !== playerId) throw new Error(`order ${orderId} belongs to another player`);
  if (o.status !== 'open') return state;
  const orders = state.orders.slice();
  orders[idx] = { ...o, status: 'cancelled', closedTick: state.tick };
  return { ...state, orders };
}

export function openOrders(state: WorldState, playerId: string): Order[] {
  return state.orders.filter((o) => o.playerId === playerId && o.status === 'open');
}

export function orderHistory(state: WorldState, playerId: string): Order[] {
  return state.orders.filter((o) => o.playerId === playerId);
}

function prune(state: WorldState, orders: Order[]): Order[] {
  const keep = tradingConfig(state).closedOrdersKept;
  const closed = orders.filter((o) => o.status !== 'open').length;
  if (closed <= keep) return orders;
  let drop = closed - keep;
  return orders.filter((o) => {
    if (drop > 0 && o.status !== 'open') { drop--; return false; }
    return true;
  });
}

// ---------------------------------------------------------------- clearing (called by step)

/**
 * Clear every open order against NPC liquidity at this tick's prices, then mark accounts.
 * `state` already holds the new tick's prices. Returns the new state and the fills.
 */
export function clearOrders(state: WorldState, newDay: boolean): { state: WorldState; fills: Fill[] } {
  const fills: Fill[] = [];
  const hasOpen = state.orders.some((o) => o.status === 'open');
  const accountIds = Object.keys(state.accounts);
  if (!hasOpen && accountIds.length === 0) return { state, fills };

  const t = tradingConfig(state);
  const tick = state.tick;
  const tpd = state.config.ticksPerDay;
  const s: WorldState = { ...state, orders: state.orders.slice(), assets: state.assets.slice(), accounts: { ...state.accounts } };

  if (hasOpen) {
    for (let k = 0; k < s.orders.length; k++) {
      let o = s.orders[k]!;
      if (o.status !== 'open') continue;

      if (newDay && o.tif === 'day' && Math.floor(o.placedTick / tpd) < Math.floor((tick - 1) / tpd)) {
        s.orders[k] = { ...o, status: 'expired', closedTick: tick };
        continue;
      }
      const i = assetIndex(s, o.assetId);
      const def = s.config.assets[i]!;
      if (s.assets[i]!.haltUntil !== -1) continue; // halted: wait for the reopen
      const p = mid(s, i);

      if (o.type === 'stop' && !o.triggered) {
        const hit = o.side === 'buy' ? p >= o.stopPrice! : p <= o.stopPrice!;
        if (!hit) continue;
        o = { ...o, triggered: true };
        s.orders[k] = o;
      }

      const acct0 = s.accounts[o.playerId];
      if (!acct0) { s.orders[k] = { ...o, status: 'cancelled', rejectReason: 'no account', closedTick: tick }; continue; }

      let q = o.qty - o.filledQty;
      const capUnits = (t.maxAdvPerTick * (def.advNotional ?? 1e9)) / p;
      q = roundQty(def, Math.min(q, capUnits));
      if (o.side === 'sell') q = Math.min(q, acct0.positions[o.assetId]?.qty ?? 0);
      if (q <= EPS) {
        if (o.side === 'sell') s.orders[k] = { ...o, status: 'cancelled', rejectReason: 'insufficient position', closedTick: tick };
        continue;
      }

      let { price, imp } = execPrice(s, i, o.side, q);
      if (o.type === 'limit') {
        if (o.side === 'buy' ? price > o.limitPrice! : price < o.limitPrice!) continue; // not marketable yet
      }
      let fee = commission(s, def, q * price);

      let shrunk = false;
      if (o.side === 'buy' && q * price + fee > acct0.cash + EPS) {
        shrunk = true;
        // shrink to what the cash covers (prices moved since placement)
        const f = t.fees[def.assetClass];
        q = roundQty(def, Math.max(0, (acct0.cash - f.min) / (price * (1 + f.rate))));
        if (q <= EPS) {
          s.orders[k] = { ...o, status: o.filledQty > 0 ? 'cancelled' : 'rejected', rejectReason: 'insufficient cash', closedTick: tick };
          continue;
        }
        ({ price, imp } = execPrice(s, i, o.side, q));
        fee = commission(s, def, q * price);
        if (q * price + fee > acct0.cash + EPS) {
          s.orders[k] = { ...o, status: o.filledQty > 0 ? 'cancelled' : 'rejected', rejectReason: 'insufficient cash', closedTick: tick };
          continue;
        }
      }

      // book the fill
      const acct: Account = { ...acct0, positions: { ...acct0.positions } };
      const pos0 = acct.positions[o.assetId] ?? { qty: 0, avgCost: 0, realizedPnl: 0 };
      if (o.side === 'buy') {
        const qty = pos0.qty + q;
        acct.positions[o.assetId] = { ...pos0, qty, avgCost: (pos0.qty * pos0.avgCost + q * price + fee) / qty };
        acct.cash -= q * price + fee;
      } else {
        const proceeds = q * price - fee;
        const realized = proceeds - q * pos0.avgCost;
        const qty = pos0.qty - q;
        acct.cash += proceeds;
        acct.realizedPnl += realized;
        if (qty <= EPS) delete acct.positions[o.assetId];
        else acct.positions[o.assetId] = { ...pos0, qty, realizedPnl: pos0.realizedPnl + realized };
      }
      acct.feesPaid += fee;
      s.accounts[o.playerId] = acct;

      const filledQty = o.filledQty + q;
      const done = filledQty >= o.qty - Math.max(EPS, o.qty * 1e-12);
      s.orders[k] = {
        ...o,
        filledQty,
        avgFillPrice: (o.filledQty * o.avgFillPrice + q * price) / filledQty,
        feesPaid: o.feesPaid + fee,
        // a buy shrunk to fit the cash closes now: the remainder is cancelled, not left waiting
        status: done ? 'filled' : shrunk ? 'cancelled' : 'open',
        ...(done || shrunk ? { closedTick: tick } : {}),
        ...(!done && shrunk ? { rejectReason: 'insufficient cash' } : {}),
      };
      fills.push({ orderId: o.id, playerId: o.playerId, assetId: o.assetId, side: o.side, qty: q, price, fee, tick });

      // permanent share of impact moves the price; the pull to value decays it
      const a = s.assets[i]!;
      s.assets[i] = { ...a, lnP: a.lnP + Math.log1p(sign(o.side) * t.permanentImpactShare * imp) };
    }
    s.orders = prune(s, s.orders);
  }

  // mark to market
  for (const id of accountIds) {
    const a = s.accounts[id]!;
    const eq = equityOf(s, a);
    const peak = Math.max(a.peakEquity, eq);
    const dd = peak > 0 ? eq / peak - 1 : 0;
    s.accounts[id] = {
      ...a,
      peakEquity: peak,
      maxDrawdown: Math.min(a.maxDrawdown, dd),
      dayStartEquity: newDay ? eq : a.dayStartEquity,
    };
  }
  return { state: s, fills };
}

// ---------------------------------------------------------------- portfolio view

export function portfolio(state: WorldState, playerId: string): PortfolioView {
  const acct = state.accounts[playerId];
  if (!acct) throw new Error(`no account ${playerId}`);
  const equity = equityOf(state, acct);
  const positions: PositionView[] = Object.entries(acct.positions)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([assetId, pos]) => {
      const price = mid(state, assetIndex(state, assetId));
      const marketValue = pos.qty * price;
      const cost = pos.qty * pos.avgCost;
      return {
        assetId,
        qty: pos.qty,
        avgCost: pos.avgCost,
        price,
        marketValue,
        unrealizedPnl: marketValue - cost,
        unrealizedPct: cost > 0 ? marketValue / cost - 1 : 0,
        realizedPnl: pos.realizedPnl,
        weight: equity > 0 ? marketValue / equity : 0,
      };
    });
  const unrealizedPnl = positions.reduce((x, p) => x + p.unrealizedPnl, 0);
  const peak = Math.max(acct.peakEquity, equity);
  return {
    playerId,
    cash: acct.cash,
    equity,
    startingCash: acct.startingCash,
    positions,
    realizedPnl: acct.realizedPnl,
    unrealizedPnl,
    totalPnl: equity - acct.startingCash,
    dayPnl: equity - acct.dayStartEquity,
    feesPaid: acct.feesPaid,
    peakEquity: peak,
    drawdown: peak > 0 ? equity / peak - 1 : 0,
    maxDrawdown: Math.min(acct.maxDrawdown, peak > 0 ? equity / peak - 1 : 0),
  };
}
