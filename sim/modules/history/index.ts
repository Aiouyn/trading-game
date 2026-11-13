// What is worth remembering. The event log drops old events; these entries keep their own
// text and the cause chain as it read on the day they were written.
import { DAYS_PER_YEAR, type Module, type World } from '../../kernel/index.ts';
import type { Ev } from '../../kernel/events.ts';
import { GOODS } from '../economy/content.ts';
import { DEP, type EconState, type Firm } from '../economy/index.ts';
import { People } from '../economy/people.ts';

export interface Entry {
  year: number;
  day: number;
  kind: string;
  people: string[];
  firms: string[];
  text: string;
  cause: string;
}

interface Career { person: number; firmId: string; firm: string; fromYear: number; toYear: number }

export interface HistState {
  entries: Entry[];
  seen: number;
  recess: boolean;
  recessStart: number;
  infl: boolean;
  covered: number;
  wealth: Float64Array;
  careers: Career[];
  dynasty: string[];
  wedN: number;
  wedA: Int32Array;
  wedB: Int32Array;
  wedY: Int32Array;
  spouseSeen: Int32Array;
  diedYear: Int16Array;
  aliveSnap: Uint8Array;
  recessions: number;
  spikes: number;
}

const econ = (w: World): EconState => w.state.economy as EconState;
export const historyOf = (w: World): HistState => w.state.history as HistState;

const yearOf = (day: number): number => Math.floor(day / DAYS_PER_YEAR) + 1;

function money(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const a = Math.abs(Math.round(cents));
  if (a >= 1e8) return `${sign}$${(a / 1e8).toFixed(1)} million`;
  if (a >= 1e5) return `${sign}$${(a / 1e5).toFixed(1)} thousand`;
  return `${sign}$${(a / 100).toFixed(0)}`;
}

function anchor(w: World): { person: string; firm: string } {
  const s = econ(w);
  let best: Firm | undefined;
  for (const f of s.firms) if (!f.closed && (!best || f.workers > best.workers)) best = f;
  const person = best && best.ceo >= 0 ? s.P.name(best.ceo) : s.P.name(0);
  return { person, firm: best?.name ?? 'the city' };
}

function firmOf(w: World, id?: string): Firm | undefined {
  if (!id) return;
  return econ(w).firms.find((f) => f.id === id);
}

function chain(w: World, id: number): string {
  return w.events.explain(id, 8).join('\n');
}

function latest(w: World, ids: (number | undefined)[]): number {
  let best = w.genesis, day = -1;
  for (const id of ids) {
    if (id === undefined) continue;
    const e = w.events.get(id);
    if (e && e.day >= day) { best = id; day = e.day; }
  }
  return best;
}

function macroCause(w: World): number {
  const s = econ(w);
  return latest(w, [w.events.last('macro.jobs'), w.events.last('macro.cpi'), s.shockEv, s.macroEv, w.genesis]);
}

function add(w: World, kind: string, people: string[], firms: string[], text: string, causeId: number, year = yearOf(w.day)): void {
  const a = anchor(w);
  const p = people.filter(Boolean);
  const f = firms.filter(Boolean);
  if (!p.length) p.push(a.person);
  if (!f.length) f.push(a.firm);
  const sentence = /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
  historyOf(w).entries.push({ year, day: w.day, kind, people: p, firms: f, text: sentence, cause: chain(w, causeId) });
}

function slotIndex(P: People): Int32Array {
  let max = 0;
  for (let i = 0; i < P.n; i++) if (P.slot[i] > max) max = P.slot[i];
  const a = new Int32Array(max + 1);
  a.fill(-1);
  for (let i = 0; i < P.n; i++) if (P.slot[i] >= 0) a[P.slot[i]] = i;
  return a;
}

function topPerson(w: World, instr: string): number {
  if (!w.ledger.instruments.has(instr)) return -1;
  const P = econ(w).P, slotOf = slotIndex(P);
  let best = -1, amt = 0;
  for (const [slot, bal] of w.ledger.holdersS(instr)) {
    const p = slot < slotOf.length ? slotOf[slot] : -1;
    if (p >= 0 && bal > amt) { amt = bal; best = p; }
  }
  return best;
}

