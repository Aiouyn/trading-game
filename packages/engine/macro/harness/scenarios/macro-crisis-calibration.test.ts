// T04-18 04#36. The 50-seed band run (8 kinds × 50 forced runs, ≈ 25 min) is gated by TYCOON_CRISIS_CALIB=1 and runs in the nightly
// macro-calibration workflow, with the OIL_SHOCK warm-up run (E-104); it writes $TYCOON_CRISIS_OUT (default crisis-report.json). The trace fold, band logic and one forced run run in CI.
import { writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../../rules/t03Stubs', () => ({ effectiveMark: vi.fn(() => null), accountsOfEntity: vi.fn(() => []), committedBalance: vi.fn(() => 0n), putFact: vi.fn() }));
vi.mock('../../views/ledgerSources', async (orig) => ({ ...(await orig<object>()), msiValue: vi.fn(() => 0) }));
import { MAJORS } from '../../rules/crisisCatalog';
import { TICKS_PER_GAME_DAY as D } from '@tycoon/engine-core';
import { defaultMacroPorts } from '../../ports';
import { macroTables, type HookCall, type WorldEvent } from '../../schema';
import { macroWorld } from '../../testkit/macroWorld';
import { bandHit, checkBands, CRISIS_SEEDS, CURRENCY_PASS_RUNS, currencyCrisisHit, CURRENCY_BREAK_BY_CLOSE, expectedHooks, foldTrace, forcedRun, judgeWarm, KINDS_04_BANDS, metricOf, newTrace, ref06Ports, ref16Ports, WARM_DAYS, WARM_KINDS, type ForcedRun } from './macro-crisis-calibration';

const day = (o: Partial<{ s10: number[]; srlLn: number; pynLn: number; srlControls: number; head: number; fsi: number; pie1: number }> = {}) =>
  ({ s10: [0.01], srlLn: 0, pynLn: 0, srlControls: 0, head: 0.02, fsi: 0.1, pie1: 0.02, ...o });

describe('04#36 crisis calibration: readings', () => {
  it('E-104 (1): 5 kinds with 04-measured bands; OIL_SHOCK (06) runs on the warm-up path', () => {
    expect([...KINDS_04_BANDS].sort()).toEqual(['BANKING_PANIC', 'CURRENCY_CRISIS', 'SOVEREIGN_DEBT_CRISIS', 'STAGFLATION', 'TRADE_WAR']);
    expect(WARM_KINDS).toEqual(['OIL_SHOCK']); expect(WARM_DAYS).toBe(364);
    const warm = checkBands([], judgeWarm).filter((c) => c.pass !== null).map((c) => [c.kind, c.metric, c.measuredBy]);
    expect(warm).toEqual([['OIL_SHOCK', 'headline_change', '06']]);
  });
  it('trace fold: peak s10, fair-value trough as a fraction, SRL control days, headline rise, peak FSI', () => {
    const a = newTrace(day());
    foldTrace(a, day({ s10: [0.02, 0.12], srlLn: Math.log(0.55), pynLn: Math.log(0.9), srlControls: 2, head: 0.055, fsi: 0.75, pie1: 0.041 }));
    foldTrace(a, day({ s10: [0.05], srlLn: Math.log(0.8), pynLn: 0, srlControls: 1, head: 0.03, fsi: 0.4, pie1: 0.03 }));
    foldTrace(a, day({ srlControls: 0 }));
    expect(metricOf(a.t, 's10_peak')).toBe(0.12);
    expect(metricOf(a.t, 'srl_fair_change')).toBeCloseTo(-0.45, 9);
    expect(metricOf(a.t, 'pyn_fair_change')).toBeCloseTo(-0.1, 9);
    expect(metricOf(a.t, 'capital_controls_days')).toBe(2);
    expect(metricOf(a.t, 'headline_change')).toBeCloseTo(0.035, 12);
    expect(metricOf(a.t, 'peak_fsi')).toBe(0.75);
    expect(metricOf(a.t, 'pie1_rise')).toBeCloseTo(0.021, 12);
    expect(metricOf(a.t, 'gx_drawdown')).toBeNull();
  });
  it('a 04 band passes at ≥ 70% of runs; other modules\' bands are listed with their module and not judged', () => {
    const band = MAJORS.find((m) => m.kind === 'BANKING_PANIC')!.calibration[0]!;
    expect(band.lo).toBe(0.195); expect(bandHit(band, 0.195)).toBe(true); expect(bandHit(band, 0.19)).toBe(false); expect(bandHit(band, null)).toBe(false);
    const run = (fsi: number): ForcedRun => ({ kind: 'BANKING_PANIC', trace: { peakFsi: fsi } } as unknown as ForcedRun);
    const bp = (rs: ForcedRun[]) => checkBands(rs).find((c) => c.kind === 'BANKING_PANIC')!;
    expect(bp([...Array(7)].map(() => run(0.8)).concat([...Array(3)].map(() => run(0.1))))).toMatchObject({ hits: 7, runs: 10, pass: true });
    expect(bp([...Array(6)].map(() => run(0.8)).concat([...Array(4)].map(() => run(0.1))))).toMatchObject({ hits: 6, pass: false });
    expect(checkBands([]).filter((c) => c.kind === 'BANKING_PANIC').map((c) => [c.measuredBy, c.pass])).toEqual([['04', false], ['07', null]]);
    expect(checkBands([]).find((c) => c.kind === 'OIL_SHOCK')!.pass).toBeNull();
    const eq = checkBands([]).filter((c) => c.kind === 'EQUITY_BUBBLE_BURST');
    expect(eq.map((c) => [c.metric, c.measuredBy, c.pass])).toEqual([['gx_drawdown', '05', null], ['tech_drawdown', '05', null], ['gold_return', '06', null]]);
  });
  it('ref06Ports: CRUDE = 100 × (1 + 10 × Σ −pct of the active commoditySupplyShock hooks); GOLD keeps the base port', () => {
    const st = macroWorld('ref06', 0).store;
    st.put(macroTables.global.name, { id: 'GLOBAL', tick: 1000 });
    const hk = (id: string, c: string, pct: number, startTick: number, days: number) =>
      st.put<HookCall>(macroTables.hookCall.name, { id, owner: '06', hook: 'commoditySupplyShock', args: { commodityId: c, pct, days }, startTick, worldEventId: 'e' } as unknown as HookCall);
    hk('a', 'CRUDE', -0.02, 0, 2); hk('b', 'CRUDE', -0.08, 280, 1); hk('c', 'CRUDE', -0.5, 1001, 9); hk('d', 'GAS', -0.05, 0, 9);
    const p = ref06Ports();
    expect(p.assets.commodityClose(st, 'CRUDE')).toBeCloseTo(100 * (1 + 10 * 0.02), 9);   // b ended at 1000 (280 + 720), c not started
    expect(p.assets.commodityClose(st, 'GAS')).toBeCloseTo(150, 9);
    expect(p.assets.commodityClose(st, 'WHEAT')).toBe(100);
    expect(p.assets.commodityClose(st, 'GOLD')).toBeNull();
  });
  it('E-108 (4) ref16Ports: politicalStability = 0.7 + Σ delta of the bloc\'s active politicalStabilityShock hooks, clamped [0, 1]; other blocs and no hooks → 0.7', () => {
    const st = macroWorld('ref16', 0).store;
    st.put(macroTables.global.name, { id: 'GLOBAL', tick: 1000 });
    const hk = (id: string, bloc: string, delta: number, startTick: number, days: number) =>
      st.put<HookCall>(macroTables.hookCall.name, { id, owner: '16', hook: 'politicalStabilityShock', args: { bloc, delta, days }, startTick, worldEventId: 'e' } as unknown as HookCall);
    const p = ref16Ports();
    expect(p.world.politicalStability(st, 'SRL')).toBeCloseTo(0.7, 12);
    hk('a', 'SRL', -0.1, 0, 2); hk('b', 'SRL', -0.3, 280, 1); hk('c', 'SRL', -0.2, 1001, 9); hk('d', 'EUN', -0.3, 0, 9);
    expect(p.world.politicalStability(st, 'SRL')).toBeCloseTo(0.6, 12);   // b ended at 1000 (280 + 720), c not started
    expect(p.world.politicalStability(st, 'EUN')).toBeCloseTo(0.4, 12);
    expect(p.world.politicalStability(st, 'PYN')).toBeCloseTo(0.7, 12);
    hk('e', 'EUN', -0.9, 0, 9); hk('f', 'PYN', 0.9, 0, 9);
    expect(p.world.politicalStability(st, 'EUN')).toBe(0); expect(p.world.politicalStability(st, 'PYN')).toBe(1);
    expect(ref16Ports(ref06Ports()).assets.commodityClose(st, 'WHEAT')).toBe(100);   // composes with the 06 stub
  });
  it('E-109 (2) ref16Ports ps16after: trigger hook −0.3 for 63 d from tick 0, event ENDED at day 30; end (default) drops it at ENDED, fade goes linearly to 0 at day 63', () => {
    const at = (mode: 'end' | 'fade' | undefined, day: number, ended = true): number => {
      const st = macroWorld('ref16-e109', 0).store;
      st.put(macroTables.global.name, { id: 'GLOBAL', tick: Math.round(day * D) });
      st.put<HookCall>(macroTables.hookCall.name, { id: 'h', owner: '16', hook: 'politicalStabilityShock', args: { bloc: 'SRL', delta: -0.3, days: 63 }, startTick: 0, worldEventId: 'e1' } as unknown as HookCall);
      st.put(macroTables.event.name, { id: 'e1', phase: ended ? 'ENDED' : 'RECOVERY', phaseSinceTick: 30 * D } as unknown as WorldEvent);
      return +ref16Ports(defaultMacroPorts(), mode ? { ps16after: mode } : {}).world.politicalStability(st, 'SRL')!.toFixed(4);
    };
    expect([10, 29.99, 30, 46.5, 63].map((d) => at(undefined, d))).toEqual([0.4, 0.4, 0.7, 0.7, 0.7]);
    expect([10, 29.99, 30, 46.5, 63].map((d) => at('end', d))).toEqual([0.4, 0.4, 0.7, 0.7, 0.7]);
    expect([10, 30, 46.5, 63].map((d) => at('fade', d))).toEqual([0.4, 0.4, 0.55, 0.7]);
    expect([31, 62.99].map((d) => at('end', d, false))).toEqual([0.4, 0.4]);   // not ENDED: the hook's own 63-day window
  });
  it('E-108 (5) SOVEREIGN_DEBT_CRISIS seed 0 with ref16Ports: s10_peak ≥ 0.10 and the multiplier ends at ENDED', () => {
    const r = forcedRun('SOVEREIGN_DEBT_CRISIS', 0, { ports: ref16Ports() });
    process.stdout.write(`SDC seed 0: s10Peak ${r.trace.s10Peak} days ${r.days} phase ${r.ev.phase}\n`);
    expect(r.ev.phase).toBe('ENDED');
    expect(bandHit(MAJORS.find((m) => m.kind === 'SOVEREIGN_DEBT_CRISIS')!.calibration[0]!, r.trace.s10Peak)).toBe(true);
  }, 120_000);
  it('E-107 (1) 04#36 run predicate (pending Producer ruling): arm close in [24, 30]; next SRL trading day is the break or a BREAK_PENDING Concord, then the next arming breaks on the following trading day; first break by close 40; controls ≥ 3, fair ≤ −0.40', () => {
    const tr = { ...newTrace(day()).t, srlControlDays: 3, srlFairMin: -0.4 };
    // SRL days 26, 27 are the weekend: the trading day after day 25 is 28
    const direct = { srlArms: [{ close: 24, day: 25 }], srlConcordDays: [] as number[], srlBreakDay: 28, srlBreakClose: 27, trace: tr };
    expect(currencyCrisisHit(direct)).toBe(true);
    expect(currencyCrisisHit({ ...direct, srlArms: [{ close: 30, day: 25 }] })).toBe(true);
    expect(currencyCrisisHit({ ...direct, srlArms: [{ close: 23, day: 25 }] })).toBe(false);
    expect(currencyCrisisHit({ ...direct, srlArms: [{ close: 31, day: 25 }] })).toBe(false);
    expect(currencyCrisisHit({ ...direct, srlArms: [] })).toBe(false);
    expect(currencyCrisisHit({ ...direct, srlBreakDay: 29 })).toBe(false);
    expect(currencyCrisisHit({ ...direct, srlBreakDay: null, srlBreakClose: null })).toBe(false);
    expect(currencyCrisisHit({ ...direct, trace: { ...tr, srlControlDays: 2 } })).toBe(false);
    expect(currencyCrisisHit({ ...direct, trace: { ...tr, srlFairMin: -0.39 } })).toBe(false);
    // Concord path (Quant's measured shape: arm 27, Concord 28, re-arm 34, break 35; days = closes here)
    const concord = { srlArms: [{ close: 27, day: 27 }, { close: 34, day: 34 }], srlConcordDays: [28], srlBreakDay: 35, srlBreakClose: 35, trace: tr };
    expect(currencyCrisisHit(concord)).toBe(true);
    expect(currencyCrisisHit({ ...concord, srlConcordDays: [] })).toBe(false);                                     // next day neither break nor Concord
    expect(currencyCrisisHit({ ...concord, srlConcordDays: [29] })).toBe(false);                                   // Concord not on the next trading day
    expect(currencyCrisisHit({ ...concord, srlBreakDay: 36, srlBreakClose: 36 })).toBe(false);                     // re-arm did not break the next trading day
    expect(currencyCrisisHit({ ...concord, srlArms: [concord.srlArms[0]!] })).toBe(false);                         // no re-arm
    // SRL days 40, 41 are the weekend: re-arm on day 38 breaks on 39 (by close 40); re-arm on 39 breaks on 42 (after close 40)
    expect(currencyCrisisHit({ ...concord, srlArms: [concord.srlArms[0]!, { close: 38, day: 38 }], srlBreakDay: 39, srlBreakClose: 39 })).toBe(true);
    expect(currencyCrisisHit({ ...concord, srlArms: [concord.srlArms[0]!, { close: 39, day: 39 }], srlBreakDay: 42, srlBreakClose: 42 })).toBe(false);
    expect(CURRENCY_BREAK_BY_CLOSE).toBe(40);
    expect(CURRENCY_PASS_RUNS).toBe(35);
  });
  it('E-107 (1) CURRENCY_CRISIS seed 0, no harness arm: SRL arms naturally on a forced close in [24, 30] and meets the Concord-path predicate', () => {
    const r = forcedRun('CURRENCY_CRISIS', 0);
    process.stdout.write(`CC seed 0: arms ${JSON.stringify(r.srlArms)} concord ${JSON.stringify(r.srlConcordDays)} break day ${r.srlBreakDay} close ${r.srlBreakClose} controls ${r.trace.srlControlDays} fair ${r.trace.srlFairMin}\n`);
    expect(r.srlArms[0]!.close).toBeGreaterThanOrEqual(24); expect(r.srlArms[0]!.close).toBeLessThanOrEqual(30);
    expect(currencyCrisisHit(r)).toBe(true);
  }, 120_000);
  it('one forced SECURITIZATION_CRISIS runs to ENDED and writes the §3.16.4 hook calls with its event id', () => {
    const r = forcedRun('SECURITIZATION_CRISIS', 0);
    expect(r.ev.phase).toBe('ENDED');
    expect(r.hooks.length).toBeGreaterThan(0);
    for (const x of r.hooks) expect(x.worldEventId).toBe(r.ev.id);
    const got = r.hooks.map((x) => ({ owner: x.owner, hook: x.hook, args: x.args }));
    for (const e of expectedHooks('SECURITIZATION_CRISIS', r.ev.blocs[0]!)) expect(got).toContainEqual(e);
    // E-106 (8) / E-107: with genesis politicalStability 0.7 and 07 stubbed, the only FSI input here is sovStressMax, which stays 0 for this
    // kind (seed 0: 0 vs 0.047 at politicalStability 0). SECURITIZATION's peak_fsi bands are 07/08-measured, so 04 only checks it is read.
    expect(Number.isFinite(r.trace.peakFsi)).toBe(true); expect(r.trace.peakFsi).toBeGreaterThanOrEqual(0);
  }, 120_000);
});

describe.skipIf(process.env.TYCOON_CRISIS_CALIB !== '1')(`04#36 crisis calibration (${CRISIS_SEEDS} forced runs per kind, nightly)`, () => {
  it('each 04-measured band, and OIL_SHOCK (06 stub, 364 warm-up days), hits in ≥ 70% of runs', async () => {
    const runs: ForcedRun[] = [];
    for (const k of KINDS_04_BANDS) for (let s = 0; s < CRISIS_SEEDS; s++) { runs.push(forcedRun(k, s, { ports: ref16Ports() })); await new Promise((r) => setTimeout(r, 0)); }   // keep the worker RPC alive
    const checks = checkBands(runs), warm: ForcedRun[] = [];
    const cc = runs.filter((r) => r.kind === 'CURRENCY_CRISIS'), ccHits = cc.filter(currencyCrisisHit).length;   // E-107 (1) 04#36 text (pending Producer ruling)
    checks.push({ kind: 'CURRENCY_CRISIS', metric: 'arm_24_30_break_or_concord_break_by_40', measuredBy: '04', hits: ccHits, runs: cc.length, pass: ccHits >= CURRENCY_PASS_RUNS });
    for (const k of WARM_KINDS) for (let s = 0; s < CRISIS_SEEDS; s++) { warm.push(forcedRun(k, s, { warmDays: WARM_DAYS, ports: ref16Ports(ref06Ports()) })); await new Promise((r) => setTimeout(r, 0)); }
    checks.push(...checkBands(warm, judgeWarm).filter((c) => c.pass !== null));
    runs.push(...warm);
    writeFileSync(process.env.TYCOON_CRISIS_OUT ?? 'crisis-report.json', JSON.stringify({ seeds: CRISIS_SEEDS, checks, runs: runs.map((r) => ({ kind: r.kind, seed: r.seed, days: r.days, trace: r.trace, srlArms: r.srlArms, srlConcordDays: r.srlConcordDays, srlBreakDay: r.srlBreakDay, srlBreakClose: r.srlBreakClose })) }, null, 1));
    expect(checks.filter((c) => c.pass === false).map((c) => `${c.kind} ${c.metric} ${c.hits}/${c.runs}`)).toEqual([]);
  }, 7_200_000);
});
