// Land and buildings. Households live in parcels, firms rent commercial space, and sales clear
// against what a buyer can pay plus what a bank will lend. Home values sit on the ledger as a
// claim on the land register, so net worth includes them. Mortgages are claims the banks hold;
// a price fall that leaves the loan larger than the house ends in repossession, and those
// forced sales pull the neighbourhood index down with them.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DAYS_PER_YEAR, type Module, type World } from '../../kernel/index.ts';
import { parseRaws, RawReader } from '../../kernel/content.ts';
import { BANK, DEP, GOV, pay, payS, type EconState } from '../economy/index.ts';
import { thought } from '../economy/people.ts';

const PROP = 'prop:value';
const LAND = 'land';
const HOME = 1, COMM = 2;
const PERSON = 1, FIRM = 2, FUND = 3, BANKK = 4, STATE = 5;
const FROM_BANK = 1;
const YEARS = 1.4;       // opening price, in years of that household's income
const TERM = 240;
const KEEP = 8;          // days of income left in the account when paying for a house or a loan
const MISS_REPO = 4;
const MISS_EVICT = 2;

interface Nb { id: string; name: string; size: number; desir: number; dist: number }
interface Listing { p: number; ask: number; sold: boolean }
interface Bid { k: number; id: number; max: number; live: boolean }

interface Book {
  n: number;
  cap: number;
  nb: Uint8Array;
  kind: Uint8Array;
  size: Uint16Array;
  cond: Uint8Array;
  ownK: Uint8Array;
  own: Int32Array;
  tenK: Uint8Array;
  ten: Int32Array;
  rent: Float64Array;
  lastPx: Float64Array;
  marked: Float64Array;
  mtg: Int32Array;
  missR: Uint8Array;
  flag: Uint8Array;
  rentY: Float64Array;
  hhInc: Float64Array;
  live: Int32Array;
  nk: Uint8Array;
  seen: number;
  scan: number;
  pScan: number;
  ln: number;
  lnCap: number;
  lnParcel: Int32Array;
  lnPay: Int32Array;
  lnBank: Uint8Array;
  lnSpread: Float64Array;
  lnMiss: Uint8Array;
  lnOpen: Uint8Array;
  lnAge: Uint16Array;
  lnTerm: Uint16Array;
  px: Float64Array;
  basePx: Float64Array;
  saleSum: Float64Array;
  saleN: Uint16Array;
  rentBase: number;
  inc0: number;
  rate0: number;
  ownNow: number;
  priceEv: number;
  lastSaleEv: number;
  mSale: number;
  mRepo: number;
  yRepo: number;
  arrPeak: number;
  bankIds: string[];
  fundIds: string[];
}

const file = fileURLToPath(new URL('../../content/property.txt', import.meta.url));
const NBHDS: Nb[] = parseRaws(readFileSync(file, 'utf8'), 'property.txt')
  .filter((r) => r.type === 'NEIGHBOURHOOD')
  .map((r) => {
    const rd = new RawReader(r);
    return { id: r.id, name: rd.str('NAME'), size: rd.num('SIZE'), desir: rd.num('DESIRABILITY'), dist: rd.num('DISTANCE') };
  });
if (!NBHDS.length) throw new Error('property.txt: no neighbourhoods');

const book = (w: World): Book => w.state.property as Book;
const econ = (w: World): EconState => w.state.economy as EconState;
const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));
const yieldOf = (policy: number): number => Math.max(0.035, policy + 0.012);

function mix(a: number, b: number): number {
  let x = Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 1, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 16), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
function quality(st: Book, p: number): number {
  return Math.max(0.4, st.size[p] * (0.55 + 0.45 * st.cond[p] / 100));
}
// Average income moves slowly: count it once a day (kept in the saved state, so a reload gives the same value).
function meanIncome(w: World): number {
  const st = book(w) as Book & { miDay?: number; mi?: number };
  if (st.miDay === w.day && st.mi !== undefined) return st.mi;
  const P = econ(w).P;
  let s = 0, n = 0;
  for (let i = 0; i < P.n; i++) if (P.alive(i) && P.incEma[i] > 0) { s += P.incEma[i]; n++; }
  st.mi = n ? s / n : st.inc0 || 1; st.miDay = w.day;
  return st.mi;
}

function growParcels(st: Book): void {
  const n = st.cap * 2;
  const nb = new Uint8Array(n); nb.set(st.nb); st.nb = nb;
  const kind = new Uint8Array(n); kind.set(st.kind); st.kind = kind;
  const size = new Uint16Array(n); size.set(st.size); st.size = size;
  const cond = new Uint8Array(n); cond.set(st.cond); st.cond = cond;
  const ownK = new Uint8Array(n); ownK.set(st.ownK); st.ownK = ownK;
  const own = new Int32Array(n); own.fill(-1); own.set(st.own); st.own = own;
  const tenK = new Uint8Array(n); tenK.set(st.tenK); st.tenK = tenK;
  const ten = new Int32Array(n); ten.fill(-1); ten.set(st.ten); st.ten = ten;
  const rent = new Float64Array(n); rent.set(st.rent); st.rent = rent;
  const lastPx = new Float64Array(n); lastPx.set(st.lastPx); st.lastPx = lastPx;
  const marked = new Float64Array(n); marked.set(st.marked); st.marked = marked;
  const mtg = new Int32Array(n); mtg.fill(-1); mtg.set(st.mtg); st.mtg = mtg;
  const missR = new Uint8Array(n); missR.set(st.missR); st.missR = missR;
  const flag = new Uint8Array(n); flag.set(st.flag); st.flag = flag;
  const rentY = new Float64Array(n); rentY.set(st.rentY); st.rentY = rentY;
  const hhInc = new Float64Array(n); hhInc.set(st.hhInc); st.hhInc = hhInc;
  st.cap = n;
}
function addParcel(st: Book, nb: number, kind: number, size: number, cond: number, ownK: number, own: number, tenK: number, ten: number): number {
  if (st.n >= st.cap) growParcels(st);
  const p = st.n++;
  st.nb[p] = nb; st.kind[p] = kind; st.size[p] = size; st.cond[p] = cond;
  st.ownK[p] = ownK; st.own[p] = own; st.tenK[p] = tenK; st.ten[p] = ten;
  st.mtg[p] = -1;
  return p;
}
function ensurePeople(st: Book, n: number): void {
  if (st.live.length >= n) return;
  const m = Math.max(n, st.live.length * 2, 16);
  const live = new Int32Array(m); live.fill(-1); live.set(st.live); st.live = live;
  const nk = new Uint8Array(m); nk.set(st.nk); st.nk = nk;
}
function growLoans(st: Book): void {
  const n = st.lnCap * 2;
  const copyI = (a: Int32Array): Int32Array => { const b = new Int32Array(n); b.set(a); return b; };
  const copyU = (a: Uint8Array): Uint8Array => { const b = new Uint8Array(n); b.set(a); return b; };
  const copyF = (a: Float64Array): Float64Array => { const b = new Float64Array(n); b.set(a); return b; };
  const copyT = (a: Uint16Array): Uint16Array => { const b = new Uint16Array(n); b.set(a); return b; };
  st.lnParcel = copyI(st.lnParcel); st.lnPay = copyI(st.lnPay); st.lnBank = copyU(st.lnBank);
  st.lnSpread = copyF(st.lnSpread); st.lnMiss = copyU(st.lnMiss); st.lnOpen = copyU(st.lnOpen);
  st.lnAge = copyT(st.lnAge); st.lnTerm = copyT(st.lnTerm); st.lnCap = n;
}

function actorOf(w: World, k: number, id: number): string {
  const st = book(w), s = econ(w);
  if (k === PERSON) return id >= 0 && id < s.P.n ? s.P.id(id) : '';
  if (k === FIRM) return s.firms[id]?.id ?? '';
  if (k === FUND) return st.fundIds[id] ?? '';
  if (k === BANKK) return st.bankIds[id] ?? '';
  if (k === STATE) return GOV;
  return '';
}
function ownerActor(w: World, p: number): string {
  const st = book(w);
  return actorOf(w, st.ownK[p], st.own[p]);
}
function fundIndex(st: Book, id: string): number {
  let i = st.fundIds.indexOf(id);
  if (i < 0) { i = st.fundIds.length; st.fundIds.push(id); }
  return i;
}
function whoName(w: World, k: number, id: number): string {
  if (k === PERSON) { const P = econ(w).P; return id >= 0 && id < P.n ? P.name(id) : 'someone'; }
  if (k === FIRM) return econ(w).firms[id]?.name ?? 'a firm';
  if (k === FUND) return book(w).fundIds[id] ?? 'a fund';
  if (k === BANKK) return book(w).bankIds[id] ?? 'a bank';
  return 'the state';
}