function wealthNow(w: World): Float64Array {
  const P = econ(w).P;
  const out = new Float64Array(P.n);
  const slotOf = slotIndex(P);
  for (let i = 0; i < P.n; i++) if (P.alive(i)) out[i] = w.ledger.balS(P.slot[i], DEP);
  const owed = (w.state.banking as { owed?: Float64Array } | undefined)?.owed;
  if (owed) for (let i = 0; i < P.n && i < owed.length; i++) out[i] -= owed[i];
  const seen = new Set<string>();
  const addInstr = (instr: string, px: number): void => {
    if (!(px > 0) || seen.has(instr) || !w.ledger.instruments.has(instr)) return;
    seen.add(instr);
    if (w.ledger.instruments.get(instr)!.kind === 'money') {
      for (let i = 0; i < P.n; i++) if (P.alive(i)) out[i] += w.ledger.balS(P.slot[i], instr) * px;
      return;
    }
    for (const [slot, bal] of w.ledger.holdersS(instr)) {
      if (!(bal > 0)) continue;
      const p = slot < slotOf.length ? slotOf[slot] : -1;
      if (p >= 0 && P.alive(p)) out[p] += bal * px;
    }
  };
  const banks = (w.state.banking as { banks?: { depo: string }[] } | undefined)?.banks ?? [];
  for (const b of banks) addInstr(b.depo, 1);
  const m = w.state.markets as { stocks?: { instr: string; last: number }[]; funds?: { id: string }[]; price?: (instr: string) => number } | undefined;
  if (m?.stocks) for (const st of m.stocks) addInstr(st.instr, st.last);
  if (m?.price) {
    for (const f of m.funds ?? []) addInstr('eq:' + f.id, m.price('eq:' + f.id));
    const funds = (w.state.bonds as { funds?: { id: string }[] } | undefined)?.funds ?? [];
    for (const f of funds) addInstr('eq:' + f.id, m.price('eq:' + f.id));
  }
  return out;
}

function growPeople(h: HistState, n: number): void {
  if (h.aliveSnap.length >= n) return;
  const a = new Uint8Array(n); a.set(h.aliveSnap); h.aliveSnap = a;
  const d = new Int16Array(n); d.set(h.diedYear); h.diedYear = d;
  const s = new Int32Array(n); s.fill(-1); s.set(h.spouseSeen); h.spouseSeen = s;
}

function pushWed(h: HistState, a: number, b: number, year: number): void {
  if (h.wedN >= h.wedA.length) {
    const n = Math.max(16, h.wedA.length * 2);
    const A = new Int32Array(n); A.set(h.wedA); h.wedA = A;
    const B = new Int32Array(n); B.set(h.wedB); h.wedB = B;
    const Y = new Int32Array(n); Y.set(h.wedY); h.wedY = Y;
  }
  const i = h.wedN++;
  h.wedA[i] = a; h.wedB[i] = b; h.wedY[i] = year;
}

function noteLife(w: World, founding: boolean): void {
  const P = econ(w).P, h = historyOf(w);
  growPeople(h, P.n);
  const year = founding ? 1 : yearOf(w.day);
  for (let i = 0; i < P.n; i++) {
    const alive = P.alive(i) ? 1 : 0;
    if (!founding && h.aliveSnap[i] && !alive && h.diedYear[i] === 0) h.diedYear[i] = year;
    h.aliveSnap[i] = alive;
    const sp = P.spouse[i];
    if (sp > i && h.spouseSeen[i] !== sp) {
      pushWed(h, i, sp, year);
      h.spouseSeen[i] = sp;
      if (sp < h.spouseSeen.length) h.spouseSeen[sp] = i;
    }
  }
}

function syncCareer(w: World, firmId: string): void {
  const s = econ(w), h = historyOf(w);
  const f = s.firms.find((x) => x.id === firmId);
  const year = yearOf(w.day);
  for (const c of h.careers) if (c.firmId === firmId && c.toYear === 0 && (!f || f.ceo !== c.person)) c.toYear = year;
  if (f && f.ceo >= 0 && !h.careers.some((c) => c.firmId === firmId && c.toYear === 0))
    h.careers.push({ person: f.ceo, firmId, firm: f.name, fromYear: year, toYear: 0 });
}

