import { describe, expect, it } from 'vitest';
import { applyCommand, createGame } from './game';
import { sixdView } from './sixd';

describe('admin.streakAccent (the e2e seam for the palette gate)', () => {
  it('records a milestone accent on the streak, once, and refuses a name that is not an accent', () => {
    const g = createGame('streak-accent', { warmupDays: 1, npcs: false });
    applyCommand(g, 'p1', { type: 'join', handle: 'accent_p1', country: 'XX' });
    expect(sixdView(g, 'p1')!.streak!.accents).toEqual([]);
    expect(applyCommand(g, 'admin', { type: 'admin.streakAccent', playerId: 'p1', accent: 'phosphor' }).ok).toBe(true);
    expect(applyCommand(g, 'admin', { type: 'admin.streakAccent', playerId: 'p1', accent: 'phosphor' }).ok).toBe(true);
    expect(sixdView(g, 'p1')!.streak!.accents).toEqual(['phosphor']);
    expect(applyCommand(g, 'admin', { type: 'admin.streakAccent', playerId: 'p1', accent: 'ink-brass' })).toEqual({ ok: false, error: 'streakAccent' });
    expect(applyCommand(g, 'admin', { type: 'admin.streakAccent', playerId: 'nobody', accent: 'riviera' })).toEqual({ ok: false, error: 'noPlayer' });
  });
});
