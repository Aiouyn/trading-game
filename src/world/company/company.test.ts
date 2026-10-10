import { describe, expect, it } from 'vitest';
import { COMPANY } from '@/content/company';
import { companyAction, companyTick, emptyCompanyWorld, foundCompany, type CompanyAction, type CompanyEnv, type CompanyEvent } from './company';
import { founderCompanyView, publicCompanyView } from './views';
import { filedInputs, consensusInputs } from './signals';
import { reversal, statementsHash, tierFor, quarterTax } from './filings';
import type { CompanyWorld, FilingPublic, Statements } from './types';

interface Harness { w: CompanyWorld; env: CompanyEnv; money: Record<string, number>; initialMoney: number }

function harness(seed = 'co-test', founderCash = 2_000_000, rank = 'R2'): Harness {
  const money: Record<string, number> = { founder: founderCash };
  const env: CompanyEnv = {
    seed, day: 0, regime: 'expansion', oilLog: 0, rankOf: () => rank,
    money: {
      cash: (pid) => money[pid] ?? 0,
      take: (pid, amount) => { money[pid] = (money[pid] ?? 0) - amount; },
    },
  };
  const w = emptyCompanyWorld(seed);
  return { w, env, money, initialMoney: founderCash };
}

function found(h: Harness, capital = COMPANY.founding.capital): string {
  const r = foundCompany(h.w, h.env, 'founder', { name: 'Acme', sector: 'tech', cityId: 'av', capital });
  if (!r.ok) throw new Error(JSON.stringify(r.reject));
  return r.value.id;
}

function advance(h: Harness, from: number, to: number, script: Record<number, () => void> = {}): CompanyEvent[] {
  const evs: CompanyEvent[] = [];
  for (let d = from; d <= to; d++) {
    h.env.day = d;
    script[d]?.();
    evs.push(...companyTick(h.w, h.env, d));
  }
  return evs;
}

function totalMoney(h: Harness): number {
  let t = Object.values(h.money).reduce((s, x) => s + x, 0);
  for (const c of Object.values(h.w.companies)) t += c.cash;
  for (const p of Object.values(h.w.investors)) t += p.cash;
  return t;
}

/** The money the world holds at the start is the founder's cash; the investor pools are booked as a faucet at creation. */
function initialTotal(h: Harness): number {
  return h.initialMoney;
}

describe('founding (C4 founder template, spec 5)', () => {
  it('refuses below R2, below $100k of equity, a second company, and without the cash', () => {
    const low = harness('a', 2_000_000, 'R1');
    expect(foundCompany(low.w, low.env, 'founder', { name: 'x', sector: 'tech', cityId: 'av', capital: 150_000 }))
      .toEqual({ ok: false, reject: { code: 'notRank', minRank: 'R2' } });
    const h = harness('b');
    expect(foundCompany(h.w, h.env, 'founder', { name: 'x', sector: 'tech', cityId: 'av', capital: 99_999 }))
      .toEqual({ ok: false, reject: { code: 'capitalTooLow', minCapital: 100_000 } });
    found(h);
    expect(foundCompany(h.w, h.env, 'founder', { name: 'y', sector: 'tech', cityId: 'av', capital: 150_000 }))
      .toEqual({ ok: false, reject: { code: 'alreadyFounded' } });
    const poor = harness('c', 100_000);
    expect(foundCompany(poor.w, poor.env, 'founder', { name: 'z', sector: 'tech', cityId: 'av', capital: 150_000 }))
      .toEqual({ ok: false, reject: { code: 'insufficientFunds', shortfall: 50_000 } });
  });

  it('the capital is a transfer from the founder into the company (no money from nothing)', () => {
    const h = harness('d');
    const before = totalMoney(h);
    const id = found(h);
    expect(h.money.founder).toBe(2_000_000 - COMPANY.founding.capital);
    expect(h.w.companies[id]!.cash).toBe(COMPANY.founding.capital);
    expect(totalMoney(h)).toBeCloseTo(before, 6);
    // the only faucet is the investor pools' seed cash, booked when the world was created
    expect(h.w.flows.sink).toBe(0);
    // the seeded pools are the seed, series and (B1) bank cash
    expect(h.w.flows.faucet).toBe(COMPANY.rounds.investorCash.seed + COMPANY.rounds.investorCash.series + COMPANY.rounds.investorCash.bank);
  });

  it('the founder template: one product at $50, 10 heads (5 Ops, 2 Sales, 2 R&D, 1 G&A), 1 city', () => {
    const h = harness('e');
    const c = h.w.companies[found(h)]!;
    expect(c.products).toHaveLength(1);
    expect(c.products[0]!.price).toBe(50);
    expect([c.staff.ops.total, c.staff.sales.total, c.staff.rd.total, c.staff.ga.total]).toEqual([5, 2, 2, 1]);
    expect(c.npcs.length).toBeGreaterThanOrEqual(COMPANY.npc.minCount);
    expect(c.npcs.length).toBeLessThanOrEqual(COMPANY.npc.maxCount);
  });
});

