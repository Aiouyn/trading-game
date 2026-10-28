// T04-18 04#36. The 50-seed band run (8 kinds × 50 forced runs, ≈ 25 min) is gated by TYCOON_CRISIS_CALIB=1 and runs in the nightly
// macro-calibration workflow, with the OIL_SHOCK warm-up run (E-104); it writes $TYCOON_CRISIS_OUT (default crisis-report.json). The trace fold, band logic and one forced run run in CI.
import { writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../../rules/t03Stubs', () => ({ effectiveMark: vi.fn(() => null), accountsOfEntity: vi.fn(() => []), committedBalance: vi.fn(() => 0n), putFact: vi.fn() }));
vi.mock('../../views/ledgerSources', async (orig) => ({ ...(await orig<object>()), msiValue: vi.fn(() => 0) }));
import { MAJORS } from '../../rules/crisisCatalog';
import { macroTables, type HookCall } from '../../schema';
import { macroWorld } from '../../testkit/macroWorld';
import { bandHit, checkBands, CRISIS_SEEDS, expectedHooks, foldTrace, forcedRun, judgeWarm, KINDS_04_BANDS, metricOf, newTrace, ref06Ports, WARM_DAYS, WARM_KINDS, type ForcedRun } from './macro-crisis-calibration';

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
    expect(band.lo).toBe(0.28); expect(bandHit(band, 0.28)).toBe(true); expect(bandHit(band, 0.27)).toBe(false); expect(bandHit(band, null)).toBe(false);
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
  it('E-104 (1) CURRENCY_CRISIS: SRL armed before close 16 after forcing breaks on that close; unarmed it does not', () => {
    expect(forcedRun('CURRENCY_CRISIS', 0, { maxDays: 15 }).trace.srlControlDays).toBe(0);
    expect(forcedRun('CURRENCY_CRISIS', 0, { maxDays: 16 }).trace.srlControlDays).toBe(1);
    expect(forcedRun('CURRENCY_CRISIS', 0, { maxDays: 20, armSrlDay: null }).trace.srlControlDays).toBe(0);
  }, 120_000);
  it('one forced SECURITIZATION_CRISIS runs to ENDED and writes the §3.16.4 hook calls with its event id', () => {
    const r = forcedRun('SECURITIZATION_CRISIS', 0);
    expect(r.ev.phase).toBe('ENDED');
    expect(r.hooks.length).toBeGreaterThan(0);
    for (const x of r.hooks) expect(x.worldEventId).toBe(r.ev.id);
    const got = r.hooks.map((x) => ({ owner: x.owner, hook: x.hook, args: x.args }));
    for (const e of expectedHooks('SECURITIZATION_CRISIS', r.ev.blocs[0]!)) expect(got).toContainEqual(e);
    expect(r.trace.peakFsi).toBeGreaterThan(0);
  }, 120_000);
});

describe.skipIf(process.env.TYCOON_CRISIS_CALIB !== '1')(`04#36 crisis calibration (${CRISIS_SEEDS} forced runs per kind, nightly)`, () => {
  it('each 04-measured band, and OIL_SHOCK (06 stub, 364 warm-up days), hits in ≥ 70% of runs', async () => {
    const runs: ForcedRun[] = [];
    for (const k of KINDS_04_BANDS) for (let s = 0; s < CRISIS_SEEDS; s++) { runs.push(forcedRun(k, s)); await new Promise((r) => setTimeout(r, 0)); }   // keep the worker RPC alive
    const checks = checkBands(runs), warm: ForcedRun[] = [];
    for (const k of WARM_KINDS) for (let s = 0; s < CRISIS_SEEDS; s++) { warm.push(forcedRun(k, s, { warmDays: WARM_DAYS, ports: ref06Ports() })); await new Promise((r) => setTimeout(r, 0)); }
    checks.push(...checkBands(warm, judgeWarm).filter((c) => c.pass !== null));
    runs.push(...warm);
    writeFileSync(process.env.TYCOON_CRISIS_OUT ?? 'crisis-report.json', JSON.stringify({ seeds: CRISIS_SEEDS, checks, runs: runs.map((r) => ({ kind: r.kind, seed: r.seed, days: r.days, trace: r.trace })) }, null, 1));
    expect(checks.filter((c) => c.pass === false).map((c) => `${c.kind} ${c.metric} ${c.hits}/${c.runs}`)).toEqual([]);
  }, 7_200_000);
});
