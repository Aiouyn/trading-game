import { describe, expect, it } from 'vitest';
import { deltaE, srgbToOklab, type Rgb } from '@/city/art/color';
import { buildRamps } from '@/city/art/ramps';
import { inkBrass } from './tokens-fixture';

describe('olive park (card 2 §2.5)', () => {
  const r = buildRamps(inkBrass);
  const lch = (c: Rgb) => {
    const [L, a, b] = srgbToOklab(c);
    return { L, C: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
  };
  it('OKLCH(L(land) + .040, .028, 112°), about #222314 on Ink & Brass; the verge halfway', () => {
    const p = lch(r.park);
    expect(p.L - lch(r.land).L).toBeCloseTo(0.04, 3);
    expect(p.C).toBeCloseTo(0.028, 3);
    expect(p.h).toBeCloseTo(112, 0);
    expect(deltaE(r.park, [0x22 / 255, 0x23 / 255, 0x14 / 255])).toBeLessThan(2);
    expect(lch(r.verge).L).toBeCloseTo((p.L + lch(r.land).L) / 2, 2);
  });
  it('takes no --gain input, so a colour-blind --gain remap leaves park and verge unchanged', () => {
    const cb = buildRamps({ ...inkBrass, gain: [0.2, 0.5, 0.9] });
    expect(cb.park).toEqual(r.park);
    expect(cb.verge).toEqual(r.verge);
  });
});
