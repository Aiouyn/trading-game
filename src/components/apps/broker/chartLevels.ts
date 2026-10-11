// The chart's lines for a position and its orders (spec 1.3): the average-cost line with its P&L, the take-profit and
// stop-loss legs, the working orders and the viewer's alerts. Pure functions only: the price and pixel helpers, the P&L
// math and the builder that turns the account into lines. The chart draws them (PriceChart, ChartLevels).
import type { Order, OrderType, Side } from '@/engine';

/** The chart's view of its price scale: a price to a pixel row and back (lightweight-charts' series does both). */
export interface PriceScale {
  priceToY(price: number): number | null;
  yToPrice(y: number): number | null;
}

/** The tick a price is typed and dragged to: cents at a dollar and up, four decimals below (as the quote shows them). */
export function roundPrice(p: number): number {
  const d = p >= 1 ? 2 : 4;
  return Math.round(p * 10 ** d) / 10 ** d;
}

/** The pixel row of a price, or null when the price is not a positive number or the scale has no row for it. */
export function yOfPrice(scale: PriceScale, price: number): number | null {
  if (!(price > 0) || !Number.isFinite(price)) return null;
  const y = scale.priceToY(price);
  return y === null || !Number.isFinite(y) ? null : y;
}

/** The price under a pixel row, rounded to the tick; null when the row is off the scale or does not give a positive price. */
export function priceOfY(scale: PriceScale, y: number): number | null {
  const p = scale.yToPrice(y);
  if (p === null || !Number.isFinite(p) || p <= 0) return null;
  return roundPrice(p);
}

/**
 * What the position would book if it closed now: closeTotal is the cash the closing order moves (a sell's proceeds net of
 * its fee, a buy-to-cover's cost with its fee), so a long books proceeds minus cost and a short the reverse. The average
 * cost already carries the entry fee (the engine's Position.avgCost), so the P&L is after fees and spread.
 */
export function pnlIfClosed(qty: number, avgCost: number, closeTotal: number): { usd: number; pct: number } {
  const size = Math.abs(qty);
  if (size === 0 || !(avgCost > 0)) return { usd: 0, pct: 0 };
  const usd = qty > 0 ? closeTotal - size * avgCost : size * avgCost - closeTotal;
  return { usd, pct: usd / (size * avgCost) };
}

/** A take-profit or stop-loss level's move from the average cost: dollars on the position and percent of the cost, signed for the side. */
export function levelMove(qty: number, avgCost: number, price: number): { usd: number; pct: number } {
  if (qty === 0 || !(avgCost > 0)) return { usd: 0, pct: 0 };
  return { usd: qty * (price - avgCost), pct: ((price - avgCost) / avgCost) * Math.sign(qty) };
}

/**
 * The side rules of a price against the mid (spec 1.3, 1.4). A stop waits for the price to cross it: a buy stop above the
 * mid, a sell stop below it. An exit leg on a position (the take-profit a limit, the stop-loss a stop) sits on the far side of
 * the price from where the position closes: a long's take-profit above the mid and its stop-loss below, mirrored for a short.
 * On the wrong side the engine fills or fires the leg at once (trading.ts: a limit fills at or past its price, a stop fires
 * at or past its price), so the refusal is the honest answer. Each returns the copy key of the refusal, or null.
 */
export function stopSideKey(side: Side, price: number, mid: number): 'stopBuy' | 'stopSell' | null {
  if (side === 'buy') return price <= mid ? 'stopBuy' : null;
  return price >= mid ? 'stopSell' : null;
}

export function exitSideKey(exitSide: Side, leg: 'tp' | 'sl', price: number, mid: number): 'tpAbove' | 'tpBelow' | 'slBelow' | 'slAbove' | null {
  if (leg === 'tp') {
    if (exitSide === 'sell') return price > mid ? null : 'tpAbove';
    return price < mid ? null : 'tpBelow';
  }
  if (exitSide === 'sell') return price < mid ? null : 'slBelow';
  return price > mid ? null : 'slAbove';
}

/**
 * The refusal of an order's price on its side of the mid: a leg (take-profit or stop-loss) by the exit rule, a stop order by
 * the stop rule, and any other order (a limit that is marketable is a warning on the ticket, not a refusal) not at all. The
 * copy key is a `broker.refuse.*` key and `price` is the mid, rounded to the tick, for the copy (the stop copy names it `mid`,
 * so both names are given).
 */
