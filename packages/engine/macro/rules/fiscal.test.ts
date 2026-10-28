import { describe, expect, it } from 'vitest';
import { createParamsView } from '@tycoon/params';
import type { ParamsView } from '@tycoon/engine-core';
import { M } from '../testkit/cbWorld';
import { fiscalState, fiscalWorld, putBloc, REV_BASE } from '../testkit/fiscalWorld';
import type { FiscalProgram } from '../schema';
import { autoStabilizers, commodityRevenue, fiscalImpulse, interestAnnual, postFiscalCash, programSpendAnnual, quarterFiscalEvent, revenueAnnual,
  spendBase, stepFiscalDay, type FiscalDay } from './fiscal';

const R: Record<string, number> = REV_BASE;
const P: ParamsView = { ...createParamsView([]), num: (k) => { if (!(k in R)) throw new Error(k); return R[k]!; } };
const G = 32e12;
const prog = (o: Partial<FiscalProgram>): FiscalProgram => ({ id: 'p', bloc: 'FDL', kind: 'INFRASTRUCTURE', sizeGdpPerYear: 0.01, sectorDemand: {}, budget: 0n, spent: 0n,
  startTick: 0, endTick: 1000, source: 'POLITICS', sponsorActorIds: [], ...o });
const X = { b: 'FDL' as const, nominalGdp: G, outputGap: 0, u: 0.045, nairu: 0.045, energyIndex: 100, spotVsFdl: 1, tick: 10,
  lines: [{ couponRate: 0.025, faceOutstanding: 30.4e12, bill: false, maturityYears: 7 }] };

