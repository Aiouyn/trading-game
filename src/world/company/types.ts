import type { RngState } from '@/engine';
import type { CompanyRole, CompanySector, CompanyTierId, InvestorKind } from '@/content/company';

/**
 * Company world state (quant-company-building v1.7, stage A3). Lives in GameState.companies, which is absent in old
 * saves (they load with an empty world). Everything here is private to the world layer; the screens read only the
 * CompanyPublic view (views.ts), and CompanyFounderView only inside the founder's own Company app.
 */

export type CompanyReject =
  | { code: 'notRank'; minRank: string }
  | { code: 'capitalTooLow'; minCapital: number }
  | { code: 'alreadyFounded' }
  | { code: 'insufficientFunds'; shortfall: number }
  | { code: 'unknownCompany' }
  | { code: 'notFounder' }
  | { code: 'headcountCap'; cap: number }
  | { code: 'notEnoughStaff'; role: CompanyRole; have: number }
  | { code: 'noRdStaff' }
  | { code: 'projectBusy' }
  | { code: 'productCap'; cap: number }
  | { code: 'unknownProduct' }
  | { code: 'priceOutOfBand'; min: number; max: number }
  | { code: 'negativeAmount' }
  | { code: 'roundDilutionCap'; maxAmount: number }
  | { code: 'investorCash'; available: number }
  | { code: 'noValuation' }
  | { code: 'plantBuilding'; untilDay: number }
  | { code: 'unknownAction' };

export type CompanyRejectCode = CompanyReject['code'];

export type ProjectKind = 'quality' | 'cost' | 'nextgen';

export interface Product {
  id: string;
  name: string;
  /** quality level q (a ratio against the frontier Q_f) */
  q: number;
  /** product generation (next-gen projects bump it and reset the diminishing-returns count k) */
  generation: number;
  /** prior quality successes on this generation: k in the gain formula (§3) */
  k: number;
  price: number;
  /** marketing spend per gd on this product, in $ (§2, M_j) */
  marketing: number;
  /** brand term in the logit (§4): -0.02 per stockout day, recovering at 0.01 per gd */
  brand: number;
  /** patents: each active grant pauses NPC imitation of its ln gain until `until` */
  patents: { until: number; lnGain: number }[];
  /** units shipped the last game day (for the share read-out) */
  lastShare: number;
}

export interface Project {
  id: string;
  kind: ProjectKind;
  productId: string;
  /** total spend and per-gd spend over the duration (§3) */
  spend: number;
  spendPerDay: number;
  startDay: number;
  endDay: number;
  /** the outcome is drawn at start from the company's rd stream (§3, N11) */
  success: boolean;
  /** z in U(-1, 1) for the quality gain */
  z: number;
  /** the shown band at launch: p and dq at bear/base/bull */
  pShown: number;
  /** the realised pharma gates (three booleans) when kind is quality on pharma, else [] */
  gates: boolean[];
}

export interface Staff {
  /** seated heads (wages paid on these) */
  total: number;
  /** heads that have filled and are still ramping: [readyDay, count] pairs */
  ramping: { readyDay: number; n: number }[];
}

export interface HirePipeline {
  role: CompanyRole;
  n: number;
  fillDay: number;
}

export interface Npc {
  id: string;
  /** ln quality (imitates the leader at half-life 126 gd) */
  lnQ: number;
  price: number;
  marketing: number;
  /** quarters with negative margin in a row (exit after 2) */
  negQuarters: number;
}

export interface Order {
  id: string;
  productId: string;
  /** booked units */
  qty: number;
  /** units NPCs cancel: floor(c_s * qty), fixed at booking (G17, deterministic) */
  npcCut: number;
  /** booked unit price and the variable cost per unit on the booking day (contribution, v1.6) */
  price: number;
  vc: number;
  bookedDay: number;
  shipBy: number;
  /** units shipped so far (ships FIFO, after the NPC cut) */
  shipped: number;
  /** the signal index that first reported this order, and its lift l_o = sens * cm (-1 when not yet reported) */
  reportedSig: number;
  lift: number;
}

/** A resolved order, kept until the next filing for the excess-lift computation (G16, G17, CB-077). */
export interface Resolved {
  qty: number;
  shipped: number;
  cs: number;
  lift: number;
  reportedSig: number;
}

export interface Ledger {
  day: number;
  reason: string;
  /** signed cash flow: positive is into the company */
  amount: number;
}

/** Frozen quarterly statements (§6.1): computed at the close tick and hashed, never changed after. */
export interface Statements {
  quarter: number;
  periodCloseDay: number;
  revenue: number;
  cogs: number;
  opex: number;
  ebitda: number;
  da: number;
  ebit: number;
  tax: number;
  netIncome: number;
  /** adjusted net income: no one-offs exist in A3, so NI_adj = NI */
  niAdj: number;
  ocf: number;
  capex: number;
  fcf: number;
  cash: number;
  receivables: number;
  inventory: number;
  payables: number;
  ppe: number;
  equity: number;
  /** retained earnings after this quarter */
  retained: number;
  /** $ open NPC orders and their contribution CB at the close (v1.6) */
  backlog: number;
  backlogContribution: number;
  unitsShipped: number;
  /** filed unit cost: COGS / units shipped (G23) */
  unitCost: number;
  /** headcount at the close */
  heads: number;
  /** units shipped in the quarter and the gross margin used by the valuation (TTM) */
  grossMargin: number;
}

