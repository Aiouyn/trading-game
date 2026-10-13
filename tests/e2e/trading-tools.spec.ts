import { expect, test, type Page } from '@playwright/test';
import { ADMIN, goTo, grant, register, watchErrors } from './helpers';
import { frame } from './shell/support';

// Phase 3 B3 (Broker trading tools): keyboard trading, recurring buys, DRIP. Desktop only: keyboard trading is off on
// touch screens, and the DRIP toggle and plans are covered by the unit tests on the phone.

type TgState = { me: { orders: unknown[]; trading?: { fills: { reason: string }[]; plans?: { drip: string[] } | null } } | null };
type TgWindow = { __tg: { state: () => TgState; advance: (n: number) => Promise<number | null> } };

async function orderCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as TgWindow).__tg.state().me?.orders.length ?? 0);
}

async function fillReasons(page: Page): Promise<string[]> {
  return page.evaluate(() => ((window as unknown as TgWindow).__tg.state().me?.trading?.fills ?? []).map((f) => f.reason));
}

/** The ticker the Broker shows, read from its chart header. */
async function shownTicker(page: Page): Promise<string> {
  return (await page.getByTestId('chart-ticker').first().textContent())?.trim() ?? '';
}

/** A one-unit market order from the keyboard: B, 1, then Enter twice (the confirm, then the send). */
async function keyboardBuyOne(page: Page): Promise<void> {
  await page.getByTestId('order-qty').fill('1');
  await page.getByTestId('chart-ticker').first().click(); // focus leaves the field and stays in the window
  await page.keyboard.press('KeyB');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
}

test.describe('keyboard trading, recurring buys and DRIP (Phase 3 B3)', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop keyboard trading');

  test('a keyboard order asks for a second Enter before it is sent, and Escape cancels the confirm', async ({ page }) => {
    const errors = watchErrors(page);
    const handle = await register(page, 'kb');
    await grant(handle, 50_000);
    await goTo(page, 'market');
    const before = await orderCount(page);

    await page.getByTestId('order-qty').fill('1');
    await page.getByTestId('chart-ticker').first().click();
    await page.keyboard.press('KeyS');
    await page.keyboard.press('KeyB');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('order-confirm')).toBeVisible();
    expect(await orderCount(page)).toBe(before);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('order-confirm')).toHaveCount(0);
    expect(await orderCount(page)).toBe(before);

    await page.keyboard.press('Enter');
    await expect(page.getByTestId('order-confirm')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect.poll(() => orderCount(page)).toBe(before + 1);
    expect(errors).toEqual([]);
  });

  test('Enter in the asset search belongs to the search: it arms no confirm and sends nothing', async ({ page }) => {
    const handle = await register(page, 'ksearch');
    await grant(handle, 50_000);
    await goTo(page, 'market');
    const before = await orderCount(page);
    await page.getByTestId('order-qty').fill('1');
    await page.getByTestId('asset-search').first().click();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('order-confirm')).toHaveCount(0);
    expect(await orderCount(page)).toBe(before);
  });

  test('digits typed into the quantity field stay in the field and place nothing', async ({ page }) => {
    await register(page, 'kt');
    await goTo(page, 'market');
    const before = await orderCount(page);
    await page.getByTestId('order-qty').click();
    await page.keyboard.type('12');
    await expect(page.getByTestId('order-qty')).toHaveValue('12');
    await expect(page.getByTestId('order-confirm')).toHaveCount(0);
    expect(await orderCount(page)).toBe(before);
  });

  test('a recurring buy places its order once the interval has passed', async ({ page }) => {
    await page.addInitScript((admin) => { (window as unknown as { __tgE2eAdmin: string }).__tgE2eAdmin = admin; }, ADMIN);
    const handle = await register(page, 'rb');
    await grant(handle, 50_000);
    await goTo(page, 'market');
    // the plans card sits in the Broker's Asset tab (the dock)
    await page.getByTestId('dock-tab-asset').click();

    const plans = page.getByTestId('plans-card');
    await plans.getByTestId('plan-recurring-dollars').fill('5000');
    await plans.getByTestId('plan-recurring-days').fill('1');
    await plans.getByTestId('plan-recurring-add').click();
    await expect(plans.getByTestId(/recurring-r\d+/).first()).toBeVisible();
    expect(await fillReasons(page)).not.toContain('recurring_buy');

    // one game day (720 ticks) and a little more, so the day boundary that runs the plan has passed
    await page.evaluate(() => (window as unknown as TgWindow).__tg.advance(725));
    await expect.poll(() => fillReasons(page), { timeout: 30_000 }).toContain('recurring_buy');
  });

  test('DRIP is an opt-in per position, and it survives a reload', async ({ page }) => {
    const handle = await register(page, 'dr');
    await grant(handle, 50_000);
    await goTo(page, 'market');
    const ticker = await shownTicker(page);
    await keyboardBuyOne(page);
    await expect.poll(() => orderCount(page)).toBeGreaterThan(0);

    await goTo(page, 'portfolio');
    // the Portfolio window's own positions (the Broker's dock lists the same positions with the same toggle)
    const drip = frame(page, 'portfolio').getByTestId(`drip-${ticker}`);
    await expect(drip).toBeVisible({ timeout: 20_000 });
    await expect(drip).toHaveAttribute('aria-pressed', 'false');
    await drip.click();
    await expect(drip).toHaveAttribute('aria-pressed', 'true');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-game', 'ready', { timeout: 30_000 });
    await goTo(page, 'portfolio');
    await expect(frame(page, 'portfolio').getByTestId(`drip-${ticker}`)).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 });
  });
});
