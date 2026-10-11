import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, stepGame } from './game';
import { TPD, bizDef, bizValue, bump, cashOf, credit, netWorthBreakdown, today } from './core';
import { recomputeShares } from './assets';
import { migrateShops, shopsDay, wellRunCommands } from './shops';
import { seedNpcs } from './npc';
import {
  attrition, autopilotFor, dailyCosts, isCrew, moraleTarget, offlineRate, purchaseShop, queueShare, reviewsTarget, shopValue,
  trailingNet, valuedIncome, wellRunShop,
} from './shopRules';
import { SHOP, SHOP_REFUSAL } from '@/content/shops';
import { BUSINESSES, RETIRED_UPGRADES, UPGRADES } from '@/content/businesses';
import { NPCS } from '@/content/progression';
import type { Business, Command, GameState } from './types';

function game(seed = 'shops'): GameState {
  return createGame(seed, { warmupDays: 1, npcs: false });
}

function cmd(g: GameState, pid: string, c: Command) {
  return applyCommand(g, pid, c);
}

/** A joined player with a business of tier 1 (cheap, lone pool). */
const HANDLES: Record<string, string> = { u1: 'tycoon', u2: 'rivalco' };

function tycoon(g: GameState, pid = 'u1'): string {
  cmd(g, pid, { type: 'join', handle: HANDLES[pid] ?? pid, country: 'AV' });
  g.players[pid]!.onboarding.skipped = true;
  const def = BUSINESSES.find((b) => b.tier === 1 && b.sector === 'food')!;
  const r = cmd(g, pid, { type: 'biz.buy', defId: def.id, cityId: 'avalon' });
  expect(r.ok).toBe(true);
  return (r.data as { id: string }).id;
}

function run(g: GameState, n: number) {
  for (let k = 0; k < n; k++) stepGame(g);
}

function hash(g: GameState): string {
  const s = JSON.stringify({ m: g.market.assets.map((a) => a.lnP), acc: g.market.accounts, b: g.businesses, p: g.players, sinks: g.economy.sinks });
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return String(h);
}