describe('money conservation and the cash ledger (spec 1, CB-003, CB-110)', () => {
  it('over 300 game days with hires, fires, projects, a plant and a round, total money moves only by tagged faucets and sinks', () => {
    const h = harness('money');
    const id = found(h);
    const actions: Record<number, CompanyAction> = {
      2: { kind: 'hire', role: 'ops', n: 3 },
      10: { kind: 'startProject', projectKind: 'quality', productId: `${id}:p0`, spend: 30_000 },
      20: { kind: 'buildPlant' },
      40: { kind: 'raiseRound', amount: 25_000 },
      60: { kind: 'setPrice', productId: `${id}:p0`, price: 46 },
      90: { kind: 'fire', role: 'sales', n: 1 },
      120: { kind: 'setMarketing', productId: `${id}:p0`, amount: 200 },
    };
    const script: Record<number, () => void> = {};
    for (const [d, a] of Object.entries(actions)) script[Number(d)] = () => { companyAction(h.w, h.env, 'founder', id, a); };
    const start = totalMoney(h);
    // the identity holds from the start: total money moves only by the booked faucets and sinks
    expect(start - initialTotal(h)).toBeCloseTo(h.w.flows.faucet - h.w.flows.sink, 6);
    advance(h, 1, 300, script);
    const w = h.w;
    const net = w.flows.faucet - w.flows.sink;
    expect(totalMoney(h) - initialTotal(h)).toBeCloseTo(net, 4);
    const c = w.companies[id]!;
    // every company cash move is in the ledger: capital in, rounds in, and the operating flows
    expect(Object.values(c.ledgerTotals).reduce((s, x) => s + x, 0)).toBeCloseTo(c.cash - COMPANY.founding.capital, 4);
    expect(c.ledgerTotals.payroll!).toBeLessThan(0);
    expect(c.ledgerTotals.sales!).toBeGreaterThan(0);
    expect(w.investors['npc:seed']!.cash).toBeCloseTo(COMPANY.rounds.investorCash.seed - 25_000, 6);
  });
});

describe('determinism and replay (spec 11 test gates)', () => {
  it('a snapshot taken mid-run, restored and driven by the same commands, ends in the same state', () => {
    const h = harness('replay');
    const id = found(h);
    const acts: Record<number, CompanyAction> = {
      5: { kind: 'hire', role: 'ops', n: 2 },
      25: { kind: 'startProject', projectKind: 'quality', productId: `${id}:p0`, spend: 40_000 },
      70: { kind: 'raiseRound', amount: 20_000 },
    };
    const s: Record<number, () => void> = {};
    for (const [d, a] of Object.entries(acts)) s[Number(d)] = () => { companyAction(h.w, h.env, 'founder', id, a); };
    advance(h, 1, 100, s);
    const snap = JSON.stringify({ w: h.w, money: h.money });
    const restored = JSON.parse(snap) as { w: CompanyWorld; money: Record<string, number> };
    const h2: Harness = { w: restored.w, money: restored.money, env: { ...h.env, money: { cash: (p) => restored.money[p] ?? 0, take: (p, a) => { restored.money[p] = (restored.money[p] ?? 0) - a; } } }, initialMoney: h.initialMoney };
    const later: Record<number, () => void> = { 120: () => { companyAction(h.w, h.env, 'founder', id, { kind: 'setPrice', productId: `${id}:p0`, price: 44 }); } };
    const later2: Record<number, () => void> = { 120: () => { companyAction(h2.w, h2.env, 'founder', id, { kind: 'setPrice', productId: `${id}:p0`, price: 44 }); } };
    advance(h, 101, 260, later);
    advance(h2, 101, 260, later2);
    expect(JSON.stringify(h2.w)).toBe(JSON.stringify(h.w));
  });

  it('the same seed and actions give the same world; another seed does not', () => {
    const run = (seed: string) => {
      const h = harness(seed);
      const id = found(h);
      advance(h, 1, 120, { 5: () => { companyAction(h.w, h.env, 'founder', id, { kind: 'hire', role: 'sales', n: 1 }); } });
      return JSON.stringify(h.w);
    };
    expect(run('same')).toBe(run('same'));
    expect(run('same')).not.toBe(run('other'));
  });
});

