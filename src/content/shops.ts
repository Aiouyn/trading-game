/**
 * Shops (Phase 4 stage A1, DECISIONS S1-S6): every number that tunes a managed business lives here.
 * Money rates are shares of the well-run NET target of the business (its catalog income per game day,
 * roi x cost), so every operating cost scales with the tier margin: a T6 shop pays as much in
 * proportion as a T1 shop. One game day is one real hour (720 ticks), so good results come from
 * settings plus a manager, not from hourly clicks.
 */
export const SHOP = {
  /** Crew: working capacity in units of base demand. The owner's wage bill scales with it. */
  crew: {
    min: 0.5,
    /** the crew cap: a busy shop saturates here, which holds the excellent style on its ladder band (docs/V1-PHASE4.md 2.3) */
    max: 1.5,
    step: 0.25,
    /**
     * what a new purchase starts with: three quarters of a crew. A shop left alone runs on it and loses staff only
     * slowly (`attritionRate`), so neglect costs money over weeks, not on day one.
     */
    purchase: 0.75,
    /** what well-run play looks like (the migration default for existing saves, and NPC shops) */
    wellRun: 1,
    /** wages per unit of crew per game day (share of the well-run net target) */
    wagePerUnit: 0.3,
    /** a shop unattended this many game days loses crew, drifting toward `floor` */
    attritionAfterDays: 8,
    /** share of the gap to `floor` closed per unattended game day (a slow leak: staff drift, they do not walk out) */
    attritionRate: 0.01,
    floor: 0.5,
  },
  /** Price multipliers the owner may choose (one change per game day, effective the next day). */
  prices: [0.9, 1, 1.05, 1.1, 1.2],
  priceDefault: 1,
  /** Demand scales with price^-elasticity on top of the logit market share. */
  elasticity: 1.6,
  /**
   * Gross revenue at baseline demand, per game day, as a multiple of the well-run net target (`roi x cost`).
   * Well run (crew 1, price 1, quality 1, maintained) that nets about 1.05 x target after wages, opex and upkeep,
   * so payback is 1/roi game days; neglected (crew 0.75 drifting slowly, no upkeep) pays back in about 25 days.
   */
  revenueMult: 1.45,
  /** Operating expenses (rent, utilities) per game day, all shops. */
  opexPerDay: 0.1,
  quality: {
    max: 3,
    /** revenue lift per level */
    revenuePerLevel: 0.05,
    /** spend per level per game day */
    costPerLevel: 0.14,
    /** reviews target lift per level */
    reviewsPerLevel: 0.1,
  },
  marketing: {
    max: 3,
    /** logit appeal per level (share) */
    appealPerLevel: 0.26,
    /** spend per level per game day */
    costPerLevel: 0.13,
  },
  /** A maintained shop pays this per game day and holds its condition at 100 (amortised upkeep). */
  maintenance: {
    costPerDay: 0.02,
    condition: 100,
    /** condition lost per game day when not maintained (a run-down shop halves revenue only after about 50 days) */
    decayPerDay: 1,
  },
  condition: {
    /** below this, revenue is halved */
    lowBelow: 50,
    lowRevenue: 0.5,
    /** reviews get a lift at or above this */
    goodFrom: 80,
  },
  manager: {
    maxStars: 3,
    /** salary per star per game day */
    costPerStar: 0.02,
    /**
     * hiring pays this many days of salary up front (a real prepayment: the next `prepayDays` game days are not
     * charged the daily salary again); nothing is refunded on fire
     */
    prepayDays: 7,
    /** the earliest game days after hiring that the manager can be fired */
    minTenureDays: 1,
    /** reviews target lift per star */
    reviewsPerStar: 0.05,
    /**
     * Autopilot within the manager's skill (S2), by stars 1 to 3: the crew and quality floors it holds on each
     * game day, and the highest price it lets stand (above it, the price is brought back to the cap).
     */
    autopilot: {
      crewFloor: [0.75, 1.08, 1.25],
      qualityFloor: [0, 1, 2],
      priceCap: [1.05, 1.1, 1.2],
    },
  },
  reviews: {
    min: 0.3,
    max: 1.6,
    /** a new shop opens near the well-run target, so the first weeks are not a ramp (the ramp is a larger share of a T1 payback) */
    start: 1.2,
    /** share of the gap to the target closed per game day */
    inertia: 0.1,
    /** queue penalty: target falls by this times the share of demand lost to queues */
    queuePenalty: 0.8,
    /** reviews target falls by this per unit of price above 1 */
    pricePenalty: 0.5,
    /** morale above or below this reference moves reviews */
    moraleRef: 0.7,
    moraleWeight: 0.2,
  },
  morale: {
    start: 0.8,
    /** share of the gap to the target closed per game day */
    inertia: 0.2,
    /** target falls by this times the load above capacity (demand over crew) */
    overloadPenalty: 0.5,
    floor: 0.2,
  },
  /**
   * Offline income (S4): full for `fullDays` away, then a linear ramp down to `floor` over `rampDays`.
   * A manager extends full income to `managerFullDays`. Beyond the ramp: floor plus automation, capped.
   */
  offline: {
    fullDays: 8,
    managerFullDays: 16,
    rampDays: 8,
    floor: 0.25,
    automationStep: 0.05,
    automationCap: 0.5,
  },
  /** Net worth (S5): owned shops are valued on trailing income, not on a spike. */
  value: {
    /** days of net income averaged; missing days count at the well-run target */
    window: 7,
    /** share of invested cash valued on top of income */
    investedShare: 0.6,
    /** the income multiple used for valuation */
    incomeMult: 6,
    /** trailing income is capped at this multiple of the well-run target */
    incomeCap: 1.25,
  },
  /** Incidents (S2, S5): a bad event is likelier when a shop is run down. */
  incidents: {
    chance: 0.06,
    weakBadMult: 1.5,
    weakCondition: 50,
    weakReviews: 0.8,
  },
} as const;

/** Lever refusal codes, returned as `error` by the shop commands (the UI maps them to copy in stage C). */
export const SHOP_REFUSAL = {
  notYours: 'biz.not-yours',
  missing: 'biz.missing',
  crewRange: 'biz.crew.range',
  priceLevel: 'biz.price.level',
  priceOncePerDay: 'biz.price.once-a-day',
  levelRange: 'biz.level.range',
  maintainFlag: 'biz.maintain.flag',
  /** a manager keeps maintenance on (S2 autopilot): the owner cannot turn it off while the manager is hired */
  maintainManaged: 'biz.maintain.managed',
  managerPresent: 'biz.manager.present',
  managerNone: 'biz.manager.none',
  managerStars: 'biz.manager.stars',
  managerTenure: 'biz.manager.tenure',
  cash: 'biz.cash',
  retiredAxis: 'biz.axis.retired',
} as const;
