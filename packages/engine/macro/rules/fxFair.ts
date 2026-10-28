// T04-14 fair value, PPP, real gap, current account (04 §3.13.1). FDL's fair value is 0 by definition.
import { dmath, type ParamsView } from '@tycoon/engine-core';
import { BLOC_DEFAULTS } from '../blocs';
import type { BlocId } from '../schema';

const UIP_SHARE = 0.5 /* macro_fx_uip_share: T23 row MISSING */, THETA_PPP = dmath.ln(2) / 1.5, KAPPA_CA = 0.5, DT = 1 / 364, SURPRISE = 0.03;
export function pppLn(ppp0Ln: number, cpiFdl: number, cpiFdl0: number, cpiX: number, cpiX0: number): number {
  return ppp0Ln + dmath.ln(cpiFdl / cpiFdl0) - dmath.ln(cpiX / cpiX0);
}
/** q̃ = ln S + ln P_X − ln P_FDL − ln PPP0 (CPI levels share the genesis base 100); positive = X overvalued. */
export function realGap(spotLn: number, cpiX: number, cpiFdl: number, ppp0Ln: number): number {
  return spotLn + dmath.ln(cpiX) - dmath.ln(cpiFdl) - ppp0Ln;
}
export function currentAccount(b: BlocId, qTilde: number, xOthers: number, x: number, energyIndex: number): number {
  const d = BLOC_DEFAULTS[b];
  return d.ca0 - 0.3 * qTilde + 0.5 * d.openness * (xOthers - x) + 0.04 * d.commodityExporter * dmath.ln(energyIndex / 100);
}
/** Day-close step: drift × Δ (1/364) + risk, oil, surprise and shock terms. */
export function stepFairValue(fLn: number, x: { iX: number; iFdl: number; pppLn: number; ca: number; dRA: number; dLnEnergy: number; surpriseX: number; surpriseFdl: number; shocks: number; b: BlocId }, _p: ParamsView): number {
  if (x.b === 'FDL') return 0;
  const d = BLOC_DEFAULTS[x.b];
  return fLn + (-UIP_SHARE * (x.iX - x.iFdl) + THETA_PPP * (x.pppLn - fLn) + KAPPA_CA * x.ca) * DT
    + d.betaRisk * x.dRA + d.betaOil * x.dLnEnergy + SURPRISE * x.surpriseX - SURPRISE * x.surpriseFdl + x.shocks;
}
/** Surprise-only step at a release or CB decision tick. */
export function surpriseStep(fLn: number, surpriseX: number, surpriseFdl: number): number { return fLn + SURPRISE * surpriseX - SURPRISE * surpriseFdl; }
export function policySurprisePp(decisionRate: number, impliedBefore: number): number { return (decisionRate - impliedBefore) * 100; }
/** FDL per unit: A/B = S_A / S_B. */
export function crossRate(spotA: number, spotB: number): number { return spotA / spotB; }
