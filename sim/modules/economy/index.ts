// Seed economy: the reference module. A closed, stock-flow consistent loop:
//   people work -> wages -> consumption -> firm revenue -> profit -> tax, interest, dividends -> people
// Every person is simulated: name, family, age, skill, employer, their own bank balance, needs and stress.
// Mechanics taken from the Dwarf Fortress decompilation (docs in the owner's notes): needs are timers that
// fire thoughts at thresholds; a personality trait dampens each thought (none / half / a tenth / immune);
// positions are refilled heirs-first with recursive vacancies; life events run in one yearly pass.
// with a bank that creates money by lending, a government, and a central bank that reacts to inflation.
// Random draws: tagged outside shocks (sim/content/shocks.txt) and individual life events (traits at birth, death, pairing, births).
// All content (goods, recipes, firms, shocks, positions) comes from the text files in sim/content/.
// Later modules replace parts of this (markets, firm detail, banking); the pattern to copy is:
// state in w.state.economy, money only through the ledger, every event with a cause.
import { DAYS_PER_YEAR, type Module, type World } from '../../kernel/index.ts';
import { CEO_POSITION, FIRM_DEFS, GOODS, OPEN_TRADE, SECTOR_GROWTH, SHOCKS, type GoodDef, type ShockDef } from './content.ts';
import { People, PRISON, joinFirm, leaveJob, seekCopy, seekCount, seekLive, seekPromote, seekRebuild, seekReset, setSimDay, succession, thought, yearlyLifePass } from './people.ts';

export const DEP = 'dep';          // bank deposits: the money everyone pays with
export const BANK = 'bank_1', GOV = 'gov', CB = 'cb', CLEAR = 'clearing';
export const CAPITAL = 'capital'; // installed machinery: one unit makes one unit of the firm's good per day
export const BOND = 'bond:gov';

const CONSUMER_GOODS = Object.values(GOODS).filter((g) => g.share > 0);
const GOV_GOODS = Object.values(GOODS).filter((g) => g.gov > 0);
const GOOD_INSTR: Record<string, string> = {};
const INPUTS: Record<string, [string, number][]> = {};
for (const g of Object.values(GOODS)) { GOOD_INSTR[g.good] = 'good:' + g.good; INPUTS[g.good] = Object.entries(g.inputs); }
export const POPULATION = +(process.env.SIM_POP ?? 20_000);
const PAY_EVERY = 7; // wages, benefits and shopping run weekly per person
const MARKUP = 1.2, INV_DAYS = 5;
// Share of a firm's after-tax profit, net of loan interest, paid to its owners every week. The rest goes against the founding loan. Without it the whole profit went to the bank for two years and the owners' spending, which the opening plan counts, was missing; later the loans ran out and the dividends arrived all at once.
const DIV_PAYOUT = 0.7;
const DIV_REAL = 0.9; // profit the books show against the opening plan: stock builds a little before sales catch up
const INCOME_TAX = 0.12, PROFIT_TAX = 0.2, DIVIDEND_TAX = 0.35, BENEFIT_RATE = 0.4;
const NATURAL_UNEMP = 0.07;
const MATCH_RATE = 0.035, POACH_RATE = 0.001; // share of job seekers who can be hired today; share of the employed who can be poached today

export interface Firm {
  id: string; idx: number; name: string; sector: string; good: string; price: number; workers: number; expSales: number;
  slot: number; staff: number[]; eff: number; ceo: number; family: boolean; badMonths: number; ceoEv?: number; // staff: person indexes into s.P; eff = sum of staff skill
  sold: number; lost: number; unitCost: number; markup: number; made: number; soldEma: number; lostEma: number; madeEma: number;
  mRev: number; mCost: number; mStockDays: number; mPrice0: number; mUnitCost0: number; layoffEv?: number; divMtd?: number; divRate?: number;
  stockoutEv?: number; inputShortEv?: number; priceEv?: number; priceWho?: number;
  staffEv?: number; staffNoted?: number; staffMonth?: number; profitEv?: number;
  lastProfit: number; lastDividend: number; // last month's figures, for valuation
  tfp?: number; capSeen?: number; // output per worker-day relative to the content file's recipe (1 at the opening); capSeen: machinery at last month's count
  basisQty?: number; basisUnit?: number; basisSkip?: number; basisMade?: number; basisDone?: boolean; // genesis stock still to expense
  closed: boolean; listed: boolean; founder: number; bornDay: number; bornWorkers: number; listOn: number; ipoEv: number; ipoPx: number;
}
export interface EconState {
  firms: Firm[]; P: People; shareIds: string[]; govSlot: number; bankSlot: number; clearSlot: number; investors: { id: string; target: number }[]; laborForce: number; hirePtr: number; breakdowns: number; successions: number;
  wage: number; policyRate: number; cpi: number; cpiBase: number; cpiHist: number[];
  unemployment: number; shockUntil: number; shockEv?: number; shocks: { def: ShockDef; until: number; ev: number }[]; macroEv: number; wageEv: number; rateEv: number; wageWho?: number; rateWho?: number; jobsWho?: number; cpiWho?: number;
  yGdp: number; yGdpEma: number; yReal: number; mSpend: number; defaults: number; taxEma: number; taxToday: number; profitTaxDaily: number; dayGdp: number; taxRate: number; pensionEma: number; pensionToday: number; divTax: number; fiscal: number; uEma: number; taxTrend?: number; marginIn: number; prodTrend?: number; tfpIdx?: number; // prodTrend: labour-weighted monthly productivity growth, smoothed. fiscal: the government's accumulated stance, in workers' daily wages per member of the labour force. marginIn: loan interest the main bank redeemed this month, which is what deposit interest can be paid from
  taxAim?: number; profitTax?: number; divRate?: number; benefitRate?: number; inflTarget?: number;
  spendPri?: Record<string, number>; spendScale?: number;
}

const inv = (w: World, f: Firm): number => w.ledger.balS(f.slot, GOOD_INSTR[f.good]);
const cash = (w: World, a: string): number => w.ledger.balance(a, DEP);
const loanOf = (w: World, f: Firm): number => w.ledger.issued.get('loan:' + f.id) ?? 0;

/** A named office-holder, or else a living chief, so a wage, a rate or a profit has a person in its chain. */
function deskPerson(w: World, s: EconState, role: 'governor' | 'finance' | 'leader'): number {
  const pol = w.state.politics as { governor?: number; finance?: number; leader?: number } | undefined;
  const i = pol?.[role];
  if (i !== undefined && i >= 0 && i < s.P.n && s.P.alive(i)) return i;
  for (const f of s.firms) if (!f.closed && f.ceo >= 0 && f.ceo < s.P.n && s.P.alive(f.ceo)) return f.ceo;
  return -1;
}

/** Pay deposits. The bank pays by creating deposits and is paid by extinguishing them. */
export function pay(w: World, from: string, to: string, cents: number, reason: string, cause: number): boolean {
  const a = Math.round(cents);
  if (a <= 0) return true;
  if (from === BANK) { w.ledger.issue(DEP, to, a, reason, cause); return true; }
  if (to === BANK) return w.ledger.redeem(DEP, from, a, reason, cause);
  return w.ledger.move(DEP, from, to, a, reason, cause);
}
/** Negotiated multiple of the national wage. Zero means the plant is struck: no output and no pay that day. */
export type WageHook = (w: World, firmIdx: number) => number;
let wageHook: WageHook | undefined;
export function setWageHook(fn: WageHook): void { wageHook = fn; }
function wageMul(w: World, firmIdx: number): number {
  if (!wageHook) return 1;
  const m = wageHook(w, firmIdx);
  if (!(m > 0)) return 0;
  return m < 3 ? m : 3;
}
/** Slot version of pay(), for loops over people. */
export function payS(w: World, s: EconState, from: number, to: number, cents: number, reason: string, cause: number): boolean {
  const a = Math.round(cents);
  if (a <= 0) return true;
  if (from === s.bankSlot) { w.ledger.issueS(DEP, to, a, reason, cause); return true; }
  if (to === s.bankSlot) return w.ledger.redeemS(DEP, from, a, reason, cause);
  return w.ledger.moveS(DEP, from, to, a, reason, cause);
}
const clipRate = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
/** Politics turns these. Left unset, day-to-day policy stays on the constants above. */
export function setIncomeTax(w: World, rate: number): void {
  (w.state.economy as EconState).taxAim = clipRate(rate, 0.05, 0.32);
}
export function setProfitTax(w: World, rate: number): void {
  (w.state.economy as EconState).profitTax = clipRate(rate, 0.05, 0.4);
}
export function setDividendTax(w: World, rate: number): void {
  (w.state.economy as EconState).divRate = clipRate(rate, 0, 0.55);
}
export function setBenefitRate(w: World, rate: number): void {
  (w.state.economy as EconState).benefitRate = clipRate(rate, 0.2, 0.65);
}
export function setInflationTarget(w: World, rate: number): void {
  (w.state.economy as EconState).inflTarget = clipRate(rate, 0.01, 0.04);
}
export function setSpendPriority(w: World, good: string, weight: number): void {
  const s = w.state.economy as EconState;
  if (!s.spendPri) s.spendPri = {};
  s.spendPri[good] = clipRate(weight, 0.35, 2.8);
}
export function setSpendScale(w: World, scale: number): void {
  (w.state.economy as EconState).spendScale = clipRate(scale, 0.85, 1.15);
}
/** Loan interest the main bank redeemed. Deposit interest is paid from this, not printed. */
export function noteBankMargin(w: World, cents: number): void {
  const a = Math.round(cents);
  if (a <= 0) return;
  const s = w.state.economy as EconState;
  s.marginIn = (s.marginIn ?? 0) + a;
}
function inflYoY(s: EconState): number {
  const n = s.cpiHist.length;
  if (n < 2) return 0.02;
  const prev = s.cpiHist[Math.max(0, n - 13)];
  return prev > 0 ? s.cpi / prev - 1 : 0;
}
/** Share of income a household spends. At the opening 3% rate this matches the old formula, so genesis
 *  staffing is unchanged. Above that, a high real rate postpones spending: without that channel a rate
 *  rise never creates the slack that ends a wage burst. */
function spendingThrift(policy: number, yoy: number, u = NATURAL_UNEMP): number {
  const real = policy - Math.max(-0.02, Math.min(0.12, yoy));
  const cut = 0.8 * Math.max(0, policy - 0.02) + 1.4 * Math.max(0, real - 0.012);
  // A labour market under 4% unemployed is already short of people. Spending eases the same week,
  // which is what a rate hike is for, before the monthly wage bargain has indexed the shortage.
  const scarce = Math.max(0, 0.04 - u);
  return Math.max(0.74, Math.min(1.02, 1 - cut - 5 * scarce));
}
const bankEquity = (w: World): number => w.ledger.netWorth(BANK);
function totalLoans(w: World, s: EconState): number { let t = 0; for (const f of s.firms) t += loanOf(w, f); return t; }

/** A firm borrows from the banks in `w.state.banking`. They compete on rate and refuse when capital is thin. */
type CloseHook = (w: World, actor: string, cause: number) => void;
let closeHook: CloseHook | undefined;
/** Commodities registers this so a winding-up firm is taken off the futures book before its accounts go to zero. */
export function setFirmCloseHook(fn: CloseHook): void { closeHook = fn; }

/** Careers sets this. Called when a person is taken on, so the module can give them an occupation. Absent, hiring is unchanged. */
export type HireHook = (w: World, person: number, firm: Firm) => void;
let hireHook: HireHook | undefined;
export function setHireHook(fn: HireHook): void { hireHook = fn; }

/** Energy sets this. A plant fleet can cap today's output. Absent, production is unchanged. */
export type PowerHook = (w: World, f: Firm, planned: number) => number;
let powerHook: PowerHook | undefined;
export function setPowerHook(fn: PowerHook): void { powerHook = fn; }
function gridPass(w: World): number {
  const px = (w.state.energy as { pass?: number } | undefined)?.pass;
  return px !== undefined && px > 0 ? px : 0;
}

