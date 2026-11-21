// Coins have no earnings behind them. A memecoin's price is the cash and the tokens
// sitting in its bonding-curve pool, and the only way either changes is someone
// buying or selling. People hear about a coin from their own contacts and buy
// when the price has been rising and their savings and temperament allow it.
// Holders who are ahead sell. A creator who does not trust their own contacts
// can pull the pool. Majors are a separate, listed book: the quote is the
// policy rate, plus a market maker and a fund that follows the last move.
import { type Module, type World } from '../../kernel/index.ts';
import { isSeatActor, isSeatPerson } from '../../kernel/seat.ts';
import { DEP, GOV, pay, type EconState, type Firm } from '../economy/index.ts';
import { thought } from '../economy/people.ts';
import { whole as grouped } from '../player/gamedate.ts';
import { notify } from '../circle/notices.ts';
import { nudgeStanding } from '../social/index.ts';

const DEG = 16;
const CX = 'cx';
const MM = 'cx_mm';
const MOM = 'cx_mom';
const SEED = 150_000; // cents a player puts in the pool: deep enough that a few hundred dollars is a trade, not the whole pool
const SEED_MIN = 25_000; // the smallest pool a city launcher seeds: a few dollars of buying moves it
const MAX_LIVE = 12;
const FEE = 2_000; // cents, paid to the treasury, gone
const POOL_TOKENS = 150_000;
const FOUNDER = 15_000;
const WORDS = ['moon', 'doge', 'pepe', 'rocket', 'bonk', 'frog', 'ape', 'inu', 'chad', 'wojak', 'based', 'gigachad', 'hop', 'kitty', 'elon'];
const MIN_DAY = 1440;

interface Major {
  id: string;
  name: string;
  supply: number;
  base: number; // cents, the price at a 4% policy rate
  last: number;
  prev: number;
  week: number;
  /** How far the quote sits off the last price after a player walked the ladder. It fades each day. */
  imp?: number;
  /** Minute accumulators for the chart: coins traded and the price extremes since the minute layer last read them. */
  mVol?: number;
  mHi?: number;
  mLo?: number;
  /** Flat [minute, price] pairs, newest last. */
  hist?: number[];
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

/** One executed trade against a memecoin's pool: the fill, not the quote after it. Kept for the Launchpad's tape. */
interface Print {
  seq: number;
  day: number;
  /** Game minutes since day 0. */
  abs: number;
  side: 'buy' | 'sell';
  tokens: number;
  cents: number;
  who: number;
  /** Average fill, cents per token (cents / tokens). The tape shows this, not the pool's price after the trade. */
  px?: number;
  /** Same as px: the average fill. */
  avg?: number;
  /** Pool spot, cents per token, just before this trade. */
  before?: number;
  /** Pool spot, cents per token, just after this trade. */
  after?: number;
  /** A sale's profit over what the seller paid for those tokens, as a fraction (0.4 is up 40%). */
  gain?: number;
}

/** Why a coin left the board. The page says this, and the minute is never earlier than the launch. */
type EndWhy = '' | 'inactivity' | 'drawdown' | 'age' | 'rug';

/** One holder line in a settlement. */
interface PayLine { who: number; tokens: number; cents: number }

/** What the pool held when the coin ended, and who was paid. Shown on the page. */
interface Payout {
  pool: number;
  /** Cash the creator kept by pulling the pool. 0 on a delisting. */
  taken: number;
  /** Cash paid to holders. */
  paid: number;
  /** Cents that did not divide, paid to the treasury. */
  dust: number;
  holders: number;
  /** The largest lines, the player always included when they held any. */
  lines: PayLine[];
  yoursTokens: number;
  yoursCents: number;
  note: string;
}

/** Someone who heard a post: who, when, from whom, what they held, and what they did. */
interface Hear {
  abs: number;
  who: number;
  from: number;
  holding: number;
  kind: string;
  did: 'buy' | 'sell' | 'hold' | 'none';
  cents: number;
  text: string;
}

interface Meme {
  id: string;
  name: string;
  ticker: string;
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
  prints: Print[];
  /** Game minute of the launch, and of the last trade. */
  bornAbs?: number;
  lastAbs?: number;
  /** Highest price so far, cents per token. */
  peak?: number;
  /** Net cents bought per minute, smoothed: positive while the crowd is buying. */
  flow?: number;
  /** Flat [minute, price] pairs, newest last, for momentum. */
  hist?: number[];
  /** People holding the coin, for drawing a seller. */
  hold?: number[];
  /** Minute accumulators for the chart. */
  mVol?: number;
  mHi?: number;
  mLo?: number;
  pumpEv?: number;
  pumpAbs?: number;
  dumpAbs?: number;
  dumpEv?: number;
  deadDay?: number;
  rugAbs?: number;
  /** How much the crowd takes to this coin, from the launcher's reach and the luck of the name: most coins fizzle, a few catch. */
  appeal?: number;
  /** Trades and cents traded since launch, and a decaying heat (cents, halved about every two game hours) for Trending. */
  trades?: number;
  volTotal?: number;
  heat?: number;
  heatAbs?: number;
  /** What the creator took when they pulled the pool, and the price it fell from. */
  rugCash?: number;
  rugPx?: number;
  /** The creator's own words about the coin, shown on its page. */
  desc?: string;
  /** What people posted on the coin's page: the player's posts and the crowd's answers, with the answers still to come. */
  said?: Said[];
  queue?: Due[];
  saidSeq?: number;
  /** Cents the creator spent buying their own coin, cents everyone else spent buying, and cents taken back out by sales. */
  founderBuy?: number;
  outsideBuy?: number;
  withdrawn?: number;
  /** Distinct people, other than the creator, who have bought. */
  buyers?: number;
  /** Terminal minute and why, set once and never earlier than the launch. */
  endAbs?: number;
  endWhy?: EndWhy;
  /** Holders have been paid and their tokens redeemed. */
  settled?: boolean;
  payout?: Payout;
  /** Who heard a post, and what they did. Capped. */
  hears?: Hear[];
  /** How a post shifted the crowd, fading over a few hours. Hype only moves the gullible. */
  belief?: number;
  beliefAbs?: number;
  beliefKind?: string;
  /** Game minute the creator disclosed an orderly wind-down. */
  windDown?: number;
}

/** One post stored on a coin's page. A reply carries the parent's id and a copy of what it answered, so a thread survives its parent scrolling away. */
interface Said { id: string; abs: number; who: number; mine?: boolean; text: string; parent?: string; quote?: string; quoteName?: string; label?: string }
/** An answer the crowd has yet to write: who answers, when, to which post, and how the post read. */
interface Due { abs: number; who: number; parent: string; stance: Stance; creator: boolean }
type Stance = 'ask' | 'hype' | 'doubt' | 'plain';

const PRINTS_KEEP = 80;

/** Options a launch can carry from the Launchpad: a name, a ticker and a starting buy in cents, all optional. */
export interface LaunchOpts { name?: string; ticker?: string; buy?: number; seed?: number; desc?: string }

/** A memecoin as the Launchpad board reads it. Nothing here is stored: every figure is read from the pool and the ledger. */
export interface MemeRow {
  id: string;
  name: string;
  ticker: string;
  creator: number;
  creatorName: string;
  mine: boolean;
  live: boolean;
  rugged: boolean;
  born: number;
  eventId: number;
  /** Cents per token now (the pool's constant-product spot); 0 once rugged. */
  px: number;
  /** Cents per token at the start of the week. */
  prev: number;
  supply: number;
  cap: number;
  /** Share of the pool's tokens bought out, 0..1. */
  sold: number;
  /** Cents the buyers have paid into the pool, above the creator's seed. Kept so older readers still see a number; the split below is what the page shows. */
  raised: number;
  /** The split of cash: the creator's seed, the creator's own buys, everyone else's buys, and sales taken back out. */
  seed: number;
  founderBuy: number;
  outsideBuy: number;
  withdrawn: number;
  cash: number;
  tokens: number;
  holders: number;
  /** Cents traded in the recent prints kept for the tape. */
  vol: number;
  /** Game minute of the launch. */
  bornAbs: number;
  /** Price change over the last hour (1 = unchanged); null while the coin is younger than an hour. */
  h1: number | null;
  /** The coin with the biggest market cap among the live ones. */
  king: boolean;
  lastDay: number;
  replies: number;
  /** Game minute of the last trade, trades since launch, cents traded since launch and the recent heat for Trending. */
  lastAbs: number;
  trades: number;
  volTotal: number;
  heat: number;
  /** Highest price so far, cents per token. */
  peak: number;
  /** Set once the coin is gone: how it ended ('rugged' or 'faded'), when, and what the creator took. */
  ended: '' | 'rugged' | 'faded';
  /** inactivity, drawdown, age or rug. Empty while it trades. */
  endWhy: EndWhy;
  endAbs: number;
  rugCash: number;
  /** Game day the pool of a faded coin pays out. 0 once it already has. */
  windDay: number;
  /** The settlement, once holders have been paid or told they cannot sell. */
  payout?: Payout;
  kingRule?: string;
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
  printSeq: number;
  seed?: number;
  abs?: number;
  /** The people who trade coins all day: the greedy, the young, the idle. */
  degens?: number[];
  dcur?: number;
  minDay?: number;
  minRuns?: number;
  climAbs?: number;
  mania?: number;
  slump?: number;
  mood?: number;
  rugs?: number[];
  king?: string;
  kingAbs?: number;
  kingRule?: string;
  /** How many rugs each person has actually been in. Sparse: only people who held a pulled coin. */
  rugSeen?: Record<string, number>;
  launched?: number;
  /** Lifetime endings, not reset by the yearly stats line. Retired coins leave the book after 30 days. */
  tally?: { launches: number; rugs: number; mania: number; age: number; inactivity: number; drawdown: number; before: number };
  trades?: number;
  rugBars?: { id: string; last: number }[];
  /** Pool accounts of wound-up coins, empty and ready to be used again. */
  free?: string[];
  /** The player's record as a coin creator: launches, dumps on their own buyers, the buyers it hurt, the coins that did well. */
  dev?: Record<string, DevRow>;
}
export interface DevRow { launches: number; dumps: number; hurt: number; cents: number; good: number; last: number; goodIds: string[]; dumpIds: string[] }

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

/**
 * What a coin is worth per token to someone holding `qty` of it: what selling them all into the pool would bring, divided by the
 * tokens. One number for the token page, the Portfolio and net worth, so a buy never shows an instant gain and a thin pool is not
 * flattered by its spot price. A pulled pool is worth nothing; a delisted one still takes sales until it is wound up.
 */
export function memeMark(w: World, instr: string, qty: number): number {
  const m = book(w).memes.find((x) => x.id === instr);
  if (!m || m.rugged) return 0;
  const tokens = poolTokens(w, m), cash = poolCash(w, m);
  if (tokens <= 0 || cash <= 0) return 0;
  const q = Math.floor(qty);
  if (q < 1) return cash / tokens;
  return quoteSell(cash, tokens, q) / q;
}

/** The price an hour ago (or `mins` ago), from the trades; null while the coin is younger than that. */
function priceAgo(m: Meme, abs: number, mins: number): number | null {
  const t = abs - mins;
  const born = m.bornAbs ?? m.born * MIN_DAY;
  if (born > t) return null;
  for (let k = m.prints.length - 1; k >= 0; k--) {
    const pr = m.prints[k];
    if (pr.abs <= t && pr.px && pr.px > 0) return pr.px;
  }
  if (m.prints.length >= (m.trades ?? 0)) return m.bornPx;
  return priceAt(m.hist, t, m.bornPx);
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
  const held = L.heldInstrs(id);
  if (held) for (const k of held) if (k.startsWith('coin:me:') && L.balance(id, k) > 0) return true;
  return false;
}

function printTrade(w: World, m: Meme, side: 'buy' | 'sell', tokens: number, cents: number, who: number, before: number, gain?: number): void {
  const st = book(w);
  const seq = st.printSeq ?? 1; // a save from before the tape existed has no counter yet
  st.printSeq = seq + 1;
  const abs = st.abs ?? w.day * MIN_DAY;
  const after = spot(w, m);
  const avg = tokens > 0 ? cents / tokens : after;
  const pr: Print = { seq, day: w.day, abs, side, tokens, cents, who, px: avg, avg, before, after };
  if (gain !== undefined) pr.gain = Math.round(gain * 100) / 100;
  m.prints.push(pr);
  if (m.prints.length > PRINTS_KEEP) m.prints.splice(0, m.prints.length - PRINTS_KEEP);
  m.trades = (m.trades ?? 0) + 1;
  m.volTotal = (m.volTotal ?? 0) + cents;
  m.heat = (m.heat ?? 0) * Math.pow(0.5, Math.max(0, abs - (m.heatAbs ?? abs)) / 120) + cents;
  m.heatAbs = abs;
  // The chart's minute bar counts the fill even while the clock is paused: the minute layer has not sampled it yet.
  m.mVol = (m.mVol ?? 0) + tokens;
  const hi = Math.max(before, after, avg);
  const lo = Math.min(before > 0 ? before : hi, after > 0 ? after : hi, avg > 0 ? avg : hi);
  if (hi > 0) { m.mHi = Math.max(m.mHi ?? 0, hi); m.mLo = Math.min(m.mLo ?? Infinity, lo); if (after > (m.peak ?? 0)) m.peak = after; }
  m.lastAbs = abs;
  st.trades = (st.trades ?? 0) + 1;
}

function buyMeme(w: World, m: Meme, i: number, spend: number, cause: number, seat = false): number {
  const P = econ(w).P;
  const id = P.id(i);
  const cash = poolCash(w, m), tokens = poolTokens(w, m);
  const out = quoteBuy(cash, tokens, spend);
  if (out < 1 || cashOf(w, id) < spend) return 0;
  const before = cash / tokens;
  if (!pay(w, id, m.pool, spend, 'crypto.buy', cause)) return 0;
  if (!w.ledger.move(m.id, m.pool, id, out, 'crypto.buy', cause)) throw new Error(`pool delivery ${m.id}`);
  const fresh = !m.cost.has(i);
  if (fresh) (m.hold ??= []).push(i);
  m.cost.set(i, (m.cost.get(i) ?? 0) + spend);
  if (i === m.creator) m.founderBuy = (m.founderBuy ?? 0) + spend;
  else {
    m.outsideBuy = (m.outsideBuy ?? 0) + spend;
    if (fresh) m.buyers = (m.buyers ?? 0) + 1;
  }
  noteHold(book(w), i, true);
  m.flow = (m.flow ?? 0) + spend;
  printTrade(w, m, 'buy', out, spend, i, before);
  if (seat) refreshKing(w);
  return out;
}

function sellMeme(w: World, m: Meme, i: number, qty: number, cause: number): number {
  const P = econ(w).P;
  const id = P.id(i);
  const held = Math.floor(w.ledger.balance(id, m.id));
  const q = Math.min(qty, held);
  const cash = poolCash(w, m), tokens = poolTokens(w, m);
  let payC = quoteSell(cash, tokens, q);
  // A sale the curve prices under a cent is not a dead end: the whole holding clears for 1¢ when the pool can pay it.
  if (q >= 1 && payC < 1 && q === held && cash >= 2) payC = 1;
  if (q < 1 || payC < 1) return 0;
  const before = tokens > 0 ? cash / tokens : 0;
  if (!pay(w, m.pool, id, payC, 'crypto.sell', cause)) return 0;
  if (!w.ledger.move(m.id, id, m.pool, q, 'crypto.sell', cause)) throw new Error(`sell delivery ${m.id}`);
  const cost = m.cost.get(i) ?? 0;
  const left = held - q;
  const basis = cost > 0 ? cost * q / held : 0;
  if (left <= 0) {
    m.cost.delete(i);
    if (m.hold) { const at = m.hold.indexOf(i); if (at >= 0) { m.hold[at] = m.hold[m.hold.length - 1]; m.hold.pop(); } }
    noteHold(book(w), i, stillHolds(w, i));
  } else m.cost.set(i, Math.floor(cost * left / held));
  m.withdrawn = (m.withdrawn ?? 0) + payC;
  m.flow = (m.flow ?? 0) - payC;
  printTrade(w, m, 'sell', q, payC, i, before, basis > 0 ? payC / basis - 1 : undefined);
  if (isSeatPerson(w, i)) refreshKing(w);
  return payC;
}

function wantBuy(w: World, m: Meme, i: number): number {
  const P = econ(w).P;
  if (!P.alive(i) || w.day < P.fearUntil[i]) return 0;
  const fresh = (book(w).abs ?? w.day * MIN_DAY) - (m.bornAbs ?? m.born * MIN_DAY) < 240;
  if (!fresh && spot(w, m) < m.weekPx * 1.02) return 0;
  const inc = P.incEma[i];
  const cushion = cashOf(w, P.id(i)) - inc * 14;
  if (cushion < 600) return 0;
  const chase = (P.cY[i] - 0.86) / 0.13;
  const nerve = P.resil[i] / 100;
  if (!fresh && chase * 0.55 + nerve * 0.45 < 0.4 && mix(w.day, i, m.born) % 100 > 40) return 0;
  if (isSeatPerson(w, i)) return 0;
  const room = Math.max(500, Math.floor(poolCash(w, m) * 0.03 * Math.min(1.5, m.appeal ?? 1)));
  return Math.max(0, Math.min(8_000, Math.floor(cushion * 0.05), room));
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

// ---- who launches, and what they call it ----

const THEMES: Record<string, string[]> = {
  gambler: ['Moon', 'Rocket', 'Lambo', 'Jackpot', 'Diamond', 'Bull', 'Pump', 'Alpha', 'Yolo', 'Gold', 'Turbo', 'Mega'],
  young: ['Pepe', 'Doge', 'Frog', 'Wojak', 'Bonk', 'Chad', 'Based', 'Rizz', 'Zoom', 'Meme', 'Vibe', 'Cope', 'Gigachad', 'Kitty'],
  rich: ['Yacht', 'Caviar', 'Polo', 'Gala', 'Marble', 'Velvet', 'Champagne', 'Estate', 'Opal', 'Regatta', 'Salon'],
  local: ['Harbour', 'Avalon', 'Quay', 'Tide', 'Gull', 'Crane', 'Lighthouse', 'Ferry', 'Anchor', 'Dock'],
};
const TAILS = ['Coin', 'Token', 'Inu', 'Cash', 'Finance', 'DAO', 'Swap', 'Moon', 'Pepe', 'Cat'];
const HANDLE_A = ['quiet', 'lucky', 'rusty', 'neon', 'salty', 'brave', 'sleepy', 'wired', 'cosmic', 'dusty', 'frosty', 'jolly', 'sly', 'bold', 'misty', 'swift'];
const HANDLE_B = ['otter', 'gull', 'crab', 'fox', 'heron', 'seal', 'kraken', 'moth', 'lynx', 'wolf', 'ibis', 'newt', 'whale', 'crane', 'hare', 'mole'];

/** Anonymous trader handle for a person: the same person always trades as the same handle. */
export function handleOf(i: number): string {
  const h = mix(i, 0x51ed, 7);
  return `${HANDLE_A[h % HANDLE_A.length]}_${HANDLE_B[(h >>> 8) % HANDLE_B.length]}_${String(h % 97).padStart(2, '0')}`;
}

function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
/** A number in [0, 1) that is a pure function of the world seed and the three keys. */
function unit(w: World, a: number, b: number, c: number): number {
  const st = book(w);
  if (st.seed === undefined) st.seed = fnv(w.seed);
  // Absorb the keys one at a time with a multiply between each, so near keys (consecutive minutes) land far apart.
  let h = Math.imul((st.seed ^ 0x2545f491) | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15) ^ a, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13) ^ b, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16) ^ c, 0x27d4eb2f);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const ageOf = (w: World, i: number): number => (w.day - econ(w).P.born[i]) / 360;

