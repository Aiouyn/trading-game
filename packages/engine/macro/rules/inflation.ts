// T04-05 step 1: world inflation and expectations (04 §3.5), macro day step 5, after the gap step (T04-04).
// Δ = 1 game day = 1/364 year. The caller (T04-20) draws ε (draw 3 of the bloc's S.shock(b) day draws) and supplies
// history values (effective FX 364 days back, mean90 of the gap, cpi 364 days back).
import { dmath, type ParamsView } from '@tycoon/engine-core';
import { BLOC_ORDER, type BlocId, type BlocMacroState, type GlobalMacroState } from '../schema';

const DT = 1 / 364;
const SQRT_DT = Math.sqrt(DT);
const LN2 = dmath.ln(2);
const THETA_CORE = LN2 / 0.5;   // §3.5 step 3
const SIGMA_CORE = 0.003;
const CORE_MIN = -0.05;         // clamp [−5%, 60%] (edges 3, 4)
const CORE_MAX = 0.60;
const THETA_E1 = LN2 / 0.25;    // §3.5 step 6
const THETA_E5 = LN2 / 1.0;
const GENESIS_INDEX = 100;      // energy and food indices at genesis (§3.14.5)

/** ln S_eff,b = Σ_{Y≠b} w_Y (ln S_b − ln S_Y); S = FDL per unit (FDL = 1); w = the other four blocs' GDP shares renormalized to 1. */
export function effectiveFxLn(b: BlocId, spot: Record<BlocId, number>, gdpWeights: Record<BlocId, number>): number {
  let wSum = 0;
  for (const y of BLOC_ORDER) if (y !== b) wSum += gdpWeights[y];
  const lnB = dmath.ln(spot[b]);
  let s = 0;
  for (const y of BLOC_ORDER) if (y !== b) s += (gdpWeights[y] / wSum) * (lnB - dmath.ln(spot[y]));
  return s;
}

/** dep = −ln(S_eff,t / S_eff,t−364) = −(lnNow − ln364). */
export function effectiveDepreciation(effLnNow: number, effLn364: number): number {
  return -(effLnNow - effLn364);
}

/** π_core* = π_e1 + κ·mean90(x) + fxPassThrough·dep, κ = PARAM.macro_phillips_slope. */
export function coreTarget(piE1: number, mean90Gap: number, passThrough: number, dep: number, p: ParamsView): number {
  return piE1 + p.num('macro_phillips_slope') * mean90Gap + passThrough * dep;
}

/** π_core ← π_core + θ_π(π_core* − π_core)Δ + σ_π√Δ ε, θ_π = ln2/0.5, σ_π = 0.003; clamp [−0.05, 0.60]. */
export function stepCore(core: number, target: number, eps: number): number {
  return dmath.clamp(core + THETA_CORE * (target - core) * DT + SIGMA_CORE * SQRT_DT * eps, CORE_MIN, CORE_MAX);
}

/** coreCpiLevel ← coreCpiLevel × e^(π_core·Δ). */
export function stepCoreLevel(level: number, core: number): number {
  return level * dmath.exp(core * DT);
}

/** cpiLevel = coreCpiLevel × (E_loc,t/E_loc,0)^energyWeight × (Fd_loc,t/Fd_loc,0)^foodWeight; E_loc = energyIndex/spot, genesis 100/spot0. */
export function headlineLevel(coreLevel: number, energyIndex: number, foodIndex: number, spot: number, spot0: number, energyWeight: number, foodWeight: number): number {
  return coreLevel * dmath.pow(localRatio(energyIndex, spot, spot0), energyWeight) * dmath.pow(localRatio(foodIndex, spot, spot0), foodWeight);
}

/** headlineInflation = ln(cpi_t / cpi_{t−364}). */
export function headlineYoy(cpiNow: number, cpi364: number): number {
  return dmath.ln(cpiNow / cpi364);
}

/** §3.5 step 6: π_e1 first, then π_e5 from the updated π_e1. */
export function stepExpectations(piE1: number, piE5: number, headline: number, target: number, cred: number): { piE1: number; piE5: number } {
  const e1 = piE1 + THETA_E1 * ((1 - cred) * headline + cred * target - piE1) * DT;
  const a = (1 - cred) * (1 - cred);
  const e5 = piE5 + THETA_E5 * (a * e1 + (1 - a) * target - piE5) * DT;
  return { piE1: e1, piE5: e5 };
}

export type PriceIndexKind = 'CPI' | 'CORE' | 'WAGE' | 'ENERGY_LOCAL' | 'FOOD_LOCAL';

/** §3.5 step 7 indices (genesis = 100). Other modules multiply authored genesis prices by index ratios and never compound inflation. */
export function priceIndexOf(st: BlocMacroState, g: GlobalMacroState, spotNow: number, spot0: number, kind: PriceIndexKind): number {
  switch (kind) {
    case 'CPI': return st.cpiLevel;
    case 'CORE': return st.coreCpiLevel;
    case 'WAGE': return st.wageIndex;
    case 'ENERGY_LOCAL': return GENESIS_INDEX * localRatio(g.energyIndex, spotNow, spot0);
    case 'FOOD_LOCAL': return GENESIS_INDEX * localRatio(g.foodIndex, spotNow, spot0);
  }
}

/** (index/spot) / (100/spot0): the local-currency index relative to genesis. */
function localRatio(index: number, spot: number, spot0: number): number {
  return (index / spot) / (GENESIS_INDEX / spot0);
}
