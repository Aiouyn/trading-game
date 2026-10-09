/**
 * Write the live price/volume fingerprint fixture from an engine build.
 *   npx tsx scripts/ecology/fingerprint.ts --engine <path to src/engine/index.ts> --out src/engine/__fixtures__/fingerprint.json
 * The committed fixture was written from the engine as it was BEFORE the shadow ecology was added
 * (an untouched copy of src/engine), so ecology.test.ts compares today's flag-off and shadow runs to it.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runScenarios } from '../../src/engine/__fixtures__/fingerprint-scenarios';
import type { EngineApi } from '../../src/engine/__fixtures__/fingerprint-scenarios';

const argv = process.argv.slice(2);
const arg = (n: string, f: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1]! : f; };
const engine = path.resolve(arg('engine', 'src/engine/index.ts'));
const out = arg('out', 'src/engine/__fixtures__/fingerprint.json');
const api = (await import(pathToFileURL(engine).href)) as EngineApi;
writeFileSync(out, JSON.stringify({ engine: arg('label', engine), scenarios: runScenarios(api) }) + '\n');
console.log(`wrote ${out}`);
