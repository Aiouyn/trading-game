import { describe, expect, it } from 'vitest';
import { excessOverDrift, honestArmOf, honestDirection, pairedPlayerId, tipArmOf, tipGateRow, TIP_ARMS, TIP_PCT } from './eca-arms';

describe('6C arm pairing (R-6C-6)', () => {
  it('pairs each tip arm with the honest arm of the same size', () => {
    expect(TIP_ARMS.map(honestArmOf)).toEqual(['honest2', 'honest4', 'honest6']);
    expect(TIP_ARMS.map((t) => tipArmOf(honestArmOf(t)))).toEqual([...TIP_ARMS]);
    expect(TIP_PCT).toEqual({ tip2: 0.02, tip4: 0.04, tip6: 0.06 });
  });

  it('gives the honest twin the same player index, so the names and dates line up', () => {
    expect(pairedPlayerId('tip40', 'tip4')).toBe('honest40');
    expect(pairedPlayerId('tip27', 'tip2')).toBe('honest27');
    expect(pairedPlayerId('tip66', 'tip6')).toBe('honest66');
    expect(() => pairedPlayerId('tip40', 'tip2')).toThrow();
    expect(() => pairedPlayerId('honest40', 'tip4')).toThrow();
  });

  it('keeps the honest twin ids apart from the other arms', () => {
    const ids = new Set(['honest', 'honest2', 'honest4', 'honest6', 'tip2', 'tip4', 'tip6'].flatMap((k) =>
      Array.from({ length: 8 }, (_, i) => `${k}${i}`)));
    expect(ids.size).toBe(7 * 8);
  });

  it('takes the direction from the honest rule only', () => {
    expect(honestDirection(0.5)).toBe(1);
    expect(honestDirection(-0.5)).toBe(-1);
    expect(honestDirection(0.19)).toBe(0);
    expect(honestDirection(-0.2)).toBe(-1);
    expect(honestDirection(null)).toBe(0);
  });

  it('reads each tip gate against its own honest arm, not the 4% honest arm', () => {
    const perKind = {
      honest: { meanRet: 0.01, sdRet: 0.02 },
      honest2: { meanRet: 0.02, sdRet: 0.03 },
      honest4: { meanRet: 0.05, sdRet: 0.04 },
      honest6: { meanRet: 0.1, sdRet: 0.05 },
      tip2: { meanRet: 0.04, sdRet: 0.06 },
      tip4: { meanRet: 0.05, sdRet: 0.08 },
      tip6: { meanRet: 0.1, sdRet: 0.1 },
    };
    expect(tipGateRow('tip2', perKind)).toEqual({ honest: 'honest2', evRatio: 2, varRatio: 4 });
    expect(tipGateRow('tip4', perKind).evRatio).toBeCloseTo(1, 12);
    expect(tipGateRow('tip4', perKind).varRatio).toBeCloseTo(4, 12);
    expect(tipGateRow('tip6', perKind).evRatio).toBeCloseTo(1, 12);
    expect(tipGateRow('tip6', perKind).honest).toBe('honest6');
  });

  it('refuses a gate with a missing arm', () => {
    expect(() => tipGateRow('tip2', { tip2: { meanRet: 0, sdRet: 0 } })).toThrow();
  });
});

describe('the excess return over the drift (the blind rumor gate)', () => {
  it('a long-only follower in a rising market has no excess: the drift is the benchmark', () => {
    // 1000 bought, the stock up 5%: the raw return is 50 of 20,000, and the long benchmark is the same 50
    expect(excessOverDrift(50 / 20_000, 20_000, [{ side: 1, notional: 1000, ret: 0.05 }])).toBeCloseTo(0, 12);
  });

  it('a follower who is always wrong (short in a rising stock) is not rescued by the drift: its excess is the loss', () => {
    // short 1000 of a stock up 5%: the raw return is -50 of 20,000; the benchmark is the short's own exposure (ebar -1 times +50)
    expect(excessOverDrift(-50 / 20_000, 20_000, [{ side: -1, notional: 1000, ret: 0.05 }])).toBeCloseTo(0, 12);
  });

  it('a coin-flip follower has zero expected excess whatever the drift: the side mix cancels the benchmark', () => {
    // a long and a short of equal size in a stock up 5%: raw 0, ebar 0, excess 0
    expect(excessOverDrift(0, 20_000, [{ side: 1, notional: 1000, ret: 0.05 }, { side: -1, notional: 1000, ret: 0.05 }])).toBeCloseTo(0, 12);
  });

  it('a follower with real edge keeps it: a short that beats a falling stock shows positive excess over its own exposure', () => {
    // a pure short in a falling stock: the raw +50 is all benchmark (ebar -1), so no excess
    const pureShort = excessOverDrift(50 / 20_000, 20_000, [{ side: -1, notional: 1000, ret: -0.05 }]);
    expect(pureShort).toBeCloseTo(0, 12);
    // long 1000 in a stock up 10% and short 1000 in a stock down 5%: raw +50; ebar 0, so the whole +50 is excess
    const mixed = excessOverDrift(50 / 20_000, 20_000, [{ side: 1, notional: 1000, ret: 0.1 }, { side: -1, notional: 1000, ret: -0.05 }]);
    expect(mixed).toBeCloseTo(50 / 20_000, 12);
  });

  it('fees stay in the excess: a round trip that loses to fees with no drift is negative', () => {
    // a raw -0.25% of nw0 with the stock flat: nothing is benchmark, so the excess is the fee loss
    expect(excessOverDrift(-0.0025, 20_000, [{ side: 1, notional: 1000, ret: 0 }])).toBeCloseTo(-0.0025, 12);
  });

  it('a trader with no fills has its raw return as the excess', () => {
    expect(excessOverDrift(0.01, 20_000, [])).toBe(0.01);
  });
});
