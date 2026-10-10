/**
 * Tape section 4 and 3, the plan ends, the buyback shared tally and the window's rebuild from the frozen schedule
 * (tape-company-building.md sections 3.5 and 3.6; Quant v1.7 sections 5.2, 6.1). Test names carry the Tape id. Layer: U.
 */
import { describe, expect, it } from 'vitest';
import { addBuyback } from '../../../engine/programs';
import { endProgramsOn, lockedQty, restrictionsOf, sessionDayAt } from '../../../engine/restrictions';
import type { StepEvent } from '../../../engine/types';
import { applyCommand } from '../../game';
import { advanceTo, companyOf, FOUNDER, listedWorld } from '../b1fixture';
import { treasuryIdOf } from '../ipo';
import { windowAt } from '../insiders';

const LOCKUP_END = 201 + 168;

describe('Tape s4: plan ends, buyback tally, window rebuild', () => {
  it('plan_end_terminated: a delisting, take-private or default ends every live plan at once: escrow and price hold released, planEnded terminated', () => {
    const { g, c, assetId } = listedWorld('pend');
    advanceTo(g, 201);
    expect(applyCommand(g, FOUNDER, { type: 'company.plan', companyId: c.id, qtyPerDay: 100, days: [LOCKUP_END + 1, LOCKUP_END + 2], minSellPrice: 0.01 }).ok).toBe(true);
    const day = sessionDayAt(g.market.tick, g.market.config.ticksPerDay);
    expect(lockedQty(restrictionsOf(g.market), FOUNDER, assetId, day)).toBe(200);
    const events: StepEvent[] = [];
    const r2 = endProgramsOn(restrictionsOf(g.market), assetId, 'terminated', day, g.market.tick, events);
    g.market = { ...g.market, restrictions: r2 };
    expect(lockedQty(r2, FOUNDER, assetId, day)).toBe(0);
    expect(events).toContainEqual(expect.objectContaining({ type: 'planEnded', reason: 'terminated', playerId: FOUNDER }));
  });

  it('plan_end_tender: a full takeover tender ends the plan (planEnded tender) and releases the remainder; a plan of another asset is untouched', () => {
    const { g, c, assetId } = listedWorld('pten');
    advanceTo(g, 201);
    expect(applyCommand(g, FOUNDER, { type: 'company.plan', companyId: c.id, qtyPerDay: 50, days: [LOCKUP_END + 1], minSellPrice: 0.01 }).ok).toBe(true);
    const day = sessionDayAt(g.market.tick, g.market.config.ticksPerDay);
    const events: StepEvent[] = [];
    g.market = { ...g.market, restrictions: endProgramsOn(restrictionsOf(g.market), 'some-other-asset', 'tender', day, g.market.tick, events) };
    expect(lockedQty(restrictionsOf(g.market), FOUNDER, assetId, day)).toBe(50); // the other asset ends nothing here
    g.market = { ...g.market, restrictions: endProgramsOn(restrictionsOf(g.market), assetId, 'tender', day, g.market.tick, events) };
    expect(lockedQty(restrictionsOf(g.market), FOUNDER, assetId, day)).toBe(0);
    expect(events).toContainEqual(expect.objectContaining({ type: 'planEnded', reason: 'tender' }));
  });

  it('buyback_shared_tally: two programs on one day share the 1% of float cap; the second is refused with the headroom left', () => {
    const { g, c, assetId } = listedWorld('bbtally');
    advanceTo(g, 205); // inside the window 194..213 for the treasury
    const float = c.listed!.floatShares;
    const cap = Math.floor(0.01 * float);
    const first = Math.floor(cap * 0.6);
    const days = [205];
    const a = addBuyback(g.market, { id: 'bb-a', playerId: treasuryIdOf(c.id), assetId, qtyPerDay: first, days, floatShares: float });
    expect(a.reject).toBeUndefined();
    g.market = a.state;
    const b = addBuyback(g.market, { id: 'bb-b', playerId: treasuryIdOf(c.id), assetId, qtyPerDay: first, days, floatShares: float });
    expect(b.reject).toEqual({ code: 'buybackTooLarge', maxPerDay: cap - first });
    // the headroom itself is accepted
    const c2 = addBuyback(g.market, { id: 'bb-c', playerId: treasuryIdOf(c.id), assetId, qtyPerDay: cap - first, days, floatShares: float });
    expect(c2.reject).toBeUndefined();
  });

  it('window_save_edit: a hand-edited window rule is rebuilt from the frozen schedule on the next day step (the edit does not survive)', () => {
    const { g, c, assetId } = listedWorld('wsave');
    advanceTo(g, 100);
    expect(windowAt(c, 100).open).toBe(false);
    const r = restrictionsOf(g.market);
    g.market = { ...g.market, restrictions: { ...r, windows: { ...r.windows, [assetId]: { covered: r.windows[assetId]!.covered, open: [[0, 9_999]] } } } };
    expect(windowOpenIn(g, assetId, 100)).toBe(true); // the edit is live until the rebuild
    advanceTo(g, 101);
    expect(windowOpenIn(g, assetId, 101)).toBe(false); // rebuilt from c.windowRanges, the schedule
    expect(companyOf(g).windowRanges.length).toBeGreaterThan(0);
  });
});

/** Whether the engine's window rule for an asset is open for the founder on a day (the rule the orders are checked against). */
function windowOpenIn(g: ReturnType<typeof listedWorld>['g'], assetId: string, day: number): boolean {
  const rule = restrictionsOf(g.market).windows[assetId];
  if (!rule) return true;
  return rule.open.some(([a, b]) => day >= a && day <= b);
}
