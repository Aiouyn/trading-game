// Stock exchange. The shares the economy already issued (eq:frm_* and eq:bank_1) trade for deposits.
// Prices come from a price-time order book, not from a random walk. Funds and households are ledger
// actors; a fill moves shares one way and deposits the other, through pay(). Microstructure noise
// (timing, size) is the only use of w.rng('mkt:...'). Fair values and trade direction are not random.
import { BANK, CAPITAL, DEP, pay, type EconState, type Firm } from '../economy/index.ts';
import { GOODS } from '../economy/content.ts';
import { type Module, type World } from '../../kernel/index.ts';

const SHARES = 1_000_000;
const W_DIV = 0.7;
const W_EARN = 0.3;
const PAYOUT = 0.5;

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
  fadeDay: number;
  fadeIds: number[];
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

/** Cents a sale of `qty` would raise by walking the resting bids. Shares the book does not want fetch nothing. */
export function saleProceeds(w: World, instr: string, qty: number, skipActor: string): number {
  if (qty < 1) return 0;
  let left = qty, got = 0;
  for (const b of bidLevels(w, instr, skipActor)) {
    if (left < 1) break;
    const q = Math.min(left, b.qty);
    got += q * b.limit;
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
  if (qty < 1 || !corner(qty, sharesOut(w, instr))) return st.last;
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

/** Hit the resting bids. Cash and shares move through the ledger. Returns shares sold. */
export function sellToBook(w: World, actor: string, instr: string, qty: number, cause: number): number {
  const st = book(w).stocks.find((s) => s.instr === instr);
  if (!st || qty < 1) return 0;
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
  return sold;
}

function goodPrice(s: EconState, good: string): number {
  let n = 0, p = 0;
  for (const f of s.firms) if (f.good === good && !f.closed) { p += f.price; n++; }
  return n ? p / n : 0;
}

/** Mark goods at the producing firms' prices. Claims and money are already at face inside netWorth. */
function bookEquity(w: World, actor: string): number {
  const s = econ(w);
  // Installed machinery is worth what it costs to replace (the price corporate pays per unit in buyMachines);
  // left at zero, every firm financed by a plant loan opens with negative equity and a one-cent share.
  const f = s.firms.find((x) => x.id === actor);
  const def = f ? GOODS[f.good] : undefined;
  const capPx = def ? 360 * s.wage / Math.max(0.01, def.prod) : 0;
  return Math.round(w.ledger.netWorth(actor, (instr) => instr.startsWith('good:') ? goodPrice(s, instr.slice(5)) : instr === CAPITAL ? capPx : 0));
}

function discount(policy: number, premium: number): number { return Math.max(0.04, policy + premium); }

function annualCash(divEma: number, profitEma: number): number {
  return 12 * (W_DIV * Math.max(0, divEma) + W_EARN * PAYOUT * Math.max(0, profitEma));
}

/** Discounted dividends. Profits stand in when the firm is retaining cash. The equity premium differs by fund. */
function fairValue(w: World, st: Stock, premium: number): number {
  const s = econ(w);
  const r = discount(s.policyRate, premium);
  const sh = sharesOut(w, st.instr);
  if (st.issuer === BANK) {
    const per = Math.max(1, Math.round(bookEquity(w, st.issuer) / sh));
    return Math.max(1, Math.round(per * (0.03 + premium) / r));
  }
  return Math.max(1, Math.round(annualCash(st.divEma, st.profitEma) / r / sh));
}

function blend(ema: number, obs: number): number {
  const span = Math.abs(ema) * 0.5 + 1;
  const cap = Math.min(ema + span, Math.max(ema - span, obs));
  return ema * 0.85 + cap * 0.15;
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
    st.profitEma = blend(st.profitEma, f.lastProfit);
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

/** A published scandal: buyers mark earnings down, and the next session's value orders sell into that. */
export function discountForNews(w: World, issuer: string, cause: number): void {
  const st = book(w).stocks.find((x) => x.issuer === issuer);
  if (!st) return;
  st.profitEma *= 0.7;
  st.divEma = Math.max(0, st.divEma * 0.7);
  w.events.emit('mkt.news', `${st.instr} earnings marked down after the news`, [cause], issuer);
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
  const { hi, lo } = circuit(st);
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
    const mid = Math.max(1, Math.round(st.last * (1 - skew)));
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
    const gap = fair / st.last - 1;
    if (Math.abs(gap) < 0.012) continue;
    const aggro = st.wide && tick === 0 && Math.abs(gap) > 0.08;
    if (!aggro && !rng.chance(0.65)) continue;
    // A large mispricing prints a slice of the gap, inside the day's circuit. Small gaps only lean on the quote.
    const step = aggro ? Math.min(0.09, Math.max(0.04, Math.abs(gap) * 0.4)) : Math.min(Math.abs(gap), 0.015);
    const anchor = aggro ? st.prev : st.last;
    const limit = Math.max(1, Math.round(anchor * (gap > 0 ? 1 + step : 1 - step)));
    const side: Side = gap > 0 ? 'buy' : 'sell';
    let qty = side === 'buy'
      ? Math.floor(cash(w, fund.id) * (aggro ? 0.04 : 0.015) / limit)
      : Math.floor(w.ledger.balance(fund.id, st.instr) * (aggro ? 0.2 : 0.04));
    qty = Math.min(qty, aggro ? 4000 : 250);
    qty = noiseQty(w, stream, qty);
    if (qty >= 1) place(w, fund.id, st.instr, side, qty, limit, 'value');
  }
}

function momentumOrders(w: World, fund: Fund): void {
  const stream = 'mkt:' + fund.id;
  const rng = w.rng(stream);
  for (const st of book(w).stocks) {
    cancelSrc(w, fund.id, st.instr, 'momentum');
    if (st.rets.length < 3) continue;
    let look = 0;
    const from = Math.max(0, st.rets.length - 5);
    for (let i = from; i < st.rets.length; i++) look += st.rets[i];
    if (Math.abs(look) < 0.006) continue;
    if (!rng.chance(0.7)) continue;
    const side: Side = look > 0 ? 'buy' : 'sell';
    let qty = Math.round(50 * Math.min(3, Math.abs(look) / 0.01));
    if (side === 'buy') qty = Math.min(qty, Math.floor(cash(w, fund.id) * 0.01 / Math.max(1, st.last)));
    else qty = Math.min(qty, w.ledger.balance(fund.id, st.instr));
    qty = noiseQty(w, stream, qty);
    if (qty >= 1) place(w, fund.id, st.instr, side, qty, null, 'momentum');
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
  for (const h of s.investors) {
    if (self && h.id === self) continue;
    const rng = w.rng('mkt:' + h.id);
    if (!rng.chance(0.2)) continue; // each person rebalances about once a week
    const wealth = w.ledger.netWorth(h.id, m.price);
    if (!(wealth > 0)) continue;
    let eq = 0;
    for (const st of m.stocks) eq += w.ledger.balance(h.id, st.instr) * st.last;
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
  const lo = circuit(st).lo;
  const floorPx = Math.max(lo, Math.round(fair));
  if (st.last > floorPx) st.last = floorPx;
}

function impliedEma(last: number, policy: number, premium: number, sh: number): number {
  const r = discount(policy, premium);
  const annual = last * r * sh;
  return annual / (12 * (W_DIV + W_EARN * PAYOUT));
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
      if (!instr.startsWith('eq:fund_') || pricing) return 0;
      const issued = w.ledger.issued.get(instr) ?? 0;
      if (issued <= 0) return 0;
      pricing = true;
      let nw = 0;
      try { nw = w.ledger.netWorth(instr.slice(3), state.price); }
      finally { pricing = false; }
      return Math.max(0, Math.round(nw / issued));
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
    for (const st of state.stocks) {
      if (st.issuer === BANK) continue;
      const f = firmOf(s, st.issuer);
      // Book equity is cash and stock minus the charter loan, and the loan is larger than both,
      // so the book floors at a cent. The loan is repaid out of profit; the shares are worth the
      // profit that remains. Price that, or the book when the book is the larger of the two.
      let last = st.last;
      if (f && f.markup > 1 && f.expSales > 0 && f.price > 0) {
        const daily = f.expSales * f.price * (1 - 1 / f.markup);
        const loan = w.ledger.issued.get('loan:' + f.id) ?? 0;
        const interest = loan * (s.policyRate + 0.03) / 12;
        const tax = s.profitTax ?? 0.2;
        const monthly = daily * 30 - interest;
        const after = monthly > 0 ? monthly * (1 - tax) : 0;
        const sh = sharesOut(w, st.instr);
        const r = discount(s.policyRate, 0.04);
        if (sh > 0 && r > 0) last = Math.max(last, Math.round(after * 12 / r / sh));
      }
      st.last = last; st.prev = last; st.open = last; st.high = last; st.low = last;
      const x = impliedEma(last, s.policyRate, 0.04, sharesOut(w, st.instr));
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
    state.root = w.events.emit('mkt.open', 'stock exchange open for firm and bank shares', [w.genesis]);
    const bad = w.ledger.check();
    if (bad.length) throw new Error(`books failed at the open: ${bad.slice(0, 5).join('; ')}`);
  },

  tick(w, t) {
    if (t === 0) { updateEmas(w); markWide(w); }
    const m = book(w);
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
  },

  dayClose(w) {
    const m = book(w);
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
    // Closing mark: a stock that did not trade is marked to the side of the book that is there, within the daily band.
    // Without this, a stock nobody offers can never reprice, however much it earns.
    const quotes = new Map<string, { bid: number; ask: number }>();
    for (const o of m.orders) {
      if (!o.open || o.limit === null || o.qty < 1) continue;
      const q = quotes.get(o.instr) ?? { bid: 0, ask: Infinity };
      if (o.side === 'buy') q.bid = Math.max(q.bid, o.limit); else q.ask = Math.min(q.ask, o.limit);
      quotes.set(o.instr, q);
    }
    for (const st of m.stocks) {
      const q = quotes.get(st.instr);
      if (st.traded || !q) continue;
      const { hi, lo } = circuit(st);
      if (q.bid > st.last && q.ask > q.bid) st.last = Math.max(st.last, Math.min(q.bid, hi, Number.isFinite(q.ask) ? q.ask - 1 : Infinity));
      else if (q.ask < st.last && q.bid < q.ask) st.last = Math.min(st.last, Math.max(q.ask, lo, q.bid + 1));
    }
    for (const st of m.stocks) fadeCorner(w, st);
    for (const st of m.stocks) {
      const ch = st.prev > 0 ? st.last / st.prev - 1 : 0;
      if (Math.abs(ch) > 0.03) {
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
  },

  // Funds pay out cash they cannot use: anything above the value of the shares they hold goes to their owners.
  monthEnd(w) {
    const m = book(w);
    // Total return: price change plus the smoothed dividend reinvested after the tax a person pays.
    {
      const s = econ(w);
      const tax = s.divRate ?? 0.35;
      let cap = 0, div = 0;
      for (const st of m.stocks) {
        cap += st.last * sharesOut(w, st.instr);
        div += Math.max(0, st.divEma);
      }
      const net = div * (1 - tax);
      const prev = m.trCap > 0 ? m.trCap : cap;
      if (prev > 0) m.tr *= (cap + net) / prev;
      m.trCap = Math.max(1, cap);
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
