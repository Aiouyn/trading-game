/**
 * Seeded learnability print (not Tape's balance runner; no band ids, no pass/fail).
 *   npx tsx scripts/learnability.ts [--seeds 60] [--years 5] [--tpd 24] [--jobs 8] [--txt /tmp/learnability.txt]
 *   npx tsx scripts/learnability.ts --price-path ecology --strategies mom63,mom63_refined,value_gap \
 *     --dir /tmp/learnability-eco-parts --txt /tmp/learnability-ecology.txt                      # closed loop
 *   [--set trendK=0.8 --set sizes.trend=2 ...]   diagnosis only: ecology knob overrides for the closed loop
 *
 * PRICE PATHS
 *   live (default): the live engine, ecology flag absent.
 *   full: the spec's migration step 3, as a save field: createWorld(seed, cfg, { ecology: 'full' }) writes
 *     config.ecology = { mode: 'full', weight: 1 }; the ecology sets every close (same path as enterSimMode).
 *   hybrid25: the spec's migration step 2, as a save field: createWorld(seed, cfg, { ecologyWeight: 0.25 }) writes
 *     config.ecology = { mode: 'hybrid', weight: 0.25 }; each close = 0.75 · live close + 0.25 · ecology close.
 *   ecology: the 100% closed loop. Each world is passed through enterSimMode() (src/engine/sim.ts, exported
 *     from src/engine): in memory only, never a save field, never on by default. At each game-day close the
 *     six-pool ecology SETS lnP, so the close-to-close log return equals the ecology move (newsPrint of the day's
 *     jumps + pool flow + maker), not added on top of the live day. Pools, value gap and momentum see that price
 *     the next day. The intraday path between closes is still the live engine's; GARCH h and the regime are
 *     still the live engine's (h reads the live intraday move). Player fills happen as usual.
 *
 * CROWD SETTINGS (Tape's crowd hunt, settled by Ledger; NOT run by this script, their script is not edited here)
 *   - crowded = an account bought more than 10% of the pick's advNotional over the prior 21 game days.
 *   - Crowd: 100 accounts x $250k trading the same signal (about $25M combined), plus a single $25M account
 *     as a cross-check.
 *   - Pass: crowded beat rate < 0.55 AND <= uncrowded beat rate - 0.05.
 *   - Ecology-off (the live path) stays their baseline; they rerun on this harness's price path by wrapping
 *     their worlds as enterSimMode(createWorld(seed, cfg)). value_gap is unchanged.
 *
 * Live engine path, ecology flag absent, unless --price-path ecology. Same window style as scripts/balance/run.ts feeAware(): $5,000, market
 * orders through the real order path (spread, impact, fees), whole shares; every 21 game days from day 63: sell
 * everything, step 1 tick, buy floor(0.97 · cash / price) of the pick, step 1 tick. Buy-and-hold buys an
 * equal-weight stock basket once on day 63. Each strategy trades in its own same-seed world. Seeds tape-01...
 *
 * Per signal (value_gap: widest ln(value/price); mom63: best 63-day return), on stocks:
 *   - share of seeds where the signal's Sharpe (daily equity, annualized) beats buy-and-hold's
 *   - median Sharpe edge (signal − buy-and-hold)
 *   - per-regime beat rates (holding periods grouped by the regime at their open), regimes seen in >= 10 seeds
 *   - uncrowded vs crowded beat rates: crowded = the account already bought more than 10% of the pick's
 *     advNotional over the prior 21 game days
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createWorld, defaultConfig, enterSimMode, step, openAccount, placeOrder, portfolio, signalScores, sharpe, dailyReturns,
  regimeAtOpen, signedFlow, crowding, SIGNAL_IDS,
} from '../src/engine';
import type { Fill, RegimeId, SignalId, WorldState } from '../src/engine';

const argv = process.argv.slice(2);
const arg = (n: string, f: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1]! : f; };
const nSeeds = Number(arg('seeds', '60'));
const years = Number(arg('years', '5'));
const tpd = Number(arg('tpd', '24'));
const pricePath = arg('price-path', 'live');
if (pricePath !== 'live' && pricePath !== 'ecology' && pricePath !== 'hybrid25' && pricePath !== 'full') throw new Error(`--price-path must be live, ecology, full or hybrid25, got ${pricePath}`);
/** ecology knob overrides (diagnosis only, closed loop): --set trendK=0.8 --set sizes.trend=2 */
const setArgs: string[] = [];
const ecoOver: Record<string, unknown> = {};
argv.forEach((a, i) => {
  if (a !== '--set') return;
  setArgs.push('--set', argv[i + 1]!);
  const [k, v] = argv[i + 1]!.split('=');
  const keys = k!.split('.');
  let t = ecoOver;
  for (const kk of keys.slice(0, -1)) t = (t[kk] ??= {}) as Record<string, unknown>;
  t[keys[keys.length - 1]!] = Number(v);
});
if (setArgs.length && pricePath === 'live') throw new Error('--set only applies to --price-path ecology, full or hybrid25');
const worldCfg = () => defaultConfig({ ticksPerDay: tpd, ...(setArgs.length ? { ecology: ecoOver } : {}) });
const newWorld = (seed: string) => (pricePath === 'ecology' ? enterSimMode(createWorld(seed, worldCfg(), { ecology: 'off' }))
  : pricePath === 'full' ? createWorld(seed, worldCfg(), { ecology: 'full' })
  : pricePath === 'hybrid25' ? createWorld(seed, worldCfg(), { ecology: 'hybrid25' }) : createWorld(seed, worldCfg(), { ecology: 'off' }));
