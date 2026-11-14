// Schooling, occupations, promotion and migration. Skill still lives on the person, so pay and
// output move only when aptitude, the occupation's rate and years in the trade say they should.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DAYS_PER_YEAR, type Module, type World } from '../../kernel/index.ts';
import { parseRaws, RawReader } from '../../kernel/content.ts';
import { GOV, pay, setHireHook, type EconState, type Firm } from '../economy/index.ts';
import { ALIVE, labourOf, leaveJob, retargetLabour, seekRefresh, setStaffHook, thought } from '../economy/people.ts';
import { PLAYER } from '../player/index.ts';
import { knows } from '../social/index.ts';

interface Occ { id: string; name: string; pay: number; school: number; rank: number; share: Record<string, number> }
interface Book {
  seen: number; poorLine: number; scan: number; openEv: number;
  yPromo: number; yEmigr: number; yImmigr: number; yRetrain: number;
}

const GROUP: Record<string, string> = {
  ENERGY: 'MANUAL', AGRICULTURE: 'MANUAL', MINING: 'MANUAL', CONSTRUCTION: 'MANUAL',
  METALS: 'PLANT', CHEMICALS: 'PLANT', MANUFACTURING: 'PLANT', TECHNOLOGY: 'PLANT',
  TRANSPORT: 'DESK', RETAIL: 'DESK', FINANCE: 'FINANCE', HEALTHCARE: 'CARE', MEDIA: 'CARE',
};
const GROUPS = ['MANUAL', 'PLANT', 'DESK', 'FINANCE', 'CARE'];

function loadOcc(): Occ[] {
  const dir = process.env.SIM_CONTENT ?? fileURLToPath(new URL('../../content/', import.meta.url));
  const raws = parseRaws(readFileSync(join(dir, 'occupations.txt'), 'utf8'), 'occupations.txt');
  const out: Occ[] = [{ id: '', name: '', pay: 1, school: 0, rank: 0, share: {} }];
  for (const raw of raws) {
    if (raw.type !== 'OCCUPATION') continue;
    const r = new RawReader(raw);
    const share: Record<string, number> = {};
    for (const args of r.all('SHARE')) {
      const v = Number(args[1]);
      if (!args[0] || !Number.isFinite(v) || v < 0) throw new Error(`${r.where()}: [SHARE:GROUP:fraction] expected`);
      share[args[0]] = v;
    }
    const pay = r.num('PAY'), school = r.num('SCHOOL');
    if (!(pay > 0) || school < 0) throw new Error(`${r.where()}: pay and schooling must be non-negative`);
    out.push({ id: raw.id, name: r.str('NAME'), pay, school, rank: r.num('RANK'), share });
  }
  if (out.length < 2) throw new Error('occupations.txt: no occupations');
  for (const g of GROUPS) {
    let s = 0;
    for (let k = 1; k < out.length; k++) s += out[k].share[g] ?? 0;
    if (Math.abs(s - 1) > 0.02) throw new Error(`occupations.txt: ${g} shares sum to ${s.toFixed(3)}`);
  }
  return out;
}

const OCC = loadOcc();
const LAB = Math.max(1, OCC.findIndex((o) => o.id === 'LABOURER'));
const FIN = Math.max(0, OCC.findIndex((o) => o.id === 'FINANCE'));
const MGR = Math.max(0, OCC.findIndex((o) => o.id === 'MANAGER'));
const DIR = Math.max(0, OCC.findIndex((o) => o.id === 'DIRECTOR'));
const DEG = 16;

const econ = (w: World): EconState => w.state.economy as EconState;
const book = (w: World): Book => w.state.careers as Book;
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
const expOf = (years: number): number => 1 + 0.012 * Math.min(8, Math.max(0, years));
const schoolFromSkill = (skill: number): number => clamp(Math.round(8 + (skill - 0.85) * 7), 6, 18);

function setSkill(w: World, i: number, next: number): void {
  const s = econ(w), P = s.P;
  const before = labourOf(P, i, w.day);
  P.skill[i] = next;
  retargetLabour(s, i, before, labourOf(P, i, w.day));
}
function paySkill(i: number, occ: number, years: number, P: EconState['P']): number {
  const apt = P.apt[i] > 0 ? P.apt[i] : P.skill[i];
  return clamp(apt * OCC[occ].pay * expOf(years), 0.5, 3);
}

