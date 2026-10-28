// UI card 10 (BRK-D): an asset's public detail (05 §2.2) for the Broker asset page. The `req asset.detail` seam: today
// it reads the ASSETS fixture plus the ticker row's `state`; on SWAP the body becomes that request and `tradingState`
// comes from its reply (then `stateUntilTick` too, absent here).
import type { AssetDetail, TradingState } from "./channels";
import { ASSET_BY_ID } from "./fixtures/assets";

/** The asset's detail, or null when the universe has no such asset or no ticker state is known for it yet. The
 *  fixture's mock-only fields (base, volBp, lot) are not part of the contract and never leave this module. */
export function getAssetDetail(assetId: string, tradingState: TradingState | undefined): AssetDetail | null {
  const a = Object.hasOwn(ASSET_BY_ID, assetId) ? ASSET_BY_ID[assetId]! : null;
  if (a === null || tradingState === undefined) return null;
  return {
    assetId: a.assetId, ticker: a.ticker, name: a.name, class: a.class, sector: a.sector, bloc: a.bloc, ccy: a.ccy,
    displayDecimals: a.displayDecimals, qtyDecimals: a.qtyDecimals, licenseTier: a.licenseTier, tradingState,
  };
}

/** The company name for a header line, from the same seam; null for an unknown asset. */
export function assetName(assetId: string): string | null {
  return Object.hasOwn(ASSET_BY_ID, assetId) ? ASSET_BY_ID[assetId]!.name : null;
}
