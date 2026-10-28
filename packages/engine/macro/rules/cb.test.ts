// T04-06 acceptance tests: rule, decisions, votes, emergencies, personality, credibility, ruleTerms (04#9, 04#10, 04#12; E-45, E-54, E-62).
import { describe, expect, it } from 'vitest';
import { dmath } from '@tycoon/engine-core';
import { createParamsView } from '@tycoon/params';
import type { ParamsView, PhaseCtx, Rng } from '@tycoon/engine-core';
import { cbkId } from '@tycoon/engine-ledger';
import { BLOC_DEFAULTS } from '../blocs';
import { assertNoHiddenFields, MACRO_EVENTS } from '../events';
import { roundToQuarterPp } from '../gapest';
import { defaultMacroPorts, type MacroPorts } from '../ports';
import { BLOC_ORDER, macroTables, type BlocId, type CentralBank, type DataRelease } from '../schema';
import { S } from '../streams';
import { appointGovernor, cbOutputGap, coeffsFromHawk, emergencyStep, emergencyTriggers, freshGuidance, fxTerm, guidanceMissed, publishedData, roundRuleTerms, ruleRate,
  runMeeting, scheduledStep, scheduleEmergency, stepHawkDrift, stepsHalfEven, RATE_EPS, RULE_TERMS_INTERNAL, type CbDecisionRow, type PublishedData } from './cb';
import { corridorOf } from './corridor';
import { impliedHawk, stepHHat } from './curves';
import { memberPreference, tally } from './cbVotes';
import { credibilityOneOff, stepCredibility } from './credibility';
import { dots, guidanceAt, guidanceScore, guidanceTextKey, impliedMove, memberPrefsOf, minutesAt, riskKeysOf } from './guidance';

/** Test-only deterministic Rng (splitmix64 + Box-Muller), as in gapest.test.ts. */
function testRng(seed: string): Rng {
  let s = 0n; for (const c of seed) s = (s * 131n + BigInt(c.charCodeAt(0))) & 0xffffffffffffffffn;
  const next64 = (): bigint => { s = (s + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn; let z = s;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn; z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn; return z ^ (z >> 31n); };
  const u = (): number => (Number(next64() >> 11n) + 0.5) / 2 ** 53;
  const no = (): never => { throw new Error('not used'); };
  return { next: u, u53: u, uOpen: u, int: no, bernoulli: no, normal: () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()),
    studentT: no, exponential: no, poisson: no, kouJump: no, categorical: no, shuffle: no } as Rng;
}
const P: Record<string, number> = { macro_cb_phi_fs: 1.5, macro_cb_smoothing: 0.5, macro_cb_max_step: 0.005, macro_cb_max_step_wide: 0.0075,
  macro_cb_emergency_step: 0.01, macro_cred_guidance_break: 0.05, macro_governor_term_days: 2912, macro_corridor_halfwidth: 0.0025, macro_cb_max_emergency_per_quarter: 2 };
const pv: ParamsView = { ...createParamsView([]), num: (k) => { if (!(k in P)) throw new Error(k); return P[k]!; }, int: (k) => { if (!(k in P)) throw new Error(k); return P[k]!; } };

interface Emitted { kind: string; payload: Record<string, unknown>; vis: string }
interface World { ctx: PhaseCtx; tables: Record<string, Record<string, unknown>>; emitted: Emitted[]; draws: Record<string, number>; set(tick: number): void }
function world(seed: string, over: { cb?: Partial<CentralBank>; core?: number; u?: number; x?: number; eps?: number; fsi?: number; dep?: number; b?: BlocId } = {}): World {
  const b = over.b ?? 'FDL', d0 = BLOC_DEFAULTS[b];
  const tables: Record<string, Record<string, unknown>> = {};
  const put = (t: string, e: { id: string }): void => { (tables[t] ??= {})[e.id] = e; };
  const cb = { id: cbkId(b), bloc: b, mandate: d0.mandate, hawkishness: 0.5, credibility: 0.6, policyRate: 0.03, corridorHalfWidth: 0.0025, lastDecisions: [],
    guidance: null, dots: [], memberOffsets: [0, 0.1, -0.1, 0.2, -0.2, 0.3, -0.3, 0.05, -0.05], rStarBias: 0, governorNpcId: null, governorTermEndTick: 0,
    emergencyCountQuarter: 0, emergencyQuarter: 0, pendingEmergency: null, ...over.cb };
  put(macroTables.cb.name, cb as unknown as { id: string });
  put(macroTables.bloc.name, { id: b, rStar: d0.rStar0, outputGap: over.x ?? 0.01, gapEstNoise: over.eps ?? 0.002, dep: over.dep ?? 0 } as never);
  put(macroTables.global.name, { id: 'GLOBAL', financialStressIndex: over.fsi ?? 0.2 } as never);
  put(macroTables.publicView.name, { id: b, prints: { CPI: { actual: 0.03, extra: { coreYoy: over.core ?? 0.03 } }, JOBS: { actual: over.u ?? d0.nairu, extra: {} } } } as never);
  const emitted: Emitted[] = [], draws: Record<string, number> = {}, streams: Record<string, Rng> = {};
  let tick = 1000, n = 0;
  const ctx = { get tick() { return tick; }, params: pv, newId: (k: string) => `${k}_${n++}`,
    store: { get: (t: string, id: string) => tables[t]?.[id], put: (t: string, e: { id: string }) => put(t, e),
      index: (t: string, _n: string, key: string) => Object.values(tables[t] ?? {}).filter((e) => (e as { bloc?: string }).bloc === key) },
    rng: (k: string) => { const r = (streams[k] ??= testRng(`${seed}|${k}`)); const c = (o: Rng): Rng => new Proxy(o, { get: (tg, prop) => {
      const v = (tg as unknown as Record<string | symbol, unknown>)[prop];
      return typeof v === 'function' ? (...a: unknown[]) => { draws[k] = (draws[k] ?? 0) + 1; return (v as (...x: unknown[]) => unknown)(...a); } : v; } }); return c(r); },
    emit: (kind: string, _ids: string[], payload: Record<string, unknown>, vis: string) => { emitted.push({ kind, payload, vis }); } } as unknown as PhaseCtx;
  return { ctx, tables, emitted, draws, set: (t) => { tick = t; } };
}
const cbOf = (w: World, b: BlocId = 'FDL'): CentralBank => w.tables[macroTables.cb.name]![cbkId(b)] as CentralBank;
const pd = (o: Partial<PublishedData> = {}): PublishedData => ({ piCb: 0.02, xGdpPub: 0, uPub: 0.045, fsi: 0.2, depYoy: 0, ...o });

