// T22A-01 steps 4-5: derived values (peNorm0, FX side, SWF registration).
import { roundHalfEven, sortBy, type ParamsView } from '@tycoon/engine-core';
import { ContentError, type BlocId } from './blocs';
import type { ContentView, SectorId } from './view';

export const SECTOR_IDS: readonly SectorId[] = Object.freeze(['TECH', 'SEMI', 'ENERGY', 'MATERIALS', 'INDUSTRIALS', 'FINANCIALS', 'HEALTH',
  'STAPLES', 'DISCRETIONARY', 'REAL_ESTATE', 'MEDIA', 'SECURITY'] as const);   // 06 §3.4.1 table order

export const PE_NORM0_TOL = 0.01;
export const PE_NORM0_MIN = 8;
export const PE_NORM0_MAX = 40;
export const INDEX_SIZE = 30;

export function peBaseKey(s: SectorId): string { return `eq_sector_${s.toLowerCase()}_pe_base`; }

/** The bloc's 30-stock index members: the 30 largest b-listed equities by cap0 × freeFloat, ties by assetId (22 §4.8, 06 §3.5.1). */
export function top30Of(b: BlocId, eq: ContentView['equities']): ReturnType<ContentView['equities']>[number][] {
  return sortBy(eq().filter((e) => e.bloc === b), (e) => [-(Number(e.cap0) * e.freeFloat), e.assetId]).slice(0, INDEX_SIZE);
}

/** Step 5: Σcap / Σ(cap / PE_base) over top30Of(b); free float only selects members, weights are full cap0. */
export function peNorm0Of(b: BlocId, eq: ContentView['equities'], params: ParamsView): number {
  const top = top30Of(b, eq);
  let cap = 0;
  let earn = 0;
  for (const e of top) {
    const c = Number(e.cap0);
    cap += c;
    earn += c / params.num(peBaseKey(e.sector));
  }
  if (!(earn > 0)) throw new ContentError('CONTENT_PENORM0_EMPTY', `no equities for ${b}`);
  return cap / earn;
}

/** AC-22A-01-FXSIDE: a CB selling its own currency for FDL, wanting `fdlPerUnit` FDL per unit of its currency. */
export function cbSellOwnForFdl(ccy: Exclude<BlocId, 'FDL'>, fdlPerUnit: number, assetId: string, decimals: number):
  { assetId: string; side: 'BUY' | 'SELL'; price: number } {
  const q = 10 ** decimals;
  if (ccy === 'EUN') return { assetId, side: 'SELL', price: roundHalfEven(fdlPerUnit * q) / q };   // EUN is the base: sell EUNFDL
  return { assetId, side: 'BUY', price: roundHalfEven((1 / fdlPerUnit) * q) / q };                // FDL is the base: buy FDLxxx at 1/p
}

/** AC-22A-01-SWF: registration spec of fnd_SWF_<B> (holder class npcFirm, owner gov_<B>); SWF_TRANSFER is a TRANSFER. */
export function swfRegistration(b: BlocId): { entityId: string; holderClass: 'npcFirm'; ownerId: string; flowClass: { SWF_TRANSFER: 'TRANSFER' } } {
  return { entityId: `fnd_SWF_${b}`, holderClass: 'npcFirm', ownerId: `gov_${b}`, flowClass: { SWF_TRANSFER: 'TRANSFER' } };
}

export function sortedIds(xs: readonly string[]): string[] { return sortBy(xs, (x) => [x]); }

/** E-58.1: registration spec of the statistics office npc_STATS_<B> (kind npc; never holds money, no reason code posts to it). */
export function statisticsOfficeRegistration(b: BlocId): { entityId: string; kind: 'npc'; holderClass: 'npcFirm'; ownerId: string; holdsMoney: false } {
  return { entityId: `npc_STATS_${b}`, kind: 'npc', holderClass: 'npcFirm', ownerId: `gov_${b}`, holdsMoney: false };
}
