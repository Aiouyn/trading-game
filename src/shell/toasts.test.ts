import { describe, expect, it } from 'vitest';
import { TOAST_MAX, type ShellToast, allowedInFocus, isSticky, toastSide, visibleToasts } from './toasts';

const t = (id: string, over: Partial<ShellToast> = {}): ShellToast => ({ id, tone: 'info', text: id, ...over });

describe('toast rules (P2-085..P2-090)', () => {
  it('shows at most three, and the oldest leaves first', () => {
    const list = ['a', 'b', 'c', 'd'].map((id) => t(id));
    expect(visibleToasts(list, false).map((x) => x.id)).toEqual(['b', 'c', 'd']);
    expect(visibleToasts(list.slice(0, 2), false).map((x) => x.id)).toEqual(['a', 'b']);
    expect(TOAST_MAX).toBe(3);
  });

  it('in focus mode only fills, margin warnings and world events show (P2-069)', () => {
    const list = [
      t('other', { kind: 'other' }),
      t('fill', { kind: 'fill', tone: 'gain' }),
      t('plain'),
      t('margin', { kind: 'margin', tone: 'warn' }),
      t('world', { kind: 'world' }),
    ];
    expect(visibleToasts(list, true).map((x) => x.id)).toEqual(['fill', 'margin', 'world']);
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

  it('the column stays bottom-right unless a Broker sits under it, then it moves bottom-left (P2-088)', () => {
    const vp = { w: 1440, h: 900 };
    expect(toastSide(vp, null, 34)).toBe('right');
    // A Broker in the left two-thirds does not reach the column.
    expect(toastSide(vp, { x: 8, y: 8, w: 940, h: 700 }, 34)).toBe('right');
    // A Broker across the right edge, down to the column, does.
    expect(toastSide(vp, { x: 900, y: 8, w: 520, h: 700 }, 34)).toBe('left');
    // A window that ends above the column does not cover it.
    expect(toastSide(vp, { x: 900, y: 8, w: 520, h: 400 }, 34)).toBe('right');
  });
});
