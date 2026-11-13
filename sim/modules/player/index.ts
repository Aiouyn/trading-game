// The player is one person in the same arrays as everyone else. They see only what they
// know, and every order, loan and futures fill goes through the modules that already book it.
import { DAYS_PER_YEAR, type Module, type World } from '../../kernel/index.ts';
import { borrowMargin, depositSight, repayPerson, withdrawSight } from '../banking/index.ts';
import { LOT, submitBondOrder } from '../bonds/index.ts';
import { tradeFuture } from '../commodities/index.ts';
import { launchCoin, orderCoin } from '../crypto/index.ts';
import { BANK, DEP, pay, type EconState, type Firm } from '../economy/index.ts';
import { joinFirm } from '../economy/people.ts';
import { borrowShares, cancelOrder, returnShares, submitOrder } from '../markets/index.ts';
import { askFirm, contactsOf, knows, seatPerson, talk } from '../social/index.ts';

export const PLAYER = 8;

export interface Heard { factId: number; eventId: number; from: number; day: number }
export interface ScorePoint { day: number; worth: number }
interface StockLoan { instr: string; qty: number; claim: string; face: number }

export interface PlayerState {
  who: number;
  over: boolean;
  margin: boolean;
  arrived: number;
  heard: Heard[];
  score: ScorePoint[];
  loans: StockLoan[];
}

export type Command =
  | { kind: 'order'; side: 'buy' | 'sell' | 'short'; instr: string; qty: number; limit?: number }
  | { kind: 'cancel'; orderId: number }
  | { kind: 'bond'; side: 'buy' | 'sell'; tenor: string; bonds: number; limit?: number }
  | { kind: 'fut'; side: 'long' | 'short' | 'flat'; good: string; qty: number; months: number }
  | { kind: 'coin'; side: 'buy' | 'sell'; coin: string; qty: number; limit?: number }
  | { kind: 'launch' }
  | { kind: 'cash'; op: 'deposit' | 'withdraw' | 'borrow' | 'repay'; cents: number }
  | { kind: 'talk'; slot: number }
  | { kind: 'ask'; slot: number; firm: string }
  | { kind: 'news' }
  | { kind: 'why'; id: number }
  | { kind: 'wait'; days: number };

export interface ActResult {
  status: 'accepted' | 'rejected';
  why?: string;
  orderId?: number;
  fill?: number;
  eventId?: number;
  text?: string;
  days?: number;
  lines?: string[];
}

interface Quote { instr: string; px: number; eventId: number }
interface Line { eventId: number; day: number; text: string }
interface Priv { eventId: number; factId: number; day: number; from: string; text: string }

export interface PlayerView {
  date: { year: number; month: number; day: number; abs: number };
  name: string;
  age: number;
  alive: boolean;
  over: boolean;
  employer: string;
  firm: string;
  netWorth: number;
  cash: number;
  deposits: { bank: string; cents: number; eventId: number }[];
  loans: { kind: string; owed: number; rate: number; eventId: number }[];
  shares: { instr: string; qty: number; px: number; eventId: number }[];
  futures: { good: string; monthsAhead: number; net: number; px: number; eventId: number }[];
  coins: { id: string; name: string; qty: number; px: number; eventId: number }[];
  bonds: { instr: string; face: number; eventId: number }[];
  marginPosted: number;
  stockLoans: { instr: string; qty: number; face: number; eventId: number }[];
  orders: { id: number; book: string; instr: string; side: string; qty: number; limit: number | null; eventId: number }[];
  contacts: { slot: number; name: string; trust: number; kind: string }[];
  prices: Quote[];
  news: Line[];
  private: Priv[];
  score: ScorePoint[];
}

const FUTURES: Record<string, string> = {
  OIL: 'CRUDE_OIL', CRUDE: 'CRUDE_OIL', CRUDE_OIL: 'CRUDE_OIL',
  GAS: 'NATURAL_GAS', NATURAL_GAS: 'NATURAL_GAS',
  COAL: 'COAL', IRON: 'IRON_ORE', IRON_ORE: 'IRON_ORE',
  COPPER: 'COPPER', LITHIUM: 'LITHIUM', GRAIN: 'GRAIN',
  LIVESTOCK: 'LIVESTOCK', CATTLE: 'LIVESTOCK',
};

