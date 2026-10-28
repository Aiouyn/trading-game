// T04-06 acceptance tests: forward guidance, text bands, dots, statement keys (04#11; 04 §3.6.5).
import { describe, expect, it } from 'vitest';
import { createParamsView } from '@tycoon/params';
import type { ParamsView } from '@tycoon/engine-core';
import { coeffsFromHawk, scheduledStep, type PublishedData } from './cb';
import { dominantTerm, dots, guidanceDirection, guidanceScore, guidanceTextKey, impliedMove, statementKey } from './guidance';

/** Test-only uniform stream (splitmix64) + Box-Muller. */
function testRng(seed: number): { u: () => number; normal: () => number } {
  let s = BigInt(seed) * 0x9e3779b97f4a7c15n & 0xffffffffffffffffn;
  const u = (): number => { s = (s + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn; let z = s;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn; z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn;
    return (Number((z ^ (z >> 31n)) >> 11n) + 0.5) / 2 ** 53; };
  return { u, normal: () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()) };
}
const P: Record<string, number> = { macro_cb_phi_fs: 1.5, macro_cb_smoothing: 0.5, macro_cb_max_step: 0.005, macro_cb_max_step_wide: 0.0075 };
const pv: ParamsView = { ...createParamsView([]), num: (k) => { if (!(k in P)) throw new Error(k); return P[k]!; } };
const terms = (o: Partial<Record<string, number>> = {}) => ({ neutral: 0.05, inflation: 0, inflationGap: 0, outputGap: 0, finStress: 0, fx: 0, bias: 0, ...o });
const g = (score: number) => ({ meetingId: 'mtg_1', tick: 0, score, impliedMove: 0 as const, textKey: guidanceTextKey(score) });

describe('04#11 guidance direction vs the decision', () => {
  const run = (clarity: number): number => {
    let hit = 0, n = 0;
    for (let seed = 0; seed < 200; seed++) {
      const r = testRng(seed + (clarity === 0.8 ? 0 : 10_000));
      for (let k = 0; k < 100; k++) {
        const i = 0.03, proj = i + (-0.02 + 0.04 * r.u()), atMeeting = proj + 0.002 * r.normal();
        const dir = guidanceDirection(guidanceScore(impliedMove(i, proj, 0.5), clarity, r.normal()));
        const next = scheduledStep(i, atMeeting, 0, 0.5, pv);
        const dec = next > i + 1e-12 ? 'HIKE' : next < i - 1e-12 ? 'CUT' : 'HOLD';
        n++; if (dec === dir) hit++;
      }
    }
    return hit / n;
  };
  it('≥ 0.80 at clarity 0.8 and ≥ 0.60 at clarity 0.4 (200 seeds × 100 pairs)', () => {
    const hi = run(0.8), lo = run(0.4);
    expect(hi).toBeGreaterThanOrEqual(0.80); expect(lo).toBeGreaterThanOrEqual(0.60); expect(hi).toBeGreaterThan(lo);
  });
  it('impliedMove = clamp(roundHalfEven(ρ(i*_proj − i)/0.0025), ±2); score = clamp(move/2 + (1 − clarity)·0.3·ε, ±1)', () => {
    expect(impliedMove(0.03, 0.0475, 0.5)).toBe(2); expect(impliedMove(0.03, 0.035, 0.5)).toBe(1); expect(impliedMove(0.03, 0.0325, 0.5)).toBe(0);
    expect(impliedMove(0.03, 0.0375, 0.5)).toBe(2); expect(impliedMove(0.03, 0.0225, 0.5)).toBe(-2); expect(impliedMove(0.03, 0.025, 0.5)).toBe(-1);
    expect(impliedMove(0.03, -0.1, 0.5)).toBe(-2); expect(Object.is(impliedMove(0.03, 0.0299, 0.5), 0)).toBe(true);
    expect(guidanceScore(1, 0.8, 0)).toBe(0.5); expect(guidanceScore(1, 0.4, 1)).toBeCloseTo(0.5 + 0.18, 15);
    expect(guidanceScore(2, 0.4, 10)).toBe(1); expect(guidanceScore(-2, 0.4, -10)).toBe(-1); expect(guidanceScore(0, 0.8, -1)).toBeCloseTo(-0.06, 15);
  });
});

describe('§3.6.5 text bands and direction', () => {
  it('bands at −0.61, −0.21, 0, 0.21, 0.61 and their edges', () => {
    expect([-0.61, -0.21, 0, 0.21, 0.61].map(guidanceTextKey)).toEqual(['VERY_DOVISH', 'DOVISH', 'NEUTRAL', 'HAWKISH', 'VERY_HAWKISH']);
    expect([-0.6, -0.2, 0.2, 0.6].map(guidanceTextKey)).toEqual(['DOVISH', 'NEUTRAL', 'NEUTRAL', 'HAWKISH']);
    expect([-0.21, -0.2, 0.2, 0.21].map(guidanceDirection)).toEqual(['CUT', 'HOLD', 'HOLD', 'HIKE']);
  });
});

