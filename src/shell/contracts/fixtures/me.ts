// 17B CH-00 seeded `me` fixture: cash and opening positions (whole units, prices in minor units). Demo data.
export const START_CASH_MINOR = 25_000_000; // 250,000.00 FDL
export const POSITIONS: readonly { assetId: string; qty: number; avgCostMinor: number }[] = [
  { assetId: "HALC", qty: 1200, avgCostMinor: 3990 },
  { assetId: "VOLT", qty: 300, avgCostMinor: 7710 },
  { assetId: "AVB", qty: 150, avgCostMinor: 9400 },
];
