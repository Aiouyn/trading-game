import { runCoin, pickType, rng, TYPES, TPD, T, type Approach, type CType } from './core';
import { writeFileSync } from 'fs';
const name = process.argv[2]!; const N = +(process.argv[3] ?? 300);
import A from './A'; import B from './B'; import C from './C'; import AH from './AH';
const ap: Approach = ({ A, B, C, AH } as any)[name];
const q = (a: number[], p: number) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]!; };
export function stats(coins: { px: number[]; vol: number[]; nTr?: number[]; grad?: number }[]) {
  const D = { bt_next01: 0, big_h1: 0, bt_h1: 0, big_h1_nextact: 0, bt_h1_nextact: 0 }; // v8 diagnosis (same bars)
  const m5: number[] = [], m5l: number[] = []; let big = 0, bt = 0, n15 = 0, dead = 0;
  for (const c of coins) {
    for (let t = 1; t < c.px.length; t++) if (c.vol[t]! > 0) { const a = Math.abs(c.px[t]! / c.px[t - 1]! - 1); m5.push(a); if (t > 60) m5l.push(a); }
    const cl: number[] = [], v: number[] = [];
    for (let t = 2; t < c.px.length; t += 3) { cl.push(c.px[t]!); v.push(c.vol[t]! + c.vol[t - 1]! + c.vol[t - 2]!); }
    for (let i = 1; i < cl.length - 1; i++) { if (!(v[i]! > 0)) continue; n15++; const a = Math.abs(cl[i]! / cl[i - 1]! - 1);
      if (a >= 0.05) { big++; const isbt = Math.abs(cl[i + 1]! / cl[i]! - 1) < 0.01; if (isbt) bt++;
        const k = 3 * (i + 1) + 2; const nn = c.nTr ? (c.nTr[k]! + c.nTr[k - 1]! + c.nTr[k - 2]!) : 99; const h1 = i * 15 < 3600;
        if (isbt && nn <= 1) D.bt_next01++; if (h1) { D.big_h1++; if (isbt) D.bt_h1++; if (nn >= 2) { D.big_h1_nextact++; if (isbt) D.bt_h1_nextact++; } } } }
    const L = c.px.length; if (L >= T) { const pk = Math.max(...c.px); const last = c.px.slice(L - TPD); const lv = c.vol.slice(L - TPD).reduce((a, b) => a + b, 0);
      if (Math.max(...last) < 0.1 * pk || lv < 100) dead++; }
  }
  // v6: ACF of |15s ret| at lags 1-10, first hour, coins with >= 40 active candles, deviations from each coin's own mean, pooled
  const acf: number[] = Array(11).fill(0); let a0 = 0;
  for (const c of coins) { const r: number[] = []; for (let t = 5; t < Math.min(c.px.length, 720); t += 3) r.push(Math.abs(c.px[t]! / c.px[t - 3]! - 1));
    if (r.filter(x => x > 0).length < 40) continue; const mu = r.reduce((a, b) => a + b, 0) / r.length; const d = r.map(x => x - mu);
    for (let i = 0; i < d.length; i++) { a0 += d[i]! * d[i]!; for (let L = 1; L <= 10; L++) if (i + L < d.length) acf[L]! += d[i]! * d[i + L]!; } }
  const ACF = acf.slice(1).map(x => +(x / a0).toFixed(3));
  return { ACF, diag: { ...D, bt_share_next01: D.bt_next01 / bt, btt_h1: D.bt_h1 / D.big_h1, btt_h1_nextActive: D.bt_h1_nextact / D.big_h1_nextact }, coins: coins.length, bigThenTiny: big ? bt / big : NaN, bigCandles: big, active15s: n15, m5p95: q(m5, 0.95), m5p99: q(m5, 0.99), m5p95_after5min: q(m5l, 0.95), m5p99_after5min: q(m5l, 0.99), deadD7: dead / coins.length };
}
if (name && name !== 'lib' && !process.argv[1]!.includes('refstats')) {
  const t0 = Date.now(); const res = []; const types: Record<string, number> = {};
  for (let i = 0; i < N; i++) { const ty = pickType(((r) => (r(), r(), r(), r))(rng(1000003 + i * 7))); types[ty] = (types[ty] ?? 0) + 1; res.push(runCoin(ap, i + 1, ty)); }
  const s: any = stats(res.map(r => r.c)); s.gradRate = res.filter(r => r.c.grad >= 0).length / N; s.types = types;
  const rb = res.map(r => r.rand).filter((x): x is number => x !== null), tb = res.map(r => r.tell).filter((x): x is number => x !== null);
  s.randBot = { n: rb.length, perTrade: rb.reduce((a, b) => a + b, 0) / rb.length }; s.tellBot = { n: tb.length, perTrade: tb.length ? tb.reduce((a, b) => a + b, 0) / tb.length : NaN };
  s.mcap0 = res[0]!.c.px[0]! * 1e9; s.peakByType = Object.fromEntries(TYPES.map(k => { const g = res.filter(r => r.type === k).map(r => Math.max(...r.c.px) / r.c.px[0]!); return [k, g.length ? [q(g, 0.5), q(g, 0.9), Math.max(...g)].map(x => +x.toFixed(1)) : null]; }));
  const peaks = res.map(r => Math.max(...r.c.px) / r.c.px[0]!); s.peakMult = { p50: q(peaks, 0.5), p90: q(peaks, 0.9), p99: q(peaks, 0.99), max: Math.max(...peaks) };
  s.gradByType = Object.fromEntries(TYPES.map(k => { const g = res.filter(r => r.type === k); return [k, g.length ? +(g.filter(r => r.c.grad >= 0).length / g.length).toFixed(2) : null]; }));
  s.secs = (Date.now() - t0) / 1000;
  // chart coins: forced mix (2 rug, 2 quick, 2 grinder, 2 trender, 2 runner), seeds 9001+
  const mix: CType[] = ['rug', 'rug', 'quick', 'quick', 'grinder', 'grinder', 'trender', 'trender', 'runner', 'runner'];
  const charts = mix.map((ty, i) => { const r = runCoin(ap, 9001 + i, ty); return { type: ty, grad: r.c.grad, px: r.c.px.map(x => +x.toPrecision(6)), vol: r.c.vol.map(x => Math.round(x)) }; });
  writeFileSync(process.env.OUT ?? `../out/${name}/data.json`, JSON.stringify({ stats: s, charts })); console.log(name, JSON.stringify(s));
}
