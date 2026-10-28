// T04-20 step 3: the macro day step (04 §3.1 row 3) at t = 719, in the card's fixed order. Global first, then blocs in BLOC_ORDER (§3.19).
import { dmath, fromMoney, TICKS_PER_GAME_DAY, type Id, type Money, type PhaseCtx } from '@tycoon/engine-core';
import { cbkId, govId } from '@tycoon/engine-ledger';
import { BLOC_DEFAULTS } from '../blocs';
import type { MacroPorts } from '../ports';
import { BLOC_ORDER, macroTables, type BlocId, type BlocMacroState, type CentralBank, type CurveState, type GlobalMacroState, type ImbalanceKey,
  type MacroInputs, type PublicMacroView, type Regime, type WorldEvent } from '../schema';
import { S } from '../streams';
import { collectInputs } from '../rules/inputs';
import { scaleTarget, stepScale, nominalGdpLocal } from '../rules/scale';
import { dailyTrade } from '../rules/trade';
import { nominalGdpFdl, spotOfStore } from '../rules/fxReserves';
import { applyCoupling, regimeParams, stepRegime, transitionMultipliers } from '../rules/regime';
import { cycleLabelStep } from '../rules/cycleCommittee';
import { globalZ, imbalanceZ, nextInversionDays } from '../rules/imbalance';
import { gapTerms, gdpGrowthQoQAnn, outputGapTarget, potentialGrowth, smoothRealRateGap, stepLevels, stepNeutralRate, stepOutputGap, stepUnemployment,
  stepWageIndex, wageGrowth } from '../rules/economy';
import { stepOutputGapEstimate } from '../gapest';
import { coreTarget, effectiveDepreciation, effectiveFxLn, headlineLevel, headlineYoy, stepCore, stepCoreLevel, stepExpectations } from '../rules/inflation';
import { creditAggregates } from '../rules/credit';
import { fiscalImpulse, postFiscalCash, quarterFiscalEvent, stepFiscalDay, type FiscalDay } from '../rules/fiscal';
import { runFiscalRuleChecks, swfStep } from '../rules/fiscalRules';
import { acceptProposals, handleProgramSpend } from '../rules/programs';
import { quarterEndDealerReview } from '../rules/dealers';
import { igExclusionCheck, stepSovereignCredit } from '../rules/sovCredit';
import { checkDefaultTriggers, stepDefaultCase } from '../rules/default';
import { stepFxDay } from '../rules/fxRegimes';
import { stepCapitalControls } from '../rules/capitalControls';
import { concordTranches } from '../rules/concord';
import { swapLineStep } from '../rules/swapLines';
import { recomputeCurve } from '../rules/curves';
import { macroprudentialRelease } from '../rules/macroprudential';
import { stepPhases } from '../rules/phases';
import { emergentCheck } from '../rules/emergent';
import { schedulerDay } from '../rules/scheduler';
import { emergencyTriggers, scheduleEmergency } from '../rules/cb';
import { activeShockSum } from '../rules/shocks';
import { nsZero } from '../rules/nelsonSiegel';
import { refreshPublicView } from '../views/publicView';
import { publishMsi } from '../views/stabReport';
import { credit364Of, historyAt, pruneHistory, trailingMean, writeHistoryRows } from './history';

const D = TICKS_PER_GAME_DAY, DT = 1 / 364;
type BlocRow = BlocMacroState & { id: BlocId };
type GlobalRow = GlobalMacroState & { id: 'GLOBAL' };
const blocOf = (ctx: PhaseCtx, b: BlocId): BlocRow => ctx.store.get<BlocRow>(macroTables.bloc.name, b)!;
const globalOf = (ctx: PhaseCtx): GlobalRow => ctx.store.get<GlobalRow>(macroTables.global.name, 'GLOBAL')!;
const cbOf = (ctx: PhaseCtx, b: BlocId): CentralBank => ctx.store.get<CentralBank>(macroTables.cb.name, cbkId(b))!;
const curveOf = (ctx: PhaseCtx, b: BlocId): CurveState | undefined => ctx.store.get<CurveState>(macroTables.curve.name, b);
const ratio = (now: number | null, then: number | null): number | null => (now === null || then === null || then === 0 ? null : now / then);

