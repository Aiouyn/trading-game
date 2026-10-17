// v13 OBS: observation-driven NPCs. ONE hidden per-coin trait: buyer-pool size B (Pareto). Dev intent is a separate hidden trait,
// visible only via wallet clues. NPCs react only to public signals; the player API (buy/sell/post/promo) feeds the same signals.
// Types are NOT in the model; coins are labelled post hoc for stats. Reuses core.ts (thin curve via CURVE_S, pool), tick-start
// exit checks on per-holder ~CK-tick clocks, sliced big sells, Hawkes-on-|ret| arrivals.
import TAB from './c-table.json'; import PS from './ps-shares.json'; import KN0 from './obs-knobs.json';
import { rng, lognorm, type Trader } from './core'; import { Coin } from './core-sel';
export const K: any = { ...KN0, ...(process.env.OBSK ? JSON.parse(process.env.OBSK) : {}) };
const T_ = TAB as Record<string, { sol: number[] }>;
const SOL = ['1,0', '1,1', '1,2', '1,3', '2,1', '2,2', '3,1'].flatMap(k => T_[k]?.sol ?? []);
const PS_OK = ((a: number[]) => { const q = [...a].sort((x, y) => x - y)[Math.floor(a.length * 0.999)]!; return a.filter(x => x <= q); })(PS as number[]);
const pick = <X>(a: X[], r: () => number) => a[Math.floor(r() * a.length)]!;
const pareto = (r: () => number, xm: number, al: number) => xm * Math.pow(1 - r() * 0.9999, -1 / al);
const U = (r: () => number, [a, b]: number[]) => a! + (b! - a!) * r();
const pois = (r: () => number, lam: number) => { if (lam > 30) return Math.max(0, Math.round(lam + Math.sqrt(lam) * lognormZ(r))); let k = 0, p = Math.exp(-lam), c = p; const u = r(); while (u > c && k < 60) { k++; p *= lam / k; c += p; } return k; };
const lognormZ = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
export type Account = { rep: number; posts: number; pnl: number[] };
export class World { acct = new Map<string, Account>(); news: { theme: number; born: number }[] = [];
  get(id: string) { let a = this.acct.get(id); if (!a) { a = { rep: 1, posts: 0, pnl: [] }; this.acct.set(id, a); } return a; } }
