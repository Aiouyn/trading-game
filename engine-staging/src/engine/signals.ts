/**
 * Public-signal helpers for the learnable-but-not-solved check (Tape's bands, specs/quant-market-ecology.md).
 * Pure and deterministic. They read only what a player can see: lnP, lnV (quote().fundamental), the regime on
 * state, and closes already printed. Nothing here reads a future tick or touches a price or a stream.
 */
import type { Fill, RegimeId, WorldState } from './types';

/** Band-facing ids. */
export const SIGNAL_IDS = ['value_gap', 'mom63'] as const;
export type SignalId = (typeof SIGNAL_IDS)[number];

/**
 * value_gap: ln(value / price) per asset, from quote().fundamental and quote().price. Positive = trades below
 * its value (the value pool's buy side). Higher is a stronger buy.
 */
export function valueGapSignal(state: WorldState): Record<string, number> {
  const out: Record<string, number> = {};
  state.config.assets.forEach((d, i) => { out[d.id] = state.assets[i]!.lnV - state.assets[i]!.lnP; });
  return out;
}

/**
 * mom63: 63-game-day log return per asset, from daily closes already printed. `closes[id][k]` is the close of
 * day k (k = 0 is the start); `day` is the latest printed close and nothing after it is read. NaN when there is
 * not yet 63 days of history.
 */
export function mom63Signal(closes: Record<string, readonly number[]>, day: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, xs] of Object.entries(closes)) {
    if (day > xs.length - 1) throw new Error(`mom63Signal: day ${day} is not printed yet for ${id}`);
    out[id] = day >= 63 ? Math.log(xs[day]! / xs[day - 63]!) : Number.NaN;
  }
  return out;
}

/** Either signal by band id. */
export function signalScores(id: SignalId, state: WorldState, closes: Record<string, readonly number[]>, day: number): Record<string, number> {
  return id === 'value_gap' ? valueGapSignal(state) : mom63Signal(closes, day);
}

/** Simple daily returns of an equity path. */
export function dailyReturns(equity: readonly number[]): number[] {
  const r: number[] = [];
  for (let k = 1; k < equity.length; k++) r.push(equity[k]! / equity[k - 1]! - 1);
  return r;
}

/**
 * Annualized Sharpe of daily returns: mean daily return / daily vol (sample sd) · √daysPerYear. No risk-free
 * rate (the game has none yet). Fees are in the returns already when the equity came from the order path.
 * 0 when there are fewer than 2 returns or no variance.
 */
export function sharpe(returns: readonly number[], daysPerYear: number): number {
  const n = returns.length;
  if (n < 2) return 0;
  let m = 0;
  for (const x of returns) m += x;
  m /= n;
  let v = 0;
  for (const x of returns) v += (x - m) ** 2;
  const sd = Math.sqrt(v / (n - 1));
  return sd > 0 ? (m / sd) * Math.sqrt(daysPerYear) : 0;
}

/** Sharpe of an equity path (e.g. portfolio().equity at each close). */
export function equitySharpe(equity: readonly number[], daysPerYear: number): number {
  return sharpe(dailyReturns(equity), daysPerYear);
}

/** The engine regime in force at the open of a holding period: the one on state when the period starts. */
export function regimeAtOpen(state: WorldState): RegimeId {
  return state.regime;
}

/** Signed notional (buy +, sell −) an account traded in one asset over fills with fromTick ≤ tick < toTick. */
export function signedFlow(fills: readonly Fill[], playerId: string, assetId: string, fromTick: number, toTick: number): number {
  let f = 0;
  for (const x of fills) {
    if (x.playerId !== playerId || x.assetId !== assetId || x.tick < fromTick || x.tick >= toTick) continue;
    f += (x.side === 'buy' ? 1 : -1) * x.qty * x.price;
  }
  return f;
}

export interface Crowding {
  /** signed flow / advNotional */
  shareOfAdv: number;
  /** flow in `direction` exceeded `threshold` × advNotional */
  crowded: boolean;
}

/**
 * Crowding vs ADV: given an account's signed notional over the prior 21 game days in one asset and that asset's
 * advNotional, did the flow in `direction` (+1 buy, −1 sell) exceed `threshold` (default 10%) of ADV?
 */
export function crowding(signedNotional: number, advNotional: number, direction: 1 | -1, threshold = 0.1): Crowding {
  const shareOfAdv = signedNotional / advNotional;
  return { shareOfAdv, crowded: direction * shareOfAdv > threshold };
}
