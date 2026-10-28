// T04-22 (E-92 (5), E-93 (6), E-94 (c), E-103 (1)/(2)): the authored institutions of 03 §3.1 item 1 and the opening balance sheets
// of the treasuries and central banks. Amounts are Quant ratio params × genesis nominal GDP, so they scale with S0.
import { EngineFault, fromMoney, toMoney, type Id, type Money, type ParamsView, type PhaseCtx } from '@tycoon/engine-core';
import { cbkId, govId } from '@tycoon/engine-ledger';
import { BLOC_DEFAULTS } from './blocs';
import { genesisNominalGdp } from './core/genesis';
import { crtId, regId, STAB_ID } from './ids';
import { registerEntity } from './rules/t03Stubs';
import { BLOC_ORDER, type BlocId } from './schema';

export const EXA_ID = 'sys_EXA' as const;
export const WORLD_COURT_IDS = Object.freeze(['crt_MCC', 'crt_GCB', 'crt_TCHA'] as const);

/** Step 1 specs in order: reg_<B>, crt_<B> per bloc (home ccy), then sys_EXA, sys_STAB and the world courts (FDL). All ownerless. */
const SPECS: readonly { id: Id; reportingCcy: BlocId }[] = Object.freeze([
  ...BLOC_ORDER.flatMap((b) => [{ id: regId(b), reportingCcy: BLOC_DEFAULTS[b].ccy }, { id: crtId(b), reportingCcy: BLOC_DEFAULTS[b].ccy }]),
  ...[EXA_ID, STAB_ID, ...WORLD_COURT_IDS].map((id) => ({ id, reportingCcy: 'FDL' as const })),
]);
/** The 15 ids of step 1, in registration order. */
export const MACRO_INSTITUTION_IDS: readonly Id[] = Object.freeze(SPECS.map((s) => s.id));

/** Step 1. Idempotent (T03-28 registerEntity). homeBloc is not in RegisterEntitySpec (T03-08), so it is not passed. */
export function registerMacroInstitutions(ctx: PhaseCtx): void {
  for (const s of SPECS) registerEntity(ctx, { id: s.id, reportingCcy: s.reportingCcy, ownerId: null });
}

/** p.num(key), throwing MAC_PARAM_RANGE outside [lo, hi] (NaN included). */
function ratio(p: ParamsView, key: string, lo: number, hi: number): number {
  const v = p.num(key);
  if (!(v >= lo && v <= hi)) throw new EngineFault('MAC_PARAM_RANGE', `${key} = ${v} outside [${lo}, ${hi}]`);
  return v;
}

/** toMoney(mac_gov_cash0_gdp_b × nominalGdp0_b, ccy_b). */
export function openingTreasuryCash(b: BlocId, S0: number, p: ParamsView): Money {
  return toMoney(ratio(p, `mac_gov_cash0_gdp_${b}`, 0, 0.25) * fromMoney(genesisNominalGdp(b, S0, p)), BLOC_DEFAULTS[b].ccy);
}
/** toMoney(cover_b × openness_b × nominalGdp0_b × fx0_b / 13, 'FDL'), left to right. */
export function openingReservesFdl(b: Exclude<BlocId, 'FDL'>, S0: number, p: ParamsView): Money {
  const d = BLOC_DEFAULTS[b];
  return toMoney(ratio(p, `mac_cbk_reserve_cover0_${b}`, 0, 36) * d.openness * fromMoney(genesisNominalGdp(b, S0, p)) * d.fx0 / 13, 'FDL');
}
/** toMoney(mac_gov_fdlcash0_gdp_SRL × nominalGdp0_SRL × fx0_SRL, 'FDL'), left to right (E-94 (c), E-103 (2)). */
export function openingSrlFdlCash(S0: number, p: ParamsView): Money {
  return toMoney(ratio(p, 'mac_gov_fdlcash0_gdp_SRL', 0, 0.05) * fromMoney(genesisNominalGdp('SRL', S0, p)) * BLOC_DEFAULTS.SRL.fx0, 'FDL');
}

/** Step 2. Every amount is computed (and range-checked) before the first mint; zero amounts post nothing. */
export function postOpeningBalanceSheets(ctx: PhaseCtx, p: ParamsView, S0: number): void {
  const mints: { to: Id; amt: Money; ccy: BlocId }[] = [];
  for (const b of BLOC_ORDER) {
    mints.push({ to: govId(b), amt: openingTreasuryCash(b, S0, p), ccy: BLOC_DEFAULTS[b].ccy });
    if (b === 'SRL') mints.push({ to: govId(b), amt: openingSrlFdlCash(S0, p), ccy: 'FDL' });
    if (b !== 'FDL') mints.push({ to: cbkId(b), amt: openingReservesFdl(b, S0, p), ccy: 'FDL' });
  }
  for (const m of mints) if (m.amt > 0n) ctx.ledger.mint(m.to, m.amt, m.ccy, 'MAC_GENESIS_ENDOWMENT');
}
