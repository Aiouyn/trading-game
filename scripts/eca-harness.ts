// ECA and insider-tip harness (lead-phase6.md 6C, ROADMAP M16 v2, 03 §16).
// Runs the real engine (createGame, applyCommand, stepGame) across seeds with five kinds of trader, eight of each:
//   honest  follows the public analyst consensus on each report, on half the days at a small size: a legal edge, no tips;
//   heavy   the same as honest at three times the size and on most days: the pattern trader the ECA must not convict;
//   lucky   trades at random, sometimes large: variance with no information;
//   tip     honest's trading, plus a successful hidden session on a company insider every ten game days. The crime step is
//           shortcut (the pending tip that queueInsiderTip would push); the tip is then traded in three tranches, one a day, at
//           a random size around the base (ECA_TIP_MULT of 4% of net worth, ±50%);
//   rumor   follows the engine's public rumor on each report (never flagged): the blind rumor-following gate.
// Everything after the crime step is the real code: delivery at the surprise lock, the flag at placement, the ECA score, the
// inquiry and investigation, the tribunal-lite, the fine, the disgorgement and the season cap.
// Reports every 12 game days in this harness (the production cadence is 63), so a 60-day season holds several per stock.
//
// Usage: npx tsx scripts/eca-harness.ts [--seeds 20] [--days 60] [--first 0] [--out <dir>]
// Env: ECA_TIP_MULT (default 1), ECA_TRANCHES (default 3), ECA_CRIME_DAYS (default 10: a successful session every this many days). Prints one JSON summary. Same args => same output (seeded).
// The gates (03 §16, quant-rumors, lead-phase6 6C):
//   tip EV / honest EV in [0.8, 1.2]; tip variance / honest variance in [2, 4];
//   wrongful convictions (accounts that never received a tip) under 3% of all convictions;
//   blind rumor-following mean return at or below 0 after fees;
//   conviction rate of the tip traders that reach the tribunal in [40%, 65%].

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_CATALYSTS, earningsInfo } from '../src/engine';
import { applyCommand, createGame, stepGame } from '../src/world/game';
import { credit, netWorthBreakdown, priceOf, TPD } from '../src/world/core';
import { SEVERITY } from '../src/world/court-scale';
import { receivedTip, tipsOf } from '../src/world/tips';
import { ecaOf } from '../src/world/eca';
import { Rng, seedStream } from '../src/engine/rng';
import type { GameState } from '../src/world/types';

type Kind = 'honest' | 'heavy' | 'lucky' | 'tip' | 'rumor';
const KINDS: Kind[] = ['honest', 'heavy', 'lucky', 'tip', 'rumor'];
const PER_KIND = 8;
const START_CASH = 20_000;
const CRIME_EVERY_DAYS = Number(process.env.ECA_CRIME_DAYS ?? 10);
const TRANCHES = Number(process.env.ECA_TRANCHES ?? 3);
// a SENSITIVITY knob, not a rule: ECA_FLOOR0=1 drops the S5 $100k floor in this process only (fine = 8% of net worth, at most
// 35%). It answers the question ROADMAP 2.5 leaves to Tape (the small-book S5 rule); production court.ts keeps the floor.
if (process.env.ECA_FLOOR0) SEVERITY[4]!.floor = 0;
const TIP_MULT = Number(process.env.ECA_TIP_MULT ?? 1);

function arg(name: string, def: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
}

const SEEDS = arg('seeds', 20);
const DAYS = arg('days', 60);
const FIRST = arg('first', 0);
const OUT = (() => {
  const i = process.argv.indexOf('--out');
  return i >= 0 ? process.argv[i + 1]! : '';
})();

function playerIds(): Record<Kind, string[]> {
  const out = { honest: [], heavy: [], lucky: [], tip: [], rumor: [] } as Record<Kind, string[]>;
  for (const k of KINDS) for (let i = 0; i < PER_KIND; i++) out[k].push(`${k}${i}`);
  return out;
}

interface KindCount {
  inquiries: number;
  tribunal: number;
  convicted: number;
  wrongful: number;
  fines: number;
  disgorged: number;
}

interface SeedResult {
  seed: string;
  ret: Record<Kind, number[]>;
  counts: Record<Kind, KindCount>;
  tipsDelivered: number;
  tipFlags: number;
  rumorFills: number;
}

function emptyCount(): KindCount {
  return { inquiries: 0, tribunal: 0, convicted: 0, wrongful: 0, fines: 0, disgorged: 0 };
}

