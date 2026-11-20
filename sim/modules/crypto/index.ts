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

/** One executed trade against a memecoin's pool: who, which side, the tokens and the cents. Kept for the Launchpad's tape. */
interface Print {
  seq: number;
  day: number;
  /** Game minutes since day 0. */
  abs: number;
  side: 'buy' | 'sell';
  tokens: number;
  cents: number;
  who: number;
  /** Cents per token in the pool just after this trade. */
  px?: number;
  /** A sale's profit over what the seller paid for those tokens, as a fraction (0.4 is up 40%). */
  gain?: number;
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
}

/** One post stored on a coin's page. A reply carries the parent's id and a copy of what it answered, so a thread survives its parent scrolling away. */
interface Said { id: string; abs: number; who: number; mine?: boolean; text: string; parent?: string; quote?: string; quoteName?: string }
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
  /** Cents the buyers have paid into the pool, above the creator's seed. */
  raised: number;
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
  endAbs: number;
  rugCash: number;
  /** Game day the pool of a faded coin pays out to whoever still holds it. */
  windDay: number;
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
  launched?: number;
  trades?: number;
  rugBars?: { id: string; last: number }[];
  /** Pool accounts of wound-up coins, empty and ready to be used again. */
  free?: string[];
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

function printTrade(w: World, m: Meme, side: 'buy' | 'sell', tokens: number, cents: number, who: number, gain?: number): void {
  const st = book(w);
  const seq = st.printSeq ?? 1; // a save from before the tape existed has no counter yet
  st.printSeq = seq + 1;
  const abs = st.abs ?? w.day * MIN_DAY;
  const px = spot(w, m);
  const pr: Print = { seq, day: w.day, abs, side, tokens, cents, who, px };
  if (gain !== undefined) pr.gain = Math.round(gain * 100) / 100;
  m.prints.push(pr);
  if (m.prints.length > PRINTS_KEEP) m.prints.splice(0, m.prints.length - PRINTS_KEEP);
  m.trades = (m.trades ?? 0) + 1;
  m.volTotal = (m.volTotal ?? 0) + cents;
  m.heat = (m.heat ?? 0) * Math.pow(0.5, Math.max(0, abs - (m.heatAbs ?? abs)) / 120) + cents;
  m.heatAbs = abs;
  // The chart's minute bar: tokens traded and the price extremes the pool visited.
  m.mVol = (m.mVol ?? 0) + tokens;
  if (px > 0) { m.mHi = Math.max(m.mHi ?? 0, px); m.mLo = Math.min(m.mLo ?? Infinity, px); if (px > (m.peak ?? 0)) m.peak = px; }
  m.lastAbs = abs;
  st.trades = (st.trades ?? 0) + 1;
}

