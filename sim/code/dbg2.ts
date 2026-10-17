import { runCoin } from './core'; import AH from './AH';
for (const s of [9009, 9007]) { const c = runCoin(AH, s, s === 9009 ? 'runner' : 'trender').c; const per = (a: number, b: number) => c.nTr.slice(a, b).reduce((x, y) => x + y, 0);
  console.log(s, [0, 12, 60, 120, 360, 720, 1440, 2880].map((t, i, A) => `${t}:${per(t, A[i + 1] ?? t + 720)}`).join(' '), 'px', [12, 60, 120, 360, 720, 1440].map(t => (c.px[t]! / c.px[0]!).toFixed(2)).join(',')); }
