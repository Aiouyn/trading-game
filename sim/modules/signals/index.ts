// An edge before the market. Each month, a few days before the listed firms print, the player's own life
// hands them noisy readings of how a quarter is really going: the dock, the shop floor, a friend at a firm,
// the street. The street's number is next to it: an analyst consensus built from last month's books.
// At the print the truth comes out against that consensus and each signal is marked right or wrong.
// Signals read the firm's own state; they never write to it. Legal status is on the signal.
import { type Module, type World } from '../../kernel/index.ts';
import { BANK, type EconState } from '../economy/index.ts';
import { askFirm, contactsOf } from '../social/index.ts';
import { dueThisMonth, deskOf, previewEvent, quarterView, reportsAfter, type QuarterView, type Report } from '../earnings/index.ts';
import { dockWatch } from '../port/index.ts';
import { knowledgeBonus } from '../courses/know.ts';
import { whole as grouped } from '../player/gamedate.ts';

export type Kind = 'work' | 'contact' | 'street';
export interface Signal {
  id: number; day: number; seat: string; kind: Kind;
  /** Who saw it (a person index), and who they got it from when it came by word of mouth. */
  observer: number; source: number;
  issuer: string; name: string; firm: number;
  text: string;
  /** +1 the quarter looks better than the street thinks, -1 worse, 0 about in line. */
  lean: -1 | 0 | 1;
  clarity: number; clearWord: string;
  /** fair: your own job or the street. inside: held by someone bound to keep it, so trading on it is insider dealing. */
  legal: 'fair' | 'inside';
  legalLine: string;
  event: number;
  outcome: 'open' | 'right' | 'wrong';
  /** The earnings report that settled it, and the surprise it carried. */
  report: number; surprise: number;
}
export interface Consensus {
  issuer: string; name: string; firm: number; day: number;
  /** Profit the street expects for the quarter, in cents, and the spread of the analysts behind it. */
  profit: number; high: number; low: number; analysts: number;
  /** The street works from the books to last month-end, so its number is this many days old. */
  lagDays: number;
  /** Running tilt of this firm's consensus against what was printed: above 0 means the street runs hopeful. */
  tilt: number;
  /** Filled at the print. */
  actual: number | null; surprise: number | null; event: number;
}
export interface Reveal {
  issuer: string; name: string; day: number; event: number;
  consensus: number; actual: number; surprise: number; px: number; pxAfter: number;
  /** The signals this quarter held, and how many pointed the right way. */
  signals: number; right: number;
  /** What the paper says moved the stock, and whether that is what moved it. */
  story: string; storyRight: boolean; storyEvent: number;
}
interface Tally { n: number; right: number; wrong: number }
interface SignalState {
  items: Signal[]; consensus: Record<string, Consensus>; reveals: Reveal[];
  tally: Record<Kind, Tally>; byLegal: Record<'fair' | 'inside', Tally>;
  press: { stories: number; right: number };
  seenEv: number; nextId: number; root: number;
  yMade: number; yInside: number;
}

const econ = (w: World): EconState => w.state.economy as EconState;
const stOf = (w: World): SignalState => w.state.signals as SignalState;
const KEEP = 160, KEEP_REVEALS = 400;
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

function money(cents: number): string {
  const a = Math.abs(cents), sign = cents < 0 ? '-' : '';
  if (a >= 1e8) return `${sign}$${(a / 1e8).toFixed(2)}M`;
  if (a >= 1e5) return `${sign}$${(a / 1e5).toFixed(1)}k`;
  return `${sign}${grouped(a)}`;
}
function clearWord(c: number): string { return c >= 0.7 ? 'clear' : c >= 0.5 ? 'fair' : 'faint'; }

function players(w: World): { id: string; who: number }[] {
  const st = w.state.player as { ids?: string[]; seat?: Record<string, { who: number }> } | undefined;
  const out: { id: string; who: number }[] = [];
  if (!st?.ids || !st.seat) return out;
  const P = econ(w).P;
  for (const id of st.ids) {
    const who = st.seat[id]?.who ?? -1;
    if (who >= 0 && who < P.n && P.alive(who)) out.push({ id, who });
  }
  return out;
}
function nameOf(w: World, firm: number): string {
  return firm >= 0 ? econ(w).firms[firm]?.name ?? 'the firm' : 'the bank';
}
function issuerOf(w: World, firm: number): string { return firm >= 0 ? econ(w).firms[firm]?.id ?? '' : BANK; }

