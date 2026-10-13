import { describe, expect, it } from 'vitest';
import { applyCommand, stepGame } from '../game';
import { cashOf, priceOf } from '../core';
import { LP, TPD } from './constants';
import { iconSvg } from './icon';
import { moderateText } from './moderate';
import { anonOf } from './anon';
import { CREATOR, HOLDER, TRADER, launch, lpWorld, run } from './fixture';
import { cardOf, launchpadView, lpPageOf } from './view';
import { LP_NPC_HANDLES, LP_NPC_REPLY_KEYS } from '../text/lpReplies';
import type { GameState } from '../types';

// Phase 10 (R-10-6, the Launchpad like pump.fun): the world changes behind the board and the token page. Graduated tokens read the
// engine's live price; holders include the NPC cohort as an anonymous holder; the tape carries dollars; a replies thread is moderated
// and deterministic; a token's image variant and description are optional and old snapshots load.

const grad = (g: GameState, ticker: string) => applyCommand(g, 'admin', { type: 'admin.lpFill', ticker });
/** The share of the curve sold on a token (its progress to graduation). */
const priceProgress = (g: GameState, ticker: string): number => cardOf(g, g.launchpad!.tokens[ticker]!).progress;

describe('the launch fee and the launch inputs (R-10-6)', () => {
  it('the launch fee is $100 (LP.LAUNCH_FEE), debited once from the creator', () => {
    const g = lpWorld('pump-fee');
    expect(launch(g, CREATOR, 'FEEE').ok).toBe(true);
    expect(LP.LAUNCH_FEE).toBe(100);
    // the fee is booked as the launch sink; the creator's cash also takes the creator's half of the launch's NPC fees, so the sink is the check
    expect(g.launchpad!.totals.launchFee).toBe(100);
    expect(g.economy.sinks.lpLaunchFee).toBe(100);
  });

  it('a description and an image variant are stored; a link, an abusive word, a long text or a bad variant is refused', () => {
    const g = lpWorld('pump-inputs');
    expect(launch(g, CREATOR, 'DESC', { description: 'A quiet coin for quiet days.', art: 2 }).ok).toBe(true);
    const t = g.launchpad!.tokens.DESC!;
    expect(t.description).toBe('A quiet coin for quiet days.');
    expect(t.art).toBe(2);
    expect(launch(g, HOLDER, 'LINK', { description: 'Buy at https://example.xyz now' }).data).toMatchObject({ refusal: 'descLink' });
    expect(launch(g, HOLDER, 'ABUS', { description: 'you are a nigger' }).data).toMatchObject({ refusal: 'descAbuse' });
    expect(launch(g, HOLDER, 'LONG', { description: 'x'.repeat(LP.DESC_MAX + 1) }).data).toMatchObject({ refusal: 'descLong' });
    expect(launch(g, HOLDER, 'ART', { art: LP.ART_VARIANTS }).data).toMatchObject({ refusal: 'art' });
    // a refused launch changes nothing: no token, no fee
    expect(g.launchpad!.tokens.LINK).toBeUndefined();
    expect(g.launchpad!.tokens.ABUS).toBeUndefined();
  });

  it('the age and the cooldown refusals carry their hours in the data, so the copy can fill {hours}', () => {
    const g = lpWorld('pump-hours');
    g.players[HOLDER]!.joinedTick = g.market.tick - 1;
    const r = launch(g, HOLDER, 'AGEE');
    expect(r.ok).toBe(false);
    const parts = (r.data as { parts: { key: string; vars?: Record<string, number> }[] }).parts;
    expect(parts[1]!.vars!.hours).toBeGreaterThan(0);
  });
});

describe('the icon variants (R-10-6)', () => {
  it('variant 0 is the icon every token had before Phase 10; the other variants differ', () => {
    expect(iconSvg('MOON')).toBe(iconSvg('MOON', 0));
    const variants = Array.from({ length: LP.ART_VARIANTS }, (_, k) => iconSvg('MOON', k));
    expect(new Set(variants).size).toBe(LP.ART_VARIANTS);
  });
});

