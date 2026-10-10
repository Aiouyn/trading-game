import { expect, test, type Page } from '@playwright/test';
import { boot, frame, onlyIn } from './support';

/** The longest animation still running on the page, in ms (0 when none runs). Reduced motion keeps these at 0.01 ms. */
async function longestRunning(page: Page): Promise<number> {
  return page.evaluate(() =>
    document.getAnimations()
      .filter((a) => a.playState === 'running')
      .reduce((m, a) => Math.max(m, Number(a.effect?.getComputedTiming().duration ?? 0)), 0),
  );
}

test.describe('reduced motion', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop motion');

  test('@reduced_motion the Settings switch sets reduce on html, takes effect at once, and windows open with no animation', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    await page.getByTestId('shelf-app-settings').click();
    await page.getByTestId('settings-motion-toggle').check();
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
    await page.getByTestId('shelf-app-wire').click();
    await expect(frame(page, 'wire')).toBeVisible();
    expect(await longestRunning(page)).toBeLessThanOrEqual(1);
    const dur = await frame(page, 'wire').evaluate((el) => getComputedStyle(el).transitionDuration + ' ' + getComputedStyle(el).animationDuration);
    for (const part of dur.split(' ')) expect(parseFloat(part) * (part.endsWith('ms') ? 1 : 1000)).toBeLessThanOrEqual(1);
    await page.getByTestId('settings-motion-toggle').uncheck();
    await expect(page.locator('html')).not.toHaveAttribute('data-motion', 'reduce');
  });

  test('@reduced_motion the system setting alone (prefers-reduced-motion) gives the same result without the switch', async ({ page }) => {
    onlyIn('desktop');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await boot(page);
    await page.getByTestId('shelf-app-wire').click();
    await expect(frame(page, 'wire')).toBeVisible();
    expect(await longestRunning(page)).toBeLessThanOrEqual(1);
  });
});
