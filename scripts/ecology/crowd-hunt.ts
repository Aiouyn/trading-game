/**
 * Tape crowd hunt (print only, not a release gate yet). learn_crowded_beat_share, per Ledger + Quant (tape-ecology-hunts.md,
 * "Ecology crowd gate"). Ported from engine-staging to v1, in-process: jobs run one after another in this process (no workers).
 *
 *   npx tsx scripts/ecology/crowd-hunt.ts [--price-path live|full|hybrid25] [--universe] [--tpd 24] [--years 5]
 *       [--seeds 5] [--bigseeds 10] [--sizes 1,50] [--single 5000,250000,25000000] [--botcash 5000]
 *       [--signals value_gap,mom63] [--seed-prefix tape-] [--set k=v ...] [--txt FILE] [--json FILE]
 *
 * Full crowd settings: --seeds 20 --bigseeds 60 --sizes 1,50,200,500 --single 5000,250000,2500000,25000000,250000000.
 * Measured on the bare catalog: the default's 80 jobs took 54 s, and one 50-bot job about 1 s. The 200- and 500-bot jobs
 * are not timed here. The spec's crowd gate size is 100 x $250k (--sizes 100 --botcash 250000), which is not in the default.
 * Crowded periods here are the crowd's own buy at the rebalance over ADV (the Ledger crowd gate, tape-ecology-hunts.md).
 * learnability.ts classifies on the prior 21 days of signed flow (the spec's rule in tape-ecology-hunts.md, section 0).
 *
 * Same window as scripts/ecology/learnability.ts: 5 game years, every 21 game days from day 63 sell all, step 1, buy
 * floor(0.97 * cash / mid) of the signal pick, step 1. Fees on, market orders, whole shares. Buy-and-hold = one $5k
 * equal-weight stock basket bought on day 63 in its own same-seed world.
 *
 * Paths (config.ecology on the world config; v1 has no enterSimMode, so 'full' is the closed loop):
 *   live: ecology off. full: { mode: 'full', weight: 1 }. hybrid25: { mode: 'hybrid', weight: 0.25 }. --set overrides full and hybrid25 only.
 *
 * Two paths:
 *  A. bots   : N separate $5k accounts (bot-0..bot-N-1) in ONE world, all trading the same pick on the same ticks.
 *              Queue order rotates every rebalance so bot-0 (focal) is not always first in line.
 *  B. single : ONE account with cash C (Quant's parallel $250k path; also C = N x $5k "omnibus" = the same crowd's
 *              dollars under one account, i.e. impact on the combined order as one sqrt(total)).
 *  combined flow = crowd buy notional at the rebalance (the whole buy inside that 21-day window) / pick advNotional.
 *  crowded period = combined flow > 10% of advNotional. Also printed: the learnability-style prior-21-day signed flow.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createWorld, openAccount, placeOrder, portfolio, step } from '../../src/engine/index';
import type { EcologyConfig, Fill, RegimeId, WorldConfig, WorldState } from '../../src/engine/index';
import { SIGNAL_IDS, dailyReturns, regimeAtOpen, sharpe, signalScores } from '../../src/engine/signals';
import type { SignalId } from '../../src/engine/signals';
import { arg, ecologyOverrides, median, numArg, setArgs, worldConfig } from './common';

const years = numArg('years', 5);
const tpd = numArg('tpd', 24);
const MONTH = 21, LOOK = 63, CROWD = 0.1;
const BOT_CASH = numArg('botcash', 5000);
const universe = process.argv.includes('--universe');
const pricePath = arg('price-path', 'live');
if (pricePath !== 'live' && pricePath !== 'full' && pricePath !== 'hybrid25') throw new Error(`--price-path must be live, full or hybrid25, got ${pricePath}`);
const over = ecologyOverrides();
if (setArgs().length && pricePath === 'live') throw new Error('--set only applies to --price-path full or hybrid25');
const ecoField = (): Partial<EcologyConfig> => (pricePath === 'full' ? { mode: 'full', weight: 1, ...over }
  : pricePath === 'hybrid25' ? { mode: 'hybrid', weight: 0.25, ...over } : { mode: 'off' });
const worldCfg = (): WorldConfig => worldConfig(universe, tpd, ecoField());
const SIZES = arg('sizes', '1,50').split(',').map(Number);
const SIGNALS = arg('signals', SIGNAL_IDS.join(',')).split(',') as SignalId[];
// single-account sizes: Quant's $250k and the $25M cross-check, plus the $5k baseline; the omnibus N x $5k is in --single too
const SINGLE_CASH = arg('single', '5000,250000,25000000').split(',').map(Number);
const BIG_SEEDS = numArg('bigseeds', 10);
const BOT_SEEDS = numArg('seeds', 5);
const seedPrefix = arg('seed-prefix', 'tape-');
const seedName = (k: number) => `${seedPrefix}${String(k).padStart(2, '0')}`;

interface Period { start: number; regime: RegimeId; pick: string | null; flowAdv: number; priorSignedAdv: number }
interface Run { equity: number[]; mean?: number[]; last?: number[]; periods: Period[]; fees: number }

function runWorld(seed: string, kind: 'bh' | SignalId, nAcc: number, cashEach: number): Run {
  const cfg = worldCfg();
  const days = Math.round(years * cfg.daysPerYear);
  const lastStart = LOOK + Math.floor((days - MONTH - LOOK) / MONTH) * MONTH;
  const end = lastStart + MONTH;
  const stockIdx = cfg.assets.map((a, i) => (a.assetClass === 'stock' ? i : -1)).filter((i) => i >= 0);
  const ids = Array.from({ length: nAcc }, (_, k) => `bot-${k}`);
  let s: WorldState = createWorld(seed, cfg);
  for (const id of ids) s = openAccount(s, id, cashEach);
  const closes: Record<string, number[]> = {};
  for (const i of stockIdx) closes[cfg.assets[i]!.id] = [];
  const rec = () => { for (const i of stockIdx) closes[cfg.assets[i]!.id]!.push(Math.exp(s.assets[i]!.lnP)); };
  const fills: Fill[] = [];
  const tick = () => { const r = step(s); s = r.state; for (const f of r.fills) fills.push(f); };
  const order = (pid: string, assetId: string, side: 'buy' | 'sell', qty: number) => { if (qty > 0) s = placeOrder(s, { playerId: pid, assetId, side, type: 'market', qty }).state; };
  const px = (i: number) => Math.exp(s.assets[i]!.lnP);
  const eqOf = (pid: string) => { const a = s.accounts[pid]!; let e = a.cash; for (const [aid, p] of Object.entries(a.positions)) e += p.qty * Math.exp(s.assets[cfg.assets.findIndex((d) => d.id === aid)]!.lnP); return e; };
  const equity: number[] = [], mean: number[] = [], last: number[] = [];
  const mark = () => { equity.push(portfolio(s, ids[0]!).equity); if (nAcc > 1) { let t = 0; for (const id of ids) t += eqOf(id); mean.push(t / nAcc); last.push(eqOf(ids[nAcc - 1]!)); } };
  const periods: Period[] = [];
  let pIdx = 0;
  rec();
  for (let d = 0; d < end; d++) {
    let used = 0;
    if (d >= LOOK && (d - LOOK) % MONTH === 0) {
      if (d === LOOK) mark();
      const regime = regimeAtOpen(s);
      if (kind === 'bh') {
        periods.push({ start: d, regime, pick: null, flowAdv: 0, priorSignedAdv: 0 });
        if (d === LOOK) {
          tick(); used++;
          for (const id of ids) { const cash = s.accounts[id]!.cash; for (const i of stockIdx) order(id, cfg.assets[i]!.id, 'buy', Math.floor((0.97 * cash) / stockIdx.length / px(i))); }
          tick(); used++;
        }
      } else {
        const scores = signalScores(kind, s, closes, d);
        let pick = stockIdx[0]!, best = -Infinity;
        for (const i of stockIdx) { const v = scores[cfg.assets[i]!.id]!; if (v > best) { best = v; pick = i; } }
        const aid = cfg.assets[pick]!.id, adv = cfg.assets[pick]!.advNotional ?? 1e9;
        let prior = 0; // learnability-style: combined signed flow on the pick over the prior 21 game days
        for (const f of fills) if (f.assetId === aid && f.tick >= s.tick + 1 - MONTH * tpd && f.tick < s.tick + 1) prior += (f.side === 'buy' ? 1 : -1) * f.qty * f.price;
        const off = nAcc > 1 ? (pIdx * 7919) % nAcc : 0;
        const queue = ids.map((_, k) => ids[(k + off) % nAcc]!);
        for (const id of queue) for (const [a, p] of Object.entries(s.accounts[id]!.positions)) order(id, a, 'sell', p.qty);
        tick(); used++;
        const p0 = px(pick);
        for (const id of queue) order(id, aid, 'buy', Math.floor((0.97 * s.accounts[id]!.cash) / p0));
        const nf = fills.length;
        tick(); used++;
        let bought = 0;
        for (let k = nf; k < fills.length; k++) { const f = fills[k]!; if (f.assetId === aid && f.side === 'buy') bought += f.qty * f.price; }
        periods.push({ start: d, regime, pick: aid, flowAdv: bought / adv, priorSignedAdv: prior / adv });
        pIdx++;
        if (fills.length > 200000) fills.splice(0, fills.length - 100000);
      }
    }
    for (let t = used; t < tpd; t++) tick();
    rec();
    if (d >= LOOK) mark();
  }
  return { equity, ...(nAcc > 1 ? { mean, last } : {}), periods, fees: s.accounts[ids[0]!]!.feesPaid };
}

// ------------------------------------------------------------------ jobs
interface Job { seed: string; kind: 'bh' | SignalId; mode: 'bots' | 'single'; n: number; cash: number }
type Part = Job & { run: Run; ms: number };
const key = (j: Pick<Job, 'seed' | 'kind' | 'mode' | 'n' | 'cash'>) => `${j.seed}__${j.kind}__${j.mode}__${j.n}__${j.cash}`;

function jobList(): Job[] {
  const out: Job[] = [];
  for (let k = 1; k <= Math.max(BIG_SEEDS, BOT_SEEDS); k++) {
    const seed = seedName(k);
    out.push({ seed, kind: 'bh', mode: 'single', n: 1, cash: 5000 });
    for (const sig of SIGNALS) {
      if (k <= BIG_SEEDS) for (const c of SINGLE_CASH) out.push({ seed, kind: sig, mode: 'single', n: 1, cash: c });
      if (k <= BOT_SEEDS) for (const n of SIZES) if (n > 1) out.push({ seed, kind: sig, mode: 'bots', n, cash: BOT_CASH });
    }
  }
  // heaviest first, as staging did (keeps the slow jobs early)
  return out.sort((a, b) => b.n - a.n);
}

const t0 = performance.now();
const parts = new Map<string, Part>();
for (const j of jobList()) {
  const t1 = performance.now();
  const run = runWorld(j.seed, j.kind, j.n, j.cash);
  const ms = performance.now() - t1;
  parts.set(key(j), { ...j, run, ms });
  console.log(`crowd-hunt ${key(j)} ${(ms / 1000).toFixed(1)} s`);
}

// ---------------------------------------------------------------- report
const get = (seed: string, kind: string, mode: string, n: number, cash: number) => parts.get(key({ seed, kind: kind as SignalId, mode: mode as Job['mode'], n, cash }));
const dpy = 252;
const f = (x: number, dp = 3) => (Number.isNaN(x) ? 'n/a' : x.toFixed(dp));
const sh = (eq: number[]) => sharpe(dailyReturns(eq), dpy);
const periodReturns = (eq: number[], periods: Period[], keep: (p: Period, k: number) => boolean) => {
  const r = dailyReturns(eq); const out: number[] = [];
  periods.forEach((p, k) => { if (keep(p, k)) for (let j = k * MONTH; j < (k + 1) * MONTH && j < r.length; j++) out.push(r[j]!); });
  return out;
};
const lines: string[] = [];
const json: Record<string, unknown> = { pricePath, universe, botCash: BOT_CASH, window: { years, tpd, LOOK, MONTH, fees: true, ecology: pricePath, crowdThreshold: CROWD }, signals: {} };
lines.push(`crowd hunt (Tape print, not a gate): ${years}y, tpd ${tpd}, ${universe ? 'universe' : 'bare catalog'}, monthly from day ${LOOK}, fees on, market orders, whole shares, ${pricePath === 'full' ? 'FULL 100% ecology path (config ecology { mode: \'full\', weight: 1 })' : pricePath === 'hybrid25' ? 'HYBRID 25% ecology path' : 'live engine (ecology off)'}${setArgs().length ? `, DIAGNOSTIC overrides ${JSON.stringify(over)}` : ''}`);
lines.push(`Sharpe = daily equity returns, annualized sqrt(${dpy}); BH = $5k equal-weight stock basket in its own same-seed world`);
lines.push(`combined flow = crowd buy notional at the rebalance / pick advNotional; crowded period = combined flow > ${CROWD * 100}% ADV`);
const stat = (seeds: string[], kind: string, mode: string, n: number, cash: number, pathKey: 'equity' | 'mean' | 'last') => {
  const edges: number[] = [], mult: number[] = [], flows: number[] = [], shs: number[] = [], prior: number[] = [], fees: number[] = [];
  let crowdedSeeds = 0, crSeen = 0, crBeat = 0, unSeen = 0, unBeat = 0, crPeriods = 0, allPeriods = 0, maxFlow = 0;
  for (const seed of seeds) {
    const p = get(seed, kind, mode, n, cash), b = get(seed, 'bh', 'single', 1, 5000);
    if (!p || !b) continue;
    const eq = (p.run[pathKey] ?? p.run.equity) as number[];
    const e = sh(eq) - sh(b.run.equity);
    edges.push(e); shs.push(sh(eq)); mult.push(eq[eq.length - 1]! / eq[0]!); fees.push(p.run.fees);
    const fl = p.run.periods.map((q) => q.flowAdv); flows.push(median(fl)); prior.push(Math.max(...p.run.periods.map((q) => q.priorSignedAdv)));
    maxFlow = Math.max(maxFlow, ...fl);
    const cr = p.run.periods.filter((q) => q.flowAdv > CROWD).length; crPeriods += cr; allPeriods += p.run.periods.length;
    if (cr >= p.run.periods.length / 2) crowdedSeeds++;
    for (const want of [true, false]) {
      const sel = (q: Period) => (q.flowAdv > CROWD) === want;
      if (!p.run.periods.some(sel)) continue;
      const beat = sharpe(periodReturns(eq, p.run.periods, sel), dpy) > sharpe(periodReturns(b.run.equity, p.run.periods, sel), dpy);
      if (want) { crSeen++; if (beat) crBeat++; } else { unSeen++; if (beat) unBeat++; }
    }
  }
  const nS = edges.length;
  return {
    seeds: nS, beatShare: nS ? edges.filter((x) => x > 0).length / nS : Number.NaN, medianEdge: median(edges), medianSharpe: median(shs), medianMultiple: median(mult),
    medianFlowAdv: median(flows), maxFlowAdv: maxFlow, maxPriorSignedAdv: Math.max(...prior), crowdedPeriodShare: allPeriods ? crPeriods / allPeriods : Number.NaN,
    seedsCrowdedHalf: crowdedSeeds, crowdedBeat: crSeen ? crBeat / crSeen : Number.NaN, crowdedSeeds: crSeen, uncrowdedBeat: unSeen ? unBeat / unSeen : Number.NaN, uncrowdedSeeds: unSeen, medianFees: median(fees),
  };
};
const row = (label: string, r: ReturnType<typeof stat>) => `  ${label.padEnd(26)} seeds ${String(r.seeds).padStart(2)}  beat ${f(r.beatShare)}  edge ${f(r.medianEdge, 4).padStart(7)}  Sharpe ${f(r.medianSharpe).padStart(6)}  mult ${f(r.medianMultiple)}  flow/ADV med ${(r.medianFlowAdv * 100).toFixed(3)}% max ${(r.maxFlowAdv * 100).toFixed(2)}%  crowded periods ${f(r.crowdedPeriodShare)}  crowded beat ${f(r.crowdedBeat)} (${r.crowdedSeeds})  uncrowded beat ${f(r.uncrowdedBeat)} (${r.uncrowdedSeeds})`;
const bigSeeds = Array.from({ length: BIG_SEEDS }, (_, k) => seedName(k + 1));
const botSeeds = Array.from({ length: BOT_SEEDS }, (_, k) => seedName(k + 1));
for (const sig of SIGNALS) {
  const sj: Record<string, unknown> = {};
  lines.push('', `signal ${sig}`);
  lines.push(`  A. N x $${BOT_CASH.toLocaleString('en-US')} bots in one world (${BOT_SEEDS} seeds); focal = bot-0 (rotating queue), mean = equal-weight crowd, last = bot-(N-1)`);
  const bots: Record<string, unknown> = {};
  for (const n of [1, ...SIZES.filter((x) => x > 1)]) {
    const mode = n > 1 ? 'bots' : 'single';
    const focal = stat(botSeeds, sig, mode, n, n > 1 ? BOT_CASH : 5000, 'equity');
    lines.push(row(`N=${n} focal`, focal));
    const entry: Record<string, unknown> = { focal };
    if (n > 1) { const m = stat(botSeeds, sig, mode, n, BOT_CASH, 'mean'); lines.push(row(`N=${n} crowd mean`, m)); entry.mean = m; }
    bots[n] = entry;
  }
  sj.bots = bots;
  lines.push(`  B. single account (${BIG_SEEDS} seeds): $250k (Quant's parallel) and $25M cross-check; omnibus N x $5k under one account via --single`);
  const single: Record<string, unknown> = {};
  for (const c of SINGLE_CASH) { const r = stat(bigSeeds, sig, 'single', 1, c, 'equity'); lines.push(row(`$${c.toLocaleString('en-US')}`, r)); single[c] = r; }
  sj.single = single;
  // derived PASS/FAIL of learn_crowded_beat_share (tape-ecology-hunts.md): this print is not a release gate yet
  const verdict = (label: string, r: ReturnType<typeof stat>) => {
    const pass = r.crowdedSeeds > 0 && r.crowdedBeat < 0.55 && r.crowdedBeat <= r.uncrowdedBeat - 0.05;
    const res = r.crowdedSeeds === 0 ? "NOT EVALUATED (no crowded periods)" : pass ? "PASS" : "FAIL";
    lines.push(`  band learn_crowded_beat_share, ${label}: crowded beat ${f(r.crowdedBeat)} (${r.crowdedSeeds} seeds), uncrowded ${f(r.uncrowdedBeat)}: ${res}`);
    return res;
  };
  lines.push(`  derived band check (learn_crowded_beat_share: crowded < 0.55 and <= uncrowded - 0.05; print only, not a gate yet)`);
  const verdicts: Record<string, string> = {};
  for (const n of SIZES.filter((x) => x > 1)) verdicts[`bots${n}`] = verdict(`N=${n} bots focal`, stat(botSeeds, sig, "bots", n, BOT_CASH, "equity"));
  for (const c of SINGLE_CASH) verdicts[`single${c}`] = verdict(`single ${c.toLocaleString("en-US")}`, stat(bigSeeds, sig, "single", 1, c, "equity"));
  sj.verdicts = verdicts;
  (json.signals as Record<string, unknown>)[sig] = sj;
}
lines.push('', `wall ${((performance.now() - t0) / 1000).toFixed(1)} s (jobs ${parts.size}; job ms total ${(Array.from(parts.values()).reduce((a, p) => a + p.ms, 0) / 1000).toFixed(0)} s)`);
console.log(lines.join('\n'));
const txt = arg('txt', path.join(os.tmpdir(), 'ecology-gates', 'crowd-hunt.txt'));
const jsonOut = arg('json', path.join(os.tmpdir(), 'ecology-gates', 'crowd-hunt.json'));
mkdirSync(path.dirname(txt), { recursive: true });
writeFileSync(txt, lines.join('\n') + '\n');
writeFileSync(jsonOut, JSON.stringify(json, null, 2) + '\n');
