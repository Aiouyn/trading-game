// The player's trading desk: market and limit orders that walk the book and say what they filled, short
// selling (borrow, sell, pay the fee, cover, get squeezed or recalled) and stop orders that live in the
// sim and fire on the price whether or not a screen is open.
import type { World } from '../../kernel/index.ts';
import { tradeFuture } from '../commodities/index.ts';
import { cancelCoinOrder, coinPrice, orderCoin } from '../crypto/index.ts';
import { DEP, pay, type EconState } from '../economy/index.ts';
import { borrowShares, cancelOrder, midPrice, nextOrderId, returnShares, trade, type Execution } from '../markets/index.ts';
import type { ActResult } from './index.ts';
import { dollars } from './life.ts';
import { futKey, sayFill, type BasisBook } from './basis.ts';

export interface StockLoan {
  instr: string;
  qty: number;
  claim: string;
  face: number;
  /** Who lent the shares. Older saves have none: the dealer. */
  lender?: string;
  /** Average price the borrowed shares sold at, in cents. */
  entry?: number;
  /** Shares of the same name the player held before borrowing. Anything held above that covers the loan. */
  base?: number;
  since?: number;
  /** Borrow fees paid so far, in cents. */
  fees?: number;
}

export interface Stop {
  id: number;
  kind: 'share' | 'coin' | 'fut';
  side: string;
  /** Share instrument, coin id, or future good. */
  instr: string;
  qty: number;
  /** Cents. */
  stop: number;
  /** Cents; set on a stop-limit order. */
  limit?: number;
  /** True when it fires as the price rises to the stop (a buy stop), false when it falls to it (a sell stop). */
  above: boolean;
  /** Futures: the absolute delivery month. */
  month?: number;
  label: string;
  day: number;
  /** 'limit' is a standing limit order the desk holds for a market with no book of its own (a future, a memecoin): it fires when the price comes down to a buy limit or up to a sell limit. Absent means a stop. */
  mode?: 'stop' | 'limit';
}

export interface TradeSeat { loans: StockLoan[]; stops?: Stop[]; margin: boolean; arrived: number; basis?: BasisBook }

const econ = (w: World): EconState => w.state.economy as EconState;
const rejected = (why: string): ActResult => ({ status: 'rejected', why });
const whyOf = (e: unknown): string => e instanceof Error ? e.message : String(e);
const cashOf = (w: World, id: string): number => Math.floor(w.ledger.balance(id, DEP));
const centsOf = (n: number): string => dollars(Math.round(n));
const cents = centsOf;

function causeOf(w: World, seat: TradeSeat): number {
  return seat.arrived >= 0 ? seat.arrived : econ(w).macroEv >= 0 ? econ(w).macroEv : w.genesis;
}

/** The fills of one order in words: how many, what it cost, the average, and where the book ran out. */
function fillWords(ex: { asked: number; filled: number; cents: number; avg: number; fills: { px: number; qty: number }[] }, verb: string, label: string, mid: number): string {
  const part = ex.filled < ex.asked ? `${ex.filled} of the ${ex.asked} ${label}` : `${ex.filled} ${label}`;
  const over = mid > 0 ? ex.avg - mid : 0;
  const slip = mid > 0 && Math.abs(over) >= 0.5 ? `, ${cents(Math.abs(over))} a share ${over > 0 === (verb === 'bought') ? 'worse' : 'better'} than the ${cents(mid)} mid` : '';
  const shown = ex.fills.slice(0, 4).map((f) => `${f.qty} at ${cents(f.px)}`).join(', ') + (ex.fills.length > 4 ? ', and more' : '');
  let t = `${verb} ${part} for ${cents(ex.cents)}, average ${cents(ex.avg)}${slip}. Fills: ${shown}.`;
  if (ex.filled < ex.asked) t += ` The book had no more within reach; the other ${ex.asked - ex.filled} did not fill.`;
  return t;
}

/** Why nothing filled. */
function nothing(side: 'buy' | 'sell', label: string, cash: number, mid: number, held: number): string {
  if (side === 'sell' && held < 1) return `you hold no ${label}`;
  if (side === 'buy' && mid > 0 && cash < mid) return `you cannot pay for a share: ${label} is about ${cents(mid)} and you hold ${cents(cash)}`;
  return side === 'buy' ? `nobody is offering ${label} at that price` : `nobody is bidding for ${label} at that price`;
}

