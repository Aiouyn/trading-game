// T04-19 test kit: a cbWorld seeded with bloc, cb, global, curve and public-view rows for every bloc. Source rows carry hidden
// fields (regime, outputGap, hawkishness, rStarEstimate, hHat, hazard) on purpose, so the 04#15 scans prove they never leak.
import { type Id, type ViewerContext } from '@tycoon/engine-core';
import { BLOC_ORDER, macroTables, RELEASE_KINDS, type BlocId } from '../schema';
import { cbRow, cbWorld, type CbWorld } from './cbWorld';
import type { Levers } from '../views/ledgerSources';

export const curveOf = (y2: number, y10: number): { tenorYears: number; yield: number }[] =>
  [{ tenorYears: 0.25, yield: 0.03 }, { tenorYears: 2, yield: y2 }, { tenorYears: 10, yield: y10 }];

export function viewWorld(tick = 7 * 720): CbWorld {
  const w = cbWorld(BLOC_ORDER.map((b) => cbRow(b, { hawkishness: 0.6, rStarEstimate: 0.01, credibility: 0.8, guidance: null, dots: [{ horizonQuarters: 4, rate: 0.03 }],
    lastDecisions: [], meetings: { scheduledTicks: [], guidanceLeadTicks: 0, minutesLagTicks: 14 * 720 },
    qe: { state: 'NONE', purchasesPerMonth: 0n, eligible: { govBonds: 1, corpIG: 0, abs: 0 }, holdingsCapGdp: 0.3, qtRunoffCapPerMonth: 0 },
    ycc: null, macroprudential: { ccyb: 0.01, ltvCapResidential: 0.8, ltvCapCommercial: 0.7, dtiCap: 0.4 }, swapLinesOut: [], governorNpcId: null })), tick);
  w.put(macroTables.global.name, { id: 'GLOBAL', tick, fearIndex: 40, riskAppetite: 0.5, financialStressIndex: 0.2, worldNominalGdpFdl: 10n ** 20n,
    scheduler: { majorsThisChapter: 2, crisisWeek: null, activeMajorId: null, activeStormIds: [], activeRippleIds: [], lastMajorEndTick: null, lastMajorStartTick: null } } as never);
  for (const b of BLOC_ORDER) {
    w.put(macroTables.bloc.name, { id: b, bloc: b, regime: 'EXPANSION', outputGap: 0.01, outputGapTarget: 0, nominalGdp: 10n ** 19n,
      sovereign: { hazard: 0.02, pd1y: 0.01, spread10y: 0.004, status: 'PERFORMING' },
      fx: { regime: 'FLOAT', reservesFdl: 5n * 10n ** 15n, reserveCoverMonths: 6, capitalControls: 0 } } as never);
    w.put(macroTables.curve.name, { id: b, hHat: 0.5, marketImplied: [{ horizonQuarters: 4, rate: 0.031 }], basis: 0.001, nodes: curveOf(0.03, 0.035) } as never);
    w.put(macroTables.publicView.name, { id: b, bloc: b, prints: Object.fromEntries(RELEASE_KINDS.map((k) => [k, null])), curve: curveOf(0.03, 0.035),
      ois: curveOf(0.029, 0.03), breakeven10y: 0.02, termPremium10y: 0.004, cycleLabel: 'EXPANSION', cycleLabelSinceDay: 3,
      fiscalPrints: { deficitGdp: 0.03, debtGdp: 0.8, primaryBalanceGdp: -0.01, asOfQuarter: 0 } } as never);
  }
  return w;
}
export function setNow(w: CbWorld, tick: number): void {
  w.setTick(tick);
  w.put(macroTables.global.name, { ...(w.ctx.store.get<object>(macroTables.global.name, 'GLOBAL') as object), id: 'GLOBAL', tick } as never);
}
export const viewer = (id: Id | null): ViewerContext => ({ viewerId: id, isAdmin: false, partyOf: (ids) => id !== null && ids.includes(id) });
export const lev = (L1: number, L2 = 1, L3 = 0, L4 = 1): Levers => ({ L1_demand: L1, L2_lifestyle_price: L2, L3_levy_bp: L3, L4_upkeep: L4 });
/** 03 rows: led.stab history for days 0..lastDay (e = day/1000, L1 = 1 + day/100), led.msi, FDL FlowDay rows. */
export function seed03(w: CbWorld, lastDay: number, flows = true): void {
  const history = [];
  for (let d = 0; d <= lastDay; d++) history.push({ dayIndex: d, e: d / 1000, u: 0, levers: lev(1 + d / 100) });
  w.put('led.stab', { id: 'world', mode: 'ACTIVE', integral: 0.07, lastError: 0, levers: lev(1 + lastDay / 100), history, absEOver05Days: 0, rhoOutOfBandDays: 0, launchDay: 0 } as never);
  w.put('led.msi', { id: 'world', dayIndex: lastDay, raw: 1.2, ema: 1.2, emaBaseSum: 0, emaBaseN: 0, msi: 1.2345 } as never);
  if (flows) for (let d = 0; d <= lastDay; d++)
    w.put('led.flowday', { id: `FDL:${d}`, ccy: 'FDL', dayIndex: d, byClass: { FAUCET: '1000000000', SINK: '400000000', TRANSFER: '5' },
      M0: d === 0 ? '2000000000000' : '2050000000000', M2: d === 0 ? '5000000000000' : '4900000000000' } as never);
}
export type { BlocId };
