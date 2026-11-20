// Stock exchange. The shares the economy already issued (eq:frm_* and eq:bank_1) trade for deposits.
// Prices come from a price-time order book, not from a random walk. Funds and households are ledger
// actors; a fill moves shares one way and deposits the other, through pay(). Microstructure noise
// (timing, size) is the only use of w.rng('mkt:...'). Fair values and trade direction are not random.
import { SECTOR_GROWTH } from '../economy/content.ts';
import { BANK, CAPITAL, DEP, pay, type EconState, type Firm } from '../economy/index.ts';
import { GOODS } from '../economy/content.ts';
import { type Module, type World } from '../../kernel/index.ts';
import { isSeatActor } from '../../kernel/seat.ts';
import { fxMark } from '../abroad/index.ts';
import { tradingDay } from './noise.ts';

const SHARES = 1_000_000;
const W_DIV = 0.7;
const W_EARN = 0.3;
const PAYOUT = 0.5;
/** Cents: the highest price a share opens at. Above it the shares are split before trading starts. */
const OPEN_LOW = 700;
const OPEN_HIGH = 26_000;
/** Same share each time for the same name: a stable number between 0 and 1. */
function hashUnit(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return ((h >>> 0) + 0.5) / 4294967296;
}

type Side = 'buy' | 'sell';
type Src = 'player' | 'value' | 'momentum' | 'mm' | 'hh';
type Style = 'value' | 'momentum' | 'mm';

interface Order {
  id: number;
  actor: string;
  instr: string;
  side: Side;
  qty: number;
  limit: number | null;
  seq: number;
  open: boolean;
  skip: boolean;
  src: Src;
}

interface Bar { o: number; h: number; l: number; c: number; v: number }

interface Stock {
  instr: string;
  issuer: string;
  last: number;
  prev: number;
  open: number;
  high: number;
  low: number;
  vol: number;
  traded: boolean;
  wide: boolean;
  hist: Bar[];
  rets: number[];
  moveEv?: number;
  divEma: number;
  profitEma: number;
  seenProfit: number;
  seenDiv: number;
  targetInv: number;
  /** Day through which a report may reprice this name in one move. */
  printUntil?: number;
  /** Day through which a beat still trades above the earnings value. */
  chaseUntil?: number;
  /** The earnings report that opened the window. */
  printEv?: number;
  /** +1 a beat, -1 a miss, 0 nothing to chase. */
  printDir?: number;
  /** Shares lender-forced sales dumped on the book lately, in days of volume. It decays and the price recovers. */
  forced?: number;
  /** Fraction the quote sits off the sim price because a player's own orders walked the book. It decays within the day. */
  imp?: number;
  /** Capitalisation at the last total-return point, so the index follows the same names month to month. */
  trPrev?: number;
  /** Order-flow sentiment: the fraction the crowd has marked the price above (or below) what the earnings support. It reverts by itself. */
  sent?: number;
  /** Where that sentiment is going today: the move the day's order flow completes by the last tick. */
  sentNext?: number;
  /** Sentiment as of the tick that just ran. */
  sentNow?: number;
  /** Day of the last news or report that hit this name; the next session's flow is much heavier. */
  newsAt?: number;
  /** The price the last tick settled on, and a count of ticks, so the minute layer knows when the market moved. */
  tgt?: number;
  tgtSeq?: number;
  /** Day the closing mark was set by the last tick. */
  closedOn?: number;
  /** The last layoff event of the issuer this name has priced, and the staff it had then. */
  layoffSeen?: number;
  staffSeen?: number;
  /** News weights already applied today, so a second story does not price the same cut again. */
  newsDay?: number;
  newsW?: number;
  /** Causes already priced, so a roundup a few days later does not gap the name a second time. */
  priced?: number[];
  /** What a rate move does to the bank's margin, on top of the discount rate. A hike lifts it. */
  nim?: number;
  /** A one-session print: the open (or the decision's candles) may reach this price, then the collar resumes. */
  newsPx?: number;
  newsUntil?: number;
}

interface Fund { id: string; style: Style; premium: number }

interface MktState {
  stocks: Stock[];
  funds: Fund[];
  orders: Order[];
  nextId: number;
  seq: number;
  index: number;
  tr: number;
  /** Capitalisation at the previous total-return point, so the index includes the price move. */
  trCap: number;
  baseCap: number;
  yTurn: number;
  root: number;
  playerLive: boolean;
  /** The growth buyers capitalise: the inflation target at first, then what listed earnings actually delivered. */
  gHat?: number;
  /** Listed profit summed over each of the last 24 months. */
  profRing?: number[];
  fadeDay: number;
  fadeIds: number[];
  /** The central bank decision the market has priced. */
  rateSeen?: number;
  price: (instr: string) => number;
}

export interface OrderRequest { instr: string; side: Side; qty: number; limit?: number }

const econ = (w: World): EconState => w.state.economy as EconState;
const book = (w: World): MktState => w.state.markets as MktState;

function cash(w: World, actor: string): number { return w.ledger.balance(actor, DEP); }

// Open orders by actor, instrument and source, so a quote refresh does not scan the whole book.
const byActor = new Map<string, Map<string, Map<Src, Order[]>>>();
const bookLists = new Map<string, Order[]>();
function ordersFor(actor: string, instr: string, src: Src, create: boolean): Order[] | undefined {
  let byInstr = byActor.get(actor);
  if (!byInstr) {
    if (!create) return undefined;
    byInstr = new Map();
    byActor.set(actor, byInstr);
  }
  let bySrc = byInstr.get(instr);
  if (!bySrc) {
    if (!create) return undefined;
    bySrc = new Map();
    byInstr.set(instr, bySrc);
  }
  let list = bySrc.get(src);
  if (!list) {
    if (!create) return undefined;
    list = [];
    bySrc.set(src, list);
  }
  return list;
}
function indexOrder(o: Order): void {
  ordersFor(o.actor, o.instr, o.src, true)!.push(o);
}
function resetOrderIndex(): void {
  byActor.clear();
  for (const list of bookLists.values()) list.length = 0;
}
function compactOrders(m: MktState): void {
  if (m.orders.length <= 500) return;
  const a = m.orders;
  let w = 0;
  for (let i = 0; i < a.length; i++) if (a[i].open) a[w++] = a[i];
  a.length = w;
  byActor.clear();
  for (let i = 0; i < w; i++) indexOrder(a[i]);
}
function sharesOut(w: World, instr: string): number { return w.ledger.issued.get(instr) ?? SHARES; }

const BLOCK_SHARE = 0.01;
/** A holding of less than this share of the company is marked at the quote's mid price. A bigger block is the market itself and gets the haircut below. */
const MARK_BLOCK = 0.05;
const FORCED_IMPACT = 0.02; // price discount per day of volume dumped by forced sellers
const FORCED_CAP = 0.35;
const FORCED_DECAY = 0.94;  // per day: the half-life is about eleven days
/** A founder already holds about 40%. Fading that stake pulls every family firm and the city with it. */
const FADE_SHARE = 0.5;

function advOf(st: Stock): number {
  const h = st.hist;
  const n = Math.min(20, h.length);
  if (n < 1) return Math.max(1, st.vol);
  let s = 0;
  for (let i = h.length - n; i < h.length; i++) s += h[i].v;
  return Math.max(1, s / n);
}

/** A stake big enough that the holder is the market: the last print is their own. */
function corner(qty: number, out: number): boolean {
  return out > 0 && qty > out * BLOCK_SHARE;
}

function bidLevels(w: World, instr: string, skip: string): { qty: number; limit: number }[] {
  const out: { qty: number; limit: number }[] = [];
  const orders = book(w).orders;
  for (let i = 0; i < orders.length; i++) {
    const o = orders[i];
    if (!o.open || o.skip || o.instr !== instr || o.side !== 'buy' || o.qty < 1 || o.limit === null || o.actor === skip) continue;
    const afford = Math.floor(cash(w, o.actor) / o.limit);
    const q = Math.min(o.qty, afford);
    if (q >= 1) out.push({ qty: q, limit: o.limit });
  }
  out.sort((a, b) => b.limit - a.limit);
  return out;
}

/** Cents a sale of `qty` would raise by walking the bids: those resting in the book and the dealers' standing ladder. Shares beyond the depth fetch nothing. */
export function saleProceeds(w: World, instr: string, qty: number, skipActor: string): number {
  if (qty < 1) return 0;
  const st = book(w).stocks.find((x) => x.instr === instr);
  const levels = bidLevels(w, instr, skipActor);
  if (st) for (const l of ladder(w, st, 'sell')) levels.push({ qty: l.qty, limit: l.px });
  levels.sort((x, y) => y.limit - x.limit);
  let left = qty, got = 0;
  for (const l of levels) {
    if (left < 1) break;
    const q = Math.min(left, l.qty);
    got += q * l.limit;
    left -= q;
  }
  return got;
}

/** What the holder's whole listed book would fetch if it were sold into the bids now. */
export function saleValue(w: World, actor: string): number {
  let n = 0;
  for (const st of book(w).stocks) {
    const qty = Math.floor(w.ledger.balance(actor, st.instr));
    if (qty > 0) n += saleProceeds(w, st.instr, qty, actor);
  }
  return n;
}

/**
 * Collateral a margin lender will count. The loan is against the book's bids, and the
 * fraction lent falls as the block grows against recent daily volume. A liquid handful
 * still borrows about half of what the bid would pay.
 */
export function pledgeValue(w: World, actor: string): number {
  let col = 0;
  for (const st of book(w).stocks) {
    const qty = Math.floor(w.ledger.balance(actor, st.instr));
    if (qty < 1) continue;
    const days = qty / advOf(st);
    const ltv = 0.5 / (1 + Math.max(0, days - 1));
    col += Math.floor(saleProceeds(w, st.instr, qty, actor) * ltv);
  }
  return col;
}

function bestBid(w: World, instr: string, skip: string): number {
  let px = 0;
  for (const b of bidLevels(w, instr, skip)) if (b.limit > px) px = b.limit;
  return px;
}

/**
 * Price per share for marking a holding. A small lot is the last trade. A large block is
 * worth the worse of the last trade and what the shares earn, less a haircut that grows
 * with how many days of volume the block is. A print nobody is bidding is not a mark.
 * Returns -1 when `instr` is not a listed stock.
 */
