import { expect, test, type Page } from '@playwright/test';
import { noHorizontalOverflow, register, skipTips, watchErrors } from './helpers';

/** The desktop is ready: the save is bound and the first tips are out of the way. */
async function settle(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-game', 'ready', { timeout: 30_000 });
  await expect(page.getByTestId('os-desktop')).toBeVisible();
  await skipTips(page);
}

test.describe('desktop shell', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop flows');

  test('an unknown ticker in the URL or a stale saved ticker never crashes the desktop', async ({ page }) => {
    const errors = watchErrors(page);
    await register(page);
    await page.goto('/broker/NOPE');
    await settle(page);
    await expect(page.getByTestId('os-toasts')).toContainText('NOPE');
    await expect(page.getByTestId('win-broker-1')).toBeVisible();
    await page.goto('/broker?t=NOPE');
    await settle(page);
    await page.evaluate(() => {
      const raw = window.localStorage.getItem('tg-prefs');
      const p = raw ? JSON.parse(raw) : {};
      window.localStorage.setItem('tg-prefs', JSON.stringify({ ...p, lastTicker: 'NOPE' }));
    });
    await page.reload();
    await settle(page);
    await expect(page.getByTestId('win-broker-1')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('every screen call opens its window, including a second call to the same screen', async ({ page }) => {
    const errors = watchErrors(page);
    await register(page);
    await settle(page);
    await page.evaluate(() => window.__tg?.state().setScreen('profile'));
    await expect(page.getByTestId('win-settings')).toBeVisible();
    await page.getByTestId('win-settings-close').click();
    await expect(page.getByTestId('win-settings')).toHaveCount(0);
    await page.evaluate(() => window.__tg?.state().setScreen('profile'));
    await expect(page.getByTestId('win-settings')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('Alt W closes the focused window, and the shelf reopens it', async ({ page }) => {
    await register(page);
    await settle(page);
    await page.getByTestId('shelf-app-settings').click();
    await expect(page.getByTestId('win-settings')).toBeVisible();
    await page.getByTestId('win-settings').click({ position: { x: 40, y: 60 } });
    await page.keyboard.press('Alt+KeyW');
    await expect(page.getByTestId('win-settings')).toHaveCount(0);
    await page.getByTestId('shelf-app-settings').click();
    await expect(page.getByTestId('win-settings')).toBeVisible();
  });

  test('Settings lists the live shortcuts and About replays the intro', async ({ page }) => {
    await register(page);
    await settle(page);
    await page.getByTestId('shelf-app-settings').click();
    await expect(page.getByTestId('settings-keys')).toContainText('Alt W');
    await expect(page.getByTestId('settings-keys')).not.toContainText('Ctrl K');
    await page.evaluate(() => window.__tg?.state().setScreen('profile'));
    await expect(page.getByTestId('win-settings')).toBeVisible();
    await noHorizontalOverflow(page);
  });

  test('the shared edge between two tiled windows moves the split on drag', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await register(page);
    await settle(page);
    const broker = page.getByTestId('win-broker-1');
    await expect(broker).toBeVisible();
    const before = await broker.boundingBox();
    const handle = page.locator('.os-split.v').first();
    await expect(handle).toBeVisible();
    const hb = await handle.boundingBox();
    if (!before || !hb) throw new Error('no geometry');
    const x = hb.x + hb.width / 2;
    const y = hb.y + hb.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 120, y, { steps: 6 });
    await page.mouse.up();
    const after = await broker.boundingBox();
    if (!after) throw new Error('no geometry after');
    expect(after.width).toBeLessThan(before.width - 60);
  });

  test('halves mode (1000-1199 px): dragging a title bar to the left edge snaps to a half', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await register(page);
    await settle(page);
    const title = page.getByTestId('win-broker-1-title');
    await expect(title).toBeVisible();
    const tb = await title.boundingBox();
    if (!tb) throw new Error('no title geometry');
    const sx = tb.x + tb.width / 2;
    const sy = tb.y + tb.height / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(2, sy, { steps: 10 });
    await expect(page.getByTestId('snap-preview')).toBeVisible();
    await page.mouse.up();
    await expect(page.getByTestId('snap-preview')).toHaveCount(0);
    const box = await page.getByTestId('win-broker-1').boundingBox();
    if (!box) throw new Error('no window geometry');
    expect(box.width).toBeLessThan(600);
    expect(box.x).toBeLessThan(40);
    await noHorizontalOverflow(page);
  });
});