/** A market or limit order on a listed share, filled now as far as the book allows. */
export function placeShareOrder(w: World, seat: TradeSeat, id: string, instr: string, side: 'buy' | 'sell', qty: number, limit: number | undefined, label: string): ActResult {
  const cause = causeOf(w, seat);
  let ex: Execution;
  try { ex = trade(w, id, { instr, side, qty, limit }, cause); }
  catch (e) { return rejected(whyOf(e)); }
  settleCovers(w, seat, id, cause);
  if (ex.filled < 1) {
    if (ex.restId !== undefined) return { status: 'accepted', orderId: ex.restId, fill: 0, text: `${side} ${qty} ${label} at ${cents(limit ?? 0)}: resting, ${side === 'buy' ? 'nothing is offered that cheap' : 'nothing is bid that high'} yet` };
    return rejected(nothing(side, label, cashOf(w, id), ex.mid, Math.floor(w.ledger.balance(id, instr))));
  }
  let text = fillWords(ex, side === 'buy' ? 'bought' : 'sold', label, ex.mid);
  if (ex.restId !== undefined) text += ` The other ${qty - ex.filled} rest at ${cents(limit ?? 0)} until the price comes or you cancel.`;
  return { status: 'accepted', orderId: ex.restId, fill: ex.filled, cents: Math.round(ex.cents), avg: ex.avg, fills: ex.fills, text };
}

/** Same spare a fund leaves a holder: some of the position stays, the rest can be lent. */
function locateShares(w: World, actor: string, instr: string, qty: number, cause: number): { qty: number; lender: string } | undefined {
  let lender = '', have = 0;
  const ids = w.ledger.ids;
  for (const [slot, n] of w.ledger.holdersS(instr)) {
    const id = ids[slot];
    if (!id || id === actor || !id.startsWith('p_') || n < have) continue;
    const spare = Math.floor(n * 0.45);
    if (spare > have) { have = spare; lender = id; }
  }
  const take = Math.min(qty, Math.floor(have));
  if (take < 1 || !lender) return undefined;
  if (!w.ledger.move(instr, lender, actor, take, 'mkt.borrow', cause)) return undefined;
  return { qty: take, lender };
}

/** Annual fee on borrowed shares: cheap for a deep name, dear when the loan is a large part of the company. */
function borrowRate(w: World, instr: string, qty: number): number {
  const out = Math.max(1, w.ledger.issued.get(instr) ?? 1);
  return Math.min(0.6, 0.02 + 0.5 * qty / out);
}

function giveBack(w: World, id: string, lender: string, instr: string, qty: number, cause: number): void {
  if (qty < 1) return;
  if (lender === 'fund_mm') returnShares(w, id, instr, qty, cause);
  else w.ledger.move(instr, id, lender, qty, 'mkt.borrow', cause);
}

/** Borrow shares, sell them into the book and owe the shares back. The cash proceeds stay in the account. */
export function shortSell(w: World, seat: TradeSeat, id: string, instr: string, qty: number, limit: number | undefined, label: string): ActResult {
  if (!seat.margin) return rejected('short selling needs a margin account at a bank: open one with borrow AMOUNT margin');
  const mid = midPrice(w, instr);
  if (!(mid > 0)) return rejected(`not listed ${instr}`);
  const need = Math.round(qty * mid * 0.5);
  if (cashOf(w, id) < need) return rejected(`a short of ${qty} ${label} is about ${cents(qty * mid)}. The lender wants ${cents(need)} in cash behind it and you hold ${cents(cashOf(w, id))}`);
  const cause = causeOf(w, seat);
  const before = Math.floor(w.ledger.balance(id, instr));
  let got = borrowShares(w, id, instr, qty, cause);
  let lender = 'fund_mm';
  if (got < qty) {
    const loc = locateShares(w, id, instr, qty - got, cause);
    if (loc && got < 1) { got = loc.qty; lender = loc.lender; }
    else if (loc) giveBack(w, id, loc.lender, instr, loc.qty, cause); // two lenders for one loan: keep it simple, one lender per loan
  }
  if (got < 1) return rejected('nobody can lend you those shares: none are available to borrow');
  let ex: Execution;
  try { ex = trade(w, id, { instr, side: 'sell', qty: got, limit }, cause); }
  catch (e) { giveBack(w, id, lender, instr, got, cause); return rejected(whyOf(e)); }
  if (ex.restId !== undefined) cancelOrder(w, id, ex.restId);
  const sold = ex.filled;
  if (sold < got) giveBack(w, id, lender, instr, got - sold, cause);
  if (sold < 1) return rejected(`the book would not take the shares: ${label} has no bids within reach, so the borrowed shares went back`);
  const face = Math.round(sold * ex.mid);
  const claim = `stkln:${id}:${instr}`;
  if (!w.ledger.instruments.has(claim)) w.ledger.define({ id: claim, kind: 'claim', issuer: id });
  w.ledger.issue(claim, lender, face, 'mkt.borrow', cause);
  seat.loans.push({ instr, qty: sold, claim, face, lender, entry: ex.avg, base: before, since: w.day });
  const fee = borrowRate(w, instr, sold);
  let text = fillWords(ex, 'shorted', label, ex.mid).replace('shorted ', 'borrowed and sold ') + ` You owe ${sold} shares back. The borrow fee is ${(fee * 100).toFixed(1)}% a year, paid daily. Buy ${label} to cover.`;
  if (sold < qty) text += ` The other ${qty - sold} were not borrowed or not sold.`;
  return { status: 'accepted', fill: sold, eventId: cause, cents: Math.round(ex.cents), avg: ex.avg, fills: ex.fills, text };
}

