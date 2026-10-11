import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, stepGame } from './game';
import { cashOf, credit, debit, CHAPTER_TICKS, REAL_DAY, TPD } from './core';
import { refreshNetWorth } from './assets';
import { applyRank } from './players';
import { COMEBACK, comebackRefresh, comebackView, cooldownLeft } from './comeback';
import { lessonsRebateOf, windMultOf, PERK_RULES } from './perks';
import { BIZ_BY_ID } from '@/content/businesses';
import { licenseFor } from '@/content/lifestyle';
import { bookedNet, engineTallyOf, netWorldMoney } from './company/exploits/sequences';
import type { GameState, Command } from './types';

function cmd(g: GameState, pid: string, c: Command) {
  return applyCommand(g, pid, c);
}

/** A joined, backdated player. The donation takes the cash under the low-cash line (a real command). */
function lowCash(seed: string, pid = 'u1'): GameState {
  const g = createGame(seed, { warmupDays: 1, npcs: false });
  stepGame(g);
  const r = cmd(g, pid, { type: 'join', handle: `player_${pid}`, country: 'AV' });
  if (!r.ok) throw new Error(r.error);
  g.players[pid]!.onboarding.skipped = true;
  cmd(g, pid, { type: 'admin.age', playerId: pid, ticks: 2 * REAL_DAY });
  const cash = cashOf(g, pid);
  const d = cmd(g, pid, { type: 'donate', amount: cash - 400, cause: 'test' });
  if (!d.ok) throw new Error(d.error);
  refreshNetWorth(g, g.players[pid]!);
  return g;
}

describe('the low-cash card', () => {
  it('shows under $1,000 of net worth, and a dismissal hides it for a real day', () => {
    const g = lowCash('cb-card-1');
    expect(comebackView(g, 'u1')!.card).toBe(true);
    expect(comebackView(g, 'u1')!.low).toBe(true);
    expect(cmd(g, 'u1', { type: 'comeback.dismiss' }).ok).toBe(true);
    expect(comebackView(g, 'u1')!.card).toBe(false);
    g.market = { ...g.market, tick: g.market.tick + REAL_DAY };
    expect(comebackView(g, 'u1')!.card).toBe(true);
  });

  it('is not shown at or above $1,000 of net worth (and no ad is offered at a high day-start cash)', () => {
    const g = lowCash('cb-card-2');
    credit(g, 'u1', 5000, 'test');
    refreshNetWorth(g, g.players.u1!);
    g.players.u1!.dayStart = { ...g.players.u1!.dayStart, cash: 5400 };
    expect(comebackView(g, 'u1')!.low).toBe(false);
    expect(comebackView(g, 'u1')!.card).toBe(false);
  });
});