const econ = (w: World): EconState => w.state.economy as EconState;
const blank = (): PlayerState => ({ who: -1, over: false, margin: false, arrived: -1, heard: [], score: [], loans: [] });
const stOf = (w: World): PlayerState => {
  let st = w.state.player as PlayerState | undefined;
  if (!st) { st = blank(); w.state.player = st; }
  return st;
};
const rejected = (why: string): ActResult => ({ status: 'rejected', why });
const whyOf = (e: unknown): string => e instanceof Error ? e.message : String(e);

export function playerIndex(w: World): number {
  const P = econ(w).P;
  const st = w.state.player as PlayerState | undefined;
  if (st && st.who >= 0 && st.who < P.n && (P.flags[st.who] & PLAYER) !== 0) return st.who;
  for (let i = 0; i < P.n; i++) if ((P.flags[i] & PLAYER) !== 0) {
    if (st) st.who = i;
    return i;
  }
  return -1;
}

function chooseFirm(w: World): Firm {
  const s = econ(w);
  const need = (w.state.social as { need?: number } | undefined)?.need ?? Math.ceil(s.P.n * 0.01);
  let best: Firm | undefined;
  for (const f of s.firms) {
    const n = f.staff.length;
    if (n < 16 || n + 1 >= need) continue;
    if (!best || n < best.staff.length) best = f;
  }
  if (best) return best;
  for (const f of s.firms) if (f.staff.length >= 16 && (!best || f.staff.length < best.staff.length)) best = f;
  return best ?? s.firms[0];
}

function parentsOf(P: EconState['P'], born: number): [number, number] {
  for (let a = 0; a < P.n; a++) {
    const b = P.spouse[a];
    if (b <= a || !P.alive(a) || !P.alive(b)) continue;
    const gap = (born - Math.max(P.born[a], P.born[b])) / DAYS_PER_YEAR;
    if (gap < 20 || gap > 45) continue;
    return P.born[a] <= P.born[b] ? [a, b] : [b, a];
  }
  return [-1, -1];
}

function spawn(w: World): number {
  const s = econ(w), P = s.P, st = stOf(w);
  const born = w.day - 30 * DAYS_PER_YEAR;
  const [mom, dad] = parentsOf(P, born);
  const i = P.add(w, born, mom, dad);
  P.flags[i] |= PLAYER;
  const firm = chooseFirm(w);
  joinFirm(s, i, firm);
  // Newest staff are laid off first. A person who just sat down should not be the first out the door.
  const staff = firm.staff;
  const at = staff.indexOf(i);
  if (at > 0) {
    staff.splice(at, 1);
    staff.splice(Math.min(1, staff.length), 0, i);
    for (let k = 0; k < staff.length; k++) P.staffPos[staff[k]] = k;
  }
  if (P.adult(w, i)) s.laborForce++;
  const ev = w.events.emit('player.arrive', `${P.name(i)} arrives, aged 30, and takes a job at ${firm.name}`, [s.macroEv], P.id(i));
  const cents = Math.round(s.wage * 1500);
  if (!pay(w, BANK, P.id(i), cents, 'player.endowment', ev)) throw new Error('player endowment failed');
  P.incEma[i] = s.wage * P.skill[i] * (1 - s.taxRate);
  P.lastEv[i] = ev;
  seatPerson(w, i, 16);
  st.who = i;
  st.over = false;
  st.arrived = ev;
  st.score.push({ day: w.day, worth: Math.round(worth(w, i)) });
  return i;
}

export function ensurePlayer(w: World): number {
  const have = playerIndex(w);
  if (have >= 0) return have;
  return spawn(w);
}

function markPrice(w: World): (instr: string) => number {
  const stocks = (w.state.markets as { stocks?: { instr: string; last: number }[]; price?: (instr: string) => number } | undefined);
  const crypto = w.state.crypto as { majors?: { id: string; last: number }[]; memes?: { id: string; pool: string; rugged: boolean }[] } | undefined;
  return (instr: string): number => {
    const hit = stocks?.stocks?.find((s) => s.instr === instr);
    if (hit) return hit.last;
    if (instr.startsWith('eq:') && stocks?.price) {
      const px = stocks.price(instr);
      if (px > 0) return px;
    }
    const major = crypto?.majors?.find((m) => m.id === instr);
    if (major) return major.last;
    const meme = crypto?.memes?.find((m) => m.id === instr);
    if (meme && !meme.rugged) {
      const tok = w.ledger.balance(meme.pool, meme.id);
      if (tok > 0) return w.ledger.balance(meme.pool, DEP) / tok;
    }
    return 0;
  };
}

