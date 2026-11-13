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
import { CEO_POSITION, FIRM_DEFS, GOODS, SHOCKS, type GoodDef, type ShockDef } from './content.ts';
import { People, joinFirm, leaveJob, succession, thought, yearlyLifePass } from './people.ts';

export const DEP = 'dep';          // bank deposits: the money everyone pays with
export const BANK = 'bank_1', GOV = 'gov', CB = 'cb', CLEAR = 'clearing';
const BOND = 'bond:gov';

const CONSUMER_GOODS = Object.values(GOODS).filter((g) => g.share > 0);
const GOV_GOODS = Object.values(GOODS).filter((g) => g.gov > 0);
export const POPULATION = +(process.env.SIM_POP ?? 20_000);
const PAY_EVERY = 7; // wages, benefits and shopping run weekly per person
const MARKUP = 1.2, INV_DAYS = 5;
const INCOME_TAX = 0.12, PROFIT_TAX = 0.2, DIVIDEND_TAX = 0.35, BENEFIT_RATE = 0.4;
const NATURAL_UNEMP = 0.07;

export interface Firm {
  id: string; idx: number; name: string; sector: string; good: string; price: number; workers: number; expSales: number;
  slot: number; staff: number[]; eff: number; ceo: number; family: boolean; badMonths: number; ceoEv?: number; // staff: person indexes into s.P; eff = sum of staff skill
  sold: number; lost: number; unitCost: number; markup: number; made: number; soldEma: number; lostEma: number; madeEma: number;
  mRev: number; mCost: number; mStockDays: number; mPrice0: number; mUnitCost0: number; layoffEv?: number;
  stockoutEv?: number; inputShortEv?: number; priceEv?: number;
  lastProfit: number; lastDividend: number; // last month's figures, for valuation
}
export interface EconState {
  firms: Firm[]; P: People; shareIds: string[]; govSlot: number; bankSlot: number; clearSlot: number; investors: { id: string; target: number }[]; laborForce: number; hirePtr: number; breakdowns: number; successions: number;
  wage: number; policyRate: number; cpi: number; cpiBase: number; cpiHist: number[];
  unemployment: number; shockUntil: number; shockEv?: number; shocks: { def: ShockDef; until: number; ev: number }[]; macroEv: number; wageEv: number; rateEv: number;
  yGdp: number; yGdpEma: number; yReal: number; mSpend: number; defaults: number; taxEma: number; taxToday: number; profitTaxDaily: number; dayGdp: number; taxRate: number; pensionEma: number; pensionToday: number; divTax: number; fiscal: number; uEma: number; // fiscal: the government's accumulated stance, in workers' daily wages per member of the labour force
}

const inv = (w: World, f: Firm): number => w.ledger.balance(f.id, 'good:' + f.good);
const cash = (w: World, a: string): number => w.ledger.balance(a, DEP);
const loanOf = (w: World, f: Firm): number => w.ledger.issued.get('loan:' + f.id) ?? 0;

/** Pay deposits. The bank pays by creating deposits and is paid by extinguishing them. */
export function pay(w: World, from: string, to: string, cents: number, reason: string, cause: number): boolean {
  const a = Math.round(cents);
  if (a <= 0) return true;
  if (from === BANK) { w.ledger.issue(DEP, to, a, reason, cause); return true; }
  if (to === BANK) return w.ledger.redeem(DEP, from, a, reason, cause);
  return w.ledger.move(DEP, from, to, a, reason, cause);
}
/** Slot version of pay(), for loops over people. */
export function payS(w: World, s: EconState, from: number, to: number, cents: number, reason: string, cause: number): boolean {
  const a = Math.round(cents);
  if (a <= 0) return true;
  if (from === s.bankSlot) { w.ledger.issueS(DEP, to, a, reason, cause); return true; }
  if (to === s.bankSlot) return w.ledger.redeemS(DEP, from, a, reason, cause);
  return w.ledger.moveS(DEP, from, to, a, reason, cause);
}
const bankEquity = (w: World): number => w.ledger.netWorth(BANK);
function totalLoans(w: World, s: EconState): number { let t = 0; for (const f of s.firms) t += loanOf(w, f); return t; }

