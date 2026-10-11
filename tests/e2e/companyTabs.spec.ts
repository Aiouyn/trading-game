import { expect, test, type Page } from '@playwright/test';
import { goTo, grant, isPhone, noHorizontalOverflow, proof, register, skipRankUp, skipTips, watchErrors } from './helpers';

// Stage 4 (audit item 8): drive the found-a-company flow end to end and visit every Company tab, so each tab is
// reached and shot. The audit could not reach these tabs; this spec is the proof that they open and render.

const VIEWS = ['overview', 'products', 'rd', 'people', 'deals', 'capital', 'filings', 'public'] as const;

async function founder(page: Page, name: string): Promise<void> {
  const handle = await register(page, 'cotab');
  await skipTips(page);
  await grant(handle, 8_000_000);
  await skipRankUp(page);
  await goTo(page, 'company');
  await expect(page.getByTestId('company-found')).toBeVisible();
  await page.getByTestId('company-name').fill(name);
  await page.getByTestId('company-found-submit').click();
  await page.getByTestId('company-found-submit-review-confirm').click();
  await expect(page.getByTestId('company-overview')).toBeVisible({ timeout: 20_000 });
}

test('the found-a-company flow opens a company, and every Company tab renders and is shot', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await founder(page, 'Tab Tour Co.');
  for (const v of VIEWS) {
    await page.getByTestId(`company-tab-${v}`).click();
    // a blank tab would show no text beyond the rail and the name
    await expect.poll(async () => (await page.locator('body').innerText()).length).toBeGreaterThan(300);
    await noHorizontalOverflow(page);
    await proof(page, `company-${v}`);
  }
  expect(errors).toEqual([]);
});

test('the found-a-company flow shows the founding numbers and the overview decision card', async ({ page }) => {
  const errors = watchErrors(page);
  await founder(page, 'Found Test Co.');
  await expect(page.getByTestId('company-hero-name')).toContainText('Found Test Co.');
  await expect(page.getByTestId('company-kpi-cash')).toContainText('150,000');
  // the hero is a title-size name now, not the serif hero (Stage 4: the window title names the app)
  const size = await page.getByTestId('company-hero-name').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeLessThan(40);
  if (!isPhone(page)) await expect(page.getByTestId('company-rail')).toBeVisible();
  expect(errors).toEqual([]);
});
