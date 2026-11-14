// Unions, one per sector. People join from their pay, their coworkers and their traits.
// Dues and strike pay move through the ledger. A strike is a zero from the wage hook, so the
// plant makes nothing and the crew stays on the books. The settlement is a wage premium.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Module, type World } from '../../kernel/index.ts';
import { parseRaws, RawReader } from '../../kernel/content.ts';
import { SECTOR_NAMES } from '../economy/content.ts';
import { DEP, pay, payS, setWageHook, type EconState, type Firm } from '../economy/index.ts';
import { thought } from '../economy/people.ts';
import { discountForNews } from '../markets/index.ts';
import { B_FRIEND, B_LOYALTY } from '../social/index.ts';

const DEG = 16;
// A stoppage on an input (power, freight, steel) starves the plants downstream. Only a final good walks out.
const FINAL = new Set(['GROCERIES', 'GENERAL_RETAIL', 'TRANSIT', 'AIR_TRAVEL', 'HEALTHCARE', 'NEWS', 'ENTERTAINMENT']);
const CAP_PREM = 0.002;
const STRIKE_DAYS = 2;
// The wage path through year 28 is the national one. Bargaining opens on the first day of year 29.
const OPEN_DAY = 10080;
const PAY_CAP = 800;

interface Party { name: string; actor: string; regulation: number }
interface Union {
  sector: string; actor: string; leader: number;
  premium: number; until: number; ask: number;
  strikeUntil: number; lock: boolean; strikeEv: number; struck: number[];
}
interface Book {
  unions: Union[];
  member: Uint8Array;
  prem: Float64Array;
  deal: Float64Array;
  dealUntil: Float64Array;
  floor: number; ban: boolean; lawEv: number; openEv: number;
  yStrikes: number; yDays: number; yStops: number; stops: number;
}
interface Pol { gov: number; govEv: number }
interface Soc { contact: Int32Array; bond: Uint8Array }
type Round = 'hold' | 'concede' | 'strike' | 'lockout' | 'banned';

const file = fileURLToPath(new URL('../../content/politics.txt', import.meta.url));
const PARTIES: Party[] = parseRaws(readFileSync(file, 'utf8'), 'politics.txt').filter((r) => r.type === 'PARTY').map((raw) => {
  const r = new RawReader(raw);
  return { name: r.str('NAME'), actor: 'pol_' + raw.id.toLowerCase(), regulation: r.num('REGULATION') };
});

const econ = (w: World): EconState => w.state.economy as EconState;
const book = (w: World): Book => w.state.labour as Book;

function wageOf(w: World, firmIdx: number): number {
  const st = w.state.labour as Book | undefined;
  if (!st || firmIdx < 0 || firmIdx >= st.prem.length) return 1;
  return st.prem[firmIdx];
}

function uidOf(st: Book, sector: string): number {
  for (let i = 0; i < st.unions.length; i++) if (st.unions[i].sector === sector) return i + 1;
  return 0;
}

function yoy(s: EconState): number {
  const n = s.cpiHist.length;
  if (n < 13) return 0;
  const base = s.cpiHist[n - 13];
  return base > 0 ? s.cpi / base - 1 : 0;
}

function causes(w: World, s: EconState, sector: string): number[] {
  const out: number[] = [];
  const add = (id: number | undefined): void => { if (id !== undefined && id >= 0 && !out.includes(id)) out.push(id); };
  add(w.events.last('macro.jobs'));
  add(w.events.last('macro.cpi'));
  const firms = new Set<string>();
  for (const f of s.firms) if (f.sector === sector) firms.add(f.id);
  const reports = w.events.recent(['earnings.report'], 60);
  let report: number | undefined;
  for (let i = reports.length - 1; i >= 0; i--) if (reports[i].actor && firms.has(reports[i].actor)) { report = reports[i].id; break; }
  add(report ?? w.events.last('earnings.report'));
  if (!out.length) out.push(s.macroEv >= 0 ? s.macroEv : w.genesis);
  return out;
}

function grow(st: Book, s: EconState): void {
  const n = s.P.n;
  if (st.member.length < n) {
    const a = new Uint8Array(n);
    a.set(st.member);
    st.member = a;
  }
  if (st.prem.length < s.firms.length) {
    const a = new Float64Array(s.firms.length);
    const d = new Float64Array(s.firms.length);
    const u = new Float64Array(s.firms.length);
    a.set(st.prem); d.set(st.deal); u.set(st.dealUntil);
    for (let i = st.prem.length; i < a.length; i++) a[i] = 1;
    st.prem = a; st.deal = d; st.dealUntil = u;
  }
}

