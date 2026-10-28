// T04-18 04#36: every major kind forced (T04-17 forceEvent) on clean seeds; each 04-measured CalibrationBand must hit in ≥ 70% of 50 runs.
// Bands measured by 05/06/07/08/10/11/12 are listed with their module; those modules are stubs in this harness, so the scenario checks the
// exact hook calls each kind writes instead (EXPECTED_HOOKS, 04 §3.16.4 table at severity 1).
// Readings (unit decisions, see PR Decisions): run from day 1 (genesis + 1 day close) until the event is ENDED or MAX_RUN_DAYS; s10_peak = max
// daily sovereign.spread10y over the event blocs; srl/pyn_fair_change = exp(min fairValueLn − start) − 1; capital_controls_days = SRL days with
// controls > 0; headline_change = max rise of the GDP-weighted world headline inflation (catalogInputs); peak_fsi = max daily GLOBAL FSI;
// pie1_rise = max rise of the 5-bloc mean inflationExp1y (E-104 (1)). CURRENCY_CRISIS arms SRL naturally from the seeded + mirrored reserve
// drain (E-106 (5); the harness never writes fx.breakArmed); srlArms / srlConcordDays / srlBreakDay record it (E-107 (1) Concord path). OIL_SHOCK's 06 band runs nightly with
// WARM_DAYS and ref06Ports (E-104).
import { dmath, TICKS_PER_GAME_DAY } from '@tycoon/engine-core';
import { defaultMacroPorts, type MacroPorts } from '../../ports';
import { BLOC_ORDER, macroTables, type BlocId, type BlocMacroState, type ConcordFacility, type CrisisKind, type GlobalMacroState, type HookCall, type WorldEvent } from '../../schema';
import { catalogInputs, MAJORS, type CalibrationBand } from '../../rules/crisisCatalog';
import { forceEvent } from '../../rules/scheduler';
import { tradingDaysOfPeriod } from '../../rules/calendar';
import { CSF_ID } from '../../ids';
import { macroGenesis } from '../../core/genesis';
import { GENESIS_DEFAULT } from '../../rules/inputs';
import { macroWorld, type MacroWorld } from '../../testkit/macroWorld';
import { runDays } from '../../testkit/macroLoop';

export const CRISIS_SEEDS = 50, CRISIS_PASS_SHARE = 0.7, MAX_RUN_DAYS = 240;
/** E-104 (1): OIL_SHOCK 06 band: 364 warm-up days, 06 elasticity 10. */
export const WARM_DAYS = 364, REF06_ELASTICITY = 10;
/** Kinds whose band runs on the nightly warm-up path (06-measured, ref06Ports), E-104 (1). */
export const WARM_KINDS: readonly CrisisKind[] = ['OIL_SHOCK'];

export interface Trace { s10Peak: number; srlFairMin: number; pynFairMin: number; srlControlDays: number; headlineRise: number; peakFsi: number; pie1Rise: number }
/** srlArms: each forced close (1-based) on which SRL fx.breakArmed turned true, with its game day; srlConcordDays: game days on which an SRL
 *  BREAK_PENDING Concord program started after forcing; srlBreakDay / srlBreakClose: game day of SRL breakTick and the forced close that showed it. */
export interface SrlArm { close: number; day: number }
export interface ForcedRun { kind: CrisisKind; seed: number; ev: WorldEvent; days: number; trace: Trace; hooks: HookCall[]; srlArms: SrlArm[]; srlConcordDays: number[];
  srlBreakDay: number | null; srlBreakClose: number | null }

const blocOf = (w: MacroWorld, b: BlocId): BlocMacroState => w.store.get<BlocMacroState>(macroTables.bloc.name, b)!;
const fsiOf = (w: MacroWorld): number => w.store.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL')?.financialStressIndex ?? 0;