function borrow(w: World, s: EconState, f: Firm, cents: number, cause: number): boolean {
  const lend = (w.state.banking as { lendFirm?: (w: World, s: EconState, f: Firm, cents: number, cause: number) => boolean } | undefined)?.lendFirm;
  if (!lend) return false;
  return lend(w, s, f, cents, cause);
}
interface BondApi {
  fund(w: World, cents: number, cause: number): void;
  pay(w: World, to: string, cents: number, reason: string, cause: number): void;
  repay(w: World, spare: number, cause: number): void;
  coupons(w: World, cause: number): void;
}
function bondApi(w: World): BondApi | undefined {
  return (w.state.bonds as { api?: BondApi } | undefined)?.api;
}
/** Rest-of-world hooks. Absent, and therefore a no-op, when that module is off. */
interface PortHooks {
  buyer: string; exportQty: (w: World, good: string, homePx: number) => number; fundBuyer: (w: World, cents: number, cause: number) => void; noteExport: (w: World, cents: number) => void;
  importFill: (w: World, buyer: string, good: string, qty: number, dom: number, cause: number) => { got: number; spent: number }; landed: (w: World, good: string, dom: number) => number;
}
// The hooks are plain functions registered once by the module, not kept in a world's state, so a saved and reloaded
// world still trades. They act only on a world that has the rest-of-world state.
let portHooks: PortHooks | undefined;
export function registerPortHooks(h: PortHooks): void { portHooks = h; }
function abroadOf(w: World): PortHooks | undefined { return w.state.abroad ? portHooks : undefined; }
/** Make sure the government holds at least `cents`. The bond market auctions whatever is short. */
function govFund(w: World, cents: number, cause: number): void {
  const api = bondApi(w);
  if (api) { api.fund(w, cents, cause); return; }
  if (cash(w, GOV) < cents) {
    const need = Math.round(cents - cash(w, GOV) + 50_000_00);
    w.ledger.issue(BOND, BANK, need, 'gov.borrow', cause);
    w.ledger.issue(DEP, GOV, need, 'gov.borrow', cause);
  }
}
/** Government pays. If short, the bond market raises the cash first. */
function govPay(w: World, to: string, cents: number, reason: string, cause: number): void {
  const a = Math.round(cents);
  if (a <= 0) return;
  const api = bondApi(w);
  if (api) { api.pay(w, to, a, reason, cause); return; }
  if (cash(w, GOV) < a) {
    const need = a - cash(w, GOV) + 50_000_00;
    w.ledger.issue(BOND, BANK, need, 'gov.borrow', cause);
    w.ledger.issue(DEP, GOV, need, 'gov.borrow', cause);
  }
  pay(w, GOV, to, a, reason, cause);
}
let firmLists: Map<string, Firm[]> | null = null;
const firmsOf = (s: EconState, good: string): Firm[] => {
  if (firmLists) {
    const hit = firmLists.get(good);
    if (hit) return hit;
    const xs = s.firms.filter((f) => f.good === good && !f.closed);
    firmLists.set(good, xs);
    return xs;
  }
  return s.firms.filter((f) => f.good === good && !f.closed);
};
let seekBuf = new Int32Array(16);
let whoBuf = new Int32Array(16);
let paidBuf = new Float64Array(16);

/** Sell `qty` of a good to a buyer from the cheapest firms with stock. Returns { got, spent }. */
/** Split an order across rival sellers: each gets a share that falls steeply with its price relative to the cheapest
 *  (a 5% dearer rival keeps about a third of its share), capped by its stock; what is left goes cheapest-first. */
export function priceWeights(sellers: Firm[]): number[] { const pmin = Math.min(...sellers.map((f) => f.price)); return sellers.map((f) => (pmin / f.price) ** 20); }
/** Book unmet demand against the sellers that ran short of their price-weighted share, not against rivals that sold out serving others. */
function bookLost(sellers: Firm[], want: number, got: number[], weights?: number[]): void {
  const total = got.reduce((a, b) => a + b, 0);
  if (want - total <= 1e-6) return;
  const wt = weights ?? (sellers.length === 1 ? [1] : priceWeights(sellers)), tw = wt.reduce((a, b) => a + b, 0);
  let gap = 0; const short = sellers.map((_, i) => { const x = Math.max(0, want * wt[i] / tw - got[i]); gap += x; return x; });
  sellers.forEach((f, i) => { f.lost += gap > 0 ? (want - total) * short[i] / gap : (want - total) / sellers.length; });
}
export function allocate(w: World, sellers: Firm[], qty: number, weights?: number[]): number[] {
  const out = sellers.map(() => 0);
  if (qty <= 1e-9 || !sellers.length) return out;
  if (sellers.length === 1) { out[0] = Math.min(qty, inv(w, sellers[0])); return out; }
  // (Unmet demand is booked by the caller against the sellers that could not fill their share; see bookLost.)
  const wt = weights ?? priceWeights(sellers), tw = wt.reduce((a, b) => a + b, 0);
  let left = qty;
  sellers.forEach((f, i) => { const share = qty * wt[i] / tw, q = Math.min(share, inv(w, f)); out[i] = q; left -= q; });
  const order = sellers.map((_, i) => i).sort((i, j) => sellers[i].price - sellers[j].price || i - j);
  for (const i of order) { if (left <= 1e-9) break; const q = Math.min(left, inv(w, sellers[i]) - out[i]); if (q > 0) { out[i] += q; left -= q; } }
  return out;
}

function buy(w: World, s: EconState, buyer: string, good: string, qty: number, reason: string, cause: number, payFn = pay): { got: number; spent: number } {
  let got = 0, spent = 0;
  const sellers = firmsOf(s, good);
  const qs = allocate(w, sellers, qty);
  const done = sellers.map(() => 0);
  sellers.forEach((f, i) => {
    const q = qs[i];
    if (q <= 1e-9) return;
    const cost = Math.round(q * f.price);
    if (buyer !== GOV && cash(w, buyer) < cost) return;
    done[i] = q;
    if (buyer === GOV) govPay(w, f.id, cost, reason, cause); else payFn(w, buyer, f.id, cost, reason, cause);
    w.ledger.move(GOOD_INSTR[good], f.id, buyer, q, reason, cause);
    f.sold += q; f.mRev += cost; got += q; spent += cost;
    if (reason === 'trade.export') abroadOf(w)?.noteExport(w, cost);
  });
  bookLost(sellers, qty, done);
  return { got, spent };
}

/** Output-per-worker multiplier from active shocks, and the shock event to blame. */
/** Labour-weighted productivity level of the live firms in a sector: where a new firm starts. */
function sectorTfp(s: EconState, sector: string): number {
  let a = 0, b = 0;
  for (const x of s.firms) if (!x.closed && x.sector === sector && x.eff > 0) { a += x.eff * (x.tfp ?? 1); b += x.eff; }
  return b > 0 ? a / b : 1;
}
export const tfpOf = (f: Firm): number => f.tfp ?? 1;
function prodMult(s: EconState, good: string): number { let m = 1; for (const x of s.shocks) m *= (x.def.prod[good] ?? 1) * (x.def.prod.ALL ?? 1); return m; }
function demandMult(s: EconState, good: string): number { let m = 1; for (const x of s.shocks) m *= x.def.demand[good] ?? 1; return m; }
function shockCause(s: EconState, good: string): number | undefined {
  for (let k = s.shocks.length - 1; k >= 0; k--) { const x = s.shocks[k]; if (x.def.prod[good] !== undefined || x.def.prod.ALL !== undefined || x.def.demand[good] !== undefined) return x.ev; }
  return undefined;
}

function unitCost(w: World, s: EconState, f: Firm, prodEff: number, wageK = 1): number {
  const d = GOODS[f.good];
  let c = wageK === 1 ? s.wage / prodEff : s.wage * wageK / prodEff;
  const port = abroadOf(w);
  for (const [g, k] of Object.entries(d.inputs)) {
    const fs = firmsOf(s, g);
    const dom = fs.length ? Math.min(...fs.map((x) => x.price)) : 0;
    if (!(dom > 0)) continue;
    let use = port ? port.landed(w, g, dom) : dom;
    if (g === 'ELECTRICITY') use += gridPass(w);
    c += k * use;
  }
  return c;
}

/** Inputs only. The daily wage memo already pays the people who made today's ordinary output. */
function materialsPerUnit(w: World, s: EconState, f: Firm): number {
  const prodEff = Math.max(0.01, GOODS[f.good].prod * prodMult(s, f.good) * tfpOf(f));
  const wageK = wageMul(w, f.idx);
  const labour = s.wage * (wageK > 0 ? wageK : 1) / prodEff;
  return Math.max(0, f.unitCost - labour);
}

/** A build outside the daily loop: the maker is paid, but the steel was never bought. Memo cost, so the ledger is untouched. */
export function noteCommission(w: World, s: EconState, m: Firm, q: number): void {
  if (!(q > 0)) return;
  m.mCost += q * materialsPerUnit(w, s, m);
  m.basisSkip = (m.basisSkip ?? 0) + q;
}

/** Genesis stock was produced with no inputs and no wages. Expense the draw-down only:
 *  units made today are already in the wage and input memos, and commissioned units carry their own. */
function chargeOpening(f: Firm): void {
  const skip = f.basisSkip ?? 0;
  const made = f.basisMade ?? 0;
  f.basisSkip = 0;
  f.basisMade = 0;
  const left = f.basisQty ?? 0;
  if (!(left > 0)) return;
  const q = Math.min(left, Math.max(0, f.sold - skip - made));
  if (!(q > 0)) return;
  f.mCost += q * (f.basisUnit ?? 0);
  f.basisQty = left - q;
}

