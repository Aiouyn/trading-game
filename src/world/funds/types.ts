import type { Side } from '@/engine';

/**
 * Player-run funds (ROADMAP 2.2). The fund is a separate engine account (its custody at the Clearing House). The manager
 * trades it; only the fund's own holders (their units, at NAV) and the manager's crystallized fees ever leave it.
 * Plain data: it rides in GameState and in the snapshot. Units are fractions; money is dollars.
 */

export type FundStatus = 'open' | 'frozen' | 'winding' | 'closed';

export interface FundMandate {
  /** asset classes the fund may trade (a non-empty subset of content FUND_RULES.classes) */
  classes: string[];
  /** gross exposure at most this multiple of equity (1 = cash only) */
  maxLeverage: number;
  /** one position at most this share of NAV */
  maxPositionPct: number;
}

export interface FundFees {
  /** management fee per game year, accrued daily on NAV and crystallized at each quarter */
  mgmt: number;
  /** performance fee over the high-water mark, crystallized at each quarter */
  perf: number;
}

export interface FundRequest {
  id: string;
  kind: 'deposit' | 'redeem';
  investorId: string;
  /** a deposit: the dollars put in */
  amount: number;
  /** a redemption: the units still to redeem (they stay reserved until a day close pays them, or the gate defers them) */
  units: number;
  /** the tick the request was made */
  tick: number;
}

export interface PendingMandate {
  mandate: FundMandate;
  effectiveTick: number;
}

/** The public NAV history: one point per game day. */
export interface NavPoint {
  day: number;
  navPerUnit: number;
  aum: number;
}

/** A public filing: the fund holds an insider or a 1%-of-float asset, capped at 5% of NAV. */
export interface FundFiling {
  assetId: string;
  tick: number;
  pct: number;
}

/** A manager fill kept for the front-running check (one game day). */
export interface ManagerFill {
  assetId: string;
  side: Side;
  tick: number;
  price: number;
  qty: number;
}

export interface Fund {
  id: string;
  name: string;
  managerId: string;
  /** the engine account key of the fund (custody) */
  accountId: string;
  createdTick: number;
  mandate: FundMandate;
  pendingMandate: PendingMandate | null;
  fees: FundFees;
  status: FundStatus;
  /** the tick trading froze for absence (null when open) */
  frozenTick: number | null;
  /** the tick the wind-down began */
  windDownTick: number | null;
  /** units held, by holder id (the manager's stake is a holder too) */
  holders: Record<string, number>;
  /** units held back for redemption requests: still outstanding, still in NAV, not transferable */
  reserved: Record<string, number>;
  /** redemption payouts owed and not yet paid (a liability until paid from fund cash), by holder id */
  payable: Record<string, number>;
  /** the management fee accrued since the last quarter (a liability; the manager's claim) */
  feeAccrued: number;
  /** crystallized fees owed to the manager and not yet paid (a liability) */
  feePayable: number;
  /** the high-water mark of NAV per unit (performance fees are charged above it) */
  hwm: number;
  /** NAV per unit at the last day close (the fallback when no units are outstanding) */
  navPerUnit: number;
  requests: FundRequest[];
  reqSeq: number;
  /** the tick each holder's latest deposit settled (the early-exit window) */
  depositedTick: Record<string, number>;
  /** the drawdown breaker: new trades are refused until this tick */
  breakerUntil: number;
  navHist: NavPoint[];
  /** the last game day this fund was processed at a day close */
  lastDay: number;
  /** the manager's personal fills in the last game day, for the front-running check */
  managerFills: ManagerFill[];
  filings: FundFiling[];
  /** the open court case over front-running, or null */
  caseId: string | null;
  /** front-running evidence points and the harm (the fund's loss against the manager's personal price) */
  evidence: number;
  harm: number;
  /** the custody counters: every dollar the manager has received from fund cash, and every dollar owed to him (his own units' redemption value and his crystallized fees) */
  managerReceived: number;
  managerEntitled: number;
  /** cumulative value credited to each payee as owed (redemption settlements), and cumulative cash paid to each (never more than credited) */
  credited: Record<string, number>;
  paidOut: Record<string, number>;
}

export interface FundsState {
  funds: Record<string, Fund>;
  seq: number;
  /** a manager's fund-management ban (S5), in ticks: no new fund until then */
  bans: Record<string, number>;
  /** the tick of a manager's last fund-abuse conviction (no fund within 8 weeks of it) */
  convicted: Record<string, number>;
}

/** Refusal codes: a command that fails returns one of these as its error; the copy lives in en.json and fr.json (funds.refusal.*). */
export type FundRefusal =
  | 'fundNoFund' | 'fundNotManager' | 'fundTerms' | 'fundRank' | 'fundAge' | 'fundBanned' | 'fundConviction' | 'fundOwnsOne'
  | 'fundStake' | 'fundCash' | 'fundClosed' | 'fundFrozen' | 'fundBreaker' | 'fundMandate' | 'fundLeverage' | 'fundPosition'
  | 'fundInsiderCap' | 'fundSelfMatch' | 'fundOrderRejected' | 'fundDeposit' | 'fundInvestorAge' | 'fundInvestorLink'
  | 'fundInvestorLimit' | 'fundStakeLow' | 'fundAumCap' | 'fundRedeem' | 'fundMandateInvalid' | 'fundTradeInvalid';

/** The fund's public view: everything except the investor list. */
export interface FundPublic {
  id: string;
  name: string;
  managerHandle: string;
  status: FundStatus;
  mandate: FundMandate;
  pendingMandate: { mandate: FundMandate; effectiveTick: number } | null;
  fees: FundFees;
  navPerUnit: number;
  navHistory: { day: number; navPerUnit: number }[];
  /** an AUM bucket index into FUND_RULES.aumBuckets (0 = below the first bucket) */
  aumBucket: number;
  filings: FundFiling[];
  convicted: boolean;
}
