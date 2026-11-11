// Rebuild tests/unit/launchpad/fixtures/calibration-unit.json from the live runners.
// Usage (repo root): npx tsx --tsconfig tsconfig.json tools/ci/regen-calibration-fixture.ts
// Slow (~2 min): steps the same ShockFeed / LiveMarket walks the official unit previously ran inline.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CALIBRATION_UNIT_PARAMS, collectCalibrationFixture } from "../../src/server/market/calibration";

const out = path.join(path.dirname(new URL(import.meta.url).pathname), "../../tests/unit/launchpad/fixtures/calibration-unit.json");
const started = Date.now();
const fixture = collectCalibrationFixture({ ...CALIBRATION_UNIT_PARAMS });
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`wrote ${out} in ${((Date.now() - started) / 1000).toFixed(1)}s; gxPaths=${fixture.gxPaths.length} calm=${fixture.calm.length} frog=${fixture.frogCloses.length}`);
