// E-90 ACs deferred from PR #65 (T04-20 card): E-90-2/3/5/6/7 and production MAC_HISTORY_GAP.
import { describe, expect, it, vi } from 'vitest';
import { dmath, entityHash, fromMoney, partitionMerkle, TICKS_PER_GAME_DAY } from '@tycoon/engine-core';
import { BLOC_ORDER, macroTables, type BlocMacroState } from '../schema';
import { genesisNominalGdp, macroGenesis } from './genesis';
import { historyAt, MACRO_DEV_CHECKS } from './history';
import { macroDayStep } from './dayStep';
import { macroWorld, type MacroWorld } from '../testkit/macroWorld';
import { stubPorts } from '../testkit/cbWorld';
vi.mock('../rules/t03Stubs', () => ({ effectiveMark: vi.fn(() => null), accountsOfEntity: vi.fn(() => []), committedBalance: vi.fn(() => 0n), putFact: vi.fn() }));
vi.mock('../views/ledgerSources', async (orig) => ({ ...(await orig<object>()), msiValue: vi.fn(() => 0) }));  // MISSING EXPORT T03-24 led.msi

const D = TICKS_PER_GAME_DAY, TABLES = Object.values(macroTables).map((t) => t.name);
const ports = stubPorts();
const yieldLoop = (): Promise<void> => new Promise((r) => { setTimeout(r, 0); });   // keeps the vitest worker RPC alive on long loops
const genesis = (seed = 'c'): MacroWorld => { const w = macroWorld(seed, 0); macroGenesis(w.ctx, ports); return w; };
const close = (w: MacroWorld, d: number): void => { w.setTick(d * D + 719); macroDayStep(w.ctx, ports); };
const days = (w: MacroWorld, from: number, to: number, each?: (d: number) => void): MacroWorld => { for (let d = from; d < to; d++) { close(w, d); each?.(d); } return w; };
const bloc = (w: MacroWorld, b: string): BlocMacroState => w.store.get<BlocMacroState>(macroTables.bloc.name, b)!;
/** Partition Merkle of every mac.* row (the store's stateHash construction, over this test store). */
const ehCache = new WeakMap<object, Uint8Array>();   // rows are replaced, not mutated, so a row object's hash is fixed
const eh = (r: object): Uint8Array => { let h = ehCache.get(r); if (!h) { h = entityHash(r); ehCache.set(r, h); } return h; };
const hashOf = (w: MacroWorld): string => {
  const e: { table: string; id: string; eh: Uint8Array }[] = [];
  for (const t of TABLES) for (const r of w.store.iter<{ id: string }>(t)) e.push({ table: t, id: r.id, eh: eh(r) });
  return Array.from(partitionMerkle(e)).join(',');
};

describe('E-90 credit schema', () => {
  it('E-90-2: genesis S0 = 0.2, no players: credit0 === credit; FDL 6.4e12, SRL 1.5e13, PYN 3.2e13; EUN, NKR = fromMoney(nominalGdp0)', () => {
    const w = genesis();
    for (const b of BLOC_ORDER) expect(bloc(w, b).credit0).toBe(bloc(w, b).credit);
    expect([bloc(w, 'FDL').credit0, bloc(w, 'SRL').credit0, bloc(w, 'PYN').credit0]).toEqual([6.4e12, 1.5e13, 3.2e13]);
    for (const b of ['EUN', 'NKR'] as const) expect(bloc(w, b).credit0).toBe(fromMoney(genesisNominalGdp(b, 0.2, w.ctx.params)));
  });
  it('E-90-3: after the day-0 close, history(b, 0).credit === credit0; GLOBAL credit null', () => {
    const w = days(genesis(), 0, 1);
    for (const b of BLOC_ORDER) expect(historyAt(w.store, b, 0)!.credit).toBe(bloc(w, b).credit0);
    expect(historyAt(w.store, 'GLOBAL', 0)!.credit).toBeNull();
  });
  it('E-90-5: credit0 unchanged after 1000 day closes; 421 history rows per key, 2526 in total', async () => {
    const w = genesis(), c0 = BLOC_ORDER.map((b) => bloc(w, b).credit0);
    for (let k = 0; k < 1001; k += 50) { days(w, k, Math.min(k + 50, 1001)); await yieldLoop(); }
    expect(BLOC_ORDER.map((b) => bloc(w, b).credit0)).toEqual(c0);
    const rows = w.store.iter<{ bloc: string }>(macroTables.history.name);
    for (const k of [...BLOC_ORDER, 'GLOBAL']) expect(rows.filter((r) => r.bloc === k)).toHaveLength(421);
    expect(rows).toHaveLength(2526);
    for (const [day, kept] of [[28, true], [27, false], [56, true], [574, true], [575, false], [599, false], [600, true]] as const) expect(historyAt(w.store, 'GLOBAL', day) !== null).toBe(kept);
  }, 120_000);
  describe('E-90-6 / production MAC_HISTORY_GAP', () => {
    const d = 370;
    const prep = (): MacroWorld => { const w = days(genesis(), 0, d); w.store.del(macroTables.history.name, `EUN:${d - 364}`); return w; };
    it('E-90-6: dev checks on, a deleted row(b, d − 364) raises EngineFault MAC_HISTORY_GAP at the next close', () => {
      expect(MACRO_DEV_CHECKS.on).toBe(true);
      expect(() => close(prep(), d)).toThrow(expect.objectContaining({ code: 'MAC_HISTORY_GAP' }));
    }, 60_000);
    it('dev checks off: no throw; creditGrowth takes the credit0 branch (days = d); no extra event', () => {
      const ctl = days(genesis(), 0, d), w = prep(), n0 = w.events.length, m0 = ctl.events.length;
      MACRO_DEV_CHECKS.on = false;
      try { close(w, d); } finally { MACRO_DEV_CHECKS.on = true; }
      close(ctl, d);
      const e = bloc(w, 'EUN');
      expect(e.creditGrowth).toBe(dmath.ln(e.credit / e.credit0) * 364 / d);
      expect(bloc(ctl, 'EUN').creditGrowth).not.toBe(e.creditGrowth);
      expect(w.events.slice(n0).map((x) => x.kind)).toEqual(ctl.events.slice(m0).map((x) => x.kind));
    }, 60_000);
  });
  it('E-90-7: dropping credit0 from one mac.bloc row changes the hash at tick 0; same-seed worlds hash equal at every close for 400 days', async () => {
    const a = genesis('h'), b = genesis('h'), h0 = hashOf(a);
    const { credit0: _drop, ...rest } = bloc(b, 'NKR');
    b.store.put(macroTables.bloc.name, { ...rest, id: 'NKR' });
    expect(hashOf(b)).not.toBe(h0);
    b.store.put(macroTables.bloc.name, bloc(a, 'NKR'));
    expect(hashOf(b)).toBe(h0);
    let same = 0;
    for (let d = 0; d < 400; d++) { close(a, d); close(b, d); if (hashOf(a) === hashOf(b)) same++; if (d % 20 === 19) await yieldLoop(); }
    expect(same).toBe(400);
  }, 180_000);
});
