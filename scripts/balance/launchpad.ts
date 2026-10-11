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
import { LP, NPC } from '../../src/world/launchpad/constants';
import { curveProgress, quoteSell, spotAt } from '../../src/world/launchpad/curve';
import { buzzOf } from '../../src/world/launchpad/demand';
import { sellCurve } from '../../src/world/launchpad/trade';
import type { Command, CommandResult, GameState } from '../../src/world/types';
import type { LpToken } from '../../src/world/launchpad/types';
import { mean, oneSided95, pnlPerDollar, strategyPasses } from './launchpad-stat';

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
const START_CASH = 20_000;
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

const GATED = ['creatorDump', 'sniper', 'flipper', 'buzzPumper', 'retail', 'viralChaser', 'pumpSeller', 'postGradBuyer', 'frontRunner', 'floorSprayer'] as const;
type Gated = (typeof GATED)[number];
/** a world with no bot: the pure NPC world of the seed (the shape, the NPC net and the idle control are read here) */
type Kind = Gated | 'none';
const BOT_ID: Record<Kind, string> = {
  creatorDump: 'bot_creator', sniper: 'bot_sniper', flipper: 'bot_flipper', buzzPumper: 'bot_buzz', retail: 'bot_retail',
  viralChaser: 'bot_chaser', pumpSeller: 'bot_pump', postGradBuyer: 'bot_postgrad', frontRunner: 'bot_front', floorSprayer: 'bot_floor',
  none: 'bot_idle',
};
/** the bots that act every tick; the others act on the decision cadence */
const TICK_KINDS: ReadonlySet<Kind> = new Set<Kind>(['viralChaser', 'postGradBuyer', 'frontRunner']);

/** a bot's Launchpad ledger in one world: the cash its commands moved, the cash it put in, and the creator fees its own commands earned */
interface Ledger { cash: number; out: number; fees: number }

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
  const { g, id, led, kind } = ctx;
  const c0 = cashOf(g, id);
  const f0 = kind === 'creatorDump' ? feesOf(g, id) : 0;
  const r = fn();
  const d = cashOf(g, id) - c0;
  led.cash += d;
  if (d < 0) led.out -= d;
  if (kind === 'creatorDump') led.fees += feesOf(g, id) - f0;
  return r;
}

