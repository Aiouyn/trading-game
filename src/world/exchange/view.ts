/**
 * The Exchange app's view (Phase 4, Quay app `exchange`): what a player may see of the player-company stocks, the open IPO
 * books and the player-run funds, plus the player's own fund holdings and, for a manager, the console of his own fund.
 *
 * Privacy (Quant v1.7 §10, the no-reveal rule): every market field here comes from a public view (`publicCompanyView`,
 * `publicFunds`) or from a fact the market sees (a listing's price, an IPO book's price and float). The IPO book's
 * per-account orders are never listed: only the viewer's own subscription. No investor list, no other holder's units, no
 * company cash, no plan size. The manager console reads the fund's private state, and it is built only for the manager.
 *
 * Numbers are computed here, once, from the world. The screens format them and do no arithmetic of their own.
 */

import { COMPANY, type CompanySector } from '@/content/company';
import { FUND_RULES, FUND_TICKS_PER_DAY, FUND_TIME } from '@/content/funds';
import { priceOf, netWorthBreakdown, today, TPD, spendableCash } from '../core';
import type { GameState } from '../types';
import { publicCompanyView, type CompanyPublic } from '../company/views';
import type { CompanyReject } from '../company/types';
import { managerRefusal } from '../funds/rules';
import { isLinkedAccount } from '../collusion';
import { fundsOf, managedBy, navOf, navPerUnitOf, unitsHeld } from '../funds/state';
import { publicFunds, aumBucketOf } from '../funds/view';
import type { FundFiling, FundFees, FundMandate, FundPublic, FundRefusal, FundStatus } from '../funds/types';

/** One listed player company: its public view, its ticker and its market price now. */
export interface ListedStock {
  companyId: string;
  name: string;
  ticker: string;
  price: number;
  halted: boolean;
  view: CompanyPublic;
}

/** An IPO book open today: the price and float are public; the book's other orders are not. */
export interface IpoRow {
  companyId: string;
  name: string;
  sector: CompanySector;
  requestDay: number;
  listDay: number;
  price: number;
  floatPct: number;
  ipoShares: number;
  sharesPost: number;
  /** the most shares one buyer may take (5% of the float, N8) */
  capShares: number;
  /** the viewer's own subscription so far, in shares */
  myShares: number;
  /** the shares the viewer can still subscribe to under the cap (capShares less myShares, never below 0) */
  roomShares: number;
  /** why the viewer cannot subscribe (the company reject with its copy keys), or null when they can */
  blocked: CompanyReject | null;
}

/** One of the viewer's positions in a fund: units, what they are worth, and what is pending. */
export interface FundHolding {
  fundId: string;
  name: string;
  status: FundStatus;
  navPerUnit: number;
  /** units held (not waiting for a redemption) */
  units: number;
  /** units waiting for a redemption to pay */
  reserved: number;
  /** units at the current NAV, held and reserved together */
  value: number;
  /** redemption money owed to the viewer and not yet paid */
  payable: number;
  /** a deposit waiting for the next day close */
  pendingDeposit: number;
  /** ticks left in which a redemption pays the early-exit fee (0 when none applies) */
  earlyExitRemainingTicks: number;
  /** the most the viewer may hold in this fund: 25% of their net worth (their own limit, not a rank) */
  investorLimit: number;
  /** a court case over front-running is open on this fund */
  underCase: boolean;
  /** the manager has a court verdict on record */
  convicted: boolean;
}

