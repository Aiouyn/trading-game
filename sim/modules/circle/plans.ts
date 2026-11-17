// Dated plans for the player's circle. Made days or weeks ahead. A plan has a day,
// a place, the people who come, and something it can change. Invitations are asks
// the player answers with reply or invite. Silence on the day is a no. Three misses
// and that person stops inviting. Other lives go on either way.
import { type World } from '../../kernel/index.ts';
import { DEP, GOV, pay, type EconState, type Firm } from '../economy/index.ts';
import { ALIVE, PRISON, RETIRED, joinFirm, setSimDay } from '../economy/people.ts';
import { GOODS } from '../economy/content.ts';
import { bidHome, homeBoard, parcelView } from '../property/index.ts';
import { contactsOf, nudgeLink, quietFact } from '../social/index.ts';
import { chooseShape, money, renderLetter, type Voice } from '../social/words.ts';

const SKIP_STOP = 3;
const INVITE_KINDS = ['dinner', 'drinks', 'deal', 'birthday', 'leaving'];
const LIFE_KINDS = ['wedding', 'fallout', 'move', 'interview', 'funeral', 'birthday', 'dinner', 'drinks'];

interface Why { day: number; delta: number; text: string; eventId: number }
interface Note { day: number; text: string; eventId: number }
interface Bond {
  who: number;
  role: string;
  stance: string;
  score: number;
  touched: number;
  skips?: number;
  why: Why[];
  together: Note[];
}
interface Letter {
  id: number;
  day: number;
  from: number;
  role: string;
  kind: string;
  text: string;
  eventId: number;
  source: number;
  req: number;
}
interface Ask {
  id: number;
  msg: number;
  from: number;
  kind: string;
  day: number;
  status: string;
  cents: number;
  other: number;
  due: number;
  owed: number;
  eventId: number;
  place: string;
  factId: number;
  note: string;
  planId?: number;
  socId?: number;
}
export interface LifePlan {
  id: number;
  kind: string;
  day: number;
  place: string;
  who: number[];
  host: number;
  title: string;
  invite: number;
  ask: number;
  status: string;
  cents: number;
  pay: string;
  change: string;
  eventId: number;
  made: number;
  parcel: number;
  firm: number;
  other: number;
  /** What the host pays the city when they say they'll get this one. */
  cover?: number;
}
interface SocDate {
  id: number;
  day: number;
  kind: string;
  place: string;
  who: number[];
  title: string;
  invite: number;
  ask: number;
  status: string;
  cents: number;
  eventId: number;
  host: number;
}
interface Box {
  next: number;
  letters: Letter[];
  asks: Ask[];
  bonds: Bond[];
  plans: LifePlan[];
  sent: string[];
  yMsg: number;
  yReq: number;
  yPlans: number;
  cast: number;
}