describe('shop levers and refusal codes', () => {
  it('a new purchase starts at the neglect-band defaults, and a well-run shop is the other end', () => {
    const g = game();
    const id = tycoon(g);
    const s = g.businesses[id]!.shop;
    expect(s.crew).toBe(SHOP.crew.purchase);
    expect(s.price).toBe(1);
    expect(s.maintained).toBe(false);
    expect(s.managerStars).toBe(0);
    expect(wellRunShop(0).crew).toBe(SHOP.crew.wellRun);
  });

  it('refuses out-of-range values and other owners with codes, and changes nothing', () => {
    const g = game();
    const id = tycoon(g);
    expect(cmd(g, 'u1', { type: 'biz.crew', bizId: id, crew: 0.6 }).error).toBe(SHOP_REFUSAL.crewRange);
    expect(cmd(g, 'u1', { type: 'biz.crew', bizId: id, crew: 2.5 }).error).toBe(SHOP_REFUSAL.crewRange);
    expect(cmd(g, 'u1', { type: 'biz.price', bizId: id, price: 1.3 }).error).toBe(SHOP_REFUSAL.priceLevel);
    expect(cmd(g, 'u1', { type: 'biz.quality', bizId: id, level: 4 }).error).toBe(SHOP_REFUSAL.levelRange);
    expect(cmd(g, 'u1', { type: 'biz.marketing', bizId: id, level: -1 }).error).toBe(SHOP_REFUSAL.levelRange);
    expect(cmd(g, 'u1', { type: 'biz.maintain', bizId: id, on: 'yes' as unknown as boolean }).error).toBe(SHOP_REFUSAL.maintainFlag);
    expect(cmd(g, 'u1', { type: 'biz.manager.hire', bizId: id, stars: 0 }).error).toBe(SHOP_REFUSAL.managerStars);
    expect(cmd(g, 'u1', { type: 'biz.manager.hire', bizId: id, stars: 4 }).error).toBe(SHOP_REFUSAL.managerStars);
    expect(cmd(g, 'u1', { type: 'biz.manager.fire', bizId: id }).error).toBe(SHOP_REFUSAL.managerNone);
    expect(cmd(g, 'u1', { type: 'biz.crew', bizId: 'nope', crew: 1 }).error).toBe(SHOP_REFUSAL.missing);
    cmd(g, 'u2', { type: 'join', handle: 'rivalco', country: 'AV' });
    expect(cmd(g, 'u2', { type: 'biz.crew', bizId: id, crew: 1 }).error).toBe(SHOP_REFUSAL.notYours);
    expect(g.businesses[id]!.shop.crew).toBe(SHOP.crew.purchase);
  });

  it('accepts only steps of the crew lever', () => {
    expect(isCrew(0.5)).toBe(true);
    expect(isCrew(1.25)).toBe(true);
    expect(isCrew(SHOP.crew.max)).toBe(true);
    expect(isCrew(1.75)).toBe(false); // above the crew cap
    expect(isCrew(0.6)).toBe(false);
    expect(isCrew(Number.NaN)).toBe(false);
  });

  it('a save with crew above the cap keeps its staff only up to the cap on the day step, with or without a manager', () => {
    const g = game();
    const id = tycoon(g);
    const b = g.businesses[id]!;
    b.shop.crew = 2; // what a save from before the cap can hold (the lever itself refuses it)
    shopsDay(g, null);
    expect(b.shop.crew).toBe(SHOP.crew.max);
    // a just-under-cap crew is not touched by the clamp
    b.shop.crew = 1.25;
    shopsDay(g, null);
    expect(b.shop.crew).toBe(1.25);
    // a manager's autopilot floor (1.25 at 1 star, 1.5 at 2) cannot hold a crew above the cap either
    b.shop.crew = 2;
    b.shop.managerStars = 2;
    b.shop.managerDay = today(g);
    shopsDay(g, null);
    expect(b.shop.crew).toBe(SHOP.crew.max);
  });

  it('crew caps the demand served: a shop short of crew earns less, one that has it earns the full demand', () => {
    const g = game();
    const id = tycoon(g);
    const b = g.businesses[id]!;
    cmd(g, 'u1', { type: 'biz.crew', bizId: id, crew: 0.5 });
    recomputeShares(g);
    const short = b.incomePerDay;
    cmd(g, 'u1', { type: 'biz.crew', bizId: id, crew: 1 });
    recomputeShares(g);
    const full = b.incomePerDay;
    // served is min(demand, crew): the ratio is set by the demand of this pool, whatever the regime
    const d = b.shop.demand;
    expect(full / short).toBeCloseTo(Math.min(d, 1) / Math.min(d, 0.5), 6);
    expect(b.shop.queue).toBeCloseTo(Math.max(0, (d - 1) / d), 9);
  });

  it('a price change waits for the next game day, and only one is allowed per game day', () => {
    const g = game();
    const id = tycoon(g);
    expect(cmd(g, 'u1', { type: 'biz.price', bizId: id, price: 1.05 }).ok).toBe(true);
    expect(cmd(g, 'u1', { type: 'biz.price', bizId: id, price: 1.1 }).error).toBe(SHOP_REFUSAL.priceOncePerDay);
    expect(g.businesses[id]!.shop.price).toBe(1);
    run(g, TPD + 2);
    expect(g.businesses[id]!.shop.price).toBe(1.05);
    expect(cmd(g, 'u1', { type: 'biz.price', bizId: id, price: 1.1 }).ok).toBe(true);
  });

  it('marketing spend lifts share in the pool, quality lifts revenue', () => {
    const g = game();
    const id = tycoon(g);
    const b = g.businesses[id]!;
    recomputeShares(g);
    const base = b.share;
    cmd(g, 'u1', { type: 'biz.marketing', bizId: id, level: 3 });
    recomputeShares(g);
    expect(b.share).toBeGreaterThan(base);
    const plain = b.incomePerDay;
    cmd(g, 'u1', { type: 'biz.quality', bizId: id, level: 3 });
    recomputeShares(g);
    expect(b.incomePerDay).toBeGreaterThan(plain);
  });

  it('the retired staff and marketing upgrades are refused, the live ones still work', () => {
    const g = game();
    const id = tycoon(g);
    expect(RETIRED_UPGRADES).toEqual(['staff', 'marketing']);
    expect(UPGRADES.map((u) => u.id)).not.toContain('staff');
    expect(cmd(g, 'u1', { type: 'biz.upgrade', bizId: id, axis: 'staff' }).error).toBe(SHOP_REFUSAL.retiredAxis);
    expect(cmd(g, 'u1', { type: 'biz.upgrade', bizId: id, axis: 'marketing' }).error).toBe(SHOP_REFUSAL.retiredAxis);
    expect(cmd(g, 'u1', { type: 'biz.upgrade', bizId: id, axis: 'equipment' }).ok).toBe(true);
  });
});

