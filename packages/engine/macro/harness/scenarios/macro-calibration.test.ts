// T04-20 nightly calibration (04#4, 6, 24, 27, 32). CI: the fold and band logic on synthetic closes. Nightly (TYCOON_CALIB=1, the
// macro-calibration workflow): seeds CALIB_SEED_FROM..CALIB_SEED_TO (inclusive) × CALIB_DAYS, one JSON per seed into CALIB_OUT;
// CALIB_AGG=<dir> pools every seed JSON there and asserts the five bands.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { aggregate, CALIB_DAYS, finishAcc, finishSeed, foldDay, newAcc, startSeed, stepSeed, type BlocSample, type DaySample, type SeedResult } from './macro-calibration';
import { BLOC_ORDER, macroTables, type HookCall, type Regime } from '../../schema';
vi.mock('../../rules/t03Stubs', () => ({ effectiveMark: vi.fn(() => null), accountsOfEntity: vi.fn(() => []), committedBalance: vi.fn(() => 0n), putFact: vi.fn() }));
vi.mock('../../views/ledgerSources', async (orig) => ({ ...(await orig<object>()), msiValue: vi.fn(() => 0) }));  // MISSING EXPORT T03-24 led.msi

const env = process.env;
const blocs = (o: Partial<BlocSample> & { reg?: Regime } = {}, srl: Partial<BlocSample> = {}): BlocSample[] =>
  BLOC_ORDER.map((b) => ({ b, reg: 'EXPANSION', y3m: 0.03, y10: 0.04, spot: 1, rate: 0.03, grace: false, trading: true, ...o, ...(b === 'SRL' ? srl : {}) }));
const day = (d: number, o: Partial<DaySample> = {}, b: BlocSample[] = blocs()): DaySample => ({ day: d, gReg: 'EXPANSION', fear: 25, calm: true, majorContagion: [], blocs: b, ...o });
const run = (xs: DaySample[]): SeedResult => { const a = newAcc(xs[0]!); for (const x of xs) foldDay(a, x); return finishAcc(0, xs.length, a); };