const START_CASH = 5000, PID = 'learn', MONTH = 21, LOOK = 63, CROWD = 0.1;

/**
 * mom63_refined (Ledger, 2026-10-09): drop the most volatile third of stocks by trailing 63-day realized vol
 * (sample sd of daily log returns over the same 63 closes the signal uses), then hold the top 3 of the rest by
 * 63-day return, weighted by 1 / that vol. Same window, fees and order path as the others.
 */
type Strategy = SignalId | 'mom63_refined';
type Kind = 'bh' | Strategy;
const strategies = arg('strategies', SIGNAL_IDS.join(',')).split(',') as Strategy[];

function vol63(xs: readonly number[], day: number): number {
  const r: number[] = [];
  for (let k = day - 62; k <= day; k++) r.push(Math.log(xs[k]! / xs[k - 1]!));
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  return Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / (r.length - 1));
}
interface Period { start: number; regime: RegimeId; crowded: boolean | null; pick: string | null }
interface Run { equity: number[]; periods: Period[]; fees: number }
interface SeedOut { seed: string; days: number; daysPerYear: number; bh: Run; sig: Record<Strategy, Run> }

function runWorld(seed: string, kind: Kind): Run {
  const cfg = worldCfg();
  const days = Math.round(years * cfg.daysPerYear);
  const lastStart = LOOK + Math.floor((days - MONTH - LOOK) / MONTH) * MONTH;
  const end = lastStart + MONTH;
  const stockIdx = cfg.assets.map((a, i) => (a.assetClass === 'stock' ? i : -1)).filter((i) => i >= 0);
  let s: WorldState = openAccount(newWorld(seed), PID, START_CASH);
  const closes: Record<string, number[]> = {};
  for (const i of stockIdx) closes[cfg.assets[i]!.id] = [];
  const rec = () => { for (const i of stockIdx) closes[cfg.assets[i]!.id]!.push(Math.exp(s.assets[i]!.lnP)); };
  const fills: Fill[] = [];
  const tick = () => { const r = step(s); s = r.state; for (const f of r.fills) fills.push(f); };
  const order = (assetId: string, side: 'buy' | 'sell', qty: number) => { if (qty > 0) s = placeOrder(s, { playerId: PID, assetId, side, type: 'market', qty }).state; };
  const px = (i: number) => Math.exp(s.assets[i]!.lnP);
  const equity: number[] = [];
  const periods: Period[] = [];
  rec();
  for (let d = 0; d < end; d++) {
    let used = 0;
    if (d >= LOOK && (d - LOOK) % MONTH === 0) {
      if (d === LOOK) equity.push(portfolio(s, PID).equity); // window opens at the close before day 63
      const regime = regimeAtOpen(s);
      if (kind === 'bh') {
        periods.push({ start: d, regime, crowded: null, pick: null });
        if (d === LOOK) {
          tick(); used++;
          const cash = s.accounts[PID]!.cash;
          for (const i of stockIdx) order(cfg.assets[i]!.id, 'buy', Math.floor((0.97 * cash) / stockIdx.length / px(i)));
          tick(); used++;
        }
      } else {
        if (kind === 'mom63_refined') {
          const mom = signalScores('mom63', s, closes, d);
          const ranked = stockIdx.map((i) => ({ i, id: cfg.assets[i]!.id, v: vol63(closes[cfg.assets[i]!.id]!, d) }))
            .sort((a, b) => a.v - b.v || a.i - b.i);
          const keep = ranked.slice(0, ranked.length - Math.floor(ranked.length / 3)); // drop the top vol tercile
          const top = keep.sort((a, b) => mom[b.id]! - mom[a.id]! || a.i - b.i).slice(0, 3);
          const wsum = top.reduce((a, x) => a + 1 / x.v, 0);
          let crowded = false;
          for (const x of top) {
            const flow = signedFlow(fills, PID, x.id, s.tick + 1 - MONTH * tpd, s.tick + 1);
            if (crowding(flow, cfg.assets[x.i]!.advNotional ?? 1e9, 1, CROWD).crowded) crowded = true;
          }
          periods.push({ start: d, regime, crowded, pick: top.map((x) => x.id).join('+') });
          for (const [aid, p] of Object.entries(s.accounts[PID]!.positions)) order(aid, 'sell', p.qty);
          tick(); used++;
          const cash = s.accounts[PID]!.cash;
          for (const x of top) order(x.id, 'buy', Math.floor((0.97 * cash * (1 / x.v / wsum)) / px(x.i)));
          tick(); used++;
          for (let t = used; t < tpd; t++) tick();
          rec();
          if (d >= LOOK) equity.push(portfolio(s, PID).equity);
          continue;
        }
        // pick on public info printed so far (state at this open, closes through yesterday)
        const scores = signalScores(kind, s, closes, d);
        let pick = stockIdx[0]!, best = -Infinity;
        for (const i of stockIdx) { const v = scores[cfg.assets[i]!.id]!; if (v > best) { best = v; pick = i; } }
        const id = cfg.assets[pick]!.id;
        const flow = signedFlow(fills, PID, id, s.tick + 1 - MONTH * tpd, s.tick + 1);
        const crowded = crowding(flow, cfg.assets[pick]!.advNotional ?? 1e9, 1, CROWD).crowded;
        periods.push({ start: d, regime, crowded, pick: id });
        for (const [aid, p] of Object.entries(s.accounts[PID]!.positions)) order(aid, 'sell', p.qty);
        tick(); used++;
        order(id, 'buy', Math.floor((0.97 * s.accounts[PID]!.cash) / px(pick)));
        tick(); used++;
      }
    }
    for (let t = used; t < tpd; t++) tick();
    rec();
    if (d >= LOOK) equity.push(portfolio(s, PID).equity);
  }
  return { equity, periods, fees: s.accounts[PID]!.feesPaid };
}

