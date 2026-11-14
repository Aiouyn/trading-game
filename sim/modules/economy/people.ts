// People: every person is an individual with a name, a family, an age, skill, traits, an employer,
// a bank balance on the ledger, needs and stress.
//
// Storage follows STONKS-9800 (docs/reverse-engineering/STONKS-9800/analysis/02-companies-npcs.md:97): there is no person
// object. Each attribute is its own array indexed by person number (P.skill[i], P.employer[i], ...), so hundreds of
// thousands of people cost a few dozen bytes each and the hot loops read contiguous memory.
//
// Mechanics adapted from the Dwarf Fortress decompilation:
//   - a thought has a raw intensity that a personality trait (0-100) dampens: 100 -> none, 67+ -> a tenth, 33+ -> half, else full
//   - positions are refilled heirs first (search children, then grandchildren), then any qualified member, and a
//     successor who leaves another position triggers succession there too
//   - life events (death, pairing, births) run in one yearly pass
import { DAYS_PER_YEAR, type World } from '../../kernel/index.ts';
import { CEO_POSITION } from './content.ts';
import { DEP, type EconState, type Firm } from './index.ts';

const RETIRE_AGE = CEO_POSITION.retireAge, ADULT_AGE = 18;
const BREAKDOWN_AT = 220;
export const ALIVE = 1, RETIRED = 2, PRISON = 4; // PRISON: no job, no wage and no benefit until the sentence ends

const SYL = ['an', 'bel', 'cor', 'dan', 'el', 'far', 'gal', 'hal', 'is', 'jor', 'kel', 'lin', 'mar', 'nor', 'or', 'per', 'quin', 'ros', 'sal', 'tor', 'ul', 'ver', 'wen', 'yan', 'zel'];
const END = ['a', 'e', 'o', 'en', 'is', 'ia', 'us', 'el', 'an', 'in'];
const FAM = ['sen', 'ford', 'mont', 'wick', 'by', 'ham', 'dale', 'ard', 'ell', 'stone', 'well', 'ley'];
const cap = (x: string): string => x[0].toUpperCase() + x.slice(1);
const GIVEN = SYL.flatMap((a) => END.map((b) => cap(a + b)));

const FIELDS: [string, any][] = [
  ['born', Int32Array], ['skill', Float64Array], ['resil', Uint8Array], ['cY', Float64Array],
  ['employer', Int32Array], ['staffPos', Int32Array], ['spouse', Int32Array], ['parent', Int32Array],
  ['firstKid', Int32Array], ['nextSib', Int32Array], ['nkids', Uint8Array], ['flags', Uint8Array],
  ['incEma', Float64Array], ['incWeek', Float64Array], ['jobless', Int32Array], ['broke', Int32Array],
  ['stress', Float64Array], ['fearUntil', Int32Array], ['lastEv', Int32Array],
  ['given', Uint16Array], ['family', Int32Array], ['slot', Int32Array],
  ['health', Uint8Array], ['mood', Uint8Array], ['condition', Uint8Array],
  ['anxiety', Uint8Array], ['greed', Uint8Array], ['kin', Uint8Array], ['diligence', Uint8Array],
  ['habit', Uint8Array], ['habitLeft', Uint16Array], ['wdDays', Uint16Array], ['outUntil', Int32Array],
  ['brokeStep', Uint8Array], ['stressRun', Uint16Array], ['mem', Uint32Array], ['memN', Uint32Array],
  ['anxDone', Uint8Array], ['wealthMark', Float64Array], ['incMark', Float64Array],
  ['school', Uint8Array], ['occ', Uint8Array], ['occYrs', Uint8Array], ['poor', Uint8Array], ['migrant', Uint8Array],
  ['apt', Float64Array],
];

