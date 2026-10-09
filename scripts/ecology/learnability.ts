/**
 * Seeded learnability print (Tape's ecology-off and ecology-on checks, tape-ecology-hunts.md section 0). Not the balance
 * runner: no band ids, no pass/fail beyond the printed rows. Ported from engine-staging to v1, in-process (no workers).
 *
 *   npx tsx scripts/ecology/learnability.ts [--seeds 20] [--years 5] [--tpd 24] [--universe] [--price-path live|full|hybrid25]
 *       [--strategies value_gap,mom63,mom63_refined] [--set trendK=0.8 ...] [--seed-prefix tape-] [--txt FILE]
 *
 * Seeds: 20 is the default (a quick check); 60 is the release gate (--seeds 60). Measured on the bare catalog, 60 seeds
 * x 5 years at tpd 24 took 113 to 119 s on this machine with other jobs running, so the 20-seed default is about 40 s.
 *
 * PRICE PATHS (v1 config.ecology, set on the world config; createWorld takes (seed, config) only)
 *   live (default): ecology off ({ mode: 'off' }), the live engine.
 *   full: config.ecology = { mode: 'full', weight: 1 }. The ecology sets every close. This is the closed loop that staging
 *     reached with enterSimMode; in v1 it is the save field itself.
 *   hybrid25: config.ecology = { mode: 'hybrid', weight: 0.25 }. Each close = 0.75 · live + 0.25 · ecology.
 *   --set key=value overrides the ecology knobs (full and hybrid25 only; diagnosis, not a shipping config).
 *   --universe runs universeConfig (183 assets) instead of the bare catalog. The bare catalog carries the momentum-fix fields.
 *
 * Window (same as scripts/balance/run.ts feeAware()): $5,000, market orders through the real order path (spread, impact,
 * fees), whole shares. Every 21 game days from day 63: sell everything, step 1 tick, buy floor(0.97 · cash / price) of the
 * pick, step 1 tick. Buy-and-hold buys an equal-weight stock basket once on day 63. Each strategy trades in its own
 * same-seed world. Signals (src/engine/signals.ts): value_gap is the widest ln(value/price); mom63 is the best 63-day
 * return. mom63_refined (Ledger, 2026-10-09) drops the most volatile third of stocks by trailing 63-day realized vol, then
 * holds the top 3 of the rest by 63-day return, weighted by 1 / vol.
 *
 * Per signal, on stocks:
 *   - share of seeds where the signal's Sharpe (daily equity, annualized) beats buy-and-hold's
 *   - median Sharpe edge (signal − buy-and-hold)
 *   - per-regime beat rates (holding periods grouped by the regime at their open), regimes seen in >= 10 seeds
 *   - uncrowded vs crowded beat rates: crowded = the account bought more than 10% of the pick's advNotional over the prior 21 game days
 *
 * Crowd settings: see scripts/ecology/crowd-hunt.ts.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createWorld, openAccount, placeOrder, portfolio, step } from '../../src/engine/index';
import type { EcologyConfig, Fill, RegimeId, WorldState } from '../../src/engine/index';
import type { SignalId } from '../../src/engine/signals';
import { SIGNAL_IDS, crowding, dailyReturns, regimeAtOpen, sharpe, signalScores, signedFlow } from '../../src/engine/signals';
import { arg, ecologyOverrides, hasFlag, median, numArg, setArgs, worldConfig } from './common';

const years = numArg('years', 5);
const tpd = numArg('tpd', 24);
const nSeeds = numArg('seeds', 20);
const universe = hasFlag('universe');
const seedPrefix = arg('seed-prefix', 'tape-');
const pricePath = arg('price-path', 'live');
if (pricePath !== 'live' && pricePath !== 'full' && pricePath !== 'hybrid25') throw new Error(`--price-path must be live, full or hybrid25, got ${pricePath}`);
const over = ecologyOverrides();
if (setArgs().length && pricePath === 'live') throw new Error('--set only applies to --price-path full or hybrid25');
/** the ecology field of the world config for the chosen price path */
const ecoField = (): Partial<EcologyConfig> => (pricePath === 'full' ? { mode: 'full', weight: 1, ...over }
  : pricePath === 'hybrid25' ? { mode: 'hybrid', weight: 0.25, ...over } : { mode: 'off' });