/** Shares held above what the player held before borrowing go back to the lender and cancel the debt. */
export function settleCovers(w: World, seat: TradeSeat, id: string, cause: number): void {
  if (!seat.loans.length) return;
  for (const l of [...seat.loans]) {
    let base = 0;
    for (const o of seat.loans) if (o.instr === l.instr) base = Math.max(base, o.base ?? 0);
    const excess = Math.floor(w.ledger.balance(id, l.instr)) - base;
    if (excess < 1) continue;
    const q = Math.min(excess, l.qty);
    const lender = l.lender ?? 'fund_mm';
    const part = q >= l.qty ? l.face : Math.floor(l.face * q / l.qty);
    giveBack(w, id, lender, l.instr, q, cause);
    if (part > 0 && w.ledger.balance(lender, l.claim) >= part) w.ledger.redeem(l.claim, lender, part, 'mkt.borrow', cause);
    l.qty -= q;
    l.face -= part;
    if (l.qty < 1) seat.loans.splice(seat.loans.indexOf(l), 1);
  }
}

/** Short exposure marked to the quote: what the borrowed shares cost to buy back, against the face the debt was booked at. Negative when the price has risen. */
export function shortMark(w: World, seat: TradeSeat): number {
  let adj = 0;
  for (const l of seat.loans) {
    const mid = midPrice(w, l.instr);
    if (mid > 0) adj += l.face - l.qty * mid;
  }
  return adj;
}

/** Buy back a loan at the market now, because it was squeezed or recalled. */
function buyIn(w: World, seat: TradeSeat, id: string, l: StockLoan, why: string, cause: number): void {
  const want = l.qty;
  const instr = l.instr;
  let filled = 0;
  try { filled = trade(w, id, { instr, side: 'buy', qty: want }, cause).filled; } catch { filled = 0; }
  settleCovers(w, seat, id, cause);
  const msg = `${why}: ${filled} of ${want} ${instr.replace('eq:frm_', '').replace('eq:', '')} bought back at the market`;
  w.events.emit('player.buyin', msg, [cause], id);
}

/** Once a day: pay the borrow fee, and buy in a short that has been squeezed or recalled. */
export function shortsDay(w: World, seat: TradeSeat, id: string): void {
  if (!seat.loans.length) return;
  const cause = causeOf(w, seat);
  const P = econ(w).P;
  settleCovers(w, seat, id, cause);
  for (const l of [...seat.loans]) {
    if (!seat.loans.includes(l)) continue;
    const mid = midPrice(w, l.instr);
    if (!(mid > 0)) continue;
    const lender = l.lender ?? 'fund_mm';
    const fee = Math.round(l.qty * mid * borrowRate(w, l.instr, l.qty) / 360);
    if (fee > 0) {
      const paid = Math.min(fee, cashOf(w, id));
      if (pay(w, id, lender, paid, 'mkt.borrowfee', cause)) l.fees = (l.fees ?? 0) + paid;
    }
    const notional = l.qty * mid;
    const entry = l.entry ?? mid;
    const lenderIdx = lender.startsWith('p_') ? +lender.slice(2) : -1;
    if (lenderIdx >= 0 && lenderIdx < P.n && !P.alive(lenderIdx)) { buyIn(w, seat, id, l, 'the lender died and the estate wants the shares back: recalled', cause); continue; }
    if (lenderIdx >= 0 && w.rng('mkt:recall').chance(0.004)) { buyIn(w, seat, id, l, 'the lender wants the shares back: recalled', cause); continue; }
    if (mid >= entry * 1.35 || cashOf(w, id) < notional * 1.1) buyIn(w, seat, id, l, 'the price ran against the short and the lender called it: squeezed', cause);
  }
}

