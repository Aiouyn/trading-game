/**
 * Load test of the world tick (bible Phase 1 gate: p99 tick < 2.5 s at 4k concurrent players).
 * Builds a world with N active players who each hold positions, businesses and property and keep
 * placing orders, then measures stepGame plus the per-player view the server builds every tick.
 *   npx tsx scripts/load/world-load.ts [players=4000] [ticks=120]
 */
import { BUSINESSES } from '../../src/content/businesses';
import { applyCommand, createGame, stepGame } from '../../src/world/game';
import { credit } from '../../src/world/core';
import { marketFrame, playerView } from '../../src/world/view';
import type { GameState } from '../../src/world/types';

const N = Number(process.argv[2] ?? 4000);
const TICKS = Number(process.argv[3] ?? 120);
const g: GameState = createGame('load', { warmupDays: 1 });
/** stocks listed now: listings add assets during the run, and a delisted one rejects orders */
const liveStocks = () => g.market.config.assets.filter((a) => a.assetClass === 'stock' && !a.delisted).map((a) => a.id);
let stocks = liveStocks();
const t1 = BUSINESSES.filter((b) => b.tier === 1);

let t0 = performance.now();
for (let i = 0; i < N; i++) {
  const id = `p${i}`;
  applyCommand(g, id, { type: 'join', handle: `player${i}`, country: 'FR' });
  credit(g, id, 30_000, 'test');
  const p = g.players[id]!;
  p.onboarding.skipped = true;
  p.online = true;
  for (let k = 0; k < 3; k++) applyCommand(g, id, { type: 'order.place', order: { assetId: stocks[(i * 7 + k * 13) % stocks.length]!, side: 'buy', type: 'market', qty: 5 } });
  applyCommand(g, id, { type: 'order.place', order: { assetId: stocks[(i * 3) % stocks.length]!, side: 'buy', type: 'limit', qty: 2, limitPrice: 1 } });
  applyCommand(g, id, { type: 'biz.buy', defId: t1[i % t1.length]!.id, cityId: 'avalon' });
}
console.log(`setup ${N} players: ${((performance.now() - t0) / 1000).toFixed(1)} s`);

const step: number[] = [];
const views: number[] = [];
for (let t = 0; t < TICKS; t++) {
  stocks = liveStocks();
  // a slice of players acts every tick, like a busy world
  for (let k = 0; k < Math.ceil(N / 50); k++) {
    const i = (t * 97 + k * 31) % N;
    applyCommand(g, `p${i}`, { type: 'order.place', order: { assetId: stocks[(t + k) % stocks.length]!, side: k % 2 ? 'buy' : 'sell', type: 'market', qty: 1 } });
  }
  t0 = performance.now();
  stepGame(g);
  step.push(performance.now() - t0);
  t0 = performance.now();
  JSON.stringify(marketFrame(g));
  for (let i = 0; i < N; i++) JSON.stringify(playerView(g, `p${i}`));
  views.push(performance.now() - t0);
}
const pct = (a: number[], q: number) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))]!;
console.log(`stepGame  p50 ${pct(step, 0.5).toFixed(0)} ms · p99 ${pct(step, 0.99).toFixed(0)} ms · max ${Math.max(...step).toFixed(0)} ms`);
console.log(`views     p50 ${pct(views, 0.5).toFixed(0)} ms · p99 ${pct(views, 0.99).toFixed(0)} ms (${N} private views + frame per tick)`);
const total = step.map((s, i) => s + views[i]!);
console.log(`tick total p99 ${pct(total, 0.99).toFixed(0)} ms (gate: 2500 ms) → ${pct(total, 0.99) < 2500 ? 'PASS' : 'FAIL'}`);
