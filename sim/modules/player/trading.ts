// The player's trading desk: market and limit orders that walk the book and say what they filled, short
// selling (borrow, sell, pay the fee, cover, get squeezed or recalled) and stop orders that live in the
// sim and fire on the price whether or not a screen is open.
import type { World } from '../../kernel/index.ts';
import { tradeFuture } from '../commodities/index.ts';
import { cancelCoinOrder, coinPrice, orderCoin } from '../crypto/index.ts';
import { DEP, pay, type EconState } from '../economy/index.ts';
import { bookLevels, borrowShares, cancelOrder, executableTouch, midPrice, nextOrderId, noteLife, returnShares, submitOrder, trade, type Execution } from '../markets/index.ts';
import type { ActResult } from './index.ts';
import { dollars } from './life.ts';
import { futKey, sayFill, type BasisBook } from './basis.ts';
import { tradingDay } from '../markets/noise.ts';
import { dateText } from './gamedate.ts';

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
  /** 'limit' is a standing limit order the desk holds (a future, a memecoin, a short, a bracket's target): it fires when the price comes down to a buy limit or up to a sell limit. 'open' is a market order sent while the exchange was shut: it goes in at the next open. Absent means a stop. */
  mode?: 'stop' | 'limit' | 'open';
  /** It protects a position: it only ever closes it, never opens the other way, and it comes off once the position is closed. */
  protect?: boolean;
  /** One-cancels-other group: when one order of the group fills, the others come off. */
  oco?: number;
  /** A bracket: the stop and target to set once this entry fills (cents). */
  kids?: { stop?: number; target?: number };
}

/** A bracket on an entry that rests in the exchange's book: legs go on for whatever of it fills. */
export interface Bracket { parent: number; instr: string; side: 'buy' | 'short'; qty: number; done: number; stop?: number; target?: number; label: string }

export interface TradeSeat { loans: StockLoan[]; stops?: Stop[]; brackets?: Bracket[]; margin: boolean; arrived: number; basis?: BasisBook }

// ---- one set of session rules for shares, whatever the order type ----
export const OPEN_AT = 570;
export const CLOSE_AT = 960;
export type Session = 'open' | 'pre' | 'after' | 'closed';
/** The exchange session now. A world with no clock (a headless run) trades at every tick. */
export function shareSession(w: World): Session {
  const c = w.state.clock as { min?: number } | undefined;
  if (!c || typeof c.min !== 'number') return 'open';
  if (!tradingDay(w.day)) return 'closed';
  if (c.min < OPEN_AT) return 'pre';
  if (c.min >= CLOSE_AT) return 'after';
  return 'open';
}
/** The next open in words, for an order that waits for it. */
export function nextOpenText(w: World): string {
  const c = w.state.clock as { min?: number } | undefined;
  let d = w.day;
  if (!(tradingDay(d) && typeof c?.min === 'number' && c.min < OPEN_AT)) { d++; while (!tradingDay(d) && d < w.day + 14) d++; }
  return d === w.day ? 'the 09:30 open today' : d === w.day + 1 ? 'the 09:30 open tomorrow' : `the 09:30 open on ${dateText(d)}`;
}
const SESSION_WORD: Record<Session, string> = { open: 'open', pre: 'not open yet', after: 'closed for the day', closed: 'closed today' };

/** The signed position in a share: held less borrowed, so a short is negative. */
export function sharePos(w: World, seat: TradeSeat, id: string, instr: string): number {
  let owed = 0;
  for (const l of seat.loans) if (l.instr === instr) owed += l.qty;
  return Math.floor(w.ledger.balance(id, instr)) - owed;
}

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
  return { status: 'accepted', orderId: ex.restId, fill: ex.filled, cents: Math.round(ex.cents), avg: ex.avg, fills: ex.fills, ref: ex.mid, text };
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
  if (!seat.margin) return rejected('short selling needs a margin account at a bank: open one in Bank & Credit by borrowing against your shares (a margin loan)');
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
  return { status: 'accepted', fill: sold, eventId: cause, cents: Math.round(ex.cents), avg: ex.avg, fills: ex.fills, ref: ex.mid, text };
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
  try {
    const ex = trade(w, id, { instr, side: 'buy', qty: want }, cause);
    filled = ex.filled;
    if (filled > 0) sayFill(seat, instr, ex.avg, { ref: ex.mid, how: 'buyin', why: `${why[0]!.toUpperCase()}${why.slice(1)}.` });
  } catch { filled = 0; }
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
    const touch = executableTouch(w, l.instr, 'buy');
    if (touch.basis !== 'executable') continue;
    const mid = touch.px;
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
    if (mid >= entry * 1.35 || cashOf(w, id) < notional * 1.1) buyIn(w, seat, id, l, 'buy-in at executable depth: the price ran against the short and the lender called it', cause);
  }
}

