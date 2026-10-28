// Regression: U(a,b) draws use rng.uOpen() (U(0,1)), never rng.next() (raw uint32). Real makeRng streams via macroWorld.
import { describe, expect, it, vi } from 'vitest';
import { BLOC_ORDER, macroTables, type CentralBank, type CurveState } from '../schema';
import { BLOC_DEFAULTS } from '../blocs';
import { cbkId } from '@tycoon/engine-ledger';
import { macroGenesis } from './genesis';
import { macroWorld } from '../testkit/macroWorld';
import { stubPorts } from '../testkit/cbWorld';
import { runDays } from '../testkit/macroLoop';
vi.mock('../rules/t03Stubs', () => ({ effectiveMark: vi.fn(() => null), accountsOfEntity: vi.fn(() => []), committedBalance: vi.fn(() => 0n), putFact: vi.fn() }));
vi.mock('../views/ledgerSources', async (orig) => ({ ...(await orig<object>()), msiValue: vi.fn(() => 0) }));

describe('uniform draws on real rng streams', () => {
  it('genesis appointGovernor: hawk in [hawkMin, hawkMax], |rStarBias| ≤ 0.005; day-0 curve nodes finite and < 1', () => {
    for (const seed of ['u1', 'u2', 'u3']) {
      const p = stubPorts(), w = macroWorld(seed, 0); macroGenesis(w.ctx, p); runDays(w, p, 0, 1);
      for (const b of BLOC_ORDER) {
        const cb = w.store.get<CentralBank>(macroTables.cb.name, cbkId(b))!, pers = BLOC_DEFAULTS[b].personality;
        expect(cb.hawkishness).toBeGreaterThanOrEqual(pers.hawkMin); expect(cb.hawkishness).toBeLessThanOrEqual(pers.hawkMax);
        expect(Math.abs(cb.rStarBias)).toBeLessThanOrEqual(0.005);
        const c = w.store.get<CurveState>(macroTables.curve.name, b)!;
        for (const n of [...c.nodes, ...c.ois]) { expect(Number.isFinite(n.yield)).toBe(true); expect(Math.abs(n.yield)).toBeLessThan(1); }
      }
    }
  }, 120_000);
});
