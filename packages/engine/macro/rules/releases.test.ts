// T04-16 acceptance tests: consensus and publication (04 §3.15.1-§3.15.2), 04#13, revisions, GDP print error, risk reactions, hidden fields.
import { describe, expect, it } from 'vitest';
import { isTradingDay } from '@tycoon/engine-core';
import { assertNoHiddenFields, MACRO_EVENTS } from '../events';
import { BLOC_ORDER, macroTables, type LatestPrint, type ReleaseKind } from '../schema';
import { releaseWorld } from '../testkit/releaseWorld';
import { previousTradingDay, writeQuarterSchedule, type ScheduledRelease } from './calendar';
import { gdpPrintError, latestPrint, postConsensus, publishRelease, releaseId, releaseRiskReactions, releasesDue } from './releases';

const D = 720;
type Pub = { bloc: string; kind: string; releaseId: string };
describe('T04-16 releases', () => {
  it('04#13 every scheduled release appears in the calendar ≥ 1 game day ahead with its consensus, is published at its scheduled tick, and never on a weekend', () => {
    const w = releaseWorld(0); writeQuarterSchedule(w.ctx, 0); writeQuarterSchedule(w.ctx, 91); writeQuarterSchedule(w.ctx, 182);   // all written at tick 0
    for (let day = 0; day < 182; day++) for (const t of [45, 300, 420]) {
      const tick = day * D + t; w.at(tick);
      const due = releasesDue(w.ctx.store, tick);
      for (const r of due.consensus) postConsensus(w.ctx, r.bloc, r);
      for (const r of due.publish) publishRelease(w.ctx, r.bloc, r);
    }
    const cons = new Map(w.events.filter((e) => e.kind === 'macro.release.consensus').map((e) => [(e.payload as Pub).releaseId, e]));
    const pubs = w.events.filter((e) => e.kind === 'macro.release.published');
    expect(pubs.length).toBeGreaterThan(300);
    const scheduled = w.rows(macroTables.schedule.name).filter((r) => { const x = r as { kind: string; id: string }; const tk = Number(x.id.split(':')[2]);
      return !x.kind.startsWith('CB_') && tk < 182 * D; });
    expect(pubs.length).toBe(scheduled.length);   // every scheduled release in the window was published
    for (const e of pubs) {
      const p = MACRO_EVENTS['macro.release.published']!.parse(e.payload) as Pub;
      const row = w.ctx.store.get(macroTables.release.name, p.releaseId) as { scheduledTick: number; releasedTick: number; bloc: 'FDL' };
      expect(row.releasedTick).toBe(row.scheduledTick);
      const day = Math.floor(row.releasedTick / D);
      expect(day >= 1 && day % 7 < 5 && isTradingDay(row.bloc, day)).toBe(true);   // schedule row written at tick 0, ≥ 720 ticks earlier
      const c = cons.get(p.releaseId)!; expect(c).toBeDefined();
      expect(MACRO_EVENTS['macro.release.consensus']!.parse(c.payload)).toBeTruthy();
      expect(w.events.indexOf(c)).toBeLessThan(w.events.indexOf(e));
      expect((c.payload as { scheduledTick: number }).scheduledTick).toBe(row.scheduledTick);
      expect(assertNoHiddenFields(e.payload)).toEqual([]); expect(assertNoHiddenFields(c.payload)).toEqual([]);
    }
    // consensus at t 420 of the previous trading day: the tick the consensus event was emitted at is recorded as the row's consensus inputs
    const cpi = pubs.map((e) => e.payload as Pub).find((p) => p.bloc === 'FDL' && p.kind === 'CPI')!;
    expect(cpi.releaseId).toBe(`rel_FDL_CPI_${35 * D + 45}`);   // month 1 (day 28): trading day 6 = day 35, t 45
    expect(pubs.map((e) => e.payload as Pub).find((p) => p.bloc === 'EUN' && p.kind === 'CPI')!.releaseId).toBe(`rel_EUN_CPI_${36 * D + 45}`);
  });
  it('releasesDue: consensus at t 420 of the previous trading day, publication at the scheduled tick, sorted by tick, bloc, kind; unscheduled → none', () => {
    const w = releaseWorld(0);
    expect(releasesDue(w.ctx.store, 35 * D + 45)).toEqual({ consensus: [], publish: [] });   // no mac.schedule rows yet
    writeQuarterSchedule(w.ctx, 0);
    const pd = previousTradingDay('FDL', 35);
    const c = releasesDue(w.ctx.store, pd * D + 420).consensus.filter((r) => r.bloc === 'FDL').map((r) => r.kind);
    expect(c).toContain('CPI');
    const p = releasesDue(w.ctx.store, 35 * D + 45).publish;
    expect(p.map((r) => `${r.bloc}:${r.kind}`)).toContain('FDL:CPI');
    const order = p.map((r) => BLOC_ORDER.indexOf(r.bloc) * 100 + ['PMI', 'JOBS', 'CPI'].indexOf(r.kind));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it('revision: REV1 publishes revisedPrior = REV1 actual and the public view GDP print changes; prior is the ADV actual', () => {
    const w = releaseWorld(100 * D), q = { kind: 'QUARTER' as const, index: 0 };
    const r = (kind: ReleaseKind, tick: number): ScheduledRelease => ({ bloc: 'FDL', kind, tick, consensusTick: tick - D + 375, referencePeriod: q });
    w.at(101 * D + 45); const adv = publishRelease(w.ctx, 'FDL', r('GDP_ADV', 101 * D + 45));
    expect(adv.prior).toBe(adv.actual); expect(adv.revisedPrior).toBeUndefined();
    w.at(129 * D + 45); const rev = publishRelease(w.ctx, 'FDL', r('GDP_REV1', 129 * D + 45));
    expect(rev.prior).toBe(adv.actual); expect(rev.revisedPrior).toBe(rev.actual);
    expect(latestPrint(w.ctx.store, 'FDL', 'GDP_ADV')!.revisedPrior).toBe(rev.actual);
    expect(latestPrint(w.ctx.store, 'FDL', 'GDP_REV1')).toMatchObject({ actual: rev.actual, prior: adv.actual, revisedPrior: rev.actual, tick: 129 * D + 45 } as Partial<LatestPrint>);
    w.at(157 * D + 45); const rev2 = publishRelease(w.ctx, 'FDL', r('GDP_REV2', 157 * D + 45));
    expect(rev2.prior).toBe(rev.actual);
    expect(gdpPrintError(w.ctx.store, 'FDL')).toBe(rev2.actual - rev2.trueValue);
    expect(gdpPrintError(w.ctx.store, 'EUN')).toBe(0);
  });
  it('publication: prior = previous actual of the kind, public view print, risk reaction stored and listed for the tick; republish is a no-op', () => {
    const w = releaseWorld(9 * D + 420), m = { kind: 'MONTH' as const, index: 0 };
    const r = (tick: number): ScheduledRelease => ({ bloc: 'FDL', kind: 'CPI', tick, consensusTick: tick - 345, referencePeriod: m });
    postConsensus(w.ctx, 'FDL', r(10 * D + 45)); w.at(10 * D + 45);
    const a = publishRelease(w.ctx, 'FDL', r(10 * D + 45));
    const ne = w.events.length, nd = { ...w.normals };
    expect(publishRelease(w.ctx, 'FDL', r(10 * D + 45))).toEqual(a); expect(w.events.length).toBe(ne); expect(w.normals).toEqual(nd);
    Object.assign(w.bloc('FDL'), { headlineInflation: 0.05 }); w.at(38 * D + 45);
    const b = publishRelease(w.ctx, 'FDL', r(38 * D + 45));
    expect(b.prior).toBe(a.actual); expect(b.surprise).toBeCloseTo((b.actual - b.consensus) / Math.sqrt(5e-6), 9);
    expect(latestPrint(w.ctx.store, 'FDL', 'CPI')).toMatchObject({ kind: 'CPI', tick: 38 * D + 45, actual: b.actual, consensus: b.consensus, prior: a.actual, surprise: b.surprise });
    expect(releaseRiskReactions(w.ctx.store, 38 * D + 45)).toEqual([{ bloc: 'FDL', kind: 'CPI', releaseId: releaseId(r(38 * D + 45)),
      equityJump: -0.003 * b.surprise, fxValueJump: 0.003 * b.surprise }]);
    expect(releaseRiskReactions(w.ctx.store, 38 * D + 46)).toEqual([]);
    const ev = w.events.filter((e) => e.kind === 'macro.release.published').at(-1)!.payload as { riskReaction: { equityJump: number; fxJump: number } };
    expect(ev.riskReaction).toEqual({ equityJump: -0.003 * b.surprise, fxJump: 0.003 * b.surprise });
    expect(JSON.stringify(w.events)).not.toContain('trueValue');
  });
  it('edge 5: publication needs no market input (a halt cannot delay it): the due list reads only mac.schedule', () => {
    const w = releaseWorld(0); writeQuarterSchedule(w.ctx, 0);
    const before = releasesDue(w.ctx.store, 35 * D + 45);
    w.put(macroTables.inputs.name, { id: 'halt', halted: true } as never);
    expect(releasesDue(w.ctx.store, 35 * D + 45)).toEqual(before);
  });
});