/** Bank lends by creating a loan asset and a matching deposit. Refused if it would breach 8% capital. */
function borrow(w: World, s: EconState, f: Firm, cents: number, cause: number): boolean {
  const a = Math.round(cents);
  if (a <= 0) return true;
  const dailyCost = f.eff * s.wage + 1;
  if (loanOf(w, f) + a > 150 * dailyCost) return false;
  if (bankEquity(w) < 0.08 * (totalLoans(w, s) + a)) return false;
  w.ledger.issue('loan:' + f.id, BANK, a, 'loan.grant', cause);
  w.ledger.issue(DEP, f.id, a, 'loan.grant', cause);
  return true;
}
/** Make sure the government holds at least `cents`: if short it sells bonds to the bank, which creates the deposits. */
function govFund(w: World, cents: number, cause: number): void {
  if (cash(w, GOV) < cents) {
    const need = Math.round(cents - cash(w, GOV) + 50_000_00);
    w.ledger.issue(BOND, BANK, need, 'gov.borrow', cause);
    w.ledger.issue(DEP, GOV, need, 'gov.borrow', cause);
  }
}
/** Government pays; if short it sells bonds to the bank, which creates the deposits. */
function govPay(w: World, to: string, cents: number, reason: string, cause: number): void {
  const a = Math.round(cents);
  if (a <= 0) return;
  if (cash(w, GOV) < a) {
    const need = a - cash(w, GOV) + 50_000_00;
    w.ledger.issue(BOND, BANK, need, 'gov.borrow', cause);
    w.ledger.issue(DEP, GOV, need, 'gov.borrow', cause);
  }
  pay(w, GOV, to, a, reason, cause);
}
const firmsOf = (s: EconState, good: string): Firm[] => s.firms.filter((f) => f.good === good);

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
    w.ledger.move('good:' + good, f.id, buyer, q, reason, cause);
    f.sold += q; f.mRev += cost; got += q; spent += cost;
  });
  bookLost(sellers, qty, done);
  return { got, spent };
}

/** Output-per-worker multiplier from active shocks, and the shock event to blame. */
function prodMult(s: EconState, good: string): number { let m = 1; for (const x of s.shocks) m *= (x.def.prod[good] ?? 1) * (x.def.prod.ALL ?? 1); return m; }
function demandMult(s: EconState, good: string): number { let m = 1; for (const x of s.shocks) m *= x.def.demand[good] ?? 1; return m; }
function shockCause(s: EconState, good: string): number | undefined {
  for (let k = s.shocks.length - 1; k >= 0; k--) { const x = s.shocks[k]; if (x.def.prod[good] !== undefined || x.def.prod.ALL !== undefined || x.def.demand[good] !== undefined) return x.ev; }
  return undefined;
}

function unitCost(s: EconState, f: Firm, prodEff: number): number {
  const d = GOODS[f.good];
  let c = s.wage / prodEff;
  for (const [g, k] of Object.entries(d.inputs)) { const fs = firmsOf(s, g); c += k * Math.min(...fs.map((x) => x.price)); }
  return c;
}

