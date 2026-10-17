/**
 * The drawing tools' geometry (R-10-5), pure: how many points each tool takes, the default shape of a position tool, the fib
 * levels, the magnet (snap to OHLC), and the moves a handle or a whole drawing makes. The React layer only draws what these
 * return, so the rules are checked here, without a chart.
 */
import type { Bar } from '@/game/history';
import type { AssetClass } from '@/engine';
import type { ChartDrawing, DrawingKind, DrawingPoint } from '@/world/drawings';
import { roundPrice } from '../chartLevels';
import { sidesValid } from './risk';

/** Fibonacci retracement levels (TradingView's set): the retracement and the two extensions. */
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618] as const;

/** A tool's points as the placement takes them: 1 click, 2 clicks, 3 clicks, or a freehand stroke (brush). */
export function pointsToPlace(kind: DrawingKind): number | 'stroke' {
  switch (kind) {
    case 'hline': case 'hray': case 'vline': case 'text': case 'long': case 'short': return 1;
    case 'channel': return 3;
    case 'brush': return 'stroke';
    default: return 2;
  }
}

/** The default candle span of a new position tool, in ticks (the target and stop handles start at its far end). */
export const POSITION_SPAN_TICKS = 60;
/** The default distances of a new position tool, as a share of its entry: the target and the stop. */
export const POSITION_TARGET_SHARE = 0.02;
export const POSITION_STOP_SHARE = 0.01;

/**
 * The points of a new position tool placed at `entry` on tick `t`: the entry, then the target and the stop at the far end of the
 * span (points[1] and points[2] share the extent's tick, which the extent handle moves).
 */
export function positionPoints(direction: 'long' | 'short', t: number, entry: number): DrawingPoint[] {
  const long = direction === 'long';
  const target = entry * (long ? 1 + POSITION_TARGET_SHARE : 1 - POSITION_TARGET_SHARE);
  const stop = entry * (long ? 1 - POSITION_STOP_SHARE : 1 + POSITION_STOP_SHARE);
  const end = t + POSITION_SPAN_TICKS;
  return [{ t, p: entry }, { t: end, p: target }, { t: end, p: stop }];
}

/** The position tool's direction, from its kind. */
export function directionOf(d: Pick<ChartDrawing, 'kind'>): 'long' | 'short' | null {
  return d.kind === 'long' ? 'long' : d.kind === 'short' ? 'short' : null;
}

/** A position tool's levels: the entry, the target, the stop, and the tick its far end sits on. */
export function positionLevels(d: Pick<ChartDrawing, 'kind' | 'points'>): { entry: number; target: number; stop: number; t0: number; t1: number } | null {
  const dir = directionOf(d);
  if (!dir || d.points.length < 3) return null;
  const [e, tp, sl] = d.points as [DrawingPoint, DrawingPoint, DrawingPoint];
  return { entry: e.p, target: tp.p, stop: sl.p, t0: e.t, t1: tp.t };
}

/** Whether a position tool's levels are on the right sides (its panel says why when they are not). */
export function positionValid(d: Pick<ChartDrawing, 'kind' | 'points'>): boolean {
  const l = positionLevels(d);
  const dir = directionOf(d);
  return !!l && !!dir && sidesValid(dir, l.entry, l.stop, l.target);
}

/**
 * A market entry uses the live mid as its placement reference, preserving the drawn distances. The actual fill happens on the
 * next auction tick and includes execution costs. Round all sent levels alike so sizing, the preview and the bracket agree.
 */
export function placementLevels(
  lv: { entry: number; target: number; stop: number },
  type: 'market' | 'limit' | 'stop',
  mid: number,
  assetClass: AssetClass = 'stock',
): { entry: number; target: number; stop: number; shift: number } {
  const shift = type === 'market' && Number.isFinite(mid) && mid > 0 ? mid - lv.entry : 0;
  const round = (p: number) => roundPrice(p, assetClass);
  return { entry: round(lv.entry + shift), target: round(lv.target + shift), stop: round(lv.stop + shift), shift };
}

/**
 * The magnet: the price snapped to the candle's open, high, low or close, whichever is nearest (magnet mode, TradingView's
 * "snap to OHLC"). With no candle at the tick, the price is kept.
 */
