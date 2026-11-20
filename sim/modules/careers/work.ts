// A job with a pulse: the hours it takes, whether you turned up, and how the work is going, in words about you.
// Shifts follow the trade and the seat. Attendance is kept for the player only: a shift you spent at a bar or a dinner
// is a shift you missed. Performance moves with attendance, skill, time in the seat and what you studied.
import type { World } from '../../kernel/index.ts';
import type { EconState } from '../economy/index.ts';
import { knowledgeIn, COURSES } from '../courses/know.ts';

const econ = (w: World): EconState => w.state.economy as EconState;
const OPEN_MIN = 570, CLOSE_MIN = 960;

export interface Shift { start: number; end: number; days: number[]; label: string; overlapsMarket: boolean; line: string; hours: number }

interface Att { day: number; here: number; why: string }
interface WorkBook { att: Att[]; firm: number; since: number; warned: number }

function hhmm(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
function daysText(days: number[]): string {
  if (days.length === 5 && days[0] === 0 && days[4] === 4) return 'Monday to Friday';
  if (days.length >= 2 && days.every((d, k) => k === 0 || d === days[k - 1] + 1)) return `${WEEK[days[0]]} to ${WEEK[days[days.length - 1]]}`;
  return days.map((d) => WEEK[d]).join(', ');
}

function seatKey(w: World): string { return (w.state.player as { ids?: string[] } | undefined)?.ids?.[0] ?? ''; }
function playerWho(w: World): number {
  const st = w.state.player as { ids?: string[]; seat?: Record<string, { who?: number }> } | undefined;
  const k = st?.ids?.[0];
  return k ? st?.seat?.[k]?.who ?? -1 : -1;
}

/** The hours a seat takes: by the trade, and by whether it is a hand's seat or a desk. */
export function shiftOf(w: World, person: number): Shift | null {
  const s = econ(w), P = s.P;
  if (person < 0 || person >= P.n) return null;
  const e = P.employer[person];
  const f = e >= 0 ? s.firms[e] : undefined;
  if (!f) return null;
  const occ = P.occ[person];
  const hand = occ <= 2;
  const chief = f.ceo === person;
  let start = 540, end = 1050, days = [0, 1, 2, 3, 4], label = 'office hours';
  const sec = f.sector;
  if (chief) { start = 480; end = 1140; label = 'a chief\'s day, and the evenings that come with it'; }
  else if (sec === 'TRANSPORT' && hand) { start = 360; end = 840; label = 'the early shift on the quay'; }
  else if ((sec === 'MINING' || sec === 'CONSTRUCTION' || sec === 'ENERGY' || sec === 'METALS') && hand) { start = 420; end = 900; label = 'the day shift on site'; }
  else if ((sec === 'MANUFACTURING' || sec === 'CHEMICALS') && hand) { start = 840; end = 1320; label = 'the late shift on the line'; }
  else if (sec === 'HEALTHCARE' && hand) { start = 1320; end = 360; days = [0, 1, 2, 3]; label = 'nights on the ward'; }
  else if (sec === 'RETAIL' && hand) { start = 600; end = 1080; days = [1, 2, 3, 4, 5]; label = 'shop hours, Saturdays included'; }
  else if (sec === 'AGRICULTURE' && hand) { start = 300; end = 780; days = [0, 1, 2, 3, 4, 5]; label = 'farm hours from first light'; }
  const span = end > start ? end - start : end + 1440 - start;
  const overlap = days.some((d) => d < 5) && (end > start ? start < CLOSE_MIN && end > OPEN_MIN : start < CLOSE_MIN || end > OPEN_MIN);
  const line = `${hhmm(start)} to ${hhmm(end)}, ${daysText(days)}: ${label}.${overlap ? ` It overlaps the exchange (09:30 to 16:00), so trading during it means doing it from the ${hand ? 'break room' : 'desk'}.` : ' The exchange hours are yours.'}`;
  return { start, end, days, label, overlapsMarket: overlap, line, hours: Math.round(span / 60 * 10) / 10 };
}

/** Is this minute of this day inside the person's shift? */
export function onShift(w: World, person: number, day: number, minute: number): boolean {
  const sh = shiftOf(w, person);
  if (!sh) return false;
  const dow = ((day % 7) + 7) % 7;
  if (sh.end > sh.start) return sh.days.includes(dow) && minute >= sh.start && minute < sh.end;
  if (minute >= sh.start) return sh.days.includes(dow);
  const prev = (dow + 6) % 7;
  return sh.days.includes(prev) && minute < sh.end;
}

function book(w: World): WorkBook {
  const st = w.state.careers as { work?: WorkBook };
  return (st.work ??= { att: [], firm: -1, since: -1, warned: -1 });
}

/** Called at the day's close: was the player at work today? A bar or a dinner during the shift is a missed shift. */
export function noteAttendance(w: World): { missed: boolean; why: string } | null {
  const me = playerWho(w);
  const s = econ(w), P = s.P;
  if (me < 0 || me >= P.n || !P.alive(me)) return null;
  const e = P.employer[me];
  const b = book(w);
  if (e < 0) { b.firm = -1; return null; }
  if (b.firm !== e) { b.firm = e; b.since = w.day; b.att = []; }
  const sh = shiftOf(w, me);
  if (!sh) return null;
  const dow = ((w.day % 7) + 7) % 7;
  if (!sh.days.includes(dow)) return null;
  let why = '';
  if (P.outUntil[me] > w.day) why = 'off sick';
  const vb = w.state.venues as { seats?: Record<string, { table: { day: number; openAbs: number; minutes: number; venue: number; scene?: { kind: string; place: string } } | null }> } | undefined;
  const t = vb?.seats?.[seatKey(w)]?.table;
  if (!why && t && t.day === w.day && !(t.scene && t.scene.kind === 'firstday')) {
    const from = t.openAbs - w.day * 1440;
    const to = from + Math.max(10, t.minutes);
    const a = sh.start, z = sh.end > sh.start ? sh.end : sh.end + 1440;
    if (from < z && to > a) why = t.scene ? `at ${t.scene.place} during the shift` : 'out at a bar during the shift';
  }
  b.att.push({ day: w.day, here: why ? 0 : 1, why });
  if (b.att.length > 30) b.att.splice(0, b.att.length - 30);
  return { missed: !!why, why };
}

/** Shifts in the last 20 the player turned up for. */
export function attendance(w: World): { here: number; of: number; missed: Att[] } {
  const b = book(w);
  const rows = b.att.slice(-20);
  return { here: rows.filter((r) => r.here).length, of: rows.length, missed: rows.filter((r) => !r.here) };
}

export function perfWord(n: number): string {
  if (n >= 80) return 'Excellent';
  if (n >= 66) return 'Good';
  if (n >= 50) return 'Ordinary';
  if (n >= 35) return 'Slipping';
  return 'Poor';
}

/** How the work is going, and why, in sentences about you. */
export function performanceOf(w: World, person: number): { score: number; word: string; why: string[] } {
  const s = econ(w), P = s.P;
  if (person < 0 || person >= P.n || !P.alive(person) || P.employer[person] < 0) return { score: 0, word: 'No job', why: ['You hold no job.'] };
  const f = s.firms[P.employer[person]];
  let mean = 1, n = 0, sum = 0;
  for (const i of f.staff) { if (P.occ[i] === P.occ[person]) { sum += P.skill[i]; n++; } }
  if (n) mean = sum / n;
  const rel = P.skill[person] / Math.max(0.4, mean);
  const skillPts = Math.max(0, Math.min(38, Math.round(rel * 30)));
  const why: string[] = [];
  why.push(`Your skill is ${P.skill[person].toFixed(2)} against ${mean.toFixed(2)} for others in the same seat (+${skillPts}).`);
  const att = person === playerWho(w) ? attendance(w) : { here: 1, of: 1, missed: [] as Att[] };
  const rate = att.of ? att.here / att.of : 1;
  const attPts = Math.round(rate * 34);
  if (att.of) why.push(`You came to ${att.here} of your last ${att.of} shifts (+${attPts}).${att.missed.length ? ` Missed: ${att.missed.slice(-2).map((m) => m.why).join('; ')}.` : ''}`);
  else why.push(`Your first shift is still ahead (+${attPts}).`);
  const b = book(w);
  const days = b.firm === f.idx && b.since >= 0 ? w.day - b.since : P.occYrs[person] * 360;
  const tenPts = Math.min(10, Math.round(days / 18));
  why.push(days < 30 ? `${days} ${days === 1 ? 'day' : 'days'} in the seat: still learning the floor (+${tenPts}).` : `${days >= 360 ? `${Math.floor(days / 360)} ${days >= 720 ? 'years' : 'year'}` : `${Math.floor(days / 7)} weeks`} in the seat (+${tenPts}).`);
  const seat = seatKey(w);
  const know = person === playerWho(w) && seat ? knowledgeIn(w, seat, f.sector) : 0;
  const knowPts = know * 6;
  if (know) why.push(`${COURSES.filter((c) => c.sectors.includes(f.sector)).map((c) => c.name).slice(0, 1).join('')} and your other classes touch the work (+${knowPts}).`);
  else {
    const c = COURSES.find((x) => x.sectors.includes(f.sector));
    if (c) why.push(`No course in the trade yet: ${c.name} would add up to +6.`);
  }
  const hp = Math.round(P.health[person] / 100 * 6);
  why.push(`Health ${P.health[person]} (+${hp}).`);
  const score = Math.max(0, Math.min(100, skillPts + attPts + tenPts + knowPts + hp));
  return { score, word: perfWord(score), why };
}

/** A boss's word when shifts are being missed: three in the last ten. Returns the text once per fortnight. */
export function attendanceWarning(w: World): string {
  const b = book(w);
  const last = b.att.slice(-10);
  const missed = last.filter((r) => !r.here).length;
  if (missed < 3 || (b.warned >= 0 && w.day - b.warned < 14)) return '';
  b.warned = w.day;
  return `You missed ${missed} of your last ${last.length} shifts`;
}
