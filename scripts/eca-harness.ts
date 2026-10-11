// ECA and insider-tip harness (lead-phase6.md 6C, ROADMAP M16 v2, 03 §16).
// Runs the real engine (createGame, applyCommand, stepGame) across seeds with four kinds of trader:
//   honest  follows the public analyst consensus (published five game days before a report): a legal edge, no tips;
//   lucky   trades at random, sometimes large: variance with no information;
//   tip     the same as honest, plus a successful hidden session on a company insider each few game days, which queues an
//           insider tip (tips.ts) that the trader then trades on, on the claim's side, at a large size;
//   rumor   follows the engine's public rumor on each report (never flagged): the "blind rumor-following" gate.
// The crime step is shortcut: a successful session is simulated by pushing the pending tip that queueInsiderTip would push
// (the company listing is not built here). Everything after that is the real code: delivery at the surprise lock, the flag at
// placement, the ECA score, the inquiry and investigation, the tribunal-lite, the fine and the disgorgement.
// Reports are every 12 game days in this harness (the production cadence is 63), so a 60-day season holds several per stock.
//
// Usage: npx tsx scripts/eca-harness.ts [--seeds 20] [--days 60] [--first 0] [--out <dir>]
// Prints one JSON summary. Same args => same output (every draw is seeded).

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_CATALYSTS, earningsInfo } from '../src/engine';
import { applyCommand, createGame, stepGame } from '../src/world/game';
import { credit, netWorthBreakdown, priceOf, TPD } from '../src/world/core';
import { tipsOf } from '../src/world/tips';
import { ecaOf } from '../src/world/eca';
import { Rng, seedStream } from '../src/engine/rng';
import type { GameState } from '../src/world/types';

type Kind = 'honest' | 'lucky' | 'tip' | 'rumor';
const KINDS: Kind[] = ['honest', 'lucky', 'tip', 'rumor'];
const PER_KIND = 8;
const START_CASH = 20_000;
const CRIME_EVERY_DAYS = 10;
const TRANCHES = Number(process.env.ECA_TRANCHES ?? 3);
const TRANCHE_MULT = Number(process.env.ECA_TRANCHE_MULT ?? 2);

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
  const out = { honest: [], lucky: [], tip: [], rumor: [] } as Record<Kind, string[]>;
  for (const k of KINDS) for (let i = 0; i < PER_KIND; i++) out[k].push(`${k}${i}`);
  return out;
}