export const economy: Module = {
  id: 'economy',

  init(w) {
    seekReset();
    const L = w.ledger, g = w.genesis;
    L.addActor(CB, 'centralbank'); L.addActor(GOV, 'government'); L.addActor(BANK, 'bank');
    L.define({ id: DEP, kind: 'money', issuer: BANK });
    L.define({ id: BOND, kind: 'claim', issuer: GOV });
    L.define({ id: 'eq:' + BANK, kind: 'share', issuer: BANK });
    for (const d of Object.values(GOODS)) L.define({ id: 'good:' + d.good, kind: 'real' });

    L.addActor(CLEAR, 'clearing'); // a payment hub: shoppers pay in, it buys from firms, unspent money goes back the same day

    const wage = 100_00; // cents per day for skill 1.0
    const P = new People(Math.ceil(POPULATION * 1.6));
    const s: EconState = {
      firms: [], P, shareIds: ['eq:' + BANK], govSlot: L.slot(GOV), bankSlot: L.slot(BANK), clearSlot: L.slot(CLEAR),
      investors: [], laborForce: 0, hirePtr: 0, breakdowns: 0, successions: 0,
      wage, policyRate: 0.03, cpi: 1, cpiBase: 1, cpiHist: [], unemployment: 0.1, shockUntil: -1, shocks: [],
      macroEv: g, wageEv: g, rateEv: g, wageWho: g, rateWho: g, jobsWho: g, cpiWho: g, yGdp: 0, yGdpEma: 1, yReal: 0, mSpend: 0, defaults: 0, taxEma: 0, taxToday: 0, profitTaxDaily: 0, dayGdp: 0, taxRate: INCOME_TAX, pensionEma: 0, pensionToday: 0, divTax: 0, fiscal: 0, uEma: 0.08, marginIn: 0,
    };
    w.state.economy = s;

    // People first. Founding generation: ages 0 to 64.
    const rng = w.rng('genesis:people');
    for (let i = 0; i < POPULATION; i++) P.add(w, -rng.int(65) * DAYS_PER_YEAR - rng.int(DAYS_PER_YEAR), -1, -1);
    { // Founding couples: most adults over 25 start out married, to someone close in age.
      const adults: number[] = [];
      for (let i = 0; i < P.n; i++) if (w.day - P.born[i] >= 25 * DAYS_PER_YEAR) adults.push(i);
      adults.sort((a, b) => P.born[a] - P.born[b] || a - b);
      for (let k = 0; k + 1 < adults.length; k += 2) if (rng.chance(0.7)) { P.spouse[adults[k]] = adults[k + 1]; P.spouse[adults[k + 1]] = adults[k]; }
      // Founding families: most people are given parents among the couples 20 to 40 years older, and take their name.
      const couples = adults.filter((i) => P.spouse[i] > i);
      const byAge: number[] = [];
      for (let i = 0; i < P.n; i++) byAge.push(i);
      byAge.sort((a, b) => P.born[b] - P.born[a] || a - b); // youngest first
      for (const c of byAge) {
        if (!rng.chance(0.85)) continue;
        for (let t = 0; t < 40; t++) {
          const a = couples[rng.int(couples.length)], b = P.spouse[a];
          const gap = (P.born[c] - Math.max(P.born[a], P.born[b])) / DAYS_PER_YEAR;
          if (gap < 20 || gap > 40 || P.nkids[a] >= 4 || P.family[a] === P.family[c]) continue;
          P.linkChild(a, b, c); P.family[c] = P.family[a]; break;
        }
      }
    }
    const workforce: number[] = [];
    for (let i = 0; i < P.n; i++) if (P.adult(w, i)) workforce.push(i);
    s.laborForce = workforce.length;

    // Firms, staffed by named people. Prices are cost plus the normal markup. The opening budgets are the
    // ones the daily rules will actually spend: after-tax wages and benefits, and government purchases
    // funded by the tax on those wages and on profits. Founding debt takes the after-tax profit, so it is
    // not household income yet. Staff and stocks match that demand.
    const price0: Record<string, number> = {};
    for (const gd of Object.values(GOODS)) price0[gd.good] = wage / gd.prod;
    for (let it = 0; it < 200; it++) for (const gd of Object.values(GOODS)) {
      let c = wage / gd.prod; for (const [i, k] of Object.entries(gd.inputs)) c += k * price0[i];
      price0[gd.good] = c * MARKUP;
    }
    const skills = workforce.reduce((t, p) => t + P.skill[p], 0);
    // The city opens at about 5.5% unemployment and the target rate of inflation, and the central bank opens at the rate its own rule gives there.
    // Opening at 3% meant a rate rise in the first quarter, which the plan below had not counted.
    const eFrac = 0.95;
    {
      const infl = (Math.pow(1.02, 11 / 12) - 1 + Math.pow(1.02, 2 / 3) - 1) / 2, uGap = NATURAL_UNEMP - (1 - eFrac);
      const target = 0.02 + infl + 0.5 * (infl - 0.02) + (uGap > 0.025 && infl < 0.045 ? 1.1 : 0.5) * uGap;
      s.policyRate = Math.round(Math.max(0, Math.min(0.2, target)) * 400) / 400;
    }
    const thrift0 = spendingThrift(s.policyRate, inflYoY(s));
    let cySum = 0; for (const p of workforce) cySum += P.cY[p];
    const mpc = cySum / Math.max(1, workforce.length) * thrift0;
    // Days of a person's own gross wage at which an average adult spends the whole after-tax wage and no more.
    let saveDays = (1 - INCOME_TAX) * (1 - mpc) / 0.001;
    const saveDays0 = saveDays, DEBT_DAYS = 175;
    const owners = [...workforce].sort((a, b) => P.skill[b] - P.skill[a] || a - b).slice(0, Math.max(10, Math.round(workforce.length * 0.05)));
    const wsum = owners.reduce((t, p) => t + P.skill[p] ** 3, 0);
    let eSkill = (1 - NATURAL_UNEMP) * skills;
    const chain = (hhW: number, govW: number): { labour: number; revenue: number; finalV: number; gross: Record<string, number> } => {
      const gross: Record<string, number> = {}, fin: Record<string, number> = {};
      for (const gd of Object.values(GOODS)) { fin[gd.good] = (gd.share * hhW + gd.gov * govW) / price0[gd.good]; gross[gd.good] = fin[gd.good]; }
      for (let it = 0; it < 200; it++) {
        const nxt: Record<string, number> = { ...fin };
        for (const gd of Object.values(GOODS)) for (const [i, k] of Object.entries(gd.inputs)) nxt[i] += k * gross[gd.good] * (1 - (OPEN_TRADE.importShare[i] ?? 0));
        for (const [i, x] of Object.entries(OPEN_TRADE.exportFrac)) nxt[i] += x * gross[i];
        Object.assign(gross, nxt);
      }
      let labour = 0, revenue = 0, finalV = 0;
      for (const gd of Object.values(GOODS)) { labour += gross[gd.good] / gd.prod; revenue += gross[gd.good] * price0[gd.good]; finalV += fin[gd.good] * price0[gd.good]; }
      return { labour, revenue, finalV, gross };
    };
    const ownerSet0 = new Set(owners);
    let hhW = 1, govW = 0.2, scale = 1, plannedFinal = 0, Gplan = 0;
    let gross: Record<string, number> = {};
    for (let it = 0; it < 80; it++) {
      eSkill = eFrac * skills;
      const onPayroll = new Set<number>();
      { let acc = 0; for (const p of workforce) { if (acc >= eSkill) break; onPayroll.add(p); acc += P.skill[p]; } }
      const ch = chain(hhW, govW);
      scale = eSkill / Math.max(1e-9, ch.labour);
      gross = ch.gross;
      const Wplan = eSkill * wage;
      const pi = scale * ch.revenue * (1 - 1 / MARKUP);
      const divPlan = DIV_PAYOUT * 0.88 * DIV_REAL * pi * (1 - PROFIT_TAX); // 0.88: the founding loan's interest takes about an eighth of profit
      let Cw = 0;
      for (const p of workforce) {
        const sk = P.skill[p];
        const inc = (onPayroll.has(p) ? wage * sk * (1 - INCOME_TAX) : wage * BENEFIT_RATE * Math.min(1, sk)) + (ownerSet0.has(p) ? divPlan * (1 - DIVIDEND_TAX) * sk ** 3 / wsum : 0);
        Cw += P.cY[p] * thrift0 * inc + 0.001 * wage * sk * saveDays;
      }
      const liquidPlan = Wplan * 30 * 0.6;
      // The banks take 70% of the richest 5%'s deposits above 90 days of income as their own capital (banking genesis), and that money does not shop.
      let staked = 0;
      for (const p of owners) {
        const sk = P.skill[p], inc = (onPayroll.has(p) ? wage * sk * (1 - INCOME_TAX) : wage * BENEFIT_RATE * Math.min(1, sk)) + divPlan * (1 - DIVIDEND_TAX) * sk ** 3 / wsum;
        staked += 0.7 * Math.max(0, wage * sk * saveDays + liquidPlan * sk ** 3 / wsum - 90 * inc);
      }
      const C = Cw + 0.001 * (liquidPlan - staked);
      const householdPlan = saveDays * skills * wage;
      const endowPlan = householdPlan + Wplan * 30 + Wplan * 8 + liquidPlan + Wplan * 10;
      const Gbase = Wplan * INCOME_TAX + pi * PROFIT_TAX + divPlan * DIVIDEND_TAX - endowPlan * s.policyRate / 360 - NATURAL_UNEMP * workforce.length * wage * BENEFIT_RATE;
      const room = workforce.length * wage;
      const V = scale * ch.finalV;
      const need = (V - C - Gbase) / room;
      const fiscalPlan = Math.max(-0.08, Math.min(0.22, need));
      // Household savings carry the demand the fiscal stance does not: raise them until the plan funds its own staffing.
      // Public debt opens inside the fiscal rule's band (160 to 200 days of output). Below it the rule cuts the income tax every month
      // and the first year's public purchases shrink with it. The households hold what the debt does not fund elsewhere.
      if (it < 70) {
        const loansPlan = pi * (1 - PROFIT_TAX) * 30 * 24, rest = Math.max(0, (DEBT_DAYS * (V + 0.035 * room) - 0.125 * loansPlan) / (1 + 0.04 / 0.96));
        const target = Math.max(saveDays0, (rest - Wplan * 30 - liquidPlan - Wplan * 10) / (skills * wage));
        saveDays += 0.5 * (target - saveDays);
      }
      const G = Gbase + fiscalPlan * room;
      plannedFinal = V; Gplan = G;
      hhW = C / Math.max(1e-9, scale); govW = Math.max(0, G) / Math.max(1e-9, scale);
    }
    let next = 0;
    for (const def of FIRM_DEFS) {
      const d = GOODS[def.good], rivals = FIRM_DEFS.filter((x) => x.good === def.good).length;
      const fslot = L.addActor(def.id, 'firm');
      s.shareIds.push('eq:' + def.id);
      L.define({ id: 'eq:' + def.id, kind: 'share', issuer: def.id });
      L.define({ id: 'loan:' + def.id, kind: 'claim', issuer: def.id });
      const f: Firm = { id: def.id, idx: s.firms.length, slot: fslot, name: def.name, sector: d.sector, good: d.good, price: 0, workers: 0, expSales: 0, sold: 0, lost: 0, unitCost: 0, markup: MARKUP, made: 0, soldEma: 0, lostEma: 0, madeEma: 0,
        staff: [], eff: 0, ceo: -1, family: def.family, badMonths: 0,
        mRev: 0, mCost: 0, mStockDays: 0, mPrice0: 0, mUnitCost0: 0, lastProfit: 0, lastDividend: 0,
        closed: false, listed: true, founder: -1, bornDay: 0, bornWorkers: 0, listOn: 0, ipoEv: -1, ipoPx: 0 };
      const need = scale * gross[d.good] / d.prod / rivals;
      s.firms.push(f);
      while (f.eff < need && next < workforce.length) joinFirm(s, workforce[next++], f);
      if (!f.staff.length) joinFirm(s, workforce[next++], f);
      f.workers = f.staff.length; f.bornWorkers = f.workers; f.expSales = f.eff * d.prod;
      f.ceo = f.staff.reduce((b, x) => (P.skill[x] > P.skill[b] ? x : b), f.staff[0]);
      f.price = price0[d.good]; f.unitCost = price0[d.good] / MARKUP;
    }
    s.hirePtr = 0;
    for (const f of s.firms) {
      f.mPrice0 = f.price; f.mUnitCost0 = f.unitCost;
      f.divRate = 0.88 * DIV_REAL * f.expSales * f.price * (1 - 1 / MARKUP) * (1 - PROFIT_TAX);
      if (GOODS[f.good].perishable) continue;
      // The same shelf a chief will aim at on day one. A flat five days sits above a prudent chief's target,
      // and the firm then cuts staff to work the pile down.
      const days = f.ceo >= 0 ? INV_DAYS * (0.7 + 0.6 * (0.98 - P.cY[f.ceo]) / 0.18) : INV_DAYS;
      L.produce('good:' + f.good, f.id, f.expSales * days, 'genesis', g);
    }

    // All money starts as bank credit to the government. It endows every adult with savings, and gives the
    // founding owners (the top 5% by skill, the chief executives first) the capital they put into the firms and the bank.
    const SHARES = 10_000; // few enough that a share costs dollars, not cents: prices are whole cents
    const capital = (f: Firm): number => Math.round(f.eff * wage * 30);
    const firmCap = s.firms.reduce((t, f) => t + capital(f), 0);
    const dailyWages0 = s.firms.reduce((t, f) => t + f.eff, 0) * wage;
    const liquid = Math.round(firmCap * 0.6); // the owners' financial savings, which seed the investment funds
    let household = 0;
    for (const p of workforce) household += Math.round(wage * P.skill[p] * saveDays);
    const govBuffer = Math.round(dailyWages0 * 10);
    const rest = household + firmCap + liquid + govBuffer;
    // Two years of each firm's own after-tax profit. A wage-sized loan is repaid in a month by a firm whose
    // revenue is mostly materials, and that firm then pays the profit out. The matching deposits sit with the
    // vault: they are not spent and they do not retire the public debt.
    const coverMonths = 24;
    const loanFor = (f: Firm): number => {
      const profit = f.expSales * f.price * (1 - 1 / MARKUP) * (1 - PROFIT_TAX);
      let cover = profit * 30 * coverMonths;
      // Worn machines are ordered once a month, so a machinery firm's profit arrives as a lump the opening
      // sales forecast does not contain. The loan has to be able to take that lump.
      if (f.good === 'MACHINERY') {
        const rivals = Math.max(1, s.firms.filter((x) => x.good === 'MACHINERY').length);
        const wageBill = s.firms.reduce((t, x) => t + x.eff, 0) * wage;
        const repl = 0.288 * wageBill * (1 - 1 / MARKUP) * (1 - PROFIT_TAX) / rivals;
        cover = Math.max(cover, repl * 30 * coverMonths);
      }
      return Math.round(cover);
    };
    const loansEst = s.firms.reduce((t, f) => t + loanFor(f), 0);
    const bankCap = Math.max(Math.round(dailyWages0 * 8), Math.round((0.12 * loansEst + 0.04 * rest) / 0.96));
    const endow = rest + bankCap;
    L.issue(BOND, BANK, endow, 'genesis', g); L.issue(DEP, GOV, endow, 'genesis', g);
    for (const p of workforce) payS(w, s, s.govSlot, P.slot[p], Math.round(wage * P.skill[p] * saveDays), 'genesis.endowment', g);
    const float = (issuer: string, cents: number, lead: number): void => {
      let left = SHARES, paid = 0;
      owners.forEach((p, k) => {
        let share = P.skill[p] ** 3 / wsum;
        if (lead >= 0) share = p === lead ? 0.4 + 0.6 * share : 0.6 * share; // a founder holds 40% of a family firm
        const sh = k === owners.length - 1 ? left : Math.min(left, Math.round(SHARES * share));
        const c = k === owners.length - 1 ? cents - paid : Math.round(cents * share);
        left -= sh; paid += c;
        pay(w, GOV, P.id(p), c, 'genesis.capital', g); pay(w, P.id(p), issuer, c, 'genesis.equity', g);
        if (sh > 0) L.issue('eq:' + issuer, P.id(p), sh, 'genesis.equity', g);
      });
    };
    const ownerSet = new Set(owners);
    // Each family firm gets its own founder: the chief if they are an owner, otherwise the next unused owner.
    const leads = new Map<number, number>(), used = new Set<number>();
    let nextOwner = 0;
    for (const f of s.firms) if (f.family) {
      let lead = ownerSet.has(f.ceo) && !used.has(f.ceo) ? f.ceo : -1;
      while (lead < 0 && nextOwner < owners.length) { const o = owners[nextOwner++]; if (!used.has(o) && !s.firms.some((x) => x.ceo === o)) lead = o; }
      if (lead < 0) lead = f.ceo;
      used.add(lead); leads.set(f.idx, lead);
    }
    const leadOf = (f: Firm): number => leads.get(f.idx) ?? f.ceo;
    for (const f of s.firms) float(f.id, capital(f), f.family ? leadOf(f) : -1);
    float(BANK, bankCap, -1);
    for (const p of owners) payS(w, s, s.govSlot, P.slot[p], Math.floor(liquid * P.skill[p] ** 3 / wsum), 'genesis.endowment', g);
    for (const f of s.firms) if (f.family) { const lead = leadOf(f); if (P.employer[lead] !== f.idx) joinFirm(s, lead, f); f.ceo = lead; }
    s.investors = owners.slice(0, 300).map((p, k) => ({ id: P.id(p), target: 0.6 - 0.3 * k / 300 }));
    let profitDaily = 0, charter = 0, divOpen = 0;
    for (const f of s.firms) {
      divOpen += DIV_PAYOUT * 0.88 * DIV_REAL * f.expSales * f.price * (1 - 1 / MARKUP) * (1 - PROFIT_TAX);
      profitDaily += f.expSales * f.price * (1 - 1 / MARKUP) * PROFIT_TAX;
      const principal = loanFor(f);
      if (principal > 0) { L.issue('loan:' + f.id, BANK, principal, 'genesis', g); charter += principal; }
    }
    if (charter > 0) { L.addActor('vault', 'vault'); L.issue(DEP, 'vault', charter, 'genesis', g); }
    for (const p of workforce) {
      const sk = P.skill[p];
      P.incEma[p] = (P.employer[p] >= 0 ? wage * sk * (1 - INCOME_TAX) : wage * BENEFIT_RATE * Math.min(1, sk)) + (ownerSet.has(p) ? divOpen * (1 - DIVIDEND_TAX) * sk ** 3 / wsum : 0);
    }
    const dailyWages = s.firms.reduce((t, f) => t + f.eff, 0) * wage;
    s.taxEma = dailyWages * INCOME_TAX; s.taxTrend = s.taxEma;
    s.profitTaxDaily = profitDaily + divOpen * DIVIDEND_TAX;
    let openingSpend = 0;
    for (const p of workforce) openingSpend += P.cY[p] * thrift0 * P.incEma[p] + 0.001 * L.balS(P.slot[p], DEP);
    const coupon0 = (L.issued.get(BOND) ?? 0) * s.policyRate / 360;
    const benefitProv = NATURAL_UNEMP * workforce.length * wage * BENEFIT_RATE;
    const govBase = s.taxEma + s.profitTaxDaily - coupon0 - benefitProv;
    s.fiscal = Math.max(-0.08, Math.min(0.22, (Gplan - govBase) / (workforce.length * wage)));
    const employedN = s.firms.reduce((t, f) => t + f.staff.length, 0);
    s.unemployment = Math.max(0, 1 - employedN / Math.max(1, workforce.length));
    s.uEma = s.unemployment;
    s.cpiBase = cpiLevel(s);
    // A city that has had a year of the target rate of inflation: the first prints read 2%, not zero, and the policy rule and thriftiness start where they will settle.
    for (let k = 0; k < 12; k++) s.cpiHist.push(Math.pow(1.02, (k - 11) / 12));
  },

  dayClose(w) {
    firmLists = new Map();
    setSimDay(w.day);
    const s: EconState = w.state.economy, L = w.ledger;
    if (w.day === 0) {
      for (const f of s.firms) {
        // Shelf stock and the machinery buffer are already on the ledger, created by genesis with nothing paid for them.
        f.basisQty = Math.max(0, inv(w, f));
        f.basisUnit = f.unitCost;
      }
    }
    for (const f of s.firms) {
      if (f.basisDone) f.basisDone = false;
      else chargeOpening(f);
      f.sold = 0; f.lost = 0;
    }
    s.taxToday = 0; s.pensionToday = 0;

    if (w.day > 0 && w.day % DAYS_PER_YEAR === 0) yearlyLifePass(w, s);

    // Outside shocks from sim/content/shocks.txt: each rolls once a year. The only random root causes in this module.
    s.shocks = s.shocks.filter((x) => w.day < x.until);
    if (w.day % DAYS_PER_YEAR === 0 && w.day > 0) for (const def of SHOCKS) {
      if (s.shocks.some((x) => x.def === def) || !w.rng('shock:' + def.id).chance(def.chance)) continue;
      const ev = w.events.exo('shock.' + def.id.toLowerCase(), def.text);
      s.shocks.push({ def, until: w.day + def.days, ev });
      s.shockEv = ev; s.shockUntil = Math.max(s.shockUntil, w.day + def.days);
    }

    // 1. Hiring and firing toward planned output. Real people are hired from the unemployed and laid off last-in first-out.
    const P = s.P;
    const invDays = (f: Firm): number => INV_DAYS * (f.ceo >= 0 ? 0.7 + 0.6 * (0.98 - P.cY[f.ceo]) / 0.18 : 1); // a prudent chief keeps more stock
    // The day's job seekers, in a rotating order so hiring is spread fairly.
    const adultBorn = w.day - 18 * DAYS_PER_YEAR;
    const nP = P.n, ptr = s.hirePtr;
    if (!seekLive()) seekRebuild(P, adultBorn);
    else seekPromote(P, adultBorn);
    const nsNeed = seekCount();
    if (seekBuf.length < nsNeed) seekBuf = new Int32Array(Math.max(nsNeed, 16));
    const ns = seekCopy(ptr, seekBuf);
    const keep = Math.ceil(ns * MATCH_RATE);
    let sp = 0;
    s.hirePtr = (ptr + 97) % Math.max(1, nP);
    // Today's labour force: everyone working plus everyone looking, counted daily so new adults are not missed.
    let employedAtDawn = 0;
    for (const f of s.firms) employedAtDawn += f.staff.length;
    s.laborForce = employedAtDawn + ns;
    // Finding a job takes time: on a given day only a few percent of job seekers meet an employer who is hiring,
    // so unemployment drains over weeks and months rather than emptying in a day. Poaching is limited the same way.
    let poachLeft = Math.ceil(employedAtDawn * POACH_RATE);
    const gaps = s.firms.map((f) => {
      if (f.closed) return 0;
      const d = GOODS[f.good], mult = prodMult(s, f.good) * tfpOf(f), prodEff = d.prod * mult;
      // Stock above the plan slows the line, and a short shelf rebuilds it, but only by a quarter.
      // An unbound correction treats a few weeks of unsold goods as a closed plant: the firm fires
      // most of its staff in a month and hires them back when the pile finally sells.
      const stockGap = (f.expSales * invDays(f) - inv(w, f)) / 10;
      const bent = Math.max(-0.25 * f.expSales, Math.min(0.25 * f.expSales, stockGap));
      const target = d.perishable ? f.expSales * 1.03 : Math.max(0, f.expSales + bent);
      // Capacity is the tighter of staff and installed machinery. Without a capital stock yet, labour still sets it.
      const ceiling = w.ledger.instruments.has(CAPITAL) ? w.ledger.balance(f.id, CAPITAL) * mult : Infinity;
      return Math.min(Math.max(0, target), ceiling) / prodEff - f.eff;
    });
    // When nobody is out of work, firms that need staff hire away from firms that are overstaffed (poaching).
    const surplus = s.firms.map((f, i) => (gaps[i] < -1 ? Math.floor(-gaps[i]) : 0));
    const poach = (): number | undefined => {
      if (poachLeft <= 0) return undefined;
      for (let j = 0; j < s.firms.length; j++) {
        const k = (s.hirePtr + j) % s.firms.length, g = s.firms[k];
        if (g.closed || surplus[k] <= 0 || g.staff.length <= 1) continue;
        let x = g.staff.length - 1; if (g.staff[x] === g.ceo) x--;
        surplus[k]--; gaps[k] += P.skill[g.staff[x]]; poachLeft--;
        return g.staff[x];
      }
      return undefined;
    };
    s.firms.forEach((f, i) => {
      if (f.closed || !(wageMul(w, f.idx) > 0)) return;
      const cause = shockCause(s, f.good) ?? s.macroEv;
      // Close 6% of the gap a day, but always at least one person once the gap is a whole worker, so small firms can grow.
      const gap = gaps[i];
      if (gap > 1) {
        const goal = f.eff + Math.max(0.06 * gap, 1);
        while (f.eff < goal - 0.3) { const p = sp < keep ? seekBuf[sp++] : poach(); if (p === undefined) break; joinFirm(s, p, f); hireHook?.(w, p, f); P.lastEv[p] = -1; }
      } else if (gap < -2) {
        const goal = f.eff + Math.min(0.06 * gap, -1);
        while (f.eff > goal + 0.3 && f.staff.length > 1) {
          let k = f.staff.length - 1; if (f.staff[k] === f.ceo) k--;
          const p = f.staff[k];
          f.layoffEv ??= w.events.emit('firm.layoffs', `sales of ${GOODS[f.good].name} below plan: laying off staff`, [f.priceEv ?? cause], f.id);
          leaveJob(s, p); P.lastEv[p] = f.layoffEv;
        }
      }
      // One staff event a month, naming the chief, so a headcount has a cause.
      if (f.workers !== (f.staffNoted ?? -1) && f.staffMonth !== w.month) {
        const ceo = f.ceo >= 0 && f.ceo < P.n ? f.ceo : -1;
        const named = ceo >= 0 ? P.name(ceo) : f.name;
        f.staffEv = w.events.emit('firm.staff', `${named} has ${f.workers} people at ${f.name}`, [f.layoffEv ?? f.priceWho ?? f.priceEv ?? cause], ceo >= 0 ? P.id(ceo) : f.id);
        f.staffNoted = f.workers;
        f.staffMonth = w.month;
      }
    });

    // 2. Production: buy inputs, make goods. Wages accrue daily and are paid weekly.
    const payday = w.day % PAY_EVERY === PAY_EVERY - 1;
    for (const f of s.firms) {
      if (f.closed) continue;
      const d = GOODS[f.good], mult = prodMult(s, f.good) * tfpOf(f), prodEff = d.prod * mult;
      const cause = shockCause(s, f.good) ?? s.macroEv;
      const wageK = wageMul(w, f.idx);
      if (!(wageK > 0)) { f.made = 0; continue; }
      f.unitCost = unitCost(w, s, f, prodEff, wageK);
      const labour = f.eff * prodEff;
      const ceiling = w.ledger.instruments.has(CAPITAL) ? w.ledger.balance(f.id, CAPITAL) * mult : labour;
      const full = Math.min(labour, ceiling);
      let out = full;
      for (const [g, k] of INPUTS[f.good]) {
        const avail = firmsOf(s, g).reduce((t, x) => t + inv(w, x), 0);
        if (avail < out * k) {
          { const fs = firmsOf(s, g); bookLost(fs, out * k, fs.map((x) => inv(w, x))); } // suppliers that ran short see the unmet order
          out = avail / k;
          if (f.inputShortEv === undefined) {
            const up = firmsOf(s, g).map((x) => x.stockoutEv).filter((x): x is number => x !== undefined);
            f.inputShortEv = w.events.emit('firm.inputShort', `could not buy enough ${GOODS[g].name}; output cut`, up.length ? up : [cause], f.id);
          }
        }
      }
      for (const [g, k] of INPUTS[f.good]) {
        const need = out * k, fs = firmsOf(s, g), dom = fs.length ? Math.min(...fs.map((x) => x.price)) : Infinity;
        const imp = abroadOf(w)?.importFill(w, f.id, g, need, dom, cause) ?? { got: 0, spent: 0 };
        const r = buy(w, s, f.id, g, Math.max(0, need - imp.got), 'b2b.input', cause);
        L.consume(GOOD_INSTR[g], f.id, r.got, 'production.input', cause);
        f.mCost += r.spent + imp.spent;
        if (r.got + imp.got < need - 1e-6) out = (r.got + imp.got) / k;
      }
      // Without an input a firm improvises at a heavy cost: it can still make 30% of capacity. This keeps supply loops
      // (power needs coal, coal mines need power) from locking at zero forever after a bust.
      const bought = out;
      out = Math.max(out, 0.3 * full);
      if (powerHook && w.state.energy) {
        const capped = powerHook(w, f, out);
        if (capped < out) out = Math.max(0, capped);
      }
      const extra = out - bought;
      if (extra > 0) {
        const labour = s.wage * wageK / Math.max(0.01, prodEff);
        f.mCost += extra * Math.max(0, f.unitCost - labour);
      }
      f.mCost += wageK === 1 ? f.eff * s.wage : f.eff * s.wage * wageK;
      out = Math.max(0, out); f.made = out;
      if ((f.basisQty ?? 0) > 0) f.basisMade = (f.basisMade ?? 0) + out;
      L.produce(GOOD_INSTR[f.good], f.id, out, 'production', cause);
      s.yReal += out;

      if (payday) {
        const bill = Math.round(wageK === 1 ? f.eff * s.wage * PAY_EVERY : f.eff * s.wage * wageK * PAY_EVERY);
        const till = Math.floor(L.balS(f.slot, DEP));
        if (till < bill) borrow(w, s, f, bill - till + bill, cause);
        const till2 = Math.floor(L.balS(f.slot, DEP));
        const frac = Math.min(1, till2 / Math.max(1, bill)) * (till2 < bill ? 0.98 : 1);
        let tax = 0;
        const base = (wageK === 1 ? s.wage : s.wage * wageK) * PAY_EVERY * frac;
        for (const x of f.staff) {
          const gross = Math.round(P.skill[x] * base), t = Math.round(gross * s.taxRate);
          if (L.moveS(DEP, f.slot, P.slot[x], gross - t, 'wages', cause)) { P.incWeek[x] += gross - t; tax += t; }
        }
        if (pay(w, f.id, GOV, tax, 'tax.income', cause)) s.taxToday += tax;
        // Owners are paid a week at a time at the running rate of the firm's after-tax profit (the last month's, as it was booked),
        // so their spending does not pulse at month-end. Month-end tops up whatever the month's profit still owes.
        if (frac >= 1 && (f.divRate ?? 0) > 0) {
          // Keep back what month-end will take: the profit tax on the month so far and the interest accrued.
          const owing = (s.profitTax ?? PROFIT_TAX) * Math.max(0, f.mRev - f.mCost) + loanOf(w, f) * (s.policyRate + 0.03) / 12 * ((w.day % 30 + 1) / 30);
          // The till is lowest just after the weekly wages go out, so the week of wages is not counted against the 30-day buffer here.
          const room = Math.floor(L.balS(f.slot, DEP) - f.eff * s.wage * (30 - PAY_EVERY - 1) - owing);
          const d = Math.min(Math.round(DIV_PAYOUT * f.divRate! * PAY_EVERY), room);
          if (d > 0) { payDividends(w, s, f.id, d, s.macroEv); f.divMtd = (f.divMtd ?? 0) + d; }
        }
        if (frac < 1) {
          // A till that is a few percent short used to shed a sixth of the staff anyway, so a
          // payroll that almost cleared still produced a mass layoff and a rehire within the year.
          const shed = Math.min(1 / 6, 1 - frac);
          const ev = w.events.emit('firm.cashCrunch', `no cash and no credit: paid ${(frac * 100).toFixed(0)}% of wages and cut ${(shed * 100).toFixed(0)}% of the staff`, [f.priceEv ?? cause], f.id);
          for (let k = Math.max(1, Math.floor(f.staff.length * shed)); k > 0 && f.staff.length > 1; k--) {
            let j = f.staff.length - 1; if (f.staff[j] === f.ceo) j--;
            const p = f.staff[j]; leaveJob(s, p); P.lastEv[p] = ev;
          }
        }
      }
    }
    const employed = s.firms.reduce((t, f) => t + f.staff.length, 0);
    s.unemployment = Math.max(0, 1 - employed / Math.max(1, s.laborForce));
    s.uEma += (s.unemployment - s.uEma) / 90; // about three months

    // 3 and 4. Each person, once a week on their own day: benefits or pension, needs and stress, then shopping.
    const sellers: Record<string, Firm[]> = {}, avgP: Record<string, number> = {};
    const dm: Record<string, number> = {}, wts: Record<string, number[]> = {};
    for (const d of CONSUMER_GOODS) {
      sellers[d.good] = firmsOf(s, d.good).slice().sort((a, b) => a.price - b.price || (a.id < b.id ? -1 : 1));
      if (!sellers[d.good].length) continue;
      avgP[d.good] = sellers[d.good].reduce((t, x) => t + x.price, 0) / sellers[d.good].length;
      dm[d.good] = demandMult(s, d.good);
      wts[d.good] = priceWeights(sellers[d.good]);
    }
    const thrift = spendingThrift(s.policyRate, inflYoY(s), s.unemployment);
    // Today's shoppers are every seventh person. Each one decides a budget from their own income, wealth and state of mind,
    // and pays it into the clearing account; the clearing account buys the basket from the firms in bulk and refunds
    // whatever it could not buy. One ledger posting per shopper, however many goods and sellers there are.
    const slot = w.day % PAY_EVERY, clear = s.clearSlot, macro = s.macroEv;
    const benefitRate = s.benefitRate ?? BENEFIT_RATE;
    const benefit = s.wage * benefitRate * PAY_EVERY;
    govFund(w, benefit * (P.n / PAY_EVERY + 1), macro);
    if (whoBuf.length < (P.n >> 2) + 8) { const m = Math.max(whoBuf.length * 2, (P.n >> 2) + 8); whoBuf = new Int32Array(m); paidBuf = new Float64Array(m); }
    let nw = 0, total = 0;
    for (let i = slot; i < P.n; i += PAY_EVERY) {
      const fl = P.flags[i];
      if (!(fl & 1)) continue;
      const retired = (fl & 2) !== 0, adult = !retired && P.born[i] <= adultBorn, me = P.slot[i];
      if ((fl & PRISON) === 0 && (retired || (adult && P.employer[i] < 0))) {
        const b = Math.round(benefit * (retired ? 1 : Math.min(1, P.skill[i])));
        L.moveS(DEP, s.govSlot, me, b, retired ? 'gov.pensions' : 'gov.benefits', macro); P.incWeek[i] += b; if (retired) s.pensionToday += b;
      }
      if (!adult && !retired) continue; // children live off their parents
      if (w.day >= PAY_EVERY) P.incEma[i] += (P.incWeek[i] / PAY_EVERY - P.incEma[i]) / 4;
      P.incWeek[i] = 0;
      const money = L.balS(me, DEP);
      // Needs are timers; crossing a threshold fires a thought.
      if (adult && P.employer[i] < 0) {
        const before = P.jobless[i]; P.jobless[i] += PAY_EVERY;
        const j = P.jobless[i];
        if (before < 28 && j >= 28) thought(w, s, i, 100, 'a month without work', macro);
        else if (before < 91 && j >= 91) thought(w, s, i, 200, 'three months without work', macro);
        else if (j > 91 && j % 56 < PAY_EVERY) thought(w, s, i, 100, 'still without work', macro);
      }
      if (money < 3 * P.incEma[i]) { P.broke[i] += PAY_EVERY; if (P.broke[i] % 14 < PAY_EVERY) thought(w, s, i, 150, 'cannot cover the week', macro); } else P.broke[i] = 0;
      P.stress[i] = Math.max(0, P.stress[i] - PAY_EVERY);
      const fear = w.day < P.fearUntil[i] ? 0.8 : 1;
      const budget = Math.floor(Math.min(money, PAY_EVERY * (P.cY[i] * fear * thrift * P.incEma[i] + 0.001 * money)));
      if (budget <= 0 || !L.moveS(DEP, me, clear, budget, 'consumption', macro)) continue;
      if (nw === whoBuf.length) {
        const m = whoBuf.length * 2;
        const w2 = new Int32Array(m); w2.set(whoBuf); whoBuf = w2;
        const p2 = new Float64Array(m); p2.set(paidBuf); paidBuf = p2;
      }
      whoBuf[nw] = i; paidBuf[nw] = budget; nw++; total += budget;
    }
    if (total > 0) {
      let norm = 0;
      for (const d of CONSUMER_GOODS) norm += d.share * dm[d.good];
      norm = Math.max(1, norm);
      for (const d of CONSUMER_GOODS) {
        const fs = sellers[d.good];
        if (!fs?.length || !(avgP[d.good] > 0)) continue;
        const want = total * d.share * dm[d.good] / norm / avgP[d.good];
        const qs = allocate(w, fs, want, wts[d.good]), done = fs.map(() => 0);
        let got = 0;
        for (let k = 0; k < fs.length; k++) {
          const f = fs[k], q = qs[k];
          if (q <= 1e-9) continue;
          const cost = Math.min(Math.round(q * f.price), L.balS(clear, DEP));
          if (cost <= 0 || !L.moveS(DEP, clear, f.slot, cost, 'consumption', macro)) continue;
          L.consumeS(GOOD_INSTR[d.good], f.slot, q, 'consumption', macro);
          f.sold += q; f.mRev += cost; got += cost; done[k] = q;
        }
        bookLost(fs, want, done, wts[d.good]);
        s.yGdp += got; s.mSpend += got; s.dayGdp += got;
      }
      // Refund what could not be bought, in proportion to what each shopper paid in.
      let left = L.balS(clear, DEP);
      if (left > 0) {
        const all = left;
        for (let k = 0; k < nw && left > 0; k++) {
          const r = k === nw - 1 ? left : Math.min(left, Math.floor(all * paidBuf[k] / total));
          if (r > 0) { L.moveS(DEP, clear, P.slot[whoBuf[k]], r, 'consumption.refund', macro); left -= r; }
        }
      }
    }
    // 5. Government buys public services.
    // Budget rule: spend what taxes bring in, net of debt interest and of benefits at the natural unemployment rate.
    // Above that rate benefits are deficit-financed (automatic stabiliser); below it the budget runs a surplus.
    s.taxEma += (s.taxToday - s.taxEma) / 30; s.pensionEma += (s.pensionToday - s.pensionEma) / 30;
    const coupon = (L.issued.get(BOND) ?? 0) * s.policyRate / 360;
    // The budget follows the year's trend in tax receipts, not last month's, so a slump does not cut public purchases
    // just when private demand falls (and a boom does not add to them).
    s.taxTrend = s.taxTrend === undefined ? s.taxEma : s.taxTrend + (s.taxEma - s.taxTrend) / 360;
    const govBudget = Math.max(0, s.taxTrend + s.profitTaxDaily - coupon - s.pensionEma - NATURAL_UNEMP * s.laborForce * s.wage * benefitRate);
    // Fiscal stance (set monthly): extra purchases that build up while unemployment stays above the natural rate
    // and unwind while it is below, so the gap does not persist.
    const stimulus = s.fiscal * s.laborForce * s.wage;
    const pri = s.spendPri, spendMul = s.spendScale ?? 1;
    let govW = 0;
    for (const d of GOV_GOODS) govW += pri ? d.gov * (pri[d.good] ?? 1) : d.gov;
    if (!(govW > 0)) govW = 1;
    for (const d of GOV_GOODS) {
      const fs = firmsOf(s, d.good);
      if (!fs.length) continue;
      const p = fs.reduce((t, x) => t + x.price, 0) / fs.length;
      const share = pri ? d.gov * (pri[d.good] ?? 1) / govW : d.gov;
      const gr = buy(w, s, GOV, d.good, (govBudget + stimulus) * spendMul * share / p, 'gov.purchases', s.macroEv);
      L.consume(GOOD_INSTR[d.good], GOV, gr.got, 'gov.purchases', s.macroEv);
      s.yGdp += gr.spent; s.dayGdp += gr.spent;
    }
    // Foreign buyers use the same order path. Nothing happens when that module is off.
    const abroad = abroadOf(w);
    if (abroad) for (const d of Object.values(GOODS)) {
      const fs = firmsOf(s, d.good);
      if (!fs.length) continue;
      const px = fs.reduce((t, x) => t + x.price, 0) / fs.length, q = abroad.exportQty(w, d.good, px);
      if (!(q > 0)) continue;
      abroad.fundBuyer(w, Math.ceil(q * px), s.macroEv);
      const r = buy(w, s, abroad.buyer, d.good, q, 'trade.export', s.macroEv);
      if (r.got > 0) L.consume(GOOD_INSTR[d.good], abroad.buyer, r.got, 'trade.export', s.macroEv);
      s.yGdp += r.spent; s.dayGdp += r.spent;
    }
    s.yGdpEma = w.day < 30 ? Math.max(s.yGdpEma, s.dayGdp) : s.yGdpEma + (s.dayGdp - s.yGdpEma) / 30; s.dayGdp = 0;

    // 6. Firms close the day: spoilage, sales expectations, prices.
    for (const f of s.firms) {
      if (f.closed) continue;
      const d = GOODS[f.good];
      if (d.perishable) L.consume(GOOD_INSTR[f.good], f.id, inv(w, f), 'spoilage', s.macroEv);
      if (!(wageMul(w, f.idx) > 0)) continue;
      f.expSales += 0.1 * (f.sold + f.lost - f.expSales);
      const stock = inv(w, f), target = f.expSales * invDays(f);
      // Cost-plus pricing. The markup widens while demand outruns supply and narrows while goods go unsold,
      // within bounds, and drifts back to normal; the price follows cost times markup with a lag.
      // Services judge demand over about a week, so the weekly shopping rhythm is not mistaken for a trend.
      const a = w.day < 7 ? 1 : 1 / 7;
      f.soldEma += a * (f.sold - f.soldEma); f.lostEma += a * (f.lost - f.lostEma); f.madeEma += a * (f.made - f.madeEma);
      const tight = d.perishable ? f.lostEma > 0.02 * Math.max(1, f.soldEma) : stock < 0.7 * target;
      const loose = d.perishable ? f.soldEma < 0.94 * f.madeEma : stock > 1.3 * target;
      if (tight) {
        // Margins widen slowly: input prices already carry other firms' margins, so a fast rise compounds along the supply
        // chain into an economy-wide burst.
        f.markup = Math.min(1.6, f.markup + 0.0008); f.mStockDays++;
        if (f.stockoutEv === undefined && f.lost > 0) {
          const c = [f.inputShortEv, shockCause(s, f.good)].filter((x): x is number => x !== undefined);
          f.stockoutEv = w.events.emit('firm.stockout', `sold out of ${GOODS[f.good].name}; demand unmet`, c.length ? c : [s.macroEv], f.id);
        }
      } else if (loose) f.markup = Math.max(1.08, f.markup - 0.0015);
      f.markup += (MARKUP - f.markup) * 0.002;
      f.price += 0.1 * (f.unitCost * f.markup - f.price);
    }
    firmLists = null;
  },

  monthEnd(w) {
    const s: EconState = w.state.economy, L = w.ledger, E = w.events;
    // Prints.
    const cpi = cpiLevel(s) / s.cpiBase;
    const mInfl = cpi / s.cpi - 1;
    const prev12 = s.cpiHist[Math.max(0, s.cpiHist.length - 12)];
    const yoy = cpi / prev12 - 1;
    const prev3 = s.cpiHist[Math.max(0, s.cpiHist.length - 3)];
    const ann3 = Math.pow(cpi / prev3, 4) - 1; // the last three months, annualised
    s.cpi = cpi; s.cpiHist.push(cpi);

    const priceEvs: { id: number; mag: number }[] = [];
    for (const f of s.firms) {
      if (f.closed) continue;
      const ch = f.price / f.mPrice0 - 1, costCh = f.unitCost / f.mUnitCost0 - 1;
      if (Math.abs(ch) > 0.015) {
        const c: number[] = [];
        if (ch > 0 && f.stockoutEv !== undefined) c.push(f.stockoutEv);
        if (ch > 0 && f.inputShortEv !== undefined) c.push(f.inputShortEv);
        if (Math.sign(costCh) === Math.sign(ch) && Math.abs(costCh) > 0.008) {
          for (const g of Object.keys(GOODS[f.good].inputs)) for (const x of firmsOf(s, g)) if (x.priceEv !== undefined) c.push(x.priceEv);
          c.push(s.wageEv);
        }
        if (!c.length) c.push(s.macroEv);
        const id = E.emit('firm.price', `${GOODS[f.good].name} price ${ch > 0 ? '+' : ''}${(ch * 100).toFixed(1)}% this month (unit cost ${(costCh * 100).toFixed(1)}%, ${f.mStockDays} tight days)`, c.slice(0, 4), f.id);
        priceEvs.push({ id, mag: Math.abs(ch) * (GOODS[f.good].share + 0.01) });
        f.priceEv = id;
        const ceo = f.ceo >= 0 && f.ceo < s.P.n && s.P.alive(f.ceo) ? f.ceo : -1;
        f.priceWho = ceo >= 0
          ? E.emit('firm.ask', `${s.P.name(ceo)} sets the ${GOODS[f.good].name} price at ${f.name}`, [id], s.P.id(ceo))
          : id;
      } else f.priceEv = undefined;
    }
    priceEvs.sort((a, b) => b.mag - a.mag);
    const cpiEv = E.emit('macro.cpi', `CPI ${(mInfl * 100).toFixed(2)}% on the month, ${(yoy * 100).toFixed(1)}% on the year`, priceEvs.length ? priceEvs.slice(0, 3).map((x) => x.id) : [s.macroEv]);
    const reader = deskPerson(w, s, 'finance');
    if (reader >= 0) s.cpiWho = E.emit('macro.cpi.who', `${s.P.name(reader)} reads prices ${(Math.abs(yoy) * 100).toFixed(1)}% ${yoy < 0 ? 'lower' : 'higher'} on the year`, [cpiEv], s.P.id(reader));
    const uEv = E.emit('macro.jobs', `unemployment ${(s.unemployment * 100).toFixed(1)}%`, [s.macroEv]);
    const hirer = deskPerson(w, s, 'leader');
    if (hirer >= 0) s.jobsWho = E.emit('macro.jobs.who', `${s.P.name(hirer)} is hiring while unemployment is ${(s.unemployment * 100).toFixed(1)}%`, [uEv], s.P.id(hirer));
    s.macroEv = E.emit('macro.demand', `household spending ${(s.mSpend / 30 / 1e8).toFixed(2)}M per day`, [cpiEv, uEv, s.rateEv]);
    s.mSpend = 0;

    // Fiscal rule: the income tax rate moves a quarter point a month to keep public debt between 160 and 200 days of GDP.
    // Spare government cash retires bonds.
    const spare = Math.min(L.issued.get(BOND) ?? 0, Math.floor(cash(w, GOV) - 20 * s.yGdpEma * 0.2));
    const api = bondApi(w);
    if (spare > 0) {
      if (api) api.repay(w, spare, s.macroEv);
      else if (L.redeem(DEP, GOV, spare, 'gov.repay', s.macroEv)) L.redeem(BOND, BANK, spare, 'gov.repay', s.macroEv);
    }
    const debtDays = (L.issued.get(BOND) ?? 0) / Math.max(1, s.yGdpEma);
    const t0 = s.taxRate;
    const aim = s.taxAim;
    const taxLo = aim !== undefined ? Math.max(0.05, aim - 0.03) : 0.06;
    const taxHi = aim !== undefined ? Math.min(0.32, aim + 0.03) : 0.3;
    if (debtDays > 200 && s.taxRate < taxHi && s.unemployment < NATURAL_UNEMP + 0.02) s.taxRate += 0.0025; // no tax rises in a slump
    else if (debtDays < 160 && s.taxRate > taxLo) s.taxRate -= 0.0025;
    if (aim !== undefined && s.unemployment < 0.16) {
      if (s.taxRate < aim - 0.0008) s.taxRate = Math.min(aim, s.taxRate + 0.0015);
      else if (s.taxRate > aim + 0.0008) s.taxRate = Math.max(aim, s.taxRate - 0.0015);
    }
    s.taxRate = Math.max(taxLo, Math.min(taxHi, s.taxRate));
    if (Math.round(s.taxRate * 100) !== Math.round(t0 * 100)) E.emit('gov.tax', `income tax now ${(s.taxRate * 100).toFixed(0)}%: public debt is ${debtDays.toFixed(0)} days of GDP`, [s.macroEv], GOV);

    // A stimulus sized for the opening slack used to still be in place years after unemployment had fallen
    // through the natural rate. Firms stayed tight, markups widened, and the wage bargain chased that.
    // Withdraw it while inflation is above target. Stop once prices are calm: an integral that keeps cutting
    // until unemployment hits the natural rate on the nose turns the landing into a slump. A deep slump
    // rebuilds the stance within a year, and a supply crash (slack already open) is not met with austerity.
    const piStarFiscal = s.inflTarget ?? 0.02;
    const above = yoy - piStarFiscal;
    const slack = Math.max(s.unemployment, s.uEma) - NATURAL_UNEMP;
    const tight = NATURAL_UNEMP - Math.min(s.unemployment, s.uEma);
    let step = 0;
    if (above > 0.01 && slack < 0.02) step -= 0.08 * Math.min(0.06, above);
    if (tight > 0.02 && above > 0.01) step -= 0.05 * Math.min(0.04, tight);
    // Below 3.5% unemployment the wage bargain runs away even if the yearly print has not caught up yet.
    if (s.unemployment < 0.035 && above > -0.005) step -= 0.05;
    if (above < -0.005) step += 0.04 * Math.min(0.03, -above);
    if (slack > 0.02) step += 0.1 * Math.min(0.06, slack);
    s.fiscal = Math.max(-0.03, Math.min(0.22, s.fiscal + step));

    // Productivity. Each firm's output per worker-day grows at its sector's rate times a factor for how well it is run
    // (its chief's skill) and whether it is putting in machinery per worker. Prices follow unit costs, so a firm that
    // improves slowly charges more and loses share. The wage bargain below adds the labour-weighted average, so
    // real wages rise with output per worker.
    {
      let g = 0, e = 0, lvl = 0;
      for (const f of s.firms) {
        if (f.closed || !(f.eff > 0)) continue;
        const rate = SECTOR_GROWTH[f.sector] ?? 0.015;
        const chief = f.ceo >= 0 && f.ceo < s.P.n ? Math.max(0.5, Math.min(2, s.P.skill[f.ceo])) : 0.8;
        const k = (L.instruments.has(CAPITAL) ? L.balance(f.id, CAPITAL) : 0) / f.eff;
        const dk = f.capSeen && f.capSeen > 0 && k > 0 ? k / f.capSeen - 1 : 0;
        f.capSeen = k > 0 ? k : f.capSeen;
        const factor = Math.max(0.2, Math.min(1.8, 0.4 + 0.6 * chief + Math.max(-0.3, Math.min(0.5, 10 * dk))));
        const m = rate * factor / 12;
        f.tfp = (f.tfp ?? 1) * (1 + m);
        g += f.eff * m; e += f.eff; lvl += f.eff * f.tfp;
      }
      if (e > 0) { s.prodTrend = (s.prodTrend ?? 0) + 0.3 * (g / e - (s.prodTrend ?? 0)); s.tfpIdx = lvl / e; }
    }

    // Wage settlements: anchored on the inflation target. A quarter of last month's miss is caught up, and a
    // tight labour market adds to it. Catching half of every monthly print indexed each burst into the next
    // wage, which is what kept inflation at 6–8% for years after the shock itself had ended.
    const anchor = piStarFiscal / 12;
    const wRaw = anchor + (s.prodTrend ?? 0) + 0.25 * (mInfl - anchor) + 0.04 * (NATURAL_UNEMP - s.unemployment);
    const wCh = Math.max(s.unemployment > 0.15 ? -0.001 : 0, Math.min(0.012, wRaw));
    s.wage = Math.round(s.wage * (1 + wCh));
    if (Math.abs(wCh) > 0.002) s.wageEv = E.emit('macro.wage', `wages ${(wCh * 100).toFixed(2)}% this month`, [uEv, cpiEv]);
    const payer = deskPerson(w, s, 'finance');
    if (payer >= 0) s.wageWho = E.emit('macro.pay', `${s.P.name(payer)} settles the city's wage at ${(s.wage / 100).toFixed(0)} a day`, [s.wageEv], s.P.id(payer));

    // Central bank: Taylor rule with smoothing. It reads inflation as half the year-on-year rate and half the last three
    // months annualised: it reacts sooner to a burst and stops tightening sooner once the burst is over.
    const infl = (yoy + Math.max(-0.05, Math.min(0.3, ann3))) / 2;
    const piStar = s.inflTarget ?? 0.02;
    const uGap = NATURAL_UNEMP - s.unemployment;
    // A standard half-weight on unemployment lets the labour market hit 2% before the yearly print moves.
    // While inflation has not yet caught up, weight the gap more, so the hike arrives in the boom and not the year after.
    const uCoef = uGap > 0.025 && infl < 0.045 ? 1.1 : 0.5;
    const target = Math.max(0, Math.min(0.2, 0.02 + infl + 0.5 * (infl - piStar) + uCoef * uGap));
    // Rates move gradually, except that a central bank cuts hard once unemployment is climbing well above
    // normal, and hikes without waiting once the labour market is tight and prices have not yet followed.
    const speed = target < s.policyRate && s.unemployment > NATURAL_UNEMP + 0.03 ? 0.5
      : s.unemployment < 0.04 && target > s.policyRate && infl < 0.05 ? 0.45
      : 0.15;
    const next = Math.round(((1 - speed) * s.policyRate + speed * target) * 400) / 400; // quarter-point grid
    if (next !== s.policyRate) {
      s.rateEv = E.emit('cb.rate', `policy rate ${(s.policyRate * 100).toFixed(2)}% -> ${(next * 100).toFixed(2)}%`, [cpiEv, uEv], CB);
      const gov = deskPerson(w, s, 'governor');
      if (gov >= 0) s.rateWho = E.emit('cb.desk', `${s.P.name(gov)} moves the policy rate to ${(next * 100).toFixed(2)}%`, [s.rateEv], s.P.id(gov));
      s.policyRate = next;
    }
    const loanRate = s.policyRate + 0.03;

    // The last day's sales, including deliveries booked after this morning, land in this month's profit.
    for (const f of s.firms) {
      chargeOpening(f);
      f.basisDone = true;
    }

    // Firms: interest, profit tax, loan repayment, dividends, defaults.
    let profitTax = 0;
    for (const f of s.firms) {
      if (f.closed) continue;
      const loan = loanOf(w, f), interest = Math.round(loan * loanRate / 12);
      if (interest > 0 && pay(w, f.id, BANK, interest, 'loan.interest', s.rateEv)) s.marginIn = (s.marginIn ?? 0) + interest;
      else if (interest > 0) borrow(w, s, f, interest, s.rateEv) && pay(w, f.id, BANK, interest, 'loan.interest', s.rateEv);
      const profit = f.mRev - f.mCost - interest;
      let taxPaid = 0;
      if (profit > 0) { const t = Math.round(Math.min(cash(w, f.id), profit * (s.profitTax ?? PROFIT_TAX))); if (pay(w, f.id, GOV, t, 'tax.profit', s.macroEv)) { profitTax += t; taxPaid = t; } }
      const buffer = f.eff * s.wage * 30;
      let excess = Math.floor(cash(w, f.id) - buffer);
      let paid = 0;
      if (excess > 0 && profit > 0) {
        const owed = Math.min(excess, Math.max(0, Math.round(DIV_PAYOUT * (profit - taxPaid)) - (f.divMtd ?? 0)));
        if (owed > 0) { payDividends(w, s, f.id, owed, s.macroEv); paid = owed; excess -= owed; }
      }
      if (excess > 0 && loan > 0) {
        const r = Math.min(excess, loan);
        L.redeem(DEP, f.id, r, 'loan.repay', s.macroEv); L.redeem('loan:' + f.id, BANK, r, 'loan.repay', s.macroEv);
        excess -= r;
      }
      { const now = Math.max(0, (profit - taxPaid) / 30), was = f.divRate ?? 0; f.divRate = now < was ? now : was + 0.5 * (now - was); } // cut at once when profit falls, raised by half the gain
      f.lastProfit = profit; f.lastDividend = paid + (f.divMtd ?? 0) + Math.max(0, Math.round(excess)); f.divMtd = 0;
      const teller = f.ceo >= 0 && f.ceo < s.P.n && s.P.alive(f.ceo) ? f.ceo : deskPerson(w, s, 'leader');
      const tellName = teller >= 0 ? s.P.name(teller) : f.name;
      f.profitEv = E.emit('firm.profit', `${tellName} counts a profit of ${(Math.round(profit) / 100).toFixed(0)} dollars at ${f.name}`, [f.priceWho ?? f.priceEv ?? s.wageWho ?? s.wageEv ?? s.macroEv], teller >= 0 ? s.P.id(teller) : f.id);
      if (excess > 0) payDividends(w, s, f.id, excess, s.macroEv);
      if (loan > 0 && loanOf(w, f) > 140 * (f.eff * s.wage + 1) && profit < 0) {
        const off = Math.round(loanOf(w, f) * 0.5);
        const ev = E.emit('firm.default', `could not service debt; bank wrote off ${(off / 1e8).toFixed(1)}M`, [f.priceEv ?? s.macroEv, s.rateEv], f.id);
        L.redeem('loan:' + f.id, BANK, off, 'loan.writeoff', ev);
        s.defaults++;
      }
      // A chief executive who loses money for six months running is removed by the owners.
      f.badMonths = profit < 0 ? f.badMonths + 1 : 0;
      if (f.badMonths >= CEO_POSITION.removeAfter && f.ceo >= 0) {
        const old = f.ceo;
        const ev = E.emit('firm.ceoFired', `${s.P.name(old)} removed as chief executive after ${f.badMonths} losing months`, [f.priceEv ?? s.macroEv], f.id);
        f.family = false; // the founding family loses the seat for good
        succession(w, s, f, old, 'was removed', ev);
        s.P.lastEv[old] = ev; leaveJob(s, old);
      }
      f.layoffEv = undefined;
      f.mRev = 0; f.mCost = 0; f.mStockDays = 0; f.mPrice0 = f.price; f.mUnitCost0 = f.unitCost;
      f.stockoutEv = undefined; f.inputShortEv = undefined;
    }

    // Receipts swing with which weekday the month closes on; the budget follows a smoothed figure so public purchases do not.
    s.profitTaxDaily += ((profitTax + s.divTax) / 30 - s.profitTaxDaily) * 0.08; s.divTax = 0;

    // Bond coupons are paid by the bond market on their own dates. Without that market, the bank is paid the policy rate.
    if (api) api.coupons(w, s.rateEv);
    else govPay(w, BANK, (L.issued.get(BOND) ?? 0) * s.policyRate / 12, 'gov.coupon', s.rateEv);
    paySightInterest(w, s);
    const eqTarget = 0.12 * totalLoans(w, s) + 0.04 * (L.issued.get(BOND) ?? 0);
    const bankSpare = bankEquity(w) - eqTarget;
    if (bankSpare > 0) payDividends(w, s, BANK, bankSpare * 0.25, s.rateEv);
  },

  stats(w) {
    const s: EconState = w.state.economy, L = w.ledger;
    const n = s.cpiHist.length;
    const out = {
      gdpPerDay_M: +(s.yGdp / DAYS_PER_YEAR / 1e8).toFixed(2),
      realOutPerDay_k: +(s.yReal / DAYS_PER_YEAR / 1e3).toFixed(1),
      cpi: +s.cpi.toFixed(3),
      inflYoY_pct: +((s.cpi / s.cpiHist[Math.max(0, n - 13)] - 1) * 100).toFixed(1),
      unemp_pct: +(s.unemployment * 100).toFixed(1),
      rate_pct: +(s.policyRate * 100).toFixed(2),
      wage: +(s.wage / 100).toFixed(2),
      realGdp_M: +(s.yGdp / DAYS_PER_YEAR / 1e8 / (s.cpiHist.slice(-12).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(12, n)) || 1)).toFixed(3),
      prod_idx: +(s.tfpIdx ?? 1).toFixed(3),
      realWage: +(s.wage / 100 / s.cpi).toFixed(2),
      money_M: +((L.issued.get(DEP) ?? 0) / 1e8).toFixed(0),
      loans_M: +(totalLoans(w, s) / 1e8).toFixed(0),
      govDebt_M: +((L.issued.get(BOND) ?? 0) / 1e8).toFixed(0),
      bankEq_M: +(bankEquity(w) / 1e8).toFixed(0),
      tax_pct: +(s.taxRate * 100).toFixed(1),
      fiscal_pct: +(s.fiscal * 100).toFixed(1),
      defaults: s.defaults,
      people: (() => { let n = 0; for (let k = 0; k < s.P.n; k++) if (s.P.alive(k)) n++; return n; })(),
      breakdowns: s.breakdowns,
      successions: s.successions,
    };
    s.yGdp = 0; s.yReal = 0; s.breakdowns = 0;
    return out;
  },
};