/** All people, one typed array per attribute. Grows by doubling. Person i's ledger id is `p_${i}`. */
export class People {
  n = 0;
  capacity: number;
  born!: Int32Array; skill!: Float64Array; resil!: Uint8Array; cY!: Float64Array;
  employer!: Int32Array; staffPos!: Int32Array; spouse!: Int32Array; parent!: Int32Array;
  firstKid!: Int32Array; nextSib!: Int32Array; nkids!: Uint8Array; flags!: Uint8Array;
  incEma!: Float64Array; incWeek!: Float64Array; jobless!: Int32Array; broke!: Int32Array;
  stress!: Float64Array; fearUntil!: Int32Array; lastEv!: Int32Array;
  given!: Uint16Array; family!: Int32Array; slot!: Int32Array;
  health!: Uint8Array; mood!: Uint8Array; condition!: Uint8Array;
  anxiety!: Uint8Array; greed!: Uint8Array; kin!: Uint8Array; diligence!: Uint8Array;
  habit!: Uint8Array; habitLeft!: Uint16Array; wdDays!: Uint16Array; outUntil!: Int32Array;
  brokeStep!: Uint8Array; stressRun!: Uint16Array; mem!: Uint32Array; memN!: Uint32Array;
  anxDone!: Uint8Array; wealthMark!: Float64Array; incMark!: Float64Array;
  school!: Uint8Array; occ!: Uint8Array; occYrs!: Uint8Array; poor!: Uint8Array; migrant!: Uint8Array;
  apt!: Float64Array;
  families: string[] = [];

  constructor(capacity: number) {
    this.capacity = Math.max(16, capacity);
    for (const [k, T] of FIELDS) (this as any)[k] = new T(this.capacity);
  }
  private grow(): void {
    this.capacity *= 2;
    for (const [k, T] of FIELDS) { const a = new T(this.capacity); a.set((this as any)[k]); (this as any)[k] = a; }
  }

  /** Create a person. Skill is drawn, or inherited half from the parents' average. Returns the person's index. */
  add(w: World, born: number, mother: number, father: number): number {
    if (this.n >= this.capacity) this.grow();
    const i = this.n++, r = w.rng('life:traits');
    const draw = Math.exp(0.35 * r.normal());
    this.skill[i] = Math.max(0.5, Math.min(3, mother >= 0 ? 0.5 * draw + 0.25 * (this.skill[mother] + this.skill[father]) : draw));
    this.given[i] = r.int(GIVEN.length);
    if (mother >= 0) this.family[i] = this.family[mother];
    else { this.family[i] = this.families.length; this.families.push(cap(SYL[r.int(SYL.length)] + SYL[r.int(SYL.length)] + FAM[r.int(FAM.length)])); }
    this.born[i] = born; this.resil[i] = r.int(101); this.cY[i] = 0.86 + 0.13 * r.next();
    this.employer[i] = -1; this.staffPos[i] = -1; this.spouse[i] = -1; this.parent[i] = -1;
    this.firstKid[i] = -1; this.nextSib[i] = -1; this.nkids[i] = 0; this.flags[i] = ALIVE;
    this.incEma[i] = 0; this.incWeek[i] = 0; this.jobless[i] = 0; this.broke[i] = 0; this.stress[i] = 0; this.fearUntil[i] = -1; this.lastEv[i] = -1;
    this.health[i] = 84; this.mood[i] = 67; this.condition[i] = 0;
    this.anxiety[i] = 0;
    this.greed[i] = Math.max(0, Math.min(100, Math.round((this.cY[i] - 0.86) / 0.13 * 100)));
    this.kin[i] = (this.given[i] * 17 + this.family[i]) % 101;
    this.diligence[i] = this.resil[i];
    this.habit[i] = 0; this.habitLeft[i] = 0; this.wdDays[i] = 0; this.outUntil[i] = 0;
    this.brokeStep[i] = 0; this.stressRun[i] = 0; this.mem[i] = 0; this.memN[i] = 0; this.anxDone[i] = 0;
    this.wealthMark[i] = 0; this.incMark[i] = 0;
    this.school[i] = 0; this.occ[i] = 0; this.occYrs[i] = 0; this.poor[i] = 0; this.migrant[i] = 0; this.apt[i] = 0;
    this.slot[i] = w.ledger.addActor('p_' + i, 'person');
    if (mother >= 0) this.linkChild(mother, father, i);
    return i;
  }
  /** Record i as the child of a and b. Children form a linked list from parent a (firstKid / nextSib). */
  linkChild(a: number, b: number, i: number): void {
    this.nextSib[i] = this.firstKid[a]; this.firstKid[a] = i; this.parent[i] = a;
    this.nkids[a]++; if (b >= 0 && b !== a) this.nkids[b]++;
  }
  kids(p: number): number[] {
    const out: number[] = [];
    for (let c = this.firstKid[p]; c >= 0; c = this.nextSib[c]) out.push(c);
    const sp = this.spouse[p]; // children are listed under one parent; the other reads the spouse's list
    if (!out.length && sp >= 0) for (let c = this.firstKid[sp]; c >= 0; c = this.nextSib[c]) out.push(c);
    return out;
  }
  name(i: number): string { return `${GIVEN[this.given[i]]} ${this.families[this.family[i]]}`; }
  id(i: number): string { return 'p_' + i; }
  alive(i: number): boolean { return (this.flags[i] & ALIVE) !== 0; }
  retired(i: number): boolean { return (this.flags[i] & RETIRED) !== 0; }
  age(w: World, i: number): number { return Math.floor((w.day - this.born[i]) / DAYS_PER_YEAR); }
  /** Alive, not retired, 18 or over: in the labour force. */
  adult(w: World, i: number): boolean { return (this.flags[i] & ALIVE) !== 0 && (this.flags[i] & RETIRED) === 0 && this.born[i] <= w.day - ADULT_AGE * DAYS_PER_YEAR; }
}

