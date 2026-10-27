// T04-03 step 1: business-cycle regimes (04 §3.3.1, §3.3.2, §3.3.4; D054, D055). Called by T04-20 as macro day step 3,
// global chain first, then blocs in BLOC_ORDER (§3.19 draw order). Streams: bloc S.regime(b), global S.globalRegime().
import { dmath, type ParamsView, type Rng } from '@tycoon/engine-core';
import type { ImbalanceKey, Regime } from '../schema';

/** §3.3.1 allowed transitions, in this fixed order (the target pick walks it). */
export const ALLOWED: Readonly<Record<Regime, readonly Regime[]>> = Object.freeze({
  EXPANSION: Object.freeze(['OVERHEATING', 'CONTRACTION'] as Regime[]),
  OVERHEATING: Object.freeze(['CONTRACTION', 'EXPANSION'] as Regime[]),
  CONTRACTION: Object.freeze(['RECOVERY'] as Regime[]),
  RECOVERY: Object.freeze(['EXPANSION', 'CONTRACTION'] as Regime[]),
});

/** §3.3.1 base probabilities. */
export const P_BASE: Readonly<Record<Regime, Partial<Record<Regime, number>>>> = Object.freeze({
  EXPANSION: Object.freeze({ OVERHEATING: 0.80, CONTRACTION: 0.20 }),
  OVERHEATING: Object.freeze({ CONTRACTION: 0.85, EXPANSION: 0.15 }),
  CONTRACTION: Object.freeze({ RECOVERY: 1.00 }),
  RECOVERY: Object.freeze({ EXPANSION: 0.90, CONTRACTION: 0.10 }),
});

const EXP_CON: Partial<Record<ImbalanceKey, number>> = { credit: 0.4, valuation: 0.35, curve: 0.5, policy: 0.45, oil: 0.3, fear: 0.4, contagion: 0.6, house: 0.3, fiscal: 0.2, trade: 0.3 };
/** §3.3.4 hazard weights w_{s→s',k} (DEFAULT, D055; 20 calibrates within ±50%). Key 'FROM>TO'. OVH→CON = EXP→CON + inflation 0.3. */
export const HAZARD_WEIGHTS: Readonly<Record<string, Partial<Record<ImbalanceKey, number>>>> = Object.freeze({
  'EXPANSION>OVERHEATING': Object.freeze({ overheat: 0.5, inflation: 0.4, credit: 0.3, valuation: 0.2, policy: -0.4 }),
  'EXPANSION>CONTRACTION': Object.freeze({ ...EXP_CON }),
  'OVERHEATING>CONTRACTION': Object.freeze({ ...EXP_CON, inflation: 0.3 }),
  'OVERHEATING>EXPANSION': Object.freeze({ credit: -0.4, inflation: -0.3, valuation: -0.2 }),
  'CONTRACTION>RECOVERY': Object.freeze({ stimulus: 0.4, contagion: -0.4, fear: -0.3 }),
  'RECOVERY>EXPANSION': Object.freeze({ stimulus: 0.2, fear: -0.2 }),
  'RECOVERY>CONTRACTION': Object.freeze({ fear: 0.4, policy: 0.4, contagion: 0.5 }),
});

export interface RegimeParams { meanDays: Record<Regime, number>; minDays: Record<Regime, number> }
const SUFFIX: Readonly<Record<Regime, string>> = { EXPANSION: 'exp', OVERHEATING: 'ovh', CONTRACTION: 'con', RECOVERY: 'rec' };
/** Reads PARAM.macro_regime_mean_days_{exp,ovh,con,rec} and macro_regime_min_days_{…} (23); no defaults here. */
export function regimeParams(p: ParamsView): RegimeParams {
  const meanDays = {} as Record<Regime, number>, minDays = {} as Record<Regime, number>;
  for (const r of ['EXPANSION', 'OVERHEATING', 'CONTRACTION', 'RECOVERY'] as const) {
    meanDays[r] = p.int(`macro_regime_mean_days_${SUFFIX[r]}`);
    minDays[r] = p.int(`macro_regime_min_days_${SUFFIX[r]}`);
  }
  return { meanDays, minDays };
}

