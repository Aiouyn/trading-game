// Launchpad gate, sharded (lead-launchpad.md L8.1). Splits the seeds into contiguous shards, runs each as a child process of
// launchpad.ts (--first and --seeds), then merges the children's per-world rows, in shard order (which is seed order), through the same
// summarize() the single-process run uses. A merged summary equals a single-process run over the same seeds.
// Usage: npx tsx scripts/balance/launchpad-shards.ts [--seeds 50] [--first 1] [--prefix lx] [--days 30] [--shards 4] [--npc JSON] [--out balance-out/launchpad-lx-50.json]
// Exit code 1 when the merged gate fails (or a shard fails to run).

import { spawn } from 'node:child_process';
import { mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { NPC } from '../../src/world/launchpad/constants';
import { printedOf, summarize, type WorldResult } from './launchpad-summary';

function arg(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const nSeeds = Number(arg('seeds', '50'));
const firstSeed = Number(arg('first', '1'));
const days = Number(arg('days', '30'));
const prefix = arg('prefix', 'lp');
const shardCount = Math.max(1, Number(arg('shards', '4')));
const outPath = arg('out', 'balance-out/launchpad.json');
const npcJson = arg('npc', '{}');
// the same override the children apply, so the merged summary records the same constants
Object.assign(NPC, JSON.parse(npcJson) as Partial<typeof NPC>);

const outDir = path.dirname(outPath);
const shardDir = path.join(outDir, 'shards');
mkdirSync(shardDir, { recursive: true });
const tag = path.basename(outPath, '.json');

// contiguous shards, sizes differing by at most one; no empty shard
const k = Math.min(shardCount, nSeeds);
const shards: { first: number; seeds: number; out: string; log: string }[] = [];
for (let i = 0, at = firstSeed; i < k; i++) {
  const n = Math.floor(nSeeds / k) + (i < nSeeds % k ? 1 : 0);
  shards.push({ first: at, seeds: n, out: path.join(shardDir, `${tag}.${i}.json`), log: path.join(shardDir, `${tag}.${i}.log`) });
  at += n;
}

// the tsx command line, from the repository root (the launcher's working directory)
const tsxCli = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
const harness = path.join('scripts', 'balance', 'launchpad.ts');

function runShard(s: (typeof shards)[number]): Promise<number> {
  const args = [tsxCli, harness, '--seeds', String(s.seeds), '--first', String(s.first), '--days', String(days), '--prefix', prefix, '--npc', npcJson, '--out', s.out];
  const logFd = openSync(s.log, 'w');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: ['ignore', logFd, 'inherit'] });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? -1));
  });
}

async function main() {
  console.error(`launchpad shards: ${k} process(es), seeds ${prefix}-${String(firstSeed).padStart(2, '0')} to ${prefix}-${String(firstSeed + nSeeds - 1).padStart(2, '0')}`);
  const codes = await Promise.all(shards.map((s) => runShard(s)));
  // exit 1 is a shard's own gate failing (normal for a partial run); anything else is a crash
  const crashed = codes.findIndex((c) => c !== 0 && c !== 1);
  if (crashed >= 0) throw new Error(`shard ${crashed} exited ${codes[crashed]}, see ${shards[crashed]!.log}`);
  const per: WorldResult[] = [];
  for (const s of shards) {
    const part = JSON.parse(readFileSync(s.out, 'utf8')) as { complete: boolean; perWorld: WorldResult[] };
    if (!part.complete) throw new Error(`shard ${s.out} is not complete`);
    per.push(...part.perWorld);
  }
  const summary = summarize({ prefix, seeds: nSeeds, days, complete: true, per, NPC });
  writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.error(`merged ${per.length} worlds over ${summary.seedsDone} seeds into ${outPath}`);
  console.log(JSON.stringify(printedOf(summary), null, 2));
  process.exit(summary.gate ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(2);
});
