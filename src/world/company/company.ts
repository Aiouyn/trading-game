import { COMPANY, INVESTOR_KINDS, SECTORS, type CompanyRole, type CompanySector, type CompanyTierId } from '@/content/company';
import { rankIndex } from '@/content/lifestyle';
import { Rng, seedStream, type RngState } from '@/engine';
import { cancelRateOf, openBook, publishSignal } from './signals';
import { buildStatements, filingOf, quarterTax, reversal, statementsHash, tierFor } from './filings';
import { imitateDaily, demandPerDay, npcQuarterly, npcWeeklyReaction, seedNpcs, shares as marketShares } from './market';
import { capacityPerDay, depreciationPerDay, materialUnitCost, overtimePerUnit, plantCost, shipCeiling } from './economics';
import { completeProject, frontierStep, startProject } from './rd';
import { ROLES, emptyStaff, fireHeads, headcountCap, landHires, queueHire, totalHeads, wagesPerDay, pendingHeads } from './staff';
import { vEngine, lnPerShare, type ValuationInputs } from './valuation';
import { filedInputs } from './signals';
import type { CompanyReject, CompanyWorld, Company, InvestorPool, Order, Product, ProjectKind, Resolved, Statements } from './types';
export type CompanyAction =
  | { kind: 'hire'; role: CompanyRole; n: number }
  | { kind: 'fire'; role: CompanyRole; n: number }
  | { kind: 'setPrice'; productId: string; price: number }
  | { kind: 'setMarketing'; productId: string; amount: number }
  | { kind: 'startProject'; projectKind: ProjectKind; productId: string; spend: number }
  | { kind: 'buildPlant' }
  | { kind: 'launchProduct'; name: string; price: number }
  | { kind: 'raiseRound'; amount: number };

/** What the core needs from the world: the seed, the day, the market's regime, oil, the founder's rank and cash. */
export interface CompanyEnv {
  seed: string;
  day: number;
  regime: string;
  /** ln P_OIL (absolute); the input index uses its move since founding */
  oilLog: number;
  rankOf(playerId: string): string;
  money: {
    cash(playerId: string): number;
    /** moves cash out of a player's account into a company (a transfer, not a sink) */
    take(playerId: string, amount: number): void;
  };
}

export type Outcome<T> = { ok: true; value: T } | { ok: false; reject: CompanyReject };

export type CompanyEvent =
  | { kind: 'filed'; companyId: string; quarter: number; day: number }
  | { kind: 'signal'; companyId: string; day: number; dLnV: number; backlogLift: number }
  | { kind: 'reanchor'; companyId: string; day: number; dLnV: number }
  | { kind: 'closed'; companyId: string; quarter: number; day: number }
  | { kind: 'tier'; companyId: string; tier: CompanyTierId; day: number }
  | { kind: 'goal'; companyId: string; goal: string; day: number }
  | { kind: 'distress'; companyId: string; day: number }
  | { kind: 'backlogRepay'; companyId: string; day: number; excessLift: number; repayment: number };

const QTD_ZERO = {
  revenue: 0, cogs: 0, opex: 0, da: 0, ocf: 0, capex: 0, units: 0, matCogs: 0, overtime: 0, rdSpend: 0, marketing: 0,
} as const;

function emptyQtd(startDay: number): Company['qtd'] {
  return { startDay, ...QTD_ZERO };
}

function rngOf(seed: string, key: string): RngState {
  return seedStream(seed, key);
}

/** A fresh company world: the NPC investor pools and the sector shock streams (G22 unit reading), at level 0. */
export function emptyCompanyWorld(seed: string): CompanyWorld {
  const sectors = {} as CompanyWorld['sectors'];
  for (const s of Object.keys(SECTORS) as CompanySector[]) sectors[s] = { level: 0, rng: rngOf(seed, `co:sector:${s}`) };
  const investors: Record<string, InvestorPool> = {};
  for (const kind of INVESTOR_KINDS) {
    const id = `npc:${kind}`;
    investors[id] = { id, kind, cash: COMPANY.rounds.investorCash[kind] };
  }
  return { companies: {}, seq: 0, investors, sectors, flows: { faucet: 0, sink: 0 }, founded: 0 };
}

