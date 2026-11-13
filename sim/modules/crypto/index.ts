// Coins have no earnings behind them. A memecoin's price is the cash and the tokens
// sitting in its bonding-curve pool, and the only way either changes is someone
// buying or selling. People hear about a coin from their own contacts and buy
// when the price has been rising and their savings and temperament allow it.
// Holders who are ahead sell. A creator who does not trust their own contacts
// can pull the pool. Majors are a separate, listed book: the quote is the
// policy rate, plus a market maker and a fund that follows the last move.
import { type Module, type World } from '../../kernel/index.ts';
import { DEP, GOV, pay, type EconState, type Firm } from '../economy/index.ts';
import { thought } from '../economy/people.ts';

const DEG = 16;
const CX = 'cx';
const MM = 'cx_mm';
const MOM = 'cx_mom';
const SEED = 4_000; // cents the creator puts in the pool
const FEE = 2_000; // cents, paid to the treasury, gone
const POOL_TOKENS = 8_000;
const FOUNDER = 400;
const WORDS = ['moon', 'doge', 'pepe', 'rocket', 'bonk', 'frog', 'ape', 'inu', 'chad', 'wojak', 'based', 'gigachad', 'hop', 'kitty', 'elon'];

interface Major {
  id: string;
  name: string;
  supply: number;
  base: number; // cents, the price at a 4% policy rate
  last: number;
  prev: number;
  week: number;
}

interface Order {
  id: number;
  actor: string;
  instr: string;
  side: 'buy' | 'sell';
  qty: number;
  limit: number;
  seq: number;
  open: boolean;
}

interface Meme {
  id: string;
  name: string;
  creator: number;
  pool: string;
  seed: number;
  born: number;
  bornPx: number;
  weekPx: number;
  launchEv: number;
  tells: number[];
  cost: Map<number, number>;
  weekBuys: number;
  bits: Uint32Array;
  rugged: boolean;
  live: boolean;
}

interface Soc {
  cap: number;
  contact: Int32Array;
  trust: Uint8Array;
}

interface Book {
  majors: Major[];
  memes: Meme[];
  orders: Order[];
  nextId: number;
  seq: number;
  n: number;
  cursor: number;
  holdBits: Uint32Array;
  holders: number;
  rugLoss: number;
  root: number;
  fin: string;
  major: string; // id of the coin the finance firm accepts
}

const econ = (w: World): EconState => w.state.economy as EconState;
const book = (w: World): Book => w.state.crypto as Book;
const cashOf = (w: World, id: string): number => Math.floor(w.ledger.balance(id, DEP));

function mix(a: number, b: number, c: number, d = 0): number {
  let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f) ^ Math.imul(c, 0x165667b1) ^ d;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  return x >>> 0;
}

function soc(w: World): Soc | undefined {
  const s = w.state.social as Soc | undefined;
  if (!s || !s.contact) return undefined;
  return s;
}

function contactsOf(w: World, i: number): { who: number; trust: number; slot: number }[] {
  const s = soc(w);
  if (!s || i < 0 || i >= s.cap) return [];
  const out: { who: number; trust: number; slot: number }[] = [];
  const b = i * DEG;
  for (let k = 0; k < DEG; k++) {
    const who = s.contact[b + k];
    if (who >= 0) out.push({ who, trust: s.trust[b + k], slot: b + k });
  }
  return out;
}

function loyalty(w: World, i: number): number {
  const cs = contactsOf(w, i);
  if (!cs.length) return 100;
  let t = 0;
  for (const c of cs) t += c.trust;
  return t / cs.length;
}

function dropTrust(w: World, creator: number): void {
  const s = soc(w);
  if (!s) return;
  for (const c of contactsOf(w, creator)) {
    if (c.who < 0 || c.who >= s.cap) continue;
    const b = c.who * DEG;
    for (let k = 0; k < DEG; k++) if (s.contact[b + k] === creator) s.trust[b + k] = Math.max(0, s.trust[b + k] - 40);
  }
}

