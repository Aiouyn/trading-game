// E-86 acceptance tests for T03-02 (Systems, 2026-10-27): seed vs runtime count scope, restrictedOk / alias numbers, *_NPC sector side.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ALIASES, LEDGER_EXTENSION_CODES, RESTRICTED_OK_CODES, ReasonCatalog, type CatalogSeedRow, type FlowClass } from '../src/catalog';
import { ALIAS_SEED, CATALOG_SEED } from '../src/catalog-data';
import { LedgerWorld } from '../src/world';

const CSV = fileURLToPath(new URL('../../../../export/ledger-ref/catalog.csv', import.meta.url));
const GEN = fileURLToPath(new URL('../scripts/gen-catalog.mjs', import.meta.url));
/** catalog.csv rows (quoted cells may hold commas and doubled quotes), as {header: cell}. */
const csvRows = (): Record<string, string>[] => {
  const rows: string[][] = []; let row: string[] = [], cell = '', q = false; const t = readFileSync(CSV, 'utf8');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [h, ...b] = rows; return b.filter((r) => r.length > 1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
};
const SEED: Record<FlowClass, number> = { TRANSFER: 245, SINK: 113, FAUCET: 41, REVALUE: 30, CREDIT_DESTROY: 13, CREDIT_CREATE: 12 };
const EXT5 = ['ESCROW_CONFLICT_CLAWBACK', 'ESCROW_CONFLICT_RELEASE', 'LED_CONTROL_IN', 'LED_CONTROL_OUT', 'LED_HOLDER_RECLASS'];
const codes = (c: ReasonCatalog): string[] => c.all().map((r) => r.code);

describe('AC-03-02-COUNT-SCOPE (E-86 (a))', () => {
  it('new ReasonCatalog().countByClass() is the 454-row seed; CATALOG_SEED.length === 454', () => {
    const cat = new ReasonCatalog();
    expect(cat.countByClass()).toEqual(SEED);
    expect(cat.all().length).toBe(454);
    expect(CATALOG_SEED.length).toBe(454);
  });
  it('after the ledger registers LEDGER_EXTENSION_CODES: 459, TRANSFER 247, REVALUE 33, the 5 added codes are exactly the named five', () => {
    const cat = new ReasonCatalog(); const before = codes(cat);
    cat.registerLedgerExtensions();
    expect(cat.countByClass()).toEqual({ ...SEED, TRANSFER: 247, REVALUE: 33 });
    expect(cat.all().length).toBe(459);
    expect(codes(cat).filter((c) => !before.includes(c))).toEqual(EXT5);
    expect(LEDGER_EXTENSION_CODES.map((r) => r.code).sort()).toEqual(EXT5);
    cat.registerLedgerExtensions(); // idempotent
    expect(cat.all().length).toBe(459);
  });
  it('world creation (LedgerWorld) is where the ledger registers them: its catalog has 459', () => {
    const w = new LedgerWorld();
    expect(w.catalog.all().length).toBe(459);
    expect(w.catalog.countByClass()).toEqual({ ...SEED, TRANSFER: 247, REVALUE: 33 });
    const own = new ReasonCatalog(); const w2 = new LedgerWorld({ catalog: own });
    expect([w2.catalog === own, own.all().length]).toEqual([true, 459]);
  });
  it('no extension code appears in catalog.csv or CATALOG_SEED; catalog.csv has 456 rows (454 + OPS_LOOT_CASH, OPS_RANSOM)', () => {
    const csv = csvRows().map((r) => r.code);
    expect(csv.length).toBe(456);
    expect(csv.filter((c) => !CATALOG_SEED.some((r) => r.code === c))).toEqual(['OPS_LOOT_CASH', 'OPS_RANSOM']);
    for (const c of EXT5) expect([c, csv.includes(c), CATALOG_SEED.some((r) => r.code === c)]).toEqual([c, false, false]);
  });
});

describe('AC-03-02-RESTRICTED-ALIASES (E-86 (b))', () => {
  it('RESTRICTED_OK_CODES.length === 44: SINK 22, TRANSFER 21, REVALUE 1 (AI_STARTER_COMPUTE)', () => {
    expect(RESTRICTED_OK_CODES.length).toBe(44);
    const cls = (c: string): FlowClass | undefined => CATALOG_SEED.find((r) => r.code === c)?.cls;
    const split = { SINK: 0, TRANSFER: 0, REVALUE: 0, FAUCET: 0, CREDIT_CREATE: 0, CREDIT_DESTROY: 0 };
    for (const c of RESTRICTED_OK_CODES) split[cls(c)!]++;
    expect(split).toEqual({ SINK: 22, TRANSFER: 21, REVALUE: 1, FAUCET: 0, CREDIT_CREATE: 0, CREDIT_DESTROY: 0 });
    expect(RESTRICTED_OK_CODES.filter((c) => cls(c) === 'REVALUE')).toEqual(['AI_STARTER_COMPUTE']);
  });
  it('the 2 dropped alias rows and the 5 extension codes are restrictedOk N', () => {
    const csv = csvRows();
    expect(csv.filter((r) => r.code === 'OPS_LOOT_CASH' || r.code === 'OPS_RANSOM').map((r) => r.restrictedOk)).toEqual(['N', 'N']);
    expect(csv.filter((r) => r.restrictedOk === 'Y').length).toBe(44);
    for (const r of LEDGER_EXTENSION_CODES) expect([r.code, r.restrictedOk, RESTRICTED_OK_CODES.includes(r.code)]).toEqual([r.code, false, false]);
  });
  it('ALIASES.length === 56, 56 distinct names; every target resolves with cat.get; cat.get(alias) is undefined for all 56', () => {
    const cat = new ReasonCatalog();
    expect(ALIASES.length).toBe(56);
    expect(ALIAS_SEED.map(([a]) => a).filter((a, i, xs) => xs.indexOf(a) === i).length).toBe(56);
    // E-86 (b) also says "53 map to 1 target and 3 to 2"; aliases.csv has 47 / 7 / 2 (1 / 2 / 3 targets). Not pinned (outside the AC); asked.
    for (const [a, t] of ALIASES) {
      for (const x of t.split(/[\s|]+/)) expect([a, x, cat.get(x) !== undefined]).toEqual([a, x, true]);
      expect([a, cat.get(a)]).toEqual([a, undefined]);
    }
  });
  it('the gen-catalog.mjs alias comment says 56 rows (was the stale "26 rows of 24 §8 + 2 of PD-12")', () => {
    const src = readFileSync(GEN, 'utf8');
    expect(src).toContain('aliases.csv (56 rows');
    expect(src).not.toContain('26 rows of 24 §8 + 2 of PD-12');
  });
});

/** E-86 (c) table: the NPC side (sector) of each *_NPC row. No allowlist: PROP_SITE_SECURITY_NPC is the frm sector. */
const NPC_SIDE: readonly (readonly [code: string, sectors: readonly string[]])[] = [
  ['OPS_FENCE_SALE_NPC', ['frm']], ['FACT_SALE_NPC', ['frm']], ['PROP_TXN_COST_NPC', ['frm']], ['PROP_FORECLOSURE_COST_NPC', ['frm']],
  ['PROP_SITE_SECURITY_NPC', ['frm']], ['EQ_DIVIDEND_NPC', ['hh', 'frm', 'row']], ['EQ_TENDER_OFFER_NPC', ['hh', 'frm', 'row']],
  ['EQ_IPO_PROCEEDS_NPC', ['hh', 'frm', 'row']], ['CMP_GOLDEN_PARACHUTE_NPC', ['hh']],
];
const ELASTIC_SECTORS: readonly string[] = ['hh', 'frm', 'row'];
/** The AC rule over a seed: codes whose seed sector field is not the table's NPC side or holds a value outside {hh, frm, row}. */
const npcSideFailures = (seed: readonly CatalogSeedRow[]): string[] => NPC_SIDE.filter(([code, side]) => {
  const s = seed.find((r) => r.code === code)?.sectors;
  return s === undefined || s.length !== side.length || side.some((x) => !s.includes(x)) || s.some((x) => !ELASTIC_SECTORS.includes(x));
}).map(([code]) => code);

describe('AC-03-02-NPC-SIDE (E-86 (c))', () => {
  it('each of the 9 *_NPC rows: the seed sector field (and the catalog row) holds the table NPC side; every value in {hh, frm, row}', () => {
    expect(npcSideFailures(CATALOG_SEED)).toEqual([]);
    const cat = new ReasonCatalog();
    for (const [code, side] of NPC_SIDE) {
      const r = cat.get(code);
      expect([code, r?.cls, [...(r?.elasticSectors ?? [])].sort()]).toEqual([code, 'TRANSFER', [...side].sort()]);
    }
  });
  it('the 9 are exactly the TRANSFER *_NPC rows of the seed', () => {
    expect(CATALOG_SEED.filter((r) => r.cls === 'TRANSFER' && r.code.endsWith('_NPC')).map((r) => r.code).sort()).toEqual(NPC_SIDE.map(([c]) => c).sort());
  });
  it("required mutant: PROP_SITE_SECURITY_NPC sectors ['hh'] fails the rule (no allowlist); a sector outside {hh, frm, row} fails too", () => {
    const mut = (code: string, sectors: string[]): CatalogSeedRow[] => CATALOG_SEED.map((r) => (r.code === code ? { ...r, sectors } : r));
    expect(npcSideFailures(mut('PROP_SITE_SECURITY_NPC', ['hh']))).toEqual(['PROP_SITE_SECURITY_NPC']);
    expect(npcSideFailures(mut('CMP_GOLDEN_PARACHUTE_NPC', ['frm']))).toEqual(['CMP_GOLDEN_PARACHUTE_NPC']);
    expect(npcSideFailures(mut('EQ_DIVIDEND_NPC', ['hh', 'frm']))).toEqual(['EQ_DIVIDEND_NPC']);
    expect(npcSideFailures(mut('FACT_SALE_NPC', ['frm', 'npcFirm']))).toEqual(['FACT_SALE_NPC']);
  });
});