/** §3.3 step 3 (open point 4): 1820-day running mean; a missing aggregate leaves peNorm unchanged. */
export function updatePeNorm(peNorm: number, peAgg: number | null): number {
  return peAgg === null ? peNorm : peNorm + (peAgg - peNorm) / 1820;
}

/** Step 3.1: collect inputs (edge 23 holds), union of today's and HOURLY stale keys → one SEALED macro.input.stale; HOURLY.staleKeys cleared (E-93 (2)). */
export function inputSnapshot(ctx: PhaseCtx, ports: MacroPorts): MacroInputs {
  const s = ctx.store, prev = s.get<MacroInputs>(macroTables.inputs.name, 'INPUTS') ?? { id: 'INPUTS', tick: 0, staleKeys: [], values: {} };
  const { inputs, stale } = collectInputs(s, ports, prev, ctx.tick);
  const hourly = s.get<MacroInputs>(macroTables.inputs.name, 'HOURLY');
  const keys: string[] = [];
  for (const k of [...stale, ...(hourly?.staleKeys ?? [])]) if (!keys.includes(k)) keys.push(k);
  keys.sort((a, c) => (a < c ? -1 : a > c ? 1 : 0));
  s.put(macroTables.inputs.name, inputs);
  if (keys.length > 0) ctx.emit('macro.input.stale', [] as Id[], { keys }, 'SEALED');
  if (hourly) s.put(macroTables.inputs.name, { ...hourly, staleKeys: [] });
  return inputs;
}

function gdpWeights(ctx: PhaseCtx): Record<BlocId, number> {
  const w = {} as Record<BlocId, number>;
  let tot = 0;
  for (const b of BLOC_ORDER) { w[b] = fromMoney(nominalGdpFdl(ctx.store, b)); tot += w[b]; }
  for (const b of BLOC_ORDER) w[b] = tot > 0 ? w[b] / tot : BLOC_DEFAULTS[b].gdpShare0;
  return w;
}

/** Step 3.2: scale, trade, energy/food, world nominal GDP. MISSING EXPORT: T22 players.activityWeighted → N_a = 0. */
function globalIndicators(ctx: PhaseCtx, ports: MacroPorts, inp: MacroInputs): void {
  const g = globalOf(ctx), S0 = stepScale(g.worldScale, scaleTarget(0, ctx.params));
  ctx.store.put<GlobalRow>(macroTables.global.name, { ...g, tick: ctx.tick, worldScale: S0, energyIndex: inp.values.energy ?? g.energyIndex, foodIndex: inp.values.food ?? g.foodIndex,
    aiRaceIndex: inp.values.aiRaceIndex ?? g.aiRaceIndex, worldHackRate: inp.values.worldHackRate ?? g.worldHackRate, geopoliticalTension: inp.values.geopoliticalTension ?? g.geopoliticalTension });
  dailyTrade(ctx, ports);
}

function imbalanceInputs(ctx: PhaseCtx, b: BlocId, bl: BlocRow, g: GlobalRow, peAgg: number | null, day: number, w: Record<BlocId, number>): Parameters<typeof imbalanceZ>[0] {
  const s = ctx.store, d = BLOC_DEFAULTS[b], c = curveOf(ctx, b), e63 = historyAt(s, 'GLOBAL', day - 63)?.energyIndex ?? g.energyIndex, e182 = historyAt(s, 'GLOBAL', day - 182)?.energyIndex ?? g.energyIndex;
  let con = 0;
  for (const o of BLOC_ORDER) if (o !== b && blocOf(ctx, o).regime === 'CONTRACTION') con += w[o];
  return { creditGap: bl.creditGap, peAgg, peNorm: bl.peNorm, y10: c ? nsZero(c.ns, 10) : 0, y3m: c ? nsZero(c.ns, 0.25) : 0, inversionDays: c?.inversionDays ?? 0,
    coreInflation: bl.coreInflation, inflationTarget: d.inflationTarget, housePriceGap: bl.housePriceGap, energyIndexNow: g.energyIndex, energyIndex63: e63,
    commodityExporter: d.commodityExporter, sovereignStress: bl.sovereign.stressIndex, fear: g.fearIndex, otherBlocsContractionGdpShare: con,
    realRateGapSmoothed: bl.realRateGapSmoothed, outputGap: bl.outputGap, wtiNow: g.energyIndex, wti182: e182, fiscalImpulse: bl.fiscalImpulse };
}