function heard(m: Meme, i: number): boolean {
  const w = i >> 5;
  if (w < 0 || w >= m.bits.length) return false;
  return (m.bits[w] & (1 << (i & 31))) !== 0;
}
function hear(m: Meme, i: number): boolean {
  if (i < 0) return false;
  const w = i >> 5;
  if (w >= m.bits.length) {
    const n = new Uint32Array(Math.max(w + 1, m.bits.length * 2));
    n.set(m.bits);
    m.bits = n;
  }
  const bit = 1 << (i & 31);
  if (m.bits[w] & bit) return false;
  m.bits[w] |= bit;
  return true;
}

function poolCash(w: World, m: Meme): number { return cashOf(w, m.pool); }
function poolTokens(w: World, m: Meme): number { return Math.floor(w.ledger.balance(m.pool, m.id)); }
function spot(w: World, m: Meme): number {
  const t = poolTokens(w, m);
  if (t <= 0 || m.rugged) return 0;
  return poolCash(w, m) / t;
}

/** Constant product. The pool keeps the rounding, so its cash always covers a sale of what it has sold. */
function quoteBuy(cash: number, tokens: number, spend: number): number {
  if (spend < 1 || tokens < 2 || cash < 1) return 0;
  const k = cash * tokens;
  const newTokens = Math.ceil(k / (cash + spend));
  const out = tokens - newTokens;
  return out >= 1 ? out : 0;
}
function quoteSell(cash: number, tokens: number, qty: number): number {
  if (qty < 1 || cash < 2 || tokens < 1) return 0;
  const k = cash * tokens;
  const newCash = Math.ceil(k / (tokens + qty));
  const pay = cash - newCash;
  return pay >= 1 ? pay : 0;
}

function noteHold(st: Book, i: number, on: boolean): void {
  const w = i >> 5;
  if (w >= st.holdBits.length) {
    const n = new Uint32Array(w + 1);
    n.set(st.holdBits);
    st.holdBits = n;
  }
  if (w < 0) return;
  const bit = 1 << (i & 31);
  const had = (st.holdBits[w] & bit) !== 0;
  if (on && !had) { st.holdBits[w] |= bit; st.holders++; }
  else if (!on && had) { st.holdBits[w] &= ~bit; st.holders--; }
}
function stillHolds(w: World, i: number): boolean {
  const id = 'p_' + i;
  const st = book(w);
  const L = w.ledger;
  for (const m of st.majors) if (L.balance(id, m.id) > 0) return true;
  for (const m of st.memes) if (L.balance(id, m.id) > 0) return true;
  return false;
}

function buyMeme(w: World, m: Meme, i: number, spend: number, cause: number): boolean {
  const P = econ(w).P;
  const id = P.id(i);
  const cash = poolCash(w, m), tokens = poolTokens(w, m);
  const out = quoteBuy(cash, tokens, spend);
  if (out < 1 || cashOf(w, id) < spend || m.weekBuys >= 8) return false;
  m.weekBuys++;
  if (!pay(w, id, m.pool, spend, 'crypto.buy', cause)) return false;
  if (!w.ledger.move(m.id, m.pool, id, out, 'crypto.buy', cause)) throw new Error(`pool delivery ${m.id}`);
  m.cost.set(i, (m.cost.get(i) ?? 0) + spend);
  noteHold(book(w), i, true);
  return true;
}

function sellMeme(w: World, m: Meme, i: number, qty: number, cause: number): number {
  const P = econ(w).P;
  const id = P.id(i);
  const held = Math.floor(w.ledger.balance(id, m.id));
  const q = Math.min(qty, held);
  const payC = quoteSell(poolCash(w, m), poolTokens(w, m), q);
  if (q < 1 || payC < 1) return 0;
  if (!pay(w, m.pool, id, payC, 'crypto.sell', cause)) return 0;
  if (!w.ledger.move(m.id, id, m.pool, q, 'crypto.sell', cause)) throw new Error(`sell delivery ${m.id}`);
  const cost = m.cost.get(i) ?? 0;
  const left = held - q;
  if (left <= 0) { m.cost.delete(i); noteHold(book(w), i, stillHolds(w, i)); }
  else m.cost.set(i, Math.floor(cost * left / held));
  return payC;
}

