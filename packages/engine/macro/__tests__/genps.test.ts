// AC-04-20-GENPS (E-107 (3)): genesis ratingInputs.politicalStability = GENESIS_DEFAULT.politicalStability (0.7). With the 16 port null,
// close 1 reads it from ratingInputs (z6 = (0.5 − 0.7) / 0.25 = −0.8) and writes 0.7 back, so it is still 0.7 after close 1.
import { describe, expect, it, vi } from 'vitest';
vi.mock('../rules/t03Stubs', () => ({ effectiveMark: vi.fn(() => null), accountsOfEntity: vi.fn(() => []), committedBalance: vi.fn(() => 0n), putFact: vi.fn() }));
vi.mock('../views/ledgerSources', async (orig) => ({ ...(await orig<object>()), msiValue: vi.fn(() => 0) }));
import { defaultMacroPorts } from '../ports';
import { BLOC_ORDER, macroTables, type BlocMacroState, type MacroInputs } from '../schema';
import { GENESIS_DEFAULT } from '../rules/inputs';
import { hazardZ, type HazardInputs } from '../rules/sovCredit';
import { macroGenesis } from '../core/genesis';
import { macroWorld } from '../testkit/macroWorld';
import { runDays } from '../testkit/macroLoop';

const ps = (w: ReturnType<typeof macroWorld>) => BLOC_ORDER.map((b) => w.store.get<BlocMacroState>(macroTables.bloc.name, b)!.sovereign.ratingInputs!.politicalStability);

describe('AC-04-20-GENPS', () => {
  it('0.7 after genesis; 16 port null → close 1 reads 0.7 (z6 = −0.8); still 0.7 after close 1', () => {
    expect(GENESIS_DEFAULT.politicalStability).toBe(0.7);
    const ports = defaultMacroPorts(), w = macroWorld('genps', 0);
    const port = vi.spyOn(ports.world, 'politicalStability');
    macroGenesis(w.ctx, ports);
    expect(ps(w)).toEqual([0.7, 0.7, 0.7, 0.7, 0.7]);
    runDays(w, ports, 0, 1);
    expect(port).toHaveBeenCalled();
    for (const r of port.mock.results) expect(r.value).toBeNull();
    const after = ps(w);
    expect(after).toEqual([0.7, 0.7, 0.7, 0.7, 0.7]);
    for (const v of after) expect(hazardZ({ politicalStability: v } as HazardInputs)[5]).toBeCloseTo(-0.8, 12);
    const snap = w.store.get<MacroInputs>(macroTables.inputs.name, 'INPUTS')!;   // the input snapshot carries the same default
    for (const b of BLOC_ORDER) expect(snap.values[`politicalStability:${b}`]).toBe(0.7);
  }, 60_000);
});
