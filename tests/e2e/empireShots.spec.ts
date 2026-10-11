import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { goTo, grant, isPhone, register, skipRankUp, skipTips, watchErrors } from './helpers';

// Stage 4 review: the empire screenshot matrix. Gated (EMPIRE_SHOTS=1) so the normal suite never runs it. It walks every
// empire app, each Company tab and the Launchpad token page at 1440x900, 1280x720, 1920x1080 and 390x844, in English,
// and the main pages again in French, and writes each shot to EMPIRE_SHOTS_DIR as empire-<viewport>-<page>-<state>-<lang>.png.
// Every section is isolated: a section that cannot reach its screen writes a diag-*.png and the matrix goes on.

const DIR = process.env.EMPIRE_SHOTS_DIR ?? 'test-results/empire-shots';
const VIEWPORTS = [
  { label: '1440x900', viewport: { width: 1440, height: 900 }, mobile: false },
  { label: '1280x720', viewport: { width: 1280, height: 720 }, mobile: false },
  { label: '1920x1080', viewport: { width: 1920, height: 1080 }, mobile: false },
  { label: '390x844', viewport: { width: 390, height: 844 }, mobile: true },
] as const;
const COMPANY_VIEWS = ['overview', 'products', 'rd', 'people', 'deals', 'capital', 'filings', 'public'] as const;

test.skip(!process.env.EMPIRE_SHOTS, 'the empire screenshot matrix runs only when EMPIRE_SHOTS is set');

async function shot(page: Page, vp: string, area: string, state: string, lang: string): Promise<void> {
  fs.mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(DIR, `empire-${vp}-${area}-${state}-${lang}.png`) });
}

/** Runs one section of the matrix. A failure is logged and shot as a diagnostic, and the matrix goes on. */
async function section(page: Page, vp: string, name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.log(`SECTION-FAIL [${vp}] ${name}: ${String(e).split('\n')[0].slice(0, 200)}`);
    fs.mkdirSync(DIR, { recursive: true });
    await page.screenshot({ path: path.join(DIR, `diag-${vp}-${name.replace(/[^a-z0-9]+/gi, '-')}.png`) }).catch(() => undefined);
  }
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

async function businesses(page: Page, vp: string, lang: string): Promise<void> {
  await goTo(page, 'empire');
  await section(page, vp, 'businesses-buy', async () => {
    await openTab(page, 'buy');
    await page.locator('[data-testid^="buy-biz-"]').first().click({ timeout: 8_000 });
    await shot(page, vp, 'businesses', 'buy-pick', lang);
    await page.getByTestId('biz-commit-confirm').click({ timeout: 8_000 });
    await page.waitForTimeout(600);
  });
  await section(page, vp, 'businesses-owned', async () => {
    await openTab(page, 'owned');
    await shot(page, vp, 'businesses', 'owned-table', lang);
    await page.locator('[data-testid^="biz-manage-"]').first().click({ timeout: 6_000 });
    await shot(page, vp, 'businesses', 'owned-manage', lang);
  });
  for (const tb of ['shops', 'buy', 'property', 'homes'] as const) {
    await section(page, vp, `businesses-${tb}`, async () => {
      await openTab(page, tb);
      await shot(page, vp, 'businesses', `tab-${tb}`, lang);
    });
  }
  await closeWindow(page, 'businesses');
}

