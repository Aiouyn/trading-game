// Insurance. Aegis and Halcyon sell cover on plants and houses. A hazard is an outside
// shock: it destroys machinery (through banking), goods, and parcel condition (through
// property), and it can hurt the people on the spot. Premiums are the insurers' own
// loss history. Float that would otherwise be dividended sits in treasury bonds.
// The largest layer is ceded to the rest of the world when that book is open.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Module, type World } from '../../kernel/index.ts';
import { parseRaws, RawReader } from '../../kernel/content.ts';
import { GOODS } from '../economy/content.ts';
import { BANK, CAPITAL, DEP, type EconState, type Firm, closeFirm, pay } from '../economy/index.ts';
import { ALIVE, leaveJob, succession, thought } from '../economy/people.ts';
import { damageCapital } from '../banking/index.ts';
import { damageCondition, repairCondition } from '../property/index.ts';
import { PLAYER } from '../player/index.ts';

const LOT = 16_000; // one treasury bond, in cents of face; the same lot the bond book trades
const WORLD = 'fxworld';
const HOME = 1, FIRM_K = 2, PERSON = 1;
const POL_FIRM = 1, POL_HOME = 2;
const IN_FORCE = 1, ARREARS = 2;

type Where = 'firm' | 'homes' | 'port';
interface Hazard {
  id: string; name: string; chance: number; kind: string; where: Where;
  places: string[]; sector: string; good: string;
  machinery: number; stock: number; fabric: number; homes: number;
  hurt: number; kill: number; text: string; day: number;
  uninsured: boolean; fail: boolean;
}
interface BondRow { id: string; last: number; tenor: string; matureDay: number; faceLeft: number }
interface BondBook { bonds: BondRow[]; funds: { id: string }[] }
interface Prop {
  n: number; nb: Uint8Array; kind: Uint8Array; cond: Uint8Array;
  ownK: Uint8Array; own: Int32Array; tenK: Uint8Array; ten: Int32Array;
  mtg: Int32Array; marked: Float64Array;
}

interface Book {
  insId: string[];
  rate: number;
  loss: number;
  disasters: number;
  insured: number;
  uninsured: number;
  premiums: number;
  claims: number;
  failYear: number;
  pend: number;
  pendEv: number;
  root: number;
  lastLoss: number;
  scare: number;
  low: number;
  floor: number[];
  n: number;
  cap: number;
  live: Uint8Array;
  polKind: Uint8Array;
  ref: Int32Array;
  ins: Uint8Array;
  cover: Float64Array;
  prem: Float64Array;
  miss: Uint8Array;
  firmPol: Int32Array;
  homePol: Int32Array;
}

const OPEN_RATE = 0.0135;
const hazFile = fileURLToPath(new URL('../../content/hazards.txt', import.meta.url));
const propFile = fileURLToPath(new URL('../../content/property.txt', import.meta.url));
const NB: string[] = parseRaws(readFileSync(propFile, 'utf8'), 'property.txt').filter((r) => r.type === 'NEIGHBOURHOOD').map((r) => r.id);

function loadHazards(): Hazard[] {
  const raws = parseRaws(readFileSync(hazFile, 'utf8'), 'hazards.txt').filter((r) => r.type === 'HAZARD');
  if (!raws.length) throw new Error('hazards.txt: no hazards');
  return raws.map((raw) => {
    const r = new RawReader(raw);
    const where = r.str('WHERE') as Where;
    if (where !== 'firm' && where !== 'homes' && where !== 'port') throw new Error(`${r.where()}: WHERE must be firm, homes or port`);
    const kind = r.str('KIND');
    if (kind !== 'fire' && kind !== 'flood' && kind !== 'storm' && kind !== 'collision') throw new Error(`${r.where()}: unknown KIND ${kind}`);
    let h = 0;
    for (let i = 0; i < raw.id.length; i++) h = (Math.imul(h, 33) + raw.id.charCodeAt(i)) >>> 0;
    return {
      id: raw.id, name: r.str('NAME'), chance: r.num('CHANCE'), kind, where,
      places: r.all('PLACE').map((a) => a[0]).filter((a) => a),
      sector: r.str('SECTOR', ''), good: r.str('GOOD', ''),
      machinery: r.num('MACHINERY', 0), stock: r.num('STOCK', 0), fabric: r.num('FABRIC', 0), homes: r.num('HOMES', 0),
      hurt: r.num('HURT', 0), kill: r.num('KILL', 0), text: r.str('TEXT'),
      // A plant that fails is wound up at the next month-end. Day 340 is the last month, so that
      // record is written after the month's other business.
      day: r.has('FAIL') ? 340 : 20 + (h % 300),
      uninsured: r.has('UNINSURED'), fail: r.has('FAIL'),
    };
  });
}
const HAZARDS = loadHazards();

const econ = (w: World): EconState => w.state.economy as EconState;
const book = (w: World): Book => w.state.insurance as Book;
const prop = (w: World): Prop | undefined => w.state.property as Prop | undefined;
const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));
const dol = (c: number): string => (Math.max(0, c) / 100).toFixed(0);

function rollDayHit(day: number, parcel: number, rate: number): boolean {
  if (!(rate > 0)) return false;
  let x = Math.imul(parcel + 1, 0x9e3779b1) ^ Math.imul((day + 1) | 0, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 16), 0xc2b2ae35);
  return ((x >>> 0) / 4294967296) < rate;
}

