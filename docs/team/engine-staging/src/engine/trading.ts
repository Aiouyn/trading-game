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
import { ecologyWeight } from './ecology';
import { isSimMode } from './sim';
import type {
  Account, AssetDef, DayTraded, Fill, TickTraded, FillEstimate, Order, OrderRequest, PortfolioView, PositionView,
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

/**
 * The PUBLIC fair value of asset i: exp(lnV), exactly what quote().fundamental shows players (quote() calls this).
 * The value-line mark cap reads only this, never the ecology's internal line (state.ecology.lnVe).
 */
export function publicValue(state: WorldState, i: number): number {
  return Math.exp(state.assets[i]!.lnV);
}

/**
 * Value-line mark cap: in full ecology and harness sim mode, peak / rank / licence marks value each position at
 * min(mid, public fair value) before the crowd exit. Off, shadow, 25% hybrid and legacy worlds never cap
 * (byte-identical to before). Displayed P&L (portfolio().equity) never caps.
 */
export function markCapOn(state: WorldState): boolean {
  return ecologyWeight(state.config) === 1 || isSimMode(state);
}

/**
 * INTERNAL (harness only, not public API, not exported from index.ts, never serialized): which value-line mark rule
 * full / sim worlds use for peak / rank / licence marks. Registered per config object in memory, like enterSimMode;
 * a config with nothing registered uses the strict cap ('A'), the shipped default.
 *  A        min(mid, publicValue)
 *  B(b)     min(mid, publicValue · (1 + b))
 *  C(thr)   on a day whose net crowd buy imbalance (shared day tally, (buy − sell) / ADV) exceeds thr, and on the
 *           next day, min(mid, anchor) with anchor = the close before the first flagged day; uncapped otherwise
 *  D(thr,b) C, plus min(·, publicValue · (1 + b)) on every mark
 *  C5(thr,K) C, plus a rolling trigger: when the net crowd buy flow over the last 5 game days (today included, / ADV)
 *           exceeds K, min(mid, anchor) with anchor = the close before that 5-day window began; held while the
 *           5-day flow stays above K, plus one day
 */
export type MarkCapVariant =
  | { kind: 'A' }
  | { kind: 'B'; band: number }
  | { kind: 'C'; thr: number }
  | { kind: 'D'; thr: number; band: number }
  | { kind: 'C5'; thr: number; K: number };
const MARK_CAP_VARIANTS = new WeakMap<object, MarkCapVariant>();
/** @internal harness only */
export function setMarkCapVariant(config: object, v: MarkCapVariant): void { MARK_CAP_VARIANTS.set(config, v); }
/** @internal */
export function markCapVariant(state: WorldState): MarkCapVariant { return MARK_CAP_VARIANTS.get(state.config) ?? { kind: 'A' }; }

/** Mark price of asset i under variant v (cap on). Reads the asset's markGuard for C / D. */
export function cappedMark(state: WorldState, i: number, v: MarkCapVariant = markCapVariant(state)): number {
  const m = mid(state, i);
  switch (v.kind) {
    case 'A': return Math.min(m, publicValue(state, i));
    case 'B': return Math.min(m, publicValue(state, i) * (1 + v.band));
    case 'C': case 'D': case 'C5': {
      let p = m;
      const g = state.assets[i]!.markGuard;
      const day = Math.floor((state.tick - 1) / state.config.ticksPerDay);
      if (g && day <= g.untilDay) p = Math.min(p, Math.exp(g.lnAnchor));
      if (v.kind === 'D') p = Math.min(p, publicValue(state, i) * (1 + v.band));
      return p;
    }
  }
}

/**
 * C / D / C5 only (writes nothing for A / B, so those states are unchanged). Guard episode: once fired, the anchor
 * is kept while the guard is live, unless a trigger whose window starts earlier fires (then the earlier anchor).
 *  1-day rule: today's net crowd buy imbalance (shared day tally) > thr × ADV: anchor = today's open (previous close).
 *  C5 rolling rule: the sum of the last 5 days' net buy flow (markFlow, today included) > K × ADV: anchor = the open
 *  of the window's first day (the close before the window began).
 * Either rule keeps the guard live through tomorrow (untilDay = today + 1), so it ends one day after the flow drops.
 * markFlow: per-asset ring of the last 5 days' net flow / ADV and their opens; written only for assets that had
 * crowd flow in the last 5 days, dropped once all 5 are zero (at most 11 numbers per asset).
 */
const FLOW_DAYS = 5;
function updateMarkGuards(s: WorldState): void {
  const v = markCapVariant(s);
  if (v.kind !== 'C' && v.kind !== 'D' && v.kind !== 'C5') return;
  const rolling = v.kind === 'C5';
  const day = Math.floor((s.tick - 1) / s.config.ticksPerDay);
  for (let i = 0; i < s.assets.length; i++) {
    let a = s.assets[i]!;
    const t = a.dayTraded;
    const adv = s.config.assets[i]!.advNotional ?? 1e9;
    const todayNet = t && t.day === day ? (t.buy - t.sell) / adv : 0;
    let sum = 0;
    let winOpen = a.lnOpen;
    if (rolling) {
      const f = a.markFlow;
      if (f || todayNet !== 0) {
        let net: number[], lnOpen: number[];
        if (!f) {
          net = new Array(FLOW_DAYS).fill(0); lnOpen = new Array(FLOW_DAYS).fill(a.lnOpen);
        } else if (f.day !== day) {
          const k = Math.min(FLOW_DAYS, day - f.day);
          net = [...f.net.slice(k), ...new Array(k).fill(0)];
          lnOpen = [...f.lnOpen.slice(k), ...new Array(k).fill(a.lnOpen)];
        } else { net = f.net; lnOpen = f.lnOpen; }
        if (net[FLOW_DAYS - 1] !== todayNet || lnOpen[FLOW_DAYS - 1] !== a.lnOpen || !f || f.day !== day) {
          if (net === f?.net) { net = net.slice(); lnOpen = lnOpen.slice(); }
          net[FLOW_DAYS - 1] = todayNet; lnOpen[FLOW_DAYS - 1] = a.lnOpen;
          if (net.every((x) => x === 0)) { const { markFlow: _drop, ...rest } = a; a = rest; }
          else a = { ...a, markFlow: { day, net, lnOpen } };
          s.assets[i] = a;
        }
        const m = a.markFlow;
        if (m) { for (const x of m.net) sum += x; winOpen = m.lnOpen[0]!; }
      }
    }
    const oneDay = todayNet > v.thr;
    const roll = rolling && sum > (v as { K: number }).K;
    if (!oneDay && !roll) continue;
    const cDay = roll ? day - (FLOW_DAYS - 1) : day;
    const cAnchor = roll ? winOpen : a.lnOpen;
    const g = a.markGuard;
    const live = g !== undefined && day <= g.untilDay;
    const keep = live && g.anchorDay <= cDay;
    const next = keep ? { lnAnchor: g.lnAnchor, anchorDay: g.anchorDay, untilDay: day + 1 } : { lnAnchor: cAnchor, anchorDay: cDay, untilDay: day + 1 };
    if (g && g.lnAnchor === next.lnAnchor && g.anchorDay === next.anchorDay && g.untilDay === next.untilDay) continue;
    s.assets[i] = { ...a, markGuard: next };
  }
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

/**
 * Long quantity the WHOLE crowd holds per asset: every account's position (players, alts, ghosts and NPC slices
 * that hold through accounts). Pure; computed once per mark pass.
 */
export function crowdLong(state: WorldState): Map<string, number> {
  const crowd = new Map<string, number>();
  for (const acct of Object.values(state.accounts)) {
    for (const [assetId, pos] of Object.entries(acct.positions)) {
      if (pos.qty > 0) crowd.set(assetId, (crowd.get(assetId) ?? 0) + pos.qty);
    }
  }
  return crowd;
}

/**
 * Cash + each position's pro-rata share of a CROWD exit: every same-side holding in that asset (all accounts) sold
 * together at the current mid, paying half spread and square-root impact on the crowd's whole quantity; the account
 * then pays its own fee. Per unit, every holder of an asset gets the same exit price, so the holdings can be split
 * across any number of accounts and the summed marks equal one account holding the total (fees aside), and an alt's
 * buy lifts the mid by its permanent share (≤ ½ of impact) but adds its full quantity to the exit: a main's mark
 * can only fall from it. With one holder this is exactly estimateFill on the whole quantity (the old mark).
 */
function liquidationOf(state: WorldState, acct: Account, crowd: Map<string, number> = crowdLong(state), cap = markCapOn(state)): number {
  let eq = acct.cash;
  for (const [assetId, pos] of Object.entries(acct.positions)) {
    const i = assetIndex(state, assetId);
    if (i < 0 || pos.qty <= 0) continue;
    const q = Math.max(pos.qty, crowd.get(assetId) ?? 0);
    let price: number;
    if (cap) {
      const p = cappedMark(state, i);
      price = p * (1 - (halfSpread(state, i) + impact(state, i, q * p)));
    } else price = execPrice(state, i, 'sell', q).price;
    eq += pos.qty * price - commission(state, state.config.assets[i]!, pos.qty * price);
  }
  return eq;
}

/**
 * Liquidation value of an account: cash plus every position marked at its share of a crowd exit (spread, square-root
 * impact on everyone's quantity in that asset, and the account's own fee out). This is the net worth used for peak
 * equity, drawdown, rank and licenses, so neither your own buys nor an alt's can lift your peak. Displayed P&L
 * stays mark-to-market (portfolio().equity).
 */
export function liquidationEquity(state: WorldState, playerId: string): number {
  const acct = state.accounts[playerId];
  if (!acct) throw new Error(`no account ${playerId}`);
  return liquidationOf(state, acct);
}

/**
 * Permanent price move of a fill, in log price. The notional ALL accounts already traded today on this asset
 * and side (AssetState.dayTraded) is `before`; the fill adds `notional`. The move is sign · log1p(f(before + notional) − f(before)) with
 * f(n) = permanentImpactShare · impact(n), so a day's clips add up to what one order of the same total would do.
 */
export function permanentMove(state: WorldState, i: number, side: Side, before: number, notional: number): number {
  const share = tradingConfig(state).permanentImpactShare;
  const f = (n: number) => share * impact(state, i, n);
  return sign(side) * Math.log1p(f(before + notional) - f(before));
}

/** The asset's shared tally for game day `today`: absent or stamped with another day = nothing traded yet. */
export function tallyToday(t: DayTraded | undefined, today: number): DayTraded {
  return t && t.day === today ? t : { day: today, buy: 0, sell: 0 };
}

/** The asset's shared tally for this tick: absent or stamped with another tick = nothing filled yet, at the current mid. */
export function tallyTick(t: TickTraded | undefined, tick: number, lnP: number): TickTraded {
  return t && t.tick === tick ? t : { tick, lnMid: lnP, buy: 0, sell: 0 };
}

/**
 * Temporary impact per unit of a fill of `x` notional when `before` notional was already filled this tick on this
 * asset and side, across all accounts: (C(before + x) − C(before)) / x with C(n) = n · impact(n). Splitting a
 * tick's total into any number of fills adds up to C(total), the cost of one order. With nothing before it is
 * exactly impact(x), so a lone order prices as it always did.
 */
export function marginalImpact(state: WorldState, i: number, before: number, x: number): number {
  if (!(before > 0)) return impact(state, i, x);
  if (!(x > 0)) return impact(state, i, before);
  return ((before + x) * impact(state, i, before + x) - before * impact(state, i, before)) / x;
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

      // shared per-tick tally: every fill this tick on this asset prices off the tick's pre-trade mid, and the
      // temporary impact and the maxAdvPerTick cap are charged on what ALL accounts already filled this tick
      const tt = tallyTick(s.assets[i]!.tickTraded, tick, s.assets[i]!.lnP);
      const p0 = Math.exp(tt.lnMid);
      const capLeft = (t.maxAdvPerTick * (def.advNotional ?? 1e9) - tt[o.side]) / p0;
      if (!(capLeft > EPS) || roundQty(def, capLeft) <= EPS) continue; // this tick's shared cap is used up: wait
      let q = o.qty - o.filledQty;
      q = roundQty(def, Math.min(q, capLeft));
      if (o.side === 'sell') q = Math.min(q, acct0.positions[o.assetId]?.qty ?? 0);
      if (q <= EPS) {
        if (o.side === 'sell') s.orders[k] = { ...o, status: 'cancelled', rejectReason: 'insufficient position', closedTick: tick };
        continue;
      }

      const tickPrice = (qq: number) => {
        const imp = marginalImpact(s, i, tt[o.side], qq * p0);
        return { price: p0 * (1 + sign(o.side) * (halfSpread(s, i) + imp)), imp };
      };
      let { price, imp } = tickPrice(q);
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
        ({ price, imp } = tickPrice(q));
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

      // permanent share of impact moves the price; the pull to value decays it. It is charged on the ASSET's
      // cumulative notional today on this side across every account (one shared tally), so splitting an order
      // into clips or across accounts doesn't multiply or dodge it. Temporary impact (execPrice) stays per order.
      // player fills print on the tape like any other trade
      const a = s.assets[i]!;
      const traded = tallyToday(a.dayTraded, Math.floor((tick - 1) / tpd));
      const notional = q * price;
      const move = permanentMove(s, i, o.side, traded[o.side], notional);
      s.assets[i] = {
        ...a,
        dayTraded: { ...traded, [o.side]: traded[o.side] + notional },
        tickTraded: { ...tt, [o.side]: tt[o.side] + q * p0 },
        lnP: a.lnP + move,
        volume: (a.volume ?? 0) + q,
        notional: (a.notional ?? 0) + q * price,
        dayVolume: (a.dayVolume ?? 0) + q,
        dayNotional: (a.dayNotional ?? 0) + q * price,
        cumVolume: (a.cumVolume ?? 0) + q,
      };
    }
    s.orders = prune(s, s.orders);
  }

  // mark: peak and drawdown on liquidation value (a share of the whole crowd's exit), never on a mid you or an alt pushed
  if (markCapOn(s)) updateMarkGuards(s);
  const crowd = crowdLong(s);
  for (const id of accountIds) {
    const a = s.accounts[id]!;
    const eq = equityOf(s, a);
    const liq = liquidationOf(s, a, crowd);
    const peak = Math.max(a.peakEquity, liq);
    const dd = peak > 0 ? liq / peak - 1 : 0;
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
  const liq = liquidationOf(state, acct);
  const peak = Math.max(acct.peakEquity, liq);
  return {
    playerId,
    cash: acct.cash,
    equity,
    startingCash: acct.startingCash,
    positions,
    realizedPnl: acct.realizedPnl,
    unrealizedPnl,
    liquidationEquity: liq,
    totalPnl: equity - acct.startingCash,
    dayPnl: equity - acct.dayStartEquity,
    feesPaid: acct.feesPaid,
    peakEquity: peak,
    drawdown: peak > 0 ? liq / peak - 1 : 0,
    maxDrawdown: Math.min(acct.maxDrawdown, peak > 0 ? liq / peak - 1 : 0),
  };
}
