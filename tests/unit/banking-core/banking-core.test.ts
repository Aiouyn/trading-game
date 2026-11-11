import { describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BankingCoreEngine, BANKING_CORE_DEFAULT_ENABLED } from "../../../src/server/banking-core/engine";
import { coreFingerprint, decodeCoreGenesis } from "../../../src/server/banking-core/boundary";
import type { CoreStore } from "../../../src/server/banking-core/model";
import { FileBankingCoreStore } from "../../../src/server/banking-core/store";
import * as F from "./fixture";

class Memory implements CoreStore {
    payload: unknown = null; revision: string | null = null; loads = 0; saves = 0;
    async load() { this.loads++; return { revision: this.revision, payload: structuredClone(this.payload) }; }
    async save(payload: unknown, expected: string | null) { this.saves++; if (expected !== this.revision) throw new Error("STALE"); this.payload = structuredClone(payload); this.revision = coreFingerprint(payload); return this.revision; }
}
const Z = BigInt(0), bal = (s: { accounts: { id: string; lots: { amount: bigint }[] }[] }, id: string) => s.accounts.find(a => a.id === id)!.lots.reduce((n, l) => n + l.amount, Z);
const facts = () => F.creditFacts([F.companyProfile("company", 2000000000)]);
function loanWorld() {
    const g = F.bankingFixture();
    g.credit = [F.creditBook("bankA", ["business", "company-wallet"], "other")];
    return g;
}
const loanFrames = (target = 59): F.Frame[] => F.frames(target, f => {
    if (f.tick % 30 === 29) f.banking = F.bankFrame(f.tick);
    if (f.tick === 0) f.credit = [{ bankId: "bankA", frame: F.creditFrame(0, [F.apply("company", 1000, "business", F.term("BULLET"))], facts()) }];
    if (f.tick === 1) f.credit = [{ bankId: "bankA", frame: F.creditFrame(1, [F.accept("company")], facts()) }];
}, () => false);
const open = (g: unknown, store: CoreStore = new Memory()) => BankingCoreEngine.open(store, g, true);
const baseMoney = (s: { banks: { reserves: bigint }[]; accounts: { bankId: string | null; lots: { amount: bigint }[] }[]; dgf: { cash: bigint }[] }) => s.banks.reduce((n, b) => n + b.reserves, Z) + s.accounts.filter(a => a.bankId === null).reduce((n, a) => n + a.lots.reduce((m, l) => m + l.amount, Z), Z) + s.dgf.reduce((n, d) => n + d.cash, Z);

