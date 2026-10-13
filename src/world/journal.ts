import type { Msg } from '@/i18n';
import { JOURNAL, type AnalystTier } from '@/content/learning';
import { EXPLAIN_ROWS, FLOW_POOLS, explainMove, gameDayOfTick, impactShares, type FlowPool, type RoundTrip, type TradeExplain, type TradeRow } from '@/engine';
import { TPD } from './core';
import { deskWindow, headlinesFor } from './desk';
import { explainTradeFor, ledgerOf } from './ledger';
import { textProvider } from './text';
import type { CommandResult, GameState, Player } from './types';

/**
 * The trade journal (Phase 3, M09; velvet-trade-journal-replay.md). One closed round trip, explained: the one-line sentence
 * is free; the parts (the waterfall) need a hired analyst; Senior adds the flow by pool and the headlines. The replay is the
 * price path from before the entry to after the exit, from the daily closes the world keeps. Only the owner can ask.
 */

const ok = (data?: unknown): CommandResult => ({ ok: true, ...(data !== undefined ? { data } : {}) });
const fail = (error: string): CommandResult => ({ ok: false, error });

/** The waterfall's rows in the order the screen shows them (fees and slippage last, the total after them). */
const ROW_ORDER: readonly TradeRow[] = [...EXPLAIN_ROWS, 'fees'];

export interface JournalRow {
  row: TradeRow;
  value: number;
}

export interface JournalReplay {
  /** the daily closes from before the entry to after the exit (the held window is shaded between the entry and exit days) */
  series: { day: number; px: number }[];
  /** the closes after the exit, to the last closed day: the "If held" continuation */
  held: { day: number; px: number }[];
  entryDay: number;
  /** the exit day, or null while the exit is on the still-open day (the chart draws no exit then: no marker, no shading) */
  exitDay: number | null;
  avgEntry: number;
  avgExit: number;
  qty: number;
  side: 'long' | 'short';
  /** the trade held to the last closed day, in dollars (null while the exit is on the open day) */
  ifHeld: number | null;
}

export interface JournalDetail {
  id: string;
  assetId: string;
  side: 'long' | 'short';
  qty: number;
  openDay: number;
  closeDay: number;
  realized: number;
  avgEntry: number;
  avgExit: number;
  /** the one-line explanation, or the reason there is none yet */
  line: Msg;
  /** the hired analyst's tier, or null: the parts are returned only with one */
  analyst: AnalystTier | null;
  rows: JournalRow[] | null;
  /** explainTrade's total: the realized P&L the rows sum to (the screen shows this, never its own sum) */
  total: number | null;
  /**
   * The free sample (UX stage 6, item 9): without an analyst, the newest closed trade's parts and total, so the Analyst tab can
   * show one breakdown before any hire. Null for every other trade and for an analyst's own journal (rows carry those).
   */
  sample: { rows: JournalRow[]; total: number } | null;
  /** Senior only: the flow row by pool type */
  flow: { pool: FlowPool; value: number }[] | null;
  /** Senior only: the asset's headlines over the holding window */
  headlines: { day: number; text: string; msg?: Msg }[] | null;
  replay: JournalReplay | null;
  /** GX's move over the holding window (from the close before the open to the close), the same days the waterfall explains; null before the closes exist */
  gx: number | null;
}

/** The replay from the daily closes: the holding window padded by the replay share, and the continuation to the last close. */
function replayOf(g: GameState, trip: RoundTrip, openDay: number, closeDay: number, lastClosed: number): JournalReplay | null {
  const px = (d: number): number | undefined => g.dayCloses?.[d]?.px[trip.assetId];
  const hold = Math.max(1, closeDay - openDay);
  const pad = Math.max(1, Math.round(JOURNAL.replayPad * hold));
  const series: { day: number; px: number }[] = [];
  const to = Math.min(closeDay + pad, lastClosed);
  for (let d = openDay - pad; d <= to; d++) {
    const v = px(d);
    if (v !== undefined) series.push({ day: d, px: v });
  }
  if (series.length === 0) return null;
  const held: { day: number; px: number }[] = [];
  if (closeDay <= lastClosed) {
    for (let d = closeDay; d <= lastClosed; d++) {
      const v = px(d);
      if (v !== undefined) held.push({ day: d, px: v });
    }
  }
  const avgEntry = trip.avgEntry;
  const avgExit = trip.avgExit;
  const side = trip.side;
  const last = px(lastClosed);
  const sign = side === 'long' ? 1 : -1;
  const exited = closeDay <= lastClosed;
  const ifHeld = exited && last !== undefined ? sign * trip.qty * (last - avgExit) : null;
  return { series, held, entryDay: openDay, exitDay: exited ? closeDay : null, avgEntry, avgExit, qty: trip.qty, side, ifHeld };
}

