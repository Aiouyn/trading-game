// Approach A-hybrid: A's trader types, with WHEN trades happen and HOW BIG they are drawn from the cleaned real Pump.fun corpus
// (sim/c-table.json: gap to next trade, size in SOL x500, given coin age and trades in the last 60 s). Hidden attention divides the
// sampled gaps (and keeps the coin from going quiet); it fades on a half-life that is 4x slower while price sits 35%+ under its
// 1-hour high, so dip buyers keep arriving after a crash. Every trader draws their own stop/trail/target (no crowd of identical
// stops). Coin type sets ONLY the starting attention and the trader mix. After graduation, sizes follow the PumpSwap hour sample's
// size-to-market-cap shape (never its timing).
import TAB from './c-table.json';
import PS from './ps-shares.json'; // PumpSwap hour sample: trade size as a share of market cap (shape only, after graduation)
import { Coin, lognorm, type Approach, type CType, type Trader } from './core';
const T_ = TAB as Record<string, { gap: number[]; sol: number[]; n: number; buyShare: number }>;
const AB = [30, 120, 600, 3600], CB = [0, 3, 15];
// timing and size are conditioned on activity (trades in the last 60 s) pooled over ages >= 30 s, so the corpus's own early-death
// mix is not baked in; age only separates the launch burst (first 30 s)
const POOL = (c: number, a0: boolean) => { const ks = a0 ? ['0,' + c] : ['1,' + c, '2,' + c, '3,' + c, '4,' + c];
  const n = ks.reduce((a, k) => a + (T_[k]?.n ?? 0), 0), nb = ks.reduce((a, k) => a + (T_[k]?.n ?? 0) * (T_[k]?.buyShare ?? 0), 0);
  return { gap: ks.flatMap(k => T_[k]?.gap.filter(g => g < 3600) ?? []), sol: ks.flatMap(k => T_[k]?.sol ?? []), sell: 1 - nb / n }; };
