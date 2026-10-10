import { describe, expect, it } from 'vitest';
import { applyCommand } from '../game';
import { credit, priceOf, today, TPD } from '../core';
import { advanceTo, BUYER_A, FOUNDER, listedWorld } from './b1fixture';
import { rosterOf, windowAt } from './insiders';
import { fundById } from '../funds/state';
import type { FundFees, FundMandate } from '../funds/types';
import type { GameState } from '../types';

/**
 * O-14 (the insider seam) and the window for a fund the founder manages. The company names its founder as the stock's insider
 * when it lists (funds/trade.ts reads `insiderId`), so the funds' insider cap applies. A fund that the owner manages trades the
 * stock inside the company's trading window, as the owner's own account does (the window roster covers it).
 */

const MANDATE: FundMandate = { classes: ['stock', 'crypto', 'commodity', 'forex', 'bond'], maxLeverage: 1, maxPositionPct: 0.2 };
const FEES: FundFees = { mgmt: 0.02, perf: 0.2 };
const STAKE = 300_000;

/** A manager old enough to open a fund (the funds tests age their managers the same way). */
function ageAndFund(g: GameState, pid: string, cash: number): void {
  g.players[pid]!.joinedTick = -1000 * TPD;
  g.players[pid]!.lastSeenTick = g.market.tick;
  credit(g, pid, cash, 'test');
}

function openFund(g: GameState, pid: string) {
  const r = applyCommand(g, pid, { type: 'fund.create', name: 'Harbour Fund', mandate: MANDATE, fees: FEES, stake: STAKE });
  if (!r.ok) throw new Error(`fund.create refused: ${r.error}`);
  return fundById(g, (r.data as { id: string }).id)!;
}

/** Steps day by day until the company's window is open (or shut), so a test runs on a day it chooses. */
function untilWindow(g: GameState, c: Parameters<typeof windowAt>[0], open: boolean): void {
  for (let k = 0; k < 400 && windowAt(c, today(g)).open !== open; k++) advanceTo(g, today(g) + 1);
  expect(windowAt(c, today(g)).open).toBe(open);
}

describe('the company names its founder as the stock insider (O-14)', () => {
  it('sets insiderId to the founder on the listed stock', () => {
    const { g, assetId } = listedWorld('insider-named');
    const def = g.market.config.assets.find((a) => a.id === assetId)!;
    expect(def.insiderId).toBe(FOUNDER);
  });

  it('puts the founder\'s fund account in the window roster, and no other fund', () => {
    const { g, c, assetId } = listedWorld('insider-roster');
    ageAndFund(g, FOUNDER, 2_000_000);
    const f = openFund(g, FOUNDER);
    expect(rosterOf(g, c)).toContain(f.accountId);
    expect(rosterOf(g, c)).toContain(FOUNDER);
    void assetId;
  });
});

describe('a fund the founder manages stays inside the insider rules on the founder\'s stock', () => {
  it('is capped at 5% of NAV in the stock, and files it, as an insider fund', () => {
    const { g, c, assetId } = listedWorld('insider-cap');
    ageAndFund(g, FOUNDER, 2_000_000);
    const f = openFund(g, FOUNDER);
    untilWindow(g, c, true);
    const px = priceOf(g, assetId);
    const over = applyCommand(g, FOUNDER, { type: 'fund.trade', fundId: f.id, assetId, side: 'buy', qty: Math.floor((0.1 * STAKE) / px) });
    expect(over.ok).toBe(false);
    expect(over.error).toBe('fundInsiderCap');
    const within = applyCommand(g, FOUNDER, { type: 'fund.trade', fundId: f.id, assetId, side: 'buy', qty: Math.max(1, Math.floor((0.04 * STAKE) / px)) });
    expect(within.ok).toBe(true);
    expect(f.filings.map((x) => x.assetId)).toEqual([assetId]);
  });

  it('cannot trade the stock while the company window is shut, and the refusal is the engine\'s closed window', () => {
    const { g, c, assetId } = listedWorld('insider-window');
    ageAndFund(g, FOUNDER, 2_000_000);
    const f = openFund(g, FOUNDER);
    untilWindow(g, c, false);
    const r = applyCommand(g, FOUNDER, { type: 'fund.trade', fundId: f.id, assetId, side: 'buy', qty: 1 });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('fundOrderRejected');
    expect((r.data as { reason?: string } | undefined)?.reason).toBe('closedWindow');
    // nothing filled: the fund holds no shares of the stock
    expect(g.market.accounts[f.accountId]?.positions[assetId]).toBeUndefined();
  });

  it('a fund with no insider link trades the same stock while the window is shut (the control)', () => {
    const { g, c, assetId } = listedWorld('insider-control');
    ageAndFund(g, BUYER_A, 2_000_000);
    g.players[BUYER_A]!.rankId = 'R3';
    const f = openFund(g, BUYER_A);
    untilWindow(g, c, false);
    expect(rosterOf(g, c)).not.toContain(f.accountId);
    const r = applyCommand(g, BUYER_A, { type: 'fund.trade', fundId: f.id, assetId, side: 'buy', qty: 1 });
    expect(r.ok).toBe(true);
  });
});