function runSeed(seed: string): SeedOut {
  const cfg = defaultConfig({ ticksPerDay: tpd });
  const sig = {} as Record<Strategy, Run>;
  for (const k of strategies) sig[k] = runWorld(seed, k);
  return { seed, days: Math.round(years * cfg.daysPerYear), daysPerYear: cfg.daysPerYear, bh: runWorld(seed, 'bh'), sig };
}

// ---------------------------------------------------------------- aggregate
const median = (x: number[]) => { if (!x.length) return Number.NaN; const s = [...x].sort((a, b) => a - b); const k = s.length >> 1; return s.length % 2 ? s[k]! : (s[k - 1]! + s[k]!) / 2; };
/** daily returns of the periods selected by `keep` (period k covers equity[k·21 .. (k+1)·21]) */
function periodReturns(run: Run, periods: Period[], keep: (p: Period) => boolean): number[] {
  const r = dailyReturns(run.equity);
  const out: number[] = [];
  periods.forEach((p, k) => { if (keep(p)) for (let j = k * MONTH; j < (k + 1) * MONTH && j < r.length; j++) out.push(r[j]!); });
  return out;
}

function report(rows: SeedOut[]): string[] {
  const out: string[] = [];
  const dpy = rows[0]!.daysPerYear;
  const f = (x: number, dp = 3) => (Number.isNaN(x) ? 'n/a' : x.toFixed(dp));
  out.push(`learnability: ${rows.length} seeds (${rows[0]!.seed}..${rows[rows.length - 1]!.seed}) x ${years} game years, ticksPerDay=${tpd}, $${START_CASH}, monthly (21 game days) from day 63, fees on, ${pricePath === 'full' ? `FULL 100% price path (save field ecology { mode: 'full', weight: 1 }: the ecology sets every close; same path as enterSimMode)${setArgs.length ? `, DIAGNOSTIC overrides ${JSON.stringify(ecoOver)}` : ', shipping ecology defaults'}` : pricePath === 'hybrid25' ? `HYBRID 25% price path (save field ecology { mode: 'hybrid', weight: 0.25 }: close = 0.75·live + 0.25·ecology)${setArgs.length ? `, DIAGNOSTIC overrides ${JSON.stringify(ecoOver)}` : ', shipping ecology defaults'}` : pricePath === 'ecology' ? `CLOSED-LOOP ecology price path (enterSimMode: ecology sets every close at 100%)${setArgs.length ? `, DIAGNOSTIC overrides ${JSON.stringify(ecoOver)}` : ', shipping ecology defaults'}` : 'live engine (ecology off)'}`);
  out.push(`Sharpe = mean daily return / daily sd * sqrt(${dpy}), on the daily equity path (portfolio().equity at each close) from the close before day 63`);
  const regimes: RegimeId[] = ['expansion', 'overheating', 'contraction', 'recovery'];
  for (const k of strategies) {
    out.push('');
    out.push(`signal ${k}`);
    const edge = rows.map((r) => sharpe(dailyReturns(r.sig[k].equity), dpy) - sharpe(dailyReturns(r.bh.equity), dpy));
    out.push(`  beats buy-and-hold Sharpe in ${f(edge.filter((e) => e > 0).length / rows.length)} of seeds (${edge.filter((e) => e > 0).length}/${rows.length})`);
    out.push(`  median Sharpe edge (signal - buy-and-hold): ${f(median(edge), 4)}`);
    out.push(`  info: median Sharpe signal ${f(median(rows.map((r) => sharpe(dailyReturns(r.sig[k].equity), dpy))), 4)}, buy-and-hold ${f(median(rows.map((r) => sharpe(dailyReturns(r.bh.equity), dpy))), 4)}; median multiple signal ${f(median(rows.map((r) => r.sig[k].equity[r.sig[k].equity.length - 1]! / r.sig[k].equity[0]!)))}, buy-and-hold ${f(median(rows.map((r) => r.bh.equity[r.bh.equity.length - 1]! / r.bh.equity[0]!)))}; median fees $${f(median(rows.map((r) => r.sig[k].fees)), 0)}`);
    out.push('  per regime at the open of each holding period:');
    for (const g of regimes) {
      let seen = 0, beat = 0, periodsN = 0;
      for (const r of rows) {
        const pr = r.sig[k].periods;
        const sel = (p: Period) => p.regime === g;
        const n = pr.filter(sel).length;
        if (!n) continue;
        seen++; periodsN += n;
        const a = sharpe(periodReturns(r.sig[k], pr, sel), dpy), b = sharpe(periodReturns(r.bh, pr, sel), dpy);
        if (a > b) beat++;
      }
      out.push(`    ${g.padEnd(12)} seen in ${String(seen).padStart(2)} seeds ${seen >= 10 ? '(>= 10)' : '(<  10)'}  beat rate ${seen ? f(beat / seen) : 'n/a'}  (${periodsN} holding periods)`);
    }
    const cls = (crowded: boolean) => {
      let seen = 0, beat = 0, periodsN = 0;
      for (const r of rows) {
        const pr = r.sig[k].periods;
        const sel = (p: Period) => p.crowded === crowded;
        const n = pr.filter(sel).length;
        if (!n) continue;
        seen++; periodsN += n;
        if (sharpe(periodReturns(r.sig[k], pr, sel), dpy) > sharpe(periodReturns(r.bh, pr, sel), dpy)) beat++;
      }
      return { seen, rate: seen ? beat / seen : Number.NaN, periodsN };
    };
    const un = cls(false), cr = cls(true);
    out.push(`  uncrowded beat rate ${f(un.rate)} (${un.seen} seeds, ${un.periodsN} periods); crowded (> ${CROWD * 100}% of advNotional bought in the prior 21 game days) beat rate ${f(cr.rate)} (${cr.seen} seeds, ${cr.periodsN} periods)`);
    const maxShare = Math.max(...rows.map((r) => Math.max(0, ...r.sig[k].periods.map((p, j) => {
      const prev = r.sig[k].periods[j - 1];
      const names = (p.pick ?? '').split('+').filter(Boolean);
      const again = prev ? names.filter((n) => (prev.pick ?? '').split('+').includes(n)) : [];
      if (!again.length) return 0;
      const minAdv = Math.min(...again.map((n) => defaultConfig().assets.find((a) => a.id === n)!.advNotional ?? 1e9));
      return (0.97 * r.sig[k].equity[j * MONTH]!) / minAdv;
    }))));
    out.push(`  crowded beat rate at least 0.05 below uncrowded: ${Number.isNaN(cr.rate) || Number.isNaN(un.rate) ? 'n/a (no crowded periods: a $5,000 account never reaches 10% of any advNotional; the largest prior-21-day buy was ' + (maxShare * 100).toExponential(2) + '% of ADV)' : cr.rate <= un.rate - 0.05 ? 'yes' : 'no'}`);
  }
  return out;
}

