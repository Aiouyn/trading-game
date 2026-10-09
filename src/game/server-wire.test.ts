import { describe, expect, it } from 'vitest';
import { universeConfig, type AssetDef } from '@/engine';
import { createGame, stepGame } from '@/world/game';
import type { GameState } from '@/world/types';
import { configSeq, marketFrame, type MarketFrame } from '@/world/view';
import { ListWire, welcomeJson } from '../../server/wire';
import { createHistory, type History } from './history';
import { absorbFrame, type Universe } from './universe';

const TPD = 24;
const ME = { id: 'nobody', account: null, orders: [] };
const BASE_COUNT = universeConfig({ ticksPerDay: TPD }).assets.length;

interface Welcome {
  t: 'welcome';
  playerId: string;
  defs: AssetDef[];
  frame: MarketFrame;
}

/** The server's welcome for a player who connects now, parsed as the client reads it. */
function welcome(g: GameState, wire: ListWire): Welcome {
  const json = welcomeJson({
    playerId: 'nobody', tickMs: 5000, frameJson: JSON.stringify(marketFrame(g, true)), defsJson: wire.defsJson(g),
    meJson: 'null', pubJson: '{}', directoryJson: '[]', chatJson: '{}', serverTime: 0,
  });
  return JSON.parse(json) as Welcome;
}

/** The client's universe and history as the store sets them from a welcome. */
function joinUniverse(w: Welcome): { cur: Universe; history: History; world: ReturnType<typeof absorbFrame>['world'] } {
  const config = { ...universeConfig({ ticksPerDay: TPD }), assets: w.defs };
  const assets = config.assets.map((a) => a.id);
  const history = createHistory([...config.indices.map((i) => i.id), ...assets], TPD, assets);
  const r = absorbFrame({ config, cfgSeq: w.frame.cfgSeq }, history, null, w.frame, ME);
  return { cur: r.universe, history, world: r.world };
}

/** A world whose asset list has grown past the static universe (an IPO appended a name), listings odds forced high. */
function changedWorld(seed: string): GameState {
  const g = createGame(seed, {
    warmupDays: 0,
    npcs: false,
    config: { ticksPerDay: TPD, listings: { odds: { ipo: 0.5, bankruptcy: 0.5, merger: 0, spinoff: 0 } } },
  });
  for (let k = 0; k < TPD * 40 && g.market.config.assets.length === BASE_COUNT; k++) stepGame(g);
  expect(g.market.config.assets.length).toBeGreaterThan(BASE_COUNT);
  return g;
}

describe('the server wire carries the asset list the frames are built on', () => {
  it('the welcome after a listing carries the full current list, and the frame describes that same list', () => {
    const g = changedWorld('wire-welcome');
    const w = welcome(g, new ListWire(g));
    expect(w.defs.map((a) => a.id)).toEqual(g.market.config.assets.map((a) => a.id));
    expect(w.defs.length).toBeGreaterThan(BASE_COUNT);
    expect(w.frame.cfgSeq).toBe(configSeq(g));
    expect(w.frame.assets.length).toBe(w.defs.length);
    // a client built from that welcome reads the frame without throwing and prices every name
    const j = joinUniverse(w);
    expect(j.world.assets.length).toBe(w.defs.length);
    expect(j.cur.cfgSeq).toBe(configSeq(g));
  });

  it('a client that connects after a change keeps up with the stream (no defs on normal ticks, no resync)', () => {
    const g = changedWorld('wire-late');
    const wire = new ListWire(g);
    const w = welcome(g, wire);
    const joined = joinUniverse(w);
    const history = joined.history;
    let cur = joined.cur;
    let world = joined.world;
    for (let k = 0; k < TPD * 4; k++) {
      const before = configSeq(g);
      stepGame(g);
      const frame = wire.tickFrame(g, true);
      expect(frame.defs !== undefined).toBe(configSeq(g) !== before);
      const r = absorbFrame(cur, history, world, frame, ME);
      expect(r.behind).toBe(false);
      cur = r.universe;
      world = r.world;
    }
    expect(cur.config.assets.map((a) => a.id)).toEqual(g.market.config.assets.map((a) => a.id));
  }, 60_000);

  it('the stream sends the defs on the tick the list moves, and a wire made after a change starts from it', () => {
    const g = createGame('wire-start', {
      warmupDays: 0,
      npcs: false,
      config: { ticksPerDay: TPD, listings: { odds: { ipo: 0.5, bankruptcy: 0.5, merger: 0, spinoff: 0 } } },
    });
    const wire = new ListWire(g);
    let sawChange = false;
    for (let k = 0; k < TPD * 14; k++) {
      const before = configSeq(g);
      stepGame(g);
      const frame = wire.tickFrame(g, true);
      const changed = configSeq(g) !== before;
      sawChange ||= changed;
      expect(frame.defs !== undefined).toBe(changed);
      if (changed) expect(frame.defs!.map((a) => a.id)).toEqual(g.market.config.assets.map((a) => a.id));
    }
    expect(sawChange).toBe(true);
    // a wire created after the list moved sends nothing until the next change (the welcome covered the current list)
    const late = new ListWire(g);
    for (let k = 0; k < TPD; k++) {
      const before = configSeq(g);
      stepGame(g);
      expect(late.tickFrame(g, false).defs !== undefined).toBe(configSeq(g) !== before);
    }
  }, 60_000);

  it('the defs JSON is cached per list version and refreshed when the list moves', () => {
    const g = changedWorld('wire-cache');
    const wire = new ListWire(g);
    const a = wire.defsJson(g);
    expect(wire.defsJson(g)).toBe(a);
    expect((JSON.parse(a) as AssetDef[]).map((d) => d.id)).toEqual(g.market.config.assets.map((d) => d.id));
    const seq = configSeq(g);
    for (let k = 0; k < TPD * 14 && configSeq(g) === seq; k++) stepGame(g);
    expect(configSeq(g)).not.toBe(seq);
    const b = wire.defsJson(g);
    expect(b).not.toBe(a);
    expect((JSON.parse(b) as AssetDef[]).map((d) => d.id)).toEqual(g.market.config.assets.map((d) => d.id));
  }, 60_000);
});