function setMarked(w: World, p: number, next: number, cause: number): void {
  const st = book(w);
  next = Math.max(0, Math.round(next));
  const prev = Math.round(st.marked[p]);
  if (next === prev) return;
  const id = ownerActor(w, p);
  if (!id) { st.marked[p] = next; return; }
  const d = next - prev;
  if (d > 0) { w.ledger.issue(PROP, id, d, 'property.revalue', cause); st.marked[p] = next; return; }
  const have = Math.floor(w.ledger.balance(id, PROP));
  const cut = Math.min(have, -d);
  if (cut > 0) w.ledger.redeem(PROP, id, cut, 'property.revalue', cause);
  st.marked[p] = prev - (cut > 0 ? cut : 0);
}
function hand(w: World, p: number, k: number, id: number, cause: number): void {
  const st = book(w);
  const from = ownerActor(w, p), to = actorOf(w, k, id);
  const v = Math.round(st.marked[p]);
  if (from && to && from !== to && v > 0) {
    const have = Math.floor(w.ledger.balance(from, PROP));
    const m = Math.min(v, have);
    if (m > 0 && w.ledger.move(PROP, from, to, m, 'property.transfer', cause)) st.marked[p] = m;
    else if (m > 0) return;
  }
  st.ownK[p] = k; st.own[p] = id;
}

function ownerOccupies(w: World, p: number): boolean {
  const st = book(w), P = econ(w).P;
  if (st.kind[p] !== HOME || st.ownK[p] !== PERSON || st.tenK[p] !== PERSON) return false;
  const o = st.own[p], t = st.ten[p];
  if (o === t) return true;
  if (t >= 0 && t < P.n && P.spouse[t] === o) return true;
  if (o >= 0 && o < P.n && P.spouse[o] === t) return true;
  return false;
}
function vacancyOf(st: Book): { vac: number; homes: number; rate: number } {
  let vac = 0, homes = 0;
  for (let p = 0; p < st.n; p++) if (st.kind[p] === HOME) { homes++; if (st.tenK[p] === 0) vac++; }
  return { vac, homes, rate: homes ? vac / homes : 0 };
}
function measureOwn(w: World): number {
  const st = book(w);
  let hh = 0, own = 0;
  for (let p = 0; p < st.n; p++) if (st.kind[p] === HOME && st.tenK[p] === PERSON) { hh++; if (ownerOccupies(w, p)) own++; }
  return hh ? own / hh : 0;
}
function priceIndex(st: Book): number {
  const cnt = new Float64Array(NBHDS.length);
  for (let p = 0; p < st.n; p++) if (st.kind[p] === HOME) cnt[st.nb[p]]++;
  let s = 0, n = 0;
  for (let k = 0; k < NBHDS.length; k++) if (cnt[k] > 0 && st.basePx[k] > 0) { s += cnt[k] * st.px[k] / st.basePx[k]; n += cnt[k]; }
  return n ? s / n * 100 : 100;
}
function rentIndex(st: Book): number {
  let s = 0, n = 0;
  for (let p = 0; p < st.n; p++) if (st.kind[p] === HOME && st.rent[p] > 0) { s += st.rent[p] / quality(st, p); n++; }
  if (!n || !(st.rentBase > 0)) return 100;
  return (s / n) / st.rentBase * 100;
}

function banks(w: World): { id: string; depo: string; failed: boolean }[] {
  return (w.state.banking as { banks?: { id: string; depo: string; failed: boolean }[] } | undefined)?.banks ?? [];
}
function bankRoom(w: World, id: string, depo: string): number {
  const equity = w.ledger.netWorth(id);
  if (!(equity > 0)) return 0;
  const deposits = (w.ledger.issued.get(depo) ?? 0) + (id === BANK ? (w.ledger.issued.get(DEP) ?? 0) : 0);
  const assets = equity + deposits;
  const ratio = assets > 1 ? equity / assets : 0;
  if (ratio < 0.08) return 0;
  let room = Math.floor(equity * 0.5);
  if (id === BANK) room = Math.min(room, Math.floor(Math.max(0, equity / 0.08 - assets)));
  else room = Math.min(room, Math.floor(w.ledger.balance(id, DEP)));
  return Math.max(0, room);
}
function ltvOf(w: World): number {
  const u = econ(w).unemployment, own = book(w).ownNow;
  let ltv = 0.9;
  if (own > 0.66) ltv = 0.78;
  if (own > 0.7) ltv = 0.62;
  if (u > 0.09) ltv -= 0.06;
  if (u > 0.13) ltv -= 0.08;
  return Math.max(0.45, ltv);
}
function annuity(bal: number, annual: number, months: number): number {
  const n = Math.max(1, months), r = annual / 12;
  if (!(bal > 0)) return 0;
  if (r < 1e-8) return Math.round(bal / n);
  const f = (1 + r) ** n;
  return Math.max(0, Math.round(bal * r * f / (f - 1)));
}
function loanFromPayment(pmt: number, annual: number, months: number): number {
  const n = Math.max(1, months), r = annual / 12;
  if (!(pmt > 0)) return 0;
  if (r < 1e-8) return pmt * n;
  const f = (1 + r) ** n;
  return pmt * (f - 1) / (r * f);
}
function owed(w: World, k: number): number {
  return Math.floor(w.ledger.issued.get('pm_' + k) ?? 0);
}
function hasLoan(st: Book, person: number): boolean {
  for (let k = 0; k < st.ln; k++) if (st.lnOpen[k] && st.lnPay[k] === person) return true;
  return false;
}
function bankingMortgage(w: World, person: number): boolean {
  const mtg = (w.state.banking as { mtg?: Uint8Array } | undefined)?.mtg;
  return !!mtg && person < mtg.length && mtg[person] === 1;
}
function loanOffer(w: World, person: number, price: number): number {
  const s = econ(w), P = s.P, st = book(w);
  if (person < 0 || person >= P.n || !P.alive(person) || P.age(w, person) < 21) return 0;
  if (hasLoan(st, person) || bankingMortgage(w, person)) return 0;
  const spread = 0.018;
  const rate = s.policyRate + spread;
  const ltv = ltvOf(w);
  const monthly = Math.max(P.incEma[person], householdIncome(w, person));
  const byPay = loanFromPayment(monthly * 30 * 0.28, rate, TERM);
  let room = 0;
  for (const b of banks(w)) if (!b.failed) room = Math.max(room, bankRoom(w, b.id, b.depo));
  return Math.max(0, Math.floor(Math.min(price * ltv, byPay, room)));
}
function pickBank(w: World, amount: number): { idx: number; id: string } | null {
  const st = book(w), s = econ(w);
  let best: { idx: number; id: string; rate: number; room: number } | null = null;
  const list = banks(w);
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (b.failed) continue;
    const room = bankRoom(w, b.id, b.depo);
    if (room < 1000) continue;
    const rate = s.policyRate + (b.id === BANK ? 0.012 : 0.004) + 0.001 * i;
    const take = Math.min(room, amount);
    if (!best || rate < best.rate - 1e-9 || (Math.abs(rate - best.rate) <= 1e-9 && take > best.room)) best = { idx: i, id: b.id, rate, room: take };
  }
  if (!best) return null;
  const idx = st.bankIds.indexOf(best.id);
  return { idx: idx >= 0 ? idx : 0, id: best.id };
}

function payInterest(w: World, bankId: string, from: string, amount: number, cause: number): number {
  const a = Math.min(Math.round(amount), Math.floor(w.ledger.balance(from, DEP)));
  if (a <= 0) return 0;
  if (bankId === BANK) return w.ledger.redeem(DEP, from, a, 'loan.interest', cause) ? a : 0;
  return pay(w, from, bankId, a, 'loan.interest', cause) ? a : 0;
}
function payPrincipal(w: World, bankId: string, k: number, from: string, amount: number, cause: number): number {
  const instr = 'pm_' + k;
  const a = Math.min(Math.round(amount), Math.floor(w.ledger.balance(from, DEP)), Math.floor(w.ledger.balance(bankId, instr)));
  if (a <= 0) return 0;
  if (bankId === BANK) {
    if (!w.ledger.redeem(DEP, from, a, 'loan.repay', cause)) return 0;
    if (!w.ledger.redeem(instr, bankId, a, 'loan.repay', cause)) { w.ledger.issue(DEP, from, a, 'loan.repay', cause); return 0; }
    return a;
  }
  if (!pay(w, from, bankId, a, 'loan.repay', cause)) return 0;
  if (!w.ledger.redeem(instr, bankId, a, 'loan.repay', cause)) { pay(w, bankId, from, a, 'loan.repay', cause); return 0; }
  return a;
}
function writeoff(w: World, k: number, bankId: string, cause: number): number {
  const instr = 'pm_' + k;
  const a = Math.floor(w.ledger.balance(bankId, instr));
  if (a > 0 && w.ledger.redeem(instr, bankId, a, 'loan.writeoff', cause)) return a;
  return 0;
}
function closeLoan(st: Book, k: number): void {
  st.lnOpen[k] = 0;
  const p = st.lnParcel[k];
  if (p >= 0 && p < st.n && st.mtg[p] === k) st.mtg[p] = -1;
}
function openLoan(w: World, person: number, parcel: number, amount: number, cause: number): number {
  const st = book(w), s = econ(w), P = s.P;
  const pick = pickBank(w, amount);
  if (!pick) return -1;
  const room = bankRoom(w, pick.id, banks(w).find((b) => b.id === pick.id)?.depo ?? ('depo:' + pick.id));
  const a = Math.min(Math.round(amount), room);
  if (a < 1000) return -1;
  if (st.ln >= st.lnCap) growLoans(st);
  const k = st.ln++;
  w.ledger.define({ id: 'pm_' + k, kind: 'claim', issuer: P.id(person) });
  if (pick.id === BANK) {
    w.ledger.issue('pm_' + k, pick.id, a, 'loan.grant', cause);
    w.ledger.issue(DEP, P.id(person), a, 'loan.grant', cause);
  } else if (!pay(w, pick.id, P.id(person), a, 'loan.grant', cause)) {
    st.lnOpen[k] = 0; return -1;
  } else w.ledger.issue('pm_' + k, pick.id, a, 'loan.grant', cause);
  const spread = 0.018;
  st.lnParcel[k] = parcel; st.lnPay[k] = person; st.lnBank[k] = pick.idx; st.lnSpread[k] = spread;
  st.lnMiss[k] = 0; st.lnOpen[k] = 1; st.lnAge[k] = 0; st.lnTerm[k] = TERM;
  const ev = w.events.emit('property.mortgage', `${P.name(person)} borrows ${(a / 100).toFixed(0)} at ${((s.policyRate + spread) * 100).toFixed(1)}% against a ${NBHDS[st.nb[parcel]].name} home`, [cause, s.rateEv], P.id(person));
  P.lastEv[person] = ev;
  return k;
}
function closeOut(w: World, k: number, payer: number, budget: number, cause: number): void {
  const st = book(w), P = econ(w).P;
  if (!st.lnOpen[k]) return;
  const bankId = st.bankIds[st.lnBank[k]] || BANK;
  const from = payer >= 0 && payer < P.n ? P.id(payer) : '';
  const bal = owed(w, k);
  const use = from ? Math.min(bal, Math.max(0, Math.round(budget)), Math.floor(w.ledger.balance(from, DEP))) : 0;
  if (use > 0 && from) payPrincipal(w, bankId, k, from, use, cause);
  if (owed(w, k) > 0) writeoff(w, k, bankId, cause);
  closeLoan(st, k);
}

