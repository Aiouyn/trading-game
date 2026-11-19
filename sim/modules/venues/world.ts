// Six places to spend an evening. Who is there follows from the world: each person has a regular place that
// fits who they are, where they work and what they hold, and two usual nights a week. Nothing is drawn from a
// random stream: the evening is a pure function of the day and the people.
import type { World } from '../../kernel/index.ts';
import { borrowMargin } from '../banking/index.ts';
import { firmGap, roleTitle } from '../careers/jobs.ts';
import { bondWord, circleAct, circleMeet, circleRegard, circleTouch, circleWhoAt } from '../circle/index.ts';
import { controls } from '../corporate/index.ts';
import { buyIn } from '../corporate/owner.ts';
import { DEP, GOV, pay, type EconState, type Firm } from '../economy/index.ts';
import { joinFirm } from '../economy/people.ts';
import { contactsOf, quietFact } from '../social/index.ts';
import { knowledgeIn } from '../courses/know.ts';
import { findPast, lifeOf } from '../player/arrival.ts';
import { clockText, dateText, usd } from '../player/gamedate.ts';
import { standingMult } from '../player/standing.ts';
import { lookKey, lookOf, overheardOf } from './faces.ts';
import { converse, profileOf, TOPIC_WORDS, workTalk } from './talk.ts';

/** k is the door price as a share of one day's city wage; a round costs 0.7 of it. Prices also follow the player's standing. */
export interface Venue { id: string; name: string; where: string; k: number; say: string; opens: number }
export const VENUES: Venue[] = [
  { id: 'anchor', name: 'The Anchor and Rope', where: 'on the quay', k: 0.1, say: 'port and factory workers', opens: 660 },
  { id: 'ticker', name: 'The Ticker', where: 'by the exchange', k: 0.25, say: 'traders, bankers and analysts', opens: 720 },
  { id: 'cellar', name: 'Cellar 41', where: 'uptown wine bar', k: 0.6, say: 'executives, owners and the well off', opens: 1020 },
  { id: 'beaker', name: 'The Beaker', where: 'café by the labs', k: 0.12, say: 'engineers and founders', opens: 420 },
  { id: 'steward', name: "The Steward's Arms", where: 'union pub', k: 0.08, say: 'union members and shift workers', opens: 960 },
  { id: 'neon', name: 'Neon Yard', where: 'the club', k: 0.3, say: 'the young, gamblers and the crypto crowd', opens: 1260 },
];
/** The doors close at two in the morning. */
const CLOSE_AT = 120;

interface Rel {
  who: number; venue: number; how: string; first: number; last: number; met: number;
  asked: Record<string, number>; refused: number; helped: number; owes: number; owesDay: number;
  /** Exchanges had with them in all, and the rungs of the conversation already climbed. */
  depth: number; covered: string[]; recog?: string;
}
interface Table {
  day: number; venue: number; faces: number[]; asked: number[]; rounds: number; listened: boolean; spent: number;
  open: boolean; openAbs: number; closeAbs: number; tonight: Record<number, number>; minutes: number; left?: string;
}
interface Loan { who: number; cents: number; due: number; late: boolean; ev: number }
interface Ref { firm: number; who: number; until: number }
interface Seat { lastOut: number; table: Table | null; people: Rel[]; loans: Loan[]; refs: Ref[]; outings: number }
interface Book { seats: Record<string, Seat>; yOut: number; yMet: number; yFav: number; yNo: number }

const econ = (w: World): EconState => w.state.economy as EconState;
const book = (w: World): Book => w.state.venues as Book;
export function seatBook(w: World, seat: string): Seat {
  const b = book(w);
  return (b.seats[seat] ??= { lastOut: -1, table: null, people: [], loans: [], refs: [], outings: 0 });
}
export function seatId(w: World): string {
  const st = w.state.player as { ids?: string[] } | undefined;
  return st?.ids?.[0] ?? '';
}
export function whoOf(w: World, seat: string): number {
  const st = w.state.player as { seat?: Record<string, { who?: number }> } | undefined;
  return st?.seat?.[seat]?.who ?? -1;
}
function mix(a: number, b: number, c: number): number {
  let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f) ^ Math.imul(c, 0x165667b1);
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15;
  return x >>> 0;
}
const unit = (x: number): number => x / 4294967296;

const MANUAL = new Set(['TRANSPORT', 'MINING', 'CONSTRUCTION', 'ENERGY', 'AGRICULTURE', 'METALS', 'MANUFACTURING']);
const SHIFT = new Set(['MANUFACTURING', 'METALS', 'CHEMICALS', 'TRANSPORT', 'RETAIL', 'HEALTHCARE', 'CONSTRUCTION']);
const LABS = new Set(['TECHNOLOGY', 'CHEMICALS', 'HEALTHCARE']);
const FOLK: Record<string, string> = {
  TRANSPORT: 'port and haulage hands', MINING: 'miners', CONSTRUCTION: 'builders', ENERGY: 'power and oil workers', AGRICULTURE: 'farm hands',
  METALS: 'steelworkers', MANUFACTURING: 'factory hands', CHEMICALS: 'plant chemists', TECHNOLOGY: 'engineers', HEALTHCARE: 'clinic staff',
  RETAIL: 'shop staff', FINANCE: 'bankers and traders', MEDIA: 'press people',
};
const TRADE: Record<string, string> = {
  TRANSPORT: 'on the docks or the road', MINING: 'underground', CONSTRUCTION: 'on a building site', ENERGY: 'in power or oil', AGRICULTURE: 'on a farm',
  METALS: 'in steel', MANUFACTURING: 'in a factory', CHEMICALS: 'in a chemical plant', TECHNOLOGY: 'in tech', HEALTHCARE: 'in health care',
  RETAIL: 'in a shop', FINANCE: 'in banking or trading', MEDIA: 'at a paper',
};

interface Scan { crowd: number[][]; day: number; ceos: Map<number, number> }
let scanMemo: { key: string; scan: Scan } | undefined;