/** Cash in or out of a company's own books. `transfer` moves money between real parties and is not a faucet or sink. */
function post(w: CompanyWorld, c: Company, day: number, reason: string, amount: number, transfer = false): void {
  if (amount === 0) return;
  c.cash += amount;
  if (!transfer) {
    if (amount > 0) w.flows.faucet += amount;
    else w.flows.sink += -amount;
  }
  c.ledger.push({ day, reason, amount });
  if (c.ledger.length > 200) c.ledger.splice(0, c.ledger.length - 200);
  c.ledgerTotals[reason] = (c.ledgerTotals[reason] ?? 0) + amount;
}

/** Whether the company is listed: signals and the listing-only caps apply (the listing is an A2/B step). */
function isListed(c: Company): boolean {
  return c.listed !== null;
}

/** Found a company (C4 founder template): R2 owner, at least $100k of founder equity, one product, 10 heads. */
export function foundCompany(
  w: CompanyWorld, env: CompanyEnv, playerId: string,
  args: { name: string; sector: CompanySector; cityId: string; capital: number },
): Outcome<{ id: string }> {
  const F = COMPANY.founding;
  if (rankIndex(env.rankOf(playerId)) < rankIndex(F.minRank)) return { ok: false, reject: { code: 'notRank', minRank: F.minRank } };
  if (!(args.capital >= F.minEquity)) return { ok: false, reject: { code: 'capitalTooLow', minCapital: F.minEquity } };
  if (!SECTORS[args.sector]) return { ok: false, reject: { code: 'unknownAction' } };
  for (const c of Object.values(w.companies)) if (c.ownerId === playerId) return { ok: false, reject: { code: 'alreadyFounded' } };
  const cash = env.money.cash(playerId);
  if (cash < args.capital) return { ok: false, reject: { code: 'insufficientFunds', shortfall: args.capital - cash } };

  w.seq++;
  const id = `co${w.seq}`;
  const staff = {} as Company['staff'];
  for (const r of ROLES) staff[r] = emptyStaff();
  for (const r of ROLES) staff[r].total = F.heads[r];
  const productId = `${id}:p0`;
  const c: Company = {
    id, name: args.name.slice(0, 40), ownerId: playerId, sector: args.sector, cityId: args.cityId, foundedDay: env.day,
    tier: 'seed', cash: args.capital, paidIn: args.capital, retained: 0, lossCarry: 0,
    shares: F.founderShares, capTable: { [`founder:${playerId}`]: F.founderShares },
    staff, hires: [], plantLevel: 0, plantBuildUntil: null, plantCapex: 0, ppe: 0,
    products: [{ id: productId, name: F.productName, q: 1, generation: 1, k: 0, price: F.productPrice, marketing: 0, brand: 0, patents: [], lastShare: 0 }],
    eff: 0, projects: [], projSeq: 0, frontierLn: 0, npcs: [], npcSeq: 0,
    sectorBase: w.sectors[args.sector].level, oilBase: env.oilLog, d0: COMPANY.demand.d0BySector[args.sector],
    orders: [], orderSeq: 0, resolved: [], ar: 0, inv: 0, ap: 0,
    qtd: emptyQtd(env.day), closed: [], filings: [], pendingFile: null, filingCount: 0,
    signals: [], noise: null, consensus: null, cbFiled: 0, lastUtil: 0, headsAtSignal: F.heads.ops + F.heads.sales + F.heads.rd + F.heads.ga,
    signalSeq: 0, lastSens: 0, lastFair: 0, sigLog: [], revenueTotal: 0, listed: null,
    rng: { rd: rngOf(env.seed, `co:${id}:rd`), sig: rngOf(env.seed, `co:${id}:sig`), npc: rngOf(env.seed, `co:npc:${id}`) },
    goalsDone: {}, distress: false, ledger: [], ledgerTotals: {},
  };
  const npcRng = new Rng(c.rng.npc);
  const count = COMPANY.npc.minCount + Math.floor(npcRng.uniform() * (COMPANY.npc.maxCount - COMPANY.npc.minCount + 1));
  seedNpcs(c, count, npcRng);
  c.rng.npc = npcRng.state();

  env.money.take(playerId, args.capital);
  w.companies[id] = c;
  w.founded += args.capital;
  return { ok: true, value: { id } };
}

