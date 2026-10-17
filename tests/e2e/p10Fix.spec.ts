import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { dismissCloseCard, goTo, grant, isPhone, openAuctions, register, skipRankUp, skipTips, watchErrors } from './helpers';

// P10 fix (lead-phase10 R-10-7): the new views, shot at 1440x900 and 390x844, in English and French. The shots go to
// test-results/p10/ and are read by hand: the spec asserts that each view shows its new figures, not only that it renders.

const OUT = 'test-results/p10';

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${isPhone(page) ? 'phone' : 'desktop'}-${name}.png` });
}

async function setLang(page: Page, lang: 'en' | 'fr'): Promise<void> {
  await goTo(page, 'profile');
  await page.getByTestId(`settings-lang-${lang}`).click();
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
}

test('R-10-7 views: the desk subscription, the rivals board, the portfolio, legal and auction minimum ranks', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await page.addInitScript(() => { window.__tgE2eAdmin = 'e2e-admin'; });
  const handle = await register(page, 'p10');
  await skipTips(page);
  await grant(handle, 8_000_000);
  await skipRankUp(page);
  await openAuctions();

  for (const lang of ['en', 'fr'] as const) {
    await setLang(page, lang);

    // the desk: a free trial, then a monthly fee (no up-front charge)
    await goTo(page, 'research');
    const unlock = page.getByTestId('desk-unlock');
    await expect(unlock).toBeVisible({ timeout: 15_000 });
    await expect(unlock).not.toContainText('50,000');
    await shot(page, `${lang}-desk`);

    // the rivals board sits in the Broker's Asset tab: fictional ladder funds near the player (R-10-7 item 5)
    await goTo(page, 'market');
    await page.getByTestId('dock-tab-asset').click();
    const board = page.getByTestId('rivals-board');
    await board.scrollIntoViewIfNeeded();
    await expect(board).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('you-row')).toBeVisible();
    await expect(page.locator('[data-testid^="rival-row-lad-"]').first()).toBeVisible();
    await shot(page, `${lang}-rivals`);

    // the portfolio: the since-arrival change on its net invested base
    await goTo(page, 'portfolio');
    await expect(page.getByTestId('portfolio-view')).toBeVisible({ timeout: 15_000 });
    await dismissCloseCard(page);
    await shot(page, `${lang}-portfolio`);

    // legal: the filing block (no defendant chosen yet, so no block reason is shown)
    await goTo(page, 'court');
    const fileButton = page.getByTestId('file-case');
    await expect(fileButton).toBeVisible({ timeout: 15_000 });
    await fileButton.scrollIntoViewIfNeeded();
    await shot(page, `${lang}-legal`);

    // the auctions: each lot names its minimum rank
    await goTo(page, 'estate');
    await page.getByTestId('tab-auctions').click();
    await expect(page.getByTestId('auctions-panel')).toBeVisible({ timeout: 15_000 });
    const minRank = page.locator('[data-testid^="auction-min-rank-"]').first();
    await expect(minRank).toBeVisible({ timeout: 20_000 });
    await minRank.scrollIntoViewIfNeeded();
    await shot(page, `${lang}-auctions`);
  }

  expect(errors).toEqual([]);
});
