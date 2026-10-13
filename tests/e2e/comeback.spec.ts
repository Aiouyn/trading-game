import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { advanceWorld, ageAccount, clearSheets, goTo, isPhone, noHorizontalOverflow, register, skipTips, watchErrors } from './helpers';

/** The Portfolio's own card. On the desktop the Broker window draws a copy of the low-cash card too, so the click is scoped to the Portfolio window. */
function portfolioCard(page: Page, id: string) {
  return (isPhone(page) ? page : page.getByTestId('win-portfolio')).getByTestId(id).first();
}

// The comeback (velvet-bankruptcy.md, ROADMAP 2.6) and the sponsor break (velvet-rewarded-ads.md, ROADMAP 2.7) in the app:
// the low-cash card, a sponsor break (a skip after 5 s pays nothing; a full watch pays $250), the chapter screen with its
// 1.2-second hold, and the new chapter. The day-start rule needs a game day to pass, so the spec advances the shared world
// (advanceWorld): it is in the close chain of playwright.config.ts, after the other time-advancing specs.
// Screenshots go to COMEBACK_SHOTS (default test-results/comeback-shots).

const SHOTS = process.env.COMEBACK_SHOTS ?? 'test-results/comeback-shots';
const DAY = 720;

test.describe.configure({ mode: 'serial' });
test.setTimeout(150_000);

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  // the desktop and phone projects share the folder: the file name carries the device
  await page.screenshot({ path: join(SHOTS, `${isPhone(page) ? 'phone' : 'desktop'}-${name}.png`), fullPage: false });
}

/** Takes the player's cash to `cash` with the real donate command (a sink), so the net worth falls under the line. */
async function setCashTo(page: Page, cash: number): Promise<void> {
  await page.evaluate(async (target) => {
    const s = window.__tg!.state();
    const have = s.me?.account?.cash ?? 0;
    if (have > target) await s.act({ type: 'donate', amount: have - target, cause: 'e2e' }, { silent: true });
  }, cash);
  await expect.poll(() => page.evaluate(() => window.__tg!.state().me?.comeback?.netWorth ?? 0), { timeout: 30_000 }).toBeLessThan(1000);
}

/** A new player with an account older than a real day, the cash under the line, and a game day gone by (the day-start cash). */
async function lowCashPlayer(page: Page, prefix: string): Promise<string> {
  const handle = await register(page, prefix);
  await ageAccount(handle, 25 * DAY);
  await skipTips(page).catch(() => undefined);
  await setCashTo(page, 750);
  await advanceWorld(DAY + 1);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-game', 'ready', { timeout: 30_000 });
  return handle;
}

