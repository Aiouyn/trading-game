import { ChallengeBoard } from './board';
import { exportRun, importRun, serializeRun } from './runfile';
import { Sandbox, SandboxError, onlyKeys, plainObject, type SandboxSpec } from './sandbox';

/**
 * The sandbox's request surface: one dispatch function over plain data. The worker and the in-page fallback both
 * call it, so a test that drives `dispatch` exercises exactly what the UI gets.
 */
export interface Registry {
  sandboxes: Map<string, Sandbox>;
  board: ChallengeBoard;
  nextId: number;
}

export function createRegistry(): Registry {
  return { sandboxes: new Map(), board: new ChallengeBoard(), nextId: 0 };
}

/** A stable code for any failure (a SandboxError keeps its code; anything else is 'internal'). */
export function errorCode(e: unknown): string {
  return e instanceof SandboxError ? e.code : 'internal';
}

export function dispatch(reg: Registry, raw: unknown): unknown {
  const o = plainObject(raw, 'bad-spec');
  switch (o.op) {
    case 'create': {
      const sb = Sandbox.create(parseSpec(o.spec));
      return register(reg, sb);
    }
    case 'import': {
      if (typeof o.text !== 'string') throw new SandboxError('bad-run', 'text');
      return register(reg, importRun(o.text));
    }
    case 'step': {
      const sb = get(reg, o.id);
      if (typeof o.ticks !== 'number') throw new SandboxError('bad-ticks');
      return sb.step(o.ticks);
    }
    case 'act':
      return get(reg, o.id).act(o.command);
    case 'view':
      return get(reg, o.id).view();
    case 'market':
      return get(reg, o.id).market();
    case 'export':
      return { text: serializeRun(exportRun(get(reg, o.id))) };
    case 'submit':
      return reg.board.submit(get(reg, o.id));
    case 'leaderboard': {
      if (typeof o.weekKey !== 'string') throw new SandboxError('bad-spec', 'week');
      return reg.board.top(o.weekKey);
    }
    case 'close': {
      get(reg, o.id);
      reg.sandboxes.delete(String(o.id));
      return { ok: true };
    }
    default:
      throw new SandboxError('bad-spec', 'op');
  }
}

function register(reg: Registry, sb: Sandbox): { id: string; plan: Sandbox['plan']; origin: Sandbox['origin']; tick: number } {
  const id = `s${++reg.nextId}`;
  reg.sandboxes.set(id, sb);
  return { id, plan: sb.plan, origin: sb.origin, tick: sb.tick };
}

function get(reg: Registry, id: unknown): Sandbox {
  const sb = typeof id === 'string' ? reg.sandboxes.get(id) : undefined;
  if (!sb) throw new SandboxError('bad-id');
  return sb;
}

function parseSpec(raw: unknown): SandboxSpec {
  const s = plainObject(raw, 'bad-spec');
  if (s.kind === 'practice') {
    onlyKeys(s, ['kind', 'id'], 'bad-spec');
    if (typeof s.id !== 'string') throw new SandboxError('bad-id');
    return { kind: 'practice', id: s.id };
  }
  if (s.kind === 'scenario') {
    onlyKeys(s, ['kind', 'scenarioId'], 'bad-spec');
    if (typeof s.scenarioId !== 'string') throw new SandboxError('unknown-scenario');
    return { kind: 'scenario', scenarioId: s.scenarioId };
  }
  if (s.kind === 'challenge') {
    onlyKeys(s, ['kind', 'weekKey'], 'bad-spec');
    if (typeof s.weekKey !== 'string') throw new SandboxError('bad-spec', 'week');
    return { kind: 'challenge', weekKey: s.weekKey };
  }
  throw new SandboxError('bad-spec', 'kind');
}
