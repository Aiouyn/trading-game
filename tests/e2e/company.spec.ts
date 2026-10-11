import { expect, test, type Page } from '@playwright/test';
import { goTo, grant, isPhone, noHorizontalOverflow, register, skipRankUp, skipTips, watchErrors } from './helpers';

// The Company app's operations half (Velvet 2 to 5, C4): founding, the overview's decision card and runway chart,
// products and demand, R&D (pharma gates and patents), people (the G&A span, executives and their severance), deals
// (licences and supply) and the "What the market sees" side. Every refusal is shown inline with its code.

async function playerAtOwner(page: Page): Promise<string> {
  const handle = await register(page);
  await skipTips(page);
  await grant(handle, 8_000_000);
  await skipRankUp(page);
  // the desk's Trade workspace opens an app as a side panel (UX stage 2); the Company app is checked in News, where it is a half
  if (!isPhone(page)) await page.getByTestId('ws-1').click();
  await goTo(page, 'company');
  return handle;
}

async function foundCompany(page: Page, name: string, sector?: string): Promise<void> {
  await expect(page.getByTestId('company-found')).toBeVisible();
  await page.getByTestId('company-name').fill(name);
  if (sector) await page.getByTestId('company-sector').selectOption(sector);
  await page.getByTestId('company-found-submit').click();
  await expect(page.getByTestId('company-overview')).toBeVisible();
}

