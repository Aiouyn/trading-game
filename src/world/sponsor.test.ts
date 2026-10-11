import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, stepGame } from './game';
import { cashOf, credit, RESTRICT_TICKS, restrictedNow, TPD, spendableCash, REAL_DAY } from './core';
import { refreshNetWorth } from './assets';
import { applyRank } from './players';
import { SPONSOR, adsUsedToday, profileKeyOf } from './sponsor';
import { bookedNet, engineTallyOf, netWorldMoney } from './company/exploits/sequences';
import type { GameState, Command } from './types';

function cmd(g: GameState, pid: string, c: Command) {
  return applyCommand(g, pid, c);
}

/** A joined player, backdated past the account-age rule, under the low-cash line at the day start (a sponsor-eligible account). */
function eligible(seed: string, pid = 'u1'): GameState {
  const g = createGame(seed, { warmupDays: 1, npcs: false });
  stepGame(g);
  const r = cmd(g, pid, { type: 'join', handle: `player_${pid}`, country: 'AV' });
  if (!r.ok) throw new Error(r.error);
  g.players[pid]!.onboarding.skipped = true;
  cmd(g, pid, { type: 'admin.age', playerId: pid, ticks: 2 * REAL_DAY });
  // poor at the day start and now: the cash is taken out of the account so the net worth is under $1,000
  const p = g.players[pid]!;
  const acct = g.market.accounts[pid]!;
  g.market.accounts[pid] = { ...acct, cash: 600, startingCash: 600, peakEquity: 600, dayStartEquity: 600 };
  refreshNetWorth(g, p);
  applyRank(g, p, null, true);
  p.dayStart = { ...p.dayStart, cash: 600, netWorth: p.netWorth };
  return g;
}

function tick3(g: GameState, n = 3) {
  for (let k = 0; k < n; k++) stepGame(g);
}

describe('sponsor breaks: the offer', () => {
  it('is not offered to an account with a day-start cash at or above $1,000', () => {
    const g = eligible('sp-offer-1');
    const p = g.players.u1!;
    p.dayStart = { ...p.dayStart, cash: 5600 };
    expect(cmd(g, 'u1', { type: 'ad.start' })).toEqual({ ok: false, error: 'adNotOffered' });
  });

  it('is read at the day start: a player who was under the line at the day start keeps the offer as the net worth passes it', () => {
    const g = eligible('sp-offer-2');
    const p = g.players.u1!;
    credit(g, 'u1', 5000, 'test');
    refreshNetWorth(g, p);
    expect(p.netWorth).toBeGreaterThan(1000);
    expect(cmd(g, 'u1', { type: 'ad.start' }).ok).toBe(true);
  });

  it('needs a real day of account age', () => {
    const g = eligible('sp-age-1');
    g.players.u1!.joinedTick = g.market.tick - 1;
    expect(cmd(g, 'u1', { type: 'ad.start' }).error).toBe('adAge');
  });

  it('opens one card at a time, with a fictional brand and the 15-second and 5-second timings', () => {
    const g = eligible('sp-open-1');
    const r = cmd(g, 'u1', { type: 'ad.start' });
    expect(r.ok).toBe(true);
    const d = r.data as { id: string; brand: string; watchSeconds: number; skipSeconds: number };
    expect(d.watchSeconds).toBe(15);
    expect(d.skipSeconds).toBe(5);
    expect(['aurelle', 'fennick', 'marlow', 'pelican', 'corvid', 'tessel']).toContain(d.brand);
    expect(cmd(g, 'u1', { type: 'ad.start' }).error).toBe('adBusy');
  });
});