/** A reading of the quarter: the true edge, blurred by how well placed the observer is. */
function read(w: World, view: QuarterView, clarity: number): -1 | 0 | 1 {
  // Perception noise: a named stream, so the run stays deterministic.
  const noise = (1 - clarity) * 0.1 * w.rng('signals:eye').normal();
  const blurred = view.edge + noise;
  return blurred > 0.025 ? 1 : blurred < -0.025 ? -1 : 0;
}

const FAIR_JOB = 'Fair game: you saw this yourself, doing your own job.';
const FAIR_STREET = 'Fair game: anyone can see this from the street.';
const FAIR_TALK = 'Fair game: a worker on the floor passing on what the floor looks like, not the books.';
const INSIDE_TALK = 'Inside information: they sit where the quarter is added up and owe the firm silence. Trading on it is insider dealing.';
const INSIDE_OWN = 'Inside information: you are on the desk that holds the quarter. Trading on it before the print is insider dealing.';

function jobText(w: World, sector: string, name: string, lean: number): string {
  if (sector === 'TRANSPORT' || sector === 'ENERGY') {
    const d = dockWatch(w);
    if (d) {
      const lead = d.waiting > 0 ? `${d.waiting} ship${d.waiting === 1 ? ' stands' : 's stand'} off the berths` : `${d.berthed} of ${d.berths} berths are working`;
      const top = [...d.booking].sort((a, b) => Math.abs(b.pace) - Math.abs(a.pace))[0];
      const goods = top ? `, ${top.name} bookings ${top.pace >= 0 ? 'up' : 'down'}` : '';
      return lean > 0 ? `${lead}${goods}; ${name} is booking more than it was` : lean < 0 ? `${lead}${goods}; ${name} is booking less than it was` : `${lead}${goods}; ${name} looks as usual`;
    }
  }
  const at = `at ${name}`;
  if (sector === 'RETAIL') return lean > 0 ? `footfall ${at} is up and the tills have queues` : lean < 0 ? `footfall ${at} is thin; the aisles are quiet` : `footfall ${at} is about as usual`;
  if (sector === 'TECHNOLOGY' || sector === 'MANUFACTURING') return lean > 0 ? `the product ${at} is shipping ahead of plan` : lean < 0 ? `the product ${at} is running late; the line waits on a part` : `the product ${at} is on schedule`;
  if (sector === 'FINANCE') return lean > 0 ? `loan applications ${at} are stacking up` : lean < 0 ? `loan demand ${at} has dried up` : `loan demand ${at} is steady`;
  return lean > 0 ? `orders ${at} are brisk this month` : lean < 0 ? `orders ${at} are slow this month` : `orders ${at} look normal`;
}
function talkText(w: World, who: number, firm: number, lean: number): string {
  const P = econ(w).P, f = econ(w).firms[firm];
  const name = P.name(who);
  if (!f) return `${name} says the quarter looks ${lean > 0 ? 'good' : lean < 0 ? 'poor' : 'ordinary'}`;
  const chiefOut = f.ceo < 0 || (f.ceo < P.n && P.outUntil[f.ceo] > w.day);
  if (lean < 0 && chiefOut) return `${name} at ${f.name}: "the chief is out, and nobody is deciding anything"`;
  if (lean > 0) return `${name} at ${f.name}: "we're hiring again, orders are coming in"`;
  if (lean < 0) return `${name} at ${f.name}: "orders are slow this month"`;
  return `${name} at ${f.name}: "nothing much has changed"`;
}
function streetText(w: World, sector: string, name: string, lean: number): string {
  if (sector === 'RETAIL') return lean > 0 ? `queues out of the door at ${name}` : lean < 0 ? `${name}'s shops stand half empty` : `${name}'s shops look busy as usual`;
  if (sector === 'TRANSPORT') {
    const d = dockWatch(w);
    if (d && d.waiting > 0) return `${d.waiting} ships wait off the harbour; ${name} ${lean >= 0 ? 'has its hands full' : 'is not getting its cargo'}`;
  }
  return lean > 0 ? `lights on late and vans at the gate at ${name}` : lean < 0 ? `empty desks and dark floors at ${name}` : `${name} looks as it always does`;
}

