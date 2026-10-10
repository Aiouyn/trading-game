import { describe, expect, it } from 'vitest';
import { challengeSeed, isoWeekKey, weekNumberOf } from './calendar';

describe('ISO week keys (the calendar, not the engine, picks the week)', () => {
  it('matches the ISO 8601 week-year and week for known dates', () => {
    expect(isoWeekKey(new Date(Date.UTC(2026, 0, 1)))).toBe('2026-W01');
    expect(isoWeekKey(new Date(Date.UTC(2024, 11, 30)))).toBe('2025-W01');
    expect(isoWeekKey(new Date(Date.UTC(2021, 0, 3)))).toBe('2020-W53');
    expect(isoWeekKey(new Date(Date.UTC(2026, 9, 10)))).toBe('2026-W41');
  });

  it('a Sunday belongs to the week that started the Monday before it', () => {
    expect(isoWeekKey(new Date(Date.UTC(2026, 9, 11)))).toBe('2026-W41');
    expect(isoWeekKey(new Date(Date.UTC(2026, 9, 12)))).toBe('2026-W42');
  });

  it('reads the week number back from a key', () => {
    expect(weekNumberOf('2026-W41')).toBe(41);
    expect(weekNumberOf('2025-W01')).toBe(1);
  });

  it('the weekly seed is the week and the public salt, never the live seed', () => {
    const seed = challengeSeed('2026-W41');
    expect(seed).toContain('2026-W41');
    expect(seed).not.toBe(challengeSeed('2026-W42'));
    expect(seed).not.toBe('avalon');
  });
});