async function mainEmpireApps(page: Page, vp: string, lang: string): Promise<void> {
  await businesses(page, vp, lang);

  await section(page, vp, 'boutique', async () => {
    await goTo(page, 'estate');
    await shot(page, vp, 'boutique', 'shop', lang);
    await openTab(page, 'collection');
    await shot(page, vp, 'boutique', 'collection', lang);
    await closeWindow(page, 'boutique');
  });

  await section(page, vp, 'exchange', async () => {
    await goTo(page, 'exchange');
    for (const tb of ['stocks', 'ipos', 'funds', 'mine', 'manage'] as const) {
      await openTab(page, tb);
      await shot(page, vp, 'exchange', `tab-${tb}`, lang);
    }
    await closeWindow(page, 'exchange');
  });

  await section(page, vp, 'launchpad', async () => {
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
  });

  await section(page, vp, 'ailab', async () => {
    await goTo(page, 'ailab');
    await shot(page, vp, 'ailab', 'main', lang);
    for (const tb of ['compute', 'train', 'models', 'bots'] as const) {
      await openTab(page, tb).catch(() => undefined);
      await shot(page, vp, 'ailab', `tab-${tb}`, lang);
    }
    await closeWindow(page, 'ailab');
  });

  await section(page, vp, 'security', async () => {
    await goTo(page, 'security');
    await shot(page, vp, 'security', 'connections', lang);
    await openTab(page, 'ops');
    await shot(page, vp, 'security', 'ops', lang);
    await closeWindow(page, 'security');
  });

  await section(page, vp, 'legal', async () => {
    await goTo(page, 'court');
    await shot(page, vp, 'legal', 'main', lang);
    await closeWindow(page, 'legal');
  });

  await section(page, vp, 'bank', async () => {
    await goTo(page, 'bank');
    await shot(page, vp, 'bank', 'main', lang);
    await closeWindow(page, 'bank');
  });

  await section(page, vp, 'learn', async () => {
    await goTo(page, 'learn');
    await shot(page, vp, 'learn', 'main', lang);
    await closeWindow(page, 'learn');
  });

  await section(page, vp, 'settings', async () => {
    await goTo(page, 'profile');
    await shot(page, vp, 'settings', 'main', lang);
    await closeWindow(page, 'settings');
  });
}

async function companyTabs(page: Page, vp: string, lang: string): Promise<void> {
  await section(page, vp, 'company-found', async () => {
    await goTo(page, 'company');
    await expect(page.getByTestId('company-found')).toBeVisible({ timeout: 15_000 });
    await shot(page, vp, 'company', 'found-empty', lang);
    await page.getByTestId('company-name').fill('Shot Tour Co.');
    await page.getByTestId('company-found-submit').click();
    await page.getByTestId('company-found-submit-review-confirm').click();
    await expect(page.getByTestId('company-overview')).toBeVisible({ timeout: 25_000 });
  });
  for (const v of COMPANY_VIEWS) {
    await section(page, vp, `company-${v}`, async () => {
      await page.getByTestId(`company-tab-${v}`).click({ timeout: 8_000 });
      await shot(page, vp, 'company', `tab-${v}`, lang);
    });
  }
  await closeWindow(page, 'company');
}

for (const vp of VIEWPORTS) {
  test.describe(`empire matrix ${vp.label}`, () => {
    test.use({ viewport: vp.viewport, isMobile: vp.mobile, hasTouch: vp.mobile });
    test(`shots ${vp.label}`, async ({ page }) => {
      test.setTimeout(1_500_000);
      // a click that cannot land fails in 12 seconds, so a covered control cannot hold the whole matrix
      page.setDefaultTimeout(12_000);
      const errors = watchErrors(page);
      const handle = await register(page, 'shot');
      await skipTips(page);
      // Owner first (companies, Exchange, Launchpad), then Operator ($5M peak) so Security and the research desk open too
      await grant(handle, 300_000);
      await skipRankUp(page).catch(() => undefined);
      await grant(handle, 5_000_000);
      await skipRankUp(page).catch(() => undefined);
      await section(page, vp.label, 'home', async () => shot(page, vp.label, 'home', 'desk', 'en'));
      await mainEmpireApps(page, vp.label, 'en');
      await companyTabs(page, vp.label, 'en');
      await section(page, vp.label, 'french', async () => setFrench(page));
      for (const [area, app] of [['businesses', 'empire'], ['exchange', 'exchange'], ['launchpad', 'launchpad'], ['security', 'security'], ['legal', 'court'], ['bank', 'bank'], ['settings', 'profile']] as const) {
        await section(page, vp.label, `fr-${area}`, async () => {
          await goTo(page, app);
          await shot(page, vp.label, area, 'main', 'fr');
          await closeWindow(page, app);
        });
      }
      expect(errors.filter((e) => !/favicon|ResizeObserver/.test(e))).toEqual([]);
    });
  });
}