/** Sight-deposit interest, paid only out of loan interest the main bank redeemed this month.
 *  Issuing the policy rate on every deposit printed money in proportion to the rate, so a tightening
 *  raised household income and the burst the rate was meant to end kept going. */
function paySightInterest(w: World, s: EconState): void {
  const depRate = Math.max(0, s.policyRate - 0.01);
  const pot = Math.floor(s.marginIn ?? 0);
  s.marginIn = 0;
  if (!(depRate > 0) || pot <= 0) return;
  const P = s.P, L = w.ledger;
  let deposits = 0;
  for (let k = 0; k < P.n; k++) if (P.alive(k)) deposits += L.balS(P.slot[k], DEP);
  if (!(deposits > 0)) return;
  const rate = Math.min(depRate, pot * 12 / deposits);
  let left = pot;
  for (let k = 0; k < P.n && left > 0; k++) {
    if (!P.alive(k)) continue;
    const i = Math.min(left, Math.round(L.balS(P.slot[k], DEP) * rate / 12));
    if (i <= 0) continue;
    L.issueS(DEP, P.slot[k], i, 'deposit.interest', s.rateEv);
    P.incWeek[k] += i;
    left -= i;
  }
}
function payDividends(w: World, s: EconState, issuer: string, cents: number, cause: number): void {
  const L = w.ledger, total = L.issued.get('eq:' + issuer) ?? 0;
  if (!total) return;
  const from = L.slot(issuer);
  // Snapshot first: paying can create new holders only in other instruments, but keep it safe.
  for (const [h, n] of L.holdersS('eq:' + issuer)) {
    const a = Math.floor(cents * n / total);
    if (a <= 0 || !payS(w, s, from, h, a, 'dividends', cause)) continue;
    const id = L.ids[h];
    if (!id.startsWith('p_')) continue;
    const t = Math.floor(a * (s.divRate ?? DIVIDEND_TAX)); // withheld at source from people; funds pass theirs on and are taxed then
    if (L.moveS(DEP, h, s.govSlot, t, 'tax.dividend', cause)) s.divTax += t;
    s.P.incWeek[+id.slice(2)] += a - t; // counted as that week's income
  }
}
function cpiLevel(s: EconState): number {
  let c = 0;
  for (const d of CONSUMER_GOODS) {
    const fs = firmsOf(s, d.good);
    if (!fs.length) continue;
    const wsum = fs.reduce((t, f) => t + f.expSales, 0) || 1;
    c += d.share * fs.reduce((t, f) => t + f.price * f.expSales, 0) / wsum;
  }
  return c;
}