function act(ctx: Ctx, cmd: Command): CommandResult {
  return tallied(ctx, () => applyCommand(ctx.g, ctx.id, cmd));
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
 * through the book in up to three market sells. Whatever the book still cannot take is reported, not valued.
 */
function liquidate(ctx: Ctx): number {
  const { g, id } = ctx;
  let leftover = 0;
  for (const t of Object.values(g.launchpad?.tokens ?? {})) {
    if (t.status === 'graduated') {
      for (let k = 0; k < 3; k++) {
        const pos = enginePos(g, id, t.ticker);
        if (pos <= 0) break;
        act(ctx, { type: 'order.place', order: { assetId: t.ticker, side: 'sell', type: 'market', qty: pos } } as Command);
      }
      leftover += enginePos(g, id, t.ticker) > 0 ? 1 : 0;
      continue;
    }
    const have = t.bal[id] ?? 0;
    if (have > 0) {
      const r = tallied(ctx, () => sellCurve(g, id, t.ticker, have, 1, null));
      // a curve holding the curve would not take (a refused sell) is a position left unvalued, like a graduated one
      if (!r.ok || (t.bal[id] ?? 0) > 0) leftover++;
    }
  }
  return leftover;
}

interface WorldStats {
  launches: number;
  cohortLaunches: number;
  deadWithin7: number;
  deadWithin7Early: number;
  graduated: number;
  tenX: number;
  npcLife: number;
  npcLifeN: number;
  allLaunches: number;
  npcNet: number;
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

interface WorldResult {
  seed: string;
  kind: Kind;
  /** the bot's Launchpad P&L (its cash flows, horizon liquidation included) and the cash it put in */
  pnl: number;
  deployed: number;
  /** the GX buy-and-hold over the horizon (reported beside, not the benchmark) */
  gx: number;
  residualMax: number;
  idleDrift: number;
  leftover: number;
  stats: WorldStats;
}

/** One world: the seed's NPC launches, plus the one bot (or none). Identical NPC draws across kinds of a seed (paired seeds). */
function runWorld(seed: string, kind: Kind): WorldResult {
  const g = newWorld(seed, kind);
  const startTick = g.market.tick;
  const id = BOT_ID[kind];
  const ctx: Ctx = { g, id, kind, st: newState(), rng: new Rng(seedStream(seed, `bot:${id}`)), startTick, led: { cash: 0, out: 0, fees: 0 } };
  const nw0 = netWorthBreakdown(g, id).total;
  const cash0 = g.market.accounts[id]?.cash ?? 0;
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
    stepGame(g);
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
  if (kind === 'none') {
    // the idle control (L8.1): an account that never trades moves only with its cash
    const nw1 = netWorthBreakdown(g, id).total;
    idleDrift = nw1 - nw0 - ((g.market.accounts[id]?.cash ?? 0) - cash0);
  } else {
    leftover = liquidate(ctx);
  }
  const pnl = ctx.led.cash + (kind === 'creatorDump' ? feesOf(g, id) - ctx.led.fees : 0);
  // the money identity after the liquidation (the bot's sales are real trades)
  const mEnd = netWorldMoney(g);
  const bkEnd = bookedNet(g);
  const etEnd = engineTallyOf(g);
  residualMax = Math.max(residualMax, Math.abs((mEnd - money) - (bkEnd - booked) - (etEnd - tally)));
  return { seed, kind, pnl, deployed: ctx.led.out, gx, residualMax, idleDrift, leftover, stats };
}

const seeds = Array.from({ length: nSeeds }, (_, i) => `${prefix}-${String(firstSeed + i).padStart(2, '0')}`);
const per: WorldResult[] = [];

function summarize(complete: boolean) {
  const byKind = (k: Kind) => per.filter((r) => r.kind === k);
  const strategies = Object.fromEntries(GATED.map((k) => {
    const rs = byKind(k);
    const ratios = rs.map((r) => pnlPerDollar(r.pnl, r.deployed));
    const bound = oneSided95(ratios);
    // v1.2 review item 2: a position the book could not take is unvalued in the P&L, so any leftover fails the bot (no bias toward a pass)
    const leftover = rs.reduce((a, r) => a + r.leftover, 0);
    return [k, {
      seeds: rs.length,
      meanPnlPerDollar: mean(ratios),
      oneSided95: bound,
      pass: strategyPasses(ratios, leftover),
      meanPnl: mean(rs.map((r) => r.pnl)),
      meanDeployed: mean(rs.map((r) => r.deployed)),
      meanReturnOnStart: mean(rs.map((r) => r.pnl / START_CASH)),
      gxMean: mean(rs.map((r) => r.gx)),
      leftover,
      worldShape: {
        dead7dFromDay3: rs.reduce((a, r) => a + r.stats.deadWithin7, 0) / Math.max(1, rs.reduce((a, r) => a + r.stats.cohortLaunches, 0)),
        graduationRate: rs.reduce((a, r) => a + r.stats.graduated, 0) / Math.max(1, rs.reduce((a, r) => a + r.stats.launches, 0)),
      },
    }];
  }));
  const none = byKind('none');
  const totalLaunches = none.reduce((a, r) => a + r.stats.launches, 0);
  const cohortTotal = none.reduce((a, r) => a + r.stats.cohortLaunches, 0);
  const dead7 = none.reduce((a, r) => a + r.stats.deadWithin7, 0) / Math.max(1, cohortTotal);
  const dead7Early = none.reduce((a, r) => a + r.stats.deadWithin7Early, 0) / Math.max(1, totalLaunches - cohortTotal);
  const grad = none.reduce((a, r) => a + r.stats.graduated, 0) / Math.max(1, totalLaunches);
  const tenX = none.reduce((a, r) => a + r.stats.tenX, 0) / Math.max(1, totalLaunches);
  const residual = Math.max(0, ...per.map((r) => r.residualMax));
  const idleZeroOk = none.every((r) => Math.abs(r.idleDrift) < 1e-9);
  const npcNetPerToken = none.reduce((a, r) => a + r.stats.npcLife, 0) / Math.max(1, none.reduce((a, r) => a + r.stats.npcLifeN, 0));
  const npcNetBooked = none.reduce((a, r) => a + r.stats.npcNet, 0) / Math.max(1, none.reduce((a, r) => a + r.stats.allLaunches, 0));
  const npcOk = npcNetPerToken <= 0;
  const shape = {
    deadWithin7dFromDay3: dead7, deadWithin7dDay0to2Reported: dead7Early, graduationRate: grad, tenXRate: tenX,
    deadOk: dead7 >= 0.7, gradOk: grad >= 0.01 && grad <= 0.05, tenXOk: tenX <= 0.005,
    idleZeroOk, npcNetPerToken, npcNetBookedPerToken: npcNetBooked, npcOk, launchesObserved: totalLaunches,
  };
  const botsOk = GATED.every((k) => strategies[k]!.pass);
  const gate = complete && botsOk && shape.deadOk && shape.gradOk && shape.tenXOk && residual < 0.005 && idleZeroOk && npcOk;
  return { prefix, seeds: seeds.length, seedsDone: new Set(per.map((r) => r.seed)).size, complete, days, gxMean: mean(none.map((r) => r.gx)), strategies, shape, residualMax: residual, gate, NPC, perWorld: per };
}

for (const s of seeds) {
  for (const kind of ['none', ...GATED] as Kind[]) {
    per.push(runWorld(s, kind));
  }
  console.error(`seed ${s} done`);
  // a partial summary after each seed, so a long run that stops still leaves its numbers (complete: false until the last seed)
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(summarize(false), null, 2));
}

const summary = summarize(true);
writeFileSync(outPath, JSON.stringify(summary, null, 2));
const printed = {
  prefix, seeds: seeds.length, days, launches: summary.shape.launchesObserved, gxMean: summary.gxMean,
  strategies: Object.fromEntries(GATED.map((k) => [k, { meanPnlPerDollar: summary.strategies[k]!.meanPnlPerDollar, oneSided95: summary.strategies[k]!.oneSided95, leftover: summary.strategies[k]!.leftover, pass: summary.strategies[k]!.pass }])),
  shape: summary.shape, residualMax: summary.residualMax, gate: summary.gate,
};
console.log(JSON.stringify(printed, null, 2));
process.exit(summary.gate ? 0 : 1);