function groupOf(sector: string): string { return GROUP[sector] ?? 'PLANT'; }
const targetCache = new Map<string, number[]>();
function targets(sector: string, n: number): number[] {
  const key = sector + ':' + n;
  const hit = targetCache.get(key);
  if (hit) return hit;
  const g = groupOf(sector);
  const raw = OCC.map((o, k) => (k === 0 ? 0 : o.share[g] ?? 0));
  const out = raw.map((s) => Math.floor(s * n));
  let left = n - out.reduce((a, b) => a + b, 0);
  const frac = raw.map((s, k) => ({ k, f: s * n - Math.floor(s * n) })).sort((a, b) => b.f - a.f || a.k - b.k);
  for (let i = 0; i < frac.length && left > 0; i++) {
    if (frac[i].k === 0) continue;
    out[frac[i].k]++; left--;
  }
  targetCache.set(key, out);
  return out;
}
function qualifies(school: number, occ: number, ceo: boolean): boolean {
  const need = OCC[occ].school;
  if (school >= need) return true;
  return ceo && occ === DIR && school >= need - 2;
}

function familyCash(w: World, i: number): number {
  const P = econ(w).P, a = P.parent[i];
  if (a < 0 || a >= P.n) return 0;
  const b = P.spouse[a];
  const ca = w.ledger.balance(P.id(a), 'dep');
  if (b < 0 || b >= P.n || !P.alive(b)) return ca;
  return (ca + w.ledger.balance(P.id(b), 'dep')) / 2;
}
function cashLine(w: World): number {
  const P = econ(w).P, xs: number[] = [];
  for (let i = 0; i < P.n; i++) if (P.adult(w, i)) xs.push(w.ledger.balance(P.id(i), 'dep'));
  if (!xs.length) return 1;
  xs.sort((a, b) => a - b);
  return Math.max(1, xs[Math.floor(0.4 * (xs.length - 1))]);
}
function educate(w: World, i: number): void {
  const P = econ(w).P, parent = P.parent[i];
  const r = w.rng('life:school');
  const ps = parent >= 0 && parent < P.n ? P.school[parent] : 10;
  const sp = parent >= 0 && parent < P.n ? P.spouse[parent] : -1;
  const ss = sp >= 0 && sp < P.n && P.school[sp] > 0 ? P.school[sp] : ps;
  const pSchool = parent >= 0 ? (ps + ss) / 2 : 10;
  const cash = parent >= 0 ? familyCash(w, i) : book(w).poorLine;
  const line = Math.max(1, book(w).poorLine);
  const rich = clamp(cash / (line * 2.5), 0, 1);
  if (parent >= 0) P.poor[i] = cash < line ? 1 : 2;
  const luck = 6 + r.next() * 12;
  P.school[i] = clamp(Math.round(0.42 * pSchool + 0.16 * (6 + 12 * rich) + 0.42 * luck), 6, 18);
  const base = 0.94 + (P.school[i] - 11) * 0.055;
  P.skill[i] = clamp(base * Math.exp(0.4 * r.normal()), 0.5, 3);
  P.apt[i] = P.skill[i];
  P.occ[i] = 0; P.occYrs[i] = 0;
}

const RANK: number[] = [];
for (let k = 1; k < OCC.length; k++) RANK.push(k);
RANK.sort((a, b) => OCC[b].rank - OCC[a].rank || a - b);

/** One stamp array, reused. A person is taken for this firm when the stamp equals the generation. */
let usedStamp = new Int32Array(0);
let usedGen = 1;
function taken(i: number): boolean { return i < usedStamp.length && usedStamp[i] === usedGen; }
function take(i: number): void {
  if (usedStamp.length <= i) {
    const next = new Int32Array(Math.max(i + 1, usedStamp.length * 2));
    next.set(usedStamp);
    usedStamp = next;
  }
  usedStamp[i] = usedGen;
}

