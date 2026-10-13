import { expect, test, type Browser, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { goTo, grant, isPhone, noHorizontalOverflow, register, skipRankUp, skipTips, watchErrors } from './helpers';

// The home room and the collection page (6D.5). The owner places a good in a home slot and opens the room and the collection
// to visitors; a second player (the visitor, in its own browser context) sees them on the owner's profile only while they are
// open, and sees nothing of a room or collection that is closed. Each runs in English and French, on the desktop at 1440 x 900,
// at the minimum desktop window (900 x 800, the shell's single-window mode) and on the phone (390 x 844). The flow crosses two
// browsers and a dozen steps, so it has a longer limit than the single-player specs. Screenshots go to E2E_SHOTS (or
// test-results/shots-p6d2).

const SHOTS = process.env.E2E_SHOTS ?? 'test-results/shots-p6d2';
const PORT = process.env.E2E_PORT ?? '3200';
const ITEM = 'Grail sneakers';
const FLOW_MS = 180_000;

/** A shot named by its device and window width, so the 1440 and 900 windows keep their own files. */
async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  const size = page.viewportSize();
  const device = isPhone(page) ? 'phone' : `window${size?.width ?? 0}`;
  await page.screenshot({ path: `${SHOTS}/${device}-${name}.png` });
}

async function setLanguage(page: Page, lang: 'en' | 'fr'): Promise<void> {
  if (lang === 'en') return;
  await goTo(page, 'profile');
  await page.getByTestId('settings-lang-fr').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
}

/** A second player in a browser of its own, the same size as the owner's window. */
async function visitorPage(browser: Browser, like: Page): Promise<Page> {
  const phone = isPhone(like);
  const ctx = await browser.newContext({
    baseURL: `http://localhost:${PORT}`, locale: 'en-US', viewport: like.viewportSize() ?? { width: 1440, height: 900 }, isMobile: phone, hasTouch: phone,
  });
  return ctx.newPage();
}

/** Opens another player's profile from Messages > Social > Players. */
async function openProfile(page: Page, handle: string): Promise<void> {
  await goTo(page, 'social');
  await page.getByTestId('tab-social').click(); // goTo opens Messages on its inbox; Social is its own tab
  await page.getByTestId('tab-players').click();
  await expect(page.getByTestId(`player-${handle}`)).toBeVisible({ timeout: 15_000 });
  await page.getByTestId(`player-${handle}`).click();
  await expect(page.getByTestId('profile-modal')).toBeVisible();
  // the visit request is answered by the world within a moment; the sections it draws are checked after this pause
  await page.waitForTimeout(700);
}

async function closeProfile(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('profile-modal')).toHaveCount(0);
}

/** The whole room and collection story for one language, on the page's own window size. */
async function homeAndCollectionFlow(page: Page, browser: Browser, lang: 'en' | 'fr'): Promise<void> {
  const errors = watchErrors(page);
  const owner = await register(page, 'hro');
  await skipTips(page);
  await setLanguage(page, lang);
  await grant(owner, 5_000_000);
  // the grant lifts the owner to R3: the rank-up ceremony covers the shell until it is skipped
  await skipRankUp(page);

  // the owner buys the good and places it in slot 1 of the home room (both switches are off by default)
  await goTo(page, 'estate');
  const buy = page.getByTestId('buy-item-sneakers');
  await expect(buy).toBeEnabled({ timeout: 15_000 });
  await buy.click();
  await page.getByTestId('boutique-commit-confirm').click();
  await page.getByTestId('tab-home').click();
  await expect(page.getByTestId('home-room')).toBeVisible();
  await expect(page.getByTestId('home-visibility-state')).toHaveText(lang === 'fr' ? 'Désactivé' : 'Off');
  await page.getByTestId('home-slot-select-0').selectOption({ label: ITEM });
  await expect(page.getByTestId('home-slot-name-0')).toHaveText(ITEM, { timeout: 15_000 });
  await shot(page, `home-own-closed-${lang}`);
  await noHorizontalOverflow(page);

  // a visitor sees neither the room nor the collection while both are closed
  const vp = await visitorPage(browser, page);
  const visitErrors = watchErrors(vp);
  await register(vp, 'hrv');
  await skipTips(vp);
  await setLanguage(vp, lang);
  await openProfile(vp, owner);
  await expect(vp.getByTestId('visit')).toHaveCount(0);
  await shot(vp, `home-visitor-closed-${lang}`);
  await closeProfile(vp);

  // the owner opens the home room: the visitor sees its six slots, with the placed good
  await page.getByTestId('home-visibility').click();
  await expect(page.getByTestId('home-visibility-state')).toHaveText(lang === 'fr' ? 'Activé' : 'On', { timeout: 15_000 });
  await openProfile(vp, owner);
  await expect(vp.getByTestId('visit-home')).toBeVisible({ timeout: 15_000 });
  await expect(vp.getByTestId('visit-slot-0')).toContainText(ITEM);
  await expect(vp.getByTestId('visit-collection')).toHaveCount(0);
  await shot(vp, `home-visitor-open-${lang}`);
  await noHorizontalOverflow(vp);
  await closeProfile(vp);

  // the owner opens the collection: the visitor sees the collectibles (sneakers are a limited good)
  await page.getByTestId('tab-collection').click();
  await expect(page.getByTestId('collection-page')).toBeVisible();
  await page.getByTestId('collection-visibility').click();
  await expect(page.getByTestId('collection-visibility-state')).toHaveText(lang === 'fr' ? 'Activé' : 'On', { timeout: 15_000 });
  await openProfile(vp, owner);
  await expect(vp.getByTestId('visit-collection')).toBeVisible({ timeout: 15_000 });
  await expect(vp.getByTestId('visit-item-sneakers')).toHaveText(ITEM);
  await shot(vp, `collection-visitor-${lang}`);
  await closeProfile(vp);

  // the owner closes the room again: the visitor keeps the collection and loses the room
  await goTo(page, 'estate');
  await page.getByTestId('tab-home').click();
  await page.getByTestId('home-visibility').click();
  await expect(page.getByTestId('home-visibility-state')).toHaveText(lang === 'fr' ? 'Désactivé' : 'Off', { timeout: 15_000 });
  await openProfile(vp, owner);
  await expect(vp.getByTestId('visit-collection')).toBeVisible();
  await expect(vp.getByTestId('visit-home')).toHaveCount(0);
  await closeProfile(vp);

  // the owner's own collection page shows the same list
  await goTo(page, 'estate');
  await page.getByTestId('tab-collection').click();
  await shot(page, `collection-own-${lang}`);
  await noHorizontalOverflow(page);

  expect(errors).toEqual([]);
  expect(visitErrors).toEqual([]);
}

test.describe('home room and collection, desktop 1440 x 900 and the phone', () => {
  test.setTimeout(FLOW_MS);
  for (const lang of ['en', 'fr'] as const) {
    test(`home room and collection: placed, opened to a visitor, and closed again (${lang})`, async ({ page, browser }) => {
      await homeAndCollectionFlow(page, browser, lang);
    });
  }
});

test.describe('home room and collection, minimum desktop window 900 x 800', () => {
  test.use({ viewport: { width: 900, height: 800 } });
  test.setTimeout(FLOW_MS);
  test.skip(({ isMobile }) => isMobile, 'the desktop minimum window');
  for (const lang of ['en', 'fr'] as const) {
    test(`home room and collection at the minimum window (${lang})`, async ({ page, browser }) => {
      await homeAndCollectionFlow(page, browser, lang);
    });
  }
});
