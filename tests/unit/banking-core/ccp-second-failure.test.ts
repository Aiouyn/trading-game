import { describe, it, expect } from "vitest";
import { BankingCoreEngine } from "../../../src/server/banking-core/engine";
import { liquidityMetrics, liquidityBaseCash } from "../../../src/server/banking-core/internal/liquidity/accounting";
import type { CoreState, CoreStore } from "../../../src/server/banking-core/model";
import * as F from "./fixture";

class Memory implements CoreStore { p: unknown = null; r: string | null = null; n = 0; async load() { return { revision: this.r, payload: this.p }; } async save(p: unknown) { this.p = p; this.r = String(++this.n); return this.r; } }
const M = BigInt(1000000), usd = (n: number) => BigInt(n) * M;
const bankA = (s: CoreState) => s.banks.find(b => b.id === "a")!;
const failures = (s: CoreState) => s.history.filter(h => h.bankId === "a" && h.kind === "bank.failed").map(h => h.tick);
const m0 = (s: CoreState) => { expect(liquidityBaseCash(s) + s.sinks).toBe(s.openingM0); };

/**
 * OWNER-PENDING (docs/v1/units/banking-core.md "Owner-pending: post-closeout second failure"). This pins the current
 * behaviour, which allows a re-failure; it is not an endorsement. If the owner picks "provision the declared close-out at
 * bail-in", this test must change with the engine.
 */
describe("banking-core post-closeout second failure (owner-pending, pinned as is)", () => {
    it("bails bank a in at 3599 to CET1 = 10% of RWA; its own CCP close-out at 4080 makes it fail again at 4319", async () => {
        const x = F.crossModule(), frames = x.build(5040, 3599), e = await BankingCoreEngine.open(new Memory(), x.g, true);
        const bailed = await e.advance(4079, frames.filter(f => f.tick <= 4079));
        expect(bankA(bailed).failedAt).toBe(3599);
        const before = liquidityMetrics(bailed, bankA(bailed));
        expect([before.cet1, before.rwa]).toEqual([usd(20), usd(200)]);
        expect(bankA(bailed).resolution!.equityRights).toEqual([{ creditor: "treasury-a", amount: BigInt(799824120881) }]);
        m0(bailed);
        const closed = await e.advance(4080, frames.filter(f => f.tick === 4080));
        expect(closed.ccpMeta!.defaults[0].layers.map(l => [l.layer, l.amount])).toEqual([["DEFAULTER_IM", usd(100)], ["DEFAULTER_DF", usd(50)]]);
        expect(liquidityMetrics(closed, bankA(closed)).cet1).toBe(-usd(130));
        m0(closed);
        const end = await e.advance(5040, frames.filter(f => f.tick > 4080));
        const a = bankA(end);
        expect(failures(end)).toEqual([3599, 4319]);
        expect([a.failedAt, a.resolution!.opened, a.resolution!.tool, a.resolution!.trigger]).toEqual([4319, 4319, "BAIL_IN", "SOLVENCY"]);
        expect(end.ccpMeta!.defaults.map(d => [d.id, d.stage])).toEqual([["LD/d/3600", "CLOSED"]]);
        // Additive record: the first bail-in's equity rights survive the second resolution.
        expect(a.priorResolutions!.map(r => [r.opened, r.tool, r.equityRights])).toEqual([[3599, "BAIL_IN", [{ creditor: "treasury-a", amount: BigInt(799824120881) }]]]);
        expect(a.resolution!.equityRights.length).toBeGreaterThan(0);
        m0(end);
    }, 60000);
    it("keeps priorResolutions absent while a bank has been resolved at most once", async () => {
        const x = F.crossModule(), e = await BankingCoreEngine.open(new Memory(), x.g, true);
        const s = await e.advance(4318, x.build(4318, 3599));
        expect(bankA(s).failedAt).toBe(3599);
        expect("priorResolutions" in bankA(s)).toBe(false);
        for (const b of s.banks) expect(b.priorResolutions).toBeUndefined();
    }, 60000);
});
