/**
 * Fundamental value and the consensus read (spec v1.7 §5, §6.2, §6.4). Pure functions over annualized inputs: the
 * world layer computes the inputs from filed or estimated numbers; nothing here reads private state.
 *
 * V_engine (§5, CB-035) with the contribution-backlog term (§5, CB-036, v1.6):
 *   E* branch (E* > 0):  V = PE * (E* + w_b * dCB) * (1 + gamma g) * (0.85 + 0.15 C) - net_debt
 *   revenue branch:      V = 0.5 * EVS * (Rev_u + w_b * dCB / m) * (1 + gamma g) - net_debt
 *   floor: max(V, 0)
 * dCB = contribution backlog minus the previously filed one (G16 uses the filed CB); m is the TTM gross margin clipped
 * to [0.10, 0.90]; g the TTM growth of Rev_u clipped to [-50%, +100%].
 *
 * PE and EVS are flat proposals (no sector values exist in v1.7, see src/content/company.ts).
 */

import { COMPANY } from '@/content/company';

export interface ValuationInputs {
  /** Rev_u,ann: annualized NPC revenue (the revenue branch and the growth input) */
  revU: number;
  /** E*_ann = min(NI_adj, OCF - capex_maint), annualized (the E* branch) */
  eStar: number;
  /** TTM growth of Rev_u (un-clipped; clipped here) */
  growth: number;
  /** guidance credibility C (0.5 until guidance exists) */
  credibility: number;
  /** debt minus cash */
  netDebt: number;
  /** CB minus the previously filed CB */
  dCB: number;
  /** TTM gross margin (un-clipped; clipped here) */
  margin: number;
}

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/** the clipped inputs m and g, as the spec clips them */
export function clippedMargin(m: number): number {
  return clamp(m, COMPANY.valuation.mClip[0], COMPANY.valuation.mClip[1]);
}

export function clippedGrowth(g: number): number {
  return clamp(g, COMPANY.valuation.gClip[0], COMPANY.valuation.gClip[1]);
}

/** V_engine (§5). Returns the floored value. */
export function vEngine(x: ValuationInputs): number {
  const v = COMPANY.valuation;
  const growth = 1 + v.gamma * clippedGrowth(x.growth);
  const m = clippedMargin(x.margin);
  const qual = v.cBase + v.cSlope * x.credibility;
  let value: number;
  if (x.eStar > 0) {
    value = v.pe * (x.eStar + v.wb * x.dCB) * growth * qual - x.netDebt;
  } else {
    value = 0.5 * v.evs * (x.revU + (v.wb * x.dCB) / m) * growth - x.netDebt;
  }
  return Math.max(value, 0);
}

/** ln(V / shares) with a floor so a zero value stays finite (only differences of it are used). */
export function lnPerShare(value: number, shares: number): number {
  return Math.log(Math.max(value, 1) / shares);
}

/**
 * sens = d lnV / d CB at the given inputs (§6.2, sens_k). Analytic from the branch in use, 0 when the value is floored.
 */
export function sensCB(x: ValuationInputs): number {
  const v = COMPANY.valuation;
  const value = vEngine(x);
  if (!(value > 0)) return 0;
  const growth = 1 + v.gamma * clippedGrowth(x.growth);
  if (x.eStar > 0) {
    const qual = v.cBase + v.cSlope * x.credibility;
    return (v.pe * v.wb * growth * qual) / value;
  }
  const m = clippedMargin(x.margin);
  return (0.5 * v.evs * (v.wb / m) * growth) / value;
}

/**
 * The backlog's lnV contribution at a signal (§6.2, backlogLift_k): lnV at the new CB minus lnV at the previous CB, all
 * other fields held. `dCBnow` and `dCBprev` are the consensus CB minus the filed CB, now and at the previous signal.
 */
export function backlogLift(base: ValuationInputs, dCBnow: number, dCBprev: number, shares: number): number {
  const now = lnPerShare(vEngine({ ...base, dCB: dCBnow }), shares);
  const prev = lnPerShare(vEngine({ ...base, dCB: dCBprev }), shares);
  return now - prev;
}

/**
 * The residual surprise on filing day (§6.2): s = [(Rev_act - Rev_cons) m + (OCF_act - OCF_cons) + (CB_act - CB_cons) w_b] / D.
 * `d` is the surprise denominator D = max(EV_20, 0.25 mcap_20), supplied by the caller (the market is outside A3).
 */
export function surprise(args: {
  revActual: number; revCons: number; ocfActual: number; ocfCons: number;
  cbActual: number; cbCons: number; margin: number; d: number;
}): number {
  const m = clippedMargin(args.margin);
  const num = (args.revActual - args.revCons) * m + (args.ocfActual - args.ocfCons) + (args.cbActual - args.cbCons) * COMPANY.valuation.wb;
  return num / args.d;
}

/** The surprise denominator: max(EV_20, 0.25 mcap_20) (Q22). */
export function surpriseDenominator(ev20: number, mcap20: number): number {
  return Math.max(ev20, 0.25 * mcap20);
}
