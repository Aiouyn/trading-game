import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BankingCoreEngine } from "../../src/server/banking-core/engine";
import { coreWire } from "../../src/server/banking-core/boundary";
import type { CoreStore } from "../../src/server/banking-core/model";
import { FileBankingCoreStore } from "../../src/server/banking-core/store";
import { independent, auditSummary, type AuditGenesis } from "./banking-core-audit";

/**
 * Independent rebuild of finished proof stores. Each checkpoint is rebuilt in its own fresh Node process:
 * 1. reopen the original through a read-only store (save throws), which replays genesis + frames and checks the digest;
 * 2. replay the stored genesis and frames from genesis into a new empty store, requiring identical checkpoint bytes;
 * 3. require identical full canonical state and the hashes recorded by the process that produced the store;
 * 4. rebuild every ledger cell from genesis plus the audit log (and per-tick sheet identity where the proof had it).
 */
const sha = (s: string) => createHash("sha256").update(s).digest("hex"), wire = (v: unknown) => JSON.stringify(coreWire(v));
class ReadOnly implements CoreStore {
    constructor(private readonly bytes: string) {}
    async load() { return { revision: sha(this.bytes), payload: JSON.parse(this.bytes) as unknown }; }
    async save(): Promise<string> { throw new Error("READ_ONLY_REBUILD"); }
}
type Expect = { checkpointSha256: string | null; stateSha256: string | null; audit: Record<string, unknown> | null; exact: string[] };

async function child(store: string, out: string, expected: Expect) {
    const started = Date.now(), bytes = await readFile(store, "utf8");
    const p = JSON.parse(bytes) as { version: number; genesis: unknown; frames: unknown[]; target: number; digest: string };
    const reopened = await BankingCoreEngine.open(new ReadOnly(bytes), p.genesis, true);
    const original = reopened.snapshot();
    assert.equal(original.tick, p.target);
    const replayPath = join(out, "replay.json"), replay = await BankingCoreEngine.open(new FileBankingCoreStore(replayPath), p.genesis, true);
    const rebuilt = await replay.advance(p.target, p.frames);
    const replayBytes = await readFile(replayPath, "utf8");
    const stateEqual = wire(rebuilt) === wire(original), bytesEqual = replayBytes === bytes, stateSha256 = sha(wire(rebuilt)), checkpointSha256 = sha(bytes);
    assert(stateEqual, "full state differs after replay from genesis");
    assert(bytesEqual, "checkpoint bytes differ after replay from genesis");
    if (expected.checkpointSha256 !== null) assert.equal(checkpointSha256, expected.checkpointSha256, "checkpoint sha differs from the producing run");
    if (expected.stateSha256 !== null) assert.equal(stateSha256, expected.stateSha256, "state sha differs from the producing run");
    const audit = auditSummary(independent(p.genesis as AuditGenesis, rebuilt, expected.exact));
    if (expected.audit !== null) assert.deepEqual(JSON.parse(wire(audit)), JSON.parse(wire(expected.audit)), "audit reconstruction differs from the producing run");
    const result = { store, pid: process.pid, node: process.version, target: p.target, frames: p.frames.length, bytes: bytes.length, readOnlyReopenDigestOk: true, replayFromGenesisStateEqual: stateEqual, replayFromGenesisCheckpointBytesEqual: bytesEqual, checkpointSha256, stateSha256, matchesProducerHashes: expected.checkpointSha256 !== null, audit, ms: Date.now() - started };
    await writeFile(join(out, "REBUILD.json"), wire(result) + "\n");
}

async function parent(proofs: string, out: string) {
    await mkdir(out);
    const self = fileURLToPath(import.meta.url), rows: unknown[] = [];
    const entries = (await readdir(proofs, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : 1);
    const jobs: { name: string; store: string; expected: Expect }[] = [];
    for (const e of entries) {
        if (e.isDirectory()) {
            const result = JSON.parse(await readFile(join(proofs, e.name, "RESULT.json"), "utf8")) as { checkpointSha256: string; stateSha256: string; audit: Record<string, unknown> & { identityRows: number }; sheets: { bankId: string }[] };
            jobs.push({ name: e.name, store: join(proofs, e.name, "jump.json"), expected: { checkpointSha256: result.checkpointSha256, stateSha256: result.stateSha256, audit: result.audit, exact: result.audit.identityRows > 0 ? result.sheets.map(s => s.bankId) : [] } });
        } else if (e.name.endsWith(".json") && !["RESULT.json", "COVERAGE.json", "CROSS-MODULE-SINGLE-PASS.json"].includes(e.name)) {
            jobs.push({ name: e.name.replace(/\.json$/, ""), store: join(proofs, e.name), expected: { checkpointSha256: null, stateSha256: null, audit: null, exact: [] } });
        }
    }
    for (const job of jobs) {
        const dir = join(out, job.name);
        await mkdir(dir);
        const t = Date.now();
        const r = spawnSync(process.execPath, ["--import", "tsx", self, "--child", job.store, dir, JSON.stringify(job.expected)], { encoding: "utf8", maxBuffer: 1 << 26 });
        await writeFile(join(dir, "child.log"), (r.stdout ?? "") + (r.stderr ?? ""));
        const ok = r.status === 0;
        const rebuild = ok ? JSON.parse(await readFile(join(dir, "REBUILD.json"), "utf8")) as { pid: number; target: number; checkpointSha256: string } : null;
        rows.push({ name: job.name, ok, exit: r.status, signal: r.signal, childPid: rebuild?.pid ?? null, parentPid: process.pid, target: rebuild?.target ?? null, checkpointSha256: rebuild?.checkpointSha256 ?? null, ms: Date.now() - t });
        console.log(ok ? "REBUILT" : "FAILED", job.name, rebuild?.target ?? "", Date.now() - t, "ms");
    }
    const pass = rows.every(r => (r as { ok: boolean }).ok);
    await writeFile(join(out, "RESULT.json"), JSON.stringify({ proofs, pass, stores: rows.length, rows }, null, 2) + "\n");
    if (!pass) process.exitCode = 1;
}

const args = process.argv.slice(2);
if (args[0] === "--child") child(args[1], args[2], JSON.parse(args[3]) as Expect).catch(e => { console.error(e); process.exitCode = 1; });
else if (args.length === 4 && args[0] === "--proofs" && args[2] === "--out" && isAbsolute(args[1]) && isAbsolute(args[3])) parent(args[1], args[3]).catch(e => { console.error(e); process.exitCode = 1; });
else { console.error("Usage: npx tsx tools/proofs/sys-banking-core-rebuild.ts --proofs /abs/proof-dir --out /abs/new-dir"); process.exitCode = 2; }
