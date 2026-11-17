// Win rates: node sim/bots/scenario-table.ts --seeds 10 --workers 3 --pop 5000
// One process per style per scenario per seed. Three styles, every scenario except the sandbox.
import { fork, type ChildProcess } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { listScenarios } from '../modules/player/scenarios.ts';
import type { ScenarioJob, ScenarioResult } from './scenario-result.ts';
import { STYLES } from './scenario-bots.ts';

const arg = (k: string, d: string): string => {
  const i = process.argv.indexOf('--' + k);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

function main(): void {
  const seeds = Math.max(1, Math.floor(+arg('seeds', '10')));
  const pop = arg('pop', '5000');
  const only = arg('only', '');
  const want = new Set(only ? only.split(',').map((s) => s.trim()).filter(Boolean) : []);
  const scenarios = listScenarios().filter((s) => !s.sandbox && (!want.size || want.has(s.id)));
  const workers = Math.max(1, Math.min(3, Math.floor(+arg('workers', '3')), availableParallelism()));
  const jobs: ScenarioJob[] = [];
  for (const sc of scenarios) for (const style of STYLES) for (let seed = 1; seed <= seeds; seed++) {
    jobs.push({ style, scenario: sc.id, seed });
  }
  const results: ScenarioResult[] = [];
  const workerPath = fileURLToPath(new URL('./scenario-worker.ts', import.meta.url));
  const t0 = Date.now();
  let stopping = false;
  let finished = false;
  const queue = jobs.slice();

  const table = (): string => {
    const lines: string[] = [];
    lines.push(`seeds 1–${seeds}, pop ${Number(pop).toLocaleString('en-US')}, ${scenarios.length} scenarios`);
    lines.push('');
    lines.push('| Scenario | Careful | Aggressive | Do-nothing | Aggressive ruin |');
    lines.push('|---|---:|---:|---:|---:|');
    for (const sc of scenarios) {
      const cell = (style: string): string => {
        const rs = results.filter((r) => r.scenario === sc.id && r.style === style && !r.error);
        if (!rs.length) return '–';
        const wins = rs.filter((r) => r.win).length;
        return `${wins}/${rs.length}`;
      };
      const agg = results.filter((r) => r.scenario === sc.id && r.style === 'aggressive' && !r.error);
      const ruin = agg.length ? `${agg.filter((r) => r.ruin).length}/${agg.length}` : '–';
      lines.push(`| ${sc.name} | ${cell('careful')} | ${cell('aggressive')} | ${cell('idle')} | ${ruin} |`);
    }
    lines.push('');
    lines.push('| Scenario | Careful end | Aggressive end | Idle end |');
    lines.push('|---|---:|---:|---:|');
    const med = (xs: number[]): string => {
      if (!xs.length) return '–';
      const s = xs.slice().sort((a, b) => a - b);
      const m = s[Math.floor(s.length / 2)];
      return `$${(m / 100).toFixed(0)}`;
    };
    for (const sc of scenarios) {
      const end = (style: string): string => med(results.filter((r) => r.scenario === sc.id && r.style === style && !r.error).map((r) => r.end));
      lines.push(`| ${sc.name} | ${end('careful')} | ${end('aggressive')} | ${end('idle')} |`);
    }
    lines.push('');
    const errs = results.filter((r) => r.error);
    if (errs.length) {
      lines.push('Errors:');
      for (const e of errs) lines.push(`- ${e.style} ${e.scenario} seed ${e.seed}: ${e.error}`);
      lines.push('');
    }
    const wall = (Date.now() - t0) / 1000;
    const cpu = results.reduce((a, r) => a + r.ms, 0) / 1000;
    lines.push(`Wall ${wall.toFixed(0)}s on ${workers} workers. Sum of run times ${cpu.toFixed(0)}s across ${results.length} runs.`);
    return lines.join('\n');
  };

  const finish = (): void => {
    if (finished) return;
    if (queue.length || slots.some((s) => s.job)) return;
    finished = true;
    stopping = true;
    for (const s of slots) {
      if (s.timer) clearTimeout(s.timer);
      s.child.kill();
    }
    process.stdout.write(table() + '\n');
  };

  interface Slot { child: ChildProcess; job: ScenarioJob | null; timer: ReturnType<typeof setTimeout> | null }
  const slots: Slot[] = [];

  const pump = (): void => {
    if (stopping) return;
    for (const s of slots) {
      if (s.job || !queue.length) continue;
      const job = queue.shift();
      if (!job) break;
      s.job = job;
      s.timer = setTimeout(() => {
        process.stderr.write(`timeout ${job.style} ${job.scenario} seed ${job.seed}\n`);
        s.child.kill();
      }, 12 * 60 * 1000);
      s.child.send(job);
    }
    finish();
  };

  const spawn = (): Slot => {
    const child = fork(workerPath, [], {
      env: { ...process.env, SIM_POP: pop },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    const slot: Slot = { child, job: null, timer: null };
    child.on('message', (msg: ScenarioResult) => {
      if (slot.timer) clearTimeout(slot.timer);
      slot.timer = null;
      slot.job = null;
      results.push(msg);
      const left = queue.length + slots.filter((x) => x.job).length;
      process.stderr.write(`done ${msg.style} ${msg.scenario} seed ${msg.seed} ${msg.win ? 'WIN' : msg.outcome || 'open'} ${msg.ms}ms left ${left}\n`);
      pump();
    });
    child.on('exit', (code) => {
      if (stopping || finished) return;
      if (slot.timer) clearTimeout(slot.timer);
      const job = slot.job;
      const at = slots.indexOf(slot);
      if (at >= 0) slots.splice(at, 1);
      if (job) {
        results.push({
          style: job.style, scenario: job.scenario, seed: job.seed,
          win: false, ruin: false, start: 0, end: 0, days: 0, outcome: '', reason: '',
          ms: 0, error: `worker exited ${code}`,
        });
        process.stderr.write(`died ${job.style} ${job.scenario} seed ${job.seed} code ${code}\n`);
      }
      if (queue.length) slots.push(spawn());
      pump();
    });
    return slot;
  };

  for (let i = 0; i < workers; i++) slots.push(spawn());
  pump();
}

const entry = process.argv[1] ?? '';
if (entry.endsWith('scenario-table.ts') || entry.endsWith('scenario-table.js')) main();
