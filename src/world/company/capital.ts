/**
 * The founder's capital view (quant-company-building v1.7 §5, §5.2, §5.3, §6.1; velvet-company-app v1.4 §6, §8, §8.1; Phase 4
 * B3). Every number the Company Capital tab shows: the cap table, the private round, the IPO book and its previews, the trading
 * window, the sell-only plans (private rows with quantities and the public rows without them), buybacks, debt and covenant
 * meters, dividends, takeover and the failure record. The client does no arithmetic on these numbers beyond formatting.
 *
 * This is the founder's private view. It is built only for the owner (playerView), so it may carry the minimum sell price,
 * the plan quantities and the cash. The public part (`publicPlans`) is publicCompanyView's: a plan exists, with its days.
 */

import { COMPANY, type CompanyRole, type CompanyTierId, type InvestorKind } from '@/content/company';
import { companyRulesOf, lockedQty, livePlans, restrictionsOf } from '@/engine';
import { priceOf, today } from '../core';
import type { GameState } from '../types';
import type { Company, CompanyReject, CovenantStatus, Payout } from './types';
import { founderKeyOf, ipoEligibility, poolIdOf, treasuryIdOf } from './ipo';
import { annualEbitdaOf, BANK_POOL, totalDebt, ttmOf } from './debt';
import { nextOpenDay, windowAt } from './insiders';
import { privateValue } from './company';
import { marketShareOf } from './takeover';
import { publicCompanyView, type CompanyPublic } from './views';
import { buybackReserve, leverageAfter } from './programs';

export type CapTableKind = 'founder' | 'investor' | 'float' | 'treasury' | 'book' | 'other';

export interface CapTableRow {
  key: string;
  kind: CapTableKind;
  investor: InvestorKind | null;
  shares: number;
  pct: number;
}

export interface RoundView {
  open: boolean;
  refusal: CompanyReject | null;
  poolId: string;
  poolCash: number;
  priceFactor: number;
  pricePerShare: number | null;
  /** the most the pool may put in before the post-money cap (25%) bites; null when there is no valuation */
  maxAmount: number | null;
  maxPostMoneyShare: number;
  /** above this share of the post-money register a round needs a board vote */
  voteShare: number;
}

export interface IpoPreview {
  floatPct: number;
  price: number;
  ipoShares: number;
  sharesPost: number;
  proceeds: number;
  fee: number;
}

export interface IpoView {
  phase: 'listed' | 'requested' | 'eligible' | 'blocked';
  refusal: CompanyReject | null;
  filedQuarters: number;
  minFiledQuarters: number;
  filedV: number;
  minValue: number;
  minRank: string;
  discount: number;
  floatMin: number;
  floatMax: number;
  allocCapOfFloat: number;
  minAccountAgeDays: number;
  lockupDays: number;
  underwritingFee: number;
  /** the price preview at each float step (15% to 49%, one point apart): the slider reads these, never computes them */
  previews: IpoPreview[];
  book: {
    requestDay: number; listDay: number; floatPct: number; price: number; ipoShares: number; sharesPost: number;
    myOrder: number; cap: number;
  } | null;
  lockupUntil: number | null;
  founderShares: number;
}

export interface WindowView {
  listed: boolean;
  hasWindow: boolean;
  open: boolean;
  opensDay: number | null;
  closesDay: number | null;
  nextOpenDay: number;
  closingSoon: boolean;
  /** the days left in the open window, the close day counted (F+17 gives 5) */
  closesInDays: number | null;
  closingDays: number;
  lastFilingDay: number | null;
  covered: string[];
}

export interface PlanRowView {
  id: string;
  fromDay: number;
  toDay: number;
  committedDay: number;
  qtyPerDay: number;
  minSellPrice: number;
  /** shares still locked for days not yet sold (escrow) */
  escrow: number;
  /** shares skipped on price and held until holdUntil */
  priceHold: number;
  holdUntil: number | null;
  ended: { day: number; reason: string } | null;
}