describe('§3.6.2 coefficients and personality', () => {
  it('hawk → φ_π, φ_x, bias; PRICE_STABILITY φ_x × 0.7 (hawk 0.5 → 0.35); φ_fs, ρ from params; φ_fx from the bloc table', () => {
    expect(coeffsFromHawk('FDL', 0.5, 'DUAL', pv)).toEqual({ phiPi: 0.5, phiX: 0.5, phiFs: 1.5, phiFx: 0, bias: 0, rho: 0.5 });
    expect(coeffsFromHawk('EUN', 0.5, 'PRICE_STABILITY', pv).phiX).toBeCloseTo(0.35, 15);
    const h = coeffsFromHawk('SRL', 1, 'DUAL', pv);
    expect([h.phiPi, h.phiX, h.bias, h.phiFx]).toEqual([0.8, 0.25, 0.0025, 0.3]);
    const l = coeffsFromHawk('PYN', 0, 'DUAL', pv);
    expect([l.phiPi, l.phiX, l.bias, l.phiFx]).toEqual([0.2, 0.75, -0.0025, 0.2]);
  });
  it('stepHawkDrift: 0.05·√(1/364)·ε, clamped to the range', () => {
    const cb = { hawkishness: 0.5 } as CentralBank;
    expect(stepHawkDrift(cb, 1, [0.2, 0.8])).toBe(0.5 + 0.05 * Math.sqrt(1 / 364));
    expect(stepHawkDrift(cb, -1, [0.2, 0.8])).toBe(0.5 - 0.05 * Math.sqrt(1 / 364));
    expect(stepHawkDrift({ hawkishness: 0.799 } as CentralBank, 10, [0.2, 0.8])).toBe(0.8);
    expect(stepHawkDrift({ hawkishness: 0.201 } as CentralBank, -10, [0.2, 0.8])).toBe(0.2);
  });
  it('appointGovernor: hawk in range, 9 offsets, r* bias in ±0.005; 11 draws on S.cbPersonality; term end; AC-04-06-GOVNULL event at GENESIS with a null id', () => {
    for (const b of BLOC_ORDER) for (let s = 0; s < 50; s++) {
      const w = world(`gov${s}`, { b });
      appointGovernor(w.ctx, b, 'GENESIS', defaultMacroPorts());
      const cb = cbOf(w, b), pers = BLOC_DEFAULTS[b].personality;
      expect(cb.hawkishness).toBeGreaterThanOrEqual(pers.hawkMin); expect(cb.hawkishness).toBeLessThanOrEqual(pers.hawkMax);
      expect(cb.memberOffsets).toHaveLength(9);
      expect(Math.abs(cb.rStarBias)).toBeLessThanOrEqual(0.005);
      expect(w.draws).toEqual({ [S.cbPersonality(b)]: 11 });
      expect(cb.credibility).toBe(0.6);   // GENESIS: no new-governor move
      expect(cb.governorTermEndTick).toBe(1000 + 2912 * 720);
      expect(w.emitted).toEqual([{ kind: 'macro.governor.appointed', payload: { bloc: b, governorNpcId: null, termEndTick: 1000 + 2912 * 720 }, vis: 'PUBLIC' }]);
      expect(MACRO_EVENTS['macro.governor.appointed']!.safeParse(w.emitted[0]!.payload).success).toBe(true);
    }
    const w = world('gov'); appointGovernor(w.ctx, 'FDL', 'GENESIS', defaultMacroPorts());
    const r = testRng(`gov|${S.cbPersonality('FDL')}`), u = r.next(), offs = Array.from({ length: 9 }, () => 0.15 * r.normal()), bias = -0.005 + 0.01 * r.next();
    const pers = BLOC_DEFAULTS.FDL.personality;
    expect(cbOf(w).hawkishness).toBe(pers.hawkMin + (pers.hawkMax - pers.hawkMin) * u);
    expect(cbOf(w).memberOffsets).toEqual(offs); expect(cbOf(w).rStarBias).toBe(bias);
    const g = world('gov-curve');
    g.tables[macroTables.curve.name] = { FDL: { id: 'FDL', hHat: 0.9 } };
    appointGovernor(g.ctx, 'FDL', 'GENESIS', defaultMacroPorts());
    expect((g.tables[macroTables.curve.name]!.FDL as { hHat: number }).hHat).toBe(0.9);   // GENESIS: ĥ untouched
  });
  it('appointGovernor TERM_END with a 16 appointment: hawk0 used (draws still 11), ĥ halfway to 0.5, credibility 0.05 toward credibility0, event', () => {
    const ports: MacroPorts = defaultMacroPorts();
    ports.world.governorAppointment = () => ({ governorNpcId: 'npc_gov1', hawk0: 0.77 });
    const w = world('t', { cb: { credibility: 0.3 } });
    w.tables[macroTables.curve.name] = { FDL: { id: 'FDL', hHat: 0.9 } };
    appointGovernor(w.ctx, 'FDL', 'TERM_END', ports);
    const cb = cbOf(w);
    expect(cb.hawkishness).toBe(0.77); expect(w.draws[S.cbPersonality('FDL')]).toBe(11);
    expect(cb.credibility).toBeCloseTo(credibilityOneOff(0.3, 'NEW_GOVERNOR', BLOC_DEFAULTS.FDL.personality.credibility0), 15);
    expect(cb.governorNpcId).toBe('npc_gov1');
    expect((w.tables[macroTables.curve.name]!.FDL as { hHat: number }).hHat).toBeCloseTo(0.7, 15);
    expect(w.emitted).toEqual([{ kind: 'macro.governor.appointed', payload: { bloc: 'FDL', governorNpcId: 'npc_gov1', termEndTick: 1000 + 2912 * 720 }, vis: 'PUBLIC' }]);
    expect(MACRO_EVENTS['macro.governor.appointed']!.safeParse(w.emitted[0]!.payload).success).toBe(true);
  });
});

describe('§3.6.3 the rule', () => {
  it('04#9: at hawk 0.5, FSI and FX terms 0, i* = r* + π + 0.5(π − π*) + 0.5x (1,000 seeded cases); worked 0.0475', () => {
    const r = testRng('04#9');
    for (let k = 0; k < 1000; k++) {
      const rs = -0.01 + 0.04 * r.next(), pi = -0.02 + 0.12 * r.next(), tgt = [0.02, 0.025, 0.04][k % 3]!, x = -0.08 + 0.14 * r.next(), nairu = 0.045;
      const d = pd({ piCb: pi, xGdpPub: x, uPub: nairu - x / 2, fsi: 0.3 * r.next() });   // x_cb = 0.5x + 0.5·(−2·(−x/2)) = x; FSI ≤ 0.3 → FSI_ex 0
      expect(cbOutputGap(d, nairu)).toBeCloseTo(x, 14);
      const { iStar } = ruleRate(rs, d, tgt, nairu, 'FDL', coeffsFromHawk('FDL', 0.5, 'DUAL', pv));
      expect(Math.abs(iStar - (rs + pi + 0.5 * (pi - tgt) + 0.5 * x))).toBeLessThan(1e-9);
    }
    expect(ruleRate(0.0075, pd({ piCb: 0.03, xGdpPub: 0.01, uPub: 0.045 - 0.005 }), 0.02, 0.045, 'FDL', coeffsFromHawk('FDL', 0.5, 'DUAL', pv)).iStar).toBeCloseTo(0.0475, 15);
  });
  it('terms: each component, FSI_ex = max(0, FSI − 0.3), terms sum to i*', () => {
    const c = coeffsFromHawk('SRL', 0.7, 'PRICE_STABILITY', pv);
    const d = pd({ piCb: 0.05, xGdpPub: 0.02, uPub: 0.06, fsi: 0.5, depYoy: 0.25 });
    const { iStar, terms } = ruleRate(0.01, d, 0.04, 0.05, 'SRL', c);
    expect(terms.neutral).toBe(0.01); expect(terms.inflation).toBe(0.05);
    expect(terms.inflationGap).toBeCloseTo(c.phiPi * 0.01, 15);
    expect(terms.outputGap).toBeCloseTo(c.phiX * (0.5 * 0.02 + 0.5 * (-2 * 0.01)), 15);
    expect(terms.finStress).toBeCloseTo(-1.5 * 0.2, 15);
    expect(terms.fx).toBeCloseTo(0.3 * 0.1, 15);
    expect(terms.bias).toBeCloseTo(0.005 * 0.2, 15);
    expect(iStar).toBeCloseTo(terms.neutral + terms.inflation + terms.inflationGap + terms.outputGap + terms.finStress + terms.fx + terms.bias, 15);
    expect(ruleRate(0, pd({ fsi: 0.3 }), 0.02, 0.045, 'FDL', coeffsFromHawk('FDL', 0.5, 'DUAL', pv)).terms.finStress).toBe(-0);
  });
  it('fxTerm: SRL max(0, dep − 0.15); PYN dep both ways; others 0', () => {
    expect(fxTerm('SRL', 0.2)).toBeCloseTo(0.05, 15); expect(fxTerm('SRL', 0.15)).toBe(0); expect(fxTerm('SRL', -0.3)).toBe(0);
    expect(fxTerm('PYN', -0.07)).toBe(-0.07); expect(fxTerm('PYN', 0.07)).toBe(0.07);
    for (const b of ['FDL', 'EUN', 'NKR'] as const) expect(fxTerm(b, 0.5)).toBe(0);
  });
  it('publishedData: core CPI print, JOBS headline, x̂ = x + ε (never x), global FSI, bloc dep; E-100 (h) missing print → target / NAIRU', () => {
    const w = world('pd', { core: 0.031, u: 0.05, x: 0.01, eps: 0.003, fsi: 0.4, dep: 0.02 });
    const d = publishedData(w.ctx.store, 'FDL');
    expect(d).toEqual({ piCb: 0.031, xGdpPub: 0.01 + 0.003, uPub: 0.05, fsi: 0.4, depYoy: 0.02 });
    (w.tables[macroTables.publicView.name]!.FDL as { prints: Record<string, unknown> }).prints.JOBS = null;
    expect(publishedData(w.ctx.store, 'FDL')).toEqual({ ...d, uPub: 0.045 });
    (w.tables[macroTables.publicView.name]!.FDL as { prints: Record<string, unknown> }).prints.CPI = null;
    expect(publishedData(w.ctx.store, 'FDL')).toEqual({ ...d, piCb: 0.02, uPub: 0.045 });
    (w.tables[macroTables.publicView.name]!.FDL as { prints: Record<string, unknown> }).prints.CPI = { actual: 0.03, extra: {} };
    expect(publishedData(w.ctx.store, 'FDL').piCb).toBe(0.02);   // a CPI print without the core field is no core print
    delete w.tables[macroTables.publicView.name]!.FDL;
    expect(publishedData(w.ctx.store, 'FDL')).toEqual({ ...d, piCb: 0.02, uPub: 0.045 });
    expect(() => publishedData(w.ctx.store, 'EUN')).toThrow(/MAC_STATE_MISSING|bloc/);
  });
  it('AC-04-06-NOPRINT: NKR Q0 meeting (day 18) runs with π_cb 0.02, u_pub 0.04; a missing cb row throws MAC_STATE_MISSING', () => {
    const w = world('np', { b: 'NKR', cb: { policyRate: 0.0 } });
    (w.tables[macroTables.publicView.name]!.NKR as { prints: Record<string, unknown> }).prints = { CPI: null, JOBS: null };
    w.set(18 * 720 + 45);
    const row = runMeeting(w.ctx, 'NKR', false, null) as CbDecisionRow;
    expect(row.dataAtMeeting.piCb).toBe(0.02); expect(row.dataAtMeeting.uPub).toBe(0.04);
    expect(row.ruleTerms.inflationGap).toBe(0);
    delete w.tables[macroTables.cb.name]![cbkId('NKR')];
    expect(() => runMeeting(w.ctx, 'NKR', false, null)).toThrow(expect.objectContaining({ code: 'MAC_STATE_MISSING' }));
  });
});

