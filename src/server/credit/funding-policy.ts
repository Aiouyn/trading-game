import type { Money } from "../../../packages/engine/core/types";
import { creditFingerprint } from "./input";
import type { CreditCashAccount, CreditClient, CreditLoan, CreditMovement, CreditState } from "./model";
/** Owner at 2026-11-11 20:06 Europe/Paris: "yes, bank loans create new money like real banks, follow spec 07". */
export const CREDIT_MONEY_POLICY = "BANK_DEPOSIT_CREATION_SPEC_07" as const;
const Z = BigInt(0);
export interface CashRef {
    key: string;
    bucket: {
        cash: Money;
    };
}
export const accountRef = (c: CreditClient, a: CreditCashAccount): CashRef => ({ key: "account:" + creditFingerprint({ clientId: c.id, accountId: a.id }), bucket: a });
export const creditCashTotal = (s: CreditState): Money => s.clients.flatMap(c => c.accounts).reduce((n, a) => n + a.cash, Z) + s.supplier.cash;
export const creditReserved = (s: CreditState): Money => s.offers.filter(o => o.status === "OPEN").reduce((n, o) => n + o.amount, Z) + s.loans.reduce((n, l) => n + l.undrawn, Z);
export function canCommitCredit(s: CreditState, amount: Money): boolean {
    return creditReserved(s) + s.loans.reduce((n, l) => n + l.principal, Z) + amount <= s.bank.exposureLimit;
}
export function transfer(s: CreditState, from: CashRef, to: CashRef, amount: Money, kind: CreditMovement["kind"]): void {
    if (amount < Z || from.bucket.cash < amount)
        throw new Error("CREDIT_UNFUNDED_PAYMENT");
    if (amount === Z)
        return;
    from.bucket.cash -= amount;
    to.bucket.cash += amount;
    s.movements.push({ tick: s.tick, from: from.key, to: to.key, amount, kind, loanId: null });
}
export function createLoanDeposit(s: CreditState, l: CreditLoan, to: CashRef, amount: Money): void {
    if (amount <= Z || amount > l.undrawn || s.bankBook.equity <= Z)
        throw new Error("CREDIT_CREATION_LIMIT");
    l.undrawn -= amount;
    l.principal += amount;
    to.bucket.cash += amount;
    s.movements.push({ tick: s.tick, from: "bank:loan-asset", to: to.key, amount, kind: "CREDIT_CREATE", loanId: l.id });
}
export function receiveBankPayment(s: CreditState, l: CreditLoan, from: CashRef, amount: Money, kind: CreditMovement["kind"]): void {
    if (amount < Z || from.bucket.cash < amount)
        throw new Error("CREDIT_UNFUNDED_PAYMENT");
    if (amount === Z)
        return;
    from.bucket.cash -= amount;
    const principal = kind === "REPAY_PRINCIPAL";
    if (!principal) {
        s.bankBook.income += amount;
        s.bankBook.equity += amount;
    }
    s.movements.push({ tick: s.tick, from: from.key, to: principal ? "bank:destroy-principal" : "bank:income", amount, kind, loanId: l.id });
}
export function writeOffLoan(s: CreditState, l: CreditLoan): void { const amount = l.principal - l.chargedOff; l.chargedOff += amount; s.bankBook.writtenOff += amount; s.bankBook.equity -= amount; }
export function recoverWrittenOffPrincipal(s: CreditState, l: CreditLoan, amount: Money): void { const recovered = amount < l.chargedOff ? amount : l.chargedOff; l.chargedOff -= recovered; s.bankBook.writtenOff -= recovered; s.bankBook.equity += recovered; }
export function creditBalanceSheet(s: CreditState) { const deposits = creditCashTotal(s), grossLoans = s.loans.reduce((n, l) => n + l.principal, Z), netLoans = s.loans.reduce((n, l) => n + l.principal - l.chargedOff, Z); return { deposits, grossLoans, netLoans, physicalReserves: s.bankBook.reserves, equity: s.bankBook.equity, reservesNetOfEquity: s.bankBook.reserves - s.bankBook.equity }; }
export function assertCreditAccounting(s: CreditState): void {
    const b = creditBalanceSheet(s);
    if (b.deposits + b.equity !== b.netLoans + b.physicalReserves || s.bankBook.writtenOff !== s.loans.reduce((n, l) => n + l.chargedOff, Z) || s.bankBook.equity !== s.bank.initialCapital + s.bankBook.income - s.bankBook.writtenOff || s.clients.some(c => c.accounts.some(a => a.cash < Z)) || s.supplier.cash < Z)
        throw new Error("CREDIT_ACCOUNTING_IDENTITY");
}