const TABLE = [true, false].map(a0 => [0, 1, 2, 3].map(c => POOL(c, a0)));
const bucket = (age: number, act: number) => { let c = 0; if (act > 0) { c = 1; while (c < 3 && act > CB[c]!) c++; } return TABLE[age < 30 ? 0 : 1]![c]!; };
const pick = (a: number[], r: () => number) => a[Math.floor(r() * a.length)]!;
type Mix = { a0: number; hype: number; dip: number; mom: number; take: number; panic: number; dev: number; devDump: number; snipers: number; firm: number }; // firm: share of arrivals who only sell by their own rule
const MIX: Record<CType, Mix> = {
  rug:     { a0: 1.2, hype: 0.5, dip: 0.1, mom: 0.15, take: 0.1, panic: 0.15, dev: 0.08, devDump: 1 / 200, snipers: 6 , firm: 0.05 },
  quick:   { a0: 1.2, hype: 0.5, dip: 0.1, mom: 0.15, take: 0.1, panic: 0.15, dev: 0.03, devDump: 1 / 3000, snipers: 5 , firm: 0.1 },
  grinder: { a0: 1.5, hype: 0.25, dip: 0.2, mom: 0.15, take: 0.25, panic: 0.15, dev: 0.03, devDump: 1 / 8000, snipers: 3 , firm: 0.25 },
  trender: { a0: 2.5, hype: 0.25, dip: 0.2, mom: 0.25, take: 0.2, panic: 0.1, dev: 0.02, devDump: 1 / 10000, snipers: 4 , firm: 0.35 },
  runner:  { a0: 3, hype: 0.25, dip: 0.2, mom: 0.25, take: 0.25, panic: 0.05, dev: 0.02, devDump: 1 / 20000, snipers: 4 , firm: 0.5 },
};
const DENS = 1.6, SIZE = 0.35, G = 0.06, HE = 360;
const KINDS = ['hype', 'dip', 'mom', 'take', 'panic'] as const;
const AH: Approach = {
  name: 'AH',
  init(c: Coin, type: CType, r) {
    const m = MIX[type]; let id = 1; const dev: Trader = { id: 0, cash: 1e6, tok: 0, cost: 0, kind: 'dev', entry: 0, peak: 0 };
    const st = { m, a: m.a0 * lognorm(r, 1, 0.3), half: lognorm(r, 900, 0.6), hold: [] as Trader[], dev, nid: () => id++, next: 0, times: [] as number[], hi: [] as number[], E: 0 };
    c.buy(dev, 250 * m.dev / 0.03 * lognorm(r, 1, 0.3));
    for (let i = 0; i < m.snipers; i++) { const s: Trader = { id: st.nid(), cash: lognorm(r, 300, 0.6), tok: 0, cost: 0, kind: 'snipe', entry: 0, peak: 0, born: 0, hold: 20 + r() * 1000 };
      if (c.buy(s, s.cash) > 0) { s.entry = c.price(); s.peak = s.entry; st.hold.push(s); } }
    return st;
  },
  step(c: Coin, st, r) {
    const m: Mix = st.m, end = (c.t + 1) * 5, p0 = c.price();
    st.hi.push(p0); if (st.hi.length > 720) st.hi.shift(); const hi1h = Math.max(...st.hi); const hi10 = Math.max(...st.hi.slice(-120));
    st.a *= Math.pow(0.5, 1 / (st.half * (p0 < 0.65 * hi1h ? 4 : 1)));
    // v2: attention = base (decaying) + a self-exciting part fed by buy dollars; its response is sublinear (sqrt) and it decays,
    // so the ceiling is emergent. DENS and SIZE: more, smaller trades than the corpus (same total flow shape, finer grain).
    st.E *= Math.pow(0.5, 1 / (HE * (p0 < 0.65 * hi1h ? 4 : 1)));
    const att = DENS * (st.a + Math.sqrt(st.E));
    if (st.dev.tok > 0 && r() < m.devDump) c.sell(st.dev, st.dev.tok);
    while (st.next < end) {
      const now = st.next; while (st.times.length && st.times[0] < now - 60) st.times.shift();
      const b = bucket(now, st.times.length); st.times.push(now);
      const g = pick(b.gap, r); st.next = now + Math.max(0.01, g / att);
      if (c.pool && !st.gm) st.gm = c.price() * 1e9; /* market cap at graduation: sizes keyed to it, not to the live price (that compounds) */
      const usd = c.pool ? pick(PS as number[], r) * st.gm * SIZE : pick(b.sol, r) * 300 * SIZE; /* x300, not the x500 reserve map, which overshot real 5 s moves */ const p = c.price();
      // a sampled trade is a sell by a random holder (any reason: needs cash, bored) with the corpus's sell share for this activity
      // level, else a buy by a new arrival of a type from the mix
      if (st.hold.length && r() < b.sell) { const h = st.hold[Math.floor(r() * st.hold.length)]!; if (h.firm || h.kind === 'snipe' || h.tok < 1) continue; { st.E = Math.max(0, st.E - G * c.sell(h, h.tok * (r() < 0.5 ? 1 : 0.5)) / 100); continue; /* leavers take attention with them */ } }
      let u = r() * (m.hype + m.dip + m.mom + m.take + m.panic); let kind: string = 'hype';
      for (const k of KINDS) { u -= m[k]; if (u < 0) { kind = k; break; } }
      if (kind === 'mom' && p < 0.97 * hi10) kind = 'hype';
      if (kind === 'dip' && p > 0.75 * hi10) kind = 'hype';
      const tr: Trader = { id: st.nid(), cash: usd, tok: 0, cost: 0, kind, entry: p, peak: p, born: c.t,
        hold: -Math.log(r() + 1e-9) * (kind === 'take' ? 2000 : 240), tp: 1.3 + r() * (kind === 'take' ? 3 : 1.7), minHold: 6 + r() * 60, stop: 0.45 + 0.4 * r(), trail: 0.55 + 0.35 * r(), sold: 0, firm: r() < m.firm, ftrail: 0.3 + 0.55 * r() };
      if (c.buy(tr, usd) > 0) { st.E += G * usd / 100; tr.entry = c.price(); tr.peak = tr.entry; st.hold.push(tr); }
    }
    for (const tr of st.hold) {
      if (tr.tok < 1 || c.t - tr.born < (tr.minHold ?? 0)) continue; const q = c.price(); tr.peak = Math.max(tr.peak, q); const x = q / tr.entry; const age = c.t - tr.born;
      if (tr.firm) { if (q < tr.ftrail * tr.peak) { c.sell(tr, tr.tok / 2); tr.peak = q; } continue; } /* sells half, then trails from here */ // firm holders ride: only their own trailing stop
      if (tr.kind === 'snipe') { if (age > tr.hold) c.sell(tr, tr.tok); }
      else if (tr.kind === 'mom') { if (q < tr.trail * tr.peak) c.sell(tr, tr.tok); }
      else if (tr.kind === 'take') { if (x >= tr.tp * (1 + tr.sold)) { c.sell(tr, tr.tok / (3 - tr.sold)); tr.sold++; } else if (age > tr.hold || x < tr.stop) c.sell(tr, tr.tok); }
      else if (tr.kind === 'panic') { if (q < (tr.stop + 0.1) * tr.peak) c.sell(tr, tr.tok); }
      else if (x >= tr.tp || age > tr.hold || x < tr.stop) c.sell(tr, tr.tok);
    }
    if (c.t % 50 === 0) st.hold = st.hold.filter((t: Trader) => t.tok >= 1);
  },
};
export default AH;
