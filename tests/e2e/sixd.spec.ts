import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { goTo, grant, isPhone, noHorizontalOverflow, register, skipTips, watchErrors } from './helpers';

// The 6D surfaces a player uses without waiting on the clock: the one-switch insurance (Security), the daily streak claim
// (Boutique), and the Portfolio stress test. Each runs on the desktop and the phone, in English and French. The screenshots go
// to the 6D shots folder (E2E_SHOTS, or test-results/shots-p6d by default).

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

/** The viewer's 6D view, read from the page's own state (the same figures the cards show). */
function sixd(page: Page) {
  return page.evaluate(() => window.__tg!.state().me?.sixd ?? null);
}

/** Buys the first good in the Boutique shop: an action for the streak, and insured value for the policy. */
async function buyFirstGood(page: Page): Promise<void> {
  await goTo(page, 'estate');
  const buy = page.locator('[data-testid^="buy-item-"]').first();
  await expect(buy).toBeVisible({ timeout: 15_000 });
  await buy.click();
  // the Boutique reviews a purchase in its CommitBar first: nothing is spent until Confirm
  await page.getByTestId('boutique-commit-confirm').click();
  await expect.poll(async () => (await sixd(page))?.insurance.insuredValue ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
}

for (const lang of ['en', 'fr'] as const) {
  test.describe(`6D surfaces (${lang})`, () => {
    test(`insurance switch on and off in Security (${lang})`, async ({ page }) => {
      const errors = watchErrors(page);
      await register(page, 'sxi');
      await skipTips(page);
      await setLanguage(page, lang);
      const handle = await page.evaluate(() => window.__tg!.state().me?.player.handle ?? '');
      await grant(handle, 5_000_000);
      await buyFirstGood(page);
      await goTo(page, 'security');
      await expect(page.getByTestId('insurance-card')).toBeVisible();
      await expect(page.getByTestId('insurance-state')).toHaveText(lang === 'fr' ? 'Désactivée' : 'Off');
      await page.getByTestId('insurance-toggle').click();
      await expect(page.getByTestId('insurance-state')).toHaveText(lang === 'fr' ? 'Activée' : 'On', { timeout: 15_000 });
      await shot(page, `insurance-on-${lang}`);
      await page.getByTestId('insurance-toggle').click();
      await expect(page.getByTestId('insurance-state')).toHaveText(lang === 'fr' ? 'Désactivée' : 'Off', { timeout: 15_000 });
      await noHorizontalOverflow(page);
      expect(errors).toEqual([]);
    });

    test(`daily streak claim in Boutique (${lang})`, async ({ page }) => {
      const errors = watchErrors(page);
      await register(page, 'sxs');
      await skipTips(page);
      await setLanguage(page, lang);
      await buyFirstGood(page);
      await goTo(page, 'estate');
      await expect(page.getByTestId('streak-card')).toBeVisible();
      await expect(page.getByTestId('streak-claim')).toBeEnabled({ timeout: 15_000 });
      await page.getByTestId('streak-claim').click();
      await expect(page.getByTestId('streak-count')).toContainText(lang === 'fr' ? 'Série de 1 jours' : '1-day streak', { timeout: 15_000 });
      // one claim a real day: the claim closes again with the day's refusal
      await expect(page.getByTestId('streak-claim')).toBeDisabled();
      await expect(page.getByTestId('streak-block')).toBeVisible();
      await shot(page, `streak-claimed-${lang}`);
      await noHorizontalOverflow(page);
      expect(errors).toEqual([]);
    });

    test(`Portfolio stress test is labelled illustrative (${lang})`, async ({ page }) => {
      const errors = watchErrors(page);
      await register(page, 'sxt');
      await skipTips(page);
      await setLanguage(page, lang);
      await goTo(page, 'portfolio');
      await expect(page.getByTestId('stress-panel')).toBeVisible();
      await expect(page.getByTestId('stress-illustrative')).toHaveText(lang === 'fr' ? 'Illustratif' : 'Illustrative');
      // a new account holds no position, so the panel shows its empty state, not a table of zeros
      await expect(page.getByTestId('stress-empty')).toBeVisible();
      await shot(page, `stress-empty-${lang}`);
      await noHorizontalOverflow(page);
      expect(errors).toEqual([]);
    });
  });
}
