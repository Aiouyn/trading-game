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
import { allianceSetOf, founderKeyOf, ipoEligibility, poolIdOf, treasuryIdOf } from './ipo';
import { annualEbitdaOf, BANK_POOL, totalDebt, ttmOf } from './debt';
import { nextOpenDay, windowAt } from './insiders';
import { privateValue } from './company';
import { marketShareOf } from './takeover';
import { publicCompanyView, type CompanyPublic } from './views';
import { buybackReserve, leverageAfter } from './programs';
import { boardVote } from './governance';

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
  /** the most of this float one buyer can take (5% of the new shares, floored) */
  cap: number;
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
  /** a buyer's order is cut to what its cash covers at the book price */
  cashLimited: boolean;
  /** the price preview at each float step (15% to 49%, one point apart): the slider reads these, never computes them */
  previews: IpoPreview[];
  book: {
    requestDay: number; listDay: number; floatPct: number; price: number; ipoShares: number; sharesPost: number;
    myOrder: number; cap: number; ownerSet: boolean;
  } | null;
  lockupUntil: number | null;
  founderShares: number;
  convictionDays: number;
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
  /** the shares already committed on each day by the filed programs (the cap is shared by every program on a day) */
  committedByDay: { day: number; qty: number }[];
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
  /** the rules in the engine's order; maxPerShare is the most a declaration may be under that rule alone (null when the rule is not about an amount) */
  checks: { rule: 'filings' | 'covenant' | 'retained' | 'cash' | 'fcf'; ok: boolean; maxPerShare: number | null }[];
  /** the most a dividend per share may be today under every amount rule together (0 while a gate is closed) */
  maxPerShare: number;
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
  /** the board's vote on a bid at the tender floor (the lowest bid that can settle): yes and no in shares, and whether it passes */
  board: { yes: number; no: number; passed: boolean } | null;
  /** NPC investors approve a bid at or above this value per share and reject below it (governance.boardVote) */
  fairPerShare: number | null;
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
  /** the board's voting weight: the founder's register stake and the NPC pools' shares (governance.boardVote) */
  voting: { founderShares: number; npcShares: number };
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
    previews.push({
      floatPct, price: price1, ipoShares, sharesPost, proceeds, fee: proceeds * COMPANY.ipo.underwritingFee,
      cap: Math.floor(COMPANY.ipo.allocCapOfFloat * ipoShares),
    });
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
    cashLimited: true,
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
      ownerSet: allianceSetOf(g, c).includes(pid),
    } : null,
    lockupUntil: c.listed ? c.listed.ipoDay + COMPANY.ipo.lockupDays : null,
    convictionDays: COMPANY.ipo.convictionDays,
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
  const committed = new Map<number, number>();
  for (const b of c.buybacks) {
    const n = b.toDay - b.fromDay + 1;
    if (!(n > 0)) continue;
    for (let d = b.fromDay; d <= b.toDay; d++) committed.set(d, (committed.get(d) ?? 0) + b.size / n);
  }
  const buybacks: BuybacksView = {
    listed: c.listed !== null,
    filingDay,
    filesToday: bbRefusal === null,
    perDayCap,
    committedByDay: [...committed.entries()].sort(([a], [b]) => a - b).map(([d, qty]) => ({ day: d, qty })),
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
  // the largest value per share each amount rule allows: the payable register times it is the engine's test (payouts.ts)
  const perShareCap = (room: number) => (payableShares > 0 ? Math.max(0, room / payableShares) : 0);
  const retainedMax = perShareCap(c.retained);
  const cashMax = perShareCap(cash - COMPANY.dividends.cashCoverDays * dailyCost);
  const fcfMax = perShareCap(fcf);
  const gatesOk = c.filings.length > 0 && c.covenant.status === 'ok';
  const dividends: DividendsView = {
    checks: [
      { rule: 'filings', ok: c.filings.length > 0, maxPerShare: null },
      { rule: 'covenant', ok: c.covenant.status === 'ok', maxPerShare: null },
      { rule: 'retained', ok: retainedMax > 0, maxPerShare: retainedMax },
      { rule: 'cash', ok: cashMax > 0, maxPerShare: cashMax },
      { rule: 'fcf', ok: fcf > 0, maxPerShare: fcfMax },
    ],
    maxPerShare: gatesOk ? Math.min(retainedMax, cashMax, fcfMax) : 0,
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
  const floor = vwap30 === null ? null : COMPANY.takeover.floorRatio * vwap30;
  const fairPerShare = c.shares > 0 ? privateValue(c, day) / c.shares : null;
  const atFloor = floor === null || fairPerShare === null || !c.listed
    ? null
    : boardVote(c, { founderVote: c.founderStance ?? 'no', price: floor, fairPerShare, npcRule: 'price' });
  const takeover: TakeoverView = {
    listed: c.listed !== null,
    stance: c.founderStance ?? null,
    share: marketShareOf(c),
    antitrustLimit: COMPANY.npc.antitrustShare,
    vwap30,
    floorRatio: COMPANY.takeover.floorRatio,
    floor,
    board: atFloor ? { yes: atFloor.yes, no: atFloor.no, passed: atFloor.passed } : null,
    fairPerShare,
  };

  // failure: the insolvency count, the bankruptcy record, the personal debt and guarantees, and the payments in the lookback
  const lookback = COMPANY.failure.clawbackLookbackDays;
  // the engine's clawback looks back from the default day (failure.ts clawback), so the record does too
  const anchor = c.bankrupt ? c.bankrupt.day : day;
  const failure: FailureView = {
    insolventDays: c.insolventDays ?? 0,
    distress: c.distress,
    distressPublic: c.distressPublic,
    bankrupt: c.bankrupt ?? null,
    personalDebt: g.companies!.personalDebt?.[pid] ?? 0,
    guaranteeExposure: loans.filter((l) => l.guaranteed).reduce((x, l) => x + l.guaranteedAmount, 0),
    lookbackDays: lookback,
    safeHarbourDays: COMPANY.failure.safeHarbourDays,
    payouts: (c.payouts ?? []).filter((p) => p.day >= anchor - lookback && p.day < anchor).slice(-20).map((p) => ({
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
    voting: {
      founderShares: c.capTable[founderKeyOf(c.ownerId)] ?? 0,
      npcShares: Object.entries(c.capTable).filter(([k]) => !!w.investors[k] && k !== founderKeyOf(c.ownerId)).reduce((x, [, sh]) => x + sh, 0),
    },
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

/**
 * The room a buyback over fromDay..toDay has left: the cap less what the filed programs already take on the most loaded day of
 * that span (the engine's rule, programs.ts addBuyback). The form reads it; the engine still decides.
 */
export function buybackRoomOver(b: BuybacksView, fromDay: number, toDay: number): number {
  if (!Number.isInteger(fromDay) || !Number.isInteger(toDay) || toDay < fromDay) return b.perDayCap;
  let room = b.perDayCap;
  for (const { day, qty } of b.committedByDay) {
    if (day >= fromDay && day <= toDay) room = Math.min(room, b.perDayCap - qty);
  }
  return Math.max(0, room);
}

/**
 * The buyback form's fit: the per-day amount a size over fromDay..toDay costs, the room those days have left, and whether it
 * fits. Null when the span is not a span (the engine refuses the spec then). The form disables filing on a misfit.
 */
export function buybackFit(b: BuybacksView, size: number, fromDay: number, toDay: number): { perDay: number; room: number; fits: boolean } | null {
  if (!Number.isInteger(size) || size <= 0 || !Number.isInteger(fromDay) || !Number.isInteger(toDay) || toDay < fromDay) return null;
  const n = toDay - fromDay + 1;
  if (size % n !== 0) return null;
  const perDay = size / n;
  const room = buybackRoomOver(b, fromDay, toDay);
  return { perDay, room, fits: perDay <= room };
}
