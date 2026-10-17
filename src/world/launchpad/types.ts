import type { RngState } from '@/engine';

/**
 * Launchpad state (lead-launchpad.md L1 to L6). The whole feature lives under `GameState.launchpad`, which is absent in every
 * world that has never launched a token, so those worlds keep every existing fingerprint.
 */

export type TokenStatus = 'live' | 'graduated' | 'dead';

/** One public tape line: anonymous ids only, with the creator's public role flagged. */
export interface LpTrade {
  tick: number;
  side: 'buy' | 'sell';
  qty: number;
  /** the price at the fill, dollars per token */
  price: number;
  /** the creator's trade (the creator is a public role) */
  creator: boolean;
  /** NPC retail flow, shown as anonymous flow */
  npc: boolean;
  /** R-10-6: the notional in dollars (the outlay with the fee on a buy, the gross proceeds on a sell). Absent in an old tape: qty times price */
  usd?: number;
  /** R-10-6: the anonymous trader id of a player's trade (a hash of the token and the player; never the handle). Absent for NPC flow */
  anon?: string;
}

/**
 * One candle on the game clock (review fix, Phase 10): [start tick of the bucket, open, high, low, close], dollars per token. The
 * open is the previous bar's close; the high and low are the trade prices and the carried price inside the bucket.
 */
export type LpBar = [number, number, number, number, number];

/**
 * R-10-6 (Phase 10): one line of a token's replies thread. A player's reply is their own text (moderated, plain, up to 140 characters)
 * under an anonymous id; the creator's replies are marked as the creator's. An NPC reply is a template key from the text layer with a
 * fictional handle, so the viewer's language renders it.
 */
export interface LpReply {
  tick: number;
  /** the anonymous id (a player) or the fictional handle (an NPC) */
  who: string;
  role: 'player' | 'creator' | 'npc';
  /** a player's text (plain, moderated) */
  text?: string;
  /** an NPC reply's message key (the text layer's template) and its variables */
  key?: string;
  vars?: Record<string, string | number>;
}

/** A FIFO lot a holder bought (for the realised P&L and the rug case): quantity and the cash paid per token. */
export interface LpLot {
  qty: number;
  cost: number;
  tick: number;
}

/**
 * One NPC cohort (L6.8, v1.3): the tokens one absorbed arrival bought (the launch, a viral shock or a buzz item), with their cash cost.
 * Each cohort sells on its own half-life and profit test. `carry` keeps the fraction of a sell that a whole token does not cover, so a
 * slow bleed is not lost to rounding.
 */
export interface NpcCohort {
  tick: number;
  tokens: number;
  cost: number;
  carry?: number;
  /** the NPC sniper's cohort (launch.ts sniperEnter): its exit sells this cohort's tokens, not the oldest cohort's (v1.2 review item 5) */
  sniper?: boolean;
}

