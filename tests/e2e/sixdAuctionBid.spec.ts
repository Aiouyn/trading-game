import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { goTo, grant, isPhone, noHorizontalOverflow, openAuctions, register, skipRankUp, skipTips, watchErrors } from './helpers';

// An auction bid on an open lot (6D.2), in the Boutique's Auctions tab. The test checks the minimum and a refusal below it in
// English on a long window (the admin seam opens the week's lots with 600 ticks to run; the e2e world ticks each second), so the
// lot stays open while a slow run takes its screenshots. Then the lots are reopened with 22 ticks to run, right before the
// minimum bid, so that bid lands inside the last 2 real minutes and extends the lot by 24 ticks. Then a French raise. Lots are
// shared by every player in the world, so the desktop and the phone run bid different lots (the first and the second of the
// week's list). This spec runs in the close chain, after every spec that reads the week's lots as ended.

const SHOTS = process.env.E2E_SHOTS ?? 'test-results/shots-p6d2';
const SNIPE_EXTEND = 24;
/** the long window for the checks that run before the bid: 600 ticks, 10 real minutes (the seam allows up to one hour) */
const LONG_WINDOW = 600;
/** the short window the minimum bid lands in: the last 22 ticks, inside the 2-minute snipe window */
const SNIPE_WINDOW = 22;

type Lot = { key: string; itemId: string; status: string; endTick: number; minimum: number | null; high: number | null; bidCount: number };

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  const device = isPhone(page) ? 'phone' : `window${page.viewportSize()?.width ?? 0}`;
  await page.screenshot({ path: `${SHOTS}/${device}-${name}.png` });
}

/** The week's lots in the order the world lists them, read from the page's own state. */
function lots(page: Page): Promise<Lot[]> {
  return page.evaluate(() => ((window.__tg!.state().me?.sixd?.auctions.lots ?? []) as Lot[]));
}

test('an auction bid on an open lot: the refusal below the minimum, the anti-snipe extension, and a raise in French', async ({ page }) => {
  // the bid flow runs at the minimum desktop window (900 x 800) on the desktop project, and at the phone size on the phone
  test.setTimeout(180_000);
  if (!isPhone(page)) await page.setViewportSize({ width: 900, height: 800 });
  const errors = watchErrors(page);
  const handle = await register(page, 'sxb');
  await skipTips(page);
  await grant(handle, 3_000_000_000);
  // the grant lifts the bidder in rank: the rank-up ceremony covers the shell until it is skipped
  await skipRankUp(page);
  await goTo(page, 'estate');
  await page.getByTestId('tab-auctions').click();
  await expect(page.getByTestId('auctions-panel')).toBeVisible();
  const opened = await openAuctions(LONG_WINDOW);
  const idx = isPhone(page) ? 1 : 0;
  // The page reads the seam's open on its next tick. The desktop project runs first in the shared world and opens the same week,
  // so a status of 'open' alone passes on the desktop's lots before this open lands: wait for this open's end tick, then the status.
  await expect.poll(async () => (await lots(page))[idx]?.endTick, { timeout: 20_000 }).toBe(opened.endTick);
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

  // The minimum bid lands in the last 2 real minutes. The long window would not do for it: under load the lot could end before
  // the fill, so the lots are reopened with 22 ticks to run right before the bid. A lot with no bid has no record, so the reopen
  // only moves its open and end ticks (auctionsView reads them from the week's open tick). Its minimum comes from the collectibles
  // index, which moves once a game day, so it is read again here, from the state that shows the reopened end tick, and the bid
  // is placed at once, with no screenshot in between.
  const reopened = await openAuctions(SNIPE_WINDOW);
  await expect.poll(async () => (await lots(page))[idx]?.endTick, { timeout: 20_000 }).toBe(reopened.endTick);
  const short = (await lots(page))[idx]!;
  expect(short.status).toBe('open');
  expect(short.bidCount).toBe(0);
  const minimum = short.minimum!;
  await page.getByTestId(`auction-amount-${id}`).fill(minimum.toFixed(2));
  await page.getByTestId(`auction-submit-${id}`).click();
  await expect.poll(async () => (await lots(page))[idx]!.bidCount, { timeout: 15_000 }).toBe(1);
  // the lot runs 24 ticks longer than the reopened end tick, and the high bid is the bid
  const after = (await lots(page))[idx]!;
  expect(after.endTick).toBe(reopened.endTick + SNIPE_EXTEND);
  expect(after.high).toBe(minimum);
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