describe('the fresh start', () => {
  it('is refused above the low-cash line', () => {
    const g = lowCash('cb-refuse-1');
    credit(g, 'u1', 5000, 'test');
    refreshNetWorth(g, g.players.u1!);
    expect(cmd(g, 'u1', { type: 'comeback.confirm', perk: 'lessons' })).toEqual({ ok: false, error: 'comebackNotLow' });
  });

  it('resets the account to $5,000 of fresh-start cash, keeps the rank, and books the sweep and the grant', () => {
    const g = lowCash('cb-reset-1');
    const p = g.players.u1!;
    const rank = p.rankId;
    const rep0 = p.reputation;
    const m0 = netWorldMoney(g);
    const b0 = bookedNet(g) + engineTallyOf(g);
    const sinkBefore = g.economy.sinks['chapter close'] ?? 0;
    const faucetBefore = g.economy.faucets['fresh start'] ?? 0;
    const r = cmd(g, 'u1', { type: 'comeback.confirm', perk: 'lessons' });
    expect(r.ok).toBe(true);
    expect(cashOf(g, 'u1')).toBe(COMEBACK.freshCash);
    expect(p.rankId).toBe(rank);
    expect(p.comeback!.chapter).toBe(2);
    expect(p.comeback!.freshTick).toBe(g.market.tick);
    expect(p.reputation - rep0).toBe(-10);
    expect(p.adLots).toEqual([{ amount: COMEBACK.freshCash, untilTick: g.market.tick + COMEBACK.lotTicks, kind: 'start' }]);
    expect(g.economy.sinks['chapter close']! - sinkBefore).toBeGreaterThan(0);
    expect(g.economy.faucets['fresh start']! - faucetBefore).toBe(COMEBACK.freshCash);
    expect(p.comeback!.perk).toEqual({ id: 'lessons', untilTick: g.market.tick + COMEBACK.perkTicks });
    expect(netWorldMoney(g) - m0).toBeCloseTo(bookedNet(g) + engineTallyOf(g) - b0, 6);
  });

  it('closes the positions first, then resets once the account is flat (the close waits for the fills)', () => {
    const g = lowCash('cb-close-1');
    g.players.u1!.rankId = 'R2';
    const asset = g.market.config.assets.find((a, i) => a.listed !== false && a.assetClass === 'stock' && Math.exp(g.market.assets[i]!.lnP) < 120)!;
    const buy = cmd(g, 'u1', { type: 'order.place', order: { assetId: asset.id, side: 'buy', type: 'market', qty: 1 } });
    expect(buy.ok).toBe(true);
    stepGame(g);
    expect(g.market.accounts.u1!.positions[asset.id]?.qty ?? 0).toBeGreaterThan(0);
    // the account is now under the low-cash line with a position open
    refreshNetWorth(g, g.players.u1!);
    expect(cmd(g, 'u1', { type: 'comeback.confirm', perk: 'lessons' }).ok).toBe(true);
    expect(g.players.u1!.comeback!.closing).toBeDefined();
    for (let k = 0; k < 3; k++) stepGame(g);
    expect(g.players.u1!.comeback!.closing).toBeUndefined();
    expect(g.players.u1!.comeback!.chapter).toBe(2);
    expect(Object.values(g.market.accounts.u1!.positions).every((x) => x.qty === 0)).toBe(true);
    expect(cashOf(g, 'u1')).toBe(COMEBACK.freshCash);
  });

  it('is at most once in the 8 real weeks: a second fresh start waits out the cooldown', () => {
    const g = lowCash('cb-cool-1');
    expect(cmd(g, 'u1', { type: 'comeback.confirm', perk: 'lessons' }).ok).toBe(true);
    cmd(g, 'u1', { type: 'donate', amount: cashOf(g, 'u1') - 300, cause: 'test' });
    refreshNetWorth(g, g.players.u1!);
    expect(cmd(g, 'u1', { type: 'comeback.confirm', perk: 'lessons' })).toEqual({ ok: false, error: 'comebackCooldown' });
    expect(cooldownLeft(g, g.players.u1!)).toBeGreaterThan(CHAPTER_TICKS - 10 * TPD);
    g.market = { ...g.market, tick: g.market.tick + CHAPTER_TICKS };
    refreshNetWorth(g, g.players.u1!);
    expect(cmd(g, 'u1', { type: 'comeback.confirm', perk: 'lessons' }).ok).toBe(true);
    expect(g.players.u1!.comeback!.chapter).toBe(3);
  });

  it('a contacts or wind perk needs a business (before businesses only lessons shows)', () => {
    const g = lowCash('cb-perk-1');
    expect(cmd(g, 'u1', { type: 'comeback.confirm', perk: 'contacts' })).toEqual({ ok: false, error: 'comebackPerk' });
    expect(cmd(g, 'u1', { type: 'comeback.confirm', perk: 'wind' })).toEqual({ ok: false, error: 'comebackPerk' });
    const v = comebackView(g, 'u1')!;
    expect(v.perks.find((x) => x.id === 'lessons')!.available).toBe(true);
    expect(v.perks.find((x) => x.id === 'contacts')!.available).toBe(false);
  });
});

