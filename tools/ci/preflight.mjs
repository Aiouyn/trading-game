#!/usr/bin/env node
/**
 * Local app-preflight: fail-fast phases for .github/workflows/ci.yml app checks only.
 *
 * Examples:
 *   npm run preflight
 *   npm run preflight -- --browser
 *   npm run preflight -- --out /tmp/pf-out
 *   node tools/ci/preflight.mjs --dry-run
 *
 * Evidence under .preflight/ (gitignored). Phase stdout/stderr go to log files (not live-streamed).
 * This is NOT full remote CI / Gatekeeper certification — see NOT_COVERED in phases.mjs.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BROWSER_PHASES,
  CI_NODE_MAJOR,
  CORE_PHASES,
  NOT_COVERED,
  phaseShellLine,
} from "./phases.mjs";

const ROOT = resolve(import.meta.dirname, "../..");

function git(args, cwd) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${(r.stderr || "").trim()}`);
  return r.stdout;
}

function npmVersion() {
  const r = spawnSync("npm", ["-v"], { encoding: "utf8", shell: false });
  return (r.status === 0 ? r.stdout : "").trim() || "unknown";
}

export function runtimeInfo() {
  const node = process.version;
  const npm = npmVersion();
  const localMajor = Number.parseInt(String(node).replace(/^v/, "").split(".")[0], 10);
  return {
    node,
    npm,
    ciNodeMajor: CI_NODE_MAJOR,
    nodeMatchesCiPin: localMajor === CI_NODE_MAJOR,
    note:
      localMajor === CI_NODE_MAJOR
        ? null
        : `Local Node ${node} differs from CI setup-node ${CI_NODE_MAJOR}; results are not an equivalent environment claim.`,
  };
}

/**
 * Content fingerprint: HEAD + tracked diff vs HEAD + untracked non-ignored bytes + node/npm.
 * Does not read gitignored paths (auth stores, .env, etc.).
 */
export function gitCapture(cwd = ROOT) {
  const commit = git(["rev-parse", "HEAD"], cwd).trim();
  const diff = git(["diff", "HEAD", "--binary"], cwd);
  const untrackedList = git(["ls-files", "-o", "--exclude-standard", "-z"], cwd)
    .split("\0")
    .filter(Boolean)
    .sort();
  const runtime = runtimeInfo();
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
      const st = lstatSync(abs);
      // Prefer lstat so we don't follow symlink targets outside the tree.
      if (st.isSymbolicLink() || !st.isFile()) {
        h.update(`META:${st.mode}`);
      } else {
        h.update(readFileSync(abs));
      }
    } catch {
      h.update("MISSING");
    }
    h.update("\0");
  }
  h.update("\n---runtime---\n");
  h.update(runtime.node);
  h.update("\n");
  h.update(runtime.npm);
  const porcelain = git(["status", "--porcelain=v1"], cwd);
  return {
    commit,
    fingerprint: h.digest("hex"),
    dirty: Boolean(diff || untrackedList.length),
    dirtyCount: porcelain.trim() ? porcelain.trimEnd().split("\n").length : 0,
    untrackedCount: untrackedList.length,
    dirtySummary: porcelain,
    runtime,
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

/** Refuse mutating shared-box symlinked installs. */
export function findSymlinkNodeModules(root = ROOT) {
  for (const rel of ["node_modules", "packages/engine/ledger/node_modules"]) {
    const abs = join(root, rel);
    try {
      if (lstatSync(abs).isSymbolicLink()) return abs;
    } catch {
      /* missing ok */
    }
  }
  return null;
}

function plannedRow(phase) {
  return {
    id: phase.id,
    command: phaseShellLine(phase),
    cwd: phase.cwd ?? ".",
    env: phase.env ?? null,
    exit: null,
    signal: null,
    error: null,
    ok: false,
    stdoutLog: null,
    stderrLog: null,
    status: "not_run",
  };
}

/**
 * Top-level e2e field: failed only when the e2e phase executed with nonzero exit.
 * Absent / not_run after fail-fast → not_run (never implied failure).
 */
export function e2eReport(browser, results) {
  if (!browser) return "omitted";
  const r = results.find((x) => x.id === "e2e");
  if (!r || r.status === "not_run") return "not_run";
  return r.ok ? "passed" : "failed";
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

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
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
    if (!entry.ok) {
      for (const rest of phases.slice(i + 1)) results.push(plannedRow(rest));
      return { ok: false, results, failedAt: phase.id };
    }
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
      const err = new Error(`Error: unknown arg: ${a}\n  node tools/ci/preflight.mjs --help`);
      err.code = "USAGE";
      throw err;
    }
  }
  return out;
}

