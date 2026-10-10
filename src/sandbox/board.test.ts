import { describe, expect, it } from 'vitest';
import { ChallengeBoard } from './board';
import { exportRun, importRun, serializeRun } from './runfile';
import { createRegistry, dispatch } from './rpc';
import { Sandbox, SandboxError } from './sandbox';

const TICKS_PER_DAY = 720;
const WEEK = '2026-W41';
const OTHER_WEEK = '2026-W42';

function errorOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof SandboxError) return e.code;
    throw e;
  }
  return 'no-error';
}

/** a live challenge run for the week, claimed on the board, optionally with one market buy of gold, played to the end */
function finishedChallenge(board: ChallengeBoard, week: string, buyGold: boolean): Sandbox {
  const sb = Sandbox.create({ kind: 'challenge', weekKey: week });
  board.claim(sb);
  if (buyGold) sb.act({ type: 'place', order: { assetId: 'GOLD', side: 'buy', type: 'market', qty: 1 } });
  sb.advance(21 * TICKS_PER_DAY);
  return sb;
}

describe('weekly challenge board (local, unranked runs excluded)', () => {
  it('a practice run cannot be submitted', () => {
    const board = new ChallengeBoard();
    const sb = Sandbox.create({ kind: 'practice', id: 'nope' });
    expect(errorOf(() => board.claim(sb))).toBe('not-ranked');
    expect(errorOf(() => board.submit(sb))).toBe('not-ranked');
  });

  it('a challenge that has not reached its last tick cannot be submitted', () => {
    const board = new ChallengeBoard();
    const sb = Sandbox.create({ kind: 'challenge', weekKey: WEEK });
    board.claim(sb);
    sb.step(TICKS_PER_DAY);
    expect(errorOf(() => board.submit(sb))).toBe('not-complete');
  });

  it('a challenge run that was never claimed cannot be submitted', () => {
    const board = new ChallengeBoard();
    const sb = Sandbox.create({ kind: 'challenge', weekKey: WEEK });
    sb.advance(21 * TICKS_PER_DAY);
    expect(errorOf(() => board.submit(sb))).toBe('not-ranked');
  }, 120_000);

  it('an imported run is never ranked', () => {
    const board = new ChallengeBoard();
    const sb = Sandbox.create({ kind: 'challenge', weekKey: WEEK });
    sb.advance(21 * TICKS_PER_DAY);
    const back = importRun(serializeRun(exportRun(sb)));
    expect(errorOf(() => board.submit(back))).toBe('not-ranked');
  }, 120_000);

  it('a finished run is scored once, and the board holds only score fields', () => {
    const board = new ChallengeBoard();
    const sb = finishedChallenge(board, WEEK, false);
    const first = board.submit(sb);
    expect(board.submit(sb)).toEqual(first);
    expect(Object.keys(first).sort()).toEqual(['days', 'equity', 'returnPct', 'scenarioId', 'seq', 'weekKey']);
    expect(board.top(WEEK)).toHaveLength(1);
    expect(board.top(WEEK, 0)).toHaveLength(0);
  }, 120_000);

  it('one attempt per ISO week: a second live run for the same week is refused and cannot score', () => {
    const board = new ChallengeBoard();
    const first = Sandbox.create({ kind: 'challenge', weekKey: WEEK });
    board.claim(first);
    const second = Sandbox.create({ kind: 'challenge', weekKey: WEEK });
    expect(errorOf(() => board.claim(second))).toBe('already-attempted');
    second.advance(21 * TICKS_PER_DAY);
    expect(errorOf(() => board.submit(second))).toBe('not-ranked');
  }, 120_000);

  it('an abandoned attempt still uses the week, and the other week stays open', () => {
    const board = new ChallengeBoard();
    const abandoned = Sandbox.create({ kind: 'challenge', weekKey: WEEK });
    board.claim(abandoned);
    abandoned.step(TICKS_PER_DAY);
    expect(errorOf(() => board.claim(Sandbox.create({ kind: 'challenge', weekKey: WEEK })))).toBe('already-attempted');
    expect(errorOf(() => board.claim(Sandbox.create({ kind: 'challenge', weekKey: OTHER_WEEK })))).toBe('no-error');
  });

  it('the week board holds at most one row per week, and only the claimed run can score it', () => {
    const board = new ChallengeBoard();
    const a = finishedChallenge(board, WEEK, false);
    const b = finishedChallenge(board, OTHER_WEEK, true);
    board.submit(a);
    board.submit(b);
    expect(board.top(WEEK)).toHaveLength(1);
    expect(board.top(OTHER_WEEK)).toHaveLength(1);
    expect(board.top(WEEK, 1)).toHaveLength(1);
    expect(board.top('2026-W43')).toHaveLength(0);
  }, 240_000);
});

