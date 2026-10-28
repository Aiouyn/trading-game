// T04-20 step 1 (04 §3.19): macro genesis. E-97: the launch debt split into whole 1,000-face bond units (read by 06 genesis, T06A-01 step 8).
import { dmath, fromMoney, TICKS_PER_GAME_DAY, toMoney, type Money, type ParamsView, type PhaseCtx } from '@tycoon/engine-core';
import { cbkId, govId } from '@tycoon/engine-ledger';
import { BLOC_DEFAULTS } from '../blocs';
import type { MacroPorts } from '../ports';
import { BLOC_ORDER, IMBALANCE_KEYS, macroTables, type BlocId, type BlocMacroState, type CentralBank, type FxState, type GlobalMacroState,
  type ImbalanceKey, type MacroInputs, type PublicMacroView, type StabilizerState } from '../schema';
import { nominalGdpLocal } from '../rules/scale';
import { appointGovernor, coeffsFromHawk } from '../rules/cb';
import { setCorridor } from '../rules/corridor';
import { genesisOutputGapEstimate } from '../gapest';
import { riskAppetite } from '../rules/fear';
import { chapterStart } from '../rules/scheduler';
import { recomputeCurve } from '../rules/curves';
import { refreshPublicView } from '../views/publicView';
import { meetingPlan, writeQuarterSchedule } from '../rules/calendar';
import { planQuarter } from '../rules/issuance';
import { potentialGrowth } from '../rules/economy';
import { liquidityPremium, pdAt, sovSpread, stressIndexOf } from '../rules/sovCredit';
import { nominalGdpFdl } from '../rules/fxReserves';
import { openingReservesFdl } from '../institutions';

const UNIT = 1000000000n;   // one 1,000-face launch bond unit in micro

/** T04-20: genesis nominal GDP = nominalGdpLocal(b, S, 100, 100, p). */
export function genesisNominalGdp(b: BlocId, S: number, p: ParamsView): Money {
  return nominalGdpLocal(b, S, 100, 100, p);
}

/** E-97 (iv): local launch mix, percent of the local part, a genesis constant (Quant's choice, not a param). The remainder line is the largest share. */
export const LAUNCH_DEBT_MIX: Readonly<Record<BlocId, readonly (readonly [string, bigint])[]>> = Object.freeze({
  FDL: [['B3M', 15n], ['N2Y', 20n], ['N5Y', 20n], ['N10Y', 25n], ['N30Y', 10n], ['L10Y', 10n]],
  EUN: [['B3M', 15n], ['N2Y', 20n], ['N5Y', 20n], ['N10Y', 25n], ['N30Y', 10n], ['L10Y', 10n]],
  PYN: [['B3M', 15n], ['N2Y', 20n], ['N5Y', 20n], ['N10Y', 25n], ['N30Y', 10n], ['L10Y', 10n]],
  NKR: [['B3M', 15n], ['N2Y', 20n], ['N5Y', 20n], ['N10Y', 25n], ['N30Y', 10n], ['L10Y', 10n]],
  SRL: [['B3M', 20n], ['B1Y', 20n], ['N2Y', 25n], ['N5Y', 20n], ['N10Y', 15n]],
});
const REMAINDER_LINE: Readonly<Record<BlocId, string>> = Object.freeze({ FDL: 'N10Y', EUN: 'N10Y', PYN: 'N10Y', NKR: 'N10Y', SRL: 'N2Y' });
/** 22 §4.3 FDL launch lines (today SRL G10Y only). PYN has fxDebtShare0 0.05 but no FDL line, so it keeps all its debt local. */
const FDL_LINE: Readonly<Record<BlocId, string | null>> = Object.freeze({ FDL: null, EUN: null, PYN: null, NKR: null, SRL: 'G10Y' });

export interface LaunchDebtSplit { debt: Money; residue: Money; units: Readonly<Record<string, bigint>>; fdlUnits: bigint; fdlEq: Money }

