// T04-05 credit and inputs tests: 04#43 (no-07 fallback), supplied-credit gap, §3.14.5 inputs with last-value hold (edge 23).
import { describe, expect, it } from 'vitest';
import { dmath, type StoreRead } from '@tycoon/engine-core';
import { defaultMacroPorts, type MacroPorts } from '../ports';
import { BLOC_ORDER, type MacroInputs, type Regime } from '../schema';
import { creditAggregates, fallbackCreditConditions, type CreditStateIn } from './credit';
import { collectInputs, energyIndex, foodIndex } from './inputs';

const ALPHA = 1 - dmath.pow(2, -1 / 1092);
const store = { get: () => undefined, iter: () => [], range: () => [], index: () => [], count: () => 0 } as unknown as StoreRead;
const EMPTY: MacroInputs = { id: 'INPUTS', tick: 0, staleKeys: [], values: {} };
const finite = (...xs: number[]): boolean => xs.every((x) => Number.isFinite(x));

describe('T04-05 credit aggregates (04 §3.14.4)', () => {
  it('04#43 disabling 07 leaves the macro step runnable with credit inputs from §3.14.4', () => {
    const ports = defaultMacroPorts();
    expect(ports.credit).toBeNull();
    const g = 0.045 / 364;                         // nominal GDP log growth per day
    let gdp = 1_000; let st: CreditStateIn = { credit: 1.0 * gdp, creditGdpTrend: 1.0, credit364: null, credit0: 1.0 * gdp, days: 1 };   // genesis: credit = 1.0 × GDP, trend = creditGdp
    const credits: number[] = [st.credit];
    for (let d = 1; d <= 400; d++) {
      gdp *= dmath.exp(g);
      const supplied = ports.credit?.creditAggregates(store, 'FDL') ?? null;
      const out = creditAggregates(gdp, st, supplied, { Rtilde: 0.005, regime: 'EXPANSION', nominalGdpGrowthLn: g });
      expect(out.creditConditions).toBeCloseTo(-0.180797, 6);
      expect(out.creditConditions).toBe(0.5 * dmath.tanh(-1) + 0.2);
      expect(out.interbankSpread).toBeNull();
      expect(finite(out.credit, out.creditGdp, out.trend, out.creditGap, out.creditGrowth)).toBe(true);
      expect(out.credit / st.credit).toBeCloseTo(dmath.exp(g * (1 - 0.0904)), 6);
      expect(out.creditGap).toBeCloseTo(out.creditGdp - out.trend, 15);
      // yoy = nominal yoy × (1 − 0.0904); before day 364 annualized from genesis (E-87 (3)), the same rate on this path
      expect(out.creditGrowth).toBeCloseTo(364 * g * (1 + 0.5 * out.creditConditions), 12);
      credits.push(out.credit);
      st = { credit: out.credit, creditGdpTrend: out.trend, credit364: d + 1 >= 364 ? credits[d + 1 - 364]! : null, credit0: 1_000, days: d + 1 };
    }
    expect(st.credit / 1_000).toBeCloseTo(dmath.exp(400 * g * (1 - 0.0904)), 6);
  });

  it('04#43 stub of the macro day step (inputs → credit → regime z inputs) runs 30 game days on defaultMacroPorts', () => {
    const ports = defaultMacroPorts(); let prev = EMPTY; let gdp = 500;
    let st: CreditStateIn = { credit: gdp, creditGdpTrend: 1, credit364: null, credit0: gdp, days: 1 };
    for (let d = 1; d <= 30; d++) {
      const { inputs } = collectInputs(store, ports, prev, d * 720 - 1); prev = inputs;
      gdp *= dmath.exp(0.03 / 364);
      const out = creditAggregates(gdp, st, ports.credit?.creditAggregates(store, 'EUN') ?? null, { Rtilde: -0.002, regime: 'RECOVERY', nominalGdpGrowthLn: 0.03 / 364 });
      expect(finite(out.creditGap, out.creditGrowth, out.creditConditions, inputs.values.energy!, inputs.values.aiRaceIndex!)).toBe(true);
      st = { credit: out.credit, creditGdpTrend: out.trend, credit364: null, credit0: 500, days: d + 1 };
    }
  });

  it('supplied credit 1.1 × GDP for 1 day after trend 1.0: gap = 1.1 − (1.0 + 0.1·(1 − 2^(−1/1092)))', () => {
    // days = 1 (E-90 (3): at days = 0 credit holds, so the supplied 110 would not be taken)
    const out = creditAggregates(100, { credit: 100, creditGdpTrend: 1.0, credit364: null, credit0: 100, days: 1 }, { credit: 110, creditConditions: 0.25, interbankSpread: 0.004 },
      { Rtilde: 0.05, regime: 'CONTRACTION', nominalGdpGrowthLn: 0.5 });
    expect(out.creditGdp).toBeCloseTo(1.1, 15);
    expect(out.trend).toBeCloseTo(1.0 + 0.1 * ALPHA, 15);
    expect(out.creditGap).toBeCloseTo(1.1 - (1.0 + 0.1 * (1 - dmath.pow(2, -1 / 1092))), 15);
    expect(out.creditGap).toBeCloseTo(0.1 * (1 - 0.000635), 6);
    expect(out).toMatchObject({ credit: 110, creditConditions: 0.25, interbankSpread: 0.004 });
    expect(out.creditGrowth).toBeCloseTo(dmath.ln(1.1) * 364, 12);
    expect(creditAggregates(100, { credit: 100, creditGdpTrend: 1.0, credit364: 100, credit0: 50, days: 364 }, { credit: 110, creditConditions: 0, interbankSpread: 0 },
      { Rtilde: 0, regime: 'EXPANSION', nominalGdpGrowthLn: 0 }).creditGrowth).toBeCloseTo(dmath.ln(1.1), 15);
  });

  it('E-90 (3) day-0 close: credit holds at prev.credit on the supplied and the fallback path; the rest is computed as usual', () => {
    const prev: CreditStateIn = { credit: 100, creditGdpTrend: 1.0, credit364: null, credit0: 100, days: 0 };
    const sup = creditAggregates(80, prev, { credit: 110, creditConditions: 0.25, interbankSpread: 0.004 }, { Rtilde: 0.05, regime: 'CONTRACTION', nominalGdpGrowthLn: 0.5 });
    expect(sup).toEqual({ credit: 100, creditGdp: 1.25, trend: 1.0 + 0.25 * ALPHA, creditGap: 1.25 - (1.0 + 0.25 * ALPHA), creditGrowth: 0, creditConditions: 0.25, interbankSpread: 0.004 });
    const fb = creditAggregates(80, prev, null, { Rtilde: 0.0025, regime: 'EXPANSION', nominalGdpGrowthLn: 0.5 });
    expect(fb).toEqual({ credit: 100, creditGdp: 1.25, trend: 1.0 + 0.25 * ALPHA, creditGap: 1.25 - (1.0 + 0.25 * ALPHA), creditGrowth: 0,
      creditConditions: fallbackCreditConditions(0.0025, 'EXPANSION'), interbankSpread: null });
    // day 1 moves credit on both paths
    expect(creditAggregates(80, { ...prev, days: 1 }, { credit: 110, creditConditions: 0, interbankSpread: 0 }, { Rtilde: 0, regime: 'EXPANSION', nominalGdpGrowthLn: 0.5 }).credit).toBe(110);
    expect(creditAggregates(80, { ...prev, days: 1 }, null, { Rtilde: 0, regime: 'RECOVERY', nominalGdpGrowthLn: 0.5 }).credit).toBe(100 * dmath.exp(0.5));
  });

  it('AC E-90-4 (unit level): credit = credit0·e^(0.0001·d) → creditGrowth 0.0364 ± 1e−12 at days 182, 364 (both branches), 500 (row 136)', () => {
    const c0 = 6.4e12; const fb = { Rtilde: 0, regime: 'EXPANSION' as Regime, nominalGdpGrowthLn: 0 };
    const rows: number[] = [];   // rows[d] = closing credit of day d (history row credit)
    let st: CreditStateIn = { credit: c0, creditGdpTrend: 1, credit364: null, credit0: c0, days: 0 };
    const growth: number[] = [];
    for (let d = 0; d <= 500; d++) {
      st = { ...st, credit364: d >= 364 ? rows[d - 364]! : null, days: d };
      const out = creditAggregates(c0, st, { credit: c0 * dmath.exp(0.0001 * d), creditConditions: 0, interbankSpread: 0 }, fb);
      rows.push(out.credit); growth.push(out.creditGrowth);
      st = { ...st, credit: out.credit, creditGdpTrend: out.trend };
    }
    expect(rows[0]).toBe(c0);   // E-90 (3): row(0).credit === credit0
    expect(growth[0]).toBe(0);
    for (const d of [182, 364, 500]) expect(Math.abs(growth[d]! - 0.0364)).toBeLessThanOrEqual(1e-12);
    const c0Branch = creditAggregates(c0, { credit: rows[363]!, creditGdpTrend: 1, credit364: null, credit0: c0, days: 364 },
      { credit: c0 * dmath.exp(0.0364), creditConditions: 0, interbankSpread: 0 }, fb).creditGrowth;   // production fallback at the same day
    expect(Math.abs(growth[364]! - c0Branch)).toBeLessThanOrEqual(1e-12);
    expect(growth[500]).toBe(dmath.ln(rows[500]! / rows[136]!));
  });

  it('E-87 (3) creditGrowth: 0 at day 0, ln(credit/credit0)·364/days before day 364, ln(credit/credit364) from day 364', () => {
    const c0 = 1_000; const sup = (credit: number) => ({ credit, creditConditions: 0, interbankSpread: 0 });
    const fb = { Rtilde: 0, regime: 'EXPANSION' as Regime, nominalGdpGrowthLn: 0 };
    const g = (credit: number, days: number, credit364: number | null = null) => creditAggregates(1_000, { credit: c0, creditGdpTrend: 1, credit364, credit0: c0, days }, sup(credit), fb).creditGrowth;
    expect(Math.abs(g(c0 * dmath.exp(0.01), 182) - 0.02)).toBeLessThanOrEqual(1e-12);   // AC E87-3
    expect(g(c0 * dmath.exp(0.01), 0)).toBe(0);
    expect(g(c0 * dmath.exp(0.01), 1)).toBeCloseTo(3.64, 12);
    expect(g(c0 * dmath.exp(0.01), 363)).toBeCloseTo(0.01 * 364 / 363, 14);
    const c364 = c0 * dmath.exp(0.004);   // AC E87-3b: from day 364 the base is credit_364, not credit0
    expect(g(c0 * dmath.exp(0.01), 364, c364)).toBeCloseTo(0.006, 14);
    expect(g(c0 * dmath.exp(0.01), 900, c364)).toBeCloseTo(0.006, 14);
    // E-90 (4): credit364 null at days ≥ 364 (missing history row, production fallback) takes the credit0 branch, no throw
    expect(g(c0 * dmath.exp(0.01), 364)).toBeCloseTo(0.01, 14);
    expect(g(c0 * dmath.exp(0.01), 500)).toBeCloseTo(0.01 * 364 / 500, 14);
    expect(g(c0 * dmath.exp(0.01), 500, c364)).toBeCloseTo(0.006, 14);
    // the branch is chosen by days alone (E-87 (3)): day 0 is 0 even if prev.credit ≠ credit0; days < 364 ignores a supplied credit364
    const h = (days: number, credit364: number | null) => creditAggregates(1_000, { credit: 2_000, creditGdpTrend: 1, credit364, credit0: c0, days }, sup(3_000), fb).creditGrowth;
    expect(h(0, null)).toBe(0);
    expect(h(0, 1_500)).toBe(0);
    expect(h(363, 1_500)).toBeCloseTo(dmath.ln(3) * 364 / 363, 14);
    expect(h(364, 1_500)).toBeCloseTo(dmath.ln(2), 14);
    expect(() => g(c0, -1)).toThrow('days=-1');
    expect(() => g(c0, 1.5)).toThrow('days=1.5');
  });

  it('fallbackCreditConditions: 0.5·tanh(−2R̃/0.01) + tilt (EXP 0.2, OVH 0.3, CON −0.5, REC 0)', () => {
    const tilt: Record<Regime, number> = { EXPANSION: 0.2, OVERHEATING: 0.3, CONTRACTION: -0.5, RECOVERY: 0 };
    for (const r of ['EXPANSION', 'OVERHEATING', 'CONTRACTION', 'RECOVERY'] as Regime[]) {
      expect(fallbackCreditConditions(0, r)).toBe(tilt[r]);
      expect(fallbackCreditConditions(0.0025, r)).toBeCloseTo(0.5 * dmath.tanh(-0.5) + tilt[r], 15);
    }
    expect(fallbackCreditConditions(1, 'CONTRACTION')).toBe(-1);   // −0.5 − 0.5 at the floor of [−1, 1]
  });
});

