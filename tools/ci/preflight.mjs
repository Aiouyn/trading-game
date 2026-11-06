#!/usr/bin/env node
/**
 * Local preflight: fail-fast CI phases bound to one working-tree content snapshot.
 *
 * Examples:
 *   npm run preflight
 *   npm run preflight -- --browser
 *   npm run preflight -- --out /tmp/pf-out
 *   node tools/ci/preflight.mjs --dry-run
 *
 * Evidence under .preflight/ (gitignored). Remote CI remains independently required.
 * Core-only success is incomplete vs full CI (e2e omitted).
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BROWSER_PHASES, CORE_PHASES, phaseShellLine } from "./phases.mjs";

const ROOT = resolve(import.meta.dirname, "../..");

function git(args, cwd) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${(r.stderr || "").trim()}`);
  return r.stdout;
}

/**
 * Content fingerprint: HEAD + tracked diff vs HEAD (staged+unstaged) + untracked non-ignored file bytes.
 * Does not read gitignored paths (auth stores, .env, etc.).
 */
export function gitCapture(cwd = ROOT) {
  const commit = git(["rev-parse", "HEAD"], cwd).trim();
  // Combined index+worktree vs HEAD (covers staged and unstaged; renames/deletes/binary markers included).
  const diff = git(["diff", "HEAD", "--binary"], cwd);
  const untrackedList = git(["ls-files", "-o", "--exclude-standard", "-z"], cwd)
    .split("\0")
    .filter(Boolean)
    .sort();
  const h = createHash("sha256");
  h.update(commit);
  h.update("\n---diff---\n");
  h.update(diff);
  h.update("\n---untracked---\n");
  for (const rel of untrackedList) {
    h.update(rel);
    h.update("\0");
    const abs = join(cwd, rel);
    try {
      const st = statSync(abs);
      if (!st.isFile()) {
        h.update(`DIR:${st.mode}`);
      } else {
        h.update(readFileSync(abs));
      }
    } catch {
      h.update("MISSING");
    }
    h.update("\0");
  }
  const porcelain = git(["status", "--porcelain=v1"], cwd);
  return {
    commit,
    fingerprint: h.digest("hex"),
    dirty: Boolean(diff || untrackedList.length),
    dirtyCount: porcelain.trim() ? porcelain.trimEnd().split("\n").length : 0,
    untrackedCount: untrackedList.length,
    dirtySummary: porcelain,
  };
}

export function assertSnapshotUnchanged(before, after) {
  if (before.fingerprint !== after.fingerprint || before.commit !== after.commit) {
    const err = new Error(
      `preflight stale: working tree content changed during run (was ${before.commit.slice(0, 8)} fp=${before.fingerprint.slice(0, 12)}, now ${after.commit.slice(0, 8)} fp=${after.fingerprint.slice(0, 12)})`,
    );
    err.code = "PREFLIGHT_STALE";
    throw err;
  }
}

/**
 * @param {{ phases: import('./phases.mjs').Phase[], runPhase?: Function, cwd?: string, onPhase?: Function, logDir?: string }} opts
 */
export function runPhases({ phases, runPhase, cwd = ROOT, onPhase, logDir }) {
  const results = [];
  const exec =
    runPhase ??
    ((phase) => {
      if (!logDir) throw new Error("logDir required for default runner");
      mkdirSync(logDir, { recursive: true });
      const stdoutLog = join(logDir, `${phase.id}.stdout.log`);
      const stderrLog = join(logDir, `${phase.id}.stderr.log`);
      const outFd = openSync(stdoutLog, "w");
      const errFd = openSync(stderrLog, "w");
      try {
        const r = spawnSync(phase.argv[0], phase.argv.slice(1), {
          cwd: phase.cwd ? resolve(cwd, phase.cwd) : cwd,
          env: { ...process.env, ...(phase.env ?? {}) },
          stdio: ["ignore", outFd, errFd],
          shell: false,
        });
        const status = r.error ? 127 : (r.status ?? (r.signal ? 1 : 1));
        return {
          status,
          signal: r.signal ?? null,
          error: r.error ? String(r.error.message || r.error) : null,
          stdoutLog,
          stderrLog,
        };
      } finally {
        closeSync(outFd);
        closeSync(errFd);
      }
    });

  for (const phase of phases) {
    onPhase?.(phase);
    const out = exec(phase);
    const entry = {
      id: phase.id,
      command: phaseShellLine(phase),
      cwd: phase.cwd ?? ".",
      env: phase.env ?? null,
      exit: out.status,
      signal: out.signal ?? null,
      error: out.error ?? null,
      ok: out.status === 0 && !out.error,
      stdoutLog: out.stdoutLog ?? null,
      stderrLog: out.stderrLog ?? null,
      status: out.status === 0 && !out.error ? "passed" : "failed",
    };
    results.push(entry);
    if (!entry.ok) return { ok: false, results, failedAt: phase.id };
  }
  return { ok: true, results, failedAt: null };
}