// ---- stop and stop-limit orders ----

function stopPrice(w: World, s: Stop): number {
  if (s.kind === 'share') return midPrice(w, s.instr);
  if (s.kind === 'coin') return coinPrice(w, s.instr)?.px ?? 0;
  const books = (w.state.commodities as { books?: { good: string; tenors: { month: number; px: number }[] }[] } | undefined)?.books;
  return books?.find((b) => b.good === s.instr)?.tenors.find((t) => t.month === s.month)?.px ?? 0;
}

export interface StopSpec {
  kind: Stop['kind'];
  side: string;
  instr: string;
  qty: number;
  stop: number;
  limit?: number;
  months?: number;
  label: string;
  mode?: 'stop' | 'limit';
}

/** Hold a stop (or stop-limit) order. A buy stop sits above the market, a sell stop below it. */
export function placeStop(w: World, seat: TradeSeat, spec: StopSpec): ActResult {
  // a memecoin trades at fractions of a cent, so its price may be one; every other market quotes whole cents
  if (!(spec.stop > 0) || !Number.isFinite(spec.stop) || (spec.kind !== 'coin' && !Number.isSafeInteger(spec.stop))) return rejected('the stop price must be a positive number');
  const cents = (n: number): string => (spec.kind === 'coin' && n < 100 ? '$' + (n / 100).toFixed(6) : centsOf(n));
  if (spec.limit !== undefined && spec.kind === 'fut') return rejected('a future has no limit price: use a plain stop');
  const px = stopPrice(w, { kind: spec.kind, instr: spec.instr, month: spec.months !== undefined ? w.month + spec.months : undefined } as Stop);
  if (!(px > 0)) return rejected(`${spec.label} has no price to watch right now`);
  const buying = spec.side === 'buy' || spec.side === 'long';
  const selling = spec.side === 'sell' || spec.side === 'short';
  const limitOrder = spec.mode === 'limit';
  let above: boolean;
  if (limitOrder) {
    // A buy limit waits for the price to come down to it, a sell limit for the price to rise to it.
    if (!buying && !selling) return rejected('a limit order buys or sells');
    above = selling;
    if (!above && spec.stop >= px) return rejected(`a buy limit sits below the market: ${spec.label} is ${cents(px)} now, so a buy at ${cents(spec.stop)} or less would fill at once. Use a market order, or name a lower price`);
    if (above && spec.stop <= px) return rejected(`a sell limit sits above the market: ${spec.label} is ${cents(px)} now, so a sale at ${cents(spec.stop)} or more would fill at once. Use a market order, or name a higher price`);
  } else {
    if (buying) above = true;
    else if (selling) above = false;
    else above = spec.stop > px;
    if (above && spec.stop <= px) return rejected(`a buy stop sits above the market: ${spec.label} is ${cents(px)} now and a stop at ${cents(spec.stop)} would fire at once`);
    if (!above && spec.stop >= px) return rejected(`a sell stop sits below the market: ${spec.label} is ${cents(px)} now and a stop at ${cents(spec.stop)} would fire at once`);
  }
  const stops = seat.stops ?? (seat.stops = []);
  if (stops.length >= 40) return rejected('forty stops are standing: cancel one first');
  const id = nextOrderId(w);
  stops.push({
    id, kind: spec.kind, side: spec.side, instr: spec.instr, qty: spec.qty, stop: spec.stop, limit: spec.limit,
    above, month: spec.months !== undefined ? w.month + spec.months : undefined, label: spec.label, day: w.day,
    ...(limitOrder ? { mode: 'limit' as const } : {}),
  });
  if (limitOrder) return { status: 'accepted', orderId: id, text: `limit ${spec.side} ${spec.qty} ${spec.label} at ${cents(spec.stop)}: it fills at the market when the price ${above ? 'rises to' : 'falls to'} that, whether or not you are looking.` };
  const how = spec.limit !== undefined ? `, then a limit order at ${cents(spec.limit)}` : ', then a market order';
  return { status: 'accepted', orderId: id, text: `stop ${spec.side} ${spec.qty} ${spec.label}: fires when the price ${above ? 'rises to' : 'falls to'} ${cents(spec.stop)}${how}. It stands in the market whether or not you are looking.` };
}

