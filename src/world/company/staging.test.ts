import { describe, expect, it } from 'vitest';
import { COMPANY } from '@/content/company';
import { companyAction, companyTick, emptyCompanyWorld, foundCompany, type CompanyEnv, type CompanyEvent } from './company';
import { ceoPlanOf, founderCompanyView, nextFilingDay } from './views';
import { qualityScore } from './rd';
import type { CompanyWorld } from './types';

// O-17: the Overview decision is staged and applied at the next game-day close (before the company's day step), replaced
// if confirmed again that day, and cancellable. The launch of a next-gen product needs the ready mark. The Filings view
// reads the public schedule, and the CEO change plan reads its rules (O-16).

interface Harness { w: CompanyWorld; env: CompanyEnv; money: Record<string, number> }

function harness(seed = 'stage-test', founderCash = 2_000_000): Harness {
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

/** Runs the company day step for each day in [from, to], with the env day set first. */
function advance(h: Harness, from: number, to: number): CompanyEvent[] {
  const evs: CompanyEvent[] = [];
  for (let d = from; d <= to; d++) {
    h.env.day = d;
    evs.push(...companyTick(h.w, h.env, d));
  }
  return evs;
}

describe('O-17 staging of the Overview decision', () => {
  it('a confirmed decision is not started at once: it waits for the close and shows as staged', () => {
    const h = harness('s1');
    const id = found(h);
    const c = h.w.companies[id]!;
    const r = companyAction(h.w, h.env, 'founder', id, { kind: 'stageProject', projectKind: 'quality', productId: `${id}:p0`, spend: 40_000 });
    expect(r).toEqual({ ok: true, value: { closeDay: 0, spend: 40_000 } });
    expect(c.projects).toHaveLength(0);
    expect(c.staged).toEqual({ closeDay: 0, projectKind: 'quality', productId: `${id}:p0`, spend: 40_000 });
    expect(c.inForce ?? {}).toEqual({});
    expect(h.w.companies[id]!.cash).toBe(COMPANY.founding.capital);
    const view = founderCompanyView(h.w, 'founder', id, 0);
    expect(view.staged).toEqual({ closeDay: 0, productId: `${id}:p0`, spend: 40_000 });
    expect(view.decision?.spendInForce).toBeNull();
  });

  it('the close applies it before the day step: the project is funded on the closing day and counts from there', () => {
    const h = harness('s2');
    const id = found(h);
    const c = h.w.companies[id]!;
    companyAction(h.w, h.env, 'founder', id, { kind: 'stageProject', projectKind: 'quality', productId: `${id}:p0`, spend: 40_000 });
    const evs = advance(h, 1, 1);
    expect(evs).toContainEqual({ kind: 'staged', companyId: id, day: 0, status: 'applied', productId: `${id}:p0`, spend: 40_000 });
    expect(c.staged).toBeNull();
    expect(c.projects).toHaveLength(1);
    const p = c.projects[0]!;
    expect(p.startDay).toBe(0);
    // the day step of the closing day paid the project's first day: the apply came before the operations
    expect(p.paidDays).toBe(1);
    expect(c.inForce).toEqual({ [`${id}:p0`]: 40_000 });
    const view = founderCompanyView(h.w, 'founder', id, 1);
    expect(view.staged).toBeNull();
    expect(view.decision?.spendInForce).toBe(40_000);
  });

  it('confirming again the same day replaces the staged value; only the last one applies', () => {
    const h = harness('s3');
    const id = found(h);
    const c = h.w.companies[id]!;
    companyAction(h.w, h.env, 'founder', id, { kind: 'stageProject', projectKind: 'quality', productId: `${id}:p0`, spend: 20_000 });
    companyAction(h.w, h.env, 'founder', id, { kind: 'stageProject', projectKind: 'quality', productId: `${id}:p0`, spend: 80_000 });
    expect(c.staged?.spend).toBe(80_000);
    advance(h, 1, 1);
    expect(c.projects.map((p) => p.spend)).toEqual([80_000]);
  });

  it('a staged decision can be cancelled before the close; cancelling nothing is refused', () => {
    const h = harness('s4');
    const id = found(h);
    const c = h.w.companies[id]!;
    expect(companyAction(h.w, h.env, 'founder', id, { kind: 'cancelStaged' })).toEqual({ ok: false, reject: { code: 'nothingStaged' } });
    companyAction(h.w, h.env, 'founder', id, { kind: 'stageProject', projectKind: 'quality', productId: `${id}:p0`, spend: 40_000 });
    expect(companyAction(h.w, h.env, 'founder', id, { kind: 'cancelStaged' })).toEqual({ ok: true, value: {} });
    expect(c.staged).toBeNull();
    const evs = advance(h, 1, 1);
    expect(evs.some((e) => e.kind === 'staged')).toBe(false);
    expect(c.projects).toHaveLength(0);
  });

  it('a staged decision is refused at once for the checks a start makes, and dropped with its code if the close finds it refused', () => {
    const h = harness('s5');
    const id = found(h);
    const c = h.w.companies[id]!;
    const cash = companyAction(h.w, h.env, 'founder', id, { kind: 'stageProject', projectKind: 'quality', productId: `${id}:p0`, spend: 500_000 });
    expect(cash).toEqual({ ok: false, reject: { code: 'insufficientFunds', shortfall: 500_000 - COMPANY.founding.capital } });
    expect(companyAction(h.w, h.env, 'founder', id, { kind: 'stageProject', projectKind: 'quality', productId: 'nope', spend: 1 })).toEqual({ ok: false, reject: { code: 'unknownProduct' } });
    expect(companyAction(h.w, h.env, 'founder', id, { kind: 'stageProject', projectKind: 'quality', productId: `${id}:p0`, spend: -5 })).toEqual({ ok: false, reject: { code: 'negativeAmount' } });
    // a refused stage leaves nothing staged
    expect(c.staged ?? null).toBeNull();
    // stage a valid amount, then spend the cash away before the close: the close refuses it and says why
    companyAction(h.w, h.env, 'founder', id, { kind: 'stageProject', projectKind: 'quality', productId: `${id}:p0`, spend: 90_000 });
    c.cash = 10_000;
    const evs = advance(h, 1, 1);
    expect(evs).toContainEqual({ kind: 'staged', companyId: id, day: 0, status: 'dropped', productId: `${id}:p0`, spend: 90_000, code: 'insufficientFunds' });
    expect(c.projects).toHaveLength(0);
    expect(c.staged).toBeNull();
  });

  it('a start is still immediate on the R&D tab (only the Overview decision is staged)', () => {
    const h = harness('s6');
    const id = found(h);
    const c = h.w.companies[id]!;
    const r = companyAction(h.w, h.env, 'founder', id, { kind: 'startProject', projectKind: 'quality', productId: `${id}:p0`, spend: 30_000 });
    expect(r.ok).toBe(true);
    expect(c.projects).toHaveLength(1);
    expect(c.inForce).toEqual({ [`${id}:p0`]: 30_000 });
  });

  it('a stage made while a project is running is refused as busy, at once', () => {
    const h = harness('s7');
    const id = found(h);
    companyAction(h.w, h.env, 'founder', id, { kind: 'startProject', projectKind: 'quality', productId: `${id}:p0`, spend: 30_000 });
    const busy = companyAction(h.w, h.env, 'founder', id, { kind: 'stageProject', projectKind: 'quality', productId: `${id}:p0`, spend: 30_000 });
    expect(busy).toEqual({ ok: false, reject: { code: 'projectBusy' } });
  });
});

describe('O-17 launch of next-gen products (ready mark)', () => {
  it('a launch uses its credit and the product starts at the quality the project bought (the ready mark is a screen threshold)', () => {
    const h = harness('l1');
    const id = found(h);
    const c = h.w.companies[id]!;
    c.launchCredits.push({ q: 1.25, generation: 2 });
    const ok = companyAction(h.w, h.env, 'founder', id, { kind: 'launchProduct', name: 'Next', price: 50 });
    expect(ok.ok).toBe(true);
    expect(c.launchCredits).toHaveLength(0);
    expect(c.products[1]!.q).toBe(1.25);
    expect(c.products[1]!.generation).toBe(2);
  });

  it('the founder view carries the launch credits with their score and whether each reads ready', () => {
    const h = harness('l2');
    const id = found(h);
    const c = h.w.companies[id]!;
    c.launchCredits.push({ q: 0.05, generation: 2 }, { q: 1, generation: 2 });
    const view = founderCompanyView(h.w, 'founder', id, 0);
    expect(view.launchCredits).toEqual([
      { generation: 2, score: qualityScore(0.05, Math.exp(c.frontierLn)), ready: false },
      { generation: 2, score: qualityScore(1, Math.exp(c.frontierLn)), ready: qualityScore(1, Math.exp(c.frontierLn)) >= COMPANY.rd.readyMark },
    ]);
  });
});

describe('O-17 Filings: the next filing day is the public schedule', () => {
  it('a filing falls the filing lag after each quarter close, and the next one is strictly after today', () => {
    const q = COMPANY.quarterDays;
    const lag = COMPANY.filingLagDays;
    expect(nextFilingDay(0)).toBe(q + lag);
    expect(nextFilingDay(q - 1)).toBe(q + lag);
    expect(nextFilingDay(q + lag)).toBe(2 * q + lag);
    expect(nextFilingDay(q + lag - 1)).toBe(q + lag);
  });
});

describe('O-16 CEO change plan: the days and rules shown before confirming', () => {
  it('announced today: effective after the notice, the freeze to the exit freeze, and the cooling 252 days from the effective day', () => {
    const h = harness('e1');
    const id = found(h);
    const c = h.w.companies[id]!;
    const plan = ceoPlanOf(c, 'founder', 40);
    expect(plan.ceoHolder).toBe('founder');
    expect(plan.announcedDay).toBe(40);
    expect(plan.effectiveDay).toBe(40 + COMPANY.governance.ceo.noticeDays);
    expect(plan.freezeUntil).toBe(40 + COMPANY.governance.ceo.noticeDays + COMPANY.governance.ceo.exitFreezeDays);
    expect(plan.cooldownUntil).toBe(plan.effectiveDay + 252);
    // the plan matches what the engine records when the founder announces the change
    c.ceo = { kind: 'npc' };
    expect(ceoPlanOf(c, 'founder', 40).ceoHolder).toBe('npc');
  });
});
