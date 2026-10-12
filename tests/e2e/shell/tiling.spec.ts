import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from '../helpers';
import { type Rect } from '../../../src/shell/geometry';
import { DESKTOPS, box, boot, expectRect, frame, newBroker, onlyIn, slotBox, viewport, windowIds } from './support';

/** Opens an app from the shelf and waits for its window. */
async function openFromShelf(page: Page, id: string): Promise<void> {
  await page.getByTestId(`shelf-app-${id}`).click();
  await expect(frame(page, id)).toBeVisible();
}

/** Waits until no window animation runs: a snap, a tile or an open has landed (reduced motion is instant). */
async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
}

/** The window rects of every open window, as page rects. */
async function allBoxes(page: Page): Promise<Rect[]> {
  const ids = await windowIds(page);
  const out: Rect[] = [];
  for (const id of ids) out.push(await box(page, id));
  return out;
}

/**
 * The tiles are checked in News (workspace 1): it is open at every rank and holds no Broker, so the windows tile from empty.
 * Trade is the terminal (side panels), checked below.
 */
async function goNews(page: Page): Promise<void> {
  await page.getByTestId('ws-1').click();
  await expect(page.getByTestId('ws-1')).toHaveAttribute('aria-selected', 'true');
  await expect(frame(page, 'wire')).toBeVisible();
  await settle(page);
}

