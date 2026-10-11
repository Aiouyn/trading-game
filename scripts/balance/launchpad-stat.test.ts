import { describe, expect, it } from 'vitest';
import { mean, oneSided95, passesGate, pnlPerDollar, sampleSd, strategyPasses } from './launchpad-stat';

/** the Launchpad gate's statistics (lead-launchpad.md L8.3, v1.3): P&L per dollar deployed, one-sided 95% over seeds, zero for idle bots */
describe('L8.3 the gate statistic', () => {
  it('P&L per dollar is P&L over the cash put in, and zero for a bot that deployed nothing', () => {
    expect(pnlPerDollar(-5, 100)).toBeCloseTo(-0.05, 12);
    expect(pnlPerDollar(30, 100)).toBeCloseTo(0.3, 12);
    expect(pnlPerDollar(12, 0)).toBe(0);
    expect(pnlPerDollar(0, 0)).toBe(0);
  });

  it('the sample standard deviation uses n - 1, and is zero for fewer than two values', () => {
    expect(sampleSd([1])).toBe(0);
    expect(sampleSd([])).toBe(0);
    expect(sampleSd([-1, 0, 1])).toBeCloseTo(1, 12);
    expect(sampleSd([1, 2, 3, 4])).toBeCloseTo(Math.sqrt(5 / 3), 12);
  });

  it('the one-sided 95% bound is the mean plus 1.645 standard errors over seeds', () => {
    expect(oneSided95([-1, 0, 1])).toBeCloseTo(1.645 / Math.sqrt(3), 9);
    // [1, 2, 3, 4]: mean 2.5, sample sd sqrt(5/3), standard error sd / 2
    expect(oneSided95([1, 2, 3, 4])).toBeCloseTo(2.5 + (1.645 * Math.sqrt(5 / 3)) / 2, 9);
    expect(oneSided95([])).toBe(0);
  });

  it('a statistic passes when its bound is at or below zero, and fails above it', () => {
    expect(passesGate([-0.2, -0.1, -0.3])).toBe(true);
    expect(passesGate([0.5, 0.5, 0.5])).toBe(false);
    // a negative mean with a wide spread fails: the bound (mean -0.05, standard error 0.25) is above zero
    expect(passesGate([-0.5, 0.4, -0.5, 0.4])).toBe(false);
    // an idle bot (every ratio zero) passes trivially
    expect(passesGate([0, 0, 0])).toBe(true);
  });

  it('a strategy fails when any position is left unliquidated, even if its bound passes (review item 2)', () => {
    const xs = [-0.2, -0.1, -0.3];
    expect(strategyPasses(xs, 0)).toBe(true);
    expect(strategyPasses(xs, 1)).toBe(false);
    // a clean bound does not rescue a leftover, and a bad bound fails with no leftover
    expect(strategyPasses([0.5, 0.5, 0.5], 0)).toBe(false);
  });

  it('a bot with a single lucky seed is not passed on its mean alone (the bound carries the spread)', () => {
    const xs = [-0.05, -0.05, -0.05, -0.05, 2.0];
    expect(mean(xs)).toBeGreaterThan(0);
    expect(passesGate(xs)).toBe(false);
  });
});
