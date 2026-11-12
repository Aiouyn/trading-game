// Seed economy: the reference module. A closed, stock-flow consistent loop:
//   households work -> wages -> consumption -> firm revenue -> profit -> tax, interest, dividends -> households
// with a bank that creates money by lending, a government, and a central bank that reacts to inflation.
// Nothing here is drawn at random except one tagged outside shock (energy supply).
// Later modules replace parts of this (markets, firm detail, banking); the pattern to copy is:
// state in w.state.economy, money only through the ledger, every event with a cause.
import { DAYS_PER_YEAR, type Module, type World } from '../../kernel/index.ts';

export const DEP = 'dep';          // bank deposits: the money everyone pays with
export const BANK = 'bank_1', GOV = 'gov', CB = 'cb';
const BOND = 'bond:gov';

interface SectorDef { good: string; prod: number; inputs: Record<string, number>; share: number; perishable?: boolean; startWorkers: number }
// Order matters: upstream first, so inputs exist when downstream produces.
export const SECTORS: Record<string, SectorDef> = {
  energy: { good: 'energy', prod: 20, inputs: {}, share: 0.10, startWorkers: 6_000 },
  agri: { good: 'food', prod: 8, inputs: { energy: 0.1 }, share: 0.25, startWorkers: 21_000 },
  manu: { good: 'goods', prod: 4, inputs: { energy: 0.3 }, share: 0.25, startWorkers: 24_000 },
  serv: { good: 'services', prod: 6, inputs: { goods: 0.05, energy: 0.05 }, share: 0.40, perishable: true, startWorkers: 39_000 },
};
const FIRMS_PER_SECTOR = 3;
const LABOR_FORCE = 100_000;
const MARKUP = 1.2, INV_DAYS = 5;
const INCOME_TAX = 0.12, PROFIT_TAX = 0.2, BENEFIT_RATE = 0.4;
const NATURAL_UNEMP = 0.07;