function assignFirm(w: World, f: Firm): void {
  const P = econ(w).P, staff = f.staff, n = staff.length;
  if (!n) return;
  const want = targets(f.sector, n);
  const order = staff.slice();
  order.sort((a, b) => {
    const sa = P.skill[a] + (a === f.ceo ? 2 : 0);
    const sb = P.skill[b] + (b === f.ceo ? 2 : 0);
    return sb - sa || a - b;
  });
  if (++usedGen === 0x7fffffff) { usedStamp = new Int32Array(usedStamp.length); usedGen = 1; }
  for (const k of RANK) {
    let need = want[k] ?? 0;
    if (!(need > 0)) continue;
    for (let t = 0; t < order.length && need > 0; t++) {
      const i = order[t];
      if (taken(i) || !qualifies(P.school[i], k, i === f.ceo)) continue;
      P.occ[i] = k; take(i); need--;
    }
  }
  for (let t = 0; t < staff.length; t++) if (!taken(staff[t])) P.occ[staff[t]] = LAB;
  let sum0 = 0, sumW = 0;
  const wgt = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const i = staff[k];
    sum0 += P.skill[i];
    wgt[k] = OCC[P.occ[i]].pay * expOf(P.occYrs[i]);
    sumW += P.skill[i] * wgt[k];
  }
  const scale = sumW > 0 ? sum0 / sumW : 1;
  for (let k = 0; k < n; k++) {
    const i = staff[k];
    const skill = clamp(P.skill[i] * wgt[k] * scale, 0.5, 3);
    P.apt[i] = wgt[k] > 0 ? skill / wgt[k] : skill;
    setSkill(w, i, skill);
  }
}

/** Headcount for one firm. Joins and leaves update it; a promotion or a retrain throws it away. */
let cacheF = -1;
let cacheOk = false;
let cacheHave: number[] = [];

function bustOcc(): void { cacheOk = false; }
function noteStaff(firmIdx: number, _person: number, occ: number, joined: boolean): void {
  if (!cacheOk || cacheF !== firmIdx) return;
  if (occ > 0 && occ < cacheHave.length) cacheHave[occ] += joined ? 1 : -1;
}
function haveOcc(f: Firm, P: EconState['P']): number[] {
  if (cacheOk && cacheF === f.idx) return cacheHave;
  if (cacheHave.length !== OCC.length) cacheHave = OCC.map(() => 0);
  else cacheHave.fill(0);
  const occ = P.occ, staff = f.staff, h = cacheHave, m = h.length;
  for (let k = 0; k < staff.length; k++) {
    const o = occ[staff[k]];
    if (o > 0 && o < m) h[o]++;
  }
  cacheF = f.idx; cacheOk = true;
  return h;
}
function pickOcc(w: World, f: Firm, person: number): number {
  const P = econ(w).P;
  const have = haveOcc(f, P);
  const want = targets(f.sector, f.staff.length);
  let best = LAB, gap = (want[LAB] ?? 0) - (have[LAB] ?? 0);
  for (let k = 1; k < OCC.length; k++) {
    if (!qualifies(P.school[person], k, person === f.ceo)) continue;
    const g = (want[k] ?? 0) - (have[k] ?? 0);
    if (g > gap || (g === gap && OCC[k].rank > OCC[best].rank)) { gap = g; best = k; }
  }
  return best;
}
function onHire(w: World, person: number, f: Firm): void {
  const P = econ(w).P;
  if (!(P.apt[person] > 0)) P.apt[person] = Math.max(0.5, P.skill[person]);
  if (P.school[person] < 6) P.school[person] = schoolFromSkill(P.skill[person]);
  const prev = P.occ[person];
  const occ = pickOcc(w, f, person);
  if (occ !== prev) {
    if (cacheOk && cacheF === f.idx) {
      if (prev > 0 && prev < cacheHave.length) cacheHave[prev]--;
      if (occ > 0 && occ < cacheHave.length) cacheHave[occ]++;
    }
    P.occYrs[person] = 0;
  }
  P.occ[person] = occ;
  setSkill(w, person, paySkill(person, occ, P.occYrs[person], P));
}

