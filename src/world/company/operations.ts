/**
 * The operations half of the founder's view (Phase 4, the company app): the executives, the CEO notices, the franchise
 * licences, the supply deals, the founder goals, the public rivals and the limits the screens show. Private to the
 * founder, except the rivals' prices, the registry of other companies (name and sector) and the limits, which any screen
 * may show. `views.ts` spreads this object into the founder view.
 */

import { COMPANY, type CompanyRole, type CompanySector, type CompanyTierId } from '@/content/company';
import { gaFactor } from './economics';
import { severanceOf } from './governance';
import { decisionCard, type DecisionCard } from './preview';
import { headcountCap, wagesPerDay } from './staff';
import type { Company, CompanyWorld, ExecRole, ExecTrait, Holder } from './types';

/** The G&A span line (CB-035, §4): one G&A head supports `span` others; a missing one costs `gaPenalty` of every output. */
export interface GaSpanView {
  span: number;
  gaHeads: number;
  /** the other heads (ops, sales and R&D) the G&A team must cover */
  others: number;
  /** the G&A heads the span needs for those others */
  needed: number;
  /** the output factor of today (1 when the span is covered) */
  factor: number;
}

/** The limits the forms and the copy show. The engine enforces the same numbers (companyAction and the franchise rules). */
export interface CompanyLimits {
  priceMin: number;
  priceMax: number;
  marketingMax: number;
  productCap: number;
  /** null when the company is listed: the headcount cap is unbounded */
  headcountCap: number | null;
  rdProjectsAtOnce: number;
  qualityReady: number;
  franchiseRateMin: number;
  franchiseRateMax: number;
  franchiseCap: number;
  supplyBand: number;
}

export interface ExecutiveView {
  role: ExecRole;
  trait: ExecTrait;
  holder: Holder;
  salary: number;
  hiredDay: number;
  termEnd: number;
  /** the severance a firing pays (21 gd of salary); a firing before `termEnd` is refused */
  severance: number;
}

export interface OperationsView {
  /** the four executive seats; an unfilled seat is null */
  execs: Record<ExecRole, ExecutiveView | null>;
  ceoChange: { announcedDay: number; effectiveDay: number } | null;
  ceoFreeze: { untilDay: number } | null;
  exCeo: { untilDay: number } | null;
  guarantee: { amount: number } | null;
  licences: { id: string; rate: number; revenuePerDay: number; signedDay: number }[];
  supplyDeals: { id: string; sellerId: string; buyerId: string; unitsPerDay: number; price: number; related: boolean; signedDay: number }[];
  /** reached-day per founder goal id (the goal rewards are in COMPANY.goalRewards) */
  goalsDone: Record<string, number>;
  /** the NPC rivals' public prices (no share, no marketing, no quality) */
  rivals: { id: string; price: number }[];
  /** the other companies a supply deal can name: id, name and sector (public registration data) */
  suppliers: { id: string; name: string; sector: CompanySector }[];
  limits: CompanyLimits;
  /** the G&A span line of the People tab */
  gaSpan: GaSpanView;
  /** the decision card of the Overview (a quality project at three spend levels) and its runway chart; null without R&D effort */
  decision: DecisionCard | null;
  /** seated heads across the four roles */
  heads: number;
  /** the daily payroll (wages and executive salaries) and the days of cash it covers, null when there is no payroll */
  payrollPerDay: number;
  runwayDays: number | null;
  /** the first game day of the next quarter, the next close */
  nextCloseDay: number;
  distress: boolean;
  bankrupt: boolean;
  tier: CompanyTierId;
}

const EXEC_ROLES: ExecRole[] = ['CEO', 'CFO', 'COO', 'CTO'];
const ROLES: CompanyRole[] = ['ops', 'sales', 'rd', 'ga'];

export function operationsView(w: CompanyWorld, c: Company, day: number): OperationsView {
  const execs = {} as Record<ExecRole, ExecutiveView | null>;
  let execPay = 0;
  for (const role of EXEC_ROLES) {
    const e = c.execs?.[role];
    execs[role] = e
      ? { role, trait: e.trait, holder: e.holder, salary: e.salary, hiredDay: e.hiredDay, termEnd: e.termEnd, severance: severanceOf(e.salary) }
      : null;
    if (e) execPay += e.salary;
  }
  const wages = wagesPerDay(c);
  const payroll = wages.ops + wages.sales + wages.rd + wages.ga + execPay;
  const band = COMPANY.demand.priceRef * COMPANY.demand.priceBand;
  const others = c.staff.ops.total + c.staff.sales.total + c.staff.rd.total;
  return {
    gaSpan: {
      span: COMPANY.gaSpan,
      gaHeads: c.staff.ga.total,
      others,
      needed: Math.ceil(others / COMPANY.gaSpan),
      factor: gaFactor(c.staff),
    },
    decision: decisionCard(c, day, payroll),
    execs,
    ceoChange: c.ceoChange ? { announcedDay: c.ceoChange.announcedDay, effectiveDay: c.ceoChange.effectiveDay } : null,
    ceoFreeze: c.ceoFreeze && c.ceoFreeze.untilDay > day ? { untilDay: c.ceoFreeze.untilDay } : null,
    exCeo: c.exCeo && c.exCeo.untilDay > day ? { untilDay: c.exCeo.untilDay } : null,
    guarantee: c.guarantee ? { amount: c.guarantee.amount } : null,
    licences: (c.licences ?? []).map((l) => ({ id: l.id, rate: l.rate, revenuePerDay: l.revenuePerDay, signedDay: l.signedDay })),
    supplyDeals: (c.supplyDeals ?? []).map((s) => ({
      id: s.id, sellerId: s.sellerId, buyerId: s.buyerId, unitsPerDay: s.unitsPerDay, price: s.price, related: s.related, signedDay: s.signedDay,
    })),
    goalsDone: { ...c.goalsDone },
    rivals: c.npcs.map((n) => ({ id: n.id, price: n.price })),
    suppliers: Object.values(w.companies)
      .filter((o) => o.id !== c.id && !o.bankrupt)
      .map((o) => ({ id: o.id, name: o.name, sector: o.sector })),
    limits: {
      priceMin: COMPANY.demand.priceRef - band,
      priceMax: COMPANY.demand.priceRef + band,
      marketingMax: COMPANY.demand.marketingMax,
      productCap: COMPANY.productCap[c.tier],
      headcountCap: c.listed ? null : headcountCap(c.tier),
      rdProjectsAtOnce: COMPANY.rdProjectsAtOnce,
      qualityReady: COMPANY.rd.readyMark,
      franchiseRateMin: COMPANY.franchise.rateMin,
      franchiseRateMax: COMPANY.franchise.rateMax,
      franchiseCap: COMPANY.franchise.capPerSector,
      supplyBand: COMPANY.supply.band,
    },
    heads: ROLES.reduce((s, r) => s + c.staff[r].total, 0),
    payrollPerDay: payroll,
    runwayDays: payroll > 0 ? Math.max(0, c.cash) / payroll : null,
    nextCloseDay: c.qtd.startDay + COMPANY.quarterDays,
    distress: c.distress || c.distressPublic,
    bankrupt: !!c.bankrupt,
    tier: c.tier,
  };
}
