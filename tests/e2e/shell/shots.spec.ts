import { expect, test, type Page } from '@playwright/test';
import { goTo, register } from '../helpers';
import { frame, gotoShell, isPhone, onlyIn, reachRank } from './support';

// Stage 2 shots for the review (not a regression check): runs only when SHOTS_OUT names a folder, and writes
// shell-<viewport>-<page>-<state>.png there (a -fr suffix for French). Each shot is a real frame of the desk or the phone.

const OUT = process.env.SHOTS_OUT;

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

async function pushToasts(page: Page, n: number): Promise<void> {
  for (let i = 1; i <= n; i++) {
    await page.evaluate(([k, tone]) => window.__tg!.state().toast({ tone: tone as 'gain' | 'info', text: `Notice ${k}: order filled at 177.22` }), [i, i === 1 ? 'gain' : 'info']);
  }
}

test.describe('stage 2 shots', () => {
  test.skip(!OUT, 'SHOTS_OUT is not set');

  test('desk shots at 1440 x 900, 1280 x 720 and 1920 x 1080, en and fr', async ({ page }) => {
    onlyIn('desktop', 'desktop-1920');
    const size = page.viewportSize()!;
    const vp = `${size.width}x${size.height}`;
    await page.addInitScript(() => { window.__tgE2eAdmin = 'e2e-admin'; });
    await register(page);
    await gotoShell(page, '/');
    await shot(page, `shell-${vp}-trade-default`);
    await pushToasts(page, 3);
    await shot(page, `shell-${vp}-trade-toasts`);
    await page.getByTestId('os-bell').click();
    await expect(page.getByTestId('bell-panel')).toBeVisible();
    await shot(page, `shell-${vp}-trade-bell`);
    await page.getByTestId('bell-close').click();
    await page.getByTestId('ws-1').click();
    await expect(frame(page, 'wire')).toBeVisible();
    await shot(page, `shell-${vp}-news-default`);
    await page.getByTestId('ws-0').click();
    await page.getByTestId('shelf-app-calendar').click().catch(() => undefined);
    await shot(page, `shell-${vp}-trade-panel`);
  });

  test('desk shots at 1280 x 720 (tabs, toasts, ticket fit)', async ({ page }) => {
    onlyIn('desktop', 'desktop-1920');
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript(() => { window.__tgE2eAdmin = 'e2e-admin'; });
    await register(page);
    await gotoShell(page, '/');
    await shot(page, 'shell-1280x720-trade-default');
    await pushToasts(page, 3);
    await shot(page, 'shell-1280x720-trade-toasts');
    await page.getByTestId('os-bell').click();
    await shot(page, 'shell-1280x720-trade-bell');
  });

  test('desk shots in French at 1440 x 900 (main page)', async ({ page }) => {
    onlyIn('desktop');
    await page.addInitScript(() => {
      window.localStorage.setItem('tg-prefs', JSON.stringify({ lang: 'fr' }));
      window.__tgE2eAdmin = 'e2e-admin';
    });
    await register(page);
    await gotoShell(page, '/');
    await shot(page, 'shell-fr-1440x900-trade-default');
    await pushToasts(page, 2);
    await shot(page, 'shell-fr-1440x900-trade-toasts');
    await page.getByTestId('ws-1').click();
    await expect(frame(page, 'wire')).toBeVisible();
    await shot(page, 'shell-fr-1440x900-news-default');
  });

  test('desk shots of the Portfolio and Empire workspaces at 1440 x 900 (a Pro save)', async ({ page }) => {
    onlyIn('desktop');
    await page.addInitScript(() => { window.__tgE2eAdmin = 'e2e-admin'; });
    const handle = await register(page);
    await gotoShell(page, '/');
    await reachRank(page, handle, 6_000_000);
    await page.getByTestId('ws-2').click();
    await expect(frame(page, 'portfolio')).toBeVisible();
    await shot(page, 'shell-1440x900-portfolio-default');
    await page.getByTestId('ws-3').click();
    await page.getByTestId('shelf-app-businesses').click();
    await shot(page, 'shell-1440x900-empire-default');
  });

  test('phone shots at 390 x 844: home, Broker, trade sheet', async ({ page }) => {
    onlyIn('phone');
    await page.addInitScript(() => { window.__tgE2eAdmin = 'e2e-admin'; });
    await register(page);
    await gotoShell(page, '/');
    await expect(page.getByTestId('os-phone')).toBeVisible();
    await shot(page, 'shell-390x844-home-default');
    await goTo(page, 'market');
    // the order-type picker shows once there has been a fill (the first trade is simple mode)
    await page.evaluate(async () => {
      await window.__tg!.state().act({ type: 'order.place', order: { assetId: 'HLCN', side: 'buy', type: 'market', qty: 1 } } as never, { silent: true });
    });
    await expect.poll(() => page.evaluate(() => window.__tg!.state().me?.player.stats.trades ?? 0)).toBeGreaterThan(0);
    await shot(page, 'shell-390x844-trade-default');
    await page.getByTestId('bar-qty').fill('1');
    await page.getByTestId('bar-review').click();
    await expect(page.getByTestId('trade-sheet')).toBeVisible();
    await shot(page, 'shell-390x844-trade-sheet');
    expect(isPhone(page)).toBe(true);
  });
});
