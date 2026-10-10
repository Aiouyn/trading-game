import { expect, test } from '@playwright/test';
import { goTo, isPhone, noHorizontalOverflow, proof, register, skipTips, watchErrors } from './helpers';

// The Shops tab of the Businesses app (Phase 4 stage C, DECISIONS S2). A lever shows at once; a price waits for the
// next game day, so these tests cross a day boundary with the admin advance (one game day is 720 ticks, and the
// day step runs on tick 721, 1441, ...). Days move the shared world, so the tests run one after the other.
test.describe.configure({ mode: 'serial' });

/** The id of the first owned shop, read from the player view the page already holds. */
async function shopId(page: import('@playwright/test').Page): Promise<string> {
  const id = await page.evaluate(() => window.__tg!.state().me?.shops[0]?.id ?? null);
  if (!id) throw new Error('no shop in the player view');
  return id;
}

/** The shop's day numbers as the server sent them in the player view (the card formats the same numbers). */
async function shopNumbers(page: import('@playwright/test').Page, id: string) {
  return page.evaluate((sid) => {
    const s = window.__tg!.state().me?.shops.find((x) => x.id === sid);
    if (!s) return null;
    return { price: s.settings.price, revenue: s.daily.revenue, costs: s.daily.costs, net: s.daily.net, demand: s.demand };
  }, id);
}

/** Advances the world to the next game day's first tick (the day step runs on tick 721, 1441, ...). */
async function nextGameDay(page: import('@playwright/test').Page): Promise<void> {
  const tick = await page.evaluate(() => window.__tg!.state().frame?.tick ?? 0);
  const next = (Math.floor((tick - 1) / 720) + 1) * 720 + 1;
  await page.evaluate((n) => window.__tg!.advance(n), next - tick);
}

async function buyFoodCart(page: import('@playwright/test').Page): Promise<string> {
  await goTo(page, 'empire');
  await page.getByTestId('tab-buy').click();
  await page.getByTestId('buy-biz-food.street-food-cart').click();
  await expect(page.getByTestId('empire-income')).not.toContainText('$0.00', { timeout: 10_000 });
  return shopId(page);
}

test('a lever shows at once, a price waits for the next game day, and a second price change that day is refused', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => { window.__tgE2eAdmin = 'e2e-admin'; });
  await register(page);
  await skipTips(page);
  const id = await buyFoodCart(page);

  await page.getByTestId('tab-shops').click();
  const card = page.getByTestId(`shop-${id}`);
  await expect(card).toBeVisible();
  await noHorizontalOverflow(page);
  await proof(page, 'shops-card');

  // a crew change is in place at once
  await page.getByTestId(`shop-${id}-crew-1.25`).click();
  await expect(page.getByTestId(`shop-${id}-crew-1.25`)).toHaveAttribute('aria-checked', 'true', { timeout: 5_000 });

  // a price set today is pending: the price now still reads 1.00x, and the note says the day it takes effect
  await page.getByTestId(`shop-${id}-price-1.2`).click();
  await expect(page.getByTestId(`shop-${id}-price-pending`)).toContainText('1.20x', { timeout: 5_000 });
  await expect(page.getByTestId(`shop-${id}-price-now`)).toContainText('1.00x');
  const today = await shopNumbers(page, id);
  expect(today).not.toBeNull();

  // re-picking the price already set today sends nothing: no refusal, and the pending note stays
  await page.getByTestId(`shop-${id}-price-1.2`).click();
  await expect(page.getByTestId(`shop-${id}-refusal`)).toHaveCount(0);
  await expect(page.getByTestId(`shop-${id}-price-pending`)).toContainText('1.20x');

  // a second price change on the same game day is refused, with its three-part copy inline
  await page.getByTestId(`shop-${id}-price-1.1`).click();
  const refusal = page.getByTestId(`shop-${id}-refusal`);
  await expect(refusal).toHaveAttribute('data-code', 'biz.price.once-a-day', { timeout: 5_000 });
  await expect(refusal).toContainText('already changed today');
  await expect(refusal).toContainText('day');
  await proof(page, 'shops-refused');

  // the next game day: the price is in effect and nothing is pending. The price moves revenue and not the costs,
  // and the net is the revenue plus the costs (the server's signed lines). Crossing the day is the admin advance:
  // the rank-up idle hook (e2e.idle) only backdates the ceremony clock and cannot move the world's day.
  await nextGameDay(page);
  await expect(page.getByTestId(`shop-${id}-price-now`)).toContainText('1.20x', { timeout: 25_000 });
  await expect(page.getByTestId(`shop-${id}-price-pending`)).toHaveCount(0);
  const next = await shopNumbers(page, id);
  expect(next).not.toBeNull();
  expect(next!.price).toBe(1.2);
  expect(next!.costs).toBeCloseTo(today!.costs, 6);
  expect(next!.revenue).not.toBeCloseTo(today!.revenue, 6);
  expect(next!.net).toBeCloseTo(next!.revenue + next!.costs, 6);
  await noHorizontalOverflow(page);

  // the price can be set again now that the day has changed
  await page.getByTestId(`shop-${id}-price-1`).click();
  await expect(page.getByTestId(`shop-${id}-price-pending`)).toContainText('1.00x', { timeout: 5_000 });
  // a change that is taken clears the refusal shown above it
  await expect(page.getByTestId(`shop-${id}-refusal`)).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('a manager is hired with its prepay shown, and letting go before the term refuses with its copy', async ({ page }) => {
  const errors = watchErrors(page);
  await register(page);
  await skipTips(page);
  const id = await buyFoodCart(page);
  await page.getByTestId('tab-shops').click();

  await expect(page.getByTestId(`shop-${id}-hire-1`)).toBeVisible();
  await page.getByTestId(`shop-${id}-hire-1`).click();
  await expect(page.getByTestId(`shop-${id}-fire`)).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId(`shop-${id}-manager`)).toContainText('forfeits');

  // the manager keeps maintenance on: Off is locked and the card says why
  await expect(page.getByTestId(`shop-${id}-maintain-on`)).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId(`shop-${id}-maintain-off`)).toBeDisabled();
  await expect(page.getByTestId(`shop-${id}-maintain-managed`)).toBeVisible();

  // a price above the manager's cap says where it drops to on the next game day
  await page.getByTestId(`shop-${id}-price-1.2`).click();
  await expect(page.getByTestId(`shop-${id}-price-capped`)).toContainText('1.05x', { timeout: 5_000 });

  // a new hire has a minimum term: the fire is refused until the term is up, and the copy says from which day
  await page.getByTestId(`shop-${id}-fire`).click();
  await page.getByTestId(`shop-${id}-fire-yes`).click();
  const refusal = page.getByTestId(`shop-${id}-refusal`);
  await expect(refusal).toHaveAttribute('data-code', 'biz.manager.tenure', { timeout: 5_000 });
  await expect(refusal).toContainText('day');
  await noHorizontalOverflow(page);
  await proof(page, 'shops-manager');

  expect(errors).toEqual([]);
});