function runSeed(seed: string): SeedResult {
  const cfg = { catalysts: { ...DEFAULT_CATALYSTS, rumorProb: 0.32, rumorAccuracy: 0.55, everyDays: 12, jitterDays: 2 } };
  const g: GameState = createGame(seed, { warmupDays: 1, npcs: false, config: cfg });
  const ids = playerIds();
  const all = KINDS.flatMap((k) => ids[k]);
  for (const id of all) {
    applyCommand(g, id, { type: 'join', handle: `t_${id}`, country: 'AV' });
    credit(g, id, START_CASH, 'harness');
  }
  const start = new Map(all.map((id) => [id, netWorthBreakdown(g, id).total]));
  const stocks = g.market.config.assets.filter((a) => a.assetClass === 'stock').map((a) => a.id);
  const rng = new Rng(seedStream(seed, 'harness'));
  const lastCrime = new Map<string, number>();
  const tipLeft = new Map<string, number>();
  const tipSize = new Map<string, number>();
  let rumorFills = 0;
  // the public consensus and rumor for the stock's next report (the harness's own view of the world)
  const info = (a: string) => earningsInfo(g.market, a);
  const notional = (id: string, mult = 1) => Math.max(START_CASH * 0.04, netWorthBreakdown(g, id).total * 0.04) * mult;
  for (let d = 0; d < DAYS; d++) {
    const dayTick = g.market.tick;
    // honest and tip: follow the public consensus on a stock with one, at a small size, on half the days
    for (const id of [...ids.honest, ...ids.tip]) {
      const a = stocks[Math.floor(rng.uniform() * stocks.length)]!;
      const e = info(a);
      if (!e || e.consensus === null || Math.abs(e.consensus) < 0.2) continue;
      if (rng.uniform() > 0.5) continue;
      order(g, id, a, e.consensus > 0 ? 'buy' : 'sell', notional(id));
    }
    // heavy: the same signal at three times the size, on most days
    for (const id of ids.heavy) {
      const a = stocks[Math.floor(rng.uniform() * stocks.length)]!;
      const e = info(a);
      if (!e || e.consensus === null || Math.abs(e.consensus) < 0.2) continue;
      if (rng.uniform() > 0.8) continue;
      order(g, id, a, e.consensus > 0 ? 'buy' : 'sell', notional(id, 3));
    }
    // lucky: random side, random (sometimes large) size, any stock, now and then
    for (const id of ids.lucky) {
      if (rng.uniform() > 0.2) continue;
      const a = stocks[Math.floor(rng.uniform() * stocks.length)]!;
      const size = notional(id) * (rng.uniform() < 0.2 ? 6 : 1) * (0.5 + rng.uniform());
      order(g, id, a, rng.uniform() < 0.5 ? 'buy' : 'sell', size);
    }
    // tip: a successful session on an insider every ten game days (the crime step, shortcut: the pending tip)
    for (const id of ids.tip) {
      const last = lastCrime.get(id) ?? -CRIME_EVERY_DAYS * TPD;
      if (dayTick - last >= CRIME_EVERY_DAYS * TPD) {
        const a = stocks[Math.floor(rng.uniform() * stocks.length)]!;
        const t = tipsOf(g);
        t.seq++;
        t.pending.push({ id: `pt${t.seq}`, playerId: id, assetId: a, companyId: 'harness', tick: dayTick });
        lastCrime.set(id, dayTick);
      }
    }
    // a tip is traded in tranches, one a game day for TRANCHES days from the day it arrives (scaling in, the usual pattern)
    for (const t of tipsOf(g).tips) {
      if (!ids.tip.includes(t.playerId) || g.market.tick >= t.revealsTick) continue;
      const left = tipLeft.get(t.id) ?? TRANCHES;
      if (left <= 0) continue;
      tipLeft.set(t.id, left - 1);
      if (!tipSize.has(t.id)) tipSize.set(t.id, TIP_MULT * (0.5 + rng.uniform()));
      order(g, t.playerId, t.assetId, t.claim === 'up' ? 'buy' : 'sell', notional(t.playerId, tipSize.get(t.id)!));
    }
    // rumor: the engine's public rumor for the next report, followed blindly
    for (const id of ids.rumor) {
      const a = stocks[Math.floor(rng.uniform() * stocks.length)]!;
      const e = info(a);
      if (!e || e.rumor === null) continue;
      if (order(g, id, a, e.rumor > 0 ? 'buy' : 'sell', notional(id))) rumorFills++;
    }
    // one game day of the market
    for (let k = 0; k < TPD; k++) stepGame(g);
  }
  // results
  const ret: Record<Kind, number[]> = { honest: [], heavy: [], lucky: [], tip: [], rumor: [] };
  for (const k of KINDS) for (const id of ids[k]) ret[k].push((netWorthBreakdown(g, id).total - start.get(id)!) / start.get(id)!);
  const counts = Object.fromEntries(KINDS.map((k) => [k, emptyCount()])) as Record<Kind, KindCount>;
  const kindOf = (pid: string): Kind => KINDS.find((k) => ids[k].includes(pid))!;
  for (const q of Object.values(ecaOf(g).inquiries)) {
    const c = counts[kindOf(q.playerId)];
    c.inquiries++;
    if (q.stage === 'convicted' || q.stage === 'cleared') c.tribunal++;
    if (q.stage === 'convicted') {
      c.convicted++;
      // wrongful: the account never received a tip on the asset (the regulator had no tip trail to find)
      if (!receivedTip(g, q.playerId, q.assetId)) c.wrongful++;
      c.fines += q.fine ?? 0;
      c.disgorged += q.disgorged ?? 0;
    }
  }
  return { seed, ret, counts, tipsDelivered: tipsOf(g).tips.length, tipFlags: (g.tips?.flags ?? []).length, rumorFills };
}

