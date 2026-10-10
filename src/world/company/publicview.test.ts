import { describe, expect, it } from 'vitest';
import { COMPANY } from '@/content/company';
import { companyAction, companyTick, emptyCompanyWorld, foundCompany, type CompanyEnv, type CompanyEvent } from './company';
import { materialPerUnit, overtimePerUnit } from './economics';
import { consensusInputs, consensusUnitCost } from './signals';
import { founderCompanyView, publicCompanyView } from './views';
import type { CompanyWorld, FilingPublic } from './types';

// What the public may see (no-leak rule, spec 6.4), the consensus margin (G23) and the founder's unit cost (spec 1).

interface Harness { w: CompanyWorld; env: CompanyEnv }

function harness(seed: string): Harness {
  const money: Record<string, number> = { founder: 2_000_000 };
  const env: CompanyEnv = {
    seed, day: 0, regime: 'expansion', oilLog: 0, rankOf: () => 'R2',
    money: {
      cash: (pid) => money[pid] ?? 0,
      take: (pid, amount) => { money[pid] = (money[pid] ?? 0) - amount; },
    },
  };
  return { w: emptyCompanyWorld(seed), env };
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

function filing(rev: number, unitCost: number, matUnit: number, inputIndex: number): FilingPublic {
  return {
    quarter: 1, periodCloseDay: 63, filedDay: 66, hash: '',
    income: { revUnrelated: rev, relatedPartyIncome: 0, cogs: rev * 0.65, opex: 0, ebitda: 0, netIncome: 10, niAdj: 10, interest: 0 },
    balance: { cash: 500, receivables: 0, inventory: 0, ppe: 0, debt: 0, equity: 0, retainedEarnings: 0 },
    cashFlow: { ocf: 10, capex: 0, capexMaint: 0, fcf: 10, dividends: 0, buybacks: 0 }, headcountBand: '1-10',
    backlog: 0, backlogContribution: 0, unitCost, matUnit, inputIndex,
    backlogReversal: { nonConversion: 0, baseRate: 0, excessLift: 0, repayment: 0 },
  };
}

describe('the public view moves only at a filing (spec 6.4, 11)', () => {
  it('the registry band is null until the first filing and then moves only at a filing', () => {
    const h = harness('reg');
    const id = found(h);
    advance(h, 1, 64); // closed at 63, filed at 66
    const c = h.w.companies[id]!;
    expect(c.closed.length).toBe(1);
    expect(publicCompanyView(c, c.foundedDay).registry!.revenueBand).toBeNull();
    advance(h, 65, 66);
    expect(c.filings.length).toBe(1);
    const rev = c.filings[0]!.income.revUnrelated;
    const band = publicCompanyView(c, c.foundedDay).registry!.revenueBand!;
    expect(band[0]).toBeCloseTo(rev * 0.9, 6);
    expect(band[1]).toBeCloseTo(rev * 1.1, 6);
    advance(h, 67, 100);
    expect(publicCompanyView(c, c.foundedDay).registry!.revenueBand).toEqual(band);
  });

  it('the public headcount band and distress flag do not show unfiled hires or distress', () => {
    const h = harness('pub');
    const id = found(h);
    const c = h.w.companies[id]!;
    expect(companyAction(h.w, h.env, 'founder', id, { kind: 'hire', role: 'ops', n: 10 }).ok).toBe(true);
    advance(h, 1, 10);
    expect(Object.values(c.staff).reduce((s, x) => s + x.total, 0)).toBe(20);
    expect(publicCompanyView(c, c.foundedDay).headcountBand).toBe('1-10');
    c.distress = true;
    expect(publicCompanyView(c, c.foundedDay).distressFlag).toBe(false);
    advance(h, 11, 66);
    expect(publicCompanyView(c, c.foundedDay).headcountBand).toBe(c.filings[0]!.headcountBand);
    expect(publicCompanyView(c, c.foundedDay).distressFlag).toBe(c.filings[0]!.balance.cash < 0);
  });
});

describe('the consensus margin moves the material part of unit cost by the commodity index (G23)', () => {
  it('the consensus unit cost moves its material part with the index and keeps the rest at the filed level', () => {
    const f = filing(1000, 10, 6, 1);
    expect(consensusUnitCost(f, 1)).toBeCloseTo(10, 9);
    expect(consensusUnitCost(f, 1.5)).toBeCloseTo(13, 9);
    expect(consensusUnitCost(f, 0.5)).toBeCloseTo(7, 9);
  });

  it('a rise in the commodity index lowers the consensus margin of a staples company', () => {
    const h = harness('cm');
    const id = found(h);
    const c = h.w.companies[id]!;
    c.sector = 'staples';
    c.filings = [filing(1000, 6.5, 2, 1), filing(1000, 6.5, 2, 1), filing(1000, 6.5, 2, 1), filing(1000, 6.5, 2, 1)];
    const flat = consensusInputs(c, 1000, 500, 20, 50, 1).margin;
    const up = consensusInputs(c, 1000, 500, 20, 50, 1.3).margin;
    expect(up).toBeLessThan(flat);
  });
});

describe('the founder unit cost is the day\'s unit cost (spec 1)', () => {
  it('material x index x (1 - eff), plus overtime above 100% utilization', () => {
    const h = harness('uc');
    const id = found(h);
    const c = h.w.companies[id]!;
    c.sector = 'industrials';
    c.indexLast = 1.2;
    c.eff = 0.1;
    c.lastUtil = 0.5;
    expect(founderCompanyView(h.w, 'founder', id, 5).productsPrivate[0]!.unitCost).toBeCloseTo(materialPerUnit('industrials') * 1.2 * 0.9, 9);
    c.lastUtil = 1.2;
    expect(founderCompanyView(h.w, 'founder', id, 5).productsPrivate[0]!.unitCost).toBeCloseTo(materialPerUnit('industrials') * 1.2 * 0.9 + overtimePerUnit(), 9);
  });
});