test('a bulk change reaches every shop in the sector, and a refused price is tallied with its copy', async ({ page }) => {
  const errors = watchErrors(page);
  await register(page);
  await skipTips(page);
  const id = await buyFoodCart(page);
  await page.getByTestId('tab-shops').click();
  await expect(page.getByTestId('shops-bulk')).toBeVisible();

  // quality for every shop: applied to the one shop, which then shows the new level
  await page.getByTestId('shops-bulk-quality').selectOption('1');
  await page.getByTestId('shops-bulk-apply').click();
  await expect(page.getByTestId('shops-bulk-done')).toContainText('Applied to 1 of 1', { timeout: 5_000 });
  await expect(page.getByTestId(`shop-${id}-quality-1`)).toHaveAttribute('aria-checked', 'true', { timeout: 5_000 });

  // a price for the sector: applied, then the same sector again on the same day is refused and tallied
  await page.getByTestId('shops-bulk-price').selectOption('1.1');
  await page.getByTestId('shops-bulk-apply').click();
  await expect(page.getByTestId('shops-bulk-done')).toContainText('Applied to 1 of 1', { timeout: 5_000 });
  await page.getByTestId('shops-bulk-price').selectOption('1.2');
  await page.getByTestId('shops-bulk-apply').click();
  await expect(page.getByTestId('shops-bulk-done')).toContainText('Applied to 0 of 1', { timeout: 5_000 });
  const refused = page.getByTestId('shops-bulk-refusal-biz.price.once-a-day');
  await expect(refused).toBeVisible();
  await expect(refused).toContainText('already changed today');
  await noHorizontalOverflow(page);
  if (!isPhone(page)) await proof(page, 'shops-bulk');

  expect(errors).toEqual([]);
});

// The Shops tab must fit the Businesses window at its minimum size (420 x 300, src/shell/apps.ts): the south-east
// corner is dragged far up and left, and the tab's body must not scroll sideways there.
test('the shops tab fits the minimum window without a sideways scroll', async ({ page }) => {
  test.skip(isPhone(page), 'phone apps are full screen');
  await register(page);
  await skipTips(page);
  await buyFoodCart(page);
  await page.getByTestId('tab-shops').click();
  const win = page.getByTestId('win-businesses');
  const handle = page.getByTestId('win-businesses-resize-se');
  const box = await handle.boundingBox();
  if (!box) throw new Error('no resize handle for the businesses window');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 900, box.y - 900, { steps: 12 });
  await page.mouse.up();
  const size = await win.boundingBox();
  expect(size!.width).toBeLessThanOrEqual(430);
  const overflow = await win.evaluate((el) => {
    const body = el.querySelector('.os-win-body');
    return body ? body.scrollWidth - body.clientWidth : 0;
  });
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.getByTestId('shops-view')).toBeVisible();
});
