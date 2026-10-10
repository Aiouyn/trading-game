import { describe, expect, it } from 'vitest';
import { COMPANY } from '@/content/company';
import { companyTick, emptyCompanyWorld, foundCompany, privateValue, type CompanyEnv } from './company';
import { grantLicence, licenceCount, licenceDay } from './franchise';
import { openSupply, supplyDay } from './supply';
import { linkOwner, ownerSetOf } from './owners';
import type { Company, CompanyWorld } from './types';

interface Harness { w: CompanyWorld; env: CompanyEnv; money: Record<string, number> }

function harness(seed = 'commerce'): Harness {
  const money: Record<string, number> = { founder: 5_000_000, rival: 5_000_000, stranger: 5_000_000 };
  const env: CompanyEnv = {
    seed, day: 0, regime: 'expansion', oilLog: 0, rankOf: () => 'R3',
    money: {
      cash: (pid) => money[pid] ?? 0,
      take: (pid, amount) => { money[pid] = (money[pid] ?? 0) - amount; },
      give: (pid, amount) => { money[pid] = (money[pid] ?? 0) + amount; },
    },
  };
  return { w: emptyCompanyWorld(seed), env, money };
}

function found(h: Harness, pid: string, name = pid): Company {
  const r = foundCompany(h.w, h.env, pid, { name, sector: 'tech', cityId: 'av', capital: COMPANY.founding.capital });
  if (!r.ok) throw new Error(JSON.stringify(r.reject));
  return h.w.companies[r.value.id]!;
}

function identity(h: Harness): number {
  let t = Object.values(h.money).reduce((s, x) => s + x, 0);
  for (const x of Object.values(h.w.companies)) t += x.cash + (x.estate ?? 0);
  for (const p of Object.values(h.w.investors)) t += p.cash;
  return t + h.w.flows.sink - h.w.flows.faucet;
}

function run(h: Harness, from: number, to: number, script: Record<number, () => void> = {}): void {
  for (let d = from; d <= to; d++) {
    h.env.day = d;
    script[d]?.();
    companyTick(h.w, h.env, d);
  }
}

describe('franchising (C4)', () => {
  it('the royalty rate is 4 to 8 percent, the owner grants it, and at most 3 run per sector', () => {
    const h = harness();
    const a = found(h, 'founder');
    expect(grantLicence(h.w, a, h.env, 'founder', 0.03)).toEqual({
      ok: false, reject: { code: 'franchiseRate', min: 4, max: 8 },
    });
    expect(grantLicence(h.w, a, h.env, 'rival', 0.05)).toEqual({ ok: false, reject: { code: 'notFounder' } });
    for (let i = 0; i < 3; i++) expect(grantLicence(h.w, a, h.env, 'founder', 0.05).ok).toBe(true);
    expect(licenceCount(h.w, 'tech')).toBe(3);
    expect(grantLicence(h.w, a, h.env, 'founder', 0.05)).toEqual({ ok: false, reject: { code: 'franchiseCap', cap: 3 } });
  });

  it('the royalty is the rate on the operator revenue, paid to the company as a faucet and counted as revenue', () => {
    const h = harness();
    const a = found(h, 'founder');
    const lic = grantLicence(h.w, a, h.env, 'founder', 0.06);
    expect(lic.ok && lic.value.revenuePerDay).toBe(COMPANY.franchise.operatorFloorPerDay);
    const faucet0 = h.w.flows.faucet;
    const rev0 = a.qtd.revenue;
    const id0 = identity(h);
    licenceDay(h.w, a, 3);
    expect(h.w.flows.faucet - faucet0).toBeCloseTo(0.06 * COMPANY.franchise.operatorFloorPerDay, 9);
    expect(a.qtd.revenue - rev0).toBeCloseTo(0.06 * COMPANY.franchise.operatorFloorPerDay, 9);
    expect(a.ledgerTotals.royalty).toBeCloseTo(0.06 * COMPANY.franchise.operatorFloorPerDay, 9);
    // the royalty is new money from NPC customers: the company gains it and the faucet records it, so the identity holds
    expect(identity(h)).toBeCloseTo(id0, 9);
  });
});

