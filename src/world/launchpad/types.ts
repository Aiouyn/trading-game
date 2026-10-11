import type { RngState } from '@/engine';

/**
 * Launchpad state (lead-launchpad.md L1 to L6). The whole feature lives under `GameState.launchpad`, which is absent in every
 * world that has never launched a token, so those worlds keep every existing fingerprint.
 */

export type TokenStatus = 'live' | 'graduated' | 'dead';

/** One public tape line. `who` is set only for the creator's own trades (public and flagged); everyone else is anonymous. */
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
}

/** A FIFO lot a holder bought (for the realised P&L and the rug case): quantity and the cash paid per token. */
export interface LpLot {
  qty: number;
  cost: number;
  tick: number;
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
  /** the cash the cohort paid for the tokens it holds (its cost basis) */
  npcCost: number;
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
  /** the tick the curve cash first fell under the death line, while it stays under (null when it is above) */
  cashLowSince: number | null;
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
  flag?: { tick: number; reason: 'dump' | 'sweep'; proceeds: number; window: number };
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
  /** sampled price history: [tick, price] */
  chart: [number, number][];
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
