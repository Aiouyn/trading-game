// Approach A: rule-based trader types. One hidden attention level a(t) decays (half-life drawn per coin, same law for every type)
// with rare random news kicks; arrivals are Poisson(a). Coin type sets ONLY the starting attention and the trader mix.
import { Coin, lognorm, type Approach, type CType, type Trader } from './core';
const MIX: Record<CType, { a0: number; hype: number; mom: number; take: number; panic: number; devShare: number; devDump: number }> = {
  rug:     { a0: 0.35, hype: 0.6, mom: 0.2, take: 0.1, panic: 0.1, devShare: 0.08, devDump: 1 / 300 },
  quick:   { a0: 0.45, hype: 0.6, mom: 0.15, take: 0.1, panic: 0.15, devShare: 0.03, devDump: 1 / 3000 },
  grinder: { a0: 0.5, hype: 0.25, mom: 0.15, take: 0.4, panic: 0.2, devShare: 0.03, devDump: 1 / 6000 },
  trender: { a0: 0.9, hype: 0.3, mom: 0.4, take: 0.2, panic: 0.1, devShare: 0.03, devDump: 1 / 6000 },
  runner:  { a0: 1.6, hype: 0.3, mom: 0.35, take: 0.3, panic: 0.05, devShare: 0.02, devDump: 1 / 10000 },
};
const poisson = (r: () => number, l: number) => { let k = 0, p = Math.exp(-l), s = p; const u = r(); while (u > s && k < 50) { k++; p *= l / k; s += p; } return k; };
const A: Approach = {
  name: 'A',
  init(c: Coin, type: CType, r) {
    const m = MIX[type]; const dev: Trader = { id: 0, cash: 1e6, tok: 0, cost: 0, kind: 'dev', entry: 0, peak: 0 };
    let id = 1; const st = { m, a: m.a0 * lognorm(r, 1, 0.4), half: lognorm(r, 120, 0.8), hold: [] as Trader[], dev, nextId: () => id++, hi: [] as number[] };
    c.buy(dev, 250 * m.devShare / 0.03 * lognorm(r, 1, 0.3)); dev.entry = c.price(); return st;
  },
  step(c: Coin, st, r) {
    const m = st.m; const p = c.price();
    st.a *= Math.pow(0.5, 1 / st.half); if (r() < 0.0005) st.a += lognorm(r, m.a0 * 0.6, 0.7);
    st.hi.push(p); if (st.hi.length > 120) st.hi.shift(); const hi = Math.max(...st.hi);
    // dev: sometimes dumps everything
    if (st.dev.tok > 0 && r() < m.devDump) c.sell(st.dev, st.dev.tok);
    const n = poisson(r, st.a);
    for (let i = 0; i < n; i++) {
      let u = r(); const kind = (u -= m.hype) < 0 ? 'hype' : (u -= m.mom) < 0 ? 'mom' : (u -= m.take) < 0 ? 'take' : 'panic';
      if (kind === 'mom' && p < 0.98 * hi) continue; // momentum buyer only buys a new 10-minute high
      const tr: Trader = { id: st.nextId(), cash: lognorm(r, 60, 1.1), tok: 0, cost: 0, kind, entry: p, peak: p, born: c.t,
        hold: -Math.log(r() + 1e-9) * (kind === 'take' ? 1500 : 120), tp: 1.2 + r() * 0.8, sold: 0 };
      if (c.buy(tr, tr.cash) > 0) { tr.entry = c.price(); tr.peak = tr.entry; st.hold.push(tr); }
    }
    // exits, each by its own rule
    const coinPeak = Math.max(...st.hi);
    for (const tr of st.hold) {
      const q = c.price(); tr.peak = Math.max(tr.peak, q); const x = q / tr.entry; const age = c.t - tr.born;
      if (tr.kind === 'hype') { if (x >= tr.tp || age > tr.hold) c.sell(tr, tr.tok); }
      else if (tr.kind === 'mom') { if (q < 0.75 * tr.peak) c.sell(tr, tr.tok); }
      else if (tr.kind === 'take') { const lv = [2, 3, 5]; if (tr.sold < 3 && x >= lv[tr.sold]!) { c.sell(tr, tr.tok / (3 - tr.sold)); tr.sold++; } else if (age > tr.hold) c.sell(tr, tr.tok); }
      else { if (q < 0.7 * tr.peak || q < 0.6 * coinPeak) c.sell(tr, tr.tok); }
    }
    if (c.t % 50 === 0) st.hold = st.hold.filter((t: Trader) => t.tok >= 1);
  },
};
export default A;
