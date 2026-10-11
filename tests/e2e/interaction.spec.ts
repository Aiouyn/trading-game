import { expect, test, type Page } from '@playwright/test';
import { register, skipTips, watchErrors } from './helpers';

/** The desktop is ready: the save is bound and the first tips are out of the way. */
async function settle(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-game', 'ready', { timeout: 30_000 });
  await expect(page.getByTestId('os-desktop')).toBeVisible();
  await skipTips(page);
}

test.describe('keyboard, launcher and layouts', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop flows');

  test('Ctrl K finds a window by name, and Enter opens it with the focus in it', async ({ page }) => {
    const errors = watchErrors(page);
    await register(page);
    await settle(page);
    await page.keyboard.press('Control+KeyK');
    const input = page.getByTestId('os-launcher-input');
    await expect(input).toBeFocused();
    await input.fill('wire');
    await expect(page.getByTestId('os-launcher-result-app-1')).toContainText('Wire');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('os-launcher')).toHaveCount(0);
    await expect(page.getByTestId('win-wire')).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('Escape closes the launcher without opening anything', async ({ page }) => {
    await register(page);
    await settle(page);
    const before = await page.getByTestId('os-shelf').locator('button.os-tile.run').count();
    await page.keyboard.press('Control+KeyK');
    await expect(page.getByTestId('os-launcher')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('os-launcher')).toHaveCount(0);
    await expect(page.getByTestId('os-shelf').locator('button.os-tile.run')).toHaveCount(before);
  });

  test('Shift+Enter on a ticker row opens that ticker in a new Broker (P2-078)', async ({ page }) => {
    await register(page);
    await settle(page);
    const brokers = page.locator('[data-app="broker"]');
    const before = await brokers.count();
    await page.keyboard.press('Control+KeyK');
    await expect(page.getByTestId('os-launcher-input')).toBeFocused();
    // Hovering a row makes it the highlighted one, as the arrow keys would.
    await page.getByTestId('os-launcher-result-ticker-1').hover();
    await page.keyboard.press('Shift+Enter');
    await expect(page.getByTestId('os-launcher')).toHaveCount(0);
    await expect(brokers).toHaveCount(before + 1);
  });

  test('Alt Backquote moves the focus through the open windows', async ({ page }) => {
    await register(page);
    await settle(page);
    // the R0 desk opens the Broker alone; the Trade layout opens the other windows
    await page.getByTestId('shelf-layout-menu').click();
    await page.getByTestId('layout-trade').click();
    await page.getByTestId('shelf-app-settings').click();
    await expect(page.getByTestId('win-settings')).toBeFocused();
    // The Trade layout opens Wire, Portfolio and the Broker in that order, so the bottom-most is Wire.
    await page.keyboard.press('Alt+Backquote');
    await expect(page.getByTestId('win-wire')).toBeFocused();
    await page.keyboard.press('Alt+Backquote');
    await expect(page.getByTestId('win-portfolio')).toBeFocused();
  });

  test('Ctrl . toggles focus mode, and the keyboard list opens from Shift Slash', async ({ page }) => {
    await register(page);
    await settle(page);
    await page.keyboard.press('Control+Period');
    await expect(page.locator('html')).toHaveClass(/focus-mode/);
    await page.keyboard.press('Control+Period');
    await expect(page.locator('html')).not.toHaveClass(/focus-mode/);
    await page.keyboard.press('Shift+Slash');
    await expect(page.getByTestId('win-settings')).toBeVisible();
    await expect(page.getByTestId('settings-keys')).toContainText('Ctrl K');
  });

  test('the layout menu applies Trade and saves a named layout', async ({ page }) => {
    await register(page);
    await settle(page);
    await page.getByTestId('shelf-app-settings').click();
    await page.getByTestId('shelf-layout-menu').click();
    await expect(page.getByTestId('layout-menu')).toBeVisible();
    await page.getByTestId('layout-trade').click();
    await expect(page.getByTestId('layout-menu')).toHaveCount(0);
    await expect(page.getByTestId('win-broker-1')).toBeVisible();
    await page.getByTestId('shelf-layout-menu').click();
    await page.getByTestId('layout-name').fill('Morning');
    await page.getByTestId('layout-save').click();
    await expect(page.getByTestId('layout-custom-1')).toContainText('Morning');
  });
});