export function magnetPrice(bar: Bar | undefined, price: number): number {
  if (!bar) return price;
  let best = price;
  let bestGap = Infinity;
  for (const v of [bar.open, bar.high, bar.low, bar.close]) {
    const gap = Math.abs(v - price);
    if (gap < bestGap) { best = v; bestGap = gap; }
  }
  return best;
}

/** The candle a tick belongs to: the last bar that starts at or before it (bars are oldest first). */
export function barAt(bars: Bar[], t: number): Bar | undefined {
  let lo = 0;
  let hi = bars.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid]!.time <= t) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return found >= 0 ? bars[found] : undefined;
}

/** A handle a drawing shows when it is selected: which point it moves, and what it moves (the price, the tick or both). */
export interface Handle {
  index: number;
  axis: 'both' | 'price' | 'tick';
}

/** The handles of a drawing (the position tool's extent handle is the far end's tick, shared by the target and the stop). */
export function handlesOf(d: Pick<ChartDrawing, 'kind' | 'points'>): Handle[] {
  switch (d.kind) {
    case 'hline': return [{ index: 0, axis: 'price' }];
    case 'hray': return [{ index: 0, axis: 'both' }];
    case 'vline': return [{ index: 0, axis: 'tick' }];
    case 'long': case 'short': return [{ index: 0, axis: 'both' }, { index: 1, axis: 'price' }, { index: 2, axis: 'price' }];
    case 'channel': return d.points.map((_, i) => ({ index: i, axis: 'both' as const }));
    case 'text': return [{ index: 0, axis: 'both' }];
    default: return d.points.map((_, i) => ({ index: i, axis: 'both' as const }));
  }
}

/** The extent handle of a position tool: the shared tick of the target and the stop (moved as one). */
export function positionExtentIndices(kind: DrawingKind): number[] {
  return kind === 'long' || kind === 'short' ? [1, 2] : [];
}

/**
 * Moves one point of a drawing: the price, the tick, or both, by the pointer's change. The position tool's extent moves its two
 * far points together. A point never goes below tick 0 or to a non-positive price.
 */
export function movePoint(d: ChartDrawing, index: number, axis: Handle['axis'], dt: number, dp: number): DrawingPoint[] {
  const extent = positionExtentIndices(d.kind);
  return d.points.map((pt, i) => {
    const hit = i === index || (extent.includes(index) && extent.includes(i));
    if (!hit) return pt;
    const moveTick = axis !== 'price' && (i === index || extent.includes(index));
    const movePrice = axis !== 'tick' && i === index;
    const t = moveTick ? Math.max(0, Math.round(pt.t + dt)) : pt.t;
    const p = movePrice ? Math.max(1e-6, pt.p + dp) : pt.p;
    return { t, p };
  });
}

/** Moves a whole drawing by the change in tick and price (the drag of a selected shape). */
export function shiftDrawing(points: DrawingPoint[], dt: number, dp: number): DrawingPoint[] {
  return points.map((pt) => ({ t: Math.max(0, Math.round(pt.t + dt)), p: Math.max(1e-6, pt.p + dp) }));
}

/**
 * The extension of a line through two points to the plot's edges: `ray` runs from the first point through the second to the
 * right edge; `extended` runs both ways. Returns the two ends in pixels (x, y) for a plot of the given size, or null for a
 * vertical line (no slope to extend).
 */
export function extendLine(
  a: { x: number; y: number }, b: { x: number; y: number }, width: number, height: number, both: boolean,
): [{ x: number; y: number }, { x: number; y: number }] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return null;
  if (Math.abs(dx) < 1e-9) {
    // vertical: both ways run to the plot's top and bottom; a ray runs the way the second point lies
    if (both) return [{ x: a.x, y: 0 }, { x: a.x, y: height }];
    return [a, { x: a.x, y: dy > 0 ? height : 0 }];
  }
  const k = dy / dx;
  const at = (x: number) => ({ x, y: a.y + k * (x - a.x) });
  if (both) return [at(0), at(width)];
  return [a, at(dx > 0 ? width : 0)];
}

/** The fib levels a retracement from a to b draws, each as its level and price (level 0 at the first point). */
export function fibPrices(p0: number, p1: number): { level: number; price: number }[] {
  return FIB_LEVELS.map((level) => ({ level, price: p0 + (p1 - p0) * level }));
}

/** The percent change from one price to another, to two decimals (the price-range measure's label). */
export function changePct(from: number, to: number): number {
  return from > 0 ? ((to - from) / from) * 100 : 0;
}
