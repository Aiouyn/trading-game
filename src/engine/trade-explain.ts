import { EXPLAIN_ROWS, ecoArchive, explainMove, impactShares, type ExplainRow } from './ecology';
import type { TradeLedgerReader } from './ledger-types';
import type { WorldState } from './types';

/** The rows of a trade's explanation: the desk rows in dollars, plus fees and slippage (D-1, D-3). */
export type TradeRow = ExplainRow | 'fees';

/** The tolerance on the realized check: the rows must sum to the ledger's realized P&L within a cent. */
export const TRADE_REALIZED_TOLERANCE = 0.01;

export interface TradeExplain {
  roundTripId: string;
  assetId: string;
  side: 'long' | 'short';
  /** the game days the explanation covers: the day of the trip's first fill to the day of its close */
  openDay: number;
  closeDay: number;
  /** the ledger's realized P&L for the trip */
  realized: number;
  /** dollars per row, rows with nothing omitted; fees is fees and slippage together */
  rows: Partial<Record<TradeRow, number>>;
  /** the sum of rows: equal to realized within TRADE_REALIZED_TOLERANCE (explainTrade throws otherwise) */
  total: number;
}

/** The game day a tick belongs to. A close at a day's last tick settles that day (ecologyStep uses the same rule). */
export function gameDayOfTick(tick: number, ticksPerDay: number): number {
  return Math.floor((tick - 1) / ticksPerDay);
}

/** With no ledger supplied, no trip is known: every explainTrade call throws for a missing trip. The world passes its own (R3). */
const NO_LEDGER: TradeLedgerReader = { roundTrip: () => undefined };

/**
 * Why a closed round trip made or lost what it did. The trip's mid P&L is spread over the window's desk rows in proportion
 * to each row's share of the window's move (impactShares: exact, sign-following). A window with no move at all leaves the
 * whole mid P&L in Company noise. Fees and slippage are the ledger's figures, so the rows sum to the ledger's realized P&L
 * (midPnl + slippagePnl - feesPaid), which is checked. Throws for a trip whose window is open or not archived.
 * The ledger is the optional fourth argument (R3): the world layer supplies its trade ledger (explainTradeFor), and it reads
 * closed trips only.
 */
export function explainTrade(state: WorldState, playerId: string, roundTripId: string, ledger: TradeLedgerReader = NO_LEDGER): TradeExplain {
  const trip = ledger.roundTrip(playerId, roundTripId);
  if (!trip) throw new Error(`explainTrade: no closed round trip ${roundTripId} for ${playerId}`);
  if (!trip.explainable) throw new Error(`explainTrade: ${roundTripId} cannot be explained from the books (entry before the ledger, or an option trip)`);
  if (trip.closeTick < trip.openTick) throw new Error(`explainTrade: ${roundTripId} closes before it opens`);
  const tpd = state.config.ticksPerDay;
  const openDay = gameDayOfTick(trip.openTick, tpd);
  const closeDay = gameDayOfTick(trip.closeTick, tpd);
  const first = ecoArchive(state)[0]?.day;
  if (first === undefined || openDay < first) {
    throw new Error(`explainTrade: ${roundTripId} opened on day ${openDay}, before the explain archive (first day ${first ?? 'none'})`);
  }
  // explainMove throws for a close on an open or unclosed day, and for an unknown asset
  const e = explainMove(state, trip.assetId, openDay, closeDay);
  const rows = allocate(trip.midPnl, e.parts);
  const fees = trip.slippagePnl - trip.feesPaid;
  if (fees !== 0) rows.fees = fees;
  const total = Object.values(rows).reduce((a, b) => a + (b ?? 0), 0);
  if (Math.abs(total - trip.realizedPnl) > TRADE_REALIZED_TOLERANCE) {
    throw new Error(`explainTrade: ${roundTripId} rows sum to ${total}, but the ledger realized ${trip.realizedPnl}`);
  }
  return { roundTripId, assetId: trip.assetId, side: trip.side, openDay, closeDay, realized: trip.realizedPnl, rows, total };
}

/** Spread a dollar amount over the desk rows by their log moves (impactShares), or into company noise when nothing moved. */
function allocate(amount: number, parts: Partial<Record<ExplainRow, number>>): Partial<Record<TradeRow, number>> {
  const flows = EXPLAIN_ROWS.map((k) => parts[k] ?? 0);
  const out: Partial<Record<TradeRow, number>> = {};
  if (flows.every((x) => x === 0)) {
    if (amount !== 0) out.company = amount;
    return out;
  }
  const shares = impactShares(amount, flows);
  EXPLAIN_ROWS.forEach((k, i) => { if (shares[i] !== 0) out[k] = shares[i]; });
  return out;
}

