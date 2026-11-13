// Seed economy: the reference module. A closed, stock-flow consistent loop:
//   people work -> wages -> consumption -> firm revenue -> profit -> tax, interest, dividends -> people
// Every person is simulated: name, family, age, skill, employer, their own bank balance, needs and stress.
// Mechanics taken from the Dwarf Fortress decompilation (docs in the owner's notes): needs are timers that
// fire thoughts at thresholds; a personality trait dampens each thought (none / half / a tenth / immune);
// positions are refilled heirs-first with recursive vacancies; life events run in one yearly pass.
// with a bank that creates money by lending, a government, and a central bank that reacts to inflation.
// Random draws: one tagged outside shock (energy supply) and individual life events (traits at birth, death, pairing, births).
// Later modules replace parts of this (markets, firm detail, banking); the pattern to copy is:
// state in w.state.economy, money only through the ledger, every event with a cause.
import { DAYS_PER_YEAR, type Module, type World } from '../../kernel/index.ts';
import { CEO_BAD_MONTHS, type Person, isAdult, joinFirm, leaveJob, makePerson, personName, succession, thought, yearlyLifePass } from './people.ts';

export const DEP = 'dep';          // bank deposits: the money everyone pays with
export const BANK = 'bank_1', GOV = 'gov', CB = 'cb';
const BOND = 'bond:gov';

interface SectorDef { good: string; prod: number; inputs: Record<string, number>; share: number; perishable?: boolean; startShare: number }
// Order matters: upstream first, so inputs exist when downstream produces.
export const SECTORS: Record<string, SectorDef> = {
  energy: { good: 'energy', prod: 20, inputs: {}, share: 0.10, startShare: 0.06 },
  agri: { good: 'food', prod: 8, inputs: { energy: 0.1 }, share: 0.25, startShare: 0.21 },
  manu: { good: 'goods', prod: 4, inputs: { energy: 0.3 }, share: 0.25, startShare: 0.24 },
  serv: { good: 'services', prod: 6, inputs: { goods: 0.05, energy: 0.05 }, share: 0.40, perishable: true, startShare: 0.39 },
};
const FIRMS_PER_SECTOR = 3;
export const POPULATION = +(process.env.SIM_POP ?? 20_000);
const PAY_EVERY = 7; // wages, benefits and shopping run weekly per person
const MARKUP = 1.2, INV_DAYS = 5;
const INCOME_TAX = 0.12, PROFIT_TAX = 0.2, BENEFIT_RATE = 0.4;
const NATURAL_UNEMP = 0.07;

export interface Firm {
  id: string; idx: number; sector: string; good: string; price: number; workers: number; expSales: number;
  staff: number[]; eff: number; ceo: number; family: boolean; badMonths: number; ceoEv?: number; // people: indexes into s.people; eff = sum of staff skill
  sold: number; lost: number; unitCost: number;
  mRev: number; mCost: number; mStockDays: number; mPrice0: number; mUnitCost0: number; layoffEv?: number;
  stockoutEv?: number; inputShortEv?: number; priceEv?: number;
  lastProfit: number; lastDividend: number; // last month's figures, for valuation
}
export interface EconState {
  firms: Firm[]; people: Person[]; investors: { id: string; target: number }[]; laborForce: number; hirePtr: number; breakdowns: number; successions: number;
  wage: number; policyRate: number; cpi: number; cpiBase: number; cpiHist: number[];
  unemployment: number; shockUntil: number; shockEv?: number; macroEv: number; wageEv: number; rateEv: number;
  yGdp: number; yGdpEma: number; yReal: number; mSpend: number; defaults: number; taxEma: number; taxToday: number; profitTaxDaily: number; dayGdp: number; taxRate: number; pensionEma: number; pensionToday: number;
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
  const dailyCost = f.eff * s.wage + 1;
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

