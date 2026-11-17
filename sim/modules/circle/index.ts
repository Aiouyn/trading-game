// The player's circle: friends, family, rivals, mentors and colleagues who write about
// real events, ask for things, and remember what the player did. Only those people
// and their contacts are visited. The rest of the city is left alone.
import { DAYS_PER_YEAR, type Module, type World } from '../../kernel/index.ts';
import { borrowMargin } from '../banking/index.ts';
import { DEP, GOV, pay, type EconState } from '../economy/index.ts';
import { borrowShares, returnShares, submitOrder } from '../markets/index.ts';
import { bidHome, homeBoard, parcelView } from '../property/index.ts';
import { contactsOf, knows, nudgeStanding } from '../social/index.ts';

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
  openWorth: number;
  markWorth: number;
  rivalDone: number;
  allyDone: number;
  testified: number;
  mileYear: number;
  mileHome: number;
  mileWorth: number;
  nextExtra: number;
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
  if (st?.letters) return st;
  const fresh = blank();
  w.state.circle = fresh;
  return fresh;
}
function blank(): Circle {
  return {
    next: 1, letters: [], asks: [], bonds: [], extras: [], mems: [], sent: [], cast: 0,
    yMsg: 0, yReq: 0, openWorth: -1, markWorth: -1, rivalDone: 0, allyDone: 0, testified: 0,
    mileYear: -1, mileHome: 0, mileWorth: 0, nextExtra: DEG,
  };
}
function clamp(n: number, lo: number, hi: number): number { return n < lo ? lo : n > hi ? hi : n; }
function usd(cents: number): string {
  const n = Math.round(cents);
  return `${n < 0 ? '-' : ''}$${(Math.abs(n) / 100).toFixed(2)}`;
}
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
function mark(st: Circle, key: string): void { st.sent.push(key); }
function bondOf(st: Circle, who: number): Bond | undefined {
  for (const b of st.bonds) if (b.who === who) return b;
  return undefined;
}
function voice(w: World, i: number, role: string): string {
  const P = econ(w).P;
  if (role === 'rival') return P.greed[i] >= 50 ? 'sharp' : 'cold';
  if (P.anxiety[i] >= 67) return 'anxious';
  if (P.kin[i] >= 67) return 'warm';
  if (P.greed[i] >= 67) return 'sharp';
  if (P.diligence[i] >= 67) return 'exact';
  return 'plain';
}
function dress(v: string, body: string): string {
  if (v === 'warm') return `I keep thinking of you. ${body}`;
  if (v === 'sharp') return `Let us be plain about the money. ${body}`;
  if (v === 'anxious') return `I cannot sit on this. ${body}`;
  if (v === 'cold') return body;
  return body;
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
  b = { who, role: role || 'colleague', stance, score, touched: w.day, drift: w.day, why: [{ day: w.day, delta: 0, text: how, eventId: cause }], together: [] };
  st.bonds.push(b);
  return b;
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
  const ev = w.events.emit('circle.letter', text, [cause >= 0 ? cause : root(w)], P.id(from));
  const letter: Letter = { id: st.next++, day: w.day, from, role, kind, text, eventId: ev, source: source >= 0 ? source : ev, req };
  st.letters.push(letter);
  while (st.letters.length > 360) {
    const old = st.letters[0];
    if (st.asks.some((a) => a.msg === old.id && a.status === 'pending')) break;
    st.letters.shift();
  }
  st.yMsg++;
  const b = bondOf(st, from);
  if (b) b.touched = w.day;
  return letter;
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
  b.why.push({ day: w.day, delta: 0, text: 'A new seat, and less trust than an old friend', eventId: root(w) });
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
  const P = econ(w).P;
  const ev = w.events.emit('circle.refuse', `${P.name(me)} refuses ${P.name(row.from)}`, [letter.eventId], P.id(me));
  moveBond(w, st, row.from, -10, -12, -8, `You refused ${row.kind} on ${monthName(w.day)}`, ev);
  remember(st, row.from, w.day, `You refused me in ${monthName(w.day)}`, ev, 'refused');
  const b = bondOf(st, row.from);
  const line = dress(voice(w, row.from, b?.role ?? 'colleague'), `You refused. I will remember ${monthName(w.day)}.`);
  post(w, st, row.from, b?.role ?? 'colleague', 'memory', line, ev, ev);
  return { status: 'accepted', eventId: ev, text: `${P.name(row.from)} will remember the refusal` };
}
function accept(w: World, st: Circle, me: number, actor: string, row: Ask, letter: Letter): CircleResult {
  const P = econ(w).P;
  if (row.kind === 'loan') return lendTo(w, st, me, actor, row.from, row.cents, row);
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
    const rate = book.rate > 0 ? `${(book.rate * 100).toFixed(2)}%` : 'nothing';
    const text = book.taken > 0 ? `${P.name(row.from)} spoke for you. The bank lent ${usd(book.taken)} at ${rate}` : `${P.name(row.from)} spoke for you. The bank did not lend: ${book.why ?? 'no room'}`;
    return { status: 'accepted', eventId: book.taken > 0 ? (w.events.last('loan.grant') ?? ev) : ev, text };
  }
  const line = dress(voice(w, row.from, 'colleague'), `This is not in the paper. ${told} You owe me a favour.`);
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
  const line = dress(voice(w, who, role), `Thank you for the ${usd(n)} in ${monthName(w.day)}. I will pay it back.`);
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
  const line = dress(voice(w, hit.who, b.role), `The ${usd(n)} arrived. I will not forget ${monthName(w.day)}.`);
  post(w, st, hit.who, b.role, 'thanks', line, ev, ev);
  return { status: 'accepted', eventId: ev, text: `gave ${usd(n)} to ${P.name(hit.who)}` };
}
function closePromise(st: Circle, who: number): void {
  for (const m of st.mems) if (m.who === who && m.kind === 'promise') m.open = 0;
  for (const a of st.asks) if (a.from === who && a.kind === 'favour' && a.status === 'yes') a.status = 'done';
}
function billOf(w: World, place: string): number {
  const wage = econ(w).wage;
  if (place === 'gala') return Math.max(100, Math.round(wage * 40));
  if (place === 'club') return Math.max(100, Math.round(wage * 15));
  return Math.max(100, Math.round(wage * 6));
}
function invite(w: World, st: Circle, me: number, actor: string, slot: number, place: string): CircleResult {
  const where = place === 'club' || place === 'gala' ? place : 'dinner';
  const hit = resolve(w, st, me, slot, 'friend');
  if ('why' in hit) return { status: 'rejected', why: hit.why };
  return host(w, st, me, actor, hit.who, where);
}
function host(w: World, st: Circle, me: number, actor: string, who: number, place: string, row?: Ask): CircleResult {
  const P = econ(w).P;
  const cents = row?.cents || billOf(w, place);
  const cause = row?.eventId ?? root(w);
  const payee = place === 'gala' ? GOV : P.id(who);
  if (!payThem(w, actor, payee, cents, cause)) return { status: 'rejected', why: `that ${place} costs ${usd(cents)} and the cash is not there` };
  const ev = w.events.emit('circle.invite', `${P.name(me)} and ${P.name(who)} attend a ${place}, ${usd(cents)}`, [cause], actor);
  if (row) row.status = 'yes';
  const b = moveBond(w, st, who, 7, 4, 6, `You went to a ${place} in ${monthName(w.day)}`, ev, 30);
  together(b, w.day, `A ${place} together`, ev);
  remember(st, who, w.day, `We went to a ${place} in ${monthName(w.day)}`, ev, 'dinner');
  const line = dress(voice(w, who, b.role), `The ${place} was worth the ${usd(cents)}. I am glad you came.`);
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
  const line = dress(voice(w, best, role), `${P.name(host)} introduced us at the table. I am ${firms[P.employer[best]]?.ceo === best ? 'chief at ' + firms[P.employer[best]].name : 'on the desk at ' + firmName(w, P.employer[best])}.`);
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
  const line = dress(voice(w, other, 'colleague'), `${P.name(host)} says you are worth meeting. I am not sure yet.`);
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
          post(w, st, row.from, role, 'repay', dress(voice(w, row.from, role), `That clears the ${monthName(row.day)} loan. ${usd(n)} was the last of it.`), ev, ev);
        }
      }
    } else if (w.day > row.due) {
      row.status = 'broke';
      const ev = w.events.emit('circle.default', `${P.name(row.from)} does not repay the ${monthName(row.day)} loan of ${usd(row.owed)}`, [row.eventId], id);
      moveBond(w, st, row.from, -6, -14, -10, `The ${monthName(row.day)} loan was not paid back`, ev);
      remember(st, row.from, row.day, `${usd(row.owed)} was the loan`, ev, 'unpaid');
      const role = bondOf(st, row.from)?.role ?? 'friend';
      post(w, st, row.from, role, 'memory', dress(voice(w, row.from, role), `I never paid you back for ${monthName(row.day)}. ${usd(row.owed)} is still outstanding.`), ev, ev);
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
      post(w, st, row.from, role, 'memory', dress(voice(w, row.from, role), `You never returned the favour from ${monthName(row.day)}.`), ev, ev);
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
function acts(w: World, st: Circle, me: number): void {
  const P = econ(w).P;
  const rival = st.bonds.find((b) => b.role === 'rival' && alive(w, b.who));
  const ally = st.bonds.find((b) => b.stance === 'ally' && alive(w, b.who));
  const held = holdings(w, P.id(me));
  if (rival && !st.rivalDone && held.length) {
    const h = held[0];
    const cause = root(w);
    const ev = w.events.emit('circle.rival', `${P.name(rival.who)} shorts ${h.instr} against ${P.name(me)}`, [cause], P.id(rival.who));
    const sold = rivalShort(w, rival.who, P.id(me), h.instr, h.last, ev);
    let house = '';
    const nb = neighbourhood(w, me);
    if (nb) {
      for (const home of homeBoard(w, rival.who)) {
        if (home.mine || home.live) continue;
        const pv = parcelView(w, home.id);
        if (!pv || pv.neighbourhood !== nb) continue;
        if (Math.floor(w.ledger.balance(P.id(rival.who), DEP)) < home.price * 0.25) continue;
        const got = bidHome(w, rival.who, home.id, 0, ev);
        if (!got.why) { house = ` They bid for a ${nb} home.`; break; }
      }
    }
    const same = employer(w, me) >= 0 && employer(w, me) === employer(w, rival.who);
    const job = same ? ` We both want the seat at ${firmName(w, employer(w, me))}.` : '';
    const line = dress(voice(w, rival.who, 'rival'), sold
      ? `I am short ${h.instr}. You hold it.${job}${house}`
      : `I am after the same ground as you.${job}${house || ''}`);
    post(w, st, rival.who, 'rival', 'rival', line, ev, ev);
    moveBond(w, st, rival.who, -4, -6, -4, sold ? `They shorted ${h.instr} against you` : 'They set themselves against you', ev);
    st.rivalDone = 1;
  }
  if (ally && !st.allyDone && held.length) {
    const h = held[0];
    const cause = root(w);
    const cash = Math.floor(w.ledger.balance(P.id(ally.who), DEP));
    let bought = false;
    if (cash >= h.last) {
      try { submitOrder(w, P.id(ally.who), { instr: h.instr, side: 'buy', qty: 1 }); bought = true; }
      catch { bought = false; }
    }
    const ev = w.events.emit('circle.ally', `${P.name(ally.who)} ${bought ? 'buys' : 'stands with you on'} ${h.instr}`, [cause], P.id(ally.who));
    nudgeStanding(w, me, 2);
    const line = dress(voice(w, ally.who, 'colleague'), bought
      ? `I bought ${h.instr} beside you, and I will vouch at the bank.`
      : `I will vouch for you at the bank. I could not take the shares.`);
    post(w, st, ally.who, 'colleague', 'ally', line, ev, ev);
    moveBond(w, st, ally.who, 5, 4, 8, bought ? `They bought ${h.instr} with you` : 'They vouched for you', ev);
    st.allyDone = 1;
  }
  if (ally && !st.testified) testify(w, st, me, ally.who);
}
function testify(w: World, st: Circle, me: number, ally: number): void {
  const law = w.state.law as { cases?: { phase: number; off: number; trialEvent: number; chargeEvent: number; invEvent: number }[]; offences?: { person: number }[] } | undefined;
  if (!law?.cases || !law.offences) return;
  for (const c of law.cases) {
    if (c.phase >= 3) continue;
    const o = law.offences[c.off];
    if (!o || o.person !== me) continue;
    const cause = c.trialEvent || c.chargeEvent || c.invEvent || root(w);
    const P = econ(w).P;
    const ev = w.events.emit('circle.testify', `${P.name(ally)} testifies for ${P.name(me)}`, [cause], P.id(ally));
    const wage = econ(w).wage;
    const cash = Math.floor(w.ledger.balance(P.id(ally), DEP));
    const help = Math.min(cash - Math.round(wage * 10), Math.round(wage * 8));
    if (help > 100) pay(w, P.id(ally), P.id(me), help, 'circle.testify', ev);
    const line = dress(voice(w, ally, 'colleague'), help > 100
      ? `I told the court what I know, and I put ${usd(help)} toward the lawyer.`
      : `I told the court what I know about you.`);
    post(w, st, ally, 'colleague', 'ally', line, ev, cause);
    moveBond(w, st, ally, 4, 3, 6, 'They testified for you', ev);
    st.testified = 1;
    return;
  }
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
function acquaint(w: World, st: Circle, me: number): void {
  if (seen(st, `acq:${Math.floor(w.day / 7)}`)) return;
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
      const line = dress(voice(w, o.who, 'colleague'), `${why}. ${P.name(c.who)} is how I know your name.`);
      post(w, st, o.who, 'colleague', 'meet', line, ev, ev);
      mark(st, `acq:${Math.floor(w.day / 7)}`);
      return;
    }
  }
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
    post(w, st, m.who, role, 'memory', dress(voice(w, m.who, role), `${line} ${m.text}`), m.eventId, m.eventId);
    mark(st, key);
    m.open = m.kind === 'dinner' ? 0 : m.open;
    return true;
  }
  return false;
}
function requests(w: World, st: Circle, me: number): void {
  const P = econ(w).P;
  const wage = Math.max(1, econ(w).wage);
  for (const b of st.bonds) {
    if (!alive(w, b.who) || b.role !== 'family' && b.role !== 'friend') continue;
    if (P.spouse[me] === b.who || P.parent[b.who] === me) continue;
    if (P.employer[b.who] >= 0 || P.jobless[b.who] < 28) continue;
    const key = `loanask:${b.who}:${Math.floor(w.day / 360)}`;
    if (seen(st, key)) continue;
    if (st.asks.some((a) => a.from === b.who && a.kind === 'loan' && (a.status === 'pending' || a.status === 'yes'))) continue;
    const cents = Math.min(Math.round(wage * 30), Math.floor(w.ledger.balance(P.id(me), DEP) * 0.2));
    if (cents < 1000) continue;
    const cause = P.lastEv[b.who] >= 0 ? P.lastEv[b.who] : root(w);
    const last = P.lastEv[b.who] >= 0 ? w.events.get(P.lastEv[b.who]) : undefined;
    const named = last?.msg ? ` ${last.msg}` : '';
    const text = dress(voice(w, b.who, b.role), `I lost the job. I have been out ${P.jobless[b.who]} days and I need ${usd(cents)}.${named}`);
    askFor(w, st, b.who, b.role, 'loan', text, cause, { cents, owed: cents, note: 'a loan after the job went' });
    mark(st, key);
    return;
  }
  for (const b of st.bonds) {
    if (b.stance !== 'banker' || !alive(w, b.who)) continue;
    for (const f of recentFacts(w, b.who, 40)) {
      if (f.tag !== 'cb.rate' || seen(st, `rate:${f.id}`)) continue;
      const spread = quoted(w, me);
      const cents = Math.max(0, Math.floor((w.state.banking as { owed?: Float64Array } | undefined)?.owed?.[me] ?? 0));
      const offer = Math.min(Math.round(econ(w).wage * 90), Math.max(1000, Math.floor(w.ledger.balance(P.id(me), DEP))));
      const text = dress('exact', `${f.msg} I can ask the desk for about ${(spread * 100).toFixed(2)}%, against the window rate of ${((spread + 0.008) * 100).toFixed(2)}%. Say yes and I will put your name down${cents ? '' : ''}.`);
      askFor(w, st, b.who, 'colleague', 'favour', text, f.eventId, { place: 'rate', cents: offer, factId: f.id, note: f.msg });
      mark(st, `rate:${f.id}`);
      return;
    }
  }
  for (const b of st.bonds) {
    if (!alive(w, b.who) || (b.role !== 'friend' && b.role !== 'family' && b.role !== 'colleague')) continue;
    for (const f of recentFacts(w, b.who, 50)) {
      if (f.pub || f.drop || knows(w, me, f.id) || seen(st, `tip:${f.id}`)) continue;
      if (f.tag === 'insider.profit' && f.profit >= 0) continue;
      const firm = f.firms.length ? firmName(w, f.firms[0]) : 'a firm';
      const text = dress(voice(w, b.who, b.role), `I know something about ${firm} that is not in the paper. A favour later, and I will tell you.`);
      askFor(w, st, b.who, b.role, 'favour', text, f.eventId, { factId: f.id, note: f.msg });
      mark(st, `tip:${f.id}`);
      return;
    }
  }
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
function worldLetters(w: World, st: Circle, me: number, budget: number): number {
  let left = budget;
  const P = econ(w).P;
  const held = new Set(holdings(w, P.id(me)).map((h) => h.issuer));
  const mine = employer(w, me);
  for (const b of st.bonds) {
    if (left <= 0) break;
    if (!alive(w, b.who)) continue;
    const job = employer(w, b.who);
    const firm = job >= 0 ? econ(w).firms[job] : undefined;
    if (firm && firm.layoffEv !== undefined && firm.layoffEv >= 0 && !seen(st, `lay:${firm.layoffEv}:${b.who}`)) {
      const text = dress(voice(w, b.who, b.role), `They are cutting at ${firm.name}. I have seen the list. The jobs go before the month closes.`);
      post(w, st, b.who, b.role, 'hint', text, firm.layoffEv, firm.layoffEv);
      mark(st, `lay:${firm.layoffEv}:${b.who}`);
      left--;
      continue;
    }
    if (firm && firm.lastProfit < 0 && firm.profitEv !== undefined && firm.profitEv >= 0 && !seen(st, `loss:${firm.idx}:${firm.profitEv}`)) {
      const text = dress(voice(w, b.who, b.role), `${firm.name} lost ${usd(Math.abs(firm.lastProfit))} last month. If it happens again they will cut jobs.`);
      post(w, st, b.who, b.role, 'hint', text, firm.profitEv, firm.profitEv);
      mark(st, `loss:${firm.idx}:${firm.profitEv}`);
      left--;
      continue;
    }
    for (const f of recentFacts(w, b.who, 45)) {
      if (left <= 0) break;
      const key = `fact:${f.id}:${b.who}`;
      if (seen(st, key)) continue;
      const aboutMine = mine >= 0 && f.firms.includes(mine);
      const aboutThem = job >= 0 && f.firms.includes(job);
      const aboutHold = f.firms.some((i) => held.has(econ(w).firms[i]?.id ?? ''));
      let kind = '';
      let body = '';
      if ((f.tag === 'insider.profit' && f.profit < 0 && (aboutThem || aboutMine)) || f.tag === 'firm.cashCrunch' || f.tag === 'firm.default') {
        kind = 'hint';
        body = `This is not public yet. ${f.msg} If it stands, they will cut jobs.`;
      } else if (f.tag === 'mkt.move' && (aboutThem || aboutHold || aboutMine)) {
        const down = /-\d/.test(f.msg) || f.msg.includes(' down') || f.msg.includes('fell');
        if (b.role === 'rival' && down && aboutHold && !seen(st, `gloat:${f.eventId}:${b.who}`)) {
          kind = 'gloat';
          body = `Your name is the one falling. ${f.msg}`;
          mark(st, `gloat:${f.eventId}:${b.who}`);
        } else if (down && (aboutThem || aboutMine)) {
          kind = 'hint';
          body = `The shares moved and the floor noticed. ${f.msg}`;
        } else if (!down && b.role === 'mentor' && aboutHold) {
          kind = 'milestone';
          body = `That holding did the work. ${f.msg}`;
        }
      } else if (f.tag === 'shock' && aboutThem && firm && shockTouches(f, firm.good)) {
        kind = 'hint';
        body = `It reaches our floor. ${f.msg}`;
      } else if ((f.tag === 'firm.ceoFired' || f.tag === 'firm.succession') && (aboutThem || aboutMine)) {
        kind = 'hint';
        body = f.msg;
      } else if (f.tag === 'law.case' && (aboutThem || aboutMine || f.msg.includes(P.name(me)))) {
        kind = 'hint';
        body = f.msg;
      }
      if (!kind) continue;
      post(w, st, b.who, b.role, kind, dress(voice(w, b.who, b.role), body), f.eventId, f.eventId);
      mark(st, key);
      left--;
    }
  }
  if (left > 0) {
    const rival = st.bonds.find((b) => b.role === 'rival' && alive(w, b.who));
    const heldInstr = new Set(holdings(w, P.id(me)).map((h) => h.instr));
    if (rival && heldInstr.size) {
      for (const ev of w.events.recent(['mkt.move'], 8)) {
        if (left <= 0 || ev.day < w.day - 45) continue;
        const instr = ev.msg.split(' ')[0] ?? '';
        if (!heldInstr.has(instr) || !/-\d/.test(ev.msg)) continue;
        const key = `gloat:${ev.id}:${rival.who}`;
        if (seen(st, key)) continue;
        const facts = soc(w)?.facts;
        let fact: Fact | undefined;
        if (facts) for (let i = facts.length - 1; i >= 0 && i >= facts.length - 800; i--) if (facts[i]?.eventId === ev.id) { fact = facts[i]; break; }
        if (fact && !fact.pub && !knows(w, rival.who, fact.id)) continue;
        const text = dress(voice(w, rival.who, 'rival'), `Your name is the one falling. ${ev.msg}`);
        post(w, st, rival.who, 'rival', 'gloat', text, ev.id, ev.id);
        mark(st, key);
        left--;
        break;
      }
    }
  }
  const now = position(w, me);
  if (st.markWorth < 0 || now > st.markWorth) st.markWorth = now;
  return budget - left;
}
function milestones(w: World, st: Circle, me: number): void {
  const P = econ(w).P;
  const mentor = st.bonds.find((b) => b.role === 'mentor' && alive(w, b.who));
  if (!mentor) return;
  if (w.day > 0 && w.day % DAYS_PER_YEAR === 0 && st.mileYear !== w.day) {
    st.mileYear = w.day;
    const worth = position(w, me);
    const text = dress(voice(w, mentor.who, 'mentor'), `A year in. Cash and the book stand at ${usd(worth)}. I am proud of the way you kept at it.`);
    post(w, st, mentor.who, 'mentor', 'milestone', text, root(w), root(w));
    moveBond(w, st, mentor.who, 2, 1, 2, `They marked the year with you`, root(w));
  }
  if (!st.mileWorth && st.openWorth > 0 && position(w, me) >= st.openWorth * 2) {
    st.mileWorth = 1;
    const text = dress(voice(w, mentor.who, 'mentor'), `You have doubled what you arrived with. That is a real mark.`);
    post(w, st, mentor.who, 'mentor', 'milestone', text, root(w), root(w));
  }
  if (!st.mileHome) {
    const owned = homeBoard(w, me).find((h) => h.mine);
    if (owned) {
      const pv = parcelView(w, owned.id);
      const cause = pv?.eventId ?? root(w);
      st.mileHome = 1;
      const text = dress(voice(w, mentor.who, 'mentor'), `A ${owned.neighbourhood} home. I heard. That is the milestone I hoped for.`);
      post(w, st, mentor.who, 'mentor', 'milestone', text, cause, cause);
    }
  }
}

function relink(w: World, st: Circle, me: number): void {
  for (const b of st.bonds) {
    if (!alive(w, b.who)) continue;
    if (slotOf(w, st, me, b.who) >= 0) continue;
    linkNew(w, st, me, b.who, 24, Math.min(40, b.score), b.role, b.stance);
  }
}
function week(w: World, st: Circle, me: number): void {
  if (w.day % 7 !== 6) return;
  cast(w, st, me);
  relink(w, st, me);
  drift(w, st, me);
  acquaint(w, st, me);
  acts(w, st, me);
  const used = memories(w, st) ? 1 : 0;
  requests(w, st, me);
  worldLetters(w, st, me, 3 - used);
  milestones(w, st, me);
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
    lines.push(`pending #${a.msg} ${a.kind} from ${P.name(a.from)}: ${actions(a).join(' | ')}`);
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
    pending: { id: number; msg: number; from: number; name: string; role: string; kind: string; day: number; status: string; cents: number; place: string; other: number; otherName: string; eventId: number; note: string; actions: string[] }[];
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
    const me = playerWho(w);
    if (me < 0) return;
    const st = box(w);
    if ((w.day + 1) % 30 === 0) repay(w, st, me);
    week(w, st, me);
  },
  stats(w) {
    const st = box(w);
    const friends = st.bonds.filter((b) => b.role === 'friend' || b.score >= 55).length;
    const rivals = st.bonds.some((b) => b.role === 'rival') ? 1 : 0;
    const out = { letters: st.yMsg, requests: st.yReq, friends, rivals };
    st.yMsg = 0;
    st.yReq = 0;
    return out;
  },
};
