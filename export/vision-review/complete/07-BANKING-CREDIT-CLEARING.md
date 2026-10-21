# 07 — Banking, Credit and Clearing

Owner module: 07. Status: complete specification, 2026-10-18.
Depends on: 02 (clock, pipeline, RNG), 03 (ledger, chart of accounts, reason codes, consolidation), 04 (policy rates, corridor, reserve requirements, macro state, central-bank decisions), 05 (order submission, ADV, marks, volatility), 06 (instrument definitions, prices, ONR consumers, credit model), 08 (money market funds, funds as clients, ratings), 09 (company financials, covenants, LBO structures, corporate actions), 10 (mortgage origination, property sales, house prices), 12 (abstract attacks on banks), 13 (regulators, courts, sanctions, garnishment), 14 (ranks), 15 (contracts, filings, collusion graph), 16 (NPC actors, rumors, news), 22 (names).

All institutions are fictional (L6).

---

## §1 Purpose

This module is the **plumbing of money and leverage**: where every unit of cash actually sits, how banks create credit and destroy it, how they fund themselves, how confidence in them rises and collapses, how they fail and are resolved, how leverage is extended to traders (broker margin, prime brokerage, repo, securities lending), and how the Clearing House stands between counterparties, collects margin and absorbs defaults through a waterfall.

It gives the game its systemic layer (V3 §3.1, §3.3, §3.4):
- **Credit cycles are caused**: lending standards loosen in booms and tighten in busts as bank capital and losses move (§3.5).
- **Bank runs are feedback loops** fed by losses, rumors and other runs, stoppable by central-bank liquidity, deposit-insurance action, recapitalization or a rescue merger, and they leave a permanent record (§3.9).
- **Procyclical margin** turns a volatility spike into forced deleveraging, which is the cleanest cascade in the game (§3.15, §3.16).
- **The default waterfall** gives large players mutualized, "too big to fail" risk (§3.17).
- **Players can run banks** (§3.11): earn net interest margin, carry duration, credit and run risk, and fail for real.

Design laws:
1. Money is either **settlement cash** (a direct claim on a central bank, 03 account 1001: the default, risk-free money of every non-bank, earning nothing unless 04 pays on it), a **bank deposit** (03 account 1010, a claim on a bank: earns interest, carries the bank's risk), or a bank's **reserves** (1002). The payment rail between them is 03's (03 §3.3.4); this module owns everything about banks and deposits. In this module `fear = F / 100`, F = 04's Fear Index (04 §3.14.1).
2. A loan creates a deposit (`CREDIT_CREATE`); a repayment destroys one (`CREDIT_DESTROY`). Base money (M0) changes only through 03 faucets and sinks and 04 central-bank operations.
3. Liquidations and close-outs use fair-value price bands, never a crashed print (01 §9).
4. Nothing reveals an individual player's positions or strategy (L11). Systemic dashboards publish aggregates only.

**Status of numbers:** every `PARAM.*` value in this module, and every choice tagged `DEFAULT`, is `DEFAULT (Mathis may override)`. Locked decisions L1–L15 (00) and the 00 time model are not defaults. The full list is in `_notes/07-notes.md`.

---

## §2 Entities

### §2.1 Banks

```ts
type BankTier = 'NPC_SIB' | 'NPC_COMMERCIAL' | 'NPC_REGIONAL' | 'NPC_PRIVATE' | 'COMMUNITY' | 'COMMERCIAL' | 'UNIVERSAL';
type BankStatus = 'ACTIVE' | 'WATCH' | 'RESTRICTED' | 'IN_RESOLUTION' | 'RESOLVED' | 'LIQUIDATED';

interface Bank {                         // entity kind 'bnk' (00 §5.3); balance sheet lives in 03
  id: string; nameKey: string;
  ownerId: string;                       // chr, cmp, npc or gov (ownership chain per 03)
  isPlayerBank: boolean;
  tier: BankTier;
  homeBloc: Ccy; homeCityId: string | null;  // COMMUNITY banks are city-bound
  branchBlocs: Ccy[];                    // UNIVERSAL may branch into several blocs
  status: BankStatus;
  isSib: boolean; sibSurchargeBps: number;
  isClearingMember: boolean; isPrimeBroker: boolean; isPrimaryDealer: boolean; isCustodian: boolean;
  strategy: NpcBankStrategy | null;      // §6.1, null for player banks
  policy: BankPolicy;                    // §2.2
  confidence: ConfidenceState;           // §3.9
  standards: number;                     // lending standards S in [0,1], §3.5.3
  metrics: BankMetrics;                  // cached each day close
  publishedMetrics: BankMetrics | null;  // last quarterly public filing (15)
  branches: number;                      // drives deposit attractiveness and opex
  charterGrantedTick: number;
  history: BankHistoryEntry[];           // permanent public record (runs, failures, rescues, sanctions)
}

interface BankMetrics {
  totalAssets: bigint; rwa: bigint; cet1: bigint; tier1: bigint; totalCapital: bigint;
  cet1Ratio: number; leverageRatio: number; lcr: number; nsfr: number;
  reserves: bigint; hqla: bigint; deposits: bigint; insuredDeposits: bigint;
  loanBook: bigint; provisions: bigint; nplRatio: number;
  nim30d: number; roe30d: number; costIncome30d: number;
  cbFacilityUse: bigint; interbankBorrowed: bigint; interbankLent: bigint;
  largestExposureFrac: number; durationGapYears: number;
}

interface BankPolicy {                   // NPC banks set it from strategy; player banks set it by intent
  depositRates: { SIGHT: number; SAVINGS: number; TERM_7: number; TERM_28: number; TERM_91: number }; // as spread to policy rate
  loanSpreadGrid: Record<CreditGrade, number>;           // bps over funding index, per grade
  productLimits: Record<LoanKind, { enabled: boolean; maxLtv: number; maxTermDays: number; maxPerBorrower: bigint }>;
  sectorLimits: Record<string, number>;                  // max fraction of loan book per segment
  cet1Target: number; hqlaTargetFrac: number; lcrTarget: number;
  dividendPayout: number;                                // of earnings when above target
  interbankMode: 'AUTO' | 'MANUAL'; interbankPdTolerance: number;
  hedgeRatio: number;                                    // fraction of duration gap hedged with OIS (06)
  runPlaybook: RunPlaybookStep[];                        // ordered automatic actions in a run, §3.9.5
  relatedPartyLimitFrac: number;                         // capped by regulation at 0.05 of tier1
}

interface NpcBankStrategy { archetype: 'CONSERVATIVE' | 'BALANCED' | 'GROWTH' | 'INVESTMENT' | 'REGIONAL';
  cet1BufferOverReq: number; hqlaTarget: number; loanGrowthTarget: number; pdTolerance: number; tradingBookMaxFrac: number; } // §6.1
interface RunPlaybookStep { step: 'USE_EXCESS' | 'INTERBANK' | 'REPO_HQLA' | 'SELL_HQLA' | 'MLF' | 'ELA' | 'SELL_LOANS' | 'RAISE_DEPOSIT_RATES' | 'INJECT_CAPITAL';
  maxAmount: bigint | null; maxFracOfAssets: number | null; } // executed in order, §3.9.4

interface BankHistoryEntry { tick: number; kind: 'CHARTERED' | 'RUN' | 'ELA' | 'FAILED' | 'RESCUED' | 'BAIL_IN' | 'LIQUIDATED' | 'SANCTION' | 'RECAPITALIZED' | 'SIB_DESIGNATED'; summaryKey: string; refs: string[]; }
```

### §2.2 Deposits, payments, insurance

```ts
type DepositKind = 'SIGHT' | 'SAVINGS' | 'TERM';
interface DepositAccount {               // a liability line of the bank in 03; balance is the 03 account balance
  accountId: string; bankId: string; holderId: string;  // holder: any entity except the bank itself
  kind: DepositKind; ccy: Ccy;
  rate: number;                          // annual, fixed at opening for TERM, floating otherwise
  termMaturityTick: number | null;
  frozenUntilTick: number | null;        // resolution freeze, court order (13)
  isHome: boolean;                       // the account that receives income by default
  sweep: { targetBalance: bigint; destination: 'MMF' | 'TBILL' | 'NONE'; fundId: string | null } | null; // 08
}

interface ReserveAccount { cbId: string; bankId: string; ccy: Ccy; balance: bigint; intradayCreditLimit: bigint; }

interface DepositInsuranceScheme {       // one per bloc; held by the bloc's gov entity
  bloc: Ccy; fundBalance: bigint; targetFrac: number;   // of insured deposits
  capPerDepositor: bigint;               // per beneficial-owner group per bank
  baseRateBps: number;                   // annual premium on insured deposits
  backstopLineFromTreasury: bigint;      // 04 fiscal backstop
}
```

### §2.3 Loans, collateral, covenants, credit profiles

```ts
type LoanKind =
  | 'PERSONAL_LINE' | 'LOMBARD' | 'BUSINESS_TERM' | 'REVOLVER' | 'MORTGAGE_RESI' | 'MORTGAGE_COMM'
  | 'CONSTRUCTION' | 'COLLECTIBLE' | 'LBO_SENIOR' | 'LBO_MEZZ' | 'BRIDGE'
  | 'INTERBANK' | 'CB_FACILITY' | 'MARGIN_DEBIT' | 'AGG_HH_MORTGAGE' | 'AGG_HH_CONSUMER' | 'AGG_FRM';
type CreditGrade = 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC' | 'CC' | 'D';
type LoanStatus = 'OFFERED' | 'PERFORMING' | 'WATCH' | 'DELINQUENT' | 'DEFAULTED' | 'RESTRUCTURED' | 'REPAID' | 'WRITTEN_OFF';

interface Loan {
  loanId: string; kind: LoanKind;
  lenderId: string; borrowerId: string;          // AGG_* loans: borrower = hh_<city> or frm_<bloc>
  ccy: Ccy; limit: bigint;                       // committed amount (= principal for term loans)
  outstanding: bigint; accruedInterest: bigint;
  rateType: 'FIXED' | 'FLOAT'; fixedRate: number | null;
  floatIndex: 'ONR' | null; spreadBps: number; penaltyBps: number;   // penalty applies while DELINQUENT
  amortization: 'BULLET' | 'ANNUITY' | 'LINEAR' | 'IO_THEN_ANNUITY' | 'REVOLVING';
  ioPeriodDays: number; paymentFreqDays: number; termDays: number;
  originatedTick: number; maturityTick: number; nextPaymentTick: number;
  scheduledPayment: bigint;
  collateral: string[];                          // CollateralPledge ids
  covenants: Covenant[];
  status: LoanStatus; daysPastDue: number;
  stage: 1 | 2 | 3; provision: bigint;           // expected credit loss, §3.3.7
  commitmentFeeBps: number;                      // on undrawn REVOLVER / lines
  originatorModule: '07' | '09' | '10';          // who structured it (mortgages: 10; LBO: 09)
  contractId: string | null;                     // if created through a 15 P2P loan contract
}

interface CollateralPledge {
  pledgeId: string; pledgorId: string; securedPartyId: string;
  asset: { kind: 'SECURITY'; assetId: string; qty: bigint }
       | { kind: 'PROPERTY'; propId: string }
       | { kind: 'BUSINESS'; bizId: string }
       | { kind: 'COLLECTIBLE'; itemId: string }
       | { kind: 'CASH'; accountId: string; amount: bigint }
       | { kind: 'RECEIVABLES'; entityId: string; frac: number };   // business revenue assignment
  lienRank: number;                               // 1 = first lien
  haircut: number;                                // from §3.15.6 at pledge time, re-evaluated daily
  createdTick: number; releasedTick: number | null;
}

interface Covenant {
  kind: 'MAX_LTV' | 'MIN_DSCR' | 'MAX_NET_LEVERAGE' | 'MIN_INTEREST_COVER' | 'MIN_LIQUIDITY' | 'CHANGE_OF_CONTROL' | 'NEGATIVE_PLEDGE' | 'MIN_CET1';
  threshold: number; testEveryDays: number; cureDays: number;
  onBreach: 'RATE_STEP_100' | 'CASH_SWEEP_50' | 'ACCELERATE' | 'WAIVER_FEE_1PCT';
  lastTestTick: number; breachedSinceTick: number | null;
}

interface CreditProfile {                         // per chr and per cmp; the shared "credit bureau"
  entityId: string; score: number;                // 0–1000
  grade: CreditGrade; pd1y: number;
  totalDebt: bigint; debtService30d: bigint; income30d: bigint;
  onTimePayments: number; latePayments: number; defaults: { tick: number; amount: bigint }[];
  activeJudgments: bigint; bankruptcyTick: number | null; clearingDebt: bigint;
  updatedTick: number;
}
```

### §2.4 Interbank and fixings

```ts
interface InterbankOrder { bankId: string; bloc: Ccy; side: 'LEND' | 'BORROW'; amount: bigint; limitRate: number; hourTick: number; }
interface InterbankHourResult { bloc: Ccy; hourTick: number; volume: bigint; vwapRate: number; refusedBorrowers: string[]; }
interface OnrFixing { bloc: Ccy; dayIndex: number; rate: number; volume: bigint; fallback: boolean; }
```

### §2.5 Confidence, runs, resolution

```ts
interface ConfidenceState {
  C: number;                               // [0,1]
  target: number;
  components: { capital: number; equity: number; cds: number; rumor: number; contagion: number; stigma: number; outflow: number };
  outflow24h: number;                      // fraction of deposits withdrawn in last 720 ticks
  inRun: boolean; runStartTick: number | null;
}

interface Resolution {
  resolutionId: string; bankId: string;
  trigger: 'SOLVENCY' | 'LIQUIDITY' | 'REGULATOR';
  openedTick: number;
  valuation: { assetsFair: bigint; assetsFireSale: bigint; liabilities: bigint; insuredDeposits: bigint };
  candidateTools: ('PNA' | 'BAIL_IN' | 'LIQUIDATION' | 'OPEN_BANK_ASSIST')[];
  auction: { closesTick: number; bids: ResolutionBid[] } | null;
  chosenTool: Resolution['candidateTools'][number] | null;
  costToDgf: bigint | null;
  outcome: { acquirerId: string | null; bailInByClass: Record<string, number>; payoutTick: number } | null;
  status: 'OPEN' | 'AUCTION' | 'EXECUTING' | 'CLOSED';
}
interface ResolutionBid { bidderId: string; package: 'WHOLE_BANK' | 'DEPOSITS_AND_PERFORMING' | 'DEPOSITS_ONLY'; price: bigint; capitalInjection: bigint; }
```

### §2.6 Repo, securities lending, prime brokerage

```ts
type RepoVenue = 'CCP_GC' | 'CCP_SPECIFIC' | 'TRIPARTY' | 'BILATERAL';
interface RepoTrade {
  repoId: string; venue: RepoVenue;
  cashLenderId: string; cashBorrowerId: string;   // CCP_* venues: both legs face 'ccp_TCH'
  collateral: { assetId: string; qty: bigint }[]; basket: 'GOVT_<BLOC>' | 'IG' | 'EQUITY' | null;
  cash: bigint; ccy: Ccy; rate: number; haircut: number;
  startTick: number; endTick: number | null;      // null = open (rolls daily until terminated)
  reuseAllowed: boolean;                          // title transfer allows re-use (BILATERAL, CCP)
  lastMarginTick: number; status: 'LIVE' | 'CALLED' | 'CLOSED' | 'DEFAULTED';
}

interface LendablePool {                          // per asset
  assetId: string; lendable: bigint; onLoan: bigint; utilization: number; feeRate: number;
  contributors: { holderId: string; qty: bigint; share: number }[];  // lenders incl. players who opted in
}
interface SecLoan {
  slId: string; assetId: string; borrowerId: string; qty: bigint;
  agentId: string;                                // custodian bank or prime broker running the pool
  feeRate: number;                                // floating, repriced daily
  collateralKind: 'CASH' | 'SECURITIES' | 'MARGIN_ACCOUNT';
  openedTick: number; recallNoticeTick: number | null; recallDueTick: number | null;
  status: 'OPEN' | 'RECALLED' | 'RETURNED' | 'BOUGHT_IN';
}
interface Locate { locateId: string; borrowerId: string; assetId: string; qty: bigint; tick: number; }  // valid for one tick

interface PrimeBrokerageAccount {
  pbAccountId: string; primeBrokerId: string; clientId: string;
  tier: 'A' | 'B' | 'C';
  marginModel: 'PORTFOLIO';
  debitBalance: bigint; shortCredit: bigint;
  segregatedAssets: { assetId: string; qty: bigint }[];
  rehypothecated: { assetId: string; qty: bigint }[];   // ≤ 140% of debit by value
  financingSpreadBps: number; shortRebateSpreadBps: number;
  lockupNoticeTicks: number;                        // margin terms cannot worsen faster than this
  terminationEvents: string[];
  status: 'ACTIVE' | 'CALL' | 'TERMINATING' | 'CLOSED';
}
```

### §2.7 Margin and the Clearing House

```ts
type MarginAccountType = 'CASH' | 'RETAIL_MARGIN' | 'PORTFOLIO' | 'MEMBER_HOUSE' | 'MEMBER_CLIENT_OMNIBUS' | 'MEMBER_CLIENT_ISA';
interface MarginAccount {
  accountId: string; ownerId: string; type: MarginAccountType;
  clearingMemberId: string;                       // the member that faces the CCP for this account
  service: 'LD' | 'OTC' | 'CDS' | 'REPO' | 'CRY' | 'BROKER';
  collateral: { assetId: string; qty: bigint; valueAfterHaircut: bigint }[];
  cash: bigint; equity: bigint; im: bigint; mm: bigint;
  imComputedTick: number;
  status: 'OK' | 'CALL' | 'LIQUIDATING' | 'DEFICIT' | 'CLOSED';
  openCallId: string | null;
}
interface MarginCall { callId: string; accountId: string; amount: bigint; issuedTick: number; dueTick: number; status: 'OPEN' | 'MET' | 'FAILED'; }

interface CcpService {
  serviceId: 'LD' | 'OTC' | 'CDS' | 'REPO' | 'CRY';
  imModel: 'SCAN' | 'HVAR'; mporTicks: number; confidence: number; apcStressWeight: number;
  defaultFund: bigint | null;                      // null for CRY
  insuranceFund: bigint | null;                    // CRY and retail
  sitg1: bigint; sitg2: bigint;
  members: string[]; totalIm: bigint;
  lastDfSizingTick: number;
  status: 'OPEN' | 'DEFAULT_MANAGEMENT' | 'RECOVERY' | 'CLOSED';
}
interface ClearingMember {
  memberId: string;                                // bnk or cmp
  services: CcpService['serviceId'][];
  dfContribution: Record<string, bigint>;
  capital: bigint; creditLimitIm: bigint;
  isNpc: boolean; backupForClientsOf: string[];
  status: 'ACTIVE' | 'SUSPENDED' | 'DEFAULTED' | 'WITHDRAWN';
  auctionScores: number[];                         // last 10 auction participations (for juniorization)
}
interface DefaultEvent {
  defaultId: string; defaulterId: string; service: string; declaredTick: number;
  portfolio: { assetId: string; qty: bigint }[];
  ported: string[]; hedges: string[]; lots: AuctionLotCcp[];
  lossByLayer: Record<WaterfallLayer, bigint>;
  status: 'DECLARED' | 'PORTING' | 'HEDGING' | 'AUCTION' | 'ALLOCATING' | 'CLOSED';
}
interface AuctionLotCcp { lotId: string; positions: { assetId: string; qty: bigint }[]; reservation: bigint; bids: { memberId: string; price: bigint }[]; winner: string | null; }
type WaterfallLayer = 'DEFAULTER_IM' | 'DEFAULTER_DF' | 'SITG1' | 'SURVIVOR_DF' | 'SITG2' | 'ASSESSMENT' | 'VMGH' | 'TEAR_UP' | 'INSURANCE_FUND' | 'ADL';

interface ClearingDebt {
  debtId: string; debtorId: string; creditorId: string;   // creditor = clearing member or ccp_TCH
  principal: bigint; outstanding: bigint; ccy: Ccy;
  createdTick: number; rate: number;                      // ONR + 2%
  repaymentShare: number;                                 // of daily net income, 0.30 default
}

interface CsaAgreement {                                   // bilateral OTC collateral terms
  csaId: string; partyA: string; partyB: string;
  thresholdA: bigint; thresholdB: bigint; mta: bigint;
  eligibleCollateral: string[];                            // collateral classes
  bilateralIm: boolean; imModel: 'HVAR_10D' | 'SCHEDULE';
  valuationFreqTicks: number;                              // 720 (daily)
}
```

---

## §3 Rules and formulas

### §3.1 Money, deposits and the payment system

#### §3.1.1 Where money sits
- Every non-bank entity holds settlement cash per currency by default (03 §3.3.4); start cash ($5,000, `ACCT_START_CASH`, 14) arrives as settlement cash. Banks hold reserves at their bloc's central bank (04 `cbk`).
- **Deposits are a choice.** A character or company may open `DepositAccount`s at any ACTIVE bank in a bloc where it has presence (home city, a business, a property, or any holding in that currency) and may hold several; moving settlement cash in or out uses 03's `BNK_DEPOSIT_IN` / `BNK_DEPOSIT_OUT`. The incentive is interest (§3.1.3) and access to credit products (a borrower's loan proceeds arrive as a deposit at the lender, 03 `LEND`); the cost is bank risk (runs, failure, insurance cap). 18 introduces the first savings account just in time; each FDL city has an NPC retail bank (22) suggested as the default.
- An entity may make a deposit account its default paying/receiving account (03 `acct.payment.setAccounts`); 07's `isHome` flag mirrors that setting.
- Aggregate sectors (`hh`, `frm`) hold their deposits at core banks through 03's elastic codes (`BNK_ELASTIC_DEPOSIT_IN/OUT`), which is what NPC deposit flows and run outflows (§3.1.4, §3.9.3) post as.

