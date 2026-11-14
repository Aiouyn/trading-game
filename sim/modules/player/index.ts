// The player is one person in the same arrays as everyone else. They see only what they
// know, and every order, loan and futures fill goes through the modules that already book it.
import { DAYS_PER_YEAR, type Module, type World } from '../../kernel/index.ts';
import { borrowMargin, depositSight, repayPerson, withdrawSight } from '../banking/index.ts';
import { LOT, submitBondOrder } from '../bonds/index.ts';
import { tradeFuture } from '../commodities/index.ts';
import { appointChief, companyPosts, foldFirm, foundCompany, sellDivision, steerCompany, takePublic, tenderOffer, type CompanyPost } from '../corporate/index.ts';
import { launchCoin, orderCoin } from '../crypto/index.ts';
import { CEO_POSITION } from '../economy/content.ts';
import { BANK, DEP, GOV, pay, type EconState, type Firm } from '../economy/index.ts';
import { ALIVE, RETIRED, joinFirm, labourOf, leaveJob, retargetLabour, setSimDay, succession, thought } from '../economy/people.ts';
import { borrowShares, cancelOrder, returnShares, submitOrder } from '../markets/index.ts';
import { B_FRIEND, askFirm, contactsOf, knows, seatPerson, talk } from '../social/index.ts';

export const PLAYER = 8;

export interface Heard { factId: number; eventId: number; from: number; day: number }
export interface ScorePoint { day: number; worth: number }
interface StockLoan { instr: string; qty: number; claim: string; face: number }
interface Share { who: number; bps: number }

export interface Will { heir: number; shares: Share[]; eventId: number }

export interface PlayerState {
  who: number;
  over: boolean;
  margin: boolean;
  arrived: number;
  heard: Heard[];
  score: ScorePoint[];
  loans: StockLoan[];
  line: number[];
  generation: number;
  founded: number;
  controlled: number;
  offices: number;
  convictions: number;
  officeWas: string;
  seenLaw: number[];
  will: Will | null;
  chair: number;
  handed: number;
  final: string;
  passed: number;
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
  | { kind: 'wait'; days: number }
  | { kind: 'found'; name: string; sector: string; cents: number; loan: boolean }
  | { kind: 'ceo'; firm: string; op: 'report' | 'price' | 'hires' | 'dividend' | 'invest'; value?: number; auto?: boolean }
  | { kind: 'ipo'; firm: string; fraction: number }
  | { kind: 'bid'; firm: string; cents: number; multiple: number; paper: boolean }
  | { kind: 'board'; op: 'list' | 'chief' | 'merge' | 'sell'; firm?: string; slot?: number; into?: string }
  | { kind: 'court'; slot: number }
  | { kind: 'marry'; slot: number }
  | { kind: 'child' }
  | { kind: 'school'; nth: number }
  | { kind: 'will'; how: 'spouse' | 'child' | 'slot'; nth: number }
  | { kind: 'retire' }
  | { kind: 'hand'; firm: string }
  | { kind: 'die' };

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
  companies: CompanyPost[];
  health: number;
  final: string;
  family: {
    spouse: { index: number; name: string; alive: boolean; age: number } | null;
    children: { index: number; name: string; alive: boolean; age: number; school: number }[];
    will: string;
  };
  dynasty: {
    generation: number;
    worth: number;
    founded: number;
    controlled: number;
    offices: number;
    convictions: number;
    people: { index: number; name: string; role: string; alive: boolean; age: number; worth: number }[];
  };
}

const FUTURES: Record<string, string> = {
  OIL: 'CRUDE_OIL', CRUDE: 'CRUDE_OIL', CRUDE_OIL: 'CRUDE_OIL',
  GAS: 'NATURAL_GAS', NATURAL_GAS: 'NATURAL_GAS',
  COAL: 'COAL', IRON: 'IRON_ORE', IRON_ORE: 'IRON_ORE',
  COPPER: 'COPPER', LITHIUM: 'LITHIUM', GRAIN: 'GRAIN',
  LIVESTOCK: 'LIVESTOCK', CATTLE: 'LIVESTOCK',
};

