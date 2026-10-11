import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { goTo, isPhone, noHorizontalOverflow, register, skipTips, watchErrors } from './helpers';

// The Boutique's Auctions tab (6D.2). A lot is open only in the first real hour of a week, and the e2e world starts a few game
// days in, so these lots are past their hour: the tab must show the week's lots with their status and no bid form. The bid
// itself (the minimum, the reserve, the anti-snipe and the settlement) is covered by src/world/auctions.test.ts. An open-lot bid
// in Playwright would need the shared world advanced to a week's first tick, about 120,000 ticks, which blocks the world server
// for minutes (measured: the admin advance timed out), so it is not run here.

const SHOTS = process.env.E2E_SHOTS ?? 'test-results/shots-p6d';

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${isPhone(page) ? 'phone' : 'window'}-${name}.png` });
}

async function setLanguage(page: Page, lang: 'en' | 'fr'): Promise<void> {
  if (lang === 'en') return;
  await goTo(page, 'profile');
  await page.getByTestId('settings-lang-fr').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
}

for (const lang of ['en', 'fr'] as const) {
  test(`auctions tab lists the week's lots, none open, and no bid form (${lang})`, async ({ page }) => {
    const errors = watchErrors(page);
    await register(page, 'sxa');
    await skipTips(page);
    await setLanguage(page, lang);
    await goTo(page, 'estate');
    await page.getByTestId('tab-auctions').click();
    await expect(page.getByTestId('auctions-panel')).toBeVisible();
    const lots = page.locator('[data-testid^="auction-lot-"]');
    await expect(lots.first()).toBeVisible({ timeout: 15_000 });
    const count = await lots.count();
    expect(count).toBeGreaterThanOrEqual(3);
    expect(count).toBeLessThanOrEqual(5);
    // this world is past the week's first hour, so every lot has ended without a bid
    const firstId = ((await lots.first().getAttribute('data-testid')) ?? '').replace('auction-lot-', '');
    await expect(page.getByTestId(`auction-status-${firstId}`)).toHaveText(lang === 'fr' ? 'Invendu' : 'Did not sell');
    await expect(page.getByTestId(`auction-amount-${firstId}`)).toHaveCount(0);
    await shot(page, `auctions-tab-${lang}`);
    await noHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });
}