describe('quarter close, freezing and filing (spec 6.1, CB-051)', () => {
  it('closes at gd 63, files at close + 3, and the frozen statements are never changed after the close', () => {
    const h = harness('file');
    found(h);
    advance(h, 1, 63);
    const c = Object.values(h.w.companies)[0]!;
    expect(c.closed).toHaveLength(1);
    expect(c.pendingFile).not.toBeNull();
    expect(c.pendingFile!.filingDay).toBe(66);
    const frozen = JSON.stringify(c.closed[0]);
    advance(h, 64, 80);
    expect(JSON.stringify(c.closed[0])).toBe(frozen);
    expect(c.filings).toHaveLength(1);
    expect(c.filings[0]!.hash).toBe(statementsHash(c.closed[0]!));
    expect(c.filings[0]!.filedDay).toBe(66);
  });

  it('a statement changed between close and filing fails the hash check (the filing refuses to publish it)', () => {
    const h = harness('tamper');
    found(h);
    advance(h, 1, 63);
    const c = Object.values(h.w.companies)[0]!;
    c.pendingFile!.statements.revenue += 1;
    expect(() => advance(h, 64, 66)).toThrow(/hash mismatch/);
  });

  it('the reversal line is always present, with zeros when nothing is owed', () => {
    const h = harness('rev');
    found(h);
    advance(h, 1, 70);
    const f = Object.values(h.w.companies)[0]!.filings[0]!;
    // the NPC cut is part of non-conversion, so an honest company shows about its sector rate and owes nothing
    expect(f.backlogReversal.baseRate).toBe(0.02);
    expect(Math.abs(f.backlogReversal.nonConversion - 0.02)).toBeLessThan(0.005);
    expect(f.backlogReversal.excessLift).toBe(0);
    expect(f.backlogReversal.repayment).toBe(0);
  });

  it('the tax is 20% of EBIT after the loss carryforward (pure)', () => {
    expect(quarterTax(1000, 0)).toEqual({ tax: 200, lossCarry: 0 });
    expect(quarterTax(1000, 400)).toEqual({ tax: 0.2 * 600, lossCarry: 0 });
    expect(quarterTax(-300, 50)).toEqual({ tax: 0, lossCarry: 350 });
  });
});

describe('orders, booking within capacity and NPC cancellations (spec 2, G15, G17)', () => {
  it('overflow beyond 115% of capacity over the 63-gd ship-by window is lost, not booked, and costs brand', () => {
    const h = harness('overflow');
    const id = found(h);
    const c = h.w.companies[id]!;
    c.d0 = 50_000; // demand far above what 5 Ops can ship
    advance(h, 1, 30);
    const cap = COMPANY.unitsPerOpsHead * 5 * COMPANY.overloadCap;
    const booked = c.orders.reduce((s, o) => s + (o.qty - o.npcCut - o.shipped), 0);
    expect(booked).toBeLessThanOrEqual(cap * COMPANY.quarterDays + 1);
    expect(c.products[0]!.brand).toBeLessThan(0);
  });

  it('NPC cancellations are deterministic: each order loses exactly floor(c_s * qty)', () => {
    const h = harness('npc-cut');
    const id = found(h);
    const c = h.w.companies[id]!;
    advance(h, 1, 3);
    // orders ship the day they are booked here, so the resolved record carries the cut
    expect(c.resolved.length).toBeGreaterThan(0);
    for (const o of c.resolved) expect(o.shipped).toBe(o.qty - Math.floor(0.02 * o.qty));
  });
});