/** Step 3.3: inversion days, peNorm, imbalance z, global regime then blocs, cycle label. */
function regimes(ctx: PhaseCtx, ports: MacroPorts, day: number): void {
  const s = ctx.store, rp = regimeParams(ctx.params), w = gdpWeights(ctx), z = {} as Record<BlocId, Record<ImbalanceKey, number>>, trading = ctx.cal.isTradingDay;
  for (const b of BLOC_ORDER) {
    const c = curveOf(ctx, b);
    if (c) s.put(macroTables.curve.name, { ...c, inversionDays: nextInversionDays(c.inversionDays, nsZero(c.ns, 10), nsZero(c.ns, 0.25), trading) });
    const bl = blocOf(ctx, b), peAgg = ports.markets.peAggregate(s, b), next = { ...bl, peNorm: updatePeNorm(bl.peNorm, peAgg) };
    s.put(macroTables.bloc.name, next);
    z[b] = imbalanceZ(imbalanceInputs(ctx, b, next, globalOf(ctx), peAgg, day, w));
    s.put(macroTables.bloc.name, { ...next, imbalance: z[b] });
  }
  const g = globalOf(ctx), gz = globalZ(z, w), from: Regime = g.globalRegime;
  const gs = stepRegime(ctx.rng(S.globalRegime()), from, Math.floor((ctx.tick - g.globalRegimeSinceTick) / D), transitionMultipliers(from, gz), rp);
  const gReg = gs.next;
  s.put<GlobalRow>(macroTables.global.name, { ...g, globalRegime: gReg, globalRegimeSinceTick: gs.transitioned ? ctx.tick : g.globalRegimeSinceTick });
  for (const b of BLOC_ORDER) {
    const bl = blocOf(ctx, b), d = BLOC_DEFAULTS[b];
    const m = applyCoupling(bl.regime, transitionMultipliers(bl.regime, z[b]), gReg, d.cycleCoupling);
    const r = stepRegime(ctx.rng(S.regime(b)), bl.regime, Math.floor((ctx.tick - bl.regimeSinceTick) / D), m, rp);
    const since = r.transitioned ? ctx.tick : bl.regimeSinceTick;
    s.put(macroTables.bloc.name, { ...bl, regime: r.next, regimeSinceTick: since });
    const v = s.get<PublicMacroView & { id: BlocId }>(macroTables.publicView.name, b);
    if (!v) continue;
    const cur = (v.cycleLabel ?? 'UNDETERMINED') as Regime | 'UNDETERMINED';
    const lab = cycleLabelStep(r.next, Math.floor((ctx.tick - since) / D), cur, v.prints, bl.unemployment12mLow, d.nairu, d.inflationTarget, ctx.params.num('macro_cycle_label_lag_days'));
    if (lab.changed) {
      s.put(macroTables.publicView.name, { ...v, cycleLabel: lab.label, cycleLabelSinceDay: day });
      ctx.emit('macro.cycle.declared', [cbkId(b)], { bloc: b, cycleLabel: lab.label, sinceDay: day }, 'PUBLIC');
    }
  }
}

