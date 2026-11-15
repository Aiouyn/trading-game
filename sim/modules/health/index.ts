// Health, care and epidemics. Health moves with age, income, the danger of the job, habits and
// stress, and the condition of the home. Hospitals are firms; a bill is paid by an insurer, the
// person, or the government, and what is left is a claim the person owes the hospital. A disease
// arrives through the harbour and spreads along coworkers and the people someone knows. The yearly
// death roll uses health and income, so the rich and the poor do not live the same number of years.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Module, type Rng, type World } from '../../kernel/index.ts';
import { parseRaws, RawReader } from '../../kernel/content.ts';
import { DEP, type EconState, type Firm, payS } from '../economy/index.ts';
import { type People, diePerson, labourOf, retargetLabour, setDeathChance, setSimDay } from '../economy/people.ts';
import { PLAYER } from '../player/index.ts';

const CASE_CAP = 4096, AWAY_CAP = 2048, DUE_CAP = 4096, DEG = 16;

interface Disease {
  id: string; name: string; chance: number; spread: number; days: number;
  sick: number; harm: number; kill: number; port: boolean;
}

interface Book {
  openEv: number; medInc: number;
  hosp: Int32Array; hospN: number;
  epi: number; epiEv: number; epiUntil: number; portUntil: number; quar: number;
  cases: Int32Array; caseUntil: Int32Array; nCase: number;
  away: Int32Array; nAway: number;
  dueWho: Int32Array; dueAmt: Int32Array; dueHosp: Int16Array; dueTold: Uint8Array; dueN: number;
  ySick: number; yHosp: number; yCases: number; yDead: number; yTold: number;
}

const file = fileURLToPath(new URL('../../content/health.txt', import.meta.url));
const raws = parseRaws(readFileSync(file, 'utf8'), 'health.txt');

function loadDiseases(): Disease[] {
  return raws.filter((r) => r.type === 'DISEASE').map((raw) => {
    const r = new RawReader(raw);
    return {
      id: raw.id, name: r.str('NAME'), chance: r.num('CHANCE'), spread: r.num('SPREAD'),
      days: r.num('DAYS'), sick: r.num('SICK'), harm: r.num('HARM'), kill: r.num('KILL'), port: r.has('PORT'),
    };
  });
}

const DISEASES = loadDiseases();
const DANGER: Record<string, number> = {};
for (const raw of raws.filter((r) => r.type === 'DANGER')) {
  const pairs = new RawReader(raw).pairs('SECTOR');
  for (const k of Object.keys(pairs)) DANGER[k] = pairs[k];
}

function econ(w: World): EconState { return w.state.economy as EconState; }
function book(w: World): Book { return w.state.health as Book; }

function factors(health: number, inc: number, age: number, med: number): { hF: number; wF: number } {
  const hF = Math.min(1.22, Math.max(0.82, Math.exp((84 - health) / 36)));
  const wF = age < 18 || inc <= 0 || med <= 0 ? 1 : Math.min(1.12, Math.max(0.9, Math.pow(med / Math.max(inc, med * 0.35), 0.22)));
  return { hF, wF };
}

function deathChance(w: World, i: number, age: number): number {
  const s = econ(w), P = s.P;
  const base = Math.min(0.9, 0.0004 * Math.exp(Math.max(0, age - 30) / 9.5));
  const st = w.state.health as Book | undefined;
  if (!st) return Math.min(0.9, base + (P.health[i] < 30 ? 0.02 : 0));
  const extra = P.health[i] < 30 ? 0.02 : 0;
  return Math.min(0.9, (base + extra) * bendOf(P.health[i], P.incEma[i], age, st.medInc));
}

function bendOf(health: number, inc: number, age: number, med: number): number {
  const f = factors(health, inc, age, med);
  return 1 + 0.35 * (f.hF * f.wF - 1);
}

function expectYears(health: number, inc: number, med: number): number {
  let S = 1, e = 0;
  for (let a = 0; a < 105; a++) {
    e += S;
    const base = Math.min(0.9, 0.0004 * Math.exp(Math.max(0, a - 30) / 9.5));
    const extra = health < 30 ? 0.02 : 0;
    S *= 1 - Math.min(0.9, (base + extra) * bendOf(health, inc, a, med));
  }
  return e;
}