#### §3.1.2 Payments and settlement
- Payments follow 03's payment rail (03 §3.3.4): deposit-to-deposit across banks moves reserves X → Y; deposit-to-settlement-cash moves reserves out of the bank; same-bank transfers move no reserves. All postings commit in P13.
- **Netting (performance rule, same result):** 03 may net reserve legs per bank per tick; each bank's reserve balance moves by its net amount.
- **Intraday credit:** a bank's reserve balance may be negative during the day down to `intradayCreditLimit` = 100% of the CB-eligible collateral it has pledged to its central bank (after CB haircuts, 04). Payments that would exceed it are queued (FIFO by hash) until reserves arrive, with an alert to the paying entity; queued payments carry into the next tick.
- **End of day (t = 719):** every negative reserve balance is converted into an overnight standing-facility loan (03/04 `CBK_STANDING_FACILITY`) at 04's lending rate (MLFR) against pledged collateral. If collateral is insufficient, the shortfall is a liquidity-failure trigger (§3.10.1).

#### §3.1.3 Deposit pricing and interest
- Deposit rate paid = `policyRate + spread_kind` set by `BankPolicy.depositRates`, floored at 0 for SIGHT and SAVINGS (`PARAM.deposit_rate_floor = 0`, i.e. no negative retail rates, `DEFAULT (Mathis may override)`); when 04 sets a negative deposit facility rate, only corporate deposits above $10M pass it through (04 §edge case 2).
- NPC defaults: SIGHT `0.2 × policy`, SAVINGS `0.6 × policy`, TERM_7 `0.80 × policy`, TERM_28 `0.85 × policy + 0.05%`, TERM_91 `0.90 × policy + 0.10%` (pass-through β).
- Interest accrues on the day-close balance: `interest = balance · rate / 364`, posted at t = 719 (`BNK_DEPOSIT_INTEREST`; elastic depositors `BNK_ELASTIC_DEPOSIT_INTEREST`).
- TERM deposits: principal locked to maturity; early withdrawal forfeits all accrued interest of the term (`PARAM.term_break_penalty = all interest`, never touching principal).
- Retail FX conversion inside a bank (deposit in one currency to another) executes at the 06/05 FX spot mark ± `PARAM.bank_fx_margin = 0.25%` (fee income to the bank). Large conversions should go through the FX market directly (LIC2).

#### §3.1.4 Deposit flows of the NPC economy (market share of deposits)
Aggregate depositors (`hh_<city>`, `frm_<bloc>`, NPC institutions) hold deposits across the banks present in their area. Each game day the target share of bank b in segment g is a logit:
```
u_b = 3.0 · (depositRate_b − avgRate_g) / 0.01  +  0.8 · ln(1 + branches_b)  +  2.0 · (C_b − 0.9)  +  brand_b
target_b = exp(u_b) / Σ exp(u_k)
share_b ← share_b + PARAM.deposit_share_speed (0.02) · (target_b − share_b)     (sticky deposits)
```
Run outflows (§3.9.3) are applied on top of this slow drift. Total segment deposits come from 04/16 (household saving, firm cash) and from credit creation by loans to that segment.

### §3.2 Bank balance sheet, capital and liquidity rules

#### §3.2.1 Risk weights (`PARAM.rw_<class>`)
| Exposure | RW |
|---|---|
| Reserves, cash at CB, own-bloc government bonds and bills | 0% |
| Other blocs' government bonds | 0% (rated AA– or better by 08), 20% (A), 50% (BBB), 100% (below) |
| Interbank loans, reverse repo with CCP | 20% |
| Residential mortgages, LTV ≤ 80% | 35%; LTV > 80%: 75% |
| Commercial real estate, construction | 100%; construction 150% |
| Corporate loans and bonds | grade AAA–A 50%, BBB 75%, BB 100%, B and below 150% |
| Consumer and player personal lines | 75% |
| Player Lombard / collectible loans | 50% / 100% |
| LBO senior / mezz | 150% / 250% |
| Equity holdings, fund units | 250% |
| Securitization tranches (08) | AAA 20%, AA 30%, A 50%, BBB 100%, BB 350%, below / equity tranche 1250% |
| Crypto exposures of any kind | 1250% |
| Defaulted exposures (net of provisions) | 150% |
| Derivatives | counterparty RW × exposure (MTM + 10% notional add-on); cleared at TCH: 2% |

`RWA = Σ RW_i · exposure_i`. Market-risk add-on for trading books: `RWA_mkt = 12.5 · 97.5% ES (10 game days)` of the trading book from 06 marks.

#### §3.2.2 Capital
```
CET1        = paid-in equity + retained earnings − intangibles − deferred tax assets − net losses not yet booked (provisions are booked)
CET1 ratio  = CET1 / RWA
requirement = 4.5% (min) + 2.5% (conservation buffer) + CCyB (04: 0–2.5%) + SIB surcharge (0, 1.0%, 1.5%, 2.0% by size bucket)
leverage ratio = Tier1 / (total assets + 10% of off-balance commitments + derivatives exposure) ≥ 3.0% (SIB 3.5%)
```
Status mapping each day close:
| Condition | Status | Consequence |
|---|---|---|
| CET1 ≥ requirement and leverage OK and LCR ≥ 100% | ACTIVE | — |
| CET1 below requirement but ≥ 4.5% + CCyB/2, or LCR < 100% | WATCH | Maximum distributable amount: dividends and bonuses limited to `0%` (bottom quartile of buffer), `20%`, `40%`, `60%` (top quartile) of earnings |
| CET1 < 4.5% or leverage < 3% | RESTRICTED | No new loans except to cure; no dividends; regulator (13) notified; capital plan due in 3 game days |
| CET1 < `PARAM.bank_failure_cet1 = 2.0%` | Failure trigger | §3.10 |

