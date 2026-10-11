// Launchpad balance gate (lead-launchpad.md L8, V1-PHASE5, amendments v1.1 to v1.3).
// Usage: npx tsx scripts/balance/launchpad.ts [--seeds 50] [--days 30] [--first 1] [--prefix lp] [--npc JSON] [--out balance-out/launchpad.json]
//
// v1.3 (L8.3): each bot runs ALONE in its own world on the same seed (paired seeds), so one bot's trades cannot count as another's edge.
// The gated statistic is the bot's Launchpad P&L per dollar deployed: its cash flows through the Launchpad commands, with what it still
// holds liquidated at the horizon, over the cash it put in. Pass when the one-sided 95% bound over seeds is at or below zero. The GX
// buy-and-hold return is reported beside it, not used as the benchmark.
// The shape (dead within 7 game days from day 3, graduation rate, 10x rate), the NPC cohort's life net per token and the idle control's
// zero drift come from a world with no bot (the pure NPC world of each seed). The money identity is checked in every world, every day.
// Gated strategies: creator-dump, sniper, graduation flipper, buzz pumper, random retail, viral chaser, pump seller, post-graduation
// buyer, front-runner and (v1.3) the floor sprayer. Seed prefixes: tuning uses lx, the held-out confirmation uses lh.
// Exit code 1 when a gate fails. Same args => same output.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Rng, seedStream, indexLevel } from '../../src/engine';
import { applyCommand, createGame, stepGame } from '../../src/world/game';
import { cashOf, credit, netWorthBreakdown, TPD } from '../../src/world/core';
import { bookedNet, engineTallyOf, netWorldMoney } from '../../src/world/company/exploits/sequences';
import { LP, LP_K, NPC } from '../../src/world/launchpad/constants';
import { curveProgress, feeSplit, quoteSell, spotAt } from '../../src/world/launchpad/curve';
import { buzzOf } from '../../src/world/launchpad/demand';
import { sellCurve } from '../../src/world/launchpad/trade';
import type { Command, CommandResult, GameState, StepOutput } from '../../src/world/types';
import type { LpToken } from '../../src/world/launchpad/types';
import { openSellQty } from '../../src/world/launchpad/graduate';
import { KINDS, START_CASH, printedOf, summarize, type Kind, type WorldResult, type WorldStats } from './launchpad-summary';

