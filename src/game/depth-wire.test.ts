import { describe, expect, it } from 'vitest';
import { depthByPool, ecologyLog } from '@/engine';
import { createGame, stepGame } from '@/world/game';
import { TPD } from '@/world/core';
import { marketFrame } from '@/world/view';
import type { GameState } from '@/world/types';
import { DepthWire } from '../../server/wire';

/** Steps the game `n` ticks, through the same stepGame the server runs. */
function advance(g: GameState, n: number): void {
  for (let i = 0; i < n; i++) stepGame(g);
}

/** The last closed day in the ecology log. */
function lastDay(g: GameState): number {
  return ecologyLog(g.market).at(-1)!.day;
}

describe('DepthWire: the order depth of the latest closed day on the wire (H8, P2)', () => {
  it('the frame is sent once per closed day, on the tick that closed it, and cached until then', () => {
    const g = createGame('depth-cadence', { warmupDays: 1, npcs: false });
    const wire = new DepthWire();
    const first = wire.due(g);
    expect(first).not.toBeNull();
    expect(first!.day).toBe(lastDay(g));
    // the same closed day again: nothing to send
    advance(g, 1);
    expect(wire.due(g)).toBeNull();
    // the next close sends a new frame for the new day
    const day0 = lastDay(g);
    advance(g, TPD);
    expect(lastDay(g)).toBeGreaterThan(day0);
    const next = wire.due(g);
    expect(next).not.toBeNull();
    expect(next!.day).toBe(lastDay(g));
  });

  it('every asset in the frame equals depthByPool on that day: the server computes the same fold the explain uses', () => {
    const g = createGame('depth-fold', { warmupDays: 1, npcs: false });
    const frame = new DepthWire().frame(g)!;
    const day = lastDay(g);
    const ids = Object.keys(frame.assets);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids.slice(0, 40)) {
      const d = depthByPool(g.market, id, day);
      expect(frame.assets[id]).toEqual({ depth: d.depth, desired: d.desired });
    }
  });

  it('the frame carries pool types only: no account, no own or NPC flow, and no log', () => {
    const g = createGame('depth-pools', { warmupDays: 1, npcs: true });
    const frame = new DepthWire().frame(g)!;
    for (const row of Object.values(frame.assets)) {
      expect(Object.keys(row.desired).sort()).toEqual(['pension', 'retail', 'trend', 'value']);
    }
    const text = JSON.stringify(frame);
    expect(text).not.toMatch(/"own"|"npc"|"ownBy"|"players"|"log"/);
  });

  it('the view frame has no depth by default: only the server attaches it, on the closing tick or in a welcome', () => {
    const g = createGame('depth-frame', { warmupDays: 1, npcs: false });
    expect(marketFrame(g).depth).toBeUndefined();
    const wire = new DepthWire();
    expect(wire.frame(g)).not.toBeNull();
    expect(wire.due(g)).not.toBeNull();
    expect(wire.due(g)).toBeNull();
  });
});
