import { describe, expect, it } from 'vitest';
import { COMPANY, SECTORS } from '@/content/company';
import { Rng, seedStream } from '@/engine';
import { demandPerDay, entryProbability, imitableLeaderLnQ, imitateDaily, npcQuarterly, npcWeeklyReaction, productUtility, shares, seedNpcs } from './market';
import { emptyStaff } from './staff';
import type { Company, Product } from './types';

function company(over: Partial<Company> = {}): Company {
  const staff = { ops: emptyStaff(), sales: emptyStaff(), rd: emptyStaff(), ga: emptyStaff() };
  staff.ops.total = 5; staff.sales.total = 2; staff.rd.total = 2; staff.ga.total = 1;
  const c: Company = {
    id: 'c', name: 'c', ownerId: 'p', sector: 'tech', cityId: 'av', foundedDay: 0, tier: 'seed', cash: 0, paidIn: 0,
    retained: 0, lossCarry: 0, shares: 1, capTable: {}, staff, hires: [], plantLevel: 0, plantBuildUntil: null, plantCapex: 0,
    ppe: 0, products: [], eff: 0, projects: [], projSeq: 0, frontierLn: 0, npcs: [], npcSeq: 0, sectorBase: 0, oilBase: 0,
    d0: 800, orders: [], orderSeq: 0, resolved: [], ar: 0, inv: 0, ap: 0,
    qtd: { startDay: 0, revenue: 0, cogs: 0, opex: 0, da: 0, ocf: 0, capex: 0, units: 0, matCogs: 0, overtime: 0, rdSpend: 0, marketing: 0 },
    closed: [], filings: [], pendingFile: null, filingCount: 0, signals: [], noise: null, consensus: null, cbFiled: 0,
    lastUtil: 0, headsAtSignal: 0, signalSeq: 0, lastSens: 0, lastFair: 0, sigLog: [], revenueTotal: 0, listed: null,
    rng: { rd: seedStream('s', 'rd'), sig: seedStream('s', 'sig'), npc: seedStream('s', 'npc') },
    goalsDone: {}, distress: false, distressPublic: false, indexLast: 1, launchCredits: [], ledger: [], ledgerTotals: {}, ...over,
  };
  return c;
}

function product(id: string, over: Partial<Product> = {}): Product {
  return { id, name: id, q: 1, generation: 1, k: 0, price: 50, marketing: 0, brand: 0, patents: [], lastShare: 0, ...over };
}

describe('demand (spec 2, CB-014)', () => {
  it('D = D0 exp(kappa (F - F0)) R^beta: the shock and the regime move it as written', () => {
    const c = company({ sectorBase: 0 });
    const d0 = demandPerDay(c, 0, 'expansion');
    expect(d0).toBeCloseTo(800, 9);
    expect(demandPerDay(c, 2, 'expansion')).toBeCloseTo(800 * Math.exp(0.5 * 2), 6);
    expect(demandPerDay(c, 0, 'contraction')).toBeCloseTo(800 * Math.pow(0.9, SECTORS.tech.cycleBeta), 6);
  });
});

describe('logit share with an outside option (spec 2, CB-015, CB-016)', () => {
  it('shares sum to one with the outside option, and rise with quality and fall with price', () => {
    const c = company({ products: [product('a')], npcs: [{ id: 'n', lnQ: 0, price: 50, marketing: 600, negQuarters: 0 }] });
    const s = shares(c, 0);
    const total = s.products.a! + s.npcs.n! + s.outside;
    expect(total).toBeCloseTo(1, 12);
    const better = company({ products: [product('a', { q: 1.5 })], npcs: [{ id: 'n', lnQ: 0, price: 50, marketing: 600, negQuarters: 0 }] });
    expect(shares(better, 0).products.a!).toBeGreaterThan(s.products.a!);
    const cheaper = company({ products: [product('a', { price: 40 })], npcs: [{ id: 'n', lnQ: 0, price: 50, marketing: 600, negQuarters: 0 }] });
    expect(shares(cheaper, 0).products.a!).toBeGreaterThan(s.products.a!);
  });

  it('the own-price elasticity is -c (1 - s): about -1.5 at a 25% share', () => {
    const s = 0.25;
    expect(-COMPANY.demand.c * (1 - s)).toBeCloseTo(-1.5, 12);
  });

  it('brand enters the utility additively', () => {
    const p = product('a');
    const u0 = productUtility(p, 1, 1);
    expect(productUtility({ ...p, brand: -0.02 }, 1, 1)).toBeCloseTo(u0 - 0.02, 12);
  });
});

