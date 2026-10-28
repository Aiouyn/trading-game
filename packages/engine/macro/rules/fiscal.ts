// T04-10: fiscal policy (04 §3.9.1, §3.9.2, §3.9.6). Revenue with the cycle and commodity prices, spending with automatic stabilizers,
// programs and interest, the daily step of the debt path, the fiscal impulse, the day-close elastic cash and the quarter event.
// Flows are floats in local currency units per game year; FiscalDay's revenue, spending and interest are the day's amounts (annual × 1/364).
import { GAME_DAYS_PER_GAME_YEAR, TICKS_PER_GAME_DAY, toMoney, fromMoney, type Money, type ParamsView, type PhaseCtx, type Tick } from '@tycoon/engine-core';
import { frmId, govId, hhId } from '@tycoon/engine-ledger';
import { BLOC_DEFAULTS } from '../blocs';
import { macroTables, type BlocId, type BlocMacroState, type FiscalProgram, type FiscalState } from '../schema';
import { quarterStartDay } from './calendar';

const DT = 1 / GAME_DAYS_PER_GAME_YEAR;
const COMMODITY_TAKE = 0.06, CYCLE_ELASTICITY = 1.2, STAB_COEF = 0.4, HH_TAX_SHARE = 0.6, HH_SPEND_SHARE = 0.5;
const isActive = (p: FiscalProgram, tick: Tick): boolean => p.startTick <= tick && tick < p.endTick;

/** §3.9.1 revBase·GDP·(1 + 1.2x) + commodity revenue; revBase from `macro_rev_base_<bloc>`. */
export function revenueAnnual(b: BlocId, nominalGdp: number, x: number, energyIndex: number, p: ParamsView): number {
  return p.num(`macro_rev_base_${b.toLowerCase()}`) * nominalGdp * (1 + CYCLE_ELASTICITY * x) + commodityRevenue(b, nominalGdp, energyIndex);
}
/** GDP·max(0, commodityExporter)·0.06·E/100 (only NKR and SRL export). */
export function commodityRevenue(b: BlocId, nominalGdp: number, energyIndex: number): number {
  const e = BLOC_DEFAULTS[b].commodityExporter;
  return e > 0 ? nominalGdp * e * COMMODITY_TAKE * (energyIndex / 100) : 0;
}
/** revBase − primaryBalance0, so genesis reproduces §2.2's primary balance. */
export function spendBase(b: BlocId, p: ParamsView): number {
  return p.num(`macro_rev_base_${b.toLowerCase()}`) - BLOC_DEFAULTS[b].initialPrimaryBalanceGdp;
}
export function autoStabilizers(u: number, nairu: number, nominalGdp: number): number {
  return u > nairu ? STAB_COEF * (u - nairu) * nominalGdp : 0;
}
/** Σ coupon·face + bill discount accretion (face·discount yield). */
export function interestAnnual(lines: { couponRate: number; faceOutstanding: number; bill: boolean; discountYield?: number }[]): number {
  let s = 0;
  for (const l of lines) s += l.faceOutstanding * (l.bill ? (l.discountYield ?? 0) : l.couponRate);
  return s;
}
/** Σ sizeGdpPerYear·GDP over active programs; AUSTERITY enters negative; TAX_CUT is not spending (it lowers revenue). */
export function programSpendAnnual(programs: FiscalProgram[], nominalGdp: number, tick: Tick): number {
  let s = 0;
  for (const p of programs) {
    if (!isActive(p, tick) || p.kind === 'TAX_CUT') continue;
    s += (p.kind === 'AUSTERITY' ? -1 : 1) * Math.abs(p.sizeGdpPerYear) * nominalGdp;
  }
  return s;
}
function taxCutAnnual(programs: FiscalProgram[], nominalGdp: number, tick: Tick): number {
  let s = 0;
  for (const p of programs) if (isActive(p, tick) && p.kind === 'TAX_CUT') s += p.sizeGdpPerYear * nominalGdp;
  return s;
}
export interface FiscalDay { revenue: number; spending: number; interest: number; primary: number; deficit: number; debt: Money; debtGdp: number; averageCoupon: number; averageMaturityYears: number }
/** §3.9.6 one day close. primary = revenue − (spending − interest), deficit = −(primary − interest) (both / GDP, annual basis);
 *  debt ← debt + (spending − revenue)·Δ (toMoney half-even); debtGdp = (debt + fxDebt/spot)/GDP. */
