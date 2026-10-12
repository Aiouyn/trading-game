import { describe, expect, it, vi } from 'vitest';
import { vwap30 } from '@/engine';
import { applyCommand, createGame } from '../game';
import { credit, cashOf, priceOf, spendableCash } from '../core';
import { founderKeyOf, npcBookIdOf } from './ipo';
import { FOUNDER, listedWorld, totalMoney } from './b1fixture';
import { failPrivateFounderCompanies, founderCompanies, onlyFounderOwns, sellListedFounderStakes, callFounderGuarantees } from './stakes';
import type { GameState } from '../types';
import type { Company } from './types';

vi.setConfig({ testTimeout: 30_000 });

/** A joined founder with a company founded through the command log (the same seam the company tests use). */
function founded(seed: string): { g: GameState; id: string } {
  const g = createGame(seed, { warmupDays: 1, npcs: false });
  const r = applyCommand(g, 'u1', { type: 'join', handle: 'founder_u1', country: 'AV' });
  if (!r.ok) throw new Error(r.error);
  g.players.u1!.onboarding.skipped = true;
  g.players.u1!.rankId = 'R2';
  credit(g, 'u1', 500_000, 'test');
  const f = applyCommand(g, 'u1', { type: 'company.found', name: 'Acme', sector: 'tech', cityId: 'av', capital: 150_000 });
  if (!f.ok) throw new Error(f.error);
  return { g, id: (f.data as { id: string }).id };
}

describe('the founder stakes at a fresh start (lead ruling 6B)', () => {
  it('a private company the founder alone owns is the founder company, and only that one', () => {
    const { g, id } = founded('stakes-1');
    const c = g.companies!.companies[id]!;
    expect(c.listed).toBeNull();
    expect(onlyFounderOwns(c, 'u1')).toBe(true);
    expect(founderCompanies(g.companies, 'u1').map((x) => x.id)).toEqual([id]);
    expect(founderCompanies(g.companies, 'u2')).toEqual([]);
  });

  it('a second holder in the cap table keeps the company out of the failure path', () => {
    const { g, id } = founded('stakes-2');
    const c = g.companies!.companies[id]!;
    c.capTable['npc:other'] = 100;
    expect(onlyFounderOwns(c, 'u1')).toBe(false);
    expect(failPrivateFounderCompanies(g, 'u1', null)).toEqual([]);
    expect(c.bankrupt).toBeFalsy();
  });

  it('a private company goes through the failure path and is no longer a founder company', () => {
    const { g, id } = founded('stakes-3');
    const failed = failPrivateFounderCompanies(g, 'u1', null);
    expect(failed).toEqual(['Acme']);
    const c = g.companies!.companies[id]!;
    expect(c.bankrupt).toBeTruthy();
    expect(c.bankrupt!.recovery).toBeGreaterThan(0);
    expect(founderCompanies(g.companies, 'u1')).toEqual([]);
    // idempotent: a failed company is not failed again
    expect(failPrivateFounderCompanies(g, 'u1', null)).toEqual([]);
  });

  it('a listed-stake sale and a guarantee call do nothing for a private company', () => {
    const { g, id } = founded('stakes-4');
    const before = cashOf(g, 'u1');
    expect(sellListedFounderStakes(g, 'u1', null)).toBe(0);
    expect(callFounderGuarantees(g, 'u1', null)).toBe(0);
    expect(cashOf(g, 'u1')).toBe(before);
    expect(g.companies!.companies[id]!.capTable[founderKeyOf('u1')]).toBeGreaterThan(0);
  });
});