describe('§3.6.4 scheduled decision', () => {
  it('04#10 worked numbers', () => {
    expect(scheduledStep(0.03, 0.0475, 0, 0.5, pv)).toBeCloseTo(0.035, 15);
    expect(scheduledStep(0.03, 0.055, 0, 0.5, pv)).toBeCloseTo(0.0375, 15);
    expect(scheduledStep(0.03, 0.032, 0, 0.5, pv)).toBe(0.03);
    expect(scheduledStep(0.0025, -0.03, 0, 0.5, pv)).toBe(0);
  });
  it('hold band edge, half-even steps, wide clamp at exactly 2 pp', () => {
    expect(scheduledStep(0.03, 0.03 + 0.0024, 0, 0.5, pv)).toBe(0.03);                  // Δraw 0.0012 < 0.00125
    expect(scheduledStep(0.03, 0.0325, 0, 0.5, pv)).toBeCloseTo(0.03, 15);              // Δraw 0.00125 → 0.5 step → half-even 0
    expect(scheduledStep(0.03, 0.0375, 0, 0.5, pv)).toBeCloseTo(0.035, 15);             // Δraw 0.00375 → 1.5 steps → half-even 2
    expect(scheduledStep(0.03, 0.03 - 0.0075, 0, 0.5, pv)).toBeCloseTo(0.025, 15);      // −1.5 steps → −2
    expect(scheduledStep(0.03, 0.05, 0, 0.5, pv)).toBeCloseTo(0.0375, 15);              // gap = 0.02 → wide
    expect(scheduledStep(0.03, 0.0499, 0, 0.5, pv)).toBeCloseTo(0.035, 15);             // gap < 0.02 → ±0.005
    expect(scheduledStep(0.03, 0.01, 0, 0.5, pv)).toBeCloseTo(0.0225, 15);
    expect(scheduledStep(0.03, 0.0475, 0, 1, pv)).toBeCloseTo(0.035, 15);
  });
  it('E-100 (g)/(m): i 0.03, i* 0.01 (|gap| = 0.019999999999999997) is wide → 0.0225 within 1e-9; RATE_EPS = 1e-12', () => {
    expect(RATE_EPS).toBe(1e-12);
    expect(Math.abs(scheduledStep(0.03, 0.01, 0, 0.5, pv) - 0.0225)).toBeLessThan(1e-9);
    expect(Math.abs(scheduledStep(0.03, 0.01 + 2e-12, 0, 0.5, pv) - 0.025)).toBeLessThan(1e-9);   // outside RATE_EPS: narrow cap
  });
  it('04#10 property: every bloc, i on the 25-bp grid from the ELB, i* ∈ [−0.05, 0.2]: integer steps, caps, ≥ ELB', () => {
    const r = testRng('04#10');
    for (const b of BLOC_ORDER) for (let k = 0; k < 2000; k++) {
      const elb = BLOC_DEFAULTS[b].elb, i = elb + 0.0025 * Math.floor(r.next() * ((0.15 - elb) / 0.0025 + 1)), iStar = -0.05 + 0.25 * r.next();
      const n = scheduledStep(i, iStar, elb, 0.5, pv), steps = (n - i) / 0.0025;
      expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-9);
      expect(Math.abs(n - i)).toBeLessThanOrEqual((Math.abs(iStar - i) >= 0.02 ? 0.0075 : 0.005) + 1e-12);
      expect(n).toBeGreaterThanOrEqual(elb);
    }
  });
  it('stepsHalfEven snaps float noise before the tie (0.00875/0.0025 = 3.5000000000000004 → 4; 0.0012/0.0025 → 0)', () => {
    expect(stepsHalfEven(0.00875, 0.0025)).toBe(4); expect(stepsHalfEven(0.00625, 0.0025)).toBe(2); expect(stepsHalfEven(-0.00625, 0.0025)).toBe(-2);
    expect(stepsHalfEven(0.0012, 0.0025)).toBe(0); expect(stepsHalfEven(0.0013, 0.0025)).toBe(1);
  });
});

