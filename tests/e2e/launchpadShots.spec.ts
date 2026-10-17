import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN, WORLD, ageAccount, clearSheets, goTo, grant, isPhone, register, skipRankUp, skipTips } from './helpers';
import { frame } from './shell/support';

// Design screens for the review (not a regression check): several launches with some trading and one graduated token, then
// every tab and a token page, in English and French, on the desktop (1440 x 900) and the phone (390 x 844). It runs only when
// LP_SHOTS_DIR names a folder, so the normal run skips it.

const TPD = 720;
/** the launch gate's account age: three real days, which is 72 game days of ticks (LP.MIN_AGE_TICKS), plus a margin */
const MIN_AGE_TICKS = 3 * 24 * TPD + 10;
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function randomTicker(): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  return s;
}

async function setUp(page: Page, prefix: string, cash: number): Promise<void> {
  const handle = await register(page, prefix);
  await grant(handle, cash);
  await ageAccount(handle, MIN_AGE_TICKS);
  await skipRankUp(page);
  await clearSheets(page);
  await skipTips(page);
}

async function launch(page: Page, ticker: string, allocation: string, tagline: string): Promise<void> {
  await goTo(page, 'launchpad');
  await page.getByTestId('tab-create').click();
  await page.getByTestId('lp-name').fill(`Quiet ${ticker}`);
  await page.getByTestId('lp-ticker').fill(ticker);
  await page.getByTestId(`lp-tagline-${tagline}`).click();
  await page.getByTestId('lp-alloc').fill(allocation);
  await page.getByTestId('lp-launch').click();
  await expect(page.getByTestId('lp-launch-sent')).toBeVisible({ timeout: 20_000 });
}

test('the Launchpad screens for the design review, en and fr, desktop and phone', async ({ page, browser }) => {
  const dir = process.env.LP_SHOTS_DIR;
  test.skip(!dir, 'set LP_SHOTS_DIR to write the screens');
  test.setTimeout(1_200_000);
  mkdirSync(dir!, { recursive: true });
  const tag = isPhone(page) ? 'phone' : 'desktop';
  const vp = page.viewportSize() ?? { width: 1440, height: 900 };

  // three creators, each with a launch; the first two take some trading, the third graduates through the admin seam
  const tickers: string[] = [];
  const specs: [string, string, string][] = [['2', 'tg2', 'lp'], ['0', 'tg5', 'lq'], ['4', 'tg7', 'lr']];
  for (const [alloc, tg, prefix] of specs) {
    const c = await browser.newPage({ locale: 'en-US', viewport: vp });
    await setUp(c, prefix, 60_000);
    const tk = randomTicker();
    await launch(c, tk, alloc, tg);
    tickers.push(tk);
    await c.close();
  }
  const fill = await fetch(`${WORLD}/api/admin/lp-fill`, {
    method: 'POST', headers: { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' }, body: JSON.stringify({ ticker: tickers[2] }),
  });
  expect(fill.status).toBe(200);

  // the viewer trades on the first two tokens, so Holdings and the tape have something to show
  await setUp(page, 'lpshot', 60_000);
  // the viewer's own launch, cancelled before anyone trades: a dead token. Its page opens from the creator's console only.
  const dead = randomTicker();
  await launch(page, dead, '0', 'tg2');
  await goTo(page, 'launchpad');
  await page.getByTestId('tab-create').click();
  await page.getByTestId(`lp-cancel-${dead}`).click({ timeout: 20_000 });
  await expect(page.getByTestId(`lp-console-${dead}`).getByTestId('lp-status-dead')).toBeVisible({ timeout: 20_000 });
  for (const tk of tickers.slice(0, 2)) {
    await goTo(page, 'launchpad');
    await page.getByTestId('tab-new').click();
    await page.getByTestId(`lp-open-${tk}`).click({ timeout: 20_000 });
    // a buy the 5% slippage setting accepts on a thin curve (a larger one is refused in the ticket, by design)
    await page.getByTestId('lp-spend').fill('500');
    await page.getByTestId('lp-submit').click();
    await expect(page.getByTestId('lp-ticket-sent')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('lp-back').click();
  }

  const shot = async (name: string) => {
    // a token page opens at its top, not at the scroll of the list it was opened from
    if (name.includes('token')) await page.getByTestId('lp-token-page').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(400);
    // the desktop window opens at a slot about 400 px wide, so the card grid never shows; the screen is widened for the shot only
    const win = isPhone(page) ? null : frame(page, 'launchpad');
    if (win) {
      await win.evaluate((el) => { (el as HTMLElement).style.width = '1100px'; });
      await page.waitForTimeout(300);
      await win.screenshot({ path: join(dir!, `${tag}-${name}.png`) });
    }
    else await page.screenshot({ path: join(dir!, `${tag}-${name}.png`) });
  };

  for (const lang of ['en', 'fr'] as const) {
    if (lang === 'fr') {
      await page.evaluate(() => {
        const p = JSON.parse(window.localStorage.getItem('tg-prefs') ?? '{}');
        p.lang = 'fr';
        window.localStorage.setItem('tg-prefs', JSON.stringify(p));
      });
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('lang', 'fr', { timeout: 30_000 });
      await clearSheets(page);
    }
    await goTo(page, 'launchpad');
    await expect(page.getByTestId('launchpad-view')).toBeVisible();
    for (const [tab, name] of [['tab-new', 'new'], ['tab-trending', 'trending'], ['tab-graduated', 'graduated'], ['tab-holdings', 'holdings'], ['tab-create', 'create']] as const) {
      await page.getByTestId(tab).click();
      await shot(`${lang}-${name}`);
    }
    // a live token page, a graduated one (no curve ticket, Trade in Broker), and a dead one (sell-only ticket)
    await page.getByTestId('tab-new').click();
    await page.getByTestId(`lp-open-${tickers[0]}`).click({ timeout: 20_000 });
    await expect(page.getByTestId('lp-token-page')).toBeVisible();
    await shot(`${lang}-token`);
    await page.getByTestId('lp-back').click();
    await page.getByTestId('tab-graduated').click();
    await page.getByTestId(`lp-open-${tickers[2]}`).click({ timeout: 20_000 });
    await expect(page.getByTestId('lp-trade-broker')).toBeVisible();
    await shot(`${lang}-token-graduated`);
    await page.getByTestId('lp-back').click();
    await page.getByTestId('tab-create').click();
    await page.getByTestId(`lp-console-open-${dead}`).click({ timeout: 20_000 });
    await expect(page.getByTestId('lp-dead-note')).toBeVisible();
    await shot(`${lang}-token-dead`);
    await page.getByTestId('lp-back').click();
  }
});
