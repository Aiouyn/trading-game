#!/usr/bin/env node
/**
 * Local preflight: fail-fast CI phases bound to one working-tree snapshot.
 * Usage: node tools/ci/preflight.mjs [--browser] [--out <dir>] [--dry-run]
 * Evidence under .preflight/ (gitignored). Remote CI remains independently required.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BROWSER_PHASES, CORE_PHASES, phaseShellLine } from "./phases.mjs";

const ROOT = resolve(import.meta.dirname, "../..");

export function gitCapture(cwd = ROOT) {
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" });
  if (head.status !== 0) throw new Error(`git rev-parse failed: ${head.stderr}`);
  const porcelain = spawnSync("git", ["status", "--porcelain=v1"], { cwd, encoding: "utf8" });
  if (porcelain.status !== 0) throw new Error(`git status failed: ${porcelain.stderr}`);
  const commit = head.stdout.trim();
  const dirty = porcelain.stdout;
  const fingerprint = createHash("sha256").update(`${commit}\n${dirty}`).digest("hex");
  return { commit, dirty, fingerprint, dirtyCount: dirty.trim() ? dirty.trimEnd().split("\n").length : 0 };
}

export function assertSnapshotUnchanged(before, after) {
  if (before.fingerprint !== after.fingerprint) {
    const err = new Error(
      `preflight stale: tree changed during run (was ${before.commit.slice(0, 8)} dirty=${before.dirtyCount}, now ${after.commit.slice(0, 8)} dirty=${after.dirtyCount})`,
    );
    err.code = "PREFLIGHT_STALE";
    throw err;
  }
}

/**
 * @param {{ phases: import('./phases.mjs').Phase[], runPhase?: Function, cwd?: string, onPhase?: Function }} opts
 * @returns {{ ok: boolean, results: object[], failedAt: string | null }}
 */
export function runPhases({ phases, runPhase, cwd = ROOT, onPhase }) {
  const results = [];
  const exec = runPhase ?? ((phase) => {
    const r = spawnSync(phase.argv[0], phase.argv.slice(1), {
      cwd: phase.cwd ? resolve(cwd, phase.cwd) : cwd,
      env: { ...process.env, ...(phase.env ?? {}) },
      encoding: "utf8",
      shell: false,
    });
    return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  });
  for (const phase of phases) {
    onPhase?.(phase);
    const out = exec(phase);
    const entry = {
      id: phase.id,
      command: phaseShellLine(phase),
      cwd: phase.cwd ?? ".",
      exit: out.status,
      ok: out.status === 0,
    };
    results.push(entry);
    if (!entry.ok) return { ok: false, results, failedAt: phase.id };
  }
  return { ok: true, results, failedAt: null };
}

function parseArgs(argv) {
  const out = { browser: false, dryRun: false, outDir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--browser") out.browser = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--out") out.outDir = argv[++i];
    else if (a === "--help" || a === "-h") out.help = true;
    else throw new Error(`unknown arg: ${a}`);
  }
  return out;
}

function writeEvidence(dir, payload) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "result.json"), JSON.stringify(payload, null, 2) + "\n");
  const lines = [
    `commit ${payload.snapshot.commit}`,
    `fingerprint ${payload.snapshot.fingerprint}`,
    `dirtyCount ${payload.snapshot.dirtyCount}`,
    `browser ${payload.browser}`,
    `ok ${payload.ok}`,
    ...payload.results.map((r) => `${r.ok ? "PASS" : "FAIL"} ${r.id} exit=${r.exit} :: ${r.command}`),
    ...(payload.e2e === "omitted"
      ? ["E2E omitted (pass --browser to run). Omitted is not a pass; remote CI e2e still required."]
      : []),
    payload.staleError ? `STALE ${payload.staleError}` : "",
  ].filter(Boolean);
  writeFileSync(join(dir, "summary.txt"), lines.join("\n") + "\n");
  if (payload.snapshot.dirty) writeFileSync(join(dir, "dirty.patch.txt"), payload.snapshot.dirty);
  return dir;
}

export function main(argv = process.argv.slice(2), deps = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log("Usage: node tools/ci/preflight.mjs [--browser] [--out <dir>] [--dry-run]");
    return 0;
  }
  const capture = deps.gitCapture ?? gitCapture;
  const before = capture();
  const phases = args.browser ? [...CORE_PHASES, ...BROWSER_PHASES] : [...CORE_PHASES];
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = resolve(ROOT, args.outDir ?? join(".preflight", stamp));

  if (args.dryRun) {
    const payload = {
      ok: true,
      dryRun: true,
      browser: args.browser,
      e2e: args.browser ? "included" : "omitted",
      snapshot: before,
      results: phases.map((p) => ({ id: p.id, command: phaseShellLine(p), cwd: p.cwd ?? ".", exit: 0, ok: true })),
      staleError: null,
    };
    writeEvidence(outDir, payload);
    console.log(`dry-run phases=${phases.map((p) => p.id).join(",")} evidence=${outDir}`);
    return 0;
  }

  // ledger job installs its own deps in CI; ensure once locally if missing
  const ledgerNm = join(ROOT, "packages/engine/ledger/node_modules");
  if (!existsSync(ledgerNm)) {
    const inst = spawnSync("npm", ["ci"], { cwd: join(ROOT, "packages/engine/ledger"), encoding: "utf8" });
    if (inst.status !== 0) {
      console.error("ledger npm ci failed", inst.stderr);
      return 1;
    }
  }

  console.log(`preflight commit=${before.commit} fingerprint=${before.fingerprint.slice(0, 12)} dirty=${before.dirtyCount} browser=${args.browser}`);
  const { ok, results, failedAt } = runPhases({
    phases,
    runPhase: deps.runPhase,
    onPhase: (p) => console.log(`== ${p.id}: ${phaseShellLine(p)}`),
  });

  let staleError = null;
  try {
    assertSnapshotUnchanged(before, capture());
  } catch (e) {
    staleError = e.message;
  }

  const payload = {
    ok: ok && !staleError,
    browser: args.browser,
    e2e: args.browser ? (results.find((r) => r.id === "e2e")?.ok ? "passed" : "failed") : "omitted",
    snapshot: before,
    results,
    failedAt,
    staleError,
    evidenceDir: outDir,
  };
  writeEvidence(outDir, payload);
  console.log(`evidence ${outDir}`);
  if (staleError) {
    console.error(staleError);
    return 2;
  }
  if (!ok) {
    console.error(`preflight failed at ${failedAt}`);
    return 1;
  }
  if (!args.browser) {
    console.log("note: e2e omitted (not a pass). Use --browser for local e2e; remote CI e2e still required.");
  }
  console.log("preflight ok");
  return 0;
}

const isDirect = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) process.exit(main());
