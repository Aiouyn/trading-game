// People: every person is an individual with a name, a family, an age, skill, traits, an employer,
// a bank balance on the ledger, needs and stress.
// Mechanics adapted from the Dwarf Fortress decompilation:
//   - a thought has a raw intensity that a personality trait (0-100) dampens: 100 -> none, 67+ -> a tenth, 33+ -> half, else full
//   - positions are refilled heirs first (search children, then grandchildren), then any qualified member, and a
//     successor who leaves another position triggers succession there too
//   - life events (death, pairing, births) run in one yearly pass
import { DAYS_PER_YEAR, type World } from '../../kernel/index.ts';
import { DEP, GOV, pay, type EconState, type Firm } from './index.ts';

export const CEO_BAD_MONTHS = 6;
const RETIRE_AGE = 65, ADULT_AGE = 18;
const BREAKDOWN_AT = 220;

export interface Person {
  i: number; id: string; given: string; family: string; born: number;
  skill: number;      // productivity and pay multiplier, about 0.5 to 3
  resil: number;      // 0-100: how much thoughts are dampened
  cY: number;         // share of income spent (prudence is the inverse)
  employer: number;   // firm index or -1
  spouse: number; parent: number; kids: number[];
  alive: boolean; retired: boolean;
  incEma: number; incWeek: number;
  jobless: number; broke: number; stress: number; fearUntil: number;
  lastEv?: number;    // the event that last changed this person's situation
}

const SYL = ['an', 'bel', 'cor', 'dan', 'el', 'far', 'gal', 'hal', 'is', 'jor', 'kel', 'lin', 'mar', 'nor', 'or', 'per', 'quin', 'ros', 'sal', 'tor', 'ul', 'ver', 'wen', 'yan', 'zel'];
const END = ['a', 'e', 'o', 'en', 'is', 'ia', 'us', 'el', 'an', 'in'];
const FAM = ['sen', 'ford', 'mont', 'wick', 'by', 'ham', 'dale', 'ard', 'ell', 'stone', 'well', 'ley'];
const cap = (x: string): string => x[0].toUpperCase() + x.slice(1);
export const personName = (p: Person): string => `${p.given} ${p.family}`;
export const ageOf = (w: World, p: Person): number => Math.floor((w.day - p.born) / DAYS_PER_YEAR);
export const isAdult = (w: World, p: Person): boolean => p.alive && !p.retired && ageOf(w, p) >= ADULT_AGE;

export function makePerson(w: World, s: EconState, i: number, born: number, parents: [Person, Person] | undefined): Person {
  const r = w.rng('life:traits');
  const draw = Math.exp(0.35 * r.normal());
  const skill = Math.max(0.5, Math.min(3, parents ? 0.5 * draw + 0.25 * (parents[0].skill + parents[1].skill) : draw));
  return {
    i, id: 'p_' + i, given: cap(SYL[r.int(SYL.length)] + END[r.int(END.length)]),
    family: parents ? parents[0].family : cap(SYL[r.int(SYL.length)] + SYL[r.int(SYL.length)] + FAM[r.int(FAM.length)]),
    born, skill, resil: r.int(101), cY: 0.8 + 0.18 * r.next(), employer: -1, spouse: -1,
    parent: parents ? parents[0].i : -1, kids: [], alive: true, retired: false,
    incEma: 0, incWeek: 0, jobless: 0, broke: 0, stress: 0, fearUntil: -1,
  };
}

/** A thought lands on a person. The resilience trait dampens it. Enough stress causes a breakdown: months of fearful saving. */
export function thought(w: World, s: EconState, p: Person, raw: number, what: string, cause: number): void {
  const v = p.resil >= 100 ? 0 : p.resil >= 67 ? Math.floor(raw / 10) : p.resil >= 33 ? Math.floor(raw / 2) : raw;
  p.stress += v;
  if (p.stress >= BREAKDOWN_AT && w.day >= p.fearUntil) {
    p.fearUntil = w.day + 180; p.stress = BREAKDOWN_AT / 2; s.breakdowns++;
    // Only the first few each month are written to the log; the count is in the stats.
    if (s.breakdowns % 25 === 1) p.lastEv = w.events.emit('person.breakdown', `${personName(p)} (${ageOf(w, p)}) broke down: ${what}. Cuts spending for six months`, [p.lastEv ?? cause], p.id);
  }
}

