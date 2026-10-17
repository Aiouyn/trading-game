// v14 EMO: small emotion-driven meme coin model on the real Pump.fun curve. 1 tick = 5 s. Sandbox only.
import { PF, SOL_USD, poolFee } from './core-pf';
export type Kind = 'rug' | 'quick' | 'grinder' | 'trender' | 'runner';
let S = 1; export const seed = (s: number) => { S = s >>> 0 || 1; };
export const rnd = () => { S ^= S << 13; S >>>= 0; S ^= S >>> 17; S ^= S << 5; S >>>= 0; return S / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(6.2832 * rnd());
// What each type sets: audience size, discovery speed (per tick, decaying with age), baseline mood. Nothing else.
export const TYPES: Record<Kind, { aud: number; trickle?: number; god?: number; calls: number; find: number; fomo: number; nerve: number; tp: number; patience: number }> = {
  rug:     { aud: 20,   find: 0.05,  fomo: 1.0, nerve: 0.8, tp: 1.6, patience: 0.6, calls: 0 },
  quick:   { aud: 30,   find: 0.05,  fomo: 1.0, nerve: 0.7, tp: 1.8, patience: 0.6, calls: 0 },
  grinder: { aud: 8000, trickle: 0.25, find: 0.0002, fomo: 0.3, nerve: 4.0, tp: 12.0, patience: 12.0, calls: 0 },
  trender: { aud: 500,  find: 0.008, fomo: 1.1, nerve: 3.0, tp: 8.0, patience: 2.0, calls: 1 },
  runner:  { aud: 9000, god: 0.8, find: 0.0008, fomo: 1.2, nerve: 1.6, tp: 6.0, patience: 4.0, calls: 1.2 },
};
export type W = { id: number; cash: number; tok: number; cost: number; greed: number; fear: number; bored: number; tp: number; fomo: number; nerve: number; pat: number; next: number; gone: boolean; buys: number; every: number; size: number; dev?: boolean; t0: number };
const X0 = PF.VSOL0 * SOL_USD, K = X0 * PF.Y0, GY = PF.Y0 - PF.REAL_TOK;
export class Coin {
  y = PF.Y0; pool: { x: number; y: number } | null = null; t = 0; grad = -1; px: number[] = []; vol: number[] = []; tickVol = 0; maxSell = 0;
  hype = 0; posts = 0; ath = 0; athT = 0; why: any = { fear: 0, bored: 0, churn: 0, tp: 0, rebuy: 0, lotto: 0, entry: 0 }; wave = 0; godAt = -1; devMc = 0; godWave = 0; shock = 0; ws: W[] = []; met = 0; buyers = new Set<number>(); repeatBuys = 0; uniqBuys = 0; devSold = -1; fees = 0;
  constructor(public kind: Kind) { const m = TYPES[kind]; if (m.god && rnd() < m.god) this.godAt = Math.floor(2880 + 4320 * rnd()); this.aud = Math.round(m.aud * Math.exp(0.5 * gauss())); }
  aud: number;
  price() { return this.pool ? this.pool.x / this.pool.y : K / (this.y * this.y); }
  mcap() { return this.price() * PF.SUPPLY; }
  buy(w: W, usd: number) {
    usd = Math.min(usd, w.cash); if (usd < 1) return 0; let out: number;
    if (!this.pool) {
      let c = usd * (1 - PF.CURVE_FEE); const X = K / this.y; out = this.y - K / (X + c);
      if (this.y - out <= GY) { out = this.y - GY; c = K / GY - X; usd = c / (1 - PF.CURVE_FEE); }
      this.y -= out; if (this.y <= GY + 1) { this.grad = this.t; const p = K / (this.y * this.y), ty = PF.SUPPLY - PF.REAL_TOK; this.pool = { x: p * ty, y: ty }; }
    } else { const f = poolFee(this.mcap() / SOL_USD), d = usd * (1 - f), p = this.pool; out = p.y - p.x * p.y / (p.x + d); p.x += d; p.y -= out; }
    w.cash -= usd; w.tok += out; w.cost += usd; this.tickVol += usd; w.buys++;
    if (this.buyers.has(w.id)) this.repeatBuys++; else { this.buyers.add(w.id); this.uniqBuys++; } return out;
  }
  sell(w: W, q: number) {
    q = Math.min(q, w.tok, w.dev || w.id < 0 ? Infinity : 15e6); if (q <= 0) return 0; let usd: number; // NPC whales slice exits (max 1.5% of supply per check)
    if (!this.pool) { q = Math.min(q, PF.Y0 - this.y); usd = (K / this.y - K / (this.y + q)) * (1 - PF.CURVE_FEE); this.y += q; }
    else { const p = this.pool, g = p.x - p.x * p.y / (p.y + q); usd = g * (1 - poolFee(this.mcap() / SOL_USD)); p.x -= g; p.y += q; }
    w.cost *= 1 - q / w.tok; w.tok -= q; w.cash += usd; this.tickVol += usd; this.maxSell = Math.max(this.maxSell, usd); return usd;
  }
  // player API (same rules as NPCs) -------------------------------------------------------------
  post() { this.posts++; this.hype += 1 / (1 + this.posts); } // diminishing returns on promo
  // what anyone can SEE: returns over windows, volume vs its own recent average, holders, hype
  see() {
    const n = this.px.length, p = this.price(), at = (k: number) => this.px[Math.max(0, n - k)] ?? p;
    const v = (a: number, b: number) => { let s = 0; for (let i = Math.max(0, n - b); i < n - a; i++) s += this.vol[i]; return s / Math.max(1, b - a); };
    let hi = p; for (let i = Math.max(0, n - 360); i < n; i++) hi = Math.max(hi, this.px[i]); if (p > this.ath) { this.ath = p; this.athT = this.t; }
    const v1 = v(0, 12), v30 = v(0, 360) + 1;
    return { r1: p / at(12) - 1, r5: p / at(60) - 1, dd: p / hi - 1, volx: v1 / v30, v1, holders: this.ws.filter(w => w.tok > 1).length, fromAth: p / Math.max(p, this.ath) - 1, hype: this.hype, bigSell: this.maxSell };
  }
  step() {
    const m = TYPES[this.kind], age = this.t;
    // discovery: base rate decays with age; boosted by visible volume and hype. Mood of new arrivals = type baseline + noise.
    const s0 = this.see(), left = this.aud - this.met;
    const rate = (m.find * (3 + s0.holders) * (left / this.aud) * (0.5 + Math.min(2, s0.volx) + s0.hype) + m.find * 10 * left / this.aud + (age < 120 ? 0.1 : 0)) * Math.max(0.15, 1 + s0.fromAth) * (1 - this.shock) + (m.trickle ?? 0) * left / this.aud;
    // calls/shill waves: Poisson per hour; Pareto-sized share of the remaining audience notices over the next ~2 min
    if (rnd() < m.calls * Math.exp(-age / 4320) / 720) this.wave += Math.min(0.6, 0.004 / Math.pow(rnd() + 1e-3, 1.0)) * left;
    if (this.t === this.godAt) this.godWave = 0.35 * left; // one rare big late call: the god candle
    const wv = this.wave * 0.006, gv = this.godWave * 0.02; this.wave -= wv; this.godWave -= gv;
    let wa = 0, ga = 0, arr = 0; for (let r = wv; r > 0; r--) if (rnd() < Math.min(1, r)) wa++; for (let r = gv; r > 0; r--) if (rnd() < Math.min(1, r)) ga++; for (let r = rate; r > 0; r--) if (rnd() < Math.min(1, r)) arr++;
    for (let i = 0; i < wa + ga + arr && this.met < this.aud; i++, this.met++) this.ws.push(this.npc(m, false, i < wa ? 1 : i < wa + ga ? 2 : 0));
    this.hype *= 0.995; this.shock *= 0.995; const s = this.see(); this.maxSell = 0;
    for (const w of this.ws) {
      if (w.gone || w.dev || this.t < w.next) continue; w.next = this.t + 1 + Math.floor(rnd() * 2 * w.every);
      const up = Math.max(0, s.r1) + 0.5 * Math.max(0, s.r5), down = Math.max(0, -s.r1) + 0.2 * Math.max(0, -s.r5);
      const pnl = w.tok > 1 ? w.tok * this.price() / w.cost : 0, loss = w.tok > 1 && pnl > 0.5 ? Math.max(0, 0.85 - pnl) : 0, numb = w.tok > 1 && (pnl < 0.5 || pnl > 1.5) ? 0.3 : 1; // deep bagholders go numb, holders on house money stay calm
      const dip = w.tok < 1 && this.shock < 0.3 && s.fromAth < -0.25 && s.fromAth > -0.75 && this.t - this.athT < 1440 && rnd() < 0.5 && s.r1 > -0.05 ? 0.25 * w.fomo : 0; // buy-the-dip
      w.greed = 0.85 * w.greed + w.fomo * (2 * up + (s.r1 > 0 ? 0.3 * Math.min(4, s.volx) : 0) + 0.5 * s.hype) - 0.6 * down - (s.fromAth < -0.6 ? 0.4 : 0) + dip;
      w.fear = Math.max(0, 0.85 * w.fear + numb * (2 * Math.min(0.3, down) + loss + (s.bigSell > 0.05 * this.mcap() ? 0.2 : 0) + (s.bigSell > 0.15 * this.mcap() ? 0.8 : 0)) / w.nerve - 0.5 * up);
      w.bored = Math.max(0, w.bored + (Math.abs(s.r5) < 0.05 && s.volx < 0.8 ? 0.012 : -0.01) / w.pat);
      if (w.tok > 1) {
        const pSell = Math.min(1, Math.max(0, w.fear - 0.4) * 0.25 + Math.max(0, w.bored - 0.5) * 0.4);
        if (rnd() < pSell) { this.why[w.fear > 0.4 ? 'fear' : 'bored'] += this.sell(w, w.tok * (rnd() < 0.2 ? 1 : 0.2 + 0.5 * rnd())); if (w.tok < 1 && rnd() < 0.6) w.gone = true; }
        else if (rnd() < 0.01 / w.pat) this.why.churn += this.sell(w, w.tok * (0.2 + 0.6 * rnd())); // churn: someone needs cash
        else if (pnl > w.tp) { this.why.tp += this.sell(w, w.tok * (0.15 + 0.25 * rnd())); w.tp *= 1.3 + rnd(); } // profit ladder: small chunks
        else if (w.greed > 1.2 && rnd() < 0.05) this.why.rebuy += this.price() * this.buy(w, 30 * Math.exp(1.1 * gauss()));
      } else {
        if (w.bored > 1) w.gone = true;
        else if (s.fromAth > -0.5 && this.shock < 0.3 && rnd() < 0.01) this.why.lotto += this.price() * this.buy(w, 10 * Math.exp(gauss())); // small lottery buy
        else if (w.greed > 0.6 + rnd() && w.fear < 0.6 && rnd() < 0.5) this.why.entry += this.price() * this.buy(w, Math.min(w.cash, w.size * 30 * Math.exp(1.1 * gauss())));
      }
    }
    // rug dev: a real wallet that sells his bag once enough buyers have shown up (or he gets bored)
    const dev = this.ws.find(w => w.dev && w.tok > 1);
    if (dev && this.t > 24 && (this.mcap() > this.devMc * (1.5 + rnd()) || this.t > 120 + 240 * rnd()) && rnd() < 0.3) { this.sell(dev, dev.tok); this.devSold = this.t; this.shock = 0.9; }
    this.px.push(this.price()); this.vol.push(this.tickVol); this.tickVol = 0; this.t++;
  }
  npc(m: typeof TYPES[Kind], dev = false, wave = 0): W { // wave 1 = joined on a call (scalper: quick profit), 2 = god-wave crowd (bigger, FOMO)
    return { id: this.met + (dev ? 1e6 : 0), cash: 200 * Math.exp(1.2 * gauss() + 0.8), tok: 0, cost: 0, greed: m.fomo * (0.6 + 0.8 * rnd()), fear: 0, bored: 0, tp: wave === 1 ? 1.25 + 0.4 * rnd() : m.tp * Math.exp(0.5 * gauss()), size: (wave === 2 ? 4 : 1) * Math.min(20, Math.max(1, Math.sqrt(this.mcap() / 50000))), // bigger coins draw bigger wallets
      fomo: m.fomo * (wave === 2 ? 1.6 : 1) * Math.exp(0.3 * gauss()), nerve: m.nerve * Math.exp(0.8 * gauss()), pat: m.patience * Math.exp(0.3 * gauss()), next: this.t + Math.floor(rnd() * 6), gone: false, buys: 0, every: Math.min(3000, Math.max(2, 6 * Math.exp(1.6 * gauss()))), dev, t0: this.t };
  }
  dead() { const n = this.vol.length; if (n < 720) return false; for (let i = n - 720; i < n; i++) if (this.vol[i] > 0) return false; return true; }
  clues() { // per-coin clue features a sharp player could read (never shown as numbers in game)
    const early = this.ws.slice(0, 10); const dev = this.ws.find(w => w.dev);
    return { uniqueShare: this.uniqBuys / Math.max(1, this.uniqBuys + this.repeatBuys), devBag: dev ? dev.cost : 0, devSoldAt: this.devSold,
      earlyHoldersStill: early.filter(w => w.tok > 1).length / Math.max(1, early.length), followerResp: this.met / Math.max(1, this.t / 12) };
  }
}
export function launch(kind: Kind) {
  const c = new Coin(kind); if (kind === 'rug') { const d = c.npc(TYPES.rug, true); d.cash = SOL_USD * (2 + 8 * rnd()); c.ws.push(d); c.buy(d, d.cash); c.devMc = c.mcap(); }
  return c;
}
