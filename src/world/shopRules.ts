/**
 * Pure shop rules (Phase 4 A1). No state is touched here: the daily step, the commands and the
 * migration live in shops.ts, and the market-share engine in assets.ts. Kept free of imports from
 * core and assets so both can use it without a cycle.
 */
import { SHOP } from '@/content/shops';
import type { ShopState } from './types';

/** The settings a brand-new purchase starts with: the purchase crew, and nothing else set. */
export function purchaseShop(tick: number): ShopState {
  return {
    crew: SHOP.crew.purchase, price: SHOP.priceDefault, pendingPrice: null, priceDay: -1,
    quality: 0, marketing: 0, maintained: false, condition: SHOP.maintenance.condition,
    reviews: SHOP.reviews.start, morale: SHOP.morale.start, queue: 0, demand: 0,
    managerStars: 0, managerDay: -1, lastAttendedTick: tick, earnedMark: 0, costs: 0, net: [],
  };
}

/** Well-run settings: what the migration gives existing saves, and what NPC shops run. */
export function wellRunShop(tick: number): ShopState {
  return {
    ...purchaseShop(tick),
    crew: SHOP.crew.wellRun, quality: 1, maintained: true,
  };
}

/**
 * Share of full income earned while the owner is away, as a function of game days away (S4).
 * Full for `fullDays` (`managerFullDays` with a manager), then a linear ramp to the floor over
 * `rampDays`, then the floor plus automation, capped.
 */
export function offlineRate(absentDays: number, managerStars: number, automation: number): number {
  const o = SHOP.offline;
  const full = managerStars > 0 ? o.managerFullDays : o.fullDays;
  if (absentDays <= full) return 1;
  const ramp = (absentDays - full) / o.rampDays;
  if (ramp < 1) return 1 - (1 - o.floor) * ramp;
  return Math.min(o.automationCap, o.floor + o.automationStep * automation);
}

/** Trailing average of the last `window` game days of net income; missing days count at `baseline`. */
export function trailingNet(net: number[], baseline: number): number {
  const w = SHOP.value.window;
  let sum = 0;
  const n = Math.min(net.length, w);
  for (let k = net.length - n; k < net.length; k++) sum += net[k]!;
  return (sum + (w - n) * baseline) / w;
}

/** The income a shop is valued on: trailing net, capped at the fair multiple of the well-run target (S5). */
export function valuedIncome(net: number[], baseline: number): number {
  return Math.max(0, Math.min(trailingNet(net, baseline), SHOP.value.incomeCap * baseline));
}

/**
 * Net worth value of an owned shop. Until its trailing window is full of real days (`SHOP.value.window`), a shop is valued at
 * cost (the cash put in): the missing days would otherwise pad at the well-run baseline, so buying a shop would pay baseline
 * income on day one. Once the window is full, it is cash put in (at a discount) plus a multiple of valued income.
 */
export function shopValue(invested: number, net: number[], baseline: number): number {
  if (net.length < SHOP.value.window) return invested;
  return SHOP.value.investedShare * invested + SHOP.value.incomeMult * valuedIncome(net, baseline);
}

/** The reviews target for the day, clamped (inertia closes the gap separately). */
export function reviewsTarget(s: { quality: number; condition: number; managerStars: number; queue: number; price: number; morale: number }): number {
  const r = SHOP.reviews;
  const t = 1
    + SHOP.quality.reviewsPerLevel * s.quality
    + (s.condition >= SHOP.condition.goodFrom ? 0.1 : 0)
    + SHOP.manager.reviewsPerStar * s.managerStars
    - r.queuePenalty * s.queue
    - r.pricePenalty * Math.max(0, s.price - 1)
    + r.moraleWeight * (s.morale - r.moraleRef);
  return Math.min(r.max, Math.max(r.min, t));
}

/** Morale target: falls when demand runs past crew (the load on staff). */
export function moraleTarget(demand: number, crew: number): number {
  const load = crew > 0 ? demand / crew : Infinity;
  const t = 1 - SHOP.morale.overloadPenalty * Math.max(0, load - 1);
  return Math.min(1, Math.max(SHOP.morale.floor, t));
}

/** Demand lost to the queue, as a share of demand (0 when demand is 0). */
export function queueShare(demand: number, served: number): number {
  return demand > 0 ? Math.max(0, (demand - served) / demand) : 0;
}

/**
 * What a manager's autopilot holds for its star count (S2): the crew and quality floors and the price cap.
 * Zero stars means no autopilot (the floors are 0, the cap is unbounded).
 */