const DEG = 16;
const econ = (w: World): EconState => w.state.economy as EconState;
const blank = (): PlayerState => ({
  who: -1, over: false, margin: false, arrived: -1, heard: [], score: [], loans: [],
  line: [], generation: 1, founded: 0, controlled: 0, offices: 0, convictions: 0,
  officeWas: '', seenLaw: [], will: null, chair: -1, handed: -1, final: '', passed: -1,
});
const stOf = (w: World): PlayerState => {
  let st = w.state.player as PlayerState | undefined;
  if (!st) { st = blank(); w.state.player = st; }
  if (!st.line) st.line = [];
  if (st.generation === undefined) st.generation = 1;
  if (st.founded === undefined) st.founded = 0;
  if (st.controlled === undefined) st.controlled = 0;
  if (st.offices === undefined) st.offices = 0;
  if (st.convictions === undefined) st.convictions = 0;
  if (st.officeWas === undefined) st.officeWas = '';
  if (!st.seenLaw) st.seenLaw = [];
  if (st.will === undefined) st.will = null;
  if (st.chair === undefined) st.chair = -1;
  if (st.handed === undefined) st.handed = -1;
  if (st.final === undefined) st.final = '';
  if (st.passed === undefined) st.passed = -1;
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
    if (f.closed) continue;
    const n = f.staff.length;
    if (n < 16 || n + 1 >= need) continue;
    if (!best || n < best.staff.length) best = f;
  }
  if (best) return best;
  for (const f of s.firms) if (!f.closed && f.staff.length >= 16 && (!best || f.staff.length < best.staff.length)) best = f;
  return best ?? s.firms.find((f) => !f.closed) ?? s.firms[0];
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
  if (!st.line.includes(i)) st.line.push(i);
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
    if (f.closed) continue;
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

function remember(st: PlayerState, i: number): void {
  if (i >= 0 && !st.line.includes(i)) st.line.push(i);
}

function bondsOf(w: World): { contact: Int32Array; bond: Uint8Array } | undefined {
  const st = w.state.social as { contact?: Int32Array; bond?: Uint8Array } | undefined;
  if (!st?.contact || !st.bond) return undefined;
  return { contact: st.contact, bond: st.bond };
}

function friendship(w: World, person: number, slot: number): number {
  const st = bondsOf(w);
  if (!st || slot < 0 || slot >= DEG) return 0;
  const p = person * DEG + slot;
  if (st.contact[p] < 0) return 0;
  return st.bond[p * 4 + B_FRIEND] ?? 0;
}

function liftFriend(w: World, person: number, slot: number, who: number): void {
  const st = bondsOf(w);
  if (!st) return;
  const bump = (i: number, k: number): void => {
    const q = (i * DEG + k) * 4 + B_FRIEND;
    // A work contact starts at 22. The city's pairing bar is friendship past 49, so one courtship clears it.
    const n = st.bond[q] + 28;
    st.bond[q] = n > 100 ? 100 : n;
  };
  bump(person, slot);
  const b = who * DEG;
  for (let k = 0; k < DEG; k++) if (st.contact[b + k] === person) { bump(who, k); break; }
}

function canPair(w: World, a: number, b: number): string | undefined {
  const P = econ(w).P;
  if (a === b) return 'you cannot marry yourself';
  if (!P.alive(a) || !P.alive(b)) return 'one of you has died';
  if (P.spouse[a] >= 0 || P.spouse[b] >= 0) return 'one of you is already married';
  const aa = P.age(w, a), bb = P.age(w, b);
  if (aa < 20 || aa > 50 || bb < 20 || bb > 50) return 'the pairing rules stop at 20 and 50';
  if (P.family[a] === P.family[b] || P.parent[a] === b || P.parent[b] === a) return 'you are already family';
  if (P.kids(a).includes(b) || P.kids(b).includes(a)) return 'you are already family';
  return undefined;
}

