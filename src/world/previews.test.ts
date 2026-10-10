import { describe, expect, it } from 'vitest';
import { BUSINESS_SALE_FRAC, MAX_LTV, businessSalePrice, maxLtvFor, priceAt, propertyDeposit, propertySaleNet, renovateCost, PROPERTY_FEE, RENOVATE_FRAC } from './assets';
import { SCAN_COOLDOWN_TICKS, deepScanCost, disconnectCost, scanCooldownLeft } from './cyber';
import { emptyLab, mcsFor, reserveCost, trainingPlan } from './lab';
import { DEALS_RANK } from './social';

// The Quay apps show these numbers before a player commits. Each one is the same function the engine runs,
// so a preview cannot drift from the command it previews (group 3 review: no duplicated engine values).
describe('engine previews the apps read', () => {
  it('a deep scan is locked for six game days after the last one', () => {
    expect(scanCooldownLeft(0, 5000)).toBe(0);
    expect(scanCooldownLeft(1000, 1000 + SCAN_COOLDOWN_TICKS - 1)).toBe(1);
    expect(scanCooldownLeft(1000, 1000 + SCAN_COOLDOWN_TICKS)).toBe(0);
  });

  it('a cut is free when flagged and capped at $250k otherwise', () => {
    expect(disconnectCost(true, 1e12)).toBe(0);
    expect(disconnectCost(false, 0)).toBe(1000);
    expect(disconnectCost(false, 1e12)).toBe(250_000);
    expect(deepScanCost(1_000_000)).toBe(5000 + 100);
  });

  it('property and business money uses the engine fractions', () => {
    expect(businessSalePrice(1000)).toBe(Math.round(BUSINESS_SALE_FRAC * 1000));
    expect(renovateCost(1000)).toBe(1000 * RENOVATE_FRAC);
    expect(propertyDeposit(1000, 0.7)).toBe(1000 - 700 + 1000 * PROPERTY_FEE);
    expect(propertySaleNet(1000, 300)).toBe(1000 - 1000 * PROPERTY_FEE - 300);
    expect(priceAt(1000, 'prime', 100)).toBe(1800);
  });

  it('mortgages open at the deal rank and cap at 70%', () => {
    expect(maxLtvFor('R0')).toBe(0);
    expect(maxLtvFor(DEALS_RANK)).toBe(MAX_LTV);
  });

  it('a training plan matches the run inputs, and a reserve costs what the engine charges', () => {
    const lab = emptyLab();
    lab.data = 1e6;
    const plan = trainingPlan(lab, 5000, true, 1.2, 0);
    expect(plan.spot).toBeCloseTo(5000 / 1.2);
    expect(plan.dqu).toBeCloseTo(Math.min(lab.data, plan.pflop * 1.5));
    expect(plan.expectedMcs).toBeCloseTo(mcsFor(lab, plan.pflop, plan.dqu, true));
    expect(plan.failOdds).toBeCloseTo(0.06);
    expect(reserveCost(100, 10, 1.2)).toBeCloseTo(100 * 10 * 2);
  });
});
