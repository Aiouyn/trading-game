/**
 * Tape section 3, trading window and covered list (tape-company-building.md section 6.1, unchanged in Quant v1.7). The
 * window is F+2..F+21 after each filing; a covered account's orders outside it are refused. Test names carry the Tape id.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../game';
import { advanceTo, BUYER_A, companyOf, FOUNDER, founded, listedWorld } from '../b1fixture';
import { publicCompanyView } from '../views';
import { rosterOf, windowAt } from '../insiders';

function farBid(assetId: string) {
  return { assetId, side: 'buy' as const, type: 'limit' as const, limitPrice: 0.0001, qty: 1, tif: 'gtc' as const };
}

describe('Tape s3: trading window (F+2 to F+21, covered list)', () => {
  it('window_boundaries: a covered order is refused at F+1 and F+22, accepted at F+2 and F+21 (F = 66)', () => {
    const { g, c, assetId } = listedWorld('win-b');
    const at = (day: number, pid = FOUNDER) => {
      advanceTo(g, day);
      return applyCommand(g, pid, { type: 'order.place', order: farBid(assetId) });
    };
    expect(at(67).ok).toBe(false);
    expect(at(68).ok).toBe(true);
    expect(at(87).ok).toBe(true);
    expect(at(88).ok).toBe(false);
    expect(windowAt(c, 67).open).toBe(false);
  });

  it('window_untilday (schedule): the next open day after a closed day is F+2 of the next filing (F+2 = 131 after the second filing)', () => {
    const { g, c } = listedWorld('win-u');
    advanceTo(g, 100);
    expect(windowAt(c, 100)).toEqual({ open: false, opensDay: 131 });
  });

  it('window_schedule_public: CompanyPublic.window matches the engine and names the covered instrument', () => {
    const { g, c } = listedWorld('win-s');
    for (const day of [60, 70, 100, 150]) {
      advanceTo(g, day);
      const w = publicCompanyView(c, day).window!;
      expect(w.open).toBe(windowAt(c, day).open);
      expect(w.covered).toEqual([c.listed!.assetId]);
    }
  });

  it('window_noncovered_free: an unlinked, non-covered account trades a listed stock while the window is closed', () => {
    const { g, c, assetId } = listedWorld('win-f');
    advanceTo(g, 100);
    expect(windowAt(c, 100).open).toBe(false);
    // precondition: BUYER_A is not on the covered roster in this fixture (no holding, no link), so the row applies
    expect(rosterOf(g, c)).not.toContain(BUYER_A);
    expect(applyCommand(g, BUYER_A, { type: 'order.place', order: farBid(assetId) }).ok).toBe(true);
  });

  it('window_scope_by_tier: a Seed private company has no window (none), a listed company has one', () => {
    const { g } = founded('win-tier');
    expect(publicCompanyView(companyOf(g), 10).window).toBeUndefined();
    const listed = listedWorld('win-tier2');
    expect(publicCompanyView(listed.c, 230).window).toBeDefined();
  });

  it('closed_window_bypass (order.place path): a covered founder order while closed is refused, 0 accepted', () => {
    const { g, assetId } = listedWorld('win-byp');
    advanceTo(g, 100);
    const r = applyCommand(g, FOUNDER, { type: 'order.place', order: { ...farBid(assetId), qty: 5 } });
    expect(r.ok).toBe(false);
    // the refusal is the window, not the price or the size (the same order is accepted on an open day)
    expect(r.error).toBe('closedWindow');
    advanceTo(g, 135); // F = 129, the window is open 131..150
    expect(applyCommand(g, FOUNDER, { type: 'order.place', order: { ...farBid(assetId), qty: 5 } }).ok).toBe(true);
  });

  it('inst_list_stored: the public covered instrument matches the listed asset; the roster holds the founder', () => {
    const { g, c } = listedWorld('win-list');
    advanceTo(g, 70);
    expect(publicCompanyView(c, 70).window!.covered).toEqual([c.listed!.assetId]);
    expect(rosterOf(g, c)).toContain(FOUNDER);
  });
});