function worth(w: World, i: number): number {
  return w.ledger.netWorth(econ(w).P.id(i), markPrice(w));
}

function chronicle(w: World, i: number, text: string, cause: number): void {
  const h = w.state.history as { entries?: { year: number; day: number; kind: string; people: string[]; firms: string[]; text: string; cause: string }[] } | undefined;
  if (!h?.entries || cause < 0) return;
  const P = econ(w).P;
  const e = P.employer[i];
  const firm = e >= 0 ? econ(w).firms[e]?.name : '';
  const sentence = /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
  h.entries.push({
    year: Math.floor(w.day / DAYS_PER_YEAR) + 1,
    day: w.day,
    kind: 'player',
    people: [P.name(i)],
    firms: firm ? [firm] : [],
    text: sentence,
    cause: w.events.explain(cause, 6).join('\n'),
  });
}

function stockInstr(w: World, sym: string): string | undefined {
  const stocks = (w.state.markets as { stocks?: { instr: string }[] } | undefined)?.stocks ?? [];
  const k = sym.toLowerCase();
  for (const s of stocks) if (s.instr.toLowerCase() === k || s.instr.slice(3).toLowerCase() === k) return s.instr;
  for (const f of econ(w).firms) {
    const bare = f.id.startsWith('frm_') ? f.id.slice(4) : f.id;
    if (f.id.toLowerCase() === k || bare === k || f.name.toLowerCase() === k) return 'eq:' + f.id;
  }
  if (k === 'bank' || k === 'bank_1') return 'eq:bank_1';
  return undefined;
}

function onRun(w: World, tenor: string): { id: string; last: number; issueEv: number } | undefined {
  const bonds = (w.state.bonds as { bonds?: { id: string; tenor: string; onRun: boolean; faceLeft: number; last: number; issueEv: number }[] } | undefined)?.bonds ?? [];
  if (tenor.startsWith('bond:')) return bonds.find((b) => b.id === tenor && b.faceLeft > 0);
  let hit: { id: string; last: number; issueEv: number } | undefined;
  for (const b of bonds) if (b.onRun && b.faceLeft > 0 && b.tenor === tenor) hit = b;
  return hit;
}

function me(w: World): { st: PlayerState; i: number; id: string } | ActResult {
  const st = stOf(w);
  const i = playerIndex(w);
  if (i < 0) return rejected('no player');
  return { st, i, id: econ(w).P.id(i) };
}
function isMe(x: { st: PlayerState; i: number; id: string } | ActResult): x is { st: PlayerState; i: number; id: string } {
  return 'id' in x;
}

function shortSell(w: World, st: PlayerState, id: string, instr: string, qty: number, limit: number | undefined): ActResult {
  if (!st.margin) return rejected('short selling needs a margin account at a bank');
  const stock = (w.state.markets as { stocks: { instr: string; last: number }[] }).stocks.find((s) => s.instr === instr);
  if (!stock) return rejected(`not listed ${instr}`);
  const cause = st.arrived >= 0 ? st.arrived : econ(w).macroEv;
  const got = borrowShares(w, id, instr, qty, cause);
  if (got < 1) return rejected('the market maker cannot lend those shares');
  const face = got * stock.last;
  const claim = `stkln:${id}:${instr}`;
  if (!w.ledger.instruments.has(claim)) w.ledger.define({ id: claim, kind: 'claim', issuer: id });
  w.ledger.issue(claim, 'fund_mm', face, 'mkt.borrow', cause);
  try {
    const orderId = submitOrder(w, id, { instr, side: 'sell', qty: got, limit });
    st.loans.push({ instr, qty: got, claim, face });
    return { status: 'accepted', orderId, fill: got, eventId: cause, text: `borrowed ${got} ${instr} and offered them` };
  } catch (e) {
    w.ledger.redeem(claim, 'fund_mm', face, 'mkt.borrow', cause);
    returnShares(w, id, instr, got, cause);
    return rejected(whyOf(e));
  }
}

