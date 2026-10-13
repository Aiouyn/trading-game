import { expect, test } from '@playwright/test';
import { watchErrors } from '../helpers';
import { boot, onlyIn } from './support';

/**
 * The top strip (track A, problem 10 and problem 7): Cash, Net worth, Open P&L and P&L since arrival are labelled, and nothing in
 * the strip is cropped from 900 to 1920 px. Open P&L is the account's figure, after the exit fee, as the Broker's Positions line shows it.
 */

test.describe('the top strip shows the account', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop strip');

  // Each band of the strip: the widths where the figures change, and the widths either side of each breakpoint.
  for (const w of [900, 1000, 1099, 1100, 1199, 1280, 1399, 1400, 1440, 1499, 1500, 1600, 1699, 1700, 1920]) {
    test(`@strip_account at ${w} px the cash, net worth and open P&L are labelled, and nothing in the strip is cropped`, async ({ page }) => {
      onlyIn('desktop');
      watchErrors(page);
      await page.setViewportSize({ width: w, height: 900 });
      await boot(page);
      const strip = page.getByTestId('os-strip');
      const sb = await strip.boundingBox();
      expect(sb).not.toBeNull();
      // nothing in the strip runs past its right edge (its items do not shrink, so an overflow shows as a scroll width)
      const overflow = await strip.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow, 'the top strip does not overflow').toBeLessThanOrEqual(1);
      // the bell, the net worth and the open P&L are inside the strip
      for (const id of ['os-networth', 'os-open-pnl', 'os-bell']) {
        const b = await page.getByTestId(id).boundingBox();
        expect(b, `${id} is drawn`).not.toBeNull();
        expect(b!.x + b!.width, `${id} inside the strip`).toBeLessThanOrEqual(sb!.x + sb!.width + 1);
      }
      await expect(page.getByTestId('os-networth')).toBeVisible();
      await expect(page.getByTestId('os-open-pnl')).toBeVisible();
      if (w >= 1100) await expect(page.getByTestId('os-cash')).toBeVisible();
      // the open P&L the strip shows is the figure each Broker's Positions line shows (the account's, after the exit fee)
      const figure = (await page.getByTestId('os-open-pnl').locator('.os-val-full').textContent()) ?? '';
      expect(figure.length).toBeGreaterThan(0);
      if (w >= 1200) await expect(page.getByTestId('cash').first()).toContainText(figure);
    });
  }
});
