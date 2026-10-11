import { expect, test } from '@playwright/test';
import { watchErrors } from '../helpers';
import { DESKTOPS, boot, onlyIn } from './support';

test.describe('workspace tabs (stage 2)', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop top bar');

  test('@workspace_tabs the top bar shows the workspaces as tabs; the first is active and the locked ones are disabled', async ({ page }) => {
    onlyIn(...DESKTOPS);
    watchErrors(page);
    await boot(page);
    const tabs = page.getByTestId('ws-tabs');
    await expect(tabs).toBeVisible();
    await expect(page.getByTestId('ws-0')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('ws-0')).toHaveText('Trade');
    await expect(page.getByTestId('ws-1')).toBeDisabled();
    // A locked workspace does not switch: the active tab stays put.
    await page.getByTestId('ws-1').click({ force: true }).catch(() => undefined);
    await expect(page.getByTestId('ws-0')).toHaveAttribute('aria-selected', 'true');
  });
});
