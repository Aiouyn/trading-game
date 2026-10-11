import { cashOf } from '../core';
import type { CommandResult, GameState, StepOutput } from '../types';
import { LP } from './constants';
import { quoteBuy, quoteSell } from './curve';
import { addAccountCash, centsOf, faucetCents, isCreatorLinked, moveCents, pushBuy, pushLot, refuse, tokenOf } from './state';
import { curveAccountId } from './constants';
import { lockedOf, vestEndDay } from './vest';
import type { LpLot, LpToken, LpTrade } from './types';
import { recordCreatorSale } from './rug';
import { graduate } from './graduate';
import type { GameState as G } from '../types';

/**
 * Trading on the curve (lead-launchpad.md L3). A player buy or sell and an NPC retail fill share one settlement, so the money
 * identity holds for both. Every cent either moves between accounts or is booked as a faucet or a sink:
 *   - a player buy: the trader pays the whole outlay; the curve gets the cash net of the fee; the creator gets half the fee
 *     (booked income, a transfer), and the other half is a sink;
 *   - a player sell: the curve pays the formula cash; the trader gets it less the fee; the fee splits as above;
 *   - an NPC fill: the NPC cash is the npcRetail faucet (in on a buy, out on a sell), and the fee splits as above.
 */

const tickOf = (g: GameState) => g.market.tick;

function pushTape(t: LpToken, tr: LpTrade): void {
  t.tape.push(tr);
  if (t.tape.length > LP.TAPE_KEEP) t.tape.splice(0, t.tape.length - LP.TAPE_KEEP);
}

/** The creator's account, when the token has a player creator (a world launch has none). */
function creatorAccount(g: GameState, t: LpToken): string | null {
  return t.creatorId && g.market.accounts[t.creatorId] ? t.creatorId : null;
}

/**
 * Books a token's trading fee. The creator half goes to the creator's account (a transfer, booked as their income), or is a sink
 * with no creator account. The sink half leaves the world. A fill from the curve pays both out of the curve; a trader's fill has
 * already moved its outlay or proceeds, so only the creator half is paid in and the sink half is simply destroyed.
 */
function bookFee(g: GameState, t: LpToken, fromCurve: boolean, creatorCents: number, sinkC: number): void {
  const curve = curveAccountId(t.ticker);
  const ca = creatorAccount(g, t);
  if (ca) {
    if (fromCurve) moveCents(g, curve, ca, creatorCents);
    else addAccountCash(g, ca, creatorCents);
    t.creatorFees += creatorCents / 100;
    g.launchpad!.totals.creatorFee += creatorCents / 100;
  } else if (creatorCents > 0) {
    if (fromCurve) addAccountCash(g, curve, -creatorCents);
    g.economy.sinks.lpTradeFee = (g.economy.sinks.lpTradeFee ?? 0) + creatorCents / 100;
    g.launchpad!.totals.tradeFee += creatorCents / 100;
  }
  if (fromCurve && sinkC > 0) addAccountCash(g, curve, -sinkC);
  g.economy.sinks.lpTradeFee = (g.economy.sinks.lpTradeFee ?? 0) + sinkC / 100;
  g.launchpad!.totals.tradeFee += sinkC / 100;
  t.flows.fee += (creatorCents + sinkC) / 100;
}

/** Buys `spendCents` (the whole outlay, fee included) of a token from its curve. Refusals are three-part. */
export function buyCurve(
  g: GameState, pid: string | null, ticker: string, spendCents: number, maxSlip: number, out: StepOutput | null, npc = false,
): CommandResult {
  const t = tokenOf(g, ticker);
  if (!t) return refuse('noToken', { ticker });
  if (t.status === 'graduated') return refuse('graduated', { ticker });
  if (t.status === 'dead') return refuse('dead', { ticker });
  const q = quoteBuy(t.y, spendCents);
  if (!q.ok) return refuse(q.code === 'sold' ? 'sold' : q.code === 'tooSmall' ? 'tooSmall' : 'zero', { ticker });
  const curve = curveAccountId(t.ticker);
  if (npc || !pid) {
    // an NPC's cash is a booked faucet (the npcRetail line): it enters the world into the curve, and the fee leaves it
    faucetCents(g, curve, 'npcRetail', q.spendCents);
    bookFee(g, t, true, q.creatorFeeCents, q.sinkFeeCents);
    t.npcBal += q.tokens;
    t.npcCost += q.cashCents / 100;
    t.flows.npcBuy += q.spendCents / 100;
  } else {
    if (centsOf(cashOf(g, pid)) < q.spendCents) return refuse('cash', { need: (q.spendCents / 100).toFixed(2) });
    if (q.slippage > maxSlip) return refuse('slippage', { slip: pct(q.slippage), max: pct(maxSlip) });
    if (t.creatorId && isCreatorLinked(g, t.creatorId, pid)) {
      const room = LP.CREATOR_CAP - t.allocation - t.creatorBought;
      if (q.tokens > room) return refuse('creatorCap', { room: Math.max(0, room).toLocaleString('en-US') });
      t.creatorBought += q.tokens;
    }
    addAccountCash(g, pid, -q.spendCents);
    addAccountCash(g, curve, q.cashCents);
    bookFee(g, t, false, q.creatorFeeCents, q.sinkFeeCents);
    const L: LpLot[] = t.lots[pid] ?? (t.lots[pid] = []);
    pushLot(L, { qty: q.tokens, cost: q.spendCents / 100 / q.tokens, tick: tickOf(g) });
    pushBuy(t, pid, tickOf(g), q.tokens);
    t.bal[pid] = (t.bal[pid] ?? 0) + q.tokens;
    t.flows.playerBuy += q.spendCents / 100;
    t.buzz.base += LP.BUY_BUZZ_PER_100 * (q.spendCents / 100) / 100;
  }
  t.y -= q.tokens;
  t.volToday += q.spendCents / 100;
  t.lastTradeTick = tickOf(g);
  pushTape(t, { tick: tickOf(g), side: 'buy', qty: q.tokens, price: q.avgPrice, creator: !!pid && pid === t.creatorId, npc: npc || !pid });
  if (q.graduates) graduate(g, t, out);
  return {
    ok: true,
    data: { tokens: q.tokens, spendCents: q.spendCents, feeCents: q.feeCents, avgPrice: q.avgPrice, slippage: q.slippage, impact: q.impact, graduated: q.graduates },
  };
}