export interface PlansView {
  listed: boolean;
  live: number;
  limit: number;
  leadDays: number;
  earliestDay: number;
  /** 0.80 x the commit-day close: the highest minimum sell price a plan may carry */
  floorMax: number | null;
  held: number;
  locked: number;
  sellable: number;
  lockUntil: number | null;
  /** the founder's stock is inside its lockup: nothing is sellable until lockUntil */
  inLockup: boolean;
  sellCapPerDay: number;
  commitRefusal: CompanyReject | null;
  rows: PlanRowView[];
  skips: { day: number; reason: string }[];
  /** what the market sees: a plan exists, with its days (no price, no size) */
  publicRows: CompanyPublic['plans'];
}

export interface BuybacksView {
  listed: boolean;
  filingDay: number | null;
  filesToday: boolean;
  perDayCap: number;
  reservePerShare: number | null;
  covenantOk: boolean;
  leverage: number | null;
  leverageAfterMax: number;
  programs: { id: string; size: number; fromDay: number; toDay: number }[];
  cash: number;
  refusal: CompanyReject | null;
}

export interface LoanView {
  id: string;
  principal: number;
  ratePerDay: number;
  drawnDay: number;
  guaranteed: boolean;
  guaranteedAmount: number;
}

export interface DebtView {
  covenant: CovenantStatus;
  cureUntilDay: number | null;
  cureDays: number;
  cash: number;
  total: number;
  netDebt: number;
  /** net debt over annualized TTM EBITDA; null when EBITDA is not positive */
  leverage: number | null;
  maxLeverage: number;
  /** annualized EBITDA over TTM interest; null when there is no interest yet */
  cover: number | null;
  minCover: number;
  ratePerDay: number;
  guaranteedRatePerDay: number;
  loans: LoanView[];
  minTier: CompanyTierId;
  tierOk: boolean;
  bankCash: number;
  refusal: CompanyReject | null;
  personalExposure: number;
}

export interface DividendsView {
  checks: { rule: 'covenant' | 'retained' | 'cash' | 'fcf'; ok: boolean }[];
  retainedEarnings: number;
  cashCoverNeeded: number;
  fcfTtm: number;
  payableShares: number;
  distress: boolean;
  cashCoverDays: number;
}

export interface TakeoverView {
  listed: boolean;
  stance: 'yes' | 'no' | null;
  /** this company's share of its sector, in [0,1] */
  share: number;
  antitrustLimit: number;
  vwap30: number | null;
  floorRatio: number;
  floor: number | null;
}

export interface PayoutRow {
  id: string;
  day: number;
  amount: number;
  covered: number;
  kind: Payout['kind'];
  insider: boolean;
  flagged: boolean;
}

export interface FailureView {
  insolventDays: number;
  distress: boolean;
  distressPublic: boolean;
  bankrupt: { day: number; recovery: number; paid: number; shortfall: number; clawed: number } | null;
  personalDebt: number;
  guaranteeExposure: number;
  lookbackDays: number;
  safeHarbourDays: number;
  payouts: PayoutRow[];
}

export interface CapitalView {
  companyId: string;
  name: string;
  day: number;
  tier: CompanyTierId;
  listed: boolean;
  bankrupt: boolean;
  cash: number;
  shares: number;
  roles: Record<CompanyRole, number>;
  capTable: CapTableRow[];
  rounds: RoundView;
  ipo: IpoView;
  window: WindowView;
  plans: PlansView;
  buybacks: BuybacksView;
  debt: DebtView;
  dividends: DividendsView;
  takeover: TakeoverView;
  failure: FailureView;
}

const FLOAT_STEP = 0.01;

/** The capital view of the founder's company, or null when the player founded none. Owner only (playerView). */
export function capitalViewOf(g: GameState, playerId: string): CapitalView | null {
  const w = g.companies;
  if (!w) return null;
  const c = Object.values(w.companies).sort((a, b) => a.id.localeCompare(b.id)).find((x) => x.ownerId === playerId);
  if (!c) return null;
  return capitalOf(g, c, playerId);
}

