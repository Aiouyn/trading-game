import { describe, expect, expectTypeOf, it } from 'vitest';
import { createParamsView } from '@tycoon/params';
import type { Money, ParamsView, StoreRead } from '@tycoon/engine-core';
import { LEDGER_EVENTS, type MoneySupplyReport } from '@tycoon/engine-ledger';
import { BLOC_ORDER, type BlocId } from '../schema';
import { cityActivity, cityNominalGdp, islaSerenaIndex, nominalGdpLocal, npcToPlayerWealthRatio, scaleTarget, stepScale, worldNominalGdpFdl } from './scale';
import * as scale from './scale';
import { buildDailyReport, computeNa, pewFromReport, type ControllerStep, type StabSampleMsg } from './ledgerStubs';


const T0404_DEFAULTS: Readonly<Record<string, number>> = Object.freeze({
  macro_scale_ref_players: 5000, macro_scale_min: 0.2, macro_scale_max: 400, macro_world_gdp_ref: 100e12,
  macro_policy_lag_days: 120, macro_gap_halflife_years: 0.30, macro_gap_vol: 0.008, macro_ai_productivity_max: 0.005,
  macro_xreg_exp: 0.005, macro_xreg_ovh: 0.025, macro_xreg_con: -0.04, macro_xreg_rec: -0.01,
  macro_x_a_r: 0.5, macro_x_m: 0.8, macro_x_a_c: 0.012, macro_x_a_e: 0.4, macro_x_a_q: 0.10, macro_x_a_o: 0.03, macro_x_a_f: 0.010,
  macro_x_a_w: 0.05, macro_x_a_h: 0.08, macro_x_a_t: 0.2, macro_x_a_k: 0.010,
});

function testParams(over: Record<string, number> = {}, reads: string[] = []): ParamsView {
  const m: Record<string, number> = { ...T0404_DEFAULTS, ...over };
  return { ...createParamsView([]), num: (k) => { reads.push(k); if (!(k in m)) throw new Error(`unknown param ${k}`); return m[k]!; } };
}

const p = testParams();
const LV = { L1_demand: 1, L2_lifestyle_price: 1, L3_levy_bp: 0, L4_upkeep: 1 };
const per = <T,>(f: (b: BlocId) => T): Record<BlocId, T> => ({ FDL: f('FDL'), EUN: f('EUN'), PYN: f('PYN'), NKR: f('NKR'), SRL: f('SRL') });

describe('T04-04 scale.ts exports', () => {
  it('exports exactly the card list', () => {
    expect(Object.keys(scale).sort()).toEqual(['cityActivity', 'cityNominalGdp', 'islaSerenaIndex', 'nominalGdpLocal', 'npcToPlayerWealthRatio',
      'scaleTarget', 'stepScale', 'worldNominalGdpFdl']);
  });
});

describe('§3.2 world scale (edge 17)', () => {
  it('S 1, target 2 → 1.005; S 1, target 0.1 → 0.995', () => {
    expect(stepScale(1, 2)).toBe(1.005);
    expect(stepScale(1, 0.1)).toBe(0.995);
    expect(stepScale(1, 1.002)).toBe(1.002);
    expect(stepScale(10, 9.99)).toBe(9.99);
  });
  it('scaleTarget = clamp(N_a / 5000, 0.2, 400), read through ctx.params', () => {
    const reads: string[] = [];
    expect(scaleTarget(10_000, testParams({}, reads))).toBe(2);
    expect(reads.sort()).toEqual(['macro_scale_max', 'macro_scale_min', 'macro_scale_ref_players']);
    expect(scaleTarget(0, p)).toBe(0.2);
    expect(scaleTarget(500, p)).toBe(0.2);
    expect(scaleTarget(5_000 * 1000, p)).toBe(400);
    expect(scaleTarget(2_500, p)).toBe(0.5);
    expect(scaleTarget(10_000, testParams({ macro_scale_ref_players: 1000 }))).toBe(10);
    expect(scaleTarget(1, testParams({ macro_scale_ref_players: 0 }))).toBe(0.2);
  });
  it('repeated shrink with no players floors at 0.2 and never jumps more than 0.5%/day', () => {
    let S = 1;
    for (let d = 0; d < 2000; d++) {
      const next = stepScale(S, scaleTarget(0, p));
      expect(next).toBeGreaterThanOrEqual(S * 0.995 - 1e-15);
      S = next;
    }
    expect(S).toBe(0.2);
    expect(stepScale(0.2, scaleTarget(0, p))).toBe(0.2);
  });
});

