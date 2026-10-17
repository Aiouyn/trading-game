import { runCoin } from './core'; import B from './B';
for (const s of [9009, 9010, 9007]) { const r = runCoin(B, s, 'runner'); const c = r.c; const pk = c.px.indexOf(Math.max(...c.px));
  console.log(s, 'peak', (c.px[pk]!/c.px[0]!).toFixed(2), 'at', pk, 'trades/tick around peak', c.nTr.slice(pk-5,pk+5).join(','), 'buys', c.buys.slice(pk-5,pk+5).join(','), 'y', c.y); }