function shareOf(st: Book, f: Firm, uid: number): number {
  if (!f.staff.length) return 0;
  let m = 0;
  for (const i of f.staff) if (i < st.member.length && st.member[i] === uid) m++;
  return m / f.staff.length;
}

function lean(greed: number, diligence: number, share: number, infl: number, prem: number, unemp: number): number {
  return (34 - greed) / 100 + share * 0.22 + (diligence - 50) / 500
    + Math.max(0, infl - prem - 0.02) * 0.8 - Math.max(0, unemp - 0.08) * 0.5;
}

function recount(st: Book, s: EconState): void {
  const P = s.P;
  for (let i = 0; i < P.n && i < st.member.length; i++) {
    if (st.member[i] === 0) continue;
    if (!P.alive(i) || P.employer[i] < 0) st.member[i] = 0;
  }
}

function rollMembers(w: World, st: Book, s: EconState): void {
  const P = s.P;
  const infl = yoy(s), unemp = s.unemployment;
  for (const f of s.firms) {
    if (f.closed) continue;
    const uid = uidOf(st, f.sector);
    if (!uid) continue;
    const prem = st.unions[uid - 1].premium;
    const share = shareOf(st, f, uid);
    for (const i of f.staff) {
      if (i >= st.member.length || !P.alive(i)) continue;
      const sc = lean(P.greed[i], P.diligence[i], share, infl, prem, unemp);
      if (st.member[i] === uid) { if (sc < -0.02) st.member[i] = 0; }
      else if (st.member[i] !== 0) st.member[i] = 0;
      else if (sc > 0.08) st.member[i] = uid;
    }
  }
  recount(st, s);
}

function elect(w: World, st: Book, u: Union, cause: number): void {
  const s = econ(w), P = s.P, uid = uidOf(st, u.sector);
  const cur = u.leader;
  if (cur >= 0 && cur < P.n && P.alive(cur) && P.employer[cur] >= 0 && cur < st.member.length && st.member[cur] === uid) return;
  let best = -1;
  for (const f of s.firms) {
    if (f.closed || f.sector !== u.sector) continue;
    for (const i of f.staff) {
      if (i >= st.member.length || st.member[i] !== uid) continue;
      if (best < 0 || P.diligence[i] > P.diligence[best] || (P.diligence[i] === P.diligence[best] && i < best)) best = i;
    }
  }
  u.leader = best;
  if (best >= 0) w.events.emit('labour.elect', `${P.name(best)} is elected to lead the ${u.sector.toLowerCase()} union`, [cause], u.actor);
}

function anyOut(st: Book, day: number): boolean {
  for (const u of st.unions) if (u.strikeUntil > day) return true;
  return false;
}

function lostDays(st: Book, s: EconState): void {
  for (const f of s.firms) {
    if (f.closed || f.idx >= st.prem.length || st.prem[f.idx] !== 0) continue;
    st.yDays += f.staff.length;
  }
}

function finish(w: World, st: Book, s: EconState): void {
  const P = s.P;
  for (const u of st.unions) {
    if (u.strikeUntil <= 0 || w.day < u.strikeUntil) continue;
    const who = u.leader >= 0 ? P.name(u.leader) : 'the union';
    if (u.lock) {
      w.events.emit('labour.reopen', `${who} sends ${u.sector.toLowerCase()} back through the gates with the old wage`, [u.strikeEv], u.actor);
    } else {
      const room = Math.max(0, CAP_PREM - u.premium);
      const gain = Math.min(u.ask, room) * 0.55;
      u.premium += gain;
      u.until = w.day + 720;
      for (const idx of u.struck) attach(st, idx, u.premium, w.day);
      w.events.emit('labour.settle', `${who} settles ${u.sector.toLowerCase()} at ${(u.premium * 100).toFixed(2)}% over the national wage for two years`, [u.strikeEv], u.actor);
    }
    u.strikeUntil = 0; u.lock = false; u.struck = [];
  }
}

