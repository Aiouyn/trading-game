// T04-13 restructuring (04 §3.12.2 steps 3–6): exchange-offer terms, NPC votes, CAC close, MOVE_QTY-only exchange.
// Pure term rules first; the PhaseCtx steps (openOffer, tallyOffer, closeOffer, executeExchange) follow in this file.
import { dmath } from '@tycoon/engine-core';
import { priceFromYieldLocal } from './bondMath';

/** h = clamp(1 − (d* + 0.20)/debtGdp, 0.20, 0.60). */
export function haircut(debtGdp: number, dStar: number): number {
  return dmath.clamp(1 - (dStar + 0.20) / debtGdp, 0.20, 0.60);
}

/** New-bond coupon max(0.02, 0.6 × y10 before the crisis). */
export function newBondCoupon(preCrisis10y: number): number {
  return Math.max(0.02, 0.6 * preCrisis10y);
}

/** Face per 100 old face such that 50% 8y + 50% 15y new bonds (semiannual, priced at y_exit) are worth 100(1 − h). */
export function facePer100(h: number, coupon: number, yExit: number): number {
  const avg = 0.5 * priceFromYieldLocal(coupon, 8, yExit, 2) + 0.5 * priceFromYieldLocal(coupon, 15, yExit, 2);
  return 100 * (100 * (1 - h)) / avg;
}

/** NPC block acceptance σ((recovery − preOfferPrice/100 + 0.05)/0.05). */
export function npcAcceptProbability(recoveryNpv: number, preOfferPrice: number): number {
  return dmath.sigmoid((recoveryNpv - preOfferPrice / 100 + 0.05) / 0.05);
}