export function markHolding(w: World, actor: string, instr: string, qty: number): number {
  const st = book(w).stocks.find((s) => s.instr === instr);
  if (!st) return -1;
  if (qty < 1 || qty < sharesOut(w, instr) * MARK_BLOCK) return quoteMid(st);
  const fair = Math.max(1, fairValue(w, st, 0.04));
  const bid = bestBid(w, instr, actor);
  const days = qty / advOf(st);
  const out = sharesOut(w, instr);
  const frac = out > 0 ? qty / out : 0;
  const dayCut = Math.min(0.5, Math.max(0, days - 5) * 0.012);
  const sizeCut = Math.min(0.5, Math.max(0, (frac - BLOCK_SHARE) * 12));
  const haircut = Math.max(dayCut, sizeCut);
  // The displayed bid is only the top of the book. Past it, a large sale clears toward
  // what the firm earns, not toward the last print the block itself set.
  const ceiling = Math.min(st.last, Math.round(fair * 1.15), bid > 0 ? Math.max(bid, Math.round(fair)) : Math.round(fair));
  const marked = ceiling * (1 - haircut);
  // A corner the lender already marks at a deep haircut. A smaller block that the book
  // will not take is not worth the last print either: use the bid, or a quarter of the
  // haircut price when nobody is bidding.
  if (frac >= 0.5) return Math.max(1, Math.round(marked));
  const per = saleProceeds(w, instr, qty, actor) / Math.max(1, qty);
  const liquid = per > 0 ? (per + marked) / 2 : marked * 0.1;
  return Math.max(1, Math.round(Math.min(marked, liquid)));
}

/** What one share of a block of `qty` would fetch. Paper bids pay this, not a last trade the bidder walked up. */
export function blockPrice(w: World, instr: string, qty: number): number {
  const px = markHolding(w, '', instr, qty);
  return px > 0 ? px : 0;
}

// ---- standing depth ----
// Dealers and the city's investors stand behind every listed share. The book a buyer meets is a ladder
// of asks over the mid price and a ladder of bids under it. Its width and size come from the firm: a
// small firm has a wide, thin book, a big one a tight, deep one, and a busy name more than a quiet one.
// The shares and the cash are real: a fill moves them from and to the dealer and the investors who hold
// them, through the ledger, and a ladder level the holders cannot cover is not there.

/** Each level sits this many half-spreads from the mid. */
const LADDER_OFF = [1, 1.6, 3.4, 6.4, 10.6, 16];
/** Each level offers this share of the company's shares, before the size and volume factors. */
const LADDER_FRAC = [0.005, 0.0075, 0.01, 0.0125, 0.015, 0.02];
/** Part of a walk through the book that stays in the quote. Under one, so a round trip always costs the spread. */
const IMPACT_KEEP = 0.35;
const IMPACT_MAX = 0.2;
/** What each holder will lend out of the book, by kind. */
const SELL_SHARE = 0.3;
const MM_SELL_SHARE = 0.8;
const BUY_SHARE = 0.06;

export interface Fill { px: number; qty: number }
export interface Execution {
  side: Side;
  asked: number;
  filled: number;
  /** Cents paid, or raised. */
  cents: number;
  /** Average price per share, in cents. 0 when nothing filled. */
  avg: number;
  /** Mid price before the order, in cents. */
  mid: number;
  fills: Fill[];
  /** Id of what is left resting when a limit order did not fill whole. */
  restId?: number;
  why?: string;
}
interface Level { px: number; qty: number }

/** The price the quote is centred on: the sim price, nudged by what the player's own orders did to it. */
function quoteMid(st: Stock): number {
  return Math.max(1, Math.round(st.last * (1 + (st.imp ?? 0))));
}

/** Mid price of a listed share in cents, or 0. */
export function midPrice(w: World, instr: string): number {
  const st = book(w)?.stocks.find((x) => x.instr === instr);
  return st ? quoteMid(st) : 0;
}

function halfSpread(w: World, st: Stock): number {
  const capD = Math.max(1, st.last * sharesOut(w, st.instr) / 100);
  return 0.0015 + 0.006 / (1 + capD / 4e6) + Math.min(0.01, volOf(st) * 0.25);
}

function sizeFactor(w: World, st: Stock): number {
  const capD = Math.max(1, st.last * sharesOut(w, st.instr) / 100);
  const out = sharesOut(w, st.instr);
  const size = Math.max(0.6, Math.min(1.5, 0.6 + 0.35 * Math.log10(Math.max(1, capD / 1e6))));
  const busy = 1 + 0.5 * Math.min(1, advOf(st) / Math.max(1, out * 0.01));
  return size * busy;
}

/** What a buyer meets (side 'buy': asks, rising) or a seller meets (side 'sell': bids, falling). */
function ladder(w: World, st: Stock, side: Side): Level[] {
  const mid = quoteMid(st);
  const h = halfSpread(w, st);
  const out = sharesOut(w, st.instr);
  const lf = sizeFactor(w, st);
  const levels: Level[] = [];
  let prev = side === 'buy' ? mid : mid + 1;
  for (let k = 0; k < LADDER_OFF.length; k++) {
    const off = h * LADDER_OFF[k];
    let px = side === 'buy' ? Math.round(mid * (1 + off)) : Math.round(mid * (1 - off));
    if (side === 'buy') px = Math.max(prev + 1, px);
    else px = Math.min(prev - 1, px);
    if (px < 1) break;
    const qty = Math.floor(out * LADDER_FRAC[k] * lf);
    if (qty >= 1) levels.push({ px, qty });
    prev = px;
  }
  return levels;
}

interface Maker { id: string; left: number }

function sellers(w: World, st: Stock, skip: string): Maker[] {
  const out: Maker[] = [];
  const L = w.ledger;
  for (const [slot, n] of L.holdersS(st.instr)) {
    const id = L.ids[slot];
    if (!id || id === skip) continue;
    const mm = id === 'fund_mm';
    if (!mm && !id.startsWith('fund_') && !id.startsWith('p_')) continue;
    if (id.startsWith('p_') && isSeatActor(w, id)) continue;
    const left = Math.floor(n * (mm ? MM_SELL_SHARE : SELL_SHARE));
    if (left >= 1) out.push({ id, left });
  }
  out.sort((a, b) => (b.id === 'fund_mm' ? 1 : 0) - (a.id === 'fund_mm' ? 1 : 0) || b.left - a.left || (a.id < b.id ? -1 : 1));
  return out;
}

function buyers(w: World, skip: string): Maker[] {
  const out: Maker[] = [];
  const ids = book(w).funds.map((f) => f.id);
  for (const h of econ(w).investors) ids.push(h.id);
  for (const id of ids) {
    if (id === skip || (id.startsWith('p_') && isSeatActor(w, id))) continue;
    const c = Math.floor(cash(w, id) * (id === 'fund_mm' ? 0.2 : BUY_SHARE));
    if (c >= 1) out.push({ id, left: c });
  }
  out.sort((a, b) => b.left - a.left || (a.id < b.id ? -1 : 1));
  return out;
}

/**
 * Walk the ladder for `actor`. A buy meets the asks at or under `limit`, a sale the bids at or over it.
 * Returns what filled; nothing rests here.
 */
function walkLadder(w: World, actor: string, st: Stock, side: Side, qty: number, limit: number | null, cause: number): Execution {
  const m = book(w);
  const mid = quoteMid(st);
  const ex: Execution = { side, asked: qty, filled: 0, cents: 0, avg: 0, mid, fills: [] };
  const levels = ladder(w, st, side);
  const makers = side === 'buy' ? sellers(w, st, actor) : buyers(w, actor);
  let left = qty;
  let top = 0;
  for (const lv of levels) {
    if (left < 1) break;
    if (limit !== null && (side === 'buy' ? lv.px > limit : lv.px < limit)) break;
    const target = Math.min(left, lv.qty);
    let want = target;
    let got = 0;
    for (const mk of makers) {
      if (want < 1) break;
      if (mk.left < 1) continue;
      let q: number;
      if (side === 'buy') {
        const afford = Math.floor(cash(w, actor) / lv.px);
        q = Math.min(want, mk.left, Math.floor(w.ledger.balance(mk.id, st.instr)), afford);
        if (afford < 1) break;
        if (q < 1) continue;
        if (!pay(w, actor, mk.id, q * lv.px, 'mkt.trade', cause)) break;
        if (!w.ledger.move(st.instr, mk.id, actor, q, 'mkt.trade', cause)) throw new Error(`share delivery failed on ${st.instr}`);
        mk.left -= q;
      } else {
        const held = Math.floor(w.ledger.balance(actor, st.instr));
        if (held < 1) break;
        q = Math.min(want, held, Math.floor(mk.left / lv.px));
        if (q < 1) continue;
        if (!pay(w, mk.id, actor, q * lv.px, 'mkt.trade', cause)) continue;
        if (!w.ledger.move(st.instr, actor, mk.id, q, 'mkt.trade', cause)) throw new Error(`share delivery failed on ${st.instr}`);
        mk.left -= q * lv.px;
      }
      want -= q;
      got += q;
    }
    if (got > 0) {
      ex.fills.push({ px: lv.px, qty: got });
      ex.filled += got;
      ex.cents += got * lv.px;
      left -= got;
      top = lv.px;
    }
    if (got < target) break; // the holders at this level ran dry, or the actor did
  }
  if (ex.filled > 0) {
    ex.avg = ex.cents / ex.filled;
    st.vol += ex.filled;
    if (top > st.high) st.high = top;
    if (top < st.low || st.low <= 0) st.low = top;
    m.yTurn += ex.cents;
    // The quote follows part of the walk. A buyer who lifted the book leaves the next ask higher.
    const move = mid > 0 ? top / mid - 1 : 0;
    st.imp = Math.max(-IMPACT_MAX, Math.min(IMPACT_MAX, (st.imp ?? 0) + IMPACT_KEEP * move));
  }
  return ex;
}

/**
 * Trade now. A market order (no limit) walks the book and what it cannot fill is dropped. A limit order
 * fills what is marketable and the rest rests until the price comes, or the order is cancelled.
 */
export function trade(w: World, actor: string, req: OrderRequest, cause: number): Execution {
  const st = book(w).stocks.find((x) => x.instr === req.instr);
  if (!st) throw new Error(`not listed ${req.instr}`);
  if (!w.ledger.actors.has(actor)) throw new Error(`unknown actor ${actor}`);
  if (req.side !== 'buy' && req.side !== 'sell') throw new Error('side must be buy or sell');
  if (!Number.isSafeInteger(req.qty) || req.qty <= 0) throw new Error('qty must be a positive integer');
  if (req.limit !== undefined && (!Number.isSafeInteger(req.limit) || req.limit <= 0)) throw new Error('limit must be a positive integer price in cents');
  const limit = req.limit ?? null;
  const ex = walkLadder(w, actor, st, req.side, req.qty, limit, cause);
  const left = req.qty - ex.filled;
  if (limit !== null && left > 0) ex.restId = place(w, actor, req.instr, req.side, left, limit, 'player');
  return ex;
}

/** A resting limit order that the ladder now meets fills against it. Runs each tick, for the player's orders only. */
function sweepSeatOrders(w: World): void {
  const m = book(w);
  if (!m.playerLive) return;
  for (let i = 0; i < m.orders.length; i++) {
    const o = m.orders[i];
    if (!o.open || o.limit === null || o.src !== 'player' || !isSeatActor(w, o.actor)) continue;
    const st = m.stocks.find((x) => x.instr === o.instr);
    if (!st) continue;
    const lv = ladder(w, st, o.side);
    if (!lv.length) continue;
    const marketable = o.side === 'buy' ? lv[0].px <= o.limit : lv[0].px >= o.limit;
    if (!marketable) continue;
    const ex = walkLadder(w, o.actor, st, o.side, o.qty, o.limit, m.root);
    o.qty -= ex.filled;
    if (o.qty < 1) o.open = false;
  }
}

