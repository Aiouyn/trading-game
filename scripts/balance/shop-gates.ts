/**
 * Shop gates (Phase 4 stage B, DECISIONS S1 and S6, docs/V1-PHASE4.md 2.2). Runs the wealth probe over many seeds, with NPC
 * competition present, and checks the median payback of each management style on each tier of the 10/15/30/50/80/120 ladder.
 * The gates are ratios to the ladder value (the lead's ruling):
 *   well-run (average style) 0.9 to 1.1x, excellent 0.7 to 0.8x, neglected (once a real day, sets nothing) 2 to 3x.
 * Each seed is its own process (wealth.ts probe), run in parallel. Exits 1 when any gate is out of band.
 *
 *   npx tsx scripts/balance/shop-gates.ts [--seeds 20] [--jobs 8] [--days 40] [--prefix gate]
 */
import { execFile } from 'node:child_process';
import { join } from 'node:path';

/** The tier ladder the gates are read against (S1): payback in game days for well-run play on each tier. */
export const LADDER = [10, 15, 30, 50, 80, 120] as const;

/** The gates, by management style. `average` is the well-run style (online 16 of 24 game days, well-run settings). */
export const GATES = [
  { style: 'average', label: 'well-run', lo: 0.9, hi: 1.1 },
  { style: 'excellent', label: 'excellent', lo: 0.7, hi: 0.8 },
  { style: 'neglected', label: 'neglected (once a real day, sets nothing)', lo: 2, hi: 3 },
] as const;

/** Reference styles reported but not gated. */
const REFERENCE = ['casual', 'idle', 'managed'] as const;

interface Row { style: string; tier: number; payback: number }

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return NaN;
  return n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
}

/** Median payback per style and tier, and the ratio of each to the ladder value. */
export function summarize(rows: Row[]): Map<string, { medians: number[]; ratios: number[] }> {
  const out = new Map<string, { medians: number[]; ratios: number[] }>();
  for (const style of [...GATES.map((x) => x.style), ...REFERENCE]) {
    const medians = LADDER.map((_, i) => median(rows.filter((r) => r.style === style && r.tier === i + 1).map((r) => r.payback)));
    out.set(style, { medians, ratios: medians.map((m, i) => m / LADDER[i]!) });
  }
  return out;
}

/** Each gate that is out of band on some tier, as a readable line. Empty when every gate holds. */
export function failures(summary: Map<string, { medians: number[]; ratios: number[] }>): string[] {
  const bad: string[] = [];
  for (const gate of GATES) {
    const s = summary.get(gate.style)!;
    s.ratios.forEach((r, i) => {
      if (!(r >= gate.lo && r <= gate.hi)) bad.push(`${gate.label}, tier ${i + 1}: ${r.toFixed(2)}x (band ${gate.lo} to ${gate.hi}x)`);
    });
  }
  return bad;
}

function runProbe(seed: string, days: number): Promise<Row[]> {
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
  const rows: Row[] = [];
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
