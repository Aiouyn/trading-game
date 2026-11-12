// Launchpad coin candles (pure; read by CoinCandles.tsx and the unit tests). Port of the owner's first version token chart
// (origin/p10/lp src/components/apps/launchpad/CandleChart.tsx candlesOf + src/world/launchpad/bars.ts): one candle per
// time bucket, open at the previous close, high/low the extremes of the trades in it, close the last trade, and a bucket
// with no trade carries the last price flat. Built from main's recorded trade points (GET /api/launchpad/history: the curve
// after each executed trade), so nothing is invented: every price is a real curve price after a real trade.
import { LP } from "@/launchpad/rules";
import { spot, type HistoryData } from "./history";

/** The p10 timeframes. Buckets are real time (main's points carry wall-clock times). */
export const TIMEFRAMES = [
  { id: "1m", ms: 60_000 },
  { id: "5m", ms: 5 * 60_000 },
  { id: "15m", ms: 15 * 60_000 },
  { id: "1h", ms: 60 * 60_000 },
] as const;
export type Timeframe = (typeof TIMEFRAMES)[number]["id"];
/** At most this many candles (the newest). */
export const MAX_CANDLES = 300;

export interface Candle { t: number; o: number; h: number; l: number; c: number; v: number; buys: number; sells: number }

/**
 * Candles of `h` in buckets of `ms`, from the first charted price to `now` (flat candles where nothing traded), newest
 * MAX_CANDLES. Prices in $ per token; v is the bucket's traded game dollars. A graduated coin stops at its graduation.
 */
export function candlesOf(h: HistoryData, ms: number, now: number): Candle[] {
  const fromLaunch = h.since === h.createdAtMs && h.dropped === 0;
  const ticks: { at: number; p: number; cents: number; side: "buy" | "sell" | null }[] = [];
  if (fromLaunch) ticks.push({ at: h.createdAtMs, p: spot(LP.X0, 0), cents: 0, side: null });
  for (const pt of h.pts) ticks.push({ at: pt.atMs, p: spot(pt.x, pt.sold), cents: pt.cents, side: pt.side });
  if (h.grad) ticks.push({ at: h.grad.atMs, p: h.grad.price / 1e8, cents: 0, side: null });
  if (ticks.length === 0) return [];
  const bucket = (at: number) => Math.floor(at / ms) * ms;
  const end = bucket(h.grad ? h.grad.atMs : Math.max(now, ticks[ticks.length - 1]!.at));
  const first = Math.max(bucket(ticks[0]!.at), end - (MAX_CANDLES - 1) * ms);
  const out: Candle[] = [];
  let i = 0;
  let last = ticks[0]!.p;
  // Trades before the window only set the price the window opens at.
  while (i < ticks.length && bucket(ticks[i]!.at) < first) last = ticks[i++]!.p;
  for (let t = first; t <= end; t += ms) {
    const k: Candle = { t, o: last, h: last, l: last, c: last, v: 0, buys: 0, sells: 0 };
    while (i < ticks.length && bucket(ticks[i]!.at) === t) {
      const x = ticks[i++]!;
      if (x.p > k.h) k.h = x.p;
      if (x.p < k.l) k.l = x.p;
      k.c = x.p;
      k.v += x.cents / 100;
      if (x.side === "buy") k.buys++;
      else if (x.side === "sell") k.sells++;
    }
    last = k.c;
    out.push(k);
  }
  return out;
}