/** Let the player's impact on the quote fade. */
function fadeImpact(w: World, keep: number): void {
  for (const st of book(w).stocks) {
    if (st.imp) { st.imp *= keep; if (Math.abs(st.imp) < 0.0002) st.imp = 0; }
  }
}

/** The standing book for one share: resting limit orders and the dealers' ladder, collapsed to price levels, best first, crossed levels netted. */
export function bookLevels(w: World, instr: string, depth = 8): { bids: { px: number; qty: number }[]; asks: { px: number; qty: number }[] } {
  const m = book(w);
  const st = m.stocks.find((x) => x.instr === instr);
  const bid = new Map<number, number>(), ask = new Map<number, number>();
  for (const o of m.orders) {
    if (!o.open || o.skip || o.limit === null || o.qty < 1 || o.instr !== instr) continue;
    const side = o.side === 'buy' ? bid : ask;
    side.set(o.limit, (side.get(o.limit) ?? 0) + o.qty);
  }
  if (st) {
    for (const l of ladder(w, st, 'sell')) bid.set(l.px, (bid.get(l.px) ?? 0) + l.qty);
    for (const l of ladder(w, st, 'buy')) ask.set(l.px, (ask.get(l.px) ?? 0) + l.qty);
  }
  const bids = [...bid.entries()].sort((a, b) => b[0] - a[0]).map(([px, qty]) => ({ px, qty }));
  const asks = [...ask.entries()].sort((a, b) => a[0] - b[0]).map(([px, qty]) => ({ px, qty }));
  while (bids.length && asks.length && bids[0].px >= asks[0].px) {
    const n = Math.min(bids[0].qty, asks[0].qty);
    bids[0].qty -= n; asks[0].qty -= n;
    if (bids[0].qty <= 0) bids.shift();
    if (asks.length && asks[0].qty <= 0) asks.shift();
  }
  return { bids: bids.slice(0, depth), asks: asks.slice(0, depth) };
}

/** Hit the resting bids. Cash and shares move through the ledger. Returns shares sold. */
export function sellToBook(w: World, actor: string, instr: string, qty: number, cause: number, forced = false): number {
  const st = book(w).stocks.find((s) => s.instr === instr);
  if (!st || qty < 1) return 0;
  if (forced) st.forced = (st.forced ?? 0) + Math.min(qty, Math.floor(w.ledger.balance(actor, instr))) / advOf(st);
  const m = book(w);
  const orders = m.orders.filter((o) => o.open && !o.skip && o.instr === instr && o.side === 'buy' && o.qty >= 1 && o.limit !== null && o.actor !== actor);
  orders.sort((a, b) => (b.limit ?? 0) - (a.limit ?? 0) || a.seq - b.seq);
  let left = Math.min(qty, Math.floor(w.ledger.balance(actor, instr)));
  let sold = 0;
  for (const o of orders) {
    if (left < 1 || o.limit === null) break;
    const afford = Math.floor(cash(w, o.actor) / o.limit);
    const q = Math.min(left, o.qty, afford, Math.floor(w.ledger.balance(actor, instr)));
    if (q < 1) continue;
    if (!pay(w, o.actor, actor, q * o.limit, 'mkt.trade', cause)) continue;
    if (!w.ledger.move(instr, actor, o.actor, q, 'mkt.trade', cause)) throw new Error(`share delivery failed on ${instr}`);
    o.qty -= q;
    if (o.qty < 1) o.open = false;
    note(st, o.limit, q);
    m.yTurn += q * o.limit;
    sold += q;
    left -= q;
  }
  if (left >= 1) sold += walkLadder(w, actor, st, 'sell', left, null, cause).filled;
  return sold;
}

function goodPrice(s: EconState, good: string): number {
  let n = 0, p = 0;
  for (const f of s.firms) if (f.good === good && !f.closed) { p += f.price; n++; }
  return n ? p / n : 0;
}

/** Mark goods at the producing firms' prices. Claims and money are already at face inside netWorth.
 *  `shares`, when passed, also marks listed stakes the firm holds, so a cash bid is not hidden inside the book. */
function bookEquity(w: World, actor: string, shares?: (instr: string) => number): number {
  const s = econ(w);
  // Installed machinery is worth what it costs to replace (the price corporate pays per unit in buyMachines);
  // left at zero, every firm financed by a plant loan opens with negative equity and a one-cent share.
  const f = s.firms.find((x) => x.id === actor);
  const def = f ? GOODS[f.good] : undefined;
  const capPx = def ? 360 * s.wage / Math.max(0.01, def.prod) : 0;
  const own = 'eq:' + actor;
  return Math.round(w.ledger.netWorth(actor, (instr) => {
    if (instr.startsWith('good:')) return goodPrice(s, instr.slice(5));
    if (instr === CAPITAL) return capPx;
    if (shares && instr.startsWith('eq:') && instr !== own) {
      const px = shares(instr);
      return px > 0 ? px : 0;
    }
    return 0;
  }));
}

/** Listed shares this issuer holds, at the last print. Not its own stock. */
const stockIndex = new WeakMap<World, { n: number; by: Map<string, Stock> }>();
function stakeValue(w: World, issuer: string, skipOwn = true): number {
  const held = w.ledger.heldInstrs(issuer);
  if (!held) return 0;
  const stocks = book(w).stocks;
  let ix = stockIndex.get(w);
  if (!ix || ix.n !== stocks.length) { ix = { n: stocks.length, by: new Map(stocks.map((x) => [x.instr, x])) }; stockIndex.set(w, ix); }
  let v = 0;
  const mine = 'eq:' + issuer;
  for (const instr of held) {
    // Only shares are listed stocks; skip goods and loans without a map lookup.
    if (instr.charCodeAt(0) !== 101 || instr.charCodeAt(2) !== 58) continue;
    if (skipOwn && instr === mine) continue;
    const st = ix.by.get(instr);
    if (!st || !(st.last > 0)) continue;
    const q = Math.floor(w.ledger.balance(issuer, instr));
    if (q > 0) v += q * st.last;
  }
  return v;
}

function discount(policy: number, premium: number): number { return Math.max(0.04, policy + premium); }

const MEAN_GROWTH = (() => { const v = Object.values(SECTOR_GROWTH); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; })();
/**
 * What buyers expect earnings to grow. They start with the inflation target and then learn from the record:
 * assuming the content files' productivity rate on top of inflation overpaid for growth the listed firms never
 * delivered, so the index earned less than the discount rate that priced it.
 */
function growthBelief(s: EconState, g?: number): number { return g ?? (s.inflTarget ?? 0.02); }
/** Discount rate less expected growth, never under 3.5%: the divisor for a growing stream of earnings. */
function capRate(s: EconState, policy: number, premium: number, g?: number): number { return Math.max(0.035, discount(policy, premium) - growthBelief(s, g)); }

function annualCash(divEma: number, profitEma: number): number {
  const div = Math.max(0, divEma);
  const earn = Math.max(0, profitEma);
  // A cash sweep is not earnings power. Capitalising it made a one-time payout look like a higher
  // multiple, and the value rule bought whatever had not swept. Earnings set the price once reported.
  const base = earn > 0 ? earn : div;
  return 12 * (W_DIV * base + W_EARN * PAYOUT * earn);
}

/** Discounted dividends. Profits stand in when the firm is retaining cash. The equity premium differs by fund. */
function fairValue(w: World, st: Stock, premium: number): number {
  const s = econ(w);
  const r = discount(s.policyRate, premium);
  const rg = capRate(s, s.policyRate, premium, book(w).gHat);
  const sh = sharesOut(w, st.instr);
  if (st.issuer === BANK) {
    const per = Math.max(1, Math.round(bookEquity(w, st.issuer) / sh));
    const bookPx = Math.max(1, Math.round(per * (0.03 + premium) / r));
    // Book ignores a reported profit, so the bank's P/E sat below every firm and the
    // value rule held it for free. Once a profit is public, price that profit too.
    let px = bookPx;
    if (st.profitEma > 0) {
      const earnPx = Math.max(1, Math.round(annualCash(st.divEma, st.profitEma) / r / sh));
      px = Math.max(bookPx, earnPx);
    }
    // A higher policy rate is a wider margin for the bank, not only a higher discount.
    return Math.max(1, Math.round(px * (1 + (st.nim ?? 0))));
  }
  // A paper bid leaves the target inside the buyer. Earnings alone would walk that value back out.
  const hold = stakeValue(w, st.issuer);
  return Math.max(1, Math.round(annualCash(st.divEma, st.profitEma) / rg / sh + hold / sh));
}

function blend(ema: number, obs: number): number {
  // Half the gap each month. A single month cannot more than double the anchor,
  // so a one-off cash sweep does not become the firm's value overnight.
  const gap = obs - ema;
  const cap = Math.abs(ema) + 1;
  const step = Math.max(-cap, Math.min(cap, gap * 0.5));
  return ema + step;
}

function firmOf(s: EconState, issuer: string): Firm | undefined {
  for (const f of s.firms) if (f.id === issuer) return f;
  return undefined;
}

/** Shock window: the disruption is on, plus the days the book spends repricing the hikes it caused. */
function shockLinked(w: World): boolean {
  const s = econ(w);
  return s.shockEv !== undefined && w.day < s.shockUntil + 45;
}

function updateEmas(w: World): void {
  const s = econ(w);
  for (const st of book(w).stocks) {
    const f = firmOf(s, st.issuer);
    if (!f || (f.lastProfit === st.seenProfit && f.lastDividend === st.seenDiv)) continue;
    // The quarterly report sets the earnings anchor. A monthly blend moved the price on noise the
    // published EPS does not include, and a stale P/E then picked the names that had a weak month.
    // A firm paying down a charter loan pays no dividend. That is a delay, not a cut:
    // folding the zero into the estimate marks a sound firm at a cent and the cash, when it
    // finally comes, is an unpriced yield.
    const loan = w.ledger.issued.get('loan:' + f.id) ?? 0;
    const payingDown = loan > Math.max(1, f.lastProfit) * 6 && f.lastDividend <= 0 && f.lastProfit > 0;
    if (!payingDown) st.divEma = blend(st.divEma, f.lastDividend);
    st.seenProfit = f.lastProfit;
    st.seenDiv = f.lastDividend;
  }
}

function markWide(w: World): void {
  for (const st of book(w).stocks) {
    const gap = Math.abs(fairValue(w, st, 0.04) / st.last - 1);
    st.wide = shockLinked(w) && gap > 0.08;
  }
}

function lookback(st: Stock): number {
  let look = 0;
  const from = Math.max(0, st.rets.length - 5);
  for (let i = from; i < st.rets.length; i++) look += st.rets[i];
  return look;
}

/**
 * Where the quote should sit. On a report the destination is the new earnings value.
 * A beat is chased through that value for a few weeks. The premium then comes out,
 * which is the loss for anyone who bought the beat and held it.
 */