function rival(s: EconState, good: string, struck: number[]): Firm | undefined {
  let best: Firm | undefined;
  for (const f of s.firms) {
    if (f.closed || f.good !== good || struck.includes(f.idx)) continue;
    if (!best || f.staff.length > best.staff.length) best = f;
  }
  return best;
}

function pickPlant(st: Book, s: EconState, u: Union): number[] {
  const uid = uidOf(st, u.sector);
  const open = new Map<string, number>();
  for (const f of s.firms) if (!f.closed) open.set(f.good, (open.get(f.good) ?? 0) + 1);
  let best: Firm | undefined, bestKey = Number.POSITIVE_INFINITY;
  for (const f of s.firms) {
    if (f.closed || f.sector !== u.sector) continue;
    if (!FINAL.has(f.good) || (open.get(f.good) ?? 1) < 2) continue;
    if (f.staff.length < 2) continue;
    if (shareOf(st, f, uid) <= 0) continue;
    const key = (f.listed && f.staff.length <= 160 ? 0 : 1000) + f.staff.length;
    if (key < bestKey) { bestKey = key; best = f; }
  }
  return best ? [best.idx] : [];
}

function attach(st: Book, firmIdx: number, premium: number, day: number): void {
  if (premium <= 0 || firmIdx < 0 || firmIdx >= st.deal.length) return;
  st.deal[firmIdx] = 1 + premium;
  st.dealUntil[firmIdx] = day + 720;
}

function fundPay(w: World, s: EconState, u: Union, days: number, ev: number): { n: number; cents: number } {
  const st = book(w), uid = uidOf(st, u.sector);
  const each = Math.round(s.wage * 0.4 * days);
  if (each <= 0) return { n: 0, cents: 0 };
  const cash = Math.floor(w.ledger.balance(u.actor, DEP));
  const can = Math.min(PAY_CAP, Math.floor(cash / each));
  if (can <= 0) return { n: 0, cents: 0 };
  const from = w.ledger.slot(u.actor);
  let n = 0;
  for (const idx of u.struck) {
    const f = s.firms[idx];
    if (!f) continue;
    for (const i of f.staff) {
      if (n >= can) return { n, cents: n * each };
      if (i >= st.member.length || st.member[i] !== uid) continue;
      if (!payS(w, s, from, s.P.slot[i], each, 'labour.strikePay', ev)) return { n, cents: n * each };
      n++;
    }
  }
  return { n, cents: n * each };
}

function drop(v: number): number { return v > 12 ? v - 12 : 0; }

function feel(w: World, s: EconState, st: Book, u: Union, ev: number): void {
  const uid = uidOf(st, u.sector);
  const soc = w.state.social as Soc | undefined;
  let members = 0, breakers = 0;
  for (const idx of u.struck) {
    const f = s.firms[idx];
    if (!f) continue;
    const step = Math.max(1, Math.floor(f.staff.length / 24));
    for (let k = 0; k < f.staff.length && (members < 6 || breakers < 6); k += step) {
      const i = f.staff[k];
      if (i >= st.member.length) continue;
      if (st.member[i] === uid && members < 6) {
        thought(w, s, i, -36, 'standing with the union', ev);
        members++;
      } else if (st.member[i] !== uid && breakers < 6) {
        thought(w, s, i, 64, 'crossing a picket', ev);
        if (soc) resent(w, s, soc, f, i, uid, ev);
        breakers++;
      }
    }
  }
}

function resent(w: World, s: EconState, soc: Soc, f: Firm, breaker: number, uid: number, ev: number): void {
  const st = book(w);
  const step = Math.max(1, Math.floor(f.staff.length / 8));
  let hits = 0;
  for (let k = 0; k < f.staff.length && hits < 4; k += step) {
    const m = f.staff[k];
    if (m === breaker || m >= st.member.length || st.member[m] !== uid) continue;
    const base = m * DEG;
    if (base + DEG > soc.contact.length) continue;
    for (let c = 0; c < DEG; c++) {
      if (soc.contact[base + c] !== breaker) continue;
      const b = (base + c) * 4;
      if (b + B_FRIEND >= soc.bond.length) break;
      soc.bond[b + B_LOYALTY] = drop(soc.bond[b + B_LOYALTY]);
      soc.bond[b + B_FRIEND] = drop(soc.bond[b + B_FRIEND]);
      thought(w, s, m, 28, 'a strikebreaker', ev);
      hits++;
      break;
    }
  }
}

