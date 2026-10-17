/**
 * Meme-coin price action v2: the done check. Reads the world dumps written by pa-v2.ts and prints every number.
 * Usage: npx tsx scripts/launchpad/pa-v2-stats.ts [dir] [csvOutDir]
 * Definitions (all on the coin's first seven game days, 5,040 five-second ticks):
 *   active minute  = a chart minute (12 ticks) with at least 2 trades; active window = the ticks of active minutes.
 *   5s return      = close-to-close of a tick bar, on active-window ticks that had a trade.
 *   candle size    = (high - low) / open of a bar; spike = size > 5x the coin's median traded-bar size; quiet = next bar < 0.5x it.
 *   |ret| ACF      = pooled over active-window ticks (no-trade ticks count as 0), pairs only inside one contiguous active run.
 */
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { quoteBuy, quoteSell, spotAt } from '../../src/world/launchpad/curve';
import { LP } from '../../src/world/launchpad/constants';
import { Rng, seedStream } from '../../src/engine';

const dir = process.argv[2] ?? 'proof/pa-v2';
const csvDir = process.argv[3];
type Meta = { ticker: string; arch: string; mimic: string; status: string; gradTick: number; deadTick: number; actLife?: number; feat: number[] | null };
type Coin = Meta & { world: number; o: Float32Array; h: Float32Array; l: Float32Array; c: Float32Array; v: Float32Array; n: Float32Array; y: Float32Array };
const coins: Coin[] = [];
let H = 0;
for (const f of readdirSync(dir).filter(x => /^world-\d+\.json$/.test(x)).sort()) {
  const meta = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  H = meta.H;
  const raw = readFileSync(`${dir}/${f.replace('.json', '.bin')}`);
  const all = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  meta.recs.forEach((m: Meta, k: number) => {
    const b = k * meta.F * H;
    const sl = (j: number) => all.subarray(b + j * H, b + (j + 1) * H);
    coins.push({ ...m, world: meta.world, o: sl(0), h: sl(1), l: sl(2), c: sl(3), v: sl(4), n: sl(5), y: sl(6) });
  });
}
const P0 = spotAt(LP.Y0);
const q = (xs: number[], p: number) => { if (!xs.length) return NaN; const a = xs.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))]!; };
const med = (xs: number[]) => q(xs, 0.5);
const f3 = (x: number) => Number.isFinite(x) ? Number(x.toFixed(3)) : x;
const out: Record<string, unknown> = { coins: coins.length, worlds: [...new Set(coins.map(c => c.world))] };

// ---- active windows, returns, spikes, ACF
const absR: number[] = [], up: number[] = [], dn: number[] = [];
let zeroInActive = 0, activeTicks = 0;
let spikes = 0, spikeQuiet = 0, spikesM = 0, spikeQuietM = 0;
const L = 10; const num = new Float64Array(L + 1), den = { s: 0, n: 0 };
const seqs: number[][] = [];
for (const c of coins) {
  const act = new Uint8Array(H);
  for (let m = 0; m * 12 < H; m++) { let k = 0; for (let t = m * 12; t < m * 12 + 12; t++) k += c.n[t]!; if (k >= 2) for (let t = m * 12; t < m * 12 + 12; t++) act[t] = 1; }
  const sizes: number[] = [];
  for (let t = 1; t < H; t++) if (act[t] && c.n[t]! > 0) sizes.push((c.h[t]! - c.l[t]!) / c.o[t]!);
  const ms = med(sizes.filter(x => x > 0));
  let run: number[] = [];
  for (let t = 1; t < H; t++) {
    if (!act[t]) { if (run.length) seqs.push(run); run = []; continue; }
    activeTicks++;
    const r = c.c[t]! / c.c[t - 1]! - 1;
    run.push(Math.abs(r));
    if (c.n[t]! > 0) { absR.push(Math.abs(r)); if (r > 0) up.push(r); else if (r < 0) dn.push(-r); } else zeroInActive++;
    if (ms > 0 && c.n[t]! > 0 && t + 1 < H) {
      const sz = (c.h[t]! - c.l[t]!) / c.o[t]!;
      if (sz > 5 * ms) { spikes++; if ((c.h[t + 1]! - c.l[t + 1]!) / c.o[t + 1]! < 0.5 * ms) spikeQuiet++; }
    }
  }
  if (run.length) seqs.push(run);
  // minute candles
  const mh: number[] = [], ml: number[] = [], mo: number[] = [], mact: number[] = [];
  for (let m = 0; m * 12 < H; m++) { let hi = -Infinity, lo = Infinity; for (let t = m * 12; t < m * 12 + 12; t++) { hi = Math.max(hi, c.h[t]!); lo = Math.min(lo, c.l[t]!); } mh.push(hi); ml.push(lo); mo.push(c.o[m * 12]!); mact.push(act[m * 12]!); }
  const msz = mh.map((x, i) => (x - ml[i]!) / mo[i]!);
  const mmed = med(msz.filter((x, i) => mact[i] && x > 0));
  for (let i = 0; i + 1 < msz.length; i++) if (mact[i] && mmed > 0 && msz[i]! > 5 * mmed) { spikesM++; if (msz[i + 1]! < 0.5 * mmed) spikeQuietM++; }
}
const mu = seqs.flat().reduce((a, b) => a + b, 0) / Math.max(1, seqs.flat().length);
for (const s of seqs) for (let i = 0; i < s.length; i++) { const d = s[i]! - mu; den.s += d * d; for (let k = 1; k <= L && i + k < s.length; k++) num[k] += d * (s[i + k]! - mu); }
const acf = Array.from({ length: L }, (_, i) => f3(num[i + 1]! / den.s));
out.returns5s = { n: absR.length, zeroTradeShareInActive: f3(zeroInActive / Math.max(1, activeTicks)), absP50: f3(q(absR, .5)), absP95: f3(q(absR, .95)), absP99: f3(q(absR, .99)),
  upN: up.length, upP95: f3(q(up, .95)), upP99: f3(q(up, .99)), downN: dn.length, downP95: f3(q(dn, .95)), downP99: f3(q(dn, .99)) };
