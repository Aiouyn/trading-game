import { describe, expect, it } from 'vitest';
import { COMPANY } from '@/content/company';
import { companyAction, companyTick, emptyCompanyWorld, foundCompany, type CompanyEnv } from './company';
import { announceCeoChange, boardVote, ceoDay, ceoFreezeOn, controllerOf, execMult, fireExec, hireExec, setGuarantee } from './governance';
import { salaryCapPerDay } from './failure';
import type { Company, CompanyWorld } from './types';

interface Harness { w: CompanyWorld; env: CompanyEnv; money: Record<string, number> }

function harness(seed = 'gov-test', founderCash = 5_000_000): Harness {
  const money: Record<string, number> = { founder: founderCash, rival: 900_000 };
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

function found(h: Harness): Company {
  const r = foundCompany(h.w, h.env, 'founder', { name: 'Acme', sector: 'tech', cityId: 'av', capital: COMPANY.founding.capital });
  if (!r.ok) throw new Error(JSON.stringify(r.reject));
  return h.w.companies[r.value.id]!;
}

/** Money the world holds: players, company cash and estates, investor pools, less sinks plus faucets. Constant over time. */
function identity(h: Harness): number {
  let t = Object.values(h.money).reduce((s, x) => s + x, 0);
  for (const x of Object.values(h.w.companies)) t += x.cash + (x.estate ?? 0);
  for (const p of Object.values(h.w.investors)) t += p.cash;
  return t + h.w.flows.sink - h.w.flows.faucet;
}

function advance(h: Harness, from: number, to: number): void {
  for (let d = from; d <= to; d++) {
    h.env.day = d;
    companyTick(h.w, h.env, d);
  }
}

describe('control and executive traits (C4)', () => {
  it('the founder controls a company it founded; a stranger does not', () => {
    const h = harness();
    const c = found(h);
    expect(controllerOf(c)).toBe('founder');
    expect(hireExec(c, h.env, 'rival', { role: 'CFO', trait: 'Operator', holder: { kind: 'npc' } }))
      .toEqual({ ok: false, reject: { code: 'notController' } });
  });

  it('an executive trait moves its coefficient by 5 to 10 percent; no executive means no effect', () => {
    const h = harness();
    const c = found(h);
    expect(execMult(c, 'capacity')).toBe(1);
    hireExec(c, h.env, 'founder', { role: 'COO', trait: 'Operator', holder: { kind: 'npc' } });
    hireExec(c, h.env, 'founder', { role: 'CTO', trait: 'Cost-cutter', holder: { kind: 'npc' } });
    expect(execMult(c, 'capacity')).toBeCloseTo(1.08, 12);
    expect(execMult(c, 'wages')).toBeCloseTo(0.94, 12);
    expect(execMult(c, 'rd')).toBe(1);
    for (const t of Object.values(COMPANY.governance.exec.traits)) {
      expect(Math.abs(t.size)).toBeGreaterThanOrEqual(0.05);
      expect(Math.abs(t.size)).toBeLessThanOrEqual(0.10);
    }
  });

  it('a seat holds one executive, a player salary is capped, and hiring needs the wage runway', () => {
    const h = harness();
    const c = found(h);
    expect(salaryCapPerDay(c)).toBe(50);
    expect(hireExec(c, h.env, 'founder', { role: 'CFO', trait: 'Steady', holder: { kind: 'npc' } }).ok).toBe(true);
    expect(hireExec(c, h.env, 'founder', { role: 'CFO', trait: 'Operator', holder: { kind: 'npc' } }))
      .toEqual({ ok: false, reject: { code: 'execFilled', role: 'CFO' } });
    expect(hireExec(c, h.env, 'founder', { role: 'CEO', trait: 'Operator', holder: { kind: 'player', playerId: 'rival' } }))
      .toEqual({ ok: false, reject: { code: 'execSalaryCap', cap: 50 } });
    c.cash = 10;
    expect(hireExec(c, h.env, 'founder', { role: 'COO', trait: 'Operator', holder: { kind: 'npc' } }).ok).toBe(false);
  });

  it('a fire is refused before the minimum term, then pays severance out of the company (a sink for an NPC)', () => {
    const h = harness();
    const c = found(h);
    hireExec(c, h.env, 'founder', { role: 'CFO', trait: 'Steady', holder: { kind: 'npc' } });
    const termEnd = c.execs!.CFO!.termEnd;
    h.env.day = termEnd - 1;
    expect(fireExec(h.w, c, h.env, 'founder', 'CFO')).toEqual({ ok: false, reject: { code: 'execTerm', untilDay: termEnd } });
    h.env.day = termEnd;
    const sev = COMPANY.governance.exec.salary.CFO * COMPANY.governance.exec.severanceDays;
    const sink0 = h.w.flows.sink;
    expect(fireExec(h.w, c, h.env, 'founder', 'CFO')).toEqual({ ok: true, value: { severance: sev } });
    expect(h.w.flows.sink - sink0).toBe(sev);
    expect(c.execs!.CFO).toBeUndefined();
  });

  it('a player executive is paid by transfer; the excess over the cap is a covered payment for the clawback', () => {
    const h = harness();
    const c = found(h);
    const cap = salaryCapPerDay(c);
    c.execs = { COO: { role: 'COO', trait: 'Steady', holder: { kind: 'player', playerId: 'rival' }, hiredDay: 0, termEnd: 0, salary: cap + 100 } };
    const rival0 = h.money.rival!;
    const id0 = identity(h);
    h.env.day = 1;
    companyTick(h.w, h.env, 1);
    expect(h.money.rival! - rival0).toBe(cap + 100);
    const pay = c.payouts?.at(-1);
    expect(pay?.kind).toBe('salary');
    expect(pay?.covered).toBeCloseTo(100, 6);
    expect(pay?.insider).toBe(true);
    // the salary is a transfer from the company to the player: the money identity still holds to the cent
    expect(identity(h)).toBeCloseTo(id0, 6);
  });
});

describe('the CEO change and its freeze (spec 9.1, X7)', () => {
  it('is announced by the controller, takes effect at A + 10, and freezes the departing CEO to A + 31', () => {
    const h = harness();
    const c = found(h);
    h.env.day = 40;
    expect(announceCeoChange(c, h.env, 'rival', { kind: 'npc' })).toEqual({ ok: false, reject: { code: 'notController' } });
    expect(announceCeoChange(c, h.env, 'founder', { kind: 'npc' })).toEqual({ ok: true, value: { effectiveDay: 50, freezeUntil: 71 } });
    expect(announceCeoChange(c, h.env, 'founder', { kind: 'npc' })).toEqual({ ok: false, reject: { code: 'ceoChangePending', untilDay: 50 } });
    expect(ceoFreezeOn(c, 'founder', 40)).toBe(71);
    expect(ceoFreezeOn(c, 'founder', 71)).toBeNull();
    expect(ceoFreezeOn(c, 'rival', 45)).toBeNull();
    expect(ceoDay(c, 49)).toBeNull();
    expect(ceoDay(c, 50)).toEqual({ kind: 'npc' });
    expect(c.ceoChange).toBeNull();
    expect(c.ceo).toEqual({ kind: 'npc' });
  });

  it('the ex-CEO cannot return as CEO for 252 game days after the change takes effect', () => {
    const h = harness();
    const c = found(h);
    h.env.day = 10;
    expect(announceCeoChange(c, h.env, 'founder', { kind: 'player', playerId: 'founder' }).ok).toBe(true);
    advance(h, 10, 25);
    expect(c.exCeo).toEqual({ playerId: 'founder', untilDay: 20 + COMPANY.governance.ceo.cooldownDays });
    h.env.day = 30;
    expect(announceCeoChange(c, h.env, 'founder', { kind: 'player', playerId: 'founder' })).toEqual({
      ok: false, reject: { code: 'exCeoCooling', untilDay: 20 + COMPANY.governance.ceo.cooldownDays },
    });
  });

  it('a change through companyAction returns the freeze end, which the bridge applies to the engine', () => {
    const h = harness();
    const c = found(h);
    h.env.day = 5;
    const r = companyAction(h.w, h.env, 'founder', c.id, { kind: 'changeCEO', successor: { kind: 'npc' } });
    expect(r).toEqual({ ok: true, value: { effectiveDay: 15, freezeUntil: 36 } });
  });
});

describe('guarantee and the board vote (C4)', () => {
  it('a guarantee is capped at half of the founder cash, and a zero amount removes it', () => {
    const h = harness('g', 1_000_000);
    const c = found(h);
    const cash = h.money.founder!;
    expect(setGuarantee(c, h.env, 'founder', cash)).toEqual({ ok: false, reject: { code: 'guaranteeTooHigh', max: Math.floor(cash / 2) } });
    expect(setGuarantee(c, h.env, 'founder', -1)).toEqual({ ok: false, reject: { code: 'negativeAmount' } });
    expect(setGuarantee(c, h.env, 'founder', 100_000)).toEqual({ ok: true, value: { amount: 100_000 } });
    expect(c.guarantee).toEqual({ playerId: 'founder', amount: 100_000 });
    expect(setGuarantee(c, h.env, 'founder', 0).ok).toBe(true);
    expect(c.guarantee).toBeNull();
  });

  it('NPC pools vote yes iff the price is at or above fair value; the founder decides its own shares; a tie fails', () => {
    const h = harness();
    const c = found(h);
    c.capTable = { 'founder:founder': 600_000, 'npc:seed': 400_000 };
    c.shares = 1_000_000;
    expect(boardVote(c, { founderVote: 'no', price: 1.0, fairPerShare: 0.9, npcRule: 'price' })).toEqual({ yes: 400_000, no: 600_000, passed: false });
    expect(boardVote(c, { founderVote: 'yes', price: 0.5, fairPerShare: 0.9, npcRule: 'price' })).toEqual({ yes: 600_000, no: 400_000, passed: true });
    expect(boardVote(c, { founderVote: 'no', price: 1.0, fairPerShare: 0.9, npcRule: 'abstain' })).toEqual({ yes: 0, no: 600_000, passed: false });
    c.capTable = { 'founder:founder': 500_000, 'npc:seed': 500_000 };
    // the pool approves at 1.00 (above fair value 0.90), so a tie is 1,000,000 for and none against: that passes
    expect(boardVote(c, { founderVote: 'yes', price: 1.0, fairPerShare: 0.9, npcRule: 'price' }).passed).toBe(true);
    // below fair value the pool votes no, and the founder's 500,000 against its 500,000 is a tie: that fails
    expect(boardVote(c, { founderVote: 'yes', price: 0.5, fairPerShare: 0.9, npcRule: 'price' }).passed).toBe(false);
  });

  it('a dilutive round above 20% of the shares needs the board; a small round does not', () => {
    const h = harness();
    const c = found(h);
    // at $150k of value and 1,000,000 shares the round price is 0.105: $29,000 buys about 21.6% of the post-round shares
    const big = companyAction(h.w, h.env, 'founder', c.id, { kind: 'raiseRound', amount: 29_000, founderVote: 'no' });
    expect(big).toEqual({ ok: false, reject: { code: 'boardRejected', yes: 0, no: 1_000_000 } });
    expect(c.shares).toBe(1_000_000);
    const small = companyAction(h.w, h.env, 'founder', c.id, { kind: 'raiseRound', amount: 1_000, founderVote: 'no' });
    expect(small.ok).toBe(true);
    const backed = companyAction(h.w, h.env, 'founder', c.id, { kind: 'raiseRound', amount: 29_000, founderVote: 'yes' });
    expect(backed.ok).toBe(true);
    expect(c.capTable['npc:seed']).toBeGreaterThan(0);
  });
});

describe('money conservation across the B2 day steps', () => {
  it('founding, executives, a CEO change and days of operation keep the money identity exact', () => {
    const h = harness('conserve');
    const c = found(h);
    const start = identity(h);
    hireExec(c, h.env, 'founder', { role: 'CFO', trait: 'Steady', holder: { kind: 'npc' } });
    c.execs = { ...(c.execs ?? {}), COO: { role: 'COO', trait: 'Steady', holder: { kind: 'player', playerId: 'rival' }, hiredDay: 0, termEnd: 0, salary: 80 } };
    announceCeoChange(c, h.env, 'founder', { kind: 'npc' });
    advance(h, 0, 40);
    expect(identity(h)).toBeCloseTo(start, 6);
  });
});

describe('founder goals and their rewards (C4)', () => {
  it('a reached goal pays its reward into the company as world money, and the identity holds', () => {
    const h = harness('goals');
    const c = found(h);
    const id0 = identity(h);
    companyAction(h.w, h.env, 'founder', c.id, { kind: 'hire', role: 'ops', n: 1 });
    advance(h, 0, 10);
    expect(c.goalsDone.firstHire).toBeDefined();
    const paid = Object.keys(c.goalsDone).reduce((s, g) => s + (COMPANY.goalRewards as Record<string, number>)[g]!, 0);
    expect(c.ledgerTotals.goalReward).toBe(paid);
    expect(paid).toBeGreaterThanOrEqual(COMPANY.goalRewards.firstHire);
    expect(identity(h)).toBeCloseTo(id0, 6);
  });
});
