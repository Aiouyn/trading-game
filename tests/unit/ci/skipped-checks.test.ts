import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SKIP_ALLOWLIST,
  auditRun,
  auditSource,
  auditTree,
  auditWorkflow,
  main,
} from "../../../tools/ci/skipped-checks.mjs";

const ROOT = join(import.meta.dirname, "../../..");

/** Build a call token without writing the contiguous source form into this file. */
function call(objectName: string, method?: string): string {
  if (method === undefined) return objectName;
  return [objectName, method].join(".");
}

function captureMain(argv: string[]): { code: number; logs: string[]; errors: string[] } {
  const logs: string[] = [];
  const errors: string[] = [];
  const code = main(argv, {
    log: (line) => {
      logs.push(line);
    },
    error: (line) => {
      errors.push(line);
    },
  });
  return { code, logs, errors };
}

describe("lesson 17: a skipped check is not a pass", () => {
  it("flags focused tests, unconditional skips, x-tests, and a root-suite skipIf outside the allowlist", () => {
    const src = [
      `${call("describe", "only")}("hides the rest", () => {});`,
      `${call("it", "skip")}("quietly off", () => {});`,
      `${call("it", "skip")}(true, "literal true");`,
      `${call("xit")}("old skip");`,
      `${call("describe", "skipIf")}(process.env.CI !== "1")("not on the list", () => {});`,
    ].join("\n");
    const kinds = auditSource(src, "tests/unit/example.test.ts").map((f) => f.kind);
    expect(kinds).toEqual(["focused", "unconditional-skip", "unconditional-skip", "unconditional-skip", "unexpected-skip"]);
  });

  it("does not flag a conditional Playwright project filter", () => {
    const src = `${call("test", "skip")}(info.project.name !== "desktop", "desktop project only");\n`;
    expect(auditSource(src, "tests/e2e/shell/desktop.spec.ts")).toEqual([]);
  });

  it("flags passWithNoTests: true (zero tests would exit 0)", () => {
    const src = "export default { test: { passWithNoTests: true } };\n";
    expect(auditSource(src, "vitest.config.ts").map((f) => f.kind)).toEqual(["pass-with-no-tests"]);
  });

  it("flags a run that reported zero tests", () => {
    expect(auditRun({ total: 0, skipped: [] }).map((f) => f.kind)).toEqual(["zero-tests"]);
  });

  it("flags a skipped test that is not on the allowlist", () => {
    const findings = auditRun({
      total: 2,
      skipped: [{ file: "tests/unit/x.test.ts", title: "quietly skipped" }],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.kind).toBe("unexpected-skip");
    expect(findings[0]!.message).toMatch(/not a pass/);
  });

  it("accepts a run whose only skips are the two allowlisted tests", () => {
    expect(SKIP_ALLOWLIST).toHaveLength(2);
    const findings = auditRun({
      total: 4,
      skipped: SKIP_ALLOWLIST.map((a) => ({ file: a.file, title: a.title })),
    });
    expect(findings).toEqual([]);
  });

  it("flags continue-on-error, || true, and an if: that can skip a required gate", () => {
    const yml = [
      "jobs:",
      "  checks:",
      "    steps:",
      "      - run: npm test || true",
      "      - run: npm run lint",
      "        continue-on-error: true",
      "      - run: npm run typecheck",
      "        if: github.event_name == 'pull_request'",
    ].join("\n");
    const kinds = auditWorkflow(yml, ".github/workflows/ci.yml").map((f) => f.kind);
    expect(kinds).toContain("or-true");
    expect(kinds).toContain("continue-on-error");
    expect(kinds).toContain("conditional-gate");
  });

  it("does not flag conditional check:paths or an upload that runs on failure()", () => {
    const yml = [
      "jobs:",
      "  checks:",
      "    steps:",
      "      - run: npm run check:paths -- origin/main",
      "        if: github.event_name == 'pull_request'",
      "      - uses: actions/upload-artifact@v4",
      "        if: failure()",
    ].join("\n");
    expect(auditWorkflow(yml, ".github/workflows/ci.yml")).toEqual([]);
  });

  it("the current tree has no unexpected skips and lists the two allowlisted ones as SKIP", () => {
    const { findings, allowed } = auditTree(ROOT);
    expect(findings).toEqual([]);
    expect(allowed.map((a) => a.file).sort()).toEqual([
      "tests/contract/17b-channels.swap.test.ts",
      "tests/unit/city/paths.test.ts",
    ]);
    const { code, logs, errors } = captureMain([ROOT]);
    expect(code).toBe(0);
    expect(logs.some((line) => line.startsWith("SKIP "))).toBe(true);
    expect(logs.some((line) => line === "skipped-checks: pass")).toBe(true);
    expect(logs.some((line) => line.startsWith("PASS "))).toBe(false);
    expect(errors).toEqual([]);
  });

  it("the command exits 1 on a known-bad sample tree", () => {
    const dir = mkdtempSync(join(tmpdir(), "skip-check-"));
    mkdirSync(join(dir, "tests", "unit"), { recursive: true });
    writeFileSync(join(dir, "tests", "unit", "bad.test.ts"), `${call("it", "only")}("hides the rest", () => {});\n`);
    const { code, errors } = captureMain([dir]);
    expect(code).toBe(1);
    expect(errors.some((line) => line.startsWith("FAIL "))).toBe(true);
    expect(errors.some((line) => line.startsWith("skipped-checks: fail"))).toBe(true);
  });
});
