import { expect, test, type Locator } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { goTo, skipTips } from './helpers';
import { boot, onlyIn } from './shell/support';

/**
 * The review shots of the Broker chart's new views (R-10-5), in English and French, on the desktop (1440 x 900) and the phone
 * (390 x 844): the timeframes and the scale switches, the drawing toolbar with a flyout open, a drawn trend line with its
 * properties panel, and the long position tool with its risk panel. The files go to CHART_SHOTS (the phase's shots folder).
 */

const SHOTS = process.env.CHART_SHOTS ?? 'test-results/chart-shots';

async function plotAt(chart: Locator, fx: number, fy: number): Promise<{ x: number; y: number }> {
  const b = await chart.boundingBox();
  if (!b) throw new Error('the price chart is not drawn');
  return { x: b.x + b.width * fx, y: b.y + b.height * fy };
}

/** The settings screen's language switch, then back to the Broker (the page's language follows the switch). */
async function setFrench(page: import('@playwright/test').Page): Promise<void> {
  await goTo(page, 'profile');
  await page.getByTestId('settings-lang-fr').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
}

test.describe('Broker chart review shots', () => {
  for (const lang of ['en', 'fr'] as const) {
    test(`desktop ${lang}: sizes, flyout, a trend line with its panel, and the position tool`, async ({ page }) => {
      onlyIn('desktop');
      await page.setViewportSize({ width: 1440, height: 900 });
      mkdirSync(SHOTS, { recursive: true });
      await boot(page);
      if (lang === 'fr') await setFrench(page);
      await goTo(page, 'market');
      const chart = page.getByTestId('price-chart').first();
      await expect.poll(async () => Number((await chart.getAttribute('data-candles')) ?? 0), { timeout: 30_000 }).toBeGreaterThan(0);
      await page.getByTestId('interval-1h').click();
      await page.getByTestId('range-1W').click();
      await page.getByTestId('log-axis').click();
      await page.getByTestId('log-axis').click();
      await page.screenshot({ path: `${SHOTS}/desktop-${lang}-timeframes.png` });

      // the lines flyout, open from its caret
      await page.getByTestId('tool-more-lines').click();
      await expect(page.getByTestId('tool-flyout-lines')).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/desktop-${lang}-flyout.png` });
      await page.keyboard.press('Escape');

      // a trend line and a horizontal line, the first selected: its properties panel
      await chart.hover();
      await page.keyboard.press('Alt+t');
      const a = await plotAt(chart, 0.2, 0.3);
      const b = await plotAt(chart, 0.45, 0.45);
      await page.mouse.click(a.x, a.y);
      await page.mouse.click(b.x, b.y);
      await page.keyboard.press('Alt+h');
      const h = await plotAt(chart, 0.6, 0.7);
      await page.mouse.click(h.x, h.y);
      // the horizontal line is the one in hand, so its properties panel is the one shot
      await expect(page.getByTestId('drawing-panel')).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/desktop-${lang}-drawings.png` });
      await page.keyboard.press('Escape');

      // the long position tool with its risk panel
      await page.keyboard.press('Alt+l');
      const p = await plotAt(chart, 0.8, 0.4);
      await page.mouse.click(p.x, p.y);
      await page.getByTestId('position-risk-usd').fill('100');
      await expect(page.getByTestId('position-panel')).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/desktop-${lang}-position.png` });
    });
  }

  for (const lang of ['en', 'fr'] as const) {
    test(`phone ${lang}: the chart's size row and the scale switches on a narrow screen`, async ({ page }) => {
      onlyIn('phone');
      mkdirSync(SHOTS, { recursive: true });
      await boot(page);
      if (lang === 'fr') { await setFrench(page); await goTo(page, 'market'); } else await page.getByTestId('home-app-broker').click();
      await expect(page.getByTestId('phone-app-broker')).toBeVisible();
      await skipTips(page);
      const chart = page.getByTestId('price-chart').first();
      await expect.poll(async () => Number((await chart.getAttribute('data-candles')) ?? 0), { timeout: 30_000 }).toBeGreaterThan(0);
      await page.getByTestId('interval-15m').click();
      await page.screenshot({ path: `${SHOTS}/phone-${lang}-chart.png` });
    });
  }
});
