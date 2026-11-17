// One style, one scenario, one seed. The parent forks this file.
import { DAYS_PER_YEAR, type World } from '../kernel/index.ts';
import { act, view } from '../modules/player/index.ts';
import { openScenario, reviewScenario, runOf } from '../modules/player/scenarios.ts';
import { commands } from './scenario-bots.ts';
import type { ScenarioJob, ScenarioResult } from './scenario-result.ts';

const why = (e: unknown): string => e instanceof Error ? `${e.message} :: ${(e.stack ?? '').split('\n').slice(1, 12).join(' | ')}` : String(e);

function blank(job: ScenarioJob, error: string): ScenarioResult {
  return {
    style: job.style, scenario: job.scenario, seed: job.seed,
    win: false, ruin: false, start: 0, end: 0, days: 0, outcome: '', reason: '', ms: 0, error,
  };
}

export function runScenario(job: ScenarioJob): ScenarioResult {
  const t0 = Date.now();
  let w: World;
  try { w = openScenario(job.scenario, { seed: String(job.seed) }); }
  catch (e) { return blank(job, why(e)); }
  const start = view(w).netWorth;
  const sc0 = runOf(w);
  const cap = sc0 && sc0.limit > 0 ? sc0.deadline : w.day + 3 * DAYS_PER_YEAR;
  let error = '';
  while (w.day < cap) {
    const sc = runOf(w);
    if (sc?.outcome) break;
    const v = view(w);
    if (!v.alive || v.over) break;
    if (w.day % 7 === 0) {
      try {
        const cmds = commands(job.style, v, w);
        for (const cmd of cmds) {
          try { act(w, cmd); }
          catch (e) { error = error || why(e); }
        }
      } catch (e) { error = error || why(e); }
    }
    try { w.step(); }
    catch (e) { error = why(e); break; }
    try { reviewScenario(w); }
    catch (e) { error = why(e); break; }
    if (w.day % 30 === 0) {
      const bad = w.ledger.check();
      if (bad.length) { error = bad.slice(0, 4).join('; '); break; }
    }
  }
  const end = view(w);
  const sc = runOf(w);
  const ruin = !end.alive || end.netWorth <= 0;
  return {
    style: job.style,
    scenario: job.scenario,
    seed: job.seed,
    win: sc?.outcome === 'win',
    ruin,
    start,
    end: end.netWorth,
    days: w.day,
    outcome: sc?.outcome ?? '',
    reason: sc?.reason ?? '',
    ms: Date.now() - t0,
    error: error || undefined,
  };
}

const entry = process.argv[1] ?? '';
if (entry.endsWith('scenario-worker.ts') || entry.endsWith('scenario-worker.js')) {
  process.on('message', (job: ScenarioJob) => {
    try { process.send?.(runScenario(job)); }
    catch (e) { process.send?.(blank(job, why(e))); }
  });
}