function liked(w: World, person: number, chief: number): number {
  if (chief < 0) return 0;
  const st = w.state.social as { contact?: Int32Array; fam?: Uint16Array } | undefined;
  if (!st?.contact || !st.fam || person < 0) return 0;
  const b = person * DEG;
  if (b + DEG > st.contact.length) return 0;
  for (let k = 0; k < DEG; k++) if (st.contact[b + k] === chief) return st.fam[b + k];
  return 0;
}
function promote(w: World, cause: number): void {
  const st = book(w), s = econ(w), P = s.P;
  let noted = 0, dirty = false;
  for (const f of s.firms) {
    if (f.closed || f.staff.length < 6) continue;
    const have = haveOcc(f, P);
    const want = targets(f.sector, f.staff.length);
    for (const seat of [DIR, MGR]) {
      if (seat <= 0 || have[seat] >= want[seat]) continue;
      let best = -1, sc = -1e9;
      for (const i of f.staff) {
        if (P.occ[i] === seat || !P.alive(i)) continue;
        if (!qualifies(P.school[i], seat, i === f.ceo)) continue;
        if (OCC[P.occ[i]] && OCC[P.occ[i]].rank > OCC[seat].rank) continue;
        const scv = P.skill[i] + liked(w, i, f.ceo) / 180;
        if (scv > sc || (scv === sc && (best < 0 || i < best))) { sc = scv; best = i; }
      }
      if (best < 0) continue;
      const from = OCC[P.occ[best]]?.name ?? 'the floor';
      P.occYrs[best] = 0; P.occ[best] = seat;
      setSkill(w, best, paySkill(best, seat, 0, P));
      have[seat]++; st.yPromo++; dirty = true;
      if (noted < 16) {
        const ev = w.events.emit('career.promotion', `${P.name(best)} is promoted from ${from} to ${OCC[seat].name} at ${f.name}`, [cause, f.ceoEv ?? cause], P.id(best));
        P.lastEv[best] = ev; thought(w, s, best, -50, 'a promotion', ev); noted++;
      }
    }
  }
  if (dirty) bustOcc();
}

function retrain(w: World, cause: number): void {
  const st = book(w), s = econ(w), P = s.P;
  const want = OCC.map(() => 0);
  const have = OCC.map(() => 0);
  for (const f of s.firms) {
    if (f.closed) continue;
    const t = targets(f.sector, f.staff.length);
    for (let k = 1; k < OCC.length; k++) want[k] += t[k];
    for (const i of f.staff) if (P.occ[i] > 0) have[P.occ[i]]++;
  }
  let surplus = -1, short = -1, extra = 0, need = 0;
  for (let k = 1; k < OCC.length; k++) {
    if (k === MGR || k === DIR) continue;
    const over = have[k] - want[k], under = want[k] - have[k];
    if (over > extra) { extra = over; surplus = k; }
    if (under > need) { need = under; short = k; }
  }
  if (surplus < 0 || short < 0 || extra < Math.max(6, want[surplus] * 0.12)) return;
  const cap = Math.min(10, Math.ceil(extra / 24));
  const start = st.scan % Math.max(1, P.n);
  let moved = 0;
  for (let step = 0; step < P.n && moved < cap; step++) {
    const i = (start + step) % P.n;
    if (P.occ[i] !== surplus || P.employer[i] < 0 || !qualifies(P.school[i], short, false)) continue;
    const f = s.firms[P.employer[i]];
    if (!f || f.ceo === i) continue;
    P.occYrs[i] = 0; P.occ[i] = short;
    setSkill(w, i, paySkill(i, short, 0, P));
    moved++;
  }
  st.scan = (start + 89) % Math.max(1, P.n);
  if (!moved) return;
  bustOcc();
  st.yRetrain += moved;
  w.events.emit('career.retrain', `${moved} ${OCC[surplus].name}s retrain as ${OCC[short].name}s, where firms are short`, [cause]);
}

