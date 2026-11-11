import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { BankLiquidityEngine, FileLiquidityCheckpointStore } from "../../src/server/bank-liquidity/engine";
import { canonicalJson, liquidityWire } from "../../src/server/bank-liquidity/boundary";
import { liquiditySigmoid } from "../../src/server/bank-liquidity/confidence-math";
import { cash, independentAccounting, liquidityFixture, liquidityFrames, ownMove, type Fixture, type FixtureFrame } from "../../tests/unit/bank-liquidity/fixture";
const wire = (v: unknown) => canonicalJson(liquidityWire(v));
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const totalDeposits = (s: ReturnType<BankLiquidityEngine["snapshot"]>) => s.accounts.filter(a => a.bankId !== null).reduce((n, a) => n + a.lots.reduce((n, l) => n + l.amount, BigInt(0)), BigInt(0));
const reorder = (x: unknown): unknown => Array.isArray(x) ? x.map(reorder) : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).reverse().map(([k, v]) => [k, reorder(v)])) : x;
async function main() {
    const arg = process.argv[2];
    if (!arg)
        throw new Error("Give a NEW evidence directory; this runner never reuses a store");
    const out = resolve(arg);
    await mkdir(out);
    const provenance = { writtenAt: new Date().toISOString(), zone: "UTC in artifact metadata; user report converts to Europe/Paris", head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), gitStatus: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }), base: "110583b0aa73ece1dc3b856665f3be0405f1acc3", defaultOff: true, explicitOfflineOptIn: true };
    await writeFile(join(out, "PROVENANCE.json"), JSON.stringify(provenance, null, 2) + "\n");
    const reports: unknown[] = [];
    async function scenario(name: string, g: Fixture, frames: FixtureFrame[], target: number, expectedTool: string | null, literal = false) {
        const dir = join(out, name);
        await mkdir(dir);
        const paths = ["jump", "stepped", "restart"].map(k => join(dir, k + ".json"));
        const genesisDeposits = g.accounts.filter(a => a.bankId !== null).reduce((n, a) => n + BigInt(a.cash), BigInt(0));
        const jump = await BankLiquidityEngine.open(new FileLiquidityCheckpointStore(paths[0]), g, true), step = await BankLiquidityEngine.open(new FileLiquidityCheckpointStore(paths[1]), g, true);
        let restarted = await BankLiquidityEngine.open(new FileLiquidityCheckpointStore(paths[2]), reorder(g), true);
        const genesisState = jump.snapshot();
        independentAccounting(genesisState);
        await jump.advance(target, frames);
        const times = literal ? Array.from({ length: target + 1 }, (_, t) => t) : [...new Set([...frames.map(f => f.tick), 719, 749, 1439, target].filter(t => t <= target))].sort((a, b) => a - b);
        let checkpoints = 0;
        const independentSnapshots: unknown[] = [];
        for (const tick of times) {
            const rows = frames.filter(f => f.tick === tick);
            await step.advance(tick, rows);
            await restarted.advance(tick, reorder(rows));
            independentAccounting(step.snapshot());
            independentAccounting(restarted.snapshot());
            if ([0, 719, 749, 1439, target].includes(tick)) {
                const snapshot = step.snapshot();
                independentSnapshots.push({ tick, accounting: independentAccounting(snapshot), tool: snapshot.banks[0].resolution?.tool ?? null, queue: snapshot.queue.length });
                restarted = await BankLiquidityEngine.open(new FileLiquidityCheckpointStore(paths[2]), reorder(g), true);
                checkpoints++;
            }
        }
        const actual = jump.snapshot();
        assert.equal(wire(actual), wire(step.snapshot()));
        assert.equal(wire(actual), wire(restarted.snapshot()));
        const bytes = await Promise.all(paths.map(p => readFile(p, "utf8")));
        assert.equal(bytes[0], bytes[1]);
        assert.equal(bytes[0], bytes[2]);
        assert.equal(actual.banks[0].resolution?.tool ?? null, expectedTool);
        if (actual.banks[0].status === "CLOSED")
            assert.equal(actual.banks[0].resolution!.insuranceShortfall, BigInt(0));
        for (const asset of actual.assets) {
            const initial = g.assets.find(a => a.id === asset.id)!;
            assert.equal(asset.holdings.reduce((n, h) => n + h.quantity, BigInt(0)), initial.holdings.reduce((n, h) => n + BigInt(h.quantity), BigInt(0)));
        }
        // Independent deposit-source budget. No scenario originates a loan or accepts a deposit faucet.
        let expectedDeposits = genesisDeposits;
        if (expectedTool === "BAIL_IN") {
            const depositIds = new Set(g.accounts.filter(a => a.bankId !== null).map(a => a.id));
            expectedDeposits -= actual.banks[0].resolution!.equityRights.filter(r => depositIds.has(r.creditor)).reduce((n, r) => n + r.amount, BigInt(0));
        }
        if (actual.banks[0].status === "CLOSED") {
            const paid = actual.history.filter(e => e.bankId === "a" && e.kind === "insurance.paid").reduce((n, e) => n + e.amount, BigInt(0));
            expectedDeposits = g.accounts.filter(a => a.bankId === "b").reduce((n, a) => n + BigInt(a.cash), BigInt(0)) + paid;
        }
        assert.equal(totalDeposits(actual), expectedDeposits, "no unsupported deposit issuance in the scenario");
        const report = { name, target, mode: literal ? "literal every tick" : "every stamped hour/day plus resolution boundaries", checkpoints, fullStateEquivalent: true, canonicalCheckpointBytesEquivalent: true, checkpointSha256: sha(bytes[0]), stateSha256: sha(wire(actual)), assetQuantityConserved: true, depositSourceBudget: { expectedDeposits, actualDeposits: totalDeposits(actual), equal: true }, accounting: independentAccounting(actual), tool: expectedTool, status: actual.banks[0].status, losses: actual.banks[0].resolution?.creditorLosses ?? [], insuranceShortfall: actual.banks[0].resolution?.insuranceShortfall ?? BigInt(0) };
        await writeFile(join(dir, "independent-snapshots.json"), wire(independentSnapshots) + "\n");
        await writeFile(join(dir, "final-state.json"), wire(actual) + "\n");
        await writeFile(join(dir, "RESULT.json"), wire(report) + "\n");
        reports.push(report);
    }
    const short = liquidityFixture(), shortFrames = liquidityFrames(short, 90, f => {
        if (f.tick === 0)
            f.commands = [ownMove("bank-move", "alice-a", "alice-b", 10000)];
    });
    shortFrames.push({ tick: 1, facts: null, commands: [ownMove("cash-out", "alice-a", "alice-cash", 1000)] }, { tick: 2, facts: null, commands: [ownMove("cash-back", "alice-cash", "alice-a", 1000)] });
    shortFrames.sort((a, b) => a.tick - b.tick);
    await scenario("literal-reserve-transfers", short, shortFrames, 90, null, true);
    const acquisition = liquidityFixture(), paFrames = liquidityFrames(acquisition, 1499, f => {
        if (f.tick === 719)
            f.facts!.banks[0].regulatorFailure = true;
        if (f.tick === 720)
            f.commands = [{ id: "acquisition", actor: "owner-b", kind: "BID", bankId: "a", buyerBankId: "b", price: cash(1000), capitalInjection: cash(10000) }];
    });
    await scenario("funded-acquisition", acquisition, paFrames, 1499, "PA");
    const bailin = liquidityFixture();
    bailin.assets[0].markPpm = 600000;
    bailin.notes = [{ id: "at1", bankId: "a", creditor: "creditor", rank: "AT1", instrument: "BOND", amount: cash(30000), longTerm: true }, { id: "sub", bankId: "a", creditor: "creditor", rank: "SUB", instrument: "BOND", amount: cash(30000), longTerm: true }, { id: "senior", bankId: "a", creditor: "creditor", rank: "SENIOR", instrument: "BOND", amount: cash(30000), longTerm: true }];
    await scenario("loss-bearing-bailin", bailin, liquidityFrames(bailin, 800), 800, "BAIL_IN");
    const liquidation = liquidityFixture();
    liquidation.assets[0].kind = "L1";
    liquidation.assets[0].rwPpm = 0;
    liquidation.assets[0].collateralFor = "secured";
    liquidation.banks[0].reserves = cash(50000);
    liquidation.dgf[0].cash = "0";
    liquidation.notes = [{ id: "secured", bankId: "a", creditor: "creditor", rank: "SECURED", instrument: "OTHER", amount: cash(200000), longTerm: false }, { id: "cost", bankId: "a", creditor: "creditor", rank: "COST", instrument: "OTHER", amount: cash(10000), longTerm: false }, { id: "senior", bankId: "a", creditor: "creditor", rank: "SENIOR", instrument: "BOND", amount: cash(100000), longTerm: true }, { id: "sub", bankId: "a", creditor: "creditor", rank: "SUB", instrument: "BOND", amount: cash(100000), longTerm: true }, { id: "at1", bankId: "a", creditor: "creditor", rank: "AT1", instrument: "BOND", amount: cash(100000), longTerm: true }];
    const liqFrames = liquidityFrames(liquidation, 1499, f => {
        if (f.tick === 0)
            f.commands = [ownMove("real-reserve-gap", "alice-a", "alice-b", 400000)];
        if (f.tick === 719)
            f.facts!.banks[0].regulatorFailure = true;
        if (f.tick === 750)
            f.facts!.bids = [{ id: "finite-estate-buyer", buyer: { kind: "ACCOUNT", id: "dealer" }, assetId: "loans", quantity: cash(1500000), pricePpm: 970000 }];
    });
    await scenario("secured-waterfall", liquidation, liqFrames, 1499, "LIQUIDATION");
    const pending = liquidityFixture();
    pending.dgf[0].cash = cash(100);
    const pendingTarget = 719 + 14 * 720;
    const pendingFrames = liquidityFrames(pending, pendingTarget, f => {
        if (f.tick === 0)
            f.commands = [ownMove("unfunded-run", "alice-a", "alice-b", 400000)];
    });
    await scenario("no-buyer-no-rescue", pending, pendingFrames, pendingTarget, "LIQUIDATION");
    const vectors = Array.from({ length: 961 }, (_, i) => -16 + i / 40), reference = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "-e", `const {sigmoid}=require('./packages/engine/core/dmath/exp.ts');process.stdout.write(JSON.stringify(${JSON.stringify(vectors)}.map(sigmoid)))`], { encoding: "utf8" }));
    let maxError = 0;
    for (let i = 0; i < vectors.length; i++) {
        const error = Math.abs(liquiditySigmoid(vectors[i]) - reference[i]);
        maxError = Math.max(maxError, error);
        assert(error <= Number.EPSILON);
    }
    await writeFile(join(out, "confidence-core-equivalence.json"), JSON.stringify({ points: vectors.length, min: -16, max: 8, maxAbsoluteError: maxError, comparison: "actual core dmath sigmoid in an ESNext tsx child process", pass: true }, null, 2) + "\n");
    const report = { ...provenance, finishedAt: new Date().toISOString(), pass: true, scenarios: reports, confidenceCoreEquivalence: { points: vectors.length, maxAbsoluteError: maxError }, limitations: ["offline/default-off; no live-player adapter or UI", "no lending or bank deposit issuance API; existing loan assets only", "no treasury/CB rescue; DGF guarantee shortfalls remain outstanding", "finite bids can leave an estate pending beyond14 game days"] };
    await writeFile(join(out, "RESULT.json"), wire(report) + "\n");
    process.stdout.write(wire(report) + "\n");
}
main().catch(error => {
    process.stderr.write(String(error) + "\n");
    process.exitCode = 1;
});
