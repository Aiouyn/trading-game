// T04-16 nowcast (04 §3.15.3): the signal is fixed per (chr, release); std = σ_cons·(1 − 0.8q); the actual after publication; nothing PUBLIC.
import { describe, expect, it } from 'vitest';
import { macroTables } from '../schema';
import { releaseWorld } from '../testkit/releaseWorld';
import type { ScheduledRelease } from './calendar';
import { economistForecast, nowcast, nowcastTable } from './nowcast';
import { postConsensus, publishRelease, releaseId } from './releases';
import { SIGMA_CONS } from './releaseValues';

const D = 720, r = (tick: number): ScheduledRelease => ({ bloc: 'FDL', kind: 'CPI', tick, consensusTick: tick - 345, referencePeriod: { kind: 'MONTH', index: 0 } });
describe('T04-16 nowcast', () => {
  it('missing release → MAC_STATE_MISSING; same (chr, release) → same value; stored in mac.nowcast; no event', () => {
    const w = releaseWorld(9 * D + 420);
    expect(() => nowcast(w.ctx, 'chr_1', 'rel_FDL_CPI_1', 0.5)).toThrow(expect.objectContaining({ code: 'MAC_STATE_MISSING' }));
    postConsensus(w.ctx, 'FDL', r(10 * D + 45)); const id = releaseId(r(10 * D + 45)), n = w.events.length;
    const v = nowcast(w.ctx, 'chr_1', id, 0.5);
    expect(nowcast(w.ctx, 'chr_1', id, 0.5)).toBe(v); expect(nowcast(w.ctx, 'chr_1', id, 1)).toBe(v);
    expect(Object.entries(w.normals).filter(([k]) => k.includes('chr_1')).map(([, c]) => c)).toEqual([1]);   // one draw, three reads
    expect(w.rows(nowcastTable.name).length).toBe(1); expect(w.events.length).toBe(n);
    const truth = (w.ctx.store.get(macroTables.release.name, id) as { trueValue: number }).trueValue;
    expect(v).not.toBe(truth);
    publishRelease(w.ctx, 'FDL', r(10 * D + 45));
    const act = (w.ctx.store.get(macroTables.release.name, id) as { actual: number }).actual;
    expect(nowcast(w.ctx, 'chr_1', id, 0.5)).toBe(act); expect(nowcast(w.ctx, 'chr_2', id, 0)).toBe(act);
  });
  it.each([[1, 0.2], [0, 1], [0.5, 0.6], [2, 0.2], [-1, 1]])('quality %s → std ≈ %s·σ_cons over 2000 characters (±10%%)', (q, f) => {
    const w = releaseWorld(9 * D + 420); postConsensus(w.ctx, 'FDL', r(10 * D + 45));
    const id = releaseId(r(10 * D + 45)), truth = (w.ctx.store.get(macroTables.release.name, id) as { trueValue: number }).trueValue;
    let ss = 0; for (let i = 0; i < 2000; i++) { const e = nowcast(w.ctx, `chr_${i}`, id, q) - truth; ss += e * e; }
    const sd = Math.sqrt(ss / 2000);
    expect(Math.abs(sd / (f * SIGMA_CONS.CPI) - 1)).toBeLessThan(0.1);
  });
  it('economist forecast = consensus + bias', () => { expect(economistForecast(0.03, 0.002)).toBeCloseTo(0.032, 15); });
});