/** Steps 3.4–3.5 for one bloc: real side (draws 1 gap, 2 r*), inflation (draw 3), credit. Returns the interbank spread for step 3.11. */
function realAndPrices(ctx: PhaseCtx, ports: MacroPorts, b: BlocId, day: number, w: Record<BlocId, number>, effLn: number): number | null {
  const s = ctx.store, p = ctx.params, bl = blocOf(ctx, b), g = globalOf(ctx), d = BLOC_DEFAULTS[b], cb = cbOf(ctx, b), tick = ctx.tick, rng = ctx.rng(S.shock(b));
  // E-104 (1): pi_e1_add (bloc and WORLD) and credit_conditions_add (bloc) are added where these are read, never into the state
  // (stepExpectations below steps the stored π_e1 and the stored creditConditions comes from creditAggregates).
  const piE1 = bl.inflationExp1y + activeShockSum(s, 'pi_e1_add', b, tick) + activeShockSum(s, 'pi_e1_add', 'WORLD', tick);
  const creditConditions = bl.creditConditions + activeShockSum(s, 'credit_conditions_add', b, tick);
  const Rt = smoothRealRateGap(bl.realRateGapSmoothed, cb.policyRate, piE1, bl.rStar, p);
  let xOthers = 0, wo = 0;
  for (const o of BLOC_ORDER) if (o !== b) { xOthers += w[o] * blocOf(ctx, o).outputGap; wo += w[o]; }
  const e364 = historyAt(s, 'GLOBAL', day - 364)?.energyIndex ?? null, eqNow = ports.markets.equityIndexLevel(s, b);
  const terms = gapTerms({ i: cb.policyRate, piE1, rStar: bl.rStar, regime: bl.regime, fiscalImpulse: bl.fiscalImpulse, sovStress: bl.sovereign.stressIndex,
    atElb: cb.policyRate <= d.elb, creditConditions, openness: d.openness, xOthers: wo > 0 ? xOthers / wo : 0, realFxGap: bl.fx.realExchangeGap,
    energyYoyLn: e364 === null ? 0 : dmath.ln(g.energyIndex / e364), commodityExporter: d.commodityExporter, fear: g.fearIndex, eqIndex: eqNow,
    eqMean364: trailingMean(s, b, day, 364, null, (r) => r.equityIndex), housePriceGap: ports.housing.housePriceGap(s, b) ?? bl.housePriceGap,
    wtiNow: g.energyIndex, wtiMean364: trailingMean(s, 'GLOBAL', day, 364, g.energyIndex, (r) => r.energyIndex) ?? g.energyIndex, worldHackRate: g.worldHackRate,
    shockSum: activeShockSum(s, 'x_target', b, tick) + activeShockSum(s, 'x_target', 'WORLD', tick) }, Rt, p);
  const x = stepOutputGap(bl.outputGap, outputGapTarget(terms), rng.normal(), p);
  stepOutputGapEstimate(ctx, b, x); // 3.4, right after stepOutputGap (T04-20 card step 3.4); it writes gapEstNoise, carried into the put below
  const gPot = potentialGrowth(b, g.aiRaceIndex, p), lv = stepLevels({ potentialGdpIndex: bl.potentialGdpIndex, realGdpIndex: bl.realGdpIndex, outputGap: x }, gPot);
  const u = stepUnemployment(bl.unemployment, d.nairu, x), wg = wageGrowth(piE1, gPot, d.laborForceGrowth, u, d.nairu);
  const nr = stepNeutralRate(bl.rStarRw, rng.normal(), b, gPot);
  // inflation (E-87 (2): core → level → headline → e1 → e5)
  const eff364 = historyAt(s, b, day - 364)?.effectiveFx ?? effLn, mean90 = trailingMean(s, b, day, 90, x, (r) => r.outputGap) ?? x;
  const core = stepCore(bl.coreInflation, coreTarget(piE1, mean90, d.fxPassThrough, effectiveDepreciation(effLn, eff364), p), rng.normal());
  const coreLvl = stepCoreLevel(bl.coreCpiLevel, core), spot = spotOfStore(s, b);
  const cpi = headlineLevel(coreLvl, g.energyIndex, g.foodIndex, spot, d.fx0, d.energyWeight, d.foodWeight);
  const cpi364 = historyAt(s, b, day - 364)?.cpiLevel ?? null, headline = cpi364 === null ? core : headlineYoy(cpi, cpi364);
  const ex = stepExpectations(bl.inflationExp1y, bl.inflationExp5y5y, headline, d.inflationTarget, cb.credibility);
  const gdp = nominalGdpLocal(b, g.worldScale, lv.realGdpIndex, cpi, p), gdpN = fromMoney(gdp), gdpPrev = fromMoney(bl.nominalGdp);
  const ca = creditAggregates(gdpN, { credit: bl.credit, creditGdpTrend: bl.creditGdpTrend, credit364: credit364Of(s, b, day), credit0: bl.credit0, days: day },
    ports.credit?.creditAggregates(s, b) ?? null, { Rtilde: Rt, regime: bl.regime, nominalGdpGrowthLn: gdpPrev > 0 && gdpN > 0 ? dmath.ln(gdpN / gdpPrev) : 0 });
  const real91 = historyAt(s, b, day - 91)?.realGdpIndex ?? null;
  s.put<BlocRow>(macroTables.bloc.name, { ...bl, tick, realRateGapSmoothed: Rt, outputGapTarget: outputGapTarget(terms), outputGap: x, potentialGrowth: gPot,
    potentialGdpIndex: lv.potentialGdpIndex, realGdpIndex: lv.realGdpIndex, gdpGrowthQoQAnn: real91 === null ? bl.gdpGrowthQoQAnn : gdpGrowthQoQAnn(lv.realGdpIndex, real91),
    unemployment: u, unemployment12mLow: bl.unemployment12mLow === null ? u : Math.min(u, bl.unemployment12mLow) /* no u history column: running low */, wageGrowth: wg, wageIndex: stepWageIndex(wg, bl.wageIndex),
    rStarRw: nr.rw, rStar: nr.rStar, nominalGdp: gdp, coreInflation: core, coreCpiLevel: coreLvl, cpiLevel: cpi, headlineInflation: headline,
    inflationExp1y: ex.piE1, inflationExp5y5y: ex.piE5, housePriceGap: ports.housing.housePriceGap(s, b) ?? bl.housePriceGap,
    credit: ca.credit, creditGdpTrend: ca.trend, creditGap: ca.creditGap, creditGrowth: ca.creditGrowth, creditConditions: ca.creditConditions,
    gapEstNoise: blocOf(ctx, b).gapEstNoise });
  return ca.interbankSpread;
}

