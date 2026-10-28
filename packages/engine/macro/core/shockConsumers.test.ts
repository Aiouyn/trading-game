// AC-04-18 (shocks.test, E-104 (1)): a unit shock of each SHOCK_TARGETS target, alone, changes its consumer's output on the next read.
// Wired tick loop with 04 alone: genesis, day closes to SRL trading day d, then one shocked day vs the same day unshocked.
import { describe, expect, it, vi } from 'vitest';
vi.mock('../rules/t03Stubs', () => ({ effectiveMark: vi.fn(() => null), accountsOfEntity: vi.fn(() => []), committedBalance: vi.fn(() => 0n), putFact: vi.fn() }));
vi.mock('../views/ledgerSources', async (orig) => ({ ...(await orig<object>()), msiValue: vi.fn(() => 0) }));
import { isTradingDay, TICKS_PER_GAME_DAY as D, type StoreRead } from '@tycoon/engine-core';
import { cbkId } from '@tycoon/engine-ledger';
import { macroTables, type ActiveShock, type BlocId, type BlocMacroState, type CentralBank, type GlobalMacroState, type WorldEvent } from '../schema';
import { macroWorld, type MacroWorld } from '../testkit/macroWorld';
import { runDays } from '../testkit/macroLoop';
import { stubPorts } from '../testkit/cbWorld';
import { auctionStress } from '../rules/auction';
import { SHOCK_TARGETS } from '../rules/shocks';
import { macroValueShocks, y10 } from '../api';
import { macroGenesis } from './genesis';

const ports = stubPorts(), B: BlocId = 'SRL';
const nextTrading = (b: BlocId, d: number) => { let x = d; while (!isTradingDay(b, x)) x++; return x; };
const DAY = nextTrading(B, 3);
const blocOf = (s: StoreRead, b: BlocId = B) => s.get<BlocMacroState>(macroTables.bloc.name, b)!;
const glob = (s: StoreRead) => [...s.iter<GlobalMacroState>(macroTables.global.name)][0]!;
type Scope = 'BLOC' | 'WORLD';
/** target → [scope, unit value, expected sign of (shocked − unshocked) per the E-104 (1) step-4 formulas, consumer output read after the day].
 *  pi_e1_add raises π_e1 → lower real-rate gap → higher gap target; credit_conditions_add enters x̂ with +macro_x_a_c; z5_fear_add raises z5 → λ. */
const CASES: [string, Scope, number, 1 | -1, (s: StoreRead, w: MacroWorld) => number][] = [
  ['x_target', 'BLOC', 0.01, 1, (s) => blocOf(s).outputGapTarget],
  ['tp10', 'BLOC', 0.01, 1, (s) => y10(s, B)],
  ['lambda_raw_mult', 'BLOC', 2, 1, (s) => blocOf(s).sovereign.hazard],
  ['z5_fear_add', 'BLOC', 10, 1, (s) => blocOf(s).sovereign.hazard],
  ['fx_fair_ln', 'BLOC', -0.05, -1, (s) => blocOf(s).fx.fairValueLn],
  ['tariff_level', 'WORLD', 0.05, 1, (s) => glob(s).tariffLevel],
  ['fear_add', 'WORLD', 5, 1, (s) => glob(s).fearIndex],
  ['fear_add', 'BLOC', 5, 1, (s) => glob(s).fearIndex],
  ['credit_conditions_add', 'BLOC', 0.5, 1, (s) => blocOf(s).outputGapTarget],
  ['interbank_add', 'WORLD', 0.05, 1, (s) => glob(s).financialStressIndex],
  ['capital_flow', 'BLOC', -0.5, 1, (_s, w) => w.cb.posts.filter((p) => p.code === 'MAC_FX_CAPITAL_FLOW' && p.from === cbkId(B)).length],
  ['pi_e1_add', 'BLOC', 0.01, 1, (s) => blocOf(s).outputGapTarget],
  ['pi_e1_add', 'WORLD', 0.01, 1, (s) => blocOf(s).outputGapTarget],
];
let base: MacroWorld | null = null;
/** SRL reserves set to 10^15 µFDL before the day (the stub world has no ledger → cb.reserves sync), so a capital_flow sale has a base. */
function world(): MacroWorld {
  const w = macroWorld('shockcons', 0); macroGenesis(w.ctx, ports); runDays(w, ports, 0, DAY);
  const cb = w.store.get<CentralBank>(macroTables.cb.name, cbkId(B))!;
  w.store.put(macroTables.cb.name, { ...cb, reserves: { ...cb.reserves, fdl: 10n ** 15n } });
  return w;
}
const unshocked = () => base ??= (() => { const w = world(); runDays(w, ports, DAY, DAY + 1); return w; })();
function shocked(target: string, scope: Scope, value: number): MacroWorld {
  const w = world(), sh: ActiveShock = { id: 'shk_unit', target, value, startTick: DAY * D, endTick: (DAY + 5) * D, shape: 'STEP' };
  if (scope === 'BLOC') { const r = blocOf(w.store); w.store.put(macroTables.bloc.name, { ...r, shocks: [...r.shocks, sh] }); }
  else w.store.put(macroTables.event.name, { id: 'evt_unit', tier: 'RIPPLE', kind: 'RIPPLE_SUPPLY', blocs: [], sectors: [], assetsHint: [], phase: 'TRIGGER', phaseSinceTick: DAY * D,
    precursorStartTick: DAY * D, triggerTick: DAY * D, plannedEndTick: (DAY + 5) * D, origin: 'SCHEDULED', severity: 0, shocks: [sh], publicTitleKey: null, causeChain: [] } as unknown as WorldEvent);
  runDays(w, ports, DAY, DAY + 1);
  return w;
}

