// A challenge code: scenario, seed, difficulty, score, and a hash of the command log
// that work order 48 records on the player (day, player id, command, status).
import { createHash } from 'node:crypto';
import type { World } from '../../kernel/index.ts';

export interface ChallengeCode {
  scenario: string;
  seed: string;
  difficulty: number;
  score: number;
  hash: string;
}

interface LogRow {
  day: number;
  playerId: string;
  status: string;
  why?: string;
  cmd: unknown;
}

function canon(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canon);
  if (value && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) if (src[k] !== undefined) out[k] = canon(src[k]);
    return out;
  }
  return value;
}

export function canonRow(row: LogRow): string {
  return `${row.day}\t${row.playerId}\t${row.status}\t${row.why ?? ''}\t${JSON.stringify(canon(row.cmd))}`;
}

/** First 16 hex chars of the sha256 of the canonical command rows. */
export function commandHash(rows: LogRow[]): string {
  const h = createHash('sha256');
  for (const row of rows) h.update(canonRow(row) + '\n');
  return h.digest('hex').slice(0, 16);
}

function rowsOf(w: World): LogRow[] {
  const st = w.state.player as { log?: LogRow[] } | undefined;
  return st?.log ?? [];
}

export function formatCode(c: ChallengeCode): string {
  const diff = Math.round(c.difficulty * 100);
  return `PA1.${c.scenario}.${c.seed}.${diff}.${Math.round(c.score)}.${c.hash}`;
}

export function parseCode(code: string): ChallengeCode {
  const raw = code.trim();
  if (!raw.startsWith('PA1.')) throw new Error('a challenge code starts with PA1');
  const parts = raw.slice(4).split('.');
  if (parts.length < 5) throw new Error('a challenge code needs scenario, seed, difficulty, score and hash');
  const hash = parts.pop() ?? '';
  const score = Number(parts.pop());
  const diff = Number(parts.pop());
  const seed = parts.pop() ?? '';
  const scenario = parts.join('.');
  if (!scenario || !seed) throw new Error('a challenge code needs a scenario and a seed');
  if (!/^[0-9a-f]{16}$/.test(hash)) throw new Error('a challenge code has a bad command hash');
  if (!Number.isInteger(score)) throw new Error('a challenge code has a bad score');
  if (!Number.isInteger(diff) || diff <= 0) throw new Error('a challenge code has a bad difficulty');
  return { scenario, seed, difficulty: diff / 100, score, hash };
}

export function challengeOf(w: World, score: number): string {
  const sc = w.state.scenario as { id?: string; difficulty?: number } | undefined;
  const script = (w.state.player as { script?: { difficulty?: number } | null } | undefined)?.script;
  const difficulty = sc?.difficulty && sc.difficulty > 0 ? sc.difficulty : (script?.difficulty && script.difficulty > 0 ? script.difficulty : 1);
  return formatCode({
    scenario: sc?.id || scriptId(w) || 'sandbox',
    seed: w.seed,
    difficulty,
    score: Math.round(score),
    hash: commandHash(rowsOf(w)),
  });
}

function scriptId(w: World): string {
  const script = (w.state.player as { script?: { id?: string } | null } | undefined)?.script;
  return script?.id ?? '';
}