function destination(w: World, st: Stock): number {
  // News and a rate decision print their own price for the session. The collar then resumes, so a name
  // that was already far from fair does not gap the whole distance, and the news is not a fixed step a day.
  if (st.newsPx && (st.newsUntil ?? 0) >= w.day) return st.newsPx;
  // Lenders dumping collateral push the price below what the news justifies. The pressure decays
  // a few percent a day and the price walks back, which is the rebound a patient cash buyer collects.
  const squeeze = Math.min(FORCED_CAP, FORCED_IMPACT * (st.forced ?? 0));
  // The crowd's mood sits on top of what the earnings support. It is order flow, and it reverts.
  const mood = 1 + (st.sentNow ?? 0);
  const fair = Math.max(1, Math.round(fairValue(w, st, 0.04) * (1 - squeeze) * mood));
  if ((st.chaseUntil ?? 0) < w.day || (st.printDir ?? 0) <= 0) return fair;
  return Math.max(fair + 1, Math.round(fair * 1.04));
}

/** Cents the print may travel today. A report can close the gap; an ordinary day cannot. */
function collar(w: World, st: Stock, to?: number): { hi: number; lo: number } {
  const prev = Math.max(1, st.prev || st.last);
  const dest = to ?? destination(w, st);
  const printing = (st.printUntil ?? 0) >= w.day;
  if (printing) return { hi: Math.max(prev, dest), lo: Math.max(1, Math.min(prev, dest)) };
  const gap = Math.abs(dest - prev);
  // A price stuck at a cent never clears a 2% band. A large fundamental gap moves
  // in cents, half of it a day, so it cannot sit there for months.
  // How far the crowd lets it go today varies from day to day, so a long repricing is never a staircase of equal steps.
  const j = 0.6 + 0.7 * hashUnit(st.instr + ':' + w.day);
  if (gap > prev * 0.4) {
    const step = Math.max(1, Math.round(gap * 0.5 * j));
    return { hi: prev + step, lo: Math.max(1, prev - step) };
  }
  const wide = st.wide || gap > prev * 0.08;
  const step = wide
    ? Math.max(1, Math.min(gap, Math.round(Math.max(prev, dest) * (st.wide ? 0.1 : 0.08) * j)))
    : Math.max(1, Math.round(prev * 0.06));
  return { hi: prev + step, lo: Math.max(1, prev - step) };
}

/**
 * The quarterly number is public. The earnings anchor moves to it now, not over
 * the following months, and the book's quote is allowed to print that price.
 */
export function repriceOnReport(w: World, issuer: string, monthly: number, cause: number): void {
  const st = book(w).stocks.find((s) => s.issuer === issuer);
  if (!st || !Number.isFinite(monthly)) return;
  const prev = st.profitEma;
  // A loss does not cut the anchor. The value rule keeps its last positive EPS
  // and would treat the cut as a cheap stock. A profit below half the last
  // anchor cuts it in half rather than marking a live firm at a cent: that
  // cent became a jump when the next profit arrived, and a bid at 1.3 times
  // the cheapest name collected it. Anything above half replaces the anchor now.
  if (!(prev > 0)) st.profitEma = monthly > 0 ? monthly : 0;
  else if (!(monthly > 0)) st.profitEma = prev;
  else if (monthly > prev * 0.5) st.profitEma = monthly;
  else st.profitEma = prev * 0.5;
  const f = firmOf(econ(w), st.issuer);
  if (f) { st.seenProfit = f.lastProfit; st.seenDiv = f.lastDividend; }
  st.printUntil = w.day + 6;
  st.newsAt = w.day;
  st.printEv = cause;
  st.printDir = monthly > prev * 1.03 ? 1 : monthly < prev * 0.97 ? -1 : 0;
  // A beat stays rich for about six weeks, long enough for the buyers to get filled, then fades.
  st.chaseUntil = st.printDir > 0 ? w.day + 45 : w.day;
  w.events.emit('mkt.rerate', `${st.instr} is marked to the earnings just reported`, [cause], issuer);
}

function band(st: Stock): number { return st.wide ? 0.10 : 0.02; }

/** A one-cent price cannot move by two percent and stay a whole cent, so the band is at least a cent. */
function circuit(st: Stock): { hi: number; lo: number } {
  const up = Math.floor(st.prev * (1 + band(st)));
  const dn = Math.ceil(st.prev * (1 - band(st)));
  return { hi: Math.max(st.prev + 1, up), lo: Math.max(1, Math.min(Math.max(1, st.prev - 1), dn)) };
}

function volOf(st: Stock): number {
  const r = st.rets;
  if (r.length < 2) return 0.01;
  let m = 0;
  for (const x of r) m += x;
  m /= r.length;
  let v = 0;
  for (const x of r) v += (x - m) * (x - m);
  return Math.sqrt(v / r.length);
}

function place(w: World, actor: string, instr: string, side: Side, qty: number, limit: number | null, src: Src): number {
  const m = book(w);
  const o: Order = { id: m.nextId++, actor, instr, side, qty, limit, seq: m.seq++, open: true, skip: false, src };
  m.orders.push(o);
  indexOrder(o);
  return o.id;
}

function cancelSrc(w: World, actor: string, instr: string, src: Src): void {
  const list = ordersFor(actor, instr, src, false);
  if (!list) return;
  for (let i = 0; i < list.length; i++) list[i].open = false;
  list.length = 0;
}

function noiseQty(w: World, stream: string, qty: number): number {
  if (qty < 1) return 0;
  const n = 0.75 + 0.5 * w.rng(stream).next();
  return Math.max(1, Math.round(qty * n));
}

/** Any ledger actor may rest an order. Cash and shares are checked at the fill, so a resting order cannot invent either. */
export function submitOrder(w: World, actor: string, req: OrderRequest): number {
  if (!w.ledger.actors.has(actor)) throw new Error(`unknown actor ${actor}`);
  const st = book(w).stocks.find((x) => x.instr === req.instr);
  if (!st) throw new Error(`not listed ${req.instr}`);
  if (req.side !== 'buy' && req.side !== 'sell') throw new Error('side must be buy or sell');
  if (!Number.isSafeInteger(req.qty) || req.qty <= 0) throw new Error('qty must be a positive integer');
  if (req.limit !== undefined && (!Number.isSafeInteger(req.limit) || req.limit <= 0)) throw new Error('limit must be a positive integer price in cents');
  return place(w, actor, req.instr, req.side, req.qty, req.limit ?? null, 'player');
}

/** A fresh order id, so a stop held elsewhere never shares a number with a resting order. */
export function nextOrderId(w: World): number {
  return book(w).nextId++;
}

/** The player has chosen to trade. Household rebalancing and house bids then leave their cash and book alone. */
export function markPlayerTrading(w: World): void {
  book(w).playerLive = true;
}

/** True once the player has sent an order. Until then the household and the land market treat them as anyone else. */
export function playerTrading(w: World): boolean {
  return book(w).playerLive === true;
}

export function cancelOrder(w: World, actor: string, orderId: number): boolean {
  const o = book(w).orders.find((x) => x.id === orderId);
  if (!o || !o.open || o.actor !== actor) return false;
  o.open = false;
  return true;
}

/**
 * News moves a price the way a market does. The earnings the buyers count on move by the news's weight (a fraction:
 * -0.3 marks them down by thirty percent), and the next print may reach the new value in one move: a gap at the open,
 * not a fixed step a day. How much of it the open prices is the crowd's call, drawn as microstructure noise: an under-
 * reaction leaves a mood above the new value that then reverts (follow-through), an over-reaction one below it that
 * reverts back (a fade).
 */
function seenCause(st: Stock, cause: number): boolean {
  return cause >= 0 && (st.priced?.includes(cause) ?? false);
}
function noteCause(st: Stock, cause: number, also?: number): void {
  const list = st.priced ?? [];
  if (cause >= 0 && !list.includes(cause)) list.push(cause);
  if (also !== undefined && also >= 0 && also !== cause && !list.includes(also)) list.push(also);
  if (list.length > 24) list.splice(0, list.length - 24);
  st.priced = list;
}

export function discountForNews(w: World, issuer: string, cause: number, weight = -0.3, also?: number): void {
  const st = book(w).stocks.find((x) => x.issuer === issuer);
  if (!st || !Number.isFinite(weight) || weight === 0) return;
  // The same story, priced once, does not gap the name again when the weekly roundup repeats it.
  // A later story that cites it (a confirmation) is a new cause and still prices.
  if (seenCause(st, cause)) {
    noteCause(st, cause, also);
    return;
  }
  let wgt = weight;
  const same = st.newsDay === w.day;
  const applied = same ? (st.newsW ?? 0) : 0;
  if (same && applied !== 0 && wgt * applied > 0) {
    if (Math.abs(wgt) <= Math.abs(applied) + 0.005) { noteCause(st, cause, also); return; }
    wgt = wgt - applied;
  }
  if (!Number.isFinite(wgt) || wgt === 0) { noteCause(st, cause, also); return; }
  const k = Math.max(0.2, Math.min(2, 1 + wgt));
  st.profitEma *= k;
  st.divEma = Math.max(0, st.divEma * k);
  newsShock(w, st, wgt);
  st.newsDay = w.day;
  st.newsW = applied + wgt;
  noteCause(st, cause, also);
  const pct = Math.round(Math.abs(wgt) * 100);
  const causes = also !== undefined && also >= 0 && also !== cause ? [cause, also] : [cause];
  w.events.emit('mkt.news', `${st.instr} earnings marked ${wgt < 0 ? 'down' : 'up'} ${pct}% after the news`, causes, issuer);
}

/** The open prices part of the news (0.55 to 1.2 of it); the mood carries the rest and reverts by itself. */
function newsShock(w: World, st: Stock, weight: number): void {
  st.newsAt = w.day;
  const g = 0.55 + 0.65 * w.rng('mkt:news').next();
  const px = Math.max(1, st.last || st.prev || 1);
  const printed = weight * g;
  st.newsPx = Math.max(1, Math.round(px * (1 + printed)));
  // A story filed after the close gaps the next open. One filed while the session is ticking prints in the candles left today.
  const intraday = w.tickDone > 0 && w.tickDone < w.ticksPerDay;
  st.newsUntil = intraday ? w.day : w.day + 1;
  st.printUntil = Math.max(st.printUntil ?? 0, st.newsUntil);
  const residual = Math.max(-0.4, Math.min(0.4, weight * (1 - g)));
  const now = Math.max(-0.4, Math.min(0.4, (st.sentNext ?? 0) * 0.5 + residual));
  st.sent = now;
  st.sentNext = now;
  st.sentNow = now;
}

