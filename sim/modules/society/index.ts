// The city's society: a monthly rich list, the people who hold the seats that matter,
// a year with a rhythm, and a reputation that decides which doors open.
// Monthly work walks the living once for net worth. A day only posts the calendar
// and catches up the player's reputation from new events.
import { DAYS_PER_YEAR, type Module, type World } from '../../kernel/index.ts';
import type { Ev } from '../../kernel/events.ts';
import { tierOf } from '../player/standing.ts';
import { DEP, GOV, pay, type EconState } from '../economy/index.ts';
import { circlePlansOn, settleSocietyAsks } from '../circle/plans.ts';
import { PRISON } from '../economy/people.ts';
import { contactsOf } from '../social/index.ts';
import { money } from '../social/words.ts';
import { calDate } from '../../kernel/calendar.ts';

const DEG = 16;
const HOME = 1;
const PERSON = 1;

interface Why { day: number; kind: string; delta: number; text: string; eventId: number }
interface RichRow { person: number; worth: number; change: number; why: string; eventId: number }
interface PowerRow { person: number; role: string; score: number; word: string; eventId: number }
interface Story { day: number; person: number; dir: string; change: number; worth: number; eventId: number; text: string }
interface Hit { bank: number; bankWhy: string; prop: number; propWhy: string; forced: number }
interface Item { kind: string; title: string; key: string; emit: boolean; cause: string; causeKey: string; meet: boolean }
interface GateCmd { kind: string; slot?: number; place?: string }
interface SocDate {
  id: number;
  day: number;
  kind: string;
  place: string;
  who: number[];
  title: string;
  invite: number;
  ask: number;
  status: string;
  cents: number;
  eventId: number;
  host: number;
}

interface Soc {
  root: number;
  rep: number;
  repEvent: number;
  repLine: string;
  repCursor: number;
  named: number;
  officeKey: string;
  playerPerson: number;
  playerShare: number;
  whys: Why[];
  base: Float64Array;
  hist: Float64Array[];
  ringAt: number;
  ringN: number;
  bar: Int16Array;
  rich: RichRow[];
  powerful: PowerRow[];
  rank: number;
  worth: number;
  nextPerson: number;
  gap: number;
  ahead: boolean;
  households: number;
  rankEvent: number;
  stories: Story[];
  yStories: number;
  printed: number;
  marker: Record<string, number>;
  dates: SocDate[];
  yDates: number;
  snubs: number;
  dateNext: number;
}

const econ = (w: World): EconState => w.state.economy as EconState;
const box = (w: World): Soc | undefined => {
  const st = w.state.society as Soc | undefined;
  return st?.base ? st : undefined;
};

function blank(n: number): Soc {
  const hist: Float64Array[] = [];
  for (let i = 0; i < 12; i++) hist.push(new Float64Array(n));
  return {
    root: 0, rep: 42, repEvent: -1, repLine: 'A new name in the city', repCursor: -1, named: 0,
    officeKey: '', playerPerson: -1, playerShare: 0, whys: [],
    base: new Float64Array(n), hist, ringAt: 0, ringN: 0, bar: new Int16Array(n),
    rich: [], powerful: [], rank: 0, worth: 0, nextPerson: -1, gap: 0, ahead: false, households: 0, rankEvent: -1,
    stories: [], yStories: 0, printed: 0, marker: {},
    dates: [], yDates: 0, snubs: 0, dateNext: 1,
  };
}

function fit(st: Soc, n: number, cap: number): void {
  if (st.base.length >= n) return;
  const size = Math.max(cap, n);
  const grow = (a: Float64Array): Float64Array => { const b = new Float64Array(size); b.set(a); return b; };
  st.base = grow(st.base);
  for (let i = 0; i < 12; i++) st.hist[i] = grow(st.hist[i]);
  const bar = new Int16Array(size);
  bar.set(st.bar);
  st.bar = bar;
}

function playerOf(w: World): number {
  const st = w.state.player as { who?: number; ids?: string[]; seat?: Record<string, { who?: number }> } | undefined;
  if (!st) return -1;
  const key = st.ids?.[0];
  const who = (key && st.seat?.[key]?.who) ?? st.who ?? -1;
  return typeof who === 'number' ? who : -1;
}

function wordOf(score: number): string {
  if (score >= 75) return 'Admired';
  if (score >= 55) return 'Known';
  if (score >= 35) return 'Slight';
  if (score >= 18) return 'Thin';
  return 'Tarnished';
}

function powerWord(score: number): string {
  if (score >= 80) return 'High';
  if (score >= 65) return 'Solid';
  if (score >= 45) return 'Known';
  return 'Thin';
}

function usable(w: World, i: number): boolean {
  const P = econ(w).P;
  return i >= 0 && i < P.n && P.alive(i) && (P.flags[i] & PRISON) === 0;
}

function closeKin(w: World, a: number, b: number): boolean {
  if (a < 0 || b < 0) return false;
  if (a === b) return true;
  const P = econ(w).P;
  if (a >= P.n || b >= P.n) return false;
  if (P.spouse[a] === b) return true;
  if (P.parent[a] === b || P.parent[b] === a) return true;
  const pa = P.parent[a], pb = P.parent[b];
  if (pa >= 0 && pb >= 0 && (pa === pb || P.spouse[pa] === pb || P.spouse[pb] === pa)) return true;
  if (pa >= 0 && P.spouse[pa] === b) return true;
  if (pb >= 0 && P.spouse[pb] === a) return true;
  const sa = P.spouse[a];
  if (sa >= 0 && P.parent[b] === sa) return true;
  const sb = P.spouse[b];
  if (sb >= 0 && P.parent[a] === sb) return true;
  return false;
}

function agoAt(st: Soc, i: number): number {
  if (i < 0) return 0;
  if (st.ringN >= 12) {
    const a = st.hist[st.ringAt];
    return i < a.length ? a[i] : 0;
  }
  return i < st.base.length ? st.base[i] : 0;
}

function prevAt(st: Soc, i: number): number {
  if (i < 0) return 0;
  if (st.ringN <= 0) return i < st.base.length ? st.base[i] : 0;
  const a = st.hist[(st.ringAt + 11) % 12];
  return i < a.length ? a[i] : 0;
}

function priceMap(w: World): Map<string, number> {
  const map = new Map<string, number>();
  const mkt = w.state.markets as { stocks?: { instr: string; last: number }[]; price?: (instr: string) => number } | undefined;
  if (mkt?.stocks) for (const s of mkt.stocks) if (s.last > 0) map.set(s.instr, s.last);
  if (mkt?.price) {
    for (const id of ['eq:fund_value', 'eq:fund_value_2', 'eq:fund_mom', 'eq:fund_mm']) {
      if (map.has(id)) continue;
      const px = mkt.price(id);
      if (px > 0) map.set(id, px);
    }
  }
  const crypto = w.state.crypto as { majors?: { id: string; last: number }[]; memes?: { id: string; pool: string; rugged: boolean }[] } | undefined;
  if (crypto?.majors) for (const m of crypto.majors) if (m.last > 0) map.set(m.id, m.last);
  if (crypto?.memes) for (const m of crypto.memes) {
    if (m.rugged || !m.pool) continue;
    const tok = w.ledger.balance(m.pool, m.id);
    if (tok > 0) map.set(m.id, w.ledger.balance(m.pool, 'dep') / tok);
  }
  return map;
}

