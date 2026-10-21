// 17B CH-00 seeded asset universe for the mock feed. Prices are integers in minor units (10^-displayDecimals);
// the mock server formats them to decimal strings (G2). Names are demo data, not copy.
import type { AssetDetail } from "../channels";

export interface AssetFixture extends Omit<AssetDetail, "tradingState" | "stateUntilTick"> {
  /** Opening price in minor units. */ base: number;
  /** Typical per-tick move in basis points. */ volBp: number;
  /** Typical per-tick traded quantity (whole units). */ lot: number;
}

export const ASSETS: readonly AssetFixture[] = [
  { assetId: "HALC", ticker: "HALC", name: "Halcyon Shipping", class: "equity", sector: "Industrials", bloc: "Atlantic", ccy: "FDL", displayDecimals: 2, qtyDecimals: 0, licenseTier: "LIC1", base: 4218, volBp: 18, lot: 400 },
  { assetId: "GX", ticker: "GX", name: "Gilt Exchange Index", class: "index", sector: "Index", bloc: "Atlantic", ccy: "FDL", displayDecimals: 2, qtyDecimals: 0, licenseTier: "LIC1", base: 420015, volBp: 6, lot: 0 },
  { assetId: "MRDN", ticker: "MRDN", name: "Meridian Foods", class: "equity", sector: "Consumer", bloc: "Atlantic", ccy: "FDL", displayDecimals: 2, qtyDecimals: 0, licenseTier: "LIC1", base: 1890, volBp: 12, lot: 900 },
  { assetId: "VOLT", ticker: "VOLT", name: "Voltaic Grid", class: "equity", sector: "Utilities", bloc: "Northern", ccy: "FDL", displayDecimals: 2, qtyDecimals: 0, licenseTier: "LIC1", base: 7604, volBp: 9, lot: 250 },
  { assetId: "ORCA", ticker: "ORCA", name: "Orca Biologics", class: "equity", sector: "Health", bloc: "Pacific", ccy: "FDL", displayDecimals: 2, qtyDecimals: 0, licenseTier: "LIC2", base: 2385, volBp: 35, lot: 600 },
  { assetId: "TIDE", ticker: "TIDE", name: "Tidewater REIT", class: "equity", sector: "Real estate", bloc: "Atlantic", ccy: "FDL", displayDecimals: 2, qtyDecimals: 0, licenseTier: "LIC1", base: 5530, volBp: 8, lot: 300 },
  { assetId: "KILN", ticker: "KILN", name: "Kiln Materials", class: "equity", sector: "Materials", bloc: "Northern", ccy: "FDL", displayDecimals: 2, qtyDecimals: 0, licenseTier: "LIC1", base: 1244, volBp: 22, lot: 1200 },
  { assetId: "AVB", ticker: "AVB", name: "Avalon Bank", class: "equity", sector: "Financials", bloc: "Atlantic", ccy: "FDL", displayDecimals: 2, qtyDecimals: 0, licenseTier: "LIC1", base: 9812, volBp: 11, lot: 200 },
];

export const ASSET_BY_ID: Readonly<Record<string, AssetFixture>> = Object.fromEntries(ASSETS.map((a) => [a.assetId, a]));

/** ticker:wl_default lists every fixture asset (≤ 50, 17 §2.6). */
export const WATCHLISTS: Readonly<Record<string, readonly string[]>> = {
  wl_default: ASSETS.map((a) => a.assetId),
};