export type Ev = { t: number; kind: string; v?: number };
export class ObsCoin {
  c = new Coin(); r: () => number; B: number; dev: 'honest' | 'slow' | 'rugger'; theme: number; hold: Trader[] = []; id = 1;
  reached = 0; inf = 0; H = 0; fear = 0; buzz = 0; promo = 0; postsHere = 0; lp = 0; ath = 0; volEma = 0; holdPrev = 0; r0 = 0;
  devT: Trader; linked: Trader[] = []; devDumpT: number; devThr = 1e9; mc0 = 0; ema = 0; clues: Ev[] = []; uniq = new Set<number>(); nBuys = 0; repeatBuys = 0; smartBuys = 0;
  follow: { t: number; acct: string; tr: Trader }[] = []; replies = 0; dumped = false; world: World;
  constructor(seed: number, world: World) {
    const r = this.r = rng(seed * 104729 + 7); this.world = world;
    this.B = pareto(r, K.B_xm, K.B_alpha); const u = r(); this.dev = u < K.dev_p_rugger ? 'rugger' : u < K.dev_p_rugger + K.dev_p_slow ? 'slow' : 'honest';
    // theme match: correlated with log B, noisy (clue only)
    const z = (Math.log(this.B / K.B_xm) * K.B_alpha - 1); this.theme = 1 / (1 + Math.exp(-(K.theme_corr * z + Math.sqrt(1 - K.theme_corr ** 2) * lognormZ(r))));
    this.devT = this.mk('dev', 1e6); const devBag = this.dev === 'rugger' ? lognorm(r, 600, 0.5) : lognorm(r, 200, 0.6); this.c.buy(this.devT, devBag);
    // wallet clues (noisy): fresh funding, linked sniper wallets
    if (r() < (this.dev === 'rugger' ? 0.75 : 0.15)) this.clue('devFreshFunding');
    const nl = this.dev === 'rugger' ? 2 + Math.floor(r() * 4) : (r() < 0.15 ? 1 : 0);
    for (let i = 0; i < nl; i++) { const s = this.mk('linked', lognorm(r, 250, 0.5)); if (this.c.buy(s, s.cash) > 0) { this.linked.push(s); this.clue('linkedWalletBuy'); } }
    for (let i = 0; i < 3 + Math.floor(r() * 4); i++) this.arrive('snipe', lognorm(r, 200, 0.6));
    this.holdPrev = this.hold.length; this.devDumpT = this.dev === 'rugger' ? 30 + Math.floor(pareto(r, 120, 1.2)) : 1e9; this.devThr = this.dev === 'rugger' ? U(r, K.rug_thr) : 1e9; this.mc0 = this.c.price();
  }
  mk(kind: string, cash: number): Trader { return { id: this.id++, cash, tok: 0, cost: 0, u0: cash, kind, entry: 0, peak: 0, born: this.c.t }; }
  clue(kind: string, v?: number) { if (this.c.t > 720) return; this.clues.push({ t: this.c.t, kind, v }); }
  S() { return Math.max(0, 1 - this.reached / this.B); }
  size() { const c = this.c; const p = c.price(); const early = 1 + (K.early_mult - 1) * Math.min(1, Math.max(0, (30000 * 0.357 - p * 1e9) / (16000 * 0.357)));
    if (c.pool) { if (!this.r0) this.r0 = c.pool.r ?? 0; return pick(PS_OK, this.r) * this.r0 * K.post_mult / K.PSPLIT * this.S(); } /* v13.1: pool sizes bounded by unreached B */ /* depth at migration (live depth compounded to 1e5x) */
    return pick(SOL, this.r) * K.size_mult * early; }
  arrive(kind: string, usd: number, acct?: string): Trader | null { const r = this.r, c = this.c; const tr = this.mk(kind, usd);
    tr.tw = Math.min(0.9, pareto(r, K.trail_xm, K.trail_alpha)); tr.stop = U(r, K.stop); tr.pat = pareto(r, K.pat_xm, K.pat_alpha); tr.ck = 1 + Math.floor(lognorm(r, K.CK, 0.6)); tr.ph = Math.floor(r() * 1000);
    tr.hype = r() < U(r, K.hype_share); tr.acct = acct; tr.cd = 0;
    if (c.buy(tr, usd) <= 0) return null; tr.entry = c.price(); tr.peak = tr.entry; this.hold.push(tr); return tr; }
  // ---- player API (feeds the same public signals) ----
  playerBuy(tr: Trader, usd: number) { const got = this.c.buy(tr, usd); if (got > 0) { tr.entry = tr.entry || this.c.price(); this.nBuys++; this.uniq.add(tr.id); } return got; }
  playerSell(tr: Trader, frac = 1) { return this.c.sell(tr, tr.tok * frac); }
  post(acctId: string, tr?: Trader) { const a = this.world.get(acctId); a.posts++; this.postsHere++;
    const eff = a.rep / (1 + this.postsHere / K.post_dim) / (1 + a.posts / K.acct_dim); this.buzz += K.k_buzz * eff;
    const nf = pois(this.r, K.followers * a.rep * this.S()); for (let i = 0; i < nf; i++) this.follow.push({ t: this.c.t + 1 + Math.floor(lognorm(this.r, 12, 0.8)), acct: acctId, tr: null as any });
    const rep = pois(this.r, 3 * this.S() * Math.sqrt(this.B / K.B_xm) * Math.min(1, eff)); this.replies += rep; this.clue('chatReplies', rep); }
  promoBuy(acctId: string) { const a = this.world.get(acctId); this.promo += K.promo_gain * a.rep / (1 + this.postsHere / K.post_dim); this.clue('promo'); }
  step() {
    const c = this.c, r = this.r, t = c.t, p0 = c.price(); this.ath = Math.max(this.ath, p0);
    const ret = this.lp ? p0 / this.lp - 1 : 0; this.lp = p0;
    this.H = this.H * Math.exp(-1 / K.TH) + K.KH * Math.max(0, Math.abs(ret) - K.THR);
    if (ret < -K.fear_drop) { this.fear = Math.min(K.fear_max, this.fear + 0.5); this.clue('bigDump'); }
    this.fear *= Math.pow(0.5, 1 / K.fear_half); this.buzz *= Math.pow(0.5, 1 / K.buzz_half); this.promo *= Math.pow(0.5, 1 / K.promo_half); this.inf *= Math.exp(-1 / K.TI);
    const lastVol = c.vol.length ? c.vol[c.vol.length - 1]! : 0; this.volEma = this.volEma * 0.95 + lastVol * 0.05; const spike = lastVol > K.spike_x * (this.volEma + 1);
    const nh = this.hold.length; const growth = Math.max(0, nh - this.holdPrev) / Math.max(5, this.holdPrev); if (t % 12 === 0) this.holdPrev = nh;
    // public-signal response f(signals); buyers only exist in the unreached share of B; drawdown and age make buying less attractive
    const f = (1 + K.k_vol * Math.log1p(this.volEma / 200)) * (1 + K.k_hold * Math.log1p(growth * 12)) * (1 + this.buzz + this.promo) * (1 - this.fear) * (1 + this.H) * Math.pow(p0 / this.ath, 2);
    const base = K.A0 * Math.pow(0.5, t / K.A0_half) + K.beta * this.inf;
    const S = this.S(); const n = pois(r, base * f * S * (c.pool ? K.PSPLIT : 1));
    for (let i = 0; i < n; i++) { const smart = r() < K.smart_share * Math.min(4, Math.sqrt(this.B / K.B_xm)) * (0.5 + S); /* v13.1: smart wallets find big-B coins */ const tr = this.arrive(smart ? 'smart' : 'npc', this.size());
      if (tr) { const w = c.pool ? 1 / K.PSPLIT : 1; this.reached += w; this.inf += w; this.nBuys++; if (r() < 0.12 && this.uniq.size) { this.repeatBuys++; } else this.uniq.add(tr.id); if (smart) { this.smartBuys++; this.clue('smartWalletBuy'); } } }
    // v13.1 persistent two-way base flow: holders/watchers/scalpers trade at a rate ~ sqrt(holders) x life (recent recruitment), pulled by
    // buzz/promos and bursts; dips attract buys, rips attract sells. Dead coins (no recruitment, little volume) go quiet.
    this.ema = this.ema ? this.ema * 0.97 + p0 * 0.03 : p0;
    { const life = this.inf / (this.inf + K.flow_i0) * (1 + K.k_vol * Math.log1p(this.volEma / 200)); const lam = K.flow_k * Math.sqrt(nh) * life * (1 + this.buzz + this.promo) * (1 - this.fear) * (1 + this.H) * (c.pool ? K.PSPLIT : 1);
      const nf = pois(r, lam); const dev = (this.ema - p0) / this.ema; const pB = Math.min(0.85, Math.max(0.15, 0.5 + K.flow_contra * dev * 10 + 0.15 * (this.buzz + this.promo) / (1 + this.buzz + this.promo)));
      for (let i = 0; i < nf; i++) { if (r() < pB) { const tr = this.arrive('scalp', this.size() * K.flow_size); if (tr) { tr.pat = Math.min(tr.pat, lognorm(r, 120, 0.8)); this.nBuys++; this.repeatBuys++; } }
        else if (nh) { let rem = this.size() * K.flow_size / p0; for (let k = 0; k < 6 && rem > 1; k++) { const h = this.hold[Math.floor(r() * nh)]!; if (h.kind === 'player' || h.kind === 'dev' || h.tok < 1) continue; const q = Math.min(h.tok, rem); c.sell(h, q); rem -= q; } } } } /* dollar-matched across holders: base flow is net-neutral */
    // followers of posts arrive with latency (clue: latency is observable)
    if (t % 100 === 0) this.follow = this.follow.filter(f => f.t >= t || f.tr); for (const fo of this.follow) if (fo.t === t) { const tr = this.arrive('follower', this.size(), fo.acct); if (tr) { this.clue('followerBuy', t); fo.tr = tr; } }
    // NPC chat posts by holders (reputation 0.3); dev behaviour
    if (r() < K.npc_post_rate * nh) this.post('npc' + Math.floor(r() * 50));
    if ((t === this.devDumpT || p0 > this.devThr * this.mc0) && this.devT.tok > 0 && this.dev === 'rugger') { /* v13.1: rugger dumps at a dev-specific mcap multiple (well before graduation) or timeout */ this.c.sell(this.devT, this.devT.tok); for (const l of this.linked) this.c.sell(l, l.tok); this.dumped = true; }
    if (this.dev === 'slow' && t > 120 && t % 200 === 0 && this.devT.tok > 0) { this.c.sell(this.devT, this.devT.tok * 0.1); this.clue('devSell'); }
    if (this.dev === 'honest' && t > 2000 && t % 720 === 0 && this.devT.tok > 0) this.sliceSell(this.devT, U(r, K.slice));
    // exits: judged on tick-start price p0, each holder on its own clock; partial slices; hype sellers sell into spikes/promos
    for (const tr of this.hold) {
      if (tr.tok < 1 || tr.kind === 'player' || (t + tr.ph) % tr.ck !== 0 || t < tr.cd) continue; tr.peak = Math.max(tr.peak, p0); const x = p0 / tr.entry, age = t - tr.born;
      let hit = (tr.hype && (spike || this.promo > 0.3) && x > 1.05) || (p0 < (1 - tr.tw) * tr.peak && tr.peak > 1.05 * tr.entry) || x < tr.stop || age > tr.pat;
      if (tr.kind === 'linked' && this.dev !== 'rugger') hit = hit || age > 300;
      if (hit) { this.sliceSell(tr, tr.hype && spike ? 1 : U(r, K.slice)); tr.cd = t + Math.floor(lognorm(r, 60, 0.8)); if (age > tr.pat) tr.pat += pareto(r, K.pat_xm, K.pat_alpha); }
    }
    if (t % 50 === 0) this.hold = this.hold.filter(h => h.tok >= 1);
  }
  sliceSell(tr: Trader, fr: number) { const c = this.c; if (c.pool) { const val = tr.tok * c.price(), lim = K.slice_pool * (c.pool.r ?? 0); if (val * fr > lim) fr = lim / val; }
    return c.sell(tr, tr.tok < 50 || tr.tok * c.price() < 2 ? tr.tok : tr.tok * fr); }
  // observable clue vector at time t (public info only)
  features(t: number) { const ev = this.clues.filter(e => e.t <= t); const cnt = (k: string) => ev.filter(e => e.kind === k).length;
    const fol = ev.filter(e => e.kind === 'followerBuy').length; const rep = ev.filter(e => e.kind === 'chatReplies').reduce((s, e) => s + (e.v ?? 0), 0);
    const px = this.c.px; const vol = this.c.vol.slice(0, t).reduce((a, b) => a + b, 0);
    return [1, this.theme, this.uniq.size / Math.max(1, this.nBuys), Math.log1p(this.nBuys), cnt('devFreshFunding'), Math.min(3, cnt('linkedWalletBuy')), Math.log1p(cnt('smartWalletBuy')), Math.log1p(fol), Math.log1p(rep), cnt('bigDump') > 0 ? 1 : 0, Math.log((px[t] ?? px[px.length - 1]!) / px[0]!), Math.log1p(vol / 1000)]; }
}
export function label(o: { c: { px: number[] }; dumped: boolean; dev: string }): string { const px = o.c.px, p0 = px[0]!; const pk = Math.max(...px) / p0; const ipk = px.indexOf(Math.max(...px));
  if (o.dumped && o.dev === 'rugger') return 'rug';
  const deadAt = px.findIndex((p, i) => i > ipk && p < 0.2 * Math.max(...px)); if (pk < 5 && deadAt >= 0 && deadAt < 720) return 'quick';
  if (pk >= 100) return 'runner'; if (pk >= 10) return 'trender'; return pk >= 2 && (deadAt < 0 || deadAt > 2880) ? 'grinder' : 'quick'; }
