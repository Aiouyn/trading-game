import { expect, test, type Page } from '@playwright/test';
import { grant, noHorizontalOverflow, proof, register, watchErrors } from './helpers';

/** The Recent sheet opens after a 400 ms hold on the Quay mark (P2-155). The hold is real time by design. */
async function holdQuay(page: Page, ms = 600): Promise<void> {
  const box = await page.getByTestId('phone-quay').boundingBox();
  if (!box) throw new Error('no Quay mark');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

/** Swipes a Recent row left past half its width, which closes its app (P2-163). */
async function swipeClose(page: Page, app: string): Promise<void> {
  const row = page.getByTestId(`recents-row-${app}`);
  const box = await row.boundingBox();
  if (!box) throw new Error(`no ${app} row`);
  await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 10, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
}

/** A fresh load on the e2e flag, with the admin grant, once the game is ready. */
async function e2ePage(page: Page, handle: string): Promise<void> {
  await page.goto('/?e2e');
  await expect(page.locator('html')).toHaveAttribute('data-game', 'ready', { timeout: 30_000 });
  await grant(handle, 300_000);
}

test.describe('phone desktop', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone flows');

  test('home: the net-worth widget, the app grid and the fixed bottom row', async ({ page }) => {
    const errors = watchErrors(page);
    await register(page);
    await expect(page.getByTestId('home')).toBeVisible();
    await expect(page.getByTestId('home-widget')).toBeVisible();
    await expect(page.getByTestId('os-networth')).toContainText('$5,250');
    for (const app of ['broker', 'portfolio', 'wire', 'messages']) {
      await expect(page.getByTestId(`home-app-${app}`)).toBeVisible();
    }
    await expect(page.getByTestId('home-row')).toBeVisible();
    // Company has no tile before Owner (C-11); Security shows locked with its rank tag.
    await expect(page.getByTestId('home-app-company')).toHaveCount(0);
    await expect(page.getByTestId('home-app-security')).toHaveClass(/locked/);
    // The R0 hardware is on the phone too: the bezel, the hairline crack and the sticker (P2-193).
    await expect(page.getByTestId('os-bezel')).toHaveCount(1);
    await expect(page.getByTestId('os-crack')).toHaveCount(1);
    await expect(page.getByTestId('os-hw-sticker')).toHaveCount(1);
    await noHorizontalOverflow(page);
    await proof(page, 'home');
    expect(errors).toEqual([]);
  });

  test('an app is full screen with a back chevron, and Back returns home', async ({ page }) => {
    await register(page);
    await page.getByTestId('home-app-wire').click();
    await expect(page.getByTestId('phone-app-wire')).toBeVisible();
    await expect(page.getByTestId('home')).toHaveCount(0);
    await proof(page, 'wire');
    await page.getByTestId('phone-back').click();
    await expect(page.getByTestId('home')).toBeVisible();
    // The browser Back does the same (pushState on open, P2-114).
    await page.getByTestId('home-app-wire').click();
    await expect(page.getByTestId('phone-app-wire')).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('home')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('a deep link opens its app, and the chevron goes home without leaving the app (P2-114)', async ({ page }) => {
    await register(page);
    // The entry before the deep link is outside the app, so a Back that leaves the app would show it.
    await page.goto('about:blank');
    await page.goto('/portfolio');
    await expect(page.getByTestId('phone-app-portfolio')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('phone-back').click();
    await expect(page.getByTestId('home')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('Recent: a hold opens the sheet, a tap switches, a swipe closes, Home returns, Escape dismisses', async ({ page }) => {
    await register(page);
    await page.getByTestId('home-app-broker').click();
    await page.getByTestId('phone-back').click();
    await page.getByTestId('home-app-wire').click();

    await holdQuay(page);
    await expect(page.getByTestId('phone-recents')).toBeVisible();
    await expect(page.getByTestId('recents-row-wire')).toBeVisible();
    await expect(page.getByTestId('recents-row-broker')).toBeVisible();
    await proof(page, 'recent');

    await page.getByTestId('recents-row-broker').click();
    await expect(page.getByTestId('phone-recents')).toHaveCount(0);
    await expect(page.getByTestId('phone-app-broker')).toBeVisible();

    // Swipe the Wire row left past half its width: it closes (P2-163).
    await holdQuay(page);
    await swipeClose(page, 'wire');
    await expect(page.getByTestId('recents-row-wire')).toHaveCount(0);
    await expect(page.getByTestId('recents-row-broker')).toBeVisible();

    await page.getByTestId('recents-home').click();
    await expect(page.getByTestId('phone-recents')).toHaveCount(0);
    await expect(page.getByTestId('home')).toBeVisible();

    await holdQuay(page);
    await expect(page.getByTestId('phone-recents')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('phone-recents')).toHaveCount(0);
  });

  test('a Broker ticket keeps its quantity when its Recent row is closed and reopened (P2-161)', async ({ page }) => {
    await register(page);
    await page.getByTestId('home-app-broker').click();
    await page.getByTestId('order-qty').fill('7');
    await page.getByTestId('phone-back').click();

    // The unsent ticket shows its dot on the Recent row (P2-160).
    await holdQuay(page);
    await expect(page.getByTestId('recents-draft-broker')).toHaveCount(1);
    await swipeClose(page, 'broker');
    await expect(page.getByTestId('recents-row-broker')).toHaveCount(0);

    // Reopening the Broker restores the ticket exactly. Nothing was sent (P2-161).
    await page.getByTestId('recents-home').click();
    await page.getByTestId('home-app-broker').click();
    await expect(page.getByTestId('order-qty')).toHaveValue('7');
    await expect(page.getByTestId('order-total')).toBeVisible();
  });

  test('a rank-up plays the OS update, skippable after a second; the e2e hooks exist only under ?e2e', async ({ page }) => {
    const errors = watchErrors(page);
    await page.addInitScript(() => { window.__tgE2eAdmin = 'e2e-admin'; });
    const handle = await register(page);
    expect(await page.evaluate(() => window.__tg?.e2e === undefined)).toBe(true);
    await e2ePage(page, handle);
    expect(await page.evaluate(() => typeof window.__tg?.e2e?.idle === 'function')).toBe(true);
    // The ceremony waits for 10 s idle; the hook backdates the idle clock (tape-e2e-conventions.md section 3).
    await page.evaluate(() => window.__tg!.e2e!.idle());
    await expect(page.getByTestId('os-update')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId('rankup-name')).toContainText('Owner', { timeout: 10_000 });
    await expect(page.getByTestId('os-update-skip')).toBeVisible({ timeout: 5_000 });
    await proof(page, 'os-update');
    await page.getByTestId('os-update-skip').click();
    await expect(page.getByTestId('os-update')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('the OS update is skipped by Escape once the skip opens (C-31)', async ({ page }) => {
    await page.addInitScript(() => { window.__tgE2eAdmin = 'e2e-admin'; });
    const handle = await register(page);
    await e2ePage(page, handle);
    await page.evaluate(() => window.__tg!.e2e!.idle());
    await expect(page.getByTestId('os-update')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId('os-update-skip')).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('os-update')).toHaveCount(0);
  });

  test('the ceremony can wait for Keep going at the end', async ({ page }) => {
    await page.addInitScript(() => { window.__tgE2eAdmin = 'e2e-admin'; });
    const handle = await register(page);
    await e2ePage(page, handle);
    await page.evaluate(() => window.__tg!.e2e!.idle());
    // The beats run to 4.2 s; then the one accent button, Keep going, is the way out.
    await expect(page.getByTestId('os-update')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId('rankup-keep-going')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('rankup-keep-going').click();
    await expect(page.getByTestId('os-update')).toHaveCount(0);
  });

  // The world is shared with the desktop specs, which trade HLCN: a large move halts it (a -19% move did), so the
  // shock is small and on XCHG.
  test('the e2e shock moves an asset price on the world; an unknown asset is refused', async ({ page }) => {
    await page.addInitScript(() => { window.__tgE2eAdmin = 'e2e-admin'; });
    const handle = await register(page);
    await e2ePage(page, handle);
    const lnP = () => page.evaluate(() => {
      const st = window.__tg!.state();
      const i = st.config.assets.findIndex((a) => a.id === 'XCHG');
      return st.world!.assets[i]!.lnP;
    });
    const before = await lnP();
    expect(await page.evaluate(() => window.__tg!.e2e!.shock('XCHG', -0.04))).toBe(true);
    await expect.poll(lnP, { timeout: 10_000 }).toBeLessThan(before - 0.02);
    expect(await page.evaluate(() => window.__tg!.e2e!.shock('NOPE', -0.2))).toBe(false);
  });
});
