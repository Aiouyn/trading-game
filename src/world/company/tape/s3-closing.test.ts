/**
 * Tape section 3, the window warning and the close (tape-company-building.md section 3.6 and 3.5, unchanged in Quant v1.7,
 * section 6.1). The warning fires once at F+17 (five open days before F+21 closes the window), the founder alone sees the
 * close line, and an open covered order is cancelled when the window shuts. Test names carry the Tape id.
 */
import { describe, expect, it } from 'vitest';
import { COMPANY } from '@/content/company';
import { applyCommand, stepGame } from '../../game';
import { TPD } from '../../core';
import { orderHistory } from '../../../engine/trading';
import { advanceTo, BUYER_A, FOUNDER, listedWorld } from '../b1fixture';
import { nextOpenDay, windowAt } from '../insiders';

const WARN = 'company.note.windowClosing';
const CLOSED = 'company.note.windowClosed';

function farBid(assetId: string, qty = 1) {
  return { assetId, side: 'buy' as const, type: 'limit' as const, limitPrice: 0.0001, qty, tif: 'gtc' as const };
}

/** The inbox items with a given message key for a player (the vars are the message descriptor's). */
function inboxOf(g: ReturnType<typeof listedWorld>['g'], pid: string, key: string) {
  return g.players[pid]!.inbox.filter((n) => n.msg?.key === key);
}

/** The game day a tick falls on (day 0 is ticks 1..TPD). */
const dayOfTick = (tick: number) => Math.floor((tick - 1) / TPD);

/**
 * Steps engine ticks until a condition holds. The listed stock opens halted (haltUntil is a later tick), and the engine
 * settles orders only once the halt lifts, so the window gate runs a little way into the shut day, not on its first tick.
 */
function stepUntil(g: ReturnType<typeof listedWorld>['g'], done: () => boolean, max = 400): void {
  for (let k = 0; k < max && !done(); k++) stepGame(g);
}

describe('Tape s3: window warning and close', () => {
  it('window_closing_day: the warning reaches the founder once per window, on F+17 (close minus 4), with the exact close and reopen days', () => {
    const { g, c } = listedWorld('wc-day');
    advanceTo(g, 280);
    // the warning runs from the listing (day 201): the windows that close at 213, 276 are the ones it reaches by day 280
    const closes = c.windowRanges.map(([, b]) => b).filter((b) => b - (COMPANY.trading.windowClosingDays - 1) >= 201);
    expect(closes).toEqual([213, 276]);
    const warnings = inboxOf(g, FOUNDER, WARN);
    expect(warnings.length).toBe(closes.length);
    for (const b of closes) {
      const hits = warnings.filter((n) => (n.msg?.vars as { closesDay?: number } | undefined)?.closesDay === b);
      expect(hits.length, `window closing ${b}`).toBe(1);
      expect(dayOfTick(hits[0]!.tick)).toBe(b - (COMPANY.trading.windowClosingDays - 1));
      expect((hits[0]!.msg?.vars as { reopensDay?: number }).reopensDay).toBe(nextOpenDay(c, b + 1));
    }
  });

  it('window_closing_outcome_blind: the warning payload is identical for a good and a bad quarter so far', () => {
    const good = listedWorld('wc-good');
    const bad = listedWorld('wc-bad');
    good.c.qtd.revenue = 9_000_000;
    bad.c.qtd.revenue = 1;
    advanceTo(good.g, 260);
    advanceTo(bad.g, 260);
    const a = inboxOf(good.g, FOUNDER, WARN).map((n) => JSON.stringify(n.msg?.vars));
    const b = inboxOf(bad.g, FOUNDER, WARN).map((n) => JSON.stringify(n.msg?.vars));
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });

  it('window_close_cancel and window_closed_event: an open covered order is cancelled when the window shuts, with one founder line that counts it', () => {
    const { g, c, assetId } = listedWorld('wc-cancel');
    advanceTo(g, 205); // F = 192: the window is open 194..213
    expect(windowAt(c, 205).open).toBe(true);
    expect(applyCommand(g, FOUNDER, { type: 'order.place', order: farBid(assetId) }).ok).toBe(true);
    advanceTo(g, 214); // the first day the window is shut
    stepUntil(g, () => orderHistory(g.market, FOUNDER).some((o) => o.status !== 'open'));
    const mine = orderHistory(g.market, FOUNDER).filter((o) => o.side === 'buy' && o.assetId === assetId);
    expect(mine.length).toBe(1);
    expect(mine[0]!.status).toBe('cancelled');
    expect(mine[0]!.rejectReason).toBe('closedWindow');
    const lines = inboxOf(g, FOUNDER, CLOSED);
    expect(lines.length).toBe(1);
    expect(lines[0]!.msg?.vars).toMatchObject({ count: 1, reopensDay: nextOpenDay(c, 214) });
  });

  it('window_close_line_private: the close line is the founder\'s alone; a second player is shown nothing', () => {
    const { g, assetId } = listedWorld('wc-private');
    advanceTo(g, 205);
    expect(applyCommand(g, FOUNDER, { type: 'order.place', order: farBid(assetId) }).ok).toBe(true);
    advanceTo(g, 214);
    stepUntil(g, () => inboxOf(g, FOUNDER, CLOSED).length > 0);
    expect(inboxOf(g, FOUNDER, CLOSED).length).toBe(1);
    expect(inboxOf(g, BUYER_A, CLOSED)).toEqual([]);
  });

  it('stacking_rule: a long of 150 can sell 100 once; a second 100 sell while the first rests is refused (no short licence)', () => {
    const { g, c, assetId } = listedWorld('stack');
    advanceTo(g, 383); // past the 168-gd lockup (listed 201) and inside the window that the filing at 381 opens
    expect(windowAt(c, 383).open).toBe(true);
    g.market.accounts[FOUNDER]!.positions[assetId] = { qty: 150, avgCost: 1 } as never;
    const sell = (qty: number) => applyCommand(g, FOUNDER, { type: 'order.place', order: { assetId, side: 'sell', type: 'limit', limitPrice: 1e6, qty, tif: 'gtc' } });
    expect(sell(100).ok).toBe(true);
    expect(sell(100).ok).toBe(false); // 200 would exceed the 150 held: refused, not a short
  });
});
