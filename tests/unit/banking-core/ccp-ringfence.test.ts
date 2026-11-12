import { describe, it, expect } from "vitest";
import { BankingCoreEngine } from "../../../src/server/banking-core/engine";
import { ccpRingFence, liquidityMetrics, liquiditySheet, liquidityBaseCash } from "../../../src/server/banking-core/internal/liquidity/accounting";
import type { CoreState } from "../../../src/server/banking-core/model";
import type { CoreStore } from "../../../src/server/banking-core/model";
import * as F from "./fixture";

class Memory implements CoreStore { p: unknown = null; r: string | null = null; n = 0; async load() { return { revision: this.r, payload: this.p }; } async save(p: unknown) { this.p = p; this.r = String(++this.n); return this.r; } }
const M = BigInt(1000000), usd = (n: number) => BigInt(n) * M;
const bankA = (s: CoreState) => s.banks.find(b => b.id === "a")!;
const failures = (s: CoreState) => s.history.filter(h => h.bankId === "a" && h.kind === "bank.failed").map(h => h.tick);

// 07 §3.10.1 + §3.17.6 + §3.17.8 steps 1-2 + §3.10.2/:458: decided in docs/v1/units/banking-core.md ("Decision: the post-closeout second failure").
describe("banking-core ring-fences a failed bank's own CCP margin (07)", () => {
    it("ring-fences IM+DF from the failure tick, sizes the single bail-in net of it, and the closeout is not a second hit", async () => {
        const x = F.crossModule(), frames = x.build(5040, 3599), e = await BankingCoreEngine.open(new Memory(), x.g, true);
        const before = await e.advance(3598, frames.filter(f => f.tick <= 3598));
        expect(ccpRingFence(before, "a")).toBe(BigInt(0));
        const failed = await e.advance(3599, frames.filter(f => f.tick === 3599));
        expect(bankA(failed).failedAt).toBe(3599);
        expect(ccpRingFence(failed, "a")).toBe(usd(200));
        const m = liquidityMetrics(failed, bankA(failed)), sheet = liquiditySheet(failed, bankA(failed));
        expect(m.ccpRingFenced).toBe(usd(200));
        expect(sheet.equity - m.cet1).toBe(usd(200)); // capital deduction only; the fixture has no other deductions
        const afterBailin = await e.advance(4079, frames.filter(f => f.tick > 3599 && f.tick <= 4079));
        expect(liquidityMetrics(afterBailin, bankA(afterBailin)).cet1).toBe(BigInt(0)); // CET1 = 10% of RWA net of the provision
        const closed = await e.advance(4080, frames.filter(f => f.tick === 4080));
        expect(ccpRingFence(closed, "a")).toBe(BigInt(0)); // close-out applied: recovery now exact
        expect(closed.ccpMeta!.defaults[0].layers.map(l => [l.layer, l.amount])).toEqual([["DEFAULTER_IM", usd(100)], ["DEFAULTER_DF", usd(50)]]);
        expect(liquidityMetrics(closed, bankA(closed)).cet1).toBe(usd(50)); // unconsumed DF back in capital; no new loss
        const end = await e.advance(5040, frames.filter(f => f.tick > 4080));
        expect(failures(end)).toEqual([3599]);
        expect(bankA(end).failedAt).toBe(3599);
        expect(bankA(end).resolution!.equityRights).toEqual([{ creditor: "treasury-a", amount: BigInt(800004120881) }]);
        expect(end.ccpMeta!.defaults.map(d => [d.id, d.stage])).toEqual([["LD/d/3600", "CLOSED"]]);
        expect(liquidityBaseCash(end) + end.sinks).toBe(end.openingM0);
    }, 60000);
    it("declares the member default in every service the failed bank's member clears, and ring-fences each until its close-out", async () => {
        const x = F.crossModule(true), frames = x.build(4080, 3599), e = await BankingCoreEngine.open(new Memory(), x.g, true);
        const failed = await e.advance(3599, frames.filter(f => f.tick <= 3599));
        expect(bankA(failed).failedAt).toBe(3599);
        expect(ccpRingFence(failed, "a")).toBe(usd(400));
        const declared = await e.advance(3600, frames.filter(f => f.tick === 3600));
        expect(declared.ccpMeta!.defaults.map(d => [d.id, d.reason]).sort()).toEqual([["LD/d/3600", "BANK_RESOLUTION"], ["OTC/d/3600", "BANK_RESOLUTION"]]);
        const ld = await e.advance(4080, frames.filter(f => f.tick > 3600));
        expect(ccpRingFence(ld, "a")).toBe(usd(200)); // LD closed out; OTC still awaits its close-out
        expect(liquidityBaseCash(ld) + ld.sinks).toBe(ld.openingM0);
    }, 60000);
});