function bondBook(w: World): BondBook | undefined {
  const st = w.state.bonds as { bonds?: BondRow[]; funds?: { id: string }[] } | undefined;
  if (!st?.bonds?.length) return undefined;
  return { bonds: st.bonds, funds: st.funds ?? [] };
}
function insurerFirm(w: World, id: string): Firm | undefined {
  const f = econ(w).firms.find((x) => x.id === id);
  return f && !f.closed ? f : undefined;
}
function worth(w: World, id: string): number {
  let n = Math.floor(w.ledger.balance(id, DEP));
  const bb = bondBook(w);
  if (!bb) return n;
  for (const b of bb.bonds) {
    const face = w.ledger.balance(id, b.id);
    if (face > 0 && b.last > 0) n += Math.round(face / LOT * b.last);
  }
  return n;
}
function wageBuffer(w: World, f: Firm): number {
  return Math.ceil(f.eff * econ(w).wage * 30);
}
function capitalValue(w: World, f: Firm): number {
  const units = w.ledger.balance(f.id, CAPITAL);
  return units * 360 * econ(w).wage / Math.max(0.01, GOODS[f.good].prod);
}
function causeOf(st: Book): number {
  return st.lastLoss >= 0 ? st.lastLoss : st.root;
}

function growPol(st: Book): void {
  const n = st.cap * 2;
  const u8 = (a: Uint8Array): Uint8Array => { const b = new Uint8Array(n); b.set(a); return b; };
  const i32 = (a: Int32Array): Int32Array => { const b = new Int32Array(n); b.set(a); return b; };
  const f64 = (a: Float64Array): Float64Array => { const b = new Float64Array(n); b.set(a); return b; };
  st.live = u8(st.live); st.polKind = u8(st.polKind); st.ref = i32(st.ref); st.ins = u8(st.ins);
  st.cover = f64(st.cover); st.prem = f64(st.prem); st.miss = u8(st.miss); st.cap = n;
}
function growFirms(st: Book, n: number): void {
  if (st.firmPol.length >= n) return;
  const m = Math.max(n, st.firmPol.length * 2, 16);
  const a = new Int32Array(m); a.fill(-1); a.set(st.firmPol); st.firmPol = a;
}
function growHomes(st: Book, n: number): void {
  if (st.homePol.length >= n) return;
  const m = Math.max(n, st.homePol.length * 2, 16);
  const a = new Int32Array(m); a.fill(-1); a.set(st.homePol); st.homePol = a;
}
function addPol(st: Book, kind: number, ref: number, ins: number, cover: number): number {
  if (st.n >= st.cap) growPol(st);
  const k = st.n++;
  st.live[k] = IN_FORCE; st.polKind[k] = kind; st.ref[k] = ref; st.ins[k] = ins;
  st.cover[k] = cover; st.prem[k] = premiumOf(st, kind, cover); st.miss[k] = 0;
  return k;
}

function tilt(n: number): number {
  let x = Math.imul(n + 1, 0x9e3779b1);
  x = Math.imul(x ^ (x >>> 16), 0xc2b2ae35);
  return (x >>> 0) / 4294967296;
}
// After a big loss people buy. After a premium jump the reluctant ones drop off.
// The floor stays above the uptake the book has to keep.
function appetite(st: Book, home: boolean): number {
  // 0 at the opening rate, 1 when premiums have doubled.
  const dear = Math.max(0, st.rate / OPEN_RATE - 1);
  if (home) return clamp(0.96 + 0.1 * st.scare - dear * 0.08, 0.9, 1);
  return clamp(0.78 + 0.35 * st.scare - dear * 0.28, 0.62, 1);
}
function wantsFirm(w: World, f: Firm): boolean {
  if (f.closed || f.good === 'INSURANCE' || f.good === 'BANKING') return false;
  return tilt(f.idx) < appetite(book(w), false);
}
function homeWants(w: World, st: Prop, p: number): boolean {
  // A mortgage is not written on a house with no cover. A premium jump still
  // shakes the most reluctant borrowers off.
  if (!(st.kind[p] === HOME && st.mtg[p] >= 0 && st.ownK[p] === PERSON && st.own[p] >= 0)) return false;
  return tilt(p + 100003) < appetite(book(w), true);
}
function ownerId(w: World, p: number): string {
  const st = prop(w);
  if (!st || p < 0 || p >= st.n) return '';
  const s = econ(w);
  if (st.ownK[p] === PERSON) {
    const i = st.own[p];
    return i >= 0 && i < s.P.n ? s.P.id(i) : '';
  }
  if (st.ownK[p] === FIRM_K) return s.firms[st.own[p]]?.id ?? '';
  return '';
}
function pickInsurer(w: World, n: number): number {
  const st = book(w);
  if (!st.insId.length) return -1;
  for (let k = 0; k < st.insId.length; k++) {
    const i = (n + k) % st.insId.length;
    if (insurerFirm(w, st.insId[i])) return i;
  }
  return -1;
}
function firmCover(w: World, f: Firm): number {
  // Most of the plant, plus the stock a fire or a flood actually takes.
  const plant = capitalValue(w, f);
  let stock = 0;
  if (!GOODS[f.good].perishable) stock = Math.round(w.ledger.balance(f.id, 'good:' + f.good) * Math.max(0, f.price));
  return Math.max(0, Math.round(plant * 0.9 + Math.min(stock, plant * 0.45)));
}
function homeCover(w: World, p: number, ins: string): number {
  const st = prop(w);
  const marked = st ? Math.round(st.marked[p]) : 0;
  const cap = Math.max(marked, worth(w, ins) * 0.35);
  return Math.max(0, Math.round(Math.min(marked * 0.85, cap)));
}
function premiumOf(st: Book, kind: number, cover: number): number {
  // A house is a smaller, steadier risk than a plant, so the rate on it is lighter.
  const weight = kind === POL_HOME ? 0.12 : 1;
  return Math.max(1, Math.round(cover * st.rate * weight));
}

