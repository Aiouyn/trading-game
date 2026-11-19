// The arrival: a person steps off the boat in Port Avalon with 5,000 dollars and nothing else.
// No job, no contacts, no family in the city, no holdings, a rented room in the cheapest district. The books stay balanced:
// the savings come in through the ledger from outside the city, like an immigrant's.
import type { World } from '../../kernel/index.ts';
import { BANK, DEP, pay, type EconState } from '../economy/index.ts';
import { leaveJob, type People } from '../economy/people.ts';
import { homeBoard, property } from '../property/index.ts';
import { dateText, usd } from './gamedate.ts';
import { openBook } from './cashbook.ts';
import { circleOpen } from '../circle/index.ts';

function econ(w: World): EconState { return w.state.economy as EconState; }

export const ARRIVAL_ID = 'arrival';
/** The boat docks on the third Monday of the year, 14 days in, at 08:00. The exchange is open that day. */
export const ARRIVAL_DAY = 14;
export const ARRIVAL_MIN = 480;

/** What you did before the boat. It sets starting skills and knowledge and the first faces that might recognise you. Never a goal. */
export interface Past {
  id: string;
  name: string;
  line: string;
  occ: number;        // occupation row: 1 labourer, 2 trade, 3 clerk, 4 engineer
  school: number;
  skill: number;      // multiple of the city's median skill
  sector: string;     // the trade whose people might know you
  know: string;       // a course id the work taught you
  how: string;        // how a stranger from the same trade might know your face
  years: number;      // years in the trade, at most
}
export const PASTS: Past[] = [
  { id: 'dockhand', name: 'Dockhand', line: 'You hauled freight on a harbour quay. You know ships, cargo and the people who handle them. You start with calloused hands, a trade in labour and an eye for freight.', occ: 1, school: 7, skill: 0.98, sector: 'TRANSPORT', know: 'shipping', how: 'hauled freight on the same stretch of quay', years: 8 },
  { id: 'mechanic', name: 'Mechanic', line: 'You kept engines and machines running in a workshop. You can read a plant floor and you are paid like a skilled tradesperson.', occ: 2, school: 8, skill: 1.02, sector: 'MANUFACTURING', know: 'industry', how: 'served time in the same kind of workshop', years: 7 },
  { id: 'bookkeeper', name: 'Bookkeeper', line: 'You kept accounts for small firms. You can read a balance sheet, and the pay and desk work of clerks are open to you.', occ: 3, school: 10, skill: 1.05, sector: 'FINANCE', know: 'bookkeeping', how: 'kept books for firms in the same street', years: 6 },
  { id: 'salesperson', name: 'Salesperson', line: 'You sold on the shop floor and on the road. You know what people buy and how to talk to strangers.', occ: 3, school: 10, skill: 1.0, sector: 'RETAIL', know: 'management', how: 'worked a sales round in the same district', years: 6 },
  { id: 'coder', name: 'Coder', line: 'You wrote software for a living. Technical firms want you, and engineering pay is within reach.', occ: 4, school: 12, skill: 1.1, sector: 'TECHNOLOGY', know: 'software', how: 'wrote code in the same circles', years: 4 },
  { id: 'nurse', name: 'Nurse', line: 'You worked on a hospital ward. Clinics and hospitals are glad of you and you know what care really costs.', occ: 2, school: 9, skill: 1.04, sector: 'HEALTHCARE', know: 'health', how: 'worked the same wards', years: 6 },
  { id: 'student', name: 'Student', line: 'You came straight from your studies: a good schooling, no trade yet, and an open road.', occ: 0, school: 12, skill: 1.0, sector: '', know: 'markets', how: 'shared lecture halls', years: 0 },
];

