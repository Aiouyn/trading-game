/**
 * Tape section 7, the IPO eligibility rules, the lockup and the filing tiers (tape-company-building.md section 3.9, Quant v1.7
 * section 5.1 and Ledger section 12 #1, #2, Q17). Test names carry the Tape id. Layer: U.
 */
import { describe, expect, it } from 'vitest';
import { COMPANY } from '@/content/company';
import { applyCommand } from '../../game';
import { TPD } from '../../core';
import { advanceTo, companyOf, FOUNDER, founded, listedWorld } from '../b1fixture';
import { ipoEligibility } from '../ipo';
import { tierFor } from '../filings';
import { windowAt } from '../insiders';
import type { Statements } from '../types';

/** A founded company at the given day, owner at R3 with its value and covenant set for the eligibility rules. */
function eligibleAt(seed: string, day: number) {
  const { g, c } = founded(seed);
  advanceTo(g, day);
  c.filedV = 100_000_000;
  g.players[FOUNDER]!.rankId = 'R3';
  return { g, c };
}

describe('Tape s7: IPO eligibility, lockup and filing tiers', () => {
  it('ipo_requires_3_filings: two quarterly statements are refused (ipoFilings); three are accepted', () => {
    const two = eligibleAt('ipo-f2', 130);
    expect(two.c.filings.length).toBe(2);
    expect(ipoEligibility(two.g, two.c, FOUNDER)).toEqual({ code: 'ipoFilings' });
    const three = eligibleAt('ipo-f3', 200);
    expect(three.c.filings.length).toBe(3);
    expect(ipoEligibility(three.g, three.c, FOUNDER)).toBeNull();
  });

  it('ipo_eligibility (value): a filed value of 49.99M is refused (ipoValue) and 50M passes the value test', () => {
    const { g, c } = eligibleAt('ipo-v', 200);
    c.filedV = 49_990_000;
    expect(ipoEligibility(g, c, FOUNDER)).toEqual({ code: 'ipoValue' });
    c.filedV = COMPANY.ipo.minValue;
    expect(ipoEligibility(g, c, FOUNDER)).toBeNull();
  });

  it('ipo_eligibility (rank): the owner must be R3 or higher; R2 is refused (ipoRank)', () => {
    const { g, c } = eligibleAt('ipo-r', 200);
    g.players[FOUNDER]!.rankId = 'R2';
    expect(ipoEligibility(g, c, FOUNDER)).toEqual({ code: 'ipoRank' });
    g.players[FOUNDER]!.rankId = 'R3';
    expect(ipoEligibility(g, c, FOUNDER)).toBeNull();
  });

  it('ipo_eligibility (conviction): a conviction 55 gd old blocks the IPO; one 56 gd old (8 weeks) does not', () => {
    const { g, c } = eligibleAt('ipo-cv', 200);
    const tick = g.market.tick;
    g.funds = { convicted: { [FOUNDER]: tick - 55 * TPD } } as never;
    expect(ipoEligibility(g, c, FOUNDER)).toEqual({ code: 'ipoConviction' });
    g.funds = { convicted: { [FOUNDER]: tick - COMPANY.ipo.convictionDays * TPD } } as never;
    expect(ipoEligibility(g, c, FOUNDER)).toBeNull();
  });

  it('ipo_eligibility (covenant): a company in covenant cure cannot request an IPO (ipoCovenant)', () => {
    const { g, c } = eligibleAt('ipo-cov', 200);
    c.covenant.status = 'cure';
    expect(ipoEligibility(g, c, FOUNDER)).toEqual({ code: 'ipoCovenant' });
  });

  it('ipo_eligibility (no sector rule): the eligibility rules read value, rank, conviction, covenant and filings only (no sector count)', () => {
    const { g, c } = eligibleAt('ipo-sec', 200);
    for (const sector of ['tech', 'health', 'staples', 'discretionary', 'industrials', 'security'] as const) {
      c.sector = sector;
      expect(ipoEligibility(g, c, FOUNDER), sector).toBeNull();
    }
  });

  it('ipo_lockup: the founder cannot sell in the first 168 gd even in an open window (lockup); after it, the open window admits the sale', () => {
    const { g, c, assetId } = listedWorld('ipo-lock');
    g.market.accounts[FOUNDER]!.positions[assetId] = { qty: 100, avgCost: 1 } as never;
    const sell = () => applyCommand(g, FOUNDER, { type: 'order.place', order: { assetId, side: 'sell', type: 'limit', limitPrice: 1e6, qty: 1, tif: 'gtc' } });
    // day 260: the window is open (257..276, F = 255) but the lockup runs to 369
    advanceTo(g, 260);
    expect(windowAt(c, 260).open).toBe(true);
    expect(sell()).toEqual(expect.objectContaining({ ok: false, error: 'lockup' }));
    // day 383: the lockup is over and the window (383..402, F = 381) is open
    advanceTo(g, 383);
    expect(windowAt(c, 383).open).toBe(true);
    expect(sell().ok).toBe(true);
  });

  it('filing_tiers: a company with one closed quarter is Seed; two quarters with revenue of 1M and positive OCF is Growth', () => {
    const q = (revenue: number, ocf: number, netIncome: number) => ({ revenue, ocf, netIncome } as unknown as Statements);
    expect(tierFor([q(900_000, 100, 1)])).toBe('seed');
    expect(tierFor([q(500_000, 1, 1), q(500_000, 1, 1)])).toBe('growth');
    expect(tierFor([q(500_000, 1, 1), q(500_000, -1, 1)])).toBe('seed'); // revenue met, OCF not positive
  });

  it('filing_tiers (late): four quarters with 15M of revenue and at least two profitable quarters is Late; one profitable quarter is not', () => {
    const q = (netIncome: number) => ({ revenue: 4_000_000, ocf: 1, netIncome } as unknown as Statements);
    expect(tierFor([q(1), q(1), q(-1), q(-1)])).toBe('late');
    expect(tierFor([q(1), q(-1), q(-1), q(-1)])).not.toBe('late');
  });

  it('filing_tiers (listed): a listed company files quarterly and prints signals; a private one prints none', () => {
    const { g, c } = listedWorld('ipo-tier');
    advanceTo(g, 240);
    expect(c.filings.length).toBeGreaterThanOrEqual(3);
    expect(c.signals.length).toBeGreaterThan(0);
    const priv = founded('ipo-tier-p').g;
    advanceTo(priv, 240);
    expect(companyOf(priv).signals.length).toBe(0);
  });
});