/** The manager's console: the fund's private state. Built only for the fund's manager. */
export interface ManagedFund {
  id: string;
  name: string;
  status: FundStatus;
  createdTick: number;
  mandate: FundMandate;
  /** a mandate change in its 24 real hours of notice: the mandate and the ticks left before it applies */
  pendingMandate: { mandate: FundMandate; remainingTicks: number } | null;
  fees: FundFees;
  navPerUnit: number;
  /** the fund's NAV (equity less what it owes) */
  nav: number;
  /** the fund account's cash and its positions (asset, quantity, value at the market price) */
  cash: number;
  positions: { assetId: string; qty: number; value: number }[];
  /** the manager's own stake, in dollars, and the floor it must keep while investors are in */
  stake: number;
  stakeFloor: number;
  /** the most AUM the stake supports (10 times the stake), and the young-fund cap while it applies (null after) */
  aumCap: number;
  youngAumCap: number | null;
  /** the management fee accrued since the last quarter, and the crystallized fees owed to the manager */
  feeAccrued: number;
  feePayable: number;
  highWaterMark: number;
  /** the drawdown breaker: ticks left in which new trades are refused (0 when none) */
  breakerRemainingTicks: number;
  /** the freeze for absence: whether trading is frozen now, and the ticks left before the automatic wind-down (null unless frozen) */
  frozen: boolean;
  windDownRemainingTicks: number | null;
  /** whether the fund is winding down now */
  winding: boolean;
  /** the front-running case, the evidence points and the harm, and the gain at stake (the public numbers stay in filings) */
  caseOpen: boolean;
  evidence: number;
  harm: number;
  gain: number;
  filings: (FundFiling & { day: number })[];
  convicted: boolean;
  /** redemption and deposit requests still pending, in dollars (deposits) and units (redemptions) */
  pendingDeposits: number;
  pendingRedeemUnits: number;
  aumBucket: number;
}

export interface FundRules {
  minDeposit: number;
  redeemGatePct: number;
  earlyExitFeePct: number;
  investorMaxNwPct: number;
  mgmtFeeMax: number;
  perfFeeMax: number;
  /** the same caps in percent, the units the fee form types in */
  mgmtFeeMaxPct: number;
  perfFeeMaxPct: number;
  custodyFeePerYear: number;
  stakeMinPct: number;
  managerMinStake: number;
  aumPerStake: number;
  youngAumCap: number;
  youngFundTicks: number;
  leverageMax: number;
  positionMaxPct: number;
  insiderPositionMaxPct: number;
  classes: readonly string[];
  mandateNoticeTicks: number;
  earlyExitTicks: number;
  investorAgeTicks: number;
  managerAgeTicks: number;
  managerMinRank: string;
  breakerDropPct: number;
  absentFreezeTicks: number;
  windDownDays: number;
  ticksPerDay: number;
  /** the same waits in the units the copy names: real days, real hours, real weeks and game days */
  earlyExitRealDays: number;
  investorAgeRealDays: number;
  youngFundRealDays: number;
  managerAgeGameDays: number;
  mandateNoticeRealHours: number;
  absentFreezeRealHours: number;
  convictionRealWeeks: number;
}

/** A public fund, with its filings dated in game days (the screens show days, never ticks). */
export interface ExchangeFund extends Omit<FundPublic, 'filings'> {
  filings: (FundFiling & { day: number })[];
}

export interface ExchangeView {
  day: number;
  stocks: ListedStock[];
  ipos: IpoRow[];
  funds: ExchangeFund[];
  holdings: FundHolding[];
  /** the viewer's total in funds: units at NAV, held and reserved, over every holding */
  holdingsValue: number;
  managed: ManagedFund | null;
  /** whether the viewer may open a fund now (the first failing rule for the minimum stake), and their conviction and ban */
  opening: { refusal: FundRefusal | null; cash: number };
  /** ticks left in a fund-management ban, and in the 8 real weeks after a fund-abuse verdict (0 when none) */
  banRemainingTicks: number;
  convictedRemainingTicks: number;
  rules: FundRules;
}

