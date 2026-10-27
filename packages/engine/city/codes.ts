// T10A-01 step 4: the 10A reason-code bindings (E-26/E-28/E-29). 10's §3.7.2/§3.17/§3.25 names are aliases onto 03 catalog rows
// (export/ledger-ref/aliases.csv); naming rights post the catalog code directly. 10B codes (RE_TXN_COST, RE_LAND_SALE, RE_PERMIT_FEE,
// RE_CONSTRUCTION_PAY, RE_UNIQUE_SALE, RE_MORTGAGE_*, RE_PREPAY_FEE) are out of scope.
import type { ReasonCatalog } from '@tycoon/engine-ledger';

/** alias → catalog targets, as the card lists them (E-26). */
export const CITY_REASON_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  RE_RENT_IN: ['PROP_RENT_ELASTIC', 'PROP_RENT_CORE'],      // ELASTIC for hh/frm/npc tenants, CORE for player entities (10 §3.7.2)
  RE_PROPERTY_TAX: ['TAX_PROPERTY'],
  RE_STAMP_DUTY: ['TAX_STAMP_DUTY'],
  RE_MAINTENANCE: ['PROP_UPKEEP', 'PROP_UPKEEP_B2B'],
  RE_MGMT_FEE: ['PROP_MANAGEMENT_FEE_NPC', 'PROP_MANAGEMENT_FEE_B2B'],
  RE_VACANT_COST: ['PROP_VACANT_UTILITIES'],                // E-28: SINK on 5030
  RE_COSMETIC: ['CITY_COSMETIC'],                           // BURN, 5200 chr / 5050 company
});
/** In byte order (cmpStr) of the alias name. */
export const CITY_REASON_ALIAS_NAMES: readonly string[] = ['RE_COSMETIC', 'RE_MAINTENANCE', 'RE_MGMT_FEE', 'RE_PROPERTY_TAX', 'RE_RENT_IN', 'RE_STAMP_DUTY', 'RE_VACANT_COST'];
/** Catalog codes 10A posts by name (no alias): naming rights, TRANSFER to gov (E-29). */
export const CITY_DIRECT_CODES: readonly string[] = ['CITY_NAMING_RIGHT'];

/** AC-10A-01-4: the 10A codes with no catalog row. Empty by ruling (E-26). */
export const CATALOG_GAPS_10A: readonly string[] = Object.freeze([]);

/** Every 10A alias and direct code that does not resolve to a catalog row in `cat` (alias targets must equal CITY_REASON_ALIASES). */
export function catalogGaps10A(cat: Pick<ReasonCatalog, 'get' | 'resolveAlias'>): string[] {
  const gaps: string[] = [];
  for (const a of CITY_REASON_ALIAS_NAMES) {
    const want = CITY_REASON_ALIASES[a]!;
    const got = cat.resolveAlias(a);
    if (got !== want.join(' ') || want.some((t) => cat.get(t) === undefined)) gaps.push(a);
  }
  for (const c of CITY_DIRECT_CODES) if (cat.get(c) === undefined) gaps.push(c);
  return gaps;
}