const econ = (w: World): EconState => w.state.economy as EconState;
function box(w: World): Box | undefined {
  const st = w.state.circle as Box | undefined;
  if (!st?.bonds) return;
  if (!st.plans) st.plans = [];
  if (st.yPlans === undefined) st.yPlans = 0;
  return st;
}
function mix(a: number, b: number, c: number): number {
  let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f) ^ Math.imul(c, 0x165667b1);
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  return x >>> 0;
}
function playerOf(w: World): number {
  const st = w.state.player as { who?: number; ids?: string[]; seat?: Record<string, { who?: number }> } | undefined;
  const P = econ(w).P;
  const key = st?.ids?.[0];
  const who = (key && st?.seat?.[key]?.who) ?? st?.who ?? -1;
  if (typeof who !== 'number' || who < 0 || who >= P.n) return -1;
  if ((P.flags[who] & ALIVE) === 0) return -1;
  return who;
}
function alive(w: World, i: number): boolean {
  const P = econ(w).P;
  return i >= 0 && i < P.n && (P.flags[i] & ALIVE) !== 0 && (P.flags[i] & PRISON) === 0;
}
function adult(w: World, i: number): boolean {
  const P = econ(w).P;
  return alive(w, i) && (P.flags[i] & RETIRED) === 0 && P.age(w, i) >= 18;
}
function bondOf(st: Box, who: number): Bond | undefined {
  for (const b of st.bonds) if (b.who === who) return b;
  return undefined;
}
function willInvite(b: Bond): boolean { return (b.skips ?? 0) < SKIP_STOP; }
function root(w: World): number { return w.events.last('player.arrive') ?? econ(w).macroEv ?? w.genesis; }
function usd(cents: number): string { return money(cents); }
function mark(st: Box, key: string): void {
  if (st.sent.includes(key)) return;
  st.sent.push(key);
  if (st.sent.length > 3000) st.sent.splice(0, st.sent.length - 2200);
}
function seen(st: Box, key: string): boolean { return st.sent.includes(key); }
function neighbourhood(w: World, person: number): string {
  const live = (w.state.property as { live?: Int32Array } | undefined)?.live;
  if (!live || person < 0 || person >= live.length) return '';
  const p = live[person];
  if (p < 0) return '';
  return parcelView(w, p)?.neighbourhood ?? '';
}
function firmName(w: World, idx: number): string {
  const f = econ(w).firms[idx];
  return f?.name ?? 'a firm';
}
function firmCalled(w: World, id: string): string {
  const bare = id.startsWith('eq:') ? id.slice(3) : id;
  for (const f of econ(w).firms) if (f.id === bare || f.id === id) return f.name;
  return '';
}
function plain(w: World, msg: string): string {
  return msg
    .replace(/\beq:[A-Za-z0-9_]+/g, (s) => firmCalled(w, s) || 'those shares')
    .replace(/\bfrm_[a-z0-9_]+/g, (s) => firmCalled(w, s) || 'the firm')
    .replace(/\bp_\d+\b/g, 'someone')
    .replace(/\bbank_1\b/g, 'the bank');
}
function names(w: World, ids: number[], n: number): string {
  const P = econ(w).P;
  const list: string[] = [];
  for (const i of ids) {
    if (list.length >= n || i < 0 || i >= P.n) continue;
    list.push(P.name(i));
  }
  if (!list.length) return 'friends';
  if (list.length === 1) return list[0];
  return list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
}
function voiceOf(w: World, who: number, role: string): Voice {
  if (role === 'rival') return 'cold';
  const P = econ(w).P;
  if (who < 0 || who >= P.n) return 'blunt';
  if (P.anxiety[who] >= 67) return 'anxious';
  if (P.diligence[who] >= 72) return 'formal';
  if (P.kin[who] >= 67) return 'warm';
  return 'blunt';
}
function say(w: World, who: number, role: string, fact: string, you: string, mine: string): string {
  const voice = voiceOf(w, who, role);
  return renderLetter({
    voice, shape: chooseShape(voice, 'invite', who + w.day + fact.length, ''),
    fact, you, mine, since: '', casual: role === 'friend', worry: role === 'family',
    salt: who * 17 + w.day * 3 + fact.length, ticOk: false,
  });
}
function wage(w: World): number { return Math.max(1, Math.round(econ(w).wage)); }
function cashOf(w: World, person: number): number {
  const P = econ(w).P;
  if (person < 0 || person >= P.n) return 0;
  return Math.floor(w.ledger.balance(P.id(person), DEP));
}
/** A serving, from the cheapest open firm that sells the good. The opening price if none is open. */
function serving(w: World, good: string): number {
  let best = 0;
  for (const f of econ(w).firms) {
    if (!f || f.closed || f.good !== good || f.price < 1) continue;
    if (best < 1 || f.price < best) best = f.price;
  }
  if (best >= 1) return Math.max(100, Math.round(best));
  const gd = GOODS[good];
  if (!gd || gd.prod < 1) return Math.max(100, wage(w));
  return Math.max(100, Math.round(wage(w) / gd.prod * 1.2));
}
type Dish = 'pint' | 'meal' | 'table' | 'club' | 'ticket';
function dishPrice(w: World, dish: Dish): number {
  const pint = serving(w, 'TRANSIT');
  const food = serving(w, 'GROCERIES');
  const night = serving(w, 'ENTERTAINMENT');
  if (dish === 'pint') return pint;
  if (dish === 'meal') return food;
  if (dish === 'table') return Math.max(100, food + night);
  if (dish === 'club') return Math.max(100, night * 3);
  return Math.max(wage(w) * 10, food * 8);
}
/** What a player-asked night costs. A pint is a pint. A gala ticket is dear. */
export function circleBill(w: World, place: string): number {
  const raw = place.trim().toLowerCase();
  if (raw === 'gala') return dishPrice(w, 'ticket');
  if (raw === 'club') return dishPrice(w, 'club');
  if (raw === 'festival' || raw === 'party') return dishPrice(w, 'table');
  if (raw === 'drinks' || raw === 'leaving') return dishPrice(w, 'pint');
  return dishPrice(w, 'meal');
}
function hostTier(w: World, who: number): number {
  const days = cashOf(w, who) / wage(w);
  if (days >= 80) return 2;
  if (days >= 20) return 1;
  return 0;
}
function canPay(w: World, person: number, price: number): boolean {
  return cashOf(w, person) >= price + wage(w) * 3;
}
function canTreat(w: World, host: number, price: number): boolean {
  return alive(w, host) && cashOf(w, host) >= price + wage(w) * 15;
}
function closeRole(role: string): boolean {
  return role === 'friend' || role === 'family' || role === 'mentor';
}
interface Venue { name: string; dish: Dish; tier: number }
interface Quote { place: string; head: string; cents: number; cover: number; pay: string }
const DRINK_ROOMS: Venue[] = [
  { name: 'the office tap', dish: 'pint', tier: 0 },
  { name: 'the late bar', dish: 'meal', tier: 1 },
  { name: 'a club on the quay', dish: 'club', tier: 2 },
];
const LEAVING_ROOMS: Venue[] = [
  { name: 'the office tap', dish: 'pint', tier: 0 },
  { name: 'a bar near the firm', dish: 'pint', tier: 0 },
  { name: 'a club on the quay', dish: 'club', tier: 2 },
];
const DINNER_ROOMS: Venue[] = [
  { name: 'a corner table', dish: 'meal', tier: 0 },
  { name: 'the harbour bar', dish: 'table', tier: 1 },
  { name: 'the dining room', dish: 'club', tier: 2 },
];
const DEAL_ROOMS: Venue[] = [
  { name: 'a quiet table', dish: 'meal', tier: 0 },
  { name: 'the bank lobby', dish: 'meal', tier: 1 },
  { name: 'a back room', dish: 'table', tier: 2 },
];
const BIRTH_ROOMS: Venue[] = [
  { name: 'a corner table', dish: 'meal', tier: 0 },
  { name: 'the dining room', dish: 'table', tier: 2 },
];
const WED_ROOMS: Venue[] = [
  { name: 'the registry', dish: 'meal', tier: 0 },
  { name: 'a room above the quay', dish: 'table', tier: 1 },
];
function roomRows(w: World, rooms: Venue[]): { v: Venue; cents: number }[] {
  return rooms.map((v) => ({ v, cents: dishPrice(w, v.dish) }));
}
function roomAt(rows: { v: Venue; cents: number }[], tier: number, salt: number): { v: Venue; cents: number } {
  let best = -1;
  for (const row of rows) if (row.v.tier <= tier && row.v.tier > best) best = row.v.tier;
  const at = rows.filter((row) => row.v.tier === (best < 0 ? 0 : best));
  return at[salt % at.length] ?? rows[0];
}
function whereOf(name: string, nb: string): string {
  return nb ? `${name} in ${nb}` : name;
}
/** The dearest room this host would pick, stepped down until the player can pay, or a treat. */
function priceOf(w: World, me: number, host: number, role: string, rooms: Venue[], nb: string, salt: number, payTo: string): Quote | undefined {
  const rows = roomRows(w, rooms);
  if (!rows.length) return;
  const preferred = roomAt(rows, hostTier(w, host), salt);
  const cheaper = rows.filter((row) => row.cents < preferred.cents).sort((a, b) => b.cents - a.cents);
  for (const row of [preferred, ...cheaper]) {
    if (!canPay(w, me, row.cents)) continue;
    return { place: whereOf(row.v.name, nb), head: row.v.name, cents: row.cents, cover: 0, pay: payTo };
  }
  if (closeRole(role)) {
    for (const row of [preferred, ...cheaper]) {
      if (!canTreat(w, host, row.cents)) continue;
      return { place: whereOf(row.v.name, nb), head: row.v.name, cents: 0, cover: row.cents, pay: 'treat' };
    }
  }
  return;
}
function roomName(w: World, host: number, rooms: Venue[], nb: string, salt: number): { head: string; place: string } {
  const row = roomAt(roomRows(w, rooms), hostTier(w, host), salt);
  return { head: row.v.name, place: whereOf(row.v.name, nb) };
}
function dress(head: string, rest: string, invite: number, treat: boolean): string {
  const bits = [head.endsWith('.') ? head : `${head}.`];
  if (rest) bits.push(rest.endsWith('.') ? rest : `${rest}.`);
  if (invite) bits.push('You are invited.');
  if (treat) bits.push("I'll get this one.");
  return bits.join(' ');
}