function dangerOf(s: EconState, i: number): number {
  const e = s.P.employer[i];
  if (e < 0) return 0;
  const f = s.firms[e];
  return f && !f.closed ? DANGER[f.sector] ?? 0 : 0;
}

function houseCond(w: World, i: number): number {
  const p = w.state.property as { live?: Int32Array; cond?: Uint8Array } | undefined;
  if (!p?.live || !p.cond || i >= p.live.length) return -1;
  const k = p.live[i];
  if (k < 0 || k >= p.cond.length) return -1;
  return p.cond[k];
}

function insurer(w: World, s: EconState, i: number): Firm | undefined {
  const ids = (w.state.insurance as { insId?: string[] } | undefined)?.insId;
  if (!ids || !ids.length) return undefined;
  const id = ids[i % ids.length];
  for (const f of s.firms) if (f.id === id && !f.closed) return f;
  return undefined;
}

function publicShare(s: EconState): number {
  const b = s.benefitRate ?? 0.4;
  const h = s.spendPri?.HEALTHCARE ?? 1;
  return Math.max(0.2, Math.min(0.7, 0.15 + b * 0.55 + (h - 1) * 0.35));
}

function causeOf(st: Book, w: World): number {
  return st.epi >= 0 && st.epiEv ? st.epiEv : st.openEv || w.genesis;
}

function writeHealth(s: EconState, i: number, day: number, next: number): void {
  const P = s.P;
  const n = Math.max(1, Math.min(100, next | 0));
  if (P.health[i] === n) return;
  const out = P.outUntil[i] > day;
  const before = out ? 0 : labourOf(P, i, day);
  P.health[i] = n;
  if (!out) retargetLabour(s, i, before, labourOf(P, i, day));
}

function psycheOwns(w: World, i: number): boolean {
  const back = (w.state.psyche as { back?: number[] } | undefined)?.back;
  if (!back) return false;
  for (let k = 0; k < back.length; k++) if (back[k] === i) return true;
  return false;
}

function onAway(st: Book, i: number): boolean {
  for (let k = 0; k < st.nAway; k++) if (st.away[k] === i) return true;
  return false;
}

function grantLeave(w: World, i: number, days: number): void {
  if (days <= 0) return;
  const s = econ(w), P = s.P, st = book(w), day = w.day;
  if (P.employer[i] < 0 || psycheOwns(w, i)) return;
  const until = day + days + 1;
  if (P.outUntil[i] > day) {
    if (!onAway(st, i)) return;
    if (until > P.outUntil[i]) { st.ySick += until - P.outUntil[i]; P.outUntil[i] = until; }
    return;
  }
  if (st.nAway >= AWAY_CAP) return;
  const before = labourOf(P, i, day);
  P.outUntil[i] = until;
  retargetLabour(s, i, before, 0);
  st.away[st.nAway++] = i;
  st.ySick += days;
}

function restore(w: World): void {
  const s = econ(w), P = s.P, st = book(w), day = w.day;
  let wri = 0;
  for (let k = 0; k < st.nAway; k++) {
    const i = st.away[k];
    if (!P.alive(i)) continue;
    if (P.outUntil[i] > day + 1) { st.away[wri++] = i; continue; }
    if (P.outUntil[i] > day && !psycheOwns(w, i)) {
      P.outUntil[i] = 0;
      retargetLabour(s, i, 0, labourOf(P, i, day));
    }
  }
  st.nAway = wri;
}

function owe(w: World, i: number, hosp: Firm, left: number, cause: number): void {
  left = Math.round(left);
  if (left <= 0) return;
  const st = book(w), s = econ(w), P = s.P;
  let slot = P.bill[i] - 1;
  if (slot < 0) {
    if (st.dueN >= DUE_CAP) return;
    slot = st.dueN++;
    st.dueWho[slot] = i;
    st.dueHosp[slot] = hosp.idx;
    st.dueAmt[slot] = 0;
    st.dueTold[slot] = 0;
    P.bill[i] = slot + 1;
    w.ledger.define({ id: 'med_' + slot, kind: 'claim', issuer: P.id(i) });
  }
  const holder = s.firms[st.dueHosp[slot]] ?? hosp;
  w.ledger.issueS('med_' + slot, holder.slot, left, 'health.debt', cause);
  st.dueAmt[slot] += left;
  if (!st.dueTold[slot] && P.age(w, i) >= 18 && P.incEma[i] > 0 && st.dueAmt[slot] > P.incEma[i] * 18) {
    st.dueTold[slot] = 1;
    w.events.emit('health.debt', `${P.name(i)} owes ${(st.dueAmt[slot] / 100).toFixed(0)} for care at ${holder.name} and the family cannot pay`, [cause], P.id(i));
  }
}

