// One net worth definition (M1-08 Portfolio, M2-03 leaderboard): saved total cash (cash a working buy limit holds is
// still the player's, so it is not taken out) plus each holding at the server mark, in integer minor units. Fees were
// already paid from cash when the fill was booked; units offered in a sell limit are still held. No other equity.

/** Holdings value at the given marks; null when any held asset has no mark (it cannot be valued). */
export function heldValueMinor(positions: Iterable<{ readonly assetId: string; readonly qty: number }>, mark: (assetId: string) => number | null): number | null {
  let held = 0;
  for (const p of positions) {
    const m = mark(p.assetId);
    if (m === null) return null;
    held += m * p.qty;
  }
  return held;
}

/** Net worth = total cash + holdings at the marks (null when a holding cannot be valued). */
export function netWorthMinor(cashCents: number, positions: Iterable<{ readonly assetId: string; readonly qty: number }>, mark: (assetId: string) => number | null): number | null {
  const held = heldValueMinor(positions, mark);
  return held === null ? null : cashCents + held;
}
