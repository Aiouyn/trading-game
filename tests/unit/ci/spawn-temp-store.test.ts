import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { spawnBootRegister, withTempStore } from "../../helpers/spawnBootRegister";
import { main, scanRepo, scanSource } from "../../../tools/ci/spawn-temp-store.mjs";

const ROOT = join(import.meta.dirname, "../../..");
const SCRIPT = join(ROOT, "tools/ci/spawn-temp-store.mjs");

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "spawn-temp-store-"));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, body);
  }
  return root;
}

describe("spawn-temp-store: boot-register and next start need a temp store", () => {
  it("flags a direct boot-register spawn and a next start spawn", () => {
    expect(scanSource('spawnSync("tsx", ["tools/ops/boot-register.ts"]);\n', "tests/bad.ts")).toEqual([
      { file: "tests/bad.ts", line: 1, kind: "boot-register" },
    ]);
    const next = ['import { spawn } from "node:child_process";', 'spawn("npx", ["next", "start", "-p", "9"]);'].join("\n");
    expect(scanSource(next, "tests/next.ts")).toEqual([{ file: "tests/next.ts", line: 2, kind: "next-start" }]);
    expect(scanSource('execSync("npx next start -p 9");\n', "tests/next-cmd.ts")).toEqual([
      { file: "tests/next-cmd.ts", line: 1, kind: "next-start" },
    ]);
    expect(scanSource('execFileSync("tsx", ["tools/ops/boot-register.ts"]);\n', "tests/file.ts")).toEqual([
      { file: "tests/file.ts", line: 1, kind: "boot-register" },
    ]);
  });

  it("flags the boot() wrapper that passes boot-register and ignores boot-bind", () => {
    const src = [
      "function boot(script: string, args: string[], extra: Record<string, string>) {",
      "  const env: Record<string, string | undefined> = { ...process.env };",
      "  Object.assign(env, extra);",
      '  spawnSync("tsx", [script, ...args], { env });',
      "}",
      'boot("tools/ops/boot-bind.ts", [host], {});',
      'boot("tools/ops/boot-register.ts", [], { QUAY_PUBLIC_HOST: secret });',
    ].join("\n");
    expect(scanSource(src, "tests/unit/auth/trust-proxy-boot.test.ts")).toEqual([
      { file: "tests/unit/auth/trust-proxy-boot.test.ts", line: 7, kind: "boot-register" },
    ]);
  });

  it("does not flag a title mention, a comment, next build, or a const that is not the script", () => {
    const titled = [
      'import { spawnSync } from "node:child_process";',
      "function boot(script: string) {",
      '  spawnSync("tsx", [script]);',
      "}",
      'it("boot-register exits 0", () => {',
      '  boot("tools/ops/boot-bind.ts");',
      "});",
    ].join("\n");
    expect(scanSource(titled, "tests/titled.ts")).toEqual([]);
    expect(scanSource('// spawnSync("tsx", ["tools/ops/boot-register.ts"]);\nspawnSync("git", ["status"]);\n', "tests/c.ts")).toEqual([]);
    expect(scanSource('execSync("npx next build");\n', "tests/build.ts")).toEqual([]);
    expect(scanSource('expect(() => fail()).toThrow(/exactly "1"/);\nspawnSync("git", ["status"]);\n', "tests/re.ts")).toEqual([]);
    expect(scanSource('expect(x).toHaveText(/^[\\d.,]+$/);\nspawnSync("tsx", ["tools/ops/boot-register.ts"]);\n', "tests/class.ts")).toEqual([
      { file: "tests/class.ts", line: 2, kind: "boot-register" },
    ]);
  });

  it("accepts spawnBootRegister, a QUAY_DATA_DIR pin, and a helper that pins before spawn", () => {
    expect(scanSource('import { spawnBootRegister } from "../../helpers/spawnBootRegister";\nspawnBootRegister({ QUAY_PUBLIC_HOST: "127.0.0.1" });\n', "tests/ok.ts")).toEqual([]);
    const pinned = [
      "function run(env: Record<string, string>, dir: string) {",
      "  env.QUAY_DATA_DIR = dir;",
      '  spawnSync("tsx", ["tools/ops/boot-register.ts"], { env });',
      "}",
    ].join("\n");
    expect(scanSource(pinned, "tests/pinned.ts")).toEqual([]);
    const via = [
      "function pinStore(env: Record<string, string>, dir: string) {",
      "  env.QUAY_DATA_DIR = dir;",
      "}",
      "function bootRegister() {",
      "  pinStore(env, dir);",
      '  spawnSync("tsx", ["tools/ops/boot-register.ts"]);',
      "}",
    ].join("\n");
    expect(scanSource(via, "tests/via.ts")).toEqual([]);
    const bound = [
      'const script = "tools/ops/boot-register.ts";',
      'env.QUAY_DATA_DIR = dir;',
      "spawnSync(\"tsx\", [script]);",
    ].join("\n");
    expect(scanSource(bound, "tests/bound-ok.ts")).toEqual([]);
    const boundBad = ['const script = "tools/ops/boot-register.ts";', 'spawnSync("tsx", [script]);'].join("\n");
    expect(scanSource(boundBad, "tests/bound-bad.ts")).toEqual([
      { file: "tests/bound-bad.ts", line: 2, kind: "boot-register" },
    ]);
  });

  it("flags fixtures on disk and ignores files outside tests/", () => {
    const root = fixture({
      "tests/bad-boot.ts": 'spawnSync("tsx", ["tools/ops/boot-register.ts"]);\n',
      "tests/bad-next.ts": 'execSync("npx next start -p 9");\n',
      "tests/ok.ts": 'function run() {\n  env.QUAY_DATA_DIR = dir;\n  spawnSync("tsx", ["tools/ops/boot-register.ts"]);\n}\n',
      "tests/nested/comment.ts": '// next start\n// boot-register\n',
      "tools/ignored.ts": 'spawnSync("tsx", ["tools/ops/boot-register.ts"]);\n',
    });
    expect(scanRepo(root)).toEqual([
      { file: "tests/bad-boot.ts", line: 1, kind: "boot-register" },
      { file: "tests/bad-next.ts", line: 1, kind: "next-start" },
    ]);
  });

  it("the CLI exits 1 on a known-bad sample and 0 when that sample pins QUAY_DATA_DIR", () => {
    const badRoot = fixture({ "tests/bad.ts": 'spawnSync("tsx", ["tools/ops/boot-register.ts"]);\n' });
    const bad = spawnSync(process.execPath, [SCRIPT, "--root", badRoot], { encoding: "utf8" });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("tests/bad.ts:1:");
    expect(bad.stderr).toContain("boot-register");
    expect(bad.stderr).toContain("spawnBootRegister");

    const okRoot = fixture({
      "tests/ok.ts": 'function run() {\n  env.QUAY_DATA_DIR = dir;\n  execSync("npx next start -p 9");\n}\n',
    });
    const ok = spawnSync(process.execPath, [SCRIPT, "--root", okRoot], { encoding: "utf8" });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain("spawn-temp-store: clean");

    expect(main(["--root", badRoot], () => undefined, () => undefined)).toBe(1);
    expect(main(["--root", okRoot], () => undefined, () => undefined)).toBe(0);
  });

  it("the current tests/ tree spawns boot-register and next start only through the helper or QUAY_DATA_DIR", () => {
    expect(scanRepo(ROOT)).toEqual([]);
    const ok = spawnSync(process.execPath, [SCRIPT, "--root", ROOT], { encoding: "utf8" });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain("spawn-temp-store: clean");
  });
});