function foreignDaily(w: World): number | undefined {
  const a = w.state.abroad as { wage?: number; foreignWage?: number; plevel?: number; activity?: number } | undefined;
  if (!a) return undefined;
  if (typeof a.foreignWage === 'number' && a.foreignWage > 0) return a.foreignWage;
  if (typeof a.wage === 'number' && a.wage > 0) return a.wage;
  return 100_00 * (a.plevel ?? 1) * (a.activity ?? 1);
}
function depart(w: World, i: number, cause: number): boolean {
  const s = econ(w), P = s.P;
  const cash = Math.floor(w.ledger.balance(P.id(i), 'dep'));
  if (cash > 0 && !pay(w, P.id(i), GOV, cash, 'migration.depart', cause)) return false;
  for (const id of s.shareIds) {
    const n = Math.floor(w.ledger.balance(P.id(i), id));
    if (n > 0) w.ledger.move(id, P.id(i), GOV, n, 'migration.depart', cause);
  }
  leaveJob(s, i);
  P.flags[i] &= ~ALIVE;
  seekRefresh(P, i);
  P.migrant[i] = 2; P.occ[i] = 0;
  return true;
}
function migrate(w: World): void {
  const st = book(w), s = econ(w), P = s.P;
  const u = s.unemployment;
  if (u >= 0.09) {
    const cap = Math.min(8, Math.max(1, Math.round((u - 0.08) * 70)));
    const start = st.scan % Math.max(1, P.n);
    const leaving: number[] = [];
    for (let step = 0; step < P.n && leaving.length < cap; step++) {
      const i = (start + step) % P.n;
      if (!P.alive(i) || P.retired(i) || (P.flags[i] & PLAYER) !== 0) continue;
      const age = P.age(w, i);
      if (age < 20 || age > 36 || P.spouse[i] >= 0 || P.nkids[i] > 0) continue;
      if (P.employer[i] >= 0) {
        if (u < 0.14 || s.firms[P.employer[i]]?.ceo === i) continue;
      }
      leaving.push(i);
    }
    if (leaving.length) {
      const ev = w.events.emit('career.emigrate', `${leaving.length} young people leave while unemployment is ${(u * 100).toFixed(1)}%`, [s.macroEv, s.wageEv]);
      let n = 0;
      for (const i of leaving) if (depart(w, i, ev)) n++;
      st.yEmigr += n;
    }
  }
  const foreign = foreignDaily(w);
  const boom = u <= 0.048 && (foreign === undefined || s.wage > foreign);
  if (boom) {
    const cap = Math.min(6, Math.max(1, Math.round((0.055 - u) * 180)));
    const abroad = w.state.abroad as { priceEv?: number } | undefined;
    const causes = [s.macroEv, s.wageEv];
    if (abroad && abroad.priceEv !== undefined && abroad.priceEv >= 0) causes.push(abroad.priceEv);
    const ev = w.events.emit('career.immigrate', `${cap} adults arrive; wages here beat what they could earn abroad`, causes);
    for (let k = 0; k < cap; k++) {
      const age = 22 + ((st.scan + k * 3) % 14);
      const i = P.add(w, w.day - age * DAYS_PER_YEAR, -1, -1);
      P.migrant[i] = 1;
      P.school[i] = schoolFromSkill(P.skill[i]);
      P.apt[i] = P.skill[i];
      P.poor[i] = 0; P.occ[i] = 0; P.occYrs[i] = 0;
      pay(w, GOV, P.id(i), Math.round(s.wage * P.skill[i] * 18), 'migration.arrive', ev);
    }
    st.yImmigr += cap;
    st.seen = P.n;
  }
  st.scan = (st.scan + 211) % Math.max(1, P.n);
}

function briefFinance(w: World): void {
  const soc = w.state.social as { insiderFact?: Int32Array; facts?: { id: number; pub: boolean; drop: boolean; eventId: number }[] } | undefined;
  if (!soc?.insiderFact || !soc.facts || FIN <= 0) return;
  const s = econ(w), P = s.P;
  let noted = 0;
  for (let fi = 0; fi < s.firms.length && noted < 3; fi++) {
    const id = soc.insiderFact[fi];
    if (id == null || id < 0 || id >= soc.facts.length) continue;
    const fact = soc.facts[id];
    if (!fact || fact.pub || fact.drop) continue;
    for (const i of s.firms[fi].staff) {
      if ((P.occ[i] !== FIN && P.occ[i] !== DIR) || !knows(w, i, fact.id)) continue;
      const ev = w.events.emit('career.privy', `${P.name(i)}, ${OCC[P.occ[i]].name} at ${s.firms[fi].name}, sees the month's figures before they are public`, [fact.eventId], P.id(i));
      P.lastEv[i] = ev; noted++; break;
    }
  }
}

function schoolNew(w: World): void {
  const st = book(w), P = econ(w).P;
  if (P.n === st.seen) return;
  for (let i = st.seen; i < P.n; i++) {
    if (P.migrant[i] === 1 || P.school[i] > 0) continue;
    if (P.parent[i] >= 0) educate(w, i);
    else { P.school[i] = schoolFromSkill(P.skill[i]); P.apt[i] = P.skill[i]; }
  }
  st.seen = P.n;
}
function grow(w: World): void {
  const P = econ(w).P;
  for (let i = 0; i < P.n; i++) {
    if (P.occ[i] <= 0 || P.employer[i] < 0 || !P.alive(i)) continue;
    if (P.occYrs[i] < 255) P.occYrs[i]++;
    if (P.occYrs[i] <= 8 && P.apt[i] > 0) setSkill(w, i, paySkill(i, P.occ[i], P.occYrs[i], P));
  }
}