describe('condition, maintenance and the day step', () => {
  it('an unmaintained shop decays, a maintained one holds at 100 and pays for it', () => {
    const g = game();
    const idA = tycoon(g, 'u1');
    cmd(g, 'u1', { type: 'biz.maintain', bizId: idA, on: true });
    const idB = tycoon(g, 'u2');
    shopsDay(g, null);
    expect(g.businesses[idA]!.shop.condition).toBe(SHOP.maintenance.condition);
    expect(g.businesses[idB]!.shop.condition).toBe(SHOP.maintenance.condition - SHOP.maintenance.decayPerDay);
    expect(g.economy.sinks['shop maintenance']).toBeGreaterThan(0);
    expect(g.economy.sinks['shop wages']).toBeGreaterThan(0);
  });

  it('a run-down shop (condition below 50) earns half its revenue', () => {
    const g = game();
    const id = tycoon(g);
    const b = g.businesses[id]!;
    cmd(g, 'u1', { type: 'biz.crew', bizId: id, crew: 1 });
    recomputeShares(g);
    const healthy = b.incomePerDay;
    b.shop.condition = 40;
    recomputeShares(g);
    expect(b.incomePerDay / healthy).toBeCloseTo(SHOP.condition.lowRevenue, 6);
  });

  it('the operating costs are real sinks, scaled to the well-run target of the tier', () => {
    const k = dailyCosts(10, { ...purchaseShop(0), crew: 1, marketing: 0, quality: 0, managerStars: 0 }, false);
    expect(k.wages).toBeCloseTo(SHOP.crew.wagePerUnit * 10, 9);
    expect(k.opex).toBeCloseTo(SHOP.opexPerDay * 10, 9);
    expect(k.maintenance).toBe(0);
  });

  it('reviews fall with queues and price, and rise with quality, condition and a manager', () => {
    const base = { quality: 0, condition: 100, managerStars: 0, queue: 0, price: 1, morale: SHOP.morale.start };
    const good = reviewsTarget({ ...base, quality: 3, managerStars: 3 });
    expect(good).toBeGreaterThan(reviewsTarget(base));
    expect(reviewsTarget({ ...base, queue: 0.5 })).toBeLessThan(reviewsTarget(base));
    expect(reviewsTarget({ ...base, price: 1.2 })).toBeLessThan(reviewsTarget(base));
    expect(reviewsTarget({ ...base, queue: 1, price: 1.2, condition: 0 })).toBeGreaterThanOrEqual(SHOP.reviews.min);
  });

  it('morale falls only when demand runs past crew', () => {
    expect(moraleTarget(0.8, 1)).toBe(1);
    expect(moraleTarget(1.6, 1)).toBeLessThan(1);
    expect(queueShare(2, 1)).toBeCloseTo(0.5, 9);
    expect(queueShare(0, 0)).toBe(0);
  });
});

describe('offline income (S4)', () => {
  it('is full for 8 game days, ramps to 25% by 16, then the floor plus automation (capped)', () => {
    expect(offlineRate(0, 0, 0)).toBe(1);
    expect(offlineRate(8, 0, 0)).toBe(1);
    expect(offlineRate(12, 0, 0)).toBeCloseTo(0.625, 9);
    expect(offlineRate(16, 0, 0)).toBeCloseTo(0.25, 9);
    expect(offlineRate(60, 0, 0)).toBeCloseTo(0.25, 9);
  });

  it('automation lifts the floor after 16 days by 5 points a level, but never above 50%', () => {
    expect(offlineRate(60, 0, 2)).toBeCloseTo(0.35, 9);
    expect(offlineRate(60, 0, 5)).toBeCloseTo(0.5, 9);
    expect(offlineRate(60, 0, 5)).toBeLessThanOrEqual(0.5);
    expect(offlineRate(1000, 0, 5)).toBeLessThanOrEqual(0.5);
  });

  it('a manager extends full income to 16 game days and runs the same ramp after', () => {
    expect(offlineRate(16, 1, 0)).toBe(1);
    expect(offlineRate(20, 1, 0)).toBeCloseTo(0.625, 9);
    expect(offlineRate(24, 1, 0)).toBeCloseTo(0.25, 9);
  });

  it('unattended shops lose crew after 8 game days, a manager stops the drift', () => {
    expect(attrition(1, 8, false)).toBe(1);
    expect(attrition(1, 9, false)).toBeLessThan(1);
    expect(attrition(1, 9, true)).toBe(1);
    expect(attrition(SHOP.crew.floor, 30, false)).toBe(SHOP.crew.floor);
  });
});

