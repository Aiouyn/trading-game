import { describe, expect, it } from 'vitest';
import { ChallengeBoard } from './board';
import { exportRun, importRun, serializeRun } from './runfile';
import { createRegistry, dispatch } from './rpc';
import { Sandbox, SandboxError } from './sandbox';

const TICKS_PER_DAY = 720;
const WEEK = '2026-W41';

function errorOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof SandboxError) return e.code;
    throw e;
  }
  return 'no-error';
}

/** a finished challenge run for the week, optionally with one market buy of gold */
function finishedChallenge(buyGold: boolean): Sandbox {
  const sb = Sandbox.create({ kind: 'challenge', weekKey: WEEK });
  if (buyGold) sb.act({ type: 'place', order: { assetId: 'GOLD', side: 'buy', type: 'market', qty: 1 } });
  sb.step(21 * TICKS_PER_DAY);
  return sb;
}

describe('weekly challenge board (local, unranked runs excluded)', () => {
  it('a practice run cannot be submitted', () => {
    const board = new ChallengeBoard();
    const sb = Sandbox.create({ kind: 'practice', id: 'nope' });
    expect(errorOf(() => board.submit(sb))).toBe('not-ranked');
  });

  it('a challenge that has not reached its last tick cannot be submitted', () => {
    const board = new ChallengeBoard();
    const sb = Sandbox.create({ kind: 'challenge', weekKey: WEEK });
    sb.step(TICKS_PER_DAY);
    expect(errorOf(() => board.submit(sb))).toBe('not-complete');
  });

  it('an imported run is never ranked', () => {
    const board = new ChallengeBoard();
    const sb = finishedChallenge(false);
    const back = importRun(serializeRun(exportRun(sb)));
    expect(errorOf(() => board.submit(back))).toBe('not-ranked');
  }, 120_000);

  it('a finished run is scored once, and the board holds only score fields', () => {
    const board = new ChallengeBoard();
    const sb = finishedChallenge(false);
    const first = board.submit(sb);
    const again = board.submit(sb);
    expect(again).toEqual(first);
    expect(Object.keys(first).sort()).toEqual(['days', 'equity', 'returnPct', 'scenarioId', 'seq', 'weekKey']);
    expect(board.top(WEEK)).toHaveLength(1);
  }, 120_000);

  it('the week board is ordered by equity, ties keep the earlier entry, and it keeps only the top entries', () => {
    const board = new ChallengeBoard();
    const flat = finishedChallenge(false);
    const bought = finishedChallenge(true);
    board.submit(flat);
    board.submit(bought);
    const rows = board.top(WEEK);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.equity).toBeGreaterThanOrEqual(rows[1]!.equity);
    expect(board.top(WEEK, 1)).toHaveLength(1);
    expect(board.top('2026-W42')).toHaveLength(0);
  }, 240_000);
});

describe('sandbox request surface (what the worker and the page call)', () => {
  it('create, act, step, view and close a practice sandbox through dispatch', () => {
    const reg = createRegistry();
    const made = dispatch(reg, { op: 'create', spec: { kind: 'practice', id: 'api' } }) as { id: string; tick: number; origin: string };
    expect(made.origin).toBe('live');
    const acted = dispatch(reg, { op: 'act', id: made.id, command: { type: 'place', order: { assetId: 'GOLD', side: 'buy', type: 'market', qty: 1 } } }) as { ok: boolean };
    expect(acted.ok).toBe(true);
    const stepped = dispatch(reg, { op: 'step', id: made.id, ticks: 720 }) as { tick: number };
    expect(stepped.tick).toBe(720);
    const v = dispatch(reg, { op: 'view', id: made.id }) as { portfolio: { cash: number } };
    expect(v.portfolio.cash).toBeLessThan(5000);
    expect(dispatch(reg, { op: 'close', id: made.id })).toEqual({ ok: true });
    expect(errorOf(() => dispatch(reg, { op: 'view', id: made.id }))).toBe('bad-id');
  }, 60_000);

  it('export then import through dispatch gives a live-to-imported copy of the same run', () => {
    const reg = createRegistry();
    const a = dispatch(reg, { op: 'create', spec: { kind: 'practice', id: 'pair' } }) as { id: string };
    dispatch(reg, { op: 'step', id: a.id, ticks: 1000 });
    const text = (dispatch(reg, { op: 'export', id: a.id }) as { text: string }).text;
    const b = dispatch(reg, { op: 'import', text }) as { id: string; origin: string; tick: number };
    expect(b.origin).toBe('imported');
    expect(b.tick).toBe(1000);
    expect((dispatch(reg, { op: 'export', id: b.id }) as { text: string }).text).toBe(text);
  }, 60_000);

  it('refuses unknown operations, unknown scenarios and malformed specs with codes', () => {
    const reg = createRegistry();
    expect(errorOf(() => dispatch(reg, { op: 'drop-table' }))).toBe('bad-spec');
    expect(errorOf(() => dispatch(reg, { op: 'create', spec: { kind: 'scenario', scenarioId: 'x' } }))).toBe('unknown-scenario');
    expect(errorOf(() => dispatch(reg, { op: 'create', spec: { kind: 'practice', id: 'a', extra: 1 } }))).toBe('bad-spec');
    expect(errorOf(() => dispatch(reg, 'create'))).toBe('bad-spec');
  });
});
