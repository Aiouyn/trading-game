import { expect, test } from '@playwright/test';
import { goTo, isPhone, noHorizontalOverflow, proof, register, skipTips, watchErrors } from './helpers';

// Group 3 apps (Businesses, Boutique, Bank & Credit, Legal & Court, Security, AI Lab) as windows. A new
// player is R0: Bank, Businesses, Boutique and Legal are open. Security and the AI Lab are locked, so their
// tiles are disabled and open no window. The Bank hides the loan form (no dead Send button) until Hustler.
test('group 3 apps open, and the locks match the rank', async ({ page }) => {
  const errors = watchErrors(page);
  await register(page);
  await skipTips(page);

  await goTo(page, 'bank');
  await expect(page.getByTestId('bank-view')).toBeVisible();
  await expect(page.getByTestId('bank-offer-locked')).toBeVisible();
  await expect(page.getByTestId('bank-offer-send')).toHaveCount(0);
  await noHorizontalOverflow(page);
  await proof(page, 'group3-bank');

  await goTo(page, 'empire');
  await expect(page.getByTestId('empire-view')).toBeVisible();
  await noHorizontalOverflow(page);

  await goTo(page, 'estate');
  await expect(page.getByTestId('estate-view')).toBeVisible();
  await noHorizontalOverflow(page);

  await goTo(page, 'court');
  await expect(page.getByTestId('court-view')).toBeVisible();
  await noHorizontalOverflow(page);

  if (!isPhone(page)) {
    for (const app of ['security', 'ailab']) {
      await expect(page.getByTestId(`shelf-app-${app}`)).toHaveAttribute('aria-disabled', 'true');
      await page.getByTestId(`shelf-app-${app}`).click({ force: true });
      await expect(page.getByTestId(`win-${app}`)).toHaveCount(0);
    }
  }

  expect(errors).toEqual([]);
});

// Each app must fit its minimum window (420 x 300, src/shell/apps.ts). The south-east corner is dragged far
// up and left, so the window clamps at its minimum, and the app body must not scroll sideways there.
test('group 3 apps fit their minimum window size', async ({ page }) => {
  test.skip(isPhone(page), 'phone apps are full screen');
  await register(page);
  await skipTips(page);
  for (const [screen, app, view] of [['bank', 'bank', 'bank-view'], ['empire', 'businesses', 'empire-view'], ['estate', 'boutique', 'estate-view'], ['court', 'legal', 'court-view']] as const) {
    await goTo(page, screen);
    await expect(page.getByTestId(`win-${app}`)).toBeVisible();
    const handle = page.getByTestId(`win-${app}-resize-se`);
    const box = await handle.boundingBox();
    if (!box) throw new Error(`no resize handle for ${app}`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 900, box.y - 900, { steps: 12 });
    await page.mouse.up();
    const win = await page.getByTestId(`win-${app}`).boundingBox();
    expect(win!.width).toBeLessThanOrEqual(430);
    expect(win!.height).toBeLessThanOrEqual(310);
    const overflow = await page.getByTestId(`win-${app}`).evaluate((el) => {
      const body = el.querySelector('.os-win-body');
      return body ? body.scrollWidth - body.clientWidth : 0;
    });
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.getByTestId(view)).toBeVisible();
    await proof(page, `group3-min-${app}`);
  }
});