function heirsOf(msg: string): string[] {
  const m = msg.match(/passes to (.+)$/);
  if (!m) return [];
  return m[1].split(/, | and /).map((s) => s.trim()).filter(Boolean);
}

function consider(w: World, e: Ev): void {
  const s = econ(w), h = historyOf(w), P = s.P;
  if (e.kind === 'firm.founded' || e.kind === 'firm.listed' || e.kind === 'firm.failed') {
    const f = firmOf(w, e.actor);
    if (f) syncCareer(w, f.id);
    const people = f && f.ceo >= 0 ? [P.name(f.ceo)] : [];
    const kind = e.kind === 'firm.founded' ? 'founding' : e.kind === 'firm.listed' ? 'listing' : 'failure';
    add(w, kind, people, f ? [f.name] : [], e.msg, e.id);
    return;
  }
  if (e.kind === 'firm.takeover') {
    const buyer = firmOf(w, e.actor);
    if (buyer) syncCareer(w, buyer.id);
    const targetName = /takes over (.+) from /.exec(e.msg)?.[1] ?? '';
    const target = targetName ? s.firms.find((f) => f.name === targetName) : undefined;
    if (target) syncCareer(w, target.id);
    const from = / from (.+)$/.exec(e.msg)?.[1] ?? '';
    const people = [buyer && buyer.ceo >= 0 ? P.name(buyer.ceo) : '', from];
    add(w, 'takeover', people, [buyer?.name ?? '', targetName], e.msg, e.id);
    return;
  }
  if (e.kind === 'firm.succession' || e.kind === 'firm.ceoFired') {
    const f = firmOf(w, e.actor);
    if (f) syncCareer(w, f.id);
    const dynasty = e.kind === 'firm.succession' && /child of|grandchild of|spouse of/.test(e.msg);
    let text = e.msg;
    if (e.kind === 'firm.ceoFired' && f && h.dynasty.includes(f.id)) {
      text = `${e.msg}. The founding family loses the seat for good.`;
      h.dynasty = h.dynasty.filter((id) => id !== f.id);
    }
    const people: string[] = [];
    if (f && f.ceo >= 0) people.push(P.name(f.ceo));
    const prev = [...h.careers].reverse().find((c) => c.firmId === f?.id && c.toYear === yearOf(w.day));
    if (prev && prev.person !== f?.ceo) people.push(P.name(prev.person));
    add(w, dynasty ? 'dynasty' : e.kind === 'firm.ceoFired' ? 'removal' : 'succession', people, f ? [f.name] : [], text, e.id);
    return;
  }
  if (e.kind === 'firm.default') {
    const f = firmOf(w, e.actor);
    const text = f && !e.msg.includes(f.name) ? `${f.name} ${e.msg}` : e.msg;
    add(w, 'failure', f && f.ceo >= 0 ? [P.name(f.ceo)] : [], f ? [f.name] : [], text, e.id);
    return;
  }
  if (e.kind === 'person.died') {
    const i = e.actor?.startsWith('p_') ? +e.actor.slice(2) : -1;
    const wasCeo = i >= 0 && h.careers.some((c) => c.person === i);
    // Cash in the message is dollars. Ordinary investors all hold the same book of shares,
    // so a share count is not a fortune. Keep chief executives and very large cash estates.
    const cash = Number(/estate of (\d+)/.exec(e.msg)?.[1] ?? 0);
    if (!wasCeo && cash < 5_000_000) return;
    const heirs = heirsOf(e.msg);
    const people = i >= 0 ? [P.name(i), ...heirs] : heirs;
    const firms = h.careers.filter((c) => c.person === i).map((c) => c.firm);
    add(w, heirs.length ? 'inheritance' : 'death', people, firms, e.msg, e.id);
    return;
  }
  if (e.kind === 'bank.run' || e.kind === 'bank.fail') {
    const id = e.actor ?? '';
    const who = topPerson(w, 'eq:' + id);
    add(w, e.kind, who >= 0 ? [P.name(who)] : [], id ? [id] : [], e.msg, e.id);
    return;
  }
  if (e.kind.startsWith('shock.')) add(w, 'shock', [], [], e.msg[0].toUpperCase() + e.msg.slice(1) + '.', e.id);
}