/** Which kind of person this is, for the name and for how likely they are to launch. */
function persona(w: World, i: number): { kind: string; score: number } {
  const P = econ(w).P;
  const age = ageOf(w, i);
  const cash = cashOf(w, P.id(i));
  const gambler = P.greed[i] >= 60;
  const young = age < 32;
  const rich = age >= 30 && cash > Math.max(200_000, P.incEma[i] * 400);
  const idle = P.employer[i] < 0 && age >= 18;
  let score = 0.4;
  if (gambler) score += 2;
  if (young) score += 1.5;
  if (rich) score += 1.2;
  if (idle) score += 0.8;
  if (P.resil[i] >= 55) score += 0.4;
  const kind = gambler ? 'gambler' : young ? 'young' : rich ? 'rich' : 'local';
  return { kind, score };
}

function nameFor(w: World, i: number, kind: string, abs: number): { name: string; ticker: string } {
  const P = econ(w).P;
  const pick = (list: string[], salt: number): string => list[Math.floor(unit(w, abs, i, salt) * list.length)];
  const fam = P.families[P.family[i]] ?? 'Coin';
  const given = P.name(i).split(' ')[0];
  const r = unit(w, abs, i, 11);
  let name: string;
  if (r < 0.28) name = fam + ' ' + pick(TAILS, 12);
  else if (r < 0.4) name = given + ' ' + pick(['Coin', 'Cash', 'Token', 'Inu'], 13);
  else if (r < 0.7) name = pick(THEMES[kind], 14) + ' ' + pick(TAILS, 15);
  else if (r < 0.85) name = pick(THEMES[kind], 14) + pick(THEMES[kind === 'young' ? 'gambler' : 'young'], 16).toLowerCase();
  else name = pick(THEMES.local, 17) + ' ' + pick(THEMES[kind], 18);
  const live = new Set<string>();
  // Every coin still on the board keeps its ticker, a dead one included, so two coins never share one.
  for (const m of book(w).memes) live.add(m.ticker);
  const letters = name.replace(/[^A-Za-z ]/g, '');
  const words = letters.split(' ').filter(Boolean);
  const tries = [
    words[0].slice(0, 4),
    words[0].slice(0, 3) + (words[1]?.[0] ?? ''),
    words.map((x) => x[0]).join('') + words[0].slice(1, 3),
    words[0].slice(0, 2) + (words[1]?.slice(0, 2) ?? 'X'),
  ].map((x) => x.toUpperCase());
  const rude = /ANUS|ASS|SEX|FAG|RAPE|KKK|NAZI|CUNT|TIT/;
  let ticker = tries.find((t) => t.length >= 3 && !live.has(t) && !rude.test(t));
  for (let n = 2; !ticker; n++) {
    const t = tries[0].slice(0, 3) + n;
    if (!live.has(t)) ticker = t;
  }
  return { name, ticker };
}

/** The pool a city launcher seeds: a slice of what they can spare, never more than the standard pool. */
function seedFor(w: World, i: number): number {
  const P = econ(w).P;
  const spare = cashOf(w, P.id(i)) - FEE - 5_000;
  return Math.max(SEED_MIN, Math.min(SEED, Math.floor(Math.max(0, spare) * 0.25 / 5000) * 5000));
}

function launch(w: World, i: number, opts: LaunchOpts = {}, seedCents = SEED): Meme | undefined {
  const st = book(w), P = econ(w).P, L = w.ledger;
  const id = P.id(i);
  if (cashOf(w, id) < FEE + seedCents) return undefined;
  const abs = Math.max(st.abs ?? 0, w.day * MIN_DAY);
  st.abs = abs;
  const who = persona(w, i);
  const nm = nameFor(w, i, who.kind, abs);
  const name = opts.name ?? nm.name;
  const desc = (opts.desc ?? '').trim().slice(0, 160) || blurb(w, i, name, abs);
  let ticker = (opts.ticker ?? nm.ticker).toUpperCase();
  if (opts.ticker) {
    const taken = new Set<string>();
    for (const m of st.memes) taken.add(m.ticker);
    for (let n = 2; taken.has(ticker); n++) ticker = opts.ticker.toUpperCase().slice(0, 4) + n;
  }
  st.n++;
  const coinId = `coin:me:${String(st.n).padStart(4, '0')}`;
  // A wound-up coin hands its empty pool account to the next launch, so the ledger does not grow with every coin ever listed.
  const pool = st.free?.pop() ?? `pool:${coinId}`;
  if (!L.actors.has(pool)) L.addActor(pool, 'exchange');
  L.define({ id: coinId, kind: 'share', issuer: id });
  const ev = w.events.emit('crypto.launch', `${P.name(i)} launched ${name} (${ticker}) and seeded the pool with ${grouped(seedCents)}`, [st.root], id);
  if (!pay(w, id, GOV, FEE, 'crypto.fee', ev)) return undefined;
  if (!pay(w, id, pool, seedCents, 'crypto.seed', ev)) return undefined;
  L.issue(coinId, pool, POOL_TOKENS, 'crypto.seed', ev);
  L.issue(coinId, id, FOUNDER, 'crypto.seed', ev);
  const px0 = seedCents / POOL_TOKENS;
  const m: Meme = {
    id: coinId, name, ticker, creator: i, pool, seed: seedCents, born: w.day,
    bornPx: px0, weekPx: px0, launchEv: ev,
    tells: [], cost: new Map([[i, seedCents]]), weekBuys: 0, bits: new Uint32Array(Math.ceil(P.capacity / 32)),
    rugged: false, live: true, prints: [], desc, said: [], queue: [], saidSeq: 0,
    bornAbs: abs, lastAbs: abs, peak: px0, flow: 0, hist: [abs, px0], hold: [i], mVol: 0, mHi: px0, mLo: px0,
    appeal: (0.25 + 2.2 * Math.pow(unit(w, st.n, i, 71), 3)) * (0.7 + 0.3 * Math.min(1, contactsOf(w, i).length / 12)),
  };
  if (isSeatPerson(w, i)) {
    const row = devRow(w, i);
    row.launches++;
    // The crowd remembers a dev: a good record brings followers to the next launch, dumps keep them away.
    m.appeal = (m.appeal ?? 1) * Math.max(0.08, 1 + 0.35 * Math.min(4, row.good) - 0.45 * Math.min(4, row.dumps));
  }
  hear(m, i);
  noteHold(st, i, true);
  st.memes.push(m);
  st.launched = (st.launched ?? 0) + 1;
  (st.tally ??= { launches: 0, rugs: 0, mania: 0, age: 0, inactivity: 0, drawdown: 0, before: 0 }).launches++;
  // The starting buy is the creator's first trade on their own curve: it goes through the same pool as anyone's.
  if (opts.buy && opts.buy >= 1) buyMeme(w, m, i, opts.buy, ev, true);
  tell(w, m, i, true);
  refreshKing(w);
  return m;
}

/** A chief executive or an officeholder: someone whose name is already public. */
function publicFigure(w: World, i: number): boolean {
  const s = econ(w), P = s.P;
  const e = P.employer[i];
  if (e >= 0 && s.firms[e]?.ceo === i) return true;
  const pol = w.state.politics as { leader?: number; finance?: number; governor?: number; regulator?: number } | undefined;
  return !!pol && (pol.leader === i || pol.finance === i || pol.governor === i || pol.regulator === i);
}

function seatWho(w: World): number {
  const st = w.state.player as { ids?: string[]; seat?: Record<string, { who?: number }> } | undefined;
  const k = st?.ids?.[0];
  const who = k ? st?.seat?.[k]?.who : undefined;
  return typeof who === 'number' ? who : -1;
}

/** The player's record as a coin creator, for letters, the crowd and the regulator. */
export function devRecord(w: World, person: number): DevRow {
  const st = w.state.crypto as Book | undefined;
  const row = st?.dev?.[String(person)];
  return row ?? { launches: 0, dumps: 0, hurt: 0, cents: 0, good: 0, last: -1, goodIds: [], dumpIds: [] };
}
function devRow(w: World, person: number): DevRow {
  const st = book(w);
  return ((st.dev ??= {})[String(person)] ??= { launches: 0, dumps: 0, hurt: 0, cents: 0, good: 0, last: -1, goodIds: [], dumpIds: [] });
}

/** Tell the player about a coin they hold: a rug, a delisting, a big move. */
function holderNotice(w: World, m: Meme, title: string, text: string, cause: number, urgent: boolean, force = false): void {
  const me = seatWho(w);
  if (me < 0) return;
  const held = Math.floor(w.ledger.balance(econ(w).P.id(me), m.id));
  if (!force && held < 1 && !(m.hold ?? []).includes(me)) return;
  const reason = held > 0 ? `You hold ${held.toLocaleString('en-US')} ${m.ticker}.` : `Your ${m.ticker} was settled. The payout is on the coin's page.`;
  notify(w, { kind: 'coin', title, text, reason, cause, urgent, actions: [{ label: `Open ${m.ticker}`, line: `coin ${m.ticker}` }] });
}

/**
 * The player sold their own coin into the people who bought it. The crowd on the coin's page names the handle, the
 * players' Reputation takes the hit, and the record follows the next launch. A second time the regulator files it.
 */
function coinHolders(w: World, m: Meme): number[] {
  const P = econ(w).P;
  const out: number[] = [];
  const seen = new Set<number>();
  const add = (x: number): void => {
    if (seen.has(x) || x < 0 || x >= P.n || !P.alive(x)) return;
    if (Math.floor(w.ledger.balance(P.id(x), m.id)) < 1) return;
    seen.add(x);
    out.push(x);
  };
  for (const x of m.hold ?? []) add(x);
  if (out.length < 2) for (const [who, n] of w.ledger.holders(m.id)) {
    if (!who.startsWith('p_') || n < 1) continue;
    add(Number(who.slice(2)));
  }
  return out;
}

