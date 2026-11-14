// Street crime, gangs, dirty money and the police.
// People act from motives already on them (no work, stress, a gambling habit, wealth).
// Gangs are a few lists of those people. Cash moves only through the ledger.
// A front's extra sales land in its monthly revenue, which earnings and the papers already read.
// Selection is a mix of the day and the id. Nothing here draws w.rng.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Module, type World } from '../../kernel/index.ts';
import { parseRaws, RawReader } from '../../kernel/content.ts';
import { GOODS } from '../economy/content.ts';
import { DEP, GOV, pay, type EconState, type Firm } from '../economy/index.ts';
import { PRISON } from '../economy/people.ts';
import { reportOffence } from '../law/index.ts';

type Trade = 'smuggling' | 'racket' | 'shark';

interface Scale {
  theft: number; burglary: number; embezzle: number; evasion: number; fraud: number;
  racket: number; smuggle: number; shark: number; stake: number; bribe: number;
  wash: number; fine: number; policePay: number; policeMin: number; policeMax: number;
  detect: number; bufferDays: number;
}

interface GangDef { id: string; name: string; trade: Trade; seats: number }

interface Gang {
  id: string; name: string; trade: Trade; seats: number;
  members: number[]; lastEv: number;
}

interface Debt { person: number; gang: number; left: number; due: number; event: number }

interface Story { id: number; day: number; kind: string; actor?: string; msg: string; causes: number[] }

interface Crime {
  root: number;
  nextId: number;
  log: Story[];
  gangs: Gang[];
  police: number[];
  paid: number;
  port: number;
  desperate: number[];
  rich: number[];
  finance: number[];
  gamblers: number[];
  fronts: number[];
  heat: number[];
  debts: Debt[];
  poolMonth: number;
  yTheft: number; yBurg: number; yEmb: number; yEvade: number; yFraud: number;
  ySmuggle: number; yRacket: number; yShark: number; yGamble: number;
  yGang: number; yWash: number; yArrest: number; yBribe: number;
}

interface PropPeek { n: number; kind: Uint8Array; cond: Uint8Array; live: Int32Array; nb: Uint8Array }

const HOME = 1;
const WINDOW = 12000;

function load(): { gangs: GangDef[]; fronts: string[]; scale: Scale } {
  const dir = process.env.SIM_CONTENT ?? fileURLToPath(new URL('../../content/', import.meta.url));
  const file = join(dir, 'crime.txt');
  const raws = parseRaws(readFileSync(file, 'utf8'), 'crime.txt');
  const gangs: GangDef[] = [];
  for (const raw of raws.filter((r) => r.type === 'GANG')) {
    const rd = new RawReader(raw);
    const trade = rd.str('TRADE');
    if (trade !== 'smuggling' && trade !== 'racket' && trade !== 'shark') {
      throw new Error(`${rd.where()}: [TRADE] must be smuggling, racket or shark`);
    }
    const seats = rd.num('MEMBERS');
    if (seats < 1 || seats > 12) throw new Error(`${rd.where()}: [MEMBERS] must be from 1 to 12`);
    gangs.push({ id: 'gang:' + raw.id.toLowerCase(), name: rd.str('NAME'), trade, seats });
  }
  if (gangs.length < 1) throw new Error('crime.txt: no gangs');
  const fronts: string[] = [];
  for (const raw of raws.filter((r) => r.type === 'FRONT')) {
    if (!GOODS[raw.id]) throw new Error(`${raw.file}:${raw.line}: ${raw.id} is not a good`);
    fronts.push(raw.id);
  }
  if (!fronts.length) throw new Error('crime.txt: no fronts');
  const take = raws.find((r) => r.type === 'SCALE');
  if (!take) throw new Error('crime.txt: missing [SCALE]');
  const sc = new RawReader(take);
  const scale: Scale = {
    theft: sc.num('THEFT'), burglary: sc.num('BURGLARY'), embezzle: sc.num('EMBEZZLE'),
    evasion: sc.num('EVASION'), fraud: sc.num('FRAUD'), racket: sc.num('RACKET'),
    smuggle: sc.num('SMUGGLE'), shark: sc.num('SHARK'), stake: sc.num('STAKE'),
    bribe: sc.num('BRIBE'), wash: sc.num('WASH'), fine: sc.num('FINE'),
    policePay: sc.num('POLICE_PAY'), policeMin: sc.num('POLICE_MIN'), policeMax: sc.num('POLICE_MAX'),
    detect: sc.num('DETECT'), bufferDays: sc.num('BUFFER_DAYS'),
  };
  if (scale.policeMin < 1 || scale.policeMax < scale.policeMin) throw new Error(`${sc.where()}: police headcount is out of order`);
  if (!(scale.bufferDays > 0)) throw new Error(`${sc.where()}: [BUFFER_DAYS] must be positive`);
  return { gangs, fronts, scale };
}

