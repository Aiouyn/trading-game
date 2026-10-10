import { expect, test } from '@playwright/test';
import { advanceWorld, ageAccount, clearSheets, goTo, grant, makeIpoReady, noHorizontalOverflow, register, skipRankUp, skipTips, watchErrors } from './helpers';

// The IPO path, end to end (Velvet exchange, DECISIONS section 2): a founder at Operator rank founds a company and asks for
// an IPO on the Company app's Capital tab. The book opens; an investor (7 game days old, not in the owner's set) subscribes
// on the Exchange's IPO tab; a subscription above the 5% cap is refused in the form before it is sent; the allocation
// lands in the investor's account when the book lists the next game day, and the company appears in the Stocks tab.
// The filed history the IPO rules read (three quarters, the minimum value) is set by the admin seam makeIpoReady: a
// company cannot be grown to that in a test run. The request, the book, the allocation and the listing are the world's own.
// The listing advances the shared world by a game day, so the spec runs in the close-card projects (playwright.config.ts).

const TPD = 720;
const REAL_DAY = 24 * TPD;

test('a founder opens an IPO book, an investor subscribes within the cap, and the stock lists with the allocation', async ({ page, browser }) => {
  test.setTimeout(420_000);
  const errors = watchErrors(page);

  // the investor registers first, and is aged past the 7-game-day rule for IPO buyers
  const invPage = await browser.newPage({ locale: 'en-US', viewport: { width: 1440, height: 900 } });
  const invErrors = watchErrors(invPage);
  const investor = await register(invPage, 'exii');
  const founder = await register(page, 'exif');
  // the name carries the founder's handle: the desktop and phone runs share one world, and each run lists its own company
  const companyName = `Harbour ${founder}`;
  const exact = new RegExp(`^${companyName}$`);
  await grant(founder, 6_000_000);
  await grant(investor, 1_000_000);
  await ageAccount(investor, 7 * REAL_DAY + 1);

  // the founder founds the company, then the filed history is set and the Capital tab requests the IPO
  await skipRankUp(page);
  await clearSheets(page);
  await skipTips(page);
  await goTo(page, 'company');
  await expect(page.getByTestId('company-found')).toBeVisible();
  await page.getByTestId('company-name').fill(companyName);
  await page.getByTestId('company-found-submit').click();
  await expect(page.getByTestId('company-overview')).toBeVisible();
  await makeIpoReady(founder);
  await page.getByTestId('company-tab-capital').click();
  await expect(page.getByTestId('company-ipo-request')).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId('company-ipo-request').click();
  await expect(page.getByTestId('company-ipo-book')).toBeVisible({ timeout: 20_000 });
  await noHorizontalOverflow(page);

  // the investor sees the open book: the price, the float and the cap, and their own room under the cap
  await invPage.goto('/exchange');
  await expect(invPage.getByTestId('exchange-view')).toBeVisible({ timeout: 30_000 });
  await clearSheets(invPage);
  await skipTips(invPage);
  await invPage.getByTestId('tab-ipos').click();
  await expect(invPage.getByTestId('exchange-ipos')).toBeVisible();
  const card = invPage.getByTestId(/^exchange-ipo-name-/).filter({ hasText: exact });
  await expect(card).toHaveCount(1);
  const nameId = await card.getAttribute('data-testid');
  const id = nameId!.replace('exchange-ipo-name-', '');
  await expect(invPage.getByTestId(`exchange-ipo-cap-${id}`)).toBeVisible();
  await expect(invPage.getByTestId(`exchange-ipo-mine-${id}`)).toContainText('0');
  await expect(invPage.getByTestId(`exchange-ipo-subscribe-${id}`)).toBeDisabled();

  // an order above the room under the cap is refused in the form (three parts) and never sent
  await invPage.getByTestId(`exchange-ipo-shares-${id}`).fill('999999999');
  await expect(invPage.getByTestId(`exchange-ipo-overcap-${id}`)).toBeVisible();
  await expect(invPage.getByTestId(`exchange-ipo-subscribe-${id}`)).toBeDisabled();

  // a subscription within the cap is sent, and the form shows it as the viewer's own order
  await invPage.getByTestId(`exchange-ipo-shares-${id}`).fill('1000');
  await expect(invPage.getByTestId(`exchange-ipo-overcap-${id}`)).toHaveCount(0);
  await invPage.getByTestId(`exchange-ipo-subscribe-${id}`).click();
  await expect(invPage.getByTestId(`exchange-ipo-sent-${id}`)).toBeVisible({ timeout: 20_000 });
  await expect(invPage.getByTestId(`exchange-ipo-mine-${id}`)).toContainText('1,000');
  await noHorizontalOverflow(invPage);

  // the book lists the next game day: the investor holds the allocation, and the company is in the Stocks tab
  await advanceWorld(2 * TPD);
  await clearSheets(invPage);
  await invPage.getByTestId('tab-stocks').click();
  await expect(invPage.getByTestId(/^exchange-stock-name-/).filter({ hasText: exact })).toHaveCount(1, { timeout: 20_000 });
  const listed = await invPage.evaluate((name) => {
    const s = window.__tg!.state().me?.exchange?.stocks.find((x) => x.name === name);
    return s ? { ticker: s.ticker, held: window.__tg!.state().me?.account?.positions[s.ticker]?.qty ?? 0 } : null;
  }, companyName);
  expect(listed).not.toBeNull();
  expect(listed!.held).toBeGreaterThanOrEqual(1000);
  await invPage.getByTestId('tab-ipos').click();
  await expect(invPage.getByTestId(`exchange-ipo-${id}`)).toHaveCount(0, { timeout: 20_000 });
  await noHorizontalOverflow(invPage);

  // the founder's Capital tab shows the listing: the lockup on the founder's shares
  await clearSheets(page);
  await page.getByTestId('company-tab-capital').click();
  await expect(page.getByTestId('company-ipo-lockup')).toBeVisible({ timeout: 20_000 });

  expect(errors).toEqual([]);
  expect(invErrors).toEqual([]);
  await invPage.close();
});