/** Psyche registers this. It chooses the breakdown, the habit and the memory. Absent, the old fearful-saving breakdown remains. */
export type ThoughtHook = (w: World, s: EconState, i: number, raw: number, what: string, cause: number) => void;
let thoughtHook: ThoughtHook | undefined;
export function setThoughtHook(fn: ThoughtHook): void { thoughtHook = fn; }

let simDay = 0;
let effScaled = false;
const firmScale: number[] = [];
export function setSimDay(d: number): void { simDay = d; }
export function setEffScaled(v: boolean): void { effScaled = v; }
export function setFirmScale(idx: number, scale: number): void { firmScale[idx] = scale; }
export function firmScaleOf(idx: number): number { return firmScale[idx] || 1; }
/** The scale table is process-global. A second world in this process must not inherit the first world's leftovers. */
export function clearFirmScales(): void { firmScale.length = 0; }
function appliedScale(idx: number): number { return effScaled ? firmScaleOf(idx) : 1; }

/** Skill currently inside f.eff: nothing while withdrawn, 70% while health is under 30. */
export function labourOf(P: People, i: number, day: number): number {
  if (P.outUntil[i] > day) return 0;
  const sk = P.skill[i];
  return P.health[i] < 30 ? sk * 0.7 : sk;
}

/** Move one person's contribution by the change in labourOf, in whatever units f.eff is using right now. */
export function retargetLabour(s: EconState, i: number, before: number, after: number): void {
  const e = s.P.employer[i];
  if (e < 0 || before === after) return;
  s.firms[e].eff += (after - before) * appliedScale(e);
}

/** A thought lands on a person. The resilience trait dampens it. A positive raw is a bad thought; a negative raw is a good one (a raise, a wedding). */
export function thought(w: World, s: EconState, i: number, raw: number, what: string, cause: number): void {
  const P = s.P, r = P.resil[i];
  const v = r >= 100 ? 0 : r >= 67 ? Math.floor(raw / 10) : r >= 33 ? Math.floor(raw / 2) : raw;
  P.stress[i] = Math.max(0, P.stress[i] + v);
  if (v >= 0) P.mood[i] = Math.max(0, P.mood[i] - Math.min(6, 1 + (v >> 4)));
  else P.mood[i] = Math.min(100, P.mood[i] + Math.min(8, 1 + ((-v) >> 3)));
  setSimDay(w.day);
  if (thoughtHook) { thoughtHook(w, s, i, raw, what, cause); return; }
  if (P.stress[i] >= BREAKDOWN_AT && w.day >= P.fearUntil[i]) {
    P.fearUntil[i] = w.day + 180; P.stress[i] = BREAKDOWN_AT / 2; s.breakdowns++;
    if (s.breakdowns % 25 === 1) P.lastEv[i] = w.events.emit('person.breakdown', `${P.name(i)} (${P.age(w, i)}) broke down: ${what}. Cuts spending for six months`, [P.lastEv[i] >= 0 ? P.lastEv[i] : cause], P.id(i));
  }
}

