// Shared reads for the funds. Money moves through the ledger; orders go through the markets.
import { type World } from '../../kernel/index.ts';
import { DEP, GOV, pay, type EconState, type Firm } from '../economy/index.ts';
import { cancelOrder, submitOrder } from '../markets/index.ts';

export type Strat = 'momentum' | 'value' | 'macro' | 'quant' | 'short' | 'activist';
export type Demand = 'dividend' | 'sale' | 'ceo';

export interface Ticket { id: number; day: number }
export interface Borrow {
  instr: string; issuer: string; qty: number; entry: number; sold: number;
  report: number; deny: number; cover: number; squeeze: number; since: number; wrong: number;
}
export interface Camp {
  issuer: string; instr: string; firm: number; demand: Demand;
  phase: number; stakeEv: number; campEv: number; day: number;
}
export interface Pend { issuer: string; kind: Demand; ev: number; day: number; firm: number }
export interface Fund {
  id: string; name: string; strat: Strat; manager: number; hiredEv: number; hiredDay: number;
  down: number; year0: number; nav: number; peak: number; yBps: number;
  wind: number; cool: number; need: number; pushed: number; flowEv: number;
  orders: Ticket[]; force: Ticket[]; borrowed: Borrow[];
  camp: Camp | null; pend: Pend | null; note: string; lever: number;
}
export interface FundsState {
  funds: Fund[]; root: number; yCamp: number; yBlow: number; yRep: number; shortHi: number; reported: string[];
}

export interface Stock {
  instr: string; issuer: string; last: number; prev: number; rets: number[];
  profitEma: number; divEma: number;
}
interface BondRow { id: string; tenor: string; last: number; faceLeft: number }
interface BondOrder { actor: string; instr: string; open: boolean; side: string }

export const LABEL: Record<Strat, string> = {
  momentum: 'Momentum', value: 'Value', macro: 'Macro', quant: 'Quant', short: 'Short', activist: 'Activist',
};
const MARGIN = 'cmdty:margin';
const LOT = 16_000;

export const econ = (w: World): EconState => w.state.economy as EconState;
export const fundsOf = (w: World): FundsState => w.state.funds as FundsState;

export function cashOf(w: World, id: string): number { return Math.floor(w.ledger.balance(id, DEP)); }

export function stocksOf(w: World): Stock[] {
  return (w.state.markets as { stocks?: Stock[] } | undefined)?.stocks ?? [];
}
export function stockOf(w: World, instr: string): Stock | undefined {
  for (const st of stocksOf(w)) if (st.instr === instr) return st;
  return undefined;
}
export function stockByIssuer(w: World, issuer: string): Stock | undefined {
  for (const st of stocksOf(w)) if (st.issuer === issuer) return st;
  return undefined;
}
export function firmOf(w: World, issuer: string): Firm | undefined {
  if (issuer === 'bank_1') return undefined;
  for (const f of econ(w).firms) if (f.id === issuer) return f;
  return undefined;
}
export function sharesOut(w: World, instr: string): number {
  return Math.max(1, Math.round(w.ledger.issued.get(instr) ?? 0));
}
export function held(w: World, actor: string, instr: string): number {
  return Math.floor(w.ledger.balance(actor, instr));
}

export function nerve(w: World, f: Fund): number {
  const P = econ(w).P, i = f.manager;
  if (i < 0 || i >= P.n || !P.alive(i)) return 1;
  const g = P.greed[i] / 100, d = P.diligence[i] / 100, a = P.anxiety[i] / 100;
  return Math.max(0.55, Math.min(1.4, 0.8 + 0.55 * g - 0.2 * d - 0.25 * a));
}
/** Diligence raises the bar for a trade. */
export function care(w: World, f: Fund): number {
  const P = econ(w).P, i = f.manager;
  if (i < 0 || i >= P.n) return 1;
  return 0.75 + 0.5 * (P.diligence[i] / 100);
}

function jitter(w: World, f: Fund, qty: number): number {
  if (qty < 1) return 0;
  const n = 0.85 + 0.3 * w.rng('funds:' + f.id).next();
  return Math.max(1, Math.round(qty * n));
}

export function dropOrders(w: World, f: Fund): void {
  for (const o of f.orders) cancelOrder(w, f.id, o.id);
  f.orders = [];
}
export function dropForce(w: World, f: Fund): void {
  for (const o of f.force) cancelOrder(w, f.id, o.id);
  f.force = [];
}

