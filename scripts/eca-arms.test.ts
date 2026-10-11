import { describe, expect, it } from 'vitest';
import { honestArmOf, honestDirection, pairedPlayerId, tipArmOf, tipGateRow, TIP_ARMS, TIP_PCT } from './eca-arms';

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
