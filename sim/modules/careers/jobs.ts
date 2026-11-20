// A job the player can see, apply for, leave, and study toward. Openings are the firms
// that are short of labour this morning. Hiring uses the same gates as the morning
// round: an adult who is free to work, a firm that is actually short, and no protection
// from a later layoff.
import type { World } from '../../kernel/index.ts';
import { GOODS } from '../economy/content.ts';
import { CAPITAL, GOV, pay, type EconState, type Firm } from '../economy/index.ts';
import { labourOf, leaveJob, setSimDay, succession, thought } from '../economy/people.ts';
import { playerIndex, type ActResult, type Command } from '../player/index.ts';
import { dateText } from '../player/gamedate.ts';
import { notify } from '../circle/notices.ts';
import { COURSES, knowledgeIn } from '../courses/know.ts';
import { attendanceWarning, noteAttendance, performanceOf, shiftOf } from './work.ts';

/** A hook for what the player knows and who has spoken for them: it lifts the fit, and a word put in thins the field. */
export interface JobBoost { fit: number; vouch: boolean }
let boostFn: ((w: World, person: number, f: Firm) => JobBoost) | undefined;
export function setJobBoost(fn: (w: World, person: number, f: Firm) => JobBoost): void { boostFn = fn; }

export interface OccRow { id: string; name: string; pay: number; school: number; rank: number }

interface App {
  person: number; firm: number; occ: number; due: number; n: number;
  wage: number; day: number; better: number; pool: number; role: string; note: string;
}
interface Refusal { person: number; firm: number; day: number }
interface StudyRow { person: number; occ: number; due: number }
interface Notice { person: number; day: number; text: string }
/** A firm's yes, waiting for the player's: the seat, the wage, the day it starts and the day the offer lapses. */
export interface Offer {
  id: number; person: number; firm: number; occ: number; role: string; wage: number;
  day: number; start: number; expires: number; status: 'open' | 'accepted' | 'declined' | 'lapsed' | 'started' | 'fell';
  why: string; ev: number; from: number; via: number; note: string;
}
interface JobBook { apps: App[]; refused: Refusal[]; study: StudyRow[]; notices: Notice[]; offers?: Offer[]; offerSeq?: number; seatDay?: number; seatN?: number[] }

export interface CareerApi {
  occ: OccRow[];
  qualifies(school: number, occ: number, ceo: boolean): boolean;
  paySkill(i: number, occ: number, years: number, P: EconState['P']): number;
  schoolFromSkill(skill: number): number;
  setSkill(w: World, i: number, next: number): void;
  seatFor(w: World, f: Firm, person: number): number;
  reachSeat?(w: World, f: Firm, person: number): number;
  place(w: World, person: number, f: Firm, occ: number, cause: number): void;
}

interface Opening {
  n: number;
  firm: number;
  name: string;
  sector: string;
  occ: number;
  role: string;
  gap: number;
  wage: number;
  askExp: number;
  askSchool: number;
  askHealth: number;
  youExp: number;
  youSchool: number;
  youHealth: number;
  taken: boolean;
  note: string;
  better: number;
  pool: number;
  score: number;
  /** For a seat you cannot take yet: what would open it, and the command that starts on it. */
  unlock?: { need: string; text: string; course?: string; courseName?: string; line?: string };
}

/** Spoken seat, by the work the firm does. The occupation file's "trade" is not a job title. */
const ROLES: Record<string, string[]> = {
  MINING: ['pit hand', 'fitter', 'weigh clerk', 'mine engineer', 'cost clerk', 'shift boss', 'mine superintendent'],
  CONSTRUCTION: ['site hand', 'carpenter', 'site clerk', 'site engineer', 'quantity surveyor', 'site manager', 'contracts director'],
  ENERGY: ['plant hand', 'rigger', 'plant clerk', 'plant engineer', 'cost analyst', 'plant manager', 'works director'],
  METALS: ['mill hand', 'millwright', 'mill clerk', 'metallurgist', 'cost analyst', 'mill manager', 'works director'],
  CHEMICALS: ['process hand', 'process operator', 'plant clerk', 'process engineer', 'cost analyst', 'plant manager', 'works director'],
  AGRICULTURE: ['farm hand', 'stock hand', 'farm clerk', 'agronomist', 'bookkeeper', 'farm manager', 'estate director'],
  MANUFACTURING: ['factory hand', 'machinist', 'factory clerk', 'production engineer', 'cost accountant', 'factory manager', 'works director'],
  TRANSPORT: ['docker', 'driver', 'dispatch clerk', 'transport engineer', 'rates clerk', 'depot manager', 'operations director'],
  HEALTHCARE: ['orderly', 'nurse', 'ward clerk', 'clinical engineer', 'billing officer', 'ward manager', 'medical director'],
  RETAIL: ['shelf hand', 'shop assistant', 'shop clerk', 'maintenance engineer', 'buyer', 'store manager', 'retail director'],
  TECHNOLOGY: ['bench hand', 'technician', 'office clerk', 'software engineer', 'financial analyst', 'team manager', 'technical director'],
  FINANCE: ['office hand', 'accounts clerk', 'bookkeeper', 'analyst', 'underwriter', 'branch manager', 'finance director'],
  MEDIA: ['runner', 'technician', 'copy clerk', 'broadcast engineer', 'accountant', 'desk editor', 'editor'],
};

let api: CareerApi | undefined;

export function bindJobs(next: CareerApi): void { api = next; }

const econ = (w: World): EconState => w.state.economy as EconState;
const rejected = (why: string): ActResult => ({ status: 'rejected', why });

function book(w: World): JobBook {
  const st = w.state.careers as Partial<JobBook>;
  if (!st.apps) st.apps = [];
  if (!st.refused) st.refused = [];
  if (!st.study) st.study = [];
  if (!st.notices) st.notices = [];
  return st as JobBook;
}

function occAt(k: number): OccRow | undefined {
  const row = api?.occ[k];
  return row && row.id ? row : undefined;
}

function aan(phrase: string): string {
  return /^[aeiou]/i.test(phrase) ? `an ${phrase}` : `a ${phrase}`;
}

