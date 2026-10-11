import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { goTo, grant, isPhone, register, skipRankUp, skipTips, watchErrors } from './helpers';

// Stage 4 review: the empire screenshot matrix. Gated (EMPIRE_SHOTS=1) so the normal suite never runs it. It walks every
// empire app, each Company tab and the Launchpad token page at 1440x900, 1280x720, 1920x1080 and 390x844, in English,
// and the main pages again in French, and writes each shot to EMPIRE_SHOTS_DIR as empire-<viewport>-<page>-<state>-<lang>.png.

const DIR = process.env.EMPIRE_SHOTS_DIR ?? 'test-results/empire-shots';
const VIEWPORTS = [
  { label: '1440x900', viewport: { width: 1440, height: 900 } },
  { label: '1280x720', viewport: { width: 1280, height: 720 } },
  { label: '1920x1080', viewport: { width: 1920, height: 1080 } },
  { label: '390x844', viewport: { width: 390, height: 844 }, mobile: true },
] as const;
const COMPANY_VIEWS = ['overview', 'products', 'rd', 'people', 'deals', 'capital', 'filings', 'public'] as const;

test.skip(!process.env.EMPIRE_SHOTS, 'the empire screenshot matrix runs only when EMPIRE_SHOTS is set');

async function shot(page: Page, vp: string, area: string, state: string, lang: string): Promise<void> {
  fs.mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(DIR, `empire-${vp}-${area}-${state}-${lang}.png`) });
}

async function openTab(page: Page, id: string): Promise<void> {
  await page.getByTestId(`tab-${id}`).first().click({ timeout: 6_000 });
}

async function closeWindow(page: Page, app: string): Promise<void> {
  if (isPhone(page)) { await page.getByTestId('phone-quay').click({ timeout: 3_000 }).catch(() => undefined); return; }
  await page.getByTestId(`win-${app}-close`).first().click({ timeout: 3_000 }).catch(() => undefined);
}

async function setFrench(page: Page): Promise<void> {
  await goTo(page, 'profile');
  await page.getByTestId('settings-language').getByRole('button', { name: 'Français' }).click();
  await page.waitForTimeout(400);
  await closeWindow(page, 'settings');
}

async function mainEmpireApps(page: Page, vp: string, lang: string): Promise<void> {
  // Businesses: buy one shop first so the owned table has a row, then every tab
  await goTo(page, 'empire');
  await openTab(page, 'buy');
  await page.locator('[data-testid^="buy-biz-"]').first().click({ timeout: 8_000 });
  await shot(page, vp, 'businesses', 'buy-pick', lang);
  await page.getByTestId('biz-commit-confirm').click({ timeout: 8_000 });
  await page.waitForTimeout(600);
  await openTab(page, 'owned');
  await shot(page, vp, 'businesses', 'owned-table', lang);
  await page.locator('[data-testid^="biz-manage-"]').first().click({ timeout: 6_000 });
  await shot(page, vp, 'businesses', 'owned-manage', lang);
  for (const tb of ['shops', 'buy', 'property', 'homes'] as const) {
    await openTab(page, tb);
    await shot(page, vp, 'businesses', `tab-${tb}`, lang);
  }
  await closeWindow(page, 'businesses');

  await goTo(page, 'estate');
  await shot(page, vp, 'boutique', 'shop', lang);
  await openTab(page, 'collection');
  await shot(page, vp, 'boutique', 'collection', lang);
  await closeWindow(page, 'boutique');

  await goTo(page, 'exchange');
  for (const tb of ['stocks', 'ipos', 'funds', 'mine', 'manage'] as const) {
    await openTab(page, tb);
    await shot(page, vp, 'exchange', `tab-${tb}`, lang);
  }
  await closeWindow(page, 'exchange');

  await goTo(page, 'launchpad');
  for (const tb of ['new', 'trending', 'graduated', 'holdings', 'create'] as const) {
    await openTab(page, tb);
    await shot(page, vp, 'launchpad', `tab-${tb}`, lang);
  }
  await openTab(page, 'new');
  const token = page.locator('[data-testid^="lp-open-"]').first();
  if (await token.count()) {
    await token.click({ timeout: 6_000 });
    await shot(page, vp, 'launchpad', 'token-page', lang);
  }
  await closeWindow(page, 'launchpad');

  await goTo(page, 'ailab');
  await shot(page, vp, 'ailab', 'main', lang);
  for (const tb of ['compute', 'train', 'models', 'bots'] as const) {
    await openTab(page, tb).catch(() => undefined);
    await shot(page, vp, 'ailab', `tab-${tb}`, lang);
  }
  await closeWindow(page, 'ailab');

  await goTo(page, 'security');
  await shot(page, vp, 'security', 'connections', lang);
  await openTab(page, 'ops');
  await shot(page, vp, 'security', 'ops', lang);
  await closeWindow(page, 'security');

  await goTo(page, 'court');
  await shot(page, vp, 'legal', 'main', lang);
  await closeWindow(page, 'legal');

  await goTo(page, 'bank');
  await shot(page, vp, 'bank', 'main', lang);
  await closeWindow(page, 'bank');

  await goTo(page, 'learn');
  await shot(page, vp, 'learn', 'main', lang);
  await closeWindow(page, 'learn');

  await goTo(page, 'profile');
  await shot(page, vp, 'settings', 'main', lang);
  await closeWindow(page, 'settings');
}

async function companyTabs(page: Page, vp: string, lang: string): Promise<void> {
  await goTo(page, 'company');
  await expect(page.getByTestId('company-found')).toBeVisible({ timeout: 15_000 });
  await shot(page, vp, 'company', 'found-empty', lang);
  await page.getByTestId('company-name').fill('Shot Tour Co.');
  await page.getByTestId('company-found-submit').click();
  await page.getByTestId('company-found-submit-review-confirm').click();
  await expect(page.getByTestId('company-overview')).toBeVisible({ timeout: 25_000 });
  for (const v of COMPANY_VIEWS) {
    await page.getByTestId(`company-tab-${v}`).click();
    await shot(page, vp, 'company', `tab-${v}`, lang);
  }
  await closeWindow(page, 'company');
}

for (const vp of VIEWPORTS) {
  test.describe(`empire matrix ${vp.label}`, () => {
    test.use({ viewport: vp.viewport, isMobile: 'mobile' in vp ? vp.mobile : false, hasTouch: 'mobile' in vp ? vp.mobile : false });
    test(`shots ${vp.label}`, async ({ page }) => {
      test.setTimeout(900_000);
      const errors = watchErrors(page);
      const handle = await register(page, 'shot');
      await skipTips(page);
      await grant(handle, 300_000);
      await skipRankUp(page).catch(() => undefined);
      await shot(page, vp.label, 'home', 'desk', 'en');
      await mainEmpireApps(page, vp.label, 'en');
      await companyTabs(page, vp.label, 'en');
      await setFrench(page);
      for (const [area, app] of [['businesses', 'empire'], ['exchange', 'exchange'], ['launchpad', 'launchpad'], ['security', 'security'], ['legal', 'court'], ['bank', 'bank']] as const) {
        await goTo(page, app);
        await shot(page, vp.label, area, 'main', 'fr');
        await closeWindow(page, app);
      }
      await goTo(page, 'profile');
      await shot(page, vp.label, 'settings', 'main', 'fr');
      expect(errors.filter((e) => !/favicon|ResizeObserver/.test(e))).toEqual([]);
    });
  });
}