/** How a share moves with the policy rate: builders and durable goods most, banks the other way. */
function rateSensitivity(s: EconState, st: Stock): number {
  if (st.issuer === BANK) return -0.6;
  const f = firmOf(s, st.issuer);
  if (!f) return 1;
  const good = GOODS[f.good]?.good ?? '';
  if (f.sector === 'CONSTRUCTION') return 2.4;
  if (good === 'FURNITURE' || good === 'VEHICLES' || good === 'APPLIANCES' || good === 'HOUSING') return 2.1;
  if (f.sector === 'RETAIL') return 1.4;
  if (f.sector === 'TECHNOLOGY') return 1.6;
  if (f.sector === 'ENERGY' && good === 'ELECTRICITY') return 1.3;
  if (f.sector === 'FINANCE') return 0.8;
  return 1;
}

/** The bank has announced. Shares move on the decision, most on the part of it the market did not expect. */
function rateShock(w: World, last: { from: number; to: number; expect: number; ev?: number }): void {
  const s = econ(w);
  const delta = last.to - last.from;
  const surprise = last.to - last.expect;
  if (Math.abs(delta) < 1e-6 && Math.abs(surprise) < 1e-6) return;
  const rng = w.rng('mkt:rate');
  for (const st of book(w).stocks) {
    if (st.issuer === BANK) st.nim = Math.max(-0.35, Math.min(0.35, (st.nim ?? 0) + delta * 12));
    const sens = rateSensitivity(s, st);
    const noise = 0.78 + 0.44 * rng.next();
    // A 50bp move is about two percent on an ordinary name and about twice that on builders and furniture.
    // The part the market did not expect moves prices about twice as much again. The bank's own shares rise on a hike.
    let pct = st.issuer === BANK
      ? (delta * 5 + surprise * 8) * noise
      : -(delta * 4 + surprise * 8) * sens * noise;
    pct = Math.max(-0.12, Math.min(0.12, pct));
    if (!Number.isFinite(pct) || Math.abs(pct) < 0.0015) continue;
    const px = Math.max(1, st.last || st.prev || 1);
    const g = 0.72 + 0.4 * rng.next();
    st.newsPx = Math.max(1, Math.round(px * (1 + pct * g)));
    st.newsUntil = w.day;
    st.printUntil = Math.max(st.printUntil ?? 0, w.day);
    st.newsAt = w.day;
    const residual = Math.max(-0.25, Math.min(0.25, pct * (1 - g)));
    const add = (v: number | undefined): number => Math.max(-0.4, Math.min(0.4, (v ?? 0) + residual));
    st.sent = add(st.sent);
    st.sentNext = add(st.sentNext);
    st.sentNow = add(st.sentNow);
  }
  if (last.ev !== undefined) {
    const bp = Math.round((last.to - last.from) * 10000);
    w.events.emit('mkt.move', `shares reprice on the policy rate, ${bp >= 0 ? '+' : ''}${bp}bp to ${(last.to * 100).toFixed(2)}%`, [last.ev]);
  }
}

/** A firm that cuts its staff on falling sales is news for its shares: the cut is weighed by how much of the payroll went. */
function layoffNews(w: World): void {
  const s = econ(w);
  for (const st of book(w).stocks) {
    const f = firmOf(s, st.issuer);
    if (!f) continue;
    const ev = (f as { layoffEv?: number }).layoffEv;
    const staff = f.workers;
    if (ev !== undefined && ev !== st.layoffSeen) {
      const e = w.events.get(ev);
      if (e && w.day - e.day <= 2) {
        const base = st.staffSeen;
        const closed = f.closed || staff <= 0 || /lays off its staff/i.test(e.msg);
        let weight: number;
        if (base !== undefined && base > 0) {
          const cut = Math.max(0, (base - staff) / base);
          weight = closed ? -Math.min(0.4, 0.16 + 0.55 * cut) : -Math.min(0.22, 0.04 + 0.65 * cut);
        } else {
          // No earlier headcount: price the confirmed cut, not years of drift.
          weight = closed ? -0.28 : -0.08;
        }
        if (weight < -0.02) discountForNews(w, st.issuer, ev, weight);
      }
    }
    if (ev !== st.layoffSeen || st.staffSeen === undefined || w.day % 30 === 0) { st.layoffSeen = ev ?? -1; st.staffSeen = staff; }
  }
}

/** Lend shares from the market maker so a margin account can sell short. The caller owes them back. */
export function borrowShares(w: World, actor: string, instr: string, qty: number, cause: number): number {
  const from = 'fund_mm';
  const q = Math.min(qty, Math.floor(w.ledger.balance(from, instr)));
  if (q < 1 || !w.ledger.actors.has(actor)) return 0;
  return w.ledger.move(instr, from, actor, q, 'mkt.borrow', cause) ? q : 0;
}

export function returnShares(w: World, actor: string, instr: string, qty: number, cause: number): number {
  const q = Math.min(qty, Math.floor(w.ledger.balance(actor, instr)));
  if (q < 1) return 0;
  return w.ledger.move(instr, actor, 'fund_mm', q, 'mkt.borrow', cause) ? q : 0;
}

function bidRank(o: Order): number { return o.limit === null ? Number.POSITIVE_INFINITY : o.limit; }
function askRank(o: Order): number { return o.limit === null ? 0 : o.limit; }

function best(orders: Order[], instr: string, side: Side): Order | undefined {
  let win: Order | undefined;
  for (const o of orders) {
    if (!o.open || o.skip || o.instr !== instr || o.side !== side || o.qty < 1) continue;
    if (!win) { win = o; continue; }
    const better = side === 'buy'
      ? bidRank(o) > bidRank(win) || (bidRank(o) === bidRank(win) && o.seq < win.seq)
      : askRank(o) < askRank(win) || (askRank(o) === askRank(win) && o.seq < win.seq);
    if (better) win = o;
  }
  return win;
}

function fillPrice(bid: Order, ask: Order, last: number): number {
  const rest = bid.seq < ask.seq ? bid : ask;
  const inc = rest === bid ? ask : bid;
  if (rest.limit !== null) return rest.limit;
  if (inc.limit !== null) return inc.limit;
  return last;
}

function note(st: Stock, px: number, qty: number): void {
  if (!st.traded) { st.open = px; st.high = px; st.low = px; st.traded = true; }
  else { if (px > st.high) st.high = px; if (px < st.low) st.low = px; }
  st.last = px;
  st.vol += qty;
}

function matchBook(w: World, st: Stock, mine: Order[]): void {
  const m = book(w);
  const { hi, lo } = collar(w, st);
  // Sort this stock's live orders once per pass instead of rescanning the whole book for every fill.
  const live = (side: Side): Order[] => mine.filter((o) => o.open && !o.skip && o.side === side && o.qty >= 1);
  const bids = live('buy').sort((x, y) => bidRank(y) - bidRank(x) || x.seq - y.seq);
  const asks = live('sell').sort((x, y) => askRank(x) - askRank(y) || x.seq - y.seq);
  let bi = 0, ai = 0;
  const ok = (o: Order | undefined): boolean => !!o && o.open && !o.skip && o.qty >= 1;
  for (let guard = 0; guard < 4000; guard++) {
    while (bi < bids.length && !ok(bids[bi])) bi++;
    while (ai < asks.length && !ok(asks[ai])) ai++;
    const bid = bids[bi], ask = asks[ai];
    if (!bid || !ask) break;
    const cross = bid.limit === null || ask.limit === null || bid.limit >= ask.limit;
    if (!cross) break;
    if (bid.actor === ask.actor) { (bid.seq > ask.seq ? bid : ask).open = false; continue; }
    const px = fillPrice(bid, ask, st.last);
    // Daily circuit: a print outside the band does not trade, and does not block the rest of the book.
    if (px > hi || px < lo) {
      const priced = bid.limit === px ? bid : ask.limit === px ? ask : (bid.seq > ask.seq ? bid : ask);
      priced.skip = true;
      continue;
    }
    const afford = Math.floor(cash(w, bid.actor) / px);
    const held = w.ledger.balance(ask.actor, st.instr);
    const qty = Math.min(bid.qty, ask.qty, afford, held);
    if (qty < 1) {
      if (afford < 1) bid.open = false;
      if (held < 1) ask.open = false;
      if (bid.open && ask.open) bid.open = false;
      continue;
    }
    const cause = m.root;
    if (!pay(w, bid.actor, ask.actor, qty * px, 'mkt.trade', cause)) { bid.open = false; continue; }
    if (!w.ledger.move(st.instr, ask.actor, bid.actor, qty, 'mkt.trade', cause)) throw new Error(`share delivery failed on ${st.instr}`);
    bid.qty -= qty;
    ask.qty -= qty;
    if (bid.qty < 1) bid.open = false;
    if (ask.qty < 1) ask.open = false;
    note(st, px, qty);
    m.yTurn += qty * px;
  }
  // Once the player has chosen to trade, their market order stands for the session and can lift
  // each quote. Until then, and for everyone else, a market order is done after this pass.
  const self = playerTrading(w) ? playerActor(w) : '';
  for (const o of mine) if (o.open && o.limit === null && o.actor !== self) o.open = false;
}

function matchAll(w: World): void {
  for (const list of bookLists.values()) list.length = 0;
  const m = book(w);
  const orders = m.orders;
  for (let i = 0; i < orders.length; i++) {
    const o = orders[i];
    if (!o.open) continue;
    let list = bookLists.get(o.instr);
    if (!list) { list = []; bookLists.set(o.instr, list); }
    list.push(o);
  }
  const stocks = m.stocks;
  for (let i = 0; i < stocks.length; i++) {
    const list = bookLists.get(stocks[i].instr);
    if (list && list.length) matchBook(w, stocks[i], list);
  }
}

/** Offer a retail buy from people who already hold the shares, at the market maker's ask. */
function fadeRetail(w: World, st: Stock, ask: number, need: number): void {
  const m = book(w);
  const self = playerActor(w);
  const L = w.ledger;
  let left = Math.min(need, 400);
  for (const [slot, n] of L.holdersS(st.instr)) {
    if (left < 1) break;
    const id = L.ids[slot];
    if (!id || id === self || id === 'fund_mm' || !id.startsWith('p_')) continue;
    const qty = Math.min(Math.floor(n), left, 500);
    if (qty < 1) continue;
    m.fadeIds.push(place(w, id, st.instr, 'sell', qty, ask, 'hh'));
    left -= qty;
  }
}

