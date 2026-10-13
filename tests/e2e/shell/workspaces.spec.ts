import { expect, test } from '@playwright/test';
import { watchErrors } from '../helpers';
import { DESKTOPS, box, boot, frame, onlyIn } from './support';

test.describe('workspace tabs (stage 2)', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop top bar');

  test('@workspace_tabs the top bar shows Trade, News, Portfolio and Empire; Trade is active and the locked tabs are disabled', async ({ page }) => {
    onlyIn(...DESKTOPS);
    watchErrors(page);
    await boot(page);
    await expect(page.getByTestId('ws-tabs')).toBeVisible();
    await expect(page.getByTestId('ws-0')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('ws-0')).toHaveText('Trade');
    await expect(page.getByTestId('ws-1')).toHaveText('News');
    await expect(page.getByTestId('ws-1')).toBeEnabled();
    await expect(page.getByTestId('ws-2')).toBeDisabled();
    await expect(page.getByTestId('ws-3')).toBeDisabled();
    // A locked workspace does not switch: the active tab stays put.
    await page.getByTestId('ws-2').click({ force: true }).catch(() => undefined);
    await expect(page.getByTestId('ws-0')).toHaveAttribute('aria-selected', 'true');
  });

  test('@workspace_switch News opens the Wire on its own workspace; switching back restores the Trade windows', async ({ page }) => {
    onlyIn(...DESKTOPS);
    watchErrors(page);
    await boot(page);
    await expect(frame(page, 'broker-1')).toBeVisible();
    await page.getByTestId('ws-1').click();
    await expect(page.getByTestId('ws-1')).toHaveAttribute('aria-selected', 'true');
    await expect(frame(page, 'wire')).toBeVisible();
    await expect(frame(page, 'broker-1')).toHaveCount(0);
    await page.getByTestId('ws-0').click();
    await expect(frame(page, 'broker-1')).toBeVisible();
    await expect(frame(page, 'wire')).toHaveCount(0);
  });

  test('@workspace_keys Ctrl Alt Right and Ctrl Alt Left move between the workspaces', async ({ page }) => {
    onlyIn(...DESKTOPS);
    watchErrors(page);
    await boot(page);
    await page.keyboard.press('Control+Alt+ArrowRight');
    await expect(page.getByTestId('ws-1')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Control+Alt+ArrowLeft');
    await expect(page.getByTestId('ws-0')).toHaveAttribute('aria-selected', 'true');
    const b = await box(page, 'broker-1');
    expect(b.w).toBeGreaterThan(0);
  });
});
