import { expect, test, type Page } from '@playwright/test';
import { boot, frame, grant, isPhone, onlyIn, skipRankUp, windowIds } from './support';

/** Records when the OS update and its skip control first appear, in performance.now() ms (rank-up skip after 1 s). */
async function watchCeremony(page: Page): Promise<void> {
  await page.evaluate(() => {
    const rec = window as unknown as { __ceremony: { update: number | null; skip: number | null } };
    rec.__ceremony = { update: null, skip: null };
    new MutationObserver(() => {
      if (rec.__ceremony.update === null && document.querySelector('[data-testid="os-update"]')) rec.__ceremony.update = performance.now();
      if (rec.__ceremony.skip === null && document.querySelector('[data-testid="os-update-skip"]')) rec.__ceremony.skip = performance.now();
    }).observe(document.body, { childList: true, subtree: true });
  });
}

test.describe('rank-up ceremony', () => {
  test('@ceremony_waits the OS update waits for the idle clock, and its skip opens after one second', async ({ page }) => {
    onlyIn('desktop', 'phone');
    const handle = await boot(page);
    await watchCeremony(page);
    await grant(handle, 300_000);
    // Owner is reached, but the ceremony waits for 10 s of idle: nothing shows in the first two seconds.
    await page.waitForTimeout(2_000);
    await expect(page.getByTestId('os-update')).toHaveCount(0);
    await page.evaluate(() => window.__tg!.e2e!.idle());
    await expect(page.getByTestId('os-update')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId('os-update-skip')).toBeVisible({ timeout: 5_000 });
    const times = await page.evaluate(() => (window as unknown as { __ceremony: { update: number | null; skip: number | null } }).__ceremony);
    expect(times.update).not.toBeNull();
    expect(times.skip).not.toBeNull();
    expect((times.skip ?? 0) - (times.update ?? 0)).toBeGreaterThanOrEqual(950);
    await skipRankUp(page);
    await expect(page.getByTestId('os-update')).toHaveCount(0);
  });

  test('@ceremony_waits a drag in progress holds the ceremony back, and the release does not start it early', async ({ page }) => {
    onlyIn('desktop');
    const handle = await boot(page);
    await page.getByTestId('shelf-app-wire').click();
    await expect(frame(page, 'wire')).toBeVisible();
    await grant(handle, 300_000);
    const title = await page.getByTestId('win-wire-title').boundingBox();
    if (title === null) throw new Error('no title');
    const x = title.x + 80;
    const y = title.y + title.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    // A drag resets the idle clock on every move (F:154), so the ceremony cannot start while the pointer is down.
    for (let i = 0; i < 12; i++) {
      await page.mouse.move(x + i * 4, y + i);
      await page.waitForTimeout(1_000);
    }
    await expect(page.getByTestId('os-update')).toHaveCount(0);
    await page.mouse.up();
    expect(await windowIds(page)).toContain('wire');
    await page.evaluate(() => window.__tg!.e2e!.idle());
    await expect(page.getByTestId('os-update')).toBeVisible({ timeout: 25_000 });
    await skipRankUp(page);
  });

  test('@ceremony_waits the ceremony is skipped on the phone too', async ({ page }) => {
    onlyIn('phone');
    expect(isPhone(page)).toBe(true);
    const handle = await boot(page);
    await grant(handle, 300_000);
    await page.evaluate(() => window.__tg!.e2e!.idle());
    await expect(page.getByTestId('os-update')).toBeVisible({ timeout: 25_000 });
    await skipRankUp(page);
  });
});
