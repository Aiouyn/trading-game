// Stock exchange. The shares the economy already issued (eq:frm_* and eq:bank_1) trade for deposits.
// Prices come from a price-time order book, not from a random walk. Funds and households are ledger
// actors; a fill moves shares one way and deposits the other, through pay(). Microstructure noise
// (timing, size) is the only use of w.rng('mkt:...'). Fair values and trade direction are not random.
import { BANK, DEP, pay, type EconState, type Firm } from '../economy/index.ts';
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
  baseCap: number;
  yTurn: number;
  root: number;
  price: (instr: string) => number;
}

export interface OrderRequest { instr: string; side: Side; qty: number; limit?: number }

const econ = (w: World): EconState => w.state.economy as EconState;
const book = (w: World): MktState => w.state.markets as MktState;

function cash(w: World, actor: string): number { return w.ledger.balance(actor, DEP); }
function sharesOut(w: World, instr: string): number { return w.ledger.issued.get(instr) ?? SHARES; }

function goodPrice(s: EconState, good: string): number {
  let n = 0, p = 0;
  for (const f of s.firms) if (f.good === good) { p += f.price; n++; }
  return n ? p / n : 0;
}

/** Mark goods at the producing firms' prices. Claims and money are already at face inside netWorth. */
function bookEquity(w: World, actor: string): number {
  const s = econ(w);
  return Math.round(w.ledger.netWorth(actor, (instr) => instr.startsWith('good:') ? goodPrice(s, instr.slice(5)) : 0));
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
    st.divEma = blend(st.divEma, f.lastDividend);
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
  return o.id;
}

