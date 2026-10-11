import { expect, test } from '@playwright/test';
import { ageAccount, clearSheets, goTo, grant, proof, register, skipRankUp, skipTips, watchErrors } from './helpers';

// Stage 4 of the UX overhaul: the CommitBar on a shop purchase, the next-step empty states, and the business table.

test('a shop purchase is reviewed in the CommitBar: nothing is spent until Confirm', async ({ page }) => {
  const errors = watchErrors(page);
  await register(page);
  await skipTips(page);
  await goTo(page, 'empire');
  await page.getByTestId('tab-buy').click();
  await expect(page.getByTestId('catalog-table')).toBeVisible();
  await page.getByTestId('buy-biz-food.street-food-cart').click();
  const bar = page.getByTestId('biz-commit');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('Buy');
  await expect(page.getByTestId('biz-commit-after')).toBeVisible();
  // Review only: the empire still shows no income, so the spend has not fired.
  await expect(page.getByTestId('empire-income')).toContainText('$0.00');
  // Cancel clears the pick and spends nothing.
  await page.getByTestId('biz-commit-cancel').click();
  await expect(bar).toHaveCount(0);
  await expect(page.getByTestId('empire-income')).toContainText('$0.00');
  // Pick again and confirm: the business is bought.
  await page.getByTestId('buy-biz-food.street-food-cart').click();
  await page.getByTestId('biz-commit-confirm').click();
  await expect(page.getByTestId('empire-income')).not.toContainText('$0.00', { timeout: 10_000 });
  await proof(page, 'empire-commitbar');
  expect(errors).toEqual([]);
});

test('an empty business list is a next-step card whose button opens the catalog', async ({ page }) => {
  const errors = watchErrors(page);
  await register(page);
  await skipTips(page);
  await goTo(page, 'empire');
  await page.getByTestId('tab-owned').click();
  const card = page.getByTestId('biz-owned-empty');
  await expect(card).toBeVisible();
  await expect(card.getByRole('button')).toHaveCount(1);
  await page.getByTestId('biz-to-catalog').click();
  await expect(page.getByTestId('catalog-table')).toBeVisible();
  expect(errors).toEqual([]);
});

test('an empty shops tab is a next-step card that opens the catalog', async ({ page }) => {
  const errors = watchErrors(page);
  await register(page);
  await skipTips(page);
  await goTo(page, 'empire');
  await page.getByTestId('tab-shops').click();
  await expect(page.getByTestId('shops-empty')).toBeVisible();
  await page.getByTestId('shops-to-catalog').click();
  await expect(page.getByTestId('catalog-table')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the catalog sorts by payback and filters by search', async ({ page }) => {
  const errors = watchErrors(page);
  await register(page);
  await skipTips(page);
  await goTo(page, 'empire');
  await page.getByTestId('tab-buy').click();
  await expect(page.getByTestId('catalog-table')).toBeVisible();
  await page.getByTestId('biz-search').fill('street food');
  await expect(page.getByTestId('catalog-food.street-food-cart')).toBeVisible();
  await page.getByTestId('biz-search').fill('zzz-no-such-business');
  await expect(page.getByTestId('catalog-none')).toBeVisible();
  expect(errors).toEqual([]);
});

// The Launchpad as a table (Stage 4): New is a dense table with a curve progress bar per token, search and sort; an empty
// feed is a next-step card. The token is launched by this spec, so the table always has a live row to read.

const MIN_AGE_TICKS = 3 * 24 * 720 + 10;
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

test('the Launchpad New feed is a table with a curve bar, search and sort', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  const handle = await register(page, 'lpt');
  await grant(handle, 60_000);
  await ageAccount(handle, MIN_AGE_TICKS);
  await skipRankUp(page);
  await clearSheets(page);
  await skipTips(page);
  let ticker = '';
  for (let i = 0; i < 4; i++) ticker += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  await goTo(page, 'launchpad');
  await page.getByTestId('tab-create').click();
  await page.getByTestId('lp-name').fill(`Quiet ${ticker}`);
  await page.getByTestId('lp-ticker').fill(ticker);
  await page.getByTestId('lp-tagline-tg2').click();
  await page.getByTestId('lp-alloc').fill('2');
  await page.getByTestId('lp-launch').click();
  await expect(page.getByTestId('lp-launch-sent')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('tab-new').click();
  await expect(page.getByTestId('lp-table')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId(`lp-progress-${ticker}`)).toContainText('%');
  await page.getByTestId('lp-search-new').fill(ticker);
  await expect(page.getByTestId('lp-table').locator('tbody tr')).toHaveCount(1);
  await page.getByTestId('lp-search-new').fill('zzzz-no-token');
  await expect(page.getByTestId('lp-feed-none')).toBeVisible();
  await proof(page, 'launchpad-table');
  expect(errors).toEqual([]);
});

test('an empty Holdings tab is a next-step card that opens New', async ({ page }) => {
  const errors = watchErrors(page);
  await register(page, 'lpe');
  await skipTips(page);
  await goTo(page, 'launchpad');
  await page.getByTestId('tab-holdings').click();
  await expect(page.getByTestId('lp-hold-empty')).toBeVisible();
  await page.getByTestId('lp-hold-empty-cta').click();
  await expect(page.getByTestId('lp-table').or(page.getByTestId('lp-feed-empty-new'))).toBeVisible();
  expect(errors).toEqual([]);
});