/** A closed trade's journal detail for its owner. Unknown or open trades are refused; a trade with no breakdown still answers. */
export function tripDetail(g: GameState, p: Player, tripId: string): CommandResult {
  const trip = ledgerOf(g, p.id)?.trips.find((t) => t.id === tripId);
  if (!trip) return fail('no such trade');
  const openDay = gameDayOfTick(trip.openTick, TPD);
  const closeDay = gameDayOfTick(trip.closeTick, TPD);
  const w = deskWindow(g);

  let ex: TradeExplain | null = null;
  let line: Msg;
  if (!trip.explainable) line = { key: 'journal.line.none' };
  else if (w.lastClosed === null || closeDay > w.lastClosed) line = { key: 'journal.line.pending' };
  else if (openDay < w.firstDay) line = { key: 'journal.line.none' };
  else {
    try {
      ex = explainTradeFor(g, p.id, tripId);
      line = textProvider.tripLine({ realized: ex.realized, rows: ex.rows });
    } catch {
      ex = null;
      line = { key: 'journal.line.none' };
    }
  }

  const tier = p.analyst?.tier ?? null;
  let rows: JournalRow[] | null = null;
  let total: number | null = null;
  let flow: { pool: FlowPool; value: number }[] | null = null;
  let headlines: { day: number; text: string; msg?: Msg }[] | null = null;
  const parts = (x: TradeExplain): JournalRow[] => ROW_ORDER.filter((k) => (x.rows[k] ?? 0) !== 0).map((k) => ({ row: k, value: x.rows[k]! }));
  // the free sample is the newest closed trade only, and only its parts (flow and headlines stay with the analyst)
  const newest = ledgerOf(g, p.id)?.trips.at(-1)?.id === tripId;
  const sample = ex !== null && tier === null && newest ? { rows: parts(ex), total: ex.total } : null;
  if (ex !== null && tier !== null) {
    rows = parts(ex);
    total = ex.total;
    if (tier === 'senior') {
      // the flow row split by pool, with the engine's own sign-following split of the trade's flow dollars
      const e = explainMove(g.market, trip.assetId, openDay, closeDay);
      const logs = FLOW_POOLS.map((pool) => e.flow[pool] ?? 0);
      const shares = impactShares(ex.rows.flow ?? 0, logs);
      flow = FLOW_POOLS.map((pool, i) => ({ pool, value: shares[i]! }));
      headlines = headlinesFor(g, trip.assetId, openDay, closeDay);
    }
  }

  return ok({
    id: trip.id, assetId: trip.assetId, side: trip.side, qty: trip.qty, openDay, closeDay,
    realized: trip.realizedPnl,
    line, analyst: tier, rows, total, sample, flow, headlines, avgEntry: trip.avgEntry, avgExit: trip.avgExit,
    replay: w.lastClosed === null ? null : replayOf(g, trip, openDay, closeDay, w.lastClosed),
    gx: gxMoveOver(g, openDay, closeDay),
  } satisfies JournalDetail);
}

/** GX over the days a trade was held, measured the way the desk measures its window (the close before the first day to the last). */
function gxMoveOver(g: GameState, fromDay: number, toDay: number): number | null {
  const gx = (d: number): number | undefined => g.dayCloses?.[d]?.gx;
  const base = gx(fromDay - 1) ?? gx(fromDay);
  const end = gx(toDay);
  return base !== undefined && end !== undefined && base > 0 ? end / base - 1 : null;
}
