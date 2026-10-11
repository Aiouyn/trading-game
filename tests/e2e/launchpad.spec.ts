import { expect, test, type Page } from '@playwright/test';
import { ADMIN, WORLD, ageAccount, clearSheets, goTo, grant, register, skipRankUp, skipTips, watchErrors } from './helpers';

// The Launchpad (Phase 5, lead-launchpad.md L7), end to end on the shared e2e world. A creator launches a token (it is in New,
// and in Holdings with the allocation locked); a trader buys and sells on its curve through the ticket's own preview, and a
// fill the slippage setting would refuse is refused inline in three parts before it is sent; the curve is filled through the
// admin seam, so the token graduates into the Graduated tab and opens in the Broker; a name the moderator refuses is refused
// in the Create form. Every spec makes its own token, so the specs do not depend on each other. Nothing here advances the world.

const TPD = 720;
/** the launch gate's account age: three real days, which is 72 game days of ticks (LP.MIN_AGE_TICKS), plus a margin */
const MIN_AGE_TICKS = 3 * 24 * TPD + 10;
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** A fresh ticker (three to five letters, never used in this world: four random letters). */
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

/** Launches a token from the Create tab: a name, a ticker, a tagline and an allocation in percent of supply. */
async function launch(page: Page, ticker: string, allocation = '2'): Promise<void> {
  await goTo(page, 'launchpad');
  await expect(page.getByTestId('launchpad-view')).toBeVisible();
  await page.getByTestId('tab-create').click();
  await page.getByTestId('lp-name').fill(`Quiet ${ticker}`);
  await page.getByTestId('lp-ticker').fill(ticker);
  await page.getByTestId('lp-tagline-tg2').click();
  await page.getByTestId('lp-alloc').fill(allocation);
  await expect(page.getByTestId('lp-launch')).toBeEnabled();
  await page.getByTestId('lp-launch').click();
  await expect(page.getByTestId('lp-launch-sent')).toBeVisible({ timeout: 20_000 });
}

/** Opens a token's page from the New feed (the row's own button). */
async function openFromNew(page: Page, ticker: string): Promise<void> {
  await page.getByTestId('tab-new').click();
  await page.getByTestId(`lp-open-${ticker}`).click({ timeout: 20_000 });
  await expect(page.getByTestId('lp-token-page')).toBeVisible();
  await expect(page.getByTestId('lp-page-ticker')).toHaveText(ticker);
}

test('a creator launches a token: it is in New, and in Holdings with the allocation locked', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await setUp(page, 'lpl', 60_000);
  const ticker = randomTicker();
  await launch(page, ticker, '2');

  await page.getByTestId('tab-new').click();
  await expect(page.getByTestId(`lp-row-${ticker}`)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId(`lp-progress-${ticker}`)).toContainText('0.00%');

  await page.getByTestId('tab-holdings').click();
  await expect(page.getByTestId(`lp-hold-${ticker}`)).toBeVisible();
  // 2% of a billion is 20 million tokens, all locked on day zero (the cliff is two game days after launch)
  await expect(page.getByTestId(`lp-hold-qty-${ticker}`)).toContainText('20,000,000');
  await expect(page.getByTestId(`lp-hold-locked-${ticker}`)).toContainText('20,000,000');
  await expect(page.getByTestId(`lp-hold-vest-${ticker}`)).toBeVisible();

  await page.getByTestId('tab-create').click();
  await expect(page.getByTestId(`lp-console-${ticker}`)).toBeVisible();
  await expect(page.getByTestId(`lp-console-unlocked-${ticker}`)).toContainText('0');
  expect(errors).toEqual([]);
});

