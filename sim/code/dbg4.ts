import { runCoin } from './core'; import AH from './AH'; import { Coin } from './core';
const oBuy = Coin.prototype.buy, oSell = Coin.prototype.sell; let log: string[] = [];
Coin.prototype.buy = function (tr, d) { const p0 = this.price(); const o = oBuy.call(this, tr, d); if (log.length < 400000) log.push(`${this.t} ${this.pool?'P':'C'} B ${tr.kind} $${d.toFixed(0)} ${(this.price() / p0 - 1).toFixed(3)}`); return o; };
Coin.prototype.sell = function (tr, q) { const p0 = this.price(); const o = oSell.call(this, tr, q); if (log.length < 400000) log.push(`${this.t} ${this.pool?'P':'C'} S ${tr.kind}${tr.firm ? '*' : ''} $${o.toFixed(0)} ${(this.price() / p0 - 1).toFixed(3)}`); return o; };
const r = runCoin(AH, 9009, 'runner'); const c = r.c; const p = c.pool!;
console.log('grad', c.grad, 'pool x', p.x.toFixed(0), 'y', (p.y / 1e6).toFixed(1), 'M real r', p.r!.toFixed(0), 'ry', (p.ry! / 1e6).toFixed(1), 'px at grad-1,grad,grad+1', c.px[c.grad - 1], c.px[c.grad], c.px[c.grad + 1]);
const big = log.filter(l => Math.abs(+l.split(' ').pop()!) > 0.1); console.log(log.length, 'pool trades;', big.length, '>10% moves'); const cnt: Record<string, number> = {}; for (const l of big) { const k = l.split(' ').slice(1, 4).join(' '); cnt[k] = (cnt[k] ?? 0) + 1; } console.log(cnt, big.slice(0, 12));
let mx = 0, at = 0; for (let t = 12; t < c.px.length; t++) { const d = c.px[t]! / c.px[t - 12]!; if (d < 1 && 1 - d > mx) { mx = 1 - d; at = t; } }
console.log('worst 1-min drop', mx.toFixed(2), 'at', at); const w = log.filter(l => { const t = +l.split(' ')[0]!; return t > at - 13 && t <= at; });
const agg: Record<string, [number, number]> = {}; for (const l of w) { const p = l.split(' '); const k = p[2] + ' ' + p[3]; const a = agg[k] ?? [0, 0]; a[0]++; a[1] += +p[4]!.slice(1); agg[k] = a; } console.log(agg);
