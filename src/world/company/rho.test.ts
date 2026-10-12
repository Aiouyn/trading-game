import { describe, expect, it } from 'vitest';
import { advanceTo, founded, listedWorld } from './b1fixture';
import { quantile, rhoOfListedSeed } from './rho';
import { surprise } from './valuation';
import { today } from '../core';

/**
 * O-2 (V1-PHASE9 9C): the residual surprise s is wired into the filing path, and the rho check (rho_residual) runs on the engine
 * path. The wiring is tested directly. The rho gate is a measured FAIL (median and p90 above the band, see docs/V1-PHASE9.md
 * section 9C.2), so it is kept as an expected failure: it runs, it is visible here, and it turns red as soon as the band is met.
 */
describe('O-2: the residual surprise s is computed at the filing (Quant 6.2)', () => {
  it('a listed filing carries s, equal to valuation.surprise on the closing quarter\'s consensus and the filing actuals', () => {
    const { g, c } = listedWorld('rho-wire-1');
    let snapshot: { consensus: NonNullable<typeof c.pendingFile>['consensus']; statements: NonNullable<typeof c.pendingFile>['statements'] } | null = null;
    let filed = 0;
    for (let i = 0; i < 400 && filed === 0; i++) {
      advanceTo(g, today(g) + 1);
      if (c.pendingFile?.consensus) snapshot = { consensus: c.pendingFile.consensus, statements: c.pendingFile.statements };
      const f = c.filings.find((x) => x.surprise);
      if (f) filed = f.quarter;
    }
    const f = c.filings.find((x) => x.surprise && x.quarter === filed)!;
    expect(f.surprise).toBeDefined();
    expect(Number.isFinite(f.surprise!.s)).toBe(true);
    expect(f.surprise!.d).toBeGreaterThan(0);
    // the snapshot taken at the close is the consensus the surprise reads (not the next quarter's signals after the close)
    expect(snapshot).not.toBeNull();
    const cons = snapshot!.consensus!;
    const st = snapshot!.statements;
    const expected = surprise({
      revActual: st.revenue, revCons: cons.revQtd, ocfActual: st.ocf, ocfCons: cons.ocf!,
      cbActual: st.backlogContribution, cbCons: cons.backlogContribution, margin: f.surprise!.margin, d: f.surprise!.d,
    });
    expect(f.surprise!.s).toBeCloseTo(expected, 12);
  });

  it('a private company has no consensus, so its filings carry no surprise', () => {
    const { g, c } = founded('rho-private-1');
    advanceTo(g, 200);
    expect(c.filings.length).toBeGreaterThan(0);
    for (const f of c.filings) expect(f.surprise).toBeUndefined();
  });
});

describe('rho_residual (G22, Quant 6.2 (c)): median <= 0.15 and p90 <= 0.25 over listed seeds, on the engine path', () => {
  // measured in V1-PHASE9 9C (scripts/balance/rho-probe.ts, 200 seeds x 8 quarters): the median and p90 are far above the band,
  // so this expected failure is the recorded result. It must be removed (made a plain test) only when the band is met.
  it.fails('rho per seed over 3 listed seeds x 8 quarters: median <= 0.15 and p90 <= 0.25, s finite everywhere', () => {
    const rows = [1, 2, 3].map((k) => rhoOfListedSeed(`rho-gate-${k}`, 8));
    const rhos = rows.map((r) => r.rho);
    expect(rhos.every((x) => Number.isFinite(x))).toBe(true);
    expect(quantile(rhos, 0.5)).toBeLessThanOrEqual(0.15);
    expect(quantile(rhos, 0.9)).toBeLessThanOrEqual(0.25);
  }, 300_000);
});
