/**
 * The off-tick tournament runner (ROADMAP §2.4, N8). The world server forks this file for a due week (server/tournamentJob.ts)
 * and sends the settlement input over IPC; it runs every entry and house AI over the week's seeds and sends the rows back.
 * The rows are then submitted as a logged `tournament.settle` command, so a replay applies the same rows.
 *
 *   forked:  the parent sends { seeds, entries, days? }, and gets { ok: true, rows } or { ok: false, error }
 *   by hand: `npx tsx scripts/tournament-run.ts <input.json>` prints the rows as JSON (a week's input, saved from a snapshot)
 *
 * The same function backs the tests (scripts/tournament-run.test.ts), so a test that runs it reproduces the server's rows.
 */
import { readFileSync } from 'node:fs';
import { TOURNAMENT } from '../src/world/tournament';
import { runWeekRows, type SettlementEntry } from '../src/world/tournamentWeek';

export interface RunnerInput {
  seeds: string[];
  entries: SettlementEntry[];
  days?: number;
}

/** The runner's pure core: the rows of one week, from its input. */
export function runInput(input: RunnerInput) {
  return runWeekRows(input, input.days ?? TOURNAMENT.days);
}

// The IPC branch runs only in a child that the server or the test forked with TOURNAMENT_RUNNER_CHILD=1. Any other process
// that has IPC (a vitest worker, for one) imports this file without taking its messages.
if (process.env.TOURNAMENT_RUNNER_CHILD === '1' && process.send) {
  // one job, then disconnect so the child exits
  process.on('message', (msg: RunnerInput) => {
    let reply: { ok: true; rows: ReturnType<typeof runInput> } | { ok: false; error: string };
    try {
      reply = { ok: true, rows: runInput(msg) };
    } catch (e) {
      reply = { ok: false, error: (e as Error).message };
    }
    process.send!(reply, () => process.disconnect?.());
  });
} else if (!process.send && !process.env.VITEST && process.argv[2]) {
  const input = JSON.parse(readFileSync(process.argv[2], 'utf8')) as RunnerInput;
  console.log(JSON.stringify(runInput(input)));
}
