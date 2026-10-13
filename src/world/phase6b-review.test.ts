import { describe, expect, it } from 'vitest';
import { touchLinks } from './collusion';
import { applyCommand, createGame, stepGame } from './game';
import { cashOf, priceOf, realDayOf, REAL_DAY, RESTRICT_TICKS, restrictedNow, spendableCash } from './core';
import { refreshNetWorth } from './assets';
import { boardNetWorth, comebackMarginRefusal, comebackTick, comebackView } from './comeback';
import { adInsiderRefusal, adsUsedToday, SPONSOR } from './sponsor';
import { emptyLab } from './lab';
import type { GameState, Command } from './types';

/**
 * Review fixes for 6B (velvet-bankruptcy.md, velvet-rewarded-ads.md, ROADMAP 2.6 and 2.7). Each test is one probe the reviewer
 * ran: the real-day cap, the alliance hop, the day-start net worth, ad cash behind a margin buy, the margin block, the boards,
 * the stalled close, the lab reset, and the ad cash that is never more than the cash it sits in.
 */

function cmd(g: GameState, pid: string, c: Command) {
  return applyCommand(g, pid, c);
}

/** A joined, backdated player under the line at the start of the real day (cash 600, net worth under $1,000). */
function joined(seed: string, pid = 'u1'): GameState {
  const g = createGame(seed, { warmupDays: 1, npcs: false });
  stepGame(g);
  const r = cmd(g, pid, { type: 'join', handle: `player_${pid}`, country: 'AV' });
  if (!r.ok) throw new Error(r.error);
  g.players[pid]!.onboarding.skipped = true;
  cmd(g, pid, { type: 'admin.age', playerId: pid, ticks: 2 * REAL_DAY });
  const p = g.players[pid]!;
  const acct = g.market.accounts[pid]!;
  g.market.accounts[pid] = { ...acct, cash: 600, startingCash: 600, peakEquity: 600, dayStartEquity: 600 };
  refreshNetWorth(g, p);
  p.adDay = { day: realDayOf(g), cash: 600, netWorth: p.netWorth };
  return g;
}

function breakOnce(g: GameState, pid: string): { ok: boolean; error?: string } {
  const start = cmd(g, pid, { type: 'ad.start' });
  if (!start.ok) return { ok: false, error: start.error };
  const id = (start.data as { id: string }).id;
  for (let k = 0; k < 3; k++) stepGame(g);
  const fin = cmd(g, pid, { type: 'ad.finish', id, skip: false });
  return fin.ok ? { ok: true } : { ok: false, error: fin.error };
}

describe('6B review: the sponsor cap and the offer', () => {
  it('alliance hopping does not reset the ten breaks of the real day', () => {
    const g = joined('rv-hop-1');
    cmd(g, 'u2', { type: 'join', handle: 'player_u2', country: 'AV' });
    g.alliances.a1 = { id: 'a1', name: 'Ring', tag: 'R', ownerId: 'u2', members: { u1: 'member', u2: 'owner' }, treasury: 0, createdTick: 0, motto: '', sharedDefense: 0 };
    g.players.u1!.allianceId = 'a1';
    touchLinks(g);
    for (let k = 0; k < SPONSOR.dailyCap; k++) expect(breakOnce(g, 'u1').ok).toBe(true);
    // leave the alliance: the player's own count still holds the ten
    g.players.u1!.allianceId = null;
    touchLinks(g);
    expect(adsUsedToday(g, 'u1')).toBe(SPONSOR.dailyCap);
    expect(cmd(g, 'u1', { type: 'ad.start' }).error).toBe('adCap');
  });

  it('a day-start net worth of $1,000 or more is never offered, even with the cash under the line', () => {
    const g = joined('rv-nw-1');
    const p = g.players.u1!;
    const acct = g.market.accounts.u1!;
    g.market.accounts.u1 = { ...acct, cash: 1_000_000, startingCash: 1_000_000, peakEquity: 1_000_000, dayStartEquity: 1_000_000 };
    refreshNetWorth(g, p);
    p.adDay = { day: realDayOf(g), cash: 600, netWorth: 1_000_000 };
    expect(cmd(g, 'u1', { type: 'ad.start' })).toEqual({ ok: false, error: 'adNotOffered' });
    const v = comebackView(g, 'u1')!;
    expect(v.ad.offered).toBe(false);
    expect(v.card).toBe(false);
  });
});

