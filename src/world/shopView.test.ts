import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, stepGame } from './game';
import { TPD, bizDef, cashOf, credit, today } from './core';
import { shopView, shopViews } from './shopView';
import {
  crewSteps, managerFireOpenDay, managerForfeit, managerPrepayCost, reviewStars, servedOf,
} from './shopRules';
import { BUSINESSES, TIERS } from '@/content/businesses';
import { SHOP, SHOP_REFUSAL } from '@/content/shops';
import type { Business, Command, GameState } from './types';

function game(seed = 'shop-view'): GameState {
  return createGame(seed, { warmupDays: 1, npcs: false });
}

function cmd(g: GameState, pid: string, c: Command) {
  return applyCommand(g, pid, c);
}

function run(g: GameState, n: number) {
  for (let k = 0; k < n; k++) stepGame(g);
}

/** A joined player with a tier 1 food shop and enough cash to hire a manager. */
function tycoon(g: GameState): string {
  cmd(g, 'u1', { type: 'join', handle: 'tycoon', country: 'AV' });
  g.players.u1!.onboarding.skipped = true;
  const def = BUSINESSES.find((b) => b.tier === 1 && b.sector === 'food')!;
  const r = cmd(g, 'u1', { type: 'biz.buy', defId: def.id, cityId: 'avalon' });
  expect(r.ok).toBe(true);
  credit(g, 'u1', 50_000, 'test');
  return (r.data as { id: string }).id;
}

const T1_INCOME = BUSINESSES.find((b) => b.tier === 1 && b.sector === 'food')!.income;

