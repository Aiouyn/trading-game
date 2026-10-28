import { describe, expect, it } from 'vitest';
import { createParamsView } from '@tycoon/params';
import type { ParamsView } from '@tycoon/engine-core';
import { BLOC_ORDER } from '../schema';
import { genesisNominalGdp, launchDebtSplit, LAUNCH_DEBT_MIX } from './genesis';

const P: Record<string, number> = { macro_world_gdp_ref: 100e12, macro_scale_min: 0.2 };
const params = (): ParamsView => ({ ...createParamsView([]), num: (k) => { if (!(k in P)) throw new Error(`unknown param ${k}`); return P[k]!; } });
const p = params();

describe('T04-20 genesis nominal GDP', () => {
  it('S0 0.2: FDL 6.4e18 µ, PYN 3.2e19 µ, SRL 1.5e19 µ exactly; EUN, NKR within one major unit', () => {
    expect(genesisNominalGdp('FDL', 0.2, p)).toBe(6400000000000000000n);
    expect(genesisNominalGdp('PYN', 0.2, p)).toBe(32000000000000000000n);
    expect(genesisNominalGdp('SRL', 0.2, p)).toBe(15000000000000000000n);
    expect(Number(genesisNominalGdp('EUN', 0.2, p) - 4000000000000000000n)).toBeLessThanOrEqual(1000000);
    expect(Math.abs(Number(genesisNominalGdp('NKR', 0.2, p) - 14736842105263157895n))).toBeLessThanOrEqual(1000000);
  });
});

describe('AC-04-20-LAUNCHDEBT (E-97)', () => {
  it('S0 0.2 worked numbers', () => {
    const f = launchDebtSplit('FDL', 0.2, p), e = launchDebtSplit('EUN', 0.2, p), n = launchDebtSplit('NKR', 0.2, p), s = launchDebtSplit('SRL', 0.2, p);
    expect([f.residue, f.debt]).toEqual([0n, 6080000000000000000n]);
    expect([e.residue, e.debt]).toEqual([999999488n, 3519999999000000000n]);
    expect(e.units).toEqual({ B3M: 527999999n, N2Y: 703999999n, N5Y: 703999999n, N10Y: 880000004n, N30Y: 351999999n, L10Y: 351999999n });
    expect([n.residue, n.debt]).toEqual([105265152n, 5894736842000000000n]);
    expect([s.residue, s.debt, s.fdlUnits, s.fdlEq]).toEqual([0n, 10500000000000000000n, 630000000n, 3150000000000000000n]);
    expect(launchDebtSplit('PYN', 0.2, p).fdlUnits).toBe(0n);   // 0.05 FX share but no FDL launch line
    expect(launchDebtSplit('PYN', 0.2, p).fdlEq).toBe(0n);
  });
  it('S0 0.2 FDL and SRL lines (floors of U × pct / 100; remainder N10Y, SRL N2Y)', () => {
    expect(launchDebtSplit('FDL', 0.2, p).units).toEqual({ B3M: 912000000n, N2Y: 1216000000n, N5Y: 1216000000n, N10Y: 1520000000n, N30Y: 608000000n, L10Y: 608000000n });
    expect(launchDebtSplit('SRL', 0.2, p).units).toEqual({ B3M: 1470000000n, B1Y: 1470000000n, N2Y: 1837500000n, N5Y: 1470000000n, N10Y: 1102500000n });
    const x = launchDebtSplit('SRL', 0.2 + 1e-9, p), U = (x.debt - x.fdlEq) / 1000000000n;
    expect(x.units['N10Y']).toBe(U * 15n / 100n);   // only the remainder line (N2Y) absorbs the floors
    expect(x.units['N2Y']! >= U * 25n / 100n).toBe(true);
  });
  it('S0 1 worked numbers', () => {
    expect([launchDebtSplit('EUN', 1, p).residue, launchDebtSplit('EUN', 1, p).debt]).toEqual([0n, 17600000000000000000n]);
    expect([launchDebtSplit('NKR', 1, p).residue, launchDebtSplit('NKR', 1, p).debt]).toEqual([526318592n, 29473684210000000000n]);
    expect([launchDebtSplit('SRL', 1, p).fdlUnits, launchDebtSplit('SRL', 1, p).debt]).toEqual([3150000000n, 52500000000000000000n]);
  });
  it('Σ units × 1e9 + fdlEq = debt exactly, every bloc, both scales', () => {
    for (const S of [0.2, 1]) for (const b of BLOC_ORDER) {
      const x = launchDebtSplit(b, S, p);
      let sum = x.fdlEq;
      for (const k of Object.getOwnPropertyNames(x.units)) sum += x.units[k]! * 1000000000n;
      expect(sum).toBe(x.debt);
      expect(x.residue >= 0n && x.residue < 1000000000n).toBe(true);
    }
  });
});

describe('AC-04-20-LAUNCHKEYS (E-103 (5))', () => {
  const LOCAL = ['B3M', 'N2Y', 'N5Y', 'N10Y', 'N30Y', 'L10Y'];
  it('unit keys in LAUNCH_DEBT_MIX order equal the 22 §4.3 local tenors; all > 0n at S0 0.2 and 1; SRL fdlUnits > 0n', () => {
    for (const S of [0.2, 1]) for (const b of BLOC_ORDER) {
      const x = launchDebtSplit(b, S, p);
      const want = b === 'SRL' ? ['B3M', 'B1Y', 'N2Y', 'N5Y', 'N10Y'] : LOCAL;
      expect(Object.getOwnPropertyNames(x.units)).toEqual(want);
      expect(LAUNCH_DEBT_MIX[b].map(([k]) => k)).toEqual(want);
      for (const k of want) expect(x.units[k]! > 0n).toBe(true);
      if (b === 'SRL') expect(x.fdlUnits > 0n).toBe(true);
    }
  });
  it('no RNG: launchDebtSplit takes no ctx or stream, so any two world seeds give deep-equal results', () => {
    expect(launchDebtSplit.length).toBe(3);
    for (const b of BLOC_ORDER) expect(launchDebtSplit(b, 0.2, params())).toEqual(launchDebtSplit(b, 0.2, params()));
  });
});