describe('6B review: ad cash cannot back margin, and never exceeds the cash it sits in', () => {
  it('two open buys that together exceed the cash are not both accepted with ad cash', () => {
    const g = joined('rv-margin-1');
    const p = g.players.u1!;
    p.rankId = 'R2';
    const acct = g.market.accounts.u1!;
    g.market.accounts.u1 = { ...acct, cash: 250, startingCash: 250, peakEquity: 250, dayStartEquity: 250, maxLeverage: 2 };
    p.adLots = [{ amount: 250, untilTick: g.market.tick + RESTRICT_TICKS, kind: 'ad' }];
    const asset = g.market.config.assets.find((a) => a.listed !== false && a.assetClass === 'stock')!.id;
    // a limit well below the market so both orders rest open in the same tick, each about $190 of cost
    const limitPrice = Math.round(priceOf(g, asset) * 0.5 * 100) / 100;
    const qty = Math.floor(190 / limitPrice);
    const order = { assetId: asset, side: 'buy' as const, type: 'limit' as const, qty, limitPrice };
    const first = cmd(g, 'u1', { type: 'order.place', order });
    expect(first.ok).toBe(true);
    const second = cmd(g, 'u1', { type: 'order.place', order });
    expect(second).toEqual({ ok: false, error: 'adCashMargin' });
  });

  it('restricted cash is never more than the cash in the account, and an insider cost from it is refused as ops', () => {
    const g = joined('rv-restrict-1');
    const p = g.players.u1!;
    g.market.accounts.u1 = { ...g.market.accounts.u1!, cash: 100, startingCash: 100 };
    p.adLots = [{ amount: 250, untilTick: g.market.tick + RESTRICT_TICKS, kind: 'ad' }];
    expect(restrictedNow(g, 'u1')).toBe(100);
    expect(spendableCash(g, 'u1')).toBe(0);
    expect(adInsiderRefusal(g, 'u1', 50)).toBe('adCashOps');
  });
});

describe('6B review: the margin block and the boards', () => {
  it('a fresh start blocks a margin buy for 14 real days, and a reduce-only order passes', () => {
    const g = joined('rv-block-1');
    const p = g.players.u1!;
    p.comeback = { chapter: 2, chapterStartTick: g.market.tick, peak: 0, marginBlockUntil: g.market.tick + 14 * REAL_DAY };
    const asset = g.market.config.assets.find((a) => a.listed !== false)!.id;
    const px = priceOf(g, asset);
    const big = { playerId: 'u1', assetId: asset, side: 'buy' as const, type: 'limit' as const, qty: Math.ceil(1000 / px), limitPrice: px };
    expect(comebackMarginRefusal(g, 'u1', big)).toBe('comebackMarginBlock');
    expect(comebackMarginRefusal(g, 'u1', { ...big, reduceOnly: true })).toBeNull();
    g.market = { ...g.market, tick: g.market.tick + 14 * REAL_DAY };
    expect(comebackMarginRefusal(g, 'u1', big)).toBeNull();
  });

  it('the board keeps the closed chapter End when the new chapter is lower, and the live value once it is higher', () => {
    const g = joined('rv-board-1');
    const p = g.players.u1!;
    p.comeback = { chapter: 2, chapterStartTick: 0, peak: 5000, last: { chapter: 1, startTick: 0, endTick: 10, peak: 14880.2, end: 612.4, losses: [] } };
    p.netWorth = 300;
    p.markNetWorth = 300;
    expect(boardNetWorth(g, p)).toBe(612.4);
    p.netWorth = 5000;
    p.markNetWorth = 5000;
    expect(boardNetWorth(g, p)).toBe(5000);
  });
});

describe('6B review: the stalled close and the lab reset', () => {
  it('a close that does not flatten within a real day is abandoned, and the card returns', () => {
    const g = joined('rv-stall-1');
    const p = g.players.u1!;
    p.comeback = { chapter: 1, chapterStartTick: 0, peak: 0, closing: { tick: g.market.tick - REAL_DAY, perk: 'lessons', forced: false, netWorth: 300 } };
    comebackTick(g, null);
    expect(p.comeback!.closing).toBeUndefined();
    expect(comebackView(g, 'u1')!.card).toBe(true);
  });

  it('a fresh start clears the lab models and compute, keeps the research, and opens the account at $5,000', () => {
    const g = joined('rv-lab-1');
    g.lab.u1 = { ...emptyLab(), gpus: { H100: 2 }, research: ['node-a'], data: 40 };
    const r = cmd(g, 'u1', { type: 'comeback.confirm', perk: 'lessons' });
    expect(r.ok).toBe(true);
    expect(g.lab.u1!.gpus).toEqual({});
    expect(g.lab.u1!.data).toBe(0);
    expect(g.lab.u1!.research).toEqual(['node-a']);
    expect(cashOf(g, 'u1')).toBe(5000);
  });
});