describe('the shop view: the numbers come from the rules, the client only formats them', () => {
  it('a new shop shows its purchase settings, the day money as the rules compute it, and the lever ladders', () => {
    const g = game();
    const id = tycoon(g);
    const b = g.businesses[id] as Business;
    const v = shopView(g, b, cashOf(g, 'u1'));
    expect(v.id).toBe(id);
    expect(v.settings).toMatchObject({ crew: SHOP.crew.purchase, price: 1, pendingPrice: null, quality: 0, marketing: 0, maintained: false });
    expect(v.levels.crew).toEqual([0.5, 0.75, 1, 1.25, 1.5]);
    expect(v.levels.price).toEqual([...SHOP.prices]);
    expect(v.levels.quality).toEqual([0, 1, 2, 3]);
    // the day's money: revenue is the shop's income, the wage and opex lines follow the crew and the target
    expect(v.daily.revenue).toBe(b.incomePerDay);
    // cost lines are signed: money out is negative on the view
    expect(v.daily.wages).toBeCloseTo(-SHOP.crew.wagePerUnit * SHOP.crew.purchase * T1_INCOME, 9);
    expect(v.daily.opex).toBeCloseTo(-SHOP.opexPerDay * T1_INCOME, 9);
    expect(Object.is(v.daily.maintenance, 0)).toBe(true);
    expect(Object.is(v.daily.manager, 0)).toBe(true);
    const costs = v.daily.wages + v.daily.opex + v.daily.marketing + v.daily.quality + v.daily.maintenance + v.daily.manager;
    expect(v.daily.costs).toBeCloseTo(costs, 9);
    expect(v.daily.net).toBeCloseTo(v.daily.revenue + costs, 9);
  });

  it('every cost line is zero or negative, and a zero line is never negative zero', () => {
    const g = game();
    const id = tycoon(g);
    const b = g.businesses[id]!;
    cmd(g, 'u1', { type: 'biz.quality', bizId: id, level: 2 });
    cmd(g, 'u1', { type: 'biz.marketing', bizId: id, level: 1 });
    const v = shopView(g, b, cashOf(g, 'u1'));
    for (const k of ['wages', 'opex', 'marketing', 'quality', 'maintenance', 'manager', 'costs'] as const) {
      expect(v.daily[k]).toBeLessThanOrEqual(0);
      expect(Object.is(v.daily[k], -0)).toBe(false);
    }
    expect(v.daily.quality).toBeLessThan(0);
    expect(v.daily.marketing).toBeLessThan(0);
  });

  it('a manager keeps maintenance on: the view shows it on and charged, and the owner cannot turn it off', () => {
    const g = game();
    const id = tycoon(g);
    const b = g.businesses[id]!;
    expect(shopView(g, b, cashOf(g, 'u1')).settings).toMatchObject({ maintained: false, maintainedByManager: false });
    expect(cmd(g, 'u1', { type: 'biz.manager.hire', bizId: id, stars: 1 }).ok).toBe(true);
    const v = shopView(g, b, cashOf(g, 'u1'));
    expect(v.settings).toMatchObject({ maintained: true, maintainedByManager: true });
    expect(v.daily.maintenance).toBeCloseTo(-SHOP.maintenance.costPerDay * T1_INCOME, 9);
    expect(cmd(g, 'u1', { type: 'biz.maintain', bizId: id, on: false }).error).toBe(SHOP_REFUSAL.maintainManaged);
  });

  it('a price above the manager cap shows where it drops to; the cap is gone once the price is within it', () => {
    const g = game();
    const id = tycoon(g);
    const b = g.businesses[id]!;
    expect(shopView(g, b, cashOf(g, 'u1')).price.cappedTo).toBeNull();
    expect(cmd(g, 'u1', { type: 'biz.manager.hire', bizId: id, stars: 1 }).ok).toBe(true);
    expect(cmd(g, 'u1', { type: 'biz.price', bizId: id, price: 1.2 }).ok).toBe(true);
    expect(shopView(g, b, cashOf(g, 'u1')).price.cappedTo).toBe(SHOP.manager.autopilot.priceCap[0]);
    run(g, TPD + 1);
    // the day brought the price down to the cap: nothing above it, so nothing to explain
    const after = shopView(g, b, cashOf(g, 'u1'));
    expect(after.settings.price).toBe(SHOP.manager.autopilot.priceCap[0]);
    expect(after.price.cappedTo).toBeNull();
  });

  it('payback is the invested cash over the net per game day, and absent when the net is not positive', () => {
    const g = game();
    const id = tycoon(g);
    const b = g.businesses[id]!;
    b.incomePerDay = 1000;
    const v = shopView(g, b, cashOf(g, 'u1'));
    expect(v.daily.net).toBeGreaterThan(0);
    expect(v.payback.days).toBeCloseTo(b.invested / v.daily.net, 9);
    // well run pays back on the tier's roi: 1 / 0.1 = 10 game days for tier 1
    expect(v.payback.wellRunDays).toBeCloseTo(1 / TIERS[0]!.roi, 9);
    expect(v.payback.wellRunDays).toBeCloseTo(10, 9);
    // no revenue means the costs are the whole net, which is negative: no payback
    b.incomePerDay = 0;
    const none = shopView(g, b, cashOf(g, 'u1'));
    expect(none.daily.net).toBeLessThan(0);
    expect(none.payback.days).toBeNull();
  });

  it('served is the crew cap on demand, and the turned-away share is the rest of the demand', () => {
    const g = game();
    const id = tycoon(g);
    const b = g.businesses[id]!;
    const v = shopView(g, b, cashOf(g, 'u1'));
    expect(v.served).toBe(servedOf(b.shop.demand, b.shop.crew));
    expect(v.turnedAway).toBeCloseTo(Math.max(0, b.shop.demand - v.served), 9);
    expect(v.turnedAwayShare).toBeCloseTo(b.shop.demand > 0 ? v.turnedAway / b.shop.demand : 0, 9);
  });

  it('a manager is offered at 1 to 3 stars with its prepay and whether the owner can afford it', () => {
    const g = game();
    const id = tycoon(g);
    const b = g.businesses[id]!;
    const rich = shopView(g, b, 1e9);
    expect(rich.manager.offers.map((o) => o.stars)).toEqual([1, 2, 3]);
    for (const o of rich.manager.offers) {
      expect(o.prepay).toBeCloseTo(managerPrepayCost(o.stars, T1_INCOME), 9);
      expect(o.affordable).toBe(true);
      expect(o.shortfall).toBe(0);
    }
    const poor = shopView(g, b, 0);
    expect(poor.manager.offers.every((o) => !o.affordable)).toBe(true);
    expect(poor.manager.offers[2]!.shortfall).toBeCloseTo(managerPrepayCost(3, T1_INCOME), 9);
    expect(poor.manager.stars).toBe(0);
    expect(poor.manager.autopilot).toBeNull();
    expect(poor.manager.canFire).toBe(false);
  });

  it('a hired manager shows the prepay it forfeits on fire, the tenure, and the autopilot it holds', () => {
    const g = game();
    const id = tycoon(g);
    expect(cmd(g, 'u1', { type: 'biz.manager.hire', bizId: id, stars: 2 }).ok).toBe(true);
    const b = g.businesses[id]!;
    const day0 = today(g);
    const v = shopView(g, b, cashOf(g, 'u1'));
    expect(v.manager.stars).toBe(2);
    expect(v.manager.hiredDay).toBe(day0);
    expect(v.manager.fireOpenDay).toBe(managerFireOpenDay(day0));
    expect(v.manager.canFire).toBe(false);
    expect(v.manager.forfeit).toBeCloseTo(managerForfeit(2, T1_INCOME, day0, day0), 9);
    expect(v.manager.forfeit).toBeCloseTo(SHOP.manager.prepayDays * SHOP.manager.costPerStar * 2 * T1_INCOME, 9);
    expect(v.manager.autopilot).toEqual({
      crewFloor: SHOP.manager.autopilot.crewFloor[1],
      qualityFloor: SHOP.manager.autopilot.qualityFloor[1],
      priceCap: SHOP.manager.autopilot.priceCap[1],
    });
    // the refused fire says the day it opens, and the view agrees
    expect(cmd(g, 'u1', { type: 'biz.manager.fire', bizId: id }).error).toBe(SHOP_REFUSAL.managerTenure);
    run(g, TPD + 1);
    const later = shopView(g, b, cashOf(g, 'u1'));
    expect(later.manager.canFire).toBe(true);
    // one game day later, the prepaid days still ahead are what a fire forfeits (fewer than on the hire day)
    expect(later.manager.forfeit).toBeCloseTo(managerForfeit(2, T1_INCOME, day0, today(g)), 9);
    expect(later.manager.forfeit).toBeLessThan(v.manager.forfeit);
    expect(later.manager.forfeit).toBeGreaterThan(0);
  });

  it('a price change shows as pending, locks the day, and opens again on the next game day', () => {
    const g = game();
    const id = tycoon(g);
    const b = g.businesses[id]!;
    const day0 = today(g);
    expect(shopView(g, b, 0).price.changeable).toBe(true);
    expect(cmd(g, 'u1', { type: 'biz.price', bizId: id, price: 1.2 }).ok).toBe(true);
    const v = shopView(g, b, 0);
    expect(v.settings.pendingPrice).toBe(1.2);
    expect(v.price.changeable).toBe(false);
    expect(v.price.nextChangeDay).toBe(day0 + 1);
    expect(v.price.effectiveDay).toBe(day0 + 1);
    expect(cmd(g, 'u1', { type: 'biz.price', bizId: id, price: 1.1 }).error).toBe(SHOP_REFUSAL.priceOncePerDay);
    run(g, TPD + 1);
    const next = shopView(g, b, 0);
    expect(next.settings.price).toBe(1.2);
    expect(next.settings.pendingPrice).toBeNull();
    expect(next.price.effectiveDay).toBeNull();
    expect(next.price.changeable).toBe(true);
  });

  it('the offline window, the manager autopilot and the well-run settings are the server rules', () => {
    const g = game();
    const id = tycoon(g);
    const v = shopView(g, g.businesses[id]!, 0);
    expect(v.offline).toEqual({
      fullDays: SHOP.offline.fullDays,
      fullDaysManaged: SHOP.offline.managerFullDays,
      rampEndDays: SHOP.offline.fullDays + SHOP.offline.rampDays,
      rampEndDaysManaged: SHOP.offline.managerFullDays + SHOP.offline.rampDays,
      floor: SHOP.offline.floor,
    });
    expect(v.wellRun).toEqual({ crew: SHOP.crew.wellRun, quality: 1, maintained: true, price: 1 });
    expect(v.unattendedDays).toBeGreaterThanOrEqual(0);
  });

  it('shopViews keeps the order of the businesses and gives each one the same cash', () => {
    const g = game();
    const id = tycoon(g);
    const list = Object.values(g.businesses).filter((b) => b.ownerId === 'u1');
    const views = shopViews(g, list, 'u1');
    expect(views.map((x) => x.id)).toEqual(list.map((b) => b.id));
    expect(views[0]!.id).toBe(id);
    expect(views[0]!.manager.offers[0]!.affordable).toBe(cashOf(g, 'u1') >= managerPrepayCost(1, bizDef(list[0]!).income));
  });
});

