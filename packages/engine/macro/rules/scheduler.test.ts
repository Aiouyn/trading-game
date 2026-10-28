import { describe, expect, it } from 'vitest';
import { TICKS_PER_CHAPTER, TICKS_PER_GAME_DAY } from '@tycoon/engine-core';
import { HOOK_CALL_TABLE, macroTables, type HookCall, type WorldEvent } from '../schema';
import { runChapters, schedWorld, SCHED0, V1, type StartRec } from '../testkit/schedWorld';
import { chapterStart, constraintsAllowMajor, crisisWeekActive, DRAWS_PER_DAY, forceEvent, majorRate, plannedTrigger, poissonInverse, schedOf, schedulerDay } from './scheduler';
import { attachEmergent } from './phases';
import { utcBandOf, utcHourOfTick } from './calendar';

const D = TICKS_PER_GAME_DAY, CH = TICKS_PER_CHAPTER, DAYS = CH / D;
const majors = (r: StartRec[]): StartRec[] => r.filter((x) => x.tier === 'MAJOR');
function pairwise(r: StartRec[]): void {
  const m = majors(r);
  for (const x of m) {
    expect(x.triggerTick - x.precursorStartTick).toBeGreaterThanOrEqual(8 * D);
    const c0 = Math.floor(x.precursorStartTick / CH) * CH;
    expect(x.triggerTick).toBeLessThan(c0 + CH - 48 * D);
    expect(x.precursorStartTick).toBeGreaterThanOrEqual(c0 + 24 * D);
  }
  for (let i = 1; i < m.length; i++) {
    expect(m[i - 1]!.endTick).not.toBeNull();
    expect(m[i]!.precursorStartTick).toBeGreaterThan(m[i - 1]!.endTick!);            // never two active
    expect(m[i]!.triggerTick - m[i - 1]!.triggerTick).toBeGreaterThanOrEqual(504 * D);
  }
}

describe('T04-17 scheduler rates (04#33, 04#34)', () => {
  const w = schedWorld('h33'), r = runChapters(w, 1000, V1);
  it('04#33 over 1,000 chapters: ≥1 major in 35% ± 5%, storms 12-18, ripples 150-230 per chapter', () => {
    const share = new Set(majors(r).map((x) => x.chapter)).size / 1000;
    const per = (t: string): number => r.filter((x) => x.tier === t).length / 1000;
    expect(share).toBeGreaterThanOrEqual(0.3); expect(share).toBeLessThanOrEqual(0.4);
    expect(per('STORM')).toBeGreaterThanOrEqual(12); expect(per('STORM')).toBeLessThanOrEqual(18);
    expect(per('RIPPLE')).toBeGreaterThanOrEqual(150); expect(per('RIPPLE')).toBeLessThanOrEqual(230);
  });
  it('04#33 exactly 24 draws per day plus 2 per chapter start (stream position)', () => {
    expect(w.draws['macro.crisis']).toBe(1000 * DAYS * DRAWS_PER_DAY + 1000 * 2);
  });
  it('04#34 pairwise major constraints, default rate and V × 20', () => {
    pairwise(r);
    const w2 = schedWorld('h34'), r2 = runChapters(w2, 200, V1.map((x) => ({ ...x, w: x.w * 20 })));
    expect(majors(r2).length).toBeGreaterThan(200);
    pairwise(r2);
  });
});

describe('T04-17 UTC band rotation (04#35)', () => {
  it('≥ 300 majors, each band share in [0.233, 0.433], strict 0 → 1 → 2 rotation', () => {
    const w = schedWorld('h35'); w.nums({ macro_major_min_gap_days: 30 });
    const r = majors(runChapters(w, 30, V1.map((x) => ({ ...x, w: x.w * 1000 }))));
    expect(r.length).toBeGreaterThanOrEqual(300);
    const bands = r.map((x) => utcBandOf(utcHourOfTick(w.ctx.header, x.triggerTick)));
    for (const b of [0, 1, 2]) { const s = bands.filter((x) => x === b).length / bands.length; expect(s).toBeGreaterThanOrEqual(0.233); expect(s).toBeLessThanOrEqual(0.433); }
    bands.forEach((b, i) => expect(b).toBe(i % 3));
  });
  it('plannedTrigger: first tick ≥ from in the band', () => {
    const w = schedWorld('pt'), h = w.ctx.header;
    for (const band of [0, 1, 2] as const) for (const from of [1000, 1001]) {
      const k = plannedTrigger(h, from, band);
      expect(utcBandOf(utcHourOfTick(h, k))).toBe(band);
      for (let j = from; j < k; j++) expect(utcBandOf(utcHourOfTick(h, j))).not.toBe(band);
    }
  });
});

