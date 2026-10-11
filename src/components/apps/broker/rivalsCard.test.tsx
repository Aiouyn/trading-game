import { describe, expect, it } from 'vitest';
import { daysAheadBehind } from './RivalsCard';

describe('the profile card counts the days a fund sat ahead of and behind the player', () => {
  it('compares the two closes on the same game day, and skips days with no close for the player', () => {
    const chart = [{ day: 1, equity: 100 }, { day: 2, equity: 80 }, { day: 3, equity: 120 }, { day: 4, equity: 50 }];
    const you = [{ day: 1, value: 90 }, { day: 2, value: 90 }, { day: 3, value: 120 }];
    expect(daysAheadBehind(chart, you)).toEqual({ ahead: 1, behind: 1 });
  });

  it('is zero for a fund with no shared day', () => {
    expect(daysAheadBehind([{ day: 9, equity: 1 }], [])).toEqual({ ahead: 0, behind: 0 });
  });
});
