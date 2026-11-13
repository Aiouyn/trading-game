// Relationships, rumours and the newspaper.
// People are not objects: each person has 16 contact slots (who, familiarity, trust) in typed arrays.
// A conversation adds 30 familiarity. A fact is a set of bits, or a short list of knowers while that list
// is smaller than a bitset of the population. The first person to learn it is recorded on the fact.
// Staff, owners and the people at the banks hear a notable event first. It spreads to contacts with a
// chance that rises with trust. Once 1% of the living know it, the paper prints it and everyone knows.
// Facts older than a year are dropped. Staff see their firm's month-to-date profit a week before the
// books publish that month's lastProfit.
import { DAYS_PER_MONTH, DAYS_PER_YEAR, type Module, type World } from '../../kernel/index.ts';
import { SHOCKS, type ShockDef } from '../economy/content.ts';
import { type EconState } from '../economy/index.ts';
import { thought } from '../economy/people.ts';

const DEG = 16;
const TALKS = 2;
const FAM_STEP = 30;
const FAM_SPOUSE = 480, FAM_PARENT = 360, FAM_SIB = 200, FAM_WORK = 140;
const TR_SPOUSE = 90, TR_PARENT = 80, TR_SIB = 65, TR_WORK = 50;
const LEAK_DAY = DAYS_PER_MONTH - 8; // day 22: seven days before the month closes on day 29
const GOSSIP = 4;

const KIND_FAM = 1, KIND_WORK = 2;

type Tag = 'firm.default' | 'firm.ceoFired' | 'firm.succession' | 'firm.cashCrunch' | 'cb.rate' | 'mkt.move' | 'shock' | 'insider.profit';

interface Know {
  tab: Int32Array | null;
  mask: number;
  n: number;
  bits: Uint32Array | null;
}

interface Fact {
  id: number;
  eventId: number;
  day: number;
  year: number;
  tag: Tag;
  msg: string;
  firms: number[];
  instrs: string[];
  shock: ShockDef | null;
  profit: number;
  bad: boolean;
  intensity: number;
  hold: number;
  pub: boolean;
  drop: boolean;
  pubDay: number;
  first: number;
  firstDay: number;
  know: Know | null;
}

interface Social {
  cap: number;
  words: number;
  contact: Int32Array;
  fam: Uint16Array;
  trust: Uint8Array;
  kind: Uint8Array;
  emp: Int16Array;
  head: Int32Array;
  stamp: Uint16Array;
  gen: number;
  holdDay: Int32Array;
  cellFact: Int32Array;
  cellNext: Int32Array;
  cellN: number;
  free: number;
  personOf: Int32Array;
  firmById: Map<string, number>;
  paper: number;
  insiderFact: Int32Array;
  facts: Fact[];
  seen: number;
  pop: number;
  need: number;
  yCreated: number;
  yHit: number;
  yPub: number;
  yDelay: number;
}

let scratch = new Int32Array(16);

function econ(w: World): EconState { return w.state.economy as EconState; }
function soc(w: World): Social { return w.state.social as Social; }