/** AC-04-20-LAUNCHDEBT (E-97): pure, left to right, BigInt division floors. Σ units × 1e9 + fdlEq = debt. */
export function launchDebtSplit(b: BlocId, S: number, p: ParamsView): LaunchDebtSplit {
  const d = BLOC_DEFAULTS[b];
  const D = toMoney(d.initialDebtGdp * fromMoney(genesisNominalGdp(b, S, p)), d.ccy);
  let fdlUnits = 0n, fdlEq = 0n;
  if (d.fxDebtShare0 > 0 && FDL_LINE[b] !== null) {
    fdlUnits = toMoney(d.fxDebtShare0 * fromMoney(D) * d.fx0, 'FDL') / UNIT;
    fdlEq = toMoney(fromMoney(fdlUnits * UNIT) / d.fx0, d.ccy);
  }
  const L = D - fdlEq, U = L / UNIT, residue = L - U * UNIT;
  const units: Record<string, bigint> = {};
  let rest = U;
  for (const [k, pct] of LAUNCH_DEBT_MIX[b]) { if (k !== REMAINDER_LINE[b]) { units[k] = U * pct / 100n; rest -= units[k]; } else units[k] = 0n; }
  units[REMAINDER_LINE[b]] = rest;
  return { debt: D - residue, residue, units: Object.freeze(units), fdlUnits, fdlEq };
}

const D = TICKS_PER_GAME_DAY;
const FSI_KEYS = ['interbank', 'repoHaircut', 'ccpFund', 'bankEquityDd', 'stablecoinDepeg', 'etfDiscount'] as const;
const zeroImbalance = (): Record<ImbalanceKey, number> => { const o = {} as Record<ImbalanceKey, number>; for (const k of IMBALANCE_KEYS) o[k] = 0; return o; };

function genesisCb(b: BlocId, S0: number, tick: number, p: ParamsView): CentralBank {
  const d = BLOC_DEFAULTS[b], ccy0 = {} as Record<BlocId, Money>;
  for (const c of BLOC_ORDER) ccy0[c] = 0n;
  const meet = [meetingPlan(b, 0, p).meetingTick, meetingPlan(b, 91, p).meetingTick].filter((t) => t >= tick);
  return { id: cbkId(b), bloc: b, name: b, mandate: d.mandate, hawkishness: 0.5, hawkDrift: 0, credibility: d.personality.credibility0, smoothing: p.num('macro_cb_smoothing'),
    phiPi: 0, phiX: 0, phiFs: 0, phiFx: 0, bias: 0, rStarEstimate: d.rStar0, policyRate: d.initialPolicyRate, corridorHalfWidth: p.num('macro_corridor_halfwidth'),
    reserveRequirement: d.rrDefault, iorTierMultiple: 3, meetings: { scheduledTicks: meet, guidanceLeadTicks: 24 * D, minutesLagTicks: 14 * D },
    lastDecisions: [], guidance: null, dots: [],
    qe: { state: 'NONE', purchasesPerMonth: 0n, eligible: { govBonds: 1, corpIG: 0, abs: 0 }, holdingsCapGdp: 0.35, qtRunoffCapPerMonth: 0 }, ycc: null,
    macroprudential: { ccyb: 0, ltvCapResidential: 0.80, ltvCapCommercial: 0.65, dtiCap: 0.40 },
    facilities: { lendingRate: d.initialPolicyRate, depositRate: d.initialPolicyRate, collateralHaircuts: {}, elaPenaltySpread: 0.015, maxTermDays: 7 },
    swapLinesOut: [], reserves: { fdl: b === 'FDL' ? 0n : openingReservesFdl(b, S0, p), gold: 0n, otherFx: ccy0 }, // E-106 (1)
    balanceSheet: { govBonds: 0n, corpBonds: 0n, abs: 0n, loansToBanks: 0n, elaOutstanding: 0n, bankReserves: 0n, currencyInCirculation: 0n },
    emergencyCountQuarter: 0, memberOffsets: [], rStarBias: 0, governorNpcId: null, governorTermEndTick: 0, offTargetDays: 0, ycc10Streak: 0, yccHighInflDays: 0,
    yccRaises: 0, lowDepthDays: 0, ltroOpenUntilTick: null, ccybPending: null, emergencyQuarter: 0, pendingEmergency: null };
}