function postLetter(w: World, st: Box, from: number, role: string, kind: string, text: string, cause: number): Letter {
  const P = econ(w).P;
  const ev = w.events.emit('circle.letter', text, [cause >= 0 ? cause : root(w)], from >= 0 && from < P.n ? P.id(from) : undefined);
  const letter: Letter = { id: st.next++, day: w.day, from, role, kind, text, eventId: ev, source: cause >= 0 ? cause : ev, req: -1 };
  st.letters.push(letter);
  while (st.letters.length > 480) {
    const old = st.letters[0];
    if (st.asks.some((a) => a.msg === old.id && a.status === 'pending')) break;
    st.letters.shift();
  }
  st.yMsg++;
  const b = bondOf(st, from);
  if (b) b.touched = w.day;
  return letter;
}
function askInvite(w: World, st: Box, from: number, role: string, text: string, cause: number, place: string, cents: number, due: number, planId: number, socId: number): Ask {
  const letter = postLetter(w, st, from, role, 'invite', text, cause);
  const row: Ask = {
    id: st.next++, msg: letter.id, from, kind: 'invite', day: w.day, status: 'pending', cents, other: -1,
    due, owed: 0, eventId: letter.eventId, place, factId: -1, note: '', planId, socId,
  };
  letter.req = row.id;
  st.asks.push(row);
  st.yReq++;
  return row;
}

function touch(w: World, st: Box, me: number, who: number, delta: number, text: string, eventId: number): void {
  const b = bondOf(st, who);
  if (b) {
    b.score = Math.max(0, Math.min(100, b.score + delta));
    b.touched = w.day;
    if (b.why[b.why.length - 1]?.text !== text) {
      b.why.push({ day: w.day, delta, text, eventId });
      if (b.why.length > 6) b.why.splice(0, b.why.length - 6);
    }
  }
  if (me >= 0 && who >= 0) nudgeLink(w, me, who, delta);
}
function snub(b: Bond | undefined): void {
  if (!b) return;
  b.skips = (b.skips ?? 0) + 1;
}
function forgive(b: Bond | undefined): void {
  if (!b || !b.skips) return;
  b.skips = Math.max(0, b.skips - 1);
}
function closeAsk(st: Box, id: number, status: string): void {
  if (id < 0) return;
  for (const a of st.asks) if (a.id === id && a.status === 'pending') a.status = status;
}
function playerPay(w: World, me: number, to: string, cents: number, cause: number): boolean {
  const n = Math.round(cents);
  if (n < 1) return true;
  const id = econ(w).P.id(me);
  if (id === to) return true;
  if (Math.floor(w.ledger.balance(id, DEP)) < n) return false;
  return pay(w, id, to, n, 'circle.pay', cause);
}
function sparePay(w: World, person: number, to: string, cents: number, cause: number): boolean {
  const P = econ(w).P;
  if (!alive(w, person)) return false;
  const n = Math.round(cents);
  if (n < 1) return false;
  const id = P.id(person);
  if (id === to) return false;
  const cash = Math.floor(w.ledger.balance(id, DEP));
  if (cash < n + wage(w) * 15) return false;
  return pay(w, id, to, n, 'circle.pay', cause);
}
function hear(w: World, from: number, fact: { id: number; eventId: number }): void {
  const pst = w.state.player as { ids?: string[]; seat?: Record<string, { heard?: { factId: number; eventId: number; from: number; day: number }[] }> } | undefined;
  const key = pst?.ids?.[0];
  const seat = key ? pst?.seat?.[key] : undefined;
  if (!seat) return;
  if (!seat.heard) seat.heard = [];
  if (seat.heard.some((h) => h.factId === fact.id)) return;
  seat.heard.push({ factId: fact.id, eventId: fact.eventId, from, day: w.day });
}

function bandOf(w: World, st: Box, me: number): number {
  const kin = me >= 0 && me < econ(w).P.n ? econ(w).P.kin[me] : 0;
  let close = 0;
  for (const b of st.bonds) {
    if (!alive(w, b.who)) continue;
    if ((b.role === 'friend' || b.role === 'family' || b.role === 'mentor') && b.score >= 40) close++;
  }
  if (kin >= 62 || close >= 5) return 2;
  if (kin <= 22 && close <= 1) return 0;
  return 1;
}
function quota(band: number): { life: number; invite: number } {
  if (band >= 2) return { life: 4, invite: 3 };
  if (band <= 0) return { life: 1, invite: 1 };
  return { life: 2, invite: 2 };
}
function inWindow(p: LifePlan, day: number): boolean {
  return p.status !== 'gone' && p.day >= day && p.day < day + 30;
}
function have(st: Box, day: number): { life: number; invite: number } {
  let life = 0, invite = 0;
  for (const p of st.plans) {
    if (!inWindow(p, day)) continue;
    if (p.invite) invite++;
    else life++;
  }
  return { life, invite };
}
function busy(st: Box, day: number): boolean {
  for (const p of st.plans) if (p.day === day && p.status !== 'gone') return true;
  return false;
}
function freeDay(st: Box, day: number): number {
  let d = day;
  for (let i = 0; i < 6; i++) {
    if (!busy(st, d)) return d;
    d++;
  }
  return -1;
}
function soon(st: Box, kind: string, day: number, within: number): boolean {
  for (const p of st.plans) {
    if (p.kind !== kind || p.status === 'gone') continue;
    if (p.day >= day - 2 && p.made >= day - within) return true;
  }
  return false;
}
function jobSoon(st: Box, day: number): boolean {
  for (const p of st.plans) {
    if (p.status === 'gone') continue;
    if (p.kind !== 'leaving' && p.kind !== 'interview') continue;
    if (p.day >= day - 40) return true;
  }
  return false;
}
function pool(w: World, st: Box, me: number, pred: (b: Bond) => boolean): Bond[] {
  const out: Bond[] = [];
  for (const b of st.bonds) {
    if (!adult(w, b.who) || b.who === me) continue;
    if (pred(b)) out.push(b);
  }
  out.sort((a, b) => a.who - b.who);
  return out;
}
function pickFrom(list: Bond[], salt: number): Bond | undefined {
  if (!list.length) return;
  return list[salt % list.length];
}
const GAPS = ['friend', 'family', 'work', 'city'];
function recentFaces(st: Box, day: number): Set<number> {
  const seenIds = new Set<number>();
  for (const p of st.plans) {
    if (p.status === 'gone') continue;
    if (p.kind !== 'dinner' && p.kind !== 'drinks' && p.kind !== 'leaving' && p.kind !== 'birthday') continue;
    if (p.day < day - 21 || p.day > day + 21) continue;
    seenIds.add(p.host);
    for (const id of p.who) seenIds.add(id);
  }
  return seenIds;
}
function fitsBias(role: string, bias: string): boolean {
  if (bias === 'friend') return role === 'friend' || role === 'mentor';
  if (bias === 'family') return role === 'family';
  if (bias === 'work') return role === 'colleague' || role === 'mentor';
  if (bias === 'city') return role === 'friend' || role === 'colleague' || role === 'mentor' || role === 'family';
  return true;
}
function outsiderOf(w: World, st: Box, me: number, host: number, salt: number): number {
  const known = new Set<number>();
  for (const b of st.bonds) known.add(b.who);
  known.add(me);
  known.add(host);
  const out: number[] = [];
  for (const c of contactsOf(w, host)) {
    if (c.who === me || c.who === host || known.has(c.who) || !adult(w, c.who)) continue;
    out.push(c.who);
  }
  out.sort((a, b) => a - b);
  if (!out.length) return -1;
  return out[salt % out.length];
}
function pickHost(w: World, st: Box, me: number, hosts: Bond[], salt: number, bias: string): Bond | undefined {
  const list = bias ? hosts.filter((b) => fitsBias(b.role, bias)) : hosts;
  if (!list.length) return;
  const recent = recentFaces(st, w.day);
  const fresh = list.filter((b) => !recent.has(b.who));
  const pool = fresh.length ? fresh : list;
  const city = bias === 'city' ? pool.filter((b) => outsiderOf(w, st, me, b.who, salt) >= 0) : [];
  if (bias === 'city') {
    if (!city.length) return;
    return city[salt % city.length];
  }
  return pool[salt % pool.length];
}
function party(w: World, st: Box, me: number, host: number, salt: number, bias: string): number[] {
  if (bias === 'city') {
    const guest = outsiderOf(w, st, me, host, salt);
    if (guest < 0) return [];
    return [host, guest];
  }
  const recent = recentFaces(st, w.day);
  const bonds = st.bonds.filter((b) => adult(w, b.who) && b.who !== me && b.who !== host);
  const ranked = bonds.slice().sort((a, b) => {
    const ar = recent.has(a.who) ? 1 : 0;
    const br = recent.has(b.who) ? 1 : 0;
    if (ar !== br) return ar - br;
    const aw = fitsBias(a.role, bias) ? 0 : 1;
    const bw = fitsBias(b.role, bias) ? 0 : 1;
    if (aw !== bw) return aw - bw;
    return a.who - b.who;
  });
  const out = [host];
  const start = ranked.length ? salt % ranked.length : 0;
  for (let i = 0; i < ranked.length && out.length < 3; i++) {
    const b = ranked[(start + i) % ranked.length];
    if (out.indexOf(b.who) >= 0) continue;
    out.push(b.who);
  }
  return out;
}
function openFirm(w: World, salt: number, not: number): Firm | undefined {
  const firms = econ(w).firms;
  if (!firms.length) return;
  for (let i = 0; i < firms.length; i++) {
    const f = firms[(salt + i) % firms.length];
    if (!f || f.closed || f.idx === not || f.workers < 1) continue;
    return f;
  }
  return;
}
function closeKin(w: World, a: number, b: number): boolean {
  if (a < 0 || b < 0 || a === b) return true;
  const P = econ(w).P;
  if (a >= P.n || b >= P.n) return true;
  if (P.spouse[a] === b || P.parent[a] === b || P.parent[b] === a) return true;
  const pa = P.parent[a], pb = P.parent[b];
  if (pa >= 0 && pa === pb) return true;
  if (P.family[a] === P.family[b]) return true;
  return false;
}

