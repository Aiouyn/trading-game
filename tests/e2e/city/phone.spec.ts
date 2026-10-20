import { test } from '@playwright/test';
import { expect, isPhone, openCity, waitDrawn } from './helpers';

test('C-13 phone sheet: collapsed on mount (44 px handle), ≤ 40 % of the viewport open, no horizontal scroll', async ({ page }) => {
  test.skip(!isPhone(page), 'phone project only');
  await openCity(page, 'tier=T1');
  await waitDrawn(page);
  const sheet = page.locator('.city-sheet');
  const handle = page.locator('.city-sheet-handle');
  await expect(handle).toHaveAttribute('aria-expanded', 'false');
  const closed = await sheet.boundingBox();
  expect(Math.round(closed!.height)).toBeLessThanOrEqual(46); // 44 px handle + 1 px borders
  await handle.click();
  await expect(handle).toHaveAttribute('aria-expanded', 'true');
  const open = await sheet.boundingBox();
  const vh = page.viewportSize()!.height;
  console.log('C-13 sheet', closed!.height, '→', open!.height, 'of', vh, `(${((open!.height / vh) * 100).toFixed(1)} %)`);
  expect(open!.height).toBeLessThanOrEqual(vh * 0.4);
  const scroll = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
  expect(scroll.sw).toBeLessThanOrEqual(scroll.w);
});
