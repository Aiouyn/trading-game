// M1-09 server only: the clock's feed, which can move a price on a Wire story. Kept out of MockFeed so the client bundle
// (every signed-in and guest feed) does not carry code only the server clock runs.
import { ASSET_BY_ID } from "@/market/catalog";
import { MockFeed, fmt } from "@/shell/contracts/mockFeed";

/** A story's effect on a price in minor units: integer, at least 1 (as the quote walk). */
export const shockedMinor = (last: number, bp: number): number => Math.max(1, Math.round((last * (10_000 + bp)) / 10_000));

export class ShockFeed extends MockFeed {
  /** Move one asset's price by a story's effect at the current tick, after this tick's walk step. Returns the price
   *  before and after in minor units, or null for an unknown or non-trading asset. The quote walk itself is not
   *  redrawn: its next step starts from the new price. */
  applyShock(assetId: string, bp: number): { from: number; to: number } | null {
    const s = this.assets.get(assetId);
    if (!s || this.tradingState(assetId) !== "CONTINUOUS") return null;
    const from = s.last, to = shockedMinor(from, bp);
    s.last = to;
    s.dir = to > from ? 1 : to < from ? -1 : s.dir;
    const p = s.prints.at(-1);
    if (p && p.tick === this.tick) s.prints = [...s.prints.slice(0, -1), { ...p, price: fmt(to, ASSET_BY_ID[assetId]!.displayDecimals) }];
    return { from, to };
  }
}
