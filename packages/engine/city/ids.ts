// T10A-01: the E-26 id scheme (accepted by the Producer). Cities, districts, parcels and units are world records, not ledger
// entities, but every id satisfies the E-18/E-20 entity regex so it can appear in a posting ref or an event without migration.
import { EngineFault, type Id, type PhaseCtx } from '@tycoon/engine-core';

/** E-18/E-20: a 3-letter kind, or `hh` / `prop`, then `_` and [A-Za-z0-9_]+. */
export const ENTITY_ID_RE = /^(?:[a-z]{3}|hh|prop)_[A-Za-z0-9_]+$/;
export const ENTITY_ID_MAX_LEN = 64;

/** Throws CITY_BAD_ID unless `id` matches ENTITY_ID_RE and is at most 64 characters (runs at creation, card step 1). */
export function assertEntityId(id: string): void {
  if (id.length > ENTITY_ID_MAX_LEN) throw new EngineFault('CITY_BAD_ID', `id '${id}' is ${id.length} characters (> ${ENTITY_ID_MAX_LEN})`, [id]);
  if (!ENTITY_ID_RE.test(id)) throw new EngineFault('CITY_BAD_ID', `id '${id}' does not match ${ENTITY_ID_RE.source}`, [id]);
}
const checked = (id: Id): Id => { assertEntityId(id); return id; };

/** Authored, stable: 'cty_' + slug (e.g. cty_port_avalon). */
export const cityId = (slug: string): Id => checked(`cty_${slug}`);
/** Authored, stable: 'dst_' + city slug + '_' + district slug. */
export const districtId = (city: string, d: string): Id => checked(`dst_${city}_${d}`);
/** 'pcl_' + city slug + '_' + persistent feature seq (never the generator version, LC15). */
export function parcelId(city: string, seq: number): Id {
  if (!Number.isSafeInteger(seq) || seq < 0) throw new EngineFault('CITY_BAD_ID', `parcel seq ${seq} is not a non-negative integer`);
  return checked(`pcl_${city}_${seq}`);
}

/** The ctx part the generated ids need (02's deterministic ctx.newId(kind) = kind + '_' + 26-char ulid, T02-07). */
export type IdSource = Pick<PhaseCtx, 'newId'>;
export const unitId = (ctx: IdSource): Id => checked(ctx.newId('unt'));
export const buildingId = (ctx: IdSource): Id => checked(ctx.newId('bld'));
export const propId = (ctx: IdSource): Id => checked(ctx.newId('prop'));
export const leaseId = (ctx: IdSource): Id => checked(ctx.newId('lse'));

/** AC-10A-01-2: the allowed entity-id prefixes (E-26/E-27/E-30/E-33/E-38/E-39/E-40/E-44/E-46/E-50/E-52), in the card's order. */
export const ALLOWED_ENTITY_PREFIXES: readonly string[] = [
  'cty_', 'dst_', 'pcl_', 'bld_', 'unt_', 'lse_', 'prop_', 'unq_', 'lon_', 'dyn_', 'pty_', 'cau_', 'bil_', 'ele_', 'lob_', 'hst_', 'fct_', 'sec_',
  'brf_', 'brk_', 'mac_', 'mcl_', 'dfe_', 'lot_', 'csa_', 'esc_', 'clm_', 'ccp_', 'lst_', 'dev_', 'ofr_', 'prm_', 'psl_', 'lau_', 'mqt_', 'obj_',
  'mrl_', 'pln_', 'rdp_', 'tof_', 'mrg_', 'vrd_', 'rst_', 'mot_', 'lbo_', 'ipo_', 'srf_', 'opn_', 'hsn_', 'lgc_', 'anm_', 'dcp_', 'itl_', 'lab_',
  'cls_', 'dts_', 'res_', 'run_', 'mdl_', 'dep_', 'grf_', 'lic_', 'rpj_', 'evl_', 'chn_', 'wir_', 'brd_', 'lgr_', 'chp_', 'chl_', 'riv_', 'itp_', 'ics_'];
/** AC-10A-01-2: the pre-E-26 prefixes the lint rule `no-noncompliant-entity-prefix` rejects. */
// eslint-disable-next-line city/no-noncompliant-entity-prefix -- the rule's own deny list
export const NONCOMPLIANT_ENTITY_PREFIXES: readonly string[] = ['city_', 'dist_', 'unit_', 'loan_', 'uq_'];
