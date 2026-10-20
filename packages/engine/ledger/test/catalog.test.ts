import { describe, expect, it } from 'vitest';
import { CBK_CREDIT_CODES, CBK_UNWIND_CODES, CLASS_TEMPLATES, FLOW_CLASSES, ReasonCatalog, type CodeRow } from '../src';

const row = (code: string, cls: CodeRow['cls'], owner: number, t: CodeRow['allowedTemplates']): CodeRow =>
  ({ code, cls, owner, cf: 'OP', allowedTemplates: t, descriptionKey: code });

describe('reason-code catalog (T03-02..05, INV-LED-002, Q-2)', () => {
  const cat = new ReasonCatalog();
  it('live catalog: 397 seed codes (catalog v3, E-14) + 5 ledger extension codes (E-5) = 402; TRANSFER 221, REVALUE 30', () => {
    expect(cat.countByClass()).toEqual({ FAUCET: 40, SINK: 86, TRANSFER: 221, CREDIT_CREATE: 12, CREDIT_DESTROY: 13, REVALUE: 30 });
    expect(cat.all().length).toBe(402);
  });
  it('03#1 / p10 books.ts port: every code has exactly one class and only templates of that class; no default class', () => {
    for (const r of cat.all()) {
      expect(FLOW_CLASSES).toContain(r.cls);
      expect(r.allowedTemplates.length).toBeGreaterThan(0);
      for (const t of r.allowedTemplates) expect(CLASS_TEMPLATES[r.cls]).toContain(t);
    }
    expect(cat.get('NOT_A_CODE')).toBeUndefined();
  });
  it('PD-12: CONFLICT_* are canonical, OPS_* are aliases only', () => {
    expect(cat.get('CONFLICT_RANSOM')?.cls).toBe('TRANSFER');
    expect(cat.get('CONFLICT_CASH_LOOT')?.cls).toBe('TRANSFER');
    expect(cat.get('OPS_RANSOM')).toBeUndefined();
    expect(cat.resolveAlias('OPS_RANSOM')).toBe('CONFLICT_RANSOM');
    expect(cat.resolveAlias('OPS_LOOT_CASH')).toBe('CONFLICT_CASH_LOOT');
  });
  it('errata E-3: exactly the 5 + 5 central-bank credit codes sit on CB_CREDIT / CB_CREDIT_UNWIND', () => {
    expect(cat.all().filter((r) => r.allowedTemplates.includes('CB_CREDIT')).map((r) => r.code).sort()).toEqual([...CBK_CREDIT_CODES]);
    expect(cat.all().filter((r) => r.allowedTemplates.includes('CB_CREDIT_UNWIND')).map((r) => r.code).sort()).toEqual([...CBK_UNWIND_CODES]);
    expect(cat.get('CBK_PROFIT_REMITTANCE')?.cls).toBe('TRANSFER');
    expect(cat.get('CBK_IOR_P')?.cls).toBe('FAUCET');
    expect(cat.get('CBK_DEPOSIT_INTEREST_P')?.cls).toBe('FAUCET');
  });
  it('spec test 3 (Δ1, PD-1): prefix must match class; duplicate -> NAME_TAKEN', () => {
    const c = new ReasonCatalog();
    expect(c.registerReasonCodes(5, 'TRANSFER', [row('SINK_X', 'TRANSFER', 5, ['PAY'])])).toEqual(['SINK_X: PREFIX_CLASS_MISMATCH']);
    expect(c.registerReasonCodes(5, 'TRANSFER', [row('FAUCET_X', 'TRANSFER', 5, ['PAY'])])).toEqual(['FAUCET_X: PREFIX_CLASS_MISMATCH']);
    expect(c.registerReasonCodes(5, 'SINK', [row('SINK_X', 'SINK', 5, ['BURN'])])).toEqual([]);
    expect(c.get('SINK_X')?.cls).toBe('SINK');
    expect(c.registerReasonCodes(5, 'SINK', [row('SINK_X', 'SINK', 5, ['BURN'])])).toEqual(['SINK_X: NAME_TAKEN']);
    expect(c.registerReasonCodes(5, 'TRANSFER', [row('MKT_TRADE', 'TRANSFER', 5, ['SWAP_ASSET'])])).toEqual(['MKT_TRADE: NAME_TAKEN']);
    expect(c.registerReasonCodes(12, 'TRANSFER', [row('OPS_RANSOM', 'TRANSFER', 12, ['PAY'])])).toEqual(['OPS_RANSOM: NAME_TAKEN']);
  });
  it('registerReasonCodes rejects owner, class and template mismatches and is frozen after start', () => {
    const c = new ReasonCatalog();
    expect(c.registerReasonCodes(4, 'TRANSFER', [row('GOV_X', 'TRANSFER', 9, ['PAY'])])).toEqual(['GOV_X: OWNER_MISMATCH']);
    expect(c.registerReasonCodes(4, 'TRANSFER', [row('GOV_X', 'SINK', 4, ['BURN'])])).toEqual(['GOV_X: CLASS_MISMATCH']);
    expect(c.registerReasonCodes(4, 'FAUCET', [row('GOV_X', 'FAUCET', 4, ['PAY'])])).toEqual(['GOV_X: TEMPLATE_CLASS_MISMATCH']);
    expect(c.registerReasonCodes(4, 'TRANSFER', [row('GOV_X', 'TRANSFER', 4, ['PAY']), row('SINK_Y', 'TRANSFER', 4, ['PAY'])])).toEqual(['SINK_Y: PREFIX_CLASS_MISMATCH']);
    expect(c.get('GOV_X')).toBeUndefined(); // all-or-nothing
    c.freeze();
    expect(c.registerReasonCodes(4, 'TRANSFER', [row('GOV_X', 'TRANSFER', 4, ['PAY'])])).toEqual(['GOV_X: CATALOG_FROZEN']);
  });
  it('the catalog is per instance (no process-global registry)', () => {
    const a = new ReasonCatalog(); const b = new ReasonCatalog();
    a.registerReasonCodes(5, 'SINK', [row('SINK_ONLY_A', 'SINK', 5, ['BURN'])]);
    expect(b.get('SINK_ONLY_A')).toBeUndefined();
  });
});