function bindFirms(w: World): void {
  const st = book(w), s = econ(w);
  growFirms(st, s.firms.length);
  for (const f of s.firms) {
    let have = f.idx < st.firmPol.length ? st.firmPol[f.idx] : -1;
    if (have >= 0 && st.live[have] === 0) { st.firmPol[f.idx] = -1; have = -1; }
    if (have >= 0 && (f.closed || !wantsFirm(w, f))) {
      st.live[have] = 0; st.firmPol[f.idx] = -1; continue;
    }
    if (!wantsFirm(w, f) || have >= 0) continue;
    const ins = pickInsurer(w, f.idx);
    if (ins < 0) continue;
    const cover = firmCover(w, f);
    if (cover < 1000) continue;
    st.firmPol[f.idx] = addPol(st, POL_FIRM, f.idx, ins, cover);
  }
}
function bindHomes(w: World): void {
  const props = prop(w);
  if (!props) return;
  const st = book(w);
  growHomes(st, props.n);
  for (let p = 0; p < props.n; p++) {
    let have = st.homePol[p];
    if (have >= 0 && st.live[have] === 0) { st.homePol[p] = -1; have = -1; }
    const want = homeWants(w, props, p);
    if (have >= 0 && !want) { st.live[have] = 0; st.homePol[p] = -1; continue; }
    if (!want || have >= 0) continue;
    const ins = pickInsurer(w, p);
    if (ins < 0) continue;
    const cover = homeCover(w, p, st.insId[ins]);
    if (cover < 500) continue;
    st.homePol[p] = addPol(st, POL_HOME, p, ins, cover);
  }
}
function refreshCovers(w: World): void {
  const st = book(w), s = econ(w);
  for (let k = 0; k < st.n; k++) {
    if (!st.live[k]) continue;
    const id = st.insId[st.ins[k]];
    if (!insurerFirm(w, id)) { st.live[k] = 0; continue; }
    let cover = 0;
    if (st.polKind[k] === POL_FIRM) {
      const f = s.firms[st.ref[k]];
      if (!f || f.closed) {
        st.live[k] = 0;
        if (f && f.idx < st.firmPol.length) st.firmPol[f.idx] = -1;
        continue;
      }
      cover = firmCover(w, f);
    } else {
      const props = prop(w);
      if (!props || st.ref[k] >= props.n) { st.live[k] = 0; continue; }
      cover = homeCover(w, st.ref[k], id);
    }
    st.cover[k] = cover;
    st.prem[k] = premiumOf(st, st.polKind[k], cover);
  }
}

