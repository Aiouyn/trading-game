import { expect, test, type Page } from '@playwright/test';
import { boot, onlyIn, orders } from './support';
import { skipTips } from '../helpers';

/** Holds the Quay mark for ms (a real pointer hold). The app times the hold from pointerdown. */
async function holdQuay(page: Page, ms: number): Promise<void> {
  const box = await page.getByTestId('phone-quay').boundingBox();
  if (box === null) throw new Error('no Quay mark');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

/** The app ids of the phone's unlocked home tiles, in grid order. */
async function unlockedTiles(page: Page): Promise<string[]> {
  return page
    .locator('[data-testid^="home-app-"]:not(.locked)')
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.testid ?? '').map((t) => t.slice('home-app-'.length)));
}

/** Opens an app from home and goes back home (the phone's own path, P2-114). */
async function openFromHome(page: Page, app: string): Promise<void> {
  await page.getByTestId(`home-app-${app}`).click();
  const screen = page.getByTestId(`phone-app-${app}`);
  await expect(screen).toBeVisible();
  // Several app screens stay mounted (the top three keep their state), so the back button is the one on this screen.
  await screen.getByTestId('phone-back').click();
  await expect(page.getByTestId('home')).toBeVisible();
}

/** Live store subscriptions the Recent sheet holds (0 when closed, 1 while open: C-22). */
async function recentSubscriptions(page: Page): Promise<number> {
  return page.evaluate(() => window.__tg!.e2e!.recentSubscriptions());
}

test.describe('phone shell', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone only');

  test('@phone_mark_gestures a short hold on the Quay mark goes home, and a long hold opens Recent', async ({ page }) => {
    onlyIn('phone');
    await boot(page);
    await openFromHome(page, 'wire');
    await holdQuay(page, 300);
    await expect(page.getByTestId('phone-recents')).toHaveCount(0);
    await expect(page.getByTestId('home')).toBeVisible();
    await page.getByTestId('home-app-wire').click();
    await holdQuay(page, 800);
    await expect(page.getByTestId('phone-recents')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('phone-recents')).toHaveCount(0);
  });

  test('@phone_stack_cap seven apps opened leave six rows in Recent, most recent first', async ({ page }) => {
    onlyIn('phone');
    await boot(page);
    const apps = (await unlockedTiles(page)).filter((a) => a !== 'settings').slice(0, 7);
    expect(apps.length).toBe(7);
    for (const a of apps) await openFromHome(page, a);
    await holdQuay(page, 800);
    await expect(page.getByTestId('phone-recents')).toBeVisible();
    const rows = await page.locator('[data-testid^="recents-row-"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.testid ?? ''));
    expect(rows).toHaveLength(6);
    expect(rows[0]).toBe(`recents-row-${apps[apps.length - 1]}`);
    await page.getByTestId('recents-home').click();
  });

  test('@phone_recent_live_line the sheet is mounted only while open, subscribes only while open, and the Broker row shows its live price', async ({ page }) => {
    onlyIn('phone');
    await boot(page);
    await openFromHome(page, 'broker');
    await expect(page.getByTestId('phone-recents')).toHaveCount(0);
    expect(await recentSubscriptions(page)).toBe(0);
    await holdQuay(page, 800);
    await expect(page.getByTestId('phone-recents')).toBeVisible();
    expect(await recentSubscriptions(page)).toBe(1);
    await expect(page.getByTestId('recents-row-broker')).toContainText(/\d/);
    await page.getByTestId('recents-home').click();
    await expect(page.getByTestId('phone-recents')).toHaveCount(0);
    expect(await recentSubscriptions(page)).toBe(0);
    // Opening the sheet again takes one subscription, and Escape releases it.
    await holdQuay(page, 800);
    await expect(page.getByTestId('phone-recents')).toBeVisible();
    expect(await recentSubscriptions(page)).toBe(1);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('phone-recents')).toHaveCount(0);
    expect(await recentSubscriptions(page)).toBe(0);
  });

  test('@phone_draft_never_sends an unsent ticket stays a draft through Recent, and no order is placed', async ({ page }) => {
    onlyIn('phone');
    await boot(page);
    const before = await orders(page);
    await page.getByTestId('home-app-broker').click();
    await page.getByTestId('bar-qty').fill('7');
    await page.getByTestId('phone-back').click();
    await holdQuay(page, 800);
    await expect(page.getByTestId('recents-draft-broker')).toHaveCount(1);
    await page.getByTestId('recents-home').click();
    expect(await orders(page)).toBe(before);
  });

  test('@phone_edge_swipe the edge swipe back is standalone only and is not checked here', async () => {
    test.skip(true, 'standalone-only path: the installed app is not built in V1 (C-18, C-36, F:97)');
  });

  test('@phone_broker_inline the phone Broker is a full-screen app with a sticky trade bar; the full ticket is a bottom sheet', async ({ page }) => {
    onlyIn('phone');
    await boot(page);
    await page.getByTestId('home-app-broker').click();
    await expect(page.getByTestId('phone-app-broker')).toBeVisible();
    await skipTips(page);
    await expect(page.getByTestId('trade-bar')).toBeVisible();
    await expect(page.getByTestId('bar-qty')).toBeVisible();
    await expect(page.getByTestId('order-pad')).toHaveCount(0);
    await page.getByTestId('bar-qty').fill('1');
    await page.getByTestId('bar-review').click();
    await expect(page.getByTestId('order-pad')).toBeVisible();
    await expect(page.getByTestId('open-trade')).toHaveCount(0);
  });
});
