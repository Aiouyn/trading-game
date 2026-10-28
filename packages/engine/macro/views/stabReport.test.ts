import { calendarOf } from '@tycoon/engine-core';
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { assertNoHiddenFields, MACRO_EVENTS } from '../events';
import { macroTables } from '../schema';
import { lev, seed03, setNow, viewWorld } from '../testkit/viewWorld';
import { formatMoneyVsPath, leverDirection, mirrorStabilizer, moneyIndex, publishMsi, reportPayload, weeklyStabReport, NULL_STAB_REPORT, type StabWeeklyReport } from './stabReport';

const D = 720;
const pewPort = (pew: string) => ({ latestDailyReport: () => ({ pew }) as never });
function at(tick: number, lastDay = Math.floor(tick / D) - 1) {
  const w = viewWorld(tick); seed03(w, Math.max(lastDay, 0)); setNow(w, tick); return w;
}

describe('T04-19 weekly report', () => {
  it('04#38: the report shows exactly 03’s levers and e for day 13 (tick 10125); macro.stab.report parses', () => {
    const w = at(10125), r = weeklyStabReport(w.ctx, pewPort('2000000000000000000'))!;
    const h = (w.ctx.store.get<{ history: { dayIndex: number; e: number; levers: Record<string, number> }[] }>('led.stab', 'world'))!.history.find((x) => x.dayIndex === 13)!;
    expect(r.dayIndex).toBe(13);
    expect(r.e === h.e).toBe(true);
    for (const k of ['L1_demand', 'L2_lifestyle_price', 'L3_levy_bp', 'L4_upkeep']) expect(r.levers[k]!.value === h.levers[k]).toBe(true);
    expect(r.levers.L1_demand!.direction).toBe(1);   // 1.13 vs 1.06
    expect(r.levers.L2_lifestyle_price!.direction).toBe(0);
    const ev = w.events.filter((e) => e.kind === 'macro.stab.report');
    expect(ev).toHaveLength(1);
    expect(ev[0]!.vis).toBe('PUBLIC');
    expect(MACRO_EVENTS['macro.stab.report']!.parse(ev[0]!.payload)).toEqual(ev[0]!.payload);
    expect(r.npcToPlayerWealthRatio).toBe(50);   // 1e20 / 2e18
    expect(r.crisisCountChapter).toBe(2);
    const st = w.ctx.store.get<{ lastPublishedReportTick: number; diagnostics: { netMintWeek: bigint; m0Index: number } }>(macroTables.stab.name, 'STAB')!;
    expect(st.lastPublishedReportTick).toBe(10125);
    expect(st.diagnostics.netMintWeek).toBe(4200000000n);
  });
  it('04#38 static: no controller, lever bounds or writes to led.stab* in packages/engine/macro (non-test)', () => {
    const files: string[] = [];
    const walk = (d: string): void => { for (const f of readdirSync(d)) { const p = join(d, f); if (f === 'node_modules' || f === 'testkit') continue;   // testkit seeds 03's rows in place of T03-24
      if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) files.push(p); } };
    walk(join(__dirname, '..'));
    const bad = /controllerStep|stab_kp|stab_ki|stab_deadband|stab_lever_ranges|put\(\s*['"`]led\.stab|put\(\s*LED_STAB/;
    expect(files.length).toBeGreaterThan(50);
    expect(files.filter((f) => bad.test(readFileSync(f, 'utf8')))).toEqual([]);
  });
  it('report ticks: 5085 (day 7) and 10125 (day 14); none on day 0, other weekdays or ticks', () => {
    expect(calendarOf(5085).weekday).toBe(calendarOf(10125).weekday);
    expect(calendarOf(5085).tickOfDay).toBe(45);
    for (const t of [5085, 10125]) expect(weeklyStabReport(at(t).ctx, NULL_STAB_REPORT)).not.toBeNull();
    for (const t of [45, 5084, 5086, 5085 + D, 5085 - D, 10125 + 3 * D, 7 * D]) {
      const w = at(t, Math.max(Math.floor(t / D) - 1, 0));
      expect(weeklyStabReport(w.ctx, NULL_STAB_REPORT)).toBeNull();
      expect(w.events.filter((e) => e.kind === 'macro.stab.report')).toEqual([]);
    }
  });
  it('null port keeps the previous npcToPlayerWealthRatio', () => {
    const w = at(10125);
    w.put(macroTables.stab.name, { id: 'STAB', levers: lev(1), integral: 0, msi: 1, errorLog: 0, lastPublishedReportTick: 5085,
      diagnostics: { faucetsWeek: 0n, sinksWeek: 0n, netMintWeek: 0n, npcToPlayerWealthRatio: 33, m0Index: 100, m2Index: 100 } } as never);
    expect(weeklyStabReport(w.ctx, NULL_STAB_REPORT)!.npcToPlayerWealthRatio).toBe(33);
  });
  it('formatMoneyVsPath: +12%, -3%, +0%, +13% (half away from zero)', () => {
    expect(formatMoneyVsPath(0.12)).toBe('Money vs designed path: +12%');
    expect(formatMoneyVsPath(-0.034)).toBe('Money vs designed path: -3%');
    expect(formatMoneyVsPath(0)).toBe('Money vs designed path: +0%');
    expect(formatMoneyVsPath(0.125)).toBe('Money vs designed path: +13%');
    expect(formatMoneyVsPath(-0.125)).toBe('Money vs designed path: -13%');
    expect(formatMoneyVsPath(-0.004)).toBe('Money vs designed path: +0%');
  });
  it('net mint: 7 days of FAUCET 1e9 / SINK 4e8 → 7000000000 / 2800000000 / 4200000000; indices 102.5 and 98', () => {
    const r = weeklyStabReport(at(10125).ctx, NULL_STAB_REPORT)!;
    expect(r.faucetsWeek).toEqual({ FAUCET: '7000000000' });
    expect(r.sinksWeek).toEqual({ SINK: '2800000000' });
    expect(r.netMintWeek).toBe('4200000000');
    expect(r.m0Index).toBe(102.5);
    expect(r.m2Index).toBe(98);
    expect(moneyIndex(5n, 0n)).toBe(100);
  });
  it('net mint counts only FlowDay rows that exist (D−6..D) and may be negative', () => {
    const w = viewWorld(5085); seed03(w, 6, false); setNow(w, 5085);
    w.put('led.flowday', { id: 'FDL:6', ccy: 'FDL', dayIndex: 6, byClass: { FAUCET: '1', SINK: '10' }, M0: '1', M2: '1' } as never);
    w.put('led.flowday', { id: 'EUN:6', ccy: 'EUN', dayIndex: 6, byClass: { FAUCET: '999' }, M0: '1', M2: '1' } as never);
    const r = weeklyStabReport(w.ctx, NULL_STAB_REPORT)!;
    expect(r.netMintWeek).toBe('-9');
    expect(r.levers.L1_demand!.direction).toBe(0);   // D − 7 < 0
  });
  it('leverDirection', () => {
    expect(leverDirection(1.05, 1.0)).toBe(1); expect(leverDirection(1, 1)).toBe(0); expect(leverDirection(0.98, 1)).toBe(-1);
  });
  it('schema scan: no id/name keys other than dayIndex in the report or its event payload', () => {
    const r = weeklyStabReport(at(10125).ctx, NULL_STAB_REPORT)!;
    const keys: string[] = [];
    const walk = (v: unknown): void => { if (v && typeof v === 'object') for (const k of Object.getOwnPropertyNames(v)) { keys.push(k); walk((v as Record<string, unknown>)[k]); } };
    walk(r); walk(reportPayload(r));
    expect(keys.filter((k) => /id$|Id$|name/i.test(k) && k !== 'dayIndex')).toEqual([]);
    expect(assertNoHiddenFields(reportPayload(r))).toEqual([]);
  });
  it('payload maps directions to UP/DOWN/FLAT', () => {
    const r: StabWeeklyReport = { dayIndex: 1, msi: 1, e: 0, eLabel: '', faucetsWeek: {}, sinksWeek: {}, netMintWeek: '0', m0Index: 100, m2Index: 100, npcToPlayerWealthRatio: 0,
      crisisCountChapter: 0, levers: { L1_demand: { value: 1, direction: 1 }, L2_lifestyle_price: { value: 1, direction: -1 }, L3_levy_bp: { value: 0, direction: 0 }, L4_upkeep: { value: 1, direction: 0 } } };
    expect((reportPayload(r) as { leverDirections: unknown }).leverDirections).toEqual({ L1_demand: 'UP', L2_lifestyle_price: 'DOWN', L3_levy_bp: 'FLAT', L4_upkeep: 'FLAT' });
  });
});

describe('T04-19 mirror and MSI', () => {
  it('mirrorStabilizer copies 03 levers, integral, msi and the latest e; no write to led.*', () => {
    const w = at(10080, 13), before = JSON.parse(JSON.stringify(w.ctx.store.get('led.stab', 'world')));
    const s = mirrorStabilizer(w.ctx);
    expect(s.levers).toEqual(lev(1.13));
    expect(s.integral).toBe(0.07); expect(s.msi).toBe(1.2345); expect(s.errorLog).toBe(0.013);
    expect(w.ctx.store.get(macroTables.stab.name, 'STAB')).toEqual(s);
    expect(w.ctx.store.get('led.stab', 'world')).toEqual(before);
  });
  it('04#39: macro.stab.msi equals 03’s MSI each day; NWI order equals NW order', () => {
    const w = at(720, 0);
    for (let d = 0; d < 30; d++) {
      const msi = 1 + d / 1000;
      w.put('led.msi', { id: 'world', dayIndex: d, raw: msi, ema: msi, emaBaseSum: 0, emaBaseN: 0, msi } as never);
      expect(publishMsi(w.ctx)).toBe(msi);
      const ev = w.events[w.events.length - 1]!;
      expect(ev.kind).toBe('macro.stab.msi'); expect(ev.vis).toBe('PUBLIC');
      expect(MACRO_EVENTS['macro.stab.msi']!.parse(ev.payload)).toEqual({ msi });
    }
    const nw = [50, 10, 40, 20, 30], m = 1.2345, order = (xs: number[]) => xs.map((x, i) => [x, i]).sort((a, b) => b[0]! - a[0]!).map((x) => x[1]);
    expect(order(nw.map((x) => x / m))).toEqual(order(nw));
  });
});