describe('supply deals at the market reference (C4, spec 6.3, N1)', () => {
  it('the price must sit within 10% of the reference, and a related deal outside it adds surveillance', () => {
    const h = harness();
    const buyer = found(h, 'founder');
    const seller = found(h, 'rival');
    linkOwner(h.w, 'rival', 'founder');
    expect(openSupply(h.w, buyer, h.env, 'founder', { sellerId: seller.id, unitsPerDay: 10, price: 60 })).toEqual({
      ok: false, reject: { code: 'supplyPriceOutOfBand', min: 45, max: 55 },
    });
    expect(h.w.insider?.founder?.points).toBe(COMPANY.failure.insiderPoints.relatedOutOfBand);
    expect(openSupply(h.w, buyer, h.env, 'founder', { sellerId: seller.id, unitsPerDay: 10, price: 54 })).toEqual({
      ok: true, value: { id: expect.any(String), related: true },
    });
  });

  it('refuses a supply to oneself, to an unknown seller, from a non-owner, and an unfit quantity', () => {
    const h = harness();
    const buyer = found(h, 'founder');
    const seller = found(h, 'rival');
    expect(openSupply(h.w, buyer, h.env, 'founder', { sellerId: buyer.id, unitsPerDay: 1, price: 50 })).toEqual({ ok: false, reject: { code: 'supplySelf' } });
    expect(openSupply(h.w, buyer, h.env, 'founder', { sellerId: 'nope', unitsPerDay: 1, price: 50 })).toEqual({ ok: false, reject: { code: 'unknownCompany' } });
    expect(openSupply(h.w, buyer, h.env, 'rival', { sellerId: seller.id, unitsPerDay: 1, price: 50 })).toEqual({ ok: false, reject: { code: 'notFounder' } });
    expect(openSupply(h.w, buyer, h.env, 'founder', { sellerId: seller.id, unitsPerDay: 0, price: 50 }).ok).toBe(false);
  });

  it('a deal moves money between the two books as a transfer; the buyer books the cost, the seller books other income', () => {
    const h = harness();
    const buyer = found(h, 'founder');
    const seller = found(h, 'stranger');
    expect(openSupply(h.w, buyer, h.env, 'founder', { sellerId: seller.id, unitsPerDay: 10, price: 50 }).ok).toBe(true);
    const id0 = identity(h);
    const b0 = buyer.cash;
    const s0 = seller.cash;
    const rev0 = seller.qtd.revenue;
    const cogs0 = buyer.qtd.cogs;
    const ocf0 = buyer.qtd.ocf;
    supplyDay(h.w, buyer, h.env, 5);
    expect(buyer.cash - b0).toBe(-500);
    expect(seller.cash - s0).toBe(500);
    // the buyer's payment is a cost of the period (COGS and OCF): the filed net income sees it
    expect(buyer.qtd.cogs - cogs0).toBe(500);
    expect(buyer.qtd.ocf - ocf0).toBe(-500);
    // the seller's income from a player-owned buyer is other income, out of Rev_u (Q11)
    expect(seller.qtd.revenue - rev0).toBe(0);
    expect(seller.qtd.relatedRevenue).toBe(500);
    expect(identity(h)).toBeCloseTo(id0, 9);
    buyer.cash = 10;
    const s1 = seller.cash;
    supplyDay(h.w, buyer, h.env, 6);
    expect(seller.cash).toBe(s1);
  });

  it('the buyer records every supply payment in its own covered log, with the seller as the recipient', () => {
    const h = harness();
    const buyer = found(h, 'founder');
    const seller = found(h, 'rival');
    linkOwner(h.w, 'rival', 'founder');
    expect(openSupply(h.w, buyer, h.env, 'founder', { sellerId: seller.id, unitsPerDay: 10, price: 50 }).ok).toBe(true);
    supplyDay(h.w, buyer, h.env, 5);
    expect(buyer.payouts).toHaveLength(1);
    expect(buyer.payouts![0]).toMatchObject({ kind: 'related', toPlayerId: 'rival', toCompanyId: seller.id, covered: 500, insider: true });
    // the seller's log holds nothing: the default of the seller cannot claw the buyer's payment from the owner
    expect(seller.payouts ?? []).toHaveLength(0);
  });

  it('N1: related revenue is never revenue for the valuation: a twin run with and without the related supply is identical', () => {
    const with_ = harness('n1');
    const bA = found(with_, 'founder');
    const sA = found(with_, 'rival');
    linkOwner(with_.w, 'rival', 'founder');
    expect(openSupply(with_.w, bA, with_.env, 'founder', { sellerId: sA.id, unitsPerDay: 20, price: 55 }).ok).toBe(true);
    run(with_, 0, 70);

    const without = harness('n1');
    found(without, 'founder');
    const sB = found(without, 'rival');
    linkOwner(without.w, 'rival', 'founder');
    run(without, 0, 70);

    expect(sA.filings.length).toBeGreaterThan(0);
    const fA = sA.filings[0]!;
    const fB = sB.filings[0]!;
    // the related income is filed apart, and nothing of it reaches the reported revenue, the valuation or the net income
    expect(fA.income.revUnrelated).toBe(fB.income.revUnrelated);
    expect(fA.income.netIncome).toBe(fB.income.netIncome);
    expect(fA.income.relatedPartyIncome).toBeGreaterThan(0);
    expect(fB.income.relatedPartyIncome).toBe(0);
    expect(privateValue(sA, 70)).toBeCloseTo(privateValue(sB, 70), 6);
    // the money of the three players is conserved: the related supply only moved cash between two books of one group
    expect(identity(with_)).toBeCloseTo(15_000_000, 3);
    expect(ownerSetOf(with_.w, 'rival')).toEqual(['founder', 'rival']);
  });

  it('N1 exploit: a related supply cannot inflate the buyer valuation, its cost is booked (the buyer is worth less, never more)', () => {
    const with_ = harness('n1-buyer');
    const bA = found(with_, 'founder');
    const sA = found(with_, 'rival');
    linkOwner(with_.w, 'rival', 'founder');
    expect(openSupply(with_.w, bA, with_.env, 'founder', { sellerId: sA.id, unitsPerDay: 20, price: 55 }).ok).toBe(true);
    run(with_, 0, 70);

    const without = harness('n1-buyer');
    const bB = found(without, 'founder');
    found(without, 'rival');
    linkOwner(without.w, 'rival', 'founder');
    run(without, 0, 70);

    expect(bA.filings.length).toBeGreaterThan(0);
    // the filed net income of the buyer is lower by the supply cost, and so is its private value
    expect(bA.filings[0]!.income.netIncome).toBeLessThan(bB.filings[0]!.income.netIncome);
    expect(privateValue(bA, 70)).toBeLessThanOrEqual(privateValue(bB, 70) + 1e-6);
  });
});

