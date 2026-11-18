// Six places to spend an evening. Who is there follows from the world: each person has a regular place that
// fits who they are, where they work and what they hold, and two usual nights a week. Nothing is drawn from a
// random stream: the evening is a pure function of the day and the people.
import type { World } from '../../kernel/index.ts';
import { borrowMargin } from '../banking/index.ts';
import { firmGap } from '../careers/jobs.ts';
import { circleAct, circleMeet, circleRegard, circleTouch } from '../circle/index.ts';
import { controls } from '../corporate/index.ts';
import { buyIn } from '../corporate/owner.ts';
import { DEP, GOV, pay, type EconState, type Firm } from '../economy/index.ts';
import { joinFirm } from '../economy/people.ts';
import { contactsOf, quietFact } from '../social/index.ts';
import { knowledgeIn } from '../courses/know.ts';

export interface Venue { id: string; name: string; where: string; k: number; say: string }
export const VENUES: Venue[] = [
  { id: 'anchor', name: 'The Anchor and Rope', where: 'on the quay', k: 0.35, say: 'port and factory workers' },
  { id: 'ticker', name: 'The Ticker', where: 'by the exchange', k: 0.8, say: 'traders, bankers and analysts' },
  { id: 'cellar', name: 'Cellar 41', where: 'uptown wine bar', k: 2.4, say: 'executives, owners and the well off' },
  { id: 'beaker', name: 'The Beaker', where: 'café by the labs', k: 0.45, say: 'engineers and founders' },
  { id: 'steward', name: "The Steward's Arms", where: 'union pub', k: 0.3, say: 'union members and shift workers' },
  { id: 'neon', name: 'Neon Yard', where: 'the club', k: 1.2, say: 'the young, gamblers and the crypto crowd' },
];

