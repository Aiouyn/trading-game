/**
 * Shop gates (Phase 4 stage B, DECISIONS S1 and S6, docs/V1-PHASE4.md 2.2). Runs the wealth probe over many seeds, with NPC
 * competition present, and checks the median payback of each management style on each tier of the 10/15/30/50/80/120 ladder.
 * The band logic lives in shop-gates-rules.ts (unit-tested by shop-gates.test.ts). Each seed is its own process
 * (wealth.ts probe), run in parallel. Exits 1 when any gate is out of band.
 *
 *   npx tsx scripts/balance/shop-gates.ts [--seeds 20] [--jobs 8] [--days 40] [--prefix gate]
 */
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { LADDER, failures, summarize, type PaybackRow } from './shop-gates-rules';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

function runProbe(seed: string, days: number): Promise<PaybackRow[]> {
  const tsx = join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const script = join(process.cwd(), 'scripts', 'balance', 'wealth.ts');
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [tsx, script, 'probe', seed, String(days)], { maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
      if (err) { reject(err); return; }
      const rows = stdout.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l) as { style: string; tier: number; payback: number });
      resolve(rows.map((r) => ({ style: r.style, tier: r.tier, payback: r.payback })));
    });
  });
}

async function main(): Promise<void> {
  const seeds = Number(arg('seeds', '20'));
  const jobs = Math.max(1, Number(arg('jobs', '8')));
  const days = Number(arg('days', '40'));
  const prefix = arg('prefix', 'gate');
  const list = Array.from({ length: seeds }, (_, i) => `${prefix}-${String(i + 1).padStart(2, '0')}`);
  const rows: PaybackRow[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < list.length) {
      const seed = list[next++]!;
      rows.push(...(await runProbe(seed, days)));
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, list.length) }, worker));

  const summary = summarize(rows);
  console.log(`Shop gates: ${seeds} seeds, ${days} game days, NPC competition present. Median payback in game days, ratio to the ladder.`);
  console.log(`| Style | ${LADDER.map((l, i) => `T${i + 1} (${l})`).join(' | ')} |`);
  console.log(`|---|${LADDER.map(() => '---').join('|')}|`);
  for (const [style, s] of summary) {
    console.log(`| ${style} | ${s.medians.map((m, i) => `${m.toFixed(1)} (${s.ratios[i]!.toFixed(2)}x)`).join(' | ')} |`);
  }
  console.log(JSON.stringify({ seeds, days, prefix, ladder: LADDER, medians: Object.fromEntries([...summary].map(([k, v]) => [k, v.medians])) }));
  const bad = failures(summary);
  if (bad.length) {
    console.error(`FAIL: ${bad.length} gate(s) out of band:\n  ${bad.join('\n  ')}`);
    process.exit(1);
  }
  console.log('PASS: every gate holds on every tier.');
}

void main();