const worldCfg = () => worldConfig(universe, tpd, ecoField());
const START_CASH = 5000, PID = 'learn', MONTH = 21, LOOK = 63, CROWD = 0.1;
const seedName = (k: number) => `${seedPrefix}${String(k).padStart(2, '0')}`;

const strategies = arg('strategies', SIGNAL_IDS.join(',')).split(',') as Strategy[];
type Strategy = SignalId | 'mom63_refined';
type Kind = 'bh' | Strategy;

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
  let s: WorldState = openAccount(createWorld(seed, cfg), PID, START_CASH);
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
  const cfg = worldCfg();
  const sig = {} as Record<Strategy, Run>;
  for (const k of strategies) sig[k] = runWorld(seed, k);
  return { seed, days: Math.round(years * cfg.daysPerYear), daysPerYear: cfg.daysPerYear, bh: runWorld(seed, 'bh'), sig };
}

// ---------------------------------------------------------------- aggregate
const f = (x: number, dp = 3) => (Number.isNaN(x) ? 'n/a' : x.toFixed(dp));
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
  const cfg = worldCfg();
  const pathText = pricePath === 'full' ? `FULL 100% price path (config ecology { mode: 'full', weight: 1 }: the ecology sets every close)${setArgs().length ? `, DIAGNOSTIC overrides ${JSON.stringify(over)}` : ', shipping ecology defaults'}`
    : pricePath === 'hybrid25' ? `HYBRID 25% price path (config ecology { mode: 'hybrid', weight: 0.25 }: close = 0.75·live + 0.25·ecology)${setArgs().length ? `, DIAGNOSTIC overrides ${JSON.stringify(over)}` : ', shipping ecology defaults'}`
    : 'live engine (ecology off)';
  out.push(`learnability: ${rows.length} seeds (${rows[0]!.seed}..${rows[rows.length - 1]!.seed}) x ${years} game years, ticksPerDay=${tpd}, ${universe ? 'universe' : 'bare catalog'}, $${START_CASH}, monthly (21 game days) from day 63, fees on, ${pathText}`);
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
        if (sharpe(periodReturns(r.sig[k], pr, sel), dpy) > sharpe(periodReturns(r.bh, pr, sel), dpy)) beat++;
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
      const minAdv = Math.min(...again.map((n) => cfg.assets.find((a) => a.id === n)!.advNotional ?? 1e9));
      return (0.97 * r.sig[k].equity[j * MONTH]!) / minAdv;
    }))));
    out.push(`  crowded beat rate at least 0.05 below uncrowded: ${Number.isNaN(cr.rate) || Number.isNaN(un.rate) ? 'n/a (no crowded periods: a $5,000 account never reaches 10% of any advNotional; the largest prior-21-day buy was ' + (maxShare * 100).toExponential(2) + '% of ADV)' : cr.rate <= un.rate - 0.05 ? 'yes' : 'no'}`);
  }
  return out;
}

/**
 * PASS/FAIL against the section 0 bands of docs/team/specs/tape-ecology-hunts.md, for value_gap (the gate signal).
 * Those bands are stated for ecology off and 60 seeds; a run with fewer seeds is provisional. Bands this script
 * cannot evaluate are printed as NOT EVALUATED with the reason, not as PASS.
 */