export function stepFiscalDay(prev: FiscalState, x: { b: BlocId; nominalGdp: number; outputGap: number; u: number; nairu: number; energyIndex: number;
  lines: Parameters<typeof interestAnnual>[0] & { maturityYears: number }[]; spotVsFdl: number; tick: Tick }, p: ParamsView): FiscalDay {
  const g = x.nominalGdp, ccy = x.b;
  const revenue = revenueAnnual(x.b, g, x.outputGap, x.energyIndex, p) - taxCutAnnual(prev.programs, g, x.tick);
  const interest = interestAnnual(x.lines);
  const spending = spendBase(x.b, p) * g + autoStabilizers(x.u, x.nairu, g) + programSpendAnnual(prev.programs, g, x.tick) + interest;
  const primary = revenue - (spending - interest), deficit = -(primary - interest);
  const debt = prev.debt + toMoney((spending - revenue) * DT, ccy);
  const debtGdp = g > 0 ? (fromMoney(debt) + fromMoney(prev.fxDebt) / x.spotVsFdl) / g : 0;
  let face = 0, cw = 0, mw = 0;
  for (const l of x.lines) { face += l.faceOutstanding; cw += l.faceOutstanding * (l.bill ? (l.discountYield ?? 0) : l.couponRate); mw += l.faceOutstanding * l.maturityYears; }
  return { revenue: revenue * DT, spending: spending * DT, interest: interest * DT, primary: g > 0 ? primary / g : 0, deficit: g > 0 ? deficit / g : 0, debt, debtGdp,
    averageCoupon: face > 0 ? cw / face : BLOC_DEFAULTS[x.b].initialPolicyRate, averageMaturityYears: face > 0 ? mw / face : 5 };
}
/** deficitPrimary_t − mean364 (share of GDP, + expansionary). */
export function fiscalImpulse(deficitPrimaryToday: number, mean364: number): number { return deficitPrimaryToday - mean364; }

/** Split `amt` over the bloc's cities in slot order, equal shares, the rounding remainder on the last city. */
function hhLegs(ctx: PhaseCtx, b: BlocId, amt: Money): { id: string; amt: Money }[] {
  const cities = ctx.content.cities().filter((c) => c.bloc === b).map((c) => ({ id: c.cityId, slot: c.slot })).sort((a, c) => a.slot - c.slot);
  const n = BigInt(cities.length), out: { id: string; amt: Money }[] = [];
  let left = amt;
  cities.forEach((c, i) => { const a = i === cities.length - 1 ? left : amt / n; left -= a; out.push({ id: hhId(c.id), amt: a }); });
  return out;
}
/** §3.9.6/§3.18 day close: revenue elastic in (0.6 hh, 0.4 frm); non-interest spending elastic out (HOUSEHOLD_TRANSFER and automatic
 *  stabilizers to hh, the rest 0.5 hh / 0.5 frm). Interest is not posted here (06 pays coupons from the treasury). */
export function postFiscalCash(ctx: PhaseCtx, b: BlocId, day: FiscalDay): void {
  const gov = govId(b), ccy = b, L = ctx.ledger;
  const rev = toMoney(day.revenue, ccy);
  if (rev > 0n) {
    const hh = toMoney(day.revenue * HH_TAX_SHARE, ccy);
    for (const l of hhLegs(ctx, b, hh)) if (l.amt > 0n) L.elasticIn(l.id, gov, l.amt, ccy, 'MAC_TAX_FROM_ELASTIC');
    if (rev - hh > 0n) L.elasticIn(frmId(b), gov, rev - hh, ccy, 'MAC_TAX_FROM_ELASTIC');
  }
  const nonInterest = day.spending - day.interest;
  if (nonInterest <= 0) return;
  const st = ctx.store.get<BlocMacroState & { id: BlocId }>(macroTables.bloc.name, b);
  let hhOnly = 0;
  if (st) {
    const g = fromMoney(st.nominalGdp);
    hhOnly = autoStabilizers(st.unemployment, BLOC_DEFAULTS[b].nairu, g);
    for (const p of st.fiscal.programs) if (p.kind === 'HOUSEHOLD_TRANSFER' && isActive(p, ctx.tick)) hhOnly += p.sizeGdpPerYear * g;
    hhOnly = Math.min(hhOnly * DT, nonInterest);
  }
  const total = toMoney(nonInterest, ccy), hh = toMoney(hhOnly + (nonInterest - hhOnly) * HH_SPEND_SHARE, ccy);
  for (const l of hhLegs(ctx, b, hh)) if (l.amt > 0n) L.elasticOut(gov, l.id, l.amt, ccy, 'MAC_GOV_SPENDING_ELASTIC');
  if (total - hh > 0n) L.elasticOut(gov, frmId(b), total - hh, ccy, 'MAC_GOV_SPENDING_ELASTIC');
}
/** Quarter close: macro.fiscal.quarter (PUBLIC) with the bloc's current deficit, primary balance and debt ratios. */
export function quarterFiscalEvent(ctx: PhaseCtx, b: BlocId): void {
  const st = ctx.store.get<BlocMacroState & { id: BlocId }>(macroTables.bloc.name, b);
  if (!st) return;
  const day = Math.floor(ctx.tick / TICKS_PER_GAME_DAY), f = st.fiscal;
  ctx.emit('macro.fiscal.quarter', [govId(b)], { bloc: b, quarter: quarterStartDay(day) / 91, deficitGdp: f.deficitGdp, primaryBalanceGdp: f.primaryBalanceGdp,
    debtGdp: f.debtGdp }, 'PUBLIC');
}