function wantBuy(w: World, m: Meme, i: number): number {
  const P = econ(w).P;
  if (!P.alive(i) || w.day < P.fearUntil[i]) return 0;
  const fresh = w.day - m.born < 7;
  if (!fresh && spot(w, m) < m.weekPx * 1.02) return 0;
  const inc = P.incEma[i];
  const cushion = cashOf(w, P.id(i)) - inc * 14;
  if (cushion < 600) return 0;
  const chase = (P.cY[i] - 0.86) / 0.13;
  const nerve = P.resil[i] / 100;
  if (!fresh && chase * 0.55 + nerve * 0.45 < 0.4 && mix(w.day, i, m.born) % 100 > 40) return 0;
  const room = Math.floor(poolCash(w, m) * 0.35);
  return Math.max(0, Math.min(2_000, Math.floor(cushion * 0.08), room));
}

function tell(w: World, m: Meme, speaker: number, forced: boolean): void {
  const P = econ(w).P;
  if (!P.alive(speaker)) return;
  const px = spot(w, m);
  const gain = m.weekPx > 0 ? px / m.weekPx - 1 : 0;
  let n = 0;
  for (const c of contactsOf(w, speaker)) {
    if (!P.alive(c.who) || heard(m, c.who)) continue;
    if (!forced) {
      const chance = Math.min(92, c.trust * (gain > 0.05 ? 1.5 : 0.55));
      if (mix(w.day, speaker, c.who, m.born) % 100 >= chance) continue;
    }
    hear(m, c.who);
    n++;
    const spend = wantBuy(w, m, c.who);
    if (spend >= 400) buyMeme(w, m, c.who, spend, m.launchEv);
  }
  if (n <= 0) return;
  const ev = w.events.emit('crypto.tell', `${P.name(speaker)} told ${n} contact${n === 1 ? '' : 's'} about ${m.name}${gain > 0.05 ? `, which was up ${(gain * 100).toFixed(0)}%` : ''}`, [m.launchEv], P.id(speaker));
  m.tells.push(ev);
  if (m.tells.length > 6) m.tells.splice(0, m.tells.length - 6);
}

function launch(w: World, i: number): void {
  const st = book(w), P = econ(w).P, L = w.ledger;
  const id = P.id(i);
  if (cashOf(w, id) < FEE + SEED) return;
  const word = WORDS[mix(w.day, i, 3) % WORDS.length];
  const fam = P.families[P.family[i]] ?? 'coin';
  const name = word[0].toUpperCase() + word.slice(1) + ' ' + fam;
  st.n++;
  const coinId = `coin:me:${String(st.n).padStart(4, '0')}`;
  const pool = `pool:${coinId}`;
  L.addActor(pool, 'exchange');
  L.define({ id: coinId, kind: 'share', issuer: id });
  const ev = w.events.emit('crypto.launch', `${P.name(i)} launched ${name} and seeded the pool with $${(SEED / 100).toFixed(0)}`, [st.root], id);
  if (!pay(w, id, GOV, FEE, 'crypto.fee', ev)) return;
  if (!pay(w, id, pool, SEED, 'crypto.seed', ev)) return;
  L.issue(coinId, pool, POOL_TOKENS, 'crypto.seed', ev);
  L.issue(coinId, id, FOUNDER, 'crypto.seed', ev);
  const m: Meme = {
    id: coinId, name, creator: i, pool, seed: SEED, born: w.day,
    bornPx: SEED / POOL_TOKENS, weekPx: SEED / POOL_TOKENS, launchEv: ev,
    tells: [], cost: new Map([[i, SEED]]), weekBuys: 0, bits: new Uint32Array(Math.ceil(P.capacity / 32)),
    rugged: false, live: true,
  };
  hear(m, i);
  noteHold(st, i, true);
  st.memes.push(m);
  tell(w, m, i, true);
}

function takeProfit(w: World, m: Meme, cause: number): number {
  const L = w.ledger;
  let sold = 0;
  const rows = [...L.holdersS(m.id)];
  for (const [slot, v0] of rows) {
    const v = Math.floor(v0);
    if (v <= 0) continue;
    const id = L.ids[slot];
    if (!id.startsWith('p_')) continue;
    const i = +id.slice(2);
    if (i === m.creator) continue;
    const px = spot(w, m);
    if (px <= 0) break;
    const cost = m.cost.get(i) ?? 0;
    const worth = v * px;
    let qty = 0;
    if (cost > 0 && worth > cost * 1.55) qty = Math.floor(v / 2);
    else if (cost > 0 && worth < cost * 0.72) qty = v;
    if (qty < 1) continue;
    const got = sellMeme(w, m, i, qty, cause);
    if (got > 0) sold += got;
  }
  return sold;
}

