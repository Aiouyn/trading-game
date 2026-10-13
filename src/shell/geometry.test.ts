import { describe, expect, it } from 'vitest';
import { APPS } from './apps';
import {
  SIDE_COL_PX,
  GUTTER,
  brokerView,
  GUTTER_FOCUS,
  SHELF_H,
  STRIP_H,
  STRIP_H_FOCUS,
  clampRect,
  fitsMin,
  fracToRect,
  layoutMode,
  nearestSlot,
  openRect,
  CASCADE_STEP,
  slotAllowedInMode,
  slotRect,
  viewportClass,
  workArea,
  gutterFor,
  SLOT_FRAC,
  slotFrac,
  tileSlots,
} from './geometry';

const VP_1440 = { w: 1440, h: 900 };
const VP_1000 = { w: 1000, h: 800 };
const VP_1920 = { w: 1920, h: 1080 };

describe('viewport classes and layout modes', () => {
  it('splits phone, compact and desktop at 768 and 1200', () => {
    expect(viewportClass(390)).toBe('phone');
    expect(viewportClass(767)).toBe('phone');
    expect(viewportClass(768)).toBe('compact');
    expect(viewportClass(1199)).toBe('compact');
    expect(viewportClass(1200)).toBe('desktop');
  });

  it('gives single below 1000, halves from 1000, full from 1200', () => {
    expect(layoutMode(767)).toBe('phone');
    expect(layoutMode(768)).toBe('single');
    expect(layoutMode(999)).toBe('single');
    expect(layoutMode(1000)).toBe('halves');
    expect(layoutMode(1199)).toBe('halves');
    expect(layoutMode(1200)).toBe('full');
  });

  it('allows only halves below 1200 and everything at 1200', () => {
    expect(slotAllowedInMode('L2', 'halves')).toBe(true);
    expect(slotAllowedInMode('R2', 'halves')).toBe(true);
    expect(slotAllowedInMode('L3', 'halves')).toBe(false);
    expect(slotAllowedInMode('TL', 'single')).toBe(false);
    expect(slotAllowedInMode('R3T', 'full')).toBe(true);
  });
});

describe('work area and gutters', () => {
  it('is the viewport minus the strip and shelf (34 and 52 px)', () => {
    expect(workArea(VP_1440, false)).toEqual({ w: 1440, h: 900 - STRIP_H - SHELF_H });
    expect(workArea(VP_1920, false)).toEqual({ w: 1920, h: 1080 - STRIP_H - SHELF_H });
  });

  it('shrinks the strip to 24 px and drops the shelf in focus mode', () => {
    expect(workArea(VP_1440, true)).toEqual({ w: 1440, h: 900 - STRIP_H_FOCUS });
    expect(gutterFor(false)).toBe(GUTTER);
    expect(gutterFor(true)).toBe(GUTTER_FOCUS);
    expect(GUTTER).toBe(8);
  });
});

