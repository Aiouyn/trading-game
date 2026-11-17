// Business investment, banks and credit.
// Each firm has a capital stock of machinery on the ledger. Capacity in the economy is the tighter of
// staff and that stock. Busy firms replace what wears out and, after three hot months, order more from
// the machinery makers, paid from retained earnings and then a loan. Households order homes from the
// housing builders the same way. Four banks compete for those loans. Spendable money stays `dep`.
import { DAYS_PER_YEAR, type Module, type World } from '../../kernel/index.ts';
import { GOODS } from '../economy/content.ts';
import { BANK, CAPITAL, DEP, GOV, type EconState, type Firm, noteBankMargin, pay } from '../economy/index.ts';
import { thought } from '../economy/people.ts';
import { markHolding, saleProceeds, saleValue, sellToBook } from '../markets/index.ts';
import { noteBuiltHome } from '../property/index.ts';

const BUFFER = 2.4;         // spare machines so a firm can hire through a supply shock without capital binding
const YEARS = 1;            // labour-years embodied in one unit of daily output capacity
const WEAR = 0.01;
const HOT = 0.9;
const HOT_MONTHS = 3;
const MIN_RATIO = 0.04;
const LEND_AT = 0.08; // stop taking new risk above the failure line, so one bad year does not wipe the bank
const FIRM_DEBT_DAYS = 360;
const KEEP_DAYS = 90;
const MTG_DAYS = 360;
const CON_DAYS = 45;
const MTG_TERM = 120;
const CON_TERM = 36;
const MTG = 1, CON = 2, MARGIN = 3, DEFIC = 4, LINE = 5, TERM = 6;
const LINE_DAYS = 90;      // a short-term credit line is rolled every quarter, if the lender agrees
const TERM_MONTHS = 36;
const ROLL_LIMIT = 0.5;    // above this tightness lenders do not roll a credit line
const secured = (k: number): boolean => k === MARGIN || k === LINE || k === TERM;
const onCall = (k: number): boolean => k === MARGIN || k === LINE; // lender can call these when the collateral slips
const CURE_DAYS = 3;
const BAR_YEARS = 6;
const BOTTLENECK = new Set(['CRUDE_OIL', 'GRAIN', 'LIVESTOCK', 'FREIGHT', 'COAL', 'IRON_ORE', 'CHIPS', 'ELECTRICITY']);

interface Bank { id: string; slot: number; depo: string; failed: boolean; ranDay: number; runEv: number }

interface Book {
  banks: Bank[];
  hot: Uint8Array;
  need: Float64Array;
  plan?: Float64Array; // each firm's capacity plan: its output at full staff, averaged over about a year
  firmMiss: Uint8Array;
  firmRate: Float64Array;
  firmRefuse: Int32Array;
  ln: number;
  lnCap: number;
  lnPerson: Int32Array;
  lnBank: Uint8Array;
  lnKind: Uint8Array;
  lnRate: Float64Array;
  lnMiss: Uint8Array;
  lnOpen: Uint8Array;
  lnOpened: Int32Array;
  lnTerm: Uint16Array;
  lnCall: Int32Array; // day the margin call opened, or -1
  owed: Float64Array;
  mtg: Uint8Array;
  lock: Int32Array;
  bust: Int32Array; // day the court last declared, or -1
  tight?: number;       // credit tightness 0..1: lenders' appetite is the opposite
  tightEv?: number;     // the event that last moved it
  woEma?: number;       // annualised write-off rate, smoothed
  woSeen?: number;      // yWriteoff at the last month end
  rateHist?: number[];  // policy rate at the last twelve month ends
  idxHist?: number[];   // exchange index at the last twelve month ends
  yInvest: number;
  yWriteoff: number;
  finDay: number;
  finCache: Fin[];
  payroll: boolean;
  machPerDay: number;
  housePerDay: number;
  houseHot: number;
  lendFirm: (w: World, s: EconState, f: Firm, cents: number, cause: number) => boolean;
}

const book = (w: World): Book => w.state.banking as Book;
const econ = (w: World): EconState => w.state.economy as EconState;
const firmsMaking = (s: EconState, good: string): Firm[] => {
  const out: Firm[] = [];
  for (const f of s.firms) if (f.good === good && !f.closed) out.push(f);
  return out;
};
function growFirms(b: Book, n: number): void {
  if (b.hot.length >= n && b.need.length >= n && b.firmMiss.length >= n && b.firmRate.length >= n && b.firmRefuse.length >= n && (!b.plan || b.plan.length >= n)) return;
  const m = Math.max(n, b.hot.length * 2, 16);
  const u8 = (a: Uint8Array): Uint8Array => { const x = new Uint8Array(m); x.set(a); return x; };
  const f64 = (a: Float64Array): Float64Array => { const x = new Float64Array(m); x.set(a); return x; };
  const i32 = (a: Int32Array): Int32Array => { const x = new Int32Array(m); x.set(a); return x; };
  b.hot = u8(b.hot); b.need = f64(b.need); b.firmMiss = u8(b.firmMiss); b.firmRate = f64(b.firmRate); b.firmRefuse = i32(b.firmRefuse);
  if (b.plan) b.plan = f64(b.plan);
}
const centsPerUnit = (s: EconState, f: Firm): number => YEARS * 360 * s.wage / Math.max(0.01, GOODS[f.good].prod);
const firmInstr = (f: Firm): string => 'cf:' + f.id;
const plInstr = (k: number): string => 'pl_' + k;

function because(s: EconState, extra: (number | undefined)[]): number[] {
  const out: number[] = [];
  if (s.rateEv !== undefined) out.push(s.rateEv);
  for (const e of extra) if (e !== undefined && e >= 0 && !out.includes(e)) out.push(e);
  if (!out.length) out.push(s.macroEv);
  return out;
}
function firmSituation(s: EconState, f: Firm): number {
  return f.priceEv ?? f.stockoutEv ?? f.inputShortEv ?? f.layoffEv ?? s.macroEv;
}
function shockMult(s: EconState, good: string): number {
  let m = 1;
  for (const x of s.shocks) m *= (x.def.prod[good] ?? 1) * (x.def.prod.ALL ?? 1);
  return m;
}
function loadOf(w: World, f: Firm): { cap: number; util: number } {
  const cap = Math.max(0, Math.min(f.eff * GOODS[f.good].prod, w.ledger.balance(f.id, CAPITAL)));
  const util = cap > 1e-6 ? f.expSales / cap : (f.expSales > 0 ? 2 : 0);
  return { cap, util };
}
function firmOwed(w: World, f: Firm): number { return w.ledger.issued.get(firmInstr(f)) ?? 0; }
function firmSpread(s: EconState, f: Firm, owed: number): number {
  const scale = f.eff * s.wage * 30 + 1;
  const trailing = f.lastProfit < 0 ? Math.min(0.05, 0.008 * Math.max(1, f.badMonths)) : 0;
  return 0.02 + 0.06 * (owed / (owed + scale)) + trailing;
}
function personSpread(w: World, s: EconState, i: number): number {
  const P = s.P, b = book(w);
  const income = Math.max(1, P.incEma[i]);
  const tenure = P.employer[i] >= 0 ? Math.max(0, Math.floor((w.day - P.born[i]) / DAYS_PER_YEAR) - 18) : 0;
  const load = (i < b.owed.length ? b.owed[i] : 0) / (income * 360);
  return 0.025 + Math.min(0.08, 0.06 * load) + (tenure < 2 ? 0.02 : tenure < 5 ? 0.01 : 0);
}

interface Fin { equity: number; assets: number; deposits: number; ratio: number }
function dirtyFin(w: World): void { book(w).finDay = -1; }
function finances(w: World, bank: Bank): Fin {
  const saved = book(w);
  let idx = saved.banks.length;
  for (let i = 0; i < saved.banks.length; i++) if (saved.banks[i] === bank) { idx = i; break; }
  if (saved.finDay === w.day && saved.finCache[idx]) return saved.finCache[idx];
  if (saved.finDay !== w.day) { saved.finDay = w.day; saved.finCache = []; }
  const equity = w.ledger.netWorth(bank.id);
  const depo = w.ledger.issued.get(bank.depo) ?? 0;
  const sight = bank.id === BANK ? (w.ledger.issued.get(DEP) ?? 0) : 0;
  const deposits = depo + sight;
  const assets = equity + deposits;
  const ratio = assets > 1 ? equity / assets : (equity >= 0 ? 1 : -1);
  const fin = { equity, assets, deposits, ratio };
  saved.finCache[idx] = fin;
  return fin;
}
function bankById(b: Book, id: string): Bank | undefined {
  for (const bank of b.banks) if (bank.id === id) return bank;
  return undefined;
}
function holdersOf(w: World, instr: string): [string, number][] {
  return [...w.ledger.holders(instr).entries()];
}

function growPeople(b: Book, n: number): void {
  if (n <= b.owed.length && b.bust && n <= b.bust.length) return;
  const m = Math.max(n, b.owed.length * 2, 16);
  const owed = new Float64Array(m); owed.set(b.owed); b.owed = owed;
  const mtg = new Uint8Array(m); mtg.set(b.mtg); b.mtg = mtg;
  const lock = new Int32Array(m); lock.set(b.lock); b.lock = lock;
  const bust = new Int32Array(m); bust.fill(-1); if (b.bust) bust.set(b.bust); b.bust = bust;
}
function addOwed(b: Book, person: number, d: number): void {
  growPeople(b, person + 1);
  b.owed[person] = Math.max(0, b.owed[person] + d);
}

interface Quote { idx: number; rate: number; take: number }
function quote(w: World, s: EconState, spread: number, amount: number): Quote | null {
  const b = book(w);
  let best: Quote | null = null;
  for (let i = 0; i < b.banks.length; i++) {
    const bank = b.banks[i];
    if (bank.failed) continue;
    const fin = finances(w, bank);
    if (fin.ratio < LEND_AT || fin.equity <= 0) continue;
    let take = Math.min(amount, Math.floor(fin.equity * 0.5));
    if (bank.id === BANK) take = Math.min(take, Math.floor(Math.max(0, fin.equity / LEND_AT - fin.assets)));
    else take = Math.min(take, Math.floor(w.ledger.balance(bank.id, DEP)));
    if (take < 1) continue;
    const margin = (bank.id === BANK ? 0.012 : 0.004) + 0.001 * i + Math.max(0, 0.08 - fin.ratio) * 0.5;
    const rate = s.policyRate + spread + margin + 0.02 * (b.tight ?? 0);
    if (!best || rate < best.rate - 1e-9 || (Math.abs(rate - best.rate) <= 1e-9 && take > best.take)) best = { idx: i, rate, take };
  }
  return best;
}

