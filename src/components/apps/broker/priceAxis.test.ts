import { describe, expect, it } from 'vitest';
import { SCALE_GESTURES } from './PriceChart';
import { wheelZoomRange } from './chartLevels';

describe('the Broker chart scales take the mouse as TradingView does', () => {
  it('a press and drag on either axis scales it, and a double-click on either axis resets it', () => {
    expect(SCALE_GESTURES.axisPressedMouseMove).toEqual({ time: true, price: true });
    expect(SCALE_GESTURES.axisDoubleClickReset).toEqual({ time: true, price: true });
  });
});

describe('a wheel step over the price axis zooms the price range about its middle', () => {
  const span = (r: { from: number; to: number }) => r.to - r.from;

  it('a step up zooms in and a step down zooms out, around the same middle', () => {
    const r = { from: 90, to: 110 };
    const inward = wheelZoomRange(r, -100);
    const outward = wheelZoomRange(r, 100);
    expect(span(inward)).toBeLessThan(span(r));
    expect(span(outward)).toBeGreaterThan(span(r));
    expect((inward.from + inward.to) / 2).toBeCloseTo(100, 10);
    expect((outward.from + outward.to) / 2).toBeCloseTo(100, 10);
  });

  it('a zero step leaves the range as it is', () => {
    const r = wheelZoomRange({ from: 90, to: 110 }, 0);
    expect(r.from).toBeCloseTo(90, 10);
    expect(r.to).toBeCloseTo(110, 10);
  });

  it('a large delta moves no more than one notch, so a trackpad does not jump the scale', () => {
    const one = wheelZoomRange({ from: 90, to: 110 }, 100);
    const many = wheelZoomRange({ from: 90, to: 110 }, 5000);
    expect(span(many)).toBeCloseTo(span(one), 10);
  });

  it('never closes the range to a point', () => {
    let r = { from: 90, to: 110 };
    for (let i = 0; i < 500; i++) r = wheelZoomRange(r, -100);
    expect(span(r)).toBeGreaterThan(0);
    expect((r.from + r.to) / 2).toBeCloseTo(100, 6);
  });
});