/** Rest a stock order inside the day's price band. `lane` keeps a forced sale from being pulled by the next rebalance. */
export function placeEq(w: World, f: Fund, instr: string, side: 'buy' | 'sell', qty: number, thru: number, lane: 'rest' | 'force'): number {
  const st = stockOf(w, instr);
  if (!st || st.last < 1) return 0;
  const firm = firmOf(w, st.issuer);
  if (firm?.closed) return 0;
  const px = Math.max(1, Math.round(st.last * (side === 'buy' ? 1 + thru : 1 - thru)));
  const room = side === 'buy' ? Math.floor(cashOf(w, f.id) / px) : held(w, f.id, instr);
  let q = Math.min(Math.round(qty), room);
  if (lane === 'rest') q = Math.round(q * nerve(w, f));
  if (q < 1) return 0;
  if (lane === 'rest') q = jitter(w, f, q);
  if (q < 1 || q > room) q = Math.min(q, room);
  if (q < 1) return 0;
  const id = submitOrder(w, f.id, { instr, side, qty: q, limit: px });
  const ticket = { id, day: w.day };
  if (lane === 'force') f.force.push(ticket); else f.orders.push(ticket);
  return q;
}

export function bookPerShare(w: World, issuer: string, instr: string): number {
  const s = econ(w);
  const sh = sharesOut(w, instr);
  const px = (id: string): number => {
    if (!id.startsWith('good:')) return 0;
    const good = id.slice(5);
    let n = 0, p = 0;
    for (const f of s.firms) if (f.good === good && !f.closed) { p += f.price; n++; }
    return n ? p / n : 0;
  };
  const nw = w.ledger.netWorth(issuer, px);
  return Math.max(1, Math.round(nw / sh));
}

export function navOf(w: World, f: Fund): number {
  let v = cashOf(w, f.id) + Math.round(w.ledger.balance(f.id, MARGIN));
  for (const st of stocksOf(w)) {
    const q = held(w, f.id, st.instr);
    if (q) v += q * st.last;
  }
  for (const b of f.borrowed) {
    const st = stockOf(w, b.instr);
    if (st && b.qty > 0) v -= b.qty * st.last;
  }
  const bonds = (w.state.bonds as { bonds?: BondRow[] } | undefined)?.bonds ?? [];
  for (const b of bonds) {
    const face = w.ledger.balance(f.id, b.id);
    if (face >= LOT && b.last > 0) v += Math.round(face / LOT * b.last);
  }
  return Math.round(v);
}

export function whyFirm(w: World, issuer: string): number[] {
  const s = econ(w), f = firmOf(w, issuer);
  const own: number[] = [];
  for (const id of [f?.priceEv, f?.ceoEv, f?.stockoutEv, f?.layoffEv]) {
    if (id !== undefined && id >= 0 && !own.includes(id)) own.push(id);
  }
  if (own.length) return own.slice(0, 2);
  if (s.macroEv >= 0) return [s.macroEv];
  const root = fundsOf(w).root;
  return [root >= 0 ? root : w.genesis];
}

export function bondsOf(w: World): BondRow[] {
  return (w.state.bonds as { bonds?: BondRow[] } | undefined)?.bonds ?? [];
}
export function bondOpen(w: World, actor: string, instr: string): boolean {
  const orders = (w.state.bonds as { orders?: BondOrder[] } | undefined)?.orders ?? [];
  for (const o of orders) if (o.open && o.actor === actor && o.instr === instr) return true;
  return false;
}

/** Withhold dividend tax the way a fund distribution to a person already does. */
export function withhold(w: World, holder: string, gross: number, cause: number): void {
  if (!holder.startsWith('p_')) return;
  const s = econ(w), i = +holder.slice(2);
  if (!(i >= 0 && i < s.P.n)) return;
  const t = Math.floor(gross * (s.divRate ?? 0.35));
  if (t > 0 && pay(w, holder, GOV, t, 'tax.dividend', cause)) {
    s.divTax += t;
    s.P.incWeek[i] += gross - t;
  } else s.P.incWeek[i] += gross;
}

export function driftOf(st: Stock): number {
  const r = st.rets;
  if (!r || r.length < 4) return 0;
  let s = 0;
  for (let i = Math.max(0, r.length - 8); i < r.length; i++) s += r[i];
  return s;
}

export function managers(w: World): Set<number> {
  const taken = new Set<number>();
  for (const f of fundsOf(w).funds) if (f.manager >= 0) taken.add(f.manager);
  return taken;
}