export function leaveJob(s: EconState, p: Person): void {
  if (p.employer < 0) return;
  const f = s.firms[p.employer];
  const k = f.staff.indexOf(p.i);
  if (k >= 0) { f.staff.splice(k, 1); f.eff -= p.skill; f.workers = f.staff.length; }
  p.employer = -1;
}
export function joinFirm(s: EconState, p: Person, f: Firm): void {
  leaveJob(s, p);
  p.employer = f.idx; p.jobless = 0; f.staff.push(p.i); f.eff += p.skill; f.workers = f.staff.length;
}

/** Fill a vacant chief executive seat. Family firms search the old chief's descendants first. */
export function succession(w: World, s: EconState, f: Firm, old: Person | undefined, why: string, cause: number): void {
  let pick: Person | undefined, how = 'promoted from the staff';
  if (f.family && old) {
    let gen = old.kids.map((k) => s.people[k]);
    for (let depth = 0; depth < 3 && gen.length && !pick; depth++) {
      const ok = gen.filter((c) => isAdult(w, c));
      if (ok.length) { pick = ok.reduce((a, b) => (b.skill > a.skill ? b : a)); how = depth ? `grandchild of ${personName(old)}` : `child of ${personName(old)}`; }
      else gen = gen.flatMap((c) => c.kids.map((k) => s.people[k]));
    }
    if (!pick && old.spouse >= 0 && isAdult(w, s.people[old.spouse])) { pick = s.people[old.spouse]; how = `spouse of ${personName(old)}`; }
  }
  if (!pick) {
    const pool = f.staff.map((x) => s.people[x]).filter((p) => p !== old && isAdult(w, p));
    if (pool.length) pick = pool.reduce((a, b) => (b.skill > a.skill ? b : a));
  }
  if (!pick) { f.ceo = -1; return; }
  const from = pick.employer >= 0 && pick.employer !== f.idx ? s.firms[pick.employer] : undefined;
  const wasCeoThere = from !== undefined && from.ceo === pick.i;
  joinFirm(s, pick, f);
  f.ceo = pick.i; f.badMonths = 0; s.successions++;
  f.ceoEv = w.events.emit('firm.succession', `${personName(pick)} (${ageOf(w, pick)}) becomes chief executive of ${f.id}, ${how}, after ${old ? personName(old) : 'a vacancy'} ${why}`, [cause], f.id);
  pick.lastEv = f.ceoEv;
  if (wasCeoThere && from) succession(w, s, from, pick, `left to run ${f.id}`, f.ceoEv); // the vacated seat is refilled too
}

