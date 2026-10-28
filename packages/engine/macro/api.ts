// T04-20 read api: thin readers of mac.* rows for other modules. StoreRead only; no writes, no draws.
import { dmath, type StoreRead, type Tick } from '@tycoon/engine-core';
import { cbkId, govId } from '@tycoon/engine-ledger';
import { BLOC_DEFAULTS } from './blocs';
import { BLOC_ORDER, macroTables, type BlocId, type BlocMacroState, type CentralBank, type CurveState, type FxRegimeKind, type GlobalMacroState,
  type HookCall, type NpcPoolOrder, type Regime, type SovAuction } from './schema';
import { nsZero } from './rules/nelsonSiegel';
import { sovereignStatus } from './rules/default';
import { restructuringTerms, sovereignRecovery } from './rules/restructuring';
import { activeWorldEvents } from './rules/phases';
import { releaseRiskReactions } from './rules/releases';
import { activeShockSum } from './rules/shocks';
import { hookCallsFor } from './rules/hooks';
import { priceIndexOf, type PriceIndexKind } from './rules/inflation';
import { spotOfStore } from './rules/fxReserves';
import { historyAt } from './core/history';

export { nsZero, sovereignStatus, restructuringTerms, sovereignRecovery, activeWorldEvents };

const need = <T>(v: T | undefined, what: string): T => { if (v === undefined) throw new Error(`macro api: ${what} missing`); return v; };
const bloc = (s: StoreRead, b: BlocId): BlocMacroState => need(s.get<BlocMacroState>(macroTables.bloc.name, b), `bloc ${b}`);
const byId = (x: { id: string }, y: { id: string }): number => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);

export function getBlocRegime(store: StoreRead, b: BlocId): Regime { return bloc(store, b).regime; }
export function getGlobalRegime(store: StoreRead): Regime { return getGlobalMacro(store).globalRegime; }
/** Hidden fields included: engine-side readers only, never a client payload. */
export function getGlobalMacro(store: StoreRead): GlobalMacroState { return need(store.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL'), 'GLOBAL'); }
/** band as spot levels exp(centerLn ± halfWidth). */
export function getFxState(store: StoreRead, b: BlocId): { spotVsFdl: number; regime: FxRegimeKind; band: { lo: number; hi: number } | null; capitalControls: number } {
  const fx = bloc(store, b).fx;
  return { spotVsFdl: spotOfStore(store, b), regime: fx.regime, capitalControls: fx.capitalControls,
    band: fx.band ? { lo: dmath.exp(fx.band.centerLn - fx.band.halfWidth), hi: dmath.exp(fx.band.centerLn + fx.band.halfWidth) } : null };
}
export function getCurves(store: StoreRead, b: BlocId): CurveState { return need(store.get<CurveState>(macroTables.curve.name, b), `curve ${b}`); }
export function policyRate(store: StoreRead, b: BlocId): number { return need(store.get<CentralBank>(macroTables.cb.name, cbkId(b)), `cb ${b}`).policyRate; }
export function cpiAt(store: StoreRead, b: BlocId, day: number): number | null { return historyAt(store, b, day)?.cpiLevel ?? null; }
export function priceIndex(store: StoreRead, b: BlocId, kind: PriceIndexKind): number {
  return priceIndexOf(bloc(store, b), getGlobalMacro(store), spotOfStore(store, b), BLOC_DEFAULTS[b].fx0, kind);
}
export function outputGap(store: StoreRead, b: BlocId): number { return bloc(store, b).outputGap; }
export function y10(store: StoreRead, b: BlocId): number { return nsZero(getCurves(store, b).ns, 10); }
export function neutralRate(store: StoreRead, b: BlocId): number { return bloc(store, b).rStar; }
export function wageIndex(store: StoreRead, b: BlocId): number { return bloc(store, b).wageIndex; }
/** Market-implied 1y PD (T04-07 ratingInputs.marketPd1y; equals the model PD when no market hazard). */
export function sovereignPd(store: StoreRead, b: BlocId): number { return bloc(store, b).sovereign.ratingInputs.marketPd1y; }
/** τ capped at 1 year. */
export function billYield(store: StoreRead, b: BlocId, tenorYears: number): number { return nsZero(getCurves(store, b).ns, tenorYears > 1 ? 1 : tenorYears); }
export function govYield(store: StoreRead, b: BlocId, tenorYears: number): number { return nsZero(getCurves(store, b).ns, tenorYears); }
export function fear(store: StoreRead): number { return getGlobalMacro(store).fearIndex; }
export function factorJumps(store: StoreRead, tick: Tick): { bloc: BlocId; equityJump: number; fxValueJump: number; causeId: string }[] {
  return releaseRiskReactions(store, tick).map((r) => ({ bloc: r.bloc, equityJump: r.equityJump, fxValueJump: r.fxValueJump, causeId: r.releaseId }));
}
/** key = `<target>` (WORLD shocks) or `<target>:<bloc>`. */
export function macroValueShocks(store: StoreRead, key: string, tick: Tick): number {
  const i = key.lastIndexOf(':'), tail = i < 0 ? '' : key.slice(i + 1), b = BLOC_ORDER.find((x) => x === tail);
  return b ? activeShockSum(store, key.slice(0, i), b, tick) : activeShockSum(store, key, 'WORLD', tick);
}
export function marketHookCalls(store: StoreRead, tick: Tick): HookCall[] { return hookCallsFor(store, '05', tick); }
export function npcPoolOrders(store: StoreRead, tick: Tick): NpcPoolOrder[] {
  return [...store.index<NpcPoolOrder>(macroTables.poolOrder.name, 'tick', String(tick).padStart(12, '0'))].sort(byId);
}
/** T04-07 MANDATE_SELL rows (05 sells over args.tradingDays from args.startDay) delivered at `tick`. T04-09 rebalancing reaches 05 as RESERVE_REBAL pool orders (npcPoolOrders). */
export function scheduledMandateFlows(store: StoreRead, tick: Tick): HookCall[] { return hookCallsFor(store, '05', tick).filter((h) => h.hook === 'MANDATE_SELL'); }
export function issuanceCalendar(store: StoreRead, b: BlocId, fromTick: Tick, toTick: Tick): SovAuction[] {
  return [...store.index<SovAuction>(macroTables.auction.name, 'govId', govId(b))].filter((a) => a.auctionTick >= fromTick && a.auctionTick <= toTick)
    .sort((x, y) => x.auctionTick - y.auctionTick || byId(x, y));
}
