/**
 * The two company views (spec v1.7 §10, §11, CB-099, CB-102). `CompanyPublic` is what any screen may show: only what a
 * real company files or signals. `CompanyFounderView` adds the private state and is for the founder alone; the lint
 * rule that keeps it inside the Company app is a C-stage item.
 */

import { COMPANY, type CompanyRole, type CompanySector, type CompanyTierId } from '@/content/company';
import { gaFactor, plantCost, productiveHeads, unitCostToday } from './economics';
import { headcountBand, ttmFiled } from './signals';
import { projectBand, qualityScore } from './rd';
import type { Company, CompanyWorld, CovenantStatus, FilingPublic, WeeklySignal } from './types';
import { debtBand, totalDebt } from './debt';
import { loanBook } from './contracts';
import { windowAt } from './insiders';

export interface CompanyPublic {
  id: string;
  name: string;
  sector: CompanySector;
  foundedDay: number;
  tier: CompanyTierId;
  listed?: { assetId: string; ipoDay: number; sharesOut: number; floatShares: number };
  cities: string[];
  products: { name: string; segment: 'mid'; price: number }[];
  headcountBand: string;
  debt: { totalBand: string; rating: 'NR'; covenant: CovenantStatus };
  cashDebt?: { cash: number; totalDebt: number; filedDay: number };
  /** Late and listed companies: their quarterly filings. Seed and Growth: nothing quarterly (the registry below). */
  filings: FilingPublic[];
  /** Seed and Growth: the banded registry, which moves only at a filing (no statement is public) */
  registry?: { tier: CompanyTierId; headcountBand: string; revenueBand: [number, number] | null };
  /** listed only, the last 13 */
  signals: WeeklySignal[];
  credibility: number;
  /** B1: the founder's trades, filed the next day (filedDay is the day it became public; only filed ones appear) */
  insiderTrades: { day: number; filedDay: number; side: 'buy' | 'sell'; qty: number; instrument: 'stock' }[];
  distressFlag: boolean;
  /** B1: the buyback programs (filed on F + 1): size and days only */
  buybackPrograms: { size: number; fromDay: number; toDay: number }[];
  /** B1: "a plan exists" with its start and end days; the minimum price, the size and the day list never leave the engine */
  plans: { fromDay: number; toDay: number; ended?: { day: number; reason: string } }[];
  /** B1: the plan skips, by day and reason only */
  planSkips: { day: number; reason: string }[];
  /** B1: the trading window of a listed company (absent for a private one): open, its schedule and the covered instrument */
  window?: { open: boolean; opensDay?: number; closesDay?: number; covered: string[] };
}

export interface CompanyFounderView extends CompanyPublic {
  cash: number;
  quarterToDate: { revenue: number; cogs: number; opex: number; units: number };
  staff: Record<CompanyRole, { heads: number; productive: number; wagePerDay: number }>;
  plant: { level: number; multiplier: number; buildingUntil: number | null; cost: number };
  capacityPerDay: number;
  productsPrivate: {
    id: string; name: string; price: number; quality: number; qualityScore: number; unitCost: number; share: number;
    marketing: number; generation: number; brand: number;
  }[];
  projects: { id: string; kind: string; spend: number; endDay: number; pBand: [number, number]; dqBand: [number, number, number] }[];
  capTable: { holder: string; shares: number }[];
  ledgerToday: { reason: string; amount: number; day: number }[];
  loans: never[];
  relatedParty: never[];
  plansPrivate: never[];
}

/**
 * The public view (§10): built from the filed and signalled fields only (the no-leak rule, §6.4). Every field here moves
 * at a filing (the tier, the registry, the headcount band, the distress flag, the statements), at a signal (listed
 * companies), or at a price or product change that the market sees. Nothing reads the unfiled quarter or the live cash.
 */
