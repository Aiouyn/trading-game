// v15 COH: cohort version of EMO. 1 tick = 5 s. Sandbox only. Cost per tick is O(cohorts), not O(headcount).
// A cohort = many NPCs who entered in the same price band with the same horizon: headcount, tokens, total cost (avg entry),
// horizon, stop/target/defend, emotions. Each tick the number of members who act is Poisson(headcount x probability);
// their dollar size is a sum of heavy-tailed retail draws ($5-500). Watchers (not-yet-buyers) are cohorts too.
import { PF, SOL_USD, poolFee } from './core-pf';
let S = 1; export const seed = (s: number) => { S = s >>> 0 || 1; };
export const rnd = () => { S ^= S << 13; S >>>= 0; S ^= S >>> 17; S ^= S << 5; S >>>= 0; return S / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(6.2832 * rnd());
const ln = (med: number, sd: number) => med * Math.exp(sd * gauss());
const pois = (l: number) => { if (l <= 0) return 0; if (l > 30) return Math.max(0, Math.round(l + Math.sqrt(l) * gauss())); let k = 0, p = Math.exp(-l), s = p, u = rnd(); while (u > s && k < 200) { k++; p *= l / k; s += p; } return k; };
const RET = { med: +(process.env.RET_MED ?? 40), sd: 1.1, lo: 5, hi: 500 }; // retail trade size, $ (lognormal, clipped)
const RM = RET.med * Math.exp(RET.sd ** 2 / 2) * 0.93, RS = RM * 1.3;          // approx mean/sd after clipping, for k > 20
const retail = (k: number) => { if (k <= 0) return 0; if (k > 20) return Math.max(k * RET.lo, k * RM + Math.sqrt(k) * RS * gauss()); let s = 0; for (let i = 0; i < k; i++) s += Math.min(RET.hi, Math.max(RET.lo, ln(RET.med, RET.sd))); return s; };
const K = PF.VSOL0 * SOL_USD * PF.Y0, GY = PF.Y0 - PF.REAL_TOK, HOR = [12, 72, 360, 1440], CAP = +(process.env.COH_CAP ?? 40);
export type Traits = { aud: number; find: number; calls: number; fomo: number; nerve: number; tp: number; patience: number; rug: boolean };
export const AUD = { xm: +(process.env.AUD_XM ?? 12), alpha: +(process.env.AUD_ALPHA ?? 0.77), max: 300000 };
export function drawTraits(): Traits {
  const aud = Math.round(Math.min(AUD.max, AUD.xm / Math.pow(rnd() + 1e-9, 1 / AUD.alpha)));
  return { aud, find: Math.min(0.06, 0.05 * Math.pow(30 / aud, 0.6) * ln(1, 0.5)), calls: aud > 200 && rnd() < 0.5 ? ln(0.8, 0.5) : 0, fomo: 0.6 + 0.8 * rnd(), nerve: ln(1.5, 0.5), tp: ln(3, 0.6), patience: ln(1.5, 0.8), rug: rnd() < 0.12 };
}
export type Wallet = { id: number; cash: number; tok: number; cost: number; [k: string]: any };
type Watch = { n: number; h: number; g: number };
type Hold = { n: number; tok: number; cost: number; t0: number; h: number; band: number; stop: number; tp: number; defend: number; defHL: number; panTh: number; pat: number; dRate: number;
  doubt: number; bored: number; fear: number; stopped: boolean; wasDown: boolean; snipe: boolean; hold: number };
export class Coin {
  y = PF.Y0; pool: { x: number; y: number } | null = null; t = 0; grad = -1; px: number[] = []; vol: number[] = []; tickVol = 0; maxSell = 0; lastBig = 0;
  hype = 0; posts = 0; ath = 0; athT = 0; panic = 0; brkBuys = 0; brkEvents = 0; lastNewBuyer = -999; met = 0; wave = 0; shock = 0; devMc = 0; devSold = -1; dev: Wallet | null = null;
  W: Watch[] = HOR.map((h) => ({ n: 0, h, g: 0 })); H: Hold[] = []; uniq = 0; rep = 0; why: any = {}; hi: number[] = [0, 0, 0, 0]; holders = 0; sellersFrac = 0; early: Hold[] = [];
  constructor(public tr: Traits) {}
  price() { return this.pool ? this.pool.x / this.pool.y : K / (this.y * this.y); }
  mcap() { return this.price() * PF.SUPPLY; }
  maxBuy(slip: number) { const X = this.pool ? this.pool.x : K / this.y; return X * (Math.sqrt(1 + slip) - 1) / (1 - PF.CURVE_FEE); }
  capSell(slip: number) { const Y = this.pool ? this.pool.y : this.y; return Y * (1 / Math.sqrt(1 - slip) - 1); }
  private tBuy(usd: number) { // returns [tokens, usd spent]
    if (usd < 1) return [0, 0]; let out: number;
    if (!this.pool) { let c = usd * (1 - PF.CURVE_FEE); const X = K / this.y; out = this.y - K / (X + c);
      if (this.y - out <= GY) { out = this.y - GY; c = K / GY - X; usd = c / (1 - PF.CURVE_FEE); }
      this.y -= out; if (this.y <= GY + 1) { this.grad = this.t; const p = K / (this.y * this.y), ty = PF.SUPPLY - PF.REAL_TOK; this.pool = { x: p * ty, y: ty }; }
    } else { const f = poolFee(this.mcap() / SOL_USD), d = usd * (1 - f), p = this.pool; out = p.y - p.x * p.y / (p.x + d); p.x += d; p.y -= out; }
    this.tickVol += usd; return [out, usd];
  }
  private tSell(q: number, tag: string) {
    if (q <= 0) return 0; let usd: number;
    if (!this.pool) { q = Math.min(q, PF.Y0 - this.y); usd = (K / this.y - K / (this.y + q)) * (1 - PF.CURVE_FEE); this.y += q; }
    else { const p = this.pool, g = p.x - p.x * p.y / (p.y + q); usd = g * (1 - poolFee(this.mcap() / SOL_USD)); p.x -= g; p.y += q; }
    this.tickVol += usd; this.maxSell = Math.max(this.maxSell, usd); this.why[tag] = (this.why[tag] ?? 0) + usd; return usd;
  }
  // player API: same curve, fees and price impact as NPCs
  buy(w: Wallet, usd: number) { usd = Math.min(usd, w.cash); const [out, u] = this.tBuy(usd); w.cash -= u; w.tok += out; w.cost += u; return out; }
  sell(w: Wallet, q: number) { q = Math.min(q, w.tok); if (q <= 0) return 0; const usd = this.tSell(q, 'player'); w.cost *= 1 - q / w.tok; w.tok -= q; w.cash += usd; return usd; }
  post() { this.posts++; this.hype += 1 / (1 + this.posts); }
  private at(k: number) { const n = this.px.length; return this.px[Math.max(0, n - k)] ?? this.price(); }
  private v(b: number) { const n = this.vol.length; let s = 0; for (let i = Math.max(0, n - b); i < n; i += Math.max(1, b / 60 | 0)) s += this.vol[i] * Math.max(1, b / 60 | 0); return s / b; }
  private newHold(h: number, p: number, snipe = false): Hold {
    const m = this.tr; return { n: 0, tok: 0, cost: 0, t0: this.t, h, band: Math.floor(Math.log(p) / Math.log(1.4)), stop: 0.2 + 0.4 * rnd(), tp: snipe ? 1.3 + 0.7 * rnd() : m.tp * Math.exp(0.5 * gauss()),
      defend: 0.02 + 0.06 * rnd(), defHL: 120 + 600 * rnd(), panTh: 0.1 + 0.9 * rnd(), pat: m.patience * Math.exp(0.3 * gauss()) * (HOR[h] / 72) ** 0.3, dRate: ln(1, 0.6),
      doubt: 0, bored: 0, fear: 0, stopped: false, wasDown: false, snipe, hold: snipe ? 24 + 156 * rnd() : 0 };
  }
  private enter(h: number, k: number, usd: number, snipe = false) { // k new holders put `usd` in; join the cohort of their band + horizon
    usd = Math.min(usd, this.maxBuy(0.02 * Math.sqrt(k) + 0.02)); if (usd < 1 || k < 1) return 0; // each caps its own impact; many of them spread over the tick
    const p = this.price(), band = Math.floor(Math.log(p) / Math.log(1.4)); let c = this.H.find((c) => c.h === h && c.band === band && c.snipe === snipe && this.t - c.t0 < 360);
    if (!c) { c = this.newHold(h, p, snipe); this.H.push(c); if (this.early.length < 3) this.early.push(c); if (this.H.length > CAP) this.merge(); }
    const [out, u] = this.tBuy(usd); c.n += k; c.tok += out; c.cost += u; this.uniq += k; this.lastNewBuyer = this.t; return u;
  }
  private merge() { // fold the smallest cohort into the most similar one (same horizon, nearest entry band)
    this.H.sort((a, b) => a.cost - b.cost); const s = this.H.shift()!; let best = this.H[0], bd = 1e9;
    for (const c of this.H) { const d = Math.abs(c.band - s.band) + (c.h === s.h ? 0 : 5) + (c.snipe === s.snipe ? 0 : 20); if (d < bd) { bd = d; best = c; } }
    const w = s.n / Math.max(1, s.n + best.n), mix = (a: number, b: number) => a * (1 - w) + b * w;
    for (const k of ['stop', 'tp', 'defend', 'defHL', 'panTh', 'pat', 'dRate', 'doubt', 'bored', 'fear'] as const) best[k] = mix(best[k], s[k]);
    best.n += s.n; best.tok += s.tok; best.cost += s.cost; best.t0 = Math.min(best.t0, s.t0);
  }
  step() {
    const m = this.tr, t = this.t, p = this.price(); this.why.t = t;
    // breakout: new high after a flat zone (>=30 min without one) gives watchers a FOMO kick
    if (p > this.ath * 1.02 && this.ath > 0 && t - this.athT > 360) { this.brkEvents++; for (const w of this.W) w.g += 0.6; }
    if (p > this.ath) { this.ath = p; this.athT = t; }
    if (t % 6 === 0) for (let i = 0; i < 4; i++) { const n = this.px.length, h = HOR[i], st = Math.max(1, h / 60 | 0); let hi = p; for (let j = Math.max(0, n - h); j < n; j += st) hi = Math.max(hi, this.px[j]); this.hi[i] = hi; }
    const volx = this.v(12) / (this.v(360) + 1e-6), v1 = this.v(12), fromAth = p / this.ath - 1, alive = v1 > 0.5 && t - this.lastNewBuyer < 720;
    // arrivals: discovery grows with holders (word of mouth), shrinks as the audience is used up; calls bring waves
    const left = m.aud - this.met, rate = (m.find * (3 + 4 * Math.sqrt(this.holders)) * (left / m.aud) * (0.8 + 0.3 * Math.min(2, volx) + this.hype) + (t < 120 ? 0.1 : 0)) * Math.max(0.15, 1 + fromAth) * (1 - this.shock);
    if (rnd() < m.calls * Math.exp(-t / 4320) / 720) this.wave += Math.min(0.6, 0.002 / Math.pow(rnd() + 1e-3, 1.0)) * left;
    const wv = this.wave * 0.002; this.wave -= wv; let arr = Math.min(left, pois(rate + wv)); this.met += arr;
    if (arr > 0) { const ape = pois(arr * 0.5 * (0.5 + m.fomo / 2)), a = Math.min(arr, ape), hc = (i: number) => (i < 0.35 ? 0 : i < 0.7 ? 1 : i < 0.9 ? 2 : 3); // half ape in on arrival
      this.enter(hc(rnd()), a, retail(a)); for (let r = arr - a, i = 0; i < 4; i++) { const k = i < 3 ? Math.round(r * [0.35, 0.35, 0.2][i]) : r; this.W[i].n += k; r -= k; } }
    if (t < 12) { const k = pois(0.5); if (k) this.enter(0, k, k * (20 + 80 * rnd()), true); } // sniper bots, first minute
    this.hype *= 0.995; this.shock *= 0.995; this.lastBig = this.maxSell; this.maxSell = 0;
    // panic: proportional to the 1-5 min drop and to big sells, half-life ~3 min; contagion from the share of holders selling
    const drop = Math.max(0, -(p / this.at(12) - 1) - 0.08) + 0.5 * Math.max(0, -(p / this.at(60) - 1) - 0.2);
    this.panic = Math.min(0.8, this.panic * 0.981 + 0.3 * drop + (this.lastBig > 0.07 * this.mcap() ? 0.3 : 0) + 0.5 * this.sellersFrac);
    // watchers: greed from momentum over their horizon, dip entries while it still looks alive; attention fades when it is dead
    for (let i = 0; i < 4; i++) { const w = this.W[i]; if (w.n < 0.5) continue; const r = p / this.at(w.h) - 1, dd = p / this.hi[i] - 1;
      w.g = 0.95 * w.g + 0.05 * (m.fomo * Math.max(-1, Math.min(2, 3 * r)) + (dd < -0.15 && dd > -0.8 && alive ? 0.8 : 0) + this.hype + (volx > 1.5 ? 0.3 : 0));
      const pb = 0.0015 * Math.exp(2 * w.g) * (1 - Math.min(1, this.panic)) * (1 - this.shock), k = Math.min(Math.floor(w.n), pois(w.n * Math.min(0.2, pb)));
      if (k) { w.n -= k; this.enter(i, k, retail(k)); }
      w.n *= 1 - (alive ? 0.0005 : 0.004) - (dd < -0.6 ? 0.002 : 0); }
    // holders: doubt (time + unrealised gain), boredom (no flow), fear (panic vs own threshold), target, stop, defence
    let sellers = 0, hn = 0; const green = p > this.at(12);
    for (const c of this.H) { if (c.n < 0.5 || c.tok < 1) { c.n = 0; continue; } const pnl = p * c.tok / c.cost, age = t - c.t0; hn += c.n;
      c.doubt += c.dRate * (0.0004 + 0.002 * Math.max(0, Math.min(5, pnl - 1))) / c.pat; if (c.wasDown && pnl > 1.1) { c.doubt *= 0.5; c.wasDown = false; } if (pnl < 0.9) c.wasDown = true;
      c.bored = Math.max(0, c.bored + (volx < 0.5 ? 0.0012 : 0) + (t - this.lastNewBuyer > 120 ? 0.0008 : 0) - (volx > 1.5 ? 0.003 : 0));
      c.fear = Math.max(0.97 * c.fear, (this.panic - c.panTh) / m.nerve);
      if (pnl < 1 - c.stop && !c.stopped) c.stopped = true;
      let ps = 0.0003 + 0.006 * c.doubt * (green || volx > 1 ? 1 : 0.3) + 0.004 * c.bored + 0.04 * Math.max(0, c.fear) + (pnl > c.tp ? 0.01 : 0) + (c.stopped && pnl < 1 - c.stop ? 0.006 : 0);
      if (c.snipe) ps = pnl > c.tp ? 0.3 : age > c.hold ? 0.05 : 0.002;
      if (this.shock > 0.5) ps += 0.02;
      const k = Math.min(c.n, pois(c.n * Math.min(0.5, ps)));
      if (k > 0) { const full = 0.6, q = Math.min(c.tok * Math.min(1, k * (full + (1 - full) * 0.5) / c.n), (k + 1) * this.capSell(0.03)); // each seller caps its own impact
        const tag = c.snipe ? 'snipe' : c.fear > 0.3 ? 'fear' : c.stopped && pnl < 1 - c.stop ? 'stop' : pnl > c.tp ? 'tp' : c.bored > c.doubt ? 'bored' : 'doubt';
        this.tSell(q, tag); c.cost *= 1 - q / c.tok; c.tok -= q; const ex = Math.min(c.n, k * full); c.n -= ex; sellers += k; this.W[c.h].n += 0.3 * ex; c.doubt *= 0.9; }
      else if (pnl < 1 - c.defend && pnl > 1 - c.stop && alive && this.panic < 0.3) { const kd = pois(c.n * 0.002 * Math.exp(-age / c.defHL)); if (kd) { const [o, u] = this.tBuy(Math.min(retail(kd), this.maxBuy(0.03))); c.tok += o; c.cost += u; this.rep += kd; this.why.defend = (this.why.defend ?? 0) + u; } } }
    this.H = this.H.filter((c) => c.n >= 0.5 && c.tok >= 1); this.holders = hn; this.sellersFrac = sellers / Math.max(20, hn);
    const d = this.dev; // rug dev: one wallet, sells his whole bag at once
    if (d && d.tok > 1 && t > 24 && (this.mcap() > this.devMc * (1.5 + rnd()) || t > 120 + 240 * rnd()) && rnd() < 0.3) { const u = this.tSell(d.tok, 'dev'); d.cash += u; d.tok = 0; this.devSold = t; this.shock = 0.9; this.panic = Math.min(0.8, this.panic + 0.5); }
    this.px.push(this.price()); this.vol.push(this.tickVol); this.tickVol = 0; this.t++;
  }
  cohorts() { return this.H.length + 4; }
  aud() { return this.tr.aud; }
  dead() { const n = this.vol.length; if (n < 720) return false; for (let i = n - 720; i < n; i++) if (this.vol[i] > 0) return false; return true; }
  clues() { return { uniqueShare: this.uniq / Math.max(1, this.uniq + this.rep), devBag: this.dev ? this.dev.cost : 0, devSoldAt: this.devSold,
    earlyHoldersStill: this.early.reduce((s, c) => s + (c.n > 0.5 ? 1 : 0), 0) / Math.max(1, this.early.length), followerResp: this.met / Math.max(1, this.t / 12) }; }
}
export function launch(tr = drawTraits()) {
  const c = new Coin(tr); if (tr.rug) { const d: Wallet = { id: 1e6, cash: SOL_USD * (5 + 20 * rnd()), tok: 0, cost: 0 }; c.dev = d; c.buy(d, d.cash); c.devMc = c.mcap(); }
  return c;
}