/** Step 3.6 for one bloc. */
function fiscalDay(ctx: PhaseCtx, ports: MacroPorts, b: BlocId, day: number): FiscalDay {
  const s = ctx.store, bl = blocOf(ctx, b), g = globalOf(ctx), d = BLOC_DEFAULTS[b], gdp = fromMoney(bl.nominalGdp), tick = ctx.tick;
  const lines = ports.assets.sovereignLines(s, govId(b)).map((l) => ({ couponRate: l.couponRate, faceOutstanding: Number(l.faceOutstanding / 1_000_000n), bill: l.tenor.startsWith('B'),
    maturityYears: Math.max(0, (l.maturityTick - tick) / (364 * D)) }));
  const fd = stepFiscalDay(bl.fiscal, { b, nominalGdp: gdp, outputGap: bl.outputGap, u: bl.unemployment, nairu: d.nairu, energyIndex: g.energyIndex, lines, spotVsFdl: spotOfStore(s, b), tick }, ctx.params);
  const mean = trailingMean(s, b, day, 364, -fd.primary, (r) => r.deficitPrimaryGdp) ?? -fd.primary;
  const ann = (v: number): number => (gdp > 0 ? v / DT / gdp : 0);
  s.put<BlocRow>(macroTables.bloc.name, { ...bl, fiscalImpulse: fiscalImpulse(-fd.primary, mean),
    fiscal: { ...bl.fiscal, revenueGdp: ann(fd.revenue), spendingGdp: ann(fd.spending), interestGdp: ann(fd.interest), primaryBalanceGdp: fd.primary, deficitGdp: fd.deficit,
      debt: fd.debt, debtGdp: fd.debtGdp, averageCoupon: fd.averageCoupon, averageMaturityYears: fd.averageMaturityYears } });
  postFiscalCash(ctx, b, fd);
  return fd;
}

