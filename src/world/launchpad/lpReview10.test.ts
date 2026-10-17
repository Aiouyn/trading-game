import { describe, expect, it } from 'vitest';
import { stepGame } from '../game';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';
import { cashOf } from '../core';
import { LP, npcAccountId } from './constants';
import { tickerHash } from './icon';
import { barsOf, carryBar, touchBar } from './bars';
import { hasLink, moderateText } from './moderate';
import { npcReplyTick, pushReply, repliesOf, replyToken } from './reply';
import { launchToken } from './launch';
import { lpTick } from './flow';
import { lpFills } from './rug';
import { anonOf } from './anon';
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

describe('spelled-out links and contact handles are refused (Phase 10 review, item 2)', () => {
  it('refuses the spaced and spelled-out shapes the review probed', () => {
    const links = [
      'pump dot fun', 'pump . fun', 'dexscreener .com', 'buy at pumpfun com', 'telegram t me slash moon', 'telegram: @moonclub',
      'join discord @moonclub', 'pump [dot] fun', 'the pump(.)fun page',
    ];
    for (const text of links) expect(hasLink(text), text).toBe(true);
    for (const text of links) expect(moderateText(text, LP.REPLY_MAX), text).toMatchObject({ ok: false, reason: 'link' });
  });

  it('lets through ordinary sentences with dots, spaces and short words', () => {
    const clean = ['Moon. Win big', 'have fun', 'my net worth', 'nice gg', 'the site is down', 'send me the chart', 'Let me see t tests', 'telegram is down today'];
    for (const text of clean) expect(hasLink(text), text).toBe(false);
    for (const text of clean) expect(moderateText(text, LP.REPLY_MAX).ok, text).toBe(true);
  });
});

