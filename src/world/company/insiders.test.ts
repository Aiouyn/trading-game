import { describe, expect, it } from 'vitest';
import { orderHistory } from '@/engine';
import { applyCommand, stepGame } from '../game';
import { TPD, today } from '../core';
import { advanceTo, BUYER_A, companyOf, FOUNDER, founded, listedWorld } from './b1fixture';
import { publicCompanyView } from './views';
import { rosterOf, windowAt } from './insiders';

// The insider roster, the trading window and the insider filings (sections 6.1, 6.5 and Q18). The window is F+2..F+21
// after each filing; the engine refuses a covered account's orders outside it; founder trades are filed the next day.

/** A limit order that cannot fill (a bid far below the market), for the window tests. */
function farBid(assetId: string, qty = 1) {
  return { assetId, side: 'buy' as const, type: 'limit' as const, limitPrice: 0.0001, qty, tif: 'gtc' as const };
}

describe('the trading window (F+2 to F+21 after each filing)', () => {
  it('opens the window at F+2 and closes it after F+21, one range per filing', () => {
    const { g } = listedWorld('win-ranges');
    const c = companyOf(g);
    expect(c.windowRanges[0]).toEqual([66 + 2, 66 + 21]);
    expect(c.windowRanges[1]).toEqual([129 + 2, 129 + 21]);
    expect(c.windowRanges[2]).toEqual([192 + 2, 192 + 21]);
    expect(windowAt(c, 67).open).toBe(false);
    expect(windowAt(c, 68).open).toBe(true);
    expect(windowAt(c, 87).open).toBe(true);
    expect(windowAt(c, 88).open).toBe(false);
    expect(windowAt(c, 88).opensDay).toBe(131);
  });

  it('publishes the window schedule and the covered instrument, and nothing for a private company', () => {
    const { g } = listedWorld('win-public');
    const c = companyOf(g);
    const pub = publicCompanyView(c, 200);
    expect(pub.window).toEqual({ open: true, closesDay: 213, covered: [c.listed!.assetId] });
    const priv = founded('win-private').c;
    expect(publicCompanyView(priv, 0).window).toBeUndefined();
  });

  it('covers the founder, the treasury and the alliance mates, and no one else', () => {
    const { g } = listedWorld('win-roster');
    const c = companyOf(g);
    const roster = rosterOf(g, c);
    expect(roster).toContain(FOUNDER);
    expect(roster).toContain(`co:${c.id}:treasury`);
    expect(roster).not.toContain(BUYER_A);
  });

  it('refuses the founder an order outside the window, and accepts one inside it', () => {
    const { g, assetId } = listedWorld('win-refuse');
    // the listing day (201) is inside the window of the third filing (194 to 213)
    expect(today(g)).toBeGreaterThanOrEqual(194);
    expect(today(g)).toBeLessThanOrEqual(213);
    const inside = applyCommand(g, FOUNDER, { type: 'order.place', order: farBid(assetId) });
    expect(inside.ok).toBe(true);
    g.market = { ...g.market, tick: 215 * TPD + 1 };
    const outside = applyCommand(g, FOUNDER, { type: 'order.place', order: farBid(assetId) });
    expect(outside.ok).toBe(false);
    expect(outside.error).toBe('closedWindow');
  });

  it('leaves a buyer who is not covered free to trade in the same closed window', () => {
    const { g, assetId } = listedWorld('win-buyer');
    g.market = { ...g.market, tick: 215 * TPD + 1 };
    const r = applyCommand(g, BUYER_A, { type: 'order.place', order: farBid(assetId) });
    expect(r.ok).toBe(true);
  });

  it('warns the founder five open days before the window shuts (F+17), and not before', () => {
    const { g } = listedWorld('win-warn');
    const before = g.players[FOUNDER]!.inbox.filter((i) => i.msg?.key === 'company.note.windowClosing').length;
    advanceTo(g, 208);
    const after208 = g.players[FOUNDER]!.inbox.filter((i) => i.msg?.key === 'company.note.windowClosing').length;
    advanceTo(g, 209);
    const at209 = g.players[FOUNDER]!.inbox.filter((i) => i.msg?.key === 'company.note.windowClosing').length;
    expect(after208).toBe(before);
    expect(at209).toBe(before + 1);
  });

  it('cancels the founder open orders at the close of F+21, and not a buyer’s', () => {
    const { g, assetId } = listedWorld('win-close');
    advanceTo(g, 213);
    const mine = applyCommand(g, FOUNDER, { type: 'order.place', order: farBid(assetId) });
    expect(mine.ok).toBe(true);
    const theirs = applyCommand(g, BUYER_A, { type: 'order.place', order: farBid(assetId) });
    expect(theirs.ok).toBe(true);
    // step the engine through the close of F+21 into F+22 (the cancel runs at the first tick of the closed day)
    const target = 214 * TPD + 1;
    while (g.market.tick < target) stepGame(g);
    const mineId = (mine.data as { id: string }).id;
    const theirId = (theirs.data as { id: string }).id;
    const myOrder = orderHistory(g.market, FOUNDER).find((o) => o.id === mineId);
    const theirOrder = orderHistory(g.market, BUYER_A).find((o) => o.id === theirId);
    expect(myOrder?.status).toBe('cancelled');
    expect(theirOrder?.status).toBe('open');
  });
});

describe('insider trade filings (Q18, plan fills and in-window trades alike)', () => {
  it('files a founder fill the next day, and shows it nowhere before', () => {
    const { g, assetId } = listedWorld('ins-file');
    const c = companyOf(g);
    const day = today(g);
    // a marketable buy: it fills at the next tick, and the founder's fill is then filed on day + 1
    const r = applyCommand(g, FOUNDER, { type: 'order.place', order: { assetId, side: 'buy', type: 'market', qty: 3, tif: 'day' } });
    expect(r.ok).toBe(true);
    stepGame(g);
    expect(c.insiderTrades.length).toBeGreaterThan(0);
    const row = c.insiderTrades[c.insiderTrades.length - 1]!;
    expect(row.day).toBe(day);
    expect(row.filedDay).toBe(day + 1);
    expect(publicCompanyView(c, day).insiderTrades).toHaveLength(0);
    expect(publicCompanyView(c, day + 1).insiderTrades.some((t) => t.qty === row.qty)).toBe(true);
  });

  it('does not file a buyer’s trade', () => {
    const { g, assetId } = listedWorld('ins-buyer');
    const c = companyOf(g);
    applyCommand(g, BUYER_A, { type: 'order.place', order: { assetId, side: 'buy', type: 'market', qty: 2, tif: 'day' } });
    stepGame(g);
    expect(c.insiderTrades).toHaveLength(0);
  });
});
