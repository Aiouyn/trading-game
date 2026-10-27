import { SortedMap, cmpStr } from './det';
import { ALIAS_SEED, CATALOG_SEED } from './catalog-data';
import { chartEntry } from './accounts';

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
 * Codes the ledger (owner 03) registers through registerReasonCodes at world creation: §2.5 Δ9 / Δ13 control memo codes and
 * §6.11 Δ14 escrow settlement codes (errata E-5, E-10 note 3). Legs: TODO(systems) — the release P&L legs come from the
 * escrow's original CONFLICT_* code (E-10 note), not from these rows.
 */
export const LEDGER_EXTENSION_CODES: readonly CodeRow[] = [
  ...['LED_CONTROL_IN', 'LED_CONTROL_OUT', 'LED_HOLDER_RECLASS'].map((code): CodeRow => ({
    code, cls: 'REVALUE', owner: 3, cf: 'NC', allowedTemplates: ['CONTROL_RECLASS'], descriptionKey: `reason.${code}`, restrictedOk: false, requestableBy: [], illicit: false })),
  ...['ESCROW_CONFLICT_CLAWBACK', 'ESCROW_CONFLICT_RELEASE'].map((code): CodeRow => ({
    code, cls: 'TRANSFER', owner: 3, cf: 'OP', allowedTemplates: ['ESCROW_SETTLE'], descriptionKey: `reason.${code}`, restrictedOk: false, requestableBy: [13], illicit: false })),
];

/** Systems answer (errata E-3): the only codes on CB_CREDIT / CB_CREDIT_UNWIND. They feed TickFlows.cbCredit. */
export const CBK_CREDIT_CODES: readonly string[] = [
  'CBK_ASSET_PURCHASE', 'CBK_EMERGENCY_LIQUIDITY', 'CBK_FX_INTERVENTION_BUY', 'CBK_OPEN_MARKET_LEND', 'CBK_STANDING_FACILITY',
];
export const CBK_UNWIND_CODES: readonly string[] = [
  'CBK_ASSET_SALE', 'CBK_EMERGENCY_LIQUIDITY_REPAY', 'CBK_FX_INTERVENTION_SELL', 'CBK_OPEN_MARKET_UNWIND', 'CBK_STANDING_FACILITY_REPAY',
];
/** aliases.csv (24 §8 and PD-12 OPS_* -> CONFLICT_*). An alias is never postable (INV-LED-002). */
export const ALIASES: readonly (readonly [alias: string, target: string])[] = ALIAS_SEED.map(([a, t]) => [a, t.join(' ')] as const);
/** catalog.csv column restrictedOk (03 §3.5.6): the codes restricted cash may fund (44 in the E-85 seed). */
export const RESTRICTED_OK_CODES: readonly string[] = CATALOG_SEED.filter((r) => r.restrictedOk).map((r) => r.code).sort(cmpStr);
/** E-82: the codes with `illicit: true` in the seed (no hand list). */
export const ILLICIT_CODES: readonly string[] = CATALOG_SEED.filter((r) => r.illicit).map((r) => r.code).sort(cmpStr);
/** T03-12: the faucets that credit restricted lots. */
export const RESTRICTED_FAUCETS: Readonly<Record<string, 'AD_GRANT' | 'FRESH_START'>> = {
  ACCT_FRESH_START: 'FRESH_START', ACCT_REWARDED_AD: 'AD_GRANT',
};

export type CatalogError =
  | 'PREFIX_CLASS_MISMATCH' | 'NAME_TAKEN' | 'OWNER_MISMATCH' | 'CLASS_MISMATCH' | 'TEMPLATE_CLASS_MISMATCH' | 'NO_TEMPLATE' | 'CATALOG_FROZEN' | 'ESCROW_ONLY'
  // E-82 AC-03-02-CATALOG-CHECKS: (a) seed and alias checks of the constructor; (b) the T03-02 validateCodeEntry rules.
  | 'DUPLICATE' | 'ALIAS_TARGET_MISSING' | 'ALIAS_SHADOWS_CODE'
  | 'BAD_CODE' | 'ELASTIC_SECTORS_MISMATCH' | 'REVALUE_CF_NOT_NC' | 'LEG_NOT_IN_CHART' | 'MINT_BURN_LEG_B'
  // E-85: names for the card's owner and cf rules.
  | 'BAD_OWNER' | 'BAD_CF';

