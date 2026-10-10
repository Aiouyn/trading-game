import { describe, expect, it } from 'vitest';
import { COMPANY } from '@/content/company';
import { backlogLift, clippedGrowth, clippedMargin, lnPerShare, sensCB, surprise, vEngine, type ValuationInputs } from './valuation';
import { sha256Hex } from './hash';

const base: ValuationInputs = { revU: 4_000_000, eStar: 900_000, growth: 0.2, credibility: 0.5, netDebt: -50_000, dCB: 0, margin: 0.5 };

describe('V_engine (spec 5, CB-035)', () => {
  it('E* branch: PE * (E* + w_b dCB) * (1 + g gamma) * (0.85 + 0.15 C) - net debt', () => {
    const v = COMPANY.valuation;
    const want = v.pe * (base.eStar + v.wb * 100_000) * (1 + v.gamma * 0.2) * (v.cBase + v.cSlope * 0.5) - base.netDebt;
    expect(vEngine({ ...base, dCB: 100_000 })).toBeCloseTo(want, 6);
  });

  it('revenue branch when E* <= 0: 0.5 EVS (Rev_u + w_b dCB / m)(1 + gamma g) - net debt', () => {
    const v = COMPANY.valuation;
    const x = { ...base, eStar: -1, dCB: 80_000, margin: 0.4 };
    const want = 0.5 * v.evs * (base.revU + (v.wb * 80_000) / 0.4) * (1 + v.gamma * 0.2) - base.netDebt;
    expect(vEngine(x)).toBeCloseTo(want, 6);
  });

  it('the value is floored at zero', () => {
    expect(vEngine({ ...base, eStar: 1, netDebt: 1e12 })).toBe(0);
  });

  it('m and g are clipped to [0.10, 0.90] and [-50%, +100%]', () => {
    expect(clippedMargin(0.02)).toBe(0.10);
    expect(clippedMargin(1.5)).toBe(0.90);
    expect(clippedGrowth(-3)).toBe(-0.5);
    expect(clippedGrowth(5)).toBe(1);
  });

  it('sens = d lnV / d CB matches a finite difference in both branches', () => {
    for (const x of [base, { ...base, eStar: -5, margin: 0.3 }]) {
      const h = 1;
      const fd = (lnPerShare(vEngine({ ...x, dCB: 1000 + h }), 1e6) - lnPerShare(vEngine({ ...x, dCB: 1000 }), 1e6)) / h;
      expect(sensCB({ ...x, dCB: 1000 })).toBeCloseTo(fd, 9);
    }
  });

  it('backlog_margin_only: an order at its variable cost adds nothing; a loss-making order subtracts', () => {
    // the lift is the change in lnV from the change in CB: CB up by 0 gives 0, CB down (a loss) gives a negative lift
    expect(backlogLift(base, 0, 0, 1e6)).toBe(0);
    expect(backlogLift(base, 50_000, 0, 1e6)).toBeGreaterThan(0);
    expect(backlogLift(base, -50_000, 0, 1e6)).toBeLessThan(0);
  });

  it('surprise s is the EV-scaled sum of the three gaps (section 6.2)', () => {
    const s = surprise({ revActual: 110, revCons: 100, ocfActual: 5, ocfCons: 3, cbActual: 40, cbCons: 20, margin: 0.5, d: 1000 });
    expect(s).toBeCloseTo((10 * 0.5 + 2 + 20 * COMPANY.valuation.wb) / 1000, 12);
  });
});

describe('hash (sha256, section 6.1)', () => {
  it('matches the NIST vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))
      .toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });
});