/** The trace fold (pure, unit-tested): start values, then each day close. */
export interface TraceAcc { srl0: number; pyn0: number; head0: number; pie10: number; t: Trace }
export interface TraceDay { s10: number[]; srlLn: number; pynLn: number; srlControls: number; head: number; fsi: number; pie1: number }
export function newTrace(d0: TraceDay): TraceAcc {
  return { srl0: d0.srlLn, pyn0: d0.pynLn, head0: d0.head, pie10: d0.pie1, t: { s10Peak: Number.NEGATIVE_INFINITY, srlFairMin: 0, pynFairMin: 0, srlControlDays: 0, headlineRise: 0, peakFsi: d0.fsi, pie1Rise: 0 } };
}
export function foldTrace(a: TraceAcc, d: TraceDay): void {
  const t = a.t;
  for (const s of d.s10) if (s > t.s10Peak) t.s10Peak = s;
  t.srlFairMin = Math.min(t.srlFairMin, dmath.exp(d.srlLn - a.srl0) - 1);
  t.pynFairMin = Math.min(t.pynFairMin, dmath.exp(d.pynLn - a.pyn0) - 1);
  if (d.srlControls > 0) t.srlControlDays++;
  t.headlineRise = Math.max(t.headlineRise, d.head - a.head0);
  t.peakFsi = Math.max(t.peakFsi, d.fsi);
  t.pie1Rise = Math.max(t.pie1Rise, d.pie1 - a.pie10);
}
export function metricOf(t: Trace, metric: string): number | null {
  switch (metric) {
    case 's10_peak': return t.s10Peak === Number.NEGATIVE_INFINITY ? null : t.s10Peak;
    case 'srl_fair_change': return t.srlFairMin;
    case 'pyn_fair_change': return t.pynFairMin;
    case 'capital_controls_days': return t.srlControlDays;
    case 'headline_change': return t.headlineRise;
    case 'peak_fsi': return t.peakFsi;
    case 'pie1_rise': return t.pie1Rise;
    default: return null;
  }
}
export const bandHit = (b: CalibrationBand, v: number | null): boolean => v !== null && v >= b.lo && v <= b.hi;

function sample(w: MacroWorld, p: MacroPorts, ev: WorldEvent): TraceDay {
  const srl = blocOf(w, 'SRL'), pyn = blocOf(w, 'PYN');
  return { s10: ev.blocs.map((b) => blocOf(w, b).sovereign.spread10y), srlLn: srl.fx.fairValueLn, pynLn: pyn.fx.fairValueLn, srlControls: srl.fx.capitalControls,
    head: catalogInputs(w.store, p).worldHeadlineInflation, fsi: fsiOf(w), pie1: BLOC_ORDER.reduce((a, b) => a + blocOf(w, b).inflationExp1y, 0) / BLOC_ORDER.length };
}

/** 06 reference commodity response (E-104, Producer-approved stub): price = 100 × (1 + REF06_ELASTICITY × Σ −pct over the commodity's active
 *  commoditySupplyShock hooks); GOLD keeps the base port. */
export function ref06Ports(base: MacroPorts = defaultMacroPorts()): MacroPorts {
  return { ...base, assets: { ...base.assets, commodityClose: (s, c) => {
    if (c === 'GOLD') return base.assets.commodityClose(s, c);
    const t = s.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL')?.tick ?? 0;
    let cut = 0;
    for (const h of s.iter<HookCall>(macroTables.hookCall.name)) {
      if (h.hook !== 'commoditySupplyShock' || h.args.commodityId !== c) continue;
      if (t >= h.startTick && t < h.startTick + Number(h.args.days) * TICKS_PER_GAME_DAY) cut -= Number(h.args.pct);
    }
    return 100 * (1 + REF06_ELASTICITY * cut);
  } } };
}

