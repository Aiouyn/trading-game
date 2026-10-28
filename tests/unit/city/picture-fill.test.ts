import { describe, expect, it } from 'vitest';
import { css } from '@/city/renderer/picture';

// T0 sets ~3 fills per part; card 2 makes each part's colour unique, so the fill string must be a
// form Chrome parses on its fast path (#rrggbb), not `color(srgb …)` (phone T0 parts +2.3 ms, run 40611186920)
describe('T0 fill strings', () => {
  it('are 8-bit #rrggbb, rounded and clamped', () => {
    expect(css([1, 0.5, 0])).toBe('#ff8000');
    expect(css([0.2, 0.4, 0.6], 2)).toBe('#66ccff');
    expect(css([1.2, -0.1, 0.0039])).toBe('#ff0001');
  });
});
