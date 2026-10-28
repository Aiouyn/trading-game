// T03-08 (E-79): LedgerWorld/LedgerApi.accountsOfAsset and committedQty. accountsOfAsset lists the accounts of every holder of
// one asset (quantity-bearing chart code, sub === assetId), live and dormant, in key order; committedQty is the per-key quantity.
// QA #80 follow-ups: accountsOfAsset reads a by-asset index kept on account create / delete, and Account.openedTick is required again.
import { describe, expect, it } from 'vitest';
import { LedgerWorld, type Account } from '../src';
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
      { key: `fnd_F:1520:${BOND}:FDL`, entityId: 'fnd_F', code: 1520, sub: BOND, ccy: 'FDL', class: 'ASSET', balance: 10_000_000_000_000n, qty: 1000n, assetId: BOND, isMoney: false, openedTick: 1 },
      { key: `gov_FDL:2310:${BOND}:FDL`, entityId: 'gov_FDL', code: 2310, sub: BOND, ccy: 'FDL', class: 'LIABILITY', balance: w.balance(`gov_FDL:2310:${BOND}:FDL`), qty: w.qtyOf(`gov_FDL:2310:${BOND}:FDL`), assetId: BOND, isMoney: false, openedTick: 1 },
    ]);
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
    w.runP13(); // outside writes abort the tick (INV-LED-009) but stay in the store, so the index takes them in
    expect(keys(w.accountsOfAsset(BOND))).toEqual(k);
    expect(keys(w.accountsOfAsset(`${BOND}_2`))).toEqual([`chr_A:1520:${BOND}_2:FDL`]);
    const sum = r.filter((a) => a.class === 'ASSET').reduce((s, a) => s + (a.qty ?? 0n), 0n);
    expect(sum).toBe(1000n); // the 400 moved from fnd_F to cbk_FDL: holdings are conserved
    expect(r.find((a) => a.entityId === 'cbk_FDL')?.qty).toBe(400n);
    expect(r.find((a) => a.entityId === 'fnd_F')?.qty).toBe(600n);
  });
  it('a dormant (emptied) account stays listed (lazy open) with 0n/0n and keeps its open tick', () => {
    const w = issued(); const k = `fnd_F:1520:${BOND}:FDL`;
    w.apiFor('04').ledger.cbCredit('cbk_FDL', 'fnd_F', 10_000_000_000_000n, 'FDL', 'CBK_ASSET_PURCHASE', { qty: 1000n, assetId: BOND, assetAcct: 1520 });
    expect(w.runP13().failures).toEqual([]);
    expect(w.testHooks().dormant.has(k)).toBe(true);
    const r = w.accountsOfAsset(BOND);
    expect(r.find((a) => a.key === k)).toMatchObject({ entityId: 'fnd_F', code: 1520, balance: 0n, qty: 0n, assetId: BOND, openedTick: 1 });
    expect(r.find((a) => a.entityId === 'cbk_FDL')).toMatchObject({ qty: 1000n, openedTick: 2 });
  });
  it('index = full scan: openedTick is the creating commit, later writes keep it, a deleted account drops out, restore rebuilds it', () => {
    const w = issued(); const L = w.apiFor('04').ledger;
    const scan = (x: LedgerWorld) => x.accounts().map(([key]) => key).filter((key) => key.includes(`:${BOND}:`) && /:(1520|2310):/.test(key));
    L.cbCredit('cbk_FDL', 'fnd_F', 1_000_000_000_000n, 'FDL', 'CBK_ASSET_PURCHASE', { qty: 100n, assetId: BOND, assetAcct: 1520 }); w.runP13();
    L.cbCredit('cbk_FDL', 'fnd_F', 1_000_000_000_000n, 'FDL', 'CBK_ASSET_PURCHASE', { qty: 100n, assetId: BOND, assetAcct: 1520 }); w.runP13();
    const r = w.accountsOfAsset(BOND);
    expect(keys(r)).toEqual(scan(w));
    expect(r.map((a) => [a.entityId, a.openedTick])).toEqual([['cbk_FDL', 2], ['fnd_F', 1], ['gov_FDL', 1]]);
    expect(r.find((a) => a.entityId === 'cbk_FDL')?.qty).toBe(200n);
    const cp = w.checkpoint(); const w2 = new LedgerWorld(); w2.restore(cp); const snap2 = w2.snapshot();
    expect(w2.accountsOfAsset(BOND)).toEqual(r);
    w.testHooks().accounts.delete(`cbk_FDL:1520:${BOND}:FDL`); w.runP13();
    expect(keys(w.accountsOfAsset(BOND))).toEqual([`fnd_F:1520:${BOND}:FDL`, `gov_FDL:2310:${BOND}:FDL`]);
    expect(w2.accountsOfAsset(BOND)).toEqual(r); // the restored copy is independent
    expect(w2.snapshot()).toBe(snap2);
    // re-created after the delete: a new account, so a new open tick
    const t = w.tick; w.testHooks().accounts.set(`cbk_FDL:1520:${BOND}:FDL`, { balance: 1n, qty: 1n }); w.runP13();
    expect(w.accountsOfAsset(BOND).find((a) => a.entityId === 'cbk_FDL')?.openedTick).toBe(t);
  });
  it('an aborted tick indexes nothing it staged', () => {
    const w = issued(); const L = w.apiFor('04').ledger;
    L.cbCredit('cbk_FDL', 'fnd_F', 1_000_000_000_000n, 'FDL', 'CBK_ASSET_PURCHASE', { qty: 100n, assetId: BOND, assetAcct: 1520 });
    w.testHooks().accounts.set(`chr_A:1001:FDL`, { balance: -5n, qty: 0n }); // forces an abort (INV-LED-009)
    expect(w.runP13().safeMode).toBe(true);
    expect(keys(w.accountsOfAsset(BOND))).toEqual([`fnd_F:1520:${BOND}:FDL`, `gov_FDL:2310:${BOND}:FDL`]);
  });
  it('isMoney / class come from the chart (1009 elastic qty is never an asset holding; a money code is never qty-bearing)', () => {
    const w = issued();
    w.testHooks().accounts.set(`hh_C1:1009:${BOND}:FDL`, { balance: 1n, qty: 1n });
    w.testHooks().accounts.set(`hh_C1:1500:${BOND}:FDL`, { balance: 2n, qty: 3n });
    w.runP13();
    const r = w.accountsOfAsset(BOND);
    expect(keys(r)).not.toContain(`hh_C1:1009:${BOND}:FDL`);
    expect(r.find((a) => a.key === `hh_C1:1500:${BOND}:FDL`)).toEqual({ key: `hh_C1:1500:${BOND}:FDL`, entityId: 'hh_C1', code: 1500, sub: BOND, ccy: 'FDL', class: 'ASSET', balance: 2n, qty: 3n, assetId: BOND, isMoney: false, openedTick: 2 });
  });
  it('committedQty: per key, 0n when absent, equals position() for the single holding, on world and phase api', () => {
    const w = issued(); const k = `fnd_F:1520:${BOND}:FDL`;
    expect(w.committedQty(k)).toBe(1000n);
    expect(w.apiFor('04').ledger.committedQty(k)).toBe(1000n);
    expect(w.committedQty(`chr_A:1520:${BOND}:FDL`)).toBe(0n);
    expect(w.committedQty(k)).toBe(w.position('fnd_F', BOND));
  });
});

