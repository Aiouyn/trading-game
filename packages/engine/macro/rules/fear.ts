// T04-15: Fear Index F and risk appetite RA, every game hour (04 §3.14.1). Order inside the hour: hourlyFsi first, then hourlyFear
// reads the FSI it just wrote (card step 1). Both read state committed at the end of the previous tick.
// Storage (#72 Producer ruling, item 4): the last value of each fear input is held in its own row mac.indicator_hold `GLOBAL`
// (`fear[<FearInputs key>]`), the IG spread daily closes for the 364-day mean in `igCloses[<gameDay>]`, and a missing input's key
// is appended once to mac.inputs `staleKeys` (edge 23).
import { dmath, EngineFault, type Id, type PhaseCtx, type StoreRead } from '@tycoon/engine-core';
import type { MacroPorts } from '../ports';
import { macroTables, type DailyHistoryRow, type GlobalIndicatorHold, type GlobalMacroState, type MacroInputs, type WorldEvent } from '../schema';

export interface FearInputs { rv21Gx: number; creditSpreadIdx: number; fsi: number; crisisTerm: number; tension: number; hackRate: number; gxReturnToday: number; gxReturn63d: number }

/** 100·σ(−1.2 + 3(rv − 0.16)/0.16 + 2(csi − 1) + 2.5·FSI + crisis + 0.8(T − 50)/50 + 0.5(H − 50)/50 + 2·max(0, −r)/0.03 − 0.5·r63/0.10). */
export function fearRaw(x: FearInputs): number {
  const z = -1.2 + 3.0 * (x.rv21Gx - 0.16) / 0.16 + 2.0 * (x.creditSpreadIdx - 1) + 2.5 * x.fsi + 1.0 * x.crisisTerm
    + 0.8 * (x.tension - 50) / 50 + 0.5 * (x.hackRate - 50) / 50 + 2.0 * Math.max(0, -x.gxReturnToday) / 0.03 - 0.5 * x.gxReturn63d / 0.10;
  return 100 * dmath.sigmoid(z);
}

/** F + (raw − F)(1 − 2^(−1/2)): one game hour of a 2-hour half-life. */
export function stepFear(F: number, raw: number): number { return F + (raw - F) * (1 - Math.SQRT1_2); }

/** RA = 1 − F/50. */
export function riskAppetite(F: number): number { return 1 - F / 50; }

/** 1 while the active major is in TRIGGER or CONTAGION; 0.5 while a storm is active; else 0. */
export function crisisTerm(store: StoreRead): 0 | 0.5 | 1 {
  const g = store.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL');
  if (!g) return 0;
  const major = g.scheduler.activeMajorId === null ? undefined : store.get<WorldEvent>(macroTables.event.name, g.scheduler.activeMajorId);
  if (major && (major.phase === 'TRIGGER' || major.phase === 'CONTAGION')) return 1;
  return g.scheduler.activeStormIds.length > 0 ? 0.5 : 0;
}

/** 06 DEFAULT anchor IV_ATM,GX ≈ 0.10 + 0.004·F (06 owns the surface). */
export function impliedVolAnchor(F: number): number { return 0.10 + 0.004 * F; }

/** Genesis neutral values (card step 2): rv 0.16, csi 1, returns 0; tension 30 and hack rate 0 (T04-05 input defaults). */
const NEUTRAL = { rv21Gx: 0.16, creditSpreadIdx: 1, gxReturnToday: 0, gxReturn63d: 0, tension: 30, hackRate: 0 } as const;
const IG_WINDOW_DAYS = 364;
const R63_DAYS = 63;

