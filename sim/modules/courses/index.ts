// Evenings at school. A course has a fee and a number of weekly classes; the class is five real people.
// Finishing it raises what the player knows of its sectors (clearer readings of those firms, a better interview),
// and the classmates become people the player has met.
import { type Module, type World } from '../../kernel/index.ts';
import { DEP, GOV, pay, type EconState } from '../economy/index.ts';
import { metClassmate } from '../venues/index.ts';
import { standingMult } from '../player/standing.ts';
import { dateText, usd } from '../player/gamedate.ts';
import { notify } from '../circle/notices.ts';
import { COURSES, type CourseDef } from './know.ts';

export { COURSES } from './know.ts';

interface Class { course: string; start: number; sessions: number; mates: number[]; ev: number; notes?: { day: number; n: number; text: string }[] }

/** Class meets at seven in the evening and runs two hours. */
export const CLASS_START = 1140, CLASS_END = 1260;

/** What each evening of a course covers, in order. A longer course repeats the last few as revision and practice. */
const LESSONS: Record<string, string[]> = {
  bookkeeping: ['double entry, and why every debit has a credit', 'reading a balance sheet line by line', 'cash against profit, and how a firm can be profitable and broke', 'stock, write-downs and what a warehouse hides', 'spotting a padded receivable', 'a real set of accounts, taken apart in class'],
  markets: ['how an order book matches buyers and sellers', 'the spread, and who earns it', 'why a price gaps on news', 'short selling and the cost of borrowing stock', 'margin, leverage and the call that ends it', 'funds, dealers and who moves a quiet stock', 'reading the tape of a busy morning', 'a mock trading day, with the teacher as the market'],
  shipping: ['how a cargo is booked and paid for', 'freight rates and what pushes them', 'the quay: cranes, berths and a strike', 'insurance on a ship that may not come', 'a late ship and the shops that feel it', "the port's books, read from the outside"],
  energy: ['oil: barrels, grades and who sets the price', 'gas and power: why the night is cheap', 'the grid, and what a heatwave does to it', 'contracts for months ahead', 'an embargo, and who wins from it', 'chemicals: oil turned into everything else', 'what a refinery earns on a good day', "the class trades a winter's fuel among themselves"],
  property: ['land, and why it is never cheap where you want it', 'rents and what tenants can pay', "a mortgage: rates, terms and the bank's view", 'what a building costs to put up', "the builder's margin and the delays that eat it", 'valuing a house the way a lender does', 'a district rising, and who saw it first', 'the class prices a street of houses'],
  software: ['what engineers actually do all day', 'chips: fabs, yields and a fire on the line', 'shipping a product late, and the cost of it', 'why software firms carry so little stock', 'pricing something that costs nothing to copy', 'hiring engineers in a tight market', 'a launch that went wrong, studied', 'the books of a chip maker', 'patents and who owns an idea', 'the class pitches a product to the teacher'],
  law: ['contracts: offer, acceptance and the small print', 'the courts, from a charge to a verdict', 'insider dealing, and where the line is drawn', 'market abuse: pumps, dumps and wash trades', 'a firm in default and who is paid first', "directors' duties", 'evidence: what a regulator can prove', 'a mock trial', 'bankruptcy, step by step', 'the class reads a real judgment'],
  management: ['a payroll, and the day it is due', 'hiring: what a seat really asks for', 'shifts and the cost of overtime', 'a union at the door', 'cutting staff, and doing it decently', 'running a line that keeps breaking', 'buying inputs ahead of a shortage', 'pricing when costs rise', 'the monthly numbers a board asks for', 'keeping good people', 'a plant in trouble, turned round on paper', 'the class runs a firm for a year in an evening'],
  health: ["a clinic's day, and what it costs", 'drugs: who makes them and what they charge', "a hospital's books", 'insurance, and who pays for what', 'an outbreak, and what it does to a city', 'nursing: shifts, pay and burnout', 'what a stay on a ward really costs', 'a new treatment and who can afford it', 'public against private care', "the class plans a clinic's year"],
  industry: ["inputs, outputs and a worker's day", 'stock on the floor and in the yard', 'a breakdown and the cost of an idle line', 'safety: what an accident costs', 'buying metal ahead of a rise', 'a tour of a plant, on paper and then in person'],
};
function lessonOf(def: CourseDef, n: number): string {
  const list = LESSONS[def.id] ?? [def.blurb.toLowerCase()];
  return n <= list.length ? list[n - 1] : `revision and practice on ${list[(n - 1) % list.length]}`;
}
/** The next evening the class meets, as a day number. */
function nextClassDay(c: Class, today: number, clock: number): number {
  const off = (today - c.start) % 7;
  if (today > c.start && off === 0 && clock < CLASS_END) return today;
  return today + 7 - off;
}
function clockMin(w: World): number { const m = (w.state.clock as { min?: number } | undefined)?.min; return typeof m === 'number' ? m : 0; }
interface Book { class: Record<string, Class>; know: Record<string, Record<string, number>>; done: number; yEnrol: number }