function ingest(w: World): void {
  const h = historyOf(w);
  const n = w.events.count;
  for (let id = h.seen; id < n; id++) {
    const e = w.events.get(id);
    if (e) consider(w, e);
  }
  h.seen = n;
}

function macro(w: World): void {
  const s = econ(w), h = historyOf(w);
  const pct = (s.unemployment * 100).toFixed(1);
  const cause = macroCause(w);
  const jobs = w.events.last('macro.jobs') ?? cause;
  // Judged on unemployment averaged over about three months, so one bad week is not a recession.
  if (!h.recess && s.uEma > 0.12) {
    h.recess = true; h.recessions++; h.recessStart = yearOf(w.day);
    add(w, 'recession', [], [], `Unemployment reaches ${pct}% and the city falls into recession.`, jobs);
  } else if (h.recess && s.uEma < 0.08) {
    h.recess = false;
    add(w, 'recovery', [], [], `Unemployment is back to ${pct}%. The recession that began in year ${h.recessStart} is over.`, jobs);
  }
  const hist = s.cpiHist;
  if (hist.length >= 13) {
    const yoy = hist[hist.length - 1] / hist[hist.length - 13] - 1;
    const ip = (yoy * 100).toFixed(1);
    if (!h.infl && yoy >= 0.08) {
      h.infl = true; h.spikes++;
      add(w, 'inflation', [], [], `Prices are ${ip}% higher than a year ago.`, w.events.last('macro.cpi') ?? cause);
    } else if (h.infl && yoy < 0.04) {
      h.infl = false;
      add(w, 'disinflation', [], [], `Inflation has fallen to ${ip}% on the year.`, w.events.last('macro.cpi') ?? cause);
    }
  }
}

function employer(w: World, i: number): string | undefined {
  const s = econ(w);
  const e = s.P.employer[i];
  return e >= 0 ? s.firms[e]?.name : undefined;
}

function recordDecade(w: World, endYear: number): void {
  const h = historyOf(w);
  if (endYear <= h.covered) return;
  const start = h.covered + 1;
  const P = econ(w).P;
  const now = wealthNow(w);
  const prev = h.wealth;
  let gains: { i: number; d: number }[] = [];
  let losses: { i: number; d: number }[] = [];
  for (let i = 0; i < P.n; i++) {
    if (!P.alive(i)) continue;
    const d = now[i] - (i < prev.length ? prev[i] : 0);
    if (d > 0) gains.push({ i, d });
    else if (d < 0) losses.push({ i, d });
  }
  gains.sort((a, b) => b.d - a.d);
  losses.sort((a, b) => a.d - b.d);
  gains = gains.filter((g) => g.d >= 1e6).slice(0, 3);
  losses = losses.filter((g) => g.d <= -1e6).slice(0, 3);
  const who = (i: number): string => `${P.name(i)} of the ${P.families[P.family[i]]} family`;
  const span = start === endYear ? `In year ${endYear}` : `From year ${start} to year ${endYear}`;
  const join = (rows: { i: number; d: number }[], word: string): string => {
    const parts = rows.map((g) => `${who(g.i)} (${word} ${money(Math.abs(g.d))})`);
    return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  };
  if (gains.length || losses.length) {
    const bits: string[] = [];
    if (gains.length) bits.push(`the largest ${gains.length > 1 ? 'fortunes were' : 'fortune was'} made by ${join(gains, 'up')}`);
    if (losses.length) bits.push(`the heaviest ${losses.length > 1 ? 'losses were' : 'loss was'} ${join(losses, 'down')}`);
    const people = [...gains, ...losses].map((g) => P.name(g.i));
    const firms = [...gains, ...losses].map((g) => employer(w, g.i) ?? '');
    const second = bits[1] ? `. ${bits[1][0].toUpperCase()}${bits[1].slice(1)}` : '';
    add(w, 'fortune', people, firms, `${span}, ${bits[0]}${second}.`, macroCause(w), endYear);
  }
  let oldest = -1, age = -1;
  for (let i = 0; i < P.n; i++) if (P.alive(i)) { const a = P.age(w, i); if (a > age) { age = a; oldest = i; } }
  const byFam = new Map<number, number>();
  for (let i = 0; i < P.n; i++) if (P.alive(i)) byFam.set(P.family[i], (byFam.get(P.family[i]) ?? 0) + now[i]);
  let richFam = -1, richV = -Infinity;
  for (const [id, v] of byFam) if (v > richV) { richV = v; richFam = id; }
  let best: Career | undefined, bestY = -1;
  for (const c of h.careers) {
    if (c.toYear !== 0) continue;
    const len = endYear - c.fromYear + 1;
    if (len > bestY) { bestY = len; best = c; }
  }
  const bits: string[] = [];
  const people: string[] = [];
  const firms: string[] = [];
  if (oldest >= 0) { bits.push(`the oldest person is ${P.name(oldest)}, ${age}`); people.push(P.name(oldest)); }
  if (richFam >= 0) { bits.push(`the richest family is the ${P.families[richFam]} family, worth ${money(richV)}`); }
  if (best) { bits.push(`the longest-serving chief executive is ${P.name(best.person)} of ${best.firm}, in the seat for ${bestY} years`); people.push(P.name(best.person)); firms.push(best.firm); }
  if (bits.length) {
    const sentence = bits.map((b, i) => (i ? b[0].toUpperCase() + b.slice(1) : b)).join('. ');
    add(w, 'record', people, firms, `${span}, ${sentence}.`, macroCause(w), endYear);
  }
  h.wealth = now;
  h.covered = endYear;
}