function grant(w: World, bank: Bank, instr: string, borrower: string, amount: number, cause: number): boolean {
  dirtyFin(w);
  const a = Math.round(amount);
  if (a <= 0) return false;
  const L = w.ledger;
  if (bank.id === BANK) {
    L.issue(instr, bank.id, a, 'loan.grant', cause);
    L.issue(DEP, borrower, a, 'loan.grant', cause);
    return true;
  }
  if (!pay(w, bank.id, borrower, a, 'loan.grant', cause)) return false;
  L.issue(instr, bank.id, a, 'loan.grant', cause);
  return true;
}
function repayHolder(w: World, bank: Bank, instr: string, borrower: string, amount: number, cause: number): number {
  dirtyFin(w);
  const L = w.ledger;
  const a = Math.min(Math.round(amount), Math.floor(L.balance(bank.id, instr)), Math.floor(L.balance(borrower, DEP)));
  if (a <= 0) return 0;
  if (bank.id === BANK) {
    if (!L.redeem(DEP, borrower, a, 'loan.repay', cause)) return 0;
    if (!L.redeem(instr, bank.id, a, 'loan.repay', cause)) { L.issue(DEP, borrower, a, 'loan.repay', cause); return 0; }
    return a;
  }
  if (!pay(w, borrower, bank.id, a, 'loan.repay', cause)) return 0;
  if (!L.redeem(instr, bank.id, a, 'loan.repay', cause)) { pay(w, bank.id, borrower, a, 'loan.repay', cause); return 0; }
  return a;
}
function payInterest(w: World, bank: Bank, borrower: string, amount: number, cause: number): number {
  dirtyFin(w);
  const a = Math.min(Math.round(amount), Math.floor(w.ledger.balance(borrower, DEP)));
  if (a <= 0) return 0;
  if (bank.id === BANK) {
    if (!w.ledger.redeem(DEP, borrower, a, 'loan.interest', cause)) return 0;
    noteBankMargin(w, a);
    return a;
  }
  return pay(w, borrower, bank.id, a, 'loan.interest', cause) ? a : 0;
}
function writeoffLoan(w: World, instr: string, cause: number): number {
  dirtyFin(w);
  let lost = 0;
  for (const [holder, bal] of holdersOf(w, instr)) {
    const a = Math.floor(bal);
    if (a > 0 && w.ledger.redeem(instr, holder, a, 'loan.writeoff', cause)) lost += a;
  }
  return lost;
}

function lendFirm(w: World, s: EconState, f: Firm, cents: number, cause: number): boolean {
  const b = book(w);
  growFirms(b, s.firms.length);
  if (f.closed || f.idx >= b.firmRefuse.length) return false;
  const ask = Math.round(cents);
  if (ask <= 0) return true;
  const owed = firmOwed(w, f);
  const reserve = b.payroll ? 120 : 0;
  b.payroll = false;
  const want = Math.min(ask, Math.floor(Math.max(0, f.eff * s.wage * (FIRM_DEBT_DAYS + reserve) - owed)));
  if (want < 1) return false;
  const pick = quote(w, s, firmSpread(s, f, owed), want);
  if (!pick) {
    if (w.day - b.firmRefuse[f.idx] >= 30) {
      b.firmRefuse[f.idx] = w.day;
      w.events.emit('loan.refused', `${f.name} was refused ${(want / 100).toFixed(0)} of credit`, because(s, [firmSituation(s, f)]), f.id);
    }
    return false;
  }
  const bank = b.banks[pick.idx];
  if (!grant(w, bank, firmInstr(f), f.id, pick.take, cause)) return false;
  b.firmRate[f.idx] = pick.rate;
  w.events.emit('loan.grant', `${f.name} borrows ${(pick.take / 100).toFixed(0)} from ${bank.id} at ${(pick.rate * 100).toFixed(1)}%`, because(s, [firmSituation(s, f)]), f.id);
  return pick.take + 1 >= want || pick.take >= ask;
}

function growLoans(b: Book): number {
  if (b.ln >= b.lnCap) {
    const n = b.lnCap * 2;
    const copy = <T extends Int32Array | Uint8Array | Uint16Array | Float64Array>(a: T, next: T): T => { next.set(a); return next; };
    b.lnPerson = copy(b.lnPerson, new Int32Array(n));
    b.lnBank = copy(b.lnBank, new Uint8Array(n));
    b.lnKind = copy(b.lnKind, new Uint8Array(n));
    b.lnRate = copy(b.lnRate, new Float64Array(n));
    b.lnMiss = copy(b.lnMiss, new Uint8Array(n));
    b.lnOpen = copy(b.lnOpen, new Uint8Array(n));
    b.lnOpened = copy(b.lnOpened, new Int32Array(n));
    b.lnTerm = copy(b.lnTerm, new Uint16Array(n));
    b.lnCall = copy(b.lnCall, new Int32Array(n));
    for (let i = b.lnCap; i < n; i++) b.lnCall[i] = -1;
    b.lnCap = n;
  }
  return b.ln++;
}

function openPersonal(w: World, s: EconState, i: number, kind: number, cents: number, cause: number): number {
  const b = book(w), P = s.P;
  const pick = quote(w, s, personSpread(w, s, i) + (kind === CON ? 0.02 : 0), cents);
  if (!pick) return 0;
  const k = growLoans(b);
  const instr = plInstr(k);
  w.ledger.define({ id: instr, kind: 'claim', issuer: P.id(i) });
  const bank = b.banks[pick.idx];
  if (!grant(w, bank, instr, P.id(i), pick.take, cause)) { b.lnOpen[k] = 0; return 0; }
  b.lnPerson[k] = i; b.lnBank[k] = pick.idx; b.lnKind[k] = kind; b.lnRate[k] = pick.rate;
  b.lnMiss[k] = 0; b.lnOpen[k] = 1; b.lnOpened[k] = w.day; b.lnTerm[k] = kind === MTG ? MTG_TERM : kind === TERM ? TERM_MONTHS : CON_TERM;
  b.lnCall[k] = -1;
  addOwed(b, i, pick.take);
  if (kind === MTG) { growPeople(b, i + 1); b.mtg[i] = 1; }
  const what = kind === MTG ? 'mortgage' : kind === MARGIN ? 'margin loan' : kind === LINE ? 'credit line' : kind === TERM ? 'term loan' : kind === DEFIC ? 'unsecured loan' : 'consumer loan';
  w.events.emit('loan.grant', `${P.name(i)} takes a ${what} of ${(pick.take / 100).toFixed(0)} from ${bank.id} at ${(pick.rate * 100).toFixed(1)}%`, because(s, [P.lastEv[i] >= 0 ? P.lastEv[i] : s.macroEv]), P.id(i));
  return pick.take;
}

function lossThought(w: World, s: EconState, id: string, lost: number, held: number, cause: number, why: string): void {
  if (!id.startsWith('p_') || lost <= 0) return;
  const i = +id.slice(2);
  const income = s.P.incEma[i] || s.wage;
  if (lost >= 0.2 * Math.max(held, 1) || lost >= income * 60) thought(w, s, i, 300, why, cause);
}

const SEGREGATED = /(^clearing$|_exch$|escrow|custod)/;
function haircutClaim(w: World, s: EconState, instr: string, hole: number, cause: number): void {
  dirtyFin(w);
  const rows = holdersOf(w, instr);
  const issued = rows.reduce((t, [, v]) => t + v, 0);
  let left = Math.min(Math.max(0, Math.round(hole)), Math.floor(issued));
  if (left <= 0 || issued <= 0) return;
  for (let pass = 0; pass < 2 && left > 0; pass++) {
    for (let i = 0; i < rows.length && left > 0; i++) {
      const [id, bal] = rows[i];
      if (SEGREGATED.test(id)) continue; // collateral held for others is not the clearing house's to lose
      const have = Math.floor(w.ledger.balance(id, instr));
      const share = pass === 0 ? Math.min(have, Math.floor(hole * bal / issued)) : have;
      const a = Math.min(left, Math.max(0, share));
      if (a > 0 && w.ledger.redeem(instr, id, a, 'bank.bailin', cause)) {
        left -= a;
        lossThought(w, s, id, a, bal, cause, 'lost savings in a bank failure');
      }
    }
  }
}
function haircutSight(w: World, s: EconState, hole: number, cause: number): void {
  dirtyFin(w);
  const rows = holdersOf(w, DEP);
  const issued = rows.reduce((t, [, v]) => t + v, 0);
  let left = Math.min(Math.max(0, Math.round(hole)), Math.floor(issued));
  if (left <= 0 || issued <= 0) return;
  for (let pass = 0; pass < 2 && left > 0; pass++) {
    for (let i = 0; i < rows.length && left > 0; i++) {
      const [id, bal] = rows[i];
      // Clearing houses hold other people's collateral, segregated by law: a bank failure cannot take it.
      if (SEGREGATED.test(id)) continue;
      const have = Math.floor(w.ledger.balance(id, DEP));
      const share = pass === 0 ? Math.min(have, Math.floor(hole * bal / issued)) : have;
      const a = Math.min(left, Math.max(0, share));
      if (a > 0 && w.ledger.redeem(DEP, id, a, 'bank.bailin', cause)) {
        left -= a;
        lossThought(w, s, id, a, bal, cause, 'lost savings in a bank failure');
      }
    }
  }
}

function resolve(w: World, s: EconState, bank: Bank, cause: number): void {
  if (bank.failed) return;
  const fin = finances(w, bank);
  if (fin.equity >= -100) return;
  bank.failed = true;
  const ev = w.events.emit('bank.fail', `${bank.id} failed with capital ${(fin.equity / 100).toFixed(0)}; depositors take the loss`, because(s, [cause, bank.runEv > 0 ? bank.runEv : undefined]), bank.id);
  const hole = Math.round(-finances(w, bank).equity);
  if (bank.id === BANK) haircutSight(w, s, hole, ev);
  else haircutClaim(w, s, bank.depo, hole, ev);
  for (const [id, bal] of holdersOf(w, 'eq:' + bank.id)) lossThought(w, s, id, bal, bal, ev, `lost savings in the failure of ${bank.id}`);
}

function withdraw(w: World, bank: Bank, holder: string, amount: number, cause: number): number {
  dirtyFin(w);
  const L = w.ledger;
  let a = Math.min(Math.round(amount), Math.floor(L.balance(holder, bank.depo)));
  if (a <= 0) return 0;
  if (bank.id !== BANK) a = Math.min(a, Math.floor(L.balance(bank.id, DEP)));
  if (a <= 0) return 0;
  if (!L.redeem(bank.depo, holder, a, 'deposit.withdraw', cause)) return 0;
  if (bank.id === BANK) { L.issue(DEP, holder, a, 'deposit.withdraw', cause); return a; }
  if (!pay(w, bank.id, holder, a, 'deposit.withdraw', cause)) {
    L.issue(bank.depo, holder, a, 'deposit.withdraw', cause);
    return 0;
  }
  return a;
}