interface HH { id: string; laborShare: number; cY: number; cW: number; incEma: number; incToday: number }
export interface Firm {
  id: string; sector: string; good: string; price: number; workers: number; expSales: number;
  sold: number; lost: number; unitCost: number;
  mRev: number; mCost: number; mStockDays: number; mPrice0: number; mUnitCost0: number;
  stockoutEv?: number; inputShortEv?: number; priceEv?: number;
  lastProfit: number; lastDividend: number; // last month's figures, for valuation
}
export interface EconState {
  firms: Firm[]; hh: HH[]; wage: number; policyRate: number; cpi: number; cpiBase: number; cpiHist: number[];
  unemployment: number; shockUntil: number; shockEv?: number; macroEv: number; wageEv: number; rateEv: number;
  yGdp: number; yReal: number; mSpend: number; defaults: number; taxEma: number; taxToday: number; profitTaxDaily: number;
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
const bankEquity = (w: World): number => w.ledger.netWorth(BANK);
function totalLoans(w: World, s: EconState): number { let t = 0; for (const f of s.firms) t += loanOf(w, f); return t; }

/** Bank lends by creating a loan asset and a matching deposit. Refused if it would breach 8% capital. */
function borrow(w: World, s: EconState, f: Firm, cents: number, cause: number): boolean {
  const a = Math.round(cents);
  if (a <= 0) return true;
  const dailyCost = f.workers * s.wage + 1;
  if (loanOf(w, f) + a > 150 * dailyCost) return false;
  if (bankEquity(w) < 0.08 * (totalLoans(w, s) + a)) return false;
  w.ledger.issue('loan:' + f.id, BANK, a, 'loan.grant', cause);
  w.ledger.issue(DEP, f.id, a, 'loan.grant', cause);
  return true;
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
function buy(w: World, s: EconState, buyer: string, good: string, qty: number, reason: string, cause: number, payFn = pay): { got: number; spent: number } {
  let got = 0, spent = 0;
  const sellers = firmsOf(s, good).sort((a, b) => a.price - b.price || (a.id < b.id ? -1 : 1));
  for (const f of sellers) {
    if (qty - got <= 1e-9) break;
    const q = Math.min(qty - got, inv(w, f));
    if (q <= 1e-9) continue;
    const cost = Math.round(q * f.price);
    if (buyer !== GOV && cash(w, buyer) < cost) continue;
    if (buyer === GOV) govPay(w, f.id, cost, reason, cause); else payFn(w, buyer, f.id, cost, reason, cause);
    w.ledger.move('good:' + good, f.id, buyer, q, reason, cause);
    f.sold += q; f.mRev += cost; got += q; spent += cost;
  }
  if (qty - got > 1e-6) for (const f of sellers) f.lost += (qty - got) / sellers.length;
  return { got, spent };
}

function unitCost(s: EconState, f: Firm, prodEff: number): number {
  const d = SECTORS[f.sector];
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
    for (const d of Object.values(SECTORS)) L.define({ id: 'good:' + d.good, kind: 'real' });

    const hh: HH[] = [
      { id: 'hh_workers', laborShare: 0.70, cY: 0.95, cW: 0.0020, incEma: 0, incToday: 0 },
      { id: 'hh_middle', laborShare: 0.27, cY: 0.85, cW: 0.0020, incEma: 0, incToday: 0 },
      { id: 'hh_rich', laborShare: 0.03, cY: 0.70, cW: 0.0030, incEma: 0, incToday: 0 },
    ];
    const own = [0.05, 0.25, 0.70]; // who buys the shares at genesis
    for (const h of hh) L.addActor(h.id, 'household');

    const wage = 100_00; // cents per worker-day
    const s: EconState = {
      firms: [], hh, wage, policyRate: 0.03, cpi: 1, cpiBase: 1, cpiHist: [], unemployment: 0.1, shockUntil: -1,
      macroEv: g, wageEv: g, rateEv: g, yGdp: 0, yReal: 0, mSpend: 0, defaults: 0, taxEma: 0, taxToday: 0, profitTaxDaily: 0,
    };
    w.state.economy = s;
    for (const [sec, d] of Object.entries(SECTORS)) for (let i = 1; i <= FIRMS_PER_SECTOR; i++) {
      const id = `frm_${sec}_${i}`;
      L.addActor(id, 'firm');
      L.define({ id: 'eq:' + id, kind: 'share', issuer: id });
      L.define({ id: 'loan:' + id, kind: 'claim', issuer: id });
      const workers = Math.round(d.startWorkers / FIRMS_PER_SECTOR);
      s.firms.push({ id, sector: sec, good: d.good, price: 0, workers, expSales: workers * d.prod, sold: 0, lost: 0, unitCost: 0,
        mRev: 0, mCost: 0, mStockDays: 0, mPrice0: 0, mUnitCost0: 0, lastProfit: 0, lastDividend: 0 });
    }
    for (const f of s.firms) if (f.sector === 'energy') { f.unitCost = wage / SECTORS.energy.prod; f.price = f.unitCost * MARKUP; }
    for (const f of s.firms) if (f.sector !== 'energy') { f.unitCost = unitCost(s, f, SECTORS[f.sector].prod); f.price = f.unitCost * MARKUP; }
    for (const f of s.firms) { f.mPrice0 = f.price; f.mUnitCost0 = f.unitCost; if (!SECTORS[f.sector].perishable) L.produce('good:' + f.good, f.id, f.expSales * INV_DAYS, 'genesis', g); }

    // All money starts as bank credit to the government, which endows households; households capitalise firms and the bank.
    const dailyWages = s.firms.reduce((t, f) => t + f.workers, 0) * wage;
    const endow = dailyWages * 110;
    L.issue(BOND, BANK, endow, 'genesis', g); L.issue(DEP, GOV, endow, 'genesis', g);
    hh.forEach((h, i) => pay(w, GOV, h.id, endow * 0.95 * [0.35, 0.30, 0.35][i], 'genesis.endowment', g));
    const SHARES = 1_000_000;
    for (const f of s.firms) hh.forEach((h, i) => {
      pay(w, h.id, f.id, f.workers * wage * 30 * own[i], 'genesis.equity', g);
      L.issue('eq:' + f.id, h.id, Math.round(SHARES * own[i]), 'genesis.equity', g);
    });
    hh.forEach((h, i) => {
      pay(w, h.id, BANK, dailyWages * 8 * own[i], 'genesis.equity', g);
      L.issue('eq:' + BANK, h.id, Math.round(SHARES * own[i]), 'genesis.equity', g);
    });
    for (const h of hh) h.incEma = dailyWages * h.laborShare * (1 - INCOME_TAX);
    s.taxEma = dailyWages * INCOME_TAX;
    s.cpiBase = cpiLevel(s); s.cpiHist.push(1);
  },

  dayClose(w) {
    const s: EconState = w.state.economy, L = w.ledger;
    for (const f of s.firms) { f.sold = 0; f.lost = 0; }
    for (const h of s.hh) h.incToday = 0;
    s.taxToday = 0;

    // Tagged outside shock: an energy supply disruption. The only random draw in this module.
    if (w.day % DAYS_PER_YEAR === 0 && w.day > 0 && w.rng('shock.energy').chance(0.35)) {
      s.shockUntil = w.day + 150;
      s.shockEv = w.events.exo('shock.energy', 'energy supply disruption: output per worker -30% for 150 days');
    }
    const shock = w.day < s.shockUntil;

    // 1. Hiring and firing toward planned output.
    let employed = s.firms.reduce((t, f) => t + f.workers, 0);
    for (const f of s.firms) {
      const d = SECTORS[f.sector], prodEff = d.prod * (shock && f.sector === 'energy' ? 0.7 : 1);
      const target = d.perishable ? f.expSales * 1.03 : f.expSales + (f.expSales * INV_DAYS - inv(w, f)) / 10;
      const want = Math.max(0, target) / prodEff;
      let delta = Math.round(0.06 * (want - f.workers));
      if (delta > 0) delta = Math.min(delta, LABOR_FORCE - employed);
      f.workers += delta; employed += delta;
    }

    // 2. Production: buy inputs, pay wages, make goods.
    for (const f of s.firms) {
      const d = SECTORS[f.sector], prodEff = d.prod * (shock && f.sector === 'energy' ? 0.7 : 1);
      const cause = (shock && f.sector === 'energy' ? s.shockEv : undefined) ?? s.macroEv;
      f.unitCost = unitCost(s, f, prodEff);
      let out = f.workers * prodEff;
      for (const [g, k] of Object.entries(d.inputs)) {
        const avail = firmsOf(s, g).reduce((t, x) => t + inv(w, x), 0);
        if (avail < out * k) {
          out = avail / k;
          if (f.inputShortEv === undefined) {
            const up = firmsOf(s, g).map((x) => x.stockoutEv).filter((x): x is number => x !== undefined);
            f.inputShortEv = w.events.emit('firm.inputShort', `could not buy enough ${g}; output cut`, up.length ? up : [cause], f.id);
          }
        }
      }
      const wageBill = f.workers * s.wage;
      const need = wageBill + out * (f.unitCost - s.wage / prodEff);
      if (cash(w, f.id) < need && !borrow(w, s, f, need - cash(w, f.id) + wageBill * 5, cause)) {
        const scale = Math.max(0, cash(w, f.id) / need) * 0.98;
        const fired = f.workers - Math.floor(f.workers * scale);
        f.workers -= fired; out *= scale;
        if (fired > 0) w.events.emit('firm.cashCrunch', `no cash and no credit: laid off ${fired}`, [cause], f.id);
      }
      for (const [g, k] of Object.entries(d.inputs)) {
        const r = buy(w, s, f.id, g, out * k, 'b2b.input', cause);
        L.consume('good:' + g, f.id, r.got, 'production.input', cause);
        f.mCost += r.spent;
        if (r.got < out * k - 1e-6) out = r.got / k;
      }
      const bill = f.workers * s.wage;
      for (const h of s.hh) {
        const gross = Math.round(bill * h.laborShare), tax = Math.round(gross * INCOME_TAX);
        if (pay(w, f.id, h.id, gross - tax, 'wages', cause)) h.incToday += gross - tax;
        if (pay(w, f.id, GOV, tax, 'tax.income', cause)) s.taxToday += tax;
      }
      f.mCost += bill;
      L.produce('good:' + f.good, f.id, out, 'production', cause);
      s.yReal += out;
    }
    s.unemployment = 1 - s.firms.reduce((t, f) => t + f.workers, 0) / LABOR_FORCE;

    // 3. Unemployment benefits.
    const benefits = s.unemployment * LABOR_FORCE * s.wage * BENEFIT_RATE;
    for (const h of s.hh) { const b = Math.round(benefits * h.laborShare); govPay(w, h.id, b, 'gov.benefits', s.macroEv); h.incToday += b; }

    // 4. Households spend from income and wealth, split across goods by fixed budget shares.
    for (const h of s.hh) {
      const budget = Math.min(cash(w, h.id), h.cY * h.incEma + h.cW * cash(w, h.id));
      for (const d of Object.values(SECTORS)) {
        const avgP = firmsOf(s, d.good).reduce((t, x) => t + x.price, 0) / FIRMS_PER_SECTOR;
        const r = buy(w, s, h.id, d.good, (budget * d.share) / avgP, 'consumption', s.macroEv);
        L.consume('good:' + d.good, h.id, r.got, 'consumption', s.macroEv);
        s.yGdp += r.spent; s.mSpend += r.spent;
      }
    }
    // 5. Government buys public services.
    // Budget rule: spend what taxes bring in, net of debt interest and of benefits at the natural unemployment rate.
    // Above that rate benefits are deficit-financed (automatic stabiliser); below it the budget runs a surplus.
    s.taxEma += (s.taxToday - s.taxEma) / 30;
    const coupon = (L.issued.get(BOND) ?? 0) * s.policyRate / 360;
    const govBudget = Math.max(0, s.taxEma + s.profitTaxDaily - coupon - NATURAL_UNEMP * LABOR_FORCE * s.wage * BENEFIT_RATE);
    const servP = firmsOf(s, 'services').reduce((t, x) => t + x.price, 0) / FIRMS_PER_SECTOR;
    const gr = buy(w, s, GOV, 'services', govBudget / servP, 'gov.purchases', s.macroEv);
    L.consume('good:services', GOV, gr.got, 'gov.purchases', s.macroEv);
    s.yGdp += gr.spent;

    // 6. Firms close the day: spoilage, sales expectations, prices.
    for (const f of s.firms) {
      const d = SECTORS[f.sector];
      if (d.perishable) L.consume('good:' + f.good, f.id, inv(w, f), 'spoilage', s.macroEv);
      f.expSales += 0.1 * (f.sold + 0.5 * f.lost - f.expSales);
      const stock = inv(w, f), target = f.expSales * INV_DAYS;
      const tight = d.perishable ? f.lost > 0 : stock < 0.7 * target;
      const loose = d.perishable ? f.sold < 0.9 * f.workers * d.prod : stock > 1.3 * target;
      if (tight) {
        f.price *= 1.003; f.mStockDays++;
        if (f.stockoutEv === undefined && f.lost > 0) {
          const c = [f.inputShortEv, shock && f.sector === 'energy' ? s.shockEv : undefined].filter((x): x is number => x !== undefined);
          f.stockoutEv = w.events.emit('firm.stockout', `sold out of ${f.good}; demand unmet`, c.length ? c : [s.macroEv], f.id);
        }
      } else if (loose) f.price *= 0.997;
      f.price = Math.max(f.price, f.unitCost * 1.03);
      for (const h of s.hh) h.incEma += (h.incToday - h.incEma) / 30;
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
          for (const g of Object.keys(SECTORS[f.sector].inputs)) for (const x of firmsOf(s, g)) if (x.priceEv !== undefined) c.push(x.priceEv);
          c.push(s.wageEv);
        }
        if (!c.length) c.push(s.macroEv);
        const id = E.emit('firm.price', `${f.good} price ${ch > 0 ? '+' : ''}${(ch * 100).toFixed(1)}% this month (unit cost ${(costCh * 100).toFixed(1)}%, ${f.mStockDays} tight days)`, c.slice(0, 4), f.id);
        priceEvs.push({ id, mag: Math.abs(ch) * SECTORS[f.sector].share });
        f.priceEv = id;
      } else f.priceEv = undefined;
    }
    priceEvs.sort((a, b) => b.mag - a.mag);
    const cpiEv = E.emit('macro.cpi', `CPI ${(mInfl * 100).toFixed(2)}% on the month, ${(yoy * 100).toFixed(1)}% on the year`, priceEvs.length ? priceEvs.slice(0, 3).map((x) => x.id) : [s.macroEv]);
    const uEv = E.emit('macro.jobs', `unemployment ${(s.unemployment * 100).toFixed(1)}%`, [s.macroEv]);
    s.macroEv = E.emit('macro.demand', `household spending ${(s.mSpend / 30 / 1e8).toFixed(2)}M per day`, [cpiEv, uEv, s.rateEv]);
    s.mSpend = 0;

