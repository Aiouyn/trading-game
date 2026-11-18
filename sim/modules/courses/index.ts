// Evenings at school. A course has a fee and a number of weekly classes; the class is five real people.
// Finishing it raises what the player knows of its sectors (clearer readings of those firms, a better interview),
// and the classmates become people the player has met.
import { type Module, type World } from '../../kernel/index.ts';
import { DEP, GOV, pay, type EconState } from '../economy/index.ts';
import { metClassmate } from '../venues/index.ts';
import { COURSES, type CourseDef } from './know.ts';

export { COURSES } from './know.ts';

interface Class { course: string; start: number; sessions: number; mates: number[]; ev: number }
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

export function courseFee(w: World, c: CourseDef): number { return Math.round(econ(w).wage * c.feeDays); }
export function findCourse(key: string): CourseDef | undefined {
  const k = key.trim().toLowerCase();
  if (!k) return undefined;
  return COURSES.find((c) => c.id === k || c.name.toLowerCase() === k) ?? COURSES.find((c) => c.name.toLowerCase().startsWith(k) || c.id.startsWith(k)) ?? COURSES.find((c) => c.name.toLowerCase().includes(k));
}

export interface CourseRow { id: string; name: string; weeks: number; fee: number; blurb: string; sectors: string[]; done: boolean }
export interface CourseBoard {
  now: { id: string; name: string; sessions: number; weeks: number; nextIn: number; classmates: string[]; eventId: number } | null;
  rows: CourseRow[];
  finished: string[];
}
export function courseBoard(w: World, seat: string): CourseBoard {
  const b = book(w), P = econ(w).P;
  const c = b.class[seat];
  const def = c ? COURSES.find((x) => x.id === c.course) : undefined;
  const known = b.know[seat] ?? {};
  return {
    now: c && def ? {
      id: def.id, name: def.name, sessions: c.sessions, weeks: def.weeks, nextIn: 7 - ((w.day - c.start) % 7),
      classmates: c.sessions > 0 ? c.mates.filter((m) => P.alive(m)).map((m) => P.name(m)) : [], eventId: c.ev,
    } : null,
    rows: COURSES.map((d) => ({ id: d.id, name: d.name, weeks: d.weeks, fee: courseFee(w, d), blurb: d.blurb, sectors: d.sectors, done: known[d.id] !== undefined })),
    finished: COURSES.filter((d) => known[d.id] !== undefined).map((d) => d.name),
  };
}

/** The name of the class that meets this evening, so the player cannot also be at the bar. */
export function classTonight(w: World, seat: string): string {
  const c = book(w).class[seat];
  if (!c || w.day <= c.start || (w.day - c.start) % 7 !== 0) return '';
  return COURSES.find((d) => d.id === c.course)?.name ?? 'class';
}

export function enrol(w: World, seat: string, key: string): { ok: boolean; text: string; eventId?: number } {
  const b = book(w), s = econ(w), P = s.P;
  const me = whoOf(w, seat);
  if (me < 0) return { ok: false, text: 'nobody is enrolled' };
  const def = findCourse(key);
  if (!def) return { ok: false, text: `no such course. Try one of: ${COURSES.map((c) => c.name.toLowerCase()).join(', ')}` };
  if (b.class[seat]) return { ok: false, text: `you are already in ${COURSES.find((c) => c.id === b.class[seat].course)?.name ?? 'a course'}. Finish it first` };
  if (b.know[seat]?.[def.id] !== undefined) return { ok: false, text: `you have already finished ${def.name}` };
  const fee = courseFee(w, def);
  const id = P.id(me);
  if (Math.floor(w.ledger.balance(id, DEP)) < fee) return { ok: false, text: `${def.name} costs $${(fee / 100).toFixed(2)} and you do not have it` };
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
  b.class[seat] = { course: def.id, start: w.day, sessions: 0, mates, ev };
  b.yEnrol++;
  return { ok: true, text: `You enrol in ${def.name}: ${def.weeks} weekly evenings, $${(fee / 100).toFixed(2)} paid. The class meets in a week`, eventId: ev };
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
      const ev = w.events.emit('course.class', `Class ${c.sessions} of ${def.weeks} in ${def.name}`, [c.ev], P.id(me));
      if (c.sessions === 1) for (const m of c.mates) if (P.alive(m)) metClassmate(w, seat, m, def.name, ev);
      if (c.sessions >= def.weeks) {
        (b.know[seat] ??= {})[def.id] = w.day;
        delete b.class[seat];
        b.done++;
        w.events.emit('course.done', `${def.name} finished || ${def.weeks} evenings of class: its sectors read more clearly now`, [ev], P.id(me));
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
