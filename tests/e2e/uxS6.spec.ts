import { expect, test, type Page } from '@playwright/test';
import { advanceWorld, goTo, grant, isPhone, noHorizontalOverflow, register, skipRankUp, skipTips, watchErrors } from './helpers';

// UX stage 6 (docs/UX-REDESIGN.md, the 15 remaining weaknesses): the checks and the after-shots for items 9, 10 and 11. The
// desktop project (1440x900) also shoots 1280x720; the phone project (390x844) shoots the phone. The shots go to S6_SHOTS,
// named <item>-<viewport>-<lang>.png. English runs in both projects; French runs too (the same checks, with French text).

const SHOTS = process.env.S6_SHOTS ?? 'test-results/s6-shots';

/** A French session: the saved language is read at boot (src/i18n/index.ts readSaved). */
async function language(page: Page, lang: 'en' | 'fr'): Promise<void> {
  await page.addInitScript((l) => {
    try { window.localStorage.setItem('tg-prefs', JSON.stringify({ lang: l })); } catch { /* private mode */ }
  }, lang);
}

async function shot(page: Page, item: string, lang: 'en' | 'fr'): Promise<void> {
  const v = page.viewportSize()!;
  await page.screenshot({ path: `${SHOTS}/${item}-${v.width}x${v.height}-${lang}.png` });
}

/** The desktop project also takes the 1280x720 frame of the same page, then goes back to 1440x900. */
async function at1280(page: Page, item: string, lang: 'en' | 'fr'): Promise<void> {
  if (isPhone(page)) return;
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(400);
  await shot(page, item, lang);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
}

for (const lang of ['en', 'fr'] as const) {
  test.describe(`stage 6 (${lang})`, () => {
    test.beforeEach(async ({ page }) => {
      if (lang === 'fr') await language(page, 'fr');
    });

    test('item 11: a locked Company tile names its rank and net worth, and Bots links to Train', async ({ page }) => {
      test.setTimeout(180_000);
      const errors = watchErrors(page);
      const handle = await register(page);
      await skipTips(page);
      // Company is drawn locked before Owner, with the unlock line (rank and peak net worth) on its tile
      if (isPhone(page)) {
        await expect(page.getByTestId('home-app-company')).toHaveClass(/locked/);
        await expect(page.getByTestId('home-app-company')).toHaveAttribute('title', /250/);
      } else {
        await expect(page.getByTestId('shelf-app-company')).toHaveAttribute('aria-disabled', 'true');
        await expect(page.getByTestId('shelf-app-company')).toHaveAttribute('title', /250/);
      }
      await shot(page, 's11-company', lang);
      await at1280(page, 's11-company', lang);
      // Owner: the AI Lab opens, and Bots links to Train while no model exists
      await grant(handle, 260_000);
      await skipRankUp(page);
      await goTo(page, 'ailab');
      await page.getByTestId('lab-step-bots').click();
      await expect(page.getByTestId('lab-bots-to-train')).toBeVisible();
      await expect(page.getByTestId('lab-bot-to-train')).toBeVisible();
      await shot(page, 's11-bots', lang);
      await at1280(page, 's11-bots', lang);
      await page.getByTestId('lab-bots-to-train').click();
      await expect(page.getByTestId('train')).toBeVisible();
      await noHorizontalOverflow(page);
      expect(errors).toEqual([]);
    });

    test('item 11: the Research Desk paywall shows one sample file', async ({ page }) => {
      test.setTimeout(180_000);
      const errors = watchErrors(page);
      const handle = await register(page);
      await skipTips(page);
      await grant(handle, 5_100_000);
      await skipRankUp(page);
      await goTo(page, 'research');
      await expect(page.getByTestId('desk-unlock')).toBeVisible();
      const sample = page.getByTestId('desk-sample');
      await expect(sample).toBeVisible();
      await expect(sample).not.toContainText(/[{}@]/);
      await expect(sample).toContainText('HLCN');
      await shot(page, 's11-research', lang);
      await at1280(page, 's11-research', lang);
      await noHorizontalOverflow(page);
      expect(errors).toEqual([]);
    });

    test('item 10: the AI Lab leads with what the lab does, and the formula sits in a disclosure', async ({ page }) => {
      test.setTimeout(180_000);
      const errors = watchErrors(page);
      const handle = await register(page);
      await skipTips(page);
      await grant(handle, 260_000);
      await skipRankUp(page);
      await goTo(page, 'ailab');
      const stats = page.getByTestId('lab-stats');
      await expect(stats).toBeVisible();
      // the formula is not in the header text: it sits in a closed disclosure until it is opened
      const score = page.getByTestId('lab-score');
      await expect(score.locator('p')).toBeHidden();

      await score.locator('summary').click();
      await expect(score.locator('p')).toBeVisible();
      await expect(score.locator('p')).toContainText(lang === 'fr' ? 'Capacité =' : 'Capability =');
      // each unit carries a tooltip (a title attribute on its label)
      await expect(stats.locator('[title]')).toHaveCount(4);
      await shot(page, 's10-ailab', lang);
      await at1280(page, 's10-ailab', lang);
      await noHorizontalOverflow(page);
      expect(errors).toEqual([]);
    });

    test('item 9: with no closed trade, the Analyst tab says how to get the free sample', async ({ page }) => {
      test.setTimeout(120_000);
      const errors = watchErrors(page);
      const handle = await register(page);
      await skipTips(page);
      await grant(handle, 20_000);
      await skipRankUp(page);
      await goTo(page, 'portfolio');
      await page.getByTestId('portfolio-tab-analyst').click();
      await expect(page.getByTestId('analyst-sample-none')).toBeVisible();
      await expect(page.getByTestId('analyst-tier-junior')).toBeVisible();
      await shot(page, 's9-analyst-empty', lang);
      await at1280(page, 's9-analyst-empty', lang);
      await noHorizontalOverflow(page);
      expect(errors).toEqual([]);
    });

    test('item 9: the Analyst tab shows one free breakdown of the last closed trade above the tiers', async ({ page }) => {
      test.setTimeout(240_000);
      const errors = watchErrors(page);
      const handle = await register(page);
      await skipTips(page);
      // one closed trade: buy on the Broker (the first screen), then sell it from the Portfolio
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
      await portfolio.getByTestId('close-HLCN').click();
      await page.getByTestId('close-HLCN-yes').click();
      await expect(portfolio.getByTestId('position-HLCN')).toHaveCount(0, { timeout: 15_000 });
      // the trade's day closes once the world advances two game days (720 ticks a day); then the sample holds the parts
      await advanceWorld(2 * 720);
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-game', 'ready', { timeout: 30_000 });
      await goTo(page, 'portfolio');
      await page.getByTestId('portfolio-tab-analyst').click();
      await expect(page.getByTestId('analyst-sample')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('analyst-sample')).toContainText('HLCN');
      await expect(page.getByTestId('analyst-sample-waterfall')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('analyst-tier-junior')).toBeVisible();
      await expect(page.getByTestId('analyst-sample')).not.toContainText(/[{}@]/);
      await shot(page, 's9-analyst', lang);
      await at1280(page, 's9-analyst', lang);
      await noHorizontalOverflow(page);
      expect(errors).toEqual([]);
    });
  });
}
