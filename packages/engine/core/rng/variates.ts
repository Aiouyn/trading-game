// T02-06: the G6 Rng interface and fixed-draw variates (02 §3.10.5). Every variate consumes a fixed number of uint32 draws;
// no rejection sampling. beta/gamma are forbidden (not exported).
import { cmpStr } from '../order';
import { EngineFault } from '../types';
import { exp, ln, normInv } from '../dmath';

export interface Rng {
  next(): number; u53(): number; uOpen(): number; int(n: number): number; bernoulli(p: number): boolean;
  normal(): number; studentT(nu: number): number; exponential(lambda: number): number; poisson(lambda: number): number;
  kouJump(pUp: number, etaUp: number, etaDown: number): number;
  categorical<T extends string>(weights: readonly [T, number][]): T; shuffle<T>(a: T[]): T[];
}

export const DRAWS = Object.freeze({ u53: 2, uOpen: 2, int: 2, bernoulli: 2, normal: 2, exponential: 2, poisson: 2, kouJump: 4, categorical: 2 } as const);

const TWO53 = 9007199254740992;
const TWO26 = 67108864;
const TWO32 = 4294967296;
const POISSON_MAX_LAMBDA = 30, POISSON_CAP = 60;
const STUDENT_T_MAX_NU = 8;

export function makeRng(draw: () => number): Rng {
  const u53 = (): number => { const a = draw() >>> 5, b = draw() >>> 6; return (a * TWO26 + b) / TWO53; };
  const uOpen = (): number => (u53() * (TWO53 - 1) + 0.5) / TWO53;
  const int = (n: number): number => {
    if (!Number.isInteger(n) || n < 1 || n > TWO32) throw new EngineFault('I0.rng_int', `int(${n}): n must be an integer in 1..2^32`);
    return Math.floor(u53() * n);
  };
  const normal = (): number => normInv(uOpen());
  const exponential = (lambda: number): number => {
    if (!(lambda > 0) || lambda === Infinity) throw new EngineFault('I0.rng_exponential', `exponential(${lambda})`);
    return -ln(uOpen()) / lambda;
  };
  const rng: Rng = {
    next: () => draw(),
    u53, uOpen, int,
    bernoulli: (p) => u53() < p,
    normal,
    studentT: (nu) => {
      if (!Number.isInteger(nu) || nu < 1 || nu > STUDENT_T_MAX_NU) throw new EngineFault('I0.rng_student_t', `studentT(${nu}): nu integer 1..8`);
      const z = normal();
      let chi2 = 0;
      for (let k = 1; k <= nu; k++) { const g = normal(); chi2 += g * g; }
      return z / Math.sqrt(chi2 / nu);
    },
    exponential,
    poisson: (lambda) => {
      if (!(lambda >= 0 && lambda <= POISSON_MAX_LAMBDA)) throw new EngineFault('I0.rng_poisson', `poisson(${lambda}): lambda must be in [0, 30]`);
      const u = u53();
      let p = exp(-lambda), cum = p, k = 0;
      while (!(cum > u) && k < POISSON_CAP) { k++; p = p * lambda / k; cum += p; }
      return k;
    },
    kouJump: (pUp, etaUp, etaDown) => {
      const up = u53() < pUp;
      const size = exponential(up ? etaUp : etaDown);
      return up ? size : -size;
    },
    categorical: <T extends string>(weights: readonly [T, number][]): T => {
      if (weights.length === 0) throw new EngineFault('I0.rng_categorical', 'categorical: no weights');
      let total = 0;
      for (let i = 0; i < weights.length; i++) {
        const [k, w] = weights[i]!;
        if (i > 0 && cmpStr(weights[i - 1]![0], k) >= 0) throw new EngineFault('I0.rng_categorical', 'categorical: weights must be sorted by key (cmpStr), keys unique');
        if (!(w >= 0) || w === Infinity) throw new EngineFault('I0.rng_categorical', `categorical: weight ${w} for ${k}`);
        total += w;
      }
      if (!(total > 0)) throw new EngineFault('I0.rng_categorical', 'categorical: total weight 0');
      const u = u53();
      let cum = 0, last: T = weights[0]![0];
      for (const [k, w] of weights) {
        if (w === 0) continue;
        cum += w / total; last = k;
        if (u < cum) return k;
      }
      return last;   // u ≥ final cumulative (rounding below 1): the last positive-weight key
    },
    shuffle: <T>(a: T[]): T[] => {
      for (let i = a.length - 1; i >= 1; i--) { const j = int(i + 1); const t = a[i]!; a[i] = a[j]!; a[j] = t; }
      return a;
    },
  };
  return rng;
}
