import { describe, expect, it } from 'vitest';
import { COMPANY } from '@/content/company';
import { Rng, seedStream } from '@/engine';
import { companyAction, companyTick, emptyCompanyWorld, foundCompany, privateInputs, privateValue, type CompanyEnv, type CompanyEvent } from './company';
import { completeProject, projectBand, qualityGain, sRef, startProject } from './rd';
import { founderCompanyView } from './views';
import type { CompanyWorld, Project } from './types';

// Cash, discretionary spend, launches, frozen S_ref and the private mark: the funding rules of the company core.

interface Harness { w: CompanyWorld; env: CompanyEnv; money: Record<string, number> }

function harness(seed: string, founderCash = 2_000_000): Harness {
  const money: Record<string, number> = { founder: founderCash };
  const env: CompanyEnv = {
    seed, day: 0, regime: 'expansion', oilLog: 0, rankOf: () => 'R2',
    money: {
      cash: (pid) => money[pid] ?? 0,
      take: (pid, amount) => { money[pid] = (money[pid] ?? 0) - amount; },
    },
  };
  return { w: emptyCompanyWorld(seed), env, money };
}

function found(h: Harness): string {
  const r = foundCompany(h.w, h.env, 'founder', { name: 'Acme', sector: 'tech', cityId: 'av', capital: COMPANY.founding.capital });
  if (!r.ok) throw new Error(JSON.stringify(r.reject));
  return r.value.id;
}

function advance(h: Harness, from: number, to: number): CompanyEvent[] {
  const evs: CompanyEvent[] = [];
  for (let d = from; d <= to; d++) {
    h.env.day = d;
    evs.push(...companyTick(h.w, h.env, d));
  }
  return evs;
}

describe('cash: marketing and hiring are checked, and mandatory costs flag distress (spec 1, 4)', () => {
  it('marketing is refused when non-finite, negative, above the cap, or above the cash on hand', () => {
    const h = harness('mkt');
    const id = found(h);
    const pid = `${id}:p0`;
    const set = (amount: number) => companyAction(h.w, h.env, 'founder', id, { kind: 'setMarketing', productId: pid, amount });
    expect(set(Infinity)).toEqual({ ok: false, reject: { code: 'negativeAmount' } });
    expect(set(NaN)).toEqual({ ok: false, reject: { code: 'negativeAmount' } });
    expect(set(-1)).toEqual({ ok: false, reject: { code: 'negativeAmount' } });
    expect(set(COMPANY.demand.marketingMax + 1)).toEqual({ ok: false, reject: { code: 'marketingCap', cap: COMPANY.demand.marketingMax } });
    h.w.companies[id]!.cash = 500;
    const poor = set(1_000);
    expect(poor.ok).toBe(false);
    if (!poor.ok) expect(poor.reject.code).toBe('insufficientFunds');
    expect(h.w.companies[id]!.products[0]!.marketing).toBe(0);
    expect(Number.isFinite(h.w.companies[id]!.cash)).toBe(true);
  });

  it('an unfunded day spends nothing on marketing, so it has no cost and no share effect', () => {
    const h = harness('unfunded');
    const id = found(h);
    const c = h.w.companies[id]!;
    c.products[0]!.marketing = 5_000;
    c.cash = 1_000; // less than the marketing budget for the day
    advance(h, 1, 1);
    expect(c.ledgerTotals.marketing ?? 0).toBe(0);
    expect(c.qtd.marketing).toBe(0);
  });

  it('a funded day pays the marketing from the opening cash, once', () => {
    const h = harness('funded');
    const id = found(h);
    const c = h.w.companies[id]!;
    c.products[0]!.marketing = 5_000;
    advance(h, 1, 1);
    expect(c.ledgerTotals.marketing).toBe(-5_000);
  });

  it('an R&D project waits on a day it is not funded: no spend, no progress, and its end moves back one day', () => {
    const h = harness('rdwait');
    const id = found(h);
    const c = h.w.companies[id]!;
    const r = companyAction(h.w, h.env, 'founder', id, { kind: 'startProject', projectKind: 'quality', productId: `${id}:p0`, spend: 20_000 });
    expect(r.ok).toBe(true);
    const proj = c.projects[0]!;
    const endBefore = proj.endDay;
    c.cash = 0;
    advance(h, 1, 1);
    expect(proj.paidDays).toBe(0);
    expect(proj.endDay).toBe(endBefore + 1);
    expect(c.ledgerTotals.rd ?? 0).toBe(0);
  });

  it('the R&D spend paid equals the funded days times the day rate, so a finished project spends exactly its budget', () => {
    const h = harness('rdpaid');
    const id = found(h);
    const c = h.w.companies[id]!;
    const spend = 20_000;
    companyAction(h.w, h.env, 'founder', id, { kind: 'startProject', projectKind: 'quality', productId: `${id}:p0`, spend });
    const proj = c.projects[0]!;
    advance(h, 1, 60);
    expect(c.ledgerTotals.rd ?? 0).toBeCloseTo(-(proj.paidDays * proj.spendPerDay), 6);
    if (c.projects.length === 0) expect(-(c.ledgerTotals.rd ?? 0)).toBeCloseTo(spend, 6);
  });

  it('a company whose cash goes below zero is flagged that day (private), not at the next close', () => {
    const h = harness('dist');
    const id = found(h);
    const c = h.w.companies[id]!;
    c.cash = -100_000;
    const evs = advance(h, 1, 1);
    expect(evs.some((e) => e.kind === 'distress' && e.companyId === id)).toBe(true);
    expect(c.distress).toBe(true);
  });

  it('a hire needs cash for five game days of its wages', () => {
    const h = harness('runway');
    const id = found(h);
    h.w.companies[id]!.cash = 500;
    const r = companyAction(h.w, h.env, 'founder', id, { kind: 'hire', role: 'ops', n: 1 });
    expect(r).toEqual({ ok: false, reject: { code: 'insufficientFunds', shortfall: COMPANY.wages.ops * COMPANY.hireRunwayDays - 500 } });
  });
});

