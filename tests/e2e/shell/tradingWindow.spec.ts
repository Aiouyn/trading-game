import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from '../helpers';
import { DESKTOPS, boot, brokerCount, brokerIds, dispatchKey, launcher, onlyIn, selectedTicker } from './support';

/**
 * Track A (the trading window): a Broker changes its ticker in place. A watchlist pick, a launcher ticker row and a plain
 * Alt N change the focused Broker; a new window opens only for an explicit fresh open (Alt Shift N, New Broker, Shift+Enter).
 * The top strip shows the account's cash, net worth, open P&L and change since arrival, and nothing in it is cropped.
 */

/** A listed stock other than the ones given: the ticker a pick moves the Broker to. */
async function otherStock(page: Page, not: string | string[]): Promise<string> {
  const skip = Array.isArray(not) ? not : [not];
  const id = await page.evaluate((n) => {
    const s = window.__tg!.state();
    return s.config.assets.find((a) => a.assetClass === 'stock' && !n.includes(a.id) && a.listed !== false)?.id ?? null;
  }, skip);
  if (id === null) throw new Error('no other stock in the universe');
  return id;
}

test.describe('a Broker changes its ticker in place', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop windows');

  test('@wm_in_place a watchlist pick changes the Broker in its own window and opens no second one', async ({ page }) => {
    onlyIn('desktop', 'desktop-1920');
    watchErrors(page);
    await boot(page);
    const [id] = await brokerIds(page);
    expect(id).toBeDefined();
    const other = await otherStock(page, await selectedTicker(page));
    await page.getByTestId('uni-stock').click();
    await page.getByTestId(`watch-${other}`).click();
    await expect.poll(() => selectedTicker(page)).toBe(other);
    expect(await brokerIds(page)).toEqual([id]);
    await expect(page.getByTestId(`win-${id}-title`)).toContainText(other);
  });

  test('@wm_in_place a launcher ticker changes the focused Broker, Alt N keeps it, and Alt Shift N opens a new window', async ({ page }) => {
    onlyIn(...DESKTOPS);
    watchErrors(page);
    await boot(page);
    const [id] = await brokerIds(page);
    const other = await otherStock(page, await selectedTicker(page));

    await launcher(page, other);
    await page.getByTestId('os-launcher-list').getByRole('option').filter({ hasText: other }).first().click();
    await expect.poll(() => selectedTicker(page)).toBe(other);
    expect(await brokerIds(page)).toEqual([id]);
    await expect(page.getByTestId(`win-${id}-title`)).toContainText(other);

    // Alt N on the ticker the Broker already shows: no second window, and nothing changes
    await dispatchKey(page, { code: 'KeyN', key: 'n', alt: true });
    expect(await brokerIds(page)).toEqual([id]);
    await expect(page.getByTestId(`win-${id}-title`)).toContainText(other);

    // Alt Shift N is the explicit new window, even on a shown ticker
    await dispatchKey(page, { code: 'KeyN', key: 'N', alt: true, shift: true });
    await expect.poll(() => brokerCount(page)).toBe(2);
  });

  test('@wm_in_place a plain open at the cap changes the focused Broker and says nothing; with another window in focus it still retargets the least recently used one', async ({ page }) => {
    onlyIn(...DESKTOPS);
    watchErrors(page);
    await boot(page);
    const start = await selectedTicker(page);
    for (let i = 0; i < 3; i++) {
      await dispatchKey(page, { code: 'KeyN', key: 'N', alt: true, shift: true });
    }
    await expect.poll(() => brokerCount(page)).toBe(4);
    const other = await otherStock(page, start);
    // a Broker is in focus: its ticker changes in place, no window is retargeted and no notice shows
    await launcher(page, other);
    await page.getByTestId('os-launcher-list').getByRole('option').filter({ hasText: other }).first().click();
    await expect.poll(() => selectedTicker(page)).toBe(other);
    expect(await brokerCount(page)).toBe(4);
    await expect(page.getByTestId('os-toasts')).not.toContainText('least recently used');

    // Wire in focus: the window rules apply, so the cap retargets the least recently used Broker and says so
    await page.getByTestId('shelf-app-wire').click();
    // a ticker no Broker shows yet, so the cap has to retarget a window for it
    const third = await otherStock(page, [start, other]);
    await launcher(page, third);
    await page.getByTestId('os-launcher-list').getByRole('option').filter({ hasText: third }).first().click();
    await expect(page.getByTestId('os-toasts')).toContainText('least recently used');
    expect(await brokerCount(page)).toBe(4);
  });
});


test.describe('a short Broker keeps its trade bar', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop windows');

  test('@short_bar a Broker under 560 px tall keeps Buy and Sell in both panes, and its Review opens the ticket pane', async ({ page }) => {
    onlyIn('desktop');
    watchErrors(page);
    await page.setViewportSize({ width: 1000, height: 520 });
    await boot(page);
    await expect(page.getByTestId('broker-short')).toBeVisible();
    await expect(page.getByTestId('trade-bar-slot')).toBeVisible();
    await expect(page.getByTestId('bar-side-buy')).toBeVisible();
    await page.getByTestId('bar-qty').fill('1');
    await expect(page.getByTestId('bar-review')).toBeEnabled();
    await page.getByTestId('bar-review').click();
    await expect(page.getByTestId('broker-pane-ticket')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('order-submit')).toBeVisible();
  });
});