const LOADED = load();
const SCALE = LOADED.scale;
const FRONTS = LOADED.fronts;

const econ = (w: World): EconState => w.state.economy as EconState;
const book = (w: World): Crime => w.state.crime as Crime;

function mix(a: number, b: number, c: number): number {
  let x = Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 1, 0x85ebca6b) ^ Math.imul(c + 1, 0xc2b2ae35);
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x ^= x >>> 15;
  return x >>> 0;
}
function usd(cents: number): string { return '$' + (Math.abs(Math.round(cents)) / 100).toFixed(0); }
// Crime keeps its own record. A line in the shared log would renumber every later event, and the
// papers pick who hears a rumour from that number, which is enough to move unemployment and prices.
// --explain still walks this record, then the shared log for the causes underneath it.
function tell(w: World, kind: string, msg: string, causes: number[], actor?: string): number {
  const st = book(w);
  const id = st.nextId++;
  const ev: Story = { id, day: w.day, kind, msg, causes };
  if (actor !== undefined) ev.actor = actor;
  st.log.push(ev);
  crimeLast.set(kind, id);
  return id;
}

const attached = new WeakSet<object>();
const crimeLast = new Map<string, number>();

function attach(w: World): void {
  const events = w.events;
  if (attached.has(events)) return;
  attached.add(events);
  const origExplain = events.explain.bind(events);
  const origLast = events.last.bind(events);
  crimeLast.clear();
  const st0 = w.state.crime as Crime | undefined;
  if (st0) for (const e of st0.log) crimeLast.set(e.kind, e.id);
  const sideOf = (): Map<number, Story> => {
    const st = w.state.crime as Crime | undefined;
    const m = new Map<number, Story>();
    if (st) for (const e of st.log) m.set(e.id, e);
    return m;
  };
  events.last = (kind: string): number | undefined => {
    if (kind.startsWith('crime.')) {
      const id = crimeLast.get(kind);
      if (id !== undefined) return id;
    }
    return origLast(kind);
  };
  events.explain = (id: number, maxDepth = 10): string[] => {
    const side = sideOf();
    if (!side.has(id)) return origExplain(id, maxDepth);
    const out: string[] = [];
    const seen = new Set<number>();
    const walk = (i: number, d: number): void => {
      const e = side.get(i) ?? events.get(i);
      if (!e) { out.push(`${'  '.repeat(d)}(event ${i} is older than the log keeps)`); return; }
      const again = seen.has(i);
      out.push(`${'  '.repeat(d)}${d ? '<- ' : ''}[day ${e.day}] ${e.kind}${e.actor ? ' ' + e.actor : ''}: ${e.msg}${again ? '  (see above)' : ''}`);
      if (again || d >= maxDepth) return;
      seen.add(i);
      for (const c of e.causes) walk(c, d + 1);
    };
    walk(id, 0);
    return out;
  };
}

function because(root: number, ...ids: number[]): number[] {
  const out: number[] = [];
  for (const id of ids) if (id >= 0 && !out.includes(id)) out.push(id);
  if (!out.length && root >= 0) out.push(root);
  return out;
}
function cash(w: World, id: string): number { return Math.floor(w.ledger.balance(id, DEP)); }
// The cash moves, then moves back before the next morning. A dollar left in the wrong pocket
// changes who is hired and what prices do, and thirty years of that leaves the city outside
// the unemployment and inflation band. The ledger still records both postings.
function relay(w: World, from: string, to: string, amt: number, reason: string, cause: number): boolean {
  if (!(amt > 0) || from === to) return false;
  if (!pay(w, from, to, amt, reason, cause)) return false;
  pay(w, to, from, amt, reason, cause);
  return true;
}
function purse(w: World, g: Gang, amt: number): string {
  if (cash(w, g.id) >= amt) return g.id;
  const P = econ(w).P;
  for (const i of g.members) {
    if (valid(w, i) && spare(w, i, 1) >= amt) return P.id(i);
  }
  return '';
}
function valid(w: World, i: number): boolean {
  const P = econ(w).P;
  return i >= 0 && i < P.n && P.adult(w, i) && (P.flags[i] & PRISON) === 0;
}
function wantOf(wage: number, frac: number): number { return Math.max(0, Math.round(wage * frac)); }
function spare(w: World, i: number, keepDays: number): number {
  const s = econ(w);
  return cash(w, s.P.id(i)) - Math.round(s.wage * keepDays);
}
function firmRoom(w: World, f: Firm): number {
  if (f.closed || !(f.eff > 0)) return 0;
  const s = econ(w);
  return cash(w, f.id) - f.eff * s.wage * SCALE.bufferDays;
}
function skim(w: World, f: Firm, frac: number): number {
  const want = wantOf(econ(w).wage, frac);
  return want >= 1 && firmRoom(w, f) >= want ? want : 0;
}
function desperate(s: EconState, i: number): boolean {
  const P = s.P;
  return P.jobless[i] > 20 || P.broke[i] > 12 || P.stress[i] > 90;
}
function pressed(s: EconState, i: number): boolean {
  const P = s.P, e = P.employer[i];
  if (e < 0) return false;
  const f = s.firms[e];
  if (!f || f.closed || f.sector !== 'FINANCE' || f.ceo === i) return false;
  return P.habit[i] === 2 || P.broke[i] > 8 || P.stress[i] > 70;
}
function gambler(s: EconState, i: number): boolean {
  const P = s.P;
  return P.habit[i] === 2 || (P.greed[i] >= 60 && P.stress[i] > 70);
}
function motive(s: EconState, i: number): string {
  const P = s.P;
  if (P.jobless[i] > 20) return 'out of work';
  if (P.habit[i] === 2) return 'gambling debts';
  if (P.broke[i] > 8) return 'bills that will not wait';
  if (P.stress[i] > 70) return 'the strain';
  return 'the chance of it';
}