/** Unpriced books, plus share and coin marks. One pass over people, then one pass over holders. */
function worthAll(w: World, px: Map<string, number>): Float64Array {
  const P = econ(w).P;
  const out = new Float64Array(P.n);
  const slots = w.ledger.ids.length;
  const who = new Int32Array(slots);
  who.fill(-1);
  for (let i = 0; i < P.n; i++) {
    if (!P.alive(i)) continue;
    out[i] = w.ledger.netWorthSlot(P.slot[i]);
    const s = P.slot[i];
    if (s >= 0 && s < slots) who[s] = i;
  }
  for (const [instr, p] of px) {
    if (!(p > 0) || !w.ledger.instruments.has(instr)) continue;
    const ins = w.ledger.instruments.get(instr)!;
    if (ins.kind === 'money' || ins.kind === 'claim') continue;
    let holders: ReadonlyMap<number, number>;
    try { holders = w.ledger.holdersS(instr); }
    catch { continue; }
    for (const [slot, qty] of holders) {
      if (!qty) continue;
      const i = slot >= 0 && slot < who.length ? who[slot] : -1;
      if (i >= 0) out[i] += qty * p;
    }
  }
  for (let i = 0; i < out.length; i++) {
    const v = out[i];
    out[i] = Number.isFinite(v) ? Math.round(v) : 0;
  }
  return out;
}

function firmLabel(w: World, id: string): string {
  for (const f of econ(w).firms) if (f.id === id) return f.name;
  if (id === 'bank_1') return 'the bank';
  return id;
}

function biggestShare(w: World, members: number[], px: Map<string, number>): { firmId: string; name: string; value: number } | null {
  const P = econ(w).P;
  let best = 0, firmId = '', name = '';
  for (const m of members) {
    if (m < 0 || m >= P.n) continue;
    const slot = P.slot[m];
    for (const instr of econ(w).shareIds) {
      const p = px.get(instr) ?? 0;
      if (p <= 0) continue;
      const q = w.ledger.balS(slot, instr);
      if (q <= 0) continue;
      const v = q * p;
      if (v > best) {
        best = v;
        firmId = instr.startsWith('eq:') ? instr.slice(3) : instr;
        name = firmLabel(w, firmId);
      }
    }
  }
  return best > 0 ? { firmId, name, value: best } : null;
}

function personActor(actor?: string): number {
  if (!actor || actor.length < 3 || actor.charCodeAt(0) !== 112 || actor.charCodeAt(1) !== 95) return -1;
  let n = 0;
  for (let i = 2; i < actor.length; i++) {
    const c = actor.charCodeAt(i);
    if (c < 48 || c > 57) return -1;
    n = n * 10 + (c - 48);
  }
  return n;
}

function indexCauses(w: World): { hits: Map<number, Hit>; moves: Map<string, number> } {
  const hits = new Map<number, Hit>();
  const moves = new Map<string, number>();
  const floor = w.day - 360;
  let n = 0;
  for (let id = w.events.count - 1; id >= 0 && n < 250000; id--, n++) {
    const e = w.events.get(id);
    if (!e) break;
    if (e.day < floor) break;
    if (e.kind === 'mkt.move' && e.actor && !moves.has(e.actor)) moves.set(e.actor, e.id);
    const p = personActor(e.actor);
    if (p < 0) continue;
    let bankWhy = '';
    let propWhy = '';
    let forced = false;
    if (e.kind === 'court.bankruptcy' || e.kind === 'court.sale') bankWhy = 'a bankruptcy';
    else if (e.kind === 'loan.default') bankWhy = 'a default';
    else if (e.kind === 'property.repossess') propWhy = 'a repossession';
    else if (e.kind === 'property.sale' || e.kind === 'property.let') propWhy = 'a property sale';
    else if (e.kind === 'loan.margin' || e.kind === 'loan.sell') forced = true;
    else continue;
    let h = hits.get(p);
    if (!h) { h = { bank: 0, bankWhy: '', prop: 0, propWhy: '', forced: 0 }; hits.set(p, h); }
    if (bankWhy && !h.bank) { h.bank = e.id; h.bankWhy = bankWhy; }
    if (propWhy && !h.prop) { h.prop = e.id; h.propWhy = propWhy; }
    if (forced && !h.forced) h.forced = e.id;
  }
  return { hits, moves };
}

function causeFor(w: World, st: Soc, members: number[], delta: number, worth: number, px: Map<string, number>, indexed: { hits: Map<number, Hit>; moves: Map<string, number> } | null): { why: string; eventId: number } {
  const s = econ(w);
  const root = st.root || w.genesis;
  if (!indexed) return { why: 'the opening books', eventId: root };
  const P = s.P;
  let bank = 0, bankWhy = '', prop = 0, propWhy = '', forced = 0, death = 0;
  for (const m of members) {
    const hit = indexed.hits.get(m);
    if (hit) {
      if (hit.bank && !bank) { bank = hit.bank; bankWhy = hit.bankWhy; }
      if (hit.prop && !prop) { prop = hit.prop; propWhy = hit.propWhy; }
      if (hit.forced && !forced) forced = hit.forced;
    }
    if (delta <= 0 || m < 0 || m >= P.n) continue;
    const last = P.lastEv[m];
    if (last < 0) continue;
    const ev = w.events.get(last);
    if (!ev || ev.kind !== 'person.died' || ev.actor === P.id(m)) continue;
    if (w.day - ev.day > 360 || ev.id < death) continue;
    death = ev.id;
  }
  if (delta < 0 && bank) return { why: bankWhy, eventId: bank };
  if (delta > 0 && death) return { why: 'an inheritance', eventId: death };
  const share = biggestShare(w, members, px);
  const wage = s.wage;
  const moved = Math.abs(delta);
  // A house purchase is a real event, but it is not why a fortune of shares moved.
  const shareMatters = !!share && share.value >= wage * 30 && (
    share.value >= worth * 0.45 || share.value >= moved * 0.2 || (moved >= wage * 360 * 5 && share.value >= wage * 360)
  );
  if (shareMatters) {
    const ev = indexed.moves.get(share.firmId) ?? s.macroEv ?? root;
    return { why: `${share.name} shares`, eventId: ev };
  }
  if (prop) return { why: propWhy, eventId: prop };
  if (forced) return { why: 'a forced sale', eventId: forced };
  if (share && share.value >= wage * 360) {
    const ev = indexed.moves.get(share.firmId) ?? s.macroEv ?? root;
    return { why: `${share.name} shares`, eventId: ev };
  }
  const ev = (delta >= 0 ? s.wageEv : s.macroEv) || root;
  return { why: delta >= 0 ? 'saved wages' : 'a lean year', eventId: ev };
}

