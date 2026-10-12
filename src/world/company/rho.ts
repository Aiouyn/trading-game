/**
 * The rho probe for one listed seed (V1-PHASE9 9C, O-2; Quant G22, rho_residual; quant-company-building.md section 6.2 (c)).
 *
 * A listed company runs on the engine's own path (the b1fixture listing: real orders, the engine's ticks and the sector factor
 * of sectorFactor.ts). Each post-listing filing carries its residual surprise s (company.ts surpriseAtFiling: the actuals
 * against the consensus of the closing quarter at the close, over D = max(EV_20, 0.25 mcap_20)). s_quarter is the same
 * expression with the consensus replaced by the previous quarter's filed actuals, over the same D.
 *
 * rho for the seed = sd(s_filing) / sd(s_quarter) across the quarters. The gate is a median <= 0.15 and a p90 <= 0.25 across
 * seeds (a hard ceiling of 0.25). The three terms of s_filing are reported too, so a reader can see which one carries it.
 */
import { advanceTo, listedWorld } from './b1fixture';
import { surprise } from './valuation';
import { today } from '../core';
import type { FilingPublic } from './types';

export interface RhoRow {
  seed: string;
  /** the number of (s_filing, s_quarter) pairs: one fewer than the quarters, the first filing has no previous quarter */
  n: number;
  sdFiling: number;
  sdQuarter: number;
  rho: number;
  /** the sd of each term of s_filing: revenue at the margin, OCF, backlog (each over D) */
  sdRev: number;
  sdOcf: number;
  sdCb: number;
}

export function sampleSd(xs: number[]): number {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
}

/** The q-quantile of xs (no interpolation: the value at floor(n q), as the probe reports it). */
export function quantile(xs: number[], q: number): number {
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(a.length * q))] ?? NaN;
}

/**
 * Runs one listed seed until `quarters` filings carry a surprise, and returns its rho row. Throws when the company cannot file
 * that many quarters within the day cap (a fixture problem, not a measurement).
 */
export function rhoOfListedSeed(seed: string, quarters = 8): RhoRow {
  const { g, c } = listedWorld(seed);
  let guard = 0;
  while (c.filings.filter((f) => f.surprise).length < quarters && guard++ < 2_000) advanceTo(g, today(g) + 1);
  const fs = c.filings.filter((f) => f.surprise).slice(0, quarters);
  if (fs.length < quarters) throw new Error(`${seed}: only ${fs.length} filings with a surprise`);
  const sFiling: number[] = [];
  const sQuarter: number[] = [];
  const tRev: number[] = [];
  const tOcf: number[] = [];
  const tCb: number[] = [];
  for (let i = 1; i < fs.length; i++) {
    const cur = fs[i]!;
    const prev = fs[i - 1]!;
    const sur = cur.surprise!;
    sFiling.push(sur.s);
    const pc = consOf(prev);
    tRev.push(((cur.income.revUnrelated - pc.rev) * sur.margin) / sur.d);
    tOcf.push((cur.cashFlow.ocf - pc.ocf) / sur.d);
    tCb.push((cur.backlogContribution - pc.cb) / sur.d);
    sQuarter.push(surprise({
      revActual: cur.income.revUnrelated, revCons: pc.rev, ocfActual: cur.cashFlow.ocf, ocfCons: pc.ocf,
      cbActual: cur.backlogContribution, cbCons: pc.cb, margin: sur.margin, d: sur.d,
    }));
  }
  const sdF = sampleSd(sFiling);
  const sdQ = sampleSd(sQuarter);
  return { seed, n: sFiling.length, sdFiling: sdF, sdQuarter: sdQ, rho: sdF / sdQ, sdRev: sampleSd(tRev), sdOcf: sampleSd(tOcf), sdCb: sampleSd(tCb) };
}

/** A filing's actuals as the next quarter's consensus (the s_quarter baseline). */
function consOf(f: FilingPublic): { rev: number; ocf: number; cb: number } {
  return { rev: f.income.revUnrelated, ocf: f.cashFlow.ocf, cb: f.backlogContribution };
}