export function act(w: World, cmd: Command): ActResult {
  const who = me(w);
  if (!isMe(who)) return who;
  const { st, i, id } = who;
  const P = econ(w).P;
  const dead = st.over || !P.alive(i);
  if (dead) {
    st.over = true;
    if (cmd.kind !== 'news' && cmd.kind !== 'why') return rejected('you have died');
  }
  switch (cmd.kind) {
    case 'order': {
      const instr = stockInstr(w, cmd.instr);
      if (!instr) return rejected(`not listed ${cmd.instr}`);
      if (!Number.isSafeInteger(cmd.qty) || cmd.qty < 1) return rejected('qty must be a positive integer');
      if (cmd.side === 'short') return shortSell(w, st, id, instr, cmd.qty, cmd.limit);
      try {
        const orderId = submitOrder(w, id, { instr, side: cmd.side, qty: cmd.qty, limit: cmd.limit });
        return { status: 'accepted', orderId, text: `${cmd.side} ${cmd.qty} ${instr}${cmd.limit ? ` @ ${(cmd.limit / 100).toFixed(2)}` : ''}` };
      } catch (e) { return rejected(whyOf(e)); }
    }
    case 'cancel': {
      if (!cancelOrder(w, id, cmd.orderId)) return rejected('that order is not open');
      return { status: 'accepted', orderId: cmd.orderId, text: `cancelled ${cmd.orderId}` };
    }
    case 'bond': {
      const b = onRun(w, cmd.tenor);
      if (!b) return rejected(`no bond on the run for ${cmd.tenor}`);
      if (!Number.isSafeInteger(cmd.bonds) || cmd.bonds < 1) return rejected('qty is a number of bonds');
      try {
        const orderId = submitBondOrder(w, id, b.id, cmd.side, cmd.bonds * LOT, cmd.limit);
        return { status: 'accepted', orderId, eventId: b.issueEv, text: `${cmd.side} ${cmd.bonds} ${b.id}` };
      } catch (e) { return rejected(whyOf(e)); }
    }
    case 'fut': {
      const good = FUTURES[cmd.good.toUpperCase()] ?? cmd.good.toUpperCase();
      const r = tradeFuture(w, id, good, cmd.months, cmd.qty, cmd.side);
      if (r.why) return rejected(r.why);
      const root = (w.state.commodities as { root?: number } | undefined)?.root ?? st.arrived;
      const word = cmd.side === 'flat' ? 'closed' : cmd.side;
      return { status: 'accepted', fill: r.qty, eventId: root, text: `${word} ${r.qty} ${good} m+${cmd.months} @ ${(r.px / 100).toFixed(2)}, position ${r.net}` };
    }
    case 'coin': {
      const r = orderCoin(w, id, cmd.coin, cmd.side, cmd.qty, cmd.limit);
      if (r.why) return rejected(r.why);
      return { status: 'accepted', orderId: r.orderId, fill: r.fill, text: `${cmd.side} ${cmd.coin}` };
    }
    case 'launch': {
      const r = launchCoin(w, i);
      if (r.why || !r.id) return rejected(r.why ?? 'the launch did not clear');
      return { status: 'accepted', eventId: w.events.last('crypto.launch'), text: `launched ${r.name} (${r.id})` };
    }
    case 'cash': {
      const cause = st.arrived >= 0 ? st.arrived : econ(w).macroEv;
      switch (cmd.op) {
        case 'deposit': {
          const n = depositSight(w, id, cmd.cents, cause);
          if (n < 1) return rejected('nothing to deposit');
          return { status: 'accepted', fill: n, text: `deposited ${(n / 100).toFixed(2)}` };
        }
        case 'withdraw': {
          const n = withdrawSight(w, id, cmd.cents, cause);
          if (n < 1) return rejected('no time deposit to withdraw');
          return { status: 'accepted', fill: n, text: `withdrew ${(n / 100).toFixed(2)}` };
        }
        case 'borrow': {
          const r = borrowMargin(w, i, cmd.cents, cause);
          if (r.taken < 1) return rejected(r.why ?? 'the bank refused the loan');
          st.margin = true;
          return { status: 'accepted', fill: r.taken, eventId: w.events.last('loan.grant'), text: `borrowed ${(r.taken / 100).toFixed(2)} at ${(r.rate * 100).toFixed(2)}%. Margin account open` };
        }
        case 'repay': {
          const n = repayPerson(w, i, cmd.cents, cause);
          if (n < 1) return rejected('nothing repaid');
          return { status: 'accepted', fill: n, text: `repaid ${(n / 100).toFixed(2)}` };
        }
        default: {
          const never: never = cmd.op;
          return never;
        }
      }
    }
    case 'talk': {
      const r = talk(w, i, cmd.slot);
      if (r.who < 0) return rejected(r.why ?? 'nobody there');
      return { status: 'accepted', text: `talked with ${P.name(r.who)}` };
    }
    case 'ask': {
      const firm = cmd.firm || (P.employer[i] >= 0 ? econ(w).firms[P.employer[i]].id : '');
      if (!firm) return rejected('ask needs a firm');
      const r = askFirm(w, i, cmd.slot, firm);
      for (const f of r.facts) if (!st.heard.some((h) => h.factId === f.factId)) st.heard.push({ factId: f.factId, eventId: f.eventId, from: f.from, day: f.day });
      if (!r.facts.length) return rejected(r.why ?? 'they had nothing to add');
      const who = P.name(r.facts[0].from);
      const told = r.facts.map((f) => f.msg).join(' ');
      return { status: 'accepted', eventId: r.facts[0].eventId, fill: r.facts.length, text: `${who} told you: ${told}` };
    }
    case 'news': {
      const lines = view(w).news.map((n) => `[${n.eventId}] day ${n.day}: ${n.text}`);
      return { status: 'accepted', lines, text: lines.length ? `${lines.length} stories` : 'no news' };
    }
    case 'why': {
      const screen = view(w);
      const ids = new Set<number>();
      const take = (id: number | undefined): void => { if (id !== undefined && id >= 0) ids.add(id); };
      for (const x of screen.news) take(x.eventId);
      for (const x of screen.private) take(x.eventId);
      for (const x of screen.prices) take(x.eventId);
      for (const x of screen.orders) take(x.eventId);
      for (const x of screen.shares) take(x.eventId);
      for (const x of screen.loans) take(x.eventId);
      for (const x of screen.deposits) take(x.eventId);
      for (const x of screen.futures) take(x.eventId);
      for (const x of screen.coins) take(x.eventId);
      for (const x of screen.bonds) take(x.eventId);
      take(st.arrived);
      if (!ids.has(cmd.id)) return rejected('you have not seen that');
      const lines = w.events.explain(cmd.id, 8);
      if (!lines.length) return rejected('that event is gone from the log');
      return { status: 'accepted', lines, eventId: cmd.id };
    }
    case 'wait':
      if (!Number.isSafeInteger(cmd.days) || cmd.days < 1) return rejected('wait needs a length of time');
      return { status: 'accepted', days: cmd.days, text: `wait ${cmd.days}d` };
    default: {
      const never: never = cmd;
      return never;
    }
  }
}

