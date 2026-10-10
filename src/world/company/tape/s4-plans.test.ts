/**
 * Tape section 4 (plans, buybacks), unit rows against the listed-company fixture. Plans are sell-only, locked at commit,
 * with a 63-gd minimum lead (Quant v1.7 section 6.1, unchanged). Buybacks are filed on F+1 of a filing (section 5.2).
 */
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../game';
import { advanceTo, companyOf, FOUNDER, listedWorld } from '../b1fixture';
import { publicCompanyView } from '../views';

const LISTED_DAY = 201; // the fixture lists on day 201 (IPO request at 200, one-day book)
const LOCKUP_END = LISTED_DAY + 168; // founder sales are refused until the 168-gd lockup ends (Quant 5.1)
// a plan with a sell day inside the lockup is refused at commit (Quant 6.1), so plan days start at the lockup end

function commit(g: ReturnType<typeof listedWorld>['g'], days: number[], minSellPrice = 0.01, qtyPerDay = 1) {
  const c = companyOf(g);
  return applyCommand(g, FOUNDER, { type: 'company.plan', companyId: c.id, qtyPerDay, days, minSellPrice });
}

describe('Tape s4: plans and buybacks (unit rows)', () => {
  it('plan_min_price_required: a plan without a usable minimum price (0, negative, NaN) is refused', () => {
    for (const bad of [0, -1, Number.NaN]) {
      const { g } = listedWorld(`plan-min-${String(bad)}`);
      advanceTo(g, LISTED_DAY);
      expect(commit(g, [LOCKUP_END], bad).ok).toBe(false);
    }
  });

  it('plan_min_lead (planTooSoon): the first sell day at committed + 62 is refused; committed + 63 is accepted', () => {
    const lead62 = listedWorld('plan-lead62').g;
    advanceTo(lead62, LOCKUP_END - 62);
    expect(commit(lead62, [LOCKUP_END]).ok).toBe(false);
    const lead63 = listedWorld('plan-lead63').g;
    advanceTo(lead63, LOCKUP_END - 63);
    expect(commit(lead63, [LOCKUP_END]).ok).toBe(true);
  });

  it('plan_immutable: a committed plan cannot be cancelled (refused), and the plan is a public plan row', () => {
    const { g, c } = listedWorld('plan-imm');
    advanceTo(g, LISTED_DAY);
    const placed = commit(g, [LOCKUP_END + 1]);
    expect(placed.ok).toBe(true);
    const planId = String((placed as { data?: { planId?: string } }).data?.planId ?? '');
    expect(planId).not.toBe('');
    expect(applyCommand(g, FOUNDER, { type: 'company.planCancel', companyId: c.id, planId }).ok).toBe(false);
    const rows = publicCompanyView(c, LISTED_DAY).plans;
    expect(rows.length).toBe(1);
    expect(rows[0]).toEqual({ fromDay: LOCKUP_END + 1, toDay: LOCKUP_END + 1 });
  });

  it('plan_no_cash_escrow: the founder spendable cash is identical to the cent before and after a plan commit', () => {
    const { g } = listedWorld('plan-cash');
    advanceTo(g, LISTED_DAY);
    const before = g.market.accounts[FOUNDER]!.cash;
    expect(commit(g, [LOCKUP_END + 1]).ok).toBe(true);
    expect(g.market.accounts[FOUNDER]!.cash).toBe(before);
  });

  it('plan_limits: the third live plan is refused, the first two are accepted', () => {
    const { g } = listedWorld('plan-lim');
    advanceTo(g, LISTED_DAY);
    expect(commit(g, [LOCKUP_END + 1]).ok).toBe(true);
    expect(commit(g, [LOCKUP_END + 2]).ok).toBe(true);
    expect(commit(g, [LOCKUP_END + 3]).ok).toBe(false);
  });

  it('buyback_window: a program filed on F is refused, on F+1 accepted, on F+2 refused (fourth filing F)', () => {
    const { g, c } = listedWorld('bb-win');
    advanceTo(g, 258);
    const F = c.filings[c.filings.length - 1]!.filedDay;
    const file = (day: number, fromDay: number, toDay: number) => {
      advanceTo(g, day);
      return applyCommand(g, FOUNDER, { type: 'company.buyback', companyId: c.id, size: 1200, fromDay, toDay });
    };
    expect(file(F, F + 5, F + 10).ok).toBe(false);
    expect(file(F + 1, F + 5, F + 10).ok).toBe(true);
    expect(file(F + 2, F + 6, F + 11).ok).toBe(false);
  });

  it('buyback_public_filing: an accepted program is on the public view with its size and schedule', () => {
    const { g, c } = listedWorld('bb-pub');
    advanceTo(g, 258);
    const F = c.filings[c.filings.length - 1]!.filedDay;
    advanceTo(g, F + 1);
    expect(applyCommand(g, FOUNDER, { type: 'company.buyback', companyId: c.id, size: 1200, fromDay: F + 5, toDay: F + 10 }).ok).toBe(true);
    expect(publicCompanyView(c, F + 1).buybackPrograms).toContainEqual({ size: 1200, fromDay: F + 5, toDay: F + 10 });
  });

  it('buyback_window (schedule): a schedule outside F+2..F+21 is refused', () => {
    const { g, c } = listedWorld('bb-sched');
    advanceTo(g, 258);
    const F = c.filings[c.filings.length - 1]!.filedDay;
    advanceTo(g, F + 1);
    expect(applyCommand(g, FOUNDER, { type: 'company.buyback', companyId: c.id, size: 1200, fromDay: F + 30, toDay: F + 40 }).ok).toBe(false);
  });

  it.skip('plan_sell_only [WAIT: the company plan API takes no side; sell-only holds by construction, UI copy is in the E-layer]', () => {});
  it.skip('plan_exact_fill (filing-day case) [WAIT-INSTR: needs the G19 filing-day fill order in the balance harness]', () => {});
});
