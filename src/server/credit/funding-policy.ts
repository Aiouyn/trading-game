import { cmpStr } from "../../../packages/engine/core/order";
import type { Money } from "../../../packages/engine/core/types";
import { creditFingerprint } from "./input";
import type { CreditCashAccount, CreditClient, CreditFund, CreditMovement, CreditOffer, CreditState } from "./model";
/** Bot's reading of "the game never creates money"; bank-credit applicability is pending the owner (07:23). */
export const CREDIT_MONEY_POLICY = "PREFUNDED_ONLY_PENDING_OWNER" as const;
const Z = BigInt(0);
export function creditCashTotal(s: CreditState): Money { return s.funds.reduce((n, f) => n + f.cash, Z) + s.clients.flatMap((c) => c.accounts).reduce((n, a) => n + a.cash, Z) + s.supplier.cash; }
export function creditReserved(s: CreditState, fundId: string): Money { return s.offers.filter((o) => o.status === "OPEN").flatMap((o) => o.slices).filter((a) => a.fundId === fundId).reduce((n, a) => n + a.amount, Z) + s.loans.flatMap((l) => l.slices).filter((a) => a.fundId === fundId).reduce((n, a) => n + a.reserved, Z); }
export const free = (s: CreditState, f: CreditFund): Money => f.cash - creditReserved(s, f.id);
export const capital = (s: CreditState): CreditFund => s.funds.find((f) => f.depositorId === null)!;
const creditCashBucketKey = (c: CreditClient, a: CreditCashAccount): string => "account:" + creditFingerprint({ clientId: c.id, accountId: a.id });
export interface CashRef {
    key: string;
    bucket: {
        cash: Money;
    };
}
export const accountRef = (c: CreditClient, a: CreditCashAccount): CashRef => ({ key: creditCashBucketKey(c, a), bucket: a });
export const fundRef = (f: CreditFund): CashRef => ({ key: "fund:" + f.id, bucket: f });
export function transfer(s: CreditState, from: CashRef, to: CashRef, amount: Money, kind: CreditMovement["kind"]): void {
    if (amount < Z || from.bucket.cash < amount)
        throw new Error("CREDIT_UNFUNDED");
    if (amount === Z)
        return;
    from.bucket.cash -= amount;
    to.bucket.cash += amount;
    s.movements.push({ tick: s.tick, from: from.key, to: to.key, amount, kind });
}
/** The sole origination funding decision. A different authorized money regime belongs here, not in loan pricing/schedules. */
export function reserveCreditOfferFunding(s: CreditState, amount: Money): CreditOffer["slices"] | null {
    if (s.funds.reduce((n, f) => n + free(s, f), Z) < amount)
        return null;
    let left = amount;
    const slices: CreditOffer["slices"] = [];
    for (const fund of [...s.funds].sort((a, b) => (a.depositorId === null ? -1 : b.depositorId === null ? 1 : cmpStr(a.id, b.id)))) {
        const available = free(s, fund), part = available < left ? available : left;
        if (part > Z)
            slices.push({ fundId: fund.id, amount: part });
        left -= part;
    }
    return slices;
}
export function assertCreditFundingConservation(s: CreditState, total: Money): void {
    if (creditCashTotal(s) !== total || s.funds.some((f) => free(s, f) < Z || f.loss < Z) || s.clients.some((c) => c.accounts.some((a) => a.cash < Z)) || s.supplier.cash < Z)
        throw new Error("CREDIT_CONSERVATION");
}
