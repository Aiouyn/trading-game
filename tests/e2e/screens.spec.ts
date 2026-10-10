import { expect, test } from '@playwright/test';
import { goTo, grant, isPhone, noHorizontalOverflow, proof, register, skipTips, watchErrors } from './helpers';

const SCREENS: [string, string][] = [
  ['portfolio', 'portfolio-view'], ['empire', 'empire-view'], ['estate', 'estate-view'], ['lab', 'lab-view'],
  ['security', 'security-view'], ['court', 'court-view'], ['social', 'social-view'], ['wire', 'wire-view'], ['profile', 'profile-view'],
];

test('every screen opens without errors or horizontal overflow', async ({ page }) => {
  const errors = watchErrors(page);
  const handle = await register(page);
  await grant(handle, 8_000_000); // unlock the Lab and Security so their real screens render
  await expect(page.getByTestId('rankup-overlay')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('rankup-skip').click({ timeout: 10_000 });
  await skipTips(page);
  for (const [screen, id] of SCREENS) {
    await goTo(page, screen);
    await expect(page.getByTestId(id)).toBeVisible();
    await noHorizontalOverflow(page);
    await proof(page, screen);
  }
  expect(errors).toEqual([]);
});

test('chat: a message shows up for its sender', async ({ page }) => {
  await register(page);
  if (isPhone(page)) { await page.getByTestId('tab-more').click(); await page.getByTestId('more-chat').click(); }
  else await page.getByTestId('os-chat').click();
  await page.getByTestId('chat-input').fill('hello from e2e');
  await page.getByTestId('chat-send').click();
  await expect(page.getByTestId('chat-panel')).toContainText('hello from e2e');
});

test('late game: options and the AI lab work after reaching Operator', async ({ page }) => {
  test.skip(isPhone(page), 'desktop flow');
  const handle = await register(page);
  await grant(handle, 8_000_000);
  await page.getByTestId('rankup-skip').click({ timeout: 15_000 });
  await skipTips(page);
  await page.getByTestId('open-chain').click();
  await expect(page.getByTestId('option-chain')).toBeVisible();
  const buy = page.locator('[data-testid^=buy-call-]').nth(5);
  await buy.click();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid^="option-HLCN|"]')).toBeVisible({ timeout: 10_000 });
  await goTo(page, 'lab');
  await page.getByTestId('start-rules').click();
  await expect(page.getByTestId('start-rules')).toContainText('In progress');
  await proof(page, 'lab-research');
});
