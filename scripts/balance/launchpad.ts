// Launchpad balance gate (lead-launchpad.md L8, V1-PHASE5, amendments v1.1 and v1.2).
// Usage: npx tsx scripts/balance/launchpad.ts [--seeds 50] [--days 30] [--first 1] [--prefix lp] [--npc JSON] [--out balance-out/launchpad.json]
// Each seed is a world with world launches at the realistic rate (about 20 a game day) and eight bot strategies on their own accounts:
// creator-dump, sniper, graduation flipper, buzz pumper, random retail (v1.1), and the v1.2 viral chaser (buys within a tick of a visible
// buzz or volume jump, exits at -10%, +50% or after two game days), pump seller (small stakes in fresh tokens, sold into any pump) and
// post-graduation buyer (buys just after graduation, sells into the unwind). Each bot starts with the same cash and is compared with
// buy-and-hold of the GX index over the same horizon, paired per seed. The gate: for every strategy, the mean excess return over
// buy-and-hold is <= 0 at one-sided 95% (over seeds); the L6 shape holds (dead within 7 game days, graduation rate, 10x rate); the NPC
// cohort's life net per token is <= 0; and the world money identity closes to the cent every game day with the booked lines.
// Seed prefixes: tuning uses lx (L8.2), the held-out confirmation uses lh. Exit code 1 when a gate fails. Same args => same output.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Rng, seedStream, indexLevel } from '../../src/engine';
import { applyCommand, createGame, stepGame } from '../../src/world/game';
import { credit, netWorthBreakdown, TPD } from '../../src/world/core';
import { bookedNet, engineTallyOf, netWorldMoney } from '../../src/world/company/exploits/sequences';
import { LP, NPC, curveAccountId } from '../../src/world/launchpad/constants';
import { curveProgress, quoteSell, spotAt } from '../../src/world/launchpad/curve';
import { buzzOf } from '../../src/world/launchpad/demand';
import type { Command, GameState } from '../../src/world/types';
import type { LpToken } from '../../src/world/launchpad/types';

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

type Kind = 'creatorDump' | 'sniper' | 'flipper' | 'buzzPumper' | 'retail' | 'viralChaser' | 'pumpSeller' | 'postGradBuyer' | 'frontRunner' | 'idle';
type Bot = { id: string; handle: string; kind: Kind };
const BOTS: Bot[] = [
  { id: 'bot_creator', handle: 'bot_creator', kind: 'creatorDump' },
  { id: 'bot_sniper', handle: 'bot_sniper', kind: 'sniper' },
  { id: 'bot_flipper', handle: 'bot_flipper', kind: 'flipper' },
  { id: 'bot_buzz', handle: 'bot_buzz', kind: 'buzzPumper' },
  { id: 'bot_retail', handle: 'bot_retail', kind: 'retail' },
  { id: 'bot_chaser', handle: 'bot_chaser', kind: 'viralChaser' },
  { id: 'bot_pump', handle: 'bot_pump', kind: 'pumpSeller' },
  { id: 'bot_postgrad', handle: 'bot_postgrad', kind: 'postGradBuyer' },
  // the v1.2 review's front-runner: buys $2,000 on the tick a launch appears, sells all two ticks later (after the sniper's launch+2 buy)
  { id: 'bot_front', handle: 'bot_front', kind: 'frontRunner' },
  // the idle control (L8.1): never trades; its net worth must move only with its cash (no valuation drift)
  { id: 'bot_idle', handle: 'bot_idle', kind: 'idle' },
];
/** the eight strategies the gate passes or fails (the idle control is checked for zero valuation drift instead) */
const STRATEGY_KINDS = ['creatorDump', 'sniper', 'flipper', 'buzzPumper', 'retail', 'viralChaser', 'pumpSeller', 'postGradBuyer', 'frontRunner'] as const;
/** the bots that act every tick; the others act on the decision cadence */
const TICK_KINDS: ReadonlySet<Kind> = new Set<Kind>(['viralChaser', 'postGradBuyer', 'frontRunner']);

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
}

