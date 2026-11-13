// Listed stock options. Calls and puts on the most traded shares, monthly out to six
// months, strikes around the price. One contract is 100 shares. A contract is a pair
// of ledger instruments issued by the clearing house, the way a future is: the buyer
// holds the long, the writer holds the short. The buyer pays the premium in cash.
// Writers post margin with the clearing house and are closed out if they cannot
// meet it. At expiry an in-the-money contract is exercised (shares and cash move
// at the strike); the rest are torn up.
//
// The market maker's bid and ask come from its own volatility, realised vol lifted
// after a large move and before a known earnings date. Traders hit those quotes.
// The print is the quote that was hit, and implied vol is read back from that print.
// The market maker hedges its delta in the stock through the order book.
// Direction is never drawn. w.rng('opt:...') only jitters who acts today and how many.
import { DAYS_PER_MONTH, type Module, type World } from '../../kernel/index.ts';
import { DEP, pay, type EconState } from '../economy/index.ts';
import { borrowShares, cancelOrder, returnShares, submitOrder } from '../markets/index.ts';

const MULT = 100;
const N_UNDER = 6;
const N_EXP = 6;
const N_K = 5;
const MONEYS = [0.86, 0.93, 1, 1.07, 1.14];
const EX = 'opt_exch';
const MM = 'opt_mm';
const MARGIN = 'opt:margin';
const SHARES = 1_000_000;
const CAP = 8;

type Right = 'C' | 'P';

interface Contract {
  u: number;
  k: number;
  instr: string;
  issuer: string;
  right: Right;
  strike: number;
  expMonth: number;
  longId: string;
  shortId: string;
  mid: number;
  bid: number;
  ask: number;
  last: number;
  vol: number;
  live: boolean;
}

interface StockPeek { instr: string; issuer: string; last: number; rets: number[]; hist: { v: number }[] }
interface MktPeek { stocks: StockPeek[]; funds: { id: string; style: string }[]; price: (instr: string) => number }
interface KnowPeek { tab: Int32Array | null; bits: Uint32Array | null; n: number }
interface FactPeek {
  id: number; eventId: number; day: number; tag: string; firms: number[]; profit: number;
  bad: boolean; pub: boolean; drop: boolean; know: KnowPeek | null;
}
interface SocPeek { facts: FactPeek[]; insiderFact: Int32Array }

interface OptState {
  off: boolean;
  contracts: Contract[];
  roster: string[];
  borrowed: Record<string, number>;
  hedgeOrders: number[];
  insiderAt: Record<string, number>;
  root: number;
  mm0: number;
  yVol: number;
  yCalls: number;
  yIv: number;
  yIvN: number;
  iv: number;
}

const econ = (w: World): EconState => w.state.economy as EconState;
const stOf = (w: World): OptState => w.state.options as OptState;
const mkt = (w: World): MktPeek => w.state.markets as MktPeek;

function cashOf(w: World, actor: string): number { return Math.floor(w.ledger.balance(actor, DEP)); }
function marginOf(w: World, actor: string): number { return Math.round(w.ledger.balance(actor, MARGIN)); }
function bal(w: World, actor: string, instr: string): number { return Math.round(w.ledger.balance(actor, instr)); }
function issued(w: World, instr: string): number { return Math.round(w.ledger.issued.get(instr) ?? 0); }
function spotOf(w: World, instr: string): number {
  const px = mkt(w).price(instr);
  return px > 0 ? px : 0;
}
function netOf(w: World, actor: string, c: Contract): number {
  return bal(w, actor, c.longId) - bal(w, actor, c.shortId);
}
function dead(w: World, actor: string): boolean {
  if (!actor.startsWith('p_')) return false;
  const i = +actor.slice(2);
  const P = econ(w).P;
  return i >= 0 && i < P.n && !P.alive(i);
}
function note(st: OptState, actor: string): void {
  if (actor !== EX && !st.roster.includes(actor)) st.roster.push(actor);
}

function normCdf(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const s = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * z);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
  return 0.5 * (1 + s * y);
}

function bs(spot: number, strike: number, t: number, r: number, sig: number, call: boolean): { px: number; delta: number } {
  const T = Math.max(1 / 360, t);
  const vol = Math.max(0.05, sig) * Math.sqrt(T);
  const d1 = (Math.log(spot / Math.max(1, strike)) + (r + sig * sig / 2) * T) / vol;
  const d2 = d1 - vol;
  const df = Math.exp(-r * T);
  const nd1 = normCdf(d1);
  const raw = call ? spot * nd1 - strike * df * normCdf(d2) : strike * df * normCdf(-d2) - spot * normCdf(-d1);
  return { px: Math.max(0, raw), delta: call ? nd1 : nd1 - 1 };
}

