import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { goTo, grant, isPhone, noHorizontalOverflow, openAuctions, register, skipTips, watchErrors } from './helpers';

// An auction bid on an open lot (6D.2), in the Boutique's Auctions tab. The admin seam opens the week's lots with 22 ticks to run
// (the e2e world ticks each second), so a first bid lands inside the last 2 real minutes and extends the lot by 24 ticks. The
// test checks the minimum, a refusal below it in English, the extension, then a French raise. Lots are shared by every player in
// the world, so the desktop and the phone run bid different lots (the first and the second of the week's list). This spec runs
// in the close chain, after every spec that reads the week's lots as ended.

const SHOTS = process.env.E2E_SHOTS ?? 'test-results/shots-p6d2';
const SNIPE_EXTEND = 24;

type Lot = { key: string; itemId: string; status: string; endTick: number; minimum: number | null; high: number | null; bidCount: number };

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${isPhone(page) ? 'phone' : 'window'}-${name}.png` });
}

/** The week's lots in the order the world lists them, read from the page's own state. */
function lots(page: Page): Promise<Lot[]> {
  return page.evaluate(() => ((window.__tg!.state().me?.sixd?.auctions.lots ?? []) as Lot[]));
}

test('an auction bid on an open lot: the refusal below the minimum, the anti-snipe extension, and a raise in French', async ({ page }) => {
  const errors = watchErrors(page);
  const handle = await register(page, 'sxb');
  await skipTips(page);
  await grant(handle, 3_000_000_000);
  await goTo(page, 'estate');
  await page.getByTestId('tab-auctions').click();
  await expect(page.getByTestId('auctions-panel')).toBeVisible();
  await openAuctions(22);
  const idx = isPhone(page) ? 1 : 0;
  await expect.poll(async () => (await lots(page))[idx]?.status, { timeout: 20_000 }).toBe('open');
  const lot = (await lots(page))[idx]!;
  const id = lot.itemId;
  expect(lot.minimum).not.toBeNull();
  const min = lot.minimum!;
  await expect(page.getByTestId(`auction-min-${id}`)).toBeVisible();
  await shot(page, 'auction-open-en');

  // English: a bid under the minimum is refused in three parts, and the lot takes nothing
  await page.getByTestId(`auction-amount-${id}`).fill((min / 2).toFixed(2));
  await page.getByTestId(`auction-submit-${id}`).click();
  await expect(page.getByTestId(`auction-refusal-${id}`)).toBeVisible();
  await expect.poll(async () => (await lots(page))[idx]!.bidCount).toBe(0);
  await shot(page, 'auction-refusal-en');

  // the minimum bid lands in the last 2 real minutes: the lot runs 24 ticks longer, and the high bid is the bid
  const before = lot.endTick;
  await page.getByTestId(`auction-amount-${id}`).fill(min.toFixed(2));
  await page.getByTestId(`auction-submit-${id}`).click();
  await expect.poll(async () => (await lots(page))[idx]!.bidCount, { timeout: 15_000 }).toBe(1);
  const after = (await lots(page))[idx]!;
  expect(after.endTick).toBe(before + SNIPE_EXTEND);
  expect(after.high).toBe(min);
  await expect(page.getByTestId(`auction-count-${id}`)).toHaveText('1');
  await shot(page, 'auction-bid-en');
  await noHorizontalOverflow(page);

  // French: the same lot in French, and a raise at the new minimum (2% over the high bid)
  await goTo(page, 'profile');
  await page.getByTestId('settings-lang-fr').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await goTo(page, 'estate');
  await page.getByTestId('tab-auctions').click();
  await expect(page.getByTestId(`auction-status-${id}`)).toHaveText('En cours');
  await expect(page.getByTestId(`auction-high-${id}`)).not.toHaveText('—');
  const next = (await lots(page))[idx]!;
  expect(next.minimum).not.toBeNull();
  await page.getByTestId(`auction-amount-${id}`).fill(next.minimum!.toFixed(2));
  await page.getByTestId(`auction-submit-${id}`).click();
  await expect.poll(async () => (await lots(page))[idx]!.bidCount, { timeout: 15_000 }).toBe(2);
  await shot(page, 'auction-bid-fr');
  await noHorizontalOverflow(page);
  expect(errors).toEqual([]);
});