function household(P: EconState['P'], head: number): number[] {
  const out = [head];
  const sp = head >= 0 && head < P.n ? P.spouse[head] : -1;
  if (sp >= 0 && sp < P.n && P.alive(sp)) out.push(sp);
  return out;
}
function householdIncome(w: World, head: number): number {
  const P = econ(w).P;
  let t = 0;
  for (const i of household(P, head)) if (P.alive(i)) t += P.incEma[i];
  return t;
}
function spendable(w: World, ids: number[]): number {
  const P = econ(w).P;
  let t = 0;
  for (const i of ids) t += Math.max(0, Math.floor(w.ledger.balS(P.slot[i], DEP) - P.incEma[i] * KEEP));
  return t;
}
function payGroup(w: World, ids: number[], to: string, amount: number, cause: number): boolean {
  const P = econ(w).P;
  let left = Math.round(amount);
  const plan: { id: string; a: number }[] = [];
  for (const i of ids) {
    const can = Math.max(0, Math.floor(w.ledger.balS(P.slot[i], DEP) - P.incEma[i] * KEEP));
    const a = Math.min(left, can);
    if (a > 0) { plan.push({ id: P.id(i), a }); left -= a; }
  }
  if (left > 0) return false;
  for (const p of plan) if (!pay(w, p.id, to, p.a, 'property.buy', cause)) return false;
  return true;
}

function fillIncome(w: World): void {
  const st = book(w), P = econ(w).P;
  st.hhInc.fill(0);
  for (let i = 0; i < P.n && i < st.live.length; i++) {
    if (!P.alive(i)) continue;
    const p = st.live[i];
    if (p >= 0 && p < st.n) st.hhInc[p] += P.incEma[i];
  }
}
function heirOf(P: EconState['P'], i: number): number {
  if (i < 0 || i >= P.n) return -1;
  const sp = P.spouse[i];
  if (sp >= 0 && sp < P.n && P.alive(sp)) return sp;
  for (const c of P.kids(i)) if (P.alive(c)) return c;
  return -1;
}
// Who lives in each parcel, so a household can move without scanning the whole city. Rebuilt from
// `live` for each book (a reloaded world gets a new book), then kept in step with every later write.
let occBook: Book | null = null;
let occOn = false;
let occHead = new Int32Array(0);
let occNext = new Int32Array(0);
let rankList: Int32Array | null = null;
let rankLen = 0;

function occEnsure(st: Book, nPeople: number): void {
  if (occBook !== st) { occOn = false; occBook = st; }
  if (occHead.length < st.n) {
    const a = new Int32Array(Math.max(st.n, occHead.length * 2, 16));
    a.fill(-1);
    if (occOn) a.set(occHead);
    occHead = a;
  }
  if (occNext.length < nPeople) {
    const a = new Int32Array(Math.max(nPeople, occNext.length * 2, 16));
    a.fill(-1);
    if (occOn) a.set(occNext);
    occNext = a;
  }
  if (occOn) return;
  occHead.fill(-1, 0, st.n);
  const lim = Math.min(nPeople, st.live.length);
  occNext.fill(-1, 0, lim);
  const live = st.live;
  for (let i = 0; i < lim; i++) {
    const p = live[i];
    if (p < 0 || p >= st.n) continue;
    occNext[i] = occHead[p];
    occHead[p] = i;
  }
  occOn = true;
}
function setLive(st: Book, _nPeople: number, i: number, p: number): void {
  st.live[i] = p;
  // Any direct move drops the household index. The next shiftAll rebuilds it from `live`.
  occOn = false;
}
function shiftAll(w: World, from: number, dest: number): void {
  if (from === dest || from < 0 || dest < 0) return;
  const st = book(w), P = econ(w).P;
  occEnsure(st, P.n);
  const head = st.tenK[from] === PERSON ? st.ten[from] : -1;
  let i = occHead[from];
  occHead[from] = -1;
  while (i >= 0) {
    const next = occNext[i];
    st.live[i] = dest;
    occNext[i] = occHead[dest];
    occHead[dest] = i;
    i = next;
  }
  st.tenK[from] = 0; st.ten[from] = -1; st.missR[from] = 0;
  if (st.tenK[dest] === 0 && head >= 0) { st.tenK[dest] = PERSON; st.ten[dest] = head; }
  rankInsert(st, from);
}
function cheapest(st: Book, maxRent: number, minSize: number): number {
  let best = -1, rent = Infinity, size = -1;
  for (let p = 0; p < st.n; p++) {
    if (st.kind[p] !== HOME || st.tenK[p] !== 0 || st.size[p] < minSize) continue;
    if (st.rent[p] <= maxRent && (st.rent[p] < rent || (st.rent[p] === rent && st.size[p] > size))) {
      best = p; rent = st.rent[p]; size = st.size[p];
    }
  }
  return best;
}
function rankedVacant(st: Book): Int32Array {
  const tmp: number[] = [];
  const kind = st.kind, tenK = st.tenK;
  for (let p = 0; p < st.n; p++) if (kind[p] === HOME && tenK[p] === 0) tmp.push(p);
  const rent = st.rent, size = st.size;
  tmp.sort((a, b) => rent[a] - rent[b] || size[b] - size[a] || a - b);
  return Int32Array.from(tmp);
}
function pickRanked(st: Book, ranked: Int32Array, maxRent: number, minSize: number): number {
  const rent = st.rent, size = st.size, tenK = st.tenK;
  for (let i = 0; i < ranked.length; i++) {
    const p = ranked[i];
    if (tenK[p] !== 0) continue;
    if (rent[p] > maxRent) return -1;
    if (size[p] >= minSize) return p;
  }
  return -1;
}
function beginRanked(st: Book): void {
  const tmp: number[] = [];
  const kind = st.kind, tenK = st.tenK;
  for (let p = 0; p < st.n; p++) if (kind[p] === HOME && tenK[p] === 0) tmp.push(p);
  const rent = st.rent, size = st.size;
  tmp.sort((a, b) => rent[a] - rent[b] || size[b] - size[a] || a - b);
  if (!rankList || rankList.length < tmp.length) rankList = new Int32Array(Math.max(tmp.length, 16));
  rankList.set(tmp);
  rankLen = tmp.length;
}
function endRanked(): void { rankList = null; rankLen = 0; }
function rankInsert(st: Book, p: number): void {
  const list = rankList;
  if (!list || st.kind[p] !== HOME || st.tenK[p] !== 0) return;
  const rent = st.rent, size = st.size, rp = rent[p], sp = size[p];
  let lo = 0, hi = rankLen;
  while (lo < hi) {
    const mid = (lo + hi) >> 1, q = list[mid];
    const c = rent[q] - rp || sp - size[q] || q - p;
    if (c < 0) lo = mid + 1;
    else hi = mid;
  }
  if (lo < rankLen && list[lo] === p) return;
  if (rankLen >= list.length) {
    const grown = new Int32Array(list.length * 2);
    grown.set(list);
    rankList = grown;
  }
  const buf = rankList!;
  for (let i = rankLen; i > lo; i--) buf[i] = buf[i - 1];
  buf[lo] = p;
  rankLen++;
}
function pickOpen(st: Book, maxRent: number, minSize: number): number {
  const list = rankList;
  if (!list) return cheapest(st, maxRent, minSize);
  const rent = st.rent, size = st.size, tenK = st.tenK;
  for (let i = 0; i < rankLen; i++) {
    const p = list[i];
    if (tenK[p] !== 0) continue;
    if (rent[p] > maxRent) return -1;
    if (size[p] >= minSize) return p;
  }
  return -1;
}
function shelter(w: World): void {
  const st = book(w), P = econ(w).P;
  ensurePeople(st, P.n);
  const ranked = rankedVacant(st);
  for (let i = 0; i < P.n; i++) {
    if (!P.alive(i)) continue;
    if (st.live[i] >= 0 && st.live[i] < st.n) continue;
    const par = P.parent[i];
    const home = par >= 0 && par < st.live.length ? st.live[par] : -1;
    if (home >= 0) { setLive(st, P.n, i, home); continue; }
    const sp = P.spouse[i];
    const sh = sp >= 0 && sp < st.live.length ? st.live[sp] : -1;
    if (sh >= 0) { setLive(st, P.n, i, sh); continue; }
    const v = pickRanked(st, ranked, Infinity, 1);
    if (v >= 0) {
      setLive(st, P.n, i, v);
      if (st.tenK[v] === 0) { st.tenK[v] = PERSON; st.ten[v] = i; }
    }
  }
  st.seen = P.n;
}
function inherit(w: World): void {
  const st = book(w), P = econ(w).P, cause = st.priceEv;
  for (let p = 0; p < st.n; p++) {
    if (st.ownK[p] !== PERSON) continue;
    const o = st.own[p];
    if (o < 0 || o >= P.n || P.alive(o)) continue;
    const h = heirOf(P, o);
    if (h >= 0) hand(w, p, PERSON, h, cause);
    else hand(w, p, STATE, 0, cause);
  }
  for (let k = 0; k < st.ln; k++) {
    if (!st.lnOpen[k]) continue;
    const who = st.lnPay[k];
    if (who >= 0 && who < P.n && P.alive(who)) continue;
    const h = heirOf(P, who);
    if (h >= 0) st.lnPay[k] = h;
    else { writeoff(w, k, st.bankIds[st.lnBank[k]] || BANK, cause); closeLoan(st, k); }
  }
  const next = new Int32Array(st.n); next.fill(-1);
  for (let i = 0; i < P.n && i < st.live.length; i++) {
    if (!P.alive(i)) continue;
    const p = st.live[i];
    if (p >= 0 && p < st.n && (next[p] < 0 || i < next[p])) next[p] = i;
  }
  for (let p = 0; p < st.n; p++) {
    if (st.tenK[p] !== PERSON) continue;
    const t = st.ten[p];
    if (t >= 0 && t < P.n && P.alive(t)) continue;
    if (next[p] >= 0) st.ten[p] = next[p];
    else { st.tenK[p] = 0; st.ten[p] = -1; }
  }
}
function cohabit(w: World): void {
  const st = book(w), P = econ(w).P;
  for (let i = 0; i < P.n && i < st.live.length; i++) {
    if (!P.alive(i)) continue;
    const sp = P.spouse[i];
    if (sp <= i || sp >= P.n || !P.alive(sp)) continue;
    const a = st.live[i], b = sp < st.live.length ? st.live[sp] : -1;
    if (a < 0 || b < 0 || a === b) continue;
    if (st.tenK[b] === PERSON && st.ten[b] === sp) shiftAll(w, b, a);
    else {
      setLive(st, P.n, sp, a);
      for (let c = P.firstKid[sp]; c >= 0; c = P.nextSib[c]) {
        if (!P.alive(c) || P.age(w, c) >= 22 || P.spouse[c] >= 0) continue;
        if (c < st.live.length && st.live[c] === b) setLive(st, P.n, c, a);
      }
    }
  }
}

