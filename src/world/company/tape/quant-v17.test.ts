/**
 * Quant v1.7 rows (NEW, and the G17 and G21 unit parts), tape-company-building.md section 3.13 and the v1.7 re-target.
 * Test names carry the Tape id. Rows that need a seeded market or filing sweep are in scripts/balance/company-tape.ts.
 */
import { describe, expect, it } from 'vitest';
import { advanceTo, listedWorld } from '../b1fixture';
import { reversal } from '../filings';

type Resolved = Parameters<typeof reversal>[0][number];

/** A resolved order: quantity, shipped units, cancel rate c_s, lift and the signal it reports on (G17 inputs). */
function order(qty: number, shipped: number, cs: number, lift = 1): Resolved {
  return { qty, shipped, cs, lift, reportedSig: 0 } as unknown as Resolved;
}

describe('Quant v1.7: allowance on actual cancellations (G17)', () => {
  it('npc_allowance_actual: q = 10, 30, 60, 260, 1000 at c_s 0.25: an honest NPC-only order gives X = 0 exactly', () => {
    for (const q of [10, 30, 60, 260, 1000]) {
      const cs = 0.25;
      const cancelled = Math.floor(cs * q);
      const r = reversal([order(q, q - cancelled, cs)], { 0: 1 }, { 0: 1 });
      expect(r.excessLift).toBeCloseTo(0, 12);
      expect(r.repayment).toBeCloseTo(0, 12);
    }
  });

  it('npc_allowance_actual: a fake order with q < 1/c_s (no allowance) gives the full lift as excess', () => {
    const cs = 0.25;
    // floor(0.25 * 3) = 0, so the allowance is 0 and the whole non-converted lift is excess
    const r = reversal([order(3, 0, cs, 1)], { 0: 1 }, { 0: 1 });
    expect(r.excessLift).toBeCloseTo(1, 12);
  });

  it('npc_allowance_actual (allowance = floor(c q)/q, not c): q = 10 at c 0.25 allows 0.2 of the lift', () => {
    const r = reversal([order(10, 0, 0.25, 1)], { 0: 1 }, { 0: 1 });
    expect(r.excessLift).toBeCloseTo(1 - 0.2, 12);
  });
});

describe('Quant v1.7: player stocks print in full (G21, unit part)', () => {
  it('company_print_full_npc_untouched (unit): the listed player stock is a company-valued asset with companyPrintShare exactly 1', () => {
    const { g, assetId } = listedWorld('print-1');
    advanceTo(g, 230);
    const def = g.market.config.assets.find((a) => a.id === assetId);
    expect(def, 'the listed asset is in the engine config').toBeDefined();
    expect(def!.valueSource).toBe('company');
    // set explicitly by the listing (ipo.ts listingDef), not defaulted: an absent field fails here
    expect(def!.companyPrintShare).toBe(1);
  });
});

describe('Quant v1.7: rows run in the balance script or the engine gate (recorded here as skipped)', () => {
  it.skip('overflow_not_booked [SCRIPT: demand above capacity x 1.15 gives 0 units; needs the demand sweep, scripts/balance/company-tape.ts]', () => {});
  it.skip('filing_tick_order [SCRIPT: F open tick order (re-anchor, backlogRepay, plan fills); needs a filing-day sim]', () => {});
  it.skip('revenue_noise_quarterly [SCRIPT: one eps per component per quarter, lag-aware bot mean net <= 0 (modelled -1.370%)]', () => {});
  it.skip('hiring_full_print [SCRIPT: hiring moves -0.5% to -4% print in full, carry 0, zero trades for the cap bots]', () => {});
  it.skip('company_print_full_npc_untouched (binding) [EN: engine-staging gate, fingerprint c5dd6665...dfab35c; not in this worktree]', () => {});
  it.skip('rho_engine [BLK-G22 PASSING READING: 200 seeds x 6 sectors x 7 filings; scripts/balance/company-tape.ts]', () => {});
  it.skip('repay_derivative_delta [WAIT-INSTR: Quant 6.5 derivatives not built]', () => {});
  it.skip('one_list_price [PROPOSED: the repricing cost of shipped units is not in the -30% row; Ledger decision D3 open]', () => {});
  it.skip('consensus_converges_defn [PROPOSED: convergence under once-per-quarter noise, decision D2 open]', () => {});
});
