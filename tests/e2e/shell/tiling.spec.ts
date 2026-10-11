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

  test('@toast_corner toasts stay off the ticket, show at most three, and the overflow opens the bell', async ({ page }) => {
    onlyIn(...DESKTOPS);
    watchErrors(page);
    await boot(page);
    for (let i = 1; i <= 5; i++) {
      await page.evaluate((n) => window.__tg!.state().toast({ tone: 'info', text: `notice ${n}` }), i);
    }
    await expect(page.getByTestId('os-toast-more')).toHaveText(/\+2/);
    await expect(page.locator('[data-testid^="os-toast-"][data-tone]')).toHaveCount(3);
    const col = await page.getByTestId('os-toasts').boundingBox();
    // The ticket column exists on the desktop only; below 900 px the trade bar holds the Buy button.
    const submit = (await page.getByTestId('order-submit').count()) > 0 ? await page.getByTestId('order-submit').boundingBox() : null;
    if (col !== null && submit !== null) {
      const overlap = col.x < submit.x + submit.width && col.x + col.width > submit.x && col.y < submit.y + submit.height && col.y + col.height > submit.y;
      expect(overlap).toBe(false);
    }
    await page.getByTestId('os-toast-more').click();
    await expect(page.getByTestId('bell-panel')).toBeVisible();
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
