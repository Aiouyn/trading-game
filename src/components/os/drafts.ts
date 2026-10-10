'use client';
// Unsent Broker tickets for the session (P2-138, P2-160, P2-161, V:168). Session memory only: a draft never goes
// into a save, and keeping it here never makes it an order. A draft is the side and the quantity typed. It outlives
// the Broker's window or phone app, so reopening the ticket restores it exactly (P2-161). Recent shows a dot on a
// Broker row that has one.
import { create } from 'zustand';

export type DraftSide = 'buy' | 'sell';
export interface TicketDraft { side: DraftSide; q: string }

export const useDrafts = create<{ tickers: Record<string, TicketDraft> }>(() => ({ tickers: {} }));

/** Keeps a ticker's unsent ticket. A null draft or an empty quantity means no draft. */
export function setDraft(ticker: string, draft: TicketDraft | null): void {
  const cur = useDrafts.getState().tickers;
  const had = cur[ticker];
  if (draft === null || draft.q.trim() === '') {
    if (!had) return;
    const next = { ...cur };
    delete next[ticker];
    useDrafts.setState({ tickers: next });
    return;
  }
  if (had && had.side === draft.side && had.q === draft.q) return;
  useDrafts.setState({ tickers: { ...cur, [ticker]: { side: draft.side, q: draft.q } } });
}

/** The unsent ticket for a ticker, or null. A ticket reads it when it mounts. */
export function getDraft(ticker: string): TicketDraft | null {
  return useDrafts.getState().tickers[ticker] ?? null;
}