describe('sponsor breaks: the card', () => {
  it('a full watch pays $250 of tagged ad cash, booked to the adCash faucet', () => {
    const g = eligible('sp-pay-1');
    const id = (cmd(g, 'u1', { type: 'ad.start' }).data as { id: string }).id;
    const before = cashOf(g, 'u1');
    const faucetBefore = g.economy.faucets.adCash ?? 0;
    // a full watch is not accepted before the card has run for 15 seconds (three ticks)
    expect(cmd(g, 'u1', { type: 'ad.finish', id, skip: false }).error).toBe('adTooSoon');
    tick3(g);
    const r = cmd(g, 'u1', { type: 'ad.finish', id, skip: false });
    expect(r).toEqual({ ok: true, data: { reward: SPONSOR.reward } });
    expect(cashOf(g, 'u1')).toBeCloseTo(before + SPONSOR.reward, 9);
    expect((g.economy.faucets.adCash ?? 0) - faucetBefore).toBeCloseTo(SPONSOR.reward, 9);
    expect(restrictedNow(g, 'u1')).toBeCloseTo(SPONSOR.reward, 9);
  });

  it('a skip after five seconds pays nothing, and a skip before that is refused', () => {
    const g = eligible('sp-skip-1');
    const id = (cmd(g, 'u1', { type: 'ad.start' }).data as { id: string }).id;
    expect(cmd(g, 'u1', { type: 'ad.finish', id, skip: true }).error).toBe('adTooSoon');
    stepGame(g);
    const before = cashOf(g, 'u1');
    expect(cmd(g, 'u1', { type: 'ad.finish', id, skip: true })).toEqual({ ok: true, data: { reward: 0, skipped: true } });
    expect(cashOf(g, 'u1')).toBe(before);
    expect(adsUsedToday(g, 'u1')).toBe(0);
  });

  it('pays at most 10 breaks a game day per profile, and the count resets with the day', () => {
    const g = eligible('sp-cap-1');
    for (let k = 0; k < SPONSOR.dailyCap; k++) {
      g.players.u1!.dayStart = { ...g.players.u1!.dayStart, cash: 600 };
      const id = (cmd(g, 'u1', { type: 'ad.start' }).data as { id: string }).id;
      tick3(g);
      expect(cmd(g, 'u1', { type: 'ad.finish', id, skip: false }).ok).toBe(true);
    }
    expect(adsUsedToday(g, 'u1')).toBe(SPONSOR.dailyCap);
    expect(cmd(g, 'u1', { type: 'ad.start' }).error).toBe('adCap');
    // the next game day opens the count again (the day-start cash is still under the line)
    g.market = { ...g.market, tick: g.market.tick + TPD };
    g.players.u1!.dayStart = { ...g.players.u1!.dayStart, day: 999, cash: 600 };
    expect(cmd(g, 'u1', { type: 'ad.start' }).ok).toBe(true);
  });

  it('counts the alliance owner\'s profile: alts in one alliance share the ten a day', () => {
    const g = eligible('sp-profile-1');
    const p2 = (() => {
      const r = cmd(g, 'u2', { type: 'join', handle: 'player_u2', country: 'AV' });
      if (!r.ok) throw new Error(r.error);
      return g.players.u2!;
    })();
    g.alliances.a1 = { id: 'a1', name: 'Ring', tag: 'R', ownerId: 'u1', members: { u1: 'owner', u2: 'member' }, treasury: 0, createdTick: 0, motto: '', sharedDefense: 0 };
    g.players.u1!.allianceId = 'a1';
    p2.allianceId = 'a1';
    expect(profileKeyOf(g, 'u2')).toBe('u1');
    g.sponsor = { counts: { u1: { day: Math.floor((g.market.tick - 1) / TPD), n: SPONSOR.dailyCap } }, pending: {}, seq: 0 };
    g.players.u2!.joinedTick -= 2 * REAL_DAY;
    g.market.accounts.u2 = { ...g.market.accounts.u2!, cash: 600, startingCash: 600 };
    refreshNetWorth(g, p2);
    p2.dayStart = { ...p2.dayStart, cash: 600 };
    expect(cmd(g, 'u2', { type: 'ad.start' }).error).toBe('adCap');
  });
});