/** Defaults scare depositors. A week of withdrawals past 10% of deposits is a run. */
function scare(w: World, s: EconState, bank: Bank, lost: number, cause: number): void {
  const rows = holdersOf(w, bank.depo);
  const base = rows.reduce((t, [, v]) => t + v, 0);
  if (base <= 0 || lost <= 0) return;
  const frac = Math.min(0.4, lost / base);
  if (frac < 0.02) return;
  let out = 0;
  for (const [id, bal] of rows) out += withdraw(w, bank, id, Math.floor(bal * frac), cause);
  if (out > 0.1 * base && w.day - bank.ranDay > 6) {
    bank.ranDay = w.day;
    bank.runEv = w.events.emit('bank.run', `${bank.id} run: withdrawals this week were ${((out / base) * 100).toFixed(0)}% of deposits`, because(s, [cause]), bank.id);
  }
}

function afterLoss(w: World, s: EconState, losses: { bank: Bank; amt: number }[], cause: number): void {
  for (const { bank, amt } of losses) {
    if (bank.failed) continue;
    scare(w, s, bank, amt, cause);
    resolve(w, s, bank, cause);
  }
}

function serviceFirms(w: World, s: EconState, b: Book): void {
  growFirms(b, s.firms.length);
  for (const f of s.firms) {
    if (f.closed) continue;
    const instr = firmInstr(f);
    const owed = Math.floor(w.ledger.issued.get(instr) ?? 0);
    if (owed <= 0) { b.firmMiss[f.idx] = 0; continue; }
    const r = s.policyRate + firmSpread(s, f, owed);
    b.firmRate[f.idx] = r;
    const interest = Math.round(owed * r / 12);
    const rows = holdersOf(w, instr);
    let paidI = 0;
    for (const [holder, bal] of rows) {
      const bank = bankById(b, holder);
      if (!bank || bal <= 0) continue;
      const share = Math.min(Math.round(interest * bal / owed), interest - paidI);
      paidI += payInterest(w, bank, f.id, share, s.rateEv);
    }
    f.mCost += paidI;
    const missed = paidI + 1 < interest;
    b.firmMiss[f.idx] = missed ? Math.min(250, b.firmMiss[f.idx] + 1) : 0;
    if (!missed) {
      const free = Math.floor(w.ledger.balance(f.id, DEP) - f.eff * s.wage * 30);
      let left = free > 0 ? Math.min(free, Math.round(owed / 60)) : 0;
      for (const [holder, bal] of rows) {
        if (left <= 0) break;
        const bank = bankById(b, holder);
        if (!bank) continue;
        left -= repayHolder(w, bank, instr, f.id, Math.min(left, bal), s.macroEv);
      }
    }
    if (b.firmMiss[f.idx] < 3) continue;
    const ev = w.events.emit('firm.default', `${f.name} missed three payments and defaulted on ${(owed / 100).toFixed(0)}`, because(s, [firmSituation(s, f)]), f.id);
    const losses: { bank: Bank; amt: number }[] = [];
    for (const [holder, bal] of rows) {
      const bank = bankById(b, holder);
      if (bank && bal > 0) losses.push({ bank, amt: Math.floor(bal) });
    }
    b.yWriteoff += writeoffLoan(w, instr, ev);
    s.defaults++;
    b.firmMiss[f.idx] = 0;
    afterLoss(w, s, losses, ev);
  }
}

function planInvestment(w: World, s: EconState, b: Book): void {
  const L = w.ledger;
  growFirms(b, s.firms.length);
  for (const f of s.firms) {
    if (f.closed) continue;
    const before = L.balance(f.id, CAPITAL);
    const wear = before * WEAR;
    if (wear > 1e-8) L.consume(CAPITAL, f.id, Math.min(before, wear), 'depreciation', s.macroEv);
    const now = L.balance(f.id, CAPITAL);
    const { util } = loadOf(w, f);
    b.hot[f.idx] = util > HOT ? Math.min(250, b.hot[f.idx] + 1) : 0;
    const labour = f.eff * GOODS[f.good].prod;
    // Machinery is planned for the long run, not for this month's staff: a firm that lays people off keeps
    // replacing worn machines, so one slump does not cut machinery orders and then the machinery maker's jobs.
    if (!b.plan || b.plan.length < s.firms.length) { const p = new Float64Array(s.firms.length); if (b.plan) p.set(b.plan); b.plan = p; }
    b.plan[f.idx] = b.plan[f.idx] > 0 ? b.plan[f.idx] + (labour - b.plan[f.idx]) / 12 : labour;
    const floor = Math.max(labour, b.plan[f.idx]) * BUFFER;
    let order = 0;
    if (util >= 0.5) order += Math.max(0, Math.min(floor, before) - now);
    order += 0.08 * Math.max(0, floor - now - order);
    // A deep productivity cut binds the machines. Order the stock that lets the firm hire back to its old output.
    // Mild shocks (a pandemic, a heatwave) are left to the spare buffer, so the machinery firm is not whipsawed.
    const mult = shockMult(s, f.good);
    if (mult < 0.82) order += Math.max(0, labour / mult - now - order);
    if (b.hot[f.idx] >= HOT_MONTHS && s.unemployment >= 0.07 && !s.shocks.length) {
      const desired = Math.max(floor, f.expSales / 0.85);
      order += 0.1 * Math.max(0, desired - now - order);
    }
    if (!(order > 1e-3) || order * centsPerUnit(s, f) < 5_000) continue;
    b.need[f.idx] = Math.min(b.need[f.idx] + order, order * 2);
    w.events.emit('firm.invest', `${f.name} orders machinery for ${(order * centsPerUnit(s, f) / 100).toFixed(0)} (${(util * 100).toFixed(0)}% utilised)`, because(s, [firmSituation(s, f)]), f.id);
  }
}

function surplus(w: World, f: Firm): number {
  const stock = w.ledger.balance(f.id, 'good:' + f.good);
  // Hold back a few days of what other firms actually buy. The production target (expSales) is larger
  // while an investment backlog is open, and must not swallow the stock we are trying to install.
  return Math.max(0, stock - Math.max(f.soldEma, 0) * 2);
}

function deliver(w: World, s: EconState, b: Book): void {
  growFirms(b, s.firms.length);
  const makers = firmsMaking(s, 'MACHINERY');
  if (!makers.length) { b.machPerDay = 0; return; }
  const price = makers.reduce((t, m) => t + m.price, 0) / makers.length;
  let machQty = 0;
  for (let i = 0; i < s.firms.length && i < b.need.length; i++) {
    if (s.firms[i].closed) continue;
    if (b.need[i] > 0 && price > 0) machQty += b.need[i] * centsPerUnit(s, s.firms[i]) / price;
  }
  b.machPerDay = machQty / 20;
  if (machQty <= 1e-6 || price <= 0) return;
  const stock = makers.map((m) => surplus(w, m));
  if (stock.reduce((t, x) => t + x, 0) <= 1e-6) return;
  const behind = (i: number): number => {
    const f = s.firms[i];
    const floor = f.eff * GOODS[f.good].prod * BUFFER;
    return floor > 1e-6 ? w.ledger.balance(f.id, CAPITAL) / floor : 1;
  };
  const shocked = (i: number): boolean => shockMult(s, s.firms[i].good) < 0.82 && b.need[i] > 0;
  const rank = s.firms.map((_, i) => i).filter((i) => !s.firms[i].closed && i < b.need.length).sort((a, c) => {
    const pa = shocked(a) ? 0 : makers.some((m) => m.idx === a) ? 1 : 2;
    const pb = shocked(c) ? 0 : makers.some((m) => m.idx === c) ? 1 : 2;
    return pa - pb || behind(a) - behind(c);
  });
  const install = (i: number, capQty: number): number => {
    if (capQty <= 1e-6 || b.need[i] <= 1e-6) return 0;
    const f = s.firms[i];
    const cpu = centsPerUnit(s, f);
    const qty = Math.min(capQty, b.need[i] * cpu / price);
    const cost = Math.round(qty * price);
    if (cost <= 0) return 0;
    // Dividends sweep anything above a month of wages, so a 30-day floor left replacement unfunded once a
    // firm was at its debt ceiling. Two weeks covers the payroll and lets the rest replace worn machines.
    let cash = Math.max(0, Math.floor(w.ledger.balance(f.id, DEP) - f.eff * s.wage * 14));
    if (cash < cost) {
      lendFirm(w, s, f, cost - cash, s.macroEv);
      cash = Math.max(0, Math.floor(w.ledger.balance(f.id, DEP) - f.eff * s.wage * 14));
    }
    const budget = Math.min(cost, cash);
    if (budget <= 0) return 0;
    let spent = 0, got = 0;
    for (let k = 0; k < makers.length && spent < budget; k++) {
      const m = makers[k];
      if (stock[k] <= 1e-8 || m.price <= 0) continue;
      const q = Math.min(stock[k], (budget - spent) / m.price);
      const c = Math.min(budget - spent, Math.round(q * m.price));
      const q2 = Math.min(stock[k], c / m.price);
      if (!(q2 > 1e-8) || c <= 0) continue;
      if (m.id === f.id) {
        if (!w.ledger.consume('good:' + f.good, f.id, q2, 'invest.install', s.macroEv)) continue;
      } else {
        if (!pay(w, f.id, m.id, c, 'invest.buy', s.macroEv)) continue;
        if (!w.ledger.move('good:' + m.good, m.id, f.id, q2, 'invest.buy', s.macroEv)) { pay(w, m.id, f.id, c, 'invest.buy', s.macroEv); continue; }
        w.ledger.consume('good:' + m.good, f.id, q2, 'invest.install', s.macroEv);
        m.mRev += c; m.sold += q2; s.yGdp += c; s.mSpend += c;
      }
      stock[k] -= q2; spent += c; got += q2;
    }
    if (spent <= 0) return 0;
    const units = spent / cpu;
    w.ledger.produce(CAPITAL, f.id, units, 'invest.install', s.macroEv);
    b.need[i] = Math.max(0, b.need[i] - units);
    b.yInvest += spent;
    return got;
  };
  let leftQty = Math.min(machQty / 20, stock.reduce((t, x) => t + x, 0));
  // Half the day's machines go to bottleneck producers until they hold a spare. A heatwave or an embargo
  // can then be staffed, instead of lifting the price level and the policy rate for a year afterwards.
  const exposed = (i: number): boolean => {
    const f = s.firms[i];
    if (!BOTTLENECK.has(f.good)) return false;
    const labour = f.eff * GOODS[f.good].prod;
    return labour > 0 && w.ledger.balance(f.id, CAPITAL) < labour * 1.8;
  };
  let guard = leftQty * 0.5;
  for (const i of rank) {
    if (!exposed(i) || guard <= 1e-6) continue;
    const got = install(i, guard);
    guard -= got; leftQty -= got;
  }
  for (const i of rank) {
    if (leftQty <= 1e-6) break;
    leftQty -= install(i, leftQty);
  }
}

function pinSales(s: EconState, b: Book): void {
  if (s.unemployment < 0.04) return;
  if (b.machPerDay > 0) {
    const makers = firmsMaking(s, 'MACHINERY');
    const share = b.machPerDay / makers.length;
    for (const m of makers) {
      const cap = Math.max(m.soldEma * 1.3, m.soldEma + share);
      if (m.expSales < cap) m.expSales += Math.max(0.01, 0.015 * (cap - m.expSales));
    }
  }
}

