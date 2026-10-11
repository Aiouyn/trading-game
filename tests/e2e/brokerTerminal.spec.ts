import { expect, test, type Page } from '@playwright/test';
import { noHorizontalOverflow, skipTips } from './helpers';
import { boot, onlyIn, windowIds } from './shell/support';

/**
 * The Broker terminal (UX redesign, spec 1.1 and 1.2): on the desktop, the chart, the order ticket and the Buy button are on
 * screen together at the three desktop sizes, without the page scrolling. On the phone, the trade bar and the bottom sheet
 * replace the inline ticket. The screenshots go to BROKER_SHOTS (or test-results/broker-terminal) for the layout review.
 */

const DESKTOPS = [
  { w: 1280, h: 720 },
  { w: 1440, h: 900 },
  { w: 1920, h: 1080 },
] as const;

const SHOTS = process.env.BROKER_SHOTS ?? 'test-results/broker-terminal';

/** The rectangle of a test id, or null when it is not drawn. */
async function box(page: Page, testId: string) {
  return page.getByTestId(testId).first().boundingBox();
}

/** A whole element sits inside the viewport: its top, left, right and bottom edges are on screen. */
async function inViewport(page: Page, testId: string): Promise<void> {
  const b = await box(page, testId);
  const v = page.viewportSize()!;
  expect(b, `${testId} is drawn`).not.toBeNull();
  expect(b!.y, `${testId} top`).toBeGreaterThanOrEqual(0);
  expect(b!.x, `${testId} left`).toBeGreaterThanOrEqual(0);
  expect(b!.y + b!.height, `${testId} bottom`).toBeLessThanOrEqual(v.height);
  expect(b!.x + b!.width, `${testId} right`).toBeLessThanOrEqual(v.width);
}

test.describe('Broker terminal on the desktop', () => {
  for (const vp of DESKTOPS) {
    test(`chart, ticket and Buy are on screen without scrolling at ${vp.w}x${vp.h}, with the states shot`, async ({ page }) => {
      onlyIn('desktop');
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await boot(page);

      // the first run opens the Broker alone, maximized (the Trade workspace, not three windows and a tip card)
      const ids = await windowIds(page);
      expect(ids.filter((id) => /^broker/.test(id))).toHaveLength(1);
      expect(ids).toHaveLength(1);
      await expect(page.getByTestId('broker-terminal')).toBeVisible();

      // the three things a trade needs are on screen together, and the page does not scroll
      await inViewport(page, 'price-chart');
      await inViewport(page, 'order-qty');
      await inViewport(page, 'order-submit');
      await expect(page.getByTestId('order-submit')).toBeInViewport();
      await noHorizontalOverflow(page);
      // the fields and the summary scroll inside the ticket (its refusal, confirm line and Buy stay pinned below them); at
      // 1440 and up the whole ticket fits, and at 1280 x 720 the overflow is recorded, not hidden
      const overflow = await page.evaluate(() => {
        const pad = document.querySelector('[data-testid="order-pad"]') as HTMLElement | null;
        const body = pad?.querySelector('.overflow-y-auto') as HTMLElement | null;
        return body ? body.scrollHeight - body.clientHeight : 0;
      });
      console.log(`ticket overflow at ${vp.w}x${vp.h}: ${overflow}px`);
      if (vp.h >= 900) expect(overflow, 'the ticket fits at 900 px tall and up').toBeLessThanOrEqual(1);

      const label = `${vp.w}x${vp.h}`;
      await page.screenshot({ path: `${SHOTS}/layout-${label}-empty.png` });

      // the dock tabs, one shot each (the positions tab is the first, shot above with the empty state)
      for (const tab of ['orders', 'history', 'asset', 'options'] as const) {
        await page.getByTestId(`dock-tab-${tab}`).click();
        await expect(page.getByTestId(`dock-panel-${tab}`)).toBeVisible();
        await page.screenshot({ path: `${SHOTS}/layout-${label}-dock-${tab}.png` });
      }
      await page.getByTestId('dock-tab-positions').click();

      // with a position: a one-share market buy fills on the next tick
      await page.getByTestId('order-qty').fill('1');
      await page.getByTestId('order-submit').click();
      await expect(page.getByTestId('positions')).toBeVisible({ timeout: 30_000 });
      await page.screenshot({ path: `${SHOTS}/layout-${label}-position.png` });
      await inViewport(page, 'price-chart');
      await inViewport(page, 'order-submit');
    });
  }
});

test.describe('Broker on the phone', () => {
  test('the chart and the trade bar stay on screen; Review opens the full ticket as a bottom sheet', async ({ page }) => {
    onlyIn('phone');
    await boot(page);
    await page.getByTestId('home-app-broker').click();
    await expect(page.getByTestId('phone-app-broker')).toBeVisible();
    // the first-session coach card is a tip over the Broker; it is dismissed before the trade bar is checked
    await skipTips(page);
    await expect(page.getByTestId('broker-narrow')).toBeVisible();
    await inViewport(page, 'price-chart');
    await inViewport(page, 'trade-bar');
    await noHorizontalOverflow(page);
    await page.screenshot({ path: `${SHOTS}/layout-390x844-chart.png` });

    // the ticket is not drawn until the bar asks for it
    await expect(page.getByTestId('trade-sheet')).toHaveCount(0);
    await page.getByTestId('bar-qty').fill('1');
    await page.getByTestId('bar-review').click();
    await expect(page.getByTestId('trade-sheet')).toBeVisible();
    await expect(page.getByTestId('order-submit')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/layout-390x844-sheet-open.png` });

    // closing the sheet keeps what was typed (the bar reads the draft)
    await page.getByTestId('trade-sheet-close').click();
    await expect(page.getByTestId('trade-sheet')).toHaveCount(0);
    await expect(page.getByTestId('bar-qty')).toHaveValue('1');
  });

  test('the phone dock lists Markets, where the watchlist column would be on the desktop', async ({ page }) => {
    onlyIn('phone');
    await boot(page);
    await page.getByTestId('home-app-broker').click();
    await page.getByTestId('dock-tab-markets').click();
    await expect(page.getByTestId('dock-panel-markets')).toBeVisible();
    await expect(page.getByTestId('watchlist')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/layout-390x844-dock-markets.png` });
  });
});