function newState(): BotState {
  return {
    launched: false, sniped: new Set(), snipeEntry: {}, flipped: new Set(), flipEntry: {}, dumpedDay: -1,
    prevBuzz: {}, prevVol: {}, pump: {}, pumpSeen: new Set(), postSeen: new Set(), post: {},
  };
}

function newWorld(seed: string): GameState {
  const g = createGame(seed, { warmupDays: 0, npcs: false, launchpadNpc: true });
  for (const b of BOTS) {
    const r = applyCommand(g, b.id, { type: 'join', handle: b.handle, country: 'AV' });
    if (!r.ok) throw new Error(r.error);
    g.players[b.id]!.joinedTick = -1000 * TPD;
    g.players[b.id]!.rankId = 'R2';
    credit(g, b.id, START_CASH, 'balanceSeed');
  }
  g.market = { ...g.market, tick: 2 * TPD + 1 };
  return g;
}

/** the engine position of a bot in a token (zero when it has none) */
function enginePos(g: GameState, pid: string, ticker: string): number {
  return g.market.accounts[pid]?.positions[ticker]?.qty ?? 0;
}

/** sells a bot's whole engine position in a graduated token through the order path */
function sellEngine(g: GameState, pid: string, ticker: string): void {
  const qty = enginePos(g, pid, ticker);
  if (qty > 0) applyCommand(g, pid, { type: 'order.place', order: { assetId: ticker, side: 'sell', type: 'market', qty } });
}

