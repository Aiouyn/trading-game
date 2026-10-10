import { describe, expect, it } from 'vitest';
import { COMPANY, SECTORS } from '@/content/company';
import { capacityPerDay, gaFactor, inputIndex, materialPerUnit, overtimePerUnit, plantCost, plantMult, productiveHeads, shipCeiling } from './economics';
import { landHires, fireHeads, queueHire, emptyStaff, headcountCap } from './staff';
import { qualityScore, projectDays, startProject, completeProject, successOdds, qualityGain, frontierStep, projectBand, sRef } from './rd';
import { Rng, seedStream } from '@/engine';
import type { Company, Product, Staff } from './types';

function company(over: Partial<Company> = {}): Company {
  const staff = { ops: emptyStaff(), sales: emptyStaff(), rd: emptyStaff(), ga: emptyStaff() };
  staff.ops.total = 5; staff.sales.total = 2; staff.rd.total = 2; staff.ga.total = 1;
  return {
    id: 'c', name: 'c', ownerId: 'p', sector: 'tech', cityId: 'av', foundedDay: 0, tier: 'seed', cash: 0, paidIn: 0,
    retained: 0, lossCarry: 0, shares: 1, capTable: {}, staff, hires: [], plantLevel: 0, plantBuildUntil: null, plantCapex: 0,
    ppe: 0, products: [], eff: 0, projects: [], projSeq: 0, frontierLn: 0, npcs: [], npcSeq: 0, sectorBase: 0, oilBase: 0,
    d0: 1, orders: [], orderSeq: 0, resolved: [], ar: 0, inv: 0, ap: 0,
    qtd: { startDay: 0, revenue: 0, cogs: 0, opex: 0, da: 0, ocf: 0, capex: 0, units: 0, matCogs: 0, overtime: 0, rdSpend: 0, marketing: 0 },
    closed: [], filings: [], pendingFile: null, filingCount: 0, signals: [], noise: null, consensus: null, cbFiled: 0,
    lastUtil: 0, headsAtSignal: 0, signalSeq: 0, lastSens: 0, lastFair: 0, sigLog: [], revenueTotal: 0, listed: null,
    rng: { rd: seedStream('s', 'rd'), sig: seedStream('s', 'sig'), npc: seedStream('s', 'npc') },
    goalsDone: {}, distress: false, ledger: [], ledgerTotals: {}, ...over,
  };
}

function product(over: Partial<Product> = {}): Product {
  return { id: 'p0', name: 'x', q: 1, generation: 1, k: 0, price: 50, marketing: 0, brand: 0, patents: [], lastShare: 0, ...over };
}

describe('unit economics (spec 1, 2)', () => {
  it('the reference company holds its sector gross margin at the reference price and Ops load', () => {
    for (const s of Object.keys(SECTORS) as (keyof typeof SECTORS)[]) {
      const mat = materialPerUnit(s);
      const unitCostAtRef = mat + COMPANY.wages.ops / COMPANY.unitsPerOpsHead;
      expect(1 - unitCostAtRef / COMPANY.demand.priceRef).toBeCloseTo(SECTORS[s].grossMargin, 9);
    }
  });

  it('the input index: industrials exp(0.5 move), staples 1 + 0.3 (exp(move) - 1), others 1', () => {
    expect(inputIndex('industrials', 0.2)).toBeCloseTo(Math.exp(0.1), 12);
    expect(inputIndex('staples', 0.1)).toBeCloseTo(1 + 0.3 * (Math.exp(0.1) - 1), 12);
    expect(inputIndex('tech', 0.5)).toBe(1);
  });

  it('capacity = productive Ops * 60 * plant multiplier * G&A factor (section 4)', () => {
    const c = company();
    expect(capacityPerDay(c, 0)).toBe(5 * 60);
    c.plantLevel = 2;
    expect(plantMult(2)).toBeCloseTo(1.5, 12);
    expect(capacityPerDay(c, 0)).toBe(5 * 60 * 1.5);
  });

  it('G&A: each head covers 12 others; each missing head costs 3% of output', () => {
    const c = company();
    c.staff.sales.total = 30; // 5 + 30 + 2 + 1 = 38 others plus G&A 1: needs ceil(37/12)=4 G&A heads
    expect(gaFactor(c.staff)).toBeCloseTo(1 - 0.03 * 3, 12);
    c.staff.ga.total = 4;
    expect(gaFactor(c.staff)).toBe(1);
  });

  it('plant cost is C0 * 0.10 * 1.18^n and the 115% ceiling and the overtime rate follow section 2', () => {
    expect(plantCost(0)).toBeCloseTo(COMPANY.plant.c0 * 0.1, 9);
    expect(plantCost(2)).toBeCloseTo(COMPANY.plant.c0 * 0.1 * 1.18 * 1.18, 9);
    expect(shipCeiling(300)).toBe(345);
    expect(overtimePerUnit()).toBeCloseTo(1.5 * 120 / 60, 12);
  });

  it('ramp: a hire is productive only after its role ramp; firing takes productive heads too', () => {
    const c = company();
    queueHire(c, 'ops', 3, 0, headcountCap('seed'));
    expect(c.hires[0]!.fillDay).toBe(3);
    landHires(c, 3);
    expect(c.staff.ops.total).toBe(8);
    expect(productiveHeads(c.staff.ops, 3)).toBe(5);
    expect(productiveHeads(c.staff.ops, 3 + COMPANY.rampDays.ops)).toBe(8);
  });

  it('the Seed headcount cap of 25 refuses a hire that would pass it (section 4)', () => {
    const c = company();
    const r = queueHire(c, 'sales', 20, 0, headcountCap('seed'));
    expect(r).toEqual({ code: 'headcountCap', cap: 25 });
  });

  it('severance on a fire is 21 gd of that role\'s wage per head', () => {
    const c = company();
    const r = fireHeads(c, 'rd', 2, 10);
    expect(r).toEqual({ severance: 2 * 200 * 21 });
    expect(fireHeads(c, 'ga', 9, 10)).toEqual({ code: 'notEnoughStaff', role: 'ga', have: 1 });
  });
});

