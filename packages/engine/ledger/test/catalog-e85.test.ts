// E-85 acceptance tests for T03-02 (catalog checks vs the real seed). Seed: export/ledger-ref (copied from specs/ledger-ref).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ReasonCatalog, ILLICIT_CODES, LEDGER_EXTENSION_CODES, RESTRICTED_OK_CODES, type CatalogSeedRow, type CodeRow, type FlowClass } from '../src/catalog';
import { ALIAS_SEED, CATALOG_SEED } from '../src/catalog-data';
import { LEG_POLICY, resolveLeg } from '../src/legpolicy';
import * as L from '../src';
import { fixture } from './fixture';

const PKG = fileURLToPath(new URL('../', import.meta.url));
const REF = fileURLToPath(new URL('../../../../export/ledger-ref/', import.meta.url));
const CARD = fileURLToPath(new URL('../../../../export/build-plan/cards/03/T03-02.md', import.meta.url));
const seedRow = (code: string): CatalogSeedRow => { const r = CATALOG_SEED.find((x) => x.code === code); if (!r) throw new Error(code); return r; };
const csv = (file: string): Record<string, string>[] => {
  const rows: string[][] = []; let row: string[] = [], cell = '', q = false; const t = readFileSync(join(REF, file), 'utf8');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [h, ...b] = rows; return b.filter((r) => r.length > 1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
};
/** Codes of one card table (`### FAUCET rows` / `### SINK rows`), first column. */
const cardCodes = (heading: string): string[] => {
  const md = readFileSync(CARD, 'utf8'); const start = md.indexOf(`### ${heading} rows`); const end = md.indexOf('\n#', start + 4);
  return [...md.slice(start, end).matchAll(/^\| `([A-Z0-9_]+)` \|/gm)].map((m) => m[1]);
};
/** Construct from the seed with one row replaced (or extra rows / aliases); returns the thrown error list, [] when it constructs. */
const ctorErrors = (seed: readonly CatalogSeedRow[], aliases: readonly (readonly [string, readonly string[]])[] = ALIAS_SEED): string[] => {
  try { new ReasonCatalog(seed, aliases); return []; } catch (e) { return String((e as Error).message).replace(/^reason catalog: /, '').split('; '); }
};
const mutate = (code: string, f: Partial<CatalogSeedRow>): CatalogSeedRow[] => CATALOG_SEED.map((r) => (r.code === code ? { ...r, ...f } : r));
/** The same mutant through registerReasonCodes: a catalog without the row, then register the mutated row as its owner and class. */
const registerErrors = (code: string, f: Partial<CatalogSeedRow>): string[] => {
  const c = new ReasonCatalog(CATALOG_SEED.filter((r) => r.code !== code), ALIAS_SEED.filter(([, t]) => !t.includes(code)));
  const r = { ...seedRow(code), ...f };
  const row: CodeRow = { code: r.code, cls: r.cls, owner: r.owner, cf: r.cf, allowedTemplates: [...r.tpl], descriptionKey: `reason.${r.code}`,
    valueLegA: r.legA ?? undefined, valueLegB: r.legB ?? undefined, elasticSectors: [...r.sectors] };
  return c.registerReasonCodes(r.owner, r.cls, [row]);
};
const WORLD: Record<FlowClass, number> = { TRANSFER: 245, SINK: 113, FAUCET: 41, REVALUE: 30, CREDIT_DESTROY: 13, CREDIT_CREATE: 12 };
const NPC9 = ['OPS_FENCE_SALE_NPC', 'FACT_SALE_NPC', 'PROP_TXN_COST_NPC', 'PROP_FORECLOSURE_COST_NPC', 'PROP_SITE_SECURITY_NPC', 'EQ_DIVIDEND_NPC',
  'EQ_TENDER_OFFER_NPC', 'EQ_IPO_PROCEEDS_NPC', 'CMP_GOLDEN_PARACHUTE_NPC'];

describe('AC-03-02-SEED-CONSTRUCTS (E-85)', () => {
  it('new ReasonCatalog() on the regenerated real seed throws nothing; the 454 seed rows have the E-85 world counts', () => {
    const cat = new ReasonCatalog();
    const seed = Object.fromEntries(Object.keys(WORLD).map((k) => [k, CATALOG_SEED.filter((r) => r.cls === k).length]));
    expect(seed).toEqual(WORLD);
    expect(CATALOG_SEED.length).toBe(454);
    // E-86 (a): the catalog is the seed; the ledger registers the 5 extension codes at world creation (REVALUE +3, TRANSFER +2).
    expect(cat.countByClass()).toEqual(WORLD);
    expect(LEDGER_EXTENSION_CODES.map((r) => r.cls)).toEqual(['REVALUE', 'REVALUE', 'REVALUE', 'TRANSFER', 'TRANSFER']);
    cat.registerLedgerExtensions();
    expect(cat.countByClass()).toEqual({ ...WORLD, REVALUE: 33, TRANSFER: 247 });
    expect(cat.all().length).toBe(459);
  });
  it('AC-03-02-COUNTS (card): the 36 FAUCET and 86 SINK card codes have those classes; OPS_FENCE_SALE_NPC is TRANSFER SWAP_ASSET frm illicit', () => {
    const cat = new ReasonCatalog(); const f = cardCodes('FAUCET').filter((c) => c !== 'OPS_FENCE_SALE_NPC'); const s = cardCodes('SINK');
    expect([f.length, s.length]).toEqual([36, 86]);
    for (const c of f) expect([c, cat.get(c)?.cls]).toEqual([c, 'FAUCET']);
    for (const c of s) expect([c, cat.get(c)?.cls]).toEqual([c, 'SINK']);
    const fence = cat.get('OPS_FENCE_SALE_NPC');
    expect([fence?.cls, fence?.allowedTemplates, fence?.elasticSectors, fence?.illicit]).toEqual(['TRANSFER', ['SWAP_ASSET'], ['frm'], true]);
  });
});

describe('AC-03-02-CHECK-MUTANTS: one real row, one field changed, exactly one named error', () => {
  const FREE = CATALOG_SEED.find((r) => !ALIAS_SEED.some(([, t]) => t.includes(r.code)))!.code;
  const cases: [name: string, code: string, f: Partial<CatalogSeedRow>][] = [
    ['BAD_CODE', FREE, { code: FREE.toLowerCase() }], // FREE is no alias target, so renaming it breaks no alias
    ['NO_TEMPLATE', 'ACCT_START_CASH', { tpl: [] }],
    ['TEMPLATE_CLASS_MISMATCH', 'ACCT_START_CASH', { tpl: ['PAY'] }],
    ['ELASTIC_SECTORS_MISMATCH', 'BIZ_WAGES', { sectors: [] }],
    ['BAD_OWNER', 'ACCT_START_CASH', { owner: 22 }],
    ['BAD_CF', 'ACCT_START_CASH', { cf: 'XX' as CatalogSeedRow['cf'] }],
    ['REVALUE_CF_NOT_NC', 'ACCT_STARTER_GIFT', { cf: 'OP' }],
    ['LEG_NOT_IN_CHART', 'CITY_COSMETIC', { legA: '5200|5050' as unknown as number }],
    ['MINT_BURN_LEG_B', 'CITY_COSMETIC', { legB: 4190 }],
  ];
  for (const [name, code, f] of cases) it(`${name}: ${code} ${JSON.stringify(f)}`, () => {
    const c = f.code ?? code;
    if (f.code) expect(ALIAS_SEED.filter(([, t]) => t.includes(code))).toEqual([]);
    expect(ctorErrors(mutate(code, f))).toEqual([`${c}: ${name}`]);
    expect(registerErrors(code, f)).toEqual([`${c}: ${name}`]);
  });
  it('the unmutated rows construct and register cleanly (control)', () => {
    expect(ctorErrors(CATALOG_SEED)).toEqual([]);
    for (const [, code] of cases) expect(registerErrors(code, {})).toEqual([]);
  });
  it('DUPLICATE, ALIAS_TARGET_MISSING, ALIAS_SHADOWS_CODE (constructor)', () => {
    expect(ctorErrors([...CATALOG_SEED, seedRow('ACCT_START_CASH')])).toEqual(['ACCT_START_CASH: DUPLICATE']);
    expect(ctorErrors(CATALOG_SEED, ALIAS_SEED.map(([a, t]) => (a === 'OPS_RANSOM' ? [a, ['CONFLICT_RANSOM_X']] : [a, t])))).toEqual(['OPS_RANSOM: ALIAS_TARGET_MISSING']);
    expect(ctorErrors(CATALOG_SEED, [...ALIAS_SEED, ['ACCT_START_CASH', ['ACCT_STARTER_GIFT']]])).toEqual(['ACCT_START_CASH: ALIAS_SHADOWS_CODE']);
  });
});

describe('AC-03-02-SECTORS-RULE (E-85 (c), structural)', () => {
  it('the 9 *_NPC TRANSFER rows construct, with sectors and templates within {PAY, SWAP_ASSET}', () => {
    const cat = new ReasonCatalog();
    for (const c of NPC9) {
      const r = cat.get(c);
      expect([c, r?.cls, (r?.elasticSectors ?? []).length > 0, r?.allowedTemplates.every((t) => t === 'PAY' || t === 'SWAP_ASSET')]).toEqual([c, 'TRANSFER', true, true]);
    }
  });
  it('ELASTIC_OUT without sectors, sectors on TRANSFER ESCROW_PLACE, sectors on SINK BURN: each ELASTIC_SECTORS_MISMATCH', () => {
    expect(ctorErrors(mutate('BIZ_WAGES', { sectors: [] }))).toEqual(['BIZ_WAGES: ELASTIC_SECTORS_MISMATCH']);
    expect(ctorErrors(mutate('CONFLICT_RANSOM', { sectors: ['frm'] }))).toEqual(['CONFLICT_RANSOM: ELASTIC_SECTORS_MISMATCH']);
    expect(ctorErrors(mutate('CITY_COSMETIC', { sectors: ['hh'] }))).toEqual(['CITY_COSMETIC: ELASTIC_SECTORS_MISMATCH']);
  });
  it('rule 2 needs class TRANSFER: a SINK row with PAY and sectors reports both TEMPLATE_CLASS_MISMATCH and ELASTIC_SECTORS_MISMATCH', () => {
    expect(ctorErrors(mutate('CITY_COSMETIC', { tpl: ['PAY'], sectors: ['hh'] })).sort()).toEqual(['CITY_COSMETIC: ELASTIC_SECTORS_MISMATCH', 'CITY_COSMETIC: TEMPLATE_CLASS_MISMATCH']);
  });
  it('a TRANSFER PAY row with no sectors constructs (sectors stay optional on TRANSFER)', () => {
    expect(seedRow('CMP_WAIVER_FEE')).toMatchObject({ cls: 'TRANSFER', tpl: ['PAY'], sectors: [] });
    expect(new ReasonCatalog().get('CMP_WAIVER_FEE')?.elasticSectors).toEqual([]);
  });
});

describe('AC-03-02-NONCASH-GRANTS (E-85 (a)(b))', () => {
  for (const [code, mod, dr, sub] of [['ACCT_STARTER_GIFT', '14', 1860, 'lid_kessler_field'], ['AI_STARTER_COMPUTE', '11', 1221, undefined]] as const) {
    it(`${code}: REVALUE ['ACCRUE'] cf NC, no family; posting it leaves byClass.FAUCET and ΔM0_sys at 0 and INV-LED-003 holds`, () => {
      const row = new ReasonCatalog().get(code);
      expect([row?.cls, row?.allowedTemplates, row?.cf, row?.stabilizerFamily]).toEqual(['REVALUE', ['ACCRUE'], 'NC', undefined]);
      const w = fixture(); const a0 = w.aggregates('FDL');
      w.apiFor(mod).ledger.accrue('chr_P', 5_000_000n, 'FDL', code, dr, 4110, sub ? { sub } : undefined);
      const t = w.tick; const r = w.runP13();
      expect(r.failures).toEqual([]);
      expect([r.applied, r.failedInvariants]).toEqual([1, []]);
      const f = w.flowReader().tickFlows('FDL', t)!;
      expect([f.byClass.get('FAUCET') ?? 0n, f.m0sysDelta, f.byClass.get('REVALUE')]).toEqual([0n, 0n, 5_000_000n]);
      expect(w.aggregates('FDL').M0_sys - a0.M0_sys).toBe(0n);
    });
  }
});

describe('AC-03-02-BY-PAYER (E-85 (d))', () => {
  for (const code of ['CITY_COSMETIC', 'CITY_NAMING_RIGHT', 'CITY_SPONSORSHIP']) it(`${code}: seed legA 5200; payer default 5200, company 5050, other leg_mismatch`, () => {
    expect(seedRow(code).legA).toBe(5200);
    expect(resolveLeg(code, 'A', undefined)).toEqual({ acct: 5200 });
    expect(resolveLeg(code, 'A', 5050)).toEqual({ acct: 5050 });
    expect(resolveLeg(code, 'A', 5250)).toMatchObject({ err: 'leg_mismatch' });
  });
});

describe('AC-03-02-LEG-DEFAULTS', () => {
  it('every seed code: legA/legB = LEG_POLICY defaults, class and templates = the legpolicy row; LEG_POLICY codes = seed codes (454, no alias rows)', () => {
    const lp = new Map(csv('legpolicy.csv').map((r) => [r.code, r]));
    const leg = (s: string): number | string | null => (/^\d{4}$/.test(s) ? Number(s) : s === '-' ? null : s);
    for (const r of CATALOG_SEED) {
      const p = LEG_POLICY.get(r.code); const row = lp.get(r.code);
      expect([r.code, r.legA, r.legB]).toEqual([r.code, p?.A.def, p?.B.def]);
      expect([r.code, r.cls, r.tpl.join(';')]).toEqual([r.code, row?.class, row?.templates.split(/[\s;,|]+/).filter(Boolean).join(';')]);
      expect([r.code, leg(row!.legA_default), leg(row!.legB_default)]).toEqual([r.code, r.legA, r.legB]);
    }
    expect(LEG_POLICY.keys()).toEqual(CATALOG_SEED.map((r) => r.code).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    expect(LEG_POLICY.size).toBe(454);
    for (const [a] of ALIAS_SEED) expect(LEG_POLICY.get(a)).toBeUndefined();
  });
});

describe('AC-03-02-GEN-DETERMINISTIC', () => {
  const FILES = ['src/catalog-data.ts', 'src/legpolicy-data.ts', 'data/cppolicy.csv', 'src/cppolicy-data.ts'];
  it('two gen-catalog.mjs runs over export/ledger-ref are byte-identical and equal the 4 committed files', () => {
    const run = (): string => { const d = mkdtempSync(join(tmpdir(), 'gen-')); execFileSync(process.execPath, [join(PKG, 'scripts/gen-catalog.mjs'), REF, d]); return d; };
    const a = run(); const b = run();
    for (const f of FILES) {
      const x = readFileSync(join(a, f)); expect(x.equals(readFileSync(join(b, f)))).toBe(true);
      expect([f, x.equals(readFileSync(join(PKG, f)))]).toEqual([f, true]);
    }
  });
});

describe('E-82 carried into T03-02', () => {
  it('AC-03-02-SEED-EQ-CSV: CATALOG_SEED = the non-alias catalog.csv rows, field by field; ALIAS_SEED = aliases.csv', () => {
    const ali = csv('aliases.csv'); const names = new Set(ali.map((a) => a.alias));
    const rows = csv('catalog.csv').filter((r) => !names.has(r.code));
    const leg = (s: string): number | string | null => (/^\d{4}$/.test(s) ? Number(s) : s === '-' ? null : s);
    const TPL = new Set<string>(Object.values(L.CLASS_TEMPLATES).flat());
    const opt = (s: string): string | undefined => (s === '-' || s === '' ? undefined : s);
    expect(CATALOG_SEED.map((r) => r.code)).toEqual(rows.map((r) => r.code));
    rows.forEach((c, i) => {
      const r = CATALOG_SEED[i];
      expect({ code: r.code, cls: r.cls, owner: r.owner, cf: r.cf, tpl: r.tpl.join(';'), legA: r.legA, legB: r.legB, sectors: r.sectors.join(','), taxTag: r.taxTag,
        family: r.family, restrictedOk: r.restrictedOk, requestableBy: r.requestableBy === 'ALL' ? 'ALL' : r.requestableBy.join(','), illicit: r.illicit }).toEqual({
        code: c.code, cls: c.class, owner: Number(c.owner), cf: c.cf, tpl: c.allowedTemplates.split(/[\s;,()]+/).filter((t) => TPL.has(t)).join(';'),
        legA: leg(c.legA), legB: leg(c.legB), sectors: c.sector === '-' ? '' : c.sector, taxTag: opt(c.taxTag), family: opt(c.family), restrictedOk: c.restrictedOk === 'Y',
        requestableBy: c.requestableBy === '-' ? '' : c.requestableBy === 'ALL' ? 'ALL' : c.requestableBy.split(',').map(Number).join(','), illicit: c.illicit === 'Y' });
    });
    expect(ALIAS_SEED.map(([a, t]) => [a, t.join(' ')])).toEqual(ali.map((a) => [a.alias, a.targets.split(/[\s|]+/).filter(Boolean).join(' ')]));
    expect(RESTRICTED_OK_CODES.length).toBe(rows.filter((r) => r.restrictedOk === 'Y').length);
  });
  it('descriptionKey is reason.<CODE>; ILLICIT_CODES = the seed rows with illicit: true', () => {
    for (const r of new ReasonCatalog().all()) expect(r.descriptionKey).toBe(`reason.${r.code}`);
    expect(ILLICIT_CODES).toEqual(CATALOG_SEED.filter((r) => r.illicit).map((r) => r.code).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    expect(ILLICIT_CODES).toContain('OPS_FENCE_SALE_NPC');
  });
  it('AC-03-02-NO-DUP: no ledger/catalog/ tree and none of the card-only exports', () => {
    expect(existsSync(join(PKG, 'catalog'))).toBe(false);
    for (const n of ['buildCatalog', 'rowsToEntries', 'FAUCET_CODES', 'SINK_CODES', 'TRANSFER_A_CODES', 'TRANSFER_B_CODES', 'FAUCET_ROWS', 'SINK_ROWS']) expect([n, n in L]).toEqual([n, false]);
  });
});