/** The listed player companies, in ticker order. A delisted name leaves the list (its market is closed). */
export function listedStocks(g: GameState, day: number): ListedStock[] {
  const w = g.companies;
  if (!w) return [];
  const out: ListedStock[] = [];
  for (const c of Object.values(w.companies)) {
    if (!c.listed) continue;
    const idx = g.market.config.assets.findIndex((a) => a.id === c.listed!.assetId);
    if (idx < 0) continue;
    const def = g.market.config.assets[idx]!;
    if (def.delisted) continue;
    const a = g.market.assets[idx];
    const halted = !!a && a.haltUntil !== -1 && a.haltUntil > g.market.tick;
    out.push({
      companyId: c.id,
      name: c.name,
      ticker: c.listed.assetId,
      price: priceOf(g, c.listed.assetId),
      halted,
      view: publicCompanyView(c, day),
    });
  }
  return out.sort((a, b) => a.ticker.localeCompare(b.ticker));
}

/** The viewer's IPO subscription, and why they cannot subscribe (the owner set, or an account under 7 game days old). */
export function ipoBlock(g: GameState, ownerId: string, pid: string): CompanyReject | null {
  // the same owner group the order check uses (ipo.ts orderIpo), so the view and the refusal agree
  if (isLinkedAccount(g, ownerId, pid)) return { code: 'ipoOwnerSet' };
  const p = g.players[pid];
  if (!p || !g.market.accounts[pid]) return { code: 'unknownCompany' };
  if (g.market.tick - p.joinedTick < COMPANY.ipo.minAccountAgeDays * TPD) {
    return { code: 'ipoAccountTooYoung', minDays: COMPANY.ipo.minAccountAgeDays };
  }
  return null;
}

