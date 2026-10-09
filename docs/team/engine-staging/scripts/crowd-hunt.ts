/**
 * Tape crowd hunt (print only, not a release gate yet). learn_crowded_beat_share, per Ledger + Quant.
 *   npx tsx scripts/crowd-hunt.ts [--price-path live|ecology] [--seeds 20] [--bigseeds 60] [--jobs 8] [--sizes 1,50,200,500] [--botcash 5000] [--signals value_gap,mom63]
 *
 * Same window as scripts/learnability.ts: 5 game years, ticksPerDay 24, every 21 game days from day 63 sell all,
 * step 1, buy floor(0.97 * cash / mid) of the signal pick, step 1. Fees on, market orders, whole shares, live
 * engine (ecology off). Buy-and-hold = one $5k equal-weight stock basket bought on day 63 in its own same-seed world.
 *
 * Three paths:
 *  A. bots   : N separate $5k accounts (bot-0..bot-N-1) in ONE world, all trading the same pick on the same ticks.
 *              Queue order rotates every rebalance so bot-0 (focal) is not always first in line.
 *  B. single : ONE account with cash C (Quant's parallel $250k path; also C = N x $5k "omnibus" = the same
 *              crowd's dollars under one account, i.e. impact on the combined order as one sqrt(total)).
 *  combined flow = crowd buy notional at the rebalance (the whole buy inside that 21-day window) / pick advNotional.
 *  crowded period = combined flow > 10% of advNotional. Also printed: the learnability-style prior-21-day signed flow.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorld, defaultConfig, enterSimMode, step, openAccount, placeOrder, portfolio, signalScores, sharpe, dailyReturns, regimeAtOpen } from '../src/engine';
import type { Fill, RegimeId, SignalId, WorldState } from '../src/engine';

const argv = process.argv.slice(2);
const arg = (n: string, f: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1]! : f; };
const years = Number(arg('years', '5'));
const tpd = Number(arg('tpd', '24'));
const MONTH = 21, LOOK = 63, CROWD = 0.1;
const BOT_CASH = Number(arg('botcash', '5000'));
const pricePath = arg('price-path', 'live');
if (pricePath !== 'live' && pricePath !== 'ecology' && pricePath !== 'full') throw new Error(`--price-path must be live, ecology or full, got ${pricePath}`);
// same as scripts/learnability.ts: ecology = closed loop via enterSimMode (shipping ecology defaults, no overrides)
// full = the 100% save field: createWorld(seed, cfg, { ecology: 'full' }) (engine full-mode defaults; bit-identical to enterSimMode)
// live = the legacy engine, passed explicitly ({ ecology: 'off' }) since NEW_WORLD_ECOLOGY is 'full' (2026-10-09 flip);
// ecology = enterSimMode on an explicit off world (bit-identical to full)
const newWorld = (seed: string, cfg: ReturnType<typeof defaultConfig>) => (pricePath === 'ecology' ? enterSimMode(createWorld(seed, cfg, { ecology: 'off' })) : pricePath === 'full' ? createWorld(seed, cfg, { ecology: 'full' }) : createWorld(seed, cfg, { ecology: 'off' }));
const SIZES = arg('sizes', '1,50,200,500').split(',').map(Number);
const SIGNALS = arg('signals', 'value_gap,mom63').split(',') as SignalId[];
// single-account sizes: Quant's $250k, plus omnibus = N x $5k for the larger crowds (and beyond, to find 10% ADV)
const SINGLE_CASH = arg('single', '5000,250000,2500000,25000000,250000000').split(',').map(Number);
const BIG_SEEDS = Number(arg('bigseeds', '60'));
const BOT_SEEDS = Number(arg('seeds', '20'));

interface Period { start: number; regime: RegimeId; pick: string | null; flowAdv: number; priorSignedAdv: number }
interface Run { equity: number[]; mean?: number[]; last?: number[]; periods: Period[]; fees: number }

function runWorld(seed: string, kind: 'bh' | SignalId, nAcc: number, cashEach: number): Run {
  const cfg = defaultConfig({ ticksPerDay: tpd });
  const days = Math.round(years * cfg.daysPerYear);
  const lastStart = LOOK + Math.floor((days - MONTH - LOOK) / MONTH) * MONTH;
  const end = lastStart + MONTH;
  const stockIdx = cfg.assets.map((a, i) => (a.assetClass === 'stock' ? i : -1)).filter((i) => i >= 0);
  const ids = Array.from({ length: nAcc }, (_, k) => `bot-${k}`);
  let s: WorldState = newWorld(seed, cfg);
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

// ------------------------------------------------------------------ workers
const seedName = (k: number) => `tape-${String(k).padStart(2, '0')}`;
interface Job { seed: string; kind: 'bh' | SignalId; mode: 'bots' | 'single'; n: number; cash: number }
function jobs(): Job[] {
  const out: Job[] = [];
  for (let k = 1; k <= Math.max(BIG_SEEDS, BOT_SEEDS); k++) {
    const seed = seedName(k);
    out.push({ seed, kind: 'bh', mode: 'single', n: 1, cash: 5000 });
    for (const sig of SIGNALS) {
      if (k <= BIG_SEEDS) for (const c of SINGLE_CASH) out.push({ seed, kind: sig, mode: 'single', n: 1, cash: c });
      if (k <= BOT_SEEDS) for (const n of SIZES) if (n > 1) out.push({ seed, kind: sig, mode: 'bots', n, cash: BOT_CASH });
    }
  }
  // heaviest first so the pool drains evenly
  return out.sort((a, b) => b.n - a.n);
}
const key = (j: Job) => `${j.seed}__${j.kind}__${j.mode}__${j.n}__${j.cash}`;

const here = fileURLToPath(import.meta.url);
const dir = arg('dir', '/tmp/crowd-hunt-parts');
if (argv.includes('--worker')) {
  const all = jobs();
  const w = Number(arg('w', '0')), W = Number(arg('W', '1'));
  for (let k = w; k < all.length; k += W) {
    const j = all[k]!;
    const f = path.join(dir, `${key(j)}.json`);
    try { readFileSync(f); continue; } catch { /* not done */ }
    const t0 = performance.now();
    const r = runWorld(j.seed, j.kind, j.n, j.cash);
    writeFileSync(f, JSON.stringify({ ...j, run: r, ms: performance.now() - t0 }));
  }
} else {
  const W = Math.max(1, Number(arg('jobs', '8')));
  if (argv.includes('--fresh')) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const t0 = performance.now();
  if (!argv.includes('--report-only')) {
    await Promise.all(Array.from({ length: W }, (_, w) => new Promise<void>((res, rej) => {
      const p = spawn(process.execPath, [...process.execArgv, here, ...argv, '--worker', '--w', String(w), '--W', String(W), '--dir', dir], { stdio: 'inherit' });
      p.on('exit', (c) => (c === 0 ? res() : rej(new Error(`worker ${w} exit ${c}`))));
    })));
  }
  // ---------------------------------------------------------------- report
  type Part = Job & { run: Run; ms: number };
  const parts: Part[] = readdirSync(dir).filter((x) => x.endsWith('.json')).map((x) => JSON.parse(readFileSync(path.join(dir, x), 'utf8')));
  const get = (seed: string, kind: string, mode: string, n: number, cash: number) => parts.find((p) => p.seed === seed && p.kind === kind && p.mode === mode && p.n === n && p.cash === cash);
  const dpy = 252;
  const median = (x: number[]) => { if (!x.length) return Number.NaN; const s = [...x].sort((a, b) => a - b); const k = s.length >> 1; return s.length % 2 ? s[k]! : (s[k - 1]! + s[k]!) / 2; };
  const f = (x: number, dp = 3) => (Number.isNaN(x) ? 'n/a' : x.toFixed(dp));
  const sh = (eq: number[]) => sharpe(dailyReturns(eq), dpy);
  const periodReturns = (eq: number[], periods: Period[], keep: (p: Period, k: number) => boolean) => {
    const r = dailyReturns(eq); const out: number[] = [];
    periods.forEach((p, k) => { if (keep(p, k)) for (let j = k * MONTH; j < (k + 1) * MONTH && j < r.length; j++) out.push(r[j]!); });
    return out;
  };
  const lines: string[] = [];
  const json: Record<string, unknown> = { generated: new Date().toISOString(), pricePath, botCash: BOT_CASH, window: { years, tpd, LOOK, MONTH, fees: true, ecology: pricePath === 'ecology' ? 'closed-loop' : pricePath === 'full' ? 'full (save field)' : 'off', crowdThreshold: CROWD }, signals: {} };
  lines.push(`crowd hunt (Tape print, not a gate): ${years}y, tpd ${tpd}, monthly from day ${LOOK}, fees on, market orders, whole shares, ${pricePath === 'ecology' ? 'CLOSED-LOOP ecology price path (enterSimMode, shipping ecology defaults)' : pricePath === 'full' ? "FULL 100% ecology save field (createWorld(seed, cfg, { ecology: 'full' }), engine full-mode defaults)" : 'live engine (ecology off)'}`);
  lines.push(`Sharpe = daily equity returns, annualized sqrt(${dpy}); BH = $5k equal-weight stock basket in its own same-seed world`);
  lines.push(`combined flow = crowd buy notional at the rebalance / pick advNotional; crowded period = combined flow > ${CROWD * 100}% ADV`);
  const stat = (seeds: string[], kind: string, mode: string, n: number, cash: number, path: 'equity' | 'mean' | 'last') => {
    const edges: number[] = [], mult: number[] = [], flows: number[] = [], shs: number[] = [], prior: number[] = [], fees: number[] = [];
    let crowdedSeeds = 0, crSeen = 0, crBeat = 0, unSeen = 0, unBeat = 0, crPeriods = 0, allPeriods = 0, maxFlow = 0;
    for (const seed of seeds) {
      const p = get(seed, kind, mode, n, cash), b = get(seed, 'bh', 'single', 1, 5000);
      if (!p || !b) continue;
      const eq = (p.run[path] ?? p.run.equity) as number[];
      const e = sh(eq) - sh(b.run.equity);
      edges.push(e); shs.push(sh(eq)); mult.push(eq[eq.length - 1]! / eq[0]!); fees.push(p.run.fees);
      const fl = p.run.periods.map((q) => q.flowAdv); flows.push(median(fl)); prior.push(Math.max(...p.run.periods.map((q) => q.priorSignedAdv)));
      maxFlow = Math.max(maxFlow, ...fl);
      const cr = p.run.periods.filter((q) => q.flowAdv > CROWD).length; crPeriods += cr; allPeriods += p.run.periods.length;
      if (cr >= p.run.periods.length / 2) crowdedSeeds++;
      for (const [want, isCr] of [[true, true], [false, false]] as const) {
        const sel = (q: Period) => (q.flowAdv > CROWD) === want;
        if (!p.run.periods.some(sel)) continue;
        const beat = sharpe(periodReturns(eq, p.run.periods, sel), dpy) > sharpe(periodReturns(b.run.equity, p.run.periods, sel), dpy);
        if (isCr) { crSeen++; if (beat) crBeat++; } else { unSeen++; if (beat) unBeat++; }
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
    // A. bots
    lines.push(`  A. N x $${BOT_CASH.toLocaleString('en-US')} bots in one world (${BOT_SEEDS} seeds); focal = bot-0 (rotating queue), mean = equal-weight crowd, last = bot-(N-1)`);
    const bots: Record<string, unknown> = {};
    for (const n of SIZES) {
      const mode = n > 1 ? 'bots' : 'single';
      const focal = stat(botSeeds, sig, mode, n, n > 1 ? BOT_CASH : 5000, 'equity');
      lines.push(row(`N=${n} focal`, focal));
      const entry: Record<string, unknown> = { focal };
      if (n > 1) { const m = stat(botSeeds, sig, mode, n, BOT_CASH, 'mean'); lines.push(row(`N=${n} crowd mean`, m)); entry.mean = m; }
      bots[n] = entry;
    }
    sj.bots = bots;
    // B. single account
    lines.push(`  B. single account (${BIG_SEEDS} seeds): Quant's parallel $250k + omnibus N x $5k under one account (impact on the combined order)`);
    const single: Record<string, unknown> = {};
    for (const c of SINGLE_CASH) { const r = stat(bigSeeds, sig, 'single', 1, c, 'equity'); lines.push(row(`$${c.toLocaleString('en-US')}${c % 5000 === 0 && c > 5000 ? ` (=${c / 5000} bots)` : ''}`, r)); single[c] = r; }
    sj.single = single;
    (json.signals as Record<string, unknown>)[sig] = sj;
  }
  lines.push('', `wall ${((performance.now() - t0) / 1000).toFixed(1)} s (parts ${parts.length}; worker ms total ${(parts.reduce((a, p) => a + p.ms, 0) / 1000).toFixed(0)} s)`);
  console.log(lines.join('\n'));
  writeFileSync(arg('txt', '/tmp/crowd-hunt.txt'), lines.join('\n') + '\n');
  writeFileSync(arg('json', '/tmp/crowd-hunt.json'), JSON.stringify(json, null, 2) + '\n');
}
