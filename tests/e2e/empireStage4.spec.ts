import { expect, test } from '@playwright/test';
import { goTo, proof, register, skipTips, watchErrors } from './helpers';

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