describe('next-gen launches need a successful next-gen project (spec 3)', () => {
  const nextgen = (productId: string, success: boolean): Project => ({
    id: 'x', kind: 'nextgen', productId, spend: 40_000, spendPerDay: 1, days: 15, paidDays: 15, startDay: 0,
    endDay: 15, success, z: 0, pShown: 1, sRef: sRef(0), kUsed: 0, gates: [],
  });

  it('a Seed company cannot launch a product without a successful next-gen project, and a launch uses its credit', () => {
    const h = harness('launch');
    const id = found(h);
    const c = h.w.companies[id]!;
    const launch = () => companyAction(h.w, h.env, 'founder', id, { kind: 'launchProduct', name: 'Second', price: 50 });
    expect(launch()).toEqual({ ok: false, reject: { code: 'noLaunchCredit' } });
    completeProject(c, nextgen(c.products[0]!.id, true), 15);
    expect(c.launchCredits).toHaveLength(1);
    expect(launch().ok).toBe(true);
    expect(c.products).toHaveLength(2);
    // the new product has the quality the next-gen project bought, not the frontier for free
    expect(c.products[1]!.q).toBeCloseTo(c.products[0]!.q, 12);
    expect(c.launchCredits).toHaveLength(0);
    // the Seed product cap (2) is reached, and it is checked before the credit
    expect(launch()).toEqual({ ok: false, reject: { code: 'productCap', cap: 2 } });
    c.products.pop();
    expect(launch()).toEqual({ ok: false, reject: { code: 'noLaunchCredit' } });
  });

  it('a failed next-gen project grants no launch credit', () => {
    const h = harness('launch2');
    const id = found(h);
    const c = h.w.companies[id]!;
    completeProject(c, nextgen(c.products[0]!.id, false), 15);
    expect(c.launchCredits).toHaveLength(0);
  });
});