function pairSlot(w: World, i: number, slot: number): { slot: number; who: number } | { why: string } {
  const list = contactsOf(w, i);
  if (slot >= 0) {
    const c = list.find((x) => x.slot === slot);
    if (!c) return { why: 'no such contact' };
    const why = canPair(w, i, c.who);
    if (why) return { why };
    return { slot: c.slot, who: c.who };
  }
  for (const c of list) if (!canPair(w, i, c.who)) return { slot: c.slot, who: c.who };
  return { why: 'no contact passes the pairing rules' };
}

function causeOf(w: World, st: PlayerState): number {
  return st.arrived >= 0 ? st.arrived : econ(w).macroEv >= 0 ? econ(w).macroEv : w.genesis;
}

function firmByKey(w: World, key: string): Firm | undefined {
  const k = key.toLowerCase();
  for (const f of econ(w).firms) {
    if (f.closed) continue;
    const bare = f.id.startsWith('frm_') ? f.id.slice(4) : f.id;
    if (f.id.toLowerCase() === k || bare === k || f.name.toLowerCase() === k) return f;
  }
  return undefined;
}

function household(w: World, st: PlayerState): number[] {
  const P = econ(w).P;
  const seen = new Set<number>();
  const out: number[] = [];
  const add = (i: number): void => {
    if (i < 0 || i >= P.n || seen.has(i)) return;
    seen.add(i);
    out.push(i);
  };
  for (const i of st.line) add(i);
  add(st.who);
  const me = st.who;
  if (me >= 0 && me < P.n) {
    add(P.spouse[me]);
    for (const k of P.kids(me)) add(k);
    add(P.parent[me]);
  }
  return out;
}

function houseWorth(w: World, ids: number[]): number {
  const P = econ(w).P;
  const price = markPrice(w);
  let n = 0;
  for (const i of ids) if (P.alive(i)) n += w.ledger.netWorth(P.id(i), price);
  return Math.round(n);
}

function refreshFirms(w: World, st: PlayerState): void {
  const members = new Set(household(w, st));
  let founded = 0, controlled = 0;
  for (const f of econ(w).firms) {
    if (members.has(f.founder)) founded++;
    if (!f.closed && members.has(f.ceo)) controlled++;
  }
  st.founded = founded;
  st.controlled = controlled;
}

function refreshLife(w: World, st: PlayerState): void {
  const P = econ(w).P;
  const members = new Set(household(w, st));
  const pol = w.state.politics as { leader?: number; finance?: number; governor?: number; regulator?: number } | undefined;
  if (pol) {
    const seats: [string, number][] = [
      ['leader', pol.leader ?? -1],
      ['finance', pol.finance ?? -1],
      ['governor', pol.governor ?? -1],
      ['regulator', pol.regulator ?? -1],
    ];
    let key = '';
    for (const [name, who] of seats) {
      if (!members.has(who)) continue;
      const bit = `${name}:${who};`;
      key += bit;
      if (!st.officeWas.includes(bit)) st.offices++;
    }
    st.officeWas = key;
  }
  const ids = new Set<string>();
  for (const i of members) ids.add(P.id(i));
  for (const e of w.events.recent(['law.verdict', 'law.judgment'], 40)) {
    if (!e.msg.includes('convicted') || !e.actor || !ids.has(e.actor)) continue;
    if (st.seenLaw.includes(e.id)) continue;
    st.seenLaw.push(e.id);
    st.convictions++;
  }
}

function personBit(w: World, i: number): { index: number; name: string; alive: boolean; age: number } | null {
  const P = econ(w).P;
  if (i < 0 || i >= P.n) return null;
  return { index: i, name: P.name(i), alive: P.alive(i), age: P.age(w, i) };
}

function willText(w: World, st: PlayerState): string {
  const will = st.will;
  if (!will) return 'no will';
  const P = econ(w).P;
  const heir = will.heir >= 0 && will.heir < P.n ? P.name(will.heir) : 'nobody';
  if (!will.shares.length) return `${heir} continues the house; the city's rule splits the estate`;
  const bits = will.shares.map((s) => `${s.who >= 0 && s.who < P.n ? P.name(s.who) : 'someone'} ${Math.round(s.bps / 100)}%`);
  return `${heir} continues the house; ${bits.join(', ')}`;
}