/** Ports whose commodity closes and readers come from a mutable table (null = missing today). */
function portsWith(px: Record<string, number | null>, other: { ai?: number | null; hack?: number | null; tension?: number | null; stab?: number | null } = {}): MacroPorts {
  const p = defaultMacroPorts();
  p.assets.commodityClose = (_s, c) => px[c] ?? null;
  p.ai.aiRaceIndex = () => other.ai ?? null;
  p.conflict.worldHackRate = () => other.hack ?? null;
  p.world.geopoliticalTension = () => other.tension ?? null;
  p.world.politicalStability = () => other.stab ?? null;
  return p;
}
const PX0 = { CRUDE: 80, GAS: 3, MWH: 60, WHEAT: 6, CORN: 5, COFFEE: 2, COCOA: 3 };

describe('T04-05 other inputs (04 §3.14.5)', () => {
  it('energyIndex / foodIndex weights', () => {
    const e0 = { crude: 80, gas: 3, mwh: 60 };
    expect(energyIndex(e0, e0)).toBeCloseTo(100, 12);
    expect(energyIndex({ crude: 160, gas: 3, mwh: 60 }, e0)).toBeCloseTo(150, 12);
    expect(energyIndex({ crude: 80, gas: 6, mwh: 60 }, e0)).toBeCloseTo(130, 12);
    expect(energyIndex({ crude: 80, gas: 3, mwh: 120 }, e0)).toBeCloseTo(120, 12);
    const f0 = { wheat: 6, corn: 5, coffee: 2, cocoa: 3 };
    expect(foodIndex({ wheat: 12, corn: 5, coffee: 2, cocoa: 3 }, f0)).toBeCloseTo(130, 12);
    expect(foodIndex({ wheat: 6, corn: 10, coffee: 2, cocoa: 3 }, f0)).toBeCloseTo(130, 12);
    expect(foodIndex({ wheat: 6, corn: 5, coffee: 4, cocoa: 3 }, f0)).toBeCloseTo(120, 12);
    expect(foodIndex({ wheat: 6, corn: 5, coffee: 2, cocoa: 6 }, f0)).toBeCloseTo(120, 12);
  });

  it('genesis: no ports → every key stale, defaults 100/100, aiRace 50, hack 0, tension 30, stability 0.7', () => {
    const { inputs, stale } = collectInputs(store, defaultMacroPorts(), EMPTY, 719);
    expect(inputs.tick).toBe(719); expect(inputs.id).toBe('INPUTS');
    expect(stale).toEqual(['energy', 'food', 'aiRaceIndex', 'worldHackRate', 'geopoliticalTension', ...BLOC_ORDER.map((b) => `politicalStability:${b}`)]);
    expect(inputs.staleKeys).toEqual(stale);
    expect(inputs.values).toMatchObject({ energy: 100, food: 100, aiRaceIndex: 50, worldHackRate: 0, geopoliticalTension: 30, 'politicalStability:SRL': 0.7 });
  });

  it('missing crude print holds the last energy index and lists energy in staleKeys (genesis prices captured at first close)', () => {
    const d1 = collectInputs(store, portsWith(PX0, { ai: 61, hack: 0.2, tension: 40, stab: 0.5 }), EMPTY, 719);
    expect(d1.stale).toEqual([]);
    expect(d1.inputs.values).toMatchObject({ energy: 100, food: 100, 'g0:CRUDE': 80, aiRaceIndex: 61, worldHackRate: 0.2, geopoliticalTension: 40, 'politicalStability:FDL': 0.5 });
    const d2 = collectInputs(store, portsWith({ ...PX0, CRUDE: 120, WHEAT: 12 }), d1.inputs, 1439);
    expect(d2.inputs.values.energy).toBeCloseTo(125, 12);
    expect(d2.inputs.values.food).toBeCloseTo(130, 12);
    expect(d2.inputs.values['g0:CRUDE']).toBe(80);   // genesis held, not re-captured
    expect(d2.inputs.values).toMatchObject({ aiRaceIndex: 61, worldHackRate: 0.2, geopoliticalTension: 40, 'politicalStability:NKR': 0.5 });   // held
    const d3 = collectInputs(store, portsWith({ ...PX0, CRUDE: null, GAS: 6 }, { ai: 70 }), d2.inputs, 2159);
    expect(d3.inputs.values.energy).toBeCloseTo(125, 12);
    expect(d3.stale).toContain('energy');
    expect(d3.stale).not.toContain('food');
    expect(d3.stale).not.toContain('aiRaceIndex');
    expect(d3.inputs.values.food).toBeCloseTo(100, 12);
    expect(d3.inputs.values.aiRaceIndex).toBe(70);
  });

  it('E-87 (5) indices stay 100 until every basket member prints; g0 captured per basket so the first computed index is exactly 100', () => {
    const d1 = collectInputs(store, portsWith({ ...PX0, MWH: null }), EMPTY, 719);
    expect(d1.inputs.values.energy).toBe(100);
    expect(d1.stale).toEqual(['energy', 'aiRaceIndex', 'worldHackRate', 'geopoliticalTension', ...BLOC_ORDER.map((b) => `politicalStability:${b}`)]);
    expect(d1.inputs.values['g0:CRUDE']).toBeUndefined();   // energy basket incomplete: nothing captured
    expect(d1.inputs.values['g0:WHEAT']).toBe(6);            // food basket complete on d1
    expect(d1.inputs.values.food).toBe(100);                 // AC E87-5: first computed foodIndex exactly 100
    const d2 = collectInputs(store, portsWith({ ...PX0, CRUDE: 160, MWH: 30 }), d1.inputs, 1439);
    expect(d2.inputs.values).toMatchObject({ 'g0:CRUDE': 160, 'g0:GAS': 3, 'g0:MWH': 30 });
    expect(d2.inputs.values.energy).toBe(100);               // AC E87-5: first computed energyIndex exactly 100
    expect(d2.stale).not.toContain('energy');
    const d3 = collectInputs(store, portsWith({ ...PX0, CRUDE: 320, MWH: 30 }), d2.inputs, 2159);
    expect(d3.inputs.values['g0:CRUDE']).toBe(160);
    expect(d3.inputs.values.energy).toBeCloseTo(100 * (0.5 * 2 + 0.3 + 0.2), 12);
  });
});