/** Everyone who is out tonight, by venue. A function of the day and of who people are. */
function scan(w: World): Scan {
  const s = econ(w), P = s.P, L = w.ledger;
  const crowd: number[][] = VENUES.map(() => []);
  const ceos = new Map<number, number>();
  for (const f of s.firms) if (!f.closed && f.ceo >= 0) ceos.set(f.ceo, f.idx);
  const me = whoOf(w, seatId(w));
  const dow = w.day % 7;
  const a = new Float64Array(VENUES.length);
  const wage = Math.max(1, s.wage);
  const life = lifeOf(w);
  const recog = new Set<number>(life ? life.recog.map((r) => r.who) : []);
  const recogUntil = (life?.day ?? 0) + 45;
  for (let i = 0; i < P.n; i++) {
    if (i === me || !P.adult(w, i) || P.age(w, i) > 78 || P.health[i] < 35 || P.outUntil[i] > w.day) continue;
    const n1 = mix(i, 1, 0) % 7, n2 = mix(i, 2, 0) % 7;
    const usual = dow === n1 || dow === n2;
    if (!usual && dow !== 4 && !(recog.has(i) && w.day <= recogUntil)) continue;
    const e = P.employer[i];
    const sec = e >= 0 ? s.firms[e].sector : '';
    const ceo = ceos.get(i);
    const small = ceo !== undefined && s.firms[ceo].workers < 40;
    const age = P.age(w, i);
    const wd = L.balS(P.slot[i], 'dep') / wage;
    const rich = wd > 500, poor = wd < 400;
    const skill = P.skill[i];
    a[0] = MANUAL.has(sec) ? (poor ? 0.85 : 0.5) : e < 0 ? 0.45 : 0.04;
    a[1] = sec === 'FINANCE' ? 0.85 : ceo !== undefined ? 0.25 : P.habit[i] === 2 ? 0.3 : rich ? 0.15 : 0.02;
    a[2] = ceo !== undefined ? 0.9 : rich ? 0.8 : skill > 2.1 ? 0.5 : sec === 'FINANCE' && skill > 1.4 ? 0.4 : 0.01;
    a[3] = small ? 0.95 : LABS.has(sec) ? 0.8 : age < 40 && skill > 1.4 ? 0.3 : 0.02;
    a[4] = SHIFT.has(sec) && age >= 28 && !rich ? 0.65 : 0.03;
    a[5] = age >= 19 && age <= 34 ? 0.3 + 0.4 * (P.greed[i] / 100) + (P.habit[i] === 2 ? 0.3 : 0) : 0.02;
    let v = 0;
    for (let k = 1; k < a.length; k++) if (a[k] > a[v]) v = k;
    if (a[v] < 0.2 && !recog.has(i)) continue;
    const p = recog.has(i) && w.day <= recogUntil ? 0.92 : usual ? Math.min(0.85, 0.25 + 0.7 * a[v]) : 0.3 * a[v];
    if (unit(mix(i, w.day, 7)) < p) crowd[v].push(i);
  }
  // A room only holds so many: on a busy night the rest do not get in.
  const room = [160, 140, 60, 90, 110, 200];
  for (let v = 0; v < crowd.length; v++) {
    if (crowd[v].length > room[v]) crowd[v] = crowd[v].sort((x, y) => (Number(recog.has(y)) - Number(recog.has(x))) || mix(x, w.day, 13) - mix(y, w.day, 13)).slice(0, room[v]);
  }
  return { crowd, day: w.day, ceos };
}
function scanToday(w: World): Scan {
  const key = `${w.seed}:${w.day}:${econ(w).P.n}`;
  if (scanMemo?.key === key) return scanMemo.scan;
  const sc = scan(w);
  scanMemo = { key, scan: sc };
  return sc;
}

export function findVenue(key: string): number {
  const k = key.trim().toLowerCase();
  if (!k) return -1;
  if (/^[1-6]$/.test(k)) return Number(k) - 1;
  const at = VENUES.findIndex((v) => v.id === k || v.name.toLowerCase() === k);
  if (at >= 0) return at;
  return VENUES.findIndex((v) => v.name.toLowerCase().includes(k) || v.where.includes(k) || v.id.startsWith(k));
}

interface Seen { firm: number; ev: number; day: number }
/** Chiefs of firms the papers have written about lately: faces a reader would know. */
function inTheNews(w: World): Map<number, Seen> {
  const out = new Map<number, Seen>();
  const firms = econ(w).firms.filter((f) => !f.closed && f.ceo >= 0);
  for (const e of w.events.recent(['news.story'], 120)) {
    if (w.day - e.day > 45 || e.msg.startsWith('Held off')) continue;
    for (const f of firms) {
      if (!e.msg.includes(f.name)) continue;
      const prev = out.get(f.ceo);
      if (!prev || e.day >= prev.day) out.set(f.ceo, { firm: f.idx, ev: e.id, day: e.day });
    }
  }
  return out;
}
function headline(w: World, ev: number): string {
  const e = w.events.get(ev);
  const t = e ? e.msg.split('||')[0].replace(/^[^:]{3,40}: /, '').trim() : '';
  return t.length > 110 ? t.slice(0, 107).replace(/[ ,.;]+$/, '') + '...' : t;
}

function jobLine(w: World, i: number): string {
  const s = econ(w), P = s.P;
  const e = P.employer[i];
  if (e < 0) return 'is between jobs';
  const f = s.firms[e];
  if (f.ceo === i) return `runs ${f.name}`;
  return `works at ${f.name}`;
}
function regularOf(w: World, i: number): number {
  const s = econ(w), P = s.P;
  const e = P.employer[i];
  const sec = e >= 0 ? s.firms[e].sector : '';
  if (s.firms.some((f) => f.ceo === i && !f.closed)) return LABS.has(sec) ? 3 : 2;
  if (sec === 'FINANCE') return 1;
  if (LABS.has(sec) && sec !== 'HEALTHCARE') return 3;
  if (MANUAL.has(sec)) return 0;
  if (SHIFT.has(sec)) return 4;
  return P.age(w, i) < 35 ? 5 : 4;
}

const friendWord = bondWord;
function relOf(sb: Seat, who: number): Rel | undefined { for (const r of sb.people) if (r.who === who) return r; return undefined; }
function cause(w: World, who: number): number {
  const ev = econ(w).P.lastEv[who];
  return ev >= 0 && w.events.get(ev) ? ev : w.genesis;
}
function openOwes(w: World, r: Rel): number { return Math.max(0, r.owes - Math.floor((w.day - r.owesDay) / 60)); }

function retailPayee(w: World): string {
  for (const f of econ(w).firms) if (!f.closed && f.good === 'GENERAL_RETAIL') return f.id;
  return GOV;
}