function headMemo(w: World): { memo: Int32Array; head: (i: number) => number } {
  const P = econ(w).P;
  const memo = new Int32Array(P.n);
  const done = new Uint8Array(P.n);
  const head = (i: number, depth = 0): number => {
    if (i < 0 || i >= P.n || depth > 8 || !P.alive(i)) return -1;
    if (done[i]) return memo[i];
    let h = i;
    const sp = P.spouse[i];
    if (sp >= 0 && sp < i && P.alive(sp)) h = head(sp, depth + 1);
    else if (P.age(w, i) < 22) {
      const par = P.parent[i];
      if (par >= 0 && P.alive(par)) h = head(par, depth + 1);
    }
    if (h < 0) h = i;
    done[i] = 1;
    memo[i] = h;
    return h;
  };
  return { memo, head: (i: number) => head(i, 0) };
}

function occupied(w: World, kind: number, ownK: number, tenK: number, own: number, ten: number): boolean {
  if (kind !== HOME || ownK !== PERSON || tenK !== PERSON) return false;
  const P = econ(w).P;
  if (own === ten) return true;
  if (ten >= 0 && ten < P.n && P.spouse[ten] === own) return true;
  if (own >= 0 && own < P.n && P.spouse[own] === ten) return true;
  return false;
}

function raise(bar: Int16Array, i: number, v: number): void {
  if (i >= 0 && i < bar.length && bar[i] < v) bar[i] = v;
}

function powerfulOf(w: World, st: Soc, px: Map<string, number>): PowerRow[] {
  const s = econ(w);
  const P = s.P;
  const wage = s.wage;
  interface Seat { person: number; role: string; score: number; eventId: number; bar: number }
  const seats: Seat[] = [];
  const firms = s.firms.map((f) => {
    const sh = Math.floor(w.ledger.issued.get('eq:' + f.id) ?? 0);
    const p = px.get('eq:' + f.id) ?? 0;
    return { f, cap: p * sh + Math.abs(f.lastProfit) + f.workers * wage * 30 };
  });
  firms.sort((a, b) => b.cap - a.cap || a.f.idx - b.f.idx);
  let nCeo = 0;
  for (const row of firms) {
    const f = row.f;
    if (f.closed || !usable(w, f.ceo)) continue;
    const score = Math.max(60, 85 - nCeo * 3);
    seats.push({ person: f.ceo, role: `chief executive of ${f.name}`, score, eventId: f.ceoEv ?? st.root, bar: 64 });
    if (f.good === 'BANKING') seats.push({ person: f.ceo, role: `head of ${f.name}`, score: 75, eventId: f.ceoEv ?? st.root, bar: 66 });
    nCeo++;
    if (nCeo >= 8) break;
  }
  for (const f of s.firms) {
    if (f.closed || f.good !== 'BANKING' || !usable(w, f.ceo)) continue;
    if (seats.some((x) => x.person === f.ceo && x.bar >= 66)) continue;
    seats.push({ person: f.ceo, role: `head of ${f.name}`, score: 75, eventId: f.ceoEv ?? st.root, bar: 66 });
  }
  const pol = w.state.politics as { leader?: number; finance?: number; governor?: number; regulator?: number; govEv?: number } | undefined;
  if (pol) {
    const gov = pol.govEv !== undefined && pol.govEv >= 0 ? pol.govEv : st.root;
    const offices: [number, string, number][] = [
      [pol.leader ?? -1, 'leads the government', 90],
      [pol.finance ?? -1, 'holds the finance seat', 80],
      [pol.governor ?? -1, 'governor of the central bank', 78],
      [pol.regulator ?? -1, 'holds the regulator\'s seat', 70],
    ];
    for (const [person, role, score] of offices) {
      if (!usable(w, person)) continue;
      seats.push({ person, role, score, eventId: gov, bar: 72 });
    }
  }
  const prop = w.state.property as { n?: number; kind?: Uint8Array; ownK?: Uint8Array; tenK?: Uint8Array; own?: Int32Array; ten?: Int32Array; marked?: Float64Array; priceEv?: number } | undefined;
  if (prop?.kind && prop.own && prop.marked && prop.n) {
    const val = new Map<number, number>();
    const cnt = new Map<number, number>();
    for (let p = 0; p < prop.n; p++) {
      if (prop.ownK![p] !== PERSON) continue;
      const o = prop.own[p];
      if (!usable(w, o)) continue;
      if (occupied(w, prop.kind[p], prop.ownK![p], prop.tenK![p], o, prop.ten![p])) continue;
      const m = prop.marked[p];
      if (!(m > 0)) continue;
      val.set(o, (val.get(o) ?? 0) + m);
      cnt.set(o, (cnt.get(o) ?? 0) + 1);
    }
    const owners = [...val.keys()].sort((a, b) => (val.get(b)! - val.get(a)!) || a - b);
    const cause = prop.priceEv && prop.priceEv >= 0 ? prop.priceEv : st.root;
    for (let i = 0; i < owners.length && i < 5; i++) {
      const person = owners[i];
      const n = cnt.get(person) ?? 1;
      seats.push({ person, role: `landlord of ${n} ${n === 1 ? 'building' : 'buildings'}`, score: 70 - i * 4, eventId: cause, bar: 52 });
    }
  }
  const best = new Map<number, Seat>();
  for (const seat of seats) {
    raise(st.bar, seat.person, seat.bar);
    const have = best.get(seat.person);
    if (!have || seat.score > have.score) best.set(seat.person, seat);
  }
  const rows: PowerRow[] = [];
  for (const seat of best.values()) rows.push({ person: seat.person, role: seat.role, score: seat.score, word: powerWord(seat.score), eventId: seat.eventId });
  rows.sort((a, b) => b.score - a.score || a.person - b.person);
  return rows;
}

