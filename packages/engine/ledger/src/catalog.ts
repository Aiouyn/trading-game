import { SortedMap, cmpStr } from './det';
import { ALIAS_SEED, CATALOG_SEED } from './catalog-data';

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
  /** catalog v2 (T03-02 legend): default value legs; '@ASSET' / '@' = the caller passes the account; undefined = not used. */
  valueLegA?: number | '@ASSET' | '@'; valueLegB?: number | '@ASSET' | '@';
  elasticSectors?: string[]; restrictedOk?: boolean; requestableBy?: number[] | 'ALL'; illicit?: boolean;
}
type Leg = number | '@ASSET' | '@' | null;
/** One row of catalog.csv v2 (generated into catalog-data.ts). `derived` = class defaults, no card row (TODO(systems)). */
export interface CatalogSeedRow {
  code: string; cls: FlowClass; owner: number; cf: CashFlow | ''; tpl: readonly TemplateId[]; legA: Leg; legB: Leg;
  sectors: readonly string[]; restrictedOk: boolean; requestableBy: readonly number[] | 'ALL'; illicit: boolean;
  taxTag?: string; family?: string; derived?: true;
}

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
/** aliases.csv: 26 rows of 24 §8 + 2 of PD-12 (OPS_* -> CONFLICT_*). An alias is never postable (INV-LED-002). */
export const ALIASES: readonly (readonly [alias: string, target: string])[] = ALIAS_SEED.map(([a, t]) => [a, t.join(' ')] as const);
/** catalog v2 column R (03 §3.5.6): the 35 codes restricted cash may fund. */
export const RESTRICTED_OK_CODES: readonly string[] = CATALOG_SEED.filter((r) => r.restrictedOk).map((r) => r.code).sort(cmpStr);
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
    for (const r of seed) this.rows.set(r.code, {
      code: r.code, cls: r.cls, owner: r.owner, cf: r.cf, allowedTemplates: [...r.tpl], descriptionKey: `led.code.${r.code}`,
      valueLegA: r.legA ?? undefined, valueLegB: r.legB ?? undefined, elasticSectors: [...r.sectors], restrictedOk: r.restrictedOk,
      requestableBy: r.requestableBy === 'ALL' ? 'ALL' : [...r.requestableBy], illicit: r.illicit, taxTag: r.taxTag, stabilizerFamily: r.family,
    });
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
  /** The owner, or a module in the catalog v2 `requestableBy` column ('ALL' = any module). */
  mayRequest(code: string, module: number): boolean {
    const r = this.get(code); if (!r) return false;
    return r.owner === module || r.requestableBy === 'ALL' || (r.requestableBy?.includes(module) ?? false);
  }
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
