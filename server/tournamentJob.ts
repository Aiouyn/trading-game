import { fork } from 'node:child_process';
import path from 'node:path';
import { dueSettlements, settlementInput, type SettlementEntry } from '../src/world/tournamentWeek';
import type { GameState, TournamentRowRecord } from '../src/world/types';

/**
 * The weekly tournament's scheduled settlement (ROADMAP §2.4). Once a week has locked (its entries are closed and its tick has
 * passed), the server runs the week's isolated runs in a child process, off the tick loop, and submits the rows as a
 * logged `tournament.settle` command. Only one settlement runs at a time. A failed run waits ten real minutes before the
 * next try, so a crashing runner does not loop; a server restart re-detects every unsettled due week.
 *
 * The child is scripts/tournament-run.ts, forked with tsx so the TypeScript sources load the same way the server does.
 */

const RETRY_MS = 10 * 60 * 1000;

export class TournamentJob {
  private running: number | null = null;
  private retryAt = 0;

  constructor(
    private readonly submit: (week: number, seeds: string[], rows: TournamentRowRecord[]) => void,
    private readonly log: (m: string) => void,
    private readonly script: string = path.resolve(process.cwd(), 'scripts/tournament-run.ts'),
  ) {}

  /** The job's state for the admin readout: the week whose run is in flight (or null), and the ms until a failed run may retry. */
  status(now: number = Date.now()): { running: number | null; retryInMs: number } {
    return { running: this.running, retryInMs: Math.max(0, this.retryAt - now) };
  }

  /** The week whose run is in flight, or null. */
  get inFlight(): number | null {
    return this.running;
  }

  /** Start the earliest due week's run, if no run is in flight and the last failure's wait is over. Call from the tick loop, slowly. */
  check(g: GameState): void {
    if (this.running !== null || Date.now() < this.retryAt) return;
    const week = dueSettlements(g)[0];
    if (week === undefined) return;
    const input = settlementInput(g, week);
    if (!input) return;
    this.running = week;
    this.log(`tournament week ${week} is due: ${input.entries.length} entries over ${input.seeds.length} seeds, run off the tick loop`);
    const child = fork(this.script, [], {
      execArgv: ['--import', 'tsx'], stdio: ['ignore', 'inherit', 'inherit', 'ipc'], env: { ...process.env, TOURNAMENT_RUNNER_CHILD: '1' },
    });
    let answered = false;
    child.on('message', (m: { ok: true; rows: TournamentRowRecord[] } | { ok: false; error: string }) => {
      answered = true;
      if (m.ok) {
        this.submit(week, input.seeds, m.rows);
        this.log(`tournament week ${week} settled: ${m.rows.length} rows`);
      } else {
        this.fail(week, m.error);
      }
    });
    child.on('exit', (code) => {
      if (!answered) this.fail(week, `runner exited with code ${code}`);
      this.running = null;
    });
    child.send({ seeds: input.seeds, entries: input.entries as SettlementEntry[] });
  }

  private fail(week: number, error: string): void {
    this.retryAt = Date.now() + RETRY_MS;
    this.log(`tournament week ${week} run failed (${error}); retrying in ten minutes`);
  }
}