describe('graduated tokens read the engine (R-10-6)', () => {
  it('after graduation the card price is the engine mid, and the chart keeps sampling past the graduation tick', () => {
    const g = lpWorld('pump-grad-price');
    launch(g, CREATOR, 'GPRC', { allocation: 2_000_000 });
    expect(grad(g, 'GPRC').ok).toBe(true);
    const t = g.launchpad!.tokens.GPRC!;
    expect(t.status).toBe('graduated');
    const card = cardOf(g, t);
    expect(card.price).toBe(priceOf(g, 'GPRC'));
    expect(card.marketCap).toBeCloseTo(card.price * LP.SUPPLY, 6);
    for (let k = 0; k < 2 * 12 + 1; k++) stepGame(g);
    const now = cardOf(g, t);
    expect(now.price).toBe(priceOf(g, 'GPRC'));
    expect(t.chart.some(([tick]) => tick > t.gradTick!)).toBe(true);
    expect(now.progress).toBe(1);
  });
});

describe('holders include the NPC cohort as an anonymous holder (R-10-6)', () => {
  it('the page lists the curve, the dev and the NPC cohort by role, with anonymous ids and no handle', () => {
    const g = lpWorld('pump-holders');
    launch(g, CREATOR, 'HOLD', { allocation: 5_000_000 });
    run(g, TRADER, { type: 'lp.buy', ticker: 'HOLD', spendCents: 5_000 });
    const t = g.launchpad!.tokens.HOLD!;
    expect(t.npcBal).toBeGreaterThan(0);
    const page = lpPageOf(g, TRADER, 'HOLD')!;
    const roles = page.holders.map((h) => h.role);
    expect(roles).toContain('curve');
    expect(roles).toContain('dev');
    expect(roles).toContain('npc');
    expect(roles).toContain('you');
    // the NPC cohort is counted; the curve is not
    expect(page.buckets.holders).toBe(3);
    for (const h of page.holders) expect(h.anon).toMatch(/^[0-9a-f]{6}$/);
    // the creator's handle is public (a founder's is); the holder rows never carry a handle or an account id
    expect(JSON.stringify(page.holders)).not.toContain('maker_one');
    expect(JSON.stringify(page.holders)).not.toContain(TRADER);
    expect(JSON.stringify(page.holders)).not.toContain(CREATOR);
    // the rows are ranked by tokens
    for (let i = 1; i < page.holders.length; i++) expect(page.holders[i - 1]!.qty).toBeGreaterThanOrEqual(page.holders[i]!.qty);
    expect(page.holders.length).toBeLessThanOrEqual(LP.HOLDERS_SHOWN);
  });

  it('the anonymous id is per token: the same account has a different id on another token', () => {
    expect(anonOf('AAAA', CREATOR)).not.toBe(anonOf('BBBB', CREATOR));
    expect(anonOf('AAAA', CREATOR)).toBe(anonOf('AAAA', CREATOR));
  });
});

