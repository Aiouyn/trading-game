// v13 OBS runner: realism stats + skill tests. Usage: N=600 bun obs-run.ts lib
import { CURVE } from './core-sel'; import { ObsCoin, World, label, K } from './OBS'; import { stats } from './run'; import { T, TYPES, type Trader } from './core'; import { writeFileSync, mkdirSync } from 'fs';
const N = +(process.env.N ?? 600); const t0 = Date.now(); const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? NaN; };
const pl = (id: number, cash: number): Trader => ({ id: -id, cash, tok: 0, cost: 0, kind: 'player', entry: 0, peak: 0, born: 0 });
function run(seed: number, world: World, until = T, act?: (o: ObsCoin, t: number) => void) { const o = new ObsCoin(seed, world); for (let t = 0; t < until; t++) { o.step(); act?.(o, t); o.c.endTick(); } return o; }
// 1) base population (random bot rides along like core.ts: $50, entry in [60,720) on half the coins, exit +360)
const world = new World(); const coins: any[] = []; const rand: number[] = [];
for (let i = 0; i < N; i++) { const rb = pl(1, 50); const rIn = (i * 7919) % 2 === 0 ? 60 + ((i * 104729) % 660) : -1;
  let F: number[] = []; const o = run(i + 1, world, T, (o, t) => { if (t === 60) F = o.features(60); if (t === rIn) o.playerBuy(rb, 50); if (rIn >= 0 && t === rIn + 360) o.playerSell(rb); });
  if (rIn >= 0) rand.push(rb.cash - 50); const slim: any = { c: { px: o.c.px, vol: o.c.vol, nTr: o.c.nTr, grad: o.c.grad }, B: o.B, dev: o.dev, dumped: o.dumped, F }; slim.lab = label(slim); coins.push(slim); }
const labs = coins.map(o => o.lab); const st: any = stats(coins.map(o => o.c)); st.gradRate = coins.filter(o => o.c.grad >= 0).length / N;
st.labels = Object.fromEntries(TYPES.map(k => [k, labs.filter(l => l === k).length]));
st.peakByLabel = Object.fromEntries(TYPES.map(k => { const g = coins.filter((o, i) => labs[i] === k).map(o => Math.max(...o.c.px) / o.c.px[0]!); return [k, g.length ? [q(g, .5), q(g, .9), Math.max(...g)].map(x => +x.toFixed(1)) : null]; }));
st.gradByLabel = Object.fromEntries(TYPES.map(k => { const g = coins.filter((o, i) => labs[i] === k); return [k, g.length ? +(g.filter(o => o.c.grad >= 0).length / g.length).toFixed(2) : null]; }));
st.randBot = { n: rand.length, perTrade: rand.reduce((a, b) => a + b, 0) / rand.length };
const Bs = coins.map(o => o.B); st.B = { p50: q(Bs, .5), p90: q(Bs, .9), max: Math.max(...Bs) }; st.devMix = { rugger: coins.filter(o => o.dev === 'rugger').length, slow: coins.filter(o => o.dev === 'slow').length };
// 2) clue bot: logistic on public clues at minute 5 (tick 60), trained on first half, traded on second half via real replays ($50, exit at +30 min)
const X = coins.map(o => o.F), Y = coins.map(o => +((o.c.px[420] ?? o.c.px.at(-1)!) / o.c.px[60]! * 0.98 > 1));
const h = Math.floor(N / 2); let w = Array(X[0]!.length).fill(0); const mu = X[0]!.map((_, j) => X.slice(0, h).reduce((s, x) => s + x[j]!, 0) / h), sd = X[0]!.map((_, j) => Math.sqrt(X.slice(0, h).reduce((s, x) => s + (x[j]! - mu[j]!) ** 2, 0) / h) || 1);
const Z = X.map(x => x.map((v, j) => j === 0 ? 1 : (v - mu[j]!) / sd[j]!)); const sig = (z: number) => 1 / (1 + Math.exp(-z));
for (let it = 0; it < 400; it++) { const g = Array(w.length).fill(0); for (let i = 0; i < h; i++) { const e = sig(Z[i]!.reduce((s, v, j) => s + v * w[j]!, 0)) - Y[i]!; Z[i]!.forEach((v, j) => g[j] += e * v); } w = w.map((x, j) => x - 0.5 * (g[j]! / h + 0.01 * x)); }
const score = Z.map(z => sig(z.reduce((s, v, j) => s + v * w[j]!, 0))); const thr = q(score.slice(0, h), 0.7);
const replay = (i: number, buyT: number, sellT: number) => { const b = pl(2, 50); const o = run(i + 1, new World(), sellT + 1, (o, t) => { if (t === buyT) o.playerBuy(b, 50); if (t === sellT) o.playerSell(b); }); return b.cash - 50; };
const clue: number[] = [], base: number[] = []; for (let i = h; i < N; i++) { const pnl = replay(i, 60, 420); base.push(pnl); if (score[i]! > thr) clue.push(pnl); }
st.clueBot = { weights: Object.fromEntries(['bias', 'themeMatch', 'uniqueShare', 'logBuys', 'devFresh', 'linked', 'smartBuys', 'followers', 'replies', 'bigDump', 'logRet5m', 'logVol'].map((k, j) => [k, +w[j]!.toFixed(3)])),
  n: clue.length, hitRate: clue.filter(x => x > 0).length / clue.length, perTrade: clue.reduce((a, b) => a + b, 0) / clue.length,
  baselineAllAt5m: { n: base.length, hitRate: base.filter(x => x > 0).length / base.length, perTrade: base.reduce((a, b) => a + b, 0) / base.length } };
