import { Rng, seedStream } from '@/engine';
import type { GameState, StepOutput } from '../types';
import { TPD } from '../core';
import { CROWD, LP } from './constants';
import { cashReserveAt, spotAt } from './curve';
import { cohortsOf } from './cohorts';
import { buyCurve, sellCurve } from './trade';
import { tickerHash } from './icon';
import type { CrowdState, LpToken, MicroTrader, NpcCohort } from './types';
import { MICROFLOW, spendableCents, tokenTraders, walletById } from './microflow';

/**
 * The crowd on a launch coin. Five temperaments, one order per side:
 *   - holders keep an arrival bag and sell it only when it is far above what they paid, or once the story price has decayed back
 *     to the floor (that slow exit is what lets an abandoned coin die);
 *   - scalpers buy under their average and sell over it;
 *   - faders keep the pre-jump story and sell into a chase;
 *   - FOMO pays up for a fraction of a large PLAYER print, several ticks late, and dumps when that move fails;
 *   - news chasers spend a capped budget when a Wire headline matches the coin's theme, dripped out after a lag.
 * An arrival (launch, viral shock, paid promo) is still bought in full in the tick it arrives, by the caller. A player buy is not
 * an arrival. The chase it schedules is late and smaller than the round trip, so copying it loses the fee. Named holders on the
 * page stay one NPC row; the personalities are this mix.
 *
 * On a quiet coin the tape would otherwise sit still. Chatter is a small round trip of one new cohort, bought and sold in the
 * same tick, on about half the coins. It does not spend the chase budgets, it stays under the print floor, and it leaves the
 * holder bag where it was.
 */

/** Sectors a coin can belong to. Taglines map onto the first eight; a world launch may also be `crypto`. */
export const THEMES = [
  'tech', 'semis', 'energy', 'materials', 'industrials', 'financials', 'health', 'staples',
  'discretionary', 'realestate', 'security', 'media', 'crypto',
] as const;

const TAGLINE_THEME: Record<string, string> = {
  tg1: 'tech', tg2: 'media', tg3: 'discretionary', tg4: 'financials',
  tg5: 'semis', tg6: 'staples', tg7: 'health', tg8: 'energy',
};

/** The theme a tagline implies. An unknown tagline reads as tech. */
export function themeOfTagline(tagline: string): string {
  return TAGLINE_THEME[tagline] ?? 'tech';
}

/** A stable theme from a ticker, used when a world launch has no live headline to follow. */
export function themeFromTicker(ticker: string): string {
  const n = ticker.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0);
  return THEMES[n % THEMES.length]!;
}

const half = (days: number) => Math.pow(0.5, 1 / Math.max(1, days * TPD));

/** The share of a holder bag sold per tick once the story has died. */
export function abandonShare(): number {
  return 1 - half(CROWD.ABANDON_HALF_DAYS);
}

/** The theme a coin trades as, including a token saved before themes existed. */
export function themeOf(t: LpToken): string {
  return t.theme || themeOfTagline(t.tagline);
}

/**
 * The sector of the newest fresh headline, if that headline names a listed asset. A launchpad line is not a headline (a launch
 * must not hire its own crowd). Used when a world coin is born, so a launch into the news comes out tagged to it.
 */
export function newsTheme(g: GameState): string | null {
  const tick = g.market.tick;
  for (const w of g.wire) {
    if (tick - w.tick > CROWD.NEWS_WINDOW) break;
    if (w.kind === 'launchpad' || !w.assetId) continue;
    const sector = sectorOf(g, w.assetId);
    if (sector) return sector;
  }
  return null;
}

