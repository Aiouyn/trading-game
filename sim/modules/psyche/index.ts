// Health, mood, habits and the detailed inner life of people who matter this month.
// Everyone keeps a health byte, a mood byte and the relationship bytes on the social graph.
// Memories, facet drift and the crash-generation anxiety run only for shareholders, chief
// executives, staff of firms in the news, and their families.
import { DAYS_PER_YEAR, type Module, type World } from '../../kernel/index.ts';
import { DEP, type EconState, type Firm } from '../economy/index.ts';
import { firmScaleOf, labourOf, leaveJob, retargetLabour, setEffScaled, setFirmScale, setSimDay, setThoughtHook, succession, thought } from '../economy/people.ts';
import { submitOrder } from '../markets/index.ts';

const BREAK_AT = 220;
const DEG = 16;
const KIND_WORK = 2;

interface Soc {
  contact: Int32Array;
  bond: Uint8Array; // social: respect, fear, loyalty, friendship per slot
  kind: Uint8Array;
  facts: { pub: boolean; drop: boolean; pubDay: number; firms: number[] }[];
}
interface StockPeek { instr: string; last: number; rets: number[] }

interface Psyche {
  detail: Uint8Array;
  back: number[];
  quit: number;
  withdraw: number;
  gamble: number;
  hi: number;
  lo: number;
  root: number;
  habitEv: Int32Array;
}

function econ(w: World): EconState { return w.state.economy as EconState; }
function psy(w: World): Psyche { return w.state.psyche as Psyche; }
function soc(w: World): Soc | undefined {
  const st = w.state.social as Soc | undefined;
  if (!st?.contact) return undefined;
  return st;
}

function clamp(n: number, lo: number, hi: number): number { return n < lo ? lo : n > hi ? hi : n; }

function kindCode(what: string): number {
  let h = 0;
  for (let i = 0; i < what.length; i++) h = (Math.imul(h, 33) + what.charCodeAt(i)) & 255;
  return h || 1;
}

function remember(P: EconState['P'], i: number, what: string): void {
  const kind = kindCode(what);
  let kinds = P.mem[i], counts = P.memN[i];
  for (let s = 0; s < 4; s++) {
    const k = (kinds >>> (s * 8)) & 255;
    if (k === kind) {
      const c = Math.min(255, ((counts >>> (s * 8)) & 255) + 1);
      P.memN[i] = (counts & ~(255 << (s * 8))) | (c << (s * 8));
      return;
    }
    if (k === 0) {
      P.mem[i] = (kinds | (kind << (s * 8))) >>> 0;
      P.memN[i] = (counts | (1 << (s * 8))) >>> 0;
      return;
    }
  }
  P.mem[i] = ((kinds >>> 8) | (kind << 24)) >>> 0;
  P.memN[i] = ((counts >>> 8) | (1 << 24)) >>> 0;
}

type BreakKind = 'quit' | 'withdraw' | 'gamble';

function chooseBreak(P: EconState['P'], i: number): BreakKind {
  const g = P.greed[i], d = P.diligence[i], k = P.kin[i], a = P.anxiety[i];
  if (g >= d && g >= k && g >= 45) return 'gamble';
  if (k >= 40 || d >= 50 || a >= 40) return 'withdraw';
  return 'quit';
}

function chooseHabit(P: EconState['P'], i: number): number {
  if (P.greed[i] >= 55) return 2;
  if (P.kin[i] >= 45 || P.anxiety[i] >= 40) return 1;
  return 3;
}

function habitName(h: number): string {
  if (h === 1) return 'leisure';
  if (h === 2) return 'gambling';
  if (h === 3) return 'travel';
  return 'nothing';
}

function riskiest(w: World): StockPeek | undefined {
  const stocks = (w.state.markets as { stocks?: StockPeek[] } | undefined)?.stocks;
  if (!stocks || !stocks.length) return undefined;
  let best = stocks[0], risk = -1;
  for (const st of stocks) {
    let v = 0;
    for (const x of st.rets) v += x * x;
    if (v > risk) { risk = v; best = st; }
  }
  return best;
}