function startStop(w: World, st: Book, s: EconState, u: Union, lock: boolean, demandEv: number): void {
  const picked = pickPlant(st, s, u);
  if (!picked.length || anyOut(st, w.day)) return;
  u.struck = picked;
  u.lock = lock;
  u.strikeUntil = w.day + STRIKE_DAYS;
  const plant = s.firms[picked[0]];
  const other = rival(s, plant.good, picked);
  const who = u.leader >= 0 ? s.P.name(u.leader) : 'the union';
  const where = other ? `${other.name} picks up the orders` : 'buyers find the shelves empty';
  const kind = lock ? 'labour.lockout' : 'labour.strike';
  const verb = lock ? `locks the gates at ${plant.name}` : `calls out ${plant.name}`;
  const ev = w.events.emit(kind, `${who} ${verb}. Output stops for ${STRIKE_DAYS} days and ${where}`, [demandEv], u.actor);
  u.strikeEv = ev;
  st.yStops++;
  st.stops++;
  if (!lock) st.yStrikes++;
  const paid = fundPay(w, s, u, STRIKE_DAYS, ev);
  if (paid.n > 0) {
    w.events.emit('labour.strikePay', `${paid.n} ${u.sector.toLowerCase()} strikers draw ${(paid.cents / 100).toFixed(0)} from the fund; the rest live on savings`, [ev], u.actor);
  }
  feel(w, s, st, u, ev);
  if (w.state.markets && plant.listed) discountForNews(w, plant.id, ev);
}

function decide(st: Book, s: EconState, u: Union, ask: number, margin: number, infl: number, day: number): Round {
  const unemp = s.unemployment;
  const canWalk = !anyOut(st, day) && pickPlant(st, s, u).length > 0;
  if (!st.ban && st.stops < 3 && st.yStops < 1 && ask >= 0.001 && unemp < 0.09 && infl < 0.06 && canWalk) return 'strike';
  if (!st.ban && st.yStops < 1 && margin < -0.1 && ask >= 0.002 && unemp < 0.055 && canWalk) return 'lockout';
  if (st.ban && ask >= 0.001 && unemp < 0.062 && canWalk) return 'banned';
  if (margin >= 0 && ask >= 0.001 && u.premium < CAP_PREM) return 'concede';
  return 'hold';
}

function applyRound(w: World, st: Book, s: EconState, u: Union, round: Round, demandEv: number): void {
  const who = u.leader >= 0 ? s.P.name(u.leader) : 'the union';
  switch (round) {
    case 'hold':
      u.until = w.day + 360;
      w.events.emit('labour.hold', `${who} gets nothing from ${u.sector.toLowerCase()} and the wage stays`, [demandEv], u.actor);
      break;
    case 'concede': {
      u.premium = CAP_PREM;
      u.until = w.day + 720;
      const plant = pickPlant(st, s, u);
      if (plant.length) attach(st, plant[0], u.premium, w.day);
      w.events.emit('labour.settle', `${u.sector.toLowerCase()} concedes ${(u.premium * 100).toFixed(2)}% over the national wage without a stoppage`, [demandEv], u.actor);
      break;
    }
    case 'strike':
      startStop(w, st, s, u, false, demandEv);
      break;
    case 'lockout':
      startStop(w, st, s, u, true, demandEv);
      break;
    case 'banned':
      w.events.emit('labour.banned', `${who} wants ${u.sector.toLowerCase()} out, and the law keeps the plants open`, [demandEv, st.lawEv > 0 ? st.lawEv : w.genesis], u.actor);
      u.until = w.day + 360;
      break;
    default: {
      const never: never = round;
      throw new Error(`unhandled round ${never}`);
    }
  }
}