function publish(w: World, st: Soc, opening: boolean): void {
  const P = econ(w).P;
  fit(st, P.n, P.capacity);
  const px = priceMap(w);
  const personal = worthAll(w, px);
  if (opening) st.base.set(personal);
  const { memo, head } = headMemo(w);
  const hh = new Float64Array(P.n);
  for (let i = 0; i < P.n; i++) {
    if (!P.alive(i)) continue;
    const h = head(i);
    if (h >= 0) hh[h] += personal[i];
  }
  const heads: number[] = [];
  for (let i = 0; i < P.n; i++) if (P.alive(i) && memo[i] === i) heads.push(i);
  heads.sort((a, b) => (hh[a] === hh[b] ? a - b : hh[b] - hh[a]));
  const top = heads.slice(0, 50);
  const me = playerOf(w);
  const mine = me >= 0 ? head(me) : -1;
  const want = new Uint8Array(P.n);
  for (const h of top) want[h] = 1;
  if (mine >= 0) want[mine] = 1;
  const lists: number[][] = new Array(P.n);
  for (let i = 0; i < P.n; i++) if (want[i]) lists[i] = [];
  for (let i = 0; i < P.n; i++) {
    if (!P.alive(i)) continue;
    const h = memo[i];
    if (h >= 0 && want[h]) lists[h].push(i);
  }
  const indexed = opening ? null : indexCauses(w);
  st.bar.fill(0);
  for (let r = 0; r < top.length; r++) {
    const b = r < 10 ? 58 : 48;
    for (const m of lists[top[r]]) raise(st.bar, m, b);
  }
  const rich: RichRow[] = [];
  for (const h of top) {
    const members = lists[h].length ? lists[h] : [h];
    let ago = 0;
    for (const m of members) ago += agoAt(st, m);
    const worth = Math.round(hh[h]);
    const change = opening ? 0 : worth - Math.round(ago);
    const cause = causeFor(w, st, members, change, worth, px, indexed);
    rich.push({ person: h, worth, change, why: cause.why, eventId: cause.eventId });
  }
  st.rich = rich;
  st.powerful = powerfulOf(w, st, px);
  st.households = heads.length;
  let rank = 0;
  if (mine >= 0) for (let i = 0; i < heads.length; i++) if (heads[i] === mine) { rank = i + 1; break; }
  st.rank = rank;
  st.worth = mine >= 0 ? Math.round(hh[mine]) : 0;
  if (rank === 1 && heads.length > 1) {
    st.nextPerson = heads[1];
    st.gap = Math.round(hh[heads[0]] - hh[heads[1]]);
    st.ahead = true;
  } else if (rank > 1) {
    st.nextPerson = heads[rank - 2];
    st.gap = Math.round(hh[heads[rank - 2]] - hh[heads[rank - 1]]);
    st.ahead = false;
  } else {
    st.nextPerson = -1;
    st.gap = 0;
    st.ahead = rank === 1;
  }
  const notable: number[] = [];
  const seen = new Uint8Array(P.n);
  const note = (i: number): void => {
    if (i < 0 || i >= P.n || seen[i] || !P.alive(i)) return;
    seen[i] = 1;
    notable.push(i);
  };
  for (const h of top) note(h);
  for (const p of st.powerful) note(p.person);
  note(me);
  interface Move { person: number; change: number; worth: number; why: string; eventId: number }
  const moves: Move[] = [];
  if (!opening) {
    for (const i of notable) {
      const worth = personal[i];
      const change = worth - prevAt(st, i);
      if (!change) continue;
      const cause = causeFor(w, st, [i], change, worth, px, indexed);
      moves.push({ person: i, change, worth, why: cause.why, eventId: cause.eventId });
    }
  }
  if (!opening) {
    const slot = st.hist[st.ringAt];
    slot.set(personal);
    st.ringAt = (st.ringAt + 1) % 12;
    st.ringN++;
  }
  const root = st.root || w.genesis;
  const mineCause = mine >= 0 ? causeFor(w, st, lists[mine]?.length ? lists[mine] : [mine], 0, st.worth, px, indexed) : { why: 'the opening books', eventId: root };
  const rankCause = rich.find((r) => r.person === mine)?.eventId ?? mineCause.eventId ?? root;
  const nextName = st.nextPerson >= 0 && st.nextPerson < P.n ? P.name(st.nextPerson) : '';
  const who = me >= 0 && me < P.n ? me : (mine >= 0 ? mine : 0);
  const name = P.n > 0 ? P.name(Math.min(who, P.n - 1)) : 'someone';
  const gapBit = st.nextPerson < 0 ? 'with no neighbour on the list' : `${money(st.gap)} ${st.ahead ? 'ahead of' : 'behind'} ${nextName}`;
  st.rankEvent = w.events.emit('society.rank', `${name} ranks ${st.rank} of ${st.households} households, ${money(st.worth)}, ${gapBit}`, [rankCause || root], me >= 0 ? P.id(me) : undefined);

  const rises = moves.filter((m) => m.change > 0).sort((a, b) => b.change - a.change || a.person - b.person).slice(0, 3);
  const falls = moves.filter((m) => m.change < 0).sort((a, b) => a.change - b.change || a.person - b.person).slice(0, 3);
  const picked = rises.concat(falls);
  let best: Story | null = null;
  for (const m of picked) {
    const dir = m.change > 0 ? 'rise' : 'fall';
    const text = `${P.name(m.person)} ${m.change > 0 ? 'gained' : 'lost'} ${money(Math.abs(m.change))} in a month, on ${m.why}`;
    const ev = w.events.emit(m.change > 0 ? 'society.rise' : 'society.fall', text, [m.eventId || root], P.id(m.person));
    const story: Story = { day: w.day, person: m.person, dir, change: m.change, worth: m.worth, eventId: ev, text };
    st.stories.push(story);
    if (!best || Math.abs(m.change) > Math.abs(best.change) || (Math.abs(m.change) === Math.abs(best.change) && m.person < best.person)) best = story;
  }
  if (st.stories.length > 80) st.stories.splice(0, st.stories.length - 80);
  if (best) {
    const paper = paperOf(w);
    const ev = w.events.emit('society.paper', `${paper.name}: ${best.text}`, [best.eventId], paper.actor);
    st.marker.paper = ev;
    st.yStories++;
  }
}

function paperOf(w: World): { name: string; actor?: string } {
  const outlets = (w.state.media as { outlets?: { name: string; readership: number; serious: boolean; firm: number; trust: number }[] } | undefined)?.outlets;
  if (!outlets?.length) return { name: 'The Daily Herald' };
  let best = -1;
  for (let i = 0; i < outlets.length; i++) {
    if (!outlets[i].serious) continue;
    if (best < 0 || outlets[i].readership > outlets[best].readership || (outlets[i].readership === outlets[best].readership && outlets[i].trust > outlets[best].trust)) best = i;
  }
  if (best < 0) for (let i = 0; i < outlets.length; i++) if (best < 0 || outlets[i].readership > outlets[best].readership) best = i;
  const o = outlets[best];
  const firms = econ(w).firms;
  const actor = o.firm >= 0 && o.firm < firms.length ? firms[o.firm].id : undefined;
  return actor ? { name: o.name, actor } : { name: o.name };
}

/** Holidays fall on calendar dates, keyed month * 100 + day. */
const HOLIDAY: Record<number, string> = {
  101: 'New Year. The exchange is closed',
  501: 'Founding Day. The exchange is closed',
  716: 'The harbour festival. The exchange is closed',
  901: 'Harvest. The exchange is closed',
  1225: 'Christmas. The exchange is closed',
  1231: "The year's last day. The exchange is closed",
};
/** A sim day's calendar key: month * 100 + day of the month. */
const calKey = (day: number): number => { const c = calDate(day); return c.month * 100 + c.day; };

