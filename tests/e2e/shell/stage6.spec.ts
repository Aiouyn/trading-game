import { expect, test, type Locator, type Page } from '@playwright/test';
import { boot, onlyIn, reachRank } from './support';

/**
 * UX stage 6 (docs/UX-REDESIGN.md, the 15 remaining weaknesses): the refusal copy, one toast per order, and the 1280 x 720
 * terminal. The desktop project is 1440 x 900; the 1280 x 720 case sets its own viewport.
 */

async function rect(page: Page, testId: string): Promise<{ x: number; y: number; w: number; h: number }> {
  const loc: Locator = page.getByTestId(testId).first();
  const b = await loc.boundingBox();
  if (b === null) throw new Error(`no box for ${testId}`);
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}

test.describe('stage 6 ticket and toasts', () => {
  test('@s6_refusal a refused buy names its money formatted and its Max, and Cash after never shows a negative (weakness 2)', async ({ page }) => {
    onlyIn('desktop');
    const handle = await boot(page);
    await reachRank(page, handle, 8_000_000);
    await page.getByTestId('order-qty').fill('99999999');
    const msg = page.getByTestId('order-invalid');
    await expect(msg).toContainText('Max =');
    const text = (await msg.innerText()).replace(/\s+/g, ' ');
    // money is formatted to cents with separators, never a raw float such as 19174876311.2900000
    expect(text).not.toMatch(/\d{6,}\.\d{4,}/);
    expect(text).toMatch(/\$[\d,]+\.\d{2}/);
    const after = (await page.getByTestId('order-cash-after').innerText()).trim();
    expect(after.startsWith('-') || after.startsWith('\u2212')).toBe(false);
  });

  test('@s6_toasts one buy is one notice: the pending notice leaves when the order fills, and at most two notices draw (weakness 3)', async ({ page }) => {
    onlyIn('desktop');
    const handle = await boot(page);
    await reachRank(page, handle, 8_000_000);
    await page.getByTestId('order-qty').fill('1');
    await page.getByTestId('order-submit').click();
    await expect(page.getByTestId('os-toasts')).toContainText('Bought 1', { timeout: 30_000 });
    await expect(page.locator('[data-kind="pending"]')).toHaveCount(0);
    expect(await page.locator('[data-testid^="os-toast-"]').count()).toBeLessThanOrEqual(2);
  });
});

test.describe('stage 6 terminal at 1280 x 720', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('@s6_short_screen the dock starts at 140 px with a grip, the chart keeps 45% of the body, and the ticket summary is on screen (weakness 12)', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    const dock = await rect(page, 'terminal-dock');
    const chart = await rect(page, 'terminal-chart');
    expect(Math.abs(dock.h - 140)).toBeLessThanOrEqual(2);
    expect(chart.h / (chart.h + dock.h)).toBeGreaterThanOrEqual(0.45);
    await expect(page.getByTestId('dock-grip')).toBeVisible();
    const cash = await rect(page, 'order-cash-after');
    expect(cash.y + cash.h).toBeLessThanOrEqual(720);
  });
});
