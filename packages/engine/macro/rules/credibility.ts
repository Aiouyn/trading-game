// T04-06: CB credibility (04 §3.6.7; one-offs from §3.6.5 and §3.6.7).
import { EngineFault, type ParamsView } from '@tycoon/engine-core';

export const CRED_MIN = 0.05, CRED_MAX = 0.98;
const DT = 1 / 364;   // one day close in game years

export interface CredInputs { piE5: number; piCore: number; target: number; offTargetDays: number; qeActive: boolean }
/** §3.6.7 daily: gain 0.10(1 − c)Δ when |π_e5 − π*| < 0.005 and |π_core − π*| < 0.01; loss 0.30·c·Δ when off target (> 0.02) for more
 *  than 182 consecutive days (`offTargetDays` counts today); loss 0.10·c·Δ when QE runs while π_core > π* + 0.02. Applied in that
 *  order, then clamped to [0.05, 0.98]. */
export function stepCredibility(cred: number, x: CredInputs): number {
  let c = cred;
  if (Math.abs(x.piE5 - x.target) < 0.005 && Math.abs(x.piCore - x.target) < 0.01) c += 0.10 * (1 - c) * DT;
  if (x.offTargetDays > 182) c -= 0.30 * c * DT;
  if (x.qeActive && x.piCore > x.target + 0.02) c -= 0.10 * c * DT;
  return clampCred(c);
}

export type CredOneOff = 'GUIDANCE_BREAK' | 'GUIDANCE_MISS' | 'DEFENCE_HIKE' | 'PEG_BREAK' | 'YCC_ABANDON' | 'NEW_GOVERNOR';
/** §3.6.5/§3.6.7 one-offs: guidance break −macro_cred_guidance_break; move vs impliedMove −0.03; decisive defence hike +0.05;
 *  peg break / YCC abandonment −0.10; new governor 0.05 toward `credibility0` (not past it). Clamped to [0.05, 0.98]. */
export function credibilityOneOff(cred: number, kind: CredOneOff, credibility0?: number, p?: ParamsView): number {
  switch (kind) {
    case 'GUIDANCE_BREAK':
      if (p === undefined) throw new EngineFault('I0.macro_cred', 'GUIDANCE_BREAK needs params (macro_cred_guidance_break)');
      return clampCred(cred - p.num('macro_cred_guidance_break'));
    case 'GUIDANCE_MISS': return clampCred(cred - 0.03);
    case 'DEFENCE_HIKE': return clampCred(cred + 0.05);
    case 'PEG_BREAK': case 'YCC_ABANDON': return clampCred(cred - 0.10);
    case 'NEW_GOVERNOR': {
      if (credibility0 === undefined) throw new EngineFault('I0.macro_cred', 'NEW_GOVERNOR needs credibility0');
      const gap = credibility0 - cred;
      return clampCred(gap > 0.05 ? cred + 0.05 : gap < -0.05 ? cred - 0.05 : credibility0);
    }
  }
}

function clampCred(c: number): number { return c < CRED_MIN ? CRED_MIN : c > CRED_MAX ? CRED_MAX : c; }
