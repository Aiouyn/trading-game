// node sim/replay.ts --log <file>
// node sim/replay.ts --hashes 200 --seed 1
// node sim/replay.ts --verify <code> --log <file>
// Rebuilds a played world from its seed, scenario and command log.
// --log checks the ledger hash at each day. --verify checks a claimed challenge score.
import type { World } from './kernel/index.ts';
import { openWorld } from './run.ts';
import { commandHash, parseCode } from './modules/history/commands.ts';
import { act, ensurePlayer, type Command } from './modules/player/index.ts';
import { readPlayerLog, type PlayerLogFile } from './modules/player/log.ts';
import { openScenario, runOf, scoreOf } from './modules/player/scenarios.ts';

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

function openFresh(log: PlayerLogFile): ReturnType<typeof openWorld> {
  const w = openWorld(log.seed, new Set());
  ensurePlayer(w);
  return w;
}

function worldOf(log: PlayerLogFile): World {
  return log.scenario
    ? openScenario(log.scenario.id, {
      cash: log.scenario.cash,
      difficulty: log.scenario.difficulty,
      seed: log.scenario.seed,
    })
    : openFresh(log);
}

/** Replays the log. On success the world is the one the commands built. */
export function replayLog(file: string): { ok: boolean; lines: string[]; world?: World } {
  let log: PlayerLogFile;
  try { log = readPlayerLog(file); }
  catch (err) { return { ok: false, lines: [err instanceof Error ? err.message : String(err)] }; }
  let w: World;
  try { w = worldOf(log); }
  catch (err) { return { ok: false, lines: [err instanceof Error ? err.message : String(err)] }; }
  for (let n = 0; n < log.commands.length; n++) {
    const entry = log.commands[n];
    if (w.day !== entry.day) {
      return { ok: false, lines: [`command ${n} was issued on day ${entry.day} but the rebuilt world is on day ${w.day}`] };
    }
    const result = act(w, entry.playerId, entry.cmd as Command);
    if (result.books) return { ok: false, lines: [`books failed on replay: ${result.books}`] };
    if (result.status !== entry.status) {
      return { ok: false, lines: [`command ${n} on day ${entry.day} was ${entry.status} and replayed as ${result.status}${result.why ? `: ${result.why}` : ''}`] };
    }
  }
  const days = (w.state.player as PlayerLogFile | undefined)?.days ?? [];
  if (days.length !== log.days.length) {
    return { ok: false, lines: [`replay recorded ${days.length} daily hashes, the log has ${log.days.length}`] };
  }
  for (let i = 0; i < days.length; i++) {
    if (days[i].day !== log.days[i].day || days[i].hash !== log.days[i].hash) {
      return { ok: false, lines: [`day ${log.days[i].day} hash ${days[i].hash} != recorded ${log.days[i].hash}`] };
    }
  }
  return { ok: true, lines: [`replay ok: ${log.commands.length} commands, ${days.length} days, hash ${w.ledger.hash()}`], world: w };
}

export function verifyChallenge(code: string, file: string): { ok: boolean; lines: string[] } {
  let claim;
  try { claim = parseCode(code); }
  catch (err) { return { ok: false, lines: [err instanceof Error ? err.message : String(err)] }; }
  let log: PlayerLogFile;
  try { log = readPlayerLog(file); }
  catch (err) { return { ok: false, lines: [err instanceof Error ? err.message : String(err)] }; }
  const hash = commandHash(log.commands);
  if (hash !== claim.hash) return { ok: false, lines: [`command hash ${hash} does not match the code`] };
  const scenario = log.scenario?.id ?? '';
  if (scenario !== claim.scenario) return { ok: false, lines: [`log scenario ${scenario || '(none)'} is not ${claim.scenario}`] };
  if (log.seed !== claim.seed) return { ok: false, lines: [`log seed ${log.seed} is not ${claim.seed}`] };
  const difficulty = log.scenario?.difficulty && log.scenario.difficulty > 0 ? log.scenario.difficulty : 1;
  if (Math.round(difficulty * 100) !== Math.round(claim.difficulty * 100)) {
    return { ok: false, lines: [`log difficulty ${difficulty} is not ${claim.difficulty}`] };
  }
  const played = replayLog(file);
  if (!played.ok || !played.world) return played;
  const sc = runOf(played.world);
  const worth = Math.round(sc ? scoreOf(played.world, sc).worth : 0);
  if (worth !== claim.score) return { ok: false, lines: [`replayed score ${worth} does not match the claimed ${claim.score}`] };
  return { ok: true, lines: [`verified ${code}`, `score ${worth} matches`, `command hash ${hash}`] };
}

function main(): void {
  if (process.argv.includes('--hashes')) {
    hashes(+arg('hashes', '200'), arg('seed', '1'));
    return;
  }
  if (process.argv.includes('--verify')) {
    const code = arg('verify', '');
    const file = arg('log', '');
    if (!code || !file) {
      console.error('usage: node sim/replay.ts --verify <code> --log <file>');
      process.exit(1);
    }
    const result = verifyChallenge(code, file);
    for (const line of result.lines) console.log(line);
    if (!result.ok) process.exit(1);
    return;
  }
  if (process.argv.includes('--log')) {
    const result = replayLog(arg('log', ''));
    for (const line of result.lines) console.log(line);
    if (!result.ok) process.exit(1);
    return;
  }
  console.error('usage: node sim/replay.ts --log <file> | node sim/replay.ts --verify <code> --log <file> | node sim/replay.ts --hashes 200 --seed 1');
  process.exit(1);
}

const entry = process.argv[1] ?? '';
if (entry.endsWith('replay.ts') || entry.endsWith('replay.js')) main();
