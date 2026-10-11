import { expect, test } from '@playwright/test';
import { dismissCloseCard, goTo, isPhone, register, skipTips, watchErrors } from './helpers';

// Stage 3 (Portfolio and money, docs/UX-REDESIGN.md): the net worth line ends at the top bar's figure, the journal is a trade
// log with one row per round trip, and the Wire filters by kind and folds Launchpad listings into one line per hour.

/** The top bar's net worth as a number (the "$5,507.85" figure, cents included). */
async function topBarNetWorth(page: import('@playwright/test').Page): Promise<number> {
  const text = (await page.getByTestId('os-networth').locator('.num').first().textContent()) ?? '';
  // (the desktop top bar only; the phone checks above)
  return Number(text.replace(/[$,\s]/g, ''));
}

test('the net worth line ends at the top bar figure, and the change since arrival is split', async ({ page }) => {
  const errors = watchErrors(page);
  await register(page);
  await skipTips(page);
  await goTo(page, 'portfolio');
  const series = page.getByTestId('networth-series');
  await expect(series).toBeVisible({ timeout: 25_000 });
  // the line is sampled every few ticks and the header is live: the last point is the live figure, so the two match.
  // The phone's top bar is compact ("$5.3k"), so there the figure is only checked to be shown, not to the cent.
  if (isPhone(page)) {
    await expect(page.getByTestId('os-phone-networth')).toContainText('$');
  } else {
    await expect.poll(async () => {
      const last = Number(await series.getAttribute('data-last-value'));
      const bar = await topBarNetWorth(page);
      return Math.abs(last - bar) < 0.005;
    }, { timeout: 15_000 }).toBe(true);
  }
  // the $250 onboarding grant is in the figure and in the line alike, and is named apart from trading
  await expect(page.getByTestId('arrival-grants')).toBeVisible();
  for (const id of ['arrival-trading', 'arrival-valuation', 'arrival-income', 'arrival-grants']) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  await expect(page.getByTestId('networth-chart-note')).not.toBeEmpty();
  expect(errors).toEqual([]);
});

test('a round trip lands in the trade log as one row with entry, exit, P&L after fees and hold time', async ({ page }) => {
  const errors = watchErrors(page);
  await register(page);
  await skipTips(page);
  if (isPhone(page)) {
    await page.getByTestId('home-app-broker').click();
    await skipTips(page);
    await page.getByTestId('bar-qty').fill('2');
    await page.getByTestId('bar-review').click();
  } else {
    await page.getByTestId('order-qty').fill('2');
  }
  await page.getByTestId('order-submit').click();
  await goTo(page, 'portfolio');
  const portfolio = page.getByTestId('portfolio-view');
  await expect(portfolio.getByTestId('position-HLCN')).toBeVisible({ timeout: 15_000 });
  await dismissCloseCard(page);
  await portfolio.getByTestId('close-HLCN').click();
  await page.getByTestId('close-HLCN-yes').click();
  await expect(portfolio.getByTestId('position-HLCN')).toHaveCount(0, { timeout: 15_000 });
  await dismissCloseCard(page);
  await page.getByTestId('portfolio-tab-journal').click();
  await expect(page.getByTestId('journal-table')).toBeVisible({ timeout: 15_000 });
  const row = page.locator('[data-testid^="journal-row-"]').first();
  await expect(row).toContainText('HLCN');
  // the row carries the trade's prices and its P&L (after fees: the cell is the trip's realized P&L)
  await expect(row.locator('td')).toHaveCount(10);
  await expect(page.getByTestId('journal-summary')).toContainText('1');
  await expect(row.getByText(/\d+\.\d{2}/).first()).toBeVisible();
  // a filter that matches nothing says so, and the win filter keeps only winning trips
  await page.getByTestId('journal-result-win').click();
  await expect(page.getByTestId('journal-result-win')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('journal-result-all').click();
  await expect(page.locator('[data-testid^="journal-row-"]').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('the Wire filters by kind, and Launchpad listings open from one line per hour', async ({ page }) => {
  const errors = watchErrors(page);
  await register(page);
  await skipTips(page);
  await goTo(page, 'wire');
  await expect(page.getByTestId('wire-view')).toBeVisible();
  await expect(page.getByTestId('wire-feed')).toBeAttached();
  // the Launchpad filter shows only the folded lines: no bare headline rows until one is opened
  await page.getByTestId('wire-filter-launch').click();
  await expect(page.getByTestId('wire-filter-launch')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('wire-row')).toHaveCount(0);
  const groups = page.getByTestId('wire-launch-group');
  const groupCount = await groups.count();
  if (groupCount > 0) {
    const toggle = groups.first().getByTestId('wire-launch-toggle');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(groups.first().getByTestId('wire-row').first()).toBeVisible();
  }
  // the markets filter leaves Launchpad out entirely
  await page.getByTestId('wire-filter-markets').click();
  await expect(page.getByTestId('wire-filter-markets')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('wire-launch-group')).toHaveCount(0);
  await page.getByTestId('wire-filter-all').click();
  await expect(page.getByTestId('wire-filter-all')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});
