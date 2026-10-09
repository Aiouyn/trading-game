import { describe, expect, it } from 'vitest';
import { contractId, universeConfig, type AssetDef, type WorldConfig } from '@/engine';
import { createGame, stepGame } from '@/world/game';
import type { Command, GameState } from '@/world/types';
import { configSeq, marketFrame, mirrorWorld, type MarketFrame } from '@/world/view';
import { ListWire } from '../../server/wire';
import { createHistory, type History } from './history';
import { absorbFrame, delistedRefusal, isDelisted, syncUniverse, type Universe } from './universe';

const TPD = 24;
const ME = { id: 'nobody', account: null, orders: [] };

/** The client's welcome: the server's asset list (as the welcome sends it), with the static universe's other fields. */
function welcomeUniverse(frame: MarketFrame, defs: AssetDef[], base: WorldConfig): Universe {
  return { config: { ...base, assets: defs }, cfgSeq: frame.cfgSeq };
}

function freshHistory(config: WorldConfig): History {
  const assets = config.assets.map((a) => a.id);
  return createHistory([...config.indices.map((i) => i.id), ...assets], TPD, assets);
}

describe('mirrorWorld', () => {
  it('ignores frame entries past the config for a tick (a listing the client has not heard of yet)', () => {
    const config = universeConfig({ ticksPerDay: TPD, listings: {} });
    const g = createGame('mirror-extra', { warmupDays: 0, npcs: false, config: { ticksPerDay: TPD, listings: {} } });
    const frame = marketFrame(g, false);
    const extra = [...frame.assets, frame.assets[0]!];
    const m = mirrorWorld(config, { ...frame, assets: extra }, ME);
    expect(m.assets.length).toBe(config.assets.length);
    expect(m.assets.every((a) => Number.isFinite(a.lnP))).toBe(true);
  });
});

describe('delistedRefusal', () => {
  const base = universeConfig({ ticksPerDay: TPD });
  const name = base.assets[0]!.id;
  const delisted: WorldConfig = { ...base, assets: base.assets.map((a) => (a.id === name ? { ...a, listed: false, delisted: true } : a)) };
  const option = contractId({ underlying: name, expiryDay: 3, kind: 'call', strike: 100 });

  it('refuses an order and an option trade on a delisted name, and only those', () => {
    expect(isDelisted(delisted, name)).toBe(true);
    // only the field the refusal reads: the rest of the order is irrelevant to it
    const order = { type: 'order.place', order: { assetId: name } } as unknown as Command;
    expect(delistedRefusal(delisted, order)).toMatch(/delisted/);
    expect(delistedRefusal(delisted, { type: 'option.trade', contractId: option, side: 'buy', qty: 1 })).toMatch(/options no longer trade/);
    // a live underlying passes
    expect(delistedRefusal(base, { type: 'option.trade', contractId: option, side: 'buy', qty: 1 })).toBeNull();
    expect(delistedRefusal(delisted, { type: 'option.trade', contractId: 'not-a-contract', side: 'buy', qty: 1 })).toBeNull();
  });
});

describe('the client follows the server universe through listings and delistings', () => {
  it('no throw, the new names priced and charted, the delisted names marked, nothing frozen', () => {
    const g: GameState = createGame('universe-frames', {
      warmupDays: 0,
      npcs: false,
      config: { ticksPerDay: TPD, listings: { odds: { ipo: 0.5, bankruptcy: 0.5, merger: 0, spinoff: 0 } } },
    });
    const base = universeConfig({ ticksPerDay: TPD });
    const wire = new ListWire(g);
    const first = marketFrame(g, true);
    let cur = welcomeUniverse(first, JSON.parse(wire.defsJson(g)) as AssetDef[], base);
    const history = freshHistory(cur.config);
    let world = absorbFrame(cur, history, null, first, ME).world;
    const startCount = cur.config.assets.length;

    let changes = 0;
    for (let k = 0; k < TPD * 14; k++) {
      const before = configSeq(g);
      stepGame(g);
      const changed = configSeq(g) !== before;
      if (changed) changes++;
      // the server's own frame builder: the asset list rides the one tick it changed
      const frame = wire.tickFrame(g, true);
      expect(frame.defs !== undefined).toBe(changed);
      const r = absorbFrame(cur, history, world, frame, ME);
      expect(r.behind).toBe(false);
      cur = r.universe;
      world = r.world;
    }

    expect(changes).toBeGreaterThan(0);
    // the client's list matches the server's, name for name
    const serverIds = g.market.config.assets.map((a) => a.id);
    expect(cur.config.assets.map((a) => a.id)).toEqual(serverIds);
    expect(cur.cfgSeq).toBe(configSeq(g));
    expect(world.assets.length).toBe(serverIds.length);

    // a listed name: priced in the mirror, with a live chart series that has recorded ticks
    const added = cur.config.assets.slice(startCount).filter((a) => a.listed !== false);
    expect(added.length).toBeGreaterThan(0);
    const newIdx = cur.config.assets.findIndex((a) => a.id === added[0]!.id);
    expect(Math.exp(world.assets[newIdx]!.lnP)).toBeCloseTo(Math.exp(g.market.assets[newIdx]!.lnP), 4);
    expect(history.series[added[0]!.id]?.size ?? 0).toBeGreaterThan(0);
    expect(history.series[added[0]!.id]?.cum).toBeDefined();

    // a delisted name: marked in the client's list, and the mirror still prices it (frozen)
    const delisted = cur.config.assets.filter((a) => a.listed === false);
    expect(delisted.length).toBeGreaterThan(0);
    expect(isDelisted(cur.config, delisted[0]!.id)).toBe(true);
    expect(isDelisted(cur.config, added[0]!.id)).toBe(false);
  }, 120_000);

  it('a missed list change leaves the client behind (asks for a resync) and does not throw', () => {
    const g = createGame('universe-missed', {
      warmupDays: 0,
      npcs: false,
      config: { ticksPerDay: TPD, listings: { odds: { ipo: 1, bankruptcy: 0, merger: 0, spinoff: 0 } } },
    });
    const base = universeConfig({ ticksPerDay: TPD });
    const wire = new ListWire(g);
    const first = marketFrame(g, true);
    const cur = welcomeUniverse(first, JSON.parse(wire.defsJson(g)) as AssetDef[], base);
    const history = freshHistory(cur.config);
    const world0 = absorbFrame(cur, history, null, first, ME).world;
    expect(world0.assets.length).toBe(cur.config.assets.length);

    // run until the list moves, but drop the defs from that frame
    let moved: MarketFrame | null = null;
    for (let k = 0; k < TPD * 3 && !moved; k++) {
      stepGame(g);
      const f = marketFrame(g, true, false);
      if (f.cfgSeq !== first.cfgSeq) moved = f;
    }
    expect(moved).not.toBeNull();
    const r = absorbFrame(cur, history, world0, moved!, ME);
    expect(r.behind).toBe(true);
    expect(syncUniverse(cur, moved!).behind).toBe(true);
    expect(r.universe.config.assets.length).toBe(cur.config.assets.length);
    expect(r.world.assets.length).toBe(cur.config.assets.length);
    expect(r.world.tick).toBe(moved!.tick);
  }, 120_000);
});
