import { describe, expect, it } from 'vitest';
import { stepGame } from '../game';
import en from '@/i18n/en.json';
import { LP } from './constants';
import { barsOf, carryBar, touchBar } from './bars';
import { hasLink, moderateText } from './moderate';
import { npcReplyTick, repliesOf } from './reply';
import { CREATOR, TRADER, launch, lpWorld, run } from './fixture';
import { cardOf, launchpadView, lpPageOf } from './view';
import { LP_NPC_REPLY_KEYS, LP_NPC_REPLY_POOLS } from '../text/lpReplies';

// The review fixes of Phase 10 (the Launchpad track, p10/lp): real candles from the trades, a link refused on any host with a path,
// profanity refused, the reply count that does not saturate, the NPC lines by status and the NPC gate on a player's trade, a dead token
// takes no reply, the New feed in bump order, and a slippage limit shown at its typed precision.

/** The feed size the view uses (view.ts FEED): the New feed holds this many cards. */
const FEED = 40;

describe('candles are built from the trades (review item 2)', () => {
  it('two trades in one minute set that minute high, low and close from their fill prices', () => {
    const g = lpWorld('rv-candle-trades');
    launch(g, CREATOR, 'CNDL');
    // $100 is inside the 5% slippage limit; the sell of half the holding is at the post-buy price, so the round trip spans a range
    expect(run(g, TRADER, { type: 'lp.buy', ticker: 'CNDL', spendCents: 10_000 }).ok).toBe(true);
    const have = g.launchpad!.tokens.CNDL!.bal[TRADER]!;
    expect(run(g, TRADER, { type: 'lp.sell', ticker: 'CNDL', tokens: Math.floor(have / 2) }).ok).toBe(true);
    const t = g.launchpad!.tokens.CNDL!;
    const mine = t.tape.filter((tr) => tr.anon !== undefined);
    expect(mine.length).toBe(2);
    const minute = Math.floor(mine[1]!.tick / LP.CHART_EVERY) * LP.CHART_EVERY;
    // the minute holds the player's two lines and the cohort's (the same minute); every line is a touch
    const inMinute = t.tape.filter((tr) => Math.floor(tr.tick / LP.CHART_EVERY) * LP.CHART_EVERY === minute);
    const bar = barsOf(t).m.find((b) => b[0] === minute)!;
    const prices = inMinute.map((tr) => tr.price);
    expect(bar[2]).toBeGreaterThanOrEqual(Math.max(...prices) - 1e-15);
    expect(bar[3]).toBeLessThanOrEqual(Math.min(...prices) + 1e-15);
    expect(bar[2]).toBeGreaterThanOrEqual(mine[0]!.price - 1e-15); // the buy's fill is inside the candle
    expect(bar[3]).toBeLessThanOrEqual(mine[1]!.price + 1e-15); // and the sell's
    expect(bar[4]).toBeCloseTo(inMinute[inMinute.length - 1]!.price, 12); // close: the last fill
    expect(bar[2]).toBeGreaterThan(bar[3]); // the round trip is not a flat candle
  });

  it('every bar opens at the previous close and its high and low hold its open and close, through a stepped run', () => {
    const g = lpWorld('rv-candle-run');
    launch(g, CREATOR, 'RUNC');
    run(g, TRADER, { type: 'lp.buy', ticker: 'RUNC', spendCents: 200_000 });
    for (let k = 0; k < 6 * 12; k++) stepGame(g);
    const m = barsOf(g.launchpad!.tokens.RUNC!).m;
    expect(m.length).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < m.length; i++) {
      const [, o, h, l, c] = m[i]!;
      expect(h).toBeGreaterThanOrEqual(Math.max(o, c) - 1e-12);
      expect(l).toBeLessThanOrEqual(Math.min(o, c) + 1e-12);
      if (i > 0) expect(o).toBeCloseTo(m[i - 1]![4], 12);
    }
  });

  it('a minute with no trade carries the last price flat, and an hour bar is kept alongside', () => {
    const g = lpWorld('rv-carry');
    launch(g, CREATOR, 'CARY');
    const t = g.launchpad!.tokens.CARY!;
    const base = barsOf(t).m.at(-1)![4];
    carryBar(t, 10 * LP.CHART_EVERY, base);
    expect(barsOf(t).m.at(-1)).toEqual([10 * LP.CHART_EVERY, base, base, base, base]);
    expect(barsOf(t).h.length).toBeGreaterThanOrEqual(1);
  });

  it('an old token (a chart, no bars) reads as flat bars, reading does not write, and the first write migrates it', () => {
    const g = lpWorld('rv-old-bars');
    launch(g, CREATOR, 'OLDB');
    const t = g.launchpad!.tokens.OLDB!;
    delete t.bars;
    t.chart = [[12, 1e-5], [24, 2e-5], [36, 2e-5]];
    const read = barsOf(t).m;
    expect(read.map((b) => b[0])).toEqual([12, 24, 36]);
    expect(read[1]).toEqual([24, 1e-5, 2e-5, 1e-5, 2e-5]);
    expect(t.bars).toBeUndefined();
    touchBar(t, 40, 3e-5);
    expect(t.bars!.m.length).toBe(3);
    expect(t.bars!.m[2]).toEqual([36, 2e-5, 3e-5, 2e-5, 3e-5]);
  });
});