function gamble(w: World, i: number, share: number, capQty: number): { name: string; filled: boolean } {
  const st = riskiest(w);
  if (!st) return { name: 'nothing listed', filled: false };
  const P = econ(w).P;
  const cash = Math.floor(w.ledger.balance(P.id(i), DEP));
  const qty = Math.min(capQty, Math.floor(cash * share / Math.max(1, st.last)));
  if (qty < 1) return { name: st.instr, filled: false };
  submitOrder(w, P.id(i), { instr: st.instr, side: 'buy', qty });
  return { name: st.instr, filled: true };
}

function onThought(w: World, s: EconState, i: number, raw: number, what: string, cause: number): void {
  const P = s.P;
  const st = psy(w);
  if (raw > 0 && i < st.detail.length && st.detail[i]) remember(P, i, what);
  if (raw <= 0 || P.stress[i] < BREAK_AT || w.day < P.fearUntil[i]) return;
  let kind = chooseBreak(P, i);
  // A withdrawal holds the seat and produces nothing. In a slump the firm can hire, so the person quits instead.
  if (kind === 'withdraw' && s.unemployment > 0.1) kind = 'quit';
  const name = P.name(i), age = P.age(w, i);
  const e = P.employer[i];
  const firm = e >= 0 ? s.firms[e].name : '';
  const thoughtEv = w.events.emit('person.thought', `${name} (${age}) cannot shake it: ${what}`, [cause], P.id(i));
  let where = firm ? ` at ${firm}` : '';
  if (kind === 'quit') {
    if (e >= 0) {
      const f = s.firms[e];
      if (f.ceo === i) succession(w, s, f, i, 'quit', thoughtEv);
      leaveJob(s, i);
    }
    where = firm ? `quits ${firm}` : 'breaks down with no job to leave';
  } else if (kind === 'withdraw') {
    if (e >= 0 && P.outUntil[i] <= w.day) {
      const before = labourOf(P, i, w.day);
      P.outUntil[i] = w.day + 60;
      retargetLabour(s, i, before, labourOf(P, i, w.day));
      st.back.push(i);
    }
    where = firm ? `stops working at ${firm} for sixty days` : 'withdraws and stops looking for work';
  } else {
    const bet = gamble(w, i, 0.12, 40);
    where = bet.filled ? `puts part of their savings into ${bet.name}` : `wants to gamble but cannot buy ${bet.name}`;
  }
  const ev = w.events.emit('person.breakdown', `${name} (${age}) ${where} after ${what}`, [thoughtEv], P.id(i));
  P.lastEv[i] = ev;
  P.fearUntil[i] = w.day + 180;
  P.stress[i] = BREAK_AT / 2;
  s.breakdowns++;
  if (kind === 'quit') st.quit++;
  else if (kind === 'withdraw') st.withdraw++;
  else st.gamble++;
  if (P.habit[i] === 0) {
    const h = chooseHabit(P, i);
    P.habit[i] = h;
    P.habitLeft[i] = 45;
    P.wdDays[i] = 0;
    const habitEv = w.events.emit('person.habit', `${name} takes up ${habitName(h)} to cope`, [ev], P.id(i));
    growHabit(st, i + 1);
    st.habitEv[i] = habitEv;
  }
}

function markOne(P: EconState['P'], detail: Uint8Array, i: number): void {
  if (i < 0 || i >= P.n || !P.alive(i) || detail[i]) return;
  detail[i] = 1;
  const sp = P.spouse[i];
  if (sp >= 0 && sp < P.n) detail[sp] = 1;
  const parent = P.parent[i];
  if (parent >= 0 && parent < P.n) detail[parent] = 1;
  for (let c = P.firstKid[i]; c >= 0; c = P.nextSib[c]) if (c < P.n) detail[c] = 1;
}

function markDetailed(w: World): void {
  const s = econ(w), P = s.P, st = psy(w);
  growDetail(st, P.n);
  st.detail.fill(0);
  for (const h of s.investors) {
    if (h.id.startsWith('p_')) markOne(P, st.detail, +h.id.slice(2));
  }
  for (const f of s.firms) if (f.ceo >= 0) markOne(P, st.detail, f.ceo);
  const facts = soc(w)?.facts;
  if (!facts) return;
  const since = w.day - 30;
  for (const fact of facts) {
    if (!fact.pub || fact.drop || fact.pubDay < since) continue;
    for (const fi of fact.firms) {
      const staff = s.firms[fi]?.staff;
      if (!staff) continue;
      for (let i = 0; i < staff.length; i++) markOne(P, st.detail, staff[i]);
    }
  }
}