/** The listed fixture: the founder's shares are locked at listing, and the market book opens with no cash (ipo.ts). */
describe('the listed founder stake at a fresh start (the 70% block, the short-book outcome)', () => {
  function stakeOf(g: GameState, assetId: string): { c: Company; stake: number; price: number } {
    const c = Object.values(g.companies!.companies)[0]!;
    const held = g.market.accounts[FOUNDER]?.positions[assetId]?.qty ?? 0;
    const stake = Math.min(held, c.capTable[founderKeyOf(FOUNDER)] ?? 0);
    const base = vwap30(g.market, assetId) ?? priceOf(g, assetId);
    return { c, stake, price: Math.round(base * 0.7 * 100) / 100 };
  }

  function fundBook(g: GameState, assetId: string, cash: number): void {
    const id = npcBookIdOf(assetId);
    g.market = { ...g.market, accounts: { ...g.market.accounts, [id]: { ...g.market.accounts[id]!, cash } } };
  }

  it('the listing leaves the book with no cash, and a short book pays nothing but takes the stake (no money moves)', () => {
    const { g, assetId } = listedWorld('stakes-listed-0');
    const { c, stake } = stakeOf(g, assetId);
    expect(stake).toBeGreaterThan(0);
    expect(g.market.accounts[npcBookIdOf(assetId)]!.cash).toBe(0);
    const founderCash = cashOf(g, FOUNDER);
    const total = totalMoney(g);
    expect(sellListedFounderStakes(g, FOUNDER, null)).toBe(0);
    expect(cashOf(g, FOUNDER)).toBe(founderCash);
    expect(totalMoney(g)).toBe(total);
    expect(g.market.accounts[FOUNDER]?.positions[assetId]?.qty ?? 0).toBe(0);
    expect(c.capTable[founderKeyOf(FOUNDER)] ?? 0).toBe(0);
    expect(c.capTable[npcBookIdOf(assetId)]).toBe(stake);
  });

  it('a funded book buys the whole stake at 70% of VWAP30, the proceeds are cash and the money identity closes', () => {
    const { g, assetId } = listedWorld('stakes-listed-1');
    const { stake, price } = stakeOf(g, assetId);
    fundBook(g, assetId, 1_000_000_000);
    const founderCash = cashOf(g, FOUNDER);
    const total = totalMoney(g);
    const got = sellListedFounderStakes(g, FOUNDER, null);
    expect(got).toBeCloseTo(stake * price, 2);
    expect(cashOf(g, FOUNDER) - founderCash).toBeCloseTo(stake * price, 2);
    expect(g.market.accounts[npcBookIdOf(assetId)]!.cash).toBeCloseTo(1_000_000_000 - stake * price, 2);
    expect(totalMoney(g)).toBeCloseTo(total, 2);
    expect(g.market.accounts[FOUNDER]?.positions[assetId]?.qty ?? 0).toBe(0);
    // idempotent: the holding is gone, a second call sells nothing
    expect(sellListedFounderStakes(g, FOUNDER, null)).toBe(0);
  });

  it('a book short of cash buys what it can pay for and the rest passes for no payment', () => {
    const { g, assetId } = listedWorld('stakes-listed-2');
    const { stake, price } = stakeOf(g, assetId);
    const half = Math.floor(stake / 2);
    fundBook(g, assetId, half * price + 0.01);
    const total = totalMoney(g);
    const got = sellListedFounderStakes(g, FOUNDER, null);
    expect(got).toBeCloseTo(half * price, 2);
    expect(g.market.accounts[npcBookIdOf(assetId)]!.cash).toBeGreaterThanOrEqual(0);
    expect(totalMoney(g)).toBeCloseTo(total, 2);
    expect(g.market.accounts[FOUNDER]?.positions[assetId]?.qty ?? 0).toBe(0);
  });

  it('the guarantee call is booked once: a second call (a later chapter) adds no personal debt', () => {
    const { g, assetId } = listedWorld('stakes-guar-1');
    const c = Object.values(g.companies!.companies)[0]!;
    c.guarantee = { playerId: FOUNDER, amount: 10_000_000 };
    const total = totalMoney(g);
    callFounderGuarantees(g, FOUNDER, null);
    const once = g.companies!.personalDebt?.[FOUNDER] ?? 0;
    expect(once).toBeGreaterThan(0);
    expect(c.guarantee).toBeNull();
    callFounderGuarantees(g, FOUNDER, null);
    expect(g.companies!.personalDebt?.[FOUNDER] ?? 0).toBe(once);
    expect(totalMoney(g)).toBeCloseTo(total, 2);
    expect(spendableCash(g, FOUNDER)).toBeGreaterThanOrEqual(0);
    expect(assetId).toBeTruthy();
  });
});