describe('the link refusal holds on any host with a path (review item 3)', () => {
  it('refuses the links the review probed, and the other host shapes', () => {
    const links = [
      'join bit.ly/pumpx now', 'free airdrop at t.co/abc', 'go to pump.fun/x', 'see goo.gl/abc', 'linktr.ee/whoever',
      'my site dapp.dev/mint', 'pump.fun', 'buy at pump[.]fun today', 'hxxps://scam.example', 'www.example', 'a.b.zz/q', 'x.ai/y',
    ];
    for (const text of links) expect(hasLink(text), text).toBe(true);
    for (const text of links) expect(moderateText(text, LP.REPLY_MAX), text).toMatchObject({ ok: false, reason: 'link' });
  });

  it('lets through the text that is not a link', () => {
    const clean = ['Moon by Friday. Fast.', 'Let me see the chart', 'version 1.5/2 looks fine', 'the 3.5/10 score', 'and/or both', 'Sold half.'];
    for (const text of clean) expect(hasLink(text), text).toBe(false);
    expect(moderateText('Moon by Friday.', LP.REPLY_MAX).ok).toBe(true);
  });
});

describe('common profanity is refused (review item 3)', () => {
  it('refuses "fuck this coin", "this is a shitcoin" and the usual words, and passes a clean line', () => {
    for (const text of ['fuck this coin', 'this is a shitcoin', 'what a bullshit launch', 'such a bitch of a chart']) {
      expect(moderateText(text, LP.REPLY_MAX), text).toMatchObject({ ok: false, reason: 'abuse' });
    }
    expect(moderateText('a clean line about the chart', LP.REPLY_MAX).ok).toBe(true);
  });
});

describe('the reply count does not saturate (review item 1)', () => {
  it('counts every post on the card, the page and the console, while the thread keeps the newest REPLY_KEEP', () => {
    const g = lpWorld('rv-count');
    launch(g, CREATOR, 'COUN');
    const t = g.launchpad!.tokens.COUN!;
    for (let i = 0; i < 65; i++) {
      g.market = { ...g.market, tick: g.market.tick + LP.REPLY_COOLDOWN_TICKS };
      expect(run(g, TRADER, { type: 'lp.reply', ticker: 'COUN', text: `post ${i}` }).ok).toBe(true);
    }
    expect(repliesOf(t)).toBe(65);
    expect(cardOf(g, t).replies).toBe(65);
    expect(lpPageOf(g, TRADER, 'COUN')!.replies).toBe(65);
    expect(lpPageOf(g, TRADER, 'COUN')!.thread.length).toBe(LP.REPLY_KEEP);
    expect(launchpadView(g, CREATOR).console.find((c) => c.ticker === 'COUN')!.replies).toBe(65);
  });
});

