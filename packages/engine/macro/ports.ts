// T04-01: dependency-inversion ports (G6.1) through which 04 reads modules built after it.
// Every function is pure over StoreRead; null/undefined = input missing → the last value holds (§3.14.5, edge 23).
import type { Ccy, Id, Money, Price, Qty, Tick } from '@tycoon/engine-core';
import type { StoreRead } from '@tycoon/engine-core';
import type { BlocId, FiscalProgram, Tenor } from './schema';

export interface MacroMarketPort {   // 05
  equityIndexLevel(s: StoreRead, b: BlocId): number | null; gxLevel(s: StoreRead): number | null; gxReturnToday(s: StoreRead): number | null;
  rv21Gx(s: StoreRead): number | null; gxDrawdown21d(s: StoreRead): number | null; peAggregate(s: StoreRead, b: BlocId): number | null;
  fxSpot(s: StoreRead, c: Ccy): number | null /* FDL per unit, last print */; lineYield(s: StoreRead, assetId: string): number | null;
  lineAdv(s: StoreRead, assetId: string): number | null /* face per tick */; bondDepthIndex(s: StoreRead, b: BlocId, offTheRun: boolean): number | null;
  bankEquityDrawdown364(s: StoreRead, b: BlocId | 'WORLD'): number | null; indexWideHalt(s: StoreRead, tick: Tick): boolean;
  poolFills(s: StoreRead, tick: Tick, poolId: string): { assetId: string; side: 'BUY' | 'SELL'; qty: Qty; notional: Money; ccy: Ccy }[];
  makerHalfSpread(s: StoreRead, assetId: string): number | null; fairPriceOf(s: StoreRead, assetId: string): Price | null }
export interface MacroAssetPort {    // 06
  commodityClose(s: StoreRead, commodityId: 'CRUDE' | 'GAS' | 'MWH' | 'WHEAT' | 'CORN' | 'COFFEE' | 'COCOA' | 'GOLD'): number | null;
  sovereignLines(s: StoreRead, gov: Id): { assetId: string; tenor: Tenor; couponRate: number; maturityTick: Tick; faceOutstanding: Qty; onTheRun: boolean; inflationLinked: boolean; fxDenominated: boolean }[];
  priceFromYield(s: StoreRead, assetId: string, yieldCc: number, tick: Tick): number /* clean per 100 */; yieldFromPrice(s: StoreRead, assetId: string, per100: number, tick: Tick): number;
  sovCds(s: StoreRead, gov: Id): { spread5y: number; adv: number } | null; igCreditSpreadIndex(s: StoreRead): number | null;
  maxStablecoinDepeg(s: StoreRead): number | null; cryptoHype(s: StoreRead): number | null; minStablecoinBacking(s: StoreRead): number | null;
  semisValuationZ(s: StoreRead): number | null;
  assetInfo(s: StoreRead, assetId: string): { cls: 'GOV' | 'CORP' | 'ABS_SENIOR' | 'COVERED' | 'EQUITY' | 'OTHER'; issuerBloc: BlocId | null; maturityTick: Tick | null; ccy: Ccy } | null;  // 04 §3.8.3 (T04-08)
  qeEligibleLines(s: StoreRead, b: BlocId, kind: 'CORP_IG' | 'ABS_SENIOR'): { assetId: string; faceOutstanding: Qty; maturityTick: Tick }[] }  // QE mix (T04-09)
export interface MacroCreditPort {   // 07
  creditAggregates(s: StoreRead, b: BlocId): { credit: number; creditConditions: number; interbankSpread: number } | null;
  bankReserves(s: StoreRead, bankId: Id): { balance: Money; required: Money; eligibleDeposits: Money } | null;
  solvencyOk(s: StoreRead, bankId: Id): boolean; isChartered(s: StoreRead, entityId: Id, b: BlocId): boolean; bankEquity(s: StoreRead, bankId: Id): Money | null;
  repoHaircutIndexChange(s: StoreRead): number | null; ccpDefaultFundUsage(s: StoreRead): number | null; npcBankBelow12xMin(s: StoreRead, b: BlocId): number;
  repoLeverageIndex(s: StoreRead): number | null; npcBankIds(s: StoreRead, b: BlocId): Id[]; pledgedQty(s: StoreRead, owner: Id, assetId: string): Qty;
  weakestNpcBanks(s: StoreRead, n: number): Id[]; isLoanClaim(s: StoreRead, id: string): { bankId: Id; principal: Money; ccy: Ccy } | null }  // ELA collateral (T04-08)
