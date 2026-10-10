// Scenario seed search (Phase 3, A3; docs/team/specs/quant-scenario-seeds.md).
// Usage: npx tsx scripts/sandbox/search-scenarios.ts <scenario-id> [hits=2] [max=200]
// Walks sbx:scenario:<id>:s1, s2, ... in order, runs each seed through the bundled engine, and prints whether its
// headline condition (scenarioHolds) is met. The first hits are the seeds in src/sandbox/scenarios.ts. Same args,
// same output. A rule change in src/sandbox/config.ts (SCENARIO_RULES) can break a seed; rerun this to find the next.

import { Sandbox } from "../../src/sandbox/sandbox";
import { recordScenario } from "../../src/sandbox/record";
import { SCENARIOS, gxReturn, scenarioHolds, type Scenario } from "../../src/sandbox/scenarios";

const want = process.argv[2];
const need = Number(process.argv[3] ?? "2");
const max = Number(process.argv[4] ?? "200");
const base = SCENARIOS.find((s) => s.id === want);
if (!base) {
  console.error(`unknown scenario ${want ?? "(none)"}; known: ${SCENARIOS.map((s) => s.id).join(", ")}`);
  process.exit(2);
}

const hits: string[] = [];
const t0 = Date.now();
for (let n = 1; n <= max && hits.length < need; n++) {
  const seed = `sbx:scenario:${base.id}:s${n}`;
  const sc: Scenario = { ...base, seed };
  // the flash must go live on the flash day by itself (a forced day would be a second code path, see scenarios.ts)
  const rec = recordScenario(Sandbox.fromScenario(sc));
  const holds = scenarioHolds(sc, rec);
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(
    `${base.id} ${seed} holds=${holds} gx=${gxReturn(rec).toFixed(4)} earn=${rec.earningsStocks} ` +
      `stockUp=${rec.stockUpShare.toFixed(2)} flash=${rec.flashStarts.join("/")} t=${secs}s`,
  );
  if (holds) hits.push(seed);
}
console.log(`DONE ${base.id} hits=${hits.join(",")}`);