describe('NPC lines follow the token state (review item 6)', () => {
  it('the live pool has every line but the two graduated-only ones; the graduated pool has no curve or graduation talk', () => {
    expect(LP_NPC_REPLY_POOLS.live.length).toBe(LP_NPC_REPLY_KEYS.length - 2);
    for (const i of [0, 7, 8, 19]) expect(LP_NPC_REPLY_POOLS.graduated).not.toContain(i);
    for (const i of [20, 21]) expect(LP_NPC_REPLY_POOLS.live).not.toContain(i);
  });

  it('every line exists in English, and the creator line claims nothing about the creator', () => {
    const copy = en as Record<string, string>;
    for (const key of LP_NPC_REPLY_KEYS) expect(copy[key], key).toBeTruthy();
    expect(copy['lp.npcreply.5']).not.toMatch(/has not sold|creator has/i);
  });

  it('a graduated token posts only from its pool', () => {
    const g = lpWorld('rv-npc-grad');
    launch(g, CREATOR, 'NGRD');
    const t = g.launchpad!.tokens.NGRD!;
    t.status = 'graduated';
    t.gradTick = 1;
    t.gradPrice = 0.00002;
    for (let k = 1; k <= 400; k++) {
      g.market = { ...g.market, tick: 12 * k };
      npcReplyTick(g, t);
    }
    const npc = (t.replies ?? []).filter((r) => r.role === 'npc');
    expect(npc.length).toBeGreaterThan(0);
    const allowed = LP_NPC_REPLY_POOLS.graduated.map((i) => `lp.npcreply.${i}`);
    for (const r of npc) expect(allowed).toContain(r.key);
  });
});

describe('NPC replies need a player on the token (review item 14)', () => {
  it('no reply while only the NPC cohort trades, a reply gate that opens on a player trade and closes after the window', () => {
    const g = lpWorld('rv-npc-gate');
    launch(g, CREATOR, 'GATE');
    const t = g.launchpad!.tokens.GATE!;
    const start = g.market.tick;
    for (let k = 1; k <= 300; k++) {
      g.market = { ...g.market, tick: start + 12 * k };
      npcReplyTick(g, t);
    }
    expect((t.replies ?? []).filter((r) => r.role === 'npc').length).toBe(0);
    const tradeTick = start + 12 * 400;
    g.market = { ...g.market, tick: tradeTick };
    expect(run(g, TRADER, { type: 'lp.buy', ticker: 'GATE', spendCents: 10_000 }).ok).toBe(true);
    expect(t.playerTradeAt).toBe(tradeTick);
    const late = tradeTick + LP.NPC_REPLY_WINDOW_TICKS + 12;
    for (let tk = late; tk <= late + 12 * 40; tk += 12) {
      g.market = { ...g.market, tick: tk };
      npcReplyTick(g, t);
    }
    expect((t.replies ?? []).filter((r) => r.role === 'npc' && r.tick >= late).length).toBe(0);
  });
});

describe('a dead token takes no reply (review item 14)', () => {
  it('refuses a reply with the dead-thread refusal', () => {
    const g = lpWorld('rv-dead-reply');
    launch(g, CREATOR, 'DEAD');
    g.launchpad!.tokens.DEAD!.status = 'dead';
    const r = run(g, TRADER, { type: 'lp.reply', ticker: 'DEAD', text: 'still here' });
    expect(r.ok).toBe(false);
    expect(r.data).toMatchObject({ refusal: 'replyDead' });
  });
});

describe('the New feed is in bump order (review item 7)', () => {
  it('a token with a fresh trade is in the feed although 40 newer launches exist, and it leads the feed', () => {
    const g = lpWorld('rv-bump');
    launch(g, CREATOR, 'BUMP');
    const lp = g.launchpad!;
    const base = lp.tokens.BUMP!;
    for (let i = 0; i < 45; i++) {
      const id = `ZQ${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`;
      lp.tokens[id] = { ...structuredClone(base), ticker: id, createdTick: 3000 + i * 10, tape: [], bars: undefined, replies: undefined };
      lp.order.push(id);
    }
    g.market = { ...g.market, tick: 9000 };
    base.tape.push({ tick: 9000, side: 'buy', qty: 1, price: 1e-5, creator: false, npc: false, usd: 1, anon: 'abc123' });
    const v = launchpadView(g, TRADER);
    expect(v.feeds.newest.length).toBe(FEED);
    expect(v.feeds.newest[0]!.ticker).toBe('BUMP');
    expect(v.feeds.newest.some((c) => c.ticker === 'BUMP')).toBe(true);
  });
});

describe('slippage limits show at the precision typed (review item 13)', () => {
  it('a 0.01% limit reads 0.01%, not 0.0%, in the refusal', () => {
    const g = lpWorld('rv-pct');
    launch(g, CREATOR, 'PCTS');
    const r = run(g, TRADER, { type: 'lp.buy', ticker: 'PCTS', spendCents: 100_000, maxSlip: 0.0001 });
    expect(r.ok).toBe(false);
    const parts = (r.data as { parts: { vars?: Record<string, string> }[] }).parts;
    expect(parts[1]!.vars!.max).toBe('0.01%');
  });
});