function dynastyOf(w: World, st: PlayerState): PlayerView['dynasty'] {
  const P = econ(w).P;
  const ids = household(w, st);
  const price = markPrice(w);
  const me = st.who;
  const people = ids.map((i) => {
    let role = 'kin';
    if (i === me) role = 'you';
    else if (me >= 0 && i === P.spouse[me]) role = 'spouse';
    else if (me >= 0 && P.parent[i] === me) role = 'child';
    else if (me >= 0 && P.parent[me] === i) role = 'parent';
    return {
      index: i, name: P.name(i), role, alive: P.alive(i), age: P.age(w, i),
      worth: P.alive(i) ? Math.round(w.ledger.netWorth(P.id(i), price)) : 0,
    };
  });
  return {
    generation: st.generation,
    worth: houseWorth(w, ids),
    founded: st.founded,
    controlled: st.controlled,
    offices: st.offices,
    convictions: st.convictions,
    people,
  };
}

function epitaph(w: World, st: PlayerState, dead: number): string {
  const P = econ(w).P;
  const d = dynastyOf(w, st);
  return `${P.name(dead)} has died, and nobody is left to take the name. The house ends. Generation ${d.generation}. Family net worth ${(d.worth / 100).toFixed(0)} dollars. Firms founded ${d.founded}, controlled ${d.controlled}. Offices held ${d.offices}. Convictions ${d.convictions}.`;
}

function livingHeir(w: World, dead: number, st: PlayerState): number {
  const P = econ(w).P;
  const ok = (h: number): boolean => h >= 0 && h < P.n && h !== dead && P.alive(h);
  const will = st.will;
  if (will && ok(will.heir)) {
    const child = P.parent[will.heir] === dead || P.kids(dead).includes(will.heir);
    const spouse = will.heir === P.spouse[dead];
    const named = contactsOf(w, dead).some((c) => c.who === will.heir) || will.shares.some((s) => s.who === will.heir);
    if (child || spouse || named) return will.heir;
  }
  const sp = P.spouse[dead];
  if (ok(sp)) return sp;
  const kids = P.kids(dead).filter(ok);
  kids.sort((a, b) => P.born[a] - P.born[b] || a - b);
  const adult = kids.find((k) => P.age(w, k) >= 18);
  if (adult !== undefined) return adult;
  if (kids.length) return kids[0];
  if (will) for (const s of will.shares) if (ok(s.who)) return s.who;
  return -1;
}

function continueAs(w: World, dead: number, heir: number, cause: number): number {
  const P = econ(w).P, st = stOf(w);
  P.flags[dead] &= ~PLAYER;
  P.flags[heir] |= PLAYER;
  st.who = heir;
  st.over = false;
  st.passed = dead;
  st.generation += 1;
  st.will = null;
  st.chair = -1;
  remember(st, heir);
  const ev = w.events.emit(
    'player.heir',
    `${P.name(heir)} (${P.age(w, heir)}) takes up the life ${P.name(dead)} left. Skill ${P.skill[heir].toFixed(2)}, health ${P.health[heir]}, and the contacts and reputation already their own`,
    [cause],
    P.id(heir),
  );
  P.lastEv[heir] = ev;
  chronicle(w, heir, `${P.name(heir)} continues the house after ${P.name(dead)}`, ev);
  refreshFirms(w, st);
  return ev;
}

function endHouse(w: World, dead: number, cause: number): void {
  const st = stOf(w), P = econ(w).P;
  st.over = true;
  st.passed = dead;
  st.final = epitaph(w, st, dead);
  chronicle(w, dead, st.final, cause);
  P.lastEv[dead] = cause;
}

