// T04-18 steps 5-6: hook calls other modules implement (04 §3.16.6) and the crisis-specific policy responses.
// A hook the card gives two owners (RESCUE_MERGER_PROPOSAL 16+07, CYBERCERT_PATCH 12+13, ltvTighten 07+10, consensusEpsShock 06+09) is
// written once per owner by fireResponse/the catalog; HOOKS lists the first owner (09 is not a HookCall owner, so consensusEpsShock goes to 06 only).
import { EngineFault, fromMoney, TICKS_PER_GAME_DAY, toMoney, type PhaseCtx, type StoreRead, type Tick } from '@tycoon/engine-core';
import { cbkId } from '@tycoon/engine-ledger';
import { HOOK_CALL_TABLE, macroTables, type BlocMacroState, type CentralBank, type HookCall, type WorldEvent } from '../schema';
import { canAgreeConcord, openConcord } from './concord';
import type { ResponseKey } from './crisisCatalog';
import { macroprudentialRelease, openLtro } from './macroprudential';
import { addProgram } from './programs';

const D = TICKS_PER_GAME_DAY;
const h = (owner: HookCall['owner'], ...args: string[]): { owner: HookCall['owner']; args: readonly string[] } => ({ owner, args });
export const HOOKS: Readonly<Record<string, { owner: HookCall['owner']; args: readonly string[] }>> = Object.freeze({
  erpShock: h('06', 'bloc', 'sector', 'deltaPremium', 'halfLifeDays'),
  corporatePdMultiplier: h('07', 'bloc', 'mult', 'days'),
  depositConfidenceShock: h('07', 'bankIds', 'delta'),
  repoHaircutShock: h('07', 'assetKind', 'deltaPts', 'days'),
  stablecoinDepeg: h('06', 'assetId', 'target', 'days'),
  venueCollapse: h('06', 'venueId'),
  commoditySupplyShock: h('06', 'commodityId', 'pct', 'days'),
  aiRaceIndexShock: h('11', 'delta'),
  makerWithdrawal: h('05', 'assetFilter', 'depthMult', 'ticks'),
  npcSellProgram: h('05', 'assetFilter', 'advPerTick', 'ticks'),
  housePriceShock: h('10', 'cityIds', 'pct', 'days'),
  transactionFreeze: h('10', 'cityIds', 'level', 'days'),
  correlationShock: h('08', 'poolKind', 'delta'),
  pdShock: h('08', 'poolKind', 'mult', 'days'),
  zeroDay: h('12', 'severity'),
  politicalStabilityShock: h('16', 'bloc', 'delta', 'days'),
  fiscalProgramProposal: h('16', 'program'),
  ltvTighten: h('07', 'bloc', 'delta'),
  consensusEpsShock: h('06', 'delta'),
  WIRE_ITEM: h('16', 'key'),
  HOLDOUT_CLAIM: h('13', 'holderId', 'govId', 'offerId', 'claimFace', 'parDifference'),
  MANDATE_SELL: h('05', 'govId', 'assetIds', 'qtyPerDay', 'tradingDays', 'startDay'),
  DEPOSIT_GUARANTEE_RAISE: h('07', 'bloc'),
  RESCUE_MERGER_PROPOSAL: h('16', 'bloc'),
  CYBERCERT_PATCH: h('12', 'eventId'),
});

/** E-105 (T04-18 step 5): source ids of the six non-WorldEvent writers (`<day>` = ⌊tick / D⌋). Every composite id has ≥ 2 underscores,
 *  so it cannot collide with a `newId` digest id (`<kind>_<26 base32>`, one underscore); the kinds below are reserved for newId. */
export const RESERVED_ID_KINDS: readonly string[] = Object.freeze(['cwk', 'ycp', 'igx']);
export const crisisWeekSourceId = (startTick: Tick): string => `cwk_WORLD_${Math.floor(startTick / D)}`;
export const yccPressureSourceId = (b: string, tick: Tick): string => `ycp_${b}_${Math.floor(tick / D)}`;
export const igExclusionSourceId = (b: string, tick: Tick): string => `igx_${b}_${Math.floor(tick / D)}`;
export const trancheSourceId = (programId: string | undefined, k: number): string => {
  if (programId === undefined || programId === '' || !(k >= 1)) throw new EngineFault('MAC_STATE_MISSING', `CSF tranche source id without a program id or k ≥ 1`, [programId ?? '', String(k)]);
  return `${programId}_t${k}`;
};