/** The mac.inputs row (stale keys only, edge 23), or an empty one before T04-05's first day close. */
function inputsRow(ctx: PhaseCtx): MacroInputs {
  return ctx.store.get<MacroInputs>(macroTables.inputs.name, 'INPUTS') ?? { id: 'INPUTS', tick: ctx.tick, staleKeys: [], values: {} };
}
/** The mac.indicator_hold row (#72 ruling item 4: held values live here, not in INPUTS), copied for this tick; empty at first use. */
function holdRow(ctx: PhaseCtx): GlobalIndicatorHold {
  const h = ctx.store.get<GlobalIndicatorHold>(macroTables.indicatorHold.name, 'GLOBAL');
  return { id: 'GLOBAL', tick: ctx.tick, fear: { ...h?.fear }, fsi: { ...h?.fsi }, igCloses: { ...h?.igCloses } };
}
/** Value now (stored in `held`), else the held value (else `dflt`), listing `key` in `stale` once. */
function holdInput(held: Record<string, number>, stale: string[], key: string, now: number | null | undefined, dflt: number | null): number | null {
  if (now !== null && now !== undefined) { held[key] = now; return now; }
  if (!stale.includes(key)) stale.push(key);
  return held[key] ?? dflt;
}

/** P2 at each game hour: inputs (held on miss), F ← stepFear(F, fearRaw), RA; writes mac.global and emits macro.fear PUBLIC. */
export function hourlyFear(ctx: PhaseCtx, ports: MacroPorts): void {
  const s = ctx.store;
  const g = s.get<GlobalMacroState & { id: 'GLOBAL' }>(macroTables.global.name, 'GLOBAL');
  if (!g) throw new EngineFault('I0.macro_global', 'no mac.global GLOBAL row (written at genesis, T04-20)');
  const row: MacroInputs = (({ staleKeys, values, ...r }) => ({ ...r, tick: ctx.tick, staleKeys: staleKeys.slice(), values: { ...values } }))(inputsRow(ctx));
  const hold = holdRow(ctx);
  const day = ctx.cal.gameDay;

  // creditSpreadIdx = IG / mean of the daily IG closes over the last 364 game days (today's latest value included)
  const ig = ports.assets.igCreditSpreadIndex(s);
  let csi: number | null = null;
  if (ig !== null && ig !== undefined) {
    hold.igCloses[String(day)] = ig;
    delete hold.igCloses[String(day - IG_WINDOW_DAYS)];
    let sum = 0, n = 0;
    for (let d = day - IG_WINDOW_DAYS + 1; d <= day; d++) { const v = hold.igCloses[String(d)]; if (v !== undefined) { sum += v; n++; } }
    csi = n > 0 && sum > 0 ? ig / (sum / n) : NEUTRAL.creditSpreadIdx;
  }
  // r63: GX level now vs the GLOBAL history row 63 game days ago (DailyHistoryRow.equityIndex keeps the daily GX close)
  const lvl = ports.markets.gxLevel(s);
  const past = s.get<DailyHistoryRow>(macroTables.history.name, `GLOBAL:${day - R63_DAYS}`)?.equityIndex ?? null;
  const r63 = lvl !== null && lvl !== undefined && past !== null && past > 0 ? lvl / past - 1 : null;

  const x: FearInputs = {
    rv21Gx: holdInput(hold.fear, row.staleKeys, 'rv21Gx', ports.markets.rv21Gx(s), NEUTRAL.rv21Gx)!,
    creditSpreadIdx: holdInput(hold.fear, row.staleKeys, 'creditSpreadIdx', csi, NEUTRAL.creditSpreadIdx)!,
    fsi: g.financialStressIndex,
    crisisTerm: crisisTerm(s),
    tension: row.values['geopoliticalTension'] ?? NEUTRAL.tension,
    hackRate: row.values['worldHackRate'] ?? NEUTRAL.hackRate,
    gxReturnToday: holdInput(hold.fear, row.staleKeys, 'gxReturnToday', ports.markets.gxReturnToday(s), NEUTRAL.gxReturnToday)!,
    gxReturn63d: holdInput(hold.fear, row.staleKeys, 'gxReturn63d', r63, NEUTRAL.gxReturn63d)!,
  };
  const F = stepFear(g.fearIndex, fearRaw(x));
  const RA = riskAppetite(F);
  s.put(macroTables.inputs.name, row);
  s.put(macroTables.indicatorHold.name, hold);
  s.put(macroTables.global.name, { ...g, fearIndex: F, riskAppetite: RA });
  ctx.emit('macro.fear', [] as Id[], { F, RA }, 'PUBLIC');
}