describe('valuation guards (S5)', () => {
  it('a price or incident spike cannot lift the valued income past the fair multiple', () => {
    const base = BUSINESSES.find((b) => b.tier === 1)!.income;
    const spike = [base * 3, base * 3, base * 3, base * 3, base * 3, base * 3, base * 3];
    expect(valuedIncome(spike, base)).toBeCloseTo(SHOP.value.incomeCap * base, 9);
    const one = [base * 10];
    expect(valuedIncome(one, base)).toBeLessThanOrEqual(SHOP.value.incomeCap * base + 1e-9);
    // one day of spike is only a 7th of the window
    expect(trailingNet([base * 10], base)).toBeCloseTo((base * 10 + 6 * base) / 7, 9);
  });

  it('a fresh shop is valued at cost until its window holds a full week of real days: no baseline income on day zero or one', () => {
    const base = 100;
    // missing days pad at the baseline inside trailingNet, so the valuation waits for a full window of real days
    expect(trailingNet([], base)).toBe(base);
    expect(shopValue(1000, [], base)).toBe(1000);
    expect(shopValue(1000, [0], base)).toBe(1000);
    expect(shopValue(1000, [0, 0, 0, 0, 0, 0], base)).toBe(1000);
    const full = Array.from({ length: SHOP.value.window }, () => 0);
    expect(shopValue(1000, full, base)).toBeCloseTo(SHOP.value.investedShare * 1000 + SHOP.value.incomeMult * valuedIncome(full, base), 9);
  });

  it('a new business is at cost on day one of its ownership, with the baseline not paid out', () => {
    const g = game();
    const id = tycoon(g);
    const b: Business = g.businesses[id]!;
    b.shop.net = [];
    expect(bizValue(b)).toBe(b.invested);
    run(g, TPD + 1);
    // real days are on the window, but fewer than a full week: still at cost
    expect(b.shop.net.length).toBeGreaterThan(0);
    expect(b.shop.net.length).toBeLessThan(SHOP.value.window);
    expect(bizValue(b)).toBe(b.invested);
  });

  it('buying a shop leaves net worth unchanged: the cash becomes the business at cost', () => {
    const g = game();
    cmd(g, 'u1', { type: 'join', handle: 'tycoon', country: 'AV' });
    g.players.u1!.onboarding.skipped = true;
    const before = netWorthBreakdown(g, 'u1').total;
    const def = BUSINESSES.find((b) => b.tier === 1 && b.sector === 'food')!;
    const r = cmd(g, 'u1', { type: 'biz.buy', defId: def.id, cityId: 'avalon' });
    expect(r.ok).toBe(true);
    expect(netWorthBreakdown(g, 'u1').total).toBeCloseTo(before, 6);
  });

  it('hiring pays a week of salary up front and nothing comes back on fire', () => {
    const g = game();
    const id = tycoon(g);
    const cash0 = cashOf(g, 'u1');
    const r = cmd(g, 'u1', { type: 'biz.manager.hire', bizId: id, stars: 3 });
    expect(r.ok).toBe(true);
    const cost = (r.data as { prepaid: number }).prepaid;
    expect(cost).toBeCloseTo(SHOP.manager.prepayDays * SHOP.manager.costPerStar * 3 * BUSINESSES.find((b) => b.tier === 1 && b.sector === 'food')!.income, 9);
    expect(cashOf(g, 'u1')).toBeCloseTo(cash0 - cost, 6);
    expect(cmd(g, 'u1', { type: 'biz.manager.fire', bizId: id }).error).toBe(SHOP_REFUSAL.managerTenure);
    run(g, TPD + 1);
    const cash1 = cashOf(g, 'u1');
    expect(cmd(g, 'u1', { type: 'biz.manager.fire', bizId: id }).ok).toBe(true);
    // nothing comes back on fire: the fire moves no cash
    expect(cashOf(g, 'u1')).toBeCloseTo(cash1, 6);
    expect(g.businesses[id]!.shop.managerStars).toBe(0);
  });

  it('net worth values a shop on its trailing income, so a one-day spike moves net worth by a bounded amount', () => {
    const g = game();
    const id = tycoon(g);
    const b: Business = g.businesses[id]!;
    b.shop.net = [];
    const base = bizDefIncome(b);
    // a window of real days at the baseline, so the comparison is between two valued incomes
    b.shop.net = Array.from({ length: SHOP.value.window }, () => base);
    const flat = bizValue(b);
    b.shop.net = [base * 50, 0, 0, 0, 0, 0, 0];
    const spiked = bizValue(b);
    // the valued income tops out at the cap: at most (cap - 1) x well-run target more, times the multiple
    expect(spiked - flat).toBeLessThanOrEqual(SHOP.value.incomeMult * (SHOP.value.incomeCap - 1) * base + 1e-6);
    expect(spiked - flat).toBeGreaterThan(0);
  });
});

