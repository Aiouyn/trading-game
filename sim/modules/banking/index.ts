// Business investment, banks and credit.
// Each firm has a capital stock of machinery on the ledger. Capacity in the economy is the tighter of
// staff and that stock. Busy firms replace what wears out and, after three hot months, order more from
// the machinery makers, paid from retained earnings and then a loan. Households order homes from the
// housing builders the same way. Four banks compete for those loans. Spendable money stays `dep`.
import { DAYS_PER_YEAR, type Module, type World } from '../../kernel/index.ts';
import { GOODS } from '../economy/content.ts';
import { BANK, CAPITAL, DEP, GOV, type EconState, type Firm, pay } from '../economy/index.ts';
import { thought } from '../economy/people.ts';

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
const MTG = 1, CON = 2;
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
  owed: Float64Array;
  mtg: Uint8Array;
  lock: Int32Array;
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
  for (const f of s.firms) if (f.good === good) out.push(f);
  return out;
};
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
  if (n <= b.owed.length) return;
  const m = Math.max(n, b.owed.length * 2);
  const owed = new Float64Array(m); owed.set(b.owed); b.owed = owed;
  const mtg = new Uint8Array(m); mtg.set(b.mtg); b.mtg = mtg;
  const lock = new Int32Array(m); lock.set(b.lock); b.lock = lock;
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
    const rate = s.policyRate + spread + margin;
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
  if (bank.id === BANK) return w.ledger.redeem(DEP, borrower, a, 'loan.interest', cause) ? a : 0;
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
  b.lnMiss[k] = 0; b.lnOpen[k] = 1; b.lnOpened[k] = w.day; b.lnTerm[k] = kind === MTG ? MTG_TERM : CON_TERM;
  addOwed(b, i, pick.take);
  if (kind === MTG) { growPeople(b, i + 1); b.mtg[i] = 1; }
  const what = kind === MTG ? 'mortgage' : kind === 3 ? 'margin loan' : 'consumer loan';
  w.events.emit('loan.grant', `${P.name(i)} takes a ${what} of ${(pick.take / 100).toFixed(0)} from ${bank.id} at ${(pick.rate * 100).toFixed(1)}%`, because(s, [P.lastEv[i] >= 0 ? P.lastEv[i] : s.macroEv]), P.id(i));
  return pick.take;
}

function lossThought(w: World, s: EconState, id: string, lost: number, held: number, cause: number, why: string): void {
  if (!id.startsWith('p_') || lost <= 0) return;
  const i = +id.slice(2);
  const income = s.P.incEma[i] || s.wage;
  if (lost >= 0.2 * Math.max(held, 1) || lost >= income * 60) thought(w, s, i, 300, why, cause);
}

