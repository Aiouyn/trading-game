import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, stepGame } from './game';
import { FILING_FEE, COUNSEL_COST, filingMinimum } from './court';
import { playerView } from './view';
import type { GameState } from './types';

// R-10-7 (legal): the filing is refused below half the claim's bar (the Legal app disables File with the reason), and the
// view carries the evidence per defendant so the app can show it. The fee is the filing fee plus counsel, never counsel twice.

function two(seed: string): GameState {
  const g = createGame(seed, { warmupDays: 1, npcs: false });
  for (let k = 0; k < 10; k++) stepGame(g);
  for (const [id, handle] of [['u1', 'trader_0'], ['u2', 'trader_1']] as const) {
    const r = applyCommand(g, id, { type: 'join', handle, country: 'AV' });
    if (!r.ok) throw new Error(r.error);
  }
  const grant = applyCommand(g, 'u1', { type: 'admin.grant', amount: 50_000 });
  if (!grant.ok) throw new Error(grant.error);
  return g;
}

describe('legal filing (R-10-7)', () => {
  it('the minimum is half the bar: 20 points for a cyber intrusion, 27.5 for a model theft', () => {
    expect(filingMinimum('cyber intrusion')).toBe(20);
    expect(filingMinimum('contract breach')).toBe(20);
    expect(filingMinimum('model theft')).toBe(27.5);
  });

  it('a filing below the minimum is refused, and the view shows the count the app blocks on', () => {
    const g = two('legal-below-min');
    g.cyber.evidence['u2>u1'] = 10;
    const v = playerView(g, 'u1')!;
    expect(v.filing.u2?.['cyber intrusion']).toBe(10);
    const r = applyCommand(g, 'u1', { type: 'court.file', defendantId: 'u2', kind: 'cyber intrusion', counsel: 1 });
    expect(r.ok).toBe(false);
    expect(Object.keys(g.court.cases).length).toBe(0);
  });

  it('at the minimum the filing goes through and charges the filing fee plus counsel once', () => {
    const g = two('legal-fee-once');
    g.cyber.evidence['u2>u1'] = 25;
    const before = g.market.accounts.u1!.cash;
    const r = applyCommand(g, 'u1', { type: 'court.file', defendantId: 'u2', kind: 'cyber intrusion', counsel: 1 });
    expect(r.ok).toBe(true);
    const after = g.market.accounts.u1!.cash;
    expect(before - after).toBeCloseTo(FILING_FEE + COUNSEL_COST[1]!, 6);
  });

  it('the view counts evidence per claim kind: a model theft has its own count (residue counts for it)', () => {
    const g = two('legal-kinds');
    g.cyber.evidence['u2>u1'] = 30;
    const v = playerView(g, 'u1')!;
    expect(v.filing.u2?.['cyber intrusion']).toBe(30);
    // the theft has no residue here, so it reads the cyber evidence only (the same rule the engine applies)
    expect(v.filing.u2?.['model theft']).toBe(30);
  });

  it('a defendant with no evidence and no default is not in the view (the app reads the absence as zero)', () => {
    const g = two('legal-none');
    expect(playerView(g, 'u1')!.filing.u2).toBeUndefined();
  });
});
