import { describe, expect, it } from 'vitest';
import { COMPANY, PHARMA_GATES, type CompanySector } from '@/content/company';
import { companyAction, emptyCompanyWorld, foundCompany, type CompanyEnv } from './company';
import { founderCompanyView } from './views';
import { PREVIEW_HORIZON_DAYS } from './preview';
import { severanceOf } from './governance';
import type { CompanyWorld } from './types';

// The operations half the Company app shows: the decision card and the runway paths (the engine's own preview), the
// severance a firing pays, the G&A span line, the pharma gate odds and the patents in force.

interface Harness { w: CompanyWorld; env: CompanyEnv; id: string; day: number }

function founded(sector: CompanySector = 'tech', cash?: number): Harness {
  const money: Record<string, number> = { founder: 5_000_000 };
  const env: CompanyEnv = {
    seed: 'ops', day: 0, regime: 'expansion', oilLog: 0, rankOf: () => 'R2',
    money: {
      cash: (pid) => money[pid] ?? 0,
      take: (pid, amount) => { money[pid] = (money[pid] ?? 0) - amount; },
      give: (pid, amount) => { money[pid] = (money[pid] ?? 0) + amount; },
    },
  };
  const w = emptyCompanyWorld('ops');
  const r = foundCompany(w, env, 'founder', { name: 'Ops Co.', sector, cityId: 'avalon', capital: COMPANY.founding.capital });
  if (!r.ok) throw new Error(JSON.stringify(r.reject));
  const id = r.value.id;
  if (cash !== undefined) w.companies[id]!.cash = cash;
  return { w, env, id, day: 1 };
}

describe('the decision card and the runway chart', () => {
  it('offers three spend levels at multiples of S_ref, with the odds band of each', () => {
    const h = founded();
    const v = founderCompanyView(h.w, 'founder', h.id, h.day);
    const card = v.decision!;
    expect(card).not.toBeNull();
    // before any revenue, S_ref is its floor (the same number a project would freeze)
    expect(card.levels.map((l) => l.spend)).toEqual([COMPANY.rd.sRefMin / 2, COMPANY.rd.sRefMin, COMPANY.rd.sRefMin * 2]);
    for (const l of card.levels) {
      expect(l.pLow).toBeLessThanOrEqual(l.pHigh);
      expect(l.gainPoints[0]).toBeLessThanOrEqual(l.gainPoints[1]);
      expect(l.gainPoints[1]).toBeLessThanOrEqual(l.gainPoints[2]);
      expect(l.cashPath.length).toBe(PREVIEW_HORIZON_DAYS + 1);
    }
    expect(card.cashNow.length).toBe(PREVIEW_HORIZON_DAYS + 1);
  });

  it('the cash paths start at today cash, and a spend lowers them on the days the project runs', () => {
    const h = founded();
    const card = founderCompanyView(h.w, 'founder', h.id, h.day).decision!;
    const cash = founderCompanyView(h.w, 'founder', h.id, h.day).cash;
    expect(card.cashNow[0]).toBe(cash);
    expect(card.levels[1]!.cashPath[0]).toBe(cash);
    const last = PREVIEW_HORIZON_DAYS;
    expect(card.levels[1]!.cashPath[last]!).toBeLessThan(card.cashNow[last]!);
    // the high spend lies below the low spend on the same day
    expect(card.levels[2]!.cashPath[last]!).toBeLessThan(card.levels[0]!.cashPath[last]!);
  });

  it('the runway after a spend is cash less the spend over the payroll (null without payroll)', () => {
    const h = founded();
    const v = founderCompanyView(h.w, 'founder', h.id, h.day);
    const mid = v.decision!.levels[1]!;
    if (v.payrollPerDay > 0) expect(mid.runwayAfter).toBeCloseTo(Math.max(0, v.cash - mid.spend) / v.payrollPerDay, 9);
    else expect(mid.runwayAfter).toBeNull();
  });

  it('the decision card is absent without a product', () => {
    const h = founded();
    h.w.companies[h.id]!.products = [];
    expect(founderCompanyView(h.w, 'founder', h.id, h.day).decision).toBeNull();
  });
});