function noteComp(st: Book, nb: number, perQ: number): void {
  if (!(perQ > 0) || nb < 0 || nb >= NBHDS.length) return;
  st.saleSum[nb] += perQ; st.saleN[nb]++;
}
function findCashBuyer(w: World, price: number, notPerson: number): { k: number; id: number } | null {
  const s = econ(w), st = book(w);
  const funds = (w.state.markets as { funds?: { id: string }[] } | undefined)?.funds ?? [];
  for (const f of funds) {
    if (w.ledger.balance(f.id, DEP) >= price) return { k: FUND, id: fundIndex(st, f.id) };
  }
  for (const inv of s.investors) {
    const i = +inv.id.slice(2);
    if (i === notPerson || i < 0 || i >= s.P.n || !s.P.alive(i)) continue;
    if (w.ledger.balance(inv.id, DEP) >= price + s.P.incEma[i] * KEEP) return { k: PERSON, id: i };
  }
  return null;
}
function sell(w: World, p: number, bk: number, bid: number, price: number, cause: number, cashOnly: boolean): boolean {
  const st = book(w), s = econ(w), P = s.P;
  price = Math.max(1, Math.round(price));
  const seller = ownerActor(w, p), buyer = actorOf(w, bk, bid);
  if (!seller || !buyer || seller === buyer) return false;
  const sellerPerson = st.ownK[p] === PERSON ? st.own[p] : -1;
  let loanK = -1;
  if (!cashOnly && bk === PERSON) {
    const ids = household(P, bid);
    const have = spendable(w, ids);
    if (have < price) {
      const offer = loanOffer(w, bid, price);
      const draw = Math.min(offer, price - have);
      if (have + offer < price || draw < 1000) return false;
      loanK = openLoan(w, bid, p, draw, cause);
      if (loanK < 0) return false;
    }
  }
  if (bk === PERSON) {
    if (spendable(w, household(P, bid)) < price) { if (loanK >= 0) closeOut(w, loanK, bid, owed(w, loanK), cause); return false; }
  } else if (Math.floor(w.ledger.balance(buyer, DEP)) < price) return false;
  setMarked(w, p, price, cause);
  const old = st.mtg[p];
  const paid = bk === PERSON ? payGroup(w, household(P, bid), seller, price, cause) : pay(w, buyer, seller, price, 'property.buy', cause);
  if (!paid) { if (loanK >= 0) closeOut(w, loanK, bid, owed(w, loanK), cause); return false; }
  if (old >= 0 && st.lnOpen[old]) closeOut(w, old, sellerPerson >= 0 ? sellerPerson : st.lnPay[old], price, cause);
  hand(w, p, bk, bid, cause);
  if (loanK >= 0 && st.lnOpen[loanK]) st.mtg[p] = loanK;
  if (bk === PERSON && bid < st.live.length) {
    const cur = st.live[bid];
    if (cur === p || (st.tenK[p] === PERSON && (st.ten[p] === bid || P.spouse[st.ten[p]] === bid))) {
      st.tenK[p] = PERSON; st.ten[p] = bid;
    } else if (st.tenK[p] === 0 && cur >= 0 && st.tenK[cur] === PERSON && st.ten[cur] === bid && !ownerOccupies(w, cur)) {
      shiftAll(w, cur, p);
      st.tenK[p] = PERSON; st.ten[p] = bid;
    }
  }
  st.lastPx[p] = price;
  noteComp(st, st.nb[p], price / quality(st, p));
  st.mSale++;
  const ev = w.events.emit('property.sale', `${whoName(w, bk, bid)} pays ${(price / 100).toFixed(0)} for a ${NBHDS[st.nb[p]].name} ${st.kind[p] === COMM ? 'building' : 'home'}`, [st.priceEv, s.macroEv], buyer);
  st.lastSaleEv = ev;
  if (bk === PERSON) P.lastEv[bid] = ev;
  return true;
}
function repo(w: World, k: number, cause: number): void {
  const st = book(w), s = econ(w), P = s.P;
  if (!st.lnOpen[k]) return;
  const p = st.lnParcel[k];
  const who = st.lnPay[k];
  const ev = w.events.emit('property.repossess', `${who >= 0 && who < P.n ? P.name(who) : 'a borrower'} loses a ${p >= 0 ? NBHDS[st.nb[p]].name : ''} home, still owing ${(owed(w, k) / 100).toFixed(0)}`, [cause, st.priceEv], who >= 0 && who < P.n ? P.id(who) : undefined);
  if (who >= 0 && who < P.n && P.alive(who)) { thought(w, s, who, 240, 'losing a home', ev); P.lastEv[who] = ev; }
  st.yRepo++; st.mRepo++;
  if (p < 0 || p >= st.n) { writeoff(w, k, st.bankIds[st.lnBank[k]] || BANK, ev); closeLoan(st, k); return; }
  const price = Math.max(1, Math.round(st.marked[p] * 0.9));
  const buyer = findCashBuyer(w, price, who);
  if (buyer && sell(w, p, buyer.k, buyer.id, price, ev, true)) return;
  const bankIdx = st.lnBank[k];
  hand(w, p, BANKK, bankIdx, ev);
  writeoff(w, k, st.bankIds[bankIdx] || BANK, ev);
  closeLoan(st, k);
  noteComp(st, st.nb[p], price / quality(st, p));
  const floor = st.basePx[st.nb[p]] * 0.35;
  st.px[st.nb[p]] = Math.max(floor, st.px[st.nb[p]] * 0.988);
}
function serviceLoans(w: World): void {
  const st = book(w), s = econ(w), P = s.P;
  const cause = s.rateEv || st.priceEv;
  for (let k = 0; k < st.ln; k++) {
    if (!st.lnOpen[k]) continue;
    const who = st.lnPay[k];
    if (who < 0 || who >= P.n || !P.alive(who)) continue;
    const bal = owed(w, k);
    const bankId = st.bankIds[st.lnBank[k]] || BANK;
    if (bal <= 1) { if (bal > 0) writeoff(w, k, bankId, cause); closeLoan(st, k); continue; }
    const rate = s.policyRate + st.lnSpread[k];
    const left = Math.max(1, st.lnTerm[k] - st.lnAge[k]);
    const interest = Math.round(bal * rate / 12);
    const due = annuity(bal, rate, left);
    const principal = Math.max(0, due - interest);
    let paidI = 0, leftI = interest, leftP = principal;
    for (const i of household(P, who)) {
      const potI = Math.max(0, Math.floor(w.ledger.balance(P.id(i), DEP) - P.incEma[i] * KEEP));
      if (leftI > 0 && potI > 0) { const a = Math.min(leftI, potI); paidI += payInterest(w, bankId, P.id(i), a, cause); leftI -= a; }
    }
    if (paidI + 1 >= interest) {
      for (const i of household(P, who)) {
        const potP = Math.max(0, Math.floor(w.ledger.balance(P.id(i), DEP) - P.incEma[i] * KEEP));
        if (leftP > 0 && potP > 0) { const a = Math.min(leftP, potP); leftP -= payPrincipal(w, bankId, k, P.id(i), a, cause); }
      }
    }
    if (paidI + 1 < interest) st.lnMiss[k] = Math.min(24, st.lnMiss[k] + 1);
    else { st.lnMiss[k] = 0; st.lnAge[k] = Math.min(65535, st.lnAge[k] + 1); }
    if (owed(w, k) <= 1) { if (owed(w, k) > 0) writeoff(w, k, bankId, cause); closeLoan(st, k); continue; }
    const p = st.lnParcel[k];
    const neg = p >= 0 && p < st.n && owed(w, k) > st.marked[p] * 1.01;
    if (st.lnMiss[k] >= (neg ? 2 : MISS_REPO)) repo(w, k, cause);
  }
}
function checkBankRepos(w: World): void {
  const st = book(w), s = econ(w), P = s.P;
  const b = w.state.banking as { mtg?: Uint8Array; lock?: Int32Array; ln?: number; lnPerson?: Int32Array; lnBank?: Uint8Array; lnKind?: Uint8Array; banks?: { id: string }[] } | undefined;
  if (!b?.mtg || !b.lock) return;
  for (let p = 0; p < st.n; p++) {
    if ((st.flag[p] & FROM_BANK) === 0 || st.ownK[p] !== PERSON) continue;
    const i = st.own[p];
    if (i < 0 || i >= b.mtg.length || b.mtg[i] !== 0 || !(b.lock[i] > w.day)) continue;
    let bankIdx = 0;
    if (b.lnPerson && b.lnBank && b.banks) {
      for (let k = (b.ln ?? 0) - 1; k >= 0; k--) if (b.lnPerson[k] === i && b.lnKind![k] === 1) {
        const idx = st.bankIds.indexOf(b.banks[b.lnBank[k]]?.id ?? '');
        if (idx >= 0) bankIdx = idx;
        break;
      }
    }
    const ev = w.events.emit('property.repossess', `${P.name(i)} loses a ${NBHDS[st.nb[p]].name} home the bank took back`, [st.priceEv, s.macroEv], P.id(i));
    if (P.alive(i)) { thought(w, s, i, 240, 'losing a home', ev); P.lastEv[i] = ev; }
    hand(w, p, BANKK, bankIdx, ev);
    st.yRepo++; st.mRepo++;
    noteComp(st, st.nb[p], Math.max(1, st.marked[p]) / quality(st, p));
    st.px[st.nb[p]] = Math.max(st.basePx[st.nb[p]] * 0.35, st.px[st.nb[p]] * 0.988);
  }
}

