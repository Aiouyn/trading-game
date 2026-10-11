import { describe, expect, it } from 'vitest';
import { applyCommand, createGame } from './game';
import { TPD } from './core';
import { flagTipTrade, queueInsiderTip, queueRivalTip, tipsDay, tipsOf } from './tips';
import { listedWorld, BUYER_B, FOUNDER } from './company/b1fixture';
import type { GameState } from './types';

// Insider tips from crime (M16 v1, specs/quant-rumors.md). A successful session on a covered insider of a listed stock queues a
// tip. The tip is delivered once the report's surprise is locked, it is always true (its claim is the sign of the surprise), and an
// order on the claim's side, after the tip and before the report, is flagged when placed. Rumors are never flagged.

/** A world with one catalyst stock whose next report is ahead; `surprise` is set by hand where a test needs it. */
function catalystWorld(seed: string): { g: GameState; assetId: string; idx: number } {
  const g = createGame(seed, { warmupDays: 0, npcs: false });
  applyCommand(g, 'p1', { type: 'join', handle: 'tip_one', country: 'AV' });
  const idx = g.market.config.assets.findIndex((d) => d.assetClass === 'stock');
  const assetId = g.market.config.assets[idx]!.id;
  return { g, assetId, idx };
}

function setReport(g: GameState, idx: number, day: number, surprise: number | null): void {
  const a = g.market.assets[idx]!;
  a.nextEarnings = day;
  a.surprise = surprise;
  a.consensus = surprise === null ? null : 0.2;
}

describe('insider tips (M16 v1)', () => {
  it('queues a tip for a successful session on a covered insider of a listed stock, and nothing in a world without catalysts', () => {
    const { g, assetId } = listedWorld('tip-queue');
    queueInsiderTip(g, BUYER_B, FOUNDER);
    const pend = tipsOf(g).pending;
    expect(pend.length).toBe(1);
    expect(pend[0]!.assetId).toBe(assetId);
    expect(pend[0]!.playerId).toBe(BUYER_B);
    // one pending tip per account and asset
    queueInsiderTip(g, BUYER_B, FOUNDER);
    expect(tipsOf(g).pending.length).toBe(1);
    // no insider on the victim's side (an outsider is not covered), nothing queued
    queueInsiderTip(g, BUYER_B, 'nobody');
    expect(tipsOf(g).pending.length).toBe(1);
    const dark = listedWorld('tip-dark');
    dark.g.market = { ...dark.g.market, config: { ...dark.g.market.config, catalysts: undefined } };
    queueInsiderTip(dark.g, BUYER_B, FOUNDER);
    expect(tipsOf(dark.g).pending.length).toBe(0);
  });

  it('a pending tip is delivered once the surprise is locked; its claim is the surprise sign, and it is always true', () => {
    const { g, assetId, idx } = catalystWorld('tip-deliver');
    g.tips = { seq: 0, tips: [], pending: [{ id: 'pt1', playerId: 'p1', assetId, companyId: 'co', tick: g.market.tick }], flags: [], received: {}, notionals: {} };
    const day = Math.floor((g.market.tick - 1) / TPD) + 5;
    setReport(g, idx, day, null);
    tipsDay(g, null);
    expect(tipsOf(g).tips.length).toBe(0);
    expect(tipsOf(g).pending.length).toBe(1);
    g.market.assets[idx]!.surprise = -0.8;
    tipsDay(g, null);
    const t = tipsOf(g).tips;
    expect(t.length).toBe(1);
    expect(t[0]!.claim).toBe('down');
    expect(t[0]!.truth).toBe(true);
    expect(t[0]!.insider).toBe(true);
    expect(t[0]!.revealsTick).toBe(day * TPD + 1);
    expect(tipsOf(g).pending.length).toBe(0);
  });

  it('a pending tip lapses once its report has passed', () => {
    const { g, assetId, idx } = catalystWorld('tip-lapse');
    g.market = { ...g.market, tick: 5 * TPD + 1 };
    g.tips = { seq: 0, tips: [], pending: [{ id: 'pt1', playerId: 'p1', assetId, companyId: 'co', tick: g.market.tick }], flags: [], received: {}, notionals: {} };
    setReport(g, idx, 4, 0.5);
    tipsDay(g, null);
    expect(tipsOf(g).tips.length).toBe(0);
    expect(tipsOf(g).pending.length).toBe(0);
  });

  it('flags only an order on the claim side, after the tip and before the report', () => {
    const { g, assetId, idx } = catalystWorld('tip-flag');
    const day = Math.floor((g.market.tick - 1) / TPD) + 4;
    g.tips = {
      seq: 1,
      tips: [{ id: 'tp1', tick: g.market.tick, playerId: 'p1', assetId, claim: 'up', truth: true, insider: true, source: 'insider', revealsTick: day * TPD + 1, companyId: 'co' }],
      pending: [], flags: [], received: { [`p1|${assetId}`]: 1 }, notionals: {},
    };
    setReport(g, idx, day, 0.5);
    const tick = g.market.tick;
    expect(flagTipTrade(g, 'p1', assetId, 'sell', 5, tick, 0)).toBe(0);
    expect(flagTipTrade(g, 'p1', assetId, 'buy', 5, tick, 0)).toBeGreaterThan(0);
    expect(flagTipTrade(g, 'p1', assetId, 'buy', 5, g.tips.tips[0]!.revealsTick, 0)).toBe(0);
    expect(flagTipTrade(g, 'p1', assetId, 'buy', 5, g.tips.tips[0]!.tick - 1, 0)).toBe(0);
    expect(flagTipTrade(g, 'p2', assetId, 'buy', 5, tick, 0)).toBe(0);
    expect(g.tips.flags.length).toBe(1);
    expect(g.tips.flags[0]!.tradedBeforeReveal).toBe(true);
  });

  it('a trade with no tip (a rumor, a public read) is never flagged', () => {
    const { g, assetId } = catalystWorld('tip-none');
    expect(flagTipTrade(g, 'p1', assetId, 'buy', 100, g.market.tick, 0)).toBe(0);
    expect(g.tips).toBeUndefined();
  });

  it('the size factor scales the points with the trade against the account median (capped at 40)', () => {
    const { g, assetId, idx } = catalystWorld('tip-size');
    const day = Math.floor((g.market.tick - 1) / TPD) + 4;
    g.tips = {
      seq: 1,
      tips: [{ id: 'tp1', tick: g.market.tick, playerId: 'p1', assetId, claim: 'up', truth: true, insider: true, source: 'insider', revealsTick: day * TPD + 1, companyId: 'co' }],
      pending: [], flags: [], received: { [`p1|${assetId}`]: 1 }, notionals: {},
    };
    setReport(g, idx, day, 0.5);
    const small = flagTipTrade(g, 'p1', assetId, 'buy', 1, g.market.tick, 0);
    const big = flagTipTrade(g, 'p1', assetId, 'buy', 1_000_000, g.market.tick, 0);
    expect(small).toBeGreaterThan(0);
    expect(big).toBeLessThanOrEqual(40);
    expect(big).toBeGreaterThan(small);
  });
});

