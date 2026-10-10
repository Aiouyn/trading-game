/**
 * The trade ledger's round trip: the one type the engine's explain (Phase 3, D-1 and D-3) and the world's ledger share. The
 * world keeps the fills and trips (src/world/ledger.ts); the explain reads closed trips only, through TradeLedgerReader.
 * A ledger change that keeps these fields needs no change in the explain.
 *
 * Money is in dollars. A round trip runs from a position's first fill to the tick it returns to zero (a flip closes and
 * reopens; a short cover is a round trip too). Every fill is split between the trip it closes and the trip it opens when it
 * flips, pro rata by units, so a trip's cash flows are exactly its own. For an explainable trip the identity holds:
 *   realizedPnl = midPnl + slippagePnl - feesPaid
 * midPnl is the trip's P&L at each fill's pre-trade mid, slippagePnl is each fill's price against that mid (negative when
 * the trip paid up), and feesPaid is the commissions on both legs (a positive cost).
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

export interface RoundTrip {
  id: string;
  playerId: string;
  assetId: string;
  kind: 'stock' | 'option';
  side: 'long' | 'short';
  /** units round-tripped (positive; contracts for options) */
  qty: number;
  /** tick of the trip's first fill */
  openTick: number;
  /** tick the position returned to zero */
  closeTick: number;
  /** average entry and exit price per unit */
  avgEntry: number;
  avgExit: number;
  /** realized P&L over the trip, average cost, fees included (the engine's own arithmetic) */
  realizedPnl: number;
  /** the trip's P&L at fill mids */
  midPnl: number;
  /** fills against their mids, as P&L: negative when the trip paid up (half-spread and impact) */
  slippagePnl: number;
  /** commissions on both legs, a positive cost */
  feesPaid: number;
  /** fills that touched the trip (a flip's fill counts once for each side it belongs to) */
  fills: number;
  /** the reason of the fill that closed the trip */
  closeReason: FillReason;
  /**
   * False when the identity above cannot be checked from the books: a trip whose entry predates the ledger (its earlier
   * cash flows are not on the books), and an option trip (the fill's mid is not on the engine's option fill). The explain
   * refuses these; the trip itself is still shown.
   */
  explainable: boolean;
}

/** Reads one player's closed round trips. Undefined for an unknown id. */
export interface TradeLedgerReader {
  roundTrip(playerId: string, roundTripId: string): RoundTrip | undefined;
}
