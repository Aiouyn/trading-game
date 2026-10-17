import { test, expect, type Page } from '@playwright/test';

async function boot(page: Page) {
  await page.goto('/?seed=desktop-design&fresh');
  await expect(page.locator('html')).toHaveAttribute('data-game', 'ready', { timeout: 30000 });
  await page.evaluate(() => window.__tg!.pause());
}

const account = (page: Page) => page.evaluate(() => JSON.stringify(window.__tg!.state().world!.accounts.you));

test('three appearances preserve the account and persist across reload', async ({ page }) => {
  await boot(page);
  const before = await account(page);
  await page.getByTestId('open-appearance').click();
  for (const look of ['pocket', 'daylight', 'afterhours']) {
    await page.getByTestId(`look-${look}`).click();
    await expect(page.getByTestId('desktop-os')).toHaveAttribute('data-look', look);
    expect(await account(page)).toBe(before);
  }
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-game', 'ready', { timeout: 30000 });
  await expect(page.getByTestId('desktop-os')).toHaveAttribute('data-look', 'afterhours');
  await page.getByRole('button', { name: 'Open Markets', exact: true }).click();
  await expect(page.getByTestId('chart-price')).toBeVisible();
  await expect(page.getByTestId('price-chart').locator('canvas').first()).toBeVisible();
});

test('lifestyle interaction is usable and does not modify the financial account', async ({ page }) => {
  await boot(page);
  const before = await account(page);
  await page.getByRole('button', { name: 'Open My life', exact: true }).click();
  await page.getByRole('button', { name: 'City hatchback', exact: true }).click();
  await page.getByRole('button', { name: 'Paint Sage', exact: true }).click();
  await expect(page.getByTestId('car-preview').locator('path').first()).toHaveAttribute('fill', '#7eaa96');
  await page.getByRole('button', { name: 'Set as my goal', exact: true }).click();
  await page.getByRole('button', { name: 'Preview a drive', exact: true }).click();
  await expect(page.getByTestId('car-preview')).toContainText('THE COAST ROAD');
  await page.getByRole('button', { name: 'Back to garage', exact: true }).click();
  await page.getByRole('button', { name: 'Your place', exact: true }).click();
  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
  await page.getByRole('button', { name: 'Sunrise', exact: true }).click();
  await expect(page.getByTestId('room-preview')).toContainText('Shapes');
  await page.getByRole('button', { name: 'Show home screen', exact: true }).click();
  await expect(page.getByTestId('wishlist')).toContainText('City hatchback');
  expect(await account(page)).toBe(before);
});

test('desktop windows move, maximize, minimize and reopen', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'Desktop window interactions');
  await boot(page);
  await page.getByRole('button', { name: 'Open Markets', exact: true }).click();
  const window = page.getByTestId('window-market');
  const before = (await window.boundingBox())!;
  await page.mouse.move(before.x + 180, before.y + 20);
  await page.mouse.down();
  await page.mouse.move(before.x + 255, before.y + 55, { steps: 5 });
  await page.mouse.up();
  const after = (await window.boundingBox())!;
  expect(after.x - before.x).toBeGreaterThan(60);
  expect(after.y - before.y).toBeGreaterThan(20);
  await window.getByRole('button', { name: 'Maximize window' }).click();
  expect((await window.boundingBox())!.width).toBeGreaterThan(before.width);
  await window.getByRole('button', { name: 'Minimize window' }).click();
  await expect(window).toHaveCount(0);
  await page.getByRole('button', { name: 'Open Markets', exact: true }).click();
  await expect(window).toBeVisible();
  await window.getByRole('button', { name: 'Close window' }).click();
  await expect(window).toHaveCount(0);
});

test('phone apps return home and all appearances fit a narrow screen', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'Phone home and narrow geometry');
  await page.setViewportSize({ width: 320, height: 780 });
  await boot(page);
  await page.getByTestId('open-appearance').click();
  for (const look of ['daylight', 'afterhours', 'pocket']) {
    await page.getByTestId(`look-${look}`).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    const dock = (await page.getByRole('navigation', { name: 'Dock' }).boundingBox())!;
    expect(dock.x).toBeGreaterThanOrEqual(0);
    expect(dock.x + dock.width).toBeLessThanOrEqual(320);
  }
  await page.getByRole('button', { name: 'Back to home screen' }).click();
  await page.getByRole('button', { name: 'Open Markets', exact: true }).click();
  await expect(page.getByTestId('phone-main')).toBeVisible();
  await page.getByRole('button', { name: 'Back to home screen' }).click();
  await expect(page.getByTestId('window-market')).toHaveCount(0);
  await expect(page.getByTestId('net-worth')).toBeVisible();
});