describe('ad cash: restricted for 72 real hours, no ops, margin, derivatives or transfers', () => {
  it('releases after 72 real hours, and only then counts as spendable', () => {
    const g = eligible('sp-lot-1');
    const id = (cmd(g, 'u1', { type: 'ad.start' }).data as { id: string }).id;
    tick3(g);
    cmd(g, 'u1', { type: 'ad.finish', id, skip: false });
    const spendableBefore = spendableCash(g, 'u1');
    expect(spendableBefore).toBeCloseTo(cashOf(g, 'u1') - SPONSOR.reward, 9);
    g.market = { ...g.market, tick: g.market.tick + RESTRICT_TICKS };
    expect(restrictedNow(g, 'u1')).toBe(0);
    expect(spendableCash(g, 'u1')).toBeCloseTo(cashOf(g, 'u1'), 9);
  });

  it('a loan out of the account cannot use restricted ad cash', () => {
    const g = eligible('sp-xfer-1');
    const r2 = cmd(g, 'u2', { type: 'join', handle: 'player_u2', country: 'AV' });
    if (!r2.ok) throw new Error(r2.error);
    g.players.u1!.rankId = 'R1';
    g.players.u2!.rankId = 'R1';
    const id = (cmd(g, 'u1', { type: 'ad.start' }).data as { id: string }).id;
    tick3(g);
    cmd(g, 'u1', { type: 'ad.finish', id, skip: false });
    // the cash is 850 with 250 restricted: a 700 loan is more than the spendable 600 and is refused
    expect(cashOf(g, 'u1')).toBeCloseTo(850, 9);
    expect(cmd(g, 'u1', { type: 'deal.offer', kind: 'loan', toId: 'u2', amount: 700, rate: 0.05, termDays: 30, note: '' })).toEqual({ ok: false, error: 'adCashTransfer' });
  });

  it('an option buy is refused while ad cash is held (derivatives)', () => {
    const g = eligible('sp-opt-1');
    const id = (cmd(g, 'u1', { type: 'ad.start' }).data as { id: string }).id;
    tick3(g);
    cmd(g, 'u1', { type: 'ad.finish', id, skip: false });
    const r = cmd(g, 'u1', { type: 'option.trade', contractId: 'any', side: 'buy', qty: 1 });
    expect(r).toEqual({ ok: false, error: 'adCashDerivative' });
  });

  it('a buy past the cash (margin) is refused while ad cash is held, and a spot buy within cash is not', () => {
    const g = eligible('sp-margin-1');
    const id = (cmd(g, 'u1', { type: 'ad.start' }).data as { id: string }).id;
    tick3(g);
    cmd(g, 'u1', { type: 'ad.finish', id, skip: false });
    g.players.u1!.rankId = 'R1';
    g.market.accounts.u1 = { ...g.market.accounts.u1!, maxLeverage: 2 };
    const asset = g.market.config.assets.find((a) => a.listed !== false)!.id;
    // a price far above the cash: the buy would borrow
    const huge = cmd(g, 'u1', { type: 'order.place', order: { assetId: asset, side: 'buy', type: 'limit', qty: 1_000_000, limitPrice: 1_000 } });
    expect(huge.error).toBe('adCashMargin');
  });
});

describe('the money identity closes for ad cash', () => {
  it('the world money moves by exactly the booked adCash faucet', () => {
    const g = eligible('sp-id-1');
    const m0 = netWorldMoney(g);
    const b0 = bookedNet(g) + engineTallyOf(g);
    const id = (cmd(g, 'u1', { type: 'ad.start' }).data as { id: string }).id;
    tick3(g);
    cmd(g, 'u1', { type: 'ad.finish', id, skip: false });
    expect(netWorldMoney(g) - m0).toBeCloseTo(bookedNet(g) + engineTallyOf(g) - b0, 6);
  });
});