describe('determinism: a save mid-run continues exactly (B2 state included)', () => {
  it('a JSON round trip of the world at day 30 gives the same world at day 70 as the unbroken run', () => {
    const h1 = harness('det');
    const buyer = found(h1, 'founder');
    const seller = found(h1, 'rival');
    linkOwner(h1.w, 'rival', 'founder');
    expect(grantLicence(h1.w, buyer, h1.env, 'founder', 0.05).ok).toBe(true);
    expect(openSupply(h1.w, buyer, h1.env, 'founder', { sellerId: seller.id, unitsPerDay: 5, price: 52 }).ok).toBe(true);
    run(h1, 0, 30);
    const snap = JSON.parse(JSON.stringify(h1.w)) as CompanyWorld;
    const money = { ...h1.money };
    run(h1, 31, 70);
    const h2: Harness = {
      w: snap,
      money,
      env: { ...h1.env, money: { cash: (pid) => money[pid] ?? 0, take: (pid, a) => { money[pid] = (money[pid] ?? 0) - a; }, give: (pid, a) => { money[pid] = (money[pid] ?? 0) + a; } } },
    };
    run(h2, 31, 70);
    expect(JSON.stringify(h2.w)).toBe(JSON.stringify(h1.w));
    expect(h2.money).toEqual(h1.money);
  });
});