/** One tick of the crowd. The sniper's exit is the caller's, and so is absorbing an arrival. */
export function crowdTick(g: GameState, t: LpToken, out: StepOutput | null): void {
  if (t.status !== 'live') return;
  const tick = g.market.tick;
  const spot = spotAt(t.y);
  const floor = spotAt(LP.Y0);
  const tapeEnd = t.tape.length;
  const fresh = !t.crowd;
  const c = ensure(g, t, spot);
  // the first sight of a coin skips the tape it already has, so a reload is not a new signal
  const prints = fresh ? EMPTY : t.crowdPrints ?? readPrints(t, c.tapeAt, tapeEnd);
  // Drop the key. Leaving it undefined keeps a key JSON will not save, so a reload
  // inserts the next tally at a different place and the saved path no longer matches.
  delete t.crowdPrints;
  c.tapeAt = tapeEnd;

  const impactUsd = CROWD.IMPACT_CAP * cashReserveAt(t.y);
  const sellUsdCap = CROWD.SELL_CAP * cashReserveAt(t.y);
  const prevVwap = c.vwap;
  const failed = spot < c.high * (1 - c.fear) && c.high > prevVwap * (1 + c.band);

  let buyFomo = 0;
  let buyNews = 0;
  let sellFomoTok = 0;
  let panicTok = 0;
  if (c.due > 0 && tick >= c.due) {
    const usd = Math.min(c.dueUsd, c.dueSide === 'buy' ? c.fomoCash : sellUsdCap, c.dueSide === 'buy' ? impactUsd : sellUsdCap);
    if (c.dueSide === 'buy' && !failed && usd > 0) buyFomo += usd;
    else if (usd > 0) panicTok += tokensFor(spot, usd);
    c.due = 0;
    c.dueUsd = 0;
  }
  if (c.newsLeft > 0 && tick >= c.newsNext) {
    const drip = Math.min(c.newsLeft, c.newsCash, impactUsd);
    if (drip > 0) {
      buyNews += drip;
      c.newsLeft -= drip;
      c.chaseUsd += drip;
    }
    c.newsNext = tick + 1;
  }

  let jumped = false;
  if (!fresh && prints.playerBuy + prints.npcBuy >= CROWD.PRINT_FLOOR && spot > c.story) {
    c.story = spot;
    jumped = true;
  } else if (!fresh && prints.playerSell >= CROWD.PRINT_FLOOR && spot < c.story) {
    c.story = spot + 0.5 * (c.story - spot);
  }
  const volBefore = c.volEma;
  noteVolume(c, prints, spot);
  if (spot > c.high) c.high = spot;
  else c.high = spot + (c.high - spot) * half(CROWD.HIGH_HALF_DAYS);

  const scare = !fresh && applyNews(g, t, c, spot, tick);
  if (scare) {
    const prem = Math.max(0, c.story - floor);
    c.story = floor + prem * CROWD.SCARE_DROP;
    c.fadeStory = Math.min(c.fadeStory, c.story);
    c.newsLeft = 0;
    if (c.dueSide === 'buy') { c.due = 0; c.dueUsd = 0; }
    arm(c, tick, 'sell', Math.min(sellUsdCap, Math.max(prints.playerSell, impactUsd)));
    jumped = false;
  }

  // a player print is a signal. Clips on this tick are already one sum. A later clip does not push the deadline back.
  const signal = CROWD.PRINT_MULT * Math.max(volBefore, CROWD.PRINT_FLOOR);
  if (!fresh && !scare && prints.playerBuy >= CROWD.PRINT_FLOOR && prints.playerBuy >= signal) {
    const usd = Math.min(c.fomoCash, impactUsd, CROWD.FOMO_FRAC * prints.playerBuy);
    arm(c, tick, 'buy', usd);
    c.chaseUsd = Math.max(c.chaseUsd, usd);
  } else if (!fresh && !scare && prints.playerSell >= CROWD.PRINT_FLOOR && prints.playerSell >= signal) {
    arm(c, tick, 'sell', Math.min(sellUsdCap, CROWD.FOMO_FRAC * prints.playerSell));
  }

  if (!jumped) {
    c.story = floor + (c.story - floor) * half(CROWD.STORY_HALF_DAYS);
    const ease = 1 - half(CROWD.FADE_HALF_DAYS);
    c.fadeStory += (c.story - c.fadeStory) * ease;
  }
  c.chaseUsd *= 0.85;

  const alive = c.story > floor * CROWD.STORY_ALIVE;
  let sellHold = holderSell(t, c, spot, alive, tokensFor(spot, sellUsdCap));
  if (!scare && c.chaseUsd > 0 && spot > c.fadeStory * (1 + c.band)) {
    const fadeTok = tokensFor(spot, Math.min(sellUsdCap, CROWD.FADE_RATIO * c.chaseUsd));
    sellHold += fadeTok;
  }
  sellHold = Math.min(sellHold + panicTok, tokensFor(spot, sellUsdCap));

  let buyScalp = 0;
  let sellScalp = 0;
  if (spot < prevVwap * (1 - c.band)) buyScalp = Math.min(CROWD.SCALP_TICK, c.scalpCash, impactUsd);
  else if (spot > prevVwap * (1 + c.band)) sellScalp = bagTokens(t, 'scalp');
  if (failed) {
    sellFomoTok += bagTokens(t, 'fomo');
    sellFomoTok += bagTokens(t, 'news');
  }

  sellOf(g, t, out, {
    hold: sellHold,
    scalp: Math.min(sellScalp, tokensFor(spot, sellUsdCap)),
    fomo: Math.min(sellFomoTok, tokensFor(spot, sellUsdCap)),
    news: 0,
  });
  c.scalpCash -= spend(g, t, out, buyScalp, 'scalp');
  c.fomoCash -= spend(g, t, out, buyFomo, 'fomo');
  const newsSpent = spend(g, t, out, buyNews, 'news');
  c.newsCash -= newsSpent;
  if (newsSpent + 1e-6 < buyNews) c.newsLeft += buyNews - newsSpent;

  c.scalpCash = Math.min(CROWD.SCALP_BUDGET, c.scalpCash + CROWD.REFILL);
  c.fomoCash = Math.min(CROWD.FOMO_BUDGET, c.fomoCash + CROWD.REFILL);
  c.newsCash = Math.min(CROWD.NEWS_BUDGET, c.newsCash + CROWD.REFILL);
  c.scalpCash = Math.max(0, c.scalpCash);
  c.fomoCash = Math.max(0, c.fomoCash);
  c.newsCash = Math.max(0, c.newsCash);
  if (!MICROFLOW.enabled) chatter(g, t, out);
}