function add(w: World, st: SignalState, seat: string, kind: Kind, observer: number, source: number, firm: number, view: QuarterView, clarity: number, legal: 'fair' | 'inside', legalLine: string, make: (lean: -1 | 0 | 1) => string): void {
  clarity = clamp(clarity + knowledgeBonus(w, seat, firm), 0.15, 0.92);
  const lean = read(w, view, clarity);
  const text = make(lean);
  const name = nameOf(w, firm), issuer = issuerOf(w, firm);
  const cause = previewEvent(w, firm);
  const event = w.events.emit('signals.seen', `${text}. ${legalLine}`, [cause >= 0 && w.events.get(cause) ? cause : st.root], issuer);
  st.items.push({
    id: st.nextId++, day: w.day, seat, kind, observer, source, issuer, name, firm, text, lean, clarity: +clarity.toFixed(2), clearWord: clearWord(clarity),
    legal, legalLine, event, outcome: 'open', report: -1, surprise: 0,
  });
  if (st.items.length > KEEP) st.items.splice(0, st.items.length - KEEP);
  st.yMade++;
  if (legal === 'inside') st.yInside++;
}

function watch(w: World, st: SignalState, seat: string, who: number): void {
  const s = econ(w), P = s.P;
  const due = dueThisMonth(w);
  if (!due.length) return;
  const views = new Map<number, QuarterView>();
  for (const fi of due) { const v = quarterView(w, fi); if (v) views.set(fi, v); }
  const taken = new Set<number>();
  const own = P.employer[who] >= 0 ? s.firms[P.employer[who]] : undefined;
  const sector = own?.sector ?? '';
  const tenure = own ? Math.min(0.2, P.occYrs[who] * 0.025) : 0;

  // From work: the firm you work at, then what your seat lets you see of its neighbours.
  if (own && views.has(own.idx)) {
    const insider = deskOf(w, own.idx).includes(who) || own.ceo === who;
    add(w, st, seat, 'work', who, who, own.idx, views.get(own.idx)!, 0.58 + tenure + (insider ? 0.15 : 0), insider ? 'inside' : 'fair',
      insider ? INSIDE_OWN : FAIR_JOB, (l) => jobText(w, own.sector, own.name, l));
    taken.add(own.idx);
  } else if (own) {
    let seen = 0;
    for (const fi of due) {
      if (seen >= 2 || fi < 0 || taken.has(fi)) continue;
      const f = s.firms[fi];
      const fits = f && (f.sector === sector || (sector === 'TRANSPORT' && f.good !== 'FREIGHT'));
      if (!fits || !views.has(fi)) continue;
      add(w, st, seat, 'work', who, who, fi, views.get(fi)!, 0.46 + tenure, 'fair', FAIR_JOB, (l) => jobText(w, sector, f.name, l));
      taken.add(fi); seen++;
    }
  }
  if (own && sector === 'FINANCE' && views.has(-1)) {
    add(w, st, seat, 'work', who, who, -1, views.get(-1)!, 0.5 + tenure, 'fair', FAIR_JOB, (l) => jobText(w, 'FINANCE', 'the bank', l));
    taken.add(-1);
  }

  // From the circle: a contact who works at a firm that prints this month.
  let n = 0;
  for (const c of contactsOf(w, who)) {
    if (n >= 4) break;
    if (c.trust < 30 || c.who < 0 || c.who >= P.n || !P.alive(c.who)) continue;
    const fi = P.employer[c.who];
    if (fi < 0 || !views.has(fi) || taken.has(fi)) continue;
    const f = s.firms[fi];
    if (!f || f.closed) continue;
    const insider = f.ceo === c.who || deskOf(w, fi).slice(0, 5).includes(c.who);
    const skill = clamp((P.skill[c.who] - 0.5) / 2.5, 0, 1);
    const clarity = 0.3 + c.trust / 250 + (insider ? 0.22 : skill * 0.12) + Math.min(0.1, P.occYrs[c.who] * 0.01);
    add(w, st, seat, 'contact', who, c.who, fi, views.get(fi)!, clarity, insider ? 'inside' : 'fair', insider ? INSIDE_TALK : FAIR_TALK, (l) => talkText(w, c.who, fi, l));
    // An insider's word reaches the player through the social layer too, so the law sees who knew.
    if (insider) askFirm(w, who, c.slot, f.id);
    taken.add(fi); n++;
  }

  // From the street: two printing firms, picked by the calendar so nobody is favoured.
  const pool = due.filter((fi) => !taken.has(fi) && views.has(fi));
  for (let k = 0; k < 2 && pool.length; k++) {
    const fi = pool.splice((w.month * 3 + k * 7 + who) % pool.length, 1)[0];
    const sec = fi >= 0 ? s.firms[fi]?.sector ?? '' : 'FINANCE';
    add(w, st, seat, 'street', who, -1, fi, views.get(fi)!, 0.45, 'fair', FAIR_STREET, (l) => streetText(w, sec, nameOf(w, fi), l));
  }
}

