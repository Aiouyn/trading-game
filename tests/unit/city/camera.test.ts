import { describe, expect, it } from 'vitest';
import { clampZoom, projectOrtho, rotate, ZOOM_MAX, ZOOM_MIN } from '@/city/renderer/camera';

describe('C-09 camera', () => {
  for (const r of [0, 1, 2, 3]) {
    it(`unit square projects to a 2:1 diamond at rotation ${r} (30° ± 0.1°)`, () => {
      const pts = [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]].map((p) => projectOrtho(p as [number, number, number], r));
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
      expect(w / h).toBeCloseTo(2, 6);
      const elevation = (Math.asin(h / w) * 180) / Math.PI;
      expect(Math.abs(elevation - 30)).toBeLessThan(0.1);
    });
  }
  it('four quarter-turn rotations are reachable and cycle', () => {
    const seen = new Set<number>();
    let r: 0 | 1 | 2 | 3 = 0;
    for (let i = 0; i < 4; i++) {
      seen.add(r);
      r = rotate(r, 1);
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
    expect(r).toBe(0);
    expect(rotate(0, -1)).toBe(3);
  });
  it('zoom is clamped to 0.25×–4×', () => {
    expect(clampZoom(100)).toBe(ZOOM_MAX);
    expect(clampZoom(0.01)).toBe(ZOOM_MIN);
    expect(ZOOM_MIN).toBe(0.25);
    expect(ZOOM_MAX).toBe(4);
    expect(clampZoom(Number.NaN)).toBe(1);
  });
});
