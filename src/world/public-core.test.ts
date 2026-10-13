import { describe, expect, it } from 'vitest';
import { applyCommand, createGame } from './game';
import { publicCore, publicState } from './view';

// V1-PHASE9 R-9-12: the public tick pushes the public state without the boards (read on demand through the panel request), so the
// push cannot carry the boards by accident. Every other field is the same as publicState.
describe('the public tick state (R-9-12)', () => {
  it('leaves the boards out and keeps every other field of the public state', () => {
    const g = createGame('public-core', { warmupDays: 0, npcs: false });
    applyCommand(g, 'p1', { type: 'join', handle: 'core1', country: 'FR' });
    const full = publicState(g);
    const core = publicCore(g);
    expect(core).not.toHaveProperty('boards');
    const { boards: _boards, ...rest } = full;
    void _boards;
    expect(JSON.stringify(core)).toBe(JSON.stringify(rest));
    expect(core.players).toBe(full.players);
  });
});
