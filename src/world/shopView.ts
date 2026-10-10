/**
 * The shop management view (Phase 4 stage C, DECISIONS S2): what the Businesses app shows for each owned shop.
 * Every number is computed here, on the server, from the same rules the day step uses, so the client only
 * formats them. Owner-only: it goes into the private player view and nowhere else.
 */
import { SHOP } from '@/content/shops';
import { TIERS } from '@/content/businesses';
import { bizDef, cashOf, TPD, today } from './core';
import {
  autopilotFor, crewSteps, dailyCosts, managerFireOpenDay, managerForfeit, managerPrepayCost, managerPrepaid,
  reviewStars, servedOf, wellRunShop,
} from './shopRules';
import type { Business, GameState } from './types';

export interface ManagerOffer {
  stars: number;
  /** salary prepaid on hire at this star level */
  prepay: number;
  affordable: boolean;
  /** cash short of the prepayment (0 when affordable) */
  shortfall: number;
}

export interface ShopView {
  id: string;
  name: string;
  sector: string;
  tier: number;
  cityId: string;
  /** what the owner has put in (purchase and upgrades): the payback basis */
  invested: number;
  settings: {
    crew: number;
    /** price multiplier in effect today */
    price: number;
    /** the price set today, which takes effect at the next game day (null when none) */
    pendingPrice: number | null;
    quality: number;
    marketing: number;
    /** maintenance as it runs: the owner's setting, or on while a manager is hired */
    maintained: boolean;
    /** true while a manager keeps maintenance on, so the owner cannot turn it off (S2) */
    maintainedByManager: boolean;
  };
  /** the levels each lever offers, so the client never hard-codes the ladder */
  levels: { crew: number[]; price: number[]; quality: number[]; marketing: number[] };
  price: {
    /** one price change per game day: false when this shop's price already changed today */
    changeable: boolean;
    /** the first game day the next price change is allowed */
    nextChangeDay: number;
    /** the game day a pending price takes effect (null when none is pending) */
    effectiveDay: number | null;
    /**
     * the manager's price cap, when the price (pending or current) is above it: the next game day brings the price
     * down to this level (S2 autopilot). Null when it is within the cap or no manager is hired.
     */
    cappedTo: number | null;
  };
  condition: number;
  /** the rolling review score on the 1 to 5 star scale */
  stars: number;
  morale: number;
  demand: number;
  served: number;
  /** demand the crew could not serve, per game day (the queue, in demand units) */
  turnedAway: number;
  /** turned away as a share of demand (0 to 1) */
  turnedAwayShare: number;
  /**
   * the day's money per game day, signed: revenue is positive and every cost line is zero or negative (money out).
   * `costs` is the sum of the six cost lines and `net` is revenue plus costs. The client formats these, no more.
   */
  daily: {
    revenue: number;
    wages: number;
    opex: number;
    marketing: number;
    quality: number;
    maintenance: number;
    manager: number;
    costs: number;
    net: number;
  };
  /** payback on what was invested, at these settings (null when the net is not positive) */
  payback: { days: number | null; wellRunDays: number };
  manager: {
    stars: number;
    hiredDay: number;
    /** the first game day the manager may be let go */
    fireOpenDay: number;
    canFire: boolean;
    /** prepaid salary a fire forfeits (nothing is refunded) */
    forfeit: number;
    /** what a manager of each star level holds on autopilot */
    autopilot: { crewFloor: number; qualityFloor: number; priceCap: number } | null;
    offers: ManagerOffer[];
  };
  /** the away window, in game days (full income, then a ramp to the floor) */
  offline: { fullDays: number; fullDaysManaged: number; rampEndDays: number; rampEndDaysManaged: number; floor: number };
  /** the settings the migration and the NPC shops run: the "well run" line */
  wellRun: { crew: number; quality: number; maintained: boolean; price: number };
  /** game days since the owner last touched this shop */
  unattendedDays: number;
}