describe('sandbox request surface (what the worker and the page call)', () => {
  it('create, act, step, view and close a practice sandbox through dispatch', () => {
    const reg = createRegistry();
    const made = dispatch(reg, { op: 'create', spec: { kind: 'practice', id: 'api' } }) as { id: string; tick: number; origin: string };
    expect(made.origin).toBe('live');
    const acted = dispatch(reg, { op: 'act', id: made.id, command: { type: 'place', order: { assetId: 'GOLD', side: 'buy', type: 'market', qty: 1 } } }) as { ok: boolean };
    expect(acted.ok).toBe(true);
    const stepped = dispatch(reg, { op: 'step', id: made.id, ticks: TICKS_PER_DAY }) as { tick: number };
    expect(stepped.tick).toBe(TICKS_PER_DAY);
    const v = dispatch(reg, { op: 'view', id: made.id }) as { portfolio: { cash: number } };
    expect(v.portfolio.cash).toBeLessThan(5000);
    expect(dispatch(reg, { op: 'close', id: made.id })).toEqual({ ok: true });
    expect(errorOf(() => dispatch(reg, { op: 'view', id: made.id }))).toBe('bad-id');
  }, 60_000);

  it('export then import through dispatch gives a live-to-imported copy of the same run', () => {
    const reg = createRegistry();
    const a = dispatch(reg, { op: 'create', spec: { kind: 'practice', id: 'pair' } }) as { id: string };
    dispatch(reg, { op: 'step', id: a.id, ticks: TICKS_PER_DAY });
    const text = (dispatch(reg, { op: 'export', id: a.id }) as { text: string }).text;
    const b = dispatch(reg, { op: 'import', text }) as { id: string; origin: string; tick: number };
    expect(b.origin).toBe('imported');
    expect(b.tick).toBe(TICKS_PER_DAY);
    expect((dispatch(reg, { op: 'export', id: b.id }) as { text: string }).text).toBe(text);
  }, 60_000);

  it('a second challenge create for the same week is refused through dispatch, and the first one submits', () => {
    const reg = createRegistry();
    const first = dispatch(reg, { op: 'create', spec: { kind: 'challenge', weekKey: WEEK } }) as { id: string };
    expect(errorOf(() => dispatch(reg, { op: 'create', spec: { kind: 'challenge', weekKey: WEEK } }))).toBe('already-attempted');
    for (let d = 0; d < 21; d++) dispatch(reg, { op: 'step', id: first.id, ticks: TICKS_PER_DAY });
    const entry = dispatch(reg, { op: 'submit', id: first.id }) as { weekKey: string; days: number };
    expect(entry.weekKey).toBe(WEEK);
    expect(entry.days).toBe(21);
    expect(dispatch(reg, { op: 'leaderboard', weekKey: WEEK })).toEqual([entry]);
  }, 120_000);

  it('refuses unknown operations, unknown scenarios and malformed specs with codes', () => {
    const reg = createRegistry();
    expect(errorOf(() => dispatch(reg, { op: 'drop-table' }))).toBe('bad-spec');
    expect(errorOf(() => dispatch(reg, { op: 'create', spec: { kind: 'scenario', scenarioId: 'x' } }))).toBe('unknown-scenario');
    expect(errorOf(() => dispatch(reg, { op: 'create', spec: { kind: 'practice', id: 'a', extra: 1 } }))).toBe('bad-spec');
    expect(errorOf(() => dispatch(reg, 'create'))).toBe('bad-spec');
  });
});