export function priceSideRefusal(o: { side: Side; type: OrderType }, leg: 'tp' | 'sl' | null, price: number, mid: number): { key: string; vars: { price: number; mid: number } } | null {
  if (!(mid > 0) || !(price > 0)) return null;
  const vars = { price: roundPrice(mid), mid: roundPrice(mid) };
  if (leg) {
    const k = exitSideKey(o.side, leg, price, mid);
    return k ? { key: `broker.refuse.${k}`, vars } : null;
  }
  if (o.type === 'stop' || o.type === 'stop_limit') {
    const k = stopSideKey(o.side, price, mid);
    return k ? { key: `broker.refuse.${k}`, vars } : null;
  }
  return null;
}

/**
 * The price a new take-profit (+TP) or stop-loss (+SL) starts at, before it is dragged: 5% up or 3% down for a long, mirrored
 * for a short. When the price has already passed that level (it would fire at once), the leg starts 1% beyond the price.
 */
export function defaultExitPrice(kind: 'tp' | 'sl', qty: number, avgCost: number, mid = 0): number {
  const long = qty > 0;
  const k = kind === 'tp' ? (long ? 1.05 : 0.95) : (long ? 0.97 : 1.03);
  const at = roundPrice(avgCost * k);
  if (priceSideRefusal({ side: long ? 'sell' : 'buy', type: kind === 'tp' ? 'limit' : 'stop' }, kind, at, mid)) {
    return roundPrice(mid * (kind === 'tp' ? (long ? 1.01 : 0.99) : (long ? 0.99 : 1.01)));
  }
  return at;
}

/** The price an order's line sits at: the limit, the stop (stop-limit draws its stop), or a trailing stop's trigger from its best price. */
export function orderPrice(o: Pick<Order, 'type' | 'side' | 'limitPrice' | 'stopPrice' | 'trailPct' | 'trailRef'>): number | null {
  if (o.type === 'limit') return o.limitPrice ?? null;
  if (o.type === 'stop' || o.type === 'stop_limit') return o.stopPrice ?? null;
  if (o.type === 'trailing' && o.trailRef !== undefined && o.trailPct !== undefined) {
    return roundPrice(o.side === 'sell' ? o.trailRef * (1 - o.trailPct) : o.trailRef * (1 + o.trailPct));
  }
  return null;
}

/**
 * Whether a working order is a leg that closes the position: a limit (take-profit) or stop (stop-loss) on the side that
 * exits it, marked reduce-only or as a bracket child. Any other order is a working order line.
 */
export function exitRole(o: Pick<Order, 'status' | 'side' | 'type' | 'reduceOnly' | 'ocoGroup'>, qty: number): 'tp' | 'sl' | null {
  if (o.status !== 'open' || qty === 0) return null;
  if (o.side !== (qty > 0 ? 'sell' : 'buy')) return null;
  if (!(o.reduceOnly || o.ocoGroup)) return null;
  if (o.type === 'limit') return 'tp';
  if (o.type === 'stop') return 'sl';
  return null;
}

export type LevelKind = 'avg' | 'tp' | 'sl' | 'order' | 'alert';

/** One line on the chart: where it sits, its pill's text and tone, and what the pill can do. */
export interface ChartLevel {
  id: string;
  kind: LevelKind;
  price: number;
  label: string;
  tone: 'gain' | 'loss' | 'brass' | 'info' | 'steel';
  dashed: boolean;
  /** the working order behind the line (a take-profit, stop-loss or working order) */
  orderId?: string;
  /** the alert behind the line */
  alertId?: string;
  /** the pill drags to a new price (committed on release) */
  draggable: boolean;
  /** the pill has an inline cancel (x) */
  cancelable: boolean;
  /** the buttons on the average line: "+ TP" and "+ SL", for the legs the position lacks */
  actions?: { key: 'addTp' | 'addSl'; label: string }[];
  /** the pill's text at another price, while the line is dragged (a leg shows its $ and % move at that price too) */
  labelAt?: (price: number) => string;
}

/** The text of each line's pill, given by the caller (the builder stays free of translation). */
export interface LevelFormat {
  avg(price: number, usd: number, pct: number): string;
  exit(kind: 'tp' | 'sl', price: number, usd: number, pct: number): string;
  order(side: Side, type: OrderType, price: number, qty: number): string;
  alert(price: number): string;
  addTp: string;
  addSl: string;
}