/** a bot's decision at a tick: the strategy's own rule, through the real commands (the cadence bots) */
function decide(g: GameState, bot: Bot, st: BotState, rng: Rng, startTick: number): void {
  const s = g.launchpad;
  const tick = g.market.tick;
  const day = Math.floor((tick - startTick) / TPD);
  const tokens: LpToken[] = s ? Object.values(s.tokens) : [];
  const live = tokens.filter((t) => t.status === 'live');
  switch (bot.kind) {
    case 'creatorDump': {
      if (!st.launched) {
        st.launched = true;
        applyCommand(g, bot.id, { type: 'lp.launch', name: 'Bot Relic', ticker: 'BOTR', tagline: 'tg4', allocation: 50_000_000, devBuyCents: 8_000 } as Command);
        return;
      }
      const t = s?.tokens.BOTR;
      if (!t || t.status !== 'live') return;
      const day2 = Math.floor((tick - t.createdTick) / TPD);
      if (day2 >= 1 && day2 < 7 && (t.buzzDay.day !== Math.floor(tick / TPD) || t.buzzDay.n < 1)) {
        applyCommand(g, bot.id, { type: 'lp.buzz', ticker: 'BOTR', kind: 'board' });
      }
      if (day2 >= LP.VEST_END_DAYS) {
        const have = t.bal[bot.id] ?? 0;
        if (have > 0) applyCommand(g, bot.id, { type: 'lp.sell', ticker: 'BOTR', tokens: Math.min(have, 2_000_000), maxSlip: 0.5 });
      }
      return;
    }
    case 'sniper': {
      // buy a small amount on each token that is two ticks old, then sell into the first 40% or after 120 ticks
      for (const t of live) {
        if (st.sniped.has(t.ticker) || tick - t.createdTick < 2 || tick - t.createdTick > 60) continue;
        st.sniped.add(t.ticker);
        const r = applyCommand(g, bot.id, { type: 'lp.buy', ticker: t.ticker, spendCents: 20_000, maxSlip: 0.2 });
        if (r.ok) st.snipeEntry[t.ticker] = { tick, tokens: (r.data as { tokens: number }).tokens, entry: (r.data as { avgPrice: number }).avgPrice };
      }
      for (const [ticker, e] of Object.entries(st.snipeEntry)) {
        const t = s?.tokens[ticker];
        if (!t || t.status !== 'live') { delete st.snipeEntry[ticker]; continue; }
        if (spotAt(t.y) >= e.entry * 1.4 || tick - e.tick >= 120) {
          const have = t.bal[bot.id] ?? 0;
          if (have > 0) applyCommand(g, bot.id, { type: 'lp.sell', ticker, tokens: have, maxSlip: 0.5 });
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
        const r = applyCommand(g, bot.id, { type: 'lp.buy', ticker: t.ticker, spendCents: 100_000, maxSlip: 0.3 });
        if (r.ok) st.flipEntry[t.ticker] = { tick, qty: 0, entry: spotAt(t.y) };
      }
      for (const t of tokens) {
        if (t.status !== 'graduated' || !st.flipEntry[t.ticker]) continue;
        const pos = enginePos(g, bot.id, t.ticker);
        const e = st.flipEntry[t.ticker]!;
        const px = Math.exp(g.market.assets[g.market.config.assets.findIndex((a) => a.id === t.ticker)]!.lnP);
        if (pos > 0 && (px >= e.entry * 1.05 || tick - e.tick >= 2 * TPD)) {
          applyCommand(g, bot.id, { type: 'order.place', order: { assetId: t.ticker, side: 'sell', type: 'market', qty: pos } });
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
      applyCommand(g, bot.id, { type: 'lp.buzz', ticker: t.ticker, kind: 'wire' });
      applyCommand(g, bot.id, { type: 'lp.buy', ticker: t.ticker, spendCents: 50_000, maxSlip: 0.3 });
      return;
    }
    case 'pumpSeller': {
      // small stakes ($150) in fresh tokens (under two game days old, at most four stakes at once); each stake is sold into any pump
      // (the price 5% above its level at the last decision), or after three game days
      for (const t of live) {
        if (Object.keys(st.pump).length >= 4) break;
        if (st.pumpSeen.has(t.ticker) || tick - t.createdTick > 2 * TPD) continue;
        st.pumpSeen.add(t.ticker);
        const r = applyCommand(g, bot.id, { type: 'lp.buy', ticker: t.ticker, spendCents: 15_000, maxSlip: 0.1 });
        if (r.ok) st.pump[t.ticker] = { tick, last: spotAt(t.y) };
      }
      for (const [ticker, e] of Object.entries(st.pump)) {
        const t = s?.tokens[ticker];
        if (!t) { delete st.pump[ticker]; continue; }
        if (t.status === 'graduated') { sellEngine(g, bot.id, ticker); delete st.pump[ticker]; continue; }
        const have = t.bal[bot.id] ?? 0;
        if (t.status !== 'live' || have <= 0) { delete st.pump[ticker]; continue; }
        const px = spotAt(t.y);
        if (px >= e.last * 1.05 || tick - e.tick >= 3 * TPD) {
          applyCommand(g, bot.id, { type: 'lp.sell', ticker, tokens: have, maxSlip: 0.5 });
          delete st.pump[ticker];
        } else {
          e.last = px;
        }
      }
      return;
    }
    case 'idle':
      return;
    case 'retail': {
      if (rng.uniform() > 0.2) return;
      if (rng.uniform() < 0.6 && live.length > 0) {
        const t = live[Math.floor(rng.uniform() * live.length)]!;
        applyCommand(g, bot.id, { type: 'lp.buy', ticker: t.ticker, spendCents: 20_000 + Math.round(rng.uniform() * 60_000), maxSlip: 0.1 });
      } else {
        const held = tokens.filter((t) => (t.bal[bot.id] ?? 0) > 0);
        if (held.length > 0) {
          const t = held[Math.floor(rng.uniform() * held.length)]!;
          applyCommand(g, bot.id, { type: 'lp.sell', ticker: t.ticker, tokens: Math.max(1, Math.floor((t.bal[bot.id] ?? 0) * 0.5)), maxSlip: 0.1 });
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
function tickDecide(g: GameState, bot: Bot, st: BotState): void {
  const s = g.launchpad;
  if (!s) return;
  const tick = g.market.tick;
  if (bot.kind === 'viralChaser') {
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
      const r = applyCommand(g, bot.id, { type: 'lp.buy', ticker, spendCents: 30_000, maxSlip: 0.1 });
      if (r.ok) st.snipeEntry[ticker] = { tick, tokens: (r.data as { tokens: number }).tokens, entry: (r.data as { avgPrice: number }).avgPrice };
    }
    for (const [ticker, e] of Object.entries(st.snipeEntry)) {
      const t = s.tokens[ticker];
      if (!t) { delete st.snipeEntry[ticker]; continue; }
      if (t.status === 'graduated') { sellEngine(g, bot.id, ticker); delete st.snipeEntry[ticker]; continue; }
      if (t.status !== 'live') { delete st.snipeEntry[ticker]; continue; }
      const px = spotAt(t.y);
      if (px <= e.entry * 0.9 || px >= e.entry * 1.5 || tick - e.tick >= 2 * TPD) {
        const have = t.bal[bot.id] ?? 0;
        if (have > 0) applyCommand(g, bot.id, { type: 'lp.sell', ticker, tokens: have, maxSlip: 0.5 });
        delete st.snipeEntry[ticker];
      }
    }
    return;
  }
  if (bot.kind === 'frontRunner') {
    // buys on the tick a launch appears (after the tick's launches and their sniper entry), and sells everything two ticks after it
    for (const ticker of s.order) {
      const t = s.tokens[ticker];
      if (!t || t.status !== 'live' || st.sniped.has(ticker) || tick - t.createdTick !== 0) continue;
      st.sniped.add(ticker);
      const r = applyCommand(g, bot.id, { type: 'lp.buy', ticker, spendCents: 200_000, maxSlip: 0.2 });
      if (r.ok) st.snipeEntry[ticker] = { tick, tokens: (r.data as { tokens: number }).tokens, entry: (r.data as { avgPrice: number }).avgPrice };
    }
    for (const [ticker] of Object.entries(st.snipeEntry)) {
      const t = s.tokens[ticker];
      if (!t) { delete st.snipeEntry[ticker]; continue; }
      if (t.status !== 'live') { delete st.snipeEntry[ticker]; continue; }
      if (tick - t.createdTick >= 2) {
        const have = t.bal[bot.id] ?? 0;
        if (have > 0) applyCommand(g, bot.id, { type: 'lp.sell', ticker, tokens: have, maxSlip: 0.5 });
        delete st.snipeEntry[ticker];
      }
    }
    return;
  }
  if (bot.kind === 'postGradBuyer') {
    for (const ticker of s.order) {
      const t = s.tokens[ticker];
      if (!t || t.status !== 'graduated' || t.gradTick === undefined || st.postSeen.has(ticker)) continue;
      if (tick - t.gradTick > POST_WINDOW_TICKS) continue;
      st.postSeen.add(ticker);
      const idx = g.market.config.assets.findIndex((a) => a.id === ticker);
      const px = Math.exp(g.market.assets[idx]!.lnP);
      const qty = Math.floor(POST_STAKE / px);
      if (qty <= 0) continue;
      const r = applyCommand(g, bot.id, { type: 'order.place', order: { assetId: ticker, side: 'buy', type: 'market', qty } });
      if (r.ok) st.post[ticker] = { tick };
    }
    for (const [ticker, e] of Object.entries(st.post)) {
      if (tick - e.tick < POST_HOLD_TICKS) continue;
      sellEngine(g, bot.id, ticker);
      delete st.post[ticker];
    }
  }
}

function runSeed(seed: string) {
  const g = newWorld(seed);
  const startTick = g.market.tick;
  const rngs: Record<string, Rng> = {};
  const states: Record<string, BotState> = {};
  for (const b of BOTS) {
    rngs[b.id] = new Rng(seedStream(seed, `bot:${b.id}`));
    states[b.id] = newState();
  }
  const nw0: Record<string, number> = {};
  const cash0: Record<string, number> = {};
  for (const b of BOTS) {
    nw0[b.id] = netWorthBreakdown(g, b.id).total;
    cash0[b.id] = g.market.accounts[b.id]?.cash ?? 0;
  }
  let idleDrift = 0;
  const gx0 = indexLevel(g.market, 'GX');
  // the 10x check (L8): a graduated token reaches ten times its graduation price within 30 game days of graduating; sampled every tick
  const tenXSeen: Record<string, boolean> = {};
  let residualMax = 0;
  let money = netWorldMoney(g);
  let booked = bookedNet(g);
  let tally = engineTallyOf(g);
  const totalTicks = days * TPD;
  for (let k = 0; k < totalTicks; k++) {
    if (k % DECIDE_EVERY === 0) {
      for (const b of BOTS) if (!TICK_KINDS.has(b.kind)) decide(g, b, states[b.id]!, rngs[b.id]!, startTick);
    }
    stepGame(g);
    for (const b of BOTS) if (TICK_KINDS.has(b.kind)) tickDecide(g, b, states[b.id]!);
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
      money = m; booked = bk; tally = et;
    }
  }
  if (process.argv.includes('--dbg')) {
    const rid = BOTS.find((b) => b.kind === 'retail')!.id;
    const pos = Object.entries(g.market.accounts[rid]?.positions ?? {}).filter(([, p]) => p.qty !== 0).map(([id, p]) => `${id}:${p.qty.toFixed(0)}@${p.avgCost.toFixed(6)} mid ${Math.exp(g.market.assets[g.market.config.assets.findIndex((x) => x.id === id)]?.lnP ?? 0).toFixed(6)}`);
    const held = Object.values(g.launchpad?.tokens ?? {}).filter((t) => (t.bal[rid] ?? 0) > 0).map((t) => `${t.ticker}:${t.status}:${t.bal[rid]}`);
    console.error('retail cash', g.market.accounts[rid]?.cash, 'positions', JSON.stringify(pos), 'curveHeld', JSON.stringify(held), 'nw0', nw0[rid], 'nw1', netWorthBreakdown(g, rid).total);
  }
  const gx1 = indexLevel(g.market, 'GX');
  const bh = gx1 / gx0 - 1;
  const returns: Record<string, number> = {};
  const raw: Record<string, number> = {};
  for (const b of BOTS) {
    const nw1 = netWorthBreakdown(g, b.id).total;
    if (b.kind === 'idle') idleDrift = nw1 - nw0[b.id]! - ((g.market.accounts[b.id]?.cash ?? 0) - cash0[b.id]!);
    raw[b.kind] = (nw1 - nw0[b.id]!) / nw0[b.id]!;
    returns[b.kind] = raw[b.kind]! - bh;
  }
  // the L6 shape over the world's launches. A launch is observed when the run lasted 10 game days after it (the latest death is
  // day 10 of a launch after day 3), so the end of the run does not censor the cohort; the shares are over observed launches.
  const end = g.market.tick;
  const toks = Object.values(g.launchpad?.tokens ?? {});
  const observed = toks.filter((t) => t.createdTick <= end - 10 * TPD);
  const launches = observed.length;
  // the death share is over the launches from day 3 on: the cash rule (L3) cannot kill a day-0-to-2 launch before day 10, so those
  // are reported beside it (deadWithin7dDay0to2Reported) for the lead's ruling, not gated
  const cohort = observed.filter((t) => t.createdTick >= LP.DEAD_CASH_START_TICK);
  const cohortLaunches = cohort.length;
  let deadWithin7 = 0;
  for (const t of cohort) {
    if (t.status === 'dead' && t.deadTick !== undefined && t.deadTick - t.createdTick <= 7 * TPD) deadWithin7++;
  }
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
  // --diag: each token's death, graduation and flows (where its cash came from), for tuning (V1-PHASE5.md)
  const diag = process.argv.includes('--diag')
    ? observed.map((t) => ({
      ticker: t.ticker, creator: t.creatorId !== null, deadReason: t.deadReason ?? null,
      deadDay: t.deadTick !== undefined ? +((t.deadTick - t.createdTick) / TPD).toFixed(2) : null,
      grad: t.gradTick !== undefined, flows: t.flows, peakBuzz: +(t.buzz.base + t.buzz.board + t.buzz.wire).toFixed(3),
    }))
    : undefined;
  // the NPC cohort's net over a token's life (the L6.1 gate): its curve buys less the NPC's own 1% buy fee (booked on the npcRetail
  // line), less its gross sells, less the liquidation value of what it still holds on a live curve. A graduated token counts once it has
  // had ten game days to unwind (its last share is 0.1%). Dead tokens are flat in tokens (liquidated at death), so they need no mark.
  let npcLife = 0;
  let npcLifeN = 0;
  for (const t of observed) {
    if (t.status === 'graduated' && (t.gradTick ?? end) > end - 10 * TPD) continue;
    const inv = t.status === 'live' && t.npcBal > 0 ? quoteSell(t.y, t.npcBal) : null;
    npcLife += 0.99 * t.flows.npcBuy - t.flows.npcSell - (inv && inv.ok ? inv.netCents / 100 : 0);
    npcLifeN++;
  }
  return {
    seed, launches, cohortLaunches, deadWithin7, deadWithin7Early, graduated, tenX, residualMax, allLaunches: toks.length, diag,
    npcLife, npcLifeN,
    idleDrift,
    excess: returns, raw, gx: bh, npcRetail: g.economy.faucets.npcRetail ?? 0,
    // the NPC cohort's cash net over the world: buys in (the npcRetail faucet) less sells out (the npcRetail sink)
    npcNet: (g.economy.faucets.npcRetail ?? 0) - (g.economy.sinks.npcRetail ?? 0),
    lpTotals: g.launchpad?.totals ?? null, npcLaunches: g.launchpad?.npcSeq ?? 0,
  };
}

const seeds = Array.from({ length: nSeeds }, (_, i) => `${prefix}-${String(firstSeed + i).padStart(2, '0')}`);
const per: ReturnType<typeof runSeed>[] = [];
for (const s of seeds) {
  per.push(runSeed(s));
  console.error(`seed ${s} done`);
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };
const strategies = Object.fromEntries(STRATEGY_KINDS.map((k) => {
  const xs = per.map((r) => r.excess[k]!);
  const se = sd(xs) / Math.sqrt(xs.length);
  const oneSided95 = mean(xs) + 1.645 * se;
  return [k, { meanExcess: mean(xs), oneSided95, pass: oneSided95 <= 0, meanReturn: mean(per.map((r) => r.raw[k]!)) }];
}));
const totalLaunches = per.reduce((a, r) => a + r.launches, 0);
const cohortTotal = per.reduce((a, r) => a + r.cohortLaunches, 0);
const dead7 = per.reduce((a, r) => a + r.deadWithin7, 0) / Math.max(1, cohortTotal);
const dead7Early = per.reduce((a, r) => a + r.deadWithin7Early, 0) / Math.max(1, totalLaunches - cohortTotal);
const grad = per.reduce((a, r) => a + r.graduated, 0) / Math.max(1, totalLaunches);
const tenX = per.reduce((a, r) => a + r.tenX, 0) / Math.max(1, totalLaunches);
const residual = Math.max(...per.map((r) => r.residualMax));
// the idle control: its net worth moves only with its cash (deposit interest included), to the cent on every seed: no valuation drift
const idleZeroOk = per.every((r) => Math.abs(r.idleDrift) < 1e-9);
// the NPC side: its life net per launched token must be <= 0 on average (L6.1, players do not drain it and it does not inflate)
const npcNetBooked = per.reduce((a, r) => a + r.npcNet, 0) / Math.max(1, per.reduce((a, r) => a + r.allLaunches, 0));
const npcNetPerToken = per.reduce((a, r) => a + r.npcLife, 0) / Math.max(1, per.reduce((a, r) => a + r.npcLifeN, 0));
const npcOk = npcNetPerToken <= 0;
const shape = {
  deadWithin7dFromDay3: dead7, deadWithin7dDay0to2Reported: dead7Early, graduationRate: grad, tenXRate: tenX,
  deadOk: dead7 >= 0.7, gradOk: grad >= 0.01 && grad <= 0.05, tenXOk: tenX <= 0.005,
  idleZeroOk, npcNetPerToken, npcNetBookedPerToken: npcNetBooked, npcOk,
};
const gate = Object.values(strategies).every((s) => s.pass) && shape.deadOk && shape.gradOk && shape.tenXOk && residual < 0.005 && idleZeroOk && npcOk;
const gxMean = mean(per.map((r) => r.gx));
const summary = { prefix, seeds: seeds.length, days, launches: totalLaunches, gxMean, strategies, shape, residualMax: residual, gate, NPC, perSeed: per };

mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ prefix, seeds: seeds.length, days, launches: totalLaunches, strategies, shape, residualMax: residual, gate }, null, 2));
void curveAccountId; void LP;
process.exit(gate ? 0 : 1);