/** The revenue per gd of the current quarter so far, the basis of S_ref and the run rate. */
export function revenuePerDay(c: Company, day: number): number {
  const elapsed = Math.max(1, day - c.qtd.startDay);
  return c.qtd.revenue / elapsed;
}

function activeRd(c: Company, day: number): number {
  return c.projects.filter((p) => p.startDay <= day && day < p.endDay).length;
}

/** The player's actions on a company they founded. Refusals are structured, never thrown. */
export function companyAction(
  w: CompanyWorld, env: CompanyEnv, playerId: string, companyId: string, action: CompanyAction,
): Outcome<Record<string, unknown>> {
  const c = w.companies[companyId];
  if (!c) return { ok: false, reject: { code: 'unknownCompany' } };
  if (c.ownerId !== playerId) return { ok: false, reject: { code: 'notFounder' } };
  const day = env.day;
  const cap = isListed(c) ? Infinity : headcountCap(c.tier);
  switch (action.kind) {
    case 'hire': {
      const r = queueHire(c, action.role, action.n, day, cap);
      return r ? { ok: false, reject: r } : { ok: true, value: { pending: pendingHeads(c) } };
    }
    case 'fire': {
      const r = fireHeads(c, action.role, action.n, day);
      if ('code' in r) return { ok: false, reject: r };
      post(w, c, day, 'severance', -r.severance);
      return { ok: true, value: { severance: r.severance } };
    }
    case 'setPrice': {
      const p = c.products.find((x) => x.id === action.productId);
      if (!p) return { ok: false, reject: { code: 'unknownProduct' } };
      const min = COMPANY.demand.priceRef * (1 - COMPANY.demand.priceBand);
      const max = COMPANY.demand.priceRef * (1 + COMPANY.demand.priceBand);
      if (!(action.price >= min && action.price <= max)) return { ok: false, reject: { code: 'priceOutOfBand', min, max } };
      p.price = action.price;
      return { ok: true, value: { price: p.price } };
    }
    case 'setMarketing': {
      const p = c.products.find((x) => x.id === action.productId);
      if (!p) return { ok: false, reject: { code: 'unknownProduct' } };
      if (!(action.amount >= 0)) return { ok: false, reject: { code: 'negativeAmount' } };
      p.marketing = action.amount;
      return { ok: true, value: { marketing: p.marketing } };
    }
    case 'startProject': {
      const p = c.products.find((x) => x.id === action.productId);
      if (!p) return { ok: false, reject: { code: 'unknownProduct' } };
      if (!(action.spend > 0)) return { ok: false, reject: { code: 'negativeAmount' } };
      const rd = c.staff.rd;
      const productiveRd = Math.max(0, rd.total - rd.ramping.filter((r) => r.readyDay > day).reduce((s, r) => s + r.n, 0));
      if (productiveRd <= 0) return { ok: false, reject: { code: 'noRdStaff' } };
      if (activeRd(c, day) >= COMPANY.rdProjectsAtOnce) return { ok: false, reject: { code: 'projectBusy' } };
      if (c.cash < action.spend) return { ok: false, reject: { code: 'insufficientFunds', shortfall: action.spend - c.cash } };
      const r = new Rng(c.rng.rd);
      const project = startProject(c, r, action.projectKind, p, action.spend, day, revenuePerDay(c, day), productiveRd);
      c.rng.rd = r.state();
      c.projects.push(project);
      return { ok: true, value: { projectId: project.id, endDay: project.endDay, pShown: project.pShown } };
    }
    case 'buildPlant': {
      if (c.plantBuildUntil !== null) return { ok: false, reject: { code: 'plantBuilding', untilDay: c.plantBuildUntil } };
      const cost = plantCost(c.plantLevel);
      if (c.cash < cost) return { ok: false, reject: { code: 'insufficientFunds', shortfall: cost - c.cash } };
      post(w, c, day, 'plant', -cost);
      c.plantCapex += cost;
      c.ppe += cost;
      c.qtd.capex += cost;
      c.plantBuildUntil = day + COMPANY.plant.buildDays;
      return { ok: true, value: { cost, readyDay: c.plantBuildUntil } };
    }
    case 'launchProduct': {
      if (c.products.length >= COMPANY.productCap[c.tier]) return { ok: false, reject: { code: 'productCap', cap: COMPANY.productCap[c.tier] } };
      const min = COMPANY.demand.priceRef * (1 - COMPANY.demand.priceBand);
      const max = COMPANY.demand.priceRef * (1 + COMPANY.demand.priceBand);
      if (!(action.price >= min && action.price <= max)) return { ok: false, reject: { code: 'priceOutOfBand', min, max } };
      const id = `${c.id}:p${c.products.length}`;
      const product: Product = {
        id, name: action.name.slice(0, 40), q: Math.exp(c.frontierLn), generation: 1, k: 0, price: action.price,
        marketing: 0, brand: 0, patents: [], lastShare: 0,
      };
      c.products.push(product);
      return { ok: true, value: { productId: id } };
    }
    case 'raiseRound': return raiseRound(w, c, env, action.amount);
  }
  return { ok: false, reject: { code: 'unknownAction' } };
}

