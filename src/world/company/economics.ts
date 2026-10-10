/**
 * Unit economics and capacity (spec v1.7 §1, §4): material cost per unit, the input index, plant multipliers, the
 * G&A span rule and productive capacity. Pure: the caller passes the company and the day's oil move.
 */

import { COMPANY, SECTORS, type CompanySector } from '@/content/company';
import type { Company, Staff } from './types';

/** Ops wage per unit at full productive load: 120 per gd over 60 units per gd (the overload cost base, §2). */
export const OPS_WAGE_PER_UNIT = COMPANY.wages.ops / COMPANY.unitsPerOpsHead;

/**
 * Material cost per unit at input index 1 and cost efficiency 0. It is set so a sector's gross margin holds at the
 * reference price with the Ops wage per unit inside COGS: mat = (1 - GM) * p_ref - Ops wage per unit (§1 and §2 table).
 */
export function materialPerUnit(sector: CompanySector): number {
  return (1 - SECTORS[sector].grossMargin) * COMPANY.demand.priceRef - OPS_WAGE_PER_UNIT;
}

/**
 * The §1 input index. Industrials: exp(lnP_OIL - lnP_OIL,0)^0.5. Staples: 1 + 0.3 * (OIL move as a fraction).
 * Software and the other sectors: 1. `oilLogMove` is ln(P_OIL) - ln(P_OIL,0).
 */
export function inputIndex(sector: CompanySector, oilLogMove: number): number {
  switch (SECTORS[sector].inputIndex) {
    case 'oil_sqrt': return Math.exp(0.5 * oilLogMove);
    case 'oil_food': return 1 + 0.3 * (Math.exp(oilLogMove) - 1);
    default: return 1;
  }
}

/** The §1 material part of unit cost: mat * input_index * (1 - eff). */
export function materialUnitCost(c: Company, oilLogMove: number): number {
  return materialPerUnit(c.sector) * inputIndex(c.sector, oilLogMove) * (1 - c.eff);
}

/** Plant multiplier: 1.0 at level 0, 1.25 at level 1, 1.5 at level 2 (§4). */
export function plantMult(level: number): number {
  return 1 + COMPANY.plant.multPerLevel * level;
}

/** Plant cost of the next level: C0 * 0.10 * 1.18^n, where n is the current level (§4). */
export function plantCost(level: number): number {
  return COMPANY.plant.c0 * COMPANY.plant.costFactor * Math.pow(COMPANY.plant.costGrowth, level);
}

/** G&A output factor (§4): each G&A head supports 12 others; each missing one costs 3% of every role's output. */
export function gaFactor(staff: Record<string, Staff>): number {
  const ga = staff.ga?.total ?? 0;
  const others = Object.entries(staff)
    .filter(([role]) => role !== 'ga')
    .reduce((sum, [, s]) => sum + s.total, 0);
  const needed = Math.ceil(others / COMPANY.gaSpan);
  const missing = Math.max(0, needed - ga);
  return Math.max(0, 1 - COMPANY.gaPenalty * missing);
}

/** Heads that are productive on `day`: seated heads less the ones still ramping (§4 ramp). */
export function productiveHeads(s: Staff, day: number): number {
  let ramping = 0;
  for (const r of s.ramping) if (r.readyDay > day) ramping += r.n;
  return Math.max(0, s.total - ramping);
}

/** R&D effort in productive heads after the G&A span factor (§4: every role's output, R&D speed included). */
export function rdEffort(c: Company, day: number): number {
  return productiveHeads(c.staff.rd, day) * gaFactor(c.staff);
}

/**
 * The unit cost of the day (§1): mat * input_index * (1 - eff) + overtime, with the overtime of 1.5 Ops wages per unit on
 * a day above 100% utilization. This is the same rule the orders use for their variable cost, so the founder view and
 * the bookings agree.
 */
export function unitCostToday(c: Company): number {
  return materialPerUnit(c.sector) * c.indexLast * (1 - c.eff) + (c.lastUtil > 1 ? overtimePerUnit() : 0);
}

/** Productive capacity in units per gd (§4): Ops heads * 60 * plant multiplier * G&A factor. */
export function capacityPerDay(c: Company, day: number): number {
  return productiveHeads(c.staff.ops, day) * COMPANY.unitsPerOpsHead * plantMult(c.plantLevel) * gaFactor(c.staff);
}

/** The overload ceiling per gd (§2): 115% of capacity. */
export function shipCeiling(capacity: number): number {
  return capacity * COMPANY.overloadCap;
}

/** Overtime per unit above capacity: 1.5 x the Ops wage per unit (§2, §1 `unit_cost` overtime). */
export function overtimePerUnit(): number {
  return COMPANY.overtimeMult * OPS_WAGE_PER_UNIT;
}

/** Depreciation per gd of the plant's capex (straight line over 504 gd, §1). */
export function depreciationPerDay(plantCapex: number): number {
  return plantCapex / COMPANY.depreciationDays;
}