test('the low-cash card, a sponsor break, and the fresh start', async ({ page }) => {
  const errors = watchErrors(page);
  await lowCashPlayer(page, 'cbe');
  await clearSheets(page);
  await goTo(page, 'portfolio');
  await expect(page.getByTestId('lowcash-card').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('lowcash-ad').first()).toBeVisible();
  await shot(page, 'en-1-lowcash-card');
  await noHorizontalOverflow(page);

  // a skip after five seconds: the card runs, the skip is off until then, and no cash is paid
  const cashBefore = await page.evaluate(() => window.__tg!.state().me?.account?.cash ?? 0);
  await page.getByTestId('lowcash-ad').first().click();
  await expect(page.getByTestId('sponsor-break')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('sponsor-brand')).not.toHaveText('');
  await expect(page.getByTestId('sponsor-skip')).toBeDisabled();
  await shot(page, 'en-2a-sponsor-0s');
  await expect(page.getByTestId('sponsor-skip')).toBeEnabled({ timeout: 10_000 });
  await shot(page, 'en-2b-sponsor-5s');
  await page.getByTestId('sponsor-skip').click();
  await expect(page.getByTestId('sponsor-break')).toHaveCount(0, { timeout: 10_000 });
  const cashAfterSkip = await page.evaluate(() => window.__tg!.state().me?.account?.cash ?? 0);
  expect(cashAfterSkip).toBeCloseTo(cashBefore, 2);

  // a full watch: the card runs to fifteen seconds and pays $250 of ad cash, held for 72 hours
  await page.getByTestId('lowcash-ad').first().click();
  await expect(page.getByTestId('sponsor-break')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('sponsor-break')).toHaveCount(0, { timeout: 40_000 });
  await shot(page, 'en-2c-sponsor-done');
  const restricted = await page.evaluate(() => window.__tg!.state().me?.comeback?.restricted.amount ?? 0);
  expect(restricted).toBe(250);
  const pill = page.getByTestId('ad-pill-row');
  await goTo(page, 'bank');
  await expect(pill).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('ad-pill')).toHaveText('AD');
  await shot(page, 'en-3-ad-pill');

  // the fresh start: the net worth is under the line again, the chapter screen opens and the hold confirms it
  await setCashTo(page, 400);
  await goTo(page, 'portfolio');
  await expect(portfolioCard(page, 'lowcash-fresh')).toBeVisible({ timeout: 10_000 });
  await portfolioCard(page, 'lowcash-fresh').click();
  await expect(page.getByTestId('chapter-screen')).toBeVisible();
  await expect(page.getByTestId('chapter-label')).toContainText('CHAPTER 1');
  await expect(page.getByTestId('chapter-peak')).not.toHaveText('');
  await page.getByTestId('perk-lessons').click();
  await expect(page.getByTestId('perk-lessons')).toHaveAttribute('aria-pressed', 'true');
  await shot(page, 'en-4-chapter-screen');
  await noHorizontalOverflow(page);

  // a short press does nothing
  const box = await page.getByTestId('chapter-confirm').boundingBox();
  if (!box) throw new Error('no chapter button');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.up();
  await expect(page.getByTestId('chapter-screen')).toBeVisible();
  await expect(page.getByTestId('chapter-new')).toHaveCount(0);

  // the full hold of 1.2 seconds starts the chapter
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.waitForTimeout(1_600);
  await page.mouse.up();
  await expect(page.getByTestId('chapter-new')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('chapter-new')).toContainText('CHAPTER 2');
  await shot(page, 'en-5-new-chapter');
  await expect.poll(() => page.evaluate(() => window.__tg!.state().me?.comeback?.chapter ?? 0), { timeout: 10_000 }).toBe(2);
  const restrictedAfter = await page.evaluate(() => window.__tg!.state().me?.comeback?.restricted.amount ?? 0);
  expect(restrictedAfter).toBe(5000);
  expect(errors.filter((e) => !/favicon|ResizeObserver/.test(e))).toEqual([]);
});

test('a sponsor break and the low-cash card read in French', async ({ page }) => {
  await lowCashPlayer(page, 'cbf');
  await clearSheets(page);
  await goTo(page, 'profile');
  await page.getByTestId('settings-lang-fr').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await goTo(page, 'portfolio');
  await expect(page.getByText('Il reste peu.').first()).toBeVisible({ timeout: 15_000 });
  await shot(page, 'fr-1-lowcash-card');
  await page.getByTestId('lowcash-ad').first().click();
  await expect(page.getByTestId('sponsor-break')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('sponsor-break')).toContainText('Pause sponsorisée');
  await expect(page.getByTestId('sponsor-skip')).toBeDisabled();
  await shot(page, 'fr-2a-sponsor-0s');
  await expect(page.getByTestId('sponsor-skip')).toBeEnabled({ timeout: 10_000 });
  await shot(page, 'fr-2b-sponsor-5s');
  await page.getByTestId('sponsor-skip').click();
  await expect(page.getByTestId('sponsor-break')).toHaveCount(0, { timeout: 10_000 });
  await shot(page, 'fr-2c-sponsor-done');
  // the chapter screen and the new chapter, in French
  await setCashTo(page, 400);
  await goTo(page, 'portfolio');
  await portfolioCard(page, 'lowcash-fresh').click();
  await expect(page.getByTestId('chapter-screen')).toBeVisible();
  await page.getByTestId('perk-lessons').click();
  await shot(page, 'fr-3-chapter-screen');
  const box = await page.getByTestId('chapter-confirm').boundingBox();
  if (!box) throw new Error('no chapter button');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1_600);
  await page.mouse.up();
  await expect(page.getByTestId('chapter-new')).toBeVisible({ timeout: 10_000 });
  await shot(page, 'fr-4-new-chapter');
  // the phone keeps the same card full width without a sideways scroll
  if (isPhone(page)) await noHorizontalOverflow(page);
});