function moveEstate(w: World, i: number, shares: Share[], ev: number): void {
  const s = econ(w), L = w.ledger, P = s.P, me = P.slot[i];
  const alive = shares.filter((r) => r.who >= 0 && r.who < P.n && r.who !== i && P.alive(r.who) && r.bps > 0);
  const holdings = s.shareIds.filter((id) => L.balS(me, id) > 0);
  const cashNow = L.balS(me, DEP);
  if (!alive.length) {
    if (cashNow > 0) L.moveS(DEP, me, s.govSlot, cashNow, 'estate.escheat', ev);
    for (const id of holdings) {
      const n = L.balS(me, id);
      if (n > 0) L.moveS(id, me, s.govSlot, n, 'estate.escheat', ev);
    }
    return;
  }
  const sum = alive.reduce((t, r) => t + r.bps, 0);
  alive.forEach((r, k) => {
    const last = k === alive.length - 1;
    const to = P.slot[r.who];
    const cash = last ? L.balS(me, DEP) : Math.floor(cashNow * r.bps / sum);
    if (cash > 0) L.moveS(DEP, me, to, cash, 'estate.inherit', ev);
    for (const id of holdings) {
      const n = L.balS(me, id);
      const q = last ? n : Math.floor(n * r.bps / sum);
      if (q > 0) L.moveS(id, me, to, q, 'estate.inherit', ev);
    }
    P.lastEv[r.who] = ev;
  });
}

function cityShares(w: World, i: number): Share[] {
  const P = econ(w).P;
  const sp = P.spouse[i];
  const heirs = sp >= 0 && P.alive(sp) ? [sp] : P.kids(i).filter((k) => P.alive(k));
  if (!heirs.length) return [];
  const bps = Math.floor(10000 / heirs.length);
  return heirs.map((who, k) => ({ who, bps: k === heirs.length - 1 ? 10000 - bps * (heirs.length - 1) : bps }));
}

function noticeBoard(w: World, st: PlayerState, i: number): void {
  const s = econ(w), P = s.P;
  const chair = st.chair;
  if (chair >= 0 && chair < s.firms.length && s.firms[chair].ceo !== i) {
    const held = s.firms[chair];
    if (st.handed !== chair) {
      const id = w.events.last('firm.ceoFired');
      const ev = id !== undefined ? w.events.get(id) : undefined;
      const cause = ev && ev.actor === held.id ? ev.id : causeOf(w, st);
      chronicle(w, i, `the board removes ${P.name(i)} from ${held.name}`, cause);
    }
    st.chair = -1;
    st.handed = -1;
  }
  const e = P.employer[i];
  if (e >= 0 && s.firms[e].ceo === i) st.chair = e;
}