describe('tip flags: the pre-tip position, and the rival route (6C review repair)', () => {
  it('a trade that only reduces a position held before the tip is not flagged; the rest of it is', () => {
    const { g, assetId, idx } = catalystWorld('tip-pre');
    const day = Math.floor((g.market.tick - 1) / TPD) + 4;
    g.tips = {
      seq: 1,
      tips: [{ id: 'tp1', tick: g.market.tick, playerId: 'p1', assetId, claim: 'down', truth: true, insider: true, source: 'insider', revealsTick: day * TPD + 1, companyId: 'co', heldAtTip: 10 }],
      pending: [], flags: [], received: { [`p1|${assetId}`]: 1 }, notionals: {},
    };
    setReport(g, idx, day, -0.5);
    const tick = g.market.tick;
    // the account is long 10 before the tip: selling the 10 is closing the old position, not trading on the tip
    expect(flagTipTrade(g, 'p1', assetId, 'sell', 10, tick, 10)).toBe(0);
    expect(g.tips.flags.length).toBe(0);
    // a sell of 15 with the same 10 held: the first 10 are the old position, the other 5 open a short on the tip
    expect(flagTipTrade(g, 'p1', assetId, 'sell', 15, tick, 10)).toBeGreaterThan(0);
    expect(g.tips.flags.length).toBe(1);
    expect(g.tips.flags[0]!.qty).toBe(5);
  });

  it('the same rule for an up claim: covering a short held before the tip is not flagged', () => {
    const { g, assetId, idx } = catalystWorld('tip-pre-up');
    const day = Math.floor((g.market.tick - 1) / TPD) + 4;
    g.tips = {
      seq: 1,
      tips: [{ id: 'tp1', tick: g.market.tick, playerId: 'p1', assetId, claim: 'up', truth: true, insider: true, source: 'insider', revealsTick: day * TPD + 1, companyId: 'co', heldAtTip: -4 }],
      pending: [], flags: [], received: { [`p1|${assetId}`]: 1 }, notionals: {},
    };
    setReport(g, idx, day, 0.5);
    const tick = g.market.tick;
    expect(flagTipTrade(g, 'p1', assetId, 'buy', 4, tick, -4)).toBe(0);
    expect(flagTipTrade(g, 'p1', assetId, 'buy', 6, tick, -4)).toBeGreaterThan(0);
    expect(g.tips.flags[0]!.qty).toBe(2);
  });

  it('a planted session on a rival fund queues a tip about one listed stock, with the rival named as the source', () => {
    const { g, assetId, idx } = catalystWorld('tip-rival');
    const day = Math.floor((g.market.tick - 1) / TPD) + 4;
    setReport(g, idx, day, null);
    queueRivalTip(g, 'p1', 'rivalFund1');
    const pend = tipsOf(g).pending;
    expect(pend.length).toBe(1);
    expect(pend[0]!.companyId).toBe('rival:rivalFund1');
    expect(pend[0]!.playerId).toBe('p1');
    expect(g.market.config.assets.some((d) => d.id === pend[0]!.assetId)).toBe(true);
    expect(pend[0]!.assetId).toBe(assetId);
  });
});
