// T04-16 acceptance tests: release values (04 §3.15.2-§3.15.3), 04#14, worked numbers, E-83 CPI draw order, draw counts per kind.
import { describe, expect, it } from 'vitest';
import { makeRng } from '@tycoon/engine-core';
import { macroTables, type ReleaseKind } from '../schema';
import { releaseWorld } from '../testkit/releaseWorld';
import { S } from '../streams';
import { gdpGrowthQoQAnn } from './economy';
import { consensusOf, DECIMALS, measure, riskReaction, SIGMA_CONS, SIGMA_MEAS, sigmaSurprise, surpriseOf, trueValues } from './releaseValues';
import { postConsensus, publishRelease } from './releases';
import type { ScheduledRelease } from './calendar';

const rngOf = (seed: number) => { let x = seed >>> 0; return makeRng(() => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x; }); };
const stats = (xs: number[]): { mean: number; std: number } => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return { mean: m, std: Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1)) };
};
const rel = (kind: ReleaseKind, tick = 10 * 720 + 45, ref: ScheduledRelease['referencePeriod'] = { kind: 'MONTH', index: 0 }): ScheduledRelease =>
  ({ bloc: 'FDL', kind, tick, consensusTick: 9 * 720 + 420, referencePeriod: ref });

describe('T04-16 release values', () => {
  it('04#14 over 1,000 releases mean(actual − trueValue) within 0.1 σ_meas of 0 and the consensus error std is σ_cons within 10%', () => {
    for (const [kind, meanTol, lo, hi, base, span] of [['CPI', 0.0001, 0.0018, 0.0022, 0.01, 0.04], ['PMI', 0.1, 1.35, 1.65, 45, 10]] as const) {
      const r = rngOf(kind === 'CPI' ? 7 : 8), meas: number[] = [], cons: number[] = [];
      for (let i = 0; i < 1000; i++) {
        const t = base + span * r.next() / 4294967296;
        cons.push(consensusOf(t, kind, r.normal()).consensus - t);
        meas.push(measure(t, kind, r.normal()) - t);
      }
      expect(Math.abs(stats(meas).mean)).toBeLessThan(meanTol);
      const sd = stats(cons).std; expect(sd).toBeGreaterThanOrEqual(lo); expect(sd).toBeLessThanOrEqual(hi);
    }
  });
  it('rounding to 1 decimal of a pp (CPI) and 1 index point (PMI)', () => {
    expect(measure(0.03449, 'CPI', 0)).toBe(0.034); expect(measure(0.0345, 'CPI', 0.6)).toBe(0.035);
    expect(measure(52.04, 'PMI', 0)).toBe(52); expect(measure(52.04, 'PMI', 0.07)).toBe(52.1);
    expect(DECIMALS.CPI).toBe(1); expect(SIGMA_MEAS.CPI).toBe(0.001);
  });
  it('worked numbers: σ_surp CPI = 0.0022360680; surprise 0.034 vs 0.030 → 1.788854; dispersion 0.6 σ_cons', () => {
    expect(sigmaSurprise('CPI')).toBeCloseTo(0.0022360680, 10);
    expect(surpriseOf(0.034, 0.030, 'CPI')).toBeCloseTo(1.788854, 6);
    expect(consensusOf(0.03, 'CPI', 1)).toEqual({ consensus: 0.03 + 0.002, dispersion: 0.6 * 0.002 });
    expect(surpriseOf(0.05, 0.03, 'FISCAL')).toBe(0);   // σ 0 kinds have no surprise
    expect(SIGMA_CONS.TRADE).toBeCloseTo(0.003, 12); expect(SIGMA_CONS.SENTIMENT).toBe(3);
  });
  it('risk reaction: CPI s 2; GDP s 1 at π_core = π* + 0.02; JOBS s +1; others 0', () => {
    const c = riskReaction('CPI', 2, 0.02, 0.02); expect(c.equityJump).toBeCloseTo(-0.006, 12); expect(c.fxValueJump).toBeCloseTo(0.006, 12);
    expect(riskReaction('GDP_ADV', 1, 0.04, 0.02).equityJump).toBeCloseTo(0.001, 12);
    expect(riskReaction('JOBS', 1, 0.02, 0.02)).toEqual({ equityJump: -0.004, fxValueJump: -0.003 });
    expect(riskReaction('PMI', 1, 0.02, 0.02)).toEqual({ equityJump: 0.004, fxValueJump: 0.003 });
    expect(riskReaction('HOUSING', 3, 0.02, 0.02)).toEqual({ equityJump: 0, fxValueJump: 0 });
  });
  it('SENTIMENT at x 0.01, π_e1 = π* + 0.005, F 40 → 97.5', () => {
    const w = releaseWorld(); Object.assign(w.bloc('FDL'), { outputGap: 0.01, inflationExp1y: 0.025 });
    w.put(macroTables.global.name, { id: 'GLOBAL', fearIndex: 40 } as never);
    expect(trueValues(w.ctx.store, 'FDL', 'SENTIMENT', { kind: 'WEEK', index: 0 }, () => 9).headline).toBeCloseTo(97.5, 10);
  });
  it('true values: PMI from 91-day growth, JOBS payroll vs the previous JOBS truth, GDP from the reference quarter, CPI mom from 28 days back', () => {
    const w = releaseWorld(200 * 720 + 420), s = w.ctx.store, hist = (d: number, real: number, cpi = 100) =>
      w.put(macroTables.history.name, { id: `FDL:${d}`, bloc: 'FDL', gameDay: d, realGdpIndex: real, cpiLevel: cpi, coreCpiLevel: cpi } as never);
    Object.assign(w.bloc('FDL'), { realGdpIndex: 101, potentialGrowth: 0.02, unemployment: 0.05, cpiLevel: 101 });
    hist(109, 100); hist(172, 100, 100);
    const g = gdpGrowthQoQAnn(101, 100);
    expect(trueValues(s, 'FDL', 'PMI', { kind: 'MONTH', index: 0 }, () => 0.5).headline).toBeCloseTo(50 + 2.5 * (g - 0.02) / 0.01 + 0.5, 9);
    expect(trueValues(s, 'FDL', 'CPI', { kind: 'MONTH', index: 0 }, () => 0).extra.headlineMom).toBeCloseTo(0.01, 12);
    w.put(macroTables.release.name, { id: 'r0', bloc: 'FDL', kind: 'JOBS', scheduledTick: 5, trueValue: 0.04, pending: false } as never);
    expect(trueValues(s, 'FDL', 'JOBS', { kind: 'MONTH', index: 0 }, () => 0).extra.payrollIndex).toBeCloseTo(100 * 0.95 / 0.96, 12);
    hist(90, 100); hist(181, 102);
    expect(trueValues(s, 'FDL', 'GDP_ADV', { kind: 'QUARTER', index: 1 }, () => 0).headline).toBe(gdpGrowthQoQAnn(102, 100));
    expect(trueValues(s, 'FDL', 'FISCAL', { kind: 'QUARTER', index: 1 }, () => 0)).toEqual({ headline: 0.03, extra: { primaryBalanceGdp: -0.01, debtGdp: 0.9 } });
  });
  it('AC-04-16-CPI-DRAW-ORDER: exactly 4 publication normals, in the order hy, cy, hm, cm, and a golden vector', () => {
    const w = releaseWorld(9 * 720 + 420), k = S.shock('FDL');
    Object.assign(w.bloc('FDL'), { headlineInflation: 0.031, coreInflation: 0.027 });
    postConsensus(w.ctx, 'FDL', rel('CPI')); w.at(10 * 720 + 45);
    w.script(k, [1, 2, 3, 4]); const before = w.normals[k]!;
    const r = publishRelease(w.ctx, 'FDL', rel('CPI'));
    expect(w.normals[k]! - before).toBe(4);
    expect([r.actual, r.extra.coreYoy, r.extra.headlineMom, r.extra.coreMom]).toEqual([0.032, 0.029, 0.003, 0.004]);
    const g = releaseWorld(9 * 720 + 420, 'golden'); Object.assign(g.bloc('FDL'), { headlineInflation: 0.031, coreInflation: 0.027 });
    postConsensus(g.ctx, 'FDL', rel('CPI')); g.at(10 * 720 + 45);
    const q = publishRelease(g.ctx, 'FDL', rel('CPI'));
    expect([q.consensus, q.actual, q.extra.coreYoy, q.extra.headlineMom, q.extra.coreMom]).toEqual(GOLDEN_CPI);
  });
  it('draw counts per kind are fixed: consensus (truth term + one headline normal), publication (one per noisy field); σ 0 kinds draw nothing', () => {
    const EXP: [ReleaseKind, number, number][] = [['CPI', 1, 4], ['JOBS', 1, 1], ['GDP_ADV', 1, 1], ['GDP_REV1', 1, 1], ['GDP_REV2', 1, 1], ['PMI', 2, 1],
      ['RETAIL', 2, 1], ['TRADE', 1, 1], ['SENTIMENT', 1, 1], ['HOUSING', 1, 1], ['CREDIT', 1, 1], ['FISCAL', 0, 0], ['RESERVES', 0, 0]];
    for (const [kind, c, p] of EXP) {
      const w = releaseWorld(9 * 720 + 420), k = S.shock('FDL'), ref = kind.startsWith('GDP') || kind === 'FISCAL' ? { kind: 'QUARTER' as const, index: 0 } : undefined;
      postConsensus(w.ctx, 'FDL', rel(kind, undefined, ref)); expect([kind, w.normals[k] ?? 0]).toEqual([kind, c]);
      w.at(10 * 720 + 45); publishRelease(w.ctx, 'FDL', rel(kind, undefined, ref)); expect([kind, w.normals[k] ?? 0]).toEqual([kind, c + p]);
    }
  });
});
/** releaseWorld seed "golden": consensus (unrounded, first normal), then hy, cy, hm, cm after one draw each. */
const GOLDEN_CPI = [0.03347324316066597, 0.031, 0.028, -0.001, 0];
