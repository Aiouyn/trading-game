import { createHash } from "node:crypto";
import { types } from "node:util";
import type { Money } from "../../../../../packages/engine/core/types";
import { CREDIT_GRADES, type CreditClient, type CreditApplication, type CreditBureauRow, type CreditCommand, type CreditFacts, type CreditFrame, type CreditGenesis, type UnderwritingGrade } from "./model";
type Json = null | boolean | number | string | Json[] | {
    [key: string]: Json;
};
function jsonTree(input: unknown, encodeMoney: boolean): Json {
    const seen = new Set<object>();
    const walk = (value: unknown): Json => {
        if (types.isProxy(value))
            throw new Error("CREDIT_PROXY_INPUT");
        if (encodeMoney && typeof value === "bigint")
            return value.toString();
        if (value === null || typeof value === "string" || typeof value === "boolean")
            return value;
        if (typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0))
            return value;
        if (typeof value !== "object" || value === null || seen.has(value))
            throw new Error("CREDIT_JSON_TREE");
        seen.add(value);
        if (Array.isArray(value)) {
            if (Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1)
                throw new Error("CREDIT_DENSE_ARRAY");
            const out: Json[] = [];
            for (let i = 0; i < value.length; i++) {
                const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
                if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
                    throw new Error("CREDIT_DENSE_ARRAY");
                out.push(walk(descriptor.value));
            }
            return out;
        }
        if (Object.getPrototypeOf(value) !== Object.prototype)
            throw new Error("CREDIT_PLAIN_OBJECT");
        const out: {
            [key: string]: Json;
        } = {};
        const keys = Reflect.ownKeys(value);
        if (keys.some((key) => typeof key !== "string"))
            throw new Error("CREDIT_JSON_KEY");
        for (const key of (keys as string[]).sort()) {
            const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
            if (!descriptor.enumerable || !("value" in descriptor) || ["__proto__", "constructor", "prototype"].includes(key))
                throw new Error("CREDIT_JSON_PROPERTY");
            out[key] = walk(descriptor.value);
        }
        return out;
    };
    return walk(input);
}
export function strictJson(input: unknown): Json { return jsonTree(input, false); }
export function canonicalJson(value: unknown): string { return JSON.stringify(strictJson(value)); }
// Domain money is explicitly encoded; no toJSON/accessor/proxy can run before validation.
export function creditWire(value: unknown): Json { return jsonTree(value, true); }
export function creditFingerprint(domainValue: unknown): string { return createHash("sha256").update(canonicalJson(creditWire(domainValue))).digest("hex"); }
export function record(v: Json, keys: string[]): {
    [key: string]: Json;
} {
    if (!v || typeof v !== "object" || Array.isArray(v) || (Object.keys(v).length !== keys.length || Object.keys(v).some((key) => !keys.includes(key))))
        throw new Error("CREDIT_FIELDS");
    return v;
}
function list(v: Json): Json[] {
    if (!Array.isArray(v))
        throw new Error("CREDIT_ARRAY");
    return v;
}
function text(v: Json): string {
    if (typeof v !== "string" || !v.length)
        throw new Error("CREDIT_ID");
    return v;
}
function flag(v: Json): boolean {
    if (typeof v !== "boolean")
        throw new Error("CREDIT_BOOLEAN");
    return v;
}
function integer(v: unknown, min: number, max: number): number {
    if (typeof v !== "number" || !Number.isSafeInteger(v) || Object.is(v, -0) || v < min || v > max)
        throw new Error("CREDIT_INTEGER");
    return v;
}
export const creditTick = (v: unknown, min = 0): number => integer(v, min, Number.MAX_SAFE_INTEGER - 2000000);
const ppm = (v: Json): number => integer(v, 0, 1000000);
function money(v: Json, positive = false): Money {
    if (typeof v !== "string" || !/^(0|[1-9][0-9]*)$/.test(v) || (positive && v === "0"))
        throw new Error("CREDIT_MICRO_MONEY");
    return BigInt(v);
}
function grade(v: Json): UnderwritingGrade {
    for (const g of CREDIT_GRADES)
        if (v === g)
            return g;
    throw new Error("CREDIT_GRADE");
}
function unique(ids: string[]): void {
    if (new Set(ids).size !== ids.length)
        throw new Error("CREDIT_DUPLICATE");
}
function terms(v: Json): CreditApplication {
    if (!v || typeof v !== "object" || Array.isArray(v))
        throw new Error("CREDIT_PRODUCT");
    if (v.product === "PERSONAL_LINE") {
        record(v, ["product"]);
        return { product: "PERSONAL_LINE" };
    }
    const t = record(v, ["product", "termYears", "frequencyDays", "amortization"]);
    if (t.product !== "BUSINESS_TERM" || !["LINEAR", "ANNUITY", "BULLET"].includes(String(t.amortization)))
        throw new Error("CREDIT_PRODUCT");
    const termYears = integer(t.termYears, 1, 5), frequencyDays = integer(t.frequencyDays, 1, 1820);
    if (termYears * 364 % frequencyDays !== 0)
        throw new Error("CREDIT_FREQUENCY");
    const amortization = t.amortization;
    if (amortization !== "LINEAR" && amortization !== "ANNUITY" && amortization !== "BULLET")
        throw new Error("CREDIT_AMORTIZATION");
    return { product: "BUSINESS_TERM", termYears, frequencyDays, amortization };
}
export function decodeCreditGenesis(raw: unknown): CreditGenesis {
    const g = record(strictJson(raw), ["world", "ccy", "bank", "clients", "supplier"]);
    if (g.ccy !== "FDL")
        throw new Error("CREDIT_FDL_ONLY");
    const b = record(g.bank, ["id", "initialCapital", "dailySupply", "productLimit", "borrowerLimit", "exposureLimit", "cet1TargetPpm", "grades"]);
    const grades = list(b.grades).map((value) => { const r = record(value, ["grade", "marginPpm", "personalCap", "personalFloorPpm"]); return { grade: grade(r.grade), marginPpm: ppm(r.marginPpm), personalCap: money(r.personalCap), personalFloorPpm: integer(r.personalFloorPpm, 40000, 180000) }; });
    unique(grades.map((r) => r.grade));
    if (grades.length !== 6 || CREDIT_GRADES.slice(0, 6).some((g) => !grades.some((r) => r.grade === g)))
        throw new Error("CREDIT_POLICY_GRID");
    if (grades.find((r) => r.grade === "AAA")!.personalCap !== BigInt(50000000) * BigInt(1000000) || grades.find((r) => r.grade === "B")!.personalCap !== BigInt(50000) * BigInt(1000000))
        throw new Error("CREDIT_GRADE_CAP_ENDPOINTS");
    const clients: CreditClient[] = list(g.clients).map((value) => {
        const c = record(value, ["id", "kind", "homeAccountId", "accounts"]);
        if (c.kind !== "PERSON" && c.kind !== "COMPANY")
            throw new Error("CREDIT_CLIENT_KIND");
        const accounts = list(c.accounts).map((value) => { const a = record(value, ["id", "bankId", "cash"]); return { id: text(a.id), bankId: a.bankId === null ? null : text(a.bankId), cash: money(a.cash) }; });
        if (!accounts.some((a) => a.id === c.homeAccountId))
            throw new Error("CREDIT_HOME_ACCOUNT");
        return { id: text(c.id), kind: c.kind, homeAccountId: text(c.homeAccountId), accounts };
    });
    unique(clients.map((c) => c.id));
    unique(clients.flatMap((c) => c.accounts.map((a) => a.id)));
    const supplier = record(g.supplier, ["id", "cash"]);
    if (clients.some((c) => c.id === supplier.id))
        throw new Error("CREDIT_SUPPLIER_IDENTITY");
    return { world: text(g.world), ccy: g.ccy, bank: { id: text(b.id), initialCapital: money(b.initialCapital), dailySupply: money(b.dailySupply), productLimit: money(b.productLimit), borrowerLimit: money(b.borrowerLimit), exposureLimit: money(b.exposureLimit), cet1TargetPpm: ppm(b.cet1TargetPpm), grades }, clients, supplier: { id: text(supplier.id), cash: money(supplier.cash) } };
}
function facts(v: Json, g: CreditGenesis): CreditFacts {
    const f = record(v, ["bankStatus", "onrPpm", "fearPpm", "standardsPpm", "profiles"]);
    if (f.bankStatus !== "ACTIVE" && f.bankStatus !== "WATCH" && f.bankStatus !== "RESTRICTED")
        throw new Error("CREDIT_BANK_STATUS");
    const profiles: CreditBureauRow[] = list(f.profiles).map((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value))
            throw new Error("CREDIT_BUREAU");
        const keys = ["clientId", "kind", "grade", "pdPpm", "held", "bankruptcyLocked", "netWorth", "income30d", "outsideDebt", "outsideDebtService30d"];
        const p = record(value, [...keys, ...(value.kind === "PERSON" ? ["rookie"] : ["ebitdaAnnual", "outsideTermPrincipal", "outsideDebtServiceAnnual"])]);
        const common = { clientId: text(p.clientId), grade: grade(p.grade), pdPpm: ppm(p.pdPpm), held: flag(p.held), bankruptcyLocked: flag(p.bankruptcyLocked), netWorth: money(p.netWorth), income30d: money(p.income30d), outsideDebt: money(p.outsideDebt), outsideDebtService30d: money(p.outsideDebtService30d) };
        if (p.kind === "PERSON")
            return { ...common, kind: "PERSON", rookie: flag(p.rookie) };
        if (p.kind === "COMPANY")
            return { ...common, kind: "COMPANY", ebitdaAnnual: money(p.ebitdaAnnual), outsideTermPrincipal: money(p.outsideTermPrincipal), outsideDebtServiceAnnual: money(p.outsideDebtServiceAnnual) };
        throw new Error("CREDIT_BUREAU_KIND");
    });
    unique(profiles.map((p) => p.clientId));
    if (profiles.length !== g.clients.length || profiles.some((p) => !g.clients.some((c) => c.id === p.clientId && c.kind === p.kind)))
        throw new Error("CREDIT_PROFILE_COVERAGE");
    return { bankStatus: f.bankStatus, onrPpm: ppm(f.onrPpm), fearPpm: ppm(f.fearPpm), standardsPpm: ppm(f.standardsPpm), profiles };
}
function command(v: Json): CreditCommand {
    if (!v || typeof v !== "object" || Array.isArray(v))
        throw new Error("CREDIT_COMMAND");
    const keys = ["id", "actor", "kind"], common = { id: text(v.id), actor: text(v.actor) };
    switch (v.kind) {
        case "APPLY": {
            const c = record(v, [...keys, "amount", "receivingAccountId", "terms"]);
            return { ...common, kind: v.kind, amount: money(c.amount, true), receivingAccountId: text(c.receivingAccountId), terms: terms(c.terms) };
        }
        case "ACCEPT": {
            const c = record(v, [...keys, "offerId"]);
            return { ...common, kind: v.kind, offerId: text(c.offerId) };
        }
        case "DRAW":
        case "REPAY": {
            const c = record(v, [...keys, "loanId", "amount"]);
            return { ...common, kind: v.kind, loanId: text(c.loanId), amount: money(c.amount, true) };
        }
        case "CLOSE_LINE": {
            const c = record(v, [...keys, "loanId"]);
            return { ...common, kind: v.kind, loanId: text(c.loanId) };
        }
        case "REFUND_EXPENSE": {
            const c = record(v, [...keys, "expenseId", "amount"]);
            return { ...common, kind: v.kind, expenseId: text(c.expenseId), amount: money(c.amount, true) };
        }
        case "EXPENSE": {
            const c = record(v, [...keys, "supplierId", "amount"]);
            return { ...common, kind: v.kind, supplierId: text(c.supplierId), amount: money(c.amount, true) };
        }
        default: throw new Error("CREDIT_COMMAND");
    }
}
export function decodeCreditFrames(raw: unknown, g: CreditGenesis): CreditFrame[] {
    return list(strictJson(raw)).map((value) => {
        const f = record(value, ["tick", "commands", "facts"]), tick = creditTick(f.tick), commands = list(f.commands).map(command);
        unique(commands.map((c) => c.id));
        const observations = f.facts === null ? null : facts(f.facts, g);
        if ((tick % 720 === 719 || commands.some((c) => ["APPLY", "ACCEPT", "DRAW"].includes(c.kind))) && observations === null)
            throw new Error("CREDIT_FACTS_REQUIRED");
        return { tick, commands, facts: observations };
    });
}
