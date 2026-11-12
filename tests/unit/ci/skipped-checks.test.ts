import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
      `${call("fit")}("hides the rest", () => {});`,
      `${call("fdescribe")}("hides the suite", () => {});`,
      `${call("ftest")}("hides one", () => {});`,
      "const label = `${" + call("it", "skip") + "(\"hidden\", () => {})}`;",
    ].join("\n");
    const kinds = auditSource(src, "tests/unit/example.test.ts").map((f) => f.kind);
    expect(kinds).toEqual([
      "focused",
      "unconditional-skip",
      "unconditional-skip",
      "unconditional-skip",
      "unexpected-skip",
      "focused",
      "focused",
      "focused",
      "unconditional-skip",
    ]);
  });

  it("does not flag skip-like text that is not a test call", () => {
    // Snippets are the matches from main that are not skipped tests. They sit in this
    // file on purpose: a string, comment, regex, or local fit() must not fail the tree scan.
    const asTest = "tests/unit/example.test.ts";
    const fixtures: { name: string; file: string; src: string }[] = [
      {
        name: "QuayShell local fit() (src/components/shell/QuayShell.tsx:218)",
        file: asTest,
        src: "const fit = () => store.getState().setViewport(window.innerWidth, window.innerHeight);\nfit();\n",
      },
      {
        name: "PhoneHome comment (src/components/shell/PhoneHome.tsx:37)",
        file: asTest,
        src: "/**\n * Label fit (Studio T4 rulings, 07:46 + 08:04): wrap at spaces first, at most 2 lines; never break inside a word.\n */\n",
      },
      {
        name: "lesson 17 prose (docs/v1/units/ci-lesson17.md:27)",
        file: asTest,
        src: "const note = \"Playwright `test.skip(condition)` viewport and project filters\";\n",
      },
      {
        name: "e2e conventions prose (specs/tape-e2e-conventions.md:40)",
        file: asTest,
        src: "const note = \"marked `test.skip(project === 'phone', 'keyboard only')` with a reason\";\n",
      },
      {
        name: "build-plan prose (export/build-plan/cards/03/T03-29.md:21)",
        file: asTest,
        src: "const note = \"The default pnpm test skips them with describe.skipIf(!process.env.TYCOON_LONG).\";\n",
      },
      {
        name: "Nelson-Siegel table (export/build-plan/packs/04/T04-07.md:936)",
        file: asTest,
        src: "const row = \"Nelson-Siegel fit (§3.7.5)\";\n",
      },
      {
        name: "desktop shell prose (specs/tape-desktop-shell.md:82)",
        file: asTest,
        src: "const row = \"halves refused if either window's min width doesn't fit (Broker min 480, Portfolio 520)\";\n",
      },
      {
        name: "LLM prose (grok-bot-export/04-quant.md)",
        file: asTest,
        src: "const row = \"propose where LLMs fit (news, filings, CEO quotes, rumors\";\n",
      },
      {
        name: "review fixture text (export/ledger-ref/pr3-review.md:12)",
        file: asTest,
        src: "const row = \"Add `it.todo('T03-15 negative reserves convert to standing facility at close')`;\";\n",
      },
      {
        name: "ledger it.todo (packages/engine/ledger/test/conflict-accrual.test.ts:230)",
        file: "packages/engine/ledger/test/conflict-accrual.test.ts",
        src: "it.todo('T03-15 negative reserves convert to standing facility at close (A-6; no bank overdraws 1002 until T03-15 lands)');\n",
      },
      {
        name: "regex literal",
        file: asTest,
        src: "const re = /xit(/;\nconst re2 = /fit (/;\nconst re3 = /describe.only(/;\n",
      },
      {
        name: "skipIf helper identifier",
        file: asTest,
        src: "function skipIf(cond: boolean) { return cond; }\nskipIf(process.env.CI !== \"1\");\n",
      },
    ];
    for (const fixture of fixtures) {
      expect(auditSource(fixture.src, fixture.file), fixture.name).toEqual([]);
    }
  });

  it("does not flag those matches in the non-test files where they live", () => {
    const files = [
      "src/components/shell/QuayShell.tsx",
      "src/components/shell/PhoneHome.tsx",
      "docs/v1/units/ci-lesson17.md",
      "specs/tape-e2e-conventions.md",
      "specs/tape-desktop-shell.md",
      "export/build-plan/cards/03/T03-29.md",
      "export/build-plan/packs/04/T04-07.md",
      "export/ledger-ref/pr3-review.md",
      "grok-bot-export/raw/03-ledger.json",
    ];
    for (const file of files) {
      expect(auditSource(readFileSync(join(ROOT, file), "utf8"), file), file).toEqual([]);
    }
    for (const file of [
      "packages/engine/ledger/test/conflict-accrual.test.ts",
      "packages/engine/ledger/test/sysside.test.ts",
    ]) {
      expect(auditSource(readFileSync(join(ROOT, file), "utf8"), file), file).toEqual([]);
    }
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