describe('shop view helpers', () => {
  it('the star scale maps the review range onto 1 to 5 with one decimal', () => {
    expect(reviewStars(SHOP.reviews.min)).toBe(1);
    expect(reviewStars(SHOP.reviews.max)).toBe(5);
    expect(reviewStars(SHOP.reviews.start)).toBe(3.8);
    expect(reviewStars(-10)).toBe(1);
    expect(reviewStars(10)).toBe(5);
  });

  it('the crew ladder runs from the minimum to the cap in steps', () => {
    expect(crewSteps()).toEqual([0.5, 0.75, 1, 1.25, 1.5]);
  });

  it('a fire forfeits only the prepaid days still ahead, and nothing without a manager', () => {
    expect(managerForfeit(0, 100, 3, 3)).toBe(0);
    expect(managerForfeit(1, 100, 5, 5)).toBeCloseTo(SHOP.manager.prepayDays * SHOP.manager.costPerStar * 100, 9);
    expect(managerForfeit(1, 100, 5, 5 + SHOP.manager.prepayDays)).toBe(0);
    expect(managerForfeit(1, 100, 5, 5 + SHOP.manager.prepayDays + 3)).toBe(0);
  });

  it('the prepay is the salary of prepayDays at the star level on the target', () => {
    expect(managerPrepayCost(2, 50)).toBeCloseTo(SHOP.manager.prepayDays * SHOP.manager.costPerStar * 2 * 50, 9);
  });

  it('with no demand the turned-away share is zero, and the shop is still viewable', () => {
    const g = game();
    const id = tycoon(g);
    const b = g.businesses[id]!;
    b.shop.demand = 0;
    b.shop.crew = 0.5;
    const v = shopView(g, b, 0);
    expect(v.turnedAway).toBe(0);
    expect(v.turnedAwayShare).toBe(0);
    expect(v.served).toBe(0);
  });
});
