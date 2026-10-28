// T04-19: 04's two Stabilizer duties (04 §3.17): the daily mirror of 03's Stabilizer into mac.stab, the daily MSI republish and the
// weekly report. 04 runs no controller and keeps no lever set of its own; every number here is read from 03.
import { EngineFault, TICKS_PER_GAME_DAY, type Id, type PhaseCtx, type StoreRead } from '@tycoon/engine-core';
import type { MoneySupplyReport } from '@tycoon/engine-ledger';
import { macroTables, type GlobalMacroState, type StabilizerState } from '../schema';
import { npcToPlayerWealthRatio } from '../rules/scale';
import { pewFromReport } from '../rules/ledgerStubs';
import { flowDay, LED_FLOWDAY, ledStab, LEVER_KEYS, msiValue, type FlowDay, type Levers } from './ledgerSources';

const D = TICKS_PER_GAME_DAY, REPORT_TICK_OF_DAY = 45;
type StabRow = StabilizerState & { id: 'STAB' };
export type LeverReport = Record<string, { value: number; direction: -1 | 0 | 1 }>;
export interface StabWeeklyReport { dayIndex: number; msi: number; levers: LeverReport; e: number; eLabel: string;
  faucetsWeek: Record<string, string>; sinksWeek: Record<string, string>; netMintWeek: string; m0Index: number; m2Index: number;
  npcToPlayerWealthRatio: number; crisisCountChapter: number }
export interface StabReportPort { latestDailyReport(read: StoreRead): MoneySupplyReport | null }
export const NULL_STAB_REPORT: StabReportPort = Object.freeze({ latestDailyReport: () => null });

const ZERO_DIAG: StabilizerState['diagnostics'] = { faucetsWeek: 0n, sinksWeek: 0n, netMintWeek: 0n, npcToPlayerWealthRatio: 0, m0Index: 100, m2Index: 100 };
const stabRow = (read: StoreRead): StabRow | undefined => read.get<StabRow>(macroTables.stab.name, 'STAB');

/** sign of the change, 0 when equal. */
export function leverDirection(now: number, weekAgo: number): -1 | 0 | 1 { return now > weekAgo ? 1 : now < weekAgo ? -1 : 0; }
/** "Money vs designed path: +12%": percent rounded half away from zero; + for ≥ 0, ASCII - below. */
export function formatMoneyVsPath(e: number): string {
  const r = Math.sign(e) * Math.floor(Math.abs(100 * e) + 0.5);   // −0 prints "+0" (−0 >= 0)
  return `Money vs designed path: ${r >= 0 ? '+' : '-'}${Math.abs(r)}%`;
}

/** t = 0 daily: copies 03's levers, integral, msi and the latest error into mac.stab (a mirror: no 04 rule reads it). */
export function mirrorStabilizer(ctx: PhaseCtx): StabilizerState {
  const prev = stabRow(ctx.store), led = ledStab(ctx.store);
  if (!led) { if (prev) return prev; throw new EngineFault('MAC_STATE_MISSING', 'mirrorStabilizer: no mac.stab and no led.stab'); }
  const levers = {} as Levers;
  for (const k of LEVER_KEYS) levers[k] = led.levers[k];
  const last = led.history[led.history.length - 1];
  const row: StabRow = { id: 'STAB', levers, integral: led.integral, msi: msiValue(ctx.store), errorLog: last ? last.e : led.lastError,
    lastPublishedReportTick: prev?.lastPublishedReportTick ?? -1, diagnostics: prev?.diagnostics ?? ZERO_DIAG };
  ctx.store.put(macroTables.stab.name, row);
  return row;
}

/** Day step (13): `macro.stab.msi` PUBLIC with 03's MSI unchanged. */
export function publishMsi(ctx: PhaseCtx): number {
  const msi = msiValue(ctx.store);
  ctx.emit('macro.stab.msi', [] as Id[], { msi }, 'PUBLIC');
  return msi;
}

const sumBig = (xs: readonly string[]): bigint => xs.reduce((a, x) => a + BigInt(x), 0n);
/** 100 × M(D) / M(base) with bigint first (Number(M_D × 10^8 / M_base) / 10^6); 100 when the base is 0. */
export function moneyIndex(mD: bigint, mBase: bigint): number { return mBase === 0n ? 100 : Number((mD * 100_000_000n) / mBase) / 1_000_000; }

function oldestFlowDay(read: StoreRead, ccy: string): FlowDay | null {
  let best: FlowDay | null = null;
  for (const f of read.iter<FlowDay>(LED_FLOWDAY)) if (f.ccy === ccy && (best === null || f.dayIndex < best.dayIndex)) best = f;
  return best;
}