describe('§3.6.4 step 7 votes', () => {
  it('tally: FOR iff |pref − i_new| ≤ 0.0025 (grid noise tolerated); dissent direction', () => {
    expect(tally([0.03, 0.0325, 0.0275, 0.035, 0.025, 0.0351, 0.0249, 0.03 + 0.0025000000000000022, 0.04], 0.03))
      .toEqual({ voteFor: 4, voteAgainst: 5, dissentHigher: 3, dissentLower: 2 });
    expect(tally([], 0.03)).toEqual({ voteFor: 0, voteAgainst: 0, dissentHigher: 0, dissentLower: 0 });
  });
  it('memberPreference = scheduledStep on the rule with hawk + o_j', () => {
    const d = pd({ piCb: 0.04 });
    for (const o of [-0.3, 0, 0.25]) {
      const c = coeffsFromHawk('FDL', 0.5 + o, 'DUAL', pv);
      expect(memberPreference(0.03, -0.02, d, 0.02, 0.045, 'FDL', 0.5, o, 'DUAL', 0, pv)).toBe(scheduledStep(0.03, ruleRate(-0.02, d, 0.02, 0.045, 'FDL', c).iStar, 0, 0.5, pv));
    }
    expect(memberPreference(0.03, -0.02, d, 0.02, 0.045, 'FDL', 0.5, 0.3, 'DUAL', 0, pv)).not.toBe(memberPreference(0.03, -0.02, d, 0.02, 0.045, 'FDL', 0.5, -0.3, 'DUAL', 0, pv));
  });
  it('04#12: 20 meetings — recomputed preferences from the saved offsets, hawk and data reproduce votes and minutes dissent', () => {
    const r = testRng('04#12');
    const w = world('m12', { cb: { hawkishness: 0.62, policyRate: 0.0025 * Math.round((BLOC_DEFAULTS.FDL.rStar0 + 0.02) / 0.0025), memberOffsets: [0.31, -0.22, 0.05, 0.4, -0.45, 0.12, -0.07, 0.27, -0.33] } });
    let total = 0, riskSeen = 0, downSeen = 0;
    for (let m = 0; m < 20; m++) {
      w.set(1000 + m * 91 * 720);
      (w.tables[macroTables.publicView.name]!.FDL as { prints: { CPI: { extra: { coreYoy: number } }; JOBS: { actual: number } } }).prints.CPI.extra.coreYoy = -0.02 + 0.08 * r.next();
      (w.tables[macroTables.publicView.name]!.FDL as { prints: { JOBS: { actual: number } } }).prints.JOBS.actual = 0.04 + 0.01 * r.next();
      const d = publishedData(w.ctx.store, 'FDL'), iStar = ruleRate(BLOC_DEFAULTS.FDL.rStar0, d, 0.02, 0.045, 'FDL', coeffsFromHawk('FDL', 0.62, 'DUAL', pv)).iStar;
      cbOf(w).policyRate = Math.max(0, 0.0025 * Math.round(iStar / 0.0025) + 0.0025 * ((m % 3) - 1));   // near the median's i*, so the offsets split
      const row = runMeeting(w.ctx, 'FDL', false, null) as CbDecisionRow;
      const prefs = memberPrefsOf(row, 'FDL', 'DUAL', pv), t = tally(prefs, row.newRate);
      expect([t.voteFor, t.voteAgainst]).toEqual([row.voteFor, row.voteAgainst]);
      expect(prefs).toEqual(row.offsetsAtMeeting.map((o) => memberPreference(row.previousRate, row.rStarCbAtMeeting, row.dataAtMeeting, 0.02, 0.045, 'FDL',
        row.hawkAtMeeting, o, 'DUAL', BLOC_DEFAULTS.FDL.elb, pv)));   // preferences are steps from the rate before the meeting
      expect(row.voteFor + row.voteAgainst).toBe(9);
      minutesAt(w.ctx, 'FDL', row.meetingId);
      const mins = w.emitted[w.emitted.length - 1]!;
      expect(mins.kind).toBe('macro.cb.minutes');
      expect(MACRO_EVENTS['macro.cb.minutes']!.safeParse(mins.payload).success).toBe(true);
      expect(assertNoHiddenFields(mins.payload)).toEqual([]);
      const dis = mins.payload.dissent as Record<string, number>;
      expect(Object.keys(dis)).toEqual(['higher', 'lower']);   // AC-04-06-MINUTES: exactly {higher, lower}
      expect(dis).toEqual({ higher: t.dissentHigher, lower: t.dissentLower });
      expect(dis).toEqual({ higher: row.dissentHigher, lower: row.dissentLower });
      expect(dis.higher! + dis.lower!).toBe(row.voteAgainst);
      const pub = w.emitted.find((e) => e.kind === 'macro.cb.decision' && e.payload.meetingId === row.meetingId)!.payload.ruleTerms as Record<string, number>;
      const ord = ['inflationGap', 'outputGap', 'finStress', 'fx'];
      const risk = ord.filter((k) => pub[k] !== 0).sort((a, b2) => Math.abs(pub[b2]!) - Math.abs(pub[a]!) || ord.indexOf(a) - ord.indexOf(b2))
        .map((k) => `cb.risk.${k}.${pub[k]! > 0 ? 'UP' : 'DOWN'}`);
      expect(mins.payload.riskKeys).toEqual(risk);
      for (const k of mins.payload.riskKeys as string[]) expect(k).toMatch(/^cb\.risk\.(inflationGap|outputGap|finStress|fx)\.(UP|DOWN)$/);
      if (risk.length > 0) { riskSeen++; if (risk.some((k) => k.endsWith('.DOWN'))) downSeen++; }
      total += row.voteAgainst;
    }
    expect(total).toBeGreaterThan(0);   // the offsets do produce dissent somewhere in 20 meetings
    expect(riskSeen).toBeGreaterThan(0); expect(downSeen).toBeGreaterThan(0);   // riskKeys: cb.risk.<term>.<UP|DOWN> over the published terms
  });
});

