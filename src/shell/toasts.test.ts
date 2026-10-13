import { describe, expect, it } from 'vitest';
import { TOAST_MAX, type ShellToast, allowedInFocus, isSticky, toastPlace, visibleToasts, withoutPending } from './toasts';

const t = (id: string, over: Partial<ShellToast> = {}): ShellToast => ({ id, tone: 'info', text: id, ...over });

describe('toast rules (P2-085..P2-090)', () => {
  it('shows at most two, and the oldest leaves first (UX stage 6)', () => {
    const list = ['a', 'b', 'c', 'd'].map((id) => t(id));
    expect(visibleToasts(list, false).map((x) => x.id)).toEqual(['c', 'd']);
    expect(visibleToasts(list.slice(0, 2), false).map((x) => x.id)).toEqual(['a', 'b']);
    expect(TOAST_MAX).toBe(2);
  });

  it('one toast per order: a fill replaces the pending notice of its asset, and no other notice', () => {
    const queue = [
      t('pending-hlcn', { kind: 'pending', ref: 'HLCN' }),
      t('pending-xyz', { kind: 'pending', ref: 'XYZ' }),
      t('plain'),
    ];
    const fill = [t('fill-hlcn', { kind: 'fill', ref: 'HLCN', tone: 'gain' })];
    expect(withoutPending(queue, fill).map((x) => x.id)).toEqual(['pending-xyz', 'plain']);
    expect(withoutPending(queue, [t('other', { kind: 'other' })]).map((x) => x.id)).toEqual(['pending-hlcn', 'pending-xyz', 'plain']);
  });

  it('in focus mode only fills, margin warnings and world events show (P2-069)', () => {
    const list = [
      t('other', { kind: 'other' }),
      t('fill', { kind: 'fill', tone: 'gain' }),
      t('plain'),
      t('margin', { kind: 'margin', tone: 'warn' }),
      t('world', { kind: 'world' }),
    ];
    expect(visibleToasts(list, true).map((x) => x.id)).toEqual(['margin', 'world']);
    expect(allowedInFocus({ kind: 'other' })).toBe(false);
    expect(allowedInFocus({})).toBe(false);
  });

  it('a focus-mode drop does not remove the toasts from the list, so they show when focus ends', () => {
    const list = [t('plain'), t('fill', { kind: 'fill' })];
    visibleToasts(list, true);
    expect(visibleToasts(list, false).map((x) => x.id)).toEqual(['plain', 'fill']);
  });

  it('warnings and margin warnings are sticky; other tones are not (P2-090)', () => {
    expect(isSticky({ tone: 'warn' })).toBe(true);
    expect(isSticky({ tone: 'info', kind: 'margin' })).toBe(true);
    expect(isSticky({ tone: 'gain', kind: 'fill' })).toBe(false);
  });

  it('the column stays bottom-right, and when a maximized Broker covers it, moves into the dock beside the ticket (UX stage 6)', () => {
    const vp = { w: 1440, h: 900 };
    expect(toastPlace(vp, null, 34)).toEqual({ side: 'right' });
    // A Broker in the left two-thirds does not reach the column.
    expect(toastPlace(vp, { x: 8, y: 8, w: 940, h: 700 }, 34)).toEqual({ side: 'right' });
    // A maximized Broker covers the corner: the column moves into its dock, clear of the ticket (344 px): left = right edge - 344 -
    // 14 - 332, bottom = viewport bottom - window bottom + 12. The plot above the dock is never covered.
    expect(toastPlace(vp, { x: 8, y: 8, w: 1424, h: 840 }, 34)).toEqual({ side: 'at', left: 742, bottom: 30 });
    // A narrow Broker (under 900 px) has no dock: under the corner its one slim notice sits above the trade bar, inset 12 px from
    // the Broker's edges and 6 px above the bar (the bar's height is added in CSS). Here: left = 900 + 12, right = 1440 - 1420 + 12.
    expect(toastPlace(vp, { x: 900, y: 8, w: 520, h: 700 }, 34)).toEqual({ side: 'bar', left: 912, right: 32, bottom: 164 });
    // The right half of a 1440 x 900 desk, with the Broker's bottom at 882: the notice sits 24 px up.
    expect(toastPlace(vp, { x: 730, y: 8, w: 702, h: 840 }, 34)).toEqual({ side: 'bar', left: 742, right: 20, bottom: 24 });
    // A narrow Broker that the corner does not reach keeps the corner.
    expect(toastPlace(vp, { x: 8, y: 8, w: 500, h: 700 }, 34)).toEqual({ side: 'right' });
    // A window that ends above the column does not cover it.
    expect(toastPlace(vp, { x: 900, y: 8, w: 520, h: 400 }, 34)).toEqual({ side: 'right' });
  });
});