export function parseArgs(argv) {
  const out = { browser: false, dryRun: false, outDir: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--browser") out.browser = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--out") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("-")) {
        const err = new Error(
          "Error: --out requires a directory path.\n  node tools/ci/preflight.mjs --out .preflight/manual\n  npm run preflight -- --out /tmp/pf-out",
        );
        err.code = "USAGE";
        throw err;
      }
      out.outDir = v;
    } else {
      const err = new Error(
        `Error: unknown arg: ${a}\n  node tools/ci/preflight.mjs --help`,
      );
      err.code = "USAGE";
      throw err;
    }
  }
  return out;
}

function helpText() {
  return `Local CI preflight (fail-fast, content-snapshot bound)

Usage:
  node tools/ci/preflight.mjs [options]
  npm run preflight -- [options]

Options:
  --browser     Also run CI e2e phases (otherwise e2e is omitted / incomplete)
  --out <dir>   Evidence directory (required value; default .preflight/<timestamp>)
  --dry-run     Print planned phases only (not certified; commands not run)
  -h, --help    Show this help

Examples:
  npm run preflight
  npm run preflight -- --browser
  npm run preflight -- --out .preflight/manual
  node tools/ci/preflight.mjs --dry-run

Notes:
  - Snapshot fingerprints commit + git diff HEAD + untracked non-ignored file bytes.
  - Ignored paths (auth data, .env, node_modules, .preflight) are not read.
  - Core-only success is scope=core_only (incomplete vs full CI). Remote CI still required.
`;
}

function writeEvidence(dir, payload) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "result.json"), JSON.stringify(payload, null, 2) + "\n");
  const lines = [
    `commit ${payload.snapshot.commit}`,
    `fingerprint ${payload.snapshot.fingerprint}`,
    `dirty ${payload.snapshot.dirty}`,
    `scope ${payload.scope}`,
    `certified ${payload.certified}`,
    `dryRun ${Boolean(payload.dryRun)}`,
    `browser ${payload.browser}`,
    `e2e ${payload.e2e}`,
    ...payload.results.map((r) => {
      const tag = r.status === "not_run" ? "PLAN" : r.ok ? "PASS" : "FAIL";
      const extra = [
        r.exit != null ? `exit=${r.exit}` : null,
        r.signal ? `signal=${r.signal}` : null,
        r.error ? `error=${r.error}` : null,
        r.stdoutLog ? `stdout=${r.stdoutLog}` : null,
        r.stderrLog ? `stderr=${r.stderrLog}` : null,
      ]
        .filter(Boolean)
        .join(" ");
      return `${tag} ${r.id} ${extra} :: ${r.command}`;
    }),
    payload.e2e === "omitted"
      ? "E2E omitted → scope=core_only (incomplete). Not full CI green. Use: npm run preflight -- --browser"
      : "",
    payload.staleError ? `STALE ${payload.staleError}` : "",
    payload.dryRun ? "DRY-RUN: not certified; commands were not executed." : "",
  ].filter(Boolean);
  writeFileSync(join(dir, "summary.txt"), lines.join("\n") + "\n");
  if (payload.snapshot.dirtySummary) writeFileSync(join(dir, "dirty.status.txt"), payload.snapshot.dirtySummary);
  return dir;
}