function notABuyer(id: string, seller: string): boolean {
  return id === seller || id === 'gov' || id === 'cb' || id === 'clearing' || id.startsWith('fx');
}
function buyBonds(w: World, id: string, budget: number, cause: number): number {
  const bb = bondBook(w);
  if (!bb || budget < 1000) return 0;
  const live = (b: BondRow): boolean => b.last > 0 && b.matureDay > w.day && b.faceLeft >= LOT;
  const rows = bb.bonds.filter(live).sort((a, b) => (a.tenor === '2y' ? 0 : 1) - (b.tenor === '2y' ? 0 : 1) || b.faceLeft - a.faceLeft);
  for (const row of rows) {
    let seller = '', held = 0, bankHeld = 0;
    for (const [who, face] of w.ledger.holders(row.id)) {
      if (notABuyer(who, id) || book(w).insId.includes(who)) continue;
      if (who === BANK && face > bankHeld) bankHeld = face;
      if (face > held) { seller = who; held = face; }
    }
    if (bankHeld >= LOT) { seller = BANK; held = bankHeld; }
    const keep = seller === BANK ? 0 : 1;
    const lots = Math.min(Math.floor(budget / row.last), Math.floor(held / LOT) - keep, 4000);
    if (lots < 1 || !seller) continue;
    const qty = lots * LOT;
    const cost = Math.round(lots * row.last);
    // The deposit bank is the warehouse of the issue. Paying it extinguishes deposits and
    // takes the bonds, the same swap as buying a treasury from your own bank.
    if (seller === BANK) {
      if (!w.ledger.redeem(DEP, id, cost, 'ins.invest', cause)) continue;
      if (!w.ledger.move(row.id, seller, id, qty, 'ins.invest', cause)) {
        w.ledger.issue(DEP, id, cost, 'ins.invest', cause);
        continue;
      }
      return cost;
    }
    if (!pay(w, id, seller, cost, 'ins.invest', cause)) continue;
    if (!w.ledger.move(row.id, seller, id, qty, 'ins.invest', cause)) {
      pay(w, seller, id, cost, 'ins.invest', cause);
      continue;
    }
    return cost;
  }
  return 0;
}
function sellBonds(w: World, id: string, row: BondRow, lots: number, cause: number): number {
  const bb = bondBook(w);
  const qty = lots * LOT;
  const price = Math.round(lots * row.last);
  if (!(price > 0)) return 0;
  let buyer = '', cash = 0;
  if (bb) for (const f of bb.funds) {
    const c = Math.floor(w.ledger.balance(f.id, DEP));
    if (c > cash) { cash = c; buyer = f.id; }
  }
  const afford = Math.floor(cash / row.last);
  const n = Math.min(lots, afford);
  if (n >= 1 && buyer) {
    const q = n * LOT, p = Math.round(n * row.last);
    if (pay(w, buyer, id, p, 'ins.sell', cause)) {
      if (w.ledger.move(row.id, id, buyer, q, 'ins.sell', cause)) return p;
      pay(w, id, buyer, p, 'ins.sell', cause);
    }
  }
  if (!w.ledger.actors.has(BANK)) return 0;
  w.ledger.issue(DEP, id, price, 'ins.sell', cause);
  if (!w.ledger.move(row.id, id, BANK, qty, 'ins.sell', cause)) {
    w.ledger.redeem(DEP, id, price, 'ins.sell', cause);
    return 0;
  }
  return price;
}
function raiseCash(w: World, id: string, need: number, cause: number): void {
  const bb = bondBook(w);
  if (!bb) return;
  for (let guard = 0; guard < 8 && Math.floor(w.ledger.balance(id, DEP)) < need; guard++) {
    let sold = 0;
    for (const row of bb.bonds) {
      if (!(row.last > 0)) continue;
      const lotsHeld = Math.floor(w.ledger.balance(id, row.id) / LOT);
      if (lotsHeld < 1) continue;
      const short = need - Math.floor(w.ledger.balance(id, DEP));
      const want = Math.min(lotsHeld, Math.max(1, Math.ceil(short / row.last)));
      sold += sellBonds(w, id, row, want, cause);
      if (Math.floor(w.ledger.balance(id, DEP)) >= need) break;
    }
    if (sold <= 0) break;
  }
}
function investFloat(w: World, cause: number): void {
  const st = book(w);
  for (const id of st.insId) {
    const f = insurerFirm(w, id);
    if (!f) continue;
    let spare = Math.floor(w.ledger.balance(id, DEP)) - wageBuffer(w, f);
    for (let k = 0; k < 24 && spare >= 20_000; k++) {
      const spent = buyBonds(w, id, spare, cause);
      if (spent <= 0) break;
      spare -= spent;
    }
  }
}
function cede(w: World, from: string, premium: number, cause: number): void {
  if (!w.state.abroad || !w.ledger.actors.has(WORLD)) return;
  const cut = Math.round(premium * 0.15);
  if (cut > 0) pay(w, from, WORLD, cut, 'ins.cede', cause);
}
function recover(w: World, to: string, loss: number, cause: number): number {
  if (!w.state.abroad || !w.ledger.actors.has(WORLD) || !(loss > 0)) return 0;
  // The carrier keeps most of an ordinary claim. A single enormous one is cut
  // at a slice of its own capital, which is what a bad year does to the surplus.
  const keep = Math.round(Math.min(loss * 0.72, Math.max(0, worth(w, to) * 0.3)));
  const excess = Math.round(loss - keep);
  if (excess <= 0) return 0;
  const have = Math.floor(w.ledger.balance(WORLD, DEP));
  const got = Math.min(excess, have);
  if (got > 0 && pay(w, WORLD, to, got, 'ins.recover', cause)) return got;
  return 0;
}

function collect(w: World, cause: number): void {
  const st = book(w), s = econ(w), P = s.P;
  for (let k = 0; k < st.n; k++) {
    if (st.live[k] !== IN_FORCE && st.live[k] !== ARREARS) continue;
    const ins = st.insId[st.ins[k]];
    const carrier = insurerFirm(w, ins);
    if (!carrier) { st.live[k] = 0; continue; }
    const due = Math.max(1, Math.round(st.prem[k] / 12));
    let from = '', floor = 0, mortgage = false;
    if (st.polKind[k] === POL_FIRM) {
      const f = s.firms[st.ref[k]];
      if (!f || f.closed) { st.live[k] = 0; if (f) st.firmPol[f.idx] = -1; continue; }
      from = f.id; floor = 0;
    } else {
      const props = prop(w);
      const p = st.ref[k];
      if (!props || p >= props.n) { st.live[k] = 0; continue; }
      from = ownerId(w, p);
      mortgage = props.mtg[p] >= 0;
      const i = props.ownK[p] === PERSON ? props.own[p] : -1;
      floor = !mortgage && i >= 0 && i < P.n ? P.incEma[i] * 8 : 0;
    }
    if (!from) { st.live[k] = ARREARS; continue; }
    const spare = Math.floor(w.ledger.balance(from, DEP) - floor);
    if (spare >= due && pay(w, from, ins, due, 'ins.premium', cause)) {
      st.live[k] = IN_FORCE;
      st.miss[k] = 0;
      st.premiums += due;
      cede(w, ins, due, cause);
    } else if (st.polKind[k] === POL_HOME && st.miss[k] < 2) {
      st.miss[k]++;
    } else {
      st.live[k] = ARREARS;
      if (st.miss[k] < 12) st.miss[k]++;
    }
  }
}