// ---- stop, standing limit and at-the-open orders, held by the desk ----

function stopPrice(w: World, s: Pick<Stop, 'kind' | 'instr' | 'month'>): number {
  if (s.kind === 'share') return midPrice(w, s.instr);
  if (s.kind === 'coin') return coinPrice(w, s.instr)?.px ?? 0;
  const books = (w.state.commodities as { books?: { good: string; tenors: { month: number; px: number }[] }[] } | undefined)?.books;
  return books?.find((b) => b.good === s.instr)?.tenors.find((t) => t.month === s.month)?.px ?? 0;
}

/** Where a desk-held share order is measured: the executable bid or ask. A mark with no depth does not fire. */
function touchPrice(w: World, s: Stop): number {
  if (s.kind !== 'share') return stopPrice(w, s);
  if (s.mode === 'open') return stopPrice(w, s);
  const sells = s.side === 'sell' || s.side === 'short';
  const touch = executableTouch(w, s.instr, sells ? 'sell' : 'buy');
  return touch.basis === 'executable' ? touch.px : 0;
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
  mode?: 'stop' | 'limit' | 'open';
  protect?: boolean;
  kids?: { stop?: number; target?: number };
}

/** What the desk sees about an order it holds or fires: a fill it could not make, an order that came off. Told to the player. */
export interface DeskNote { title: string; text: string; cause: number }

const sideWord = (side: string): string => side === 'long' ? 'buy' : side;
const cap1 = (t: string): string => t ? t[0]!.toUpperCase() + t.slice(1) : t;

