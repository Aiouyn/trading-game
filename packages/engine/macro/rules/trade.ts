// T04-15: world trade index and tariff level, day close (04 §3.14.3). Genesis tariff 0.03 and WTI 100 (T04-20 writes them).
import { dmath, EngineFault, TICKS_PER_GAME_DAY, type PhaseCtx, type StoreRead } from '@tycoon/engine-core';
import { BLOC_DEFAULTS } from '../blocs';
import type { MacroPorts } from '../ports';
import { BLOC_ORDER, macroTables, type ActiveShock, type BlocId, type BlocMacroState, type GlobalMacroState, type WorldEvent } from '../schema';

const TARIFF_MIN = 0;
const TARIFF_MAX = 0.4;

/** 100·(Σ share0·real/100)^1.5·((1 − τ)/0.97)². */
export function worldTradeIndex(realGdpIndex: Record<BlocId, number>, tariffLevel: number): number {
  let s = 0;
  for (const b of BLOC_ORDER) s += BLOC_DEFAULTS[b].gdpShare0 * realGdpIndex[b] / 100;
  const t = (1 - tariffLevel) / (1 - 0.03);
  return 100 * s * Math.sqrt(s) * t * t;
}

/** clamp(tariff + Σ deltas in array order, 0, 0.4); applied to tariffBase (E-94 (a)). */
export function stepTariff(tariff: number, deltas: number[]): number {
  let t = tariff;
  for (const d of deltas) t += d;
  return dmath.clamp(t, TARIFF_MIN, TARIFF_MAX);
}

/** clamp(tariffBase + shockSum, 0, 0.4) = tariffLevel (E-94 (a)). */
export function effectiveTariff(tariffBase: number, shockSum: number): number {
  return dmath.clamp(tariffBase + shockSum, TARIFF_MIN, TARIFF_MAX);
}

/** T04-18 step 4 shape of one shock at `tick` (STEP constant, RAMP linear from 0 to value, DECAY half-life), 0 outside [startTick, endTick). */
export function shockValueAt(sh: ActiveShock, tick: number): number {
  if (tick < sh.startTick || tick >= sh.endTick) return 0;
  if (sh.shape === 'STEP') return sh.value;
  if (sh.shape === 'RAMP') return sh.value * (tick - sh.startTick) / (sh.endTick - sh.startTick);
  if (sh.halfLifeDays === undefined) throw new EngineFault('MAC_STATE_MISSING', `DECAY shock ${sh.id} without halfLifeDays`, [sh.id]);
  return sh.value * dmath.pow(2, -(tick - sh.startTick) / (sh.halfLifeDays * TICKS_PER_GAME_DAY));
}
/** Module-private stand-in for T04-18's activeShockSum(store, 'tariff_level', 'WORLD', tick) (MISSING EXPORT, T04-18 not built):
 *  the sum over every mac.event row's `tariff_level` shocks at `tick`. */
function tariffShockSum(s: StoreRead, tick: number): number {
  let sum = 0;
  for (const e of s.iter<WorldEvent>(macroTables.event.name)) for (const sh of e.shocks) if (sh.target === 'tariff_level') sum += shockValueAt(sh, tick);
  return sum;
}

/** Day close (E-94 (a)): tariffBase ← stepTariff(tariffBase, [tariffDelta]) (16), then tariffLevel = effectiveTariff(tariffBase,
 *  activeShockSum('tariff_level') at this close), so a shock lifts the level while active and the level returns to the base exactly
 *  when it ends; then WTI. Writes mac.global. */
export function dailyTrade(ctx: PhaseCtx, ports: MacroPorts): void {
  const s = ctx.store;
  const g = s.get<GlobalMacroState & { id: 'GLOBAL' }>(macroTables.global.name, 'GLOBAL');
  if (!g) throw new EngineFault('MAC_STATE_MISSING', 'no mac.global GLOBAL row (written at genesis, T04-20)', ['GLOBAL']);
  if (g.tariffBase === undefined) throw new EngineFault('MAC_STATE_MISSING', 'no mac.global GLOBAL tariffBase (written at genesis, T04-20 step 1.1, E-94 (a))', ['GLOBAL']);
  const tariffBase = stepTariff(g.tariffBase, [ports.world.tariffDelta(s, ctx.tick)]);
  const tariffLevel = effectiveTariff(tariffBase, tariffShockSum(s, ctx.tick));
  const real = {} as Record<BlocId, number>;
  for (const b of BLOC_ORDER) {
    const r = s.get<BlocMacroState>(macroTables.bloc.name, b)?.realGdpIndex;
    if (r === undefined) throw new EngineFault('MAC_STATE_MISSING', `no mac.bloc ${b} realGdpIndex (written at genesis, T04-20)`, [b]);   // E-93 (5): no fallback
    real[b] = r;
  }
  s.put(macroTables.global.name, { ...g, tariffBase, tariffLevel, worldTradeIndex: worldTradeIndex(real, tariffLevel) });
}
