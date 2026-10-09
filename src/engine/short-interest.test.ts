import { describe, expect, it } from 'vitest';
import { createWorld } from './sim';
import { universeConfig } from './universe';
import { openAccount, publicShortInterest } from './trading';
import type { WorldState } from './types';

const STOCK = 'OSTV';

/** Opens one account per entry in `qtys` and gives each a short position of that size in `assetId`. */
function withShorts(s: WorldState, assetId: string, qtys: number[]): WorldState {
  let out = s;
  qtys.forEach((q, i) => {
    const id = `sh${i}`;
    out = openAccount(out, id);
    const acct = out.accounts[id]!;
    const positions = { ...acct.positions, [assetId]: { qty: -q, avgCost: 10, realizedPnl: 0 } };
    out = { ...out, accounts: { ...out.accounts, [id]: { ...acct, positions } } };
  });
  return out;
}

describe('public short interest', () => {
  const base = createWorld('short-interest', universeConfig());
  const shares = base.config.assets.find((a) => a.id === STOCK)!.sharesOutstanding!;

  it('is zero for every stock when nobody is short, and covers stocks only', () => {
    const si = publicShortInterest(base);
    const stocks = base.config.assets.filter((a) => a.assetClass === 'stock' && a.sharesOutstanding);
    expect(Object.keys(si).sort()).toEqual(stocks.map((a) => a.id).sort());
    expect(Object.values(si).every((v) => v === 0)).toBe(true);
  });

  it('withholds the figure when fewer than 5 accounts are short (a lone short would be read out of it)', () => {
    const si = publicShortInterest(withShorts(base, STOCK, [1000, 2000, 3000, 4000]));
    expect(si[STOCK]).toBeNull();
  });

  it('publishes the aggregate share of shares outstanding once 5 accounts are short and none dominates', () => {
    const si = publicShortInterest(withShorts(base, STOCK, [1000, 1000, 1000, 1000, 1000]));
    expect(si[STOCK]).toBeCloseTo(Math.round((5000 / shares) * 1e4) / 1e4, 10);
  });

  it('withholds the figure when one account holds more than 40% of the total short', () => {
    const si = publicShortInterest(withShorts(base, STOCK, [9000, 250, 250, 250, 250]));
    expect(si[STOCK]).toBeNull();
  });

  it('names no account: only asset ids are keys', () => {
    const si = publicShortInterest(withShorts(base, STOCK, [1000, 1000, 1000, 1000, 1000]));
    const keys = Object.keys(si);
    expect(keys.every((k) => base.config.assets.some((a) => a.id === k))).toBe(true);
    expect(keys.some((k) => k.startsWith('sh'))).toBe(false);
  });
});