export interface NewFirm { name: string; good: string; founder: number; cash: number; hires: number; cause: number }

/** A person starts a small private firm: their cash for the equity, a loan for the machines, staff from the unemployed. */
export function addFirm(w: World, spec: NewFirm): Firm | null {
  const s: EconState = w.state.economy, L = w.ledger, P = s.P, d = GOODS[spec.good];
  if (!d || spec.founder < 0 || spec.founder >= P.n || !P.alive(spec.founder)) return null;
  const cashIn = Math.round(spec.cash);
  if (cashIn > 0 && L.balS(P.slot[spec.founder], DEP) < cashIn) return null;
  const id = 'frm_n' + s.firms.length;
  if (L.hasActor(id)) return null;
  const hires = Math.max(1, spec.hires);
  const rivals = firmsOf(s, d.good);
  const price = rivals.length ? rivals.reduce((t, f) => t + f.price, 0) / rivals.length : 1;
  const unit = rivals.length ? rivals.reduce((t, f) => t + f.unitCost, 0) / rivals.length : price / MARKUP;
  const slot = L.addActor(id, 'firm');
  const eq = 'eq:' + id;
  s.shareIds.push(eq);
  L.define({ id: eq, kind: 'share', issuer: id });
  L.define({ id: 'loan:' + id, kind: 'claim', issuer: id });
  L.define({ id: 'cf:' + id, kind: 'claim', issuer: id });
  const f: Firm = {
    id, idx: s.firms.length, slot, name: spec.name, sector: d.sector, good: d.good, price, workers: 0, expSales: 0,
    staff: [], eff: 0, ceo: -1, family: true, badMonths: 0,
    sold: 0, lost: 0, unitCost: unit, markup: MARKUP, made: 0, soldEma: 0, lostEma: 0, madeEma: 0,
    mRev: 0, mCost: 0, mStockDays: 0, mPrice0: price, mUnitCost0: unit, lastProfit: 0, lastDividend: 0,
    closed: false, listed: false, founder: spec.founder, bornDay: w.day, bornWorkers: 0, listOn: 0, ipoEv: -1, ipoPx: 0,
  };
  s.firms.push(f);
  f.tfp = 0.95 * sectorTfp(s, d.sector);
  if (cashIn > 0 && !pay(w, P.id(spec.founder), id, cashIn, 'equity.found', spec.cause)) { closeFirm(w, f, spec.cause); return null; }
  L.issue(eq, P.id(spec.founder), 10_000, 'equity.found', spec.cause);
  joinFirm(s, spec.founder, f);
  f.ceo = spec.founder;
  let hired = 1;
  for (let k = 0; k < P.n && hired < hires; k++) {
    const i = (s.hirePtr + k) % P.n;
    if (P.employer[i] >= 0 || !P.adult(w, i) || (P.flags[i] & 4) !== 0) continue;
    joinFirm(s, i, f);
    hired++;
  }
  f.workers = f.staff.length;
  f.bornWorkers = f.workers;
  f.expSales = f.eff * d.prod * 0.85;
  const want = f.eff * d.prod;
  if (L.instruments.has(CAPITAL) && !installCapital(w, s, f, want, spec.cause)) { closeFirm(w, f, spec.cause); return null; }
  if (L.instruments.has(CAPITAL)) f.expSales = Math.min(f.expSales, L.balance(f.id, CAPITAL) * 0.9);
  return f;
}

