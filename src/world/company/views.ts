/**
 * The two company views (spec v1.7 §10, §11, CB-099, CB-102). `CompanyPublic` is what any screen may show: only what a
 * real company files or signals. `CompanyFounderView` adds the private state and is for the founder alone; the lint
 * rule that keeps it inside the Company app is a C-stage item.
 */

import { COMPANY, type CompanyRole, type CompanySector, type CompanyTierId } from '@/content/company';
import { gaFactor, materialPerUnit, plantCost, productiveHeads } from './economics';
import { headcountBand } from './signals';
import { projectBand, qualityScore } from './rd';
import { totalHeads } from './staff';
import type { Company, CompanyWorld, FilingPublic, WeeklySignal } from './types';

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
  debt: { totalBand: string; rating: 'NR'; covenant: 'ok' };
  cashDebt?: { cash: number; totalDebt: number; filedDay: number };
  /** Late and listed companies: their quarterly filings. Seed and Growth: nothing quarterly (the registry below). */
  filings: FilingPublic[];
  /** Seed and Growth: the banded registry (no statement is public) */
  registry?: { tier: CompanyTierId; headcountBand: string; revenueBand: [number, number] };
  /** listed only, the last 13 */
  signals: WeeklySignal[];
  credibility: number;
  insiderTrades: never[];
  distressFlag: boolean;
  buybackPrograms: never[];
  plans: never[];
  planSkips: never[];
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

/** The public view (§10): built from the filed and signalled fields only (the no-leak rule, §6.4). */
export function publicCompanyView(c: Company): CompanyPublic {
  const last = c.filings[c.filings.length - 1];
  const late = c.tier === 'late' || c.listed !== null;
  const annual = c.closed.slice(-4).reduce((sum, x) => sum + x.revenue, 0);
  const pub: CompanyPublic = {
    id: c.id,
    name: c.name,
    sector: c.sector,
    foundedDay: c.foundedDay,
    tier: c.tier,
    cities: [c.cityId],
    products: c.products.map((p) => ({ name: p.name, segment: 'mid', price: p.price })),
    headcountBand: headcountBand(totalHeads(c)),
    debt: { totalBand: '0', rating: 'NR', covenant: 'ok' },
    filings: late ? c.filings.slice(-13) : [],
    signals: c.listed ? c.signals.slice(-COMPANY.signals.keep) : [],
    credibility: COMPANY.valuation.cInit,
    insiderTrades: [],
    distressFlag: c.distress,
    buybackPrograms: [],
    plans: [],
    planSkips: [],
  };
  if (c.listed) {
    pub.listed = { assetId: c.listed.assetId, ipoDay: c.listed.ipoDay, sharesOut: c.listed.sharesOut, floatShares: c.listed.floatShares };
  }
  if (last) pub.cashDebt = { cash: last.balance.cash, totalDebt: last.balance.debt, filedDay: last.filedDay };
  if (!late) {
    const lo = annual * 0.9;
    const hi = annual * 1.1;
    pub.registry = { tier: c.tier, headcountBand: headcountBand(totalHeads(c)), revenueBand: [lo, hi] };
  }
  return pub;
}

/** The founder's private view (§10, CB-102). Only the founder of `companyId` may read it. */
export function founderCompanyView(w: CompanyWorld, playerId: string, companyId: string, day: number): CompanyFounderView {
  const c = w.companies[companyId];
  if (!c) throw new Error(`unknown company ${companyId}`);
  if (c.ownerId !== playerId) throw new Error('not the founder of this company');
  const base = publicCompanyView(c);
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
  const elapsed = Math.max(1, day - q.startDay);
  const revPerDay = q.revenue / elapsed;
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
      unitCost: materialPerUnit(c.sector) * (1 - c.eff) + 0,
      share: shareByProduct.get(p.id) ?? 0,
      marketing: p.marketing,
      generation: p.generation,
      brand: p.brand,
    })),
    projects: c.projects.map((p) => {
      const prod = c.products.find((x) => x.id === p.productId);
      const band = prod ? projectBand(c.sector, prod, p.spend, revPerDay) : null;
      return {
        id: p.id,
        kind: p.kind,
        spend: p.spend,
        endDay: p.endDay,
        pBand: band ? [band.pLow, band.pHigh] as [number, number] : [p.pShown, p.pShown] as [number, number],
        dqBand: band ? [band.dqBear, band.dqBase, band.dqBull] as [number, number, number] : [0, 0, 0] as [number, number, number],
      };
    }),
    capTable: Object.entries(c.capTable).map(([holder, shares]) => ({ holder, shares })),
    ledgerToday: c.ledger.filter((l) => l.day === day - 1 || l.day === day).map((l) => ({ reason: l.reason, amount: l.amount, day: l.day })),
    loans: [],
    relatedParty: [],
    plansPrivate: [],
  };
}
