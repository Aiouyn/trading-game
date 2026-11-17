// A job the player can see, apply for, leave, and study toward. Openings are the firms
// that are short of labour this morning. Hiring uses the same gates as the morning
// round: an adult who is free to work, a firm that is actually short, and no protection
// from a later layoff.
import type { World } from '../../kernel/index.ts';
import { GOODS } from '../economy/content.ts';
import { CAPITAL, GOV, pay, type EconState, type Firm } from '../economy/index.ts';
import { labourOf, leaveJob, setSimDay, succession, thought } from '../economy/people.ts';
import { playerIndex, type ActResult, type Command } from '../player/index.ts';

export interface OccRow { id: string; name: string; pay: number; school: number; rank: number }

interface App {
  person: number; firm: number; occ: number; due: number; n: number;
  wage: number; day: number; better: number; pool: number; role: string;
}
interface Refusal { person: number; firm: number; day: number }
interface StudyRow { person: number; occ: number; due: number }
interface Notice { person: number; day: number; text: string }
interface JobBook { apps: App[]; refused: Refusal[]; study: StudyRow[]; notices: Notice[] }

export interface CareerApi {
  occ: OccRow[];
  qualifies(school: number, occ: number, ceo: boolean): boolean;
  paySkill(i: number, occ: number, years: number, P: EconState['P']): number;
  schoolFromSkill(skill: number): number;
  setSkill(w: World, i: number, next: number): void;
  seatFor(w: World, f: Firm, person: number): number;
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

function roleTitle(sector: string, occ: number): string {
  const row = occAt(occ);
  const titles = ROLES[sector] ?? ROLES.MANUFACTURING;
  const titled = row ? titles[row.rank - 1] : '';
  return titled || row?.name || 'hand';
}

/** Plain odds. Most of the queue being stronger is a long shot; few ahead is likely. */
function chance(better: number, pool: number): string {
  if (pool <= 0 || better <= 0) return 'likely';
  const ratio = better / pool;
  if (ratio >= 0.6) return 'a long shot';
  if (ratio >= 0.3) return 'a fair chance';
  return 'likely';
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

function schoolOf(P: EconState['P'], i: number): number {
  if (P.school[i] >= 6) return P.school[i];
  return api ? api.schoolFromSkill(P.skill[i]) : 6;
}

function asks(row: OccRow): { exp: number; school: number; health: number } {
  const exp = row.rank <= 2 ? 0 : row.rank - 2;
  const health = row.rank >= 6 ? 60 : row.rank >= 4 ? 45 : 30;
  return { exp, school: row.school, health };
}

function yearsOf(P: EconState['P'], i: number, occ: number): number {
  if (P.occ[i] === occ && occ > 0) return P.occYrs[i];
  return 0;
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

function compare(w: World, person: number, f: Firm, occ: number, gap: number): { taken: boolean; note: string; askExp: number; askSchool: number; askHealth: number; youExp: number; youSchool: number; youHealth: number; better: number; pool: number } {
  const row = occAt(occ);
  const P = econ(w).P;
  const ask = row ? asks(row) : { exp: 0, school: 6, health: 30 };
  const youSchool = schoolOf(P, person);
  const youExp = yearsOf(P, person, occ);
  const youHealth = P.health[person];
  const blank = { askExp: ask.exp, askSchool: ask.school, askHealth: ask.health, youExp, youSchool, youHealth, better: 0, pool: 0 };
  if (!api || !row) return { ...blank, taken: false, note: 'that seat is not hired' };
  if (f.closed) return { ...blank, taken: false, note: 'the firm is closed' };
  if (!(wagePrem(w, f.idx) > 0)) return { ...blank, taken: false, note: 'the plant is struck and is not hiring' };
  if (!(gap > 1)) return { ...blank, taken: false, note: 'the firm is not short of staff' };
  const block = canWork(w, person);
  if (block) return { ...blank, taken: false, note: block };
  if (!api.qualifies(youSchool, occ, false)) return { ...blank, taken: false, note: `school ${youSchool} is short of ${ask.school}` };
  if (youHealth < ask.health) return { ...blank, taken: false, note: `health ${youHealth} is short of ${ask.health}` };
  if (youExp < ask.exp) return { ...blank, taken: false, note: `${counted(youExp, 'year', 'years')} is short of ${ask.exp}` };
  const mine = labourOf(P, person, w.day);
  let pool = 0, better = 0;
  const adultLine = w.day - 18 * 360;
  for (let i = 0; i < P.n; i++) {
    if (i === person || P.employer[i] >= 0) continue;
    if ((P.flags[i] & 1) === 0 || (P.flags[i] & 6) !== 0 || P.born[i] > adultLine) continue;
    if (P.outUntil[i] > w.day || P.health[i] < ask.health) continue;
    if (!api.qualifies(schoolOf(P, i), occ, false)) continue;
    if (yearsOf(P, i, occ) < ask.exp) continue;
    pool++;
    if (labourOf(P, i, w.day) > mine) better++;
  }
  return { ...blank, taken: true, better, pool, note: chance(better, pool) };
}

function openings(w: World, person: number): Opening[] {
  if (!api) return [];
  const s = econ(w), P = s.P;
  const rows: Opening[] = [];
  const here = person >= 0 && person < P.n ? P.employer[person] : -1;
  for (const f of s.firms) {
    if (f.closed || f.idx === here) continue;
    const gap = firmGap(w, f);
    if (!(gap > 1)) continue;
    const occ = api.seatFor(w, f, person);
    const cmp = compare(w, person, f, occ, gap);
    rows.push({
      n: 0, firm: f.idx, name: f.name, sector: f.sector, occ, role: roleTitle(f.sector, occ), gap,
      wage: weekly(w, person, f.idx, occ),
      askExp: cmp.askExp, askSchool: cmp.askSchool, askHealth: cmp.askHealth,
      youExp: cmp.youExp, youSchool: cmp.youSchool, youHealth: cmp.youHealth,
      taken: cmp.taken, note: cmp.note, better: cmp.better, pool: cmp.pool,
    });
  }
  rows.sort((a, b) => (b.taken ? 1 : 0) - (a.taken ? 1 : 0) || b.gap - a.gap || a.firm - b.firm);
  for (let i = 0; i < rows.length; i++) rows[i].n = i + 1;
  return rows;
}

interface RoleGroup { n: number; role: string; firms: Opening[]; lo: number; hi: number }

function boards(w: World, person: number): RoleGroup[] {
  const rows = openings(w, person);
  const map = new Map<string, Opening[]>();
  for (const o of rows) {
    const list = map.get(o.role);
    if (list) list.push(o);
    else map.set(o.role, [o]);
  }
  const groups: RoleGroup[] = [];
  for (const [role, firms] of map) {
    firms.sort((a, b) => (b.taken ? 1 : 0) - (a.taken ? 1 : 0) || a.better - b.better || b.wage - a.wage || a.name.localeCompare(b.name));
    let lo = firms[0].wage, hi = firms[0].wage;
    for (const f of firms) {
      if (f.wage < lo) lo = f.wage;
      if (f.wage > hi) hi = f.wage;
    }
    groups.push({ n: 0, role, firms, lo, hi });
  }
  groups.sort((a, b) => {
    const A = a.firms[0], B = b.firms[0];
    return (B.taken ? 1 : 0) - (A.taken ? 1 : 0) || A.better - B.better || b.hi - a.hi || a.role.localeCompare(b.role);
  });
  for (let i = 0; i < groups.length; i++) groups[i].n = i + 1;
  return groups;
}

function groupLine(g: RoleGroup): string {
  const best = g.firms[0];
  const more = g.firms.length - 1;
  const where = more > 0 ? `${best.name} and ${more} more` : best.name;
  const wage = g.lo === g.hi ? `${usd(g.lo)} a week` : `${usd(g.lo)} to ${usd(g.hi)} a week`;
  const role = g.role.charAt(0).toUpperCase() + g.role.slice(1);
  return `${g.n}. ${role} — ${where} — ${wage} — asks ${counted(best.askExp, 'year', 'years')}, school ${best.askSchool}, health ${best.askHealth} — ${best.note}`;
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

export function careerCard(w: World, person: number): { job: string; wage: number; tenure: number; performance: number; openings: string } {
  const P = econ(w).P;
  const job = currentJob(w, person);
  const e = person >= 0 && person < P.n ? P.employer[person] : -1;
  const wage = e >= 0 ? Math.round(P.skill[person] * econ(w).wage * 7 * (wagePrem(w, e) > 0 ? wagePrem(w, e) : 1)) : 0;
  const tenure = e >= 0 && P.occ[person] > 0 ? P.occYrs[person] : 0;
  let n = 0;
  if (api && person >= 0) n = openings(w, person).length;
  else if (w.state.economy) {
    for (const f of econ(w).firms) if (!f.closed && firmGap(w, f) > 1 && wagePrem(w, f.idx) > 0) n++;
  }
  const openingsText = n ? `${counted(n, 'firm is', 'firms are')} hiring` : 'no firm is hiring';
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

function listJobs(w: World, person: number): ActResult {
  const groups = boards(w, person);
  const show = groups.slice(0, 5);
  const lines = [`You are ${currentJob(w, person) === 'no job' ? 'out of work' : currentJob(w, person)}. ${careerCard(w, person).openings}.`];
  if (!show.length) lines.push('No firm is short of staff.');
  for (const g of show) lines.push(groupLine(g));
  if (groups.length > show.length) lines.push(`and ${counted(groups.length - show.length, 'more role', 'more roles')}.`);
  const pending = book(w).apps.find((a) => a.person === person);
  if (pending) {
    const f = econ(w).firms[pending.firm];
    const seat = pending.role || roleTitle(f?.sector ?? '', pending.occ);
    lines.push(`Waiting on ${f?.name ?? 'a firm'} for ${aan(seat)}. They answer on day ${pending.due}.`);
  }
  for (const n of book(w).notices) if (n.person === person && w.day - n.day <= 12) lines.push(n.text);
  return { status: 'accepted', lines };
}

function applyJob(w: World, person: number, n: number): ActResult {
  const groups = boards(w, person);
  const g = groups.find((r) => r.n === n);
  const o = g?.firms[0];
  if (!g || !o) return rejected(groups.length ? `jobs are numbered 1 to ${Math.min(5, groups.length)}` : 'no firm is hiring');
  const st = book(w);
  const pending = st.apps.find((a) => a.person === person);
  if (pending) {
    const f = econ(w).firms[pending.firm];
    return rejected(`you are already waiting on ${f?.name ?? 'a firm'}`);
  }
  if (!o.taken) return rejected(`${o.name} will not see you for ${aan(o.role)}. ${o.note}`);
  const due = w.day + 3;
  st.apps.push({
    person, firm: o.firm, occ: o.occ, due, n: g.n, wage: o.wage, day: w.day,
    better: o.better, pool: o.pool, role: o.role,
  });
  const wait = due - w.day;
  return { status: 'accepted', text: `You apply to ${o.name} for ${aan(o.role)} at ${usd(o.wage)} a week. They answer in ${counted(wait, 'day', 'days')}.` };
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
  if (prior) return rejected(`${f.name} refused you a raise on day ${prior.day}. They have not forgotten.`);
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
  const cost = Math.round(econ(w).wage * (8 + 6 * row.rank));
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
  if ((app.better || 0) <= 0) return `you applied on day ${day} and were the strongest of ${n}`;
  return `you applied on day ${day}; it was ${chance(app.better || 0, app.pool || 0)}, and the seat was still open`;
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
  const ev = w.events.emit('career.hired', `${P.name(app.person)} is hired as ${aan(role)} at ${f.name} || ${why}`, [w.genesis], P.id(app.person));
  api.place(w, app.person, f, app.occ, ev);
  const posted = app.wage || 0;
  const paid = pinOffer(w, app.person, f.idx, posted);
  const offer = posted > 0 ? posted : paid;
  const text = paid === offer
    ? `${f.name} takes you on as ${aan(role)} at ${usd(offer)} a week.`
    : `${f.name} takes you on as ${aan(role)} at ${usd(paid)} a week. The posting was ${usd(offer)}; the city wage moved before they wrote.`;
  const from = boss(w, f, app.person);
  if (from >= 0) postLetter(w, from, text, ev);
  notice(w, app.person, `Letter: ${text}`);
  thought(w, s, app.person, -35, 'a new job', ev);
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
}
