// v15 COH: cohort version of EMO (Lux-Marchesi moods, per-cohort Hawkes arrivals, Chiarella-Iori side, Cont-Bouchaud sizes). 1 tick = 5 s. Sandbox only. Cost per tick is O(cohorts), not O(headcount).
// A cohort = many NPCs who entered in the same price band with the same horizon: headcount, tokens, total cost (avg entry),
// horizon, stop/target/defend, emotions. Each tick the number of members who act is Poisson(headcount x probability);
// their dollar size is a sum of heavy-tailed retail draws ($5-500). Watchers (not-yet-buyers) are cohorts too.
import { PF, SOL_USD, poolFee } from './core-pf';
let S = 1; export const seed = (s: number) => { S = s >>> 0 || 1; };
export const rnd = () => { S ^= S << 13; S >>>= 0; S ^= S >>> 17; S ^= S << 5; S >>>= 0; return S / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(6.2832 * rnd());
const ln = (med: number, sd: number) => med * Math.exp(sd * gauss());
const pois = (l: number) => { if (l <= 0) return 0; if (l > 30) return Math.max(0, Math.round(l + Math.sqrt(l) * gauss())); let k = 0, p = Math.exp(-l), s = p, u = rnd(); while (u > s && k < 200) { k++; p *= l / k; s += p; } return k; };
const RET = { med: +(process.env.RET_MED ?? 44), sd: 1.1, lo: 5, hi: 500 }; // retail trade size, $ (lognormal, clipped)
const RM = RET.med * Math.exp(RET.sd ** 2 / 2) * 0.93, RS = RM * 1.3;          // approx mean/sd after clipping, for k > 20
const retail = (k: number) => { if (k <= 0) return 0; if (k > 20) return Math.max(k * RET.lo, k * RM + Math.sqrt(k) * RS * gauss()); let s = 0; for (let i = 0; i < k; i++) s += Math.min(RET.hi, Math.max(RET.lo, ln(RET.med, RET.sd))); return s; };
const cbSize = () => Math.max(RET.lo, rnd() < 0.9 ? Math.min(400, ln(RET.med, 0.9)) : Math.min(5000, 3.75 * RET.med / Math.pow(rnd() + 1e-9, 1 / 1.5))); // body + Pareto tail
const LM = { nu: +(process.env.LM_NU ?? 0.003), a1: 1.2, a2: 1.5 }, HK = { beta: 1 / 6, aBB: +(process.env.ABB ?? 0.04), aSS: 0.1, aSB: 0.02 }; // Lux-Marchesi switching, Hawkes kernels (per tick)
const K = PF.VSOL0 * SOL_USD * PF.Y0, GY = PF.Y0 - PF.REAL_TOK, HOR = [12, 72, 360, 1440], CAP = +(process.env.COH_CAP ?? 40);
export type Traits = { aud: number; find: number; calls: number; fomo: number; nerve: number; tp: number; patience: number; rug: boolean };
export const AUD = { xm: +(process.env.AUD_XM ?? 12), alpha: +(process.env.AUD_ALPHA ?? 0.77), max: 300000 };
export function drawTraits(): Traits {
  const aud = Math.round(Math.min(AUD.max, AUD.xm / Math.pow(rnd() + 1e-9, 1 / AUD.alpha)));
  return { aud, find: Math.min(0.06, 0.05 * Math.pow(30 / aud, 0.6) * ln(1, 0.5)), calls: aud > 200 && rnd() < 0.5 ? ln(0.8, 0.5) : 0, fomo: 0.6 + 0.8 * rnd(), nerve: ln(1.5, 0.5), tp: ln(3, 0.6), patience: ln(1.5, 0.8), rug: rnd() < 0.12 };
}
type Ev = { at: number; buy: boolean; h: number; usd: number; c: Hold | null; f: number; slip: number; p0: number; snipe: boolean; tag: string };
class Heap { a: Ev[] = []; push(e: Ev) { const a = this.a; a.push(e); let i = a.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (a[j].at <= e.at) break; a[i] = a[j]; i = j; } a[i] = e; }
  pop() { const a = this.a, top = a[0], e = a.pop()!; if (a.length) { let i = 0; for (;;) { let j = 2 * i + 1; if (j >= a.length) break; if (j + 1 < a.length && a[j + 1].at < a[j].at) j++; if (a[j].at >= e.at) break; a[i] = a[j]; i = j; } a[i] = e; } return top; }
  get size() { return this.a.length; } peek() { return this.a[0]; } }