function housingOrders(w: World, s: EconState, b: Book): void {
  const hs = firmsMaking(s, 'HOUSING');
  if (!hs.length) return;
  let util = 0;
  for (const h of hs) util += loadOf(w, h).util;
  util /= hs.length;
  b.houseHot = util > HOT ? Math.min(250, b.houseHot + 1) : 0;
  if (b.houseHot < HOT_MONTHS || s.unemployment < 0.05 || s.shocks.length > 0) { b.housePerDay = 0; return; }
  const P = s.P;
  const price = hs.reduce((t, h) => t + h.price, 0) / hs.length;
  let openM = 0;
  for (let k = 0; k < b.ln; k++) if (b.lnOpen[k] && b.lnKind[k] === MTG) openM++;
  if (openM >= Math.floor(P.n / 15)) { b.housePerDay = 0; return; }
  const cap = Math.max(1, Math.floor(P.n / 1000));
  let spent = 0, n = 0;
  const scale = hs.reduce((t, h) => t + h.eff, 0) || 1;
  for (let i = 0; i < P.n && n < cap; i++) {
    if (i === ((w.state.player as { who?: number } | undefined)?.who ?? -1)) continue;
    if (!P.alive(i) || P.employer[i] < 0 || P.incEma[i] < s.wage * 0.6) continue;
    if (isPlayer(w, i)) continue;
    const age = Math.floor((w.day - P.born[i]) / DAYS_PER_YEAR);
    if (age < 21 || age > 70) continue;
    if (i < b.mtg.length && b.mtg[i]) continue;
    if (i < b.lock.length && b.lock[i] > w.day) continue;
    if ((i < b.owed.length ? b.owed[i] : 0) > P.incEma[i] * 360 * 2) continue;
    const priceH = Math.round(P.incEma[i] * MTG_DAYS);
    const down = Math.round(priceH * 0.2);
    if (w.ledger.balS(P.slot[i], DEP) < down) continue;
    const cause = P.lastEv[i] >= 0 ? P.lastEv[i] : s.macroEv;
    const got = openPersonal(w, s, i, MTG, priceH - down, cause);
    if (got <= 0) continue;
    const payNow = Math.min(priceH, Math.floor(w.ledger.balS(P.slot[i], DEP)));
    let left = payNow;
    for (let h = 0; h < hs.length && left > 0; h++) {
      const a = h === hs.length - 1 ? left : Math.min(left, Math.round(payNow * hs[h].eff / scale));
      if (a <= 0 || !pay(w, P.id(i), hs[h].id, a, 'housing.buy', cause)) continue;
      hs[h].mRev += a; hs[h].sold += price > 0 ? a / price : 0;
      s.yGdp += a; s.mSpend += a; spent += a; left -= a; b.yInvest += a;
    }
    w.ledger.produce('dwelling', hs[0].id, 1, 'housing.build', cause);
    w.ledger.move('dwelling', hs[0].id, P.id(i), 1, 'housing.sale', cause);
    noteBuiltHome(w, i, spent > 0 ? spent : priceH, cause);
    n++;
  }
  b.housePerDay = price > 0 ? spent / price / 30 : 0;
  if (n > 0) w.events.emit('firm.invest', `households ordered ${n} homes, ${(spent / 100).toFixed(0)} paid to builders`, because(s, hs.map((h) => h.priceEv ?? h.stockoutEv)), hs[0].id);
}

function consumerCredit(w: World, s: EconState, b: Book): void {
  if (s.unemployment < 0.05 || s.shocks.length > 0) return;
  const P = s.P;
  let open = 0;
  for (let k = 0; k < b.ln; k++) if (b.lnOpen[k] && b.lnKind[k] === CON) open++;
  if (open >= Math.floor(P.n / 20)) return;
  const cap = Math.max(1, Math.floor(P.n / 800));
  const start = (w.month * 17) % Math.max(1, P.n);
  let n = 0;
  for (let step = 0; step < P.n && n < cap; step++) {
    const i = (start + step) % P.n;
    if (i === ((w.state.player as { who?: number } | undefined)?.who ?? -1)) continue;
    if (!P.alive(i) || P.employer[i] < 0 || P.incEma[i] < s.wage * 0.8) continue;
    if (isPlayer(w, i)) continue;
    const age = Math.floor((w.day - P.born[i]) / DAYS_PER_YEAR);
    if (age < 21 || age > 65) continue;
    if (i < b.lock.length && b.lock[i] > w.day) continue;
    if ((i < b.owed.length ? b.owed[i] : 0) > P.incEma[i] * 180) continue;
    const cause = P.lastEv[i] >= 0 ? P.lastEv[i] : s.macroEv;
    if (openPersonal(w, s, i, CON, Math.round(P.incEma[i] * CON_DAYS), cause) > 0) n++;
  }
}

function closePersonal(w: World, s: EconState, b: Book, k: number, i: number): void {
  b.lnOpen[k] = 0;
  if (b.lnKind[k] === MTG && i < b.mtg.length) b.mtg[i] = 0;
}

/** Redeem part of a loan claim. The lender loses the asset; the borrower's liability shrinks by the same amount. */
function writeoffPart(w: World, instr: string, gap: number, cause: number): number {
  dirtyFin(w);
  let left = Math.max(0, Math.round(gap));
  let lost = 0;
  for (const [holder, bal] of holdersOf(w, instr)) {
    if (left <= 0) break;
    const a = Math.min(left, Math.floor(bal));
    if (a > 0 && w.ledger.redeem(instr, holder, a, 'loan.writeoff', cause)) { lost += a; left -= a; }
  }
  return lost;
}

interface Fill { instr: string; qty: number; cents: number }
interface BidSnap { id: number; instr: string; qty: number; limit: number }

/** Resting bids, copied, so a sale can say what each lot fetched. The book itself keeps no fill. */
function bidSnap(w: World): BidSnap[] {
  const orders = (w.state.markets as { orders?: { id: number; instr: string; side: string; qty: number; limit: number | null; open: boolean }[] } | undefined)?.orders;
  if (!orders) return [];
  const out: BidSnap[] = [];
  for (const o of orders) {
    if (!o.open || o.side !== 'buy' || o.limit === null || !(o.limit > 0) || o.qty < 1) continue;
    out.push({ id: o.id, instr: o.instr, qty: o.qty, limit: o.limit });
  }
  return out;
}

function takeFills(w: World, before: BidSnap[]): Fill[] {
  const orders = (w.state.markets as { orders?: { id: number; qty: number; open: boolean }[] } | undefined)?.orders;
  const now = new Map<number, { qty: number; open: boolean }>();
  if (orders) for (const o of orders) now.set(o.id, o);
  const agg = new Map<string, Fill>();
  for (const b of before) {
    const o = now.get(b.id);
    const left = o && o.open ? o.qty : 0;
    const qty = b.qty - left;
    if (qty < 1) continue;
    const key = b.instr + '\n' + b.limit;
    const row = agg.get(key);
    if (row) row.qty += qty;
    else agg.set(key, { instr: b.instr, qty, cents: b.limit });
  }
  return [...agg.values()];
}

function fillSentence(w: World, fills: Fill[]): string {
  if (!fills.length) return '';
  const firms = econ(w).firms;
  const nameOf = (instr: string): string => {
    const id = instr.startsWith('eq:') ? instr.slice(3) : instr;
    return firms.find((f) => f.id === id)?.name ?? instr;
  };
  return fills.map((f) => `${f.qty} ${nameOf(f.instr)} sold at $${(f.cents / 100).toFixed(2)}`).join('; ');
}

function stampSale(w: World, eventId: number, fills: Fill[]): void {
  const sentence = fillSentence(w, fills);
  if (!sentence) return;
  const e = w.events.get(eventId);
  if (!e || /sold at \$/.test(e.msg)) return;
  const base = e.msg.replace(/\s+$/, '').replace(/\.+$/, '');
  e.msg = `${base}. ${sentence}.`;
}

/**
 * A margin loan the collateral no longer covers is called: sell what the book will take, repay that,
 * and write off whatever is still uncovered. Returns true when the loan was closed.
 */
function callMargin(w: World, s: EconState, b: Book, k: number, i: number): boolean {
  if (b.lnKind[k] !== MARGIN) return false;
  const P = s.P;
  const id = P.id(i);
  const instr = plInstr(k);
  const owed = Math.floor(w.ledger.issued.get(instr) ?? 0);
  if (owed <= 0) return false;
  if (owed <= marginLimit(w, i)) return false;
  const snap = bidSnap(w);
  const ev = w.events.emit('loan.margin', `${P.name(i)} is called on a margin loan of ${(owed / 100).toFixed(0)}`, because(s, [P.lastEv[i] >= 0 ? P.lastEv[i] : undefined]), id);
  const stocks = (w.state.markets as { stocks?: { instr: string }[] } | undefined)?.stocks ?? [];
  for (const st of stocks) {
    const qty = Math.floor(w.ledger.balance(id, st.instr));
    if (qty > 0) sellToBook(w, id, st.instr, qty, ev, true);
  }
  stampSale(w, ev, takeFills(w, snap));
  const rows = holdersOf(w, instr);
  const bank = rows.length ? bankById(b, rows[0][0]) : b.banks[b.lnBank[k]];
  if (bank) {
    const paid = repayHolder(w, bank, instr, id, Math.floor(w.ledger.balance(id, DEP)), ev);
    if (paid > 0) addOwed(b, i, -paid);
  }
  const left = Math.floor(w.ledger.issued.get(instr) ?? 0);
  const cover = marginLimit(w, i);
  if (left <= cover) return false;
  const losses = rows.map(([holder, bal]) => ({ bank: bankById(b, holder), amt: Math.floor(Math.min(bal, left - cover)) })).filter((x): x is { bank: Bank; amt: number } => !!x.bank && x.amt > 0);
  const lost = writeoffPart(w, instr, left - cover, ev);
  b.yWriteoff += lost;
  addOwed(b, i, -lost);
  s.defaults++;
  const remain = Math.floor(w.ledger.issued.get(instr) ?? 0);
  if (remain <= 1) {
    if (remain > 0) { const rest = writeoffLoan(w, instr, ev); b.yWriteoff += rest; addOwed(b, i, -rest); }
    closePersonal(w, s, b, k, i);
    afterLoss(w, s, losses, ev);
    return true;
  }
  afterLoss(w, s, losses, ev);
  return false;
}

function isPlayer(w: World, i: number): boolean {
  const p = w.state.player as { who?: number; ids?: string[]; seat?: Record<string, { who: number }> } | undefined;
  if (!p) return false;
  if (p.who === i) return true;
  if (p.seat) for (const id of p.ids ?? []) if (p.seat[id]?.who === i) return true;
  return false;
}

function listed(w: World): { instr: string; moveEv?: number }[] {
  return (w.state.markets as { stocks?: { instr: string; moveEv?: number }[] } | undefined)?.stocks ?? [];
}