function order(g: GameState, id: string, assetId: string, side: 'buy' | 'sell', notionalUsd: number): boolean {
  const price = priceOf(g, assetId);
  const qty = Math.floor(notionalUsd / Math.max(1e-6, price));
  if (qty < 1) return false;
  const r = applyCommand(g, id, { type: 'order.place', order: { assetId, side, type: 'market', qty } });
  return r.ok;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}
function sd(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(xs.length ? xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length : 0);
}

const results: SeedResult[] = [];
for (let i = FIRST; i < FIRST + SEEDS; i++) {
  results.push(runSeed(`eca-h${i}`));
}

// per kind: the mean return per trader-season, its spread, and the regulator's counts
const summary: Record<string, unknown> = { seeds: SEEDS, days: DAYS, first: FIRST, perKind: PER_KIND, tipMult: TIP_MULT, tranches: TRANCHES };
const perKind: Record<string, Record<string, number>> = {};
for (const k of KINDS) {
  const rets = results.flatMap((r) => r.ret[k]);
  const sum = (f: (c: KindCount) => number) => results.reduce((s, r) => s + f(r.counts[k]), 0);
  perKind[k] = {
    meanRet: mean(rets),
    sdRet: sd(rets),
    playerSeasons: rets.length,
    inquiries: sum((c) => c.inquiries),
    tribunal: sum((c) => c.tribunal),
    convicted: sum((c) => c.convicted),
    wrongful: sum((c) => c.wrongful),
    fines: sum((c) => c.fines),
    disgorged: sum((c) => c.disgorged),
  };
}
summary.perKind = perKind;
const honest = perKind.honest!;
const tip = perKind.tip!;
summary.tipEvRatioVsHonest = honest.meanRet !== 0 ? tip.meanRet / honest.meanRet : null;
summary.tipVarRatioVsHonest = honest.sdRet > 0 ? (tip.sdRet / honest.sdRet) ** 2 : null;
summary.rumorMeanRet = perKind.rumor!.meanRet;
const totalConvicted = KINDS.reduce((s, k) => s + perKind[k]!.convicted!, 0);
const wrongful = KINDS.reduce((s, k) => s + perKind[k]!.wrongful!, 0);
summary.totalConvicted = totalConvicted;
summary.wrongful = wrongful;
summary.wrongfulRate = totalConvicted ? wrongful / totalConvicted : 0;
summary.tipConvictRateAtTribunal = tip.tribunal ? tip.convicted! / tip.tribunal! : null;
summary.tipsDelivered = results.reduce((s, r) => s + r.tipsDelivered, 0);
summary.tipFlags = results.reduce((s, r) => s + r.tipFlags, 0);
summary.perSeed = results;
const json = JSON.stringify(summary, null, 2);
if (OUT) {
  mkdirSync(path.resolve(OUT), { recursive: true });
  writeFileSync(path.join(path.resolve(OUT), `eca-harness-${FIRST}-${FIRST + SEEDS - 1}.json`), json + '\n');
}
process.stdout.write(json + '\n');