out.acfAbs5s = acf;
out.spikeThenQuiet = { s5: { spikes, quiet: spikeQuiet, share: f3(spikeQuiet / Math.max(1, spikes)) }, m1: { spikes: spikesM, quiet: spikeQuietM, share: f3(spikeQuietM / Math.max(1, spikesM)) } };

// ---- fate by day 7, graduation, archetypes
let dead = 0, dd90 = 0, give90 = 0, inactive = 0, fate = 0, grad = 0;
const types: Record<string, { n: number; peak: number[]; ttp: number[]; life: number[]; act: number[]; grad: number; fate: number }> = {};
for (const c of coins) {
  let pk = 0, pkT = 0, lastAct = 0;
  for (let t = 0; t < H; t++) { if (c.h[t]! > pk) { pk = c.h[t]!; pkT = t; } }
  for (let m = 0; m * 12 < H; m++) { let k = 0; for (let t = m * 12; t < m * 12 + 12; t++) k += c.n[t]!; if (k >= 2) lastAct = m + 1; }
  const end = c.c[H - 1]!;
  const graduated = c.gradTick >= 0;
  const isDead = c.deadTick >= 0;
  let lastDay = 0; for (let t = H - 720; t < H; t++) lastDay += c.n[t]!;
  const isDd = end <= 0.1 * pk;
  const isGive = pk > P0 && (pk - end) >= 0.9 * (pk - P0);
  const isInactive = lastDay <= 2;
  const ok = !graduated && (isDead || isDd || isGive || isInactive);
  if (isDead) dead++; if (isDd) dd90++; if (isGive) give90++; if (isInactive) inactive++; if (graduated) grad++; if (ok) fate++;
  const ty = types[c.arch] ??= { n: 0, peak: [], ttp: [], life: [], act: [], grad: 0, fate: 0 };
  ty.n++; ty.peak.push(pk / P0); ty.ttp.push(pkT / 12); ty.life.push(lastAct); ty.act.push((c.actLife ?? 0) / 12); if (graduated) ty.grad++; if (ok) ty.fate++;
}
const N = coins.length;
out.day7 = { statusDead: dead, down90FromPeak: dd90, gaveBack90OfRise: f3(give90 / N), inactiveLastGameDay: f3(inactive / N),
  deadOrFaded: f3(fate / N), note: 'deadOrFaded = not graduated and (status dead, or close <= 10% of peak, or gave back >= 90% of the rise above launch price, or <= 2 trades in game day 7)' };
out.graduation = { n: grad, share: f3(grad / N) };
out.archetypes = Object.fromEntries(Object.entries(types).sort().map(([k, v]) => [k, { n: v.n, share: f3(v.n / N), peakMultMed: f3(med(v.peak)), peakMultP90: f3(q(v.peak, .9)),
  minToPeakMed: f3(med(v.ttp)), lifetimeMinMed: f3(med(v.life)), lifetimeMinP90: f3(q(v.life, .9)), activeLifeMinMed: f3(med(v.act)), activeLifeMinP90: f3(q(v.act, .9)), grad: v.grad, deadOrFaded: f3(v.fate / v.n) }]));

