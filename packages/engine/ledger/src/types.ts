import type { Ccy, Id, Money, Price, Qty, Tick } from './money';
import type { TemplateId } from './catalog';
import type { AccountClass } from './accounts';

export type PhaseId = `P${number}`;
export type EntityKind =
  | 'sys' | 'cbk' | 'gov' | 'reg' | 'crt' | 'exc' | 'ccp' | 'rat' | 'bnk' | 'ins' | 'fnd' | 'spv' | 'cmp' | 'biz' | 'prop'
  | 'ali' | 'npc' | 'hh' | 'frm' | 'row' | 'chr';
export const ENTITY_KINDS: readonly EntityKind[] = [
  'sys', 'cbk', 'gov', 'reg', 'crt', 'exc', 'ccp', 'rat', 'bnk', 'ins', 'fnd', 'spv', 'cmp', 'biz', 'prop', 'ali', 'npc', 'hh', 'frm', 'row', 'chr',
];
export type Perimeter = 'PLAYER' | 'NPC' | 'ELASTIC' | 'SYSTEM';
export type PayAccountChoice = { kind: 'CASH' } | { kind: 'BANK'; bankId: Id };

/** Bloc ids are currency codes (24 R39); one definition, in core (AC-03-MAP-NO-DUP (a)). */
import type { BlocCode } from '@tycoon/engine-core';
export type { BlocCode };
export type Jurisdiction = BlocCode | 'SERENA';
export type EntityStatus = 'ACTIVE' | 'FROZEN' | 'INSOLVENCY_REVIEW' | 'IN_INSOLVENCY' | 'DISSOLVED';

/**
 * 03 §2.1 entity + rail defaults (03 §3.3.4). T03-01 fields V3 lacked are optional (E-79).
 * Lifecycle (03 §3.1): accounts open lazily on first posting (T03-08); dissolution requires zero balances (T03-25).
 */
export interface LedgerEntity {
  id: Id; kind: EntityKind; ownerId: Id | null; reportingCcy: Ccy;
  payFrom: PayAccountChoice; receiveInto: PayAccountChoice;
  status?: EntityStatus;   // E-15.2: DISSOLVED entities take no posting except LED_DISSOLUTION
  nameKey?: string; rootOwnerId?: Id; perimeter?: Perimeter; homeBloc?: Jurisdiction; homeCity?: string;
  partitionId?: string; createdTick?: Tick; closedTick?: Tick;
  railChangeTick?: Tick;   // acct.payment.setAccounts takes effect from this tick
}

/**
 * 03 §2.2 account row view (verbatim field names); the stored shape stays invariants.ts `Bal` (E-79).
 * Sign convention (03 §3.3.1): a debit adds `amount`, a credit subtracts it. ASSET/EXPENSE normally positive,
 * LIABILITY/EQUITY/INCOME normally negative; per entity and currency Σ non-MEMO balances = 0.
 */
export interface Account {
  key: string; entityId: Id; code: number; sub?: string; ccy: Ccy; class: AccountClass;
  /** `openedTick` (E-79): the commit tick that created the account. */
  balance: Money; qty?: Qty; assetId?: Id; isMoney: boolean; openedTick: Tick;
}

/** Spec §2.2 (T03-01) + Δ5 flowLeg. */
export interface Posting {
  tick: Tick; entryId: Id; postingSeq: number;
  debitAccount: string; creditAccount: string;
  amount: Money; ccy: Ccy; reason: string; refs: Id[];
  qty?: Qty; assetId?: Id; legOf?: { legId: string; side: 'A' | 'B' };
  flowLeg?: true;
}
export interface Entry {
  entryId: Id; tick: Tick; template: TemplateId; reason: string; postings: Posting[];
  requestedBy: { module: string; phase: PhaseId; entityId?: Id; intentId?: Id };
  holdId?: Id; headline?: { amount: Money; ccy: Ccy; counterpartyId?: Id };
  invalid?: { invariantId: string; observed: string; expected: string };
  /** Parties the template was called with; borrowerId for LEND/REPAY/CB_CREDIT(_UNWIND) (PR #3 review F1, X-4). */
  meta?: {
    parties: Id[]; borrowerId?: Id;
    escrow?: { op: 'PLACE'; row: ConflictEscrow } | { op: 'SETTLE'; escrowId: Id; toAttacker: Money; toVictim: Money };
    accrual?: { id: Id; accrued?: Money; settled?: Money };
    garnish?: { id: Id; amount: Money };
  };
}
export interface Hold {
  holdId: Id; owner: Id; kind: 'CASH' | 'QTY'; ccy?: Ccy; assetId?: Id; amount: bigint; remaining: bigint;
  parts: { accountKey: string; amount: bigint; remaining: bigint }[];
  expiresTick: Tick; ref: Id; placedTick: Tick; purposeCode?: string;
  status: 'ACTIVE' | 'SETTLED' | 'RELEASED';
}
export interface Reject { code: 'LED_INSUFFICIENT_FUNDS' | 'LED_INSUFFICIENT_QTY' | 'LED_RESTRICTED_FUNDS' | 'LED_BAD_EXPIRY' | 'LED_UNKNOWN_ENTITY' }
export function isReject(x: unknown): x is Reject {
  return typeof x === 'object' && x !== null && 'code' in x;
}