// 3) pump-and-dump bot: $500 buy at t=60, 3 posts (61, 64, 67), dump at t=120. Fresh account each coin. 200 coins
const pnd: number[] = []; for (let i = 0; i < Math.min(200, N); i++) { const b = pl(3, 500); const wd = new World(); run(i + 1, wd, 121, (o, t) => { if (t === 60) o.playerBuy(b, 500); if (t === 61 || t === 64 || t === 67) o.post('pnd'); if (t === 120) o.playerSell(b); }); pnd.push(b.cash - 500); }
st.pumpDump = { n: pnd.length, median: q(pnd, .5), mean: pnd.reduce((a, b) => a + b, 0) / pnd.length, winShare: pnd.filter(x => x > 0).length / pnd.length };
// 4) tiny-B shiller: coins with B in the bottom 20%; $100 buy at 60 + 3 posts, exit at 420
const bq = q(Bs, 0.2); const tiny = coins.map((o, i) => [o, i] as const).filter(([o]) => o.B <= bq).slice(0, 100); const sh: number[] = [];
for (const [, i] of tiny) { const b = pl(4, 100); run(i + 1, new World(), 421, (o, t) => { if (t === 60) o.playerBuy(b, 100); if (t === 61 || t === 64 || t === 67) o.post('shill'); if (t === 420) o.playerSell(b); }); sh.push(b.cash - 100); }
st.tinyShiller = { n: sh.length, median: q(sh, .5), mean: sh.reduce((a, b) => a + b, 0) / sh.length };
// 5) serial dumper: one account pump-and-dumps 20 coins in a row; followers' losses cut its reputation
const sw = new World(); const serial: { coin: number; rep: number; pnl: number; followers: number }[] = [];
for (let k = 0; k < 20; k++) { const b = pl(5, 500); const acct = sw.get('serial'); const rep0 = acct.rep; let fol: Trader[] = [];
  const o = run(1000 + k, sw, 481, (o, t) => { if (t === 60) o.playerBuy(b, 500); if (t === 61 || t === 64 || t === 67) o.post('serial'); if (t === 120) o.playerSell(b); });
  fol = o.follow.filter(f => f.tr).map(f => f.tr); const fp = fol.map(f => (f.tok * o.c.price() + f.cash) - f.cost - (f.cash)); // follower mark-to-market P&L
  /* v13.2 fix: cost was never set, so m measured holdings value (>=0), not follower P&L */ const m = fol.length ? fol.reduce((s, f) => s + (f.tok * o.c.price() + f.cash - f.u0), 0) / fol.reduce((s, f) => s + Math.max(1, f.u0), 0) : 0;
  acct.rep = Math.max(0.05, acct.rep * Math.exp(K.rep_k * 50 * m)); serial.push({ coin: k + 1, rep: +rep0.toFixed(3), pnl: +(b.cash - 500).toFixed(1), followers: fol.length }); }