/** Hold a stop, a standing limit, or a market order for the next open. A buy stop sits above the market, a sell stop below it. */
export function placeStop(w: World, seat: TradeSeat, spec: StopSpec, id?: string): ActResult {
  const atOpen = spec.mode === 'open';
  // a memecoin trades at fractions of a cent, so its price may be one; every other market quotes whole cents
  if (!atOpen && (!(spec.stop > 0) || !Number.isFinite(spec.stop) || (spec.kind !== 'coin' && !Number.isSafeInteger(spec.stop)))) return rejected('the stop price must be a positive number');
  const cents = (n: number): string => (spec.kind === 'coin' && n < 100 ? '$' + (n / 100).toFixed(6) : centsOf(n));
  if (spec.limit !== undefined && spec.kind === 'fut') return rejected('a future has no limit price: use a plain stop');
  const px = stopPrice(w, { kind: spec.kind, instr: spec.instr, month: spec.months !== undefined ? w.month + spec.months : undefined });
  if (!(px > 0)) return rejected(`${spec.label} has no price to watch right now`);
  const share = spec.kind === 'share';
  const sess = share ? shareSession(w) : 'open';
  if (share && spec.side === 'short' && !seat.margin) return rejected('short selling needs a margin account at a bank: open one in Bank & Credit by borrowing against your shares (a margin loan)');
  const buying = spec.side === 'buy' || spec.side === 'long';
  const selling = spec.side === 'sell' || spec.side === 'short';
  const limitOrder = spec.mode === 'limit';
  let above: boolean;
  if (atOpen) above = buying;
  else if (limitOrder) {
    // A buy limit waits for the price to come down to it, a sell limit for the price to rise to it.
    if (!buying && !selling) return rejected('a limit order buys or sells');
    above = selling;
    // While the exchange is shut a limit on the wrong side simply fills at the open, at its price or better.
    if (sess === 'open' && !above && spec.stop >= px) return rejected(`a buy limit sits below the market: ${spec.label} is ${cents(px)} now, so a buy at ${cents(spec.stop)} or less would fill at once. Use a market order, or name a lower price`);
    if (sess === 'open' && above && spec.stop <= px) return rejected(`a sell limit sits above the market: ${spec.label} is ${cents(px)} now, so a sale at ${cents(spec.stop)} or more would fill at once. Use a market order, or name a higher price`);
  } else {
    if (buying) above = true;
    else if (selling) above = false;
    else above = spec.stop > px;
    if (above && spec.stop <= px) return rejected(`a buy stop sits above the market: ${spec.label} is ${cents(px)} now and a stop at ${cents(spec.stop)} would fire at once`);
    if (!above && spec.stop >= px) return rejected(`a sell stop sits below the market: ${spec.label} is ${cents(px)} now and a stop at ${cents(spec.stop)} would fire at once`);
  }
  const stops = seat.stops ?? (seat.stops = []);
  if (stops.length >= 40) return rejected('forty orders are standing at the desk: cancel one first');
  // A stop that closes what you hold is a protective stop: it never opens the other way, and it comes off with the position.
  let protect = spec.protect ?? false;
  if (!protect && share && id && !atOpen && !limitOrder && (spec.side === 'sell' || spec.side === 'buy')) {
    const pos = sharePos(w, seat, id, spec.instr);
    protect = spec.side === 'sell' ? pos > 0 : pos < 0;
    // Placed while the entry is still waiting for the open: it is there to close that fill, not to open the other way.
    if (!protect) {
      const opening = (seat.stops ?? []).some((s) => s.instr === spec.instr && s.mode === 'open' && (spec.side === 'buy' ? s.side === 'short' : s.side === 'buy' || s.side === 'long'));
      if (opening) protect = true;
    }
  }
  const oid = nextOrderId(w);
  const kids = spec.kids && (spec.kids.stop || spec.kids.target) ? spec.kids : undefined;
  stops.push({
    id: oid, kind: spec.kind, side: spec.side, instr: spec.instr, qty: spec.qty, stop: atOpen ? 0 : spec.stop, limit: spec.limit,
    above, month: spec.months !== undefined ? w.month + spec.months : undefined, label: spec.label, day: w.day,
    ...(limitOrder ? { mode: 'limit' as const } : atOpen ? { mode: 'open' as const } : {}),
    ...(protect ? { protect: true } : {}),
    ...(kids ? { kids } : {}),
  });
  const shut = share && sess !== 'open' ? ` The exchange is ${SESSION_WORD[sess]}, so nothing fills before ${nextOpenText(w)}.` : '';
  const legs = kids ? ` Once it fills, ${[kids.stop ? `a stop at ${cents(kids.stop)}` : '', kids.target ? `a target at ${cents(kids.target)}` : ''].filter(Boolean).join(' and ')} go${kids.stop && kids.target ? '' : 'es'} on${kids.stop && kids.target ? ', one cancelling the other' : ''}.` : '';
  const guard = protect ? ' It protects your position: it only closes it, and it comes off if the position closes first.' : '';
  if (atOpen) {
    noteLife(w, {
      id: oid, book: 'desk', instr: spec.instr, side: sideWord(spec.side), qty: spec.qty, status: 'queued', type: 'market-at-open',
      reserved: 0, limit: null, next: nextOpenText(w), reason: '', fills: [], rejectedQty: 0, fee: 0,
    });
    return { status: 'accepted', orderId: oid, text: `market-at-open ${sideWord(spec.side)} ${spec.qty} ${spec.label}: queued, no price. Status queued. It goes in at ${nextOpenText(w)}. Cancel it before then if you change your mind.${legs}` };
  }
  if (limitOrder) return { status: 'accepted', orderId: oid, text: `limit ${sideWord(spec.side)} ${spec.qty} ${spec.label} at ${cents(spec.stop)}: it fills at that price or better when the market ${above ? 'rises to' : 'falls to'} it, whether or not you are looking.${shut}${legs}${guard}` };
  const how = spec.limit !== undefined ? `, then a limit order at ${cents(spec.limit)}` : ', then a market order';
  return { status: 'accepted', orderId: oid, text: `stop ${sideWord(spec.side)} ${spec.qty} ${spec.label}: fires when the price ${above ? 'rises to' : 'falls to'} ${cents(spec.stop)}${how}. It stands in the market whether or not you are looking.${shut}${legs}${guard}` };
}