interface Rel {
  who: number; venue: number; how: string; first: number; last: number; met: number;
  asked: Record<string, number>; refused: number; helped: number; owes: number; owesDay: number;
}
interface Table { day: number; venue: number; faces: number[]; asked: number[]; rounds: number; listened: boolean; spent: number }
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
const usd = (c: number): string => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  for (let i = 0; i < P.n; i++) {
    if (i === me || !P.adult(w, i) || P.age(w, i) > 78 || P.health[i] < 35 || P.outUntil[i] > w.day) continue;
    const n1 = mix(i, 1, 0) % 7, n2 = mix(i, 2, 0) % 7;
    const usual = dow === n1 || dow === n2;
    if (!usual && dow !== 4) continue;
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
    if (a[v] < 0.2) continue;
    const p = usual ? Math.min(0.85, 0.25 + 0.7 * a[v]) : 0.3 * a[v];
    if (unit(mix(i, w.day, 7)) < p) crowd[v].push(i);
  }
  // A room only holds so many: on a busy night the rest do not get in.
  const room = [160, 140, 60, 90, 110, 200];
  for (let v = 0; v < crowd.length; v++) {
    if (crowd[v].length > room[v]) crowd[v] = crowd[v].sort((x, y) => mix(x, w.day, 13) - mix(y, w.day, 13)).slice(0, room[v]);
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

function ageWord(age: number): string {
  if (age < 20) return 'in their late teens';
  if (age < 30) return 'in their twenties';
  if (age < 40) return 'in their thirties';
  if (age < 50) return 'in their forties';
  if (age < 60) return 'in their fifties';
  return 'past sixty';
}
function jobLine(w: World, i: number): string {
  const s = econ(w), P = s.P;
  const e = P.employer[i];
  if (e < 0) return 'is between jobs';
  const f = s.firms[e];
  if (f.ceo === i) return `runs ${f.name}`;
  return `works at ${f.name}`;
}
function lookOf(w: World, i: number): string {
  const s = econ(w), P = s.P;
  const e = P.employer[i];
  const f = e >= 0 ? s.firms[e] : undefined;
  const wd = w.ledger.balS(P.slot[i], 'dep') / Math.max(1, s.wage);
  const coat = wd > 500 ? 'in a good coat' : wd < 60 ? 'in a worn jacket' : 'dressed for an evening out';
  if (!f) return `${coat}, looks like they have time on their hands`;
  if (f.ceo === i) return `${coat}, carries themselves like someone who runs things`;
  return `${coat}, looks like they work ${TRADE[f.sector] ?? 'somewhere in the city'}`;
}
function mood(w: World, i: number): string {
  const s = econ(w), P = s.P;
  const e = P.employer[i];
  if (e < 0) return 'They are looking for work and have views on who is hiring.';
  const f = s.firms[e];
  if (f.ceo === i) return f.lastProfit < 0 ? `${f.name} is losing money and they are not enjoying it.` : `They say ${f.name} is holding up, and complain about prices.`;
  if (firmGap(w, f) > 1) return `They say ${f.name} is short of hands.`;
  if (f.lastProfit < 0) return `They say it is a thin year at ${f.name}.`;
  return `They say business at ${f.name} is steady.`;
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

function friendWord(score: number): string {
  return score < 25 ? 'Just met' : score < 40 ? 'Acquaintance' : score < 55 ? 'Friendly' : score < 75 ? 'Friend' : 'Close friend';
}
function relOf(sb: Seat, who: number): Rel | undefined { for (const r of sb.people) if (r.who === who) return r; return undefined; }
function cause(w: World, who: number): number {
  const ev = econ(w).P.lastEv[who];
  return ev >= 0 && w.events.get(ev) ? ev : w.genesis;
}
function openOwes(w: World, r: Rel): number { return Math.max(0, r.owes - Math.floor((w.day - r.owesDay) / 60)); }

export interface Res { ok: boolean; text: string; lines?: string[]; eventId?: number }
const no = (text: string): Res => ({ ok: false, text });

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

export interface FaceView { n: number; name: string; text: string; news: string; known: string }
function faceView(w: World, seat: string, n: number, i: number): FaceView {
  const P = econ(w).P;
  const sb = seatBook(w, seat);
  const seen = inTheNews(w).get(i);
  const rel = relOf(sb, i);
  if (rel) {
    const word = friendWord(circleRegard(w, i).score);
    return { n, name: P.name(i), text: `${P.name(i)}, who ${jobLine(w, i)}. You have met ${rel.met === 1 ? 'once' : `${rel.met} times`}`, news: '', known: word };
  }
  if (seen) {
    const f = econ(w).firms[seen.firm];
    const h = headline(w, seen.ev);
    return { n, name: P.name(i), text: `${P.name(i)}, who runs ${f.name}. You know the face from the paper${h ? `: "${h}"` : ''}`, news: f.name, known: '' };
  }
  return { n, name: '', text: `Someone ${ageWord(P.age(w, i))}, ${lookOf(w, i)}`, news: '', known: '' };
}

export function tonightFaces(w: World, seat: string): { venue: string; faces: FaceView[]; asked: number } | null {
  const sb = seatBook(w, seat);
  const t = sb.table;
  if (!t || t.day !== w.day) return null;
  return { venue: VENUES[t.venue].name, faces: t.faces.map((i, k) => faceView(w, seat, k + 1, i)), asked: t.asked.length };
}

export function goOut(w: World, seat: string, venueKey: string, classTonight: string): Res {
  const me = whoOf(w, seat);
  const s = econ(w), P = s.P;
  if (me < 0 || !P.alive(me)) return no('nobody is going out');
  const v = findVenue(venueKey);
  if (v < 0) return no(`where? ${VENUES.map((x) => `${x.id} (${x.name})`).join(', ')}`);
  const sb = seatBook(w, seat);
  if (sb.table && sb.table.day === w.day) return no(`you are already out tonight, at ${VENUES[sb.table.venue].name}. Another evening starts tomorrow`);
  if (classTonight) return no(`tonight is class: ${classTonight}`);
  if (P.health[me] < 30) return no('you are too unwell to go out');
  const cost = Math.round(s.wage * VENUES[v].k);
  const id = P.id(me);
  if (Math.floor(w.ledger.balance(id, DEP)) < cost) return no(`an evening at ${VENUES[v].name} costs about ${usd(cost)} and you do not have it`);
  const ev = w.events.emit('venue.go', `An evening at ${VENUES[v].name} || ${usd(cost)} on drinks`, [w.genesis], id);
  if (!pay(w, id, retailPayee(w), cost, 'venue.evening', ev)) return no('the bill did not leave your account');
  const crowd = scan(w).crowd[v];
  const news = inTheNews(w);
  const faces: number[] = [];
  const push = (i: number): void => { if (faces.length < 6 && !faces.includes(i)) faces.push(i); };
  crowd.filter((i) => news.has(i)).sort((x, y) => (news.get(y)!.day - news.get(x)!.day) || x - y).slice(0, 2).forEach(push);
  crowd.filter((i) => relOf(sb, i)).sort((x, y) => x - y).slice(0, 2).forEach(push);
  [...crowd].sort((x, y) => mix(x, w.day, 99) - mix(y, w.day, 99)).forEach(push);
  sb.table = { day: w.day, venue: v, faces, asked: [], rounds: 0, listened: false, spent: cost };
  sb.lastOut = w.day;
  sb.outings++;
  book(w).yOut++;
  const views = faces.map((i, k) => faceView(w, seat, k + 1, i));
  const lines = [
    `You spend the evening at ${VENUES[v].name}, ${VENUES[v].where} (${usd(cost)}). About ${crowd.length} people are in, ${crowdWords(w, crowd)}.`,
    ...(views.length ? views.map((f) => `  ${f.n}. ${f.text}.`) : ['  The place is empty tonight.']),
    'You can approach N, buy a round, or listen.',
  ];
  return { ok: true, text: lines[0], lines: lines.slice(1), eventId: ev };
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
  circleMeet(w, who, 'colleague', how, trust, friend);
  const rel: Rel = { who, venue, how, first: w.day, last: w.day, met: 1, asked: {}, refused: 0, helped: 0, owes: 0, owesDay: w.day };
  sb.people.push(rel);
  book(w).yMet++;
  void ev0;
  return { rel, first: true };
}

/** A classmate on the first night of a course. */
export function metClassmate(w: World, seat: string, who: number, course: string, ev: number): void {
  meet(w, seat, who, -1, `classmate in ${course}`, 20, 14, ev);
}

export function approach(w: World, seat: string, n: number): Res {
  const me = whoOf(w, seat), P = econ(w).P;
  const sb = seatBook(w, seat);
  const t = sb.table;
  if (!t || t.day !== w.day) return no('you are not out tonight. Try go and a place');
  const who = t.faces[n - 1];
  if (who === undefined) return no(`the faces are numbered 1 to ${t.faces.length}`);
  if (t.asked.includes(who)) return no('you have already spoken with them tonight');
  if (t.asked.length >= 3) return no('three conversations make an evening. Come back another night');
  const v = VENUES[t.venue];
  t.asked.push(who);
  const name0 = P.name(who);
  const c = cause(w, who);
  const { rel, first } = meet(w, seat, who, t.venue, `met at ${v.name}`, 16, 16, c);
  if (first) {
    const ev = w.events.emit('venue.meet', `First meeting with ${name0} at ${v.name} || ${name0} ${jobLine(w, who)}`, [c], P.id(me));
    circleTouch(w, who, 0, `You met at ${v.name}`, ev);
    return { ok: true, eventId: ev, text: `You introduce yourself. This is ${name0}, who ${jobLine(w, who)}. ${mood(w, who)} A first meeting makes an acquaintance, not a friend.` };
  }
  const delta = 8 + 3 * shared(w, me, who, rel, t.venue);
  rel.met++;
  rel.last = w.day;
  const ev = w.events.emit('venue.talk', `Another talk with ${name0} at ${v.name} || trust grows a little`, [c], P.id(me));
  circleTouch(w, who, delta, `You talked again at ${v.name}`, ev);
  const word = friendWord(circleRegard(w, who).score);
  const back = rel.first === w.day ? 'You talk again, a second time tonight.' : `${name0} remembers you from ${rel.how.startsWith('met at') ? rel.how.slice(7) : 'before'}.`;
  return { ok: true, eventId: ev, text: `${back} ${mood(w, who)} Standing: ${word.toLowerCase()}.` };
}

export function buyRound(w: World, seat: string): Res {
  const me = whoOf(w, seat), s = econ(w), P = s.P;
  const sb = seatBook(w, seat);
  const t = sb.table;
  if (!t || t.day !== w.day) return no('you are not out tonight');
  if (t.rounds >= 2) return no('two rounds is plenty for one evening');
  const v = VENUES[t.venue];
  const cost = Math.round(s.wage * v.k * 0.7);
  const id = P.id(me);
  if (Math.floor(w.ledger.balance(id, DEP)) < cost) return no(`a round here costs about ${usd(cost)} and you do not have it`);
  const ev = w.events.emit('venue.round', `A round at ${v.name} || ${usd(cost)}`, [w.genesis], id);
  if (!pay(w, id, retailPayee(w), cost, 'venue.round', ev)) return no('the bill did not leave your account');
  t.rounds++;
  t.spent += cost;
  let warmed = 0;
  for (const who of t.asked) { circleTouch(w, who, 3, `You bought a round at ${v.name}`, ev); warmed++; }
  let extra = '';
  const stranger = t.faces.find((i) => !t.asked.includes(i) && !relOf(sb, i));
  if (stranger !== undefined) {
    const nm = P.name(stranger);
    const { first } = meet(w, seat, stranger, t.venue, `met at ${v.name}`, 12, 12, ev);
    if (first) extra = ` ${nm}, who ${jobLine(w, stranger)}, raises a glass back. You have met.`;
  }
  return { ok: true, eventId: ev, text: `You buy a round (${usd(cost)}).${warmed ? ` The people you talked to think the better of you.` : ''}${extra}` };
}

export function listen(w: World, seat: string): Res {
  const me = whoOf(w, seat), s = econ(w), P = s.P;
  const sb = seatBook(w, seat);
  const t = sb.table;
  if (!t || t.day !== w.day) return no('you are not out tonight');
  if (t.listened) return no('you have already spent tonight with your ears open');
  t.listened = true;
  const v = VENUES[t.venue];
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
      return { ok: true, eventId: ev, text: `At the next table, someone ${jobLine(w, i).replace('is between jobs', 'out of work')}, says: ${f.msg} Overheard, not told: it is unconfirmed, and trading on it is your own risk.${read}` };
    }
  }
  return { ok: true, text: `You listen for an hour at ${v.name}. Mostly rent, football and the weather: nothing worth trading on.` };
}

