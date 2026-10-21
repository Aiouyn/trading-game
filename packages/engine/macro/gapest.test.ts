// T04-01b acceptance tests: region slugs, outputGapEstimate AR(1), exact public ruleTerms (E-41 B2, E-45, E-54).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { PhaseCtx, Rng } from './core-port';
import { BLOC_DEFAULTS, blocDef } from './blocs';
import { assertNoHiddenFields, HIDDEN_FIELD_NAMES, MACRO_EVENTS } from './events';
import { GAPEST_INNOVATION, GAPEST_RHO, GAPEST_SIGMA, genesisOutputGapEstimate, publicRuleTerms, roundToQuarterPp, RULE_TERMS_KEYS, stepOutputGapEstimate } from './gapest';
import { blocOfRegionSlug, type RegionSlug } from './regionSlug';
import { BLOC_ORDER, macroTables, type BlocId } from './schema';

/** Test-only deterministic Rng (splitmix64 + Box-Muller); the engine's T02-06 Rng is not on main. */
function testRng(seed: string): Rng {
  let s = 0n; for (const c of seed) s = (s * 131n + BigInt(c.charCodeAt(0))) & 0xffffffffffffffffn;
  const next64 = (): bigint => { s = (s + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn; let z = s;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn; z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn; return z ^ (z >> 31n); };
  const u = (): number => (Number(next64() >> 11n) + 0.5) / 2 ** 53;
  const no = (): never => { throw new Error('not used'); };
  return { next: u, u53: u, uOpen: u, int: no, bernoulli: no, normal: () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()),
    studentT: no, exponential: no, poisson: no, kouJump: no, categorical: no, shuffle: no } as Rng;
}
/** Synthetic true gap path (deterministic, not from the engine): a slow cycle. */
const trueGap = (b: number, d: number): number => 0.01 * Math.sin((d + 37 * b) / 90);
interface World { ctx: PhaseCtx; rows: Record<string, Record<string, unknown>>; streamsUsed: string[] }
function world(seed: string): World {
  const rows: Record<string, Record<string, unknown>> = {};
  for (const b of BLOC_ORDER) rows[b] = { id: b, bloc: b, outputGap: 0, regime: 'EXPANSION', gapEstNoise: 0, rStar: 0.01 };   // gapEstNoise set at genesis
  const streams: Record<string, Rng> = {}, used: string[] = [];
  const store = { get: (_t: string, id: string) => rows[id], put: (t: string, e: { id: string }) => { expect(t).toBe(macroTables.bloc.name); rows[e.id] = e as never; },
    del: () => undefined, iter: () => [], range: () => [], index: () => [], count: () => 0 };
  const ctx = { newId: () => 'x', params: { num: () => 0, int: () => 0 }, store,
    rng: (k: string) => { used.push(k); return (streams[k] ??= testRng(`${seed}|${k}`)); } } as unknown as PhaseCtx;
  for (const [i, b] of BLOC_ORDER.entries()) genesisOutputGapEstimate(ctx, b, trueGap(i, -1));
  return { ctx, rows, streamsUsed: used };
}

