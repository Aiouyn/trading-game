// T04-20 04#46: day step ≤ 5 ms for 5 blocs; hourly F and FSI ≤ 0.5 ms. Median of 200 runs after 20 warm-ups on the reference profile.
// Skipped off the reference machine (TYCOON_PERF_REF=1 marks it); the result goes to the perf log (TYCOON_PERF_LOG, default perf-04-46.json).
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { describe, expect, it, vi } from 'vitest';
import { TICKS_PER_GAME_DAY } from '@tycoon/engine-core';
import { macroGenesis } from './genesis';
import { macroDayStep } from './dayStep';
import { hourlyFsi } from '../rules/fsi';
import { hourlyFear } from '../rules/fear';
import { macroWorld } from '../testkit/macroWorld';
import { stubPorts } from '../testkit/cbWorld';
vi.mock('../rules/t03Stubs', () => ({ effectiveMark: vi.fn(() => null), accountsOfEntity: vi.fn(() => []), committedBalance: vi.fn(() => 0n), putFact: vi.fn() }));
vi.mock('../views/ledgerSources', async (orig) => ({ ...(await orig<object>()), msiValue: vi.fn(() => 0) }));

const REF = process.env.TYCOON_PERF_REF === '1', D = TICKS_PER_GAME_DAY, WARM = 20, RUNS = 200;
const median = (xs: number[]): number => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };
describe.skipIf(!REF)('04#46 perf (reference machine only)', () => {
  it('median day step ≤ 5 ms; median hourly F + FSI ≤ 0.5 ms', () => {
    const p = stubPorts(), w = macroWorld('perf', 0); macroGenesis(w.ctx, p);
    const day: number[] = [], hour: number[] = [];
    for (let d = 0; d < WARM + RUNS; d++) {
      w.setTick(d * D + 690); let t0 = performance.now(); hourlyFsi(w.ctx, p); hourlyFear(w.ctx, p); const h = performance.now() - t0;
      w.setTick(d * D + 719); t0 = performance.now(); macroDayStep(w.ctx, p); const s = performance.now() - t0;
      if (d >= WARM) { day.push(s); hour.push(h); }
    }
    const r = { ac: '04#46', blocs: 5, runs: RUNS, warmup: WARM, dayStepMedianMs: median(day), hourlyFearFsiMedianMs: median(hour), node: process.version };
    writeFileSync(process.env.TYCOON_PERF_LOG ?? 'perf-04-46.json', `${JSON.stringify(r, null, 2)}\n`);
    expect(r.dayStepMedianMs).toBeLessThanOrEqual(5);
    expect(r.hourlyFearFsiMedianMs).toBeLessThanOrEqual(0.5);
  }, 600_000);
});