// ---------- people you know

export interface KnownRow { n: number; who: number; name: string; job: string; how: string; word: string; met: number; line: string }
export function knownList(w: World, seat: string): KnownRow[] {
  const P = econ(w).P;
  const sb = seatBook(w, seat);
  const rows = sb.people.filter((r) => P.alive(r.who)).sort((a, b) => b.last - a.last || a.who - b.who);
  return rows.map((r, k) => {
    const reg = circleRegard(w, r.who);
    const owes = openOwes(w, r);
    return {
      n: k + 1, who: r.who, name: P.name(r.who), job: jobLine(w, r.who), how: r.how, word: friendWord(reg.score), met: r.met,
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
  if (reg.score < 30) {
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

const NEED: Record<string, number> = { intro: 30, interview: 35, loan: 50, lender: 45, invest: 55 };
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

export interface VenueRow { n: number; id: string; name: string; where: string; cost: number; count: number; line: string; news: string[]; friends: string[]; here: boolean }
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
      n: k + 1, id: v.id, name: v.name, where: v.where, cost: Math.round(s.wage * v.k), count: crowd.length,
      line: `${crowd.length ? `about ${crowd.length} in tonight` : 'quiet tonight'}: ${crowd.length ? crowdWords(w, crowd) : v.say}`,
      news: faces, friends, here: sb.table?.day === w.day && sb.table.venue === k,
    };
  });
}

export interface CityBook {
  venues: VenueRow[];
  tonight: { venue: string; faces: FaceView[]; asked: number; rounds: number; listened: boolean } | null;
  people: KnownRow[];
  loans: { name: string; cents: number; due: number }[];
}
export function cityBook(w: World, seat: string): CityBook {
  const P = econ(w).P;
  const sb = seatBook(w, seat);
  const t = tonightFaces(w, seat);
  return {
    venues: venueRows(w, seat),
    tonight: t && sb.table ? { ...t, rounds: sb.table.rounds, listened: sb.table.listened } : null,
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
