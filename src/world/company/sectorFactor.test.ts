import { describe, expect, it } from 'vitest';
import { createWorld, defaultConfig, seedStream, stepMany } from '@/engine';
import { companyDay } from './bridge';
import { emptyCompanyWorld } from './company';
import { advanceSectorCursors, jumpEngineTicks, replaySector, seedSectorSource, tickDt } from './sectorFactor';
import { founded, unfounded } from './b1fixture';
import { stepGame } from '../game';

/**
 * O-12 (V1-PHASE9 9C): the company sector shock is the engine's sector factor return. These tests hold the binding to the
 * engine's own draws (sim.ts step), not to a copy that could drift.
 */
describe('O-12: the company sector factor is the engine sector stream (sectorFactor.ts)', () => {
  const TPD = 24;
  const DPY = 252;

  it('the replay of N ticks lands on the engine state after N steps, for every sector stream', () => {
    const w0 = createWorld('sf-replay', defaultConfig({ ticksPerDay: TPD }));
    const w1 = stepMany(w0, 3 * TPD).state;
    for (const s of Object.keys(w0.sectorRng)) {
      expect(replaySector(w0.sectorRng[s]!, 3 * TPD, tickDt(TPD, DPY)).rng).toEqual(w1.sectorRng[s]);
    }
  });

  it('jumpEngineTicks draws the sector streams exactly as the engine steps do (the fixtures rely on it)', () => {
    const w0 = createWorld('sf-jump', defaultConfig({ ticksPerDay: TPD }));
    const jumped = jumpEngineTicks(w0, 2 * TPD);
    const stepped = stepMany(w0, 2 * TPD).state;
    expect(jumped.tick).toBe(stepped.tick);
    expect(jumped.sectorRng).toEqual(stepped.sectorRng);
  });

  it('the factor of a day is the engine factor and the cursor moves to the engine state', () => {
    let eng = createWorld('sf-cursor', defaultConfig({ ticksPerDay: TPD }));
    const co = emptyCompanyWorld('sf-cursor', eng);
    eng = stepMany(eng, TPD).state;
    const f = advanceSectorCursors(co, eng, tickDt(TPD, DPY));
    const shared = Object.keys(co.sectors).filter((s) => eng.sectorRng[s]);
    expect(shared.length).toBeGreaterThan(0);
    for (const s of shared) {
      expect(Number.isFinite(f[s])).toBe(true);
      expect(co.sectors[s as keyof typeof co.sectors].tick).toBe(eng.tick);
      expect(co.sectors[s as keyof typeof co.sectors].rng).toEqual(eng.sectorRng[s]);
    }
  });

  it('a stream the engine does not carry on this seed is refused (the factor must be the engine draws)', () => {
    const eng0 = createWorld('sf-bad', defaultConfig({ ticksPerDay: TPD }));
    const co = emptyCompanyWorld('sf-bad', eng0);
    const eng = stepMany(eng0, TPD).state;
    const k = Object.keys(co.sectors).find((s) => eng.sectorRng[s])!;
    const forged = { ...eng, sectorRng: { ...eng.sectorRng, [k]: seedStream('another-seed', `sector:${k}`) } };
    expect(() => advanceSectorCursors(co, forged, tickDt(TPD, DPY))).toThrow(/out of step/);
  });

  it('a cursor ahead of the engine clock is refused', () => {
    const eng = createWorld('sf-ahead', defaultConfig({ ticksPerDay: TPD }));
    const co = emptyCompanyWorld('sf-ahead', { ...eng, tick: 5 * TPD });
    expect(() => advanceSectorCursors(co, eng, tickDt(TPD, DPY))).toThrow(/ahead of the engine/);
  });

  it('a day factor has unit variance per year: sd of the day factor is 1/sqrt(252) (G22 unit reading)', () => {
    const next = seedSectorSource('sf-variance', TPD, DPY);
    const xs: number[] = [];
    for (let d = 0; d < 6000; d++) xs.push(next()['tech']!);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1);
    // 6,000 days: the relative standard error of a variance is about sqrt(2/6000) = 1.8%; a 15% band is 8 s.e.
    expect(variance).toBeGreaterThan(0.85 / DPY);
    expect(variance).toBeLessThan(1.15 / DPY);
  });

  it('with no engine the source is the seed streams from tick 0, the same as an engine created on that seed', () => {
    const eng = createWorld('sf-noengine', defaultConfig({ ticksPerDay: TPD }));
    const co = emptyCompanyWorld('sf-noengine');
    for (const s of Object.keys(co.sectors).filter((x) => eng.sectorRng[x])) {
      expect(co.sectors[s as keyof typeof co.sectors].rng).toEqual(eng.sectorRng[s]);
      expect(co.sectors[s as keyof typeof co.sectors].tick).toBe(0);
    }
    const day = seedSectorSource('sf-noengine', TPD, DPY)();
    const s0 = Object.keys(co.sectors).find((x) => eng.sectorRng[x])!;
    expect(day[s0]).toBeCloseTo(replaySector(eng.sectorRng[s0]!, TPD, tickDt(TPD, DPY)).factor, 12);
  });

  it('the real game loop: stepGame through two day boundaries with a founded company keeps the cursors on the engine', () => {
    const { g } = founded('sf-loop');
    const start = g.market.tick;
    for (let k = 0; k < 2 * 720 + 5; k++) stepGame(g);
    // a day boundary ran the company day with the engine's own draws: the replay would have thrown if it were out of step
    expect(g.market.tick - start).toBeGreaterThan(2 * 720);
    const w = g.companies!;
    for (const s of Object.keys(w.sectors)) {
      const sec = w.sectors[s as keyof typeof w.sectors];
      if (!g.market.sectorRng[s]) continue;
      expect(sec.tick).toBeGreaterThan(start);
      expect(sec.tick).toBeLessThanOrEqual(g.market.tick);
    }
    expect(Object.values(w.sectors).some((sec) => sec.level !== 0)).toBe(true);
  }, 120_000);

  it('a world without player companies is not moved by the company day (no company world, so no sector draw)', () => {
    const g = unfounded('sf-nocompany');
    expect(g.companies).toBeUndefined();
    const before = JSON.stringify(g.market);
    companyDay(g, null);
    expect(g.companies).toBeUndefined();
    expect(JSON.stringify(g.market)).toBe(before);
  });
});