function capitalOf(g: GameState, c: Company, pid: string): CapitalView {
  const w = g.companies!;
  const day = today(g);
  const rules = companyRulesOf(g.market);
  const restr = restrictionsOf(g.market);
  const assetId = c.listed?.assetId ?? null;
  const cash = c.cash;
  const sharesAll = c.shares;

  // cap table: the founder, the investor pools, the float and the book, with their share of the register
  const capTable: CapTableRow[] = Object.entries(c.capTable)
    .filter(([, shares]) => shares > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, shares]) => ({
      key,
      kind: capKind(key, c, w),
      investor: w.investors[key]?.kind ?? null,
      shares,
      pct: sharesAll > 0 ? shares / sharesAll : 0,
    }));

  // rounds: NPC pools only, pre-listing, not during an open IPO book
  const poolId = c.tier === 'seed' ? 'npc:seed' : 'npc:series';
  const v = privateValue(c, day);
  const price = v > 0 && sharesAll > 0 ? (COMPANY.rounds.priceFactor * v) / sharesAll : null;
  const maxShare = COMPANY.rounds.maxPostMoneyShare;
  const roundRefusal: CompanyReject | null = c.listed ? { code: 'roundAfterListing' } : c.ipo ? { code: 'roundDuringIpo' } : c.bankrupt ? { code: 'companyBankrupt' } : null;
  const rounds: RoundView = {
    open: roundRefusal === null,
    refusal: roundRefusal,
    poolId,
    poolCash: w.investors[poolId]?.cash ?? 0,
    priceFactor: COMPANY.rounds.priceFactor,
    pricePerShare: price,
    maxAmount: price === null ? null : (maxShare / (1 - maxShare)) * sharesAll * price,
    maxPostMoneyShare: maxShare,
    voteShare: COMPANY.governance.dilutionVoteShare,
  };

  // IPO: the first failing eligibility rule is the refusal; the previews price every float step on the request's formula
  const elig = ipoEligibility(g, c, pid);
  const shares = c.shares;
  const previews: IpoPreview[] = [];
  for (let k = 0; k <= Math.round((COMPANY.ipo.floatMax - COMPANY.ipo.floatMin) / FLOAT_STEP); k++) {
    const floatPct = Math.round((COMPANY.ipo.floatMin + k * FLOAT_STEP) * 100) / 100;
    const ipoShares = Math.round((shares * floatPct) / (1 - floatPct));
    const sharesPost = shares + ipoShares;
    const price1 = ((1 - COMPANY.ipo.discount) * c.filedV) / sharesPost;
    const proceeds = ipoShares * price1;
    previews.push({ floatPct, price: price1, ipoShares, sharesPost, proceeds, fee: proceeds * COMPANY.ipo.underwritingFee });
  }
  const founderShares = c.listed ? (g.market.accounts[pid]?.positions[c.listed.assetId]?.qty ?? 0) : 0;
  const ipo: IpoView = {
    phase: c.listed ? 'listed' : c.ipo ? 'requested' : elig === null ? 'eligible' : 'blocked',
    refusal: c.listed || c.ipo ? null : elig,
    filedQuarters: c.filings.length,
    minFiledQuarters: COMPANY.ipo.minFiledQuarters,
    filedV: c.filedV,
    minValue: COMPANY.ipo.minValue,
    minRank: COMPANY.ipo.minRank,
    discount: COMPANY.ipo.discount,
    floatMin: COMPANY.ipo.floatMin,
    floatMax: COMPANY.ipo.floatMax,
    allocCapOfFloat: COMPANY.ipo.allocCapOfFloat,
    minAccountAgeDays: COMPANY.ipo.minAccountAgeDays,
    lockupDays: COMPANY.ipo.lockupDays,
    underwritingFee: COMPANY.ipo.underwritingFee,
    previews,
    book: c.ipo ? {
      requestDay: c.ipo.requestDay,
      listDay: c.ipo.listDay,
      floatPct: c.ipo.floatPct,
      price: c.ipo.price,
      ipoShares: c.ipo.ipoShares,
      sharesPost: c.ipo.sharesPost,
      myOrder: c.ipo.orders[pid] ?? 0,
      cap: Math.floor(COMPANY.ipo.allocCapOfFloat * c.ipo.ipoShares),
    } : null,
    lockupUntil: c.listed ? c.listed.ipoDay + COMPANY.ipo.lockupDays : null,
    founderShares,
  };

  // window: the engine's schedule for a listed stock; the company's own windows for a private one (Late tier)
  const wa = windowAt(c, day);
  const closingSoon = wa.open && wa.closesDay !== undefined && wa.closesDay - day < rules.windowClosingDays;
  const windowView: WindowView = {
    listed: c.listed !== null,
    hasWindow: c.windowRanges.length > 0,
    open: wa.open,
    opensDay: wa.opensDay ?? null,
    closesDay: wa.closesDay ?? null,
    nextOpenDay: nextOpenDay(c, day),
    closingSoon,
    closesInDays: wa.open && wa.closesDay !== undefined ? wa.closesDay - day + 1 : null,
    closingDays: rules.windowClosingDays,
    lastFilingDay: c.filings.length > 0 ? c.lastFilingDay : null,
    covered: assetId ? [assetId] : [],
  };

  // plans: the engine's programs for the founder's stock (the private rows carry the quantities and the minimum price)
  const held = assetId ? (g.market.accounts[pid]?.positions[assetId]?.qty ?? 0) : 0;
  const locked = assetId ? lockedQty(restr, pid, assetId, day) : 0;
  const lockUntil = assetId ? (restr.lockups[assetId]?.[pid] ?? null) : null;
  const live = assetId ? livePlans(restr, pid, assetId) : 0;
  const aIdx = assetId ? g.market.config.assets.findIndex((x) => x.id === assetId) : -1;
  const lastClose = aIdx >= 0 ? Math.exp(g.market.tick % g.market.config.ticksPerDay === 0 ? g.market.assets[aIdx]!.lnP : g.market.assets[aIdx]!.lnOpen) : null;
  const rows: PlanRowView[] = [];
  for (const r of c.planRows) {
    const p = restr.programs[r.id];
    if (!p) continue;
    rows.push({
      id: r.id,
      fromDay: r.fromDay,
      toDay: r.toDay,
      committedDay: p.committedDay,
      qtyPerDay: p.qtyPerDay,
      minSellPrice: p.minPrice ?? 0,
      escrow: p.escrow,
      priceHold: p.priceHold,
      holdUntil: p.holdUntil ?? null,
      ended: p.ended ? { day: p.ended.day, reason: p.ended.reason } : null,
    });
  }
  const commitRefusal: CompanyReject | null = !c.listed
    ? { code: 'planNotListed' }
    : live >= rules.planLiveLimit
      ? { code: 'planLimit' }
      : null;
  const plans: PlansView = {
    listed: c.listed !== null,
    live,
    limit: rules.planLiveLimit,
    leadDays: rules.planLeadDays,
    earliestDay: day + rules.planLeadDays,
    floorMax: lastClose === null ? null : rules.planFloorMaxRatio * lastClose,
    held,
    locked,
    sellable: lockUntil !== null && lockUntil > day ? 0 : Math.max(0, held - locked),
    lockUntil,
    inLockup: lockUntil !== null && lockUntil > day,
    sellCapPerDay: c.listed ? Math.floor(COMPANY.insiders.sellCapPct * c.listed.sharesOut) : 0,
    commitRefusal,
    rows,
    skips: c.planSkips.map((s) => ({ day: s.day, reason: s.reason })),
    publicRows: publicCompanyView(c, day).plans,
  };

  // buybacks: one program a filing; the cap is 1% of float a game day; leverage after the reserve is read off the filed numbers
  const filingDay = c.filings.length > 0 ? c.lastFilingDay + COMPANY.programs.buybackFilingOffset : null;
  const bbPrice = assetId ? priceOf(g, assetId) : NaN;
  const reservePerShare = Number.isFinite(bbPrice) ? buybackReserve(1, bbPrice) : null;
  const perDayCap = c.listed ? Math.floor(COMPANY.programs.buybackFloatPerDay * c.listed.floatShares) : 0;
  const bbRefusal: CompanyReject | null = !c.listed
    ? { code: 'buybackBadSpec' }
    : filingDay === null || day !== filingDay
      ? { code: 'buybackNotFilingDay', filingDay: filingDay ?? day }
      : c.covenant.status !== 'ok'
        ? { code: 'buybackCovenant', covenant: c.covenant.status }
        : null;
  const levAfter = leverageAfter(c, 0);
  const buybacks: BuybacksView = {
    listed: c.listed !== null,
    filingDay,
    filesToday: bbRefusal === null,
    perDayCap,
    reservePerShare,
    covenantOk: c.covenant.status === 'ok',
    leverage: Number.isFinite(levAfter) ? levAfter : null,
    leverageAfterMax: COMPANY.debt.buybackMaxLeverage,
    programs: c.buybacks.map((b) => ({ id: b.id, size: b.size, fromDay: b.fromDay, toDay: b.toDay })),
    cash,
    refusal: bbRefusal,
  };

  // debt: the covenants on the live numbers (the meters the company is tested on), the loans and who guarantees them
  const total = totalDebt(c);
  const netDebt = total - cash;
  const ebitda = annualEbitdaOf(c);
  const { interest } = ttmOf(c);
  const debtRefusal: CompanyReject | null = c.bankrupt ? { code: 'companyBankrupt' }
    : (TIER_ORDER[c.tier] ?? 0) < (TIER_ORDER[COMPANY.debt.loanMinTier] ?? 0) ? { code: 'loanTier', minTier: COMPANY.debt.loanMinTier }
      : c.covenant.status !== 'ok' ? { code: 'loanCovenant', covenant: c.covenant.status }
        : null;
  const loans: LoanView[] = c.debts.map((d) => ({
    id: d.id,
    principal: d.principal,
    ratePerDay: d.ratePerDay,
    drawnDay: d.drawnDay,
    guaranteed: d.guarantor !== null,
    guaranteedAmount: d.guaranteedAmount,
  }));
  const debt: DebtView = {
    covenant: c.covenant.status,
    cureUntilDay: c.covenant.cureUntilDay,
    cureDays: COMPANY.debt.cureDays,
    cash,
    total,
    netDebt,
    leverage: ebitda > 0 ? netDebt / ebitda : null,
    maxLeverage: COMPANY.debt.maxLeverage,
    cover: interest > 0 ? ebitda / interest : null,
    minCover: COMPANY.debt.minInterestCover,
    ratePerDay: COMPANY.debt.ratePerDay,
    guaranteedRatePerDay: COMPANY.debt.ratePerDay * COMPANY.debt.guaranteedFactor,
    loans,
    minTier: COMPANY.debt.loanMinTier,
    tierOk: (TIER_ORDER[c.tier] ?? 0) >= (TIER_ORDER[COMPANY.debt.loanMinTier] ?? 0),
    bankCash: g.companies!.investors[BANK_POOL]?.cash ?? 0,
    refusal: debtRefusal,
    personalExposure: loans.filter((l) => l.guaranteed).reduce((x, l) => x + l.guaranteedAmount, 0),
  };

  // dividends: the four state rules as the client shows them; the amount-level rule (the dividend is at most TTM FCF) is the server's
  const last = c.closed[c.closed.length - 1];
  const dailyCost = last ? (last.cogs + last.opex) / COMPANY.quarterDays : 0;
  const payableShares = c.shares - (c.listed && c.treasuryId ? (g.market.accounts[treasuryIdOf(c.id)]?.positions[c.listed.assetId]?.qty ?? 0) : 0);
  const fcf = ttmOf(c).fcf;
  const dividends: DividendsView = {
    checks: [
      { rule: 'covenant', ok: c.covenant.status === 'ok' },
      { rule: 'retained', ok: c.retained > 0 },
      { rule: 'cash', ok: cash >= COMPANY.dividends.cashCoverDays * dailyCost },
      { rule: 'fcf', ok: fcf > 0 },
    ],
    retainedEarnings: c.retained,
    cashCoverNeeded: COMPANY.dividends.cashCoverDays * dailyCost,
    fcfTtm: fcf,
    payableShares,
    distress: c.divDistress,
    cashCoverDays: COMPANY.dividends.cashCoverDays,
  };

  // takeover: the stance the founder set, the market share the antitrust rule reads, and the tender floor (1.2 x VWAP30)
  const bars = assetId ? (g.market.assets.find((a) => a.id === assetId)?.bars ?? []) : [];
  const last30 = bars.slice(-30);
  const units = last30.reduce((x, b) => x + b.u, 0);
  const vwap30 = units > 0 ? last30.reduce((x, b) => x + b.c * b.u, 0) / units : null;
  const takeover: TakeoverView = {
    listed: c.listed !== null,
    stance: c.founderStance ?? null,
    share: marketShareOf(c),
    antitrustLimit: COMPANY.npc.antitrustShare,
    vwap30,
    floorRatio: COMPANY.takeover.floorRatio,
    floor: vwap30 === null ? null : COMPANY.takeover.floorRatio * vwap30,
  };

  // failure: the insolvency count, the bankruptcy record, the personal debt and guarantees, and the payments in the lookback
  const lookback = COMPANY.failure.clawbackLookbackDays;
  const failure: FailureView = {
    insolventDays: c.insolventDays ?? 0,
    distress: c.distress,
    distressPublic: c.distressPublic,
    bankrupt: c.bankrupt ?? null,
    personalDebt: g.companies!.personalDebt?.[pid] ?? 0,
    guaranteeExposure: loans.filter((l) => l.guaranteed).reduce((x, l) => x + l.guaranteedAmount, 0),
    lookbackDays: lookback,
    safeHarbourDays: COMPANY.failure.safeHarbourDays,
    payouts: (c.payouts ?? []).filter((p) => p.day >= day - lookback).slice(-20).map((p) => ({
      id: p.id, day: p.day, amount: p.amount, covered: p.covered, kind: p.kind, insider: p.insider, flagged: p.flagged,
    })),
  };

  return {
    companyId: c.id,
    name: c.name,
    day,
    tier: c.tier,
    listed: c.listed !== null,
    bankrupt: !!c.bankrupt,
    cash,
    shares: sharesAll,
    roles: { ops: c.staff.ops.total, sales: c.staff.sales.total, rd: c.staff.rd.total, ga: c.staff.ga.total },
    capTable,
    rounds,
    ipo,
    window: windowView,
    plans,
    buybacks,
    debt,
    dividends,
    takeover,
    failure,
  };
}

const TIER_ORDER: Record<string, number> = { seed: 0, growth: 1, late: 2 };

/** The kind of a register line: the founder, an investor pool, the float, the treasury, the NPC book, or other. */
function capKind(key: string, c: Company, w: NonNullable<GameState['companies']>): CapTableKind {
  if (key === founderKeyOf(c.ownerId)) return 'founder';
  if (key.startsWith('float:')) return 'float';
  if (key === treasuryIdOf(c.id)) return 'treasury';
  if (key.startsWith('npc:book:')) return 'book';
  if (w.investors[key] || key === poolIdOf(c.id)) return 'investor';
  return 'other';
}
