import { expect, test } from '@playwright/test';
import { boot, onlyIn } from './support';

// Portfolio at 1440 (UX stage 6, item 14): the positions card sits above the balance sheet, and its header is on screen
// without a scroll of the window body.
test.describe('portfolio fold', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop portfolio');

  test('@portfolio_fold the positions card is above the balance sheet and its header shows at 1440 x 900 without a scroll', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    await page.getByTestId('shelf-app-portfolio').click();
    const win = page.locator('[data-testid^="win-portfolio"]').first();
    await expect(win.getByTestId('portfolio-view')).toBeVisible();
    const body = win.locator('.os-win-body');
    const positions = win.getByTestId('positions');
    const balance = win.getByRole('heading', { name: /Balance sheet|Bilan/ });
    await expect(positions).toBeVisible();
    const pb = await positions.boundingBox();
    const bb = await balance.boundingBox();
    expect(pb && bb && pb.y < bb.y).toBe(true);
    const bodyBox = await body.boundingBox();
    // the positions header (the top ~96 px of the card) sits inside the window body's visible area
    expect(pb && bodyBox && pb.y + 96 <= bodyBox.y + bodyBox.height).toBe(true);
  });
});