/** Where you come from. It gives you what the place teaches and someone from home who may know you. */
export interface Origin { id: string; name: string; line: string; know: string; sector: string }
export const ORIGINS: Origin[] = [
  { id: 'coast', name: 'A fishing village up the coast', line: 'You grew up among boats and nets, and you know how ships and ports earn their keep.', know: 'shipping', sector: 'TRANSPORT' },
  { id: 'farm', name: 'The farm country inland', line: 'You grew up on a farm and you know what a harvest, a drought and a plant floor mean for prices.', know: 'industry', sector: 'AGRICULTURE' },
  { id: 'mill', name: 'A mill town in the hills', line: 'You grew up where one firm paid the whole town, and you know how a payroll holds a place together.', know: 'management', sector: 'MANUFACTURING' },
  { id: 'capital', name: 'The capital, a long way off', line: 'You grew up among ministries and courts, and you know where the line is drawn.', know: 'law', sector: 'FINANCE' },
  { id: 'overseas', name: 'A harbour city across the sea', line: 'You grew up in a trading city and you know how prices form and who moves them.', know: 'markets', sector: 'FINANCE' },
];
export const findPast = (id: string | undefined): Past | undefined => PASTS.find((p) => p.id === id);
export const findOrigin = (id: string | undefined): Origin | undefined => ORIGINS.find((p) => p.id === id);

export interface Recog { who: number; how: string; from: 'past' | 'origin'; day: number }
export interface Life { past: string; origin: string; day: number; hour: number; recog: Recog[] }
/** The life the player chose at the start. Absent for every other scenario. */
export function lifeOf(w: World): Life | undefined { return w.state.life as Life | undefined; }
export const ARRIVAL_CASH_DOLLARS = 5000;
export const ARRIVAL_AGE = 24;

const FAM_SYL = ['an', 'bel', 'cor', 'dan', 'el', 'far', 'gal', 'hal', 'is', 'jor', 'kel', 'lin', 'mar', 'nor', 'or', 'per'];
const FAM_END = ['sen', 'ford', 'mont', 'wick', 'by', 'ham', 'dale', 'ard', 'ell', 'stone', 'well', 'ley'];

function cap(x: string): string { return x ? x[0].toUpperCase() + x.slice(1) : x; }

/** A surname the player did not type: the same name always gets the same one. */
function surnameFor(given: string): string {
  let h = 2166136261;
  for (let k = 0; k < given.length; k++) { h ^= given.charCodeAt(k); h = Math.imul(h, 16777619); }
  h >>>= 0;
  return cap(FAM_SYL[h % FAM_SYL.length] + FAM_SYL[(h >>> 8) % FAM_SYL.length] + FAM_END[(h >>> 16) % FAM_END.length]);
}

