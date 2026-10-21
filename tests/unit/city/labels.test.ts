import { describe, expect, it } from 'vitest';
import { inPolygon, placeLabels } from '@/city/renderer/labels';

describe('B1 label layout', () => {
  it('moves a label off a tall part onto open ground, and off another label', () => {
    const tower = { x: 90, y: 0, w: 40, h: 200, weight: 3 };
    const [a, b] = placeLabels(
      [
        { w: 80, h: 20, candidates: [{ x: 110, y: 100 }, { x: 110, y: 240 }] },
        { w: 80, h: 20, candidates: [{ x: 110, y: 240 }, { x: 110, y: 280 }] },
      ],
      [tower],
      { w: 400, h: 400 },
    );
    expect(a.y + a.h / 2).toBe(240);
    expect(b.y + b.h / 2).toBe(280);
  });
  it('point in polygon', () => {
    const sq: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(inPolygon(5, 5, sq)).toBe(true);
    expect(inPolygon(15, 5, sq)).toBe(false);
  });
});