function unscale(s: EconState): void {
  for (const f of s.firms) {
    const sc = firmScaleOf(f.idx);
    if (sc !== 1) f.eff /= sc;
  }
  setEffScaled(false);
}

function moraleScale(avg: number): number { return 0.96 + 0.09 * (avg / 100); }

function stageScale(w: World): void {
  const s = econ(w), st = psy(w);
  let hi = 0, lo = 100, any = false;
  for (const f of s.firms) {
    let sum = 0;
    const staff = f.staff;
    for (let i = 0; i < staff.length; i++) sum += s.P.mood[staff[i]];
    const avg = staff.length ? sum / staff.length : 67;
    setFirmScale(f.idx, moraleScale(avg));
    if (!staff.length) continue;
    any = true;
    if (avg >= hi) hi = avg;
    if (avg <= lo) lo = avg;
  }
  st.hi = any ? hi : 0;
  st.lo = any ? lo : 0;
}

function applyScale(s: EconState): void {
  for (const f of s.firms) {
    const sc = firmScaleOf(f.idx);
    if (sc !== 1) f.eff *= sc;
  }
  setEffScaled(true);
}

function cheapest(s: EconState, good: string): Firm | undefined {
  let best: Firm | undefined;
  for (const f of s.firms) if (f.good === good && (!best || f.price < best.price)) best = f;
  return best;
}

function buyOne(w: World, s: EconState, i: number, good: string, cause: number): boolean {
  const f = cheapest(s, good);
  if (!f) return false;
  const cost = Math.max(1, Math.round(f.price));
  const me = s.P.slot[i];
  if (w.ledger.balS(me, DEP) < cost * 8) return false;
  if (!w.ledger.moveS(DEP, me, f.slot, cost, 'consumption', cause)) return false;
  const gid = 'good:' + good;
  if (w.ledger.balance(f.id, gid) >= 1) w.ledger.consume(gid, f.id, 1, 'consumption', cause);
  f.mRev += cost;
  return true;
}

function setHealth(s: EconState, i: number, day: number, next: number): void {
  const P = s.P;
  const before = labourOf(P, i, day);
  P.health[i] = clamp(next, 0, 100);
  retargetLabour(s, i, before, labourOf(P, i, day));
}

function weekPerson(w: World, s: EconState, i: number): void {
  const P = s.P;
  if (!P.alive(i) || !P.adult(w, i)) return;
  const day = w.day;
  if (P.stress[i] > 140) P.stressRun[i] = Math.min(65535, P.stressRun[i] + 7);
  else P.stressRun[i] = Math.max(0, P.stressRun[i] - 7);
  let h = P.health[i];
  const age = P.age(w, i);
  if (age >= 55 && (day - P.born[i]) % DAYS_PER_YEAR < 7) h -= 1 + Math.floor((age - 55) / 20);
  if (P.stressRun[i] >= 120) { h -= 1; P.stressRun[i] = 60; }
  if (P.broke[i] === 0) P.brokeStep[i] = 0;
  else if (P.broke[i] >= 14 && P.brokeStep[i] < 1) { h -= 4; P.brokeStep[i] = 1; }
  else if (P.broke[i] >= 49 && P.brokeStep[i] < 2) {
    h -= 6;
    P.brokeStep[i] = 2;
    thought(w, s, i, 80, 'cannot afford healthcare', s.macroEv);
  } else if (P.broke[i] >= 98 && P.brokeStep[i] < 3) {
    h -= 8;
    P.brokeStep[i] = 3;
    if (P.condition[i] === 0) {
      P.condition[i] = P.stressRun[i] > 60 ? 1 : 2;
      const why = P.condition[i] === 1 ? 'a long run of stress' : 'going without healthcare';
      const cause = P.lastEv[i] >= 0 ? P.lastEv[i] : s.macroEv;
      w.events.emit('person.condition', `${P.name(i)} (${P.age(w, i)}) falls ill from ${why}`, [cause], P.id(i));
    }
  }
  // The weekly basket already includes healthcare. It pulls a sick person back toward well. Below 40 they buy more, if they can pay.
  if (P.broke[i] === 0 && h < 78) h += 1;
  if (h < 40 && P.broke[i] === 0 && buyOne(w, s, i, 'HEALTHCARE', s.macroEv)) h += 4;
  if (h >= 70 && P.condition[i]) P.condition[i] = 0;
  if (h !== P.health[i]) setHealth(s, i, day, h);
  if (P.stress[i] < 80 && P.mood[i] !== 67) P.mood[i] += P.mood[i] < 67 ? 1 : -1;
  if (P.incMark[i] > 0 && P.incEma[i] > P.incMark[i] * 1.08) thought(w, s, i, -40, 'a raise', s.wageEv);
  if (P.incEma[i] > 0) P.incMark[i] = P.incEma[i];
}