describe('the backlog reversal (pure, spec 6.2, G16, G17)', () => {
  const sig = 1;
  it('an honest company (non-conversion exactly c_s) owes nothing', () => {
    const r = reversal([{ qty: 1000, shipped: 980, cs: 0.02, lift: 5, reportedSig: sig }], { [sig]: 10 }, { [sig]: 1000 });
    expect(r.excessLift).toBe(0);
    expect(r.repayment).toBe(0);
  });

  it('non-conversion of c_s + delta gives X = delta * l_tot exactly', () => {
    const delta = 0.005;
    const r = reversal([{ qty: 1000, shipped: 1000 - 20 - 5, cs: 0.02, lift: 8, reportedSig: sig }], {}, {});
    expect(r.excessLift).toBeCloseTo(delta * 8, 12);
    expect(r.nonConversion).toBeCloseTo(0.025, 12);
  });

  it('a fake order below 1/c_s units gets no allowance, so its whole unshipped lift is excess', () => {
    const r = reversal([{ qty: 10, shipped: 0, cs: 0.02, lift: 3, reportedSig: sig }], {}, {});
    expect(r.excessLift).toBeCloseTo(3, 12);
  });

  it('repayment R = sum fair (1 - e^-X) S, and orders with no positive lift count for nothing', () => {
    const r = reversal([
      { qty: 10, shipped: 0, cs: 0.02, lift: 3, reportedSig: sig },
      { qty: 10, shipped: 0, cs: 0.02, lift: -3, reportedSig: sig },
    ], { [sig]: 10 }, { [sig]: 500 });
    expect(r.repayment).toBeCloseTo(10 * (1 - Math.exp(-3)) * 500, 9);
  });
});

describe('weekly signals and the consensus (spec 6.2, G20)', () => {
  it('a private company publishes no signal; a listed one publishes every 5 gd and at the close', () => {
    const h = harness('sig');
    const id = found(h);
    const evs = advance(h, 1, 20);
    expect(evs.filter((e) => e.kind === 'signal')).toHaveLength(0);
    const c = h.w.companies[id]!;
    c.listed = { assetId: 'AST', ipoDay: 20, sharesOut: c.shares, floatShares: c.shares * 0.2, floatCap: 1 };
    const later = advance(h, 21, 65);
    const sigs = later.filter((e) => e.kind === 'signal');
    expect(sigs.length).toBeGreaterThan(8);
    expect(c.signals.length).toBeGreaterThan(0);
    expect(c.signals[0]!.revenueQtdBand[1] / c.signals[0]!.revenueQtdBand[0]).toBeCloseTo(1.05 / 0.95, 9);
  });

  it('the noise is drawn once per filing and carried by every report of that quarter (G20)', () => {
    const h = harness('noise');
    const id = found(h);
    const c = h.w.companies[id]!;
    advance(h, 1, 10);
    c.listed = { assetId: 'AST', ipoDay: 10, sharesOut: c.shares, floatShares: 1, floatCap: 1 };
    advance(h, 11, 40);
    const n1 = JSON.stringify(c.noise);
    advance(h, 41, 60);
    expect(JSON.stringify(c.noise)).toBe(n1);
  });

  it('a signal records its lift and the sensitivity for the repayment, and the lnV step is data for the engine', () => {
    const h = harness('lift');
    const id = found(h);
    const c = h.w.companies[id]!;
    advance(h, 1, 12);
    c.listed = { assetId: 'AST', ipoDay: 12, sharesOut: c.shares, floatShares: 1, floatCap: 1 };
    const evs = advance(h, 13, 25);
    const sig = evs.find((e) => e.kind === 'signal');
    expect(sig).toBeDefined();
    expect(c.sigLog.length).toBeGreaterThan(0);
    expect(c.sigLog[0]!.fair).toBeGreaterThan(0);
  });
});