/** Split what the person typed into a given name and a surname. The city adds both to its book. */
export function splitName(typed: string): { given: string; family: string } {
  const words = typed.replace(/[^\p{L}\p{N}' .-]/gu, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 4);
  if (!words.length) return { given: '', family: '' };
  const given = cap(words[0].slice(0, 20));
  const family = words.length > 1 ? words.slice(1).map((x) => cap(x.slice(0, 20))).join(' ') : surnameFor(given);
  return { given, family };
}

function cutParents(P: People, i: number): void {
  const par = P.parent[i];
  if (par >= 0) {
    // Take i out of the parent's list of children.
    if (P.firstKid[par] === i) P.firstKid[par] = P.nextSib[i];
    else for (let c = P.firstKid[par]; c >= 0; c = P.nextSib[c]) {
      if (P.nextSib[c] === i) { P.nextSib[c] = P.nextSib[i]; break; }
    }
    if (P.nkids[par] > 0) P.nkids[par]--;
    const other = P.spouse[par];
    if (other >= 0 && P.nkids[other] > 0) P.nkids[other]--;
  }
  P.parent[i] = -1;
  P.nextSib[i] = -1;
}

interface Soc { contact: Int32Array; kind: Uint8Array; fam: Uint16Array; trust: Uint8Array; bond: Uint8Array }
const DEG = 16;

/** Nobody in the city knows this person yet. */
function forgetEveryone(w: World, i: number): void {
  const st = w.state.social as (Soc & { contact?: Int32Array }) | undefined;
  if (!st?.contact) return;
  const wipe = (a: number, k: number): void => {
    const p = a * DEG + k;
    st.contact[p] = -1; st.fam[p] = 0; st.trust[p] = 0; st.kind[p] = 0;
    st.bond.fill(0, p * 4, p * 4 + 4);
  };
  for (let k = 0; k < DEG; k++) {
    const who = st.contact[i * DEG + k];
    if (who < 0) continue;
    for (let q = 0; q < DEG; q++) if (st.contact[who * DEG + q] === i) wipe(who, q);
    wipe(i, k);
  }
}

/** Put the player in the cheapest room in the city. The property module houses anyone who has no home. */
function takeARoom(w: World, i: number): void {
  const st = w.state.property as { live?: Int32Array | number[]; seen?: number } | undefined;
  if (!st?.live) return;
  if (i < st.live.length) st.live[i] = -1;
  st.seen = -1;
  if (w.day % 360 !== 0 || w.day === 0) property.dayClose?.(w);
}

/** Make the person who is seated an arrival. `given` and `family` are what they typed; the age is set by the caller. */
function hashOf(key: string): number {
  let h = 2166136261;
  for (let k = 0; k < key.length; k++) { h ^= key.charCodeAt(k); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mixKey(h: number, k: number): number {
  let x = Math.imul(h ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k ^ 0xc2b2ae35, 0x27d4eb2f);
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15;
  return x >>> 0;
}

/** The first faces that might know you: people from the same trade and the same part of the world. They are real people in the city. */
function pickRecog(w: World, me: number, past: Past | undefined, origin: Origin | undefined, key: string): Recog[] {
  const s = econ(w), P = s.P;
  const h = hashOf(key);
  const age = P.age(w, me);
  const out: Recog[] = [];
  const pool = (pred: (k: number) => boolean): number[] => {
    const list: number[] = [];
    for (let k = 0; k < P.n; k++) {
      if (k === me || !P.alive(k) || !P.adult(w, k) || P.age(w, k) > 60) continue;
      if (Math.abs(P.age(w, k) - age) > 14) continue;
      if (pred(k)) list.push(k);
    }
    return list.sort((a, b) => mixKey(h, a) - mixKey(h, b) || a - b);
  };
  const sectorOf = (k: number): string => (P.employer[k] >= 0 ? s.firms[P.employer[k]]?.sector ?? '' : '');
  const taken = new Set<number>();
  if (past) {
    const list = past.sector ? pool((k) => sectorOf(k) === past.sector && s.firms[P.employer[k]]?.ceo !== k) : pool((k) => P.age(w, k) <= 32);
    for (const k of list.slice(0, 2)) { out.push({ who: k, how: past.how, from: 'past', day: w.day }); taken.add(k); }
  }
  if (origin) {
    const list = pool((k) => !taken.has(k) && (P.migrant[k] === 1 || sectorOf(k) === origin.sector) && s.firms[P.employer[k]]?.ceo !== k);
    for (const k of list.slice(0, 1)) out.push({ who: k, how: `comes from ${origin.name.charAt(0).toLowerCase()}${origin.name.slice(1)}`, from: 'origin', day: w.day });
  }
  return out;
}

/** Give the life its starting skills and knowledge, and find the faces that might recognise it. */
function shapeLife(w: World, i: number, choice: { past?: string; origin?: string }, key: string): void {
  const s = econ(w), P = s.P;
  const past = findPast(choice.past), origin = findOrigin(choice.origin);
  const age = P.age(w, i);
  if (past) {
    P.school[i] = past.school;
    P.occ[i] = past.occ;
    P.occYrs[i] = past.occ > 0 ? Math.max(0, Math.min(past.years, age - 18)) : 0;
    P.skill[i] = past.skill;
    P.apt[i] = past.skill;
  }
  const seat = (w.state.player as { ids?: string[] } | undefined)?.ids?.[0] ?? '';
  const courses = w.state.courses as { know?: Record<string, Record<string, number>> } | undefined;
  if (courses && seat) {
    courses.know ??= {};
    const know = (courses.know[seat] ??= {});
    for (const id of [past?.know, origin?.know]) if (id && know[id] === undefined) know[id] = w.day;
  }
  const life: Life = { past: past?.id ?? '', origin: origin?.id ?? '', day: w.day, hour: 8, recog: pickRecog(w, i, past, origin, key) };
  w.state.life = life;
}

export function arrive(w: World, i: number, cause: number, who?: { given?: string; family?: string }, choice?: { past?: string; origin?: string }): void {
  const s = econ(w), P = s.P;
  leaveJob(s, i);
  P.spouse[i] = -1;
  cutParents(P, i);
  forgetEveryone(w, i);
  P.incEma[i] = 0;
  P.migrant[i] = 3; // no work record here yet: no benefit until a first job
  const fam = who?.family || P.families[P.family[i]];
  P.family[i] = P.families.length;
  P.families.push(fam);
  if (who?.given) setGiven(P, i, who.given);
  const id = P.id(i);
  const have = Math.floor(w.ledger.balance(id, DEP));
  const want = ARRIVAL_CASH_DOLLARS * 100;
  if (have > want && !pay(w, id, BANK, have - want, 'player.arrival', cause)) throw new Error('the savings did not clear');
  if (have < want && !pay(w, BANK, id, want - have, 'player.arrival', cause)) throw new Error('the savings did not clear');
  takeARoom(w, i);
  openBook(w, 'player.arrival', want);
  circleOpen(w);
  shapeLife(w, i, choice ?? {}, `${who?.given ?? ''} ${who?.family ?? ''} ${choice?.past ?? ''} ${choice?.origin ?? ''}`);
}

function setGiven(P: People, i: number, given: string): void {
  P.given[i] = P.addGiven(given);
}

function dollars(cents: number): string { return usd(cents); }

/** The newest paper headline from the last two weeks, as the paper and its line. */
function headlineOf(w: World): { paper: string; line: string } | undefined {
  for (const e of w.events.recent(['media.column', 'news.story'], 40).reverse()) {
    if (w.day - e.day > 14 || e.msg.startsWith('Held off')) continue;
    const m = /^([^:|]{3,40}): (.+)$/.exec(e.msg.split('||')[0]);
    if (!m) continue;
    let line = m[2].split(' — ')[0].trim();
    const cut = line.search(/[.!?](s|$)/);
    if (cut > 20) line = line.slice(0, cut);
    const colon = line.indexOf(':');
    if (colon > 15 && colon < 70) line = line.slice(0, colon);
    line = line.replace(/[.]+$/, '');
    if (line.length > 130) line = line.slice(0, 127).replace(/[ ,.;:]+$/, '') + '...';
    if (line.length >= 20) return { paper: m[1].trim(), line };
  }
  return undefined;
}

/** The first screen: a Monday morning at the quay, the room, the city already at work. Nothing about what to do. */
export function arrivalOpening(w: World, person: number, name: string, age: number): string {
  const room = homeBoard(w, person).find((r) => r.live);
  const cash = dollars(Math.floor(w.ledger.balance(econ(w).P.id(person), DEP)));
  const where = room ? `a rented room in ${room.neighbourhood}, ${dollars(room.rent)} a month` : 'a rented room';
  const life = lifeOf(w);
  const origin = findOrigin(life?.origin);
  const from = origin ? `from ${origin.name.charAt(0).toLowerCase()}${origin.name.slice(1)}` : 'across the water';
  const port = w.state.port as { name?: string; berthed?: number } | undefined;
  const berthed = typeof (port as { berthed?: unknown } | undefined)?.berthed === 'number' ? (port as { berthed: number }).berthed : 0;
  const dock = berthed ? `${berthed} ${berthed === 1 ? 'ship is' : 'ships are'} alongside already, and the cranes are working.` : 'The cranes are idle this morning.';
  const head = headlineOf(w);
  const paper = head ? ` On the news stand by the gangway, ${head.paper} says: ${head.line}.` : '';
  return `${dateText(w.day)}, 08:00. The boat ${from} docks at Port Avalon in the morning light, and the city is already at work. `
    + `${name}, ${age}, steps onto the quay with one bag and ${cash} in savings. ${dock}${paper} `
    + `Nobody here knows ${name}. There is ${where}, and a key that fits it. The exchange opens at 09:30.`;
}

/** What a person can do here, by area of life, in plain words. `topics` are the command topics the game has: help TOPIC explains each. */
export function lifeHelp(topics: string[]): string[] {
  const lines = [
    'Nothing here is required. You can do any of this, in any order, or none of it.',
    '',
    'Work: jobs shows who is hiring, apply 1 asks for a job. You can start a firm of your own with found.',
    'Money: sheet shows what you have and owe. deposit and withdraw move savings. borrow and repay handle loans.',
    'A home: homes lists places to rent or buy. move changes where you live. bid buys one.',
    'Markets: desk shows the stocks. quote, buy, sell and short trade them. Bonds, futures, options and coins are there too.',
    'People: talk to the people you have met, ask them things, court someone, marry, have children, write a will.',
    'Your life: clinic, holiday, overtime, donate. They cost money and have a cooldown.',
    'Understanding: news says what happened. why cash, or why followed by a number, says what caused it.',
  ];
  if (topics.length) lines.push('', `help followed by one of these says more: ${topics.join(', ')}.`);
  return lines;
}