test.describe('tiling, side panels and toasts (stage 2)', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop windows');

  test('@tile_two a second window in News tiles into the halves: the older on the left, the new on the right', async ({ page }) => {
    onlyIn('desktop', 'desktop-1920');
    const vp = viewport(page);
    watchErrors(page);
    await boot(page);
    await goNews(page);
    await openFromShelf(page, 'portfolio');
    await settle(page);
    expectRect(await box(page, 'wire'), slotBox('L2', vp));
    expectRect(await box(page, 'portfolio'), slotBox('R2', vp));
  });

  test('@tile_three three windows tile as one large window and two stacked on the right', async ({ page }) => {
    onlyIn('desktop-1920');
    const vp = viewport(page);
    watchErrors(page);
    await boot(page);
    await goNews(page);
    await openFromShelf(page, 'portfolio');
    await openFromShelf(page, 'calendar');
    await settle(page);
    expectRect(await box(page, 'wire'), slotBox('L23', vp));
    expectRect(await box(page, 'portfolio'), slotBox('R3T', vp));
    expectRect(await box(page, 'calendar'), slotBox('R3B', vp));
  });

  test('@tile_four four windows tile as a grid of quarters', async ({ page }) => {
    onlyIn('desktop-1920');
    const vp = viewport(page);
    watchErrors(page);
    await boot(page);
    await goNews(page);
    await openFromShelf(page, 'portfolio');
    await openFromShelf(page, 'calendar');
    await openFromShelf(page, 'settings');
    await settle(page);
    const rects = await allBoxes(page);
    expect(rects).toHaveLength(4);
    for (const slot of ['TL', 'TR', 'BL', 'BR'] as const) {
      const want = slotBox(slot, vp);
      expect(rects.some((r) => Math.abs(r.x - want.x) < 2 && Math.abs(r.y - want.y) < 2 && Math.abs(r.w - want.w) < 2), slot).toBe(true);
    }
  });

  test('@tile_reflow closing one of three tiled windows reflows the other two into the halves', async ({ page }) => {
    onlyIn('desktop-1920');
    const vp = viewport(page);
    watchErrors(page);
    await boot(page);
    await goNews(page);
    await openFromShelf(page, 'portfolio');
    await openFromShelf(page, 'calendar');
    await settle(page);
    // the calendar is focused (it opened last): Alt W closes it
    await page.keyboard.press('Alt+KeyW');
    await expect(frame(page, 'calendar')).toHaveCount(0);
    await settle(page);
    expectRect(await box(page, 'wire'), slotBox('L2', vp));
    expectRect(await box(page, 'portfolio'), slotBox('R2', vp));
  });

  test('@side_panel on Trade an app opened from the shelf is a right panel beside the chart, and the Broker keeps the left two thirds', async ({ page }) => {
    onlyIn('desktop', 'desktop-1920');
    const vp = viewport(page);
    watchErrors(page);
    await boot(page);
    await openFromShelf(page, 'wire');
    await settle(page);
    expectRect(await box(page, 'broker-1'), slotBox('L23', vp));
    expectRect(await box(page, 'wire'), slotBox('R3', vp));
  });

  test('@tile_new_broker a second Broker on Trade retiles the Broker pair into halves', async ({ page }) => {
    onlyIn('desktop-1920');
    const vp = viewport(page);
    watchErrors(page);
    await boot(page);
    await newBroker(page);
    await settle(page);
    expectRect(await box(page, 'broker-1'), slotBox('L2', vp));
    expectRect(await box(page, 'broker-2'), slotBox('R2', vp));
  });

  test('@toast_corner toasts stay off the ticket, show at most two, and the overflow opens the bell', async ({ page }) => {
    onlyIn(...DESKTOPS);
    watchErrors(page);
    await boot(page);
    for (let i = 1; i <= 5; i++) {
      await page.evaluate((n) => window.__tg!.state().toast({ tone: 'info', text: `notice ${n}` }), i);
    }
    // Two notices draw at once, in the corner and in a maximized Broker's dock alike (UX stage 6), so three of the five wait behind
    // the count. A notice lasts TOAST_HOLD_MS (4 s), so these checks run at once, before the holds lapse. A narrow Broker under the
    // corner (desktop-900 boots with one) takes the banner instead: one notice, above its trade bar (toastPlace 'bar').
    const banner = await page.getByTestId('os-toasts').evaluate((el) => el.classList.contains('bar'));
    await expect(page.getByTestId('os-toast-more')).toHaveText(banner ? /\+4/ : /\+3/);
    await expect(page.locator('[data-testid^="os-toast-"][data-tone]')).toHaveCount(banner ? 1 : 2);
    await expect(page.locator('[data-testid^="os-toast-"][data-tone]').first()).toBeVisible();
    if (banner) {
      const bar = await page.locator('.os-win.active').getByTestId('trade-bar-slot').boundingBox();
      const note = await page.getByTestId('os-toasts').boundingBox();
      if (bar === null || note === null) throw new Error('no box for the banner or the trade bar');
      expect(note.y + note.height, 'the banner ends above the trade bar').toBeLessThanOrEqual(bar.y + 1);
    }
    const col = await page.getByTestId('os-toasts').boundingBox();
    // Over a maximized terminal Broker the column is in its dock (an inline left sets the place): the notices stay between the
    // dock's edges. A narrow Broker (under 900 px, no terminal ticket) has its dock above the trade bar, so the check is the terminal's.
    const inDock = ((await page.getByTestId('os-toasts').getAttribute('style')) ?? '').includes('left:');
    const terminal = (await page.getByTestId('terminal-ticket').count()) > 0;
    const dockBox = inDock && terminal ? await page.getByTestId('terminal-dock').boundingBox() : null;
    if (col !== null && dockBox !== null) {
      expect(col.y, 'toast column top above the dock').toBeGreaterThanOrEqual(dockBox.y - 1);
      expect(col.y + col.height, 'toast column bottom below the dock').toBeLessThanOrEqual(dockBox.y + dockBox.height + 1);
    }
    // The ticket column exists on the desktop only; below 900 px the trade bar holds the Buy button.
    const submit = (await page.getByTestId('order-submit').count()) > 0 ? await page.getByTestId('order-submit').boundingBox() : null;
    if (col !== null && submit !== null) {
      const overlap = col.x < submit.x + submit.width && col.x + col.width > submit.x && col.y < submit.y + submit.height && col.y + col.height > submit.y;
      expect(overlap).toBe(false);
    }
    await page.getByTestId('os-toast-more').click();
    await expect(page.getByTestId('bell-panel')).toBeVisible();
  });

  test('@toast_corner narrow Broker: one notice, above its trade bar and never over it', async ({ page }) => {
    onlyIn('desktop', 'desktop-900');
    watchErrors(page);
    await boot(page);
    // Two Brokers tile into halves on the desk, so the focused right one is narrow (under 900 px) and the corner reaches it; on
    // 900 px one Broker fills the width and is narrow too. The notices are the narrow banner: one at a time, above the trade bar.
    await newBroker(page);
    await newBroker(page);
    await settle(page);
    const win = page.locator('.os-win.active[data-testid^="win-broker"]');
    await expect(win).toHaveCount(1);
    await expect(win.getByTestId('trade-bar-slot')).toBeVisible();
    for (let i = 1; i <= 5; i++) {
      await page.evaluate((n) => window.__tg!.state().toast({ tone: 'info', text: `narrow notice ${n}` }), i);
    }
    await expect(page.getByTestId('os-toast-more')).toHaveText(/\+4/);
    await expect(page.locator('[data-testid^="os-toast-"][data-tone]')).toHaveCount(1);
    const col = await page.getByTestId('os-toasts').boundingBox();
    const slot = await win.getByTestId('trade-bar-slot').boundingBox();
    const winBox = await win.boundingBox();
    if (col === null || slot === null || winBox === null) throw new Error('no box for the narrow banner, trade bar or window');
    expect(col.y + col.height, 'the banner ends above the trade bar').toBeLessThanOrEqual(slot.y + 1);
    expect(col.x, 'the banner starts inside the Broker').toBeGreaterThanOrEqual(winBox.x);
    expect(col.x + col.width, 'the banner ends inside the Broker').toBeLessThanOrEqual(winBox.x + winBox.width);
  });

  test('@bell_panel the bell opens the notification center and closes again', async ({ page }) => {
    onlyIn(...DESKTOPS);
    watchErrors(page);
    await boot(page);
    await page.getByTestId('os-bell').click();
    await expect(page.getByTestId('bell-panel')).toBeVisible();
    await page.getByTestId('bell-close').click();
    await expect(page.getByTestId('bell-panel')).toHaveCount(0);
  });

  test('@title_maximize double-clicking a title bar fills the window and a second double-click restores it', async ({ page }) => {
    onlyIn('desktop', 'desktop-1920', 'desktop-1000');
    watchErrors(page);
    await boot(page);
    await openFromShelf(page, 'wire');
    await settle(page);
    const before = await box(page, 'wire');
    await page.getByTestId('win-wire-title').dblclick();
    await settle(page);
    const full = await box(page, 'wire');
    expect(full.w).toBeGreaterThan(before.w + 20);
    await page.getByTestId('win-wire-title').dblclick();
    await settle(page);
    expectRect(await box(page, 'wire'), before);
  });
});
