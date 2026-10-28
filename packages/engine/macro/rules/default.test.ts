import { describe, expect, it } from 'vitest';
import { failedRolloverTrigger, fxServiceTrigger, hazardDrawProbability, politicalTrigger } from './default';

const B = 1_000_000n;
describe('T04-13 default triggers (pure)', () => {
  it('hazard probability', () => {
    expect(hazardDrawProbability(0.20).toFixed(9)).toBe('0.000137353');
    expect(hazardDrawProbability(0.09)).toBe(0);
    expect(hazardDrawProbability(0.10)).toBe(0);
    expect(hazardDrawProbability(0.1000001)).toBeGreaterThan(0);
  });
  it('FX_SERVICE: SRL due 2e9, reserves 3e9, imports 1.5e9', () => {
    const x = { fdlServiceDue21d: 2000n * B * B / 1000n, reservesFdl: 3000n * B * B / 1000n, importsMonthFdl: 1500n * B * B / 1000n, concordAgreeable: false };
    expect(fxServiceTrigger(x)).toBe(true);
    expect(fxServiceTrigger({ ...x, concordAgreeable: true })).toBe(false);
    expect(fxServiceTrigger({ ...x, fdlServiceDue21d: x.reservesFdl - x.importsMonthFdl })).toBe(false);
    expect(fxServiceTrigger({ ...x, fdlServiceDue21d: x.reservesFdl - x.importsMonthFdl + 1n })).toBe(true);
  });
  it('POLITICAL never for FDL/NKR; thresholds strict on debt, inclusive on days', () => {
    const x = { politicalDecision: true, debtGdp: 1.6, highSpreadTradingDays: 63 };
    expect(politicalTrigger('FDL', x)).toBe(false);
    expect(politicalTrigger('NKR', x)).toBe(false);
    expect(politicalTrigger('EUN', x)).toBe(true);
    expect(politicalTrigger('EUN', { ...x, debtGdp: 1.5 })).toBe(false);
    expect(politicalTrigger('EUN', { ...x, highSpreadTradingDays: 62 })).toBe(false);
    expect(politicalTrigger('EUN', { ...x, politicalDecision: false })).toBe(false);
  });
  it('FAILED_ROLLOVER', () => {
    const x = { failed21d: 2, cashBuffer: 9n, maturities21d: 10n, backstopAvailable: false, backstopExhausted: false };
    expect(failedRolloverTrigger(x)).toBe(true);
    expect(failedRolloverTrigger({ ...x, failed21d: 1 })).toBe(false);
    expect(failedRolloverTrigger({ ...x, cashBuffer: 10n })).toBe(false);
    expect(failedRolloverTrigger({ ...x, backstopAvailable: true })).toBe(false);
    expect(failedRolloverTrigger({ ...x, backstopAvailable: true, backstopExhausted: true })).toBe(true);
  });
});
