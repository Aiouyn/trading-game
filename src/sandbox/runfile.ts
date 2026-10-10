import type { RegimeId } from '@/engine';
import { SANDBOX } from './config';
import { planFor, Sandbox, SandboxError, onlyKeys, parseCommand, plainObject, type SandboxCommand, type SandboxSpec } from './sandbox';

/**
 * M11 run files: a sandbox run exported as JSON (explicit export only, never automatic).
 *
 * A run file holds the sandbox's own seed, the scenario or challenge it came from, the paper cash, the commands
 * with the tick each was applied at, and a digest of the final state. It never holds a live world seed, a player id,
 * chat, rival positions or any other account's data. Import is strict: a fixed key set, a size cap, a command cap,
 * and every value checked against the plan the header names. The commands are then replayed in the engine and the
 * digest must match. Nothing in a file is ever executed.
 */

const RUN_KEYS = [
  'format', 'version', 'configVersion', 'engineVersion', 'kind', 'sandboxSeed', 'scenarioId', 'weekKey',
  'startingCash', 'initialRegime', 'ticks', 'commands', 'digest',
] as const;
const ENTRY_KEYS = ['tick', 'command'] as const;
const DIGEST = /^[0-9a-f]{16}$/;

export interface RunFile {
  format: string;
  version: number;
  configVersion: number;
  engineVersion: number;
  kind: 'practice' | 'scenario' | 'challenge';
  sandboxSeed: string;
  scenarioId: string | null;
  weekKey: string | null;
  startingCash: number;
  initialRegime: RegimeId;
  /** ticks the run has stepped to */
  ticks: number;
  commands: { tick: number; command: SandboxCommand }[];
  digest: string;
}

/** The run file for a sandbox. Refuses a run longer than the cap, or with too many commands. */
export function exportRun(sb: Sandbox): RunFile {
  const snap = sb.snapshotLog();
  if (snap.ticks > SANDBOX.maxRunDays * sb.ticksPerDay) throw new SandboxError('run-too-long');
  if (snap.commands.length > SANDBOX.maxRunCommands) throw new SandboxError('run-too-large');
  return {
    format: SANDBOX.runFormat,
    version: SANDBOX.runVersion,
    configVersion: SANDBOX.configVersion,
    engineVersion: sb.engineVersion,
    kind: sb.plan.kind,
    sandboxSeed: sb.plan.seed,
    scenarioId: sb.plan.scenarioId,
    weekKey: sb.plan.weekKey,
    startingCash: sb.plan.cash,
    initialRegime: sb.plan.initialRegime,
    ticks: snap.ticks,
    commands: snap.commands,
    digest: snap.digest,
  };
}

/** The file's text. Refuses a file above the byte cap. */
export function serializeRun(run: RunFile): string {
  const text = JSON.stringify(run);
  if (byteLength(text) > SANDBOX.maxRunBytes) throw new SandboxError('run-too-large');
  return text;
}

/**
 * Parse, validate and replay a run file. Returns a sandbox with the imported origin, at the file's last tick, with
 * the same digest. Throws a SandboxError with a stable code on any problem.
 */
