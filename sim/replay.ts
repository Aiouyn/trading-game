// node sim/replay.ts --log <file>
// node sim/replay.ts --hashes 200 --seed 1
// Rebuilds a played world from its seed, scenario and command log, and checks the ledger hash at each day.
import { openWorld } from './run.ts';
import { act, ensurePlayer, type Command } from './modules/player/index.ts';
import { openScenario } from './modules/player/scenarios.ts';
import { readPlayerLog, type PlayerLogFile } from './modules/player/log.ts';

const arg = (k: string, d: string): string => {
  const i = process.argv.indexOf('--' + k);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

function hashes(n: number, seed: string): void {
  const w = openWorld(seed, new Set());
  for (let i = 0; i < n; i++) {
    w.step();
    console.log(`${w.day - 1} ${w.ledger.hash()}`);
  }
}

function replay(file: string): void {
  const log = readPlayerLog(file);
  const w = log.scenario
    ? openScenario(log.scenario.id, {
      cash: log.scenario.cash,
      difficulty: log.scenario.difficulty,
      seed: log.scenario.seed,
    })
    : openFresh(log);
  for (let n = 0; n < log.commands.length; n++) {
    const entry = log.commands[n];
    if (w.day !== entry.day) {
      console.error(`command ${n} was issued on day ${entry.day} but the rebuilt world is on day ${w.day}`);
      process.exit(1);
    }
    const result = act(w, entry.playerId, entry.cmd as Command);
    if (result.status !== entry.status) {
      console.error(`command ${n} on day ${entry.day} was ${entry.status} and replayed as ${result.status}${result.why ? `: ${result.why}` : ''}`);
      process.exit(1);
    }
  }
  const days = (w.state.player as PlayerLogFile | undefined)?.days ?? [];
  if (days.length !== log.days.length) {
    console.error(`replay recorded ${days.length} daily hashes, the log has ${log.days.length}`);
    process.exit(1);
  }
  for (let i = 0; i < days.length; i++) {
    if (days[i].day !== log.days[i].day || days[i].hash !== log.days[i].hash) {
      console.error(`day ${log.days[i].day} hash ${days[i].hash} != recorded ${log.days[i].hash}`);
      process.exit(1);
    }
  }
  console.log(`replay ok: ${log.commands.length} commands, ${days.length} days, hash ${w.ledger.hash()}`);
}

function openFresh(log: PlayerLogFile): ReturnType<typeof openWorld> {
  const w = openWorld(log.seed, new Set());
  ensurePlayer(w);
  return w;
}

const entry = process.argv[1] ?? '';
if (entry.endsWith('replay.ts') || entry.endsWith('replay.js')) {
  if (process.argv.includes('--hashes')) hashes(+arg('hashes', '200'), arg('seed', '1'));
  else if (process.argv.includes('--log')) replay(arg('log', ''));
  else {
    console.error('usage: node sim/replay.ts --log <file> | node sim/replay.ts --hashes 200 --seed 1');
    process.exit(1);
  }
}
