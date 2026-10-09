import { describe, expect, it } from 'vitest';
import { createWorld, universeConfig } from '@/engine';
import type { StepEvent } from '@/engine';
import { newsFromEvents } from './news';
import type { GameState, StepOutput } from './types';

/** A game shell with just the market: enough for the Wire, which reads the market config and the wire list. */
function shell(): GameState {
  const market = createWorld('wire-events', universeConfig({ ticksPerDay: 24 }));
  return { market, wire: [], wireSeq: 0, players: {} } as unknown as GameState;
}

function emit(g: GameState, events: StepEvent[]): StepOutput {
  const out: StepOutput = { wire: [], inbox: {}, fills: [] } as unknown as StepOutput;
  newsFromEvents(g, events, out);
  return out;
}

describe('Wire stories for index reviews and squeezes', () => {
  it('announces a review with the names that join and leave, and says when it is', () => {
    const g = shell();
    const tick = 60 * 24 + 1;
    const out = emit(g, [{ type: 'index', tick, phase: 'announced', indexId: 'GX', day: 63, adds: ['OSTV'], removes: [] }]);
    expect(out.wire).toHaveLength(1);
    const text = out.wire[0]!.text;
    expect(text).toContain('GX Composite');
    expect(text).toContain('in 3 days');
    expect(text).toContain(g.market.config.assets.find((a) => a.id === 'OSTV')!.name);
  });

  it('reports the reconstitution on its effective day', () => {
    const g = shell();
    const out = emit(g, [{ type: 'index', tick: 63 * 24 + 1, phase: 'effective', indexId: 'GXT', day: 63, adds: [], removes: ['OSTV'] }]);
    expect(out.wire[0]!.text).toContain('GX Technology reconstitutes today');
    expect(out.wire[0]!.text).toContain('leaves ');
  });

  it('a squeeze names the stock and never an account', () => {
    const g = shell();
    const out = emit(g, [{ type: 'squeeze', tick: 113, assetId: 'OSTV', cover: 0.23 }]);
    const w = out.wire[0]!;
    expect(w.kind).toBe('squeeze');
    expect(w.assetId).toBe('OSTV');
    expect(w.text).toContain('Short squeeze in ');
    expect(w.text).toContain('23%');
    expect(w.playerId).toBeUndefined();
    expect(w.text).not.toMatch(/trader|account|sh\d/i);
  });
});