function openBooks(w: World): void {
  const s = econ(w), P = s.P, h = historyOf(w);
  add(w, 'founding', [], [], `Port Avalon is founded. The books open on seed ${w.seed}.`, w.genesis, 1);
  for (const f of s.firms) {
    if (f.ceo < 0) continue;
    const good = GOODS[f.good]?.name ?? f.good;
    const ceo = P.name(f.ceo);
    const fam = P.families[P.family[f.ceo]];
    const text = f.family
      ? `${ceo} of the ${fam} family founds ${f.name}, which makes ${good}. The seat passes to the family.`
      : `${ceo} founds ${f.name}, which makes ${good}.`;
    add(w, 'founding', [ceo], [f.name], text, w.genesis, 1);
    h.careers.push({ person: f.ceo, firmId: f.id, firm: f.name, fromYear: 1, toYear: 0 });
    if (f.family) h.dynasty.push(f.id);
  }
  const banks = (w.state.banking as { banks?: { id: string }[] } | undefined)?.banks ?? [];
  for (const b of banks) {
    const who = topPerson(w, 'eq:' + b.id);
    const name = who >= 0 ? P.name(who) : anchor(w).person;
    add(w, 'founding', [name], [b.id], `${name} puts up capital for ${b.id}, and the bank opens.`, w.genesis, 1);
  }
  noteLife(w, true);
  h.wealth = wealthNow(w);
  h.seen = w.events.count;
}

export function finishHistory(w: World): void {
  if (!w.state.history) return;
  recordDecade(w, w.year);
}

export const history: Module = {
  id: 'history',
  init(w) {
    const h: HistState = {
      entries: [], seen: 0, recess: false, recessStart: 0, infl: false, covered: 0,
      wealth: new Float64Array(0), careers: [], dynasty: [],
      wedN: 0, wedA: new Int32Array(16), wedB: new Int32Array(16), wedY: new Int32Array(16),
      spouseSeen: new Int32Array(0), diedYear: new Int16Array(0), aliveSnap: new Uint8Array(0),
      recessions: 0, spikes: 0,
    };
    w.state.history = h;
    openBooks(w);
  },
  dayClose(w) {
    ingest(w);
    if (w.day > 0 && w.day % DAYS_PER_YEAR === 0) noteLife(w, false);
    if (w.day > 0 && w.day % (10 * DAYS_PER_YEAR) === 0) recordDecade(w, w.year);
  },
  monthEnd(w) {
    ingest(w);
    macro(w);
  },
  stats(w) {
    const h = historyOf(w);
    return { history: h.entries.length, recessions: h.recessions, spikes: h.spikes };
  },
};
