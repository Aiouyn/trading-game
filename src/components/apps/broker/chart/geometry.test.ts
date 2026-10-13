import { describe, expect, it } from 'vitest';
import type { Bar } from '@/game/history';
import type { ChartDrawing } from '@/world/drawings';
import {
  FIB_LEVELS, barAt, extendLine, fibPrices, handlesOf, magnetPrice, movePoint, pointsToPlace, positionLevels, positionPoints,
  positionValid, shiftDrawing,
} from './geometry';
import { floorQty, riskOf, riskPctOf, riskUsdOf, sidesValid } from './risk';

const d = (kind: ChartDrawing['kind'], points: ChartDrawing['points']): ChartDrawing => ({ id: 'x', kind, points });

describe('drawing tools', () => {
  it('a tool takes one click (lines at a price or a tick, text, a position), two (most shapes), three (a channel) or a stroke', () => {
    expect(pointsToPlace('hline')).toBe(1);
    expect(pointsToPlace('vline')).toBe(1);
    expect(pointsToPlace('long')).toBe(1);
    expect(pointsToPlace('trend')).toBe(2);
    expect(pointsToPlace('fib')).toBe(2);
    expect(pointsToPlace('channel')).toBe(3);
    expect(pointsToPlace('brush')).toBe('stroke');
  });

  it('the fib set is the retracement levels and the two extensions', () => {
    expect(FIB_LEVELS).toEqual([0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618]);
    const f = fibPrices(100, 110);
    expect(f[0]).toEqual({ level: 0, price: 100 });
    expect(f[4]!.price).toBeCloseTo(106.18, 10);
    expect(f.at(-1)!.price).toBeCloseTo(116.18, 10);
  });

  it('a new position tool has its entry at the click, the target above (long) and the stop below, sharing a far end tick', () => {
    const pts = positionPoints('long', 100, 50);
    const lvl = positionLevels({ kind: 'long', points: pts });
    expect(lvl).toEqual({ entry: 50, target: 51, stop: 49.5, t0: 100, t1: 160 });
    expect(positionValid({ kind: 'long', points: pts })).toBe(true);
    const sh = positionPoints('short', 100, 50);
    expect(positionValid({ kind: 'short', points: sh })).toBe(true);
    expect(sh[1]!.p).toBeLessThan(50);
    expect(sh[2]!.p).toBeGreaterThan(50);
  });

  it('dragging the entry or the target moves that point; the extent handle moves the far end for both legs', () => {
    const base = d('long', positionPoints('long', 100, 50));
    const tpMoved = movePoint(base, 1, 'price', 0, 0.5);
    expect(tpMoved[1]!.p).toBeCloseTo(51.5, 10);
    expect(tpMoved[2]!.p).toBeCloseTo(49.5, 10);
    const extent = movePoint(base, 1, 'tick', 20, 0);
    expect(extent[1]!.t).toBe(180);
    expect(extent[2]!.t).toBe(180);
    expect(extent[0]!.t).toBe(100);
    const entry = movePoint(base, 0, 'both', -10, 0);
    expect(entry[0]).toEqual({ t: 90, p: 50 });
    expect(entry[1]).toEqual(base.points[1]);
  });

  it('a whole drawing shifts by the same change, and a point never goes below tick 0 or a non-positive price', () => {
    const s = shiftDrawing([{ t: 5, p: 10 }, { t: 9, p: 12 }], -20, -100);
    expect(s[0]!.t).toBe(0);
    expect(s[0]!.p).toBeGreaterThan(0);
    expect(s[1]!.t).toBe(0);
  });

  it('a horizontal line has one price handle; a position tool has three (entry, target, stop)', () => {
    expect(handlesOf(d('hline', [{ t: 1, p: 1 }]))).toEqual([{ index: 0, axis: 'price' }]);
    expect(handlesOf(d('long', positionPoints('long', 1, 10)))).toHaveLength(3);
  });

  it('a ray runs from its first point through the second to the right edge; an extended line runs to both edges', () => {
    const a = { x: 100, y: 100 };
    const b = { x: 200, y: 50 };
    const ray = extendLine(a, b, 1000, 500, false)!;
    expect(ray[0]).toEqual(a);
    expect(ray[1].x).toBe(1000);
    expect(ray[1].y).toBeCloseTo(100 - 50 * (900 / 100), 6);
    const ext = extendLine(a, b, 1000, 500, true)!;
    expect(ext[0].x).toBe(0);
    expect(ext[1].x).toBe(1000);
    // a ray pointing left runs to the left edge
    const left = extendLine(a, { x: 50, y: 100 }, 1000, 500, false)!;
    expect(left[1].x).toBe(0);
    expect(extendLine(a, a, 1000, 500, true)).toBeNull();
    // a vertical line runs top to bottom
    const v = extendLine({ x: 300, y: 10 }, { x: 300, y: 80 }, 1000, 500, true)!;
    expect(v).toEqual([{ x: 300, y: 0 }, { x: 300, y: 500 }]);
  });
});