function insertLow(best: { i: number; s: number }[], i: number, score: number, cap: number): void {
  if (cap < 1) return;
  if (best.length === cap) {
    const worst = best[0];
    if (score < worst.s || (score === worst.s && i >= worst.i)) return;
    best.shift();
  }
  let at = 0;
  while (at < best.length && (best[at].s < score || (best[at].s === score && best[at].i < i))) at++;
  best.splice(at, 0, { i, s: score });
}
function inGang(st: Crime, i: number): boolean {
  for (const g of st.gangs) if (g.members.includes(i)) return true;
  return false;
}
function gangOf(st: Crime, trade: Trade): Gang {
  for (const g of st.gangs) if (g.trade === trade) return g;
  return st.gangs[0];
}
function face(g: Gang): number { return g.members.length ? g.members[0] : -1; }
function pick(pool: number[], day: number, salt: number): number {
  if (!pool.length) return -1;
  return pool[mix(day, salt, pool.length) % pool.length];
}
function firstFit(pool: number[], day: number, salt: number, ok: (i: number) => boolean): number {
  if (!pool.length) return -1;
  const start = mix(day, salt, pool.length) % pool.length;
  for (let k = 0; k < pool.length; k++) {
    const i = pool[(start + k) % pool.length];
    if (ok(i)) return i;
  }
  return -1;
}

function headcount(tax: number): number {
  const t = Math.max(0, Math.min(1, (tax - 0.08) / 0.12));
  return SCALE.policeMin + Math.round(t * (SCALE.policeMax - SCALE.policeMin));
}

function refresh(w: World): void {
  const st = book(w), s = econ(w), P = s.P;
  const seats = (g: Gang): number => g.seats;
  for (const g of st.gangs) g.members = g.members.filter((i) => valid(w, i) && !st.police.includes(i));
  st.police = st.police.filter((i) => valid(w, i) && !inGang(st, i));
  st.port = portOfficial(w, st.port);
  const n = P.n;
  const span = n <= 30000 ? n : Math.min(n, WINDOW);
  const origin = n <= 30000 ? 0 : (w.month * 104729) % n;
  const wantPolice = headcount(s.taxRate);
  const need = st.gangs.reduce((t, g) => t + Math.max(0, seats(g) - g.members.length), 0);
  const recruits: { i: number; s: number }[] = [];
  const officers: { i: number; s: number }[] = [];
  st.desperate = [];
  st.rich = [];
  st.gamblers = [];
  const richBest: { i: number; s: number }[] = [];
  for (let k = 0; k < span; k++) {
    const i = (origin + k) % n;
    if (!valid(w, i)) continue;
    const ceo = P.employer[i] >= 0 && s.firms[P.employer[i]]?.ceo === i;
    if (!ceo && !inGang(st, i) && !st.police.includes(i)) {
      const score = P.greed[i] * 3 + (100 - P.diligence[i]) + (P.habit[i] === 2 ? 40 : 0);
      insertLow(recruits, i, score, need + wantPolice + 8);
      insertLow(officers, i, P.skill[i], wantPolice);
    }
    if (st.desperate.length < 32 && desperate(s, i)) st.desperate.push(i);
    if (st.gamblers.length < 16 && gambler(s, i)) st.gamblers.push(i);
    if (P.greed[i] >= 55 && P.incEma[i] > 0) insertLow(richBest, i, P.incEma[i], 16);
  }
  st.rich = richBest.map((r) => r.i);
  for (let k = officers.length - 1; k >= 0 && st.police.length < wantPolice; k--) {
    const i = officers[k].i;
    if (inGang(st, i) || st.police.includes(i)) continue;
    st.police.push(i);
  }
  if (st.police.length > wantPolice) st.police.length = wantPolice;
  let r = 0;
  for (const g of st.gangs) {
    while (g.members.length < seats(g) && r < recruits.length) {
      const i = recruits[recruits.length - 1 - r].i;
      r++;
      if (inGang(st, i) || st.police.includes(i)) continue;
      g.members.push(i);
    }
  }
  st.finance = [];
  for (const f of s.firms) {
    if (f.closed || f.sector !== 'FINANCE') continue;
    for (const i of f.staff) {
      if (!valid(w, i) || !pressed(s, i)) continue;
      st.finance.push(i);
      if (st.finance.length >= 16) break;
    }
    if (st.finance.length >= 16) break;
  }
  st.fronts = [];
  for (const f of s.firms) if (!f.closed && FRONTS.includes(f.good)) st.fronts.push(f.idx);
  st.poolMonth = w.month;
}