/** Put a bracket's stop and target on a position that just opened: both protect it, and one cancels the other. */
export function attachLegs(w: World, seat: TradeSeat, entry: 'buy' | 'short', instr: string, qty: number, kids: { stop?: number; target?: number }, label: string): number[] {
  if (qty < 1 || !(kids.stop || kids.target)) return [];
  const exit = entry === 'buy' ? 'sell' : 'buy';
  const stops = seat.stops ?? (seat.stops = []);
  const group = nextOrderId(w);
  const ids: number[] = [];
  if (kids.stop) { const id = nextOrderId(w); ids.push(id); stops.push({ id, kind: 'share', side: exit, instr, qty, stop: kids.stop, above: exit === 'buy', label, day: w.day, protect: true, oco: group }); }
  if (kids.target) { const id = nextOrderId(w); ids.push(id); stops.push({ id, kind: 'share', side: exit, instr, qty, stop: kids.target, above: exit === 'sell', label, day: w.day, protect: true, oco: group, mode: 'limit' }); }
  return ids;
}

export function cancelStop(seat: TradeSeat, orderId: number): boolean {
  const at = seat.stops?.findIndex((s) => s.id === orderId) ?? -1;
  if (at < 0 || !seat.stops) return false;
  seat.stops.splice(at, 1);
  return true;
}

/** Cancel an order by id: a resting share order, an order the desk holds, or a resting coin order. */
export function cancelAny(w: World, seat: TradeSeat, id: string, orderId: number): string | undefined {
  if (cancelOrder(w, id, orderId)) { if (seat.brackets) seat.brackets = seat.brackets.filter((b) => b.parent !== orderId); return 'order'; }
  const held = seat.stops?.find((s) => s.id === orderId);
  if (cancelStop(seat, orderId)) return held?.mode === 'limit' ? 'limit order' : held?.mode === 'open' ? 'order for the open' : 'stop';
  if (cancelCoinOrder(w, id, orderId)) return 'coin order';
  return undefined;
}

/** Change the price (and the size) of an order and keep its place in a bracket: a desk order in place, a book order cancelled and sent again. */
export function amendOrder(w: World, seat: TradeSeat, id: string, orderId: number, price: number | undefined, qty: number | undefined): ActResult {
  if (qty !== undefined && (!Number.isSafeInteger(qty) || qty < 1)) return rejected('qty must be a positive integer');
  const s = seat.stops?.find((x) => x.id === orderId);
  if (s) {
    if (price !== undefined && s.mode !== 'open') {
      if (!(price > 0) || !Number.isFinite(price) || (s.kind !== 'coin' && !Number.isSafeInteger(price))) return rejected('the price must be a positive number of cents');
      const px = stopPrice(w, s);
      const shut = s.kind === 'share' && shareSession(w) !== 'open';
      if (s.mode === 'limit') {
        if (!shut && (s.above ? price <= px : price >= px)) return rejected(`a ${s.above ? 'sell' : 'buy'} limit at ${centsOf(price)} would fill at once: ${s.label} is ${centsOf(px)}`);
      } else if (s.above ? price <= px : price >= px) return rejected(`a ${s.above ? 'buy' : 'sell'} stop at ${centsOf(price)} would fire at once: ${s.label} is ${centsOf(px)}`);
      s.stop = price;
    }
    if (qty !== undefined) s.qty = qty;
    return { status: 'accepted', orderId, text: `${s.mode === 'limit' ? 'limit' : s.mode === 'open' ? 'order for the open' : 'stop'} ${sideWord(s.side)} ${s.qty} ${s.label} now ${s.mode === 'open' ? 'at the open' : `at ${centsOf(s.stop)}`}` };
  }
  const o = (w.state.markets as { orders?: { id: number; actor: string; instr: string; side: 'buy' | 'sell'; qty: number; limit: number | null; open: boolean }[] }).orders?.find((x) => x.id === orderId && x.open && x.actor === id);
  if (!o || o.limit === null) return rejected('that order is not open');
  const limit = price ?? o.limit;
  if (!Number.isSafeInteger(limit) || limit < 1) return rejected('a share limit is a whole number of cents');
  const n = qty ?? o.qty;
  const br = seat.brackets?.find((b) => b.parent === orderId);
  cancelOrder(w, id, orderId);
  const cause = causeOf(w, seat);
  let restId: number | undefined;
  if (shareSession(w) === 'open') {
    try {
      const ex = trade(w, id, { instr: o.instr, side: o.side, qty: n, limit }, cause);
      restId = ex.restId;
      settleCovers(w, seat, id, cause);
      if (ex.filled > 0) sayFill(seat, o.instr, ex.avg, { ref: limit, how: 'limit' });
    } catch (e) { return rejected(whyOf(e)); }
  } else restId = submitOrder(w, id, { instr: o.instr, side: o.side, qty: n, limit });
  if (br) { if (restId !== undefined) { br.parent = restId; br.qty = br.done + n; } else seat.brackets = seat.brackets!.filter((b) => b !== br); }
  return { status: 'accepted', orderId: restId, text: `limit ${o.side} ${n} now at ${centsOf(limit)}` };
}