describe('T04-17 draws and rates', () => {
  it('poissonInverse(0.5, 1/7) = 0, (0.95, 1/7) = 1, edges at P(0) = 0.866878 and P(≤1) = 0.990717', () => {
    expect(poissonInverse(0.5, 1 / 7)).toBe(0); expect(poissonInverse(0.95, 1 / 7)).toBe(1);
    expect(poissonInverse(0.8668, 1 / 7)).toBe(0); expect(poissonInverse(0.8670, 1 / 7)).toBe(1);
    expect(poissonInverse(0.9907, 1 / 7)).toBe(1); expect(poissonInverse(0.9908, 1 / 7)).toBe(2);
  });
  it('24 draws per day whether or not anything starts', () => {
    const w = schedWorld('dc'); w.setTick(30 * D + D - 1);
    schedulerDay(w.ctx, undefined, V1); expect(w.draws['macro.crisis']).toBe(24);
    schedulerDay(w.ctx, undefined, V1.map((x) => ({ ...x, w: 0 }))); expect(w.draws['macro.crisis']).toBe(48);
  });
  it('majorRate: base × V with V = Σw / 3, × 1.5 in a crisis week', () => {
    const w = schedWorld('mr'), p = w.ctx.params, ws = V1.map((x) => ({ ...x, w: x.w * 2 }));
    expect(majorRate(w.store, false, p, ws).V).toBeCloseTo(2, 12);
    expect(majorRate(w.store, false, p, ws).lambda).toBeCloseTo(3.6e-4 * 2, 15);
    expect(majorRate(w.store, true, p, ws).lambda).toBeCloseTo(3.6e-4 * 3, 15);
  });
});

