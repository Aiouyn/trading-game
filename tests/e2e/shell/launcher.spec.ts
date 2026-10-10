import { expect, test } from '@playwright/test';
import { boot, brokerIds, dispatchKey, launcher, onlyIn, orders, selectedTicker, windowIds } from './support';

test.describe('launcher', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop launcher');

  test('@launcher the arrow keys move the highlight, and Escape closes without opening anything', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    await page.keyboard.press('Control+KeyK');
    await expect(page.getByTestId('os-launcher-input')).toBeFocused();
    const options = page.getByTestId('os-launcher-list').getByRole('option');
    expect(await options.count()).toBeGreaterThan(2);
    const selected = page.locator('[role="option"][aria-selected="true"]');
    const first = await selected.getAttribute('id');
    await page.keyboard.press('ArrowDown');
    expect(await selected.getAttribute('id')).not.toBe(first);
    await page.keyboard.press('ArrowUp');
    expect(await selected.getAttribute('id')).toBe(first);
    const before = await windowIds(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('os-launcher')).toHaveCount(0);
    expect(await windowIds(page)).toEqual(before);
  });

  test('@launcher Enter on a ticker focuses the Broker that shows it; Shift+Enter opens a new one', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    const ticker = await selectedTicker(page);
    expect(await brokerIds(page)).toHaveLength(1);
    await launcher(page, ticker);
    await expect(page.locator('[data-testid^="os-launcher-result-ticker-"][aria-selected="true"]')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('os-launcher')).toHaveCount(0);
    expect(await brokerIds(page)).toHaveLength(1);
    await launcher(page, ticker);
    await expect(page.locator('[data-testid^="os-launcher-result-ticker-"][aria-selected="true"]')).toHaveCount(1);
    await page.keyboard.press('Shift+Enter');
    await expect.poll(() => brokerIds(page)).toHaveLength(2);
  });

  test('@launcher the Focus command toggles focus mode from the list', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    await launcher(page, 'focus mode');
    await page.getByTestId('os-launcher-list').getByRole('option', { name: /Focus mode/ }).click();
    await expect(page.locator('html')).toHaveClass(/focus-mode/);
  });

  test('@launcher the launcher never places an order, whatever row it runs', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    const before = await orders(page);
    const ticker = await selectedTicker(page);
    await launcher(page, ticker);
    await page.keyboard.press('Shift+Enter');
    await launcher(page, 'new broker');
    await page.keyboard.press('Enter');
    await launcher(page, 'focus mode');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+Period');
    expect(await orders(page)).toBe(before);
  });

  test('@compact_chrome below 1000 px the launcher field is the glyph, and Ctrl K still opens the launcher', async ({ page }) => {
    onlyIn('desktop-900');
    await boot(page);
    await expect(page.locator('html')).toHaveClass(/os-narrow/);
    await expect(page.locator('html')).toHaveClass(/os-compact/);
    await page.keyboard.press('Control+KeyK');
    await expect(page.getByTestId('os-launcher-input')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('os-launcher')).toHaveCount(0);
  });

  test('@compact_chrome at 1000 px the launcher field keeps its label and Ctrl K opens it', async ({ page }) => {
    onlyIn('desktop-1000');
    await boot(page);
    await expect(page.locator('html')).not.toHaveClass(/os-narrow/);
    await dispatchKey(page, { code: 'KeyK', key: 'k', ctrl: true });
    await expect(page.getByTestId('os-launcher-input')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('os-launcher')).toHaveCount(0);
  });
});