export function leaveJob(s: EconState, i: number): void {
  const P = s.P, e = P.employer[i];
  if (e < 0) return;
  const f = s.firms[e], k = P.staffPos[i], last = f.staff.length - 1;
  if (k !== last) { const moved = f.staff[last]; f.staff[k] = moved; P.staffPos[moved] = k; } // swap-remove: O(1)
  f.staff.pop(); f.eff -= labourOf(P, i, simDay) * appliedScale(e); f.workers = f.staff.length;
  P.employer[i] = -1; P.staffPos[i] = -1;
}
export function joinFirm(s: EconState, i: number, f: Firm): void {
  const P = s.P;
  leaveJob(s, i);
  P.employer[i] = f.idx; P.staffPos[i] = f.staff.length; P.jobless[i] = 0;
  f.staff.push(i); f.eff += labourOf(P, i, simDay) * appliedScale(f.idx); f.workers = f.staff.length;
}

const DEG = 16;
interface SocBonds { contact: Int32Array; bond: Uint8Array } // bond: respect, fear, loyalty, friendship per slot (social B_*)

function bonds(w: World): SocBonds | undefined {
  const st = w.state.social as SocBonds | undefined;
  if (!st?.contact || !st.bond) return undefined;
  return st;
}

function regard(st: SocBonds, from: number, who: number, which: 'respect' | 'friend'): number {
  const b = from * DEG, contact = st.contact;
  for (let k = 0; k < DEG; k++) if (contact[b + k] === who) return st.bond[(b + k) * 4 + (which === 'respect' ? 0 : 3)];
  return 0;
}

/** Skill plus a small staff-respect weight. Samples coworkers so a large firm does not scan everyone. */
function staffScore(w: World, f: Firm, person: number): number {
  const P = (w.state.economy as EconState).P;
  const st = bonds(w);
  let extra = 0;
  if (st) {
    const staff = f.staff;
    const step = Math.max(1, Math.floor(staff.length / 16));
    let n = 0, sum = 0;
    for (let i = 0; i < staff.length && n < 16; i += step) {
      if (staff[i] === person) continue;
      sum += regard(st, staff[i], person, 'respect');
      n++;
    }
    if (n) extra = sum / n / 250;
  }
  return P.skill[person] + extra;
}

/** A single contact with high friendship, ahead of the next person by age. -1 if nobody qualifies. */
function preferredSpouse(w: World, P: People, i: number, taken: Uint8Array): number {
  const st = bonds(w);
  if (!st) return -1;
  const b = i * DEG;
  let best = -1, score = 49;
  for (let k = 0; k < DEG; k++) {
    const c = st.contact[b + k];
    if (c < 0 || taken[c] || P.spouse[c] >= 0 || !P.alive(c)) continue;
    if (P.family[c] === P.family[i] || P.parent[c] === i || P.parent[i] === c) continue;
    const fr = st.bond[(b + k) * 4 + 3];
    if (fr > score) { score = fr; best = c; }
  }
  return best;
}