    // Wages follow the labour market and part of inflation.
    const wCh = Math.max(-0.015, Math.min(0.015, 0.05 * (NATURAL_UNEMP - s.unemployment) + 0.4 * mInfl));
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
      const buffer = f.workers * s.wage * 30;
      let excess = cash(w, f.id) - buffer;
      if (excess > 0 && loan > 0) {
        const r = Math.min(excess, loan);
        L.redeem(DEP, f.id, r, 'loan.repay', s.macroEv); L.redeem('loan:' + f.id, BANK, r, 'loan.repay', s.macroEv);
        excess -= r;
      }
      f.lastProfit = profit; f.lastDividend = Math.max(0, Math.round(excess));
      if (excess > 0) payDividends(w, s, f.id, excess, s.macroEv);
      if (loan > 0 && loanOf(w, f) > 140 * (f.workers * s.wage + 1) && profit < 0) {
        const off = Math.round(loanOf(w, f) * 0.5);
        const ev = E.emit('firm.default', `could not service debt; bank wrote off ${(off / 1e8).toFixed(1)}M`, [f.priceEv ?? s.macroEv, s.rateEv], f.id);
        L.redeem('loan:' + f.id, BANK, off, 'loan.writeoff', ev);
        s.defaults++;
      }
      f.mRev = 0; f.mCost = 0; f.mStockDays = 0; f.mPrice0 = f.price; f.mUnitCost0 = f.unitCost;
      f.stockoutEv = undefined; f.inputShortEv = undefined;
    }

    s.profitTaxDaily = profitTax / 30;

    // Government coupon, bank deposit interest, bank dividends.
    govPay(w, BANK, (L.issued.get(BOND) ?? 0) * s.policyRate / 12, 'gov.coupon', s.rateEv);
    for (const h of s.hh) { const i = Math.round(cash(w, h.id) * depRate / 12); pay(w, BANK, h.id, i, 'deposit.interest', s.rateEv); h.incEma += i / 30; }
    const eqTarget = 0.12 * totalLoans(w, s) + 0.04 * (L.issued.get(BOND) ?? 0);
    const spare = bankEquity(w) - eqTarget;
    if (spare > 0) payDividends(w, s, BANK, spare * 0.25, s.rateEv);
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
      defaults: s.defaults,
    };
    s.yGdp = 0; s.yReal = 0;
    return out;
  },
};

function payDividends(w: World, s: EconState, issuer: string, cents: number, cause: number): void {
  const holders = w.ledger.holders('eq:' + issuer), total = w.ledger.issued.get('eq:' + issuer) ?? 0;
  if (!total) return;
  for (const [h, n] of holders) {
    const a = Math.floor(cents * n / total);
    if (pay(w, issuer, h, a, 'dividends', cause)) { const hh = s.hh.find((x) => x.id === h); if (hh) hh.incEma += a / 30; }
  }
}
function cpiLevel(s: EconState): number {
  let c = 0;
  for (const d of Object.values(SECTORS)) {
    const fs = firmsOf(s, d.good), wsum = fs.reduce((t, f) => t + f.expSales, 0) || 1;
    c += d.share * fs.reduce((t, f) => t + f.price * f.expSales, 0) / wsum;
  }
  return c;
}