describe('NPC rivals (spec 2, CB-018)', () => {
  it('seeds 3-5 rivals from the npc stream', () => {
    const c = company();
    const rng = new Rng(seedStream('seed', 'co:npc:c'));
    seedNpcs(c, 4, rng);
    expect(c.npcs).toHaveLength(4);
    expect(new Set(c.npcs.map((n) => n.id)).size).toBe(4);
  });

  it('the weekly reaction cuts prices by up to 8% and raises marketing 20% only above a 25% share, bounded below', () => {
    const c = company({ npcs: [{ id: 'n', lnQ: 0, price: 50, marketing: 100, negQuarters: 0 }] });
    npcWeeklyReaction(c, 0.2);
    expect(c.npcs[0]!.price).toBe(50);
    npcWeeklyReaction(c, 0.4);
    expect(c.npcs[0]!.price).toBeCloseTo(50 * 0.92, 9);
    expect(c.npcs[0]!.marketing).toBeCloseTo(120, 9);
    for (let i = 0; i < 100; i++) npcWeeklyReaction(c, 0.4);
    expect(c.npcs[0]!.price).toBeGreaterThanOrEqual(COMPANY.npc.priceFloor * COMPANY.demand.priceRef - 1e-9);
  });

  it('the entry probability is 0.25 max(0, m - 10%)/10% capped at 0.6 (software hits the cap)', () => {
    expect(entryProbability(0.8)).toBe(0.6);
    expect(entryProbability(0.2)).toBeCloseTo(0.25 * 0.1 / 0.1, 12);
    expect(entryProbability(0.05)).toBe(0);
  });

  it('an NPC that prices below its unit cost for two quarters exits; others stay', () => {
    const c = company({
      sector: 'industrials',
      npcs: [
        { id: 'loss', lnQ: 0, price: 30, marketing: 600, negQuarters: 0 },
        { id: 'fine', lnQ: 0, price: 60, marketing: 600, negQuarters: 0 },
      ],
    });
    const rng = new Rng(seedStream('s', 'npc'));
    npcQuarterly(c, rng, 63);
    expect(c.npcs.map((n) => n.id)).toContain('loss');
    npcQuarterly(c, rng, 126);
    expect(c.npcs.map((n) => n.id)).not.toContain('loss');
    expect(c.npcs.map((n) => n.id)).toContain('fine');
  });

  it('imitation: the NPC quality closes half its gap to the leader in 126 gd, the patent pausing the gain', () => {
    const c = company({ products: [product('a', { q: Math.exp(0.2), patents: [{ until: 1000, lnGain: 0.2 }] })], npcs: [{ id: 'n', lnQ: 0, price: 50, marketing: 600, negQuarters: 0 }] });
    expect(imitableLeaderLnQ(c, 0)).toBeCloseTo(0, 12);
    const c2 = company({ products: [product('a', { q: Math.exp(0.2) })], npcs: [{ id: 'n', lnQ: 0, price: 50, marketing: 600, negQuarters: 0 }] });
    for (let d = 0; d < 126; d++) imitateDaily(c2, d);
    expect(c2.npcs[0]!.lnQ).toBeCloseTo(0.1, 2);
  });
});
