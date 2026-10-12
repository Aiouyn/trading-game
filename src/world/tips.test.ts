import { describe, expect, it } from 'vitest';
import { applyCommand, createGame } from './game';
import { priceOf, TPD } from './core';
import { ECA_TUNE } from './eca-tune';
import {
  claimTipQty, flagTipTrade, medianNotional, queueInsiderTip, queueRivalTip, tipSizeFactor, tipsDay, tipsOf, TIP_SIZE_CAP, TIP_SIZE_FLOOR,
} from './tips';
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

  it('the size factor is log-shaped against the account median: 1 at the median, 3 at ten times it, capped above and floored below (R-6C-3)', () => {
    expect(tipSizeFactor(500, 500)).toBeCloseTo(1, 12);
    expect(tipSizeFactor(5_000, 500)).toBeCloseTo(3, 12);
    // a small trade keeps the floor (review repair: a flagged trade never scores zero)
    expect(tipSizeFactor(50, 500)).toBe(TIP_SIZE_FLOOR);
    expect(tipSizeFactor(1e9, 500)).toBe(TIP_SIZE_CAP);
    expect(tipSizeFactor(0, 500)).toBe(0);
    // ratio-only: a trade 3 times the median and a trade 3 times a bigger median score the same
    expect(tipSizeFactor(1500, 500)).toBeCloseTo(tipSizeFactor(30_000, 10_000), 12);
  });

  it('a flagged trade scores the tip base times the size factor: a trade at the median scores the base, ten times it about 3x', () => {
    const { g, assetId, idx } = catalystWorld('tip-size');
    const day = Math.floor((g.market.tick - 1) / TPD) + 4;
    g.tips = {
      seq: 1,
      tips: [{ id: 'tp1', tick: g.market.tick, playerId: 'p1', assetId, claim: 'up', truth: true, insider: true, source: 'insider', revealsTick: day * TPD + 1, companyId: 'co' }],
      pending: [], flags: [], received: { [`p1|${assetId}`]: 1 }, notionals: {},
    };
    setReport(g, idx, day, 0.5);
    const price = priceOf(g, assetId);
    // the median of an account with no trades yet is the floor of 500 dollars (or 2% of net worth); a trade of that notional scores the base
    const med = medianNotional(g, 'p1', 500);
    const q1 = Math.ceil(med / price);
    const atMedian = flagTipTrade(g, 'p1', assetId, 'buy', q1, g.market.tick, 0);
    expect(atMedian).toBeCloseTo(ECA_TUNE.tipBase * tipSizeFactor(q1 * price, med), 6);
    // review repair: the size is cumulative per tip, so the second order scores the increase of the tip's total, not its own factor
    const big = flagTipTrade(g, 'p1', assetId, 'buy', Math.ceil(10 * med / price), g.market.tick, 0);
    const total = (q1 * price) + Math.ceil(10 * med / price) * price;
    expect(big).toBeCloseTo(ECA_TUNE.tipBase * (Math.min(TIP_SIZE_CAP, tipSizeFactor(total, med)) - tipSizeFactor(q1 * price, med)), 6);
    expect(atMedian + big).toBeCloseTo(ECA_TUNE.tipBase * tipSizeFactor(total, med), 6);
    expect(atMedian + big).toBeLessThanOrEqual(ECA_TUNE.tipBase * TIP_SIZE_CAP + 1e-9);
  });

  it('splitting does not pay: one position in ten orders scores what one order of the same total scores (review repair)', () => {
    // the same seed twice: two identical worlds, so one price and one asset
    const one = catalystWorld('tip-split');
    const many = catalystWorld('tip-split');
    for (const w of [one, many]) {
      // a fixed median for both (no history: the floor of 2% of net worth, which is 4,000 here)
      w.g.players.p1!.netWorth = 200_000;
      const day = Math.floor((w.g.market.tick - 1) / TPD) + 4;
      w.g.tips = {
        seq: 1,
        tips: [{ id: 'tp1', tick: w.g.market.tick, playerId: 'p1', assetId: w.assetId, claim: 'up', truth: true, insider: true, source: 'insider', revealsTick: day * TPD + 1, companyId: 'co' }],
        pending: [], flags: [], received: { [`p1|${w.assetId}`]: 1 }, notionals: {},
      };
      setReport(w.g, w.idx, day, 0.5);
    }
    const price = priceOf(one.g, one.assetId);
    const unit = Math.max(1, Math.round(16_000 / price / 10));
    const single = flagTipTrade(one.g, 'p1', one.assetId, 'buy', unit * 10, one.g.market.tick, 0);
    let split = 0;
    for (let i = 0; i < 10; i++) split += flagTipTrade(many.g, 'p1', many.assetId, 'buy', unit, many.g.market.tick, 0);
    expect(single).toBeGreaterThan(0);
    expect(split).toBeCloseTo(single, 6);
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

describe('tip shares of an order: claimTipQty (R-6C-2)', () => {
  it('the flags of an order take its fills up to the flagged quantity, once', () => {
    const { g, assetId, idx } = catalystWorld('tip-claim');
    const day = Math.floor((g.market.tick - 1) / TPD) + 4;
    g.tips = {
      seq: 1,
      tips: [{ id: 'tp1', tick: g.market.tick, playerId: 'p1', assetId, claim: 'up', truth: true, insider: true, source: 'insider', revealsTick: day * TPD + 1, companyId: 'co' }],
      pending: [], flags: [], received: { [`p1|${assetId}`]: 1 }, notionals: {},
    };
    setReport(g, idx, day, 0.5);
    flagTipTrade(g, 'p1', assetId, 'buy', 10, g.market.tick, 0, 'o1');
    expect(g.tips.flags[0]!.orderId).toBe('o1');
    // a partial fill of 4, then the rest (8 asked, 6 left flagged): 4 + 6 are tip shares, the last 2 are not
    expect(claimTipQty(g, 'o1', 4)).toBe(4);
    expect(claimTipQty(g, 'o1', 8)).toBe(6);
    expect(claimTipQty(g, 'o1', 1)).toBe(0);
    // an order with no flag has no tip share
    expect(claimTipQty(g, 'o2', 5)).toBe(0);
  });
});