function genesisBloc(b: BlocId, S: number, aiRace: number, p: ParamsView): BlocMacroState & { id: BlocId } {
  const d = BLOC_DEFAULTS[b], gdp0 = genesisNominalGdp(b, S, p), g = fromMoney(gdp0), split = launchDebtSplit(b, S, p), ln0 = dmath.ln(d.fx0);
  const lambda0 = d.sovereignBaseHazard, lgd = p.num('macro_sov_lgd'), reserves = b === 'FDL' ? 0n : openingReservesFdl(b, S, p);
  const fx: FxState = { ccy: b, fairValueLn: ln0, pppLn: ln0, realExchangeGap: 0, regime: d.fxRegime0, reservesFdl: reserves, reservesTarget: reserves,
    reserveCoverMonths: b === 'FDL' ? 0 : p.num(`mac_cbk_reserve_cover0_${b}`), currentAccountGdp: d.ca0, capitalFlowIndex: 0, exchangeMarketPressure: 0,
    capitalControls: 0, interventionToday: 0n, crisisFlag: false,
    ...(d.fxRegime0 === 'MANAGED_BAND' ? { band: { centerLn: ln0, halfWidth: 0.03, basket: { FDL: 0.5, EUN: 0.3, NKR: 0.2 } }, bandC0: ln0 } : {}) };
  const debtGdp = g > 0 ? fromMoney(split.debt) / g : 0;
  return { id: b, bloc: b, tick: 0, regime: 'EXPANSION', regimeSinceTick: 0, outputGap: 0, outputGapTarget: 0, potentialGrowth: potentialGrowth(b, aiRace, p),
    realGdpIndex: 100, potentialGdpIndex: 100, nominalGdp: gdp0, gdpGrowthQoQAnn: 0,
    coreInflation: d.inflationTarget, headlineInflation: d.inflationTarget, inflationExp1y: d.inflationTarget, inflationExp5y5y: d.inflationTarget,
    cpiLevel: 100, coreCpiLevel: 100, wageIndex: 100, wageGrowth: 0, unemployment: d.nairu, rStar: d.rStar0,
    creditGap: 0, creditGrowth: 0, creditConditions: 0, housePriceGap: 0, realRateGapSmoothed: d.initialPolicyRate - d.inflationTarget - d.rStar0,
    fiscal: { revenueGdp: 0, spendingGdp: 0, interestGdp: 0, primaryBalanceGdp: d.initialPrimaryBalanceGdp, deficitGdp: 0, debt: split.debt, debtGdp, fxDebt: 0n,
      averageCoupon: 0, averageMaturityYears: 0, cashBuffer: 0n, grossFinancingNeedQuarter: 0n, programs: [], austerityMode: false, swfAssets: 0n },
    fx,
    sovereign: { hazard: lambda0, pd1y: pdAt(1, lambda0), pd5y: pdAt(5, lambda0), spread10y: sovSpread(10, lambda0, lgd), liquidityPremium: liquidityPremium(b, 1, 0),
      convenienceYield: d.conv, stressIndex: stressIndexOf(lambda0, lambda0), failedAuctions21d: 0, status: 'PERFORMING', depthIndex: 1,
      ratingInputs: { govId: govId(b), tick: 0, debtGdp, interestRevenue: 0, primaryBalanceGdp: d.initialPrimaryBalanceGdp, realGrowthTrend: d.potentialGrowth0,
        inflationVol: 0, reserveCoverMonths: fx.reserveCoverMonths, fxDebtShare: d.fxDebtShare0, cbCredibility: d.personality.credibility0, politicalStability: 0,
        marketPd1y: pdAt(1, lambda0), modelPd1y: pdAt(1, lambda0) } },
    imbalance: zeroImbalance(), shocks: [], rStarRw: 0, gapEstNoise: 0, credit: g, credit0: g, creditGdpTrend: 1, peNorm: 0, fiscalImpulse: 0,
    unemployment12mLow: d.nairu, dep: 0, sentiment: 0, consumptionSignal: 0 };
}

/** Genesis peNorm (open point 4): content peNorm0 (22); without content, one sample of ports.markets.peAggregate; else 0 (valuation z off). */
function peNorm0(ctx: PhaseCtx, b: BlocId, ports: MacroPorts): number {
  const c = ctx.content as unknown as { blocEquityIndex?: (x: BlocId) => { peNorm0: number } };
  if (typeof c.blocEquityIndex === 'function') return c.blocEquityIndex(b).peNorm0;
  return ports.markets.peAggregate(ctx.store, b) ?? 0;
}

