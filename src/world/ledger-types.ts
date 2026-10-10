import type { NewsBand, Side } from '@/engine';
import type { Msg } from '@/i18n';

/**
 * Trade ledger and learning records (Phase 3, D-3 to D-7). Plain data: the world owns these in GameState and they ride in
 * the snapshot. Nothing here is a secret of another player: the ledger, the cards and the ghosts are private to their owner.
 */

/** Why a fill happened (M13). Ledger rows carry exactly one. */
export type FillReason =
  | 'order'
  | 'stop'
  | 'liquidation'
  | 'settlement'
  | 'option_expiry'
  | 'dividend_reinvest'
  | 'recurring_buy'
  | 'block_slice';

export const FILL_REASONS: readonly FillReason[] = [
  'order', 'stop', 'liquidation', 'settlement', 'option_expiry', 'dividend_reinvest', 'recurring_buy', 'block_slice',
];

/** One fill (or settlement, or expiry) on the player's books. Price is per unit; for options, per underlying unit. */
export interface LedgerFill {
  id: string;
  tick: number;
  assetId: string;
  kind: 'stock' | 'option';
  side: Side;
  qty: number;
  price: number;
  fee: number;
  reason: FillReason;
  /** the engine order that filled, or null for settlements and expiries */
  orderId: string | null;
  /** realized P&L this fill booked (average cost, the engine's own arithmetic) */
  realizedPnl: number;
}

/** A closed round trip: a position going from zero to nonzero and back (a flip closes one and opens the next). */
export interface RoundTrip {
  id: string;
  assetId: string;
  kind: 'stock' | 'option';
  side: 'long' | 'short';
  openedTick: number;
  closedTick: number;
  /** units bought into the trip (contracts for options) */
  qty: number;
  /** average entry and exit price per unit */
  avgEntry: number;
  avgExit: number;
  realizedPnl: number;
  fees: number;
  fills: number;
  closeReason: FillReason;
}

/** An open trip: the running totals until it closes. */
export interface OpenTrip {
  id: string;
  assetId: string;
  kind: 'stock' | 'option';
  side: 'long' | 'short';
  openedTick: number;
  openQty: number;
  entryNotional: number;
  exitQty: number;
  exitNotional: number;
  realizedPnl: number;
  fees: number;
  fills: number;
}

/** A position mirror: signed qty and average cost, as the engine books them. */
export interface PosMirror {
  qty: number;
  avgCost: number;
}

export interface RecurringPlan {
  id: string;
  assetId: string;
  dollars: number;
  everyDays: number;
  /** the first game day the next buy may run */
  nextDay: number;
}

export interface BlockPlan {
  id: string;
  assetId: string;
  side: Side;
  /** units still to trade */
  remaining: number;
  slicesLeft: number;
  slices: number;
  nextTick: number;
  lastOrderId: string | null;
  /** expected cash in (sell) or out (buy) from estimateFill on one slice, times the slices */
  expectedTotal: number;
  startedTick: number;
}

export interface PlanState {
  seq: number;
  recurring: RecurringPlan[];
  /** assets with DRIP on: dividends buy the same asset at the next tick */
  drip: string[];
  /** dividend cash not yet spent on whole shares, per asset (DRIP buys whole shares once a share is covered) */
  carry: Record<string, number>;
  blocks: BlockPlan[];
  /** reason tag for orders the world placed, keyed by order id (cleared when the order closes) */
  tags: Record<string, FillReason>;
}

/** One ghost: its cash and holdings (fractional units, priced on recorded closes, no fees, no impact). */
export interface GhostPortfolio {
  cash: number;
  qty: Record<string, number>;
  /** the first game day the next rebalance is due (the basket ghost uses `members` instead) */
  nextDay: number;
  members: string[];
}

export interface GhostBook {
  basket: GhostPortfolio;
  random: GhostPortfolio;
  momentum: GhostPortfolio;
}

/** One closed day for one player: the record the card and the ghosts are built from. */
export interface DayRecord {
  day: number;
  /** liquidation-value net worth at this close (the rank metric) */
  nw: number;
  /** mark-to-market equity at this close: cash plus positions at closes (the same basis as the ghosts) */
  equity: number;
  /** signed quantity per asset at this close: the next day's open */
  qty: Record<string, number>;
  ghosts: { basket: number; random: number; momentum: number };
}

/** The daily close card (velvet-daily-close.md): the day's facts, and the lines rendered from them by the text provider. */
/** A card as stored: the facts only. The lines are rendered from them when a view is built, so storage stays small. */
export type StoredClose = Omit<DailyClose, 'lines'>;

export interface DailyClose {
  day: number;
  nwOpen: number;
  nwClose: number;
  nwChange: number;
  nwChangePct: number;
  best: MoveLine | null;
  worst: MoveLine | null;
  gx: { pct: number };
  sectors: { best: SectorLine; worst: SectorLine } | null;
  /** priced-in chips for the day's stories (band only, never the share) */
  stories: { assetId: string; headline: string; band: NewsBand }[];
  ghosts: { player: number; basket: number; random: number; momentum: number; beaten: number; percentile: number | null };
  /** the world event line: an active event (headline only) or the ended line (duration, given only once it ends) */
  event: { phase: 'active' | 'ended'; headline: string; lastedDays?: number } | null;
  lines: Msg[];
}

export interface MoveLine {
  assetId: string;
  pct: number;
  usd: number;
}

export interface SectorLine {
  sector: string;
  pct: number;
}

/** Global day record: the closing level of the GX index and every asset's close on one closed day (kept 400 days). */
export interface DayClose {
  day: number;
  tick: number;
  gx: number;
  px: Record<string, number>;
}

/** Everything the ledger keeps for one human player. */
export interface PlayerLedger {
  /** the cash at join (after the sign-up grant): the basis the ghosts start from */
  startCash: number;
  startDay: number;
  seq: number;
  fills: LedgerFill[];
  trips: RoundTrip[];
  open: Record<string, OpenTrip>;
  /** stock positions mirrored from the engine (signed qty, average cost) */
  pos: Record<string, PosMirror>;
  /** option positions mirrored from the engine (contracts, premium per unit) */
  opt: Record<string, PosMirror>;
  plans: PlanState;
  ghosts: GhostBook | null;
  /** the last closed days for this player (the card needs the day and the one before) */
  days: Record<number, DayRecord>;
  /** the closing cards, newest first, stored as facts (their lines are rendered when the view is built) */
  closes: StoredClose[];
}
