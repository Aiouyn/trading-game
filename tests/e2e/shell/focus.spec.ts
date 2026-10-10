import { expect, test, type Page } from '@playwright/test';
import { DESKTOPS, WIDE, box, boot, brokerCount, dispatchKey, expectRect, gotoShell, onlyIn, windowIds } from './support';

async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
}

test.describe('focus mode', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop focus');

  test('@focus Ctrl . hides the shelf and wallpaper, and the same key brings them back', async ({ page }) => {
    onlyIn(...DESKTOPS);
    await boot(page);
    await page.keyboard.press('Control+Period');
    await expect(page.locator('html')).toHaveClass(/focus-mode/);
    await expect(page.getByTestId('os-shelf')).toBeHidden();
    await page.keyboard.press('Control+Period');
    await expect(page.locator('html')).not.toHaveClass(/focus-mode/);
    await expect(page.getByTestId('os-shelf')).toBeVisible();
  });

  test('@focus_restore leaving focus mode restores every rect and slot from before it was entered', async ({ page }) => {
    onlyIn(...WIDE);
    await boot(page);
    await page.getByTestId('shelf-app-wire').click();
    await settle(page);
    const brokerBefore = await box(page, 'broker-1');
    const wireBefore = await box(page, 'wire');
    await page.keyboard.press('Control+Period');
    // Snaps and cycles inside focus mode (tape: 50 random moves; here a fixed run of the same kinds of action).
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowLeft']) {
      await page.keyboard.press(`Control+Shift+${key}`);
      await settle(page);
    }
    await page.keyboard.press('Control+Period');
    await settle(page);
    expectRect(await box(page, 'broker-1'), brokerBefore);
    expectRect(await box(page, 'wire'), wireBefore);
  });

  test('@focus the state is kept per save, so a reload comes back in focus mode', async ({ page }) => {
    onlyIn(...DESKTOPS);
    await boot(page);
    await page.keyboard.press('Control+Period');
    await expect(page.locator('html')).toHaveClass(/focus-mode/);
    await gotoShell(page, '/');
    await expect(page.locator('html')).toHaveClass(/focus-mode/);
    await page.keyboard.press('Control+Period');
    await expect(page.locator('html')).not.toHaveClass(/focus-mode/);
  });

  test('@focus a window already on screen is focused by its key and focus mode stays; a collapsed one is restored and leaves it', async ({ page }) => {
    onlyIn(...DESKTOPS);
    await boot(page);
    await page.keyboard.press('Control+Period');
    await expect(page.locator('html')).toHaveClass(/focus-mode/);
    // The Broker is on screen at every desktop width, so its key only focuses it and focus mode stays (DECISIONS
    // "Behaviour gaps"). Portfolio is not used: the halves and single layouts collapse it at 1000 and 900 px.
    await dispatchKey(page, { code: 'Digit1', key: '1', alt: true });
    await expect(page.locator('html')).toHaveClass(/focus-mode/);
    expect(await windowIds(page)).toContain('broker-1');
    // Collapse it, then open it from the keyboard: the restore opens a window, so focus mode ends.
    await page.keyboard.press('Control+KeyM');
    await expect.poll(() => windowIds(page)).not.toContain('broker-1');
    await dispatchKey(page, { code: 'Digit1', key: '1', alt: true });
    await expect(page.locator('html')).not.toHaveClass(/focus-mode/);
    expect(await windowIds(page)).toContain('broker-1');
  });

  test('@focus opening a new window from the keyboard leaves focus mode', async ({ page }) => {
    onlyIn(...DESKTOPS);
    await boot(page);
    await page.keyboard.press('Control+Period');
    await expect(page.locator('html')).toHaveClass(/focus-mode/);
    await dispatchKey(page, { code: 'KeyN', key: 'n', alt: true });
    await expect(page.locator('html')).not.toHaveClass(/focus-mode/);
    await expect.poll(() => brokerCount(page)).toBe(2);
  });
});