function section0(rows: SeedOut[], dpy: number): string[] {
  const out: string[] = [];
  const k: Strategy = 'value_gap';
  if (!strategies.includes(k)) return [`section 0: value_gap not in --strategies, bands not evaluated`];
  const N = rows.length;
  const prov = N < 60 ? ` (PROVISIONAL: ${N} seeds, the bands are stated for 60)` : '';
  const off = pricePath === 'live' ? 'ecology off' : `DIAGNOSTIC price path ${pricePath}, the bands are stated for ecology off`;
  out.push('', `section 0 bands for ${k} (tape-ecology-hunts.md; ${off})${prov}`);
  const edge = rows.map((r) => sharpe(dailyReturns(r.sig[k].equity), dpy) - sharpe(dailyReturns(r.bh.equity), dpy));
  const beat = edge.filter((e) => e > 0).length / N;
  const medEdge = median(edge);
  const row = (id: string, band: string, value: string, pass: boolean | null) =>
    `  ${id.padEnd(36)}${band.padEnd(36)}${value.padEnd(40)}${pass === null ? 'NOT EVALUATED' : pass ? 'PASS' : 'FAIL'}`;
  out.push(row('learn_value_gap_sharpe_beat_share', '0.40 to 0.60', `${f(beat)} (${edge.filter((e) => e > 0).length}/${N})`, beat >= 0.4 && beat <= 0.6));
  out.push(row('learn_value_gap_median_sharpe_edge', '<= +0.05', f(medEdge, 4), medEdge <= 0.05));
  const regimes: RegimeId[] = ['expansion', 'overheating', 'contraction', 'recovery'];
  const reg = regimes.map((g) => {
    let seen = 0, won = 0;
    for (const r of rows) {
      const pr = r.sig[k].periods;
      const sel = (p: Period) => p.regime === g;
      if (!pr.some(sel)) continue;
      seen++;
      if (sharpe(periodReturns(r.sig[k], pr, sel), dpy) > sharpe(periodReturns(r.bh, pr, sel), dpy)) won++;
    }
    return { g, seen, rate: seen ? won / seen : Number.NaN };
  }).filter((x) => x.seen >= 10);
  const split = reg.some((x) => x.rate > 0.65) && reg.some((x) => x.rate < 0.4);
  out.push(row('learn_regime_split', 'one > 0.65 and one < 0.40', reg.map((x) => `${x.g} ${f(x.rate)}`).join(', ') || 'no regime seen in >= 10 seeds', split));
  // crowded: the account's own over-the-limit periods (the $5k account never reaches 10% of ADV, so usually none)
  const cls = (want: boolean) => {
    let seen = 0, won = 0, periodsN = 0;
    for (const r of rows) {
      const pr = r.sig[k].periods;
      const sel = (p: Period) => p.crowded === want;
      const n = pr.filter(sel).length;
      if (!n) continue;
      seen++; periodsN += n;
      if (sharpe(periodReturns(r.sig[k], pr, sel), dpy) > sharpe(periodReturns(r.bh, pr, sel), dpy)) won++;
    }
    return { seen, rate: seen ? won / seen : Number.NaN, periodsN };
  };
  const cr = cls(true), un = cls(false);
  if (cr.periodsN === 0) {
    out.push(row('learn_crowded_beat_share', '< 0.55 and <= uncrowded - 0.05', 'no crowded periods at $5k', null));
    out.push(`    (the crowded band is evaluated by scripts/ecology/crowd-hunt.ts: single $250k and the N x $5k crowd)`);
  } else {
    const pass = cr.rate < 0.55 && cr.rate <= un.rate - 0.05;
    out.push(row('learn_crowded_beat_share', '< 0.55 and <= uncrowded - 0.05', `crowded ${f(cr.rate)} (${cr.seen} seeds), uncrowded ${f(un.rate)}`, pass));
  }
  out.push(row('learn_stacked_beats_bh_share', '<= 0.70 (max_strategy_beats_bh_share)', 'not in this script', null));
  out.push(row('eco_off_fingerprint', 'every current band + fingerprint', 'not in this script', null));
  return out;
}

const t0 = performance.now();
const rows: SeedOut[] = [];
for (let k = 1; k <= nSeeds; k++) {
  const t1 = performance.now();
  rows.push(runSeed(seedName(k)));
  console.log(`learnability ${seedName(k)} ${((performance.now() - t1) / 1000).toFixed(1)} s`);
}
const lines = report(rows);
lines.push(...section0(rows, rows[0]!.daysPerYear));
lines.push('', `wall ${((performance.now() - t0) / 1000).toFixed(1)} s`);
console.log(lines.join('\n'));
const txt = arg('txt', path.join(os.tmpdir(), 'ecology-gates', 'learnability.txt'));
mkdirSync(path.dirname(txt), { recursive: true });
writeFileSync(txt, lines.join('\n') + '\n');