const ELASTIC: readonly TemplateId[] = ['ELASTIC_IN', 'ELASTIC_OUT'];
const MINT_BURN: readonly TemplateId[] = ['MINT', 'BURN'];
const LEG_MARKERS: readonly string[] = ['@ASSET', '@'];
const CASH_FLOWS: readonly CashFlow[] = ['OP', 'INV', 'FIN', 'NC'];
const NPC_COUNTERPARTY: readonly TemplateId[] = ['PAY', 'SWAP_ASSET'];
/**
 * E-85 (c), structural (replaces E-82's "sectors non-empty exactly when an ELASTIC template is allowed"):
 * 1. a row allowing ELASTIC_IN / ELASTIC_OUT has non-empty elasticSectors;
 * 2. a row with non-empty elasticSectors and no ELASTIC template is TRANSFER with every template in {PAY, SWAP_ASSET}
 *    (the sectors name the NPC-sector counterparty, E-39 / E-44 / E-46). Sectors stay optional on TRANSFER.
 */
function sectorsOk(r: CodeRow): boolean {
  const sectors = (r.elasticSectors ?? []).length > 0;
  if (r.allowedTemplates.some((t) => ELASTIC.includes(t))) return sectors;
  return !sectors || (r.cls === 'TRANSFER' && r.allowedTemplates.every((t) => NPC_COUNTERPARTY.includes(t)));
}
/** T03-02 validateCodeEntry rules (E-82 (b), E-85 (c) sectors rule and the BAD_OWNER / BAD_CF names), applied to every seed row and every registered row. [] when valid. */
function rowErrors(r: CodeRow): CatalogError[] {
  const e: CatalogError[] = [];
  if (!/^[A-Z][A-Z0-9_]*$/.test(r.code)) e.push('BAD_CODE');
  if (r.allowedTemplates.length === 0) e.push('NO_TEMPLATE');
  else if (r.allowedTemplates.some((t) => !CLASS_TEMPLATES[r.cls].includes(t))) e.push('TEMPLATE_CLASS_MISMATCH');
  if (!Number.isInteger(r.owner) || r.owner < 2 || r.owner > 21) e.push('BAD_OWNER');
  if (!(CASH_FLOWS as readonly string[]).includes(r.cf)) e.push('BAD_CF');
  if (!sectorsOk(r)) e.push('ELASTIC_SECTORS_MISMATCH');
  if (r.cls === 'REVALUE' && r.cf !== 'NC') e.push('REVALUE_CF_NOT_NC');
  // A leg is a chart account or a caller marker ('@ASSET' / '@'); anything else (e.g. the E-85 (d) cell '5200|5050') is not a Leg.
  if ([r.valueLegA, r.valueLegB].some((l) => l !== undefined && (typeof l === 'number' ? !chartEntry(l) : !LEG_MARKERS.includes(l)))) e.push('LEG_NOT_IN_CHART');
  if (r.allowedTemplates.length > 0 && r.allowedTemplates.every((t) => MINT_BURN.includes(t)) && r.valueLegB !== undefined) e.push('MINT_BURN_LEG_B');
  return e;
}

/** Every CodeRow field, for the field-for-field comparison (the type check below fails if CodeRow gains a field not listed). */
const ROW_FIELDS = ['code', 'cls', 'owner', 'cf', 'allowedTemplates', 'taxTag', 'stabilizerFamily', 'descriptionKey', 'valueLegA', 'valueLegB',
  'elasticSectors', 'restrictedOk', 'requestableBy', 'illicit'] as const satisfies readonly (keyof CodeRow)[];
const ROW_FIELDS_COMPLETE: [Exclude<keyof CodeRow, (typeof ROW_FIELDS)[number]>] extends [never] ? true : never = true;
void ROW_FIELDS_COMPLETE;
const fieldEq = (x: unknown, y: unknown): boolean =>
  Array.isArray(x) || Array.isArray(y) ? Array.isArray(x) && Array.isArray(y) && x.length === y.length && x.every((v, i) => v === y[i]) : x === y;
/** Field for field (an absent field equals an undefined one; arrays compare element-wise in order). */
const sameRow = (a: CodeRow, b: CodeRow): boolean => ROW_FIELDS.every((k) => fieldEq(a[k], b[k]));

