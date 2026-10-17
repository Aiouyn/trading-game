// a game day in ticks: the same figure as core.ts TPD (720 ticks, one real hour). Local so core can import this module without a cycle.
export const TPD = 720;

/**
 * The Launchpad's numbers (lead-launchpad.md, L2 to L6). Every rule reads from here, so the balance gate and the tests use the
 * same figures as the game. Units: money in game dollars, time in ticks (TPD = 720 ticks = one game day, one real hour).
 */

export const LP = {
  /** the bonding curve: virtual cash X0 and virtual tokens Y0 (L3), so k = X0 * Y0 */
  X0: 15_000,
  Y0: 1_073_000_000,
  /** fixed supply of every token (L2) */
  SUPPLY: 1_000_000_000,
  /** tokens the curve sells: Y0 - GRAD_Y (L3) */
  CURVE_SUPPLY: 800_000_000,
  /** the virtual token reserve at graduation (Y = 273M, about $43,950 raised) */
  GRAD_Y: 273_000_000,
  /** the creator allocation is 0 to 50M tokens (L2) */
  ALLOC_MAX: 50_000_000,
  /** the creator's allocation plus their curve buys, as a share of supply (L3: 10%) */
  CREATOR_CAP: 100_000_000,
  /** trading fee on notional, each way (L3), split half to the creator and half to a sink */
  FEE_RATE: 0.01,
  /** the launch fee, a booked sink (L2). R-10-6 (Phase 10): $100, down from $1,000; the lead re-runs the held-out launchpad gate */
  LAUNCH_FEE: 100,
  /** the graduation fee on the raised cash, a booked sink (L4) */
  GRAD_FEE_RATE: 0.015,
  /** the ticket's default maximum slippage (L3) */
  MAX_SLIP: 0.05,
  /** launch gate: account age of at least 1 real day (24 game days), one launch per 24 real hours, at most 3 live tokens */
  MIN_AGE_TICKS: 24 * TPD,
  LAUNCH_COOLDOWN_TICKS: 24 * TPD,
  MAX_LIVE: 3,
  /** the rank a launch needs: R1 (Hustler) or higher */
  MIN_RANK_INDEX: 1,
  /** tickers used in the last 30 game days are taken (L2) */
  TICKER_HOLD_DAYS: 30,
  /** the base hype a player's sale takes back (per $100 sold). Player buys add no buzz (L6.5, no copycat in V1) */
  SELL_BUZZ_PER_100: 0.01,
  /** the ticker is 3 to 5 letters; the name is 3 to 24 characters */
  TICKER_MIN: 3,
  TICKER_MAX: 5,
  NAME_MIN: 3,
  NAME_MAX: 24,
  /** vesting (L5): the creator allocation is locked until the cliff, then unlocks linearly to the end day */
  VEST_CLIFF_DAYS: 2,
  VEST_END_DAYS: 14,
  /** death (L3, L3.1 as v1.3): no trade for 24 game days, or curve cash under 2% of the raise at the CLOSE of each of 7 consecutive game
   *  days, the closes counted from day 3 on. An intraday round trip does not reset the clock; a close above the line does */
  DEAD_NO_TRADE_DAYS: 24,
  DEAD_CASH_FRAC: 0.02,
  DEAD_CASH_DAYS: 7,
  DEAD_CASH_FROM_DAY: 3,
  /** the first tick of day DEAD_CASH_FROM_DAY (dayOf(tick) >= 3 from here): the cash clock never counts a close before it */
  DEAD_CASH_START_TICK: 3 * TPD + 1,
  /** rug flag (L5) */
  RUG_WINDOW_DAYS: 24,
  RUG_SELL_FRAC: 0.5,
  RUG_DUMP_SUPPLY_FRAC: 0.03,
  RUG_DUMP_PRICE_FALL: 0.4,
  /** a holder who bought within this many game days before a flagged dump may sue (L5) */
  RUG_BUY_WINDOW_DAYS: 7,
  /** a creator who loses a rug case is barred from launching for 8 real weeks (L5). A real week is 168 real hours and a game day
   *  is one real hour, so the ban is 1,344 game days (the chapter convention, core.ts CHAPTER_TICKS). */
  RUG_BAN_WEEKS: 8,
  RUG_BAN_TICKS: 8 * 7 * 24 * TPD,
  /** the court's fine level for a rug verdict: an index into court-scale.ts SEVERITY (2, the cyber-intrusion level) */
  RUG_SEVERITY: 2,
  /** a creator sell of 1% of supply or more in a day is a Wire item (L5) */
  BIG_SELL_SUPPLY_FRAC: 0.01,
  /** buzz items (L6): a Quay billboard and a Wire promo, both sinks, at most three per token per game day */
  BOARD_COST: 500,
  WIRE_PROMO_COST: 2_000,
  BUZZ_MAX_PER_DAY: 3,
  BOARD_HALF_TICKS: 6,
  WIRE_HALF_TICKS: TPD,
  BOARD_ADD: 0.5,
  WIRE_ADD: 1.5,
  /** the base hype decays with a half-life of two game days (L6) */
  BASE_HALF_TICKS: 2 * TPD,
  /** the price is sampled into the chart every this many ticks (one real minute) */
  CHART_EVERY: 12,
  /** the tape keeps this many recent trades per token */
  TAPE_KEEP: 80,
  /** a feed shows at most this many tokens */
  FEED_KEEP: 60,
  /** R-10-6 (Phase 10): the description and a reply are at most this many characters (plain text, moderated) */
  DESC_MAX: 140,
  REPLY_MAX: 140,
  /** the replies a token keeps (newest last) */
  REPLY_KEEP: 60,
  /** a player may reply once a real minute on a token (12 ticks): the one spam brake the world needs */
  REPLY_COOLDOWN_TICKS: 12,
  /** NPC replies: at most one a token every this many ticks (five real minutes), and only while the token traded in the window */
  NPC_REPLY_GAP_TICKS: 60,
  NPC_REPLY_WINDOW_TICKS: 60,
  NPC_REPLY_ODDS: 0.2,
  /** the generated image: the creator picks one of this many variants at launch (no uploads) */
  ART_VARIANTS: 4,
  /** the holder distribution on a token page: the top this many rows (the curve, the dev and the NPC cohort are rows too) */
  HOLDERS_SHOWN: 20,
  /** the live trades bar: the newest this many trades across tokens */
  TRADE_BAR: 28,
  /** the candles a token keeps (review fix, Phase 10): one bar per tick (5 real seconds at 1×), the minute bars (one real
   *  minute each, CHART_EVERY ticks) and the hour bars (one game day each, TPD ticks). A tick with no trade carries the last
   *  price flat; trades set the high and the low. The tick series is the last real hour. */
  BAR_TICKS: 720,
  BAR_MINUTES: 240,
  BAR_HOURS: 24,
} as const;