function devDump(w: World, m: Meme, i: number, sold: number, cents: number): void {
  const P = econ(w).P;
  const holding = coinHolders(w, m).filter((x) => x !== i);
  const others = holding.length;
  if (sold < FOUNDER * 0.2 || others < 1) return;
  const abs = book(w).abs ?? w.day * MIN_DAY;
  const heldBefore = sold + Math.floor(w.ledger.balance(P.id(i), m.id));
  // A disclosed sale of part of the bag is a wind-down. Smashing the whole bag, or selling with no word, is a dump.
  const disclosed = m.windDown !== undefined && abs - m.windDown < 1440;
  const orderly = disclosed && sold <= Math.max(1, Math.floor(heldBefore * 0.45));
  if (orderly) {
    const ev = w.events.emit('crypto.winddown', `${P.name(i)} sold ${sold.toLocaleString('en-US')} of their own ${m.ticker} after saying they were winding down`, [m.launchEv], P.id(i));
    nudgeStanding(w, i, -1);
    notify(w, {
      kind: 'coin', title: `You wound ${m.ticker} down in the open`, urgent: false, cause: ev,
      text: `You had said you were selling, and this sale was part of the bag, not the whole exit. The page says so. Reputation barely moved.`,
      reason: 'A disclosed, orderly wind-down is not a dump. Selling the founder bag in one print, or doing it again without a word, is.',
      actions: [{ label: `Open ${m.ticker}`, line: `coin ${m.ticker}` }],
    });
    return;
  }
  const row = devRow(w, i);
  if (row.dumpIds.includes(m.id) && w.day - row.last < 1) return;
  row.dumps++;
  row.hurt += others;
  row.cents += cents;
  row.last = w.day;
  if (!row.dumpIds.includes(m.id)) row.dumpIds.push(m.id);
  const ev = w.events.emit('crypto.devdump', `${P.name(i)} sold ${sold.toLocaleString('en-US')} of their own ${m.ticker} into ${others} buyers for $${Math.round(cents / 100)} || dev dump ${row.dumps}`, [m.launchEv], P.id(i));
  const repeat = row.dumps >= 2;
  nudgeStanding(w, i, -(repeat ? 8 + 6 * Math.min(4, row.dumps) : 4));
  const handle = handleOf(i);
  const named = P.name(i);
  const lines = row.dumps >= 2
    ? [`${named} (${handle}) has done this ${row.dumps} times now. Do not buy anything this dev launches.`, `Screenshot this: ${named} dumped ${sold.toLocaleString('en-US')} ${m.ticker} on us, again.`, `Reported ${named}. ${row.dumps} coins, same exit.`]
    : [`${named} just sold ${sold.toLocaleString('en-US')} of their own ${m.ticker} into us. That is the dev.`, `${named} is out. Handle ${handle}, and it is their coin.`, `Watch ${named}: sold the founder bag while we were buying.`];
  const voices = holding.filter((x) => P.alive(x)).slice(0, 3);
  for (let k = 0; k < voices.length; k++) {
    const id = `${m.id}:dd:${(m.saidSeq = (m.saidSeq ?? 0) + 1)}`;
    (m.said ??= []).push({ id, abs: abs + 2 + k * 3, who: voices[k], text: lines[k % lines.length] });
  }
  if (m.said && m.said.length > 80) m.said.splice(0, m.said.length - 80);
  notify(w, {
    kind: 'coin', title: `The ${m.ticker} buyers saw you sell`, urgent: true, cause: ev,
    text: `You sold ${sold.toLocaleString('en-US')} ${m.ticker} while ${others} ${others === 1 ? 'person' : 'people'} held it. The coin's page names your handle, ${handle}.`,
    reason: repeat ? `This is your ${row.dumps === 2 ? 'second' : `${row.dumps}th`} dump on your own buyers. A repeat is punished harder: Reputation fell further, and the next launch starts colder.` : 'A dev selling the founder bag is the first thing a coin crowd watches for. Reputation fell. A disclosed wind-down of part of the bag would not have.',
    actions: [{ label: `Open ${m.ticker}`, line: `coin ${m.ticker}` }],
  });
}

function releaseDead(m: Meme): void {
  if (m.live) return;
  if (m.bits.length) m.bits = new Uint32Array(0);
  if (m.tells.length) m.tells = [];
  if (m.hold) m.hold = [];
  if (m.hist) m.hist = [];
  if (m.prints.length > 30) m.prints.splice(0, m.prints.length - 30);
}
function maniaCauses(m: Meme): number[] {
  const c = [m.launchEv, ...m.tells];
  return c.slice(0, 5);
}

const KING_RULE = 'King of the hill is the live coin with the largest market cap after the latest trades. A tie goes to the earlier coin.';

/** One rule, run after the round's trades and after a player's own trade, so the hero and the badge name the same coin. */
export function refreshKing(w: World): string | undefined {
  const st = book(w);
  let king: Meme | undefined, kcap = -1;
  for (const m of st.memes) {
    if (!m.live || m.rugged) continue;
    const c = spot(w, m) * (w.ledger.issued.get(m.id) ?? 0);
    if (c > kcap || (c === kcap && (!king || m.id < king.id))) { kcap = c; king = m; }
  }
  st.king = king?.id;
  st.kingAbs = st.abs ?? w.day * MIN_DAY;
  st.kingRule = KING_RULE;
  return st.king;
}

function holderRows(w: World, m: Meme): [number, number][] {
  const L = w.ledger;
  const rows: [number, number][] = [];
  for (const [slot, v] of L.holdersS(m.id)) {
    const id = L.ids[slot];
    if (!id || !id.startsWith('p_') || v <= 0) continue;
    rows.push([+id.slice(2), Math.floor(v)]);
  }
  return rows;
}

function endWord(why: EndWhy): string {
  if (why === 'age') return 'it reached the 3-day age limit';
  if (why === 'inactivity') return 'nobody traded it for 18 hours after it was a day old';
  if (why === 'drawdown') return 'it fell below 30% of its peak and nobody traded it for 8 hours';
  if (why === 'rug') return 'its creator pulled the pool';
  return 'it ended';
}

/**
 * Pay holders and take their tokens off the book. A rug pays them nothing: the creator already has the pool.
 * A delisting pays each holder their share of what the pool held, at least 1¢ when a cent is left, and says so.
 */
function settle(w: World, m: Meme, why: EndWhy, cause: number): Payout {
  const st = book(w), P = econ(w).P, L = w.ledger;
  const abs = Math.max(st.abs ?? w.day * MIN_DAY, m.bornAbs ?? m.born * MIN_DAY);
  const rows = holderRows(w, m);
  const pool = why === 'rug' ? (m.rugCash ?? poolCash(w, m)) : poolCash(w, m);
  const me = seatWho(w);
  let paid = 0, dust = 0, back = 0;
  const yoursTokens = me >= 0 ? (rows.find((r) => r[0] === me)?.[1] ?? 0) : 0;
  const lines: PayLine[] = rows.map(([who, tokens]) => ({ who, tokens, cents: 0 }));
  if (why !== 'rug' && pool > 0 && rows.length) {
    let total = 0;
    for (const [, v] of rows) total += v;
    const out = total + poolTokens(w, m);
    let left = pool;
    for (const line of lines) {
      const part = out > 0 ? Math.floor(pool * line.tokens / out) : 0;
      line.cents = Math.min(left, part);
      left -= line.cents;
    }
    // No sub-cent dead end: a holder whose share rounded to nothing still gets 1¢ while a cent remains.
    for (const line of lines) {
      if (line.cents >= 1 || line.tokens < 1 || left < 1) continue;
      line.cents = 1;
      left--;
    }
    for (const line of lines) {
      if (line.cents > 0 && pay(w, m.pool, P.id(line.who), line.cents, 'crypto.windup', cause)) paid += line.cents;
      else line.cents = 0;
    }
    // What the unsold pool tokens stand for goes back to the creator who seeded the pool. If they are gone, to the treasury.
    const rest = Math.floor(poolCash(w, m));
    if (rest > 0) {
      if (P.alive(m.creator) && pay(w, m.pool, P.id(m.creator), rest, 'crypto.windup', cause)) back = rest;
      else if (pay(w, m.pool, GOV, rest, 'crypto.windup', cause)) dust = rest;
    }
  }
  for (const line of lines) {
    const have = Math.floor(L.balance(P.id(line.who), m.id));
    if (have > 0) L.redeem(m.id, P.id(line.who), have, why === 'rug' ? 'crypto.rug' : 'crypto.windup', cause);
    if (why === 'rug' && line.who !== m.creator) {
      const seen = (st.rugSeen ??= {});
      seen[String(line.who)] = (seen[String(line.who)] ?? 0) + 1;
    }
    noteHold(st, line.who, stillHolds(w, line.who));
  }
  const poolLeft = poolTokens(w, m);
  if (poolLeft > 0) L.redeem(m.id, m.pool, poolLeft, why === 'rug' ? 'crypto.rug' : 'crypto.windup', cause);
  const yoursCents = me >= 0 ? (lines.find((l) => l.who === me)?.cents ?? 0) : 0;
  const note = why === 'rug'
    ? `The pool held ${grouped(pool)}. ${P.name(m.creator)} kept all of it. Holders were paid nothing, and the tokens cannot be sold.`
    : `The pool held ${grouped(pool)}. Holders were paid ${grouped(paid)} for their share of the supply. ${back > 0 ? `${grouped(back)}, the share that belonged to tokens nobody had bought, went back to ${P.name(m.creator)}, who seeded the pool.` : dust > 0 ? `${grouped(dust)} went to the treasury.` : 'Nothing was left over.'}`;
  const top = lines.slice().sort((a, b) => b.tokens - a.tokens || a.who - b.who).slice(0, 8);
  if (me >= 0 && yoursTokens > 0 && !top.some((l) => l.who === me)) {
    const mine = lines.find((l) => l.who === me);
    if (mine) top.push(mine);
  }
  const payout: Payout = { pool, taken: why === 'rug' ? pool : back, paid, dust, holders: lines.length, lines: top, yoursTokens, yoursCents, note };
  m.settled = true;
  m.live = false;
  m.endWhy = why;
  m.endAbs = abs;
  m.deadDay = w.day;
  const tally = (st.tally ??= { launches: 0, rugs: 0, mania: 0, age: 0, inactivity: 0, drawdown: 0, before: 0 });
  if (why === 'rug') tally.rugs++;
  else if (why === 'age' || why === 'inactivity' || why === 'drawdown') tally[why]++;
  if (abs < (m.bornAbs ?? m.born * MIN_DAY)) tally.before++;
  m.payout = payout;
  m.cost.clear();
  releaseDead(m);
  return payout;
}

function rug(w: World, m: Meme): void {
  if (m.rugged || m.settled) return;
  const st = book(w);
  const P = econ(w).P, L = w.ledger;
  const cash = poolCash(w, m);
  const last = spot(w, m);
  const holders = holderRows(w, m).map((r) => r[0]);
  const ev = w.events.emit('crypto.rug', `${P.name(m.creator)} pulled the ${m.name} pool and kept ${grouped(cash)}. Holders were paid nothing`, maniaCauses(m), P.id(m.creator));
  if (cash > 0 && !pay(w, m.pool, P.id(m.creator), cash, 'crypto.rug', ev)) throw new Error(`rug cash ${m.id}`);
  const left = poolTokens(w, m);
  if (left > 0 && !L.redeem(m.id, m.pool, left, 'crypto.rug', ev)) throw new Error(`rug tokens ${m.id}`);
  m.rugged = true;
  m.rugCash = cash;
  m.rugPx = last;
  m.rugAbs = Math.max(st.abs ?? w.day * MIN_DAY, m.bornAbs ?? 0);
  m.withdrawn = (m.withdrawn ?? 0) + cash;
  (st.rugBars ??= []).push({ id: m.id, last });
  if (st.rugBars.length > 40) st.rugBars.splice(0, st.rugBars.length - 40);
  const payout = settle(w, m, 'rug', ev);
  const mine = payout.yoursTokens;
  if (mine > 0) holderNotice(w, m, `${m.ticker} was rugged`, `${payout.note} You held ${mine.toLocaleString('en-US')} ${m.ticker}, now worth nothing. They have left your holdings.`, ev, true, true);
  (st.rugs ??= []).push(m.rugAbs ?? 0);
  if (st.rugs.length > 12) st.rugs.shift();
  st.rugLoss += cash;
  dropTrust(w, m.creator);
  if (isSeatPerson(w, m.creator) && holders.some((i) => i !== m.creator)) {
    const row = devRow(w, m.creator);
    row.dumps++;
    row.hurt += holders.filter((i) => i !== m.creator).length;
    row.cents += cash;
    row.last = w.day;
    if (!row.dumpIds.includes(m.id)) row.dumpIds.push(m.id);
    nudgeStanding(w, m.creator, -(8 + 6 * Math.min(4, row.dumps)));
  }
  for (const i of holders) {
    if (i === m.creator || !P.alive(i)) continue;
    thought(w, econ(w), i, 300, `lost money in the ${m.name} rug`, ev);
  }
  refreshKing(w);
}

// ---- the minute engine ----
// Every game minute the city's traders buy and sell the coins through their pools and the dealers' ladders. A coin's
// crowd is whoever is greedy, young or idle: the same people who are in the city all day. In a headless run the minutes
// are not lived, so each day runs a few coarse rounds instead, each standing for several hours of the same trading.

const HIST_KEEP = 96; // numbers: 48 pairs

function priceAt(h: number[] | undefined, t: number, dflt: number): number {
  if (!h || !h.length) return dflt;
  for (let k = h.length - 2; k >= 0; k -= 2) if (h[k] <= t) return h[k + 1];
  return h[1];
}
function pushHist(h: number[], abs: number, px: number, gap: number): void {
  if (h.length && abs - h[h.length - 2] < gap) { h[h.length - 1] = px; return; }
  h.push(abs, px);
  if (h.length > HIST_KEEP) h.splice(0, h.length - HIST_KEEP);
}

function refreshDegens(w: World, want: number): void {
  const st = book(w), P = econ(w).P;
  const list = (st.degens ??= []);
  const n = P.n;
  if (n <= 0) return;
  const cur = st.dcur ?? 0;
  for (let k = 0; k < want; k++) {
    const i = (cur + k) % n;
    const at = list.indexOf(i);
    const ok = P.alive(i) && !isSeatPerson(w, i) && ageOf(w, i) >= 16 && w.day >= P.fearUntil[i] && cashOf(w, P.id(i)) >= 3000
      && (P.greed[i] >= 40 || ageOf(w, i) < 30 || P.employer[i] < 0);
    if (ok && at < 0) {
      if (list.length < 600) list.push(i);
      else list[mix(w.day, i, k) % list.length] = i;
    } else if (!ok && at >= 0) { list[at] = list[list.length - 1]; list.pop(); }
  }
  st.dcur = (cur + want) % n;
}

function climate(w: World, abs: number): void {
  const st = book(w), P = econ(w).P, s = econ(w);
  if (st.climAbs !== undefined && abs - st.climAbs < 60) return;
  st.climAbs = abs;
  let live = 0, hot = 0;
  for (const m of st.memes) {
    if (!m.live) continue;
    live++;
    if (spot(w, m) > priceAt(m.hist, abs - 360, m.bornPx) * 1.5) hot++;
  }
  st.mania = live ? hot / live : 0;
  const rugs = (st.rugs ?? []).filter((t) => abs - t < 2880).length;
  st.slump = Math.min(1, rugs / 4) * 0.6 + Math.max(0, Math.min(0.5, (s.unemployment - 0.07) * 8));
  let mood = 0, k = 0;
  for (let j = 0; j < 200 && P.n > 0; j++) { mood += P.mood[mix(abs, j, 5) % P.n]; k++; }
  st.mood = k ? mood / k : 67;
}

