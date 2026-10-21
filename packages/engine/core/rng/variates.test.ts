// T02-06: fixed draw counts (02#19), DRAWS table, ranges, worked examples, variate faults.
import { describe, expect, it } from 'vitest';
import { EngineFault } from '../types';
import { exp, normInv } from '../dmath';
import { DRAWS, makeRng, xoNext } from './index';
import type { Rng } from './index';

const thrown = (f: () => unknown): string | null => { try { f(); return null; } catch (e) { return e instanceof EngineFault ? e.code : `non-fault ${String(e)}`; } };
/** An Rng over xoshiro with a draw counter. */
function counted(seed = 1): { rng: Rng; n: () => number } {
  const s = Uint32Array.from([seed, 2, 3, 4]); let n = 0;
  return { rng: makeRng(() => { n++; return xoNext(s); }), n: () => n };
}
/** An Rng that returns the given uint32 sequence. */
const scripted = (xs: number[]): Rng => { let i = 0; return makeRng(() => xs[i++]!); };
const count = (f: (r: Rng) => unknown, seed = 1): number => { const c = counted(seed); f(c.rng); return c.n(); };

describe('02#19 studentT(4) consumes exactly 10 uint32 draws per call; poisson(λ) consumes exactly 2 for any λ ≤ 30', () => {
  it('studentT(4) = 10 draws, over 200 calls', () => { for (let s = 1; s <= 200; s++) expect(count((r) => r.studentT(4), s)).toBe(10); });
  it('studentT(nu) = 2(nu+1) for nu = 1..8', () => { for (let nu = 1; nu <= 8; nu++) expect(count((r) => r.studentT(nu))).toBe(2 * (nu + 1)); });
  it('poisson(λ) = 2 draws for λ in {0.001, 1, 7.5, 30}, over 200 calls each', () => {
    for (const l of [0.001, 1, 7.5, 30]) for (let s = 1; s <= 200; s++) expect(count((r) => r.poisson(l), s)).toBe(2);
  });
});

