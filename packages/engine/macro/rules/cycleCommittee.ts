// T04-03 step 3: the public Cycle Committee label (04 §3.3.6). Every day close, per bloc, after the regime step. Published prints only.
// The caller (T04-20) emits `macro.cycle.declared` (PUBLIC; bloc, cycleLabel, sinceDay) when `changed` is true.
import type { PublicMacroView, Regime } from '../schema';

type Prints = PublicMacroView['prints'];
type Label = PublicMacroView['cycleLabel'];

/** Latest growth print: the most recent of GDP_ADV, GDP_REV1, GDP_REV2 by tick (q/q annualized real growth). */
function latestGrowth(prints: Prints): number | null {
  let best: { tick: number; actual: number } | null = null;
  for (const k of ['GDP_ADV', 'GDP_REV1', 'GDP_REV2'] as const) {
    const p = prints[k];
    if (p !== null && (best === null || p.tick > best.tick)) best = { tick: p.tick, actual: p.actual };
  }
  return best === null ? null : best.actual;
}

function dataConfirms(s: Regime, prints: Prints, unemployment12mLow: number | null, nairu: number, inflationTarget: number): boolean {
  const g = latestGrowth(prints), jobs = prints.JOBS, cpi = prints.CPI;
  switch (s) {
    case 'CONTRACTION':
      return (g !== null && g < 0) || (jobs !== null && unemployment12mLow !== null && jobs.actual >= unemployment12mLow + 0.005);
    case 'EXPANSION':
    case 'RECOVERY':
      return g !== null && g > 0;
    case 'OVERHEATING':
      return cpi !== null && jobs !== null && cpi.actual >= inflationTarget + 0.01 && jobs.actual < nairu;
  }
}

/** §3.3.6: label := trueRegime when trueRegime ≠ label, daysInTrue ≥ lagDays (PARAM.macro_cycle_label_lag_days) and the data confirm it.
 *  The label is 'UNDETERMINED' from genesis until the first declaration. No smoothing (edge 19). */
export function cycleLabelStep(trueRegime: Regime, daysInTrue: number, current: Label, prints: Prints,
  unemployment12mLow: number | null, nairu: number, inflationTarget: number, lagDays: number): { label: Label; changed: boolean } {
  if (trueRegime !== current && daysInTrue >= lagDays && dataConfirms(trueRegime, prints, unemployment12mLow, nairu, inflationTarget)) return { label: trueRegime, changed: true };
  return { label: current, changed: false };
}
