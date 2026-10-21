// T02-11: G7 LedgerApi / HoldApi verbatim (types only; unit 03 implements them) and the LedgerProvider port through which 03 supplies
// ctx.ledger / ctx.holds. Without a provider the engine makes ctx.ledger / ctx.holds throw EngineFault('I0.no_ledger').
import type { Ccy, Id, Money, PhaseId, Qty, Tick } from '../types';
import type { StoreRead } from '../store';
import type { Reject } from './ctx';

export interface PostOpts { refs?: Id[]; holdId?: Id; valueLegA?: number; valueLegB?: number; sub?: string; memo?: string }
export interface LedgerApi {
  pay(from: Id, to: Id, amt: Money, ccy: Ccy, code: string, o?: PostOpts): Id;                 // TRANSFER
  swapAsset(buyer: Id, seller: Id, assetId: Id, qty: Qty, amt: Money, ccy: Ccy, code: string, o?: PostOpts): Id;
  mint(to: Id, amt: Money, ccy: Ccy, code: string, o?: PostOpts): Id;                          // FAUCET, no elastic sector
  burn(from: Id, amt: Money, ccy: Ccy, code: string, o?: PostOpts): Id;                        // SINK
  elasticIn(sector: Id, to: Id, amt: Money, ccy: Ccy, code: string, o?: PostOpts): Id;          // FAUCET from hh/frm/row
  elasticOut(from: Id, sector: Id, amt: Money, ccy: Ccy, code: string, o?: PostOpts): Id;       // SINK to hh/frm/row
  lend(bank: Id, borrower: Id, amt: Money, ccy: Ccy, code: string, loanId: Id, o?: PostOpts): Id;   // CREDIT_CREATE
  repay(borrower: Id, bank: Id, principal: Money, ccy: Ccy, code: string, loanId: Id, o?: PostOpts): Id; // CREDIT_DESTROY
  cbCredit(cb: Id, bank: Id, amt: Money, ccy: Ccy, code: string, o?: PostOpts): Id;
  cbCreditUnwind(bank: Id, cb: Id, amt: Money, ccy: Ccy, code: string, o?: PostOpts): Id;
  accrue(e: Id, amt: Money, ccy: Ccy, code: string, drAcct: number, crAcct: number, o?: PostOpts): Id; // REVALUE, one entity
  accruePair(a: Id, b: Id, amt: Money, ccy: Ccy, code: string, o?: PostOpts): Id;
  fx(a: Id, b: Id, ccy1: Ccy, amt1: Money, ccy2: Ccy, amt2: Money, code: string, o?: PostOpts): Id;
  moveQty(from: Id, to: Id, assetId: Id, qty: Qty, bookValue: Money, ccy: Ccy, code: string, o?: PostOpts): Id;
  reclass(e: Id, amt: Money, ccy: Ccy, code: string, fromAcct: number, toAcct: number, o?: PostOpts): Id;
  // reads (committed state + this tick's queued entries are NOT included unless stated)
  balance(accountKey: string): Money; cash(entityId: Id, ccy: Ccy): Money; available(entityId: Id, ccy: Ccy): Money; // cash − active holds
  position(entityId: Id, assetId: Id): Qty; availableQty(entityId: Id, assetId: Id): Qty;
  netWorth(entityId: Id): Money;   // marked, in reporting currency (03 §3.10)
}
export interface Hold { holdId: Id; ownerEntityId: Id; account: string; amount: Money; qty?: Qty; assetId?: Id; ccy: string; purpose: string;
  placedTick: Tick; expiresTick: Tick; status: 'ACTIVE'|'SETTLED'|'RELEASED' }   // 02 §2.8
export interface HoldApi {
  placeCash(owner: Id, ccy: Ccy, amt: Money, expiresTick: Tick, ref: Id): Id | Reject;   // Reject {code:'LED_INSUFFICIENT_FUNDS'}
  placeQty(owner: Id, assetId: Id, qty: Qty, expiresTick: Tick, ref: Id): Id | Reject;
  release(holdId: Id): void; reduce(holdId: Id, byAmount: bigint): void; get(holdId: Id): Hold | undefined;
}
export interface Posting { tick: Tick; entryId: Id; debitAccount: string; creditAccount: string; amount: Money; ccy: Ccy; reason: string; refs: Id[] }  // 00 §5.4
export interface SuspenseReport { pairs: { from: string; to: string; ccy: Ccy; balance: Money }[] }   // sys:9900 balances (02 §3.14.2)
export interface PostingLeg { entryId: Id; legId: string; fromPartition: string; toPartition: string; body: unknown }   // body owned by 03
export interface LedgerPartition {                               // one per partition, created by the provider
  apiFor(module: string, phase: PhaseId, tick: Tick): { ledger: LedgerApi; holds: HoldApi };
  outgoingLegs(): PostingLeg[];                                  // produced in R3, exchanged at B3
  acceptLegs(legs: readonly PostingLeg[]): void;
  prepare(tick: Tick): { ok: boolean; failures: { invariantId: string; entityIds: Id[]; observed: string; expected: string }[]; suspense: SuspenseReport; postings: readonly Posting[] };
  commit(tick: Tick): void; rollback(tick: Tick): void;
  queryPostings(filter: { reason?: string; entityId?: Id; since?: Tick }): Posting[];
  balance(entityId: Id, code: number, ccy: Ccy, sub?: string): Money;
  snapshotRows(): { name: string; rows: unknown[] }[];          // included in snapshots
}
export interface LedgerProvider { createPartition(partitionId: string, store: unknown /* PartitionStore */): LedgerPartition;
  globalCheck(reports: readonly { partitionId: string; suspense: SuspenseReport }[]): { ok: boolean; failures: { invariantId: string; observed: string; expected: string }[] };  // COORD (I13, I3, I4, I8)
  testHooks?: { balance(read: StoreRead, entityId: Id, code: number, ccy: Ccy, sub?: string): Money;   // used by TestWorld.balance / .postings (T02-21)
    postings(read: StoreRead, filter?: { reason?: string; entityId?: Id; since?: Tick }): Posting[] } }