describe('runMeeting', () => {
  it('stores the decision (internal 0.01 pp ruleTerms + SEALED diagnostics), updates the rate, emits a schema-valid PUBLIC event without hidden fields', () => {
    const w = world('rm', { core: 0.035, x: 0.012, eps: -0.003 });
    const row = runMeeting(w.ctx, 'FDL', false, null) as CbDecisionRow;
    const cb = cbOf(w);
    expect(cb.policyRate).toBe(row.newRate); expect(cb.lastDecisions[0]).toBe(row);
    expect(row.hawkAtMeeting).toBe(0.5); expect(row.dataAtMeeting).toEqual(publishedData(w.ctx.store, 'FDL'));
    const c = coeffsFromHawk('FDL', 0.5, 'DUAL', pv), { iStar, terms } = ruleRate(BLOC_DEFAULTS.FDL.rStar0, row.dataAtMeeting, 0.02, 0.045, 'FDL', c);
    expect(row.ruleRate).toBe(iStar); expect(row.ruleTerms).toEqual(roundRuleTerms(terms, RULE_TERMS_INTERNAL));
    expect(row.newRate).toBe(scheduledStep(0.03, iStar, 0, 0.5, pv));
    const ev = w.emitted[0]!;
    expect(ev.kind).toBe('macro.cb.decision'); expect(ev.vis).toBe('PUBLIC');
    const sp = MACRO_EVENTS['macro.cb.decision']!.safeParse(ev.payload); expect(sp.success ? '' : JSON.stringify(sp.error.issues)).toBe('');
    expect(assertNoHiddenFields(ev.payload)).toEqual([]);
    expect(JSON.stringify(ev.payload)).not.toMatch(/hawk|dataAtMeeting|offsets/);
    expect(ev.payload.corridor).toEqual(corridorOf(row.newRate, false, 0.0025));
    expect(ev.payload.votes).toEqual({ for: row.voteFor, against: row.voteAgainst });
    expect(ev.payload.statementKey).toBe(row.statementKey);
  });
  it('QA #82: after a decision ĥ moves 0.2 toward impliedHawk (scheduled and emergency); no curve row → none written', () => {
    for (const [core, emergency, hWant] of [[0.02, false, 0.25], [0.025, false, 0.9], [0.04, true, 0]] as const) {
      const w = world(`hh${core}`, { core });
      w.tables[macroTables.curve.name] = { FDL: { id: 'FDL', hHat: 0.5 } };
      const data = publishedData(w.ctx.store, 'FDL');
      const row = runMeeting(w.ctx, 'FDL', emergency, emergency ? ['FSI'] : null);
      const h = impliedHawk(0.03, row.newRate, BLOC_DEFAULTS.FDL.rStar0, data, BLOC_DEFAULTS.FDL.inflationTarget, BLOC_DEFAULTS.FDL.nairu, 'FDL', cbOf(w).mandate, pv);
      const got = (w.tables[macroTables.curve.name]!.FDL as { hHat: number }).hHat;
      expect(h).toBeCloseTo(hWant, 9);
      expect(got).toBe(stepHHat(0.5, h));
      expect(got).not.toBe(0.5);
    }
    const w0 = world('hh0'); runMeeting(w0.ctx, 'FDL', false, null);
    expect(w0.tables[macroTables.curve.name]).toBeUndefined();
  });
  it('rStar bias enters r*_cb; a fresh guidance meetingId is reused once; guidance break costs 0.05 (plus MISS 0.03 when ≥ 2 steps off)', () => {
    const w = world('gb', { core: 0.0, cb: { rStarBias: 0.004, guidance: { meetingId: 'mtg_g', tick: 900, score: 0.5, impliedMove: 1, textKey: 'HAWKISH' } } });
    const row = runMeeting(w.ctx, 'FDL', false, null);
    expect(row.ruleTerms.neutral).toBeCloseTo(BLOC_DEFAULTS.FDL.rStar0 + 0.004, 4);
    expect(row.newRate).toBeLessThan(0.03);   // a cut after hawkish guidance
    expect(row.meetingId).toBe('mtg_g'); expect(row.statementKey).toMatch(/^cb\.stmt\.CUT\..*\.SURPRISE\./);
    expect(cbOf(w).credibility).toBeCloseTo(0.52, 15);   // BREAK −0.05 and, impliedMove +1 vs a cut (≥ 2 steps off, no release), MISS −0.03
    expect(freshGuidance(cbOf(w))).toBeNull();
    const row2 = runMeeting(w.ctx, 'FDL', false, null);
    expect(row2.meetingId).not.toBe('mtg_g'); expect(row2.statementKey).toMatch(/\.UNGUIDED\./);
    expect(cbOf(w).credibility).toBeCloseTo(0.52, 15);   // stale guidance: no second break
    const w2 = world('gb2', { core: 0.0, cb: { guidance: { meetingId: 'mtg_h', tick: 900, score: 0.24, impliedMove: 0, textKey: 'HAWKISH' } } });
    runMeeting(w2.ctx, 'FDL', false, null);
    expect(cbOf(w2).credibility).toBeCloseTo(0.57, 15);   // score < 0.25: no break; the ≥ 2-step cut against impliedMove 0 is a MISS (−0.03)
    const w3 = world('gb3', { core: 0.06, cb: { guidance: { meetingId: 'mtg_d', tick: 900, score: -0.25, impliedMove: -1, textKey: 'DOVISH' } } });
    expect(runMeeting(w3.ctx, 'FDL', false, null).newRate).toBeGreaterThan(0.03);
    expect(cbOf(w3).credibility).toBeCloseTo(0.52, 15);   // BREAK −0.05; a hike against impliedMove −1 is ≥ 2 steps off: MISS −0.03
  });
  it('AC-04-06-RULETERMS-PUBLIC: 1,000 seeded decisions — every published term ≡ 0 mod 0.0025, internal row at 0.01 pp and unchanged by publishing', () => {
    const r = testRng('pub');
    for (let k = 0; k < 1000; k++) {
      const b = BLOC_ORDER[k % 5]!;
      const w = world(`p${k}`, { b, core: -0.01 + 0.08 * r.next(), u: 0.02 + 0.08 * r.next(), x: -0.04 + 0.08 * r.next(), eps: -0.01 + 0.02 * r.next(),
        fsi: r.next(), dep: -0.3 + 0.6 * r.next(), cb: { hawkishness: r.next(), policyRate: 0.0025 * Math.floor(r.next() * 40) + BLOC_DEFAULTS[b].elb } });
      const row = runMeeting(w.ctx, b, false, null);
      const before = { ...row.ruleTerms };
      const pub = w.emitted[0]!.payload.ruleTerms as Record<string, number>;
      for (const [key, v] of Object.entries(pub)) {
        const q = v / 0.0025; expect(Math.abs(q - Math.round(q))).toBeLessThan(1e-9);
        const internal = (row.ruleTerms as Record<string, number>)[key]!, qi = internal / 0.0001;
        expect(Math.abs(qi - Math.round(qi))).toBeLessThan(1e-6);
      }
      expect(row.ruleTerms).toEqual(before);
      expect(pub.inflation).toBe(roundToQuarterPp(row.ruleTerms.inflation));
    }
  });
  it('AC-04-06-RULETERMS: internal 0.01 pp half-even, public 0.25 pp half-even', () => {
    const t = (v: number) => ({ neutral: v, inflation: v, inflationGap: v, outputGap: v, finStress: v, fx: v, bias: v });
    expect(roundRuleTerms(t(0.00125), RULE_TERMS_INTERNAL).bias).toBeCloseTo(0.0012, 15);
    expect(roundRuleTerms(t(0.00135), RULE_TERMS_INTERNAL).fx).toBeCloseTo(0.0014, 15);
    expect(roundRuleTerms(t(-0.00125), RULE_TERMS_INTERNAL).neutral).toBeCloseTo(-0.0012, 15);
    expect(roundToQuarterPp(0.0037)).toBe(0.0025); expect(roundToQuarterPp(0.00375)).toBe(0.005); expect(roundToQuarterPp(-0.0012)).toBe(0);
  });
  it('AC-04-06-GAPEST / AC-04-06-E2E-NOTRUEGAP: published outputGap = round(φ_x·x_cb(x̂)); the true x alone never moves the output', () => {
    let differs = 0;
    const r = testRng('gap');
    for (let k = 0; k < 200; k++) {
      const x = -0.03 + 0.06 * r.next(), eps = -0.01 + 0.02 * r.next(), core = 0.01 + 0.04 * r.next(), u = 0.03 + 0.03 * r.next();
      const a = world(`g${k}`, { x, eps, core, u }), b = world(`g${k}`, { x: x + 0.02, eps: eps - 0.02, core, u });   // same x̂, different true x
      const ra = runMeeting(a.ctx, 'FDL', false, null), rb = runMeeting(b.ctx, 'FDL', false, null);
      expect(a.emitted[0]!.payload).toEqual(b.emitted[0]!.payload); expect(ra.newRate).toBe(rb.newRate);
      const c = coeffsFromHawk('FDL', 0.5, 'DUAL', pv);
      const gapPub = (a.emitted[0]!.payload.ruleTerms as { outputGap: number }).outputGap;
      expect(gapPub).toBe(roundToQuarterPp(c.phiX * cbOutputGap(pd({ xGdpPub: x + eps, uPub: u }), 0.045)));
      const mutant = roundToQuarterPp(c.phiX * cbOutputGap(pd({ xGdpPub: x, uPub: u }), 0.045));   // coef × true-gap mutant
      if (mutant !== gapPub) differs++;
      expect(assertNoHiddenFields(a.emitted[0]!.payload)).toEqual([]);
    }
    expect(differs).toBeGreaterThan(0);
  });
});

describe('T04-06 edges (mutation follow-ups)', () => {
  it('hold band is 12.5 bp: Δraw 14 bp moves one step (+25 bp); Δraw 12 bp holds', () => {
    expect(scheduledStep(0.03, 0.0328, 0, 0.5, pv)).toBe(0.0325);
    expect(scheduledStep(0.03, 0.0324, 0, 0.5, pv)).toBe(0.03);
  });
  it('an emergency meeting does not take the fresh guidance meetingId; the next scheduled meeting still reuses it', () => {
    const w = world('em-g', { core: 0.03 });
    const gd = guidanceAt(w.ctx, 'FDL');
    expect(runMeeting(w.ctx, 'FDL', true, ['FSI']).meetingId).not.toBe(gd.meetingId);
    expect(runMeeting(w.ctx, 'FDL', false, null).meetingId).toBe(gd.meetingId);
  });
  it('guidance break at the score edge: score exactly 0.25 then a cut costs 0.05 (+ MISS 0.03)', () => {
    const w = world('gb25', { core: 0.0, cb: { guidance: { meetingId: 'mtg_g', tick: 900, score: 0.25, impliedMove: 1, textKey: 'HAWKISH' } } });
    const row = runMeeting(w.ctx, 'FDL', false, null);
    expect(row.newRate).toBeLessThan(0.03);
    expect(cbOf(w).credibility).toBeCloseTo(0.52, 15);
  });
  it('lastDecisions is newest first', () => {
    const w = world('ld', { core: 0.04 });
    const a = runMeeting(w.ctx, 'FDL', false, null); w.set(1000 + 91 * 720);
    const b = runMeeting(w.ctx, 'FDL', false, null);
    expect(cbOf(w).lastDecisions[0]).toBe(b); expect(cbOf(w).lastDecisions[1]).toBe(a);
  });
  it('guidance score uses the bloc clarity (unclamped case, every bloc)', () => {
    for (const b of BLOC_ORDER) {
      const w = world('clar', { b, core: BLOC_DEFAULTS[b].inflationTarget, u: BLOC_DEFAULTS[b].nairu, x: 0, eps: 0,
        cb: { policyRate: BLOC_DEFAULTS[b].rStar0 + BLOC_DEFAULTS[b].inflationTarget } });
      const gd = guidanceAt(w.ctx, b);
      const eps = testRng(`clar|${S.cbDecision(b)}`).normal();
      expect(Math.abs(gd.score)).toBeLessThan(1);
      expect(gd.score).toBe(guidanceScore(gd.impliedMove, BLOC_DEFAULTS[b].personality.communicationClarity, eps));
      if (BLOC_DEFAULTS[b].personality.communicationClarity !== 0.5) expect(gd.score).not.toBe(guidanceScore(gd.impliedMove, 0.5, eps));
    }
  });
  it('dots: each quarter decays π_cb (half-life 0.75 y), x and u (0.5 y), FSI toward 0.2 (0.25 y), dep_q = depYoy·max(0, 1 − q/4); 500 seeded cases replicated exactly', () => {
    const r = testRng('dots-rep');
    const fPi = dmath.pow(2, -0.25 / 0.75), fX = dmath.pow(2, -0.25 / 0.5), fFsi = dmath.pow(2, -0.25 / 0.25);
    for (let k = 0; k < 500; k++) {
      const b = BLOC_ORDER[k % BLOC_ORDER.length]!, d0 = BLOC_DEFAULTS[b];
      const c = coeffsFromHawk(b, 0.2 + 0.6 * r.next(), d0.mandate, pv), rs = d0.rStar0;
      let data = pd({ piCb: -0.01 + 0.08 * r.next(), xGdpPub: -0.04 + 0.08 * r.next(), uPub: 0.02 + 0.06 * r.next(), fsi: r.next(), depYoy: -0.3 + 0.6 * r.next() });
      const dep0 = data.depYoy;
      const i0 = 0.0025 * Math.floor(40 * r.next());
      const got = dots(i0, rs, data, d0.inflationTarget, d0.nairu, b, c, d0.elb, pv);
      let rate = i0; const want: { horizonQuarters: 1 | 2 | 4 | 8; rate: number }[] = [];
      for (let q = 1; q <= 8; q++) {
        data = { piCb: d0.inflationTarget + (data.piCb - d0.inflationTarget) * fPi, xGdpPub: data.xGdpPub * fX, uPub: d0.nairu + (data.uPub - d0.nairu) * fX,
          fsi: 0.2 + (data.fsi - 0.2) * fFsi, depYoy: dep0 * Math.max(0, 1 - q / 4) };
        rate = scheduledStep(rate, ruleRate(rs, data, d0.inflationTarget, d0.nairu, b, c).iStar, d0.elb, c.rho, pv);
        if (q === 1 || q === 2 || q === 4 || q === 8) want.push({ horizonQuarters: q, rate });
      }
      expect(got).toEqual(want);
    }
  });
});