function crowdWords(w: World, list: number[]): string {
  const s = econ(w), P = s.P;
  const tally = new Map<string, number>();
  const ceos = new Set<number>();
  for (const f of s.firms) if (!f.closed && f.ceo >= 0) ceos.add(f.ceo);
  for (const i of list) {
    const e = P.employer[i];
    const w1 = ceos.has(i) ? 'owners and executives' : e < 0 ? 'people between jobs' : FOLK[s.firms[e].sector] ?? 'workers';
    tally.set(w1, (tally.get(w1) ?? 0) + 1);
  }
  const top = [...tally.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).slice(0, 2).map((x) => x[0]);
  return top.length ? `mostly ${top.join(' and ')}` : 'nobody much';
}

export interface FaceView {
  n: number; who: number; name: string; text: string; look: string; heard: string; news: string; known: string; word: string; recognises: boolean; exchanges: number;
}
/** Faces the papers have shown: the office-holders of the city. Chiefs in the news come from inTheNews. */
function publicFaces(w: World): Map<number, string> {
  const out = new Map<number, string>();
  const pol = w.state.politics as { leader?: number; finance?: number; governor?: number; regulator?: number } | undefined;
  const P = econ(w).P;
  const office: [number | undefined, string][] = [[pol?.leader, 'the head of government'], [pol?.finance, 'the finance minister'], [pol?.governor, 'the central bank governor'], [pol?.regulator, 'the regulator']];
  for (const [i, what] of office) if (i !== undefined && i >= 0 && i < P.n && P.alive(i)) out.set(i, what);
  return out;
}

function faceView(w: World, seat: string, n: number, i: number, tries: number): FaceView {
  const P = econ(w).P;
  const sb = seatBook(w, seat);
  const seen = inTheNews(w).get(i);
  const rel = relOf(sb, i);
  const pub = publicFaces(w).get(i);
  const life = lifeOf(w);
  const recog = life?.recog.find((r) => r.who === i);
  const heard = overheardOf(w, i);
  if (rel) {
    const word = bondWord(circleRegard(w, i).score);
    const work = rel.depth >= 2 ? `, who ${jobLine(w, i)}` : '';
    return { n, who: i, name: P.name(i), look: '', heard, news: '', known: word, word, recognises: false, exchanges: rel.depth,
      text: `${P.name(i)}${work}. You have talked ${rel.depth <= 1 ? 'once' : `${rel.depth} times`}. ${word}` };
  }
  if (seen || pub) {
    const f = seen ? econ(w).firms[seen.firm] : undefined;
    const h = seen ? headline(w, seen.ev) : '';
    const what = pub ?? `who runs ${f?.name ?? 'a firm'}`;
    return { n, who: i, name: P.name(i), look: '', heard, news: f?.name ?? what, known: 'from the papers', word: '', recognises: false, exchanges: 0,
      text: `${P.name(i)}, ${pub ? what : `who runs ${f?.name}`}. You know the face from the paper${h ? `: "${h}"` : ''}` };
  }
  const look = lookOf(w, i, tries);
  if (recog) {
    return { n, who: i, name: '', look, heard, news: '', known: 'seems to know you', word: '', recognises: true, exchanges: 0,
      text: `${look}. They are looking at you as if trying to place you` };
  }
  return { n, who: i, name: '', look, heard, news: '', known: '', word: '', recognises: false, exchanges: 0, text: `${look}. From the next table: ${heard}` };
}

// ---------- the evening: a table you sit at while the clock waits for you

function clockNow(w: World): number {
  const c = w.state.clock as { min?: number } | undefined;
  return typeof c?.min === 'number' ? c.min : 1320;
}
export function absNow(w: World): number { return w.day * 1440 + clockNow(w); }

/** The table you are at, if the doors are still open. Past closing time the evening ends by itself. */
function liveTable(w: World, sb: Seat): Table | null {
  const t = sb.table;
  if (!t || !t.open) return null;
  if (absNow(w) >= t.closeAbs) {
    t.open = false;
    t.left = 'closing time';
    return null;
  }
  return t;
}
const noTable = (): Res => no('you are not at a venue. Pick a place first');
export function doorPrice(w: World, me: number, v: Venue): number { return Math.max(100, Math.round(econ(w).wage * v.k * standingMult(w, me))); }
export function roundPrice(w: World, me: number, v: Venue): number { return Math.max(100, Math.round(econ(w).wage * v.k * 0.7 * standingMult(w, me))); }

/** What an action costs in time. The evening ends if the doors close first. */
function spend(w: World, t: Table, minutes: number): { minutes: number; closed: boolean } {
  const left = t.closeAbs - absNow(w);
  if (minutes >= left) { t.open = false; t.left = 'closing time'; return { minutes: Math.max(0, left), closed: true }; }
  t.minutes += minutes;
  return { minutes, closed: false };
}

export interface Res { ok: boolean; text: string; lines?: string[]; eventId?: number; minutes?: number; pause?: boolean }
const no = (text: string): Res => ({ ok: false, text });

export function tonightFaces(w: World, seat: string): { venue: string; venueId: string; faces: FaceView[]; asked: number; open: boolean } | null {
  const sb = seatBook(w, seat);
  const t = sb.table;
  if (!t || (!t.open && w.day > t.day + 1)) return null;
  return { venue: VENUES[t.venue].name, venueId: VENUES[t.venue].id, faces: t.faces.map((i, k) => faceView(w, seat, k + 1, i, 0)), asked: t.asked.length, open: !!liveTable(w, sb) };
}

/** Leave the place you are at: the bill is paid, the clock is yours again. */
export function leaveVenue(w: World, seat: string): Res {
  const sb = seatBook(w, seat);
  const t = liveTable(w, sb);
  if (!t) return no('you are not at a venue');
  const v = VENUES[t.venue];
  const sp = spend(w, t, 10);
  t.open = false;
  t.left = 'you left';
  const met = t.asked.length;
  return { ok: true, minutes: sp.minutes, text: `You say your goodbyes and step out of ${v.name}. You spent ${usd(t.spent)} in about ${t.minutes} minutes${met ? ` and talked with ${met} ${met === 1 ? 'person' : 'people'}` : ''}.` };
}