describe("banking-core default-off boundary", () => {
    it("is default-off and touches no store unless explicitly enabled", async () => {
        expect(BANKING_CORE_DEFAULT_ENABLED).toBe(false);
        for (const flag of [undefined, false, "true", 1, null]) {
            const store = new Memory();
            await expect(BankingCoreEngine.open(store, loanWorld(), flag)).rejects.toThrow("BANKING_CORE_DISABLED");
            expect(store.loads + store.saves).toBe(0);
        }
    });
    it("rejects root, nested, revoked and function Proxies before reflection with zero traps", async () => {
        let traps = 0;
        const handler = new Proxy({}, { get() { traps++; return undefined; } });
        const revocable = Proxy.revocable({}, handler); revocable.revoke();
        const nested = loanWorld(); (nested.ledger as unknown as { banks: unknown[] }).banks[0] = new Proxy({}, handler);
        for (const bad of [new Proxy(loanWorld(), handler), nested, revocable.proxy, new Proxy(() => 1, handler)]) {
            const store = new Memory();
            await expect(open(bad, store)).rejects.toThrow();
            expect(store.loads + store.saves).toBe(0);
        }
        const e = await open(loanWorld());
        await expect(e.advance(59, [new Proxy(loanFrames()[0], handler)])).rejects.toThrow();
        expect(traps).toBe(0);
    });
    it("rejects sparse arrays, NaN, Infinity, undefined, Date and unknown fields", async () => {
        const mutate: ((g: ReturnType<typeof loanWorld>) => void)[] = [
            g => { (g.ledger.banks as unknown[]).length = 5; },
            g => { (g.ledger.banks[0] as unknown as { sibSurchargePpm: number }).sibSurchargePpm = NaN; },
            g => { (g.ledger.banks[0] as unknown as { sibSurchargePpm: number }).sibSurchargePpm = Infinity; },
            g => { (g.ledger.banks[0] as unknown as { npc: unknown }).npc = undefined; },
            g => { (g as unknown as { banking: unknown }).banking = new Date(0); },
            g => { (g as unknown as { extra: number }).extra = 1; },
            g => { (g.ledger.banks[0] as unknown as { equity: string }).equity = "1"; },
        ];
        for (const m of mutate) { const g = loanWorld(); m(g); await expect(open(g)).rejects.toThrow(); }
        const e = await open(loanWorld());
        const f = loanFrames(); (f[0] as unknown as { extra: number }).extra = 1;
        await expect(e.advance(59, f)).rejects.toThrow();
        await expect(e.advance(1.5, [])).rejects.toThrow();
    });
    it("refuses feature-local money seeds: banking cash, CCP wallets and VM balances live only in the ledger", async () => {
        const g = loanWorld(); (g.banking as { banks: Record<string, unknown>[] }).banks[0].cash = "1";
        await expect(open(g)).rejects.toThrow();
        const c = F.ccpFixture(4), seeded = { ledger: F.ledger([F.bank("x", "0")], c.accounts), liquidityEnabled: false, banking: null, credit: [], ccp: c.ccp };
        await expect(open(seeded)).resolves.toBeTruthy();
        const vm = structuredClone(seeded); vm.ledger.accounts.find(a => a.id === "vm/LD")!.cash = "1";
        await expect(open(vm)).rejects.toThrow("CORE_VM_SEED");
        const dup = structuredClone(seeded); dup.ccp.members[1].accounts[0].dfAccountId = dup.ccp.members[0].accounts[0].dfAccountId;
        await expect(open(dup)).rejects.toThrow("CORE_DUPLICATE_CCP_CASH");
        const custody = structuredClone(seeded); custody.ccp.members[0].wallet = { kind: "ACCOUNT", id: "margin/LD/d" };
        await expect(open(custody)).rejects.toThrow("CORE_MEMBER_BANK");
        const deposit = structuredClone(seeded); deposit.ledger.accounts.find(a => a.id === "margin/LD/d")!.bankId = "x";
        await expect(open(deposit)).rejects.toThrow("CORE_CCP_CUSTODY");
    });
});

describe("one ledger, one origination path", () => {
    it("retires banking LEND, REPAY and WRITE_OFF so banking can never originate", async () => {
        const e = await open(loanWorld());
        for (const kind of ["LEND", "REPAY", "WRITE_OFF"]) {
            const f = [{ tick: 0, banking: F.bankFrame(0, [{ kind, id: "x", actor: "bankA", depositId: "business", loanId: "x", amount: F.usd(1), ratePpm: 0, maturityTick: 719 }]), credit: [], liquidity: null, ccp: null }];
            await expect(e.advance(0, f)).rejects.toThrow();
        }
    });
    it("creates deposit money only through the credit book, against a loan asset held by the lender", async () => {
        const e = await open(loanWorld()), before = e.snapshot();
        const s = await e.advance(59, loanFrames());
        const book = s.creditBooks[0], loan = book.loans[0];
        expect(book.movements.map(m => m.kind)).toEqual(["CREDIT_CREATE"]);
        expect(bal(s, "business") - bal(before, "business")).toBe(BigInt(F.usd(1000)));
        const asset = s.assets.find(a => a.id === loan.assetId)!;
        expect(asset.id).toBe("@originated/bankA/" + loan.id);
        expect(asset.holdings).toEqual([{ bankId: "bankA", accountId: null, quantity: BigInt(F.usd(1000)) }]);
        expect(baseMoney(s)).toBe(baseMoney(before));
        const sheet = e.sheets().find(x => x.bankId === "bankA")!;
        expect(sheet.deposits + sheet.equity).toBe(sheet.noncash + sheet.reserves);
        expect(e.project("CREDIT", "bankA")).toBeTruthy();
    });
    it("refuses to route credit when the lender cannot settle it in reserves (no central-bank rescue)", async () => {
        const g = loanWorld(); g.credit = [F.creditBook("bankA", ["company-wallet"], "other")];
        const e = await open(g), frames = F.frames(59, f => {
            if (f.tick % 30 === 29) f.banking = F.bankFrame(f.tick);
            if (f.tick === 0) f.credit = [{ bankId: "bankA", frame: F.creditFrame(0, [F.apply("company", 2000000, "company-wallet", F.term())], facts()) }];
            if (f.tick === 1) f.credit = [{ bankId: "bankA", frame: F.creditFrame(1, [F.accept("company")], facts()) }];
        }, () => false);
        const s = await e.advance(59, frames);
        expect(s.creditBooks[0].receipts.at(-1)!.reason).toBe("RESERVES");
        expect(s.creditBooks[0].movements).toHaveLength(0);
        expect(s.assets.filter(a => a.id.startsWith("@originated/"))).toHaveLength(0);
    });
    it("requires every module's frames at the spec granularity", async () => {
        const e = await open(loanWorld());
        await expect(e.advance(29, [])).rejects.toThrow();
    });
});