function helpText() {
  return `Local app-preflight (ci.yml app checks only; fail-fast; content-snapshot bound)

Usage:
  node tools/ci/preflight.mjs [options]
  npm run preflight -- [options]

Options:
  --browser     Also run CI e2e phases (otherwise e2e is omitted / incomplete)
  --out <dir>   Evidence directory (required value; default .preflight/<timestamp>)
  --dry-run     Print planned phases only (not a pass; commands not run)
  -h, --help    Show this help

Examples:
  npm run preflight
  npm run preflight -- --browser
  npm run preflight -- --out .preflight/manual
  node tools/ci/preflight.mjs --dry-run

Notes:
  - Narrow scope: mirrors .github/workflows/ci.yml app jobs, not engine/city/macro workflows.
  - Snapshot fingerprints commit + git diff HEAD + untracked non-ignored bytes + node/npm.
  - Phase logs are written to evidence files (not live-streamed to the console).
  - Never claims remote CI / Gatekeeper certification (certified is always false).
  - Core-only success is incomplete vs full CI (e2e omitted). Remote CI still required.
`;
}

function writeEvidence(dir, payload) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "result.json"), JSON.stringify(payload, null, 2) + "\n");
  const lines = [
    `commit ${payload.snapshot.commit}`,
    `fingerprint ${payload.snapshot.fingerprint}`,
    `dirty ${payload.snapshot.dirty}`,
    `runtime node=${payload.snapshot.runtime?.node} npm=${payload.snapshot.runtime?.npm} ciNode=${payload.snapshot.runtime?.ciNodeMajor} match=${payload.snapshot.runtime?.nodeMatchesCiPin}`,
    payload.snapshot.runtime?.note ? `runtimeNote ${payload.snapshot.runtime.note}` : "",
    `scope ${payload.scope}`,
    `phasesOk ${payload.phasesOk}`,
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
    ...(payload.notCovered ?? []).map((x) => `NOT_COVERED ${x}`),
    payload.e2e === "omitted"
      ? "E2E omitted → scope=core_only (incomplete). Not full CI green. Use: npm run preflight -- --browser"
      : "",
    payload.staleError ? `STALE ${payload.staleError}` : "",
    payload.dryRun ? "DRY-RUN: plan only; commands were not executed." : "",
    "NOTE certified is always false — local app-preflight ≠ remote CI / Gatekeeper.",
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
  if (!args.dryRun) {
    const sym = findSymlinkNodeModules(root);
    if (sym) {
      console.error(
        `preflight: refusing to mutate symlink ${sym}\n` +
          `Replace it with a real node_modules directory (or remove the symlink), install deps, then re-run.\n` +
          `Shared-box tip: do not point node_modules at another worktree.`,
      );
      return 1;
    }
    if (!deps.runPhase) {
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
      phasesOk: false,
      certified: false,
      dryRun: true,
      browser: args.browser,
      scope,
      e2e: args.browser ? "planned" : "omitted",
      snapshot: before,
      results: phases.map(plannedRow),
      failedAt: null,
      staleError: null,
      notCovered: NOT_COVERED,
      evidenceDir: outDir,
    };
    writeEvidence(outDir, payload);
    console.log(
      `dry-run plan (uncertified app-preflight) scope=${scope} phases=${phases.map((p) => p.id).join(",")} evidence=${outDir}`,
    );
    return 0;
  }

  console.log(
    `preflight commit=${before.commit} fp=${before.fingerprint.slice(0, 12)} dirty=${before.dirty} scope=${scope} node=${before.runtime.node}`,
  );
  if (before.runtime.note) console.log(`note: ${before.runtime.note}`);
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

  const phasesOk = Boolean(ok && !staleError);
  const payload = {
    ok: phasesOk,
    phasesOk,
    // Never claim remote CI / Gatekeeper certification from a local helper.
    certified: false,
    dryRun: false,
    browser: args.browser,
    scope,
    e2e: e2eReport(args.browser, results),
    snapshot: before,
    results,
    failedAt,
    staleError,
    notCovered: NOT_COVERED,
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
    console.log("preflight core_only phasesOk (incomplete vs full CI: e2e omitted). Remote CI still required. certified=false.");
  } else {
    console.log("preflight core_and_browser phasesOk. Remote CI / Gatekeeper still independently required. certified=false.");
  }
  if (before.dirty) console.log("note: dirty working tree — fingerprint binds local edits; do not treat SHA alone as proof.");
  return 0;
}

const isDirect = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) process.exit(main());