/** Sells `tokens` back to a token's curve. The curve pays the formula cash; the trader gets it less the fee. */
export function sellCurve(
  g: GameState, pid: string | null, ticker: string, tokens: number, maxSlip: number, out: StepOutput | null, npc = false,
): CommandResult {
  const t = tokenOf(g, ticker);
  if (!t) return refuse('noToken', { ticker });
  if (t.status === 'graduated') return refuse('graduated', { ticker });
  if (!Number.isInteger(tokens) || tokens <= 0) return refuse('zero', { ticker });
  const holder = npc || !pid ? null : pid;
  const have = holder ? (t.bal[holder] ?? 0) : t.npcBal;
  if (tokens > have) return refuse('holdings', { have: have.toLocaleString('en-US') });
  if (holder) {
    const lock = lockedOf(t, holder, tickOf(g));
    if (have - tokens < lock) return refuse('locked', { locked: lock.toLocaleString('en-US'), day: vestEndDay(t) });
  }
  const q = quoteSell(t.y, tokens);
  if (!q.ok) return refuse(q.code === 'tooLarge' ? 'tooLarge' : 'zero', { ticker });
  if (holder && q.slippage > maxSlip) return refuse('slippage', { slip: pct(q.slippage), max: pct(maxSlip) });
  const curve = curveAccountId(t.ticker);
  const curveCash = g.market.accounts[curve]?.cash ?? 0;
  if (curveCash * 100 + 1e-6 < q.grossCents) throw new Error(`launchpad: curve ${t.ticker} cannot pay ${q.grossCents} cents`);
  addAccountCash(g, curve, -q.grossCents);
  if (holder) {
    addAccountCash(g, holder, q.netCents);
    bookFee(g, t, false, q.creatorFeeCents, q.sinkFeeCents);
    // FIFO: the sold lots leave first; the realised P&L is the proceeds less the cost of the lots sold
    let rem = tokens;
    let cost = 0;
    const L = t.lots[holder] ?? [];
    while (rem > 0 && L.length > 0) {
      const lot = L[0]!;
      const take = Math.min(rem, lot.qty);
      cost += take * lot.cost;
      lot.qty -= take;
      rem -= take;
      if (lot.qty <= 0) L.shift();
    }
    t.lots[holder] = L;
    t.realized[holder] = (t.realized[holder] ?? 0) + q.netCents / 100 - cost;
    const left = (t.bal[holder] ?? 0) - tokens;
    if (left > 0) t.bal[holder] = left;
    else delete t.bal[holder];
    t.flows.playerSell += q.grossCents / 100;
    t.buzz.base = Math.max(0, t.buzz.base - LP.SELL_BUZZ_PER_100 * (q.grossCents / 100) / 100);
  } else {
    // an NPC's cash leaves the world: the net is a booked sink (the npcRetail line), the fees split as above
    g.economy.sinks.npcRetail = (g.economy.sinks.npcRetail ?? 0) + q.netCents / 100;
    bookFee(g, t, false, q.creatorFeeCents, q.sinkFeeCents);
    const avg = t.npcBal > 0 ? t.npcCost / t.npcBal : 0;
    t.npcBal -= tokens;
    t.npcCost = Math.max(0, t.npcCost - avg * tokens);
    t.flows.npcSell += q.grossCents / 100;
  }
  t.y += tokens;
  t.volToday += q.grossCents / 100;
  t.lastTradeTick = tickOf(g);
  pushTape(t, { tick: tickOf(g), side: 'sell', qty: tokens, price: q.avgPrice, creator: !!holder && holder === t.creatorId, npc: !holder });
  if (holder) recordCreatorSale(g, t, holder, tokens, q.netCents, out);
  return { ok: true, data: { tokens, grossCents: q.grossCents, netCents: q.netCents, feeCents: q.feeCents, avgPrice: q.avgPrice, slippage: q.slippage } };
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

/** A player's buy from the command (spend in whole cents; the max slippage is a fraction, default 5%). */
export function lpBuy(g: G, pid: string, ticker: string, spendCents: number, maxSlip: number | undefined, out: StepOutput | null): CommandResult {
  const ms = maxSlip ?? LP.MAX_SLIP;
  if (!(ms > 0 && ms <= 0.5)) return refuse('maxSlip', {});
  if (!Number.isInteger(spendCents) || spendCents <= 0) return refuse('zero', { ticker });
  return buyCurve(g, pid, ticker, spendCents, ms, out, false);
}

/** A player's sell from the command (whole tokens; the max slippage is a fraction, default 5%). */
export function lpSell(g: G, pid: string, ticker: string, tokens: number, maxSlip: number | undefined, out: StepOutput | null): CommandResult {
  const ms = maxSlip ?? LP.MAX_SLIP;
  if (!(ms > 0 && ms <= 0.5)) return refuse('maxSlip', {});
  return sellCurve(g, pid, ticker, tokens, ms, out, false);
}