function implied(spot: number, strike: number, t: number, r: number, price: number, call: boolean): number {
  let lo = 0.05, hi = 2.5;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (bs(spot, strike, t, r, mid, call).px > price) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

function intrinsic(right: Right, spot: number, strike: number): number {
  const x = right === 'C' ? spot - strike : right === 'P' ? strike - spot : 0;
  return x > 0 ? x : 0;
}

function yearFrac(w: World, expMonth: number): number {
  const expDay = expMonth * DAYS_PER_MONTH + (DAYS_PER_MONTH - 1);
  return Math.max(1, expDay - w.day) / 360;
}

function realised(rets: number[]): number {
  if (rets.length < 3) return 0.22;
  let m = 0;
  for (const x of rets) m += x;
  m /= rets.length;
  let v = 0;
  for (const x of rets) v += (x - m) * (x - m);
  return Math.max(0.12, Math.sqrt(v / rets.length) * Math.sqrt(360));
}

function sumRets(rets: number[], n: number): number {
  let s = 0;
  const a = Math.max(0, rets.length - n);
  for (let i = a; i < rets.length; i++) s += rets[i];
  return s;
}

function fell(rets: number[]): boolean {
  return sumRets(rets, 5) < -0.06 || (rets.length > 0 && rets[rets.length - 1] < -0.04);
}
function rising(rets: number[]): boolean { return sumRets(rets, 5) > 0.025; }
function jumpy(rets: number[]): boolean {
  const a = Math.max(0, rets.length - 5);
  for (let i = a; i < rets.length; i++) if (Math.abs(rets[i]) > 0.045) return true;
  return false;
}

function daysToReport(w: World, issuer: string, firmIdx: number): number | undefined {
  const root = w.state.earnings;
  if (!root || typeof root !== 'object') return undefined;
  const today = w.day;
  let best: number | undefined;
  const seen = new WeakSet<object>();
  const take = (day: number): void => {
    if (!Number.isFinite(day)) return;
    const d = Math.round(day) - today;
    if (d < 0 || d > 24) return;
    if (best === undefined || d < best) best = d;
  };
  const walk = (v: unknown, depth: number, about: boolean): void => {
    if (best === 0 || depth > 3 || v === null || typeof v !== 'object') return;
    if (seen.has(v)) return;
    seen.add(v);
    if (ArrayBuffer.isView(v)) {
      if (about && firmIdx >= 0) {
        const a = v as unknown as { length: number; [i: number]: number };
        if (firmIdx < a.length && typeof a[firmIdx] === 'number') take(a[firmIdx]);
      }
      return;
    }
    if (Array.isArray(v)) {
      if (v.length > 400) {
        if (about && firmIdx >= 0 && firmIdx < v.length) walk(v[firmIdx], depth + 1, true);
        return;
      }
      for (const x of v) walk(x, depth + 1, about);
      return;
    }
    const o = v as Record<string, unknown>;
    let here = about;
    for (const key of ['issuer', 'firm', 'firmId', 'id', 'stock']) {
      const x = o[key];
      if (typeof x === 'string' && (x === issuer || x === issuer.slice(3) || 'eq:' + x === issuer)) here = true;
    }
    if (typeof o[issuer] === 'number') take(o[issuer] as number);
    const bare = issuer.startsWith('eq:') ? issuer.slice(3) : issuer;
    if (bare !== issuer && typeof o[bare] === 'number') take(o[bare] as number);
    if (here) {
      for (const key of ['day', 'date', 'when', 'next', 'nextDay', 'reportDay', 'due', 'earningsDay', 'report']) {
        if (typeof o[key] === 'number') take(o[key] as number);
      }
    }
    for (const x of Object.values(o)) walk(x, depth + 1, here);
  };
  walk(root, 0, false);
  return best;
}

function volOf(w: World, stock: StockPeek, firmIdx: number): number {
  let sig = realised(stock.rets);
  if (jumpy(stock.rets)) sig *= 1.4;
  const last = stock.rets.length ? stock.rets[stock.rets.length - 1] : 0;
  if (last < -0.06) sig *= 1.3;
  const ed = daysToReport(w, stock.issuer, firmIdx);
  if (ed !== undefined) sig *= 1 + 0.6 * (1 - ed / 24);
  return Math.min(1.5, Math.max(0.18, sig));
}

function firmIdxOf(w: World, issuer: string): number {
  const firms = econ(w).firms;
  for (let i = 0; i < firms.length; i++) if (firms[i].id === issuer) return i;
  return -1;
}

function strikesFor(spot: number): number[] {
  const out: number[] = [];
  let prev = 0;
  for (const m of MONEYS) {
    let k = Math.max(1, Math.round(spot * m));
    if (k <= prev) k = prev + Math.max(1, Math.round(spot * 0.03));
    out.push(k);
    prev = k;
  }
  return out;
}

const MAX_NOTIONAL = 1_200_000; // one contract, in cents. Dearer names would swamp the market maker.

function rank(w: World): StockPeek[] {
  const rows = mkt(w).stocks.filter((s) => !s.instr.startsWith('eq:fund_') && s.last > 0 && s.last * MULT <= MAX_NOTIONAL);
  const vol = (s: StockPeek): number => {
    let v = 0;
    const a = Math.max(0, s.hist.length - 20);
    for (let i = a; i < s.hist.length; i++) v += s.hist[i].v;
    return v;
  };
  rows.sort((a, b) => vol(b) - vol(a) || b.last * issued(w, b.instr) - a.last * issued(w, a.instr) || (a.instr < b.instr ? -1 : 1));
  return rows.slice(0, N_UNDER);
}

function postMargin(w: World, actor: string, cents: number, cause: number): boolean {
  const a = Math.round(cents);
  if (a <= 0) return true;
  if (cashOf(w, actor) < a) return false;
  if (!pay(w, actor, EX, a, 'opt.margin', cause)) return false;
  w.ledger.issue(MARGIN, actor, a, 'opt.margin', cause);
  return true;
}

function releaseMargin(w: World, actor: string, cents: number, cause: number): boolean {
  const a = Math.min(Math.round(cents), marginOf(w, actor), cashOf(w, EX));
  if (a <= 0) return true;
  if (!w.ledger.redeem(MARGIN, actor, a, 'opt.margin', cause)) return false;
  if (!pay(w, EX, actor, a, 'opt.margin', cause)) {
    w.ledger.issue(MARGIN, actor, a, 'opt.margin', cause);
    return false;
  }
  return true;
}

function perContract(c: Contract, spot: number): number {
  const otm = c.right === 'C' ? Math.max(0, c.strike - spot) : Math.max(0, spot - c.strike);
  const cushion = Math.max(0, spot * MULT * 0.1 - otm * MULT * 0.5);
  return Math.max(MULT, Math.round(c.mid * MULT + cushion));
}

function requirement(w: World, actor: string): number {
  const st = stOf(w);
  let n = 0;
  for (const c of st.contracts) {
    if (!c.live) continue;
    const q = bal(w, actor, c.shortId);
    if (q < 1) continue;
    n += q * perContract(c, spotOf(w, c.instr));
  }
  return n;
}

function cover(w: World, actor: string, cause: number): boolean {
  const need = requirement(w, actor);
  const have = marginOf(w, actor);
  if (have >= need) return true;
  return postMargin(w, actor, need - have, cause);
}

function applyDelta(w: World, actor: string, c: Contract, delta: number, cause: number): void {
  if (delta === 0) return;
  const L = w.ledger;
  if (delta > 0) {
    const coverQty = Math.min(delta, bal(w, actor, c.shortId));
    if (coverQty > 0 && !L.redeem(c.shortId, actor, coverQty, 'opt.trade', cause)) throw new Error(`cover short ${c.shortId}`);
    const open = delta - coverQty;
    if (open > 0) L.issue(c.longId, actor, open, 'opt.trade', cause);
    return;
  }
  const qty = -delta;
  const coverQty = Math.min(qty, bal(w, actor, c.longId));
  if (coverQty > 0 && !L.redeem(c.longId, actor, coverQty, 'opt.trade', cause)) throw new Error(`cover long ${c.longId}`);
  const open = qty - coverQty;
  if (open > 0) L.issue(c.shortId, actor, open, 'opt.trade', cause);
}

function canCover(w: World, actor: string): boolean {
  return marginOf(w, actor) + cashOf(w, actor) >= requirement(w, actor);
}

/** Buyer pays the print, both sides update. Undone in full if the writer cannot post margin. */
function trade(w: World, buyer: string, seller: string, c: Contract, qty: number, px: number, cause: number): boolean {
  const st = stOf(w);
  qty = Math.round(qty);
  px = Math.round(px);
  if (qty < 1 || px < 1 || buyer === seller || !c.live) return false;
  const bill = px * MULT * qty;
  if (cashOf(w, buyer) < bill) return false;
  if (!pay(w, buyer, seller, bill, 'opt.premium', cause)) return false;
  applyDelta(w, buyer, c, qty, cause);
  applyDelta(w, seller, c, -qty, cause);
  if (!canCover(w, seller) || !canCover(w, buyer)) {
    applyDelta(w, buyer, c, -qty, cause);
    applyDelta(w, seller, c, qty, cause);
    if (!pay(w, seller, buyer, bill, 'opt.premium', cause)) throw new Error('option premium undo failed');
    return false;
  }
  if (!cover(w, seller, cause) || !cover(w, buyer, cause)) throw new Error('margin post failed after a cover check');
  c.last = px;
  c.vol += qty;
  st.yVol += qty;
  if (bal(w, seller, c.shortId) > 0) note(st, seller);
  if (bal(w, buyer, c.shortId) > 0) note(st, buyer);
  return true;
}

function absorbHaircut(w: World, cause: number): void {
  const dep = cashOf(w, EX);
  const claim = issued(w, MARGIN);
  if (claim <= dep) return;
  const rows: { id: string; v: number }[] = [];
  let total = 0;
  for (const [id, v0] of w.ledger.holders(MARGIN)) {
    const v = Math.floor(v0);
    if (v > 0) { rows.push({ id, v }); total += v; }
  }
  let left = Math.min(claim - dep, total);
  if (left <= 0 || total <= 0) return;
  const hole = left;
  for (let i = 0; i < rows.length && left > 0; i++) {
    const cut = i === rows.length - 1 ? left : Math.min(rows[i].v, Math.floor(hole * rows[i].v / total));
    const a = Math.min(left, rows[i].v, cut);
    if (a > 0 && w.ledger.redeem(MARGIN, rows[i].id, a, 'opt.margin', cause)) left -= a;
  }
  if (left > 0) {
    rows.sort((a, b) => b.v - a.v);
    for (const r of rows) {
      if (left <= 0) break;
      const have = Math.floor(w.ledger.balance(r.id, MARGIN));
      const a = Math.min(left, have);
      if (a > 0 && w.ledger.redeem(MARGIN, r.id, a, 'opt.margin', cause)) left -= a;
    }
  }
}

function assertBook(w: World): void {
  const st = stOf(w);
  for (const c of st.contracts) {
    const l = issued(w, c.longId), s = issued(w, c.shortId);
    if (l !== s) throw new Error(`${c.longId} open interest ${l} != ${s}`);
  }
  const dep = cashOf(w, EX), claim = issued(w, MARGIN);
  if (dep !== claim) throw new Error(`option margin cash ${dep} != claims ${claim}`);
}

function quoteOne(w: World, c: Contract, sig: number, rate: number): void {
  const spot = spotOf(w, c.instr);
  if (spot < 1 || !c.live) { c.mid = 0; c.bid = 0; c.ask = 0; return; }
  const t = yearFrac(w, c.expMonth);
  const call = c.right === 'C';
  const fair = t * 360 <= 2 ? intrinsic(c.right, spot, c.strike) : bs(spot, c.strike, t, rate, sig, call).px;
  const inv = Math.abs(netOf(w, MM, c));
  const widen = 1 + inv / 6;
  const mid = Math.max(0, fair);
  const half = Math.max(1, Math.round((mid * 0.1 + spot * 0.003) * widen));
  c.mid = Math.max(1, Math.round(mid));
  c.bid = Math.max(1, Math.round(mid) - half);
  c.ask = Math.max(c.bid + 1, Math.round(mid) + half);
  if (mid < 0.5) { c.mid = 0; c.bid = 0; c.ask = 0; }
}

function quotes(w: World): void {
  const st = stOf(w);
  const rate = econ(w).policyRate;
  const sigBy = new Map<string, number>();
  for (const c of st.contracts) {
    if (!c.live) continue;
    let sig = sigBy.get(c.instr);
    if (sig === undefined) {
      const stock = mkt(w).stocks.find((s) => s.instr === c.instr);
      sig = stock ? volOf(w, stock, firmIdxOf(w, stock.issuer)) : 0.25;
      sigBy.set(c.instr, sig);
    }
    quoteOne(w, c, sig, rate);
  }
}

function roomFor(w: World, c: Contract, buyingFromMm: boolean, qty: number): number {
  if (spotOf(w, c.instr) * MULT > MAX_NOTIONAL) return 0;
  const net = netOf(w, MM, c);
  if (buyingFromMm) return Math.max(0, Math.min(qty, CAP - -net));
  return Math.max(0, Math.min(qty, CAP - net));
}

function heldContracts(w: World, actor: string, instr: string, right: Right, sign: 1 | -1): number {
  let n = 0;
  for (const c of stOf(w).contracts) {
    if (!c.live || c.instr !== instr || c.right !== right) continue;
    const net = netOf(w, actor, c);
    if (sign > 0 && net > 0) n += net;
    if (sign < 0 && net < 0) n -= net;
  }
  return n;
}

function pickListed(w: World, instr: string, right: Right, minDays: number, maxDays: number, money: number): Contract | undefined {
  const spot = spotOf(w, instr);
  if (spot < 1) return undefined;
  let best: Contract | undefined;
  let score = Infinity;
  for (const c of stOf(w).contracts) {
    if (!c.live || c.instr !== instr || c.right !== right || c.ask < 1) continue;
    const days = yearFrac(w, c.expMonth) * 360;
    if (days < minDays || days > maxDays) continue;
    const d = Math.abs(c.strike / spot - money);
    if (d < score) { score = d; best = c; }
  }
  return best;
}

function listedNames(w: World): string[] {
  const seen: string[] = [];
  for (const c of stOf(w).contracts) if (c.live && !seen.includes(c.instr)) seen.push(c.instr);
  return seen;
}

function stockOf(w: World, instr: string): StockPeek | undefined {
  return mkt(w).stocks.find((s) => s.instr === instr);
}

function jitter(w: World, actor: string, qty: number): number {
  if (qty < 1) return 0;
  return Math.max(1, Math.round(qty * (0.75 + 0.5 * w.rng('opt:' + actor).next())));
}

function fundTrades(w: World, cause: number): void {
  const stocks = mkt(w);
  for (const f of stocks.funds) {
    if (f.style === 'mm') continue;
    if (!w.rng('opt:' + f.id).chance(0.6)) continue;
    for (const instr of listedNames(w)) {
      const stock = stockOf(w, instr);
      if (!stock) continue;
      const held = bal(w, f.id, instr);
      if (held < MULT) continue;
      const down = fell(stock.rets);
      if (down) {
        const want = Math.min(4, Math.max(1, Math.floor(held / MULT * 0.12)));
        const have = heldContracts(w, f.id, instr, 'P', 1);
        let qty = want - have;
        if (qty < 1) continue;
        const c = pickListed(w, instr, 'P', 20, 70, 0.97);
        if (!c) continue;
        qty = Math.min(jitter(w, f.id, qty), roomFor(w, c, true, qty), 2);
        if (qty < 1 || c.ask > stock.last * 0.08) continue;
        trade(w, f.id, MM, c, qty, c.ask, cause);
      } else {
        const want = Math.min(5, Math.max(1, Math.floor(held / MULT * 0.1)));
        const have = heldContracts(w, f.id, instr, 'C', -1);
        let qty = want - have;
        if (qty < 1) continue;
        const c = pickListed(w, instr, 'C', 20, 80, 1.07);
        if (!c || c.bid < 1 || c.bid <= intrinsic('C', stock.last, c.strike)) continue;
        qty = Math.min(jitter(w, f.id, qty), roomFor(w, c, false, qty), Math.floor(held / MULT), 2);
        if (qty < 1) continue;
        trade(w, MM, f.id, c, qty, c.bid, cause);
      }
    }
  }
}

function rumourIssuers(w: World): Set<string> {
  const out = new Set<string>();
  const soc = w.state.social as SocPeek | undefined;
  if (!soc) return out;
  const firms = econ(w).firms;
  const start = Math.max(0, soc.facts.length - 100);
  for (let i = start; i < soc.facts.length; i++) {
    const f = soc.facts[i];
    if (!f || f.drop || f.bad || f.tag === 'insider.profit') continue;
    if (w.day - f.day > 45) continue;
    for (const fi of f.firms) {
      const firm = firms[fi];
      if (firm) out.add(firm.id);
    }
  }
  return out;
}

function specTrades(w: World, rumours: Set<string>, cause: number): void {
  const s = econ(w);
  const names = listedNames(w);
  if (!names.length) return;
  for (const h of s.investors) {
    if (!h.id.startsWith('p_')) continue;
    const rng = w.rng('opt:' + h.id);
    if (!rng.chance(0.03)) continue;
    const person = +h.id.slice(2);
    if (!s.P.adult(w, person)) continue;
    const instr = names[rng.int(names.length)];
    const stock = stockOf(w, instr);
    if (!stock) continue;
    if (!rising(stock.rets) && !rumours.has(stock.issuer)) continue;
    if (heldContracts(w, h.id, instr, 'C', 1) >= 2) continue;
    const c = pickListed(w, instr, 'C', 15, 100, rising(stock.rets) ? 1.04 : 1);
    if (!c) continue;
    if (c.ask > stock.last * 0.07) continue;
    const qty = Math.min(1, roomFor(w, c, true, 1));
    if (qty < 1) continue;
    trade(w, h.id, MM, c, qty, c.ask, cause);
  }
}

function ctz(x: number): number { return Math.clz32(x & -x) ^ 31; }

function eachKnower(know: KnowPeek | null, fn: (person: number) => boolean): void {
  if (!know || know.n < 1) return;
  if (know.bits) {
    const bits = know.bits;
    for (let i = 0; i < bits.length; i++) {
      let x = bits[i];
      while (x) {
        const b = ctz(x);
        x &= x - 1;
        if (fn((i << 5) + b)) return;
      }
    }
    return;
  }
  const tab = know.tab;
  if (!tab) return;
  for (let i = 0; i < tab.length; i++) if (tab[i] >= 0 && fn(tab[i])) return;
}

function insiderTrades(w: World, cause: number): void {
  const soc = w.state.social as SocPeek | undefined;
  if (!soc) return;
  const st = stOf(w);
  const s = econ(w);
  let done = 0;
  for (let fi = 0; fi < s.firms.length && done < 2; fi++) {
    const id = fi < soc.insiderFact.length ? soc.insiderFact[fi] : -1;
    if (id < 0 || id >= soc.facts.length) continue;
    const fact = soc.facts[id];
    if (!fact || fact.pub || fact.drop || fact.tag !== 'insider.profit') continue;
    const f = s.firms[fi];
    if (!f) continue;
    const instr = 'eq:' + f.id;
    if (!listedNames(w).includes(instr)) continue;
    const scale = Math.max(s.wage * 30, Math.abs(f.lastProfit), 1);
    const edge = (fact.profit - f.lastProfit) / scale;
    if (Math.abs(edge) < 0.08) continue;
    const right: Right = edge > 0 ? 'C' : 'P';
    const cands: number[] = [];
    eachKnower(fact.know, (person) => {
      if (cands.length >= 8) return true;
      if (!s.P.adult(w, person) || s.P.greed[person] < 60) return false;
      const key = 'p_' + person;
      const prev = st.insiderAt[key];
      if (prev !== undefined && w.day - prev < 50) return false;
      cands.push(person);
      return false;
    });
    if (!cands.length) continue;
    const person = cands[w.rng('opt:insider').int(cands.length)];
    const actor = s.P.id(person);
    const c = pickListed(w, instr, right, 3, 40, 1);
    if (!c) continue;
    const stock = stockOf(w, instr);
    if (!stock || c.ask > stock.last * 0.12) continue;
    if (roomFor(w, c, true, 1) < 1) continue;
    if (!trade(w, actor, MM, c, 1, c.ask, cause)) continue;
    st.insiderAt[actor] = w.day;
    const word = right === 'C' ? 'call' : 'put';
    w.events.emit('opt.insider',
      `${s.P.name(person)} bought a short-dated ${word} on ${f.name} while its monthly figures were still unpublished`,
      [fact.eventId, cause], actor);
    done++;
  }
}

function touch(w: World, instr: string, side: 'buy' | 'sell'): number | undefined {
  const orders = (w.state.markets as { orders: { open: boolean; instr: string; side: string; limit: number | null; qty: number }[] }).orders;
  let best: number | undefined;
  for (const o of orders) {
    if (!o.open || o.instr !== instr || o.side !== side || o.limit == null || o.qty < 1) continue;
    if (best === undefined) best = o.limit;
    else best = side === 'buy' ? Math.max(best, o.limit) : Math.min(best, o.limit);
  }
  return best;
}

function hedge(w: World, cause: number): void {
  const st = stOf(w);
  for (const id of st.hedgeOrders) cancelOrder(w, MM, id);
  st.hedgeOrders = [];
  const rate = econ(w).policyRate;
  const names = listedNames(w);
  for (const instr of names) {
    const stock = stockOf(w, instr);
    if (!stock) continue;
    const sig = volOf(w, stock, firmIdxOf(w, stock.issuer));
    const px = Math.max(1, Math.round(spotOf(w, instr)));
    let deltaShares = 0;
    for (const c of st.contracts) {
      if (!c.live || c.instr !== instr) continue;
      const net = netOf(w, MM, c);
      if (net === 0) continue;
      const t = yearFrac(w, c.expMonth);
      const d = bs(px, c.strike, t, rate, sig, c.right === 'C').delta;
      deltaShares += net * d * MULT;
    }
    // Option delta, in shares. Hold the opposite through the book so the stock pays what the option charges.
    const capShares = Math.max(1, Math.floor(8_000_000 / px));
    const target = Math.max(-capShares, Math.min(capShares, -Math.round(deltaShares)));
    let owed = st.borrowed[instr] ?? 0;
    const wantOwed = Math.max(0, -target);
    const held0 = bal(w, MM, instr);
    if (owed > wantOwed && held0 > 0) {
      const back = returnShares(w, MM, instr, Math.min(owed - wantOwed, held0), cause);
      owed -= back;
      if (owed <= 0) delete st.borrowed[instr];
      else st.borrowed[instr] = owed;
    }
    const pos = bal(w, MM, instr) - owed;
    const diff = target - pos;
    if (Math.abs(diff) < 1 || Math.abs(diff) * px < 80_000) continue;
    const clip = Math.max(1, Math.min(Math.abs(diff), Math.floor(600_000 / px)));
    if (diff > 0) {
      const ask = touch(w, instr, 'sell');
      if (!ask) continue;
      const limit = Math.max(1, Math.min(ask, Math.floor(px * 1.015)));
      const qty = Math.min(clip, Math.floor(cashOf(w, MM) / limit));
      if (qty >= 1) st.hedgeOrders.push(submitOrder(w, MM, { instr, side: 'buy', qty, limit }));
    } else {
      const bid = touch(w, instr, 'buy');
      if (!bid) continue;
      const limit = Math.max(Math.ceil(px * 0.982), Math.min(bid, px));
      let qty = Math.min(clip, bal(w, MM, instr));
      if (qty >= 1) st.hedgeOrders.push(submitOrder(w, MM, { instr, side: 'sell', qty, limit }));
      qty = clip - qty;
      if (qty >= 1) {
        const got = borrowShares(w, MM, instr, qty, cause);
        if (got >= 1) {
          st.borrowed[instr] = owed + got;
          st.hedgeOrders.push(submitOrder(w, MM, { instr, side: 'sell', qty: got, limit }));
        }
      }
    }
  }
}

function payBack(w: World, from: string, to: string, cents: number, cause: number): void {
  const a = Math.min(Math.round(cents), cashOf(w, from));
  if (a > 0 && !pay(w, from, to, a, 'opt.exercise', cause)) throw new Error('exercise undo failed');
}

function cashSettle(w: World, from: string, to: string, cents: number, cause: number): void {
  const need = Math.max(0, Math.round(cents));
  if (need < 1 || from === to) return;
  if (cashOf(w, from) < need) releaseMargin(w, from, need - cashOf(w, from), cause);
  const a = Math.min(need, cashOf(w, from));
  if (a > 0) pay(w, from, to, a, 'opt.exercise', cause);
}

function shareSeller(w: World, instr: string, qty: number, skip: string[]): string | undefined {
  let best: string | undefined;
  let n = 0;
  for (const [id, v0] of w.ledger.holders(instr)) {
    const have = Math.floor(v0);
    if (have < qty || skip.includes(id)) continue;
    if (have > n) { n = have; best = id; }
  }
  return best;
}

/** In the money: shares and cash move at the strike when the writer can deliver, otherwise the intrinsic is paid in cash. */
function exerciseCall(w: World, long: string, short: string, c: Contract, qty: number, cause: number): void {
  const spot = Math.max(1, Math.round(spotOf(w, c.instr)));
  const shares = qty * MULT;
  const billS = spot * shares;
  const billK = c.strike * shares;
  if (bal(w, short, c.instr) >= shares) {
    const buyers = [MM, 'fund_mm', 'fund_value', 'fund_value_2', 'fund_mom'];
    for (const b of buyers) {
      if (b === short || b === long || !w.ledger.actors.has(b) || cashOf(w, b) < billS) continue;
      if (cashOf(w, long) + billS < billK) continue;
      if (!pay(w, b, long, billS, 'opt.exercise', cause)) continue;
      if (!pay(w, long, short, billK, 'opt.exercise', cause)) { payBack(w, long, b, billS, cause); continue; }
      if (!w.ledger.move(c.instr, short, b, shares, 'opt.exercise', cause)) {
        payBack(w, short, long, billK, cause);
        payBack(w, long, b, billS, cause);
        continue;
      }
      return;
    }
  }
  cashSettle(w, short, long, (spot - c.strike) * shares, cause);
}

function exercisePut(w: World, long: string, short: string, c: Contract, qty: number, cause: number): void {
  const spot = Math.max(1, Math.round(spotOf(w, c.instr)));
  const shares = qty * MULT;
  const billK = c.strike * shares;
  const billS = spot * shares;
  if (cashOf(w, short) < billK) releaseMargin(w, short, billK - cashOf(w, short), cause);
  if (cashOf(w, short) >= billK) {
    if (bal(w, long, c.instr) >= shares) {
      if (pay(w, short, long, billK, 'opt.exercise', cause)) {
        if (w.ledger.move(c.instr, long, short, shares, 'opt.exercise', cause)) return;
        payBack(w, long, short, billK, cause);
      }
    } else {
      const holder = shareSeller(w, c.instr, shares, [long, short]);
      if (holder && pay(w, short, long, billK, 'opt.exercise', cause)) {
        if (cashOf(w, long) >= billS && pay(w, long, holder, billS, 'opt.exercise', cause)) {
          if (w.ledger.move(c.instr, holder, long, shares, 'opt.exercise', cause)
            && w.ledger.move(c.instr, long, short, shares, 'opt.exercise', cause)) return;
          if (bal(w, long, c.instr) >= shares) w.ledger.move(c.instr, long, holder, shares, 'opt.undo', cause);
          payBack(w, holder, long, billS, cause);
        }
        payBack(w, long, short, billK, cause);
      }
    }
  }
  cashSettle(w, short, long, (c.strike - spot) * shares, cause);
}

function holdersOf(w: World, instr: string): { id: string; n: number }[] {
  const out: { id: string; n: number }[] = [];
  for (const [id, v] of w.ledger.holders(instr)) {
    const n = Math.round(v);
    if (n >= 1) out.push({ id, n });
  }
  return out;
}

function flatten(w: World, c: Contract, cause: number): void {
  for (const h of holdersOf(w, c.longId)) {
    if (!w.ledger.redeem(c.longId, h.id, h.n, 'opt.expiry', cause)) throw new Error(`flatten long ${c.longId}`);
  }
  for (const h of holdersOf(w, c.shortId)) {
    if (!w.ledger.redeem(c.shortId, h.id, h.n, 'opt.expiry', cause)) throw new Error(`flatten short ${c.shortId}`);
  }
}

function expireOne(w: World, c: Contract, cause: number): void {
  if (!c.live) return;
  const spot = spotOf(w, c.instr);
  const intr = intrinsic(c.right, spot, c.strike);
  if (intr > 0 && spot > 0) {
    const longs = holdersOf(w, c.longId);
    const shorts = holdersOf(w, c.shortId);
    let i = 0, j = 0, li = longs[0]?.n ?? 0, sj = shorts[0]?.n ?? 0;
    let guard = 0;
    while (i < longs.length && j < shorts.length && guard++ < 10000) {
      if (li < 1) { i++; li = longs[i]?.n ?? 0; continue; }
      if (sj < 1) { j++; sj = shorts[j]?.n ?? 0; continue; }
      const q = Math.min(li, sj);
      if (c.right === 'C') exerciseCall(w, longs[i].id, shorts[j].id, c, q, cause);
      else exercisePut(w, longs[i].id, shorts[j].id, c, q, cause);
      li -= q;
      sj -= q;
    }
  }
  flatten(w, c, cause);
  c.live = false;
  c.mid = 0;
  c.bid = 0;
  c.ask = 0;
  c.last = 0;
  c.vol = 0;
}

function relist(w: World, c: Contract, stock: StockPeek, expMonth: number): void {
  const ks = strikesFor(Math.max(1, Math.round(spotOf(w, stock.instr))));
  c.instr = stock.instr;
  c.issuer = stock.issuer;
  c.strike = ks[c.k];
  c.expMonth = expMonth;
  c.live = true;
  c.mid = 0;
  c.bid = 0;
  c.ask = 0;
  c.last = 0;
  c.vol = 0;
}

function roll(w: World): void {
  const st = stOf(w);
  const names = rank(w);
  if (!names.length) return;
  for (const c of st.contracts) {
    if (c.live) continue;
    if (issued(w, c.longId) !== 0 || issued(w, c.shortId) !== 0) throw new Error(`open interest left on ${c.longId}`);
    const stock = names[c.u % names.length];
    relist(w, c, stock, w.month + N_EXP);
  }
}

function wipePair(w: World, actor: string, c: Contract, cause: number): void {
  const short = bal(w, actor, c.shortId);
  const long = bal(w, actor, c.longId);
  if (short > 0) {
    let left = short;
    if (!w.ledger.redeem(c.shortId, actor, short, 'opt.margin', cause)) throw new Error(`wipe short ${c.shortId}`);
    for (const h of holdersOf(w, c.longId)) {
      if (left < 1) break;
      const q = Math.min(left, h.n);
      if (q > 0 && w.ledger.redeem(c.longId, h.id, q, 'opt.margin', cause)) left -= q;
    }
    if (left > 0) throw new Error(`wipe left shorts on ${c.shortId}`);
  }
  if (long > 0) {
    let left = long;
    if (!w.ledger.redeem(c.longId, actor, long, 'opt.margin', cause)) throw new Error(`wipe long ${c.longId}`);
    for (const h of holdersOf(w, c.shortId)) {
      if (left < 1) break;
      const q = Math.min(left, h.n);
      if (q > 0 && w.ledger.redeem(c.shortId, h.id, q, 'opt.margin', cause)) left -= q;
    }
    if (left > 0) throw new Error(`wipe left longs on ${c.longId}`);
  }
}

function closeActor(w: World, actor: string, cause: number, marginCall: boolean): void {
  const st = stOf(w);
  if (marginCall) {
    w.events.emit('opt.marginCall', `${actor} could not meet an option margin call and was closed out`, [cause], actor);
    st.yCalls++;
  }
  releaseMargin(w, actor, marginOf(w, actor), cause);
  for (const c of st.contracts) {
    if (!c.live) continue;
    const net = netOf(w, actor, c);
    if (net === 0) continue;
    const px = Math.max(1, Math.round(c.mid) || Math.round(c.last) || 1);
    if (net > 0) trade(w, MM, actor, c, net, px, cause);
    else trade(w, actor, MM, c, -net, px, cause);
    if (netOf(w, actor, c) !== 0) wipePair(w, actor, c, cause);
  }
  releaseMargin(w, actor, marginOf(w, actor), cause);
}

function settleMargins(w: World, cause: number): void {
  const st = stOf(w);
  const gone: string[] = [];
  for (const id of st.roster) {
    if (id === MM) {
      const need = requirement(w, MM);
      const have = marginOf(w, MM);
      if (have > need) releaseMargin(w, MM, have - need, cause);
      else cover(w, MM, cause);
      continue;
    }
    if (dead(w, id)) { closeActor(w, id, cause, false); gone.push(id); continue; }
    const need = requirement(w, id);
    const have = marginOf(w, id);
    if (need <= 0) {
      if (have > 0) releaseMargin(w, id, have, cause);
      continue;
    }
    if (have > need) releaseMargin(w, id, have - need, cause);
    const maint = Math.round(need * 0.72);
    if (!cover(w, id, cause) || marginOf(w, id) < maint) closeActor(w, id, cause, true);
  }
  if (gone.length) st.roster = st.roster.filter((id) => !gone.includes(id));
}

function markIv(w: World): void {
  const st = stOf(w);
  const rate = econ(w).policyRate;
  let wsum = 0, ww = 0, qsum = 0, qn = 0;
  for (const c of st.contracts) {
    if (!c.live) continue;
    const spot = spotOf(w, c.instr);
    if (spot < 1) continue;
    const t = yearFrac(w, c.expMonth);
    const call = c.right === 'C';
    if (c.vol > 0 && c.last > intrinsic(c.right, spot, c.strike)) {
      const iv = implied(spot, c.strike, t, rate, c.last, call);
      wsum += iv * c.vol;
      ww += c.vol;
    }
    if (Math.abs(c.strike / spot - 1) < 0.08 && c.mid > 0) {
      qsum += implied(spot, c.strike, t, rate, c.mid, call);
      qn++;
    }
    c.vol = 0;
  }
  const day = ww > 0 ? wsum / ww : qn > 0 ? qsum / qn : st.iv || 0.22;
  st.iv = day;
  st.yIv += day;
  st.yIvN++;
}

function capitalise(w: World, id: string, slice: number): void {
  const s = econ(w);
  const L = w.ledger;
  L.addActor(id, 'fund');
  L.define({ id: 'eq:' + id, kind: 'share', issuer: id });
  const base = s.investors.map((h) => cashOf(w, h.id));
  const paid: { id: string; cents: number }[] = [];
  for (let i = 0; i < s.investors.length; i++) {
    const cents = Math.floor(base[i] * slice);
    if (cents > 0 && pay(w, s.investors[i].id, id, cents, 'genesis.equity', w.genesis)) paid.push({ id: s.investors[i].id, cents });
  }
  const total = paid.reduce((a, p) => a + p.cents, 0);
  let left = SHARES;
  for (let i = 0; i < paid.length; i++) {
    const sh = i === paid.length - 1 ? left : (total > 0 ? Math.round(SHARES * paid[i].cents / total) : 0);
    left -= sh;
    if (sh > 0) L.issue('eq:' + id, paid[i].id, sh, 'genesis.equity', w.genesis);
  }
}

function wealth(w: World): number {
  const st = stOf(w);
  let v = cashOf(w, MM) + marginOf(w, MM);
  const seen: string[] = [];
  for (const c of st.contracts) if (!seen.includes(c.instr)) seen.push(c.instr);
  for (const instr of seen) {
    const px = spotOf(w, instr);
    v += bal(w, MM, instr) * px;
    v -= (st.borrowed[instr] ?? 0) * px;
  }
  for (const c of st.contracts) {
    if (!c.live) continue;
    v += netOf(w, MM, c) * c.mid * MULT;
  }
  return Math.round(v);
}

function blank(): OptState {
  return {
    off: true, contracts: [], roster: [], borrowed: {}, hedgeOrders: [], insiderAt: {},
    root: 0, mm0: 0, yVol: 0, yCalls: 0, yIv: 0, yIvN: 0, iv: 0.22,
  };
}

export const options: Module = {
  id: 'options',

  init(w) {
    if (!w.state.markets) { w.state.options = blank(); return; }
    const L = w.ledger;
    L.addActor(EX, 'exchange');
    L.define({ id: MARGIN, kind: 'claim', issuer: EX });
    capitalise(w, MM, 0.05);
    const names = rank(w);
    const contracts: Contract[] = [];
    let slot = 0;
    for (let u = 0; u < names.length; u++) {
      const stock = names[u];
      const ks = strikesFor(Math.max(1, Math.round(spotOf(w, stock.instr))));
      for (let e = 0; e < N_EXP; e++) {
        for (let k = 0; k < N_K; k++) {
          for (const right of ['C', 'P'] as const) {
            const longId = `optL:${slot}`, shortId = `optS:${slot}`;
            L.define({ id: longId, kind: 'share', issuer: EX });
            L.define({ id: shortId, kind: 'share', issuer: EX });
            contracts.push({
              u, k, instr: stock.instr, issuer: stock.issuer, right, strike: ks[k], expMonth: e,
              longId, shortId, mid: 0, bid: 0, ask: 0, last: 0, vol: 0, live: true,
            });
            slot++;
          }
        }
      }
    }
    const st: OptState = {
      off: false, contracts, roster: [MM], borrowed: {}, hedgeOrders: [], insiderAt: {},
      root: 0, mm0: 0, yVol: 0, yCalls: 0, yIv: 0, yIvN: 0, iv: 0.22,
    };
    w.state.options = st;
    st.root = w.events.emit('opt.open', 'calls and puts listed on the most traded stocks', [w.genesis], EX);
    quotes(w);
    st.mm0 = wealth(w);
    const bad = L.check();
    if (bad.length) throw new Error(`books failed at the option open: ${bad.slice(0, 5).join('; ')}`);
  },

  dayClose(w) {
    const st = stOf(w);
    if (st.off) return;
    absorbHaircut(w, st.root);
    const cause = st.root;
    if ((w.day + 1) % DAYS_PER_MONTH === 0) {
      for (const c of st.contracts) if (c.live && c.expMonth === w.month) expireOne(w, c, cause);
    }
    quotes(w);
    settleMargins(w, cause);
    fundTrades(w, cause);
    specTrades(w, rumourIssuers(w), cause);
    insiderTrades(w, cause);
    settleMargins(w, cause);
    hedge(w, cause);
    markIv(w);
    assertBook(w);
  },

  monthEnd(w) {
    const st = stOf(w);
    if (st.off) return;
    roll(w);
    quotes(w);
    assertBook(w);
  },

  stats(w) {
    const st = stOf(w);
    if (st.off) return {};
    let oi = 0;
    for (const c of st.contracts) if (c.live) oi += issued(w, c.longId);
    const out = {
      oi,
      optVol: st.yVol,
      mmPL: Math.round((wealth(w) - st.mm0) / 100),
      iv: +((st.yIvN ? st.yIv / st.yIvN : st.iv) * 100).toFixed(1),
      optCalls: st.yCalls,
    };
    st.yVol = 0;
    st.yCalls = 0;
    st.yIv = 0;
    st.yIvN = 0;
    return out;
  },
};