export function cancelStop(seat: TradeSeat, orderId: number): boolean {
  const at = seat.stops?.findIndex((s) => s.id === orderId) ?? -1;
  if (at < 0 || !seat.stops) return false;
  seat.stops.splice(at, 1);
  return true;
}

/** Cancel an order by id: a resting share order, a stop, or a resting coin order. */
export function cancelAny(w: World, seat: TradeSeat, id: string, orderId: number): string | undefined {
  if (cancelOrder(w, id, orderId)) return 'order';
  if (cancelStop(seat, orderId)) return 'stop';
  if (cancelCoinOrder(w, id, orderId)) return 'coin order';
  return undefined;
}

/** Check each stop against the price and send the ones that were hit. Runs every tick. */
export function runStops(w: World, seat: TradeSeat, id: string, shortFn: (instr: string, qty: number, limit: number | undefined, label: string) => ActResult): void {
  const stops = seat.stops;
  if (!stops || !stops.length) return;
  const cause = causeOf(w, seat);
  for (const s of [...stops]) {
    if (s.kind === 'fut' && s.month !== undefined && s.month < w.month) { stops.splice(stops.indexOf(s), 1); continue; }
    const px = stopPrice(w, s);
    if (!(px > 0)) continue;
    if (s.above ? px < s.stop : px > s.stop) continue;
    stops.splice(stops.indexOf(s), 1);
    let said: string;
    if (s.kind === 'share') {
      const r = s.side === 'short' ? shortFn(s.instr, s.qty, s.limit, s.label) : placeShareOrder(w, seat, id, s.instr, s.side as 'buy' | 'sell', s.qty, s.limit, s.label);
      said = r.status === 'accepted' ? (r.text ?? 'sent') : `could not fill: ${r.why}`;
      if (r.status === 'accepted' && r.avg) sayFill(seat, s.instr, r.avg);
    } else if (s.kind === 'coin') {
      const r = orderCoin(w, id, s.instr, s.side as 'buy' | 'sell', s.qty, s.limit);
      said = r.why ? `could not fill: ${r.why}` : `${s.side === 'buy' ? 'bought' : 'sold'} ${r.filled} ${r.name} for ${cents(r.cents)}`;
      if (!r.why && r.avg) sayFill(seat, s.instr, r.avg);
    } else {
      const months = (s.month ?? w.month) - w.month;
      const r = tradeFuture(w, id, s.instr, months, s.qty, s.side as 'long' | 'short' | 'flat');
      said = r.why ? `could not fill: ${r.why}` : `${s.side} ${r.qty} ${s.label} at ${cents(r.px)}, position ${r.net}`;
      if (!r.why) sayFill(seat, futKey(s.instr, s.month ?? w.month), r.px);
    }
    w.events.emit('player.stop', s.mode === 'limit' ? `your limit order on ${s.label} filled at ${cents(px)} (limit ${cents(s.stop)}): ${said}` : `your stop on ${s.label} fired at ${cents(px)} (stop ${cents(s.stop)}): ${said}`, [cause], id);
  }
}

export function stopRows(seat: TradeSeat): { id: number; book: string; instr: string; side: string; qty: number; limit: number | null; stop: number; mode: 'stop' | 'limit'; month?: number; eventId: number }[] {
  return (seat.stops ?? []).map((s) => ({ id: s.id, book: 'stops', instr: s.kind === 'fut' ? `fut:${s.instr}` : s.instr, side: s.side, qty: s.qty, limit: s.limit ?? null, stop: s.stop, mode: s.mode ?? 'stop', ...(s.kind === 'fut' && s.month !== undefined ? { month: s.month } : {}), eventId: seat.arrived }));
}