describe('§3.2 bloc and world nominal GDP', () => {
  it('FDL at S 1, indices 100 → 32,000,000,000,000 FDL = 32e18 micro; EUN → 20e12 EUN', () => {
    expect(nominalGdpLocal('FDL', 1, 100, 100, p)).toBe(32_000_000_000_000_000_000n);
    expect(nominalGdpLocal('EUN', 1, 100, 100, p)).toBe(20_000_000_000_000_000_000n);
    expect(nominalGdpLocal('PYN', 1, 100, 100, p)).toBe(160_000_000_000_000_000_000n);
    expect(nominalGdpLocal('SRL', 1, 100, 100, p)).toBe(75_000_000_000_000_000_000n);
  });
  it('scales with S, the real index, the CPI level and macro_world_gdp_ref', () => {
    expect(nominalGdpLocal('FDL', 0.2, 100, 100, p)).toBe(6_400_000_000_000_000_000n);
    expect(nominalGdpLocal('FDL', 1, 110, 100, p)).toBe(35_200_000_000_000_000_000n);
    expect(nominalGdpLocal('FDL', 1, 100, 105, p)).toBe(33_600_000_000_000_000_000n);
    expect(nominalGdpLocal('FDL', 1, 100, 100, testParams({ macro_world_gdp_ref: 50e12 }))).toBe(16_000_000_000_000_000_000n);
  });
  it('world nominal GDP in FDL = Σ toMoney(fromMoney(g)·spot)', () => {
    const gdp = per((b) => nominalGdpLocal(b, 1, 100, 100, p));
    const fx0 = { FDL: 1.0, EUN: 1.1, PYN: 0.15, NKR: 0.095, SRL: 0.20 } as Record<BlocId, number>;
    // At genesis FX each bloc converts back to its share of 100e12 FDL.
    const w = worldNominalGdpFdl(gdp, fx0);
    expect(Number(w) / 1e6).toBeCloseTo(100e12, -2);
    const spot1 = per((b) => (b === 'FDL' ? 1 : 0));
    expect(worldNominalGdpFdl(gdp, spot1)).toBe(gdp.FDL);
    const spot2 = per((b) => (b === 'EUN' ? 2 : 0));
    expect(worldNominalGdpFdl(gdp, spot2)).toBe(40_000_000_000_000_000_000n);
    expect(BLOC_ORDER.length).toBe(5);
  });
});

describe('§3.2 city activity and Isla Serena', () => {
  it('share 0.4, β 1.8, x 0.02 → 0.4144', () => {
    expect(cityActivity(0.4, 1.8, 0.02)).toBeCloseTo(0.4144, 15);
    expect(cityActivity(0.4, 1.8, 0)).toBe(0.4);
    expect(cityActivity(0.4, 0.6, -0.05)).toBeCloseTo(0.388, 15);
  });
  it('cityNominalGdp = nominalGdp_b × activity in the bloc currency', () => {
    expect(cityNominalGdp(32_000_000_000_000_000_000n, 0.25, 'FDL')).toBe(8_000_000_000_000_000_000n);
    expect(cityNominalGdp(20_000_000_000_000_000_000n, 0.5, 'EUN')).toBe(10_000_000_000_000_000_000n);
  });
  it('islaSerenaIndex = 0.5·x_FDL + 0.5·growth; growth missing → 0', () => {
    expect(islaSerenaIndex(0.02, 0.1)).toBeCloseTo(0.06, 15);
    expect(islaSerenaIndex(0.02, null)).toBe(0.01);
    expect(islaSerenaIndex(0, -0.04)).toBe(-0.02);
  });
});

describe('§3.2 step 7 monitor and AC-04-04-PEW-BIGINT (E-88 (5))', () => {
  const report = (pew: string): MoneySupplyReport => LEDGER_EVENTS['stab.daily.report'].parse({
    dayIndex: 1, byCcy: { FDL: { M0: '1', M0_sys: '0', M2: '1' } }, pem: '0', pew, na: 1, e: 0, u: 0,
    levers: LV, leverChange: LV, familiesDay: {}, familiesYear: {}, rho: 1, msi: 1, mode: 'OBSERVE' });
  it('a 20-digit pew round-trips through BigInt without loss', () => {
    const s = '12345678901234567891';
    const m: Money = pewFromReport(report(s));
    expectTypeOf(m).toEqualTypeOf<bigint>();
    expect(m).toBe(12345678901234567891n);
    expect(m.toString()).toBe(s);
    expect(BigInt(Number(s)).toString()).not.toBe(s);   // the Number path would lose digits
    expect(pewFromReport(report('-98765432109876543210')).toString()).toBe('-98765432109876543210');
    expect(pewFromReport(report('007'))).toBe(7n);
  });
  it('rejects a non-integer pew string', () => {
    expect(() => pewFromReport({ pew: '1.5' })).toThrow(/decimal/);
    let code: unknown = null;
    try { pewFromReport({ pew: '1e3' }); } catch (e) { code = (e as { code?: unknown }).code; }
    expect(code).toBe('I0.macro_pew');
    expect(() => pewFromReport({ pew: '' })).toThrow(/decimal/);
    expect(() => pewFromReport({ pew: '1e21' })).toThrow(/decimal/);
  });
  it('ratio = worldNominalGdpFdl / PEW, PEW 0 → 0', () => {
    const world = 100_000_000_000_000_000_000n;            // 100e12 FDL
    expect(npcToPlayerWealthRatio(world, pewFromReport(report('2000000000000000000')))).toBe(50);   // 2e12 FDL of player wealth
    expect(npcToPlayerWealthRatio(world, 0n)).toBe(0);
    expect(npcToPlayerWealthRatio(0n, 5n)).toBe(0);
  });
  it('typed stubs carry the E-88 (5) signatures and throw until T03-11 / T03-24 land', () => {
    expectTypeOf(computeNa).toEqualTypeOf<(read: StoreRead, tick: number) => number>();
    expectTypeOf(buildDailyReport).toEqualTypeOf<(read: StoreRead, step: ControllerStep | undefined, samples: readonly StabSampleMsg[]) => MoneySupplyReport>();
    const read = {} as StoreRead;
    expect(() => computeNa(read, 0)).toThrow(/T03-11/);
    expect(() => buildDailyReport(read, undefined, [])).toThrow(/T03-24/);
  });
});
