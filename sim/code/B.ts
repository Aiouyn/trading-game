// Approach B: traders copy each other (Hawkes-like). New-buyer arrivals = a decaying base rate + excitation from recent buys and
// recent dollar volume; each holder's chance to sell rises with recent sells. Every trader has an entry price and a simple exit rule
// (take profit at k x entry, stop at s x entry, or follow the selling crowd). Coin type sets ONLY the base attention and the mix.
import { Coin, lognorm, type Approach, type CType, type Trader } from './core';
const MIX: Record<CType, { mu0: number; tight: number; dev: number }> = {
  rug:     { mu0: 0.25, tight: 0.5, dev: 1 },   // tight = share of traders with quick exits (TP 1.2-1.6x, stop 0.85x)
  quick:   { mu0: 0.3, tight: 0.4, dev: 0 },
  grinder: { mu0: 0.3, tight: 0.2, dev: 0 },
  trender: { mu0: 1.2, tight: 0.2, dev: 0 },
  runner:  { mu0: 2.5, tight: 0.1, dev: 0 },
};
const DEC = Math.exp(-1 / 24); // excitation memory ~2 minutes
const A_B = 0.03, A_V = 0.001, A_SB = 0.0, H0 = 0.0001, A_S = 0.00015; // buy->buy, $vol->buy, sell->buy (dip buyers), sell->sell
const poisson = (r: () => number, l: number) => { let k = 0, p = Math.exp(-l), s = p; const u = r(); while (u > s && k < 60) { k++; p *= l / k; s += p; } return k; };
const B: Approach = {
  name: 'B',
  init(c: Coin, type: CType, r) {
    const m = MIX[type]; let id = 1;
    const st = { m, mu: m.mu0 * lognorm(r, 1, 0.4), half: lognorm(r, 300, 1.0), eB: 0, eS: 0, eV: 0, hold: [] as Trader[], id: () => id++, dev: null as Trader | null };
    if (m.dev) { const d: Trader = { id: 0, cash: 1e6, tok: 0, cost: 0, kind: 'dev', entry: 0, peak: 0 }; c.buy(d, lognorm(r, 600, 0.4)); st.dev = d; }
    return st;
  },
  step(c: Coin, st, r) {
    const m = st.m; let nb = 0, ns = 0, v0 = c.curTickVol;
    st.mu *= Math.pow(0.5, 1 / st.half);
    if (st.dev && st.dev.tok > 0 && r() < 0.004 + 0.02 * st.eB / 10) { c.sell(st.dev, st.dev.tok); ns++; } // dev sells into buying
    const lam = st.mu + A_B * st.eB + A_V * st.eV + A_SB * st.eS;
    const n = poisson(r, Math.min(lam, 40));
    for (let i = 0; i < n; i++) {
      const tight = r() < m.tight; const p = c.price();
      const tr: Trader = { id: st.id(), cash: lognorm(r, 60, 1.1), tok: 0, cost: 0, kind: tight ? 't' : 'l', entry: p, peak: p,
        tp: tight ? 1.2 + 0.4 * r() : 1.5 * Math.pow(20, r()), sl: tight ? 0.85 : 0.5 + 0.2 * r(), herd: tight ? 2 : 1 };
      if (c.buy(tr, tr.cash) > 0) { tr.entry = c.price(); st.hold.push(tr); nb++; }
    }
    const hz = H0 + A_S * st.eS;
    for (const tr of st.hold) {
      if (tr.tok < 1) continue; const x = c.price() / tr.entry;
      if (x >= tr.tp || x <= tr.sl || r() < hz * tr.herd) { c.sell(tr, tr.tok); ns++; }
    }
    st.eB = st.eB * DEC + nb; st.eS = st.eS * DEC + ns; st.eV = st.eV * DEC + (c.curTickVol - v0) / 200;
    if (c.t % 50 === 0) st.hold = st.hold.filter((t: Trader) => t.tok >= 1);
  },
};
export default B;