function bizDefIncome(b: Business): number {
  return BUSINESSES.find((x) => x.id === b.defId)!.income;
}

describe('migration of saves from before the levers', () => {
  it('gives old businesses well-run settings, moves marketing and staff levels, and is idempotent', () => {
    const g = game();
    const id = tycoon(g);
    const old = g.businesses[id]!;
    const legacy = { ...old, levels: { ...old.levels, marketing: 2, staff: 3 } } as Partial<Business>; // a save from before the levers
    delete legacy.shop;
    g.businesses[id] = legacy as Business;
    expect(migrateShops(g)).toBe(1);
    const s = g.businesses[id]!.shop;
    expect(s.crew).toBe(SHOP.crew.wellRun);
    expect(s.maintained).toBe(true);
    expect(s.marketing).toBe(2);
    expect(s.quality).toBe(3);
    expect(s.earnedMark).toBe(g.businesses[id]!.earned);
    expect(migrateShops(g)).toBe(0);
  });

  it('a save taken right after a game day boundary replays to the same state as the live game', () => {
    const g = game();
    const id = tycoon(g);
    cmd(g, 'u1', { type: 'biz.crew', bizId: id, crew: 1 });
    cmd(g, 'u1', { type: 'biz.quality', bizId: id, level: 2 });
    run(g, 2);
    // stop on a day boundary: the day step (costs, reviews, shares) has just run
    while ((g.market.tick - 1) % TPD !== 0) stepGame(g);
    const copy = JSON.parse(JSON.stringify(g)) as GameState;
    for (let k = 0; k < 40; k++) {
      cmd(g, 'u1', { type: 'biz.marketing', bizId: id, level: k % 4 });
      cmd(copy, 'u1', { type: 'biz.marketing', bizId: id, level: k % 4 });
      stepGame(g);
      stepGame(copy);
    }
    expect(hash(copy)).toBe(hash(g));
  }, 60_000);
});

describe('determinism', () => {
  it('two games with the same seed and the same commands end in the same state', () => {
    const play = (seed: string) => {
      const g = game(seed);
      const id = tycoon(g);
      cmd(g, 'u1', { type: 'biz.crew', bizId: id, crew: 1.25 });
      cmd(g, 'u1', { type: 'biz.maintain', bizId: id, on: true });
      run(g, TPD + 5);
      cmd(g, 'u1', { type: 'biz.price', bizId: id, price: 1.05 });
      run(g, 5);
      return hash(g);
    };
    expect(play('same')).toBe(play('same'));
  }, 60_000);

  it('a manager stops the attrition drift on crew, and its autopilot lifts crew to the floor of its skill', () => {
    const g = game();
    const id = tycoon(g);
    cmd(g, 'u1', { type: 'biz.manager.hire', bizId: id, stars: 2 });
    const b = g.businesses[id]!;
    b.shop.lastAttendedTick = g.market.tick - 30 * TPD;
    shopsDay(g, null);
    expect(b.shop.crew).toBe(autopilotFor(2).crewFloor);
    expect(b.shop.crew).toBeGreaterThanOrEqual(SHOP.crew.purchase);
  });
});