describe('the executive seat: severance and the term', () => {
  it('shows the severance a firing pays, and the engine pays exactly that amount', () => {
    const h = founded('tech', 5_000_000);
    const hire = companyAction(h.w, h.env, 'founder', h.id, { kind: 'hireExec', role: 'CFO', trait: 'Steady', holder: { kind: 'npc' } });
    expect(hire.ok).toBe(true);
    const seat = founderCompanyView(h.w, 'founder', h.id, h.day).execs.CFO!;
    expect(seat.severance).toBe(severanceOf(seat.salary));
    expect(seat.severance).toBe(seat.salary * COMPANY.governance.exec.severanceDays);
    // before the term ends the firing is refused, and nothing is paid
    const early = companyAction(h.w, h.env, 'founder', h.id, { kind: 'fireExec', role: 'CFO' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.reject.code).toBe('execTerm');
    // at the end of the term the firing goes through and the amount is the one the view showed
    h.env.day = seat.termEnd;
    const done = companyAction(h.w, h.env, 'founder', h.id, { kind: 'fireExec', role: 'CFO' });
    expect(done.ok).toBe(true);
    if (done.ok) expect((done.value as { severance: number }).severance).toBe(seat.severance);
    expect(founderCompanyView(h.w, 'founder', h.id, seat.termEnd).execs.CFO).toBeNull();
  });
});

describe('the G&A span line', () => {
  it('reports the heads the span needs and an output factor of one when it is covered', () => {
    const h = founded();
    const v = founderCompanyView(h.w, 'founder', h.id, h.day);
    const others = v.staff.ops.heads + v.staff.sales.heads + v.staff.rd.heads;
    expect(v.gaSpan.span).toBe(COMPANY.gaSpan);
    expect(v.gaSpan.gaHeads).toBe(v.staff.ga.heads);
    expect(v.gaSpan.others).toBe(others);
    expect(v.gaSpan.needed).toBe(Math.ceil(others / COMPANY.gaSpan));
    if (v.gaSpan.gaHeads >= v.gaSpan.needed) expect(v.gaSpan.factor).toBe(1);
    else expect(v.gaSpan.factor).toBeLessThan(1);
  });
});

describe('the R&D views: pharma gates and patents', () => {
  it('a pharma project shows the odds of its three gates, and other sectors show none', () => {
    const h = founded('health', 5_000_000);
    const r = companyAction(h.w, h.env, 'founder', h.id, { kind: 'startProject', projectKind: 'quality', productId: h.w.companies[h.id]!.products[0]!.id, spend: 50_000 });
    expect(r.ok).toBe(true);
    const proj = founderCompanyView(h.w, 'founder', h.id, h.day).projects[0]!;
    expect(proj.gateOdds).toEqual([...PHARMA_GATES.odds]);
    const plain = founded('tech', 5_000_000);
    companyAction(plain.w, plain.env, 'founder', plain.id, { kind: 'startProject', projectKind: 'quality', productId: plain.w.companies[plain.id]!.products[0]!.id, spend: 50_000 });
    expect(founderCompanyView(plain.w, 'founder', plain.id, plain.day).projects[0]!.gateOdds).toEqual([]);
  });

  it('a patent in force shows its end day and its gain in score points; an expired one does not', () => {
    const h = founded('health');
    const c = h.w.companies[h.id]!;
    c.products[0]!.patents = [{ until: 300, lnGain: 0.1 }, { until: 0, lnGain: 0.5 }];
    const p = founderCompanyView(h.w, 'founder', h.id, 100).productsPrivate[0]!;
    expect(p.patents).toEqual([{ until: 300, points: COMPANY.qualityScale.slope * 0.1 }]);
  });
});
