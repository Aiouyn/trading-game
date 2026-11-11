import { describe, it, expect } from "vitest";
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FileCreditCheckpointStore } from "../../../src/server/credit/store";
import { CreditEngine, creditCashTotal, creditPrincipal, creditReserved } from "../../../src/server/credit/engine";
import { canonicalJson, creditFingerprint, creditWire } from "../../../src/server/credit/input";
import { accept, apply, days, defaultFrames, expense, facts, frame, fund, genesis, MemoryStore, offerId, opened, repay, usd } from "./fixtures";
const n = (d: number) => BigInt(usd(d));
const last = (s: ReturnType<CreditEngine["snapshot"]>) => s.receipts.at(-1)!;
function reversed(v: unknown): unknown {
    if (Array.isArray(v))
        return v.map(reversed);
    if (v && typeof v === "object")
        return Object.fromEntries(Object.entries(v).reverse().map(([k, a]) => [k, reversed(a)]));
    return v;
}
describe("closed-world funded credit", () => {
    it("requires explicit lending consent; held offers cannot be withdrawn or overbooked", async () => {
        const { engine } = await opened();
        const before = creditCashTotal(engine.snapshot());
        await engine.advance(0, [frame(0, [{ ...fund("no"), consent: false }])]);
        expect(last(engine.snapshot()).reason).toBe("NO_LENDING_CONSENT");
        let s = await engine.advance(1, [frame(1, [fund(), apply("person", 1000)])]);
        expect(creditReserved(s, s.funds[0].id)).toBe(n(100));
        const fid = s.funds.find(f => f.depositorId === "investor")!.id;
        s = await engine.advance(2, [frame(2, [{ id: "withdraw", actor: "investor", kind: "WITHDRAW_FUND", fundId: fid, accountId: "investor-home", amount: usd(101) }, apply("person", 101, "LINEAR", 28, "other")])]);
        expect(s.receipts.find(r => r.id === "withdraw")!.reason).toBe("COMMITTED_FUNDS");
        expect(last(s).reason).toBe("CREDIT_EXHAUSTED");
        s = await engine.advance(3, [frame(3, [accept("person"), { id: "draw", actor: "person", kind: "DRAW", loanId: offerId(), amount: usd(500) }])]);
        expect(creditPrincipal(s.loans[0])).toBe(n(500));
        expect(s.clients[0].accounts.find(a => a.id === "person-home")!.cash).toBe(n(500));
        expect(s.movements.filter(m => m.kind === "DRAW").map(m => m.amount)).toEqual([n(50), n(450)]);
        expect(creditCashTotal(s)).toBe(before);
        s = await engine.advance(4, [frame(4, [{ id: "too-big", actor: "person", kind: "DRAW", loanId: offerId(), amount: usd(501) }])]);
        expect(last(s).reason).toBe("CREDIT_EXHAUSTED");
    });
    it("expires before commands on tick30; acceptance on29 remains valid", async () => {
        for (const tick of [29, 30]) {
            const { engine } = await opened();
            await engine.advance(0, [frame(0, [apply("person", 100)])]);
            const s = await engine.advance(tick, [frame(tick, [accept("person")])]);
            expect(last(s).accepted).toBe(tick === 29);
            expect(s.offers[0].status).toBe(tick === 29 ? "ACCEPTED" : "EXPIRED");
            expect(creditReserved(s, s.funds[0].id)).toBe(tick === 29 ? n(100) : n(0));
        }
    });
    it.each(["LINEAR", "ANNUITY", "BULLET"])("repays the exact 364-day %s principal, final dust and actual interest", async (amortization) => {
        const g = genesis();
        g.clients[1].accounts[0].cash = usd(10000);
        const { engine } = await opened(g), initial = creditCashTotal(engine.snapshot());
        const s = await engine.advance(364 * 720 - 1, [frame(0, [fund(), apply("company", 364, amortization)]), frame(1, [accept()]), ...days(364)]);
        expect(s.loans[0].status).toBe("REPAID");
        expect(creditPrincipal(s.loans[0])).toBe(n(0));
        expect(s.movements.filter(m => m.kind === "REPAY_PRINCIPAL").reduce((a, m) => a + m.amount, n(0))).toBe(n(364));
        expect(s.movements.some(m => m.kind === "REPAY_INTEREST")).toBe(true);
        expect(creditCashTotal(s)).toBe(initial);
        expect(s.days).toHaveLength(364);
        const principalByDay = new Map<number, bigint>();
        for (const m of s.movements.filter(m => m.kind === "REPAY_PRINCIPAL"))
            principalByDay.set(m.tick, (principalByDay.get(m.tick) ?? n(0)) + m.amount);
        expect(principalByDay.size).toBe(amortization === "BULLET" ? 1 : 13);
        if (amortization === "LINEAR")
            expect([...principalByDay.values()]).toEqual(Array(13).fill(n(28)));
    }, 30000);
    it("uses supplied ONR, exact719 day-close, daily frequency, and collects Held on weekends", async () => {
        const g = genesis();
        g.clients[1].accounts[0].cash = usd(100);
        const { engine } = await opened(g);
        await engine.advance(718, [frame(0, [fund(), apply("company", 364, "LINEAR", 1)]), frame(1, [accept()])]);
        expect(engine.snapshot().loans[0].interest).toBe(n(0));
        const f = facts();
        f.onrPpm = 40000;
        f.profiles[1].held = true;
        const s = await engine.advance(719, [frame(719, [], f)]);
        expect(s.loans[0].spreadPpm).toBe(21700);
        expect(s.loans[0].ratePpm).toBe(61700);
        expect(s.movements.filter(m => m.kind === "REPAY_INTEREST").reduce((a, m) => a + m.amount, n(0))).toBe(BigInt(61700));
        expect(creditPrincipal(s.loans[0])).toBe(n(363));
    });
    it("charges only drawn line interest and undrawn fees; failed28-day review freezes commitments", async () => {
        const { engine } = await opened();
        await engine.advance(2, [frame(0, [fund(), apply("person", 1000)]), frame(1, [accept("person")]), frame(2, [{ id: "draw", actor: "person", kind: "DRAW", loanId: offerId(), amount: usd(100) }])]);
        let s = await engine.advance(719, [frame(719)]);
        expect(s.loans[0].interest).toBe(BigInt(16484));
        expect(s.loans[0].fees).toBe(BigInt(6181));
        s = await engine.advance(28 * 720 - 1, days(27, d => {
            const f = facts();
            if (d === 27)
                f.profiles[0].netWorth = usd(1);
            return f;
        }, 1));
        expect(s.loans[0].frozen).toBe(true);
        expect(s.loans[0].slices.every(a => a.reserved === n(0))).toBe(true);
        expect(creditPrincipal(s.loans[0])).toBe(n(100));
    });
    it("free prepayment clears accrued interest first, replenishes live line, and closes only empty lines", async () => {
        const { engine } = await opened();
        await engine.advance(2, [frame(0, [fund(), apply("person", 1000)]), frame(1, [accept("person")]), frame(2, [{ id: "draw", actor: "person", kind: "DRAW", loanId: offerId(), amount: usd(100) }])]);
        let s = await engine.advance(3, [frame(3, [repay("person", 100), { id: "close", actor: "person", kind: "CLOSE_LINE", loanId: offerId() }])]);
        expect(last(s).accepted).toBe(true);
        expect(s.loans[0].status).toBe("REPAID");
        expect(s.loans[0].slices.every(a => a.reserved === n(0))).toBe(true);
        s = await engine.advance(4, [frame(4, [{ id: "again", actor: "person", kind: "DRAW", loanId: offerId(), amount: usd(1) }])]);
        expect(last(s).reason).toBe("LINE_FROZEN");
    });
    it("DPD1/3, next-tick chargeoff and exact original funder loss; real supplier refund recovers cash", async () => {
        const { engine } = await opened();
        const total = creditCashTotal(engine.snapshot());
        let s = await engine.advance(719, defaultFrames().filter(f => f.tick <= 719));
        expect(s.loans[0].missedTick).toBe(719);
        expect(s.loans[0].status).toBe("PERFORMING");
        s = await engine.advance(1439, [frame(1439)]);
        expect(s.loans[0].status).toBe("DELINQUENT");
        expect(s.loans[0].penalty).toBe(BigInt(143));
        s = await engine.advance(2879, [frame(2159), frame(2879)]);
        expect(s.loans[0].status).toBe("DEFAULTED");
        expect(s.funds.every(f => f.loss === n(0))).toBe(true);
        s = await engine.advance(2880, []);
        expect(s.loans[0].status).toBe("CHARGED_OFF");
        expect(s.funds.map(f => f.loss)).toEqual([n(100), n(264)]);
        expect(s.supplier.cash).toBe(n(364));
        expect(creditCashTotal(s)).toBe(total);
        s = await engine.advance(2881, [frame(2881, [{ id: "fake", actor: "person", kind: "REFUND_EXPENSE", expenseId: "expense", amount: usd(1) }, { id: "refund", actor: "supplier", kind: "REFUND_EXPENSE", expenseId: "expense", amount: usd(100) }, repay("company", 100)])]);
        expect(s.receipts.find(r => r.id === "fake")!.reason).toBe("NOT_SUPPLIER");
        expect(s.funds.reduce((a, f) => a + f.loss, n(0))).toBeLessThan(n(265));
        expect(s.funds.reduce((a, f) => a + f.loss, n(0))).toBeGreaterThan(n(264));
        expect(s.supplier.cash).toBe(n(264));
        expect(creditCashTotal(s)).toBe(total);
        s = await engine.advance(2882, [frame(2882, [{ id: "refund-overflow", actor: "supplier", kind: "REFUND_EXPENSE", expenseId: "expense", amount: usd(265) }])]);
        expect(last(s).reason).toBe("REFUND_LIMIT");
    });
    it("fee-only line penalties can be repaid even with no principal and no share weights", async () => {
        const { engine } = await opened();
        await engine.advance(28 * 720 - 1, [frame(0, [apply("person", 100)]), frame(1, [accept("person")]), ...days(28)]);
        const s = await engine.advance(31 * 720, [...days(3, () => facts(), 28)]);
        expect(s.loans[0].status).toBe("CHARGED_OFF");
        expect(creditPrincipal(s.loans[0])).toBe(n(0));
        expect(s.funds[0].loss).toBe(n(0));
    });
    it("cure gives WATCH for exactly7days, including an expiry between day closes", async () => {
        const g = genesis();
        g.clients[1].accounts.push({ id: "company-settlement", bankId: null, cash: usd(0) }, { id: "company-other", bankId: "other", cash: usd(0) });
        const { engine } = await opened(g);
        await engine.advance(1439, defaultFrames().filter(f => f.tick <= 1439));
        let s = await engine.advance(1440, [frame(1440, [{ id: "refund", actor: "supplier", kind: "REFUND_EXPENSE", expenseId: "expense", amount: usd(100) }, repay("company", 3)])]);
        expect(s.loans[0].status).toBe("WATCH");
        expect(s.loans[0].watchUntilTick).toBe(6480);
        s = await engine.advance(6479, days(7, () => facts(), 2));
        expect(s.loans[0].status).toBe("WATCH");
        s = await engine.advance(6480, []);
        expect(s.loans[0].status).toBe("PERFORMING");
    });
    it("collects real repayment from home, lender, settlement, then other-bank cash", async () => {
        const g = genesis();
        g.clients[1].accounts[0].cash = usd(1);
        g.clients[1].accounts.push({ id: "settlement", bankId: null, cash: usd(2) }, { id: "lender", bankId: "bank", cash: usd(3) }, { id: "other", bankId: "z-bank", cash: usd(4) });
        const { engine } = await opened(g);
        const s = await engine.advance(3, [frame(0, [fund(), apply()]), frame(1, [accept()]), frame(2, [expense()]), frame(3, [repay("company", 10)])]);
        expect(s.clients[1].accounts.every(a => a.cash === n(0))).toBe(true);
        expect(creditPrincipal(s.loans[0])).toBe(n(354));
        const sources = s.movements.filter(m => m.kind === "REPAY_PRINCIPAL").map(m => m.from), key = (accountId: string) => "account:" + creditFingerprint({ clientId: "company", accountId });
        expect(sources).toEqual([key("company-home"), key("lender"), key("lender"), key("settlement"), key("other")]);
    });
    it("default setoff cannot hide uncommitted borrower cash in an opted-in lending fund", async () => {
        const g = genesis();
        g.clients[1].accounts[0].cash = usd(500);
        const { engine } = await opened(g);
        const inputs = defaultFrames();
        inputs[0].commands.unshift({ id: "park", actor: "company", kind: "FUND_LENDING", accountId: "company-home", amount: usd(500), consent: true });
        const s = await engine.advance(2880, inputs);
        expect(s.loans[0].status).toBe("REPAID");
        expect(s.funds.every(f => f.loss === n(0))).toBe(true);
        expect(s.funds.find(f => f.depositorId === "company")!.cash).toBeLessThan(n(136));
        expect(creditCashTotal(s)).toBe(n(1600));
    });
    it("tests covenants quarterly, waits28days, reprices200bp and clears on cure", async () => {
        const g = genesis();
        g.clients[1].accounts[0].cash = usd(10000);
        const { engine } = await opened(g);
        const bad = () => { const f = facts(); f.profiles[1].outsideDebt = usd(46000); return f; };
        await engine.advance(90 * 720 - 1, [frame(0, [fund(), apply("company", 364, "BULLET")]), frame(1, [accept()]), ...days(90, bad)]);
        expect(engine.snapshot().loans[0].covenantTick).toBe(null);
        let s = await engine.advance(91 * 720 - 1, [frame(91 * 720 - 1, [], bad())]);
        expect(s.loans[0].covenantTick).toBe(91 * 720 - 1);
        expect(s.loans[0].covenantRepricePpm).toBe(0);
        s = await engine.advance(118 * 720 - 1, days(27, bad, 91));
        expect(s.loans[0].covenantRepricePpm).toBe(0);
        s = await engine.advance(119 * 720 - 1, [frame(119 * 720 - 1, [], bad())]);
        expect(s.loans[0].covenantRepricePpm).toBe(20000);
        s = await engine.advance(120 * 720 - 1, [frame(120 * 720 - 1)]);
        expect(s.loans[0].covenantTick).toBe(null);
        expect(s.loans[0].covenantRepricePpm).toBe(0);
    }, 30000);
    it("uncured covenant acceleration defaults immediately, without an extra DPD grace period", async () => {
        const { engine } = await opened();
        const bad = () => { const f = facts(); f.profiles[1].outsideDebt = usd(40000); f.fearPpm = 500001; return f; };
        const tick = 119 * 720 - 1;
        let s = await engine.advance(tick, [frame(0, [fund(), apply("company", 364, "BULLET", 364)]), frame(1, [accept()]), frame(2, [expense()]), ...days(119, bad)]);
        expect(s.loans[0].status).toBe("DEFAULTED");
        expect(s.loans[0].defaultedTick).toBe(tick);
        s = await engine.advance(tick + 1, []);
        expect(s.loans[0].status).toBe("CHARGED_OFF");
        expect(s.funds.map(f => f.loss)).toEqual([n(100), n(264)]);
    }, 30000);
    it("existing DPD2 cannot overwrite immediate covenant acceleration", async () => {
        const { engine } = await opened();
        const bad = () => { const f = facts(); f.profiles[1].outsideDebt = usd(40000); f.fearPpm = 500001; return f; };
        const prefix = [frame(0, [fund()]), frame(3600, [apply("company", 364, "BULLET")]), frame(3601, [accept()]), ...days(116, bad)].sort((a, b) => a.tick - b.tick);
        let s = await engine.advance(116 * 720 - 1, prefix);
        const cash = s.clients[1].accounts.reduce((n, a) => n + a.cash, BigInt(0));
        s = await engine.advance(119 * 720 - 1, [frame(117 * 720 - 1, [{ ...expense(), amount: cash.toString() }], bad()), ...days(2, bad, 117)]);
        expect(s.loans[0].status).toBe("DEFAULTED");
        expect(s.loans[0].defaultedTick).toBe(119 * 720 - 1);
        s = await engine.advance(119 * 720, []);
        expect(s.loans[0].status).toBe("CHARGED_OFF");
    }, 30000);
    it.each(["fear", "severe"])("accelerates uncured covenant on %s, never fabricates collateral proceeds", async (mode) => {
        const g = genesis();
        g.clients[1].accounts[0].cash = usd(10000);
        const { engine } = await opened(g);
        const bad = () => { const f = facts(); f.profiles[1].outsideDebt = usd(mode === "severe" ? 55000 : 46000); f.fearPpm = mode === "fear" ? 500001 : 0; return f; };
        const s = await engine.advance(119 * 720 - 1, [frame(0, [fund(), apply("company", 364, "BULLET")]), frame(1, [accept()]), ...days(119, bad)]);
        expect(s.loans[0].status).toBe("REPAID");
        expect(s.funds.every(f => f.loss === n(0))).toBe(true);
        expect(s.loans[0].covenantRepricePpm).toBe(0);
    }, 30000);
});
describe("underwriting boundaries", () => {
    it.each([
        ["held", "HELD"], ["locked", "BANKRUPTCY_LOCK"], ["grade", "GRADE"], ["rookie", "PERSONAL_LIMIT"], ["income", "PERSONAL_LIMIT"], ["dsr", "DSR"], ["restricted", "BANK_RESTRICTED"], ["watch", "SUPPLY"], ["ebitda", "EBITDA_LIMIT"], ["dscr", "DSCR"], ["leverage", "LEVERAGE"], ["cap", "BANK_LIMIT"], ["exhausted", "CREDIT_EXHAUSTED"], ["rate", "RATE_CAP"]
    ])("refuses %s (%s)", async (mode, reason) => {
        const g = genesis(), f = facts();
        let actor = "person", amount = 100;
        if (mode === "held")
            f.profiles[0].held = true;
        if (mode === "locked")
            f.profiles[0].bankruptcyLocked = true;
        if (mode === "grade") {
            f.profiles[0].grade = "BB";
            f.standardsPpm = 800000;
        }
        if (mode === "rookie") {
            f.profiles[0].rookie = true;
            amount = 1001;
        }
        if (mode === "income")
            f.profiles[0].income30d = usd(1);
        if (mode === "dsr")
            f.profiles[0].outsideDebtService30d = usd(5000);
        if (mode === "restricted")
            f.bankStatus = "RESTRICTED";
        if (mode === "watch") {
            f.bankStatus = "WATCH";
            g.bank.dailySupply = usd(100);
        }
        if (mode === "ebitda") {
            actor = "company";
            f.profiles[1].ebitdaAnnual = usd(30);
        }
        if (mode === "dscr") {
            actor = "company";
            f.profiles[1].outsideDebtServiceAnnual = usd(8000);
        }
        if (mode === "leverage") {
            actor = "company";
            f.profiles[1].outsideDebt = usd(35001);
        }
        if (mode === "cap")
            g.bank.borrowerLimit = usd(99);
        if (mode === "exhausted")
            amount = 101;
        if (mode === "rate")
            f.profiles[0].pdPpm = 200000;
        const { engine } = await opened(g);
        const s = await engine.advance(0, [frame(0, [apply(actor, amount)], f)]);
        expect(last(s).reason).toBe(reason);
        expect(s.loans).toHaveLength(0);
        expect(creditReserved(s, s.funds[0].id)).toBe(n(0));
    });
    it("adds own/pending loans to bureau limits and does not double count accepted offer", async () => {
        const { engine } = await opened();
        const f = facts();
        f.profiles[0].netWorth = usd(1000);
        let s = await engine.advance(0, [frame(0, [apply("person", 60), apply("person", 60, "LINEAR", 28, "second")], f)]);
        expect(last(s).reason).toBe("PERSONAL_LIMIT");
        s = await engine.advance(1, [frame(1, [accept("person")], f)]);
        expect(last(s).accepted).toBe(true);
        expect(s.loans).toHaveLength(1);
    });
    it("rechecks facts on acceptance and each draw; validates receiving ownership", async () => {
        const { engine } = await opened();
        await engine.advance(0, [frame(0, [apply("person", 100)])]);
        const f = facts();
        f.profiles[0].held = true;
        let s = await engine.advance(1, [frame(1, [accept("person", "held")], f)]);
        expect(last(s).reason).toBe("HELD");
        s = await engine.advance(2, [frame(2, [accept("person")])]);
        expect(last(s).accepted).toBe(true);
        s = await engine.advance(3, [frame(3, [{ id: "draw", actor: "person", kind: "DRAW", loanId: offerId(), amount: usd(1) }], f)]);
        expect(last(s).reason).toBe("HELD");
        s = await engine.advance(4, [frame(4, [{ ...apply("person", 1, "LINEAR", 28, "wrong"), receivingAccountId: "company-home" }])]);
        expect(last(s).reason).toBe("NOT_OWNER");
    });
});
describe("accepted state = stored state = canonical replay", () => {
    it("reordered fields replay across restart; conflict and stale writer cannot overwrite", async () => {
        const g = genesis(), store = new MemoryStore();
        const engine = await CreditEngine.open(store, g), stale = await CreditEngine.open(store, g), frames = [frame(0, [fund(), apply()]), frame(1, [accept()])];
        const before = await engine.advance(1, frames), bytes = JSON.stringify(store.payload), restarted = await CreditEngine.open(store, reversed(g));
        expect(await restarted.advance(1, reversed(frames))).toEqual(before);
        expect(JSON.stringify(store.payload)).toBe(bytes);
        await expect(stale.advance(2, [])).rejects.toThrow("CREDIT_STALE_STORE");
        await expect(restarted.advance(2, [frame(2, [{ ...fund(), amount: usd(1) }])])).rejects.toThrow("CREDIT_COMMAND_CONFLICT");
        expect(restarted.snapshot()).toEqual(before);
        const clone = restarted.snapshot();
        clone.clients[0].accounts[0].cash = n(999);
        expect(restarted.snapshot()).toEqual(before);
    });
    it("failed save/bad batch rolls back and promise queue recovers", async () => {
        const { engine, store } = await opened(), before = engine.snapshot();
        store.fail = true;
        await expect(engine.advance(0, [frame(0, [fund(), apply()])])).rejects.toThrow("TEST_DISK_FAILURE");
        expect(engine.snapshot()).toEqual(before);
        store.fail = false;
        await expect(engine.advance(1, [frame(0, [fund(), apply()]), frame(1, [{ ...fund(), amount: usd(1) }])])).rejects.toThrow("CREDIT_COMMAND_CONFLICT");
        expect(engine.snapshot()).toEqual(before);
        await engine.advance(0, [frame(0, [fund()])]);
        expect(engine.snapshot().funds).toHaveLength(2);
    });
    it("detects journal tampering in financially unused observation", async () => {
        const { engine, store } = await opened();
        await engine.advance(0, [frame(0)]);
        const payload = store.payload as {
            frames: {
                facts: {
                    profiles: {
                        netWorth: string;
                    }[];
                };
            }[];
        };
        payload.frames[0].facts.profiles[2].netWorth = usd(2);
        await expect(CreditEngine.open(store, genesis())).rejects.toThrow("CREDIT_CHECKSUM");
    });
    it("requires every day close and complete live profile coverage, with atomic refusal", async () => {
        const { engine } = await opened(), before = engine.snapshot();
        await expect(engine.advance(720, [])).rejects.toThrow("CREDIT_MISSING_DAY");
        const f = facts();
        f.profiles.pop();
        await expect(engine.advance(0, [frame(0, [], f)])).rejects.toThrow("CREDIT_PROFILE_COVERAGE");
        await expect(engine.advance(719, [frame(719, [], null)])).rejects.toThrow("CREDIT_FACTS_REQUIRED");
        expect(engine.snapshot()).toEqual(before);
    });
    const invalid: [
        string,
        () => unknown
    ][] = [
        ["NaN", () => ({ ...genesis(), world: NaN })], ["Infinity", () => ({ ...genesis(), world: Infinity })], ["negative zero", () => ({ ...genesis(), world: -0 })], ["undefined", () => ({ ...genesis(), world: undefined })], ["Date", () => ({ ...genesis(), world: new Date() })], ["Map", () => ({ ...genesis(), world: new Map() })], ["bigint", () => ({ ...genesis(), world: BigInt(1) })],
        ["sparse clients", () => { const g = genesis(); delete g.clients[1]; return g; }], ["sparse nested accounts", () => { const g = genesis(); delete g.clients[0].accounts[0]; return g; }], ["named array", () => { const g = genesis(); Object.assign(g.clients, { unexpected: 1 }); return g; }],
        ["getter", () => { const g = genesis(); Object.defineProperty(g, "world", { get() { throw new Error("GETTER_EXECUTED"); }, enumerable: true }); return g; }], ["hidden", () => { const g = genesis(); Object.defineProperty(g, "hidden", { value: 1 }); return g; }], ["symbol", () => Object.assign(genesis(), { [Symbol("secret")]: 1 })],
        ["alias", () => { const g = genesis(); g.clients[1].accounts = g.clients[0].accounts; return g; }], ["unknown", () => ({ ...genesis(), collateral: [] })], ["money leading zero", () => { const g = genesis(); g.bank.initialCapital = "01"; return g; }], ["money number", () => { const g = genesis(); return { ...g, bank: { ...g.bank, initialCapital: 1 } }; }], ["supplier impersonation", () => { const g = genesis(); g.supplier.id = "person"; return g; }]
    ];
    it.each(invalid)("rejects %s before initial persistence", async (_label, make) => { const store = new MemoryStore(); await expect(CreditEngine.open(store, make())).rejects.toThrow(); expect(store.revision).toBe(null); });
    it.each(["sparse commands", "sparse profiles", "undefined command", "unknown command field", "Date fact", "nonfinite ppm", "unknown collateral", "bad frequency"])("rejects nested %s without mutation", async (mode) => {
        const { engine, store } = await opened(), before = engine.snapshot(), revision = store.revision;
        const raw = frame(0, [apply()]);
        if (mode === "sparse commands") {
            raw.commands.length = 2;
        }
        if (mode === "sparse profiles") {
            const f = facts();
            Reflect.deleteProperty(f.profiles, "0");
            raw.facts = f;
        }
        if (mode === "undefined command")
            raw.commands = [undefined];
        if (mode === "unknown command field")
            raw.commands = [{ ...apply(), extra: 0 }];
        if (mode === "Date fact")
            raw.facts = new Date();
        if (mode === "nonfinite ppm") {
            const f = facts();
            f.onrPpm = NaN;
            raw.facts = f;
        }
        if (mode === "unknown collateral")
            raw.commands = [{ ...apply(), terms: { ...apply().terms, collateral: { propertyId: "none" } } }];
        if (mode === "bad frequency")
            raw.commands = [{ ...apply(), terms: { product: "BUSINESS_TERM", termYears: 1, frequencyDays: 30, amortization: "LINEAR" } }];
        await expect(engine.advance(0, [raw])).rejects.toThrow();
        expect(engine.snapshot()).toEqual(before);
        expect(store.revision).toBe(revision);
    });
    it.each(["genesis", "nested", "frames", "commands", "function", "revoked", "target", "fingerprint", "wire", "canonical"])("rejects %s Proxy with zero trap calls", async (mode) => {
        let traps = 0;
        const touched = () => { traps++; throw new Error("PROXY_TRAP_RAN"); };
        const handler = { get: touched, getPrototypeOf: touched, ownKeys: touched, getOwnPropertyDescriptor: touched, has: touched, set: touched, defineProperty: touched, deleteProperty: touched, isExtensible: touched, preventExtensions: touched, setPrototypeOf: touched, apply: touched, construct: touched };
        const proxy = new Proxy(mode === "function" ? () => null : genesis(), handler);
        const { engine } = await opened();
        if (mode === "genesis" || mode === "function")
            await expect(CreditEngine.open(new MemoryStore(), proxy)).rejects.toThrow("CREDIT_PROXY_INPUT");
        if (mode === "nested") {
            const g = genesis();
            await expect(CreditEngine.open(new MemoryStore(), { ...g, clients: [proxy] })).rejects.toThrow("CREDIT_PROXY_INPUT");
        }
        if (mode === "frames")
            await expect(engine.advance(0, proxy)).rejects.toThrow("CREDIT_PROXY_INPUT");
        if (mode === "commands")
            await expect(engine.advance(0, [{ tick: 0, commands: [proxy], facts: facts() }])).rejects.toThrow("CREDIT_PROXY_INPUT");
        if (mode === "revoked") {
            const pair = Proxy.revocable({}, handler);
            pair.revoke();
            await expect(CreditEngine.open(new MemoryStore(), pair.proxy)).rejects.toThrow("CREDIT_PROXY_INPUT");
        }
        if (mode === "target")
            await expect(engine.advance(proxy, [])).rejects.toThrow("CREDIT_INTEGER");
        if (mode === "fingerprint")
            expect(() => creditFingerprint(proxy)).toThrow("CREDIT_PROXY_INPUT");
        if (mode === "wire")
            expect(() => creditWire(proxy)).toThrow("CREDIT_PROXY_INPUT");
        if (mode === "canonical")
            expect(() => canonicalJson(proxy)).toThrow("CREDIT_PROXY_INPUT");
        expect(traps).toBe(0);
        expect(engine.snapshot().tick).toBe(-1);
    });
    it("physical stores commit before publish, reject stale owners and fail closed on held locks", async () => {
        const parent = join(process.cwd(), ".data");
        await mkdir(parent, { recursive: true });
        const dir = await mkdtemp(join(parent, "credit-test-")), path = join(dir, "checkpoint.json"), g = genesis();
        try {
            const engine = await CreditEngine.open(new FileCreditCheckpointStore(path), g), stale = await CreditEngine.open(new FileCreditCheckpointStore(path), g);
            const s = await engine.advance(0, [frame(0, [fund(), apply()])]), bytes = await readFile(path, "utf8");
            await expect(stale.advance(1, [])).rejects.toThrow("CREDIT_STALE_STORE");
            expect(await readFile(path, "utf8")).toBe(bytes);
            expect((await CreditEngine.open(new FileCreditCheckpointStore(path), g)).snapshot()).toEqual(s);
            await writeFile(path + ".lock", "test-owned lock");
            await expect(engine.advance(1, [frame(1, [accept()])])).rejects.toMatchObject({ code: "EEXIST" });
            expect(engine.snapshot()).toEqual(s);
            expect(await readFile(path, "utf8")).toBe(bytes);
            await unlink(path + ".lock");
            const next = await engine.advance(1, [frame(1, [accept()])]);
            expect((await CreditEngine.open(new FileCreditCheckpointStore(path), g)).snapshot()).toEqual(next);
        }
        finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
    it("persistent rejected command retry after reorder/restart does not gain a new decision", async () => {
        const { engine, store } = await opened(), c = { ...fund("refused"), consent: false };
        await engine.advance(0, [frame(0, [c])]);
        const restarted = await CreditEngine.open(store, genesis());
        const s = await restarted.advance(1, [frame(1, [reversed(c)])]);
        expect(s.receipts).toHaveLength(1);
        expect(s.receipts[0].reason).toBe("NO_LENDING_CONSENT");
        expect(s.funds).toHaveLength(1);
    });
    it("a Proxy checkpoint payload is rejected without running any trap", async () => {
        let traps = 0;
        const hit = () => { traps++; throw new Error("PROXY_TRAP_RAN"); };
        const payload = new Proxy({}, { get: hit, getPrototypeOf: hit, ownKeys: hit, getOwnPropertyDescriptor: hit });
        const store = { load: async () => ({ revision: "revision", payload }), save: async () => { throw new Error("UNEXPECTED_SAVE"); } };
        await expect(CreditEngine.open(store, genesis())).rejects.toThrow("CREDIT_PROXY_INPUT");
        expect(traps).toBe(0);
    });
    it("canonical identity is key-order independent but array-order sensitive", () => { expect(creditFingerprint({ a: 1, b: 2 })).toBe(creditFingerprint({ b: 2, a: 1 })); expect(creditFingerprint([1, 2])).not.toBe(creditFingerprint([2, 1])); });
});