function collectRent(w: World): void {
  const st = book(w), s = econ(w), P = s.P, cause = st.priceEv, L = w.ledger;
  beginRanked(st);
  try { collectRentAt(w, st, s, P, cause, L); }
  finally { endRanked(); }
}
function collectRentAt(w: World, st: Book, s: ReturnType<typeof econ>, P: ReturnType<typeof econ>['P'], cause: number, L: World['ledger']): void {
  const n = st.n, nP = P.n;
  const kind = st.kind, ownK = st.ownK, tenK = st.tenK, own = st.own, ten = st.ten;
  const rent = st.rent, missR = st.missR, flag = st.flag, hhInc = st.hhInc, nb = st.nb;
  const spouse = P.spouse, slot = P.slot;
  const firmSlot = new Int32Array(s.firms.length);
  firmSlot.fill(-2);
  for (let p = 0; p < n; p++) {
    const tk = tenK[p];
    if (tk === 0) { missR[p] = 0; continue; }
    if (kind[p] === HOME && ownK[p] === PERSON && tk === PERSON) {
      const o = own[p], t = ten[p];
      if (o === t || (t >= 0 && t < nP && spouse[t] === o) || (o >= 0 && o < nP && spouse[o] === t)) { missR[p] = 0; continue; }
    }
    const due = Math.round(rent[p]);
    if (due <= 0) continue;
    let toS = -1;
    const ok = ownK[p];
    if (ok === PERSON) { const o = own[p]; toS = o >= 0 && o < nP ? slot[o] : -1; }
    else { const to = actorOf(w, ok, own[p]); toS = to && L.hasActor(to) ? L.slot(to) : -1; }
    if (toS < 0) continue;
    let fromS = -1;
    if (tk === PERSON) { const t = ten[p]; fromS = t >= 0 && t < nP ? slot[t] : -1; }
    else if (tk === FIRM) {
      const fi = ten[p], f = s.firms[fi];
      if (f) {
        let fs = firmSlot[fi];
        if (fs < -1) { fs = L.hasActor(f.id) ? L.slot(f.id) : -1; firmSlot[fi] = fs; }
        fromS = fs;
      }
    }
    if (fromS < 0 || fromS === toS) continue;
    const a = Math.min(due, Math.floor(L.balS(fromS, DEP)));
    const got = a > 0 && payS(w, s, fromS, toS, a, 'property.rent', cause) ? a : 0;
    if (tk !== PERSON) continue;
    if (got + 1 < due) missR[p] = Math.min(24, missR[p] + 1);
    else missR[p] = 0;
    if (missR[p] < MISS_EVICT || (flag[p] & 2) !== 0) continue;
    const t = ten[p];
    const budget = Math.max(0, hhInc[p]) * 30 * 0.2;
    const alt = pickOpen(st, Math.min(rent[p] * 0.9, budget > 0 ? budget : rent[p] * 0.9), 1);
    if (alt < 0 || alt === p || t < 0 || !P.alive(t)) { flag[p] |= 2; continue; }
    const ev = w.events.emit('property.evict', `${P.name(t)} is evicted in ${NBHDS[nb[p]].name}`, [cause], P.id(t));
    thought(w, s, t, 180, 'being evicted', ev);
    P.lastEv[t] = ev;
    shiftAll(w, p, alt);
    flag[p] |= 2;
  }
}
function leaveHome(w: World): void {
  const st = book(w), P = econ(w).P;
  const cap = Math.max(2, Math.floor(P.n / 2000));
  let moved = 0;
  const ranked = rankedVacant(st);
  const start = st.scan % Math.max(1, P.n);
  for (let step = 0; step < P.n && moved < cap; step++) {
    const i = (start + step) % P.n;
    if (!P.alive(i) || P.spouse[i] >= 0 || i >= st.live.length) continue;
    const age = P.age(w, i);
    if (age < 22 || age > 30) continue;
    const par = P.parent[i];
    if (par < 0 || par >= st.live.length || st.live[par] < 0 || st.live[i] !== st.live[par]) continue;
    if (P.incEma[i] <= 0) continue;
    const budget = P.incEma[i] * 30 * 0.3;
    const dest = pickRanked(st, ranked, budget, 1);
    if (dest < 0) continue;
    setLive(st, P.n, i, dest);
    if (st.tenK[dest] === 0) { st.tenK[dest] = PERSON; st.ten[dest] = i; }
    moved++;
  }
  st.scan = (start + 97) % Math.max(1, P.n);
}
function rentBurden(w: World): void {
  const st = book(w), P = econ(w).P;
  beginRanked(st);
  let moved = 0;
  try {
  for (let p = 0; p < st.n && moved < 8; p++) {
    if (st.kind[p] !== HOME || st.tenK[p] !== PERSON || ownerOccupies(w, p)) continue;
    const inc = st.hhInc[p] * 30;
    if (!(inc > 0) || st.rent[p] <= inc * 0.22) continue;
    const dest = pickOpen(st, st.rent[p] * 0.85, 1);
    if (dest < 0 || dest === p) continue;
    shiftAll(w, p, dest);
    moved++;
  }
  } finally { endRanked(); }
}
function growFamilies(w: World): void {
  const st = book(w), P = econ(w).P;
  ensurePeople(st, P.n);
  beginRanked(st);
  let moved = 0;
  try {
  for (let i = 0; i < P.n && moved < 6; i++) {
    if (!P.alive(i) || i >= st.live.length) continue;
    const p = st.live[i];
    if (p < 0 || st.tenK[p] !== PERSON || st.ten[p] !== i) continue;
    if (P.nkids[i] <= st.nk[i] || st.size[p] >= 2 + P.nkids[i]) { st.nk[i] = P.nkids[i]; continue; }
    const budget = Math.max(st.rent[p], st.hhInc[p] * 30 * 0.25);
    const dest = pickOpen(st, budget, 2 + P.nkids[i]);
    if (dest < 0) continue;
    shiftAll(w, p, dest);
    st.nk[i] = P.nkids[i];
    moved++;
  }
  } finally { endRanked(); }
}

