// T04-15: Fear Index F and risk appetite RA, every game hour (04 §3.14.1). Order inside the hour: hourlyFsi first, then hourlyFear
// reads the FSI it just wrote (card step 1). Both read state committed at the end of the previous tick.
// Storage (E-93 (2)): held hourly values live in the mac.inputs row `HOURLY` (rv21Gx, gxReturnToday, igCreditSpreadIndex; the IG
// daily closes for the 364-day mean as `igClose.<gameDay>`), never in `INPUTS`; a null read lists the key once in HOURLY.staleKeys
// (edge 23; T04-20 day step 1 merges and clears them). The row is put only when a value or staleKeys changed.
import { dmath, EngineFault, HOLIDAYS_ENABLED_DEFAULT, isTradingDay, type Id, type PhaseCtx, type StoreRead } from '@tycoon/engine-core';
import type { MacroPorts } from '../ports';
import { macroTables, type DailyHistoryRow, type GlobalMacroState, type MacroInputs, type WorldEvent } from '../schema';

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
const R63_TRADING_DAYS = 63;
/** HOURLY key of the daily IG close of game day d, for the 364-day mean (not in E-93 (2)'s key list; batched question). */
const igCloseKey = (d: number): string => `igClose.${d}`;

/** The mac.inputs `HOURLY` row (E-93 (2)), copied; written at genesis (T04-20 step 1.1), so a missing row is MAC_STATE_MISSING (E-93 (4)). */
function hourlyRow(s: StoreRead): { row: MacroInputs; changed: boolean } {
  const h = s.get<MacroInputs>(macroTables.inputs.name, 'HOURLY');
  if (!h) throw new EngineFault('MAC_STATE_MISSING', 'no mac.inputs HOURLY row (written at genesis, T04-20 step 1.1)', ['HOURLY']);
  return { row: { ...h, staleKeys: h.staleKeys.slice(), values: { ...h.values } }, changed: false };
}
/** E-93 (2): a non-null read replaces the held value; a null read keeps it and lists `key` in HOURLY.staleKeys once. Marks a change. */
function holdKey(h: { row: MacroInputs; changed: boolean }, key: string, now: number | null | undefined): number | undefined {
  if (now !== null && now !== undefined) {
    if (!Object.is(h.row.values[key], now)) { h.row.values[key] = now; h.changed = true; }
    return now;
  }
  if (!h.row.staleKeys.includes(key)) { h.row.staleKeys.push(key); h.changed = true; }
  return h.row.values[key];
}
/** E-103 (3) AC-04-15-IGCLOSE: every call deletes every `igClose.<d>` with d ≤ today − 364 (no orphans after read gaps). Deletion is
 *  order-independent, so the own-key walk is G8-safe. */
function pruneIgCloses(h: { row: MacroInputs; changed: boolean }, today: number): void {
  for (const k of Object.getOwnPropertyNames(h.row.values)) {
    const m = /^igClose\.(0|[1-9][0-9]*)$/.exec(k);
    if (m && Number(m[1]) <= today - IG_WINDOW_DAYS) { delete h.row.values[k]; h.changed = true; }
  }
}
/** mac.global GLOBAL, or MAC_STATE_MISSING (E-93 (4)). */
function globalRow(s: StoreRead): GlobalMacroState & { id: 'GLOBAL' } {
  const g = s.get<GlobalMacroState & { id: 'GLOBAL' }>(macroTables.global.name, 'GLOBAL');
  if (!g) throw new EngineFault('MAC_STATE_MISSING', 'no mac.global GLOBAL row (written at genesis, T04-20)', ['GLOBAL']);
  return g;
}
/** E-93 (3): the GLOBAL history day 63 trading days (FDL calendar, the caller's holidays flag) before the latest closed trading day
 *  (the last trading day before today); null when that day would precede genesis. */
function r63Day(today: number, holidays: boolean): number | null {
  let d = today - 1;
  while (d >= 0 && !isTradingDay('FDL', d, holidays)) d--;
  for (let n = 0; n < R63_TRADING_DAYS && d >= 0; n++) { d--; while (d >= 0 && !isTradingDay('FDL', d, holidays)) d--; }
  return d >= 0 ? d : null;
}

/** P2 at each game hour: inputs (held on miss), F ← stepFear(F, fearRaw), RA; writes mac.global and emits macro.fear PUBLIC. */
export function hourlyFear(ctx: PhaseCtx, ports: MacroPorts, holidays: boolean = HOLIDAYS_ENABLED_DEFAULT): void {
  const s = ctx.store;
  const g = globalRow(s);
  const h = hourlyRow(s);
  const daily = s.get<MacroInputs>(macroTables.inputs.name, 'INPUTS');
  const day = ctx.cal.gameDay;

  // creditSpreadIdx = IG / mean of the daily IG closes over the last 364 game days (today's latest value included); IG absent → 1
  const igNow = ports.assets.igCreditSpreadIndex(s);
  const ig = holdKey(h, 'igCreditSpreadIndex', igNow);
  if (igNow !== null && igNow !== undefined) holdKey(h, igCloseKey(day), igNow);
  pruneIgCloses(h, day);
  let csi: number = NEUTRAL.creditSpreadIdx;
  if (ig !== undefined) {
    let sum = 0, n = 0;
    for (let d = day - IG_WINDOW_DAYS + 1; d <= day; d++) { const v = h.row.values[igCloseKey(d)]; if (v !== undefined) { sum += v; n++; } }
    if (n > 0 && sum > 0) csi = ig / (sum / n);
  }
  // r63 (E-93 (3), E-103 (4) AC-04-15-R63HOLD): GX level now vs DailyHistoryRow.equityIndex 63 trading days back.
  const lvl = ports.markets.gxLevel(s);
  const d63 = r63Day(day, holidays);
  const row = d63 === null ? undefined : s.get<DailyHistoryRow>(macroTables.history.name, `GLOBAL:${d63}`);
  const lvlOk = lvl !== null && lvl !== undefined, past = row?.equityIndex ?? null;
  let r63: number;
  if (row === undefined) {   // (a) warm-up: 0, nothing held; a null level is still listed
    r63 = NEUTRAL.gxReturn63d;
    if (!lvlOk) holdKey(h, 'gxReturn63d', null);
  } else if (lvlOk && past !== null && past > 0) r63 = holdKey(h, 'gxReturn63d', lvl / past - 1) as number;   // (b)
  else r63 = holdKey(h, 'gxReturn63d', null) ?? NEUTRAL.gxReturn63d;   // (c) held (0 if none), listed; never faults

  const x: FearInputs = {
    rv21Gx: holdKey(h, 'rv21Gx', ports.markets.rv21Gx(s)) ?? NEUTRAL.rv21Gx,
    creditSpreadIdx: csi,
    fsi: g.financialStressIndex,
    crisisTerm: crisisTerm(s),
    tension: daily?.values['geopoliticalTension'] ?? NEUTRAL.tension,
    hackRate: daily?.values['worldHackRate'] ?? NEUTRAL.hackRate,
    gxReturnToday: holdKey(h, 'gxReturnToday', ports.markets.gxReturnToday(s)) ?? NEUTRAL.gxReturnToday,
    gxReturn63d: r63,
  };
  const F = stepFear(g.fearIndex, fearRaw(x));
  const RA = riskAppetite(F);
  if (h.changed) s.put(macroTables.inputs.name, { ...h.row, tick: ctx.tick });   // E-93 (2): put only on a change
  s.put(macroTables.global.name, { ...g, fearIndex: F, riskAppetite: RA });
  ctx.emit('macro.fear', [] as Id[], { F, RA }, 'PUBLIC');
}