function mix(a: number, b: number, c: number, d = 0): number {
  let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f) ^ Math.imul(c, 0x165667b1) ^ d;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  return x >>> 0;
}
function hash(person: number, mask: number): number {
  let x = Math.imul(person ^ (person >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) & mask;
}

function makeKnow(words: number, expect: number): Know {
  let cap = 8;
  while (cap < expect * 2) cap <<= 1;
  if (cap > words) return { tab: null, mask: 0, n: 0, bits: new Uint32Array(Math.max(1, words)) };
  const tab = new Int32Array(cap);
  tab.fill(-1);
  return { tab, mask: cap - 1, n: 0, bits: null };
}
function toBits(k: Know, words: number): void {
  const bits = new Uint32Array(Math.max(1, words));
  const tab = k.tab;
  if (tab) for (let i = 0; i < tab.length; i++) {
    const p = tab[i];
    if (p >= 0) bits[p >>> 5] |= 1 << (p & 31);
  }
  k.bits = bits;
  k.tab = null;
  k.mask = 0;
}
function growTab(k: Know): void {
  const old = k.tab;
  if (!old) return;
  const cap = old.length << 1;
  const tab = new Int32Array(cap);
  tab.fill(-1);
  const mask = cap - 1;
  for (let i = 0; i < old.length; i++) {
    const p = old[i];
    if (p < 0) continue;
    let h = hash(p, mask);
    while (tab[h] !== -1) h = (h + 1) & mask;
    tab[h] = p;
  }
  k.tab = tab;
  k.mask = mask;
}
function addKnow(k: Know, person: number, words: number): boolean {
  if (person < 0) return false;
  if (k.bits) {
    const w = person >>> 5;
    if (w >= k.bits.length) return false;
    const m = 1 << (person & 31);
    if ((k.bits[w] & m) !== 0) return false;
    k.bits[w] |= m;
    k.n++;
    return true;
  }
  if (!k.tab) return false;
  if ((k.n + 1) * 2 > k.tab.length) {
    if ((k.tab.length << 1) > words) toBits(k, words);
    else growTab(k);
    return addKnow(k, person, words);
  }
  const tab = k.tab;
  const mask = k.mask;
  let h = hash(person, mask);
  while (tab[h] !== -1) {
    if (tab[h] === person) return false;
    h = (h + 1) & mask;
  }
  tab[h] = person;
  k.n++;
  return true;
}
function hasKnow(k: Know | null, person: number): boolean {
  if (!k || person < 0) return false;
  if (k.bits) {
    const w = person >>> 5;
    if (w >= k.bits.length) return false;
    return (k.bits[w] & (1 << (person & 31))) !== 0;
  }
  const tab = k.tab;
  if (!tab) return false;
  const mask = k.mask;
  let h = hash(person, mask);
  for (let n = 0; n <= mask; n++) {
    const v = tab[h];
    if (v === -1) return false;
    if (v === person) return true;
    h = (h + 1) & mask;
  }
  return false;
}

function blank(cap: number): Social {
  const contact = new Int32Array(cap * DEG);
  contact.fill(-1);
  const head = new Int32Array(cap);
  head.fill(-1);
  const emp = new Int16Array(cap);
  emp.fill(-1);
  const cells = 1024;
  const cellNext = new Int32Array(cells);
  cellNext.fill(-1);
  return {
    cap, words: Math.ceil(cap / 32), contact, fam: new Uint16Array(cap * DEG), trust: new Uint8Array(cap * DEG), kind: new Uint8Array(cap * DEG),
    emp, head, stamp: new Uint16Array(cap), gen: 1, holdDay: new Int32Array(cap),
    cellFact: new Int32Array(cells), cellNext, cellN: 0, free: -1, personOf: new Int32Array(0),
    firmById: new Map(), paper: -1, insiderFact: new Int32Array(0), facts: [], seen: 0, pop: 1, need: 1,
    yCreated: 0, yHit: 0, yPub: 0, yDelay: 0,
  };
}
function ensure(st: Social, n: number): void {
  if (n <= st.cap) return;
  let cap = st.cap;
  while (cap < n) cap *= 2;
  const contact = new Int32Array(cap * DEG); contact.fill(-1); contact.set(st.contact);
  const fam = new Uint16Array(cap * DEG); fam.set(st.fam);
  const trust = new Uint8Array(cap * DEG); trust.set(st.trust);
  const kind = new Uint8Array(cap * DEG); kind.set(st.kind);
  const emp = new Int16Array(cap); emp.fill(-1); emp.set(st.emp);
  const head = new Int32Array(cap); head.fill(-1); head.set(st.head);
  const stamp = new Uint16Array(cap); stamp.set(st.stamp);
  const holdDay = new Int32Array(cap); holdDay.set(st.holdDay);
  st.contact = contact; st.fam = fam; st.trust = trust; st.kind = kind; st.emp = emp; st.head = head; st.stamp = stamp; st.holdDay = holdDay;
  st.cap = cap;
  st.words = Math.ceil(cap / 32);
  for (const f of st.facts) {
    const bits = f.know?.bits;
    if (bits && bits.length < st.words) {
      const b = new Uint32Array(st.words);
      b.set(bits);
      if (f.know) f.know.bits = b;
    }
  }
}
function newGen(st: Social): void {
  st.gen++;
  if (st.gen >= 65535) { st.stamp.fill(0); st.gen = 1; }
}
function claim(st: Social, i: number): boolean {
  if (i < 0 || i >= st.cap) return false;
  if (st.stamp[i] === st.gen) return false;
  st.stamp[i] = st.gen;
  return true;
}
function findContact(st: Social, i: number, who: number): number {
  const b = i * DEG;
  const contact = st.contact;
  for (let k = 0; k < DEG; k++) if (contact[b + k] === who) return k;
  return -1;
}
function place(st: Social, a: number, b: number, fam: number, trust: number, kind: number): void {
  if (a < 0 || b < 0 || a >= st.cap || findContact(st, a, b) >= 0) return;
  const base = a * DEG;
  const contact = st.contact;
  for (let k = 0; k < DEG; k++) if (contact[base + k] < 0) {
    const p = base + k;
    contact[p] = b;
    st.fam[p] = fam;
    st.trust[p] = trust;
    st.kind[p] = kind;
    return;
  }
}
function link(st: Social, a: number, b: number, fam: number, trust: number, kind: number): void {
  if (a === b || a < 0 || b < 0) return;
  place(st, a, b, fam, trust, kind);
  place(st, b, a, fam, trust, kind);
}
function tiePerson(st: Social, w: World, i: number): void {
  const P = econ(w).P;
  const sp = P.spouse[i];
  if (sp >= 0) link(st, i, sp, FAM_SPOUSE, TR_SPOUSE, KIND_FAM);
  const parent = P.parent[i];
  if (parent >= 0) {
    link(st, i, parent, FAM_PARENT, TR_PARENT, KIND_FAM);
    const other = P.spouse[parent];
    if (other >= 0) link(st, i, other, FAM_PARENT, TR_PARENT, KIND_FAM);
    let c = P.firstKid[parent], n = 0;
    while (c >= 0 && n < 8) {
      if (c !== i) link(st, i, c, FAM_SIB, TR_SIB, KIND_FAM);
      c = P.nextSib[c];
      n++;
    }
  }
  let c = P.firstKid[i], n = 0;
  if (c < 0 && sp >= 0) c = P.firstKid[sp];
  while (c >= 0 && n < 6) {
    link(st, i, c, FAM_PARENT, TR_PARENT, KIND_FAM);
    c = P.nextSib[c];
    n++;
  }
}
function tieAll(st: Social, w: World): void {
  const n = econ(w).P.n;
  for (let i = 0; i < n; i++) tiePerson(st, w, i);
}
function refreshWork(st: Social, w: World, i: number): void {
  const P = econ(w).P;
  const b = i * DEG;
  for (let k = 0; k < DEG; k++) if (st.kind[b + k] === KIND_WORK) { st.contact[b + k] = -1; st.kind[b + k] = 0; }
  const e = P.employer[i];
  st.emp[i] = e;
  if (e < 0) return;
  const staff = econ(w).firms[e].staff;
  const len = staff.length;
  if (len < 2) return;
  const pos = P.staffPos[i];
  const steps = [1, 4, 13, 37];
  for (let s = 0; s < steps.length; s++) {
    const j = staff[(pos + steps[s]) % len];
    if (j !== i) link(st, i, j, FAM_WORK, TR_WORK, KIND_WORK);
  }
}
function indexPeople(st: Social, w: World): void {
  const L = w.ledger, P = econ(w).P;
  const n = L.ids.length;
  if (st.personOf.length < n) {
    const a = new Int32Array(n);
    a.fill(-1);
    a.set(st.personOf);
    st.personOf = a;
  }
  for (let i = 0; i < P.n; i++) st.personOf[P.slot[i]] = i;
  let living = 0;
  for (let i = 0; i < P.n; i++) if ((P.flags[i] & 1) !== 0) living++;
  st.pop = Math.max(1, living);
  st.need = Math.max(1, Math.ceil(st.pop * 0.01));
}
function freeList(st: Social, i: number): void {
  let c = st.head[i];
  st.head[i] = -1;
  while (c >= 0) {
    const nxt = st.cellNext[c];
    st.cellNext[c] = st.free;
    st.free = c;
    c = nxt;
  }
}
function reclaimDead(st: Social, w: World): void {
  const P = econ(w).P;
  for (let i = 0; i < P.n; i++) if ((P.flags[i] & 1) === 0 && st.head[i] >= 0) freeList(st, i);
}

function classify(kind: string): Tag | undefined {
  if (kind.startsWith('shock.')) return 'shock';
  switch (kind) {
    case 'firm.default':
    case 'firm.ceoFired':
    case 'firm.succession':
    case 'firm.cashCrunch':
    case 'cb.rate':
    case 'mkt.move':
      return kind;
    default:
      return undefined;
  }
}
function shockByKind(kind: string): ShockDef | null {
  const id = kind.slice(6);
  for (const d of SHOCKS) if (d.id.toLowerCase() === id) return d;
  return null;
}
function shockBad(def: ShockDef, good: string): boolean {
  const p = def.prod[good] ?? def.prod.ALL;
  const d = def.demand[good];
  return (p !== undefined && p < 1) || (d !== undefined && d < 1);
}
function shockHurts(def: ShockDef): boolean {
  for (const v of Object.values(def.prod)) if (v < 1) return true;
  for (const v of Object.values(def.demand)) if (v < 1) return true;
  return false;
}
function shockTouches(def: ShockDef, good: string): boolean {
  return def.prod[good] !== undefined || def.prod.ALL !== undefined || def.demand[good] !== undefined;
}
function movePct(msg: string): number {
  const i = msg.lastIndexOf('(');
  const j = msg.lastIndexOf('%');
  if (i < 0 || j < i) return 0;
  return +msg.slice(i + 1, j);
}
function tone(tag: Tag, msg: string, profit: number, shock: ShockDef | null): { bad: boolean; intensity: number; hold: number } {
  switch (tag) {
    case 'firm.default': return { bad: true, intensity: 180, hold: 120 };
    case 'firm.cashCrunch': return { bad: true, intensity: 110, hold: 30 };
    case 'firm.ceoFired': return { bad: true, intensity: 60, hold: 20 };
    case 'firm.succession': return { bad: false, intensity: 0, hold: 0 };
    case 'cb.rate': return { bad: false, intensity: 0, hold: 0 };
    case 'mkt.move': return movePct(msg) <= -10 ? { bad: true, intensity: 35, hold: 35 } : { bad: false, intensity: 0, hold: 0 };
    case 'shock': return shock && shockHurts(shock) ? { bad: true, intensity: 45, hold: 15 } : { bad: false, intensity: 0, hold: 0 };
    case 'insider.profit': return profit < 0 ? { bad: true, intensity: 40, hold: 5 } : { bad: false, intensity: 0, hold: 0 };
    default: {
      const never: never = tag;
      return never;
    }
  }
}
function label(w: World, fact: Fact): string {
  if (fact.firms.length) return econ(w).firms[fact.firms[0]].name;
  if (fact.tag === 'cb.rate') return 'the central bank';
  if (fact.instrs.length) return 'the bank';
  return 'the market';
}
function headline(paper: string, w: World, fact: Fact): string {
  const name = label(w, fact);
  switch (fact.tag) {
    case 'firm.default': return `${paper}: ${name} defaults`;
    case 'firm.ceoFired': return `${paper}: ${name} removes its chief executive`;
    case 'firm.succession': return `${paper}: a new chief executive at ${name}`;
    case 'firm.cashCrunch': return `${paper}: ${name} cannot meet its wage bill`;
    case 'cb.rate': return `${paper}: ${fact.msg}`;
    case 'mkt.move': {
      const at = fact.msg.indexOf('close');
      return `${paper}: ${name} shares ${at >= 0 ? fact.msg.slice(at) : fact.msg}`;
    }
    case 'shock': return `${paper}: ${fact.msg}`;
    case 'insider.profit': {
      const amt = (Math.abs(fact.profit) / 100).toFixed(0);
      return `${paper}: ${name} ${fact.profit >= 0 ? 'profit' : 'loss'} of ${amt} leaks a week before the figures`;
    }
    default: {
      const never: never = fact.tag;
      return never;
    }
  }
}
function whatOf(w: World, fact: Fact): string {
  const name = label(w, fact);
  switch (fact.tag) {
    case 'firm.default': return `default at ${name}`;
    case 'firm.ceoFired': return `the chief executive removed at ${name}`;
    case 'firm.succession': return `succession at ${name}`;
    case 'firm.cashCrunch': return `wages unpaid at ${name}`;
    case 'cb.rate': return 'the policy rate moved';
    case 'mkt.move': return `shares fell at ${name}`;
    case 'shock': return fact.msg;
    case 'insider.profit': return `a loss at ${name}`;
    default: {
      const never: never = fact.tag;
      return never;
    }
  }
}

function personAt(w: World, st: Social, slot: number): number {
  const of = st.personOf;
  if (slot >= 0 && slot < of.length) {
    const p = of[slot];
    if (p >= 0) return p;
  }
  const id = w.ledger.ids[slot];
  return id !== undefined && id.startsWith('p_') ? +id.slice(2) : -1;
}
function forHolders(w: World, st: Social, instr: string, fn: (p: number) => boolean): void {
  if (!w.ledger.instruments.has(instr)) return;
  for (const [slot, bal] of w.ledger.holdersS(instr)) {
    if (!(bal > 0)) continue;
    const p = personAt(w, st, slot);
    if (p >= 0 && fn(p)) return;
  }
}
function isEmployee(w: World, fact: Fact, person: number): boolean {
  const P = econ(w).P;
  const e = P.employer[person];
  if (e < 0) return false;
  if (fact.shock) return shockBad(fact.shock, econ(w).firms[e].good);
  for (let i = 0; i < fact.firms.length; i++) if (fact.firms[i] === e) return true;
  return false;
}
function isHolder(w: World, fact: Fact, person: number): boolean {
  const slot = econ(w).P.slot[person];
  for (let i = 0; i < fact.instrs.length; i++) if (w.ledger.balS(slot, fact.instrs[i]) > 0) return true;
  return false;
}
function react(w: World, st: Social, fact: Fact, person: number): void {
  if (!fact.bad) return;
  const P = econ(w).P;
  if (person < 0 || person >= P.n || (P.flags[person] & 1) === 0) return;
  const employee = isEmployee(w, fact, person);
  if (!employee) {
    if (fact.hold <= 0 || st.holdDay[person] === w.day + 1 || !isHolder(w, fact, person)) return;
    st.holdDay[person] = w.day + 1;
  }
  const raw = employee ? fact.intensity : fact.hold;
  if (raw <= 0) return;
  thought(w, econ(w), person, raw, whatOf(w, fact), fact.eventId);
}
function reactUnaware(w: World, fact: Fact): void {
  if (!fact.bad) return;
  const st = soc(w), s = econ(w);
  newGen(st);
  const once = (i: number): boolean => {
    if (!claim(st, i)) return false;
    if (fact.know && hasKnow(fact.know, i)) return false;
    react(w, st, fact, i);
    return false;
  };
  for (let f = 0; f < fact.firms.length; f++) {
    const staff = s.firms[fact.firms[f]].staff;
    for (let i = 0; i < staff.length; i++) once(staff[i]);
  }
  if (fact.hold <= 0) return;
  for (let i = 0; i < fact.instrs.length; i++) forHolders(w, st, fact.instrs[i], once);
}
function publish(w: World, fact: Fact): void {
  if (fact.pub || fact.drop) return;
  const st = soc(w);
  reactUnaware(w, fact);
  fact.pub = true;
  fact.pubDay = w.day;
  fact.know = null;
  st.yPub++;
  st.yDelay += w.day - fact.day;
  if (fact.year === w.year) st.yHit++;
  const s = econ(w);
  const paper = st.paper >= 0 ? s.firms[st.paper] : undefined;
  w.events.emit('news.story', headline(paper?.name ?? 'The paper', w, fact), [fact.eventId], paper?.id);
}
function remember(st: Social, person: number, factId: number): void {
  let c = st.free;
  if (c >= 0) st.free = st.cellNext[c];
  else {
    if (st.cellN >= st.cellFact.length) {
      const n = st.cellFact.length * 2;
      const fact = new Int32Array(n);
      const next = new Int32Array(n);
      fact.set(st.cellFact);
      next.set(st.cellNext);
      next.fill(-1, st.cellN);
      st.cellFact = fact;
      st.cellNext = next;
    }
    c = st.cellN++;
  }
  st.cellFact[c] = factId;
  st.cellNext[c] = st.head[person];
  st.head[person] = c;
}
function learn(w: World, fact: Fact, person: number): void {
  if (fact.pub || fact.drop || person < 0) return;
  const st = soc(w);
  if (!fact.know) fact.know = makeKnow(st.words, 8);
  if (!addKnow(fact.know, person, st.words)) return;
  if (fact.first < 0) { fact.first = person; fact.firstDay = w.day; }
  remember(st, person, fact.id);
  react(w, st, fact, person);
  if (fact.know.n >= st.need) publish(w, fact);
}
function staffCount(w: World, fact: Fact): number {
  const firms = econ(w).firms;
  let n = 0;
  for (let i = 0; i < fact.firms.length; i++) n += firms[fact.firms[i]].staff.length;
  return n;
}
function circleReaches(w: World, fact: Fact): boolean {
  const st = soc(w), s = econ(w);
  newGen(st);
  let n = 0;
  for (let f = 0; f < fact.firms.length; f++) {
    const staff = s.firms[fact.firms[f]].staff;
    for (let i = 0; i < staff.length; i++) if (claim(st, staff[i]) && ++n >= st.need) return true;
  }
  for (let i = 0; i < fact.instrs.length; i++) {
    let hit = false;
    forHolders(w, st, fact.instrs[i], (p) => {
      if (!claim(st, p)) return false;
      if (++n >= st.need) { hit = true; return true; }
      return false;
    });
    if (hit) return true;
  }
  return false;
}
function noteFirst(w: World, fact: Fact): void {
  fact.firstDay = fact.day;
  const firms = econ(w).firms;
  for (let i = 0; i < fact.firms.length; i++) {
    const staff = firms[fact.firms[i]].staff;
    if (staff.length) { fact.first = staff[0]; return; }
  }
}
function seed(w: World, fact: Fact, withHolders: boolean): void {
  const st = soc(w);
  noteFirst(w, fact);
  const staffN = staffCount(w, fact);
  if (staffN >= st.need || (withHolders && circleReaches(w, fact))) {
    publish(w, fact);
    return;
  }
  const firms = econ(w).firms;
  for (let f = 0; f < fact.firms.length && !fact.pub; f++) {
    const staff = firms[fact.firms[f]].staff;
    for (let i = 0; i < staff.length && !fact.pub; i++) learn(w, fact, staff[i]);
  }
  if (!withHolders || fact.pub) return;
  for (let i = 0; i < fact.instrs.length && !fact.pub; i++) {
    forHolders(w, st, fact.instrs[i], (p) => {
      if (fact.pub) return true;
      learn(w, fact, p);
      return fact.pub;
    });
  }
}
function openFact(w: World, tag: Tag, eventId: number, msg: string, shock: ShockDef | null, profit: number): Fact {
  const st = soc(w);
  const t = tone(tag, msg, profit, shock);
  const fact: Fact = {
    id: st.facts.length, eventId, day: w.day, year: w.year, tag, msg, firms: [], instrs: [], shock, profit,
    bad: t.bad, intensity: t.intensity, hold: t.hold, pub: false, drop: false, pubDay: -1, first: -1, firstDay: w.day, know: null,
  };
  st.facts.push(fact);
  st.yCreated++;
  return fact;
}
function attachFirm(w: World, fact: Fact, firm: number): void {
  if (firm < 0) return;
  fact.firms.push(firm);
  fact.instrs.push('eq:' + econ(w).firms[firm].id);
}
function attachActor(w: World, fact: Fact, actor: string | undefined): void {
  if (!actor) return;
  const idx = soc(w).firmById.get(actor);
  if (idx !== undefined) { attachFirm(w, fact, idx); return; }
  const instr = 'eq:' + actor;
  if (w.ledger.instruments.has(instr)) fact.instrs.push(instr);
}
function bankingFirms(w: World, fact: Fact): void {
  const firms = econ(w).firms;
  for (let i = 0; i < firms.length; i++) if (firms[i].good === 'BANKING') fact.firms.push(firms[i].idx);
}
function shockFirms(w: World, fact: Fact): void {
  const def = fact.shock;
  if (!def) return;
  const firms = econ(w).firms;
  for (let i = 0; i < firms.length; i++) if (shockTouches(def, firms[i].good)) {
    fact.firms.push(firms[i].idx);
    fact.instrs.push('eq:' + firms[i].id);
  }
}
const HOLDERS: ReadonlySet<Tag> = new Set(['firm.default', 'firm.ceoFired', 'firm.succession', 'firm.cashCrunch', 'mkt.move']);
function fromEvent(w: World, id: number, kind: string, msg: string, actor: string | undefined): void {
  const tag = classify(kind);
  if (!tag) return;
  const shock = tag === 'shock' ? shockByKind(kind) : null;
  const fact = openFact(w, tag, id, msg, shock, 0);
  if (tag === 'cb.rate') bankingFirms(w, fact);
  else if (tag === 'shock') shockFirms(w, fact);
  else attachActor(w, fact, actor);
  seed(w, fact, HOLDERS.has(tag));
}
function ingest(w: World): void {
  const st = soc(w);
  const end = w.events.count;
  for (let id = st.seen; id < end; id++) {
    const e = w.events.get(id);
    if (!e || !classify(e.kind)) continue;
    fromEvent(w, e.id, e.kind, e.msg, e.actor);
  }
  st.seen = w.events.count;
}
function insiderLeak(w: World): void {
  if (w.day % DAYS_PER_MONTH !== LEAK_DAY) return;
  const st = soc(w), s = econ(w);
  for (let i = 0; i < s.firms.length; i++) {
    const f = s.firms[i];
    const profit = Math.round(f.mRev - f.mCost);
    const word = profit >= 0 ? 'profit' : 'loss';
    const amt = (Math.abs(profit) / 100).toFixed(0);
    const msg = `${f.name} insiders see a monthly ${word} of ${amt} with a week still to run`;
    const cause = f.priceEv ?? f.stockoutEv ?? s.macroEv;
    const ev = w.events.emit('firm.insider', msg, [cause], f.id);
    const fact = openFact(w, 'insider.profit', ev, msg, null, profit);
    attachFirm(w, fact, f.idx);
    st.insiderFact[f.idx] = fact.id;
    seed(w, fact, false);
  }
}
function dropOld(w: World): void {
  const st = soc(w);
  const cut = w.day - DAYS_PER_YEAR;
  if (cut < 0) return;
  const facts = st.facts;
  for (let i = 0; i < facts.length; i++) {
    const f = facts[i];
    if (f.drop || f.day >= cut) continue;
    f.drop = true;
    f.know = null;
    if (f.tag === 'insider.profit' && f.firms.length && st.insiderFact[f.firms[0]] === f.id) st.insiderFact[f.firms[0]] = -1;
  }
}
function liveIds(st: Social, person: number): number {
  let n = 0;
  let prev = -1;
  for (let c = st.head[person]; c >= 0;) {
    const nxt = st.cellNext[c];
    const id = st.cellFact[c];
    const fact = st.facts[id];
    if (!fact || fact.pub || fact.drop) {
      if (prev < 0) st.head[person] = nxt;
      else st.cellNext[prev] = nxt;
      st.cellNext[c] = st.free;
      st.free = c;
      c = nxt;
      continue;
    }
    if (n >= scratch.length) {
      const bigger = new Int32Array(scratch.length * 2);
      bigger.set(scratch);
      scratch = bigger;
    }
    scratch[n++] = id;
    prev = c;
    c = nxt;
  }
  return n;
}
function gossip(w: World, st: Social, speaker: number, listener: number, trust: number, salt: number): void {
  const n = liveIds(st, speaker);
  if (n <= 0) return;
  const start = mix(w.day, speaker, salt) % n;
  const tries = n < GOSSIP ? n : GOSSIP;
  for (let k = 0; k < tries; k++) {
    const fact = st.facts[scratch[(start + k) % n]];
    if (!fact || fact.pub || fact.drop || hasKnow(fact.know, listener)) continue;
    if (mix(w.day, speaker, listener, fact.id) % 200 < trust) learn(w, fact, listener);
  }
}
function pick(st: Social, flags: Uint8Array, i: number, day: number, salt: number, skip: number): number {
  const contact = st.contact, fam = st.fam, b = i * DEG;
  let tot = 0;
  for (let k = 0; k < DEG; k++) {
    const c = contact[b + k];
    if (c < 0 || c === skip || (flags[c] & 1) === 0) continue;
    tot += fam[b + k];
  }
  if (tot <= 0) return -1;
  let r = mix(day, i, salt) % tot;
  for (let k = 0; k < DEG; k++) {
    const c = contact[b + k];
    if (c < 0 || c === skip || (flags[c] & 1) === 0) continue;
    r -= fam[b + k];
    if (r < 0) return k;
  }
  return -1;
}
function bumpAt(st: Social, i: number, k: number): void {
  const p = i * DEG + k;
  const f = st.fam[p] + FAM_STEP;
  st.fam[p] = f > 65535 ? 65535 : f;
}
function bumpPair(st: Social, a: number, b: number, ka: number): void {
  bumpAt(st, a, ka);
  const kb = findContact(st, b, a);
  if (kb >= 0) bumpAt(st, b, kb);
}
function conversations(w: World): void {
  const st = soc(w), P = econ(w).P;
  const flags = P.flags, born = P.born, employer = P.employer;
  const day = w.day, line = day - 18 * DAYS_PER_YEAR, slot = day % 7;
  const contact = st.contact, trust = st.trust, head = st.head;
  for (let i = slot; i < P.n; i += 7) {
    if ((flags[i] & 1) === 0 || born[i] > line) continue;
    if (st.emp[i] !== employer[i]) refreshWork(st, w, i);
    const b = i * DEG;
    let skip = -1;
    for (let t = 0; t < TALKS; t++) {
      const k = pick(st, flags, i, day, t + 1, skip);
      if (k < 0) break;
      const other = contact[b + k];
      skip = other;
      bumpPair(st, i, other, k);
      if (head[i] >= 0) gossip(w, st, i, other, trust[b + k], t + 1);
    }
  }
}

/** True when this person currently knows this fact. A published fact is known by everyone until it is a year old. */
export function knows(w: World, personIndex: number, factId: number): boolean {
  const st = w.state.social as Social | undefined;
  if (!st || personIndex < 0) return false;
  const fact = st.facts[factId];
  if (!fact || fact.drop) return false;
  if (fact.pub) return personIndex < econ(w).P.n;
  return hasKnow(fact.know, personIndex);
}

export const social: Module = {
  id: 'social',

  init(w) {
    const s = econ(w);
    const st = blank(Math.max(16, s.P.capacity));
    w.state.social = st;
    for (let i = 0; i < s.firms.length; i++) st.firmById.set(s.firms[i].id, s.firms[i].idx);
    st.insiderFact = new Int32Array(s.firms.length);
    st.insiderFact.fill(-1);
    for (let i = 0; i < s.firms.length; i++) if (s.firms[i].good === 'NEWS') { st.paper = s.firms[i].idx; break; }
    ensure(st, s.P.n);
    indexPeople(st, w);
    tieAll(st, w);
    for (let i = 0; i < s.P.n; i++) refreshWork(st, w, i);
  },

  dayClose(w) {
    const st = soc(w);
    ensure(st, econ(w).P.n);
    if (w.day % DAYS_PER_YEAR === 0) {
      indexPeople(st, w);
      if (w.day > 0) { reclaimDead(st, w); tieAll(st, w); }
    }
    dropOld(w);
    insiderLeak(w);
    ingest(w);
    conversations(w);
  },

  monthEnd(w) {
    ensure(soc(w), econ(w).P.n);
    ingest(w);
  },

  stats(w) {
    const st = soc(w), P = econ(w).P;
    let sum = 0, n = 0;
    const step = Math.max(1, Math.floor(P.n / 2000));
    for (let i = 0; i < P.n; i += step) {
      const b = i * DEG;
      for (let k = 0; k < DEG; k++) if (st.contact[b + k] >= 0) { sum += st.fam[b + k]; n++; }
    }
    const out = {
      facts: st.yCreated,
      newsDays: st.yPub ? +(st.yDelay / st.yPub).toFixed(1) : 0,
      newsShare: st.yCreated ? +(st.yHit / st.yCreated).toFixed(2) : 0,
      fam: n ? Math.round(sum / n) : 0,
    };
    st.yCreated = 0;
    st.yHit = 0;
    st.yPub = 0;
    st.yDelay = 0;
    return out;
  },
};