export function goOut(w: World, seat: string, venueKey: string, classTonight: string): Res {
  const me = whoOf(w, seat);
  const s = econ(w), P = s.P;
  if (me < 0 || !P.alive(me)) return no('nobody is going out');
  const v = findVenue(venueKey);
  if (v < 0) return no(`where? ${VENUES.map((x) => `${x.id} (${x.name})`).join(', ')}`);
  const sb = seatBook(w, seat);
  if (classTonight) return no(`tonight is class: ${classTonight}`);
  if (P.health[me] < 30) return no('you are too unwell to go out');
  const cost = doorPrice(w, me, VENUES[v]);
  const id = P.id(me);
  const here = liveTable(w, sb);
  const nowMin = clockNow(w);
  if (nowMin >= CLOSE_AT && nowMin < VENUES[v].opens) return no(`${VENUES[v].name} opens at ${clockText(VENUES[v].opens)}. It is ${clockText(nowMin)} now`);
  if (here && here.venue === v) return no(`you are already at ${VENUES[v].name}`);
  if (Math.floor(w.ledger.balance(id, DEP)) < cost) return no(`an evening at ${VENUES[v].name} costs about ${usd(cost)} and you do not have it`);
  let before = '';
  if (here) {
    leaveVenue(w, seat);
    before = ` You leave ${VENUES[here.venue].name} after ${here.minutes} minutes.`;
  }
  const ev = w.events.emit('venue.go', `An evening at ${VENUES[v].name} || ${usd(cost)} on the door and a first drink`, [w.genesis], id);
  if (!pay(w, id, retailPayee(w), cost, 'venue.evening', ev)) return no('the bill did not leave your account');
  const crowd = scan(w).crowd[v];
  const news = inTheNews(w);
  const pubs = publicFaces(w);
  const recog = new Set((lifeOf(w)?.recog ?? []).map((r) => r.who));
  const faces: number[] = [];
  const push = (i: number): void => { if (faces.length < 7 && !faces.includes(i)) faces.push(i); };
  crowd.filter((i) => news.has(i) || pubs.has(i)).sort((x, y) => ((news.get(y)?.day ?? 0) - (news.get(x)?.day ?? 0)) || x - y).slice(0, 2).forEach(push);
  crowd.filter((i) => recog.has(i)).slice(0, 2).forEach(push);
  crowd.filter((i) => relOf(sb, i)).sort((x, y) => x - y).slice(0, 2).forEach(push);
  [...crowd].sort((x, y) => mix(x, w.day, 99) - mix(y, w.day, 99)).forEach(push);
  const open = absNow(w);
  const closeAbs = (Math.floor(open / 1440) + (open % 1440 >= CLOSE_AT ? 1 : 0)) * 1440 + CLOSE_AT;
  sb.table = { day: w.day, venue: v, faces, asked: [], rounds: 0, listened: false, spent: cost, open: true, openAbs: open, closeAbs, tonight: {}, minutes: 0 };
  sb.lastOut = w.day;
  sb.outings++;
  book(w).yOut++;
  const sp = spend(w, sb.table, 10);
  const views = faces.map((i, k) => faceView(w, seat, k + 1, i, 0));
  // Two faces in one room must not read the same: move the pick on until each description is new.
  const used = new Set<string>();
  for (let k = 0; k < views.length; k++) {
    if (!views[k].look) continue;
    let tries = 0;
    while (tries < 12 && lookKey(w, faces[k], tries).some((part) => used.has(part))) tries++;
    if (tries > 0) views[k] = faceView(w, seat, k + 1, faces[k], tries);
    for (const part of lookKey(w, faces[k], tries)) used.add(part);
  }
  const lines = [
    ...(views.length ? views.map((f) => `  ${f.n}. ${f.text}.`) : ['  The place is empty tonight.']),
    views.length ? 'Pick a number to talk, buy a round, listen, or leave when you are ready. The clock waits while you are here.' : 'Nobody is in. You can leave when you like.',
  ];
  return { ok: true, pause: true, minutes: sp.minutes, text: `${dateText(w.day)}, ${clockText(open % 1440)}.${before} You step into ${VENUES[v].name}, ${VENUES[v].where} (${usd(cost)} at the door). About ${crowd.length} people are in, ${crowdWords(w, crowd)}.`, lines, eventId: ev };
}

function shared(w: World, me: number, who: number, rel: Rel | undefined, venue: number): number {
  const s = econ(w), P = s.P;
  let n = 0;
  const a = P.employer[me] >= 0 ? s.firms[P.employer[me]].sector : '';
  const b = P.employer[who] >= 0 ? s.firms[P.employer[who]].sector : '';
  if (a && a === b) n++;
  if (rel?.how.startsWith('classmate')) n++;
  if (regularOf(w, who) === venue) n++;
  if (P.habit[me] && P.habit[me] === P.habit[who]) n++;
  return n;
}

function meet(w: World, seat: string, who: number, venue: number, how: string, trust: number, friend: number, ev0: number): { rel: Rel; first: boolean } {
  const sb = seatBook(w, seat);
  const hit = relOf(sb, who);
  if (hit) return { rel: hit, first: false };
  circleMeet(w, who, 'acquaintance', '', trust, friend, how.charAt(0).toUpperCase() + how.slice(1));
  const rel: Rel = { who, venue, how, first: w.day, last: w.day, met: 1, asked: {}, refused: 0, helped: 0, owes: 0, owesDay: w.day, depth: 0, covered: [] };
  sb.people.push(rel);
  book(w).yMet++;
  void ev0;
  return { rel, first: true };
}

/** A word with someone away from any bar: a call, a message across a counter. Draws on the same ladder of exchanges. */
export function chatWith(w: World, seat: string, who: number): { text: string; lines?: string[]; eventId?: number } | { why: string } {
  const me = whoOf(w, seat), P = econ(w).P;
  if (me < 0 || who < 0 || !P.alive(who)) return { why: 'nobody to talk to' };
  const sb = seatBook(w, seat);
  const existing = relOf(sb, who);
  if (existing && existing.asked.chat === w.day) return { why: `you have already spoken with ${P.name(who)} today` };
  const c = cause(w, who);
  const { rel, first } = meet(w, seat, who, -1, 'knew each other already', 24, 24, c);
  rel.asked.chat = w.day;
  const score = circleRegard(w, who).score;
  const said = converse(w, { me, who, venue: 'street', venueName: 'a quiet word', score, depth: rel.depth, covered: rel.covered, first: first || rel.depth === 0, salt: mix(who, rel.depth, w.day) });
  rel.depth++; rel.last = w.day; rel.met++;
  if (!rel.covered.includes(said.topic)) rel.covered.push(said.topic);
  const ev = w.events.emit('venue.talk', `A word with ${P.name(who)} || ${said.gist}`, [c], P.id(me));
  circleTouch(w, who, said.delta, said.gated ? 'You asked too soon' : `You talked about ${said.gist}`, ev);
  return { text: said.text, lines: [`With ${P.name(who).split(' ')[0]}: ${bondWord(circleRegard(w, who).score)} (${rel.depth} ${rel.depth === 1 ? 'exchange' : 'exchanges'}).`], eventId: ev };
}

