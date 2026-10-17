// Shared harness (not an approach): the real bonding curve (repo curve.ts quoteBuy/quoteSell), then after graduation a
// GameState-free mirror of repo pool.ts (x*y=k, 1% fee, virtual cash never paid out, 95% clip, taper). Tick = 5 s, 720 ticks = 1 game day.
import { quoteBuy, quoteSell, spotAt, formulaCashAt } from '../repo/src/world/launchpad/curve';
import { LP } from '../repo/src/world/launchpad/constants';
import { poolSpot, type LpPool } from '../repo/src/world/launchpad/pool';
// v6 SANDBOX ONLY (Ledger-approved): CURVE_S scales the curve's virtual cash (X0 $15k -> ~$5.36k = ~30 SOL at ~$179, start mcap
// ~$5k like Pump.fun). Same Y0/GRAD_Y, so the constant-product shape and the 15.45x graduation multiple are unchanged; repo untouched.
export const NOCLIP = process.env.NOCLIP === '1'; export let LOG: ((e: any) => void) | null = null; export const setLog = (f: any) => { LOG = f; };
export const S = +(process.env.CURVE_S ?? 1);
export const TPD = 720, DAYS = 7, T = TPD * DAYS;
export function rng(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
export const lognorm = (r: () => number, med: number, sig: number) => med * Math.exp(sig * Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()));
export const TYPES = ['rug', 'quick', 'grinder', 'trender', 'runner'] as const; export type CType = typeof TYPES[number];
export const ODDS: Record<CType, number> = { rug: 0.17, quick: 0.655 - +(process.env.TODDS ?? 0.03), grinder: 0.16, trender: +(process.env.TODDS ?? 0.03), runner: 0.015 };
export function pickType(r: () => number): CType { let u = r(); for (const k of TYPES) { u -= ODDS[k]; if (u < 0) return k; } return 'quick'; }
export interface Trader { id: number; cash: number; tok: number; cost: number; kind: string; entry: number; peak: number; [k: string]: any }
export class Coin {
  y = LP.Y0; pool: LpPool | null = null; grad = -1; t = 0; fees = 0;
  px: number[] = []; vol: number[] = []; nTr: number[] = []; buys: number[] = []; uniq = new Set<number>();
  curTickVol = 0; curTickN = 0; curTickBuys = 0; lastPx = spotAt(LP.Y0) * S; recBuy = 0; recSell = 0;
  price() { return this.pool ? poolSpot(this.pool) : spotAt(this.y) * S; }
  /** buy with dollars; returns tokens */
  buy(tr: Trader, dollars: number): number {
    dollars = Math.min(dollars, tr.cash); if (dollars < 1) return 0;
    let out = 0, paid = 0;
    if (!this.pool) {
      const q = quoteBuy(this.y, Math.floor(dollars / S * 100)); if (!q.ok) return 0;
      out = q.tokens; paid = q.spendCents / 100 * S; this.fees += q.feeCents / 100 * S; this.y -= q.tokens;
      if (q.graduates) this.graduate();
    } else {
      const p = this.pool; let cents = Math.floor(dollars * 100); let fee = Math.ceil(cents * LP.FEE_RATE); let inD = (cents - fee) / 100;
      out = p.y - (p.x * p.y) / (p.x + inD); if (!(out > 0)) return 0;
      if (out >= 0.95 * (p.ry ?? 0)) { out = 0.95 * (p.ry ?? 0); inD = (p.x * out) / (p.y - out); cents = Math.ceil(inD * 100 / (1 - LP.FEE_RATE)); fee = cents - Math.round(inD * 100); inD = (cents - fee) / 100; if (cents / 100 > tr.cash) return 0; }
      if (LOG) LOG({ t: this.t, side: 'B', kind: tr.kind, usd: cents / 100, r: (p.r ?? 0) + inD, x: p.x + inD, xBefore: p.x, clip: false, taper: false });
      p.x += inD; p.y -= out; p.r = (p.r ?? 0) + inD; p.ry = Math.max(0, (p.ry ?? 0) - out); paid = cents / 100; this.fees += fee / 100;
    }
    tr.cash -= paid; tr.tok += out; tr.cost += paid; this.rec(tr, paid, true); return out;
  }
  /** sell tokens; returns dollars after fee */
  sell(tr: Trader, qty: number): number {
    let q = Math.floor(Math.min(qty, tr.tok)); if (q <= 0) return 0; let net = 0;
    if (!this.pool) {
      if (this.y + q > LP.Y0) q = LP.Y0 - this.y; const s = quoteSell(this.y, q); if (!s.ok || s.grossCents * S < 2) return 0;
      net = s.netCents / 100 * S; this.fees += s.feeCents / 100 * S; this.y += q;
    } else {
      const p = this.pool; let gross = p.x - (p.x * p.y) / (p.y + q); const realCash = p.r ?? 0;
      const x0 = p.x; let clip = false, taper = false;
      if (gross >= (NOCLIP ? 1 : 0.95) * realCash) { gross = (NOCLIP ? 1 : 0.95) * realCash; q = (p.y * gross) / (p.x - gross); clip = true; } /* diag: NOCLIP keeps only the never-pay-virtual guard */
      const cents = Math.floor(gross * 100); if (cents < 2) return 0; const fee = Math.ceil(cents * LP.FEE_RATE);
      p.x -= cents / 100; p.y += q; p.r = realCash - cents / 100; p.ry = (p.ry ?? 0) + q;
      const xMax = (p.d ?? 1) * (p.r ?? 0); if (!NOCLIP && p.x > xMax) { p.x = Math.max(p.r ?? 0, xMax); taper = true; }
      if (LOG) LOG({ t: this.t, side: 'S', kind: tr.kind, tok: q, usd: cents / 100, r: p.r, x: p.x, xBefore: x0, clip, taper });
      net = (cents - fee) / 100; this.fees += fee / 100;
    }
    tr.cost *= 1 - q / Math.max(q, tr.tok); tr.tok -= q; tr.cash += net; this.rec(tr, net, false); return net;
  }
  graduate() { // as graduate.ts + seedPool: raised cash less the 1.5% graduation fee; the 200M unsold-to-curve tokens are the pool's real float
    this.grad = this.t; const price = spotAt(this.y) * S; const cash = formulaCashAt(this.y) * S * (1 - LP.GRAD_FEE_RATE);
    const y = LP.SUPPLY - LP.CURVE_SUPPLY; const x = price * y; const R = Math.min(cash, x); this.pool = { x, y, d: x / R, r: R, ry: y };
  }
  rec(tr: Trader, d: number, isBuy: boolean) { this.curTickVol += d; this.curTickN++; if (isBuy) { this.curTickBuys++; this.uniq.add(tr.id); this.recBuy += d; } else this.recSell += d; }
  endTick() { this.px.push(this.price()); this.vol.push(this.curTickVol); this.nTr.push(this.curTickN); this.buys.push(this.curTickBuys);
    this.curTickVol = 0; this.curTickN = 0; this.curTickBuys = 0; this.recBuy *= 0.95; this.recSell *= 0.95; this.t++; }
}
export interface Approach { name: string; init(c: Coin, type: CType, r: () => number): any; step(c: Coin, st: any, r: () => number): void }
// Bots (same in every approach): $50 round trips held 360 ticks (30 min). Random: random coin, random entry tick in [60,720).
// Tell (v2, stricter): at tick 60 buys only if >= 15 distinct buyers, buys >= 65% of trades, and price >= 1.3x launch (public data only).
export function runCoin(ap: Approach, seed: number, type: CType) {
  const r = rng(seed * 7919 + 13); const c = new Coin(); const st = ap.init(c, type, r);
  const rb: Trader = { id: -1, cash: 50, tok: 0, cost: 0, kind: 'bot', entry: 0, peak: 0 }, tb: Trader = { ...rb, id: -2 };
  const rIn = r() < 0.5 ? 60 + Math.floor(r() * 660) : -1; let tIn = -1; const out: number[] = [];
  for (let t = 0; t < T; t++) {
    ap.step(c, st, r);
    if (t === rIn) c.buy(rb, 50); if (rIn >= 0 && t === rIn + 360) c.sell(rb, rb.tok);
    if (t === 60) { const n = c.nTr.reduce((a, b) => a + b, 0), b = c.buys.reduce((a, b) => a + b, 0); if (c.uniq.size >= 15 && b >= 0.65 * n && c.price() >= 1.3 * c.px[0]!) { tIn = t; c.buy(tb, 50); } }
    if (tIn >= 0 && t === tIn + 360) c.sell(tb, tb.tok);
    c.endTick();
  }
  return { c, type, rand: rIn >= 0 ? rb.cash - 50 : null, tell: tIn >= 0 ? tb.cash - 50 : null };
}