/**
 * The private valuation of a company that is not yet filed: the filed value when there are filings, and otherwise the
 * annualized run rate of the quarter so far (the run-rate basis of a private mark, §5).
 */
export function privateValue(c: Company, day: number): number {
  if (c.filings.length > 0) return vEngine(filedInputs(c, 0));
  const elapsed = Math.max(1, day - c.qtd.startDay);
  const k = COMPANY.yearDays / elapsed;
  const x: ValuationInputs = {
    revU: c.qtd.revenue * k,
    eStar: 0,
    growth: 0,
    credibility: COMPANY.valuation.cInit,
    netDebt: -c.cash,
    dCB: 0,
    margin: SECTORS[c.sector].grossMargin,
  };
  return vEngine(x);
}

/**
 * A private round (§5, X12, N9): NPC investors only, at 0.70 * V_engine per share, at most 25% of post-money. The pool
 * is chosen by tier (seed round for Seed, series round for Growth and Late); the investor's cash moves to the company.
 */
function raiseRound(w: CompanyWorld, c: Company, env: CompanyEnv, amount: number): Outcome<Record<string, unknown>> {
  if (!(amount > 0)) return { ok: false, reject: { code: 'negativeAmount' } };
  const poolId = c.tier === 'seed' ? 'npc:seed' : 'npc:series';
  const pool = w.investors[poolId]!;
  const v = privateValue(c, env.day);
  if (!(v > 0)) return { ok: false, reject: { code: 'noValuation' } };
  const price = (COMPANY.rounds.priceFactor * v) / c.shares;
  const n = amount / price;
  const share = n / (c.shares + n);
  if (share > COMPANY.rounds.maxPostMoneyShare) {
    const maxN = (COMPANY.rounds.maxPostMoneyShare / (1 - COMPANY.rounds.maxPostMoneyShare)) * c.shares;
    return { ok: false, reject: { code: 'roundDilutionCap', maxAmount: maxN * price } };
  }
  if (pool.cash < amount) return { ok: false, reject: { code: 'investorCash', available: pool.cash } };
  pool.cash -= amount;
  post(w, c, env.day, 'round', amount, true);
  c.paidIn += amount;
  c.shares += n;
  c.capTable[poolId] = (c.capTable[poolId] ?? 0) + n;
  if (!c.goalsDone.firstRound) c.goalsDone.firstRound = env.day;
  return { ok: true, value: { shares: n, price, postMoneyShare: share } };
}