/** Buy machinery and install it as capital. Shelf stock is a few days of sales, so the rest is commissioned:
 *  the makers build it, get paid, and it is installed. Returns false when almost none of `want` was installed. */
function installCapital(w: World, s: EconState, f: Firm, want: number, cause: number): boolean {
  const L = w.ledger;
  if (!(want > 0)) return false;
  const makers = s.firms.filter((m) => m.good === 'MACHINERY' && !m.closed && m.idx !== f.idx && m.price > 0);
  if (!makers.length) return false;
  const cpu = 360 * s.wage / Math.max(0.01, GOODS[f.good].prod);
  const cost = Math.round(want * cpu);
  const floor = Math.round(f.eff * s.wage * 21);
  let cash = Math.max(0, Math.floor(L.balance(f.id, DEP) - floor));
  if (cash < cost) borrow(w, s, f, cost - cash, cause);
  cash = Math.max(0, Math.floor(L.balance(f.id, DEP) - floor));
  const budget = Math.min(cost, cash);
  if (budget <= 0) return false;
  let spent = 0;
  const take = (m: Firm, q2: number, fromShelf: boolean): boolean => {
    if (!(q2 > 1e-8) || m.price <= 0) return false;
    const c = Math.min(budget - spent, Math.round(q2 * m.price));
    const q = Math.min(q2, c / m.price);
    if (!(q > 1e-8) || c <= 0) return false;
    if (!fromShelf) L.produce('good:MACHINERY', m.id, q, 'invest.build', cause);
    if (!pay(w, f.id, m.id, c, 'invest.buy', cause)) {
      if (!fromShelf) L.consume('good:MACHINERY', m.id, q, 'invest.build', cause);
      return false;
    }
    if (!L.move('good:MACHINERY', m.id, f.id, q, 'invest.buy', cause)) {
      pay(w, m.id, f.id, c, 'invest.refund', cause);
      if (!fromShelf) L.consume('good:MACHINERY', m.id, q, 'invest.build', cause);
      return false;
    }
    L.consume('good:MACHINERY', f.id, q, 'invest.install', cause);
    m.mRev += c; m.sold += q; s.yGdp += c; s.mSpend += c;
    if (!fromShelf) noteCommission(w, s, m, q);
    spent += c;
    return true;
  };
  for (const m of makers) {
    if (spent >= budget) break;
    const stock = Math.max(0, L.balance(m.id, 'good:MACHINERY') - Math.max(0, m.soldEma) * 2);
    if (stock > 1e-8) take(m, Math.min(stock, (budget - spent) / m.price), true);
  }
  if (spent < budget) {
    const m = makers.reduce((a, b) => (b.eff > a.eff ? b : a));
    take(m, (budget - spent) / m.price, false);
  }
  if (spent <= 0) return false;
  L.produce(CAPITAL, f.id, spent / cpu, 'invest.install', cause);
  return spent >= cost * 0.3;
}

