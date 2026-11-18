// The player's circle: friends, family, rivals, mentors and colleagues who write about
// real events, ask for things, and remember what the player did. Only those people
// and their contacts are visited. The rest of the city is left alone.
import { DAYS_PER_YEAR, type Module, type World } from '../../kernel/index.ts';
import { borrowMargin } from '../banking/index.ts';
import { DEP, GOV, pay, type EconState } from '../economy/index.ts';
import { borrowShares, returnShares, submitOrder } from '../markets/index.ts';
import { bidHome, homeBoard, parcelView } from '../property/index.ts';
import { societyGate } from '../society/index.ts';
import { acceptFuturePlan, circleBill, declineFuturePlan, tendCirclePlans } from './plans.ts';
import { contactsOf, knows, nudgeStanding, settlePaper } from '../social/index.ts';
import { chooseShape, jobs, money, renderLetter, signedPct } from '../social/words.ts';

const DEG = 16;
const PLAYER = 8;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export type CircleCmd =
  | { kind: 'reply'; msg: number; text: string }
  | { kind: 'lend'; slot: number; cents: number }
  | { kind: 'invite'; slot: number; place: string }
  | { kind: 'gift'; slot: number; cents: number }
  | { kind: 'introduce'; slot: number }
  | { kind: 'mail' };

