import { runCoin } from './core'; import AH from './AH';
for (const [s, ty] of [[9009, 'runner'], [9010, 'runner'], [9007, 'trender'], [9008, 'trender'], [9003, 'quick']] as const) { const c = runCoin(AH, s, ty).c; const per = (a: number, b: number) => c.nTr.slice(a, b).reduce((x, y) => x + y, 0);
  console.log(s, ty, 'grad', c.grad, [0, 120, 360, 720, 1440, 2880].map((t, i, A) => `${t}:${per(t, A[i + 1] ?? t + 720)}`).join(' '), 'px', [120, 360, 720, 1440, 2880, 5000].map(t => (c.px[t]! / c.px[0]!).toFixed(1)).join(',')); }