/** Protective orders die with their position: once it is closed they come off, and one larger than the position shrinks to it. */
/** A stop that closes the position you now hold is protective, even if it was placed before the fill. */
function claimProtect(w: World, seat: TradeSeat, id: string): void {
  for (const s of seat.stops ?? []) {
    if (s.protect || s.kind !== 'share' || s.mode === 'open' || s.mode === 'limit') continue;
    const pos = sharePos(w, seat, id, s.instr);
    if ((s.side === 'sell' && pos > 0) || (s.side === 'buy' && pos < 0)) s.protect = true;
  }
}

export function tendProtect(w: World, seat: TradeSeat, id: string, out: DeskNote[]): void {
  const stops = seat.stops;
  if (!stops?.length) return;
  claimProtect(w, seat, id);
  const gone = new Map<string, Stop[]>();
  for (const s of [...stops]) {
    if (!s.protect || s.kind !== 'share') continue;
    const pos = sharePos(w, seat, id, s.instr);
    const want = s.side === 'sell' ? pos : -pos;
    if (want >= 1) { if (s.qty > want) s.qty = want; continue; }
    stops.splice(stops.indexOf(s), 1);
    const list = gone.get(s.instr) ?? [];
    list.push(s);
    gone.set(s.instr, list);
  }
  for (const [, list] of gone) {
    const many = list.length > 1;
    const what = list.map((s) => `${s.mode === 'limit' ? 'target' : 'stop'} ${sideWord(s.side)} ${s.qty} at ${centsOf(s.stop)}`).join(' and your ');
    out.push({ title: `${many ? 'Orders' : 'Order'} on ${list[0]!.label} cancelled`, text: `Your ${what} came off: the position ${many ? 'they' : 'it'} protected is closed, and ${many ? 'they' : 'it'} could only have opened a new one.`, cause: causeOf(w, seat) });
  }
}

/** An entry resting in the book with a bracket: legs go on for whatever has filled since the last look. */
export function tendBrackets(w: World, seat: TradeSeat): void {
  const list = seat.brackets;
  if (!list?.length) return;
  const orders = (w.state.markets as { orders?: { id: number; qty: number; open: boolean }[] }).orders ?? [];
  for (const br of [...list]) {
    const o = orders.find((x) => x.id === br.parent);
    const filled = o ? br.qty - o.qty : br.done;
    if (filled > br.done) { attachLegs(w, seat, br.side, br.instr, filled - br.done, { stop: br.stop, target: br.target }, br.label); br.done = filled; }
    if (!o || !o.open) list.splice(list.indexOf(br), 1);
  }
}