describe('guidanceAt', () => {
  it('one normal() on S.cbDecision; stores guidance + dots; emits a schema-valid PUBLIC macro.cb.guidance; the next decision reuses its meetingId', () => {
    const w = world('ga', { core: 0.04 });
    const gd = guidanceAt(w.ctx, 'FDL');
    expect(w.draws).toEqual({ [S.cbDecision('FDL')]: 1 });
    const d = publishedData(w.ctx.store, 'FDL'), c = coeffsFromHawk('FDL', 0.5, 'DUAL', pv), rs = BLOC_DEFAULTS.FDL.rStar0;
    const move = impliedMove(0.03, ruleRate(rs, d, 0.02, 0.045, 'FDL', c).iStar, 0.5);
    const eps = testRng(`ga|${S.cbDecision('FDL')}`).normal();
    expect(gd.impliedMove).toBe(move); expect(gd.score).toBe(guidanceScore(move, BLOC_DEFAULTS.FDL.personality.communicationClarity, eps));
    expect(gd.textKey).toBe(guidanceTextKey(gd.score)); expect(gd.tick).toBe(1000);
    expect(cbOf(w).guidance).toEqual(gd); expect(cbOf(w).dots).toEqual(dots(0.03, rs, d, 0.02, 0.045, 'FDL', c, 0, pv));
    expect(w.emitted).toEqual([{ kind: 'macro.cb.guidance', payload: { bloc: 'FDL', meetingId: gd.meetingId, score: gd.score, textKey: gd.textKey }, vis: 'PUBLIC' }]);
    expect(MACRO_EVENTS['macro.cb.guidance']!.safeParse(w.emitted[0]!.payload).success).toBe(true);
    expect(assertNoHiddenFields(w.emitted[0]!.payload)).toEqual([]);
    expect(runMeeting(w.ctx, 'FDL', false, null).meetingId).toBe(gd.meetingId);
    expect(runMeeting(w.ctx, 'FDL', true, ['FSI']).meetingId).not.toBe(gd.meetingId);
  });
});

