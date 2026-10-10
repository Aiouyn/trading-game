import { FUND_RULES } from '@/content/funds';
import type { GameState } from '../types';
import { navOf, navPerUnitOf } from './state';
import type { Fund, FundPublic } from './types';

/**
 * The public face of a fund: name, mandate, fees, NAV history, filings, and an AUM bucket. Never the investor list, never a
 * holder's units, payouts or requests: those are private to the holder and the manager.
 */

/** The AUM bucket index for a dollar figure: 0 below the first bucket, up to the number of buckets. */
export function aumBucketOf(aum: number): number {
  let i = 0;
  for (const b of FUND_RULES.aumBuckets) if (aum >= b) i++;
  return i;
}

export function publicFund(g: GameState, f: Fund): FundPublic {
  const convicted = g.funds?.convicted[f.managerId] !== undefined;
  return {
    id: f.id,
    name: f.name,
    managerHandle: g.players[f.managerId]?.handle ?? '',
    status: f.status,
    mandate: { classes: [...f.mandate.classes], maxLeverage: f.mandate.maxLeverage, maxPositionPct: f.mandate.maxPositionPct },
    pendingMandate: f.pendingMandate
      ? { mandate: { ...f.pendingMandate.mandate, classes: [...f.pendingMandate.mandate.classes] }, effectiveTick: f.pendingMandate.effectiveTick }
      : null,
    fees: { ...f.fees },
    navPerUnit: navPerUnitOf(g, f),
    navHistory: f.navHist.map((h) => ({ day: h.day, navPerUnit: h.navPerUnit })),
    aumBucket: aumBucketOf(Math.max(0, navOf(g, f))),
    filings: f.filings.map((x) => ({ ...x })),
    convicted,
  };
}

/** Every fund that is not closed, in id order. */
export function publicFunds(g: GameState): FundPublic[] {
  return Object.keys(g.funds?.funds ?? {})
    .sort()
    .map((id) => g.funds!.funds[id]!)
    .filter((f) => f.status !== 'closed')
    .map((f) => publicFund(g, f));
}