function planDay(day: number): { closed: boolean; items: Item[] } {
  const doy = ((day % 360) + 360) % 360;
  const dom = doy % 30;
  const moy = Math.floor(doy / 30);
  const absM = Math.floor(day / 30);
  const items: Item[] = [];
  const ck = calKey(day);
  const closed = HOLIDAY[ck] !== undefined;
  if (closed) items.push({ kind: 'society.holiday', title: HOLIDAY[ck], key: 'holiday:' + ck, emit: true, cause: 'root', causeKey: '', meet: false });
  if (dom === 29) items.push({ kind: 'society.meeting', title: 'The central bank meets', key: 'meeting', emit: true, cause: 'rate', causeKey: '', meet: false });
  if (moy % 3 === 0 && dom <= 6) {
    const open = dom === 0;
    items.push({ kind: 'society.earnings', title: open ? 'Earnings season opens' : 'Earnings season', key: 'earnings', emit: open, cause: 'macro', causeKey: '', meet: false });
  }
  if (ck === 415) items.push({ kind: 'society.tax', title: 'Tax returns are due', key: 'tax', emit: true, cause: 'macro', causeKey: '', meet: false });
  if (ck === 715) items.push({ kind: 'society.festival', title: 'The harbour festival opens on the quay', key: 'festival', emit: true, cause: 'root', causeKey: '', meet: false });
  if (ck === 716) items.push({ kind: 'society.meet', title: 'Notable people meet at the harbour festival', key: 'meet:festival', emit: true, cause: 'root', causeKey: 'festival', meet: true });
  if (ck === 717) items.push({ kind: 'society.festival', title: 'The last day of the harbour festival', key: 'festival', emit: false, cause: 'root', causeKey: 'festival', meet: false });
  if (ck === 1219) {
    items.push({ kind: 'society.gala', title: 'The charity gala', key: 'gala', emit: true, cause: 'root', causeKey: '', meet: false });
    items.push({ kind: 'society.meet', title: 'Notable people meet at the charity gala', key: 'meet:gala', emit: true, cause: 'root', causeKey: 'gala', meet: true });
  }
  if (absM >= 47 && absM % 48 === 47 && dom === 14) items.push({ kind: 'society.election', title: 'Election day', key: 'election', emit: true, cause: 'gov', causeKey: '', meet: false });
  if (absM % 48 === 36 && dom === 0) items.push({ kind: 'society.campaign', title: 'The campaign opens', key: 'campaign', emit: true, cause: 'gov', causeKey: '', meet: false });
  if (absM % 48 >= 36 && absM % 48 < 47 && dom === 9) items.push({ kind: 'society.campaign', title: 'A campaign rally', key: 'rally', emit: true, cause: 'gov', causeKey: '', meet: false });
  return { closed, items };
}

function causeNum(w: World, st: Soc, which: string): number {
  const s = econ(w);
  const root = st.root || w.genesis;
  if (which === 'rate') return w.events.last('cb.rate') ?? s.rateEv ?? root;
  if (which === 'gov') {
    const g = (w.state.politics as { govEv?: number } | undefined)?.govEv;
    return g !== undefined && g >= 0 ? g : root;
  }
  if (which === 'macro') return s.macroEv >= 0 ? s.macroEv : root;
  return root;
}