describe('T04-10 fiscal', () => {
  it('FDL genesis worked numbers: revenue 9.6e12, spendBase 0.32, interest 0.76e12, spending 11.0e12, primary −0.02, deficit 0.04375, debt +3,846,153,846.153846', () => {
    expect(revenueAnnual('FDL', G, 0, 100, P)).toBeCloseTo(9.6e12, 0);
    expect(spendBase('FDL', P)).toBeCloseTo(0.32, 12);
    expect(interestAnnual(X.lines)).toBeCloseTo(0.76e12, 0);
    const prev = fiscalState({ debt: M(30.4e12) }), d = stepFiscalDay(prev, X, P);
    expect(d.spending * 364).toBeCloseTo(11.0e12, -1);
    expect(d.revenue * 364).toBeCloseTo(9.6e12, -1);
    expect(d.interest * 364).toBeCloseTo(0.76e12, -1);
    expect(d.primary).toBeCloseTo(-0.02, 12);
    expect(d.deficit).toBeCloseTo(0.04375, 12);
    expect(d.debt - prev.debt).toBe(3_846_153_846_153_846n);
    expect(d.debtGdp).toBeCloseTo((30.4e12 + 3_846_153_846.153846) / G, 12);
    expect([d.averageCoupon, d.averageMaturityYears]).toEqual([0.025, 7]);
  });
  it('autoStab u 0.055 vs 0.045 → 0.004·GDP, none at or below u*; x 0.02 → revenue × 1.024', () => {
    expect(autoStabilizers(0.055, 0.045, G)).toBeCloseTo(0.004 * G, 0);
    expect(autoStabilizers(0.045, 0.045, G)).toBe(0);
    expect(autoStabilizers(0.04, 0.045, G)).toBe(0);
    expect(revenueAnnual('FDL', G, 0.02, 100, P)).toBeCloseTo(9.6e12 * 1.024, 0);
  });
  it('commodity revenue: NKR at energy 150 = 0.081·GDP (and in revenueAnnual); EUN (exporter −0.6) and FDL (0) none', () => {
    expect(commodityRevenue('NKR', G, 150)).toBeCloseTo(0.081 * G, 0);
    expect(revenueAnnual('NKR', G, 0, 150, P)).toBeCloseTo((0.40 + 0.081) * G, 0);
    expect(commodityRevenue('SRL', G, 100)).toBeCloseTo(0.036 * G, 0);
    expect(commodityRevenue('EUN', G, 150)).toBe(0);
    expect(commodityRevenue('FDL', G, 150)).toBe(0);
  });
  it('interest: coupons plus bill accretion (face × discount yield; none without a yield)', () => {
    expect(interestAnnual([{ couponRate: 0.03, faceOutstanding: 100, bill: false }, { couponRate: 0.09, faceOutstanding: 50, bill: true, discountYield: 0.04 },
      { couponRate: 0.09, faceOutstanding: 50, bill: true }])).toBeCloseTo(5, 12);
  });
  it('programs: active only ([start, end)), AUSTERITY negative, TAX_CUT on revenue not spending', () => {
    const ps = [prog({ id: 'a' }), prog({ id: 'b', kind: 'AUSTERITY', sizeGdpPerYear: 0.005 }), prog({ id: 'c', kind: 'TAX_CUT' }), prog({ id: 'd', startTick: 11 }), prog({ id: 'e', endTick: 10 })];
    expect(programSpendAnnual(ps, 100, 10)).toBeCloseTo(0.5, 12);
    const d0 = stepFiscalDay(fiscalState(), X, P), d1 = stepFiscalDay(fiscalState({ programs: ps }), X, P);
    expect((d0.revenue - d1.revenue) * 364).toBeCloseTo(0.01 * G, -1);
    expect((d1.spending - d0.spending) * 364).toBeCloseTo(0.005 * G, -1);
  });
  it('no lines: average coupon = genesis policy rate, maturity 5y; SRL fxDebt counts at spot in debtGdp', () => {
    const d = stepFiscalDay(fiscalState(), { ...X, lines: [] }, P);
    expect([d.averageCoupon, d.averageMaturityYears]).toEqual([0.03, 5]);
    const s = stepFiscalDay(fiscalState({ debt: M(100), fxDebt: M(50) }), { ...X, b: 'SRL', nominalGdp: 1000, lines: [], spotVsFdl: 0.5 }, P);
    expect(s.debtGdp).toBeCloseTo((Number(s.debt) / 1e6 + 100) / 1000, 9);
  });
  it('fiscalImpulse 0.03 vs mean 0.02 → +0.01', () => { expect(fiscalImpulse(0.03, 0.02)).toBeCloseTo(0.01, 12); });

  const day = (o: Partial<FiscalDay> = {}): FiscalDay => ({ revenue: 100e6, spending: 90e6, interest: 10e6, primary: 0, deficit: 0, debt: 0n, debtGdp: 0, averageCoupon: 0, averageMaturityYears: 5, ...o });
  const sum = (ps: { amt: bigint }[]): bigint => ps.reduce((a, p) => a + p.amt, 0n);
  it('day close: tax 0.6 hh (over the 3 cities) / 0.4 frm; non-interest spending 0.5/0.5; no interest posting from 04', () => {
    const w = fiscalWorld(10);
    putBloc(w, 'FDL');
    postFiscalCash(w.ctx, 'FDL', day());
    const tax = w.posts.filter((p) => p.code === 'MAC_TAX_FROM_ELASTIC'), sp = w.posts.filter((p) => p.code === 'MAC_GOV_SPENDING_ELASTIC');
    expect(w.posts.length).toBe(tax.length + sp.length);
    expect(tax.every((p) => p.op === 'elasticIn' && p.to === 'gov_FDL' && p.ccy === 'FDL')).toBe(true);
    expect(sum(tax.filter((p) => p.from!.startsWith('hh_')))).toBe(M(60e6));
    expect(tax.filter((p) => p.from!.startsWith('hh_')).map((p) => p.from)).toEqual(['hh_cty_fdl_0', 'hh_cty_fdl_1', 'hh_cty_fdl_2']);
    expect(tax.filter((p) => p.from === 'frm_FDL').map((p) => p.amt)).toEqual([M(40e6)]);
    expect(sp.every((p) => p.op === 'elasticOut' && p.from === 'gov_FDL')).toBe(true);
    expect(sum(sp.filter((p) => p.to!.startsWith('hh_')))).toBe(M(40e6));
    expect(sp.filter((p) => p.to === 'frm_FDL').map((p) => p.amt)).toEqual([M(40e6)]);
  });
  it('HOUSEHOLD_TRANSFER and automatic stabilizers go to hh only', () => {
    const w = fiscalWorld(10);
    putBloc(w, 'FDL', { gdp: 364e9, u: 0.055, fiscal: { programs: [prog({ kind: 'HOUSEHOLD_TRANSFER', sizeGdpPerYear: 0.01 })] } });
    postFiscalCash(w.ctx, 'FDL', day({ revenue: 0 }));
    const sp = w.posts.filter((p) => p.code === 'MAC_GOV_SPENDING_ELASTIC');
    // hh-only = (0.004 + 0.01) × 364e9 / 364 = 14e6 of 80e6; rest 66e6 split half
    expect(sum(sp.filter((p) => p.to!.startsWith('hh_')))).toBe(M(14e6 + 33e6));
    expect(sum(sp.filter((p) => p.to === 'frm_FDL'))).toBe(M(33e6));
    expect(w.posts.some((p) => p.code === 'MAC_TAX_FROM_ELASTIC')).toBe(false);
  });
  it('the hh-only part is clipped to the non-interest spending (all to hh, none to frm)', () => {
    const w = fiscalWorld(10);
    putBloc(w, 'FDL', { gdp: 364e10, u: 0.055, fiscal: { programs: [prog({ kind: 'HOUSEHOLD_TRANSFER', sizeGdpPerYear: 0.01 })] } });
    postFiscalCash(w.ctx, 'FDL', day({ revenue: 0 }));
    const sp = w.posts.filter((p) => p.code === 'MAC_GOV_SPENDING_ELASTIC');
    expect([sum(sp.filter((p) => p.to!.startsWith('hh_'))), sp.some((p) => p.to === 'frm_FDL')]).toEqual([M(80e6), false]);
  });
  it('quarter close emits macro.fiscal.quarter (PUBLIC) with the stored ratios', () => {
    const w = fiscalWorld(95 * 720);
    putBloc(w, 'EUN', { fiscal: { deficitGdp: 0.031, primaryBalanceGdp: -0.01, debtGdp: 0.9 } });
    quarterFiscalEvent(w.ctx, 'EUN');
    expect(w.events).toEqual([{ kind: 'macro.fiscal.quarter', subjectIds: ['gov_EUN'], payload: { bloc: 'EUN', quarter: 1, deficitGdp: 0.031, primaryBalanceGdp: -0.01, debtGdp: 0.9 }, vis: 'PUBLIC' }]);
  });
});