/** What a contact says about the firm they work at when nothing private is known: seats, mood, who decides. */
export function firmKnowledgeFrom(w: World, seat: string, slot: number, firmKey: string): { text: string; eventId?: number } | undefined {
  const who = circleWhoAt(w, slot);
  const s = econ(w), P = s.P;
  if (who < 0 || who >= P.n) return undefined;
  const key = firmKey.toLowerCase().replace(/^eq:/, '');
  const f = s.firms.find((x) => x.id.toLowerCase() === key || x.id.replace(/^frm_/, '') === key || x.name.toLowerCase() === key);
  if (!f || P.employer[who] !== f.idx) return undefined;
  const p = profileOf(w, who);
  const score = circleRegard(w, who).score;
  const body = workTalk(w, p, { me: whoOf(w, seat), who, venue: 'street', venueName: '', score, depth: 0, covered: [], first: false, salt: mix(who, w.day, 3) });
  return { text: `${P.name(who)} has nothing private on ${f.name}, but tells you what the floor looks like. ${body}`, eventId: P.lastEv[who] >= 0 ? P.lastEv[who] : undefined };
}

/** A classmate on the first night of a course. */
export function metClassmate(w: World, seat: string, who: number, course: string, ev: number): void {
  meet(w, seat, who, -1, `classmate in ${course}`, 20, 14, ev);
}

export function approach(w: World, seat: string, n: number, topicArg = ''): Res {
  const me = whoOf(w, seat), P = econ(w).P;
  const sb = seatBook(w, seat);
  const t = liveTable(w, sb);
  if (!t) return noTable();
  const who = t.faces[n - 1];
  if (who === undefined) return no(`the faces are numbered 1 to ${t.faces.length}`);
  const word = TOPIC_WORDS[topicArg.trim().toLowerCase()];
  const v = VENUES[t.venue];
  const had = t.tonight[who] ?? 0;
  if (had >= 5) return no(`you have talked with ${P.name(who)} for most of the evening already. Try someone else, or come back another night`);
  const name0 = P.name(who);
  const c = cause(w, who);
  const recogRow = lifeOf(w)?.recog.find((r) => r.who === who);
  const how = recogRow ? `knew you before: you ${recogRow.how}` : `met at ${v.name} on ${dateText(w.day, false)}`;
  const { rel, first } = meet(w, seat, who, t.venue, how, recogRow ? 30 : 16, recogRow ? 30 : 16, c);
  if (first) {
    const ev = w.events.emit('venue.meet', `First meeting with ${name0} at ${v.name} || ${name0} ${jobLine(w, who)}`, [c], P.id(me));
    circleTouch(w, who, 0, recogRow ? `You knew each other before: you ${recogRow.how}` : `You met at ${v.name}`, ev);
    rel.recog = recogRow?.how;
  } else {
    rel.met++;
  }
  if (!t.asked.includes(who)) t.asked.push(who);
  const score = circleRegard(w, who).score;
  const said = converse(w, {
    me, who, venue: v.id, venueName: v.name, score, depth: rel.depth, covered: rel.covered, recog: rel.recog, first: first || rel.depth === 0,
    salt: mix(who, rel.depth, w.day), word,
  });
  rel.depth++;
  rel.last = w.day;
  if (!rel.covered.includes(said.topic)) rel.covered.push(said.topic);
  t.tonight[who] = had + 1;
  const shareBoost = first ? 0 : 3 * shared(w, me, who, rel, t.venue);
  const delta = Math.max(1, said.delta + (said.gated ? 0 : Math.min(4, shareBoost)));
  const ev = w.events.emit('venue.talk', `${first ? 'First' : 'Another'} talk with ${name0} at ${v.name} || ${said.gist}`, [c], P.id(me));
  circleTouch(w, who, delta, said.gated ? `You asked about ${said.topic} too soon at ${v.name}` : `You talked about ${said.gist} at ${v.name}`, ev);
  const word2 = bondWord(circleRegard(w, who).score);
  const sp = spend(w, t, first ? 16 : 12);
  const meetLine = first ? `You introduce yourself. This is ${name0}, who ${jobLine(w, who)}. ` : '';
  const end = sp.closed ? ' The staff start stacking chairs and the evening ends.' : '';
  return {
    ok: true, eventId: ev, minutes: sp.minutes,
    text: `${meetLine}${said.text}`,
    lines: [`With ${name0.split(' ')[0]}: ${word2} (${rel.depth} ${rel.depth === 1 ? 'exchange' : 'exchanges'}).${end}`],
  };
}

export function buyRound(w: World, seat: string): Res {
  const me = whoOf(w, seat), s = econ(w), P = s.P;
  const sb = seatBook(w, seat);
  const t = liveTable(w, sb);
  if (!t) return noTable();
  if (t.rounds >= 3) return no('three rounds is plenty for one evening');
  const v = VENUES[t.venue];
  const cost = roundPrice(w, me, v);
  const id = P.id(me);
  if (Math.floor(w.ledger.balance(id, DEP)) < cost) return no(`a round here costs about ${usd(cost)} and you do not have it`);
  const ev = w.events.emit('venue.round', `A round at ${v.name} || ${usd(cost)}`, [w.genesis], id);
  if (!pay(w, id, retailPayee(w), cost, 'venue.round', ev)) return no('the bill did not leave your account');
  t.rounds++;
  t.spent += cost;
  let warmed = 0;
  for (const who of t.asked) { circleTouch(w, who, 4, `You bought a round at ${v.name}`, ev); warmed++; }
  let extra = '';
  const stranger = t.faces.find((i) => !t.asked.includes(i) && !relOf(sb, i));
  if (stranger !== undefined) {
    const nm = P.name(stranger);
    const { first } = meet(w, seat, stranger, t.venue, `met at ${v.name} on ${dateText(w.day, false)}`, 12, 12, ev);
    if (first) extra = ` ${nm}, who ${jobLine(w, stranger)}, raises a glass back. You have met.`;
  }
  const sp = spend(w, t, 10);
  return { ok: true, eventId: ev, minutes: sp.minutes, text: `You buy a round (${usd(cost)}).${warmed ? ` The people you have talked to think the better of you.` : ''}${extra}${sp.closed ? ' The staff start stacking chairs and the evening ends.' : ''}` };
}