export const careers: Module = {
  id: 'careers',
  init(w) {
    const s = econ(w), P = s.P;
    const st: Book = { seen: 0, poorLine: 1, scan: 0, openEv: 0, yPromo: 0, yEmigr: 0, yImmigr: 0, yRetrain: 0 };
    w.state.careers = st;
    cacheOk = false; cacheF = -1;
    setStaffHook(noteStaff);
    setHireHook(onHire);
    for (let i = 0; i < P.n; i++) {
      if (!P.alive(i)) continue;
      P.school[i] = schoolFromSkill(P.skill[i]);
      P.apt[i] = P.skill[i];
      if (P.adult(w, i)) P.occYrs[i] = Math.min(40, P.age(w, i) - 18);
    }
    st.poorLine = cashLine(w);
    for (let i = 0; i < P.n; i++) {
      if (!P.alive(i) || P.parent[i] < 0) continue;
      if (P.age(w, i) < 18) educate(w, i);
      else P.poor[i] = familyCash(w, i) < st.poorLine ? 1 : 2;
    }
    for (const f of s.firms) assignFirm(w, f);
    st.seen = P.n;
    const n = s.firms.reduce((t, f) => t + f.staff.length, 0);
    st.openEv = w.events.emit('career.open', `${n} workers placed in ${OCC.length - 1} occupations across ${s.firms.length} firms`, [w.genesis]);
  },

  dayClose(w) {
    schoolNew(w);
    if (w.day > 0 && w.day % DAYS_PER_YEAR === 0) {
      book(w).poorLine = cashLine(w);
      grow(w);
    }
  },

  monthEnd(w) {
    const cause = book(w).openEv || econ(w).macroEv;
    promote(w, cause);
    retrain(w, cause);
    migrate(w);
    briefFinance(w);
  },

  stats(w) {
    const st = book(w), s = econ(w), P = s.P;
    const have = OCC.map(() => 0);
    const pay: number[] = [];
    let school = 0, adults = 0, poor = 0, poorTop = 0;
    for (let i = 0; i < P.n; i++) {
      if (!P.alive(i)) continue;
      if (P.adult(w, i)) { school += P.school[i]; adults++; }
      if (P.employer[i] >= 0 && P.occ[i] > 0) { have[P.occ[i]]++; pay.push(P.skill[i]); }
    }
    pay.sort((a, b) => a - b);
    const dec = Math.max(1, Math.floor(pay.length / 10));
    let lo = 0, hi = 0;
    for (let i = 0; i < dec; i++) { lo += pay[i]; hi += pay[pay.length - 1 - i]; }
    const employed = Math.max(1, pay.length);
    const topCut = pay.length ? pay[Math.max(0, pay.length - dec)] : Infinity;
    for (let i = 0; i < P.n; i++) {
      if (P.poor[i] !== 1 || !P.adult(w, i)) continue;
      poor++;
      if (P.employer[i] >= 0 && P.skill[i] >= topCut) poorTop++;
    }
    const share = (k: number): number => +((have[k] / employed) * 100).toFixed(1);
    const out = {
      lab: share(LAB), trd: share(OCC.findIndex((o) => o.id === 'TRADE')),
      clk: share(OCC.findIndex((o) => o.id === 'CLERK')), eng: share(OCC.findIndex((o) => o.id === 'ENGINEER')),
      fin: share(FIN), mgr: share(MGR), dir: share(DIR),
      school: +(adults ? school / adults : 0).toFixed(1),
      promo: st.yPromo, emigr: st.yEmigr, immigr: st.yImmigr,
      gap: +(lo > 0 ? hi / lo : 1).toFixed(2),
      poorTop: poor ? +((poorTop / poor) * 100).toFixed(1) : 0,
    };
    st.yPromo = 0; st.yEmigr = 0; st.yImmigr = 0; st.yRetrain = 0;
    return out;
  },
};