function wash(w: World, i: number, hosp: Firm, amt: number, cause: number): void {
  amt = Math.round(amt);
  if (amt <= 0) return;
  const st = book(w), s = econ(w), P = s.P, L = w.ledger;
  let slot = P.bill[i] - 1;
  if (slot < 0) {
    if (st.dueN >= DUE_CAP) return;
    slot = st.dueN++;
    st.dueWho[slot] = i;
    st.dueHosp[slot] = hosp.idx;
    st.dueAmt[slot] = 0;
    st.dueTold[slot] = 0;
    P.bill[i] = slot + 1;
    L.define({ id: 'med_' + slot, kind: 'claim', issuer: P.id(i) });
  }
  const holder = s.firms[st.dueHosp[slot]] ?? hosp;
  const id = 'med_' + slot;
  L.issueS(id, holder.slot, amt, 'health.claim', cause);
  if (!L.redeemS(id, holder.slot, amt, 'health.claim', cause)) st.dueAmt[slot] += amt;
}

function settle(w: World, i: number, cost: number): void {
  cost = Math.round(cost);
  if (cost <= 0) return;
  const st = book(w);
  if (st.hospN <= 0) return;
  const s = econ(w), P = s.P;
  const hosp = s.firms[st.hosp[i % st.hospN]];
  if (!hosp || hosp.closed) return;
  const cause = causeOf(st, w);
  // Politics covers a share as a discount. Charging that share to household deposits pushes the price cycle out of band.
  const pub = Math.min(cost, Math.round(cost * publicShare(s)));
  let left = cost - pub;
  st.yHosp += pub;
  if (left > 0 && P.cover[i] === 1 && insurer(w, s, i)) {
    wash(w, i, hosp, left, cause);
    st.yHosp += left;
    left = 0;
  }
  if (left <= 0) return;
  st.yHosp += left;
  owe(w, i, hosp, left, cause);
}

function forgiveDead(w: World): void {
  const st = book(w);
  if (st.dueN === 0) return;
  const s = econ(w), P = s.P, L = w.ledger, cause = st.openEv || w.genesis;
  for (let k = 0; k < st.dueN; k++) {
    const owed = st.dueAmt[k];
    if (owed <= 0) continue;
    const i = st.dueWho[k];
    if (i < 0 || P.alive(i)) continue;
    const hosp = s.firms[st.dueHosp[k]];
    if (!hosp) { st.dueAmt[k] = 0; continue; }
    const amt = Math.min(owed, Math.round(L.balS(hosp.slot, 'med_' + k)));
    if (amt > 0 && !L.redeemS('med_' + k, hosp.slot, amt, 'health.forgive', cause)) continue;
    st.dueAmt[k] = 0;
  }
}

function premium(w: World, i: number): void {
  const s = econ(w), P = s.P;
  if (P.cover[i] !== 1) return;
  const ins = insurer(w, s, i);
  if (!ins) P.cover[i] = 0;
}

function maybeCover(w: World, i: number): void {
  const s = econ(w), P = s.P, st = book(w);
  if (P.cover[i] !== 0 || st.medInc <= 0 || P.incEma[i] < st.medInc * 1.05) return;
  if (!insurer(w, s, i)) return;
  P.cover[i] = 1;
}

function drift(w: World, i: number): void {
  const s = econ(w), P = s.P, st = book(w), day = w.day, med = st.medInc;
  let t = 86;
  t -= Math.max(0, P.age(w, i) - 58) * 0.2;
  const inc = P.incEma[i];
  if (inc > 0 && med > 0) {
    if (inc < med * 0.65) t -= 6;
    else if (inc > med * 1.6) t += 3;
  }
  t -= dangerOf(s, i) * 1.5;
  if (P.habit[i] === 2) t -= 2;
  if (P.stressRun[i] > 90) t -= 2;
  const c = houseCond(w, i);
  if (c >= 0 && c < 58) t -= 3;
  else if (c >= 90) t += 1;
  if (P.ill[i] > 0) t -= 4;
  if (t < 72) t = 72;
  else if (t > 90) t = 90;
  const h = P.health[i], target = t | 0;
  if (h === target) return;
  writeHealth(s, i, day, h > target ? h - 1 : h + 1);
}

