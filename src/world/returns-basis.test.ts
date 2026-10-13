import { describe, expect, it } from 'vitest';
import { credit, netWorthBreakdown, priceOf } from './core';
import { applyCommand, createGame, stepGame } from './game';
import { dayClose } from './close';
import { playerView } from './view';
import type { GameState } from './types';

// R-10-7 (returns): the day change is against the prior close's equity plus what came in during the day, and "since you
// arrived" is against net invested capital (starting cash plus external cash, both sides). A grant is capital, never the
// base of a gain, so a mid-day grant of $5,000 on a $5,250 book must not turn a $100 gain into a 1.9% gain.

function joined(seed: string): GameState {
  const g = createGame(seed, { warmupDays: 1, npcs: false });
  for (let k = 0; k < 10; k++) stepGame(g);
  const r = applyCommand(g, 'u1', { type: 'join', handle: 'trader_0', country: 'AV' });
  if (!r.ok) throw new Error(r.error);
  return g;
}

describe('return bases (R-10-7)', () => {
  it('the day close divides by the prior close equity plus the day\'s external cash', () => {
    const g = joined('returns-close-base');
    while (g.market.tick < 720 + 300) stepGame(g);
    applyCommand(g, 'u1', { type: 'admin.grant', amount: 5000 });
    credit(g, 'u1', 100, 'business income');
    while (g.market.tick < 2 * 720) stepGame(g);
    const card = dayClose(g, 'u1', 1)!;
    expect(card.external).toBeCloseTo(5000, 6);
    expect(card.nwChange).toBeCloseTo(100, 6);
    expect(card.nwChangePct).toBeCloseTo(100 / (card.nwOpen + 5000), 9);
    // the old base (prior equity alone) would read about 1.9%; the grant in the base makes it about 0.98%
    expect(Math.abs(card.nwChangePct)).toBeLessThan(0.0125);
  });

  it('a day with a grant and no trading shows a zero change and a zero percentage', () => {
    const g = joined('returns-close-zero');
    while (g.market.tick < 720 + 300) stepGame(g);
    applyCommand(g, 'u1', { type: 'admin.grant', amount: 5000 });
    while (g.market.tick < 2 * 720) stepGame(g);
    const card = dayClose(g, 'u1', 1)!;
    expect(card.nwChange).toBeCloseTo(0, 6);
    expect(card.nwChangePct).toBeCloseTo(0, 9);
  });

  it('since you arrived is a percentage of net invested capital, and the view reports that base', () => {
    const g = joined('returns-arrival-base');
    const before = playerView(g, 'u1')!.arrival;
    applyCommand(g, 'u1', { type: 'admin.grant', amount: 5000 });
    credit(g, 'u1', 100, 'business income');
    const a = playerView(g, 'u1')!.arrival;
    // the onboarding grant is external too, so the external figure is the running total: the admin grant is the new part
    expect(a.external).toBeCloseTo(before.external + 5000, 6);
    expect(a.invested).toBeCloseTo(a.cash + a.external, 6);
    expect(a.change).toBeCloseTo(100, 6);
    expect(a.changePct).toBeCloseTo(a.change / a.invested, 9);
  });

  it('the status strip base (dayStart) moves with a mid-day grant, so the header day figure never reads the grant as a gain', () => {
    const g = joined('returns-header-base');
    while (g.market.tick < 720 + 300) stepGame(g);
    const before = playerView(g, 'u1')!;
    applyCommand(g, 'u1', { type: 'admin.grant', amount: 5000 });
    const after = playerView(g, 'u1')!;
    expect(after.player.dayStart.netWorth).toBeCloseTo(before.player.dayStart.netWorth + 5000, 4);
    expect(after.netWorth.total - after.player.dayStart.netWorth).toBeCloseTo(before.netWorth.total - before.player.dayStart.netWorth, 4);
  });
  it('the day close and the header read one basis with a large position open (no liquidation haircut in the day change)', { timeout: 120_000 }, () => {
    const g = joined('returns-one-basis');
    applyCommand(g, 'u1', { type: 'admin.grant', amount: 600_000 });
    while (g.market.tick < 720 + 300) stepGame(g);
    const qty = Math.floor(500_000 / priceOf(g, 'HLCN'));
    expect(applyCommand(g, 'u1', { type: 'order.place', order: { assetId: 'HLCN', side: 'buy', type: 'market', qty } }).ok).toBe(true);
    while (!g.ledgers!.u1!.days[1]) stepGame(g);
    const p = g.players.u1!;
    const days = g.ledgers!.u1!.days;
    const card = dayClose(g, 'u1', 1)!;
    const header = netWorthBreakdown(g, 'u1').total;
    // the close's closing equity is the header's total at the same tick (the haircut is not in the day record)
    expect(card.nwClose).toBeCloseTo(header, 2);
    expect(p.markNetWorth! < header - 1, 'the liquidation mark sits below the mid total on this position').toBe(true);
    // the change and the percentage are against the day record's opening equity, on the same mid basis as the header
    expect(card.nwOpen).toBeCloseTo(days[0]!.nw, 6);
    expect(card.nwChangePct).toBeCloseTo((header - card.nwOpen - card.external) / (card.nwOpen + card.external), 9);
  });
});