function moveOf(w: World, id: number): { id: number; msg: string; actor?: string } | undefined {
  const e = w.events.get(id);
  if (!e) return;
  if (e.kind === 'mkt.move') return e;
  // A chief's mark cites the print. The print is the price fall.
  if (e.kind === 'mkt.who' && e.causes.length) return moveOf(w, e.causes[0]);
  return;
}

/** Recent down prints in names this person still holds. A rally is not why the bank called. */
function priceFalls(w: World, id: string): number[] {
  const held: string[] = [];
  for (const st of listed(w)) if (w.ledger.balance(id, st.instr) > 0) held.push(st.instr);
  const down: number[] = [];
  const any: number[] = [];
  const take = (e: { id: number; msg: string; actor?: string } | undefined): void => {
    if (!e) return;
    const name = e.msg.split(' ')[0];
    if (!held.includes(name) && !(e.actor !== undefined && held.includes('eq:' + e.actor))) return;
    const bucket = e.msg.includes('(-') ? down : any;
    if (!bucket.includes(e.id)) bucket.push(e.id);
  };
  const evs = w.events.recent(['mkt.move'], 400);
  for (let i = evs.length - 1; i >= 0 && down.length < 3; i--) take(evs[i]);
  if (down.length < 3) for (const st of listed(w)) {
    if (st.moveEv === undefined || st.moveEv < 0) continue;
    take(moveOf(w, st.moveEv));
  }
  return (down.length ? down : any).slice(0, 3);
}

function tie(s: EconState, extra: number[]): number[] {
  const out: number[] = [];
  for (const e of extra) if (e >= 0 && !out.includes(e)) out.push(e);
  if (!out.length) out.push(s.macroEv);
  return out;
}

function depCash(w: World, id: string): number {
  return Math.floor(w.ledger.balance(id, DEP));
}

function liquidCash(w: World, id: string): number {
  let c = depCash(w, id);
  for (const bank of book(w).banks) c += Math.floor(w.ledger.balance(id, bank.depo));
  return c;
}

/** Margin loans plus deficiency judgments. Mortgages and ordinary consumer credit are left out. */
function riskyDebt(w: World, i: number): number {
  const b = book(w);
  let n = 0;
  for (let k = 0; k < b.ln; k++) {
    if (!b.lnOpen[k] || b.lnPerson[k] !== i) continue;
    if (!secured(b.lnKind[k]) && b.lnKind[k] !== DEFIC) continue;
    n += Math.floor(w.ledger.issued.get(plInstr(k)) ?? 0);
  }
  return n;
}

function liquidAssets(w: World, id: string): number {
  return liquidCash(w, id) + saleValue(w, id);
}

function loanIndexes(b: Book, i: number, kind: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < b.ln; k++) if (b.lnOpen[k] && b.lnPerson[k] === i && b.lnKind[k] === kind) out.push(k);
  return out;
}

function clearCalls(b: Book, ks: number[]): void {
  for (const k of ks) b.lnCall[k] = -1;
}

/** Sell the worst bids first until `need` cents have come in, or the book will take no more. */
function sellCollateral(w: World, id: string, need: number, cause: number, fills?: Fill[]): number {
  const before = depCash(w, id);
  const snap = bidSnap(w);
  for (let pass = 0; pass < 12 && depCash(w, id) - before < need; pass++) {
    let worst = '', qty = 0, per = Infinity;
    for (const st of listed(w)) {
      const q = Math.floor(w.ledger.balance(id, st.instr));
      if (q < 1) continue;
      const liq = saleProceeds(w, st.instr, q, id);
      if (liq < 1) continue;
      const p = liq / q;
      if (p < per) { per = p; worst = st.instr; qty = q; }
    }
    if (!worst || sellToBook(w, id, worst, qty, cause, true) < 1) break;
  }
  if (fills) for (const f of takeFills(w, snap)) fills.push(f);
  return Math.max(0, depCash(w, id) - before);
}

function repayKind(w: World, s: EconState, b: Book, i: number, kind: number, budget: number, cause: number): number {
  const P = s.P;
  let left = budget;
  for (const k of loanIndexes(b, i, kind)) {
    if (left <= 0) break;
    const bank = b.banks[b.lnBank[k]];
    if (!bank) continue;
    const instr = plInstr(k);
    const got = repayHolder(w, bank, instr, P.id(i), left, cause);
    if (got <= 0) continue;
    addOwed(b, i, -got);
    left -= got;
    const dust = Math.floor(w.ledger.issued.get(instr) ?? 0);
    if (dust <= 1) {
      if (dust > 0) { writeoffLoan(w, instr, cause); addOwed(b, i, -dust); }
      closePersonal(w, s, b, k, i);
      b.lnCall[k] = -1;
    }
  }
  return budget - left;
}

/**
 * Creditors in order: secured margin, then tax, then unsecured. Whatever the sale and the
 * cash cannot cover is redeemed on the lender's books. The borrower cannot borrow for six years.
 */
function declareBankruptcy(w: World, i: number, cause: number): boolean {
  const s = econ(w), b = book(w), P = s.P;
  if (i < 0 || i >= P.n || !P.alive(i)) return false;
  growPeople(b, i + 1);
  if (b.bust[i] === w.day) return false;
  const id = P.id(i);
  const risky = riskyDebt(w, i);
  if (risky <= 0) return false;
  const ev = w.events.emit('court.bankruptcy', `${P.name(i)} is declared bankrupt`, tie(s, [cause, ...priceFalls(w, id)]), id);
  b.bust[i] = w.day;
  for (const bank of b.banks) {
    const bal = Math.floor(w.ledger.balance(id, bank.depo));
    if (bal > 0) withdraw(w, bank, id, bal, ev);
  }
  let due = 0;
  for (let k = 0; k < b.ln; k++) {
    if (!b.lnOpen[k] || b.lnPerson[k] !== i) continue;
    if (!secured(b.lnKind[k]) && b.lnKind[k] !== DEFIC && b.lnKind[k] !== CON) continue;
    due += Math.floor(w.ledger.issued.get(plInstr(k)) ?? 0);
  }
  const gov: { instr: string; amt: number }[] = [];
  for (const [instr, inst] of w.ledger.instruments) {
    if (inst.issuer !== id || inst.kind !== 'claim' || instr.startsWith('pm_') || instr.startsWith('pl_')) continue;
    const amt = Math.floor(w.ledger.balance(GOV, instr));
    if (amt > 0) { gov.push({ instr, amt }); due += amt; }
  }
  const saleFills: Fill[] = [];
  const sale = w.events.emit('court.sale', `${P.name(i)}'s assets are sold for the creditors`, tie(s, [ev]), id);
  if (due > depCash(w, id)) sellCollateral(w, id, due - depCash(w, id), sale, saleFills);
  stampSale(w, sale, saleFills);
  const pay = w.events.emit('court.pay', `creditors of ${P.name(i)} are paid in order`, tie(s, [sale]), id);
  let pool = depCash(w, id);
  pool -= repayKind(w, s, b, i, MARGIN, pool, pay);
  pool -= repayKind(w, s, b, i, LINE, pool, pay);
  pool -= repayKind(w, s, b, i, TERM, pool, pay);
  for (const g of gov) {
    if (pool <= 0) break;
    const a = Math.min(pool, g.amt, depCash(w, id));
    if (a > 0 && w.ledger.redeem(g.instr, GOV, a, 'tax.pay', pay)) {
      if (pay(w, id, GOV, a, 'tax.pay', pay)) pool -= a;
      else w.ledger.issue(g.instr, GOV, a, 'tax.pay', pay);
    }
  }
  pool = depCash(w, id);
  repayKind(w, s, b, i, DEFIC, pool, pay);
  pool = depCash(w, id);
  repayKind(w, s, b, i, CON, pool, pay);
  const losses: { bank: Bank; amt: number }[] = [];
  let wrote = 0;
  for (let k = 0; k < b.ln; k++) {
    if (!b.lnOpen[k] || b.lnPerson[k] !== i) continue;
    if (!secured(b.lnKind[k]) && b.lnKind[k] !== DEFIC && b.lnKind[k] !== CON) continue;
    const instr = plInstr(k);
    const left = Math.floor(w.ledger.issued.get(instr) ?? 0);
    if (left <= 0) { closePersonal(w, s, b, k, i); continue; }
    const rows = holdersOf(w, instr);
    for (const [holder, bal] of rows) {
      const bank = bankById(b, holder);
      if (bank) losses.push({ bank, amt: Math.floor(Math.min(bal, left)) });
    }
    const lost = writeoffLoan(w, instr, pay);
    b.yWriteoff += lost; wrote += lost; addOwed(b, i, -lost);
    closePersonal(w, s, b, k, i);
    b.lnCall[k] = -1;
  }
  if (wrote > 0) {
    s.defaults++;
    const lender = losses.find((x) => x.bank)?.bank ?? b.banks.find((x) => x.id === BANK);
    if (lender) {
      for (const st of listed(w)) {
        const q = Math.floor(w.ledger.balance(id, st.instr));
        // The bids would not take these shares, so the secured creditor takes them in kind.
        if (q > 0) w.ledger.move(st.instr, id, lender.id, q, 'court.surrender', pay);
      }
    }
    w.events.emit('loan.writeoff', `${(wrote / 100).toFixed(0)} of ${P.name(i)}'s debt is written off`, tie(s, [pay]), id);
    afterLoss(w, s, losses, pay);
  }
  b.lock[i] = Math.max(b.lock[i], w.day + BAR_YEARS * DAYS_PER_YEAR);
  return true;
}

/** Called when new unsecured debt has just been booked. Declares if it is already more than the estate. */
export function pressInsolvency(w: World, person: number, cause: number): void {
  if (!w.state.banking) return;
  const s = econ(w);
  if (person < 0 || person >= s.P.n || !s.P.alive(person)) return;
  const id = s.P.id(person);
  if (riskyDebt(w, person) > liquidAssets(w, id)) declareBankruptcy(w, person, cause);
}

/**
 * Book an unsecured deficiency at the main bank without asking whether the bank wants the risk.
 * The cash is issued to the borrower so a margin close can pay the counterparty. Returns cents booked.
 */
/** Pay down deficiency judgments only, newest cash first. Returns cents of principal repaid. */
export function repayUnsecured(w: World, person: number, cents: number, cause: number): number {
  if (!w.state.banking || person < 0) return 0;
  return repayKind(w, econ(w), book(w), person, DEFIC, Math.round(cents), cause);
}

