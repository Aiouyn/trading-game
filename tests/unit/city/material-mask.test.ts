import { describe, expect, it } from 'vitest';
import { PART_FRAG } from '../../../src/city/renderer/shaders';

// AC5 reads the median *wall* colour per district from coverage('material', id). Roofs in the mask
// mixed brick with slate (Old Harbor 322°) and made midtown = industrial_basin (shared metal top) in run 40609040719.
describe('coverage(material) mask', () => {
  it('counts walls of the material only, never top faces', () => {
    const line = PART_FRAG.split('\n').find((l) => l.includes('uMask > 2.5'));
    expect(line).toBeDefined();
    expect(line).toMatch(/!top\s*&&\s*abs\(vMat\.x - \(uMask - 3\.0\)\) < 0\.5/);
    // `top` must be computed before the mask branch
    expect(PART_FRAG.indexOf('bool top = n.y > 0.5;')).toBeGreaterThan(-1);
    expect(PART_FRAG.indexOf('bool top = n.y > 0.5;')).toBeLessThan(PART_FRAG.indexOf('uMask > 2.5'));
  });
});