export function listen(w: World, seat: string): Res {
  const me = whoOf(w, seat), s = econ(w), P = s.P;
  const sb = seatBook(w, seat);
  const t = liveTable(w, sb);
  if (!t) return noTable();
  if (t.listened) return no('you have already spent tonight with your ears open');
  t.listened = true;
  const v = VENUES[t.venue];
  const sp = spend(w, t, 30);
  const chance = [0.3, 0.7, 0.6, 0.5, 0.3, 0.2][t.venue];
  const crowd = scan(w).crowd[t.venue];
  if (unit(mix(me, w.day, 31)) < chance) {
    const order = [...t.faces, ...[...crowd].sort((x, y) => mix(x, w.day, 5) - mix(y, w.day, 5)).slice(0, 24)];
    for (const i of order) {
      const f = quietFact(w, i);
      if (!f) continue;
      const st = w.state.player as { seat?: Record<string, { heard: { factId: number; eventId: number; from: number; day: number }[] }> } | undefined;
      const heard = st?.seat?.[seat]?.heard;
      if (heard && !heard.some((h) => h.factId === f.id)) heard.push({ factId: f.id, eventId: f.eventId, from: i, day: w.day });
      const e = P.employer[i];
      const sec = e >= 0 ? s.firms[e].sector : '';
      const read = sec && knowledgeIn(w, seat, sec) > 0 ? ' Your classes let you weigh it properly.' : '';
      const ev = w.events.emit('venue.overheard', `Overheard at ${v.name}: ${f.msg}`, [f.eventId], P.id(me));
      return { ok: true, eventId: ev, minutes: sp.minutes, text: `At the next table, someone ${jobLine(w, i).replace('is between jobs', 'out of work')}, says: ${f.msg} Overheard, not told: it is unconfirmed, and trading on it is your own risk.${read}` };
    }
  }
  const scraps = t.faces.slice(0, 3).map((i) => overheardOf(w, i));
  return { ok: true, minutes: sp.minutes, text: `You listen for half an hour at ${v.name}. Mostly small things: ${scraps.join(' ')} Nothing worth trading on.` };
}

// ---------- people you know

export interface KnownRow { n: number; who: number; name: string; job: string; how: string; word: string; met: number; line: string; exchanges: number; covered: string[]; score: number }
export function knownList(w: World, seat: string): KnownRow[] {
  const P = econ(w).P;
  const sb = seatBook(w, seat);
  const rows = sb.people.filter((r) => P.alive(r.who)).sort((a, b) => b.last - a.last || a.who - b.who);
  return rows.map((r, k) => {
    const reg = circleRegard(w, r.who);
    const owes = openOwes(w, r);
    return {
      n: k + 1, who: r.who, name: P.name(r.who), job: jobLine(w, r.who), how: r.how, word: friendWord(reg.score), met: r.met, exchanges: r.depth, covered: r.covered.slice(), score: reg.score,
      line: `${friendWord(reg.score)}${owes > 0 ? '; you owe them a favour' : ''}${r.refused > 0 ? '; they remember being refused' : ''}`,
    };
  });
}
function pick(w: World, seat: string, k: number): { rel: Rel; who: number } | string {
  const rows = knownList(w, seat);
  const row = rows[k - 1];
  if (!row) return rows.length ? `people you know are numbered 1 to ${rows.length}` : 'you do not know anyone yet. Go out and approach someone';
  return { rel: relOf(seatBook(w, seat), row.who)!, who: row.who };
}

export function businessTalk(w: World, seat: string, k: number): Res {
  const hit = pick(w, seat, k);
  if (typeof hit === 'string') return no(hit);
  const { rel, who } = hit;
  const P = econ(w).P, me = whoOf(w, seat);
  const name = P.name(who);
  const reg = circleRegard(w, who);
  if (rel.asked.business === w.day) return no(`you have already talked shop with ${name} today`);
  rel.asked.business = w.day;
  if (reg.score < 22) {
    const ev = w.events.emit('venue.shop', `${name} keeps shop talk to themselves || not trusted enough yet`, [cause(w, who)], P.id(who));
    circleTouch(w, who, -3, 'You pressed for shop talk too early', ev);
    rel.refused++;
    return { ok: true, eventId: ev, text: `${name} changes the subject: you have not known each other long enough for shop talk. Asking too soon cost you a little trust.` };
  }
  const e = econ(w).P.employer[who];
  const firm = e >= 0 ? econ(w).firms[e] : undefined;
  const c = cause(w, who);
  if (!firm || firm.closed) {
    const ev = w.events.emit('venue.shop', `${name} talks shop: out of work, and asking who is hiring`, [c], P.id(who));
    circleTouch(w, who, 1, 'You talked shop', ev);
    return { ok: true, eventId: ev, text: `${name} is out of work and wants to know who is hiring. Nothing there to trade on.` };
  }
  const chief = firm.ceo === who;
  const gap = firmGap(w, firm);
  const trend = firm.lastProfit > 0 ? 'in profit' : firm.lastProfit < 0 ? 'losing money' : 'about level';
  const ev = w.events.emit('venue.shop', `${name} talks shop about ${firm.name}: ${trend}, ${gap > 1 ? 'short of staff' : gap < -1 ? 'overstaffed' : 'staffed about right'}`, [firm.profitEv !== undefined && w.events.get(firm.profitEv) ? firm.profitEv : c], P.id(who));
  circleTouch(w, who, 1, 'You talked shop', ev);
  if (chief && reg.score >= 40) {
    const month = firm.lastProfit;
    return { ok: true, eventId: ev, text: `${name} lowers their voice about ${firm.name}: last month it made ${usd(month)}, and it is ${gap > 1 ? 'short of staff' : gap < -1 ? 'carrying more people than it needs' : 'staffed about right'}. Legal line: they sit where the books are added up. This is inside information, and trading on it is insider dealing.` };
  }
  const floor = firm.lastProfit < 0 ? 'orders have been thin' : firm.lastProfit > 0 ? 'orders are decent' : 'orders are flat';
  return { ok: true, eventId: ev, text: `${name} says on the floor at ${firm.name} ${floor}, and the firm is ${gap > 1 ? 'taking people on' : gap < -1 ? 'cutting back' : 'holding its headcount'}. Legal line: fair game, a worker passing on what the floor looks like, not the books.` };
}