/** Reference 16 political-stability response (E-108 (4), E-109 (1) stub contract; 16's spec does not define it yet): politicalStability =
 *  genesis 0.7 + Σ delta over the bloc's active politicalStabilityShock hooks, clamped [0, 1]. A hook is active from startTick for args.days.
 *  E-109 (2) `ps16after`, once the hook's world event is ENDED: 'end' (default, case (3): no stability readout) drops the delta at the ENDED
 *  tick; 'fade' keeps the full delta until ENDED, then fades it linearly to 0 at the end of the hook's window. Only SOVEREIGN_DEBT_CRISIS
 *  writes those hooks, so for every other kind it returns the genesis value T04-07 already holds. */
export type Ps16After = 'end' | 'fade';
export function ref16Ports(base: MacroPorts = defaultMacroPorts(), o: { ps16after?: Ps16After } = {}): MacroPorts {
  const after = o.ps16after ?? 'end';
  return { ...base, world: { ...base.world, politicalStability: (s, b) => {
    const t = s.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL')?.tick ?? 0;
    let ps = GENESIS_DEFAULT.politicalStability;
    for (const h of s.iter<HookCall>(macroTables.hookCall.name)) {
      if (h.hook !== 'politicalStabilityShock' || h.args.bloc !== b) continue;
      const endAt = h.startTick + Number(h.args.days) * TICKS_PER_GAME_DAY;
      if (t < h.startTick || t >= endAt) continue;
      const ev = s.get<WorldEvent>(macroTables.event.name, h.worldEventId);
      if (ev?.phase === 'ENDED' && t >= ev.phaseSinceTick) {
        if (after === 'end') continue;
        const e0 = Math.min(ev.phaseSinceTick, endAt);
        ps += Number(h.args.delta) * (endAt - t) / Math.max(1, endAt - e0);
        continue;
      }
      ps += Number(h.args.delta);
    }
    return dmath.clamp(ps, 0, 1);
  } } };
}

export interface RunOpts { maxDays?: number; ports?: MacroPorts; warmDays?: number }
/** One forced run: genesis, 1 + warmDays day closes, forceEvent(kind) at severity 1, then day closes until ENDED (or maxDays). */
export function forcedRun(kind: CrisisKind, seed: number, o: RunOpts = {}): ForcedRun {
  const maxDays = o.maxDays ?? MAX_RUN_DAYS, ports = o.ports ?? defaultMacroPorts(), start = 1 + (o.warmDays ?? 0);
  const w = macroWorld(`crisis:${kind}:${seed}`, 0);
  macroGenesis(w.ctx, ports);
  runDays(w, ports, 0, start);
  w.reads.length = 0; w.events.length = 0; w.cb.posts.length = 0; w.cb.events.length = 0; w.cb.sent.length = 0;
  const ev0 = forceEvent(w.ctx, kind, { severity: 1, ...(kind === 'CURRENCY_CRISIS' ? { blocs: ['SRL' as BlocId] } : {}) })   // the band is on SRL;
  const acc = newTrace(sample(w, ports, ev0));
  let n = 0, ev = ev0, armed = blocOf(w, 'SRL').fx.breakArmed === true, srlBreakDay: number | null = null, srlBreakClose: number | null = null;
  const srlArms: SrlArm[] = [], t0 = start * TICKS_PER_GAME_DAY;
  for (; n < maxDays; n++) {
    runDays(w, ports, start + n, start + n + 1);
    const srl = blocOf(w, 'SRL').fx;
    if (srl.breakArmed && !armed) srlArms.push({ close: n + 1, day: start + n });
    armed = srl.breakArmed === true;
    if (srlBreakDay === null && srl.breakTick !== undefined) { srlBreakDay = Math.floor(srl.breakTick / TICKS_PER_GAME_DAY); srlBreakClose = n + 1; }
    w.reads.length = 0; w.events.length = 0; w.cb.posts.length = 0; w.cb.events.length = 0; w.cb.sent.length = 0;
    ev = w.store.get<WorldEvent>(macroTables.event.name, ev0.id) ?? ev;
    foldTrace(acc, sample(w, ports, ev));
    if (ev.phase === 'ENDED') { n++; break; }
  }
  const hooks = w.store.iter<HookCall>(macroTables.hookCall.name).filter((h) => h.worldEventId === ev0.id);
  const csf = w.store.get<ConcordFacility>(macroTables.csf.name, CSF_ID);
  const srlConcordDays = (csf?.programs ?? []).filter((p) => p.bloc === 'SRL' && p.cause === 'BREAK_PENDING' && p.startTick >= t0).map((p) => Math.floor(p.startTick / TICKS_PER_GAME_DAY));
  return { kind, seed, ev, days: n, trace: acc.t, hooks, srlArms, srlConcordDays, srlBreakDay, srlBreakClose };
}

