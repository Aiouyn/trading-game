import { SortedMap, cmpStr } from './det';
import { CATALOG_SEED } from './catalog-data';

export type FlowClass = 'FAUCET' | 'SINK' | 'TRANSFER' | 'CREDIT_CREATE' | 'CREDIT_DESTROY' | 'REVALUE';
export const FLOW_CLASSES: readonly FlowClass[] = ['CREDIT_CREATE', 'CREDIT_DESTROY', 'FAUCET', 'REVALUE', 'SINK', 'TRANSFER'];
export type TemplateId =
  | 'PAY' | 'SWAP_ASSET' | 'MINT' | 'BURN' | 'ELASTIC_IN' | 'ELASTIC_OUT' | 'LEND' | 'REPAY'
  | 'CB_CREDIT' | 'CB_CREDIT_UNWIND' | 'ACCRUE' | 'ACCRUE_PAIR' | 'FX' | 'MOVE_QTY' | 'RECLASS';
export type CashFlow = 'OP' | 'INV' | 'FIN' | 'NC';

/** Spec §2.3. `cf: ''` only for the six 24 §8 rows whose cf the source does not give (TODO(systems)). */
export interface CodeRow {
  code: string; cls: FlowClass; owner: number; cf: CashFlow | ''; allowedTemplates: TemplateId[];
  taxTag?: string; stabilizerFamily?: string; descriptionKey: string;
}
export type CatalogSeedRow = readonly [code: string, cls: FlowClass, owner: number, cf: CashFlow | '', tpl: readonly TemplateId[]];

/** 03 §3.3.3 last paragraph (T03-02 :47-48). */
export const CLASS_TEMPLATES: Readonly<Record<FlowClass, readonly TemplateId[]>> = {
  FAUCET: ['MINT', 'ELASTIC_IN'], SINK: ['BURN', 'ELASTIC_OUT'],
  TRANSFER: ['PAY', 'SWAP_ASSET', 'FX', 'MOVE_QTY'],
  CREDIT_CREATE: ['LEND', 'CB_CREDIT'], CREDIT_DESTROY: ['REPAY', 'CB_CREDIT_UNWIND'],
  REVALUE: ['ACCRUE', 'ACCRUE_PAIR', 'RECLASS'],
};

/** Systems answer (errata E-3): the only codes on CB_CREDIT / CB_CREDIT_UNWIND. They feed TickFlows.cbCredit. */
export const CBK_CREDIT_CODES: readonly string[] = [
  'CBK_ASSET_PURCHASE', 'CBK_EMERGENCY_LIQUIDITY', 'CBK_FX_INTERVENTION_BUY', 'CBK_OPEN_MARKET_LEND', 'CBK_STANDING_FACILITY',
];
export const CBK_UNWIND_CODES: readonly string[] = [
  'CBK_ASSET_SALE', 'CBK_EMERGENCY_LIQUIDITY_REPAY', 'CBK_FX_INTERVENTION_SELL', 'CBK_OPEN_MARKET_UNWIND', 'CBK_STANDING_FACILITY_REPAY',
];
/** PD-12: the 12 names are canonical; the 03 OPS_* names are deprecated aliases. TODO(systems): the other 24 §8 alias rows. */
export const ALIASES: readonly (readonly [alias: string, target: string])[] = [
  ['OPS_LOOT_CASH', 'CONFLICT_CASH_LOOT'], ['OPS_RANSOM', 'CONFLICT_RANSOM'],
];
/**
 * TODO(systems): restrictedOk is a catalog column (03 §3.5.6) missing from catalog.csv. Until it arrives, only the codes the
 * cards name as restrictedOk are listed (T03-02 :BIZ_PURCHASE_NEW, T03-03 :MKT_TRADE, T03-12 :LIFE_PURCHASE). Every other code is not.
 */
export const RESTRICTED_OK_CODES: readonly string[] = ['BIZ_PURCHASE_NEW', 'LIFE_PURCHASE', 'MKT_TRADE'];
/** T03-12: the faucets that credit restricted lots. */
export const RESTRICTED_FAUCETS: Readonly<Record<string, 'AD_GRANT' | 'FRESH_START'>> = {
  ACCT_FRESH_START: 'FRESH_START', ACCT_REWARDED_AD: 'AD_GRANT',
};

export type CatalogError =
  | 'PREFIX_CLASS_MISMATCH' | 'NAME_TAKEN' | 'OWNER_MISMATCH' | 'CLASS_MISMATCH' | 'TEMPLATE_CLASS_MISMATCH' | 'NO_TEMPLATE' | 'CATALOG_FROZEN';

/** One catalog per world (built from the seed, extended by registerReasonCodes, frozen when the world starts). */
export class ReasonCatalog {
  private readonly rows = new SortedMap<string, CodeRow>();
  private frozen = false;
  constructor(seed: readonly CatalogSeedRow[] = CATALOG_SEED) {
    for (const [code, cls, owner, cf, tpl] of seed)
      this.rows.set(code, { code, cls, owner, cf, allowedTemplates: [...tpl], descriptionKey: `led.code.${code}` });
  }
  get(code: string): CodeRow | undefined { return this.rows.get(code); }
  all(): CodeRow[] { return this.rows.values(); }
  countByClass(): Record<FlowClass, number> {
    const c = Object.fromEntries(FLOW_CLASSES.map((k) => [k, 0])) as Record<FlowClass, number>;
    for (const r of this.rows.values()) c[r.cls]++;
    return c;
  }
  resolveAlias(name: string): string | undefined { return ALIASES.find(([a]) => a === name)?.[1]; }
  templateAllowed(code: string, tpl: TemplateId): boolean { return this.get(code)?.allowedTemplates.includes(tpl) ?? false; }
  /** TODO(systems): requestableBy is not in catalog.csv, so only the owning module may request a code (spec §2.3 `owner`). */
  mayRequest(code: string, module: number): boolean { return this.get(code)?.owner === module; }
  freeze(): void { this.frozen = true; }

  /** R23 extension (T03-02 :51,122) with the Δ1 prefix rule (PD-1). Returns `${code}: ${error}` strings; [] when all rows registered. */
  registerReasonCodes(module: number, cls: FlowClass, rows: readonly CodeRow[]): string[] {
    const errs: string[] = [];
    for (const r of rows) {
      const e = this.check(module, cls, r);
      if (e) errs.push(`${r.code}: ${e}`);
    }
    if (errs.length === 0) for (const r of rows) this.rows.set(r.code, { ...r, allowedTemplates: [...r.allowedTemplates] });
    return errs.sort(cmpStr);
  }
  private check(module: number, cls: FlowClass, r: CodeRow): CatalogError | null {
    if (this.frozen) return 'CATALOG_FROZEN';
    if (this.rows.has(r.code) || this.resolveAlias(r.code)) return 'NAME_TAKEN';
    if (r.owner !== module) return 'OWNER_MISMATCH';
    if (r.cls !== cls) return 'CLASS_MISMATCH';
    if ((r.code.startsWith('FAUCET_') && cls !== 'FAUCET') || (r.code.startsWith('SINK_') && cls !== 'SINK')) return 'PREFIX_CLASS_MISMATCH';
    if (r.allowedTemplates.length === 0) return 'NO_TEMPLATE';
    if (r.allowedTemplates.some((t) => !CLASS_TEMPLATES[cls].includes(t))) return 'TEMPLATE_CLASS_MISMATCH';
    return null;
  }
}
