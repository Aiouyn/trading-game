import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, stepGame } from './game';
import { TPD, credit } from './core';
import { refreshNetWorth } from './assets';
import { applyRank } from './players';
import { loansOwedOf } from './social';
import type { Command, GameState } from './types';

/**
 * The loans-owed index (social.ts loansOwedOf) is rebuilt only when the deal version changes. A court verdict that repays a
 * defaulted loan (court.ts, loan default) must bump the version, or the borrower's rank basis keeps subtracting a debt the
 * court has already closed (a stale index). Regression for the Phase 9B review, item 5.
 */

function game(seed: string): GameState {
  return createGame(seed, { warmupDays: 1, npcs: false });
}

function cmd(g: GameState, pid: string, c: Command) {
  return applyCommand(g, pid, c);
}

function boost(g: GameState, pid: string, amount: number) {
  credit(g, pid, amount, 'test');
  const p = g.players[pid]!;
  refreshNetWorth(g, p);
  applyRank(g, p, null);
}

describe('deal index: a court verdict that closes a defaulted loan is seen at once', () => {
  it('after a won loan-default verdict, the borrower owes nothing (loansOwedOf is not stale)', () => {
    const g = game('deal-index');
    cmd(g, 'a', { type: 'join', handle: 'lender', country: 'AV' });
    cmd(g, 'b', { type: 'join', handle: 'borrower', country: 'AV' });
    boost(g, 'a', 100_000);
    const o = cmd(g, 'a', { type: 'deal.offer', kind: 'loan', toId: 'b', amount: 10_000, rate: 0.5, termDays: 1, note: 'ok' });
    expect(o.ok).toBe(true);
    const id = (o.data as { id: string }).id;
    expect(cmd(g, 'b', { type: 'deal.respond', dealId: id, accept: true }).ok).toBe(true);
    g.market.accounts.b!.cash = 0;
    for (let k = 0; k < TPD * 2 + 2; k++) stepGame(g);
    expect(g.deals[id]!.status).toBe('defaulted');
    // the borrower's debt is read once before the verdict, so the index is built with the debt in it
    expect(loansOwedOf(g, 'b')).toBeGreaterThan(0);

    const f = cmd(g, 'a', { type: 'court.file', defendantId: 'b', kind: 'loan default', counsel: 0 });
    expect(f.ok).toBe(true);
    const caseId = (f.data as { id: string }).id;
    const c = g.court.cases[caseId]!;
    c.evidence = c.bar + 1200; // a near-certain win, so the verdict is the path under test
    while (c.status === 'filed' && g.market.tick <= c.hearingTick + 1) stepGame(g);
    expect(c.status).toBe('won');
    expect(g.deals[id]!.status).toBe('repaid');
    expect(loansOwedOf(g, 'b')).toBe(0);
  });
});