function publishConsensus(w: World, st: SignalState): void {
  for (const fi of dueThisMonth(w)) {
    const v = quarterView(w, fi);
    if (!v) continue;
    const issuer = issuerOf(w, fi);
    const prev = st.consensus[issuer];
    st.consensus[issuer] = {
      issuer, name: nameOf(w, fi), firm: fi, day: w.day, profit: v.consensus, high: v.high, low: v.low, analysts: v.analysts,
      lagDays: (w.day % 30) + 1, tilt: prev?.tilt ?? 0, actual: null, surprise: null, event: -1,
    };
  }
}

function paperEditor(w: World): { id: string; name: string; who: number } | undefined {
  const s = econ(w), P = s.P;
  for (const f of s.firms) if (f.good === 'NEWS' && !f.closed) {
    let best = -1;
    for (const i of f.staff) if (P.alive(i) && (best < 0 || P.diligence[i] > P.diligence[best])) best = i;
    return { id: f.id, name: f.name, who: best };
  }
  return undefined;
}

/** The paper tells the move. A careful editor finds what moved it; a hurried one reaches for the loudest headline. */
function pressStory(w: World, st: SignalState, r: Report): { story: string; right: boolean; event: number } {
  const s = econ(w), P = s.P;
  const ed = paperEditor(w);
  const truth = w.events.get(r.event)?.causes ?? [];
  const ownCause = truth.find((id) => { const e = w.events.get(id); return !!e && (e.actor === r.issuer || e.kind.startsWith('firm.') || e.kind.startsWith('shock.')); });
  const loud = [s.macroEv, s.rateEv, s.wageEv].filter((id) => id >= 0 && w.events.get(id)).sort((a, b) => b - a)[0];
  const care = ed && ed.who >= 0 ? P.diligence[ed.who] / 100 : 0.5;
  const finds = ownCause !== undefined && w.rng('signals:press').next() < clamp(care * 0.65, 0.1, 0.7);
  const cited = finds ? ownCause : loud ?? ownCause ?? r.event;
  // The headline is right only if it is what moved this firm: its own cause when it has one, else a macro cause that is on the report's chain.
  const right = ownCause !== undefined ? cited === ownCause : truth.includes(cited);
  const dir = r.surprise > 0.008 ? 'beat' : r.surprise < -0.008 ? 'missed' : 'met';
  const why = w.events.get(cited)?.msg ?? 'the print';
  const story = `${ed?.name ?? 'The paper'}: ${r.name} ${dir} the street's number; the paper puts the move down to "${why}"`;
  const event = w.events.emit('signals.story', story, [r.event], ed?.id);
  st.press.stories++; if (right) st.press.right++;
  return { story, right, event };
}