export const economy: Module = {
  id: 'economy',

  init(w) {
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
      macroEv: g, wageEv: g, rateEv: g, yGdp: 0, yGdpEma: 1, yReal: 0, mSpend: 0, defaults: 0, taxEma: 0, taxToday: 0, profitTaxDaily: 0, dayGdp: 0, taxRate: INCOME_TAX, pensionEma: 0, pensionToday: 0, divTax: 0, fiscal: 0, uEma: 0.08,
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

    // Firms, staffed by named people. Staffing is calibrated from the recipes: price every good at cost plus markup,
    // turn household and government budgets into final demand, add what producers need of each other (the input chain),
    // and hire enough people to make it. The most skilled hire becomes the first chief executive.
    const price0: Record<string, number> = {};
    for (const g of Object.values(GOODS)) price0[g.good] = wage / g.prod;
    for (let it = 0; it < 200; it++) for (const g of Object.values(GOODS)) {
      let c = wage / g.prod; for (const [i, k] of Object.entries(g.inputs)) c += k * price0[i];
      price0[g.good] = c * MARKUP;
    }
    const gross: Record<string, number> = {}, final: Record<string, number> = {};
    for (const g of Object.values(GOODS)) final[g.good] = (g.share * 1 + g.gov * 0.2) / price0[g.good];
    for (const g of Object.values(GOODS)) gross[g.good] = final[g.good];
    for (let it = 0; it < 200; it++) {
      const next: Record<string, number> = { ...final };
      for (const g of Object.values(GOODS)) for (const [i, k] of Object.entries(g.inputs)) next[i] += k * gross[g.good];
      Object.assign(gross, next);
    }
    const labour = Object.values(GOODS).reduce((t, g) => t + gross[g.good] / g.prod, 0);
    const skills = workforce.reduce((t, p) => t + P.skill[p], 0);
    const scale = 0.9 * skills / labour;
    let next = 0;
    for (const def of FIRM_DEFS) {
      const d = GOODS[def.good], rivals = FIRM_DEFS.filter((x) => x.good === def.good).length;
      const fslot = L.addActor(def.id, 'firm');
      s.shareIds.push('eq:' + def.id);
      L.define({ id: 'eq:' + def.id, kind: 'share', issuer: def.id });
      L.define({ id: 'loan:' + def.id, kind: 'claim', issuer: def.id });
      const f: Firm = { id: def.id, idx: s.firms.length, slot: fslot, name: def.name, sector: d.sector, good: d.good, price: 0, workers: 0, expSales: 0, sold: 0, lost: 0, unitCost: 0, markup: MARKUP, made: 0, soldEma: 0, lostEma: 0, madeEma: 0,
        staff: [], eff: 0, ceo: -1, family: def.family, badMonths: 0,
        mRev: 0, mCost: 0, mStockDays: 0, mPrice0: 0, mUnitCost0: 0, lastProfit: 0, lastDividend: 0 };
      const need = scale * gross[d.good] / d.prod / rivals;
      s.firms.push(f);
      while (f.eff < need && next < workforce.length) joinFirm(s, workforce[next++], f);
      if (!f.staff.length) joinFirm(s, workforce[next++], f);
      f.workers = f.staff.length; f.expSales = f.eff * d.prod;
      f.ceo = f.staff.reduce((b, x) => (P.skill[x] > P.skill[b] ? x : b), f.staff[0]);
      f.price = price0[d.good]; f.unitCost = price0[d.good] / MARKUP;
    }
    s.hirePtr = 0;
    for (const f of s.firms) { f.mPrice0 = f.price; f.mUnitCost0 = f.unitCost; if (!GOODS[f.good].perishable) L.produce('good:' + f.good, f.id, f.expSales * INV_DAYS, 'genesis', g); }

    // All money starts as bank credit to the government. It endows every adult with savings, and gives the
    // founding owners (the top 5% by skill, the chief executives first) the capital they put into the firms and the bank.
    const SHARES = 10_000; // few enough that a share costs dollars, not cents: prices are whole cents
    const dailyWages = s.firms.reduce((t, f) => t + f.eff, 0) * wage;
    const owners = [...workforce].sort((a, b) => P.skill[b] - P.skill[a] || a - b).slice(0, Math.max(10, Math.round(workforce.length * 0.05)));
    const wsum = owners.reduce((t, p) => t + P.skill[p] ** 3, 0);
    const capital = (f: Firm): number => Math.round(f.eff * wage * 30);
    const bankCap = Math.round(dailyWages * 40);
    const firmCap = s.firms.reduce((t, f) => t + capital(f), 0);
    const liquid = Math.round(firmCap * 0.6); // the owners' financial savings, which seed the investment funds
    const endow = Math.round(dailyWages * 75) + firmCap + bankCap + liquid;
    L.issue(BOND, BANK, endow, 'genesis', g); L.issue(DEP, GOV, endow, 'genesis', g);
    for (const p of workforce) { payS(w, s, s.govSlot, P.slot[p], Math.round(wage * P.skill[p] * 60), 'genesis.endowment', g); P.incEma[p] = wage * P.skill[p] * (1 - INCOME_TAX); }
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
    const leadOf = (f: Firm): number => (ownerSet.has(f.ceo) ? f.ceo : owners[f.idx % owners.length]);
    for (const f of s.firms) float(f.id, capital(f), f.family ? leadOf(f) : -1);
    float(BANK, bankCap, -1);
    for (const p of owners) payS(w, s, s.govSlot, P.slot[p], Math.floor(liquid * P.skill[p] ** 3 / wsum), 'genesis.endowment', g);
    for (const f of s.firms) if (f.family) { const lead = leadOf(f); if (P.employer[lead] !== f.idx) joinFirm(s, lead, f); f.ceo = lead; }
    s.investors = owners.slice(0, 300).map((p, k) => ({ id: P.id(p), target: 0.6 - 0.3 * k / 300 }));
    s.taxEma = dailyWages * INCOME_TAX;
    s.cpiBase = cpiLevel(s); s.cpiHist.push(1);
  },

  dayClose(w) {
    const s: EconState = w.state.economy, L = w.ledger;
    for (const f of s.firms) { f.sold = 0; f.lost = 0; }
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
    const pool: number[] = [], adultBorn = w.day - 18 * DAYS_PER_YEAR;
    for (let k = 0; k < P.n; k++) { const i = (s.hirePtr + k) % P.n; if (P.employer[i] < 0 && P.flags[i] === 1 && P.born[i] <= adultBorn) pool.push(i); }
    pool.reverse(); s.hirePtr = (s.hirePtr + 97) % Math.max(1, P.n);
    const gaps = s.firms.map((f) => {
      const d = GOODS[f.good], prodEff = d.prod * prodMult(s, f.good);
      const target = d.perishable ? f.expSales * 1.03 : f.expSales + (f.expSales * invDays(f) - inv(w, f)) / 10;
      return Math.max(0, target) / prodEff - f.eff;
    });
    // When nobody is out of work, firms that need staff hire away from firms that are overstaffed (poaching).
    const surplus = s.firms.map((f, i) => (gaps[i] < -1 ? Math.floor(-gaps[i]) : 0));
    const poach = (): number | undefined => {
      for (let j = 0; j < s.firms.length; j++) {
        const k = (s.hirePtr + j) % s.firms.length, g = s.firms[k];
        if (surplus[k] <= 0 || g.staff.length <= 1) continue;
        let x = g.staff.length - 1; if (g.staff[x] === g.ceo) x--;
        surplus[k]--; gaps[k] += P.skill[g.staff[x]];
        return g.staff[x];
      }
      return undefined;
    };
    s.firms.forEach((f, i) => {
      const cause = shockCause(s, f.good) ?? s.macroEv;
      // Close 6% of the gap a day, but always at least one person once the gap is a whole worker, so small firms can grow.
      const gap = gaps[i];
      if (gap > 1) {
        const goal = f.eff + Math.max(0.06 * gap, 1);
        while (f.eff < goal - 0.3) { const p = pool.pop() ?? poach(); if (p === undefined) break; joinFirm(s, p, f); P.lastEv[p] = -1; }
      } else if (gap < -2) {
        const goal = f.eff + Math.min(0.06 * gap, -1);
        while (f.eff > goal + 0.3 && f.staff.length > 1) {
          let k = f.staff.length - 1; if (f.staff[k] === f.ceo) k--;
          const p = f.staff[k];
          f.layoffEv ??= w.events.emit('firm.layoffs', `sales of ${GOODS[f.good].name} below plan: laying off staff`, [f.priceEv ?? cause], f.id);
          leaveJob(s, p); P.lastEv[p] = f.layoffEv;
        }
      }
    });

    // 2. Production: buy inputs, make goods. Wages accrue daily and are paid weekly.
    const payday = w.day % PAY_EVERY === PAY_EVERY - 1;
    for (const f of s.firms) {
      const d = GOODS[f.good], prodEff = d.prod * prodMult(s, f.good);
      const cause = shockCause(s, f.good) ?? s.macroEv;
      f.unitCost = unitCost(s, f, prodEff);
      const full = f.eff * prodEff;
      let out = full;
      for (const [g, k] of Object.entries(d.inputs)) {
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
      for (const [g, k] of Object.entries(d.inputs)) {
        const r = buy(w, s, f.id, g, out * k, 'b2b.input', cause);
        L.consume('good:' + g, f.id, r.got, 'production.input', cause);
        f.mCost += r.spent;
        if (r.got < out * k - 1e-6) out = r.got / k;
      }
      // Without an input a firm improvises at a heavy cost: it can still make 30% of capacity. This keeps supply loops
      // (power needs coal, coal mines need power) from locking at zero forever after a bust.
      out = Math.max(out, 0.3 * full);
      f.mCost += f.eff * s.wage;
      out = Math.max(0, out); f.made = out;
      L.produce('good:' + f.good, f.id, out, 'production', cause);
      s.yReal += out;

      if (payday) {
        const bill = Math.round(f.eff * s.wage * PAY_EVERY);
        if (cash(w, f.id) < bill) borrow(w, s, f, bill - cash(w, f.id) + bill, cause);
        const frac = Math.min(1, cash(w, f.id) / Math.max(1, bill)) * (cash(w, f.id) < bill ? 0.98 : 1);
        let tax = 0;
        const base = s.wage * PAY_EVERY * frac;
        for (const x of f.staff) {
          const gross = Math.round(P.skill[x] * base), t = Math.round(gross * s.taxRate);
          if (L.moveS(DEP, f.slot, P.slot[x], gross - t, 'wages', cause)) { P.incWeek[x] += gross - t; tax += t; }
        }
        if (pay(w, f.id, GOV, tax, 'tax.income', cause)) s.taxToday += tax;
        if (frac < 1) {
          const ev = w.events.emit('firm.cashCrunch', `no cash and no credit: paid ${(frac * 100).toFixed(0)}% of wages and cut a sixth of the staff`, [f.priceEv ?? cause], f.id);
          for (let k = Math.floor(f.staff.length / 6); k > 0 && f.staff.length > 1; k--) {
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
      sellers[d.good] = firmsOf(s, d.good).sort((a, b) => a.price - b.price || (a.id < b.id ? -1 : 1));
      avgP[d.good] = sellers[d.good].reduce((t, x) => t + x.price, 0) / sellers[d.good].length;
      dm[d.good] = demandMult(s, d.good);
      wts[d.good] = priceWeights(sellers[d.good]);
    }
    const thrift = Math.max(0.88, 1 - 0.8 * Math.max(0, s.policyRate - 0.02)); // higher interest rates make saving more attractive
    // Today's shoppers are every seventh person. Each one decides a budget from their own income, wealth and state of mind,
    // and pays it into the clearing account; the clearing account buys the basket from the firms in bulk and refunds
    // whatever it could not buy. One ledger posting per shopper, however many goods and sellers there are.
    const slot = w.day % PAY_EVERY, clear = s.clearSlot, macro = s.macroEv;
    const benefit = s.wage * BENEFIT_RATE * PAY_EVERY;
    govFund(w, benefit * (P.n / PAY_EVERY + 1), macro);
    const who: number[] = [], paid: number[] = [];
    let total = 0;
    for (let i = slot; i < P.n; i += PAY_EVERY) {
      const fl = P.flags[i];
      if (!(fl & 1)) continue;
      const retired = (fl & 2) !== 0, adult = !retired && P.born[i] <= adultBorn, me = P.slot[i];
      if (retired || (adult && P.employer[i] < 0)) {
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
      who.push(i); paid.push(budget); total += budget;
    }
    if (total > 0) {
      let norm = 0;
      for (const d of CONSUMER_GOODS) norm += d.share * dm[d.good];
      norm = Math.max(1, norm);
      for (const d of CONSUMER_GOODS) {
        const fs = sellers[d.good], want = total * d.share * dm[d.good] / norm / avgP[d.good];
        const qs = allocate(w, fs, want, wts[d.good]), done = fs.map(() => 0);
        let got = 0;
        for (let k = 0; k < fs.length; k++) {
          const f = fs[k], q = qs[k];
          if (q <= 1e-9) continue;
          const cost = Math.min(Math.round(q * f.price), L.balS(clear, DEP));
          if (cost <= 0 || !L.moveS(DEP, clear, f.slot, cost, 'consumption', macro)) continue;
          L.consumeS('good:' + d.good, f.slot, q, 'consumption', macro);
          f.sold += q; f.mRev += cost; got += cost; done[k] = q;
        }
        bookLost(fs, want, done, wts[d.good]);
        s.yGdp += got; s.mSpend += got; s.dayGdp += got;
      }
      // Refund what could not be bought, in proportion to what each shopper paid in.
      let left = L.balS(clear, DEP);
      if (left > 0) {
        const all = left;
        for (let k = 0; k < who.length && left > 0; k++) {
          const r = k === who.length - 1 ? left : Math.min(left, Math.floor(all * paid[k] / total));
          if (r > 0) { L.moveS(DEP, clear, P.slot[who[k]], r, 'consumption.refund', macro); left -= r; }
        }
      }
    }
    // 5. Government buys public services.
    // Budget rule: spend what taxes bring in, net of debt interest and of benefits at the natural unemployment rate.
    // Above that rate benefits are deficit-financed (automatic stabiliser); below it the budget runs a surplus.
    s.taxEma += (s.taxToday - s.taxEma) / 30; s.pensionEma += (s.pensionToday - s.pensionEma) / 30;
    const coupon = (L.issued.get(BOND) ?? 0) * s.policyRate / 360;
    const govBudget = Math.max(0, s.taxEma + s.profitTaxDaily - coupon - s.pensionEma - NATURAL_UNEMP * s.laborForce * s.wage * BENEFIT_RATE);
    // Fiscal stance (set monthly): extra purchases that build up while unemployment stays above the natural rate
    // and unwind while it is below, so the gap does not persist.
    const stimulus = s.fiscal * s.laborForce * s.wage;
    for (const d of GOV_GOODS) {
      const fs = firmsOf(s, d.good), p = fs.reduce((t, x) => t + x.price, 0) / fs.length;
      const gr = buy(w, s, GOV, d.good, (govBudget + stimulus) * d.gov / p, 'gov.purchases', s.macroEv);
      L.consume('good:' + d.good, GOV, gr.got, 'gov.purchases', s.macroEv);
      s.yGdp += gr.spent; s.dayGdp += gr.spent;
    }
    s.yGdpEma = w.day < 30 ? Math.max(s.yGdpEma, s.dayGdp) : s.yGdpEma + (s.dayGdp - s.yGdpEma) / 30; s.dayGdp = 0;

    // 6. Firms close the day: spoilage, sales expectations, prices.
    for (const f of s.firms) {
      const d = GOODS[f.good];
      if (d.perishable) L.consume('good:' + f.good, f.id, inv(w, f), 'spoilage', s.macroEv);
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
        f.markup = Math.min(1.8, f.markup + 0.0015); f.mStockDays++;
        if (f.stockoutEv === undefined && f.lost > 0) {
          const c = [f.inputShortEv, shockCause(s, f.good)].filter((x): x is number => x !== undefined);
          f.stockoutEv = w.events.emit('firm.stockout', `sold out of ${GOODS[f.good].name}; demand unmet`, c.length ? c : [s.macroEv], f.id);
        }
      } else if (loose) f.markup = Math.max(1.08, f.markup - 0.0015);
      f.markup += (MARKUP - f.markup) * 0.002;
      f.price += 0.1 * (f.unitCost * f.markup - f.price);
    }
  },

  monthEnd(w) {
    const s: EconState = w.state.economy, L = w.ledger, E = w.events;
    // Prints.
    const cpi = cpiLevel(s) / s.cpiBase;
    const mInfl = cpi / s.cpi - 1;
    const prev12 = s.cpiHist[Math.max(0, s.cpiHist.length - 12)];
    const yoy = cpi / prev12 - 1;
    s.cpi = cpi; s.cpiHist.push(cpi);

    const priceEvs: { id: number; mag: number }[] = [];
    for (const f of s.firms) {
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
      } else f.priceEv = undefined;
    }
    priceEvs.sort((a, b) => b.mag - a.mag);
    const cpiEv = E.emit('macro.cpi', `CPI ${(mInfl * 100).toFixed(2)}% on the month, ${(yoy * 100).toFixed(1)}% on the year`, priceEvs.length ? priceEvs.slice(0, 3).map((x) => x.id) : [s.macroEv]);
    const uEv = E.emit('macro.jobs', `unemployment ${(s.unemployment * 100).toFixed(1)}%`, [s.macroEv]);
    s.macroEv = E.emit('macro.demand', `household spending ${(s.mSpend / 30 / 1e8).toFixed(2)}M per day`, [cpiEv, uEv, s.rateEv]);
    s.mSpend = 0;

    // Fiscal rule: the income tax rate moves a quarter point a month to keep public debt between 160 and 200 days of GDP.
    // Spare government cash retires bonds.
    const spare = Math.min(L.issued.get(BOND) ?? 0, Math.floor(cash(w, GOV) - 20 * s.yGdpEma * 0.2));
    if (spare > 0 && L.redeem(DEP, GOV, spare, 'gov.repay', s.macroEv)) L.redeem(BOND, BANK, spare, 'gov.repay', s.macroEv);
    const debtDays = (L.issued.get(BOND) ?? 0) / Math.max(1, s.yGdpEma);
    const t0 = s.taxRate;
    if (debtDays > 200 && s.taxRate < 0.3 && s.unemployment < NATURAL_UNEMP + 0.02) s.taxRate += 0.0025; // no tax rises in a slump
    else if (debtDays < 160 && s.taxRate > 0.06) s.taxRate -= 0.0025;
    if (Math.round(s.taxRate * 100) !== Math.round(t0 * 100)) E.emit('gov.tax', `income tax now ${(s.taxRate * 100).toFixed(0)}%: public debt is ${debtDays.toFixed(0)} days of GDP`, [s.macroEv], GOV);

    // Wages follow the labour market and part of inflation.
    s.fiscal = Math.max(-0.08, Math.min(0.25, s.fiscal + 0.05 * (s.uEma - NATURAL_UNEMP)));

    // Wage settlements: anchored on the 2% inflation target, catching up with part of actual inflation, pushed by the
    // labour market. Nominal pay is almost never cut: only mass unemployment (over 15%) forces small cuts.
    const anchor = 0.02 / 12;
    const wRaw = anchor + 0.5 * (mInfl - anchor) + 0.04 * (NATURAL_UNEMP - s.unemployment);
    const wCh = Math.max(s.unemployment > 0.15 ? -0.001 : 0, Math.min(0.012, wRaw));
    s.wage = Math.round(s.wage * (1 + wCh));
    if (Math.abs(wCh) > 0.002) s.wageEv = E.emit('macro.wage', `wages ${(wCh * 100).toFixed(2)}% this month`, [uEv, cpiEv]);

    // Central bank: Taylor rule with smoothing.
    const target = Math.max(0, Math.min(0.2, 0.02 + yoy + 0.5 * (yoy - 0.02) + 0.5 * (NATURAL_UNEMP - s.unemployment)));
    const next = Math.round((0.85 * s.policyRate + 0.15 * target) * 400) / 400; // quarter-point grid
    if (next !== s.policyRate) {
      s.rateEv = E.emit('cb.rate', `policy rate ${(s.policyRate * 100).toFixed(2)}% -> ${(next * 100).toFixed(2)}%`, [cpiEv, uEv], CB);
      s.policyRate = next;
    }
    const loanRate = s.policyRate + 0.03, depRate = Math.max(0, s.policyRate - 0.01);

    // Firms: interest, profit tax, loan repayment, dividends, defaults.
    let profitTax = 0;
    for (const f of s.firms) {
      const loan = loanOf(w, f), interest = Math.round(loan * loanRate / 12);
      if (!pay(w, f.id, BANK, interest, 'loan.interest', s.rateEv)) borrow(w, s, f, interest, s.rateEv) && pay(w, f.id, BANK, interest, 'loan.interest', s.rateEv);
      const profit = f.mRev - f.mCost - interest;
      if (profit > 0) { const t = Math.round(Math.min(cash(w, f.id), profit * PROFIT_TAX)); if (pay(w, f.id, GOV, t, 'tax.profit', s.macroEv)) profitTax += t; }
      const buffer = f.eff * s.wage * 30;
      let excess = Math.floor(cash(w, f.id) - buffer);
      if (excess > 0 && loan > 0) {
        const r = Math.min(excess, loan);
        L.redeem(DEP, f.id, r, 'loan.repay', s.macroEv); L.redeem('loan:' + f.id, BANK, r, 'loan.repay', s.macroEv);
        excess -= r;
      }
      f.lastProfit = profit; f.lastDividend = Math.max(0, Math.round(excess));
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

    s.profitTaxDaily = (profitTax + s.divTax) / 30; s.divTax = 0;

    // Government coupon, bank deposit interest, bank dividends.
    govPay(w, BANK, (L.issued.get(BOND) ?? 0) * s.policyRate / 12, 'gov.coupon', s.rateEv);
    if (depRate > 0) { const P = s.P; for (let k = 0; k < P.n; k++) { if (!P.alive(k)) continue; const i = Math.round(L.balS(P.slot[k], DEP) * depRate / 12); if (i > 0) { L.issueS(DEP, P.slot[k], i, 'deposit.interest', s.rateEv); P.incWeek[k] += i; } } }
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

function payDividends(w: World, s: EconState, issuer: string, cents: number, cause: number): void {
  const holders = w.ledger.holders('eq:' + issuer), total = w.ledger.issued.get('eq:' + issuer) ?? 0;
  if (!total) return;
  for (const [h, n] of holders) {
    const a = Math.floor(cents * n / total);
    if (a <= 0 || !pay(w, issuer, h, a, 'dividends', cause) || !h.startsWith('p_')) continue;
    const t = Math.floor(a * DIVIDEND_TAX); // withheld at source from people; funds pass theirs on and are taxed then
    if (pay(w, h, GOV, t, 'tax.dividend', cause)) s.divTax += t;
    s.P.incWeek[+h.slice(2)] += a - t; // counted as that week's income
  }
}
function cpiLevel(s: EconState): number {
  let c = 0;
  for (const d of CONSUMER_GOODS) {
    const fs = firmsOf(s, d.good), wsum = fs.reduce((t, f) => t + f.expSales, 0) || 1;
    c += d.share * fs.reduce((t, f) => t + f.price * f.expSales, 0) / wsum;
  }
  return c;
}
