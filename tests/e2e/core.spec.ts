import { expect, test } from '@playwright/test';
import { goTo, isPhone, noHorizontalOverflow, proof, register, skipTips, watchErrors } from './helpers';

test('cold open renders with the design system applied', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page.getByTestId('onboarding-coldopen')).toBeVisible();
  await expect(page.getByText('Rent due Friday.')).toBeVisible();
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(11, 13, 16)'); // ink-0: Tailwind and the tokens are compiled
  await noHorizontalOverflow(page);
  await proof(page, 'coldopen');
  expect(errors).toEqual([]);
});

test('core loop: join, first trade capped at 20%, fill, and everything survives a reload', async ({ page }) => {
  const errors = watchErrors(page);
  await register(page);
  await expect(page.getByTestId('net-worth')).toContainText('$5,250');
  if (isPhone(page)) await page.getByTestId('open-trade').click();
  await expect(page.getByTestId('first-trade-cap')).toBeVisible();
  await page.getByTestId('order-qty').fill('20');
  await expect(page.getByTestId('order-invalid')).toContainText('20%');
  await expect(page.getByTestId('order-submit')).toBeDisabled();
  await page.getByTestId('order-qty').fill('2');
  await page.getByTestId('order-submit').click();
  // 1-second ticks in e2e: the market order fills on the next tick
  await expect(page.getByTestId('position-HLCN')).toBeVisible({ timeout: 10_000 });
  await skipTips(page);
  await proof(page, 'after-fill');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-game', 'ready', { timeout: 30_000 });
  await expect(page.getByTestId('position-HLCN')).toBeVisible();
  await noHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test('a business earns: buy a street food cart and see it in the empire', async ({ page }) => {
  const errors = watchErrors(page);
  await register(page);
  await goTo(page, 'empire');
  await page.getByTestId('tab-buy').click();
  await page.getByTestId('buy-biz-food.street-food-cart').click();
  await expect(page.getByTestId('empire-income')).not.toContainText('$0.00', { timeout: 10_000 });
  await proof(page, 'empire');
  expect(errors).toEqual([]);
});
