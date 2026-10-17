import { describe, expect, it } from 'vitest';
import type { AssetState } from '@/engine';
import { createGame } from './game';
import { publicValueGap, strategySignal } from './lab';
import { npcTick } from './npc';
import { TPD } from './core';
import type { Command, GameState } from './types';

function asset(over: Partial<AssetState> = {}): AssetState {
  return { lnP: 1, lnV: 9, lnOpen: 1, h: 1, ...over } as AssetState;
}

describe('value traders read the public price, not lnV', () => {
  it('strategySignal ignores lnV and adds published earnings inside the two-day window', () => {
    const memory = { STK: 1.2 };
    const calm = strategySignal('value', 'STK', asset(), { ...memory }, 0, 0);
    const flipped = strategySignal('value', 'STK', asset({ lnV: -4 }), { ...memory }, 0, 0);
    expect(calm).toBeCloseTo((1.2 - 1) * 15, 8);
    expect(flipped).toBeCloseTo(calm, 8);

    const kept = { STK: 1.2 };
    strategySignal('value', 'STK', asset(), kept, 0, 0);
    expect(kept.STK).toBeCloseTo(1.2 + 0.05 * (1 - 1.2), 8);

    const printing = asset({ nextEarnings: 1, consensus: 0.3, rumor: 1 });
    const inside = strategySignal('value', 'STK', printing, { STK: 1 }, 0, 0);
    expect(inside).toBeCloseTo((0.3 + 0.5) * 15, 8);
    const outside = strategySignal('value', 'STK', asset({ nextEarnings: 100, consensus: 0.3, rumor: 1 }), { STK: 1 }, 0, 0);
    expect(outside).toBeCloseTo(0, 8);
    const hidden = publicValueGap(asset({ lnV: 50, nextEarnings: Math.floor(10 / TPD) }), {}, 'STK', 10, TPD);
    expect(hidden).toBeCloseTo(0, 8);
  });

  it('a value NPC still picks the same name when only lnV changes', () => {
    const g = createGame('value-npc', { warmupDays: 0, npcs: true });
    const ids = Object.values(g.players).filter((p) => p.npc).map((p) => p.id).sort();
    const idx = ids.indexOf('npc-vega');
    expect(idx).toBeGreaterThanOrEqual(0);
    let tick = 0;
    while ((tick + idx * 37) % 240 !== 0) tick++;
    g.market.tick = tick;

    const stocks = g.market.config.assets.filter((a) => a.assetClass === 'stock' && a.listed !== false);
    const target = stocks[0]!.id;
    const held = stocks[1]!.id;
    const lnP = (id: string) => g.market.assets[g.market.config.assets.findIndex((a) => a.id === id)]!.lnP;
    const vega = g.players['npc-vega']!;
    vega.valueEma = { [target]: lnP(target) + 5, [held]: lnP(held) - 1 };
    g.market.accounts['npc-vega']!.positions[held] = { qty: 10, avgCost: 1, realizedPnl: 0 };

    const ordersOf = (state: GameState) => {
      const out: Command[] = [];
      npcTick(state, (_g, pid, cmd) => {
        if (pid === 'npc-vega' && cmd.type === 'order.place') out.push(cmd);
        return { ok: true };
      });
      return out;
    };

    const rng0 = structuredClone(g.rng);
    const ema0 = { ...vega.valueEma! };
    const first = ordersOf(g);
    g.rng = rng0;
    vega.valueEma = { ...ema0 };
    for (const a of g.market.assets) {
      if (a.id === target) a.lnV = a.lnP - 5;
      else if (a.id === held) a.lnV = a.lnP + 5;
      else a.lnV = a.lnP;
    }
    const second = ordersOf(g);

    expect(first.map((c) => (c.type === 'order.place' ? `${c.order.side}:${c.order.assetId}` : c.type))).toEqual([
      `sell:${held}`,
      `buy:${target}`,
    ]);
    expect(second).toEqual(first);
  });
});
