import { expect, test } from '@playwright/test';
import { boot, onlyIn } from './support';

// The dock (UX stage 6, item 15): three groups (Pinned, Apps, Tools), a name on hover or focus, and a locked tile that
// names the rank that unlocks it.
test.describe('dock', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop dock');

  test('@dock the tiles sit in Pinned (Broker, Portfolio, Wire, Messages) and Apps, with the tools group last', async ({ page }) => {
    onlyIn('desktop', 'desktop-1920');
    await boot(page);
    const pinned = page.getByTestId('shelf-group-pinned');
    await expect(pinned).toBeVisible();
    await expect(pinned.getByRole('button')).toHaveCount(4);
    const pinnedIds = await pinned.locator('button').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    expect(pinnedIds).toEqual(['shelf-app-broker', 'shelf-app-portfolio', 'shelf-app-wire', 'shelf-app-messages']);
    await expect(page.getByTestId('shelf-group-apps')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Pinned' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Apps' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Tools' })).toBeVisible();
    // the groups do not overlap and the tools stay on the right of the dock
    const groups = await page.locator('.os-shelf > .os-tiles, .os-shelf > .os-tools').evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect()),
    );
    for (let i = 1; i < groups.length; i += 1) expect(groups[i]!.left).toBeGreaterThanOrEqual(groups[i - 1]!.right - 1);
  });

  test('@dock hovering a tile shows its name, and a locked tile names its unlocking rank', async ({ page }) => {
    onlyIn('desktop', 'desktop-1920');
    await boot(page);
    const broker = page.getByTestId('shelf-app-broker');
    await broker.hover();
    await expect(page.getByTestId('shelf-tip-broker')).toHaveCSS('opacity', '1');
    await expect(page.getByTestId('shelf-tip-broker')).toHaveText('Broker');
    const locked = page.locator('[data-testid^="shelf-app-"][aria-disabled="true"]').first();
    if ((await locked.count()) > 0) {
      const id = (await locked.getAttribute('data-testid'))!.replace('shelf-app-', '');
      await locked.hover();
      // the tip says what opens the tile: its rank and the peak net worth it needs (UX stage 6, item 11)
      await expect(page.getByTestId(`shelf-tip-${id}`)).toHaveText(/Opens at \S+.*peak net worth/);
    }
  });
});
