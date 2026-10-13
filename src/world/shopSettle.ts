/**
 * Business money at a settlement (R-9-10): a shop's operating costs for a day, the manager's prepay on the day it was hired,
 * and the tax on the day's taxable net at the owner's bracket. The day step (shops.ts shopsDay) and a sale (assets.ts
 * sellBusiness, through settleSoldBusiness) both settle here, so every business's income is taxed before it leaves its owner.
 * Deterministic: no randomness is drawn here.
 */
import { bizDef, debit, today, TPD } from './core';
import { dailyCosts, managerPrepaid, managerPrepayCost } from './shopRules';
import { taxBasisOf } from './social';
import { taxOf } from './tax';
import type { Business, GameState, ShopState } from './types';

/** Money sinks for the day's operating costs, by line. */
export const COST_SINKS = {
  wages: 'shop wages', opex: 'shop opex', marketing: 'shop marketing', quality: 'shop quality',
  maintenance: 'shop maintenance', manager: 'shop manager',
} as const;

export type CostLine = keyof typeof COST_SINKS;
export type CostBill = Record<CostLine, number>;

/** Debits each cost line of a bill to its sink (costs are obligations: they are paid even when cash runs out). Returns the total. */
export function chargeCosts(g: GameState, b: Business, bill: CostBill): number {
  let total = 0;
  for (const line of Object.keys(COST_SINKS) as CostLine[]) {
    const amt = bill[line];
    if (amt > 0) { debit(g, b.ownerId, amt, COST_SINKS[line]); total += amt; }
  }
  return total;
}

/**
 * The manager's prepay, paid on the day the manager was hired (the day the shop settles). The prepay is a cost of that day,
 * so the day's taxable net is after it. The prepay is not in the day's cost bill (a prepaid manager's line is zero there).
 */
export function prepayOnDay(s: ShopState, target: number, day: number): number {
  return s.managerStars > 0 && s.managerDay === day ? managerPrepayCost(s.managerStars, target) : 0;
}

/** Books the tax on one settled day's taxable net to the businessTax sink; returns the tax (zero for a loss). */
export function taxDay(g: GameState, pid: string, taxable: number, basis: number, shift: number): number {
  const tax = taxOf(taxable, basis, shift);
  debit(g, pid, tax, 'businessTax');
  return tax;
}

/**
 * A business sold partway through a game day settles the part of that day it ran (R-9-10): its costs for that part (the
 * share of the day's bill that falls since the last close), the prepay if it was hired today, and the tax on the part's net.
 * The income it earned since the last close is already pending credit to the owner (accrueBusinesses), so the tax is
 * booked here, before the sale leaves the owner. Returns the tax. The owner's basis is read before the sale proceeds land.
 */
export function settleSoldBusiness(g: GameState, b: Business, shift: number): number {
  const s = b.shop;
  const target = bizDef(b).income;
  const day = today(g);
  const managed = s.managerStars > 0;
  const bill = dailyCosts(target, s, s.maintained || managed, managerPrepaid(s.managerStars, s.managerDay, day));
  const part = (g.market.tick % TPD) / TPD;
  const scaled: CostBill = {
    wages: bill.wages * part, opex: bill.opex * part, marketing: bill.marketing * part,
    quality: bill.quality * part, maintenance: bill.maintenance * part, manager: bill.manager * part,
  };
  const costs = chargeCosts(g, b, scaled);
  const earned = b.earned - s.earnedMark;
  const taxable = earned - costs - prepayOnDay(s, target, day);
  const basis = taxBasisOf(g, b.ownerId);
  return taxDay(g, b.ownerId, taxable, basis, shift);
}