describe('slot rects', () => {
  it('keeps an 8 px margin at the outer edges and an 8 px gap between neighbours', () => {
    const wa = workArea(VP_1440, false);
    const l2 = slotRect('L2', VP_1440, false);
    const r2 = slotRect('R2', VP_1440, false);
    expect(l2.x).toBe(GUTTER);
    expect(l2.y).toBe(GUTTER);
    expect(r2.x + r2.w).toBe(wa.w - GUTTER);
    expect(r2.x - (l2.x + l2.w)).toBe(GUTTER);
    expect(l2.y + l2.h).toBe(wa.h - GUTTER);
  });

  it('places every slot within 1 px of its ideal fraction at 1440x900 and 1920x1080', () => {
    for (const vp of [VP_1440, VP_1920]) {
      const wa = workArea(vp, false);
      for (const name of Object.keys(SLOT_FRAC) as (keyof typeof SLOT_FRAC)[]) {
        const f = SLOT_FRAC[name];
        const r = slotRect(name, vp, false);
        const idealX0 = f.x0 === 0 ? GUTTER : f.x0 * wa.w + GUTTER / 2;
        const idealX1 = f.x1 === 1 ? wa.w - GUTTER : f.x1 * wa.w - GUTTER / 2;
        const idealY0 = f.y0 === 0 ? GUTTER : f.y0 * wa.h + GUTTER / 2;
        const idealY1 = f.y1 === 1 ? wa.h - GUTTER : f.y1 * wa.h - GUTTER / 2;
        expect(Math.abs(r.x - idealX0), `${name} x0 ${vp.w}`).toBeLessThanOrEqual(1);
        expect(Math.abs(r.x + r.w - idealX1), `${name} x1 ${vp.w}`).toBeLessThanOrEqual(1);
        expect(Math.abs(r.y - idealY0), `${name} y0 ${vp.w}`).toBeLessThanOrEqual(1);
        expect(Math.abs(r.y + r.h - idealY1), `${name} y1 ${vp.w}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('gives a side panel a 400 px column at 1440 (UX stage 6) and the Broker the width left of it', () => {
    const l23 = slotRect('L23', VP_1440, false);
    const r3 = slotRect('R3', VP_1440, false);
    expect(r3.w).toBe(SIDE_COL_PX);
    expect(r3.x + r3.w).toBe(1440 - GUTTER);
    expect(l23.x + l23.w).toBeLessThan(r3.x);
    // at 1920 the column scales with the width (the share is fixed), so it stays right of the Broker
    const wide = slotRect('R3', VP_1920, false);
    expect(wide.w).toBeGreaterThan(SIDE_COL_PX);
    expect(wide.x + wide.w).toBe(1920 - GUTTER);
  });

  it('stacks R3T above R3B with one gutter between them', () => {
    const top = slotRect('R3T', VP_1440, false);
    const bottom = slotRect('R3B', VP_1440, false);
    expect(bottom.y - (top.y + top.h)).toBe(GUTTER);
    expect(top.x).toBe(bottom.x);
    expect(top.w).toBe(bottom.w);
  });

  it('uses a 1 px gutter in focus mode', () => {
    const l2 = slotRect('L2', VP_1000, true);
    const r2 = slotRect('R2', VP_1000, true);
    expect(r2.x - (l2.x + l2.w)).toBe(GUTTER_FOCUS);
    expect(l2.x).toBe(GUTTER_FOCUS);
  });

  it('computes halves at 1000x800 with a 488 px half and 8 px gap', () => {
    const l2 = slotRect('L2', VP_1000, false);
    const r2 = slotRect('R2', VP_1000, false);
    expect(l2.w).toBe(488);
    expect(r2.w).toBe(488);
    expect(r2.x - (l2.x + l2.w)).toBe(GUTTER);
  });

  it('keeps a fractional rect inside the work area', () => {
    const r = fracToRect({ x0: 0.1, y0: 0.2, x1: 0.9, y1: 0.8 }, { w: 500, h: 500 }, GUTTER);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w).toBeLessThanOrEqual(500);
    expect(r.y + r.h).toBeLessThanOrEqual(500);
  });
});

describe('min-size checks and nearest slot', () => {
  it('refuses the Broker in a right half at 1440 (its 480 px minimum), and fits the Portfolio in the 400 px column', () => {
    expect(fitsMin(APPS.broker, slotRect('R3T', VP_1440, false))).toBe(false);
    expect(fitsMin(APPS.portfolio, slotRect('R3B', VP_1440, false))).toBe(true);
    expect(fitsMin(APPS.portfolio, slotRect('R3B', VP_1920, false))).toBe(true);
  });

  it('refuses the Portfolio in a third at 1200 (331 px < 350), and fits the Broker in a half at 1000', () => {
    expect(fitsMin(APPS.portfolio, slotRect('R3', { w: 1200, h: 800 }, false))).toBe(false);
    expect(fitsMin(APPS.broker, slotRect('L2', VP_1000, false))).toBe(true);
  });

  it('clamps a rect into the work area without changing its size', () => {
    const wa = { w: 1000, h: 700 };
    expect(clampRect({ x: 900, y: -20, w: 300, h: 200 }, wa)).toEqual({ x: 700, y: 0, w: 300, h: 200 });
    expect(clampRect({ x: 10, y: 10, w: 400, h: 300 }, wa)).toEqual({ x: 10, y: 10, w: 400, h: 300 });
  });

  it('finds the nearest allowed slot that fits, or none', () => {
    const wa = workArea(VP_1920, false);
    const nearLeft = { x: 8, y: 8, w: 940, h: 978 };
    expect(nearestSlot(nearLeft, wa, GUTTER, APPS.broker, 'full')).toBe('L2');
    expect(nearestSlot(nearLeft, wa, GUTTER, { minW: 5000, minH: 5000 }, 'full')).toBeNull();
    expect(nearestSlot(nearLeft, workArea(VP_1000, false), GUTTER, { minW: 900, minH: 300 }, 'halves')).toBeNull();
  });
});


describe('Broker layout breakpoints (V:41, C-37)', () => {
  it('narrow below 720 wide, short below 560 tall', () => {
    expect(brokerView({ w: 480, h: 420 })).toEqual({ narrow: true, short: true, terminal: false });
    expect(brokerView({ w: 720, h: 560 })).toEqual({ narrow: false, short: false, terminal: false });
    expect(brokerView({ w: 900, h: 559 })).toEqual({ narrow: false, short: true, terminal: true });
    // the terminal starts at 900 px wide (spec 1.1)
    expect(brokerView({ w: 899, h: 700 }).terminal).toBe(false);
    expect(brokerView({ w: 900, h: 700 }).terminal).toBe(true);
  });
});

describe('default open rect (defect A, Velvet window rules)', () => {
  it('sizes a window to its preferred fraction of the work area at 1440 x 900', () => {
    const wa = workArea(VP_1440, false);
    // The Broker is two thirds wide, the medium apps half, Wire 36%.
    expect(openRect(APPS.broker, wa, 0)).toMatchObject({ w: Math.round(wa.w * 2 / 3) });
    expect(openRect(APPS.settings, wa, 0)).toMatchObject({ w: 720, h: Math.round(wa.h * 0.72) });
    expect(openRect(APPS.wire, wa, 0).w).toBe(Math.round(wa.w * 0.36));
  });

  it('centres the first window in the work area', () => {
    const wa = workArea(VP_1440, false);
    const r = openRect(APPS.settings, wa, 0);
    expect(r.x).toBe(Math.round((wa.w - r.w) / 2));
    expect(r.y).toBe(Math.round((wa.h - r.h) / 2));
  });

  it('cascades each next window by 24 px from the centre, wrapping after five steps', () => {
    const wa = workArea(VP_1440, false);
    const first = openRect(APPS.settings, wa, 0);
    expect(openRect(APPS.settings, wa, 1)).toEqual({ ...first, x: first.x + CASCADE_STEP, y: first.y + CASCADE_STEP });
    expect(openRect(APPS.settings, wa, 2)).toEqual({ ...first, x: first.x + 2 * CASCADE_STEP, y: first.y + 2 * CASCADE_STEP });
    expect(openRect(APPS.settings, wa, 5)).toEqual(first);
  });

  it('never leaves the work area, at any size or cascade step', () => {
    for (const vp of [VP_1440, VP_1920, VP_1000, { w: 900, h: 800 }, { w: 1200, h: 600 }]) {
      const wa = workArea(vp, false);
      for (const id of Object.keys(APPS) as (keyof typeof APPS)[]) {
        for (let n = 0; n < 12; n++) {
          const r = openRect(APPS[id], wa, n);
          const where = `${id} step ${n}`;
          expect(r.x, where).toBeGreaterThanOrEqual(0);
          expect(r.y, where).toBeGreaterThanOrEqual(0);
          expect(r.x + r.w, where).toBeLessThanOrEqual(wa.w);
          expect(r.y + r.h, where).toBeLessThanOrEqual(wa.h);
        }
      }
    }
  });

  it('keeps every default window at or above its app minimum, and inside a small work area', () => {
    const wa = workArea(VP_1000, false);
    for (const id of Object.keys(APPS) as (keyof typeof APPS)[]) {
      expect(fitsMin(APPS[id], openRect(APPS[id], wa, 0)), id).toBe(true);
    }
    // A work area smaller than the minimum is the limit: the window takes the whole area.
    expect(openRect({ minW: 5000, minH: 5000, pref: { w: 0.5, h: 0.5 } }, wa, 0)).toEqual({ x: 0, y: 0, w: wa.w, h: wa.h });
  });
});

describe('tileSlots (UX stage 2 tiling)', () => {
  it('uses halves for two, one large plus two stacked for three, and quarters for four', () => {
    expect(tileSlots(2)).toEqual(['L2', 'R2']);
    expect(tileSlots(3)).toEqual(['L23', 'R3T', 'R3B']);
    expect(tileSlots(4)).toEqual(['TL', 'TR', 'BL', 'BR']);
  });

  it('fills a grid for five and more, with the last row at equal width and no overlap', () => {
    const wa = { w: 1200, h: 800 };
    for (const n of [5, 6, 7, 9]) {
      const tiles = tileSlots(n);
      expect(tiles).toHaveLength(n);
      const rects = tiles.map((t) => fracToRect(slotFrac(t), wa, 0));
      const area = rects.reduce((s, r) => s + r.w * r.h, 0);
      expect(area).toBeGreaterThan(wa.w * wa.h * 0.99);
      expect(area).toBeLessThanOrEqual(wa.w * wa.h * 1.01);
    }
  });
});