function maybeSick(w: World, i: number, r: Rng): void {
  const s = econ(w), P = s.P, day = w.day;
  const danger = dangerOf(s, i);
  const p = 0.0036 + danger * 0.002 + (P.health[i] < 70 ? 0.002 : 0) + (P.habit[i] === 2 ? 0.001 : 0) + (P.stressRun[i] > 90 ? 0.001 : 0);
  const hit = r.chance(p);
  if (!hit || P.ill[i] !== 0 || P.outUntil[i] > day) return;
  const days = danger >= 2 ? 2 : 1;
  writeHealth(s, i, day, P.health[i] - (danger >= 2 ? 2 : 1));
  grantLeave(w, i, days);
  settle(w, i, s.wage * (days === 2 ? 1.5 : 0.9));
  if (danger < 2 || (P.flags[i] & PLAYER) !== 0 || !r.chance(0.001)) return;
  const e = P.employer[i];
  const ev = w.events.emit('health.injury', `${P.name(i)} is hurt at ${e >= 0 ? s.firms[e].name : 'work'}`, [book(w).openEv || w.genesis], P.id(i));
  diePerson(w, s, i, ev);
}

function monthly(w: World): void {
  const s = econ(w), P = s.P, r = w.rng('life:health');
  for (let i = w.day % 30; i < P.n; i += 30) {
    if (!P.alive(i) || !P.adult(w, i)) continue;
    drift(w, i);
    premium(w, i);
    maybeCover(w, i);
    maybeSick(w, i, r);
  }
}

function coworker(s: EconState, P: People, i: number): number {
  const e = P.employer[i];
  if (e < 0) return -1;
  const staff = s.firms[e].staff, n = staff.length, pos = P.staffPos[i];
  if (n < 2 || pos < 0) return -1;
  return staff[(pos + 1) % n];
}

function acquaintance(w: World, i: number, salt: number): number {
  const c = (w.state.social as { contact?: Int32Array } | undefined)?.contact;
  if (!c) return -1;
  const b = i * DEG;
  if (b + DEG > c.length) return -1;
  return c[b + (salt % DEG)];
}

function infect(w: World, i: number, r: Rng): void {
  const st = book(w), dis = DISEASES[st.epi];
  const s = econ(w), P = s.P;
  if (!dis || !P.alive(i) || P.ill[i] !== 0 || st.nCase >= CASE_CAP) return;
  const killed = r.chance(dis.kill);
  P.ill[i] = st.epi + 1;
  const day = w.day;
  writeHealth(s, i, day, P.health[i] - dis.harm);
  grantLeave(w, i, Math.max(1, Math.round(dis.sick)));
  if (P.fearUntil[i] < day) P.fearUntil[i] = day + dis.sick + 8;
  st.cases[st.nCase] = i;
  st.caseUntil[st.nCase] = day + dis.days;
  st.nCase++;
  st.yCases++;
  if (P.adult(w, i)) settle(w, i, s.wage * (dis.sick + 2));
  if (!killed || (P.flags[i] & PLAYER) !== 0 || !P.alive(i)) return;
  st.yDead++;
  diePerson(w, s, i, st.epiEv);
}

function tryOne(w: World, from: number, j: number, rate: number, r: Rng): number {
  if (j < 0 || j === from) return 0;
  const P = econ(w).P;
  if (!P.alive(j) || P.ill[j] !== 0) return 0;
  if (!r.chance(rate)) return 0;
  infect(w, j, r);
  return 1;
}

function seedPatients(w: World, nWant: number): number[] {
  const s = econ(w), P = s.P, out: number[] = [];
  const seen = new Set<number>();
  const add = (i: number): void => {
    if (out.length >= nWant || seen.has(i) || !P.alive(i) || (P.flags[i] & PLAYER) !== 0) return;
    seen.add(i);
    out.push(i);
  };
  for (const f of s.firms) {
    if (f.closed || f.sector !== 'TRANSPORT') continue;
    for (const p of f.staff) add(p);
    if (out.length >= nWant) return out;
  }
  for (let i = 0; i < P.n && out.length < nWant; i += 29) add(i);
  return out;
}

