// T04-01b steps 2-4: the public CB output-gap estimate (E-41 B2, E-45 items 4-5, E-54) and the exact public ruleTerms key set.
import type { PhaseCtx } from './core-port';
import { macroTables, type BlocId, type BlocMacroState } from './schema';
import { S } from './streams';
import { EngineFault } from '@tycoon/engine-core';

/** E-45 / 02 §3.10.4 row `macro.gapest:<bloc>`: AR(1) ρ 0.98, stationary σ 0.5 pp. PROVISIONAL [Quant]. */
export const GAPEST_RHO = 0.98;
export const GAPEST_SIGMA = 0.005;
/** Innovation scale σ·√(1 − ρ²), so the stationary σ of ε is GAPEST_SIGMA. */
export const GAPEST_INNOVATION = GAPEST_SIGMA * Math.sqrt(1 - GAPEST_RHO * GAPEST_RHO);

/** Genesis (Quant/Producer ruling on #31, AC-04-01b-GAPEST-INIT): ε0 = σ·Z0, Z0 = the FIRST draw of `macro.gapest:<bloc>`, so ε starts
 *  in its stationary distribution (no burn-in). Stores ε0 on the bloc row and returns outputGap + ε0. */
export function genesisOutputGapEstimate(ctx: PhaseCtx, bloc: BlocId, outputGap: number): number {
  const z0 = ctx.rng(S.gapest(bloc)).normal();
  const eps0 = GAPEST_SIGMA * z0;
  const row = ctx.store.get<BlocMacroState & { id: BlocId }>(macroTables.bloc.name, bloc);
  if (row !== undefined) ctx.store.put(macroTables.bloc.name, { ...row, gapEstNoise: eps0 });
  return outputGap + eps0;
}

/** Step 3, at each day close per bloc: ε ← ρ·ε + σ·√(1−ρ²)·Z (one draw from `macro.gapest:<bloc>`); returns outputGap + ε.
 *  ε is stored on the bloc row (`gapEstNoise`, hidden), seeded by genesisOutputGapEstimate. */
export function stepOutputGapEstimate(ctx: PhaseCtx, bloc: BlocId, outputGap: number): number {
  const z = ctx.rng(S.gapest(bloc)).normal();
  const row = ctx.store.get<BlocMacroState & { id: BlocId }>(macroTables.bloc.name, bloc);
  if (row === undefined) throw new EngineFault('I0.macro_bloc', `no bloc row ${bloc} (genesisOutputGapEstimate first)`);
  const prev = row.gapEstNoise;
  const eps = GAPEST_RHO * prev + GAPEST_INNOVATION * z;
  ctx.store.put(macroTables.bloc.name, { ...row, gapEstNoise: eps });
  return outputGap + eps;
}

/** Step 4: the 04 §2.1 ruleTerms keys (04 :258), exactly. */
export const RULE_TERMS_KEYS = Object.freeze(['neutral', 'inflation', 'inflationGap', 'outputGap', 'finStress', 'fx', 'bias'] as const);
export type RuleTermKey = (typeof RULE_TERMS_KEYS)[number];

/** E-45 item 5: published at 0.25 pp = 0.0025 in rate units. */
export const RULE_TERMS_PUBLIC_STEP = 0.0025;
/** Round half-even to the 0.25 pp grid (local; T02-04 roundHalfEven is not on main yet). */
export function roundToQuarterPp(v: number): number {
  const q = v / RULE_TERMS_PUBLIC_STEP, f = Math.floor(q), d = q - f;
  const n = d > 0.5 ? f + 1 : d < 0.5 ? f : (f % 2 === 0 ? f : f + 1);
  const r = n * RULE_TERMS_PUBLIC_STEP;
  return r === 0 ? 0 : r;
}

/** The public ruleTerms of a `macro.cb.decision` payload. `internal` holds the six non-gap contributions (0.01 pp internal);
 *  the output-gap contribution is recomputed from the CB's estimate: coef × outputGapEstimate. The true gap is not an input. */
export function publicRuleTerms(internal: Readonly<Record<Exclude<RuleTermKey, 'outputGap'>, number>>, outputGapCoef: number,
  outputGapEstimate: number): Record<RuleTermKey, number> {
  const out = {} as Record<RuleTermKey, number>;
  for (const k of RULE_TERMS_KEYS) {
    const v = k === 'outputGap' ? outputGapCoef * outputGapEstimate : internal[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new EngineFault('I0.macro_rule_terms', `ruleTerms.${k} = ${String(v)}`);
    out[k] = roundToQuarterPp(v);
  }
  return out;
}