describe("spawnBootRegister pins a temp store the caller cannot override", () => {
  it("throws when extra sets a store dir, and a clean spawn leaves no repo .data", () => {
    for (const key of ["QUAY_DATA_DIR", "QUAY_AUTH_DATA_DIR", "QUAY_STORM_DATA_DIR", "QUAY_TELEMETRY_DIR"] as const) {
      expect(() => spawnBootRegister({ [key]: "/tmp/not-the-store" })).toThrow(new RegExp(key));
    }
    expect(existsSync(join(ROOT, ".data"))).toBe(false);
    const result = spawnBootRegister({});
    expect(result.status).toBe(0);
    expect(existsSync(join(ROOT, ".data"))).toBe(false);
  });

  it("withTempStore pins the four dirs for the callback and removes the directory", async () => {
    const prev = process.env.QUAY_DATA_DIR;
    let seen = "";
    await withTempStore(() => {
      seen = process.env.QUAY_DATA_DIR ?? "";
      expect(seen.startsWith(tmpdir())).toBe(true);
      expect(process.env.QUAY_AUTH_DATA_DIR).toBe(seen);
      expect(process.env.QUAY_STORM_DATA_DIR).toBe(seen);
      expect(process.env.QUAY_TELEMETRY_DIR).toBe(seen);
      expect(existsSync(seen)).toBe(true);
    });
    expect(existsSync(seen)).toBe(false);
    expect(process.env.QUAY_DATA_DIR).toBe(prev);
  });
});