/**
 * One small round trip so a quiet coin still prints. The clip is $7 to $10, under the $50 print floor even next to a
 * scalper's $25. The sell plan is only the cohort this buy just opened, so holders are not the offer and the curve
 * is not left with a bid.
 */
/** The chatter clip for a ticker, in cents. $7 to $10, under the print floor. */
export function chatterCents(ticker: string): number {
  return 700 + (ticker.charCodeAt(0) % 4) * 100;
}

/** True on the ticks a coin chatters. About half of them, from the ticker and the tick alone. */
export function chatterOn(tick: number, ticker: string): boolean {
  return ((tick + ticker.charCodeAt(0) + ticker.charCodeAt(ticker.length - 1)) & 1) === 0;
}

function chatter(g: GameState, t: LpToken, out: StepOutput | null): void {
  if (t.status !== 'live') return;
  const tick = g.market.tick;
  if (!chatterOn(tick, t.ticker)) return;
  const cents = chatterCents(t.ticker);
  // Marked chatter, so the print is real for the curve and invisible to the New-feed order.
  const r = buyCurve(g, null, t.ticker, cents, 1, out, true, true);
  if (!r.ok || t.status !== 'live') return;
  const tokens = (r.data as { tokens?: number } | undefined)?.tokens ?? 0;
  if (!Number.isInteger(tokens) || tokens <= 0) return;
  const cs = cohortsOf(t);
  const last = cs[cs.length - 1];
  if (!last || last.tokens < tokens) return;
  const plan = cs.map((_, i) => (i === cs.length - 1 ? tokens : 0));
  sellCurve(g, null, t.ticker, tokens, 1, out, true, plan, true);
}


const EMPTY = { playerBuy: 0, playerSell: 0, npcBuy: 0, npcSell: 0 };

function ensure(g: GameState, t: LpToken, spot: number): CrowdState {
  if (t.crowd) return t.crowd;
  const rng = new Rng(seedStream(g.seed, `lp:crowd:${t.ticker}`));
  const seen = g.wire.slice(0, CROWD.SEEN_KEEP).map((w) => w.id);
  t.crowd = {
    story: spot, fadeStory: spot, vwap: spot, high: spot, volEma: 0,
    scalpCash: CROWD.SCALP_BUDGET, fomoCash: CROWD.FOMO_BUDGET, newsCash: CROWD.NEWS_BUDGET,
    due: 0, dueSide: 'buy', dueUsd: 0, newsLeft: 0, newsNext: 0, chaseUsd: 0,
    seen, tapeAt: t.tape.length, holdCarry: 0,
    band: 0.03 + 0.04 * rng.uniform(),
    delay: 3 + Math.floor(rng.uniform() * 10),
    fear: 0.08 + 0.1 * rng.uniform(),
    greed: 1.8 + 2.2 * rng.uniform(),
    newsLag: 3 + Math.floor(rng.uniform() * 8),
  };
  if (!t.theme) t.theme = themeOfTagline(t.tagline);
  return t.crowd;
}