function bargain(w: World, st: Book, s: EconState, u: Union, si: number): void {
  if (w.day < OPEN_DAY + 40 || w.day % 360 !== 40 + si) return;
  const infl = yoy(s);
  if (w.day < u.until && infl < u.premium + 0.025) return;
  elect(w, st, u, u.strikeEv > 0 ? u.strikeEv : st.openEv);
  let profit = 0, bill = 0;
  for (const f of s.firms) {
    if (f.closed || f.sector !== u.sector) continue;
    profit += f.lastProfit;
    bill += f.eff * s.wage * 30;
  }
  const margin = bill > 0 ? profit / bill : 0;
  let ask = 0.001 + Math.max(0, infl - 0.02) * 0.08 + Math.max(0, margin) * 0.004 - Math.max(0, s.unemployment - 0.055) * 0.05;
  if (ask > 0.004) ask = 0.004;
  if (ask < 0) ask = 0;
  u.ask = ask;
  const who = u.leader >= 0 ? s.P.name(u.leader) : 'the union';
  const prices = infl >= 0 ? `prices ${(infl * 100).toFixed(1)}% higher` : `prices ${(-infl * 100).toFixed(1)}% lower`;
  const demandEv = w.events.emit('labour.demand',
    `${who} asks ${u.sector.toLowerCase()} for ${(ask * 100).toFixed(2)}%: ${prices} than a year ago, unemployment ${(s.unemployment * 100).toFixed(1)}%, profits ${(margin * 100).toFixed(0)}% of the wage bill`,
    causes(w, s, u.sector), u.actor);
  const round = decide(st, s, u, ask, margin, infl, w.day);
  applyRound(w, st, s, u, round, demandEv);
}

function dues(w: World, st: Book, s: EconState): void {
  if (w.day < OPEN_DAY || w.day % 360 !== 20) return;
  for (const u of st.unions) {
    const uid = uidOf(st, u.sector);
    let members = 0, firms = 0, cents = 0;
    const owing: { f: Firm; due: number }[] = [];
    for (const f of s.firms) {
      if (f.closed || f.sector !== u.sector) continue;
      let n = 0;
      for (const i of f.staff) if (i < st.member.length && st.member[i] === uid) n++;
      if (n <= 0) continue;
      const due = Math.max(1, Math.round(n * s.wage * 0.0002));
      const spare = Math.floor(w.ledger.balance(f.id, DEP)) - Math.round(f.eff * s.wage * 60);
      if (spare < due) continue;
      owing.push({ f, due });
      members += n; firms++; cents += due;
    }
    if (!owing.length) continue;
    const ev = w.events.emit('labour.dues', `${u.sector.toLowerCase()} collects ${(cents / 100).toFixed(0)} in dues from ${members} members at ${firms} firms`, [st.openEv], u.actor);
    for (const row of owing) pay(w, row.f.id, u.actor, row.due, 'labour.dues', ev);
  }
}

function legislate(w: World, st: Book): void {
  if (w.day % 30 !== 5) return;
  const pol = w.state.politics as Pol | undefined;
  if (!pol || pol.gov < 0 || pol.gov >= PARTIES.length) return;
  const party = PARTIES[pol.gov];
  const floor = party.regulation > 0.65 ? 1.002 : 1;
  const ban = party.regulation < 0.35;
  const prior = pol.govEv >= 0 ? pol.govEv : w.genesis;
  if (floor !== st.floor) {
    st.floor = floor;
    st.lawEv = w.events.emit('labour.minimum', `${party.name} sets a wage floor ${(floor * 100 - 100).toFixed(1)}% over the national wage`, [prior], party.actor);
  }
  if (ban !== st.ban) {
    st.ban = ban;
    st.lawEv = w.events.emit(ban ? 'labour.strikeBan' : 'labour.strikeLaw',
      ban ? `${party.name} restricts strikes` : `${party.name} lets strikes go ahead`, [prior], party.actor);
  }
}

function endorse(w: World, st: Book, s: EconState): void {
  if (w.day < OPEN_DAY || w.day % 360 !== 70) return;
  let best = PARTIES[0];
  for (const p of PARTIES) if (p.regulation > best.regulation) best = p;
  if (!w.ledger.hasActor(best.actor)) return;
  const pol = w.state.politics as Pol | undefined;
  const prior = pol && pol.govEv >= 0 ? pol.govEv : st.openEv;
  for (const u of st.unions) {
    if (!w.ledger.hasActor(u.actor)) continue;
    const cash = Math.floor(w.ledger.balance(u.actor, DEP));
    const gift = Math.floor(cash * 0.08);
    if (gift < 100) continue;
    const who = u.leader >= 0 && u.leader < s.P.n ? s.P.name(u.leader) : 'the union';
    const ev = w.events.emit('labour.endorse', `${who} endorses ${best.name} and gives ${(gift / 100).toFixed(0)}`, [prior], u.actor);
    pay(w, u.actor, best.actor, gift, 'labour.donation', ev);
  }
}