describe('R&D (spec 3, CB-021..CB-028)', () => {
  it('a project takes T0 / min(1, n_RD / 2) gd; pharma runs three gates of 20 gd', () => {
    expect(projectDays('tech', 2)).toBe(15);
    expect(projectDays('tech', 1)).toBe(30);
    expect(projectDays('health', 2)).toBe(60);
  });

  it('success odds: p_s (1 - e^(-S/S_ref)); pharma uses its gate product (about 0.29)', () => {
    const p = successOdds('tech', 20_000, 0);
    expect(p).toBeCloseTo(0.8 * (1 - Math.exp(-1)), 9);
    expect(successOdds('health', 1, 0)).toBeCloseTo(0.65 * 0.55 * 0.8, 9);
  });

  it('the quality gain is at most 0.25 ln (7.5 score points) for one maximal success, and k reduces it by 0.8^k', () => {
    const big = qualityGain(1e9, 0, 0, 1);
    expect(big).toBeLessThanOrEqual(0.25 + 1e-9);
    expect(qualityGain(1e9, 0, 2, 0)).toBeCloseTo(0.2 * 0.64, 6);
    expect(qualityScore(1, 1)).toBe(80);
    expect(qualityScore(Math.exp(Math.log(2) * -1), 1)).toBe(59);
  });

  it('the band shown before launch brackets the odds by 5 points and the gain by its z extremes', () => {
    const b = projectBand('tech', product(), 40_000, 0);
    expect(b.pHigh - b.pLow).toBeCloseTo(0.10, 9);
    expect(b.dqBear).toBeLessThan(b.dqBase);
    expect(b.dqBase).toBeLessThan(b.dqBull);
  });

  it('draws are fixed at the start, and a quality gain shows only when the project completes', () => {
    const c = company({ products: [product()] });
    const r1 = new Rng(seedStream('seed', 'rd'));
    const p = startProject(c, r1, 'quality', c.products[0]!, 40_000, 5, 0, 2);
    expect(p.endDay).toBe(5 + 15);
    expect(c.products[0]!.q).toBe(1);
    const r2 = new Rng(seedStream('seed', 'rd'));
    const again = startProject(c, r2, 'quality', c.products[0]!, 40_000, 5, 0, 2);
    expect(again.success).toBe(p.success);
    expect(again.z).toBe(p.z);
  });

  it('a successful tech project raises q on completion; a successful pharma project grants a 252 gd patent', () => {
    const c = company({ products: [product()], sector: 'tech' });
    const p = { id: 'x', kind: 'quality' as const, productId: 'p0', spend: 40_000, spendPerDay: 1, startDay: 0, endDay: 15, success: true, z: 0, pShown: 1, gates: [] };
    completeProject(c, p, 15, 0);
    expect(c.products[0]!.q).toBeGreaterThan(1);
    expect(c.products[0]!.patents).toHaveLength(0);
    const h = company({ products: [product()], sector: 'health' });
    completeProject(h, { ...p, productId: 'p0' }, 15, 0);
    expect(h.products[0]!.patents).toEqual([{ until: 15 + 252, lnGain: expect.any(Number) }]);
  });

  it('frontier and imitation: the frontier rises by delta per gd; an NPC closes half its gap in 126 gd', () => {
    const c = company({ frontierLn: 0 });
    for (let d = 0; d < 100; d++) frontierStep(c);
    expect(c.frontierLn).toBeCloseTo(100 * Math.log1p(0.001), 9);
  });

  it('sRef is 20 gd of the product revenue with a $20k floor', () => {
    expect(sRef(0)).toBe(20_000);
    expect(sRef(5_000)).toBe(100_000);
  });
});

describe('staff record (ramp)', () => {
  it('a ramping head is not counted as productive until its readyDay', () => {
    const s: Staff = { total: 4, ramping: [{ readyDay: 10, n: 2 }] };
    expect(productiveHeads(s, 9)).toBe(2);
    expect(productiveHeads(s, 10)).toBe(4);
    void landHires;
  });
});
