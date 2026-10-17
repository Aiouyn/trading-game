// usage: SEEDS=3 TICKS=8000 bun emo-run.ts  -> ../out/EMO/v14/data.json ; SANITY=300 prints graduation % and random-bot $/trade
import { launch, seed, rnd, type Kind, type W } from './EMO'; import { writeFileSync, mkdirSync } from 'fs';
const KINDS: Kind[] = ['rug', 'quick', 'grinder', 'trender', 'runner'], LIFE: Record<Kind, number> = { rug: 1440, quick: 1440, grinder: 8640, trender: 4320, runner: 10080 };
const OUT = process.env.OUT ?? '../out/EMO/v14'; mkdirSync(OUT, { recursive: true });
function run(kind: Kind, s: number, bot = false) {
  seed(s * 7919 + KINDS.indexOf(kind)); const c = launch(kind); let trades = 0;
  const me: W = { id: -1, cash: 1e9, tok: 0, cost: 0, greed: 0, fear: 0, bored: 0, tp: 0, fomo: 0, nerve: 0, pat: 0, next: 0, gone: false, buys: 0, every: 1, t0: 0 }; let spent = 0;
  for (let t = 0; t < LIFE[kind] && !c.dead(); t++) { c.step(); if (bot && rnd() < 0.01) { if (me.tok > 1 && rnd() < 0.5) c.sell(me, me.tok); else { c.buy(me, 50); spent += 50; } trades++; } }
  if (bot && me.tok > 1) { c.sell(me, me.tok); trades++; }
  return { c, botPnl: me.cash - 1e9, trades };
}
if (process.env.SANITY) {
  const N = +process.env.SANITY, mix: Kind[] = []; for (let i = 0; i < N; i++) { const r = i / N; mix.push(r < 0.08 ? 'rug' : r < 0.85 ? 'quick' : r < 0.95 ? 'grinder' : r < 0.99 ? 'trender' : 'runner'); }
  let g = 0, pnl = 0, tr = 0; mix.forEach((k, i) => { const r = run(k, 1000 + i, true); if (r.c.grad >= 0) g++; pnl += r.botPnl; tr += r.trades; });
  console.log(`SANITY N=${N} (mix 8% rug/77% quick/10% grinder/4% trender/1% runner): graduation ${(100 * g / N).toFixed(1)}%, random bot ${(pnl / Math.max(1, tr)).toFixed(2)} $/trade over ${tr} trades`);
} else {
  const charts: any[] = [], SEEDS = +(process.env.SEEDS ?? 3);
  for (const k of KINDS) for (let s = 1; s <= SEEDS; s++) { const { c } = run(k, s); const pk = Math.max(...c.px);
    charts.push({ type: `${k} s${s}`, px: c.px, vol: c.vol, grad: c.grad, clues: c.clues(), aud: c.aud });
    console.log(k, s, 'aud', c.aud, 'peak x', (pk / c.px[0]).toFixed(1), 'peak at min', (c.px.indexOf(pk) / 12).toFixed(0), 'life h', (c.px.length / 720).toFixed(1), 'grad', c.grad); }
  writeFileSync(`${OUT}/data.json`, JSON.stringify({ charts }));
}
