import { LP, TPD } from './constants';
import type { LpBar, LpToken } from './types';

/**
 * The candles of a token on the game clock (review fix, Phase 10). A minute bar is LP.CHART_EVERY ticks (a real minute) and an hour bar is
 * TPD ticks (a game day, the "1h" of the chart). Every trade's fill price is a touch: it sets the high or the low of its minute and hour and
 * the close. A minute with no trade carries the last price flat (carryBar), so the series has no holes while the token lives, and a
 * bar opens at the previous bar's close. Old tokens (no `bars`) read their chart samples as flat bars (migrate), once, on the next write.
 */

/** The first tick of the bucket of `size` ticks that holds `tick` (the buckets sit on the game clock). */
const bucketOf = (tick: number, size: number) => Math.floor(tick / size) * size;

/** The bar of a bucket in a series: the newest bar when it is the same bucket, else a new bar that opens at the last close. */
function barAt(list: LpBar[], start: number, cap: number, price: number): LpBar {
  const last = list[list.length - 1];
  if (last && last[0] === start) return last;
  const open = last ? last[4] : price;
  const bar: LpBar = [start, open, open, open, open];
  list.push(bar);
  if (list.length > cap) list.splice(0, list.length - cap);
  return bar;
}

/** A price inside a bar: the high and the low take it, and it is the close. */
function fold(bar: LpBar, price: number): void {
  if (price > bar[2]) bar[2] = price;
  if (price < bar[3]) bar[3] = price;
  bar[4] = price;
}

/** The bars of a token built from its old chart samples: one flat bar per sample's minute (and hour). */
function migrate(t: LpToken): { m: LpBar[]; h: LpBar[] } {
  const bars = { m: [] as LpBar[], h: [] as LpBar[] };
  for (const [tick, p] of t.chart ?? []) {
    fold(barAt(bars.m, bucketOf(tick, LP.CHART_EVERY), LP.BAR_MINUTES, p), p);
    fold(barAt(bars.h, bucketOf(tick, TPD), LP.BAR_HOURS, p), p);
  }
  return bars;
}

/** The candles of a token, for reading (a view): its own bars, or the migrated bars of an old token. Never writes to the token. */
export function barsOf(t: LpToken): { m: LpBar[]; h: LpBar[] } {
  return t.bars ?? migrate(t);
}

/** A settled trade or the initial launch/graduation price: update the minute and hour's high, low and close. */
export function touchBar(t: LpToken, tick: number, price: number): void {
  const bars = t.bars ?? (t.bars = migrate(t));
  fold(barAt(bars.m, bucketOf(tick, LP.CHART_EVERY), LP.BAR_MINUTES, price), price);
  fold(barAt(bars.h, bucketOf(tick, TPD), LP.BAR_HOURS, price), price);
}

/** A tick on the minute with no trade: the minute and the hour exist, carrying the last price flat. */
export function carryBar(t: LpToken, tick: number, price: number): void {
  const bars = t.bars ?? (t.bars = migrate(t));
  barAt(bars.m, bucketOf(tick, LP.CHART_EVERY), LP.BAR_MINUTES, price);
  barAt(bars.h, bucketOf(tick, TPD), LP.BAR_HOURS, price);
}
