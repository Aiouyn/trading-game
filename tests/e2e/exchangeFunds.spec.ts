import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ADMIN, WORLD, clearSheets, grant, noHorizontalOverflow, register, skipTips, watchErrors } from './helpers';

// The Exchange's player funds, end to end: a manager opens a fund (Operator rank, a 14 game day old account, a $250k
// stake), an investor (7 real days old) deposits, sees the holding, redeems (the early-exit notice shows), and is paid at
// the next day close. It advances the shared world past the account-age rules, so it runs with the time-advancing specs
// (playwright.config.ts, the close-card projects), after every other project.

const TPD = 720;
const REAL_DAY = 24 * TPD;

/** The rank-up sheet the grant can raise (R0 to R3 in one step): dismissed when it shows, a no-op when it does not. */
async function dismissRankUp(page: Page): Promise<void> {
  const skip = page.getByTestId('os-update-skip');
  await skip.click({ timeout: 8_000 }).catch(() => undefined);
}

/** Advances the world by `ticks`, in the admin route's chunks (at most 20,000 per call). */
async function advance(ticks: number): Promise<void> {
  let left = ticks;
  while (left > 0) {
    const n = Math.min(20_000, left);
    const r = await fetch(`${WORLD}/api/admin/advance?n=${n}`, { method: 'POST', headers: { authorization: `Bearer ${ADMIN}` } });
    expect(r.status).toBe(200);
    left -= n;
  }
}

test('a manager opens a fund; an investor deposits, sees the holding, redeems and is paid', async ({ page, browser }) => {
  test.setTimeout(420_000);
  const errors = watchErrors(page);

  // the investor registers first: their account must be 7 real days old before it can invest in a fund
  const invPage = await browser.newPage({ locale: 'en-US', viewport: { width: 1440, height: 900 } });
  const invErrors = watchErrors(invPage);
  const inv = await register(invPage, 'exi');
  const mgr = await register(page, 'exm');
  await grant(mgr, 6_000_000);
  await grant(inv, 1_000_000);
  await advance(7 * REAL_DAY + 1);

  // the manager opens the fund: the stake is the default ($250k), the fee and the mandate are the defaults
  await page.goto('/exchange');
  await expect(page.getByTestId('exchange-view')).toBeVisible({ timeout: 30_000 });
  await dismissRankUp(page);
  await clearSheets(page);
  await skipTips(page);
  await noHorizontalOverflow(page);
  await page.getByTestId('tab-manage').click();
  await expect(page.getByTestId('exchange-open-fund')).toBeVisible();
  await expect(page.getByTestId('exchange-open-submit')).toBeDisabled();
  await page.getByTestId('exchange-open-name').fill('Harbour Test Fund');
  await expect(page.getByTestId('exchange-open-submit')).toBeEnabled();
  await page.getByTestId('exchange-open-submit').click();
  await expect(page.getByTestId('exchange-console')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('exchange-console-name')).toHaveText('Harbour Test Fund');
  await expect(page.getByTestId('exchange-stat-stake')).toContainText('250,000.00');
  await expect(page.getByTestId('exchange-trade')).toBeVisible();
  await expect(page.getByTestId('exchange-mandate')).toBeVisible();
  await noHorizontalOverflow(page);

  // the investor sees the fund on the Funds tab and deposits $50,000
  await invPage.goto('/exchange');
  await expect(invPage.getByTestId('exchange-view')).toBeVisible({ timeout: 30_000 });
  await clearSheets(invPage);
  await skipTips(invPage);
  await invPage.getByTestId('tab-funds').click();
  await expect(invPage.getByTestId(/^exchange-fund-name-/).first()).toHaveText('Harbour Test Fund');
  await invPage.getByTestId(/^exchange-fund-card-/).first().click();
  await invPage.getByTestId('exchange-invest-amount').fill('50000');
  await invPage.getByTestId('exchange-invest').click();
  await expect(invPage.getByTestId('exchange-invest-sent')).toBeVisible({ timeout: 20_000 });

  // the deposit settles at the next day close: after two game days the investor holds units at NAV
  await advance(2 * TPD);
  await invPage.getByTestId('tab-mine').click();
  await expect(invPage.getByTestId('exchange-holdings')).toBeVisible();
  await expect(invPage.getByTestId(/^exchange-holding-value-/).first()).toContainText(/\$(49|50),\d{3}\.\d{2}/);
  await noHorizontalOverflow(invPage);

  // a redemption right after the deposit pays the early-exit fee, and the notice says so before the investor sends it
  await invPage.getByTestId('tab-funds').click();
  await invPage.getByTestId('exchange-redeem-units').fill('20000');
  await expect(invPage.getByTestId('exchange-early-exit')).toBeVisible();
  await invPage.getByTestId('exchange-redeem').click();
  await expect(invPage.getByTestId('exchange-redeem-sent')).toBeVisible({ timeout: 20_000 });

  // the redemption pays at the next day close: the holding falls to the units left
  await advance(2 * TPD);
  await invPage.getByTestId('tab-mine').click();
  await expect(invPage.getByTestId(/^exchange-holding-value-/).first()).toContainText(/\$(29|30),\d{3}\.\d{2}/);

  // the manager's console shows the fund as it now stands
  await page.goto('/exchange');
  await expect(page.getByTestId('exchange-view')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('tab-manage').click();
  await expect(page.getByTestId('exchange-console')).toBeVisible();
  await expect(page.getByTestId('exchange-stat-stake')).toBeVisible();

  // the manager trades through the fund's own account from the Broker: the selector shows only to a manager, and the
  // ticket's fund mode sends the trade through the fund (the selected ticker's first unit, a market buy)
  await page.goto('/broker?e2e&intro=off');
  await clearSheets(page);
  await skipTips(page);
  await expect(page.getByTestId('order-account')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('account-fund').click();
  await expect(page.getByTestId('account-fund-note')).toBeVisible();
  await page.getByTestId('order-qty').fill('1');
  await page.getByTestId('order-submit').click();
  await expect(page.getByTestId('order-fund-refusal')).toHaveCount(0);
  await expect(page.getByTestId('order-qty')).toHaveValue('', { timeout: 20_000 });
  await noHorizontalOverflow(page);

  expect(errors).toEqual([]);
  expect(invErrors).toEqual([]);
  await invPage.close();
});
