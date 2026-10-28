// T04-06: the 9-member vote (04 §3.6.4 step 7).
import type { ParamsView } from '@tycoon/engine-core';
import type { BlocId } from '../schema';
import type { CentralBank } from '../schema';
import { coeffsFromHawk, ruleRate, scheduledStep, RATE_STEP, type PublishedData } from './cb';

/** Member j's preferred rate: the rule rate with hawk + o_j (unclamped: §3.6.4 adds the offset to hawk), smoothed and stepped the
 *  same way as the decision. */
export function memberPreference(i: number, rStarCb: number, d: PublishedData, target: number, nairu: number, b: BlocId, hawk: number,
  offset: number, mandate: CentralBank['mandate'], elb: number, p: ParamsView): number {
  const c = coeffsFromHawk(b, hawk + offset, mandate, p);
  return scheduledStep(i, ruleRate(rStarCb, d, target, nairu, b, c).iStar, elb, c.rho, p);
}

/** Rates sit on the 25-bp grid, so |pref − i_new| ≤ 0.0025 is compared with a 1e-12 tolerance against float noise. */
const VOTE_EPS = 1e-12;

/** FOR iff |pref_j − i_new| ≤ 0.0025; dissent direction = AGAINST members preferring a higher / lower rate than i_new. */
export function tally(prefs: number[], iNew: number): { voteFor: number; voteAgainst: number; dissentHigher: number; dissentLower: number } {
  const t = { voteFor: 0, voteAgainst: 0, dissentHigher: 0, dissentLower: 0 };
  for (const pref of prefs) {
    if (Math.abs(pref - iNew) <= RATE_STEP + VOTE_EPS) t.voteFor++;
    else { t.voteAgainst++; if (pref > iNew) t.dissentHigher++; else t.dissentLower++; }
  }
  return t;
}
