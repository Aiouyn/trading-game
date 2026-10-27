// UI card 1 WIR-1-11: Wire never does arithmetic parsing on WireItem fields (they are display strings / bands).
// Only `tick` is numeric, and it is formatted by the shell clock (clockAt + clockLabel), so no Wire file calls Number( / parseFloat / parseInt.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const DIR = join(__dirname, "../../../src/apps/wire");

it("no Wire file parses numbers", () => {
  const files = readdirSync(DIR).filter((f) => /\.(ts|tsx)$/.test(f));
  expect(files.length).toBeGreaterThanOrEqual(6);
  for (const f of files) {
    const src = readFileSync(join(DIR, f), "utf8").replace(/\/\/.*$/gm, "");
    expect(src, f).not.toMatch(/\bNumber\s*\(|\bparseFloat\b|\bparseInt\b|Number\.parse/);
    // unary plus on a field, e.g. `+item.sourceRecord.hits`
    expect(src, f).not.toMatch(/(^|[^\w)\]\s])\s*\+\s*(item|i|record|e)\./m);
  }
});
