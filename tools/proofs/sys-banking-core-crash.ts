import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { watch } from "node:fs";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BankingCoreEngine } from "../../src/server/banking-core/engine";
import { coreWire } from "../../src/server/banking-core/boundary";
import { FileBankingCoreStore } from "../../src/server/banking-core/store";
import * as F from "../../tests/unit/banking-core/fixture";

/**
 * Crash proof for the banking-core file store. A child process reopens a committed checkpoint A and advances to B;
 * the parent SIGKILLs it at a chosen point (on lock creation plus a delay, on temp creation, or at a random time).
 * After every kill the store must hold exactly A or B, reopen without writing, and then reach B byte for byte.
 */
const sha = (s: string) => createHash("sha256").update(s).digest("hex"), wire = (v: unknown) => JSON.stringify(coreWire(v));
const A = 7199, B = 14399;
const facts = () => F.creditFacts([F.companyProfile("company", 2000000000)]);
function world() { const g = F.bankingFixture(); g.credit = [F.creditBook("bankA", ["business", "company-wallet"], "other")]; return g; }
const frames = (target: number): F.Frame[] => F.frames(target, f => {
    if (f.tick % 30 === 29) f.banking = F.bankFrame(f.tick);
    if (f.tick % 720 === 719) f.credit = [{ bankId: "bankA", frame: F.creditFrame(f.tick, [], facts()) }];
    if (f.tick === 0) f.credit = [{ bankId: "bankA", frame: F.creditFrame(0, [F.apply("company", 1000, "business", F.term("BULLET"))], facts()) }];
    if (f.tick === 1) f.credit = [{ bankId: "bankA", frame: F.creditFrame(1, [F.accept("company")], facts()) }];
}, () => false);

async function child(path: string) {
    const e = await BankingCoreEngine.open(new FileBankingCoreStore(path), world(), true);
    process.stdout.write("OPENED\n");
    await e.advance(B, frames(B).filter(f => f.tick > A));
    process.stdout.write("COMMITTED\n");
}

type Trigger = { kind: "lock" | "tmp" | "time"; delayMs: number };
function runTrial(self: string, dir: string, path: string, trigger: Trigger): Promise<{ killed: boolean; signal: string | null; exit: number | null; sawLock: boolean; sawTmp: boolean; childMs: number }> {
    return new Promise(resolve => {
        let sawLock = false, sawTmp = false, killed = false;
        const started = Date.now(), timers: NodeJS.Timeout[] = [], later = (ms: number) => { timers.push(setTimeout(kill, ms)); };
        const c: ChildProcess = spawn(process.execPath, ["--import", "tsx", self, "--child", path], { stdio: ["ignore", "pipe", "pipe"] });
        const kill = () => { if (!killed && c.exitCode === null) { killed = c.kill("SIGKILL"); } };
        if (trigger.kind === "time") later(trigger.delayMs);
        c.stdout!.resume(); c.stderr!.pipe(process.stderr);
        const w = watch(dir, (_, name) => {
            const n = String(name ?? "");
            if (n.endsWith(".lock")) { if (!sawLock && trigger.kind === "lock") later(trigger.delayMs); sawLock = true; }
            if (n.endsWith(".tmp")) { if (!sawTmp && trigger.kind === "tmp") later(trigger.delayMs); sawTmp = true; }
        });
        c.on("exit", (exit, signal) => { w.close(); for (const t of timers) clearTimeout(t); resolve({ killed, signal, exit, sawLock, sawTmp, childMs: Date.now() - started }); });
    });
}