/** led.escrow row (spec §6.11 Δ14). */
export interface ConflictEscrow {
  escrowId: Id; victimId: Id; attackerId: Id; opId: Id; code: string; ccy: Ccy; amount: Money;
  placedTick: Tick; expiresTick: Tick; caseId: Id | null; status: 'HELD' | 'RELEASED' | 'CLAWED_BACK' | 'SPLIT';
}
/** Accrual registry row (errata E-14). a = receivable holder (payee), b = payer. */
export interface AccrualRow { accrualId: Id; kind: string; code: string; module: number; a: Id; b: Id; ccy: Ccy; payable: number; accrued: Money; settled: Money }

/** 03 §2.4 tax tag of a reason code. */
export type TaxTag = 'DIV' | 'INT' | 'RENT' | 'ROYALTY' | 'BIZ' | 'SERVICE' | 'OTHER' | 'GAIN' | 'GAIN_SHORT' | 'EXEMPT' | 'FINE' | 'ILLICIT'
  | 'DONATION' | 'HOSTING' | 'P2P' | 'P2P_IF_RELATED' | 'VAT_FINAL' | 'TAX';
/** 03 §2.9. */
export type TaxType = 'PERSONAL_INCOME' | 'CAPITAL_GAINS' | 'CORPORATE' | 'PROPERTY' | 'VAT' | 'SEC_TX' | 'STAMP' | 'P2P' | 'WHT' | 'EXIT' | 'FRANCHISE';
/** 03 §2.10, in priority order. */
export type ClaimRank = 'SECURED' | 'ADMIN' | 'TAX' | 'WAGES' | 'DEPOSITS_INSURED' | 'SENIOR_UNSECURED' | 'SUBORDINATED' | 'PREFERRED_EQUITY' | 'COMMON_EQUITY';
export type MarkSource = 'CLEAR' | 'CLOSE' | 'NAV' | 'MODEL_FUND' | 'MODEL_CURVE' | 'MODEL_OPTION' | 'APPRAISAL' | 'INDEX' | 'COST_LESS_AMORT' | 'RECOVERY' | 'ZERO';
export interface Mark {
  assetId: Id; tick: Tick; price: Price; ccy: Ccy; source: MarkSource;
  confidence: 'LIQUID' | 'MODEL' | 'APPRAISAL' | 'STALE'; validUntilTick: Tick;
}
/** A fact another module pushes into 03 (event edges, 19 Rule 12.4.2). id = `${kind}:${subjectId}`. */
export interface LedgerFact { id: string; kind: LedgerFactKind; subjectId: Id; value: unknown; tick: Tick }
export type LedgerFactKind =
  | 'POLICY_RATE_E6'          // subject bloc; value number (04)
  | 'FX_MARK_E6'              // subject `${from}>${to}`; value bigint string, units of `to` per `from` (05)
  | 'INTRADAY_CREDIT_LIMIT'   // subject bnkId; value Money string (07)
  | 'OVERDRAFT_LIMIT'         // subject accountKey; value Money string (07)
  | 'BANK_FROZEN'             // subject bnkId; value boolean (07, edge case 2)
  | 'COURT_FREEZE'            // subject entityId; value boolean (13)
  | 'HELD'                    // subject chrId; value boolean (13.A)
  | 'LICENSE'                 // subject chrId; value 'LIC0'..'LIC4' (14.A)
  | 'HOME_IN_BLOC'            // subject `${chrId}:${bloc}`; value boolean (10)
  | 'LAST_ACTIVE_TICK'        // subject chrId; value Tick of last accepted human intent (14.A)
  | 'ACTIVE_DAYS'             // subject chrId; value number[] game-day indexes with an accepted human intent (last 168)
  | 'ACCOUNTING_FIRM_TIER'    // subject entityId; value number tier (09)
  | 'LIFESTYLE_SPEND_4Q'      // subject chrId; value Money string (14)
  | 'TIPS_4Q'                 // subject chrId; value number (16)
  | 'MARKET_STATS'            // subject assetId; value { adv20; sigmaDaily; listedBloc; product; outstanding } (05/06)
  | 'BOARD_CONTROL'           // subject `${holderId}:${issuerId}`; value boolean (09 governance)
  | 'SHARE_CLASS'             // subject `${issuerId}:${shareClass}`; value { votesPerShare; economicWeight; outstanding } (09)
  | 'LINKED_ACCOUNTS'         // subject chrId; value Id[] (15 anti-cheat)
  | 'SERENA_PROPERTY'         // subject cmpId; value boolean (10)
  | 'ESCROW_OPEN_TOTAL'       // subject ccy; value Money string: Σ open contract escrow obligations (15, I14)
  | 'SEC_BORROW'              // subject `${entityId}:${assetId}`; value Qty string borrowed (07, I9)
  | 'ELIGIBLE_COLLATERAL'     // subject bnkId; value Money string pledged eligible collateral at the cbk (07; D050)
  | 'DEPOSIT_INSURED_LIMIT'   // subject bnkId; value Money string insured limit per depositor (07; T03-13)
  | 'RESOLUTION_RECOVERY'     // subject bnkId; value fraction recovery announced for uninsured deposits (07)
  | 'HELD_FOR_USE'            // subject propId or asset account key; value boolean (10/09; T03-14)
  | 'APPRAISAL_EVENT'         // subject propId or itemId; value { tick, kind } (10/06; T03-14)
  | 'REPLACEMENT_COST'        // subject modelId; value Money string (11; T03-14)
  | 'MODEL_IMPAIRMENT_PCT'    // subject modelId; value fraction (11; T03-14)
  | 'FACILITY_RATE_E6'        // subject ccy; value number standing-facility rate (04; T03-15)
  | 'SPV_EQUITY_TRANCHE'      // subject spvId; value trancheId (08; T03-16)
  | 'FX_CLOSE_E6'             // subject `${from}>${to}`; value bigint string official day-close FX mark (05; T03-17)
  | 'CHALLENGE_BOOK'          // subject entityId; value boolean challenge-event portfolio, never counted (15; T03-17)
  | 'INTRAGROUP_GUARANTEE'    // subject `${guarantor}>${beneficiary}`; value Money string (07/09; T03-18)
  | 'CONCESSION_RESERVE'      // subject operatedId; value Money string mandated reserve of the day (10; T03-18)
  | 'LISTED'                  // subject entityId; value boolean (05; T03-19)
  | 'PUBLIC_FUND'             // subject fndId; value boolean (08; T03-19)
  | 'CHARTERED'               // subject entityId; value boolean (13; T03-19)
  | 'EARNINGS_DATE'           // subject `${entityId}:${kind}:${index}`; value Tick (09; T03-19)
  | 'LOAN_MATURITY'           // subject loanId; value Tick (07; T03-19)
  | 'BANK_CAPITAL_RATIO'      // subject bnkId; value number (07; T03-19 KPIs)
  | 'BANK_LCR'                // subject bnkId; value number (07; T03-19 KPIs)
  | 'INS_SOLVENCY_RATIO'      // subject insId; value number (08; T03-19 KPIs)
  | 'FUND_KPIS'               // subject fndId; value { navPerUnit, ret, drawdown, grossLev, netLev } (08; T03-19 KPIs)
  | 'SERENA_ACTIVE_CLAIM'     // subject cmpId; value boolean (09; T03-22/T03-23)
  | 'OWNER_OCCUPIED_SINCE'    // subject propId; value Tick or null (10; T03-20)
  | 'ASSESSED_VALUE'          // subject propId; value Money string assessed value for property tax (10; T03-20/T03-21)
  | 'COLLATERAL_OF'           // subject liability key (loanId); value asset account keys pledged (07; T03-25)
  | 'SUBORDINATED_ASSET'      // subject bond assetId; value boolean (06/09; T03-25)
  | 'BIZ_TIER'                // subject bizId; value 'T1'|'T2'|... (09; T03-26)
  | 'FRESH_START_COOLDOWN_UNTIL' // subject chrId; value Tick (14; T03-26)
  | 'CRIME_COURT_DEBT';       // subject liability key; value 'FINE'|'RESTITUTION'|'JUDGMENT' (13; T03-26)
