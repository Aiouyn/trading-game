import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { MarginCcpEngine, FileMarginCcpCheckpointStore } from "../../src/server/margin-ccp/engine";
import { canonicalJson, marginCcpWire } from "../../src/server/margin-ccp/boundary";
import { marginFixture, marginFrames, defaultFrames, money, independentCcpAccounting, type MarginFixture, type MarginFixtureFrame } from "../../tests/unit/margin-ccp/fixture";
const wire = (v: unknown) => canonicalJson(marginCcpWire(v)), hash = (s: string) => createHash("sha256").update(s).digest("hex");
const reorder = (v: unknown): unknown => Array.isArray(v) ? v.map(reorder) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).reverse().map(([k, v]) => [k, reorder(v)])) : v;
async function main() {
    if (!process.argv[2])
        throw new Error("A NEW output directory is required");
    const out = resolve(process.argv[2]);
    await mkdir(out);
    const provenance = { timestamp: execFileSync("date", ["--iso-8601=seconds"], { encoding: "utf8" }).trim(), timestampZone: "Europe/Paris", head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), gitStatus: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }), base: "110583b0aa73ece1dc3b856665f3be0405f1acc3", offlineEnabled: true };
    await writeFile(join(out, "PROVENANCE.json"), JSON.stringify(provenance, null, 2) + "\n");
    const reports: unknown[] = [];
    async function scenario(name: string, g: MarginFixture, frames: MarginFixtureFrame[], target: number, literal = false) {
        const dir = join(out, name);
        await mkdir(dir);
        const paths = ["jump", "stepped", "restart"].map(n => join(dir, n + ".json")), jump = await MarginCcpEngine.open(new FileMarginCcpCheckpointStore(paths[0]), g, true), step = await MarginCcpEngine.open(new FileMarginCcpCheckpointStore(paths[1]), g, true);
        let restart = await MarginCcpEngine.open(new FileMarginCcpCheckpointStore(paths[2]), reorder(g), true);
        const initialMoney = g.members.reduce((n, m) => n + BigInt(m.wallet) + m.accounts.reduce((n, a) => n + BigInt(a.marginCash) + BigInt(a.df), BigInt(0)), BigInt(0)) + g.services.reduce((n, s) => n + BigInt(s.sitg1) + BigInt(s.sitg2), BigInt(0));
        assert.equal(jump.snapshot().openingM0, initialMoney);
        await jump.advance(target, frames);
        const checkpoints = literal ? Array.from({ length: target + 1 }, (_, i) => i) : [...new Set([0, 1, 120, 240, 360, 479, 480, 719, 720, 721, 722, 5759, 5760, 5761, 9359, 9360, target].filter(t => t <= target))].sort((a, b) => a - b), snapshots: unknown[] = [];
        let previous = -1, reopens = 0;
        for (const tick of checkpoints) {
            const rows = frames.filter(f => f.tick > previous && f.tick <= tick);
            await step.advance(tick, rows);
            await restart.advance(tick, reorder(rows));
            const a = independentCcpAccounting(step.snapshot()), b = independentCcpAccounting(restart.snapshot());
            assert.equal(wire(a), wire(b));
            if ([0, 480, 720, 5760, target].includes(tick)) {
                snapshots.push({ tick, accounting: a, services: step.publicView(), defaults: step.snapshot().defaults.map(e => ({ id: e.id, remaining: e.remaining, stage: e.stage, layers: e.layers })) });
                restart = await MarginCcpEngine.open(new FileMarginCcpCheckpointStore(paths[2]), reorder(g), true);
                reopens++;
            }
            previous = tick;
        }
        const final = jump.snapshot(), bytes = await Promise.all(paths.map(p => readFile(p, "utf8")));
        assert.equal(wire(final), wire(step.snapshot()));
        assert.equal(wire(final), wire(restart.snapshot()));
        assert.equal(bytes[0], bytes[1]);
        assert.equal(bytes[0], bytes[2]);
        const audit = independentCcpAccounting(final);
        assert.equal(audit.money, initialMoney);
        for (const e of final.defaults) {
            assert(e.remaining >= BigInt(0));
            for (const call of final.fundingCalls.filter(c => c.eventId === e.id && c.kind === "ASSESSMENT")) {
                const requirement = g.members.find(m => m.id === call.memberId)!.accounts.find(a => a.service === call.service)!.targetDf;
                assert(call.amount <= BigInt(requirement));
                assert(call.paid + call.cancelled <= call.amount);
            }
        }
        if (name === "funded-waterfall") {
            assert.equal(final.defaults[0].remaining, BigInt(0));
            assert.equal(final.defaults[0].layers.reduce((n, l) => n + l.amount, BigInt(0)), BigInt(money(800)));
            assert.equal(final.defaults[0].layers.at(-1)!.layer, "ASSESSMENT");
            assert.equal(final.services[0].status, "RECOVERY");
        }
        if (name === "funded-net-vmgh") {
            assert.equal(final.defaults[0].remaining, BigInt(0));
            assert.equal(final.services[0].status, "RECOVERY");
            assert.equal(final.defaults[0].layers.at(-1)!.layer, "VMGH");
            assert.equal(final.defaults[0].layers.at(-1)!.amount, BigInt(money(50)));
        }
        if (name === "exhausted-no-rescue") {
            assert.equal(final.defaults[0].remaining, BigInt(money(420)));
            assert.equal(final.defaults[0].stage, "SHORTFALL");
            assert.equal(final.services.find(s => s.id === "LD")!.status, "CLOSED");
            assert.equal(final.services.find(s => s.id === "OTC")!.status, "OPEN");
            for (const m of g.members)
                assert.equal(final.cash.find(c => c.id === "df/OTC/" + m.id)!.amount, BigInt(money(100)));
        }
        if (name === "overlapping-defaults")
            for (const id of ["s3", "s4", "s5", "s6"])
                assert.equal(final.assessmentHistory.filter(h => h.memberId === id).reduce((n, h) => n + h.amount, BigInt(0)), BigInt(money(200)));
        const report = { name, target, mode: literal ? "literal every tick" : "chunks at margin/default/funding/recovery boundaries; every intervening tick reconstructed", physicalStores: 3, reopens, fullStateEquivalent: true, canonicalCheckpointBytesEquivalent: true, checkpointSha256: hash(bytes[0]), stateSha256: hash(wire(final)), accounting: audit, services: jump.publicView(), defaults: final.defaults.map(e => ({ id: e.id, remaining: e.remaining, stage: e.stage, layers: e.layers, ownerLosses: e.ownerLosses })) };
        await writeFile(join(dir, "RESULT.json"), wire(report) + "\n");
        await writeFile(join(dir, "final-state.json"), wire(final) + "\n");
        await writeFile(join(dir, "independent-snapshots.json"), wire(snapshots) + "\n");
        reports.push(report);
    }
    const short = marginFixture(), shortFrames = marginFrames(short, 40, f => { if (f.tick < 2) {
        f.facts.risks[0].im = money(140);
        if (f.tick === 0)
            f.commands = [{ id: "fund", actor: "owner-d", kind: "POST_MARGIN", memberId: "d", service: "LD", amount: money(40) }];
    }
    else {
        const r = f.facts.risks[0];
        r.im = money(300);
        r.positions = [{ assetId: "listed-future", quantity: f.tick < 5 ? "100" : "80", fairValue: money(100), marginalIm: money(300), expectedCost: money(1), sigmaPpm: 100, expectedTickVolume: "100", marketOpen: f.tick !== 3, opening: f.tick === 4, openingVolume: "50" }];
    } });
    await scenario("margin-next-tick-plans", short, shortFrames, 40, true);
    const funded = marginFixture(), fundedFrames = defaultFrames(funded, 800, 800);
    for (const m of funded.members.filter(m => m.id !== "d"))
        for (const kind of ["assessment", "df"])
            fundedFrames[721].commands.push({ id: "pay-" + m.id + "-" + kind, actor: m.owner, kind: "PAY_CALL", callId: "LD/d/0/" + kind + "/" + m.id, amount: money(100) });
    await scenario("funded-waterfall", funded, fundedFrames, 800);
    const vm = marginFixture(), vmFrames = defaultFrames(vm, 5760, 630);
    vmFrames[5760].facts.vm = [{ service: "LD", fromMemberId: "s1", toMemberId: "s2", amount: money(100) }, { service: "LD", fromMemberId: "s2", toMemberId: "s1", amount: money(40) }, { service: "LD", fromMemberId: "s1", toMemberId: "s3", amount: money(30) }];
    await scenario("funded-net-vmgh", vm, vmFrames, 5760);
    const exhausted = marginFixture(4, true);
    await scenario("exhausted-no-rescue", exhausted, defaultFrames(exhausted, 9360, 1000), 9360);
    const overlaps = marginFixture(7), overlapFrames = marginFrames(overlaps, 800, f => { if (f.tick === 0)
        f.facts.defaults = ["d", "s1", "s2"].map(memberId => ({ memberId, service: "LD", reason: "REGULATOR" })); if (f.tick === 480)
        f.facts.closeouts = ["d", "s1", "s2"].map(memberId => ({ defaultId: "LD/" + memberId + "/0", sourceId: "closeout-" + memberId, loss: money(10000), claims: [{ memberId: "s6", amount: money(10000) }], scores: overlaps.members.filter(m => m.id !== memberId).map((m, i) => ({ memberId: m.id, distance: money(100 - i) })) })); });
    await scenario("overlapping-defaults", overlaps, overlapFrames, 800);
    const report = { ...provenance, finished: execFileSync("date", ["--iso-8601=seconds"], { encoding: "utf8" }).trim(), pass: true, scenarios: reports, limits: ["default-off/unmounted; no V1 activation", "planner emits readonly finite next-tick orders, no duplicate DEGEN execution", "risk/porting/hedging/auctions/tear-up are external readonly producer contracts", "no minting, bank credit, retail/CRY/ESC or automatic recapitalization"] };
    await writeFile(join(out, "RESULT.json"), wire(report) + "\n");
    process.stdout.write(wire(report) + "\n");
}
main().catch(e => { process.stderr.write(String(e) + "\n"); process.exitCode = 1; });