function policyForFirm(st: Book, f: Firm): number {
  if (f.idx >= st.firmPol.length) return -1;
  const k = st.firmPol[f.idx];
  return k >= 0 && st.live[k] === IN_FORCE ? k : -1;
}
function payClaim(w: World, from: string, holder: string, amt: number, cause: number): number {
  const carrier = insurerFirm(w, from);
  if (!carrier || amt < 100 || holder === from) return 0;
  const reserve = wageBuffer(w, carrier);
  raiseCash(w, from, amt + reserve, cause);
  const spare = Math.max(0, Math.floor(w.ledger.balance(from, DEP)) - reserve);
  const payAmt = Math.min(amt, spare);
  if (payAmt < 100 || !pay(w, from, holder, payAmt, 'ins.claim', cause)) return 0;
  book(w).claims += payAmt;
  if (amt - payAmt > 80_000_00 && payAmt < amt * 0.45) windUp(w, carrier, cause, `${carrier.name} cannot pay what the policies promise and is wound up`);
  return payAmt;
}
function indemnify(w: World, holder: string, loss: number, pol: number, cause: number): number {
  const st = book(w);
  if (pol < 0 || !(loss > 0) || st.live[pol] !== IN_FORCE) return 0;
  const lead = st.insId[st.ins[pol]];
  if (!insurerFirm(w, lead)) return 0;
  const bill = Math.round(Math.min(loss, st.cover[pol]));
  if (bill < 100) return 0;
  const other = st.insId.find((id) => id !== lead && insurerFirm(w, id));
  let a = bill, b = 0;
  if (other && bill > worth(w, lead) * 0.4) { a = Math.round(bill / 2); b = bill - a; }
  recover(w, lead, a, cause);
  if (other && b > 0) recover(w, other, b, cause);
  return payClaim(w, lead, holder, a, cause) + (other && b > 0 ? payClaim(w, other, holder, b, cause) : 0);
}

function canWind(w: World, f: Firm): boolean {
  if (f.closed || f.workers < 8) return false;
  let rivals = 0;
  for (const o of econ(w).firms) if (!o.closed && o.good === f.good && o.idx !== f.idx) rivals++;
  return rivals > 0;
}
function windUp(w: World, f: Firm, cause: number, msg: string): boolean {
  const st = book(w);
  if (!canWind(w, f) || st.failYear === w.year) return false;
  const ev = w.events.emit('firm.failed', msg, [cause], f.id);
  if (!closeFirm(w, f, ev)) return false;
  st.failYear = w.year;
  st.lastLoss = ev;
  for (let k = 0; k < st.n; k++) if (st.live[k] && st.insId[st.ins[k]] === f.id) st.live[k] = 0;
  if (f.idx < st.firmPol.length && st.firmPol[f.idx] >= 0) st.firmPol[f.idx] = -1;
  return true;
}

function dieOf(w: World, s: EconState, i: number, cause: number, how: string): void {
  const L = w.ledger, P = s.P;
  if (!P.alive(i) || (P.flags[i] & PLAYER) !== 0) return;
  const me = P.slot[i];
  const sp = P.spouse[i];
  const heirs = sp >= 0 && P.alive(sp) ? [sp] : P.kids(i).filter((k) => P.alive(k));
  const holdings = s.shareIds.filter((id) => L.balS(me, id) > 0);
  const cashNow = L.balS(me, DEP);
  const ev = w.events.emit('person.died', `${P.name(i)} died aged ${P.age(w, i)} in ${how}`, [cause], P.id(i));
  P.flags[i] &= ~ALIVE;
  if (!heirs.length) {
    L.moveS(DEP, me, s.govSlot, cashNow, 'estate.escheat', ev);
    for (const id of holdings) L.moveS(id, me, s.govSlot, L.balS(me, id), 'estate.escheat', ev);
  }
  heirs.forEach((h, k) => {
    const last = k === heirs.length - 1, to = P.slot[h];
    L.moveS(DEP, me, to, last ? L.balS(me, DEP) : Math.floor(cashNow / heirs.length), 'estate.inherit', ev);
    for (const id of holdings) {
      const n = L.balS(me, id);
      L.moveS(id, me, to, last ? n : Math.floor(n / (heirs.length - k)), 'estate.inherit', ev);
    }
    P.lastEv[h] = ev;
  });
  if (sp >= 0 && sp < P.n) P.spouse[sp] = -1;
  const e = P.employer[i], f = e >= 0 ? s.firms[e] : undefined, wasCeo = f?.ceo === i;
  leaveJob(s, i);
  if (f && wasCeo) succession(w, s, f, i, 'died', ev);
  const dust = L.balS(me, DEP);
  if (dust > 0) L.moveS(DEP, me, s.govSlot, dust, 'estate.escheat', ev);
}
function harm(w: World, people: number[], h: Hazard, cause: number): void {
  const s = econ(w), P = s.P;
  let hurt = 0, killed = 0;
  for (const i of people) {
    if (i < 0 || i >= P.n || !P.alive(i) || (P.flags[i] & PLAYER) !== 0) continue;
    const boss = P.employer[i] >= 0 && s.firms[P.employer[i]]?.ceo === i;
    if (killed < h.kill && !boss && P.adult(w, i)) {
      dieOf(w, s, i, cause, h.name);
      killed++;
      continue;
    }
    if (hurt < h.hurt) {
      thought(w, s, i, 160, `injured in ${h.name}`, cause);
      hurt++;
    }
    if (hurt >= h.hurt && killed >= h.kill) break;
  }
}

