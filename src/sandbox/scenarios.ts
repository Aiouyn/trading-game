import type { RegimeId } from '@/engine';
import { SANDBOX, SCENARIO_RULES } from './config';

/**
 * Scenario seeds (docs/team/specs/quant-scenario-seeds.md): short, hand-checked markets. A scenario is a seed, not a
 * script. Playing one is the bundled engine on that seed with paper money. `title` and `note` are i18n keys.
 */
export type ScenarioId = 'contraction-week' | 'overheating' | 'flash' | 'earnings-heavy' | 'quiet' | 'crypto-winter';

export interface Scenario {
  id: ScenarioId;
  seed: string;
  title: string;
  days: number;
  startRegime: RegimeId;
  note: string;
}

/**
 * The seeds below are the first hits of a search over sbx:scenario:<id>:s<n> (n counted up from 1), with the
 * conditions in scenarioHolds. scenarios.test.ts re-runs each one, so a seed or rule change that breaks a condition
 * fails that test.
 */
export const SCENARIOS: Scenario[] = [
  { id: 'contraction-week', seed: 'sbx:scenario:contraction-week:s3', title: 'sandbox.scenario.contraction-week.title', days: 21, startRegime: 'contraction', note: 'sandbox.scenario.contraction-week.note' },
  { id: 'overheating', seed: 'sbx:scenario:overheating:s8', title: 'sandbox.scenario.overheating.title', days: 21, startRegime: 'overheating', note: 'sandbox.scenario.overheating.note' },
  { id: 'flash', seed: 'sbx:scenario:flash:s66', title: 'sandbox.scenario.flash.title', days: 5, startRegime: 'expansion', note: 'sandbox.scenario.flash.note' },
  { id: 'earnings-heavy', seed: 'sbx:scenario:earnings-heavy:s1', title: 'sandbox.scenario.earnings-heavy.title', days: 21, startRegime: 'expansion', note: 'sandbox.scenario.earnings-heavy.note' },
  { id: 'quiet', seed: 'sbx:scenario:quiet:s2', title: 'sandbox.scenario.quiet.title', days: 21, startRegime: 'expansion', note: 'sandbox.scenario.quiet.note' },
  { id: 'crypto-winter', seed: 'sbx:scenario:crypto-winter:s5', title: 'sandbox.scenario.crypto-winter.title', days: 21, startRegime: 'contraction', note: 'sandbox.scenario.crypto-winter.note' },
];

export function scenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

/**
 * What one run of a scenario looked like, sampled at each game-day close (k = 0 is the start, k = days the end).
 * Built by record.ts from a sandbox; the checks below read only this.
 */
export interface ScenarioRecord {
  days: number;
  ticksPerDay: number;
  /** GX index level at each day close */
  gx: number[];
  /** crypto index level at each day close */
  crx: number[];
  /** gold price at each day close */
  gold: number[];
  /** share of stocks (listed at both ends) that finished above their start */
  stockUpShare: number;
  /** distinct stocks with an earnings report inside the earnings window (the first days of the run) */
  earningsStocks: number;
  /** ticks at which a flash crash went live */
  flashStarts: number[];
}

function last(xs: number[]): number {
  return xs[xs.length - 1]!;
}

/** the largest rise from the first close, at any close (0 when the index never rose) */
function runUp(xs: number[]): number {
  return Math.max(0, ...xs.map((x) => x / xs[0]! - 1));
}

/** the largest fall from a running peak, at any close */
function maxDrawdown(xs: number[]): number {
  let peak = xs[0]!;
  let dd = 0;
  for (const x of xs) {
    peak = Math.max(peak, x);
    dd = Math.max(dd, 1 - x / peak);
  }
  return dd;
}

/** Does this run reproduce the scenario's headline condition? (quant-scenario-seeds.md, "What the player meets") */
export function scenarioHolds(s: Scenario, r: ScenarioRecord): boolean {
  const R = SCENARIO_RULES;
  switch (s.id) {
    case 'contraction-week':
      // a falling market, gold holds up
      return last(r.gx) < r.gx[0]! && last(r.gold) >= r.gold[0]!;
    case 'overheating':
      // a hot market that can roll over: a real run-up, then a real fall from the peak
      return runUp(r.gx) >= R.overheatRunUp && maxDrawdown(r.gx) >= R.overheatDrawdown;
    case 'flash': {
      // a flash crash goes live during the forced day (the second day)
      const lo = r.ticksPerDay * R.flashDay;
      return r.flashStarts.some((t) => t >= lo && t < lo + r.ticksPerDay);
    }
    case 'earnings-heavy':
      return r.earningsStocks >= R.earningsMin;
    case 'quiet':
      // no index day close moves more than the limit
      return r.gx.every((g, k) => k === 0 || Math.abs(g / r.gx[k - 1]! - 1) <= R.quietMaxDailyMove);
    case 'crypto-winter':
      // crypto down, stocks mixed
      return last(r.crx) < r.crx[0]! && r.stockUpShare >= R.mixedLow && r.stockUpShare <= R.mixedHigh;
  }
}

/** The gold asset id the gold condition reads. */
export const GOLD_ASSET = SANDBOX.goldAsset;

/** The GX return over a record (buy-and-hold on the index), for the "not positive in every scenario" check. */
export function gxReturn(r: ScenarioRecord): number {
  return last(r.gx) / r.gx[0]! - 1;
}
