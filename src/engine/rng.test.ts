import { describe, expect, it } from 'vitest';
import { Rng, seedStream } from './rng';

const moments = (xs: number[]) => {
  const n = xs.length;
  const m = xs.reduce((a, b) => a + b, 0) / n;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / n;
  const k = xs.reduce((a, b) => a + (b - m) ** 4, 0) / n / (v * v);
  return { m, v, k };
};

describe('rng', () => {
  it('is deterministic per (seed, key)', () => {
    const a = new Rng(seedStream('s', 'asset:X'));
    const b = new Rng(seedStream('s', 'asset:X'));
    for (let i = 0; i < 1000; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('gives different streams for different keys and seeds', () => {
    expect(seedStream('s', 'asset:X')).not.toEqual(seedStream('s', 'asset:Y'));
    expect(seedStream('s', 'asset:X')).not.toEqual(seedStream('t', 'asset:X'));
  });

  it('resumes exactly from a saved state', () => {
    const a = new Rng(seedStream('s', 'k'));
    for (let i = 0; i < 37; i++) a.nextU32();
    const b = new Rng(a.state());
    for (let i = 0; i < 100; i++) expect(b.nextU32()).toBe(a.nextU32());
  });

  it('uniform stays inside (0, 1) with mean 1/2', () => {
    const r = new Rng(seedStream('s', 'u'));
    const xs = Array.from({ length: 100_000 }, () => r.uniform());
    expect(Math.min(...xs)).toBeGreaterThan(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    expect(moments(xs).m).toBeCloseTo(0.5, 2);
  });

  it('normal has mean 0, variance 1, kurtosis 3', () => {
    const r = new Rng(seedStream('s', 'n'));
    const { m, v, k } = moments(Array.from({ length: 200_000 }, () => r.normal()));
    expect(Math.abs(m)).toBeLessThan(0.01);
    expect(Math.abs(v - 1)).toBeLessThan(0.02);
    expect(Math.abs(k - 3)).toBeLessThan(0.1);
  });

  it('student-t(4) has unit variance and fat tails', () => {
    const r = new Rng(seedStream('s', 't'));
    const xs = Array.from({ length: 200_000 }, () => r.studentT(4));
    const { m, v } = moments(xs);
    expect(Math.abs(m)).toBeLessThan(0.01);
    expect(Math.abs(v - 1)).toBeLessThan(0.08);
    // tail mass beyond 4 sd is far above the normal's 0.006%
    const tail = xs.filter((x) => Math.abs(x) > 4).length / xs.length;
    expect(tail).toBeGreaterThan(0.001);
  });
});