st.serialDumper = serial;
// B-clue-only bot (no activity/price features): themeMatch, smartBuys, devFresh, linked -> shows clue info independent of 'avoid pumped'
{ const idx = [0, 1, 4, 5, 6]; let w2 = Array(idx.length).fill(0); for (let it = 0; it < 400; it++) { const g = Array(idx.length).fill(0); for (let i = 0; i < h; i++) { const z = idx.map(j => Z[i]![j]!); const e = sig(z.reduce((s, v, j) => s + v * w2[j]!, 0)) - Y[i]!; z.forEach((v, j) => g[j] += e * v); } w2 = w2.map((x, j) => x - 0.5 * (g[j]! / h + 0.01 * x)); }
  const sc = Z.map(z => sig(idx.reduce((s, j, k) => s + z[j]! * w2[k]!, 0))); const th2 = q(sc.slice(0, h), 0.7); const pn: number[] = []; for (let i = h; i < N; i++) if (sc[i]! > th2) pn.push(base[i - h]!);
  st.clueBotBOnly = { weights: Object.fromEntries(['bias', 'themeMatch', 'devFresh', 'linked', 'smartBuys'].map((k, j) => [k, +w2[j]!.toFixed(3)])), n: pn.length, hitRate: pn.filter(x => x > 0).length / pn.length, perTrade: pn.reduce((a, b) => a + b, 0) / pn.length };
  const corr = (a: number[], b: number[]) => { const ma = a.reduce((s, x) => s + x, 0) / a.length, mb = b.reduce((s, x) => s + x, 0) / b.length; let sab = 0, sa = 0, sb = 0; a.forEach((x, i) => { sab += (x - ma) * (b[i]! - mb); sa += (x - ma) ** 2; sb += (b[i]! - mb) ** 2; }); return sab / Math.sqrt(sa * sb); };
  const lB = coins.map(o => Math.log(o.B)); st.clueCorrWithLogB = Object.fromEntries(['themeMatch', 'uniqueShare', 'logBuys', 'devFresh', 'linked', 'smartBuys', 'followers', 'replies', 'logRet5m', 'logVol'].map((k, j) => [k, +corr(X.map(x => x[j + 1]!), lB).toFixed(3)])); } st.secs = (Date.now() - t0) / 1000;
// charts: 2 per post-hoc label from the population (first found), as plot2 expects
const charts: any[] = []; for (const k of TYPES) { const idx = coins.map((o, i) => i).filter(i => labs[i] === k).slice(0, 2); for (const i of idx) { const o = coins[i]!; charts.push({ type: k + ` (B=${Math.round(o.B)}, dev ${o.dev})`, grad: o.c.grad, px: o.c.px.map(x => +x.toPrecision(6)), vol: o.c.vol.map(x => Math.round(x)) }); } }
mkdirSync('../out/OBS', { recursive: true }); writeFileSync(process.env.OUT ?? '../out/OBS/data.json', JSON.stringify({ stats: st, knobs: K, charts })); if (process.env.METRICS) { const g = st.diag; console.log(JSON.stringify({ curve: CURVE, btt: st.bigThenTiny, btt_h1_nextActive: g.btt_h1_nextActive, p95_5m: st.m5p95_after5min, p99_5m: st.m5p99_after5min, grad: st.gradRate, dead: st.deadD7, rand: st.randBot.perTrade, ACF: st.ACF, labels: st.labels, peakByLabel: st.peakByLabel, clue: [st.clueBot.hitRate, st.clueBot.perTrade, st.clueBot.baselineAllAt5m.hitRate, st.clueBot.baselineAllAt5m.perTrade], clueBOnly: [st.clueBotBOnly.hitRate, st.clueBotBOnly.perTrade], pnd: st.pumpDump.median, shill: st.tinyShiller.median, serialRep: st.serialDumper.map((x: any) => x.rep), serial_dumper_rep_end: +sw.get('serial').rep.toFixed(4), serial_dumper_followers_last5: st.serialDumper.slice(-5).reduce((a: number, x: any) => a + x.followers, 0), secs: st.secs })); } else console.log(JSON.stringify(st));
