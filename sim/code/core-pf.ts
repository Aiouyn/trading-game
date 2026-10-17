// SANDBOX ONLY: Pump.fun's real curve (pumpfun-audit.md PART 1). Game dollars at SOL_USD (default $104, the 2026-10-16 close).
// Global acct: 30 SOL virtual, 1.073B virtual tokens, 793.1M sold on the curve, 1B supply; completes when real tokens == 0.
// Curve fee 1.25% (pump.fun/docs/fees, 2026-10-17). Migration 0.015 SOL flat. PumpSwap pool = 206.9M tokens + raised less fee
// (LP burnt, nothing virtual); pool fee tiered by mcap in SOL. Same trade/clip/taper mechanics as core.ts Coin otherwise.
import { Coin, NOCLIP, LOG, type Trader } from './core';
export const SOL_USD = +(process.env.SOL_USD ?? 104);
export const PF = { VSOL0: 30, Y0: 1_073_000_000, REAL_TOK: 793_100_000, SUPPLY: 1_000_000_000, CURVE_FEE: 0.0125, MIGRATE_SOL: 0.015 };
export const PF_X0 = PF.VSOL0 * SOL_USD, PF_K = PF_X0 * PF.Y0, PF_GRAD_Y = PF.Y0 - PF.REAL_TOK;
const TIERS: [number, number][] = [[420, .0125], [1470, .012], [2460, .0115], [3440, .011], [4420, .0105], [9820, .01], [14740, .0095], [19650, .009], [24560, .0085], [29470, .008], [34380, .0075], [39300, .007], [44210, .0065], [49120, .006], [54030, .0055], [58940, .00525], [63860, .005], [68770, .00475], [73681, .0045], [78590, .00425], [83500, .004], [88400, .00375], [93330, .0035], [98240, .00325]];
export const poolFee = (mcapSol: number) => { for (const [hi, f] of TIERS) if (mcapSol < hi) return f; return 0.003; };
const spot = (y: number) => PF_K / (y * y);
export class PFCoin extends Coin {
  constructor() { super(); this.y = PF.Y0; this.lastPx = spot(PF.Y0); }
  price() { return this.pool ? this.pool.x / this.pool.y : spot(this.y); }
  buy(tr: Trader, dollars: number): number {
    dollars = Math.min(dollars, tr.cash); if (dollars < 1) return 0; let out = 0, paid = 0;
    if (!this.pool) {
      const f = PF.CURVE_FEE, X = PF_K / this.y; let spend = Math.floor(dollars * 100) / 100, c = spend * (1 - f);
      out = Math.floor(this.y - PF_K / (X + c)); let grad = false;
      if (this.y - out <= PF_GRAD_Y) { out = this.y - PF_GRAD_Y; c = PF_K / PF_GRAD_Y - X; spend = Math.ceil(c / (1 - f) * 100) / 100; grad = true; if (spend > tr.cash) return 0; }
      if (out <= 0) return 0; paid = spend; this.fees += spend - c; this.y -= out; if (grad) this.graduate();
    } else {
      const p = this.pool, F = poolFee(this.price() * PF.SUPPLY / SOL_USD); let cents = Math.floor(dollars * 100); let fee = Math.ceil(cents * F); let inD = (cents - fee) / 100;
      out = p.y - (p.x * p.y) / (p.x + inD); if (!(out > 0)) return 0;
      if (out >= 0.95 * (p.ry ?? 0)) { out = 0.95 * (p.ry ?? 0); inD = (p.x * out) / (p.y - out); cents = Math.ceil(inD * 100 / (1 - F)); fee = cents - Math.round(inD * 100); inD = (cents - fee) / 100; if (cents / 100 > tr.cash) return 0; }
      if (LOG) LOG({ t: this.t, side: 'B', kind: tr.kind, usd: cents / 100, r: (p.r ?? 0) + inD, x: p.x + inD, xBefore: p.x, clip: false, taper: false });
      p.x += inD; p.y -= out; p.r = (p.r ?? 0) + inD; p.ry = Math.max(0, (p.ry ?? 0) - out); paid = cents / 100; this.fees += fee / 100;
    }
    tr.cash -= paid; tr.tok += out; tr.cost += paid; this.rec(tr, paid, true); return out;
  }
  sell(tr: Trader, qty: number): number {
    let q = Math.floor(Math.min(qty, tr.tok)); if (q <= 0) return 0; let net = 0;
    if (!this.pool) {
      if (this.y + q > PF.Y0) q = PF.Y0 - this.y; if (q <= 0) return 0;
      const gross = Math.floor((PF_K / this.y - PF_K / (this.y + q)) * 100) / 100; if (gross < 0.02) return 0;
      const fee = Math.ceil(gross * PF.CURVE_FEE * 100) / 100; net = gross - fee; this.fees += fee; this.y += q;
    } else {
      const p = this.pool, F = poolFee(this.price() * PF.SUPPLY / SOL_USD); let gross = p.x - (p.x * p.y) / (p.y + q); const realCash = p.r ?? 0;
      const x0 = p.x; let clip = false, taper = false;
      if (gross >= (NOCLIP ? 1 : 0.95) * realCash) { gross = (NOCLIP ? 1 : 0.95) * realCash; q = (p.y * gross) / (p.x - gross); clip = true; }
      const cents = Math.floor(gross * 100); if (cents < 2) return 0; const fee = Math.ceil(cents * F);
      p.x -= cents / 100; p.y += q; p.r = realCash - cents / 100; p.ry = (p.ry ?? 0) + q;
      const xMax = (p.d ?? 1) * (p.r ?? 0); if (!NOCLIP && p.x > xMax) { p.x = Math.max(p.r ?? 0, xMax); taper = true; }
      if (LOG) LOG({ t: this.t, side: 'S', kind: tr.kind, tok: q, usd: cents / 100, r: p.r, x: p.x, xBefore: x0, clip, taper });
      net = (cents - fee) / 100; this.fees += fee / 100;
    }
    tr.cost *= 1 - q / Math.max(q, tr.tok); tr.tok -= q; tr.cash += net; this.rec(tr, net, false); return net;
  }
  graduate() { // migrate: real raised cash less 0.015 SOL; 206.9M tokens; LP burnt -> pool fully real (d = 1)
    this.grad = this.t; const price = spot(this.y); const cash = PF_K / this.y - PF_X0 - PF.MIGRATE_SOL * SOL_USD;
    const y = PF.SUPPLY - PF.REAL_TOK; const x = price * y; const R = Math.min(cash, x); this.pool = { x, y, d: x / R, r: R, ry: y };
  }
}