function firmParcel(w: World, firms: number): Int32Array {
  const at = new Int32Array(firms); at.fill(-1);
  const st = prop(w);
  if (!st) return at;
  for (let p = 0; p < st.n; p++) if (st.kind[p] === FIRM_K && st.tenK[p] === FIRM_K && st.ten[p] >= 0 && st.ten[p] < firms) at[st.ten[p]] = p;
  return at;
}
function inPlace(places: string[], nb: number): boolean {
  if (!places.length) return true;
  const id = NB[nb] ?? '';
  return places.includes(id);
}
function pickWeighted(w: World, list: Firm[], roll: { next(): number }): Firm {
  let total = 0;
  const wt = new Float64Array(list.length);
  for (let i = 0; i < list.length; i++) {
    wt[i] = Math.max(1, capitalValue(w, list[i]));
    total += wt[i];
  }
  let x = roll.next() * total;
  for (let i = 0; i < list.length; i++) {
    x -= wt[i];
    if (x <= 0) return list[i];
  }
  return list[list.length - 1];
}
function candidates(w: World, h: Hazard, at: Int32Array): Firm[] {
  const out: Firm[] = [];
  const props = prop(w);
  for (const f of econ(w).firms) {
    if (f.closed || f.good === 'INSURANCE' || f.good === 'BANKING') continue;
    if (h.good && f.good !== h.good) continue;
    if (h.sector && f.sector !== h.sector) continue;
    if (h.places.length) {
      const p = f.idx < at.length ? at[f.idx] : -1;
      if (p < 0 || !props || !inPlace(h.places, props.nb[p])) continue;
    }
    if (h.uninsured && policyForFirm(book(w), f) >= 0) continue;
    out.push(f);
  }
  return out;
}
function stockLoss(w: World, f: Firm, fraction: number, cause: number): number {
  if (!(fraction > 0) || GOODS[f.good].perishable) return 0;
  const gid = 'good:' + f.good;
  const have = w.ledger.balance(f.id, gid);
  const q = Math.min(have, have * Math.min(1, fraction));
  if (!(q > 1e-6)) return 0;
  if (!w.ledger.consume(gid, f.id, q, 'hazard.damage', cause)) return 0;
  return Math.round(q * Math.max(0, f.price));
}
function noteLoss(st: Book, loss: number, paid: number, covered: boolean): void {
  if (covered) {
    st.insured += Math.min(loss, paid > 0 ? loss : 0);
    st.uninsured += paid > 0 ? 0 : loss;
  } else st.uninsured += loss;
  if (covered && paid > 0 && paid < loss) {
    st.insured -= loss - paid;
    st.uninsured += loss - paid;
  }
}

function hitFirm(w: World, f: Firm, h: Hazard, root: number, at: Int32Array): void {
  const st = book(w);
  const parcel = f.idx < at.length ? at[f.idx] : -1;
  const mach = h.machinery > 0 ? damageCapital(w, f.id, h.machinery, root) : 0;
  const stock = stockLoss(w, f, h.stock, root);
  const fabric = parcel >= 0 && h.fabric > 0 ? damageCondition(w, parcel, h.fabric, root) : 0;
  const loss = mach + stock + fabric;
  const ev = w.events.emit('hazard.loss', `${f.name} lost machinery worth ${dol(mach)} and stock worth ${dol(stock)} in ${h.name}`, [root], f.id);
  st.lastLoss = ev;
  const pol = policyForFirm(st, f);
  const paid = indemnify(w, f.id, loss, pol, ev);
  noteLoss(st, loss, paid, pol >= 0);
  noteScare(st, loss);
  const staff = f.staff.slice();
  harm(w, staff, h, ev);
  const s = econ(w);
  if (f.ceo >= 0 && f.ceo < s.P.n && s.P.alive(f.ceo)) thought(w, s, f.ceo, 90, `the works burned`, ev);
  if (h.fail && paid <= 0 && pol < 0 && s.unemployment < 0.14 && st.pend < 0 && st.failYear !== w.year && canWind(w, f)) {
    st.pend = f.idx;
    st.pendEv = ev;
  }
}
function settleFailure(w: World): void {
  const st = book(w);
  if (st.pend < 0) return;
  const s = econ(w);
  const f = s.firms[st.pend];
  const cause = st.pendEv;
  st.pend = -1;
  if (!f || f.closed) return;
  const who = f.ceo >= 0 && f.ceo < s.P.n ? s.P.name(f.ceo) : 'its owners';
  windUp(w, f, cause, `${who} winds up ${f.name}: the fire destroyed the plant and there was no cover to rebuild`);
}