/** The shop's view. `cash` is the owner's cash now (it decides which manager hires are affordable). */
export function shopView(g: GameState, b: Business, cash: number): ShopView {
  const s = b.shop;
  const def = bizDef(b);
  const target = def.income;
  const day = today(g);
  const managed = s.managerStars > 0;
  const maintained = s.maintained || managed;
  const costs = dailyCosts(target, s, maintained, managerPrepaid(s.managerStars, s.managerDay, day));
  const costTotal = costs.wages + costs.opex + costs.marketing + costs.quality + costs.maintenance + costs.manager;
  const revenue = b.incomePerDay;
  const net = revenue - costTotal;
  // money out is negative on the view; zero stays a plain zero (never -0)
  const out = (x: number) => (x === 0 ? 0 : -x);
  const auto = managed ? autopilotFor(s.managerStars) : null;
  const pendingOrCurrent = s.pendingPrice ?? s.price;
  const served = servedOf(s.demand, s.crew);
  const turnedAway = Math.max(0, s.demand - served);
  const wr = wellRunShop(0);
  const tier = TIERS[def.tier - 1]!;
  const offers: ManagerOffer[] = [];
  for (let stars = 1; stars <= SHOP.manager.maxStars; stars++) {
    const prepay = managerPrepayCost(stars, target);
    offers.push({ stars, prepay, affordable: cash >= prepay, shortfall: Math.max(0, prepay - cash) });
  }
  const fireOpen = managerFireOpenDay(s.managerDay);
  return {
    id: b.id,
    name: b.name,
    sector: def.sector,
    tier: def.tier,
    cityId: b.cityId,
    invested: b.invested,
    settings: {
      crew: s.crew,
      price: s.price,
      pendingPrice: s.pendingPrice,
      quality: s.quality,
      marketing: s.marketing,
      maintained,
      maintainedByManager: managed,
    },
    levels: {
      crew: crewSteps(),
      price: [...SHOP.prices],
      quality: Array.from({ length: SHOP.quality.max + 1 }, (_, k) => k),
      marketing: Array.from({ length: SHOP.marketing.max + 1 }, (_, k) => k),
    },
    price: {
      changeable: s.priceDay !== day,
      nextChangeDay: s.priceDay === day ? day + 1 : day,
      effectiveDay: s.pendingPrice === null ? null : s.priceDay + 1,
      cappedTo: auto && pendingOrCurrent > auto.priceCap ? auto.priceCap : null,
    },
    condition: s.condition,
    stars: reviewStars(s.reviews),
    morale: s.morale,
    demand: s.demand,
    served,
    turnedAway,
    turnedAwayShare: s.demand > 0 ? turnedAway / s.demand : 0,
    daily: {
      revenue,
      wages: out(costs.wages),
      opex: out(costs.opex),
      marketing: out(costs.marketing),
      quality: out(costs.quality),
      maintenance: out(costs.maintenance),
      manager: out(costs.manager),
      costs: out(costTotal),
      net,
    },
    payback: {
      days: net > 0 ? b.invested / net : null,
      wellRunDays: 1 / tier.roi,
    },
    manager: {
      stars: s.managerStars,
      hiredDay: s.managerDay,
      fireOpenDay: fireOpen,
      canFire: managed && day >= fireOpen,
      forfeit: managerForfeit(s.managerStars, target, s.managerDay, day),
      autopilot: auto,
      offers,
    },
    offline: {
      fullDays: SHOP.offline.fullDays,
      fullDaysManaged: SHOP.offline.managerFullDays,
      rampEndDays: SHOP.offline.fullDays + SHOP.offline.rampDays,
      rampEndDaysManaged: SHOP.offline.managerFullDays + SHOP.offline.rampDays,
      floor: SHOP.offline.floor,
    },
    wellRun: { crew: wr.crew, quality: wr.quality, maintained: wr.maintained, price: wr.price },
    unattendedDays: Math.max(0, (g.market.tick - s.lastAttendedTick) / TPD),
  };
}

/** The owner's shop views, in the order of `businesses`. */
export function shopViews(g: GameState, businesses: Business[], pid: string): ShopView[] {
  const cash = cashOf(g, pid);
  return businesses.map((b) => shopView(g, b, cash));
}