function maniaCauses(m: Meme): number[] {
  const c = [m.launchEv, ...m.tells];
  return c.slice(0, 5);
}

function weekOf(w: World, m: Meme): void {
  if (!m.live || m.rugged) return;
  const P = econ(w).P;
  const open = w.day - m.born >= 7 ? spot(w, m) : m.bornPx;
  if (w.day - m.born >= 7) m.weekBuys = 0;
  if (!(open > 0)) { m.live = false; return; }
  m.weekPx = open;
  const holders = [...w.ledger.holdersS(m.id)];
  let speakers = 0;
  for (const [slot, v] of holders) {
    if (v <= 0 || speakers >= 8) break;
    const id = w.ledger.ids[slot];
    if (!id.startsWith('p_')) continue;
    tell(w, m, +id.slice(2), false);
    speakers++;
  }
  const px = spot(w, m);
  if (m.weekPx > 0 && px >= m.weekPx * 5) {
    w.events.emit('crypto.mania', `${m.name} rose ${(px / m.weekPx).toFixed(1)}× this week, from ${m.weekPx.toFixed(1)}¢ to ${px.toFixed(1)}¢ a coin`, maniaCauses(m), P.id(m.creator));
  }
  const from = m.weekPx;
  if (poolCash(w, m) >= m.seed * 2.2 && loyalty(w, m.creator) < 70 && mix(w.day, m.creator, m.born) % 3 === 0) {
    rug(w, m);
    return;
  }
  const cause = m.tells[m.tells.length - 1] ?? m.launchEv;
  const sold = takeProfit(w, m, cause);
  const after = spot(w, m);
  if (sold > 0 && from > 0 && after > 0 && after <= from * 0.5) {
    const profitEv = w.events.emit('crypto.profit', `holders of ${m.name} sold $${(sold / 100).toFixed(0)} and the price fell`, [cause], P.id(m.creator));
    w.events.emit('crypto.crash', `${m.name} fell ${((1 - after / open) * 100).toFixed(0)}% this week as people took money out`, [m.launchEv, profitEv], P.id(m.creator));
  }
  if (w.day - m.born > 90 && poolCash(w, m) < m.seed * 1.2) m.live = false;
}

function rug(w: World, m: Meme): void {
  const P = econ(w).P, L = w.ledger;
  const cash = poolCash(w, m);
  const ev = w.events.emit('crypto.rug', `${P.name(m.creator)} pulled the ${m.name} pool and kept $${(cash / 100).toFixed(0)}. The coins still out have nowhere to sell`, maniaCauses(m), P.id(m.creator));
  if (cash > 0 && !pay(w, m.pool, P.id(m.creator), cash, 'crypto.rug', ev)) throw new Error(`rug cash ${m.id}`);
  const left = poolTokens(w, m);
  if (left > 0 && !L.redeem(m.id, m.pool, left, 'crypto.rug', ev)) throw new Error(`rug tokens ${m.id}`);
  m.rugged = true;
  m.live = false;
  book(w).rugLoss += cash;
  dropTrust(w, m.creator);
  for (const [slot, v] of [...L.holdersS(m.id)]) {
    if (v <= 0) continue;
    const id = L.ids[slot];
    if (!id.startsWith('p_')) continue;
    const i = +id.slice(2);
    if (i === m.creator || !P.alive(i)) continue;
    thought(w, econ(w), i, 300, `lost money in the ${m.name} rug`, ev);
  }
}

function considerLaunch(w: World): void {
  const st = book(w), P = econ(w).P;
  let live = 0;
  for (const m of st.memes) if (m.live) live++;
  if (live >= 6 || w.day < 90) return;
  const n = P.n;
  const step = Math.min(240, n);
  for (let k = 0; k < step; k++) {
    const i = (st.cursor + k) % n;
    if (!P.alive(i) || w.day < P.fearUntil[i] || P.resil[i] < 55) continue;
    const cs = contactsOf(w, i);
    if (cs.length < 8) continue;
    const surplus = cashOf(w, P.id(i)) - P.incEma[i] * 90;
    if (surplus < FEE + SEED) continue;
    if (mix(w.day, i, 9) % 7 !== 0) continue;
    st.cursor = (i + 1) % n;
    launch(w, i);
    return;
  }
  st.cursor = (st.cursor + step) % n;
}