function guestLine(w: World, st: Soc): string {
  const P = econ(w).P;
  const names: string[] = [];
  const seen = new Set<number>();
  const add = (i: number): void => {
    if (names.length >= 10 || i < 0 || i >= P.n || !P.alive(i) || seen.has(i)) return;
    seen.add(i);
    names.push(P.name(i));
  };
  for (const row of st.powerful) add(row.person);
  for (const row of st.rich) add(row.person);
  if (!names.length) return '';
  if (names.length === 1) return names[0];
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

function postCalendar(w: World, st: Soc): void {
  const plan = planDay(w.day);
  for (const item of plan.items) {
    if (!item.emit) continue;
    const prior = item.causeKey ? (st.marker[item.causeKey] || st.root) : causeNum(w, st, item.cause);
    let title = item.title;
    if (item.meet) {
      const g = guestLine(w, st);
      if (g) title = `${item.title}: ${g}`;
    }
    const ev = w.events.emit(item.kind, title, [prior >= 0 ? prior : (st.root || w.genesis)]);
    st.marker[item.key] = ev;
  }
}

export function marketsOpen(w: World): boolean {
  return HOLIDAY[calKey(w.day)] === undefined;
}

export interface CalDay {
  day: number;
  year: number;
  month: number;
  date: number;
  closed: boolean;
  items: { kind: string; title: string; eventId: number }[];
}

function mix(a: number, b: number, c: number): number {
  let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f) ^ Math.imul(c, 0x165667b1);
  x ^= x >>> 16;
  return x >>> 0;
}
function datesOf(st: Soc): SocDate[] {
  if (!st.dates) st.dates = [];
  if (st.yDates === undefined) st.yDates = 0;
  if (st.snubs === undefined) st.snubs = 0;
  if (!st.dateNext) st.dateNext = 1;
  return st.dates;
}
function wageOf(w: World): number { return Math.max(1, Math.round(econ(w).wage)); }
function attendLine(names: string[]): string {
  if (names.length <= 1) return `${names[0] ?? 'The rich list'} attends`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} attend`;
}
function dayOk(st: Soc, day: number, today: number): boolean {
  if (day <= today) return false;
  const ck = calKey(day);
  if (HOLIDAY[ck] !== undefined || ck === 1219) return false;
  for (const d of st.dates) if (d.day === day && d.status !== 'gone') return false;
  return true;
}
function societyGuests(w: World, st: Soc, me: number): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  const add = (i: number): void => {
    if (out.length >= 6 || i < 0 || i === me || seen.has(i) || !usable(w, i)) return;
    seen.add(i);
    out.push(i);
  };
  for (const row of st.powerful) add(row.person);
  for (const row of st.rich) add(row.person);
  return out;
}
function playerInvited(w: World, st: Soc, me: number): boolean {
  if (me < 0 || st.snubs >= 3) return false;
  const P = econ(w).P;
  const kin = me < P.n ? P.kin[me] : 0;
  const onList = st.rich.some((r) => r.person === me);
  // The hill house does not send cards to newcomers: you need standing of your own (a name on the rich list, or real money) first.
  if (!onList && tierOf(w, me) < 2) return false;
  if (st.rep < 20 && kin < 45) return false;
  return st.rep >= 30 || kin >= 55 || onList;
}
function societyPay(w: World, from: number, cents: number, cause: number, spare: boolean): boolean {
  const P = econ(w).P;
  if (from < 0 || from >= P.n || !P.alive(from)) return false;
  const n = Math.round(cents);
  if (n < 1) return false;
  const id = P.id(from);
  const cash = Math.floor(w.ledger.balance(id, DEP));
  if (spare && cash < n + wageOf(w) * 15) return false;
  if (!spare && cash < n) return false;
  return pay(w, id, GOV, n, 'society.pay', cause);
}
function closeDateAsk(w: World, id: number, status: string): void {
  if (id < 0) return;
  const asks = (w.state.circle as { asks?: { id: number; status: string }[] } | undefined)?.asks;
  if (!asks) return;
  for (const a of asks) if (a.id === id && (a.status === 'pending' || a.status === 'yes' || a.status === 'no')) a.status = status;
}
function scheduleDate(w: World, st: Soc): void {
  const dates = datesOf(st);
  const me = playerOf(w);
  const guests = societyGuests(w, st, me);
  if (guests.length < 2) return;
  const host = guests[0];
  const lead = 26 + (mix(w.day, host, 4) % 9);
  let day = -1;
  for (let i = 0; i < 6; i++) {
    const d = w.day + lead + i;
    if (dayOk(st, d, w.day)) { day = d; break; }
  }
  if (day < 0) return;
  const kind = st.dateNext % 2 === 0 ? 'gala' : 'party';
  const rooms = kind === 'gala' ? ['the charity rooms', 'the quay hall', 'the assembly'] : ['the hill house', 'the society rooms', 'a house on the rich list'];
  const place = rooms[mix(w.day, host, 9) % rooms.length] ?? rooms[0];
  const P = econ(w).P;
  const names: string[] = [];
  for (const i of guests) if (i >= 0 && i < P.n) names.push(P.name(i));
  const invite = playerInvited(w, st, me) ? 1 : 0;
  const who = invite && me >= 0 ? guests.concat(me) : guests.slice();
  const title = kind === 'gala'
    ? `Charity gala at ${place}. ${attendLine(names)}.${invite ? ' You are invited.' : ''}`
    : `A society party at ${place}. ${attendLine(names)}.${invite ? ' You are invited.' : ''}`;
  const cents = invite ? (kind === 'gala' ? Math.max(100, wageOf(w) * 12) : Math.max(100, wageOf(w) * 6)) : 0;
  const cause = st.root || w.genesis;
  const ev = w.events.emit('society.plan', title, [cause], P.id(host));
  dates.push({
    id: st.dateNext++, day, kind, place, who, title, invite, ask: -1, status: 'set', cents, eventId: ev, host,
  });
  st.marker.dated = w.day;
}
function resolveDate(w: World, st: Soc, d: SocDate): void {
  const P = econ(w).P;
  const me = playerOf(w);
  const wage = wageOf(w);
  const gift = Math.max(100, wage * (d.kind === 'gala' ? 12 : 10));
  let paid = 0;
  for (const who of d.who) {
    if (paid >= 4 || who === me) continue;
    if (societyPay(w, who, gift, d.eventId >= 0 ? d.eventId : (st.root || w.genesis), true)) paid++;
  }
  let went = false;
  const cause = d.eventId >= 0 ? d.eventId : (st.root || w.genesis);
  if (d.invite && me >= 0 && d.status === 'yes') {
    if (d.cents < 1 || societyPay(w, me, d.cents, cause, false)) {
      went = true;
      st.snubs = Math.max(0, st.snubs - 1);
      bump(w, st, me, 6, 'party', 'You went to the party', cause);
    } else {
      st.snubs++;
      bump(w, st, me, -2, 'party', 'You could not pay for the party', cause);
    }
  } else if (d.invite && me >= 0) {
    st.snubs++;
    bump(w, st, me, -2, 'party', 'You stayed away from the party', cause);
  }
  const you = !d.invite ? '' : went ? 'You went.' : 'You stayed away.';
  const payNote = paid > 0 ? `${paid} from the list pay the city.` : '';
  const tail = [payNote, you].filter(Boolean).join(' ');
  const msg = tail ? `${d.title} ${tail}` : d.title;
  const actor = d.host >= 0 && d.host < P.n ? P.id(d.host) : undefined;
  const ev = w.events.emit('society.held', msg, [cause], actor);
  d.eventId = ev;
  d.status = 'held';
  if (you) d.title = `${d.title.replace(/ You are invited\.$/, '')} ${you}`;
  closeDateAsk(w, d.ask, went ? 'yes' : 'lapsed');
  st.yDates++;
}
function tendDates(w: World, st: Soc): void {
  const dates = datesOf(st);
  for (const d of dates) {
    if (d.day > w.day || d.status === 'held' || d.status === 'gone') continue;
    resolveDate(w, st, d);
  }
  if (dates.length > 24) st.dates = dates.filter((d) => d.day >= w.day - 2);
  if (w.day % 30 !== 4) return;
  if (datesOf(st).some((d) => d.status !== 'gone' && d.day >= w.day && d.day < w.day + 30)) return;
  scheduleDate(w, st);
  settleSocietyAsks(w);
}
function datedItems(w: World, st: Soc | undefined, day: number): { kind: string; title: string; eventId: number }[] {
  const out: { kind: string; title: string; eventId: number }[] = [];
  if (st?.dates) {
    for (const d of st.dates) {
      if (d.day !== day || d.status === 'gone') continue;
      out.push({ kind: d.kind === 'gala' ? 'society.gala' : 'society.party', title: d.title, eventId: d.eventId >= 0 ? d.eventId : w.genesis });
    }
  }
  for (const item of circlePlansOn(w, day)) out.push(item);
  return out;
}

export function calendarOf(w: World): CalDay[] {
  const st = box(w);
  const out: CalDay[] = [];
  for (let i = 0; i < 60; i++) {
    const day = w.day + i;
    const plan = planDay(day);
    const cal = calDate(day);
    const items = plan.items.map((item) => ({
      kind: item.kind,
      title: item.title,
      eventId: st ? (st.marker[item.key] || (item.causeKey ? st.marker[item.causeKey] : 0) || causeNum(w, st, item.cause)) : w.genesis,
    }));
    for (const extra of datedItems(w, st, day)) items.push(extra);
    out.push({
      day,
      year: cal.year,
      month: cal.month,
      date: cal.day,
      closed: plan.closed,
      items,
    });
  }
  return out;
}

export function societyView(w: World): Record<string, unknown> {
  const st = box(w);
  const open = marketsOpen(w);
  if (!st) return { rich: [], rank: null, powerful: [], standing: null, stories: [], marketsOpen: open };
  const P = econ(w).P;
  const name = (i: number): string => (i >= 0 && i < P.n ? P.name(i) : '');
  const me = playerOf(w);
  return {
    rich: st.rich.map((r, i) => ({ rank: i + 1, person: r.person, name: name(r.person), worth: r.worth, change: r.change, why: r.why, eventId: r.eventId })),
    rank: {
      person: me, name: name(me), worth: st.worth, nextPerson: st.nextPerson, next: name(st.nextPerson),
      gap: st.gap, ahead: st.ahead, rank: st.rank, households: st.households, eventId: st.rankEvent,
    },
    powerful: st.powerful.map((r) => ({ person: r.person, name: name(r.person), role: r.role, standing: r.score, word: r.word, eventId: r.eventId })),
    standing: { score: st.rep, word: wordOf(st.rep), line: st.repLine, whys: st.whys, eventId: st.repEvent },
    stories: st.stories.map((s) => ({ day: s.day, person: s.person, name: name(s.person), dir: s.dir, change: s.change, worth: s.worth, text: s.text, eventId: s.eventId })),
    marketsOpen: open,
  };
}

function ensureNamed(w: World, st: Soc): void {
  if (st.named) return;
  const who = playerOf(w);
  if (who < 0) return;
  const P = econ(w).P;
  const cause = w.events.last('player.arrive') ?? w.genesis;
  const ev = w.events.emit('society.standing', `${P.name(who)} is ${wordOf(st.rep)}: ${st.repLine}`, [cause], P.id(who));
  st.repEvent = ev;
  st.whys.push({ day: w.day, kind: 'start', delta: 0, text: st.repLine, eventId: ev });
  st.named = 1;
}

function repHit(e: Ev): { delta: number; kind: string; text: string } | null {
  switch (e.kind) {
    case 'player.donate': return { delta: 8, kind: 'charity', text: 'A gift to the city' };
    case 'law.charge': return { delta: -16, kind: 'court', text: 'A charge in court' };
    case 'law.trial': return { delta: -8, kind: 'court', text: 'A trial' };
    case 'law.verdict': return { delta: -22, kind: 'court', text: 'A conviction' };
    case 'law.judgment':
      if (/convicted/i.test(e.msg)) return { delta: -18, kind: 'court', text: 'A conviction' };
      if (/acquitted/i.test(e.msg)) return { delta: 6, kind: 'court', text: 'An acquittal' };
      return null;
    case 'court.bankruptcy': return { delta: -30, kind: 'bankruptcy', text: 'A bankruptcy' };
    case 'crime.arrest': return { delta: -14, kind: 'scandal', text: 'An arrest' };
    case 'crime.exposed': return { delta: -16, kind: 'scandal', text: 'A scandal' };
    case 'crime.embezzle': return { delta: -18, kind: 'scandal', text: 'An embezzlement' };
    case 'politics.bribe': return { delta: -12, kind: 'scandal', text: 'A bribe' };
    default: return null;
  }
}

function bump(w: World, st: Soc, who: number, delta: number, kind: string, text: string, cause: number): void {
  if (delta > 0 && st.rep >= 100) return;
  if (delta < 0 && st.rep <= 0) return;
  const next = Math.max(0, Math.min(100, st.rep + delta));
  if (next === st.rep) return;
  st.rep = next;
  st.repLine = text;
  const P = econ(w).P;
  const ev = w.events.emit('society.standing', `${P.name(who)} is ${wordOf(next)}: ${text}`, [cause >= 0 ? cause : (st.root || w.genesis)], P.id(who));
  st.repEvent = ev;
  st.whys.push({ day: w.day, kind, delta, text, eventId: ev });
  if (st.whys.length > 16) st.whys.splice(0, st.whys.length - 16);
}

function refreshRep(w: World, st: Soc): void {
  ensureNamed(w, st);
  const who = playerOf(w);
  const pid = who >= 0 ? econ(w).P.id(who) : '';
  const last = w.events.count - 1;
  if (last <= st.repCursor) return;
  const end = Math.min(last, st.repCursor + 40000);
  const batch: Ev[] = [];
  for (let id = st.repCursor + 1; id <= end; id++) {
    const e = w.events.get(id);
    if (!e || !pid || e.actor !== pid) continue;
    batch.push(e);
  }
  st.repCursor = end;
  if (who < 0) return;
  for (const e of batch) {
    const hit = repHit(e);
    if (!hit) continue;
    bump(w, st, who, hit.delta, hit.kind, hit.text, e.id);
  }
}

function officeBump(w: World, st: Soc): void {
  const who = playerOf(w);
  if (who < 0) return;
  const pol = w.state.politics as { leader?: number; finance?: number; governor?: number; regulator?: number; govEv?: number } | undefined;
  if (!pol) { st.officeKey = ''; return; }
  const seats: [string, string, number][] = [
    ['leader', 'The lead of the government', pol.leader ?? -1],
    ['finance', 'The finance seat', pol.finance ?? -1],
    ['governor', 'The central bank', pol.governor ?? -1],
    ['regulator', 'The regulator', pol.regulator ?? -1],
  ];
  const prev = st.officeKey ? st.officeKey.split(',') : [];
  const held: string[] = [];
  const cause = pol.govEv !== undefined && pol.govEv >= 0 ? pol.govEv : st.root;
  for (const [key, text, seat] of seats) {
    if (seat !== who) continue;
    held.push(key);
    if (!prev.includes(key)) bump(w, st, who, 14, 'office', text, cause);
  }
  st.officeKey = held.join(',');
}

function shareValue(w: World, who: number, px: Map<string, number>): number {
  if (who < 0) return 0;
  const P = econ(w).P;
  if (who >= P.n) return 0;
  const slot = P.slot[who];
  let n = 0;
  for (const instr of econ(w).shareIds) {
    const p = px.get(instr) ?? 0;
    if (p <= 0) continue;
    const q = w.ledger.balS(slot, instr);
    if (q) n += q * p;
  }
  return Math.round(n);
}

function latestMove(w: World, firmId: string): number | undefined {
  const floor = w.day - 40;
  let n = 0;
  for (let id = w.events.count - 1; id >= 0 && n < 8000; id--, n++) {
    const e = w.events.get(id);
    if (!e) break;
    if (e.day < floor) break;
    if (e.kind === 'mkt.move' && e.actor === firmId) return e.id;
  }
  return w.events.last('mkt.move');
}

function tradeBump(w: World, st: Soc): void {
  const who = playerOf(w);
  const px = priceMap(w);
  const now = shareValue(w, who, px);
  if (who < 0 || who !== st.playerPerson) {
    st.playerPerson = who;
    st.playerShare = now;
    return;
  }
  const jump = now - st.playerShare;
  if (jump > econ(w).wage * 360 * 3) {
    const big = biggestShare(w, [who], px);
    const cause = big ? (latestMove(w, big.firmId) ?? econ(w).macroEv ?? st.root) : (econ(w).macroEv ?? st.root);
    bump(w, st, who, 10, 'trade', 'A famous trade', cause);
  }
  st.playerShare = now;
}

function dollars(cents: number): string {
  const neg = cents < 0;
  const whole = Math.floor(Math.abs(Math.round(cents)) / 100);
  const s = String(whole);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s[i];
  }
  return (neg ? '-$' : '$') + out;
}

function signed(cents: number): string {
  if (cents < 0) return '-' + dollars(-cents);
  return '+' + dollars(cents);
}

function pickFive(stories: Story[]): Story[] {
  const rises = stories.filter((s) => s.dir === 'rise').sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || a.person - b.person);
  const falls = stories.filter((s) => s.dir === 'fall').sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || a.person - b.person);
  const riseFirst = Math.abs(rises[0]?.change ?? 0) >= Math.abs(falls[0]?.change ?? 0);
  const out: Story[] = [];
  let i = 0, j = 0;
  while (out.length < 5 && (i < rises.length || j < falls.length)) {
    if (riseFirst) {
      if (i < rises.length) out.push(rises[i++]);
      if (out.length < 5 && j < falls.length) out.push(falls[j++]);
    } else {
      if (j < falls.length) out.push(falls[j++]);
      if (out.length < 5 && i < rises.length) out.push(rises[i++]);
    }
  }
  return out;
}

function report(w: World, st: Soc): void {
  if (w.year !== 5 || st.printed === 5) return;
  st.printed = 5;
  const P = econ(w).P;
  const lines: string[] = ['--- society year 5 ---', 'Rich list'];
  const n = Math.min(10, st.rich.length);
  for (let i = 0; i < n; i++) {
    const r = st.rich[i];
    const name = r.person >= 0 && r.person < P.n ? P.name(r.person) : 'someone';
    lines.push(`${i + 1}. ${name} ${dollars(r.worth)} ${signed(r.change)} since last year (${r.why})`);
  }
  const me = playerOf(w);
  const myName = me >= 0 && me < P.n ? P.name(me) : 'the player';
  const next = st.nextPerson >= 0 && st.nextPerson < P.n ? P.name(st.nextPerson) : 'nobody';
  if (st.rank > 0) {
    const dir = st.ahead ? 'ahead of' : 'behind';
    lines.push(`Player ${myName} rank ${st.rank} of ${st.households}, worth ${dollars(st.worth)}, ${dollars(st.gap)} ${dir} ${next}`);
  } else lines.push(`Player ${myName} has no household rank`);
  lines.push('Stories');
  for (const s of pickFive(st.stories)) lines.push(s.text);
  lines.push('Calendar');
  for (const d of calendarOf(w)) {
    const titles = d.items.length ? d.items.map((item) => item.title).join(' | ') : '—';
    lines.push(`${d.day} Y${d.year} M${d.month} D${d.date}${d.closed ? ' CLOSED' : ''} ${titles}`);
  }
  lines.push('--- society year 5 end ---');
  console.log(lines.join('\n'));
}

function whoAt(w: World, me: number, slot: number): number {
  if (slot < DEG) {
    for (const c of contactsOf(w, me)) if (c.slot === slot) return c.who;
    return -1;
  }
  const extras = (w.state.circle as { extras?: { slot: number; who: number }[] } | undefined)?.extras;
  if (!extras) return -1;
  for (const e of extras) if (e.slot === slot) return e.who;
  return -1;
}

function hostOf(w: World, me: number, slot: number): number {
  if (slot >= 0) return whoAt(w, me, slot);
  const bonds = (w.state.circle as { bonds?: { who: number; role: string }[] } | undefined)?.bonds ?? [];
  const friend = bonds.find((b) => b.role === 'friend' && usable(w, b.who)) ?? bonds.find((b) => usable(w, b.who));
  return friend ? friend.who : -1;
}

function knows(w: World, me: number, who: number): boolean {
  for (const c of contactsOf(w, me)) if (c.who === who) return true;
  const circle = w.state.circle as { bonds?: { who: number }[]; extras?: { who: number }[] } | undefined;
  if (circle?.bonds?.some((b) => b.who === who)) return true;
  if (circle?.extras?.some((e) => e.who === who)) return true;
  return false;
}

function refused(st: Soc, why: string): { status: 'rejected'; why: string; eventId: number } {
  return { status: 'rejected', why, eventId: st.repEvent >= 0 ? st.repEvent : st.root };
}

/** The one call circle makes. Null means the circle goes on and takes the money itself. */
export function societyGate(w: World, person: number, cmd: GateCmd): { status: 'rejected'; why: string; eventId: number } | null {
  const st = box(w);
  if (!st) return null;
  refreshRep(w, st);
  if (cmd.kind !== 'invite' && cmd.kind !== 'introduce') return null;
  const ck = calKey(w.day);
  if (cmd.kind === 'invite') {
    if (ck >= 625 && ck <= 717) cmd.place = 'festival';
    else if (ck >= 1128 && ck <= 1219) cmd.place = 'gala';
  }
  const host = hostOf(w, person, cmd.slot ?? -1);
  if (!usable(w, host)) return null;
  const P = econ(w).P;
  const hostName = P.name(host);
  const kin = closeKin(w, person, host);
  const need = host >= 0 && host < st.bar.length ? st.bar[host] : 0;
  if (!kin && (st.rep < 18 || st.rep < need)) {
    const why = st.rep < 18 ? `${hostName} will not come. ${st.repLine}` : `${hostName} will not sit with you. ${st.repLine}`;
    return refused(st, why);
  }
  if (cmd.kind !== 'introduce') return null;
  let other = -1, trust = -1;
  for (const c of contactsOf(w, host)) {
    if (c.who === person || c.who === host || !usable(w, c.who)) continue;
    if (P.age(w, c.who) < 18 || knows(w, person, c.who)) continue;
    if (c.trust > trust || (c.trust === trust && (other < 0 || c.who < other))) { trust = c.trust; other = c.who; }
  }
  if (other < 0) return null;
  const bar = other < st.bar.length ? st.bar[other] : 0;
  if (st.rep < 18 || st.rep < bar) {
    return refused(st, `${hostName} will not make the introduction. ${P.name(other)} expects a better name: ${st.repLine}`);
  }
  return null;
}

export const society: Module = {
  id: 'society',

  init(w) {
    const P = econ(w).P;
    const st = blank(Math.max(16, P.capacity));
    w.state.society = st;
    st.root = w.events.emit('society.open', 'the city keeps a rich list, a calendar and a name for everyone who matters', [w.genesis]);
    publish(w, st, true);
    ensureNamed(w, st);
    st.repCursor = w.events.count - 1;
    st.playerPerson = playerOf(w);
    st.playerShare = shareValue(w, st.playerPerson, priceMap(w));
  },

  dayClose(w) {
    const st = box(w);
    if (!st) return;
    postCalendar(w, st);
    refreshRep(w, st);
    tendDates(w, st);
  },

  monthEnd(w) {
    const st = box(w);
    if (!st) return;
    refreshRep(w, st);
    publish(w, st, false);
    officeBump(w, st);
    tradeBump(w, st);
  },

  stats(w) {
    const st = box(w);
    if (!st) return {};
    report(w, st);
    const paper = st.yStories;
    const parties = st.yDates ?? 0;
    st.yStories = 0;
    st.yDates = 0;
    const top = st.rich[0]?.worth ?? 0;
    return {
      socRich: Math.round(top / 100),
      socRank: st.rank,
      socGap: Math.round(st.gap / 100),
      socRep: st.rep,
      socPaper: paper,
      socParty: parties,
    };
  },
};