function mmQuotes(w: World, fund: Fund): void {
  const stream = 'mkt:' + fund.id;
  const L = w.ledger, me = L.slot(fund.id);
  const mkt = book(w);
  const stocks = mkt.stocks;
  const fade = playerTrading(w) && mkt.fadeDay !== w.day;
  if (fade) mkt.fadeDay = w.day;
  for (let i = 0; i < stocks.length; i++) {
    const st = stocks[i];
    cancelSrc(w, fund.id, st.instr, 'mm');
    const held = L.balS(me, st.instr);
    const invGap = (held - st.targetInv) / Math.max(1, st.targetInv);
    const vol = volOf(st);
    const half = Math.min(0.008, 0.0025 * (1 + Math.min(3, Math.abs(invGap)) + Math.min(3, vol * 40)));
    const skew = Math.max(-0.008, Math.min(0.008, invGap * 0.004));
    const dest = destination(w, st);
    const printing = (st.printUntil ?? 0) >= w.day;
    const gap = dest / Math.max(1, st.last) - 1;
    // On a report the quote IS the new value, so the close can print it the same day.
    // Otherwise a wide fundamental gap walks in, instead of sitting for months.
    const pull = printing ? 1 : Math.abs(gap) > 0.06 ? 0.45 : 0;
    const midPx = pull > 0 ? st.last * (1 - pull) + dest * pull : st.last;
    const mid = Math.max(1, Math.round(midPx * (1 - skew)));
    const width = Math.max(1, Math.round(st.last * half));
    const bid = Math.max(1, mid - width);
    const ask = mid + width;
    const clip = noiseQty(w, stream, Math.max(30, Math.round(90 * (1 + Math.min(2, vol * 15)))));
    // Until the player chooses to trade, the quote is the same small clip as before.
    // After that, their own order is faded up to a retail ticket.
    let askSize = Math.min(held, clip);
    let bidSize = clip;
    if (playerTrading(w)) {
      let pBuy = 0, pSell = 0;
      const self = playerActor(w);
      const mine = self ? ordersFor(self, st.instr, 'player', false) : undefined;
      if (mine) for (let k = 0; k < mine.length; k++) {
        const o = mine[k];
        if (!o.open || o.qty < 1) continue;
        if (o.side === 'buy') pBuy += o.qty; else pSell += o.qty;
      }
      askSize = Math.min(held, Math.max(clip, Math.min(pBuy, 8_000)));
      bidSize = Math.max(clip, Math.min(pSell, 8_000));
      if (fade && pBuy > held) fadeRetail(w, st, ask, pBuy - held);
    }
    if (L.balS(me, DEP) >= bid) place(w, fund.id, st.instr, 'buy', bidSize, bid, 'mm');
    if (held > 0 && askSize > 0) place(w, fund.id, st.instr, 'sell', askSize, ask, 'mm');
  }
}

/** Hit a resting order that is already through the quote. Selling a bid above the market is the MM's job. */
function bestIn(orders: Order[], side: Side): Order | undefined {
  let win: Order | undefined;
  for (let i = 0; i < orders.length; i++) {
    const o = orders[i];
    if (!o.open || o.skip || o.side !== side || o.qty < 1) continue;
    if (!win) { win = o; continue; }
    const better = side === 'buy'
      ? bidRank(o) > bidRank(win) || (bidRank(o) === bidRank(win) && o.seq < win.seq)
      : askRank(o) < askRank(win) || (askRank(o) === askRank(win) && o.seq < win.seq);
    if (better) win = o;
  }
  return win;
}

function mmTake(w: World, fund: Fund): void {
  const m = book(w);
  for (const st of m.stocks) {
    const mine = bookLists.get(st.instr);
    const bid = mine ? bestIn(mine, 'buy') : best(m.orders, st.instr, 'buy');
    if (bid && bid.actor !== fund.id && bid.limit !== null && bid.limit > st.last * 1.02) {
      const qty = Math.min(80, w.ledger.balance(fund.id, st.instr), bid.qty);
      if (qty >= 1) place(w, fund.id, st.instr, 'sell', qty, null, 'mm');
      continue;
    }
    const ask = mine ? bestIn(mine, 'sell') : best(m.orders, st.instr, 'sell');
    if (ask && ask.actor !== fund.id && ask.limit !== null && ask.limit < st.last * 0.98) {
      const qty = Math.min(80, Math.floor(cash(w, fund.id) / Math.max(1, ask.limit)), ask.qty);
      if (qty >= 1) place(w, fund.id, st.instr, 'buy', qty, null, 'mm');
    }
  }
}

function valueOrders(w: World, fund: Fund, tick: number): void {
  const stream = 'mkt:' + fund.id;
  const rng = w.rng(stream);
  for (const st of book(w).stocks) {
    cancelSrc(w, fund.id, st.instr, 'value');
    const fair = fairValue(w, st, fund.premium);
    const dest = destination(w, st);
    const gap = dest / st.last - 1;
    // A beat that the crowd is chasing sits a little above earnings. Selling it
    // straight back would erase the crash that follows when the chase ends.
    const chasing = dest > fair * 1.015 && (st.printUntil ?? 0) >= w.day;
    if (chasing && gap > -0.012 && gap < 0.02) continue;
    if (Math.abs(gap) < 0.012) continue;
    const printing = (st.printUntil ?? 0) >= w.day;
    const aggro = printing || (st.wide && tick === 0 && Math.abs(gap) > 0.08) || Math.abs(gap) > 0.1;
    if (!aggro && !rng.chance(0.65)) continue;
    const room = collar(w, st);
    const raw = aggro ? dest : Math.round(st.last * (gap > 0 ? 1 + Math.min(Math.abs(gap), 0.015) : 1 - Math.min(Math.abs(gap), 0.015)));
    const limit = Math.max(room.lo, Math.min(room.hi, Math.max(1, raw)));
    const side: Side = st.last < dest ? 'buy' : 'sell';
    let qty = side === 'buy'
      ? Math.floor(cash(w, fund.id) * (aggro ? 0.06 : 0.015) / Math.max(1, limit))
      : Math.floor(w.ledger.balance(fund.id, st.instr) * (aggro ? 0.35 : 0.04));
    qty = Math.min(qty, aggro ? 800 : 250);
    qty = noiseQty(w, stream, qty);
    if (qty >= 1) place(w, fund.id, st.instr, side, qty, limit, 'value');
  }
}

function momentumOrders(w: World, fund: Fund): void {
  const stream = 'mkt:' + fund.id;
  const rng = w.rng(stream);
  for (const st of book(w).stocks) {
    cancelSrc(w, fund.id, st.instr, 'momentum');
    const printing = (st.printUntil ?? 0) >= w.day;
    const look = lookback(st);
    const dir = st.printDir ?? 0;
    // A miss after a run is the crash: sell the line, do not wait for the drift to die.
    if (printing && dir < 0) {
      const held = w.ledger.balance(fund.id, st.instr);
      const qty = noiseQty(w, stream, Math.floor(held * 0.6));
      if (qty >= 1) {
        const room = collar(w, st);
        place(w, fund.id, st.instr, 'sell', qty, room.lo, 'momentum');
        if (w.day === (st.printUntil ?? 0) - 5 && (st.printEv ?? -1) >= 0) {
          w.events.emit('mkt.crash', `${fund.id} sells ${st.instr} as the run breaks`, [st.printEv ?? w.genesis], fund.id);
        }
      }
      continue;
    }
    const chase = printing && dir > 0 && look >= 0.04;
    if (!chase && st.rets.length < 3) continue;
    if (!chase && Math.abs(look) < 0.006) continue;
    if (!chase && !rng.chance(0.7)) continue;
    const side: Side = chase || look > 0 ? 'buy' : 'sell';
    const dest = destination(w, st);
    let qty = chase
      ? Math.floor(cash(w, fund.id) * 0.08 / Math.max(1, dest))
      : Math.round(50 * Math.min(3, Math.abs(look) / 0.01));
    if (side === 'buy') qty = Math.min(qty, Math.floor(cash(w, fund.id) * (chase ? 0.08 : 0.02) / Math.max(1, st.last)));
    else qty = Math.min(qty, w.ledger.balance(fund.id, st.instr));
    qty = Math.min(qty, chase ? 600 : 200);
    qty = noiseQty(w, stream, qty);
    if (qty < 1) continue;
    const room = collar(w, st);
    const limit = side === 'buy' ? Math.min(room.hi, dest) : Math.max(room.lo, Math.round(st.last * 0.99));
    place(w, fund.id, st.instr, side, qty, limit, 'momentum');
    if (chase && w.day === (st.printUntil ?? 0) - 5 && (st.printEv ?? -1) >= 0) {
      w.events.emit('mkt.chase', `${fund.id} bids ${st.instr} through fair value after the beat`, [st.printEv ?? w.genesis], fund.id);
    }
  }
}

/** The player trades only through their own orders. A household rebalance would sell a passive book back to a savings target. */
function playerActor(w: World): string {
  const who = (w.state.player as { who?: number } | undefined)?.who;
  if (who === undefined || who < 0) return '';
  const P = econ(w).P;
  return who < P.n ? P.id(who) : '';
}

function householdOrders(w: World): void {
  const s = econ(w);
  const m = book(w);
  const self = playerTrading(w) ? playerActor(w) : '';
  // Placing an order touches neither the ledger nor a firm, so a price read once holds for the whole round.
  const memo = new Map<string, number>();
  const px = (instr: string): number => {
    let v = memo.get(instr);
    if (v === undefined) { v = m.price(instr); memo.set(instr, v); }
    return v;
  };
  for (const h of s.investors) {
    if ((self && h.id === self) || isSeatActor(w, h.id)) continue;
    const rng = w.rng('mkt:' + h.id);
    if (!rng.chance(0.2)) continue; // each person rebalances about once a week
    const wealth = w.ledger.netWorth(h.id, px);
    if (!(wealth > 0)) continue;
    const eq = stakeValue(w, h.id, false);
    const gap = h.target * wealth - eq;
    if (Math.abs(gap) / wealth < 0.02) continue;
    const side: Side = gap > 0 ? 'buy' : 'sell';
    // A person rebalances a handful of names at a time, not the whole market.
    const PICK = 6, scale = m.stocks.length / PICK;
    const picks = new Set<number>();
    while (picks.size < Math.min(PICK, m.stocks.length)) picks.add(rng.int(m.stocks.length));
    for (const k of picks) {
      const st = m.stocks[k];
      let qty = Math.max(1, Math.min(240 * scale, Math.round(Math.abs(gap) / wealth * 160 * scale)));
      if (side === 'buy') qty = Math.min(qty, Math.floor(cash(w, h.id) / Math.max(1, st.last) / PICK));
      else qty = Math.min(qty, w.ledger.balance(h.id, st.instr));
      qty = noiseQty(w, 'mkt:' + h.id, qty);
      if (qty >= 1) place(w, h.id, st.instr, side, qty, null, 'hh');
    }
  }
}

function causesFor(w: World, st: Stock): number[] {
  const s = econ(w);
  const out: number[] = [];
  if ((st.printEv ?? -1) >= 0 && (st.printUntil ?? 0) >= w.day - 1) out.push(st.printEv ?? 0);
  if (shockLinked(w) && s.shockEv !== undefined) out.push(s.shockEv);
  const f = firmOf(s, st.issuer);
  if (f?.priceEv !== undefined) out.push(f.priceEv);
  if (f?.stockoutEv !== undefined) out.push(f.stockoutEv);
  const def = w.events.last('firm.default');
  if (def !== undefined && w.events.get(def)?.actor === st.issuer) out.push(def);
  if (s.rateEv !== undefined) out.push(s.rateEv);
  const cpi = w.events.last('macro.cpi');
  if (cpi !== undefined) out.push(cpi);
  if (!out.length) out.push(w.genesis);
  return [...new Set(out)];
}

