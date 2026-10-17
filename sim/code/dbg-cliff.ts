// cliff diagnosis: replay chart coins (seed 9001+i) and log every pool trade in the 3 15s candles around the price top
import { runCoin, setLog } from './core'; import AH from './AH'; import { writeFileSync } from 'fs';
const out: any = {};
for (const [name, i, ty] of [['runner9', 8, 'runner'], ['trender7', 6, 'trender']] as const) {
  const a = runCoin(AH, 9001 + i, ty); const px = a.c.px; let top = px.indexOf(Math.max(...px)); if (process.env.DROP) { let w = 0, k = 0; for (let t = 1; t < px.length; t++) { const d = px[t - 1]! / px[t]!; if (d > w) { w = d; k = t; } } top = k - 1; } const c0 = Math.floor(top / 3) * 3 - 3, c1 = c0 + 9; // candle before, top candle, candle after (+1 for the drop)
  const ev: any[] = []; setLog((e: any) => { e.src = (globalThis as any).SRC; if (e.t >= c0 && e.t < c1 + 3) ev.push({ ...e, pxB: e.xBefore / 2e8, pxA: e.x / 2e8 }); });
  const b = runCoin(AH, 9001 + i, ty); setLog(null);
  out[name] = { grad: a.c.grad, top, topMcap: px[top]! * 1e9, window: [c0, c1 + 3], px: px.slice(c0 - 30, c1 + 30), mcapAfter: px.slice(top, top + 13).map(x => Math.round(x * 1e9)), events: ev,
    sum: { n: ev.length, sells: ev.filter(e => e.side === 'S').length, sellUsd: ev.filter(e => e.side === 'S').reduce((s, e) => s + e.usd, 0), buyUsd: ev.filter(e => e.side === 'B').reduce((s, e) => s + e.usd, 0), clips: ev.filter(e => e.clip).length, tapers: ev.filter(e => e.taper).length } };
}
writeFileSync(process.env.DOUT ?? '/tmp/cliff.json', JSON.stringify(out)); for (const k in out) console.log(k, out[k].grad, out[k].top, Math.round(out[k].topMcap), JSON.stringify(out[k].sum), out[k].mcapAfter.join(' '));
