import { expect, test } from '@playwright/test';
import { goTo, grant, isPhone, noHorizontalOverflow, register, skipRankUp, skipTips, watchErrors } from './helpers';

// The Company app's operations half (Velvet 2 to 5, C4): founding, products and demand, R&D, people and deals, and the
// "What the market sees" side. Every refusal is shown inline with its code.

async function foundCompany(page: import('@playwright/test').Page, name: string): Promise<void> {
  await expect(page.getByTestId('company-found')).toBeVisible();
  await page.getByTestId('company-name').fill(name);
  await page.getByTestId('company-found-submit').click();
  await expect(page.getByTestId('company-overview')).toBeVisible();
}

test('a founder at Owner founds a company, sees the starting numbers, and the market side hides every private field', async ({ page }) => {
  const errors = watchErrors(page);
  const handle = await register(page);
  await skipTips(page);
  await grant(handle, 8_000_000);
  await skipRankUp(page);
  await goTo(page, 'company');
  await foundCompany(page, 'Lantern Roasting Co.');
  await expect(page.getByTestId('company-kpi-cash')).toContainText('150,000');
  await expect(page.getByTestId('company-goals')).toBeVisible();
  await expect(page.getByTestId('company-goal-firstHire')).toBeVisible();
  if (isPhone(page)) await noHorizontalOverflow(page);

  // the market toggle renders only public fields: no private chip, no cash card, no runway
  await page.getByTestId('company-view-market').click();
  await expect(page.getByTestId('company-market')).toBeVisible();
  await expect(page.getByTestId('priv-chip')).toHaveCount(0);
  await expect(page.getByTestId('company-kpi-cash')).toHaveCount(0);
  await expect(page.getByTestId('company')).not.toContainText('Payroll runway');
  await expect(page.getByTestId('company-market')).toContainText('Lantern Roasting Co.');
  await page.getByTestId('company-view-founder').click();
  await expect(page.getByTestId('company-overview')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a price outside the band is refused inline with its code, and a price inside it is set', async ({ page }) => {
  const handle = await register(page);
  await skipTips(page);
  await grant(handle, 8_000_000);
  await skipRankUp(page);
  await goTo(page, 'company');
  await foundCompany(page, 'Band Test Co.');
  await page.getByTestId('company-tab-products').click();
  const price = page.locator('input[data-testid^="company-price-"]:not([data-testid^="company-price-set-"])').first();
  await price.fill('1000');
  await page.locator('button[data-testid^="company-price-set-"]').first().click();
  await expect(page.getByTestId('company-refusal')).toHaveAttribute('data-code', 'priceOutOfBand');
  await price.fill('55');
  await page.locator('button[data-testid^="company-price-set-"]').first().click();
  await expect(page.getByTestId('company-refusal')).toHaveCount(0);
});

test('R&D starts one project; a second is refused as busy; hiring past the cap is refused', async ({ page }) => {
  const handle = await register(page);
  await skipTips(page);
  await grant(handle, 8_000_000);
  await skipRankUp(page);
  await goTo(page, 'company');
  await foundCompany(page, 'Project Co.');
  await page.getByTestId('company-tab-rd').click();
  await page.getByTestId('company-rd-spend').fill('50000');
  await page.getByTestId('company-rd-submit').click();
  await expect(page.locator('[data-testid^="company-project-"]').first()).toBeVisible();
  await expect(page.getByTestId('company-project-odds').first()).toContainText('%');
  await expect(page.getByTestId('company-rd-submit')).toBeDisabled();

  await page.getByTestId('company-tab-people').click();
  await expect(page.getByTestId('company-headcount-cap')).toContainText('25');
  await page.getByTestId('company-staff-count').fill('100');
  await page.getByTestId('company-hire').click();
  await expect(page.getByTestId('company-refusal')).toHaveAttribute('data-code', 'headcountCap');
});

test('the deals tab refuses a franchise rate outside 4 to 8 percent', async ({ page }) => {
  const handle = await register(page);
  await skipTips(page);
  await grant(handle, 8_000_000);
  await skipRankUp(page);
  await goTo(page, 'company');
  await foundCompany(page, 'Deals Co.');
  await page.getByTestId('company-tab-deals').click();
  await expect(page.getByTestId('company-franchise')).toBeVisible();
  await page.getByTestId('company-licence-rate').fill('12');
  await page.getByTestId('company-licence-grant').click();
  await expect(page.getByTestId('company-refusal')).toHaveAttribute('data-code', 'franchiseRate');
});