test('a trader buys and sells on the curve with the fill preview, and a fill over the slippage setting is refused in three parts', async ({ page, browser }) => {
  test.setTimeout(300_000);
  const creatorPage = await browser.newPage({ locale: 'en-US' });
  const creatorErrors = watchErrors(creatorPage);
  await setUp(creatorPage, 'lpc', 60_000);
  const ticker = randomTicker();
  await launch(creatorPage, ticker, '0');

  const errors = watchErrors(page);
  const trader = await setUp(page, 'lpt', 40_000);
  await goTo(page, 'launchpad');
  await openFromNew(page, ticker);

  // the buy: the preview shows the tokens out, the average price, the impact and the 1% fee before anything is sent
  await page.getByTestId('lp-spend').fill('500');
  await expect(page.getByTestId('lp-preview')).toBeVisible();
  await expect(page.getByTestId('lp-preview-receive')).not.toHaveText('');
  await expect(page.getByTestId('lp-preview-fee')).toContainText('$5.00');
  await page.getByTestId('lp-submit').click();
  await expect(page.getByTestId('lp-ticket-sent')).toContainText(ticker, { timeout: 20_000 });

  // the trader's own trade is on the public tape, with no handle; the page names the trader nowhere
  await expect(page.getByTestId('lp-tape-rows')).toBeVisible();
  await expect(page.getByTestId('lp-token-page')).not.toContainText(trader);

  // a fill the slippage setting would refuse: refused in the ticket before it is sent, three parts, and the submit is off
  await page.getByTestId('lp-slip').fill('0.001');
  const refusal = page.getByTestId('lp-ticket-refusal');
  await expect(refusal).toBeVisible();
  await expect(refusal.locator('p')).toHaveCount(3);
  await expect(page.getByTestId('lp-submit')).toBeDisabled();
  await page.getByTestId('lp-slip').fill('5');
  await expect(page.getByTestId('lp-submit')).toBeEnabled();

  // the sell: half the holding, the preview of the net proceeds, then the fill
  await page.getByTestId('lp-ticket-sell').click();
  await page.getByTestId('lp-sell-50').click();
  await expect(page.getByTestId('lp-preview')).toBeVisible();
  await page.getByTestId('lp-submit').click();
  await expect(page.getByTestId('lp-ticket-sent')).toContainText('Sold', { timeout: 20_000 });

  expect(errors).toEqual([]);
  expect(creatorErrors).toEqual([]);
  await creatorPage.close();
});

test('a token the curve fills through the admin seam graduates into Graduated, and opens in the Broker', async ({ page, browser }) => {
  test.setTimeout(300_000);
  const creatorPage = await browser.newPage({ locale: 'en-US' });
  await setUp(creatorPage, 'lpg', 60_000);
  const ticker = randomTicker();
  await launch(creatorPage, ticker, '0');
  await creatorPage.close();

  const r = await fetch(`${WORLD}/api/admin/lp-fill`, {
    method: 'POST', headers: { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' }, body: JSON.stringify({ ticker }),
  });
  expect(r.status).toBe(200);

  await setUp(page, 'lpv', 20_000);
  await goTo(page, 'launchpad');
  await page.getByTestId('tab-graduated').click();
  const row = page.getByTestId(`lp-row-${ticker}`);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row.getByTestId(`lp-status-graduated`)).toBeVisible();
  await page.getByTestId(`lp-broker-${ticker}`).click();
  // the Broker opens the token as an asset: its panel names the ticker, and it can be traded there
  await expect(page.getByTestId('asset-panel').filter({ hasText: ticker }).first()).toBeVisible({ timeout: 30_000 });
});

test('a name the moderator refuses is refused in the Create form, inline, and the launch stays off', async ({ page }) => {
  test.setTimeout(180_000);
  await setUp(page, 'lpn', 60_000);
  await goTo(page, 'launchpad');
  await page.getByTestId('tab-create').click();
  await page.getByTestId('lp-name').fill('Bitcoin Pals');
  await page.getByTestId('lp-ticker').fill('BPLS');
  await expect(page.getByTestId('lp-check')).toBeVisible();
  await expect(page.getByTestId('lp-check').locator('p')).toHaveCount(3);
  await expect(page.getByTestId('lp-launch')).toBeDisabled();
});

test('the Launchpad reads in French: the tabs, the create form and a token page', async ({ page }) => {
  test.setTimeout(240_000);
  await setUp(page, 'lpf', 60_000);
  const ticker = randomTicker();
  await launch(page, ticker, '0');
  // the language is the game's own setting: switched in Settings, saved in tg-prefs
  await goTo(page, 'settings');
  await page.getByTestId('settings-lang-fr').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await goTo(page, 'launchpad');
  await expect(page.getByTestId('tab-new')).toContainText('Nouveaux');
  await expect(page.getByTestId('tab-create')).toContainText('Créer');
  await page.getByTestId('tab-create').click();
  await expect(page.getByTestId('lp-create')).toContainText('Lancer un jeton');
  await page.getByTestId('tab-new').click();
  await page.getByTestId(`lp-open-${ticker}`).click({ timeout: 20_000 });
  await expect(page.getByTestId('lp-token-page')).toContainText('Acheter');
  await expect(page.getByTestId('lp-token-page')).toContainText('Courbe jusqu’au diplôme');
  await expect(page.getByTestId('lp-token-page')).toContainText('Bande publique');
});