// ---- majors: an order book whose mid is the policy rate ----

function fair(w: World, m: Major): number {
  const rate = Math.max(0.005, econ(w).policyRate);
  return Math.max(1, Math.round(m.base * 0.04 / rate));
}

function place(w: World, actor: string, instr: string, side: 'buy' | 'sell', qty: number, limit: number): void {
  if (qty < 1 || limit < 1) return;
  const st = book(w);
  st.orders.push({ id: st.nextId++, actor, instr, side, qty, limit, seq: st.seq++, open: true });
}

function matchMajor(w: World, m: Major): void {
  const st = book(w);
  const mine = st.orders.filter((o) => o.open && o.instr === m.id && o.qty >= 1);
  const bids = mine.filter((o) => o.side === 'buy').sort((a, b) => b.limit - a.limit || a.seq - b.seq);
  const asks = mine.filter((o) => o.side === 'sell').sort((a, b) => a.limit - b.limit || a.seq - b.seq);
  let bi = 0, ai = 0;
  const s = econ(w);
  const cause = s.macroEv || s.rateEv || st.root;
  for (let guard = 0; guard < 500; guard++) {
    while (bi < bids.length && !bids[bi].open) bi++;
    while (ai < asks.length && !asks[ai].open) ai++;
    const bid = bids[bi], ask = asks[ai];
    if (!bid || !ask || bid.limit < ask.limit) break;
    if (bid.actor === ask.actor) { (bid.seq > ask.seq ? bid : ask).open = false; continue; }
    const px = bid.seq < ask.seq ? bid.limit : ask.limit;
    let qty = Math.min(bid.qty, ask.qty, Math.floor(cashOf(w, bid.actor) / px), Math.floor(w.ledger.balance(ask.actor, m.id)));
    if (qty < 1) {
      if (Math.floor(cashOf(w, bid.actor) / px) < 1) bid.open = false;
      if (w.ledger.balance(ask.actor, m.id) < 1) ask.open = false;
      if (bid.open && ask.open) bid.open = false;
      continue;
    }
    if (!pay(w, bid.actor, ask.actor, qty * px, 'crypto.trade', cause)) { bid.open = false; continue; }
    if (!w.ledger.move(m.id, ask.actor, bid.actor, qty, 'crypto.trade', cause)) throw new Error(`major delivery ${m.id}`);
    bid.qty -= qty; ask.qty -= qty;
    if (bid.qty < 1) bid.open = false;
    if (ask.qty < 1) ask.open = false;
    if (bid.actor.startsWith('p_')) noteHold(st, +bid.actor.slice(2), true);
    if (ask.actor.startsWith('p_') && w.ledger.balance(ask.actor, m.id) <= 0) noteHold(st, +ask.actor.slice(2), stillHolds(w, +ask.actor.slice(2)));
    m.last = px;
  }
  for (const o of mine) o.open = false;
  st.orders = st.orders.filter((o) => o.open);
}