/** E-107 (1) 04#36 CURRENCY_CRISIS run predicate (Concord path; pending Producer ruling): SRL first armed on a forced close in [24, 30]; the next
 *  SRL trading day is either the break (t = 45 breakRuleCheck) or a BREAK_PENDING Concord, and after a Concord the next arming breaks on the
 *  following SRL trading day; first break by forced close 40; capital_controls_days ≥ 3 and srl_fair_change ≤ −0.40. Pass = ≥ 35 of 50 runs. */
export const CURRENCY_ARM_CLOSES = [24, 30] as const, CURRENCY_BREAK_BY_CLOSE = 40, CURRENCY_PASS_RUNS = 35;
const nextSrlTradingDay = (day: number): number => tradingDaysOfPeriod('SRL', day + 1, 14)[0]!;
export function currencyCrisisHit(r: Pick<ForcedRun, 'srlArms' | 'srlConcordDays' | 'srlBreakDay' | 'srlBreakClose' | 'trace'>): boolean {
  const a0 = r.srlArms[0];
  if (a0 === undefined || r.srlBreakDay === null || r.srlBreakClose === null) return false;
  if (a0.close < CURRENCY_ARM_CLOSES[0] || a0.close > CURRENCY_ARM_CLOSES[1] || r.srlBreakClose > CURRENCY_BREAK_BY_CLOSE) return false;
  const d0 = nextSrlTradingDay(a0.day), a1 = r.srlArms[1];
  const path = r.srlBreakDay === d0 || (r.srlConcordDays.includes(d0) && a1 !== undefined && r.srlBreakDay === nextSrlTradingDay(a1.day));
  return path && r.trace.srlControlDays >= 3 && r.trace.srlFairMin <= -0.40;
}

export interface BandCheck { kind: CrisisKind; metric: string; measuredBy: CalibrationBand['measuredBy']; hits: number; runs: number; pass: boolean | null }
type Judge = (kind: CrisisKind, b: CalibrationBand) => boolean;
const judge04: Judge = (k, b) => b.measuredBy === '04' && !WARM_KINDS.includes(k);
/** The nightly warm-up path judges the WARM_KINDS bands (OIL_SHOCK headline_change, 06 via ref06Ports). */
export const judgeWarm: Judge = (k) => WARM_KINDS.includes(k);
/** Judged bands: pass = hit share ≥ 70%. Others: pass null (stubbed here; EXPECTED_HOOKS is checked instead). */
export function checkBands(runs: ForcedRun[], judged: Judge = judge04): BandCheck[] {
  const out: BandCheck[] = [];
  for (const m of MAJORS) {
    const rs = runs.filter((r) => r.kind === m.kind);
    for (const b of m.calibration) {
      const hits = rs.filter((r) => bandHit(b, metricOf(r.trace, b.metric))).length;
      out.push({ kind: m.kind, metric: b.metric, measuredBy: b.measuredBy, hits, runs: rs.length, pass: judged(m.kind, b) ? rs.length > 0 && hits >= CRISIS_PASS_SHARE * rs.length : null });
    }
  }
  return out;
}
export const KINDS_04_BANDS: readonly CrisisKind[] = MAJORS.filter((m) => m.calibration.some((b) => judge04(m.kind, b))).map((m) => m.kind);