describe('the tape and the trades bar carry dollars (R-10-6)', () => {
  it('a buy line is its outlay in dollars, and a player line carries an anonymous id', () => {
    const g = lpWorld('pump-tape');
    launch(g, CREATOR, 'TAPE');
    run(g, TRADER, { type: 'lp.buy', ticker: 'TAPE', spendCents: 12_345 });
    const t = g.launchpad!.tokens.TAPE!;
    const line = t.tape.filter((tr) => tr.anon !== undefined).at(-1)!;
    expect(line.side).toBe('buy');
    expect(line.usd).toBeCloseTo(123.45, 6);
    expect(line.anon).toBe(anonOf('TAPE', TRADER));
    const v = launchpadView(g, TRADER);
    expect(v.bar.length).toBeGreaterThan(0);
    expect(v.bar.some((r) => r.who === anonOf('TAPE', TRADER) && Math.abs(r.usd - 123.45) < 1e-6)).toBe(true);
    expect(JSON.stringify(v.bar)).not.toContain('trader_two');
  });

  it('an old tape line without dollars reads as quantity times price', () => {
    const g = lpWorld('pump-tape-old');
    launch(g, CREATOR, 'OLDT');
    run(g, TRADER, { type: 'lp.buy', ticker: 'OLDT', spendCents: 5_000 });
    const t = g.launchpad!.tokens.OLDT!;
    for (const tr of t.tape) delete tr.usd;
    const page = lpPageOf(g, TRADER, 'OLDT')!;
    for (const row of page.tape) expect(row.usd).toBeCloseTo(row.qty * row.price, 6);
  });

  it('the king of the hill is the live token with the most curve progress', () => {
    const g = lpWorld('pump-king');
    launch(g, CREATOR, 'KNGA');
    launch(g, HOLDER, 'KNGB');
    run(g, TRADER, { type: 'lp.buy', ticker: 'KNGB', spendCents: 5_000_000 });
    const v = launchpadView(g, TRADER);
    const best = ['KNGA', 'KNGB'].sort((a, b) => priceProgress(g, b) - priceProgress(g, a))[0];
    expect(v.king?.ticker).toBe(best);
    expect(best).toBe('KNGB');
  });
});

describe('the replies thread (R-10-6)', () => {
  it('the moderator refuses an empty, long, linked or abusive text and passes plain text, collapsed', () => {
    expect(moderateText('   ', 140)).toEqual({ ok: false, reason: 'empty' });
    expect(moderateText('x'.repeat(141), 140)).toEqual({ ok: false, reason: 'long' });
    expect(moderateText('x'.repeat(140), 140).ok).toBe(true);
    // characters, not bytes: a 140-character accented line passes
    expect(moderateText('é'.repeat(140), 140).ok).toBe(true);
    expect(moderateText('see www.scam.com', 140)).toEqual({ ok: false, reason: 'link' });
    expect(moderateText('go to https://x.io', 140)).toEqual({ ok: false, reason: 'link' });
    expect(moderateText('you retard', 140)).toEqual({ ok: false, reason: 'abuse' });
    expect(moderateText('  to   the   moon  ', 140)).toEqual({ ok: true, text: 'to the moon' });
  });

  it('a player reply is stored under an anonymous id; the creator is marked; a second reply inside a minute is refused', () => {
    const g = lpWorld('pump-reply');
    launch(g, CREATOR, 'RPLY');
    expect(run(g, TRADER, { type: 'lp.reply', ticker: 'RPLY', text: 'first!' }).ok).toBe(true);
    expect(run(g, TRADER, { type: 'lp.reply', ticker: 'RPLY', text: 'second' }).data).toMatchObject({ refusal: 'replyCooldown' });
    expect(run(g, CREATOR, { type: 'lp.reply', ticker: 'RPLY', text: 'thanks all' }).ok).toBe(true);
    const page = lpPageOf(g, TRADER, 'RPLY')!;
    const mine = page.thread.find((r) => r.text === 'first!')!;
    expect(mine.who).toBe(anonOf('RPLY', TRADER));
    expect(mine.role).toBe('player');
    expect(page.thread.find((r) => r.text === 'thanks all')!.role).toBe('creator');
    expect(JSON.stringify(page)).not.toContain('trader_two');
    // after a real minute the same player may post again
    g.market = { ...g.market, tick: g.market.tick + LP.REPLY_COOLDOWN_TICKS };
    expect(run(g, TRADER, { type: 'lp.reply', ticker: 'RPLY', text: 'second' }).ok).toBe(true);
  });

  it('a refused reply changes nothing, with the three-part refusal code', () => {
    const g = lpWorld('pump-reply-refuse');
    launch(g, CREATOR, 'NOPE');
    expect(run(g, TRADER, { type: 'lp.reply', ticker: 'NOPE', text: 'buy at www.x.com' }).data).toMatchObject({ refusal: 'replyLink' });
    expect(run(g, TRADER, { type: 'lp.reply', ticker: 'NOPE', text: '  ' }).data).toMatchObject({ refusal: 'replyEmpty' });
    expect(g.launchpad!.tokens.NOPE!.replies ?? []).toHaveLength(0);
  });

  it('the NPC replies are deterministic (the same world gives the same thread), rate-limited, and use fictional handles and text keys', () => {
    const run1 = (): GameState => {
      const g = lpWorld('pump-npc-reply', { npcLaunches: false });
      launch(g, CREATOR, 'NPCR');
      for (let k = 0; k < 40 * 12; k++) {
        if (k % 24 === 0) run(g, TRADER, { type: 'lp.buy', ticker: 'NPCR', spendCents: 2_000 });
        stepGame(g);
      }
      return g;
    };
    const a = run1();
    const b = run1();
    const ta = a.launchpad!.tokens.NPCR!;
    const tb = b.launchpad!.tokens.NPCR!;
    expect(JSON.stringify(ta.replies ?? [])).toBe(JSON.stringify(tb.replies ?? []));
    const npc = (ta.replies ?? []).filter((r) => r.role === 'npc');
    expect(npc.length).toBeGreaterThan(0);
    for (const r of npc) {
      expect(LP_NPC_HANDLES).toContain(r.who);
      expect(LP_NPC_REPLY_KEYS).toContain(r.key);
    }
    // at most one NPC reply inside the gap
    for (let i = 1; i < npc.length; i++) expect(npc[i]!.tick - npc[i - 1]!.tick).toBeGreaterThanOrEqual(LP.NPC_REPLY_GAP_TICKS);
  });

  it('the thread keeps only the newest REPLY_KEEP lines', () => {
    const g = lpWorld('pump-reply-keep');
    launch(g, CREATOR, 'KEEP');
    for (let i = 0; i < LP.REPLY_KEEP + 5; i++) {
      g.market = { ...g.market, tick: g.market.tick + LP.REPLY_COOLDOWN_TICKS };
      expect(run(g, TRADER, { type: 'lp.reply', ticker: 'KEEP', text: `line ${i}` }).ok).toBe(true);
    }
    const page = lpPageOf(g, TRADER, 'KEEP')!;
    expect(page.thread.length).toBe(LP.REPLY_KEEP);
    expect(page.thread.at(-1)!.text).toBe(`line ${LP.REPLY_KEEP + 4}`);
    expect(page.replies).toBe(LP.REPLY_KEEP);
    expect(TPD).toBe(720);
  });
});