/** Check each order the desk holds against the price and send the ones that were hit. Shares only fire while the exchange is open. */
export function runStops(w: World, seat: TradeSeat, id: string, shortFn: (instr: string, qty: number, limit: number | undefined, label: string) => ActResult, out: DeskNote[] = []): void {
  const stops = seat.stops;
  if (!stops || !stops.length) return;
  const cause = causeOf(w, seat);
  const sess = shareSession(w);
  for (const s of [...stops]) {
    if (!stops.includes(s)) continue;
    if (s.kind === 'fut' && s.month !== undefined && s.month < w.month) { stops.splice(stops.indexOf(s), 1); continue; }
    if (s.kind === 'share' && sess !== 'open') continue;
    // An order for the open fires when the session is open. It does not need a mark, and it has no price of its own.
    const px = s.mode === 'open' ? 1 : touchPrice(w, s);
    if (s.mode !== 'open' && !(px > 0)) continue;
    if (s.mode !== 'open' && (s.above ? px < s.stop : px > s.stop)) continue;
    let qty = s.qty;
    if (s.protect && s.kind === 'share') {
      const pos = sharePos(w, seat, id, s.instr);
      const want = s.side === 'sell' ? pos : -pos;
      if (want < 1) continue; // tendProtect takes it off and says so
      qty = Math.min(qty, want);
    }
    stops.splice(stops.indexOf(s), 1);
    // one cancels the other: the rest of the group comes off as this one goes in
    const others = s.oco !== undefined ? stops.filter((x) => x.oco === s.oco) : [];
    for (const x of others) stops.splice(stops.indexOf(x), 1);
    const offText = others.length ? ` Your ${others.map((x) => `${x.mode === 'limit' ? 'target' : 'stop'} at ${centsOf(x.stop)}`).join(' and ')} came off with it.` : '';
    const how = s.mode === 'open' ? 'open' : s.mode === 'limit' ? (s.protect ? 'target' : 'limit') : 'stop';
    const refPx = s.stop; // an order for the open is measured against the last price before it
    const what = s.mode === 'open' ? `your order for the open on ${s.label}` : s.mode === 'limit' ? `your ${s.protect ? 'target' : 'limit'} on ${s.label} at ${centsOf(s.stop)}` : `your stop on ${s.label} at ${centsOf(s.stop)}`;
    const said = `${cap1(what)} ${s.mode === 'open' ? 'went in' : 'was hit'}.${offText}`;
    let failed = '';
    if (s.kind === 'share') {
      // a desk limit goes in at its own price, so it fills there or better; what the book cannot take waits at the desk
      const lim = s.mode === 'limit' ? s.stop : s.limit;
      const r = s.side === 'short' ? shortFn(s.instr, qty, lim, s.label) : placeShareOrder(w, seat, id, s.instr, s.side as 'buy' | 'sell', qty, lim, s.label);
      const got = r.status === 'accepted' ? (r.fill ?? 0) : 0;
      if (r.status === 'accepted' && r.orderId !== undefined) cancelOrder(w, id, r.orderId);
      if (got > 0 && r.avg) {
        sayFill(seat, s.instr, r.avg, { ref: refPx, how, why: said });
        if (s.kids) attachLegs(w, seat, s.side === 'short' ? 'short' : 'buy', s.instr, got, s.kids, s.label);
      }
      const left = qty - got;
      if (left >= 1 && lim !== undefined) {
        // a limit the book did not reach in full: the rest waits at the desk, with its group
        stops.push({ ...s, qty: left, mode: 'limit', stop: lim });
        for (const x of others) stops.push(x);
        continue;
      }
      if (got < 1) failed = r.status === 'accepted' ? 'nothing was within reach in the book' : r.why ?? 'the book would not take it';
    } else if (s.kind === 'coin') {
      const r = orderCoin(w, id, s.instr, s.side as 'buy' | 'sell', qty, s.limit);
      if (r.why) failed = r.why;
      else if (r.avg) sayFill(seat, s.instr, r.avg, { ref: refPx, how, why: said });
    } else {
      const months = (s.month ?? w.month) - w.month;
      const r = tradeFuture(w, id, s.instr, months, qty, s.side as 'long' | 'short' | 'flat');
      if (r.why) failed = r.why;
      else sayFill(seat, futKey(s.instr, s.month ?? w.month), r.px, { ref: refPx, how, why: said });
    }
    if (failed) out.push({ title: `${s.mode === 'open' ? 'Order for the open' : s.mode === 'limit' ? 'Limit order' : 'Stop'} on ${s.label} did not fill`, text: `${cap1(what)} ${s.mode === 'open' ? 'went in' : `was hit at ${centsOf(px)}`}, but it could not fill: ${failed}.${offText}`, cause });
  }
}

export function stopRows(seat: TradeSeat): { id: number; book: string; instr: string; side: string; qty: number; limit: number | null; stop: number; mode: 'stop' | 'limit' | 'open'; month?: number; protect?: boolean; oco?: number; bracket?: { stop?: number; target?: number }; eventId: number }[] {
  return (seat.stops ?? []).map((s) => ({
    id: s.id, book: 'stops', instr: s.kind === 'fut' ? `fut:${s.instr}` : s.instr, side: s.side, qty: s.qty, limit: s.limit ?? null, stop: s.stop, mode: s.mode ?? 'stop',
    ...(s.kind === 'fut' && s.month !== undefined ? { month: s.month } : {}),
    ...(s.protect ? { protect: true } : {}), ...(s.oco !== undefined ? { oco: s.oco } : {}), ...(s.kids ? { bracket: s.kids } : {}),
    eventId: seat.arrived,
  }));
}
