// T04-01: DEFAULT bloc table of 04 §2.2 (22 may rename, numbers are binding) plus the per-bloc numbers other 04 sections cite.
// Values in FU, EC, PL, NA, SC order = FDL, EUN, PYN, NKR, SRL.
import { EngineFault } from '@tycoon/engine-core';
import type { BlocDef, BlocId } from './schema';
import type { ContentView } from './core-port';
import { cbkId, govId } from '@tycoon/engine-ledger';
import { crtId, excId, regId } from './ids';

/** 04 §2.2 numbers. `sectorWeights` is not here: card step 3 takes it from content (22), so it is excluded from the defaults. */
export interface BlocDefaults extends Omit<BlocDef, 'name' | 'cityIds' | 'cbkId' | 'govId' | 'excId' | 'regId' | 'crtId' | 'sectorWeights'> {
  initialDebtGdp: number; initialPrimaryBalanceGdp: number; initialPolicyRate: number; hawkRange: [number, number]; fx0: number;
  mandate: 'PRICE_STABILITY' | 'DUAL'; techShare: number; rrDefault: number; revBase: number; tpBase: number; tpFear: number; conv: number;
  ca0: number; betaRisk: number; betaOil: number; phiFx: number; meetingTradingDayOfQuarter: number; releaseOffset: number }

type Row = Omit<BlocDefaults, 'id' | 'ccy' | 'personality' | 'hawkRange'> & { hawkMin: number; hawkMax: number; credibility0: number; communicationClarity: number };
const mk = (id: BlocId, r: Row): BlocDefaults => {
  const { hawkMin, hawkMax, credibility0, communicationClarity, ...rest } = r;
  return Object.freeze({ id, ccy: id, ...rest, hawkRange: [hawkMin, hawkMax] as [number, number],
    personality: Object.freeze({ hawkMin, hawkMax, credibility0, communicationClarity }) });
};

export const BLOC_DEFAULTS: Readonly<Record<BlocId, BlocDefaults>> = Object.freeze({
  FDL: mk('FDL', { gdpShare0: 0.32, potentialGrowth0: 0.025, inflationTarget: 0.02, rStar0: 0.0075, nairu: 0.045, laborForceGrowth: 0.006, openness: 0.25,
    commodityExporter: 0, foodWeight: 0.12, energyWeight: 0.08, fxPassThrough: 0.05, fiscalRule: { kind: 'FLEXIBLE' }, fxRegime0: 'FREE_FLOAT',
    negativeRatesAllowed: false, elb: 0, sovereignBaseHazard: 0.0005, debtReference: 1.10, fxDebtShare0: 0, cycleCoupling: 0.8,
    initialDebtGdp: 0.95, initialPrimaryBalanceGdp: -0.02, initialPolicyRate: 0.03, hawkMin: 0.40, hawkMax: 0.65, credibility0: 0.85, communicationClarity: 0.8,
    fx0: 1.0, mandate: 'DUAL', techShare: 1.0, rrDefault: 0.01, revBase: 0.30, tpBase: 0.005, tpFear: -0.0004, conv: 0.002, ca0: -0.03,
    betaRisk: 0, betaOil: 0, phiFx: 0, meetingTradingDayOfQuarter: 39, releaseOffset: 0 }),
  EUN: mk('EUN', { gdpShare0: 0.22, potentialGrowth0: 0.013, inflationTarget: 0.02, rStar0: 0.0025, nairu: 0.07, laborForceGrowth: 0.001, openness: 0.45,
    commodityExporter: -0.6, foodWeight: 0.13, energyWeight: 0.09, fxPassThrough: 0.08, fiscalRule: { kind: 'DEFICIT_CAP', cap: 0.03, debtRef: 0.60 }, fxRegime0: 'FREE_FLOAT',
    negativeRatesAllowed: true, elb: -0.005, sovereignBaseHazard: 0.003, debtReference: 0.60, fxDebtShare0: 0, cycleCoupling: 1.0,
    initialDebtGdp: 0.88, initialPrimaryBalanceGdp: -0.01, initialPolicyRate: 0.0225, hawkMin: 0.55, hawkMax: 0.85, credibility0: 0.90, communicationClarity: 0.7,
    fx0: 1.1, mandate: 'PRICE_STABILITY', techShare: 0.5, rrDefault: 0.01, revBase: 0.42, tpBase: 0.004, tpFear: 0.0002, conv: 0, ca0: 0.02,
    betaRisk: 0.01, betaOil: 0, phiFx: 0, meetingTradingDayOfQuarter: 51, releaseOffset: 1 }),
  PYN: mk('PYN', { gdpShare0: 0.24, potentialGrowth0: 0.040, inflationTarget: 0.025, rStar0: 0.01, nairu: 0.035, laborForceGrowth: 0.003, openness: 0.60,
    commodityExporter: -0.8, foodWeight: 0.15, energyWeight: 0.08, fxPassThrough: 0.10, fiscalRule: { kind: 'BALANCED_CYCLE', tolerance: 0.015 }, fxRegime0: 'MANAGED_BAND',
    negativeRatesAllowed: false, elb: 0, sovereignBaseHazard: 0.002, debtReference: 0.70, fxDebtShare0: 0.05, cycleCoupling: 1.2,
    initialDebtGdp: 0.60, initialPrimaryBalanceGdp: -0.01, initialPolicyRate: 0.0275, hawkMin: 0.30, hawkMax: 0.60, credibility0: 0.75, communicationClarity: 0.5,
    fx0: 0.15, mandate: 'DUAL', techShare: 0.9, rrDefault: 0.05, revBase: 0.25, tpBase: 0.006, tpFear: 0, conv: 0, ca0: 0.03,
    betaRisk: 0.03, betaOil: 0, phiFx: 0.20, meetingTradingDayOfQuarter: 63, releaseOffset: 2 }),
  NKR: mk('NKR', { gdpShare0: 0.07, potentialGrowth0: 0.018, inflationTarget: 0.02, rStar0: 0.005, nairu: 0.04, laborForceGrowth: 0.005, openness: 0.55,
    commodityExporter: 0.9, foodWeight: 0.11, energyWeight: 0.07, fxPassThrough: 0.08, fiscalRule: { kind: 'SURPLUS_SWF', targetSurplus: 0.02 }, fxRegime0: 'FREE_FLOAT',
    negativeRatesAllowed: true, elb: -0.0025, sovereignBaseHazard: 0.0003, debtReference: 0.60, fxDebtShare0: 0, cycleCoupling: 0.7,
    initialDebtGdp: 0.40, initialPrimaryBalanceGdp: 0.03, initialPolicyRate: 0.025, hawkMin: 0.45, hawkMax: 0.75, credibility0: 0.85, communicationClarity: 0.9,
    fx0: 0.095, mandate: 'PRICE_STABILITY', techShare: 0.5, rrDefault: 0.01, revBase: 0.40, tpBase: 0.003, tpFear: -0.0002, conv: 0.0005, ca0: 0.05,
    betaRisk: 0.04, betaOil: 0.25, phiFx: 0, meetingTradingDayOfQuarter: 15, releaseOffset: 3 }),
  SRL: mk('SRL', { gdpShare0: 0.15, potentialGrowth0: 0.045, inflationTarget: 0.04, rStar0: 0.02, nairu: 0.08, laborForceGrowth: 0.012, openness: 0.40,
    commodityExporter: 0.6, foodWeight: 0.20, energyWeight: 0.09, fxPassThrough: 0.25, fiscalRule: { kind: 'PROCYCLICAL', boomSpendShare: 0.6 }, fxRegime0: 'MANAGED_FLOAT',
    negativeRatesAllowed: false, elb: 0.005, sovereignBaseHazard: 0.02, debtReference: 0.50, fxDebtShare0: 0.30, cycleCoupling: 1.3,
    initialDebtGdp: 0.70, initialPrimaryBalanceGdp: -0.015, initialPolicyRate: 0.095, hawkMin: 0.20, hawkMax: 0.70, credibility0: 0.45, communicationClarity: 0.4,
    fx0: 0.20, mandate: 'PRICE_STABILITY', techShare: 0.3, rrDefault: 0.10, revBase: 0.27, tpBase: 0.012, tpFear: 0.0006, conv: 0, ca0: -0.02,
    betaRisk: 0.12, betaOil: 0.10, phiFx: 0.30, meetingTradingDayOfQuarter: 27, releaseOffset: 4 }),
});

