import { describe, expect, it } from 'vitest';
import { moreBelow } from './scrollMore';

describe('moreBelow (defect B: the fade shows while content lies below)', () => {
  it('is true at the top of content taller than the window', () => {
    expect(moreBelow(0, 400, 900)).toBe(true);
  });

  it('is false when the content fits, and when scrolled to the bottom', () => {
    expect(moreBelow(0, 400, 300)).toBe(false);
    expect(moreBelow(500, 400, 900)).toBe(false);
  });

  it('ignores sub-pixel rounding at the bottom (within 4 px)', () => {
    expect(moreBelow(496, 400, 900)).toBe(false);
    expect(moreBelow(494, 400, 900)).toBe(true);
  });

  it('stays true in the middle of a long list', () => {
    expect(moreBelow(200, 400, 900)).toBe(true);
  });
});
