// T04-10: the five fiscal rules (04 §3.9.3) and the NKR sovereign wealth fund step. Checks run on trading days 1 and 131 of the game year;
// FLEXIBLE stimulus and the NKR SWF-funded programs run once per CONTRACTION declaration (the declaration day close).
import { GAME_DAYS_PER_GAME_YEAR, TICKS_PER_GAME_DAY, fromMoney, toMoney, type PhaseCtx, type StoreRead, type Tick } from '@tycoon/engine-core';
import { govId } from '@tycoon/engine-ledger';
import { BLOC_DEFAULTS } from '../blocs';
import { macroTables, type BlocId, type BlocMacroState, type ConcordFacility, type FiscalProgram, type GlobalMacroState, type PublicMacroView } from '../schema';
import { tradingDayIndexInYear } from './calendar';
import { revenueAnnual, type FiscalDay } from './fiscal';
import { addProgram } from './programs';

const D = TICKS_PER_GAME_DAY, Y = GAME_DAYS_PER_GAME_YEAR;
export type FiscalRuleAction = { kind: FiscalProgram['kind']; sizeGdpPerYear: number; days: number; reason: string } | null;
type RuleIn = { regimeLabel: string; trueRegime: string; debtGdp: number; deficitGdp: number; primaryBalanceGdp: number; outputGap: number; s10: number; fsi: number;
  revenueAboveTrend: number; concordActive: boolean };
/** Reasons that fire on a CONTRACTION declaration day instead of the check days. */
const ON_DECLARATION = ['FLEXIBLE_STIMULUS', 'SWF_DRAW'];
const CHECK_DAYS = [1, 131], CHECK_PROGRAM_DAYS = 182;
const act = (kind: FiscalProgram['kind'], sizeGdpPerYear: number, days: number, reason: string): FiscalRuleAction => ({ kind, sizeGdpPerYear, days, reason });
const escape = (s: RuleIn): boolean => s.trueRegime === 'CONTRACTION' && s.fsi > 0.5;

/** The rule's actions for the bloc's state (pure). An empty list = nothing to do. */
export function checkFiscalRule(b: BlocId, s: RuleIn): FiscalRuleAction[] {
  const r = BLOC_DEFAULTS[b].fiscalRule, out: FiscalRuleAction[] = [];
  switch (r.kind) {
    case 'FLEXIBLE':
      if (s.regimeLabel === 'CONTRACTION') out.push(act('INFRASTRUCTURE', 0.0075, Y, 'FLEXIBLE_STIMULUS'), act('HOUSEHOLD_TRANSFER', 0.0075, Y, 'FLEXIBLE_STIMULUS'));
      if (s.debtGdp > 1.30 && s.s10 > 0.015) out.push(act('AUSTERITY', 0.005, CHECK_PROGRAM_DAYS, 'FLEXIBLE_DEBT'));
      break;
    case 'DEFICIT_CAP':
      if (s.deficitGdp > r.cap) out.push(escape(s) ? act('INFRASTRUCTURE', 0.01, CHECK_PROGRAM_DAYS, 'DEFICIT_CAP_ESCAPE') : act('AUSTERITY', 0.005, CHECK_PROGRAM_DAYS, 'DEFICIT_CAP'));
      break;
    case 'BALANCED_CYCLE': {
      if (s.regimeLabel === 'CONTRACTION') { out.push(act('INDUSTRIAL_SUBSIDY', 0.01, CHECK_PROGRAM_DAYS, 'BALANCED_CYCLE_CONTRACTION')); break; }
      const cab = s.primaryBalanceGdp - 0.4 * s.outputGap;
      if (cab < -r.tolerance) out.push(act('AUSTERITY', Math.min(0.01, -r.tolerance - cab), CHECK_PROGRAM_DAYS, 'BALANCED_CYCLE'));
      else if (cab > r.tolerance) out.push(act('HOUSEHOLD_TRANSFER', Math.min(0.01, cab - r.tolerance), CHECK_PROGRAM_DAYS, 'BALANCED_CYCLE'));
      break;
    }
    case 'SURPLUS_SWF':
      if (s.regimeLabel === 'CONTRACTION') out.push(act('GREEN_ENERGY', 0.005, Y, 'SWF_DRAW'), act('HOUSEHOLD_TRANSFER', 0.005, Y, 'SWF_DRAW'));
      break;
    case 'PROCYCLICAL':
      if (s.concordActive) break;   // T04-14's conditionality replaces the rule
      if ((s.regimeLabel === 'EXPANSION' || s.regimeLabel === 'OVERHEATING') && s.revenueAboveTrend > 0)
        out.push(act('HOUSEHOLD_TRANSFER', r.boomSpendShare * s.revenueAboveTrend, CHECK_PROGRAM_DAYS, 'PROCYCLICAL_BOOM'));
      else if (s.regimeLabel === 'CONTRACTION' && s.s10 > 0.05) out.push(act('AUSTERITY', 0.015, CHECK_PROGRAM_DAYS, 'PROCYCLICAL_FORCED'));
      break;
  }
  return out;
}
/** §6.8: would a proposed program breach the bloc's rule? AUSTERITY never does. */
export function wouldBreach(b: BlocId, prog: FiscalProgram, s: RuleIn): boolean {
  if (prog.kind === 'AUSTERITY') return false;
  const r = BLOC_DEFAULTS[b].fiscalRule, size = prog.sizeGdpPerYear;
  switch (r.kind) {
    case 'FLEXIBLE': return s.debtGdp > 1.30 && s.s10 > 0.015;
    case 'DEFICIT_CAP': return s.deficitGdp + size > r.cap && !escape(s);
    case 'BALANCED_CYCLE': { const cab = s.primaryBalanceGdp - size - 0.4 * s.outputGap; return cab < -r.tolerance || cab > r.tolerance; }
    case 'SURPLUS_SWF': return s.primaryBalanceGdp - size < r.targetSurplus;
    case 'PROCYCLICAL': return s.concordActive;
  }
}
/** Extra export (card decision): the rule inputs from the store. revenueAboveTrend = (revenue − revBase·trend GDP)/GDP with
 *  trend GDP = GDP·potentialGdpIndex/realGdpIndex. */
