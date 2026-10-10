import { expect, test } from '@playwright/test';
import { goTo, isPhone, proof, register, skipTips, watchErrors } from './helpers';

// Help and sandbox (Phase 3, section 4): the practice account never reaches the live net worth, a lesson completes on the
// server and stays done after a reload, the goal ladder is hidden until the player opts in, and the calendar is never empty.

test('a practice run starts with paper money and its trades never change live net worth', async ({ page }) => {
  const errors = watchErrors(page);
  await register(page);
  await skipTips(page);
  // the live net worth is on the home widget on the phone, and in the status strip on the desktop
  const liveNetWorth = async () => {
    if (isPhone(page)) await page.getByTestId('phone-quay').click();
    return (await page.getByTestId('os-networth').textContent())?.trim();
  };
  const before = await liveNetWorth();
  await goTo(page, 'learn');
  await page.getByTestId('tab-practice').click();
  await page.getByTestId('practice-open').click();
  await expect(page.getByTestId('practice-desk')).toBeVisible();
  await expect(page.getByTestId('practice-banner')).toContainText('not your real money');

  await page.getByTestId('practice-qty').fill('1');
  await page.getByTestId('practice-place').click();
  await expect(page.getByTestId('practice-notice')).toContainText('Order placed');
  await page.getByTestId('practice-step').click();
  await expect(page.locator('[data-testid^="practice-position-"]').first()).toBeVisible();
  await proof(page, 'help-practice-desk');

  // paper money moved; the live account did not
  expect(await liveNetWorth()).toBe(before);
  expect(errors).toEqual([]);
});

test('a lesson completes on the server and stays done after a reload', async ({ page }) => {
  const errors = watchErrors(page);
  await register(page);
  await skipTips(page);
  await goTo(page, 'learn');
  await page.getByTestId('learn-lesson-open-1').click();
  await expect(page.getByTestId('lesson-desk')).toBeVisible();
  await page.getByTestId('lesson-place').click();
  await page.getByTestId('lesson-step').click();
  await expect(page.locator('[data-testid^="lesson-position-"]').first()).toBeVisible();
  await page.getByTestId('learn-lesson-check').click();
  await expect(page.getByTestId('learn-lesson-passed')).toBeVisible();
  await proof(page, 'help-lesson-passed');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-game', 'ready', { timeout: 30_000 });
  await goTo(page, 'learn');
  await expect(page.getByTestId('learn-lesson-1-status')).toHaveText('Done');
  expect(errors).toEqual([]);
});

test('the goal ladder is hidden by default and shows once the player opts in', async ({ page }) => {
  const errors = watchErrors(page);
  await register(page);
  await skipTips(page);
  if (isPhone(page)) {
    await page.getByTestId('phone-quay').click();
    await expect(page.getByTestId('home')).toBeVisible();
    await expect(page.getByTestId('goals-card')).toHaveCount(0);
  } else {
    await goTo(page, 'portfolio');
    await expect(page.getByTestId('portfolio-view')).toBeVisible();
    await expect(page.getByTestId('goals-card')).toHaveCount(0);
  }

  await goTo(page, 'settings');
  await page.getByTestId('settings-goals-toggle').check();
  if (isPhone(page)) {
    await page.getByTestId('phone-quay').click();
    await expect(page.getByTestId('goals-card')).toBeVisible();
    await expect(page.getByTestId('goals-next')).toContainText('Reach $20k');
    await proof(page, 'help-goals-home');
  } else {
    await goTo(page, 'portfolio');
    await expect(page.getByTestId('goals-card')).toBeVisible();
    await expect(page.getByTestId('goal-nw20k')).toBeVisible();
    await proof(page, 'help-goals-card');
  }
  expect(errors).toEqual([]);
});

test('the calendar always has dated items for the two game days ahead', async ({ page }) => {
  await register(page);
  await skipTips(page);
  await goTo(page, 'calendar');
  await expect(page.getByTestId('calendar-busy')).toBeVisible();
  await expect(page.getByTestId('calendar-next')).toBeVisible();
  expect(await page.locator('[data-testid^="calendar-item-"]').count()).toBeGreaterThanOrEqual(3);
  await proof(page, 'help-calendar');
});