interface Fact { id: number; eventId: number; day: number; msg: string; pub: boolean; drop: boolean; firms: number[] }

export function view(w: World): PlayerView {
  const s = econ(w), P = s.P, st = stOf(w);
  const i = playerIndex(w);
  const id = i >= 0 ? P.id(i) : '';
  const price = markPrice(w);
  const abs = w.day;
  const doy = abs % DAYS_PER_YEAR;
  const employer = i >= 0 && P.employer[i] >= 0 ? s.firms[P.employer[i]] : undefined;
  const mktRoot = (w.state.markets as { root?: number } | undefined)?.root ?? w.genesis;
  const futRoot = (w.state.commodities as { root?: number } | undefined)?.root ?? w.genesis;
  const coinRoot = (w.state.crypto as { root?: number } | undefined)?.root ?? w.genesis;
  const arrived = st.arrived >= 0 ? st.arrived : w.genesis;
  const stocks = (w.state.markets as { stocks?: { instr: string; last: number; issuer: string }[] } | undefined)?.stocks ?? [];
  const shares = i < 0 ? [] : stocks.filter((stc) => w.ledger.balance(id, stc.instr) > 0).map((stc) => ({
    instr: stc.instr, qty: w.ledger.balance(id, stc.instr), px: stc.last, eventId: mktRoot,
  }));
  const banks = (w.state.banking as { banks?: { id: string; depo: string }[] } | undefined)?.banks ?? [];
  const deposits = i < 0 ? [] : banks.flatMap((b) => {
    const cents = Math.floor(w.ledger.balance(id, b.depo));
    return cents > 0 ? [{ bank: b.id, cents, eventId: arrived }] : [];
  });
  const book = w.state.banking as { ln: number; lnOpen: Uint8Array; lnPerson: Int32Array; lnKind: Uint8Array; lnRate: Float64Array } | undefined;
  const loans: PlayerView['loans'] = [];
  if (book && i >= 0) for (let k = 0; k < book.ln; k++) {
    if (!book.lnOpen[k] || book.lnPerson[k] !== i) continue;
    const owed = Math.floor(w.ledger.issued.get('pl_' + k) ?? 0);
    if (owed <= 0) continue;
    const kind = book.lnKind[k] === 1 ? 'mortgage' : book.lnKind[k] === 3 ? 'margin' : 'consumer';
    loans.push({ kind, owed, rate: book.lnRate[k], eventId: w.events.last('loan.grant') ?? arrived });
  }
  const cmd = w.state.commodities as { books?: { good: string; tenors: { month: number; longId: string; shortId: string; px: number }[] }[] } | undefined;
  const futures: PlayerView['futures'] = [];
  if (cmd?.books && i >= 0) for (const b of cmd.books) for (const t of b.tenors) {
    const net = Math.round(w.ledger.balance(id, t.longId) - w.ledger.balance(id, t.shortId));
    if (net === 0) continue;
    futures.push({ good: b.good, monthsAhead: t.month - w.month, net, px: t.px, eventId: futRoot });
  }
  const crypto = w.state.crypto as { majors?: { id: string; name: string; last: number }[]; memes?: { id: string; name: string; pool: string; rugged: boolean; launchEv: number }[] } | undefined;
  const coins: PlayerView['coins'] = [];
  if (i >= 0 && crypto?.majors) for (const m of crypto.majors) {
    const qty = Math.floor(w.ledger.balance(id, m.id));
    if (qty > 0) coins.push({ id: m.id, name: m.name, qty, px: m.last, eventId: coinRoot });
  }
  if (i >= 0 && crypto?.memes) for (const m of crypto.memes) {
    const qty = Math.floor(w.ledger.balance(id, m.id));
    if (qty > 0) {
      const tok = w.ledger.balance(m.pool, m.id);
      const px = !m.rugged && tok > 0 ? w.ledger.balance(m.pool, DEP) / tok : 0;
      coins.push({ id: m.id, name: m.name, qty, px, eventId: m.launchEv });
    }
  }
  const orders: PlayerView['orders'] = [];
  const mOrders = (w.state.markets as { orders?: { id: number; actor: string; instr: string; side: string; qty: number; limit: number | null; open: boolean }[] } | undefined)?.orders ?? [];
  for (const o of mOrders) if (o.open && o.actor === id) orders.push({ id: o.id, book: 'shares', instr: o.instr, side: o.side, qty: o.qty, limit: o.limit, eventId: mktRoot });
  const bOrders = (w.state.bonds as { orders?: { id: number; actor: string; instr: string; side: string; qty: number; limit: number | null; open: boolean }[] } | undefined)?.orders ?? [];
  for (const o of bOrders) if (o.open && o.actor === id) orders.push({ id: o.id, book: 'bonds', instr: o.instr, side: o.side, qty: o.qty, limit: o.limit, eventId: arrived });
  const cOrders = (w.state.crypto as { orders?: { id: number; actor: string; instr: string; side: string; qty: number; limit: number; open: boolean }[] } | undefined)?.orders ?? [];
  for (const o of cOrders) if (o.open && o.actor === id) orders.push({ id: o.id, book: 'crypto', instr: o.instr, side: o.side, qty: o.qty, limit: o.limit, eventId: coinRoot });
  const contacts = i < 0 ? [] : contactsOf(w, i).map((c) => ({
    slot: c.slot, name: P.name(c.who), trust: c.trust, kind: c.kind === 1 ? 'family' : 'work',
  }));
  const prices: Quote[] = stocks.map((stc) => ({ instr: stc.instr, px: stc.last, eventId: mktRoot }));
  const bondBook = (w.state.bonds as { bonds?: { id: string; tenor: string; onRun: boolean; faceLeft: number; last: number; issueEv: number }[] } | undefined)?.bonds ?? [];
  const bonds: PlayerView['bonds'] = [];
  for (const b of bondBook) {
    if (b.onRun && b.faceLeft > 0) prices.push({ instr: b.id, px: b.last, eventId: b.issueEv });
    if (i >= 0) {
      const face = Math.floor(w.ledger.balance(id, b.id));
      if (face > 0) bonds.push({ instr: b.id, face, eventId: b.issueEv });
    }
  }
  if (cmd?.books) for (const b of cmd.books) for (const t of b.tenors) if (t.month === w.month) prices.push({ instr: `fut:${b.good}`, px: t.px, eventId: futRoot });
  if (crypto?.majors) for (const m of crypto.majors) prices.push({ instr: m.id, px: m.last, eventId: coinRoot });
  const facts = (w.state.social as { facts?: Fact[] } | undefined)?.facts ?? [];
  const news: Line[] = [];
  if (i >= 0) for (let f = facts.length - 1; f >= 0 && news.length < 8; f--) {
    const fact = facts[f];
    if (!fact || fact.drop || !fact.pub || !knows(w, i, fact.id)) continue;
    news.push({ eventId: fact.eventId, day: fact.day, text: fact.msg });
  }
  news.reverse();
  const priv: Priv[] = [];
  if (i >= 0) for (const h of st.heard) {
    const fact = facts[h.factId];
    if (!fact || fact.drop || fact.pub || !knows(w, i, fact.id)) continue;
    priv.push({ eventId: fact.eventId, factId: fact.id, day: h.day, from: P.name(h.from), text: fact.msg });
  }
  return {
    date: { year: Math.floor(abs / DAYS_PER_YEAR) + 1, month: Math.floor(doy / 30) + 1, day: (doy % 30) + 1, abs },
    name: i >= 0 ? P.name(i) : '',
    age: i >= 0 ? P.age(w, i) : 0,
    alive: i >= 0 && P.alive(i),
    over: st.over || (i >= 0 && !P.alive(i)),
    employer: employer?.name ?? '',
    firm: employer?.id ?? '',
    netWorth: i >= 0 ? Math.round(worth(w, i)) : 0,
    cash: i >= 0 ? Math.floor(w.ledger.balance(id, DEP)) : 0,
    deposits, loans, shares, futures, coins,
    marginPosted: i >= 0 ? Math.round(w.ledger.balance(id, 'cmdty:margin')) : 0,
    stockLoans: st.loans.map((l) => ({ instr: l.instr, qty: l.qty, face: l.face, eventId: arrived })),
    orders, contacts, prices, news, private: priv, bonds, score: st.score,
  };
}

