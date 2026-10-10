import { describe, expect, it } from 'vitest';
import { resizeRect, sharedEdges, snapFits, snapTargetAt, targetRect } from './windowMath';

const wa = { w: 1440, h: 900 };
const min = { minW: 420, minH: 300 };

describe('snap targets from the pointer', () => {
  it('picks halves from the side edges, quarters from corners, fill from the top', () => {
    expect(snapTargetAt(5, 500, 1000, 800)).toBe('L2');
    expect(snapTargetAt(995, 500, 1000, 800)).toBe('R2');
    expect(snapTargetAt(500, 3, 1000, 800)).toBe('fill');
    expect(snapTargetAt(3, 3, 1000, 800)).toBe('TL');
    expect(snapTargetAt(996, 796, 1000, 800)).toBe('BR');
    expect(snapTargetAt(500, 400, 1000, 800)).toBeNull();
  });

  it('covers the half of the work area that the slot names', () => {
    const r = targetRect('L2', { w: 1000, h: 800 }, 8);
    expect(r.x).toBe(8);
    expect(r.w).toBeLessThan(500);
  });
});

describe('resize from an edge', () => {
  const r0 = { x: 100, y: 100, w: 500, h: 400 };

  it('grows the east edge and keeps the rest', () => {
    expect(resizeRect(r0, 'e', 50, 0, min, wa)).toEqual({ x: 100, y: 100, w: 550, h: 400 });
  });

  it('holds the minimum size on the west edge and moves the origin to keep the east edge', () => {
    const r = resizeRect(r0, 'w', 300, 0, min, wa);
    expect(r.w).toBe(min.minW);
    expect(r.x + r.w).toBe(r0.x + r0.w);
  });

  it('stays inside the work area', () => {
    const r = resizeRect(r0, 'e', 5000, 0, min, wa);
    expect(r.x + r.w).toBeLessThanOrEqual(wa.w);
  });
});

describe('snaps by layout mode and fit (C-26, P2-031)', () => {
  const wa = { w: 1200, h: 814 };
  const broker = { minW: 480, minH: 420 };

  it('halves mode snaps to the sides and the top only, never to a corner', () => {
    expect(snapTargetAt(3, 3, 1100, 700, 'halves')).toBe('L2');
    expect(snapTargetAt(1097, 300, 1100, 700, 'halves')).toBe('R2');
    expect(snapTargetAt(500, 3, 1100, 700, 'halves')).toBe('fill');
    expect(snapTargetAt(3, 697, 1100, 700, 'halves')).toBe('L2');
    expect(snapTargetAt(500, 400, 1100, 700, 'halves')).toBeNull();
  });

  it('a quarter that is below the Broker minimum is refused at 1200x900', () => {
    expect(snapFits('BL', broker, wa, 8)).toBe(false);
    expect(snapFits('TL', broker, wa, 8)).toBe(false);
    expect(snapFits('L2', broker, wa, 8)).toBe(true);
  });
});

describe('shared edges between tiles (P2-025)', () => {
  it('finds the vertical edge between a left and a right tile, once', () => {
    const edges = sharedEdges([
      { id: 'b', f: { x0: 0, y0: 0, x1: 0.5, y1: 1 } },
      { id: 'w', f: { x0: 0.5, y0: 0, x1: 1, y1: 0.5 } },
      { id: 'p', f: { x0: 0.5, y0: 0.5, x1: 1, y1: 1 } },
    ]);
    expect(edges).toHaveLength(3);
    const bw = edges.find((e) => e.a === 'b' && e.b === 'w')!;
    expect(bw).toMatchObject({ axis: 'x', pos: 0.5, lo: 0, hi: 0.5 });
    expect(edges.find((e) => e.a === 'w' && e.b === 'p')).toMatchObject({ axis: 'y', pos: 0.5, lo: 0.5, hi: 1 });
  });

  it('ignores tiles that only touch at a corner', () => {
    const edges = sharedEdges([
      { id: 'a', f: { x0: 0, y0: 0, x1: 0.5, y1: 0.5 } },
      { id: 'b', f: { x0: 0.5, y0: 0.5, x1: 1, y1: 1 } },
    ]);
    expect(edges).toEqual([]);
  });
});