interface SeedResult {
  seed: string;
  ret: Record<Kind, number[]>;
  convicted: Record<Kind, number>;
  inquiries: number;
  investigations: number;
  wrongful: number;
  tipsDelivered: number;
  tipFlags: number;
  fines: number;
  disgorged: number;
  rumorFills: number;
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
  let rumorFills = 0;
  // the public consensus and rumor for the stock's next report (the harness's own view of the world)
  const info = (a: string) => earningsInfo(g.market, a);
  const notional = (id: string) => Math.max(START_CASH * 0.04, netWorthBreakdown(g, id).total * 0.04);
  for (let d = 0; d < DAYS; d++) {
    const dayTick = g.market.tick;
    // honest: follow the public consensus on each stock with one, at a small size
    for (const id of ids.honest) {
      const a = stocks[Math.floor(rng.uniform() * stocks.length)]!;
      const e = info(a);
      if (!e || e.consensus === null || Math.abs(e.consensus) < 0.2) continue;
      if (rng.uniform() > 0.5) continue;
      order(g, id, a, e.consensus > 0 ? 'buy' : 'sell', notional(id));
    }
    // lucky: random side, random (sometimes large) size, any stock, now and then
    for (const id of ids.lucky) {
      if (rng.uniform() > 0.2) continue;
      const a = stocks[Math.floor(rng.uniform() * stocks.length)]!;
      const size = notional(id) * (rng.uniform() < 0.2 ? 6 : 1) * (0.5 + rng.uniform());
      order(g, id, a, rng.uniform() < 0.5 ? 'buy' : 'sell', size);
    }
    // tip: a successful session on an insider every few game days (the crime step, shortcut: the pending tip), then trade it
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
      order(g, t.playerId, t.assetId, t.claim === 'up' ? 'buy' : 'sell', notional(t.playerId) * TRANCHE_MULT);
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
  const ret: Record<Kind, number[]> = { honest: [], lucky: [], tip: [], rumor: [] };
  for (const k of KINDS) for (const id of ids[k]) ret[k].push((netWorthBreakdown(g, id).total - start.get(id)!) / start.get(id)!);
  const eca = ecaOf(g);
  const inqs = Object.values(eca.inquiries);
  const convicted: Record<Kind, number> = { honest: 0, lucky: 0, tip: 0, rumor: 0 };
  let wrongful = 0;
  let fines = 0;
  let disgorged = 0;
  const flagged = new Set((g.tips?.flags ?? []).map((f) => `${f.playerId}|${f.assetId}`));
  for (const q of inqs) {
    if (q.stage !== 'convicted') continue;
    const kind = KINDS.find((k) => ids[k].includes(q.playerId))!;
    convicted[kind]++;
    if (!flagged.has(`${q.playerId}|${q.assetId}`)) wrongful++;
    fines += q.fine ?? 0;
    disgorged += q.disgorged ?? 0;
  }
  return {
    seed,
    ret,
    convicted,
    inquiries: inqs.length,
    investigations: inqs.filter((q) => q.stage === 'investigation' || q.stage === 'convicted' || q.stage === 'cleared').length,
    wrongful,
    tipsDelivered: tipsOf(g).tips.length,
    tipFlags: (g.tips?.flags ?? []).length,
    fines,
    disgorged,
    rumorFills,
  };
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

// per kind: the mean return per seed, the spread of each player's return, and the convictions
const summary: Record<string, unknown> = { seeds: SEEDS, days: DAYS, first: FIRST, perKind: PER_KIND };
const perKind: Record<string, { meanRet: number; sdRet: number; convictions: number; playerSeasons: number; convictRate: number }> = {};
for (const k of KINDS) {
  const rets = results.flatMap((r) => r.ret[k]);
  const conv = results.reduce((s, r) => s + r.convicted[k], 0);
  perKind[k] = { meanRet: mean(rets), sdRet: sd(rets), convictions: conv, playerSeasons: rets.length, convictRate: rets.length ? conv / rets.length : 0 };
}
summary.perKind = perKind;
const honestMean = perKind.honest!.meanRet;
const tipMean = perKind.tip!.meanRet;
summary.tipEvRatioVsHonest = honestMean !== 0 ? tipMean / honestMean : null;
summary.tipVarRatioVsHonest = perKind.honest!.sdRet > 0 ? (perKind.tip!.sdRet / perKind.honest!.sdRet) ** 2 : null;
summary.rumorMeanRet = perKind.rumor!.meanRet;
summary.lucky = { meanRet: perKind.lucky!.meanRet, sdRet: perKind.lucky!.sdRet };
const totalConvicted = results.reduce((s, r) => s + Object.values(r.convicted).reduce((a, b) => a + b, 0), 0);
const wrongful = results.reduce((s, r) => s + r.wrongful, 0);
summary.wrongfulRate = totalConvicted ? wrongful / totalConvicted : 0;
summary.wrongful = wrongful;
summary.totalConvicted = totalConvicted;
summary.inquiries = results.reduce((s, r) => s + r.inquiries, 0);
summary.investigations = results.reduce((s, r) => s + r.investigations, 0);
summary.tipsDelivered = results.reduce((s, r) => s + r.tipsDelivered, 0);
summary.tipFlags = results.reduce((s, r) => s + r.tipFlags, 0);
summary.fines = results.reduce((s, r) => s + r.fines, 0);
summary.disgorged = results.reduce((s, r) => s + r.disgorged, 0);
summary.perSeed = results;
const json = JSON.stringify(summary, null, 2);
if (OUT) {
  mkdirSync(path.resolve(OUT), { recursive: true });
  writeFileSync(path.join(path.resolve(OUT), `eca-harness-${FIRST}-${FIRST + SEEDS - 1}.json`), json + '\n');
}
process.stdout.write(json + '\n');
