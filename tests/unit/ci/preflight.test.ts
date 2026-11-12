import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  BROWSER_PHASES,
  CI_CONDITIONAL_NOTE,
  CI_NODE_MAJOR,
  CORE_PHASES,
  NOT_COVERED,
  localPhaseCommands,
  phaseShellLine,
  unconditionalCiRunCommands,
} from "../../../tools/ci/phases.mjs";
import {
  assertSnapshotUnchanged,
  e2eReport,
  findSymlinkNodeModules,
  gitCapture,
  main,
  parseArgs,
  runPhases,
} from "../../../tools/ci/preflight.mjs";

const ROOT = join(import.meta.dirname, "../../..");
const CI_YML = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout;
}

function tempRepo() {
  const dir = mkdtempSync(join(tmpdir(), "pf-snap-"));
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "pf@test"]);
  git(dir, ["config", "user.name", "pf"]);
  writeFileSync(join(dir, "tracked.txt"), "v1\n");
  git(dir, ["add", "tracked.txt"]);
  git(dir, ["commit", "-m", "init"]);
  return dir;
}

describe("preflight phases ↔ CI parity (bidirectional)", () => {
  it("CORE_PHASES ids and commands match the known CI checklist (hardcoded)", () => {
    expect(CORE_PHASES.map((p) => p.id)).toEqual([
      "lint",
      "lesson13",
      "ledger-no-dup",
      "typecheck",
      "build",
      "check-hooks",
      "test",
      "formal-money",
      "skipped-checks",
      "pw-install",
      "route-budget",
    ]);
    expect(phaseShellLine(CORE_PHASES[0]!)).toBe("npm run lint");
    expect(CORE_PHASES.find((p) => p.id === "ledger-no-dup")!.cwd).toBe("packages/engine/ledger");
  });

  it("each local phase argv appears as a CI run step; ledger cwd and e2e env match", () => {
    for (const p of CORE_PHASES) {
      expect(CI_YML, p.id).toContain(`run: ${phaseShellLine(p)}`);
    }
    expect(CI_YML).toMatch(/ledger-no-dup:[\s\S]*working-directory:\s*packages\/engine\/ledger/);
    const e2e = BROWSER_PHASES[0]!;
    expect(CI_YML).toContain(`run: ${phaseShellLine(e2e)}`);
    expect(e2e.env).toEqual({ CI: "1", SHOTS: "1" });
    expect(CI_YML).toMatch(/npx playwright test[\s\S]*env:[\s\S]*CI:\s*"1"[\s\S]*SHOTS:\s*"1"/);
  });

  it("every unconditional ci.yml run step is covered by a local phase (CI→phases)", () => {
    const required = unconditionalCiRunCommands(CI_YML);
    expect(required.length).toBeGreaterThan(5);
    const local = new Set(localPhaseCommands());
    for (const cmd of required) {
      expect(local.has(cmd), `CI run not in local phases: ${cmd}`).toBe(true);
    }
    // Adding a new unconditional run in ci.yml without a phase must fail this test.
    const withExtra = CI_YML + "\n      - run: npm run invented-check\n";
    const after = unconditionalCiRunCommands(withExtra);
    expect(after).toContain("npm run invented-check");
    expect(local.has("npm run invented-check")).toBe(false);
  });

  it("documents CI-conditional check:paths and remote NOT_COVERED workflows", () => {
    expect(CI_YML).toMatch(/check:paths/);
    expect(CI_YML).toMatch(/startsWith\(github\.head_ref, 'v3\/quay-shell'\)/);
    expect(CI_CONDITIONAL_NOTE).toMatch(/check:paths/);
    expect(CORE_PHASES.some((p) => phaseShellLine(p).includes("check:paths"))).toBe(false);
    expect(unconditionalCiRunCommands(CI_YML).some((c) => c.includes("check:paths"))).toBe(false);
    expect(NOT_COVERED.some((x) => x.includes("engine.yml"))).toBe(true);
    expect(NOT_COVERED.some((x) => x.includes("city.yml"))).toBe(true);
    expect(CI_NODE_MAJOR).toBe(22);
  });
});