function builderOf(s: EconState): Firm | undefined {
  let best: Firm | undefined;
  for (const f of s.firms) {
    if (f.closed || (f.good !== 'HOUSING' && f.good !== 'PUBLIC_WORKS')) continue;
    if (!best || f.workers > best.workers) best = f;
  }
  return best;
}
function hitHome(w: World, p: number, h: Hazard, root: number, builder: Firm | undefined): number {
  const st = book(w);
  const props = prop(w);
  if (!props) return 0;
  const before = props.cond[p];
  const drop = damageCondition(w, p, h.fabric, root);
  const points = before - props.cond[p];
  if (points < 1 && drop <= 0) return 0;
  const loss = Math.max(drop, 0);
  const pol = p < st.homePol.length ? st.homePol[p] : -1;
  const live = pol >= 0 && st.live[pol] === IN_FORCE;
  const owner = ownerId(w, p);
  const paid = live && owner && loss > 0 ? indemnify(w, owner, loss, pol, root) : 0;
  if (paid > 0 && builder && builder.id !== owner && pay(w, owner, builder.id, paid, 'ins.repair', root)) {
    const back = loss > 0 ? points * Math.min(1, paid / Math.max(loss, paid)) : points;
    repairCondition(w, p, back, root);
  } else if (!live && owner && builder && loss > 0) {
    const i = props.ownK[p] === PERSON ? props.own[p] : -1;
    const floor = i >= 0 ? econ(w).P.incEma[i] * 8 : 0;
    if (Math.floor(w.ledger.balance(owner, DEP) - floor) >= loss && pay(w, owner, builder.id, loss, 'repair', root)) repairCondition(w, p, points, root);
  }
  noteLoss(st, Math.max(loss, paid), paid, live);
  return points;
}
function homesIn(w: World, h: Hazard, root: number): void {
  const props = prop(w);
  if (!props || !(h.fabric > 0)) return;
  const st = book(w);
  const builder = builderOf(econ(w));
  const people: number[] = [];
  let n = 0, insured = 0, bare = 0;
  const cap = 70;
  const lossAt = st.insured + st.uninsured;
  for (let p = 0; p < props.n && n < cap; p++) {
    if (props.kind[p] !== HOME || !inPlace(h.places, props.nb[p])) continue;
    if (!rollDayHit(w.day, p, h.homes)) continue;
    const lossBefore = st.insured + st.uninsured;
    const points = hitHome(w, p, h, root, builder);
    if (points < 1 && st.insured + st.uninsured === lossBefore) continue;
    n++;
    const pol = p < st.homePol.length ? st.homePol[p] : -1;
    if (pol >= 0 && st.live[pol] === IN_FORCE) insured++; else bare++;
    if (props.tenK[p] === PERSON && props.ten[p] >= 0) people.push(props.ten[p]);
    else if (props.ownK[p] === PERSON && props.own[p] >= 0) people.push(props.own[p]);
  }
  if (!n) return;
  const ev = w.events.emit('hazard.loss', `${h.name} damaged ${n} homes (${insured} insured, ${bare} not)`, [root]);
  st.lastLoss = ev;
  const homeLoss = (st.insured + st.uninsured) - lossAt;
  noteScare(st, homeLoss);
  harm(w, people, h, ev);
}

function strike(w: World, h: Hazard, root: number): void {
  const s = econ(w);
  const at = firmParcel(w, s.firms.length);
  switch (h.where) {
    case 'firm': {
      const r = w.rng('hazard:' + h.id);
      let list = candidates(w, h, at);
      if (!h.uninsured) {
        const covered = list.filter((f) => policyForFirm(book(w), f) >= 0);
        if (covered.length) list = covered;
      } else {
        const mortal = list.filter((f) => canWind(w, f));
        if (mortal.length) list = mortal;
      }
      if (!list.length) return;
      hitFirm(w, pickWeighted(w, list, r), h, root, at);
      return;
    }
    case 'homes':
      homesIn(w, h, root);
      return;
    case 'port': {
      for (const f of candidates(w, h, at)) hitFirm(w, f, h, root, at);
      homesIn(w, h, root);
      return;
    }
    default: {
      const never: never = h.where;
      throw new Error(never);
    }
  }
}

function noteScare(st: Book, loss: number): void {
  if (!(loss > 0)) return;
  const bump = loss >= 600_000_000 ? 0.85 : loss >= 120_000_000 ? 0.45 : 0.12;
  st.scare = Math.min(1, st.scare + bump);
}
function markSolvency(w: World): void {
  const st = book(w);
  for (let i = 0; i < st.insId.length; i++) {
    const need = st.floor[i] ?? 0;
    if (!(need > 0) || !insurerFirm(w, st.insId[i])) continue;
    const ratio = worth(w, st.insId[i]) / need;
    if (ratio < st.low) st.low = ratio;
  }
}
function markFloor(w: World): void {
  const st = book(w);
  for (let i = 0; i < st.insId.length; i++) {
    if (!insurerFirm(w, st.insId[i])) continue;
    st.floor[i] = worth(w, st.insId[i]);
  }
}
function reprice(w: World): void {
  const st = book(w);
  const ratio = st.premiums > 0 ? st.claims / st.premiums : (st.claims > 0 ? 3 : 0);
  const prev = st.rate;
  st.loss = st.loss * 0.6 + ratio * 0.4;
  if (ratio > 1) st.rate = clamp(st.rate * (1.45 + Math.min(1.2, ratio - 1) * 0.4), 0.008, 0.045);
  else if (ratio > 0.6) st.rate = clamp(st.rate * (1 + (ratio - 0.4) * 0.3), 0.008, 0.045);
  else if (ratio < 0.35) st.rate = clamp(st.rate * 0.97, 0.008, 0.045);
  refreshCovers(w);
  if (st.rate > prev * 1.05 && st.insId.length) {
    const who = st.insId.find((id) => insurerFirm(w, id)) ?? st.insId[0];
    st.lastLoss = w.events.emit('ins.rate', `premiums rise to ${(st.rate * 100).toFixed(1)}% of cover after claims of ${dol(st.claims)} against premiums of ${dol(st.premiums)}`, [causeOf(st)], who);
  }
  st.scare *= 0.42;
  markFloor(w);
}