// ---- tells and bots: features at minute 10, entry at tick 120 for $100, exit at minute 60 or a 0.6x stop / 2.5x take
const ENTRY = 120, HOLD = 600, SPEND = 10_000; // cents
function trade(c: Coin, stops = true): number | null {
  const y0 = c.y[ENTRY]!; if (c.gradTick >= 0 && c.gradTick <= ENTRY) return null; if (c.deadTick >= 0 && c.deadTick <= ENTRY) return null;
  const b = quoteBuy(y0, SPEND); if (!b.ok) return null;
  const tokens = b.tokens;
  const pe = c.c[ENTRY]!;
  let ex = Math.min(H - 1, ENTRY + HOLD);
  for (let t = ENTRY + 1; t <= ex; t++) { if (c.gradTick >= 0 && t >= c.gradTick) { ex = t; break; } const r = c.c[t]! / pe; if (stops && (r <= 0.6 || r >= 2.5)) { ex = t; break; } }
  if (c.gradTick >= 0 && ex >= c.gradTick) return c.c[ex]! * tokens * (1 - LP.FEE_RATE) - SPEND / 100;
  const sq = quoteSell(Math.min(LP.Y0 - tokens, Math.max(c.y[ex]!, LP.GRAD_Y)), tokens);
  if (!sq.ok) return -SPEND / 100;
  return sq.netCents / 100 - SPEND / 100;
}
const rows = coins.filter(c => c.feat).map(c => ({ c, x: c.feat!, pnl: trade(c) })).filter(r => r.pnl !== null) as { c: Coin; x: number[]; pnl: number }[];
const names = ['logUniqueBuyers50', 'buyerGrowth', 'top5HolderShare', 'topEarlyBuyersSoldShare', 'logBuzz', 'dipBuyShare', 'logMultAtMin10'];
const train = rows.filter(r => r.c.world % 2 === 0), test = rows.filter(r => r.c.world % 2 === 1);
const D = names.length;
const mean = Array.from({ length: D }, (_, j) => train.reduce((a, r) => a + r.x[j]!, 0) / train.length);
const sd = Array.from({ length: D }, (_, j) => Math.sqrt(train.reduce((a, r) => a + (r.x[j]! - mean[j]!) ** 2, 0) / train.length) || 1);
const z = (x: number[]) => [1, ...x.map((v, j) => (v - mean[j]!) / sd[j]!)];
const target = (r: { pnl: number }) => Math.sign(r.pnl) * Math.log1p(Math.abs(r.pnl) / 10);
// ridge least squares, lambda 5
const A = Array.from({ length: D + 1 }, () => new Float64Array(D + 1)), bv = new Float64Array(D + 1);
for (const r of train) { const zz = z(r.x), yv = target(r); for (let i = 0; i <= D; i++) { bv[i] += zz[i]! * yv; for (let j = 0; j <= D; j++) A[i]![j] += zz[i]! * zz[j]!; } }
for (let i = 1; i <= D; i++) A[i]![i] += 5;
const w = solve(A.map(r => Array.from(r)), Array.from(bv));
const score = (x: number[]) => z(x).reduce((a, v, i) => a + v * w[i]!, 0);
const trainScores = train.map(r => score(r.x)).sort((a, b) => a - b);
const thr = trainScores[Math.floor(trainScores.length * 0.7)]!;
const picked = test.filter(r => score(r.x) >= thr);
const pnlTell = picked.reduce((a, r) => a + r.pnl, 0);
const rng = new Rng(seedStream('pa-v2', 'random-bot'));
let rp = 0, rh = 0, rn = 0;
for (let d = 0; d < 200; d++) { for (const r of test) if (rng.uniform() < picked.length / test.length) { rp += r.pnl; rn++; if (r.pnl > 0) rh++; } }
const corr = (j: number) => { const xs = rows.map(r => r.x[j]!), ys = rows.map(target); const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length; let sxy = 0, sxx = 0, syy = 0; xs.forEach((x, i) => { sxy += (x - mx) * (ys[i]! - my); sxx += (x - mx) ** 2; syy += (ys[i]! - my) ** 2; }); return f3(sxy / Math.sqrt(sxx * syy)); };
const featByArch = Object.fromEntries([...new Set(rows.map(r => r.c.arch))].sort().map(a => { const xs = rows.filter(r => r.c.arch === a); return [a, Object.fromEntries(names.map((n, j) => [n, f3(xs.reduce((s, r) => s + r.x[j]!, 0) / xs.length)]))]; }));
const mimicShare = f3(coins.filter(c => c.mimic !== c.arch).length / coins.length);
out.tells = { mimicShare, featureMeanByTrueArch: featByArch, featureOutcomeCorr: Object.fromEntries(names.map((n, j) => [n, corr(j)])), weights: Object.fromEntries(['bias', ...names].map((n, i) => [n, f3(w[i]!)])) };
out.bots = { rule: 'enter $100 at minute 10 via the curve quote (fee included), exit at minute 60, at 0.6x (stop) or 2.5x (take), or at graduation; train on even worlds, test on odd worlds',
  testCoins: test.length,
  tellBot: { n: picked.length, pnlTotal: f3(pnlTell), pnlPerTrade: f3(pnlTell / Math.max(1, picked.length)), hitRate: f3(picked.filter(r => r.pnl > 0).length / Math.max(1, picked.length)) },
  randomBot: { draws: 200, nPerDraw: f3(rn / 200), pnlPerDraw: f3(rp / 200), pnlPerTrade: f3(rp / Math.max(1, rn)), hitRate: f3(rh / Math.max(1, rn)) },
  buyAllNoStops: (() => { const xs = coins.map(c => trade(c, false)).filter((x): x is number => x !== null); return { n: xs.length, pnlPerTrade: f3(xs.reduce((a, b) => a + b, 0) / xs.length), hit: f3(xs.filter(x => x > 0).length / xs.length) }; })(),
  buyAllWithStops: { n: rows.length, pnlPerTrade: f3(rows.reduce((a, r) => a + r.pnl, 0) / rows.length), hit: f3(rows.filter(r => r.pnl > 0).length / rows.length) },
  allTestCoins: { n: test.length, pnlPerTrade: f3(test.reduce((a, r) => a + r.pnl, 0) / test.length) },
  pnlByArchAllCoins: Object.fromEntries([...new Set(rows.map(r => r.c.arch))].sort().map(a => { const xs = rows.filter(r => r.c.arch === a); return [a, { n: xs.length, pnlPerTrade: f3(xs.reduce((s, r) => s + r.pnl, 0) / xs.length), hit: f3(xs.filter(r => r.pnl > 0).length / xs.length) }]; })) };