export interface MacroFundsPort {    // 08
  sovereignGrades(s: StoreRead, gov: Id): string[] /* three agencies, best first */; gradeOf(s: StoreRead, assetIdOrIssuer: string): string | null;
  etfDiscountIndex(s: StoreRead): number | null; poolUnderwritingQuality(s: StoreRead): number | null }
export interface MacroHousingPort { housePriceIndex(s: StoreRead, b: BlocId): number | null; housePriceGap(s: StoreRead, b: BlocId): number | null } // 10
export interface MacroAiPort { aiRaceIndex(s: StoreRead): number | null }                                                          // 11
export interface MacroConflictPort { worldHackRate(s: StoreRead): number | null; playerHackShare(s: StoreRead): number | null }    // 12
export interface MacroWorldPort {    // 16
  politicalStability(s: StoreRead, b: BlocId): number | null; geopoliticalTension(s: StoreRead): number | null;
  fiscalProposals(s: StoreRead, tick: Tick): FiscalProgram[]; politicalDefault(s: StoreRead, b: BlocId): boolean;
  governorAppointment(s: StoreRead, b: BlocId, tick: Tick): { governorNpcId: Id; hawk0: number } | null; governorHawk(s: StoreRead, b: BlocId): number | null;
  tariffDelta(s: StoreRead, tick: Tick): number; policyValue(s: StoreRead, leverId: string, scopeKey: string): number | null;
  politicalStabilityShocks(s: StoreRead, tick: Tick): { bloc: BlocId; delta: number; days: number }[]; fiscalTransfersShare?: never }
export interface MacroPlayerPort {   // 14A / 13A / 15
  licenseOf(s: StoreRead, entityId: Id): 'LIC0' | 'LIC1' | 'LIC2' | 'LIC3' | 'LIC4' | null; hasCharter(s: StoreRead, entityId: Id, ch: string, b?: BlocId): boolean;
  isHeld(s: StoreRead, chrId: Id): boolean; ownerGroupOf(s: StoreRead, entityId: Id): string; reputationLowestBand(s: StoreRead, entityId: Id): boolean;
  topWealthGrowth(s: StoreRead): number | null; swfPrivilege(s: StoreRead, entityId: Id): boolean }
export interface MacroPorts { markets: MacroMarketPort; assets: MacroAssetPort; credit: MacroCreditPort | null; funds: MacroFundsPort; housing: MacroHousingPort;
  ai: MacroAiPort; conflict: MacroConflictPort; world: MacroWorldPort; players: MacroPlayerPort }

const nil = (): null => null;
const none = (): never[] => [];
const no = (): boolean => false;

/** "Module not present": every reader null / [] / false; credit = null (§3.14.4 fallback, edge 18); ownerGroupOf = the entity itself. */
export function defaultMacroPorts(): MacroPorts {
  return {
    markets: { equityIndexLevel: nil, gxLevel: nil, gxReturnToday: nil, rv21Gx: nil, gxDrawdown21d: nil, peAggregate: nil, fxSpot: nil, lineYield: nil,
      lineAdv: nil, bondDepthIndex: nil, bankEquityDrawdown364: nil, indexWideHalt: no, poolFills: none, makerHalfSpread: nil, fairPriceOf: nil },
    assets: { commodityClose: nil, sovereignLines: none,
      // no 06: no bond line exists, so no conversion exists either (NaN = no number; callers only reach this with a line from sovereignLines)
      priceFromYield: () => Number.NaN, yieldFromPrice: () => Number.NaN,
      sovCds: nil, igCreditSpreadIndex: nil, maxStablecoinDepeg: nil, cryptoHype: nil, minStablecoinBacking: nil, semisValuationZ: nil, assetInfo: nil, qeEligibleLines: none },
    credit: null,
    funds: { sovereignGrades: none, gradeOf: nil, etfDiscountIndex: nil, poolUnderwritingQuality: nil },
    housing: { housePriceIndex: nil, housePriceGap: nil },
    ai: { aiRaceIndex: nil },
    conflict: { worldHackRate: nil, playerHackShare: nil },
    world: { politicalStability: nil, geopoliticalTension: nil, fiscalProposals: none, politicalDefault: no, governorAppointment: nil, governorHawk: nil,
      tariffDelta: () => 0, policyValue: nil, politicalStabilityShocks: none },
    players: { licenseOf: nil, hasCharter: no, isHeld: no, ownerGroupOf: (_s, entityId) => entityId, reputationLowestBand: no, topWealthGrowth: nil, swfPrivilege: no },
  };
}
