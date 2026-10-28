// T04-18 04#36. The 50-seed band run (8 kinds × 50 forced runs, ≈ 25 min) is gated by TYCOON_CRISIS_CALIB=1 and runs in the nightly
// macro-calibration workflow; it writes $TYCOON_CRISIS_OUT (default crisis-report.json). The trace fold, band logic and one forced run run in CI.
import { writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../../rules/t03Stubs', () => ({ effectiveMark: vi.fn(() => null), accountsOfEntity: vi.fn(() => []), committedBalance: vi.fn(() => 0n), putFact: vi.fn() }));
vi.mock('../../views/ledgerSources', async (orig) => ({ ...(await orig<object>()), msiValue: vi.fn(() => 0) }));
import { MAJORS } from '../../rules/crisisCatalog';
import { bandHit, checkBands, CRISIS_SEEDS, expectedHooks, foldTrace, forcedRun, KINDS_04_BANDS, metricOf, newTrace, type ForcedRun } from './macro-crisis-calibration';

const day = (o: Partial<{ s10: number[]; srlLn: number; pynLn: number; srlControls: number; head: number; fsi: number }> = {}) =>
  ({ s10: [0.01], srlLn: 0, pynLn: 0, srlControls: 0, head: 0.02, fsi: 0.1, ...o });

describe('04#36 crisis calibration: readings', () => {
  it('the card lists 8 kinds with 04-measured bands', () => {
    expect([...KINDS_04_BANDS].sort()).toEqual(['BANKING_PANIC', 'CURRENCY_CRISIS', 'FUNDING_RUN', 'OIL_SHOCK', 'SECURITIZATION_CRISIS', 'SOVEREIGN_DEBT_CRISIS', 'STAGFLATION', 'TRADE_WAR']);
  });
  it('trace fold: peak s10, fair-value trough as a fraction, SRL control days, headline rise, peak FSI', () => {
    const a = newTrace(day());
    foldTrace(a, day({ s10: [0.02, 0.12], srlLn: Math.log(0.55), pynLn: Math.log(0.9), srlControls: 2, head: 0.055, fsi: 0.75 }));
    foldTrace(a, day({ s10: [0.05], srlLn: Math.log(0.8), pynLn: 0, srlControls: 1, head: 0.03, fsi: 0.4 }));
    foldTrace(a, day({ srlControls: 0 }));
    expect(metricOf(a.t, 's10_peak')).toBe(0.12);
    expect(metricOf(a.t, 'srl_fair_change')).toBeCloseTo(-0.45, 9);
    expect(metricOf(a.t, 'pyn_fair_change')).toBeCloseTo(-0.1, 9);
    expect(metricOf(a.t, 'capital_controls_days')).toBe(2);
    expect(metricOf(a.t, 'headline_change')).toBeCloseTo(0.035, 12);
    expect(metricOf(a.t, 'peak_fsi')).toBe(0.75);
    expect(metricOf(a.t, 'gx_drawdown')).toBeNull();
  });
  it('a 04 band passes at ≥ 70% of runs; other modules\' bands are listed with their module and not judged', () => {
    const band = MAJORS.find((m) => m.kind === 'BANKING_PANIC')!.calibration[0]!;
    expect(bandHit(band, 0.7)).toBe(true); expect(bandHit(band, 0.69)).toBe(false); expect(bandHit(band, null)).toBe(false);
    const run = (fsi: number): ForcedRun => ({ kind: 'BANKING_PANIC', trace: { peakFsi: fsi } } as unknown as ForcedRun);
    const bp = (rs: ForcedRun[]) => checkBands(rs).find((c) => c.kind === 'BANKING_PANIC')!;
    expect(bp([...Array(7)].map(() => run(0.8)).concat([...Array(3)].map(() => run(0.1))))).toMatchObject({ hits: 7, runs: 10, pass: true });
    expect(bp([...Array(6)].map(() => run(0.8)).concat([...Array(4)].map(() => run(0.1))))).toMatchObject({ hits: 6, pass: false });
    const eq = checkBands([]).filter((c) => c.kind === 'EQUITY_BUBBLE_BURST');
    expect(eq.map((c) => [c.metric, c.measuredBy, c.pass])).toEqual([['gx_drawdown', '05', null], ['tech_drawdown', '05', null], ['gold_return', '06', null]]);
  });
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
  it('each 04-measured band hits in ≥ 70% of runs', () => {
    const runs: ForcedRun[] = [];
    for (const k of KINDS_04_BANDS) for (let s = 0; s < CRISIS_SEEDS; s++) runs.push(forcedRun(k, s));
    const checks = checkBands(runs);
    writeFileSync(process.env.TYCOON_CRISIS_OUT ?? 'crisis-report.json', JSON.stringify({ seeds: CRISIS_SEEDS, checks, runs: runs.map((r) => ({ kind: r.kind, seed: r.seed, days: r.days, trace: r.trace })) }, null, 1));
    expect(checks.filter((c) => c.pass === false).map((c) => `${c.kind} ${c.metric} ${c.hits}/${c.runs}`)).toEqual([]);
  }, 7_200_000);
});