function playerFirm(w: World, me: number): Firm | undefined {
  const s = econ(w);
  const job = s.P.employer[me] >= 0 ? s.firms[s.P.employer[me]] : undefined;
  if (job && !job.closed && controls(w, me, job)) return job;
  return s.firms.find((f) => !f.closed && f.ceo === me);
}

export function offerJob(w: World, seat: string, k: number): Res {
  const hit = pick(w, seat, k);
  if (typeof hit === 'string') return no(hit);
  const { rel, who } = hit;
  const s = econ(w), P = s.P, me = whoOf(w, seat);
  const f = playerFirm(w, me);
  if (!f) return no('you have no firm to offer a job in. Build or take control of one first');
  const name = P.name(who);
  if (P.employer[who] === f.idx) return no(`${name} already works for ${f.name}`);
  if (!P.adult(w, who)) return no(`${name} is not looking for work`);
  const reg = circleRegard(w, who);
  const jobless = P.employer[who] < 0;
  const need = jobless ? 25 : 35;
  const ev0 = cause(w, who);
  if (reg.score < need) {
    const ev = w.events.emit('venue.refused', `${name} turns down a job at ${f.name} || not well enough acquainted`, [ev0], P.id(who));
    circleTouch(w, who, -4, `You offered a job too soon`, ev);
    rel.refused++;
    return { ok: true, eventId: ev, text: `${name} thanks you and says no: they do not know you well enough to take your pay. It cost you a little trust.` };
  }
  const cur = P.employer[who] >= 0 ? s.firms[P.employer[who]] : undefined;
  if (cur && reg.score < 55 && cur.lastProfit >= 0) {
    return { ok: true, text: `${name} is settled at ${cur.name} and would want to trust you more before leaving it.` };
  }
  joinFirm(s, who, f);
  rel.helped++;
  const ev = w.events.emit('venue.hire', `${name} is hired at ${f.name} || they took the offer because they trust their new employer`, [ev0], P.id(me));
  circleTouch(w, who, 5, `You gave them a job at ${f.name}`, ev);
  return { ok: true, eventId: ev, text: `${name} joins ${f.name}${cur ? ` and leaves ${cur.name}` : ''}.` };
}

const NEED: Record<string, number> = { intro: 30, interview: 28, loan: 50, lender: 45, invest: 55 };
const LABEL: Record<string, string> = { intro: 'an introduction', interview: 'a word for an interview', loan: 'a loan', lender: 'a word with their lender', invest: 'money beside yours' };

export function favour(w: World, seat: string, k: number, what: string, cents: number, firmKey: string): Res {
  const hit = pick(w, seat, k);
  if (typeof hit === 'string') return no(hit);
  const { rel, who } = hit;
  const s = econ(w), P = s.P, me = whoOf(w, seat), L = w.ledger;
  const kind = what.toLowerCase();
  if (!(kind in NEED)) return no('ask for: intro, interview, loan, lender or invest');
  const name = P.name(who);
  if (rel.asked[kind] !== undefined && w.day - rel.asked[kind] < 30) return no(`you asked ${name} for that a few days ago. Give it a month`);
  const reg = circleRegard(w, who);
  const owes = openOwes(w, rel);
  const need = NEED[kind] + 8 * owes;
  const e = P.employer[who];
  const theirFirm = e >= 0 ? s.firms[e] : undefined;
  const wd = L.balance(P.id(who), DEP) / Math.max(1, s.wage);
  // Can they do it at all? An honest "I can't" costs nothing.
  const cannot = ((): string => {
    if (kind === 'interview') {
      if (!theirFirm) return `${name} has no firm to speak for`;
      if (firmGap(w, theirFirm) <= 1) return `${theirFirm.name} is not hiring, so a word would mean nothing`;
    }
    if (kind === 'lender' && !(theirFirm?.sector === 'FINANCE' || theirFirm?.ceo === who || wd > 300)) return `${name} knows no one at a bank`;
    if (kind === 'loan' && Math.floor(L.balance(P.id(who), DEP) * 0.25) < 20000) return `${name} cannot spare that kind of money`;
    return '';
  })();
  rel.asked[kind] = w.day;
  if (cannot) { rel.asked[kind] = w.day - 25; return { ok: true, text: `${cannot}. Nothing lost.` }; }
  const c = cause(w, who);
  if (reg.score < need) {
    const cost = Math.min(10, 3 + Math.round((need - reg.score) / 6));
    const ev = w.events.emit('venue.refused', `${name} refuses ${LABEL[kind]} || asked too soon`, [c], P.id(who));
    circleTouch(w, who, -cost, `You asked ${LABEL[kind]} too soon`, ev);
    rel.refused++;
    book(w).yNo++;
    return { ok: true, eventId: ev, text: `${name} says no: "We have not known each other long enough for that." ${owes > 0 ? 'You still owe them a favour. ' : ''}It cost you some trust.` };
  }
  const done = (text: string, ev: number): Res => {
    rel.helped++;
    rel.owes = owes + 1;
    rel.owesDay = w.day;
    book(w).yFav++;
    circleTouch(w, who, -Math.round(NEED[kind] / 8), `They did you ${LABEL[kind]}`, ev);
    return { ok: true, eventId: ev, text };
  };
  if (kind === 'intro') {
    const slot = reg.slot;
    if (slot < 0) return no('you cannot reach them');
    const r = circleAct(w, me, P.id(me), { kind: 'introduce', slot });
    if (r.status === 'rejected') { rel.asked[kind] = w.day - 25; return { ok: true, text: `${name} would, but ${r.why}` }; }
    return done(r.text ?? `${name} introduces you to someone`, r.eventId ?? c);
  }
  if (kind === 'interview' && theirFirm) {
    const ev = w.events.emit('venue.favour', `${name} puts in a word at ${theirFirm.name} || a friend vouches`, [c], P.id(who));
    seatBook(w, seat).refs.push({ firm: theirFirm.idx, who, until: w.day + 45 });
    return done(`${name} will put in a word at ${theirFirm.name}. Apply when you see the opening: it will go better for it.`, ev);
  }
  if (kind === 'loan') {
    const max = Math.floor(L.balance(P.id(who), DEP) * 0.25);
    const asked = cents > 0 ? cents : 100000;
    const give = Math.min(asked, max);
    const ev = w.events.emit('venue.loan', `${name} lends ${usd(give)} || a friend with money to spare`, [c], P.id(who));
    if (!pay(w, P.id(who), P.id(me), give, 'venue.loan', ev)) return no('the money did not move');
    seatBook(w, seat).loans.push({ who, cents: give, due: w.day + 180, late: false, ev });
    return done(`${name} lends you ${usd(give)}. They expect it back in six months, with a little on top.`, ev);
  }
  if (kind === 'lender') {
    const ev = w.events.emit('venue.favour', `${name} speaks for a borrower to a lender || a friend vouches`, [c], P.id(who));
    const book0 = borrowMargin(w, me, cents > 0 ? cents : 200000, ev);
    const text = book0.taken > 0 ? `${name} spoke for you. The bank lent ${usd(book0.taken)}.` : `${name} spoke for you, but the bank did not lend: ${book0.why ?? 'no room'}.`;
    return done(text, ev);
  }
  if (kind === 'invest') {
    if (!firmKey) return no('say which firm: favour N invest FIRM DOLLARS');
    if (!contactsOf(w, me).some((x) => x.who === who && x.trust >= 35)) return { ok: true, text: `${name} likes you, but not enough to put money behind you yet.` };
    const r = buyIn(w, me, firmKey, 'partners', cents > 0 ? cents : 100000);
    if ('why' in r) { rel.asked[kind] = w.day - 25; return { ok: true, text: `${name} would join you, but: ${r.why}` }; }
    return done(r.text, r.eventId);
  }
  return no('not a favour');
}

