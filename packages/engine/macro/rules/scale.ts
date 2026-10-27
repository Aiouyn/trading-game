// T04-04 (04 §3.2): world scale S, bloc and world nominal GDP, city activity, the Isla Serena index and the NPC-to-player wealth monitor.
// Macro step 2 (scale, global, before the blocs) and the GDP part of step 4. D053: S sizes the NPC economy from activity-weighted players.
import { dmath, fromMoney, safeDiv, toMoney, type Ccy, type Money, type ParamsView } from '@tycoon/engine-core';
import { BLOC_DEFAULTS } from '../blocs';
import { BLOC_ORDER, type BlocId } from '../schema';

/** §3.2 step 2: S* = clamp(N_a / macro_scale_ref_players, macro_scale_min, macro_scale_max). No players (N_a = 0) → the min (0.2). */
export function scaleTarget(na: number, p: ParamsView): number {
  return dmath.clamp(safeDiv(na, p.num('macro_scale_ref_players'), 0), p.num('macro_scale_min'), p.num('macro_scale_max'));
}

/** §3.2 step 3: S + clamp(S* − S, −0.005·S, +0.005·S). Edge 17: shrink ≤ 0.5%/day; the floor comes from scaleTarget's min. */
export function stepScale(S: number, target: number): number {
  return S + dmath.clamp(target - S, -0.005 * S, 0.005 * S);
}

/** §3.2 step 4: toMoney(macro_world_gdp_ref × S × gdpShare0 × (real/100) × (cpi/100) / fx0, ccy), evaluated left to right. */
export function nominalGdpLocal(b: BlocId, S: number, realGdpIndex: number, cpiLevel: number, p: ParamsView): Money {
  const d = BLOC_DEFAULTS[b];
  return toMoney(p.num('macro_world_gdp_ref') * S * d.gdpShare0 * (realGdpIndex / 100) * (cpiLevel / 100) / d.fx0, d.ccy);
}

/** §3.2 step 5: Σ_b toMoney(fromMoney(g_b) × spot_b, 'FDL') in BLOC_ORDER (spot = FDL per unit; FDL is 1.0). */
export function worldNominalGdpFdl(gdp: Record<BlocId, Money>, spot: Record<BlocId, number>): Money {
  let sum = 0n;
  for (const b of BLOC_ORDER) sum += toMoney(fromMoney(gdp[b]) * spot[b], 'FDL');
  return sum;
}

/** §3.2 step 6: cityGdpShare × (1 + cycleBeta × x_b). */
export function cityActivity(cityGdpShare: number, cycleBeta: number, outputGap: number): number {
  return cityGdpShare * (1 + cycleBeta * outputGap);
}

/** §3.2 step 6: nominalGdp_b × cityActivity_c, in the bloc currency. */
export function cityNominalGdp(blocGdp: Money, activity: number, ccy: Ccy): Money {
  return toMoney(fromMoney(blocGdp) * activity, ccy);
}

/** Isla Serena (no bloc, FDL): 0.5 × x_FDL + 0.5 × top-wealth growth; growth missing → 0. */
export function islaSerenaIndex(fdlGap: number, topWealthGrowth: number | null): number {
  return 0.5 * fdlGap + 0.5 * (topWealthGrowth ?? 0);
}

/** §3.2 step 7 monitor: worldNominalGdpFdl / PEW; PEW 0 → 0. Band [20, 200] (npc_to_player_wealth_band) is reported by 20, not enforced.
 *  `pew` is Money built with `pewFromReport` (E-88 (5): BigInt of the report string, never Number). */
export function npcToPlayerWealthRatio(worldGdpFdl: Money, pew: Money): number {
  return safeDiv(fromMoney(worldGdpFdl), fromMoney(pew), 0);
}