interface Why { day: number; delta: number; text: string; eventId: number }
interface Note { day: number; text: string; eventId: number }
interface Bond {
  who: number;
  role: string;
  stance: string;
  score: number;
  touched: number;
  drift: number;
  why: Why[];
  together: Note[];
  spouse: number;
  kids: number;
  occ: number;
  job: number;
  parcel: number;
  ill: number;
  health: number;
  kin: number[];
  watched: number;
  kinIll?: string;
  skips?: number;
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
interface Mem { who: number; day: number; text: string; eventId: number; kind: string; open: number }
interface Extra { slot: number; who: number; trust: number; friend: number }
interface Fact {
  id: number;
  eventId: number;
  day: number;
  tag: string;
  msg: string;
  firms: number[];
  profit: number;
  pub: boolean;
  drop: boolean;
  shock: { prod?: Record<string, number>; demand?: Record<string, number> } | null;
}
interface Soc {
  cap: number;
  contact: Int32Array;
  fam: Uint16Array;
  trust: Uint8Array;
  bond: Uint8Array;
  kind: Uint8Array;
  facts: Fact[];
  head: Int32Array;
  cellFact: Int32Array;
  cellNext: Int32Array;
}
interface Circle {
  next: number;
  letters: Letter[];
  asks: Ask[];
  bonds: Bond[];
  extras: Extra[];
  mems: Mem[];
  sent: string[];
  cast: number;
  yMsg: number;
  yReq: number;
  yPlans: number;
  openWorth: number;
  /** The day the player's circle opened: a year is a year since then, not a year of the city's calendar. */
  openDay?: number;
  markWorth: number;
  rivalDone: number;
  allyDone: number;
  testified: number;
  mileYear: number;
  mileHome: number;
  mileWorth: number;
  nextExtra: number;
  waves: { firm: number; ev: number; day: number }[];
  lastShape?: string;
  lastFrom?: number;
  /** Last headcount this writer actually put in a letter, per firm. Display only. */
  layTold?: Record<string, number>;
  /** Letters voiced so far. A stock closer is allowed on every 30th one. */
  said?: number;
}

export interface CircleResult {
  status: 'accepted' | 'rejected';
  why?: string;
  text?: string;
  eventId?: number;
  lines?: string[];
}

function econ(w: World): EconState { return w.state.economy as EconState; }
function soc(w: World): Soc | undefined {
  const st = w.state.social as Soc | undefined;
  return st?.contact ? st : undefined;
}
function box(w: World): Circle {
  const st = w.state.circle as Circle | undefined;
  if (st?.letters) {
    if (!st.waves) st.waves = [];
    return st;
  }
  const fresh = blank();
  w.state.circle = fresh;
  return fresh;
}
function blank(): Circle {
  return {
    next: 1, letters: [], asks: [], bonds: [], extras: [], mems: [], sent: [], cast: 0,
    yMsg: 0, yReq: 0, yPlans: 0, openWorth: -1, markWorth: -1, rivalDone: -1, allyDone: -1, testified: 0,
    mileYear: -1, mileHome: 0, mileWorth: 0, nextExtra: DEG, waves: [], said: 0,
  };
}
function clamp(n: number, lo: number, hi: number): number { return n < lo ? lo : n > hi ? hi : n; }
function usd(cents: number): string { return money(cents); }
function monthName(day: number): string { return MONTHS[Math.floor(((day % 360) + 360) % 360 / 30)] ?? 'January'; }
function alive(w: World, i: number): boolean {
  const P = econ(w).P;
  return i >= 0 && i < P.n && (P.flags[i] & 1) !== 0 && (P.flags[i] & 4) === 0;
}
function playerWho(w: World): number {
  const st = w.state.player as { who?: number; ids?: string[]; seat?: Record<string, { who?: number }> } | undefined;
  const P = econ(w).P;
  const key = st?.ids?.[0];
  const who = (key && st?.seat?.[key]?.who) ?? st?.who ?? -1;
  if (who >= 0 && who < P.n && (P.flags[who] & PLAYER) !== 0) return who;
  return -1;
}
function root(w: World): number { return w.events.last('player.arrive') ?? econ(w).macroEv ?? w.genesis; }
function seen(st: Circle, key: string): boolean { return st.sent.includes(key); }
function mark(st: Circle, key: string): void {
  if (seen(st, key)) return;
  st.sent.push(key);
  if (st.sent.length > 3000) st.sent.splice(0, st.sent.length - 2200);
}
function newsFresh(st: Circle, key: string, eventId: number): boolean {
  if (seen(st, key)) return false;
  return eventId < 0 || !seen(st, `news:${eventId}`);
}
function newsTake(st: Circle, key: string, eventId: number): void {
  mark(st, key);
  if (eventId >= 0) mark(st, `news:${eventId}`);
}
function bondOf(st: Circle, who: number): Bond | undefined {
  for (const b of st.bonds) if (b.who === who) return b;
  return undefined;
}
function facetOf(w: World, who: number): string {
  const P = econ(w).P;
  if (who < 0 || who >= P.n) return 'blunt';
  if (P.anxiety[who] >= 67) return 'anxious';
  if (P.diligence[who] >= 72) return 'formal';
  if (P.diligence[who] >= 55) return 'proud';
  if (P.kin[who] >= 67) return 'warm';
  if (P.greed[who] >= 60) return 'blunt';
  return 'warm';
}
function voiceOf(w: World, who: number, role: string): string {
  if (role === 'rival') return 'cold';
  const score = bondOf(box(w), who)?.score ?? 0;
  if (score < 25 && role !== 'family' && role !== 'friend' && role !== 'mentor') return 'cold';
  return facetOf(w, who);
}
function sincePhrase(b: Bond | undefined): string {
  if (!b) return '';
  for (let i = b.together.length - 1; i >= 0; i--) {
    const t = b.together[i].text.toLowerCase();
    const month = monthName(b.together[i].day);
    if (t.includes('dinner')) return `the dinner in ${month}`;
    if (t.includes('club')) return `the club in ${month}`;
    if (t.includes('gala')) return `the gala in ${month}`;
  }
  for (let i = b.why.length - 1; i >= 0; i--) {
    const t = b.why[i].text;
    const month = monthName(b.why[i].day);
    if (/dinner/i.test(t)) return `the dinner in ${month}`;
    if (/lent/i.test(t)) return `the loan in ${month}`;
    if (/gave|gift/i.test(t)) return `the gift in ${month}`;
    if (/introduced/i.test(t)) return `the introduction in ${month}`;
    if (/testified/i.test(t)) return `what was said in court in ${month}`;
    if (/shorted/i.test(t)) return `the short in ${month}`;
    if (/vouched/i.test(t)) return `the good word in ${month}`;
  }
  return '';
}
function say(w: World, who: number, role: string, fact: string, you: string, mine: string, kind = 'note'): string {
  const st = box(w);
  const b = bondOf(st, who);
  const voice = voiceOf(w, who, role);
  const avoid = st.lastFrom !== who ? (st.lastShape ?? '') : '';
  const shape = chooseShape(voice as 'warm', kind, who + w.day + fact.length, avoid);
  st.lastShape = shape;
  st.lastFrom = who;
  const score = b?.score ?? 0;
  const n = (st.said ?? 0) + 1;
  st.said = n;
  return renderLetter({
    voice: voice as 'warm',
    shape, fact, you, mine,
    since: sincePhrase(b),
    casual: role === 'friend' && score >= 50,
    worry: role === 'family',
    salt: who * 17 + w.day * 3 + fact.length,
    ticOk: n % 30 === 0,
  });
}
function firmCalled(w: World, id: string): string {
  const firms = econ(w).firms;
  for (let i = 0; i < firms.length; i++) if (firms[i].id === id) return firms[i].name;
  return '';
}
function shareName(w: World, instr: string): string {
  const id = instr.startsWith('eq:') ? instr.slice(3) : instr;
  if (id === 'bank_1' || id === 'BANK') return 'the bank';
  return firmCalled(w, id) || 'those shares';
}
function plain(w: World, msg: string): string {
  const m = /^(\S+) close (\d+) -> (\d+) \(([+-]?\d+(?:\.\d+)?)%\)/.exec(msg);
  if (m) {
    const pct = +m[4];
    const dir = pct < 0 ? `down ${Math.abs(pct).toFixed(2)}%` : pct > 0 ? `up ${pct.toFixed(2)}%` : 'unchanged';
    return `${shareName(w, m[1])} closed ${dir} at ${money(+m[3])}. It had been ${money(+m[2])}.`;
  }
  return msg
    .replace(/\bstkln:[A-Za-z0-9_:-]+/g, 'the stock loan')
    .replace(/\beq:[A-Za-z0-9_]+/g, (s) => shareName(w, s))
    .replace(/\bfrm_[a-z0-9_]+/g, (s) => firmCalled(w, s) || 'the firm')
    .replace(/\bp_\d+\b/g, 'someone')
    .replace(/\bbank_1\b/g, 'the bank');
}
function wordOf(score: number): string {
  if (score >= 75) return 'Close';
  if (score >= 55) return 'Warm';
  if (score >= 40) return 'Cordial';
  if (score >= 25) return 'Cool';
  return 'Cold';
}

function socialSlot(w: World, holder: number, who: number): number {
  const st = soc(w);
  if (!st || holder < 0 || holder >= st.cap) return -1;
  const b = holder * DEG;
  for (let k = 0; k < DEG; k++) if (st.contact[b + k] === who) return k;
  return -1;
}
function emptySocial(w: World, holder: number): number {
  const st = soc(w);
  if (!st || holder < 0 || holder >= st.cap) return -1;
  const b = holder * DEG;
  for (let k = 0; k < DEG; k++) if (st.contact[b + k] < 0) return k;
  return -1;
}
/** Place a new acquaintance in an empty social slot. Occupied slots are left alone: the reverse-slot cache is not ours to clear. */
function placeSocial(w: World, a: number, b: number, fam: number, trust: number, friend: number): number {
  const st = soc(w);
  if (!st || a === b) return -1;
  const have = socialSlot(w, a, b);
  if (have >= 0) return have;
  const k = emptySocial(w, a);
  if (k < 0) return -1;
  const p = a * DEG + k;
  st.contact[p] = b;
  st.fam[p] = fam;
  st.trust[p] = trust;
  st.kind[p] = 3;
  const q = p * 4;
  st.bond[q] = 28;
  st.bond[q + 1] = 8;
  st.bond[q + 2] = 24;
  st.bond[q + 3] = friend;
  const back = emptySocial(w, b);
  if (back >= 0 && b < st.cap) {
    const r = b * DEG + back;
    st.contact[r] = a;
    st.fam[r] = fam;
    st.trust[r] = trust;
    st.kind[r] = 3;
    const s = r * 4;
    st.bond[s] = 28;
    st.bond[s + 1] = 8;
    st.bond[s + 2] = 24;
    st.bond[s + 3] = friend;
  }
  return k;
}
function nudgeBytes(w: World, holder: number, who: number, trust: number, loyalty: number, friend: number, fam: number): void {
  const st = soc(w);
  const k = socialSlot(w, holder, who);
  if (!st || k < 0) return;
  const p = holder * DEG + k;
  st.trust[p] = clamp(st.trust[p] + trust, 0, 100);
  st.fam[p] = clamp(st.fam[p] + fam, 0, 65535);
  const q = p * 4;
  st.bond[q + 2] = clamp(st.bond[q + 2] + loyalty, 0, 100);
  st.bond[q + 3] = clamp(st.bond[q + 3] + friend, 0, 100);
  if (trust > 0 && st.bond[q] < 100) st.bond[q] = clamp(st.bond[q] + 1, 0, 100);
}

function ensureBond(st: Circle, w: World, who: number, role: string, stance: string): Bond {
  let b = bondOf(st, who);
  if (b) {
    if (role && (b.role === 'colleague' || b.role === '')) b.role = role;
    if (stance && !b.stance) b.stance = stance;
    return b;
  }
  const k = socialSlot(w, playerWho(w), who);
  const graph = soc(w);
  const score = graph && k >= 0 ? graph.bond[(playerWho(w) * DEG + k) * 4 + 3] : 20;
  const cause = root(w);
  const P = econ(w).P;
  const how = role === 'family' || role === 'mentor' ? `${P.name(who)} is family` : `You met ${P.name(who)}`;
  b = {
    who, role: role || 'colleague', stance, score, touched: w.day, drift: w.day,
    why: [{ day: w.day, delta: 0, text: how, eventId: cause }], together: [],
    spouse: -1, kids: 0, occ: 0, job: -1, parcel: -1, ill: 0, health: 0, kin: [], watched: 0,
  };
  st.bonds.push(b);
  snap(w, b);
  return b;
}
/** Children under 18 who still live with this person. Adults are not "at home". */
function childrenHome(w: World, who: number): { n: number; eldest: number } {
  const P = econ(w).P;
  const home = parcelOf(w, who);
  let n = 0, eldest = -1;
  if (who < 0 || who >= P.n) return { n, eldest };
  for (const c of P.kids(who)) {
    if (!alive(w, c)) continue;
    const age = P.age(w, c);
    if (age >= 18) continue;
    const cp = parcelOf(w, c);
    if (home >= 0 && cp >= 0 && cp !== home) continue;
    n++;
    if (age > eldest) eldest = age;
  }
  return { n, eldest };
}
function kinOf(w: World, i: number): number[] {
  const P = econ(w).P;
  if (i < 0 || i >= P.n) return [];
  const out: number[] = [];
  const push = (k: number): void => { if (k >= 0 && k < P.n && k !== i && P.alive(k) && !out.includes(k)) out.push(k); };
  push(P.spouse[i]);
  push(P.parent[i]);
  for (const c of P.kids(i)) push(c);
  const parent = P.parent[i];
  if (parent >= 0) for (const c of P.kids(parent)) push(c);
  const sp = P.spouse[i];
  if (sp >= 0) push(P.parent[sp]);
  return out;
}
function parcelOf(w: World, i: number): number {
  const live = (w.state.property as { live?: Int32Array } | undefined)?.live;
  if (!live || i < 0 || i >= live.length) return -1;
  return live[i];
}
function snap(w: World, b: Bond): void {
  const P = econ(w).P;
  const i = b.who;
  b.spouse = i >= 0 && i < P.n ? P.spouse[i] : -1;
  b.kids = i >= 0 && i < P.n ? P.nkids[i] : 0;
  b.occ = i >= 0 && i < P.n ? P.occ[i] : 0;
  b.health = i >= 0 && i < P.n ? P.health[i] : 0;
  b.ill = i >= 0 && i < P.n ? P.ill[i] : 0;
  b.job = employer(w, i);
  b.parcel = parcelOf(w, i);
  b.kin = kinOf(w, i);
  b.watched = 1;
}
function moveBond(w: World, st: Circle, who: number, delta: number, trust: number, loyalty: number, text: string, eventId: number, fam = 0, talk = true): Bond {
  const b = ensureBond(st, w, who, '', '');
  b.score = clamp(b.score + delta, 0, 100);
  if (talk) b.touched = w.day;
  if ((delta !== 0 || trust !== 0) && b.why[b.why.length - 1]?.text !== text) {
    b.why.push({ day: w.day, delta, text, eventId });
    if (b.why.length > 6) b.why.splice(0, b.why.length - 6);
  }
  const me = playerWho(w);
  nudgeBytes(w, me, who, trust, loyalty, delta, fam);
  nudgeBytes(w, who, me, trust, loyalty, delta, fam);
  return b;
}
function together(b: Bond, day: number, text: string, eventId: number): void {
  b.together.push({ day, text, eventId });
  if (b.together.length > 5) b.together.splice(0, b.together.length - 5);
}
function remember(st: Circle, who: number, day: number, text: string, eventId: number, kind: string): void {
  st.mems.push({ who, day, text, eventId, kind, open: 1 });
  if (st.mems.length > 80) st.mems.splice(0, st.mems.length - 80);
}

function firmName(w: World, idx: number): string {
  const f = econ(w).firms[idx];
  return f?.name ?? 'the firm';
}
function employer(w: World, i: number): number { return i >= 0 ? econ(w).P.employer[i] : -1; }
function neighbourhood(w: World, person: number): string {
  const live = (w.state.property as { live?: Int32Array } | undefined)?.live;
  if (!live || person < 0 || person >= live.length) return '';
  const p = live[person];
  if (p < 0) return '';
  return parcelView(w, p)?.neighbourhood ?? '';
}
function holdings(w: World, id: string): { instr: string; qty: number; last: number; issuer: string }[] {
  const stocks = (w.state.markets as { stocks?: { instr: string; last: number; issuer: string }[] } | undefined)?.stocks ?? [];
  const out: { instr: string; qty: number; last: number; issuer: string }[] = [];
  for (const s of stocks) {
    const q = Math.floor(w.ledger.balance(id, s.instr));
    if (q > 0) out.push({ instr: s.instr, qty: q, last: s.last, issuer: s.issuer });
  }
  return out;
}
function position(w: World, i: number): number {
  const id = econ(w).P.id(i);
  let v = Math.floor(w.ledger.balance(id, DEP));
  for (const h of holdings(w, id)) v += h.qty * h.last;
  return v;
}
function recentFacts(w: World, person: number, within: number): Fact[] {
  const st = soc(w);
  if (!st || person < 0 || person >= st.head.length) return [];
  const out: Fact[] = [];
  let c = st.head[person];
  let n = 0;
  const cut = w.day - within;
  while (c >= 0 && n < 40) {
    const id = st.cellFact[c];
    const f = st.facts[id];
    if (f && !f.drop && f.day >= cut) out.push(f);
    c = st.cellNext[c];
    n++;
  }
  return out;
}
function shockTouches(fact: Fact, good: string): boolean {
  const s = fact.shock;
  if (!s) return false;
  return s.prod?.[good] !== undefined || s.prod?.ALL !== undefined || s.demand?.[good] !== undefined;
}

function post(w: World, st: Circle, from: number, role: string, kind: string, text: string, cause: number, source: number, req = -1): Letter {
  const P = econ(w).P;
  const clean = plain(w, text);
  const ev = w.events.emit('circle.letter', clean, [cause >= 0 ? cause : root(w)], P.id(from));
  const letter: Letter = { id: st.next++, day: w.day, from, role, kind, text: clean, eventId: ev, source: source >= 0 ? source : ev, req };
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
/** A letter the inbox shows, with no new event and no change to who was last touched. */
function postQuiet(w: World, st: Circle, from: number, role: string, kind: string, text: string, cause: number): void {
  const src = cause >= 0 ? cause : root(w);
  const letter: Letter = { id: st.next++, day: w.day, from, role, kind, text: plain(w, text), eventId: src, source: src, req: -1 };
  st.letters.push(letter);
}
function askFor(w: World, st: Circle, from: number, role: string, kind: string, text: string, cause: number, spec: Partial<Ask>): Ask {
  const letter = post(w, st, from, role, kind, text, cause, cause);
  const row: Ask = {
    id: st.next++, msg: letter.id, from, kind, day: w.day, status: 'pending', cents: 0, other: -1,
    due: w.day + 90, owed: 0, eventId: letter.eventId, place: '', factId: -1, note: '', ...spec,
  };
  letter.req = row.id;
  st.asks.push(row);
  st.yReq++;
  return row;
}

function cast(w: World, st: Circle, me: number): void {
  if (st.cast) return;
  const P = econ(w).P;
  const rows = contactsOf(w, me).filter((c) => alive(w, c.who));
  const family = rows.filter((c) => c.kind === 1);
  const work = rows.filter((c) => c.kind !== 1);
  const parent = P.parent[me];
  const mentorRow = family.find((c) => c.who === parent || (parent >= 0 && P.spouse[parent] === c.who))
    ?? [...family].sort((a, b) => P.diligence[b.who] - P.diligence[a.who] || a.who - b.who)[0]
    ?? [...work].sort((a, b) => P.diligence[b.who] - P.diligence[a.who] || a.who - b.who)[0];
  const mentor = mentorRow?.who ?? -1;
  const friendRow = [...work].filter((c) => c.who !== mentor).sort((a, b) => b.trust - a.trust || a.who - b.who)[0]
    ?? family.find((c) => c.who !== mentor);
  const friend = friendRow?.who ?? -1;
  const rivalRow = [...work].filter((c) => c.who !== friend && c.who !== mentor).sort((a, b) => P.greed[b.who] - P.greed[a.who] || a.who - b.who)[0];
  const rival = rivalRow?.who ?? -1;
  const allyRow = [...work].filter((c) => c.who !== friend && c.who !== rival && c.who !== mentor).sort((a, b) => b.trust - a.trust || a.who - b.who)[0];
  const ally = allyRow?.who ?? -1;
  for (const c of rows) {
    let role = c.kind === 1 ? 'family' : 'colleague';
    let stance = '';
    if (c.who === mentor) role = P.parent[me] === c.who || (parent >= 0 && P.spouse[parent] === c.who) || c.kind === 1 && mentor === c.who && family.includes(c) ? (c.kind === 1 && c.who !== friend ? 'mentor' : 'mentor') : 'mentor';
    if (c.who === friend && role !== 'mentor') role = c.kind === 1 ? 'family' : 'friend';
    if (c.who === friend && c.kind !== 1) role = 'friend';
    if (c.who === rival) { role = 'rival'; stance = 'rival'; }
    if (c.who === ally) { role = 'colleague'; stance = 'ally'; }
    if (c.who === mentor) role = 'mentor';
    ensureBond(st, w, c.who, role, stance);
    const b = bondOf(st, c.who);
    if (b) { b.role = role; b.stance = stance || b.stance; }
  }
  const banker = findBanker(w, me, rows.map((c) => c.who));
  if (banker >= 0) {
    const b = ensureBond(st, w, banker, 'colleague', 'banker');
    b.stance = 'banker';
    if (socialSlot(w, me, banker) < 0 && !st.extras.some((e) => e.who === banker)) linkNew(w, st, me, banker, 22, 16, 'colleague', 'banker');
  }
  st.cast = 1;
  if (st.openWorth < 0) st.openWorth = position(w, me);
  if (st.openDay === undefined) st.openDay = w.day;
  st.markWorth = st.openWorth;
}
function findBanker(w: World, me: number, first: number[]): number {
  const P = econ(w).P;
  const firms = econ(w).firms;
  const isBank = (i: number): boolean => {
    const e = P.employer[i];
    return e >= 0 && firms[e]?.good === 'BANKING';
  };
  for (const i of first) if (i !== me && alive(w, i) && isBank(i)) return i;
  for (const i of first) {
    if (!alive(w, i)) continue;
    for (const c of contactsOf(w, i)) {
      if (c.who === me || !alive(w, c.who)) continue;
      if (isBank(c.who)) return c.who;
    }
  }
  return -1;
}
function linkNew(w: World, st: Circle, me: number, who: number, trust: number, friend: number, role: string, stance: string): number {
  const social = placeSocial(w, me, who, 40, trust, friend);
  if (social >= 0) {
    ensureBond(st, w, who, role, stance);
    const b = bondOf(st, who);
    if (b) { b.role = role; b.stance = stance; b.score = friend; }
    return social;
  }
  if (st.extras.some((e) => e.who === who)) return st.extras.find((e) => e.who === who)!.slot;
  const slot = st.nextExtra++;
  st.extras.push({ slot, who, trust, friend });
  const b = ensureBond(st, w, who, role, stance);
  b.role = role;
  b.stance = stance;
  b.score = friend;
  b.why.push({ day: w.day, delta: 0, text: 'A new acquaintance, and less trust than an old friend', eventId: root(w) });
  return slot;
}
function whoAt(w: World, st: Circle, me: number, slot: number): number {
  if (slot >= 0 && slot < DEG) {
    const stc = soc(w);
    if (!stc || me >= stc.cap) return -1;
    return stc.contact[me * DEG + slot];
  }
  return st.extras.find((e) => e.slot === slot)?.who ?? -1;
}
function slotOf(w: World, st: Circle, me: number, who: number): number {
  const s = socialSlot(w, me, who);
  if (s >= 0) return s;
  return st.extras.find((e) => e.who === who)?.slot ?? -1;
}
function resolve(w: World, st: Circle, me: number, slot: number, prefer: string): { who: number; slot: number } | { why: string } {
  cast(w, st, me);
  if (slot >= 0) {
    const who = whoAt(w, st, me, slot);
    if (!alive(w, who)) return { why: 'nobody in that contact slot' };
    return { who, slot };
  }
  const pending = st.asks.find((a) => a.status === 'pending' && a.kind === prefer);
  const want = pending ? bondOf(st, pending.from) : st.bonds.find((b) => b.role === prefer && alive(w, b.who))
    ?? st.bonds.find((b) => b.role === 'friend' && alive(w, b.who))
    ?? st.bonds.find((b) => alive(w, b.who));
  const who = pending?.from ?? want?.who ?? -1;
  if (!alive(w, who)) return { why: 'you have no one for that' };
  let at = slotOf(w, st, me, who);
  if (at < 0) at = linkNew(w, st, me, who, 30, 20, want?.role ?? 'colleague', want?.stance ?? '');
  return { who, slot: at };
}

function actions(row: Ask): string[] {
  if (row.status !== 'pending') return [];
  const base = [`reply ${row.msg} yes`, `reply ${row.msg} no`];
  if (row.kind === 'loan' && row.cents > 0) base.unshift(`lend ${row.cents / 100}`);
  if (row.kind === 'invite') base.unshift(`invite ${row.place || 'dinner'}`);
  return base;
}

function payThem(w: World, from: string, to: string, cents: number, cause: number): boolean {
  const n = Math.round(cents);
  if (n < 1) return false;
  if (Math.floor(w.ledger.balance(from, DEP)) < n) return false;
  return pay(w, from, to, n, 'circle.pay', cause);
}

export function circleAct(w: World, person: number, actor: string, cmd: CircleCmd): CircleResult {
  const st = box(w);
  const P = econ(w).P;
  if (person < 0 || !alive(w, person)) return { status: 'rejected', why: 'you cannot do that now' };
  cast(w, st, person);
  if (cmd.kind === 'invite' || cmd.kind === 'introduce') {
    const no = societyGate(w, person, cmd);
    if (no) return no;
  }
  if (cmd.kind === 'mail') return { status: 'accepted', lines: mailLines(w, st, person), text: `${st.letters.length} letters` };
  if (cmd.kind === 'reply') return reply(w, st, person, actor, cmd.msg, cmd.text);
  if (cmd.kind === 'lend') return lend(w, st, person, actor, cmd.slot, cmd.cents);
  if (cmd.kind === 'gift') return gift(w, st, person, actor, cmd.slot, cmd.cents);
  if (cmd.kind === 'invite') return invite(w, st, person, actor, cmd.slot, cmd.place);
  if (cmd.kind === 'introduce') return introduce(w, st, person, actor, cmd.slot);
  const never: never = cmd;
  return never;
}

function reply(w: World, st: Circle, me: number, actor: string, msg: number, text: string): CircleResult {
  const letter = st.letters.find((l) => l.id === msg);
  if (!letter) return { status: 'rejected', why: 'no such message' };
  const row = st.asks.find((a) => a.msg === msg || a.id === letter.req);
  const word = text.trim();
  const yn = word.toLowerCase();
  if (!row || row.status !== 'pending' || (yn !== 'yes' && yn !== 'no')) {
    const ev = w.events.emit('circle.reply', `${econ(w).P.name(me)} replies: ${word.slice(0, 180)}`, [letter.eventId], actor);
    moveBond(w, st, letter.from, 1, 0, 0, `You wrote back: ${word.slice(0, 80)}`, ev, 8);
    return { status: 'accepted', eventId: ev, text: 'they have it' };
  }
  if (yn === 'no') return refuse(w, st, me, row, letter);
  return accept(w, st, me, actor, row, letter);
}
function refuse(w: World, st: Circle, me: number, row: Ask, letter: Letter): CircleResult {
  row.status = 'no';
  declineFuturePlan(w, row.id);
  const P = econ(w).P;
  const ev = w.events.emit('circle.refuse', `${P.name(me)} refuses ${P.name(row.from)}`, [letter.eventId], P.id(me));
  moveBond(w, st, row.from, -10, -12, -8, `You refused ${row.kind} on ${monthName(w.day)}`, ev);
  remember(st, row.from, w.day, `You refused me in ${monthName(w.day)}`, ev, 'refused');
  const b = bondOf(st, row.from);
  const role = b?.role ?? 'colleague';
  const line = say(w, row.from, role, `You refused me in ${monthName(w.day)}.`, `That sits between us now.`, `I won't ask in the same way again.`, 'memory');
  post(w, st, row.from, b?.role ?? 'colleague', 'memory', line, ev, ev);
  return { status: 'accepted', eventId: ev, text: `${P.name(row.from)} will remember the refusal` };
}
function accept(w: World, st: Circle, me: number, actor: string, row: Ask, letter: Letter): CircleResult {
  const P = econ(w).P;
  if (row.kind === 'loan') return lendTo(w, st, me, actor, row.from, row.cents, row);
  if (row.kind === 'invite' && acceptFuturePlan(w, row.id)) {
    row.status = 'yes';
    const when = row.due > w.day ? `on day ${row.due}` : 'today';
    return { status: 'accepted', eventId: row.eventId, text: `you will go to the ${row.place || 'invitation'} ${when}` };
  }
  if (row.kind === 'invite') return host(w, st, me, actor, row.from, row.place || 'dinner', row);
  if (row.kind === 'intro') return meet(w, st, me, actor, row.from, row.other, row);
  if (row.kind === 'favour') return favour(w, st, me, actor, row, letter);
  row.status = 'yes';
  return { status: 'accepted', text: 'done' };
}
function favour(w: World, st: Circle, me: number, actor: string, row: Ask, letter: Letter): CircleResult {
  const P = econ(w).P;
  const fact = soc(w)?.facts?.[row.factId];
  row.status = 'yes';
  row.due = w.day + 90;
  const cause = fact?.eventId ?? letter.eventId;
  const told = fact?.msg ?? row.note;
  const ev = w.events.emit('circle.favour', `${P.name(row.from)} tells ${P.name(me)}: ${told}`, [cause], P.id(row.from));
  moveBond(w, st, row.from, 3, 2, 4, `You took the tip and promised to return it`, ev);
  remember(st, row.from, w.day, `You owe me for the tip in ${monthName(w.day)}`, ev, 'promise');
  const seat = playerSeat(w);
  if (seat && fact && !seat.heard.some((h) => h.factId === fact.id)) seat.heard.push({ factId: fact.id, eventId: fact.eventId, from: row.from, day: w.day });
  if (row.place === 'rate') {
    const book = borrowMargin(w, me, Math.max(1, row.cents), ev);
    const rate = book.rate > 0 ? signedPct(book.rate * 100, 2) : 'nothing';
    const text = book.taken > 0 ? `${P.name(row.from)} spoke for you. The bank lent ${usd(book.taken)} at ${rate}` : `${P.name(row.from)} spoke for you. The bank did not lend: ${book.why ?? 'no room'}`;
    return { status: 'accepted', eventId: book.taken > 0 ? (w.events.last('loan.grant') ?? ev) : ev, text };
  }
  const line = say(w, row.from, bondOf(st, row.from)?.role ?? 'colleague', `This is not in the paper. ${plain(w, told)}`, `You owe me a favour for hearing it.`, `I'll remember if you don't return it.`, 'favour');
  post(w, st, row.from, bondOf(st, row.from)?.role ?? 'colleague', 'favour', line, ev, cause);
  return { status: 'accepted', eventId: ev, text: told };
}
function playerSeat(w: World): { heard: { factId: number; eventId: number; from: number; day: number }[] } | undefined {
  const st = w.state.player as { ids?: string[]; seat?: Record<string, { heard: { factId: number; eventId: number; from: number; day: number }[] }> } | undefined;
  const key = st?.ids?.[0];
  return key ? st?.seat?.[key] : undefined;
}

function lend(w: World, st: Circle, me: number, actor: string, slot: number, cents: number): CircleResult {
  const hit = resolve(w, st, me, slot, 'loan');
  if ('why' in hit) {
    const friend = resolve(w, st, me, slot, 'friend');
    if ('why' in friend) return { status: 'rejected', why: friend.why };
    return lendTo(w, st, me, actor, friend.who, cents);
  }
  return lendTo(w, st, me, actor, hit.who, cents);
}
function lendTo(w: World, st: Circle, me: number, actor: string, who: number, cents: number, row?: Ask): CircleResult {
  const P = econ(w).P;
  const n = Math.round(cents);
  if (n < 1) return { status: 'rejected', why: 'name an amount' };
  const cause = row?.eventId ?? root(w);
  if (!payThem(w, actor, P.id(who), n, cause)) return { status: 'rejected', why: 'you do not have that in cash' };
  const ev = w.events.emit('circle.lend', `${P.name(me)} lends ${usd(n)} to ${P.name(who)}`, [cause], actor);
  if (row && row.kind === 'loan') { row.status = 'yes'; row.owed = n; row.due = w.day + 180; row.cents = n; row.eventId = ev; }
  else {
    st.asks.push({
      id: st.next++, msg: -1, from: who, kind: 'loan', day: w.day, status: 'yes', cents: n, other: -1,
      due: w.day + 180, owed: n, eventId: ev, place: '', factId: -1, note: 'a loan you offered',
    });
  }
  const b = moveBond(w, st, who, 8, 6, 12, `You lent ${usd(n)} in ${monthName(w.day)}`, ev);
  together(b, w.day, `You lent ${usd(n)}`, ev);
  remember(st, who, w.day, `You lent me ${usd(n)} in ${monthName(w.day)}`, ev, 'lent');
  const role = b.role;
  const line = say(w, who, role, `Thank you for the ${usd(n)} in ${monthName(w.day)}.`, `It keeps the rent and the food in the house.`, `I'll pay it back when the wage allows.`, 'thanks');
  post(w, st, who, role, 'thanks', line, ev, ev);
  return { status: 'accepted', eventId: ev, text: `lent ${usd(n)} to ${P.name(who)}` };
}
function gift(w: World, st: Circle, me: number, actor: string, slot: number, cents: number): CircleResult {
  const hit = resolve(w, st, me, slot, 'friend');
  if ('why' in hit) return { status: 'rejected', why: hit.why };
  const P = econ(w).P;
  const n = Math.round(cents);
  const cause = root(w);
  if (!payThem(w, actor, P.id(hit.who), n, cause)) return { status: 'rejected', why: 'you do not have that in cash' };
  const ev = w.events.emit('circle.gift', `${P.name(me)} gives ${usd(n)} to ${P.name(hit.who)}`, [cause], actor);
  const b = moveBond(w, st, hit.who, 6, 4, 8, `You gave ${usd(n)} in ${monthName(w.day)}`, ev);
  together(b, w.day, `You gave ${usd(n)}`, ev);
  remember(st, hit.who, w.day, `You gave me ${usd(n)} in ${monthName(w.day)}`, ev, 'gift');
  closePromise(st, hit.who);
  const line = say(w, hit.who, b.role, `The ${usd(n)} arrived in ${monthName(w.day)}.`, `I won't treat it as nothing.`, `If you need me, ask.`, 'thanks');
  post(w, st, hit.who, b.role, 'thanks', line, ev, ev);
  return { status: 'accepted', eventId: ev, text: `gave ${usd(n)} to ${P.name(hit.who)}` };
}
function closePromise(st: Circle, who: number): void {
  for (const m of st.mems) if (m.who === who && m.kind === 'promise') m.open = 0;
  for (const a of st.asks) if (a.from === who && a.kind === 'favour' && a.status === 'yes') a.status = 'done';
}
function billOf(w: World, place: string): number {
  return circleBill(w, place);
}
function invite(w: World, st: Circle, me: number, actor: string, slot: number, place: string): CircleResult {
  const raw = place.trim().toLowerCase();
  const named = raw === 'club' || raw === 'gala' || raw === 'festival' || raw === 'drinks' || raw === 'deal' || raw === 'party' || raw === 'birthday' || raw === 'leaving' ? raw : 'dinner';
  const hit = resolve(w, st, me, slot, 'friend');
  if ('why' in hit) return { status: 'rejected', why: hit.why };
  const pending = st.asks.find((a) => a.kind === 'invite' && a.status === 'pending' && a.from === hit.who && (a.place === raw || a.place === named) && ((a.planId ?? -1) >= 0 || (a.socId ?? -1) >= 0));
  if (pending && acceptFuturePlan(w, pending.id)) {
    pending.status = 'yes';
    return { status: 'accepted', eventId: pending.eventId, text: `you will go to the ${pending.place}` };
  }
  const where = raw === 'club' || raw === 'gala' || raw === 'festival' ? raw : 'dinner';
  return host(w, st, me, actor, hit.who, where);
}
function host(w: World, st: Circle, me: number, actor: string, who: number, place: string, row?: Ask): CircleResult {
  const P = econ(w).P;
  const cents = row?.cents || billOf(w, place);
  const cause = row?.eventId ?? root(w);
  const payee = place === 'gala' || place === 'festival' ? GOV : P.id(who);
  if (!payThem(w, actor, payee, cents, cause)) return { status: 'rejected', why: `that ${place} costs ${usd(cents)} and the cash is not there` };
  const ev = w.events.emit('circle.invite', `${P.name(me)} and ${P.name(who)} attend a ${place}, ${usd(cents)}`, [cause], actor);
  if (row) row.status = 'yes';
  const b = moveBond(w, st, who, 7, 4, 6, `You went to a ${place} in ${monthName(w.day)}`, ev, 30);
  together(b, w.day, `A ${place} together`, ev);
  remember(st, who, w.day, `We went to a ${place} in ${monthName(w.day)}`, ev, 'dinner');
  const line = say(w, who, b.role, `The ${place} was worth the ${usd(cents)}.`, `I'm glad you came.`, `We should do it again before the season turns.`, 'dinner');
  post(w, st, who, b.role, 'dinner', line, ev, ev);
  const notable = meetNotable(w, st, me, who, ev);
  const extra = notable ? ` ${econ(w).P.name(notable)} was there.` : '';
  return { status: 'accepted', eventId: ev, text: `attended a ${place} with ${P.name(who)} for ${usd(cents)}.${extra}` };
}
function meetNotable(w: World, st: Circle, me: number, host: number, cause: number): number {
  const P = econ(w).P;
  const firms = econ(w).firms;
  let best = -1;
  const look = contactsOf(w, host);
  for (const c of look) {
    if (c.who === me || !alive(w, c.who) || slotOf(w, st, me, c.who) >= 0) continue;
    const e = P.employer[c.who];
    const chief = e >= 0 && firms[e]?.ceo === c.who;
    const bank = e >= 0 && firms[e]?.good === 'BANKING';
    if (chief || bank) { best = c.who; if (chief) break; }
  }
  if (best < 0) return -1;
  const slot = linkNew(w, st, me, best, 18, 12, 'colleague', P.employer[best] >= 0 && firms[P.employer[best]]?.good === 'BANKING' ? 'banker' : '');
  if (slot < 0) return -1;
  const role = bondOf(st, best)?.role ?? 'colleague';
  const jobLine = firms[P.employer[best]]?.ceo === best ? `I run ${firms[P.employer[best]].name}` : `I work at ${firmName(w, P.employer[best])}`;
  const line = say(w, best, role, `${P.name(host)} introduced us at the table.`, `${jobLine}.`, `Don't expect a friend's trust from one evening.`, 'intro');
  post(w, st, best, role, 'intro', line, cause, cause);
  moveBond(w, st, best, 0, 0, 0, `${P.name(host)} introduced you`, cause);
  return best;
}
function introduce(w: World, st: Circle, me: number, actor: string, slot: number): CircleResult {
  const hit = resolve(w, st, me, slot, 'friend');
  if ('why' in hit) return { status: 'rejected', why: hit.why };
  const other = bestOther(w, st, me, hit.who);
  if (other < 0) return { status: 'rejected', why: 'they have no one new to introduce' };
  return meet(w, st, me, actor, hit.who, other);
}
function bestOther(w: World, st: Circle, me: number, host: number): number {
  let best = -1;
  let trust = -1;
  for (const c of contactsOf(w, host)) {
    if (c.who === me || c.who === host || !alive(w, c.who)) continue;
    if (econ(w).P.age(w, c.who) < 18) continue;
    if (slotOf(w, st, me, c.who) >= 0) continue;
    if (c.trust > trust) { trust = c.trust; best = c.who; }
  }
  return best;
}
function meet(w: World, st: Circle, me: number, actor: string, host: number, other: number, row?: Ask): CircleResult {
  const P = econ(w).P;
  if (!alive(w, other)) return { status: 'rejected', why: 'that person is gone' };
  const cause = row?.eventId ?? root(w);
  const ev = w.events.emit('circle.intro', `${P.name(host)} introduces ${P.name(me)} to ${P.name(other)}`, [cause], actor);
  if (row) row.status = 'yes';
  const slot = linkNew(w, st, me, other, 20, 14, 'colleague', '');
  moveBond(w, st, host, 3, 2, 5, `You asked ${P.name(host)} for an introduction`, ev);
  const b = bondOf(st, other);
  if (b) {
    b.score = Math.min(b.score, 22);
    b.why.push({ day: w.day, delta: 0, text: `${P.name(host)} introduced you. Trust starts lower than a friend`, eventId: ev });
  }
  const line = say(w, other, 'colleague', `${P.name(host)} says you are worth meeting.`, `I'm not sure yet.`, `Write if you want this to become more than a name.`, 'intro');
  post(w, st, other, 'colleague', 'intro', line, ev, ev);
  return { status: 'accepted', eventId: ev, text: `${P.name(host)} introduced ${P.name(other)} (slot ${slot}), with less trust than a friend` };
}

function repay(w: World, st: Circle, me: number): void {
  const P = econ(w).P;
  const wage = Math.max(1, econ(w).wage);
  for (const row of st.asks) {
    if (row.kind !== 'loan' || row.status !== 'yes' || row.owed < 1) continue;
    if (!alive(w, row.from)) { row.status = 'broke'; continue; }
    const id = P.id(row.from);
    const cash = Math.floor(w.ledger.balance(id, DEP));
    const spare = cash - Math.round(wage * 20);
    if (spare > 0) {
      const n = Math.min(row.owed, spare, Math.max(Math.round(wage * 5), Math.ceil(row.owed / 4)));
      if (n > 0 && pay(w, id, P.id(me), n, 'circle.repay', row.eventId)) {
        row.owed -= n;
        const ev = w.events.emit('circle.repay', `${P.name(row.from)} repays ${usd(n)} of the ${monthName(row.day)} loan`, [row.eventId], id);
        if (row.owed <= 0) {
          row.status = 'paid';
          row.owed = 0;
          moveBond(w, st, row.from, 4, 4, 4, `The ${monthName(row.day)} loan was paid back`, ev);
          for (const m of st.mems) if (m.who === row.from && m.kind === 'lent') m.open = 0;
          const role = bondOf(st, row.from)?.role ?? 'friend';
          post(w, st, row.from, role, 'repay', say(w, row.from, role, `That clears the ${monthName(row.day)} loan.`, `${usd(n)} was the last of it.`, `The debt is done between us.`, 'repay'), ev, ev);
        }
      }
    } else if (w.day > row.due) {
      row.status = 'broke';
      const ev = w.events.emit('circle.default', `${P.name(row.from)} does not repay the ${monthName(row.day)} loan of ${usd(row.owed)}`, [row.eventId], id);
      moveBond(w, st, row.from, -6, -14, -10, `The ${monthName(row.day)} loan was not paid back`, ev);
      remember(st, row.from, row.day, `${usd(row.owed)} was the loan`, ev, 'unpaid');
      const role = bondOf(st, row.from)?.role ?? 'friend';
      post(w, st, row.from, role, 'memory', say(w, row.from, role, `I never paid you back for ${monthName(row.day)}.`, `${usd(row.owed)} is still outstanding, and I can't find it.`, `I won't pretend otherwise.`, 'memory'), ev, ev);
      row.owed = 0;
    }
  }
  for (const row of st.asks) {
    if (row.kind !== 'favour' || row.status !== 'yes' || w.day <= row.due) continue;
    if (st.mems.some((m) => m.who === row.from && m.kind === 'promise' && m.open)) {
      row.status = 'broke';
      const ev = w.events.emit('circle.promise', `${P.name(row.from)} says the favour from ${monthName(row.day)} was not returned`, [row.eventId], P.id(row.from));
      moveBond(w, st, row.from, -10, -15, -12, `You broke the promise from ${monthName(row.day)}`, ev);
      for (const m of st.mems) if (m.who === row.from && m.kind === 'promise') m.open = 0;
      const role = bondOf(st, row.from)?.role ?? 'colleague';
      post(w, st, row.from, role, 'memory', say(w, row.from, role, `You never returned the favour from ${monthName(row.day)}.`, `I kept my side.`, `I'll be slower with the next thing you ask.`, 'memory'), ev, ev);
    }
  }
}

function locateOne(w: World, actor: string, playerId: string, instr: string, cause: number): string {
  let lender = '';
  for (const [id, n] of w.ledger.holders(instr)) {
    if (n < 1 || id === actor || id === playerId) continue;
    if (id !== 'fund_mm' && !id.startsWith('p_')) continue;
    lender = id;
    break;
  }
  if (!lender) return '';
  return w.ledger.move(instr, lender, actor, 1, 'mkt.borrow', cause) ? lender : '';
}
function rivalShort(w: World, who: number, playerId: string, instr: string, last: number, cause: number): boolean {
  const id = econ(w).P.id(who);
  let got = borrowShares(w, id, instr, 1, cause);
  let lender = 'fund_mm';
  if (got < 1) {
    lender = locateOne(w, id, playerId, instr, cause);
    if (!lender) return false;
    got = 1;
  }
  const face = got * Math.max(1, Math.round(last));
  const claim = `stkln:${id}:${instr}`;
  let issued = false;
  try {
    if (!w.ledger.instruments.has(claim)) w.ledger.define({ id: claim, kind: 'claim', issuer: id });
    w.ledger.issue(claim, lender, face, 'mkt.borrow', cause);
    issued = true;
    submitOrder(w, id, { instr, side: 'sell', qty: got });
    return true;
  } catch {
    if (issued && w.ledger.balance(lender, claim) >= face) w.ledger.redeem(claim, lender, face, 'mkt.borrow', cause);
    if (lender === 'fund_mm') returnShares(w, id, instr, got, cause);
    else w.ledger.move(instr, id, lender, got, 'mkt.borrow', cause);
    return false;
  }
}
function due(done: number, day: number): boolean { return done < 0 || day - done >= 80; }
function tryHouse(w: World, st: Circle, who: number, cause: number): string {
  const year = Math.floor(w.day / 360);
  const key = `house:${who}:${year}`;
  if (seen(st, key)) return '';
  const nb = neighbourhood(w, playerWho(w));
  if (!nb) return '';
  const P = econ(w).P;
  try {
    for (const home of homeBoard(w, who)) {
      if (home.mine || home.live) continue;
      const pv = parcelView(w, home.id);
      if (!pv || pv.neighbourhood !== nb) continue;
      if (Math.floor(w.ledger.balance(P.id(who), DEP)) < home.price * 0.25) continue;
      const got = bidHome(w, who, home.id, 0, cause);
      if (!got.why) {
        mark(st, key);
        return `I bid for a home in ${nb}.`;
      }
    }
  } catch { /* a bid that does not clear must not stop the week */ }
  return '';
}
function acts(w: World, st: Circle, me: number): number {
  const P = econ(w).P;
  const rival = st.bonds.find((b) => b.role === 'rival' && alive(w, b.who));
  const ally = st.bonds.find((b) => b.stance === 'ally' && alive(w, b.who));
  const held = holdings(w, P.id(me));
  let n = 0;
  if (rival && due(st.rivalDone, w.day)) {
    const h = held[0];
    const cause = root(w);
    let sold = false;
    let ev = -1;
    if (h) {
      ev = w.events.emit('circle.rival', `${P.name(rival.who)} shorts ${shareName(w, h.instr)} against ${P.name(me)}`, [cause], P.id(rival.who));
      sold = rivalShort(w, rival.who, P.id(me), h.instr, h.last, ev);
    }
    const houseWeek = sold || Math.floor(w.day / 7) % 4 === 0;
    const house = houseWeek ? tryHouse(w, st, rival.who, ev >= 0 ? ev : cause) : '';
    if (sold || house) {
      if (ev < 0) ev = w.events.emit('circle.rival', `${P.name(rival.who)} bids a home against ${P.name(me)}`, [cause], P.id(rival.who));
      const name = h ? shareName(w, h.instr) : 'the shares';
      const shares = h && h.qty === 1 ? 'one share' : `${h?.qty ?? 0} shares`;
      const fact = sold ? `I've shorted ${name}.` : house;
      const you = sold ? `You hold ${shares}.` : `It's the same neighbourhood as yours.`;
      const mine = sold ? (house || `I'll cover when it pays me, not before.`) : 'I wanted the ground you walk.';
      post(w, st, rival.who, 'rival', 'rival', say(w, rival.who, 'rival', fact, you, mine, 'rival'), ev, ev);
      moveBond(w, st, rival.who, -4, -6, -4, sold ? `They shorted ${name} against you` : `They bid for a home in your neighbourhood`, ev);
      st.rivalDone = w.day;
      n++;
    }
  }
  if (ally && due(st.allyDone, w.day)) {
    const h = held[0];
    const cause = root(w);
    const cash = Math.floor(w.ledger.balance(P.id(ally.who), DEP));
    let bought = false;
    if (h && cash >= h.last) {
      try { submitOrder(w, P.id(ally.who), { instr: h.instr, side: 'buy', qty: 1 }); bought = true; }
      catch { bought = false; }
    }
    const name = h ? shareName(w, h.instr) : '';
    if (!bought) nudgeStanding(w, me, 2);
    const ev = w.events.emit('circle.ally', `${P.name(ally.who)} ${bought ? 'buys' : 'vouches beside'} ${name || P.name(me)}`, [cause], P.id(ally.who));
    const fact = bought ? `I bought ${name} beside you.` : `I vouched for you where my name still counts.`;
    const you = bought ? `Your holding of ${name} is not alone.` : (name ? `I couldn't take ${name} this week.` : `There was no share of yours on the board.`);
    const mine = bought ? 'Ask if you need the name said out loud.' : `I'll stand again when you ask.`;
    post(w, st, ally.who, 'colleague', 'ally', say(w, ally.who, 'colleague', fact, you, mine, 'ally'), ev, ev);
    moveBond(w, st, ally.who, 5, 4, 8, bought ? `They bought ${name} with you` : 'They vouched for you', ev);
    st.allyDone = w.day;
    n++;
  }
  if (ally && testify(w, st, me, ally.who)) n++;
  return n;
}
function testify(w: World, st: Circle, me: number, ally: number): boolean {
  const law = w.state.law as { cases?: { phase: number; off: number; trialEvent: number; chargeEvent: number; invEvent: number }[]; offences?: { person: number }[] } | undefined;
  if (!law?.cases || !law.offences) return false;
  for (const c of law.cases) {
    if (c.phase >= 3) continue;
    const o = law.offences[c.off];
    if (!o || o.person !== me) continue;
    const cause = c.trialEvent || c.chargeEvent || c.invEvent || root(w);
    if (seen(st, `test:${cause}`)) continue;
    const P = econ(w).P;
    const ev = w.events.emit('circle.testify', `${P.name(ally)} testifies for ${P.name(me)}`, [cause], P.id(ally));
    const wage = econ(w).wage;
    const cash = Math.floor(w.ledger.balance(P.id(ally), DEP));
    const help = Math.min(cash - Math.round(wage * 10), Math.round(wage * 8));
    if (help > 100) pay(w, P.id(ally), P.id(me), help, 'circle.testify', ev);
    const fact = 'I told the court what I know.';
    const you = help > 100 ? `I put ${usd(help)} toward the lawyer.` : 'The record has my account of you.';
    const mine = `I won't pretend I wasn't there.`;
    post(w, st, ally, 'colleague', 'ally', say(w, ally, 'colleague', fact, you, mine, 'ally'), ev, cause);
    moveBond(w, st, ally, 4, 3, 6, 'They testified for you', ev);
    mark(st, `test:${cause}`);
    return true;
  }
  return false;
}

function drift(w: World, st: Circle, me: number): void {
  const P = econ(w).P;
  const mine = employer(w, me);
  const nb = neighbourhood(w, me);
  for (const b of st.bonds) {
    if (!alive(w, b.who) || w.day - b.drift < 28) continue;
    b.drift = w.day;
    const shared = mine >= 0 && employer(w, b.who) === mine;
    const streets = nb && nb === neighbourhood(w, b.who);
    if (w.day - b.touched >= 90) {
      const ev = b.why[b.why.length - 1]?.eventId ?? root(w);
      moveBond(w, st, b.who, -1, -1, 0, `You have not spoken since ${monthName(b.touched)}`, ev, 0, false);
    } else if (shared) {
      moveBond(w, st, b.who, 0, 0, 1, `You still share a desk at ${firmName(w, mine)}`, root(w), 0, false);
    } else if (streets) {
      moveBond(w, st, b.who, 1, 0, 0, `You still live in ${nb}`, root(w), 4, false);
    }
  }
}
function acquaint(w: World, st: Circle, me: number): boolean {
  const living = st.bonds.filter((b) => alive(w, b.who)).length;
  if (living >= 24 || Math.floor(w.day / 7) % 4 !== 0) return false;
  if (seen(st, `acq:${Math.floor(w.day / 7)}`)) return false;
  const mine = employer(w, me);
  const nb = neighbourhood(w, me);
  const P = econ(w).P;
  for (const c of contactsOf(w, me)) {
    if (!alive(w, c.who)) continue;
    for (const o of contactsOf(w, c.who)) {
      if (o.who === me || !alive(w, o.who) || P.age(w, o.who) < 18) continue;
      if (slotOf(w, st, me, o.who) >= 0) continue;
      const job = mine >= 0 && employer(w, o.who) === mine;
      const streets = !!nb && nb === neighbourhood(w, o.who);
      if (!job && !streets) continue;
      const cause = root(w);
      const ev = w.events.emit('circle.meet', `${P.name(me)} and ${P.name(o.who)} become acquainted`, [cause], P.id(o.who));
      linkNew(w, st, me, o.who, 18, 12, 'colleague', '');
      const why = job ? `You both work at ${firmName(w, mine)}` : `You both live in ${nb}`;
      moveBond(w, st, o.who, 0, 0, 0, why, ev, 10);
      const line = say(w, o.who, 'colleague', `${why}.`, `${P.name(c.who)} is how I know your name.`, `I'm not asking for anything yet.`, 'meet');
      post(w, st, o.who, 'colleague', 'meet', line, ev, ev);
      mark(st, `acq:${Math.floor(w.day / 7)}`);
      return true;
    }
  }
  return false;
}
function memories(w: World, st: Circle): boolean {
  for (const m of st.mems) {
    if (!m.open || w.day - m.day < 40) continue;
    if (!alive(w, m.who)) { m.open = 0; continue; }
    if (m.kind !== 'unpaid' && m.kind !== 'refused' && m.kind !== 'promise' && m.kind !== 'dinner' && m.kind !== 'lent') continue;
    if (m.kind === 'lent') continue;
    const key = `mem:${m.who}:${m.eventId}:${m.kind}`;
    if (seen(st, key)) continue;
    const role = bondOf(st, m.who)?.role ?? 'colleague';
    const line = m.kind === 'unpaid'
      ? `I never paid you back for ${monthName(m.day)}.`
      : m.kind === 'refused'
        ? `I asked in ${monthName(m.day)} and you refused.`
        : m.kind === 'promise'
          ? `You still owe me the favour from ${monthName(m.day)}.`
          : `I still think about the dinner in ${monthName(m.day)}.`;
    post(w, st, m.who, role, 'memory', say(w, m.who, role, line, m.text, `I'm still carrying it.`, 'memory'), m.eventId, m.eventId);
    mark(st, key);
    m.open = m.kind === 'dinner' ? 0 : m.open;
    return true;
  }
  return false;
}
function requests(w: World, st: Circle, me: number, budget: number): number {
  if (budget < 1) return 0;
  const P = econ(w).P;
  const wage = Math.max(1, econ(w).wage);
  let n = 0;
  for (const b of st.bonds) {
    if (n >= budget) return n;
    if (!alive(w, b.who) || b.role !== 'family' && b.role !== 'friend') continue;
    if (P.spouse[me] === b.who || P.parent[b.who] === me) continue;
    if (P.employer[b.who] >= 0 || P.jobless[b.who] < 28) continue;
    const key = `loanask:${b.who}:${Math.floor(w.day / 360)}`;
    if (seen(st, key)) continue;
    if (st.asks.some((a) => a.from === b.who && a.kind === 'loan' && (a.status === 'pending' || a.status === 'yes'))) continue;
    const cents = Math.min(Math.round(wage * 30), Math.floor(w.ledger.balance(P.id(me), DEP) * 0.2));
    if (cents < 1000) continue;
    const cause = P.lastEv[b.who] >= 0 ? P.lastEv[b.who] : root(w);
    const heard = `I'll pay it back once a wage starts.`;
    const text = say(w, b.who, b.role, `I lost the job. I have been out ${P.jobless[b.who]} days.`, `I need ${usd(cents)} to cover the gap.`, heard, 'loan');
    askFor(w, st, b.who, b.role, 'loan', text, cause, { cents, owed: cents, note: 'a loan after the job went' });
    mark(st, key);
    n++;
    return n;
  }
  for (const b of st.bonds) {
    if (n >= budget) return n;
    if (b.stance !== 'banker' || !alive(w, b.who)) continue;
    for (const f of recentFacts(w, b.who, 40)) {
      if (f.tag !== 'cb.rate' || seen(st, `rate:${f.id}`)) continue;
      const spread = quoted(w, me);
      const offer = Math.min(Math.round(econ(w).wage * 90), Math.max(1000, Math.floor(w.ledger.balance(P.id(me), DEP))));
      const text = say(w, b.who, 'colleague', plain(w, f.msg), `I can ask the bank for about ${signedPct(spread * 100, 2)}, against the window rate of ${signedPct((spread + 0.008) * 100, 2)}.`, `Say yes and I'll put your name down.`, 'favour');
      askFor(w, st, b.who, 'colleague', 'favour', text, f.eventId, { place: 'rate', cents: offer, factId: f.id, note: plain(w, f.msg) });
      mark(st, `rate:${f.id}`);
      n++;
      return n;
    }
  }
  for (const b of st.bonds) {
    if (n >= budget) return n;
    if (!alive(w, b.who) || (b.role !== 'friend' && b.role !== 'family' && b.role !== 'colleague')) continue;
    for (const f of recentFacts(w, b.who, 50)) {
      if (f.pub || f.drop || knows(w, me, f.id) || seen(st, `tip:${f.id}`)) continue;
      if (f.tag === 'insider.profit' && f.profit >= 0) continue;
      const firm = f.firms.length ? firmName(w, f.firms[0]) : 'a firm';
      const text = say(w, b.who, b.role, `I know something about ${firm} that is not in the paper.`, `A favour later, and I'll tell you.`, `Don't ask me to write it down before you say yes.`, 'favour');
      askFor(w, st, b.who, b.role, 'favour', text, f.eventId, { factId: f.id, note: plain(w, f.msg) });
      mark(st, `tip:${f.id}`);
      n++;
      return n;
    }
  }
  return n;
}
function quoted(w: World, i: number): number {
  const s = econ(w);
  const P = s.P;
  const income = Math.max(1, P.incEma[i]);
  const tenure = P.employer[i] >= 0 ? Math.max(0, Math.floor((w.day - P.born[i]) / DAYS_PER_YEAR) - 18) : 0;
  const owed = (w.state.banking as { owed?: Float64Array } | undefined)?.owed;
  const load = (owed && i < owed.length ? owed[i] : 0) / (income * 360);
  const spread = 0.025 + Math.min(0.08, 0.06 * load) + (tenure < 2 ? 0.02 : tenure < 5 ? 0.01 : 0);
  return s.policyRate + spread + 0.004;
}
function healthWord(n: number): string {
  if (n < 35) return 'poor';
  if (n < 60) return 'shaky';
  if (n < 80) return 'fair';
  return 'sound';
}
function sickName(w: World, code: number): string {
  if (code <= 0) return 'an illness';
  const h = w.state.health as { epi?: number; epiEv?: number } | undefined;
  if (h && h.epi !== undefined && h.epi >= 0 && code === h.epi + 1 && h.epiEv) {
    const msg = w.events.get(h.epiEv)?.msg ?? '';
    const cut = msg.split(/ comes | breaks /)[0]?.trim() ?? '';
    if (cut && cut.length < 40 && !cut.includes(':') && !cut.startsWith('eq') && !/^p_\d+$/.test(cut)) return cut.toLowerCase();
  }
  return 'an illness';
}
function closeRank(b: Bond): number {
  return b.role === 'friend' || b.role === 'family' || b.role === 'mentor' ? 1 : 0;
}
function betterSpeaker(w: World, a: Bond, b: Bond, firm: number): boolean {
  const P = econ(w).P;
  const pa = firm >= 0 && employer(w, a.who) === firm ? P.staffPos[a.who] : -1;
  const pb = firm >= 0 && employer(w, b.who) === firm ? P.staffPos[b.who] : -1;
  if (pa !== pb) return pa > pb;
  const ca = closeRank(a), cb = closeRank(b);
  if (ca !== cb) return ca > cb;
  return a.who < b.who;
}
function pickAt(w: World, st: Circle, firm: number): Bond | undefined {
  let best: Bond | undefined;
  for (const b of st.bonds) {
    if (!alive(w, b.who) || employer(w, b.who) !== firm) continue;
    if (!best || betterSpeaker(w, b, best, firm)) best = b;
  }
  return best;
}
function hired(pos: number, n: number): string {
  if (pos < 0 || n <= 0) return 'out';
  if (pos <= 2) return 'early';
  if (pos >= n - 3) return 'late';
  return 'middle';
}
function pickLine(salt: number, lines: string[]): string {
  const m = Math.abs(salt * 17 + Math.floor(Math.abs(salt) / 3));
  return lines[m % lines.length] ?? lines[0];
}
/** Digit `place` in base 5, so each slot of a letter moves on its own schedule. */
function atLine(salt: number, place: number, lines: string[]): string {
  if (!lines.length) return '';
  let x = Math.abs(Math.trunc(salt));
  for (let i = 0; i < place; i++) x = Math.floor(x / 5);
  return lines[x % lines.length];
}
function youJob(same: boolean, pos: number, n: number, salt: number): string {
  if (!same || pos < 0) return atLine(salt, 2, [
    `You don't work there, though a cut this size still leans on wages in the trade.`,
    `It isn't your job, but the wage in that trade will feel it.`,
    `You're outside it, though pay in the trade still moves when a firm cuts.`,
    `The cut isn't at your firm, but the trade will feel it.`,
  ]);
  const spot = hired(pos, n);
  if (spot === 'early') return atLine(salt, 2, [
    `You were hired early, so a short round of cuts should miss you.`,
    `You're early on the list, so this round shouldn't reach you.`,
    `A cut of this size ought to miss you, since you came in early.`,
    `Coming in early should keep you off this round.`,
  ]);
  if (spot === 'late') return atLine(salt, 2, [
    `You were hired late, so a further cut can reach you.`,
    `You're near the end of the list, so another cut could have your name.`,
    `A further cut can reach you, since you were hired late.`,
    `Your name is near the end, so don't assume you're clear.`,
  ]);
  return atLine(salt, 2, [
    `You're in the middle of the list, so I'll write if a cut has your name.`,
    `A deeper cut could reach you, so I'll say if it does.`,
    `I'll write if a cut has your name, since you're neither first nor last.`,
    `You're mid-list. I'll say if a later cut has your name.`,
  ]);
}
function myJob(pos: number, n: number, salt: number): string {
  const spot = hired(pos, n);
  if (spot === 'out') return atLine(salt, 3, [
    `I'm not on the payroll, so I'll watch who leaves.`,
    `I don't work there, so I'll notice who goes.`,
    `It isn't my job, but I'll watch the door.`,
    `I'll hear who goes. I'm not on the list.`,
  ]);
  if (spot === 'late') return atLine(salt, 3, [
    `I was hired late, so I'm looking before the month closes.`,
    `I'm near the end of the list, so I'm already looking.`,
    `If the cuts go on I expect to be in them, so I'm looking.`,
    `I was hired late, so I'm not waiting it out.`,
  ]);
  if (spot === 'early') return atLine(salt, 3, [
    `I was hired early, so I'm staying unless the cuts grow.`,
    `I'll stay, since coming in early still counts.`,
    `I came in early, so I'm not leaving.`,
    `The early seat is why I'm still here.`,
  ]);
  return atLine(salt, 3, [
    `I'm staying.`,
    `I'll keep the job, and I'll write if that changes.`,
    `I don't plan to leave over this.`,
    `I'm not packing a desk.`,
    `The job is still the one I want.`,
  ]);
}
function cutNews(name: string, n: number, salt: number): string {
  const j = jobs(n);
  return pickLine(salt, [
    `${name} is cutting, with ${j} still on the books.`,
    `After the cuts, ${j} are left at ${name}.`,
    `${name} has let people go, which leaves ${j}.`,
    `They're cutting at ${name}, with ${j} still there.`,
  ]);
}
function layKey(who: number, firm: number): string { return who + ':' + firm; }
function toldJobs(st: Circle, who: number, firm: number): number {
  const v = st.layTold?.[layKey(who, firm)];
  return v === undefined ? -1 : v;
}
function rememberJobs(st: Circle, who: number, firm: number, n: number): void {
  if (!st.layTold) st.layTold = {};
  st.layTold[layKey(who, firm)] = n;
}
function jobMoved(prev: number, now: number): boolean {
  return prev > 0 && Math.abs(now - prev) > prev * 0.2;
}
function cutAgain(name: string, prev: number, now: number, salt: number): string {
  return pickLine(salt, [
    `${name} has gone from ${jobs(prev)} to ${jobs(now)} since I last wrote.`,
    `I last had ${name} at ${jobs(prev)}, which is ${jobs(now)} now.`,
    `The headcount at ${name} moved from ${jobs(prev)} to ${jobs(now)}.`,
  ]);
}
function cutFeel(deeper: boolean, salt: number): string {
  return deeper
    ? pickLine(salt, [
      `That's a deeper cut than the one I told you about.`,
      `Don't keep the old figure, since they've cut further.`,
      `The first letter is out of date.`,
    ])
    : pickLine(salt, [
      `They've taken people back since I wrote.`,
      `The headcount is up since the letter I sent.`,
      `Some of the jobs have come back.`,
    ]);
}
function stake(w: World, me: number, writer: number, firm: { idx: number; name: string; staff: number[] }): { you: string; mine: string; n: number; salt: number } {
  const P = econ(w).P;
  const n = firm.staff.length;
  const same = employer(w, me) === firm.idx;
  const pp = same ? P.staffPos[me] : -1;
  const salt = writer + n * 13 + firm.idx * 5 + w.day;
  return { you: youJob(same, pp, n, salt), mine: myJob(P.staffPos[writer], n, salt + 1), n, salt };
}
function downMove(msg: string): boolean {
  return /-\d/.test(msg) || msg.includes(' down') || msg.includes('fell');
}
function holdsFact(w: World, me: number, f: Fact): boolean {
  const id = econ(w).P.id(me);
  for (const h of holdings(w, id)) {
    if (f.msg.includes(h.instr)) return true;
    if (f.firms.some((i) => econ(w).firms[i]?.id === h.issuer)) return true;
  }
  return false;
}
function worthWriting(w: World, me: number, b: Bond, f: Fact): boolean {
  const mine = employer(w, me);
  const job = employer(w, b.who);
  const aboutMine = mine >= 0 && f.firms.includes(mine);
  const aboutThem = job >= 0 && f.firms.includes(job);
  const held = holdsFact(w, me, f);
  const firm = job >= 0 ? econ(w).firms[job] : undefined;
  if ((f.tag === 'insider.profit' && f.profit < 0 && (aboutThem || aboutMine)) || f.tag === 'firm.cashCrunch' || f.tag === 'firm.default') return true;
  if (f.tag === 'mkt.move' && (aboutThem || held || aboutMine)) {
    const down = downMove(f.msg);
    if (b.role === 'rival' && down && held) return true;
    if (down && (aboutThem || aboutMine)) return true;
    if (!down && b.role === 'mentor' && held) return true;
    return false;
  }
  if (f.tag === 'shock' && aboutThem && firm && shockTouches(f, firm.good)) return true;
  if ((f.tag === 'firm.ceoFired' || f.tag === 'firm.succession') && (aboutThem || aboutMine)) return true;
  if (f.tag === 'law.case' && (aboutThem || aboutMine || f.msg.includes(econ(w).P.name(me)))) return true;
  return false;
}
function preferFact(w: World, me: number, a: Bond, b: Bond, f: Fact): boolean {
  if (f.tag === 'mkt.move' && downMove(f.msg) && holdsFact(w, me, f)) {
    if (a.role === 'rival' && b.role !== 'rival') return true;
    if (b.role === 'rival' && a.role !== 'rival') return false;
  }
  return betterSpeaker(w, a, b, f.firms[0] ?? -1);
}
function ended(s: string): string {
  const t = s.trim();
  if (!t || /[.!?]$/.test(t)) return t;
  return t + '.';
}
function factText(w: World, me: number, b: Bond, f: Fact): string {
  const told = ended(plain(w, f.msg));
  const firmIdx = f.firms[0] ?? employer(w, b.who);
  const firm = firmIdx >= 0 ? econ(w).firms[firmIdx] : undefined;
  const s = firm ? stake(w, me, b.who, firm) : { you: 'It touches what you and I both watch.', mine: `I won't sit on it.`, n: 0 };
  if (f.tag === 'mkt.move' && b.role === 'rival' && downMove(f.msg)) return say(w, b.who, 'rival', told, 'You hold it, so that price is your money.', `I'm glad to see the loss on your book.`, 'gloat');
  if (f.tag === 'mkt.move' && !downMove(f.msg)) return say(w, b.who, b.role, told, 'That holding did the work for you.', 'Keep it if the reason is still there.', 'milestone');
  if (f.tag === 'shock') return say(w, b.who, b.role, `It reaches the firm. ${told}`, s.you, s.mine, 'hint');
  if (f.tag === 'firm.cashCrunch' || f.tag === 'firm.default' || f.tag === 'insider.profit') return say(w, b.who, b.role, `This is not public yet. ${told}`, `If it stands, they'll cut jobs.`, s.mine, 'hint');
  return say(w, b.who, b.role, told, s.you, s.mine, 'hint');
}
function factKind(b: Bond, f: Fact): string {
  if (f.tag === 'mkt.move' && b.role === 'rival' && downMove(f.msg)) return 'gloat';
  if (f.tag === 'mkt.move' && !downMove(f.msg)) return 'milestone';
  return 'hint';
}
function worldLetters(w: World, st: Circle, me: number, budget: number): number {
  let left = budget;
  if (left < 1) return 0;
  const firms = econ(w).firms;
  const P = econ(w).P;
  const idxs = new Set<number>();
  const mine = employer(w, me);
  if (mine >= 0) idxs.add(mine);
  for (const b of st.bonds) {
    const j = employer(w, b.who);
    if (j >= 0) idxs.add(j);
  }
  for (const wave of st.waves) if (w.day - wave.day <= 45) idxs.add(wave.firm);
  for (const idx of idxs) {
    if (left < 1) break;
    const firm = firms[idx];
    if (!firm) continue;
    let ev = firm.layoffEv !== undefined && firm.layoffEv >= 0 ? firm.layoffEv : -1;
    if (ev < 0) for (const wave of st.waves) if (wave.firm === idx && w.day - wave.day <= 45) ev = wave.ev;
    if (ev < 0 || !newsFresh(st, `lay:${ev}`, ev)) continue;
    const speaker = pickAt(w, st, idx);
    if (!speaker) continue;
    const s = stake(w, me, speaker.who, firm);
    const prev = toldJobs(st, speaker.who, idx);
    const moved = jobMoved(prev, s.n);
    if (prev > 0 && !moved) {
      newsTake(st, `lay:${ev}`, ev);
      continue;
    }
    const news = moved ? cutAgain(firm.name, prev, s.n, s.salt) : cutNews(firm.name, s.n, s.salt);
    const you = moved ? cutFeel(s.n < prev, s.salt + 3) : s.you;
    const mine = s.mine;
    const text = say(w, speaker.who, speaker.role, news, you, mine, 'hint');
    post(w, st, speaker.who, speaker.role, 'hint', text, ev, ev);
    if (prev <= 0 || moved) rememberJobs(st, speaker.who, idx, s.n);
    newsTake(st, `lay:${ev}`, ev);
    left--;
  }
  for (const idx of idxs) {
    if (left < 1) break;
    const firm = firms[idx];
    if (!firm || firm.lastProfit >= 0 || firm.profitEv === undefined || firm.profitEv < 0) continue;
    if (!newsFresh(st, `loss:${firm.idx}:${firm.profitEv}`, firm.profitEv)) continue;
    const speaker = pickAt(w, st, idx);
    if (!speaker) continue;
    const s = stake(w, me, speaker.who, firm);
    const you = employer(w, me) === firm.idx
      ? pickLine(s.salt, [
        `Another month like that and the jobs get thinner, yours included.`,
        `If next month looks like this one, your job is in it too.`,
        `I wouldn't count on the headcount holding, and that includes you.`,
      ])
      : pickLine(s.salt, [
        `If they cut, the wage in that trade moves.`,
        `You don't work there, but the trade will feel a cut.`,
        `A loss like that usually lands on wages.`,
      ]);
    const lost = usd(Math.abs(firm.lastProfit));
    const news = pickLine(s.salt + 2, [
      `${firm.name} lost ${lost} last month.`,
      `Last month at ${firm.name} came in ${lost} down.`,
      `${firm.name} closed the month with a loss of ${lost}.`,
    ]);
    const text = say(w, speaker.who, speaker.role, news, you, s.mine, 'hint');
    post(w, st, speaker.who, speaker.role, 'hint', text, firm.profitEv, firm.profitEv);
    newsTake(st, `loss:${firm.idx}:${firm.profitEv}`, firm.profitEv);
    left--;
  }
  const chosen = new Map<number, { b: Bond; f: Fact }>();
  for (const b of st.bonds) {
    if (!alive(w, b.who)) continue;
    for (const f of recentFacts(w, b.who, 45)) {
      if (!worthWriting(w, me, b, f)) continue;
      const cur = chosen.get(f.id);
      if (!cur || preferFact(w, me, b, cur.b, f)) chosen.set(f.id, { b, f });
    }
  }
  const rows = [...chosen.values()].sort((a, c) => a.f.eventId - c.f.eventId || a.b.who - c.b.who);
  for (const row of rows) {
    if (left < 1) break;
    const key = `fact:${row.f.id}`;
    if (!newsFresh(st, key, row.f.eventId)) continue;
    post(w, st, row.b.who, row.b.role, factKind(row.b, row.f), factText(w, me, row.b, row.f), row.f.eventId, row.f.eventId);
    newsTake(st, key, row.f.eventId);
    left--;
  }
  if (left > 0) {
    const rival = st.bonds.find((b) => b.role === 'rival' && alive(w, b.who));
    const heldInstr = new Set(holdings(w, P.id(me)).map((h) => h.instr));
    if (rival && heldInstr.size) {
      for (const ev of w.events.recent(['mkt.move'], 8)) {
        if (left < 1 || ev.day < w.day - 45) continue;
        const instr = ev.msg.split(' ')[0] ?? '';
        if (!heldInstr.has(instr) || !downMove(ev.msg)) continue;
        if (!newsFresh(st, `gloat:${ev.id}`, ev.id)) continue;
        const facts = soc(w)?.facts;
        let fact: Fact | undefined;
        if (facts) for (let i = facts.length - 1; i >= 0 && i >= facts.length - 800; i--) if (facts[i]?.eventId === ev.id) { fact = facts[i]; break; }
        if (fact && !fact.pub && !knows(w, rival.who, fact.id)) continue;
        const text = say(w, rival.who, 'rival', ended(plain(w, ev.msg)), 'You hold it, so that price is your money.', `I'm glad to see the loss on your book.`, 'gloat');
        post(w, st, rival.who, 'rival', 'gloat', text, ev.id, ev.id);
        newsTake(st, `gloat:${ev.id}`, ev.id);
        left--;
        break;
      }
    }
  }
  const now = position(w, me);
  if (st.markWorth < 0 || now > st.markWorth) st.markWorth = now;
  return budget - left;
}

interface Bit { key: string; cause: number; fact: string; you: string; mine: string }
function lifeBits(w: World, me: number, b: Bond): Bit[] {
  const P = econ(w).P;
  const i = b.who;
  const out: Bit[] = [];
  const yearEv = w.events.last('life.year') ?? w.events.last('life.tally') ?? root(w);
  for (const k of b.kin) {
    if (k === me || k < 0 || k >= P.n || P.alive(k)) continue;
    let rel = 'in my family';
    const sp = i >= 0 && i < P.n ? P.spouse[i] : -1;
    if (k === b.spouse) rel = 'my spouse';
    else if (k === P.parent[i] || (sp >= 0 && k === P.parent[sp])) rel = 'my parent';
    else if (P.parent[k] === i || (sp >= 0 && P.parent[k] === sp)) rel = 'my child';
    else if (P.parent[i] >= 0 && P.parent[k] === P.parent[i]) rel = 'my sibling';
    const last = k >= 0 && k < P.n ? P.lastEv[k] : -1;
    const ev = last >= 0 ? w.events.get(last) : undefined;
    const name = k >= 0 && k < P.n ? P.name(k) : 'Someone';
    out.push({
      key: `die:${k}:${i}`, cause: ev?.kind === 'person.died' ? last : yearEv,
      fact: `${name}, ${rel}, has died.`,
      you: `It'll change how I am with you for a while.`,
      mine: `I'll be quieter, and I wanted you to hear it from me.`,
    });
  }
  const sp = P.spouse[i];
  if (sp >= 0 && sp !== b.spouse && sp !== me) {
    out.push({
      key: `wed:${i}:${sp}`, cause: yearEv,
      fact: `I married ${P.name(sp)}.`,
      you: 'You are welcome when the house is ready for guests.',
      mine: 'The money and the evenings are shared now.',
    });
  }
  if (P.nkids[i] > b.kids) {
    const home = childrenHome(w, i);
    out.push({
      key: `born:${i}:${P.nkids[i]}`, cause: yearEv,
      fact: home.n > 1 ? `We had a child. There are ${home.n} children at home.` : (P.nkids[i] === 1 ? 'We had a child, the first.' : 'We had a child.'),
      you: `I'll be harder to reach, and shorter on cash.`,
      mine: `I'm staying home more.`,
    });
  }
  const job = employer(w, i);
  if (P.occ[i] !== b.occ && job >= 0 && job === b.job) {
    const firm = firmName(w, job);
    const last = P.lastEv[i];
    const ev = last >= 0 ? w.events.get(last) : undefined;
    let fact = `I moved up at ${firm}.`;
    let cause = yearEv;
    if (ev?.kind === 'career.promotion') {
      cause = last;
      const m = /promoted from (.+) to (.+) at /.exec(ev.msg);
      fact = m ? `I was promoted from ${m[1]} to ${m[2]} at ${firm}.` : plain(w, ev.msg);
    }
    const same = employer(w, me) === job;
    const pp = same ? P.staffPos[me] : -1;
    out.push({
      key: `promo:${i}:${P.occ[i]}:${Math.floor(w.day / 360)}`, cause,
      fact,
      you: same && pp >= 0 ? youJob(true, pp, econ(w).firms[job]?.staff.length ?? 0, i + w.day) : `It doesn't change your job.`,
      mine: `I'll use the new post while I have it.`,
    });
  }
  if (job !== b.job) {
    const oldName = b.job >= 0 ? firmName(w, b.job) : 'the firm';
    const cause = P.lastEv[i] >= 0 ? P.lastEv[i] : yearEv;
    if (job < 0) {
      out.push({
        key: `job:${i}:out:${Math.floor(w.day / 30)}`, cause,
        fact: `I left ${oldName}.`,
        you: pickLine(i + w.day, [
          `Don't count on the wage I used to bring.`,
          `The old wage is gone, so don't plan on it.`,
          `I can't promise the money I used to send.`,
        ]),
        mine: P.jobless[i] > 0 ? `I've been out of work ${P.jobless[i]} days, and I'm looking.` : `I'm looking before the week is out.`,
      });
    } else {
      const firm = econ(w).firms[job];
      const same = job === employer(w, me);
      out.push({
        key: `job:${i}:${job}:${Math.floor(w.day / 30)}`, cause,
        fact: pickLine(i + job + w.day, [
          `I started at ${firm?.name ?? 'a new firm'}.`,
          `The new job is at ${firm?.name ?? 'a new firm'}.`,
          `I'm at ${firm?.name ?? 'a new firm'} now.`,
        ]),
        you: same
          ? pickLine(i + job, [`We'll be in the same building.`, `You already know the place.`, `I'll see you there.`])
          : pickLine(i + job, [
            `If you need a name inside, I'm there.`,
            `You can use my name there if it helps.`,
            `I'm the person you know on the inside.`,
          ]),
        mine: pickLine(i + job, [`I'll be there tomorrow.`, `The wage starts this week.`, `I've got work again.`]),
      });
    }
  }
  const parcel = parcelOf(w, i);
  if (parcel !== b.parcel) {
    const pv = parcel >= 0 ? parcelView(w, parcel) : undefined;
    const old = b.parcel >= 0 ? parcelView(w, b.parcel) : undefined;
    const nb = pv?.neighbourhood || '';
    const was = old?.neighbourhood || 'the old place';
    const mineNb = neighbourhood(w, me);
    out.push({
      key: `move:${i}:${parcel}`, cause: pv?.eventId ?? yearEv,
      fact: nb ? `I moved to ${nb}.` : `I moved out of ${was}.`,
      you: nb && nb === mineNb ? 'That puts me on your street.' : `I've left ${was}.`,
      mine: 'The old walk is done.',
    });
  }
  if (P.ill[i] > 0 && P.ill[i] !== b.ill) {
    const word = sickName(w, P.ill[i]);
    const book = w.state.health as { epiEv?: number } | undefined;
    const last = P.lastEv[i];
    const ev = last >= 0 ? w.events.get(last) : undefined;
    const cause = ev && (ev.kind.startsWith('health') || ev.kind === 'person.breakdown') ? last : (book?.epiEv || yearEv);
    out.push({
      key: `ill:${i}:${P.ill[i]}:${Math.floor(w.day / 30)}`, cause,
      fact: word === 'an illness' ? `I've fallen ill.` : `I've got ${word}.`,
      you: `Don't expect me at the usual hour.`,
      mine: `I'll write when I can stand.`,
    });
  }
  if (b.health - P.health[i] >= 15) {
    out.push({
      key: `hp:${i}:${Math.floor(w.day / 60)}`, cause: yearEv,
      fact: `My health went from ${healthWord(b.health)} to ${healthWord(P.health[i])}.`,
      you: 'I may be slower to answer.',
      mine: `I'm not pretending it's nothing.`,
    });
  }
  return out;
}
function lifeLetters(w: World, st: Circle, me: number, budget: number): number {
  let posted = 0;
  const P = econ(w).P;
  for (const dead of st.bonds) {
    if (posted >= budget) break;
    if (dead.who === me || dead.who < 0 || dead.who >= P.n || P.alive(dead.who)) continue;
    const key = `diebond:${dead.who}`;
    if (seen(st, key)) continue;
    let writer: Bond | undefined;
    for (const o of st.bonds) {
      if (o.who === dead.who || o.who < 0 || o.who >= P.n || !P.alive(o.who)) continue;
      const fam = o.role === 'family' || o.role === 'mentor' ? 1 : 0;
      const prev = writer && (writer.role === 'family' || writer.role === 'mentor') ? 1 : 0;
      if (!writer || fam > prev || (fam === prev && o.score > writer.score)) writer = o;
    }
    if (!writer) continue;
    const last = P.lastEv[dead.who];
    const ev = last >= 0 ? w.events.get(last) : undefined;
    const cause = ev?.kind === 'person.died' ? last : (w.events.last('life.year') ?? root(w));
    post(w, st, writer.who, writer.role, 'life', say(w, writer.who, writer.role, `${P.name(dead.who)} has died.`, 'You knew them too.', `I'll be quieter for a while.`, 'life'), cause, cause);
    mark(st, key);
    posted++;
  }
  for (const b of st.bonds) {
    if (posted >= budget) break;
    if (!alive(w, b.who) || b.who === me) continue;
    if (!b.watched || !b.kin) { snap(w, b); continue; }
    const bits = lifeBits(w, me, b);
    let pending = false;
    for (const bit of bits) {
      if (seen(st, bit.key)) continue;
      if (posted >= budget) { pending = true; break; }
      post(w, st, b.who, b.role, 'life', say(w, b.who, b.role, bit.fact, bit.you, bit.mine, 'life'), bit.cause, bit.cause);
      mark(st, bit.key);
      posted++;
    }
    if (!pending) snap(w, b);
  }
  return posted;
}
function inviteFrom(w: World, st: Circle, me: number): boolean {
  for (const a of st.asks) {
    if (a.kind === 'invite' && a.status === 'pending' && w.day > a.due) {
      a.status = 'lapsed';
      if ((a.planId ?? -1) >= 0 || (a.socId ?? -1) >= 0) continue;
      moveBond(w, st, a.from, -2, -1, 0, `You let the ${a.place || 'invitation'} in ${monthName(a.day)} pass`, a.eventId, 0, false);
    }
  }
  return false;
}
function jobsIn(text: string): number {
  const m = /([\d,]+) jobs?\b/.exec(text);
  if (!m) return -1;
  return Number(m[1].replace(/,/g, ''));
}
function followUp(w: World, st: Circle, me: number): boolean {
  const P = econ(w).P;
  for (let i = st.letters.length - 1; i >= 0; i--) {
    const l = st.letters[i];
    const age = w.day - l.day;
    if (age < 21 || age > 120) continue;
    if (l.kind !== 'hint' && l.kind !== 'rival' && l.kind !== 'intro' && l.kind !== 'gloat') continue;
    const ev = l.source >= 0 ? w.events.get(l.source) : undefined;
    const srcKey = `fu2:${l.source}`;
    if (l.kind === 'hint' && ev && (ev.kind === 'firm.layoffs' || ev.kind === 'firm.profit' || ev.kind === 'mkt.move') && !seen(st, srcKey)) {
      const job = employer(w, l.from);
      const firm = job >= 0 ? econ(w).firms[job] : undefined;
      if (firm) {
        let other: Bond | undefined;
        for (const b of st.bonds) {
          if (b.who === l.from || !alive(w, b.who) || employer(w, b.who) !== job) continue;
          if (!other || betterSpeaker(w, b, other, job)) other = b;
        }
        if (other) {
          const s = stake(w, me, other.who, firm);
          const prev = ev.kind === 'firm.layoffs' ? toldJobs(st, other.who, firm.idx) : -1;
          const moved = ev.kind === 'firm.layoffs' && jobMoved(prev, s.n);
          // A loss or a price with no new figure is not a letter. An unchanged headcount is not one either.
          if (!(ev.kind === 'firm.layoffs' && (moved || prev <= 0))) {
            mark(st, srcKey);
            continue;
          }
          const news = moved
            ? cutAgain(firm.name, prev, s.n, s.salt)
            : pickLine(s.salt, [
              `I count ${jobs(s.n)} still at ${firm.name}.`,
              `${firm.name} still has ${jobs(s.n)} from where I sit.`,
              `The books at ${firm.name} show ${jobs(s.n)}.`,
            ]);
          const you = moved ? cutFeel(s.n < prev, s.salt + 3) : s.you;
          const text = say(w, other.who, other.role, news, you, s.mine, 'follow');
          post(w, st, other.who, other.role, 'follow', text, l.source, l.source);
          if (ev.kind === 'firm.layoffs' && (prev <= 0 || moved)) rememberJobs(st, other.who, firm.idx, s.n);
          mark(st, srcKey);
          return true;
        }
      }
    }
    if (seen(st, `fu:${l.id}`) || !alive(w, l.from)) continue;
    const role = bondOf(st, l.from)?.role ?? l.role;
    let fact = '';
    let you = '';
    let mine = '';
    if (l.kind === 'rival') {
      const held = holdings(w, P.id(me));
      const name = held[0] ? shareName(w, held[0].instr) : 'the shares';
      fact = `The short on ${name} is still open.`;
      you = held[0] ? `You still hold ${held[0].qty === 1 ? 'one share' : held[0].qty + ' shares'}.` : `You're out of that name now.`;
      mine = `I haven't covered it.`;
    } else if (l.kind === 'intro') {
      fact = `We were introduced, and I haven't heard a word since.`;
      you = 'A note from you would tell me whether to keep writing.';
      mine = `I won't chase you.`;
    } else {
      const job = employer(w, l.from);
      const firm = job >= 0 ? econ(w).firms[job] : undefined;
      if (!firm) {
        mark(st, `fu:${l.id}`);
        continue;
      }
      if (ev?.kind === 'firm.layoffs') {
        const books = ev.actor ? econ(w).firms.find((f) => f.id === ev.actor) ?? firm : firm;
        const told = toldJobs(st, l.from, books.idx);
        const fromLetter = jobsIn(l.text);
        const prev = told > 0 ? told : fromLetter;
        const now = books.staff.length;
        if (jobMoved(prev, now)) {
          const s = stake(w, me, l.from, books);
          fact = cutAgain(books.name, prev, now, s.salt);
          you = cutFeel(now < prev, s.salt + 3);
          rememberJobs(st, l.from, books.idx, now);
          mine = s.mine;
        }
      }
      if (!fact) {
        mark(st, `fu:${l.id}`);
        continue;
      }
    }
    post(w, st, l.from, role, 'follow', say(w, l.from, role, fact, you, mine, 'follow'), l.source, l.source);
    mark(st, `fu:${l.id}`);
    return true;
  }
  for (const row of st.asks) {
    if (row.kind !== 'loan' || row.status !== 'yes' || row.owed < 1 || w.day - row.day < 21) continue;
    const key = `fu:loan:${row.id}`;
    if (seen(st, key) || !alive(w, row.from)) continue;
    const role = bondOf(st, row.from)?.role ?? 'friend';
    const text = say(w, row.from, role, `The ${monthName(row.day)} loan still has ${usd(row.owed)} open.`, `I haven't forgotten the amount.`, `I'll pay when the wage allows, and not before.`, 'follow');
    post(w, st, row.from, role, 'follow', text, row.eventId, row.eventId);
    mark(st, key);
    return true;
  }
  return false;
}
function birthday(w: World, st: Circle, me: number): boolean {
  const P = econ(w).P;
  const today = ((w.day % 360) + 360) % 360;
  const year = Math.floor(w.day / 360);
  let best: Bond | undefined;
  let score = -1;
  for (const b of st.bonds) {
    if (!alive(w, b.who) || b.who === me || P.age(w, b.who) < 18) continue;
    const born = ((P.born[b.who] % 360) + 360) % 360;
    let ago = today - born;
    if (ago < 0) ago += 360;
    if (ago > 6 || seen(st, `bday:${b.who}:${year}`)) continue;
    if (!best || b.score > score || (b.score === score && b.who < best.who)) { best = b; score = b.score; }
  }
  if (!best) return false;
  const cause = w.events.last('life.year') ?? (P.lastEv[best.who] >= 0 ? P.lastEv[best.who] : root(w));
  const bsalt = best.who * 13 + year * 7;
  const note = atLine(bsalt, 1, [
    `A note is enough, and I'm not asking for a gift.`,
    `Don't send anything. A line back is plenty.`,
    `I'm not collecting presents, just marking the day.`,
    `No present. A line is the whole wish.`,
  ]);
  post(w, st, best.who, best.role, 'life', say(w, best.who, best.role, `I turned ${P.age(w, best.who)}.`, note, '', 'life'), cause, cause);
  mark(st, `bday:${best.who}:${year}`);
  return true;
}
/** One letter when the length of a layoff is itself the news. A week with nothing new sends nothing. */
function checkIn(w: World, st: Circle, me: number): boolean {
  const P = econ(w).P;
  const wk = Math.floor(w.day / 7);
  if (seen(st, `outweek:${wk}`)) return false;
  const wrote = new Set<number>();
  for (const l of st.letters) if (l.day === w.day) wrote.add(l.from);
  const bucket = Math.floor(w.day / 60);
  let best: Bond | undefined;
  let touch = Infinity;
  for (const b of st.bonds) {
    if (!alive(w, b.who) || b.who === me || wrote.has(b.who)) continue;
    if (employer(w, b.who) >= 0 || P.jobless[b.who] < 21) continue;
    if (seen(st, `out:${b.who}:${bucket}`)) continue;
    if (!best || b.touched < touch || (b.touched === touch && b.who < best.who)) { best = b; touch = b.touched; }
  }
  if (!best) return false;
  const days = P.jobless[best.who];
  const salt = best.who + bucket;
  const fact = `I've been out of work ${days} days.`;
  const you = pickLine(salt, [
    `I'm not asking you to find me a desk.`,
    `Don't rearrange your week for it.`,
    `This isn't a request.`,
  ]);
  const mine = pickLine(salt + 3, [
    `I'll take the next job that will have me.`,
    `I'm still looking.`,
    `The next yes is the one I want.`,
  ]);
  const cause = P.lastEv[best.who] >= 0 ? P.lastEv[best.who] : (best.why[best.why.length - 1]?.eventId ?? root(w));
  post(w, st, best.who, best.role, 'note', say(w, best.who, best.role, fact, you, mine, 'note'), cause, cause);
  mark(st, `out:${best.who}:${bucket}`);
  mark(st, `outweek:${wk}`);
  return true;
}
function milestones(w: World, st: Circle, me: number, budget: number): number {
  if (budget < 1) return 0;
  const mentor = st.bonds.find((b) => b.role === 'mentor' && alive(w, b.who));
  if (!mentor) return 0;
  let n = 0;
  const year = Math.floor((w.day - (st.openDay ?? 0)) / 360);
  if (year >= 1 && st.mileYear !== year) {
    const worth = position(w, me);
    const cause = w.events.last('life.year') ?? root(w);
    const text = say(w, mentor.who, 'mentor', 'A year has closed.', `Cash and the book stand at ${usd(worth)}.`, `I'm proud of the way you kept at it.`, 'milestone');
    post(w, st, mentor.who, 'mentor', 'milestone', text, cause, cause);
    moveBond(w, st, mentor.who, 2, 1, 2, 'They marked the year with you', cause);
    st.mileYear = year;
    n++;
    if (n >= budget) return n;
  }
  if (!st.mileWorth && st.openWorth > 0 && position(w, me) >= st.openWorth * 2) {
    const text = say(w, mentor.who, 'mentor', `You've doubled what you arrived with.`, `That's a real mark.`, `Don't give it back to the market in a hurry.`, 'milestone');
    post(w, st, mentor.who, 'mentor', 'milestone', text, root(w), root(w));
    st.mileWorth = 1;
    n++;
    if (n >= budget) return n;
  }
  if (!st.mileHome && Math.floor(w.day / 7) % 8 === 0) {
    const owned = homeBoard(w, me).find((h) => h.mine);
    if (owned) {
      const pv = parcelView(w, owned.id);
      const cause = pv?.eventId ?? root(w);
      const text = say(w, mentor.who, 'mentor', `A home in ${owned.neighbourhood}.`, 'I heard, and I hoped for that.', 'Keep the roof before you keep a bet on the market.', 'milestone');
      post(w, st, mentor.who, 'mentor', 'milestone', text, cause, cause);
      st.mileHome = 1;
      n++;
    }
  }
  return n;
}
function relink(w: World, st: Circle, me: number): void {
  for (const b of st.bonds) {
    if (!alive(w, b.who)) continue;
    if (slotOf(w, st, me, b.who) >= 0) continue;
    linkNew(w, st, me, b.who, 24, Math.min(40, b.score), b.role, b.stance);
  }
}
function capOf(n: number): number {
  if (n <= 6) return 2;
  if (n <= 12) return 3;
  if (n <= 18) return 4;
  if (n <= 24) return 5;
  return 6;
}
function noteLayoffs(w: World, st: Circle, me: number): void {
  if (!st.waves) st.waves = [];
  const firms = econ(w).firms;
  const seenFirm = new Set<number>();
  const look = (i: number): void => {
    if (i < 0 || seenFirm.has(i)) return;
    seenFirm.add(i);
    const f = firms[i];
    if (!f || f.layoffEv === undefined || f.layoffEv < 0) return;
    if (st.waves.some((x) => x.ev === f.layoffEv)) return;
    st.waves.push({ firm: i, ev: f.layoffEv, day: w.day });
  };
  look(employer(w, me));
  for (const b of st.bonds) look(employer(w, b.who));
  if (st.waves.length > 24) st.waves.splice(0, st.waves.length - 24);
}
function week(w: World, st: Circle, me: number): void {
  if (w.day % 7 !== 6) return;
  cast(w, st, me);
  relink(w, st, me);
  drift(w, st, me);
  const nAlive = st.bonds.reduce((n, b) => n + (alive(w, b.who) ? 1 : 0), 0);
  if (nAlive < 1) return;
  const cap = capOf(nAlive);
  let used = 0;
  const room = (): number => cap - used;
  used += acts(w, st, me);
  if (room() > 0) used += lifeLetters(w, st, me, Math.min(2, room()));
  if (room() > 0) used += worldLetters(w, st, me, room());
  if (room() > 0 && inviteFrom(w, st, me)) used++;
  if (room() > 0 && followUp(w, st, me)) used++;
  if (room() > 0 && birthday(w, st, me)) used++;
  if (room() > 0 && acquaint(w, st, me)) used++;
  if (room() > 0) used += milestones(w, st, me, room());
  if (room() > 0) used += requests(w, st, me, Math.min(1, room()));
  let guard = 0;
  while (room() > 0 && guard < 8) {
    if (checkIn(w, st, me)) { used++; guard++; continue; }
    if (memories(w, st)) { used++; guard++; continue; }
    break;
  }
  kinSick(w, st, me);
}
function kinRel(w: World, b: Bond, k: number): string {
  const P = econ(w).P;
  const i = b.who;
  const sp = i >= 0 && i < P.n ? P.spouse[i] : -1;
  if (k === b.spouse || k === sp) return 'my spouse';
  if (k === P.parent[i] || (sp >= 0 && k === P.parent[sp])) return 'my parent';
  if (P.parent[k] === i || (sp >= 0 && P.parent[k] === sp)) return 'my child';
  if (P.parent[i] >= 0 && P.parent[k] === P.parent[i]) return 'my sibling';
  return 'in my family';
}
function readKinIll(raw: string | undefined): Map<number, number> {
  const m = new Map<number, number>();
  if (!raw) return m;
  for (const part of raw.split(';')) {
    const bits = part.split(':');
    if (bits[0]) m.set(+bits[0], +(bits[1] ?? 0));
  }
  return m;
}
function writeKinIll(m: Map<number, number>): string {
  const bits: string[] = [];
  for (const [k, c] of m) bits.push(`${k}:${c}`);
  return bits.join(';');
}
/** A contact writes when someone in their family falls ill. The letter does not move the bond or the event log. */
function kinSick(w: World, st: Circle, me: number): void {
  const P = econ(w).P;
  const yearEv = w.events.last('life.year') ?? w.events.last('life.tally') ?? root(w);
  for (const b of st.bonds) {
    if (!alive(w, b.who) || b.who === me) continue;
    const kin = b.kin?.length ? b.kin : kinOf(w, b.who);
    const told = readKinIll(b.kinIll);
    let changed = false;
    for (const k of kin) {
      if (k === me || k < 0 || k >= P.n || !P.alive(k)) continue;
      const code = P.ill[k];
      const prev = told.get(k) ?? 0;
      if (code === prev) continue;
      told.set(k, code);
      changed = true;
      if (code <= 0) continue;
      const last = P.lastEv[k];
      const ev = last >= 0 ? w.events.get(last) : undefined;
      const book = w.state.health as { epiEv?: number } | undefined;
      const cause = ev && (ev.kind.startsWith('health') || ev.kind === 'person.breakdown') ? last : (book?.epiEv || yearEv);
      const word = sickName(w, code);
      const fact = word === 'an illness' ? `${P.name(k)}, ${kinRel(w, b, k)}, has fallen ill.` : `${P.name(k)}, ${kinRel(w, b, k)}, has ${word}.`;
      const salt = b.who + k + w.day;
      const you = pickLine(salt, [
        `I wanted you to hear it from me, not from the street.`,
        `I'd rather you heard this from me.`,
        `Don't wait to hear it from someone else.`,
      ]);
      const mine = pickLine(salt + 1, [
        `I'll be with them more than at work.`,
        `Work can wait. I'll be at the house.`,
        `I'm going to spend the time with them.`,
      ]);
      // No new event and no touch. A fresh event id shifts later ones, and the papers
      // decide who trades on a rumour from that id. The letter hangs off the illness itself.
      postQuiet(w, st, b.who, b.role, 'life', say(w, b.who, b.role, fact, you, mine, 'life'), cause);
    }
    if (changed) b.kinIll = writeKinIll(told);
  }
}

function mailLines(w: World, st: Circle, me: number): string[] {
  cast(w, st, me);
  const P = econ(w).P;
  const lines: string[] = [`inbox ${st.letters.length}`];
  const by = new Map<number, Letter[]>();
  for (const l of st.letters) {
    const list = by.get(l.from) ?? [];
    list.push(l);
    by.set(l.from, list);
  }
  for (const [who, list] of by) {
    const b = bondOf(st, who);
    lines.push(`thread ${P.name(who)} (${b?.role ?? 'colleague'}${b?.stance ? ' ' + b.stance : ''}) ${wordOf(b?.score ?? 0)} ${b?.score ?? 0}`);
    for (const l of list) lines.push(`  [${l.day}] #${l.id} event ${l.eventId} <- ${l.source}: ${l.text}`);
  }
  for (const a of st.asks) {
    if (a.status !== 'pending') continue;
    const silence = a.kind === 'invite' ? ' silence is a no' : '';
    lines.push(`pending #${a.msg} ${a.kind} due day ${a.due}${silence} from ${P.name(a.from)}: ${actions(a).join(' | ')}`);
  }
  if (lines.length === 1) lines.push('(no letters yet)');
  return lines;
}

export interface CirclePersonView {
  role: string;
  stance: string;
  bond: { word: string; score: number; why: Why[] };
  together: Note[];
  thread: { id: number; day: number; text: string; eventId: number; source: number }[];
}
export function circlePerson(w: World, index: number): CirclePersonView | null {
  const st = w.state.circle as Circle | undefined;
  const me = playerWho(w);
  if (!st || me < 0 || index < 0 || index === me) return null;
  const b = bondOf(st, index);
  const thread = st.letters.filter((l) => l.from === index).map((l) => ({ id: l.id, day: l.day, text: l.text, eventId: l.eventId, source: l.source }));
  if (!b && !thread.length) return null;
  return {
    role: b?.role ?? 'colleague',
    stance: b?.stance ?? '',
    bond: { word: wordOf(b?.score ?? 0), score: b?.score ?? 0, why: b?.why ?? [] },
    together: b?.together ?? [],
    thread,
  };
}
export interface CircleBoard {
  inbox: {
    threads: { who: number; name: string; role: string; stance: string; messages: { id: number; day: number; text: string; eventId: number; source: number; requestId: number }[] }[];
    pending: { id: number; msg: number; from: number; name: string; role: string; kind: string; day: number; status: string; cents: number; place: string; other: number; otherName: string; eventId: number; note: string; due: number; deadline: number; daysLeft: number; default: string; actions: string[] }[];
  };
  people: Record<number, { role: string; stance: string; bond: { word: string; score: number; why: Why[] }; together: Note[] }>;
  added: { slot: number; who: number; name: string; role: string; stance: string; word: string; score: number; why: Why[]; together: Note[] }[];
}
export function circleBoard(w: World): CircleBoard {
  const st = w.state.circle as Circle | undefined;
  const empty: CircleBoard = { inbox: { threads: [], pending: [] }, people: {}, added: [] };
  if (!st) return empty;
  const P = econ(w).P;
  const me = playerWho(w);
  const people: CircleBoard['people'] = {};
  for (const b of st.bonds) {
    people[b.who] = { role: b.role, stance: b.stance, bond: { word: wordOf(b.score), score: b.score, why: b.why }, together: b.together };
  }
  const threads: CircleBoard['inbox']['threads'] = [];
  const grouped = new Map<number, Letter[]>();
  for (const l of st.letters) {
    const list = grouped.get(l.from) ?? [];
    list.push(l);
    grouped.set(l.from, list);
  }
  for (const [who, list] of grouped) {
    const b = bondOf(st, who);
    threads.push({
      who, name: who >= 0 && who < P.n ? P.name(who) : '', role: b?.role ?? 'colleague', stance: b?.stance ?? '',
      messages: list.map((l) => ({ id: l.id, day: l.day, text: l.text, eventId: l.eventId, source: l.source, requestId: l.req })),
    });
  }
  threads.sort((a, b) => (b.messages[b.messages.length - 1]?.day ?? 0) - (a.messages[a.messages.length - 1]?.day ?? 0));
  const pending = st.asks.filter((a) => a.status === 'pending').map((a) => ({
    id: a.id, msg: a.msg, from: a.from, name: a.from >= 0 && a.from < P.n ? P.name(a.from) : '',
    role: bondOf(st, a.from)?.role ?? 'colleague', kind: a.kind, day: a.day, status: a.status, cents: a.cents,
    place: a.place, other: a.other, otherName: a.other >= 0 && a.other < P.n ? P.name(a.other) : '',
    eventId: a.eventId, note: a.note, actions: actions(a),
    due: a.due, deadline: a.due, daysLeft: Math.max(0, a.due - w.day),
    default: a.kind === 'invite' ? 'no' : '',
  }));
  const known = new Set<number>();
  if (me >= 0) for (const c of contactsOf(w, me)) known.add(c.who);
  const added = st.extras.filter((e) => !known.has(e.who)).map((e) => {
    const b = bondOf(st, e.who);
    return {
      slot: e.slot, who: e.who, name: e.who >= 0 && e.who < P.n ? P.name(e.who) : '',
      role: b?.role ?? 'colleague', stance: b?.stance ?? '', word: wordOf(b?.score ?? e.friend), score: b?.score ?? e.friend,
      why: b?.why ?? [], together: b?.together ?? [],
    };
  });
  return { inbox: { threads, pending }, people, added };
}

export const circle: Module = {
  id: 'circle',
  init(w) { w.state.circle = blank(); },
  dayClose(w) {
    settlePaper(w);
    const me = playerWho(w);
    if (me < 0) return;
    const st = box(w);
    noteLayoffs(w, st, me);
    if ((w.day + 1) % 30 === 0) repay(w, st, me);
    cast(w, st, me);
    tendCirclePlans(w);
    week(w, st, me);
  },
  monthEnd(w) { settlePaper(w); },
  stats(w) {
    const st = box(w);
    const friends = st.bonds.filter((b) => b.role === 'friend' || b.score >= 55).length;
    const rivals = st.bonds.some((b) => b.role === 'rival') ? 1 : 0;
    const out = { letters: st.yMsg, requests: st.yReq, friends, rivals, plans: st.yPlans };
    st.yMsg = 0;
    st.yReq = 0;
    st.yPlans = 0;
    return out;
  },
};