    const wage = 100_00; // cents per day for skill 1.0
    const s: EconState = {
      firms: [], people: [], investors: [], laborForce: 0, hirePtr: 0, breakdowns: 0, successions: 0,
      wage, policyRate: 0.03, cpi: 1, cpiBase: 1, cpiHist: [], unemployment: 0.1, shockUntil: -1,
      macroEv: g, wageEv: g, rateEv: g, yGdp: 0, yGdpEma: 1, yReal: 0, mSpend: 0, defaults: 0, taxEma: 0, taxToday: 0, profitTaxDaily: 0, dayGdp: 0, taxRate: INCOME_TAX, pensionEma: 0, pensionToday: 0,
    };
    w.state.economy = s;

    // People first. Founding generation: adults aged 18 to 64.
    const rng = w.rng('genesis:people');
    for (let i = 0; i < POPULATION; i++) {
      const p = makePerson(w, s, i, -rng.int(65) * DAYS_PER_YEAR - rng.int(DAYS_PER_YEAR), undefined);
      s.people.push(p); L.addActor(p.id, 'person');
    }
    { // Founding couples: most adults over 25 start out married, to someone close in age.
      const adults = s.people.filter((p) => w.day - p.born >= 25 * DAYS_PER_YEAR).sort((a, b) => a.born - b.born || a.i - b.i);
      for (let k = 0; k + 1 < adults.length; k += 2) if (rng.chance(0.7)) { adults[k].spouse = adults[k + 1].i; adults[k + 1].spouse = adults[k].i; }
    }
    const workforce = s.people.filter((p) => isAdult(w, p));
    s.laborForce = s.people.filter((p) => isAdult(w, p)).length;

    // Firms, staffed by named people. The most skilled hire becomes the first chief executive.
    let next = 0;
    for (const [sec, d] of Object.entries(SECTORS)) for (let i = 1; i <= FIRMS_PER_SECTOR; i++) {
      const id = `frm_${sec}_${i}`;
      L.addActor(id, 'firm');
      L.define({ id: 'eq:' + id, kind: 'share', issuer: id });
      L.define({ id: 'loan:' + id, kind: 'claim', issuer: id });
      const f: Firm = { id, idx: s.firms.length, sector: sec, good: d.good, price: 0, workers: 0, expSales: 0, sold: 0, lost: 0, unitCost: 0,
        staff: [], eff: 0, ceo: -1, family: i === 1, badMonths: 0,
        mRev: 0, mCost: 0, mStockDays: 0, mPrice0: 0, mUnitCost0: 0, lastProfit: 0, lastDividend: 0 };
      const n = Math.round(s.laborForce * 0.9 * d.startShare / FIRMS_PER_SECTOR);
      for (let k = 0; k < n; k++) { const p = workforce[next++]; p.employer = f.idx; f.staff.push(p.i); f.eff += p.skill; }
      f.workers = f.staff.length; f.expSales = f.eff * d.prod;
      f.ceo = f.staff.reduce((b, x) => (s.people[x].skill > s.people[b].skill ? x : b), f.staff[0]);
      s.firms.push(f);
    }
    s.hirePtr = 0;
    for (const f of s.firms) if (f.sector === 'energy') { f.unitCost = wage / SECTORS.energy.prod; f.price = f.unitCost * MARKUP; }
    for (const f of s.firms) if (f.sector !== 'energy') { f.unitCost = unitCost(s, f, SECTORS[f.sector].prod); f.price = f.unitCost * MARKUP; }
    for (const f of s.firms) { f.mPrice0 = f.price; f.mUnitCost0 = f.unitCost; if (!SECTORS[f.sector].perishable) L.produce('good:' + f.good, f.id, f.expSales * INV_DAYS, 'genesis', g); }