export function oweUnsecured(w: World, person: number, cents: number, cause: number): number {
  const s = econ(w), P = s.P;
  if (!w.state.banking || person < 0 || person >= P.n || !P.alive(person)) return 0;
  const a = Math.round(cents);
  if (a < 1) return 0;
  const b = book(w);
  let idx = b.banks.findIndex((bank) => bank.id === BANK);
  if (idx < 0) return 0;
  const bank = b.banks[idx];
  const k = growLoans(b);
  const instr = plInstr(k);
  w.ledger.define({ id: instr, kind: 'claim', issuer: P.id(person) });
  if (!grant(w, bank, instr, P.id(person), a, cause)) { b.lnOpen[k] = 0; b.lnCall[k] = -1; return 0; }
  b.lnPerson[k] = person; b.lnBank[k] = idx; b.lnKind[k] = DEFIC; b.lnRate[k] = s.policyRate + personSpread(w, s, person) + 0.02;
  b.lnMiss[k] = 0; b.lnOpen[k] = 1; b.lnOpened[k] = w.day; b.lnTerm[k] = CON_TERM; b.lnCall[k] = -1;
  addOwed(b, person, a);
  w.events.emit('loan.shortfall', `${P.name(person)} owes ${(a / 100).toFixed(0)} that the collateral did not cover`, tie(s, [cause]), P.id(person));
  return a;
}

/** Rate on a floating loan: the policy rate, the borrower's spread, the lender's margin and the crunch. */
function floatRate(w: World, s: EconState, i: number, kind: number): number {
  const b = book(w);
  return s.policyRate + personSpread(w, s, i) + (kind === LINE ? 0.006 : 0.012) + (kind === LINE ? 0.04 : 0.05) * (b.tight ?? 0);
}

/** Collateral loans of one person that the lender can call: margin loans and credit lines. */
function callable(b: Book, i: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < b.ln; k++) if (b.lnOpen[k] && b.lnPerson[k] === i && onCall(b.lnKind[k])) out.push(k);
  return out;
}

/** Each quarter the lender decides whether to roll a credit line. In a crunch it does not. */
function rollLines(w: World, s: EconState, b: Book): void {
  const P = s.P;
  for (let k = 0; k < b.ln; k++) {
    if (!b.lnOpen[k] || b.lnKind[k] !== LINE || w.day - b.lnOpened[k] < LINE_DAYS) continue;
    const i = b.lnPerson[k];
    if (i < 0 || i >= P.n || !P.alive(i)) continue;
    if ((b.tight ?? 0) < ROLL_LIMIT) {
      b.lnOpened[k] = w.day;
      const owed = Math.floor(w.ledger.issued.get(plInstr(k)) ?? 0);
      if (owed > 0) w.events.emit('loan.rolled', `the bank rolls ${P.name(i)}'s credit line of ${(owed / 100).toFixed(0)} for another quarter`, because(s, [b.tightEv]), P.id(i));
    }
  }
}

/** Daily maintenance. A call waits three trading days, then the book is hit and any gap is still owed. */
function maintainMargins(w: World, s: EconState, b: Book): void {
  const P = s.P;
  rollLines(w, s, b);
  const seen: number[] = [];
  for (let k = 0; k < b.ln; k++) {
    if (!b.lnOpen[k] || !onCall(b.lnKind[k])) continue;
    const i = b.lnPerson[k];
    if (seen.includes(i)) continue;
    seen.push(i);
    if (i < 0 || i >= P.n || !P.alive(i)) continue;
    const ks = callable(b, i);
    let owed = 0, pulled = 0;
    for (const n of ks) {
      const o = Math.floor(w.ledger.issued.get(plInstr(n)) ?? 0);
      owed += o;
      // A line past its quarter that the lender did not roll is due.
      if (b.lnKind[n] === LINE && w.day - b.lnOpened[n] >= LINE_DAYS) pulled += o;
    }
    const id = P.id(i);
    if (owed <= 0) { clearCalls(b, ks); continue; }
    // The bank's own advance: what the shares would fetch less today's haircut. A loan past that is a call.
    const cover = marginLimit(w, i);
    if (owed <= cover && pulled <= 0) { clearCalls(b, ks); continue; }
    let opened = -1;
    for (const n of ks) if (b.lnCall[n] >= 0 && (opened < 0 || b.lnCall[n] < opened)) opened = b.lnCall[n];
    const falls = priceFalls(w, id);
    let call = -1;
    if (opened < 0) {
      const worst = worstName(w, id);
      call = pulled > 0 && owed <= cover
        ? w.events.emit('loan.line', `the bank does not roll ${P.name(i)}'s credit line: ${(pulled / 100).toFixed(0)} is due in three trading days`, because(s, [b.tightEv]), id)
        : w.events.emit('loan.margin', `${P.name(i)} is called on ${worst} for ${(owed / 100).toFixed(0)}; three trading days to pay it down`, tie(s, [...falls, ...(b.tightEv !== undefined && b.tightEv >= 0 && (b.tight ?? 0) > 0.2 ? [b.tightEv] : [])]), id);
      for (const n of ks) b.lnCall[n] = w.day;
      opened = w.day;
    }
    // The lender sets off cash the borrower holds beyond a month's income before it touches the shares.
    const spare = Math.floor(depCash(w, id) - P.incEma[i] * 30);
    if (spare > 0 && (pulled > 0 || w.day >= opened + CURE_DAYS)) {
      const why0 = call >= 0 ? call : (b.tightEv ?? s.macroEv);
      const used = repayKind(w, s, b, i, LINE, spare, why0);
      repayKind(w, s, b, i, MARGIN, spare - used, why0);
      owed = 0;
      for (const n of callable(b, i)) owed += Math.floor(w.ledger.issued.get(plInstr(n)) ?? 0);
      pulled = 0;
      for (const n of callable(b, i)) if (b.lnKind[n] === LINE && w.day - b.lnOpened[n] >= LINE_DAYS) pulled += Math.floor(w.ledger.issued.get(plInstr(n)) ?? 0);
      if (owed <= 0 || (owed <= marginLimit(w, i) && pulled <= 0)) { clearCalls(b, callable(b, i)); continue; }
    }
    const sunk = owed > liquidAssets(w, id);
    if (!sunk && w.day < opened + CURE_DAYS) continue;
    const why = call >= 0 ? call : (falls[0] ?? (P.lastEv[i] >= 0 ? P.lastEv[i] : s.macroEv));
    const saleFills: Fill[] = [];
    const sell = w.events.emit('loan.sell', `the bank sells ${P.name(i)}'s shares into the book`, tie(s, [why]), id);
    const proceeds = sellCollateral(w, id, owed, sell, saleFills);
    stampSale(w, sell, saleFills);
    const first = repayKind(w, s, b, i, LINE, proceeds, sell);
    repayKind(w, s, b, i, MARGIN, proceeds - first, sell);
    let left = 0;
    for (const n of callable(b, i)) left += Math.floor(w.ledger.issued.get(plInstr(n)) ?? 0);
    if (left <= 0) { clearCalls(b, ks); continue; }
    for (const n of callable(b, i)) { b.lnKind[n] = DEFIC; b.lnCall[n] = -1; }
    const gap = w.events.emit('loan.shortfall', `${P.name(i)} still owes ${(left / 100).toFixed(0)} after the sale`, tie(s, [sell]), id);
    if (riskyDebt(w, i) > liquidAssets(w, id)) declareBankruptcy(w, i, gap);
  }
}

function worstName(w: World, id: string): string {
  let name = 'the position';
  let per = Infinity;
  for (const st of listed(w)) {
    const qty = Math.floor(w.ledger.balance(id, st.instr));
    if (qty < 1) continue;
    const p = saleProceeds(w, st.instr, qty, id) / qty;
    if (p < per) { per = p; name = st.instr; }
  }
  return name;
}

function servicePeople(w: World, s: EconState, b: Book): void {
  const P = s.P;
  const hit: { bank: Bank; amt: number; ev: number }[] = [];
  for (let k = 0; k < b.ln; k++) {
    if (!b.lnOpen[k]) continue;
    const i = b.lnPerson[k];
    const instr = plInstr(k);
    const owed = Math.floor(w.ledger.issued.get(instr) ?? 0);
    const rows = holdersOf(w, instr);
    const bank = rows.length ? bankById(b, rows[0][0]) : b.banks[b.lnBank[k]];
    if (owed <= 0 || !P.alive(i) || !bank) {
      if (owed > 0 && bank) {
        const ev = w.events.emit('loan.default', `${P.alive(i) ? P.name(i) : 'a borrower'} defaulted on ${(owed / 100).toFixed(0)}`, because(s, [P.lastEv[i] >= 0 ? P.lastEv[i] : undefined]), P.id(i));
        const losses = rows.map(([holder, bal]) => ({ bank: bankById(b, holder), amt: Math.floor(bal) })).filter((x): x is { bank: Bank; amt: number } => !!x.bank && x.amt > 0);
        b.yWriteoff += writeoffLoan(w, instr, ev);
        addOwed(b, i, -owed);
        afterLoss(w, s, losses, ev);
        void hit;
      }
      closePersonal(w, s, b, k, i);
      continue;
    }
    if (b.lnKind[k] === MARGIN || b.lnKind[k] === LINE) b.lnRate[k] = floatRate(w, s, i, b.lnKind[k]);
    const leftTerm = Math.max(1, b.lnTerm[k] - Math.max(0, Math.floor((w.day - b.lnOpened[k]) / 30)));
    const interest = Math.round(owed * b.lnRate[k] / 12);
    const paidI = payInterest(w, bank, P.id(i), interest, s.rateEv);
    const spare = Math.floor(w.ledger.balance(P.id(i), DEP) - P.incEma[i] * 40);
    const paidP = b.lnKind[k] !== LINE && paidI + 1 >= interest && spare > 0 ? repayHolder(w, bank, instr, P.id(i), Math.min(spare, Math.round(owed / leftTerm)), s.macroEv) : 0;
    if (paidP > 0) addOwed(b, i, -paidP);
    b.lnMiss[k] = paidI + 1 < interest ? Math.min(250, b.lnMiss[k] + 1) : 0;
    const left = Math.floor(w.ledger.issued.get(instr) ?? 0);
    if (left <= 1) {
      if (left > 0) { writeoffLoan(w, instr, s.macroEv); addOwed(b, i, -left); }
      closePersonal(w, s, b, k, i);
      continue;
    }
    if (b.lnMiss[k] < 3) continue;
    if (secured(b.lnKind[k]) || b.lnKind[k] === DEFIC) {
      declareBankruptcy(w, i, P.lastEv[i] >= 0 ? P.lastEv[i] : s.macroEv);
      continue;
    }
    const ev = w.events.emit('loan.default', `${P.name(i)} missed three payments on ${(left / 100).toFixed(0)}`, because(s, [P.lastEv[i] >= 0 ? P.lastEv[i] : undefined]), P.id(i));
    const losses = rows.map(([holder, bal]) => ({ bank: bankById(b, holder), amt: Math.floor(Math.min(bal, left)) })).filter((x): x is { bank: Bank; amt: number } => !!x.bank && x.amt > 0);
    const lost = writeoffLoan(w, instr, ev);
    b.yWriteoff += lost; addOwed(b, i, -lost); b.lnMiss[k] = 0;
    growPeople(b, i + 1); b.lock[i] = w.day + BAR_YEARS * DAYS_PER_YEAR;
    if (b.lnKind[k] === MTG) {
      b.mtg[i] = 0;
      const home = w.ledger.balance(P.id(i), 'dwelling');
      if (home > 0) w.ledger.consume('dwelling', P.id(i), home, 'foreclose', ev);
    }
    closePersonal(w, s, b, k, i);
    afterLoss(w, s, losses, ev);
  }
}

