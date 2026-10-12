import { describe, expect, it } from 'vitest';
import { paletteLocked, paletteStreakDays } from './palette';

describe('palette streak gate (6D.4)', () => {
  it('leaves Ink & Brass open and gates the three accent palettes on the 3, 7 and 14 day milestones', () => {
    expect(paletteStreakDays('ink-brass')).toBeNull();
    expect(paletteStreakDays('phosphor')).toBe(3);
    expect(paletteStreakDays('riviera')).toBe(7);
    expect(paletteStreakDays('broadsheet')).toBe(14);
  });

  it('locks an accent palette until the player holds its accent, and never locks Ink & Brass', () => {
    expect(paletteLocked('ink-brass', [])).toBe(false);
    expect(paletteLocked('phosphor', [])).toBe(true);
    expect(paletteLocked('phosphor', ['riviera'])).toBe(true);
    expect(paletteLocked('phosphor', ['phosphor'])).toBe(false);
    expect(paletteLocked('broadsheet', ['phosphor', 'riviera'])).toBe(true);
  });
});
