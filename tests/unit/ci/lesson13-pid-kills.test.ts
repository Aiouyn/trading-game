import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { ALLOWLIST, findNameKills, main, scanRepo } from "../../../tools/ci/lesson13-pid-kills.mjs";

const ROOT = join(import.meta.dirname, "../../..");
const SCRIPT = join(ROOT, "tools/ci/lesson13-pid-kills.mjs");

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "lesson13-"));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, body);
  }
  return root;
}

describe("lesson 13: kill by pid file only, never pkill or killall by name", () => {
  it("flags a known-bad sample (pkill and killall, including sudo, exec, and spawn)", () => {
    const sh = findNameKills(
      [
        "pkill -f next-server",
        "killall -9 node",
        "sudo pkill -f next",
        "sudo -u root pkill -9 -f next",
        "nice -n 5 killall node",
        "FOO=1 pkill -f next",
        "xargs -r pkill -f next",
        "eval killall node",
        "bash -c \"pkill -f next\"",
      ].join("\n"),
      "sample.sh",
      "shell",
    );
    expect(sh).toEqual([
      { file: "sample.sh", line: 1, command: "pkill" },
      { file: "sample.sh", line: 2, command: "killall" },
      { file: "sample.sh", line: 3, command: "pkill" },
      { file: "sample.sh", line: 4, command: "pkill" },
      { file: "sample.sh", line: 5, command: "killall" },
      { file: "sample.sh", line: 6, command: "pkill" },
      { file: "sample.sh", line: 7, command: "pkill" },
      { file: "sample.sh", line: 8, command: "killall" },
      { file: "sample.sh", line: 9, command: "pkill" },
    ]);

    const js = findNameKills(
      ["exec(\"pkill -f next\");", "spawn('killall', ['node']);", "execSync('sudo pkill -f next');"].join("\n"),
      "sample.mjs",
      "js",
    );
    expect(js).toEqual([
      { file: "sample.mjs", line: 1, command: "pkill" },
      { file: "sample.mjs", line: 2, command: "killall" },
      { file: "sample.mjs", line: 3, command: "pkill" },
    ]);
  });

  it("does not flag a pid-file kill, a spawned-child process.kill, a comment, or a non-command mention", () => {
    const sh = findNameKills(
      [
        "# pkill -f next",
        "kill \"$(cat \"$PIDFILE\")\"",
        "kill -TERM \"$(cat server.pid)\"",
        "echo pkill",
        "echo \"do not pkill\"",
      ].join("\n"),
      "ok.sh",
      "shell",
    );
    expect(sh).toEqual([]);

    const js = findNameKills(
      [
        "// killall node",
        "/* pkill -f next */",
        "process.kill(-srv.pid, 'SIGTERM');",
        "const note = 'do not pkill';",
      ].join("\n"),
      "ok.mjs",
      "js",
    );
    expect(js).toEqual([]);
  });

  it("flags name-kills in scripts, tools, package.json scripts, playwright config, and runbook shell, and ignores prose", () => {
    const root = fixture({
      "scripts/bad.sh": "pkill -f next-server\n",
      "scripts/ok.sh": "kill \"$(cat \"$PIDFILE\")\"\n",
      "scripts/comment.sh": "# killall node\necho still-up\n",
      "tools/child.mjs": "process.kill(-srv.pid, 'SIGTERM');\n",
      "tools/bad.mjs": "import { spawn } from 'node:child_process';\nspawn('killall', ['node']);\n",
      "package.json": JSON.stringify({ scripts: { bad: "killall -9 node", ok: "kill $(cat .pid)" } }, null, 2) + "\n",
      "playwright.config.ts": "import { execSync } from 'node:child_process';\nexecSync('pkill -f next');\n",
      "docs/ops/runbook.md": ["# ops", "", "Prose may say never pkill.", "", "```bash", "kill \"$(cat \"$PIDFILE\")\"", "pkill -f next-server", "```", ""].join("\n"),
      "docs/v1/REVIEW-LESSONS.md": "never pkill/killall by name\n",
      "docs/guide.md": "```bash\npkill -f next\n```\n",
    });
    const hits = scanRepo(root);
    expect(hits).toEqual([
      { file: "docs/ops/runbook.md", line: 7, command: "pkill" },
      { file: "package.json", line: 3, command: "killall" },
      { file: "playwright.config.ts", line: 2, command: "pkill" },
      { file: "scripts/bad.sh", line: 1, command: "pkill" },
      { file: "tools/bad.mjs", line: 2, command: "killall" },
    ]);
  });

  it("the current tree has no name-kills and an empty allowlist", () => {
    expect(ALLOWLIST).toEqual({});
    expect(scanRepo(ROOT)).toEqual([]);
  });

  it("the CLI exits 1 on a known-bad sample and 0 on the current tree", () => {
    const badRoot = fixture({ "scripts/bad.sh": "pkill -f next-server\n" });
    const bad = spawnSync(process.execPath, [SCRIPT, "--root", badRoot], { encoding: "utf8" });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("scripts/bad.sh:1:");
    expect(bad.stderr).toContain("pkill");

    const ok = spawnSync(process.execPath, [SCRIPT, "--root", ROOT], { encoding: "utf8" });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain("lesson13: clean");

    expect(main(["--root", badRoot], () => undefined, () => undefined)).toBe(1);
    expect(main(["--root", ROOT], () => undefined, () => undefined)).toBe(0);
  });
});
