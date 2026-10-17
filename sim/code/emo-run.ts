// usage: N=400 bun emo-run.ts -> ../out/EMO/v14.2/{data.json,mix.json}; SANITY=300 prints graduation %, random-bot $/trade by label
import { launch, seed, rnd, type W, type Coin } from './EMO'; import { writeFileSync, mkdirSync } from 'fs';
const OUT = process.env.OUT ?? '../out/EMO/v14.6', MAXT = 12960; mkdirSync(OUT, { recursive: true });
export function label(c: Coin) { // post-hoc, from the chart only (plus: dev sold early = rug)
  const pk = Math.max(...c.px), x = pk / c.px[0], pkT = c.px.indexOf(pk);
  if (c.devSold >= 0 && c.devSold < 720) return 'rug'; if (x < 5) return 'quick'; if (x >= 100) return 'runner'; return pkT > 2160 ? 'grinder' : 'trender';
}
function run(s: number, bot = false) {
  seed(s * 7919 + 17); const c = launch(); let trades = 0;
  const me: W = { id: -1, cash: 1e9, tok: 0, cost: 0, greed: 0, fear: 0, bored: 0, tp: 0, fomo: 0, nerve: 0, pat: 0, next: 0, gone: false, buys: 0, every: 1, size: 1, slip: 1, lag: 0, pendB: 0, pendS: 0, doubt: 0, lb: 0, dipTh: 0, dRate: 0, stop: 0, defend: 0, conv: 1, wasDown: false, lastAdd: 0, adds: 9, tIn: 0, defHL: 1, panTh: 0, snipe: false, hold: 0, stopped: true, t0: 0 };
  for (let t = 0; t < MAXT && !c.dead(); t++) { c.step(); if (bot && rnd() < 0.01) { if (me.tok > 1 && rnd() < 0.5) c.sell(me, me.tok); else c.buy(me, 50); trades++; } }
  if (bot && me.tok > 1) { c.sell(me, me.tok); trades++; }
  return { c, lab: label(c), botPnl: me.cash - 1e9, trades };
}
const N = +(process.env.SANITY ?? process.env.N ?? 400), bot = !!process.env.SANITY, by: any = {}; let g = 0, pnl = 0, tr = 0; const all: any[] = [];
for (let i = 0; i < N; i++) {
  const r = run((bot ? 5000 : 1) + i, bot), c = r.c, pk = Math.max(...c.px); if (c.grad >= 0) g++; pnl += r.botPnl; tr += r.trades;
  const b = by[r.lab] ??= { n: 0, grad: 0, pnl: 0, tr: 0 }; b.n++; b.grad += c.grad >= 0 ? 1 : 0; b.pnl += r.botPnl; b.tr += r.trades;
  if (!bot) all.push({ seed: i, type: `${r.lab} s${i + 1} aud${c.tr.aud}`, lab: r.lab, peakx: pk / c.px[0], lifeH: c.px.length / 720, grad: c.grad }); // summary only (fast scan); charts re-run their seed
}
const mix = Object.fromEntries(Object.entries(by).map(([k, b]: any) => [k, `${b.n} (${(100 * b.n / N).toFixed(1)}%), grad ${b.grad}`]));
if (bot) {
  console.log(`SANITY N=${N}: graduation ${(100 * g / N).toFixed(1)}%, random bot ${(pnl / Math.max(1, tr)).toFixed(2)} $/trade over ${tr} trades`);
  for (const k in by) { const b = by[k]; console.log(`  ${k}: ${b.n} coins, grad ${b.grad}, bot $${b.pnl.toFixed(0)} over ${b.tr} trades = ${(b.pnl / Math.max(1, b.tr)).toFixed(2)} $/trade`); }
} else {
  console.log('MIX', N, JSON.stringify(mix), 'grad%', (100 * g / N).toFixed(1));
  // chart set: up to 3 per label (largest variety) + every coin closest to a real reference (peak multiple, lifetime)
  const REFS: [string, number, number][] = JSON.parse(process.env.REFS ?? '[]'); const pick = new Set<number>();
  for (const [, px, lh] of REFS) { let bi = 0, bd = 1e9; all.forEach((c, i) => { const d = Math.log(c.peakx / px) ** 2 + Math.log((c.lifeH + 0.05) / (lh + 0.05)) ** 2; if (d < bd) { bd = d; bi = i; } }); pick.add(bi); }
  for (const l of ['rug', 'quick', 'trender', 'grinder', 'runner']) all.map((c, i) => [c, i]).filter(([c]) => c.lab === l).slice(0, 3).forEach(([, i]) => pick.add(i as number));
  all.map((c, i) => [c, i] as [any, number]).filter(([c]) => c.lab === 'runner').sort((a, b) => b[0].peakx - a[0].peakx).slice(0, 3).forEach(([, i]) => pick.add(i)); // 3 best runners
  const charts = [...pick].sort((a, b) => a - b).map(i => { const r = run(1 + all[i].seed), c = r.c; return { ...all[i], px: c.px, vol: c.vol, clues: c.clues(), traits: c.tr }; });
  writeFileSync(`${OUT}/data.json`, JSON.stringify({ charts })); writeFileSync(`${OUT}/mix.json`, JSON.stringify({ N, mix, gradPct: 100 * g / N, coins: all.map(c => ({ type: c.type, peakx: +c.peakx.toFixed(2), lifeH: +c.lifeH.toFixed(2), grad: c.grad })) }, null, 0));
}
