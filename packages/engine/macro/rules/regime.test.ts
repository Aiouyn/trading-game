// T04-03 acceptance tests: regime chain (04 §3.3.1-§3.3.4), 04#5, worked examples, coupling, minimum length and draw count.
import { describe, expect, it } from 'vitest';
import type { ParamsView, Rng } from '@tycoon/engine-core';
import { REGIMES, type Regime } from '../schema';
import { BLOC_DEFAULTS } from '../blocs';
import { ALLOWED, applyCoupling, forceRegime, HAZARD_WEIGHTS, P_BASE, regimeParams, stepRegime, transitionMultipliers, type RegimeParams } from './regime';

/** Test-only fast deterministic Rng (sfc32, 53-bit uniforms) implementing the T02-06 Rng interface from @tycoon/engine-core. Counts draws. */
function fastRng(seed: number): Rng & { draws: number } {
  let a = 0x9e3779b9 ^ seed, b = 0x243f6a88, c = 0xb7e15162 ^ (seed * 31), d = 1;
  const u32 = (): number => { a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0; let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0; return t >>> 0; };
  for (let i = 0; i < 15; i++) u32();
  const no = (): never => { throw new Error('not used'); };
  const r = { draws: 0, uOpen: (): number => { r.draws++; return ((u32() >>> 5) * 67108864 + (u32() >>> 6) + 0.5) / 9007199254740992; },
    u53: no, next: no, int: no, bernoulli: no, normal: no, studentT: no, exponential: no, poisson: no, kouJump: no, categorical: no, shuffle: no };
  return r as unknown as Rng & { draws: number };
}
/** A constant Rng (every draw returns `v`), counting draws. */
function constRng(v: number): Rng & { draws: number } {
  const r = fastRng(0); r.uOpen = (): number => { r.draws++; return v; }; return r;
}
/** The 23 DEFAULT values from the T04-03 pack's parameter table (04 §3.3.1). */
const PARAMS: Record<string, number> = { macro_regime_mean_days_exp: 819, macro_regime_mean_days_ovh: 273, macro_regime_mean_days_con: 273, macro_regime_mean_days_rec: 273,
  macro_regime_min_days_exp: 182, macro_regime_min_days_ovh: 63, macro_regime_min_days_con: 91, macro_regime_min_days_rec: 91 };
const pv = { num: (k: string) => PARAMS[k]!, int: (k: string) => { const v = PARAMS[k]; if (v === undefined) throw new Error(`no param ${k}`); return v; } } as unknown as ParamsView;
const RP: RegimeParams = regimeParams(pv);
const rel = (a: number, b: number): number => Math.abs(a / b - 1);