test('a founder at Owner founds a company, sees the starting numbers, and the market side hides every private field', async ({ page }) => {
  const errors = watchErrors(page);
  await playerAtOwner(page);
  await foundCompany(page, 'Lantern Roasting Co.');
  await expect(page.getByTestId('company-kpi-cash')).toContainText('150,000');
  await expect(page.getByTestId('company-goals')).toBeVisible();
  await expect(page.getByTestId('company-goal-firstHire')).toBeVisible();
  await expect(page.getByTestId('company-decision')).toBeVisible();
  await expect(page.getByTestId('company-runway-svg')).toBeVisible();
  if (isPhone(page)) await noHorizontalOverflow(page);

  // the market toggle renders only public fields: no private chip, no cash card, no runway
  await page.getByTestId('company-view-market').click();
  await expect(page.getByTestId('company-market')).toBeVisible();
  await expect(page.getByTestId('priv-chip')).toHaveCount(0);
  await expect(page.getByTestId('company-kpi-cash')).toHaveCount(0);
  await expect(page.getByTestId('company-decision')).toHaveCount(0);
  await expect(page.getByTestId('company')).not.toContainText('Payroll runway');
  await expect(page.getByTestId('company-market')).toContainText('Lantern Roasting Co.');
  await expect(page.getByTestId('company-market-registry')).toBeVisible();
  await page.getByTestId('company-view-founder').click();
  await expect(page.getByTestId('company-overview')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a price outside the band is refused inline with its code, and a price inside it is set', async ({ page }) => {
  await playerAtOwner(page);
  await foundCompany(page, 'Band Test Co.');
  await page.getByTestId('company-tab-products').click();
  await expect(page.getByTestId('company-competitors')).toContainText('$');
  await expect(page.getByTestId('company-rivals-note')).toBeVisible();
  const price = page.locator('input[data-testid^="company-price-"]:not([data-testid^="company-price-set-"])').first();
  await price.fill('1000');
  await page.locator('button[data-testid^="company-price-set-"]').first().click();
  await expect(page.getByTestId('company-refusal')).toHaveAttribute('data-code', 'priceOutOfBand');
  await price.fill('55');
  await page.locator('button[data-testid^="company-price-set-"]').first().click();
  await expect(page.getByTestId('company-refusal')).toHaveCount(0);
});

test('a second R&D project is refused as busy on both the R&D tab and the overview (the overview stages, and refuses at once)', async ({ page }) => {
  await playerAtOwner(page);
  await foundCompany(page, 'Project Co.');
  // the R&D tab starts a project at once
  await page.getByTestId('company-tab-rd').click();
  await page.getByTestId('company-rd-spend').fill('50000');
  await page.getByTestId('company-rd-submit').click();
  await expect(page.getByTestId('company-rd-projects').locator('li').first()).toBeVisible();
  await expect(page.getByTestId('company-project-odds').first()).toContainText('%');
  // the R&D tab's own form sends the second start, and the engine refuses it
  await page.getByTestId('company-rd-spend').fill('50000');
  await page.getByTestId('company-rd-submit').click();
  await expect(page.getByTestId('company-refusal')).toHaveAttribute('data-code', 'projectBusy');
  // the overview's decision card is refused the same way at once: nothing is staged
  await page.getByTestId('company-tab-overview').click();
  await page.getByTestId('company-decision-confirm').click();
  await expect(page.getByTestId('company-refusal')).toHaveAttribute('data-code', 'projectBusy');
  await expect(page.getByTestId('company-decision-staged')).toHaveCount(0);
});

test('an Overview decision is staged for the close: it shows what applies and when, and can be cancelled before the close', async ({ page }) => {
  await playerAtOwner(page);
  await foundCompany(page, 'Stage Co.');
  await expect(page.getByTestId('company-decision-was')).toContainText('Nothing in force yet');
  await page.getByTestId('company-decision-level-high').click();
  await page.getByTestId('company-decision-confirm').click();
  await expect(page.getByTestId('company-decision-staged')).toContainText('Staged for the close');
  await expect(page.getByTestId('company-decision-applies')).toContainText('Applies at the close of Day');
  // nothing has started yet: the R&D tab has no project
  await page.getByTestId('company-tab-rd').click();
  await expect(page.getByTestId('company-rd-projects').locator('li')).toHaveCount(0);
  await page.getByTestId('company-tab-overview').click();
  await page.getByTestId('company-decision-cancel').click();
  await expect(page.getByTestId('company-decision-staged')).toHaveCount(0);
  if (isPhone(page)) await noHorizontalOverflow(page);
});

test('the next-gen launch waits on R&D with no credit, the Filings tab shows the next filing day, and the CEO change shows its days before it is announced', async ({ page }) => {
  const errors = watchErrors(page);
  await playerAtOwner(page);
  await foundCompany(page, 'Next Co.');
  await page.getByTestId('company-tab-rd').click();
  await expect(page.getByTestId('company-launch-none')).toBeVisible();
  await page.getByTestId('company-tab-filings').click();
  // a Seed company files no quarter: no next filing day, the registry line instead
  await expect(page.getByTestId('company-filings-next')).toHaveCount(0);
  await expect(page.getByTestId('company-filings-registry')).toBeVisible();
  await expect(page.getByTestId('company-filings-none')).toBeVisible();
  await page.getByTestId('company-tab-people').click();
  await expect(page.getByTestId('company-ceo-announce')).toContainText('Announced today');
  await expect(page.getByTestId('company-ceo-freeze')).toBeVisible();
  await expect(page.getByTestId('company-ceo-cooling')).toContainText('252');
  await page.getByTestId('company-ceo-submit').click();
  await page.getByTestId('company-ceo-submit-yes').click();
  await expect(page.getByTestId('company-refusal')).toHaveCount(0);
  // once announced, the recorded days and the pending state show, and no second confirm is offered
  await expect(page.getByTestId('company-ceo-pending')).toBeVisible();
  await expect(page.getByTestId('company-ceo-announce')).toContainText('Announced on Day');
  await expect(page.getByTestId('company-ceo-submit')).toHaveCount(0);
  if (isPhone(page)) await noHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test('a pharma company shows the odds of its three gates, and the patents in force', async ({ page }) => {
  await playerAtOwner(page);
  await foundCompany(page, 'Pharma Co.', 'health');
  await page.getByTestId('company-tab-rd').click();
  await page.getByTestId('company-rd-spend').fill('50000');
  await page.getByTestId('company-rd-submit').click();
  await expect(page.getByTestId('company-project-gates')).toBeVisible();
  await expect(page.getByTestId('company-project-gate')).toHaveCount(3);
  await expect(page.getByTestId('company-patents')).toContainText('No patent');
});

test('the people tab shows the G&A span, names the severance of an executive before a firing, and refuses it before the term ends', async ({ page }) => {
  await playerAtOwner(page);
  await foundCompany(page, 'People Co.');
  await page.getByTestId('company-tab-people').click();
  await expect(page.getByTestId('company-headcount-cap')).toContainText('25');
  await expect(page.getByTestId('company-ga-span')).toContainText('12');
  await page.getByTestId('company-exec-holder-CFO').selectOption('npc');
  await page.getByTestId('company-exec-hire-CFO').click();
  await expect(page.getByTestId('company-exec-severance-CFO')).toContainText('6,300');
  await page.getByTestId('company-exec-fire-CFO').click();
  await expect(page.getByTestId('company-exec-fire-CFO-yes')).toBeVisible();
  await page.getByTestId('company-exec-fire-CFO-yes').click();
  await expect(page.getByTestId('company-refusal')).toHaveAttribute('data-code', 'execTerm');
  await expect(page.getByTestId('company-exec-severance-CFO')).toBeVisible();
  await page.getByTestId('company-staff-count').fill('100');
  await page.getByTestId('company-hire').click();
  await expect(page.getByTestId('company-staff').getByTestId('company-refusal')).toHaveAttribute('data-code', 'headcountCap');
});

test('the deals tab grants a licence inside the band, refuses one outside it, and shows the capital placeholder', async ({ page }) => {
  await playerAtOwner(page);
  await foundCompany(page, 'Deals Co.');
  await page.getByTestId('company-tab-deals').click();
  await expect(page.getByTestId('company-franchise')).toBeVisible();
  await page.getByTestId('company-licence-rate').fill('12');
  await page.getByTestId('company-licence-grant').click();
  await expect(page.getByTestId('company-refusal')).toHaveAttribute('data-code', 'franchiseRate');
  await page.getByTestId('company-licence-rate').fill('6');
  await page.getByTestId('company-licence-grant').click();
  await expect(page.getByTestId('company-refusal')).toHaveCount(0);
  await expect(page.getByTestId('company-licences').locator('li')).toHaveCount(1);
  await page.getByTestId('company-tab-capital').click();
  await expect(page.getByTestId('company-capital')).toBeVisible();
});

test('a founder signs a supply deal with another player\'s company at the market price', async ({ page, browser }) => {
  // a second player founds the seller company in its own browser context
  const sellerContext = await browser.newContext();
  const seller = await sellerContext.newPage();
  try {
    const sellerHandle = await register(seller, 'seller');
    await skipTips(seller);
    await grant(sellerHandle, 8_000_000);
    await skipRankUp(seller);
    await goTo(seller, 'company');
    await foundCompany(seller, 'Seller Co.');

    await playerAtOwner(page);
    await foundCompany(page, 'Buyer Co.');
    await page.getByTestId('company-tab-deals').click();
    await expect(page.getByTestId('company-supply')).toBeVisible();
    await page.getByTestId('company-supply-seller').selectOption({ label: 'Seller Co.' });
    await page.getByTestId('company-supply-units').fill('10');
    await page.getByTestId('company-supply-price').fill('50');
    await page.getByTestId('company-supply-sign').click();
    await expect(page.getByTestId('company-supply-deals')).toContainText('Seller Co.');
    await expect(page.getByTestId('company-refusal')).toHaveCount(0);
  } finally {
    await sellerContext.close();
  }
});
