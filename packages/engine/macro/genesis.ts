// T04-21 steps 5-7: the 16 world entities 04 owns, the Concord fund endowment (Σ quotas × 3) and the module genesis order.
import { toMoney, type Id, type Money, type ParamsView, type PhaseCtx } from '@tycoon/engine-core';
import { cbkId, govId } from '@tycoon/engine-ledger';
import { BLOC_DEFAULTS } from './blocs';
import { macroGenesis } from './core/genesis';
import { CSF_ID, DEALER_POOL_ID } from './ids';
import type { MacroPorts } from './ports';
import { scaleTarget } from './rules/scale';
import { registerEntity } from './rules/t03Stubs';
import { postOpeningBalanceSheets, registerMacroInstitutions } from './rules/t0422Stubs';
import { BLOC_ORDER, type BlocId } from './schema';

/** 04 §3.13.6: quota = 2% of bloc GDP. */
export const CSF_QUOTA_SHARE = 0.02;
/** Lending capacity = Σ quotas × 3. */
export const CSF_CAPACITY_MULT = 3;

/** Step 5: per bloc gov (no owner), cbk (owner gov), dealer pool (no owner), then npc_CSF (FDL). 16 idempotent calls; ids in call order.
 *  homeBloc is not passed: T03-08 RegisterEntitySpec has no such field (as T04-22). */
export function registerMacroEntities(ctx: PhaseCtx): Id[] {
  const ids: Id[] = [];
  for (const b of BLOC_ORDER) {
    const reportingCcy = BLOC_DEFAULTS[b].ccy;
    ids.push(registerEntity(ctx, { id: govId(b), reportingCcy, ownerId: null }));
    ids.push(registerEntity(ctx, { id: cbkId(b), reportingCcy, ownerId: govId(b) }));
    ids.push(registerEntity(ctx, { id: DEALER_POOL_ID(b), reportingCcy, ownerId: null }));
  }
  ids.push(registerEntity(ctx, { id: CSF_ID, reportingCcy: 'FDL', ownerId: null }));
  return ids;
}

/** Step 6: quota_b = toMoney(((0.02 × macro_world_gdp_ref) × S0) × gdpShare0_b, 'FDL'), BLOC_ORDER, no FX round trip. */
export function csfQuotas0(S0: number, p: ParamsView): Record<BlocId, Money> {
  const q = {} as Record<BlocId, Money>;
  for (const b of BLOC_ORDER) q[b] = toMoney(((CSF_QUOTA_SHARE * p.num('macro_world_gdp_ref')) * S0) * BLOC_DEFAULTS[b].gdpShare0, 'FDL');
  return q;
}
/** Σ csfQuotas0 × 3, summed in bigint. */
export function csfEndowment0(S0: number, p: ParamsView): Money {
  const q = csfQuotas0(S0, p);
  let s = 0n;
  for (const b of BLOC_ORDER) s += q[b];
  return BigInt(CSF_CAPACITY_MULT) * s;
}

/** Step 7: reason codes come from services.reasonCodes (E-92 (4)); entities; T04-22 institutions and opening sheets; Concord; macroGenesis last. */
export function macroModuleGenesis(ctx: PhaseCtx, ports: MacroPorts): void {
  const p = ctx.params;
  const S0 = scaleTarget(0, p);   // MISSING EXPORT: T22 players.activityWeighted -> N_a = 0, as T04-20 macroGenesis
  registerMacroEntities(ctx);
  registerMacroInstitutions(ctx);
  postOpeningBalanceSheets(ctx, p, S0);
  ctx.ledger.mint(CSF_ID, csfEndowment0(S0, p), 'FDL', 'MAC_GENESIS_ENDOWMENT');
  macroGenesis(ctx, ports);
}
