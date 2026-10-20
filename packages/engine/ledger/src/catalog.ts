import { SortedMap, cmpStr } from './det';
import { ALIAS_SEED, CATALOG_SEED } from './catalog-data';

export type FlowClass = 'FAUCET' | 'SINK' | 'TRANSFER' | 'CREDIT_CREATE' | 'CREDIT_DESTROY' | 'REVALUE';
export const FLOW_CLASSES: readonly FlowClass[] = ['CREDIT_CREATE', 'CREDIT_DESTROY', 'FAUCET', 'REVALUE', 'SINK', 'TRANSFER'];
export type TemplateId =
  | 'PAY' | 'SWAP_ASSET' | 'MINT' | 'BURN' | 'ELASTIC_IN' | 'ELASTIC_OUT' | 'LEND' | 'REPAY'
  | 'CB_CREDIT' | 'CB_CREDIT_UNWIND' | 'ACCRUE' | 'ACCRUE_PAIR' | 'FX' | 'MOVE_QTY' | 'RECLASS'
  | 'ESCROW_PLACE' | 'ESCROW_SETTLE' | 'CONTROL_RECLASS'; // errata E-5 (Δ14 escrow, Δ9 control)
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
  TRANSFER: ['PAY', 'SWAP_ASSET', 'FX', 'MOVE_QTY', 'ESCROW_PLACE', 'ESCROW_SETTLE'],
  CREDIT_CREATE: ['LEND', 'CB_CREDIT'], CREDIT_DESTROY: ['REPAY', 'CB_CREDIT_UNWIND'],
  REVALUE: ['ACCRUE', 'ACCRUE_PAIR', 'RECLASS', 'CONTROL_RECLASS'],
};
/** Errata E-12 layer 1: codes that may only be posted by escrowPlace; never PAY, never a supporting leg, never extended. */
export const ESCROW_ONLY_CODES: readonly string[] = ['CONFLICT_CASH_LOOT', 'CONFLICT_RANSOM'];

/**
 * Errata E-11 value-leg authority (Systems ruling; PENDING PRODUCER SIGN-OFF). Applies to SWAP_ASSET, ACCRUE, ACCRUE_PAIR, RECLASS.
 * FIXED: a concrete catalog leg; an override/positional arg must equal it. REQUIRED: '@ASSET'/'@', the caller supplies it.
 * CLASS: a card-declared set (only ACCRUE_PAIR per T03-07:92 / T03-15:60). QTY_ONLY: '-'/'-' RECLASS rows, no value leg at all.
 * TODO(systems): the T03-15 settleAccrual A/B swap set and the T03-14 (e.g. OCI → 3400) sets are not in the reference; not built.
 */
export type LegPolicy = { kind: 'FIXED'; acct: number } | { kind: 'REQUIRED'; marker: '@ASSET' | '@' } | { kind: 'CLASS'; allowed: readonly number[] } | { kind: 'QTY_ONLY' };
export const ACCRUE_PAIR_CLASS = { A: [1100, 1110], B: [2510, 2520, 2540] } as const;
export function legPolicy(row: CodeRow, tpl: TemplateId, side: 'A' | 'B'): LegPolicy {
  if (tpl === 'ACCRUE_PAIR') return { kind: 'CLASS', allowed: ACCRUE_PAIR_CLASS[side] };
  const l = side === 'A' ? row.valueLegA : row.valueLegB;
  if (typeof l === 'number') return { kind: 'FIXED', acct: l };
  if (l === '@ASSET' || l === '@') return { kind: 'REQUIRED', marker: l };
  return { kind: 'QTY_ONLY' };
}

/**
 * Codes the ledger (owner 03) registers through registerReasonCodes at world creation: §2.5 Δ9 / Δ13 control memo codes and
 * §6.11 Δ14 escrow settlement codes (errata E-5, E-10 note 3). Legs: TODO(systems) — the release P&L legs come from the
 * escrow's original CONFLICT_* code (E-10 note), not from these rows.
 */
export const LEDGER_EXTENSION_CODES: readonly CodeRow[] = [
  ...['LED_CONTROL_IN', 'LED_CONTROL_OUT', 'LED_HOLDER_RECLASS'].map((code): CodeRow => ({
    code, cls: 'REVALUE', owner: 3, cf: 'NC', allowedTemplates: ['CONTROL_RECLASS'], descriptionKey: `led.code.${code}`, restrictedOk: false, requestableBy: [], illicit: false })),
  ...['ESCROW_CONFLICT_CLAWBACK', 'ESCROW_CONFLICT_RELEASE'].map((code): CodeRow => ({
    code, cls: 'TRANSFER', owner: 3, cf: 'OP', allowedTemplates: ['ESCROW_SETTLE'], descriptionKey: `led.code.${code}`, restrictedOk: false, requestableBy: [13], illicit: false })),
];

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
  | 'PREFIX_CLASS_MISMATCH' | 'NAME_TAKEN' | 'OWNER_MISMATCH' | 'CLASS_MISMATCH' | 'TEMPLATE_CLASS_MISMATCH' | 'NO_TEMPLATE' | 'CATALOG_FROZEN' | 'ESCROW_ONLY';

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
    if (seed === CATALOG_SEED) for (const cls of ['REVALUE', 'TRANSFER'] as const) {
      const errs = this.registerReasonCodes(3, cls, LEDGER_EXTENSION_CODES.filter((r) => r.cls === cls));
      if (errs.length) throw new Error(`ledger extension codes: ${errs.join('; ')}`);
    }
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
    if (ESCROW_ONLY_CODES.includes(r.code)) return 'ESCROW_ONLY'; // E-12 layer 1 (unreachable while the seed holds them; defence in depth)
    if (r.owner !== module) return 'OWNER_MISMATCH';
    if (r.cls !== cls) return 'CLASS_MISMATCH';
    if ((r.code.startsWith('FAUCET_') && cls !== 'FAUCET') || (r.code.startsWith('SINK_') && cls !== 'SINK')) return 'PREFIX_CLASS_MISMATCH';
    if (r.allowedTemplates.length === 0) return 'NO_TEMPLATE';
    if (r.allowedTemplates.some((t) => !CLASS_TEMPLATES[cls].includes(t))) return 'TEMPLATE_CLASS_MISMATCH';
    return null;
  }
}
