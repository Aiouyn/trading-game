import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  BROWSER_PHASES,
  CI_CONDITIONAL_NOTE,
  CORE_PHASES,
  phaseShellLine,
} from "../../../tools/ci/phases.mjs";
import {
  assertSnapshotUnchanged,
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

describe("preflight phases ↔ CI parity (cwd/env, not id self-map)", () => {
  it("CORE_PHASES ids and commands match the known CI checklist (hardcoded)", () => {
    expect(CORE_PHASES.map((p) => p.id)).toEqual([
      "lint",
      "ledger-no-dup",
      "typecheck",
      "build",
      "check-hooks",
      "test",
      "pw-install",
      "route-budget",
    ]);
    expect(phaseShellLine(CORE_PHASES[0]!)).toBe("npm run lint");
    expect(CORE_PHASES.find((p) => p.id === "ledger-no-dup")!.cwd).toBe("packages/engine/ledger");
  });

  it("each phase argv appears as a CI run step; ledger cwd and e2e env match", () => {
    for (const p of CORE_PHASES) {
      expect(CI_YML, p.id).toContain(`run: ${phaseShellLine(p)}`);
    }
    expect(CI_YML).toMatch(/ledger-no-dup:[\s\S]*working-directory:\s*packages\/engine\/ledger/);
    const e2e = BROWSER_PHASES[0]!;
    expect(CI_YML).toContain(`run: ${phaseShellLine(e2e)}`);
    expect(e2e.env).toEqual({ CI: "1", SHOTS: "1" });
    expect(CI_YML).toMatch(/npx playwright test[\s\S]*env:[\s\S]*CI:\s*"1"[\s\S]*SHOTS:\s*"1"/);
  });

  it("documents CI-conditional check:paths as not local-required", () => {
    expect(CI_YML).toMatch(/check:paths/);
    expect(CI_YML).toMatch(/startsWith\(github\.head_ref, 'v3\/quay-shell'\)/);
    expect(CI_CONDITIONAL_NOTE).toMatch(/check:paths/);
    expect(CORE_PHASES.some((p) => phaseShellLine(p).includes("check:paths"))).toBe(false);
  });
});

describe("content snapshot (real temp git repo)", () => {
  it("clean unchanged → same fingerprint", () => {
    const dir = tempRepo();
    const a = gitCapture(dir);
    const b = gitCapture(dir);
    expect(a.dirty).toBe(false);
    expect(a.fingerprint).toBe(b.fingerprint);
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

describe("runner CLI contracts", () => {
  it("fail-fast stops after first failure and keeps log paths when provided by runPhase", () => {
    const { ok, results, failedAt } = runPhases({
      phases: [
        { id: "lint", argv: ["true"] },
        { id: "ledger-no-dup", argv: ["false"] },
        { id: "typecheck", argv: ["true"] },
      ],
      runPhase: (phase) => ({
        status: phase.id === "ledger-no-dup" ? 1 : 0,
        signal: null,
        error: phase.id === "ledger-no-dup" ? "boom" : null,
        stdoutLog: `/tmp/${phase.id}.out`,
        stderrLog: `/tmp/${phase.id}.err`,
      }),
    });
    expect(ok).toBe(false);
    expect(failedAt).toBe("ledger-no-dup");
    expect(results).toHaveLength(2);
    expect(results[1]!.stderrLog).toBe("/tmp/ledger-no-dup.err");
  });

  it("dry-run is uncertified: ok false, statuses not_run, not usable as pass", () => {
    const dir = tempRepo();
    const out = join(dir, "evidence");
    const code = main(["--dry-run", "--out", out], { cwd: dir, gitCapture: () => gitCapture(dir) });
    expect(code).toBe(0);
    const result = JSON.parse(readFileSync(join(out, "result.json"), "utf8"));
    expect(result.dryRun).toBe(true);
    expect(result.certified).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.scope).toBe("core_only");
    expect(result.e2e).toBe("omitted");
    expect(result.results.every((r: { status: string; ok: boolean }) => r.status === "not_run" && r.ok === false)).toBe(true);
  });

  it("--out without value exits nonzero with usage error", () => {
    expect(() => parseArgs(["--out"])).toThrow(/--out requires/);
    const code = main(["--out"]);
    expect(code).toBe(2);
  });

  it("core-only main message path: scope core_only when phases mocked pass", () => {
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
    expect(result.certified).toBe(true);
    expect(result.scope).toBe("core_only");
    expect(result.e2e).toBe("omitted");
  });
});
