'use client';
// Which tickers hold an unsent ticket (P2-160, P2-161, V:168). Session memory only: a draft never goes into
// a save, and it never becomes an order by being listed here. Recent shows a dot on those Broker rows.
import { create } from 'zustand';

export const useDrafts = create<{ tickers: Record<string, true> }>(() => ({ tickers: {} }));

export function setDraft(ticker: string, on: boolean): void {
  const cur = useDrafts.getState().tickers;
  if (!!cur[ticker] === on) return;
  const next = { ...cur };
  if (on) next[ticker] = true;
  else delete next[ticker];
  useDrafts.setState({ tickers: next });
}
