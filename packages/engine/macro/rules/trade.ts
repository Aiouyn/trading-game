// T04-15: world trade index and tariff level, day close (04 §3.14.3). Genesis tariff 0.03 and WTI 100 (T04-20 writes them).
import { dmath, EngineFault, TICKS_PER_GAME_DAY, type PhaseCtx } from '@tycoon/engine-core';
import { BLOC_DEFAULTS } from '../blocs';
import type { MacroPorts } from '../ports';
import { BLOC_ORDER, macroTables, type BlocId, type BlocMacroState, type GlobalMacroState, type WorldEvent } from '../schema';

const TARIFF_MIN = 0;
const TARIFF_MAX = 0.4;

/** 100·(Σ share0·real/100)^1.5·((1 − τ)/0.97)². */
export function worldTradeIndex(realGdpIndex: Record<BlocId, number>, tariffLevel: number): number {
  let s = 0;
  for (const b of BLOC_ORDER) s += BLOC_DEFAULTS[b].gdpShare0 * realGdpIndex[b] / 100;
  const t = (1 - tariffLevel) / (1 - 0.03);
  return 100 * s * Math.sqrt(s) * t * t;
}

/** tariff + Σ deltas, clamped to [0, 0.4]. */
export function stepTariff(tariff: number, deltas: number[]): number {
  let t = tariff;
  for (const d of deltas) t += d;
  return dmath.clamp(t, TARIFF_MIN, TARIFF_MAX);
}

/** Day close: tariff changes from 16 (tariffDelta) and active TRADE_WAR shocks (target `tariff_level`), then WTI; writes mac.global. */
export function dailyTrade(ctx: PhaseCtx, ports: MacroPorts): void {
  const s = ctx.store;
  const g = s.get<GlobalMacroState & { id: 'GLOBAL' }>(macroTables.global.name, 'GLOBAL');
  if (!g) throw new EngineFault('I0.macro_global', 'no mac.global GLOBAL row (written at genesis, T04-20)');
  const deltas = [ports.world.tariffDelta(s, ctx.tick)];
  // A `tariff_level` shock of an active world event is a change applied once, at the day close of the game day its startTick falls in.
  const sc = g.scheduler;
  const ids = [...(sc.activeMajorId === null ? [] : [sc.activeMajorId]), ...sc.activeStormIds, ...sc.activeRippleIds];
  for (const id of ids) {
    const e = s.get<WorldEvent>(macroTables.event.name, id);
    for (const sh of e?.shocks ?? []) if (sh.target === 'tariff_level' && sh.startTick > ctx.tick - TICKS_PER_GAME_DAY && sh.startTick <= ctx.tick) deltas.push(sh.value);
  }
  const tariffLevel = stepTariff(g.tariffLevel, deltas);
  const real = {} as Record<BlocId, number>;
  // #72 Producer ruling item 7: no fallback to 100; a missing bloc row or realGdpIndex is a fault.
  for (const b of BLOC_ORDER) {
    const r = s.get<BlocMacroState>(macroTables.bloc.name, b)?.realGdpIndex;
    if (r === undefined || !Number.isFinite(r)) throw new EngineFault('I0.macro_bloc', `no realGdpIndex on mac.bloc ${b} (T04-04 writes it daily)`);
    real[b] = r;
  }
  s.put(macroTables.global.name, { ...g, tariffLevel, worldTradeIndex: worldTradeIndex(real, tariffLevel) });
}