export function main(argv = process.argv.slice(2), deps = {}) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error(e.message);
    return e.code === "USAGE" ? 2 : 1;
  }
  if (args.help) {
    console.log(helpText());
    return 0;
  }

  const root = deps.cwd ?? ROOT;
  if (!deps.runPhase && !args.dryRun) {
    // Broken/env symlinks to other worktrees are not ignored like real node_modules dirs.
    for (const nm of [join(root, "node_modules"), join(root, "packages/engine/ledger/node_modules")]) {
      try {
        if (lstatSync(nm).isSymbolicLink()) rmSync(nm, { force: true });
      } catch { /* missing ok */ }
    }
    if (!existsSync(join(root, "node_modules", ".bin"))) {
      const inst = spawnSync("npm", ["ci"], { cwd: root, stdio: "inherit", shell: false });
      if (inst.status !== 0) {
        console.error("root npm ci failed");
        return 1;
      }
    }
    const ledgerNm = join(root, "packages/engine/ledger/node_modules");
    if (!existsSync(join(ledgerNm, ".bin"))) {
      const inst = spawnSync("npm", ["ci"], {
        cwd: join(root, "packages/engine/ledger"),
        stdio: "inherit",
        shell: false,
      });
      if (inst.status !== 0) {
        console.error("ledger npm ci failed");
        return 1;
      }
    }
  }

  const capture = deps.gitCapture ?? gitCapture;
  const before = capture(root);
  const phases = args.browser ? [...CORE_PHASES, ...BROWSER_PHASES] : [...CORE_PHASES];
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = resolve(root, args.outDir ?? join(".preflight", stamp));
  const logDir = join(outDir, "logs");
  const scope = args.browser ? "core_and_browser" : "core_only";

  if (args.dryRun) {
    const payload = {
      ok: false,
      certified: false,
      dryRun: true,
      browser: args.browser,
      scope,
      e2e: args.browser ? "planned" : "omitted",
      snapshot: before,
      results: phases.map((p) => ({
        id: p.id,
        command: phaseShellLine(p),
        cwd: p.cwd ?? ".",
        env: p.env ?? null,
        exit: null,
        ok: false,
        status: "not_run",
        stdoutLog: null,
        stderrLog: null,
      })),
      failedAt: null,
      staleError: null,
      evidenceDir: outDir,
    };
    writeEvidence(outDir, payload);
    console.log(`dry-run plan (uncertified) scope=${scope} phases=${phases.map((p) => p.id).join(",")} evidence=${outDir}`);
    return 0;
  }

  console.log(
    `preflight commit=${before.commit} fp=${before.fingerprint.slice(0, 12)} dirty=${before.dirty} scope=${scope}`,
  );
  const { ok, results, failedAt } = runPhases({
    phases,
    cwd: root,
    runPhase: deps.runPhase,
    logDir,
    onPhase: (p) => console.log(`== ${p.id}: ${phaseShellLine(p)}`),
  });

  let staleError = null;
  try {
    assertSnapshotUnchanged(before, capture(root));
  } catch (e) {
    staleError = e.message;
  }

  const certified = Boolean(ok && !staleError);
  const payload = {
    ok: certified,
    certified,
    dryRun: false,
    browser: args.browser,
    scope,
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
    const failed = results.find((r) => r.id === failedAt);
    if (failed?.error) console.error(`preflight failed at ${failedAt}: ${failed.error}`);
    else if (failed?.signal) console.error(`preflight failed at ${failedAt}: signal ${failed.signal}`);
    else console.error(`preflight failed at ${failedAt} exit=${failed?.exit}`);
    if (failed?.stderrLog) console.error(`stderr log: ${failed.stderrLog}`);
    return 1;
  }
  if (scope === "core_only") {
    console.log("preflight core_only complete (incomplete vs full CI: e2e omitted). Remote CI still required.");
  } else {
    console.log("preflight core_and_browser complete. Remote CI still independently required.");
  }
  return 0;
}

const isDirect = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) process.exit(main());