describe('T04-03 regime', () => {
  it('regimeParams reads the 8 regime params; tables match §3.3.1/§3.3.4', () => {
    expect(RP.meanDays).toEqual({ EXPANSION: 819, OVERHEATING: 273, CONTRACTION: 273, RECOVERY: 273 });
    expect(RP.minDays).toEqual({ EXPANSION: 182, OVERHEATING: 63, CONTRACTION: 91, RECOVERY: 91 });
    expect(ALLOWED).toEqual({ EXPANSION: ['OVERHEATING', 'CONTRACTION'], OVERHEATING: ['CONTRACTION', 'EXPANSION'], CONTRACTION: ['RECOVERY'], RECOVERY: ['EXPANSION', 'CONTRACTION'] });
    expect(P_BASE).toEqual({ EXPANSION: { OVERHEATING: 0.8, CONTRACTION: 0.2 }, OVERHEATING: { CONTRACTION: 0.85, EXPANSION: 0.15 }, CONTRACTION: { RECOVERY: 1 }, RECOVERY: { EXPANSION: 0.9, CONTRACTION: 0.1 } });
    expect(HAZARD_WEIGHTS['OVERHEATING>CONTRACTION']).toEqual({ ...HAZARD_WEIGHTS['EXPANSION>CONTRACTION'], inflation: 0.3 });
    expect(HAZARD_WEIGHTS['EXPANSION>CONTRACTION']).toEqual({ credit: 0.4, valuation: 0.35, curve: 0.5, policy: 0.45, oil: 0.3, fear: 0.4, contagion: 0.6, house: 0.3, fiscal: 0.2, trade: 0.3 });
    expect(transitionMultipliers('EXPANSION', { credit: 2, fear: 3 }, 0)).toEqual({ OVERHEATING: 1, CONTRACTION: 1 });
    expect(transitionMultipliers('EXPANSION', { credit: 9 }).CONTRACTION).toBeCloseTo(Math.exp(0.4 * 3), 12);   // clamp(z, −2, 3)
    expect(transitionMultipliers('EXPANSION', { credit: -9 }).CONTRACTION).toBeCloseTo(Math.exp(0.4 * -2), 12);
  });

  // AC-04-03-EVENT-STOP (E-80, Quant ruling on 04#5): event-count stopping, deterministic per seed, both parts sized to 4σ.
  // (a) 6,400 transitions out of EXPANSION: rel. SE of p̂ = 1/√6400 = 1.25% → 5% = 4σ; SE of the OVH share = √(0.8·0.2/6400) = 0.005 → 0.02 = 4σ.
  // (b) two arms of 3,200 EXP→CON transitions: rel. SE of the hazard ratio ≈ √(2/3200) = 2.5% → 10% = 4σ.
  /** Runs EXPANSION (restarting there after each exit) until `stopAt` exits counted by `stop`; at-risk days = days after the minimum. */
  const runExp = (seed: number, m: Partial<Record<Regime, number>>, stop: 'ANY' | 'CONTRACTION', stopAt: number) => {
    const rng = fastRng(seed);
    let atRisk = 0, trans = 0, ovh = 0, con = 0, daysIn = 0;
    while ((stop === 'ANY' ? trans : con) < stopAt) {
      const s = stepRegime(rng, 'EXPANSION', daysIn, m, RP);
      if (daysIn >= RP.minDays.EXPANSION) atRisk++;
      if (s.transitioned) { trans++; if (s.next === 'OVERHEATING') ovh++; else con++; daysIn = 0; } else daysIn++;
    }
    return { atRisk, trans, ovh, con };
  };
  /** EXP→CON hazard: total hazard −ln(1 − p̂) times the CON share of exits. */
  const conHazard = (r: { atRisk: number; trans: number; con: number }): number => -Math.log(1 - r.trans / r.atRisk) * (r.con / r.trans);
  const AC_SEEDS = [1, 2, 3] as const;

  for (const seed of AC_SEEDS) {
    it(`AC-04-03-EVENT-STOP 04#5 (a) seed ${seed}: weightScale 0, until 6,400 EXP exits → p̂ = 1 − e^(−1/637) within 5%, OVH:CON 0.80:0.20 within 0.02`, () => {
      const r = runExp(seed, transitionMultipliers('EXPANSION', {}, 0), 'ANY', 6_400);
      const want = 1 - Math.exp(-1 / 637);
      expect(want).toBeCloseTo(0.0015686, 7);
      expect(r.trans).toBe(6_400);
      console.log(`[AC-04-03-EVENT-STOP (a) seed ${seed}] events ${r.trans} (OVH ${r.ovh}, CON ${r.con}), at-risk days ${r.atRisk}, p̂ ${(r.trans / r.atRisk).toFixed(7)} vs ${want.toFixed(7)}, OVH share ${(r.ovh / r.trans).toFixed(4)}`);
      expect(rel(r.trans / r.atRisk, want)).toBeLessThan(0.05);
      expect(Math.abs(r.ovh / r.trans - 0.8)).toBeLessThan(0.02);
    });
    it(`AC-04-03-EVENT-STOP 04#5 (b) seed ${seed}: arms z = 0 and z = {credit: 2}, each until 3,200 EXP→CON → hazard ratio e^0.8 within 10%`, () => {
      const m = transitionMultipliers('EXPANSION', { credit: 2 });
      expect(m.CONTRACTION).toBeCloseTo(2.225541, 6); expect(m.OVERHEATING).toBeCloseTo(1.822119, 6);
      const zero = runExp(seed, transitionMultipliers('EXPANSION', {}), 'CONTRACTION', 3_200);
      const cred = runExp(seed + 1_000, m, 'CONTRACTION', 3_200);
      expect([zero.con, cred.con]).toEqual([3_200, 3_200]);
      console.log(`[AC-04-03-EVENT-STOP (b) seed ${seed}] events z=0 ${zero.con} CON / ${zero.trans} exits, credit ${cred.con} CON / ${cred.trans} exits, HR ${(conHazard(cred) / conHazard(zero)).toFixed(4)} vs e^0.8 ${Math.exp(0.8).toFixed(4)}`);
      expect(rel(conHazard(cred) / conHazard(zero), Math.exp(0.8))).toBeLessThan(0.10);
    });
  }

  it('worked total hazard with credit z 2: H, P(transition), CON share; u2 pick follows cumulative weights', () => {
    const m = transitionMultipliers('EXPANSION', { credit: 2 });
    const s = stepRegime(constRng(0), 'EXPANSION', 182, m, RP);
    expect(s.hazard).toBeCloseTo(0.00298713, 8);
    expect(1 - Math.exp(-s.hazard)).toBeCloseTo(0.00298268, 8);
    expect(0.2 * m.CONTRACTION! / (0.8 * m.OVERHEATING! + 0.2 * m.CONTRACTION!)).toBeCloseTo(0.233922, 6);
    expect(s).toMatchObject({ transitioned: true, next: 'OVERHEATING', u2: 0 });   // u2 = 0 → first target
    const share = 1 - 0.233922341319356;
    expect(stepRegime(constRng(0.0001), 'EXPANSION', 182, m, RP).next).toBe('OVERHEATING');   // u1 0.0001 < P; u2 0.0001 < OVH share
    const pick = (u2: number): Regime => { let i = 0; const r = fastRng(0); r.uOpen = () => (i++ === 0 ? 0 : u2); return stepRegime(r, 'EXPANSION', 182, m, RP).next; };
    expect(pick(share - 1e-9)).toBe('OVERHEATING'); expect(pick(share + 1e-9)).toBe('CONTRACTION');
    expect(stepRegime(constRng(0.00298268 + 1e-6), 'EXPANSION', 182, m, RP).transitioned).toBe(false);   // u1 ≥ 1 − e^(−H)
    expect(stepRegime(constRng(0.00298268 - 1e-6), 'EXPANSION', 182, m, RP).transitioned).toBe(true);
  });

  it('coupling: SRL (1.3) in EXPANSION, global CONTRACTION, z = 0 → M[CON] = e^0.78, H = 0.00194081; recovery boost for a bloc in CONTRACTION', () => {
    const c = BLOC_DEFAULTS.SRL.cycleCoupling; expect(c).toBe(1.3);
    const m = applyCoupling('EXPANSION', transitionMultipliers('EXPANSION', {}), 'CONTRACTION', c);
    expect(m.CONTRACTION).toBeCloseTo(2.181472, 6); expect(m.OVERHEATING).toBe(1);
    expect(stepRegime(constRng(0.5), 'EXPANSION', 182, m, RP).hazard).toBeCloseTo(0.00194081, 8);
    for (const g of ['RECOVERY', 'EXPANSION'] as const) expect(applyCoupling('CONTRACTION', { RECOVERY: 1 }, g, c).RECOVERY).toBeCloseTo(Math.exp(0.4 * 1.3), 12);
    expect(applyCoupling('CONTRACTION', { RECOVERY: 1 }, 'OVERHEATING', c)).toEqual({ RECOVERY: 1 });
    expect(applyCoupling('EXPANSION', { OVERHEATING: 1, CONTRACTION: 1 }, 'EXPANSION', c)).toEqual({ OVERHEATING: 1, CONTRACTION: 1 });
    expect(applyCoupling('RECOVERY', { EXPANSION: 1, CONTRACTION: 1 }, 'RECOVERY', c)).toEqual({ EXPANSION: 1, CONTRACTION: 1 });
  });

  it('minimum length: CONTRACTION with 90 days never transitions even with u1 = 0; exactly 2 draws either way', () => {
    const m = transitionMultipliers('CONTRACTION', { stimulus: 3 });
    const r0 = constRng(0), s0 = stepRegime(r0, 'CONTRACTION', 90, m, RP);
    expect(s0).toMatchObject({ transitioned: false, next: 'CONTRACTION', u2: null }); expect(r0.draws).toBe(2);
    const r1 = constRng(0), s1 = stepRegime(r1, 'CONTRACTION', 91, m, RP);
    expect(s1).toMatchObject({ transitioned: true, next: 'RECOVERY', u2: 0 }); expect(r1.draws).toBe(2);
    const r2 = constRng(0.999999), s2 = stepRegime(r2, 'CONTRACTION', 400, m, RP);
    expect(s2.transitioned).toBe(false); expect(r2.draws).toBe(2);
    // stream position: 3 steps consume 6 draws regardless of outcome
    const a = fastRng(9); for (const d of [0, 91, 500]) stepRegime(a, 'CONTRACTION', d, m, RP); expect(a.draws).toBe(6);
  });

  it('forceRegime ignores the minimum, no draws, logs the crisis id', () => {
    expect(forceRegime('EXPANSION', 'CONTRACTION', 'we_1')).toEqual({ next: 'CONTRACTION', transitioned: true, hazard: 0, u1: 0, u2: null, forced: true, forcedBy: 'we_1' });
  });

  it('every transition over 100,000 simulated days follows ALLOWED', () => {
    const rng = fastRng(11); let s: Regime = 'EXPANSION', daysIn = 0, n = 0;
    const seen: Record<string, number> = {};
    for (let d = 0; d < 100_000; d++) {
      const z = { credit: Math.sin(d / 50) * 3, stimulus: Math.cos(d / 70) * 3, inflation: Math.sin(d / 33) * 2 };
      const st = stepRegime(rng, s, daysIn, transitionMultipliers(s, z), RP);
      if (st.transitioned) { expect(ALLOWED[s]).toContain(st.next); seen[`${s}>${st.next}`] = (seen[`${s}>${st.next}`] ?? 0) + 1; n++; s = st.next; daysIn = 0; } else daysIn++;
    }
    expect(n).toBeGreaterThan(100);
    expect(Object.getOwnPropertyNames(seen).sort()).toEqual(Object.getOwnPropertyNames(HAZARD_WEIGHTS).sort());   // all 7 edges exercised
  });

  it('mean durations with z = 0: EXPANSION 819 ± 2%, others 273 ± 2% over 20,000 cycles', () => {
    for (const [i, r] of REGIMES.entries()) {
      const rng = fastRng(100 + i), m = transitionMultipliers(r, {});
      let total = 0;
      for (let c = 0; c < 20_000; c++) { let d = 0; while (!stepRegime(rng, r, d, m, RP).transitioned) d++; total += d + 1; }
      expect(rel(total / 20_000, r === 'EXPANSION' ? 819 : 273)).toBeLessThan(0.02);
    }
  }, 120_000);
});