function usd(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const a = Math.abs(Math.round(cents));
  const whole = Math.floor(a / 100);
  const frac = String(a % 100).padStart(2, '0');
  const body = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${body}.${frac}`;
}

function counted(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function roleTitle(sector: string, occ: number): string {
  const row = occAt(occ);
  const titles = ROLES[sector] ?? ROLES.MANUFACTURING;
  const titled = row ? titles[row.rank - 1] : '';
  return titled || row?.name || 'hand';
}

/** How far the player clears what the seat asks. 0 just meets it, 1 is well clear. */
function fitOf(youSchool: number, askSchool: number, youExp: number, askExp: number, youHealth: number, askHealth: number): number {
  const school = askSchool <= 0 ? 1 : Math.max(0, Math.min(1, (youSchool - askSchool) / 4));
  const exp = askExp <= 0 ? 0.45 : Math.max(0, Math.min(1, (youExp - askExp) / 3));
  const health = askHealth <= 0 ? 1 : Math.max(0, Math.min(1, (youHealth - askHealth) / 30));
  return school * 0.45 + exp * 0.3 + health * 0.25;
}

/**
 * Odds for this firm, not for the whole city.
 * A firm that will still be short when the letter is answered is likely for someone who meets the ask.
 * A seat that can fill first is a long shot unless few of the people who can actually arrive are stronger.
 */
function outlook(better: number, pool: number, gap: number, fit: number): { note: string; score: number } {
  let left = Math.max(0, gap);
  for (let d = 0; d < 3 && left > 1; d++) left -= Math.max(0.06 * left, 1);
  const reach = Math.max(1, Math.ceil(Math.max(0, pool) * 0.035 * 3));
  const ahead = Math.min(Math.max(0, better), reach);
  let note: string;
  if (pool <= 0 || better <= 0) note = 'likely';
  else if (left >= 2) note = 'likely';
  else if (left >= 0.4) {
    if (fit >= 0.5 || ahead <= Math.max(2, Math.ceil(left))) note = 'likely';
    else if (ahead <= reach * 0.55 || fit >= 0.3) note = 'a fair chance';
    else note = 'a long shot';
  } else if (ahead <= 1 || (fit >= 0.62 && ahead <= 4)) note = 'likely';
  else if (ahead <= 6 || fit >= 0.45 || better / pool <= 0.35) note = 'a fair chance';
  else note = 'a long shot';
  const rank = note === 'likely' ? 3 : note === 'a fair chance' ? 2 : 1;
  return { note, score: rank * 1000 + left * 10 - ahead };
}

/** The labour module's wage multiple. Zero means the plant is struck and hires nobody. */
function wagePrem(w: World, firmIdx: number): number {
  const prem = (w.state.labour as { prem?: ArrayLike<number> } | undefined)?.prem;
  if (!prem || firmIdx < 0 || firmIdx >= prem.length) return 1;
  const m = prem[firmIdx];
  if (!(m > 0)) return 0;
  return m < 3 ? m : 3;
}

function prodMult(s: EconState, good: string): number {
  let m = 1;
  for (const x of s.shocks) m *= (x.def.prod[good] ?? 1) * (x.def.prod.ALL ?? 1);
  return m;
}

/** Same labour gap the morning hiring round uses. Positive means the firm is short of staff. */
export function firmGap(w: World, f: Firm): number {
  if (f.closed) return 0;
  const s = econ(w), P = s.P;
  const d = GOODS[f.good];
  if (!d || !(d.prod > 0)) return 0;
  const mult = prodMult(s, f.good);
  const prodEff = d.prod * mult;
  const invDays = 5 * (f.ceo >= 0 && f.ceo < P.n ? 0.7 + 0.6 * (0.98 - P.cY[f.ceo]) / 0.18 : 1);
  const stock = w.ledger.balance(f.id, 'good:' + f.good);
  const stockGap = (f.expSales * invDays - stock) / 10;
  const bent = Math.max(-0.25 * f.expSales, Math.min(0.25 * f.expSales, stockGap));
  const target = d.perishable ? f.expSales * 1.03 : Math.max(0, f.expSales + bent);
  const ceiling = w.ledger.instruments.has(CAPITAL) ? w.ledger.balance(f.id, CAPITAL) * mult : Infinity;
  return Math.min(Math.max(0, target), ceiling) / prodEff - f.eff;
}

/** Whole seats open at a firm right now: the one number letters, talk and Careers all quote. */
export function seatsOpen(w: World, f: Firm): number {
  if (!f || f.closed) return 0;
  const g = firmGap(w, f);
  return g > 1 && wagePrem(w, f.idx) > 0 ? Math.floor(g) : 0;
}

function playerSeat(w: World): string { return (w.state.player as { ids?: string[] } | undefined)?.ids?.[0] ?? ''; }
function isPlayer(w: World, person: number): boolean {
  const st = w.state.player as { ids?: string[]; seat?: Record<string, { who?: number }> } | undefined;
  const k = st?.ids?.[0];
  return !!k && st?.seat?.[k]?.who === person;
}
/** A finished evening course in the firm's trade counts as a year in the seat it asks for. */
function courseYears(w: World, person: number, sector: string): number {
  if (!isPlayer(w, person)) return 0;
  const seat = playerSeat(w);
  return seat ? knowledgeIn(w, seat, sector) : 0;
}
function courseFor(w: World, sector: string): { id: string; name: string; weeks: number } | undefined {
  const seat = playerSeat(w);
  const done = (w.state.courses as { know?: Record<string, Record<string, number>>; class?: Record<string, { course: string }> } | undefined);
  const mine = seat ? done?.know?.[seat] ?? {} : {};
  return COURSES.find((c) => c.sectors.includes(sector) && mine[c.id] === undefined);
}

function schoolOf(P: EconState['P'], i: number): number {
  if (P.school[i] >= 6) return P.school[i];
  return api ? api.schoolFromSkill(P.skill[i]) : 6;
}

function asks(row: OccRow): { exp: number; school: number; health: number } {
  const exp = row.rank <= 2 ? 0 : row.rank - 2;
  const health = row.rank >= 6 ? 60 : row.rank >= 4 ? 45 : 30;
  return { exp, school: row.school, health };
}

/** Years in this trade count in full. Years in another trade count at half: the work is related, not the same seat. */
function yearsOf(P: EconState['P'], i: number, occ: number): number {
  const yrs = P.occYrs[i] || 0;
  if (yrs <= 0) return 0;
  if (occ > 0 && P.occ[i] === occ) return yrs;
  return Math.floor(yrs / 2);
}

function canWork(w: World, i: number): string {
  const P = econ(w).P;
  if (!P.alive(i)) return 'you are not here';
  if (P.retired(i)) return 'you are retired';
  if ((P.flags[i] & 4) !== 0) return 'you are in prison';
  if (!P.adult(w, i)) return 'you are not old enough';
  if (P.outUntil[i] > w.day) return 'you are off sick';
  if (P.health[i] < 30) return 'your health will not hold a shift';
  return '';
}

function weekly(w: World, person: number, firmIdx: number, occ: number): number {
  if (!api) return 0;
  const s = econ(w), P = s.P;
  const years = yearsOf(P, person, occ);
  const skill = api.paySkill(person, occ, years, P);
  const prem = firmIdx >= 0 ? wagePrem(w, firmIdx) : 1;
  return Math.round(skill * s.wage * 7 * (prem > 0 ? prem : 1));
}

function compare(w: World, person: number, f: Firm, occ: number, gap: number): { taken: boolean; note: string; askExp: number; askSchool: number; askHealth: number; youExp: number; youSchool: number; youHealth: number; better: number; pool: number; score: number; unlock?: Opening['unlock'] } {
  const row = occAt(occ);
  const P = econ(w).P;
  const ask = row ? asks(row) : { exp: 0, school: 6, health: 30 };
  const youSchool = schoolOf(P, person);
  const youExp = yearsOf(P, person, occ) + courseYears(w, person, f.sector);
  const youHealth = P.health[person];
  const blank = { askExp: ask.exp, askSchool: ask.school, askHealth: ask.health, youExp, youSchool, youHealth, better: 0, pool: 0, score: 0 };
  if (!api || !row) return { ...blank, taken: false, note: 'that seat is not hired' };
  if (f.closed) return { ...blank, taken: false, note: 'the firm is closed' };
  if (!(wagePrem(w, f.idx) > 0)) return { ...blank, taken: false, note: 'the plant is struck and is not hiring' };
  if (!(gap > 1)) return { ...blank, taken: false, note: 'the firm is not short of staff' };
  const block = canWork(w, person);
  if (block) return { ...blank, taken: false, note: block, unlock: block.includes('health') || block.includes('sick') ? { need: 'health', text: 'Rest, or a clinic visit, brings your health back up to what a shift needs.', line: 'clinic' } : undefined };
  if (!api.qualifies(youSchool, occ, false)) {
    const field = row.name;
    return { ...blank, taken: false, note: `school ${youSchool} is short of ${ask.school}`, unlock: { need: 'school', text: `Studying ${field} (${12 + 6 * row.rank} days) brings your schooling to ${ask.school}, which this seat asks for.`, line: `study ${field}` } };
  }
  if (youHealth < ask.health) return { ...blank, taken: false, note: `health ${youHealth} is short of ${ask.health}`, unlock: { need: 'health', text: `A clinic visit raises health toward the ${ask.health} the seat asks for.`, line: 'clinic' } };
  if (youExp < ask.exp) {
    const c = isPlayer(w, person) ? courseFor(w, f.sector) : undefined;
    const short = ask.exp - youExp;
    const unlock = c && short <= 2
      ? { need: 'years', text: `${counted(youExp, 'year', 'years')} is short of ${ask.exp}. Finishing ${c.name} (${c.weeks} weekly evenings) counts as a year in this trade${short > 1 ? ', and another course in it as a second' : ''}.`, course: c.id, courseName: c.name, line: `enrol ${c.name}` }
      : { need: 'years', text: `${counted(youExp, 'year', 'years')} is short of ${ask.exp}. Time in a ${f.sector.toLowerCase()} seat closes the gap: ${counted(short, 'year', 'years')} more.` };
    return { ...blank, taken: false, note: `${counted(youExp, 'year', 'years')} is short of ${ask.exp}`, unlock };
  }
  const mine = labourOf(P, person, w.day);
  const boost = boostFn ? boostFn(w, person, f) : undefined;
  const fit = fitOf(youSchool, ask.school, youExp, ask.exp, youHealth, ask.health) + (boost?.fit ?? 0);
  let pool = 0, better = 0;
  const adultLine = w.day - 18 * 360;
  for (let i = 0; i < P.n; i++) {
    if (i === person || P.employer[i] >= 0) continue;
    if ((P.flags[i] & 1) === 0 || (P.flags[i] & 6) !== 0 || P.born[i] > adultLine) continue;
    if (P.outUntil[i] > w.day || P.health[i] < ask.health) continue;
    if (!api.qualifies(schoolOf(P, i), occ, false)) continue;
    if (yearsOf(P, i, occ) < ask.exp) continue;
    pool++;
    if (labourOf(P, i, w.day) > mine + fit * 0.15) better++;
  }
  if (boost?.vouch) better = Math.floor(better * 0.15);
  const odds = outlook(better, pool, gap, fit);
  return { ...blank, taken: true, better, pool, note: odds.note, score: odds.score };
}

function openings(w: World, person: number): Opening[] {
  if (!api) return [];
  const s = econ(w), P = s.P;
  const rows: Opening[] = [];
  const here = person >= 0 && person < P.n ? P.employer[person] : -1;
  for (const f of s.firms) {
    if (f.closed || f.idx === here) continue;
    const seats = seatsOpen(w, f);
    if (seats < 1) continue;
    const gap = Math.max(firmGap(w, f), seats);
    const occ = api.seatFor(w, f, person);
    const cmp = compare(w, person, f, occ, gap);
    const push = (seat: number, row: typeof cmp): void => {
      rows.push({
        n: 0, firm: f.idx, name: f.name, sector: f.sector, occ: seat, role: roleTitle(f.sector, seat), gap: seats,
        wage: weekly(w, person, f.idx, seat),
        askExp: row.askExp, askSchool: row.askSchool, askHealth: row.askHealth,
        youExp: row.youExp, youSchool: row.youSchool, youHealth: row.youHealth,
        taken: row.taken, note: row.note, better: row.better, pool: row.pool, score: row.score, unlock: row.unlock,
      });
    };
    push(occ, cmp);
    // The seat the firm is actually short of, when that is above what you can walk into.
    const reach = api.reachSeat ? api.reachSeat(w, f, person) : occ;
    if (reach !== occ) {
      const above = compare(w, person, f, reach, gap);
      if (!above.taken && above.unlock) push(reach, above);
    }
  }
  // A stable order: what you can take first, then by firm name, so the list does not reshuffle from one morning to the next.
  rows.sort((a, b) => (b.taken ? 1 : 0) - (a.taken ? 1 : 0) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) || a.firm - b.firm);
  for (let i = 0; i < rows.length; i++) rows[i].n = i + 1;
  return rows;
}

function openingLine(o: Opening): string {
  const wage = `${usd(o.wage)} a week`;
  const ask = `asks ${counted(o.askExp, 'year', 'years')}, school ${o.askSchool}, health ${o.askHealth}`;
  const you = `you have ${counted(o.youExp, 'year', 'years')}, school ${o.youSchool}, health ${o.youHealth}`;
  const seats = `${counted(Math.floor(o.gap), 'seat', 'seats')} open`;
  const role = o.role.charAt(0).toUpperCase() + o.role.slice(1);
  return `${o.n}. ${o.name} — ${role} — ${wage} — ${ask} — ${you} — ${seats} — ${o.note}${o.unlock ? `. To open it: ${o.unlock.text}${o.unlock.line ? ` (${o.unlock.line})` : ''}` : ''}`;
}

function currentJob(w: World, person: number): string {
  const s = econ(w), P = s.P;
  if (person < 0 || person >= P.n) return 'no job';
  const e = P.employer[person];
  if (e < 0) return 'no job';
  const f = s.firms[e];
  if (!f) return 'no job';
  const title = P.occ[person] > 0 ? roleTitle(f.sector, P.occ[person]) : '';
  return title ? `${aan(title)} at ${f.name}` : `working at ${f.name}`;
}

function performance(w: World, person: number): number {
  if (isPlayer(w, person)) return performanceOf(w, person).score;
  const P = econ(w).P;
  if (person < 0 || person >= P.n || !P.alive(person)) return 0;
  const e = P.employer[person];
  let mean = 1;
  if (e >= 0) {
    const staff = econ(w).firms[e]?.staff ?? [];
    let sum = 0, n = 0;
    for (const i of staff) { sum += P.skill[i]; n++; }
    if (n) mean = sum / n;
  }
  const rel = P.skill[person] / Math.max(0.4, mean);
  const dil = (P.diligence[person] ?? 50) / 100;
  const hp = P.health[person] / 100;
  return Math.max(0, Math.min(100, Math.round(rel * 55 + dil * 30 + hp * 15)));
}

/** The player's working life beyond the card: offers waiting, the shift, how it is going and who you work with. */
export function workView(w: World, person: number): Record<string, unknown> {
  const s = econ(w), P = s.P;
  const st = book(w);
  const offers = (st.offers ?? []).filter((o) => o.person === person && (o.status === 'open' || o.status === 'accepted' || w.day - o.day <= 14)).map((o) => ({
    id: o.id, firm: s.firms[o.firm]?.name ?? 'a firm', firmId: s.firms[o.firm]?.id ?? '', role: o.role, wage: o.wage,
    start: o.start, startDate: dateText(o.start), startTime: hhmm(shiftStartMin(w, { firm: o.firm, occ: o.occ })), expires: o.expires, expiresDate: dateText(o.expires),
    status: o.status, why: o.why, from: o.from, fromName: o.from >= 0 && o.from < P.n ? P.name(o.from) : '', via: o.via,
    viaName: o.via >= 0 && o.via < P.n ? P.name(o.via) : '', eventId: o.ev, note: o.note,
    actions: o.status === 'open' ? [{ label: 'Accept', kind: 'offer', id: o.id, answer: 'accept' }, { label: 'Decline', kind: 'offer', id: o.id, answer: 'decline' }] : [],
  }));
  const e = person >= 0 && person < P.n ? P.employer[person] : -1;
  const f = e >= 0 ? s.firms[e] : undefined;
  const perf = performanceOf(w, person);
  const sh = shiftOf(w, person);
  const work = (w.state.careers as { work?: { since: number; firm: number } }).work;
  const since = f && work && work.firm === f.idx && work.since >= 0 ? work.since : -1;
  const colleagues: { who: number; name: string; role: string; boss: boolean }[] = [];
  if (f) {
    const bossI = boss(w, f, person);
    const bonds = (w.state.circle as { bonds?: { who: number }[] } | undefined)?.bonds ?? [];
    const known = new Set(bonds.map((b) => b.who));
    if (bossI >= 0) colleagues.push({ who: bossI, name: P.name(bossI), role: bossI === f.ceo ? 'chief executive' : roleTitle(f.sector, P.occ[bossI]), boss: true });
    for (const i of f.staff) {
      if (colleagues.length >= 8) break;
      if (i === person || i === bossI || !known.has(i) || !P.alive(i)) continue;
      colleagues.push({ who: i, name: P.name(i), role: roleTitle(f.sector, P.occ[i]), boss: false });
    }
  }
  return {
    offers,
    performanceWord: perf.word,
    performanceWhy: perf.why,
    shift: sh ? { start: sh.start, end: sh.end, days: sh.days, label: sh.label, line: sh.line, overlapsMarket: sh.overlapsMarket, hours: sh.hours } : null,
    started: since, startedDate: since >= 0 ? dateText(since) : '', daysInSeat: since >= 0 ? w.day - since : 0,
    colleagues,
  };
}

export function careerCard(w: World, person: number): { job: string; wage: number; tenure: number; performance: number; openings: string } {
  const P = econ(w).P;
  const job = currentJob(w, person);
  const e = person >= 0 && person < P.n ? P.employer[person] : -1;
  const wage = e >= 0 ? Math.round(P.skill[person] * econ(w).wage * 7 * (wagePrem(w, e) > 0 ? wagePrem(w, e) : 1)) : 0;
  const tenure = e >= 0 && P.occ[person] > 0 ? P.occYrs[person] : 0;
  let n = 0, can = 0;
  if (api && person >= 0) { const rows = openings(w, person); n = rows.length; can = rows.filter((r) => r.taken).length; }
  else if (w.state.economy) {
    for (const f of econ(w).firms) if (!f.closed && firmGap(w, f) > 1 && wagePrem(w, f.idx) > 0) { n++; can++; }
  }
  const openingsText = n ? `${counted(n, 'firm is', 'firms are')} short of hands${can < n ? `, ${can} you can apply to` : ''}` : 'no firm is short of hands';
  return { job, wage, tenure, performance: performance(w, person), openings: openingsText };
}

function boss(w: World, f: Firm, notPerson: number): number {
  const P = econ(w).P;
  if (f.ceo >= 0 && f.ceo !== notPerson && f.ceo < P.n && P.alive(f.ceo)) return f.ceo;
  for (const i of f.staff) if (i !== notPerson && i < P.n && P.alive(i)) return i;
  return -1;
}

function postLetter(w: World, from: number, text: string, cause: number): void {
  const st = w.state.circle as { next?: number; letters?: { id: number; day: number; from: number; role: string; kind: string; text: string; eventId: number; source: number; req: number }[]; yMsg?: number } | undefined;
  if (!st || !Array.isArray(st.letters) || from < 0) return;
  const P = econ(w).P;
  const ev = w.events.emit('circle.letter', text, [cause], P.id(from));
  const id = st.next && st.next > 0 ? st.next++ : st.letters.length + 1;
  if (!st.next || st.next <= id) st.next = id + 1;
  st.letters.push({ id, day: w.day, from, role: 'work', kind: 'work', text, eventId: ev, source: cause, req: -1 });
  st.yMsg = (st.yMsg ?? 0) + 1;
}

function notice(w: World, person: number, text: string): void {
  const st = book(w);
  st.notices.push({ person, day: w.day, text });
  if (st.notices.length > 24) st.notices.splice(0, st.notices.length - 24);
}

function fieldOcc(field: string): number {
  if (!api) return -1;
  const k = field.trim().toLowerCase();
  for (let i = 1; i < api.occ.length; i++) {
    const row = api.occ[i];
    if (!row?.id) continue;
    if (row.id.toLowerCase() === k || row.name.toLowerCase() === k) return i;
  }
  return -1;
}

/** The one list of openings: firms that are short of hands, best chances first. Applying, the card and the screens all use it. */
export function openingRows(w: World, person: number): (Opening & { vouched: boolean })[] {
  const vouched = (f: number): boolean => !!boostFn && !!boostFn(w, person, econ(w).firms[f]).vouch;
  return openings(w, person).map((o) => ({ ...o, vouched: vouched(o.firm) }));
}

function listJobs(w: World, person: number): ActResult {
  const rows = openings(w, person);
  const show = rows.slice(0, 12);
  const card = careerCard(w, person);
  const lines = [`You are ${currentJob(w, person) === 'no job' ? 'out of work' : currentJob(w, person)}. ${card.openings.charAt(0).toUpperCase()}${card.openings.slice(1)}.`];
  for (const o of show) lines.push(openingLine(o));
  if (rows.length > show.length) lines.push(`and ${counted(rows.length - show.length, 'more firm', 'more firms')}.`);
  const pending = book(w).apps.find((a) => a.person === person);
  if (pending) {
    const f = econ(w).firms[pending.firm];
    const seat = pending.role || roleTitle(f?.sector ?? '', pending.occ);
    lines.push(`Waiting on ${f?.name ?? 'a firm'} for ${aan(seat)}. They answer on ${dateText(pending.due)}.`);
  }
  for (const n of book(w).notices) if (n.person === person && w.day - n.day <= 12) lines.push(n.text);
  return { status: 'accepted', lines };
}

function applyJob(w: World, person: number, n: number): ActResult {
  const rows = openings(w, person);
  const o = rows.find((r) => r.n === n);
  if (!o) return rejected(rows.length ? `jobs are numbered 1 to ${rows.length}` : 'no firm is short of hands right now');
  const st = book(w);
  const pending = st.apps.find((a) => a.person === person);
  if (pending) {
    const f = econ(w).firms[pending.firm];
    return rejected(`you are already waiting on ${f?.name ?? 'a firm'}`);
  }
  if (!o.taken) return rejected(`${o.name} will not see you for ${aan(o.role)}: ${o.note}`);
  const due = w.day + 3;
  st.apps.push({
    person, firm: o.firm, occ: o.occ, due, n: o.n, wage: o.wage, day: w.day,
    better: o.better, pool: o.pool, role: o.role, note: o.note,
  });
  const wait = due - w.day;
  return { status: 'accepted', text: `You apply to ${o.name} for ${aan(o.role)} at ${usd(o.wage)} a week. They answer in ${counted(wait, 'day', 'days')}, on ${dateText(due)}.` };
}

function quitJob(w: World, person: number): ActResult {
  const s = econ(w), P = s.P;
  const e = P.employer[person];
  if (e < 0) return rejected('you have no job');
  const f = s.firms[e];
  if (!f) return rejected('you have no job');
  const ev = w.events.emit('career.quit', `${P.name(person)} leaves ${f.name} || you quit`, [w.genesis], P.id(person));
  setSimDay(w.day);
  if (f.ceo === person) succession(w, s, f, person, 'quit', ev);
  leaveJob(s, person);
  thought(w, s, person, 30, 'leaving a job', ev);
  return { status: 'accepted', eventId: ev, text: `You leave ${f.name}.` };
}

function askRaise(w: World, person: number): ActResult {
  if (!api) return rejected('the labour market is not open');
  const s = econ(w), P = s.P;
  const e = P.employer[person];
  if (e < 0) return rejected('you have no job to raise');
  const f = s.firms[e];
  if (!f) return rejected('you have no job to raise');
  const st = book(w);
  const prior = st.refused.find((r) => r.person === person && r.firm === f.idx && w.day - r.day < 180);
  if (prior) return rejected(`${f.name} refused you a raise on ${dateText(prior.day)}. They have not forgotten.`);
  const perf = performance(w, person) / 100;
  const tenure = P.occ[person] > 0 ? P.occYrs[person] : 0;
  const profit = f.lastProfit;
  const score = perf * 0.55 + Math.min(1, tenure / 4) * 0.3 + (profit > 0 ? 0.2 : profit < 0 ? -0.15 : 0.05);
  if (!(score >= 0.72) || profit < 0) {
    st.refused.push({ person, firm: f.idx, day: w.day });
    const why = profit < 0 ? `${f.name} is losing money` : tenure < 1 ? 'you had less than a year of tenure' : 'the work has not stood out';
    const ev = w.events.emit('career.raise', `${P.name(person)} is refused a raise at ${f.name} || ${why}`, [w.genesis], P.id(person));
    const text = `${f.name} refuses the raise. ${why.charAt(0).toUpperCase()}${why.slice(1)}.`;
    const from = boss(w, f, person);
    if (from >= 0) postLetter(w, from, text, ev);
    notice(w, person, `Letter: ${text}`);
    return { status: 'accepted', eventId: ev, text };
  }
  const occ = P.occ[person] > 0 ? P.occ[person] : api.seatFor(w, f, person);
  if (!(P.apt[person] > 0)) P.apt[person] = Math.max(0.5, P.skill[person]);
  P.apt[person] = Math.min(2.6, P.apt[person] * 1.03);
  api.setSkill(w, person, api.paySkill(person, occ, P.occYrs[person], P));
  const payWeek = Math.round(P.skill[person] * s.wage * 7 * (wagePrem(w, f.idx) > 0 ? wagePrem(w, f.idx) : 1));
  const ev = w.events.emit('career.raise', `${P.name(person)} is paid more at ${f.name} || the work stood out and the firm can pay`, [w.genesis], P.id(person));
  thought(w, s, person, -40, 'a raise', ev);
  const text = `${f.name} raises your pay. It is now ${usd(payWeek)} a week.`;
  const from = boss(w, f, person);
  if (from >= 0) postLetter(w, from, text, ev);
  notice(w, person, `Letter: ${text}`);
  return { status: 'accepted', eventId: ev, text };
}

function studyField(w: World, person: number, field: string): ActResult {
  if (!api) return rejected('the labour market is not open');
  const occ = fieldOcc(field);
  const row = occ > 0 ? occAt(occ) : undefined;
  if (!row) {
    const names = api.occ.filter((o) => o.id).map((o) => o.name).join(', ');
    return rejected(`study one of: ${names}`);
  }
  const st = book(w);
  const pending = st.study.find((s) => s.person === person);
  if (pending) {
    const left = Math.max(0, pending.due - w.day);
    return rejected(`you are already studying, with ${counted(left, 'day', 'days')} left`);
  }
  const P = econ(w).P;
  const days = 12 + 6 * row.rank;
  const cost = Math.round(econ(w).wage * (8 + 6 * row.rank) * 0.4);
  const id = P.id(person);
  if (Math.floor(w.ledger.balance(id, 'dep')) < cost) return rejected(`studying ${row.name} costs ${usd(cost)}, and you do not have it`);
  const ev = w.events.emit('career.study', `${P.name(person)} starts studying ${row.name} || you paid the fee`, [w.genesis], id);
  if (!pay(w, id, GOV, cost, 'career.study', ev)) return rejected('the fee did not leave your account');
  st.study.push({ person, occ, due: w.day + days });
  return { status: 'accepted', eventId: ev, text: `You start studying ${row.name}. It costs ${usd(cost)} and takes ${counted(days, 'day', 'days')}.` };
}

export function handleCareer(w: World, playerId: string, cmd: Command): ActResult {
  if (!api) return rejected('the labour market is not open');
  const person = playerIndex(w, playerId);
  if (person < 0) return rejected('no such player');
  if (cmd.kind === 'jobs') return listJobs(w, person);
  if (cmd.kind === 'apply') return applyJob(w, person, cmd.n);
  if (cmd.kind === 'quit') return quitJob(w, person);
  if (cmd.kind === 'raise') return askRaise(w, person);
  if (cmd.kind === 'study') return studyField(w, person, cmd.field);
  if (cmd.kind === 'job') return answerOffer(w, person, cmd.id, cmd.answer);
  return rejected('not a career command');
}

function finishStudy(w: World, row: StudyRow): void {
  if (!api) return;
  const P = econ(w).P;
  const occ = occAt(row.occ);
  if (!occ || row.person < 0 || row.person >= P.n || !P.alive(row.person)) return;
  const before = P.school[row.person];
  if (P.school[row.person] < occ.school) P.school[row.person] = occ.school;
  if (!(P.apt[row.person] > 0)) P.apt[row.person] = Math.max(0.5, P.skill[row.person]);
  P.apt[row.person] = Math.min(2.8, P.apt[row.person] * 1.04 + 0.02);
  const years = P.occ[row.person] > 0 ? P.occYrs[row.person] : 0;
  const use = P.occ[row.person] > 0 ? P.occ[row.person] : row.occ;
  api.setSkill(w, row.person, api.paySkill(row.person, use, years, P));
  const text = `You finish studying ${occ.name}. Schooling is ${P.school[row.person]}${P.school[row.person] !== before ? `, up from ${before}` : ''}.`;
  const ev = w.events.emit('career.study', `${P.name(row.person)} finishes studying ${occ.name} || you finished the course`, [w.genesis], P.id(row.person));
  notice(w, row.person, text);
  const e = P.employer[row.person];
  const f = e >= 0 ? econ(w).firms[e] : undefined;
  const from = f ? boss(w, f, row.person) : -1;
  if (from >= 0) postLetter(w, from, text, ev);
}

/** Pay the wage that was on the posting. Schooling can rewrite skill before the letter; the offer does not move. */
function pinOffer(w: World, person: number, firmIdx: number, offer: number): number {
  const s = econ(w), P = s.P;
  const prem = wagePrem(w, firmIdx);
  const m = prem > 0 ? prem : 1;
  const denom = s.wage * 7 * m;
  if (api && offer > 0 && denom > 0) api.setSkill(w, person, Math.max(0.5, Math.min(3, offer / denom)));
  return Math.round(P.skill[person] * s.wage * 7 * m);
}

function hireBecause(app: App): string {
  const n = Math.max(1, (app.pool || 0) + 1);
  const day = app.day ?? 0;
  if ((app.better || 0) <= 0) return `you applied on ${dateText(day)} and were the strongest of ${n}`;
  return `you applied on ${dateText(day)}; it was ${app.note || 'a fair chance'}, and the seat was still open`;
}

function resolveApp(w: World, app: App): void {
  if (!api) return;
  const s = econ(w), P = s.P;
  const f = s.firms[app.firm];
  const role = app.role || (f ? roleTitle(f.sector, app.occ) : 'hand');
  const drop = (text: string, why: string): void => {
    notice(w, app.person, `Letter: ${text}`);
    if (!f || app.person < 0 || app.person >= P.n) return;
    const from = boss(w, f, app.person);
    const ev = w.events.emit('career.refused', `${P.name(app.person)} is refused by ${f.name} || ${why}`, [w.genesis], P.id(app.person));
    if (from >= 0) postLetter(w, from, text, ev);
    notify(w, { kind: 'answer', title: `${f.name} says no`, text, reason: `${why.charAt(0).toUpperCase()}${why.slice(1)}.`, cause: ev, from, actions: [{ label: 'See who is hiring', line: 'jobs' }] });
  };
  if (!f || app.person < 0 || app.person >= P.n || !P.alive(app.person)) return;
  if (P.retired(app.person) || (P.flags[app.person] & 4) !== 0) {
    drop(`${f.name} will not take you on as ${aan(role)}. You cannot take the shift.`, 'you could not take the shift');
    return;
  }
  const youSchool = schoolOf(P, app.person);
  const ask = asks(occAt(app.occ) ?? { id: '', name: role, pay: 1, school: 6, rank: 1 });
  if (!api.qualifies(youSchool, app.occ, false) || P.health[app.person] < 30 || P.outUntil[app.person] > w.day || yearsOf(P, app.person, app.occ) < ask.exp && (occAt(app.occ)?.rank ?? 1) > 2) {
    drop(`${f.name} will not take you on as ${aan(role)}. You no longer meet what the seat asks.`, 'you no longer meet what the seat asks');
    return;
  }
  if (f.closed || !(wagePrem(w, f.idx) > 0)) {
    drop(`${f.name} has stopped hiring.`, 'the firm stopped hiring');
    return;
  }
  const gap = firmGap(w, f);
  const lab = labourOf(P, app.person, w.day) || P.skill[app.person];
  if (gap - lab < -2) {
    drop(`${f.name} filled the ${role} seat before your letter arrived.`, 'the seat was filled before your letter arrived');
    return;
  }
  const why = hireBecause(app);
  const ev = w.events.emit('career.offer', `${f.name} offers ${P.name(app.person)} ${aan(role)} seat || ${why}`, [w.genesis], P.id(app.person));
  const wage = app.wage > 0 ? app.wage : weekly(w, app.person, f.idx, app.occ);
  const ref = (w.state.venues as { seats?: Record<string, { refs?: { firm: number; who: number; until: number }[] }> } | undefined)?.seats?.[playerSeat(w)]?.refs?.find((r) => r.firm === f.idx && r.until >= app.day);
  const o = makeOffer(w, app.person, f, app.occ, role, wage, why, ev, ref ? ref.who : -1, false);
  const from = o.from;
  const sh = hhmm(shiftStartMin(w, o));
  const bossVoice = from >= 0 && from === f.ceo ? `I run ${f.name}, and I read every application for a seat like this one myself.` : `I will be your manager at ${f.name}.`;
  const text = `${bossVoice} We would like you as ${aan(role)} at ${usd(wage)} a week, starting ${dateText(o.start)} at ${sh}. Let me have your answer by ${dateText(o.expires)}.`;
  if (from >= 0) postLetter(w, from, text, ev);
  notice(w, app.person, `Offer: ${f.name}, ${aan(role)} at ${usd(wage)} a week from ${dateText(o.start)}. Answer by ${dateText(o.expires)}.`);
  notify(w, { kind: 'offer', title: `${f.name} offers you a seat`, text: `${aan(role).charAt(0).toUpperCase()}${aan(role).slice(1)} at ${usd(wage)} a week, starting ${dateText(o.start)} at ${sh}. Answer by ${dateText(o.expires)}.`, reason: `${why.charAt(0).toUpperCase()}${why.slice(1)}.`, cause: ev, from, urgent: true, actions: offerActions(o) });
  if (ref && ref.who >= 0 && P.alive(ref.who)) {
    // The person who sent you hears of it and writes, once.
    const st = w.state.circle as { letters?: unknown[] } | undefined;
    if (st && Array.isArray(st.letters)) {
      const fn = P.name(ref.who).split(' ')[0];
      postLetter(w, ref.who, `I heard ${f.name} made you an offer. I told ${from >= 0 ? P.name(from).split(' ')[0] : 'them'} you would not let them down, so do not make a liar of me. Congratulations.`, ev);
      void fn;
    }
  }
}

/** The first working day on or after `day`: offers start on a weekday morning. */
function firstWeekday(day: number): number {
  let d = day;
  while (((d % 7) + 7) % 7 > 4) d++;
  return d;
}

function offerBook(w: World): Offer[] { const st = book(w); return (st.offers ??= []); }

/** A firm says yes: write it as an offer the player can take or leave, with the start date and the day it lapses. */
function makeOffer(w: World, person: number, f: Firm, occ: number, role: string, wage: number, why: string, ev: number, via: number, accepted: boolean): Offer {
  const st = book(w);
  const start = firstWeekday(w.day + (accepted ? 1 : 3));
  const o: Offer = {
    id: st.offerSeq = (st.offerSeq ?? 0) + 1, person, firm: f.idx, occ, role, wage, day: w.day, start,
    expires: accepted ? start : Math.max(w.day + 1, start - 1), status: accepted ? 'accepted' : 'open',
    why, ev, from: boss(w, f, person), via, note: '',
  };
  const list = offerBook(w);
  for (const x of list) if (x.person === person && (x.status === 'open' || (accepted && x.status === 'accepted'))) { x.status = 'lapsed'; x.note = `superseded by the ${f.name} offer`; }
  list.push(o);
  if (list.length > 30) list.splice(0, list.length - 30);
  return o;
}

function offerActions(o: Offer): { label: string; line: string; act: Record<string, unknown> }[] {
  return [
    { label: 'Accept', line: `job accept ${o.id}`, act: { kind: 'job', id: o.id, answer: 'accept' } },
    { label: 'Decline', line: `job decline ${o.id}`, act: { kind: 'job', id: o.id, answer: 'decline' } },
  ];
}

function shiftStartMin(w: World, o: { firm: number; occ: number }): number {
  const f = econ(w).firms[o.firm];
  const hand = o.occ <= 2;
  const sec = f?.sector ?? '';
  if (f && f.ceo === (o as { person?: number }).person) return 480;
  if (!hand) return 540;
  if (sec === 'TRANSPORT') return 360;
  if (sec === 'MINING' || sec === 'CONSTRUCTION' || sec === 'ENERGY' || sec === 'METALS') return 420;
  if (sec === 'MANUFACTURING' || sec === 'CHEMICALS') return 840;
  if (sec === 'HEALTHCARE') return 1320;
  if (sec === 'RETAIL') return 600;
  if (sec === 'AGRICULTURE') return 300;
  return 540;
}
function hhmm(m: number): string { return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }

/** Say yes or no to an offer. A yes fixes the start; a no is written back to the boss who made it. */
function answerOffer(w: World, person: number, id: number, answer: string): ActResult {
  const s = econ(w), P = s.P;
  const list = offerBook(w);
  const o = list.find((x) => x.id === id && x.person === person) ?? (id <= 0 ? list.filter((x) => x.person === person && x.status === 'open').pop() : undefined);
  if (!o) return rejected('there is no such offer');
  const f = s.firms[o.firm];
  const name = f?.name ?? 'the firm';
  if (o.status !== 'open') return rejected(`the ${name} offer is ${o.status === 'started' ? 'already your job' : o.status}`);
  if (w.day > o.expires) { o.status = 'lapsed'; return rejected(`the offer lapsed on ${dateText(o.expires)}`); }
  const yes = answer === 'accept' || answer === 'yes';
  const who = o.from >= 0 && o.from < P.n ? P.name(o.from).split(' ')[0] : '';
  if (!yes) {
    o.status = 'declined';
    const ev = w.events.emit('career.declined', `${P.name(person)} declines ${aan(o.role)} seat at ${name} || you said no`, [o.ev], P.id(person));
    if (o.from >= 0) postLetter(w, o.from, `Understood. I am sorry you will not be joining ${name}, but I would rather hear it now than in a month. If things change, write to me.`, ev);
    return { status: 'accepted', eventId: ev, text: `You turn down the ${o.role} seat at ${name}.${who ? ` ${who} writes back to say the door is not shut.` : ''}` };
  }
  o.status = 'accepted';
  const ev = w.events.emit('career.accepted', `${P.name(person)} accepts ${aan(o.role)} seat at ${name} from ${dateText(o.start)} || you said yes`, [o.ev], P.id(person));
  const sh = hhmm(shiftStartMin(w, o));
  if (o.from >= 0) postLetter(w, o.from, `Good. We will see you on ${dateText(o.start)} at ${sh}. Ask for me at the front; I will walk you round and you can meet the people you will be working with.`, ev);
  const old = P.employer[person];
  return { status: 'accepted', eventId: ev, text: `You accept: ${aan(o.role)} at ${name}, ${usd(o.wage)} a week. You start on ${dateText(o.start)} at ${sh}.${old >= 0 && old !== o.firm ? ` You leave ${s.firms[old]?.name ?? 'your old firm'} the evening before.` : ''}` };
}

export interface FirstDay { key: string; kind: string; place: string; title: string; host: number; who: number[]; eventId: number; day: number; minute: number; treat: boolean }
/** The first-day scenes due from offers that started: the manager, and the colleagues you will sit with. */
export function firstDays(w: World, from: number, to: number): FirstDay[] {
  const out: FirstDay[] = [];
  const list = (w.state.careers as Partial<JobBook> | undefined)?.offers;
  if (!list?.length) return out;
  const s = econ(w), P = s.P;
  for (const o of list) {
    if (o.status !== 'started' || o.start < from || o.start > to) continue;
    const f = s.firms[o.firm];
    if (!f || P.employer[o.person] !== f.idx) continue;
    const host = boss(w, f, o.person);
    if (host < 0) continue;
    const mates: number[] = [];
    for (const i of f.staff) {
      if (mates.length >= 4) break;
      if (i === o.person || i === host || !P.alive(i)) continue;
      if (Math.abs(P.occ[i] - o.occ) <= 1) mates.push(i);
    }
    for (const i of f.staff) { if (mates.length >= 3) break; if (i !== o.person && i !== host && P.alive(i) && !mates.includes(i)) mates.push(i); }
    out.push({ key: 'j' + o.id, kind: 'firstday', place: f.name, title: `Your first day at ${f.name}`, host, who: mates, eventId: o.ev, day: o.start, minute: shiftStartMin(w, o), treat: true });
  }
  return out;
}

/** Offers come due: a lapsed offer closes, and an accepted one starts on its morning. */
function tendOffers(w: World): void {
  const list = (w.state.careers as Partial<JobBook>).offers;
  if (!api || !list?.length) return;
  const s = econ(w), P = s.P;
  // dayClose runs at midnight: an offer starting tomorrow is placed now, so the first morning is already yours.
  const day = w.day + 1;
  for (const o of list) {
    if (o.status === 'open' && day > o.expires) {
      o.status = 'lapsed';
      const f = s.firms[o.firm];
      notify(w, { kind: 'answer', title: `The ${f?.name ?? 'firm'} offer lapsed`, text: `You did not answer ${f?.name ?? 'the firm'} by ${dateText(o.expires)}, so the ${o.role} seat has gone to someone else.`, cause: o.ev, from: o.from, actions: [{ label: 'See who is hiring', line: 'jobs' }] });
      continue;
    }
    if (o.status !== 'accepted' || day < o.start) continue;
    const f = s.firms[o.firm];
    if (!f || f.closed || o.person < 0 || o.person >= P.n || !P.alive(o.person)) { o.status = 'fell'; o.note = 'the firm closed before you started'; continue; }
    if (P.employer[o.person] === f.idx) { o.status = 'started'; continue; }
    const old = P.employer[o.person];
    if (old >= 0) {
      const of = s.firms[old];
      const qev = w.events.emit('career.quit', `${P.name(o.person)} leaves ${of?.name ?? 'a firm'} for ${f.name} || you took another seat`, [o.ev], P.id(o.person));
      setSimDay(w.day);
      if (of && of.ceo === o.person) succession(w, s, of, o.person, 'quit', qev);
      leaveJob(s, o.person);
    }
    const ev = w.events.emit('career.hired', `${P.name(o.person)} starts as ${aan(o.role)} at ${f.name} || ${o.why}`, [o.ev], P.id(o.person));
    api.place(w, o.person, f, o.occ, ev);
    const paid = pinOffer(w, o.person, f.idx, o.wage);
    o.status = 'started';
    o.ev = ev;
    const fd = firstDays(w, o.start, o.start).find((x) => x.key === 'j' + o.id);
    const names = fd ? fd.who.map((i) => P.name(i)) : [];
    const from = fd ? fd.host : boss(w, f, o.person);
    o.from = from;
    const sh = hhmm(shiftStartMin(w, o));
    const text = `${dateText(o.start)} is your first day at ${f.name}, from ${sh}: ${aan(o.role)} at ${usd(paid)} a week.${names.length ? ` You will be working with ${names.slice(0, 3).join(', ')}.` : ''}`;
    if (from >= 0) postLetter(w, from, `Welcome to ${f.name}. I will meet you at the front at ${sh} and walk you round${names.length ? `; ${names[0].split(' ')[0]} will show you the ropes after that` : ''}. Bring a pen and an appetite for paperwork.`, ev);
    if (o.via >= 0 && o.via < P.n && P.alive(o.via) && o.via !== from) postLetter(w, o.via, `You are in at ${f.name}. I told them you would do the work, and you started. Congratulations on the seat.`, ev);
    notice(w, o.person, text);
    notify(w, { kind: 'offer', title: `First day at ${f.name}`, text, reason: `You accepted the offer on ${dateText(o.day)}.`, cause: ev, from, urgent: true, actions: [{ label: 'Go in', line: 'attend' }] });
    thought(w, s, o.person, -35, 'a new job', ev);
  }
}

/** Applications and courses come due on this morning, after the firms have hired. */
export function resolveJobs(w: World): void {
  const st = w.state.careers as Partial<JobBook> | undefined;
  if (!st) return;
  if (st.refused) st.refused = st.refused.filter((r) => w.day - r.day < 400);
  const apps = st.apps ?? [];
  const later: App[] = [];
  for (const app of apps) {
    if (w.day < app.due) later.push(app);
    else resolveApp(w, app);
  }
  st.apps = later;
  const study = st.study ?? [];
  const studyLater: StudyRow[] = [];
  for (const row of study) {
    if (w.day < row.due) studyLater.push(row);
    else finishStudy(w, row);
  }
  st.study = studyLater;
  const seen = noteAttendance(w);
  if (seen && seen.missed) {
    const warn = attendanceWarning(w);
    const s = econ(w), P = s.P;
    const pl = w.state.player as { ids?: string[]; seat?: Record<string, { who?: number }> } | undefined;
    const who = pl?.ids?.[0] ? pl.seat?.[pl.ids[0]]?.who ?? -1 : -1;
    const f = who >= 0 && P.employer[who] >= 0 ? s.firms[P.employer[who]] : undefined;
    if (warn && f) {
      const from = boss(w, f, who);
      const ev = w.events.emit('career.warning', `${P.name(who)} is warned about missed shifts at ${f.name} || ${warn}`, [w.genesis], P.id(who));
      const hours = shiftOf(w, who)?.line.split(':').slice(0, 2).join(':') ?? 'on the board';
      const text = from === f.ceo
        ? `${warn}. I do not run ${f.name} so that people can come when they like. Be on the floor for your shift, or tell me now that you would rather be elsewhere.`
        : `${warn}. I have covered for you once already. Your shift is ${hours}; be there, or I will have to take it upstairs.`;
      if (from >= 0) postLetter(w, from, text, ev);
      notify(w, { kind: 'answer', title: `A word from ${f.name}`, text, reason: `Missed shifts: ${seen.why}.`, cause: ev, from, urgent: true, actions: [{ label: 'See your job', line: 'jobs' }] });
    }
  }
  tendOffers(w);
}

/** A seat someone at a table can offer the player outright: the firm is short of hands and the player can take the shift. */
export function seatOffer(w: World, person: number, firmIdx: number): { occ: number; role: string; wage: number } | null {
  if (!api) return null;
  const s = econ(w), P = s.P;
  const f = firmIdx >= 0 ? s.firms[firmIdx] : undefined;
  if (!f || f.closed || person < 0 || person >= P.n || P.employer[person] === f.idx) return null;
  if (!(firmGap(w, f) > 1) || !(wagePrem(w, f.idx) > 0) || canWork(w, person)) return null;
  const occ = api.seatFor(w, f, person);
  if (!api.qualifies(schoolOf(P, person), occ, false)) return null;
  return { occ, role: roleTitle(f.sector, occ), wage: weekly(w, person, f.idx, occ) };
}

/** Take a seat offered across a table, at the wage that was named. Returns the letter, or why it fell through. */
export function takeSeat(w: World, person: number, firmIdx: number, occ: number, wage: number, cause: number, why: string): { text: string; eventId: number } | { why: string } {
  if (!api) return { why: 'the labour market is not open' };
  const s = econ(w), P = s.P;
  const f = s.firms[firmIdx];
  if (!f || f.closed) return { why: 'the firm has closed' };
  if (!(firmGap(w, f) > 0.5)) return { why: `${f.name} filled the seat in the meantime` };
  const block = canWork(w, person);
  if (block) return { why: block };
  const role = roleTitle(f.sector, occ);
  const ev = w.events.emit('career.offer', `${f.name} offers ${P.name(person)} ${aan(role)} seat, accepted on the spot || ${why}`, [cause >= 0 ? cause : w.genesis], P.id(person));
  const o = makeOffer(w, person, f, occ, role, wage, why, ev, -1, true);
  const sh = hhmm(shiftStartMin(w, o));
  const text = `${f.name} takes you on as ${aan(role)} at ${usd(wage)} a week. You start on ${dateText(o.start)} at ${sh}.`;
  notice(w, person, `Letter: ${text}`);
  notify(w, { kind: 'offer', title: `${f.name} takes you on`, text, reason: `${why.charAt(0).toUpperCase()}${why.slice(1)}.`, cause: ev, from: o.from, actions: [{ label: 'See the job', line: 'jobs' }] });
  return { text, eventId: ev };
}