function endEpi(w: World): void {
  const st = book(w);
  if (st.epi < 0 || w.day < st.epiUntil) return;
  const s = econ(w), P = s.P, mark = st.epi + 1;
  for (let k = 0; k < st.nCase; k++) if (P.ill[st.cases[k]] === mark) P.ill[st.cases[k]] = 0;
  st.nCase = 0;
  st.epi = -1;
  st.quar = 0;
}

function maybeArrive(w: World): void {
  const st = book(w);
  if (st.epi >= 0 || w.day % 360 !== 1 || w.day < 360) return;
  const r = w.rng('shock:health');
  for (let d = 0; d < DISEASES.length; d++) {
    const dis = DISEASES[d];
    if (!r.chance(dis.chance)) continue;
    if (dis.port && w.day < st.portUntil) continue;
    const s = econ(w);
    const ab = w.state.abroad as { priceEv?: number } | undefined;
    const cause = ab?.priceEv || s.macroEv || w.genesis;
    const where = dis.port ? 'comes off a ship in the harbour' : 'breaks out in the city';
    st.epiEv = w.events.emit('health.arrive', `${dis.name} ${where}`, [cause]);
    st.epi = d;
    st.epiUntil = w.day + dis.days;
    st.quar = 0;
    st.nCase = 0;
    for (const i of seedPatients(w, 3)) infect(w, i, r);
    return;
  }
}

function spread(w: World): void {
  const st = book(w);
  if (st.epi < 0 || w.day >= st.epiUntil) return;
  const dis = DISEASES[st.epi];
  if (!dis) return;
  const s = econ(w), P = s.P, day = w.day, mark = st.epi + 1;
  let wri = 0;
  for (let k = 0; k < st.nCase; k++) {
    const i = st.cases[k];
    if (day < st.caseUntil[k] && P.alive(i) && P.ill[i] === mark) {
      st.cases[wri] = i;
      st.caseUntil[wri] = st.caseUntil[k];
      wri++;
    } else if (P.ill[i] === mark) P.ill[i] = 0;
  }
  st.nCase = wri;
  const r = w.rng('shock:health');
  const capNew = Math.max(6, Math.floor(P.n / 3500));
  const rate = dis.spread * 1.2 * (st.quar || day < st.portUntil ? 0.45 : 1);
  const n0 = st.nCase;
  const lim = Math.min(n0, 36);
  const start = n0 ? day % n0 : 0;
  let born = 0;
  for (let k = 0; k < lim && born < capNew; k++) {
    const i = st.cases[(start + k) % n0];
    born += tryOne(w, i, coworker(s, P, i), rate, r);
    born += tryOne(w, i, acquaintance(w, i, day + k), rate, r);
  }
  if (st.quar || st.nCase < 12) return;
  st.quar = 1;
  st.portUntil = day + 24;
  const ev = w.events.emit('health.quarantine', `the government closes the port for 24 days and orders a quarantine against ${dis.name}; ${st.nCase} people are sick`, [st.epiEv]);
  if (st.hospN <= 0) return;
  const hosp = s.firms[st.hosp[day % st.hospN]];
  if (!hosp || hosp.closed) return;
  const surge = Math.round(s.wage * st.nCase * 2);
  if (surge > 0 && w.ledger.balS(s.govSlot, DEP) >= surge && payS(w, s, s.govSlot, hosp.slot, surge, 'health.surge', ev)) st.yHosp += surge;
}

function refreshMed(w: World): void {
  const P = econ(w).P, arr: number[] = [];
  const step = Math.max(1, Math.floor(P.n / 5000));
  for (let i = 0; i < P.n; i += step) {
    if (!P.alive(i) || !P.adult(w, i)) continue;
    const inc = P.incEma[i];
    if (inc > 0) arr.push(inc);
  }
  if (!arr.length) return;
  arr.sort((a, b) => a - b);
  book(w).medInc = arr[arr.length >> 1];
}