export function publicCompanyView(c: Company, day: number): CompanyPublic {
  const last = c.filings[c.filings.length - 1];
  const late = c.tier === 'late' || c.listed !== null;
  const pub: CompanyPublic = {
    id: c.id,
    name: c.name,
    sector: c.sector,
    foundedDay: c.foundedDay,
    tier: c.tier,
    cities: [c.cityId],
    products: c.products.map((p) => ({ name: p.name, segment: 'mid', price: p.price })),
    // until the first filing the band is the founding headcount's band (the founding seats are public)
    headcountBand: last ? last.headcountBand : headcountBand(FOUNDING_HEADS),
    debt: { totalBand: debtBand(totalDebt(c) + loanBook(c).debt), rating: 'NR', covenant: c.covenant.status },
    filings: late ? c.filings.slice(-13) : [],
    signals: c.listed ? c.signals.slice(-COMPANY.signals.keep) : [],
    credibility: COMPANY.valuation.cInit,
    insiderTrades: c.insiderTrades.filter((t) => t.filedDay <= day).map((t) => ({ day: t.day, filedDay: t.filedDay, side: t.side, qty: t.qty, instrument: t.instrument })),
    distressFlag: c.distressPublic || c.divDistress,
    buybackPrograms: c.buybacks.map((b) => ({ size: b.size, fromDay: b.fromDay, toDay: b.toDay })),
    plans: c.planRows.map((r) => ({ fromDay: r.fromDay, toDay: r.toDay, ...(r.ended ? { ended: { day: r.ended.day, reason: r.ended.reason } } : {}) })),
    planSkips: c.planSkips.map((s) => ({ day: s.day, reason: s.reason })),
  };
  if (c.listed) {
    const w = windowAt(c, day);
    pub.window = { open: w.open, ...(w.opensDay !== undefined ? { opensDay: w.opensDay } : {}), ...(w.closesDay !== undefined ? { closesDay: w.closesDay } : {}), covered: [c.listed.assetId] };
  }
  if (c.listed) {
    pub.listed = { assetId: c.listed.assetId, ipoDay: c.listed.ipoDay, sharesOut: c.listed.sharesOut, floatShares: c.listed.floatShares };
  }
  if (last) pub.cashDebt = { cash: last.balance.cash, totalDebt: last.balance.debt, filedDay: last.filedDay };
  if (!late) {
    // the band is a band of the filed TTM revenue: it is null until the first filing and moves only at a filing
    const filed = c.filings.length > 0 ? ttmFiled(c.filings, 4).rev : null;
    const revenueBand: [number, number] | null = filed === null ? null : [filed * 0.9, filed * 1.1];
    pub.registry = { tier: c.tier, headcountBand: pub.headcountBand, revenueBand };
  }
  return pub;
}

const FOUNDING_HEADS = COMPANY.founding.heads.ops + COMPANY.founding.heads.sales + COMPANY.founding.heads.rd + COMPANY.founding.heads.ga;

/** The founder's private view (§10, CB-102). Only the founder of `companyId` may read it. */
export function founderCompanyView(w: CompanyWorld, playerId: string, companyId: string, day: number): CompanyFounderView {
  const c = w.companies[companyId];
  if (!c) throw new Error(`unknown company ${companyId}`);
  if (c.ownerId !== playerId) throw new Error('not the founder of this company');
  const base = publicCompanyView(c, day);
  const staff = {} as CompanyFounderView['staff'];
  for (const r of ['ops', 'sales', 'rd', 'ga'] as CompanyRole[]) {
    staff[r] = {
      heads: c.staff[r].total,
      productive: productiveHeads(c.staff[r], day),
      wagePerDay: c.staff[r].total * COMPANY.wages[r],
    };
  }
  const shareByProduct = new Map(c.products.map((p) => [p.id, p.lastShare]));
  const frontier = Math.exp(c.frontierLn);
  const q = c.qtd;
  const unitCost = unitCostToday(c);
  return {
    ...base,
    cash: c.cash,
    quarterToDate: { revenue: q.revenue, cogs: q.cogs, opex: q.opex, units: q.units },
    staff,
    plant: {
      level: c.plantLevel,
      multiplier: 1 + COMPANY.plant.multPerLevel * c.plantLevel,
      buildingUntil: c.plantBuildUntil,
      cost: plantCost(c.plantLevel),
    },
    capacityPerDay: (productiveHeads(c.staff.ops, day) * COMPANY.unitsPerOpsHead) * (1 + COMPANY.plant.multPerLevel * c.plantLevel) * gaFactor(c.staff),
    productsPrivate: c.products.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      quality: p.q,
      qualityScore: qualityScore(p.q, frontier),
      unitCost,
      share: shareByProduct.get(p.id) ?? 0,
      marketing: p.marketing,
      generation: p.generation,
      brand: p.brand,
    })),
    projects: c.projects.map((p) => {
      // the band is read from the frozen S_ref and k of the project (the same ones the gain uses)
      const band = projectBand(c.sector, p.spend, p.sRef, p.kUsed);
      return {
        id: p.id,
        kind: p.kind,
        spend: p.spend,
        endDay: p.endDay,
        pBand: [band.pLow, band.pHigh] as [number, number],
        dqBand: [band.dqBear, band.dqBase, band.dqBull] as [number, number, number],
      };
    }),
    capTable: Object.entries(c.capTable).map(([holder, shares]) => ({ holder, shares })),
    ledgerToday: c.ledger.filter((l) => l.day === day - 1 || l.day === day).map((l) => ({ reason: l.reason, amount: l.amount, day: l.day })),
    loans: [],
    relatedParty: [],
    plansPrivate: [],
  };
}
