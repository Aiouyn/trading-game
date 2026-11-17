// node app/make-worlds.ts
// Builds seeds 1 to 6 at the default population into app/worlds (or PA_WORLDS).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const worlds = process.env.PA_WORLDS || path.join(here, 'worlds');
const SEEDS = [1, 2, 3, 4, 5, 6];
const YEARS = 100;
const yearOf = new Map<number, number>(SEEDS.map((s) => [s, 0]));

function headYears(seed: number): number | undefined {
  const json = path.join(worlds, String(seed), 'world.json');
  const bin = path.join(worlds, String(seed), 'world.bin');
  if (!fs.existsSync(json) || !fs.existsSync(bin)) return;
  const fd = fs.openSync(json, 'r');
  const buf = Buffer.alloc(256);
  const n = fs.readSync(fd, buf, 0, 256, 0);
  fs.closeSync(fd);
  const day = buf.toString('utf8', 0, n).match(/"day":(\d+)/);
  if (!day) return;
  return Math.floor(Number(day[1]) / 360);
}

let painted = '';
function paint(): void {
  const line = 'history ' + SEEDS.map((s) => `${s}:${yearOf.get(s)}/${YEARS}`).join('  ');
  if (line === painted) return;
  painted = line;
  if (process.stdout.isTTY) process.stdout.write(`\r${line}`.padEnd(72));
  else console.log(line);
}

function childArgs(seed: number): string[] {
  const flags: string[] = [];
  const opts = process.env.NODE_OPTIONS ?? '';
  const [maj, min] = process.versions.node.split('.').map((n) => Number(n));
  const needs = maj < 22 || (maj === 22 && min < 18);
  if (needs && !opts.includes('--experimental-strip-types') && !process.execArgv.includes('--experimental-strip-types')) {
    flags.push('--experimental-strip-types');
  }
  return [...flags, path.join(root, 'sim', 'worldgen.ts'), '--world', String(seed), '--years', String(YEARS)];
}

function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env, PA_WORLDS: worlds };
  delete env.SIM_POP;
  return env;
}

function runSeed(seed: number): Promise<void> {
  const have = headYears(seed);
  if (have === YEARS) {
    yearOf.set(seed, YEARS);
    paint();
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    // Stay on the launcher console so closing that window stops the city too.
    const child = spawn(process.execPath, childArgs(seed), { cwd: root, env: childEnv() });
    let buf = '';
    const take = (chunk: Buffer): void => {
      buf += chunk.toString('utf8');
      let i = buf.indexOf('\n');
      while (i >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        const m = /^(\d+)\t/.exec(line);
        if (m) yearOf.set(seed, Math.max(yearOf.get(seed) ?? 0, Number(m[1])));
        else if (line.startsWith('cache ')) yearOf.set(seed, YEARS);
        paint();
        i = buf.indexOf('\n');
      }
    };
    child.stdout?.on('data', take);
    child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk));
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        yearOf.set(seed, YEARS);
        paint();
        resolve();
        return;
      }
      reject(new Error(`seed ${seed} stopped (${code ?? 'signal'})`));
    });
  });
}

async function pool(jobs: (() => Promise<void>)[], n: number): Promise<void> {
  let next = 0;
  const lane = async (): Promise<void> => {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= jobs.length) return;
      await jobs[i]();
    }
  };
  const width = Math.max(1, Math.min(n, jobs.length));
  await Promise.all(Array.from({ length: width }, () => lane()));
}

fs.mkdirSync(worlds, { recursive: true });
paint();
const cores = os.availableParallelism?.() ?? os.cpus().length;
const asked = Number(process.env.PA_WORLD_JOBS);
// A city is about a gigabyte. Two at a time keeps a first launch usable; PA_WORLD_JOBS raises it.
const width = Number.isInteger(asked) && asked > 0 ? asked : Math.min(SEEDS.length, cores, 2);
try {
  await pool(SEEDS.map((s) => () => runSeed(s)), width);
} catch (err) {
  const why = err instanceof Error ? err.message : String(err);
  console.error(why);
  process.exit(1);
}
if (process.stdout.isTTY) process.stdout.write('\n');
console.log(`worlds ready in ${worlds}`);
