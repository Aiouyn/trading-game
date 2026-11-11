import type { Ccy, Money, Tick } from "../../../packages/engine/core/types";
export const CREDIT_GRADES = ["AAA", "AA", "A", "BBB", "BB", "B", "CCC", "CC", "D"] as const;
export type UnderwritingGrade = typeof CREDIT_GRADES[number];
export interface CreditCashAccount {
    id: string;
    bankId: string | null;
    cash: Money;
}
export interface CreditClient {
    id: string;
    kind: "PERSON" | "COMPANY";
    homeAccountId: string;
    accounts: CreditCashAccount[];
}
export interface CreditBankPolicy {
    id: string;
    initialCapital: Money;
    dailySupply: Money;
    productLimit: Money;
    borrowerLimit: Money;
    exposureLimit: Money;
    cet1TargetPpm: number;
    grades: {
        grade: UnderwritingGrade;
        marginPpm: number;
        personalCap: Money;
        personalFloorPpm: number;
    }[];
}
export interface CreditGenesis {
    world: string;
    ccy: Ccy;
    bank: CreditBankPolicy;
    clients: CreditClient[];
    supplier: {
        id: string;
        cash: Money;
    };
}
interface BureauBase {
    clientId: string;
    grade: UnderwritingGrade;
    pdPpm: number;
    held: boolean;
    bankruptcyLocked: boolean;
    netWorth: Money;
    income30d: Money;
    outsideDebt: Money;
    outsideDebtService30d: Money;
}
export type CreditBureauRow = (BureauBase & {
    kind: "PERSON";
    rookie: boolean;
}) | (BureauBase & {
    kind: "COMPANY";
    ebitdaAnnual: Money;
    outsideTermPrincipal: Money;
    outsideDebtServiceAnnual: Money;
});
export interface CreditFacts {
    bankStatus: "ACTIVE" | "WATCH" | "RESTRICTED";
    onrPpm: number;
    fearPpm: number;
    standardsPpm: number;
    profiles: CreditBureauRow[];
}
export type CreditApplication = {
    product: "PERSONAL_LINE";
} | {
    product: "BUSINESS_TERM";
    termYears: number;
    frequencyDays: number;
    amortization: "LINEAR" | "ANNUITY" | "BULLET";
};
export type CreditCommand = {
    id: string;
    actor: string;
    kind: "FUND_LENDING";
    accountId: string;
    amount: Money;
    consent: boolean;
} | {
    id: string;
    actor: string;
    kind: "WITHDRAW_FUND";
    fundId: string;
    accountId: string;
    amount: Money;
} | {
    id: string;
    actor: string;
    kind: "APPLY";
    amount: Money;
    receivingAccountId: string;
    terms: CreditApplication;
} | {
    id: string;
    actor: string;
    kind: "ACCEPT";
    offerId: string;
} | {
    id: string;
    actor: string;
    kind: "DRAW" | "REPAY";
    loanId: string;
    amount: Money;
} | {
    id: string;
    actor: string;
    kind: "CLOSE_LINE";
    loanId: string;
} | {
    id: string;
    actor: string;
    kind: "REFUND_EXPENSE";
    expenseId: string;
    amount: Money;
} | {
    id: string;
    actor: string;
    kind: "EXPENSE";
    supplierId: string;
    amount: Money;
};
export interface CreditFrame {
    tick: Tick;
    commands: CreditCommand[];
    facts: CreditFacts | null;
}
export interface CreditFund {
    id: string;
    depositorId: string | null;
    cash: Money;
    loss: Money;
}
export interface CreditOffer {
    id: string;
    clientId: string;
    amount: Money;
    receivingAccountId: string;
    terms: CreditApplication;
    spreadPpm: number;
    expiresTick: Tick;
    status: "OPEN" | "EXPIRED" | "ACCEPTED";
    slices: {
        fundId: string;
        amount: Money;
    }[];
}
export interface CreditLoan {
    id: string;
    clientId: string;
    receivingAccountId: string;
    terms: CreditApplication;
    originalLimit: Money;
    interest: Money;
    periodInterest: Money;
    fees: Money;
    penalty: Money;
    principalDue: Money;
    spreadPpm: number;
    ratePpm: number;
    originatedTick: Tick;
    nextPaymentTick: Tick;
    maturityTick: Tick | null;
    paidPeriods: number;
    annuity: Money;
    missedTick: Tick | null;
    watchUntilTick: Tick | null;
    defaultedTick: Tick | null;
    nextReviewTick: Tick | null;
    frozen: boolean;
    covenantTick: Tick | null;
    covenantRepricePpm: number;
    status: "PERFORMING" | "WATCH" | "DELINQUENT" | "DEFAULTED" | "CHARGED_OFF" | "REPAID";
    slices: {
        fundId: string;
        principal: Money;
        reserved: Money;
        chargedOff: Money;
    }[];
}
export interface CreditMovement {
    tick: Tick;
    from: string;
    to: string;
    amount: Money;
    kind: "FUND" | "WITHDRAW" | "DRAW" | "ROUTE" | "REPAY_PRINCIPAL" | "REPAY_INTEREST" | "REPAY_PENALTY" | "REPAY_FEE" | "EXPENSE" | "REFUND";
}
export interface CreditState {
    world: string;
    ccy: Ccy;
    tick: Tick;
    bank: CreditBankPolicy;
    clients: CreditClient[];
    supplier: {
        id: string;
        cash: Money;
    };
    funds: CreditFund[];
    offers: CreditOffer[];
    loans: CreditLoan[];
    receipts: {
        id: string;
        fingerprint: string;
        accepted: boolean;
        reason: string | null;
        resourceId: string | null;
        tick: Tick;
    }[];
    expenses: {
        id: string;
        clientId: string;
        amount: Money;
        refunded: Money;
    }[];
    movements: CreditMovement[];
    events: {
        tick: Tick;
        kind: string;
        loanId: string;
        amount: Money;
    }[];
    days: {
        tick: Tick;
        onrPpm: number;
        principal: Money;
        loss: Money;
    }[];
}
export interface CreditCheckpointStore {
    load(): Promise<{
        revision: string | null;
        payload: unknown;
    }>;
    save(payload: unknown, expectedRevision: string | null): Promise<string>;
}
