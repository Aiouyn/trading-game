/**
 * The trade ledger's minimal contract for the explain (Phase 3, D-1 and D-3). The ledger itself (fills, reason codes,
 * round trips) lands with the trade ledger work; the explain reads closed round trips only through these types, so a
 * ledger change that keeps this shape needs no change here.
 *
 * Money is in dollars. A round trip runs from a position's first fill to the tick it returns to zero (a flip closes and
 * reopens; a short cover and an option close are round trips too). The average-cost identity holds for every trip:
 *   realizedPnl = midPnl + slippagePnl - feesPaid
 * midPnl is the trip's P&L at fill mids, slippagePnl is fill price against mid (negative when the trip paid up), and
 * feesPaid is the commissions on both legs (a positive cost).
 */
export interface RoundTrip {
  id: string;
  playerId: string;
  assetId: string;
  side: 'long' | 'short';
  /** units round-tripped (positive) */
  qty: number;
  /** tick of the trip's first fill */
  openTick: number;
  /** tick the position returned to zero */
  closeTick: number;
  /** realized P&L over the trip, average cost, fees included */
  realizedPnl: number;
  /** the trip's P&L at fill mids */
  midPnl: number;
  /** fills against their mids, as P&L: negative when the trip paid up (half-spread and impact) */
  slippagePnl: number;
  /** commissions on both legs, a positive cost */
  feesPaid: number;
}

/** Reads one player's closed round trips. Undefined for an unknown id. */
export interface TradeLedgerReader {
  roundTrip(playerId: string, roundTripId: string): RoundTrip | undefined;
}
