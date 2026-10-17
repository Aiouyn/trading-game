// v14.2 EMO: small emotion-driven meme coin model on the real Pump.fun curve. 1 tick = 5 s. Sandbox only.
// No coin types inside the model: every coin draws a hidden audience size (Pareto) and a mood from continuous ranges.
// Types are post-hoc labels from the chart (see label() in emo-run.ts). NPCs cap their price impact (slippage tolerance).
import { PF, SOL_USD, poolFee } from './core-pf';
let S = 1; export const seed = (s: number) => { S = s >>> 0 || 1; };
export const rnd = () => { S ^= S << 13; S >>>= 0; S ^= S >>> 17; S ^= S << 5; S >>>= 0; return S / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(6.2832 * rnd());
const ln = (med: number, sd: number) => med * Math.exp(sd * gauss());
export type Traits = { aud: number; find: number; calls: number; god: number; fomo: number; nerve: number; tp: number; patience: number; rug: boolean };
export const AUD = { xm: +(process.env.AUD_XM ?? 12), alpha: +(process.env.AUD_ALPHA ?? 0.85), max: 40000 };
export function drawTraits(): Traits { // one heavy-tailed audience, continuous moods
  const aud = Math.round(Math.min(AUD.max, AUD.xm / Math.pow(rnd() + 1e-9, 1 / AUD.alpha)));
  return { aud, find: Math.min(0.06, 0.05 * Math.pow(30 / aud, 0.6) * ln(1, 0.5)), calls: aud > 200 && rnd() < 0.5 ? ln(0.8, 0.5) : 0, god: aud > 2000 && rnd() < 0.5 ? Math.floor(1440 + 5760 * rnd()) : -1,
    fomo: 0.6 + 0.8 * rnd(), nerve: ln(1.5, 0.5), tp: ln(3, 0.6), patience: ln(1.5, 0.8), rug: rnd() < 0.12 };
}
export type W = { id: number; cash: number; tok: number; cost: number; greed: number; fear: number; bored: number; tp: number; fomo: number; nerve: number; pat: number; next: number; gone: boolean; buys: number; every: number; size: number; slip: number; lag: number; pendB: number; pendS: number; doubt: number; lb: number; dipTh: number; dRate: number; stop: number; defend: number; conv: number; wasDown: boolean; lastAdd: number; adds: number; tIn: number; defHL: number; panTh: number; snipe: boolean; hold: number; dev?: boolean; t0: number };
const X0 = PF.VSOL0 * SOL_USD, K = X0 * PF.Y0, GY = PF.Y0 - PF.REAL_TOK;
export class Coin {
  y = PF.Y0; pool: { x: number; y: number } | null = null; t = 0; grad = -1; px: number[] = []; vol: number[] = []; tickVol = 0; maxSell = 0; lastBig = 0;
  hype = 0; posts = 0; ath = 0; athT = 0; athT0 = 0; hiB: number[] = []; panic = 0; panicNext = 0; stopLine = 0; lastNewBuyer = -999; loB: number[] = []; trB: number[] = []; static LB = [12, 36, 120, 360, 1080, 2160, 4320]; wave = 0; godWave = 0; devMc = 0; shock = 0; ws: W[] = []; met = 0; buyers = new Set<number>(); repeatBuys = 0; uniqBuys = 0; devSold = -1; seen = new Map<number, any>(); why: any = {};
  constructor(public tr: Traits) {}
  price() { return this.pool ? this.pool.x / this.pool.y : K / (this.y * this.y); }
  mcap() { return this.price() * PF.SUPPLY; }
  // slippage tolerance: price moves as (cash reserve)^2 on both curve and x*y=k pool, so cap the trade at a max price impact
  maxBuy(slip: number) { const X = this.pool ? this.pool.x : K / this.y; return X * (Math.sqrt(1 + slip) - 1) / (1 - PF.CURVE_FEE); }
  capSell(slip: number) { const Y = this.pool ? this.pool.y : this.y; return Y * (1 / Math.sqrt(1 - slip) - 1); }
  buy(w: W, usd: number) {
    usd = Math.min(usd, w.cash); if (usd < 1) return 0; let out: number;
    if (!this.pool) {
      let c = usd * (1 - PF.CURVE_FEE); const X = K / this.y; out = this.y - K / (X + c);
      if (this.y - out <= GY) { out = this.y - GY; c = K / GY - X; usd = c / (1 - PF.CURVE_FEE); }
      this.y -= out; if (this.y <= GY + 1) { this.grad = this.t; const p = K / (this.y * this.y), ty = PF.SUPPLY - PF.REAL_TOK; this.pool = { x: p * ty, y: ty }; }
    } else { const f = poolFee(this.mcap() / SOL_USD), d = usd * (1 - f), p = this.pool; out = p.y - p.x * p.y / (p.x + d); p.x += d; p.y -= out; }
    w.cash -= usd; w.tok += out; w.cost += usd; this.tickVol += usd; w.buys++;
    if (this.buyers.has(w.id)) this.repeatBuys++; else { this.buyers.add(w.id); this.uniqBuys++; this.lastNewBuyer = this.t; } return out;
  }
  sell(w: W, q: number, tag = 'x') {
    q = Math.min(q, w.tok); if (q <= 0) return 0; let usd: number;
    if (!this.pool) { q = Math.min(q, PF.Y0 - this.y); usd = (K / this.y - K / (this.y + q)) * (1 - PF.CURVE_FEE); this.y += q; }
    else { const p = this.pool, g = p.x - p.x * p.y / (p.y + q); usd = g * (1 - poolFee(this.mcap() / SOL_USD)); p.x -= g; p.y += q; }
    w.cost *= 1 - q / w.tok; w.tok -= q; w.cash += usd; this.tickVol += usd; this.maxSell = Math.max(this.maxSell, usd); this.why[tag] = (this.why[tag] ?? 0) + usd; return usd;
  }
  npcBuy(w: W, usd: number) { const cap = this.maxBuy(w.slip), u = Math.min(usd, w.cash); w.pendB = Math.max(0, u - cap); return this.buy(w, Math.min(u, cap)); } // remainder waits
  npcSell(w: W, q: number, tag = 'x') { const cap = this.capSell(w.slip); w.pendS = Math.max(0, Math.min(q, w.tok) - cap); return this.sell(w, Math.min(q, cap), tag); }
  // player API (same rules as NPCs, player picks his own slippage) ---------------------------------
  post() { this.posts++; this.hype += 1 / (1 + this.posts); } // diminishing returns on promo
  // what anyone can SEE, as of `off` ticks ago (reaction lag): returns, drawdowns, volume vs its average, holders, hype
  see(off = 0) {
    if (this.seen.has(off)) return this.seen.get(off);
    const n = Math.max(1, this.px.length - off), p = this.px[n - 1] ?? this.price(), at = (k: number) => this.px[Math.max(0, n - k)] ?? p;
    const v = (b: number) => { let s = 0; for (let i = Math.max(0, n - b); i < n; i++) s += this.vol[i] ?? 0; return s / b; };
    let hi = p; for (let i = Math.max(0, n - 360); i < n; i++) hi = Math.max(hi, this.px[i]);
    const r = { r1: p / at(12) - 1, r5: p / at(60) - 1, r2h: p / at(1440) - 1, dd: p / hi - 1, volx: v(12) / (v(360) + 1e-6), v1: v(12), fromAth: p / Math.max(p, this.ath) - 1, hype: this.hype, bigSell: this.lastBig };
    this.seen.set(off, r); return r;
  }
  step() {
    const m = this.tr, age = this.t; this.seen.clear(); const p0 = this.price(); if (p0 > this.ath * 1.02) this.athT0 = this.t; if (p0 > this.ath) { this.ath = p0; this.athT = this.t; }
    const s0 = this.see(), left = this.aud() - this.met, holders = this.holders;
    const rate = (m.find * (3 + 4 * Math.sqrt(holders)) * (left / m.aud) * (0.8 + 0.3 * Math.min(2, s0.volx) + s0.hype) + (age < 120 ? 0.1 : 0)) * Math.max(0.15, 1 + s0.fromAth) * (1 - this.shock);
    if (rnd() < m.calls * Math.exp(-age / 4320) / 720) this.wave += Math.min(0.6, 0.002 / Math.pow(rnd() + 1e-3, 1.0)) * left; // shill/KOL call
    const wv = this.wave * 0.002, gv = this.godWave * 0.02; this.wave -= wv; this.godWave -= gv;
    let wa = 0, ga = 0, arr = 0; for (let r = wv; r > 0; r--) if (rnd() < Math.min(1, r)) wa++; for (let r = gv; r > 0; r--) if (rnd() < Math.min(1, r)) ga++; for (let r = rate; r > 0; r--) if (rnd() < Math.min(1, r)) arr++;
    for (let i = 0; i < wa + ga + arr && this.met < m.aud; i++, this.met++) this.ws.push(this.npc(false, i < wa ? 1 : i < wa + ga ? 2 : 0));
    if (age < 12 && rnd() < 0.5) { const b = this.npc(); b.snipe = true; b.tp = 1.3 + 0.7 * rnd(); b.hold = 24 + Math.floor(156 * rnd()); b.every = 1; b.slip = 0.15; b.id = 2e6 + age; this.ws.push(b); this.npcBuy(b, 20 + 80 * rnd()); b.tIn = age; } // sniper bots in the first minute
    this.hype *= 0.995; this.shock *= 0.995; this.lastBig = this.maxSell; this.maxSell = 0; let h = 0;
    // per-tick view at each lookback bucket (NPCs each own one bucket: 1 min .. 6 h): high, low, trend
    const LB = Coin.LB, n = this.px.length, pNow = this.price(); if (this.t % 6 === 0 || !this.hiB.length) { this.hiB = []; this.loB = []; this.trB = []; } const hiB = this.hiB, loB = this.loB, trB = this.trB;
    if (!hiB.length) for (const lb of LB) { let hi = pNow, lo = pNow; for (let i = Math.max(0, n - lb); i < n; i++) { const v = this.px[i]; if (v > hi) hi = v; if (v < lo) lo = v; } hiB.push(hi); loB.push(lo); trB.push(pNow / (this.px[Math.max(0, n - lb)] ?? pNow) - 1); }
    // capitulation: a sell > ~7% of mcap, a dev dump, or price falling through the cluster of holders' stops flips defenders to sellers
    if (this.t % 6 === 0) { const st = this.ws.filter(w => w.tok > 1 && !w.dev).map(w => w.cost / w.tok * (1 - w.stop)).sort((a, b) => a - b); this.stopLine = st.length > 4 ? st[Math.floor(st.length / 2)] : 0; }
    // panic: proportional to the 1-min drop depth and recent sell size vs mcap; half-life ~2 min (0.97/tick)
    { const d1 = Math.max(0, 1 - pNow / (this.px[n - 12] ?? pNow)); this.panic = 0.97 * this.panic + 0.15 * d1 + 0.5 * Math.min(1, this.lastBig / Math.max(1, this.mcap())) + this.panicNext + (this.devSold === this.t - 1 ? 0.8 : 0) + (this.stopLine && pNow < this.stopLine && (this.px[n - 12] ?? 0) >= this.stopLine ? 0.2 : 0); this.panicNext = 0; }
    const alive = this.t - this.lastNewBuyer < 120 && (this.see().volx > 0.5);
    const athBreak = pNow >= this.ath * 0.999 && n > 60;
    for (const w of this.ws) {
      if (w.tok > 1) h++;
      if (w.gone || w.dev || this.t < w.next) continue; w.next = this.t + 1 + Math.floor(rnd() * 2 * w.every); // own jittered check clock
      const s = this.see(w.lag), b = w.lb, dd = pNow / hiB[b] - 1, trend = trB[b], flat = hiB[b] / loB[b] < 1.6; // its own lookback window
      const up = Math.max(0, s.r1) + 0.5 * Math.max(0, s.r5), down = Math.max(0, -s.r1) + 0.2 * Math.max(0, -s.r5);
      const pnl = w.tok > 1 ? w.tok * pNow / w.cost : 0; // judged against its OWN cost basis
      const dip = w.tok < 1 && this.shock < 0.3 && dd < -w.dipTh && dd > -0.6 && (trend > 0 || s.volx > 0.6) && s.r1 > -0.05 ? 0.6 * w.fomo : 0; // own pullback threshold, own trend
      const brk = w.tok < 1 && athBreak && flat && Coin.LB[b] >= 360 && this.t - this.athT0 > Coin.LB[b] / 2 ? 1.5 * w.fomo : 0; // breakout after a long flat zone: long-lookback watchers FOMO together
      w.greed = 0.85 * w.greed + w.fomo * (2 * up + (s.r1 > 0 ? 0.3 * Math.min(4, s.volx) : 0) + 0.5 * s.hype) - 0.6 * down - (s.fromAth < -0.6 ? 0.4 : 0) + dip + brk;
      const underStop = w.tok > 1 && pnl < 1 - w.stop, panicK = w.tok > 1 ? Math.max(0, this.panic - w.panTh) : 0; // each holder has its own panic threshold // panic only below its personal stop
      w.fear = Math.max(0, 0.85 * w.fear + ((underStop ? 0.6 + 2 * Math.min(0.3, down) : 0) + panicK) / w.nerve - 0.3 * up);
      if (w.tok > 1) { // doubt grows mainly while in profit; near its entry it calms down and defends
        if (pnl > 1.1) w.doubt += w.dRate * (0.002 + 0.03 * (pnl - 1)) / w.conv; else if (pnl > 0.85) w.doubt *= 0.97;
        if (pnl < 0.9) w.wasDown = true; else if (w.wasDown && pnl > 1.05) { w.wasDown = false; w.conv *= 1.3; w.tp *= 1.3; w.doubt *= 0.5; } // sat through a pullback that recovered
      }
      w.bored = Math.max(0, w.bored + (Math.abs(s.r5) < 0.05 && s.volx < 0.8 ? 0.03 : -0.01) * (this.t - this.lastNewBuyer > 120 ? 3 : 1) / w.pat); // no new unique buyers: bored fast
      if (w.snipe && w.tok > 1) { if (pnl > w.tp || this.t - w.tIn > w.hold) { this.npcSell(w, w.tok, 'snipe'); w.gone = true; } continue; } // sniper/flipper bot
      if (w.tok < 1 && this.t - this.lastNewBuyer > 360 && rnd() < 0.2) { w.gone = true; continue; } // attention decays when nothing new happens
      if (w.pendS > 0) { if (w.fear > 0.2 || w.bored > 0.5 || w.doubt > 0.7) { this.npcSell(w, w.pendS, 'pend'); continue; } w.pendS = 0; } // unfilled exit: retry or drop
      if (w.pendB > 0) { if (w.greed > 0.3 && w.fear < 0.6) { this.npcBuy(w, w.pendB); continue; } w.pendB = 0; }
      if (w.tok > 1) {
        const pSell = Math.min(1, Math.max(0, w.fear - 0.4) * 0.15 + Math.max(0, w.bored - 0.5) * 0.4);
        if (rnd() < pSell) { this.npcSell(w, w.tok * (rnd() < 0.4 ? 1 : 0.3 + 0.5 * rnd()), w.fear > 0.4 ? 'fear' : 'bored'); if (w.fear > 0.4) this.panicNext += 0.005; if (w.tok < 1 && rnd() < 0.6) w.gone = true; } // each panic seller raises neighbours' fear
        else if (w.doubt > 0.7 && rnd() < Math.min(1, w.doubt - 0.7) * (s.r1 > 0.01 || s.volx > 1.2 ? 0.5 : 0.05)) { this.npcSell(w, w.tok * (0.2 + 0.3 * rnd()), 'doubt'); w.doubt *= 0.3; } // take gains into green minutes / volume
        else if (pnl > w.tp) { this.npcSell(w, w.tok * (0.15 + 0.25 * rnd()), 'tp'); w.tp *= 1.3 + rnd(); } // profit ladder
        else if (pnl < 1 - w.defend && pnl > 1 - w.stop && this.t - w.lastAdd > 120 && w.adds < 2 && w.bored < 0.5 && w.cash > 5 && alive && this.panic < 0.3 && rnd() < Math.exp(-(this.t - w.tIn) / w.defHL)) { this.npcBuy(w, Math.min(w.cash, 0.5 * w.cost)); w.lastAdd = this.t; w.adds++; } // defends its entry: support where many bought
        else if (rnd() < 0.003 / w.pat) this.npcSell(w, w.tok * (0.2 + 0.6 * rnd()), 'churn'); // churn
      } else {
        if (w.bored > 1) w.gone = true;
        else if (alive && s.fromAth > -0.5 && this.shock < 0.3 && rnd() < 0.01) this.npcBuy(w, 10 * Math.exp(gauss())); // lottery buy
        else if (w.greed > 0.6 + rnd() && w.fear < 0.6 && rnd() < 0.5) { if (this.npcBuy(w, w.size * 30 * Math.exp(1.1 * gauss())) > 0) { w.tIn = this.t; if (brk > 0) { w.pat *= 0.3; w.dRate *= 2; } } }
      }
    }
    this.holders = h;
    const dev = this.ws.find(w => w.dev && w.tok > 1); // rug dev: a real wallet dumping his whole bag, no slippage cap
    if (dev && this.t > 24 && (this.mcap() > this.devMc * (1.5 + rnd()) || this.t > 120 + 240 * rnd()) && rnd() < 0.3) { this.sell(dev, dev.tok); this.devSold = this.t; this.shock = 0.9; }
    this.px.push(this.price()); this.vol.push(this.tickVol); this.tickVol = 0; this.t++;
  }
  holders = 0; aud() { return this.tr.aud; }
  npc(dev = false, wave = 0): W { // wave 1 = joined on a call (scalper), 2 = god-wave crowd (bigger, FOMO)
    const m = this.tr;
    return { id: this.met + (dev ? 1e6 : 0), cash: 200 * Math.exp(1.2 * gauss() + 0.8), tok: 0, cost: 0, greed: m.fomo * (0.6 + 0.8 * rnd()), fear: 0, bored: 0,
      tp: wave === 1 ? 1.25 + 0.4 * rnd() : m.tp * Math.exp(0.5 * gauss()), size: (wave === 2 ? 4 : 1) * Math.min(20, Math.max(1, Math.sqrt(this.mcap() / 50000))),
      fomo: m.fomo * (wave === 2 ? 1.6 : 1) * Math.exp(0.3 * gauss()), nerve: m.nerve * Math.exp(0.8 * gauss()), pat: m.patience * Math.exp(0.3 * gauss()), next: this.t + Math.floor(rnd() * 6), gone: false, buys: 0,
      every: Math.min(3000, Math.max(2, 6 * Math.exp(1.6 * gauss()))), slip: Math.min(0.10, Math.max(0.005, ln(0.02, 0.7))), lag: Math.floor(rnd() * 25), pendB: 0, pendS: 0, doubt: 0, lb: Math.min(6, Math.max(0, Math.round(2.5 + 1.5 * gauss()))), dipTh: 0.08 + 0.32 * rnd(), dRate: ln(1, 0.6), stop: 0.2 + 0.4 * rnd(), defend: 0.02 + 0.06 * rnd(), conv: 1, wasDown: false, lastAdd: -999, adds: 0, tIn: 0, defHL: 120 + 600 * rnd(), panTh: 0.1 + 0.9 * rnd(), snipe: false, hold: 0, dev, t0: this.t };
  }
  dead() { const n = this.vol.length; if (n < 720) return false; for (let i = n - 720; i < n; i++) if (this.vol[i] > 0) return false; return true; }
  clues() { // per-coin clue features a sharp player could read (never shown as numbers in game)
    const early = this.ws.slice(0, 10); const dev = this.ws.find(w => w.dev);
    return { uniqueShare: this.uniqBuys / Math.max(1, this.uniqBuys + this.repeatBuys), devBag: dev ? dev.cost : 0, devSoldAt: this.devSold,
      earlyHoldersStill: early.filter(w => w.tok > 1).length / Math.max(1, early.length), followerResp: this.met / Math.max(1, this.t / 12) };
  }
}
export function launch(tr = drawTraits()) {
  const c = new Coin(tr); if (tr.rug) { const d = c.npc(true); d.cash = SOL_USD * (5 + 20 * rnd()); c.ws.push(d); c.buy(d, d.cash); c.devMc = c.mcap(); }
  return c;
}