/** The IPO books open today (request day to the day before listing). Their allocation is never shown. */
export function openIpos(g: GameState, pid: string, day: number): IpoRow[] {
  const w = g.companies;
  if (!w) return [];
  const out: IpoRow[] = [];
  for (const c of Object.values(w.companies)) {
    const b = c.ipo;
    if (!b || c.listed || day < b.requestDay || day >= b.listDay) continue;
    out.push({
      companyId: c.id,
      name: c.name,
      sector: c.sector,
      requestDay: b.requestDay,
      listDay: b.listDay,
      price: b.price,
      floatPct: b.floatPct,
      ipoShares: b.ipoShares,
      sharesPost: b.sharesPost,
      capShares: Math.floor(COMPANY.ipo.allocCapOfFloat * b.ipoShares),
      myShares: b.orders[pid] ?? 0,
      roomShares: Math.max(0, Math.floor(COMPANY.ipo.allocCapOfFloat * b.ipoShares) - (b.orders[pid] ?? 0)),
      blocked: ipoBlock(g, c.ownerId, pid),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.companyId.localeCompare(b.companyId));
}

/** The viewer's holdings in every fund that is not closed: units, pending money, early-exit and the investor's own limit. */
export function holdingsOf(g: GameState, pid: string): FundHolding[] {
  const nw = netWorthBreakdown(g, pid).total;
  const out: FundHolding[] = [];
  for (const f of Object.values(fundsOf(g).funds)) {
    if (f.status === 'closed') continue;
    const units = f.holders[pid] ?? 0;
    const reserved = f.reserved[pid] ?? 0;
    const payable = f.payable[pid] ?? 0;
    const pendingDeposit = f.requests.reduce((s, r) => s + (r.kind === 'deposit' && r.investorId === pid ? r.amount : 0), 0);
    const depositedAt = f.depositedTick[pid];
    const earlyUntil = depositedAt !== undefined ? depositedAt + FUND_TIME.earlyExitTicks : null;
    const hasMoney = units > 1e-9 || reserved > 1e-9 || payable > 1e-9 || pendingDeposit > 0;
    if (!hasMoney) continue;
    const px = navPerUnitOf(g, f);
    out.push({
      fundId: f.id,
      name: f.name,
      status: f.status,
      navPerUnit: px,
      units,
      reserved,
      value: (units + reserved) * px,
      payable,
      pendingDeposit,
      earlyExitRemainingTicks: earlyUntil !== null ? Math.max(0, earlyUntil - g.market.tick) : 0,
      investorLimit: FUND_RULES.investorMaxNwPct * nw,
      underCase: f.caseId !== null,
      convicted: fundsOf(g).convicted[f.managerId] !== undefined,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.fundId.localeCompare(b.fundId));
}

/** The manager's console for his own open fund (null when he runs none). */
export function managedView(g: GameState, pid: string): ManagedFund | null {
  const f = managedBy(g, pid);
  if (!f) return null;
  const acct = g.market.accounts[f.accountId];
  const nav = navOf(g, f);
  const px = navPerUnitOf(g, f);
  const stake = unitsHeld(f, pid) * px;
  const young = g.market.tick - f.createdTick < FUND_TIME.youngFundTicks;
  const pendingDeposits = f.requests.reduce((s, r) => s + (r.kind === 'deposit' ? r.amount : 0), 0);
  const pendingRedeemUnits = f.requests.reduce((s, r) => s + (r.kind === 'redeem' ? r.units : 0), 0);
  const positions = acct
    ? Object.entries(acct.positions)
      .filter(([, p]) => Math.abs(p.qty) > 1e-9)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([assetId, p]) => ({ assetId, qty: p.qty, value: p.qty * priceOf(g, assetId) }))
    : [];
  return {
    id: f.id,
    name: f.name,
    status: f.status,
    createdTick: f.createdTick,
    mandate: { classes: [...f.mandate.classes], maxLeverage: f.mandate.maxLeverage, maxPositionPct: f.mandate.maxPositionPct },
    pendingMandate: f.pendingMandate
      ? {
        mandate: { ...f.pendingMandate.mandate, classes: [...f.pendingMandate.mandate.classes] },
        remainingTicks: Math.max(0, f.pendingMandate.effectiveTick - g.market.tick),
      }
      : null,
    fees: { ...f.fees },
    navPerUnit: px,
    nav,
    cash: acct?.cash ?? 0,
    positions,
    stake,
    stakeFloor: Math.max(FUND_RULES.stakeMinPct * nav, FUND_RULES.managerMinStake),
    aumCap: FUND_RULES.aumPerStake * stake,
    youngAumCap: young ? FUND_RULES.youngAumCap : null,
    feeAccrued: f.feeAccrued,
    feePayable: f.feePayable,
    highWaterMark: f.hwm,
    breakerRemainingTicks: Math.max(0, f.breakerUntil - g.market.tick),
    frozen: f.status === 'frozen',
    windDownRemainingTicks: f.status === 'frozen' && f.frozenTick !== null
      ? Math.max(0, f.frozenTick + FUND_TIME.windDownDays * TPD - g.market.tick)
      : null,
    winding: f.status === 'winding',
    caseOpen: f.caseId !== null,
    evidence: f.evidence,
    harm: f.harm,
    gain: f.gain,
    filings: f.filings.map((x) => ({ ...x, day: dayOfTick(x.tick) })),
    convicted: fundsOf(g).convicted[pid] !== undefined,
    pendingDeposits,
    pendingRedeemUnits,
    aumBucket: aumBucketOf(Math.max(0, nav)),
  };
}

/** One real day in ticks: a real hour is one game day (720 ticks), so a real day is 24 of them. */
const REAL_DAY_TICKS = 24 * FUND_TICKS_PER_DAY;

/** The game day a fund filing or NAV point falls on (the screens show days, never ticks). */
export function dayOfTick(tick: number): number {
  return Math.max(0, Math.floor((tick - 1) / TPD));
}

/** A fee as the form types it (percent) and as the world stores it (a fraction of the amount). */
export function feePercentOf(fraction: number): number {
  return fraction * 100;
}

export function feeFractionOf(percent: number): number {
  return percent / 100;
}

/** The fund rules, read from the content config the world enforces. The screens show these limits, they do not restate them. */
export function fundRules(): FundRules {
  return {
    minDeposit: FUND_RULES.minDeposit,
    redeemGatePct: FUND_RULES.redeemGatePct,
    earlyExitFeePct: FUND_RULES.earlyExitFeePct,
    investorMaxNwPct: FUND_RULES.investorMaxNwPct,
    mgmtFeeMax: FUND_RULES.mgmtFeeMax,
    perfFeeMax: FUND_RULES.perfFeeMax,
    mgmtFeeMaxPct: feePercentOf(FUND_RULES.mgmtFeeMax),
    perfFeeMaxPct: feePercentOf(FUND_RULES.perfFeeMax),
    custodyFeePerYear: FUND_RULES.custodyFeePerYear,
    stakeMinPct: FUND_RULES.stakeMinPct,
    managerMinStake: FUND_RULES.managerMinStake,
    aumPerStake: FUND_RULES.aumPerStake,
    youngAumCap: FUND_RULES.youngAumCap,
    youngFundTicks: FUND_TIME.youngFundTicks,
    leverageMax: FUND_RULES.leverageMax,
    positionMaxPct: FUND_RULES.positionMaxPct,
    insiderPositionMaxPct: FUND_RULES.insiderPositionMaxPct,
    classes: FUND_RULES.classes,
    mandateNoticeTicks: FUND_TIME.mandateNoticeTicks,
    earlyExitTicks: FUND_TIME.earlyExitTicks,
    investorAgeTicks: FUND_TIME.investorAgeTicks,
    managerAgeTicks: FUND_TIME.managerAgeTicks,
    managerMinRank: FUND_RULES.managerMinRank,
    breakerDropPct: FUND_RULES.breakerDropPct,
    absentFreezeTicks: FUND_TIME.absentFreezeTicks,
    windDownDays: FUND_TIME.windDownDays,
    ticksPerDay: FUND_TICKS_PER_DAY,
    earlyExitRealDays: FUND_TIME.earlyExitTicks / REAL_DAY_TICKS,
    investorAgeRealDays: FUND_TIME.investorAgeTicks / REAL_DAY_TICKS,
    youngFundRealDays: FUND_TIME.youngFundTicks / REAL_DAY_TICKS,
    managerAgeGameDays: FUND_TIME.managerAgeTicks / FUND_TICKS_PER_DAY,
    mandateNoticeRealHours: FUND_TIME.mandateNoticeTicks / FUND_TICKS_PER_DAY,
    absentFreezeRealHours: FUND_TIME.absentFreezeTicks / FUND_TICKS_PER_DAY,
    convictionRealWeeks: FUND_TIME.eightWeeksTicks / (7 * REAL_DAY_TICKS),
  };
}


/** The viewer's opening check: the first rule a new fund at the minimum stake fails, or null. */
export function openingRefusal(g: GameState, pid: string): FundRefusal | null {
  const p = g.players[pid];
  if (!p) return 'fundNotManager';
  return managerRefusal(g, p, FUND_RULES.managerMinStake);
}

/** The whole Exchange view for one player. Built once per tick into `PlayerView.exchange`. */
export function exchangeView(g: GameState, pid: string): ExchangeView {
  const day = today(g);
  const fs = fundsOf(g);
  const ban = fs.bans[pid];
  const convicted = fs.convicted[pid];
  const holdings = holdingsOf(g, pid);
  return {
    day,
    stocks: listedStocks(g, day),
    ipos: openIpos(g, pid, day),
    funds: publicFunds(g).map((f) => ({ ...f, filings: f.filings.map((x) => ({ ...x, day: dayOfTick(x.tick) })) })),
    holdings,
    holdingsValue: holdings.reduce((s, h) => s + h.value, 0),
    managed: managedView(g, pid),
    opening: { refusal: openingRefusal(g, pid), cash: spendableCash(g, pid) },
    banRemainingTicks: ban !== undefined ? Math.max(0, ban - g.market.tick) : 0,
    convictedRemainingTicks: convicted !== undefined ? Math.max(0, convicted + FUND_TIME.eightWeeksTicks - g.market.tick) : 0,
    rules: fundRules(),
  };
}