export function ruleInputs(store: StoreRead, b: BlocId, tick: Tick, revBase: number, revenueNow: number): RuleIn | null {
  const st = store.get<BlocMacroState & { id: BlocId }>(macroTables.bloc.name, b);
  if (!st) return null;
  const pv = store.get<PublicMacroView & { id: BlocId }>(macroTables.publicView.name, b), gl = store.get<GlobalMacroState & { id: 'GLOBAL' }>(macroTables.global.name, 'GLOBAL');
  const csf = store.get<ConcordFacility>(macroTables.csf.name, 'npc_CSF'), g = fromMoney(st.nominalGdp);
  const trend = st.realGdpIndex > 0 ? (g * st.potentialGdpIndex) / st.realGdpIndex : g;
  return { regimeLabel: pv?.cycleLabel ?? 'UNDETERMINED', trueRegime: st.regime, debtGdp: st.fiscal.debtGdp, deficitGdp: st.fiscal.deficitGdp,
    primaryBalanceGdp: st.fiscal.primaryBalanceGdp, outputGap: st.outputGap, s10: st.sovereign.spread10y, fsi: gl?.financialStressIndex ?? 0,
    revenueAboveTrend: g > 0 ? (revenueNow - revBase * trend) / g : 0,
    concordActive: (csf?.programs ?? []).some((p) => p.bloc === b && p.startTick <= tick && tick < p.endTick) };
}
function inputsOf(ctx: PhaseCtx, b: BlocId): { s: RuleIn; gdp: number } | null {
  const st = ctx.store.get<BlocMacroState & { id: BlocId }>(macroTables.bloc.name, b);
  const gl = ctx.store.get<GlobalMacroState & { id: 'GLOBAL' }>(macroTables.global.name, 'GLOBAL');
  if (!st) return null;
  const g = fromMoney(st.nominalGdp), rb = ctx.params.num(`macro_rev_base_${b.toLowerCase()}`);
  const s = ruleInputs(ctx.store, b, ctx.tick, rb, revenueAnnual(b, g, st.outputGap, gl?.energyIndex ?? 100, ctx.params));
  return s ? { s, gdp: g } : null;
}
/** Day close: on trading days 1 and 131 of the game year the check-day actions; on the CONTRACTION declaration day the stimulus actions. */
export function runFiscalRuleChecks(ctx: PhaseCtx, b: BlocId): void {
  const day = Math.floor(ctx.tick / D), x = inputsOf(ctx, b);
  if (!x) return;
  const pv = ctx.store.get<PublicMacroView & { id: BlocId }>(macroTables.publicView.name, b);
  const declared = pv?.cycleLabel === 'CONTRACTION' && pv.cycleLabelSinceDay === day;
  const idx = tradingDayIndexInYear(b, day), check = idx !== null && CHECK_DAYS.includes(idx);
  if (!declared && !check) return;
  let k = 0;
  for (const a of checkFiscalRule(b, x.s)) {
    if (!a || (ON_DECLARATION.includes(a.reason) ? !declared : !check)) continue;
    const size = a.sizeGdpPerYear;
    addProgram(ctx, { id: `fp_${b}_${ctx.tick}_${k++}`, bloc: b, kind: a.kind, sizeGdpPerYear: size, sectorDemand: {},
      budget: toMoney((Math.abs(size) * x.gdp * a.days) / Y, b), spent: 0n, startTick: ctx.tick, endTick: ctx.tick + a.days * D,
      source: 'AUTOMATIC', sponsorActorIds: [] }, false);
  }
}
/** NKR daily: primary surplus above +2% goes to the SWF ((pb − 0.02)·GDP·Δ); under a CONTRACTION label the SWF pays back up to 1% GDP a year.
 *  swfAssets mirrors the SWF's cash after today's transfer. Other blocs: nothing. */
export function swfStep(ctx: PhaseCtx, day: FiscalDay): void {
  const b: BlocId = 'NKR', r = BLOC_DEFAULTS[b].fiscalRule;
  if (r.kind !== 'SURPLUS_SWF') return;
  const st = ctx.store.get<BlocMacroState & { id: BlocId }>(macroTables.bloc.name, b);
  if (!st) return;
  const pv = ctx.store.get<PublicMacroView & { id: BlocId }>(macroTables.publicView.name, b);
  const gov = govId(b), swf = ctx.content.swfEntityId(b), g = fromMoney(st.nominalGdp), cash = ctx.ledger.cash(swf, b);
  let net = 0n;
  if (day.primary > r.targetSurplus) {
    const amt = toMoney(((day.primary - r.targetSurplus) * g) / Y, b);
    if (amt > 0n) { ctx.ledger.pay(gov, swf, amt, b, 'SWF_TRANSFER'); net += amt; }
  } else if (pv?.cycleLabel === 'CONTRACTION') {
    let amt = toMoney((0.01 * g) / Y, b);
    if (amt > cash) amt = cash;
    if (amt > 0n) { ctx.ledger.pay(swf, gov, amt, b, 'SWF_TRANSFER'); net -= amt; }
  }
  ctx.store.put(macroTables.bloc.name, { ...st, fiscal: { ...st.fiscal, swfAssets: cash + net } });
}