export interface LevelInput {
  /** the position on this asset: signed, and its average cost */
  qty: number;
  avgCost: number;
  /** the cash the closing order would move now (see pnlIfClosed); 0 when there is no price */
  closeTotal: number;
  /** this asset's open orders (any status is filtered here) */
  orders: Order[];
  /** this asset's alerts, by id */
  alerts: { id: string; price: number; dir: 'above' | 'below' }[];
  fmt: LevelFormat;
}

/**
 * The lines for one asset, in the order they are drawn: the average line (with +TP and +SL for the legs it lacks), the
 * take-profit and stop-loss legs, the working orders (a market order has no line: it fills at the next tick), then alerts.
 * A position's first take-profit and stop-loss are the lines; a second leg of the same kind is a working order's line.
 */
export function buildLevels(input: LevelInput): ChartLevel[] {
  const out: ChartLevel[] = [];
  const { qty, avgCost, fmt } = input;
  let hasTp = false;
  let hasSl = false;
  const legs: ChartLevel[] = [];
  const working: ChartLevel[] = [];
  for (const o of input.orders) {
    if (o.status !== 'open') continue;
    const role = exitRole(o, qty);
    const price = orderPrice(o);
    if (price === null || !(price > 0)) continue;
    const remaining = o.qty - o.filledQty;
    if (role === 'tp' && !hasTp) {
      hasTp = true;
      const exit = (p: number) => { const m = levelMove(qty, avgCost, p); return fmt.exit('tp', p, m.usd, m.pct); };
      legs.push({ id: `tp-${o.id}`, kind: 'tp', price, label: exit(price), labelAt: exit, tone: 'gain', dashed: false, orderId: o.id, draggable: true, cancelable: true });
      continue;
    }
    if (role === 'sl' && !hasSl) {
      hasSl = true;
      const exit = (p: number) => { const m = levelMove(qty, avgCost, p); return fmt.exit('sl', p, m.usd, m.pct); };
      legs.push({ id: `sl-${o.id}`, kind: 'sl', price, label: exit(price), labelAt: exit, tone: 'loss', dashed: false, orderId: o.id, draggable: true, cancelable: true });
      continue;
    }
    const at = (p: number) => fmt.order(o.side, o.type, p, remaining);
    working.push({
      id: `order-${o.id}`, kind: 'order', price, label: at(price), labelAt: at, tone: 'steel', dashed: true,
      orderId: o.id, draggable: o.type !== 'trailing', cancelable: true,
    });
  }
  if (qty !== 0 && avgCost > 0) {
    const pnl = pnlIfClosed(qty, avgCost, input.closeTotal);
    const actions: { key: 'addTp' | 'addSl'; label: string }[] = [];
    if (!hasTp) actions.push({ key: 'addTp', label: fmt.addTp });
    if (!hasSl) actions.push({ key: 'addSl', label: fmt.addSl });
    out.push({
      id: 'avg', kind: 'avg', price: avgCost, label: fmt.avg(avgCost, pnl.usd, pnl.pct), tone: pnl.usd >= 0 ? 'gain' : 'loss',
      dashed: true, draggable: false, cancelable: false, ...(actions.length ? { actions } : {}),
    });
  }
  out.push(...legs, ...working);
  for (const a of input.alerts) {
    out.push({
      id: `alert-${a.id}`, kind: 'alert', price: a.price, label: fmt.alert(a.price), tone: 'brass', dashed: true,
      alertId: a.id, draggable: false, cancelable: true,
    });
  }
  return out;
}

/** A price alert the viewer set from the chart. It fires when the mid crosses its price in the direction it was set. */
export interface Alert {
  id: string;
  assetId: string;
  price: number;
  dir: 'above' | 'below';
}

/** Whether an alert has fired at the mid: above the price or below it, by the direction it was set in. */
export function alertFired(a: Pick<Alert, 'price' | 'dir'>, mid: number): boolean {
  return a.dir === 'above' ? mid >= a.price : mid <= a.price;
}

/** The direction an alert set at this price fires in: a price above the mid waits for a rise, one below for a fall. */
export function alertDir(price: number, mid: number): 'above' | 'below' {
  return price > mid ? 'above' : 'below';
}
