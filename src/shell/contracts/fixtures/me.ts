// 17B CH-00 seeded `me` fixture: cash and opening positions (whole units, prices in minor units). Demo data.
/** THE mock net worth at START_TICK: one source for the shell top bar (mockChannels `me.nw`) and the `me` feed (the
 *  Portfolio hero). The feed derives opening FDL cash from it (cash = NW - positions at their base marks) and, once
 *  live, the top bar reads the same `me` channel (src/components/shell/useNw.ts), so both always show the same
 *  string. */
export const START_NW = "412860.15";
export const START_NW_MINOR = 41_286_015;
/** Second wallet (E-61 code, no symbol). A separate currency: not converted, not part of `nw` (nothing converts in the mock). */
export const MDOL_BALANCE = "1250.00";
/** Restricted FDL inside the FDL balance (so inside `nw`): an ad grant releasing 3 real hours after START_TICK
 *  (2,160 ticks of 5 s) and the fresh-start grant, held with no release time. Reason codes as in 17B (AD / START). */
export const RESTRICTED: readonly { reason: string; amountMinor: number; releaseTick: number | null }[] = [
  { reason: "AD", amountMinor: 50_000, releaseTick: 38 * 720 + 340 + 2_160 },
  { reason: "START", amountMinor: 250_000, releaseTick: null },
];
/** Whole-NW stats (Q10, E-56 §12): 90-day window; drawdownReal is percent units ("-4.2" = -4.2 %). */
export const NW_STATS = { window: "90d", drawdownReal: "-4.2", sharpe: "1.31", twrIdx: "1.0842", bench: "1.0315" } as const;
export const POSITIONS: readonly { assetId: string; qty: number; avgCostMinor: number }[] = [
  { assetId: "HALC", qty: 1200, avgCostMinor: 3990 },
  { assetId: "VOLT", qty: 300, avgCostMinor: 7710 },
  { assetId: "AVB", qty: 150, avgCostMinor: 9400 },
];