function reveal(w: World, st: SignalState): void {
  for (const r of reportsAfter(w, st.seenEv)) {
    st.seenEv = Math.max(st.seenEv, r.event);
    const mine = st.items.filter((x) => x.outcome === 'open' && x.issuer === r.issuer && w.day - x.day <= 40);
    let right = 0;
    for (const sig of mine) {
      const hit = sig.lean === 0 ? Math.abs(r.surprise) < 0.03 : sig.lean > 0 ? r.surprise > 0.015 : r.surprise < -0.015;
      sig.outcome = hit ? 'right' : 'wrong'; sig.report = r.event; sig.surprise = +r.surprise.toFixed(3);
      if (hit) right++;
      for (const t of [st.tally[sig.kind], st.byLegal[sig.legal]]) { t.n++; if (hit) t.right++; else t.wrong++; }
    }
    const c = st.consensus[r.issuer];
    if (c) {
      c.actual = r.profit; c.surprise = +r.surprise.toFixed(3); c.event = r.event;
      c.tilt = +(c.tilt * 0.6 + (-r.surprise) * 0.4).toFixed(4);
    }
    let story = '', storyRight = true, storyEvent = -1;
    if (mine.length || Math.abs(r.surprise) >= 0.03) {
      const p = pressStory(w, st, r);
      story = p.story; storyRight = p.right; storyEvent = p.event;
    }
    if (mine.length) {
      w.events.emit('signals.reveal', `${r.name} printed ${money(r.profit)} against ${money(r.consensus)} expected (${(r.surprise * 100).toFixed(1)}%); ${right} of ${mine.length} signals pointed the right way`, [r.event, ...mine.map((x) => x.event).slice(0, 3)], r.issuer);
    }
    st.reveals.push({
      issuer: r.issuer, name: r.name, day: r.day, event: r.event, consensus: r.consensus, actual: r.profit, surprise: +r.surprise.toFixed(3),
      px: r.px, pxAfter: r.pxAfter, signals: mine.length, right, story, storyRight, storyEvent,
    });
    if (st.reveals.length > KEEP_REVEALS) st.reveals.shift();
  }
}

export const signals: Module = {
  id: 'signals',

  init(w) {
    const root = w.events.emit('signals.open', "private readings of the quarter, and the street's consensus beside them, open for the listed firms", [w.genesis]);
    const z = (): Tally => ({ n: 0, right: 0, wrong: 0 });
    const state: SignalState = {
      items: [], consensus: {}, reveals: [], tally: { work: z(), contact: z(), street: z() }, byLegal: { fair: z(), inside: z() },
      press: { stories: 0, right: 0 }, seenEv: -1, nextId: 0, root, yMade: 0, yInside: 0,
    };
    w.state.signals = state;
  },

  dayClose(w) {
    const st = stOf(w);
    if (!st) return;
    // The close prices come in over the days after a print.
    for (const rv of st.reveals) if (w.day - rv.day <= 5 && w.day > rv.day) {
      const row = reportsAfter(w, rv.event - 1).find((x) => x.event === rv.event);
      if (row && row.pxAfter > 0) rv.pxAfter = row.pxAfter;
    }
    if (w.day % 30 !== 22) return;
    publishConsensus(w, st);
    for (const p of players(w)) watch(w, st, p.id, p.who);
  },

  monthEnd(w) {
    const st = stOf(w);
    if (st) reveal(w, st);
  },

  stats(w) {
    const st = stOf(w);
    const pct = (t: Tally): number => (t.n ? +(t.right / t.n).toFixed(2) : 0);
    const out = {
      sigs: st.yMade, inside: st.yInside,
      sigWork: `${pct(st.tally.work)}/${st.tally.work.n}`, sigTalk: `${pct(st.tally.contact)}/${st.tally.contact.n}`, sigStreet: `${pct(st.tally.street)}/${st.tally.street.n}`,
      paperRight: st.press.stories ? +(st.press.right / st.press.stories).toFixed(2) : 0,
    };
    st.yMade = 0; st.yInside = 0;
    return out;
  },
};

/** The player's current signals, newest first, for a screen. */
export function signalsFor(w: World, seat: string, n = 20): Signal[] {
  const st = w.state.signals as SignalState | undefined;
  if (!st) return [];
  return st.items.filter((x) => x.seat === seat).slice(-n).reverse();
}
/** The street's number for a listed firm's coming quarter. */
export function consensusFor(w: World, issuer: string): Consensus | undefined {
  return (w.state.signals as SignalState | undefined)?.consensus[issuer];
}
/** Every published consensus, for a screen. */
export function consensusAll(w: World): Consensus[] {
  return Object.values((w.state.signals as SignalState | undefined)?.consensus ?? {});
}
/** Past reveals, newest first. */
export function revealsOf(w: World, n = 40): Reveal[] {
  const st = w.state.signals as SignalState | undefined;
  return st ? st.reveals.slice(-n).reverse() : [];
}