import { accountKey } from '../src/accounts';
import { AssetIndex, trackAssetAccounts } from '../src/assetIndex';
import { SortedMap } from '../src/det';
describe('QA #82: the by-asset index forgets closed accounts (no leak)', () => {
  it('trackAssetAccounts on close removes the key from the index and the opened map; the last key drops the asset bucket', () => {
    const opened = new SortedMap<string, number>(), ix = new AssetIndex();
    const k1 = accountKey('fnd_A', 1520, 'FDL', BOND), k2 = accountKey('fnd_B', 1520, 'FDL', BOND);
    trackAssetAccounts(opened, ix, [[k1, true], [k2, true]], 5);
    expect(ix.of(BOND)).toEqual([[k1, 5], [k2, 5]].sort((a, b) => (a[0]! < b[0]! ? -1 : 1)));
    trackAssetAccounts(opened, ix, [[k1, false]], 6);
    expect([ix.of(BOND), opened.has(k1)]).toEqual([[[k2, 5]], false]);
    trackAssetAccounts(opened, ix, [[k2, false]], 7);
    expect([ix.of(BOND), opened.size]).toEqual([[], 0]);
    expect((ix as unknown as { by: SortedMap<string, unknown> }).by.size).toBe(0);
  });
});

import { computeM0Scan } from '../src/invariants';
describe('QA #82: LedgerApi.m0 (T04-14 peg break-back adapter)', () => {
  it('m0(ccy) is the committed computeM0 of that currency', () => {
    const w = fixture(), L = w.apiFor('04').ledger;
    const m0a = L.m0('FDL');
    L.mint('fnd_F', 5_000_000n, 'FDL', 'MAC_GENESIS_ENDOWMENT'); w.runP13();
    const a = w.testHooks().accounts;
    expect(L.m0('FDL')).toBe(computeM0Scan(a, 'FDL'));
    expect(L.m0('FDL')).not.toBe(m0a);
    expect(L.m0('EUN')).toBe(computeM0Scan(a, 'EUN'));
  });
});