export interface LpToken {
  /** the ticker, which is also the engine asset id once the token graduates */
  ticker: string;
  name: string;
  /** one of the fixed tagline ids (no free text in V1) */
  tagline: string;
  /** the creator's player id, or null for a world-launched (NPC) token */
  creatorId: string | null;
  createdTick: number;
  /** the game day of the launch */
  day0: number;
  /** the creator's allocation (whole tokens, 0 to 50M), minted at launch and locked (vesting) */
  allocation: number;
  /** the virtual token reserve Y: the curve has sold Y0 - y tokens */
  y: number;
  /** holders' token balances by player id (the creator included) */
  bal: Record<string, number>;
  /** the NPC cohort's token balance, which the cohort never sells beyond what it holds */
  npcBal: number;
  /** L6.1: the NPC demand not yet bought (dollars). Each buzz arrival adds to it; it decays with the buy half-life. Absent in old snapshots (zero). */
  npcPending?: number;
  /** L6.1: the buzz peak since the last arrival (the capitulation's reference). Absent in old snapshots (the buzz then). */
  npcPeak?: number;
  /** true once a non-creator account has traded the token (a cancel is then refused, lead-launchpad.md L2 as ratified). */
  playerTraded?: boolean;
  /** the cash the cohort paid for the tokens it holds (its cost basis) */
  npcCost: number;
  /** L6.8 (v1.3): the NPC cohorts, oldest first. Their tokens sum to npcBal and their cost to npcCost (cohorts.ts keeps them in step;
   *  absent in a snapshot from before v1.3, when the whole holding reads as one cohort). */
  npcCohorts?: NpcCohort[];
  /** curve buys by the creator and owner-linked accounts, cumulative (the 10% cap) */
  creatorBought: number;
  /** the buzz B: the base hype, the Quay billboard part and the Wire promo part (L6) */
  buzz: { base: number; board: number; wire: number };
  /** buzz items bought per game day for this token (the 3 per day cap) */
  buzzDay: { day: number; n: number };
  /** the public promos bought for this token, newest last (shown as Sponsored; the last 20 are kept) */
  promos: { tick: number; kind: 'board' | 'wire' }[];
  /** the world's NPC sniper on this token, while it is in: the cohort's tokens it bought and its entry price */
  sniper?: { tick: number; tokens: number; entry: number };
  /** the sniper has bought (or the token had its chance): one sniper per token */
  sniperDone?: boolean;
  status: TokenStatus;
  lastTradeTick: number;
  /** L3.1 (v1.3): the game-day closes in a row with curve cash under the death line, counted from day 3 (absent reads as zero) */
  lowCloses?: number;
  deadTick?: number;
  deadReason?: 'noTrade' | 'cash' | 'cancelled';
  gradTick?: number;
  /** the price the token graduated at, dollars per token */
  gradPrice?: number;
  /** the cash the curve raised */
  gradRaise?: number;
  /** the creator's balance at graduation (the 50% sell test starts here) */
  creatorHeldAtGrad?: number;
  /** the creator's sells since graduation (tokens and proceeds), for the rug rules */
  creatorSoldSinceGrad: number;
  creatorProceedsSinceGrad: number;
  /** the creator's sells of the current game day (the 3% test and the Wire item) */
  creatorDay: { day: number; qty: number; proceeds: number; startPrice: number; wired: boolean };
  /** every buy of the token (player and holder), kept for the rug window: who bought how much, when */
  buyLog: { pid: string; tick: number; qty: number }[];
  /** the rug flag, public on the token page */
  /** the rug flag. `buyers` is the snapshot taken at the flag: each holder's tokens bought in the 7 game days before it (the
   *  eligibility to sue and the share of the damages), so the buy log can keep only its rolling window. */
  flag?: { tick: number; reason: 'dump' | 'sweep'; proceeds: number; window: number; buyers: Record<string, number> };
  /** the creator's cash from the trading fee (booked income) */
  creatorFees: number;
  /** the creator's allocation sold on the vesting pace so far (those sales are paced, and the 50% rule does not count them) */
  allocSold: number;
  /** each player's realised P&L on this token, FIFO (the rug case's loss) */
  realized: Record<string, number>;
  /** the cash taken by the buzz items, the launch fee is in the state's flows */
  lots: Record<string, LpLot[]>;
  /** the public tape, newest last */
  tape: LpTrade[];
  /** the candles on the game clock: minute bars (CHART_EVERY ticks) and hour bars (TPD ticks), newest last (review fix, Phase 10).
   *  Absent in an old token: barsOf reads its chart samples as flat bars */
  bars?: { m: LpBar[]; h: LpBar[] };
  /** the price samples of the first Phase 5 to Phase 10 saves, [tick, price]. Read only (barsOf); no new sample is written here */
  chart?: [number, number][];
  /** volume of the current game day and the last whole game day (dollars of notional) */
  volToday: number;
  volPrev: number;
  volDay: number;
  /** the token's own deterministic stream (lp:<TICKER>) */
  rng: RngState;
  /** the cash each booked line took from this token, for the balance report */
  flows: { npcBuy: number; npcSell: number; playerBuy: number; playerSell: number; fee: number };
  /** a rug case filed on this token (the holders' suits), by player id */
  sued: Record<string, string>;
  /** R-10-6: the generated image variant the creator picked (0 to ART_VARIANTS - 1). Absent in an old token: variant 0 */
  art?: number;
  /** R-10-6: the description the creator wrote (plain text, at most 140 characters, moderated). Absent in an old token */
  description?: string;
  /** R-10-6: the replies thread, newest last (the last REPLY_KEEP are kept). Absent in an old token: none */
  replies?: LpReply[];
  /** R-10-6: the tick of each player's last reply on this token (the one-a-minute brake). Absent: no reply yet */
  replyLast?: Record<string, number>;
  /** R-10-6: the tick of the last NPC reply (the five-minute gap). Absent: none yet */
  npcReplyAt?: number;
  /** review fix (Phase 10): the replies ever posted on the token (the thread keeps only REPLY_KEEP). Absent: the thread's length */
  replyCount?: number;
  /** review fix (Phase 10): the tick of the last trade by a player or the creator (the NPC replies need one in the window). Absent: none */
  playerTradeAt?: number;
}

export interface LaunchpadState {
  /** a counter for the token ids of world launches (kept for the feed order) */
  seq: number;
  tokens: Record<string, LpToken>;
  /** launch order, oldest first */
  order: string[];
  /** the last launch tick per creator (the 24-hour limit) */
  lastLaunch: Record<string, number>;
  /** creators under a launch ban (a lost rug case): the first tick they may launch again */
  bans: Record<string, number>;
  /** the game day each ticker was last used (a launched ticker stays taken for 30 game days) */
  tickerDay: Record<string, number>;
  /** the stream for launch-independent draws (lp:world) */
  worldRng: RngState;
  /** the next world launch id */
  npcSeq: number;
  /** world launches (NPC tokens) run on the ticks when this is on (the balance harness and the server turn it on) */
  npcLaunches?: boolean;
  /** the last game day a Wire rumor was published */
  rumorDay: number;
  /** the state's booked totals by line, for the balance report and the zero-sum tests (cents-exact) */
  totals: { launchFee: number; tradeFee: number; creatorFee: number; gradFee: number; buzz: number; npcNet: number; launches: number; graduations: number; deaths: number };
}