/** The daily operations of one company for game day `day` (after the day's ops, costs and cash are booked). */
function operateDay(w: CompanyWorld, c: Company, env: CompanyEnv, day: number): void {
  // 1. staff and plant: hires land, a finished plant level comes on line
  landHires(c, day);
  if (c.plantBuildUntil !== null && day >= c.plantBuildUntil) {
    c.plantLevel += 1;
    c.plantBuildUntil = null;
  }
  // 2. the frontier moves and NPCs imitate the leader (the patents pause it)
  frontierStep(c);
  imitateDaily(c, day);

  // 3. demand and capacity
  const oilMove = env.oilLog - c.oilBase;
  const matUnit = materialUnitCost(c, oilMove);
  const cap = capacityPerDay(c, day);
  const ceiling = shipCeiling(cap);
  const sectorLevel = w.sectors[c.sector].level;
  const demand = demandPerDay(c, sectorLevel, env.regime);
  const sh = marketShares(c, day);
  let maxShare = 0;
  for (const p of c.products) {
    p.lastShare = sh.products[p.id] ?? 0;
    maxShare = Math.max(maxShare, p.lastShare);
  }

  // 4. booking within capacity (G15): FIFO behind the open book, through the 63-gd ship-by day at 115% of capacity
  const open = openBook(c.orders);
  let bookLimit = ceiling * COMPANY.quarterDays - open.units;
  const overflow: Record<string, number> = {};
  const util = c.lastUtil;
  for (const p of c.products) {
    const want = Math.floor(demand * (sh.products[p.id] ?? 0));
    const booked = Math.max(0, Math.min(want, bookLimit));
    bookLimit -= booked;
    overflow[p.id] = want - booked;
    if (booked > 0) {
      const overtime = util > 1 ? overtimePerUnit() : 0;
      const o: Order = {
        id: `${c.id}:o${c.orderSeq++}`, productId: p.id, qty: booked,
        npcCut: Math.floor(cancelRateOf(c) * booked), price: p.price, vc: matUnit + overtime,
        bookedDay: day, shipBy: day + COMPANY.quarterDays, shipped: 0, reportedSig: -1, lift: 0,
      };
      c.orders.push(o);
    }
  }

  // 5. shipping FIFO, up to the 115% ceiling; overtime above capacity
  let capLeft = ceiling;
  let shippedUnits = 0;
  let revenue = 0;
  for (const o of c.orders) {
    const rem = o.qty - o.npcCut - o.shipped;
    if (rem <= 0 || capLeft <= 0) continue;
    const take = Math.min(rem, capLeft);
    o.shipped += take;
    shippedUnits += take;
    revenue += take * o.price;
    capLeft -= take;
  }
  const overtimeUnits = Math.max(0, shippedUnits - cap);
  const overtimeCost = overtimeUnits * overtimePerUnit();
  const matCost = shippedUnits * matUnit;
  c.lastUtil = cap > 0 ? shippedUnits / cap : 0;

  // 6. resolution: a fully shipped order, or one past its ship-by day (the rest is company non-conversion)
  const keep: Order[] = [];
  for (const o of c.orders) {
    const effective = o.qty - o.npcCut;
    if (o.shipped >= effective || day >= o.shipBy) {
      const cs = cancelRateOf(c);
      c.resolved.push({ qty: o.qty, shipped: o.shipped, cs, lift: o.reportedSig >= 0 ? o.lift : 0, reportedSig: o.reportedSig } satisfies Resolved);
    } else keep.push(o);
  }
  c.orders = keep;
  if (c.resolved.length > 200) c.resolved.splice(0, c.resolved.length - 200);

  // 7. brand: a stockout day costs 0.02, and the brand recovers at 0.01 per gd (§4)
  for (const p of c.products) {
    p.brand = (overflow[p.id] ?? 0) > 0
      ? p.brand - COMPANY.demand.brandStockout
      : Math.min(0, p.brand + COMPANY.demand.brandRecover);
  }

  // 8. costs and cash: working capital from the day's sales and materials (DSO, DIO, DPO)
  const wages = wagesPerDay(c);
  const wagesAll = wages.ops + wages.sales + wages.rd + wages.ga;
  let rdSpend = 0;
  for (const p of c.projects) if (p.startDay <= day && day < p.endDay) rdSpend += p.spendPerDay;
  let marketing = 0;
  for (const p of c.products) marketing += p.marketing;
  const arNew = COMPANY.dso * revenue;
  const invNew = COMPANY.dio * matCost;
  const apNew = COMPANY.dpo * matCost;
  const dAR = arNew - c.ar;
  const dInv = invNew - c.inv;
  const dAP = apNew - c.ap;
  c.ar = arNew;
  c.inv = invNew;
  c.ap = apNew;
  const flows = {
    sales: revenue - dAR,
    materials: -(matCost + dInv - dAP),
    payroll: -wagesAll,
    overtime: -overtimeCost,
    marketing: -marketing,
    rd: -rdSpend,
  };
  let ocf = 0;
  for (const [reason, amount] of Object.entries(flows)) {
    post(w, c, day, reason, amount);
    ocf += amount;
  }
  const dep = Math.min(c.ppe, depreciationPerDay(c.plantCapex));
  c.ppe -= dep;

  // 9. the quarter's accumulators
  const q = c.qtd;
  q.revenue += revenue;
  q.cogs += matCost + wages.ops + overtimeCost;
  q.opex += wages.sales + wages.rd + wages.ga + marketing + rdSpend;
  q.da += dep;
  q.ocf += ocf;
  q.units += shippedUnits;
  q.overtime += overtimeCost;
  q.rdSpend += rdSpend;
  q.marketing += marketing;
  q.matCogs += matCost;
  c.revenueTotal += revenue;

  // 10. projects that finish on the day's end start to count from the next day
  for (const p of c.projects.slice()) {
    if (day + 1 < p.endDay) continue;
    completeProject(c, p, day, revenuePerDay(c, day));
    c.projects = c.projects.filter((x) => x.id !== p.id);
  }
}