function arrearsNow(st: Book): number {
  let n = 0, bad = 0;
  for (let k = 0; k < st.ln; k++) if (st.lnOpen[k]) { n++; if (st.lnMiss[k] > 0) bad++; }
  return n ? bad / n : 0;
}
/** Adult children take empty homes at a rent they can pay. Marriages free houses faster than new households form. */
function fillVacants(w: World): void {
  const st = book(w), P = econ(w).P;
  const v = vacancyOf(st);
  if (v.rate < 0.065 || v.vac < 1 || st.ownNow < 0.53) return;
  let cap = Math.max(2, Math.floor(P.n / 2000));
  if (v.rate > 0.09) cap = Math.floor(P.n / 400);
  if (v.rate > 0.14) cap = Math.floor(P.n / 200);
  cap = Math.min(cap, v.vac);
  let moved = 0;
  const ranked = rankedVacant(st);
  const start = (st.scan * 3) % Math.max(1, P.n);
  for (let step = 0; step < P.n && moved < cap; step++) {
    const i = (start + step) % P.n;
    if (!P.alive(i) || i >= st.live.length || P.incEma[i] <= 0) continue;
    const age = P.age(w, i);
    if (age < 21 || age > 42) continue;
    const p = st.live[i];
    if (p < 0 || st.tenK[p] !== PERSON) continue;
    const head = st.ten[p];
    if (head === i || P.spouse[head] === i) continue;
    if (P.spouse[i] >= 0 && P.spouse[i] < i) continue;
    const dest = pickRanked(st, ranked, Infinity, 1);
    if (dest < 0) break;
    const budget = Math.round(P.incEma[i] * 30 * 0.3);
    if (st.rent[dest] > budget) st.rent[dest] = Math.max(1, budget);
    setLive(st, P.n, i, dest);
    const sp = P.spouse[i];
    if (sp >= 0 && sp < st.live.length && st.live[sp] === p && st.ten[p] !== sp) setLive(st, P.n, sp, dest);
    for (let c = P.firstKid[i]; c >= 0; c = P.nextSib[c]) {
      if (c < st.live.length && P.alive(c) && st.live[c] === p && P.age(w, c) < 22) setLive(st, P.n, c, dest);
    }
    st.tenK[dest] = PERSON; st.ten[dest] = i; st.missR[dest] = 0;
    moved++;
  }
}
function heatOf(rate: number): number {
  if (rate < 0.03) return 1.05;
  if (rate < 0.045) return 1.02;
  if (rate > 0.09) return 0.95;
  if (rate > 0.07) return 0.98;
  return 1;
}
function dealCap(w: World): number {
  const n = econ(w).P.n, own = book(w).ownNow;
  let d = Math.max(6, Math.floor(n / 2200));
  if (own > 0.67) d = Math.max(2, Math.floor(d / 2));
  if (own > 0.71) d = 1;
  if (own < 0.52) d += 4;
  return d;
}
function collectListings(w: World, heat: number, cap: number): Listing[] {
  const st = book(w);
  const out: Listing[] = [];
  const push = (p: number, disc: number): void => {
    const ask = Math.max(1, Math.round(st.marked[p] * heat * disc));
    out.push({ p, ask, sold: false });
  };
  for (let p = 0; p < st.n; p++) if (st.kind[p] === HOME && st.ownK[p] === BANKK) push(p, 0.9);
  const vac: number[] = [], letOut: number[] = [];
  const start = st.pScan % Math.max(1, st.n);
  for (let step = 0; step < st.n; step++) {
    const p = (start + step) % st.n;
    if (st.kind[p] !== HOME) continue;
    if ((st.flag[p] & FROM_BANK) !== 0 && st.ownK[p] === PERSON) continue;
    if (st.ownK[p] === BANKK) continue;
    if (st.tenK[p] === 0) vac.push(p);
    else if (st.tenK[p] === PERSON && !ownerOccupies(w, p)) letOut.push(p);
  }
  st.pScan = (start + 13) % Math.max(1, st.n);
  for (let i = 0; i < vac.length && i < cap; i++) push(vac[i], 1);
  for (let i = 0; i < letOut.length && i < cap; i++) push(letOut[i], 1);
  return out;
}
function collectBids(w: World, listings: Listing[]): Bid[] {
  const st = book(w), s = econ(w), P = s.P;
  const bids: Bid[] = [];
  if (!listings.length) return bids;
  const cheapestAsk = listings.reduce((m, L) => Math.min(m, L.ask), Infinity);
  const start = st.scan % Math.max(1, P.n);
  const span = Math.min(P.n, Math.max(40, dealCap(w) * 30));
  for (let step = 0; step < span; step++) {
    const i = (start + step) % P.n;
    if (!P.alive(i) || P.age(w, i) < 21 || i >= st.live.length) continue;
    const p = st.live[i];
    if (p < 0 || st.tenK[p] !== PERSON || st.ten[p] !== i || ownerOccupies(w, p)) continue;
    const offer = loanOffer(w, i, cheapestAsk);
    const max = spendable(w, household(P, i)) + offer;
    if (max >= cheapestAsk) bids.push({ k: PERSON, id: i, max, live: true });
  }
  const funds = (w.state.markets as { funds?: { id: string }[] } | undefined)?.funds ?? [];
  for (const f of funds) {
    const cash = Math.floor(w.ledger.balance(f.id, DEP));
    if (cash >= cheapestAsk) bids.push({ k: FUND, id: fundIndex(st, f.id), max: cash, live: false });
  }
  for (const inv of s.investors) {
    const i = +inv.id.slice(2);
    if (i < 0 || i >= P.n || !P.alive(i)) continue;
    const cash = Math.floor(w.ledger.balance(inv.id, DEP) - P.incEma[i] * KEEP);
    if (cash >= cheapestAsk) bids.push({ k: PERSON, id: i, max: cash, live: false });
  }
  bids.sort((a, b) => b.max - a.max || a.id - b.id);
  return bids;
}
function market(w: World): void {
  const st = book(w), s = econ(w);
  const cap = dealCap(w);
  const listings = collectListings(w, heatOf(vacancyOf(st).rate), cap);
  const cause = st.priceEv;
  for (const L of listings) {
    if (L.sold || st.ownK[L.p] !== BANKK) continue;
    const buyer = findCashBuyer(w, L.ask, -1);
    if (buyer && sell(w, L.p, buyer.k, buyer.id, L.ask, cause, true)) L.sold = true;
  }
  for (const L of listings) {
    if (L.sold || st.tenK[L.p] !== PERSON) continue;
    const t = st.ten[L.p];
    const max = spendable(w, household(s.P, t)) + loanOffer(w, t, L.ask);
    if (max >= L.ask && sell(w, L.p, PERSON, t, L.ask, cause, false)) L.sold = true;
  }
  const bids = collectBids(w, listings.filter((L) => !L.sold));
  const used = new Set<string>();
  let done = 0;
  for (const bid of bids) {
    if (done >= cap) break;
    const key = bid.k + ':' + bid.id;
    if (used.has(key)) continue;
    let best = -1;
    for (let i = 0; i < listings.length; i++) {
      const L = listings[i];
      if (L.sold || bid.max < L.ask) continue;
      if (bid.live && st.tenK[L.p] !== 0) continue;
      if (!bid.live && st.tenK[L.p] === 0) {
        const yld = st.rent[L.p] * 12 / L.ask;
        if (yld < s.policyRate + 0.005 && st.ownK[L.p] !== BANKK) continue;
      }
      if (best < 0 || L.ask < listings[best].ask) best = i;
    }
    if (best < 0) continue;
    if (sell(w, listings[best].p, bid.k, bid.id, listings[best].ask, cause, bid.k !== PERSON)) {
      listings[best].sold = true; used.add(key); done++;
    }
  }
}
function payBuilders(w: World, from: string, cents: number, cause: number): boolean {
  const firms = econ(w).firms.filter((f) => f.good === 'HOUSING' && f.eff > 0);
  if (!firms.length || cents <= 0 || Math.floor(w.ledger.balance(from, DEP)) < cents) return false;
  let best = firms[0];
  for (const f of firms) if (f.eff > best.eff) best = f;
  return pay(w, from, best.id, cents, 'housing.buy', cause);
}
function build(w: World, cause: number): void {
  const st = book(w), s = econ(w);
  const v = vacancyOf(st);
  if (v.homes < 1 || v.rate > 0.04 || s.unemployment > 0.11 || s.shocks.length > 0) return;
  const homes = new Int32Array(NBHDS.length), vac = new Int32Array(NBHDS.length);
  for (let p = 0; p < st.n; p++) if (st.kind[p] === HOME) { homes[st.nb[p]]++; if (st.tenK[p] === 0) vac[st.nb[p]]++; }
  let nb = 0, best = Infinity;
  for (let k = 0; k < NBHDS.length; k++) if (homes[k] > 0) {
    const r = vac[k] / homes[k];
    if (r < best) { best = r; nb = k; }
  }
  const n = Math.max(1, Math.floor(s.P.n / 10000));
  for (let i = 0; i < n; i++) {
    const size = 3, cond = 94;
    const q = size * (0.55 + 0.45 * cond / 100);
    const price = Math.max(1, Math.round(st.px[nb] * q));
    const buyer = findCashBuyer(w, price, -1);
    if (!buyer) return;
    const id = actorOf(w, buyer.k, buyer.id);
    if (!id || !payBuilders(w, id, price, cause)) return;
    const p = addParcel(st, nb, HOME, size, cond, buyer.k, buyer.id, 0, -1);
    setMarked(w, p, price, cause);
    st.lastPx[p] = price;
    st.rent[p] = Math.max(1, Math.round(price * yieldOf(s.policyRate) / 12));
    st.rentY[p] = st.rent[p];
  }
}
function pullPrices(w: World): void {
  const st = book(w), s = econ(w);
  const inc = Math.max(0.25, meanIncome(w) / Math.max(1, st.inc0));
  const u0 = st.rate0 + 0.04, u = Math.max(0.01, s.policyRate + 0.04);
  for (let nb = 0; nb < NBHDS.length; nb++) {
    const start = st.px[nb];
    let fair = st.basePx[nb] * inc * (u0 / u);
    if (st.mRepo > 0) fair *= Math.max(0.9, 1 - 0.012 * st.mRepo);
    let target = fair;
    if (st.saleN[nb] > 0) target = fair * 0.6 + (st.saleSum[nb] / st.saleN[nb]) * 0.4;
    let next = start * 0.88 + target * 0.12;
    next = Math.min(start * 1.05, Math.max(start * 0.93, next));
    next = Math.min(st.basePx[nb] * 4, Math.max(st.basePx[nb] * 0.35, next));
    st.px[nb] = next; st.saleSum[nb] = 0; st.saleN[nb] = 0;
  }
}
function revalue(w: World, cause: number): void {
  const st = book(w), yld = yieldOf(econ(w).policyRate);
  const rIdx = rentIndex(st) / 100;
  for (let p = 0; p < st.n; p++) {
    if (st.kind[p] === COMM) {
      st.rent[p] = Math.max(1, Math.round(st.rentY[p] * rIdx));
      setMarked(w, p, st.rent[p] * 12 / yld, cause);
    } else setMarked(w, p, st.px[st.nb[p]] * quality(st, p), cause);
  }
}
function updateRents(w: World): void {
  const st = book(w);
  const inc = Math.max(0.6, meanIncome(w) / Math.max(1, st.inc0));
  const homes = new Int32Array(NBHDS.length), vac = new Int32Array(NBHDS.length);
  for (let p = 0; p < st.n; p++) if (st.kind[p] === HOME) { homes[st.nb[p]]++; if (st.tenK[p] === 0) vac[st.nb[p]]++; }
  for (let p = 0; p < st.n; p++) {
    if (st.kind[p] !== HOME) continue;
    const nb = st.nb[p];
    const vacR = homes[nb] > 0 ? vac[nb] / homes[nb] : 0;
    let target = st.rentBase * quality(st, p) * inc;
    target *= 1 + clamp((0.06 - vacR) * 1.4, -0.25, 0.12);
    const prev = Math.max(1, st.rent[p]);
    let next = prev * 0.8 + target * 0.2;
    next = Math.min(prev * 1.02, Math.max(prev * 0.97, next));
    st.rent[p] = Math.max(1, Math.round(next));
  }
}
function rentRises(w: World): void {
  const st = book(w), s = econ(w), P = s.P;
  for (let p = 0; p < st.n; p++) {
    if (st.kind[p] !== HOME || st.tenK[p] !== PERSON || ownerOccupies(w, p)) continue;
    const prev = st.rentY[p];
    if (prev > 0 && st.rent[p] > prev * 1.12) {
      const t = st.ten[p];
      if (t >= 0 && t < P.n && P.alive(t)) thought(w, s, t, 120, 'a big rent rise', st.priceEv);
    }
    st.rentY[p] = st.rent[p];
  }
}
function audit(w: World): void {
  const st = book(w);
  const sum = new Map<string, number>();
  for (let p = 0; p < st.n; p++) {
    const id = ownerActor(w, p);
    if (!id) continue;
    sum.set(id, (sum.get(id) ?? 0) + Math.round(st.marked[p]));
  }
  for (const [id, v] of w.ledger.holders(PROP)) {
    const want = sum.get(id) ?? 0;
    if (Math.abs(Math.round(v) - want) > 2) throw new Error(`property mark ${id}: ledger ${v} != parcels ${want}`);
    sum.delete(id);
  }
  for (const [id, v] of sum) if (Math.abs(v) > 2) throw new Error(`property mark ${id}: parcels ${v} with no holding`);
}

