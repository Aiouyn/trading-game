// One net worth definition (M1-08 Portfolio, M2-03 leaderboard): saved total cash (cash a working buy limit holds is
// still the player's, so it is not taken out) plus each holding at the server mark, in integer minor units. Fees were
// already paid from cash when the fill was booked; units offered in a sell limit are still held. No other equity.
// A mark is in the asset's price minor unit (10^-displayDecimals $): cents for the catalog's dp-2 assets, 1e-8 $ for a
// coin listed at graduation (L4), so a value is converted to cents with centsOf (exact, half up; identity at dp 2).

/** `minor` (a price × qty in 10^-dp $) in cents, half up; `up` rounds any remainder up (what a buyer pays). Exact while
 *  minor / 10^(dp-2) stays under about 9e9 cents (a double carries the quotient exactly enough there); the Broker door
 *  refuses a fill whose price × qty is not a safe integer. */
export const centsOf = (dp: number, minor: number, up = false): number => (up ? Math.ceil : Math.round)(minor / 10 ** (dp - 2));

/** Holdings value at the given marks; null when any held asset has no mark (it cannot be valued). */
export function heldValueMinor(positions: Iterable<{ readonly assetId: string; readonly qty: number }>, mark: (assetId: string) => number | null, dpOf: (assetId: string) => number = () => 2): number | null {
  let held = 0;
  for (const p of positions) {
    const m = mark(p.assetId);
    if (m === null) return null;
    held += centsOf(dpOf(p.assetId), m * p.qty);
  }
  return held;
}

/** Net worth = total cash + holdings at the marks (null when a holding cannot be valued). */
export function netWorthMinor(cashCents: number, positions: Iterable<{ readonly assetId: string; readonly qty: number }>, mark: (assetId: string) => number | null, dpOf?: (assetId: string) => number): number | null {
  const held = heldValueMinor(positions, mark, dpOf);
  return held === null ? null : cashCents + held;
}