describe('magnet and candle lookup', () => {
  const bar: Bar = { time: 10, open: 100, high: 104, low: 97, close: 101 };

  it('snaps to the nearest open, high, low or close of the candle at the tick', () => {
    expect(magnetPrice(bar, 103.2)).toBe(104);
    expect(magnetPrice(bar, 97.9)).toBe(97);
    expect(magnetPrice(bar, 100.4)).toBe(100);
    expect(magnetPrice(bar, 101.2)).toBe(101);
    expect(magnetPrice(undefined, 100.4)).toBe(100.4);
  });

  it('finds the candle a tick falls in (the last one that starts at or before it)', () => {
    const bars: Bar[] = [{ ...bar, time: 10 }, { ...bar, time: 20 }, { ...bar, time: 30 }];
    expect(barAt(bars, 25)!.time).toBe(20);
    expect(barAt(bars, 30)!.time).toBe(30);
    expect(barAt(bars, 5)).toBeUndefined();
  });
});

describe('the position tool arithmetic', () => {
  it('the quantity is the risk over the stop distance, rounded down to the step', () => {
    // a $1,000 risk, a $2 stop distance: 500 units
    const r = riskOf({ direction: 'long', entry: 50, stop: 48, target: 54, equity: 100_000, riskUsd: 1000, spreadBps: 0, feePerLeg: 0 });
    expect(r.qty).toBe(500);
    expect(r.riskUsd).toBe(1000);
    expect(r.riskPct).toBeCloseTo(1, 10);
    expect(r.rr).toBeCloseTo(2, 10);
    expect(r.netAtTarget).toBeCloseTo(2000, 6);
    expect(r.netAtStop).toBeCloseTo(-1000, 6);
    // a risk that does not divide evenly rounds the quantity down, so the risk never exceeds the one accepted
    const odd = riskOf({ direction: 'long', entry: 50, stop: 47, target: 53, equity: 100_000, riskUsd: 1000, spreadBps: 0, feePerLeg: 0 });
    expect(odd.qty).toBe(333.3333);
    expect(odd.riskUsd).toBeLessThanOrEqual(1000);
  });

  it('a short is the mirror: a stop above and a target below, the same risk', () => {
    const r = riskOf({ direction: 'short', entry: 50, stop: 52, target: 46, equity: 100_000, riskUsd: 400, spreadBps: 0, feePerLeg: 0 });
    expect(r.qty).toBe(200);
    expect(r.netAtTarget).toBeCloseTo(800, 6);
    expect(r.netAtStop).toBeCloseTo(-400, 6);
  });

  it('spread and fees come off both outcomes: each leg crosses half the spread, and both legs pay the fee', () => {
    // 100 units, 100 bps spread: half of 1% per leg; the round trip pays the entry and exit half-spreads
    const r = riskOf({ direction: 'long', entry: 100, stop: 99, target: 102, equity: 50_000, riskUsd: 100, spreadBps: 100, feePerLeg: 5 });
    expect(r.qty).toBe(100);
    const spreadAtTarget = 100 * (100 * 0.005 + 102 * 0.005);
    expect(r.spreadCost).toBeCloseTo(spreadAtTarget, 6);
    expect(r.fees).toBe(10);
    expect(r.netAtTarget).toBeCloseTo(200 - spreadAtTarget - 10, 6);
  });

  it('an invalid set of levels (stop on the wrong side) sizes to nothing and is not valid', () => {
    const r = riskOf({ direction: 'long', entry: 50, stop: 55, target: 60, equity: 1, riskUsd: 100, spreadBps: 0, feePerLeg: 0 });
    expect(r.valid).toBe(false);
    expect(r.qty).toBe(0);
    expect(sidesValid('short', 50, 45, 40)).toBe(false);
  });

  it('dollars and percent of equity sync both ways', () => {
    expect(riskUsdOf(2, 50_000)).toBe(1000);
    expect(riskPctOf(1000, 50_000)).toBe(2);
    expect(riskPctOf(10, 0)).toBe(0);
  });

  it('a quantity rounds down to the step and never goes negative', () => {
    expect(floorQty(1.23456)).toBe(1.2345);
    expect(floorQty(-3)).toBe(0);
    expect(floorQty(Number.NaN)).toBe(0);
  });
});