/** Hooks the card gives two owners (written once per owner). */
const OWNERS: Readonly<Record<string, readonly HookCall['owner'][]>> = Object.freeze({ RESCUE_MERGER_PROPOSAL: ['16', '07'], CYBERCERT_PATCH: ['12', '13'], ltvTighten: ['07', '10'] });
/** The owners a hook may be written to ([] for an unknown hook). */
export const ownersOf = (hook: string): readonly HookCall['owner'][] => OWNERS[hook] ?? (HOOKS[hook] === undefined ? [] : [HOOKS[hook].owner]);
/** The only writer of mac.hookCall (E-105). Card Done: "no hook without a worldEventId"; and every hook is a §3.16.6 name, written to one of its owners, with every named arg. */
export function writeHook(ctx: PhaseCtx, owner: HookCall['owner'], hook: string, args: HookCall['args'], worldEventId: string): HookCall {
  const def = HOOKS[hook];
  if (typeof worldEventId !== 'string' || worldEventId === '') throw new EngineFault('MAC_STATE_MISSING', `hook ${hook} without a worldEventId`, [hook]);
  if (def === undefined) throw new EngineFault('MAC_STATE_MISSING', `unknown hook ${hook}`, [hook, worldEventId]);
  if (!ownersOf(hook).includes(owner)) throw new EngineFault('MAC_STATE_MISSING', `hook ${hook} owner ${owner}`, [hook, worldEventId]);
  for (const a of def.args) if (args[a] === undefined) throw new EngineFault('MAC_STATE_MISSING', `hook ${hook} without arg ${a}`, [hook, worldEventId]);
  const row: HookCall = { id: ctx.newId('hook'), owner, hook, args, worldEventId, createdTick: ctx.tick, startTick: ctx.tick + 1 };
  ctx.store.put<HookCall>(HOOK_CALL_TABLE.name, row);
  return row;
}
export function hookCallsFor(store: StoreRead, owner: HookCall['owner'], tick: Tick): HookCall[] {
  return [...store.index<HookCall>(HOOK_CALL_TABLE.name, 'owner', owner)].filter((r) => r.startTick === tick).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Every mac.hookCall row (read-only; harness and tests). */
export const allHookCalls = (store: StoreRead): HookCall[] => [...store.iter<HookCall>(HOOK_CALL_TABLE.name)];

const RESP = 'response.';
const mark = (ctx: PhaseCtx, ev: WorldEvent, key: ResponseKey, refs: string[]): void => {
  const cur = ctx.store.get<WorldEvent>(macroTables.event.name, ev.id) ?? ev;
  ctx.store.put<WorldEvent>(macroTables.event.name, { ...cur, causeChain: [...cur.causeChain, { tick: ctx.tick, key: RESP + key, refs }] });
};
/** Step 6. True when something fired (recorded as a `response.<KEY>` causeChain entry, the POLICY signal). Automatic-rule keys fire nothing. */
export function fireResponse(ctx: PhaseCtx, ev: WorldEvent, key: ResponseKey): boolean {
  const refs: string[] = [];
  for (const b of ev.blocs) {
    switch (key) {
      case 'CCYB_RELEASE': macroprudentialRelease(ctx, b); refs.push(b); break;
      case 'QE_CORP_IG': case 'QE_ABS': refs.push(b); break;   // the mark is the override record read at the next meeting
      case 'LTRO': openLtro(ctx, b, ev.plannedEndTick, 'CRISIS_POLICY'); refs.push(b); break;
      case 'DEPOSIT_GUARANTEE': refs.push(writeHook(ctx, '07', 'DEPOSIT_GUARANTEE_RAISE', { bloc: b }, ev.id).id); break;
      case 'RESCUE_MERGERS': refs.push(writeHook(ctx, '16', 'RESCUE_MERGER_PROPOSAL', { bloc: b }, ev.id).id, writeHook(ctx, '07', 'RESCUE_MERGER_PROPOSAL', { bloc: b }, ev.id).id); break;
      case 'ENERGY_SUBSIDY': refs.push(writeHook(ctx, '16', 'fiscalProgramProposal', { program: `ENERGY_SUBSIDY:${b}` }, ev.id).id); break;
      case 'CONCORD': if (canAgreeConcord(ctx.store, b) && openConcord(ctx, b, ev.kind === 'CURRENCY_CRISIS' ? 'BREAK_PENDING' : 'SPREAD')) refs.push(b); break;
      case 'FISCAL_SUPPORT': if (b === 'PYN') {
        const st = ctx.store.get<BlocMacroState>(macroTables.bloc.name, b);
        if (!st) break;
        const yrs = (ev.plannedEndTick - ctx.tick) / (364 * D);
        addProgram(ctx, { id: `fp_${b}_crs_${ev.id}`, bloc: b, kind: 'INDUSTRIAL_SUBSIDY', sizeGdpPerYear: 0.005, sectorDemand: {}, budget: toMoney(0.005 * yrs * fromMoney(st.nominalGdp), b),
          spent: 0n, startTick: ctx.tick, endTick: ev.plannedEndTick, source: 'CRISIS_RESPONSE', sponsorActorIds: [] }, false);
        refs.push(b);
      } break;
      default: break;   // RULE_CUTS, RULE_HIKES, LOOK_THROUGH_ENERGY, BREAK_RULE, ELA, CIRCUIT_BREAKERS, NONE, AUSTERITY, SWAP_LINES, LTV_RELEASE, HOUSING_PROGRAM
    }
  }
  if (key === 'CYBERCERT_PATCH') refs.push(writeHook(ctx, '12', 'CYBERCERT_PATCH', { eventId: ev.id }, ev.id).id, writeHook(ctx, '13', 'CYBERCERT_PATCH', { eventId: ev.id }, ev.id).id);
  if (!refs.length) return false;
  mark(ctx, ev, key, refs);
  return true;
}
/** A fired response on the event, or a CB emergency decision of one of its blocs at or after the trigger. */
export function crisisResponseFired(store: StoreRead, ev: WorldEvent): boolean {
  const cur = store.get<WorldEvent>(macroTables.event.name, ev.id) ?? ev;
  if (cur.causeChain.some((c) => c.key.startsWith(RESP))) return true;
  return ev.blocs.some((b) => (store.get<CentralBank>(macroTables.cb.name, cbkId(b))?.lastDecisions ?? []).some((d) => d.emergency && d.tick >= ev.triggerTick));
}