function arm(c: CrowdState, tick: number, side: 'buy' | 'sell', usd: number): void {
  if (!(usd > 1)) return;
  if (c.due > 0) {
    // the deadline stays. A second clip may raise the size, up to the cap, and may not turn a buy into a later buy
    if (side === c.dueSide) c.dueUsd = Math.max(c.dueUsd, usd);
    return;
  }
  c.due = tick + c.delay;
  c.dueSide = side;
  c.dueUsd = usd;
}

/** True when a crash, a crisis or a halt hit. A matching headline arms the news budget and returns false. */
function applyNews(g: GameState, t: LpToken, c: CrowdState, spot: number, tick: number): boolean {
  const theme = themeOf(t);
  let scare = false;
  let armed = false;
  for (const w of g.wire) {
    if (tick - w.tick > CROWD.NEWS_WINDOW) break;
    if (c.seen.includes(w.id) || w.kind === 'launchpad') continue;
    const sector = w.assetId ? sectorOf(g, w.assetId) : null;
    const crash = w.kind === 'halt' || (w.kind === 'world' && (w.ev?.kind === 'crash' || w.ev?.kind === 'crisis' || w.ev?.kind === 'flash'));
    const themed = !!sector && sector === theme;
    const broad = !sector && (w.kind === 'macro' || w.kind === 'rates' || (w.kind === 'world' && w.ev?.kind === 'bubble'));
    const market = themed && (w.kind === 'earnings' || w.kind === 'preview' || w.kind === 'move' || w.kind === 'rumor' || w.kind === 'listing' || w.kind === 'macro');
    if (!crash && !market && !broad) continue;
    c.seen.push(w.id);
    if (c.seen.length > CROWD.SEEN_KEEP) c.seen.splice(0, c.seen.length - CROWD.SEEN_KEEP);
    // Halt, crash, crisis and flash scare whatever the tone. A loss or a warn scares. Info and brass arm nothing. A gain may buy.
    if (crash || w.tone === 'loss' || w.tone === 'warn') { scare = true; continue; }
    if (w.tone !== 'gain' || armed) continue;
    const burst = themed ? CROWD.BURST : CROWD.WORLD_BURST;
    c.story = Math.max(c.story, Math.min(spot * CROWD.NEWS_LIFT, spot * 2.5));
    c.newsLeft = Math.min(c.newsCash, Math.max(c.newsLeft, burst));
    c.newsNext = tick + c.newsLag;
    armed = true;
  }
  return scare;
}

function holderSell(t: LpToken, c: CrowdState, spot: number, alive: boolean, capTokens: number): number {
  const cs = cohortsOf(t);
  let profit = 0;
  let bag = 0;
  for (const row of cs) {
    if (!isHold(row) || row.tokens <= 0) continue;
    bag += row.tokens;
    const avg = row.cost / row.tokens;
    if (avg > 0 && spot >= avg * c.greed) profit += row.tokens * CROWD.TAKE_SHARE;
  }
  if (!alive && bag > 0) {
    const want = bag * abandonShare() + c.holdCarry;
    // Price action v2: with funded traders on, the abandoned bag leaves in lumps (5% of it, about every four minutes), so a dead
    // coin prints now and then instead of a sliver every tick. The half-life is the same.
    if (MICROFLOW.enabled && want < bag * 0.05 && bag * 0.05 >= 1) { c.holdCarry = want; return 0; }
    const n = Math.min(bag, capTokens, Math.floor(want));
    c.holdCarry = Math.max(0, want - n);
    return n;
  }
  c.holdCarry = 0;
  return Math.min(capTokens, Math.floor(profit));
}

function noteVolume(c: CrowdState, p: typeof EMPTY, spot: number): void {
  const notion = p.playerBuy + p.playerSell + p.npcBuy + p.npcSell;
  if (notion > 0) {
    const w = notion / (notion + c.volEma + 1);
    c.vwap = c.vwap * (1 - w) + spot * w;
  }
  c.volEma = c.volEma * 0.95 + notion * 0.05;
}

function readPrints(t: LpToken, from: number, to: number): typeof EMPTY {
  const p = { playerBuy: 0, playerSell: 0, npcBuy: 0, npcSell: 0 };
  for (let i = Math.max(0, from); i < to; i++) {
    const tr = t.tape[i];
    if (!tr) continue;
    const usd = tr.usd ?? tr.qty * tr.price;
    if (tr.npc) { if (tr.side === 'buy') p.npcBuy += usd; else p.npcSell += usd; }
    else if (tr.side === 'buy') p.playerBuy += usd;
    else p.playerSell += usd;
  }
  return p;
}