/** Launches a game day at this moment. About one a day, and the day itself varies: some days none, a hot day a few. */
function launchRate(w: World, abs: number): number {
  const st = book(w);
  const moodF = Math.max(0.55, Math.min(1.25, (st.mood ?? 67) / 67));
  const dayVar = 0.25 + 1.5 * unit(w, Math.floor(abs / MIN_DAY), 9, 3);
  return 1.05 * dayVar * moodF * (1 + 0.6 * (st.mania ?? 0)) * (1 - 0.8 * (st.slump ?? 0));
}

/** Coins the city's own launchers have live: the cap applies to them, never to the player's coins. */
function cityLive(w: World): number {
  let n = 0;
  for (const m of book(w).memes) if (m.live && !isSeatPerson(w, m.creator)) n++;
  return n;
}

function launchStep(w: World, abs: number, span: number): void {
  const st = book(w), P = econ(w).P;
  let live = cityLive(w);
  if (live >= MAX_LIVE || P.n <= 0) return;
  const e = launchRate(w, abs) * span / MIN_DAY;
  let n = Math.floor(e) + (unit(w, abs, 1, 1) < e - Math.floor(e) ? 1 : 0);
  while (n-- > 0 && live < MAX_LIVE) {
    let made = false;
    for (let k = 0; k < 80 && !made; k++) {
      const i = (st.cursor + k) % P.n;
      if (!P.alive(i) || isSeatPerson(w, i) || ageOf(w, i) < 18 || w.day < P.fearUntil[i]) continue;
      // A chief or an officeholder has one public life already: they do not launch coins.
      if (publicFigure(w, i)) continue;
      const cash = cashOf(w, P.id(i));
      if (cash < FEE + SEED_MIN + 1_000) continue;
      const who = persona(w, i);
      if (unit(w, abs, i, 2) * 6 > who.score) continue;
      if (contactsOf(w, i).length < 2) continue;
      st.cursor = (i + 1) % P.n;
      made = !!launch(w, i, {}, seedFor(w, i));
    }
    if (!made) st.cursor = (st.cursor + 80) % P.n;
    else live++;
  }
}

function attention(w: World, m: Meme, abs: number, px: number): number {
  const st = book(w);
  const age = abs - (m.bornAbs ?? abs);
  let a = 0.14;
  if (age < 180) a += 0.7 * (1 - age / 180);
  const mom = px / priceAt(m.hist, abs - 30, m.bornPx);
  if (mom > 1) a += Math.min(1.4, (mom - 1) * 3.5);
  else a += Math.min(0.5, (1 - mom) * 1.5);
  a += 0.6 * Math.max(0, Math.min(1, (m.flow ?? 0) / Math.max(5000, poolCash(w, m) * 0.5)));
  if (m.id === st.king) a += 0.25;
  return Math.min(3, a * (m.appeal ?? 1));
}

function crowdBuy(w: World, m: Meme, i: number, abs: number, px: number, att: number, lot: number): void {
  const P = econ(w).P;
  if (i === m.creator || !P.alive(i) || isSeatPerson(w, i)) return;
  if (!heard(m, i)) {
    // A fresh launch sits on the board for everyone to see, so people who watch it come across it without a friend's tip.
    const fresh = Math.max(0, 1 - (abs - (m.bornAbs ?? abs)) / 360);
    if (unit(w, abs, i, 21) > 0.04 + 0.08 * att + 0.3 * fresh) return;
    hear(m, i);
  }
  const chase = (P.cY[i] - 0.86) / 0.13;
  const nerve = P.resil[i] / 100;
  const age = abs - (m.bornAbs ?? abs);
  const mom = px / priceAt(m.hist, abs - 30, m.bornPx);
  const gullible = P.greed[i] >= 62 || (ageOf(w, i) < 26 && P.resil[i] < 48);
  const beliefAge = abs - (m.beliefAbs ?? abs);
  const belief = (m.belief ?? 0) * Math.pow(0.5, Math.max(0, beliefAge) / 240);
  const heardPost = m.beliefKind === 'hype' ? gullible : m.beliefKind === 'disclosure' || heard(m, i);
  let want = 0.1 + 0.45 * chase + (age < 240 ? 0.2 : 0) + 0.3 * Math.min(1, Math.max(0, mom - 1) * 4) - (mom < 0.85 ? 0.4 : 0) - 0.15 * nerve;
  if (mom > 1.4 && age < 2000) want += 0.18;
  if (heardPost && belief !== 0) want += belief * (m.beliefKind === 'hype' ? (gullible ? 0.45 : 0) : 0.4);
  // Buyers tire as the price runs away from where it started.
  want = Math.max(0, Math.min(0.9, want)) / (1 + 0.2 * Math.max(0, px / m.bornPx - 1));
  if (unit(w, abs, i, 22) > want) return;
  const cushion = cashOf(w, P.id(i)) - P.incEma[i] * 14;
  if (cushion < 600) return;
  const room = Math.floor(poolCash(w, m) * 0.25);
  const spend = Math.min(Math.floor(Math.max(500, Math.min(12_000, cushion * (0.02 + 0.08 * chase))) * lot), room, Math.floor(cushion * 0.5));
  if (spend < 300) return;
  buyMeme(w, m, i, spend, m.tells[m.tells.length - 1] ?? m.launchEv, false);
}

function crowdSell(w: World, m: Meme, i: number, abs: number, px: number, lot: number): void {
  const P = econ(w).P;
  if (i === m.creator || isSeatPerson(w, i)) return;
  const held = Math.floor(w.ledger.balance(P.id(i), m.id));
  if (held < 1) return;
  const cost = m.cost.get(i) ?? 0;
  const gain = cost > 0 ? held * px / cost - 1 : 0;
  const mom = px / priceAt(m.hist, abs - 15, m.bornPx);
  const nerve = P.resil[i] / 100;
  const greedy = P.greed[i] / 100;
  let p = 0.02;
  if (gain > 0.5) p += 0.18 + 0.2 * (1 - greedy);
  if (gain > 1.5) p += 0.3;
  if (mom < 0.92) p += 0.25 * (1 - nerve);
  if (gain < -0.35) p += 0.05 + 0.1 * (1 - nerve);
  if (m.peak && px < m.peak * 0.6 && gain > 0) p += 0.25;
  p = Math.min(0.95, p * Math.sqrt(lot));
  if (unit(w, abs, i, 31) > p) return;
  const frac = gain > 0.5 && gain < 3 && mom > 0.95 ? 0.5 : 1;
  const qty = Math.max(1, Math.floor(held * frac));
  sellMeme(w, m, i, qty, m.tells[m.tells.length - 1] ?? m.launchEv);
}

function rugProne(w: World, m: Meme): boolean {
  const P = econ(w).P;
  const i = m.creator;
  // Both a cold circle and a greedy nerve, or a very greedy shaky launcher. Most creators are neither.
  const cold = loyalty(w, i) < 55 && P.greed[i] > 52;
  const shaky = P.greed[i] > 66 && P.resil[i] < 50;
  return cold || shaky;
}

/** Chance a prone creator pulls a fat pool over `span` minutes. A thin or quiet pool is not an opportunity. */
function rugHazard(span: number): number {
  const daily = 0.45;
  return 1 - Math.pow(1 - daily, span / MIN_DAY);
}

function coinWatch(w: World, m: Meme, abs: number, span: number): void {
  const P = econ(w).P;
  const px = spot(w, m);
  if (!(px > 0)) return;
  if (px > (m.peak ?? 0)) m.peak = px;
  const age = abs - (m.bornAbs ?? abs);
  // A 6× print on a thin pool is one buyer. Mania is the price and a crowd that actually paid in.
  const earned = px >= m.bornPx * 6 && (m.buyers ?? 0) >= 5 && (m.outsideBuy ?? 0) >= m.seed * 1.5;
  if (!m.pumpEv && earned && age <= 4320) {
    (book(w).tally ??= { launches: 0, rugs: 0, mania: 0, age: 0, inactivity: 0, drawdown: 0, before: 0 }).mania++;
    m.pumpAbs = abs;
    m.pumpEv = w.events.emit('crypto.mania', `${m.name} is up ${(px / m.bornPx).toFixed(1)}× since launch, from ${m.bornPx.toFixed(2)}¢ to ${px.toFixed(2)}¢ a coin, on ${m.buyers} buyers`, maniaCauses(m), P.id(m.creator));
    holderNotice(w, m, `${m.ticker} is up ${(px / m.bornPx).toFixed(1)}×`, `${m.name} has run from ${m.bornPx.toFixed(2)}¢ to ${px.toFixed(2)}¢ since launch.`, m.pumpEv, false);
    if (isSeatPerson(w, m.creator)) { const row = devRow(w, m.creator); if (!row.goodIds.includes(m.id) && !row.dumpIds.includes(m.id)) { row.good++; row.goodIds.push(m.id); nudgeStanding(w, m.creator, 3); } }
  }
  if (m.pumpEv && !m.dumpEv && m.peak && px <= m.peak * 0.5) {
    m.dumpAbs = abs;
    m.dumpEv = w.events.emit('crypto.crash', `${m.name} fell ${((1 - px / m.peak) * 100).toFixed(0)}% from its peak as holders took their money out`, [m.launchEv, m.pumpEv], P.id(m.creator));
    holderNotice(w, m, `${m.ticker} fell ${((1 - px / m.peak) * 100).toFixed(0)}% from its peak`, `${m.name} is at ${px.toFixed(2)}¢, down from ${m.peak.toFixed(2)}¢, as holders take their money out.`, m.dumpEv, true);
  }
  // A prone creator pulls a fat pool. A thin pool, or a steady creator, does not rug.
  const fat = !!m.peak && poolCash(w, m) >= m.seed * 1.25 && px >= m.peak * 0.55;
  if (!isSeatPerson(w, m.creator) && age > 360 && fat && rugProne(w, m)) {
    if (unit(w, abs, m.creator, 41) < rugHazard(span)) { rug(w, m); return; }
  }
  // Three different endings, each named. A player's own coin gets its first game day before they apply.
  const idle = abs - (m.lastAbs ?? abs);
  const lowFromPeak = m.peak ? px < m.peak * 0.3 : false;
  let why: EndWhy = '';
  if (!(age < MIN_DAY && isSeatPerson(w, m.creator))) {
    if (age > 4320) why = 'age';
    else if (age > 1440 && idle > 1080) why = 'inactivity';
    else if (age > 480 && lowFromPeak && idle > 480) why = 'drawdown';
  }
  if (why) delist(w, m, why, abs);
}

function delist(w: World, m: Meme, why: EndWhy, abs: number): void {
  if (!m.live || m.rugged || m.settled) return;
  const P = econ(w).P;
  const pool = poolCash(w, m);
  const ev = w.events.emit('crypto.delist', `${m.name} was delisted: ${endWord(why)}. The pool held ${grouped(pool)}`, maniaCauses(m), P.id(m.creator));
  const payout = settle(w, m, why, ev);
  const mine = payout.yoursTokens;
  const whyLine = why === 'age'
    ? `${m.name} reached the 3-day age limit and was delisted. It can have traded minutes before: age took it off, not silence.`
    : `${m.name} was delisted because ${endWord(why)}.`;
  if (mine > 0) holderNotice(w, m, `${m.ticker} is off the board`, `${whyLine} ${payout.note} You held ${mine.toLocaleString('en-US')} ${m.ticker} and were paid ${grouped(payout.yoursCents)}. The tokens have left your holdings.`, ev, why === 'age', true);
  refreshKing(w);
}

function majorRound(w: World, abs: number, span: number, cap: number): void {
  const st = book(w), L = w.ledger, P = econ(w).P;
  const degens = st.degens ?? [];
  if (!degens.length) return;
  const mood = ((st.mood ?? 67) - 67) / 33;
  for (let mi = 0; mi < st.majors.length; mi++) {
    const m = st.majors[mi];
    const h = (m.hist ??= [abs, majorMid(m)]);
    const mid = majorMid(m);
    const mom = mid / priceAt(h, abs - 60, mid) - 1;
    pushHist(h, abs, mid, span > 1 ? span / 2 : 10);
    const rate = 0.5;
    const draws = span <= 1 ? (unit(w, abs, mi, 51) < rate ? 1 : 0) : Math.min(cap, Math.round(rate * span));
    const size = span <= 1 ? 1 : Math.max(1, (rate * span) / Math.max(1, draws));
    for (let k = 0; k < draws; k++) {
      let i = degens[Math.floor(unit(w, abs, mi * 64 + k, 52) * degens.length)];
      if (!P.alive(i) || isSeatPerson(w, i)) continue;
      const pBuy = Math.max(0.15, Math.min(0.85, 0.5 + 0.3 * mood + Math.max(-0.2, Math.min(0.2, mom * 4))));
      let buy = unit(w, abs, i, 53) < pBuy;
      // The market stays two-sided: with the dealers out of coins nobody can buy, and a seller is someone who holds some.
      const stock = Math.floor(L.balance(MM, m.id)) + Math.floor(L.balance(MOM, m.id));
      if (buy && stock < 1) buy = false;
      if (!buy) {
        let seller = -1;
        for (let t = 0; t < 12 && seller < 0; t++) {
          const j = degens[Math.floor(unit(w, abs, mi * 64 + k * 13 + t, 56) * degens.length)];
          if (P.alive(j) && !isSeatPerson(w, j) && L.balance(P.id(j), m.id) >= 1) seller = j;
        }
        if (seller >= 0) i = seller;
        else if (stock >= 1) buy = true;
        else continue;
      }
      const id = P.id(i);
      const whale = unit(w, abs, i, 54) < 0.01;
      const base = 1 + Math.floor((P.greed[i] / 100) * 5 * unit(w, abs, i, 55));
      const qty = Math.max(1, Math.round((whale ? base * 6 : base) * size));
      if (buy) {
        const afford = Math.floor(cashOf(w, id) * 0.3 / Math.max(1, mid));
        const q = Math.min(qty, afford);
        if (q >= 1) walkMajor(w, id, m, 'buy', q, null, st.root);
      } else {
        const held = Math.floor(L.balance(id, m.id));
        if (held >= 1) walkMajor(w, id, m, 'sell', Math.min(qty, held), null, st.root);
      }
    }
    // The dealers re-centre: a push away from the quote fades with a half-life of a couple of hours.
    if (m.imp) { m.imp *= Math.pow(0.995, Math.min(span, 360)); if (Math.abs(m.imp) < 0.0003) m.imp = 0; }
  }
}

/**
 * One round of coin trading standing for `span` game minutes at minute `abs`. Live play runs it every minute with span 1;
 * a headless day runs a few with a long span and a cap on the draws, so the same trading costs a fraction as much.
 */
