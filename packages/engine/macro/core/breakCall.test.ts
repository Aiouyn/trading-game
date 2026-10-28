// AC-04-20-BREAKCALL (E-104 (1)): the dispatch t = 45 breakRuleCheck call, through the wired tick loop with 04 alone.
import { describe, expect, it, vi } from 'vitest';
vi.mock('../rules/t03Stubs', () => ({ effectiveMark: vi.fn(() => null), accountsOfEntity: vi.fn(() => []), committedBalance: vi.fn(() => 0n), putFact: vi.fn() }));
const cc = vi.hoisted(() => ({ agree: false }));   // Concord agreeable? (T04-14 step 5: a Concord pre-empts the break)
vi.mock('../rules/concord', async (orig) => { const m = await orig<typeof import('../rules/concord')>(); return { ...m, canAgreeConcord: (...a: Parameters<typeof m.canAgreeConcord>) => cc.agree && m.canAgreeConcord(...a) }; });
vi.mock('../views/ledgerSources', async (orig) => ({ ...(await orig<object>()), msiValue: vi.fn(() => 0) }));
import { isTradingDay, TICKS_PER_GAME_DAY as D } from '@tycoon/engine-core';
import { macroTables, type BlocId, type BlocMacroState, type FxRegimeKind, type PublicMacroView } from '../schema';
import { macroWorld, type MacroWorld } from '../testkit/macroWorld';
import { runDays } from '../testkit/macroLoop';
import { stubPorts } from '../testkit/cbWorld';
import { NULL_STAB_REPORT } from '../views/stabReport';
import { macroGenesis } from './genesis';
import { macroPhases } from './dispatch';

const ports = stubPorts();
const regime = (w: MacroWorld, b: BlocId): FxRegimeKind => w.store.get<BlocMacroState>(macroTables.bloc.name, b)!.fx.regime;
const viewRegime = (w: MacroWorld, b: BlocId): FxRegimeKind => w.store.get<PublicMacroView>(macroTables.publicView.name, b)!.fx.regime;
const arm = (w: MacroWorld, b: BlocId) => { const r = w.store.get<BlocMacroState>(macroTables.bloc.name, b)!; w.store.put(macroTables.bloc.name, { ...r, fx: { ...r.fx, breakArmed: true } }); };
function tick(w: MacroWorld, t: number): void {
  const ph = macroPhases(ports, NULL_STAB_REPORT);
  w.setTick(t); ph.P2?.(w.ctx); ph.P4?.(w.ctx); ph.P6?.(w.ctx); ph.P8?.(w.ctx);
}
const nextTrading = (b: BlocId, d: number) => { let x = d; while (!isTradingDay(b, x)) x++; return x; };

/** Genesis, day closes to SRL trading day d, ticks through d's t = 45; `armed` arms SRL (and FDL) at t = 46 of d; then ticks to t = 45 of the
 *  next SRL trading day. Returns the regimes seen at t = 44 and right after t = 45 of that day. */
function run(armed: boolean) {
  const w = macroWorld('breakcall', 0);
  macroGenesis(w.ctx, ports);
  const d = nextTrading('SRL', 2), nd = nextTrading('SRL', d + 1);
  runDays(w, ports, 0, d);
  const start = regime(w, 'SRL');
  for (let t = d * D; t <= d * D + 45; t++) tick(w, t);
  if (armed) { arm(w, 'SRL'); arm(w, 'FDL'); }
  for (let t = d * D + 46; t < nd * D + 45; t++) tick(w, t);
  const before = regime(w, 'SRL');
  tick(w, nd * D + 45);
  return { start, before, armedAfter: w.store.get<BlocMacroState>(macroTables.bloc.name, 'SRL')!.fx.breakArmed, after: regime(w, 'SRL'), view: viewRegime(w, 'SRL'), fdl: regime(w, 'FDL'), fdlBreak: w.store.get<BlocMacroState>(macroTables.bloc.name, 'FDL')!.fx.breakTick, breakTick: w.store.get<BlocMacroState>(macroTables.bloc.name, 'SRL')!.fx.breakTick, nd };
}

describe('AC-04-20-BREAKCALL', () => {
  it('SRL MANAGED_FLOAT armed after t = 45 → FREE_FLOAT at t = 45 of the next SRL trading day, FX_REGIME marked that tick (public view refreshed); FDL never breaks', () => {
    const r = run(true);
    expect([r.start, r.before]).toEqual(['MANAGED_FLOAT', 'MANAGED_FLOAT']);
    expect([r.after, r.view, r.breakTick]).toEqual(['FREE_FLOAT', 'FREE_FLOAT', r.nd * D + 45]);
    expect([r.fdl, r.fdlBreak]).toEqual(['FREE_FLOAT', undefined]);   // FDL armed too: breakRuleCheck returns null, no break
  }, 120_000);
  it('with a Concord agreeable the same call opens it instead (BREAK_PENDING, regime kept, disarmed)', () => {
    cc.agree = true;
    try {
      const r = run(true);
      expect([r.before, r.after, r.armedAfter, r.breakTick]).toEqual(['MANAGED_FLOAT', 'MANAGED_FLOAT', false, undefined]);
    } finally { cc.agree = false; }
  }, 120_000);
  it('breakArmed false → no regime change', () => {
    const r = run(false);
    expect([r.start, r.before, r.after, r.view]).toEqual(['MANAGED_FLOAT', 'MANAGED_FLOAT', 'MANAGED_FLOAT', 'MANAGED_FLOAT']);
  }, 120_000);
});
