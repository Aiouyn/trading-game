import { PERSONALITIES } from '../src/personalities.js';
import { generateCity } from '../src/gen.js';
import { auditCityAccess } from '../src/access-audit.js';

const id = process.argv[2] ?? 'avalon';
const P = PERSONALITIES[id];
if (!P) {
  console.error(`unknown city: ${id}`);
  process.exit(1);
}
const city = await generateCity(P);
const report = auditCityAccess(city);
console.log(JSON.stringify({
  city: report.city,
  seed: report.seed,
  auditedRoadServed: report.auditedRoadServed,
  specialModeCount: report.specialModeCount,
  legacyUnaudited: report.legacyUnaudited,
  occupiedInvalid: report.occupiedInvalid,
  access: city.access,
  failures: report.failures.slice(0, 10),
}, null, 2));
// Only a city whose buildings all carry audited paths can claim an entrance audit.
// Remaining cities keep proximity access and are reported as legacy, never as a pass.
if (report.occupiedInvalid > 0 || report.legacyUnaudited > 0) process.exit(1);
