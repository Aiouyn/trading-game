/**
 * Player-run funds (ROADMAP 2.2, Phase 4 stage A4). Every number a balance pass may tune lives here, and the world module
 * (src/world/funds) reads nothing else.
 *
 * Time: one game day is one real hour (720 ticks, core TPD), so a real day is 24 game days. Each timing names its unit.
 * Quarters (63 game days) and years (252) are the engine's own calendar (ecology QUARTER_DAYS, universe daysPerYear).
 */

/** Ticks per game day (must equal core TPD; the funds tests assert it). */
export const FUND_TICKS_PER_DAY = 720;
const REAL_DAY = 24 * FUND_TICKS_PER_DAY;

export const FUND_TIME = {
  /** game days in a quarter (ecology QUARTER_DAYS): the fee crystallization point */
  quarterDays: 63,
  /** game days in a year (universe daysPerYear): the fee and custody accrual base */
  yearDays: 252,
  /** 72 real hours offline freezes trading and opens redemptions gate-free */
  absentFreezeTicks: 72 * FUND_TICKS_PER_DAY,
  /** game days from the freeze until the automatic wind-down (ROADMAP 2.2, safeguard 5) */
  windDownDays: 14,
  /** 24 real hours of notice before a mandate change takes effect */
  mandateNoticeTicks: 24 * FUND_TICKS_PER_DAY,
  /** a redemption within 2 real days of the deposit's settlement pays the early-exit fee, kept in the fund */
  earlyExitTicks: 2 * REAL_DAY,
  /** an investor account must be at least 7 real days old */
  investorAgeTicks: 7 * REAL_DAY,
  /** a manager's account must be at least 14 game days old (ROADMAP 2.2 "account ≥ 14 days old") */
  managerAgeTicks: 14 * FUND_TICKS_PER_DAY,
  /** the first 14 real days of a fund carry the young-fund AUM cap */
  youngFundTicks: 14 * REAL_DAY,
  /** 8 real weeks (56 real days): the conviction look-back and the length of the fund-management ban */
  eightWeeksTicks: 56 * REAL_DAY,
  /** the drawdown breaker looks back one game week (7 game days) */
  breakerWindowDays: 7,
  /** the breaker freezes new trades for one game day */
  breakerFreezeTicks: FUND_TICKS_PER_DAY,
  /** the surveillance window for front-running: a personal trade within one game day before a fund trade */
  frontRunWindowTicks: FUND_TICKS_PER_DAY,
};

export const FUND_RULES = {
  /** one open fund per manager at a time */
  maxFundsPerManager: 1,
  /** Operator (R3) or higher (ROADMAP 2.2: Derivatives license) */
  managerMinRank: 'R3',
  /** the manager's stake: at least this many dollars, and at least stakeMinPct of AUM at all times */
  managerMinStake: 250_000,
  stakeMinPct: 0.10,
  /** AUM may not exceed this many times the manager's stake */
  aumPerStake: 10,
  /** the young-fund cap on AUM, in dollars, for the first youngFundTicks */
  youngAumCap: 10_000_000,
  /** mandate limits: leverage at most 1.5x, one position at most 20% of NAV */
  leverageMin: 1,
  leverageMax: 1.5,
  positionMaxPct: 0.20,
  /** an asset the manager is an insider of, or holds at least floatFilingPct of, is capped and filed publicly */
  insiderPositionMaxPct: 0.05,
  floatFilingPct: 0.01,
  /** asset classes a mandate may name (the traded classes; realestate is priced by district indices, not traded) */
  classes: ['stock', 'crypto', 'commodity', 'forex', 'bond'] as const,
  /** fee ceilings: management per game year (accrued daily, paid at the quarter), performance over the high-water mark */
  mgmtFeeMax: 0.02,
  mgmtFeeDefault: 0.02,
  perfFeeMax: 0.20,
  perfFeeDefault: 0.20,
  /** the custody sink: a per-game-year fee on NAV, to the Clearing House */
  custodyFeePerYear: 0.0025,
  /** redemptions settled per game day: at most this share of AUM, pro-rata (gate-free while frozen, breaker or notice) */
  redeemGatePct: 0.20,
  earlyExitFeePct: 0.01,
  /** an investor's holding in one fund, after the deposit, at most this share of their net worth */
  investorMaxNwPct: 0.25,
  /** a drawdown of this share from the one-week high trips the breaker */
  breakerDropPct: 0.30,
  /** deposits and names */
  minDeposit: 100,
  minNameLength: 3,
  maxNameLength: 30,
  /** the public AUM buckets (dollars): below the first, the first to the second, and so on */
  aumBuckets: [100_000, 1_000_000, 10_000_000] as const,
  /** front-running evidence: points per fund trade that follows a personal trade in the same asset and side */
  frontRunEvidence: 20,
  /** the civil bar a fund-abuse case must meet (court.ts) */
  civilBar: 40,
  /** S5 penalties (ROADMAP 2.2): fine 8% of NW (floor $100k), at most 35% of NW; restitution 1.5x the harm, from the stake first */
  s5: { pct: 0.08, floor: 100_000, capPct: 0.35, restitutionX: 1.5 },
  /** the most NAV history points the public view keeps (one per game day) */
  navHistoryKeep: 400,
  /** the most recent manager fills kept for surveillance (one game day covers them: the array is pruned by tick) */
  managerFillsKeep: 400,
};