export function autopilotFor(stars: number): { crewFloor: number; qualityFloor: number; priceCap: number } {
  if (stars < 1) return { crewFloor: 0, qualityFloor: 0, priceCap: Infinity };
  const a = SHOP.manager.autopilot;
  const i = Math.min(a.crewFloor.length, Math.max(1, Math.floor(stars))) - 1;
  return { crewFloor: a.crewFloor[i]!, qualityFloor: a.qualityFloor[i]!, priceCap: a.priceCap[i]! };
}

/**
 * Operating costs for one game day, in money, given the well-run net target of the business (`roi x cost`).
 * `managerPaid` is true on the game days a manager's salary was prepaid at hire (S5): those days cost nothing more.
 */
export function dailyCosts(target: number, s: ShopState, maintainedNow: boolean, managerPaid = false): { wages: number; opex: number; marketing: number; quality: number; maintenance: number; manager: number } {
  return {
    wages: SHOP.crew.wagePerUnit * s.crew * target,
    opex: SHOP.opexPerDay * target,
    marketing: SHOP.marketing.costPerLevel * s.marketing * target,
    quality: SHOP.quality.costPerLevel * s.quality * target,
    maintenance: maintainedNow ? SHOP.maintenance.costPerDay * target : 0,
    manager: managerPaid ? 0 : SHOP.manager.costPerStar * s.managerStars * target,
  };
}

/** Whether a game day is inside a manager's prepaid window: the `prepayDays` boundaries after the hire. */
export function managerPrepaid(managerStars: number, managerDay: number, day: number): boolean {
  return managerStars > 0 && day - managerDay <= SHOP.manager.prepayDays;
}

/** Whether a number is one of the allowed levels for a stepped lever. */
export function isLevel(x: number, max: number): boolean {
  return Number.isInteger(x) && x >= 0 && x <= max;
}

/** Crew is allowed in steps of `SHOP.crew.step` within [min, max]. */
export function isCrew(x: number): boolean {
  if (!Number.isFinite(x)) return false;
  const c = SHOP.crew;
  if (x < c.min - 1e-9 || x > c.max + 1e-9) return false;
  const steps = (x - c.min) / c.step;
  return Math.abs(steps - Math.round(steps)) < 1e-9;
}

/** Crew after one game day of attrition (drifts toward the floor after the attrition window). */
export function attrition(crew: number, unattendedDays: number, hasManager: boolean): number {
  const a = SHOP.crew;
  if (hasManager || unattendedDays <= a.attritionAfterDays) return crew;
  return Math.max(a.floor, crew + (a.floor - crew) * a.attritionRate);
}

/** Served demand: the crew caps what the market buys (the rest joins the queue and is lost). */
export function servedOf(demand: number, crew: number): number {
  return Math.min(demand, crew);
}

/** Salary prepaid when a manager of `stars` is hired on a shop whose well-run target is `target` (S5). */
export function managerPrepayCost(stars: number, target: number): number {
  return SHOP.manager.prepayDays * SHOP.manager.costPerStar * stars * target;
}

/**
 * Prepaid salary a fire forfeits (S5 severance): the salary for the days the hire still covers after `day`,
 * which nothing refunds. Zero once the prepaid window has passed.
 */
export function managerForfeit(stars: number, target: number, managerDay: number, day: number): number {
  if (stars < 1) return 0;
  const left = Math.max(0, SHOP.manager.prepayDays - (day - managerDay));
  return left * SHOP.manager.costPerStar * stars * target;
}

/** The first game day a manager may be let go (a hire has a minimum term, S5). */
export function managerFireOpenDay(managerDay: number): number {
  return managerDay + SHOP.manager.minTenureDays;
}

/** The rolling review score on the 1 to 5 star scale (the reviews range maps linearly onto it, one decimal). */
export function reviewStars(reviews: number): number {
  const r = SHOP.reviews;
  const x = 1 + (4 * (reviews - r.min)) / (r.max - r.min);
  return Math.round(Math.min(5, Math.max(1, x)) * 10) / 10;
}

/** The crew sizes the lever offers, in steps from the minimum to the cap. */
export function crewSteps(): number[] {
  const c = SHOP.crew;
  const out: number[] = [];
  for (let k = 0; c.min + k * c.step <= c.max + 1e-9; k++) out.push(Math.round((c.min + k * c.step) * 1000) / 1000);
  return out;
}