/** Sum of the shop operating sinks booked so far. */
function shopSinks(g: GameState): number {
  return Object.entries(g.economy.sinks).filter(([k]) => k.startsWith('shop ')).reduce((s, [, v]) => s + v, 0);
}

describe('NPC shops, the manager autopilot and the costs (S2, S5)', () => {
  it('NPC shops are run by their persona and never drift; an unattended player shop does', () => {
    const g = createGame('npc-shops', { warmupDays: 1, npcs: false });
    seedNpcs(g);
    const npc = NPCS[0]!.id;
    credit(g, npc, 1e6, 'test');
    const def = BUSINESSES.find((b) => b.tier === 1)!;
    const r = applyCommand(g, npc, { type: 'biz.buy', defId: def.id, cityId: 'avalon' });
    expect(r.ok).toBe(true);
    const npcBiz = (r.data as { id: string }).id;
    for (const c of wellRunCommands(npcBiz)) applyCommand(g, npc, c);
    const mine = tycoon(g);
    for (let d = 0; d < 40; d++) {
      g.market.tick += TPD;
      shopsDay(g, null);
    }
    expect(g.businesses[npcBiz]!.shop.crew).toBe(SHOP.crew.wellRun);
    expect(g.businesses[mine]!.shop.crew).toBeLessThan(SHOP.crew.purchase);
  });

  it('a manager is prepaid for a week: those game days are not charged the salary again, the next one is', () => {
    const g = game();
    const id = tycoon(g);
    const b = g.businesses[id]!;
    const r = cmd(g, 'u1', { type: 'biz.manager.hire', bizId: id, stars: 1 });
    const prepay = (r.data as { prepaid: number }).prepaid;
    const salary = SHOP.manager.costPerStar * bizDef(b).income;
    expect(g.economy.sinks['shop manager']).toBeCloseTo(prepay, 9);
    for (let d = 1; d <= SHOP.manager.prepayDays; d++) {
      g.market.tick += TPD;
      shopsDay(g, null);
    }
    expect(g.economy.sinks['shop manager']).toBeCloseTo(prepay, 9);
    g.market.tick += TPD;
    shopsDay(g, null);
    expect(g.economy.sinks['shop manager']).toBeCloseTo(prepay + salary, 9);
  });

  it('the autopilot holds crew and quality floors and caps the price at the level of its skill', () => {
    const g = game();
    const id = tycoon(g);
    cmd(g, 'u1', { type: 'biz.manager.hire', bizId: id, stars: 2 });
    cmd(g, 'u1', { type: 'biz.price', bizId: id, price: 1.2 });
    g.market.tick += TPD;
    shopsDay(g, null);
    const s = g.businesses[id]!.shop;
    expect(s.crew).toBe(autopilotFor(2).crewFloor);
    expect(s.quality).toBe(autopilotFor(2).qualityFloor);
    expect(s.price).toBe(autopilotFor(2).priceCap);
    expect(autopilotFor(3).crewFloor).toBeGreaterThan(autopilotFor(1).crewFloor);
    expect(autopilotFor(0).crewFloor).toBe(0);
  });

  it('running costs can take cash below zero, and the owner is told', () => {
    const g = game();
    const id = tycoon(g);
    cmd(g, 'u1', { type: 'biz.maintain', bizId: id, on: true });
    bump(g, 'u1', -(cashOf(g, 'u1') - 1));
    shopsDay(g, null);
    expect(cashOf(g, 'u1')).toBeLessThan(0);
    expect(g.players.u1!.inbox[0]?.text).toMatch(/below zero/);
  });

  it('the overdraft notice is sent once, when the costs first take cash below zero, and its copy is a message key', () => {
    const g = game();
    const id = tycoon(g);
    cmd(g, 'u1', { type: 'biz.maintain', bizId: id, on: true });
    bump(g, 'u1', -(cashOf(g, 'u1') - 1));
    shopsDay(g, null);
    const notes = () => g.players.u1!.inbox.filter((n) => n.msg?.key === 'shop.overdraft.inbox');
    expect(notes()).toHaveLength(1);
    expect(notes()[0]!.msg!.vars).toEqual({ name: g.businesses[id]!.name });
    // the costs keep coming out while cash stays negative, and the owner is not told again each day
    shopsDay(g, null);
    shopsDay(g, null);
    expect(cashOf(g, 'u1')).toBeLessThan(0);
    expect(notes()).toHaveLength(1);
  });

  it('a hired manager keeps maintenance on: turning it off is refused and the stored setting is kept', () => {
    const g = game();
    const id = tycoon(g);
    expect(cmd(g, 'u1', { type: 'biz.manager.hire', bizId: id, stars: 1 }).ok).toBe(true);
    expect(cmd(g, 'u1', { type: 'biz.maintain', bizId: id, on: false }).error).toBe(SHOP_REFUSAL.maintainManaged);
    expect(g.businesses[id]!.shop.maintained).toBe(false);
    // turning it on is already true under the manager, and is kept for after the manager leaves
    expect(cmd(g, 'u1', { type: 'biz.maintain', bizId: id, on: true }).ok).toBe(true);
    expect(g.businesses[id]!.shop.maintained).toBe(true);
  });

  it('on the same state, demand follows price to the minus elasticity and revenue follows the served demand', () => {
    const g = game();
    const id = tycoon(g);
    const b = g.businesses[id]!;
    recomputeShares(g);
    const demand1 = b.shop.demand;
    const income1 = b.incomePerDay;
    b.shop.price = 1.2;
    recomputeShares(g);
    expect(b.shop.demand / demand1).toBeCloseTo(Math.pow(1.2, -SHOP.elasticity), 9);
    // revenue is the crew-capped demand times the price: the crew serves what it can, the rest is turned away
    const served1 = Math.min(demand1, b.shop.crew);
    const served2 = Math.min(b.shop.demand, b.shop.crew);
    expect(b.incomePerDay / income1).toBeCloseTo((served2 * 1.2) / served1, 9);
  });

  it('money is conserved: cash moves only by the income credited and the shop sinks', () => {
    const g = game();
    const id = tycoon(g);
    cmd(g, 'u1', { type: 'biz.manager.hire', bizId: id, stars: 2 });
    cmd(g, 'u1', { type: 'biz.crew', bizId: id, crew: 1.5 });
    cmd(g, 'u1', { type: 'biz.quality', bizId: id, level: 2 });
    cmd(g, 'u1', { type: 'biz.marketing', bizId: id, level: 1 });
    // the engine books cash interest on the account itself (not through the economy ledger), so it is counted here
    const net = () => (g.market.accounts.u1?.interestEarned ?? 0) - (g.market.accounts.u1?.interestPaid ?? 0);
    const cash0 = cashOf(g, 'u1');
    const int0 = net();
    const inc0 = g.economy.faucets['business income'] ?? 0;
    const sinks0 = shopSinks(g);
    run(g, 3 * TPD + 7);
    const cashDelta = cashOf(g, 'u1') - cash0;
    const incomeDelta = (g.economy.faucets['business income'] ?? 0) - inc0;
    const costDelta = shopSinks(g) - sinks0;
    const interestDelta = net() - int0;
    expect(incomeDelta).toBeGreaterThan(0);
    expect(costDelta).toBeGreaterThan(0);
    expect(cashDelta).toBeCloseTo(incomeDelta + interestDelta - costDelta, 4);
  }, 60_000);

  it('a snapshot taken mid-day, right after a lever command, restores to the same incomes and state', () => {
    const g = game();
    const id = tycoon(g);
    run(g, 3);
    if ((g.market.tick - 1) % TPD === 0) stepGame(g);
    expect((g.market.tick - 1) % TPD).not.toBe(0);
    cmd(g, 'u1', { type: 'biz.crew', bizId: id, crew: 0.5 });
    const copy = JSON.parse(JSON.stringify(g)) as GameState;
    expect(copy.businesses[id]!.incomePerDay).toBe(g.businesses[id]!.incomePerDay);
    stepGame(g);
    stepGame(copy);
    expect(copy.businesses[id]!.incomePerDay).toBe(g.businesses[id]!.incomePerDay);
    expect(copy.businesses[id]!.shop.queue).toBe(g.businesses[id]!.shop.queue);
    for (let k = 0; k < 40; k++) {
      cmd(g, 'u1', { type: 'biz.marketing', bizId: id, level: k % 4 });
      cmd(copy, 'u1', { type: 'biz.marketing', bizId: id, level: k % 4 });
      stepGame(g);
      stepGame(copy);
    }
    expect(hash(copy)).toBe(hash(g));
  }, 60_000);
});