describe('the perks and the leverage cap', () => {
  it('lessons rebates half a fee and wind multiplies business income, only while the window runs', () => {
    const g = lowCash('cb-perk-2');
    const p = g.players.u1!;
    p.comeback = { chapter: 2, chapterStartTick: 1, peak: 5000, perk: { id: 'lessons', untilTick: g.market.tick + 100 } };
    expect(lessonsRebateOf(p, g.market.tick, 10)).toBe(10 * PERK_RULES.lessonsRebate);
    expect(lessonsRebateOf(p, g.market.tick + 200, 10)).toBe(0);
    p.comeback.perk = { id: 'wind', untilTick: g.market.tick + 100 };
    expect(windMultOf(p, g.market.tick)).toBe(PERK_RULES.windMult);
    expect(windMultOf(p, g.market.tick + 200)).toBe(1);
  });

  it('a contacts voucher halves the next T1 business, once', () => {
    const g = lowCash('cb-voucher-1');
    const p = g.players.u1!;
    p.rankId = 'R3';
    p.comeback = { chapter: 2, chapterStartTick: 1, peak: 5000, voucher: true };
    credit(g, 'u1', 50_000, 'test');
    const def = [...BIZ_BY_ID.values()].find((d) => d.tier === 1)!;
    const before = cashOf(g, 'u1');
    const r = cmd(g, 'u1', { type: 'biz.buy', defId: def.id, cityId: 'avalon' });
    expect(r.ok).toBe(true);
    expect(before - cashOf(g, 'u1')).toBeCloseTo(def.cost * PERK_RULES.contactsOff, 6);
    expect(p.comeback!.voucher).toBeUndefined();
  });

  it('caps leverage at 1x for 7 real days after a fresh start, then restores the license', () => {
    const g = lowCash('cb-lev-1');
    const p = g.players.u1!;
    p.netWorthPeak = 60_000;
    applyRank(g, p, null, true);
    const lic = licenseFor(p.rankId).maxLeverage;
    expect(cmd(g, 'u1', { type: 'comeback.confirm', perk: 'lessons' }).ok).toBe(true);
    expect(g.market.accounts.u1!.maxLeverage ?? 1).toBe(1);
    g.market = { ...g.market, tick: g.market.tick + COMEBACK.leverageTicks };
    comebackRefresh(g, null);
    expect(p.comeback!.leverageUntil).toBeUndefined();
    expect(g.market.accounts.u1!.maxLeverage ?? 1).toBe(lic);
  });
});

describe('bust and the floor', () => {
  it('a forced close first opens the chapter screen; the cooldown then blocks it, and the negative cash is discharged, never a dead end', () => {
    const g = lowCash('cb-bust-1');
    const p = g.players.u1!;
    // the clearing house closes an account whose equity is below zero
    g.market.accounts.u1 = { ...g.market.accounts.u1!, cash: -500, startingCash: -500 };
    const m0 = netWorldMoney(g);
    const b0 = bookedNet(g) + engineTallyOf(g);
    comebackRefresh(g, null);
    expect(p.comeback!.bust).toEqual({ tick: g.market.tick, blocked: false });
    expect(comebackView(g, 'u1')!.bust).not.toBeNull();
    // the first bust may start a fresh start
    expect(cmd(g, 'u1', { type: 'comeback.confirm', perk: 'lessons' }).ok).toBe(true);
    // the debt is written off out of the window's $5,000, and the fresh start pays the rest: the account opens at 5000 less the debt
    expect(cashOf(g, 'u1')).toBe(COMEBACK.freshCash - 500);
    // a second bust inside 8 weeks: blocked, no write-off (the window's fresh money is spent); ad cash and income repay it
    debit(g, 'u1', cashOf(g, 'u1') + 300, 'test sink');
    comebackRefresh(g, null);
    expect(p.comeback!.bust).toEqual({ tick: g.market.tick, blocked: true });
    expect(cashOf(g, 'u1')).toBe(-300);
    expect(comebackView(g, 'u1')!.bust).toBeNull();
    expect(netWorldMoney(g) - m0).toBeCloseTo(bookedNet(g) + engineTallyOf(g) - b0, 6);
  });
});
