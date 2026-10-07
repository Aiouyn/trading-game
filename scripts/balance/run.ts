// Seeded balance harness skeleton (owner: Tape).
// Usage: npx tsx scripts/balance/run.ts [--seeds 20] [--years 5] [--out balance-out]
// Runs the engine headless across many seeds, aggregates stats, and checks them against bands.ts.
// Exit code 1 if any band fails, so it can gate a release.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PHASE0_BANDS, check } from "./bands";

function arg(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  const seeds = Number(arg("seeds", "20"));
  const years = Number(arg("years", "5"));
  const out = arg("out", "balance-out");

  const enginePath = path.resolve("src/engine/index.ts");
  if (!existsSync(enginePath)) {
    console.log("balance: src/engine/index.ts not found yet, skeleton only. Nothing to run.");
    return;
  }

  // Wired to Quant's public API once it lands (see docs/ENGINE.md).
  const engine = await import(path.relative(__dirname, enginePath).replace(/\\/g, "/").replace(/\.ts$/, "").replace(/^(?!\.)/, "./"));
  console.log(`balance: engine loaded (${Object.keys(engine).length} exports). seeds=${seeds} years=${years}`);

  const perSeed: Record<string, number>[] = [];
  // TODO(Tape): for each seed, run the engine for `years` game years and collect stats once the API is known.

  const stats: Record<string, number> = {};
  const results = check(PHASE0_BANDS, stats);
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "summary.json"), JSON.stringify({ seeds, years, perSeed, results }, null, 2));
  for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.id}  ${r.value ?? "n/a"}  [${r.min}, ${r.max}]`);
  if (results.some((r) => !r.pass)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});