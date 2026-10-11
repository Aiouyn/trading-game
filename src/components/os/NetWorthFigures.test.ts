import { describe, expect, it } from 'vitest';
import { netWorthRows } from './NetWorthFigures';
import type { NetWorthBreakdown } from '@/world/core';

const sample: NetWorthBreakdown = {
  cash: 1200, markets: 800, businesses: 2050, property: 300, mortgages: 120, lifestyle: 40, lab: 15, companies: 0, funds: 60, tokens: 5, total: 0,
};

describe('the net worth breakdown in the top bar', () => {
  it('the rows add up to the total (debts subtracted), so the breakdown never disagrees with the figure', () => {
    const nw = { ...sample, total: sample.cash + sample.markets + sample.businesses + sample.property - sample.mortgages + sample.lifestyle + sample.lab + sample.companies + sample.funds + sample.tokens };
    const sum = netWorthRows(nw).reduce((s, r) => s + r.value, 0);
    expect(sum).toBeCloseTo(nw.total, 9);
  });

  it('lists the parts in order and shows debts as a negative', () => {
    const rows = netWorthRows(sample);
    expect(rows.map((r) => r.key)).toEqual(['cash', 'markets', 'businesses', 'property', 'companies', 'funds', 'tokens', 'lab', 'lifestyle', 'debts']);
    expect(rows.at(-1)).toEqual({ key: 'debts', value: -120 });
  });
});