/** The report for the 03 day close `D` (no emit, no write); `pewRatio` is the NPC-to-player ratio carried in. */
export function buildWeeklyReport(read: StoreRead, D0: number, pewRatio: number): StabWeeklyReport | null {
  const led = ledStab(read), h = led?.history.find((x) => x.dayIndex === D0);
  if (!led || !h) return null;
  const ago = led.history.find((x) => x.dayIndex === D0 - 7), levers: LeverReport = {};
  for (const k of LEVER_KEYS) levers[k] = { value: h.levers[k], direction: ago ? leverDirection(h.levers[k], ago.levers[k]) : 0 };
  const days: FlowDay[] = [];
  for (let k = D0 - 6; k <= D0; k++) { const f = flowDay(read, 'FDL', k); if (f) days.push(f); }
  const faucet = sumBig(days.map((f) => f.byClass.FAUCET ?? '0')), sink = sumBig(days.map((f) => f.byClass.SINK ?? '0'));
  const cur = flowDay(read, 'FDL', D0), base = oldestFlowDay(read, 'FDL');
  const g = read.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL');
  return { dayIndex: D0, msi: msiValue(read) /* 03 keeps no MSI per history day; at Monday t = 45 it is still D's close value */, levers, e: h.e, eLabel: formatMoneyVsPath(h.e),
    faucetsWeek: { FAUCET: faucet.toString() }, sinksWeek: { SINK: sink.toString() }, netMintWeek: (faucet - sink).toString(),
    m0Index: cur && base ? moneyIndex(BigInt(cur.M0), BigInt(base.M0)) : 100, m2Index: cur && base ? moneyIndex(BigInt(cur.M2), BigInt(base.M2)) : 100,
    npcToPlayerWealthRatio: pewRatio, crisisCountChapter: g?.scheduler.majorsThisChapter ?? 0 };
}

/** Monday t = 45 (tick 720·d + 45, d ≡ 0 mod 7, d > 0): the report on the most recent 03 day close D = d − 1. */
export function weeklyStabReport(ctx: PhaseCtx, src: StabReportPort): StabWeeklyReport | null {
  const d = Math.floor(ctx.tick / D);
  if (d === 0 || d % 7 !== 0 || ctx.tick % D !== REPORT_TICK_OF_DAY) return null;
  const prev = stabRow(ctx.store), rep = src.latestDailyReport(ctx.store), g = ctx.store.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL');
  const ratio = rep && g ? npcToPlayerWealthRatio(g.worldNominalGdpFdl, pewFromReport(rep)) : (prev?.diagnostics.npcToPlayerWealthRatio ?? 0);
  const r = buildWeeklyReport(ctx.store, d - 1, ratio);
  if (!r) return null;
  const diagnostics = { faucetsWeek: BigInt(r.faucetsWeek.FAUCET!), sinksWeek: BigInt(r.sinksWeek.SINK!), netMintWeek: BigInt(r.netMintWeek),
    npcToPlayerWealthRatio: r.npcToPlayerWealthRatio, m0Index: r.m0Index, m2Index: r.m2Index };
  const base: StabRow = prev ?? { id: 'STAB', levers: { L1_demand: 0, L2_lifestyle_price: 0, L3_levy_bp: 0, L4_upkeep: 0 }, integral: 0, msi: r.msi, errorLog: r.e,
    lastPublishedReportTick: -1, diagnostics: ZERO_DIAG };
  ctx.store.put(macroTables.stab.name, { ...base, diagnostics, lastPublishedReportTick: ctx.tick });
  ctx.emit('macro.stab.report', [] as Id[], reportPayload(r), 'PUBLIC');
  return r;
}

const DIR = { '-1': 'DOWN', '0': 'FLAT', '1': 'UP' } as const;
/** StabWeeklyReport → the T04-01 `macro.stab.report` schema (§3.17.5 contents). */
export function reportPayload(r: StabWeeklyReport): unknown {
  const levers: Record<string, number> = {}, leverDirections: Record<string, string> = {};
  for (const k of LEVER_KEYS) { levers[k] = r.levers[k]!.value; leverDirections[k] = DIR[String(r.levers[k]!.direction) as '-1' | '0' | '1']; }
  return { msi: r.msi, levers, leverDirections, e: r.e, faucetsByClass: r.faucetsWeek, sinksByClass: r.sinksWeek, netMint: r.netMintWeek,
    m0Index: r.m0Index, m2Index: r.m2Index, npcToPlayerWealthRatio: r.npcToPlayerWealthRatio, crisisCount: r.crisisCountChapter };
}
