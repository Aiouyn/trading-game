/**
 * Shops (Phase 4 A1): the owner's levers on a business (crew, price, quality, marketing, maintenance,
 * manager), the day step that pays the costs and moves reviews, morale, condition and crew, and the
 * migration of saves from before the levers existed. Deterministic: no randomness is drawn here.
 */
import { SHOP, SHOP_REFUSAL } from '@/content/shops';
import type { UpgradeAxis } from '@/content/businesses';
import { debit, bizDef, cashOf, clamp, today, TPD } from './core';
import { markShares, recomputeShares } from './assets';
import {
  attrition, dailyCosts, isCrew, isLevel, moraleTarget, reviewsTarget, wellRunShop,
} from './shopRules';
import type { Business, CommandResult, Command, GameState, StepOutput } from './types';

const ok = (data?: unknown): CommandResult => ({ ok: true, ...(data !== undefined ? { data } : {}) });
const refuse = (error: string): CommandResult => ({ ok: false, error });

/** The owner's business, or a refusal code. */
function ownBiz(g: GameState, pid: string, bizId: string): Business | string {
  const b = g.businesses[bizId];
  if (!b) return SHOP_REFUSAL.missing;
  if (b.ownerId !== pid) return SHOP_REFUSAL.notYours;
  return b;
}

/** Every owner command on a shop counts as attention (attrition and the manager's cover run from here). */
function attend(g: GameState, b: Business): void {
  b.shop.lastAttendedTick = g.market.tick;
}

export function setCrew(g: GameState, pid: string, bizId: string, crew: number): CommandResult {
  const b = ownBiz(g, pid, bizId);
  if (typeof b === 'string') return refuse(b);
  if (!isCrew(crew)) return refuse(SHOP_REFUSAL.crewRange);
  b.shop.crew = crew;
  attend(g, b);
  markShares(g);
  return ok({ crew });
}

/** A price change takes effect at the next game day; one change per game day. */
export function setPrice(g: GameState, pid: string, bizId: string, price: number): CommandResult {
  const b = ownBiz(g, pid, bizId);
  if (typeof b === 'string') return refuse(b);
  if (!(SHOP.prices as readonly number[]).includes(price)) return refuse(SHOP_REFUSAL.priceLevel);
  const day = today(g);
  if (b.shop.priceDay === day) return refuse(SHOP_REFUSAL.priceOncePerDay);
  b.shop.pendingPrice = price;
  b.shop.priceDay = day;
  attend(g, b);
  markShares(g);
  return ok({ price, effectiveDay: day + 1 });
}

export function setQuality(g: GameState, pid: string, bizId: string, level: number): CommandResult {
  const b = ownBiz(g, pid, bizId);
  if (typeof b === 'string') return refuse(b);
  if (!isLevel(level, SHOP.quality.max)) return refuse(SHOP_REFUSAL.levelRange);
  b.shop.quality = level;
  attend(g, b);
  markShares(g);
  return ok({ level });
}

export function setMarketing(g: GameState, pid: string, bizId: string, level: number): CommandResult {
  const b = ownBiz(g, pid, bizId);
  if (typeof b === 'string') return refuse(b);
  if (!isLevel(level, SHOP.marketing.max)) return refuse(SHOP_REFUSAL.levelRange);
  b.shop.marketing = level;
  attend(g, b);
  markShares(g);
  return ok({ level });
}

export function setMaintained(g: GameState, pid: string, bizId: string, on: boolean): CommandResult {
  const b = ownBiz(g, pid, bizId);
  if (typeof b === 'string') return refuse(b);
  if (typeof on !== 'boolean') return refuse(SHOP_REFUSAL.maintainFlag);
  b.shop.maintained = on;
  attend(g, b);
  return ok({ on });
}

/** Hiring pays `prepayDays` of salary up front; nothing is refunded on fire. */
export function hireManager(g: GameState, pid: string, bizId: string, stars: number): CommandResult {
  const b = ownBiz(g, pid, bizId);
  if (typeof b === 'string') return refuse(b);
  if (!Number.isInteger(stars) || stars < 1 || stars > SHOP.manager.maxStars) return refuse(SHOP_REFUSAL.managerStars);
  if (b.shop.managerStars > 0) return refuse(SHOP_REFUSAL.managerPresent);
  const target = bizDef(b).income;
  const prepay = SHOP.manager.prepayDays * SHOP.manager.costPerStar * stars * target;
  if (cashOf(g, pid) < prepay) return refuse(SHOP_REFUSAL.cash);
  debit(g, pid, prepay, 'shop manager');
  b.shop.costs += prepay;
  b.shop.managerStars = stars;
  b.shop.managerDay = today(g);
  attend(g, b);
  markShares(g);
  return ok({ stars, prepaid: prepay });
}