function coinRound(w: World, abs: number, span: number, cap: number): void {
  const st = book(w);
  st.abs = abs;
  answerDue(w, abs);
  if (!st.degens || (st.degens.length < 200 && abs - (st.climAbs ?? -9999) > 30)) refreshDegens(w, 6000);
  climate(w, abs);
  launchStep(w, abs, span);
  const degens = st.degens ?? [];
  const live = st.memes.filter((m) => m.live);
  for (const m of live) {
    if (!m.live || m.rugged) continue;
    m.flow = (m.flow ?? 0) * Math.pow(0.9, Math.min(span, 30));
    const px = spot(w, m);
    if (!(px > 0)) continue;
    m.hist ??= [abs, px];
    pushHist(m.hist, abs, px, span > 1 ? span / 2 : 10);
    if (span > 1 || abs % 30 === 0) m.weekPx = priceAt(m.hist, abs - 1440, m.bornPx);
    const att = attention(w, m, abs, px);
    let buys = att * span, sells = Math.max(1, (m.hold?.length ?? 0)) * Math.min(1, 0.25 * att) * span;
    let scale = 1;
    if (span > 1) {
      const total = buys + sells;
      const draws = Math.min(cap, total);
      scale = total > draws ? total / Math.max(1, draws) : 1;
      buys = buys * draws / Math.max(1, total);
      sells = sells * draws / Math.max(1, total);
    }
    const nb = Math.floor(buys) + (unit(w, abs, m.creator, 61) < buys - Math.floor(buys) ? 1 : 0);
    const ns = Math.floor(sells) + (unit(w, abs, m.creator, 62) < sells - Math.floor(sells) ? 1 : 0);
    for (let k = 0; k < nb && degens.length; k++) {
      const i = degens[Math.floor(unit(w, abs, m.creator * 131 + k, 63) * degens.length)];
      crowdBuy(w, m, i, abs, spot(w, m), att, scale);
    }
    for (let k = 0; k < ns && m.hold && m.hold.length; k++) {
      const i = m.hold[Math.floor(unit(w, abs, m.creator * 131 + k, 64) * m.hold.length)];
      crowdSell(w, m, i, abs, spot(w, m), scale);
    }
    // People talk: a few holders tell their contacts, and the more the coin has risen the more they pass it on.
    if (m.live && (span > 1 ? abs % MIN_DAY === 180 : abs % 20 === 0) && m.hold && m.hold.length) {
      for (let k = 0; k < 2; k++) tell(w, m, m.hold[Math.floor(unit(w, abs, k, 65) * m.hold.length)], false);
    }
    if (m.live) coinWatch(w, m, abs, span);
  }
  // After this round's trades and delistings, so the hero and the badge name the same coin.
  refreshKing(w);
  majorRound(w, abs, span, Math.max(2, cap / 2));
}

/** The live clock, as the player acts: a launch, a trade or a post is stamped with the game minute it happens at, even before the minute layer has run. */
export function coinClock(w: World, abs: number): void {
  const st = w.state.crypto as Book | undefined;
  if (st && abs > (st.abs ?? 0)) st.abs = abs;
}

/** Called by the minute layer once per game minute. */
export function coinMinuteStep(w: World, abs: number): void {
  const st = book(w);
  if (!st) return;
  const day = Math.floor(abs / MIN_DAY);
  if (st.minDay !== day) { st.minDay = day; st.minRuns = 0; }
  st.minRuns = (st.minRuns ?? 0) + 1;
  coinRound(w, abs, 1, 8);
}

/** What the chart's minute bar reads for a coin: the price now, the extremes the trades reached and the coins traded. Resets the minute. */
export function coinMinute(w: World, id: string): { px: number; hi: number; lo: number; vol: number } | undefined {
  const st = book(w);
  if (!st) return undefined;
  const take = (o: { mVol?: number; mHi?: number; mLo?: number }, px: number): { px: number; hi: number; lo: number; vol: number } => {
    const r = { px, hi: Math.max(px, o.mHi ?? 0), lo: Math.min(px, o.mLo ?? Infinity), vol: o.mVol ?? 0 };
    o.mVol = 0; o.mHi = 0; o.mLo = Infinity;
    return r;
  };
  if (id.startsWith('coin:me:')) {
    const m = st.memes.find((x) => x.id === id);
    if (!m || !m.live || m.rugged) return undefined;
    return take(m, spot(w, m));
  }
  const major = st.majors.find((x) => x.id === id);
  if (!major) return undefined;
  return take(major, majorMid(major));
}

/** The first bar of a coin the minute layer has not drawn yet (launched a moment ago): its price now, at its launch minute. */
export function coinSeedBar(w: World, id: string): { id: string; name: string; t: number; px: number; v: number; hi: number; lo: number } | null {
  const m = memeOf(w, id);
  if (!m) return null;
  const px = m.rugged ? (m.rugPx ?? m.bornPx) : spot(w, m) || m.bornPx;
  const hi = m.mHi && m.mHi > 0 ? Math.max(px, m.mHi) : px;
  const lo = m.mLo !== undefined && m.mLo < Infinity ? Math.min(px, m.mLo) : px;
  return { id: m.id, name: m.name, t: Math.floor(m.lastAbs ?? m.bornAbs ?? m.born * MIN_DAY), px, v: m.mVol ?? 0, hi, lo };
}

/** Fills the minute layer has not sampled yet, so a paused chart still shows the first trade's volume. */
export function coinPendingBar(w: World, id: string): { t: number; o: number; h: number; l: number; c: number; v: number } | null {
  const m = memeOf(w, id);
  if (!m || !(m.mVol && m.mVol > 0)) return null;
  const px = m.rugged ? (m.rugPx ?? m.bornPx) : spot(w, m) || m.bornPx;
  const hi = m.mHi && m.mHi > 0 ? Math.max(px, m.mHi) : px;
  const lo = m.mLo !== undefined && m.mLo < Infinity ? Math.min(px, m.mLo) : px;
  return { t: Math.floor(m.lastAbs ?? m.bornAbs ?? 0), o: lo, h: hi, l: lo, c: px, v: m.mVol };
}

/** Coins that were rugged since the minute layer last asked: their last price, so the chart can show the fall. */
export function coinRugs(w: World): { id: string; last: number }[] {
  const st = book(w);
  const out = st.rugBars ?? [];
  st.rugBars = [];
  return out;
}

/** Coarse trading for a day nobody lived minute by minute. */
function headlessDay(w: World): void {
  const st = book(w);
  if (st.minDay === w.day && (st.minRuns ?? 0) >= 600) return;
  for (let r = 0; r < 3; r++) coinRound(w, w.day * MIN_DAY + 180 + r * 480, 480, 6);
}

/** A coin that has been dead for a month is wound up: its pool pays out to whoever still holds it and it leaves the book. */
function retireDead(w: World): void {
  const st = book(w), L = w.ledger, P = econ(w).P;
  const keep: Meme[] = [];
  for (const m of st.memes) {
    if (m.live || w.day - (m.deadDay ?? m.born) < 30) { keep.push(m); continue; }
    if (m.settled) {
      const rest = Math.floor(poolCash(w, m));
      if (rest > 0) pay(w, m.pool, GOV, rest, 'crypto.windup', m.launchEv);
      const left = poolTokens(w, m);
      if (left > 0) L.redeem(m.id, m.pool, left, 'crypto.windup', m.launchEv);
      if (poolCash(w, m) < 1 && poolTokens(w, m) < 1) (st.free ??= []).push(m.pool);
      continue;
    }
    const cause = m.launchEv;
    const cash = poolCash(w, m);
    const rows: [number, number][] = [];
    let total = 0;
    for (const [slot, v] of L.holdersS(m.id)) {
      const id = L.ids[slot];
      if (!id.startsWith('p_') || v <= 0) continue;
      rows.push([+id.slice(2), v]);
      total += v;
    }
    if (!m.rugged && cash > 0 && total > 0) {
      const out = total + poolTokens(w, m);
      for (const [i, v] of rows) {
        const part = Math.floor(cash * v / out);
        if (part > 0) pay(w, m.pool, P.id(i), part, 'crypto.windup', cause);
      }
    }
    const rest = Math.floor(poolCash(w, m));
    if (rest > 0) {
      const to = P.alive(m.creator) && !isSeatPerson(w, m.creator) ? P.id(m.creator) : GOV;
      pay(w, m.pool, to, rest, 'crypto.windup', cause);
    }
    for (const [i, v] of rows) {
      L.redeem(m.id, P.id(i), Math.floor(v), 'crypto.windup', cause);
      noteHold(st, i, stillHolds(w, i));
    }
    const left = poolTokens(w, m);
    if (left > 0) L.redeem(m.id, m.pool, left, 'crypto.windup', cause);
    if (poolCash(w, m) < 1 && poolTokens(w, m) < 1) (st.free ??= []).push(m.pool);
  }
  st.memes = keep;
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
  for (const o of mine) if (!isSeatActor(w, o.actor)) o.open = false;
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
      if (P.alive(i) && !isSeatPerson(w, i) && w.day >= P.fearUntil[i]) {
        const surplus = cashOf(w, P.id(i)) - P.incEma[i] * 120;
        const qty = Math.min(3, Math.floor(surplus / mid / 40));
        if (qty >= 1) place(w, P.id(i), m.id, 'buy', qty, mid);
      }
    }
    matchMajor(w, m);
    if (m.imp) { m.imp *= 0.6; if (Math.abs(m.imp) < 0.0005) m.imp = 0; }
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
  { id: 'coin:ledger', name: 'Ledger', supply: 8_000, base: 1000 },
  { id: 'coin:north', name: 'North', supply: 5_000, base: 800 },
  { id: 'coin:halo', name: 'Halo', supply: 4_000, base: 600 },
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

// ---- depth on the majors ----
// Dealers keep a ladder either side of the mid, sized by how much of the coin they hold, so a player who
// wants a few hundred dollars of Ledger meets a price that walks, not a clip of eight coins.

const COIN_OFF = [1, 1.8, 3.2, 5.5, 9, 14];
const COIN_FRAC = [0.004, 0.006, 0.008, 0.012, 0.016, 0.024];
const COIN_KEEP = 0.35;

export interface CoinFill { px: number; qty: number }
export interface CoinTrade {
  id: string;
  name: string;
  side: 'buy' | 'sell';
  asked: number;
  filled: number;
  cents: number;
  avg: number;
  fills: CoinFill[];
  orderId?: number;
  why?: string;
}

function majorMid(m: Major): number { return Math.max(1, Math.round(m.last * (1 + (m.imp ?? 0)))); }

function majorLadder(w: World, m: Major, side: 'buy' | 'sell'): { px: number; qty: number }[] {
  const mid = majorMid(m);
  const h = 0.004 + Math.min(0.01, Math.abs(m.last / Math.max(1, m.prev) - 1) * 0.5);
  const supply = w.ledger.issued.get(m.id) ?? m.supply;
  const out: { px: number; qty: number }[] = [];
  let prev = side === 'buy' ? mid : mid + 1;
  for (let k = 0; k < COIN_OFF.length; k++) {
    let px = side === 'buy' ? Math.round(mid * (1 + h * COIN_OFF[k])) : Math.round(mid * (1 - h * COIN_OFF[k]));
    px = side === 'buy' ? Math.max(prev + 1, px) : Math.min(prev - 1, px);
    if (px < 1) break;
    const qty = Math.floor(supply * COIN_FRAC[k]);
    if (qty >= 1) out.push({ px, qty });
    prev = px;
  }
  return out;
}

function walkMajor(w: World, actor: string, m: Major, side: 'buy' | 'sell', qty: number, limit: number | null, cause: number): CoinTrade {
  const st = book(w);
  const res: CoinTrade = { id: m.id, name: m.name, side, asked: qty, filled: 0, cents: 0, avg: 0, fills: [] };
  const makers = [MM, MOM];
  const mid = majorMid(m);
  let left = qty;
  let top = 0;
  for (const lv of majorLadder(w, m, side)) {
    if (left < 1) break;
    if (limit !== null && (side === 'buy' ? lv.px > limit : lv.px < limit)) break;
    const target = Math.min(left, lv.qty);
    let want = target, got = 0;
    for (const mk of makers) {
      if (want < 1) break;
      if (side === 'buy') {
        const afford = Math.floor(cashOf(w, actor) / lv.px);
        const q = Math.min(want, Math.floor(w.ledger.balance(mk, m.id)), afford);
        if (afford < 1) break;
        if (q < 1) continue;
        if (!pay(w, actor, mk, q * lv.px, 'crypto.trade', cause)) break;
        if (!w.ledger.move(m.id, mk, actor, q, 'crypto.trade', cause)) throw new Error(`major delivery ${m.id}`);
        want -= q; got += q;
      } else {
        const held = Math.floor(w.ledger.balance(actor, m.id));
        if (held < 1) break;
        const q = Math.min(want, held, Math.floor(cashOf(w, mk) * 0.5 / lv.px));
        if (q < 1) continue;
        if (!pay(w, mk, actor, q * lv.px, 'crypto.trade', cause)) continue;
        if (!w.ledger.move(m.id, actor, mk, q, 'crypto.trade', cause)) throw new Error(`major delivery ${m.id}`);
        want -= q; got += q;
      }
    }
    if (got > 0) {
      res.fills.push({ px: lv.px, qty: got });
      res.filled += got;
      res.cents += got * lv.px;
      left -= got;
      top = lv.px;
    }
    if (got < target) break;
  }
  if (res.filled > 0) {
    res.avg = res.cents / res.filled;
    const move = mid > 0 ? top / mid - 1 : 0;
    m.imp = Math.max(-0.25, Math.min(0.25, (m.imp ?? 0) + COIN_KEEP * move));
    const after = majorMid(m);
    m.mVol = (m.mVol ?? 0) + res.filled;
    m.mHi = Math.max(m.mHi ?? 0, after, mid);
    m.mLo = Math.min(m.mLo ?? Infinity, after, mid);
    if (actor.startsWith('p_')) { const i = +actor.slice(2); noteHold(st, i, side === 'buy' ? true : stillHolds(w, i)); }
  }
  return res;
}

/** Orders the player left resting on a major. They stay until they fill or are cancelled. */
function sweepCoinOrders(w: World): void {
  const st = book(w);
  for (const o of st.orders) {
    if (!o.open || !isSeatActor(w, o.actor)) continue;
    const m = st.majors.find((x) => x.id === o.instr);
    if (!m) continue;
    const lv = majorLadder(w, m, o.side);
    if (!lv.length) continue;
    if (o.side === 'buy' ? lv[0].px > o.limit : lv[0].px < o.limit) continue;
    const r = walkMajor(w, o.actor, m, o.side, o.qty, o.limit, st.root);
    o.qty -= r.filled;
    if (o.qty < 1) o.open = false;
  }
  if (st.orders.length > 400) st.orders = st.orders.filter((o) => o.open);
}

/** Cancel a resting coin order. */
export function cancelCoinOrder(w: World, actor: string, orderId: number): boolean {
  const o = book(w).orders.find((x) => x.id === orderId);
  if (!o || !o.open || o.actor !== actor) return false;
  o.open = false;
  return true;
}