function habitTick(w: World, s: EconState, i: number): void {
  const P = s.P;
  const h = P.habit[i];
  if (!h || !P.alive(i)) return;
  const st = psy(w);
  growHabit(st, i + 1);
  const remembered = st.habitEv[i];
  const cause = remembered >= 0 ? remembered : P.lastEv[i] >= 0 ? P.lastEv[i] : st.root;
  if (P.habitLeft[i] > 0) {
    P.habitLeft[i] = Math.max(0, P.habitLeft[i] - 8);
    if (P.habitLeft[i] > 16) return;
    let took = false;
    if (h === 1) took = buyOne(w, s, i, 'ENTERTAINMENT', cause);
    else if (h === 3) took = buyOne(w, s, i, 'AIR_TRAVEL', cause);
    else took = gamble(w, i, 0.04, 8).filled;
    if (took) { P.habitLeft[i] = 45; P.wdDays[i] = 0; }
    return;
  }
  // Habits end. A year of withdrawal breaks it, and a calm person may simply stop (about one in five a year).
  if (P.wdDays[i] >= 360 || (P.stress[i] < 50 && w.rng('psyche:recover').chance(0.006))) {
    P.habit[i] = 0; P.wdDays[i] = 0; P.habitLeft[i] = 0;
    w.events.emit('person.recovered', `${P.name(i)} gives up ${habitName(h)}`, [cause], P.id(i));
    return;
  }
  P.wdDays[i] = Math.min(65535, P.wdDays[i] + 8);
  const raw = Math.round(P.wdDays[i] / 90 * 10);
  if (raw > 0) thought(w, s, i, Math.min(40, raw), 'the habit has worn off', cause);
}

function releaseWithdrawn(w: World): void {
  const s = econ(w), P = s.P, st = psy(w), keep: number[] = [];
  for (const i of st.back) {
    if (!P.alive(i) || P.employer[i] < 0 || P.outUntil[i] <= w.day) {
      if (P.alive(i) && P.employer[i] >= 0 && P.outUntil[i] > 0 && P.outUntil[i] <= w.day) {
        P.outUntil[i] = 0;
        s.firms[P.employer[i]].eff += labourOf(P, i, w.day);
      } else P.outUntil[i] = 0;
      continue;
    }
    keep.push(i);
  }
  st.back = keep;
}

function wealthYear(w: World): void {
  const s = econ(w), P = s.P, st = psy(w);
  markDetailed(w);
  const price = (w.state.markets as { price?: (instr: string) => number } | undefined)?.price ?? (() => 0);
  for (let i = 0; i < P.n; i++) {
    if (!st.detail[i] || !P.alive(i)) continue;
    const nw = w.ledger.netWorth(P.id(i), price);
    const mark = P.wealthMark[i];
    if (mark > 0 && nw < mark * 0.8 && !P.anxDone[i]) {
      P.anxiety[i] = Math.min(100, P.anxiety[i] + 30);
      P.anxDone[i] = 1;
      const mkt = w.events.last('mkt.move');
      const cause = mkt !== undefined ? mkt : s.macroEv;
      const ev = w.events.emit('person.facet', `${P.name(i)} lived through a bad year and will take less financial risk for life`, [cause], P.id(i));
      P.lastEv[i] = ev;
    } else if (mark > 0 && nw > mark * 1.1) {
      let shares = false;
      for (const id of s.shareIds) if (w.ledger.balS(P.slot[i], id) > 0) { shares = true; break; }
      if (shares) thought(w, s, i, -50, 'a good year on their shares', s.macroEv);
    }
    P.wealthMark[i] = nw;
  }
}

