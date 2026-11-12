import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { findMissingHost, main, scanRepo } from "../../../tools/ci/next-start-host.mjs";

const ROOT = join(import.meta.dirname, "../../..");
const SCRIPT = join(ROOT, "tools/ci/next-start-host.mjs");

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "next-start-host-"));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, body);
  }
  return root;
}

/** Built at runtime so this file is not itself a bare `next start`. */
function bareSpawn(): string {
  return `spawn("npx", ["${"next"}", "${"start"}", "-p", "9"]);\n`;
}

function bareShell(): string {
  return `const command = "npx ${"next"} ${"start"} -p 9";\n`;
}

describe("next start must pass -H or --hostname", () => {
  it("flags a spawn array without -H", () => {
    expect(findMissingHost(bareSpawn(), "tools/bad.mjs")).toEqual([{ file: "tools/bad.mjs", line: 1 }]);
  });

  it("flags a shell string without -H", () => {
    expect(findMissingHost(bareShell(), "playwright.config.ts")).toEqual([{ file: "playwright.config.ts", line: 1 }]);
  });

  it("passes with -H 127.0.0.1", () => {
    const spawn = `spawn("npx", ["next", "start", "-H", "127.0.0.1", "-p", "9"]);\n`;
    expect(findMissingHost(spawn, "tools/ok.mjs")).toEqual([]);
    const shell = `const command = "npx next start -H 127.0.0.1 -p 9";\n`;
    expect(findMissingHost(shell, "playwright.config.ts")).toEqual([]);
  });

  it("passes with --hostname", () => {
    const shell = `const command = "npx next start --hostname 127.0.0.1";\n`;
    expect(findMissingHost(shell, "tools/host.mjs")).toEqual([]);
    const attached = `spawn("next", ["start", "--hostname=127.0.0.1"]);\n`;
    expect(findMissingHost(attached, "tools/host.mjs")).toEqual([]);
  });

  it("passes comments and prose in .md", () => {
    const js = `// npx ${"next"} ${"start"} -p 9\n/* ${"next"} ${"start"} */\nconst note = "see the docs";\n`;
    expect(findMissingHost(js, "tools/comment.mjs")).toEqual([]);
    const md = [`The process runs ${"next"} ${"start"} with no host flag.`, "", `${"next"} ${"start"}`, ""].join("\n");
    expect(findMissingHost(md, "tools/notes.md")).toEqual([]);
  });

  it("flags bare commands under the scan roots and ignores a host flag, a comment, and markdown prose", () => {
    const root = fixture({
      "tools/bad.mjs": bareSpawn(),
      "scripts/bad.sh": `npx ${"next"} ${"start"} -p 9\n`,
      "tools/ok.mjs": `spawn("npx", ["next", "start", "-H", "127.0.0.1"]);\n`,
      "scripts/host.sh": `npx next start --hostname 127.0.0.1\n`,
      "tools/comment.mjs": `// npx ${"next"} ${"start"} -p 9\n`,
      "tools/notes.md": `${"next"} ${"start"}\n\nProse only.\n`,
      "package.json": `${JSON.stringify({ scripts: { bad: `npx ${"next"} ${"start"} -p 9`, ok: "next start -H 127.0.0.1" } }, null, 2)}\n`,
      "playwright.config.ts": bareShell(),
      ".github/workflows/boot.yml": `jobs:\n  boot:\n    steps:\n      - run: npx ${"next"} ${"start"} -p 9\n`,
    });
    expect(scanRepo(root)).toEqual([
      { file: ".github/workflows/boot.yml", line: 4 },
      { file: "package.json", line: 3 },
      { file: "playwright.config.ts", line: 1 },
      { file: "scripts/bad.sh", line: 1 },
      { file: "tools/bad.mjs", line: 1 },
    ]);
  });

  it("the CLI exits 1 listing file:line and 0 on the current tree", () => {
    const badRoot = fixture({ "tools/bad.mjs": bareSpawn() });
    const bad = spawnSync(process.execPath, [SCRIPT, "--root", badRoot], { encoding: "utf8" });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("tools/bad.mjs:1:");
    expect(bad.stderr).toContain("next start without -H/--hostname");

    const ok = spawnSync(process.execPath, [SCRIPT, "--root", ROOT], { encoding: "utf8" });
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout).toContain("next-start-host: clean");
    expect(scanRepo(ROOT)).toEqual([]);
    expect(main(["--root", badRoot], () => undefined, () => undefined)).toBe(1);
    expect(main(["--root", ROOT], () => undefined, () => undefined)).toBe(0);
  });
});
