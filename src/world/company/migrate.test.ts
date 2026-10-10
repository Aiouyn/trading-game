import { describe, expect, it } from 'vitest';
import type { GameState } from '../types';
import { advanceTo, companyOf, founded, listedWorld } from './b1fixture';
import { publicCompanyView } from './views';
import { migrateCompany } from './migrate';
import type { Company } from './types';

// Old saves (no B1 fields) load and step; a JSON save round-trip continues exactly (determinism and replay).

describe('old company records (saved before B1)', () => {
  it('get the B1 fields with empty values, and nothing else changes', () => {
    const { g, c } = founded('mig-old');
    const before = JSON.stringify(c.filings);
    const old = c as unknown as Record<string, unknown>;
    for (const k of ['ipo', 'filedV', 'filedLnV', 'debts', 'debtSeq', 'covenant', 'lastDebtDrawDay', 'divDistress', 'windowRanges', 'lastFilingDay', 'insiderTrades', 'planRows', 'planSkips', 'planSeq', 'buybacks', 'buybackSeq', 'treasuryId']) delete old[k];
    migrateCompany(c);
    expect(c.covenant).toEqual({ status: 'ok', cureUntilDay: null });
    expect(c.debts).toEqual([]);
    expect(c.ipo).toBeNull();
    expect(c.lastFilingDay).toBe(-1);
    expect(JSON.stringify(c.filings)).toBe(before);
    migrateCompany(c);
    expect(c.covenant).toEqual({ status: 'ok', cureUntilDay: null });
    expect(g.companies).toBeDefined();
  });

  it('a stale record steps and reads its public view without a crash', () => {
    const { g } = founded('mig-step');
    const c = companyOf(g);
    const old = c as unknown as Record<string, unknown>;
    delete old.covenant;
    delete old.debts;
    delete old.windowRanges;
    advanceTo(g, 70);
    expect(publicCompanyView(c, 70).debt.covenant).toBe('ok');
  });
});

describe('save and load mid-quarter continues exactly (determinism, replay)', () => {
  it('a JSON round-trip of a listed world advances to the same state as the original', () => {
    const { g } = listedWorld('replay');
    const saved = JSON.parse(JSON.stringify(g)) as GameState;
    advanceTo(g, 230);
    advanceTo(saved, 230);
    const a = companyOf(g) as Company;
    const b = companyOf(saved) as Company;
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(JSON.stringify(saved.market.accounts)).toBe(JSON.stringify(g.market.accounts));
    expect(JSON.stringify(saved.market.restrictions)).toBe(JSON.stringify(g.market.restrictions));
  });
});
