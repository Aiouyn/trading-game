import { LP } from './constants';
import { touchBar } from './bars';
import type { LpToken, LpTrade } from './types';

/** A settled curve or engine fill: retain the anonymous tape, update OHLC, and note player activity for replies. */
export function pushTape(t: LpToken, tr: LpTrade): void {
  t.tradeSeq = (t.tradeSeq ?? t.tape.length) + 1;
  tr.seq = t.tradeSeq;
  if (!tr.chatter) {
    const flow = t.crowdPrints ?? (t.crowdPrints = { playerBuy: 0, playerSell: 0, npcBuy: 0, npcSell: 0 });
    const usd = tr.usd ?? tr.qty * tr.price;
    if (tr.npc) { if (tr.side === 'buy') flow.npcBuy += usd; else flow.npcSell += usd; }
    else if (tr.side === 'buy') flow.playerBuy += usd;
    else flow.playerSell += usd;
  }
  t.tape.push(tr);
  if (t.tape.length > LP.TAPE_KEEP) t.tape.splice(0, t.tape.length - LP.TAPE_KEEP);
  touchBar(t, tr.tick, tr.price);
  if (!tr.npc) t.playerTradeAt = tr.tick;
}