describe('S_ref and k are frozen at the start of a project (spec 3, X15)', () => {
  it('the gain and the band use the start values, so a revenue jump before completion does not move them', () => {
    const h = harness('sref');
    const id = found(h);
    const c = h.w.companies[id]!;
    const started = startProject(c, new Rng(seedStream('sref', 'rd')), 'quality', c.products[0]!, 40_000, 0, 10_000, 2);
    const p: Project = { ...started, success: true };
    expect(p.sRef).toBe(sRef(10_000));
    const band = projectBand('tech', p.spend, p.sRef, p.kUsed);
    c.qtd.revenue = 1e9;
    completeProject(c, p, 15);
    const gain = Math.log(c.products[0]!.q);
    expect(gain).toBeCloseTo(qualityGain(p.spend, p.sRef, p.kUsed, p.z), 12);
    expect(gain).toBeGreaterThanOrEqual(band.dqBear - 1e-12);
    expect(gain).toBeLessThanOrEqual(band.dqBull + 1e-12);
  });

  it('the founder view shows the band of the frozen S_ref after revenue changes', () => {
    const h = harness('sref2');
    const id = found(h);
    const c = h.w.companies[id]!;
    advance(h, 1, 3);
    companyAction(h.w, h.env, 'founder', id, { kind: 'startProject', projectKind: 'quality', productId: `${id}:p0`, spend: 20_000 });
    const before = founderCompanyView(h.w, 'founder', id, 4).projects[0]!.dqBand;
    c.qtd.revenue = 5e8;
    expect(founderCompanyView(h.w, 'founder', id, 4).projects[0]!.dqBand).toEqual(before);
  });
});

describe('one V_engine for the private mark (spec 5)', () => {
  it('a profitable run rate is valued on the E* branch, the branch the filing uses', () => {
    const h = harness('pv');
    const id = found(h);
    const c = h.w.companies[id]!;
    c.qtd = { startDay: 0, revenue: 100_000, cogs: 20_000, opex: 10_000, da: 0, ocf: 60_000, capex: 0, units: 1000, matCogs: 10_000, overtime: 0, rdSpend: 0, marketing: 0 };
    const x = privateInputs(c, 30);
    expect(x.eStar).toBeGreaterThan(0);
    const v = COMPANY.valuation;
    expect(privateValue(c, 30)).toBeCloseTo(v.pe * x.eStar * (v.cBase + v.cSlope * v.cInit) - x.netDebt, 4);
  });

  it('a founded company is marked at its cash until it has sales to annualize, and one day of sales cannot mark it up', () => {
    const h = harness('pv2');
    const id = found(h);
    const c = h.w.companies[id]!;
    expect(privateValue(c, 0)).toBeCloseTo(COMPANY.founding.capital, 6);
    // a single day's revenue in the first quarter is not annualized
    c.qtd = { ...c.qtd, revenue: 6_450 };
    const x = privateInputs(c, 1);
    expect(x.revU).toBe(0);
    expect(privateValue(c, 1)).toBeCloseTo(c.cash, 6);
  });

  it('after a close, the last closed quarter is the basis until the new quarter has 21 gd of trading', () => {
    const h = harness('pv3');
    const id = found(h);
    advance(h, 1, 63);
    const c = h.w.companies[id]!;
    expect(c.closed.length).toBe(1);
    const last = c.closed[0]!;
    const early = privateInputs(c, 65);
    expect(early.revU).toBeCloseTo(last.revenue * (COMPANY.yearDays / COMPANY.quarterDays), 6);
    const later = privateInputs(c, 63 + COMPANY.valuation.privateMarkDays);
    expect(later.revU).toBe(c.qtd.revenue * (COMPANY.yearDays / COMPANY.valuation.privateMarkDays));
  });
});