/** Price in cents of a coin as the quote now stands, for a stop to read. */
export function coinPrice(w: World, coin: string): { id: string; name: string; px: number } | undefined {
  const st = book(w);
  const key = coin.toLowerCase();
  const major = st.majors.find((m) => m.id.toLowerCase() === key || m.name.toLowerCase() === key || m.id.toLowerCase() === 'coin:' + key);
  if (major) return { id: major.id, name: major.name, px: majorMid(major) };
  const meme = memeOf(w, coin);
  if (meme && meme.live && !meme.rugged) return { id: meme.id, name: meme.name, px: spot(w, meme) };
  return undefined;
}

/**
 * Trade a coin now. A major walks the dealers' ladder (a limit order fills what is marketable and the rest rests);
 * a memecoin trades against its pool. `qty` is coins for a major and, for a meme buy, cents to spend; a meme sale is coins.
 */
export function orderCoin(w: World, actor: string, coin: string, side: 'buy' | 'sell', qty: number, limit?: number): CoinTrade & { fill?: number } {
  const none: CoinTrade = { id: '', name: coin, side, asked: qty, filled: 0, cents: 0, avg: 0, fills: [] };
  if (!w.ledger.actors.has(actor)) return { ...none, why: `unknown actor ${actor}` };
  if (!Number.isSafeInteger(qty) || qty < 1) return { ...none, why: 'qty must be a positive integer' };
  const st = book(w);
  const key = coin.toLowerCase();
  const major = st.majors.find((m) => m.id.toLowerCase() === key || m.name.toLowerCase() === key || m.id.toLowerCase() === 'coin:' + key);
  if (major) {
    const cap = limit && limit > 0 ? Math.round(limit) : null;
    const r = walkMajor(w, actor, major, side, qty, cap, st.root);
    const left = qty - r.filled;
    if (cap !== null && left > 0) {
      const id = st.nextId++;
      st.orders.push({ id, actor, instr: major.id, side, qty: left, limit: cap, seq: st.seq++, open: true });
      r.orderId = id;
    }
    if (r.filled < 1 && r.orderId === undefined) {
      const ladder = majorLadder(w, major, side);
      const px = ladder[0]?.px ?? 0;
      if (side === 'buy') {
        if (cap !== null && px > 0 && px > cap) r.why = 'limit';
        else if (px > 0 && Math.floor(cashOf(w, actor) / px) < 1) r.why = 'too little cash';
        else r.why = 'no willing seller';
      } else if (Math.floor(w.ledger.balance(actor, major.id)) < 1) r.why = 'you hold none';
      else if (cap !== null && px > 0 && px < cap) r.why = 'limit';
      else r.why = 'no willing buyer';
    }
    return { ...r, fill: r.filled };
  }
  const meme = memeOf(w, coin);
  if (!meme) return { ...none, why: `no coin ${coin}` };
  if (meme.rugged || meme.settled || (!meme.live && side === 'buy')) {
    const gone = meme.payout
      ? `${meme.ticker} has ended (${endWord(meme.endWhy || 'rug')}). ${meme.payout.note} You held ${meme.payout.yoursTokens.toLocaleString('en-US')} and were paid ${grouped(meme.payout.yoursCents)}. Those tokens cannot be sold.`
      : meme.rugged ? `${meme.ticker} was rugged. The tokens cannot be sold.` : `no coin ${coin}`;
    return { ...none, id: meme.id, name: meme.name, why: gone };
  }
  if (!actor.startsWith('p_')) return { ...none, id: meme.id, name: meme.name, why: 'a memecoin trades from a person' };
  const i = +actor.slice(2);
  const base: CoinTrade = { ...none, id: meme.id, name: meme.name };
  if (side === 'buy') {
    const got = buyMeme(w, meme, i, qty, meme.launchEv, true);
    if (got < 1) return { ...base, why: 'the pool did not take that buy: too small to buy a whole coin, or you cannot pay' };
    return { ...base, filled: got, cents: qty, avg: qty / got, fills: [{ px: qty / got, qty: got }], fill: got };
  }
  const held = Math.floor(w.ledger.balance(actor, meme.id));
  const quoted = quoteSell(poolCash(w, meme), poolTokens(w, meme), Math.min(qty, held));
  if (held >= 1 && quoted < 1 && Math.min(qty, held) < held) return { ...base, why: 'that sale is under 1¢. Sell more tokens, or sell the whole holding: a whole holding under 1¢ clears for 1¢ when the pool can pay it' };
  const got = sellMeme(w, meme, i, qty, meme.launchEv);
  if (got < 1) return { ...base, why: held < 1 ? 'you hold none of that coin' : 'the pool cannot pay 1¢ for that sale' };
  const sold = Math.min(qty, held);
  if (i === meme.creator && isSeatPerson(w, i)) devDump(w, meme, i, sold, got);
  return { ...base, filled: sold, cents: got, avg: got / sold, fills: [{ px: got / sold, qty: sold }], fill: sold };
}

/**
 * Launch a coin. An NPC creator passes the gates of temperament, fear, contacts and spare cash. A player seat only
 * needs the cash for the fee, the seed and the starting buy, and room on the exchange: the player decides, not the temperament.
 */
export function launchCoin(w: World, person: number, opts: LaunchOpts = {}): { id?: string; name?: string; ticker?: string; why?: string } {
  const st = book(w), P = econ(w).P;
  if (person < 0 || person >= P.n || !P.alive(person)) return { why: 'dead' };
  const buy = opts.buy ?? 0;
  // The player seeds the pool from the same range every city launcher uses, and chooses where in it.
  const seat = isSeatPerson(w, person);
  const seed = seat ? Math.max(SEED_MIN, Math.min(SEED, opts.seed ?? SEED_MIN)) : seedFor(w, person);
  if (seat) {
    if (cashOf(w, P.id(person)) < FEE + seed + buy) return { why: `a launch needs $${((FEE + seed + buy) / 100).toFixed(2)} of cash: ${grouped(seed)} seed, ${grouped(FEE)} fee and the starting buy` };
  } else {
    if (w.day < P.fearUntil[person]) return { why: 'too shaken to launch a coin' };
    if (P.resil[person] < 55) return { why: 'not the temperament to launch a coin' };
    if (contactsOf(w, person).length < 2) return { why: 'a launch needs two contacts to tell' };
    if (cashOf(w, P.id(person)) < FEE + SEED_MIN + 1_000) return { why: 'needs spare cash for the fee and the seed' };
  }
  const n0 = st.memes.length;
  const m = launch(w, person, opts, seed);
  if (st.memes.length === n0 || !m) return { why: 'the launch did not clear' };
  return { id: m.id, name: m.name, ticker: m.ticker };
}

function memeOf(w: World, instr: string): Meme | undefined {
  const key = instr.toLowerCase();
  const up = instr.toUpperCase();
  return book(w).memes.find((m) => m.id.toLowerCase() === key || m.name.toLowerCase() === key || m.id.toLowerCase() === 'coin:' + key || m.ticker === up);
}

/** Every memecoin the exchange has listed, read from its pool and ledger. `me` is the player's person index. */
export function memeBoard(w: World, me: number, now?: number): MemeRow[] {
  const P = econ(w).P;
  const st = book(w);
  const clock = now ?? st.abs ?? 0;
  const out: MemeRow[] = [];
  for (const m of st.memes) {
    const live = m.live && !m.rugged;
    const tokens = poolTokens(w, m);
    const cash = poolCash(w, m);
    const px = m.rugged ? 0 : spot(w, m);
    const supply = w.ledger.issued.get(m.id) ?? 0;
    let holders = 0;
    if (!m.rugged) for (const [who, n] of w.ledger.holders(m.id)) if (who.startsWith('p_') && n > 0) holders++;
    const last = m.prints.length ? m.prints[m.prints.length - 1] : undefined;
    const lastAbs = m.lastAbs ?? last?.abs ?? m.born * MIN_DAY;
    const heat = (m.heat ?? 0) * Math.pow(0.5, Math.max(0, (st.abs ?? lastAbs) - (m.heatAbs ?? lastAbs)) / 120);
    out.push({
      id: m.id, name: m.name, ticker: m.ticker, creator: m.creator, creatorName: P.name(m.creator),
      mine: m.creator === me, live, rugged: m.rugged, born: m.born, eventId: m.launchEv,
      bornAbs: m.bornAbs ?? m.born * MIN_DAY, h1: live && px > 0 ? (() => { const a = priceAgo(m, clock, 60); return a && a > 0 ? px / a : null; })() : 1, king: live && st.king === m.id,
      px, prev: m.weekPx, supply, cap: Math.round(px * supply), sold: m.rugged ? 0 : Math.max(0, Math.min(1, 1 - tokens / POOL_TOKENS)),
      raised: Math.max(0, (m.outsideBuy ?? 0)), seed: m.seed, founderBuy: m.founderBuy ?? 0, outsideBuy: m.outsideBuy ?? 0, withdrawn: m.withdrawn ?? 0,
      cash, tokens, holders, vol: m.volTotal ?? 0,
      lastDay: last ? last.day : m.born, replies: m.tells.length,
      lastAbs, trades: m.trades ?? m.prints.length, volTotal: m.volTotal ?? 0, heat: Math.round(heat), peak: m.peak ?? px,
      ended: m.rugged ? 'rugged' : m.live ? '' : 'faded',
      endWhy: m.endWhy ?? (m.rugged ? 'rug' : ''),
      endAbs: m.live ? 0 : Math.max(m.endAbs ?? m.rugAbs ?? (m.deadDay ?? m.born) * MIN_DAY, m.bornAbs ?? m.born * MIN_DAY),
      rugCash: m.rugCash ?? 0, windDay: m.live || m.settled ? 0 : (m.deadDay ?? m.born) + 30,
      payout: m.payout, kingRule: st.kingRule ?? KING_RULE,
    });
  }
  return out;
}

export interface TapeRow { coin: string; ticker: string; coinName: string; seq: number; day: number; abs: number; side: 'buy' | 'sell'; tokens: number; cents: number; who: number; name: string; mine: boolean }

/** The newest trades across the live coins, newest first, for the Launchpad's trades bar. */
export function memeTape(w: World, n: number, me: number): TapeRow[] {
  const rows: TapeRow[] = [];
  for (const m of book(w).memes) {
    if (!m.live || m.rugged) continue;
    for (const p of m.prints.slice(-n)) rows.push({ coin: m.id, ticker: m.ticker, coinName: m.name, seq: p.seq, day: p.day, abs: p.abs ?? p.day * MIN_DAY, side: p.side, tokens: p.tokens, cents: p.cents, who: p.who, name: p.who === me ? 'you' : handleOf(p.who), mine: p.who === me });
  }
  rows.sort((a, b) => b.seq - a.seq);
  return rows.slice(0, n);
}

// ---- real voices: what the people who trade a coin say about it ----

type Voice = 'degen' | 'young' | 'jumpy' | 'steady';
type Say = 'early' | 'chase' | 'dip' | 'big' | 'plain' | 'win' | 'small' | 'loss' | 'exit' | 'launch' | 'pump' | 'dump' | 'rug';

/** How someone talks, from who they are: the greedy, the young, the easily shaken, and the rest. */
function voiceOf(w: World, i: number): Voice {
  const P = econ(w).P;
  if (P.greed[i] >= 60) return 'degen';
  if (ageOf(w, i) < 32) return 'young';
  if (P.resil[i] < 45) return 'jumpy';
  return 'steady';
}

const LINES: Record<Say, Record<Voice, string[]>> = {
  early: {
    degen: ['In early. This one has legs.', 'Fresh pool, first in line. Easy.'],
    young: ['ok the ticker is funny, aped in', 'in before the timeline wakes up'],
    jumpy: ['Small bag to start. Please be kind.', 'Just a toe in the water.'],
    steady: ['Small position while the pool is shallow.', 'Early, so I sized it small.'],
  },
  chase: {
    degen: ['It is ripping and I am not sitting out.', 'Adding. Momentum does not lie.', 'Green candles all day. In.'],
    young: ['bro it keeps going up, in again', 'cannot watch this from the sidelines', 'everyone is posting it, so same'],
    jumpy: ['I know, I know, chasing. One more.', 'Everyone is in. Fine. Me too.', 'Fear of missing out got me.'],
    steady: ['Price is trending. Adding a bit.', 'Following the move, with a stop in mind.', 'The trend is clear, so I joined it.'],
  },
  dip: {
    degen: ['Bought the dip. Diamond hands, always.', 'Red candle, green wallet, buying.', 'Blood in the streets. Buying.'],
    young: ['dip = discount, bought more', 'it dipped so i bought, simple', 'sale! grabbed some'],
    jumpy: ['It fell and I averaged down. Nervous.', 'Buying the dip, hands shaking.', 'Down again, so I bought. Please go up.'],
    steady: ['Averaging in on the pullback.', 'Cheaper than an hour ago, so I added.', 'The pullback is a better entry.'],
  },
  big: {
    degen: ['Sized up. Conviction buy.', 'Big one. See you on the moon.'],
    young: ['yeah that was a big buy, no regrets', 'went heavy, wish me luck'],
    jumpy: ['Bigger than I planned. Do not tell anyone.', 'Put real money in. Pray with me.'],
    steady: ['Larger position now. I like the setup.', 'Sizing up on the volume.'],
  },
  plain: {
    degen: ['Another bag for the stack.', 'Loading up.', 'Stacking more. Do not @ me.'],
    young: ['picked some up', 'vibes are good, bought', 'ok one more, last time'],
    jumpy: ['Bought a little. We will see.', 'Trying a small buy.', 'A bit more. My hands are sweating.'],
    steady: ['Added a small amount.', 'Bought at market.', 'Topped up the position.'],
  },
  win: {
    degen: ['Took profits. Thanks for the ride, fools.', 'Sold into the pump. Lambo fund up.', 'Printed. Sold the lot.'],
    young: ['sold the top (i think), thanks everyone', 'cashed out, that was fun', 'ok that paid my rent, selling'],
    jumpy: ['Taking the win before it vanishes.', 'Out with a profit. Sleeping tonight.', 'Green is green. Out.'],
    steady: ['Took profit, as planned.', 'Sold half the position at a good gain.', 'Target hit, so I sold.'],
  },
  small: {
    degen: ['Quick flip. Next.', 'Small win, on to the next coin.'],
    young: ['small green, taking it', 'ok that was a tiny win, bye'],
    jumpy: ['A little up. Selling before it turns.', 'Out, flat to green. Relief.'],
    steady: ['Closed it for a modest gain.', 'Booked a small profit.'],
  },
  loss: {
    degen: ['Cut it. Not my coin after all.', 'Paper hands this time, it happens.', 'Taking the L, on to the next one.'],
    young: ['ngl this one hurt, selling', 'rip my bag, i am out', 'down bad, selling'],
    jumpy: ['Sold at a loss. I could not take it.', 'Out. Never again. Probably.', 'I cannot watch it fall any more.'],
    steady: ['Stopped out. Taking the loss.', 'Wrong call, so I sold.', 'Cutting the loss before it grows.'],
  },
  exit: {
    degen: ['Out.', 'Done here.'],
    young: ['out', 'bye'],
    jumpy: ['Selling, just in case.', 'Out for now.'],
    steady: ['Sold.', 'Closed the position.'],
  },
  launch: {
    degen: ['Fresh coin. Get in before everyone does.', 'It is live. Moon talk starts now.'],
    young: ['ok we are live, be nice', 'made a coin lol, come look'],
    jumpy: ['It is live. Please do not dump on me.', 'Here goes nothing.'],
    steady: ['Launched with a modest pool. Let us see who shows up.', 'Live. Fees paid, pool seeded.'],
  },
  pump: {
    degen: ['Told you. Six times and climbing.', 'We are so early still.'],
    young: ['it actually worked??? thank you all', 'ok this is insane'],
    jumpy: ['It is up a lot. I am a bit scared now.', 'Thank you. Honestly did not expect this.'],
    steady: ['Up well beyond plan. Thank you to the early holders.', 'Good run. Stay careful.'],
  },
  dump: {
    degen: ['Weak hands leaving. We rebuild.', 'Shakeout. Happens at every top.'],
    young: ['why is everyone selling', 'big red candle, wow'],
    jumpy: ['Everybody is selling and I do not know why.', 'That fall hurts.'],
    steady: ['Holders are taking money out. The pool is thinner now.', 'A fair pullback after the run.'],
  },
  rug: {
    degen: ['Pulled it. The pool is mine now. Not sorry.', 'Took the pool. You were all exit liquidity.'],
    young: ['sorry guys i needed the money', 'took the pool. do not hate me'],
    jumpy: ['I pulled the pool. I am sorry, I panicked.', 'Had to take it out. I am sorry.'],
    steady: ['I pulled the liquidity. It was the practical thing to do.', 'The pool is withdrawn.'],
  },
};