export function fireManager(g: GameState, pid: string, bizId: string): CommandResult {
  const b = ownBiz(g, pid, bizId);
  if (typeof b === 'string') return refuse(b);
  if (b.shop.managerStars === 0) return refuse(SHOP_REFUSAL.managerNone);
  if (today(g) - b.shop.managerDay < SHOP.manager.minTenureDays) return refuse(SHOP_REFUSAL.managerTenure);
  b.shop.managerStars = 0;
  b.shop.managerDay = -1;
  attend(g, b);
  markShares(g);
  return ok();
}

/** Routes the shop commands; returns null for commands this module does not own. */
export function shopCommand(g: GameState, pid: string, cmd: Command): CommandResult | null {
  switch (cmd.type) {
    case 'biz.crew': return setCrew(g, pid, cmd.bizId, cmd.crew);
    case 'biz.price': return setPrice(g, pid, cmd.bizId, cmd.price);
    case 'biz.quality': return setQuality(g, pid, cmd.bizId, cmd.level);
    case 'biz.marketing': return setMarketing(g, pid, cmd.bizId, cmd.level);
    case 'biz.maintain': return setMaintained(g, pid, cmd.bizId, cmd.on);
    case 'biz.manager.hire': return hireManager(g, pid, cmd.bizId, cmd.stars);
    case 'biz.manager.fire': return fireManager(g, pid, cmd.bizId);
    default: return null;
  }
}

/** The commands a well-run owner would set: the NPC shops run these at purchase. */
export function wellRunCommands(bizId: string): Command[] {
  const w = wellRunShop(0);
  return [
    { type: 'biz.crew', bizId, crew: w.crew },
    { type: 'biz.quality', bizId, level: w.quality },
    { type: 'biz.maintain', bizId, on: w.maintained },
  ];
}

/** Money sinks for the day's operating costs, by line. */
const SINKS = {
  wages: 'shop wages', opex: 'shop opex', marketing: 'shop marketing', quality: 'shop quality',
  maintenance: 'shop maintenance', manager: 'shop manager',
} as const;

/**
 * Day boundary: a pending price takes effect; attrition and the condition decay (a manager keeps the
 * shop on autopilot within its skill); the day's operating costs are paid out; reviews and morale move
 * toward their targets; the day's net income joins the trailing window that values the shop (S5).
 */
export function shopsDay(g: GameState, out: StepOutput | null): void {
  void out;
  const tick = g.market.tick;
  for (const b of Object.values(g.businesses)) {
    const s = b.shop;
    const target = bizDef(b).income;
    if (s.pendingPrice !== null) { s.price = s.pendingPrice; s.pendingPrice = null; }
    const managed = s.managerStars > 0;
    s.crew = attrition(s.crew, (tick - s.lastAttendedTick) / TPD, managed);
    const maintainedNow = s.maintained || managed;
    s.condition = maintainedNow ? SHOP.maintenance.condition : Math.max(0, s.condition - SHOP.maintenance.decayPerDay);
    const k = dailyCosts(target, s, maintainedNow);
    let total = 0;
    for (const line of Object.keys(SINKS) as (keyof typeof SINKS)[]) {
      const amt = k[line];
      if (amt > 0) { debit(g, b.ownerId, amt, SINKS[line]); total += amt; }
    }
    s.costs += total;
    s.morale += SHOP.morale.inertia * (moraleTarget(s.demand, s.crew) - s.morale);
    s.reviews += SHOP.reviews.inertia * (reviewsTarget({
      quality: s.quality, condition: s.condition, managerStars: s.managerStars, queue: s.queue, price: s.price, morale: s.morale,
    }) - s.reviews);
    s.reviews = clamp(s.reviews, SHOP.reviews.min, SHOP.reviews.max);
    const earnedToday = b.earned - s.earnedMark;
    s.earnedMark = b.earned;
    s.net.push(earnedToday - total);
    if (s.net.length > SHOP.value.window) s.net.splice(0, s.net.length - SHOP.value.window);
  }
  recomputeShares(g);
}

/**
 * Saves from before the shop levers: every business gets well-run settings (so nobody is punished by the
 * upgrade), its marketing level moves to the marketing lever and its staff level to quality (S5 migration).
 * Idempotent; returns how many businesses were migrated.
 */
export function migrateShops(g: GameState): number {
  let n = 0;
  for (const b of Object.values(g.businesses)) {
    if (b.shop) continue;
    const legacy = b.levels as Partial<Record<UpgradeAxis, number>>;
    const shop = wellRunShop(g.market.tick);
    shop.marketing = clamp(legacy.marketing ?? 0, 0, SHOP.marketing.max);
    shop.quality = clamp(Math.max(shop.quality, legacy.staff ?? 0), 0, SHOP.quality.max);
    shop.earnedMark = b.earned;
    b.shop = shop;
    n++;
  }
  if (n) recomputeShares(g);
  return n;
}
