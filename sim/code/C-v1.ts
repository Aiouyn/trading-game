// Approach C: empirical. How many trades happen each 5 s tick, and each trade's size (a share of the reserve), are sampled from the
// recorded Pump.fun flows (repo historical-flow.json, 96 coins, 10,356 trades), given the coin's age and its activity over the last
// minute. Traders only choose buy or sell, from one sentiment value (recent return x the trader mix + noise). Coin type sets ONLY
// the starting attention (which thins the sampled flow as it decays) and the mix of trend-followers vs contrarians.
import flows from '../repo/src/world/launchpad/historical-flow.json';
import { Coin, lognorm, type Approach, type CType, type Trader } from './core';
import { spotAt } from '../repo/src/world/launchpad/curve';
const ageB = (a: number) => (a < 6 ? 0 : a < 20 ? 1 : a < 50 ? 2 : 3);
const actB = (n: number) => (n === 0 ? 0 : n <= 5 ? 1 : n <= 30 ? 2 : 3);
const COUNTS: number[][][] = [0, 1, 2, 3].map(() => [0, 1, 2, 3].map(() => [] as number[]));
const BUYS: number[] = [], SELLS: number[] = [];
for (const f of flows as { events: number[][] }[]) {
  const e = f.events; if (!e.length) continue; const last = e[e.length - 1]![0]!; const per = new Array(last + 1).fill(0);
  for (const x of e) { per[x[0]!]++; if (x[1]! > 0) BUYS.push(x[1]!); else if (x[1]! < 0) SELLS.push(-x[1]!); }
  for (let t = 0; t <= last; t++) { let w = 0; for (let k = Math.max(0, t - 12); k < t; k++) w += per[k]; COUNTS[ageB(t)]![actB(w)]!.push(per[t]); }
}
const pick = <T,>(a: T[], r: () => number) => a[Math.floor(r() * a.length)]!;
const MIX: Record<CType, { a0: number; trend: number; bias: number }> = {
  rug:     { a0: 0.9, trend: 0.3, bias: -0.35 }, // trend = share of trend-followers (rest are contrarians); bias = their lean
  quick:   { a0: 1.5, trend: 0.5, bias: -0.15 },
  grinder: { a0: 1.2, trend: 0.4, bias: 0.05 },
  trender: { a0: 1.5, trend: 0.65, bias: 0.05 },
  runner:  { a0: 2.0, trend: 0.75, bias: 0.1 },
};
const C: Approach = {
  name: 'C',
  init(c: Coin, type: CType, r) {
    const crowd: Trader = { id: 1, cash: 1e9, tok: 0, cost: 0, kind: 'crowd', entry: 0, peak: 0 };
    return { m: MIX[type], att: MIX[type].a0 * lognorm(r, 1, 0.3), half: lognorm(r, 500, 0.7), crowd, win: [] as number[], ids: 2 };
  },
  step(c: Coin, st, r) {
    const m = st.m; st.att *= Math.pow(0.5, 1 / st.half);
    const w = st.win.reduce((a: number, b: number) => a + b, 0);
    const bucket = COUNTS[ageB(c.t)]![actB(w)]!; const k0 = bucket.length ? pick(bucket, r) : 0;
    let n = 0; for (let i = 0; i < k0; i++) if (r() < Math.min(1, st.att)) n++;
    const px = c.px, p = c.price(); const ref = px.length > 12 ? px[px.length - 12]! : spotAt(1_073_000_000); const ret = Math.log(p / ref);
    for (let i = 0; i < n; i++) {
      const follower = r() < m.trend; const s = (follower ? 1 : -1) * 8 * ret + m.bias + 0.6 * (r() - 0.5) * 2;
      const buy = r() < 1 / (1 + Math.exp(-3 * s)) || st.crowd.tok < 1;
      const id = r() < 0.5 ? st.ids++ : 2 + Math.floor(r() * (st.ids - 2));
      if (buy) { const res = c.pool ? 15_000 / (273_000_000 / 1_073_000_000) : 15_000 / (c.y / 1_073_000_000); /* $ sizes keyed to the curve reserve, frozen at its graduation value after migration */ const tr = { ...st.crowd, id }; const before = tr.tok;
        c.buy(tr, pick(BUYS, r) * res); st.crowd.tok += tr.tok - before; st.crowd.cash = tr.cash; }
      else { const res = c.pool ? 273_000_000 : c.y; const q = Math.min(st.crowd.tok, pick(SELLS, r) * res);
        const tr = { ...st.crowd, id }; c.sell(tr, q); st.crowd.tok = tr.tok; st.crowd.cash = tr.cash; }
    }
    st.win.push(n); if (st.win.length > 12) st.win.shift();
  },
};
export default C;