/** the curve's constant product k = X0 * Y0 */
export const LP_K = LP.X0 * LP.Y0;

/** the token-level rung of the account and asset ids the world uses */
export const curveAccountId = (ticker: string) => `lp:curve:${ticker}`;
export const bookAccountId = (ticker: string) => `lp:book:${ticker}`;
export const npcAccountId = (ticker: string) => `lp:npc:${ticker}`;
/** the NPC cohort's engine account after graduation (its id is not a player's: its fills are not holders' lots, rug.ts lpFills) */
export const isNpcAccount = (id: string) => id.startsWith('lp:npc:');
export const tokenStream = (ticker: string) => `lp:${ticker}`;

/**
 * The hype and NPC retail parameters (L6). These are the only numbers the balance tuning changes (lead-launchpad.md L8): the
 * curve, the fees, the gates and the rules stay fixed. The defaults here are the tuned values of scripts/balance/launchpad.ts.
 */
export const NPC = {
  /** NPC demand (L6.1): dollars of demand per unit of buzz that arrives. An arrival is a launch's buzz, a viral shock or a buzz item.
   *  L6.4: the cohort buys the whole arrival in the tick it arrives (no half-life); L6.5: no player buy is an arrival; L6.6: one
   *  arrival is capped at the cash that takes the curve to graduation from its current point (demand.ts arrivalCap) */
  DEMAND_PER_BUZZ: 1_000,
  /** capitulation (L6.1): the share of the cohort's tokens sold per tick at any price, times (1 - buzz / the peak buzz since the last
   *  arrival). The cohort sells into the fade, so its flow is a fast pump and a slow bleed. Kept in v1.3 (L6.8) */
  CAPIT_PER_TICK: 0,
  /** profit taking: the share of a cohort's tokens sold per tick for each 100% the price is above the cohort's cost */
  PROFIT_PER_TICK: 0,
  /** L6.8 (v1.3): each NPC cohort (one absorbed arrival: a launch, a viral shock or a buzz item) sells its tokens with this half-life,
   *  in units of tau (VIRAL_TAU_DAYS): tunable 0.5 to 2 tau. It replaces the v1.1 instant exit (TIME_SELL_PER_TICK is withdrawn), so a
   *  young token trades above its floor while its virality lasts */
  BLEED_HALF_TAU: 0.3,
  /** viral shocks (L6.7, v1.3): the hazard of a live token is rate(age) = VIRAL_PER_DAY x exp(-age / VIRAL_TAU_DAYS) shocks per game
   *  day, age in game days since the launch (a dead token has none). VIRAL_TAU_DAYS is tunable 0.5 to 2. The size of a shock is a Pareto
   *  tail with exponent VIRAL_ALPHA. L6.6: the exponent is at least TAIL_ALPHA_MIN (2.2), so a shock has a finite mean and variance */
  VIRAL_PER_DAY: 1.43,
  VIRAL_TAU_DAYS: 0.35,
  VIRAL_SCALE: 12,
  VIRAL_ALPHA: 2.2,
  /** the buzz at launch: a heavy-tailed draw with this scale and tail exponent (most launches start low, a few start high). L6.6: the
   *  exponent is at least TAIL_ALPHA_MIN */
  BASE0: 21,
  BASE0_ALPHA: 8,
  /** world launches per game day, when the world runs them */
  LAUNCHES_PER_DAY: 60,
  /** the NPC sniper: a buy of this many dollars in the first ticks, sold into the first hype (at this multiple of its entry, or after N ticks) */
  SNIPER_MIN: 100,
  SNIPER_MAX: 400,
  SNIPER_EXIT_MULT: 1.5,
  SNIPER_EXIT_TICKS: 60,
  /** post-graduation unwind (L6.2): the cohort's engine position is sold into the book with this half-life, in game days */
  UNWIND_HALF_DAYS: 1,
  /** the tail exponent floor of the viral and launch-buzz laws (L6.6: Pareto alpha >= 2.2, or a lognormal) */
  TAIL_ALPHA_MIN: 2.2,
} as const;

