import type { NewsBand, Side } from '@/engine';
import type { Msg } from '@/i18n';
import type { ExplainRow, FlowPool } from '@/engine';
import type { FillReason, RoundTrip } from '@/engine/ledger-types';

/** The round trip and the fill reason are defined once, in the engine (the explain reads the same type). */
export type { FillReason, RoundTrip } from '@/engine/ledger-types';

/**
 * Trade ledger and learning records (Phase 3, D-3 to D-7). Plain data: the world owns these in GameState and they ride in
 * the snapshot. Nothing here is a secret of another player: the ledger, the cards and the ghosts are private to their owner.
 */

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

/** An open trip: the running totals until it closes (the fields of RoundTrip, before the close). */
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
  midPnl: number;
  slippagePnl: number;
  feesPaid: number;
  fills: number;
  /** false once the trip's entry predates the ledger, or for an option trip (see RoundTrip.explainable) */
  explainable: boolean;
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
  /** extra slices spent on an unfilled remainder (capped at BLOCK.maxRetries) */
  retries: number;
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
  /** reason tag for orders the world placed, keyed by order id (dropped when the order is no longer open) */
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
  /** price-only equity at this close: cash plus positions at closes, without dividends, interest and borrow fees (the ghosts' basis) */
  equity: number;
  /** signed quantity per asset at this close: the next day's open */
  qty: Record<string, number>;
  ghosts: { basket: number; random: number; momentum: number };
  /** the player's cumulative external cash at this close (grants, transfers, loans; see core.ts shiftBaselines): a day's change leaves out what came in */
  ext?: number;
}

/** The daily close card (velvet-daily-close.md): the day's facts, and the lines rendered from them by the text provider. */
/** A card as stored: the facts only. The lines are rendered from them when a view is built, so storage stays small. */
export type StoredClose = Omit<DailyClose, 'lines'>;

export interface DailyClose {
  day: number;
  /** the player was offline at this close: the card waits in Messages and does not pop up on connect (D-7, the lead's ruling) */
  offline: boolean;
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

/** The engine's running non-price flows on an account (dividends, interest, borrow fees), as they stood at a point. */
export interface FlowTotals {
  dividends: number;
  interestEarned: number;
  interestPaid: number;
  borrowPaid: number;
}

/** One waterfall row of a desk dossier: a part of the move, as a fraction (the parts sum to the move). */
export interface DeskRow {
  row: ExplainRow;
  value: number;
}

/** One pool's share of the window's flow: its net flow as a signed share of the gross flow (-1 to 1). */
export interface DeskPool {
  pool: FlowPool;
  share: number;
}

/**
 * A Research Desk dossier (velvet-research-desk.md): one asset over a closed window, built from explainMove. The rows sum to
 * the move. No player is named anywhere in it: the flow is by pool type, and the player rows are aggregates.
 */
export interface DeskDossier {
  no: number;
  assetId: string;
  /** the closed window explained: clamped to the first archived day and the last closed day */
  from: number;
  to: number;
  /** the move over the window as a fraction, and the GX move over the same window (null when not recorded) */
  move: number;
  gx: number | null;
  rows: DeskRow[];
  flow: DeskPool[];
  /** past-tense memo lines (descriptors, rendered in the viewer's language) */
  memo: Msg[];
  headlines: { day: number; text: string }[];
  /** the window's daily closes, plus the close before it (the chart strip) */
  bars: { day: number; px: number }[];
}

/** A saved query: the dossier is kept, so Files stays readable after the desk locks. */
export interface DeskFile {
  no: number;
  assetId: string;
  from: number;
  to: number;
  move: number;
  dossier: DeskDossier;
}

/** Everything the ledger keeps for one human player. */
export interface PlayerLedger {
  playerId: string;
  /** the cash at join (after the sign-up grant), moved with the trading baseline: the basis the ghosts start from */
  startCash: number;
  /** the account's non-price flow totals at join: the benchmark equity counts only the flows made after this */
  flows0: FlowTotals;
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
  /** the latest game day whose close card the player has dismissed (or that the digest replaced); absent until one is */
  closeSeenDay?: number;
  /** Research Desk files, newest first (kept while the desk is locked); `deskSeq` numbers them */
  deskFiles?: DeskFile[];
  deskSeq?: number;
}
