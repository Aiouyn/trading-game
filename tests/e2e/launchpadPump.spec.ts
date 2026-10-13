import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ageAccount, clearSheets, goTo, grant, isPhone, register, skipRankUp, skipTips, watchErrors } from './helpers';

// The Launchpad like pump.fun (lead-launchpad.md L7, R-10-6 as Phase 10), end to end on the shared e2e world: the board of cards with
// the king of the hill and the live trades bar; a token page with the candle chart, the trades table, the holders (the curve, the dev and
// the NPC cohort marked), and the replies thread; a buy with a quick chip ($100) that the ticket previews and sends; a reply that is posted
// and a link that is refused inline before it is sent. Each spec makes its own token. Runs on the desktop and phone projects. The
// screenshots go to P10_SHOTS (default test-results/p10-shots) in English and French.

const TPD = 720;
const MIN_AGE_TICKS = 3 * 24 * TPD + 10;
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SHOTS = process.env.P10_SHOTS ?? 'test-results/p10-shots';

/** A fresh ticker: four random letters, never used in this world. */
function randomTicker(): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  return s;
}

/** Registers a player with cash, past the account-age rule, at rank Hustler or higher (the launch gate). */
async function setUp(page: Page, prefix: string, cash: number): Promise<string> {
  const handle = await register(page, prefix);
  await grant(handle, cash);
  await ageAccount(handle, MIN_AGE_TICKS);
  await skipRankUp(page);
  await clearSheets(page);
  await skipTips(page);
  return handle;
}

/** Launches a token from the Create tab with a description and one of the generated images. */
async function launchWithDesc(page: Page, ticker: string, desc: string, art: number): Promise<void> {
  await goTo(page, 'launchpad');
  await expect(page.getByTestId('launchpad-view')).toBeVisible();
  await page.getByTestId('tab-create').click();
  await page.getByTestId('lp-name').fill(`Quiet ${ticker}`);
  await page.getByTestId('lp-ticker').fill(ticker);
  await page.getByTestId(`lp-art-${art}`).click();
  await page.getByTestId('lp-desc').fill(desc);
  await page.getByTestId('lp-tagline-tg2').click();
  await expect(page.getByTestId('lp-launch')).toBeEnabled();
  await expect(page.getByTestId('lp-fee')).toContainText('$100');
  await page.getByTestId('lp-launch').click();
  await expect(page.getByTestId('lp-launch-sent')).toBeVisible({ timeout: 20_000 });
}

/** Opens a token's page from the board (its card's own button). */
async function openFromBoard(page: Page, ticker: string): Promise<void> {
  await page.getByTestId('tab-new').click();
  await page.getByTestId(`lp-open-${ticker}`).click({ timeout: 20_000 });
  await expect(page.getByTestId('lp-token-page')).toBeVisible();
  await expect(page.getByTestId('lp-page-ticker')).toHaveText(ticker);
}

/** A screenshot of the page into the shots folder, at the top of the page (the window is the page on a phone). */
async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  const tag = isPhone(page) ? 'phone' : 'desktop';
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS, `${tag}-${name}.png`), fullPage: false });
}

test('the board shows the card, the trades bar and the king; the token page has the chart, trades, holders and a thread', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await setUp(page, 'lpp', 60_000);
  const ticker = randomTicker();
  const desc = 'A quiet coin for quiet days.';
  await launchWithDesc(page, ticker, desc, 1);

  // the board: a card with its market cap in dollars and its curve
  await goTo(page, 'launchpad');
  await page.getByTestId('tab-new').click();
  await expect(page.getByTestId(`lp-row-${ticker}`)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId(`lp-cap-${ticker}`)).toContainText('$');
  await expect(page.getByTestId(`lp-progress-${ticker}`)).toBeVisible();
  // the king of the hill is the live token closest to graduation: after a launch with its own buzz, that is at least this one
  await expect(page.getByTestId('lp-king')).toBeVisible();
  await shot(page, 'board');
  // the Create form: the four images, the description with its count, the $100 fee
  await page.getByTestId('tab-create').click();
  await expect(page.getByTestId('lp-art')).toBeVisible();
  await expect(page.getByTestId('lp-desc-count')).toBeVisible();
  await shot(page, 'create');
  await page.getByTestId('tab-new').click();

  // the token page: the description, the chart, the trades table, the holders with their roles, and the thread
  await openFromBoard(page, ticker);
  await expect(page.getByTestId('lp-page-desc')).toHaveText(desc);
  await expect(page.getByTestId('lp-candles')).toBeVisible();
  await expect(page.getByTestId('lp-tape')).toBeVisible();
  await expect(page.getByTestId('lp-holder-role-curve')).toBeVisible();
  await expect(page.getByTestId('lp-holders')).toContainText('Curve');
  await expect(page.getByTestId('lp-replies-section')).toBeVisible();
  await expect(page.getByTestId('lp-page-mcap')).toContainText('$');
  await shot(page, 'token');

  // a buy with the $100 quick chip: the ticket previews the fill, and the buy is sent
  await page.getByTestId('lp-quick-100').click();
  await expect(page.getByTestId('lp-spend')).toHaveValue('100');
  await expect(page.getByTestId('lp-preview')).toBeVisible();
  await page.getByTestId('lp-submit').click();
  await expect(page.getByTestId('lp-ticket-sent')).toBeVisible({ timeout: 20_000 });

  // a reply: a link is refused inline before it is sent; a plain line is posted and shows in the thread
  await page.getByTestId('lp-reply-input').fill('see www.scam.example.com');
  await expect(page.getByTestId('lp-reply-local')).toBeVisible();
  await expect(page.getByTestId('lp-reply-post')).toBeDisabled();
  await page.getByTestId('lp-reply-input').fill('to the moon, slowly');
  await page.getByTestId('lp-reply-post').click();
  await expect(page.getByTestId('lp-reply-sent')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('lp-reply-text').filter({ hasText: 'to the moon, slowly' })).toBeVisible({ timeout: 20_000 });
  await shot(page, 'token-traded');

  // back on the board, the trades bar carries the buy and the card the reply count
  await page.getByTestId('lp-back').click();
  await expect(page.getByTestId('lp-bar')).toBeVisible();
  await expect(page.getByTestId(`lp-card-replies-${ticker}`)).toContainText('1');
  expect(errors).toEqual([]);
});

test('the board and the token page read in French', async ({ page }) => {
  test.setTimeout(240_000);
  await setUp(page, 'lpf', 60_000);
  const ticker = randomTicker();
  await launchWithDesc(page, ticker, 'Une pièce tranquille.', 2);
  await page.evaluate(() => {
    const p = JSON.parse(window.localStorage.getItem('tg-prefs') ?? '{}');
    p.lang = 'fr';
    window.localStorage.setItem('tg-prefs', JSON.stringify(p));
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr', { timeout: 30_000 });
  await clearSheets(page);
  await goTo(page, 'launchpad');
  await page.getByTestId('tab-new').click();
  await expect(page.getByTestId(`lp-row-${ticker}`)).toBeVisible({ timeout: 20_000 });
  await shot(page, 'fr-board');
  await openFromBoard(page, ticker);
  await expect(page.getByTestId('lp-candles')).toBeVisible();
  await expect(page.getByTestId('lp-holders')).toContainText('Courbe');
  await shot(page, 'fr-token');
});