/** Average loyalty toward the chief, or toward coworkers when the chief is not a contact. 0-100. */
export function loyaltyOf(w: World, person: number): number {
  const st = soc(w);
  const P = econ(w).P;
  if (!st || person < 0 || person >= P.n) return 0;
  const e = P.employer[person];
  const chief = e >= 0 ? econ(w).firms[e].ceo : -1;
  const b = person * DEG;
  if (chief >= 0) {
    for (let k = 0; k < DEG; k++) if (st.contact[b + k] === chief) return st.bond[(b + k) * 4 + 2];
  }
  let sum = 0, n = 0;
  for (let k = 0; k < DEG; k++) if (st.contact[b + k] >= 0 && st.kind[b + k] === KIND_WORK) { sum += st.bond[(b + k) * 4 + 2]; n++; }
  return n ? Math.round(sum / n) : 0;
}

/** Markets read this. Anxiety after a crash cuts the share of wealth held in stocks. */
export function stockTargetOf(w: World, personId: string, base: number): number {
  const P = econ(w).P;
  if (!personId.startsWith('p_')) return base;
  const i = +personId.slice(2);
  if (!(i >= 0) || i >= P.n) return base;
  return base * (1 - 0.45 * P.anxiety[i] / 100);
}

/** Average mood of a firm's staff, 0-100. That mood scales output between 0.9 and 1.05. */
export function moraleOf(w: World, firmIndex: number): number {
  const f = econ(w).firms[firmIndex];
  if (!f || !f.staff.length) return 0;
  let sum = 0;
  for (const i of f.staff) sum += econ(w).P.mood[i];
  return sum / f.staff.length;
}

function growHabit(st: Psyche, n: number): void {
  if (st.habitEv.length >= n) return;
  let cap = Math.max(16, st.habitEv.length || 16);
  while (cap < n) cap *= 2;
  const a = new Int32Array(cap);
  a.fill(-1);
  a.set(st.habitEv);
  st.habitEv = a;
}

function growDetail(st: Psyche, n: number): void {
  if (st.detail.length >= n) return;
  let cap = Math.max(16, st.detail.length || 16);
  while (cap < n) cap *= 2;
  const d = new Uint8Array(cap);
  d.set(st.detail);
  st.detail = d;
}

export const psyche: Module = {
  id: 'psyche',

  init(w) {
    const s = econ(w);
    const habitEv = new Int32Array(Math.max(16, s.P.n));
    habitEv.fill(-1);
    const st: Psyche = { detail: new Uint8Array(Math.max(16, s.P.n)), back: [], quit: 0, withdraw: 0, gamble: 0, hi: 0, lo: 0, root: 0, habitEv };
    w.state.psyche = st;
    st.root = w.events.emit('psyche.open', 'health, mood and habits are being kept', [w.genesis]);
    setThoughtHook(onThought);
    setSimDay(0);
    for (const f of s.firms) setFirmScale(f.idx, 1);
    markDetailed(w);
  },

  tick(w, t) {
    if (t !== 0) return;
    setSimDay(w.day);
    applyScale(econ(w));
  },

  dayClose(w) {
    const s = econ(w), P = s.P, st = psy(w);
    setSimDay(w.day);
    unscale(s);
    releaseWithdrawn(w);
    growDetail(st, P.n);
    const slot = w.day % 7;
    for (let i = slot; i < P.n; i += 7) if ((P.flags[i] & 1) !== 0) weekPerson(w, s, i);
    const habitSlot = w.day % 8;
    for (let i = habitSlot; i < P.n; i += 8) if (P.habit[i]) habitTick(w, s, i);
    if (w.day > 0 && w.day % DAYS_PER_YEAR === 0) wealthYear(w);
    stageScale(w);
  },

  monthEnd(w) { markDetailed(w); },

  stats(w) {
    const s = econ(w), P = s.P, st = psy(w);
    let health = 0, mood = 0, n = 0, habits = 0;
    for (let i = 0; i < P.n; i++) {
      if ((P.flags[i] & 1) === 0) continue;
      health += P.health[i];
      mood += P.mood[i];
      n++;
      if (P.habit[i]) habits++;
    }
    const out = {
      health: n ? +(health / n).toFixed(1) : 0,
      mood: n ? +(mood / n).toFixed(1) : 0,
      quit: st.quit,
      withdraw: st.withdraw,
      gamble: st.gamble,
      habits,
      moraleHi: +st.hi.toFixed(1),
      moraleLo: +st.lo.toFixed(1),
    };
    st.quit = 0; st.withdraw = 0; st.gamble = 0;
    return out;
  },
};