function publish(st: Book, s: EconState, day: number): void {
  const stopped = new Uint8Array(s.firms.length);
  for (const u of st.unions) {
    if (u.strikeUntil <= day) continue;
    for (const idx of u.struck) if (idx >= 0 && idx < stopped.length) stopped[idx] = 1;
  }
  for (const f of s.firms) {
    if (f.idx >= st.prem.length) continue;
    if (stopped[f.idx]) { st.prem[f.idx] = 0; continue; }
    const agreed = f.idx < st.dealUntil.length && st.dealUntil[f.idx] > day && st.deal[f.idx] > 1 ? st.deal[f.idx] : 1;
    st.prem[f.idx] = Math.max(st.floor, agreed);
  }
}

function openUnions(w: World, st: Book): void {
  if (st.openEv || w.day < OPEN_DAY) return;
  for (const u of st.unions) if (!w.ledger.hasActor(u.actor)) w.ledger.addActor(u.actor, 'union');
  let members = 0;
  for (let i = 0; i < st.member.length; i++) if (st.member[i] > 0) members++;
  st.openEv = w.events.emit('labour.open', `${st.unions.length} sector unions open with ${members} members`, [w.genesis]);
  for (const u of st.unions) elect(w, st, u, st.openEv);
}

function seedMembers(st: Book, s: EconState): void {
  const P = s.P;
  for (let i = 0; i < P.n; i++) {
    if (!P.alive(i) || P.employer[i] < 0) continue;
    if (P.greed[i] > 36) continue;
    const f = s.firms[P.employer[i]];
    if (!f || f.closed) continue;
    const uid = uidOf(st, f.sector);
    if (uid) st.member[i] = uid;
  }
}

export const labour: Module = {
  id: 'labour',
  init(w) {
    const s = econ(w);
    const present = new Set<string>();
    for (const f of s.firms) if (!f.closed) present.add(f.sector);
    const unions: Union[] = [];
    for (const sector of SECTOR_NAMES) {
      if (!present.has(sector)) continue;
      unions.push({
        sector, actor: 'union_' + sector.toLowerCase(), leader: -1, premium: 0, until: 0, ask: 0,
        strikeUntil: 0, lock: false, strikeEv: 0, struck: [],
      });
    }
    const st: Book = {
      unions, member: new Uint8Array(s.P.n), prem: new Float64Array(s.firms.length),
      deal: new Float64Array(s.firms.length), dealUntil: new Float64Array(s.firms.length),
      floor: 1, ban: false, lawEv: 0, openEv: 0, yStrikes: 0, yDays: 0, yStops: 0, stops: 0,
    };
    st.prem.fill(1);
    w.state.labour = st;
    setWageHook(wageOf);
    seedMembers(st, s);
  },
  dayClose(w) {
    const st = book(w), s = econ(w);
    if (w.day < OPEN_DAY) return;
    openUnions(w, st);
    grow(st, s);
    lostDays(st, s);
    finish(w, st, s);
    if (w.day === OPEN_DAY) { rollMembers(w, st, s); rollMembers(w, st, s); }
    if (w.day % 30 === 17 && w.day > 20) rollMembers(w, st, s);
    dues(w, st, s);
    legislate(w, st);
    endorse(w, st, s);
    for (let i = 0; i < st.unions.length; i++) bargain(w, st, s, st.unions[i], i);
    publish(st, s, w.day);
  },
  stats(w) {
    const st = book(w), s = econ(w);
    let employed = 0, members = 0, sum = 0, deals = 0;
    for (const f of s.firms) {
      if (f.closed) continue;
      const uid = uidOf(st, f.sector);
      for (const i of f.staff) {
        employed++;
        if (i < st.member.length && st.member[i] === uid && uid > 0) members++;
      }
    }
    for (const u of st.unions) if (u.premium > 0) { sum += u.premium; deals++; }
    const out = {
      union_pct: +((members / Math.max(1, employed)) * 100).toFixed(1),
      strikes: st.yStrikes,
      daysLost: st.yDays,
      settle_pct: deals ? +(sum / deals * 100).toFixed(2) : 0,
      minWage: +(s.wage * st.floor / 100).toFixed(2),
    };
    st.yStrikes = 0; st.yDays = 0; st.yStops = 0;
    return out;
  },
};