function buyMeme(w: World, m: Meme, i: number, spend: number, cause: number, seat = false): number {
  const P = econ(w).P;
  const id = P.id(i);
  const cash = poolCash(w, m), tokens = poolTokens(w, m);
  const out = quoteBuy(cash, tokens, spend);
  if (out < 1 || cashOf(w, id) < spend) return 0;
  if (!pay(w, id, m.pool, spend, 'crypto.buy', cause)) return 0;
  if (!w.ledger.move(m.id, m.pool, id, out, 'crypto.buy', cause)) throw new Error(`pool delivery ${m.id}`);
  if (!m.cost.has(i)) (m.hold ??= []).push(i);
  m.cost.set(i, (m.cost.get(i) ?? 0) + spend);
  noteHold(book(w), i, true);
  m.flow = (m.flow ?? 0) + spend;
  printTrade(w, m, 'buy', out, spend, i);
  return out;
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
  const basis = cost > 0 ? cost * q / held : 0;
  if (left <= 0) {
    m.cost.delete(i);
    if (m.hold) { const at = m.hold.indexOf(i); if (at >= 0) { m.hold[at] = m.hold[m.hold.length - 1]; m.hold.pop(); } }
    noteHold(book(w), i, stillHolds(w, i));
  } else m.cost.set(i, Math.floor(cost * left / held));
  m.flow = (m.flow ?? 0) - payC;
  printTrade(w, m, 'sell', q, payC, i, basis > 0 ? payC / basis - 1 : undefined);
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
  for (const m of book(w).memes) if (m.live) live.add(m.ticker);
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
  const spare = cashOf(w, P.id(i)) - P.incEma[i] * 60 - FEE;
  return Math.max(SEED_MIN, Math.min(SEED, Math.floor(spare * 0.2 / 5000) * 5000));
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
    for (const m of st.memes) if (m.live) taken.add(m.ticker);
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
  hear(m, i);
  noteHold(st, i, true);
  st.memes.push(m);
  st.launched = (st.launched ?? 0) + 1;
  // The starting buy is the creator's first trade on their own curve: it goes through the same pool as anyone's.
  if (opts.buy && opts.buy >= 1) buyMeme(w, m, i, opts.buy, ev, true);
  tell(w, m, i, true);
  return m;
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

function rug(w: World, m: Meme): void {
  const st = book(w);
  const P = econ(w).P, L = w.ledger;
  const cash = poolCash(w, m);
  const last = spot(w, m);
  const ev = w.events.emit('crypto.rug', `${P.name(m.creator)} pulled the ${m.name} pool and kept ${grouped(cash)}. The coins still out have nowhere to sell`, maniaCauses(m), P.id(m.creator));
  if (cash > 0 && !pay(w, m.pool, P.id(m.creator), cash, 'crypto.rug', ev)) throw new Error(`rug cash ${m.id}`);
  const left = poolTokens(w, m);
  if (left > 0 && !L.redeem(m.id, m.pool, left, 'crypto.rug', ev)) throw new Error(`rug tokens ${m.id}`);
  m.rugged = true;
  m.live = false;
  m.rugCash = cash;
  m.rugPx = last;
  m.deadDay = w.day;
  m.rugAbs = st.abs ?? w.day * MIN_DAY;
  (st.rugBars ??= []).push({ id: m.id, last });
  if (st.rugBars.length > 40) st.rugBars.splice(0, st.rugBars.length - 40);
  const holders = m.hold ? m.hold.slice() : [];
  releaseDead(m);
  m.cost.clear();
  (st.rugs ??= []).push(m.rugAbs);
  if (st.rugs.length > 12) st.rugs.shift();
  st.rugLoss += cash;
  dropTrust(w, m.creator);
  for (const i of holders) {
    if (i === m.creator || !P.alive(i)) continue;
    thought(w, econ(w), i, 300, `lost money in the ${m.name} rug`, ev);
    noteHold(st, i, stillHolds(w, i));
  }
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

/** Launches a game day at this moment, more in a mania and fewer in a slump. */
function launchRate(w: World): number {
  const st = book(w);
  const moodF = Math.max(0.6, Math.min(1.3, (st.mood ?? 67) / 67));
  return 4 * moodF * moodF * (1 + 2 * (st.mania ?? 0)) * (1 - 0.6 * (st.slump ?? 0));
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
  const e = launchRate(w) * span / MIN_DAY;
  let n = Math.floor(e) + (unit(w, abs, 1, 1) < e - Math.floor(e) ? 1 : 0);
  while (n-- > 0 && live < MAX_LIVE) {
    let made = false;
    for (let k = 0; k < 80 && !made; k++) {
      const i = (st.cursor + k) % P.n;
      if (!P.alive(i) || isSeatPerson(w, i) || ageOf(w, i) < 18 || w.day < P.fearUntil[i]) continue;
      const cash = cashOf(w, P.id(i));
      if (cash - P.incEma[i] * 60 < FEE + SEED_MIN) continue;
      const who = persona(w, i);
      if (unit(w, abs, i, 2) * 6 > who.score) continue;
      if (contactsOf(w, i).length < 4) continue;
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
  let want = 0.1 + 0.45 * chase + (age < 240 ? 0.2 : 0) + 0.3 * Math.min(1, Math.max(0, mom - 1) * 4) - (mom < 0.85 ? 0.4 : 0) - 0.15 * nerve;
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
  return loyalty(w, i) < 55 || (P.greed[i] > 75 && P.resil[i] < 45);
}

function coinWatch(w: World, m: Meme, abs: number, span: number): void {
  const P = econ(w).P;
  const px = spot(w, m);
  if (!(px > 0)) return;
  if (px > (m.peak ?? 0)) m.peak = px;
  const age = abs - (m.bornAbs ?? abs);
  if (!m.pumpEv && px >= m.bornPx * 6 && age <= 4320) {
    m.pumpAbs = abs;
    m.pumpEv = w.events.emit('crypto.mania', `${m.name} is up ${(px / m.bornPx).toFixed(1)}× since launch, from ${m.bornPx.toFixed(2)}¢ to ${px.toFixed(2)}¢ a coin`, maniaCauses(m), P.id(m.creator));
  }
  if (m.pumpEv && !m.dumpEv && m.peak && px <= m.peak * 0.5) {
    m.dumpAbs = abs;
    m.dumpEv = w.events.emit('crypto.crash', `${m.name} fell ${((1 - px / m.peak) * 100).toFixed(0)}% from its peak as holders took their money out`, [m.launchEv, m.pumpEv], P.id(m.creator));
  }
  // The creator who does not trust their own contacts pulls the pool near the top.
  if (!isSeatPerson(w, m.creator) && age > 20 && m.peak && poolCash(w, m) >= m.seed * 2 && rugProne(w, m)) {
    // Near the top they take it while it is fat; once it turns they take what is left before everyone else does.
    const hazard = Math.min(0.9, span / (px >= m.peak * 0.8 ? 90 : 40));
    if (unit(w, abs, m.creator, 41) < hazard) { rug(w, m); return; }
  }
  // A coin nobody wants any more drops off the board.
  const idle = abs - (m.lastAbs ?? abs);
  const lowFromPeak = m.peak ? px < m.peak * 0.3 : false;
  // The rules are on the Launchpad's page. A player's own coin gets its first game day before they apply.
  if (!(age < MIN_DAY && isSeatPerson(w, m.creator)) && ((age > 180 && lowFromPeak && idle > 120) || (age > 720 && idle > 360) || age > 4320)) {
    m.live = false;
    m.deadDay = w.day;
    releaseDead(m);
  }
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
  // The king of the hill is the live coin with the biggest market cap.
  let king: Meme | undefined, kcap = 0;
  for (const m of st.memes) {
    if (!m.live) continue;
    const c = spot(w, m) * (w.ledger.issued.get(m.id) ?? 0);
    if (c > kcap) { kcap = c; king = m; }
  }
  st.king = king?.id;
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
export function coinSeedBar(w: World, id: string): { id: string; name: string; t: number; px: number } | null {
  const m = memeOf(w, id);
  if (!m) return null;
  const px = m.rugged ? (m.rugPx ?? m.bornPx) : spot(w, m) || m.bornPx;
  return { id: m.id, name: m.name, t: Math.floor(m.bornAbs ?? m.born * MIN_DAY), px };
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
  const meme = st.memes.find((m) => m.id.toLowerCase() === key || m.name.toLowerCase() === key || m.id.toLowerCase() === 'coin:' + key);
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
    if (r.filled < 1 && r.orderId === undefined) r.why = side === 'buy' ? 'no dealer will sell any at that price, or you cannot pay for one' : 'no dealer will buy any at that price, or you hold none';
    return { ...r, fill: r.filled };
  }
  const meme = st.memes.find((m) => m.id.toLowerCase() === key || m.name.toLowerCase() === key || m.id.toLowerCase() === 'coin:' + key);
  if (!meme || meme.rugged || (!meme.live && side === 'buy')) return { ...none, why: `no coin ${coin}` };
  if (!actor.startsWith('p_')) return { ...none, id: meme.id, name: meme.name, why: 'a memecoin trades from a person' };
  const i = +actor.slice(2);
  const base: CoinTrade = { ...none, id: meme.id, name: meme.name };
  if (side === 'buy') {
    const got = buyMeme(w, meme, i, qty, meme.launchEv, true);
    if (got < 1) return { ...base, why: 'the pool did not take that buy: too small to buy a whole coin, or you cannot pay' };
    return { ...base, filled: got, cents: qty, avg: qty / got, fills: [{ px: qty / got, qty: got }], fill: got };
  }
  const held = Math.floor(w.ledger.balance(actor, meme.id));
  const got = sellMeme(w, meme, i, qty, meme.launchEv);
  if (got < 1) return { ...base, why: 'the pool did not take that sale: you hold none, or the pool is empty' };
  const sold = Math.min(qty, held);
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
    if (contactsOf(w, person).length < 4) return { why: 'a launch needs four contacts to tell' };
    const surplus = cashOf(w, P.id(person)) - P.incEma[person] * 60;
    if (surplus < FEE + SEED_MIN) return { why: 'needs spare cash for the fee and the seed' };
  }
  const n0 = st.memes.length;
  const m = launch(w, person, opts, seed);
  if (st.memes.length === n0 || !m) return { why: 'the launch did not clear' };
  return { id: m.id, name: m.name, ticker: m.ticker };
}

function memeOf(w: World, instr: string): Meme | undefined {
  const key = instr.toLowerCase();
  return book(w).memes.find((m) => m.id.toLowerCase() === key || m.id.toLowerCase() === 'coin:' + key);
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
      raised: m.rugged ? 0 : Math.max(0, cash - m.seed), cash, tokens, holders, vol: m.volTotal ?? 0,
      lastDay: last ? last.day : m.born, replies: m.tells.length,
      lastAbs, trades: m.trades ?? m.prints.length, volTotal: m.volTotal ?? 0, heat: Math.round(heat), peak: m.peak ?? px,
      ended: m.rugged ? 'rugged' : m.live ? '' : 'faded',
      endAbs: m.rugged ? (m.rugAbs ?? (m.deadDay ?? m.born) * MIN_DAY) : m.live ? 0 : (m.deadDay ?? m.born) * MIN_DAY,
      rugCash: m.rugCash ?? 0, windDay: m.live || m.rugged ? 0 : (m.deadDay ?? m.born) + 30,
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
  if (/\b(rug|rugged|scam|fraud|dump|dumping|exit|dead|sell|selling|worthless|fake|trash|crash|crashing|down|bad|avoid|ponzi)\b/.test(t)) return 'doubt';
  if (/\b(moon|lfg|pump|bull|bullish|gem|buy|buying|hold|holding|early|up|ape|aped|diamond|rocket|great|love|good|nice|wagmi)\b/.test(t)) return 'hype';
  return 'plain';
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
function creatorAnswer(w: World, m: Meme, stance: Stance, salt: number): string {
  const v = voiceOf(w, m.creator);
  const px = spot(w, m);
  const facts = `The pool holds ${grouped(Math.round(poolCash(w, m)))} and the price is $${(px / 100).toFixed(px >= 100 ? 2 : 6)} a token.`;
  if (stance === 'ask') return `${v === 'degen' ? 'Straight talk: ' : v === 'jumpy' ? 'Honestly, ' : ''}${facts} That is all I can tell you for sure.`;
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
  said.push({ id, abs, who: me, mine: true, text: t, parent: parentId, quote, quoteName });
  if (said.length > 60) said.splice(0, said.length - 60);
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
      if (d.creator) text = creatorAnswer(w, m, d.stance, seq);
      else { const l = ANSWERS[d.stance][voiceOf(w, d.who)]; text = l[mix(d.who, seq, 3) % l.length]; }
      said.push({ id: `${m.id}:s:${seq}`, abs: Math.max(abs, d.abs), who: d.who, text, parent: d.parent, quote: parent.text.slice(0, 120), quoteName: parent.mine ? 'you' : handleOf(parent.who) });
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
}

function say(w: World, who: number, ctx: Say, salt: number): string {
  const list = LINES[ctx][voiceOf(w, who)];
  return list[mix(who, salt, ctx.length) % list.length];
}

/** What people said on a coin, newest first: the creator's own posts and the trades worth a line from the people who made them. */
function memeTalk(w: World, m: Meme, me: number): Post[] {
  const out: Post[] = [];
  const at = (abs: number, who: number, act: Post['act'], ctx: Say, salt: number, cents = 0, gain?: number): void => {
    out.push({ id: `${m.id}:${act}:${salt}`, abs, who, name: who === me ? 'you' : handleOf(who), mine: who === me, creator: who === m.creator, act, cents, gain, text: say(w, who, ctx, salt) });
  };
  const born = m.bornAbs ?? m.born * MIN_DAY;
  at(born, m.creator, 'launch', 'launch', 1);
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
  if (m.pumpAbs !== undefined) at(m.pumpAbs, m.creator, 'pump', 'pump', 2);
  if (m.dumpAbs !== undefined) at(m.dumpAbs, m.creator, 'dump', 'dump', 3);
  if (m.rugged) at(m.rugAbs ?? (m.deadDay ?? m.born) * MIN_DAY, m.creator, 'rug', 'rug', 4, m.rugCash ?? 0);
  for (const x of m.said ?? []) {
    out.push({ id: x.id, abs: x.abs, who: x.who, name: x.mine ? 'you' : handleOf(x.who), mine: !!x.mine, creator: x.who === m.creator, act: x.parent ? 'reply' : 'post', cents: 0, text: x.text, parent: x.parent, quote: x.quote, quoteName: x.quoteName });
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
  const prints = m.prints.slice().reverse().map((p) => ({ seq: p.seq, day: p.day, abs: p.abs ?? p.day * MIN_DAY, side: p.side, tokens: p.tokens, cents: p.cents, px: p.px ?? 0, index: p.who, name: p.who === me ? 'you' : handleOf(p.who), mine: p.who === me }));
  const replies: { eventId: number; day: number; text: string }[] = [];
  for (const id of m.tells.slice().reverse()) {
    const ev = w.events.get(id);
    if (ev) replies.push({ eventId: id, day: ev.day, text: ev.msg });
  }
  return { ...row, desc: m.desc ?? '', creatorIndex: m.creator, creatorHandle: handleOf(m.creator), creatorName: P.name(m.creator), top, prints, talk: replies, posts: memeTalk(w, m, me) };
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
  let live = 0, king = '', kcap = 0;
  for (const r of board) if (r.live) { live++; if (r.cap > kcap) { kcap = r.cap; king = r.id; } }
  const rugs = board.filter((r) => r.rugged && now - r.endAbs < 4320).sort((a, b) => b.endAbs - a.endAbs).slice(0, 6)
    .map((r) => ({ id: r.id, ticker: r.ticker, name: r.name, creatorName: r.creatorName, mine: r.mine, cash: r.rugCash, abs: r.endAbs }));
  const out: Record<string, unknown> = {
    now, day: w.day, live, cityLive: cityLive(w), max: MAX_LIVE, king, board, held, rugs, tape: memeTape(w, 12, me),
    rules: { fee: FEE, seedMin: SEED_MIN, seedMax: SEED, pool: POOL_TOKENS, founder: FOUNDER },
  };
  if (coin) { const d = memeDetail(w, coin, me, now); if (d) out.detail = d; }
  return out;
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
    };
    st.rugLoss = 0;
    st.launched = 0;
    st.trades = 0;
    return out;
  },
};
