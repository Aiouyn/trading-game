// ECA and insider-tip harness (lead-phase6.md 6C and its rulings R-6C-1 to R-6C-5; ROADMAP M16 v2; 03 §16).
// Runs the real engine (createGame, applyCommand, stepGame) across seeds with eight traders per arm:
//   honest   follows the public analyst consensus on half the days at 4% of net worth a trade (a legal edge, no tips);
//   heavy    the same signal at three times the size, on most days: a pattern trader the ECA must not convict;
//   lucky    trades at random, sometimes large: variance with no information;
//   tip2/4/6 honest's trading, plus a successful hidden session on a company insider every CRIME days. The crime step is shortcut
//            (the pending tip that queueInsiderTip would push). The tip is traded in TRANCHES tranches (one a game day) at
//            2%, 4% or 6% of net worth a tranche (±50%), and the tipped shares are sold back the day after the report;
//   honest2/4/6 (R-6C-6) the honest twin of each tip arm: honest's trading, plus each tip's shadow on the same player index, the same
//            stock, the same tranche days and the same size, with the direction from the honest rule (the public consensus, sticky
//            until the next consensus), never the tip's claim. The tip gate reads tipN against honestN (scripts/eca-arms.ts);
//   rumor    follows the engine's public rumor on each report, blindly (the blind rumor-following gate);
//   reader   follows a rumor only when the public record of all resolved rumors is at least READER_BAR over READER_MIN or more
//            (the M16 v2 track-record reader). The engine has one rumor pool (no per-source accuracy yet), so this arm is a
//            market-level reader; a per-stock record never reaches a sample (the first run had 2 fills in 160 seasons).
// Everything after the crime step is the real code: the rumor price-in at publication, the delivery at the surprise lock, the flag
// at placement, the ECA score, the inquiry and investigation, the tribunal, the FIFO disgorgement and the fine.
// Reports every 12 game days in this harness (the production cadence is 63), so a 60-day season holds several per stock.
//
// Usage: npx tsx scripts/eca-harness.ts [--seeds 20] [--days 60] [--first 0] [--out <dir>] [tuning knobs]
//        (--out writes eca-raw-<first>-<last>.json, the raw per-seed results of one chunk)
//        npx tsx scripts/eca-harness.ts --merge <dir> [--days 60] [tuning knobs]  (all chunks of one knob set; same knobs)
// Tuning knobs (defaults are the production values in src/world/eca-tune.ts, catalysts.ts and the crime shortcut):
//   --priceIn   rumor price-in share (R-6C-1); --tipBase  flag points at the median size (R-6C-3); --inquiryScore  the score line
//   --k         insider fine multiple (R-6C-2); --slope  tribunal logistic slope in evidence points (R-6C-4)
//   --crime     a successful session every this many game days; --tranches  tranches per tip (default 3)
// Prints one JSON summary. Same args => same output (seeded).
// The gates (03 §16, quant-rumors, lead-phase6 6C):
//   blind rumor follower mean return after fees at or below 0;
//   each tip tranche (2%, 4%, 6%): tip EV / honest EV in [0.8, 1.2] and tip variance / honest variance in [2, 4];
//   tribunal conviction rate of the tip traders that reach the tribunal in [40%, 65%];
//   wrongful convictions (on an account that never received a tip on that asset) under 3% of the honest and lucky accounts.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_CATALYSTS, earningsInfo } from '../src/engine';
import { applyCommand, createGame, stepGame } from '../src/world/game';
import { credit, netWorthBreakdown, priceOf, TPD } from '../src/world/core';
import { receivedTip, tipsOf, type InsiderTip } from '../src/world/tips';
import { ecaOf } from '../src/world/eca';
import { ECA_TUNE } from '../src/world/eca-tune';
import { honestArmOf, honestDirection, pairedPlayerId, tipGateRow, TIP_ARMS, TIP_PCT, type TipArm } from './eca-arms';
import { Rng, seedStream } from '../src/engine/rng';
import type { GameState } from '../src/world/types';

type Kind = 'honest' | 'heavy' | 'lucky' | 'tip2' | 'tip4' | 'tip6' | 'honest2' | 'honest4' | 'honest6' | 'rumor' | 'reader';
const KINDS: Kind[] = ['honest', 'heavy', 'lucky', 'tip2', 'tip4', 'tip6', 'honest2', 'honest4', 'honest6', 'rumor', 'reader'];
const TIP_KINDS: Kind[] = [...TIP_ARMS];
const HONEST_TIP_KINDS: Kind[] = TIP_ARMS.map(honestArmOf);
const PER_KIND = 8;
const START_CASH = 20_000;
/** the reader arm's track-record rule: the pooled record needs this many resolved rumors, at this hit rate, before it follows */
const READER_MIN = 10;
const READER_BAR = 0.55;