describe('remaining interrupted Phase 10 findings', () => {
  it('refuses links hidden with invisible characters or spaced defanging, and known hosts with a trailing spaced dot', () => {
    for (const text of ['pump. fun', 'PUMP. FUN', 'pump\u200b.fun', 'pump [ dot ] fun', 'pump ( dot ) fun', 'https://scam.zz/mint']) {
      expect(moderateText(text, LP.REPLY_MAX), text).toEqual({ ok: false, reason: 'link' });
    }
    expect(moderateText('Moon. Win big', LP.REPLY_MAX).ok).toBe(true);
  });

  it('refuses common French profanity and split or invisible English profanity, while keeping clean text', () => {
    for (const text of ['putain', 'merde', 'connard', 'connasse', 'enculé', 'salope', 'va te faire foutre', 'f u c k this coin', 'fu\u200bck this coin']) {
      expect(moderateText(text, LP.REPLY_MAX), text).toEqual({ ok: false, reason: 'abuse' });
    }
    for (const text of ['merci pour le graphique', 'class of holders', 'assess the chart']) {
      expect(moderateText(text, LP.REPLY_MAX).ok, text).toBe(true);
    }
  });

  it('refuses descriptions and replies before changing money, tape or reply state', () => {
    const g = lpWorld('rv-moderation-state');
    expect(launch(g, CREATOR, 'CLEN').ok).toBe(true);
    const before = JSON.stringify(g);
    // Call the domain functions directly: the command dispatcher also updates the player's last-activity bookkeeping.
    expect(launchToken(g, TRADER, { name: 'Coin BADL', ticker: 'BADL', tagline: 'tg1', allocation: 0, description: 'pump. fun' }, null).data).toMatchObject({ refusal: 'descLink' });
    expect(replyToken(g, TRADER, 'CLEN', 'connard', null).data).toMatchObject({ refusal: 'replyAbuse' });
    expect(JSON.stringify(g)).toBe(before);
  });

  it('migrates the kept reply count once, then counts NPC and player posts beyond the retained thread', () => {
    const g = lpWorld('rv-count-legacy');
    expect(launch(g, CREATOR, 'CNTO').ok).toBe(true);
    const t = g.launchpad!.tokens.CNTO!;
    t.replies = Array.from({ length: LP.REPLY_KEEP }, (_, tick) => ({ tick, who: 'abc123', role: 'player' as const, text: 'old' }));
    delete t.replyCount;
    expect(repliesOf(t)).toBe(LP.REPLY_KEEP);
    pushReply(t, { tick: g.market.tick, who: 'fictional', role: 'npc', key: 'lp.npcreply.1', vars: {} });
    expect(run(g, TRADER, { type: 'lp.reply', ticker: 'CNTO', text: 'new' }).ok).toBe(true);
    expect(repliesOf(t)).toBe(LP.REPLY_KEEP + 2);
    expect(t.replies).toHaveLength(LP.REPLY_KEEP);
    expect(lpPageOf(g, TRADER, 'CNTO')!.replies).toBe(LP.REPLY_KEEP + 2);
  });

  it('uses actual graduated engine fills for OHLC and the anonymous tape, with idle minutes carrying the close', () => {
    const g = lpWorld('rv-grad-ohlc');
    expect(launch(g, CREATOR, 'GFIL').ok).toBe(true);
    expect(run(g, 'admin', { type: 'admin.lpFill', ticker: 'GFIL' }).ok).toBe(true);
    const t = g.launchpad!.tokens.GFIL!;
    const tick = Math.ceil(g.market.tick / LP.CHART_EVERY) * LP.CHART_EVERY;
    g.market = { ...g.market, tick };
    const open = barsOf(t).m.at(-1)![4];
    lpFills(g, [
      { playerId: TRADER, assetId: 'GFIL', side: 'buy', qty: 100, price: open * 2, fee: 0.01 },
      { playerId: TRADER, assetId: 'GFIL', side: 'sell', qty: 50, price: open / 2, fee: 0.01 },
    ], null);
    lpTick(g, null); // the minute boundary must not overwrite the last fill with a mid-price sample
    expect(barsOf(t).m.at(-1)).toEqual([tick, open, open * 2, open / 2, open / 2]);
    const page = lpPageOf(g, CREATOR, 'GFIL')!;
    expect(page.tape.slice(-2).map((r) => r.anon)).toEqual([anonOf('GFIL', TRADER), anonOf('GFIL', TRADER)]);
    expect(page.tape.at(-2)!.usd).toBeCloseTo(100 * open * 2 + 0.01, 12);
    expect(page.tape.at(-1)!.usd).toBeCloseTo(50 * open / 2, 12);
    expect(JSON.stringify(page.tape)).not.toContain(TRADER);
    expect(JSON.stringify(page.tape)).not.toContain(g.players[TRADER]!.handle);
    g.market = { ...g.market, tick: tick + LP.CHART_EVERY };
    lpTick(g, null);
    expect(barsOf(t).m.at(-1)).toEqual([tick + LP.CHART_EVERY, open / 2, open / 2, open / 2, open / 2]);
  });

  it('keeps the $100 fee and $50 cancellation refund balanced with separately booked creator income', () => {
    const g = lpWorld('rv-fee-cash');
    const before = cashOf(g, CREATOR);
    expect(launch(g, CREATOR, 'FREF').ok).toBe(true);
    const t = g.launchpad!.tokens.FREF!;
    expect(cashOf(g, CREATOR)).toBeCloseTo(before - 100 + t.creatorFees, 8);
    expect(run(g, CREATOR, { type: 'lp.cancel', ticker: 'FREF' }).ok).toBe(true);
    expect(cashOf(g, CREATOR)).toBeCloseTo(before - 100 + 50 + t.creatorFees, 8);
    expect(g.economy.sinks.lpLaunchFee).toBe(100);
    expect(g.economy.faucets.lpRefund).toBe(50);
    expect(g.launchpad!.totals.launchFee).toBe(100);
  });

  it('records fills from the actual Broker order path in the candle and tape without disclosing account identity', () => {
    const g = lpWorld('rv-engine-path');
    expect(launch(g, CREATOR, 'BRKR').ok).toBe(true);
    expect(run(g, 'admin', { type: 'admin.lpFill', ticker: 'BRKR' }).ok).toBe(true);
    const t = g.launchpad!.tokens.BRKR!;
    expect(run(g, TRADER, { type: 'order.place', order: { assetId: 'BRKR', side: 'buy', type: 'market', qty: 100_000 } }).ok).toBe(true);
    const bought = stepGame(g).fills.find((f) => f.playerId === TRADER && f.assetId === 'BRKR' && f.side === 'buy')!;
    expect(bought).toBeDefined();
    expect(run(g, TRADER, { type: 'order.place', order: { assetId: 'BRKR', side: 'sell', type: 'market', qty: 50_000 } }).ok).toBe(true);
    const sold = stepGame(g).fills.find((f) => f.playerId === TRADER && f.assetId === 'BRKR' && f.side === 'sell')!;
    expect(sold).toBeDefined();
    for (const f of [bought, sold]) {
      const line = t.tape.find((r) => r.tick === g.market.tick - (f === bought ? 1 : 0) && r.side === f.side && r.anon === anonOf('BRKR', TRADER))!;
      expect(line).toMatchObject({ qty: f.qty, price: f.price, creator: false, npc: false });
      expect(line.usd).toBeCloseTo(f.qty * f.price + (f.side === 'buy' ? f.fee : 0), 12);
    }
    const bar = barsOf(t).m.at(-1)!;
    expect(bar[2]).toBeGreaterThanOrEqual(Math.max(bought.price, sold.price));
    expect(bar[3]).toBeLessThanOrEqual(Math.min(bought.price, sold.price));
    expect(bar[2]).toBeGreaterThan(bar[3]);
    expect(bar[4]).toBe(t.tape.at(-1)!.price);
    const publicRows = JSON.stringify({ tape: lpPageOf(g, CREATOR, 'BRKR')!.tape, bar: launchpadView(g, CREATOR).bar });
    for (const identity of [TRADER, g.players[TRADER]!.handle, npcAccountId('BRKR')]) expect(publicRows).not.toContain(identity);
  });

  it('includes the cohort engine fill in OHLC without disclosing its internal identifier or changing its lots', () => {
    const g = lpWorld('rv-engine-cohort');
    expect(launch(g, CREATOR, 'NCPF').ok).toBe(true);
    expect(run(g, 'admin', { type: 'admin.lpFill', ticker: 'NCPF' }).ok).toBe(true);
    const t = g.launchpad!.tokens.NCPF!;
    const id = npcAccountId('NCPF');
    const price = t.gradPrice! * 2;
    lpFills(g, [{ playerId: id, assetId: 'NCPF', side: 'sell', qty: 100, price, fee: 0.01 }], null);
    expect(barsOf(t).m.at(-1)![2]).toBe(price);
    expect(t.lots[id]).toBeUndefined();
    expect(t.tape.at(-1)).toMatchObject({ price, npc: true });
    expect(t.tape.at(-1)!.anon).toBeUndefined();
    const publicRows = JSON.stringify({ tape: lpPageOf(g, CREATOR, 'NCPF')!.tape, bar: launchpadView(g, CREATOR).bar });
    expect(publicRows).not.toContain(id);
  });

  it('opens the live NPC reply gate on player activity, applies its rate limit, and adds no replies after death', () => {
    const g = lpWorld('rv-npc-activity');
    expect(launch(g, CREATOR, 'ACTV').ok).toBe(true);
    const t = g.launchpad!.tokens.ACTV!;
    const eligible = (tick: number) => tickerHash(`ACTV:r:${tick}`) / 2 ** 32 < LP.NPC_REPLY_ODDS;
    let tick = Math.ceil(g.market.tick / LP.CHART_EVERY) * LP.CHART_EVERY;
    while (!eligible(tick)) tick += LP.CHART_EVERY;
    g.market = { ...g.market, tick };
    expect(run(g, TRADER, { type: 'lp.buy', ticker: 'ACTV', spendCents: 1_000 }).ok).toBe(true);
    npcReplyTick(g, t);
    expect(repliesOf(t)).toBe(1);
    expect(LP_NPC_REPLY_POOLS.live.map((i) => `lp.npcreply.${i}`)).toContain(t.replies![0]!.key);
    for (let next = tick + LP.CHART_EVERY; next < tick + LP.NPC_REPLY_GAP_TICKS; next += LP.CHART_EVERY) {
      g.market = { ...g.market, tick: next };
      npcReplyTick(g, t);
    }
    expect(repliesOf(t)).toBe(1);
    t.status = 'dead';
    const before = JSON.stringify(t);
    g.market = { ...g.market, tick: tick + 10 * LP.NPC_REPLY_GAP_TICKS };
    npcReplyTick(g, t);
    expect(JSON.stringify(t)).toBe(before);
  });

  it('shows retail and community labels in both locales without revealing the simulation', () => {
    expect(en['lp.holders.role.npc']).toBe('Retail');
    expect(fr['lp.holders.role.npc']).toBe('Particulier');
    expect(fr['lp.tape.flow']).toBe('Flux des particuliers');
    for (const copy of [en, fr]) {
      expect(copy['lp.card.worldLaunch']).not.toMatch(/world|monde|npc|simulation/i);
    }
  });
});