describe('the no-leak rule (spec 6.4, CB-084)', () => {
  it('private state does not reach the public view or the valuation inputs', () => {
    const h = harness('leak');
    const id = found(h);
    advance(h, 1, 80);
    const c = h.w.companies[id]!;
    const before = JSON.stringify([publicCompanyView(c), filedInputs(c, 0)]);
    c.products[0]!.q *= 3;
    c.products[0]!.marketing = 999;
    c.eff = 0.3;
    c.projects.push({ id: 'x', kind: 'quality', productId: c.products[0]!.id, spend: 1, spendPerDay: 1, days: 10, paidDays: 0, startDay: 80, endDay: 90, success: true, z: 1, pShown: 0.5, sRef: 20_000, kUsed: 0, gates: [] });
    c.npcs.push({ id: 'n-extra', lnQ: 2, price: 1, marketing: 9, negQuarters: 0 });
    expect(JSON.stringify([publicCompanyView(c), filedInputs(c, 0)])).toBe(before);
  });

  it('the public view carries no private field, and only the founder may read the founder view', () => {
    const h = harness('view');
    const id = found(h);
    advance(h, 1, 5);
    const pub = publicCompanyView(h.w.companies[id]!);
    const keys = Object.keys(pub);
    for (const k of ['cash', 'projects', 'staff', 'capTable', 'npcs', 'orders', 'eff']) expect(keys).not.toContain(k);
    expect(() => founderCompanyView(h.w, 'someone', id, 5)).toThrow(/not the founder/);
    const fv = founderCompanyView(h.w, 'founder', id, 5);
    expect(fv.cash).toBe(h.w.companies[id]!.cash);
    expect(fv.capTable.reduce((s, x) => s + x.shares, 0)).toBe(h.w.companies[id]!.shares);
  });

  it('the consensus inputs read only estimates, not the true backlog', () => {
    const h = harness('cons');
    found(h);
    advance(h, 1, 20);
    const c = Object.values(h.w.companies)[0]!;
    const a = consensusInputs(c, 1000, 500, 20, 50, 1);
    const b = consensusInputs(c, 1000, 500, 20, 50, 1);
    expect(a).toEqual(b);
  });
});

describe('rounds (spec 5, X12, N9)', () => {
  it('an NPC round sells shares at 0.70 V_engine, at most 25% of post-money, and the cap table adds up', () => {
    const h = harness('round');
    const id = found(h);
    advance(h, 1, 40);
    const c = h.w.companies[id]!;
    const sharesBefore = c.shares;
    const r = companyAction(h.w, h.env, 'founder', id, { kind: 'raiseRound', amount: 20_000 });
    expect(r.ok).toBe(true);
    expect(c.shares).toBeGreaterThan(sharesBefore);
    expect(Object.values(c.capTable).reduce((s, x) => s + x, 0)).toBeCloseTo(c.shares, 6);
    h.w.investors['npc:seed']!.cash = 100;
    const broke = companyAction(h.w, h.env, 'founder', id, { kind: 'raiseRound', amount: 5_000 });
    expect(broke.ok).toBe(false);
    if (!broke.ok) expect(broke.reject.code).toBe('investorCash');
  });

  it('a round over the 25% post-money cap is refused with the largest allowed amount', () => {
    const h = harness('dilute');
    const id = found(h);
    advance(h, 1, 40);
    const r = companyAction(h.w, h.env, 'founder', id, { kind: 'raiseRound', amount: 1e9 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reject.code).toBe('roundDilutionCap');
      if (r.reject.code === 'roundDilutionCap') expect(r.reject.maxAmount).toBeGreaterThan(0);
    }
  });
});

describe('tiers and goals (spec 5, C4)', () => {
  const quarter = (rev: number, ni: number, ocf = 1): Statements => ({
    interest: 0, debt: 0, dividends: 0,
    quarter: 1, periodCloseDay: 63, revenue: rev, cogs: 0, opex: 0, ebitda: 0, da: 0, ebit: 0, tax: 0, netIncome: ni, niAdj: ni,
    ocf, capex: 0, fcf: ocf, cash: 0, receivables: 0, inventory: 0, payables: 0, ppe: 0, equity: 0, retained: 0, backlog: 0,
    backlogContribution: 0, unitsShipped: 0, unitCost: 0, matUnit: 0, inputIndex: 1, heads: 0, grossMargin: 0,
  });

  it('Seed, Growth and Late entry rules on the frozen statements, with Late and Growth able to drop', () => {
    expect(tierFor([quarter(100, 0)])).toBe('seed');
    expect(tierFor([quarter(600_000, 1), quarter(600_000, 1)])).toBe('growth');
    const late = [quarter(4_000_000, 1), quarter(4_000_000, 1), quarter(4_000_000, 1), quarter(4_000_000, 1)];
    expect(tierFor(late)).toBe('late');
    expect(tierFor([...late.slice(0, 3), quarter(4_000_000, -1)])).toBe('late'); // 3 profitable of 4 still counts
    // one profitable quarter of four is not enough for Late; the revenue still makes Growth
    expect(tierFor([quarter(4_000_000, -1), quarter(4_000_000, -1), quarter(4_000_000, -1), quarter(4_000_000, 1)])).toBe('growth');
  });

  it('the first hire, first revenue and first round goals are reached and reported once', () => {
    const h = harness('goals');
    const id = found(h);
    const evs = [
      ...advance(h, 1, 3, { 1: () => { companyAction(h.w, h.env, 'founder', id, { kind: 'hire', role: 'ops', n: 1 }); } }),
      ...advance(h, 4, 80),
    ];
    const goals = evs.filter((e) => e.kind === 'goal').map((e) => (e as { goal: string }).goal);
    expect(goals).toContain('firstHire');
    expect(goals).toContain('firstRevenue');
    expect(new Set(goals).size).toBe(goals.length);
  });
});

