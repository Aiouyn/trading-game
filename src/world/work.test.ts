import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, stepGame } from './game';
import { credit, cashOf } from './core';
import { refreshNetWorth } from './assets';
import { applyRank } from './players';
import { fireAnalyst, hireAnalyst, resumeDesk, unlockDesk, workDay } from './work';
import { ANALYST_TIERS, DESK, WEEK_DAYS } from '@/content/learning';
import type { GameState, Command, Player } from './types';

const TPD = 720;

function cmd(g: GameState, pid: string, c: Command) {
  return applyCommand(g, pid, c);
}

function joined(seed: string): GameState {
  const g = createGame(seed, { warmupDays: 1, npcs: false });
  stepGame(g);
  const r = cmd(g, 'u1', { type: 'join', handle: 'trader_u1', country: 'AV' });
  if (!r.ok) throw new Error(r.error);
  g.players.u1!.onboarding.skipped = true;
  return g;
}

/** Real players earn rank; tests grant it. */
function boost(g: GameState, pid: string, amount: number) {
  credit(g, pid, amount, 'test');
  const p = g.players[pid]!;
  refreshNetWorth(g, p);
  applyRank(g, p, null);
}

/** Move the world to a game day (only the day matters to the work rules). */
function setDay(g: GameState, day: number) {
  g.market = { ...g.market, tick: day * TPD + 1 };
}

function today(g: GameState): number {
  return Math.floor((g.market.tick - 1) / TPD);
}

function setCash(g: GameState, pid: string, cash: number) {
  g.market.accounts[pid] = { ...g.market.accounts[pid]!, cash };
}

const p1 = (g: GameState): Player => g.players.u1!;

describe('the analyst (D-19)', () => {
  it('opens at Hustler, and the first week is paid when hired', () => {
    const g = joined('work-hire');
    expect(hireAnalyst(g, p1(g), 'junior', null).error).toMatch(/Hustler/);
    boost(g, 'u1', 20_000);
    const before = cashOf(g, 'u1');
    const r = hireAnalyst(g, p1(g), 'junior', null);
    expect(r.ok).toBe(true);
    expect(before - cashOf(g, 'u1')).toBeCloseTo(ANALYST_TIERS.junior.weeklyCost, 9);
    expect(p1(g).analyst?.tier).toBe('junior');
    expect(p1(g).analyst?.paidThroughDay).toBe(today(g) + WEEK_DAYS);
    expect(hireAnalyst(g, p1(g), 'senior', null).error).toMatch(/let them go/);
  });

  it('pays each week on its anniversary and not before', () => {
    const g = joined('work-week');
    boost(g, 'u1', 20_000);
    hireAnalyst(g, p1(g), 'senior', null);
    const d0 = today(g);
    const c0 = cashOf(g, 'u1');
    setDay(g, d0 + 3);
    workDay(g, null);
    expect(cashOf(g, 'u1')).toBe(c0);
    setDay(g, d0 + WEEK_DAYS);
    workDay(g, null);
    expect(c0 - cashOf(g, 'u1')).toBeCloseTo(ANALYST_TIERS.senior.weeklyCost, 9);
    expect(p1(g).analyst?.paidThroughDay).toBe(d0 + 2 * WEEK_DAYS);
  });

  it('when the cash is short at a due day, the analyst leaves with one line and no debt', () => {
    const g = joined('work-lapse');
    boost(g, 'u1', 20_000);
    hireAnalyst(g, p1(g), 'junior', null);
    setCash(g, 'u1', 100);
    setDay(g, today(g) + WEEK_DAYS);
    workDay(g, null);
    expect(p1(g).analyst).toBeNull();
    expect(cashOf(g, 'u1')).toBe(100);
    const notes = p1(g).inbox.filter((n) => n.kind === 'work' && n.msg?.key === 'work.analyst.lapsed');
    expect(notes.length).toBe(1);
  });

  it('a fire keeps no refund for the week already paid', () => {
    const g = joined('work-fire');
    boost(g, 'u1', 20_000);
    hireAnalyst(g, p1(g), 'junior', null);
    const c = cashOf(g, 'u1');
    expect(fireAnalyst(g, p1(g), null).ok).toBe(true);
    expect(cashOf(g, 'u1')).toBe(c);
    expect(p1(g).analyst).toBeNull();
  });

  it('restricted cash cannot pay the first week', () => {
    const g = joined('work-restricted');
    boost(g, 'u1', 20_000);
    p1(g).restrictedCash = cashOf(g, 'u1') - 100;
    expect(hireAnalyst(g, p1(g), 'junior', null).error).toMatch(/spendable/);
    expect(p1(g).analyst ?? null).toBeNull();
  });

  it('restricted cash cannot pay a due week either: it lapses', () => {
    const g = joined('work-restricted-due');
    boost(g, 'u1', 20_000);
    hireAnalyst(g, p1(g), 'junior', null);
    p1(g).restrictedCash = cashOf(g, 'u1') - 100; // 100 spendable, the week is 300
    setDay(g, today(g) + WEEK_DAYS);
    workDay(g, null);
    expect(p1(g).analyst).toBeNull();
  });
});

