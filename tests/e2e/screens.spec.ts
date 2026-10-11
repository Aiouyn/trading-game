import { expect, test } from '@playwright/test';
import { goTo, grant, isPhone, noHorizontalOverflow, proof, register, skipRankUp, skipTips, watchErrors } from './helpers';

const SCREENS: [string, string][] = [
  ['portfolio', 'portfolio-view'], ['empire', 'empire-view'], ['estate', 'estate-view'], ['lab', 'lab-view'],
  ['security', 'security-view'], ['court', 'court-view'], ['social', 'social-view'], ['wire', 'wire-view'], ['profile', 'profile-view'],
];

test('every screen opens without errors or horizontal overflow', async ({ page }) => {
  const errors = watchErrors(page);
  const handle = await register(page);
  await grant(handle, 8_000_000); // unlock the Lab and Security so their real screens render
  await skipRankUp(page);
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
  // A tip toast can land over the bottom-right of the desk, where the Messages window's composer now opens (centred).
  await skipTips(page);
  // The desktop opens the chat drawer from the strip; on the phone the chat is the Messages app's tab.
  if (isPhone(page)) { await goTo(page, 'social'); await page.getByTestId('tab-chat').click(); }
  else await page.getByTestId('os-chat').click();
  await page.getByTestId('chat-input').fill('hello from e2e');
  await page.getByTestId('chat-send').click();
  await expect(page.getByTestId('chat-panel')).toContainText('hello from e2e');
});

test('late game: options and the AI lab work after reaching Operator', async ({ page }) => {
  test.skip(isPhone(page), 'desktop flow');
  const handle = await register(page);
  await grant(handle, 8_000_000);
  await skipRankUp(page);
  await skipTips(page);
  // the chain is opened from the Asset tab of an underlying that lists options (AUC is one)
  await page.getByTestId('watch-AUC').click();
  // the HLCN Broker holds the watchlist; the AUC Broker opened beside it tiles, and a half-width Broker does not list the watchlist,
  // so the chain is opened from the HLCN window by its title
  const win = page.locator('[data-testid^="win-broker-"]').filter({ hasText: /HLCN/ }).first();
  // the desk can hold a second Broker over this one: its title brings this window to the front before its tabs are used
  await win.locator('[data-testid$="-title"]').first().click();
  await win.getByTestId('dock-tab-asset').click();
  await win.getByTestId('open-chain').click();
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