function quoteMajors(w: World): void {
  const st = book(w);
  const rate = econ(w).policyRate;
  for (const m of st.majors) {
    const mid = fair(w, m);
    const noise = 0.85 + 0.3 * w.rng('crypto.mm').next();
    const size = Math.max(2, Math.round(8 * noise));
    const width = Math.max(1, Math.round(mid * 0.01));
    const mmHeld = Math.floor(w.ledger.balance(MM, m.id));
    const momHeld = Math.floor(w.ledger.balance(MOM, m.id));
    if (cashOf(w, MM) >= mid) place(w, MM, m.id, 'buy', size, Math.max(1, mid - width));
    if (mmHeld > 0) place(w, MM, m.id, 'sell', Math.min(size, mmHeld), mid + width);
    const up = m.last >= m.prev;
    const chase = up && rate < 0.08;
    const flee = !up || rate > 0.07;
    if (chase && cashOf(w, MOM) >= mid) place(w, MOM, m.id, 'buy', Math.max(1, Math.round(size * 0.6)), mid);
    if (flee && momHeld > 0) place(w, MOM, m.id, 'sell', Math.min(momHeld, Math.max(1, Math.round(size * (rate > 0.07 ? 1.4 : 0.6)))), Math.max(1, mid - 1));
    // The finance firm keeps a small float of the coin it accepts, and sells the extra.
    if (m.id === st.major && st.fin) {
      const held = Math.floor(w.ledger.balance(st.fin, m.id));
      if (held < 24 && cashOf(w, st.fin) >= mid) place(w, st.fin, m.id, 'buy', 1, mid);
      if (held > 40) place(w, st.fin, m.id, 'sell', 1, Math.max(1, mid - 1));
    }
    if (w.day % 7 === 6 && econ(w).policyRate <= 0.09 && m.last >= m.week) {
      const P = econ(w).P;
      const i = (st.cursor + m.supply) % Math.max(1, P.n);
      if (P.alive(i) && w.day >= P.fearUntil[i]) {
        const surplus = cashOf(w, P.id(i)) - P.incEma[i] * 120;
        const qty = Math.min(3, Math.floor(surplus / mid / 40));
        if (qty >= 1) place(w, P.id(i), m.id, 'buy', qty, mid);
      }
    }
    matchMajor(w, m);
    if (m.last === m.prev) m.last = mid;
    m.prev = m.last;
  }
}

function issueSchedule(w: World, cause: number): void {
  const year = Math.floor(w.day / 360);
  if (year <= 0 || w.day % 360 !== 0) return;
  const cut = Math.pow(2, Math.min(8, year));
  for (const m of book(w).majors) {
    const n = Math.floor(m.supply / cut / 20);
    if (n >= 1) w.ledger.issue(m.id, MM, n, 'crypto.schedule', cause);
  }
}

const MAJORS: { id: string; name: string; supply: number; base: number }[] = [
  { id: 'coin:ledger', name: 'Ledger', supply: 80_000, base: 100 },
  { id: 'coin:north', name: 'North', supply: 50_000, base: 80 },
  { id: 'coin:halo', name: 'Halo', supply: 40_000, base: 60 },
];

function capitalise(w: World, id: string, slice: number, cause: number): void {
  const s = econ(w), L = w.ledger;
  L.addActor(id, 'fund');
  let left = Math.floor((L.issued.get(DEP) ?? 0) * 0.0015);
  for (const h of s.investors) {
    if (left < 100) break;
    const take = Math.min(left, Math.floor(cashOf(w, h.id) * slice));
    if (take < 100) continue;
    if (!pay(w, h.id, id, take, 'crypto.capital', cause)) continue;
    left -= take;
  }
}

/** Rest a major-coin order, or trade a memecoin against its pool. `qty` is coins for a major and, for a meme, coins to sell or cents to spend. */
export function orderCoin(w: World, actor: string, coin: string, side: 'buy' | 'sell', qty: number, limit?: number): { orderId?: number; fill?: number; why?: string } {
  if (!w.ledger.actors.has(actor)) return { why: `unknown actor ${actor}` };
  if (!Number.isSafeInteger(qty) || qty < 1) return { why: 'qty must be a positive integer' };
  const st = book(w);
  const key = coin.toLowerCase();
  const major = st.majors.find((m) => m.id.toLowerCase() === key || m.name.toLowerCase() === key || m.id.toLowerCase() === 'coin:' + key);
  if (major) {
    const px = limit && limit > 0 ? Math.round(limit) : major.last;
    const before = st.nextId;
    place(w, actor, major.id, side, qty, px);
    if (st.nextId === before) return { why: 'order rejected' };
    return { orderId: before };
  }
  const meme = st.memes.find((m) => m.id.toLowerCase() === key || m.name.toLowerCase() === key || m.id.toLowerCase() === 'coin:' + key);
  if (!meme || !meme.live || meme.rugged) return { why: `no coin ${coin}` };
  if (!actor.startsWith('p_')) return { why: 'a memecoin trades from a person' };
  const i = +actor.slice(2);
  if (side === 'buy') {
    const ok = buyMeme(w, meme, i, qty, meme.launchEv);
    return ok ? { fill: qty } : { why: 'the pool did not take that buy' };
  }
  const got = sellMeme(w, meme, i, qty, meme.launchEv);
  return got > 0 ? { fill: got } : { why: 'the pool did not take that sale' };
}

