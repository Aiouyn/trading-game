import { expect, test, type Locator } from '@playwright/test';
import { boot, onlyIn } from './shell/support';

/**
 * The position tools on the Broker chart (R-10-5): the long position tool is placed with Alt+L and a click, its risk panel sizes
 * the quantity from the stop distance, and the market entry goes out as a bracket: the target and the stop are the engine's
 * legs, and they appear in Open orders once the entry fills. The order lines on the chart then move the real orders: a drag of the
 * take-profit line changes the order's price, and the position line closes the position.
 */

async function plotPoint(chart: Locator, fx: number, fy: number): Promise<{ x: number; y: number }> {
  const b = await chart.boundingBox();
  if (!b) throw new Error('the price chart is not drawn');
  return { x: b.x + b.width * fx, y: b.y + b.height * fy };
}

test.describe('Broker chart position tools and order lines', () => {
  test('a long position tool places a market entry as a bracket: the target and stop appear in Open orders', async ({ page }) => {
    onlyIn('desktop');
    await page.setViewportSize({ width: 1440, height: 900 });
    await boot(page);
    const chart = page.getByTestId('price-chart').first();
    await expect.poll(async () => Number((await chart.getAttribute('data-candles')) ?? 0), { timeout: 30_000 }).toBeGreaterThan(0);
    await chart.hover();
    await page.keyboard.press('Alt+l');
    await expect(page.getByTestId('drawing-layer')).toHaveAttribute('data-tool', 'long');
    const at = await plotPoint(chart, 0.5, 0.5);
    await page.mouse.click(at.x, at.y);
    await expect(page.getByTestId('drawing-layer')).toHaveAttribute('data-tool', 'cursor');
    await expect(page.getByTestId('position-panel')).toBeVisible();
    await page.screenshot({ path: `${process.env.CHART_SHOTS ?? 'test-results/chart-position'}/position-tool.png` });

    // the risk sizes the quantity: $50 at the default stop distance is a positive, whole-step quantity; the percent follows the dollars
    await page.getByTestId('position-risk-usd').fill('5');
    await expect.poll(async () => Number((await page.getByTestId('position-qty').textContent())?.replace(/,/g, '') ?? 0)).toBeGreaterThan(0);
    await expect(page.getByTestId('position-risk-pct')).not.toHaveValue('');
    await expect(page.getByTestId('position-rr')).toHaveText(/2/);

    // a market entry, placed: the bracket goes with it
    await page.getByTestId('position-entry-market').click();
    await page.getByTestId('position-place').click();
    await expect(page.getByTestId('position-place')).toBeEnabled({ timeout: 15_000 });
    // once the entry fills, the target and the stop are working orders: two bracket legs in Open orders
    await page.getByTestId('dock-tab-orders').click();
    await expect.poll(() => page.getByTestId('dock-panel-orders').locator('li[data-testid^="order-"]').count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
    await page.screenshot({ path: `${process.env.CHART_SHOTS ?? 'test-results/chart-position'}/bracket-open-orders.png` });
  });

  test('a drag of the take-profit line moves the real order, and the position line closes the position', async ({ page }) => {
    onlyIn('desktop');
    await page.setViewportSize({ width: 1440, height: 900 });
    await boot(page);
    const chart = page.getByTestId('price-chart').first();
    await expect.poll(async () => Number((await chart.getAttribute('data-candles')) ?? 0), { timeout: 30_000 }).toBeGreaterThan(0);
    // a position bought at the market with a one-share order, then its target line
    await page.getByTestId('order-qty').fill('1');
    await page.getByTestId('order-submit').click();
    await expect(page.getByTestId('positions')).toBeVisible({ timeout: 30_000 });
    await chart.hover();
    await page.keyboard.press('Alt+l');
    const at = await plotPoint(chart, 0.5, 0.5);
    await page.mouse.click(at.x, at.y);
    await page.getByTestId('position-risk-usd').fill('5');
    await page.getByTestId('position-entry-market').click();
    await page.getByTestId('position-place').click();
    const tp = page.locator('[data-testid^="level-tp-"]').first();
    await expect(tp).toBeVisible({ timeout: 45_000 });
    const before = (await tp.textContent()) ?? '';
    // the pill drags up the chart: a higher target, which is always a valid take-profit for a long
    const box = await tp.boundingBox();
    if (!box) throw new Error('the take-profit line is not drawn');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 10, { steps: 6 });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 20, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(1500);
    await expect.poll(async () => (await tp.textContent()) ?? '', { timeout: 15_000 }).not.toBe(before);
    await page.screenshot({ path: `${process.env.CHART_SHOTS ?? 'test-results/chart-position'}/tp-dragged.png` });

    // the position line's close button sends a reduce-only market order for the whole position
    await page.getByTestId('level-close').first().click();
    // the position is gone: its line and its close button go with it
    await expect(page.getByTestId('level-close')).toHaveCount(0, { timeout: 30_000 });
  });
});
