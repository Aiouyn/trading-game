// T04-21 step 4: the 17 reason codes 04 registers on top of 03's catalog (owner 4; E-104 (6): 17 codes, catalog 459 -> 476).
// Registered through ModuleServices.reasonCodes (E-92 (4)); registerMacroReasonCodes stays as the test / restore helper.
// cf and legs (Open point 3): 03's row of the same class and template where one exists (FX: LED_FX_CONVERSION OP, no legs;
// SWAP_ASSET: INSOLV_CLAIM_TRADE INV, @ASSET / @ASSET); PAY: OP, the majority of 03's PAY rows, legs unset (template fallback);
// SINK BURN (no 03 row): OP, as every seed SINK BURN row, legs unset.
import { FLOW_CLASSES, type CashFlow, type CodeRow, type FlowClass, type ReasonCatalog, type TemplateId } from '@tycoon/engine-ledger';

const OWNER = 4;
const row = (code: string, cls: FlowClass, tpl: TemplateId, requestableBy: number[]): CodeRow => {
  const cf: CashFlow = tpl === 'SWAP_ASSET' ? 'INV' : 'OP';
  const legs = tpl === 'SWAP_ASSET' ? { valueLegA: '@ASSET' as const, valueLegB: '@ASSET' as const } : {};
  return Object.freeze({ code, cls, owner: OWNER, cf, allowedTemplates: [tpl], descriptionKey: `reason.${code}`, ...legs,
    elasticSectors: [], restrictedOk: false, requestableBy, illicit: false });
};

/** 17 rows sorted by code (card T04-21 step 4 table). */
export const MACRO_REASON_ROWS: readonly CodeRow[] = Object.freeze([
  row('CAPCON_LEVY', 'SINK', 'BURN', [4, 5]),
  row('CBK_NEGATIVE_RATE_CHARGE_P', 'SINK', 'BURN', [4]),
  row('CBK_NEGATIVE_RATE_CHARGE_W', 'TRANSFER', 'PAY', [4]),
  row('CBK_RESERVE_PENALTY_P', 'SINK', 'BURN', [4, 7]),
  row('CBK_RESERVE_PENALTY_W', 'TRANSFER', 'PAY', [4, 7]),
  row('CBK_SWAP_LINE_DRAW', 'TRANSFER', 'FX', [4]),
  row('CBK_SWAP_LINE_INTEREST', 'TRANSFER', 'PAY', [4]),
  row('CBK_SWAP_LINE_REPAY', 'TRANSFER', 'FX', [4]),
  row('CSF_DISBURSE', 'TRANSFER', 'PAY', [4]),
  row('CSF_INTEREST', 'TRANSFER', 'PAY', [4]),
  row('CSF_REPAY', 'TRANSFER', 'PAY', [4]),
  row('GOV_BUYBACK', 'TRANSFER', 'SWAP_ASSET', [4]),
  row('GOV_SUBSIDY_P', 'TRANSFER', 'PAY', [4, 9, 10, 11]),
  row('GOV_SYNDICATION_FEE', 'TRANSFER', 'PAY', [4]),
  row('MAC_FX_CAPITAL_FLOW', 'TRANSFER', 'FX', [4]),
  row('MAC_FX_CA_ABSORB', 'TRANSFER', 'FX', [4]),
  row('SWF_TRANSFER', 'TRANSFER', 'PAY', [4]),
]);

/** Every CodeRow field (the type check fails if CodeRow gains one); 03's sameRow is private, so the E-88 (7) comparison is repeated here. */
const FIELDS = ['code', 'cls', 'owner', 'cf', 'allowedTemplates', 'taxTag', 'stabilizerFamily', 'descriptionKey', 'valueLegA', 'valueLegB',
  'elasticSectors', 'restrictedOk', 'requestableBy', 'illicit'] as const satisfies readonly (keyof CodeRow)[];
const COMPLETE: [Exclude<keyof CodeRow, (typeof FIELDS)[number]>] extends [never] ? true : never = true;
void COMPLETE;
const eq = (x: unknown, y: unknown): boolean =>
  Array.isArray(x) || Array.isArray(y) ? Array.isArray(x) && Array.isArray(y) && x.length === y.length && x.every((v, i) => v === y[i]) : x === y;
const sameRow = (a: CodeRow, b: CodeRow): boolean => FIELDS.every((k) => eq(a[k], b[k]));

/** Adds the rows not yet present, by class in FLOW_CLASSES order; returns how many (17, then 0). A present code with a different row throws. */
export function registerMacroReasonCodes(catalog: ReasonCatalog): number {
  for (const r of MACRO_REASON_ROWS) {
    const have = catalog.get(r.code);
    if (have !== undefined && !sameRow(have, r)) throw new Error(`LEDGER_EXTENSION_CONFLICT: ${r.code} is already registered with a different row`);
  }
  let n = 0;
  for (const cls of FLOW_CLASSES) {
    const rows = MACRO_REASON_ROWS.filter((r) => r.cls === cls && catalog.get(r.code) === undefined);
    const errs = catalog.registerReasonCodes(OWNER, cls, rows);
    if (errs.length) throw new Error(`macro reason codes: ${errs.join('; ')}`);
    n += rows.length;
  }
  return n;
}