describe("content snapshot (real temp git repo)", () => {
  it("clean unchanged → same fingerprint", () => {
    const dir = tempRepo();
    const a = gitCapture(dir);
    const b = gitCapture(dir);
    expect(a.dirty).toBe(false);
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.runtime.node).toMatch(/^v/);
    expect(a.runtime.ciNodeMajor).toBe(22);
    expect(() => assertSnapshotUnchanged(a, b)).not.toThrow();
  });

  it("editing an already-dirty tracked file changes fingerprint (stale)", () => {
    const dir = tempRepo();
    writeFileSync(join(dir, "tracked.txt"), "dirty-1\n");
    const before = gitCapture(dir);
    expect(before.dirty).toBe(true);
    writeFileSync(join(dir, "tracked.txt"), "dirty-2\n");
    const after = gitCapture(dir);
    expect(after.fingerprint).not.toBe(before.fingerprint);
    expect(() => assertSnapshotUnchanged(before, after)).toThrow(/stale/);
  });

  it("editing untracked file content changes fingerprint (stale)", () => {
    const dir = tempRepo();
    writeFileSync(join(dir, "scratch.txt"), "a\n");
    const before = gitCapture(dir);
    expect(before.untrackedCount).toBe(1);
    writeFileSync(join(dir, "scratch.txt"), "b\n");
    const after = gitCapture(dir);
    expect(after.fingerprint).not.toBe(before.fingerprint);
    expect(() => assertSnapshotUnchanged(before, after)).toThrow(/stale/);
  });

  it("does not fingerprint gitignored path contents", () => {
    const dir = tempRepo();
    writeFileSync(join(dir, ".gitignore"), "secret.local\n");
    git(dir, ["add", ".gitignore"]);
    git(dir, ["commit", "-m", "ignore"]);
    writeFileSync(join(dir, "secret.local"), "one\n");
    const a = gitCapture(dir);
    writeFileSync(join(dir, "secret.local"), "two\n");
    const b = gitCapture(dir);
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("ignored ledger node_modules directory does not change fingerprint after create", () => {
    const dir = tempRepo();
    writeFileSync(join(dir, ".gitignore"), "node_modules/\n");
    git(dir, ["add", ".gitignore"]);
    git(dir, ["commit", "-m", "ignore-nm"]);
    const before = gitCapture(dir);
    mkdirSync(join(dir, "node_modules", ".bin"), { recursive: true });
    writeFileSync(join(dir, "node_modules", ".bin", "x"), "x");
    const after = gitCapture(dir);
    expect(after.fingerprint).toBe(before.fingerprint);
  });
});

describe("runner CLI contracts", () => {
  it("fail-fast keeps executed rows, marks remaining planned phases not_run (no later exec)", () => {
    const phases = [
      { id: "lint", argv: ["true"] },
      { id: "ledger-no-dup", argv: ["false"] },
      { id: "typecheck", argv: ["true"] },
      { id: "e2e", argv: ["true"] },
    ];
    let execCount = 0;
    const { ok, results, failedAt } = runPhases({
      phases,
      runPhase: (phase: { id: string }) => {
        execCount += 1;
        return {
          status: phase.id === "ledger-no-dup" ? 1 : 0,
          signal: null,
          error: phase.id === "ledger-no-dup" ? "boom" : null,
          stdoutLog: `/tmp/${phase.id}.out`,
          stderrLog: `/tmp/${phase.id}.err`,
        };
      },
    });
    expect(ok).toBe(false);
    expect(failedAt).toBe("ledger-no-dup");
    expect(execCount).toBe(2);
    expect(results.map((r) => r.id)).toEqual(["lint", "ledger-no-dup", "typecheck", "e2e"]);
    expect(results[2]!.status).toBe("not_run");
    expect(results[3]!.status).toBe("not_run");
    expect(e2eReport(true, results)).toBe("not_run");
  });

  it("browser fail at pw-install: e2e top-level not_run (not failed), route-budget+e2e rows present", () => {
    const dir = tempRepo();
    const out = join(dir, "evidence-browser-fail");
    mkdirSync(out, { recursive: true });
    const code = main(["--browser", "--out", out], {
      cwd: dir,
      gitCapture: () => gitCapture(dir),
      runPhase: (phase: { id: string }) => ({
        status: phase.id === "pw-install" ? 1 : 0,
        signal: null,
        error: phase.id === "pw-install" ? "simulated" : null,
        stdoutLog: join(out, `${phase.id}.out`),
        stderrLog: join(out, `${phase.id}.err`),
      }),
    });
    expect(code).toBe(1);
    const result = JSON.parse(readFileSync(join(out, "result.json"), "utf8"));
    expect(result.failedAt).toBe("pw-install");
    expect(result.e2e).toBe("not_run");
    expect(result.certified).toBe(false);
    expect(result.phasesOk).toBe(false);
    const byId = Object.fromEntries(result.results.map((r: { id: string; status: string }) => [r.id, r.status]));
    expect(byId["pw-install"]).toBe("failed");
    expect(byId["route-budget"]).toBe("not_run");
    expect(byId["e2e"]).toBe("not_run");
  });

  it("default runPhases exec: first tiny command fails → remaining not_run, no later exec", () => {
    const logDir = mkdtempSync(join(tmpdir(), "pf-real-"));
    let later = false;
    const { ok, results, failedAt } = runPhases({
      phases: [
        { id: "boom", argv: ["node", "-e", "process.exit(7)"] },
        { id: "later", argv: ["node", "-e", "require('fs').writeFileSync(process.env.MARK,'1')"] },
      ],
      logDir,
      onPhase: (p: { id: string }) => {
        if (p.id === "later") later = true;
      },
    });
    expect(ok).toBe(false);
    expect(failedAt).toBe("boom");
    expect(later).toBe(false); // onPhase still called? Actually onPhase is called before exec for each - wait, we return before later iteration so onPhase('later') should NOT be called
    expect(results.map((r) => [r.id, r.status, r.exit])).toEqual([
      ["boom", "failed", 7],
      ["later", "not_run", null],
    ]);
  });

  it("dry-run is uncertified: ok false, statuses not_run, not usable as pass", () => {
    const dir = tempRepo();
    const out = join(dir, "evidence");
    const code = main(["--dry-run", "--out", out], { cwd: dir, gitCapture: () => gitCapture(dir) });
    expect(code).toBe(0);
    const result = JSON.parse(readFileSync(join(out, "result.json"), "utf8"));
    expect(result.dryRun).toBe(true);
    expect(result.certified).toBe(false);
    expect(result.phasesOk).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.scope).toBe("core_only");
    expect(result.e2e).toBe("omitted");
    expect(result.notCovered?.length).toBeGreaterThan(0);
    expect(result.results.every((r: { status: string; ok: boolean }) => r.status === "not_run" && r.ok === false)).toBe(true);
  });

  it("--out without value exits nonzero with usage error", () => {
    expect(() => parseArgs(["--out"])).toThrow(/--out requires/);
    const code = main(["--out"]);
    expect(code).toBe(2);
  });

  it("core-only mocked pass: phasesOk true but certified always false", () => {
    const dir = tempRepo();
    const out = join(dir, "evidence2");
    mkdirSync(out, { recursive: true });
    const code = main(["--out", out], {
      cwd: dir,
      gitCapture: () => gitCapture(dir),
      runPhase: (phase: { id: string }) => ({
        status: 0,
        signal: null,
        error: null,
        stdoutLog: join(out, `${phase.id}.stdout.log`),
        stderrLog: join(out, `${phase.id}.stderr.log`),
      }),
    });
    expect(code).toBe(0);
    const result = JSON.parse(readFileSync(join(out, "result.json"), "utf8"));
    expect(result.phasesOk).toBe(true);
    expect(result.certified).toBe(false);
    expect(result.scope).toBe("core_only");
    expect(result.e2e).toBe("omitted");
    expect(result.snapshot.runtime.node).toBeTruthy();
  });

  it("dirty tree with mocked pass still certified=false", () => {
    const dir = tempRepo();
    writeFileSync(join(dir, "ADV.txt"), "dirty\n");
    const out = join(dir, "evidence-dirty");
    mkdirSync(out, { recursive: true });
    const code = main(["--out", out], {
      cwd: dir,
      gitCapture: () => gitCapture(dir),
      runPhase: () => ({ status: 0, signal: null, error: null, stdoutLog: null, stderrLog: null }),
    });
    expect(code).toBe(0);
    const result = JSON.parse(readFileSync(join(out, "result.json"), "utf8"));
    expect(result.snapshot.dirty).toBe(true);
    expect(result.phasesOk).toBe(true);
    expect(result.certified).toBe(false);
  });

  it("browser preflight removes repo .data immediately before e2e, and not earlier", () => {
    const dir = tempRepo();
    // Same rule as the real checkout: .data is gitignored, so removing it must not look like a content change.
    writeFileSync(join(dir, ".gitignore"), ".data/\n");
    const dataFile = join(dir, ".data", "market", "storm-world.json");
    mkdirSync(join(dir, ".data", "market"), { recursive: true });
    writeFileSync(dataFile, "{}\n");
    const out = join(dir, "evidence-fresh-data");
    mkdirSync(out, { recursive: true });
    const presentAt: Record<string, boolean> = {};
    const code = main(["--browser", "--out", out], {
      cwd: dir,
      gitCapture: () => gitCapture(dir),
      runPhase: (phase: { id: string }) => {
        presentAt[phase.id] = existsSync(dataFile);
        return {
          status: 0,
          signal: null,
          error: null,
          stdoutLog: join(out, `${phase.id}.out`),
          stderrLog: join(out, `${phase.id}.err`),
        };
      },
    });
    expect(code).toBe(0);
    expect(presentAt["test"]).toBe(true);
    expect(presentAt["route-budget"]).toBe(true);
    expect(presentAt["e2e"]).toBe(false);
    expect(existsSync(join(dir, ".data"))).toBe(false);
  });

  it("core-only preflight and a browser dry-run leave an existing .data directory in place", () => {
    const dir = tempRepo();
    writeFileSync(join(dir, ".gitignore"), ".data/\n");
    const dataFile = join(dir, ".data", "auth", "store.json");
    mkdirSync(join(dir, ".data", "auth"), { recursive: true });
    writeFileSync(dataFile, "{}\n");
    const coreOut = join(dir, "evidence-keep-data");
    mkdirSync(coreOut, { recursive: true });
    const core = main(["--out", coreOut], {
      cwd: dir,
      gitCapture: () => gitCapture(dir),
      runPhase: () => ({ status: 0, signal: null, error: null, stdoutLog: null, stderrLog: null }),
    });
    expect(core).toBe(0);
    expect(existsSync(dataFile)).toBe(true);
    const dryOut = join(dir, "evidence-dry-data");
    const dry = main(["--dry-run", "--browser", "--out", dryOut], {
      cwd: dir,
      gitCapture: () => gitCapture(dir),
    });
    expect(dry).toBe(0);
    expect(existsSync(dataFile)).toBe(true);
  });

  it("refuses symlinked node_modules without deleting it", () => {
    const dir = tempRepo();
    const target = mkdtempSync(join(tmpdir(), "pf-nm-target-"));
    mkdirSync(join(target, ".bin"), { recursive: true });
    symlinkSync(target, join(dir, "node_modules"));
    expect(findSymlinkNodeModules(dir)).toBe(join(dir, "node_modules"));
    const out = join(dir, "evidence-sym");
    const code = main(["--out", out], {
      cwd: dir,
      gitCapture: () => gitCapture(dir),
      runPhase: () => {
        throw new Error("runPhase must not execute when symlink refused");
      },
    });
    expect(code).toBe(1);
    // Symlink still present (not deleted).
    expect(findSymlinkNodeModules(dir)).toBe(join(dir, "node_modules"));
  });
});