function arg(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const nSeeds = Number(arg('seeds', '50'));
const days = Number(arg('days', '30'));
const firstSeed = Number(arg('first', '1'));
// the seed namespace: tuning runs use their own prefix (lx) so the held-out gate (lh) never sees a tuned seed (lead-launchpad.md L8.2)
const prefix = arg('prefix', 'lp');
const outPath = arg('out', 'balance-out/launchpad.json');
// tuning (lead-launchpad.md L6.3): the --npc JSON overrides the L6 constants of NPC for this run only; the summary records them
const npcOverride = JSON.parse(arg('npc', '{}')) as Partial<typeof NPC>;
Object.assign(NPC, npcOverride);
const DECIDE_EVERY = 60;
/** the viral chaser's trigger: a buzz rise of this much within one tick, or a day-volume rise of this much within one tick */
const CHASE_BUZZ = 0.25;
const CHASE_VOL = 1_000;
/** the post-graduation buyer: the first ticks after a graduation it may buy in (two game hours), its stake, and its hold into the unwind */
const POST_WINDOW_TICKS = 60;
const POST_STAKE = 1_000;
const POST_HOLD_TICKS = 120;
/** the floor sprayer (v1.3): a stake of this many dollars in each token older than one game day when it trades within 10% of the lowest
 *  price the bot has sampled for it (its floor), held to the horizon */
const FLOOR_STAKE = 500;
const FLOOR_NEAR = 1.1;

/** a world with no bot: the pure NPC world of the seed (the shape, the NPC net and the idle control are read here) */
const BOT_ID: Record<Kind, string> = {
  creatorDump: 'bot_creator', sniper: 'bot_sniper', flipper: 'bot_flipper', buzzPumper: 'bot_buzz', retail: 'bot_retail',
  viralChaser: 'bot_chaser', pumpSeller: 'bot_pump', postGradBuyer: 'bot_postgrad', frontRunner: 'bot_front', floorSprayer: 'bot_floor',
  none: 'bot_idle',
};
/** the bots that act every tick; the others act on the decision cadence */
const TICK_KINDS: ReadonlySet<Kind> = new Set<Kind>(['viralChaser', 'postGradBuyer', 'frontRunner']);

/**
 * A bot's Launchpad ledger in one world: the cash its commands moved (cash), the engine fills of its orders that settled inside the
 * world's steps (engine: a buy is negative, a sell positive, net of the fee; the engine's settlement is cash -= side * qty * price + fee),
 * the cash it put in (out: command outflows and the cost of its engine buys), and the creator fees its own commands earned (fees).
 */
interface Ledger { cash: number; out: number; fees: number; engine: number }

interface BotState {
  launched: boolean;
  sniped: Set<string>;
  snipeEntry: Record<string, { tick: number; tokens: number; entry: number }>;
  flipped: Set<string>;
  flipEntry: Record<string, { tick: number; qty: number; entry: number }>;
  dumpedDay: number;
  /** the viral chaser's view of each token's buzz and day volume at the last tick */
  prevBuzz: Record<string, number>;
  prevVol: Record<string, number>;
  /** the pump seller: its open stakes (the tick and the price at the last decision), and the tokens it has staked once */
  pump: Record<string, { tick: number; last: number }>;
  pumpSeen: Set<string>;
  /** the post-graduation buyer: the graduations it has bought into, and its open positions */
  postSeen: Set<string>;
  post: Record<string, { tick: number }>;
  /** the floor sprayer: the lowest price sampled per token, and the tokens it has sprayed */
  floorMin: Record<string, number>;
  sprayed: Set<string>;
}

interface Ctx {
  g: GameState;
  id: string;
  kind: Kind;
  st: BotState;
  rng: Rng;
  startTick: number;
  led: Ledger;
}

function newState(): BotState {
  return {
    launched: false, sniped: new Set(), snipeEntry: {}, flipped: new Set(), flipEntry: {}, dumpedDay: -1,
    prevBuzz: {}, prevVol: {}, pump: {}, pumpSeen: new Set(), postSeen: new Set(), post: {}, floorMin: {}, sprayed: new Set(),
  };
}

/** the creator fees a bot's own tokens have earned so far (only the creator bot has tokens) */
function feesOf(g: GameState, id: string): number {
  let f = 0;
  for (const t of Object.values(g.launchpad?.tokens ?? {})) if (t.creatorId === id) f += t.creatorFees;
  return f;
}

/** runs a bot's Launchpad action and books its cash flow, its outflow and its own creator fees into the bot's ledger */
function tallied<T>(ctx: Ctx, fn: () => T): T {
  const { g, id, led } = ctx;
  const c0 = cashOf(g, id);
  const f0 = feesOf(g, id);
  const r = fn();
  const d = cashOf(g, id) - c0;
  led.cash += d;
  if (d < 0) led.out -= d;
  led.fees += feesOf(g, id) - f0;
  return r;
}

function act(ctx: Ctx, cmd: Command): CommandResult {
  return tallied(ctx, () => applyCommand(ctx.g, ctx.id, cmd));
}

/**
 * One world step, with the bot's engine fills booked. An engine order (a market sell of a graduated position, a copy buy) is queued by
 * the command and settles in the step that matches it, so its cash moves here, not in tallied(). Every fill of the bot is one line of
 * the ledger, at the engine's settlement (fee included); a fill the engine refused moves no cash and is not a fill.
 */
function stepBot(ctx: Ctx): StepOutput {
  const out = stepGame(ctx.g);
  for (const f of out.fills) {
    if (f.playerId !== ctx.id) continue;
    const gross = f.qty * f.price;
    if (f.side === 'buy') {
      ctx.led.engine -= gross + f.fee;
      ctx.led.out += gross + f.fee;
    } else {
      ctx.led.engine += gross - f.fee;
    }
  }
  return out;
}

/** the non-price cash of an engine account (dividends, interest earned less paid, borrow fees): cash that is not a trade's P&L */
function nonPriceOf(g: GameState, pid: string): number {
  const a = g.market.accounts[pid];
  if (!a) return 0;
  return (a.dividends ?? 0) + (a.interestEarned ?? 0) - (a.interestPaid ?? 0) - (a.borrowPaid ?? 0);
}

/** the engine position of a bot in a token (zero when it has none) */
function enginePos(g: GameState, pid: string, ticker: string): number {
  return g.market.accounts[pid]?.positions[ticker]?.qty ?? 0;
}

/** sells a bot's whole engine position in a graduated token through the order path */
function sellEngine(ctx: Ctx, ticker: string): void {
  const qty = enginePos(ctx.g, ctx.id, ticker);
  if (qty > 0) act(ctx, { type: 'order.place', order: { assetId: ticker, side: 'sell', type: 'market', qty } } as Command);
}

function newWorld(seed: string, kind: Kind): GameState {
  const g = createGame(seed, { warmupDays: 0, npcs: false, launchpadNpc: true });
  const b = { id: BOT_ID[kind], handle: BOT_ID[kind] };
  const r = applyCommand(g, b.id, { type: 'join', handle: b.handle, country: 'AV' });
  if (!r.ok) throw new Error(r.error);
  g.players[b.id]!.joinedTick = -1000 * TPD;
  g.players[b.id]!.rankId = 'R2';
  credit(g, b.id, START_CASH, 'balanceSeed');
  g.market = { ...g.market, tick: 2 * TPD + 1 };
  return g;
}

/** a bot's decision at a tick: the strategy's own rule, through the real commands (the cadence bots) */
function decide(ctx: Ctx): void {
  const { g, kind, st, rng, startTick } = ctx;
  const s = g.launchpad;
  const tick = g.market.tick;
  const day = Math.floor((tick - startTick) / TPD);
  const tokens: LpToken[] = s ? Object.values(s.tokens) : [];
  const live = tokens.filter((t) => t.status === 'live');
  switch (kind) {
    case 'creatorDump': {
      if (!st.launched) {
        st.launched = true;
        act(ctx, { type: 'lp.launch', name: 'Bot Relic', ticker: 'BOTR', tagline: 'tg4', allocation: 50_000_000, devBuyCents: 8_000 } as Command);
        return;
      }
      const t = s?.tokens.BOTR;
      if (!t || t.status !== 'live') return;
      const day2 = Math.floor((tick - t.createdTick) / TPD);
      if (day2 >= 1 && day2 < 7 && (t.buzzDay.day !== Math.floor(tick / TPD) || t.buzzDay.n < 1)) {
        act(ctx, { type: 'lp.buzz', ticker: 'BOTR', kind: 'board' });
      }
      if (day2 >= LP.VEST_END_DAYS) {
        const have = t.bal[ctx.id] ?? 0;
        if (have > 0) act(ctx, { type: 'lp.sell', ticker: 'BOTR', tokens: Math.min(have, 2_000_000), maxSlip: 0.5 });
      }
      return;
    }
    case 'sniper': {
      // buy a small amount on each token that is two ticks old, then sell into the first 40% or after 120 ticks
      for (const t of live) {
        if (st.sniped.has(t.ticker) || tick - t.createdTick < 2 || tick - t.createdTick > 60) continue;
        st.sniped.add(t.ticker);
        const r = act(ctx, { type: 'lp.buy', ticker: t.ticker, spendCents: 20_000, maxSlip: 0.2 });
        if (r.ok) st.snipeEntry[t.ticker] = { tick, tokens: (r.data as { tokens: number }).tokens, entry: (r.data as { avgPrice: number }).avgPrice };
      }
      for (const [ticker, e] of Object.entries(st.snipeEntry)) {
        const t = s?.tokens[ticker];
        if (!t || t.status !== 'live') { delete st.snipeEntry[ticker]; continue; }
        if (spotAt(t.y) >= e.entry * 1.4 || tick - e.tick >= 120) {
          const have = t.bal[ctx.id] ?? 0;
          if (have > 0) act(ctx, { type: 'lp.sell', ticker, tokens: have, maxSlip: 0.5 });
          delete st.snipeEntry[ticker];
        }
      }
      return;
    }
    case 'flipper': {
      // buy the curve as it nears graduation, then sell the engine position when the price is 5% above the entry or after two days
      for (const t of live) {
        if (st.flipped.has(t.ticker) || curveProgress(t.y) < 0.6) continue;
        st.flipped.add(t.ticker);
        const r = act(ctx, { type: 'lp.buy', ticker: t.ticker, spendCents: 100_000, maxSlip: 0.3 });
        if (r.ok) st.flipEntry[t.ticker] = { tick, qty: 0, entry: spotAt(t.y) };
      }
      for (const t of tokens) {
        if (t.status !== 'graduated' || !st.flipEntry[t.ticker]) continue;
        const pos = enginePos(g, ctx.id, t.ticker);
        const e = st.flipEntry[t.ticker]!;
        const px = Math.exp(g.market.assets[g.market.config.assets.findIndex((a) => a.id === t.ticker)]!.lnP);
        if (pos > 0 && (px >= e.entry * 1.05 || tick - e.tick >= 2 * TPD)) {
          sellEngine(ctx, t.ticker);
          delete st.flipEntry[t.ticker];
        }
      }
      return;
    }
    case 'buzzPumper': {
      // one Wire promo a day on a random live token, and a curve buy on the same token
      if (live.length === 0 || (st.dumpedDay === day)) return;
      st.dumpedDay = day;
      const t = live[Math.floor(rng.uniform() * live.length)]!;
      act(ctx, { type: 'lp.buzz', ticker: t.ticker, kind: 'wire' });
      act(ctx, { type: 'lp.buy', ticker: t.ticker, spendCents: 50_000, maxSlip: 0.3 });
      return;
    }
    case 'pumpSeller': {
      // small stakes ($150) in fresh tokens (under two game days old, at most four stakes at once); each stake is sold into any pump
      // (the price 5% above its level at the last decision), or after three game days
      for (const t of live) {
        if (Object.keys(st.pump).length >= 4) break;
        if (st.pumpSeen.has(t.ticker) || tick - t.createdTick > 2 * TPD) continue;
        st.pumpSeen.add(t.ticker);
        const r = act(ctx, { type: 'lp.buy', ticker: t.ticker, spendCents: 15_000, maxSlip: 0.1 });
        if (r.ok) st.pump[t.ticker] = { tick, last: spotAt(t.y) };
      }
      for (const [ticker, e] of Object.entries(st.pump)) {
        const t = s?.tokens[ticker];
        if (!t) { delete st.pump[ticker]; continue; }
        if (t.status === 'graduated') { sellEngine(ctx, ticker); delete st.pump[ticker]; continue; }
        const have = t.bal[ctx.id] ?? 0;
        if (t.status !== 'live' || have <= 0) { delete st.pump[ticker]; continue; }
        const px = spotAt(t.y);
        if (px >= e.last * 1.05 || tick - e.tick >= 3 * TPD) {
          act(ctx, { type: 'lp.sell', ticker, tokens: have, maxSlip: 0.5 });
          delete st.pump[ticker];
        } else {
          e.last = px;
        }
      }
      return;
    }
    case 'floorSprayer': {
      // v1.3: every live token's lowest sampled price is kept; a token older than one game day is bought once, when its price is within
      // FLOOR_NEAR of that floor, and held to the horizon
      for (const t of live) {
        const px = spotAt(t.y);
        st.floorMin[t.ticker] = Math.min(st.floorMin[t.ticker] ?? Infinity, px);
        if (st.sprayed.has(t.ticker) || tick - t.createdTick < TPD) continue;
        if (px > st.floorMin[t.ticker]! * FLOOR_NEAR) continue;
        st.sprayed.add(t.ticker);
        act(ctx, { type: 'lp.buy', ticker: t.ticker, spendCents: FLOOR_STAKE * 100, maxSlip: 0.2 });
      }
      return;
    }
    case 'retail': {
      if (rng.uniform() > 0.2) return;
      if (rng.uniform() < 0.6 && live.length > 0) {
        const t = live[Math.floor(rng.uniform() * live.length)]!;
        act(ctx, { type: 'lp.buy', ticker: t.ticker, spendCents: 20_000 + Math.round(rng.uniform() * 60_000), maxSlip: 0.1 });
      } else {
        const held = tokens.filter((t) => (t.bal[ctx.id] ?? 0) > 0);
        if (held.length > 0) {
          const t = held[Math.floor(rng.uniform() * held.length)]!;
          act(ctx, { type: 'lp.sell', ticker: t.ticker, tokens: Math.max(1, Math.floor((t.bal[ctx.id] ?? 0) * 0.5)), maxSlip: 0.1 });
        }
      }
      return;
    }
    default:
      return;
  }
}

/**
 * The bots that act every tick. The viral chaser sees each tick's buzz and day-volume change, after the tick's arrivals are bought
 * (L6.4), and buys that token within the same tick; it exits at -10%, +50% or after two game days. The post-graduation buyer buys an
 * engine position just after a graduation and sells it into the unwind after POST_HOLD_TICKS.
 */
function tickDecide(ctx: Ctx): void {
  const { g, kind, st } = ctx;
  const s = g.launchpad;
  if (!s) return;
  const tick = g.market.tick;
  if (kind === 'viralChaser') {
    for (const ticker of s.order) {
      const t = s.tokens[ticker];
      if (!t) continue;
      const b = buzzOf(t);
      const v = t.volToday;
      const pb = st.prevBuzz[ticker] ?? b;
      const pv = st.prevVol[ticker] ?? v;
      st.prevBuzz[ticker] = b;
      st.prevVol[ticker] = v;
      if (t.status !== 'live' || st.sniped.has(ticker)) continue;
      if (!(b - pb >= CHASE_BUZZ || v - pv >= CHASE_VOL)) continue;
      st.sniped.add(ticker);
      const r = act(ctx, { type: 'lp.buy', ticker, spendCents: 30_000, maxSlip: 0.1 });
      if (r.ok) st.snipeEntry[ticker] = { tick, tokens: (r.data as { tokens: number }).tokens, entry: (r.data as { avgPrice: number }).avgPrice };
    }
    for (const [ticker, e] of Object.entries(st.snipeEntry)) {
      const t = s.tokens[ticker];
      if (!t) { delete st.snipeEntry[ticker]; continue; }
      if (t.status === 'graduated') { sellEngine(ctx, ticker); delete st.snipeEntry[ticker]; continue; }
      if (t.status !== 'live') { delete st.snipeEntry[ticker]; continue; }
      const px = spotAt(t.y);
      if (px <= e.entry * 0.9 || px >= e.entry * 1.5 || tick - e.tick >= 2 * TPD) {
        const have = t.bal[ctx.id] ?? 0;
        if (have > 0) act(ctx, { type: 'lp.sell', ticker, tokens: have, maxSlip: 0.5 });
        delete st.snipeEntry[ticker];
      }
    }
    return;
  }
  if (kind === 'frontRunner') {
    // buys on the tick a launch appears (after the tick's launches and their sniper entry), and sells everything two ticks after it
    for (const ticker of s.order) {
      const t = s.tokens[ticker];
      if (!t || t.status !== 'live' || st.sniped.has(ticker) || tick - t.createdTick !== 0) continue;
      st.sniped.add(ticker);
      const r = act(ctx, { type: 'lp.buy', ticker, spendCents: 200_000, maxSlip: 0.2 });
      if (r.ok) st.snipeEntry[ticker] = { tick, tokens: (r.data as { tokens: number }).tokens, entry: (r.data as { avgPrice: number }).avgPrice };
    }
    for (const [ticker] of Object.entries(st.snipeEntry)) {
      const t = s.tokens[ticker];
      if (!t) { delete st.snipeEntry[ticker]; continue; }
      if (t.status !== 'live') { delete st.snipeEntry[ticker]; continue; }
      if (tick - t.createdTick >= 2) {
        const have = t.bal[ctx.id] ?? 0;
        if (have > 0) act(ctx, { type: 'lp.sell', ticker, tokens: have, maxSlip: 0.5 });
        delete st.snipeEntry[ticker];
      }
    }
    return;
  }
  if (kind === 'postGradBuyer') {
    for (const ticker of s.order) {
      const t = s.tokens[ticker];
      if (!t || t.status !== 'graduated' || t.gradTick === undefined || st.postSeen.has(ticker)) continue;
      if (tick - t.gradTick > POST_WINDOW_TICKS) continue;
      st.postSeen.add(ticker);
      const idx = g.market.config.assets.findIndex((a) => a.id === ticker);
      const px = Math.exp(g.market.assets[idx]!.lnP);
      const qty = Math.floor(POST_STAKE / px);
      if (qty <= 0) continue;
      const r = act(ctx, { type: 'order.place', order: { assetId: ticker, side: 'buy', type: 'market', qty } } as Command);
      if (r.ok) st.post[ticker] = { tick };
    }
    for (const [ticker, e] of Object.entries(st.post)) {
      if (tick - e.tick < POST_HOLD_TICKS) continue;
      sellEngine(ctx, ticker);
      delete st.post[ticker];
    }
  }
}

/**
 * The horizon liquidation (L8.3): what the bot still holds is sold at the end of the run, so its P&L is realised. Curve holdings sell
 * to the curve at the liquidation quote (no slippage limit: the bot is valued at what it would get out), and graduated positions go
 * through the book in up to three market sells. A position the venue will not take is VALUED, not left (v1.3 review):
 *   - a graduated position the book still cannot take (the book's cash is the bound, trading.ts) is marked at the engine price less the
 *     curve's exit fee;
 *   - a curve holding the curve will not take in one sell (quoteSell refuses y + tokens above Y0: the creator's allocation sits outside
 *     the curve's reserve) is sold for what the curve can take (Y0 - y), and the rest is marked at the curve's own formula from the
 *     reserve left, less the exit fee (the slippage of selling it all at once, as the curve prices it).
 * Each mark is added to the P&L and counted in marked. The mark is on the high side of what a holder could realise, so a mark can make
 * a bot fail, never let it pass: it errs toward failing the gate. leftover is what could not be valued at all; a mark always can, so it
 * is zero by construction, and it still fails the bot if a future change breaks that.
 */
function liquidate(ctx: Ctx): { leftover: number; marked: number; mark: number } {
  const { g, id } = ctx;
  const leftover = 0;
  let marked = 0;
  let mark = 0;
  // the graduated positions first: each try queues a market sell of what is still held (less its open sells) and one world step settles
  // the book's fills; up to three tries. Every step is booked by stepBot, so the proceeds are the bot's cash
  const graduated = Object.values(g.launchpad?.tokens ?? {}).filter((t) => t.status === 'graduated');
  for (let k = 0; k < 3; k++) {
    let queued = false;
    for (const t of graduated) {
      const pos = enginePos(g, id, t.ticker) - openSellQty(g, id, t.ticker);
      if (pos <= 0) continue;
      act(ctx, { type: 'order.place', order: { assetId: t.ticker, side: 'sell', type: 'market', qty: pos } } as Command);
      queued = true;
    }
    if (!queued) break;
    stepBot(ctx);
  }
  for (const t of graduated) {
    const rest = enginePos(g, id, t.ticker);
    if (rest > 0) {
      const idx = g.market.config.assets.findIndex((a) => a.id === t.ticker);
      mark += rest * Math.exp(g.market.assets[idx]!.lnP) * (1 - LP.FEE_RATE);
      marked++;
    }
  }
  // the curve holdings: the curve's own fills are commands, so no world step runs here
  for (const t of Object.values(g.launchpad?.tokens ?? {})) {
    if (t.status === 'graduated') continue;
    const have = t.bal[id] ?? 0;
    if (have <= 0) continue;
    tallied(ctx, () => sellCurve(g, id, t.ticker, have, 1, null));
    let rest = t.bal[id] ?? 0;
    const room = Math.min(rest, LP.Y0 - t.y);
    if (rest > 0 && room > 0) {
      tallied(ctx, () => sellCurve(g, id, t.ticker, room, 1, null));
      rest = t.bal[id] ?? 0;
    }
    if (rest > 0) {
      // the curve's formula from the reserve now (no Y0 bound: a valuation, not a fill), less the exit fee, in whole cents as a sale pays
      const gross = LP_K / t.y - LP_K / (t.y + rest);
      const grossCents = Math.floor(gross * 100 + 1e-9);
      mark += (grossCents - feeSplit(grossCents).fee) / 100;
      marked++;
    }
  }
  return { leftover, marked, mark };
}

/** The L6 shape and the NPC life of one world (read before the horizon liquidation, so the bot's own sales do not move it). */
function worldStats(g: GameState, tenXSeen: Record<string, boolean>): WorldStats {
  // a launch is observed when the run lasted 10 game days after it, so the end of the run does not censor the cohort
  const end = g.market.tick;
  const toks = Object.values(g.launchpad?.tokens ?? {});
  const observed = toks.filter((t) => t.createdTick <= end - 10 * TPD);
  // the death share is over the launches from day 3 on (the cash clock cannot kill a day-0-to-2 launch before day 10); earlier ones are
  // reported beside it, not gated
  const cohort = observed.filter((t) => t.createdTick >= LP.DEAD_CASH_START_TICK);
  let deadWithin7 = 0;
  for (const t of cohort) if (t.status === 'dead' && t.deadTick !== undefined && t.deadTick - t.createdTick <= 7 * TPD) deadWithin7++;
  let deadWithin7Early = 0;
  for (const t of observed) {
    if (t.createdTick < LP.DEAD_CASH_START_TICK && t.status === 'dead' && t.deadTick !== undefined && t.deadTick - t.createdTick <= 7 * TPD) deadWithin7Early++;
  }
  let graduated = 0;
  let tenX = 0;
  for (const t of observed) {
    if (t.gradTick !== undefined) graduated++;
    if (tenXSeen[t.ticker]) tenX++;
  }
  // the NPC cohort's net over a token's life (L6.1, v1.2 reading): its curve buys less its 1% buy fee, less its gross sells, less the
  // liquidation value of what it still holds on a live curve. A graduated token counts once it has had ten game days to unwind
  let npcLife = 0;
  let npcLifeN = 0;
  for (const t of observed) {
    if (t.status === 'graduated' && (t.gradTick ?? end) > end - 10 * TPD) continue;
    const inv = t.status === 'live' && t.npcBal > 0 ? quoteSell(t.y, t.npcBal) : null;
    npcLife += 0.99 * t.flows.npcBuy - t.flows.npcSell - (inv && inv.ok ? inv.netCents / 100 : 0);
    npcLifeN++;
  }
  return {
    launches: observed.length, cohortLaunches: cohort.length, deadWithin7, deadWithin7Early, graduated, tenX,
    npcLife, npcLifeN, allLaunches: toks.length,
    npcNet: (g.economy.faucets.npcRetail ?? 0) - (g.economy.sinks.npcRetail ?? 0),
  };
}

/** One world: the seed's NPC launches, plus the one bot (or none). Identical NPC draws across kinds of a seed (paired seeds). */
function runWorld(seed: string, kind: Kind): WorldResult {
  const g = newWorld(seed, kind);
  const startTick = g.market.tick;
  const id = BOT_ID[kind];
  const ctx: Ctx = { g, id, kind, st: newState(), rng: new Rng(seedStream(seed, `bot:${id}`)), startTick, led: { cash: 0, out: 0, fees: 0, engine: 0 } };
  const nw0 = netWorthBreakdown(g, id).total;
  const cash0 = cashOf(g, id);
  const nonPrice0 = nonPriceOf(g, id);
  const fees0 = feesOf(g, id);
  const gx0 = indexLevel(g.market, 'GX');
  // the 10x check (L8): a graduated token reaches ten times its graduation price within 30 game days of graduating; sampled every tick
  const tenXSeen: Record<string, boolean> = {};
  let residualMax = 0;
  let money = netWorldMoney(g);
  let booked = bookedNet(g);
  let tally = engineTallyOf(g);
  const totalTicks = days * TPD;
  for (let k = 0; k < totalTicks; k++) {
    if (k % DECIDE_EVERY === 0 && kind !== 'none' && !TICK_KINDS.has(kind)) decide(ctx);
    stepBot(ctx);
    if (kind !== 'none' && TICK_KINDS.has(kind)) tickDecide(ctx);
    for (const t of Object.values(g.launchpad?.tokens ?? {})) {
      if (t.status !== 'graduated' || t.gradTick === undefined || !(t.gradPrice ?? 0) || tenXSeen[t.ticker]) continue;
      if (g.market.tick > t.gradTick + 30 * TPD) continue;
      const idx = g.market.config.assets.findIndex((a) => a.id === t.ticker);
      if (idx < 0) continue;
      if (Math.exp(g.market.assets[idx]!.lnP) >= 10 * t.gradPrice!) tenXSeen[t.ticker] = true;
    }
    if (g.market.tick % TPD === 0 || k === totalTicks - 1) {
      const m = netWorldMoney(g);
      const bk = bookedNet(g);
      const et = engineTallyOf(g);
      residualMax = Math.max(residualMax, Math.abs((m - money) - (bk - booked) - (et - tally)));
      money = m;
      booked = bk;
      tally = et;
    }
  }
  const stats = worldStats(g, tenXSeen);
  const gx1 = indexLevel(g.market, 'GX');
  const gx = gx1 / gx0 - 1;
  let idleDrift = 0;
  let leftover = 0;
  let marked = 0;
  let mark = 0;
  if (kind === 'none') {
    // the idle control (L8.1): an account that never trades moves only with its cash
    const nw1 = netWorthBreakdown(g, id).total;
    idleDrift = nw1 - nw0 - (cashOf(g, id) - cash0);
  } else {
    const liq = liquidate(ctx);
    leftover = liq.leftover;
    marked = liq.marked;
    mark = liq.mark;
  }
  // the bot's Launchpad P&L (L8.3): its cash change over the run, less the non-price cash the engine credits a cash account (interest,
  // dividends, borrow fees: not a trade), plus the marks of what it still holds. The ledger check (review item 9): the cash change must
  // equal what its commands moved, its engine fills in the steps, the creator fees its own tokens paid it in the steps, and the non-price
  // cash. Any other passive credit or debit is unledgered, and the gate fails on it
  const cashChange = cashOf(g, id) - cash0;
  const nonPrice = nonPriceOf(g, id) - nonPrice0;
  const unledgered = cashChange - nonPrice - ctx.led.cash - ctx.led.engine - (feesOf(g, id) - fees0 - ctx.led.fees);
  const pnl = cashChange - nonPrice + mark;
  // the money identity after the liquidation (the bot's sales are real trades)
  const mEnd = netWorldMoney(g);
  const bkEnd = bookedNet(g);
  const etEnd = engineTallyOf(g);
  residualMax = Math.max(residualMax, Math.abs((mEnd - money) - (bkEnd - booked) - (etEnd - tally)));
  return { seed, kind, pnl, deployed: ctx.led.out, gx, residualMax, idleDrift, leftover, marked, unledgered, stats };
}

function summarizeNow(complete: boolean) {
  return summarize({ prefix, seeds: seeds.length, days, complete, per, NPC });
}

const seeds = Array.from({ length: nSeeds }, (_, i) => `${prefix}-${String(firstSeed + i).padStart(2, '0')}`);
const per: WorldResult[] = [];

for (const s of seeds) {
  for (const kind of KINDS) {
    per.push(runWorld(s, kind));
  }
  console.error(`seed ${s} done`);
  // a partial summary after each seed, so a long run that stops still leaves its numbers (complete: false until the last seed)
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(summarizeNow(false), null, 2));
}

const summary = summarizeNow(true);
writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(printedOf(summary), null, 2));
process.exit(summary.gate ? 0 : 1);
