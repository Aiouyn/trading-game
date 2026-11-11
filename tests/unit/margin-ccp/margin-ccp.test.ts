import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { MarginCcpEngine, FileMarginCcpCheckpointStore, marginCcpCash, walletBucket, marginBucket, dfBucket, marginCcpAssessmentCapacity } from "../../../src/server/margin-ccp/engine";
import { canonicalJson, marginCcpWire, strictJson, decodeMarginCcpGenesis } from "../../../src/server/margin-ccp/boundary";
import { planMarginCcpLiquidation } from "../../../src/server/margin-ccp/liquidation";
import type { MarginCcpCheckpointStore, MarginCcpRisk } from "../../../src/server/margin-ccp/model";
import { marginFixture, marginFrames, defaultFrames, defaultReport, money, independentCcpAccounting } from "./fixture";
class Memory implements MarginCcpCheckpointStore {
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
const fresh = (g = marginFixture()) => MarginCcpEngine.open(new Memory(), g, true), wire = (v: unknown) => canonicalJson(marginCcpWire(v));
const position = () => ({ assetId: "future", quantity: BigInt(100), fairValue: BigInt(money(100)), marginalIm: BigInt(money(100)), expectedCost: BigInt(money(1)), sigmaPpm: 100, expectedTickVolume: BigInt(100), marketOpen: true, opening: false, openingVolume: BigInt(50) });
const risk = (): MarginCcpRisk => ({ memberId: "d", service: "LD", im: BigInt(money(100)), equityAdjustment: BigInt(0), held: false, positions: [position()] });
describe("margin-CCP strict default-off boundary", () => {
    it("is disabled before store access, including truthy strings", async () => {
        let touched = 0;
        const store: MarginCcpCheckpointStore = { async load() {
                touched++;
                return { revision: null, payload: null };
            }, async save() {
                touched++;
                return "x";
            } };
        await expect(MarginCcpEngine.open(store, marginFixture())).rejects.toThrow("DISABLED");
        await expect(MarginCcpEngine.open(store, marginFixture(), "true")).rejects.toThrow("DISABLED");
        expect(touched).toBe(0);
    });
    it("rejects root/nested/revoked/function Proxies with zero traps", () => {
        let traps = 0;
        const handler = new Proxy({}, { get() {
                return () => {
                    traps++;
                    throw new Error("TRAP");
                };
            } }), a = new Proxy({}, handler), f = new Proxy(() => 1, handler), r = Proxy.revocable({}, handler);
        r.revoke();
        for (const raw of [a, { nested: a }, f, r.proxy])
            expect(() => strictJson(raw)).toThrow("PROXY");
        expect(traps).toBe(0);
    });
    it("rejects sparse/named/aliased arrays, classes, unknown/accessor/hidden/symbol keys and nonfinite values", () => {
        const a = { x: 1 }, getter = Object.defineProperty({}, "x", { get() {
                throw new Error("GETTER");
            }, enumerable: true });
        for (const raw of [Array(2), Object.assign([1], { named: 2 }), [a, a], new Date(), NaN, Infinity, -0, undefined, getter, { [Symbol("x")]: 1 }, Object.defineProperty({}, "x", { value: 1 })])
            expect(() => strictJson(raw)).toThrow();
        expect(() => decodeMarginCcpGenesis({ ...marginFixture(), extra: 1 })).toThrow("FIELDS");
    });
    it("requires actual per-service funded SITG and canonical money", () => {
        const g = marginFixture();
        g.services[0].sitg1 = "0";
        expect(() => decodeMarginCcpGenesis(g)).toThrow("PREFUNDING");
        g.services[0].sitg1 = "01";
        expect(() => decodeMarginCcpGenesis(g)).toThrow("MONEY");
    });
    it("requires complete per-tick risk observations and all references", async () => {
        const g = marginFixture(), e = await fresh(g);
        await expect(e.advance(1, marginFrames(g, 0))).rejects.toThrow("EVERY_TICK");
        const frames = marginFrames(g, 0);
        frames[0].facts.risks.pop();
        await expect(e.advance(0, frames)).rejects.toThrow("COVERAGE");
        expect(e.snapshot().tick).toBe(-1);
    });
    it("replays reordered fields and refused IDs identically across restart", async () => {
        const g = marginFixture(), store = new Memory(), e = await MarginCcpEngine.open(store, g, true), frames = marginFrames(g, 0, f => f.commands = [{ id: "bad", actor: "attacker", kind: "POST_MARGIN", memberId: "d", service: "LD", amount: money(1) }]);
        await e.advance(0, frames);
        const reorder = (v: unknown): unknown => Array.isArray(v) ? v.map(reorder) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).reverse().map(([k, v]) => [k, reorder(v)])) : v, bytes = wire(store.payload), reopened = await MarginCcpEngine.open(store, reorder(g), true);
        await reopened.advance(0, reorder(frames));
        expect(wire(store.payload)).toBe(bytes);
        expect(wire(reopened.snapshot())).toBe(wire(e.snapshot()));
        expect(e.snapshot().receipts[0].outcome).toBe("NOT_OWNED");
    });
    it("does not publish failed saves or stale-CAS writes", async () => {
        const g = marginFixture(), store = new Memory(), e = await MarginCcpEngine.open(store, g, true), stale = await MarginCcpEngine.open(store, g, true);
        store.fail = true;
        await expect(e.advance(0, marginFrames(g, 0))).rejects.toThrow("SAVE_FAILED");
        expect(e.snapshot().tick).toBe(-1);
        store.fail = false;
        await e.advance(0, marginFrames(g, 0));
        await expect(stale.advance(0, marginFrames(g, 0))).rejects.toThrow("STALE");
    });
    it("physical restart detects altered checkpoint digest", async () => {
        const dir = await mkdtemp(join(process.cwd(), ".ccp-test-"));
        try {
            const g = marginFixture(), p = join(dir, "world.json"), store = new FileMarginCcpCheckpointStore(p), e = await MarginCcpEngine.open(store, g, true);
            await e.advance(0, marginFrames(g, 0));
            expect(wire((await MarginCcpEngine.open(store, g, true)).snapshot())).toBe(wire(e.snapshot()));
            const data = JSON.parse(await readFile(p, "utf8"));
            data.digest = "bad";
            await writeFile(p, JSON.stringify(data));
            await expect(MarginCcpEngine.open(store, g, true)).rejects.toThrow("DIGEST");
        }
        finally {
            await rm(dir, { recursive: true });
        }
    });
});
describe("cash margin timing and liquidation plans", () => {
    it("widens only unfilled attempts and resets the band after a producer-certified reduction", async () => {
        const g = marginFixture(), e = await fresh(g), frames = marginFrames(g, 3, f => { const r = f.facts.risks[0]; r.im = money(200); r.positions = [{ assetId: "f", quantity: f.tick === 3 ? "80" : "100", fairValue: money(100), marginalIm: money(200), expectedCost: money(1), sigmaPpm: 100, expectedTickVolume: "100", marketOpen: true, opening: false, openingVolume: "50" }]; });
        await e.advance(0, frames.slice(0, 1));
        expect(e.snapshot().orders).toHaveLength(0);
        await e.advance(1, frames.slice(1, 2));
        expect(e.snapshot().orders[0].bandPpm).toBe(5000);
        await e.advance(2, frames.slice(2, 3));
        expect(e.snapshot().orders[0].bandPpm).toBe(15000);
        await e.advance(3, frames.slice(3));
        expect(e.snapshot().orders[0].bandPpm).toBe(5000);
    });
    it("a P13 cash post affects only the next P7 and never mints", async () => {
        const g = marginFixture(), e = await fresh(g), frames = marginFrames(g, 1, f => {
            f.facts.risks[0].im = money(140);
            if (f.tick === 0)
                f.commands = [{ id: "post", actor: "owner-d", kind: "POST_MARGIN", memberId: "d", service: "LD", amount: money(40) }];
        });
        await e.advance(0, frames.slice(0, 1));
        expect(e.snapshot().margins[0].status).toBe("CALL");
        expect(e.snapshot().margins[0].call!.due).toBe(30);
        await e.advance(1, frames.slice(1));
        expect(e.snapshot().margins[0].status).toBe("OK");
        expect(marginCcpCash(e.snapshot(), walletBucket("d"))).toBe(BigInt(money(9960)));
        independentCcpAccounting(e.snapshot());
    });
    it("never extends calls and a due-tick P13 post is too late to avoid default", async () => {
        const g = marginFixture(), e = await fresh(g), frames = marginFrames(g, 30, f => {
            f.facts.risks[0].im = money(140);
            if (f.tick === 30)
                f.commands = [{ id: "late", actor: "owner-d", kind: "POST_MARGIN", memberId: "d", service: "LD", amount: money(40) }];
        });
        await e.advance(29, frames.slice(0, 30));
        expect(e.snapshot().margins[0].call!.due).toBe(30);
        await e.advance(30, frames.slice(30));
        expect(e.snapshot().defaults[0].reason).toBe("UNMET_MARGIN_CALL");
    });
    it("below60% declares default immediately; exactly60% has30 ticks", async () => {
        const g = marginFixture(), a = await fresh(g), b = await fresh(g);
        await a.advance(0, marginFrames(g, 0, f => f.facts.risks[0].im = money(200)));
        expect(a.snapshot().defaults[0].declared).toBe(0);
        const g2 = marginFixture();
        g2.members[0].accounts[0].marginCash = money(120);
        const exact = await fresh(g2);
        await exact.advance(0, marginFrames(g2, 0, f => f.facts.risks[0].im = money(200)));
        expect(exact.snapshot().margins[0].status).toBe("CALL");
        expect(exact.snapshot().margins[0].call!.due).toBe(30);
        await b.advance(0, marginFrames(g, 0, f => f.facts.risks[0].im = money(100)));
        expect(b.snapshot().margins[0].status).toBe("OK");
    });
    it("does not submit a liquidation until N+1, even for Held", () => {
        const r = risk();
        r.held = true;
        expect(planMarginCcpLiquidation(r, BigInt(0), 5, 5)).toEqual([]);
        const orders = planMarginCcpLiquidation(r, BigInt(0), 5, 6);
        expect(orders[0].eligibleAt).toBe(6);
        expect(orders[0].quantity).toBe(BigInt(20));
        expect(orders[0].bandPpm).toBe(5000);
        expect(orders[0].limitPrice).toBe(BigInt(99500000));
    });
    it("queues closed markets and respects20% opening volume and widening cap", () => {
        const r = risk();
        r.positions[0].marketOpen = false;
        expect(planMarginCcpLiquidation(r, BigInt(0), 0, 1)[0].quantity).toBe(BigInt(0));
        r.positions[0].marketOpen = true;
        r.positions[0].opening = true;
        const p = planMarginCcpLiquidation(r, BigInt(0), 0, 100)[0];
        expect(p.quantity).toBe(BigInt(10));
        expect(p.bandPpm).toBe(100000);
        expect(p.openingOnly).toBe(true);
    });
    it("closes largest IM/cost first and stops at the10% margin buffer", () => {
        const r = risk();
        r.positions[0].expectedTickVolume = BigInt(1000);
        r.positions.push({ ...position(), assetId: "low", marginalIm: BigInt(money(1)) });
        const orders = planMarginCcpLiquidation(r, BigInt(money(99)), 0, 1);
        expect(orders.map(o => o.assetId)).toEqual(["future"]);
        expect(orders[0].quantity).toBe(BigInt(10));
    });
});
describe("real CCP resources and recovery waterfall", () => {
    it("seals liquidation instructions when a completed close-out supersedes stale readonly positions", async () => {
        const g = marginFixture(), e = await fresh(g), frames = defaultFrames(g, 481, 600);
        for (const f of frames) {
            const r = f.facts.risks[0];
            r.im = money(200);
            r.positions = [{ assetId: "future", quantity: "100", fairValue: money(100), marginalIm: money(200), expectedCost: money(1), sigmaPpm: 100, expectedTickVolume: "100", marketOpen: true, opening: false, openingVolume: "100" }];
        }
        await e.advance(479, frames.slice(0, 480));
        expect(e.snapshot().orders).toHaveLength(1);
        await e.advance(480, [frames[480]]);
        expect(e.snapshot().orders).toHaveLength(0);
        await e.advance(481, [frames[481]]);
        expect(e.snapshot().orders).toHaveLength(0);
        independentCcpAccounting(e.snapshot());
    });
    it("reduces the owner-loss handoff when a closed service receives a real overdue assessment", async () => {
        const g = marginFixture(), e = await fresh(g);
        await e.advance(9360, defaultFrames(g, 9360, 1000));
        const f = marginFrames(g, 9361)[9361];
        f.commands = [{ id: "late-real-payment", actor: "owner-s1", kind: "PAY_CALL", callId: "LD/d/0/assessment/s1", amount: money(100) }];
        await e.advance(9361, [f]);
        const s = e.snapshot();
        expect(s.services[0].status).toBe("CLOSED");
        expect(s.defaults[0].remaining).toBe(BigInt(money(320)));
        expect(s.defaults[0].ownerLosses[0].amount).toBe(BigInt(money(320)));
        independentCcpAccounting(s);
    }, 20000);
    it("keeps real exhausted CCP capital in recovery even after all cash claims are paid", async () => {
        const g = marginFixture(), e = await fresh(g), frames = defaultFrames(g, 721, 600);
        for (const id of ["s1", "s2", "s3"])
            frames[721].commands.push({ id: "pay-" + id, actor: "owner-" + id, kind: "PAY_CALL", callId: "LD/d/0/assessment/" + id, amount: money(100) });
        await e.advance(721, frames);
        expect(e.snapshot().defaults[0].remaining).toBe(BigInt(0));
        expect(e.snapshot().services[0].status).toBe("RECOVERY");
        expect(marginCcpCash(e.snapshot(), "sitg1/LD")).toBe(BigInt(0));
        expect(e.memberView("s1")[0].riskReducingOnly).toBe(true);
        independentCcpAccounting(e.snapshot());
    });
    it("expires cooling-off capacity at exactly30 game days, without waiving committed calls", () => {
        const t = BigInt(money(100)), h = [{ issued: 720, amount: t }, { issued: 721, amount: t }];
        expect(marginCcpAssessmentCapacity(t, h, 22319)).toBe(BigInt(0));
        expect(marginCcpAssessmentCapacity(t, h, 22320)).toBe(t);
    });
    it("nets VM first, haircuts funded gains pro rata and cancels only unneeded unpaid assessments", async () => {
        const g = marginFixture(), e = await fresh(g), frames = defaultFrames(g, 5760, 630);
        frames[5760].facts.vm = [{ service: "LD", fromMemberId: "s1", toMemberId: "s2", amount: money(100) }, { service: "LD", fromMemberId: "s2", toMemberId: "s1", amount: money(40) }, { service: "LD", fromMemberId: "s1", toMemberId: "s3", amount: money(30) }];
        await e.advance(5760, frames);
        const s = e.snapshot();
        expect(s.defaults[0].remaining).toBe(BigInt(0));
        expect(s.services[0].status).toBe("RECOVERY");
        expect(marginCcpCash(s, marginBucket("s2", "LD"))).toBe(BigInt(money(200)) + BigInt(26666666));
        expect(s.fundingCalls.filter(c => c.kind === "ASSESSMENT").reduce((n, c) => n + c.cancelled, BigInt(0))).toBe(BigInt(money(50)));
        expect(s.fundingCalls.filter(c => c.kind === "ASSESSMENT").every(c => c.paid === BigInt(0))).toBe(true);
        independentCcpAccounting(s);
    }, 20000);
    it("does not fake a720 close-out and gives a late call seven days from actual issuance", async () => {
        const g = marginFixture(), e = await fresh(g), frames = marginFrames(g, 800, f => {
            if (f.tick === 0)
                f.facts.defaults = [{ memberId: "d", service: "LD", reason: "REGULATOR" }];
            if (f.tick === 800)
                f.facts.closeouts = [defaultReport(g, 1000)];
        });
        await e.advance(799, frames.slice(0, 800));
        expect(e.snapshot().defaults[0].managementClosed).toBe(false);
        await e.advance(800, frames.slice(800));
        expect(e.snapshot().fundingCalls.every(c => c.issued === 800 && c.due === 5840)).toBe(true);
    });
    it("never allocates a closeout before480 and emits honest producer handoffs", async () => {
        const g = marginFixture(), e = await fresh(g), f = defaultFrames(g, 479);
        f[479].facts.closeouts = [defaultReport(g, 600)];
        await expect(e.advance(479, f)).rejects.toThrow("PREMATURE");
        expect(e.snapshot().tick).toBe(-1);
        await e.advance(120, defaultFrames(g, 120));
        expect(e.snapshot().history.some(h => h.kind === "porting.hedging.requested")).toBe(true);
        expect(e.snapshot().history.some(h => h.kind === "auction.round1.requested")).toBe(true);
    });
    it("loses IM, defaulterDF, SITG1, juniorDF, restDF and SITG2 in exact order", async () => {
        const g = marginFixture(), e = await fresh(g);
        await e.advance(480, defaultFrames(g, 480, 600));
        const d = e.snapshot().defaults[0];
        expect(d.layers.map(l => l.layer)).toEqual(["DEFAULTER_IM", "DEFAULTER_DF", "SITG1", "SURVIVOR_DF_JUNIOR", "SURVIVOR_DF", "SITG2"]);
        expect(d.layers.map(l => l.amount)).toEqual([100, 100, 40, 100, 200, 40].map(n => BigInt(money(n))));
        expect(d.remaining).toBe(BigInt(money(20)));
        expect(marginCcpCash(e.snapshot(), dfBucket("s1", "LD"))).toBe(BigInt(0));
        independentCcpAccounting(e.snapshot());
    });
    it("cannot reach another service's collateral, fund or capital", async () => {
        const g = marginFixture(4, true), e = await fresh(g);
        await e.advance(480, defaultFrames(g, 480, 10000));
        const s = e.snapshot();
        for (const m of g.members) {
            expect(marginCcpCash(s, dfBucket(m.id, "OTC"))).toBe(BigInt(money(100)));
            expect(marginCcpCash(s, marginBucket(m.id, "OTC"))).toBe(BigInt(m.accounts.find(a => a.service === "OTC")!.marginCash));
        }
        expect(marginCcpCash(s, "sitg1/OTC")).toBe(BigInt(money(40)));
        independentCcpAccounting(s);
    });
    it("issues assessments at720, due7 days later, with only funded payments absorbing losses", async () => {
        const g = marginFixture(), e = await fresh(g);
        await e.advance(719, defaultFrames(g, 719, 800));
        expect(e.snapshot().fundingCalls).toHaveLength(0);
        await e.advance(720, defaultFrames(g, 720, 800).slice(720));
        const calls = e.snapshot().fundingCalls.filter(c => c.kind === "ASSESSMENT");
        expect(calls).toHaveLength(3);
        expect(calls.every(c => c.issued === 720 && c.due === 5760 && c.amount <= BigInt(money(100)))).toBe(true);
        const remaining = e.snapshot().defaults[0].remaining;
        const call = calls[0];
        await e.advance(721, marginFrames(g, 721).slice(721).map(f => ({ ...f, commands: [{ id: "pay", actor: "owner-" + call.memberId, kind: "PAY_CALL", callId: call.id, amount: call.amount.toString() }] })));
        expect(e.snapshot().defaults[0].remaining).toBe(remaining - call.amount);
        independentCcpAccounting(e.snapshot());
    });
    it("caps overlapping assessment commitments at2x target per30 game days", async () => {
        const g = marginFixture(7), e = await fresh(g), f = marginFrames(g, 720, x => {
            if (x.tick === 0)
                x.facts.defaults = ["d", "s1", "s2"].map(memberId => ({ memberId, service: "LD", reason: "REGULATOR" }));
            if (x.tick === 480)
                x.facts.closeouts = ["d", "s1", "s2"].map(id => defaultReport(g, 10000, id));
        });
        await e.advance(720, f);
        const histories = e.snapshot().assessmentHistory;
        for (const id of ["s3", "s4", "s5", "s6"])
            expect(histories.filter(h => h.memberId === id).reduce((n, h) => n + h.amount, BigInt(0))).toBe(BigInt(money(200)));
        independentCcpAccounting(e.snapshot());
    });
    it("a missed funding deadline is not itself default; the next margin call escalates", async () => {
        const g = marginFixture(), e = await fresh(g), frames = defaultFrames(g, 5761, 1000);
        frames[5761].facts.risks.find(r => r.memberId === "s1")!.im = money(250);
        await e.advance(5760, frames.slice(0, 5761));
        expect(e.snapshot().margins.find(m => m.memberId === "s1")!.status).toBe("OK");
        expect(e.memberView("s1")[0].riskReducingOnly).toBe(true);
        await e.advance(5761, frames.slice(5761));
        expect(e.snapshot().defaults.find(d => d.memberId === "s1")!.reason).toBe("FUNDING_SHORTFALL_AT_NEXT_MARGIN_CALL");
    }, 20000);
    it("haircuts only funded net VM gains after assessments and never mints missing gains", async () => {
        const g = marginFixture(), e = await fresh(g), frames = defaultFrames(g, 5761, 1000);
        frames[5760].facts.vm = [{ service: "LD", fromMemberId: "s1", toMemberId: "s2", amount: money(50) }];
        await e.advance(5761, frames);
        const s = e.snapshot(), d = s.defaults[0];
        expect(d.layers.find(l => l.layer === "VMGH")!.amount).toBe(BigInt(money(50)));
        expect(d.remaining).toBe(BigInt(money(370)));
        expect(marginCcpCash(s, marginBucket("s2", "LD"))).toBe(BigInt(money(200)));
        independentCcpAccounting(s);
    }, 20000);
    it("closes after five VMGH days with explicit unpaid cash and owner-loss handoff, no rescue", async () => {
        const g = marginFixture(), e = await fresh(g);
        await e.advance(9360, defaultFrames(g, 9360, 1000));
        const s = e.snapshot(), d = s.defaults[0];
        expect(d.vmghStart).toBe(5760);
        expect(d.vmghUntil).toBe(9360);
        expect(d.stage).toBe("SHORTFALL");
        expect(d.remaining).toBe(BigInt(money(420)));
        expect(d.ownerLosses[0].amount).toBe(d.remaining);
        expect(s.services[0].status).toBe("CLOSED");
        expect(e.memberView("s1")[0].riskReducingOnly).toBe(true);
        independentCcpAccounting(s);
    }, 20000);
    it("rejects an unfunded VM contract atomically instead of inventing settlement cash", async () => {
        const g = marginFixture(), e = await fresh(g);
        await expect(e.advance(0, marginFrames(g, 0, f => f.facts.vm = [{ service: "LD", fromMemberId: "s1", toMemberId: "s2", amount: money(10001) }]))).rejects.toThrow("UNFUNDED_VM");
        expect(e.snapshot().tick).toBe(-1);
    });
    it("rejects conflicting closeout reports and maintains canonical command identity", async () => {
        const g = marginFixture(), e = await fresh(g);
        await e.advance(480, defaultFrames(g, 480, 600));
        const f = marginFrames(g, 481).slice(481);
        f[0].facts.closeouts = [defaultReport(g, 601)];
        await expect(e.advance(481, f)).rejects.toThrow("CONFLICT");
        expect(e.snapshot().tick).toBe(480);
    });
});
