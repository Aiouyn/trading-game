// Balance report: node sim/bots/run.ts --worlds 20 --years 20 --pop 5000
// One process per bot per world. Bots act only through the player.
import { fork, type ChildProcess } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { Job, RunResult } from './result.ts';

const NAMES = ['nothing', 'index', 'bond', 'momentum', 'value', 'gambler', 'meme', 'insider', 'raider', 'landlord', 'random'];
const LABEL: Record<string, string> = {
  nothing: 'do nothing',
  index: 'index investor',
  bond: 'bond ladder',
  momentum: 'momentum',
  value: 'value',
  gambler: 'gambler',
  meme: 'memecoin',
  insider: 'insider',
  raider: 'raider',
  landlord: 'landlord',
  random: 'random',
};

const arg = (k: string, d: string): string => {
  const i = process.argv.indexOf('--' + k);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

function pct(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return s[lo];
  return s[lo] * (hi - i) + s[hi] * (i - lo);
}

function ann(rel: number, years: number): number {
  if (!(years > 0)) return 0;
  if (!(rel > 0)) return -1;
  return rel ** (1 / years) - 1;
}

function yearsOf(r: RunResult): number {
  return Math.max(r.days, 1) / 360;
}

function mul(x: number): string { return `${x.toFixed(2)}x`; }
function pp(x: number): string { return `${(x * 100).toFixed(1)}%`; }
function dollars(cents: number): string {
  const n = Math.round(cents / 100);
  const sign = n < 0 ? '-' : '';
  const body = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${body}`;
}

function render(rows: RunResult[], meta: { worlds: number; years: number; pop: number; wallMs: number; cores: number }): string {
  const flags: string[] = [];
  const byBot = (name: string): RunResult[] => rows.filter((r) => r.bot === name && !r.error);
  for (const name of NAMES) {
    const rs = byBot(name);
    if (!rs.length) continue;
    const p10 = pct(rs.map((r) => r.rel), 0.1);
    const indexMed = pct(rs.map((r) => r.indexRel), 0.5);
    if (p10 > indexMed) flags.push(`**${LABEL[name]}** 10th percentile ${mul(p10)} beats the index median ${mul(indexMed)} (too safe).`);
  }
  const idle = byBot('nothing');
  if (idle.length) {
    const idleMed = pct(idle.map((r) => r.rel), 0.5);
    const indexMed = pct(idle.map((r) => r.indexRel), 0.5);
    if (indexMed > 0 && Math.abs(idleMed - indexMed) / indexMed <= 0.2) {
      flags.push(`**do nothing** median ${mul(idleMed)} is within 20% of the index median ${mul(indexMed)} (playing is not rewarded).`);
    }
  }
  const ins = byBot('insider');
  if (ins.length) {
    const hit = ins.filter((r) => r.caught > 0).length;
    if (hit === 0) flags.push('**insider** was never caught.');
    else if (hit === ins.length) flags.push(`**insider** was caught in every run (${hit}/${ins.length}).`);
  }
  const big = rows.filter((r) => !r.error && r.rel > 50);
  for (const r of big) flags.push(`**${LABEL[r.bot]}** seed ${r.seed} finished at ${mul(r.rel)} (above 50×, likely exploit).`);
  for (const r of rows) {
    if (r.error) flags.push(`**${LABEL[r.bot] ?? r.bot}** seed ${r.seed} failed: ${r.error}`);
    for (const t of r.threw) flags.push(`**${LABEL[r.bot]}** seed ${r.seed} act threw: ${t}`);
    if (r.books.length) flags.push(`**${LABEL[r.bot]}** seed ${r.seed} broke the books: ${r.books.join('; ')}`);
  }
  const missing = new Map<string, string>();
  for (const r of rows) if (r.missing) missing.set(r.bot, r.missing);
  if (!flags.length) flags.push('None.');

  const lines: string[] = [];
  lines.push('# Bot balance report');
  lines.push('');
  lines.push(`${meta.worlds} worlds (seeds 1–${meta.worlds}), ${meta.years} years, ${meta.pop.toLocaleString('en-US')} people. Each strategy played each world in its own process, acting once a week through the player. The stock index is the exchange's capitalisation-weighted total return (price change plus dividends reinvested, after the dividend tax a person pays). Books were checked every 30 days and on the last day.`);
  lines.push('');
  lines.push('## Flags');
  lines.push('');
  for (const f of flags) lines.push(`- ${f}`);
  lines.push('');
  lines.push('## Strategies');
  lines.push('');
  lines.push('| Strategy | p10 | median | p90 | bankrupt | dead | prison | caught | ann. return | index ann. | excess |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const name of NAMES) {
    const rs = byBot(name);
    const n = rs.length;
    const share = (k: (r: RunResult) => boolean): string => n ? `${rs.filter(k).length}/${n}` : '–';
    const rels = rs.map((r) => r.rel);
    const excess = rs.map((r) => ann(r.rel, yearsOf(r)) - ann(r.indexRel, yearsOf(r)));
    const anns = rs.map((r) => ann(r.rel, yearsOf(r)));
    const idx = rs.map((r) => ann(r.indexRel, yearsOf(r)));
    const caught = rs.reduce((a, r) => a + r.caught, 0);
    lines.push(`| ${LABEL[name]} | ${n ? mul(pct(rels, 0.1)) : '–'} | ${n ? mul(pct(rels, 0.5)) : '–'} | ${n ? mul(pct(rels, 0.9)) : '–'} | ${share((r) => r.bankrupt)} | ${share((r) => r.dead)} | ${share((r) => r.prison)} | ${caught} | ${n ? pp(pct(anns, 0.5)) : '–'} | ${n ? pp(pct(idx, 0.5)) : '–'} | ${n ? pp(pct(excess, 0.5)) : '–'} |`);
  }
  lines.push('');
  lines.push('Final net worth is the multiple of the player’s worth on day 0. Annualised return uses the days the run actually lived. Excess is that return minus the same world’s index. Caught is charges and convictions of anyone who was the player, counting a case once.');
  lines.push('');
  lines.push('## Exploits');
  lines.push('');
  if (!big.length) lines.push('No run finished above 50× starting net worth.');
  for (const r of big) {
    lines.push(`### ${LABEL[r.bot]} seed ${r.seed} — ${mul(r.rel)}`);
    lines.push('');
    lines.push(`Start ${dollars(r.start)}, end ${dollars(r.end)}, ${r.days} days. Year-end worth: ${r.path.map((p) => `day ${p.day} ${dollars(p.worth)}`).join('; ')}.`);
    lines.push('');
    lines.push('Biggest up-days:');
    lines.push('');
    for (const j of r.jumps) {
      lines.push(`- Day ${j.day}: ${dollars(j.from)} → ${dollars(j.to)}`);
      lines.push('');
      lines.push('```');
      lines.push(j.trace.join('\n\n'));
      lines.push('```');
      lines.push('');
    }
  }
  lines.push('## Missing commands');
  lines.push('');
  if (!missing.size) lines.push('None. Every strategy had the commands it needed.');
  for (const [bot, why] of missing) lines.push(`- **${LABEL[bot]}**: ${why}`);
  lines.push('');
  const cpu = rows.reduce((a, r) => a + r.ms, 0);
  lines.push('## Cost');
  lines.push('');
  lines.push(`Wall clock ${(meta.wallMs / 1000).toFixed(0)}s on ${meta.cores} cores. Sum of run times ${(cpu / 1000).toFixed(0)}s across ${rows.length} runs. No paid model API.`);
  lines.push('');
  return lines.join('\n');
}

function fail(job: Job, error: string): RunResult {
  return {
    bot: job.bot, seed: job.seed, start: 0, end: 0, rel: 0, indexRel: 1,
    days: 0, years: job.years, bankrupt: false, dead: false, prison: false, caught: 0,
    threw: [], books: [], jumps: [], path: [], missing: '', ms: 0, error,
  };
}

function main(): void {
  const worlds = Math.max(1, Math.floor(+arg('worlds', '20')));
  const years = Math.max(1, Math.floor(+arg('years', '20')));
  const pop = arg('pop', '5000');
  const cores = Math.max(1, Math.min(availableParallelism(), worlds * NAMES.length));
  const jobs: Job[] = [];
  for (const bot of NAMES) for (let seed = 1; seed <= worlds; seed++) jobs.push({ bot, seed, years });
  const results: RunResult[] = [];
  const workerPath = fileURLToPath(new URL('./worker.ts', import.meta.url));
  const t0 = Date.now();
  let stopping = false;
  let finished = false;
  let deaths = 0;
  const queue = jobs.slice();

  interface Slot { child: ChildProcess; job: Job | null; timer: ReturnType<typeof setTimeout> | null }
  const slots: Slot[] = [];

  const finish = (): void => {
    if (finished) return;
    if (queue.length || slots.some((s) => s.job)) return;
    finished = true;
    stopping = true;
    for (const s of slots) {
      if (s.timer) clearTimeout(s.timer);
      s.child.kill();
    }
    const wallMs = Date.now() - t0;
    const md = render(results, { worlds, years, pop: +pop, wallMs, cores });
    const out = fileURLToPath(new URL('./bots-report.md', import.meta.url));
    writeFileSync(out, md);
    process.stderr.write(`wrote ${out}\n`);
  };

  const pump = (): void => {
    if (stopping) return;
    for (const s of slots) {
      if (s.job || !queue.length) continue;
      const job = queue.shift();
      if (!job) break;
      s.job = job;
      s.timer = setTimeout(() => {
        process.stderr.write(`timeout ${job.bot} seed ${job.seed}\n`);
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
    child.on('message', (msg: RunResult) => {
      if (slot.timer) clearTimeout(slot.timer);
      slot.timer = null;
      const job = slot.job;
      slot.job = null;
      results.push(msg);
      const left = queue.length + slots.filter((x) => x.job).length;
      process.stderr.write(`done ${msg.bot} seed ${msg.seed} ${msg.error ? 'ERROR ' + msg.error : msg.rel.toFixed(2) + 'x'} ${msg.ms}ms  left ${left}\n`);
      if (!job) return;
      pump();
    });
    child.on('exit', (code) => {
      if (stopping || finished) return;
      if (slot.timer) clearTimeout(slot.timer);
      const job = slot.job;
      const at = slots.indexOf(slot);
      if (at >= 0) slots.splice(at, 1);
      if (job) {
        results.push(fail(job, `worker exited ${code}`));
        process.stderr.write(`died ${job.bot} seed ${job.seed} code ${code}\n`);
      }
      deaths++;
      if (deaths > cores + 2) {
        process.stderr.write('workers keep dying; writing the report with what finished\n');
        queue.length = 0;
        for (const s of slots) s.job = null;
        finish();
        return;
      }
      if (queue.length) slots.push(spawn());
      pump();
    });
    return slot;
  };

  for (let i = 0; i < cores; i++) slots.push(spawn());
  pump();
}

const entry = process.argv[1] ?? '';
if (entry.endsWith('run.ts') || entry.endsWith('run.js')) main();