function headOf(w: World, i: number, depth: number): number {
  const P = econ(w).P;
  if (depth > 8 || i < 0 || !P.alive(i)) return -1;
  const sp = P.spouse[i];
  if (sp >= 0 && sp < i && P.alive(sp)) return headOf(w, sp, depth + 1);
  if (P.age(w, i) < 22) {
    const par = P.parent[i];
    if (par >= 0 && P.alive(par)) return headOf(w, par, depth + 1);
  }
  return i;
}
function pickNb(rank: number, i: number): number {
  let sum = 0;
  const wts = NBHDS.map((nb) => nb.size * Math.pow(nb.desir, 0.35 + rank * 1.4));
  for (const x of wts) sum += x;
  let h = mix(i, 3) * sum;
  for (let k = 0; k < NBHDS.length; k++) { h -= wts[k]; if (h <= 0) return k; }
  return NBHDS.length - 1;
}
function freshBook(nP: number, nParcel: number): Book {
  const nB = NBHDS.length, cap = Math.max(nParcel, 16), lnCap = 256;
  const mtg = new Int32Array(cap); mtg.fill(-1);
  const ten = new Int32Array(cap); ten.fill(-1);
  const own = new Int32Array(cap); own.fill(-1);
  const live = new Int32Array(Math.max(16, nP)); live.fill(-1);
  return {
    n: 0, cap, nb: new Uint8Array(cap), kind: new Uint8Array(cap), size: new Uint16Array(cap), cond: new Uint8Array(cap),
    ownK: new Uint8Array(cap), own, tenK: new Uint8Array(cap), ten, rent: new Float64Array(cap), lastPx: new Float64Array(cap),
    marked: new Float64Array(cap), mtg, missR: new Uint8Array(cap), flag: new Uint8Array(cap), rentY: new Float64Array(cap),
    hhInc: new Float64Array(cap), live, nk: new Uint8Array(Math.max(16, nP)), seen: 0, scan: 0, pScan: 0,
    ln: 0, lnCap, lnParcel: new Int32Array(lnCap), lnPay: new Int32Array(lnCap), lnBank: new Uint8Array(lnCap),
    lnSpread: new Float64Array(lnCap), lnMiss: new Uint8Array(lnCap), lnOpen: new Uint8Array(lnCap),
    lnAge: new Uint16Array(lnCap), lnTerm: new Uint16Array(lnCap),
    px: new Float64Array(nB), basePx: new Float64Array(nB), saleSum: new Float64Array(nB), saleN: new Uint16Array(nB),
    rentBase: 1, inc0: 1, rate0: 0.03, ownNow: 0, priceEv: 0, lastSaleEv: -1, mSale: 0, mRepo: 0, yRepo: 0, arrPeak: 0,
    bankIds: [], fundIds: [],
  };
}