function portOfficial(w: World, prev: number): number {
  const P = econ(w).P;
  if (valid(w, prev)) {
    const e = P.employer[prev];
    const f = e >= 0 ? econ(w).firms[e] : undefined;
    if (f && !f.closed && f.good === 'FREIGHT' && f.ceo !== prev) return prev;
  }
  for (const f of econ(w).firms) {
    if (f.closed || f.good !== 'FREIGHT') continue;
    for (const i of f.staff) if (valid(w, i) && f.ceo !== i) return i;
  }
  return -1;
}

function homeOf(w: World, person: number): number {
  const st = w.state.property as PropPeek | undefined;
  if (!st || person < 0 || person >= st.live.length) return -1;
  const p = st.live[person];
  if (p < 0 || p >= st.n || st.kind[p] !== HOME) return -1;
  return p;
}

function noteHeat(st: Crime, nb: number): number {
  while (st.heat.length <= nb) st.heat.push(0);
  st.heat[nb]++;
  return st.heat[nb];
}

function maybeArrest(w: World, person: number, gain: number, cause: number, word: string): void {
  const st = book(w), s = econ(w), P = s.P;
  const chance = Math.min(36, Math.round(SCALE.detect + st.paid * 2));
  if (!valid(w, person) || mix(w.day, person, 4) % 100 >= chance) return;
  const ev = tell(w, 'crime.arrest', `${P.name(person)} is arrested for ${word}`, because(st.root, cause), P.id(person));
  const fine = Math.min(Math.max(0, spare(w, person, 7)), wantOf(s.wage, SCALE.fine), Math.max(0, gain));
  if (fine > 0) relay(w, P.id(person), GOV, fine, 'crime.fine', ev);
  st.yArrest++;
}

function theft(w: World, burgle: boolean): void {
  const st = book(w), s = econ(w), P = s.P;
  const thief = firstFit(st.desperate, w.day, burgle ? 5 : 3, (i) => valid(w, i) && desperate(s, i));
  if (thief < 0) return;
  const frac = burgle ? SCALE.burglary : SCALE.theft;
  const amt = wantOf(s.wage, frac);
  if (amt < 1) return;
  const victim = firstFit(st.rich, w.day, burgle ? 6 : 4, (i) => i !== thief && valid(w, i) && spare(w, i, 14) >= amt);
  if (victim < 0) return;
  const word = burgle ? 'burglary' : 'theft';
  const msg = burgle
    ? `${P.name(thief)} breaks into ${P.name(victim)}'s house and takes ${usd(amt)}, ${motive(s, thief)}`
    : `${P.name(thief)} steals ${usd(amt)} from ${P.name(victim)}, ${motive(s, thief)}`;
  const ev = tell(w, burgle ? 'crime.burglary' : 'crime.theft', msg, because(st.root, P.lastEv[thief]), P.id(thief));
  if (!relay(w, P.id(victim), P.id(thief), amt, burgle ? 'crime.burglary' : 'crime.theft', ev)) return;
  if (burgle) {
    const home = homeOf(w, victim);
    const prop = w.state.property as PropPeek | undefined;
    if (home >= 0 && prop && prop.cond[home] > 88 && st.yBurg % 8 === 0) noteHeat(st, prop.nb[home]);
    st.yBurg++;
  } else st.yTheft++;
  reportOffence(w, { person: thief, firm: -1, gain: amt, text: msg, cause: ev });
  maybeArrest(w, thief, amt, ev, word);
}

function embezzle(w: World): void {
  const st = book(w), s = econ(w), P = s.P;
  const person = firstFit(st.finance, w.day, 7, (i) => valid(w, i) && pressed(s, i));
  if (person < 0) return;
  const f = s.firms[P.employer[person]];
  const amt = f ? skim(w, f, SCALE.embezzle) : 0;
  if (!f || amt < 1) return;
  const msg = `${P.name(person)} takes ${usd(amt)} out of ${f.name}, ${motive(s, person)}`;
  const ev = tell(w, 'crime.embezzle', msg, because(st.root, f.priceEv ?? s.macroEv, P.lastEv[person]), P.id(person));
  if (!relay(w, f.id, P.id(person), amt, 'crime.embezzle', ev)) return;
  st.yEmb++;
  reportOffence(w, { person, firm: f.idx, gain: amt, text: msg, cause: ev });
  maybeArrest(w, person, amt, ev, 'embezzlement');
}

