// T03-08 accountsOfAsset index (QA #80 follow-up): asset id → the keys of its quantity-bearing accounts (live ∪ dormant), each with
// the tick it was opened (E-79 Account.openedTick). Derived from State.assetOpened, which the commit maintains on account create and
// delete, so accountsOfAsset reads O(holders of the asset) instead of copying and scanning every account.
import { chartEntry, parseAccountKey } from './accounts';
import { SortedMap } from './det';
import type { Id, Tick } from './money';

/** The asset an account key holds: its sub when the chart code is quantity-bearing (T03-01 step 2), else undefined. */
export function assetOfKey(key: string): Id | undefined {
  const q = parseAccountKey(key);
  return q?.sub !== undefined && chartEntry(q.code)?.qtyBearing === true ? q.sub : undefined;
}

export class AssetIndex {
  private readonly by = new SortedMap<Id, SortedMap<string, Tick>>();
  static of(opened: SortedMap<string, Tick>): AssetIndex {
    const x = new AssetIndex(); for (const [k, t] of opened.entries()) x.add(k, t); return x;
  }
  add(key: string, opened: Tick): void {
    const a = assetOfKey(key); if (a === undefined) return;
    let m = this.by.get(a); if (!m) { m = new SortedMap(); this.by.set(a, m); }
    m.set(key, opened);
  }
  remove(key: string): void {
    const a = assetOfKey(key); const m = a === undefined ? undefined : this.by.get(a);
    if (a !== undefined && m) { m.delete(key); if (m.size === 0) this.by.delete(a); }
  }
  /** [key, openedTick] of every account of `assetId`, in key order. */
  of(assetId: Id): [string, Tick][] { return [...(this.by.get(assetId)?.entries() ?? [])]; }
}

/** Commit step: an account that now exists and is not yet tracked was opened at `tick`; one that no longer exists (neither live nor
 *  dormant) is closed. `rows` are [key, exists now]. Keeps `opened` and `index` in step. */
export function trackAssetAccounts(opened: SortedMap<string, Tick>, index: AssetIndex, rows: readonly (readonly [string, boolean])[], tick: Tick): void {
  for (const [k, exists] of rows) {
    if (exists) { if (!opened.has(k) && assetOfKey(k) !== undefined) { opened.set(k, tick); index.add(k, tick); } }
    else if (opened.delete(k)) index.remove(k);
  }
}