export const insurance: Module = {
  id: 'insurance',

  init(w) {
    const firms = econ(w).firms.filter((f) => f.good === 'INSURANCE' && !f.closed);
    const props = prop(w);
    const st: Book = {
      insId: firms.map((f) => f.id),
      rate: OPEN_RATE, loss: 0.65,
      disasters: 0, insured: 0, uninsured: 0, premiums: 0, claims: 0,
      failYear: -1, pend: -1, pendEv: -1, root: 0, lastLoss: -1, scare: 0, low: 99, floor: firms.map(() => 0),
      n: 0, cap: 64,
      live: new Uint8Array(64), polKind: new Uint8Array(64), ref: new Int32Array(64), ins: new Uint8Array(64),
      cover: new Float64Array(64), prem: new Float64Array(64), miss: new Uint8Array(64),
      firmPol: new Int32Array(Math.max(16, econ(w).firms.length)),
      homePol: new Int32Array(Math.max(16, props?.n ?? 16)),
    };
    st.firmPol.fill(-1); st.homePol.fill(-1);
    w.state.insurance = st;
    const names = firms.map((f) => f.name).join(' and ') || 'no insurer';
    st.root = w.events.emit('ins.open', `${names} write cover on plants and mortgaged homes`, [w.genesis], firms[0]?.id);
    st.lastLoss = st.root;
    bindFirms(w);
    bindHomes(w);
  },

  dayClose(w) {
    const st = book(w);
    if (!st.insId.length) return;
    bindFirms(w);
    bindHomes(w);
    const monthEnd = (w.day + 1) % 30 === 0;
    const yearEnd = (w.day + 1) % 360 === 0;
    for (const h of HAZARDS) {
      if (w.day < 360 || w.day % 360 !== h.day) continue;
      const r = w.rng('hazard:' + h.id);
      if (!r.chance(h.chance)) continue;
      const before = w.events.count;
      const root = w.events.exo('hazard.' + h.kind, h.text);
      strike(w, h, root);
      if (w.events.count > before + 1) st.disasters++;
    }
    if (monthEnd) collect(w, causeOf(st));
    // Cash above the wage buffer is dividended at month end, so the float has to be in bonds
    // before that sweep, and again the day after a maturity pays the principal back as cash.
    investFloat(w, causeOf(st));
    if (monthEnd) markSolvency(w);
    if (yearEnd && w.day > 0) reprice(w);
  },

  stats(w) {
    const st = book(w), s = econ(w);
    const props = prop(w);
    let cap = 0, firmN = 0, firmOn = 0, homeN = 0, homeOn = 0;
    for (const id of st.insId) if (insurerFirm(w, id)) cap += worth(w, id);
    for (const f of s.firms) {
      if (f.closed || f.good === 'INSURANCE' || f.good === 'BANKING') continue;
      firmN++;
      if (policyForFirm(st, f) >= 0) firmOn++;
    }
    if (props) for (let p = 0; p < props.n; p++) {
      if (!(props.kind[p] === HOME && props.mtg[p] >= 0 && props.ownK[p] === PERSON)) continue;
      homeN++;
      const k = p < st.homePol.length ? st.homePol[p] : -1;
      if (k >= 0 && st.live[k] === IN_FORCE) homeOn++;
    }
    const out = {
      disasters: st.disasters,
      insured: Math.round(st.insured / 100),
      uninsured: Math.round(st.uninsured / 100),
      premiums: Math.round(st.premiums / 100),
      claims: Math.round(st.claims / 100),
      insCap: Math.round(cap / 100),
      firmPct: +(100 * firmOn / Math.max(1, firmN)).toFixed(1),
      homePct: homeN ? +(100 * homeOn / homeN).toFixed(1) : 100,
      premPct: +(st.rate * 100).toFixed(2),
      insLow: +Math.min(99, st.low).toFixed(2),
    };
    st.disasters = 0; st.insured = 0; st.uninsured = 0; st.premiums = 0; st.claims = 0;
    st.low = 99;
    return out;
  },

  monthEnd(w) {
    if (!book(w).insId.length) return;
    // Mortgages written in this month's property close are not visible to the
    // day's earlier bind, and the year-end count would miss them.
    bindHomes(w);
    settleFailure(w);
  },
};
