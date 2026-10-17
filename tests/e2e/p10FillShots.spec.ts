import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { boot } from './shell/support';
import { skipTips } from './helpers';

/**
 * TEMPORARY (p10/fill review, 10A.6): screenshots of the Broker's new views for the lead's read. Not part of the suite; it is
 * removed from the tree before the track's commit. Output: P10_SHOTS (the scratch folder), one PNG per view.
 */
const OUT = process.env.P10_SHOTS ?? 'test-results/p10-shots';
const LANG = (process.env.P10_LANG ?? 'en') as 'en' | 'fr';

test('p10 fill shots', async ({ page }, info) => {
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  const tag = `${LANG}-${info.project.name}`;
  if (LANG === 'fr') {
    await page.addInitScript(() => {
      try { window.localStorage.setItem('tg-prefs', JSON.stringify({ lang: 'fr' })); } catch { /* private window */ }
    });
  }
  const shot = async (name: string) => page.screenshot({ path: `${OUT}/${tag}-${name}.png` });

  if (info.project.name === 'phone') {
    await boot(page);
    await page.getByTestId('home-app-broker').click();
    await expect(page.getByTestId('phone-app-broker')).toBeVisible({ timeout: 20_000 });
    await skipTips(page);
    await expect(page.getByTestId('price-chart').first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(800);
    await shot('chart');
    await page.getByTestId('bar-qty').fill('1000').catch(() => undefined);
    await page.waitForTimeout(400);
    await shot('bar-usd');
    await page.getByTestId('bar-review').click().catch(() => undefined);
    await expect(page.getByTestId('trade-sheet')).toBeVisible({ timeout: 10_000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    await shot('ticket-sheet');
    return;
  }

  await boot(page);
  await expect(page.getByTestId('broker-terminal')).toBeVisible({ timeout: 30_000 });
  await skipTips(page);
  await expect(page.getByTestId('order-qty')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(800);
  await shot('ticket');

  // dollar sizing: the size in $ converts to units at the estimate
  await page.getByTestId('unit-usd').click().catch(() => undefined);
  await page.getByTestId('order-qty').fill('1000');
  await page.waitForTimeout(400);
  await shot('ticket-usd');
  await page.getByTestId('watchlist').first().screenshot({ path: `${OUT}/${tag}-watchlist.png` }).catch(() => undefined);
  await page.getByTestId('price-chart').first().screenshot({ path: `${OUT}/${tag}-chart.png` }).catch(() => undefined);

  // a buy: the positions and the fill appear on the dock
  await page.getByTestId('unit-shares').click().catch(() => undefined);
  await page.getByTestId('order-qty').fill('2');
  await page.getByTestId('order-submit').click().catch(() => undefined);
  await page.getByTestId('order-confirm').click({ timeout: 4000 }).catch(() => undefined);
  await page.waitForTimeout(3500);
  await shot('after-buy');
  await page.getByTestId('broker-dock').first().screenshot({ path: `${OUT}/${tag}-dock.png` }).catch(() => undefined);

  // a crypto major and a memecoin: the size grid and the price precision (R-10-3, R-10-4); the search finds the ticker
  for (const ticker of ['AUC', 'FROG']) {
    await page.getByTestId('asset-search').first().fill(ticker).catch(() => undefined);
    await page.waitForTimeout(500);
    await page.getByText(ticker, { exact: true }).first().click({ timeout: 4000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    await shot(`${ticker.toLowerCase()}-ticket`);
    await page.getByTestId('watchlist').first().screenshot({ path: `${OUT}/${tag}-${ticker.toLowerCase()}-watchlist.png` }).catch(() => undefined);
    await page.getByTestId('price-chart').first().screenshot({ path: `${OUT}/${tag}-${ticker.toLowerCase()}-chart.png` }).catch(() => undefined);
  }
});