/**
 * The launch-coin crowd (personalities on top of the arrival rule). Arrivals still buy in the tick they arrive. Everything else is
 * these caps. A discretionary buy is at most IMPACT_CAP of the virtual cash, which is under the 2% round trip, so a player who buys
 * to be copied, or sells into the copy, loses the fee. Sells may be a little larger (SELL_CAP) so a red tape is visible. The cash
 * budgets refill slowly and never rise above the cap: fear and greed spend the budget, they do not create it.
 */
export const CROWD = {
  /** the story price decays toward the curve floor with this half-life, in game days */
  STORY_HALF_DAYS: 0.5,
  /** the price faders still believe eases toward the new story with this half-life */
  FADE_HALF_DAYS: 0.35,
  /** a story above the floor by this fraction is alive: holders keep the bag. At the floor they abandon it */
  STORY_ALIVE: 1.02,
  /** once the story has died, the holder bag halves in this many game days */
  ABANDON_HALF_DAYS: 1,
  /** a holder sitting far above what they paid sells this share of that bag per tick, before the sell cap */
  TAKE_SHARE: 0.04,
  /** recent-high memory, as a half-life in game days */
  HIGH_HALF_DAYS: 0.5,
  /** cash each active type may still spend, and the most a scalper spends on one tick (kept under the print floor) */
  SCALP_BUDGET: 300,
  SCALP_TICK: 25,
  FOMO_BUDGET: 700,
  NEWS_BUDGET: 500,
  /** dollars added back to each budget every tick, up to the cap */
  REFILL: 0.04,
  /** a print smaller than this, or smaller than PRINT_MULT times recent volume, is not a signal */
  PRINT_FLOOR: 50,
  PRINT_MULT: 2.5,
  /** a chase is this fraction of the player print, then cut by the impact cap */
  FOMO_FRAC: 0.3,
  /** faders sell this fraction of the chase they are leaning against */
  FADE_RATIO: 0.45,
  /** one discretionary buy may move the virtual reserve by at most this fraction */
  IMPACT_CAP: 0.008,
  /** one sell may move it by at most this fraction */
  SELL_CAP: 0.012,
  /** a matching headline is this fresh, in ticks, and lifts the story by this factor */
  NEWS_WINDOW: 180,
  NEWS_LIFT: 1.15,
  /** dollars one headline may unlock, before the impact cap drips them out */
  BURST: 260,
  /** a headline with no sector (a macro line, a bubble) spends this instead, on every theme */
  WORLD_BURST: 80,
  /** extra buzz on an NPC launch that is tagged to a live headline (demand is this times DEMAND_PER_BUZZ) */
  LAUNCH_BUZZ: 0.35,
  /** a crash or a halt cuts the story's premium by this factor */
  SCARE_DROP: 0.72,
  /** wire ids a token remembers, so a headline is bought once */
  SEEN_KEEP: 16,
};

/** the half-life decay per tick of each buzz part */
export const BUZZ_DECAY = {
  base: Math.pow(0.5, 1 / (2 * TPD)),
  board: Math.pow(0.5, 1 / 6),
  wire: Math.pow(0.5, 1 / TPD),
} as const;
