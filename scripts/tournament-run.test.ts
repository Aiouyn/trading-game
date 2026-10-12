import { describe, expect, it } from 'vitest';
import { fork } from 'node:child_process';
import path from 'node:path';
import { runInput, type RunnerInput } from './tournament-run';
import { tournamentConfig } from '../src/world/tournament';
import { runWeekRows, type SettlementEntry } from '../src/world/tournamentWeek';

const SCRIPT = path.resolve(process.cwd(), 'scripts/tournament-run.ts');
const ASSETS = tournamentConfig().assets.filter((a) => a.assetClass === 'stock' && a.listed !== false).slice(0, 4).map((a) => a.id);

/** A one-entry week's input, with a short horizon: the runner is the same at any horizon. */
function input(publishLog: boolean): RunnerInput {
  const entry: SettlementEntry = {
    id: 'entry:p-test', handle: 'test', publishLog,
    actor: { id: 'entry:p-test', strategy: 'momentum', assets: ASSETS, allocation: 0.5, mcs: 90 },
  };
  return { seeds: ['seed-a1', 'seed-b2', 'seed-c3'], entries: [entry], days: 1 };
}

/** Run the script as a forked child, as the server does, and return its reply. */
function forked(data: RunnerInput): Promise<{ ok: boolean; rows?: unknown; error?: string }> {
  return new Promise((resolve, reject) => {
    const child = fork(SCRIPT, [], {
      execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'inherit', 'ipc'], env: { ...process.env, TOURNAMENT_RUNNER_CHILD: '1' },
    });
    child.on('message', (m) => resolve(m as { ok: boolean; rows?: unknown; error?: string }));
    child.on('exit', (code) => { if (code !== 0 && code !== null) reject(new Error(`runner exited ${code}`)); });
    child.send(data);
  });
}

describe('the off-tick tournament runner', () => {
  it('the in-process core returns the rows of every entry and house AI, and the same rows on a second run', () => {
    const a = runInput(input(false));
    expect(a.filter((r) => r.kind === 'house')).toHaveLength(5);
    expect(a.filter((r) => r.kind === 'entry')).toHaveLength(1);
    expect(runInput(input(false))).toEqual(a);
    expect(runWeekRows({ seeds: ['seed-a1', 'seed-b2', 'seed-c3'], entries: input(false).entries }, 1)).toEqual(a);
  });

  it('the forked child returns the same rows as the in-process run (the server path reproduces the test path)', async () => {
    const reply = await forked(input(true));
    expect(reply.ok).toBe(true);
    expect(reply.rows).toEqual(runInput(input(true)));
    // the single entry is top three and opted in, so it carries its one-seed trade log; the house rows carry none
    const rows = reply.rows as { kind: string; log?: { seed: string } }[];
    expect(rows.find((r) => r.kind === 'entry')!.log!.seed).toBe('seed-a1');
    expect(rows.filter((r) => r.kind === 'house' && r.log)).toHaveLength(0);
  }, 120_000);
});
