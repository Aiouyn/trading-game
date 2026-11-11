import type { Ccy, Money, Tick } from "../../../packages/engine/core/types";

export interface BankSeed { id: string; cash: Money; sightRatePpm: number; savingsRatePpm: number; tolerancePpm: number; enabled: boolean }
export interface ClientSeed { kind: "PERSON" | "BUSINESS"; id: string; cash: Money; presence: string[] }
export interface BankState extends BankSeed { equity: Money }
export interface BusinessLoan { id: string; lenderId: string; depositId: string; principal: Money; accrued: Money; ratePpm: number; originatedTick: Tick; maturityTick: Tick; status: "OPEN" | "OVERDUE" | "REPAID" | "WRITTEN_OFF" }
export interface BankingGenesis { world: string; ccy: Ccy; initialPolicyPpm: number; initialOnrPpm: number; banks: BankSeed[]; clients: ClientSeed[] }
export type BankCommand =
  | { id: string; actor: string; kind: "LEND"; depositId: string; amount: Money; ratePpm: number; maturityTick: Tick }
  | { id: string; actor: string; kind: "REPAY"; loanId: string; amount: Money }
  | { id: string; actor: string; kind: "WRITE_OFF"; loanId: string }
  | { id: string; actor: string; kind: "OPEN"; depositId: string; bankId: string; product: "SIGHT" | "SAVINGS" }
  | { id: string; actor: string; kind: "DEPOSIT" | "WITHDRAW"; depositId: string; amount: Money }
  | { id: string; actor: string; kind: "MOVE"; from: string; to: string; amount: Money }
  | { id: string; actor: string; kind: "PAY"; from: string; to: string; amount: Money };
export interface HourlyBankMarket { fearPpm: number; policyPpm: number; dfrPpm: number; mlfrPpm: number; risks: { bankId: string; pdPpm: number }[] }
export interface BankingFrame { tick: Tick; commands: BankCommand[]; market: HourlyBankMarket | null }
export interface BankDeposit { id: string; bankId: string; holderId: string; product: "SIGHT" | "SAVINGS"; cash: Money; interestDue: Money }
export interface FundedInterbankLoan { id: string; lenderId: string; borrowerId: string; funded: Money; principal: Money; accrued: Money; ratePpm: number; originatedTick: Tick; maturityTick: Tick; status: "OPEN" | "OVERDUE" | "REPAID" }
export type BankCashMovement = { tick: Tick; amount: Money } & (
  | { kind: "DEPOSIT" | "WITHDRAW"; depositId: string; bankId: string; clientId: string }
  | { kind: "MOVE" | "PAY"; fromDeposit: string; toDeposit: string }
  | { kind: "DEPOSIT_INTEREST"; depositId: string; bankId: string }
  | { kind: "CREDIT_CREATE" | "CREDIT_DESTROY" | "LOAN_INTEREST"; loanId: string; depositId: string; bankId: string }
  | { kind: "CREDIT_CHARGEOFF"; loanId: string; bankId: string }
  | { kind: "INTERBANK_DRAW" | "INTERBANK_PRINCIPAL" | "INTERBANK_INTEREST"; fromBank: string; toBank: string }
);
export interface BankCommandReceipt { id: string; fingerprint: string; tick: Tick; accepted: boolean; reason: string | null }
export interface BankingState {
  world: string; ccy: Ccy; tick: Tick; banks: BankState[]; clients: ClientSeed[]; businessLoans: BusinessLoan[]; deposits: BankDeposit[]; loans: FundedInterbankLoan[];
  receipts: BankCommandReceipt[]; movements: BankCashMovement[];
  settlements: { tick: Tick; banks: { bankId: string; delta: Money }[]; externalDelta: Money }[];
  hours: { tick: Tick; volume: Money; gaps: { bankId: string; gap: Money }[] }[];
  fixings: { tick: Tick; ratePpm: number; policyPpm: number; volume: Money; fallback: boolean }[];
}
export interface BankCheckpointStore {
  load(): Promise<{ revision: string | null; payload: unknown }>;
  save(payload: unknown, expectedRevision: string | null): Promise<string>;
}