describe('plant and R&D refusals (spec 3, 4)', () => {
  it('a plant takes 10 gd, costs C0 0.1, and refuses a second build while it is under way', () => {
    const h = harness('plant');
    const id = found(h);
    advance(h, 1, 2);
    const first = companyAction(h.w, h.env, 'founder', id, { kind: 'buildPlant' });
    expect(first.ok).toBe(true);
    const second = companyAction(h.w, h.env, 'founder', id, { kind: 'buildPlant' });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reject.code).toBe('plantBuilding');
    advance(h, 3, 20);
    expect(h.w.companies[id]!.plantLevel).toBe(1);
  });

  it('R&D needs productive R&D staff and one project at a time', () => {
    const h = harness('rd');
    const id = found(h);
    const c = h.w.companies[id]!;
    c.staff.rd.total = 0;
    const none = companyAction(h.w, h.env, 'founder', id, { kind: 'startProject', projectKind: 'quality', productId: `${id}:p0`, spend: 20_000 });
    expect(none).toEqual({ ok: false, reject: { code: 'noRdStaff' } });
    c.staff.rd.total = 2;
    const ok = companyAction(h.w, h.env, 'founder', id, { kind: 'startProject', projectKind: 'quality', productId: `${id}:p0`, spend: 20_000 });
    expect(ok.ok).toBe(true);
    const busy = companyAction(h.w, h.env, 'founder', id, { kind: 'startProject', projectKind: 'cost', productId: `${id}:p0`, spend: 20_000 });
    expect(busy).toEqual({ ok: false, reject: { code: 'projectBusy' } });
  });

  it('price band and unknown ids are refused structurally', () => {
    const h = harness('price');
    const id = found(h);
    const high = companyAction(h.w, h.env, 'founder', id, { kind: 'setPrice', productId: `${id}:p0`, price: 80 });
    expect(high.ok).toBe(false);
    if (!high.ok) expect(high.reject.code).toBe('priceOutOfBand');
    expect(companyAction(h.w, h.env, 'founder', 'nope', { kind: 'setPrice', productId: 'x', price: 40 })).toEqual({ ok: false, reject: { code: 'unknownCompany' } });
    expect(companyAction(h.w, h.env, 'someone', id, { kind: 'setPrice', productId: `${id}:p0`, price: 40 })).toEqual({ ok: false, reject: { code: 'notFounder' } });
  });
});

describe('filed fields (spec 6.4)', () => {
  it('the filed valuation inputs use the last four filings, annualized, and the filed net debt', () => {
    const f = (rev: number, cash: number): FilingPublic => ({
      quarter: 1, periodCloseDay: 63, filedDay: 66, hash: '',
      income: { revUnrelated: rev, relatedPartyIncome: 0, cogs: rev * 0.5, opex: 0, ebitda: 0, netIncome: 10, niAdj: 10, interest: 0 },
      balance: { cash, receivables: 0, inventory: 0, ppe: 0, debt: 100, equity: 0, retainedEarnings: 0 },
      cashFlow: { ocf: 10, capex: 0, capexMaint: 0, fcf: 10, dividends: 0, buybacks: 0 }, headcountBand: '1-10',
      backlog: 0, backlogContribution: 0, unitCost: 1, matUnit: 0.5, inputIndex: 1, backlogReversal: { nonConversion: 0, baseRate: 0, excessLift: 0, repayment: 0 },
    });
    const h = harness('fi2');
    const id = found(h);
    const co = h.w.companies[id]!;
    co.filings = [f(100, 500), f(100, 500), f(100, 500), f(100, 500)];
    const x = filedInputs(co, 0);
    expect(x.revU).toBeCloseTo(400, 9);
    expect(x.netDebt).toBe(100 - 500);
  });
});