function die(w: World, s: EconState, p: Person, yearEv: number): void {
  const L = w.ledger;
  const spouse = p.spouse >= 0 ? s.people[p.spouse] : undefined;
  let heirs = spouse?.alive ? [spouse] : p.kids.map((k) => s.people[k]).filter((k) => k.alive);
  const holdings = [...L.instruments.keys()].filter((id) => id.startsWith('eq:') && L.balance(p.id, id) > 0);
  const cashNow = L.balance(p.id, DEP);
  const notable = holdings.length > 0 || (p.employer >= 0 && s.firms[p.employer].ceo === p.i);
  const ev = notable
    ? w.events.exo('person.died', `${personName(p)} died aged ${ageOf(w, p)}${heirs.length ? `; estate of ${(cashNow / 100).toFixed(0)} and ${holdings.length} shareholdings passes to ${heirs.map(personName).join(', ')}` : '; no heirs, the estate goes to the state'}`, p.id)
    : yearEv;
  p.alive = false;
  if (!heirs.length) { pay(w, p.id, GOV, cashNow, 'estate.escheat', ev); heirs = []; }
  heirs.forEach((h, k) => {
    const last = k === heirs.length - 1;
    pay(w, p.id, h.id, last ? L.balance(p.id, DEP) : Math.floor(cashNow / heirs.length), 'estate.inherit', ev);
    for (const id of holdings) { const n = L.balance(p.id, id); L.move(id, p.id, h.id, last ? n : Math.floor(n / (heirs.length - k)), 'estate.inherit', ev); }
    h.lastEv = ev;
  });
  if (!heirs.length) for (const id of holdings) { // unclaimed shares go to the largest remaining holder's pool: the state sells nothing yet
    L.move(id, p.id, s.people.find((x) => x.alive && L.balance(x.id, id) > 0)?.id ?? p.id, L.balance(p.id, id), 'estate.escheat', ev);
  }
  if (spouse) spouse.spouse = -1;
  const f = p.employer >= 0 ? s.firms[p.employer] : undefined;
  const wasCeo = f?.ceo === p.i;
  leaveJob(s, p);
  if (f && wasCeo) succession(w, s, f, p, 'died', ev);
}

/** Once a year: deaths, retirements, pairings, births. */
export function yearlyLifePass(w: World, s: EconState): void {
  const r = w.rng('life:events');
  const yearEv = w.events.exo('life.year', `year ${w.year}: births, deaths, marriages and retirements`);
  let deaths = 0, births = 0, pairs = 0;
  const n0 = s.people.length;
  const single: Person[] = [];
  for (let i = 0; i < n0; i++) {
    const p = s.people[i];
    if (!p.alive) continue;
    const a = ageOf(w, p);
    if (r.chance(Math.min(0.9, 0.0004 * Math.exp(Math.max(0, a - 30) / 9.5)))) { die(w, s, p, yearEv); deaths++; continue; }
    if (a >= RETIRE_AGE && !p.retired) {
      const f = p.employer >= 0 ? s.firms[p.employer] : undefined, wasCeo = f?.ceo === p.i;
      p.retired = true; leaveJob(s, p);
      if (f && wasCeo) succession(w, s, f, p, 'retired', yearEv);
    }
    if (p.spouse < 0 && a >= 20 && a <= 50 && r.chance(1 / 3)) single.push(p);
  }
  single.sort((a, b) => a.born - b.born || a.i - b.i);
  for (let k = 0; k + 1 < single.length; k += 2) {
    const a = single[k], b = single[k + 1];
    if (a.family === b.family || a.parent === b.i || b.parent === a.i) continue;
    a.spouse = b.i; b.spouse = a.i; pairs++;
  }
  for (let i = 0; i < n0; i++) {
    const p = s.people[i];
    if (!p.alive || p.spouse < p.i) continue;
    const q = s.people[p.spouse];
    const young = Math.min(ageOf(w, p), ageOf(w, q));
    if (!q.alive || young < 20 || young > 42 || p.kids.length >= 4 || !r.chance(0.13)) continue;
    const c = makePerson(w, s, s.people.length, w.day, [p, q]);
    s.people.push(c); w.ledger.addActor(c.id, 'person'); p.kids.push(c.i); q.kids.push(c.i); births++;
  }
  s.laborForce = s.people.reduce((t, p) => t + (isAdult(w, p) ? 1 : 0), 0);
  // The stock market's household investors are the 300 richest living people.
  const rich = s.people.filter((p) => p.alive).sort((a, b) => w.ledger.balance(b.id, DEP) - w.ledger.balance(a.id, DEP) || a.i - b.i).slice(0, 300);
  s.investors = rich.map((p, k) => ({ id: p.id, target: 0.6 - 0.3 * k / 300 }));
  w.events.emit('life.tally', `${deaths} deaths, ${births} births, ${pairs} marriages; ${s.people.filter((p) => p.alive).length} people alive`, [yearEv]);
}