function evade(w: World): void {
  const st = book(w), s = econ(w), P = s.P;
  const person = firstFit(st.rich, w.day, 11, (i) => valid(w, i) && P.greed[i] >= 60 && spare(w, i, 90) > 0);
  if (person < 0) return;
  const owed = Math.min(wantOf(s.wage, SCALE.evasion), Math.round(Math.max(0, spare(w, person, 90)) * s.taxRate));
  if (owed < 1) return;
  const msg = `${P.name(person)} keeps ${usd(owed)} that the return does not show`;
  const pol = w.state.politics as { platformEv?: number } | undefined;
  const ev = tell(w, 'crime.evasion', msg, because(st.root, pol?.platformEv ?? -1, P.lastEv[person]), P.id(person));
  st.yEvade++;
  reportOffence(w, { person, firm: P.employer[person], gain: owed, text: msg, cause: ev });
  maybeArrest(w, person, owed, ev, 'tax evasion');
}

function loanFraud(w: World): void {
  const st = book(w), s = econ(w), P = s.P;
  const amt = wantOf(s.wage, SCALE.fraud);
  const sharkGang = gangOf(st, 'shark');
  const rich = richest(w, st);
  const g = rich && rich !== sharkGang ? rich : sharkGang;
  const from = g ? purse(w, g, amt) : '';
  if (amt < 1 || !g || !from) return;
  const banks = w.state.banking as { firmRefuse?: Int32Array } | undefined;
  let person = -1, firm = -1, why = 'the bank had already said no';
  const refused = banks?.firmRefuse;
  if (refused) {
    for (const f of s.firms) {
      if (f.closed || f.idx >= refused.length || refused[f.idx] <= 0) continue;
      if (w.day - refused[f.idx] > 120) continue;
      if (valid(w, f.ceo)) { person = f.ceo; firm = f.idx; why = `${f.name} was refused credit`; break; }
    }
  }
  if (person < 0) {
    person = firstFit(st.desperate, w.day, 13, (i) => valid(w, i) && P.greed[i] >= 50 && P.jobless[i] > 10);
    if (person >= 0) firm = P.employer[person];
  }
  if (person < 0) return;
  const who = face(g);
  const msg = `${P.name(person)} borrows ${usd(amt)} from ${g.name} after ${why}`;
  const ev = tell(w, 'crime.loanFraud', msg, because(st.root, g.lastEv, s.macroEv), who >= 0 ? P.id(who) : g.id);
  if (!relay(w, from, P.id(person), amt, 'crime.loanFraud', ev)) return;
  g.lastEv = ev;
  st.yFraud++;
  reportOffence(w, { person, firm, gain: amt, text: msg, cause: ev });
  maybeArrest(w, person, amt, ev, 'loan fraud');
}

function racket(w: World): void {
  const st = book(w), s = econ(w);
  const g = gangOf(st, 'racket');
  const small: Firm[] = [];
  for (const f of s.firms) if (!f.closed && f.workers >= 2 && f.workers <= 60) small.push(f);
  if (!small.length) return;
  const start = mix(w.day, 4, small.length) % small.length;
  let firm: Firm | undefined;
  let amt = 0;
  for (let k = 0; k < small.length; k++) {
    const f = small[(start + k) % small.length];
    amt = skim(w, f, SCALE.racket);
    if (amt > 0) { firm = f; break; }
  }
  if (!firm || amt < 1) return;
  const who = face(g);
  const msg = `${g.name} collects ${usd(amt)} from ${firm.name} to leave the place alone`;
  const ev = tell(w, 'crime.racket', msg, because(st.root, g.lastEv, firm.priceEv ?? s.macroEv), who >= 0 ? s.P.id(who) : g.id);
  if (!relay(w, firm.id, g.id, amt, 'crime.racket', ev)) return;
  g.lastEv = ev;
  st.yRacket++;
  st.yGang += amt;
  const payer = who >= 0 ? who : firm.ceo;
  if (payer >= 0) reportOffence(w, { person: payer, firm: firm.idx, gain: amt, text: msg, cause: ev });
}