describe('§3.6.6 emergencies', () => {
  const base = { fsi: 0.2, eqDrop5d: 0, interbankSpread: 0, fxDrop3d: 0, bloc: 'FDL' as BlocId, majorPolicyHere: false };
  it('triggers at their thresholds; currency only for SRL/PYN; null history never fires', () => {
    expect(emergencyTriggers({ ...base, fsi: 0.72 })).toEqual(['FSI']);
    expect(emergencyTriggers({ ...base, fsi: 0.7 })).toEqual(['FSI']); expect(emergencyTriggers({ ...base, fsi: 0.6999 })).toEqual([]);
    expect(emergencyTriggers({ ...base, eqDrop5d: 0.15 })).toEqual(['EQUITY_DROP']); expect(emergencyTriggers({ ...base, eqDrop5d: 0.1499 })).toEqual([]);
    expect(emergencyTriggers({ ...base, interbankSpread: 0.015 })).toEqual(['INTERBANK']); expect(emergencyTriggers({ ...base, interbankSpread: 0.0149 })).toEqual([]);
    expect(emergencyTriggers({ ...base, fxDrop3d: 0.2 })).toEqual([]);
    expect(emergencyTriggers({ ...base, bloc: 'SRL', fxDrop3d: 0.10 })).toEqual(['CURRENCY']); expect(emergencyTriggers({ ...base, bloc: 'PYN', fxDrop3d: 0.11 })).toEqual(['CURRENCY']);
    expect(emergencyTriggers({ ...base, bloc: 'SRL', fxDrop3d: 0.0999 })).toEqual([]);
    expect(emergencyTriggers({ ...base, majorPolicyHere: true })).toEqual(['CRISIS_POLICY']);
    expect(emergencyTriggers({ ...base, bloc: 'SRL', eqDrop5d: null, interbankSpread: null, fxDrop3d: null })).toEqual([]);
    expect(emergencyTriggers({ fsi: 0.9, eqDrop5d: 0.2, interbankSpread: 0.02, fxDrop3d: 0.3, bloc: 'PYN', majorPolicyHere: true }))
      .toEqual(['FSI', 'EQUITY_DROP', 'INTERBANK', 'CURRENCY', 'CRISIS_POLICY']);
  });
  it('sizes: cut in [−0.01, 0] with ρ = 1, floored at the ELB; FX defence in [+0.01, +0.05]', () => {
    expect(emergencyStep(0.03, 0.0, 0, 'CUT', pv)).toBeCloseTo(0.02, 15);
    expect(emergencyStep(0.03, 0.025, 0, 'CUT', pv)).toBeCloseTo(0.025, 15);
    expect(emergencyStep(0.03, 0.04, 0, 'CUT', pv)).toBe(0.03);
    expect(emergencyStep(0.005, -0.05, 0, 'CUT', pv)).toBe(0);
    expect(emergencyStep(0.10, 0.102, 0.005, 'FX_DEFENCE', pv)).toBeCloseTo(0.11, 15);
    expect(emergencyStep(0.10, 0.13, 0.005, 'FX_DEFENCE', pv)).toBeCloseTo(0.13, 15);
    expect(emergencyStep(0.10, 0.30, 0.005, 'FX_DEFENCE', pv)).toBeCloseTo(0.15, 15);
    expect(emergencyStep(0.10, 0.05, 0.005, 'FX_DEFENCE', pv)).toBeCloseTo(0.11, 15);
  });
  it('SRL currency emergency with i* − i = 0.002 → +0.01, credibility +0.05; the meeting clears pendingEmergency and leaves the count alone', () => {
    const b: BlocId = 'SRL', d0 = BLOC_DEFAULTS.SRL;
    const w = world('srl', { b, cb: { policyRate: 0.10, emergencyQuarter: 0, emergencyCountQuarter: 1, pendingEmergency: { tick: 1045, triggers: ['CURRENCY'] } }, core: 0.04 });
    const data = publishedData(w.ctx.store, b), c = coeffsFromHawk(b, 0.5, d0.mandate, pv);
    const need = 0.10 + 0.002 - ruleRate(d0.rStar0, data, d0.inflationTarget, d0.nairu, b, c).iStar;   // shift r*_cb so i* − i = 0.002
    (w.tables[macroTables.bloc.name]!.SRL as { rStar: number }).rStar += need;
    const row = runMeeting(w.ctx, b, true, ['CURRENCY']);
    expect(row.newRate).toBeCloseTo(0.11, 15); expect(row.emergency).toBe(true);
    expect(row.reasons).toEqual(['cb.reason.emergency.CURRENCY']);
    expect(cbOf(w, b).credibility).toBeCloseTo(0.65, 15);
    expect(row.statementKey).toMatch(/^cb\.stmt\.HIKE\.SIZE100\.UNGUIDED\./);
    expect(cbOf(w, b).emergencyCountQuarter).toBe(1); expect(cbOf(w, b).emergencyQuarter).toBe(0);   // counted at booking, not here
    expect(cbOf(w, b).pendingEmergency).toBeNull();
    cbOf(w, b).pendingEmergency = { tick: 9e6, triggers: ['FSI'] };
    runMeeting(w.ctx, b, false, null);
    expect(cbOf(w, b).pendingEmergency).toEqual({ tick: 9e6, triggers: ['FSI'] });   // a scheduled meeting leaves a booking alone
    runMeeting(w.ctx, b, true, ['FSI']);   // FSI emergency in SRL is a cut
    expect(cbOf(w, b).policyRate).toBeLessThanOrEqual(0.11); expect(cbOf(w, b).pendingEmergency).toBeNull();
  });
  it('emergency in FDL with CURRENCY in the list is a cut, not a defence; no credibility bonus', () => {
    const w = world('fdlc', { core: 0.0 });
    const row = runMeeting(w.ctx, 'FDL', true, ['CURRENCY', 'FSI']);
    expect(row.newRate).toBeLessThan(0.03); expect(row.newRate).toBeGreaterThanOrEqual(0.02 - 1e-15);
    expect(cbOf(w).credibility).toBe(0.6);
    expect(row.reasons).toEqual(['cb.reason.emergency.CURRENCY', 'cb.reason.emergency.FSI']);
  });
  it('AC-04-06-PENDING: FSI at a day close books the next trading day t = 45; a pending booking merges triggers; quarter of the meeting day; 2 per quarter', () => {
    const w = world('pe');
    w.set(3 * 720 + 700);   // day 3 (Thu) close
    expect(scheduleEmergency(w.ctx, 'FDL', [], w.ctx.tick)).toBe(false);
    expect(cbOf(w).pendingEmergency).toBeNull();
    expect(scheduleEmergency(w.ctx, 'FDL', ['FSI'], w.ctx.tick)).toBe(true);
    expect(cbOf(w).pendingEmergency).toEqual({ tick: 4 * 720 + 45, triggers: ['FSI'] });
    expect([cbOf(w).emergencyCountQuarter, cbOf(w).emergencyQuarter]).toEqual([1, 0]);
    expect(scheduleEmergency(w.ctx, 'FDL', ['CRISIS_POLICY', 'EQUITY_DROP', 'FSI'], w.ctx.tick)).toBe(false);   // merge, books nothing
    expect(cbOf(w).pendingEmergency).toEqual({ tick: 4 * 720 + 45, triggers: ['FSI', 'EQUITY_DROP', 'CRISIS_POLICY'] });
    expect(cbOf(w).emergencyCountQuarter).toBe(1);
    const snap = structuredClone(cbOf(w));   // the row is plain data: survives a snapshot/restore round trip
    expect(snap).toEqual(cbOf(w)); w.tables[macroTables.cb.name]![cbkId('FDL')] = snap;
    w.set(4 * 720 + 45);
    runMeeting(w.ctx, 'FDL', true, cbOf(w).pendingEmergency!.triggers);
    expect(cbOf(w).pendingEmergency).toBeNull(); expect(cbOf(w).emergencyCountQuarter).toBe(1);
    expect(scheduleEmergency(w.ctx, 'FDL', ['INTERBANK'], 10 * 720 + 700)).toBe(true);   // second in quarter 0
    expect(cbOf(w).emergencyCountQuarter).toBe(2);
    w.tables[macroTables.cb.name]![cbkId('FDL')] = { ...cbOf(w), pendingEmergency: null };
    const before = structuredClone(w.tables);
    expect(scheduleEmergency(w.ctx, 'FDL', ['FSI'], 20 * 720 + 700)).toBe(false);   // third in quarter 0: no change
    expect(w.tables).toEqual(before);
    expect(scheduleEmergency(w.ctx, 'FDL', ['FSI'], 88 * 720 + 700)).toBe(true);   // day 88 = last trading day of q0 (Fri) → Mon day 91, q1
    expect(cbOf(w).pendingEmergency!.tick).toBe(91 * 720 + 45);
    expect([cbOf(w).emergencyCountQuarter, cbOf(w).emergencyQuarter]).toEqual([1, 1]);
  });
  it('AC-04-06-PENDING: booked triggers are stored in declaration order (FSI, EQUITY_DROP, INTERBANK, CURRENCY, CRISIS_POLICY)', () => {
    const w = world('pe4');
    expect(scheduleEmergency(w.ctx, 'FDL', ['CRISIS_POLICY', 'CURRENCY', 'FSI'], 3 * 720 + 700)).toBe(true);
    expect(cbOf(w).pendingEmergency!.triggers).toEqual(['FSI', 'CURRENCY', 'CRISIS_POLICY']);
  });
  it('AC-04-06-PENDING: the max per quarter is the param; a stale quarter count restarts at 0', () => {
    const w = world('pe2', { cb: { emergencyQuarter: 2, emergencyCountQuarter: 2 } });
    expect(scheduleEmergency(w.ctx, 'FDL', ['FSI'], 3 * 720)).toBe(true);
    expect([cbOf(w).emergencyCountQuarter, cbOf(w).emergencyQuarter]).toEqual([1, 0]);
    const w2 = world('pe3', { cb: { emergencyQuarter: 0, emergencyCountQuarter: 1 } });
    expect(scheduleEmergency(w2.ctx, 'FDL', ['FSI'], 3 * 720)).toBe(true);
    expect(cbOf(w2).emergencyCountQuarter).toBe(2);
  });
});

describe('§3.6.7 credibility', () => {
  const on = { piE5: 0.02, piCore: 0.02, target: 0.02, offTargetDays: 0, qeActive: false };
  it('gain when both on target; 182 off-target days no loss, day 183 loss 0.30·cred/364; QE loss; clamps', () => {
    expect(stepCredibility(0.5, on)).toBeCloseTo(0.5 + 0.10 * 0.5 / 364, 15);
    expect(stepCredibility(0.5, { ...on, piE5: 0.025 })).toBe(0.5);
    expect(stepCredibility(0.5, { ...on, piCore: 0.031 })).toBe(0.5);
    expect(stepCredibility(0.5, { ...on, piCore: 0.0305 })).toBe(0.5);   // |π_core − π*| < 1 pp is strict (0.0105 off: no gain)
    expect(stepCredibility(0.5, { ...on, piCore: 0.05, offTargetDays: 182 })).toBe(0.5);
    expect(stepCredibility(0.5, { ...on, piCore: 0.05, offTargetDays: 183 })).toBeCloseTo(0.5 - 0.30 * 0.5 / 364, 15);
    expect(stepCredibility(0.5, { ...on, piCore: 0.0401, qeActive: true })).toBeCloseTo(0.5 - 0.10 * 0.5 / 364, 15);
    expect(stepCredibility(0.5, { ...on, piCore: 0.04, qeActive: true })).toBe(0.5);
    expect(stepCredibility(0.98, on)).toBe(0.98); expect(stepCredibility(0.05, { ...on, piCore: 0.1, offTargetDays: 999, qeActive: true })).toBe(0.05);
    expect(stepCredibility(0.5, { ...on, piCore: 0.1, offTargetDays: 999, qeActive: true })).toBeCloseTo((0.5 - 0.15 / 364) * (1 - 0.1 / 364), 15);
  });
  it('one-offs: guidance break −0.05 (param), miss −0.03, defence +0.05, peg/YCC −0.10, new governor 0.05 toward credibility0, clamps', () => {
    expect(credibilityOneOff(0.5, 'GUIDANCE_BREAK', undefined, pv)).toBeCloseTo(0.45, 15);
    expect(() => credibilityOneOff(0.5, 'GUIDANCE_BREAK')).toThrow(/needs params/);
    expect(credibilityOneOff(0.5, 'GUIDANCE_MISS')).toBeCloseTo(0.47, 15);
    expect(credibilityOneOff(0.5, 'DEFENCE_HIKE')).toBeCloseTo(0.55, 15);
    expect(credibilityOneOff(0.5, 'PEG_BREAK')).toBeCloseTo(0.4, 15); expect(credibilityOneOff(0.5, 'YCC_ABANDON')).toBeCloseTo(0.4, 15);
    expect(credibilityOneOff(0.5, 'NEW_GOVERNOR', 0.8)).toBeCloseTo(0.55, 15); expect(credibilityOneOff(0.5, 'NEW_GOVERNOR', 0.2)).toBeCloseTo(0.45, 15);
    expect(credibilityOneOff(0.5, 'NEW_GOVERNOR', 0.53)).toBe(0.53); expect(credibilityOneOff(0.5, 'NEW_GOVERNOR', 0.47)).toBe(0.47);
    expect(() => credibilityOneOff(0.5, 'NEW_GOVERNOR')).toThrow(/credibility0/);
    expect(credibilityOneOff(0.97, 'DEFENCE_HIKE')).toBe(0.98); expect(credibilityOneOff(0.1, 'PEG_BREAK')).toBe(0.05);
  });
});