describe("restart and replay", () => {
    it("restarts byte-identically from a reordered genesis and replays reordered frames idempotently", async () => {
        const dir = await mkdtemp(join(tmpdir(), "banking-core-test-"));
        try {
            const path = join(dir, "core.json"), g = loanWorld(), frames = loanFrames();
            const a = await BankingCoreEngine.open(new FileBankingCoreStore(path), g, true);
            const s = await a.advance(59, frames);
            const b = await BankingCoreEngine.open(new FileBankingCoreStore(path), F.reorder(g), true);
            expect(coreFingerprint(b.snapshot())).toBe(coreFingerprint(s));
            await b.advance(59, F.reorder(frames));
            expect(coreFingerprint(b.snapshot())).toBe(coreFingerprint(s));
            const conflict = structuredClone(frames); (conflict[0].credit[0].frame as { commands: { amount: string }[] }).commands[0].amount = F.usd(999);
            await expect(b.advance(59, conflict)).rejects.toThrow("CORE_FRAME_CONFLICT");
            await b.advance(60, []);
            await expect(a.advance(60, [])).rejects.toThrow("BANKING_CORE_STALE_STORE");
            expect(coreFingerprint(decodeCoreGenesis(F.reorder(g)))).toBe(coreFingerprint(decodeCoreGenesis(g)));
        } finally { await rm(dir, { recursive: true, force: true }); }
    });
});

describe("liquidity, resolution and CCP share the ledger", () => {
    it("turns a bank resolution into a CCP default for the member that banks there and keeps base money fixed", async () => {
        const c = F.ccpFixture(4, false, "a");
        const ledger = F.ledger([F.bank("a", F.usd(1000000)), F.bank("b", F.usd(1000000), true)], [F.account("alice-a", "a", "alice", F.usd(100000)), ...c.accounts], F.usd(100000));
        const g = { ledger, liquidityEnabled: true, banking: null, credit: [], ccp: c.ccp };
        const e = await open(g), before = e.snapshot();
        expect(before.cashOwnership.filter(r => r.bankId === "a").map(r => r.accountId).sort()).toEqual(["df/LD/d", "margin/LD/d"]);
        expect(e.sheets().find(x => x.bankId === "a")!.restrictedReserves).toBe(BigInt(F.usd(200)));
        const frames = F.frames(721, f => {
            if (F.liquidityRequired(f.tick)) { const x = F.liquidityFacts(ledger); if (f.tick === 719) x.banks[0].regulatorFailure = true; f.liquidity = { tick: f.tick, facts: x, commands: [] }; }
            f.ccp = { tick: f.tick, facts: F.marginFacts(c.ids, c.services), commands: [] };
        }, () => false);
        const s = await e.advance(721, frames);
        expect(s.banks[0].failedAt).toBe(719);
        const d = s.ccpMeta!.defaults.find(x => x.memberId === "d")!;
        expect(d.reason).toBe("BANK_RESOLUTION");
        expect(d.declared).toBe(720);
        expect(baseMoney(s) + s.sinks).toBe(baseMoney(before));
    });
});