function ageYear(w: World, i: number): void {
  const s = econ(w), P = s.P;
  if (P.age(w, i) < 40 || P.health[i] <= 40) return;
  const before = labourOf(P, i, w.day);
  P.health[i]--;
  const after = labourOf(P, i, w.day);
  retargetLabour(s, i, before, after);
  if (P.health[i] === 60 || P.health[i] === 45 || P.health[i] === 30) {
    const st = stOf(w);
    const ev = w.events.emit('player.health', `${P.name(i)} is ${P.age(w, i)} and health has fallen to ${P.health[i]}`, [causeOf(w, st)], P.id(i));
    chronicle(w, i, `${P.name(i)} feels the years; health ${P.health[i]}`, ev);
  }
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
    if (cmd.kind !== 'news' && cmd.kind !== 'why') return rejected(st.final || 'you have died');
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
    case 'found': {
      const r = foundCompany(w, i, cmd.name, cmd.sector.toUpperCase(), cmd.cents, cmd.loan);
      if ('why' in r) return rejected(r.why);
      refreshFirms(w, st);
      return { status: 'accepted', text: `you found ${r.name} (${r.id}), making ${r.good}` };
    }
    case 'ceo': {
      const r = steerCompany(w, i, cmd.firm, cmd.op, cmd.value, cmd.auto === true);
      if ('why' in r) return rejected(r.why);
      return { status: 'accepted', lines: r.lines };
    }
    case 'ipo': {
      const r = takePublic(w, i, cmd.firm, cmd.fraction);
      if ('why' in r) return rejected(r.why);
      return { status: 'accepted', text: r.text };
    }
    case 'bid': {
      const r = tenderOffer(w, i, cmd.firm, cmd.cents, cmd.multiple, cmd.paper);
      if ('why' in r) return rejected(r.why);
      return { status: 'accepted', text: r.text };
    }
    case 'board': {
      if (cmd.op === 'list') {
        const rows = companyPosts(w, i);
        const lines = rows.length ? rows.map((c) => `${c.role} of ${c.name} (${c.id}) — ${c.stake} of ${c.shares} shares, ${c.listed ? 'listed' : 'private'}, profit $${(c.profit / 100).toFixed(2)}`) : ['you hold no board seat'];
        return { status: 'accepted', lines };
      }
      if (!cmd.firm) return rejected('name the firm');
      if (cmd.op === 'chief') {
        const slot = cmd.slot ?? -1;
        const who = contactsOf(w, i).find((c) => c.slot === slot)?.who;
        if (who === undefined) return rejected('no such contact');
        const r = appointChief(w, i, cmd.firm, who);
        if ('why' in r) return rejected(r.why);
        return { status: 'accepted', text: r.text };
      }
      if (!cmd.into) return rejected(cmd.op === 'merge' ? 'name the firm it folds into' : 'name the buyer');
      const r = cmd.op === 'merge' ? foldFirm(w, i, cmd.firm, cmd.into) : sellDivision(w, i, cmd.firm, cmd.into);
      if ('why' in r) return rejected(r.why);
      return { status: 'accepted', text: r.text };
    }
    case 'court': {
      const hit = pairSlot(w, i, cmd.slot);
      if ('why' in hit) return rejected(hit.why);
      const talked = talk(w, i, hit.slot);
      if (talked.who < 0) return rejected(talked.why ?? 'nobody there');
      liftFriend(w, i, hit.slot, hit.who);
      const fr = friendship(w, i, hit.slot);
      const ev = w.events.emit('player.court', `${P.name(i)} courts ${P.name(hit.who)} (friendship ${fr})`, [causeOf(w, st)], id);
      chronicle(w, i, `${P.name(i)} courts ${P.name(hit.who)}`, ev);
      const ready = fr > 49 ? ' The pairing rules would allow a marriage.' : ' Friendship is not past 49 yet.';
      return { status: 'accepted', eventId: ev, text: `courted ${P.name(hit.who)}, friendship ${fr}.${ready}` };
    }
    case 'marry': {
      const hit = pairSlot(w, i, cmd.slot);
      if ('why' in hit) return rejected(hit.why);
      if (!(friendship(w, i, hit.slot) > 49)) return rejected(`friendship is ${friendship(w, i, hit.slot)}; the pairing rules want it past 49`);
      P.spouse[i] = hit.who;
      P.spouse[hit.who] = i;
      const ev = w.events.emit('player.wed', `${P.name(i)} marries ${P.name(hit.who)}, on the same pairing rules as anyone else`, [causeOf(w, st)], id);
      const s = econ(w);
      thought(w, s, i, -80, 'a wedding', ev);
      thought(w, s, hit.who, -80, 'a wedding', ev);
      seatPerson(w, i, 16);
      seatPerson(w, hit.who, 16);
      remember(st, hit.who);
      P.lastEv[i] = ev;
      chronicle(w, i, `${P.name(i)} marries ${P.name(hit.who)}`, ev);
      return { status: 'accepted', eventId: ev, text: `married ${P.name(hit.who)}` };
    }
    case 'child': {
      const q = P.spouse[i];
      if (q < 0 || !P.alive(q)) return rejected('you have no spouse');
      const young = Math.min(P.age(w, i), P.age(w, q));
      if (young < 20 || young > 42 || P.nkids[i] >= 4) return rejected('the birth rules stop outside 20 to 42, and at four children');
      const child = P.add(w, w.day, i, q);
      const ev = w.events.emit('player.birth', `${P.name(i)} and ${P.name(q)} have a child, ${P.name(child)}`, [causeOf(w, st)], id);
      const s = econ(w);
      thought(w, s, i, -60, 'a birth', ev);
      thought(w, s, q, -60, 'a birth', ev);
      seatPerson(w, child, 8);
      remember(st, child);
      P.lastEv[i] = ev;
      chronicle(w, i, `${P.name(child)} is born to ${P.name(i)} and ${P.name(q)}`, ev);
      return { status: 'accepted', eventId: ev, text: `${P.name(child)} is born` };
    }
    case 'school': {
      const kids = P.kids(i).filter((k) => P.alive(k));
      const child = kids[cmd.nth];
      if (child === undefined) return rejected('no such child');
      if (P.school[child] >= 18) return rejected('schooling already runs to 18 years');
      const cost = Math.round(econ(w).wage * 100);
      if (Math.floor(w.ledger.balance(id, DEP)) < cost) return rejected('you cannot pay the school');
      const ev = w.events.emit('player.school', `${P.name(i)} pays for a year of schooling for ${P.name(child)}`, [causeOf(w, st)], id);
      if (!pay(w, id, GOV, cost, 'player.school', ev)) return rejected('the payment did not clear');
      P.school[child] = Math.min(18, P.school[child] + 1);
      chronicle(w, i, `${P.name(child)} now has ${P.school[child]} years of school, paid by ${P.name(i)}`, ev);
      return { status: 'accepted', eventId: ev, fill: cost, text: `paid for ${P.name(child)}; school ${P.school[child]}` };
    }
    case 'will': {
      let heir = -1;
      let shares: Share[] = [];
      if (cmd.how === 'spouse') {
        const sp = P.spouse[i];
        if (sp < 0 || !P.alive(sp)) return rejected('you have no spouse');
        heir = sp;
      } else if (cmd.how === 'child') {
        const kids = P.kids(i).filter((k) => P.alive(k));
        const child = kids[cmd.nth];
        if (child === undefined) return rejected('no such child');
        heir = child;
        const sp = P.spouse[i];
        shares = sp >= 0 && P.alive(sp)
          ? [{ who: sp, bps: 5000 }, { who: child, bps: 5000 }]
          : [{ who: child, bps: 10000 }];
      } else if (cmd.how === 'slot') {
        const c = contactsOf(w, i).find((x) => x.slot === cmd.nth);
        if (!c || !P.alive(c.who) || c.who === i) return rejected('no such contact');
        heir = c.who;
      } else {
        const never: never = cmd.how;
        return never;
      }
      const split = shares.length
        ? shares.map((s) => `${P.name(s.who)} ${Math.round(s.bps / 100)}%`).join(', ')
        : 'the city\'s rule, a living spouse or else the children in equal parts, or the state if nobody is left';
      const ev = w.events.emit('player.will', `${P.name(i)} writes a will. ${P.name(heir)} continues the house. The estate: ${split}`, [causeOf(w, st)], id);
      st.will = { heir, shares, eventId: ev };
      chronicle(w, i, `${P.name(i)} writes a will naming ${P.name(heir)}`, ev);
      return { status: 'accepted', eventId: ev, text: willText(w, st) };
    }
    case 'retire': {
      if (P.retired(i)) return rejected('you have already retired');
      const s = econ(w);
      const e = P.employer[i], f = e >= 0 ? s.firms[e] : undefined, wasCeo = f?.ceo === i;
      const ev = w.events.emit('player.retire', `${P.name(i)} retires at ${P.age(w, i)}`, [causeOf(w, st)], id);
      P.flags[i] |= RETIRED;
      setSimDay(w.day);
      leaveJob(s, i);
      if (f && wasCeo) {
        st.handed = f.idx;
        succession(w, s, f, i, 'retired', ev);
      }
      chronicle(w, i, `${P.name(i)} retires`, ev);
      refreshFirms(w, st);
      return { status: 'accepted', eventId: ev, text: 'retired' };
    }
    case 'hand': {
      const f = firmByKey(w, cmd.firm);
      if (!f) return rejected('no such firm');
      if (f.ceo !== i) return rejected('you do not hold that seat');
      if (!f.family) return rejected('succession searches the children only in a family firm');
      const retire = CEO_POSITION.retireAge;
      const kids = P.kids(i).filter((c) => P.alive(c) && P.adult(w, c) && P.age(w, c) >= 23 && P.age(w, c) < retire - 1);
      if (!kids.length) return rejected('no child is old enough for the succession rules');
      const ev = w.events.emit('player.hand', `${P.name(i)} hands ${f.name} to the next generation`, [causeOf(w, st)], id);
      st.handed = f.idx;
      setSimDay(w.day);
      succession(w, econ(w), f, i, 'handed the seat on', ev);
      chronicle(w, i, `${P.name(i)} hands ${f.name} on`, ev);
      refreshFirms(w, st);
      return { status: 'accepted', eventId: ev, text: `${f.name} passes by the succession rules` };
    }
    case 'die': {
      const cause = st.will?.eventId ?? causeOf(w, st);
      const shares = st.will && st.will.shares.length ? st.will.shares : cityShares(w, i);
      const named = st.will && st.will.heir >= 0 && st.will.heir < P.n ? P.name(st.will.heir) : '';
      const ev = w.events.emit('player.died', `${P.name(i)} dies aged ${P.age(w, i)}. ${named ? `The will names ${named}. ` : ''}The estate follows the will, and the city's rule where the will is silent`, [cause], id);
      moveEstate(w, i, shares, ev);
      P.flags[i] &= ~ALIVE;
      const sp = P.spouse[i];
      if (sp >= 0 && sp < P.n) P.spouse[sp] = -1;
      setSimDay(w.day);
      const e = P.employer[i], f = e >= 0 ? econ(w).firms[e] : undefined, wasCeo = f?.ceo === i;
      leaveJob(econ(w), i);
      if (f && wasCeo) succession(w, econ(w), f, i, 'died', ev);
      const heir = livingHeir(w, i, st);
      if (heir < 0) {
        endHouse(w, i, ev);
        return { status: 'accepted', eventId: ev, lines: w.events.explain(ev, 6), text: st.final };
      }
      const heirEv = continueAs(w, i, heir, ev);
      return { status: 'accepted', eventId: heirEv, lines: w.events.explain(heirEv, 6), text: `${P.name(heir)} continues the house` };
    }
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
    companies: i >= 0 ? companyPosts(w, i) : [],
    health: i >= 0 ? P.health[i] : 0,
    final: st.final,
    family: {
      spouse: i >= 0 ? personBit(w, P.spouse[i]) : null,
      children: i >= 0 ? P.kids(i).map((k) => {
        const bit = personBit(w, k);
        return bit ? { ...bit, school: P.school[k] } : { index: k, name: '', alive: false, age: 0, school: 0 };
      }) : [],
      will: willText(w, st),
    },
    dynasty: dynastyOf(w, st),
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
    const st = stOf(w);
    if (st.who < 0) return;
    const P = econ(w).P;
    const i = st.who;
    if (i >= P.n) return;
    if (!P.alive(i)) {
      if (st.over || st.passed === i) return;
      const died = w.events.last('person.died');
      const ev = died !== undefined ? w.events.get(died) : undefined;
      const cause = ev?.actor === P.id(i) ? ev.id : causeOf(w, st);
      const heir = livingHeir(w, i, st);
      if (heir < 0) endHouse(w, i, cause);
      else continueAs(w, i, heir, cause);
      return;
    }
    noticeBoard(w, st, i);
    if (w.day > 0 && w.day % DAYS_PER_YEAR === 0 && (st.score.length === 0 || st.score[st.score.length - 1].day !== w.day)) {
      ageYear(w, i);
      const nw = Math.round(worth(w, i));
      st.score.push({ day: w.day, worth: nw });
      const cause = econ(w).macroEv || st.arrived;
      chronicle(w, i, `${P.name(i)} marks the year with a net worth of ${(nw / 100).toFixed(0)} dollars`, cause);
      refreshFirms(w, st);
      refreshLife(w, st);
    }
  },
  stats(w) {
    const i = playerIndex(w);
    if (i < 0) return { player: 0 };
    const P = econ(w).P, st = stOf(w);
    return {
      player: Math.round(worth(w, i) / 100),
      playerAlive: P.alive(i) ? 1 : 0,
      dynasty: st.generation,
      house: Math.round(houseWorth(w, household(w, st)) / 100),
    };
  },
};