describe('macro-calibration fold', () => {
  it('04#4: spell lengths pooled per regime; a transition off ALLOWED counts as a bad edge', () => {
    const xs = [...Array.from({ length: 10 }, (_, d) => day(d)), ...Array.from({ length: 4 }, (_, i) => day(10 + i, { gReg: 'OVERHEATING' })), day(14, { gReg: 'RECOVERY' })];
    const r = run(xs);
    expect(r.spells.EXPANSION).toEqual({ n: 1, sum: 10 });
    expect(r.spells.OVERHEATING).toEqual({ n: 1, sum: 4 });
    expect(r.badEdges).toBe(1);   // OVERHEATING → RECOVERY is not allowed
  });
  it('04#6: a 63-trading-day inversion precedes the CONTRACTION entry; 62 days does not; non-trading days do not count', () => {
    const inv = (n: number, gap: number[] = []) => {
      const xs: DaySample[] = [];
      for (let d = 0; d < n + gap.length; d++) xs.push(day(d, {}, blocs({ y10: 0.02, trading: !gap.includes(d) })));
      xs.push(day(n + gap.length, {}, blocs({ reg: 'CONTRACTION', y10: 0.02 })));
      return run(xs);
    };
    expect(inv(63)).toMatchObject({ conEntries: 5, conPreceded: 5 });
    expect(inv(62)).toMatchObject({ conEntries: 5, conPreceded: 0 });
    expect(inv(62, [5])).toMatchObject({ conPreceded: 0 });
    // ended run: counts within 364 days of the entry, not after
    const ended = (after: number) => {
      const xs: DaySample[] = [];
      for (let d = 0; d < 70; d++) xs.push(day(d, {}, blocs({ y10: 0.02 })));
      for (let d = 70; d < 70 + after; d++) xs.push(day(d));
      xs.push(day(70 + after, {}, blocs({ reg: 'CONTRACTION' })));
      return run(xs);
    };
    expect(ended(363).conPreceded).toBe(5);   // last inverted day 69, entry day 433: 364 days
    expect(ended(364).conPreceded).toBe(0);
  });
  it('04#24: GRACE is recorded per FU/NA/SC alias', () => {
    expect(run([day(0), day(1, {}, blocs({}, { grace: true }))]).grace).toEqual({ FU: false, NA: false, SC: true });
  });
  it('04#27: carry r = (1 + i_SRL/364)·S_t/S_{t−1} − (1 + i_FDL/364); worst 5-day compounded loss', () => {
    const r1 = run([day(0, {}, blocs({ rate: 0.01 }, { rate: 0.10, spot: 0.2 })), day(1, {}, blocs({ rate: 0.01 }, { rate: 0.10, spot: 0.2 }))]);
    expect(r1.carryMean).toBeCloseTo(0.09 / 364, 12);
    const xs = [0.2, 0.19, 0.18, 0.17, 0.16, 0.15].map((s, d) => day(d, {}, blocs({ rate: 0 }, { rate: 0, spot: s })));
    expect(run(xs).carryWorst5d).toBeCloseTo(0.15 / 0.2 - 1, 12);
  });
  it('04#32: calm-expansion days in [15, 35]; a CONTAGION phase passes on its peak > 60', () => {
    const r = run([day(0, { fear: 15 }), day(1, { fear: 35 }), day(2, { fear: 36 }), day(3, { fear: 10, calm: false }), day(4, { fear: 50, gReg: 'OVERHEATING' }),
      day(5, { majorContagion: ['m1'], fear: 55 }), day(6, { majorContagion: ['m1'], fear: 61 }), day(7, { majorContagion: ['m2'], fear: 60 })]);
    expect([r.calmDays, r.calmInBand]).toEqual([6, 2]);   // calm-expansion days 0, 1, 2, 5, 6, 7; in band: 15 and 35
    expect([r.contagionPhases, r.contagionOver60]).toEqual([2, 1]);
  });
  it('aggregate: bands pass on target data and fail on empty data', () => {
    const good: SeedResult = { seed: 0, days: 3640, spells: { EXPANSION: { n: 2, sum: 1638 }, OVERHEATING: { n: 1, sum: 300 }, CONTRACTION: { n: 1, sum: 250 }, RECOVERY: { n: 1, sum: 273 } },
      badEdges: 0, conEntries: 10, conPreceded: 6, grace: { FU: false, NA: false, SC: false }, carryMean: 1e-4, carryWorst5d: -0.15, calmDays: 10, calmInBand: 7, contagionPhases: 5, contagionOver60: 4 };
    const rs = Array.from({ length: 10 }, (_, i) => ({ ...good, seed: i, grace: { ...good.grace, SC: i === 0 } }));
    expect(aggregate(rs).map((c) => [c.ac, c.pass])).toEqual([['04#4', true], ['04#6', true], ['04#24', true], ['04#27', true], ['04#32', true]]);
    const off = aggregate(rs.map((r) => ({ ...r, badEdges: 1, conPreceded: 5, grace: { FU: true, NA: false, SC: false }, carryWorst5d: -0.14, calmInBand: 6, contagionOver60: 3 })));
    expect(off.map((c) => c.pass)).toEqual([false, false, false, false, false]);
    expect(aggregate(rs.map((r) => ({ ...r, spells: { ...r.spells, OVERHEATING: { n: 1, sum: 314 } } })))[0]!.pass).toBe(false);   // 314/273 = +15.0…%
    expect(aggregate([]).every((c) => !c.pass)).toBe(true);
  });
  it('E-108 (7): the nightly seed runs on the reference 16 political-stability stub (genesis 0.7, plus active politicalStabilityShock deltas)', () => {
    const r = startSeed(0);
    expect(r.p.world.politicalStability(r.w.store, 'SRL')).toBeCloseTo(0.7, 12);
    r.w.store.put<HookCall>(macroTables.hookCall.name, { id: 'h', owner: '16', hook: 'politicalStabilityShock', args: { bloc: 'SRL', delta: -0.3, days: 63 }, startTick: 0, worldEventId: 'e' } as unknown as HookCall);
    expect(r.p.world.politicalStability(r.w.store, 'SRL')).toBeCloseTo(0.4, 12);
  });
});

const yieldLoop = (): Promise<void> => new Promise((r) => { setTimeout(r, 0); });
describe.skipIf(env.TYCOON_CALIB !== '1')('nightly macro-calibration (200 seeds × 3640 days, sharded)', () => {
  const from = Number(env.CALIB_SEED_FROM ?? 0), to = Number(env.CALIB_SEED_TO ?? from), days = Number(env.CALIB_DAYS ?? CALIB_DAYS), out = env.CALIB_OUT ?? 'calib-out';
  it.skipIf(env.CALIB_AGG !== undefined)(`seeds ${from}..${to} × ${days} days`, async () => {
    mkdirSync(out, { recursive: true });
    for (let s = from; s <= to; s++) {
      const r = startSeed(s);
      while (r.day < days) { stepSeed(r, Math.min(20, days - r.day)); await yieldLoop(); }
      writeFileSync(join(out, `seed-${s}.json`), JSON.stringify(finishSeed(r)));
    }
  }, 24 * 3600_000);
  it.skipIf(env.CALIB_AGG === undefined)('aggregate: 04#4, 6, 24, 27, 32 bands', () => {
    const dir = env.CALIB_AGG!, rs = readdirSync(dir).filter((f) => f.endsWith('.json') && f.startsWith('seed-')).sort().map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as SeedResult);
    const checks = aggregate(rs);
    writeFileSync(join(dir, 'report.json'), JSON.stringify({ seeds: rs.length, checks }, null, 1));
    console.log(checks.map((c) => `${c.ac} ${c.pass ? 'PASS' : 'FAIL'} ${c.value}`).join('\n'));
    if (env.CALIB_MIN_SEEDS) expect(rs.length).toBeGreaterThanOrEqual(Number(env.CALIB_MIN_SEEDS));
    expect(checks.filter((c) => !c.pass).map((c) => c.ac)).toEqual([]);
  });
});