function cancelSrc(w: World, actor: string, instr: string, src: Src): void {
  for (const o of book(w).orders) if (o.open && o.actor === actor && o.instr === instr && o.src === src) o.open = false;
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

export function cancelOrder(w: World, actor: string, orderId: number): boolean {
  const o = book(w).orders.find((x) => x.id === orderId);
  if (!o || !o.open || o.actor !== actor) return false;
  o.open = false;
  return true;
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

function matchBook(w: World, st: Stock): void {
  const m = book(w);
  const hi = Math.max(1, Math.floor(st.prev * (1 + band(st))));
  const lo = Math.max(1, Math.ceil(st.prev * (1 - band(st))));
  // Sort this stock's live orders once per pass instead of rescanning the whole book for every fill.
  const live = (side: Side): Order[] => m.orders.filter((o) => o.open && !o.skip && o.instr === st.instr && o.side === side && o.qty >= 1);
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
  for (const o of m.orders) if (o.open && o.instr === st.instr && o.limit === null) o.open = false;
}

function matchAll(w: World): void { for (const st of book(w).stocks) matchBook(w, st); }

function mmQuotes(w: World, fund: Fund): void {
  const stream = 'mkt:' + fund.id;
  for (const st of book(w).stocks) {
    cancelSrc(w, fund.id, st.instr, 'mm');
    const held = w.ledger.balance(fund.id, st.instr);
    const invGap = (held - st.targetInv) / Math.max(1, st.targetInv);
    const vol = volOf(st);
    const half = Math.min(0.008, 0.0025 * (1 + Math.min(3, Math.abs(invGap)) + Math.min(3, vol * 40)));
    const skew = Math.max(-0.008, Math.min(0.008, invGap * 0.004));
    const mid = Math.max(1, Math.round(st.last * (1 - skew)));
    const width = Math.max(1, Math.round(st.last * half));
    const bid = Math.max(1, mid - width);
    const ask = mid + width;
    const size = noiseQty(w, stream, Math.max(30, Math.round(90 * (1 + Math.min(2, vol * 15)))));
    if (cash(w, fund.id) >= bid) place(w, fund.id, st.instr, 'buy', size, bid, 'mm');
    if (held > 0) place(w, fund.id, st.instr, 'sell', Math.min(size, held), ask, 'mm');
  }
}

/** Hit a resting order that is already through the quote. Selling a bid above the market is the MM's job. */
function mmTake(w: World, fund: Fund): void {
  const m = book(w);
  for (const st of m.stocks) {
    const bid = best(m.orders, st.instr, 'buy');
    if (bid && bid.actor !== fund.id && bid.limit !== null && bid.limit > st.last * 1.02) {
      const qty = Math.min(80, w.ledger.balance(fund.id, st.instr), bid.qty);
      if (qty >= 1) place(w, fund.id, st.instr, 'sell', qty, null, 'mm');
      continue;
    }
    const ask = best(m.orders, st.instr, 'sell');
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

function householdOrders(w: World): void {
  const s = econ(w);
  const m = book(w);
  for (const h of s.investors) {
    const rng = w.rng('mkt:' + h.id);
    if (!rng.chance(0.8)) continue;
    const wealth = w.ledger.netWorth(h.id, m.price);
    if (!(wealth > 0)) continue;
    let eq = 0;
    for (const st of m.stocks) eq += w.ledger.balance(h.id, st.instr) * st.last;
    const gap = h.target * wealth - eq;
    if (Math.abs(gap) / wealth < 0.02) continue;
    const side: Side = gap > 0 ? 'buy' : 'sell';
    for (const st of m.stocks) {
      let qty = Math.max(1, Math.min(60, Math.round(Math.abs(gap) / wealth * 40)));
      if (side === 'buy') qty = Math.min(qty, Math.floor(cash(w, h.id) / Math.max(1, st.last) / m.stocks.length));
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

function impliedEma(last: number, policy: number, premium: number, sh: number): number {
  const r = discount(policy, premium);
  const annual = last * r * sh;
  return annual / (12 * (W_DIV + W_EARN * PAYOUT));
}

export const markets: Module = {
  id: 'markets',

  init(w) {
    const s = econ(w);
    const funds: Fund[] = [
      { id: 'fund_value', style: 'value', premium: 0.04 },
      { id: 'fund_value_2', style: 'value', premium: 0.05 },
      { id: 'fund_mom', style: 'momentum', premium: 0 },
      { id: 'fund_mm', style: 'mm', premium: 0 },
    ];
    const state: MktState = {
      stocks: [], funds, orders: [], nextId: 1, seq: 1, index: 100, baseCap: 1, yTurn: 0, root: 0,
      price: () => 0,
    };
    let pricing = false;
    state.price = (instr: string): number => {
      for (const st of state.stocks) if (st.instr === instr) return st.last;
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
      const x = impliedEma(st.last, s.policyRate, 0.04, sharesOut(w, st.instr));
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
    state.index = 100;
    state.root = w.events.emit('mkt.open', 'stock exchange open for firm and bank shares', [w.genesis]);
    const bad = w.ledger.check();
    if (bad.length) throw new Error(`books failed at the open: ${bad.slice(0, 5).join('; ')}`);
  },

  tick(w, t) {
    if (t === 0) { updateEmas(w); markWide(w); }
    const m = book(w);
    if (m.orders.length > 500) m.orders = m.orders.filter((o) => o.open);
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
    for (const o of m.orders) o.skip = false;
    let cap = 0;
    for (const st of m.stocks) {
      const ch = st.prev > 0 ? st.last / st.prev - 1 : 0;
      if (Math.abs(ch) > 0.03) {
        const pct = (ch * 100).toFixed(1);
        w.events.emit('mkt.move', `${st.instr} close ${st.prev} -> ${st.last} (${ch >= 0 ? '+' : ''}${pct}%)`, causesFor(w, st), st.issuer);
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
    for (const f of m.funds) {
      const held = m.stocks.reduce((t, st) => t + w.ledger.balance(f.id, st.instr) * st.last, 0);
      const spare = Math.floor(cash(w, f.id) - Math.max(held, 1));
      const total = w.ledger.issued.get('eq:' + f.id) ?? 0;
      if (spare <= 0 || !total) continue;
      for (const [h, n] of w.ledger.holders('eq:' + f.id)) { const c = Math.floor(spare * n / total); if (c > 0) pay(w, f.id, h, c, 'fund.payout', m.root); }
    }
  },

  stats(w) {
    const m = book(w);
    const s = econ(w);
    let peSum = 0, n = 0;
    for (const f of s.firms) {
      const st = m.stocks.find((x) => x.issuer === f.id);
      if (!st) continue;
      const eps = f.lastProfit * 12 / sharesOut(w, st.instr);
      if (eps > 1) { peSum += st.last / eps; n++; }
    }
    const out = {
      index: +m.index.toFixed(1),
      turnover_M: +(m.yTurn / 1e8).toFixed(2),
      pe: +(n ? peSum / n : 0).toFixed(1),
    };
    m.yTurn = 0;
    return out;
  },
};