    // All money starts as bank credit to the government. It endows every adult with savings, and gives the
    // founding owners (the top 5% by skill, the chief executives first) the capital they put into the firms and the bank.
    const SHARES = 1_000_000;
    const dailyWages = s.firms.reduce((t, f) => t + f.eff, 0) * wage;
    const owners = [...workforce].sort((a, b) => b.skill - a.skill || a.i - b.i).slice(0, Math.max(10, Math.round(workforce.length * 0.05)));
    const wsum = owners.reduce((t, p) => t + p.skill ** 3, 0);
    const capital = (f: Firm): number => Math.round(f.eff * wage * 30);
    const bankCap = Math.round(dailyWages * 8);
    const firmCap = s.firms.reduce((t, f) => t + capital(f), 0);
    const liquid = Math.round(firmCap * 0.6); // the owners' financial savings, which seed the investment funds
    const endow = Math.round(dailyWages * 75) + firmCap + bankCap + liquid;
    L.issue(BOND, BANK, endow, 'genesis', g); L.issue(DEP, GOV, endow, 'genesis', g);
    for (const p of workforce) { pay(w, GOV, p.id, Math.round(wage * p.skill * 60), 'genesis.endowment', g); p.incEma = wage * p.skill * (1 - INCOME_TAX); }
    const float = (issuer: string, cents: number, lead: Person | undefined): void => {
      let left = SHARES, paid = 0;
      owners.forEach((p, k) => {
        let share = p.skill ** 3 / wsum;
        if (lead) share = p === lead ? 0.4 + 0.6 * share : 0.6 * share; // a founder holds 40% of a family firm
        const sh = k === owners.length - 1 ? left : Math.min(left, Math.round(SHARES * share));
        const c = k === owners.length - 1 ? cents - paid : Math.round(cents * share);
        left -= sh; paid += c;
        pay(w, GOV, p.id, c, 'genesis.capital', g); pay(w, p.id, issuer, c, 'genesis.equity', g);
        if (sh > 0) L.issue('eq:' + issuer, p.id, sh, 'genesis.equity', g);
      });
    };
    for (const f of s.firms) float(f.id, capital(f), f.family ? (owners.includes(s.people[f.ceo]) ? s.people[f.ceo] : owners[f.idx]) : undefined);
    float(BANK, bankCap, undefined);
    for (const p of owners) pay(w, GOV, p.id, Math.floor(liquid * p.skill ** 3 / wsum), 'genesis.endowment', g);
    for (const f of s.firms) if (f.family) { const lead = owners.includes(s.people[f.ceo]) ? s.people[f.ceo] : owners[f.idx]; if (lead.employer !== f.idx) joinFirm(s, lead, f); f.ceo = lead.i; }
    s.investors = owners.slice(0, 300).map((p, k) => ({ id: p.id, target: 0.6 - 0.3 * k / 300 }));
    s.taxEma = dailyWages * INCOME_TAX;
    s.cpiBase = cpiLevel(s); s.cpiHist.push(1);
  },

  dayClose(w) {
    const s: EconState = w.state.economy, L = w.ledger;
    for (const f of s.firms) { f.sold = 0; f.lost = 0; }
    s.taxToday = 0; s.pensionToday = 0;

    if (w.day > 0 && w.day % DAYS_PER_YEAR === 0) yearlyLifePass(w, s);

    // Tagged outside shock: an energy supply disruption. The only random draw in this module.
    if (w.day % DAYS_PER_YEAR === 0 && w.day > 0 && w.rng('shock.energy').chance(0.35)) {
      s.shockUntil = w.day + 150;
      s.shockEv = w.events.exo('shock.energy', 'energy supply disruption: output per worker -30% for 150 days');
    }
    const shock = w.day < s.shockUntil;

    // 1. Hiring and firing toward planned output. Real people are hired from the unemployed and laid off last-in first-out.
    const invDays = (f: Firm): number => INV_DAYS * (f.ceo >= 0 ? 0.7 + 0.6 * (0.98 - s.people[f.ceo].cY) / 0.18 : 1); // a prudent chief keeps more stock
    for (const f of s.firms) {
      const d = SECTORS[f.sector], prodEff = d.prod * (shock && f.sector === 'energy' ? 0.7 : 1);
      const cause = (shock && f.sector === 'energy' ? s.shockEv : undefined) ?? s.macroEv;
      const target = d.perishable ? f.expSales * 1.03 : f.expSales + (f.expSales * invDays(f) - inv(w, f)) / 10;
      const goal = f.eff + 0.06 * (Math.max(0, target) / prodEff - f.eff);
      for (let tries = 0; f.eff < goal - 0.5 && tries < s.people.length; tries++) {
        const p = s.people[s.hirePtr]; s.hirePtr = (s.hirePtr + 1) % s.people.length;
        if (p.employer < 0 && isAdult(w, p)) { joinFirm(s, p, f); p.lastEv = undefined; }
      }
      while (f.eff > goal + 1.5 && f.staff.length > 1) {
        let k = f.staff.length - 1; if (f.staff[k] === f.ceo) k--;
        const p = s.people[f.staff[k]];
        f.layoffEv ??= w.events.emit('firm.layoffs', `sales of ${f.good} below plan: laying off staff`, [f.priceEv ?? cause], f.id);
        leaveJob(s, p); p.lastEv = f.layoffEv;
      }
    }

    // 2. Production: buy inputs, make goods. Wages accrue daily and are paid weekly.
    const payday = w.day % PAY_EVERY === PAY_EVERY - 1;
    for (const f of s.firms) {
      const d = SECTORS[f.sector], prodEff = d.prod * (shock && f.sector === 'energy' ? 0.7 : 1);
      const cause = (shock && f.sector === 'energy' ? s.shockEv : undefined) ?? s.macroEv;
      f.unitCost = unitCost(s, f, prodEff);
      let out = f.eff * prodEff;
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
      for (const [g, k] of Object.entries(d.inputs)) {
        const r = buy(w, s, f.id, g, out * k, 'b2b.input', cause);
        L.consume('good:' + g, f.id, r.got, 'production.input', cause);
        f.mCost += r.spent;
        if (r.got < out * k - 1e-6) out = r.got / k;
      }
      f.mCost += f.eff * s.wage;
      L.produce('good:' + f.good, f.id, out, 'production', cause);
      s.yReal += out;

      if (payday) {
        const bill = Math.round(f.eff * s.wage * PAY_EVERY);
        if (cash(w, f.id) < bill) borrow(w, s, f, bill - cash(w, f.id) + bill, cause);
        const frac = Math.min(1, cash(w, f.id) / Math.max(1, bill)) * (cash(w, f.id) < bill ? 0.98 : 1);
        let tax = 0;
        for (const x of f.staff) {
          const p = s.people[x];
          const gross = Math.round(p.skill * s.wage * PAY_EVERY * frac), t = Math.round(gross * s.taxRate);
          if (pay(w, f.id, p.id, gross - t, 'wages', cause)) { p.incWeek += gross - t; tax += t; }
        }
        if (pay(w, f.id, GOV, tax, 'tax.income', cause)) s.taxToday += tax;
        if (frac < 1) {
          const ev = w.events.emit('firm.cashCrunch', `no cash and no credit: paid ${(frac * 100).toFixed(0)}% of wages and cut a sixth of the staff`, [f.priceEv ?? cause], f.id);
          for (let k = Math.floor(f.staff.length / 6); k > 0 && f.staff.length > 1; k--) {
            let j = f.staff.length - 1; if (f.staff[j] === f.ceo) j--;
            const p = s.people[f.staff[j]]; leaveJob(s, p); p.lastEv = ev;
          }
        }
      }
    }
    const employed = s.firms.reduce((t, f) => t + f.staff.length, 0);
    s.unemployment = Math.max(0, 1 - employed / Math.max(1, s.laborForce));

    // 3 and 4. Each person, once a week on their own day: benefits or pension, needs and stress, then shopping.
    const sellers: Record<string, Firm[]> = {}, avgP: Record<string, number> = {};
    for (const d of Object.values(SECTORS)) {
      sellers[d.good] = firmsOf(s, d.good).sort((a, b) => a.price - b.price || (a.id < b.id ? -1 : 1));
      avgP[d.good] = sellers[d.good].reduce((t, x) => t + x.price, 0) / FIRMS_PER_SECTOR;
    }
    const thrift = 1 - 1.5 * Math.max(0, s.policyRate - 0.02); // higher interest rates make saving more attractive
    const slot = w.day % PAY_EVERY;
    for (let i = slot; i < s.people.length; i += PAY_EVERY) {
      const p = s.people[i];
      if (!p.alive) continue;
      const adult = isAdult(w, p);
      if (p.retired || (adult && p.employer < 0)) {
        const b = Math.round(s.wage * BENEFIT_RATE * PAY_EVERY * (p.retired ? 1 : Math.min(1, p.skill)));
        govPay(w, p.id, b, p.retired ? 'gov.pensions' : 'gov.benefits', s.macroEv); p.incWeek += b; if (p.retired) s.pensionToday += b;
      }
      if (!adult && !p.retired) continue; // children live off their parents
      if (w.day >= PAY_EVERY) p.incEma += (p.incWeek / PAY_EVERY - p.incEma) / 4;
      p.incWeek = 0;
      const money = cash(w, p.id);
      // Needs are timers; crossing a threshold fires a thought.
      if (adult && p.employer < 0) {
        const before = p.jobless; p.jobless += PAY_EVERY;
        if (before < 28 && p.jobless >= 28) thought(w, s, p, 100, 'a month without work', s.macroEv);
        else if (before < 91 && p.jobless >= 91) thought(w, s, p, 200, 'three months without work', s.macroEv);
        else if (p.jobless > 91 && p.jobless % 56 < PAY_EVERY) thought(w, s, p, 100, 'still without work', s.macroEv);
      }
      if (money < 3 * p.incEma) { p.broke += PAY_EVERY; if (p.broke % 14 < PAY_EVERY) thought(w, s, p, 150, 'cannot cover the week', s.macroEv); } else p.broke = 0;
      p.stress = Math.max(0, p.stress - PAY_EVERY);
      const fear = w.day < p.fearUntil ? 0.8 : 1;
      const budget = Math.min(money, PAY_EVERY * (p.cY * fear * thrift * p.incEma + 0.002 * money));
      for (const d of Object.values(SECTORS)) {
        let want = (budget * d.share) / avgP[d.good], got = 0;
        for (const f of sellers[d.good]) {
          if (want <= 1e-9) break;
          const q = Math.min(want, inv(w, f));
          if (q <= 1e-9) continue;
          const cost = Math.round(q * f.price);
          if (!pay(w, p.id, f.id, cost, 'consumption', s.macroEv)) continue;
          L.consume('good:' + d.good, f.id, q, 'consumption', s.macroEv);
          f.sold += q; f.mRev += cost; want -= q; got += cost;
        }
        if (want > 1e-6) for (const f of sellers[d.good]) f.lost += want / FIRMS_PER_SECTOR;
        s.yGdp += got; s.mSpend += got; s.dayGdp += got;
      }
    }
    // 5. Government buys public services.
    // Budget rule: spend what taxes bring in, net of debt interest and of benefits at the natural unemployment rate.
    // Above that rate benefits are deficit-financed (automatic stabiliser); below it the budget runs a surplus.
    s.taxEma += (s.taxToday - s.taxEma) / 30; s.pensionEma += (s.pensionToday - s.pensionEma) / 30;
    const coupon = (L.issued.get(BOND) ?? 0) * s.policyRate / 360;
    const govBudget = Math.max(0, s.taxEma + s.profitTaxDaily - coupon - s.pensionEma - NATURAL_UNEMP * s.laborForce * s.wage * BENEFIT_RATE);
    // In a slump the government adds deficit-financed purchases, scaled to the excess unemployment.
    const stimulus = Math.max(0, s.unemployment - NATURAL_UNEMP - 0.03) * s.laborForce * s.wage * 0.6;
    const servP = firmsOf(s, 'services').reduce((t, x) => t + x.price, 0) / FIRMS_PER_SECTOR;
    const gdp0 = s.yGdp;
    const gr = buy(w, s, GOV, 'services', (govBudget + stimulus) / servP, 'gov.purchases', s.macroEv);
    L.consume('good:services', GOV, gr.got, 'gov.purchases', s.macroEv);
    s.yGdp += gr.spent;
    s.dayGdp += gr.spent; s.yGdpEma = w.day < 30 ? Math.max(s.yGdpEma, s.dayGdp) : s.yGdpEma + (s.dayGdp - s.yGdpEma) / 30; s.dayGdp = 0; void gdp0;

    // 6. Firms close the day: spoilage, sales expectations, prices.
    for (const f of s.firms) {
      const d = SECTORS[f.sector];
      if (d.perishable) L.consume('good:' + f.good, f.id, inv(w, f), 'spoilage', s.macroEv);
      f.expSales += 0.1 * (f.sold + 0.5 * f.lost - f.expSales);
      const stock = inv(w, f), target = f.expSales * invDays(f);
      const tight = d.perishable ? f.lost > 0 : stock < 0.7 * target;
      const loose = d.perishable ? f.sold < 0.9 * f.eff * d.prod : stock > 1.3 * target;
      if (tight) {
        f.price *= 1.003; f.mStockDays++;
        if (f.stockoutEv === undefined && f.lost > 0) {
          const c = [f.inputShortEv, shock && f.sector === 'energy' ? s.shockEv : undefined].filter((x): x is number => x !== undefined);
          f.stockoutEv = w.events.emit('firm.stockout', `sold out of ${f.good}; demand unmet`, c.length ? c : [s.macroEv], f.id);
        }
      } else if (loose) f.price *= 0.997;
      f.price = Math.max(f.price, f.unitCost * 1.03);
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

    // Fiscal rule: the income tax rate moves a quarter point a month to keep public debt between 130 and 190 days of GDP.
    // Spare government cash retires bonds.
    const spare = Math.min(L.issued.get(BOND) ?? 0, Math.floor(cash(w, GOV) - 20 * s.yGdpEma * 0.2));
    if (spare > 0 && L.redeem(DEP, GOV, spare, 'gov.repay', s.macroEv)) L.redeem(BOND, BANK, spare, 'gov.repay', s.macroEv);
    const debtDays = (L.issued.get(BOND) ?? 0) / Math.max(1, s.yGdpEma);
    const t0 = s.taxRate;
    if (debtDays > 190 && s.taxRate < 0.4 && s.unemployment < NATURAL_UNEMP + 0.02) s.taxRate += 0.0025; // no tax rises in a slump else if (debtDays < 130 && s.taxRate > 0.06) s.taxRate -= 0.0025;
    if (Math.round(s.taxRate * 100) !== Math.round(t0 * 100)) E.emit('gov.tax', `income tax now ${(s.taxRate * 100).toFixed(0)}%: public debt is ${debtDays.toFixed(0)} days of GDP`, [s.macroEv], GOV);

    // Wages follow the labour market and part of inflation.
    const wCh = Math.max(-0.003, // wages are sticky downward
      Math.min(0.015, 0.05 * (NATURAL_UNEMP - s.unemployment) + 0.4 * mInfl));
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
      if (f.badMonths >= CEO_BAD_MONTHS && f.ceo >= 0) {
        const old = s.people[f.ceo];
        const ev = E.emit('firm.ceoFired', `${personName(old)} removed as chief executive after ${f.badMonths} losing months`, [f.priceEv ?? s.macroEv], f.id);
        const keepFamily = f.family; f.family = false; // the founding family loses the seat
        succession(w, s, f, old, 'was removed', ev); f.family = keepFamily && false;
        old.lastEv = ev; leaveJob(s, old);
      }
      f.layoffEv = undefined;
      f.mRev = 0; f.mCost = 0; f.mStockDays = 0; f.mPrice0 = f.price; f.mUnitCost0 = f.unitCost;
      f.stockoutEv = undefined; f.inputShortEv = undefined;
    }

    s.profitTaxDaily = profitTax / 30;

    // Government coupon, bank deposit interest, bank dividends.
    govPay(w, BANK, (L.issued.get(BOND) ?? 0) * s.policyRate / 12, 'gov.coupon', s.rateEv);
    if (depRate > 0) for (const p of s.people) { if (!p.alive) continue; const i = Math.round(cash(w, p.id) * depRate / 12); if (i > 0) { pay(w, BANK, p.id, i, 'deposit.interest', s.rateEv); p.incWeek += i; } }
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
      defaults: s.defaults,
      people: s.people.reduce((t, p) => t + (p.alive ? 1 : 0), 0),
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
    if (a > 0 && pay(w, issuer, h, a, 'dividends', cause) && h.startsWith('p_')) s.people[+h.slice(2)].incEma += a / 30 / 4;
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