type H = { owner: HookCall['owner']; hook: string; args: HookCall['args'] };
const h = (owner: HookCall['owner'], hook: string, args: HookCall['args']): H => ({ owner, hook, args });
/** 04 §3.16.4 hook calls per kind (precursor then trigger; WIRE_ITEM excluded) at severity 1 on the event bloc `b`; BANKING_PANIC banks and the
 *  CRYPTO_WINTER venue come from 07/06 (stubs: [] and 'WEAKEST'); HOUSING_CRASH pct −20% to −35% at the midpoint severity scaling U(1) = 0.5. */
export function expectedHooks(kind: CrisisKind, b: BlocId): H[] {
  switch (kind) {
    case 'EQUITY_BUBBLE_BURST': return [h('06', 'erpShock', { bloc: b, sector: null, deltaPremium: -0.003, halfLifeDays: null }), h('06', 'erpShock', { bloc: b, sector: null, deltaPremium: 0.025, halfLifeDays: 120 })];
    case 'CREDIT_CRUNCH': return [h('07', 'corporatePdMultiplier', { bloc: b, mult: 1.2, days: 8 }), h('07', 'corporatePdMultiplier', { bloc: b, mult: 3, days: 120 }),
      h('07', 'ltvTighten', { bloc: b, delta: -0.2 }), h('10', 'ltvTighten', { bloc: b, delta: -0.2 })];
    case 'BANKING_PANIC': return [h('07', 'depositConfidenceShock', { bankIds: [], delta: -0.4 })];
    case 'CRYPTO_WINTER': return [h('06', 'venueCollapse', { venueId: 'WEAKEST' })];
    case 'OIL_SHOCK': return [h('06', 'commoditySupplyShock', { commodityId: 'CRUDE', pct: -0.02, days: 8 }), h('06', 'commoditySupplyShock', { commodityId: 'CRUDE', pct: -0.08, days: 120 }),
      h('06', 'commoditySupplyShock', { commodityId: 'GAS', pct: -0.05, days: 120 })];
    case 'SOVEREIGN_DEBT_CRISIS': return [h('16', 'politicalStabilityShock', { bloc: b, delta: -0.1, days: 8 }), h('16', 'politicalStabilityShock', { bloc: b, delta: -0.3, days: 63 })];
    case 'AI_BUBBLE': return [h('11', 'aiRaceIndexShock', { delta: -30 })];
    case 'FLASH_CRASH': return [h('05', 'makerWithdrawal', { assetFilter: 'ALL', depthMult: 0.9, ticks: 5760 }), h('05', 'makerWithdrawal', { assetFilter: 'GX', depthMult: 0.2, ticks: 30 }),
      h('05', 'npcSellProgram', { assetFilter: 'GX', advPerTick: 0.03, ticks: 20 })];
    case 'HOUSING_CRASH': return [h('10', 'housePriceShock', { cityIds: [`bloc:${b}`], pct: -0.275, days: 180 }), h('10', 'transactionFreeze', { cityIds: [`bloc:${b}`], level: 0.5, days: 180 })];
    case 'STAGFLATION': return [h('06', 'commoditySupplyShock', { commodityId: 'CRUDE', pct: -0.03, days: 90 })];
    case 'SECURITIZATION_CRISIS': return [h('08', 'correlationShock', { poolKind: 'MORTGAGE', delta: 0.2 }), h('08', 'pdShock', { poolKind: 'MORTGAGE', mult: 2, days: 180 }),
      h('07', 'repoHaircutShock', { assetKind: 'ABS', deltaPts: 15, days: 120 })];
    case 'FUNDING_RUN': return [h('07', 'repoHaircutShock', { assetKind: 'ALL', deltaPts: 10, days: 60 })];
    case 'CURRENCY_CRISIS': case 'TRADE_WAR': case 'CYBER_PANDEMIC': return [];   // 04 shocks only; CYBER_PANDEMIC is emergent-only (no trigger shocks)
  }
}