describe('T04-17 crisis week and constraints', () => {
  const weekOf = (seed: string) => { for (let i = 0; i < 200; i++) { const w = schedWorld(`${seed}${i}`); chapterStart(w.ctx); const cw = schedOf(w.store).crisisWeek; if (cw) return { w, cw }; } throw new Error('none'); };
  it('announced exactly 48 × 720 ticks ahead with a 16 WIRE_ITEM hook; week w ∈ 2..7', () => {
    const { w, cw } = weekOf('cw');
    expect(cw.startTick - cw.announcedTick).toBe(48 * 720);
    expect((cw.startTick / (168 * D)) % 1).toBe(0); expect(cw.startTick / (168 * D)).toBeGreaterThanOrEqual(1); expect(cw.startTick / (168 * D)).toBeLessThanOrEqual(6);
    expect(cw.endTick - cw.startTick).toBe(168 * D);
    w.setTick(cw.announcedTick - D - 1); schedulerDay(w.ctx, undefined, V1);
    expect(w.store.iter<HookCall>(HOOK_CALL_TABLE.name).filter((h) => h.hook === 'WIRE_ITEM')).toEqual([]);
    w.setTick(cw.announcedTick - 1); schedulerDay(w.ctx, undefined, V1);
    const hk = w.store.iter<HookCall>(HOOK_CALL_TABLE.name).filter((h) => h.hook === 'WIRE_ITEM');
    expect(hk.length).toBe(1); expect(hk[0]!.owner).toBe('16');
    expect(hk[0]!.args).toEqual({ key: 'crisis_week_announced', startTick: cw.startTick, endTick: cw.endTick });
    expect(hk[0]!.worldEventId).toBe(`cwk_WORLD_${cw.startTick / 720}`);   // AC-04-18-HOOKID (1)
    expect(hk[0]!.worldEventId).toMatch(/^cwk_WORLD_\d+$/);
  });
  it('about 60% of chapters get one, never two (crisisWeekUsedThisChapter)', () => {
    let n = 0;
    for (let i = 0; i < 400; i++) { const w = schedWorld(`p${i}`); chapterStart(w.ctx); const s = schedOf(w.store); if (s.crisisWeek) n++; expect(s.crisisWeekUsedThisChapter).toBe(s.crisisWeek !== null); }
    expect(n / 400).toBeGreaterThan(0.5); expect(n / 400).toBeLessThan(0.7);
  });
  it('forced storm on the crisis week day 3 when none started in it', () => {
    const { w, cw } = weekOf('fs'); w.nums({ macro_storm_rate: 0 });
    let started: WorldEvent[] = [];
    for (let day = cw.startTick / D; day < cw.startTick / D + 3; day++) { w.setTick(day * D + D - 1); started = schedulerDay(w.ctx, undefined, V1).filter((e) => e.tier === 'STORM'); if (day < cw.startTick / D + 2) expect(started).toEqual([]); }
    expect(started.length).toBe(1);
    expect(crisisWeekActive(schedOf(w.store), cw.startTick + 2 * D + D - 1)).toBe(true);
  });
  it('no forced storm when one already started in the week', () => {
    const { w, cw } = weekOf('ns'); w.nums({ macro_storm_rate: 0 });
    w.store.put(macroTables.global.name, { ...w.store.get<object>(macroTables.global.name, 'GLOBAL')!, scheduler: { ...schedOf(w.store), lastStormStartTick: cw.startTick + 10 } } as never);
    w.setTick(cw.startTick + 2 * D + D - 1);
    expect(schedulerDay(w.ctx, undefined, V1).filter((e) => e.tier === 'STORM')).toEqual([]);
  });
  it('storm cooldown: no storm start until 7 game days after the last storm ended', () => {
    const at = (gap: number): number => {
      const w = schedWorld('cd'); w.nums({ macro_storm_rate: 1e6 }); const t = 40 * D + D - 1;
      w.store.put(macroTables.global.name, { ...w.store.get<object>(macroTables.global.name, 'GLOBAL')!, scheduler: { ...schedOf(w.store), lastStormEndTick: t - gap } } as never);
      w.setTick(t); return schedulerDay(w.ctx, undefined, V1).filter((e) => e.tier === 'STORM').length;
    };
    expect(at(7 * D - 1)).toBe(0);
    expect(at(7 * D)).toBe(1);
  });
  it('no scheduled MAJOR or STORM start in the first 24 game days', () => {
    const w = schedWorld('f24'); w.nums({ macro_storm_rate: 1e6 });
    const r = runChapters(w, 3, V1.map((x) => ({ ...x, w: x.w * 1e6 })));
    for (const x of r.filter((e) => e.tier !== 'RIPPLE')) expect(x.precursorStartTick % CH).toBeGreaterThanOrEqual(24 * D);
    expect(r.filter((e) => e.tier === 'STORM' && e.precursorStartTick % CH === 24 * D).length).toBeGreaterThan(0);
  });
  it('constraint order and reasons; PLAYER_CAUSED suppression of 336 game days', () => {
    const w = schedWorld('cn'), p = w.ctx.params, t = 100 * D + D - 1, c0 = 0, c1 = CH;
    expect(constraintsAllowMajor(SCHED0, t, t + 10 * D, c0, c1, p)).toEqual({ ok: true });
    expect(constraintsAllowMajor({ ...SCHED0, activeMajorId: 'x', lastMajorStartTick: t }, t, t + 10 * D, c0, c1, p).reason).toBe('ACTIVE');
    expect(constraintsAllowMajor({ ...SCHED0, lastMajorStartTick: t + 10 * D - 504 * D + 1 }, t, t + 10 * D, c0, c1, p).reason).toBe('GAP');
    expect(constraintsAllowMajor({ ...SCHED0, lastMajorStartTick: t + 10 * D - 504 * D }, t, t + 10 * D, c0, c1, p).ok).toBe(true);
    expect(constraintsAllowMajor(SCHED0, t, c1 - 48 * D, c0, c1, p).reason).toBe('FINAL_48');
    expect(constraintsAllowMajor(SCHED0, t, c1 - 48 * D - 1, c0, c1, p).ok).toBe(true);
    expect(constraintsAllowMajor(SCHED0, 24 * D - 2, 40 * D, c0, c1, p).reason).toBe('FIRST_24');
    expect(constraintsAllowMajor(SCHED0, 24 * D - 1, 40 * D, c0, c1, p).ok).toBe(true);
    expect(constraintsAllowMajor({ ...SCHED0, playerCausedSuppressUntil: t + 1 }, t, t + 10 * D, c0, c1, p).reason).toBe('PLAYER_SUPPRESS');
    expect(constraintsAllowMajor({ ...SCHED0, playerCausedSuppressUntil: t }, t, t + 10 * D, c0, c1, p).ok).toBe(true);
  });
  it('a PLAYER_CAUSED major sets suppression to tick + 336 game days', () => {
    const w = schedWorld('pc'); w.setTick(200 * D + 5);
    attachEmergent(w.ctx, 'CYBER_PANDEMIC', [], 'PLAYER_CAUSED', { key: 'emergent.CYBER_PANDEMIC', refs: [] });
    expect(schedOf(w.store).playerCausedSuppressUntil).toBe(200 * D + 5 + 336 * D);
  });
  it('forceEvent bypasses rate and constraints, takes no draws', () => {
    const w = schedWorld('fe'); w.setTick(3 * D);
    const ev = forceEvent(w.ctx, 'BANKING_PANIC', {});
    expect(ev.tier).toBe('MAJOR'); expect(ev.triggerTick - ev.precursorStartTick).toBe(8 * D); expect(w.draws['macro.crisis'] ?? 0).toBe(0);
    expect(schedOf(w.store).activeMajorId).toBe(ev.id);
  });
});