describe('T02-06 DRAWS and variates', () => {
  it('draw counts for every variate equal DRAWS (shuffle of 10 = 18)', () => {
    expect(DRAWS).toEqual({ u53: 2, uOpen: 2, int: 2, bernoulli: 2, normal: 2, exponential: 2, poisson: 2, kouJump: 4, categorical: 2 });
    const cases: Record<keyof typeof DRAWS, (r: Rng) => unknown> = {
      u53: (r) => r.u53(), uOpen: (r) => r.uOpen(), int: (r) => r.int(7), bernoulli: (r) => r.bernoulli(0.3), normal: (r) => r.normal(),
      exponential: (r) => r.exponential(2), poisson: (r) => r.poisson(3), kouJump: (r) => r.kouJump(0.4, 10, 5),
      categorical: (r) => r.categorical([['a', 1], ['b', 2], ['c', 3]]),
    };
    for (let s = 1; s <= 50; s++) for (const k of Object.keys(cases) as (keyof typeof DRAWS)[]) expect(count(cases[k], s)).toBe(DRAWS[k]);
    expect(count((r) => r.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]))).toBe(18);
    expect(count((r) => r.next())).toBe(1);
  });
  it('property: u53 in [0,1); uOpen in (0,1); int(n) in [0,n)', () => {
    const { rng } = counted(9);
    for (let i = 0; i < 20000; i++) {
      const u = rng.u53(); expect(u >= 0 && u < 1).toBe(true);
      const o = rng.uOpen(); expect(o > 0 && o < 1).toBe(true);
      const n = 1 + (i % 97), k = rng.int(n); expect(Number.isInteger(k) && k >= 0 && k < n).toBe(true);
    }
    expect(scripted([0xffffffff, 0xffffffff]).uOpen()).toBeLessThan(1);
    expect(scripted([0xffffffff, 0xffffffff]).int(4294967296)).toBe(4294967295);
  });
  it('worked examples: uOpen(0,0) = 0.5/2^53 = 5.551115123125783e-17; u53(0xFFFFFFFF, 0xFFFFFFFF) = 0.9999999999999999', () => {
    expect(scripted([0, 0]).uOpen()).toBe(5.551115123125783e-17);
    expect(scripted([0xffffffff, 0xffffffff]).u53()).toBe((134217727 * 67108864 + 67108863) / 2 ** 53);
    expect(scripted([0xffffffff, 0xffffffff]).u53()).toBe(0.9999999999999999);
    expect(scripted([0x80000000, 0]).u53()).toBe(0.5);   // a = next()>>>5, b = next()>>>6
    expect(scripted([0, 0x80000000]).u53()).toBe(2 ** 25 / 2 ** 53);
  });
  it('normal = normInv(uOpen()); exponential = −ln(uOpen())/λ; studentT formula; kouJump sign and size', () => {
    expect(scripted([0x80000000, 0]).normal()).toBe(normInv((0.5 * (2 ** 53 - 1) + 0.5) / 2 ** 53));
    expect(scripted([0, 0]).normal()).toBe(normInv(5.551115123125783e-17));   // uOpen(0,0), never u53 = 0
    const a = counted(3), b = counted(3);
    const z = b.rng.normal(); let chi = 0; for (let k = 0; k < 4; k++) { const g = b.rng.normal(); chi += g * g; }
    expect(a.rng.studentT(4)).toBe(z / Math.sqrt(chi / 4));
    expect(scripted([0, 0, 0x80000000, 0]).kouJump(0.5, 2, 4)).toBeGreaterThan(0);          // u53 = 0 < 0.5: up, size by etaUp
    const up = scripted([0, 0, 0x80000000, 0]).kouJump(0.5, 2, 4), down = scripted([0xffffffff, 0xffffffff, 0x80000000, 0]).kouJump(0.5, 2, 4);
    const e1 = scripted([0x80000000, 0]).exponential(1);
    expect(up).toBe(e1 / 2); expect(down).toBe(-e1 / 4);
  });
  it('poisson: inverse CDF from k = 0, first k with cumulative > u, capped at 60', () => {
    expect(scripted([0, 0]).poisson(7.5)).toBe(0);                         // u = 0 < p0
    expect(scripted([0xffffffff, 0xffffffff]).poisson(30)).toBe(60);       // u ≈ 1: walks to the cap
    expect(scripted([0x80000000, 0]).poisson(1)).toBe(1);                  // u = 0.5: p0 = 0.3679, p0+p1 = 0.7358
    expect(scripted([0x80000000, 0]).poisson(0)).toBe(0);
    expect(exp(-Math.LN2)).toBe(0.5);
    expect(scripted([0x80000000, 0]).poisson(Math.LN2)).toBe(1);           // u = 0.5 = p0 exactly: cumulative must be strictly > u
    for (const l of [30.000001, -1, NaN]) expect(thrown(() => scripted([0, 0]).poisson(l))).toBe('I0.rng_poisson');
  });
  it('categorical: sorted by key (cmpStr) required; one u53 against cumulative normalised weights; zero weights skipped', () => {
    const w: [string, number][] = [['a', 1], ['b', 0], ['c', 3]];
    expect(scripted([0, 0]).categorical(w)).toBe('a');
    expect(scripted([0x40000000, 0]).categorical(w)).toBe('c');            // u = 0.25 → cumulative a = 0.25, not < → c
    expect(scripted([0x3fffffff, 0xffffffff]).categorical(w)).toBe('a');
    expect(scripted([0xffffffff, 0xffffffff]).categorical(w)).toBe('c');
    expect(thrown(() => scripted([0, 0]).categorical([['b', 1], ['a', 1]]))).toBe('I0.rng_categorical');
    expect(thrown(() => scripted([0, 0]).categorical([['a', 1], ['a', 1]]))).toBe('I0.rng_categorical');
    expect(thrown(() => scripted([0, 0]).categorical([['a', -1]]))).toBe('I0.rng_categorical');
    expect(thrown(() => scripted([0, 0]).categorical([['a', 0]]))).toBe('I0.rng_categorical');
    expect(thrown(() => scripted([0, 0]).categorical([]))).toBe('I0.rng_categorical');
  });
  it('shuffle: Fisher–Yates from the end with j = int(i+1), in place, returns the array', () => {
    const xs = [0, 1, 2, 3, 4], seq = [0, 0, 0xffffffff, 0xffffffff, 0x80000000, 0, 0, 0];   // i=4: j=0 → [4,1,2,3,0]; i=3: j=3; i=2: j=1 → [4,2,1,3,0]; i=1: j=0 → [2,4,1,3,0]
    const out = scripted(seq).shuffle(xs);
    expect(out).toBe(xs); expect(xs).toEqual([2, 4, 1, 3, 0]);
    const c = counted(5), big = Array.from({ length: 100 }, (_, i) => i); c.rng.shuffle(big);
    expect([...big].sort((a, b) => a - b)).toEqual(Array.from({ length: 100 }, (_, i) => i)); expect(c.n()).toBe(198);
  });
  it('faults: int(n) outside integer 1..2^32; studentT nu outside 1..8; exponential λ ≤ 0', () => {
    for (const n of [0, -1, 1.5, 2 ** 32 + 1, NaN]) expect(thrown(() => scripted([0, 0]).int(n))).toBe('I0.rng_int');
    for (const nu of [0, 9, 2.5]) expect(thrown(() => counted().rng.studentT(nu))).toBe('I0.rng_student_t');
    for (const l of [0, -1, Infinity]) expect(thrown(() => scripted([0, 0]).exponential(l))).toBe('I0.rng_exponential');
  });
  it('beta and gamma are not exported (forbidden)', () => {
    const r = counted().rng as unknown as Record<string, unknown>;
    expect(r.beta).toBeUndefined(); expect(r.gamma).toBeUndefined();
  });
});
