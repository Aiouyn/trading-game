// Runtime listing path (lead-launchpad L4): the engine's appendAsset for this base. A graduated Launchpad coin becomes one
// more asset of the shared catalog (src/market/catalog.ts: ASSETS, ASSET_BY_ID and the default watchlist), so every
// existing consumer (the server clock's quotes, candles, the Broker door, the board, /api/world, and the signed-in
// client's feed, Broker, Portfolio and asset pages) sees it like any asset. The list version counts appends.
// Server: LiveMarket.list (src/server/market/clock.ts). Signed-in client: the market snapshot carries the listed defs and
// the feed loads this module lazily the first time one is new (src/shell/contracts/mockFeed.ts), so first-load code does
// not grow. Defs are public data (name, ticker, class, decimals, listing price); nothing account-specific.
// The catalog is passed in, not imported: a second (lazy) importer would split src/market/catalog.ts out of the
// first-load module it is bundled into and cost the Broker route's first load (S1-20).
import type { AssetFixture } from "@/market/catalog";
import type { AssetState } from "@/shell/contracts/mockFeed";

/** The shared catalog's mutable parts (src/market/catalog.ts). */
export interface Catalog { readonly ASSETS: readonly AssetFixture[]; readonly ASSET_BY_ID: Readonly<Record<string, AssetFixture>>; readonly WATCHLISTS: Readonly<Record<string, readonly string[]>> }

/** Listed coins quote in 1e-8 dollars: the curve's last price is about $0.000216, which cents cannot carry. */
export const LISTED_DP = 8;

/** The public def of a graduated coin (L4: class crypto; sector stays 'crypto', v1.1 ratified; ccy and licence as the
 *  base catalog's defaults). `base` is the listing price (the last curve price). volBp 0: the base walk does not move it,
 *  the clock's meme-template step does (src/server/market/meme.ts). lot 0: no invented NPC prints or depth. */
export function listedDef(ticker: string, name: string, baseMinor: number): AssetFixture {
  return {
    assetId: ticker, ticker, name, class: "crypto", sector: "Crypto", bloc: "Global", ccy: "FDL",
    displayDecimals: LISTED_DP, qtyDecimals: 0, licenseTier: "LIC1", base: baseMinor, volBp: 0, lot: 0,
  };
}

const appended: AssetFixture[] = [];
let into: Catalog | null = null;
let version = 0;

/** Times the catalog grew in this process (L4 "list-version bump"). */
export const listVersion = (): number => version;
/** The appended defs, oldest first (copies). */
export const listedAssets = (): AssetFixture[] => appended.map((a) => ({ ...a }));
export const isListed = (assetId: string): boolean => appended.some((a) => a.assetId === assetId);

/** Add one def to the catalog. Idempotent per assetId (the same def again changes nothing); a def that collides with a
 *  different existing asset is refused (false). */
export function appendAsset(def: AssetFixture, { ASSETS, ASSET_BY_ID, WATCHLISTS }: Catalog): boolean {
  const cur = Object.hasOwn(ASSET_BY_ID, def.assetId) ? ASSET_BY_ID[def.assetId]! : null;
  if (cur) return isListed(def.assetId) && JSON.stringify(cur) === JSON.stringify(def);
  const a = { ...def };
  (ASSETS as AssetFixture[]).push(a);
  (ASSET_BY_ID as Record<string, AssetFixture>)[a.assetId] = a;
  (WATCHLISTS.wl_default as string[]).push(a.assetId);
  appended.push(a);
  into = { ASSETS, ASSET_BY_ID, WATCHLISTS };
  version += 1;
  return true;
}

/** Strict parse of the snapshot's `listed` defs (signed-in client). Null for anything that is not exactly listed defs. */
export function parseListed(raw: unknown): AssetFixture[] | null {
  if (!Array.isArray(raw) || raw.length > 500) return null;
  const out: AssetFixture[] = [];
  for (const d of raw) {
    if (!d || typeof d !== "object" || Array.isArray(d)) return null;
    const o = d as Record<string, unknown>;
    if (typeof o.ticker !== "string" || !/^[A-Z]{3,5}$/.test(o.ticker) || o.assetId !== o.ticker) return null;
    if (typeof o.name !== "string" || o.name.length < 3 || o.name.length > 24) return null;
    if (!Number.isSafeInteger(o.base) || (o.base as number) < 1) return null;
    const def = listedDef(o.ticker, o.name, o.base as number);
    if (Object.keys(o).length !== Object.keys(def).length || Object.keys(def).some((k) => o[k] !== def[k as keyof AssetFixture])) return null;
    out.push(def);
  }
  return out;
}

/** Give a listed def quote state in a feed at its listing price (no prints, no volume). Idempotent. */
export function listAsset(assets: Map<string, AssetState>, a: AssetFixture): void {
  if (!assets.has(a.assetId)) assets.set(a.assetId, { last: a.base, prevClose: a.base, dayVol: 0, prints: [], lastQty: 0, dir: 0 });
}

/** Signed-in client: add the snapshot's listed defs to the catalog and have the feed quote them. Runs on every server
 *  quote that carries listings; a def already adopted changes nothing. False when the reply is not exactly listed defs
 *  or one collides with a different asset (nothing is quoted from it then). */
export function adoptListed(raw: unknown, feed: { readonly assets: Map<string, AssetState> }, cat: Catalog): boolean {
  const defs = parseListed(raw);
  if (!defs || !defs.every((d) => appendAsset(d, cat))) return false;
  for (const d of defs) listAsset(feed.assets, cat.ASSET_BY_ID[d.assetId]!);
  return true;
}

/** Test-only: remove every appended def (the catalog is process-global). */
export function resetListingsForTests(): void {
  if (!into) return;
  const { ASSETS, ASSET_BY_ID, WATCHLISTS } = into;
  for (const a of appended) {
    (ASSETS as AssetFixture[]).splice(ASSETS.indexOf(a), 1);
    delete (ASSET_BY_ID as Record<string, AssetFixture>)[a.assetId];
    const wl = WATCHLISTS.wl_default as string[];
    wl.splice(wl.indexOf(a.assetId), 1);
  }
  appended.length = 0;
}