function haircutClaim(w: World, s: EconState, instr: string, hole: number, cause: number): void {
  dirtyFin(w);
  const rows = holdersOf(w, instr);
  const issued = rows.reduce((t, [, v]) => t + v, 0);
  let left = Math.min(Math.max(0, Math.round(hole)), Math.floor(issued));
  if (left <= 0 || issued <= 0) return;
  for (let pass = 0; pass < 2 && left > 0; pass++) {
    for (let i = 0; i < rows.length && left > 0; i++) {
      const [id, bal] = rows[i];
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
  for (const f of s.firms) {
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
  for (const f of s.firms) {
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
  const makers = firmsMaking(s, 'MACHINERY');
  if (!makers.length) { b.machPerDay = 0; return; }
  const price = makers.reduce((t, m) => t + m.price, 0) / makers.length;
  let machQty = 0;
  for (let i = 0; i < s.firms.length; i++) {
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
  const rank = s.firms.map((_, i) => i).sort((a, c) => {
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
    if (!P.alive(i) || P.employer[i] < 0 || P.incEma[i] < s.wage * 0.6) continue;
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
    if (!P.alive(i) || P.employer[i] < 0 || P.incEma[i] < s.wage * 0.8) continue;
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
    const leftTerm = Math.max(1, b.lnTerm[k] - Math.max(0, Math.floor((w.day - b.lnOpened[k]) / 30)));
    const interest = Math.round(owed * b.lnRate[k] / 12);
    const paidI = payInterest(w, bank, P.id(i), interest, s.rateEv);
    const spare = Math.floor(w.ledger.balance(P.id(i), DEP) - P.incEma[i] * 40);
    const paidP = paidI + 1 >= interest && spare > 0 ? repayHolder(w, bank, instr, P.id(i), Math.min(spare, Math.round(owed / leftTerm)), s.macroEv) : 0;
    if (paidP > 0) addOwed(b, i, -paidP);
    b.lnMiss[k] = paidI + 1 < interest ? Math.min(250, b.lnMiss[k] + 1) : 0;
    const left = Math.floor(w.ledger.issued.get(instr) ?? 0);
    if (left <= 1) {
      if (left > 0) { writeoffLoan(w, instr, s.macroEv); addOwed(b, i, -left); }
      closePersonal(w, s, b, k, i);
      continue;
    }
    if (b.lnMiss[k] < 3) continue;
    const ev = w.events.emit('loan.default', `${P.name(i)} missed three payments on ${(left / 100).toFixed(0)}`, because(s, [P.lastEv[i] >= 0 ? P.lastEv[i] : undefined]), P.id(i));
    const losses = rows.map(([holder, bal]) => ({ bank: bankById(b, holder), amt: Math.floor(Math.min(bal, left)) })).filter((x): x is { bank: Bank; amt: number } => !!x.bank && x.amt > 0);
    const lost = writeoffLoan(w, instr, ev);
    b.yWriteoff += lost; addOwed(b, i, -lost); b.lnMiss[k] = 0;
    growPeople(b, i + 1); b.lock[i] = w.day + DAYS_PER_YEAR;
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

/** A margin loan against listed shares, at the bank's quoted rate. Kind 3 is serviced with the other personal loans. */
export function borrowMargin(w: World, person: number, cents: number, cause: number): { taken: number; rate: number; why?: string } {
  const s = econ(w), P = s.P;
  if (person < 0 || person >= P.n || !P.alive(person)) return { taken: 0, rate: 0, why: 'the borrower is dead' };
  const id = P.id(person);
  let col = 0;
  const stocks = (w.state.markets as { stocks?: { instr: string; last: number }[] } | undefined)?.stocks ?? [];
  for (const st of stocks) col += Math.floor(w.ledger.balance(id, st.instr) * st.last);
  const ask = Math.min(Math.round(cents), Math.floor(col * 0.5));
  if (ask < 1) return { taken: 0, rate: 0, why: 'the bank lends up to half the market value of shares pledged' };
  const q = quote(w, s, personSpread(w, s, person), ask);
  if (!q) return { taken: 0, rate: 0, why: 'the bank refused the loan' };
  const slot = book(w).ln;
  const taken = openPersonal(w, s, person, 3, ask, cause);
  if (taken <= 0) return { taken: 0, rate: 0, why: 'the bank refused the loan' };
  return { taken, rate: book(w).lnRate[slot] || q.rate };
}

/** Repay personal loans, margin loans first. Returns cents of principal repaid. */
export function repayPerson(w: World, person: number, cents: number, cause: number): number {
  const b = book(w), s = econ(w), P = s.P;
  let left = Math.round(cents), paid = 0;
  const order: number[] = [];
  for (let k = 0; k < b.ln; k++) if (b.lnOpen[k] && b.lnPerson[k] === person && b.lnKind[k] === 3) order.push(k);
  for (let k = 0; k < b.ln; k++) if (b.lnOpen[k] && b.lnPerson[k] === person && b.lnKind[k] !== 3) order.push(k);
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
    const makers = firmsMaking(s, 'MACHINERY');
    if (makers.length) {
      const price = Math.max(1, makers.reduce((t, m) => t + m.price, 0) / makers.length);
      let qty = 0;
      for (const f of s.firms) qty += f.eff * GOODS[f.good].prod * BUFFER * WEAR * 4 * centsPerUnit(s, f) / price;
      L.produce('good:MACHINERY', makers[0].id, qty, 'genesis', w.genesis);
    }
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
      owed: new Float64Array(nP), mtg: new Uint8Array(nP), lock: new Int32Array(nP),
      yInvest: 0, yWriteoff: 0, finDay: -1, finCache: [], payroll: false, machPerDay: 0, housePerDay: 0, houseHot: 0,
      lendFirm: (world, st, f, cents, cause) => { book(world).payroll = true; return lendFirm(world, st, f, cents, cause); },
    };
    w.state.banking = b;
  },

  dayClose(w) {
    const s = econ(w), b = book(w);
    deliver(w, s, b);
    pinSales(s, b);
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
    };
    b.yInvest = 0; b.yWriteoff = 0;
    return out;
  },
};