describe('T04-01b', () => {
  it('AC-04-01-SLUG: region slugs → canonical blocs; unknown throws; defaults keyed by canonical codes; E-41 B1 sectorWeights sum to 1', () => {
    const want: [RegionSlug, BlocId][] = [['avalon', 'FDL'], ['meridian', 'EUN'], ['kaiyo', 'PYN'], ['nordhaven', 'NKR'], ['sundara', 'SRL']];
    for (const [s, b] of want) expect(blocOfRegionSlug(s)).toBe(b);
    for (const bad of ['meridia', 'FU', 'Avalon', 'FDL', '']) { let code = ''; try { blocOfRegionSlug(bad as RegionSlug); } catch (e) { code = (e as { code: string }).code; } expect(code).toBe('I0.macro_region_slug'); }
    expect(Object.getOwnPropertyNames(BLOC_DEFAULTS).sort()).toEqual(['EUN', 'FDL', 'NKR', 'PYN', 'SRL']);
    for (const k of Object.getOwnPropertyNames(BLOC_DEFAULTS)) expect(['FU', 'EC', 'PL', 'NA', 'SC', 'avalon', 'meridian', 'kaiyo', 'nordhaven', 'sundara']).not.toContain(k);
    // E-41 B1 values rekeyed by E-45 (T04-01 step 7b, PROVISIONAL [Quant]); content supplies them, blocDef validates the sum
    const W: Record<BlocId, number[]> = {
      FDL: [0.162, 0.080, 0.061, 0.028, 0.096, 0.121, 0.090, 0.085, 0.117, 0.078, 0.035, 0.047],
      EUN: [0.049, 0.033, 0.121, 0.058, 0.103, 0.132, 0.146, 0.114, 0.146, 0.050, 0.018, 0.030],
      PYN: [0.105, 0.219, 0.057, 0.028, 0.082, 0.098, 0.077, 0.055, 0.183, 0.056, 0.020, 0.020],
      NKR: [0.100, 0.198, 0.071, 0.048, 0.094, 0.105, 0.080, 0.063, 0.111, 0.068, 0.029, 0.033],
      SRL: [0.131, 0.047, 0.066, 0.252, 0.070, 0.081, 0.078, 0.097, 0.070, 0.066, 0.022, 0.020] };
    const content = { blocs: () => BLOC_ORDER.map((b) => ({ id: b, name: b, cityIds: ['a', 'b', 'c'], statisticsOfficeNameKey: 's', cycleCommitteeNameKey: 'c', sectorWeights: W[b] })) };
    for (const b of BLOC_ORDER) { expect(Math.abs(W[b].reduce((s, x) => s + x, 0) - 1)).toBeLessThan(1e-9); expect(blocDef(content as never, b).sectorWeights).toEqual(W[b]); }
  });

  it('AC-04-01-GAPEST-STATS: stationary σ within ±10% of 0.005, lag-1 autocorrelation within ±10% of 0.98 (5 blocs × 4,000 GD pooled, no burn-in)', () => {
    const w = world('stats');
    let n = 0, s2 = 0, c1 = 0, c0 = 0;
    for (const [i, b] of BLOC_ORDER.entries()) {
      let prev: number | null = w.rows[b]!.gapEstNoise as number;
      for (let d = 0; d < 4000; d++) {
        const x = trueGap(i, d), e = stepOutputGapEstimate(w.ctx, b, x) - x;
        expect(w.rows[b]!.gapEstNoise).toBeCloseTo(e, 15);
        n++; s2 += e * e; if (prev !== null) { c1 += prev * e; c0 += prev * prev; }   // ε0 is stationary (genesis draw): no burn-in
        prev = e;
      }
    }
    const sigma = Math.sqrt(s2 / n), rho = c1 / c0;
    expect(n).toBeGreaterThanOrEqual(10_000);
    expect(Math.abs(sigma / GAPEST_SIGMA - 1)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(rho / GAPEST_RHO - 1)).toBeLessThanOrEqual(0.1);
    expect(rho).toBeGreaterThan(0.95);   // tighter than ±10% so a ρ mutant (e.g. 0.9) cannot pass
  });

  it('AC-04-01b-GAPEST-INIT: ε0 = 0.005 × the first draw of macro.gapest:<bloc>; the first GD step uses the second draw', () => {
    for (const seed of ['init-a', 'init-b']) {
      const w = world(seed), w2 = world(seed);
      for (const [i, b] of BLOC_ORDER.entries()) {
        const r = testRng(`${seed}|macro.gapest:${b}`), z0 = r.normal(), z1 = r.normal();
        const e0 = w.rows[b]!.gapEstNoise as number;
        expect(e0).toBe(GAPEST_SIGMA * z0);
        expect(e0).not.toBe(0);
        expect(w2.rows[b]!.gapEstNoise).toBe(e0);                                   // deterministic per seed
        const x = trueGap(i, 0);
        expect(stepOutputGapEstimate(w.ctx, b, x) - x).toBeCloseTo(GAPEST_RHO * e0 + GAPEST_INNOVATION * z1, 15);
      }
    }
    const g = world('init-a'), r = testRng('init-a|macro.gapest:FDL');
    expect(genesisOutputGapEstimate(g.ctx, 'FDL', 0.01)).not.toBe(0.01 + GAPEST_SIGMA * r.normal());   // a second genesis call draws Z1, not Z0 again
  });

  it('AC-04-01-GAPEST-DET: same seed → identical ε paths; one draw from macro.gapest:<bloc> per call; other fields untouched', () => {
    const a = world('det'), b = world('det'), c = world('other');
    const pa: number[] = [], pb: number[] = [], pc: number[] = [];
    for (let d = 0; d < 300; d++) for (const [i, bl] of BLOC_ORDER.entries()) {
      pa.push(stepOutputGapEstimate(a.ctx, bl, trueGap(i, d))); pb.push(stepOutputGapEstimate(b.ctx, bl, trueGap(i, d))); pc.push(stepOutputGapEstimate(c.ctx, bl, trueGap(i, d)));
    }
    expect(pa).toEqual(pb); expect(pa).not.toEqual(pc);
    expect([...new Set(a.streamsUsed)].sort()).toEqual(BLOC_ORDER.map((x) => `macro.gapest:${x}`).sort());
    expect(a.streamsUsed).toHaveLength(300 * 5 + 5);   // + one genesis draw per bloc
    for (const bl of BLOC_ORDER) {
      const { gapEstNoise: _e, ...rest } = a.rows[bl]!;
      expect(rest).toEqual({ id: bl, bloc: bl, outputGap: 0, regime: 'EXPANSION', rStar: 0.01 });
    }
  });

  it('AC-04-01-GAPEST-LEAK: estimate ≠ true gap on consecutive days (many seeds); ε and true-gap names are hidden', () => {
    for (let seed = 0; seed < 40; seed++) {
      const w = world(`leak${seed}`);
      for (const [i, b] of BLOC_ORDER.entries()) {
        let zeroRun = 0;
        for (let d = 0; d < 200; d++) {
          const x = trueGap(i, d);
          zeroRun = stepOutputGapEstimate(w.ctx, b, x) - x === 0 ? zeroRun + 1 : 0;
          expect(zeroRun).toBeLessThanOrEqual(1);
        }
      }
    }
    for (const k of ['outputGap', 'gapEstNoise', 'outputGapTerm', 'outputGapTrue', 'trueOutputGap']) expect(HIDDEN_FIELD_NAMES).toContain(k);
    expect(HIDDEN_FIELD_NAMES).not.toContain('outputGapEstimate');
  });

  const decision = (ruleTerms: Record<string, number>): Record<string, unknown> => ({ bloc: 'FDL', meetingId: 'mtg_1', previousRate: 0.03, newRate: 0.0325,
    corridor: { depositRate: 0.0225, lendingRate: 0.0425 }, emergency: false, votes: { for: 7, against: 2 }, ruleTerms, qeChangePerMonth: '0', statementKey: 'k', reasons: [] });
  const internal = { neutral: 0.0275, inflation: 0.0212, inflationGap: 0.0031, finStress: -0.0004, fx: 0, bias: 0.0012 };

  it('AC-04-01b-RULETERMS-KEYS: exactly the 7 04 §2.1 keys; strict schema rejects extra and missing keys', () => {
    expect([...RULE_TERMS_KEYS]).toEqual(['neutral', 'inflation', 'inflationGap', 'outputGap', 'finStress', 'fx', 'bias']);
    const rt = publicRuleTerms(internal, 0.5, 0.012);
    expect(Object.keys(rt).sort()).toEqual([...RULE_TERMS_KEYS].sort());
    const schema = MACRO_EVENTS['macro.cb.decision']!;
    expect(schema.safeParse(decision(rt)).success).toBe(true);
    for (const k of RULE_TERMS_KEYS) { const m: Record<string, number> = { ...rt }; delete m[k]; expect(schema.safeParse(decision(m)).success).toBe(false); }
    for (const extra of ['hawkishness', 'outputGapTerm', 'outputGapTrue', 'trueOutputGap', 'rStar'])
      expect(schema.safeParse(decision({ ...rt, [extra]: 0 })).success).toBe(false);
    expect(schema.safeParse(decision({ ...rt, outputGap: undefined as unknown as number })).success).toBe(false);
    for (const v of Object.values(rt)) expect(Math.abs(v / 0.0025 - Math.round(v / 0.0025))).toBeLessThan(1e-9);   // 0.25 pp grid
    expect(roundToQuarterPp(0.0212)).toBeCloseTo(0.02, 15); expect(roundToQuarterPp(0.00375)).toBeCloseTo(0.005, 15);   // half-even tie: 1.5 → 2
    expect(roundToQuarterPp(0.00125)).toBe(0); expect(Object.is(roundToQuarterPp(-0.001), 0)).toBe(true);
  });

  it('AC-04-01b-NOTRUEGAP: published outputGap = 0.25 pp of coef × estimate; differs from coef × true gap; never a true-gap field', () => {
    const w = world('notrue'), coef = 0.5;
    let differs = 0, n = 0;
    for (let d = 0; d < 400; d += 13) for (const [i, b] of BLOC_ORDER.entries()) {
      const x = trueGap(i, d), est = stepOutputGapEstimate(w.ctx, b, x);
      const rt = publicRuleTerms(internal, coef, est);
      expect(rt.outputGap).toBe(roundToQuarterPp(coef * est));
      if (rt.outputGap !== roundToQuarterPp(coef * x)) differs++;
      n++;
      const payload = decision(rt);
      expect(MACRO_EVENTS['macro.cb.decision']!.safeParse(payload).success).toBe(true);
      expect(assertNoHiddenFields(payload)).toEqual([]);
      expect(JSON.stringify(payload)).not.toMatch(/outputGapTrue|trueOutputGap|outputGapTerm|gapEstNoise/);
    }
    expect(differs).toBeGreaterThan(0);
    expect(differs / n).toBeGreaterThan(0.2);
    // publicRuleTerms takes no true-gap input: its source names only the estimate
    const src = readFileSync(fileURLToPath(new URL('./gapest.ts', import.meta.url)), 'utf8');
    const body = src.slice(src.indexOf('export function publicRuleTerms'));
    expect(body).toMatch(/outputGapCoef \* outputGapEstimate/);
  });
});