/** Same gates as an NPC creator: spare cash, eight contacts, the nerve, and room on the exchange. */
export function launchCoin(w: World, person: number): { id?: string; name?: string; why?: string } {
  const st = book(w), P = econ(w).P;
  if (person < 0 || person >= P.n || !P.alive(person)) return { why: 'dead' };
  let live = 0;
  for (const m of st.memes) if (m.live) live++;
  if (live >= 6) return { why: 'six memecoins are already live' };
  if (w.day < 90) return { why: 'the exchange has not been open long enough' };
  if (w.day < P.fearUntil[person]) return { why: 'too shaken to launch a coin' };
  if (P.resil[person] < 55) return { why: 'not the temperament to launch a coin' };
  if (contactsOf(w, person).length < 8) return { why: 'a launch needs eight contacts to tell' };
  const surplus = cashOf(w, P.id(person)) - P.incEma[person] * 90;
  if (surplus < FEE + SEED) return { why: 'needs spare cash for the fee and the seed' };
  const n0 = st.memes.length;
  launch(w, person);
  if (st.memes.length === n0) return { why: 'the launch did not clear' };
  const m = st.memes[st.memes.length - 1];
  return { id: m.id, name: m.name };
}

export const crypto: Module = {
  id: 'crypto',

  init(w) {
    const s = econ(w), L = w.ledger;
    const fin = s.firms.find((f: Firm) => f.sector === 'FINANCE');
    const st: Book = {
      majors: [], memes: [], orders: [], nextId: 1, seq: 1, n: 0, cursor: 0,
      holdBits: new Uint32Array(Math.ceil(s.P.capacity / 32)), holders: 0, rugLoss: 0,
      root: 0, fin: fin?.id ?? '', major: MAJORS[0].id,
    };
    w.state.crypto = st;
    L.addActor(CX, 'exchange');
    const root = w.events.emit('crypto.open', 'the coin exchange opens: Ledger, North and Halo, plus whatever people launch', [w.genesis], CX);
    st.root = root;
    capitalise(w, MM, 0.01, root);
    capitalise(w, MOM, 0.008, root);
    for (const def of MAJORS) {
      L.define({ id: def.id, kind: 'share', issuer: CX });
      const m: Major = { ...def, last: def.base, prev: def.base, week: def.base };
      const toMm = Math.floor(def.supply * 0.7);
      const toMom = Math.floor(def.supply * 0.2);
      L.issue(def.id, MM, toMm, 'genesis', root);
      L.issue(def.id, MOM, toMom, 'genesis', root);
      const rest = def.supply - toMm - toMom;
      if (st.fin && rest > 0) L.issue(def.id, st.fin, rest, 'genesis', root);
      else if (rest > 0) L.issue(def.id, MM, rest, 'genesis', root);
      st.majors.push(m);
    }
    const bad = L.check();
    if (bad.length) throw new Error(`crypto open: ${bad.slice(0, 4).join('; ')}`);
  },

  tick(w, t) {
    if (t !== 0) return;
    quoteMajors(w);
  },

  dayClose(w) {
    issueSchedule(w, book(w).root);
    if (w.day % 7 !== 6) return;
    for (const m of book(w).majors) m.week = m.last;
    considerLaunch(w);
    for (const m of book(w).memes) weekOf(w, m);
  },

  stats(w) {
    const st = book(w);
    let best = st.majors[0];
    let cap = 0;
    for (const m of st.majors) {
      const c = m.last * (w.ledger.issued.get(m.id) ?? 0);
      if (c >= cap) { cap = c; best = m; }
    }
    let live = 0;
    for (const m of st.memes) if (m.live) live++;
    const out = {
      majorPx: best ? best.last : 0,
      memes: live,
      holders: Math.max(0, st.holders),
      rugLoss: Math.round(st.rugLoss / 100),
    };
    st.rugLoss = 0;
    return out;
  },
};
