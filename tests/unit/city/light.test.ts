import { describe, expect, it } from 'vitest';
import { mixOklab, srgbToOklab } from '@/city/art/color';
import { dayKeys, lightAt, lightMinute, minuteOfTick, DEFAULT_GAME_MINUTE } from '@/city/renderer/light';
import { inkBrass } from './tokens-fixture';

const K = dayKeys(inkBrass);
const occ = 0.88;
const at = (h: number, m = 0) => lightAt(h * 60 + m, occ, K);

describe('card 2 §2.3 keyframed daylight', () => {
  it('19:00 is card 1: --acc-lo .16, --info .10, exposure .82, sun arc unchanged, windows occ × .46', () => {
    const d = at(19);
    expect(d.key).toEqual(inkBrass.accLo);
    expect(d.keyK).toBe(0.16);
    expect(d.sky).toEqual(inkBrass.info);
    expect(d.skyK).toBe(0.1);
    expect(d.exposure).toBe(0.82);
    const a = (780 / 720) * Math.PI;
    expect(d.sunDir).toEqual([Math.cos(a), 0.35, 0.8]);
    expect(d.windowsLit).toBeCloseTo(occ * 0.46, 9);
    expect(DEFAULT_GAME_MINUTE).toBe(19 * 60);
  });
  it('keys hold: night 21:30–04:30, day 09:00–16:00', () => {
    for (const [h, m] of [[21, 30], [23, 0], [2, 0], [4, 30]]) expect(at(h, m)).toMatchObject({ ...K.night, windowsLit: expect.closeTo(occ * 0.3, 9) });
    for (const h of [9, 13, 16]) expect(at(h)).toMatchObject({ ...K.day, windowsLit: 0 });
    expect(at(6, 30)).toMatchObject(K.dawn);
    expect(K.night.key).toEqual(mixOklab(inkBrass.steel, inkBrass.bg0, 0.35)); // reads --steel per palette
  });
  it('exposure and key L rise 23:00 → 08:00 → 13:00; windows 0 from 07:30 to 17:30', () => {
    expect(at(23).exposure).toBeLessThan(at(8).exposure);
    expect(at(8).exposure).toBeLessThan(at(13).exposure);
    const L = (h: number) => srgbToOklab(at(h).key)[0] * at(h).keyK;
    expect(L(23)).toBeLessThan(L(8));
    expect(L(8)).toBeLessThan(L(13));
    for (let m = 7.5 * 60; m <= 17.5 * 60; m += 10) expect(lightAt(m, occ, K).windowsLit).toBe(0);
    expect(at(18).windowsLit).toBeGreaterThan(0);
    expect(at(19).windowsLit).toBeGreaterThan(at(23).windowsLit);
    expect(at(23).windowsLit).toBeGreaterThan(0);
    expect(at(5).windowsLit).toBeLessThan(at(4, 30).windowsLit);
  });
  it('continuous: no step over 1 game minute anywhere on the clock', () => {
    for (let m = 0; m < 1440; m++) {
      const a = lightAt(m, occ, K), b = lightAt(m + 1, occ, K);
      expect(Math.abs(a.exposure - b.exposure)).toBeLessThan(0.01);
      expect(Math.abs(a.windowsLit - b.windowsLit)).toBeLessThan(0.01);
    }
  });
  it('reduced motion floors to the game hour; otherwise the minute passes through', () => {
    expect(lightMinute(19 * 60 + 47, true)).toBe(19 * 60);
    expect(lightMinute(19 * 60 + 47, false)).toBe(19 * 60 + 47);
  });
  it('minuteOfTick equals the engine canon ticksToGameDate(tick).minuteOfDay', async () => {
    // non-literal specifier: the app tsconfig excludes packages/, so tsc must not follow this import
    const spec = ['..', '..', '..', 'packages', 'engine', 'core', 'calendar', 'date'].join('/');
    const { ticksToGameDate } = (await import(/* @vite-ignore */ spec)) as { ticksToGameDate: (t: number) => { minuteOfDay: number } };
    for (const t of [0, 1, 359, 719, 720, 721, 38 * 720 + 340, 1e6 + 3]) expect(minuteOfTick(t)).toBe(ticksToGameDate(t).minuteOfDay);
  });
});