const econ = (w: World): EconState => w.state.economy as EconState;
const book = (w: World): Book => w.state.courses as Book;
function whoOf(w: World, seat: string): number {
  const st = w.state.player as { seat?: Record<string, { who?: number }> } | undefined;
  return st?.seat?.[seat]?.who ?? -1;
}
function mix(a: number, b: number, c: number): number {
  let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f) ^ Math.imul(c, 0x165667b1);
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15;
  return x >>> 0;
}

/** An evening course costs a fraction of the days of wages its length suggests: about a week of pay for the short ones, and more as your standing rises. */
export function courseFee(w: World, c: CourseDef, seat = ''): number {
  const me = seat ? whoOf(w, seat) : -1;
  const stand = me >= 0 ? Math.max(0.7, Math.min(1.6, standingMult(w, me))) : 1;
  return Math.max(100, Math.round(econ(w).wage * c.feeDays * 0.3 * stand));
}
export function findCourse(key: string): CourseDef | undefined {
  const k = key.trim().toLowerCase();
  if (!k) return undefined;
  return COURSES.find((c) => c.id === k || c.name.toLowerCase() === k) ?? COURSES.find((c) => c.name.toLowerCase().startsWith(k) || c.id.startsWith(k)) ?? COURSES.find((c) => c.name.toLowerCase().includes(k));
}

export interface CourseRow { id: string; name: string; weeks: number; fee: number; blurb: string; sectors: string[]; done: boolean; known: boolean }
export interface CourseBoard {
  now: { id: string; name: string; sessions: number; weeks: number; nextIn: number; nextDay: number; nextDate: string; nextTime: string; nextLesson: string; line: string; classmates: string[]; eventId: number; notes: { day: number; n: number; text: string }[] } | null;
  rows: CourseRow[];
  finished: string[];
  knows: string[];
}
/** A course is finished only when it was taken in this game; -1 marks what the life before taught (arrival.ts). */
const taken = (known: Record<string, number>, id: string): boolean => (known[id] ?? -1) >= 0;
export function courseBoard(w: World, seat: string): CourseBoard {
  const b = book(w), P = econ(w).P;
  const c = b.class[seat];
  const def = c ? COURSES.find((x) => x.id === c.course) : undefined;
  const known = b.know[seat] ?? {};
  return {
    now: c && def ? (() => {
      const nd = nextClassDay(c, w.day, clockMin(w));
      const nextIn = nd - w.day;
      const when = nextIn === 0 ? 'tonight at 19:00' : nextIn === 1 ? 'tomorrow at 19:00' : `${dateText(nd)} at 19:00, in ${nextIn} days`;
      return {
        id: def.id, name: def.name, sessions: c.sessions, weeks: def.weeks, nextIn, nextDay: nd, nextDate: dateText(nd), nextTime: '19:00',
        nextLesson: lessonOf(def, c.sessions + 1),
        line: `${def.name}: ${c.sessions} of ${def.weeks} classes done. Class ${c.sessions + 1} is ${when}, on ${lessonOf(def, c.sessions + 1)}.`,
        classmates: c.sessions > 0 ? c.mates.filter((m) => P.alive(m)).map((m) => P.name(m)) : [], eventId: c.ev, notes: (c.notes ?? []).slice(-8),
      };
    })() : null,
    rows: COURSES.map((d) => ({ id: d.id, name: d.name, weeks: d.weeks, fee: courseFee(w, d, seat), blurb: d.blurb, sectors: d.sectors, done: taken(known, d.id), known: known[d.id] !== undefined && !taken(known, d.id) })),
    finished: COURSES.filter((d) => taken(known, d.id)).map((d) => d.name),
    knows: COURSES.filter((d) => known[d.id] !== undefined).map((d) => d.name),
  };
}

/** The class that meets now, or within the next half hour, so the player cannot also be at the bar. Before and after, the evening is free. */
export function classTonight(w: World, seat: string): string {
  const c = book(w).class[seat];
  if (!c || w.day <= c.start || (w.day - c.start) % 7 !== 0) return '';
  const m = clockMin(w);
  if (m < CLASS_START - 30 || m >= CLASS_END) return '';
  const name = COURSES.find((d) => d.id === c.course)?.name ?? 'class';
  return `${name}, class ${c.sessions + 1}, from 19:00 to 21:00. The bars are open again after nine`;
}