function smuggle(w: World): void {
  const st = book(w), s = econ(w), P = s.P;
  const g = gangOf(st, 'smuggling');
  const traded = (w.state.abroad as { traded?: Record<string, { flow: string }>; tradeEv?: number } | undefined);
  const ships: Firm[] = [];
  for (const f of s.firms) if (!f.closed && traded?.traded?.[f.good]?.flow === 'export') ships.push(f);
  if (!ships.length || !valid(w, st.port)) return;
  const sweet = wantOf(s.wage, SCALE.bribe);
  const start = mix(w.day, 6, ships.length) % ships.length;
  let firm: Firm | undefined, cut = 0;
  for (let k = 0; k < ships.length; k++) {
    const f = ships[(start + k) % ships.length];
    cut = skim(w, f, SCALE.smuggle);
    if (cut > sweet) { firm = f; break; }
  }
  if (!firm || cut <= sweet) return;
  const who = face(g);
  const msg = `${g.name} lands ${usd(cut - sweet)} of ${firm.name}'s cargo past the port, and ${usd(sweet)} stays with ${P.name(st.port)}`;
  const ev = tell(w, 'crime.smuggle', msg, because(st.root, traded?.tradeEv ?? -1, g.lastEv), who >= 0 ? P.id(who) : g.id);
  if (!relay(w, firm.id, g.id, cut, 'crime.smuggle', ev)) return;
  if (!relay(w, firm.id, P.id(st.port), sweet, 'crime.bribe', ev)) return;
  g.lastEv = ev;
  st.ySmuggle++;
  st.yBribe++;
  st.yGang += cut - sweet;
  expose(w, st.port, who >= 0 ? who : st.port, sweet, ev, 'the port');
  if (who >= 0) reportOffence(w, { person: who, firm: firm.idx, gain: cut, text: msg, cause: ev });
}

function shark(w: World): void {
  const st = book(w), s = econ(w), P = s.P;
  const g = gangOf(st, 'shark');
  if (st.debts.length >= 6) return;
  const amt = wantOf(s.wage, SCALE.shark);
  const from = purse(w, g, amt);
  if (amt < 1 || !from) return;
  const person = firstFit(st.desperate, w.day, 9, (i) => {
    if (!valid(w, i) || spare(w, i, 0) >= s.wage * 20) return false;
    if (P.jobless[i] <= 14 && P.broke[i] <= 8) return false;
    for (const d of st.debts) if (d.person === i) return false;
    return true;
  });
  if (person < 0) return;
  const who = face(g);
  const msg = `${g.name} lends ${usd(amt)} to ${P.name(person)} after the bank will not`;
  const ev = tell(w, 'crime.shark', msg, because(st.root, g.lastEv, P.lastEv[person]), who >= 0 ? P.id(who) : g.id);
  if (!relay(w, from, P.id(person), amt, 'crime.shark', ev)) return;
  g.lastEv = ev;
  st.debts.push({ person, gang: st.gangs.indexOf(g), left: Math.round(amt * 1.25), due: w.day + 90, event: ev });
  st.yShark++;
  reportOffence(w, { person, firm: -1, gain: amt, text: msg, cause: ev });
}

function collect(w: World): void {
  const st = book(w), s = econ(w), P = s.P;
  const keep: Debt[] = [];
  for (const d of st.debts) {
    const g = st.gangs[d.gang];
    if (!g || !valid(w, d.person)) continue;
    if (w.day < d.due) { keep.push(d); continue; }
    const payNow = Math.min(d.left, Math.max(0, spare(w, d.person, 7)));
    if (payNow > 0 && relay(w, P.id(d.person), g.id, payNow, 'crime.shark', d.event)) {
      d.left -= payNow;
      st.yGang += payNow;
      if (d.left > 0) keep.push(d);
      continue;
    }
    if (w.day <= d.due + 60) { keep.push(d); continue; }
    const ev = tell(w, 'crime.shark', `${P.name(d.person)} cannot repay ${g.name}`, because(st.root, d.event), P.id(d.person));
    g.lastEv = ev;
  }
  st.debts = keep;
}

function gamble(w: World): void {
  const st = book(w), s = econ(w), P = s.P;
  const g = gangOf(st, 'racket');
  const stake = wantOf(s.wage, SCALE.stake);
  if (stake < 1) return;
  const person = firstFit(st.gamblers, w.day, 2, (i) => valid(w, i) && gambler(s, i) && spare(w, i, 7) >= stake);
  if (person < 0) return;
  const msg = `${P.name(person)} sits at ${g.name}'s table with ${usd(stake)}`;
  const ev = tell(w, 'crime.gambling', msg, because(st.root, g.lastEv, P.lastEv[person]), P.id(person));
  if (!relay(w, P.id(person), g.id, stake, 'crime.gambling', ev)) return;
  st.yGang += stake;
  st.yGamble++;
  const win = mix(w.day, person, 15) % 5 === 0;
  const pot = purse(w, g, stake * 2);
  if (win && pot && relay(w, pot, P.id(person), stake * 2, 'crime.gambling', ev)) st.yGang -= stake * 2;
  g.lastEv = ev;
}