/** Fill a vacant chief executive seat. Family firms search the old chief's descendants first. */
export function succession(w: World, s: EconState, f: Firm, old: number, why: string, cause: number): void {
  const P = s.P;
  let pick = -1, how = 'promoted from the staff';
  const best = (xs: number[]): number => xs.reduce((a, b) => (a < 0 || P.skill[b] > P.skill[a] ? b : a), -1);
  // No heir: skill, plus a small weight for how much the staff respects the candidate.
  const bestStaff = (xs: number[]): number => xs.reduce((a, b) => (a < 0 || staffScore(w, f, b) > staffScore(w, f, a) ? b : a), -1);
  // Nobody within a year of retirement, and nobody under 23, takes the seat.
  const can = (c: number): boolean => P.adult(w, c) && P.age(w, c) >= 23 && P.age(w, c) < RETIRE_AGE - 1;
  if (f.family && old >= 0) {
    let gen = P.kids(old);
    for (let depth = 0; depth < 3 && gen.length && pick < 0; depth++) {
      const ok = gen.filter(can);
      if (ok.length) { pick = best(ok); how = depth ? `grandchild of ${P.name(old)}` : `child of ${P.name(old)}`; }
      else gen = gen.flatMap((c) => P.kids(c));
    }
    const sp = P.spouse[old];
    if (pick < 0 && sp >= 0 && can(sp)) { pick = sp; how = `spouse of ${P.name(old)}`; }
  }
  if (pick < 0) pick = bestStaff(f.staff.filter((x) => x !== old && can(x)));
  if (pick < 0) pick = bestStaff(f.staff.filter((x) => x !== old && P.adult(w, x)));
  if (pick < 0) { f.ceo = -1; return; }
  const from = P.employer[pick] >= 0 && P.employer[pick] !== f.idx ? s.firms[P.employer[pick]] : undefined;
  const wasCeoThere = from !== undefined && from.ceo === pick;
  joinFirm(s, pick, f);
  f.ceo = pick; f.badMonths = 0; s.successions++;
  f.ceoEv = w.events.emit('firm.succession', `${P.name(pick)} (${P.age(w, pick)}) becomes chief executive of ${f.name}, ${how}, after ${old >= 0 ? P.name(old) : 'a vacancy'} ${why}`, [cause], f.id);
  P.lastEv[pick] = f.ceoEv;
  if (wasCeoThere && from) succession(w, s, from, pick, `left to run ${f.name}`, f.ceoEv); // the vacated seat is refilled too
}

function die(w: World, s: EconState, i: number, yearEv: number): void {
  const L = w.ledger, P = s.P, me = P.slot[i];
  const sp = P.spouse[i];
  const heirs = sp >= 0 && P.alive(sp) ? [sp] : P.kids(i).filter((k) => P.alive(k));
  const holdings = s.shareIds.filter((id) => L.balS(me, id) > 0);
  const cashNow = L.balS(me, DEP);
  const notable = holdings.length > 0 || (P.employer[i] >= 0 && s.firms[P.employer[i]].ceo === i);
  const ev = notable
    ? w.events.exo('person.died', `${P.name(i)} died aged ${P.age(w, i)}${heirs.length ? `; estate of ${(cashNow / 100).toFixed(0)} and ${holdings.length} shareholdings passes to ${heirs.map((h) => P.name(h)).join(', ')}` : '; no heirs, the estate goes to the state'}`, P.id(i))
    : yearEv;
  P.flags[i] &= ~ALIVE;
  if (!heirs.length) {
    L.moveS(DEP, me, s.govSlot, cashNow, 'estate.escheat', ev);
    for (const id of holdings) L.moveS(id, me, s.govSlot, L.balS(me, id), 'estate.escheat', ev);
  }
  heirs.forEach((h, k) => {
    const last = k === heirs.length - 1, to = P.slot[h];
    L.moveS(DEP, me, to, last ? L.balS(me, DEP) : Math.floor(cashNow / heirs.length), 'estate.inherit', ev);
    for (const id of holdings) { const n = L.balS(me, id); L.moveS(id, me, to, last ? n : Math.floor(n / (heirs.length - k)), 'estate.inherit', ev); }
    P.lastEv[h] = ev;
  });
  if (sp >= 0) P.spouse[sp] = -1;
  const e = P.employer[i], f = e >= 0 ? s.firms[e] : undefined, wasCeo = f?.ceo === i;
  leaveJob(s, i);
  if (f && wasCeo) succession(w, s, f, i, 'died', ev);
}