/** The quarter close (§6.1): tax is paid, the statements are frozen and hashed, and the filing is set for close + 3. */
function closeQuarter(w: CompanyWorld, c: Company, closeDay: number, events: CompanyEvent[]): void {
  const quarter = closeDay / COMPANY.quarterDays;
  const ebit = c.qtd.revenue - c.qtd.cogs - c.qtd.opex - c.qtd.da;
  const t = quarterTax(ebit, c.lossCarry);
  post(w, c, closeDay, 'tax', -t.tax);
  c.qtd.ocf -= t.tax;
  c.lossCarry = t.lossCarry;
  const statements: Statements = buildStatements(c, closeDay, quarter, t.tax, c.qtd.ocf);
  c.retained += statements.netIncome;
  c.closed.push(statements);
  if (c.closed.length > 16) c.closed.splice(0, c.closed.length - 16);
  c.pendingFile = { statements, hash: statementsHash(statements), filingDay: closeDay + COMPANY.filingLagDays };
  c.qtd = emptyQtd(closeDay);
  events.push({ kind: 'closed', companyId: c.id, quarter, day: closeDay });
  if (c.cash < 0 && !c.distress) {
    c.distress = true;
    events.push({ kind: 'distress', companyId: c.id, day: closeDay });
  } else if (c.cash >= 0) c.distress = false;
}

/** The filing (§6.1, CB-075): publish the frozen statements, check their hash, re-anchor lnV, and settle the reversal. */
function fileQuarter(c: Company, day: number, events: CompanyEvent[]): void {
  const pf = c.pendingFile;
  if (!pf) return;
  if (statementsHash(pf.statements) !== pf.hash) throw new Error(`filing hash mismatch for ${c.id}`);
  const fairBySig: Record<number, number> = {};
  const sharesBySig: Record<number, number> = {};
  for (const rec of c.sigLog) {
    fairBySig[rec.idx] = rec.fair;
    sharesBySig[rec.idx] = 0; // S_k: the trading side (A4/B) supplies the shares counted in each interval
  }
  const rev = reversal(c.resolved, fairBySig, sharesBySig);
  const line = { nonConversion: rev.nonConversion, baseRate: rev.baseRate, excessLift: rev.excessLift, repayment: rev.repayment };
  c.filings.push(filingOf(pf.statements, pf.hash, day, line, pf.statements.heads));
  if (c.filings.length > 16) c.filings.splice(0, c.filings.length - 16);
  c.filingCount++;
  const prevCB = c.cbFiled;
  c.cbFiled = pf.statements.backlogContribution;
  c.resolved = [];
  c.pendingFile = null;
  const x = filedInputs(c, c.cbFiled - prevCB);
  const v = vEngine(x);
  const lnFiled = lnPerShare(v, c.shares);
  const prevLn = c.consensus ? c.consensus.lnV : lnFiled;
  c.consensus = {
    revQtd: 0, backlog: pf.statements.backlog, backlogContribution: pf.statements.backlogContribution, v, lnV: lnFiled,
  };
  events.push({ kind: 'filed', companyId: c.id, quarter: pf.statements.quarter, day });
  events.push({ kind: 'reanchor', companyId: c.id, day, dLnV: lnFiled - prevLn });
  if (rev.repayment > 0) events.push({ kind: 'backlogRepay', companyId: c.id, day, excessLift: rev.excessLift, repayment: rev.repayment });
}

