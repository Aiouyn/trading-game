import { TPD } from '../core';

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
  /** the launch fee, a booked sink (L2) */
  LAUNCH_FEE: 1_000,
  /** the graduation fee on the raised cash, a booked sink (L4) */
  GRAD_FEE_RATE: 0.015,
  /** the ticket's default maximum slippage (L3) */
  MAX_SLIP: 0.05,
  /** launch gate: account age of at least 3 real days (72 game days), one launch per 24 real hours, at most 3 live tokens */
  MIN_AGE_TICKS: 3 * 24 * TPD,
  LAUNCH_COOLDOWN_TICKS: 24 * TPD,
  MAX_LIVE: 3,
  /** the rank a launch needs: R1 (Hustler) or higher */
  MIN_RANK_INDEX: 1,
  /** tickers used in the last 30 game days are taken (L2) */
  TICKER_HOLD_DAYS: 30,
  /** the ticker is 3 to 5 letters; the name is 3 to 24 characters */
  TICKER_MIN: 3,
  TICKER_MAX: 5,
  NAME_MIN: 3,
  NAME_MAX: 24,
  /** vesting (L5): the creator allocation is locked until the cliff, then unlocks linearly to the end day */
  VEST_CLIFF_DAYS: 2,
  VEST_END_DAYS: 14,
  /** death (L3): no trade for 24 game days, or curve cash under 2% of the raise for 7 game days (counted from launch, tested from day 3) */
  DEAD_NO_TRADE_DAYS: 24,
  DEAD_CASH_FRAC: 0.02,
  DEAD_CASH_DAYS: 7,
  DEAD_CASH_FROM_DAY: 3,
  /** rug flag (L5) */
  RUG_WINDOW_DAYS: 24,
  RUG_SELL_FRAC: 0.5,
  RUG_DUMP_SUPPLY_FRAC: 0.03,
  RUG_DUMP_PRICE_FALL: 0.4,
  /** a holder who bought within this many game days before a flagged dump may sue (L5) */
  RUG_BUY_WINDOW_DAYS: 7,
  /** a creator who loses a rug case is barred from launching for 8 real weeks (L5) */
  RUG_BAN_TICKS: 8 * 7 * TPD,
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
} as const;

/** the curve's constant product k = X0 * Y0 */
export const LP_K = LP.X0 * LP.Y0;

/** the token-level rung of the account and asset ids the world uses */
export const curveAccountId = (ticker: string) => `lp:curve:${ticker}`;
export const bookAccountId = (ticker: string) => `lp:book:${ticker}`;
export const npcAccountId = (ticker: string) => `lp:npc:${ticker}`;
export const tokenStream = (ticker: string) => `lp:${ticker}`;