const delay = () => Math.min(60, 0.6 * Math.exp(1.5 * gauss())); // reaction delay in ticks: median 3 s, heavy tail to minutes
const slipDraw = () => Math.min(0.10, Math.max(0.005, ln(0.02, 0.7)));
export type Wallet = { id: number; cash: number; tok: number; cost: number; [k: string]: any };
type Watch = { n: number; h: number; g: number; o: number; hb: number };
type Hold = { n: number; tok: number; cost: number; t0: number; h: number; band: number; stop: number; tp: number; defend: number; defHL: number; panTh: number; pat: number; dRate: number;
  doubt: number; bored: number; fear: number; stopped: boolean; wasDown: boolean; snipe: boolean; hold: number; out: number; hz: number; o: number; pe: number; f: number; hb: number; hs: number };
export class Coin {
  y = PF.Y0; X = K / PF.Y0; R = 0; mayhem = rnd() < +(process.env.MAYHEM ?? 0.25); botLeft = 0; reviveAt = -1; revived = false; pool: { x: number; y: number } | null = null; t = 0; grad = -1; px: number[] = []; vol: number[] = []; tickVol = 0; maxSell = 0; lastBig = 0;
  hype = 0; posts = 0; ath = 0; athT = 0; panic = 0; brkBuys = 0; brkEvents = 0; lastNewBuyer = -999; met = 0; wave = 0; shock = 0; devMc = 0; devSold = -1; dev: Wallet | null = null; herd = 0; q5 = 0; brkT = -1e9; boost = 0; quiet = false; lastSells = 0; bots = rnd() < +(process.env.BOT_NONE ?? 0.6) ? 0.01 : Math.min(+(process.env.BOT_MAX ?? 200), +(process.env.BOT_XM ?? 0.8) / Math.pow(rnd() + 1e-9, 1 / 0.8)); botX = 0; // launch swarm: Pareto per coin, self-exciting // sniper-bot swarm size at launch (heavy-tailed per coin)
  W: Watch[] = HOR.map((h) => ({ n: 0, h, g: 0, o: 0.5, hb: 0 })); H: Hold[] = []; uniq = 0; rep = 0; why: any = {}; hi: number[] = [0, 0, 0, 0]; holders = 0; sellersFrac = 0; early: Hold[] = []; Q = new Heap(); trades: number[] = []; nTr = 0;
  constructor(public tr: Traits) {}
  price() { return this.pool ? this.pool.x / this.pool.y : this.X / this.y; } // curve: virtual quote X over virtual tokens y
  mcap() { return this.price() * PF.SUPPLY; }
  maxBuy(slip: number) { const X = this.pool ? this.pool.x : this.X; return X * (Math.sqrt(1 + slip) - 1) / (1 - PF.CURVE_FEE); }
  capSell(slip: number) { const Y = this.pool ? this.pool.y : this.y; return Y * (1 / Math.sqrt(1 - slip) - 1); }
  private tBuy(usd: number, fee = PF.CURVE_FEE) { // returns [tokens, usd spent]
    if (usd < 0.01) return [0, 0]; let out: number;
    if (!this.pool) { let c = usd * (1 - fee); const X = this.X, k = X * this.y; out = this.y - k / (X + c);
      if (this.y - out <= GY) { out = this.y - GY; c = k / GY - X; usd = c / (1 - fee); }
      this.X += c; this.R += c; this.y -= out;
      if (this.y <= GY + 1) { this.grad = this.t; const p = this.X / this.y, x = Math.max(1, this.R); this.pool = { x, y: x / p }; } // pool gets the SOL buyers really paid (hollow if Mayhem reset the curve low)
    } else { const f = poolFee(this.mcap() / SOL_USD), d = usd * (1 - f), p = this.pool; out = p.y - p.x * p.y / (p.x + d); p.x += d; p.y -= out; }
    this.tickVol += usd; return [out, usd];
  }
  private tSell(q: number, tag: string) {
    if (q <= 0) return 0; let usd: number;
    if (!this.pool) { const g = Math.min(this.R, this.X - this.X * this.y / (this.y + q)); usd = g * (1 - (tag === 'mayhem' ? 0 : PF.CURVE_FEE)); this.X -= g; this.R -= g; this.y += q; } // payout capped by real SOL
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
    const m = this.tr; return { n: 0, tok: 0, cost: 0, t0: this.t, h, band: Math.floor(Math.log(p) / Math.log(1.4)), stop: Math.min(0.85, Math.max(0.1, ln(0.35, 0.5))), hz: Math.round(HOR[h] * ln(1, 0.6)) + 1, tp: snipe ? 1.3 + 0.7 * rnd() : m.tp * Math.exp(0.5 * gauss()),
      defend: 0.02 + 0.06 * rnd(), defHL: 120 + 600 * rnd(), panTh: 0.1 + 0.9 * rnd(), pat: m.patience * Math.exp(0.3 * gauss()) * (HOR[h] / 72) ** 0.3, dRate: ln(1, 0.6),
      doubt: 0, bored: 0, fear: 0, stopped: false, wasDown: false, snipe, hold: snipe ? 12 + 108 * rnd() : 0, out: 0, o: 0.5, pe: 0.2, f: 0.15 + 0.25 * rnd(), hb: 0, hs: 0 };
  }
  private enter(h: number, k: number, usd: number, snipe = false) { // k new holders put `usd` in; join the cohort of their band + horizon
    if (usd < 1 || k < 1) return 0;
    const p = this.price(), band = Math.floor(Math.log(p) / Math.log(1.4)); let c = this.H.find((c) => c.h === h && c.band === band && c.snipe === snipe && this.t - c.t0 < 360);
    if (!c) { c = this.newHold(h, p, snipe); this.H.push(c); if (this.early.length < 3) this.early.push(c); if (this.H.length > CAP) this.merge(); }
    const [out, u] = this.tBuy(usd); this.nTr++; c.n += k; c.tok += out; c.cost += u; this.uniq += k; this.lastNewBuyer = this.t; return u;
  }
  private want(buy: boolean, h: number, k: number, c: Hold | null, f = 1, tag = '', snipe = false) { // k members, each its own trade, own delay/size/slippage
    for (let i = 0; i < k; i++) this.Q.push({ at: this.t + (snipe && buy ? Math.min(1, 0.1 * Math.exp(gauss())) : delay()), buy, h, usd: buy ? cbSize() * (snipe ? 0.35 : 1) : 0, c, f, slip: snipe ? 0.15 : slipDraw(), p0: this.price(), snipe, tag });
    if (c) c.out += k;
  }
  private exec(e: Ev) { // one trade at its own time against the live curve
    const p = this.price();
    if (e.buy && e.c) { const c = e.c; c.out--; if (p > e.p0 * (1 + e.slip) || c.tok < 1) return; const [o, u] = this.tBuy(Math.min(e.usd, this.maxBuy(e.slip))); this.nTr++; c.tok += o; c.cost += u; this.why.defend = (this.why.defend ?? 0) + u; return; } // defends its entry
    if (e.buy) { if (p > e.p0 * (1 + 3 * e.slip)) { if (!e.snipe) this.W[e.h].n++; return; } // price ran away: gives up, keeps watching
      this.enter(e.h, 1, Math.min(e.usd, this.maxBuy(e.slip)), e.snipe); return; }
    const c = e.c!; c.out--; if (c.n < 0.5 || c.tok < 1) return; const q = Math.min(c.tok * Math.min(1, e.f / c.n), this.capSell(e.slip));
    this.tSell(q, e.tag); this.nTr++; c.cost *= 1 - q / c.tok; c.tok -= q; if (e.f >= 1) { c.n = Math.max(0, c.n - 1); if (rnd() < 0.3) this.W[c.h].n++; }
  }
  private merge() { // fold the smallest cohort into the most similar one (same horizon, nearest entry band)
    this.H.sort((a, b) => (a.out > 0 ? 1e12 : 0) + a.cost - (b.out > 0 ? 1e12 : 0) - b.cost); const s = this.H.shift()!; let best = this.H[0], bd = 1e9;
    for (const c of this.H) { const d = Math.abs(c.band - s.band) + (c.h === s.h ? 0 : 5) + (c.snipe === s.snipe ? 0 : 20); if (d < bd) { bd = d; best = c; } }
    const w = s.n / Math.max(1, s.n + best.n), mix = (a: number, b: number) => a * (1 - w) + b * w;
    for (const k of ['stop', 'tp', 'defend', 'defHL', 'panTh', 'pat', 'dRate', 'doubt', 'bored', 'fear', 'o', 'pe', 'f', 'hb', 'hs'] as const) best[k] = mix(best[k], s[k]);
    best.n += s.n; best.tok += s.tok; best.cost += s.cost; best.t0 = Math.min(best.t0, s.t0);
  }
  step() {
    const m = this.tr, t = this.t, p = this.price(); this.why.t = t;
    // breakout: new high after a flat zone (>=30 min without one) gives watchers a FOMO kick
    if (p > this.ath * 1.02 && this.ath > 0 && t - this.athT > 120) this.brkT = t; // new high after a pause: herding boost window
    if (p > this.ath * 1.02 && this.ath > 0 && t - this.athT > 360) { this.brkEvents++; for (const w of this.W) w.g += 0.6; }
    if (p > this.ath) { this.ath = p; this.athT = t; }
    if (t % 6 === 0) for (let i = 0; i < 4; i++) { const n = this.px.length, h = HOR[i], st = Math.max(1, h / 60 | 0); let hi = p; for (let j = Math.max(0, n - h); j < n; j += st) hi = Math.max(hi, this.px[j]); this.hi[i] = hi; }
    let q5 = 0; for (let i = Math.max(0, this.trades.length - 60); i < this.trades.length; i++) q5 += this.trades[i]; this.quiet = t > 60 && q5 < 3; this.q5 = q5; // attention: a coin nobody trades is forgotten
    this.boost = +(process.env.BOOST ?? 1.5) * Math.exp(-(t - this.brkT) / 180);
    const volx = this.v(12) / (this.v(360) + 1e-6), v1 = this.v(12), fromAth = p / this.ath - 1, alive = v1 > 0.5 && t - this.lastNewBuyer < 720;
    // arrivals: discovery grows with holders (word of mouth), shrinks as the audience is used up; calls bring waves
    const left = m.aud - this.met, rate = (m.find * (3 + 4 * Math.sqrt(this.holders)) * (left / m.aud) * Math.pow(m.aud / 30, +(process.env.AUD_REACH ?? 0.3)) * (0.8 + 0.3 * Math.min(2, volx) + this.hype) + (t < 120 ? 0.1 : 0)) * Math.max(0.15, 1 + fromAth) * (this.quiet ? 0.02 : 1) * Math.max(+(process.env.FADE_MIN ?? 0.1), Math.exp(-(t - this.athT) / +(process.env.FADE ?? 2160))) * (1 - this.shock); // interest fades after the last new high
    const act = Math.min(1, this.q5 / 30) * Math.min(1, this.holders / 50); // callers only shill charts that are alive
    if (rnd() < m.calls * Math.exp(-t / 4320) / 720) this.wave += Math.min(0.6, 0.002 / Math.pow(rnd() + 1e-3, 1.0)) * left;
    const wv = this.wave * 0.002; this.wave -= wv; let arr = Math.min(left, pois(rate + wv)); this.met += arr;
    if (arr > 0) { const ape = pois(arr * 0.5 * (0.5 + m.fomo / 2)), a = Math.min(arr, ape), hc = (i: number) => (i < 0.35 ? 0 : i < 0.7 ? 1 : i < 0.9 ? 2 : 3); // half ape in on arrival
      this.want(true, hc(rnd()), a, null); for (let r = arr - a, i = 0; i < 4; i++) { const k = i < 3 ? Math.round(r * [0.35, 0.35, 0.2][i]) : r; this.W[i].n += k; r -= k; } }
    if (this.mayhem && t === 0) this.botLeft = Math.max(1, Math.round(ln(17, 0.8)));
    if (this.mayhem && this.botLeft > 0 && !this.pool && t > 0) for (let i = pois(0.25 + 0.5 * rnd()); i > 0 && this.botLeft > 0; i--, this.botLeft--) { // Mayhem bot (pump.fun docs; Bitquery 2026)
      if (rnd() < 0.47) { this.tBuy(ln(9, 0.7), 0); this.X *= Math.exp(Math.abs(0.15 + 0.1 * gauss())); }
      else { const q = this.capSell(0.5) * rnd() * 0.2; this.tSell(q, 'mayhem'); this.X = Math.max(0.15 * K / PF.Y0, this.X * Math.exp(-Math.abs(0.25 + 0.15 * gauss()))); } this.nTr++; }
    if (t === this.reviveAt) { const F = Math.min(300000, 30 / Math.pow(rnd() + 1e-9, 1 / 0.8)); this.tr.aud += F; this.wave += 0.5 * F; this.hype += 1; this.lastNewBuyer = t; this.revived = true; this.quiet = false; } // a rare call reaches a FRESH audience
    if (t < 60) { const k = pois(this.bots * Math.exp(-t / 6) + this.botX); this.botX = this.botX * Math.exp(-1 / 3) + 0.3 * Math.min(k, 50) * Math.exp(-t / 12); if (k) this.want(true, 0, k, null, 1, '', true); } // sniper/flipper bots: launch Hawkes
    this.hype *= 0.995; this.shock *= 0.995; this.lastBig = this.maxSell; this.maxSell = 0;
    // panic: proportional to the 1-5 min drop and to big sells, half-life ~3 min; contagion from the share of holders selling
    const drop = Math.max(0, -(p / this.at(12) - 1) - 0.08) + 0.5 * Math.max(0, -(p / this.at(60) - 1) - 0.2);
    this.panic = Math.min(0.8, Math.max(this.panic * 0.981, 1.5 * drop) + (this.lastBig > 0.07 * this.mcap() ? 0.3 : 0) + 0.5 * this.sellersFrac); // the drop sets a level (not re-added every tick); contagion and big sells add
    // watchers: greed from momentum over their horizon, dip entries while it still looks alive; attention fades when it is dead
    for (let i = 0; i < 4; i++) { const w = this.W[i]; if (w.n < 0.5) continue; const r = p / this.at(w.h) - 1, dd = p / this.hi[i] - 1;
      w.g = 0.95 * w.g + 0.05 * (m.fomo * Math.max(-1, Math.min(2, 3 * r)) + (dd < -0.15 && dd > -0.8 && alive ? 0.8 : 0) + this.hype + (volx > 1.5 ? 0.3 : 0));
      const U = Math.max(-2, Math.min(2, this.boost + LM.a1 * this.herd + LM.a2 * Math.max(-2, Math.min(2, 10 * r)))); w.o += LM.nu * (1 + 4 * this.boost) * ((1 - w.o) * Math.exp(U) - w.o * Math.exp(-U)) / 2; w.o = Math.min(1, Math.max(0, w.o)); // optimists vs pessimists
      const mu = w.n * Math.min(0.2, 0.0015 * Math.exp(2 * w.g) * (0.3 + w.o)) * (1 - Math.min(1, this.panic)) * (1 - this.shock) * (this.quiet ? 0.1 : 1), lam = mu + w.hb; let kb = 0;
      for (let e = Math.min(Math.floor(w.n), pois(lam)); e > 0; e--) if (0.6 * w.o + 0.4 * Math.max(-1, Math.min(1, 10 * r)) + 0.5 * gauss() > -0.3) kb++; // Chiarella-Iori: chart + noise decides each would-be buyer
      w.hb = w.hb * Math.exp(-HK.beta) + HK.aBB * kb + HK.aSB * this.lastSells; if (kb) { w.n -= kb; this.want(true, i, kb, null); }
      w.n *= 1 - (this.quiet ? 0.08 : alive ? 0.0005 : 0.004) - (dd < -0.6 ? 0.002 : 0); }
    // holders: doubt (time + unrealised gain), boredom (no flow), fear (panic vs own threshold), target, stop, defence
    let sellers = 0, hn = 0; const green = p > this.at(12);
    for (const c of this.H) { if (c.n < 0.5 || c.tok < 1) { c.n = 0; continue; } const pnl = p * c.tok / c.cost, age = t - c.t0; hn += c.n;
      c.doubt += c.dRate * (0.0004 + 0.002 * Math.max(0, Math.min(5, pnl - 1))) / c.pat; if (c.wasDown && pnl > 1.1) { c.doubt *= 0.5; c.wasDown = false; } if (pnl < 0.9) c.wasDown = true;
      c.bored = Math.max(0, c.bored + (this.quiet ? 0.05 : 0) + (volx < 0.5 ? 0.0012 : 0) + (t - this.lastNewBuyer > 120 ? 0.0008 : 0) - (volx > 1.5 ? 0.003 : 0));
      c.fear = Math.max(0.97 * c.fear, (this.panic - c.panTh) / m.nerve);
      if (pnl < 1 - c.stop && !c.stopped) c.stopped = true;
      let ps = 0.0003 + 0.006 * c.doubt * (green || volx > 1 ? 1 : 0.3) + 0.004 * c.bored + 0.04 * Math.max(0, c.fear) + (pnl > c.tp ? 0.01 : 0) + (c.stopped && pnl < 1 - c.stop ? 0.006 : 0);
      if (c.snipe) ps = pnl > c.tp ? 0.3 : age > c.hold ? 0.05 : 0.002; if (c.snipe && age > 4 * c.hold) ps = 0; // bot gave up on it
      if (this.shock > 0.5) ps += 0.02; if (this.quiet && c.bored > 0.8 && !c.snipe) ps = 0; // forgot the coin: stops watching
      const rH = p / this.at(c.hz) - 1, U = Math.max(-2, Math.min(2, this.boost + LM.a1 * this.herd + LM.a2 * Math.max(-2, Math.min(2, 10 * rH)))), ch = 1 - c.f; // Lux-Marchesi: chartists switch optimist <-> pessimist
      const flow = LM.nu * (1 + 4 * this.boost) * ((ch - c.o - c.pe) * 0 + c.pe * Math.exp(U) - c.o * Math.exp(-U)) / 2; c.o = Math.min(ch, Math.max(0, c.o + flow)); c.pe = ch - c.o;
      if (!c.snipe) ps *= 0.3 + 2 * c.pe + (c.f * (pnl > c.tp ? 3 : 0));
      if (!this.pool && pnl > 1.3) { const prog = 1 - (this.y - GY) / PF.REAL_TOK; if (prog > 0.5) ps += +(process.env.PREG ?? 0.006) * (prog - 0.5) / 0.5; } // early holders and flippers take profit into the graduation run-up // pessimists and profit-taking fundamentalists sell
      const free = Math.max(0, c.n - c.out), muS = free * Math.min(0.5, ps), muB = c.snipe || (this.quiet && c.bored > 0.8) ? 0 : free * (c.o * (rH > 0 ? 0.0004 : 0) + (pnl < 1 - c.defend && pnl > 1 - c.stop && alive && this.panic < 0.3 ? c.f * 0.004 * Math.exp(-age / c.defHL) : 0));
      let k = 0, kd = 0; for (let e = Math.min(Math.floor(free), pois(muS + muB + c.hs + c.hb)); e > 0; e--) { // each event's side: fundamental (own cost basis) + chart + noise
        const sc = c.f * 2 * Math.log(1 / pnl) + (c.o - c.pe) * Math.max(-1, Math.min(1, 10 * rH)) + 0.6 * gauss() + Math.log((muB + c.hb + 1e-6) / (muS + c.hs + 1e-6)); if (sc > 0) kd++; else k++; }
      c.hb = c.hb * Math.exp(-HK.beta) + HK.aBB * kd + HK.aSB * k; c.hs = c.hs * Math.exp(-HK.beta) + HK.aSS * k; // Hawkes: buys excite buys, sells excite both
      if (kd) { this.want(true, c.h, kd, c); this.rep += kd; }
      if (k > 0) {
        const tag = c.snipe ? 'snipe' : c.fear > 0.3 ? 'fear' : c.stopped && pnl < 1 - c.stop ? 'stop' : pnl > c.tp ? 'tp' : c.bored > c.doubt ? 'bored' : 'doubt';
        for (let j = 0; j < k; j++) this.want(false, c.h, 1, c, rnd() < 0.6 ? 1 : 0.5, tag); sellers += k; c.doubt *= 0.9; }
    }
    this.H = this.H.filter((c) => (c.n >= 0.5 && c.tok >= 1) || c.out > 0); this.holders = hn; this.sellersFrac = sellers / Math.max(20, hn); this.lastSells = sellers; let ho = 0, hp = 0; for (const c of this.H) { ho += c.n * c.o; hp += c.n * c.pe; } this.herd = (ho - hp) / Math.max(1, hn);
    const d = this.dev; // rug dev: one wallet, sells his whole bag at once
    if (d && d.tok > 1 && t > 24 && (this.mcap() > this.devMc * (1.5 + rnd()) || t > 120 + 240 * rnd()) && rnd() < 0.3) { const u = this.tSell(d.tok, 'dev'); this.nTr++; d.cash += u; d.tok = 0; this.devSold = t; this.shock = 0.9; this.panic = Math.min(0.8, this.panic + 0.5); }
    while (this.Q.size && this.Q.peek().at < t + 1) this.exec(this.Q.pop()); // trades interleave inside the candle in time order
    this.px.push(this.price()); this.vol.push(this.tickVol); this.trades.push(this.nTr); this.nTr = 0; this.tickVol = 0; this.t++;
  }
  cohorts() { return this.H.length + 4; }
  aud() { return this.tr.aud; }
  dead() { const n = this.vol.length; if (n < 720) return false; if (this.reviveAt < 0) this.reviveAt = rnd() < +(process.env.REVIVE ?? 0.01) ? n + Math.floor(720 + 7200 * rnd()) : 0; if (n <= this.reviveAt) return false; for (let i = n - 720; i < n; i++) if (this.vol[i] > 0) return false; return true; }
  clues() { return { uniqueShare: this.uniq / Math.max(1, this.uniq + this.rep), devBag: this.dev ? this.dev.cost : 0, devSoldAt: this.devSold,
    earlyHoldersStill: this.early.reduce((s, c) => s + (c.n > 0.5 ? 1 : 0), 0) / Math.max(1, this.early.length), followerResp: this.met / Math.max(1, this.t / 12) }; }
}
export function launch(tr = drawTraits()) {
  const c = new Coin(tr); if (c.mayhem) c.bots = 0.01; if (c.mayhem) tr.aud = Math.max(5, Math.round(tr.aud * +(process.env.MAYHEM_AUD ?? 0.3))); /* Bitquery: Mayhem coins draw ~4x fewer outside buyers */ if (tr.rug) { const d: Wallet = { id: 1e6, cash: SOL_USD * (5 + 20 * rnd()), tok: 0, cost: 0 }; c.dev = d; c.buy(d, d.cash); c.devMc = c.mcap(); }
  return c;
}
