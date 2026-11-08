// M1-09 server only: the clock's feed, which can move a price on a Wire story. Kept out of MockFeed so the client bundle
// (every signed-in and guest feed) does not carry code only the server clock runs.
import { ASSET_BY_ID, type AssetFixture } from "@/market/catalog";
import { MockFeed, fmt } from "@/shell/contracts/mockFeed";
import { listAsset } from "@/market/listings";
import { MemeProcess } from "./meme";

/** A story's effect on a price in minor units: integer, at least 1 (as the quote walk). */
export const shockedMinor = (last: number, bp: number): number => Math.max(1, Math.round((last * (10_000 + bp)) / 10_000));

export class ShockFeed extends MockFeed {
  /** Listed (graduated) coins and their meme-template paths, in listing order (L4). */
  private readonly memes = new Map<string, MemeProcess>();

  /** L4: give a def the catalog just appended its quote state at its listing price and its meme-template path. Idempotent. */
  listMeme(a: AssetFixture): void {
    if (this.memes.has(a.assetId)) return;
    listAsset(this.assets, a);
    Object.assign(this.assets.get(a.assetId)!, { last: a.base, prevClose: a.base }); // a clock built after the append starts it at its listing price too
    this.memes.set(a.assetId, new MemeProcess(a.assetId, a.base, a.displayDecimals));
  }

  /** The current mark of an asset in its minor unit, or null. */
  lastMinor(assetId: string): number | null {
    return this.assets.get(assetId)?.last ?? null;
  }

  /** The base walk for every asset (a listed coin has volBp 0 and lot 0 there: no move, no print), then one meme-template
   *  step per listed coin from its own stream, so the existing assets' paths are exactly those of a world without it. */
  override advance(): void {
    super.advance();
    for (const [id, m] of this.memes) {
      const s = this.assets.get(id);
      if (!s || this.tradingState(id) !== "CONTINUOUS") continue;
      const to = m.step();
      s.dir = to > s.last ? 1 : to < s.last ? -1 : 0;
      s.last = to;
    }
  }

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