/** Banking built a house and collected the price. Record the parcel; do not charge again. */
export function noteBuiltHome(w: World, person: number, paid: number, cause: number): void {
  const st = w.state.property as Book | undefined;
  if (!st || !(paid > 0)) return;
  const P = econ(w).P;
  if (person < 0 || person >= P.n || !P.alive(person)) return;
  ensurePeople(st, P.n);
  const price = Math.round(paid);
  const inc = Math.max(P.incEma[person], 1);
  const rank = clamp(inc / (meanIncome(w) * 2), 0, 1);
  const nb = pickNb(rank, person);
  const cond = 92;
  const factor = 0.55 + 0.45 * cond / 100;
  const size = clamp(Math.round((st.px[nb] > 0 ? price / st.px[nb] : 3) / factor), 1, 12);
  const p = addParcel(st, nb, HOME, size, cond, PERSON, person, 0, -1);
  st.flag[p] |= FROM_BANK;
  setMarked(w, p, price, cause);
  st.lastPx[p] = price;
  st.rent[p] = Math.max(1, Math.round(price * yieldOf(econ(w).policyRate) / 12));
  st.rentY[p] = st.rent[p];
  const cur = st.live[person];
  const renting = cur >= 0 && st.tenK[cur] === PERSON && st.ten[cur] === person && !ownerOccupies(w, cur);
  if (renting) { shiftAll(w, cur, p); st.tenK[p] = PERSON; st.ten[p] = person; }
  else if (cur < 0) { setLive(st, P.n, person, p); st.tenK[p] = PERSON; st.ten[p] = person; }
}

export const property: Module = {
  id: 'property',

  init(w) {
    const s = econ(w), P = s.P, L = w.ledger;
    L.addActor(LAND, 'land');
    L.define({ id: PROP, kind: 'claim', issuer: LAND });
    const st = freshBook(P.n, Math.max(2048, P.n));
    for (const b of banks(w)) st.bankIds.push(b.id);
    w.state.property = st;

    const of = new Int32Array(P.n); of.fill(-1);
    for (let i = 0; i < P.n; i++) if (P.alive(i)) of[i] = headOf(w, i, 0);
    const heads: { head: number; inc: number }[] = [];
    for (let i = 0; i < P.n; i++) if (of[i] === i) {
      let inc = P.incEma[i];
      const sp = P.spouse[i];
      if (sp >= 0 && of[sp] === i) inc += P.incEma[sp];
      heads.push({ head: i, inc });
    }
    heads.sort((a, b) => a.inc - b.inc || a.head - b.head);
    const raw = NBHDS.map((nb) => nb.desir / (1 + 0.06 * nb.dist));
    const chosen: number[] = [];
    for (let i = 0; i < heads.length; i++) {
      const rank = heads.length <= 1 ? 1 : i / (heads.length - 1);
      chosen.push(pickNb(rank, heads[i].head));
    }
    let lsum = 0;
    for (const nb of chosen) lsum += raw[nb];
    const scale = lsum > 0 ? lsum / chosen.length : 1;
    const loc = raw.map((x) => x / scale);

    const at = new Int32Array(P.n); at.fill(-1);
    const parcels: number[] = [];
    for (let i = 0; i < heads.length; i++) {
      const rank = heads.length <= 1 ? 1 : i / (heads.length - 1);
      const nb = chosen[i];
      const size = 2 + Math.round(rank * 3);
      const cond = 70 + Math.floor(mix(heads[i].head, 9) * 25);
      const p = addParcel(st, nb, HOME, size, cond, PERSON, heads[i].head, PERSON, heads[i].head);
      parcels.push(p); at[heads[i].head] = p;
    }
    const yld = yieldOf(s.policyRate);
    for (let nb = 0; nb < NBHDS.length; nb++) {
      const incs: number[] = [], quals: number[] = [];
      for (let i = 0; i < heads.length; i++) if (chosen[i] === nb && heads[i].inc > 0) {
        incs.push(heads[i].inc); quals.push(quality(st, parcels[i]));
      }
      incs.sort((a, b) => a - b); quals.sort((a, b) => a - b);
      const mid = (xs: number[], fallback: number): number => xs.length ? xs[xs.length >> 1] : fallback;
      const medI = mid(incs, meanIncome(w));
      const medQ = Math.max(0.4, mid(quals, 3));
      st.px[nb] = Math.max(1, medI * 360 * YEARS * loc[nb] / medQ);
    }
    const lords: number[] = [];
    const lordN = Math.max(10, Math.floor(heads.length * 0.08));
    for (let i = heads.length - 1; i >= 0 && lords.length < lordN; i--) if (i / Math.max(1, heads.length - 1) >= 0.42) lords.push(heads[i].head);
    if (!lords.length && heads.length) lords.push(heads[heads.length - 1].head);
    let rental = 0;
    for (let i = 0; i < heads.length; i++) {
      const rank = heads.length <= 1 ? 1 : i / (heads.length - 1);
      const p = parcels[i];
      if (rank < 0.42 && lords.length) { st.own[p] = lords[rental++ % lords.length]; }
      const value = Math.max(1, Math.round(st.px[st.nb[p]] * quality(st, p)));
      setMarked(w, p, value, w.genesis);
      st.lastPx[p] = value;
      st.rent[p] = Math.max(1, Math.round(value * yld / 12));
      st.rentY[p] = st.rent[p];
    }
    const extra = Math.round(heads.length * 0.06);
    for (let i = 0; i < extra; i++) {
      const nb = pickNb(0.35, 1000 + i);
      const p = addParcel(st, nb, HOME, 3, 78, PERSON, lords[i % lords.length], 0, -1);
      const value = Math.max(1, Math.round(st.px[nb] * quality(st, p)));
      setMarked(w, p, value, w.genesis);
      st.lastPx[p] = value; st.rent[p] = Math.max(1, Math.round(value * yld / 12)); st.rentY[p] = st.rent[p];
    }
    const basin = Math.max(0, NBHDS.findIndex((n) => n.id === 'INDUSTRIAL_BASIN'));
    const mile = Math.max(0, NBHDS.findIndex((n) => n.id === 'FINANCIAL_MILE'));
    for (const f of s.firms) {
      const nb = f.sector === 'FINANCE' || f.sector === 'MEDIA' ? mile : basin;
      const rent = Math.max(1, Math.round(0.008 * f.eff * s.wage * 30));
      const owner = lords.length ? lords[f.idx % lords.length] : 0;
      const p = addParcel(st, nb, COMM, Math.max(4, Math.round(f.workers / 10)), 80, PERSON, owner, FIRM, f.idx);
      st.rent[p] = rent; st.rentY[p] = rent;
      setMarked(w, p, Math.round(rent * 12 / yld), w.genesis);
      st.lastPx[p] = Math.round(st.marked[p]);
    }
    ensurePeople(st, P.n);
    for (let i = 0; i < P.n; i++) {
      st.nk[i] = P.nkids[i];
      if (of[i] >= 0 && at[of[i]] >= 0) st.live[i] = at[of[i]];
    }
    st.basePx.set(st.px);
    let rs = 0, rn = 0;
    for (let p = 0; p < st.n; p++) if (st.kind[p] === HOME && st.rent[p] > 0) { rs += st.rent[p] / quality(st, p); rn++; }
    st.rentBase = rn ? rs / rn : 1;
    st.inc0 = meanIncome(w);
    st.rate0 = s.policyRate;
    st.ownNow = measureOwn(w);
    st.seen = P.n;
    const v = vacancyOf(st);
    st.priceEv = w.events.emit('property.open', `${v.homes} dwellings and ${s.firms.length} commercial buildings across ${NBHDS.length} neighbourhoods; ${(st.ownNow * 100).toFixed(0)}% of households own`, [w.genesis]);
  },

  dayClose(w) {
    const st = book(w), P = econ(w).P;
    if (P.n !== st.seen) shelter(w);
    if (w.day > 0 && w.day % DAYS_PER_YEAR === 0) {
      for (let p = 0; p < st.n; p++) st.cond[p] = Math.max(45, st.cond[p] - 1);
      inherit(w); cohabit(w); shelter(w);
    }
  },

  monthEnd(w) {
    const st = book(w), s = econ(w);
    st.ownNow = measureOwn(w);
    inherit(w); cohabit(w); shelter(w);
    fillIncome(w);
    serviceLoans(w);
    checkBankRepos(w);
    collectRent(w);
    leaveHome(w); rentBurden(w); growFamilies(w); fillVacants(w);
    st.arrPeak = Math.max(st.arrPeak, arrearsNow(st));
    market(w);
    build(w, st.priceEv);
    const repos = st.mRepo;
    pullPrices(w);
    updateRents(w);
    revalue(w, st.priceEv);
    const yearEnd = (w.day + 1) % DAYS_PER_YEAR === 0;
    if (yearEnd) rentRises(w);
    const causes = [st.priceEv, s.rateEv, s.macroEv];
    if (st.lastSaleEv >= 0) causes.push(st.lastSaleEv);
    const px = priceIndex(st), rent = rentIndex(st);
    st.priceEv = w.events.emit('property.price', `house prices ${px.toFixed(1)}, rents ${rent.toFixed(1)}, ${st.mSale} sales, ${repos} repossessions`, causes);
    st.mSale = 0; st.mRepo = 0;
  },

  stats(w) {
    audit(w);
    const st = book(w);
    const v = vacancyOf(st);
    const out = {
      housePx: +priceIndex(st).toFixed(1),
      rentPx: +rentIndex(st).toFixed(1),
      own_pct: +(measureOwn(w) * 100).toFixed(1),
      vac_pct: +(v.rate * 100).toFixed(1),
      arr_pct: +(Math.max(st.arrPeak, arrearsNow(st)) * 100).toFixed(2),
      repos: st.yRepo,
    };
    st.yRepo = 0; st.arrPeak = 0;
    return out;
  },
};