/** The day's weekly signal for a listed company, at the open tick (section 6.2). */
function signalDay(c: Company, day: number, events: CompanyEvent[]): void {
  if (!isListed(c)) return;
  const elapsed = Math.max(1, day - c.qtd.startDay);
  const open = openBook(c.orders);
  const priceAvg = c.products.reduce((sum, p) => sum + p.price, 0) / Math.max(1, c.products.length);
  const rng = new Rng(c.rng.sig);
  const { signal, dLnV } = publishSignal({
    c, day, rng, shares: c.shares,
    revQtd: c.qtd.revenue,
    revPerWeek: (c.qtd.revenue / elapsed) * COMPANY.weekDays,
    backlog: open.backlog,
    backlogContribution: open.contribution,
    utilization: c.lastUtil,
    elapsed,
    priceAvg,
  });
  c.rng.sig = rng.state();
  events.push({ kind: 'signal', companyId: c.id, day, dLnV, backlogLift: signal.backlogLift });
}

/** The goals of the founder template (C4): first hire, first revenue, break-even, first private round. */
function checkGoals(c: Company, day: number, events: CompanyEvent[]): void {
  const g = COMPANY.goals;
  const grant = (id: string, ok: boolean) => {
    if (ok && c.goalsDone[id] === undefined) {
      c.goalsDone[id] = day;
      events.push({ kind: 'goal', companyId: c.id, goal: id, day });
    }
  };
  grant('firstHire', totalHeads(c) > COMPANY.founding.heads.ops + COMPANY.founding.heads.sales + COMPANY.founding.heads.rd + COMPANY.founding.heads.ga);
  grant('firstRevenue', c.revenueTotal >= g.firstRevenue);
  const last = c.closed[c.closed.length - 1];
  grant('breakEven', !!last && last.ebitda >= 0);
  grant('firstRound', c.goalsDone.firstRound !== undefined);
}

/**
 * The day-boundary step of the company world (called once per game day, at the open). Order (G19): the filing of the
 * day runs first, then the day's operations, then the quarter close and the signal, then the NPC weekly reaction and
 * the quarterly entry and exit, then the goals. Sector shocks are drawn first, once per day per sector.
 */
export function companyTick(w: CompanyWorld, env: CompanyEnv, day: number): CompanyEvent[] {
  const events: CompanyEvent[] = [];
  for (const s of Object.keys(w.sectors) as CompanySector[]) {
    const sec = w.sectors[s];
    const r = new Rng(sec.rng);
    sec.level += COMPANY.demand.sectorShockScale * r.normal();
    sec.rng = r.state();
  }
  const ids = Object.keys(w.companies).sort();
  for (const id of ids) {
    const c = w.companies[id]!;
    if (day > 0 && c.pendingFile && day === c.pendingFile.filingDay) fileQuarter(c, day, events);
    if (day - 1 >= c.foundedDay) operateDay(w, c, env, day - 1);
    if (day > 0 && day % COMPANY.quarterDays === 0 && day - 1 >= c.foundedDay) closeQuarter(w, c, day, events);
    if (day % COMPANY.weekDays === 0 || day % COMPANY.quarterDays === 0) {
      if (day - 1 >= c.foundedDay) signalDay(c, day, events);
    }
    if (day % COMPANY.weekDays === 0) {
      const maxShare = Math.max(0, ...c.products.map((p) => p.lastShare));
      npcWeeklyReaction(c, maxShare);
    }
    if (day > 0 && day % COMPANY.quarterDays === 0) {
      const r = new Rng(c.rng.npc);
      npcQuarterly(c, r, day);
      c.rng.npc = r.state();
      const tier = tierFor(c.closed);
      if (tier !== c.tier) {
        c.tier = tier;
        events.push({ kind: 'tier', companyId: c.id, tier, day });
      }
    }
    checkGoals(c, day, events);
  }
  return events;
}