function depositAt(w: World, bank: Bank, id: string, amount: number, cause: number): boolean {
  dirtyFin(w);
  const a = Math.round(amount);
  if (a <= 0 || bank.failed) return false;
  if (bank.id === BANK) {
    if (!w.ledger.redeem(DEP, id, a, 'deposit.place', cause)) return false;
    w.ledger.issue(bank.depo, id, a, 'deposit.place', cause);
    return true;
  }
  if (!pay(w, id, bank.id, a, 'deposit.place', cause)) return false;
  w.ledger.issue(bank.depo, id, a, 'deposit.place', cause);
  return true;
}

function sweep(w: World, s: EconState, b: Book): void {
  const P = s.P;
  growPeople(b, P.n);
  const ratios = b.banks.map((bn) => (bn.failed ? -1 : finances(w, bn).ratio));
  let best = 0;
  for (let k = 1; k < ratios.length; k++) if (ratios[k] > ratios[best]) best = k;
  if (ratios[best] < 0.06) return;
  const bank = b.banks[best];
  const span = Math.max(1, Math.floor(P.n / 12));
  const start = (w.month * span) % Math.max(1, P.n);
  for (let step = 0; step < span; step++) {
    const i = (start + step) % P.n;
    if (i === ((w.state.player as { who?: number } | undefined)?.who ?? -1)) continue;
    if (!P.alive(i) || P.incEma[i] <= 0 || w.day < P.fearUntil[i]) continue;
    const keep = P.incEma[i] * KEEP_DAYS;
    const extra = w.ledger.balS(P.slot[i], DEP) - keep;
    if (extra < Math.max(10_000, keep * 0.25)) continue;
    depositAt(w, bank, P.id(i), Math.floor(extra * 0.2), s.macroEv);
  }
}

function payDepoInterest(w: World, s: EconState, b: Book): void {
  const rate = Math.max(0, s.policyRate - 0.02);
  if (rate <= 0) return;
  for (const bank of b.banks) {
    if (bank.failed) continue;
    const fin = finances(w, bank);
    if (fin.ratio < 0.06 || fin.equity <= 0) continue;
    let budget = Math.floor(fin.equity * 0.02);
    for (const [id, bal] of holdersOf(w, bank.depo)) {
      const a = Math.min(budget, Math.round(bal * rate / 12));
      if (a <= 0) continue;
      const ok = bank.id === BANK ? w.ledger.issue(DEP, id, a, 'deposit.interest', s.rateEv) || true : pay(w, bank.id, id, a, 'deposit.interest', s.rateEv);
      if (!ok) continue;
      budget -= a;
      if (id.startsWith('p_')) s.P.incWeek[+id.slice(2)] += a;
      if (budget <= 0) break;
    }
  }
  dirtyFin(w);
}

function estates(w: World, s: EconState, b: Book): void {
  const P = s.P;
  for (const bank of b.banks) {
    for (const [id, bal] of holdersOf(w, bank.depo)) {
      if (!id.startsWith('p_') || P.alive(+id.slice(2)) || bal < 1) continue;
      const i = +id.slice(2);
      const sp = P.spouse[i];
      let heir = sp >= 0 && P.alive(sp) ? sp : -1;
      if (heir < 0) for (const c of P.kids(i)) if (P.alive(c)) { heir = c; break; }
      const to = heir >= 0 ? P.id(heir) : GOV;
      if (w.ledger.move(bank.depo, id, to, Math.floor(bal), heir >= 0 ? 'estate.inherit' : 'estate.escheat', s.macroEv) && heir >= 0) P.lastEv[heir] = s.macroEv;
    }
  }
}

function creditStock(w: World, s: EconState, b: Book): number {
  const L = w.ledger;
  let t = 0;
  for (const f of s.firms) t += L.issued.get(firmInstr(f)) ?? 0;
  for (let k = 0; k < b.ln; k++) if (b.lnOpen[k]) t += L.issued.get(plInstr(k)) ?? 0;
  return t;
}

function capitalise(w: World, s: EconState, id: string, payers: { i: number; cents: number }[]): Bank {
  const L = w.ledger;
  const slot = L.addActor(id, 'bank');
  const eq = 'eq:' + id;
  const depo = 'depo:' + id;
  L.define({ id: eq, kind: 'share', issuer: id });
  L.define({ id: depo, kind: 'claim', issuer: id });
  s.shareIds.push(eq);
  const total = payers.reduce((t, p) => t + p.cents, 0);
  let leftSh = 10_000;
  payers.forEach((p, k) => {
    const sh = k === payers.length - 1 ? leftSh : Math.min(leftSh, total > 0 ? Math.round(10_000 * p.cents / total) : 0);
    leftSh -= sh;
    if (p.cents <= 0) return;
    if (!pay(w, s.P.id(p.i), id, p.cents, 'genesis.equity', w.genesis)) return;
    if (sh > 0) L.issue(eq, s.P.id(p.i), sh, 'genesis.equity', w.genesis);
  });
  return { id, slot, depo, failed: false, ranDay: -999, runEv: -1 };
}

/** Move sight deposits into a time deposit at the main bank. Returns cents placed. */
export function depositSight(w: World, holder: string, cents: number, cause: number): number {
  const bank = book(w).banks.find((b) => b.id === BANK);
  if (!bank || bank.failed) return 0;
  const a = Math.min(Math.round(cents), Math.floor(w.ledger.balance(holder, DEP)));
  return a > 0 && depositAt(w, bank, holder, a, cause) ? a : 0;
}

/** Turn a time deposit back into spendable cash. Returns cents paid out. */
export function withdrawSight(w: World, holder: string, cents: number, cause: number): number {
  const bank = book(w).banks.find((b) => b.id === BANK);
  if (!bank) return 0;
  return withdraw(w, bank, holder, cents, cause);
}

function unitPrice(s: EconState, good: string): number {
  let n = 0, p = 0;
  for (const f of s.firms) if (f.good === good && !f.closed) { p += f.price; n++; }
  return n ? p / n : 0;
}

/** One private share at book: machinery at what it costs to replace. Listed names use the market mark. */
function bookPerShare(w: World, f: Firm): number {
  const sh = Math.floor(w.ledger.issued.get('eq:' + f.id) ?? 0);
  if (sh < 1) return 0;
  const s = econ(w);
  const def = GOODS[f.good];
  const capPx = def ? 360 * s.wage / Math.max(0.01, def.prod) : 0;
  const eq = Math.round(w.ledger.netWorth(f.id, (instr) => {
    if (instr === CAPITAL) return capPx;
    if (instr.startsWith('good:')) return unitPrice(s, instr.slice(5));
    return 0;
  }));
  return eq > 0 ? eq / sh : 0;
}

const LEND_HAIRCUT = 0.5;
const TERM_HAIRCUT = 0.55;

/** The haircut lenders take on shares: half in an easy market, up to three quarters in a crunch. */
export function lendHaircut(w: World): number {
  return LEND_HAIRCUT + 0.25 * ((w.state.banking as Book | undefined)?.tight ?? 0);
}

/** Credit tightness 0 (easy) to 1 (lenders pulling lines). */
export function creditTightness(w: World): number {
  return (w.state.banking as Book | undefined)?.tight ?? 0;
}

/**
 * What this person's shares would fetch, less the margin haircut.
 * A listed block is marked at the price the market would pay. A private block is marked at book.
 * The bank lends half of that. An empty bid list is not a value of zero.
 */
export function marginLimit(w: World, person: number): number {
  return Math.floor(collateralFetch(w, person) * (1 - lendHaircut(w)));
}

function collateralFetch(w: World, person: number): number {
  const s = econ(w);
  if (person < 0 || person >= s.P.n) return 0;
  const id = s.P.id(person);
  let fetch = 0;
  const listed = new Set<string>();
  const stocks = (w.state.markets as { stocks?: { instr: string }[] } | undefined)?.stocks ?? [];
  for (const st of stocks) {
    listed.add(st.instr);
    const qty = Math.floor(w.ledger.balance(id, st.instr));
    if (qty < 1) continue;
    const px = markHolding(w, id, st.instr, qty);
    if (px > 0) fetch += qty * px;
  }
  for (const f of s.firms) {
    if (f.closed) continue;
    const instr = 'eq:' + f.id;
    if (listed.has(instr)) continue;
    const qty = Math.floor(w.ledger.balance(id, instr));
    if (qty < 1) continue;
    const px = bookPerShare(w, f);
    if (px > 0) fetch += Math.round(qty * px);
  }
  return fetch;
}

/** Why a new loan is refused, or undefined when the court has not barred this person. */
export function borrowBar(w: World, person: number): string | undefined {
  const b = w.state.banking as Book | undefined;
  if (!b || person < 0 || person >= b.lock.length) return undefined;
  if (b.lock[person] > w.day) return 'the court barred you from borrowing for six years';
  return undefined;
}

export type Product = 'margin' | 'line' | 'term';

/**
 * Borrow against shares. A margin loan floats and is called when the collateral slips. A credit line is
 * cheaper but due every quarter: in a crunch the bank does not roll it. A term loan is lent against
 * a deeper haircut for three years at a fixed rate and is not called while the payments are made.
 */
export function borrowMargin(w: World, person: number, cents: number, cause: number, product: Product = 'margin'): { taken: number; rate: number; why?: string } {
  const s = econ(w), P = s.P;
  if (person < 0 || person >= P.n || !P.alive(person)) return { taken: 0, rate: 0, why: 'the borrower is dead' };
  const barred = borrowBar(w, person);
  if (barred) return { taken: 0, rate: 0, why: barred };
  const b = book(w);
  const tight = b.tight ?? 0;
  if (product === 'line' && tight >= ROLL_LIMIT) return { taken: 0, rate: 0, why: 'lenders are not writing credit lines in this market' };
  if (product === 'term' && tight >= 0.8) return { taken: 0, rate: 0, why: 'lenders are not writing term loans in this market' };
  if (tight >= 0.9) return { taken: 0, rate: 0, why: 'the banks have stopped lending against shares' };
  let owed = 0;
  let called = false;
  for (let k = 0; k < b.ln; k++) {
    if (!b.lnOpen[k] || b.lnPerson[k] !== person || !secured(b.lnKind[k])) continue;
    owed += Math.floor(w.ledger.issued.get(plInstr(k)) ?? 0);
    if (b.lnCall[k] >= 0) called = true;
  }
  if (called) return { taken: 0, rate: 0, why: 'a margin call is open' };
  const limit = product === 'term' ? Math.floor(collateralFetch(w, person) * (1 - TERM_HAIRCUT - 0.2 * tight)) : marginLimit(w, person);
  const room = Math.max(0, limit - owed);
  const ask = Math.min(Math.round(cents), room);
  if (ask < 1) return { taken: 0, rate: 0, why: 'the bank lends against what the shares would fetch, and less when the block is large against daily volume' };
  // A bidder passes the firm's cause list. A posting needs one event id.
  let posted = cause as unknown;
  if (typeof posted !== 'number' || !(posted >= 0)) {
    const list = Array.isArray(posted) ? posted : [];
    posted = -1;
    for (const c of list) if (typeof c === 'number' && c >= 0) { posted = c; break; }
    if (typeof posted !== 'number' || posted < 0) posted = s.macroEv >= 0 ? s.macroEv : w.genesis;
  }
  const slot = b.ln;
  const kind = product === 'line' ? LINE : product === 'term' ? TERM : MARGIN;
  const taken = openPersonal(w, s, person, kind, ask, posted as number);
  if (taken <= 0) return { taken: 0, rate: 0, why: 'the bank refused the loan' };
  // The line is cheaper than margin; the term loan pays for the lender's certainty.
  if (kind === LINE) b.lnRate[slot] = floatRate(w, s, person, LINE);
  else if (kind === TERM) b.lnRate[slot] += 0.01;
  return { taken, rate: b.lnRate[slot] };
}