console.log(JSON.stringify(out, null, 1));

// ---- chart CSVs: first coin per archetype in world order with a minimum shape, plus per-coin summary
if (csvDir) {
  mkdirSync(csvDir, { recursive: true });
  const pick = (arch: string, ok: (c: Coin) => boolean) => coins.find(c => c.arch === arch && ok(c));
  const peak = (c: Coin) => Math.max(...Array.from(c.h)) / P0;
  const chosen: [string, Coin | undefined][] = [
    ['rug', pick('rug', c => c.mimic === 'rug' && peak(c) > 2.5)],
    ['quick', pick('quick', c => c.mimic === 'quick' && peak(c) > 2.5)],
    ['trender', pick('trender', c => c.mimic === 'trender' && peak(c) > 3 && (c.actLife ?? 0) > 6 * 720 / 2)],
    ['runner', pick('runner', c => { if (c.mimic !== 'runner' || c.gradTick >= 0) return false; let pk = 0, pt = 0; c.h.forEach((v, t) => { if (v > pk) { pk = v; pt = t; } }); return pk / P0 > 8 && pt > 40 * 12; })],
  ];
  for (const [name, c] of chosen) {
    if (!c) continue;
    const lines = ['tick,open,high,low,close,volume,trades'];
    for (let t = 0; t < H; t++) lines.push(`${t},${c.o[t]},${c.h[t]},${c.l[t]},${c.c[t]},${c.v[t]},${c.n[t]}`);
    writeFileSync(`${csvDir}/${name}-${c.ticker}-w${c.world}.csv`, lines.join('\n'));
  }
  writeFileSync(`${csvDir}/chosen.json`, JSON.stringify(chosen.map(([n, c]) => ({ name: n, ticker: c?.ticker, world: c?.world, arch: c?.arch, mimic: c?.mimic }))));
}

function solve(M: number[][], b: number[]): number[] {
  const n = b.length; const a = M.map((r, i) => [...r, b[i]!]);
  for (let i = 0; i < n; i++) { let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(a[k]![i]!) > Math.abs(a[p]![i]!)) p = k; [a[i], a[p]] = [a[p]!, a[i]!];
    for (let k = 0; k < n; k++) if (k !== i) { const f = a[k]![i]! / a[i]![i]!; for (let j = i; j <= n; j++) a[k]![j] -= f * a[i]![j]!; } }
  return a.map((r, i) => r[n]! / r[i]!);
}
