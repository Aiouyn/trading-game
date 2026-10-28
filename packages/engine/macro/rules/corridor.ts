// T04-08 `corridorOf` (04 §3.8.1, T04-08 L41/L77), added by the T04-06 PR because T04-08 has not merged (E-100 (j)); T04-08 owns it
// afterwards. `setCorridor` (facilities, FACILITY_RATE_E6 fact) stays with T04-08 / T04-20.

/** lendingRate = i + w, depositRate = i − w; without negative rates the deposit rate is floored at 0. */
export function corridorOf(i: number, negativeRatesAllowed: boolean, w: number): { lendingRate: number; depositRate: number } {
  const dep = i - w;
  return { lendingRate: i + w, depositRate: !negativeRatesAllowed && dep < 0 ? 0 : dep };
}
