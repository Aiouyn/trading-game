import { CreditEngine } from "../../../src/server/credit/engine";
import { creditFingerprint } from "../../../src/server/credit/input";
import type { CreditCheckpointStore } from "../../../src/server/credit/model";
export const usd = (n: number): string => (BigInt(n) * BigInt(1000000)).toString();
export function genesis() {
    return {
        world: "credit-proof", ccy: "FDL", bank: { id: "bank", initialCapital: usd(100), dailySupply: usd(1000000), productLimit: usd(1000000), borrowerLimit: usd(1000000), exposureLimit: usd(1000000), cet1TargetPpm: 120000,
            grades: ["AAA", "AA", "A", "BBB", "BB", "B"].map((grade, i) => ({ grade, marginPpm: 5000 + i * 5000, personalCap: usd([50000000, 10000000, 1000000, 500000, 100000, 50000][i]), personalFloorPpm: 40000 + i * 28000 })) },
        clients: [{ id: "person", kind: "PERSON", homeAccountId: "person-home", accounts: [{ id: "person-home", bankId: null as string | null, cash: usd(0) }] },
            { id: "company", kind: "COMPANY", homeAccountId: "company-home", accounts: [{ id: "company-home", bankId: null as string | null, cash: usd(0) }] },
            { id: "investor", kind: "PERSON", homeAccountId: "investor-home", accounts: [{ id: "investor-home", bankId: null as string | null, cash: usd(1000) }] }], supplier: { id: "supplier", cash: usd(0) }
    };
}
const common = (clientId: string) => ({ clientId, grade: "AAA", pdPpm: 2000, held: false, bankruptcyLocked: false, netWorth: usd(1000000), income30d: usd(10000), outsideDebt: usd(0), outsideDebtService30d: usd(0) });
const person = (id: string) => ({ ...common(id), kind: "PERSON", rookie: false });
const company = () => ({ ...common("company"), kind: "COMPANY", ebitdaAnnual: usd(10000), outsideTermPrincipal: usd(0), outsideDebtServiceAnnual: usd(0) });
export function facts() {
    const profiles: [
        ReturnType<typeof person>,
        ReturnType<typeof company>,
        ReturnType<typeof person>
    ] = [person("person"), company(), person("investor")];
    return { bankStatus: "ACTIVE", onrPpm: 20000, fearPpm: 0, standardsPpm: 0, profiles };
}
export const apply = (actor = "company", amount = 364, amortization = "LINEAR", frequencyDays = 28, id = "apply") => ({ id, actor, kind: "APPLY", amount: usd(amount), receivingAccountId: actor + "-home", terms: actor === "person" ? { product: "PERSONAL_LINE" } : { product: "BUSINESS_TERM", termYears: 1, frequencyDays, amortization } });
export const offerId = (id = "apply") => creditFingerprint({ offerCommand: id });
export const accept = (actor = "company", id = "accept", applicationId = "apply") => ({ id, actor, kind: "ACCEPT", offerId: offerId(applicationId) });
export const expense = (actor = "company", amount = 364, id = "expense") => ({ id, actor, kind: "EXPENSE", supplierId: "supplier", amount: usd(amount) });
export const repay = (actor = "company", amount = 100000, id = "repay") => ({ id, actor, kind: "REPAY", loanId: offerId(), amount: usd(amount) });
export const frame = (tick: number, commands: unknown[] = [], f: unknown = facts()) => ({ tick, commands: structuredClone(commands), facts: structuredClone(f) });
export const days = (count: number, makeFacts = (day: number) => { void day; return facts(); }, start = 0) => Array.from({ length: count }, (_, i) => frame((start + i + 1) * 720 - 1, [], makeFacts(start + i)));
export function defaultFrames() { return [frame(0, [apply("company", 364, "LINEAR", 1)]), frame(1, [accept()]), frame(2, [expense()]), ...days(4)]; }
export class MemoryStore implements CreditCheckpointStore {
    revision: string | null = null;
    payload: unknown = null;
    fail = false;
    async load() { return { revision: this.revision, payload: structuredClone(this.payload) }; }
    async save(payload: unknown, expected: string | null) {
        if (this.fail)
            throw new Error("TEST_DISK_FAILURE");
        if (expected !== this.revision)
            throw new Error("CREDIT_STALE_STORE");
        this.payload = structuredClone(payload);
        this.revision = creditFingerprint(payload);
        return this.revision;
    }
}
export const opened = async (g: unknown = genesis()) => { const store = new MemoryStore(); return { store, engine: await CreditEngine.open(store, g) }; };