export const SECTOR_COUNT = 12;
/** Content id of Isla Serena (22 catalog; no bloc, uses FDL). */
export const ISLA_SERENA_CITY = 'city_isla_serena';

/** Merges content names, cityIds and sectorWeights with BLOC_DEFAULTS numbers. sectorWeights: 12 entries summing to 1 ± 1e−9. */
export function blocDef(content: ContentView, b: BlocId): BlocDef {
  let c = null;
  for (const x of content.blocs()) if (x.id === b) { c = x; break; }
  if (c === null) throw new EngineFault('I0.macro_bloc', `content has no bloc ${b}`);
  const w = c.sectorWeights;
  if (w.length !== SECTOR_COUNT) throw new EngineFault('I0.macro_sector_weights', `${b}: ${w.length} sector weights, need ${SECTOR_COUNT}`);
  let sum = 0;
  for (const v of w) sum += v;
  if (!(Math.abs(sum - 1) <= 1e-9)) throw new EngineFault('I0.macro_sector_weights', `${b}: sector weights sum ${sum}`);
  const { initialDebtGdp: _a, initialPrimaryBalanceGdp: _b, initialPolicyRate: _c, hawkRange: _d, fx0: _e, mandate: _f, techShare: _g, rrDefault: _h,
    revBase: _i, tpBase: _j, tpFear: _k, conv: _l, ca0: _m, betaRisk: _n, betaOil: _o, phiFx: _p, meetingTradingDayOfQuarter: _q, releaseOffset: _r, ...d } = BLOC_DEFAULTS[b];
  return { ...d, name: c.name, cityIds: [c.cityIds[0], c.cityIds[1], c.cityIds[2]], sectorWeights: [...w],
    personality: { ...d.personality }, fiscalRule: { ...d.fiscalRule },
    cbkId: cbkId(b), govId: govId(b), excId: excId(b), regId: regId(b), crtId: crtId(b) };
}