async function parent(out: string, trials: number) {
    await mkdir(out);
    const self = fileURLToPath(import.meta.url), g = world();
    const refDir = join(out, "reference"); await mkdir(refDir);
    const ra = await BankingCoreEngine.open(new FileBankingCoreStore(join(refDir, "A.json")), g, true); await ra.advance(A, frames(A));
    const rb = await BankingCoreEngine.open(new FileBankingCoreStore(join(refDir, "B.json")), g, true); await rb.advance(B, frames(B));
    const bytesA = await readFile(join(refDir, "A.json"), "utf8"), bytesB = await readFile(join(refDir, "B.json"), "utf8");
    // Calibrate: an unkilled child run, so time-based kills spread across the whole child lifetime.
    const cal = join(out, "calibration"); await mkdir(cal); await copyFile(join(refDir, "A.json"), join(cal, "core.json"));
    const calibration = await runTrial(self, cal, join(cal, "core.json"), { kind: "time", delayMs: 1e9 });
    assert.equal(calibration.exit, 0); assert.equal(await readFile(join(cal, "core.json"), "utf8"), bytesB);
    const plan: Trigger[] = [];
    for (let i = 0; i < trials; i++) {
        const r = i % 3;
        plan.push(r === 0 ? { kind: "lock", delayMs: [0, 0, 1, 2, 3, 5, 8, 13, 21, 34][Math.floor(i / 3) % 10] } : r === 1 ? { kind: "tmp", delayMs: [0, 0, 0, 1, 1, 2, 3, 4, 6, 9][Math.floor(i / 3) % 10] } : { kind: "time", delayMs: Math.floor(((i * 7919) % 1000) / 1000 * calibration.childMs) });
    }
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < plan.length; i++) {
        const dir = join(out, "trial-" + String(i).padStart(3, "0")), path = join(dir, "core.json");
        await mkdir(dir); await copyFile(join(refDir, "A.json"), path);
        const r = await runTrial(self, dir, path, plan[i]);
        const residue = (await readdir(dir)).filter(n => n !== "core.json").sort();
        const tmpSizes = await Promise.all(residue.filter(n => n.endsWith(".tmp")).map(async n => (await stat(join(dir, n))).size));
        const committed = await readFile(path, "utf8");
        const which = committed === bytesA ? "A" : committed === bytesB ? "B" : "OTHER";
        assert.notEqual(which, "OTHER", "committed checkpoint must be exactly A or B");
        // Reopen is read-only and idempotent; the last committed state is readable.
        const mtime = (await stat(path)).mtimeMs;
        for (let k = 0; k < 2; k++) {
            const e = await BankingCoreEngine.open(new FileBankingCoreStore(path), F.reorder(g), true);
            assert.equal(e.snapshot().tick, which === "A" ? A : B);
            assert.equal(wire(e.snapshot()), wire((which === "A" ? ra : rb).snapshot()));
        }
        assert.equal(await readFile(path, "utf8"), committed); assert.equal((await stat(path)).mtimeMs, mtime);
        // Resume: the next writer recovers the dead lock and orphans, then reaches B byte for byte.
        const resume = await BankingCoreEngine.open(new FileBankingCoreStore(path), g, true);
        await resume.advance(B, frames(B).filter(f => f.tick > resume.snapshot().tick));
        if (which === "B" && residue.some(n => n.endsWith(".lock"))) {
            // Already at B: advance is a no-op, so prove a later write still recovers the dead lock.
            await resume.advance(B + 1, []);
            const again = await BankingCoreEngine.open(new FileBankingCoreStore(join(dir, "check-B1.json")), g, true); await again.advance(B + 1, frames(B));
            assert.equal(await readFile(path, "utf8"), await readFile(join(dir, "check-B1.json"), "utf8"));
        } else assert.equal(await readFile(path, "utf8"), bytesB);
        const after = (await readdir(dir)).filter(n => n !== "core.json" && n !== "check-B1.json");
        assert.deepEqual(after, [], "no lock or temp residue after the next write");
        const row = { trial: i, trigger: plan[i], killed: r.killed, signal: r.signal, exit: r.exit, childMs: r.childMs, sawLock: r.sawLock, sawTmp: r.sawTmp, residue, tmpSizes, committedAfterKill: which, reopenReadOnlyIdempotent: true, resumedToB: true, residueAfterResume: after.length };
        rows.push(row);
        console.log(JSON.stringify(row));
    }
    const killed = rows.filter(r => r.killed), count = (f: (r: Record<string, unknown>) => boolean) => killed.filter(f).length;
    const summary = { note: "a killed temp file is never renamed; its size is recorded per row (a short write is covered by tests/unit/banking-core/store-crash.test.ts)", A, B, bytesA: bytesA.length, bytesB: bytesB.length, shaA: sha(bytesA), shaB: sha(bytesB), calibrationChildMs: calibration.childMs, trials: rows.length, killed: killed.length, committedA: count(r => r.committedAfterKill === "A"), committedB: count(r => r.committedAfterKill === "B"), killedHoldingLock: count(r => (r.residue as string[]).some(n => n.endsWith(".lock"))), killedWithUnrenamedTmp: count(r => (r.residue as string[]).some(n => n.endsWith(".tmp"))), killedAfterRenameBeforeUnlock: count(r => r.committedAfterKill === "B" && (r.residue as string[]).some(n => n.endsWith(".lock"))), other: 0, pass: true };
    await writeFile(join(out, "RESULT.json"), JSON.stringify({ summary, rows }, null, 2) + "\n");
    console.log("SUMMARY", JSON.stringify(summary));
}

const args = process.argv.slice(2);
if (args[0] === "--child") child(args[1]).catch(e => { console.error(e); process.exitCode = 1; });
else if (args[0] === "--out" && isAbsolute(args[1] ?? "") && (args[2] === undefined || args[2] === "--trials")) parent(args[1], Number(args[3] ?? 60)).catch(e => { console.error(e); process.exitCode = 1; });
else { console.error("Usage: npx tsx tools/proofs/sys-banking-core-crash.ts --out /abs/new-dir [--trials N]"); process.exitCode = 2; }