// ---- what the creator says about the coin, and how the crowd answers a post ----

const BLURBS: Record<Voice, string[]> = {
  degen: [
    '{n} has no roadmap and no apology. Small pool, big appetite: get in while it is cheap.',
    'I made {n} because the last one was not degenerate enough. Number go up.',
    '{n}: the ticker is the whole pitch. If you need more than that, this is not for you.',
    'Early holders eat first. {n} is a race and the pool is shallow, so move.',
    'Everything about {n} is a bet, including this sentence. Size it like you can lose it.',
  ],
  young: [
    'ok so {n} is a coin about vibes and the group chat. that is the whole thing',
    'made {n} on a dare, the pool is real though so be nice',
    '{n} because the timeline needed a new joke. no promises, lots of memes',
    'we are building nothing, together. {n} for the people',
    '{n}. it is funny to me, hopefully to you. dyor lol',
  ],
  jumpy: [
    'This is {n}. I seeded the pool myself and I am nervous, so please be kind.',
    '{n} is a small experiment. I do not know if anyone will care, but here it is.',
    'I launched {n} with money I can afford to lose. I hope you only risk the same.',
    '{n}: a modest coin from a modest person. Not financial advice, I am not qualified.',
    'First coin I have made. {n} is open to anyone, and I will answer what I can.',
  ],
  steady: [
    '{n} is a plain coin with a seeded pool. The price is whatever people pay, and nothing else holds it up.',
    'Launched {n} to see who shows up. There is no team behind it: the pool is the whole story.',
    '{n} has a fixed pool and no promises. Buy only what you are happy to lose.',
    'A small, honest memecoin. {n} will be worth what the next buyer pays and no more.',
    '{n} is for people who like watching a market form. The pool is public and the rules are on the page.',
  ],
};

function blurb(w: World, i: number, name: string, abs: number): string {
  const list = BLURBS[voiceOf(w, i)];
  return list[Math.floor(unit(w, abs, i, 81) * list.length)].replace('{n}', name);
}

function stanceOf(text: string): Stance {
  const t = text.toLowerCase();
  if (t.includes('?')) return 'ask';
  if (/\b(rug|rugged|scam|fraud|dump|dumping|exit|dead|sell|selling|worthless|fake|trash|crash|crashing|down|bad|avoid|ponzi|wind)\b/.test(t)) return 'doubt';
  if (/\b(moon|lfg|pump|bull|bullish|gem|buy|buying|hold|holding|early|up|ape|aped|diamond|rocket|great|love|good|nice|wagmi)\b/.test(t)) return 'hype';
  return 'plain';
}