export const player: Module = {
  id: 'player',
  init(w) {
    if (!w.state.player) w.state.player = blank();
    if (process.argv.includes('--load')) return;
    if (playerIndex(w) < 0) spawn(w);
  },
  dayClose(w) {
    const st = w.state.player as PlayerState | undefined;
    if (!st || st.who < 0) return;
    const P = econ(w).P;
    const i = st.who;
    if (i >= P.n) return;
    if (!P.alive(i)) {
      if (!st.over) {
        st.over = true;
        const died = w.events.last('person.died');
        const ev = died !== undefined ? w.events.get(died) : undefined;
        const cause = ev?.actor === P.id(i) ? ev.id : (st.arrived >= 0 ? st.arrived : w.genesis);
        chronicle(w, i, `${P.name(i)} has died. The game is over`, cause);
      }
      return;
    }
    if (w.day > 0 && w.day % DAYS_PER_YEAR === 0 && (st.score.length === 0 || st.score[st.score.length - 1].day !== w.day)) {
      const nw = Math.round(worth(w, i));
      st.score.push({ day: w.day, worth: nw });
      const cause = econ(w).macroEv || st.arrived;
      chronicle(w, i, `${P.name(i)} marks the year with a net worth of ${(nw / 100).toFixed(0)} dollars`, cause);
    }
  },
  stats(w) {
    const i = playerIndex(w);
    if (i < 0) return { player: 0 };
    const P = econ(w).P;
    return { player: Math.round(worth(w, i) / 100), playerAlive: P.alive(i) ? 1 : 0 };
  },
};
