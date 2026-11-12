import { describe, it, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { BankingCoreEngine } from "../../../src/server/banking-core/engine";
import { coreWire } from "../../../src/server/banking-core/boundary";
import { FileBankingCoreStore } from "../../../src/server/banking-core/store";
import * as F from "./fixture";

const facts = () => F.creditFacts([F.companyProfile("company", 2000000000)]);
function world() { const g = F.bankingFixture(); g.credit = [F.creditBook("bankA", ["business", "company-wallet"], "other")]; return g; }
const frames = (target: number): F.Frame[] => F.frames(target, f => {
    if (f.tick % 30 === 29) f.banking = F.bankFrame(f.tick);
    if (f.tick === 0) f.credit = [{ bankId: "bankA", frame: F.creditFrame(0, [F.apply("company", 1000, "business", F.term("BULLET"))], facts()) }];
    if (f.tick === 1) f.credit = [{ bankId: "bankA", frame: F.creditFrame(1, [F.accept("company")], facts()) }];
}, () => false);
const wire = (v: unknown) => JSON.stringify(coreWire(v));
/** A pid that certainly belonged to a process that has exited. */
const deadPid = (): number => { const r = spawnSync(process.execPath, ["-e", ""]); expect(r.status).toBe(0); return r.pid!; };
const lockFor = (pid: number, host = hostname()) => JSON.stringify({ pid, host, nonce: "00000000-0000-4000-8000-000000000000" });
const dirs: string[] = [];
async function scratch() { const d = await mkdtemp(join(tmpdir(), "banking-core-store-")); dirs.push(d); return d; }
afterEach(async () => { for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true }); });

describe("banking-core file store crash and lock safety", () => {
    it("recovers a lock and partial temp file left by a dead writer; last committed state stays readable", async () => {
        const dir = await scratch(), path = join(dir, "core.json"), g = world();
        const first = await BankingCoreEngine.open(new FileBankingCoreStore(path), g, true);
        await first.advance(29, frames(29));
        const committed = await readFile(path, "utf8");
        // Crash residue: the dead writer held the lock and had half-written its temp file.
        await writeFile(path + ".lock", lockFor(deadPid()));
        await writeFile(path + ".11111111-1111-4111-8111-111111111111.tmp", committed.slice(0, 100));
        const reopened = await BankingCoreEngine.open(new FileBankingCoreStore(path), g, true);
        expect(wire(reopened.snapshot())).toBe(wire(first.snapshot()));
        expect(await readFile(path, "utf8")).toBe(committed);
        await reopened.advance(59, frames(59).filter(f => f.tick > 29));
        const jump = await BankingCoreEngine.open(new FileBankingCoreStore(join(dir, "jump.json")), g, true);
        await jump.advance(59, frames(59));
        expect(await readFile(path, "utf8")).toBe(await readFile(join(dir, "jump.json"), "utf8"));
        expect((await readdir(dir)).sort()).toEqual(["core.json", "jump.json"]);
    });
    it("never breaks a lock held by a live process, another host, or an unreadable owner", async () => {
        for (const lock of [lockFor(process.pid), lockFor(deadPid(), "other-host"), "", "{\"pid\":"]) {
            const dir = await scratch(), path = join(dir, "core.json"), g = world();
            const e = await BankingCoreEngine.open(new FileBankingCoreStore(path), g, true);
            const committed = await readFile(path, "utf8");
            await writeFile(path + ".lock", lock);
            await expect(e.advance(29, frames(29))).rejects.toThrow("BANKING_CORE_STORE_LOCKED");
            expect(await readFile(path, "utf8")).toBe(committed);
            expect(await readFile(path + ".lock", "utf8")).toBe(lock);
            expect(wire((await BankingCoreEngine.open(new FileBankingCoreStore(path), g, true)).snapshot())).toBe(wire(e.snapshot()));
            expect((await readdir(dir)).sort()).toEqual(["core.json", "core.json.lock"]);
        }
    });
    it("keeps a live contender's staged owner file while removing dead writers' residue", async () => {
        const dir = await scratch(), path = join(dir, "core.json"), g = world();
        const e = await BankingCoreEngine.open(new FileBankingCoreStore(path), g, true);
        const live = path + ".22222222-2222-4222-8222-222222222222.lock-owner", dead = path + ".33333333-3333-4333-8333-333333333333.lock-owner";
        await writeFile(live, lockFor(process.pid)); await writeFile(dead, lockFor(deadPid()));
        await e.advance(29, frames(29));
        expect((await readdir(dir)).sort()).toEqual(["core.json", "core.json.22222222-2222-4222-8222-222222222222.lock-owner"]);
    });
    it("reopening is idempotent: no write, same bytes and mtime, and a no-op advance does not save", async () => {
        const dir = await scratch(), path = join(dir, "core.json"), g = world();
        const e = await BankingCoreEngine.open(new FileBankingCoreStore(path), g, true);
        await e.advance(59, frames(59));
        const bytes = await readFile(path, "utf8"), mtime = (await stat(path)).mtimeMs;
        for (let i = 0; i < 3; i++) {
            const r = await BankingCoreEngine.open(new FileBankingCoreStore(path), F.reorder(g), true);
            expect(wire(r.snapshot())).toBe(wire(e.snapshot()));
            await r.advance(59, []);
            await r.advance(59, frames(59).filter(f => f.tick === 29));
        }
        expect(await readFile(path, "utf8")).toBe(bytes);
        expect((await stat(path)).mtimeMs).toBe(mtime);
        expect(await readdir(dir)).toEqual(["core.json"]);
    });
    it("a stale facade still cannot overwrite a newer committed owner after lock recovery", async () => {
        const dir = await scratch(), path = join(dir, "core.json"), g = world();
        const a = await BankingCoreEngine.open(new FileBankingCoreStore(path), g, true);
        const b = await BankingCoreEngine.open(new FileBankingCoreStore(path), g, true);
        await a.advance(29, frames(29));
        const committed = await readFile(path, "utf8");
        await writeFile(path + ".lock", lockFor(deadPid()));
        await expect(b.advance(29, frames(29))).rejects.toThrow("BANKING_CORE_STALE_STORE");
        expect(await readFile(path, "utf8")).toBe(committed);
        expect(await readdir(dir)).toEqual(["core.json"]);
    });
});