function pushPlan(w: World, st: Box, spec: Omit<LifePlan, 'id' | 'ask' | 'status' | 'eventId' | 'made'> & { cause: number; inviteFrom?: number }): LifePlan | undefined {
  const day = freeDay(st, spec.day);
  if (day < 0 || day <= w.day) return;
  const P = econ(w).P;
  const host = spec.host;
  const cause = spec.cause >= 0 ? spec.cause : root(w);
  const plan: LifePlan = {
    id: st.next++, kind: spec.kind, day, place: spec.place, who: spec.who, host,
    title: spec.title, invite: spec.invite, ask: -1, status: 'set', cents: spec.cents, pay: spec.pay,
    change: spec.change, eventId: cause, made: w.day, parcel: spec.parcel, firm: spec.firm, other: spec.other,
    cover: spec.cover,
  };
  if (spec.invite && alive(w, host)) {
    const role = bondOf(st, host)?.role ?? 'colleague';
    const due = day;
    const clock = `Say yes or no by day ${due}. If I hear nothing, I'll take it as a no.`;
    const cost = plan.pay === 'treat' ? `I'll get this one. ${clock}` : plan.cents > 0 ? `You pay ${usd(plan.cents)}. ${clock}` : clock;
    const fact = plan.title.replace(/\s*You are invited\.?/g, '').replace(/\s*I'll get this one\.?/g, '').trim();
    const text = say(w, host, role, fact, cost, `I'll be there either way.`, );
    const row = askInvite(w, st, host, role, text, cause, plan.kind, plan.cents, due, plan.id, -1);
    plan.ask = row.id;
    plan.eventId = row.eventId;
  } else {
    const actor = alive(w, host) ? P.id(host) : undefined;
    plan.eventId = w.events.emit('circle.plan', plan.title, [cause], actor);
  }
  st.plans.push(plan);
  return plan;
}

function tryDinner(w: World, st: Box, me: number, drinks: boolean, asInvite: boolean, bias: string): boolean {
  const kind = drinks ? 'drinks' : 'dinner';
  const hosts = pool(w, st, me, (b) => (!asInvite || willInvite(b)) && b.role !== 'rival' && (drinks || b.role === 'friend' || b.role === 'family' || b.role === 'mentor' || b.role === 'colleague'));
  const salt = mix(w.day, drinks ? 2 : 1, me);
  const host = pickHost(w, st, me, hosts, salt, bias);
  if (!host) return false;
  const who = party(w, st, me, host.who, mix(w.day, host.who, 3), bias);
  if (bias === 'city' && who.length < 2) return false;
  const nb = neighbourhood(w, host.who) || neighbourhood(w, me);
  const role = host.role;
  const q = asInvite ? priceOf(w, me, host.who, role, drinks ? DRINK_ROOMS : DINNER_ROOMS, nb, salt, 'host') : undefined;
  if (asInvite && !q) return false;
  const room = q ?? roomName(w, host.who, drinks ? DRINK_ROOMS : DINNER_ROOMS, nb, salt);
  const head = drinks ? `Drinks at ${room.head}` : `Dinner at ${room.head}`;
  const title = dress(head, `With ${names(w, who, 3)}`, q ? 1 : 0, q?.pay === 'treat');
  return !!pushPlan(w, st, {
    kind, day: w.day + 8 + (mix(w.day, host.who, 4) % 14), place: room.place, who, host: host.who, title,
    invite: q ? 1 : 0, cents: q?.cents ?? 0, pay: q?.pay ?? '', cover: q?.cover, change: 'warm', parcel: -1, firm: -1, other: who.find((i) => i !== host.who) ?? -1,
    cause: host.why[host.why.length - 1]?.eventId ?? root(w),
  });
}
function tryDeal(w: World, st: Box, me: number): boolean {
  const hosts = pool(w, st, me, (b) => willInvite(b) && b.role !== 'rival' && (b.stance === 'banker' || b.role === 'colleague' || b.role === 'friend'));
  const salt = mix(w.day, 5, me);
  const host = pickHost(w, st, me, hosts, salt, 'work');
  if (!host) return false;
  const nb = neighbourhood(w, host.who) || 'the city';
  const q = priceOf(w, me, host.who, host.role, DEAL_ROOMS, nb, salt, 'host');
  if (!q) return false;
  const P = econ(w).P;
  const title = dress(`A deal at ${q.head}`, `${P.name(host.who)} wants to talk`, 1, q.pay === 'treat');
  return !!pushPlan(w, st, {
    kind: 'deal', day: w.day + 7 + (mix(w.day, host.who, 6) % 12), place: q.place, who: [host.who], host: host.who, title,
    invite: 1, cents: q.cents, pay: q.pay, cover: q.cover, change: 'deal', parcel: -1, firm: employer(w, host.who), other: -1,
    cause: host.why[host.why.length - 1]?.eventId ?? root(w),
  });
}
function employer(w: World, i: number): number {
  const P = econ(w).P;
  return i >= 0 && i < P.n ? P.employer[i] : -1;
}
function tryBirthday(w: World, st: Box, me: number, asInvite: boolean): boolean {
  const P = econ(w).P;
  const doy = ((w.day % 360) + 360) % 360;
  let best: Bond | undefined;
  let ahead = 0;
  for (const b of st.bonds) {
    if (!adult(w, b.who) || b.who === me) continue;
    if (asInvite && !willInvite(b)) continue;
    const born = ((P.born[b.who] % 360) + 360) % 360;
    let gap = born - doy;
    if (gap < 0) gap += 360;
    if (gap < 8 || gap > 21) continue;
    const year = Math.floor((w.day + gap) / 360);
    if (seen(st, `bday:${b.who}:${year}`)) continue;
    if (!best || gap < ahead || (gap === ahead && b.who < best.who)) { best = b; ahead = gap; }
  }
  if (!best) return false;
  const year = Math.floor((w.day + ahead) / 360);
  mark(st, `bday:${best.who}:${year}`);
  mark(st, `bday:${best.who}:${Math.floor(w.day / 360)}`);
  const nb = neighbourhood(w, best.who) || neighbourhood(w, me);
  const salt = mix(w.day, best.who, 19);
  const q = asInvite && willInvite(best) ? priceOf(w, me, best.who, best.role, BIRTH_ROOMS, nb, salt, 'host') : undefined;
  const room = q ?? roomName(w, best.who, BIRTH_ROOMS, nb, salt);
  const title = dress(`${P.name(best.who)} turns ${P.age(w, best.who) + 1}`, `At ${room.head}`, q ? 1 : 0, q?.pay === 'treat');
  return !!pushPlan(w, st, {
    kind: 'birthday', day: w.day + ahead, place: room.place, who: [best.who], host: best.who, title,
    invite: q ? 1 : 0, cents: q?.cents ?? 0, pay: q?.pay ?? '', cover: q?.cover, change: 'warm', parcel: -1, firm: -1, other: -1,
    cause: best.why[best.why.length - 1]?.eventId ?? root(w),
  });
}
function tryLeaving(w: World, st: Box, me: number, asInvite: boolean): boolean {
  if (jobSoon(st, w.day)) return false;
  const P = econ(w).P;
  const hosts = pool(w, st, me, (b) => {
    const e = employer(w, b.who);
    if (e < 0) return false;
    const f = econ(w).firms[e];
    if (!f || f.closed || f.ceo === b.who || f.staff.length < 5) return false;
    if (asInvite && !willInvite(b)) return false;
    return b.role === 'colleague' || b.role === 'friend' || b.stance === 'ally';
  });
  const salt = mix(w.day, 7, me);
  const host = pickHost(w, st, me, hosts, salt, 'work') ?? pickFrom(hosts, salt);
  if (!host) return false;
  const from = employer(w, host.who);
  const dest = openFirm(w, host.who + w.day, from);
  if (!dest) return false;
  const nb = neighbourhood(w, host.who);
  const q = asInvite && willInvite(host) ? priceOf(w, me, host.who, host.role, LEAVING_ROOMS, nb, salt, 'host') : undefined;
  const room = q ?? roomName(w, host.who, LEAVING_ROOMS, nb, salt);
  const who = party(w, st, me, host.who, mix(w.day, host.who, 8), 'work');
  const title = dress(`Leaving drinks at ${room.head}`, `${P.name(host.who)} is leaving ${firmName(w, from)} for ${dest.name}`, q ? 1 : 0, q?.pay === 'treat');
  return !!pushPlan(w, st, {
    kind: 'leaving', day: w.day + 10 + (mix(w.day, host.who, 8) % 10), place: room.place, who,
    host: host.who, title, invite: q ? 1 : 0, cents: q?.cents ?? 0, pay: q?.pay ?? '', cover: q?.cover, change: 'job',
    parcel: -1, firm: dest.idx, other: from, cause: host.why[host.why.length - 1]?.eventId ?? root(w),
  });
}
function tryInterview(w: World, st: Box, me: number, asInvite: boolean): boolean {
  if (jobSoon(st, w.day)) return false;
  const P = econ(w).P;
  const hosts = pool(w, st, me, (b) => employer(w, b.who) < 0 && P.jobless[b.who] >= 7 && (b.role === 'friend' || b.role === 'family' || b.role === 'colleague'));
  const host = pickFrom(hosts, mix(w.day, 9, me));
  if (!host) return false;
  const dest = openFirm(w, host.who + w.day * 3, -1);
  if (!dest) return false;
  const invite = asInvite && willInvite(host) ? 1 : 0;
  const place = `the lobby at ${dest.name}`;
  const title = dress(`A job interview at ${dest.name}`, `${P.name(host.who)} is interviewing`, invite, false);
  return !!pushPlan(w, st, {
    kind: 'interview', day: w.day + 8 + (mix(w.day, host.who, 10) % 10), place, who: [host.who], host: host.who, title,
    invite, cents: 0, pay: '', change: 'job', parcel: -1, firm: dest.idx, other: -1,
    cause: P.lastEv[host.who] >= 0 ? P.lastEv[host.who] : root(w),
  });
}
function tryWedding(w: World, st: Box, me: number, asInvite: boolean): boolean {
  if (soon(st, 'wedding', w.day, 160)) return false;
  const P = econ(w).P;
  const singles = pool(w, st, me, (b) => P.spouse[b.who] < 0 && P.age(w, b.who) >= 22 && P.age(w, b.who) <= 48);
  if (singles.length < 2) return false;
  const a = singles[mix(w.day, 11, me) % singles.length];
  let b: Bond | undefined;
  for (const o of singles) {
    if (o.who === a.who || closeKin(w, a.who, o.who)) continue;
    b = o;
    break;
  }
  if (!b) return false;
  const host = willInvite(a) ? a : b;
  const nb = neighbourhood(w, a.who) || neighbourhood(w, me);
  const salt = mix(w.day, a.who, 12);
  const q = asInvite && (willInvite(a) || willInvite(b)) ? priceOf(w, me, host.who, host.role, WED_ROOMS, nb, salt, 'host') : undefined;
  const room = q ?? roomName(w, host.who, WED_ROOMS, nb, salt);
  const title = dress(`A wedding at ${room.head}`, `${P.name(a.who)} and ${P.name(b.who)} marry`, q ? 1 : 0, q?.pay === 'treat');
  return !!pushPlan(w, st, {
    kind: 'wedding', day: w.day + 14 + (mix(w.day, a.who, 12) % 12), place: room.place, who: [a.who, b.who], host: host.who, title,
    invite: q ? 1 : 0, cents: q?.cents ?? 0, pay: q?.pay ?? '', cover: q?.cover, change: 'life', parcel: -1, firm: -1, other: a.who === host.who ? b.who : a.who,
    cause: root(w),
  });
}
function tryFallout(w: World, st: Box, me: number): boolean {
  if (soon(st, 'fallout', w.day, 50)) return false;
  const P = econ(w).P;
  const people = pool(w, st, me, () => true);
  if (people.length < 2) return false;
  const a = people[mix(w.day, 13, me) % people.length];
  let b: Bond | undefined;
  for (const o of people) if (o.who !== a.who) { b = o; break; }
  if (!b) return false;
  const place = neighbourhood(w, a.who) || 'the city';
  const title = dress('A falling out', `${P.name(a.who)} and ${P.name(b.who)} fall out in ${place}`, 0, false);
  return !!pushPlan(w, st, {
    kind: 'fallout', day: w.day + 9 + (mix(w.day, a.who, 14) % 12), place, who: [a.who, b.who], host: a.who, title,
    invite: 0, cents: 0, pay: '', change: 'life', parcel: -1, firm: -1, other: b.who, cause: root(w),
  });
}
function tryMove(w: World, st: Box, me: number, asInvite: boolean): boolean {
  if (soon(st, 'move', w.day, 110)) return false;
  if (seen(st, `move-miss:${Math.floor(w.day / 30)}`)) return false;
  const people = pool(w, st, me, (b) => b.role === 'friend' || b.role === 'family' || b.role === 'colleague');
  const host = pickFrom(people, mix(w.day, 15, me));
  if (!host) return false;
  const homes = homeBoard(w, host.who);
  let parcel = -1;
  let nb = '';
  for (const h of homes) {
    if (h.mine || h.live || !h.vacant) continue;
    parcel = h.id;
    nb = h.neighbourhood;
    break;
  }
  if (parcel < 0) { mark(st, `move-miss:${Math.floor(w.day / 30)}`); return false; }
  const P = econ(w).P;
  const place = nb ? `a house in ${nb}` : 'a new house';
  const salt = mix(w.day, host.who, 16);
  const q = asInvite && willInvite(host) ? priceOf(w, me, host.who, host.role, [{ name: 'the new house', dish: 'meal', tier: 0 }], nb, salt, 'host') : undefined;
  const title = dress('A housewarming', `${P.name(host.who)} is moving to ${place}`, q ? 1 : 0, q?.pay === 'treat');
  return !!pushPlan(w, st, {
    kind: 'move', day: w.day + 12 + (mix(w.day, host.who, 16) % 10), place, who: [host.who], host: host.who, title,
    invite: q ? 1 : 0, cents: q?.cents ?? 0, pay: q?.pay ?? '', cover: q?.cover, change: 'life', parcel, firm: -1, other: -1,
    cause: host.why[host.why.length - 1]?.eventId ?? root(w),
  });
}
function tryFuneral(w: World, st: Box, me: number): boolean {
  const P = econ(w).P;
  for (const dead of st.bonds) {
    if (dead.who === me || dead.who < 0 || dead.who >= P.n || P.alive(dead.who)) continue;
    if (seen(st, `funeral:${dead.who}`)) continue;
    if (st.plans.some((p) => p.kind === 'funeral' && p.who[0] === dead.who && p.status !== 'gone')) continue;
    const last = P.lastEv[dead.who];
    const ev = last >= 0 ? w.events.get(last) : undefined;
    if (!ev || ev.kind !== 'person.died' || w.day - ev.day > 12) continue;
    let writer: Bond | undefined;
    for (const o of st.bonds) {
      if (!alive(w, o.who) || o.who === me) continue;
      if (!writer || o.score > writer.score) writer = o;
    }
    if (!writer) continue;
    const nb = neighbourhood(w, writer.who) || 'the city';
    const salt = mix(w.day, dead.who, 17);
    const rooms: Venue[] = [{ name: 'the chapel', dish: 'meal', tier: 0 }, { name: 'the city cemetery', dish: 'pint', tier: 0 }];
    const q = willInvite(writer) ? priceOf(w, me, writer.who, writer.role, rooms, nb, salt, 'gov') : undefined;
    const room = q ?? roomName(w, writer.who, rooms, nb, salt);
    const title = dress(`Funeral at ${room.head}`, `For ${P.name(dead.who)}`, q ? 1 : 0, q?.pay === 'treat');
    const plan = pushPlan(w, st, {
      kind: 'funeral', day: w.day + 6 + (mix(w.day, dead.who, 17) % 6), place: room.place, who: [dead.who, writer.who], host: writer.who, title,
      invite: q ? 1 : 0, cents: q?.cents ?? 0, pay: q?.pay ?? '', cover: q?.cover, change: 'warm', parcel: -1, firm: -1, other: dead.who,
      cause: ev.id,
    });
    if (plan) mark(st, `funeral:${dead.who}`);
    return !!plan;
  }
  return false;
}

function schedule(w: World, st: Box, me: number, kind: string, asInvite: boolean, bias = ''): boolean {
  if (kind === 'dinner') return tryDinner(w, st, me, false, asInvite, bias);
  if (kind === 'drinks') return tryDinner(w, st, me, true, asInvite, bias);
  if (kind === 'deal') return tryDeal(w, st, me);
  if (kind === 'birthday') return tryBirthday(w, st, me, asInvite);
  if (kind === 'leaving') return tryLeaving(w, st, me, asInvite);
  if (kind === 'interview') return tryInterview(w, st, me, asInvite);
  if (kind === 'wedding') return tryWedding(w, st, me, asInvite);
  if (kind === 'fallout') return tryFallout(w, st, me);
  if (kind === 'move') return tryMove(w, st, me, asInvite);
  if (kind === 'funeral') return tryFuneral(w, st, me);
  return false;
}

function tipLine(w: World, st: Box, me: number, host: number, role: string, cause: number): string {
  const fact = quietFact(w, host);
  const P = econ(w).P;
  if (fact && !seen(st, `tip:${fact.id}`)) {
    mark(st, `tip:${fact.id}`);
    hear(w, host, fact);
    const told = plain(w, fact.msg);
    const text = say(w, host, role, `This is not in the paper. ${told}`, `You heard it because you came.`, `Don't write it down.`, );
    postLetter(w, st, host, role, 'favour', text, fact.eventId >= 0 ? fact.eventId : cause);
    return `${P.name(host)} mentions a tip.`;
  }
  const firm = employer(w, host);
  if (firm >= 0) {
    const name = firmName(w, firm);
    const text = say(w, host, role, `They're taking people at ${name}.`, `I can say your name if you want the seat.`, `Ask before the week turns.`, );
    postLetter(w, st, host, role, 'hint', text, cause);
    return `${P.name(host)} mentions a job at ${name}.`;
  }
  return '';
}

function holdJob(w: World, who: number, firmIdx: number): string {
  const P = econ(w).P;
  const firms = econ(w).firms;
  if (!adult(w, who) || firmIdx < 0 || firmIdx >= firms.length) return '';
  const f = firms[firmIdx];
  if (!f || f.closed || f.ceo === who) return '';
  if (P.employer[who] === f.idx) return '';
  setSimDay(w.day);
  joinFirm(econ(w), who, f);
  return `${P.name(who)} starts at ${f.name}.`;
}
function holdWedding(w: World, a: number, b: number): string {
  const P = econ(w).P;
  if (!alive(w, a) || !alive(w, b) || closeKin(w, a, b)) return '';
  if (P.spouse[a] >= 0 || P.spouse[b] >= 0) return '';
  if (P.age(w, a) < 20 || P.age(w, b) < 20) return '';
  P.spouse[a] = b;
  P.spouse[b] = a;
  return `${P.name(a)} marries ${P.name(b)}.`;
}
function holdMove(w: World, who: number, parcel: number, cause: number): string {
  if (!alive(w, who) || parcel < 0) return '';
  const P = econ(w).P;
  const got = bidHome(w, who, parcel, 0, cause);
  if (got.why) return `${P.name(who)} looked at a house and stayed.`;
  return `${P.name(who)} moves.`;
}

function resolveOne(w: World, st: Box, me: number, p: LifePlan): void {
  const P = econ(w).P;
  if (p.kind === 'wedding' && (!alive(w, p.host) || !alive(w, p.other))) {
    p.status = 'gone';
    closeAsk(st, p.ask, 'lapsed');
    return;
  }
  if ((p.kind === 'dinner' || p.kind === 'drinks' || p.kind === 'deal' || p.kind === 'birthday') && !alive(w, p.host)) {
    p.status = 'gone';
    closeAsk(st, p.ask, 'lapsed');
    return;
  }
  let went = false;
  let missed = false;
  const role = bondOf(st, p.host)?.role ?? 'colleague';
  if (p.invite && p.status === 'yes' && me >= 0) {
    const treated = p.pay === 'treat';
    const to = p.pay === 'gov' ? GOV : (alive(w, p.host) ? P.id(p.host) : GOV);
    const paid = treated
      ? Math.round(p.cover ?? 0) >= 1 && sparePay(w, p.host, GOV, p.cover ?? 0, p.eventId)
      : playerPay(w, me, to, p.cents, p.eventId);
    if (paid) {
      went = true;
      touch(w, st, me, p.host, 7, `You went to the ${p.kind} in ${p.place}`, p.eventId);
      forgive(bondOf(st, p.host));
      const b = bondOf(st, p.host);
      if (b) {
        b.together.push({ day: w.day, text: `You went to the ${p.kind}`, eventId: p.eventId });
        if (b.together.length > 5) b.together.splice(0, b.together.length - 5);
      }
    } else {
      missed = true;
      touch(w, st, me, p.host, -3, `You could not pay for the ${p.kind}`, p.eventId);
    }
    closeAsk(st, p.ask, 'yes');
  } else if (p.invite && p.status === 'no') {
    missed = true;
    closeAsk(st, p.ask, 'no');
  } else if (p.invite && p.status === 'set') {
    missed = true;
    touch(w, st, me, p.host, -6, `You missed the ${p.kind} at ${p.place}`, p.eventId);
    snub(bondOf(st, p.host));
    closeAsk(st, p.ask, 'lapsed');
  }
  let effect = '';
  if (!p.invite && (p.kind === 'dinner' || p.kind === 'drinks') && p.who.length > 1 && alive(w, p.who[0]) && alive(w, p.who[1])) {
    nudgeLink(w, p.who[0], p.who[1], 4);
    effect = `${P.name(p.who[0])} and ${P.name(p.who[1])} meet.`;
  } else if (p.kind === 'wedding') effect = holdWedding(w, p.who[0] ?? p.host, p.other);
  else if (p.kind === 'leaving' || p.kind === 'interview') effect = holdJob(w, p.host, p.firm);
  else if (p.kind === 'move') effect = holdMove(w, p.host, p.parcel, p.eventId);
  else if (p.kind === 'fallout' && alive(w, p.host) && alive(w, p.other)) {
    nudgeLink(w, p.host, p.other, -14);
    effect = `${P.name(p.host)} and ${P.name(p.other)} fall out.`;
    const text = say(w, p.host, role, `${P.name(p.other)} and I have fallen out.`, `Don't ask us to the same table.`, `I'll be slower to write for a while.`, );
    postLetter(w, st, p.host, role, 'life', text, p.eventId);
  }
  if (p.pay !== 'treat' && (p.kind === 'dinner' || p.kind === 'drinks' || p.kind === 'leaving' || p.kind === 'birthday')) {
    sparePay(w, p.host, GOV, Math.max(100, Math.round(wage(w) * 2)), p.eventId);
  }
  if (p.pay !== 'treat' && p.kind === 'wedding') sparePay(w, p.host, GOV, Math.max(100, Math.round(wage(w) * 8)), p.eventId);
  let extra = effect;
  if (went && (p.kind === 'dinner' || p.kind === 'drinks' || p.kind === 'deal' || p.kind === 'leaving' || p.kind === 'interview')) {
    const bit = tipLine(w, st, me, p.host, role, p.eventId);
    if (bit) extra = extra ? `${extra} ${bit}` : bit;
  }
  const you = !p.invite ? '' : went ? 'You went.' : 'You stayed away.';
  const tail = [effect, extra !== effect ? extra : '', you].filter((s, i, a) => s && a.indexOf(s) === i).join(' ');
  const msg = tail ? `${p.title} ${tail}` : p.title;
  const actor = alive(w, p.host) ? P.id(p.host) : (me >= 0 ? P.id(me) : undefined);
  const ev = w.events.emit(missed && !went ? 'circle.skip' : 'circle.held', msg, [p.eventId >= 0 ? p.eventId : root(w)], actor);
  p.eventId = ev;
  p.status = 'held';
  if (you) p.title = `${p.title.replace(/ You are invited\./g, '')} ${you}`.replace(/\s+/g, ' ').trim();
  st.yPlans++;
}

function societyDates(w: World): SocDate[] {
  const st = w.state.society as { dates?: SocDate[] } | undefined;
  return st?.dates ?? [];
}
function treatKey(id: number): string { return `treat:soc:${id}:`; }
function treatCents(st: Box, id: number): number {
  const prefix = treatKey(id);
  for (const key of st.sent) {
    if (!key.startsWith(prefix)) continue;
    return Math.round(Number(key.slice(prefix.length)) || 0);
  }
  return 0;
}
function withTreat(title: string): string {
  if (/I'll get this one/.test(title)) return title;
  const base = title.replace(/\s+$/, '');
  return `${base.endsWith('.') ? base : `${base}.`} I'll get this one.`;
}
function payDueTreats(w: World, st: Box): void {
  for (const d of societyDates(w)) {
    if (d.day !== w.day || d.status !== 'yes' || seen(st, `treat-paid:${d.id}`)) continue;
    const cents = treatCents(st, d.id);
    if (cents < 1) { mark(st, `treat-paid:${d.id}`); continue; }
    const cause = d.eventId >= 0 ? d.eventId : root(w);
    if (!sparePay(w, d.host, GOV, cents, cause)) {
      d.invite = 0;
      d.status = 'set';
    }
    mark(st, `treat-paid:${d.id}`);
  }
}
function linkSociety(w: World, st: Box, me: number): void {
  if (me < 0) return;
  for (const d of societyDates(w)) {
    if (d.invite !== 1 || d.ask >= 0 || d.day <= w.day || d.status !== 'set') continue;
    if (d.day > w.day + 40) continue;
    const role = bondOf(st, d.host)?.role ?? 'colleague';
    if (d.cents > 0 && !canPay(w, me, d.cents)) {
      if (closeRole(role) && canTreat(w, d.host, d.cents)) {
        mark(st, `${treatKey(d.id)}${Math.round(d.cents)}`);
        d.cents = 0;
        d.title = withTreat(d.title);
      } else {
        d.invite = 0;
        d.title = d.title.replace(/\s*You are invited\.?/g, '').trim();
        continue;
      }
    }
    const clock = `Say yes or no by day ${d.day}. If I hear nothing, I'll take it as a no.`;
    const treated = d.cents < 1 && treatCents(st, d.id) > 0;
    const cost = treated ? `I'll get this one. ${clock}` : d.cents > 0 ? `You pay the city ${usd(d.cents)}. ${clock}` : clock;
    const fact = d.title.replace(/\s*You are invited\.?/g, '').replace(/\s*I'll get this one\.?/g, '').trim();
    const text = say(w, d.host, role, fact, cost, `The evening goes on if you don't come.`, );
    const row = askInvite(w, st, d.host, role, text, d.eventId >= 0 ? d.eventId : root(w), d.kind, d.cents, d.day, -1, d.id);
    d.ask = row.id;
  }
}

function findCircle(st: Box, askId: number): LifePlan | undefined {
  for (const p of st.plans) if (p.ask === askId) return p;
  return undefined;
}
function findSoc(w: World, askId: number): SocDate | undefined {
  for (const d of societyDates(w)) if (d.ask === askId) return d;
  return undefined;
}

export function acceptFuturePlan(w: World, askId: number): boolean {
  const st = box(w);
  if (!st || askId < 0) return false;
  const p = findCircle(st, askId);
  if (p && p.status === 'set' && p.day >= w.day) { p.status = 'yes'; return true; }
  const d = findSoc(w, askId);
  if (d && d.status === 'set' && d.day >= w.day) { d.status = 'yes'; return true; }
  return false;
}
export function declineFuturePlan(w: World, askId: number): void {
  const st = box(w);
  if (!st || askId < 0) return;
  const p = findCircle(st, askId);
  if (p && p.status === 'set') {
    p.status = 'no';
    snub(bondOf(st, p.host));
  }
  const d = findSoc(w, askId);
  if (d && d.status === 'set') d.status = 'no';
}

export function circlePlansOn(w: World, day: number): { kind: string; title: string; eventId: number }[] {
  const st = w.state.circle as Box | undefined;
  if (!st?.plans) return [];
  const out: { kind: string; title: string; eventId: number }[] = [];
  for (const p of st.plans) {
    if (p.day !== day || p.status === 'gone') continue;
    out.push({ kind: 'circle.' + p.kind, title: p.title, eventId: p.eventId >= 0 ? p.eventId : w.genesis });
  }
  return out;
}

/** Society schedules a date after the circle has already closed that day. Settle the ask the same day. */
export function settleSocietyAsks(w: World): void {
  const st = box(w);
  const me = playerOf(w);
  if (!st || me < 0) return;
  linkSociety(w, st, me);
}

export function tendCirclePlans(w: World): void {
  const st = box(w);
  const me = playerOf(w);
  if (!st || me < 0 || !st.cast) return;
  payDueTreats(w, st);
  for (const p of st.plans) {
    if (p.day > w.day) continue;
    if (p.status === 'held' || p.status === 'gone') continue;
    resolveOne(w, st, me, p);
  }
  if (st.plans.length > 48) st.plans = st.plans.filter((p) => p.day >= w.day - 2 && p.status !== 'gone');
  if (st.asks.length > 240) st.asks = st.asks.filter((a) => a.status === 'pending' || a.owed > 0 || a.day > w.day - 90);
  linkSociety(w, st, me);
  tryFuneral(w, st, me);
  const need = quota(bandOf(w, st, me));
  const got = have(st, w.day);
  const gap = (): string => {
    const got: Record<string, boolean> = { friend: false, family: false, work: false, city: false };
    const known = new Set<number>();
    for (const b of st.bonds) known.add(b.who);
    for (const p of st.plans) {
      if (p.status === 'gone' || p.day < w.day || p.day >= w.day + 30) continue;
      if (p.kind !== 'dinner' && p.kind !== 'drinks' && p.kind !== 'leaving' && p.kind !== 'birthday') continue;
      const role = bondOf(st, p.host)?.role ?? '';
      if (role === 'friend') got.friend = true;
      else if (role === 'family') got.family = true;
      else if (role === 'colleague' || role === 'mentor') got.work = true;
      if (p.who.some((id) => !known.has(id))) got.city = true;
    }
    const start = w.day % GAPS.length;
    for (let i = 0; i < GAPS.length; i++) {
      const g = GAPS[(start + i) % GAPS.length];
      if (!got[g]) return g;
    }
    return GAPS[start];
  };
  const fill = (kinds: string[], asInvite: boolean): boolean => {
    const start = (st.plans.length + w.day) % kinds.length;
    const bias = gap();
    for (let i = 0; i < kinds.length; i++) {
      const kind = kinds[(start + i) % kinds.length];
      if (kind === 'dinner' || kind === 'drinks') {
        const from = GAPS.indexOf(bias);
        for (let g = 0; g < GAPS.length; g++) {
          if (schedule(w, st, me, kind, asInvite, GAPS[(from + g) % GAPS.length])) return true;
        }
        continue;
      }
      if (schedule(w, st, me, kind, asInvite, '')) return true;
    }
    return false;
  };
  if (got.life < need.life) {
    if (!fill(LIFE_KINDS, false) && got.invite < need.invite) fill(INVITE_KINDS, true);
  } else if (got.invite < need.invite) fill(INVITE_KINDS, true);
}