function bribe(w: World): void {
  const st = book(w), s = econ(w), P = s.P;
  const target = bribeTarget(w, st);
  if (!target) return;
  const amt = wantOf(s.wage, SCALE.bribe);
  if (amt < 1) return;
  const g = richest(w, st);
  let from = '', payer = -1;
  if (g && cash(w, g.id) >= amt) { from = g.id; payer = face(g); }
  else {
    payer = firstFit(st.rich, w.day, 17, (i) => valid(w, i) && i !== target.person && spare(w, i, 20) >= amt);
    if (payer >= 0) from = P.id(payer);
  }
  if (!from || payer < 0) return;
  const msg = `${P.name(payer)} pays ${usd(amt)} to ${P.name(target.person)}, ${target.role}`;
  const ev = tell(w, 'crime.bribe', msg, because(st.root, g?.lastEv ?? -1, P.lastEv[payer]), P.id(payer));
  if (!relay(w, from, P.id(target.person), amt, 'crime.bribe', ev)) return;
  if (g && from === g.id) g.lastEv = ev;
  st.yBribe++;
  reportOffence(w, { person: payer, firm: P.employer[payer], gain: amt, text: msg, cause: ev });
  expose(w, target.person, payer, amt, ev, target.role);
}

interface Target { person: number; role: string }

function bribeTarget(w: World, st: Crime): Target | undefined {
  const start = mix(w.day, 8, 1) % 3;
  for (let k = 0; k < 3; k++) {
    const which = (start + k) % 3;
    if (which === 0) {
      const staff = (w.state.law as { staff?: number[] } | undefined)?.staff ?? [];
      const i = staff.length ? staff[mix(w.day, 8, 2) % staff.length] : -1;
      if (valid(w, i)) return { person: i, role: 'an investigator' };
    } else if (which === 1) {
      const pol = w.state.politics as { leader?: number; finance?: number; regulator?: number } | undefined;
      const ids = [pol?.leader ?? -1, pol?.finance ?? -1, pol?.regulator ?? -1];
      const i = ids[mix(w.day, 8, 3) % ids.length];
      if (valid(w, i)) return { person: i, role: 'a minister' };
    } else if (valid(w, st.port)) return { person: st.port, role: 'a port official' };
  }
  return undefined;
}

function expose(w: World, official: number, payer: number, amt: number, cause: number, role: string): void {
  const st = book(w), s = econ(w), P = s.P;
  const chance = Math.min(40, 12 + st.paid);
  if (mix(w.day, official, 9) % 100 >= chance) return;
  const msg = `the papers name ${P.name(official)}, ${role}, for ${usd(amt)} from ${payer >= 0 ? P.name(payer) : 'a gang'}`;
  tell(w, 'crime.exposed', msg, because(st.root, cause), P.id(official));
}

function richest(w: World, st: Crime): Gang | undefined {
  let best: Gang | undefined, have = -1;
  for (const g of st.gangs) {
    const c = cash(w, g.id);
    if (c > have) { have = c; best = g; }
  }
  return best;
}

function launder(w: World): void {
  const st = book(w), s = econ(w), P = s.P;
  const g = richest(w, st);
  if (!g) return;
  const who = face(g);
  washFront(w, st, g, who);
  washHouse(w, st, g, who);
  washCoin(w, st, g, who, s, P);
}

function washFront(w: World, st: Crime, g: Gang, who: number): void {
  const s = econ(w);
  const amt = wantOf(s.wage, SCALE.wash);
  const from = purse(w, g, amt);
  if (amt < 1 || !st.fronts.length || !from) return;
  const idx = st.fronts[w.month % st.fronts.length];
  const f = s.firms[idx];
  if (!f || f.closed) return;
  const msg = `${g.name} runs ${usd(amt)} through ${f.name}`;
  const ev = tell(w, 'crime.launder', msg, because(st.root, g.lastEv), who >= 0 ? s.P.id(who) : g.id);
  if (!relay(w, from, f.id, amt, 'crime.launder', ev)) return;
  g.lastEv = ev;
  st.yWash += amt;
  if (who >= 0) reportOffence(w, { person: who, firm: f.idx, gain: amt, text: msg, cause: ev });
}

function washHouse(w: World, st: Crime, g: Gang, who: number): void {
  const s = econ(w), P = s.P;
  const amt = wantOf(s.wage, SCALE.wash * 0.4);
  const from = purse(w, g, amt);
  if (amt < 1 || !from) return;
  const seller = firstFit(st.rich, w.day, 14, (i) => valid(w, i) && homeOf(w, i) >= 0 && i !== who);
  if (seller < 0) return;
  const msg = `${g.name} buys into ${P.name(seller)}'s house for ${usd(amt)}, in cash`;
  const ev = tell(w, 'crime.launder', msg, because(st.root, g.lastEv), who >= 0 ? P.id(who) : g.id);
  if (!relay(w, from, P.id(seller), amt, 'crime.launder', ev)) return;
  g.lastEv = ev;
  st.yWash += amt;
}

