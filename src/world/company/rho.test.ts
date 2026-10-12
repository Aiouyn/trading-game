import { beforeAll, describe, expect, it } from 'vitest';
import { advanceTo, founded, listedWorld, stepEngineTo } from './b1fixture';
import { quantile, rhoOfListedSeed, type RhoRow } from './rho';
import { surprise } from './valuation';
import { today } from '../core';

/**
 * O-2 (V1-PHASE9 9C): the residual surprise s is wired into the filing path, and the rho check (rho_residual) runs on the engine
 * path (listedWorld with { engine: true }: every tick a real stepGame). The wiring is tested directly. The rho gate is a measured
 * FAIL (median and p90 above the band, see docs/V1-PHASE9.md section 9C.2): the gate is its own expected failure, so the probe
 * running and producing finite numbers is a plain test, and only the gate assertion is expected to fail.
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

  it('on the engine path the listed asset trades and books bars, so mcap_20 (and D) read the market, not the filed fair value', () => {
    const { g, assetId } = listedWorld('rho-bars-1', { engine: true });
    stepEngineTo(g, today(g) + 65);
    const bars = g.market.assets.find((a) => a.id === assetId)?.bars ?? [];
    // the engine keeps the last 30 closed bars (sim.ts BARS_KEPT), so 20 bars for mcap_20 plus the filing lag always fit
    expect(bars.length).toBe(30);
    for (const b of bars) expect(Number.isFinite(b.c) && b.c > 0).toBe(true);
  });

  it('a private company has no consensus, so its filings carry no surprise', () => {
    const { g, c } = founded('rho-private-1');
    advanceTo(g, 200);
    expect(c.filings.length).toBeGreaterThan(0);
    for (const f of c.filings) expect(f.surprise).toBeUndefined();
  });

  it('a pending filing saved before O-2 (no consensus snapshot) carries no surprise, not the next quarter\'s consensus', () => {
    const { g, c } = listedWorld('rho-old-1');
    const before = c.filings.length;
    let stripped = false;
    for (let i = 0; i < 400 && c.filings.length === before; i++) {
      advanceTo(g, today(g) + 1);
      // the pre-O-2 shape: the pending filing has no consensus field at all (undefined, not null)
      if (!stripped && c.pendingFile) { delete (c.pendingFile as { consensus?: unknown }).consensus; stripped = true; }
    }
    expect(stripped).toBe(true);
    expect(c.filings.length).toBe(before + 1);
    expect(c.filings[before]!.surprise).toBeUndefined();
    // the next pending filing (after O-2 again) carries its surprise
    for (let i = 0; i < 400 && c.filings.length === before + 1; i++) advanceTo(g, today(g) + 1);
    expect(c.filings[before + 1]?.surprise).toBeDefined();
  });
});

describe('rho_residual (G22, Quant 6.2 (c)): median <= 0.15 and p90 <= 0.25 over listed seeds, on the engine path', () => {
  // measured in V1-PHASE9 9C (scripts/balance/rho-probe.ts, 200 seeds x 8 quarters, engine path): the gate is not met, so the
  // gate assertion is an expected failure. It turns red when the band is met; then this becomes a plain test.
  let rows: RhoRow[] = [];
  beforeAll(() => {
    rows = [1, 2, 3].map((k) => rhoOfListedSeed(`rho-gate-${k}`, 8));
  }, 1_500_000);

  it('the probe runs on the engine path: 3 listed seeds x 7 (s_filing, s_quarter) pairs, every s, sd and rho finite', () => {
    for (const r of rows) {
      expect(r.n).toBe(7);
      for (const x of [r.sdFiling, r.sdQuarter, r.rho, r.sdRev, r.sdOcf, r.sdCb]) expect(Number.isFinite(x)).toBe(true);
    }
  });

  it.fails('rho gate: median rho <= 0.15 and p90 <= 0.25 over the 3 seeds (expected failure, measured FAIL in 9C.2)', () => {
    const rhos = rows.map((r) => r.rho);
    expect(quantile(rhos, 0.5)).toBeLessThanOrEqual(0.15);
    expect(quantile(rhos, 0.9)).toBeLessThanOrEqual(0.25);
  });
});