/** Creditors are paid in order from what the assets sell for. Shareholders take what remains. The firm then goes to zero. */
export function closeFirm(w: World, f: Firm, cause: number): boolean {
  if (f.closed) return false;
  const s: EconState = w.state.economy;
  let rivals = 0;
  for (const o of s.firms) if (!o.closed && o.good === f.good && o.idx !== f.idx) rivals++;
  if (!rivals) return false;
  const L = w.ledger, P = s.P;
  if (f.staff.length) {
    const ev = w.events.emit('firm.layoffs', `${f.name} lays off its staff`, [cause], f.id);
    while (f.staff.length) {
      const p = f.staff[f.staff.length - 1];
      leaveJob(s, p);
      P.lastEv[p] = ev;
    }
  }
  f.ceo = -1; f.eff = 0; f.workers = 0; f.expSales = 0;
  closeHook?.(w, f.id, cause);
  sellOff(w, s, f, cause);
  repayClaims(w, s, f, 'cf:' + f.id, cause);
  repayClaims(w, s, f, 'loan:' + f.id, cause);
  payResidual(w, s, f, cause);
  for (const [id, inst] of L.instruments) {
    const bal = L.balance(f.id, id);
    if (!(bal > 1e-8)) continue;
    if (inst.kind === 'real') { L.consume(id, f.id, bal, 'bankrupt.scrap', cause); continue; }
    const a = Math.floor(bal);
    if (a <= 0) continue;
    if (inst.issuer === f.id) L.redeem(id, f.id, a, 'bankrupt.retire', cause);
    else L.move(id, f.id, GOV, a, 'bankrupt.residual', cause);
  }
  const dust = Math.floor(L.balance(f.id, DEP));
  if (dust > 0) pay(w, f.id, GOV, dust, 'bankrupt.residual', cause);
  f.closed = true; f.listed = false; f.listOn = 0; f.family = false;
  const m = w.state.markets as { stocks?: { issuer: string; instr: string }[]; orders?: { open: boolean; instr: string }[] } | undefined;
  if (m?.stocks) {
    const instr = 'eq:' + f.id;
    m.stocks = m.stocks.filter((st) => st.issuer !== f.id);
    if (m.orders) for (const o of m.orders) if (o.instr === instr) o.open = false;
  }
  return true;
}