#### §3.2.3 Liquidity
- **LCR** = HQLA / net stressed outflows over 30 game days ≥ 100%.
  HQLA weights: reserves 100%, own-bloc government 100%, other AA government 100% (Level 1); IG corporate bonds and AAA tranches 85% (Level 2A, ≤ 40% of HQLA); GX100 equities 50% (Level 2B, ≤ 15%). Encumbered assets (pledged, repo'd out) are excluded.
  Outflow rates on balances: insured retail 5%, uninsured retail (natural persons incl. characters) 10%, player-controlled corporate 25%, NPC operational corporate 25%, non-operational corporate 40%, financial institutions and funds 100%, undrawn commitments 10% (financial 40%), maturing interbank/CB/repo liabilities 100% (repo backed by Level 1: 0%). Inflows: 50% of contractual performing loan inflows, 100% of maturing interbank lending, capped at 75% of outflows.
- **NSFR** = available stable funding / required stable funding ≥ 100% (reported, WATCH below 100%; no direct trigger). ASF: capital 100%, term deposits > 91 days and bonds > 1y 100%, retail sight 90%, corporate 50%, financial 0%. RSF: reserves 0%, Level 1 5%, Level 2A 15%, mortgages 65%, other loans 85%, illiquid 100%.
- **Reserve requirement** (04 sets `rr` per bloc: FU 1%, EC 1%, PL 5%, NA 1%, SC 10%): day-close reserves ≥ `rr · (sight + savings deposits)`. Shortfall pays `(MLFR + 2%) × shortfall / 364` for that night (04's `CBK_RESERVE_PENALTY`: SINK for player banks, TRANSFER for NPC banks).
- **Large exposures:** exposure to any beneficial-owner group ≤ 25% of Tier1 (SIB-to-SIB 15%); related parties (the bank's owner group) ≤ `relatedPartyLimitFrac` ≤ 5% of Tier1, at arm's-length pricing (rate ≥ the bank's grid rate for that grade) (13 audits).

#### §3.2.4 Daily P&L of a bank (day close, P8)
```
NII      = Σ loan interest + securities coupons + reserve interest (DFR on excess) + reverse repo − deposit interest − interbank − CB − repo − bond interest
Fees     = commitment fees + FX margin + PB financing spread + custody + clearing (members) + SL agent fees
Trading  = Δ mark of trading book (06 marks)
Opex     = branches · PARAM.branch_cost_per_day ($4,000 FDL-equivalent, scaled by bloc wage index from 04) + staff (0.6% of assets per year / 364) + regulatory and DGF premiums
Credit   = − Δ provisions − write-offs + recoveries
Tax      = 03's corporate tax on positive profit
Net      → retained earnings (CET1) unless distributed
```

### §3.3 Credit creation and the loan lifecycle

#### §3.3.1 Origination algorithm (every lender, every product)
1. Application (`bank.loan.apply`, or 10/09 origination calls, or the aggregate allocator §3.5) states amount, currency, term, collateral, purpose.
2. Eligibility: lender ACTIVE (WATCH lenders lend only within 50% of normal supply; RESTRICTED do not lend); product enabled; borrower not Held (13) for new loans; borrower not in the 14-real-day post-bankruptcy lockout for NPC credit (ROADMAP 2.6).
3. Credit assessment: borrower `CreditProfile` (§3.4); collateral value after haircut (§3.15.6); for business loans 09's financials (DSCR, leverage).
4. Limits: product limit, borrower limit (§3.4.3), large-exposure limit, standards (§3.5.3): `maxLtv_effective = productMaxLtv − 0.20 · S`, minimum grade cutoff `BBB` at S ≥ 0.8, `BB` at S ≥ 0.5, `B` otherwise.
5. Pricing:
```
rate = fundingIndex + EL + capitalCharge + opexCharge + margin + standardsAddOn
fundingIndex  = ONR (floating) or OIS par rate for the term (fixed) (06 §3.16.3)
EL            = PD_1y · LGD_eff                      LGD_eff = max(0.05, 1 − collateralValueAfterHaircut / amount) × productLGD
capitalCharge = RW · cet1Target · PARAM.bank_cost_of_equity (0.12)
opexCharge    = 0.50% (secured), 1.50% (unsecured personal), 0.75% (business)
margin        = BankPolicy.loanSpreadGrid[grade] (NPC default: 0.25% AAA … 4.0% CCC)
standardsAddOn = 3.0% · S²
```
6. Offer (`bank.loan.offer` event to the borrower) valid 30 ticks; acceptance (`bank.loan.accept`) books it.
7. **Booking (P8, postings committed P13):** `Dr Loan asset (lender) / Cr Deposit liability (lender, borrower's account)` for the drawn amount, reason `BNK_LOAN_DRAWDOWN`, class `CREDIT_CREATE`. If the borrower's chosen account is at another bank, the deposit is created at the lender and immediately paid across (payment §3.1.2). Collateral pledges are recorded and the assets become encumbered (`pledgedQty`, 06 §2.1).

#### §3.3.2 Accrual and payments
- Interest accrues daily at t = 719: `accrued += outstanding · rate_t / 364` (floating rate re-fixed daily from ONR).
- Payment at `nextPaymentTick` (t = 719): the scheduled payment is auto-debited from the borrower's home account (then other accounts of the borrower at the same lender, then other banks). Annuity: `A = P · i / (1 − (1 + i)^(−n))`, `i = rate · paymentFreqDays / 364`, re-computed on rate reset for floating loans. Linear: principal `P / n` plus interest. Bullet: interest only, principal at maturity. IO-then-annuity: interest during `ioPeriodDays`, then annuity over the rest.
- Application order of a payment: fees → penalty interest → accrued interest → principal.
- Principal repayment posts `Dr Deposit (payer) / Cr Loan` with reason `BNK_LOAN_REPAY`, class `CREDIT_DESTROY`. Interest posts as TRANSFER `BNK_LOAN_INTEREST`.
- Prepayment allowed any time; fixed-rate loans pay a break cost = max(0, PV difference between contract rate and current OIS for the remaining schedule) (`DEFAULT`); floating loans prepay free.
- Revolvers/lines: draw and repay freely within the limit; commitment fee `0.25%`/yr on undrawn amount.

#### §3.3.3 Delinquency and default (player and company borrowers)
| Days past due (game days) | Status | Effect |
|---|---|---|
| 1 | DELINQUENT | Penalty `+5%`/yr on the overdue amount; credit profile late count +1; notification |
| `PARAM.loan_default_dpd = 3` | DEFAULTED | Acceleration: whole outstanding due; collateral enforcement starts; credit event for 06 if the borrower has bonds or CDS (06 §3.17.4, failure to pay ≥ $1M) |
A cure (paying all overdue amounts) before day 3 returns the loan to PERFORMING (status WATCH for 7 game days).

#### §3.3.4 Covenants
Tested every `testEveryDays` at t = 719 from 09/10 data (LTV from 10 appraisals, DSCR and leverage from 09 statements, CET1 from §3.2). Breach starts the cure period; at its end without cure, `onBreach` applies: `RATE_STEP_100` (+1% rate until cured), `CASH_SWEEP_50` (50% of the borrower's daily net income to principal), `ACCELERATE` (treated as default), `WAIVER_FEE_1PCT` (lender may waive for 1% of outstanding; NPC lenders waive when the breach is < 10% beyond threshold and fear < 0.5). The "credit squeeze" takedown of 03 §12 (#12) is exactly this: a lender (player or NPC) applying covenant rights.

#### §3.3.5 Collateral enforcement
At default, in P8 of the next tick, for each pledge in lien order:
- SECURITY: sold through the liquidation engine (§3.16.4) with fair-value bands.
- PROPERTY: forced sale through 10 (instant sale to an NPC fund at the 10 forced-sale discount, default −10% of appraisal, 01 §3.8).
- BUSINESS: sold to an NPC buyer at 85% of EV (01 §4.6) or transferred to the lender if the loan contract says so.
- COLLECTIBLE: consigned to the next Halberd & Vane sale with reserve 60% of appraisal, or sold to the dealer at 70% if the next sale is more than 2 game days away (06 §3.18.4).
- CASH: set off immediately. RECEIVABLES: the assigned share of revenue is swept to the lender until repaid.
Proceeds pay costs (1% enforcement fee to the lender), penalty, interest, principal; surplus returns to the borrower; shortfall becomes an unsecured claim:
- NPC lender: unsecured claim → 13 judgment debt with the 30%-of-daily-income garnishment plan (03 §9.9). Discharged by bankruptcy (ROADMAP 2.6).
- Player lender or a 15 P2P loan contract: judgment debt that **survives bankruptcy** (ROADMAP 2.6).

#### §3.3.6 Restructuring
Borrower and lender may agree (`bank.loan.restructure`): term extension, rate cut, principal haircut, or debt-for-equity (09). NPC lenders accept when the restructured PV ≥ expected enforcement recovery × 1.05. A restructuring with principal or rate reduction is a RESTRUCTURING credit event for 06 if the borrower has CDS outstanding and is a sovereign or bank; for companies it is not (`DEFAULT`, mirrors standard practice).

#### §3.3.7 Provisions (expected credit loss)
```
Stage 1 (PERFORMING, no significant deterioration):  provision = PD_1y · LGD · EAD
Stage 2 (WATCH, DPD ≥ 1, grade down ≥ 3 notches since origination, or covenant breach):  provision = PD_life · LGD · EAD,  PD_life = 1 − (1 − PD_1y)^(remaining years)
Stage 3 (DEFAULTED):  provision = EAD − expected recovery (collateral after haircut and enforcement costs)
```
Re-measured at each day close; changes post as `LED_ECL_PROVISION` (class REVALUE, no cash). Write-off at the end of enforcement: `Dr Provision / Cr Loan` (`BNK_LOAN_CHARGEOFF`, class CREDIT_DESTROY for the unrecovered principal: the deposit it once created has already circulated, so broad money does not change at write-off; 03 handles the class mapping).

### §3.4 Player and company credit

#### §3.4.1 The credit bureau
All lenders (NPC and player banks, 15 P2P loan contracts) report to one bureau: `CreditProfile` per entity, updated at each day close. Characters see their own profile; lenders see the grade, PD, total debt and default history of applicants (no other holdings). Profiles of companies consolidate their subsidiaries (03).

#### §3.4.2 Score
```
lev   = totalDebt / max(NW, $1)                       (consolidated)
liq   = liquid assets (cash + LIC1-tradeable marks) / max(totalDebt, $1), capped 3
dsr   = debtService30d / max(income30d, $1)
vol   = coefficient of variation of daily net income over 28 game days, capped 2
hist  = onTimePayments / (onTimePayments + 3·latePayments + 1)
z = 1.8 − 2.5·lev + 0.6·liq − 1.5·max(0, dsr − 0.3) − 0.5·vol + 1.2·hist
    − 2.0·[default in last 2 chapters] − 1.0·[activeJudgments > 0] − 1.5·[bankruptcy in last chapter]
    − 1.0·[clearingDebt > 0] + 0.15·ln(max(NW, $10k) / $100k)
score = round(1000 · σ(z))
PD_1y = clamp(0.0003 · exp((800 − score) / 90), 0.0003, 0.60)
grade: AAA ≥ 900, AA 800–899, A 700–799, BBB 600–699, BB 500–599, B 400–499, CCC 300–399, CC < 300, D in default
```
**Reputation and Prestige do not enter the score** (MASTER-BIBLE decision 5: Reputation only lowers insurance premiums and decides pre-trial freezes). Convictions enter only through judgments and default history.
New characters start with no history: `hist = 0.5`, so a fresh $5,000 character scores about 560 (BB).

#### §3.4.3 Player credit products (NPC banks)
| Product | License | Limit | Rate (over ONR) | Term | Notes |
|---|---|---|---|---|---|
| Personal line (unsecured) | LIC0 | min(10% NW, 3 × income30d, grade cap: AAA $50M … B $50k, CCC 0) | 4%–18% by grade | Revolving, reviewed every 28 game days | Unavailable in the 72h rookie window beyond $1,000 |
| Lombard (securities-backed) | LIC1 | Σ collateral × (1 − 1.5 × haircut) | 1.5%–3.0% | Revolving | Margin-call-like: LTV breach → 1 game hour to cure, then sale |
| Collectible loan | LIC0 | 50% of appraisal (LIMITED/UNIQUE) | 5% | 91–364 game days | Item vaulted with lender's custodian |
| Business term loan | — (company) | ≤ 3.0 × EBITDA (09), DSCR ≥ 1.25 | grade grid | 1–5 game years | Covenants MIN_DSCR 1.25, MAX_NET_LEVERAGE 3.5 |
| Revolver | — | ≤ 1.0 × EBITDA | grid + 0.25% fee undrawn | 1–3 years | MIN_LIQUIDITY covenant |
| Mortgage (resi / commercial) | LIC0 | 10's LTV rules (80% / 65%, 01 §3.8) | 10y govt + 1.5–3% (10) | up to 30 game years | Originated by 10, booked here |
| Construction | — | 10's rules | +3.5% | build period + 91 days | Drawn in stages |
| LBO senior / mezz / bridge | LIC4 sponsor | senior ≤ 5.0×, total ≤ 7.0× EBITDA | +3.5% / +8% / +5% | 5–7 / 7–8 / 1 years | 09 structures; covenants incl. cash sweep |
Total debt service across all lenders: new credit refused if post-loan `dsr > PARAM.max_dsr = 0.50` (secured-by-liquid-collateral loans exempt up to collateral value).

#### §3.4.4 P2P loans
Loans between players are 15's contract clauses (02 §8.2): money in escrow at the Clearing House escrow service (§3.20), engine auto-repay, collateral seized on default. They do **not** create money (no bank): the lender's deposit moves to the borrower (TRANSFER). They report to the bureau. Anti-funnelling: 0% loans and off-market terms are flagged (15).

### §3.5 Lending to the aggregate economy and the credit cycle

#### §3.5.1 Segments
Per city: `AGG_HH_MORTGAGE`, `AGG_HH_CONSUMER`; per bloc: `AGG_FRM` (non-financial firms). Each NPC (and player) bank present holds a pool loan per segment (one `Loan` record per bank per segment, outstanding = aggregate).

#### §3.5.2 Demand, supply, allocation (each game day, P8)
- **Demand** (interface assumed from 04/16): `D_g(rate, standards)` = new credit demanded per game day by segment g at the segment's average offered rate, falling with rate (semi-elasticity −8 per 100% rate, i.e. −8% per +1 pp) and with standards (`× (1 − 0.5 S_avg)`); 04/16 supply the base level from income, house prices (10) and investment.
- **Supply** of bank b to segment g: `Sup_b,g = min(capitalHeadroom_b / RW_g, fundingHeadroom_b) · appetite_b,g · (1 − 0.6 · S_b)`, where `capitalHeadroom = (CET1 − cet1Target · RWA)` (zero if negative) and `fundingHeadroom = deposits · 0.05 + stable funding growth`.
- **Allocation:** each bank offers its rate (§3.3.1 pricing with the segment's average grade: mortgages BBB, consumer BB, firms by bloc credit spread from 06); demand is allocated by a logit over offered rates (coefficient 4 per 1 pp), each bank capped by its supply; unfilled demand at the segment level reduces 04's investment/consumption (credit rationing feeds back into GDP).
- **Repayments:** pool loans amortize at segment rates (mortgages 1/25 per year of outstanding, consumer 1/3, firms 1/5) as CREDIT_DESTROY.

#### §3.5.3 Lending standards S (per bank, day close)
```
S_target = clamp( 0.30
                  + 4.0  · max(0, cet1Target − CET1)                 (capital pressure)
                  + 10.0 · (lossRate30d − lossRateNormal)            (recent losses; normal 0.5%/yr annualized)
                  + 0.30 · (fear − 0.20)
                  + c_bloc                                           (04 credit-conditions shift, [−0.2, +0.2])
                  − 0.10 · [profit growth > 10%/yr and fear < 0.2],   (boom complacency)
                  0, 1 )
S ← S + 0.10 · (S_target − S)
```
Low S in a boom → faster credit growth → rising house prices (10) and leverage → 04's recession transition probabilities (which read aggregate credit growth from this module, `creditGrowthYoY_bloc`) rise. A bust raises losses and S, cutting credit and deepening the downturn. This is the causal credit cycle (V3 §3.1, 01 §5.3).

#### §3.5.4 Aggregate default rates (per game day, applied at day close)
```
Δu   = (u − u_natural) in percentage points (04);  gap = output gap in pp (04);  HPIyoy from 10;  LTVcur = segment average current LTV (10)
PD_mortgage_annual = 0.004 · exp(0.25 · Δu) · (1 + 4 · max(0, LTVcur − 0.90))
PD_consumer_annual = 0.020 · exp(0.20 · Δu)
PD_firm_annual     = 0.012 · exp(−0.30 · gap) · (1 + 0.5 · max(0, HYspread − 0.04) / 0.01)      (HY spread from 06)
LGD_mortgage = clamp(0.25 · (1 + 2 · max(0, −HPIyoy)), 0.10, 0.60);  LGD_consumer = 0.80;  LGD_firm = 0.50
daily loss = outstanding · PD_annual / 364 · LGD   →  write-off (provisions move first through stages)
```
Defaulted household mortgages also feed 10 (forced sales raise supply and push house prices down: the housing-crisis loop of 01 §3.8).

### §3.6 Bank profitability decisions
Each day close the bank (NPC strategy or player policy) applies: dividend if CET1 > cet1Target + 1% (payout × earnings, subject to MDA §3.2.2); capital raise if CET1 < cet1Target (NPC: retain all earnings; below requirement + 0.5%: issue equity through 09's secondary offering mechanism at a 10% discount, or AT1 bonds via 06 primary auctions); securities portfolio rebalance toward `hqlaTargetFrac`; interest-rate hedge of `hedgeRatio × durationGap` with OIS (06). Duration gap = (asset duration − liability duration × liabilities/assets); a positive gap loses when rates rise (the rate-hike channel of V3 §2.4 onto bank margins).

### §3.7 Interbank market, ONR and central-bank facilities

#### §3.7.1 Reserve positions
At ticks where `t mod 30 == 29` (once per game hour), each bank computes its projected day-close reserve gap: `G_b = reserves_now + scheduled inflows − scheduled outflows − (rr · eligible deposits + PARAM.reserve_buffer_frac (0.005) · deposits)`. Lenders have `G_b > 0`, borrowers `G_b < 0`.

#### §3.7.2 Hourly interbank match (per bloc, P8)
```
for each lender L and potential borrower B:
  PD_B      = 06 credit model PD of B (§3.8.1 of 06; banks use the CET1 rule)
  refuse if PD_B > tol_L · (1 − 0.5 · fear)          tol_L = policy.interbankPdTolerance (NPC default 0.02)
  limit_LB  = 0.10 · Tier1_L · max(0, 1 − PD_B / (tol_L·(1 − 0.5·fear)))  − existing exposure L→B
  ask_LB    = DFR + 0.0005 + PD_B · 0.6 · (1 + 2·fear)                  (annual rate)
borrowers sorted by hash(bankId, hourTick); each borrower takes the cheapest asks within limits
while ask ≤ MLFR − 0.0001 and its gap is unfilled; lenders' offers are capped by their G_L.
```
Loans are `INTERBANK`, maturing at the next day close (overnight), rate fixed at match. Player banks in `MANUAL` mode submit `bank.interbank.order` (amount, limit rate, counterparty limits); their orders join the same match. Unfilled borrowers rely on the end-of-day CB facility (§3.1.2).

#### §3.7.3 Freeze
When fear rises or a bank's PD rises, limits shrink and asks rise, so weak banks are rationed out and move to the central bank (stigma, §3.9). The **interbank stress indicator** = `(ONR − policyRate)` and `volume / 30-day average volume` is published per bloc (PUBLIC, §3.21). A freeze is emergent, not scripted.

#### §3.7.4 ONR fixing
At t = 719 each game day: `ONR = Σ(rate · amount) / Σ amount` over the day's interbank loans in the bloc. If volume < `PARAM.onr_min_volume_frac = 0.01%` of the bloc's bank deposits, fallback `ONR = policyRate + (previous ONR − previous policyRate)` and `fallback = true`. ONR is the floating index for swaps, FRNs, floating loans and rate futures (06).

#### §3.7.5 Central-bank facilities (rates and eligibility owned by 04; mechanics here)
- **Deposit facility:** banks move reserves into and out of the facility with 04's `bank.cb.deposit` / `bank.cb.depositWithdraw`; facility balances earn DFR (04 `CBK_INTEREST_ON_RESERVES`).
- **Marginal lending facility (MLF):** overnight at MLFR, against CB-eligible collateral at CB haircuts (default = the CCP haircut table §3.15.6 for government and IG; 04 may widen eligibility in a crisis), drawn automatically at day close for negative reserves or by `bank.cb.facility`.
- **Emergency Liquidity Assistance (ELA):** requested with 04's intent `bank.cb.elaRequest` (or automatically by the run playbook, which submits the same intent). 07 provides the solvency test 04 requires: `solvencyTest(bankId) = CET1 ratio ≥ 4.5% and status ∉ {IN_RESOLUTION, RESOLVED, LIQUIDATED}`; 04 decides the grant and the rate (default MLFR + 1%); collateral: any performing loans at 30% haircut (04 may change).
- **Stigma:** MLF use above 1% of total assets for 2 consecutive days, and any ELA, is disclosed in the CB's weekly report with a 7-game-day lag (PUBLIC), and immediately raises a rumor with probability `0.3` per game day (16 rumor generator, true rumor).

### §3.8 Deposit insurance
- One **Deposit Guarantee Fund (DGF)** per bloc. Cap `PARAM.dgf_cap = $250,000` FDL-equivalent per beneficial-owner group (03 consolidation) per bank, converted at FX spot at failure time.
- Premium per year on insured deposits: `base 0.08% × (1 + 2 · max(0, requirement − CET1) / 0.02)`, clamped [0.05%, 0.40%], charged daily (TRANSFER bank → DGF, `BNK_DEPOSIT_INSURANCE_PREMIUM`). Target fund size 1.5% of insured deposits; above target the base rate halves.
- Payout: on failure, insured balances are either transferred to an acquiring bank (P&A) or paid into a new SIGHT account at the bloc's largest ACTIVE NPC bank within `PARAM.dgf_payout_ticks = 720` (1 game day). The DGF is subrogated to the depositors' claims in the creditor hierarchy (§3.10.4).
- If the fund is exhausted, 04's treasury lends to it (`backstopLineFromTreasury`), repaid from future premiums; 04 may also announce a temporary **blanket guarantee** (all deposits of the bloc insured for 28 game days), which sets the run hazard of uninsured deposits to the insured hazard (§3.9.3).
- Players see on the Bank screen how much of their deposits at each bank is insured; a concentration warning fires above the cap (18 teaches this just in time).

### §3.9 Confidence and bank runs

#### §3.9.1 Confidence update (every game hour, P8, `t mod 30 == 0`)
```
capital  = clamp((CET1_public − requirement) / 0.02, −3, 3)         CET1_public = last published CET1 − (public losses since) / RWA_published
equity   = clamp(r_5d / 0.10, −3, 1)                                 bank's own equity 5-game-day return, 0 if unlisted
cds      = clamp(cdsSpread_bps / 300, 0, 3)                          from 06, 0 if no CDS
rumor    = rumor intensity about the bank in [0, 1] (16), each single source's contribution capped at 0.3
contagion= min(1, Σ_{banks k in same bloc in RUN or failed in last 7 game days} similarity(b,k))   similarity: same tier 0.5, same segment mix 0.3, interbank exposure to k > 5% Tier1 → +0.5
stigma   = 1 if a stigma disclosure is live (§3.7.5), else 0
outflow  = clamp(max(0, outflow24h − 0.02) / 0.10, 0, 2)
z        = 2.0 + 0.8·capital + 0.6·equity − 0.8·cds − 1.5·rumor − 1.0·contagion − 0.8·stigma − 2.0·outflow
C_target = σ(z)
C ← C + α · (C_target − C),   α = 0.30 if C_target < C (fear is fast) else 0.05 (trust is slow)
```
Initial C = 0.90. The confidence index is PUBLIC per bank in five bands (Solid ≥ 0.85, Steady ≥ 0.70, Uneasy ≥ 0.55, Strained ≥ 0.40, Run < 0.40), never the raw number (prevents micro-gaming).

#### §3.9.2 What feeds it from players
Large public losses (06 defaults, 08 tranche write-downs that 15 filings reveal), player short positions and short campaigns (03 §12 #4, legal if the research is true), rumors posted through player-owned media (16; false ones are manipulation, 13 K01), a player's own visible withdrawal is not visible (L11: individual flows are private). Hidden hacks (12) on a bank do not change C until disclosed.

#### §3.9.3 Withdrawals (aggregate NPC depositors, every game hour)
```
x = max(0, (C_crit − C) / C_crit),  C_crit = PARAM.run_c_crit = 0.60
w_uninsured = 0.0002 + PARAM.run_w_max (0.08) · x²        per game hour, fraction of uninsured NPC deposits
w_insured   = 0.0002 + 0.1 · 0.08 · x²
w_financial = 0.0004 + 0.20 · x²                           NPC funds, MMFs, other banks' deposits
```
The `0.0002` base is offset by normal inflows (the logit of §3.1.4), so outside a run net flows are ~0. Withdrawn deposits move to other banks of the bloc in proportion to `C_k² · deposits_k` (flight to quality) and to government MMFs (08) for 30% of financial outflows. Player characters and their companies withdraw only by their own intents (`bank.deposit.move`), executed in P8 the same tick; a move from a bank in RUN status during the same game hour pays no fee and is not delayed (no gates on deposits, `DEFAULT`).
A **run** starts when `outflow24h ≥ PARAM.run_threshold = 0.10` (event `bank.run.started`) and ends when C ≥ C_crit and outflow24h < 0.02 for 24 game hours.

#### §3.9.4 Bank response (deterministic order each game hour while outflows exceed reserves headroom)
1. Use excess reserves above rr (rr can be breached intraday; penalty only at day close).
2. Borrow in the hourly interbank match (§3.7.2), if lenders accept.
3. Repo HQLA: CCP GC repo (§3.12) or CB standing repo (04), up to unencumbered Level 1.
4. Sell HQLA through 05 market orders, at most 20% of each bond's ADV per tick (fire sale; yields rise, which hurts other holders' marks and confidence).
5. MLF against remaining eligible collateral.
6. Request ELA (04 decides).
7. Sell loan pools to other banks at 85% of book (NPC banks buy if they have capital headroom).
8. If at day close the reserve gap cannot be covered: liquidity failure (§3.10.1).
Player banks run their `runPlaybook` (an ordered subset of the same steps with limits) automatically, or act manually.

#### §3.9.5 Stopping a run
- Fundamentals recover (C rises at α = 0.05 per hour).
- ELA granted: liquidity covers outflows (stigma, but no failure).
- Blanket guarantee (04): uninsured hazard falls to the insured one.
- **Recapitalization:** owner injects capital (`bank.capital.inject`) → CET1 rises → capital term recovers at the next update.
- **Rescue merger:** an acquirer (NPC with headroom, or a player bank) agrees to buy the bank before failure (`bank.resolution.bid` is also usable pre-failure as a voluntary sale through 09's M&A flow); on announcement C jumps to `0.9 · C_acquirer`.
Every run, ELA, rescue and failure appends a permanent `BankHistoryEntry` and an archive record (16 world history, 14 Legacy for player owners).

### §3.10 Bank failure and resolution

#### §3.10.1 Triggers (evaluated at day close, P8)
SOLVENCY: CET1 ratio < 2.0%. LIQUIDITY: end-of-day reserve shortfall after all facilities (§3.9.4 step 8). REGULATOR: 13 determines failing or likely to fail (e.g. after fraud findings). On trigger: status IN_RESOLUTION, event `bank.failed` (PUBLIC), all deposits frozen above the insured cap for up to 1 game day, insured balances remain usable, new lending and trading stop, the bank's CCP memberships trigger member default (§3.17.6).

#### §3.10.2 Valuation (same tick)
`assetsFair` = 06 marks and performing book values minus Stage 3 provisions; `assetsFireSale` = assetsFair × (1 − 0.10) for securities and × (1 − 0.25) for loans.

#### §3.10.3 Tools and least-cost choice (regulator 13 picks by rule; 07 executes)
- **P&A auction** (always opened for 30 ticks): bidders submit `ResolutionBid` (price may be negative: the DGF pays the acquirer). Eligible bidders: ACTIVE banks whose post-deal CET1 ≥ requirement + 1%, and characters/companies eligible for a charter (§3.11) who commit `capitalInjection` ≥ the charter minimum and ≥ 10% of acquired RWA.
- **Bail-in** (available if bail-inable liabilities, i.e. bonds + uninsured non-natural-person deposits, ≥ 8% of total liabilities): write down equity to zero, then AT1, subordinated, senior bonds, then uninsured corporate and fund deposits, then uninsured natural-person deposits, converting written-down claims into new equity until CET1 = 10%. Old owners are wiped.
- **Liquidation:** DGF pays insured deposits; a liquidator (NPC) sells assets over 14 game days through 05/10/09 channels; proceeds paid by hierarchy.
- **Choice:** cost to DGF = `insured deposits paid − DGF share of recoveries` for liquidation; `−bestBidPrice + any assumed shortfall` for P&A; 0 for bail-in. The regulator chooses the least-cost tool; ties prefer P&A, then bail-in. SIBs default to bail-in when available (no fire sale of a SIB balance sheet).

#### §3.10.4 Creditor hierarchy (liquidation and bail-in)
1. Secured creditors (repo, CB, covered collateral) up to collateral value. 2. Resolution costs. 3. Insured deposits / the DGF (subrogated). 4. Uninsured deposits of natural persons (characters, `hh`). 5. Other uninsured deposits (companies, funds, NPC institutions). 6. Senior unsecured bonds and interbank. 7. Subordinated bonds. 8. AT1. 9. Equity.

#### §3.10.5 Player bank failure (resolves V3 question 2)
`DECISION`: a player bank **can fail permanently**. The bank entity is resolved (sold, bailed in or liquidated); the owner's equity is lost; the charter is revoked; the owner group cannot hold a bank charter for `PARAM.bank_failure_charter_ban = 1 chapter` (8 real weeks), longer if 13 finds misconduct; the failure is a permanent public record on the owner's Legacy (14) and in world history (16). Limited liability: the owner's other assets are not touched unless 13 finds fraud or the owner guaranteed debts personally (a `BUSINESS_TERM` personal guarantee clause, 15). The owner keeps everything outside the bank. This keeps real systemic risk without a game-over.

### §3.11 Player banks (charters)

#### §3.11.1 Scope levels of the CH_BANK charter
The charter itself is `CH_BANK`: 14 gates it at rank R4 Tycoon (14 §3.2, which already resolves V3 question 1: banks before Dynasty), 13 owns the capital/record/fee approval (`law.charter.apply`, fee `ACCT_CHARTER_FEE`). 07 defines what a chartered bank may do at each **scope level** and the operating capital each level needs (the numbers below are 07's minimums that 13's approval checks; the fees are `DEFAULT (Mathis may override)` proposals for 13):
| Scope level | Extra gate | Minimum paid-in capital (07) | Proposed charter fee (13, SINK) | Scope |
|---|---|---|---|---|
| COMMUNITY | CH_BANK, LIC2 | `$20M` | $1M | One home city; deposits ≤ $2B; retail and SME lending, mortgages; interbank; no PB, no clearing |
| COMMERCIAL | CH_BANK, LIC4 | `$250M` | $10M | Whole bloc; any lending incl. LBO; bonds and AT1 issuance; primary dealer eligible; custodian functions if CH_CUSTODIAN is also held |
| UNIVERSAL | CH_BANK, LIC4, rank ≥ R5 | `$2.5B` | $50M | Multi-bloc branches (one CB reserve account per bloc); securities dealing (RFQ dealer, 06), prime brokerage, securities-lending agent, clearing membership |
Approval takes 1 game week (7 real hours) after `bank.charter.apply` (07's intent creates the bank entity once 13 approves; it is the same request 14 forwards from `acct.charter.apply`); 13's fit-and-proper test is assumed to include no S4+ conviction in 8 real weeks and an account ≥ 14 real days. Capital must be paid in cash from the owner group (it becomes the bank's CET1) and stays locked as equity. A COMMUNITY bank can upgrade when requirements are met (`bank.charter.upgrade`). The bank's home city must host one of the owner's properties or businesses (it needs a headquarters, 10).

#### §3.11.2 SIB designation
Automatic at a quarter end when total assets > 3% of the bloc's banking assets or > `$500B`: surcharge 1.0% (+0.5% per extra 3% of bloc assets, max 2.0%), leverage minimum 3.5%, quarterly stress test (§3.11.4), resolution plan (bail-in pre-positioned).

#### §3.11.3 What the player controls
`bank.policy.set`: deposit rates per product (attracts NPC deposits per §3.1.4), loan spread grid, product limits and LTVs (within regulatory caps: resi LTV ≤ 90%, commercial ≤ 75%), sector limits, lending standards override (S floor/ceiling within ±0.2 of the computed S), CET1 and HQLA targets, dividend payout, hedge ratio, interbank mode and tolerance, run playbook. `bank.branches.set` (each branch costs opex, raises deposit share). Capital actions: inject, dividend, bond/AT1 issuance (06 primary auction), list the bank (09 IPO). Delegation: a bank can be run by a manager or an AI operator under a Mandate (00 §5.5) with the same intents.

#### §3.11.4 Stress test (13 runs it; 07 computes)
Each quarter for SIBs (yearly for others) the regulator applies the authored adverse scenario (22: rates +3%, house prices −25%, unemployment +4 pp, equities −40%, spreads ×3) to the bank's balance sheet over 4 game quarters with static balance sheet; the result (stressed minimum CET1) is PUBLIC. If below 4.5%, the bank must submit a capital plan (dividends blocked until passed).

#### §3.11.5 Player bank as a lender to players
A player bank can offer credit products to other players through the same product engine (its grid, its limits). Lending to its own owner group is related-party lending (≤ 5% Tier1, arm's length, flagged to 13 and visible in its quarterly filing). A player bank cannot lend to a character that is linked to its owner in 15's collusion graph beyond that limit.

### §3.12 Repo

#### §3.12.1 Venues and participants
| Venue | Collateral | Who | Clearing |
|---|---|---|---|
| CCP_GC | Government bond baskets per bloc (any bond of that government) | Banks, LIC4 players, funds (08), MMFs | TCH REPO service, anonymous |
| CCP_SPECIFIC | One named security | same | TCH REPO |
| TRIPARTY | Baskets GOVT, IG (corporate IG + AAA tranches), EQUITY (GX100) | Banks, funds, LIC4, MMFs as cash lenders | Tri-party agent = an NPC custodian bank; not CCP |
| BILATERAL | Anything eligible in §3.15.6 incl. HY, lower tranches, crypto majors (PB only) | PB clients, banks | Bilateral with CSA-like margining |
Central banks (04) run OMO repos and a standing repo facility through the same records.

#### §3.12.2 Hourly GC repo auction (per bloc, P8 at `t mod 30 == 29`)
Cash lenders submit (amount, minimum rate), cash borrowers (amount, maximum rate, collateral basket); uniform-price clearing at the rate where supply meets demand; ties prorated; remainders by hash. NPC reservation rates: MMFs lend at ≥ `DFR − 0.10%` (they have no CB access), banks with excess reserves lend at ≥ `DFR`, dealers borrow at ≤ `ONR + 0.10%`. The clearing rate is the **GC rate** (PUBLIC). Tenors in the auction: overnight (to next day close) and 1 game week; term repos (28, 91 game days) trade by RFQ (06 §3.19).

#### §3.12.3 Specials
`specificRate_i = GC − specialness_i`, `specialness_i = 0.02 · max(0, U_i − 0.60) / 0.40` (annual), where `U_i` is the securities-lending utilization of bond i (§3.13). Heavily shorted bonds can trade at negative repo rates (the cash lender pays to borrow the bond).

#### §3.12.4 Haircuts and margining
Haircut from §3.15.6 at the venue's stress multiplier. Collateral is marked every tick (06 marks); exposure checked each game hour: `required = cash · (1 + accrued) / (1 − h)`; if collateral value < required − MTA (`$10k` or 0.5% of cash), a margin call is issued, due in `PARAM.repo_call_due_ticks = 30`. Unmet → event of default: the non-defaulting party sells the collateral through the liquidation engine (§3.16.4) and claims any shortfall (unsecured claim; via the CCP for CCP venues, which then uses the REPO waterfall).
Substitution: the borrower may substitute collateral of equal or better value after haircut (`bank.repo.substitute`).

#### §3.12.5 Title transfer and re-use
Repo is a sale with an obligation to repurchase: legal title moves to the cash lender, which may re-use (re-pledge or sell) the collateral in BILATERAL and CCP venues (`reuseAllowed`), not in TRIPARTY. Accounting (03): the borrower keeps the security on its balance sheet as **encumbered** and books a repo liability; the lender books a receivable, not the security; if the lender re-uses or sells it, the lender books an obligation to return it. **Invariant (20):** every unit of every security has exactly one legal holder, and every chain of re-use claims on it is finite and acyclic and ends at that holder.

#### §3.12.6 Repo runs
Dealers' haircut stress multipliers (§3.15.6) rise with fear; when a borrower's PD rises (06), TRIPARTY and BILATERAL lenders add a counterparty add-on `+20% · PD/0.05` to haircuts and refuse rollovers above `PD > 0.10`. A fund or bank that relies on overnight repo for its assets can lose funding in a single day: funding liquidity is a distinct risk from market liquidity (V3 §3.4).

### §3.13 Securities lending and short selling

#### §3.13.1 Supply
- NPC holders (16 aggregate index funds, pensions, insurers) contribute `PARAM.sl_npc_lendable_frac` of their holdings (equities 0.40, government bonds 0.50, corporates 0.30, ETFs 0.30) to the pool of their NPC custodian agent.
- Players may opt in per position or for all eligible holdings (`bank.sl.optIn`, LIC1 holders); they receive `PARAM.sl_lender_share = 0.70` of fees on their lent quantity; the agent keeps 0.30. Lent shares remain in the lender's NW (marked), are not sellable until returned (a sale order triggers a recall first, executed instantly if other supply exists), and their votes pass to the holder of record (§3.13.7).
- Player-run agents: UNIVERSAL banks and PBs act as agents for their clients.

#### §3.13.2 Locates and borrowing
- A short-sale order needs a locate at P1: `locate(asset, qty)` reserves `qty` from the pool for that tick (FIFO by seal hash among requests). If the order fills partially, the unused locate is released at P13. Locate fails if `U ≥ PARAM.sl_htb_utilization = 0.95` (hard to borrow: rejected with reason HTB).
- A filled short creates a `SecLoan`; cash proceeds remain in the borrower's margin account as collateral (retail) or as cash collateral at 102% of value (LIC4/PB, with a rebate rate = GC − fee).
- LIC4 may pre-borrow (`bank.sl.borrow`) for a term (up to 91 game days) at a fixed fee.

#### §3.13.3 Fee
```
U   = onLoan / lendable
fee = f_gc + (f_max − f_gc) · max(0, (U − 0.5) / 0.5)³,   f_gc = 0.5%/yr, f_max = 30%/yr       (01 §3.1 range)
```
Recomputed daily at t = 719 for open loans (floating) and continuously for new locates; charged daily on the closing mark value: `qty · close · fee / 364` (borrower → pool, split lender 70 / agent 30).

#### §3.13.4 Recalls and buy-ins
When lendable falls below onLoan (lender sold, opted out, or NPC holders reduced holdings), the agent first reallocates free supply; if still short, it recalls loans in LIFO order (newest first, then by hash). The borrower must return within `PARAM.sl_recall_grace_ticks = 360` (half a game day); otherwise at that tick the liquidation engine buys the quantity in the market for the borrower's account (limit band up to +10% over fair value, widening as §3.16.4), charges all costs to the borrower, and closes the loan (`bank.sl.buyin`). Repeated buy-ins in a high short-interest, rising-price name produce squeezes naturally.

#### §3.13.5 Short-interest transparency
Aggregate short interest per asset (onLoan) and utilization are PUBLIC daily. Individual net short positions ≥ `PARAM.short_disclosure_frac = 0.01` of free float are a legal filing (15), published 1 game day later; this is a disclosure "by legal filing rule" allowed by L11 (`DEFAULT (Mathis may override)`).

#### §3.13.6 Corporate actions on loaned securities
Manufactured dividends and coupons are paid by the borrower to the lender on pay date (06 §3.4.4). Splits scale the loan. Mergers convert the loan into the consideration.

#### §3.13.7 Voting
Votes follow the holder of record (09 proxy). Lenders who want to vote must recall before the record date (2 game days notice). A borrower holding borrowed shares > 1% of float over a record date in a contested vote is flagged (empty voting) and must disclose (15); 13 may investigate.

### §3.14 Prime brokerage
- **Who:** clients with LIC4 (characters, their companies, player funds 08). Prime brokers: 3 NPC universal banks (FDL, EUN, PYN; names in 22) and player UNIVERSAL banks with the PB flag.
- **Account:** one `PrimeBrokerageAccount` per client per PB; cross-margined across equities, bonds, FX, commodities, listed derivatives (PB is the clearing member) and bilateral OTC with the PB.
- **Tiers** (PB assigns at opening and reviews every 28 game days): A (NW ≥ $1B or fund AUM ≥ $500M, 2 game quarters of history, no drawdown > 30%), B (NW ≥ $50M), C (others). Gross leverage caps: A 8×, B 5×, C 3×; financing spread over ONR: A 0.40%, B 0.75%, C 1.50%; short rebate: GC − 0.25% − borrow fee.
- **Margin:** portfolio margin `IM_PB = max(ES_97.5%(MPOR = 2 game days) × m_tier, 0.05 × gross exposure) + concentration and liquidity add-ons (§3.15.5)`, `m_tier` A 1.0, B 1.2, C 1.5. MM = 0.8 × IM. Calls due in 30 ticks; below 0.6 × IM immediate liquidation of the cheapest-to-close risk.
- **Lock-up:** the PB cannot worsen margin terms (multipliers, haircuts, tiers) faster than `lockupNoticeTicks` (A 720, B 360, C 0) except on a termination event: client NAV/NW −25% in 28 game days, regulatory action against the client (13), client default elsewhere, or the PB itself RESTRICTED.
- **PB stress behaviour:** when the PB's own CET1 falls below its target or its confidence C < 0.7, it multiplies all clients' IM by `1 + 2·(0.7 − C)` (after notice periods) and terminates tier-C clients with 1 game day notice. This is procyclical by design.
- **Rehypothecation:** the PB may re-use client assets up to `PARAM.pb_rehypo_cap = 1.40 × debitBalance` by value; the rest is segregated. Client opt-out of rehypothecation costs `+0.50%` financing spread.
- **PB failure:** segregated assets are ported to another PB or returned within 1 game day; rehypothecated assets not recoverable become an unsecured claim of the client (netted against its debit) in the PB's resolution (§3.10.4 class 5). A PB failure therefore hurts its leveraged clients through lost re-used collateral, not through segregated holdings.

### §3.15 Margin

#### §3.15.1 Account types
| Type | Who | IM model | MM | Calls |
|---|---|---|---|---|
| CASH | LIC0–LIC1 | none (fully paid) | — | — |
| RETAIL_MARGIN | LIC2+ via the character's NPC broker (a clearing member) | Rule-based (§3.15.2) plus SCAN for derivatives | 0.5 × IM | Immediate: below MM liquidate; between MM and IM: CALL (no new risk) |
| PORTFOLIO | LIC4 opt-in, PB accounts | Risk-based (SCAN + HVaR) × 1.0–1.5 | 0.8 × IM | Due 30 ticks; below 0.6 × IM immediate |
| MEMBER_* | Clearing members' house and client accounts at the CCP | Service model (§3.17.2) | = IM | Due 30 ticks; failure = member default |

#### §3.15.2 Retail rule-based IM
`IM = Σ_positions max(notional_i · imRate_i, SCAN_i · 1.25)` where SCAN applies only to derivatives, and `imRate = 1 / maxLeverage` per class and license:
| Class | LIC2 | LIC3 | LIC4 |
|---|---|---|---|
| Spot equities, ETFs, bonds, FX, commodities (long) | 50% (2×) | 50% | 50% (portfolio margin for more) |
| Short spot (in addition to keeping proceeds) | 50% | 50% | 50% |
| Futures | — | max(SCAN·1.25, 10%) | portfolio |
| Perps | — | 10% (10×) | 5% (20×) |
| Options bought | premium paid in full | same | same |
| Options written (covered / cash-secured) | — | 0 extra / strike cash | same |
| Options written naked | — | — | SCAN·1.25, min 10% of underlying notional (calls) or 10% of strike (puts) |
Modifiers: active court case S3+ → maxLeverage halved (01 §7.6); 72-hour new-player protection → leverage ≤ 3× (06 §3.2); within 14 real days after a bankruptcy fresh start → no margin at all (ROADMAP 2.6); restricted cash (03 §3.5.6, rewarded-ad cash) has collateral value 0; Held → no new positions, existing ones remain margined.

#### §3.15.3 Volatility inputs
- Per risk factor, EWMA on tick log returns: `σ²_t = λ σ²_{t−1} + (1 − λ) r_t²`, `λ = 2^(−1 / PARAM.margin_ewma_halflife_ticks)`, half-life 240 ticks (8 game hours). Annualize with √262,080.
- Two-speed (E-38, PROVISIONAL [Quant]): `σ_ewma = max(σ_slow, σ_fast)` with a fast EWMA of variance half-life `PARAM.margin_ewma_fast_halflife_ticks = 60`.
- Anti-procyclicality: `σ_IM = sqrt((1 − w) σ_ewma² + w σ_stress²)`, `σ_stress` = 99th percentile of daily σ_ewma over the lookback (1 game year), `w = PARAM.apc_stress_weight = 0.25` (`DEFAULT (Mathis may override)`: lower w makes crashes more procyclical; 0 = fully procyclical). Margin still rises sharply in a volatility spike; the floor only stops it collapsing in calm periods.

#### §3.15.4 SCAN model (listed derivatives, perps, retail derivatives)
For each underlying group g (all positions whose value depends on the same underlying):
```
R_g = z · σ_IM,tick · sqrt(MPOR_ticks) · price,   z = 2.33 (99%)
scenarios: price move m ∈ {0, ±1/3, ±2/3, ±1}·R_g crossed with vol shift v ∈ {+25%, −25%} of IV (14 scenarios),
           plus 2 extreme scenarios ±2·R_g with no vol shift, loss weighted 35%
Loss_s = −(PV_after − PV_now) using 06 pricing (BS/Black/CRR with shifted IV)
IM_g = max( max_s Loss_s , SOM_g ),   SOM (short option minimum) = 2% of underlying notional per short option contract
Inter-group credit: for groups g, h with 60-game-day correlation ρ > 0.7 and opposite delta signs,
    credit = 0.5 · ρ · min(IM_g, IM_h)  (each IM_g used in at most one credit pair, largest ρ first)
Calendar spread charge: futures on the same underlying in different expiries: 0.3% of notional per spread leg
IM_SCAN = Σ IM_g − Σ credits + Σ spread charges
```
MPOR: LD 720 ticks (1 game day), CRY 60 ticks (2 game hours), retail derivatives at the broker = the service's MPOR.

#### §3.15.5 HVaR / ES model (OTC, CDS, PB portfolio margin)
- Risk factors: per bloc curve points (3m, 2y, 5y, 10y, 30y on `ois` and `govt`), FX legs, the 6 equity indices plus each single stock as idiosyncratic residual, commodity front and 12m futures, credit spreads per issuer bucket (IG, HY, banks, sovereigns), crypto majors.
- Scenarios: daily factor changes from the world's own history over the last 364 game days, each rescaled by `σ_now / σ_then` (filtered historical simulation), plus the stressed window (the worst 28-game-day period since genesis) with weight w (§3.15.3), plus authored stress scenarios from 22 until the world has 1 game year of history. `Interface assumed (02/20):` the world starts with a 364-game-day burn-in pre-history generated from the genesis seed so the model has data at launch; without it, only authored scenarios are used for the first game year.
- Measure: CCP OTC and CDS: VaR 99.5% scaled to MPOR 3 game days by √3 on daily scenarios; PB: ES 97.5% over MPOR 2 game days.
- Add-ons (all models): concentration `IM × 0.5 · sqrt(max(0, |deltaNotional| / ADV_notional − 0.10))`; liquidity `0.5 × bid-ask × |position|`; wrong-way (the account's own or affiliate-issued securities and CDS on itself are excluded from offsets and as collateral).
- Recompute cadence: SCAN every 30 ticks or when positions change or any σ moves > 10% since last computation; HVaR every 30 ticks for OTC/CDS, once per game hour for PB; between recomputations IM is scaled by `σ_now / σ_lastCompute`.

#### §3.15.6 Collateral classes and haircuts (one table for margin, repo, CB eligibility, loans)
| Class | Base haircut | CCP eligible | Tri-party / PB / bilateral | Lombard (×1.5) |
|---|---|---|---|---|
| CASH same currency | 0% | yes | yes | — |
| CASH other currency | 8% (SRL 20%) | yes | yes | — |
| GOVT_BILL (issuer AA– or better) | 0.5% | yes | yes | yes |
| GOVT 2–10y | 2% | yes | yes | yes |
| GOVT 10–30y, linkers | 4% / 3% | yes | yes | yes |
| GOVT below A (incl. SRL in stress) | +10% add-on | yes (CCP may suspend) | yes | yes |
| CORP_IG ≤ 5y / > 5y | 5% / 8% | OTC, REPO only | yes | yes |
| CORP_HY | 15% | no | yes | yes |
| EQ_LARGE (GX100) / EQ_OTHER | 15% / 25% | LD only (large) | yes | yes |
| ETF_EQUITY / ETF_BOND | 15% / 8% | LD only | yes | yes |
| GOLD (and ORE) | 15% | LD, CRY | yes | yes |
| CRYPTO_MAJOR (AUC, LTX) | 40% | CRY only | PB only | yes (×1.5, cap 70%) |
| STABLE_FIAT (GUSD, EUNX) | 10% | CRY only | PB only | no |
| TRANCHE AAA / AA–A / BBB (08) | 10% / 20% / 35% | no | yes | no |
| COLLECTIBLE (LIMITED/UNIQUE) | 50% | no | no | loans only |
| Everything else | not eligible | | | |
Stress multiplier: `h = min(0.95, h_base · (1 + κ_venue · fear))`, `κ`: CCP 0.5, CB 0.5, tri-party 1.0, bilateral/PB 1.5. Concentration: any single issuer > 25% of an account's posted collateral takes +10%. Ratings below the class threshold (08) move a bond to the lower class at the next day close (rating cliff).

### §3.16 Marking, calls and the liquidation engine

#### §3.16.1 Every tick (P7)
For every margin account with any position whose mark changed: `equity = cash + Σ long marks − Σ short marks + Σ derivative PVs (06 marks) − accrued fees and interest`. Compare with IM and MM (current or scaled per §3.15.5). Variation margin on cleared positions is realized: the change in PV moves between the account's cash and the CCP each tick at P13 (`CCP_VARIATION_MARGIN`, TRANSFER), so derivative P&L is cash (V3 §3.3).

#### §3.16.2 Status transitions
- RETAIL: `equity < MM` → LIQUIDATING immediately; `MM ≤ equity < IM` → CALL (only risk-reducing orders accepted); `equity ≥ IM` → OK.
- PORTFOLIO, PB, MEMBER: `equity < IM` → `MarginCall(amount = IM − equity, due = now + 30 ticks)`; `equity < 0.6 · IM` at any tick → LIQUIDATING (members: default declaration); call unmet at due → LIQUIDATING / member default.
- Consequences land next tick (02 rule): liquidation orders created in P7 of tick N are submitted to P6 of tick N+1.
- Held characters (03): liquidation orders are created exactly as for anyone else and always use the fair-value band (03 "margin calls during Held liquidate at fair value").

#### §3.16.3 Meeting a call
`bank.margin.deposit` (cash or eligible collateral), reducing positions, or (PB) agreed term changes. Deposits arrive in P13 of the submission tick and count from the next P7.

#### §3.16.4 Liquidation algorithm (accounts, repo, buy-ins, CCP hedging all use it)
```
target: reduce positions until IM(remaining) ≤ equity / 1.1, or close everything if equity ≤ 0
order of closing: largest IM contribution first (marginal IM reduction per unit of expected cost); ties by assetId
per tick per position: qty_slice ≤ PARAM.liq_max_participation (0.20) × expected tick volume (ADV / ticks in session)
limit price: fairValue · (1 ∓ band),  fairValue = 06 mark (§3.3.3 of 06, the band-clamped value) or perp mark price
band_0 = clamp(2 · σ_tick · sqrt(30), 0.5%, 3%), band widens by +1% per unfilled tick, cap 10%
closed markets: queued for the next opening auction with participation ≤ 20% of the opening auction volume
penalty: 1% of liquidated notional → retail: TCH retail insurance fund; client: its clearing member; CRY: product insurance fund (TRANSFER, reason `CCP_LIQUIDATION_PENALTY`)
```
Liquidation never trades at a crashed print because limits are anchored to fair value, and it never exceeds 20% participation, so one liquidation cannot become a flash crash by itself; many simultaneous liquidations still can (intended cascade).

#### §3.16.5 Deficits and ClearingDebt
If equity < 0 after all positions are closed:
1. Retail/client: the clearing member (NPC broker) absorbs the deficit; for NPC broker members the TCH retail insurance fund reimburses it.
2. The account owner owes a `ClearingDebt` to the member or TCH: rate ONR + 2%; `repaymentShare = 0.30` of daily net income auto-applied; **blocks** margin and derivatives, P2P outflows (15), ops funding (12), and lifestyle purchases above $1,000 (14) until repaid; does **not** block spot trading with own cash, T1–T2 businesses or upkeep (so a comeback is possible).
3. ClearingDebt survives the bankruptcy fresh start (ROADMAP 2.6 "debt owed to the Clearing House persists") and lowers the credit score (§3.4.2).
4. The retail insurance fund balance above `PARAM.retail_ins_fund_cap = 0.5%` of total retail margin balances is swept weekly to SINK (`CCP_INS_FUND_SWEEP`), so penalties do not accumulate as hoarded money.

### §3.17 The Clearing House (TCH)

#### §3.17.1 Institution
`ccp_TCH`, "The Clearing House", an NPC institution owned by its NPC member banks (16 actor). One CCP world-wide with five risk services (LD, OTC, CDS, REPO, CRY) and one non-risk service (ESC escrow and custody, §3.20). It is the Clearing House named in 02 §8.2 and the ROADMAP (escrow, custody, judgment escrow, clearing debt). Each risk service has its own default fund and SITG; losses never cross services.

#### §3.17.2 Service parameters (`PARAM.ccp_<service>_*`)
| Service | Products | IM model | MPOR | Confidence | Mutualized | Fee per contract/notional |
|---|---|---|---|---|---|---|
| LD | Listed futures, listed options (06) | SCAN | 720 ticks | 99% | DF | $0.20 per contract |
| OTC | OIS, ZCIS, FX forwards/swaps (legs), commodity swaps | HVaR | 3 game days | 99.5% | DF | 0.2 bp of notional |
| CDS | Single-name CDS, GX Credit 40 | HVaR + jump-to-default add-on (largest single-name LGD loss) | 3 game days | 99.5% | DF | 0.5 bp |
| REPO | CCP_GC, CCP_SPECIFIC | haircut-based (§3.15.6) | 1 game day | — | DF | 0.05 bp per day |
| CRY | Crypto perps, futures, options | SCAN | 60 ticks | 99% | Insurance fund + ADL | 2 bps of notional |
Fees are TCH revenue (TRANSFER); TCH pays ONR − 0.10% on cash IM.

#### §3.17.3 Membership
- NPC members: 14 at launch (the 2 largest NPC banks of each bloc, 2 NPC dealer firms, 1 crypto-native member owned by Vault Exchange for CRY, 1 Isla Serena private bank); names in 22.
- Player members: a player UNIVERSAL bank, or a COMMERCIAL bank for LD/REPO only, with `capital ≥ PARAM.cm_min_capital = $250M` and DF contribution ≥ `$10M` per service; `bank.ccp.join`. Members must participate in default auctions in products where they hold positions (§3.17.7) and offer client clearing.
- **Clients** (every player using a cleared product) clear through a member. Default: the NPC broker member of the character's home bank (a subsidiary of that NPC bank). LIC4 clients may choose another member and choose segregation: OMNIBUS (default, free) or ISA (individually segregated, `PARAM.ccp_isa_fee_ppm_gy = 800` ppm (0.08%)/yr of IM accrued daily at rate/364, TRANSFER `CCP_ISA_FEE` to TCH (E-37 amendment, PROVISIONAL [Quant]; E-38); originally `0.02%`/yr of IM, guaranteed portability). Clients name a backup member (`bank.ccp.backupMember`; default = the largest NPC member of the bloc).

#### §3.17.4 Novation
In P7 every matched trade in a cleared product is novated: the CCP becomes buyer to every seller and seller to every buyer, member by member. Positions net within each account. From then on, each party's counterparty risk is to TCH only.

#### §3.17.5 Default fund sizing (weekly, Monday t = 0, P7)
```
for each member m (house + clients, affiliates combined): S_m = max over stress scenarios (22 authored + historical worst) of (loss − IM_m)
DF = max(S_(1) + S_(2), DF_min_service)                          Cover-2
DF_min: LD $2B, OTC $3B, CDS $1B, REPO $1B (× N_a scale factor, 01 §14.1)
c_m = max($10M, DF · IM_m / Σ IM)                                 contribution, posted in cash or GOVT collateral after haircut
SITG1 = PARAM.ccp_sitg1_frac (0.10) · DF;  SITG2 = 0.10 · DF     funded by TCH capital
```
New contributions are due within 7 game days; members below their contribution cannot open new positions (risk-reducing only). After a default (§3.17.7), the replenishment call is issued at tick d+720 and members have 7 game days from that call to pay in full (Producer ruling E-38); assessments are called at the same tick with the same 7-game-day deadline. A missed deadline is not a default by itself: the member stays risk-reducing only and the shortfall escalates to a member default (§3.17.6) only if still unpaid at its next margin call (Producer ruling E-40). Fees round half-even, like every ledger amount.

#### §3.17.6 Member default
Declared when: a member call is unmet at its due tick, equity < 0.6 × IM, the member bank enters resolution (§3.10.1), or 13 orders it. Event `bank.ccp.memberDefault` (PUBLIC).

#### §3.17.7 Default management (timings in ticks from declaration tick d; 1 tick = 2 game minutes)
1. **Ticks d+1 … d+120: porting** (E-37/E-38, PROVISIONAL [Quant]; NPC backups decide at d+1, player backups by intent until d+120). ISA client positions with their collateral move to their backup member if it accepts (NPC members accept if the client's margin covers IM × 1.1); OMNIBUS clients are ported as a block if the backup accepts the whole omnibus; unported client positions join the house portfolio for close-out and the clients receive their collateral surplus after close-out.
2. **Ticks d+1 …: hedging** (most liquid instrument first, index futures before names; VaR measured at d+120, the auction does not wait). TCH's default management engine hedges the defaulter's directional risk with market orders (≤ 20% participation, §3.16.4) and option vega via RFQ (06), so the remaining portfolio's VaR falls by ≥ 80%.
3. **Ticks d+120 … d+480: auction** (three 120-tick rounds; ≥ 3 bids per lot incl. ≥ 2 NPC, else re-offer at half size; E-37 PROVISIONAL [Quant]). The remaining hedged portfolio is split into lots by product; sealed bids from members (mandatory for members with positions in the product, voluntary for others, player members included). Reservation price = model value − 2 × lot IM. Highest bid wins each lot; members' bids are scored by distance from the winning bid. If a lot gets no bid above reservation, it is re-offered twice with smaller lot sizes, then goes to tear-up (step 5).
4. **Losses** = close-out cost (hedge P&L + auction prices vs marks) − defaulter's resources. Apply the waterfall (§3.17.8).
5. Close: replenishment calls and assessments issued at tick d+720 (720 ticks = 1 GD), payable within 7 game days of the call (§3.17.5; Producer ruling E-38); DefaultEvent CLOSED.

#### §3.17.8 Waterfall (LD, OTC, CDS, REPO)
1. Defaulter's IM.
2. Defaulter's DF contribution.
3. SITG1.
4. Surviving members' DF contributions, **juniorized**: members whose auction bids were worst (bottom third by score) lose first, up to their full contribution, then the rest pro rata to contributions.
5. SITG2.
6. Assessments: up to 1× each survivor's DF contribution per default event, at most 2× within a 30-game-day cooling-off period (several defaults in a crisis share it).
7. Variation-margin gains haircutting (VMGH): for up to 5 game days, members with net VM gains in the service receive them reduced pro rata to cover the remaining loss.
8. Partial tear-up: unauctioned defaulter positions are cancelled against the opposite positions of members at the last settlement price (pro rata by position).
9. Service closure: all positions in the service are terminated at the last settlement price and margin returned; the service stays closed until 13 and TCH reopen it.
There is no taxpayer loss absorption (`DEFAULT`); 04 may lend TCH liquidity against collateral, never capital.

#### §3.17.9 CRY service (crypto-native)
No mutualized default fund. Each perp/future has an insurance fund (initial `$5M` per product × N_a scale, funded by liquidation penalties and 10% of CRY fees). If a liquidated account's deficit exceeds the insurance fund: **auto-deleveraging (ADL)**: opposite-side accounts with positive unrealized P&L are ranked by `score = pnlPct × effectiveLeverage`, and the top-ranked positions are closed against the deficit at the defaulter's bankruptcy price until the deficit is covered. Each position shows an ADL indicator (5 levels) in the UI. The CRY member (Vault Exchange's arm) is the default clearing member for crypto derivatives; its own default follows §3.17.7 without step 4 (no DF), using its capital, then ADL.

#### §3.17.10 Sponsored CCPs (Dynasty content, V3 §3.12)
A player owner group with a UNIVERSAL bank, rank R6 (14) and `$10B` of capital may sponsor a new CCP for a new venue or product set (for example a player exchange concession's listed products, 09). The sponsored CCP uses this module's rules with the sponsor's chosen parameters inside regulatory bounds (13: confidence ≥ 99%, MPOR ≥ the service default, Cover-2, SITG ≥ 10% of DF). Its defaults and failures are fully the sponsor's systemic responsibility.

#### §3.17.11 TCH recovery and resolution
If waterfall steps 7–9 are used, 13 places TCH in recovery: members' assessments are called, TCH's owner banks recapitalize it (NPC decision, 16), the service may stay closed for up to 3 game days, and the event is recorded permanently. TCH never disappears (it is a system pillar); if its capital goes negative after all steps, its owner banks absorb the loss in proportion to ownership.

### §3.18 Bilateral OTC (uncleared) and CSAs
- Uncleared trades (TRS, XCCY, bilateral FX crosses, bilateral repo, PB OTC) require a `CsaAgreement` between the parties (`bank.csa.sign`; NPC dealers sign standard terms automatically: threshold 0 for LIC4, MTA $50k, eligible: CASH, GOVT, CORP_IG).
- VM exchanged daily at t = 719 on the netted PV of all trades under the CSA. Bilateral IM for uncleared derivatives when both parties are LIC4 or institutions: HVaR 99% over 10 game days, or the schedule (equity 15%, FX 6%, rates 1–4% by tenor, commodity 15% of notional) if the parties choose; IM is held at TCH ESC, segregated, not re-usable.
- Default: the non-defaulting party computes the close-out amount (mid ± half the 06 RFQ spread, for all trades), nets it, applies collateral, and claims the remainder as an unsecured claim (in 13 or bank resolution). Counterparty risk is therefore real for uncleared products (V3 §3.5).

### §3.19 Bankruptcy interplay (with ROADMAP 2.6 and 03)
At a character's bankruptcy fresh start: NPC bank loans and lines are discharged (banks write them off: losses to NPC banks are real and feed their CET1); margin and NPC credit are blocked for 14 real days; ClearingDebt, player-lender loans, 15 loan contracts and court judgments survive; deposits at banks are part of the estate (paid to creditors first); the credit profile records the bankruptcy (score term §3.4.2).

### §3.20 Escrow and custody (TCH ESC service)
- Holds: 15 contract escrow, 13 judgment escrow during appeals, 08 fund custody (fee 0.25%/yr, SINK per ROADMAP 2.2), 09 IPO book escrow, bilateral IM, collectible-loan items (06/07), auction bid holds for large lots.
- Escrowed assets are bankruptcy-remote: never lent, never re-used, not part of TCH's waterfall, not part of any party's estate until released.
- Cash in escrow is held as a deposit of TCH at the central bank of its currency (reserve account), so a commercial bank failure never touches escrow.
- Custody fee for securities held outside a fund: none for retail (exchange custody is free), `PARAM.custody_fee_ppm_gy = 200` ppm/yr on the excess above `PARAM.custody_fee_threshold_real = $1B` × MSI for LIC4 accounts, accrued daily at rate/364, TRANSFER `CCP_CUSTODY_FEE` to TCH (E-9; Producer ruling E-38, was SINK; PROVISIONAL [Quant]); TCH margin collateral is excluded from the base.

### §3.21 Systemic-risk indicators (PUBLIC dashboard, V3 Part 10)
Updated each game hour unless noted; aggregates only, never an individual position (L11):
| Indicator | Definition |
|---|---|
| Bank confidence board | Every bank's confidence band (§3.9.1), run flag, status |
| Capital distribution | CET1 quartiles per bloc from the last quarterly filings |
| Interbank stress | ONR − policy rate; volume vs 30-day average; refused borrower count |
| Repo stress | GC rate − DFR; haircut index (volume-weighted average haircut vs base); specials count |
| Securities-lending utilization | Market-wide index; top 20 most utilized assets (asset-level aggregate) |
| Margin utilization | Σ IM / Σ equity across all margin accounts, per service; number of accounts in CALL / LIQUIDATING |
| CCP | IM totals, DF sizes, DF usage, insurance fund balances, ADL count (CRY), last default events |
| Credit | Aggregate credit growth y/y per bloc, standards index (mean S), NPL ratio, default rates by segment |
| CB facility use | MLF/ELA totals (7-game-day lag) |
| Deposit flows | Net flows between banks per bloc (daily) |
| Player leverage | Aggregate player debt / NW by rank band (daily) |

### §3.22 Hooks and outputs shared with 04 (macro)

**Shock hooks 07 implements (called by 04 §5 crisis table, applied at P1 of the next tick):**

| Hook | Effect in 07 |
|---|---|
| `corporatePdMultiplier(bloc \| 'WORLD', mult, days)` | Multiplies the NPC corporate default intensity used in §3.5.4 aggregate default rates and the PD input to §3.3.1 loan pricing, for `days` game days. Several active multipliers multiply together, capped at `PARAM.max_pd_multiplier = 5` (DEFAULT (Mathis may override)). |
| `depositConfidenceShock(bankIds[], delta)` | Adds `delta` to each named bank's confidence C (§3.9.1) at once, clamped to [0, 1]. It is not smoothed by the α update, so it can start a run on its own if C falls under `PARAM.run_c_crit`. |
| `repoHaircutShock(assetKind, deltaPts, days)` | Adds `deltaPts` percentage points to the §3.15.6 haircut table row for `assetKind`, for `days` game days. Existing repos are re-margined at the next hourly check, which can issue repo calls (§3.12.4). |

**Outputs 07 supplies to 04 each day close (P14), per bloc:**
- `creditOutstanding`: NPC plus player loans to the non-bank sector, plus corporate bonds outstanding (from 06 §3.5).
- `creditConditions = clamp(1 − 2·S̄, −1, 1)`, where S̄ is the loan-weighted mean lending standard from §3.5.3 (S ∈ [0, 1], 0 is loosest).
- `interbankSpread`: ONR minus the CB policy rate, in bp (§3.7.4).
- `repoHaircutIndex`: volume-weighted average haircut divided by the base table average.
- `repoLeverageIndex`: Σ repo borrowing ÷ Σ equity of repo borrowers, divided by its 1-game-year average.
- `ccpDfUsage`: the share of the default fund used in the last 30 game days, per service.
- `weakBanks`: the ids of NPC banks below 1.2× their capital minimum, which 04 uses for the BANKING_PANIC trigger.

---

## §4 Player intents

Namespace `bank.*` (Clearing House intents under `bank.ccp.*`). Common P1 validation: Held state (Held characters may only deposit, repay, meet margin calls and move deposits), ClearingDebt blocks (§3.16.5), license and charter requirements, beneficial-owner limits, balances, rate limits.

| Kind | Payload | Validation | Effect |
|---|---|---|---|
| `bank.account.open` | `{ bankId, kind, ccy }` | Bank ACTIVE; presence in bloc (§3.1.1); ≤ 5 accounts per bank | New DepositAccount |
| `bank.account.close` | `{ accountId, toAccountId }` | Balance moves out; TERM forfeits interest | Closed |
| `bank.account.setHome` | `{ accountId }` | Own SIGHT account | Income routing |
| `bank.deposit.move` | `{ fromAccountId, toAccountId, amount | 'ALL' }` | Not frozen; destination own account | Payment P8/P13 (run participation) |
| `bank.deposit.term` | `{ accountId, amount, termDays: 7 | 28 | 91 }` | Balance | TERM account at current rate |
| `bank.sweep.set` | `{ accountId, targetBalance, destination, fundId? }` | 08 fund eligible | Daily sweep at t = 719 |
| `bank.loan.apply` | `{ lenderId, kind, amount, ccy, termDays, collateral[], purpose }` | Product enabled; §3.3.1 | Offer event or refusal with reason |
| `bank.loan.accept` | `{ offerId }` | Offer valid (30 ticks) | Booking (CREDIT_CREATE) |
| `bank.loan.draw` / `bank.loan.repay` | `{ loanId, amount }` | Within limit / ≤ outstanding + accrued | Draw / repay |
| `bank.loan.cure` | `{ loanId, addCollateral[] | cash }` | DELINQUENT or covenant breach | Cures |
| `bank.loan.restructure` | `{ loanId, proposal }` | Borrower or lender; counterparty response within 1 game day | §3.3.6 |
| `bank.collateral.pledge` / `release` | `{ loanId, asset }` | Asset unencumbered / LTV after release within limit | Pledge record |
| `bank.sl.optIn` / `optOut` | `{ assetId | 'ALL' }` | LIC1 holder | Lendable supply |
| `bank.sl.borrow` / `bank.sl.return` | `{ assetId, qty, termDays? }` / `{ slId, qty }` | LIC4; availability | SecLoan |
| `bank.repo.order` | `{ side: 'BORROW_CASH' | 'LEND_CASH', venue, basket | assetId, amount, tenor, limitRate }` | LIC4 or bank/fund; collateral available | Joins hourly auction or RFQ |
| `bank.repo.close` / `bank.repo.substitute` | `{ repoId }` / `{ repoId, newCollateral }` | Party; open or term with break cost | Close / substitute |
| `bank.pb.open` / `bank.pb.close` | `{ primeBrokerId }` / `{ pbAccountId }` | LIC4; PB accepts by tier rules | PB account |
| `bank.margin.deposit` / `withdraw` | `{ accountId, asset, amount }` | Withdraw only if equity − amount ≥ IM × 1.1 | Collateral moves |
| `bank.margin.setType` | `{ accountId, type: 'PORTFOLIO' }` | LIC4 | Switch model at next P7 |
| `bank.charter.apply` | `{ tier, bloc, homeCityId, initialCapital, nameKey }` | §3.11.1 requirements; capital in cash | Application; 13 decision in 1 game week |
| `bank.charter.upgrade` / `surrender` | `{ bankId, tier }` / `{ bankId }` | Requirements / orderly wind-down (sell book, repay deposits) | Tier change / closure |
| `bank.policy.set` | `{ bankId, partial BankPolicy }` | Owner or mandated operator; regulatory caps | Effective next day close (rates immediately) |
| `bank.branches.set` | `{ bankId, cityId, count }` | Bank tier scope | Opex and deposit attractiveness |
| `bank.capital.inject` / `bank.capital.dividend` | `{ bankId, amount }` | Owner; dividend within MDA | CET1 change |
| `bank.bond.issue` | `{ bankId, seniority: 'SENIOR' | 'SUB' | 'AT1', size, maturity }` | COMMERCIAL+ | 06 primary auction |
| `bank.interbank.order` | `{ bankId, side, amount, limitRate, counterpartyLimits }` | Player bank, MANUAL mode | Joins hourly match |
| `bank.cb.facility` | `{ bankId, kind: 'MLF', amount, collateral }` | Eligible collateral | Intraday/overnight MLF draw before day close (ELA and deposit-facility moves use 04's `bank.cb.elaRequest`, `bank.cb.deposit`) |
| `bank.resolution.bid` | `{ resolutionId, package, price, capitalInjection }` | §3.10.3 eligibility | Bid recorded |
| `bank.ccp.join` / `leave` | `{ memberEntityId, service, dfCollateral }` | §3.17.3; leave only with no positions, after 28 game days notice | Membership |
| `bank.ccp.auctionBid` | `{ defaultId, lotId, price }` | Member | Bid |
| `bank.ccp.sponsor` | `{ ownerGroupId, products, params }` | UNIVERSAL bank, R6, $10B capital; §3.17.10 bounds | Sponsored CCP created (E-38) |
| `bank.ccp.segregation` / `backupMember` | `{ mode }` / `{ memberId }` | LIC4 client | Account settings |
| `bank.csa.sign` | `{ counterpartyId, terms }` | Both LIC4 or institution | CSA |
| `bank.clearingDebt.repay` | `{ debtId, amount }` | Cash | Reduces debt |

---

## §5 Engine events

| Kind | Visibility | Payload / notes |
|---|---|---|
| `bank.account.opened` / `closed` | PRIVATE | — |
| `bank.deposit.moved` | PRIVATE (aggregate flows PUBLIC daily) | amount, from bank, to bank |
| `bank.interest.posted` | PRIVATE | per account per day |
| `bank.rates.changed` | PUBLIC | bank, product rates (a bank's offered rates are public) |
| `bank.loan.offered` / `originated` / `repaid` | PARTIES | terms; aggregate origination PUBLIC daily |
| `bank.loan.delinquent` / `defaulted` | PARTIES + SEALED (evidence) | DPD, amounts |
| `bank.covenant.breached` | PARTIES | covenant, cure deadline |
| `bank.collateral.enforced` | PARTIES | asset, proceeds, shortfall |
| `bank.credit.profileUpdated` | PRIVATE | grade change |
| `bank.interbank.hour` / `bank.onr.fixing` | PUBLIC | volume, VWAP / ONR |
| `bank.cb.facilityUsed` | PRIVATE; lagged PUBLIC report | amount |
| `bank.confidence.band` | PUBLIC | band changes only |
| `bank.run.started` / `bank.run.ended` | PUBLIC | bank, outflow24h band |
| `bank.capital.status` | PRIVATE to owner and regulator; PUBLIC at quarterly filing | status transitions |
| `bank.failed` / `bank.resolution.opened` / `bank.resolution.outcome` | PUBLIC | trigger, tool, acquirer, bail-in by class |
| `bank.dgf.payout` | PARTIES; aggregate PUBLIC | insured amounts |
| `bank.charter.granted` / `revoked` / `bank.sib.designated` | PUBLIC | — |
| `bank.stressTest.result` | PUBLIC | stressed min CET1 |
| `bank.sl.recall` / `bank.sl.buyin` | PARTIES; buy-in aggregate PUBLIC | — |
| `bank.sl.utilization` | PUBLIC daily | per asset |
| `bank.short.filing` | PUBLIC (+720 ticks) | holder, asset, net short % (≥ 1%) |
| `bank.repo.gcRate` | PUBLIC | per bloc per hour |
| `bank.repo.marginCall` / `bank.repo.default` | PARTIES | — |
| `bank.pb.termsChanged` / `bank.pb.terminated` | PARTIES | — |
| `bank.margin.call` / `bank.margin.liquidation` / `bank.margin.deficit` | PARTIES; aggregate counts PUBLIC | amounts, positions closed |
| `bank.clearingDebt.created` / `repaid` | PRIVATE | — |
| `bank.ccp.dfResized` | PUBLIC | per service |
| `bank.ccp.memberDefault` | PUBLIC | member, service |
| `bank.ccp.porting` / `bank.ccp.auction` / `bank.ccp.waterfall` | PUBLIC (layer used, total), PARTIES (member shares) | — |
| `bank.ccp.adl` | PARTIES; count PUBLIC | — |
| `bank.ccp.serviceStatus` | PUBLIC | OPEN / DEFAULT_MANAGEMENT / RECOVERY / CLOSED |
| `bank.systemic.snapshot` | PUBLIC hourly | §3.21 |

All money movements of these events are 03 Postings with reason codes from 03's catalog, chiefly: `BNK_DEPOSIT_IN/OUT`, `BNK_DEPOSIT_INTEREST`, `BNK_LOAN_DRAWDOWN`, `BNK_MORTGAGE_DRAWDOWN`, `BNK_CREDIT_LINE_DRAW`, `BNK_OVERDRAFT_DRAW`, `PB_MARGIN_LOAN` (CREDIT_CREATE), `BNK_LOAN_REPAY`, `BNK_MORTGAGE_REPAY`, `BNK_CREDIT_LINE_REPAY`, `PB_MARGIN_REPAY`, `BNK_COLLATERAL_PROCEEDS_APPLY` (CREDIT_DESTROY), `BNK_LOAN_INTEREST`, `BNK_LOAN_FEE`, `BNK_INTERBANK_LEND/REPAY/INTEREST`, `BNK_DEPOSIT_INSURANCE_PREMIUM/PAYOUT`, `BNK_BAILIN_CONVERSION`, `BNK_CAPITAL_INJECTION`, `BNK_COLLATERAL_SEIZE`, `BNK_LOAN_CHARGEOFF`, `LED_ECL_PROVISION` (REVALUE), the `BNK_ELASTIC_*` codes for hh/frm, `REPO_*` and `REPO_BANK_*`, `SECLEND_FEE`, `SECLEND_MANUFACTURED_DIVIDEND`, `PB_MARGIN_INTEREST`, `PB_FEE`, `PB_CUSTODY_FEE`, `CCP_INITIAL_MARGIN`, `CCP_VARIATION_MARGIN`, `CCP_DEFAULT_FUND`, `CCP_FEE`, `CCP_INTEREST_ON_MARGIN`, `CCP_WATERFALL_ALLOCATION`, `CCP_ASSESSMENT`, `CCP_LIQUIDATION_PROCEEDS`, `CCP_SKIN_IN_GAME_LOSS`, `ESCROW_*` (15), and 04's `CBK_STANDING_FACILITY`, `CBK_EMERGENCY_LIQUIDITY`, `CBK_RESERVE_PENALTY`. Codes this module needed that 03 has now added to its catalog (03 §3.4.2–§3.4.3; ruling in 24): `CCP_LIQUIDATION_PENALTY` (TRANSFER, account → insurance fund or member), `CCP_INS_FUND_SWEEP` (SINK, §3.16.5), `BNK_FX_MARGIN` (TRANSFER, fee to bank), `BNK_ENFORCEMENT_FEE` (TRANSFER), `CLR_DEBT_REPAY` (TRANSFER).

---

## §6 NPC behaviour

### §6.1 NPC banks
- **Roster:** 26 at launch (22 names them): per bloc 1 NPC_SIB, 2 NPC_COMMERCIAL, 2 NPC_REGIONAL (one per non-capital city where needed so that every city has a retail NPC bank), plus 1 NPC_PRIVATE on Isla Serena. Three of the SIBs (FDL, EUN, PYN) are prime brokers; every SIB and one commercial bank per bloc are primary dealers and TCH members; one commercial bank per bloc runs a custodian / securities-lending agent and the tri-party service.
- **Strategy archetypes** (`NpcBankStrategy`): CONSERVATIVE (CET1 target req + 4%, HQLA 25%, loan growth 4%/yr, tol 1%), BALANCED (req + 2.5%, 18%, 7%, 2%), GROWTH (req + 1.5%, 12%, 12%, 3%), INVESTMENT (universal; trading book up to 15% of assets), REGIONAL (single city, mortgages 60% of book). 16 named-actor models (bank CEOs) may shift these by ±50% with personality and memory (W04 "a bank protecting liquidity").
- **Daily loop (t = 719, P8):** (1) provisions and P&L; (2) status checks; (3) capital actions (§3.6); (4) set deposit rates: `rate = competitorAvg + 0.25% · (fundingGap / deposits) / 0.05`, clamped to pass-through bounds; (5) set loan spreads from the grid with the standards add-on; (6) aggregate lending allocation (§3.5); (7) securities rebalance toward HQLA target, buying own-bloc govt bonds in primary auctions; (8) OIS hedge to hedgeRatio (0.5 default); (9) interbank tolerance update.
- **Hourly:** interbank and GC repo participation by reserve gap; run responses (§3.9.4).
- **Player credit:** NPC banks accept any application satisfying §3.3.1 and §3.4.3 (no discretion, no knowledge of the player's plans, C09).
- NPC banks never know private player information; they see only bureau data and public filings.

### §6.2 Aggregate depositors and borrowers
Defined in §3.1.4, §3.5, §3.9.3 (deterministic functions of public state).

### §6.3 Money market funds (08 owns the funds)
Government MMFs and prime MMFs: lend cash in GC and tri-party repo at their reservation rates; prime MMFs hold bank deposits and pull them (financial outflow rates) when a bank's band falls to Strained; flight to government MMFs in stress.

### §6.4 NPC securities lenders, PBs, dealers
Agents run §3.13 mechanically. NPC PBs apply §3.14 terms by tier with the stress rule. NPC dealers quote repo RFQs at GC ± 5–25 bps by tenor and collateral.

### §6.5 NPC clearing members
Pay DF contributions; bid in default auctions at `model value − 2·IM_lot · (0.2 + fear)` subject to capacity (their CET1 headroom); accept porting per §3.17.7.

### §6.6 Central banks and regulators
04 sets corridor rates, rr, CCyB, OMOs and decides ELA; 13 decides fit-and-proper, failure determinations, stress-test follow-ups and sanctions. This module calls their interfaces and never decides for them.

---

## §7 Screens (layouts in 17)

| Screen | Shows | Drives |
|---|---|---|
| **My Bank** (all players) | Accounts by bank and currency, insured vs uninsured per bank with concentration warning, interest earned, each bank's confidence band, rates on offer across banks | Open/close/move accounts, term deposits, sweeps |
| **Credit** | Credit grade and score drivers (no Reputation), PD, debt service ratio, all loans with schedules, covenants and cure clocks, offers from banks | Apply, accept, draw, repay, cure, restructure |
| **Margin & Risk** panel (in every trading screen) | Equity, IM, MM, buffer, status, liquidation line on the chart (ROADMAP N10: price at which MM is hit), what-if of a new order, ADL indicator for crypto derivatives | Deposit collateral, reduce risk |
| **Liquidation report** | Every forced close: fair value, band, fill price, penalty, deficit; links to 18's "why" explanation | — |
| **Borrow & Short** ticket section | Availability, utilization, fee, recall risk badge, short-interest | Short orders (05) with locate |
| **Securities lending** | Lendable positions, opt-in toggles, fees earned | Opt in / out |
| **Repo desk** (LIC4) | GC rates per bloc, specials, haircut table, my repos, margin calls | Repo orders, substitutions |
| **Prime brokerage** (LIC4) | Tier, leverage, financing, margin by risk factor, stress what-if, lock-up terms, rehypothecation | Collateral transfers, rehypothecation opt-out |
| **Bank HQ** (charter owners) | Balance sheet (03 statements), CET1/leverage/LCR/NSFR gauges vs requirements, P&L, NIM, loan book by segment and stage, deposit franchise and market share, duration gap, interbank and CB usage, confidence and drivers, run monitor, stress-test results | Policy, branches, capital, bonds, interbank, facilities, run playbook editor |
| **Charter office** | Tier requirements, my eligibility, application status | Apply / upgrade |
| **Resolution room** | Open resolutions, valuation, packages, bids, outcome | Bid |
| **Clearing House** (public) | Services, IM totals, DF sizes and usage, members list, default history, waterfall diagram with live layers | Join (members), auction bids |
| **Systemic Risk** dashboard (public) | §3.21 indicators with history | — |

---

## §8 Edge cases

1. **Payment to a bank in resolution:** incoming payments are credited normally (they increase the bank's liabilities and its reserves); during the 1-game-day freeze the insured part is usable, the rest is frozen.
2. **Depositor with accounts in several currencies at a failing bank:** the insurance cap is applied once across all currencies of that beneficial owner at that bank, converted at FX spot at the failure tick; largest balances in the bloc currency first.
3. **Bank fails while a player's loan from it is outstanding:** the loan is an asset; it goes to the acquirer or the liquidator; the borrower's terms do not change. Set-off: the borrower's frozen deposits at that bank may be set off against its loan from the same bank (`DEFAULT`: automatic set-off of uninsured deposits against matured or defaulted loans only).
4. **Two banks' runs at the same tick:** processed in hash order of bank id within P8; contagion terms use start-of-tick state, so order does not change outcomes within a tick.
5. **Interbank loan to a bank that fails overnight:** the lender's claim joins class 6 of the hierarchy.
6. **Negative policy rates (04):** DFR may be negative; retail deposit rates floor at 0; banks' NII compresses; formulas accept negatives.
7. **No eligible collateral at day close:** liquidity failure (no exception). A bank cannot be "too small to fail" or "too big to fail" by rule; SIBs get bail-in instead of fire sale.
8. **Loan payment due on a weekend:** payments post at t = 719 every day including weekends (banking runs 7 days); securities sales for enforcement wait for the market session.
9. **Borrower Held during a payment date:** payments auto-debit as normal; Held does not stop collection (03 rule "protection never blocks contract enforcement").
10. **Rookie (72h protection) borrower:** credit limits small (§3.4.3); collection still applies.
11. **Collateral asset delisted or defaulted while pledged:** re-valued at its new mark (06); LTV breach handled by covenant/call rules.
12. **Collateral seized by a court (13) while pledged:** the lien ranks first; the court gets the surplus after the secured party.
13. **Security on loan is subject to a tender:** lender must recall to tender; if recall fails by the tender deadline, the borrower pays the lender the tender consideration difference.
14. **Recall buy-in impossible (asset halted):** grace extends tick by tick until the asset reopens; fees continue.
15. **Margin account with positions in a closed market and a deficit at the open gap:** liquidation at the opening auction with the band; any deficit → ClearingDebt.
16. **A member defaults while another default is in management:** both processed; assessments share the 2× cooling-off cap; auctions may bundle.
17. **Client of a defaulting member has no backup member accepting:** positions closed out; collateral surplus returned to the client within 1 game day.
18. **CRY insurance fund negative and no ADL candidates** (all opposite positions at a loss): remaining deficit is borne by the CRY member's capital; the product halts until rebalanced.
19. **Repo collateral re-used through a chain and the original borrower defaults:** each link closes out against its own counterparty; the invariant guarantees the chain resolves to one holder.
20. **PB fails during a client's margin call:** call suspended; client assets ported; the client's rehypothecated shortfall becomes a claim.
21. **Cross-partition payments and loans:** hold → settle (02/19); a run's withdrawals that cross partitions settle in the same tick's P13 through the hold mechanism.
22. **Player bank owner goes bankrupt personally:** the bank's equity is an asset of the estate (sold via 09 or kept by creditors); the bank itself is unaffected unless its capital depended on owner guarantees.
23. **Account closed with ClearingDebt outstanding:** not allowed; closing requires zero debt or transfer of the balance to another own account.
24. **Rounding:** interest per day computed with `toMoney` on each account; remainders never accumulate across accounts (each account rounds independently with half-to-even); pro-rata DGF payouts and bail-ins distribute remainders in hash order so totals match exactly.

---

## §9 Exploits and counters

| # | Exploit | Counter |
|---|---|---|
| Y1 | Circular lending among one's own entities to inflate NW | 03 consolidation nets intra-group loans to zero; only a chartered bank creates deposits, and related-party lending is capped at 5% Tier1 at arm's length |
| Y2 | Own bank lends cheaply to its owner for trading | Related-party cap, arm's-length rate floor, quarterly disclosure, 13 audit (I07); breach is a sanctionable offence |
| Y3 | Deposit-rate war to attract deposits, then gamble | Risk-based DGF premiums, capital rules on risky assets (RW, 1250% crypto), SIB surcharge, stress tests; failure wipes the owner and bans the charter |
| Y4 | Splitting deposits across many owned banks to stay insured | Cap is per beneficial-owner group per bank; splitting across independent banks is legitimate risk management |
| Y5 | Spreading false rumors to trigger a run on a rival bank while short | Per-source rumor contribution capped at 0.3; false statements are manipulation (13, K01); short positions ≥ 1% are filed; the short-and-distort pattern feeds 05/13 surveillance |
| Y6 | Withdraw-and-return to churn a run (moving deposits back and forth) | Individual flows are private and do not move C directly (only aggregate outflow24h does); deposit moves of the same funds within 30 ticks count once |
| Y7 | Gaming retail margin with offsetting-looking positions | Retail IM is rule-based per position (no offsets except SCAN within an underlying group); portfolio offsets only at LIC4 with concentration and decorrelation stress scenarios |
| Y8 | Push a thin price to trigger others' liquidations | Triggers use band-clamped marks (06); liquidation limits anchored to fair value; 20% participation cap |
| Y9 | Deliberately blow up a margin account to dump losses on the CCP, then go bankrupt | ClearingDebt survives bankruptcy and blocks leverage; concentration and liquidity add-ons size IM for unhedgeable size; 06 position limits |
| Y10 | Lend securities to yourself to earn fees | Same beneficial-owner group cannot be lender and borrower of the same loan; fees between linked accounts flagged (15) |
| Y11 | Double-pledge collateral | Engine invariant: each unit has one legal holder and an acyclic re-use chain; pledges set `pledgedQty`, which blocks sale and re-pledge |
| Y12 | Default-auction collusion among player members (bid low, share the cheap portfolio) | Juniorization of worst bidders' DF; NPC members always bid at reservation; reservation price floor; 15 collusion graph |
| Y13 | Strategic member default to push losses onto other members | Member's DF and capital go first; SITG; owner group charter ban and 13 investigation; assessments capped so others' maximum loss is known |
| Y14 | Loan stacking across many NPC banks | Shared bureau; global DSR cap; total debt in the score |
| Y15 | Using rewarded-ad cash as margin | Restricted cash (03 §3.5.6) has collateral value 0 (ROADMAP 2.7) |
| Y16 | Borrow-to-vote (empty voting) | Borrowed shares > 1% over a record date in a contested vote flagged and disclosed (15); 13 may investigate |
| Y17 | Interbank arbitrage: borrow at DFR-ish and lend at MLFR to a weak bank | Allowed (it is the intended interbank market); exposure limits and default risk price it |
| Y18 | Term-deposit break to earn interest then exit | Break forfeits all interest of the term |
| Y19 | Bureau gaming by many tiny on-time loans | `hist` term saturates (ratio, not count); score weights leverage and income more heavily |
| Y20 | Alt-account funding via P2P loans at 0% | 15 off-market flag; account-age caps; 2% P2P tax |
| Y21 | Charter-hopping after a failure (new company as owner) | Ban applies to the beneficial-owner group (03 ownership chain + 15 linked accounts) |
| Y22 | Escrow abuse to hide assets from creditors or courts | Escrowed assets are recorded per beneficiary; courts (13) can attach the beneficiary's interest |
| Y23 | Using a sponsored CCP with lax rules | Regulatory bounds on CCP parameters (§3.17.10) enforced at P1 of parameter changes |

---

## §10 Acceptance tests

1. Every money balance is settlement cash, a deposit, or reserves (or a 03 system account) at every P13; the sum of deposits at each bank equals that bank's deposit liabilities (invariant, 20).
2. A loan booking increases the lender's loan assets and some deposit liabilities by the same amount with reason class `CREDIT_CREATE`; broad money (settlement cash + deposits) rises by that amount and base money (settlement cash + reserves) is unchanged until the proceeds are withdrawn to settlement cash, which moves reserves out of the lender without changing the total.
3. A principal repayment reduces broad money by the repaid amount with class `CREDIT_DESTROY`; interest payments do not change broad money.
4. Interbank payments net per tick: Σ of all banks' reserve changes from payments is exactly zero per currency per tick.
5. A bank with negative reserves at t = 719 and sufficient pledged collateral receives an MLF loan for exactly the shortfall; without collateral, it enters resolution with trigger LIQUIDITY at that day close.
6. Deposit interest equals `balance · rate / 364` rounded half-to-even per account per day; TERM breaks forfeit all accrued term interest and never touch principal.
7. CET1, RWA, leverage ratio and LCR computed for a hand-built balance sheet match the §3.2 formulas exactly; status transitions follow the table at the stated thresholds.
8. A bank below its combined buffer cannot pay dividends above the MDA fraction; a RESTRICTED bank's new-loan offers are refused.
9. Loan pricing for a given grade, collateral and S equals the §3.3.1 formula; a higher S yields a strictly higher rate and lower maximum LTV.
10. Annuity, linear, bullet and IO-then-annuity schedules repay exactly the principal by maturity (final payment absorbs rounding).
11. A loan 1 game day past due becomes DELINQUENT with penalty accrual; at 3 days it DEFAULTS and collateral enforcement starts on the next tick; curing before day 3 restores PERFORMING.
12. Enforcement proceeds apply in the order fees, penalty, interest, principal; surplus returns to the borrower; shortfall becomes a judgment debt; NPC-lender judgments are discharged by a bankruptcy fresh start and player-lender ones are not.
13. Provisions move from Stage 1 to 2 to 3 under the stated triggers, and changes post as REVALUE without cash.
14. The credit score does not change when Reputation or Prestige changes, holding all other inputs fixed.
15. A new $5,000 character scores within 540–580 (BB) and is offered a personal line ≤ $500 inside the 72-hour window and ≤ min(10% NW, 3 × income30d) after.
16. A new loan that would push DSR above 0.50 (unsecured) is refused.
17. In a 3-game-year harness run, aggregate credit growth is positively correlated with the previous year's bank profitability and negatively with lagged loss rates (credit cycle); recessions raise S, lower credit growth and raise default rates.
18. Aggregate default rates follow §3.5.4 for given u, gap, HPI and spreads; mortgage defaults feed 10's forced-sale supply.
19. Hourly interbank match: no lender exceeds its limit or its gap; borrowers with PD above lender tolerance receive nothing from that lender; ONR equals the volume-weighted rate of the day's loans or the fallback when volume is below threshold.
20. MLF/ELA use above thresholds becomes public with a 7-game-day lag; ELA is granted only through 04's decision function.
21. DGF pays every insured depositor of a failed bank within 720 ticks, never more than the cap per beneficial-owner group per bank across currencies; premiums follow the risk-based formula.
22. Confidence follows the §3.9.1 update with asymmetric speed; publishing a CET1 loss lowers C; a single rumor source cannot contribute more than 0.3 to the rumor term.
23. In a scripted scenario where a bank's published CET1 falls below requirement and a true rumor appears, outflows exceed 10% within 24 game hours (a run starts); granting ELA prevents failure; without ELA and without collateral the bank fails on liquidity.
24. A run at one bank raises outflows at banks with high similarity within the same bloc (contagion) and not at dissimilar banks in other blocs.
25. Resolution chooses the least-cost tool; in bail-in, losses hit equity, AT1, subordinated, senior, uninsured corporate, uninsured natural persons in that order, and insured deposits are never haircut.
26. A failed player bank: owner equity zero, charter revoked, owner group blocked from `bank.charter.apply` for 1 chapter, permanent history entry; the owner's assets outside the bank are untouched.
27. Charter applications are refused below the rank, license, capital and fit-and-proper requirements of §3.11.1 and accepted when met; approval completes after 1 game week.
28. A COMMUNITY bank cannot exceed $2B deposits, offer PB or join the CCP; a UNIVERSAL bank can.
29. SIB designation triggers automatically at the asset thresholds at a quarter end and applies the surcharge from the next day.
30. GC repo auction clears at a uniform rate; collateral haircuts equal the table × stress multiplier; a repo margin call unmet within 30 ticks leads to collateral sale through the liquidation engine.
31. Specials: a bond with SL utilization 0.9 has repo rate GC − 1.5%; utilization ≤ 0.6 has no specialness.
32. The re-use invariant holds after any sequence of repos, re-pledges and sales generated by the adversarial swarm (20).
33. A short-sale order without an available locate is rejected (HTB at utilization ≥ 0.95); a filled short creates a SecLoan; unused locates are released the same tick.
34. Borrow fee equals the cubic utilization formula, charged daily on the close mark; lenders receive 70%.
35. A recalled loan not returned within 360 ticks is bought in by the engine within the band, costs charged to the borrower.
36. Net short positions ≥ 1% of free float are published as filings 720 ticks later; smaller ones never appear individually.
37. PB tiers cap gross leverage at 8×/5×/3×; margin terms do not worsen inside the lock-up notice except on a termination event; rehypothecation never exceeds 1.4 × debit.
38. A PB failure returns segregated assets within 1 game day and converts unrecoverable rehypothecated assets into claims.
39. Retail IM: a 2× long equity position at LIC2 has IM 50% and MM 25% of notional; a perp at LIC3 caps at 10×; S3+ court case halves maximum leverage; post-bankruptcy accounts cannot open margin for 14 real days; restricted cash (03 §3.5.6) adds 0 to equity for margin.
40. EWMA vol and APC: with w = 0.25, IM in a calm year never falls below the stressed floor; a volatility doubling raises SCAN IM by at least 60% within 240 ticks (procyclicality is present).
41. SCAN IM for a single long future equals the largest scenario loss; a calendar spread pays the spread charge; inter-group credits only apply for ρ > 0.7 with opposite deltas.
42. A retail account below MM generates liquidation orders in P7 of tick N that execute no earlier than P6 of tick N+1, with limit prices within the band around fair value and participation ≤ 20%.
43. A deficit after liquidation creates a ClearingDebt that blocks margin, P2P outflows, ops and lifestyle purchases above $1,000 but allows spot trading with own cash and T1–T2 businesses; 30% of daily net income repays it; it survives bankruptcy.
44. Every cleared trade is novated so each party's counterparty is TCH; positions net within accounts.
45. DF sizing equals Cover-2 of stressed losses beyond IM, at least the service minimum; contributions are pro rata to IM with a $10M floor.
46. A simulated member default runs porting, hedging, auction and the waterfall in the exact order of §3.17.8; juniorized members lose first in layer 4; assessments never exceed 1× per event or 2× per 30-game-day window; no loss reaches a non-member.
47. CRY: a deficit beyond the insurance fund triggers ADL in descending score order at the bankruptcy price until covered; no mutualized DF exists for CRY.
48. A bilateral TRS default produces a close-out amount netted across the CSA, collateral applied, remainder as an unsecured claim.
49. Escrowed assets are never used in any waterfall, bank resolution or bankruptcy estate before release.
50. Systemic dashboard values are aggregates only; no field of any PUBLIC event from this module identifies a player's position, except legal filings (short ≥ 1%) and bank-level data of chartered banks.
51. Determinism: replaying a 30-game-day crisis seed (run, ELA, member default) twice yields byte-identical event streams and balances.
52. Performance: with 26 NPC banks, 200 player banks, 600k margin accounts and 20k agents, P7 + P8 work of this module stays within the budget 19 assigns (benchmark target ≤ 150 ms per partition per tick, hourly jobs ≤ 400 ms).
