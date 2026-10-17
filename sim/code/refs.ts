// References: the recorded Pump.fun flows replayed trade by trade through the same real curve (1 corpus tick = one 5 s tick, assumed).
import flows from '../repo/src/world/launchpad/historical-flow.json';
import { Coin, type Trader } from './core'; import { writeFileSync } from 'fs';
const out = (flows as { kind: string; events: number[][] }[]).map((f, i) => {
  const c = new Coin(); const tr: Trader = { id: 1, cash: 1e12, tok: 0, cost: 0, kind: 'crowd', entry: 0, peak: 0 }; let k = 0;
  const last = f.events.length ? f.events[f.events.length - 1]![0]! : 0;
  for (let t = 0; t <= last; t++) {
    while (k < f.events.length && f.events[k]![0] === t) { const s = f.events[k]![1]!; tr.id = 2 + f.events[k]![2]!;
      if (s > 0) c.buy(tr, s * (c.pool ? c.pool.x : 15_000 / (c.y / 1_073_000_000))); else c.sell(tr, Math.min(tr.tok, -s * (c.pool ? c.pool.y : c.y))); k++; }
    c.endTick();
  }
  return { i, kind: f.kind, n: f.events.length, grad: c.grad, px: c.px.map(x => +x.toPrecision(6)), vol: c.vol.map(x => Math.round(x)) };
});
writeFileSync('../out/refs/corpus.json', JSON.stringify(out));
for (const o of out) { const pk = Math.max(...o.px) / o.px[0]!, fin = o.px[o.px.length - 1]! / Math.max(...o.px); console.log(o.i, o.kind, o.n, o.px.length, pk.toFixed(2), fin.toFixed(2), o.grad); }
