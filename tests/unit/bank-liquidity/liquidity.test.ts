import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { BankLiquidityEngine, FileLiquidityCheckpointStore, balance, liquidityMetrics, liquiditySheet } from "../../../src/server/bank-liquidity/engine";
import { canonicalJson, decodeLiquidityGenesis, liquidityWire, strictJson } from "../../../src/server/bank-liquidity/boundary";
import { halfEven, insured, hashOrder, insurancePremium, scaleLiquidityHazard } from "../../../src/server/bank-liquidity/accounting";
import { liquiditySigmoid } from "../../../src/server/bank-liquidity/confidence-math";
import { TICKS_PER_CHAPTER } from "../../../packages/engine/core/calendar/constants";
import type { LiquidityCheckpointStore } from "../../../src/server/bank-liquidity/model";
import { cash, independentAccounting, liquidityFacts, liquidityFixture, liquidityFrames, ownMove } from "./fixture";
class Memory implements LiquidityCheckpointStore {
    payload: unknown = null;
    revision: string | null = null;
    fail = false;
    async load() {
        return { revision: this.revision, payload: structuredClone(this.payload) };
    }
    async save(payload: unknown, expected: string | null) {
        if (this.fail)
            throw new Error("SAVE_FAILED");
        if (expected !== this.revision)
            throw new Error("STALE");
        this.payload = structuredClone(payload);
        this.revision = String(Number(this.revision ?? 0) + 1);
        return this.revision;
    }
}
const fresh = async (g = liquidityFixture()) => BankLiquidityEngine.open(new Memory(), g, true);
const amount = (e: BankLiquidityEngine, id: string) => balance(e.snapshot().accounts.find(a => a.id === id)!);
const wire = (v: unknown) => canonicalJson(liquidityWire(v));
const forced = (g = liquidityFixture(), target = 719) => liquidityFrames(g, target, f => {
    if (f.tick === 719)
        f.facts!.banks[0].regulatorFailure = true;
});
describe("bank liquidity boundaries and journal identity", () => {
    it("is default-off before any checkpoint access and has no implicit truthy activation", async () => {
        const g = liquidityFixture();
        let touched = 0;
        const store: LiquidityCheckpointStore = { async load() {
                touched++;
                return { revision: null, payload: null };
            }, async save() {
                touched++;
                return "x";
            } };
        await expect(BankLiquidityEngine.open(store, g)).rejects.toThrow("DISABLED");
        await expect(BankLiquidityEngine.open(store, g, "true")).rejects.toThrow("DISABLED");
        expect(touched).toBe(0);
    });
    it("rejects root, nested, function and revoked Proxies before any trap", () => {
        let traps = 0;
        const handler = new Proxy({}, { get() {
                return () => {
                    traps++;
                    throw new Error("trap");
                };
            } });
        const root = new Proxy({}, handler), nested = new Proxy({}, handler), fn = new Proxy(() => 0, handler), rev = Proxy.revocable({}, handler);
        rev.revoke();
        for (const input of [root, fn, rev.proxy, { child: nested }])
            expect(() => strictJson(input)).toThrow("PROXY_INPUT");
        expect(traps).toBe(0);
    });
    it("rejects non-JSON, sparse/named/aliased arrays, getters, symbols, nonfinite and unknown fields", () => {
        const sparse = Array(2), named = Object.assign([1], { bad: 2 }), shared = { x: 1 }, getter = Object.defineProperty({}, "x", { get() {
                throw new Error("GETTER_RAN");
            }, enumerable: true });
        for (const v of [undefined, NaN, Infinity, -0, new Date(), sparse, named, [shared, shared], getter, { [Symbol("x")]: 1 }, Object.create(null), Object.defineProperty({}, "hidden", { value: 1 })])
            expect(() => strictJson(v)).toThrow();
        const g = liquidityFixture();
        expect(() => decodeLiquidityGenesis({ ...g, unknown: 1 })).toThrow("FIELDS");
        g.accounts[0].cash = "01";
        expect(() => decodeLiquidityGenesis(g)).toThrow("MONEY");
    });
    it("validates coverage, collateral, beneficial identities and exact hourly facts", async () => {
        const g = liquidityFixture(), e = await fresh(g);
        await expect(e.advance(30, [{ tick: 0, commands: [], facts: liquidityFacts(g) }])).rejects.toThrow("MISSING_HOUR_30");
        await expect(e.advance(0, [{ tick: 0, facts: { ...liquidityFacts(g), marks: [] }, commands: [] }])).rejects.toThrow("COVERAGE");
        expect(e.snapshot().tick).toBe(-1);
        g.accounts[2].group = "inconsistent";
        expect(() => decodeLiquidityGenesis(g)).toThrow("HOLDER_IDENTITY");
    });
    it("reordered field replay including refused commands is identical after restart", async () => {
        const g = liquidityFixture(), store = new Memory(), e = await BankLiquidityEngine.open(store, g, true), frames = liquidityFrames(g, 0, f => {
            f.commands = [ownMove("m", "alice-a", "alice-b", 100), ownMove("bad", "alice-a", "alice-b", 1, "attacker")];
        });
        await e.advance(0, frames);
        const before = wire(e.snapshot()), bytes = wire(store.payload), reorder = (x: unknown): unknown => Array.isArray(x) ? x.map(reorder) : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).reverse().map(([k, v]) => [k, reorder(v)])) : x, reopened = await BankLiquidityEngine.open(store, reorder(g), true);
        await reopened.advance(0, reorder(frames));
        expect(wire(reopened.snapshot())).toBe(before);
        expect(wire(store.payload)).toBe(bytes);
        expect(reopened.snapshot().receipts.map(r => r.outcome)).toEqual(["SETTLED", "NOT_OWNED"]);
        await expect(reopened.advance(0, liquidityFrames(g, 0, f => {
            f.commands = [ownMove("m", "alice-a", "alice-b", 200)];
        }))).rejects.toThrow("FRAME_CONFLICT");
    });
    it("rolls back failed save, command conflict and stale facade", async () => {
        const g = liquidityFixture(), store = new Memory(), e = await BankLiquidityEngine.open(store, g, true), stale = await BankLiquidityEngine.open(store, g, true);
        const frames = liquidityFrames(g, 0, f => {
            f.commands = [ownMove("m", "alice-a", "alice-b", 100)];
        });
        store.fail = true;
        await expect(e.advance(0, frames)).rejects.toThrow("SAVE_FAILED");
        expect(amount(e, "alice-a")).toBe(BigInt(cash(500000)));
        store.fail = false;
        await e.advance(0, frames);
        await expect(stale.advance(0, frames)).rejects.toThrow("STALE");
        await expect(e.advance(1, [{ tick: 1, facts: null, commands: [ownMove("m", "alice-a", "alice-b", 101)] }])).rejects.toThrow("COMMAND_CONFLICT");
        expect(e.snapshot().tick).toBe(0);
    });
    it("physical CAS restart detects digest corruption and leaves failed writer unchanged", async () => {
        const dir = await mkdtemp(join(process.cwd(), ".liquidity-test-"));
        try {
            const path = join(dir, "world.json"), g = liquidityFixture(), store = new FileLiquidityCheckpointStore(path), e = await BankLiquidityEngine.open(store, g, true), stale = await BankLiquidityEngine.open(store, g, true);
            await e.advance(0, liquidityFrames(g, 0));
            const reopened = await BankLiquidityEngine.open(store, g, true);
            expect(wire(reopened.snapshot())).toBe(wire(e.snapshot()));
            await expect(stale.advance(0, liquidityFrames(g, 0))).rejects.toThrow("STALE");
            const data = JSON.parse(await readFile(path, "utf8"));
            data.digest = "tampered";
            await writeFile(path, JSON.stringify(data));
            await expect(BankLiquidityEngine.open(store, g, true)).rejects.toThrow("DIGEST");
        }
        finally {
            await rm(dir, { recursive: true });
        }
    });
});
describe("real reserves, confidence and finite run response", () => {
    it("moves exactly30% of financial NPC flight into funded MMF custody", async () => {
        const g = liquidityFixture();
        for (const a of g.accounts.filter(a => a.owner === "company")) {
            a.control = "NPC";
            a.sector = "FINANCIAL";
        }
        const e = await fresh(g);
        await e.advance(0, liquidityFrames(g, 0));
        expect(e.snapshot().mmfCash).toBe(BigInt(cash(36)));
        expect(amount(e, "corp-a")).toBe(BigInt(cash(299880)));
        independentAccounting(e.snapshot());
    });
    it("needs24 full calm hours before ending a run", async () => {
        const g = liquidityFixture();
        g.banks[0].reserves = cash(200000);
        const e = await fresh(g), frames = liquidityFrames(g, 1440, f => {
            if (f.tick === 0)
                f.commands = [ownMove("run", "alice-a", "alice-cash", 150000)];
        });
        await e.advance(1439, frames.filter(f => f.tick <= 1439));
        expect(e.snapshot().banks[0].run).toBe(true);
        expect(e.snapshot().banks[0].calmSince).toBe(720);
        await e.advance(1440, frames.filter(f => f.tick === 1440));
        expect(e.snapshot().banks[0].run).toBe(false);
        expect(e.snapshot().history.filter(e => e.kind === "bank.run.ended")).toHaveLength(1);
    });
    it("uses the same start-of-tick contagion regardless of input bank order", async () => {
        const g = liquidityFixture();
        g.banks[0].reserves = cash(200000);
        const reversed = structuredClone(g);
        reversed.banks.reverse();
        const a = await fresh(g), b = await fresh(reversed), frames = liquidityFrames(g, 30, f => {
            if (f.tick === 0)
                f.commands = [ownMove("run", "alice-a", "alice-cash", 150000)];
        });
        await a.advance(30, frames);
        await b.advance(30, frames);
        expect(a.snapshot().banks.find(b => b.id === "b")!.confidence).toBe(b.snapshot().banks.find(b => b.id === "b")!.confidence);
    });
    it("moves real reserves, queues unfunded demand and rejects double-spending", async () => {
        const g = liquidityFixture(), e = await fresh(g);
        await e.advance(0, liquidityFrames(g, 0, f => {
            f.commands = [ownMove("one", "alice-a", "alice-b", 100000), ownMove("queue", "alice-a", "alice-b", 350000), ownMove("double", "alice-a", "alice-b", 100000)];
        }));
        expect(e.snapshot().banks[0].reserves).toBe(BigInt(0));
        expect(e.snapshot().queue).toHaveLength(1);
        expect(e.snapshot().receipts.map(r => r.outcome)).toEqual(["SETTLED", "QUEUED", "INSUFFICIENT_BALANCE"]);
        await e.advance(1, [{ tick: 1, facts: null, commands: [{ id: "inject", actor: "owner-a", kind: "CAPITAL", bankId: "a", accountId: "oa", amount: cash(400000) }] }]);
        expect(e.snapshot().queue).toHaveLength(0);
        await e.advance(2, []);
        expect(e.snapshot().queue).toHaveLength(0);
        expect(amount(e, "alice-b")).toBe(BigInt(cash(500000)));
        independentAccounting(e.snapshot());
    });
    it("updates only at t mod30 and uses fast fear/slow trust, with band-only public output", async () => {
        const g = liquidityFixture(), e = await fresh(g), frames = liquidityFrames(g, 30, f => {
            f.facts!.banks[0].publishedCet1Ppm = 0;
            f.facts!.banks[0].cdsBps = 900;
            f.facts!.banks[0].rumors = [{ source: "a", intensityPpm: 1000000 }, { source: "b", intensityPpm: 1000000 }];
        });
        await e.advance(0, frames.slice(0, 1));
        const expected = .9 + .3 * (1 / (1 + Math.exp(3.7)) - .9);
        expect(e.snapshot().banks[0].confidence).toBeCloseTo(expected, 14);
        const first = e.snapshot().banks[0].confidence;
        await e.advance(29, []);
        expect(e.snapshot().banks[0].confidence).toBe(first);
        await e.advance(30, frames.slice(1));
        expect(e.snapshot().banks[0].confidence).toBeLessThan(first);
        expect(JSON.stringify(e.publicView())).not.toMatch(/confidence":|alice|outflow/);
        expect(e.publicView()[0].confidenceBand).toBe("Strained");
    });
    it("preserves fund lineage through withdraw-return churn within30 ticks", async () => {
        const g = liquidityFixture();
        g.banks[0].reserves = cash(1000000);
        const e = await fresh(g);
        await e.advance(0, liquidityFrames(g, 0, f => {
            f.commands = [ownMove("out", "alice-a", "alice-cash", 100000), ownMove("back", "alice-cash", "alice-a", 110000), ownMove("again", "alice-a", "alice-cash", 100000)];
        }));
        expect(e.snapshot().banks[0].outflows.reduce((n, v) => n + v.amount, BigInt(0))).toBe(BigInt(cash(200000))); // FIFO spends different original funds, not the just-returned lot.
        const g2 = liquidityFixture();
        g2.accounts[2].cash = cash(100000);
        g2.accounts[4].cash = "0";
        const f = await fresh(g2);
        await f.advance(0, liquidityFrames(g2, 0, x => {
            x.commands = [ownMove("a", "alice-a", "alice-cash", 100000), ownMove("b", "alice-cash", "alice-a", 100000), ownMove("c", "alice-a", "alice-cash", 100000)];
        }));
        expect(f.snapshot().banks[0].outflows.reduce((n, v) => n + v.amount, BigInt(0))).toBe(BigInt(cash(100000)));
        expect(f.snapshot().history.filter(v => v.kind === "bank.run.started")).toHaveLength(1);
        independentAccounting(f.snapshot());
    });
    it("does not auto-withdraw player deposits, but NPC stress spends finite real reserves", async () => {
        const g = liquidityFixture();
        g.accounts[5].control = "NPC";
        g.accounts[6].control = "NPC";
        const e = await fresh(g);
        await e.advance(180, liquidityFrames(g, 180, f => {
            const b = f.facts!.banks[0];
            b.publishedCet1Ppm = -100000;
            b.equityReturnPpm = -300000;
            b.cdsBps = 900;
            b.stigma = true;
            b.rumors = [{ source: "news", intensityPpm: 1000000 }];
        }));
        expect(amount(e, "bob-a")).toBeLessThan(BigInt(cash(300000)));
        expect(amount(e, "alice-a")).toBe(BigInt(cash(500000)));
        expect(e.snapshot().banks[0].reserves).toBeLessThan(BigInt(cash(100000)));
        independentAccounting(e.snapshot());
    });
    it("cannot fill absent HQLA bids and caps a real sale at20% ADV per stamped tick", async () => {
        const g = liquidityFixture();
        g.assets[0].kind = "L1";
        g.assets[0].rwPpm = 0;
        g.assets[0].adv = cash(1000);
        const e = await fresh(g);
        await e.advance(0, liquidityFrames(g, 0, f => {
            f.commands = [ownMove("queue", "alice-a", "alice-b", 400000)];
            f.facts!.bids = [{ id: "book", buyer: { kind: "ACCOUNT", id: "dealer" }, assetId: "loans", quantity: cash(10000), pricePpm: 900000 }];
        }));
        expect(e.snapshot().banks[0].reserves).toBe(BigInt(cash(100180)));
        expect(e.snapshot().queue).toHaveLength(1);
        await e.advance(29, []);
        expect(e.snapshot().banks[0].reserves).toBe(BigInt(cash(100180)));
        expect(amount(e, "dealer")).toBe(BigInt(cash(2999820)));
        independentAccounting(e.snapshot());
    });
    it("sells loan pools only to willing funded NPC banks at85% of book", async () => {
        const g = liquidityFixture(), e = await fresh(g);
        await e.advance(0, liquidityFrames(g, 0, f => {
            f.commands = [ownMove("q", "alice-a", "alice-b", 400000)];
            f.facts!.bids = [{ id: "loanbid", buyer: { kind: "BANK", id: "b" }, assetId: "loans", quantity: cash(400000), pricePpm: 850000 }];
        }));
        expect(e.snapshot().queue).toHaveLength(0);
        expect(e.snapshot().assets[0].holdings.find(h => h.bankId === "b")!.quantity).toBe(BigInt(cash(400000)));
        expect(amount(e, "alice-b")).toBe(BigInt(cash(450000)));
        independentAccounting(e.snapshot());
    });
    it("daily premiums and reserve penalties are funded transfers/sinks, not hourly", async () => {
        const g = liquidityFixture(), e = await fresh(g);
        const frames = liquidityFrames(g, 719, f => {
            f.facts!.banks[0].rrPpm = 1000000;
        });
        await e.advance(718, frames.filter(f => f.tick < 719));
        expect(e.snapshot().history.some(e => e.kind === "insurance.premium")).toBe(false);
        await e.advance(719, frames.filter(f => f.tick === 719));
        const premium = halfEven(BigInt(cash(750000)) * BigInt(500), BigInt(364000000)), shortfall = BigInt(cash(1100000)) - (BigInt(cash(100000)) - premium), penalty = halfEven(shortfall * BigInt(70000), BigInt(364000000));
        expect(e.snapshot().banks[0].reserves).toBe(BigInt(cash(100000)) - premium - penalty);
        expect(e.snapshot().sinks).toBe(penalty);
        expect(e.snapshot().history.find(e => e.bankId === "a" && e.kind === "insurance.premium")!.amount).toBe(premium);
        independentAccounting(e.snapshot());
    });
});
describe("capital/liquidity and resolution without a rescue", () => {
    it("rounds insurance and NPC hazards only at the final micro-money boundary", () => {
        const covered = BigInt(cash(750000)), rwa = BigInt(cash(1500000)), cet1 = BigInt(cash(100001));
        const shortfall = BigInt(70000) * rwa - cet1 * BigInt(1000000), denominator = BigInt(1000000) * rwa, numerator = BigInt(800) * (denominator + BigInt(100) * shortfall);
        expect(insurancePremium(covered, cet1, rwa, 70000, 800)).toBe(halfEven(covered * numerator, denominator * BigInt(364000000)));
        expect(scaleLiquidityHazard(BigInt(cash(1000000)), .0002)).toBe(BigInt(cash(200)));
    });
    it("does not keep a failed bank in RUN forever after its seven-day contagion window", async () => {
        const g = liquidityFixture();
        g.banks[0].reserves = cash(200000);
        const e = await fresh(g);
        await e.advance(719, liquidityFrames(g, 719, f => {
            if (f.tick === 0)
                f.commands = [ownMove("stress", "alice-a", "alice-cash", 150000)];
            if (f.tick === 719)
                f.facts!.banks[0].regulatorFailure = true;
        }));
        expect(e.snapshot().history.some(e => e.kind === "bank.run.started")).toBe(true);
        expect(e.snapshot().banks[0].run).toBe(false);
        expect(e.snapshot().banks[0].failedAt).toBe(719);
    });
    it("lets a depositor spend their newly insured SIGHT account without a hidden ID gate", async () => {
        const g = liquidityFixture(), e = await fresh(g);
        await e.advance(1439, liquidityFrames(g, 1439, f => {
            if (f.tick === 719)
                f.facts!.banks[0].regulatorFailure = true;
        }));
        const target = e.snapshot().accounts.find(a => a.owner === "bob" && a.bankId === "b")!;
        expect(target.id.startsWith("@receive/")).toBe(true);
        await e.advance(1440, [{ tick: 1440, facts: liquidityFacts(g), commands: [ownMove("spend-insurance", target.id, "bob-cash", 1, "bob")] }]);
        expect(e.snapshot().receipts.at(-1)!.outcome).toBe("SETTLED");
        expect(amount(e, "bob-cash")).toBe(BigInt(cash(1)));
        independentAccounting(e.snapshot());
    });
    it("pays a bank's own deposit-holding note creditor in actual settlement cash", async () => {
        const g = liquidityFixture();
        g.notes = [{ id: "held-note", bankId: "a", creditor: "alice-a", rank: "SENIOR", instrument: "BOND", amount: cash(100000), longTerm: true }];
        const e = await fresh(g);
        await e.advance(1439, liquidityFrames(g, 1439, f => {
            if (f.tick === 719)
                f.facts!.banks[0].regulatorFailure = true;
            if (f.tick === 750)
                f.facts!.bids = [{ id: "buyer", buyer: { kind: "ACCOUNT", id: "dealer" }, assetId: "loans", quantity: cash(1500000), pricePpm: 1000000 }];
        }));
        expect(e.snapshot().banks[0].status).toBe("CLOSED");
        expect(amount(e, "alice-cash") + amount(e, "alice-b")).toBe(BigInt(cash(660000)));
        independentAccounting(e.snapshot());
    });
    it("caps Level2A at40% even when no Level2B assets exist", async () => {
        const g = liquidityFixture();
        g.assets[0].kind = "L2A";
        const e = await fresh(g);
        await e.advance(0, liquidityFrames(g, 0));
        const s = e.snapshot();
        expect(liquidityMetrics(s, s.banks[0]).hqla).toBe(BigInt(cash(100000)) * BigInt(5) / BigInt(3));
    });
    it("does not use unfunded DGF support or bidder injections from a rejected acquisition", async () => {
        const g = liquidityFixture();
        g.dgf[0].cash = "0";
        const e = await fresh(g), frames = forced(g, 749);
        frames.find(f => f.tick === 720)!.commands = [{ id: "bid", actor: "owner-b", kind: "BID", bankId: "a", buyerBankId: "b", price: "-" + cash(600000), capitalInjection: cash(10000) }];
        await e.advance(749, frames);
        expect(e.snapshot().banks[0].resolution!.tool).toBe("LIQUIDATION");
        expect(amount(e, "ob")).toBe(BigInt(cash(1000000)));
        expect(e.snapshot().dgf[0].cash).toBeGreaterThanOrEqual(BigInt(0));
        independentAccounting(e.snapshot());
    });
    it("excludes interbank claims from bail-in eligibility", async () => {
        const g = liquidityFixture();
        g.accounts = g.accounts.filter(a => a.owner !== "company");
        g.assets[0].markPpm = 450000;
        g.notes = [{ id: "interbank", bankId: "a", creditor: "creditor", rank: "SENIOR", instrument: "INTERBANK", amount: cash(400000), longTerm: false }];
        const e = await fresh(g);
        await e.advance(749, liquidityFrames(g, 749));
        expect(e.snapshot().banks[0].resolution!.tool).toBe("LIQUIDATION");
        expect(e.snapshot().notes.find(n => n.id === "interbank")!.amount).toBe(BigInt(cash(400000)));
    });
    it("computes joint HQLA caps, NSFR and real equity deductions", async () => {
        const g = liquidityFixture();
        g.assets[0].kind = "L2A";
        g.assets.push({ ...structuredClone(g.assets[0]), id: "equities", kind: "L2B" });
        const e = await fresh(g);
        await e.advance(0, liquidityFrames(g, 0, f => {
            f.facts!.banks[0].intangibles = cash(1000);
        }));
        const s = e.snapshot(), m = liquidityMetrics(s, s.banks[0]);
        expect(m.hqla).toBe(BigInt(cash(100000)) * BigInt(20) / BigInt(9));
        expect(m.cet1).toBe(liquiditySheet(s, s.banks[0]).equity - BigInt(cash(1000)));
        expect(m.asf).toBeGreaterThan(BigInt(0));
    });
    it("freezes only uninsured claims, records permanent failure and does not seize owner cash", async () => {
        const g = liquidityFixture(), e = await fresh(g);
        await e.advance(719, forced(g));
        expect(e.snapshot().banks[0].status).toBe("IN_RESOLUTION");
        expect(e.snapshot().banks[0].charterBanUntil).toBe(719 + TICKS_PER_CHAPTER);
        await e.advance(720, [{ tick: 720, facts: liquidityFacts(g), commands: [ownMove("frozen", "alice-a", "alice-cash", 300000), ownMove("insured", "alice-a", "alice-cash", 100)] }]);
        expect(e.snapshot().receipts.slice(-2).map(r => r.outcome)).toEqual(["UNINSURED_FROZEN", "SETTLED"]);
        expect(amount(e, "oa")).toBe(BigInt(cash(1000000)));
        expect(e.snapshot().history.some(e => e.kind === "ccp.member.default.handoff")).toBe(true);
    });
    it("always waits30 auction ticks, then honors funded whole-bank P&A and least-cost ties", async () => {
        const g = liquidityFixture(), e = await fresh(g);
        const frames = forced(g, 749);
        frames.find(f => f.tick === 720)!.commands = [{ id: "bid", actor: "owner-b", kind: "BID", bankId: "a", buyerBankId: "b", price: "0", capitalInjection: "0" }];
        await e.advance(748, frames);
        expect(e.snapshot().banks[0].resolution!.tool).toBe("AUCTION");
        await e.advance(749, []);
        expect(e.snapshot().banks[0].status).toBe("SOLD");
        expect(e.snapshot().accounts.find(a => a.id === "alice-a")!.bankId).toBe("b");
        expect(e.snapshot().banks[0].reserves).toBe(BigInt(0));
        independentAccounting(e.snapshot());
    });
    it("bails in loss-bearing classes to10% CET1 without minting cash or touching insurance", async () => {
        const g = liquidityFixture();
        g.assets[0].markPpm = 600000;
        g.notes = [{ id: "at1", bankId: "a", creditor: "creditor", rank: "AT1", instrument: "BOND", amount: cash(30000), longTerm: true }, { id: "sub", bankId: "a", creditor: "creditor", rank: "SUB", instrument: "BOND", amount: cash(30000), longTerm: true }, { id: "senior", bankId: "a", creditor: "creditor", rank: "SENIOR", instrument: "BOND", amount: cash(30000), longTerm: true }];
        const e = await fresh(g);
        await e.advance(749, liquidityFrames(g, 749));
        const s = e.snapshot(), b = s.banks[0];
        expect(b.resolution!.tool).toBe("BAIL_IN");
        expect(b.resolution!.equityRights.map(x => x.creditor).slice(0, 3)).toEqual(["creditor", "creditor", "creditor"]);
        expect(liquidityMetrics(s, b).cet1).toBe(halfEven(liquidityMetrics(s, b).rwa, BigInt(10)));
        expect(amount(e, "bob-a")).toBeGreaterThanOrEqual(BigInt(cash(250000)));
        expect(s.banks[0].reserves).toBeGreaterThan(BigInt(0));
        independentAccounting(s);
    });
    it("rejects capital-only bail-in as a liquidity cure and retains a finite pending estate", async () => {
        const g = liquidityFixture(), e = await fresh(g);
        await e.advance(719, liquidityFrames(g, 719, f => {
            if (f.tick === 0)
                f.commands = [ownMove("q", "alice-a", "alice-b", 400000)];
        }));
        expect(e.snapshot().banks[0].resolution!.trigger).toBe("LIQUIDITY");
        await e.advance(719 + 14 * 720, liquidityFrames(g, 719 + 14 * 720).filter(f => f.tick > 719));
        const b = e.snapshot().banks[0];
        expect(b.resolution!.tool).toBe("LIQUIDATION");
        expect(b.resolution!.estatePending).toBe(true);
        expect(b.resolution!.finalized).toBe(false);
        expect(e.snapshot().assets[0].holdings[0].quantity).toBe(BigInt(cash(1500000)));
        independentAccounting(e.snapshot());
    });
    it("pays finite DGF into the largest ACTIVE NPC bank at720 and preserves subrogation/shortfall", async () => {
        const g = liquidityFixture();
        g.dgf[0].cash = cash(100);
        const e = await fresh(g);
        await e.advance(1438, forced(g, 1438));
        expect(e.snapshot().history.some(e => e.kind === "insurance.paid")).toBe(false);
        await e.advance(1439, [{ tick: 1439, facts: liquidityFacts(g), commands: [] }]);
        const s = e.snapshot(), b = s.banks[0];
        expect(s.dgf[0].cash).toBe(BigInt(0));
        expect(b.resolution!.insuranceShortfall).toBeGreaterThan(BigInt(cash(749000)));
        expect(s.notes.find(n => n.rank === "INSURED")!.amount).toBeGreaterThan(BigInt(cash(100)));
        expect(s.history.some(e => e.kind === "insurance.unfunded")).toBe(true);
        independentAccounting(s);
    });
    it("liquidation pays the actual secured/cost/insured/natural/corporate/senior/sub/AT1 hierarchy", async () => {
        const g = liquidityFixture();
        g.assets[0].kind = "L1";
        g.assets[0].rwPpm = 0;
        g.assets[0].collateralFor = "secured";
        g.banks[0].reserves = cash(50000);
        g.dgf[0].cash = "0";
        g.notes = [{ id: "secured", bankId: "a", creditor: "creditor", rank: "SECURED", instrument: "OTHER", amount: cash(200000), longTerm: false }, { id: "cost", bankId: "a", creditor: "creditor", rank: "COST", instrument: "OTHER", amount: cash(10000), longTerm: false }, { id: "senior", bankId: "a", creditor: "creditor", rank: "SENIOR", instrument: "BOND", amount: cash(100000), longTerm: true }, { id: "sub", bankId: "a", creditor: "creditor", rank: "SUB", instrument: "BOND", amount: cash(100000), longTerm: true }, { id: "at1", bankId: "a", creditor: "creditor", rank: "AT1", instrument: "BOND", amount: cash(100000), longTerm: true }];
        const frames = forced(g, 1439);
        frames.find(f => f.tick === 0)!.commands = [ownMove("unfunded", "alice-a", "alice-b", 400000)];
        frames.find(f => f.tick === 750)!.facts!.bids = [{ id: "liquidator", buyer: { kind: "ACCOUNT", id: "dealer" }, assetId: "loans", quantity: cash(1500000), pricePpm: 970000 }];
        const e = await fresh(g);
        await e.advance(1439, frames);
        const s = e.snapshot(), b = s.banks[0], ranks = s.history.filter(e => e.bankId === "a" && e.kind.startsWith("estate.rank.")).map(e => Number(e.kind.split(".").at(-1)));
        expect(b.status).toBe("CLOSED");
        expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
        expect(ranks).toContain(7);
        expect(ranks).not.toContain(8);
        expect(b.resolution!.creditorLosses.some(l => l.id === "at1")).toBe(true);
        expect(amount(e, "oa")).toBe(BigInt(cash(1000000)));
        independentAccounting(s);
    });
    it("beneficial-owner cap aggregates accounts with largest-balance then hash allocation", async () => {
        const g = liquidityFixture();
        g.accounts.push({ ...g.accounts[2], id: "alice-second", cash: cash(200000) });
        const e = await fresh(g);
        await e.advance(0, liquidityFrames(g, 0));
        const s = e.snapshot(), coverage = insured(s, s.banks[0]);
        expect(coverage.get("alice-a")).toBe(BigInt(cash(250000)));
        expect(coverage.get("alice-second")).toBe(BigInt(0));
        expect([...coverage.values()].reduce((a, b) => a + b, BigInt(0))).toBe(BigInt(cash(750000)));
        expect(hashOrder("a", "b")).toBe(-hashOrder("b", "a"));
    });
    it("half-even rounding and bounded deterministic sigmoid have exact reference points", () => {
        expect(halfEven(BigInt(5), BigInt(2))).toBe(BigInt(2));
        expect(halfEven(BigInt(7), BigInt(2))).toBe(BigInt(4));
        for (const x of [-16, -8, -3.7, 0, 4.4, 8])
            expect(liquiditySigmoid(x)).toBeCloseTo(1 / (1 + Math.exp(-x)), 15);
        expect(() => liquiditySigmoid(9)).toThrow("DOMAIN");
    });
    it("jump, event/hour stepping and physical restarts have identical full state and canonical checkpoint bytes", async () => {
        const g = liquidityFixture(), frames = forced(g, 1499), jump = new Memory(), step = new Memory(), a = await BankLiquidityEngine.open(jump, g, true);
        await a.advance(1499, frames);
        let b = await BankLiquidityEngine.open(step, g, true);
        for (const f of frames) {
            await b.advance(f.tick, [f]);
            if (f.tick === 719 || f.tick === 750)
                b = await BankLiquidityEngine.open(step, g, true);
        }
        await b.advance(1499, []);
        expect(wire(a.snapshot())).toBe(wire(b.snapshot()));
        expect(wire(jump.payload)).toBe(wire(step.payload));
        independentAccounting(a.snapshot());
    });
});
