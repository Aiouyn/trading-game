import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, stepGame } from './game';
import { DRAWING_CAPS, type ChartDrawing } from './drawings';
import type { GameState } from './types';

/** A player who has joined a world a few ticks in: enough for the command to know the player and the listed assets. */
function joined(seed: string): GameState {
  const g = createGame(seed, { warmupDays: 1, npcs: false });
  for (let k = 0; k < 10; k++) stepGame(g);
  const r = applyCommand(g, 'u1', { type: 'join', handle: 'drawer_u1', country: 'AV' });
  if (!r.ok) throw new Error(r.error);
  g.players.u1!.onboarding.skipped = true;
  return g;
}

const line = (id: string): ChartDrawing => ({ id, kind: 'trend', points: [{ t: 5, p: 100 }, { t: 9, p: 101 }], color: 'info', width: 2 });

describe('drawings.save: a player keeps its own chart drawings per symbol', () => {
  it('saves a symbol’s list, and an empty list drops the symbol and the field when nothing else is kept', () => {
    const g = joined('drawings-save');
    const asset = g.market.config.assets[0]!.id;
    expect(g.players.u1!.drawings).toBeUndefined();
    const r = applyCommand(g, 'u1', { type: 'drawings.save', assetId: asset, drawings: [line('a'), line('b')] });
    expect(r.ok).toBe(true);
    expect(g.players.u1!.drawings![asset]!.map((d) => d.id)).toEqual(['a', 'b']);
    // the list is replaced as a whole, not merged
    applyCommand(g, 'u1', { type: 'drawings.save', assetId: asset, drawings: [line('c')] });
    expect(g.players.u1!.drawings![asset]!.map((d) => d.id)).toEqual(['c']);
    // an empty list removes the symbol; with no symbol left the field is gone (a save with no drawings is as before)
    applyCommand(g, 'u1', { type: 'drawings.save', assetId: asset, drawings: [] });
    expect(g.players.u1!.drawings).toBeUndefined();
  });

  it('keeps the drawings of other players apart: one player’s list is never another’s', () => {
    const g = joined('drawings-private');
    const asset = g.market.config.assets[0]!.id;
    applyCommand(g, 'u1', { type: 'drawings.save', assetId: asset, drawings: [line('a')] });
    expect(g.players.u1!.drawings![asset]).toHaveLength(1);
    // a second player joins and has no field of its own
    expect(applyCommand(g, 'u2', { type: 'join', handle: 'rival_u2', country: 'AV' }).ok).toBe(true);
    expect(g.players.u2!.drawings).toBeUndefined();
  });

  it('refuses an unknown asset, a bad drawing and a list past the cap, and keeps the old list', () => {
    const g = joined('drawings-refuse');
    const asset = g.market.config.assets[0]!.id;
    applyCommand(g, 'u1', { type: 'drawings.save', assetId: asset, drawings: [line('a')] });
    expect(applyCommand(g, 'u1', { type: 'drawings.save', assetId: 'NOPE', drawings: [] })).toEqual({ ok: false, error: 'unknown asset' });
    const bad = applyCommand(g, 'u1', { type: 'drawings.save', assetId: asset, drawings: [{ ...line('z'), kind: 'nope' as never }] });
    expect(bad.ok).toBe(false);
    const full = Array.from({ length: DRAWING_CAPS.perSymbol + 1 }, (_, i) => line(`d${i}`));
    expect(applyCommand(g, 'u1', { type: 'drawings.save', assetId: asset, drawings: full })).toEqual({ ok: false, error: 'drawingsFull' });
    expect(g.players.u1!.drawings![asset]!.map((d) => d.id)).toEqual(['a']);
  });

  it('caps the number of symbols that keep drawings', () => {
    const g = joined('drawings-symbols');
    const ids = g.market.config.assets.map((a) => a.id).slice(0, DRAWING_CAPS.symbols + 1);
    let last = { ok: true as boolean, error: undefined as string | undefined };
    for (const id of ids) {
      const r = applyCommand(g, 'u1', { type: 'drawings.save', assetId: id, drawings: [line('a')] });
      last = { ok: r.ok, error: r.error };
    }
    expect(last).toEqual({ ok: false, error: 'drawingsSymbols' });
    expect(Object.keys(g.players.u1!.drawings!)).toHaveLength(DRAWING_CAPS.symbols);
  });
});