function sectorOf(g: GameState, assetId: string): string | null {
  const a = g.market.config.assets.find((x) => x.id === assetId);
  return a?.sector ?? null;
}

function tokensFor(spot: number, usd: number): number {
  if (!(usd > 0) || !(spot > 0)) return 0;
  return Math.floor(usd / spot);
}

function isHold(c: NpcCohort): boolean {
  if (c.sniper || (c.wallet && c.role !== 'hold')) return false;
  return c.role === undefined || c.role === 'hold';
}

function bagTokens(t: LpToken, role: 'scalp' | 'fomo' | 'news'): number {
  let n = 0;
  for (const c of cohortsOf(t)) if (!c.sniper && c.role === role) n += c.tokens;
  return n;
}

/** Wallets in a tick-stable order that does not draw the price stream. */
function crowdOrder(t: LpToken, tick: number, role: string, traders: MicroTrader[]): MicroTrader[] {
  return traders.slice().sort((a, b) =>
    tickerHash(`${t.ticker}:${tick}:${role}:${a.id}`) - tickerHash(`${t.ticker}:${tick}:${role}:${b.id}`));
}

/** Spends up to `usd` and tags the cohort it bought. Returns the dollars actually spent. */
function spend(g: GameState, t: LpToken, out: StepOutput | null, usd: number, role: 'scalp' | 'fomo' | 'news'): number {
  if (t.status !== 'live' || !(usd >= 0.01)) return 0;
  const cents = Math.round(usd * 100);
  if (cents < 1) return 0;
  if (!MICROFLOW.enabled) {
    const r = buyCurve(g, null, t.ticker, cents, 1, out, true);
    if (!r.ok) return 0;
    const spent = ((r.data as { spendCents?: number }).spendCents ?? 0) / 100;
    if (t.status === 'live') {
      const cs = cohortsOf(t);
      const last = cs[cs.length - 1];
      if (last && !last.sniper && last.role === undefined) last.role = role;
    }
    return spent;
  }
  let left = cents;
  let spentCents = 0;
  for (const w of crowdOrder(t, g.market.tick, role, tokenTraders(g, t))) {
    if (left < 1 || t.status !== 'live') break;
    const slice = Math.min(left, spendableCents(g, w));
    if (slice < 1) continue;
    const r = buyCurve(g, null, t.ticker, slice, 1, out, true, false, w, role);
    if (!r.ok) continue;
    const got = (r.data as { spendCents?: number }).spendCents ?? 0;
    left -= got;
    spentCents += got;
  }
  return spentCents / 100;
}

function sellOf(g: GameState, t: LpToken, out: StepOutput | null, wants: { hold: number; scalp: number; fomo: number; news: number }): void {
  if (t.status !== 'live') return;
  const cs = cohortsOf(t);
  const plan = cs.map(() => 0);
  const take = (pred: (c: NpcCohort) => boolean, n: number) => {
    let left = Math.max(0, Math.floor(n));
    cs.forEach((row, i) => {
      if (left <= 0 || !pred(row)) return;
      const room = row.tokens - plan[i]!;
      const k = Math.min(Math.max(0, room), left);
      plan[i] = plan[i]! + k;
      left -= k;
    });
  };
  take(isHold, wants.hold);
  take((row) => !row.sniper && row.role === 'scalp', wants.scalp);
  take((row) => !row.sniper && row.role === 'fomo', wants.fomo);
  take((row) => !row.sniper && row.role === 'news', wants.news);
  const groups = new Map<string, { row: NpcCohort; n: number }[]>();
  cs.forEach((row, i) => {
    const n = plan[i] ?? 0;
    if (n <= 0) return;
    const key = row.wallet ?? '';
    const list = groups.get(key) ?? [];
    list.push({ row, n });
    groups.set(key, list);
  });
  for (const [key, items] of groups) {
    if (t.status !== 'live') return;
    const live = cohortsOf(t);
    const livePlan = live.map(row => items.find(x => x.row === row)?.n ?? 0);
    const total = livePlan.reduce((a, b) => a + b, 0);
    if (total <= 0) continue;
    const w = key ? walletById(t, key) : undefined;
    sellCurve(g, null, t.ticker, total, 1, out, true, livePlan, false, w);
  }
}