function seedInventory(w: World, mm: string): void {
  const s0 = econ(w);
  const rich = [...s0.investors].sort((a, b) => w.ledger.balance(b.id, book(w).stocks[0].instr) - w.ledger.balance(a.id, book(w).stocks[0].instr))[0].id;
  const budget = Math.floor(cash(w, mm) * 0.5);
  const each = Math.floor(budget / book(w).stocks.length);
  for (const st of book(w).stocks) {
    const qty = Math.min(w.ledger.balance(rich, st.instr), Math.floor(each / st.last));
    if (qty < 1) continue;
    const cents = qty * st.last;
    if (cash(w, mm) < cents) continue;
    if (!pay(w, mm, rich, cents, 'mkt.seed', w.genesis)) continue;
    if (!w.ledger.move(st.instr, rich, mm, qty, 'mkt.seed', w.genesis)) throw new Error(`seed delivery failed ${st.instr}`);
    st.targetInv = qty;
  }
}

function topHolding(w: World, instr: string): number {
  return w.ledger.topQty(instr);
}

/** Bids near the last price, other than the market maker's own quote. The maker's quote is around the last print, so it cannot be what holds that print up. */
function bidSupport(w: World, st: Stock): number {
  let q = 0;
  for (const o of book(w).orders) {
    if (!o.open || o.src === 'mm' || o.instr !== st.instr || o.side !== 'buy' || o.qty < 1 || o.limit === null) continue;
    if (o.limit < st.last * 0.98) continue;
    q += o.qty;
  }
  return q;
}

/**
 * A cornered name whose last print sits above what the firm earns, with nobody else bidding,
 * gives that premium back. One day's band at a time, so a real buyer still moves the tape
 * and the close falls once they stop.
 */
function fadeCorner(w: World, st: Stock): void {
  const adv = advOf(st);
  const out = sharesOut(w, st.instr);
  const top = topHolding(w, st.instr);
  if (!(out > 0 && top > out * FADE_SHARE)) return;
  const fair = fairValue(w, st, 0.04);
  if (!(fair > 0) || !(st.last > fair * 1.25)) return;
  // A few round lots near the print do not make a price that a corner could sell.
  if (bidSupport(w, st) >= Math.max(adv * 5, top * 0.05)) return;
  const lo = collar(w, st).lo;
  const floorPx = Math.max(lo, Math.round(fair));
  if (st.last > floorPx) st.last = floorPx;
}

function impliedEma(s: EconState, last: number, policy: number, premium: number, sh: number): number {
  const r = capRate(s, policy, premium);
  const annual = last * r * sh;
  return annual / (12 * (W_DIV + W_EARN * PAYOUT));
}

// ---- order flow: why a share moves on a day with no news ----
// Between reports the earnings stream is fixed, but the price a crowd will pay for it is not. Each name carries a
// mood (a fraction above or below the earnings value) that follows the day's order flow and reverts by itself.
// The flow is market microstructure noise, so it is the one use of an outside random draw here: part of it is the
// market's own (every name feels it) and part is the name's. Smaller firms swing more, and the session after a
// report or a scandal swings much more.
const MOOD_KEEP = 0.9;
/** Share of a day's mood move that happens overnight, before the open. The rest arrives through the session. */
const OVERNIGHT = 0.15;

/** How far a name's mood moves on an ordinary day. Smaller firms swing more. */
export function flowSigma(w: World, instr: string): number {
  const st = book(w).stocks.find((x) => x.instr === instr);
  if (!st) return 0.012;
  const capD = Math.max(1, st.last * sharesOut(w, instr) / 100);
  return 0.0065 + 0.0105 / (1 + capD / 2e7);
}

function drawMood(w: World, forDay: number): void {
  const m = book(w);
  const open = tradingDay(forDay);
  const rng = w.rng('mkt:flow');
  const common = rng.normal();
  for (const st of m.stocks) {
    const z = rng.normal();
    const was = st.sentNext ?? 0;
    st.sent = was;
    if (!open) { st.sentNext = was; continue; }
    const news = st.newsAt !== undefined && forDay - st.newsAt <= 1 ? 2.4 : 1;
    const sg = flowSigma(w, st.instr) * news;
    st.sentNext = Math.max(-0.4, Math.min(0.4, MOOD_KEEP * was + sg * (0.5 * common + 0.866 * z)));
  }
}

function rampMood(w: World, t: number): void {
  const T = Math.max(1, w.ticksPerDay);
  const g = T === 1 ? 1 : OVERNIGHT + (1 - OVERNIGHT) * (t / (T - 1));
  for (const st of book(w).stocks) {
    const a = st.sent ?? 0, b = st.sentNext ?? a;
    st.sentNow = a + (b - a) * g;
  }
}

/** After the book has traded, the tick's price is where the quote has walked to: the earnings value plus the mood so far. The last tick's price is the close. */
function settleTick(w: World, t: number): void {
  const last = t >= w.ticksPerDay - 1;
  for (const st of book(w).stocks) {
    const dest = destination(w, st);
    const { hi, lo } = collar(w, st, dest);
    st.last = Math.max(lo, Math.min(hi, dest));
    if (last) { fadeCorner(w, st); st.imp = 0; st.closedOn = w.day; }
    if (!st.traded) { st.open = st.prev; st.high = Math.max(st.prev, st.last); st.low = Math.min(st.prev, st.last); st.traded = true; }
    else { if (st.last > st.high) st.high = st.last; if (st.last < st.low) st.low = st.last; }
    st.tgt = st.last;
    st.tgtSeq = (st.tgtSeq ?? 0) + 1;
  }
}

export interface Pulse { tgt: number; seq: number; imp: number; news: boolean; out: number }
/** What the minute layer reads for a listed share: the price the last tick settled on and a counter that moves when a tick runs. */
export function pulseOf(w: World, instr: string): Pulse | undefined {
  const st = book(w)?.stocks.find((x) => x.instr === instr);
  if (!st) return undefined;
  return { tgt: st.tgt ?? st.last, seq: st.tgtSeq ?? 0, imp: st.imp ?? 0, news: st.newsAt !== undefined && w.day - st.newsAt <= 1, out: sharesOut(w, instr) };
}
/** The minute layer walks the quote through the session: the share trades, and the book is centred, at the minute's price. */
export function setQuote(w: World, instr: string, px: number): void {
  const st = book(w)?.stocks.find((x) => x.instr === instr);
  if (st) st.last = Math.max(1, Math.round(px));
}