describe('old snapshots load (R-10-6 optional fields)', () => {
  it('a world saved before Phase 10 (no art, description, replies, anonymous ids, dollars) reads through the view', () => {
    const g = lpWorld('pump-old');
    launch(g, CREATOR, 'OLDS', { allocation: 1_000_000 });
    run(g, TRADER, { type: 'lp.buy', ticker: 'OLDS', spendCents: 5_000 });
    const t = g.launchpad!.tokens.OLDS!;
    delete t.art;
    delete t.description;
    delete t.replies;
    delete t.replyLast;
    delete t.npcReplyAt;
    for (const tr of t.tape) {
      delete tr.usd;
      delete tr.anon;
    }
    const loaded = JSON.parse(JSON.stringify(g)) as GameState;
    const v = launchpadView(loaded, TRADER);
    expect(v.feeds.newest.length).toBe(1);
    expect(v.feeds.newest[0]!.art).toBe(0);
    expect(v.feeds.newest[0]!.replies).toBe(0);
    const page = lpPageOf(loaded, TRADER, 'OLDS')!;
    expect(page.description).toBeNull();
    expect(page.thread).toEqual([]);
    expect(page.icon).toBe(iconSvg('OLDS'));
    for (const row of page.tape) expect(row.usd).toBeCloseTo(row.qty * row.price, 6);
    expect(v.bar.length).toBeGreaterThan(0);
    // the pre-Phase-10 snapshot is still a snapshot the engine can step
    stepGame(loaded);
    expect(cashOf(loaded, TRADER)).toBeGreaterThanOrEqual(0);
  });
});