const here = fileURLToPath(import.meta.url);
if (argv.includes('--worker')) {
  const dir = arg('dir', '/tmp/learnability-parts');
  for (let k = Number(arg('from', '1')); k <= Number(arg('to', '1')); k++) {
    const seed = `tape-${String(k).padStart(2, '0')}`;
    writeFileSync(path.join(dir, `${seed}.json`), JSON.stringify(runSeed(seed)));
  }
} else {
  const jobs = Math.max(1, Number(arg('jobs', '8')));
  const dir = arg('dir', '/tmp/learnability-parts');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const per = Math.ceil(nSeeds / jobs);
  const t0 = performance.now();
  const procs: Promise<void>[] = [];
  for (let a = 1; a <= nSeeds; a += per) {
    const b = Math.min(nSeeds, a + per - 1);
    procs.push(new Promise((res, rej) => {
      const p = spawn(process.execPath, [...process.execArgv, here, '--worker', '--from', String(a), '--to', String(b), '--dir', dir, '--tpd', String(tpd), '--years', String(years), '--strategies', strategies.join(','), '--price-path', pricePath, ...setArgs], { stdio: 'inherit' });
      p.on('exit', (c) => (c === 0 ? res() : rej(new Error(`worker ${a}-${b} exit ${c}`))));
    }));
  }
  await Promise.all(procs);
  const rows = readdirSync(dir).filter((x) => x.endsWith('.json')).sort().map((x) => JSON.parse(readFileSync(path.join(dir, x), 'utf8')) as SeedOut);
  const lines = report(rows);
  lines.push('', `wall ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  console.log(lines.join('\n'));
  const txt = arg('txt', '/tmp/learnability.txt');
  if (txt) writeFileSync(txt, lines.join('\n') + '\n');
}
