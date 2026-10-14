import { assetFlow, cashOf } from '../core';
import type { CommandResult, GameState, StepOutput } from '../types';
import { LP } from './constants';
import { quoteBuy, quoteSell } from './curve';
import { addAccountCash, centsOf, faucetCents, isCreatorLinked, moveCents, pushBuy, pushLot, refuse, tokenOf } from './state';
import { addCohort, takeFromCohorts } from './cohorts';
import { curveAccountId } from './constants';
import { anonOf } from './anon';
import { lockedOf, vestEndDay } from './vest';
import { cohortsOf } from './cohorts';
import type { LpLot, LpToken, MicroTrader } from './types';
import { recordCreatorSale } from './rug';
import { pushTape } from './tape';
import { curveHoldingsValue } from './value';
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

/** The creator's account, when the token has a player creator (a world launch has none). */
function creatorAccount(g: GameState, t: LpToken): string | null {
  return t.creatorId && g.market.accounts[t.creatorId] ? t.creatorId : null;
}

/**
 * Books a token's trading fee. The creator half goes to the creator's account (a transfer, booked as their income), or is a sink
 * with no creator account. The sink half leaves the world. A fill from the curve pays both out of the curve; a trader's fill has
 * already moved its outlay or proceeds, so only the creator half is paid in and the sink half is simply destroyed.
 *
 * An NPC fill books its fee on the npcRetail line (both halves when the token has no creator; the creator half is a transfer when it
 * has one). So the npcRetail line is the NPC side's whole net money into the world, its own fees included: a flat cohort is not a
 * faucet by its fees (L6.1 gate, the npcRetail net per token).
 */
function bookFee(g: GameState, t: LpToken, fromCurve: boolean, creatorCents: number, sinkC: number, npc = false): void {
  const line = npc ? 'npcRetail' : 'lpTradeFee';
  const curve = curveAccountId(t.ticker);
  const ca = creatorAccount(g, t);
  if (ca) {
    if (fromCurve) moveCents(g, curve, ca, creatorCents);
    else addAccountCash(g, ca, creatorCents);
    t.creatorFees += creatorCents / 100;
    g.launchpad!.totals.creatorFee += creatorCents / 100;
  } else if (creatorCents > 0) {
    if (fromCurve) addAccountCash(g, curve, -creatorCents);
    g.economy.sinks[line] = (g.economy.sinks[line] ?? 0) + creatorCents / 100;
    g.launchpad!.totals.tradeFee += creatorCents / 100;
  }
  if (fromCurve && sinkC > 0) addAccountCash(g, curve, -sinkC);
  g.economy.sinks[line] = (g.economy.sinks[line] ?? 0) + sinkC / 100;
  g.launchpad!.totals.tradeFee += sinkC / 100;
  t.flows.fee += (creatorCents + sinkC) / 100;
}

/** Buys `spendCents` (the whole outlay, fee included) of a token from its curve. Refusals are three-part. */
export function buyCurve(
  g: GameState, pid: string | null, ticker: string, spendCents: number, maxSlip: number, out: StepOutput | null, npc = false,
  chatter = false, wallet?: MicroTrader,
): CommandResult {
  const t = tokenOf(g, ticker);
  if (!t) return refuse('noToken', { ticker });
  if (t.status === 'graduated') return refuse('graduated', { ticker });
  if (t.status === 'dead') return refuse('dead', { ticker });
  const q = quoteBuy(t.y, spendCents);
  if (!q.ok) return refuse(q.code === 'sold' ? 'sold' : q.code === 'tooSmall' ? 'tooSmall' : 'zero', { ticker });
  const curve = curveAccountId(t.ticker);
  if (npc || !pid) {
    if (wallet && wallet.cashCents < q.spendCents) return refuse('cash', { need: (q.spendCents / 100).toFixed(2) });
    if (wallet) wallet.cashCents -= q.spendCents;
    // an NPC's cash is a booked faucet (the npcRetail line): it enters the world into the curve, and the fee leaves it
    faucetCents(g, curve, 'npcRetail', q.spendCents);
    bookFee(g, t, true, q.creatorFeeCents, q.sinkFeeCents, true);
    // L6.8: the buy is one cohort (its own half-life and cost basis)
    addCohort(t, tickOf(g), q.tokens, q.cashCents / 100, wallet?.id);
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
    // L6.5: a player's buy adds no buzz and is no arrival (no copycat in V1)
    if (pid !== t.creatorId) t.playerTraded = true;
  }
  t.y -= q.tokens;
  t.volToday += q.spendCents / 100;
  // the no-trade clock (L3) counts player fills only: the NPC cohort bleeds every tick (L6.8), which is not a trade by anyone
  if (!npc) t.lastTradeTick = tickOf(g);
  // R-10-6: the tape's notional is the outlay (the fee included) in dollars. A player line is that player's anonymous id.
  // An NPC line is one of 64 recurring wallets for this ticker, never a handle and never a player id.
  pushTape(t, {
    tick: tickOf(g), side: 'buy', qty: q.tokens, price: q.avgPrice, creator: !!pid && pid === t.creatorId, npc: npc || !pid,
    usd: q.spendCents / 100, anon: anonOf(t.ticker, wallet?.id ?? (npc || !pid ? `npc:${(tickOf(g) * 3 + t.tape.length) % 64}` : pid)),
    ...(chatter ? { chatter: true } : {}),
  });
  if (q.graduates) graduate(g, t, out);
  return {
    ok: true,
    data: { tokens: q.tokens, spendCents: q.spendCents, feeCents: q.feeCents, avgPrice: q.avgPrice, slippage: q.slippage, impact: q.impact, graduated: q.graduates },
  };
}

