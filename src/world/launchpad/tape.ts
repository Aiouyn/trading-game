import { LP } from './constants';
import { touchBar } from './bars';
import type { LpToken, LpTrade } from './types';

/** A settled curve or engine fill: retain the anonymous tape, update OHLC, and note player activity for replies. */
export function pushTape(t: LpToken, tr: LpTrade): void {
  t.tape.push(tr);
  if (t.tape.length > LP.TAPE_KEEP) t.tape.splice(0, t.tape.length - LP.TAPE_KEEP);
  touchBar(t, tr.tick, tr.price);
  if (!tr.npc) t.playerTradeAt = tr.tick;
}