/** T04-20 step 1: once, before tick 0 (ctx.tick 0). Global first, then blocs in BLOC_ORDER (04 §3.19 draw order). */
export function macroGenesis(ctx: PhaseCtx, ports: MacroPorts): void {
  const s = ctx.store, p = ctx.params;
  const S0 = p.num('macro_scale_min');   // MISSING EXPORT: T22 players.activityWeighted → N_a = 0 → scaleTarget = macro_scale_min (edge 17)
  const ai0 = 50, F0 = 22;
  const stab: StabilizerState & { id: 'STAB' } = { id: 'STAB', errorLog: 0, integral: 0, msi: 0,
    levers: { L1_demand: 0, L2_lifestyle_price: 0, L3_levy_bp: 0, L4_upkeep: 0 }, lastPublishedReportTick: null as unknown as number,
    diagnostics: { faucetsWeek: 0n, sinksWeek: 0n, netMintWeek: 0n, npcToPlayerWealthRatio: 0, m0Index: 0, m2Index: 0 } };
  const global: GlobalMacroState & { id: 'GLOBAL' } = { id: 'GLOBAL', tick: 0, globalRegime: 'EXPANSION', globalRegimeSinceTick: 0, fearIndex: F0,
    riskAppetite: riskAppetite(F0), financialStressIndex: 0, worldTradeIndex: 100, tariffLevel: 0.03, tariffBase: 0.03, worldScale: S0, worldNominalGdpFdl: 0n,
    energyIndex: 100, foodIndex: 100, aiRaceIndex: ai0, worldHackRate: 0, geopoliticalTension: 30, chapterIndex: 0,
    scheduler: { lastMajorEndTick: null, lastMajorStartTick: null, majorsThisChapter: 0, playerCausedSuppressUntil: null, timezoneBandNext: 0, crisisWeek: null,
      crisisWeekUsedThisChapter: false, activeMajorId: null, activeStormIds: [], activeRippleIds: [] }, stabilizer: stab };
  s.put(macroTables.global.name, global);
  const values: Record<string, number> = { rv21Gx: 0.16, gxReturnToday: 0 };
  for (const k of FSI_KEYS) values[`fsi.${k}`] = 0;
  s.put<MacroInputs>(macroTables.inputs.name, { id: 'HOURLY', tick: 0, staleKeys: [], values });
  chapterStart(ctx);
  s.put(macroTables.stab.name, stab);
  for (const b of BLOC_ORDER) {
    const row = { ...genesisBloc(b, S0, ai0, p), peNorm: peNorm0(ctx, b, ports) };
    s.put(macroTables.bloc.name, row);
    s.put(macroTables.cb.name, genesisCb(b, S0, ctx.tick, p));
    appointGovernor(ctx, b, 'GENESIS', ports);
    genesisOutputGapEstimate(ctx, b, 0);
    const cb = s.get<CentralBank>(macroTables.cb.name, cbkId(b))!;
    const k = coeffsFromHawk(b, cb.hawkishness, cb.mandate, p);
    s.put<CentralBank>(macroTables.cb.name, { ...cb, phiPi: k.phiPi, phiX: k.phiX, phiFs: k.phiFs, phiFx: k.phiFx, bias: k.bias, smoothing: k.rho });
    setCorridor(ctx, b);
    s.put(macroTables.publicView.name, { id: b, bloc: b, prints: {}, cycleLabel: 'EXPANSION', cycleLabelSinceDay: 0 } as unknown as PublicMacroView & { id: BlocId });
    recomputeCurve(ctx, b, 'GENESIS');
    refreshPublicView(ctx, b);
  }
  let w = 0n;
  for (const b of BLOC_ORDER) w += nominalGdpFdl(s, b);
  s.put(macroTables.global.name, { ...s.get<GlobalMacroState & { id: 'GLOBAL' }>(macroTables.global.name, 'GLOBAL')!, worldNominalGdpFdl: w });
  writeQuarterSchedule(ctx, 0);
  writeQuarterSchedule(ctx, 91);
  for (const b of BLOC_ORDER) planQuarter(ctx, b, ports);
}