export function importRun(text: string): Sandbox {
  if (typeof text !== 'string' || byteLength(text) > SANDBOX.maxRunBytes) throw new SandboxError('run-too-large');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SandboxError('bad-run', 'json');
  }
  const o = plainObject(parsed, 'bad-run');
  onlyKeys(o, RUN_KEYS, 'bad-run');
  for (const k of RUN_KEYS) if (!(k in o)) throw new SandboxError('bad-run', `missing ${k}`);

  if (o.format !== SANDBOX.runFormat || o.version !== SANDBOX.runVersion || o.configVersion !== SANDBOX.configVersion) {
    throw new SandboxError('bad-version');
  }
  const kind = o.kind;
  if (kind !== 'practice' && kind !== 'scenario' && kind !== 'challenge') throw new SandboxError('bad-run', 'kind');
  const seed = str(o.sandboxSeed, 'seed');
  const scenarioId = nullableStr(o.scenarioId, 'scenarioId');
  const weekKey = nullableStr(o.weekKey, 'weekKey');
  const startingCash = o.startingCash;
  if (typeof startingCash !== 'number' || !Number.isFinite(startingCash)) throw new SandboxError('bad-run', 'cash');
  const initialRegime = str(o.initialRegime, 'regime');

  // the header must name a plan the code derives: no free seeds, no free cash, no free regime
  const spec = specFromHeader(kind, seed, scenarioId, weekKey);
  const plan = planFor(spec);
  if (
    plan.seed !== seed || plan.cash !== startingCash || plan.initialRegime !== initialRegime
    || plan.scenarioId !== scenarioId || plan.weekKey !== weekKey || plan.kind !== kind
  ) {
    throw new SandboxError('bad-run', 'header does not match its plan');
  }

  const sb = Sandbox.forImport(plan);
  if (o.engineVersion !== sb.engineVersion) throw new SandboxError('bad-version', 'engine');

  const ticks = o.ticks;
  const longest = SANDBOX.maxRunDays * sb.ticksPerDay;
  const cap = plan.days === null ? longest : Math.min(plan.days * sb.ticksPerDay, longest);
  if (typeof ticks !== 'number' || !Number.isInteger(ticks) || ticks < 0 || ticks > cap) throw new SandboxError('bad-ticks');

  if (!Array.isArray(o.commands)) throw new SandboxError('bad-run', 'commands');
  if (o.commands.length > SANDBOX.maxRunCommands) throw new SandboxError('run-too-large');
  const entries: { tick: number; command: SandboxCommand }[] = [];
  let prev = 0;
  for (const raw of o.commands as unknown[]) {
    const e = plainObject(raw, 'bad-run');
    onlyKeys(e, ENTRY_KEYS, 'bad-run');
    const tick = e.tick;
    if (typeof tick !== 'number' || !Number.isInteger(tick) || tick < prev || tick > ticks) throw new SandboxError('bad-ticks');
    prev = tick;
    entries.push({ tick, command: parseCommand(e.command) });
  }

  if (typeof o.digest !== 'string' || !DIGEST.test(o.digest)) throw new SandboxError('bad-run', 'digest');
  try {
    for (const entry of entries) {
      sb.replayStep(entry.tick - sb.tick);
      sb.replayAct(entry);
    }
    sb.replayStep((ticks as number) - sb.tick);
  } catch (e) {
    if (e instanceof SandboxError) throw e;
    throw new SandboxError('replay-rejected');
  }
  if (sb.digest() !== o.digest) throw new SandboxError('digest-mismatch');
  return sb;
}

function specFromHeader(kind: 'practice' | 'scenario' | 'challenge', seed: string, scenarioId: string | null, weekKey: string | null): SandboxSpec {
  if (kind === 'practice') {
    const prefix = `${SANDBOX.seedPrefix}practice:`;
    if (!seed.startsWith(prefix) || scenarioId !== null || weekKey !== null) throw new SandboxError('bad-run', 'practice header');
    return { kind: 'practice', id: seed.slice(prefix.length) };
  }
  if (kind === 'scenario') {
    if (scenarioId === null || weekKey !== null) throw new SandboxError('bad-run', 'scenario header');
    return { kind: 'scenario', scenarioId };
  }
  // a challenge names its week; the scenario it plays is derived from the week and checked against the plan below
  if (weekKey === null) throw new SandboxError('bad-run', 'challenge header');
  return { kind: 'challenge', weekKey };
}

function str(v: unknown, field: string): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > 200) throw new SandboxError('bad-run', field);
  return v;
}

function nullableStr(v: unknown, field: string): string | null {
  if (v === null) return null;
  return str(v, field);
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
