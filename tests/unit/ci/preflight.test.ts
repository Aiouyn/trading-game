import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BROWSER_PHASES,
  CORE_PHASES,
  REQUIRED_BROWSER_IDS,
  REQUIRED_CORE_IDS,
  phaseShellLine,
} from "../../../tools/ci/phases.mjs";
import { assertSnapshotUnchanged, runPhases } from "../../../tools/ci/preflight.mjs";

const ROOT = join(import.meta.dirname, "../../..");
const CI_YML = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");

function ciRunLines(yml: string): string[] {
  return [...yml.matchAll(/^\s+- run:\s*(.+)$/gm)].map((m) => m[1].trim().replace(/^"|"$/g, ""));
}

describe("preflight phases ↔ CI parity", () => {
  it("CORE_PHASES include lint and ledger-no-dup (the #99 red CI misses)", () => {
    expect(REQUIRED_CORE_IDS).toContain("lint");
    expect(REQUIRED_CORE_IDS).toContain("ledger-no-dup");
    expect(phaseShellLine(CORE_PHASES.find((p) => p.id === "lint")!)).toBe("npm run lint");
    expect(phaseShellLine(CORE_PHASES.find((p) => p.id === "ledger-no-dup")!)).toBe(
      "npx vitest run test/map-no-dup.test.ts",
    );
  });

  it("every CORE and BROWSER phase command appears in ci.yml (no drifting second list)", () => {
    const runs = ciRunLines(CI_YML).join("\n");
    for (const p of [...CORE_PHASES, ...BROWSER_PHASES]) {
      const line = phaseShellLine(p);
      expect(runs, `ci.yml missing phase ${p.id}: ${line}`).toContain(line);
    }
  });

  it("ci.yml ledger-no-dup and e2e jobs stay wired", () => {
    expect(CI_YML).toMatch(/ledger-no-dup:/);
    expect(CI_YML).toMatch(/working-directory:\s*packages\/engine\/ledger/);
    expect(CI_YML).toMatch(/npx playwright test tests\/e2e\/shell tests\/e2e\/17b tests\/e2e\/settings/);
    expect(REQUIRED_BROWSER_IDS).toEqual(["e2e"]);
  });
});

describe("preflight runner behavior", () => {
  it("fail-fast: non-zero phase exit stops and reports failedAt", () => {
    const phases = [
      { id: "lint", argv: ["true"] },
      { id: "ledger-no-dup", argv: ["false"] },
      { id: "typecheck", argv: ["true"] },
    ];
    let calls = 0;
    const { ok, results, failedAt } = runPhases({
      phases,
      runPhase: (phase) => {
        calls += 1;
        return { status: phase.id === "ledger-no-dup" ? 1 : 0, stdout: "", stderr: "boom" };
      },
    });
    expect(ok).toBe(false);
    expect(failedAt).toBe("ledger-no-dup");
    expect(results.map((r) => r.id)).toEqual(["lint", "ledger-no-dup"]);
    expect(calls).toBe(2);
  });

  it("rejects stale proof when commit/dirty fingerprint changes", () => {
    const a = {
      commit: "aaa",
      dirty: "",
      dirtyCount: 0,
      fingerprint: createHash("sha256").update("aaa\n").digest("hex"),
    };
    const b = {
      commit: "bbb",
      dirty: " M file\n",
      dirtyCount: 1,
      fingerprint: createHash("sha256").update("bbb\n M file\n").digest("hex"),
    };
    expect(() => assertSnapshotUnchanged(a, b)).toThrow(/stale/);
    expect(() => assertSnapshotUnchanged(a, { ...a })).not.toThrow();
  });

  it("omitting browser mode is not recorded as e2e pass (contract on phase lists)", () => {
    expect(CORE_PHASES.some((p) => p.id === "e2e")).toBe(false);
    expect(BROWSER_PHASES.some((p) => p.id === "e2e")).toBe(true);
  });
});
