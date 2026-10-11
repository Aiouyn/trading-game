// Launchpad balance gate (lead-launchpad.md L8, V1-PHASE5).
// Usage: npx tsx scripts/balance/launchpad.ts [--seeds 50] [--days 30] [--first 1] [--out balance-out/launchpad.json]
// Each seed is a world with world launches at the realistic rate (about 20 a game day) and five bot strategies on their own
// accounts: creator-dump, sniper, graduation flipper, buzz pumper and a random retail player. Each bot starts with the same cash
// and is compared with buy-and-hold of the GX index over the same horizon. The gate: for every strategy, the mean excess return
// over buy-and-hold is <= 0 at one-sided 95% (over seeds); the L6 shape holds (dead within 7 game days, graduation rate, 10x
// rate); and the world money identity closes to the cent every game day with the booked lines.
// Exit code 1 when a gate fails. Same args => same output.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Rng, seedStream, indexLevel } from '../../src/engine';
import { applyCommand, createGame, stepGame } from '../../src/world/game';
import { credit, netWorthBreakdown, TPD } from '../../src/world/core';
import { bookedNet, engineTallyOf, netWorldMoney } from '../../src/world/company/exploits/sequences';
import { LP, curveAccountId } from '../../src/world/launchpad/constants';
import { curveProgress, quoteSell, spotAt } from '../../src/world/launchpad/curve';
import { NPC } from '../../src/world/launchpad/constants';
import type { Command, GameState } from '../../src/world/types';
import type { LpToken } from '../../src/world/launchpad/types';

function arg(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const nSeeds = Number(arg('seeds', '50'));
const days = Number(arg('days', '30'));
const firstSeed = Number(arg('first', '1'));
const outPath = arg('out', 'balance-out/launchpad.json');
// tuning (lead-launchpad.md L6.3): --npc '{"DEMAND_PER_BUZZ":1000}' overrides the L6 constants of NPC for this run only; the summary records them
const npcOverride = JSON.parse(arg('npc', '{}')) as Partial<typeof NPC>;
Object.assign(NPC, npcOverride);
const START_CASH = 20_000;
const DECIDE_EVERY = 60;

type Bot = { id: string; handle: string; kind: 'creatorDump' | 'sniper' | 'flipper' | 'buzzPumper' | 'retail' | 'idle' };
const BOTS: Bot[] = [
  { id: 'bot_creator', handle: 'bot_creator', kind: 'creatorDump' },
  { id: 'bot_sniper', handle: 'bot_sniper', kind: 'sniper' },
  { id: 'bot_flipper', handle: 'bot_flipper', kind: 'flipper' },
  { id: 'bot_buzz', handle: 'bot_buzz', kind: 'buzzPumper' },
  { id: 'bot_retail', handle: 'bot_retail', kind: 'retail' },
  // the idle control (L8.1): never trades; its raw return must be zero to the cent (the valuation and the cash are exact)
  { id: 'bot_idle', handle: 'bot_idle', kind: 'idle' },
];
/** the five strategies the gate passes or fails (the idle control is checked for a zero raw return instead) */
const STRATEGY_KINDS = ['creatorDump', 'sniper', 'flipper', 'buzzPumper', 'retail'] as const;

interface BotState {
  launched: boolean;
  sniped: Set<string>;
  snipeEntry: Record<string, { tick: number; tokens: number; entry: number }>;
  flipped: Set<string>;
  flipEntry: Record<string, { tick: number; qty: number; entry: number }>;
  dumpedDay: number;
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

/** A bot's decision at a tick: the strategy's own rule, through the real commands. */
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
        const pos = g.market.accounts[bot.id]?.positions[t.ticker]?.qty ?? 0;
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
  }
}

function runSeed(seed: string) {
  const g = newWorld(seed);
  const startTick = g.market.tick;
  const rngs: Record<string, Rng> = {};
  const states: Record<string, BotState> = {};
  for (const b of BOTS) {
    rngs[b.id] = new Rng(seedStream(seed, `bot:${b.id}`));
    states[b.id] = { launched: false, sniped: new Set(), snipeEntry: {}, flipped: new Set(), flipEntry: {}, dumpedDay: -1 };
  }
  const nw0: Record<string, number> = {};
  const cash0: Record<string, number> = {};
  for (const b of BOTS) {
    nw0[b.id] = netWorthBreakdown(g, b.id).total;
    cash0[b.id] = g.market.accounts[b.id]?.cash ?? 0;
  }
  let idleDrift = 0;
  const gx0 = indexLevel(g.market, 'GX');
  const maxPx: Record<string, number> = {};
  let residualMax = 0;
  let money = netWorldMoney(g);
  let booked = bookedNet(g);
  let tally = engineTallyOf(g);
  const totalTicks = days * TPD;
  for (let k = 0; k < totalTicks; k++) {
    if (k % DECIDE_EVERY === 0) {
      for (const b of BOTS) decide(g, b, states[b.id]!, rngs[b.id]!, startTick);
    }
    stepGame(g);
    if (g.market.tick % TPD === 0 || k === totalTicks - 1) {
      const m = netWorldMoney(g);
      const bk = bookedNet(g);
      const et = engineTallyOf(g);
      residualMax = Math.max(residualMax, Math.abs((m - money) - (bk - booked) - (et - tally)));
      money = m; booked = bk; tally = et;
      for (const t of Object.values(g.launchpad?.tokens ?? {})) {
        if (t.status !== 'graduated') continue;
        const idx = g.market.config.assets.findIndex((a) => a.id === t.ticker);
        if (idx < 0) continue;
        const px = Math.exp(g.market.assets[idx]!.lnP);
        maxPx[t.ticker] = Math.max(maxPx[t.ticker] ?? 0, px / (t.gradPrice ?? px));
      }
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
  // are reported beside it (cohort0to2) for the lead's ruling, not gated
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
    if ((maxPx[t.ticker] ?? 0) >= 10) tenX++;
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
    // the NPC cohort's cash net over the world: buys in (the npcRetail faucet) less sells out (the npcRetail sink); L6.1 needs it <= 0 on average
    npcNet: (g.economy.faucets.npcRetail ?? 0) - (g.economy.sinks.npcRetail ?? 0),
    lpTotals: g.launchpad?.totals ?? null, npcLaunches: g.launchpad?.npcSeq ?? 0,
  };
}

const seeds = Array.from({ length: nSeeds }, (_, i) => `lp-${String(firstSeed + i).padStart(2, '0')}`);
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
// (the interest is cash, so a raw zero return is not the test; the test is that nothing but cash enters its net worth)
const idleZeroOk = per.every((r) => Math.abs(r.idleDrift) < 1e-9);
// the NPC side: its cash net over the world, per launched token, must be <= 0 on average (L6.1, players do not drain it and it does not inflate)
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
const summary = { seeds: seeds.length, days, launches: totalLaunches, gxMean, strategies, shape, residualMax: residual, gate, NPC, perSeed: per };

mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ seeds: seeds.length, days, launches: totalLaunches, strategies, shape, residualMax: residual, gate }, null, 2));
void curveAccountId; void LP;
process.exit(gate ? 0 : 1);