export const markets: Module = {
  id: 'markets',

  init(w) {
    resetOrderIndex();
    const s = econ(w);
    const funds: Fund[] = [
      { id: 'fund_value', style: 'value', premium: 0.04 },
      { id: 'fund_value_2', style: 'value', premium: 0.05 },
      { id: 'fund_mom', style: 'momentum', premium: 0 },
      { id: 'fund_mm', style: 'mm', premium: 0 },
    ];
    const state: MktState = {
      stocks: [], funds, orders: [], nextId: 1, seq: 1, index: 100, tr: 100, trCap: 1, baseCap: 1, yTurn: 0, root: 0,
      playerLive: false, fadeDay: -1, fadeIds: [],
      price: () => 0,
    };
    let pricing = false;
    let byInstr: Map<string, Stock> | null = null;
    state.price = (instr: string): number => {
      if (!byInstr || byInstr.size !== state.stocks.length) byInstr = new Map(state.stocks.map((x) => [x.instr, x]));
      const hit = byInstr.get(instr);
      if (hit) return hit.last;
      if (instr.startsWith('fxc:')) return fxMark(w, instr);
      if (pricing || !instr.startsWith('eq:')) return 0;
      const issued = w.ledger.issued.get(instr) ?? 0;
      if (!(issued > 0)) return 0;
      if (instr.startsWith('eq:fund_')) {
        pricing = true;
        let nw = 0;
        try { nw = w.ledger.netWorth(instr.slice(3), state.price); }
        finally { pricing = false; }
        return Math.max(0, Math.round(nw / issued));
      }
      // A private share is the firm's book, including listed stakes. A negative book is a cent:
      // the holder is not liable for the firm's unpaid loan.
      pricing = true;
      let book = 0;
      try { book = bookEquity(w, instr.slice(3), state.price); }
      finally { pricing = false; }
      if (!(book > 0)) return 1;
      return Math.max(1, Math.round(book / issued));
    };
    w.state.markets = state;

    for (const f of s.firms) {
      const instr = 'eq:' + f.id;
      const last = Math.max(1, Math.round(bookEquity(w, f.id) / sharesOut(w, instr)));
      state.stocks.push({
        instr, issuer: f.id, last, prev: last, open: last, high: last, low: last, vol: 0, traded: false,
        wide: false, hist: [], rets: [], divEma: 0, profitEma: 0, seenProfit: 0, seenDiv: 0, targetInv: 1,
      });
    }
    {
      const instr = 'eq:' + BANK;
      const last = Math.max(1, Math.round(bookEquity(w, BANK) / sharesOut(w, instr)));
      state.stocks.push({
        instr, issuer: BANK, last, prev: last, open: last, high: last, low: last, vol: 0, traded: false,
        wide: false, hist: [], rets: [], divEma: 0, profitEma: 0, seenProfit: 0, seenDiv: 0, targetInv: 1,
      });
    }
    // A firm opens at what its running profit is worth, the same discounted stream the value funds will
    // price it by. The book is not that: machinery counted at replacement cost made a $24,000-a-year firm
    // a $38 million one, and the first quarter then split and repriced it. Month one is calm when the
    // opening price is already the price the earnings support.
    const pre: { st: Stock; sh: number; last: number }[] = [];
    for (const st of state.stocks) {
      const sh = sharesOut(w, st.instr);
      let last = st.last;
      if (st.issuer === BANK) {
        const per = Math.max(1, Math.round(bookEquity(w, BANK) / sh));
        last = Math.max(1, Math.round(per * (0.03 + 0.04) / discount(s.policyRate, 0.04)));
      } else {
        const f = firmOf(s, st.issuer);
        if (f && f.markup > 1 && f.expSales > 0 && f.price > 0) {
          const daily = f.expSales * f.price * (1 - 1 / f.markup);
          const loan = w.ledger.issued.get('loan:' + f.id) ?? 0;
          const interest = loan * (s.policyRate + 0.03) / 12;
          const tax = s.profitTax ?? 0.2;
          const monthly = daily * 30 - interest;
          const after = monthly > 0 ? monthly * (1 - tax) : 0;
          const r = capRate(s, s.policyRate, 0.04, state.gHat);
          if (sh > 0 && r > 0) {
            const dcf = Math.round(annualCash(after, after) / r / sh);
            last = dcf >= 1 ? dcf : Math.max(1, Math.min(last, 25));
          }
        }
        // A firm with no profit to capitalise is worth what its sales are worth to a buyer, less its debt: a
        // turnaround story, never a one-cent placeholder.
        if (f && f.expSales > 0 && f.price > 0 && sh > 0 && last < 100) {
          const sales = f.expSales * f.price * 360;
          const loan = w.ledger.issued.get('loan:' + f.id) ?? 0;
          const equity = Math.max(0.5 * sales - loan, 0.12 * sales);
          last = Math.max(last, Math.round(equity / sh));
        }
      }
      pre.push({ st, sh, last });
    }
    // Each firm was founded with the same ten thousand shares, so the same earnings stream is a price in the
    // thousands. A board splits until the price suits the firm: the bigger the firm and the older its name,
    // the higher the price it keeps. The founding choice is spread from seven dollars to two hundred and sixty.
    const ranked = [...pre].sort((a, b) => a.last * a.sh - b.last * b.sh);
    const rankOf = new Map(ranked.map((r, i) => [r.st.instr, ranked.length > 1 ? i / (ranked.length - 1) : 0.5]));
    for (const { st, sh, last: last0 } of pre) {
      let last = last0;
      const u = hashUnit(st.instr);
      const frac = 0.55 * u + 0.45 * (rankOf.get(st.instr) ?? 0.5);
      const target = Math.exp(Math.log(OPEN_LOW) + frac * (Math.log(OPEN_HIGH) - Math.log(OPEN_LOW)));
      let shOut = sh;
      const ratio = Math.max(1, Math.round(last / target));
      if (ratio > 1 && sh > 0) {
        for (const [holder, qty] of [...w.ledger.holders(st.instr)]) {
          const add = (ratio - 1) * Math.floor(qty);
          if (add > 0) w.ledger.issue(st.instr, holder, add, 'mkt.presplit', w.genesis);
        }
        shOut = sharesOut(w, st.instr);
        last = Math.max(1, Math.round(last / ratio));
      }
      st.last = last; st.prev = last; st.open = last; st.high = last; st.low = last;
      const x = impliedEma(s, last, s.policyRate, 0.04, shOut);
      st.divEma = x;
      st.profitEma = x;
    }

    const slice = [0.06, 0.06, 0.05, 0.08];
    const baseCash = s.investors.map((h) => cash(w, h.id));
    for (let fi = 0; fi < funds.length; fi++) {
      const fund = funds[fi];
      w.ledger.addActor(fund.id, 'fund');
      w.ledger.define({ id: 'eq:' + fund.id, kind: 'share', issuer: fund.id });
      let left = SHARES;
      for (let i = 0; i < s.investors.length; i++) {
        const h = s.investors[i];
        const sh = i === s.investors.length - 1 ? left : Math.round(SHARES / s.investors.length);
        left -= sh;
        const cents = Math.floor(baseCash[i] * slice[fi]);
        if (cents > 0 && !pay(w, h.id, fund.id, cents, 'genesis.equity', w.genesis)) throw new Error(`fund capital failed ${fund.id}`);
        w.ledger.issue('eq:' + fund.id, h.id, sh, 'genesis.equity', w.genesis);
      }
    }
    seedInventory(w, 'fund_mm');

    let cap = 0;
    for (const st of state.stocks) cap += st.last * sharesOut(w, st.instr);
    state.baseCap = Math.max(1, cap);
    state.trCap = state.baseCap;
    state.index = 100;
    drawMood(w, 0);
    state.root = w.events.emit('mkt.open', 'stock exchange open for firm and bank shares', [w.genesis]);
    const bad = w.ledger.check();
    if (bad.length) throw new Error(`books failed at the open: ${bad.slice(0, 5).join('; ')}`);
  },

  tick(w, t) {
    if (t === 0) { updateEmas(w); markWide(w); }
    const m = book(w);
    const cbLast = econ(w).cbLast;
    if (cbLast && cbLast.day === w.day && m.rateSeen !== cbLast.ev) { m.rateSeen = cbLast.ev; rateShock(w, cbLast); }
    rampMood(w, t);
    if (byActor.size === 0) for (let i = 0; i < m.orders.length; i++) if (m.orders[i].open) indexOrder(m.orders[i]);
    compactOrders(m);
    // On a repricing morning the value limits rest first, so a quote that crosses them prints at that limit.
    if (t === 0) for (const f of m.funds) if (f.style === 'value') valueOrders(w, f, t);
    for (const f of m.funds) if (f.style === 'mm') mmQuotes(w, f);
    matchAll(w);
    if (t !== 0) {
      for (const f of m.funds) if (f.style === 'value') valueOrders(w, f, t);
      matchAll(w);
    }
    if (t === 0) {
      for (const f of m.funds) if (f.style === 'mm') mmTake(w, f);
      matchAll(w);
      householdOrders(w);
      matchAll(w);
    }
    if (t === 3) {
      for (const f of m.funds) if (f.style === 'momentum') momentumOrders(w, f);
      matchAll(w);
    }
    sweepSeatOrders(w);
    settleTick(w, t);
    fadeImpact(w, Math.pow(0.7, 1 / Math.max(1, w.ticksPerDay)));
  },

  dayClose(w) {
    const m = book(w);
    layoffNews(w);
    for (let i = 0; i < m.fadeIds.length; i++) {
      const o = m.orders.find((x) => x.id === m.fadeIds[i]);
      if (o && o.open) o.open = false;
    }
    m.fadeIds.length = 0;
    const self = playerTrading(w) ? playerActor(w) : '';
    for (const o of m.orders) {
      o.skip = false;
      if (self && o.open && o.limit === null && o.actor === self) o.open = false;
    }
    let cap = 0;
    // The close is the earnings quote, inside the day's band. A thin print used to set the mark
    // and then sit there, so a cheap earnings yield survived for months.
    for (const st of m.stocks) {
      if (st.forced) st.forced = st.forced < 0.01 ? 0 : st.forced * FORCED_DECAY;
      // The last tick of the session set the close. A world that ran no ticks marks it here.
      if (st.closedOn === w.day) continue;
      const { hi, lo } = collar(w, st);
      st.last = Math.max(lo, Math.min(hi, destination(w, st)));
      fadeCorner(w, st);
    }
    for (const st of m.stocks) {
      const ch = st.prev > 0 ? st.last / st.prev - 1 : 0;
      // A small print already has its earnings story. A move line for every name
      // fills the page and the EPS scrolls off before a reader acts. A large
      // print still makes the paper: that is the crash people spend less after.
      const onPrint = (st.printUntil ?? 0) >= w.day && (st.printEv ?? -1) >= 0;
      if (Math.abs(ch) > 0.05 && (!onPrint || Math.abs(ch) >= 0.10)) {
        const pct = (ch * 100).toFixed(1);
        const id = w.events.emit('mkt.move', `${st.instr} close ${st.prev} -> ${st.last} (${ch >= 0 ? '+' : ''}${pct}%)`, causesFor(w, st), st.issuer);
        const s = econ(w);
        const f = firmOf(s, st.issuer);
        const ceo = f && f.ceo >= 0 && f.ceo < s.P.n && s.P.alive(f.ceo) ? f.ceo : -1;
        st.moveEv = f && ceo >= 0
          ? w.events.emit('mkt.who', `${s.P.name(ceo)} marks ${f.name} at ${st.last}`, [id], s.P.id(ceo))
          : id;
      }
      st.hist.push({
        o: st.traded ? st.open : st.last,
        h: st.traded ? st.high : st.last,
        l: st.traded ? st.low : st.last,
        c: st.last,
        v: st.vol,
      });
      st.rets.push(ch);
      if (st.rets.length > 16) st.rets.shift();
      st.prev = st.last;
      st.open = st.last;
      st.high = st.last;
      st.low = st.last;
      st.vol = 0;
      st.traded = false;
      st.wide = false;
      cap += st.last * sharesOut(w, st.instr);
    }
    m.index = 100 * cap / m.baseCap;
    drawMood(w, w.day + 1);
  },

  // Funds pay out cash they cannot use: anything above the value of the shares they hold goes to their owners.
  monthEnd(w) {
    const m = book(w);
    // Total return: the price change plus the whole payout (dividends and cash sweeps, before the holder's tax),
    // the way a published total-return index is built. A holder who pays tax earns less than this series.
    {
      const s = econ(w);
      // Chain-linked over the names that were listed at both dates, so a new listing does not
      // count its whole capitalisation as a return, and a split changes nothing.
      let cap = 0, num = 0, den = 0;
      for (const st of m.stocks) {
        const c = st.last * sharesOut(w, st.instr);
        cap += c;
        const f = firmOf(s, st.issuer);
        const div = f ? Math.max(0, f.lastDividend) : 0;
        if (st.trPrev && st.trPrev > 0) { num += c + div; den += st.trPrev; }
        st.trPrev = c;
      }
      if (den > 0) m.tr *= num / den;
      m.trCap = Math.max(1, cap);
      // Learn the growth rate once a year from the trailing twelve months of listed profit against the twelve before.
      let prof = 0;
      for (const st of m.stocks) { const f = firmOf(s, st.issuer); if (f && f.lastProfit > 0) prof += f.lastProfit; }
      const ring = m.profRing ?? (m.profRing = []);
      ring.push(prof); if (ring.length > 24) ring.shift();
      if (ring.length === 24 && w.month % 12 === 0) {
        let a = 0, b = 0;
        for (let i = 0; i < 12; i++) { a += ring[i]; b += ring[i + 12]; }
        if (a > 0) {
          const seen = Math.max(0, Math.min(0.06, b / a - 1));
          const was = m.gHat ?? (s.inflTarget ?? 0.02);
          m.gHat = was + 0.35 * (seen - was);
        }
      }
    }
    for (const f of m.funds) {
      const held = m.stocks.reduce((t, st) => t + w.ledger.balance(f.id, st.instr) * st.last, 0);
      const spare = Math.floor(cash(w, f.id) - Math.max(held, 1));
      const total = w.ledger.issued.get('eq:' + f.id) ?? 0;
      if (spare <= 0 || !total) continue;
      const L = w.ledger;
      for (const [slot, n] of L.holdersS('eq:' + f.id)) {
        const c = Math.floor(spare * n / total);
        const h = L.ids[slot];
        if (c <= 0 || !pay(w, f.id, h, c, 'fund.payout', m.root) || !h.startsWith('p_')) continue;
        const t = Math.floor(c * 0.35), e = econ(w); // fund payouts are taxed like dividends
        if (pay(w, h, 'gov', t, 'tax.dividend', m.root)) e.divTax += t;
        e.P.incWeek[+h.slice(2)] += c - t;
      }
    }
  },

  stats(w) {
    const m = book(w);
    const s = econ(w);
    let peSum = 0, n = 0;
    for (const f of s.firms) {
      if (f.closed) continue;
      const st = m.stocks.find((x) => x.issuer === f.id);
      if (!st) continue;
      const eps = f.lastProfit * 12 / sharesOut(w, st.instr);
      if (eps > 1) { peSum += st.last / eps; n++; }
    }
    const out = {
      index: +m.index.toFixed(1),
      tr: +m.tr.toFixed(1),
      turnover_M: +(m.yTurn / 1e8).toFixed(2),
      pe: +(n ? peSum / n : 0).toFixed(1),
    };
    m.yTurn = 0;
    return out;
  },
};
