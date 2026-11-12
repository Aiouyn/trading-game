import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertNoRepoData } from "./no-repo-data";

describe("npm test must not leave a repo .data directory", () => {
  const temps: string[] = [];
  afterEach(() => {
    for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("passes when the checkout has no .data", () => {
    const root = mkdtempSync(path.join(tmpdir(), "no-data-"));
    temps.push(root);
    expect(() => assertNoRepoData(root)).not.toThrow();
  });

  it("fails when .data remains, and names what was left", () => {
    const root = mkdtempSync(path.join(tmpdir(), "no-data-"));
    temps.push(root);
    mkdirSync(path.join(root, ".data", "market"), { recursive: true });
    writeFileSync(path.join(root, ".data", "market", "storm-world.json"), "{}\n");
    expect(() => assertNoRepoData(root)).toThrow(/left .*\/\.data behind \(market\)/);
  });
});