function arg(name: string, def: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
}

const SEEDS = arg('seeds', 20);
const DAYS = arg('days', 60);
const FIRST = arg('first', 0);
const CRIME_EVERY_DAYS = arg('crime', 10);
const TRANCHES = arg('tranches', 3);
const PRICE_IN = arg('priceIn', DEFAULT_CATALYSTS.rumorPriceIn ?? 0);
const OUT = (() => {
  const i = process.argv.indexOf('--out');
  return i >= 0 ? process.argv[i + 1]! : '';
})();
// the tuned knobs: the harness sets them for its runs only (production keeps the eca-tune.ts defaults)
ECA_TUNE.tipBase = arg('tipBase', ECA_TUNE.tipBase);
ECA_TUNE.inquiryScore = arg('inquiryScore', ECA_TUNE.inquiryScore);
ECA_TUNE.insiderK = arg('k', ECA_TUNE.insiderK);
ECA_TUNE.tribunalSlope = arg('slope', ECA_TUNE.tribunalSlope);

function playerIds(): Record<Kind, string[]> {
  const out = {} as Record<Kind, string[]>;
  for (const k of KINDS) out[k] = Array.from({ length: PER_KIND }, (_, i) => `${k}${i}`);
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

interface TipRecord {
  id: string;
  pid: string;
  kind: Kind;
  assetId: string;
  up: boolean;
  revealsTick: number;
  tranchesLeft: number;
  size: number;
  qty: number;
  closed: boolean;
}

/** an honest twin's shadow of one tip: the same stock, days and size, the direction from the honest rule (R-6C-6) */
interface ShadowRecord {
  pid: string;
  assetId: string;
  revealsTick: number;
  tranchesLeft: number;
  size: number;
  dir: 1 | -1 | 0;
  qty: number;
  closed: boolean;
}

interface SeedResult {
  ret: Record<Kind, number[]>;
  counts: Record<Kind, KindCount>;
  tipsDelivered: number;
  tipFlags: number;
  rumorFills: number;
  readerFills: number;
  tipTradesByKind: Record<string, number>;
}

function emptyCount(): KindCount {
  return { inquiries: 0, tribunal: 0, convicted: 0, wrongful: 0, fines: 0, disgorged: 0 };
}

/** Places a market order for `qty` shares; returns the quantity accepted (0 when refused). */
function placeQty(g: GameState, id: string, assetId: string, side: 'buy' | 'sell', qty: number): number {
  if (qty < 1) return 0;
  const r = applyCommand(g, id, { type: 'order.place', order: { assetId, side, type: 'market', qty } });
  return r.ok ? qty : 0;
}

/** Places an order of about `notionalUsd` at the current price; returns the quantity accepted. */
function order(g: GameState, id: string, assetId: string, side: 'buy' | 'sell', notionalUsd: number): number {
  const price = priceOf(g, assetId);
  return placeQty(g, id, assetId, side, Math.floor(notionalUsd / Math.max(1e-6, price)));
}

function runSeed(seed: string): SeedResult {
  const cfg = { catalysts: { ...DEFAULT_CATALYSTS, rumorProb: 0.32, rumorAccuracy: 0.55, everyDays: 12, jitterDays: 2, rumorPriceIn: PRICE_IN } };
  const g: GameState = createGame(seed, { warmupDays: 1, npcs: false, config: cfg });
  const ids = playerIds();
  const all = KINDS.flatMap((k) => ids[k]);
  const kindOf = new Map<string, Kind>();
  for (const k of KINDS) for (const id of ids[k]) kindOf.set(id, k);
  for (const id of all) {
    applyCommand(g, id, { type: 'join', handle: `t_${id}`, country: 'AV' });
    credit(g, id, START_CASH, 'harness');
  }
  const start = new Map(all.map((id) => [id, netWorthBreakdown(g, id).total]));
  const stocks = g.market.config.assets.filter((a) => a.assetClass === 'stock').map((a) => a.id);
  const rng = new Rng(seedStream(seed, 'harness'));
  const lastCrime = new Map<string, number>();
  const tipRecs = new Map<string, TipRecord>();
  const shadows = new Map<string, ShadowRecord>();
  const tipTradesByKind: Record<string, number> = {};
  let rumorFills = 0;
  let readerFills = 0;
  // the public view of each stock's next report (the harness reads only what the Wire shows)
  const info = (a: string) => earningsInfo(g.market, a);
  // a sizing of `pct` of net worth with the same floor as the honest arm
  const sizeOf = (id: string, pct: number) => Math.max(START_CASH * pct, netWorthBreakdown(g, id).total * pct);
  // the reader's public record: the open rumor (its report day and direction) per stock, and the hits and misses of all resolved
  // rumors (review repair: one pooled record, since the engine has one rumor pool and a per-stock record never reaches a sample)
  const openRumor = new Map<string, { day: number; dir: 1 | -1 }>();
  const record = { hits: 0, n: 0 };
  for (let d = 0; d < DAYS; d++) {
    const dayTick = g.market.tick;
    // the rumor record: a rumor opened on its report, and resolved when that report prints
    for (const a of stocks) {
      const e = info(a);
      if (!e) continue;
      const open = openRumor.get(a);
      if (open && e.last && e.last.day === open.day) {
        record.n++;
        if (Math.sign(e.last.surprise) === open.dir) record.hits++;
        openRumor.delete(a);
      }
      if (e.rumor !== null && !openRumor.has(a)) openRumor.set(a, { day: e.day, dir: e.rumor });
    }
    // honest, and the tip arms' honest trading: follow the public consensus on a stock with one, on half the days
    for (const id of [...ids.honest, ...TIP_KINDS.flatMap((k) => ids[k]), ...HONEST_TIP_KINDS.flatMap((k) => ids[k])]) {
      const a = stocks[Math.floor(rng.uniform() * stocks.length)]!;
      const e = info(a);
      if (!e || e.consensus === null || Math.abs(e.consensus) < 0.2) continue;
      if (rng.uniform() > 0.5) continue;
      order(g, id, a, e.consensus > 0 ? 'buy' : 'sell', sizeOf(id, 0.04));
    }
    // heavy: the same signal at three times the size, on most days
    for (const id of ids.heavy) {
      const a = stocks[Math.floor(rng.uniform() * stocks.length)]!;
      const e = info(a);
      if (!e || e.consensus === null || Math.abs(e.consensus) < 0.2) continue;
      if (rng.uniform() > 0.8) continue;
      order(g, id, a, e.consensus > 0 ? 'buy' : 'sell', sizeOf(id, 0.04) * 3);
    }
    // lucky: random side, random (sometimes large) size, any stock, now and then
    for (const id of ids.lucky) {
      if (rng.uniform() > 0.2) continue;
      const a = stocks[Math.floor(rng.uniform() * stocks.length)]!;
      const size = sizeOf(id, 0.04) * (rng.uniform() < 0.2 ? 6 : 1) * (0.5 + rng.uniform());
      order(g, id, a, rng.uniform() < 0.5 ? 'buy' : 'sell', size);
    }
    // the crime step (shortcut): a successful session on an insider every CRIME_EVERY_DAYS game days
    for (const k of TIP_KINDS) {
      for (const id of ids[k]) {
        const last = lastCrime.get(id) ?? -CRIME_EVERY_DAYS * TPD;
        if (dayTick - last < CRIME_EVERY_DAYS * TPD) continue;
        const a = stocks[Math.floor(rng.uniform() * stocks.length)]!;
        const t = tipsOf(g);
        t.seq++;
        t.pending.push({ id: `pt${t.seq}`, playerId: id, assetId: a, companyId: 'harness', tick: dayTick });
        lastCrime.set(id, dayTick);
      }
    }
    // the delivered tips of the tip arms: register each new one, then trade its tranches (one a day) at its size
    for (const t of tipsOf(g).tips as InsiderTip[]) {
      if (tipRecs.has(t.id) || !kindOf.has(t.playerId) || !TIP_KINDS.includes(kindOf.get(t.playerId)!)) continue;
      const k = kindOf.get(t.playerId)!;
      const size = TIP_PCT[k as TipArm]! * (0.5 + rng.uniform());
      tipRecs.set(t.id, {
        id: t.id, pid: t.playerId, kind: k, assetId: t.assetId, up: t.claim === 'up', revealsTick: t.revealsTick,
        tranchesLeft: TRANCHES, size, qty: 0, closed: false,
      });
      // the honest twin's shadow of this tip: the same player index, stock, days and size (R-6C-6)
      shadows.set(t.id, {
        pid: pairedPlayerId(t.playerId, k as TipArm), assetId: t.assetId, revealsTick: t.revealsTick, tranchesLeft: TRANCHES,
        size, dir: 0, qty: 0, closed: false,
      });
    }
    for (const r of tipRecs.values()) {
      if (r.closed || r.tranchesLeft <= 0 || g.market.tick >= r.revealsTick) continue;
      r.tranchesLeft--;
      const q = order(g, r.pid, r.assetId, r.up ? 'buy' : 'sell', sizeOf(r.pid, r.size));
      r.qty += q;
      tipTradesByKind[r.kind] = (tipTradesByKind[r.kind] ?? 0) + (q > 0 ? 1 : 0);
    }
    // the honest shadows trade the same tranche days: the direction is the honest rule's, sticky until the next consensus
    for (const s of shadows.values()) {
      if (s.closed || s.tranchesLeft <= 0 || g.market.tick >= s.revealsTick) continue;
      s.tranchesLeft--;
      const e = info(s.assetId);
      const d = honestDirection(e ? e.consensus : null);
      if (d !== 0) s.dir = d;
      if (s.dir === 0) continue;
      s.qty += s.dir * order(g, s.pid, s.assetId, s.dir > 0 ? 'buy' : 'sell', sizeOf(s.pid, s.size));
    }
    // the tipped shares are sold back (or covered) the game day after the report: the gain is realized (FIFO, eca.ts)
    for (const r of tipRecs.values()) {
      if (r.closed || g.market.tick < r.revealsTick + TPD) continue;
      r.closed = true;
      const pos = g.market.accounts[r.pid]?.positions[r.assetId]?.qty ?? 0;
      const q = Math.min(r.qty, Math.max(0, r.up ? pos : -pos));
      placeQty(g, r.pid, r.assetId, r.up ? 'sell' : 'buy', Math.floor(q));
    }
    for (const s of shadows.values()) {
      if (s.closed || g.market.tick < s.revealsTick + TPD) continue;
      s.closed = true;
      if (s.qty === 0) continue;
      const pos = g.market.accounts[s.pid]?.positions[s.assetId]?.qty ?? 0;
      const q = s.qty > 0 ? Math.min(s.qty, Math.max(0, pos)) : Math.min(-s.qty, Math.max(0, -pos));
      placeQty(g, s.pid, s.assetId, s.qty > 0 ? 'sell' : 'buy', Math.floor(q));
    }
    // rumor (blind) and reader: the engine's public rumor for the next report
    for (const id of ids.rumor) {
      const a = stocks[Math.floor(rng.uniform() * stocks.length)]!;
      const e = info(a);
      if (!e || e.rumor === null) continue;
      if (order(g, id, a, e.rumor > 0 ? 'buy' : 'sell', sizeOf(id, 0.04)) > 0) rumorFills++;
    }
    for (const id of ids.reader) {
      const a = stocks[Math.floor(rng.uniform() * stocks.length)]!;
      const e = info(a);
      if (!e || e.rumor === null) continue;
      // the reader follows the rumor once the pooled record has READER_MIN resolved rumors at READER_BAR or better
      if (record.n < READER_MIN || record.hits / record.n < READER_BAR) continue;
      if (order(g, id, a, e.rumor > 0 ? 'buy' : 'sell', sizeOf(id, 0.04)) > 0) readerFills++;
    }
    // one game day of the market
    for (let k = 0; k < TPD; k++) stepGame(g);
  }
  // results: the net worth return per trader-season, and the regulator's counts per arm
  const ret = Object.fromEntries(KINDS.map((k) => [k, [] as number[]])) as Record<Kind, number[]>;
  for (const id of all) ret[kindOf.get(id)!].push((netWorthBreakdown(g, id).total - start.get(id)!) / start.get(id)!);
  const counts = Object.fromEntries(KINDS.map((k) => [k, emptyCount()])) as Record<Kind, KindCount>;
  for (const q of Object.values(ecaOf(g).inquiries)) {
    const c = counts[kindOf.get(q.playerId)!];
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
  return {
    ret, counts, tipsDelivered: tipsOf(g).tips.length, tipFlags: (g.tips?.flags ?? []).length, rumorFills, readerFills, tipTradesByKind,
  };
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}
function sd(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(xs.length ? xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length : 0);
}

// The seeds run in chunks (--first, --seeds) so two chunks can run at once; each chunk writes its raw per-seed results
// (eca-raw-<first>-<last>.json) and `--merge <dir>` reads the raw chunks of one set of knobs and prints the summary.
const KNOBS = { priceIn: PRICE_IN, tipBase: ECA_TUNE.tipBase, inquiryScore: ECA_TUNE.inquiryScore, insiderK: ECA_TUNE.insiderK, tribunalSlope: ECA_TUNE.tribunalSlope };
const MERGE = (() => {
  const i = process.argv.indexOf('--merge');
  return i >= 0 ? process.argv[i + 1]! : '';
})();
const results: SeedResult[] = [];
let firstSeed = FIRST;
let lastSeed = FIRST + SEEDS - 1;
if (MERGE) {
  const dir = path.resolve(MERGE);
  const files = readdirSync(dir).filter((f) => /^eca-raw-\d+-\d+\.json$/.test(f)).sort((a, b) => Number(a.split('-')[2]) - Number(b.split('-')[2]));
  for (const f of files) {
    const raw = JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as { knobs: typeof KNOBS; days: number; crime: number; tranches: number; results: SeedResult[] };
    if (JSON.stringify(raw.knobs) !== JSON.stringify(KNOBS) || raw.days !== DAYS || raw.crime !== CRIME_EVERY_DAYS || raw.tranches !== TRANCHES) {
      throw new Error(`${f} was run with other knobs`);
    }
    results.push(...raw.results);
  }
  firstSeed = Number(files[0]?.split('-')[2] ?? 0);
  lastSeed = Number(files[files.length - 1]?.split('-')[3]?.replace('.json', '') ?? 0);
} else {
  for (let i = FIRST; i < FIRST + SEEDS; i++) results.push(runSeed(`eca-h${i}`));
  if (OUT) {
    mkdirSync(path.resolve(OUT), { recursive: true });
    const raw = { knobs: KNOBS, days: DAYS, crime: CRIME_EVERY_DAYS, tranches: TRANCHES, results };
    writeFileSync(path.join(path.resolve(OUT), `eca-raw-${FIRST}-${FIRST + SEEDS - 1}.json`), JSON.stringify(raw) + '\n');
  }
}

// per arm: the mean return per trader-season, its spread, and the regulator's counts
const summary: Record<string, unknown> = {
  seeds: results.length, seedRange: `eca-h${firstSeed}..eca-h${lastSeed}`, days: DAYS, perKind: KINDS.length, crimeEveryDays: CRIME_EVERY_DAYS,
  tranches: TRANCHES, knobs: KNOBS,
};
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
    tipTrades: results.reduce((s, r) => s + (r.tipTradesByKind[k] ?? 0), 0),
  };
}
summary.perKind = perKind;
// the wrongful gate (R-6C-4): the honest, lucky and honest-twin accounts together (none of them ever receives a tip)
const WRONGFUL_SET: Kind[] = ['honest', 'lucky', ...HONEST_TIP_KINDS];
const honestSet = {
  n: WRONGFUL_SET.reduce((s, k) => s + perKind[k]!.playerSeasons!, 0),
  convicted: WRONGFUL_SET.reduce((s, k) => s + perKind[k]!.convicted!, 0),
  wrongful: WRONGFUL_SET.reduce((s, k) => s + perKind[k]!.wrongful!, 0),
};
summary.honestSet = honestSet;
summary.wrongfulRateHonestSet = honestSet.n ? honestSet.wrongful / honestSet.n : 0;
const tipGates: Record<string, unknown> = {};
for (const k of TIP_KINDS) {
  const t = perKind[k]!;
  const row = tipGateRow(k as TipArm, perKind as Record<string, { meanRet: number; sdRet: number }>);
  tipGates[k] = {
    honest: row.honest,
    evRatioVsHonest: row.evRatio,
    varRatioVsHonest: row.varRatio,
    tribunal: t.tribunal,
    convicted: t.convicted,
    convictRateAtTribunal: t.tribunal ? t.convicted! / t.tribunal! : null,
    inquiries: t.inquiries,
    wrongful: t.wrongful,
    meanRet: t.meanRet,
  };
}
summary.tipGates = tipGates;
const tipAll = TIP_KINDS.reduce((s, k) => s + perKind[k]!.tribunal!, 0);
const tipConv = TIP_KINDS.reduce((s, k) => s + perKind[k]!.convicted!, 0);
summary.tipConvictRateAtTribunalAll = tipAll ? tipConv / tipAll : null;
summary.rumorMeanRet = perKind.rumor!.meanRet;
summary.readerMeanRet = perKind.reader!.meanRet;
summary.rumorFills = results.reduce((s, r) => s + r.rumorFills, 0);
summary.readerFills = results.reduce((s, r) => s + r.readerFills, 0);
summary.tipsDelivered = results.reduce((s, r) => s + r.tipsDelivered, 0);
summary.tipFlags = results.reduce((s, r) => s + r.tipFlags, 0);
const json = JSON.stringify(summary, null, 2);
if (MERGE) writeFileSync(path.join(path.resolve(MERGE), 'eca-summary.json'), json + '\n');
process.stdout.write(json + '\n');
