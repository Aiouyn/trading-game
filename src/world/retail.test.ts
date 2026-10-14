import { describe, expect, it } from 'vitest';
import { NPCS } from '@/content/progression';
import { applyCommand, createGame, stepGame } from './game';
import { marketFrame } from './view';
import { retailId, seedRetail, RETAIL_COUNT } from './retail';

describe('the retail crowd', () => {
  it('seeds the same traders twice from one seed, and a second call changes nothing', () => {
    const a = createGame('crowd-a', { npcs: false, warmupDays: 0 });
    const b = createGame('crowd-a', { npcs: false, warmupDays: 0 });
    seedRetail(a);
    seedRetail(b);
    expect(Object.keys(a.players).filter((id) => id.startsWith('npc-rt-'))).toHaveLength(RETAIL_COUNT);
    expect(a.players[retailId(0)]!.handle).toBe(b.players[retailId(0)]!.handle);
    expect(a.players[retailId(RETAIL_COUNT - 1)]!.handle).toBe(b.players[retailId(RETAIL_COUNT - 1)]!.handle);
    expect(a.players[retailId(0)]!.npc).toBe(retailId(0));
    expect(a.market.accounts[retailId(0)]!.npc).toBe(true);
    const handle = a.players[retailId(0)]!.handle;
    seedRetail(a);
    expect(a.players[retailId(0)]!.handle).toBe(handle);
    expect(Object.keys(a.players)).toHaveLength(RETAIL_COUNT);
  });

  it('is absent until something calls seedRetail, including a world that already has the 24 rivals', () => {
    const bare = createGame('crowd-bare', { npcs: false, warmupDays: 0 });
    stepGame(bare);
    expect(bare.players[retailId(0)]).toBeUndefined();
    expect(bare.marketTape).toBeUndefined();
    const named = createGame('crowd-named', { warmupDays: 0 });
    expect(NPCS).toHaveLength(24);
    expect(Object.keys(named.players)).toHaveLength(24);
    expect(named.players[retailId(0)]).toBeUndefined();
  });

  it('prints stocks and crypto under generated handles, and a human fill is not on the tape', () => {
    const g = createGame('crowd-tape', { npcs: false, warmupDays: 0 });
    const twin = createGame('crowd-tape', { npcs: false, warmupDays: 0 });
    seedRetail(g);
    seedRetail(twin);
    stepGame(g);
    stepGame(twin);
    expect(twin.marketTape).toEqual(g.marketTape);
    applyCommand(g, 'u1', { type: 'join', handle: 'human_one', country: 'AV' });
    applyCommand(g, 'u1', { type: 'order.place', order: { assetId: 'HLCN', side: 'buy', type: 'market', qty: 1 } });
    stepGame(g);
    const rows = Object.values(g.marketTape ?? {}).flat();
    expect(rows.length).toBeGreaterThan(10);
    const names = new Set(rows.map((r) => r.assetId));
    expect(g.market.config.assets.some((a) => a.assetClass === 'stock' && names.has(a.id))).toBe(true);
    expect(g.market.config.assets.some((a) => a.assetClass === 'crypto' && names.has(a.id))).toBe(true);
    expect(rows.some((r) => r.side === 'buy')).toBe(true);
    expect(rows.some((r) => r.side === 'sell')).toBe(true);
    expect(rows.some((r) => r.who === 'human_one')).toBe(false);
    const handles = new Set(Object.values(g.players).map((p) => p.handle));
    expect(rows.some((r) => handles.has(r.who))).toBe(false);
    for (const i of [0, 17, 80, 239]) {
      const acct = g.market.accounts[retailId(i)]!;
      for (const pos of Object.values(acct.positions)) expect(pos.qty).toBeGreaterThanOrEqual(0);
    }
    const frame = marketFrame(g);
    expect(frame.tape && frame.tape.length).toBeGreaterThan(0);
    expect(JSON.stringify(frame)).not.toMatch(/fills/);
    expect(frame.tape!.every((r) => r.who !== 'human_one')).toBe(true);
    expect(new Set(rows.map((r) => r.who)).size).toBeGreaterThan(20);
  });
});