export function enrol(w: World, seat: string, key: string): { ok: boolean; text: string; eventId?: number } {
  const b = book(w), s = econ(w), P = s.P;
  const me = whoOf(w, seat);
  if (me < 0) return { ok: false, text: 'nobody is enrolled' };
  const def = findCourse(key);
  if (!def) return { ok: false, text: `no such course. Try one of: ${COURSES.map((c) => c.name.toLowerCase()).join(', ')}` };
  if (b.class[seat]) return { ok: false, text: `you are already in ${COURSES.find((c) => c.id === b.class[seat].course)?.name ?? 'a course'}. Finish it first` };
  if (b.know[seat]?.[def.id] !== undefined) return { ok: false, text: taken(b.know[seat], def.id) ? `you have already finished ${def.name}` : `you already know ${def.name} from your work before this life` };
  const fee = courseFee(w, def, seat);
  const id = P.id(me);
  if (Math.floor(w.ledger.balance(id, DEP)) < fee) return { ok: false, text: `${def.name} costs ${usd(fee)} and you do not have it` };
  const ev = w.events.emit('course.enrol', `Enrolled in ${def.name} || ${def.weeks} weekly evenings, fee paid`, [w.genesis], id);
  if (!pay(w, id, GOV, fee, 'course.fee', ev)) return { ok: false, text: 'the fee did not leave your account' };
  // The class: five adults who would plausibly take it, chosen by who they are.
  const near: { who: number; score: number }[] = [];
  for (let i = 0; i < P.n; i++) {
    if (i === me || !P.adult(w, i) || P.age(w, i) > 55) continue;
    const e = P.employer[i];
    const sec = e >= 0 ? s.firms[e]?.sector : '';
    const fit = (sec && def.sectors.includes(sec) ? 0 : 1) + (e < 0 ? 0.4 : 0) + (P.age(w, i) < 35 ? 0 : 0.3);
    near.push({ who: i, score: fit + (mix(i, w.day, def.weeks) % 1000) / 1000 });
  }
  near.sort((x, y) => x.score - y.score || x.who - y.who);
  const mates = near.slice(0, 5).map((x) => x.who);
  b.class[seat] = { course: def.id, start: w.day, sessions: 0, mates, ev, notes: [] };
  b.yEnrol++;
  return { ok: true, text: `You enrol in ${def.name}: ${def.weeks} weekly evenings, ${usd(fee)} paid. The first class is on ${dateText(w.day + 7)} at 19:00, on ${lessonOf(def, 1)}`, eventId: ev };
}

export const courses: Module = {
  id: 'courses',
  init(w) { w.state.courses = { class: {}, know: {}, done: 0, yEnrol: 0 } as Book; },
  dayClose(w) {
    const b = book(w), P = econ(w).P;
    for (const seat of Object.keys(b.class)) {
      const c = b.class[seat];
      if (w.day <= c.start || (w.day - c.start) % 7 !== 0) continue;
      const def = COURSES.find((d) => d.id === c.course);
      const me = whoOf(w, seat);
      if (!def || me < 0 || !P.alive(me)) { delete b.class[seat]; continue; }
      c.sessions++;
      const lesson = lessonOf(def, c.sessions);
      const ev = w.events.emit('course.class', `Class ${c.sessions} of ${def.weeks} in ${def.name} || ${lesson}`, [c.ev], P.id(me));
      if (c.sessions === 1) for (const m of c.mates) if (P.alive(m)) metClassmate(w, seat, m, def.name, ev);
      const live = c.mates.filter((m) => P.alive(m));
      const mate = live.length ? live[(c.sessions + w.day) % live.length] : -1;
      const fn = mate >= 0 ? P.name(mate).split(' ')[0] : '';
      const mateLine = mate >= 0 ? [
        `${fn} asked the question everyone else was thinking.`,
        `You worked through the exercise with ${fn}.`,
        `${fn} stayed behind to argue a point with the teacher.`,
        `${fn} lent you their notes on the part that went too fast.`,
      ][(c.sessions + mate) % 4] : '';
      const done = c.sessions >= def.weeks;
      const next = done ? '' : ` Class ${c.sessions + 1} is on ${dateText(w.day + 7)} at 19:00: ${lessonOf(def, c.sessions + 1)}.`;
      const note = `Class ${c.sessions} of ${def.weeks} in ${def.name}: ${lesson}. ${mateLine}${next}`.replace(/\s+/g, ' ').trim();
      (c.notes ??= []).push({ day: w.day, n: c.sessions, text: note });
      if (c.notes.length > 12) c.notes.splice(0, c.notes.length - 12);
      if (done) {
        (b.know[seat] ??= {})[def.id] = w.day;
        delete b.class[seat];
        b.done++;
        const dev = w.events.emit('course.done', `${def.name} finished || ${def.weeks} evenings of class: its sectors read more clearly now`, [ev], P.id(me));
        notify(w, { kind: 'course', title: `${def.name}: finished`, text: `${note} The certificate counts as a year in ${def.sectors.map((x) => x.toLowerCase()).join(' and ')} seats, and those firms read more clearly now.`, reason: `You enrolled on ${dateText(c.start)}.`, cause: dev, actions: [{ label: 'See who is hiring', line: 'jobs' }] });
      } else {
        notify(w, { kind: 'course', title: `${def.name}: class ${c.sessions} of ${def.weeks}`, text: note, reason: `You enrolled on ${dateText(c.start)}.`, cause: ev, from: mate, actions: [{ label: 'Courses', line: 'courses' }] });
      }
    }
  },
  stats(w) {
    const b = book(w);
    const out = { enrolled: Object.keys(b.class).length, finished: b.done, started: b.yEnrol };
    b.yEnrol = 0;
    return out;
  },
};