/** Repay personal loans, margin loans first. Returns cents of principal repaid. */
export function repayPerson(w: World, person: number, cents: number, cause: number): number {
  const b = book(w), s = econ(w), P = s.P;
  let left = Math.round(cents), paid = 0;
  const order: number[] = [];
  for (const kind of [MARGIN, LINE, TERM]) for (let k = 0; k < b.ln; k++) if (b.lnOpen[k] && b.lnPerson[k] === person && b.lnKind[k] === kind) order.push(k);
  for (let k = 0; k < b.ln; k++) if (b.lnOpen[k] && b.lnPerson[k] === person && !secured(b.lnKind[k])) order.push(k);
  for (const k of order) {
    if (left <= 0) break;
    const bank = b.banks[b.lnBank[k]];
    if (!bank) continue;
    const instr = plInstr(k);
    const got = repayHolder(w, bank, instr, P.id(person), left, cause);
    if (got <= 0) continue;
    addOwed(b, person, -got);
    left -= got;
    paid += got;
    const dust = Math.floor(w.ledger.issued.get(instr) ?? 0);
    if (dust <= 1) {
      if (dust > 0) { writeoffLoan(w, instr, cause); addOwed(b, person, -dust); }
      closePersonal(w, s, b, k, person);
    }
  }
  return paid;
}

/** Destroy a fraction of a firm's installed machinery and queue that quantity for replacement. Returns the replacement cost in cents. */
export function damageCapital(w: World, firmId: string, fraction: number, cause: number): number {
  if (!w.state.banking || !(fraction > 0)) return 0;
  const s = econ(w);
  const f = s.firms.find((x) => x.id === firmId);
  if (!f || f.closed) return 0;
  const have = w.ledger.balance(f.id, CAPITAL);
  const qty = Math.min(have, have * Math.min(1, fraction));
  if (!(qty > 1e-6)) return 0;
  if (!w.ledger.consume(CAPITAL, f.id, qty, 'hazard.damage', cause)) return 0;
  const b = book(w);
  growFirms(b, s.firms.length);
  if (f.idx < b.need.length) b.need[f.idx] += qty;
  return Math.round(qty * centsPerUnit(s, f));
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/**
 * The credit cycle. Lenders tighten when write-offs rise, when the policy rate has climbed over the year,
 * when shares have fallen from their peak and when a bank's own capital is thin. Tightness rises fast and
 * eases slowly, so the crunch outlasts the news that caused it.
 */
function updateCredit(w: World, s: EconState, b: Book): void {
  const ring = 12;
  b.rateHist = b.rateHist ?? [];
  b.idxHist = b.idxHist ?? [];
  const idx = (w.state.markets as { index?: number } | undefined)?.index ?? 100;
  const credit = Math.max(1, creditStock(w, s, b));
  const wo = Math.max(0, b.yWriteoff - (b.woSeen ?? 0));
  b.woSeen = b.yWriteoff;
  b.woEma = (b.woEma ?? 0) * 0.8 + 0.2 * (12 * wo / credit);
  const climb = b.rateHist.length >= ring ? s.policyRate - b.rateHist[0] : 0;
  const peak = Math.max(idx, ...b.idxHist);
  const drawdown = peak > 0 ? 1 - idx / peak : 0;
  let weak = 1;
  for (const bank of b.banks) if (!bank.failed) weak = Math.min(weak, finances(w, bank).ratio);
  const target = clamp01(0.3 * clamp01((b.woEma - 0.005) / 0.03) + 0.3 * clamp01(climb / 0.04) + 0.45 * clamp01((drawdown - 0.12) / 0.3) + 0.4 * clamp01((0.06 - weak) / 0.03));
  const was = b.tight ?? 0;
  const now = was + (target > was ? 0.5 : 0.1) * (target - was);
  b.tight = now;
  b.rateHist.push(s.policyRate); if (b.rateHist.length > ring) b.rateHist.shift();
  b.idxHist.push(idx); if (b.idxHist.length > ring) b.idxHist.shift();
  const why = [s.rateEv, s.macroEv];
  if (was < 0.3 && now >= 0.3) {
    b.tightEv = w.events.emit('credit.tighten', `lenders tighten: write-offs ${(b.woEma * 100).toFixed(1)}% a year, rates up ${(climb * 100).toFixed(1)} points, shares ${(drawdown * 100).toFixed(0)}% off the peak. Haircuts rise to ${(100 * (LEND_HAIRCUT + 0.25 * now)).toFixed(0)}% and credit lines stop rolling`, because(s, why), BANK);
  } else if (was >= 0.2 && now < 0.2) {
    b.tightEv = w.events.emit('credit.ease', 'lenders loosen: haircuts fall back and credit lines roll again', because(s, why), BANK);
  } else if (b.tightEv === undefined) b.tightEv = s.rateEv;
}

export const banking: Module = {
  id: 'banking',

  init(w) {
    const s = econ(w), L = w.ledger, P = s.P;
    L.define({ id: CAPITAL, kind: 'real' });
    L.define({ id: 'dwelling', kind: 'real' });
    for (const f of s.firms) {
      L.define({ id: firmInstr(f), kind: 'claim', issuer: f.id });
      const units = f.eff * GOODS[f.good].prod * BUFFER;
      if (units > 0) L.produce(CAPITAL, f.id, units, 'genesis', w.genesis);
    }
    // No machinery is made for free at genesis. A shelf of four months' worth of wear, sold to the firms that order it,
    // was an investment boom the opening staffing never counted, a windfall dividend to the machinery maker's owners,
    // and then a bust when it ran out in month six.
    L.define({ id: 'depo:' + BANK, kind: 'claim', issuer: BANK });
    const people: number[] = [];
    for (let i = 0; i < P.n; i++) if (P.alive(i) && P.incEma[i] > 0) people.push(i);
    people.sort((a, c) => L.balS(P.slot[c], DEP) - L.balS(P.slot[a], DEP) || a - c);
    const rich = people.slice(0, Math.max(10, Math.floor(people.length * 0.05)));
    const stake = rich.map((i) => ({ i, cents: Math.floor(Math.max(0, L.balS(P.slot[i], DEP) - P.incEma[i] * KEEP_DAYS) * 0.7) }));
    const names = ['bank_2', 'bank_3', 'bank_4'];
    const slices = names.map(() => stake.map((p) => ({ i: p.i, cents: 0 })));
    for (let k = 0; k < stake.length; k++) {
      let left = stake[k].cents;
      for (let n = 0; n < names.length; n++) {
        const c = n === names.length - 1 ? left : Math.floor(stake[k].cents / names.length);
        slices[n][k].cents = c;
        left -= c;
      }
    }
    const banks: Bank[] = [{ id: BANK, slot: s.bankSlot, depo: 'depo:' + BANK, failed: false, ranDay: -999, runEv: -1 }];
    names.forEach((id, n) => banks.push(capitalise(w, s, id, slices[n])));
    const nF = s.firms.length, nP = Math.max(16, P.n), cap = 256;
    const b: Book = {
      banks,
      hot: new Uint8Array(nF), need: new Float64Array(nF), firmMiss: new Uint8Array(nF), firmRate: new Float64Array(nF), firmRefuse: new Int32Array(nF),
      ln: 0, lnCap: cap, lnPerson: new Int32Array(cap), lnBank: new Uint8Array(cap), lnKind: new Uint8Array(cap), lnRate: new Float64Array(cap),
      lnMiss: new Uint8Array(cap), lnOpen: new Uint8Array(cap), lnOpened: new Int32Array(cap), lnTerm: new Uint16Array(cap),
      lnCall: new Int32Array(cap).fill(-1),
      owed: new Float64Array(nP), mtg: new Uint8Array(nP), lock: new Int32Array(nP), bust: new Int32Array(nP).fill(-1),
      yInvest: 0, yWriteoff: 0, finDay: -1, finCache: [], payroll: false, machPerDay: 0, housePerDay: 0, houseHot: 0,
      lendFirm: (world, st, f, cents, cause) => { book(world).payroll = true; return lendFirm(world, st, f, cents, cause); },
    };
    w.state.banking = b;
  },

  dayClose(w) {
    const s = econ(w), b = book(w);
    growFirms(b, s.firms.length);
    deliver(w, s, b);
    pinSales(s, b);
    maintainMargins(w, s, b);
    if ((w.day + 1) % 30 !== 0) return;
    serviceFirms(w, s, b);
    planInvestment(w, s, b);
    deliver(w, s, b);
    servicePeople(w, s, b);
    housingOrders(w, s, b);
    consumerCredit(w, s, b);
    if (w.day > 0 && w.day % DAYS_PER_YEAR === 0) estates(w, s, b);
  },

  monthEnd(w) {
    const s = econ(w), b = book(w);
    b.finDay = -1; // economy month-end changes bank equity before this runs
    for (const bank of b.banks) if (!bank.failed && finances(w, bank).equity < 0) resolve(w, s, bank, s.rateEv);
    updateCredit(w, s, b);
    payDepoInterest(w, s, b);
    sweep(w, s, b);
  },

  stats(w) {
    const s = econ(w), b = book(w);
    let weak = Infinity;
    for (const bank of b.banks) weak = Math.min(weak, finances(w, bank).ratio);
    const credit = creditStock(w, s, b);
    const out = {
      invest_M: +(b.yInvest / DAYS_PER_YEAR / 1e8).toFixed(3),
      credit_M: +(credit / 1e8).toFixed(2),
      default_pct: +((b.yWriteoff / Math.max(1, credit + b.yWriteoff)) * 100).toFixed(2),
      weakBank_pct: +(weak * 100).toFixed(1),
      tight: +(b.tight ?? 0).toFixed(2),
    };
    b.yInvest = 0; b.yWriteoff = 0;
    return out;
  },
};
