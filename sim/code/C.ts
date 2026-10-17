// Approach C v2: empirical. The time to the next trade, its size and the base buy share are sampled from the cleaned real Pump.fun
// corpus (Slinky21 trades-00000, 17,967 launch-observed coins), given the coin's age and its trades in the last 60 s (sim/c-table.json,
// built by refs-real/corpus/table.py). Sizes map real SOL to game dollars by the curves' virtual cash (30 SOL ~ X0 $15,000: x500).
// Traders only choose buy or sell, from one sentiment value. Coin type sets ONLY the starting attention (it divides the sampled gaps,
// fading to 1) and the trader mix (trend-followers vs contrarians, and their lean).
import TAB from './c-table.json';
import { Coin, type Approach, type CType, type Trader, lognorm } from './core';
const T_ = TAB as Record<string, { gap: number[]; sol: number[]; buyShare: number }>;
const AB = [30, 120, 600, 3600], CB = [0, 3, 15];
const bucket = (age: number, act: number) => { let a = 0; while (a < 4 && age >= AB[a]!) a++; let c = 0; if (act > 0) { c = 1; while (c < 3 && act > CB[c]!) c++; } return T_[`${a},${c}`] ?? T_[`${a},0`]!; };
const pick = (a: number[], r: () => number) => a[Math.floor(r() * a.length)]!;
const MIX: Record<CType, { a0: number; trend: number; bias: number }> = {
  rug:     { a0: 1.0, trend: 0.3, bias: -0.3 },
  quick:   { a0: 1.0, trend: 0.4, bias: -0.1 },
  grinder: { a0: 3, trend: 0.4, bias: 0.05 },
  trender: { a0: 10, trend: 0.6, bias: 0.1 },
  runner:  { a0: 25, trend: 0.7, bias: 0.15 },
};
const C: Approach = {
  name: 'C',
  init(c: Coin, type: CType, r) {
    const crowd: Trader = { id: 1, cash: 1e12, tok: 0, cost: 0, kind: 'crowd', entry: 0, peak: 0 };
    return { m: MIX[type], a0: MIX[type].a0 * lognorm(r, 1, 0.3), half: lognorm(r, 1500, 0.8), crowd, next: 0, times: [] as number[], ids: 2 };
  },
  step(c: Coin, st, r) {
    const m = st.m, end = (c.t + 1) * 5;
    while (st.next < end) {
      const now = st.next; while (st.times.length && st.times[0] < now - 60) st.times.shift();
      const b = bucket(now, st.times.length);
      const px = c.px; const p = c.price(); const ref = px.length > 12 ? px[px.length - 12]! : px[0] ?? p; const ret = Math.log(p / ref);
      const follower = r() < m.trend; const base = Math.log(b.buyShare / (1 - b.buyShare));
      const s = base + m.bias + (follower ? 1 : -1) * 6 * ret;
      const buy = r() < 1 / (1 + Math.exp(-s)) || st.crowd.tok < 1;
      const tr = { ...st.crowd, id: r() < 0.5 ? st.ids++ : 2 + Math.floor(r() * (st.ids - 2)) };
      const usd = pick(b.sol, r) * 500;
      if (buy) { const before = tr.tok; c.buy(tr, usd); st.crowd.tok += tr.tok - before; }
      else { const q = Math.min(st.crowd.tok, usd / p); c.sell(tr, q); st.crowd.tok = tr.tok; }
      st.times.push(now);
      const att = 1 + (st.a0 - 1) * Math.pow(0.5, now / 5 / st.half);
      let g = pick(b.gap, r); while (g >= 3600 && r() > 1 / att) g = pick(b.gap, r); // attention keeps a coin from going quiet
      st.next = now + Math.max(0.01, g / att);
    }
  },
};
export default C;