describe('E-100 acceptance', () => {
  it('AC-04-06-STMTKEY: an emergency meeting is UNGUIDED even with a fresh guidance; +125 bp FX defence → LARGE; no guidance one-off', () => {
    const b: BlocId = 'SRL', d0 = BLOC_DEFAULTS.SRL;
    const w = world('stk', { b, cb: { policyRate: 0.10, guidance: { meetingId: 'mtg_g', tick: 900, score: -0.9, impliedMove: -2, textKey: 'VERY_DOVISH' } }, core: 0.04 });
    const data = publishedData(w.ctx.store, b), c = coeffsFromHawk(b, 0.5, d0.mandate, pv);
    (w.tables[macroTables.bloc.name]!.SRL as { rStar: number }).rStar += 0.1125 - ruleRate(d0.rStar0, data, d0.inflationTarget, d0.nairu, b, c).iStar;
    const row = runMeeting(w.ctx, b, true, ['CURRENCY']);
    expect(row.newRate).toBeCloseTo(0.1125, 15);
    expect(row.statementKey).toMatch(/^cb\.stmt\.HIKE\.LARGE\.UNGUIDED\./);
    expect(cbOf(w, b).credibility).toBeCloseTo(0.65, 15);   // DEFENCE_HIKE only: no BREAK / MISS against the dovish guidance
  });
  it('AC-04-06-CORRIDOR: FDL i_new 0.0025 → deposit 0, lending 0.005; EUN may go negative', () => {
    expect(corridorOf(0.0025, false, 0.0025)).toEqual({ depositRate: 0, lendingRate: 0.005 });
    expect(corridorOf(-0.0025, true, 0.0025)).toEqual({ depositRate: -0.005, lendingRate: 0 });
    expect(corridorOf(0.03, false, 0.0025)).toEqual({ depositRate: 0.03 - 0.0025, lendingRate: 0.03 + 0.0025 });
    expect(corridorOf(0.001, false, 0.0025).depositRate).toBe(0);
    const w = world('cor', { core: -0.02, x: -0.03, cb: { policyRate: 0.005 } });
    const row = runMeeting(w.ctx, 'FDL', false, null);
    expect(row.newRate).toBeLessThan(0.0025);   // FDL floored at its ELB: deposit floored at 0
    expect(w.emitted[0]!.payload.corridor).toEqual({ depositRate: 0, lendingRate: row.newRate + 0.0025 });
    const e = world('cor-e', { b: 'EUN', core: -0.02, x: -0.03, cb: { policyRate: 0 } });
    const re = runMeeting(e.ctx, 'EUN', false, null);
    expect(re.newRate).toBeLessThan(0);
    expect(e.emitted[0]!.payload.corridor).toEqual(corridorOf(re.newRate, true, 0.0025));
    expect((e.emitted[0]!.payload.corridor as { depositRate: number }).depositRate).toBeLessThan(0);
  });
  it('AC-04-06-GMISS: 2 steps off impliedMove with no release → −0.03; a release |surprise| 2.1 in (guidanceTick, meetingTick] → no change', () => {
    const gd = { meetingId: 'mtg_m', tick: 900, score: 0.1, impliedMove: 0 as const, textKey: 'NEUTRAL' };
    const mk = (seed: string) => world(seed, { core: 0.06, x: 0.03, cb: { guidance: { ...gd } } });   // a big hike against a hold guidance
    const w = mk('gm');
    const row = runMeeting(w.ctx, 'FDL', false, null);
    expect(stepsHalfEven(row.newRate - row.previousRate, 0.0025)).toBeGreaterThanOrEqual(2);
    expect(row.statementKey).toMatch(/\.SURPRISE\./);
    expect(cbOf(w).credibility).toBeCloseTo(0.57, 15);
    const rel = (id: string, releasedTick: number, surprise: number, bloc: BlocId = 'FDL') => ({ id, bloc, releasedTick, surprise }) as unknown as DataRelease;
    const w2 = mk('gm2');
    w2.tables[macroTables.release.name] = { r1: rel('r1', 950, 2.1) };
    runMeeting(w2.ctx, 'FDL', false, null);
    expect(cbOf(w2).credibility).toBe(0.6);
    for (const [r, want] of [[rel('r', 900, 2.1), 0.57], [rel('r', 1000, -2.1), 0.6], [rel('r', 1001, 5), 0.57], [rel('r', 950, 1.99), 0.57], [rel('r', 950, 2.1, 'EUN'), 0.57]] as const) {
      const w3 = mk('gm3'); w3.tables[macroTables.release.name] = { r };
      runMeeting(w3.ctx, 'FDL', false, null);
      expect(cbOf(w3).credibility).toBeCloseTo(want, 15);
    }
    const s0 = mk('gm4').ctx.store;
    expect(guidanceMissed(s0, 'FDL', { ...gd, impliedMove: 1 }, 2, 1000)).toBe(false);   // 1 step off: no miss
    expect(guidanceMissed(s0, 'FDL', { ...gd, impliedMove: 1 }, -1, 1000)).toBe(true);
    expect(guidanceMissed(s0, 'FDL', { ...gd, impliedMove: -2 }, 0, 1000)).toBe(true);
  });
  it('AC-04-06-DOTS: 04#18 scenario (FDL i 0.0275, π_cb 0.0244721, x 0, FSI 0.2, hawk 0.5) → 0.0300 at 1, 2, 4, 8', () => {
    const d0 = BLOC_DEFAULTS.FDL, c = coeffsFromHawk('FDL', 0.5, 'DUAL', pv);
    const out = dots(0.0275, d0.rStar0, pd({ piCb: 0.0244721, xGdpPub: 0, uPub: d0.nairu, fsi: 0.2 }), d0.inflationTarget, d0.nairu, 'FDL', c, d0.elb, pv);
    expect(out.map((x) => x.horizonQuarters)).toEqual([1, 2, 4, 8]);
    for (const x of out) expect(x.rate).toBeCloseTo(0.03, 15);
  });
  it('AC-04-06-MINUTES: riskKeysOf sorts by |published| desc, ties inflationGap, outputGap, finStress, fx; excludes neutral, inflation, bias', () => {
    const base = { hawkAtMeeting: 0.5, dataAtMeeting: pd({ xGdpPub: 0, uPub: 0.045 }) } as unknown as CbDecisionRow;
    const row = (t: Partial<CbDecisionRow['ruleTerms']>) => ({ ...base, ruleTerms: { neutral: 0.01, inflation: 0.03, inflationGap: 0, outputGap: 0, finStress: 0, fx: 0, bias: 0.01, ...t } });
    expect(riskKeysOf(row({}), 'FDL', 'DUAL', pv)).toEqual([]);
    expect(riskKeysOf(row({ inflationGap: 0.0025, finStress: -0.005, fx: 0.0025 }), 'FDL', 'DUAL', pv))
      .toEqual(['cb.risk.finStress.DOWN', 'cb.risk.inflationGap.UP', 'cb.risk.fx.UP']);
    expect(riskKeysOf(row({ fx: -0.0025, finStress: 0.0025, inflationGap: 0.001 }), 'FDL', 'DUAL', pv)).toEqual(['cb.risk.finStress.UP', 'cb.risk.fx.DOWN']);
    const gap = { ...row({ fx: 0.0025 }), dataAtMeeting: pd({ xGdpPub: 0.01, uPub: 0.045 }) };   // φ_x·x_cb = 0.5·0.005 → 0.0025, from the row data
    expect(riskKeysOf(gap, 'FDL', 'DUAL', pv)).toEqual(['cb.risk.outputGap.UP', 'cb.risk.fx.UP']);
  });
});