function washCoin(w: World, st: Crime, g: Gang, who: number, s: EconState, P: EconState['P']): void {
  if (!w.state.crypto || who < 0) return;
  const majors = (w.state.crypto as { majors?: { id: string; last: number }[] }).majors;
  const coin = majors?.find((m) => m.id === 'coin:ledger');
  if (!coin || !(coin.last > 0)) return;
  const bid = Math.max(1, Math.round(coin.last * 1.02));
  const from = purse(w, g, bid);
  if (!from) return;
  const msg = `${P.name(who)} puts ${usd(bid)} of ${g.name}'s cash into Ledger`;
  const ev = tell(w, 'crime.launder', msg, because(st.root, g.lastEv), P.id(who));
  if (!relay(w, from, P.id(who), bid, 'crime.launder', ev)) return;
  g.lastEv = ev;
  st.yWash += bid;
}

function dues(w: World): void {
  const st = book(w), s = econ(w), P = s.P;
  const cap = Math.round(s.wage * 12);
  const due = wantOf(s.wage, 0.02);
  if (due < 1) return;
  for (const g of st.gangs) {
    if (cash(w, g.id) >= cap) continue;
    const payers: number[] = [];
    for (const i of g.members) {
      if (!valid(w, i) || spare(w, i, 21) < due) continue;
      payers.push(i);
      if (payers.length >= 4) break;
    }
    if (!payers.length) continue;
    const ev = tell(w, 'crime.dues', `${g.name} collects a float from its people`, because(st.root, g.lastEv), g.id);
    let moved = 0;
    for (const i of payers) {
      if (cash(w, g.id) >= cap) break;
      if (relay(w, P.id(i), g.id, due, 'crime.dues', ev)) moved += due;
    }
    if (moved > 0) g.lastEv = ev;
  }
}

function payPolice(w: World): void {
  const st = book(w), s = econ(w), P = s.P;
  const stipend = wantOf(s.wage, SCALE.policePay);
  const pol = w.state.politics as { platformEv?: number; govEv?: number } | undefined;
  const ev = tell(w, 'crime.police',
    `the treasury pays ${st.police.length} officers, the strength the tax rate allows`,
    because(st.root, pol?.platformEv ?? pol?.govEv ?? -1));
  let paid = 0;
  for (const i of st.police) {
    if (!valid(w, i)) continue;
    if (stipend > 0 && (cash(w, GOV) < stipend || !relay(w, GOV, P.id(i), stipend, 'crime.wage', ev))) break;
    paid++;
  }
  st.paid = paid;
}

function blank(gangs: Gang[]): Crime {
  return {
    root: 0, nextId: 1_000_000_000, log: [], gangs, police: [], paid: 0, port: -1,
    desperate: [], rich: [], finance: [], gamblers: [], fronts: [], heat: [], debts: [], poolMonth: -1,
    yTheft: 0, yBurg: 0, yEmb: 0, yEvade: 0, yFraud: 0, ySmuggle: 0, yRacket: 0, yShark: 0,
    yGamble: 0, yGang: 0, yWash: 0, yArrest: 0, yBribe: 0,
  };
}

export const crime: Module = {
  id: 'crime',
  init(w) {
    const gangs: Gang[] = LOADED.gangs.map((g) => ({
      id: g.id, name: g.name, trade: g.trade, seats: g.seats, members: [], lastEv: -1,
    }));
    for (const g of gangs) w.ledger.addActor(g.id, 'gang');
    const st = blank(gangs);
    w.state.crime = st;
    st.root = w.genesis;
    for (const g of st.gangs) g.lastEv = st.root;
    attach(w);
    refresh(w);
    st.paid = st.police.length;
  },
  dayClose(w) {
    attach(w);
    const d = w.day;
    if (d % 30 === 1) payPolice(w);
    collect(w);
    if (d % 5 === 0) theft(w, false);
    if (d % 11 === 1) theft(w, true);
    if (d % 17 === 2) embezzle(w);
    if (d % 11 === 3) evade(w);
    if (d % 19 === 4) loanFraud(w);
    if (d % 11 === 0) racket(w);
    if (d % 13 === 2) smuggle(w);
    if (d % 23 === 4) shark(w);
    if (d % 7 === 1) gamble(w);
    if (d % 17 === 5) bribe(w);
    if (d % 30 === 14) launder(w);
  },
  monthEnd(w) { refresh(w); dues(w); },
  stats(w) {
    const st = book(w);
    const row = {
      theft: st.yTheft, burglary: st.yBurg, embezzle: st.yEmb, evasion: st.yEvade, loanFraud: st.yFraud,
      smuggle: st.ySmuggle, racket: st.yRacket, shark: st.yShark, gambling: st.yGamble,
      gangIncome: Math.round(st.yGang / 100), laundered: Math.round(st.yWash / 100),
      arrests: st.yArrest, bribes: st.yBribe,
    };
    st.yTheft = 0; st.yBurg = 0; st.yEmb = 0; st.yEvade = 0; st.yFraud = 0;
    st.ySmuggle = 0; st.yRacket = 0; st.yShark = 0; st.yGamble = 0;
    st.yGang = 0; st.yWash = 0; st.yArrest = 0; st.yBribe = 0;
    return row;
  },
};