/** Sells `tokens` back to a token's curve. The curve pays the formula cash; the trader gets it less the fee. */
export function sellCurve(
  g: GameState, pid: string | null, ticker: string, tokens: number, maxSlip: number, out: StepOutput | null, npc = false,
  plan?: number[], chatter = false, wallet?: MicroTrader,
): CommandResult {
  const t = tokenOf(g, ticker);
  if (!t) return refuse('noToken', { ticker });
  if (t.status === 'graduated') return refuse('graduated', { ticker });
  if (!Number.isInteger(tokens) || tokens <= 0) return refuse('zero', { ticker });
  const holder = npc || !pid ? null : pid;
  // L6.8: an NPC sell takes from the cohorts (the planned count of each, or the oldest first)
  const have = holder ? (t.bal[holder] ?? 0) : cohortsOf(t).reduce((a, c) => a + c.tokens, 0);
  if (tokens > have) return refuse('holdings', { have: have.toLocaleString('en-US') });
  if (holder) {
    const lock = lockedOf(t, holder, tickOf(g));
    if (have - tokens < lock) {
      const endDay = vestEndDay(t);
      // v1.4: before graduation the allocation has no unlock day yet (the schedule starts at the graduation tick)
      if (endDay === null) return refuse('lockedGrad', { locked: lock.toLocaleString('en-US') });
      return refuse('locked', { locked: lock.toLocaleString('en-US'), day: endDay });
    }
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
    if (holder !== t.creatorId) t.playerTraded = true;
  } else {
    // an NPC's cash leaves the world: the net is a booked sink (the npcRetail line), the fees split as above
    g.economy.sinks.npcRetail = (g.economy.sinks.npcRetail ?? 0) + q.netCents / 100;
    bookFee(g, t, false, q.creatorFeeCents, q.sinkFeeCents, true);
    takeFromCohorts(t, tokens, plan);
    if (wallet) wallet.cashCents += q.netCents;
    t.flows.npcSell += q.grossCents / 100;
  }
  t.y += tokens;
  t.volToday += q.grossCents / 100;
  if (holder) t.lastTradeTick = tickOf(g);
  pushTape(t, {
    tick: tickOf(g), side: 'sell', qty: tokens, price: q.avgPrice, creator: !!holder && holder === t.creatorId, npc: !holder,
    usd: q.grossCents / 100, anon: anonOf(t.ticker, wallet?.id ?? holder ?? `npc:${(tickOf(g) * 3 + t.tape.length) % 64}`),
    ...(chatter ? { chatter: true } : {}),
  });
  if (holder) recordCreatorSale(g, t, holder, tokens, q.netCents, out);
  return { ok: true, data: { tokens, grossCents: q.grossCents, netCents: q.netCents, feeCents: q.feeCents, avgPrice: q.avgPrice, slippage: q.slippage } };
}

/**
 * The cohort's flat-out exit when a token dies or is cancelled: its tokens go back to the curve in one fill (the curve pays sellers
 * after death, L3), so the NPC side is flat in tokens over the token's life (L6.1). Nothing to sell, nothing to do.
 */
export function liquidateCohort(g: GameState, t: LpToken, out: StepOutput | null): void {
  t.sniper = undefined;
  for (const w of t.micro?.traders ?? []) {
    const cs = cohortsOf(t);
    const plan = cs.map(c => c.wallet === w.id ? c.tokens : 0);
    const qty = plan.reduce((sum, n) => sum + n, 0);
    if (qty > 0) sellCurve(g, null, t.ticker, qty, 1, out, true, plan, false, w);
  }
  if (t.npcBal > 0) sellCurve(g, null, t.ticker, t.npcBal, 1, out, true);
}

/** A percentage as the viewer typed it: up to four decimals, no trailing zeros (a 0.01% limit reads 0.01%, not 0.0%). */
function pct(x: number): string {
  return `${Number((x * 100).toFixed(4))}%`;
}

/** A player's buy from the command (spend in whole cents; the max slippage is a fraction, default 5%). */
export function lpBuy(g: G, pid: string, ticker: string, spendCents: number, maxSlip: number | undefined, out: StepOutput | null): CommandResult {
  const ms = maxSlip ?? LP.MAX_SLIP;
  if (!(ms > 0 && ms <= 0.5)) return refuse('maxSlip', {});
  if (!Number.isInteger(spendCents) || spendCents <= 0) return refuse('zero', { ticker });
  // the cash paid converts into the tokens (trading 0); the tokens' drop to their sale quote is a re-mark
  const cashBefore = cashOf(g, pid);
  const r = buyCurve(g, pid, ticker, spendCents, ms, out, false);
  assetFlow(g, pid, cashBefore - cashOf(g, pid));
  return r;
}

/** A player's sell from the command (whole tokens; the max slippage is a fraction, default 5%). */
export function lpSell(g: G, pid: string, ticker: string, tokens: number, maxSlip: number | undefined, out: StepOutput | null): CommandResult {
  const ms = maxSlip ?? LP.MAX_SLIP;
  if (!(ms > 0 && ms <= 0.5)) return refuse('maxSlip', {});
  const before = curveHoldingsValue(g, pid);
  const r = sellCurve(g, pid, ticker, tokens, ms, out, false);
  assetFlow(g, pid, curveHoldingsValue(g, pid) - before); // the tokens leave valuation at the quote they sold for
  return r;
}