/** E-12 layer 1(iii): registered rows are frozen, so no later code path can add a template (e.g. PAY) to an existing code. */
const frozenRow = (r: CodeRow): CodeRow => { Object.freeze(r.allowedTemplates); return Object.freeze(r); };
/** One catalog per world (built from the seed, extended by registerReasonCodes, frozen when the world starts). */
export class ReasonCatalog {
  private readonly rows = new SortedMap<string, CodeRow>();
  private readonly aliases: SortedMap<string, string>;
  private frozen = false;
  /** Throws, listing every `<code>: <error>`, on a DUPLICATE seed code, an alias error, or a row failing the T03-02 rules (E-82 (a)(b)). */
  constructor(seed: readonly CatalogSeedRow[] = CATALOG_SEED, aliases: readonly (readonly [alias: string, targets: readonly string[]])[] = ALIAS_SEED) {
    const errs: string[] = [];
    for (const r of seed) {
      if (this.rows.has(r.code)) { errs.push(`${r.code}: DUPLICATE`); continue; }
      const row: CodeRow = {
        code: r.code, cls: r.cls, owner: r.owner, cf: r.cf, allowedTemplates: [...r.tpl], descriptionKey: `reason.${r.code}`,
        valueLegA: r.legA ?? undefined, valueLegB: r.legB ?? undefined, elasticSectors: [...r.sectors], restrictedOk: r.restrictedOk,
        requestableBy: r.requestableBy === 'ALL' ? 'ALL' : [...r.requestableBy], illicit: r.illicit, taxTag: r.taxTag, stabilizerFamily: r.family,
      };
      for (const e of rowErrors(row)) errs.push(`${r.code}: ${e}`);
      this.rows.set(r.code, frozenRow(row));
    }
    for (const [a, targets] of aliases) {
      if (this.rows.has(a)) errs.push(`${a}: ALIAS_SHADOWS_CODE`);
      if (targets.length === 0 || targets.some((t) => !this.rows.has(t))) errs.push(`${a}: ALIAS_TARGET_MISSING`);
    }
    if (errs.length) throw new Error(`reason catalog: ${errs.sort(cmpStr).join('; ')}`);
    this.aliases = new SortedMap<string, string>(aliases.map(([a, t]) => [a, t.join(' ')]));
  }
  /**
   * E-86 (a) AC-03-02-COUNT-SCOPE: the catalog holds the seed only; the ledger (owner 03) registers LEDGER_EXTENSION_CODES at
   * world creation (LedgerWorld constructor), which takes the 454 seed rows to the 459-row runtime catalog. Idempotent: E-88 (7)
   * AC-03-02-EXT-IDEMPOTENT, a code already present must equal its extension row field for field, else LEDGER_EXTENSION_CONFLICT.
   */
  registerLedgerExtensions(): void {
    for (const x of LEDGER_EXTENSION_CODES) {
      const have = this.rows.get(x.code);
      if (have !== undefined && !sameRow(have, x)) throw new Error(`LEDGER_EXTENSION_CONFLICT: ${x.code} is already registered with a different row`);
    }
    for (const cls of ['REVALUE', 'TRANSFER'] as const) {
      const rows = LEDGER_EXTENSION_CODES.filter((r) => r.cls === cls && !this.rows.has(r.code));
      const errs = this.registerReasonCodes(3, cls, rows);
      if (errs.length) throw new Error(`ledger extension codes: ${errs.join('; ')}`);
    }
  }
  /** Rows are frozen (E-12 layer 1(iii)): a template can never be added to a registered code, escrow-only or not. */
  get(code: string): CodeRow | undefined { return this.rows.get(code); }
  all(): CodeRow[] { return this.rows.values(); }
  /** The codes of one class, sorted by code (E-82: the per-class list; FAUCET_CODES / SINK_CODES are not built). */
  byClass(cls: FlowClass): CodeRow[] { return this.rows.values().filter((r) => r.cls === cls); }
  countByClass(): Record<FlowClass, number> {
    const c = Object.fromEntries(FLOW_CLASSES.map((k) => [k, 0])) as Record<FlowClass, number>;
    for (const r of this.rows.values()) c[r.cls]++;
    return c;
  }
  resolveAlias(name: string): string | undefined { return this.aliases.get(name); }
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
      for (const x of e ? [e] : rowErrors(r)) errs.push(`${r.code}: ${x}`);
    }
    if (errs.length === 0) for (const r of rows) this.rows.set(r.code, frozenRow({ ...r, allowedTemplates: [...r.allowedTemplates] }));
    return errs.sort(cmpStr);
  }
  private check(module: number, cls: FlowClass, r: CodeRow): CatalogError | null {
    if (this.frozen) return 'CATALOG_FROZEN';
    if (this.rows.has(r.code) || this.resolveAlias(r.code)) return 'NAME_TAKEN';
    if (ESCROW_ONLY_CODES.includes(r.code)) return 'ESCROW_ONLY'; // E-12 layer 1 (unreachable while the seed holds them; defence in depth)
    if (r.owner !== module) return 'OWNER_MISMATCH';
    if (r.cls !== cls) return 'CLASS_MISMATCH';
    if ((r.code.startsWith('FAUCET_') && cls !== 'FAUCET') || (r.code.startsWith('SINK_') && cls !== 'SINK')) return 'PREFIX_CLASS_MISMATCH';
    return null; // template and row rules: rowErrors
  }
}
