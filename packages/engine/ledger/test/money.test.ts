import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { allocate, divRoundHalfEven, MONEY_SCALE, mulRate, SortedMap, toMoney } from '../src';

describe('money (G3, Q-1, E1)', () => {
  it('MONEY_SCALE is 1_000_000n', () => expect(MONEY_SCALE).toBe(1_000_000n));
  it('toMoney rounds half-even at the .5-micro boundary (p10 launchpad centsOf port)', () => {
    expect(toMoney(0.0000005, 'FDL')).toBe(0n);
    expect(toMoney(0.0000015, 'FDL')).toBe(2n);
    expect(toMoney(0.0000025, 'FDL')).toBe(2n);
    expect(toMoney(-0.0000025, 'FDL')).toBe(-2n);
    expect(toMoney(0.0000035, 'FDL')).toBe(4n);
  });
  it('toMoney is exact at .5-cent boundaries and for exponent notation', () => {
    expect(toMoney(1.005, 'FDL')).toBe(1_005_000n);
    expect(toMoney(0.125, 'EUN')).toBe(125_000n);
    expect(toMoney(5000, 'FDL')).toBe(5_000_000_000n);
    expect(toMoney(1e21, 'FDL')).toBe(10n ** 27n);
    expect(toMoney(1.5e-7, 'FDL')).toBe(0n);
  });
  it('toMoney rejects NaN and Infinity', () => {
    expect(() => toMoney(NaN, 'FDL')).toThrow();
    expect(() => toMoney(Infinity, 'FDL')).toThrow();
  });
  it('divRoundHalfEven and mulRate (03 §8 edge 17: 0.1 dollar × 1e-6 -> 0n)', () => {
    expect(divRoundHalfEven(5n, 2n)).toBe(2n);
    expect(divRoundHalfEven(7n, 2n)).toBe(4n);
    expect(divRoundHalfEven(-5n, 2n)).toBe(-2n);
    expect(mulRate(100_000n, 1n)).toBe(0n);
    expect(mulRate(1_000_000_000n, 1_210_000n)).toBe(1_210_000_000n);
  });
  it('03#11 (corrected, PD-4): $1,000,000.000001 to 3 equal holders -> 334/334/333, exact', () => {
    const r = allocate(1_000_000_000_001n, new SortedMap([['chr_c', 1n], ['chr_a', 1n], ['chr_b', 1n]]));
    expect(r.entries()).toEqual([['chr_a', 333_333_333_334n], ['chr_b', 333_333_333_334n], ['chr_c', 333_333_333_333n]]);
    expect(r.values().reduce((s, x) => s + x, 0n)).toBe(1_000_000_000_001n);
  });
  it('allocate property (p10 payouts.ts:55-63 port, E4): exact sum, order-independent, each part within 1 of its share', () => {
    fc.assert(fc.property(
      fc.bigInt({ min: 0n, max: 10n ** 15n }),
      fc.uniqueArray(fc.tuple(fc.stringMatching(/^chr_[a-z]{1,4}$/), fc.bigInt({ min: 1n, max: 10n ** 6n })), { minLength: 1, maxLength: 12, selector: (t) => t[0] }),
      (total, ws) => {
        const a = allocate(total, new SortedMap(ws));
        const b = allocate(total, new SortedMap([...ws].reverse()));
        const W = ws.reduce((s, [, w]) => s + w, 0n);
        expect(a.values().reduce((s, x) => s + x, 0n)).toBe(total);
        expect(a.entries()).toEqual(b.entries());
        for (const [k, w] of ws) { const share = (total * w) / W; const got = a.get(k) as bigint; expect(got >= share && got <= share + 1n).toBe(true); }
      }));
  });
  it('launchpad fee via mulRate and allocate (p10 launchpad/state.ts:61-87 port): fee + split stay integer and exact', () => {
    const raise = toMoney(12_345.678901, 'FDL');
    const fee = mulRate(raise, 25_000n); // 2.5 %
    const split = allocate(fee, new SortedMap([['chr_a', 3n], ['chr_b', 1n]]));
    expect(fee).toBe(308_641_973n);
    expect(split.values().reduce((s, x) => s + x, 0n)).toBe(fee);
  });
});