describe('AC-04-18 every shock target has a consumer', () => {
  it('the cases cover every 04-consumed SHOCK_TARGETS entry; the parameterised ones are read through macroValueShocks', () => {
    const local = SHOCK_TARGETS.filter((t) => !t.includes(':'));
    expect([...new Set(CASES.map((c) => c[0])), 'auction_stress'].sort()).toEqual([...local].sort());
  });
  it.each(CASES)('%s (%s, unit %s) alone moves its consumer in direction %s on the next day close', (target, scope, value, dir, read) => {
    const u = unshocked(), x = shocked(target, scope, value), a = read(u.store, u), b = read(x.store, x);
    expect(Number.isFinite(a) && Number.isFinite(b)).toBe(true);
    expect(Math.sign(b - a)).toBe(dir);
  }, 120_000);
  it('AC-04-18-FEARADD (E-106 (6)): fear_add +5 STEP for 3 days: day 1 ΔF = 5 (1e-9), days 2–3 ΔF ∈ [5, 5.15], |ΔF| < 0.5 after the end', () => {
    const u = world(), x = world(), sh: ActiveShock = { id: 'shk_unit', target: 'fear_add', value: 5, startTick: DAY * D, endTick: (DAY + 3) * D, shape: 'STEP' };
    const r = blocOf(x.store); x.store.put(macroTables.bloc.name, { ...r, shocks: [...r.shocks, sh] });
    const diff: number[] = [];
    for (let d = DAY; d < DAY + 5; d++) { runDays(u, ports, d, d + 1); runDays(x, ports, d, d + 1); diff.push(glob(x.store).fearIndex - glob(u.store).fearIndex); }
    expect(Math.abs(diff[0]! - 5)).toBeLessThan(1e-9);
    for (const v of diff.slice(1, 3)) { expect(v).toBeGreaterThanOrEqual(5); expect(v).toBeLessThanOrEqual(5.15); }   // second-order via FSI / sovereign inputs
    for (const v of diff.slice(3)) expect(Math.abs(v)).toBeLessThan(0.5);
  }, 120_000);
  it('auction_stress: a 0.05 STEP adds 0.05 to the §3.10.4 stress while active', () => {
    const w = world(), r = blocOf(w.store), t = DAY * D;
    const s0 = auctionStress(w.store, B, t);
    w.store.put(macroTables.bloc.name, { ...r, shocks: [...r.shocks, { id: 'shk_unit', target: 'auction_stress', value: 0.05, startTick: t, endTick: t + D, shape: 'STEP' }] });
    expect(auctionStress(w.store, B, t) - s0).toBeCloseTo(Math.min(0.05, 1 - s0), 12);
  }, 120_000);
  it('city_activity / sector_value / commodity_value (read by 07/05/06) come back through macroValueShocks while active', () => {
    const w = world(), t = DAY * D;
    w.store.put(macroTables.event.name, { id: 'evt_unit', tier: 'RIPPLE', kind: 'RIPPLE_SUPPLY', blocs: [], sectors: [], assetsHint: [], phase: 'TRIGGER', phaseSinceTick: t,
      precursorStartTick: t, triggerTick: t, plannedEndTick: t + D, origin: 'SCHEDULED', severity: 0, publicTitleKey: null, causeChain: [],
      shocks: ['city_activity:c1', 'sector_value:3', 'commodity_value:GOLD'].map((k, i) => ({ id: `shk_${i}`, target: k, value: 0.1 * (i + 1), startTick: t, endTick: t + D, shape: 'STEP' })) } as unknown as WorldEvent);
    expect([macroValueShocks(w.store, 'city_activity:c1', t), macroValueShocks(w.store, 'sector_value:3', t), macroValueShocks(w.store, 'commodity_value:GOLD', t + D)])
      .toEqual([0.1, 0.2, 0]);
    expect(macroValueShocks(w.store, 'commodity_value:GOLD', t)).toBeCloseTo(0.3, 15);
  }, 120_000);
});