/** Once a year: deaths, retirements, pairings, births. */
export function yearlyLifePass(w: World, s: EconState): void {
  const r = w.rng('life:events'), P = s.P, L = w.ledger;
  const yearEv = w.events.exo('life.year', `year ${w.year}: births, deaths, marriages and retirements`);
  let deaths = 0, births = 0, pairs = 0;
  const n0 = P.n;
  const single: number[] = [];
  for (let i = 0; i < n0; i++) {
    if (!P.alive(i)) continue;
    const a = P.age(w, i);
    let pDeath = Math.min(0.9, 0.0004 * Math.exp(Math.max(0, a - 30) / 9.5));
    if (P.health[i] < 30) pDeath = Math.min(0.9, pDeath + 0.02);
    if (r.chance(pDeath)) { die(w, s, i, yearEv); deaths++; continue; }
    if (a >= RETIRE_AGE && !P.retired(i)) {
      const e = P.employer[i], f = e >= 0 ? s.firms[e] : undefined, wasCeo = f?.ceo === i;
      P.flags[i] |= RETIRED; leaveJob(s, i);
      if (f && wasCeo) succession(w, s, f, i, 'retired', yearEv);
    }
    if (P.spouse[i] < 0 && a >= 20 && a <= 50 && r.chance(1 / 3)) single.push(i);
  }
  single.sort((a, b) => P.born[a] - P.born[b] || a - b);
  const taken = new Uint8Array(n0);
  for (const i of single) {
    if (taken[i]) continue;
    const j = preferredSpouse(w, P, i, taken);
    if (j < 0) continue;
    P.spouse[i] = j; P.spouse[j] = i; taken[i] = 1; taken[j] = 1; pairs++;
    thought(w, s, i, -80, 'a wedding', yearEv);
    thought(w, s, j, -80, 'a wedding', yearEv);
  }
  const rest: number[] = [];
  for (const i of single) if (!taken[i]) rest.push(i);
  for (let k = 0; k + 1 < rest.length; k += 2) {
    const a = rest[k], b = rest[k + 1];
    if (P.family[a] === P.family[b] || P.parent[a] === b || P.parent[b] === a) continue;
    P.spouse[a] = b; P.spouse[b] = a; pairs++;
    thought(w, s, a, -80, 'a wedding', yearEv);
    thought(w, s, b, -80, 'a wedding', yearEv);
  }
  for (let i = 0; i < n0; i++) {
    const q = P.spouse[i];
    if (!P.alive(i) || q < i || !P.alive(q)) continue;
    const young = Math.min(P.age(w, i), P.age(w, q));
    if (young < 20 || young > 42 || P.nkids[i] >= 4 || !r.chance(0.13)) continue;
    P.add(w, w.day, i, q); births++;
    thought(w, s, i, -60, 'a birth', yearEv);
    thought(w, s, q, -60, 'a birth', yearEv);
  }
  let lf = 0, living = 0;
  for (let i = 0; i < P.n; i++) { if (P.adult(w, i)) lf++; if (P.alive(i)) living++; }
  s.laborForce = lf;
  // The stock market's household investors are the 300 richest living people.
  const rich: number[] = [];
  for (let i = 0; i < P.n; i++) if (P.alive(i)) rich.push(i);
  rich.sort((a, b) => L.balS(P.slot[b], DEP) - L.balS(P.slot[a], DEP) || a - b);
  s.investors = rich.slice(0, 300).map((p, k) => {
    const base = 0.6 - 0.3 * k / 300;
    // Same formula as psyche.stockTargetOf: a crash raises anxiety and the person holds fewer shares for life.
    return { id: P.id(p), target: base * (1 - 0.45 * P.anxiety[p] / 100) };
  });
  w.events.emit('life.tally', `${deaths} deaths, ${births} births, ${pairs} marriages; ${living} people alive`, [yearEv]);
}