/** What a post is, for the label on the page and for who it can move. */
function postKind(text: string): 'question' | 'disclosure' | 'marketing' | 'opinion' {
  const t = text.toLowerCase();
  if (t.includes('?')) return 'question';
  const disclosure = /\b(i (am |'m )?(holding|selling|sold|winding|pulling)|wind(ing)? down|orderly|founder bag|i hold|i still hold|not selling|disclos)\b/.test(t);
  if (disclosure) return 'disclosure';
  if (/\b(moon|lfg|pump|gem|ape|wagmi|rocket|bullish|buy now|don't miss)\b/.test(t)) return 'marketing';
  return 'opinion';
}

function asksHolders(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(who|which|largest|biggest|most|top)\b/.test(t) && /\b(hold|holder|holds|holding|bag|position|wallet)\b/.test(t);
}

/** The holder table, for anyone who can see the coin's page. */
function holderFact(w: World, m: Meme): string {
  const rows = holderRows(w, m).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  if (!rows.length) return 'Nobody holds it outside the pool.';
  const supply = w.ledger.issued.get(m.id) ?? 0;
  const [who, n] = rows[0];
  const share = supply > 0 ? (n / supply * 100).toFixed(1) : '0';
  const name = handleOf(who);
  return `${name} holds the most: ${n.toLocaleString('en-US')} tokens, ${share}% of the supply.`;
}

const ANSWERS: Record<Stance, Record<Voice, string[]>> = {
  ask: {
    degen: ['Honest answer: nobody knows. Read the pool, size it small, then ape.', 'Check the pool and the trades. Everything you need is on this page.', 'Good question. The answer is always the same: it is a coin, not a promise.'],
    young: ['idk fr, i just watch the chart and vibe', 'good q, the trades tab is the best answer i have', 'no clue honestly, check the holders list'],
    jumpy: ['I wish I knew. I would check the pool depth first.', 'I am not sure, sorry. Maybe someone braver can say.', 'Ask the creator, I am as lost as you are.'],
    steady: ['The page shows the pool and the trades. The pool depth is what limits your size.', 'Short answer: nobody can promise a price. Look at who holds it and how deep the pool is.', 'Check the trades first. Thin pools move a lot per dollar.'],
  },
  hype: {
    degen: ['Say it louder. Early is early.', 'Facts. This one has legs, I am not selling.', 'LFG. Diamond hands or nothing.'],
    young: ['fr fr', 'ok this is the vibe', 'lets gooo'],
    jumpy: ['I hope you are right. I am holding a little.', 'Nice to hear, I was getting nervous.', 'Fingers crossed for all of us.'],
    steady: ['Reasonable. I would size it small anyway.', 'It can run, but a pool this size can also fall as fast.', 'Fine, as long as everyone knows the risk.'],
  },
  doubt: {
    degen: ['Weak hands talk like this. Wait for the next green candle.', 'Every coin gets called a scam at the bottom. Then it runs.', 'Fear sells, hold or leave. Your call.'],
    young: ['bro dont be like that', 'ok doomer', 'lol the pool is right there, check it yourself'],
    jumpy: ['That scares me. Is the creator still around?', 'I was worried about that too, honestly.', 'Now I am nervous. Should I sell?'],
    steady: ['The creator can pull the pool: that is the real risk here, and it is on the page.', 'A fair concern. Watch the creator and the trades, and do not hold more than you can lose.', 'Possibly. Pools like this do go to zero.'],
  },
  plain: {
    degen: ['Noted. Now buy something.', 'Cool. See you on the chart.', 'Say what you mean: in or out?'],
    young: ['haha ok', 'noted', 'same tbh'],
    jumpy: ['Thanks for posting, it is quiet in here.', 'Hi. I am just watching for now.', 'Interesting, thank you.'],
    steady: ['Thanks for the post.', 'Noted. The trades tell the rest of the story.', 'Fair enough.'],
  },
};

/** The creator's answer to a post on their own coin: in their voice, with the real numbers when asked. */
function creatorAnswer(w: World, m: Meme, stance: Stance, salt: number, asked: string): string {
  const v = voiceOf(w, m.creator);
  if (asksHolders(asked)) return holderFact(w, m);
  const px = spot(w, m);
  const facts = `The pool holds ${grouped(Math.round(poolCash(w, m)))} and the price is $${(px / 100).toFixed(px >= 100 ? 2 : 6)} a token.`;
  if (stance === 'ask') return `${v === 'degen' ? 'Straight talk: ' : v === 'jumpy' ? 'Honestly, ' : ''}${facts} ${holderFact(w, m)}`;
  const list = ANSWERS[stance][v];
  return list[mix(m.creator, salt, 7) % list.length];
}

function listVoices(w: World, m: Meme, exclude: number): number[] {
  const P = econ(w).P;
  const seen = new Set<number>();
  const out: number[] = [];
  const add = (i: number): void => {
    if (i < 0 || i === exclude || seen.has(i) || !P.alive(i) || isSeatPerson(w, i)) return;
    seen.add(i);
    out.push(i);
  };
  for (let k = m.prints.length - 1; k >= 0 && out.length < 24; k--) add(m.prints[k].who);
  if (m.hold) for (let k = 0; k < m.hold.length && out.length < 40; k++) add(m.hold[k]);
  return out;
}

export interface PostResult { ok: boolean; why?: string; id?: string }

/**
 * The player posts on a coin's page, or answers a post. The post is stored; the crowd answers it a few game minutes later, each in
 * their own voice: the creator first when it is a question or their own post being answered, then whoever trades the coin.
 */
function gullible(w: World, i: number): boolean {
  const P = econ(w).P;
  return P.greed[i] >= 62 || (ageOf(w, i) < 26 && P.resil[i] < 48);
}

/**
 * A post walks the same path as tell: named readers hear it, revise what they believe, and may trade.
 * A credible disclosure moves most of them. Empty hype moves only the gullible. The hear list is the record.
 */
function spreadPost(w: World, m: Meme, speaker: number, text: string, kind: string, abs: number): Hear[] {
  const P = econ(w).P;
  const readers: number[] = [];
  const add = (i: number): void => {
    if (readers.length >= 12 || i === speaker || i < 0 || !P.alive(i) || isSeatPerson(w, i)) return;
    if (!readers.includes(i)) readers.push(i);
  };
  for (const c of contactsOf(w, speaker)) add(c.who);
  for (const h of m.hold ?? []) add(h);
  const negated = /\b(not|never|won't|wont|no)\s+(be\s+)?(sell|selling|sold|exit|exiting|pull|pulling|dump|dumping)/i.test(text);
  const bearish = kind === 'disclosure' && !negated && /\b(wind|sell|sold|exit|pull|dump)\w*/i.test(text);
  const bullish = kind === 'disclosure' && !bearish;
  const hears: Hear[] = [];
  for (const who of readers) {
    hear(m, who);
    const holding = Math.floor(w.ledger.balance(P.id(who), m.id));
    const easy = gullible(w, who);
    const moves = kind === 'disclosure' || (kind === 'marketing' && easy) || (kind === 'opinion' && easy && unit(w, abs, who, 88) < 0.2);
    let did: Hear['did'] = 'none';
    let cents = 0;
    if (moves && bearish && holding > 1) {
      const q = Math.max(1, Math.floor(holding * 0.35));
      const payC = sellMeme(w, m, who, q, m.launchEv);
      if (payC > 0) { did = 'sell'; cents = payC; }
      else did = 'hold';
    } else if (moves && (bullish || (kind === 'marketing' && easy))) {
      const cushion = cashOf(w, P.id(who)) - P.incEma[who] * 14;
      const spend = Math.min(6_000, Math.floor(cushion * (bullish ? 0.06 : 0.025)), Math.floor(poolCash(w, m) * 0.06));
      if (spend >= 400) {
        const got = buyMeme(w, m, who, spend, m.launchEv, false);
        if (got > 0) { did = 'buy'; cents = spend; }
        else did = 'hold';
      } else did = 'hold';
    } else if (moves) did = 'hold';
    hears.push({ abs, who, from: speaker, holding, kind, did, cents, text: text.slice(0, 80) });
  }
  m.hears = [...(m.hears ?? []), ...hears].slice(-40);
  const shift = bearish ? -0.55 : bullish ? 0.5 : kind === 'marketing' ? 0.15 : kind === 'opinion' ? 0.05 : 0;
  m.belief = Math.max(-1, Math.min(1, (m.belief ?? 0) * 0.4 + shift));
  m.beliefAbs = abs;
  m.beliefKind = kind === 'marketing' ? 'hype' : kind;
  if (speaker === m.creator && bearish && /\bwind/.test(text.toLowerCase())) m.windDown = abs;
  const bought = hears.filter((h) => h.did === 'buy').length;
  const sold = hears.filter((h) => h.did === 'sell').length;
  if (hears.length) {
    w.events.emit('crypto.post', `${P.name(speaker)} posted on ${m.name} (${kind}). ${hears.length} heard it; ${bought} bought and ${sold} sold`, [m.launchEv], P.id(speaker));
  }
  refreshKing(w);
  return hears;
}

export function postVoice(w: World, me: number, coin: string, text: string, parentId?: string): PostResult {
  const m = memeOf(w, coin);
  if (!m) return { ok: false, why: 'That coin is no longer listed.' };
  const t = text.replace(/\s+/g, ' ').trim().slice(0, 220);
  if (t.length < 2) return { ok: false, why: 'Write something first.' };
  const st = book(w);
  const abs = st.abs ?? w.day * MIN_DAY;
  const said = (m.said ??= []);
  // Not a flood: the same player may post a few times a game hour.
  let recent = 0;
  for (const s of said) if (s.mine && abs - s.abs < 60) recent++;
  if (recent >= 4) return { ok: false, why: 'Slow down: give the others a minute to answer.' };
  const seq = (m.saidSeq = (m.saidSeq ?? 0) + 1);
  const id = `${m.id}:s:${seq}`;
  let quote: string | undefined, quoteName: string | undefined, to = -1;
  if (parentId) {
    const hit = memeTalk(w, m, me).find((x) => x.id === parentId);
    if (hit) { quote = hit.text.slice(0, 120); quoteName = hit.mine ? 'you' : hit.name; to = hit.who; }
  }
  const kind = postKind(t);
  const label = kind === 'marketing' ? 'marketing' : kind === 'disclosure' ? 'disclosure' : kind === 'question' ? 'question' : 'opinion';
  said.push({ id, abs, who: me, mine: true, text: t, parent: parentId, quote, quoteName, label });
  if (said.length > 60) said.splice(0, said.length - 60);
  if (!parentId) spreadPost(w, m, me, t, kind, abs);
  const stance = stanceOf(t);
  const q = (m.queue ??= []);
  const cast = listVoices(w, m, me);
  const who: { i: number; c: boolean }[] = [];
  if (to >= 0 && to !== me) who.push({ i: to, c: to === m.creator });
  if ((stance === 'ask' || parentId === undefined && unit(w, abs, seq, 95) < 0.5) && !who.some((x) => x.i === m.creator)) who.push({ i: m.creator, c: true });
  const n = 2 + (unit(w, abs, seq, 91) < 0.6 ? 1 : 0) + (unit(w, abs, seq, 92) < 0.3 ? 1 : 0);
  for (let k = 0; who.length < n && cast.length && k < 12; k++) {
    const i = cast[Math.floor(unit(w, abs, seq * 17 + k, 93) * cast.length)];
    if (!who.some((x) => x.i === i)) who.push({ i, c: i === m.creator });
  }
  if (!who.length) who.push({ i: m.creator, c: true });
  let due = abs;
  for (const x of who) {
    due += 1 + Math.floor(unit(w, abs, seq * 31 + x.i, 94) * 4);
    q.push({ abs: due, who: x.i, parent: id, stance, creator: x.c });
  }
  return { ok: true, id };
}

/** Write the crowd's answers that have come due. Runs every coin round; a headless day writes whatever is waiting. */
function answerDue(w: World, abs: number): void {
  for (const m of book(w).memes) {
    const q = m.queue;
    if (!q || !q.length) continue;
    const keep: Due[] = [];
    for (const d of q) {
      if (d.abs > abs) { keep.push(d); continue; }
      const said = (m.said ??= []);
      const parent = said.find((x) => x.id === d.parent);
      if (!parent) continue;
      const seq = (m.saidSeq = (m.saidSeq ?? 0) + 1);
      let text: string;
      if (d.creator) text = creatorAnswer(w, m, d.stance, seq, parent.text);
      else if (asksHolders(parent.text)) text = holderFact(w, m);
      else { const l = ANSWERS[d.stance][voiceOf(w, d.who)]; text = l[mix(d.who, seq, 3) % l.length]; }
      said.push({ id: `${m.id}:s:${seq}`, abs: Math.max(abs, d.abs), who: d.who, text, parent: d.parent, quote: parent.text.slice(0, 120), quoteName: parent.mine ? 'you' : handleOf(parent.who), label: asksHolders(parent.text) ? 'disclosure' : 'opinion' });
    }
    m.queue = keep;
    if ((m.said?.length ?? 0) > 60) m.said!.splice(0, m.said!.length - 60);
  }
}

export interface Post {
  id: string;
  abs: number;
  who: number;
  name: string;
  mine: boolean;
  creator: boolean;
  act: 'launch' | 'buy' | 'sell' | 'pump' | 'dump' | 'rug' | 'post' | 'reply';
  /** A reply names its parent post and quotes it, so a thread reads even when the parent has scrolled away. */
  parent?: string;
  quote?: string;
  quoteName?: string;
  cents: number;
  /** A sale's profit as a fraction, for sells. */
  gain?: number;
  text: string;
  /** opinion, marketing, disclosure or question. Trade lines leave it empty. */
  label?: string;
}

/** How many coins this person actually holds, and how many rugs they were in. First person claims use these, never a template. */
export function speakerCoinFacts(w: World, i: number): { holding: number; rugs: number } {
  const st = w.state.crypto as Book | undefined;
  if (!st || i < 0) return { holding: 0, rugs: 0 };
  const id = econ(w).P.id(i);
  let holding = 0;
  for (const m of st.memes) if (Math.floor(w.ledger.balance(id, m.id)) > 0) holding++;
  return { holding, rugs: st.rugSeen?.[String(i)] ?? 0 };
}

function groundLine(w: World, who: number, m: Meme): string {
  const id = econ(w).P.id(who);
  const held = Math.floor(w.ledger.balance(id, m.id));
  const cost = m.cost.get(who) ?? 0;
  const facts = speakerCoinFacts(w, who);
  const bits: string[] = [];
  if (held > 0) {
    const entry = cost > 0 ? ` in at about $${(cost / held / 100).toFixed(6)}` : '';
    bits.push(`I hold ${held.toLocaleString('en-US')} ${m.ticker}${entry}`);
  }
  if (facts.holding > 0) bits.push(`${facts.holding} ${facts.holding === 1 ? 'coin' : 'coins'} in the wallet`);
  if (facts.rugs > 0) bits.push(`I have been in ${facts.rugs} ${facts.rugs === 1 ? 'rug' : 'rugs'}`);
  return bits.length ? ` ${bits.slice(0, 2).join('. ')}.` : '';
}

function say(w: World, who: number, ctx: Say, salt: number): string {
  const list = LINES[ctx][voiceOf(w, who)];
  return list[mix(who, salt, ctx.length) % list.length];
}

/** What people said on a coin, newest first: the creator's own posts and the trades worth a line from the people who made them. */
function memeTalk(w: World, m: Meme, me: number): Post[] {
  const out: Post[] = [];
  const at = (abs: number, who: number, act: Post['act'], ctx: Say, salt: number, cents = 0, gain?: number): void => {
    out.push({ id: `${m.id}:${act}:${salt}`, abs, who, name: who === me ? 'you' : handleOf(who), mine: who === me, creator: who === m.creator, act, cents, gain, text: say(w, who, ctx, salt) + groundLine(w, who, m) });
  };
  const born = m.bornAbs ?? m.born * MIN_DAY;
  // Nothing is posted in the player's name: a seat's own coin has no scripted creator lines.
  const seatDev = isSeatPerson(w, m.creator);
  if (!seatDev) at(born, m.creator, 'launch', 'launch', 1);
  let prev = m.bornPx;
  let peak = m.bornPx;
  const tail = m.prints.length > 60 ? m.prints.length - 60 : 0;
  for (let k = 0; k < m.prints.length; k++) {
    const p = m.prints[k];
    const px = p.px ?? prev;
    // The player's own trades stay in the trades table: nothing is scripted in their mouth.
    if (k >= tail && p.who !== m.creator && p.who !== me) {
      // Not every trade talks: the big ones and about one in three of the rest.
      const loud = p.cents >= 4000 || mix(p.seq, p.who, 9) % 3 === 0;
      if (loud) {
        if (p.side === 'buy') {
          const ctx: Say = p.cents >= 6000 ? 'big' : p.abs - born < 120 ? 'early' : px < peak * 0.85 ? 'dip' : px > prev * 1.002 ? 'chase' : 'plain';
          at(p.abs, p.who, 'buy', ctx, p.seq, p.cents);
        } else {
          const g = p.gain;
          const ctx: Say = g === undefined ? 'exit' : g > 0.5 ? 'win' : g > 0 ? 'small' : 'loss';
          at(p.abs, p.who, 'sell', ctx, p.seq, p.cents, g);
        }
      }
    }
    if (px > peak) peak = px;
    prev = px;
  }
  if (m.pumpAbs !== undefined && !seatDev) at(m.pumpAbs, m.creator, 'pump', 'pump', 2);
  if (m.dumpAbs !== undefined && !seatDev) at(m.dumpAbs, m.creator, 'dump', 'dump', 3);
  if (m.rugged && !seatDev) at(m.rugAbs ?? (m.deadDay ?? m.born) * MIN_DAY, m.creator, 'rug', 'rug', 4, m.rugCash ?? 0);
  for (const x of m.said ?? []) {
    out.push({ id: x.id, abs: x.abs, who: x.who, name: x.mine ? 'you' : handleOf(x.who), mine: !!x.mine, creator: x.who === m.creator, act: x.parent ? 'reply' : 'post', cents: 0, text: x.text, parent: x.parent, quote: x.quote, quoteName: x.quoteName, label: x.label });
  }
  out.sort((a, b) => b.abs - a.abs || (a.id < b.id ? -1 : 1));
  return out.slice(0, 100);
}

/** One coin's page: the curve, its holders, its tape and what people said about it. Null for an unknown coin. */
export function memeDetail(w: World, instr: string, me: number, now?: number): Record<string, unknown> | null {
  const m = memeOf(w, instr);
  if (!m) return null;
  const P = econ(w).P;
  const row = memeBoard(w, me, now).find((r) => r.id === m.id);
  if (!row) return null;
  const top: { index: number; name: string; qty: number; share: number; mine: boolean; creator: boolean }[] = [];
  if (!m.rugged) {
    const held: [string, number][] = [];
    for (const [who, n] of w.ledger.holders(m.id)) if (who.startsWith('p_') && n > 0) held.push([who, n]);
    held.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    for (const [who, n] of held.slice(0, 12)) {
      const index = +who.slice(2);
      top.push({ index, name: index === me ? 'you' : handleOf(index), qty: Math.floor(n), share: row.supply > 0 ? n / row.supply : 0, mine: index === me, creator: index === m.creator });
    }
  }
  const prints = m.prints.slice().reverse().map((p) => ({
    seq: p.seq, day: p.day, abs: p.abs ?? p.day * MIN_DAY, side: p.side, tokens: p.tokens, cents: p.cents,
    px: p.avg ?? p.px ?? 0, avg: p.avg ?? p.px ?? 0, before: p.before ?? 0, after: p.after ?? 0,
    index: p.who, name: p.who === me ? 'you' : handleOf(p.who), mine: p.who === me,
  }));
  const replies: { eventId: number; day: number; text: string }[] = [];
  for (const id of m.tells.slice().reverse()) {
    const ev = w.events.get(id);
    if (ev) replies.push({ eventId: id, day: ev.day, text: ev.msg });
  }
  const hears = (m.hears ?? []).slice(-24).map((h) => ({
    abs: h.abs, who: h.who, name: h.who === me ? 'you' : handleOf(h.who), from: h.from, fromName: h.from === me ? 'you' : handleOf(h.from),
    holding: h.holding, kind: h.kind, did: h.did, cents: h.cents,
  }));
  return { ...row, desc: m.desc ?? '', creatorIndex: m.creator, creatorHandle: handleOf(m.creator), creatorName: P.name(m.creator), top, prints, talk: replies, posts: memeTalk(w, m, me), hears };
}

/** The creator pulls their own pool. Same settlement as any rug: holders are paid nothing and the tokens leave. */
export function pullCoin(w: World, person: number, coin: string): { ok: boolean; why?: string; text?: string } {
  const m = memeOf(w, coin);
  if (!m) return { ok: false, why: 'no coin' };
  if (m.creator !== person) return { ok: false, why: 'only the creator can pull the pool' };
  if (!m.live || m.rugged || m.settled) return { ok: false, why: 'that pool is already gone' };
  rug(w, m);
  const p = m.payout;
  return { ok: true, text: p ? p.note : `${m.ticker} pool pulled` };
}

/** What the Launchpad reads in one go: the board, the tape, the player's tokens, recent rugs and the launch rules. */
export function launchpadRead(w: World, me: number, now: number, coin?: string): Record<string, unknown> {
  const st = book(w), P = econ(w).P, L = w.ledger;
  const board = memeBoard(w, me, now);
  const held: Record<string, number> = {};
  if (me >= 0 && me < P.n) {
    const id = P.id(me);
    for (const m of st.memes) { const n = Math.floor(L.balance(id, m.id)); if (n > 0) held[m.id] = n; }
  }
  let live = 0;
  for (const r of board) if (r.live) live++;
  const king = st.king && board.some((r) => r.live && r.id === st.king) ? st.king : (refreshKing(w) ?? '');
  const rugs = board.filter((r) => r.rugged && now - r.endAbs < 4320).sort((a, b) => b.endAbs - a.endAbs).slice(0, 6)
    .map((r) => ({ id: r.id, ticker: r.ticker, name: r.name, creatorName: r.creatorName, mine: r.mine, cash: r.rugCash, abs: r.endAbs }));
  const out: Record<string, unknown> = {
    now, day: w.day, live, cityLive: cityLive(w), max: MAX_LIVE, king, kingRule: st.kingRule ?? KING_RULE, board, held, rugs, tape: memeTape(w, 12, me),
    rules: { fee: FEE, seedMin: SEED_MIN, seedMax: SEED, pool: POOL_TOKENS, founder: FOUNDER },
  };
  if (coin) { const d = memeDetail(w, coin, me, now); if (d) out.detail = d; }
  if (me >= 0) out.dev = devView(w, me);
  return out;
}

/** The player's dev record as the crowd sees it: what they launched, what they dumped, who follows them. */
export function devView(w: World, me: number): Record<string, unknown> {
  const st = book(w);
  const row = devRecord(w, me);
  const fans = new Set<number>();
  for (const m of st.memes) if (m.creator === me && m.live && !row.dumpIds.includes(m.id)) for (const h of m.hold ?? []) if (h !== me) fans.add(h);
  const following = row.dumps ? 0 : fans.size;
  const word = row.dumps >= 3 ? 'a known rugger' : row.dumps >= 2 ? 'a dev who dumps' : row.dumps === 1 ? 'a dev who sold once' : row.good >= 2 ? 'a dev with a following' : row.launches ? 'a new dev' : 'no coins yet';
  const line = row.dumps
    ? `You sold your own coin into ${row.hurt} buyers across ${row.dumps} ${row.dumps === 1 ? 'dump' : 'dumps'}. The crowd names ${handleOf(me)} on every new launch, and buyers stay away.${row.dumps >= 2 ? ' The regulator has it on file.' : ''}`
    : row.good ? `${row.good} of your coins ran well and you never sold into your buyers: ${following} people hold your live coins and look for your next one.`
    : row.launches ? `${row.launches} ${row.launches === 1 ? 'coin' : 'coins'} launched and no dumps. Holders watch the founder bag.` : 'You have not launched a coin.';
  return { handle: handleOf(me), launches: row.launches, dumps: row.dumps, hurt: row.hurt, good: row.good, following, word, line };
}

export const crypto: Module = {
  id: 'crypto',

  init(w) {
    const s = econ(w), L = w.ledger;
    const fin = s.firms.find((f: Firm) => f.sector === 'FINANCE');
    const st: Book = {
      majors: [], memes: [], orders: [], nextId: 500_001, seq: 1, n: 0, cursor: 0,
      holdBits: new Uint32Array(Math.ceil(s.P.capacity / 32)), holders: 0, rugLoss: 0,
      root: 0, fin: fin?.id ?? '', major: MAJORS[0].id, printSeq: 1, seed: fnv(w.seed), abs: 0,
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
    if (t === 0) quoteMajors(w);
    sweepCoinOrders(w);
  },

  dayClose(w) {
    issueSchedule(w, book(w).root);
    headlessDay(w);
    if (w.day % 7 === 6) for (const m of book(w).majors) m.week = m.last;
    retireDead(w);
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
      launched: st.launched ?? 0,
      trades: st.trades ?? 0,
      holders: Math.max(0, st.holders),
      rugLoss: Math.round(st.rugLoss / 100),
      launchedAll: st.tally?.launches ?? 0,
      rugsAll: st.tally?.rugs ?? 0,
      maniaAll: st.tally?.mania ?? 0,
      ageAll: st.tally?.age ?? 0,
      idleAll: st.tally?.inactivity ?? 0,
      drawdownAll: st.tally?.drawdown ?? 0,
      endBeforeLaunch: st.tally?.before ?? 0,
    };
    st.rugLoss = 0;
    st.launched = 0;
    st.trades = 0;
    return out;
  },
};