describe('§3.6.5 dots', () => {
  const d = (o: Partial<PublishedData> = {}): PublishedData => ({ piCb: 0.02, xGdpPub: 0, uPub: 0.045, fsi: 0.2, depYoy: 0, ...o });
  it('converge: π_cb = π*, x = 0, FSI 0.2 from i = r*_cb + π* + bias → dots(8) at that level within 1e−6; horizons 1, 2, 4, 8', () => {
    const c = coeffsFromHawk('FDL', 0.5, 'DUAL', pv), level = 0.0075 + 0.02 + c.bias;
    const out = dots(level, 0.0075, d(), 0.02, 0.045, 'FDL', c, 0, pv);
    expect(out.map((x) => x.horizonQuarters)).toEqual([1, 2, 4, 8]);
    expect(Math.abs(out[3]!.rate - level)).toBeLessThan(1e-6);
    const ch = coeffsFromHawk('EUN', 1, 'PRICE_STABILITY', pv), lvl2 = 0.01 + 0.02 + ch.bias;   // bias 0.0025, on the grid
    expect(Math.abs(dots(lvl2, 0.01, d(), 0.02, 0.06, 'EUN', ch, -0.005, pv)[3]!.rate - lvl2)).toBeLessThan(1e-6);
  });
  it('from far away, shocks decay (π → π*, x → 0, FSI → 0.2, depYoy held) and the path ends near the level', () => {
    const c = coeffsFromHawk('FDL', 0.5, 'DUAL', pv);
    const out = dots(0.06, 0.0075, d({ piCb: 0.05, xGdpPub: 0.03, uPub: 0.035, fsi: 0.6 }), 0.02, 0.045, 'FDL', c, 0, pv);
    for (const x of out) { const q = x.rate / 0.0025; expect(Math.abs(q - Math.round(q))).toBeLessThan(1e-9); }
    expect(Math.abs(out[3]!.rate - 0.0275)).toBeLessThan(Math.abs(0.06 - 0.0275));
    const stress = dots(0.03, 0.0075, d({ fsi: 0.9 }), 0.02, 0.045, 'FDL', c, 0, pv), calm = dots(0.03, 0.0075, d(), 0.02, 0.045, 'FDL', c, 0, pv);
    expect(stress[0]!.rate).toBeLessThan(calm[0]!.rate);   // FSI 0.9 → 0.55 after one quarter: still a finStress cut
    const cut = dots(0.0, 0.0075, d({ piCb: 0.06 }), 0.02, 0.045, 'FDL', c, 0, pv);
    expect(cut[0]!.rate).toBeCloseTo(0.0075, 15);   // first quarter: π decays to 0.02 + 0.04·2^(−1/3) before the wide step
    const pyn = coeffsFromHawk('PYN', 0.5, 'DUAL', pv);
    const a = dots(0.03, 0.01, d({ depYoy: 0.1 }), 0.02, 0.045, 'PYN', pyn, 0, pv), b = dots(0.03, 0.01, d({ depYoy: 0 }), 0.02, 0.045, 'PYN', pyn, 0, pv);
    expect(a[0]!.rate).toBeGreaterThan(b[0]!.rate);   // q1: dep 0.075 still in the rule
    const far = dots(0.0475, 0.01, d({ depYoy: 0.3 }), 0.02, 0.045, 'PYN', pyn, 0, pv);
    expect(far[3]!.rate).toBe(dots(far[2]!.rate, 0.01, d(), 0.02, 0.045, 'PYN', pyn, 0, pv)[3]!.rate);   // q ≥ 4: dep_q = 0 (E-100 (f))
  });
});

describe('§3.6.4 step 8 statement key', () => {
  it('direction, size, MATCH/SURPRISE/UNGUIDED, dominant term (neutral excluded, ties keep key order)', () => {
    expect(statementKey(0.03, 0.035, g(0.5), terms({ inflationGap: 0.004, outputGap: -0.003 }))).toBe('cb.stmt.HIKE.SIZE50.MATCH.inflationGap');
    expect(statementKey(0.03, 0.0275, g(0.5), terms({ finStress: -0.01 }))).toBe('cb.stmt.CUT.SIZE25.SURPRISE.finStress');
    expect(statementKey(0.03, 0.03, g(0.1), terms({ fx: 0.001 }))).toBe('cb.stmt.HOLD.SIZE0.MATCH.fx');
    expect(statementKey(0.03, 0.0375, null, terms({ inflation: 0.02 }))).toBe('cb.stmt.HIKE.SIZE75.UNGUIDED.inflation');
    expect(statementKey(0.03, 0.03, null, terms({ fx: 0.001 }))).toBe('cb.stmt.HOLD.SIZE0.UNGUIDED.fx');
    expect(statementKey(0.03, 0.03, g(0.5), terms({ fx: 0.001 }))).toBe('cb.stmt.HOLD.SIZE0.SURPRISE.fx');
    expect(statementKey(0.03, 0.0425, null, terms())).toBe('cb.stmt.HIKE.LARGE.UNGUIDED.inflation');
    expect(statementKey(0.03, 0.04, g(0.9), terms({ bias: 0.0025 }))).toBe('cb.stmt.HIKE.SIZE100.MATCH.bias');
    expect(statementKey(0.03, 0.0175, g(-0.9), terms({ outputGap: -0.004 }))).toBe('cb.stmt.CUT.LARGE.MATCH.outputGap');
    expect(statementKey(0.03, 0.030000000000000002, g(0), terms())).toBe('cb.stmt.HOLD.SIZE0.MATCH.inflation');
    expect(dominantTerm(terms({ inflation: 0.003, outputGap: -0.003 }))).toBe('inflation');
    expect(dominantTerm(terms({ inflation: 0.003, outputGap: -0.0031 }))).toBe('outputGap');
    expect(dominantTerm(terms())).toBe('inflation');
  });
});