export interface FilingPublic {
  quarter: number;
  periodCloseDay: number;
  filedDay: number;
  hash: string;
  income: { revUnrelated: number; relatedPartyIncome: number; cogs: number; opex: number; ebitda: number; netIncome: number; niAdj: number };
  balance: { cash: number; receivables: number; inventory: number; ppe: number; debt: number; equity: number; retainedEarnings: number };
  /** capex_maint: plant D&A as the maintenance proxy (section 6.4), used by E* = min(NI_adj, OCF - capex_maint) */
  cashFlow: { ocf: number; capex: number; capexMaint: number; fcf: number; dividends: number; buybacks: number };
  headcountBand: string;
  backlog: number;
  backlogContribution: number;
  unitCost: number;
  backlogReversal: { nonConversion: number; baseRate: number; excessLift: number; repayment: number };
}

export interface WeeklySignal {
  day: number;
  /** backed: shipped revenue quarter to date, banded +-5% */
  revenueQtdBand: [number, number];
  /** backed: the run rate (per week) */
  runRateBand: [number, number];
  /** forward: the open-order book, banded +-10% */
  bookingsBand: [number, number];
  netHires: 'up' | 'flat' | 'down';
  utilizationBand: string;
  launches: string[];
  debtDrawn: number;
  backlogContributionBand: [number, number];
  /** the backlog's lnV contribution at this signal (CB_k - CB_{k-1}, others held) */
  backlogLift: number;
}

export interface Consensus {
  /** bias-corrected estimates from public signals only */
  revQtd: number;
  backlog: number;
  backlogContribution: number;
  /** the consensus valuation and its ln, updated at each signal and at each filing */
  v: number;
  lnV: number;
}

export interface NoiseDraw {
  /** the filing count the draw belongs to (one draw per filing, G20) */
  filings: number;
  eRevenue: number;
  eBacklog: number;
}

export interface Listed {
  assetId: string;
  ipoDay: number;
  sharesOut: number;
  floatShares: number;
}

export interface Company {
  id: string;
  name: string;
  ownerId: string;
  sector: CompanySector;
  cityId: string;
  foundedDay: number;
  tier: CompanyTierId;
  /** company cash (may go negative in A3; the default path is in B) */
  cash: number;
  /** paid-in capital and retained earnings: book equity = paidIn + retained */
  paidIn: number;
  retained: number;
  /** loss carryforward for the tax rule (§1) */
  lossCarry: number;
  shares: number;
  /** holder id to shares; the founder is `founder:<playerId>`, investors are their pool ids */
  capTable: Record<string, number>;
  staff: Record<CompanyRole, Staff>;
  hires: HirePipeline[];
  plantLevel: number;
  plantBuildUntil: number | null;
  plantCapex: number;
  ppe: number;
  products: Product[];
  /** cost efficiency: unit material cost times (1 - eff) (§1, cost projects) */
  eff: number;
  projects: Project[];
  projSeq: number;
  /** the company's own market: its frontier, its NPC rivals and the sector shock level at founding */
  frontierLn: number;
  npcs: Npc[];
  npcSeq: number;
  /** sector factor level F_s at founding, and the oil log move at founding (for the input index) */
  sectorBase: number;
  oilBase: number;
  /** the demand scale for this market */
  d0: number;
  orders: Order[];
  orderSeq: number;
  resolved: Resolved[];
  /** balances of the working-capital accounts (asset side, not cash) */
  ar: number;
  inv: number;
  ap: number;
  /** the quarter in progress: accumulators, reset at each close */
  qtd: {
    startDay: number;
    revenue: number;
    cogs: number;
    opex: number;
    da: number;
    ocf: number;
    capex: number;
    units: number;
    matCogs: number;
    overtime: number;
    rdSpend: number;
    marketing: number;
  };
  closed: Statements[];
  filings: FilingPublic[];
  /** frozen statements awaiting their filing day */
  pendingFile: { statements: Statements; hash: string; filingDay: number } | null;
  filingCount: number;
  signals: WeeklySignal[];
  noise: NoiseDraw | null;
  consensus: Consensus | null;
  /** CB at the last filing, for dCB (G16) */
  cbFiled: number;
  /** utilization of the last game day (shipped over capacity), for the booking cost and the signal band */
  lastUtil: number;
  /** headcount at the last signal, for the net-hire read */
  headsAtSignal: number;
  /** signal index counter, for the reportedSig field */
  signalSeq: number;
  /** sens and fair at the last signal (internal: the engine's value source reads them in A2) */
  lastSens: number;
  lastFair: number;
  /** per-signal records for the repayment (G16): fair_k, sens_k and the lift, the last 40 signals */
  sigLog: { idx: number; day: number; fair: number; sens: number; lift: number }[];
  /** cumulative shipped revenue, for the goals */
  revenueTotal: number;
  /** listing is an A2/B step; here only so the public view and the signal path can read it */
  listed: Listed | null;
  rng: { rd: RngState; sig: RngState; npc: RngState };
  /** founder goals (C4): reached-day per goal id */
  goalsDone: Record<string, number>;
  /** distress flag: cash below zero at the last close */
  distress: boolean;
  ledger: Ledger[];
  ledgerTotals: Record<string, number>;
}

export interface InvestorPool {
  id: string;
  kind: InvestorKind;
  cash: number;
}

export interface CompanyFlows {
  /** money created by the world: NPC customers paying the company */
  faucet: number;
  /** money that left the world: wages, marketing, R&D, tax, severance, capex and materials */
  sink: number;
}

export interface CompanyWorld {
  companies: Record<string, Company>;
  seq: number;
  investors: Record<string, InvestorPool>;
  /** cumulative unit sector shock per sector (F_s), and its own stream (G22 reading) */
  sectors: Record<CompanySector, { level: number; rng: RngState }>;
  flows: CompanyFlows;
  /** the cash the founders put in at founding (the in-world transfers are checked against this) */
  founded: number;
}
