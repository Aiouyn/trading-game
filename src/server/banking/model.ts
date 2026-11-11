import type { Ccy, Money, Tick } from "../../../packages/engine/core/types";

export interface BankSeed { id: string; cash: Money; sightRatePpm: number; savingsRatePpm: number; tolerancePpm: number; enabled: boolean }
export interface ClientSeed { id: string; cash: Money; presence: string[] }
export interface BankingGenesis { world: string; ccy: Ccy; initialPolicyPpm: number; initialOnrPpm: number; banks: BankSeed[]; clients: ClientSeed[] }
export type BankCommand =
  | { id: string; actor: string; kind: "OPEN"; depositId: string; bankId: string; product: "SIGHT" | "SAVINGS" }
  | { id: string; actor: string; kind: "DEPOSIT" | "WITHDRAW"; depositId: string; amount: Money }
  | { id: string; actor: string; kind: "MOVE"; from: string; to: string; amount: Money };
export interface HourlyBankMarket { fearPpm: number; policyPpm: number; dfrPpm: number; mlfrPpm: number; risks: { bankId: string; pdPpm: number }[] }
export interface BankingFrame { tick: Tick; commands: BankCommand[]; market: HourlyBankMarket | null }
export interface CustodyDeposit { id: string; bankId: string; holderId: string; product: "SIGHT" | "SAVINGS"; cash: Money; interestDue: Money }
export interface FundedInterbankLoan { id: string; lenderId: string; borrowerId: string; funded: Money; principal: Money; accrued: Money; ratePpm: number; originatedTick: Tick; maturityTick: Tick; status: "OPEN" | "OVERDUE" | "REPAID" }
export interface BankCashMovement { tick: Tick; from: string; to: string; fromBank: string | null; toBank: string | null; amount: Money; kind: "DEPOSIT" | "WITHDRAW" | "MOVE" | "DEPOSIT_INTEREST" | "INTERBANK_DRAW" | "INTERBANK_INTEREST" | "INTERBANK_PRINCIPAL" }
export interface BankCommandReceipt { id: string; fingerprint: string; tick: Tick; accepted: boolean; reason: string | null }
export interface BankingState {
  world: string; ccy: Ccy; tick: Tick; banks: BankSeed[]; clients: ClientSeed[]; deposits: CustodyDeposit[]; loans: FundedInterbankLoan[];
  receipts: BankCommandReceipt[]; movements: BankCashMovement[];
  settlements: { tick: Tick; banks: { bankId: string; delta: Money }[]; externalDelta: Money }[];
  hours: { tick: Tick; volume: Money; gaps: { bankId: string; gap: Money }[] }[];
  fixings: { tick: Tick; ratePpm: number; policyPpm: number; volume: Money; fallback: boolean }[];
}
export interface BankCheckpointStore {
  load(): Promise<{ revision: string | null; payload: unknown }>;
  save(payload: unknown, expectedRevision: string | null): Promise<string>;
}