function majorPolicyToday(ctx: PhaseCtx, b: BlocId, day: number): boolean {
  for (const e of ctx.store.iter<WorldEvent>(macroTables.event.name)) if (e.tier === 'MAJOR' && e.phase === 'POLICY' && Math.floor(e.phaseSinceTick / D) === day && e.blocs.includes(b)) return true;
  return false;
}

/** 04 §3.1 row 3, t = 719. Reads state committed through 718 plus 04's own rows. */
export function macroDayStep(ctx: PhaseCtx, ports: MacroPorts): void {
  const s = ctx.store, day = ctx.cal.gameDay, quarterEnd = day % 91 === 90;
  const inp = inputSnapshot(ctx, ports);                                  // 3.1
  globalIndicators(ctx, ports, inp);                                      // 3.2
  regimes(ctx, ports, day);                                               // 3.3
  const w = gdpWeights(ctx), spots = {} as Record<BlocId, number>, ib = {} as Record<BlocId, number | null>;
  for (const b of BLOC_ORDER) spots[b] = spotOfStore(s, b);
  for (const b of BLOC_ORDER) ib[b] = realAndPrices(ctx, ports, b, day, w, effectiveFxLn(b, spots, w));   // 3.4–3.5
  let wn = 0n as Money;
  for (const b of BLOC_ORDER) wn += nominalGdpFdl(s, b);
  s.put<GlobalRow>(macroTables.global.name, { ...globalOf(ctx), worldNominalGdpFdl: wn });
  for (const b of BLOC_ORDER) {                                           // 3.6
    const fd = fiscalDay(ctx, ports, b, day);
    if (b === 'NKR') swfStep(ctx, fd);
    runFiscalRuleChecks(ctx, b);
  }
  handleProgramSpend(ctx);
  for (const b of BLOC_ORDER) acceptProposals(ctx, b, ports);
  if (quarterEnd) for (const b of BLOC_ORDER) { quarterFiscalEvent(ctx, b); quarterEndDealerReview(ctx, b); }
  for (const b of BLOC_ORDER) {                                           // 3.7
    stepSovereignCredit(ctx, b, ports); igExclusionCheck(ctx, b, ports); checkDefaultTriggers(ctx, b, ports); stepDefaultCase(ctx, b, ports);
  }
  stepFxDay(ctx, ports); stepCapitalControls(ctx); concordTranches(ctx); swapLineStep(ctx, ports);   // 3.8
  for (const b of BLOC_ORDER) recomputeCurve(ctx, b, 'DAY_CLOSE');        // 3.9
  for (const b of BLOC_ORDER) macroprudentialRelease(ctx, b);             // 3.10
  stepPhases(ctx, ports); emergentCheck(ctx, ports); schedulerDay(ctx, ports);   // 3.11
  const fsi = globalOf(ctx).financialStressIndex;
  for (const b of BLOC_ORDER) {
    const eq5 = ratio(ports.markets.equityIndexLevel(s, b), historyAt(s, b, day - 5)?.equityIndex ?? null);
    const fx3 = ratio(spotOfStore(s, b), historyAt(s, b, day - 3)?.spotVsFdl ?? null);
    const tr = emergencyTriggers({ fsi, eqDrop5d: eq5 === null ? null : 1 - eq5, interbankSpread: ib[b], fxDrop3d: fx3 === null ? null : 1 - fx3, bloc: b, majorPolicyHere: majorPolicyToday(ctx, b, day) });
    scheduleEmergency(ctx, b, tr, ctx.tick);
  }
  writeHistoryRows(ctx, ports); pruneHistory(ctx, day);                   // 3.13
  for (const b of BLOC_ORDER) refreshPublicView(ctx, b);
  publishMsi(ctx);
}
