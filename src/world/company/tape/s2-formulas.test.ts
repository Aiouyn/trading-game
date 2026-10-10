/**
 * Tape section 2 and 8 formula rows that run as pure unit checks (tape-company-building.md section 3.4 and 3.10): the residual
 * surprise s (Quant v1.7 section 6.2, the EV-scaled form, with the Q22 denominator and the clipped margin), the public cash
 * and debt label, and the quality score display (Quant section 3, CB-025). Test names carry the Tape id.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPANY } from '@/content/company';
import { advanceTo, founded, listedWorld } from '../b1fixture';
import { publicCompanyView } from '../views';
import { qualityScore } from '../rd';
import { surprise, surpriseDenominator } from '../valuation';

describe('Tape s2: the residual surprise (EV-scaled, Quant 6.2)', () => {
  it('surprise_formula: s = [(Rev_act - Rev_cons) m + (OCF_act - OCF_cons) + (CB_act - CB_cons) w_b] / D to 1e-12, backlog term included', () => {
    const args = { revActual: 1_000, revCons: 900, ocfActual: 80, ocfCons: 100, cbActual: 300, cbCons: 250, margin: 0.4, d: 2_000 };
    const expected = ((1_000 - 900) * 0.4 + (80 - 100) + (300 - 250) * COMPANY.valuation.wb) / 2_000;
    expect(surprise(args)).toBeCloseTo(expected, 12);
    // the backlog term alone moves s by its share of the denominator
    expect(surprise({ ...args, revActual: 900, ocfActual: 100 }) - surprise({ ...args, revActual: 900, ocfActual: 100, cbActual: 250 }))
      .toBeCloseTo(50 * COMPANY.valuation.wb / 2_000, 12);
  });

  it('surprise_formula (margin clip): m is clipped to [0.10, 0.90] before it scales the revenue term', () => {
    const base = { revActual: 1_000, revCons: 900, ocfActual: 0, ocfCons: 0, cbActual: 0, cbCons: 0, d: 1_000 };
    expect(surprise({ ...base, margin: 2 })).toBeCloseTo(100 * 0.9 / 1_000, 12);
    expect(surprise({ ...base, margin: -1 })).toBeCloseTo(100 * 0.1 / 1_000, 12);
  });

  it('surprise_formula (denominator): D = max(EV_20, 0.25 x mcap_20); a negative EV takes the market-cap branch', () => {
    expect(surpriseDenominator(1_000, 100_000)).toBe(25_000);
    expect(surpriseDenominator(60_000, 100_000)).toBe(60_000);
    expect(surpriseDenominator(-500_000, 100_000)).toBe(25_000);
  });

  it('surprise_formula (inputs): a listed company\'s filed cash and debt give the same lnV input whether the surprise is read or not (the formula reads no private field)', () => {
    const { g, c } = listedWorld('sur-in');
    advanceTo(g, 230);
    const before = JSON.stringify(publicCompanyView(c, 230).filings);
    c.cash += 123_456; // a private cash change moves no filed field until the next filing
    expect(JSON.stringify(publicCompanyView(c, 230).filings)).toBe(before);
  });
});

describe('Tape s8: public cash and debt label, quality score display', () => {
  it('public_cash_debt_label: the public view shows the last filing\'s cash and debt, labelled with its filed day; live cash is never shown', () => {
    const { g, c } = founded('pub-cash');
    advanceTo(g, 130);
    const last = c.filings[c.filings.length - 1]!;
    c.cash = last.balance.cash + 777_777; // live cash, not yet filed
    const v = publicCompanyView(c, 130);
    expect(v.cashDebt).toEqual({ cash: last.balance.cash, totalDebt: last.balance.debt, filedDay: last.filedDay });
    expect(JSON.stringify(v)).not.toContain(String(c.cash));
  });

  it('quality_score_display_only: the score is clamp(round(80 + 30 ln(q / frontier)), 0, 100) exactly, at the clamps too', () => {
    const f = 1;
    expect(qualityScore(f, f)).toBe(80);
    expect(qualityScore(Math.exp(1 / 3), f)).toBe(90);
    expect(qualityScore(1e9, f)).toBe(100);
    expect(qualityScore(1e-9, f)).toBe(0);
    // q values inside the same rounded score give the same display (the display is not the share input)
    expect(qualityScore(1.0, f)).toBe(qualityScore(1.001, f));
  });

  it('quality_score_display_only (no share read): the market share code does not read the quality score', () => {
    const fs = ['market.ts', 'economics.ts', 'company.ts'];
    for (const f of fs) {
      const src = readFileSync(resolve(__dirname, '..', f), 'utf8');
      expect(src, f).not.toMatch(/qualityScore\(/);
    }
  });
});
