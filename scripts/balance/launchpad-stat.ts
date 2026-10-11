// The Launchpad gate's statistics (lead-launchpad.md L8.3, v1.3). Pure functions, so the vitest suite can check them without a world.

/** The arithmetic mean (zero for an empty list). */
export function mean(xs: number[]): number {
  return xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** The sample standard deviation (n - 1 in the denominator); zero for fewer than two values. */
export function sampleSd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

/** The one-sided 95% upper bound of the mean over seeds: mean + 1.645 standard errors. */
export function oneSided95(xs: number[]): number {
  if (xs.length === 0) return 0;
  return mean(xs) + (1.645 * sampleSd(xs)) / Math.sqrt(xs.length);
}

/**
 * A bot's Launchpad P&L per dollar it put in (L8.3): its cash flows through the Launchpad commands, including the liquidation of what it
 * still holds at the horizon, over the cash it deployed (every outflow to the curve, the engine's order path, a buzz item or a launch).
 * A bot that deployed nothing has no ratio to test, so it is zero (an idle bot passes trivially and is checked for drift instead).
 */
export function pnlPerDollar(pnl: number, deployed: number): number {
  return deployed > 0 ? pnl / deployed : 0;
}

/** The gate line of L8.3: a statistic passes when its one-sided 95% bound over seeds is at or below zero. */
export function passesGate(xs: number[]): boolean {
  return oneSided95(xs) <= 0;
}

/**
 * A strategy's gate (L8.3, v1.2 review item 2): the bound passes AND no position was left unliquidated over the run. A position the
 * book or the curve could not take is valued at zero in the P&L, which would bias the bot toward a pass, so any leftover fails it.
 */
export function strategyPasses(xs: number[], leftover: number): boolean {
  return leftover === 0 && passesGate(xs);
}