describe('the Research Desk (D-19)', () => {
  it('opens at Operator, starts a free trial with nothing charged, and refuses a second unlock', () => {
    const g = joined('work-desk');
    expect(unlockDesk(g, p1(g), null).error).toMatch(/Operator/);
    boost(g, 'u1', 5_000_000);
    const c = cashOf(g, 'u1');
    expect(unlockDesk(g, p1(g), null).ok).toBe(true);
    expect(c - cashOf(g, 'u1')).toBe(0);
    expect(p1(g).desk?.paidThroughDay).toBe(today(g) + DESK.trialDays);
    expect(unlockDesk(g, p1(g), null).error).toMatch(/already/);
  });

  it('the first monthly fee falls due when the trial ends, and the next one a period later', () => {
    const g = joined('work-desk-trial');
    boost(g, 'u1', 5_000_000);
    unlockDesk(g, p1(g), null);
    const trialEnd = today(g) + DESK.trialDays;
    const c = cashOf(g, 'u1');
    setDay(g, trialEnd - 1);
    workDay(g, null);
    expect(cashOf(g, 'u1')).toBe(c);
    expect(p1(g).inbox.some((n) => n.msg?.key === 'work.desk.billed')).toBe(false);
    setDay(g, trialEnd);
    workDay(g, null);
    expect(c - cashOf(g, 'u1')).toBeCloseTo(DESK.monthlyFee, 6);
    expect(p1(g).desk?.paidThroughDay).toBe(trialEnd + DESK.periodDays);
    expect(p1(g).inbox.some((n) => n.msg?.key === 'work.desk.billed')).toBe(true);
    expect(p1(g).desk?.lapsed).toBe(false);
  });

  it('locks when upkeep is not covered, keeps its files, and resumes for one week', () => {
    const g = joined('work-desk-lapse');
    boost(g, 'u1', 5_000_000);
    unlockDesk(g, p1(g), null);
    setCash(g, 'u1', 1000);
    setDay(g, today(g) + WEEK_DAYS);
    workDay(g, null);
    expect(p1(g).desk?.lapsed).toBe(true);
    expect(p1(g).inbox.filter((n) => n.msg?.key === 'work.desk.lapsed').length).toBe(1);
    expect(resumeDesk(g, p1(g), null).error).toMatch(/spendable/);
    credit(g, 'u1', 30_000, 'test');
    const c = cashOf(g, 'u1');
    expect(resumeDesk(g, p1(g), null).ok).toBe(true);
    expect(c - cashOf(g, 'u1')).toBeCloseTo(DESK.monthlyFee, 6);
    expect(p1(g).desk?.lapsed).toBe(false);
    expect(p1(g).desk?.paidThroughDay).toBe(today(g) + DESK.periodDays);
  });
});