// ---------- the job market

export function jobBoost(w: World, person: number, f: Firm): { fit: number; vouch: boolean } {
  const seat = seatId(w);
  if (!seat || whoOf(w, seat) !== person) return { fit: 0, vouch: false };
  const sb = book(w).seats[seat];
  return {
    fit: knowledgeIn(w, seat, f.sector) * 0.12,
    vouch: !!sb?.refs.some((r) => r.firm === f.idx && r.until >= w.day),
  };
}

// ---------- what the city-life app shows

export interface VenueRow { n: number; id: string; name: string; where: string; cost: number; round: number; opens: string; open: boolean; count: number; line: string; say: string; news: string[]; friends: string[]; here: boolean }
export function venueRows(w: World, seat: string): VenueRow[] {
  const s = econ(w), P = s.P;
  const sc = scanToday(w);
  const sb = seatBook(w, seat);
  const news = inTheNews(w);
  return VENUES.map((v, k) => {
    const crowd = sc.crowd[k];
    const faces = crowd.filter((i) => news.has(i)).map((i) => `${P.name(i)}, ${s.firms[news.get(i)!.firm].name}`).slice(0, 2);
    const friends = crowd.filter((i) => relOf(sb, i)).map((i) => P.name(i)).slice(0, 3);
    return {
      n: k + 1, id: v.id, name: v.name, where: v.where, cost: doorPrice(w, whoOf(w, seat), v), round: roundPrice(w, whoOf(w, seat), v), opens: clockText(v.opens), open: !(clockNow(w) >= CLOSE_AT && clockNow(w) < v.opens), say: v.say, count: crowd.length,
      line: `${crowd.length ? `about ${crowd.length} in tonight` : 'quiet tonight'}: ${crowd.length ? crowdWords(w, crowd) : v.say}`,
      news: faces, friends, here: !!liveTable(w, sb) && sb.table?.venue === k,
    };
  });
}

export interface CityBook {
  venues: VenueRow[];
  tonight: { venue: string; venueId: string; faces: FaceView[]; asked: number; rounds: number; listened: boolean; open: boolean; spent: number; minutes: number; closesAt: number; left: string } | null;
  people: KnownRow[];
  loans: { name: string; cents: number; due: number }[];
}
export function cityBook(w: World, seat: string): CityBook {
  const P = econ(w).P;
  const sb = seatBook(w, seat);
  const t = tonightFaces(w, seat);
  return {
    venues: venueRows(w, seat),
    tonight: t && sb.table ? { ...t, rounds: sb.table.rounds, listened: sb.table.listened, spent: sb.table.spent, minutes: sb.table.minutes, closesAt: sb.table.closeAbs, left: sb.table.left ?? '' } : null,
    people: knownList(w, seat),
    loans: sb.loans.map((l) => ({ name: P.name(l.who), cents: l.cents, due: l.due })),
  };
}

// ---------- the module's own housekeeping

export function monthly(w: World): void {
  const b = book(w), P = econ(w).P;
  for (const seat of Object.keys(b.seats)) {
    const sb = b.seats[seat];
    const me = whoOf(w, seat);
    sb.refs = sb.refs.filter((r) => r.until >= w.day);
    if (me < 0 || !P.alive(me)) continue;
    const keep: Loan[] = [];
    for (const l of sb.loans) {
      if (l.due > w.day) { keep.push(l); continue; }
      if (!P.alive(l.who)) continue;
      const owed = Math.round(l.cents * 1.04);
      const ev = w.events.emit('venue.repay', `A loan from ${P.name(l.who)} falls due: ${usd(owed)}`, [l.ev], P.id(me));
      if (Math.floor(w.ledger.balance(P.id(me), DEP)) >= owed && pay(w, P.id(me), P.id(l.who), owed, 'venue.repay', ev)) {
        circleTouch(w, l.who, l.late ? 1 : 4, l.late ? 'You paid them back, late' : 'You paid them back on time', ev);
        continue;
      }
      if (!l.late) {
        l.late = true;
        const miss = w.events.emit('venue.late', `A loan from ${P.name(l.who)} is not repaid on the day || cash short`, [l.ev], P.id(me));
        circleTouch(w, l.who, -12, 'You did not repay them on the day', miss);
      }
      keep.push(l);
    }
    sb.loans = keep;
  }
}
export function init(w: World): void { w.state.venues = { seats: {}, yOut: 0, yMet: 0, yFav: 0, yNo: 0 } as Book; scanMemo = undefined; }
export function yearly(w: World): Record<string, number> {
  const b = book(w);
  let people = 0;
  for (const k of Object.keys(b.seats)) people += b.seats[k].people.length;
  const out = { outings: b.yOut, met: b.yMet, favours: b.yFav, refused: b.yNo, known: people };
  b.yOut = 0; b.yMet = 0; b.yFav = 0; b.yNo = 0;
  return out;
}