/** §3.3.2 step 3: M_{s→s'} = exp(Σ_k w_{s→s',k} · clamp(z_k, −2, 3)) for each allowed s'. weightScale multiplies every w (tests: 0 → all 1). */
export function transitionMultipliers(from: Regime, z: Partial<Record<ImbalanceKey, number>>, weightScale = 1): Partial<Record<Regime, number>> {
  const out: Partial<Record<Regime, number>> = {};
  for (const to of ALLOWED[from]) {
    const w = HAZARD_WEIGHTS[`${from}>${to}`]!;
    let s = 0;
    for (const k of ['credit', 'valuation', 'curve', 'inflation', 'house', 'oil', 'fiscal', 'fear', 'contagion', 'policy', 'overheat', 'trade', 'stimulus'] as const) {
      const wk = w[k], zk = z[k];
      if (wk !== undefined && zk !== undefined) s += weightScale * wk * dmath.clamp(zk, -2, 3);
    }
    out[to] = dmath.exp(s);
  }
  return out;
}

/** §3.3.2 step 4 (blocs only): global CONTRACTION ⇒ M_{s→CON} ×= exp(0.6·c); global RECOVERY or EXPANSION and bloc in CONTRACTION ⇒ M_{CON→REC} ×= exp(0.4·c). */
export function applyCoupling(from: Regime, m: Partial<Record<Regime, number>>, globalRegime: Regime, cycleCoupling: number): Partial<Record<Regime, number>> {
  const out: Partial<Record<Regime, number>> = { ...m };
  if (globalRegime === 'CONTRACTION' && out.CONTRACTION !== undefined) out.CONTRACTION *= dmath.exp(0.6 * cycleCoupling);
  if ((globalRegime === 'RECOVERY' || globalRegime === 'EXPANSION') && from === 'CONTRACTION' && out.RECOVERY !== undefined) out.RECOVERY *= dmath.exp(0.4 * cycleCoupling);
  return out;
}

export interface RegimeStep { next: Regime; transitioned: boolean; hazard: number; u1: number; u2: number | null; forced: boolean; forcedBy?: string }

/** §3.3.2 steps 1-6. Always exactly 2 draws (u1, u2) from `rng` (G8 fixed draw count); u2 is reported only when transitioning.
 *  `hazard` is H = λ_s·Σ P_base·M (also reported while daysIn < min_s, when no transition is possible). */
export function stepRegime(rng: Rng, from: Regime, daysIn: number, m: Partial<Record<Regime, number>>, rp: RegimeParams): RegimeStep {
  const u1 = rng.next(), u2 = rng.next();
  const lambda = 1 / (rp.meanDays[from] - rp.minDays[from]);
  const targets = ALLOWED[from], wts: number[] = [];
  let sum = 0;
  for (const to of targets) { const w = P_BASE[from][to]! * (m[to] ?? 1); wts.push(w); sum += w; }
  const hazard = lambda * sum;
  if (daysIn < rp.minDays[from] || !(u1 < 1 - dmath.exp(-hazard))) return { next: from, transitioned: false, hazard, u1, u2: null, forced: false };
  let cum = 0, next = targets[targets.length - 1]!;
  for (let i = 0; i < targets.length; i++) { cum += wts[i]!; if (u2 * sum < cum) { next = targets[i]!; break; } }
  return { next, transitioned: true, hazard, u1, u2, forced: false };
}

/** §3.3.2 step 7: a crisis forces a regime, ignoring the minimum length; logged with the crisis (WorldEvent) id. No draws. */
export function forceRegime(from: Regime, to: Regime, worldEventId: string): RegimeStep {
  return { next: to, transitioned: from !== to, hazard: 0, u1: 0, u2: null, forced: true, forcedBy: worldEventId };
}
