import { accountRef, assertCreditAccounting, createLoanDeposit, receiveBankPayment, recoverWrittenOffPrincipal, canCommitCredit, transfer, writeOffLoan, type CashRef } from "./funding-policy";
export { creditBalanceSheet, creditCashTotal, creditReserved } from "./funding-policy";
import { cmpStr } from "../../../packages/engine/core/order";
import type { Money } from "../../../packages/engine/core/types";
import { canonicalJson, creditFingerprint, creditTick, creditWire, decodeCreditFrames, decodeCreditGenesis, record, strictJson } from "./input";
import { CREDIT_GRADES, type CreditApplication, type CreditBureauRow, type CreditCashAccount, type CreditCheckpointStore, type CreditClient, type CreditCommand, type CreditFacts, type CreditFrame, type CreditGenesis, type CreditLoan, type CreditMovement, type CreditOffer, type CreditState } from "./model";
const Z = BigInt(0), ONE = BigInt(1), M = BigInt(1000000), D = BigInt(364) * M;
const min = (...n: bigint[]): bigint => n.reduce((a, b) => a < b ? a : b);
const positive = (n: bigint): bigint => n > Z ? n : Z;
function round(n: bigint, d: bigint): bigint { const q = n / d, r = n % d; return q + (r * BigInt(2) > d || (r * BigInt(2) === d && q % BigInt(2) !== Z) ? ONE : Z); }
const daily = (n: Money, ppm: number): Money => round(n * BigInt(ppm), D);
const dollars = (n: number): Money => BigInt(n) * M;
const active = (l: CreditLoan): boolean => l.status !== "REPAID" && l.status !== "CHARGED_OFF" && l.status !== "DEFAULTED";
export const creditPrincipal = (l: CreditLoan): Money => l.principal;
const committed = (l: CreditLoan): Money => l.principal + l.undrawn;
const charges = (l: CreditLoan): Money => l.fees + l.penalty + l.interest;
const due = (l: CreditLoan): Money => charges(l) + l.principalDue;
function event(s: CreditState, l: CreditLoan, kind: string, amount = Z): void { s.events.push({ tick: s.tick, kind, loanId: l.id, amount }); }
function orderedAccounts(s: CreditState, c: CreditClient): CreditCashAccount[] {
    return [...c.accounts].sort((a, b) => {
        const rank = (a: CreditCashAccount) => a.id === c.homeAccountId ? 0 : a.bankId === s.bank.id ? 1 : a.bankId === null ? 2 : 3;
        return rank(a) - rank(b) || cmpStr(a.bankId ?? "", b.bankId ?? "") || cmpStr(a.id, b.id);
    });
}
const walletTotal = (c: CreditClient): Money => c.accounts.reduce((n, a) => n + a.cash, Z);
function collect(s: CreditState, c: CreditClient, target: CashRef, amount: Money, kind: CreditMovement["kind"]): Money {
    let left = amount;
    for (const a of orderedAccounts(s, c)) {
        const paid = min(a.cash, left);
        transfer(s, accountRef(c, a), target, paid, kind);
        left -= paid;
        if (left === Z)
            break;
    }
    return amount - left;
}
function resetIfPaid(s: CreditState, l: CreditLoan): void {
    if (l.missedTick !== null && due(l) === Z && l.status !== "CHARGED_OFF" && l.status !== "DEFAULTED") {
        l.missedTick = null;
        l.status = "WATCH";
        l.watchUntilTick = s.tick + 7 * 720;
        event(s, l, "LOAN_CURED");
    }
    if (creditPrincipal(l) === Z && charges(l) === Z && (l.terms.product === "BUSINESS_TERM" || l.frozen)) {
        l.status = "REPAID";
        l.undrawn = Z;
    }
}
function repay(s: CreditState, l: CreditLoan, budget: Money, prepay: boolean): Money {
    const c = s.clients.find(c => c.id === l.clientId)!;
    let left = min(budget, walletTotal(c)), paid = Z;
    for (const category of ["fees", "penalty", "interest", "principal"] as const) {
        const owed = category === "principal" ? (prepay ? l.principal : l.principalDue) : l[category], amount = min(left, owed);
        if (amount === Z)
            continue;
        const kind = category === "fees" ? "REPAY_FEE" : category === "penalty" ? "REPAY_PENALTY" : category === "interest" ? "REPAY_INTEREST" : "REPAY_PRINCIPAL";
        let outstanding = amount;
        for (const a of orderedAccounts(s, c)) {
            const part = min(a.cash, outstanding);
            receiveBankPayment(s, l, accountRef(c, a), part, kind);
            outstanding -= part;
            if (outstanding === Z)
                break;
        }
        if (category === "principal") {
            recoverWrittenOffPrincipal(s, l, amount);
            l.principal -= amount;
            l.principalDue = positive(l.principalDue - amount);
            if (l.terms.product === "PERSONAL_LINE" && !l.frozen && active(l))
                l.undrawn += amount;
        }
        else
            l[category] -= amount;
        left -= amount;
        paid += amount;
    }
    resetIfPaid(s, l);
    return paid;
}
function annuity(p: Money, rate: number, freq: number, periods: number): Money {
    if (periods <= 0)
        return p;
    const n = BigInt(rate) * BigInt(freq);
    if (n === Z)
        return round(p, BigInt(periods));
    const up = (D + n) ** BigInt(periods), down = D ** BigInt(periods);
    return round(p * n * up, D * (up - down));
}
function periods(l: CreditLoan): number { return l.terms.product === "BUSINESS_TERM" ? l.terms.termYears * 364 / l.terms.frequencyDays : 0; }
function principalPayment(l: CreditLoan, periodInterest: Money): Money {
    const p = creditPrincipal(l);
    if (l.terms.product !== "BUSINESS_TERM")
        return Z;
    if (l.paidPeriods + 1 >= periods(l))
        return p;
    if (l.terms.amortization === "BULLET")
        return Z;
    return min(p, l.terms.amortization === "LINEAR" ? l.originalLimit / BigInt(periods(l)) : positive(l.annuity - periodInterest));
}
function serviceDays(s: CreditState, l: CreditLoan, onr: number, window: number, afterClose = false): Money {
    const rate = onr + l.spreadPpm + l.covenantRepricePpm;
    if (l.terms.product === "PERSONAL_LINE")
        return charges(l) + daily(committed(l), rate) * BigInt(window) + l.principalDue;
    const copy = structuredClone(l), arrears = l.missedTick !== null || l.principalDue > Z;
    let total = l.fees + l.penalty + l.principalDue + (arrears ? l.interest : Z), pending = arrears ? Z : l.interest;
    copy.principal -= l.principalDue;
    const start = Math.floor(s.tick / 720) + (afterClose && s.tick % 720 === 719 ? 1 : 0);
    for (let d = 0; d < window; d++) {
        const tick = (start + d + 1) * 720 - 1, accrued = daily(creditPrincipal(copy), rate);
        pending += accrued;
        copy.periodInterest += accrued;
        if (tick < copy.nextPaymentTick)
            continue;
        if (copy.terms.product === "BUSINESS_TERM" && copy.terms.amortization === "ANNUITY")
            copy.annuity = annuity(creditPrincipal(copy), rate, copy.terms.frequencyDays, periods(copy) - copy.paidPeriods);
        const principal = principalPayment(copy, copy.periodInterest);
        total += pending + principal;
        pending = Z;
        copy.periodInterest = Z;
        copy.paidPeriods++;
        copy.nextPaymentTick += (copy.terms.product === "BUSINESS_TERM" ? copy.terms.frequencyDays : 28) * 720;
        copy.principal -= principal;
    }
    return total;
}
const service30 = (s: CreditState, l: CreditLoan, onr: number): Money => serviceDays(s, l, onr, 30);
function freshLoan(s: CreditState, o: CreditOffer): CreditLoan {
    const freq = o.terms.product === "PERSONAL_LINE" ? 28 : o.terms.frequencyDays, start = Math.floor(s.tick / 720), term = o.terms.product === "BUSINESS_TERM" ? o.terms.termYears * 364 : null;
    return { id: o.id, clientId: o.clientId, receivingAccountId: o.receivingAccountId, terms: structuredClone(o.terms), originalLimit: o.amount, interest: Z, periodInterest: Z, fees: Z, penalty: Z, principalDue: Z, spreadPpm: o.spreadPpm, ratePpm: 0, originatedTick: s.tick, nextPaymentTick: (start + freq) * 720 - 1, maturityTick: term === null ? null : (start + term) * 720 - 1, paidPeriods: 0, annuity: Z, missedTick: null, watchUntilTick: null, defaultedTick: null, nextReviewTick: o.terms.product === "PERSONAL_LINE" ? (start + 28) * 720 - 1 : null, frozen: false, covenantTick: null, covenantRepricePpm: 0, status: "PERFORMING", principal: Z, undrawn: o.amount, chargedOff: Z };
}
function draw(s: CreditState, l: CreditLoan, amount: Money): void {
    const c = s.clients.find((c) => c.id === l.clientId)!;
    let lender = c.accounts.find((a) => a.bankId === s.bank.id);
    if (!lender) {
        lender = { id: creditFingerprint({ lender: s.bank.id, borrower: c.id, role: "loan-deposit" }), bankId: s.bank.id, cash: Z };
        if (s.clients.some((c) => c.accounts.some((a) => a.id === lender!.id)))
            throw new Error("CREDIT_ACCOUNT_COLLISION");
        c.accounts.push(lender);
    }
    const target = c.accounts.find((a) => a.id === l.receivingAccountId)!;
    createLoanDeposit(s, l, accountRef(c, lender), amount);
    if (target.id !== lender.id)
        transfer(s, accountRef(c, lender), accountRef(c, target), amount, "ROUTE");
    event(s, l, "LOAN_DRAWN", amount);
}
function gradeOk(p: CreditBureauRow, f: CreditFacts): boolean { const minimum = f.standardsPpm >= 800000 ? 3 : f.standardsPpm >= 500000 ? 4 : 5; return CREDIT_GRADES.indexOf(p.grade) <= minimum; }
function basic(s: CreditState, p: CreditBureauRow, f: CreditFacts): string | null {
    if (s.bankBook.equity <= Z)
        return "BANK_INSOLVENT";
    if (f.bankStatus === "RESTRICTED")
        return "BANK_RESTRICTED";
    if (p.held)
        return "HELD";
    if (p.bankruptcyLocked)
        return "BANKRUPTCY_LOCK";
    if (s.loans.some((l) => l.clientId === p.clientId && (l.status === "DEFAULTED" || l.status === "CHARGED_OFF") && creditPrincipal(l) + charges(l) > Z))
        return "UNPAID_DEFAULT";
    return null;
}
function assess(s: CreditState, c: CreditClient, amount: Money, terms: CreditApplication, f: CreditFacts, ignoreOffer: string | null, review = false): {
    reason: string | null;
    spread: number;
} {
    const p = f.profiles.find((p) => p.clientId === c.id)!;
    const invalid = basic(s, p, f);
    if (invalid)
        return { reason: invalid, spread: 0 };
    if (!gradeOk(p, f))
        return { reason: "GRADE", spread: 0 };
    if ((terms.product === "PERSONAL_LINE") !== (p.kind === "PERSON"))
        return { reason: "PRODUCT_KIND", spread: 0 };
    const row = s.bank.grades.find((r) => r.grade === p.grade)!;
    const rw = terms.product === "PERSONAL_LINE" ? 750000 : CREDIT_GRADES.indexOf(p.grade) <= 2 ? 500000 : p.grade === "BBB" ? 750000 : p.grade === "BB" ? 1000000 : 1500000;
    const risk = round(BigInt(p.pdPpm) * M, M), cap = round(BigInt(rw) * BigInt(s.bank.cet1TargetPpm) * BigInt(120000), M * M), standards = round(BigInt(30000) * BigInt(f.standardsPpm) ** BigInt(2), M * M);
    let spread = Number(risk + cap + BigInt(terms.product === "PERSONAL_LINE" ? 15000 : 7500) + BigInt(row.marginPpm) + standards);
    if (terms.product === "PERSONAL_LINE") {
        spread = Math.max(spread, row.personalFloorPpm);
        if (spread > 180000)
            return { reason: "RATE_CAP", spread };
    }
    const other = s.loans.filter((l) => l.clientId === c.id && l.status !== "REPAID"), offers = s.offers.filter((o) => o.clientId === c.id && o.status === "OPEN" && o.id !== ignoreOffer);
    const exposure = other.reduce((n, l) => n + committed(l), Z) + offers.reduce((n, o) => n + o.amount, Z) + amount;
    if (amount > s.bank.productLimit || exposure > s.bank.borrowerLimit || exposure > s.bank.exposureLimit)
        return { reason: "BANK_LIMIT", spread };
    if (p.kind === "PERSON") {
        const limit = min(p.netWorth / BigInt(10), p.income30d * BigInt(3), row.personalCap, p.rookie ? dollars(1000) : row.personalCap);
        if (exposure > limit)
            return { reason: "PERSONAL_LIMIT", spread };
    }
    else {
        const termDebt = p.outsideTermPrincipal + other.filter((l) => l.terms.product === "BUSINESS_TERM").reduce((n, l) => n + creditPrincipal(l), Z) + offers.filter((o) => o.terms.product === "BUSINESS_TERM").reduce((n, o) => n + o.amount, Z) + amount;
        if (p.ebitdaAnnual === Z || termDebt > BigInt(3) * p.ebitdaAnnual)
            return { reason: "EBITDA_LIMIT", spread };
    }
    const stub: CreditOffer = { id: "assessment", clientId: c.id, amount, receivingAccountId: c.homeAccountId, terms, spreadPpm: spread, expiresTick: s.tick + 30, status: "OPEN", };
    const proposed = freshLoan(s, stub);
    if (terms.product === "BUSINESS_TERM") {
        proposed.principal = amount;
        proposed.undrawn = Z;
    }
    let service = p.outsideDebtService30d + service30(s, proposed, f.onrPpm) + other.reduce((n, l) => n + service30(s, l, f.onrPpm), Z);
    for (const o of offers) {
        const l = freshLoan(s, o);
        if (l.terms.product === "BUSINESS_TERM") {
            l.principal = o.amount;
            l.undrawn = Z;
        }
        service += service30(s, l, f.onrPpm);
    }
    if (service * BigInt(2) > p.income30d)
        return { reason: "DSR", spread };
    if (p.kind === "COMPANY") {
        const annual = p.outsideDebtServiceAnnual + serviceDays(s, proposed, f.onrPpm, 364) + other.reduce((n, l) => n + serviceDays(s, l, f.onrPpm, 364), Z) + offers.reduce((n, o) => { const l = freshLoan(s, o); l.principal = o.amount; l.undrawn = Z; return n + serviceDays(s, l, f.onrPpm, 364); }, Z);
        if (p.ebitdaAnnual * BigInt(4) < annual * BigInt(5))
            return { reason: "DSCR", spread };
        const debt = p.outsideDebt + other.reduce((n, l) => n + creditPrincipal(l), Z);
        if ((debt - walletTotal(c)) * BigInt(2) > p.ebitdaAnnual * BigInt(7))
            return { reason: "LEVERAGE", spread };
    }
    if (review)
        return { reason: null, spread };
    const today = Math.floor(s.tick / 720), used = s.loans.filter((l) => Math.floor(l.originatedTick / 720) === today).reduce((n, l) => n + l.originalLimit, Z) + s.offers.filter((o) => o.status === "OPEN" && o.id !== ignoreOffer).reduce((n, o) => n + o.amount, Z);
    const supply = f.bankStatus === "WATCH" ? s.bank.dailySupply / BigInt(2) : s.bank.dailySupply;
    if (used + amount > supply)
        return { reason: "SUPPLY", spread };
    return { reason: null, spread };
}
function command(s: CreditState, c: CreditCommand, f: CreditFacts | null): void {
    const fingerprint = creditFingerprint(c), old = s.receipts.find((r) => r.id === c.id);
    if (old) {
        if (old.fingerprint !== fingerprint)
            throw new Error("CREDIT_COMMAND_CONFLICT");
        return;
    }
    const client = s.clients.find((a) => a.id === c.actor);
    let reason: string | null = null, resourceId: string | null = null;
    if (c.kind === "REFUND_EXPENSE") {
        const expense = s.expenses.find((a) => a.id === c.expenseId);
        if (c.actor !== s.supplier.id)
            reason = "NOT_SUPPLIER";
        else if (!expense)
            reason = "UNKNOWN_EXPENSE";
        else if (c.amount > expense.amount - expense.refunded || s.supplier.cash < c.amount)
            reason = "REFUND_LIMIT";
        else {
            const receiver = s.clients.find((a) => a.id === expense.clientId)!;
            transfer(s, { key: "supplier:" + s.supplier.id, bucket: s.supplier }, accountRef(receiver, receiver.accounts.find((a) => a.id === receiver.homeAccountId)!), c.amount, "REFUND");
            expense.refunded += c.amount;
        }
    }
    else if (!client)
        reason = "UNKNOWN_ACTOR";
    else if (c.kind === "APPLY") {
        if (!client.accounts.some((a) => a.id === c.receivingAccountId))
            reason = "NOT_OWNER";
        else {
            const a = assess(s, client, c.amount, c.terms, f!, null);
            reason = a.reason;
            if (reason === null) {
                const capacity = canCommitCredit(s, c.amount);
                if (!capacity)
                    reason = "CREDIT_EXHAUSTED";
                else {
                    const o: CreditOffer = { id: creditFingerprint({ offerCommand: c.id }), clientId: c.actor, amount: c.amount, receivingAccountId: c.receivingAccountId, terms: structuredClone(c.terms), spreadPpm: a.spread, expiresTick: s.tick + 30, status: "OPEN" };
                    s.offers.push(o);
                    resourceId = o.id;
                }
            }
        }
    }
    else if (c.kind === "ACCEPT") {
        const o = s.offers.find((o) => o.id === c.offerId);
        if (!o || o.clientId !== c.actor)
            reason = "NOT_OWNER";
        else if (o.status !== "OPEN" || s.tick >= o.expiresTick)
            reason = "OFFER_EXPIRED";
        else {
            reason = assess(s, client, o.amount, o.terms, f!, o.id).reason;
            if (reason === null) {
                const l = freshLoan(s, o);
                l.ratePpm = f!.onrPpm + l.spreadPpm;
                o.status = "ACCEPTED";
                s.loans.push(l);
                if (l.terms.product === "BUSINESS_TERM")
                    draw(s, l, o.amount);
                event(s, l, "LOAN_ORIGINATED", o.amount);
                resourceId = l.id;
            }
        }
    }
    else if (c.kind === "EXPENSE") {
        if (c.supplierId !== s.supplier.id)
            reason = "UNKNOWN_SUPPLIER";
        else if (walletTotal(client) < c.amount)
            reason = "FUNDS";
        else {
            collect(s, client, { key: "supplier:" + s.supplier.id, bucket: s.supplier }, c.amount, "EXPENSE");
            s.expenses.push({ id: c.id, clientId: c.actor, amount: c.amount, refunded: Z });
        }
    }
    else {
        const l = s.loans.find((l) => l.id === c.loanId);
        if (!l || l.clientId !== c.actor)
            reason = "NOT_OWNER";
        else if (c.kind === "DRAW") {
            const p = f!.profiles.find((p) => p.clientId === c.actor)!;
            reason = basic(s, p, f!);
            if (!reason && (l.terms.product !== "PERSONAL_LINE" || l.frozen || l.status !== "PERFORMING"))
                reason = "LINE_FROZEN";
            if (!reason && l.undrawn < c.amount)
                reason = "CREDIT_EXHAUSTED";
            if (!reason)
                draw(s, l, c.amount);
        }
        else if (c.kind === "REPAY") {
            if (l.status === "REPAID")
                reason = "ALREADY_REPAID";
            else if (walletTotal(client) === Z)
                reason = "FUNDS";
            else
                repay(s, l, c.amount, true);
        }
        else {
            if (l.terms.product !== "PERSONAL_LINE" || creditPrincipal(l) + charges(l) > Z)
                reason = "LINE_NOT_EMPTY";
            else {
                l.undrawn = Z;
                l.status = "REPAID";
            }
        }
    }
    s.receipts.push({ id: c.id, fingerprint, accepted: reason === null, reason, resourceId, tick: s.tick });
}
function covenant(s: CreditState, l: CreditLoan, f: CreditFacts): void {
    if (l.terms.product !== "BUSINESS_TERM")
        return;
    const p = f.profiles.find((p) => p.clientId === l.clientId)!;
    if (p.kind !== "COMPANY")
        throw new Error("CREDIT_COMPANY_PROFILE");
    const quarterly = (Math.floor(s.tick / 720) + 1) % 91 === 0;
    if (!quarterly && l.covenantTick === null)
        return;
    const c = s.clients.find((c) => c.id === l.clientId)!, debt = p.outsideDebt + s.loans.filter((a) => a.clientId === c.id && a.status !== "REPAID").reduce((n, a) => n + creditPrincipal(a), Z);
    const service = p.outsideDebtServiceAnnual + s.loans.filter((a) => a.clientId === c.id && a.status !== "REPAID").reduce((n, a) => n + serviceDays(s, a, f.onrPpm, 364, true), Z);
    const denom = BigInt(5) * service, dscr = denom === Z ? Z : positive(denom - BigInt(4) * p.ebitdaAnnual) * M / denom;
    const levDen = BigInt(7) * p.ebitdaAnnual, lev = levDen === Z ? (debt > walletTotal(c) ? M : Z) : positive(BigInt(2) * (debt - walletTotal(c)) - levDen) * M / levDen;
    const breach = dscr > lev ? dscr : lev;
    if (breach === Z) {
        if (l.covenantTick !== null)
            event(s, l, "COVENANT_CURED");
        l.covenantTick = null;
        l.covenantRepricePpm = 0;
        return;
    }
    if (l.covenantTick === null) {
        l.covenantTick = s.tick;
        event(s, l, "COVENANT_BREACH");
    }
    if (s.tick - l.covenantTick >= 28 * 720 && l.covenantRepricePpm === 0) {
        if (f.fearPpm > 500000 || breach > BigInt(250000)) {
            l.principalDue = creditPrincipal(l);
            l.status = "DEFAULTED";
            l.defaultedTick = s.tick;
            l.frozen = true;
            l.undrawn = Z;
            event(s, l, "COVENANT_ACCELERATED", creditPrincipal(l));
        }
        else {
            l.covenantRepricePpm = 20000;
            event(s, l, "COVENANT_REPRICED");
        }
    }
}
function closeDay(s: CreditState, f: CreditFacts): void {
    for (const l of s.loans) {
        if (!active(l))
            continue;
        if (l.status === "WATCH" && l.watchUntilTick !== null && s.tick >= l.watchUntilTick) {
            l.status = "PERFORMING";
            l.watchUntilTick = null;
        }
        const dpd = l.missedTick === null ? 0 : Math.floor((s.tick - l.missedTick) / 720), overdue = due(l);
        l.ratePpm = f.onrPpm + l.spreadPpm + l.covenantRepricePpm;
        if (dpd >= 1)
            l.penalty += daily(overdue - l.penalty, 50000);
        const accrued = daily(creditPrincipal(l), l.ratePpm);
        l.interest += accrued;
        l.periodInterest += accrued;
        if (l.terms.product === "PERSONAL_LINE")
            l.fees += daily(l.undrawn, 2500);
        else if (l.terms.amortization === "ANNUITY")
            l.annuity = annuity(creditPrincipal(l), l.ratePpm, l.terms.frequencyDays, periods(l) - l.paidPeriods);
        const payment = s.tick >= l.nextPaymentTick;
        if (payment) {
            l.principalDue = min(creditPrincipal(l), l.principalDue + principalPayment(l, l.periodInterest));
            l.periodInterest = Z;
            l.paidPeriods++;
            l.nextPaymentTick += (l.terms.product === "BUSINESS_TERM" ? l.terms.frequencyDays : 28) * 720;
        }
        if (l.terms.product === "PERSONAL_LINE" && l.nextReviewTick !== null && s.tick >= l.nextReviewTick) {
            if (assess(s, s.clients.find((c) => c.id === l.clientId)!, Z, l.terms, f, null, true).reason !== null) {
                l.frozen = true;
                l.undrawn = Z;
                event(s, l, "LINE_FROZEN");
            }
            l.nextReviewTick += 28 * 720;
        }
        covenant(s, l, f);
        if (payment || l.missedTick !== null || l.principalDue > Z) {
            repay(s, l, due(l), false);
            if (due(l) > Z && l.missedTick === null)
                l.missedTick = s.tick;
        }
        if (l.missedTick !== null && active(l)) {
            const late = Math.floor((s.tick - l.missedTick) / 720);
            if (late >= 3) {
                l.status = "DEFAULTED";
                l.defaultedTick = s.tick;
                l.principalDue = creditPrincipal(l);
                l.frozen = true;
                l.undrawn = Z;
                event(s, l, "LOAN_DEFAULTED", creditPrincipal(l));
            }
            else if (late >= 1 && l.status !== "DELINQUENT") {
                l.status = "DELINQUENT";
                event(s, l, "LOAN_LATE");
            }
        }
        resetIfPaid(s, l);
    }
    s.days.push({ tick: s.tick, onrPpm: f.onrPpm, principal: s.loans.reduce((n, l) => n + creditPrincipal(l), Z), loss: s.bankBook.writtenOff });
}
function initial(g: CreditGenesis): CreditState {
    const deposits = g.clients.flatMap(c => c.accounts).reduce((n, a) => n + a.cash, Z) + g.supplier.cash;
    return { world: g.world, ccy: g.ccy, tick: -1, bank: structuredClone(g.bank), clients: structuredClone(g.clients), supplier: structuredClone(g.supplier), bankBook: { reserves: g.bank.initialCapital + deposits, equity: g.bank.initialCapital, income: Z, writtenOff: Z }, offers: [], loans: [], receipts: [], expenses: [], movements: [], events: [], days: [] };
}
function invariant(s: CreditState): void {
    assertCreditAccounting(s);
    for (const l of s.loans)
        if (l.principal < Z || l.undrawn < Z || l.chargedOff < Z || l.chargedOff > l.principal || l.principalDue > l.principal)
            throw new Error("CREDIT_LOAN_IDENTITY");
}
function evolve(before: CreditState, frames: CreditFrame[], target: number): CreditState {
    let previous = before.tick;
    for (const f of frames) {
        if (f.tick <= previous || f.tick > target)
            throw new Error("CREDIT_FRAME_ORDER");
        previous = f.tick;
    }
    const required = Math.floor((target + 1) / 720) - Math.floor((before.tick + 1) / 720);
    if (frames.filter((f) => f.tick % 720 === 719).length !== required)
        throw new Error("CREDIT_MISSING_DAY");
    const s = structuredClone(before);
    let cursor = 0;
    while (true) {
        const incoming = frames[cursor]?.tick ?? Infinity, expiry = Math.min(...s.offers.filter((o) => o.status === "OPEN").map((o) => o.expiresTick), Infinity), enforcement = Math.min(...s.loans.filter((l) => l.status === "DEFAULTED").map((l) => l.defaultedTick! + 1), Infinity);
        const watch = Math.min(...s.loans.filter((l) => l.status === "WATCH" && l.watchUntilTick !== null).map((l) => l.watchUntilTick!), Infinity);
        const next = Math.min(incoming, expiry, enforcement, watch);
        if (next > target)
            break;
        if (next <= s.tick)
            throw new Error("CREDIT_EVENT_CLOCK");
        s.tick = next;
        for (const o of s.offers)
            if (o.status === "OPEN" && o.expiresTick <= next) {
                o.status = "EXPIRED";
                s.events.push({ tick: next, kind: "OFFER_EXPIRED", loanId: o.id, amount: Z });
            }
        for (const l of s.loans)
            if (l.status === "WATCH" && l.watchUntilTick !== null && l.watchUntilTick <= next) {
                l.status = "PERFORMING";
                l.watchUntilTick = null;
                event(s, l, "WATCH_ENDED");
            }
        const frame = incoming === next ? frames[cursor++] : null;
        if (frame) {
            for (const c of frame.commands)
                command(s, c, frame.facts);
            if (next % 720 === 719)
                closeDay(s, frame.facts!);
        }
        for (const l of s.loans)
            if (l.status === "DEFAULTED" && l.defaultedTick! + 1 <= next) {
                const borrower = s.clients.find((c) => c.id === l.clientId)!;
                const liquid = walletTotal(borrower);
                l.fees += round(min(liquid, creditPrincipal(l) + charges(l)) * BigInt(10000), M);
                repay(s, l, creditPrincipal(l) + charges(l), true);
                if (creditPrincipal(l) + charges(l) > Z) {
                    writeOffLoan(s, l);
                    l.status = "CHARGED_OFF";
                    event(s, l, "LOAN_CHARGED_OFF", creditPrincipal(l));
                }
                else {
                    l.status = "REPAID";
                }
            }
        invariant(s);
    }
    s.tick = target;
    return s;
}
function checkpoint(g: CreditGenesis, frames: CreditFrame[], state: CreditState): unknown { return creditWire({ version: 2, genesis: g, frames, targetTick: state.tick, digest: creditFingerprint({ genesis: g, frames, state }) }); }
export class CreditEngine {
    private tail: Promise<void> = Promise.resolve();
    private constructor(private readonly store: CreditCheckpointStore, private readonly genesis: CreditGenesis, private state: CreditState, private frames: CreditFrame[], private revision: string | null) { }
    static async open(store: CreditCheckpointStore, rawGenesis: unknown): Promise<CreditEngine> {
        const g = decodeCreditGenesis(rawGenesis), loaded = await store.load();
        if (loaded.revision === null) {
            if (loaded.payload !== null)
                throw new Error("CREDIT_EMPTY_STORE");
            const s = initial(g), revision = await store.save(checkpoint(g, [], s), null);
            return new CreditEngine(store, g, s, [], revision);
        }
        const p = record(strictJson(loaded.payload), ["version", "genesis", "frames", "targetTick", "digest"]);
        if (p.version !== 2 || typeof p.digest !== "string" || !/^[0-9a-f]{64}$/.test(p.digest))
            throw new Error("CREDIT_CHECKPOINT");
        if (creditFingerprint(decodeCreditGenesis(p.genesis)) !== creditFingerprint(g))
            throw new Error("CREDIT_GENESIS_MISMATCH");
        const frames = decodeCreditFrames(p.frames, g), state = evolve(initial(g), frames, creditTick(p.targetTick, -1));
        if (creditFingerprint({ genesis: g, frames, state }) !== p.digest)
            throw new Error("CREDIT_CHECKSUM");
        return new CreditEngine(store, g, state, frames, loaded.revision);
    }
    snapshot(): CreditState { return structuredClone(this.state); }
    async advance(rawTarget: unknown, rawFrames: unknown): Promise<CreditState> {
        const target = creditTick(rawTarget), input = decodeCreditFrames(rawFrames, this.genesis);
        const work = this.tail.then(async () => {
            let previous = -1;
            const fresh: CreditFrame[] = [];
            for (const f of input) {
                if (f.tick <= previous || f.tick > target)
                    throw new Error("CREDIT_FRAME_ORDER");
                previous = f.tick;
                const old = this.frames.find((a) => a.tick === f.tick);
                if (old) {
                    if (canonicalJson(creditWire(old)) !== canonicalJson(creditWire(f)))
                        throw new Error("CREDIT_FRAME_CONFLICT");
                }
                else {
                    if (f.tick <= this.state.tick)
                        throw new Error("CREDIT_LATE_INPUT");
                    fresh.push(f);
                }
            }
            if (target <= this.state.tick) {
                if (fresh.length)
                    throw new Error("CREDIT_LATE_INPUT");
                return this.snapshot();
            }
            const state = evolve(this.state, fresh, target), frames = [...this.frames, ...fresh], revision = await this.store.save(checkpoint(this.genesis, frames, state), this.revision);
            this.state = state;
            this.frames = frames;
            this.revision = revision;
            return this.snapshot();
        });
        this.tail = work.then(() => { }, () => { });
        return work;
    }
}
