// M1-07: the server candle revision `<epoch>.<n>` (`x-candle-rev`, CandlesBody.rev). `epoch` names one server candle
// history (a restart starts another, revisions from 0 again); `n` counts its bar changes. Revisions of different epochs are
// never compared. Not a price: kept out of the chart's number-free modules.
export interface CandleRev { readonly epoch: string; readonly n: number }
export const CANDLE_REV_RE = /^([0-9a-z]{1,16})\.(\d{1,15})$/;
/** A revision; null if absent or malformed. */
export function parseRev(v: unknown): CandleRev | null {
  const m = typeof v === "string" ? CANDLE_REV_RE.exec(v) : null;
  return m ? { epoch: m[1]!, n: Number(m[2]) } : null;
}
