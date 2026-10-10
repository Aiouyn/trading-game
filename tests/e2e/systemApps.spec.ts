import { expect, test } from '@playwright/test';
import { goTo, grant, isPhone, register, skipRankUp, skipTips, watchErrors } from './helpers';

// The system apps (Phase 2 step 3): Settings, Learn, Research Desk, Company, and the hidden Exchange and Launchpad.

test('Learn searches the glossary in place and shows the lesson slots as coming later', async ({ page }) => {
  const errors = watchErrors(page);
  await register(page);
  await skipTips(page);
  await goTo(page, 'learn');
  await expect(page.getByTestId('learn')).toBeVisible();
  await expect(page.getByTestId('learn-lessons')).toContainText('Coming in a later release');
  await page.getByTestId('learn-search').fill('margin');
  await expect(page.getByTestId('learn-term-margin')).toBeVisible();
  await expect(page.getByTestId('learn-term-broker')).toHaveCount(0);
  await page.getByTestId('learn-search').fill('no such term at all');
  await expect(page.getByTestId('learn-empty')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Settings switches the language, saves it in tg-prefs and switches back', async ({ page }) => {
  const errors = watchErrors(page);
  await register(page);
  await skipTips(page);
  await goTo(page, 'profile');
  await expect(page.getByTestId('settings-language')).toBeVisible();
  await page.getByTestId('settings-lang-fr').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByTestId('settings-language')).toContainText('Langue');
  const saved = await page.evaluate(() => JSON.parse(window.localStorage.getItem('tg-prefs') ?? '{}').lang);
  expect(saved).toBe('fr');
  await page.getByTestId('settings-lang-en').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByTestId('settings-language')).toContainText('Language');
  expect(errors).toEqual([]);
});

test('Reduce motion applies at once and is kept on this device', async ({ page }) => {
  await register(page);
  await skipTips(page);
  await goTo(page, 'profile');
  await page.getByTestId('settings-motion-toggle').check();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-game', 'ready', { timeout: 30_000 });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
});

test('the Research Desk is locked below Operator, then opens with an empty Files list', async ({ page }) => {
  test.skip(isPhone(page), 'the shelf tile and its tooltip are the desktop check');
  const handle = await register(page);
  await skipTips(page);
  await expect(page.getByTestId('shelf-app-research')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId('shelf-app-research')).toHaveAttribute('aria-label', /opens at Operator/);
  await grant(handle, 8_000_000);
  await skipRankUp(page);
  await goTo(page, 'research');
  await expect(page.getByTestId('research')).toBeVisible();
  await expect(page.getByTestId('research-files-empty')).toBeVisible();
  await expect(page.getByTestId('desk-unlock')).toBeVisible();
  await expect(page.getByTestId('research-note')).toContainText('kept as a file');
  await expect(page.getByTestId('research-locked')).toHaveCount(0);
});

test('Company has no tile before Owner, and an honest empty state from Owner', async ({ page }) => {
  test.skip(isPhone(page), 'the desktop shelf shows the tile; the phone grid is checked in phone.spec');
  const handle = await register(page);
  await skipTips(page);
  await expect(page.getByTestId('shelf-app-company')).toHaveCount(0);
  await grant(handle, 8_000_000);
  await skipRankUp(page);
  await goTo(page, 'company');
  await expect(page.getByTestId('company-empty')).toBeVisible();
});

test('a deep link to Exchange lands on the desktop with a Coming later notice', async ({ page }) => {
  await register(page);
  await skipTips(page);
  await page.goto('/exchange');
  await expect(page.locator('html')).toHaveAttribute('data-game', 'ready', { timeout: 30_000 });
  await expect(page.getByText('Coming later.')).toBeVisible();
  await expect(page.getByTestId('win-exchange')).toHaveCount(0);
});
