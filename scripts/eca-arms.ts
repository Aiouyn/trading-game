// The arm pairing of the 6C tip gate (lead-phase6.md R-6C-6). Each tip arm (tip2, tip4, tip6) is compared with the honest arm of the
// same size and dates (honest2, honest4, honest6): the same player names, the same tip schedule (delivery day, tranches, reveal),
// the same size per tranche, and the honest rule for the direction (the public consensus, never the tip's claim).
// Pure functions only, so the pairing is unit-tested (scripts/eca-arms.test.ts) and the harness imports it.

export const TIP_ARMS = ['tip2', 'tip4', 'tip6'] as const;
export type TipArm = (typeof TIP_ARMS)[number];
export type HonestTipArm = 'honest2' | 'honest4' | 'honest6';

/** the tip arms' size, a share of net worth a tranche (the harness draws each tip's size at ±50% of this) */
export const TIP_PCT: Record<TipArm, number> = { tip2: 0.02, tip4: 0.04, tip6: 0.06 };

/** the honest rule's consensus bar: a stock with a weaker consensus is not traded (the harness honest arm) */
export const HONEST_CONSENSUS_BAR = 0.2;

/** the honest arm of the same size as a tip arm: tip4 -> honest4 */
export function honestArmOf(tip: TipArm): HonestTipArm {
  return `honest${tip.slice('tip'.length)}` as HonestTipArm;
}

/** the tip arm an honest arm pairs with: honest4 -> tip4 */
export function tipArmOf(honest: HonestTipArm): TipArm {
  return `tip${honest.slice('honest'.length)}` as TipArm;
}

/** the honest twin of a tip player: tip4 player "tip43" -> honest4 player "honest43" (same index, same dates, same size) */
export function pairedPlayerId(tipPlayer: string, tip: TipArm): string {
  if (!tipPlayer.startsWith(tip)) throw new Error(`${tipPlayer} is not a ${tip} player`);
  return `${honestArmOf(tip)}${tipPlayer.slice(tip.length)}`;
}

/** the honest rule's direction for a consensus: +1 buy, -1 sell, 0 no trade (no consensus, or a weak one) */
export function honestDirection(consensus: number | null): 1 | -1 | 0 {
  if (consensus === null || Math.abs(consensus) < HONEST_CONSENSUS_BAR) return 0;
  return consensus > 0 ? 1 : -1;
}

/** the tip gate of one tip arm (R-6C-6): its mean return and variance against its paired honest arm, per trader-season */
export interface TipGateRow {
  honest: HonestTipArm;
  evRatio: number | null;
  varRatio: number | null;
}

export function tipGateRow(tip: TipArm, perKind: Record<string, { meanRet: number; sdRet: number }>): TipGateRow {
  const honest = honestArmOf(tip);
  const t = perKind[tip];
  const h = perKind[honest];
  if (!t || !h) throw new Error(`tip gate ${tip} needs the ${tip} and ${honest} arms`);
  return {
    honest,
    evRatio: h.meanRet !== 0 ? t.meanRet / h.meanRet : null,
    varRatio: h.sdRet > 0 ? (t.sdRet / h.sdRet) ** 2 : null,
  };
}