function sellOff(w: World, s: EconState, f: Firm, cause: number): void {
  const L = w.ledger;
  const good = 'good:' + f.good;
  let qty = L.balance(f.id, good);
  for (const r of s.firms) {
    if (qty <= 1e-8) break;
    if (r.closed || r.idx === f.idx || r.price <= 0) continue;
    const px = Math.max(1, Math.round(r.price * 0.5));
    const spare = Math.max(0, Math.floor(L.balance(r.id, DEP) - r.eff * s.wage * 14));
    const q = Math.min(qty, L.balance(f.id, good), spare / px);
    const c = Math.round(q * px);
    if (!(q > 1e-8) || c <= 0) continue;
    if (!pay(w, r.id, f.id, c, 'bankrupt.sale', cause)) continue;
    if (!L.move(good, f.id, r.id, q, 'bankrupt.sale', cause)) { pay(w, f.id, r.id, c, 'bankrupt.sale', cause); continue; }
    qty -= q;
  }
  if (L.instruments.has(CAPITAL) && L.balance(f.id, CAPITAL) > 1e-8) placePlant(w, s, f, cause);
}

/** The machines are sold to the largest rival in the trade, who borrows if the till is short.
 *  Anything still unsold is handed over rather than scrapped, so a failure does not delete the industry's capacity. */
function placePlant(w: World, s: EconState, f: Firm, cause: number): void {
  const L = w.ledger;
  const cpu = 360 * s.wage / Math.max(0.01, GOODS[f.good].prod);
  const px = Math.max(1, cpu * 0.4);
  let buyer: Firm | undefined;
  for (const r of s.firms) if (!r.closed && r.idx !== f.idx && r.good === f.good && (!buyer || r.eff > buyer.eff)) buyer = r;
  if (!buyer) return;
  const floor = Math.round(buyer.eff * s.wage * 14);
  let have = L.balance(f.id, CAPITAL);
  let spare = Math.max(0, Math.floor(L.balance(buyer.id, DEP) - floor));
  const bill = Math.round(have * px);
  if (spare + 1 < bill) {
    borrow(w, s, buyer, bill - spare, cause);
    spare = Math.max(0, Math.floor(L.balance(buyer.id, DEP) - floor));
  }
  const paidUnits = Math.min(have, spare / px);
  const paid = Math.round(paidUnits * px);
  if (paid > 0 && paidUnits > 1e-8 && pay(w, buyer.id, f.id, paid, 'bankrupt.plant', cause)) {
    if (!L.consume(CAPITAL, f.id, paidUnits, 'bankrupt.plant', cause)) pay(w, f.id, buyer.id, paid, 'bankrupt.plant', cause);
    else L.produce(CAPITAL, buyer.id, paidUnits, 'bankrupt.plant', cause);
  }
  have = L.balance(f.id, CAPITAL);
  if (have > 1e-8) {
    L.consume(CAPITAL, f.id, have, 'bankrupt.plant', cause);
    L.produce(CAPITAL, buyer.id, have, 'bankrupt.plant', cause);
  }
}

function repayClaims(w: World, s: EconState, f: Firm, instr: string, cause: number): void {
  const L = w.ledger;
  if (!L.instruments.has(instr)) return;
  let guard = 0;
  while (guard++ < 64) {
    const owed = Math.floor(L.issued.get(instr) ?? 0);
    const cash = Math.floor(L.balance(f.id, DEP));
    if (owed <= 0 || cash <= 0) break;
    let step = false;
    for (const [id, bal] of [...L.holders(instr).entries()]) {
      const a = Math.min(Math.floor(bal), cash, owed);
      if (a <= 0) continue;
      if (id === BANK) {
        if (!L.redeem(DEP, f.id, a, 'bankrupt.repay', cause)) continue;
        if (!L.redeem(instr, id, a, 'bankrupt.repay', cause)) { L.issue(DEP, f.id, a, 'bankrupt.repay', cause); continue; }
      } else {
        if (!pay(w, f.id, id, a, 'bankrupt.repay', cause)) continue;
        if (!L.redeem(instr, id, a, 'bankrupt.repay', cause)) { pay(w, id, f.id, a, 'bankrupt.repay', cause); continue; }
      }
      step = true;
      break;
    }
    if (!step) break;
  }
  for (const [id] of [...L.holders(instr).entries()]) {
    const a = Math.floor(L.balance(id, instr));
    if (a > 0) L.redeem(instr, id, a, 'loan.writeoff', cause);
  }
}

function payResidual(w: World, s: EconState, f: Firm, cause: number): void {
  const L = w.ledger, instr = 'eq:' + f.id;
  if (!L.instruments.has(instr)) return;
  const total = Math.floor(L.issued.get(instr) ?? 0);
  const pot = Math.floor(L.balance(f.id, DEP));
  if (total > 0 && pot > 0) {
    const holders = [...L.holdersS(instr)].filter(([, n]) => n > 0).sort((a, b) => a[1] - b[1]);
    let left = pot;
    for (let i = 0; i < holders.length && left > 0; i++) {
      const [slot, n] = holders[i];
      const a = i === holders.length - 1 ? left : Math.min(left, Math.floor(pot * n / total));
      if (a > 0 && payS(w, s, f.slot, slot, a, 'bankrupt.equity', cause)) left -= a;
    }
  }
  for (const [slot, n] of [...L.holdersS(instr)]) {
    const a = Math.floor(n);
    if (a > 0) L.redeemS(instr, slot, a, 'bankrupt.retire', cause);
  }
}