function fifths(w: World): { hiH: number; hiI: number; loH: number; loI: number } | undefined {
  const P = econ(w).P;
  const inc: number[] = [], hp: number[] = [];
  const step = Math.max(1, Math.floor(P.n / 8000));
  for (let i = 0; i < P.n; i += step) {
    if (!P.alive(i) || !P.adult(w, i)) continue;
    inc.push(P.incEma[i]);
    hp.push(P.health[i]);
  }
  const n = inc.length;
  if (n < 20) return undefined;
  const idx = new Array<number>(n);
  for (let k = 0; k < n; k++) idx[k] = k;
  idx.sort((a, b) => inc[a] - inc[b] || a - b);
  const q = Math.max(1, Math.floor(n / 5));
  let loH = 0, loI = 0, hiH = 0, hiI = 0;
  for (let k = 0; k < q; k++) { loH += hp[idx[k]]; loI += inc[idx[k]]; }
  for (let k = n - q; k < n; k++) { hiH += hp[idx[k]]; hiI += inc[idx[k]]; }
  return { hiH: hiH / q, hiI: hiI / q, loH: loH / q, loI: loI / q };
}

function init(w: World): void {
  const s = econ(w);
  const hosp = new Int32Array(8);
  let hospN = 0;
  for (const f of s.firms) if (f.good === 'HEALTHCARE' && !f.closed && hospN < hosp.length) hosp[hospN++] = f.idx;
  const dueWho = new Int32Array(DUE_CAP);
  dueWho.fill(-1);
  const st: Book = {
    openEv: 0, medInc: 0, hosp, hospN,
    epi: -1, epiEv: 0, epiUntil: 0, portUntil: 0, quar: 0,
    cases: new Int32Array(CASE_CAP), caseUntil: new Int32Array(CASE_CAP), nCase: 0,
    away: new Int32Array(AWAY_CAP), nAway: 0,
    dueWho, dueAmt: new Int32Array(DUE_CAP), dueHosp: new Int16Array(DUE_CAP), dueTold: new Uint8Array(DUE_CAP), dueN: 0,
    ySick: 0, yHosp: 0, yCases: 0, yDead: 0, yTold: 0,
  };
  w.state.health = st;
  openHospitals(w);
  refreshMed(w);
  const ids = (w.state.insurance as { insId?: string[] } | undefined)?.insId;
  if (ids && ids.length && st.medInc > 0) {
    const P = s.P;
    for (let i = 0; i < P.n; i++) if (P.alive(i) && P.adult(w, i) && P.incEma[i] >= st.medInc) P.cover[i] = 1;
  }
  setDeathChance(deathChance);
}

function openHospitals(w: World): void {
  const st = book(w);
  if (st.openEv) return;
  st.openEv = w.events.emit('health.open', 'hospitals open; health follows age, pay, the danger of the work, habits and the state of the home', [w.genesis]);
}

function dayClose(w: World): void {
  setSimDay(w.day);
  openHospitals(w);
  restore(w);
  forgiveDead(w);
  if (w.day % 360 === 359) refreshMed(w);
  endEpi(w);
  maybeArrive(w);
  spread(w);
  monthly(w);
}

function stats(w: World): Record<string, number> {
  const st = book(w), P = econ(w).P;
  let n = 0, h = 0, adults = 0, bare = 0;
  for (let i = 0; i < P.n; i++) {
    if (!P.alive(i)) continue;
    n++; h += P.health[i];
    if (!P.adult(w, i)) continue;
    adults++;
    if (P.cover[i] === 0) bare++;
  }
  const q = fifths(w);
  const med = st.medInc;
  const row = {
    hlth: Math.round((n ? h / n : 0) * 10) / 10,
    sick: st.ySick,
    hosp: Math.round(st.yHosp / 100),
    unins: Math.round((adults ? 100 * bare / adults : 0) * 10) / 10,
    cases: st.yCases,
    edead: st.yDead,
    leHi: q ? Math.round(expectYears(q.hiH, q.hiI, med) * 10) / 10 : 0,
    leLo: q ? Math.round(expectYears(q.loH, q.loI, med) * 10) / 10 : 0,
  };
  st.ySick = 0; st.yHosp = 0; st.yCases = 0; st.yDead = 0; st.yTold = 0;
  return row;
}

export const health: Module = { id: 'health', init, dayClose, stats };
