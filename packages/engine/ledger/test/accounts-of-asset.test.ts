// T03-08 (E-79): LedgerWorld/LedgerApi.accountsOfAsset and committedQty. accountsOfAsset lists the accounts of every holder of
// one asset (quantity-bearing chart code, sub === assetId), live and dormant, in key order; committedQty is the per-key quantity.
import { describe, expect, it } from 'vitest';
import type { Account } from '../src';
import { fixture } from './fixture';

const BOND = 'ast_BOND_X';
const issued = () => {
  const w = fixture(); const L = w.apiFor('04').ledger;
  L.mint('fnd_F', 10_000_000_000_000n, 'FDL', 'MAC_GENESIS_ENDOWMENT'); w.runP13();
  L.swapAsset('fnd_F', 'gov_FDL', BOND, 1000n, 10_000_000_000_000n, 'FDL', 'SOV_BOND_ISSUE', { assetAcct: 1520 });
  expect(w.runP13().failures).toEqual([]);
  return w;
};
const keys = (r: readonly Account[]) => r.map((a) => a.key);

describe('T03-08 accountsOfAsset / committedQty (E-79)', () => {
  it('after a bond issue: the holder 1520 and issuer 2310 accounts, sorted by key, as full Account rows', () => {
    const w = issued(); const r = w.accountsOfAsset(BOND);
    expect(r).toEqual([
      { key: `fnd_F:1520:${BOND}:FDL`, entityId: 'fnd_F', code: 1520, sub: BOND, ccy: 'FDL', class: 'ASSET', balance: 10_000_000_000_000n, qty: 1000n, assetId: BOND, isMoney: false },
      { key: `gov_FDL:2310:${BOND}:FDL`, entityId: 'gov_FDL', code: 2310, sub: BOND, ccy: 'FDL', class: 'LIABILITY', balance: w.balance(`gov_FDL:2310:${BOND}:FDL`), qty: w.qtyOf(`gov_FDL:2310:${BOND}:FDL`), assetId: BOND, isMoney: false },
    ]);
    expect(r[0].openedTick).toBeUndefined();
    expect(w.apiFor('04').ledger.accountsOfAsset(BOND)).toEqual(r); // the phase read surface is the same view
  });
  it('a QE purchase adds the cbk holder; result is in key order; other assets and non-qty codes are excluded', () => {
    const w = issued(); const L = w.apiFor('04').ledger;
    L.cbCredit('cbk_FDL', 'fnd_F', 10_000_000_000_000n, 'FDL', 'CBK_ASSET_PURCHASE', { qty: 400n, assetId: BOND, assetAcct: 1520 });
    expect(w.runP13().failures).toEqual([]);
    const r = w.accountsOfAsset(BOND); const k = keys(r);
    expect(k).toContain(`cbk_FDL:1520:${BOND}:FDL`);
    expect(k).toEqual([...k].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    expect(w.accountsOfAsset('ast_OTHER')).toEqual([]);
    // a non-quantity-bearing code with the same sub (1120 dividends receivable) is not an asset holding
    w.testHooks().accounts.set(`chr_A:1120:${BOND}:FDL`, { balance: 5n, qty: 0n });
    // a sub that only starts with the asset id is a different asset
    w.testHooks().accounts.set(`chr_A:1520:${BOND}_2:FDL`, { balance: 5n, qty: 5n });
    expect(keys(w.accountsOfAsset(BOND))).toEqual(k);
    const sum = r.filter((a) => a.class === 'ASSET').reduce((s, a) => s + (a.qty ?? 0n), 0n);
    expect(sum).toBe(1000n); // the 400 moved from fnd_F to cbk_FDL: holdings are conserved
    expect(r.find((a) => a.entityId === 'cbk_FDL')?.qty).toBe(400n);
    expect(r.find((a) => a.entityId === 'fnd_F')?.qty).toBe(600n);
  });
  it('a dormant (emptied) account stays listed (lazy open) with 0n/0n', () => {
    const w = issued(); const k = `chr_A:1520:${BOND}:FDL`;
    w.testHooks().dormant.set(k, { balance: 0n, qty: 0n });
    const row = w.accountsOfAsset(BOND).find((a) => a.key === k);
    expect(row).toMatchObject({ entityId: 'chr_A', code: 1520, balance: 0n, qty: 0n, assetId: BOND });
  });
  it('isMoney / class come from the chart (1009 elastic qty is never an asset holding; a money code is never qty-bearing)', () => {
    const w = issued();
    w.testHooks().accounts.set(`hh_C1:1009:${BOND}:FDL`, { balance: 1n, qty: 1n });
    w.testHooks().accounts.set(`hh_C1:1500:${BOND}:FDL`, { balance: 2n, qty: 3n });
    const r = w.accountsOfAsset(BOND);
    expect(keys(r)).not.toContain(`hh_C1:1009:${BOND}:FDL`);
    expect(r.find((a) => a.key === `hh_C1:1500:${BOND}:FDL`)).toEqual({ key: `hh_C1:1500:${BOND}:FDL`, entityId: 'hh_C1', code: 1500, sub: BOND, ccy: 'FDL', class: 'ASSET', balance: 2n, qty: 3n, assetId: BOND, isMoney: false });
  });
  it('committedQty: per key, 0n when absent, equals position() for the single holding, on world and phase api', () => {
    const w = issued(); const k = `fnd_F:1520:${BOND}:FDL`;
    expect(w.committedQty(k)).toBe(1000n);
    expect(w.apiFor('04').ledger.committedQty(k)).toBe(1000n);
    expect(w.committedQty(`chr_A:1520:${BOND}:FDL`)).toBe(0n);
    expect(w.committedQty(k)).toBe(w.position('fnd_F', BOND));
  });
});
