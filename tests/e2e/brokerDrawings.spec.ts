import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { boot, onlyIn } from './shell/support';

/**
 * The Broker chart's drawings (R-10-5): a tool is picked from the left toolbar (or its Alt key), placed with clicks on the plot,
 * selected by a press on it, moved by a drag, deleted with the Delete key, and kept on the server: a drawing made before a reload
 * is on the chart after it. The drawing layer marks its tool and each shape carries its kind, so the checks read the page itself.
 */

const SHOTS = process.env.CHART_SHOTS ?? 'test-results/chart-drawings';

/** A point inside the plot, as fractions of the chart's box (the plot starts at the top left of the host). */
async function at(chart: Locator, fx: number, fy: number): Promise<{ x: number; y: number }> {
  const b = await chart.boundingBox();
  if (!b) throw new Error('the price chart is not drawn');
  return { x: b.x + b.width * fx, y: b.y + b.height * fy };
}

async function drawingsOf(page: Page, kind: string): Promise<number> {
  return page.locator(`[data-testid^="drawing-"][data-kind="${kind}"]`).count();
}

/** The first line of a drawing: its start x, so a move shows as a change of that number. */
async function firstX(page: Page, id: string): Promise<number> {
  return Number(await page.getByTestId(`drawing-${id}`).locator('line').first().getAttribute('x1'));
}

test.describe('Broker chart drawings', () => {
  test('a trend line is drawn, moved, deleted, and comes back after a reload', async ({ page }) => {
    onlyIn('desktop');
    await page.setViewportSize({ width: 1440, height: 900 });
    mkdirSync(SHOTS, { recursive: true });
    await boot(page);
    const chart = page.getByTestId('price-chart').first();
    await expect(chart).toBeVisible();
    await expect.poll(async () => Number((await chart.getAttribute('data-candles')) ?? 0), { timeout: 30_000 }).toBeGreaterThan(0);
    const layer = page.getByTestId('drawing-layer');

    // the toolbar: the lines group's default is the trend line, and it picks the tool for one drawing
    await page.getByTestId('tool-group-lines').click();
    await expect(layer).toHaveAttribute('data-tool', 'trend');
    const a = await at(chart, 0.3, 0.35);
    const b = await at(chart, 0.6, 0.5);
    await page.mouse.click(a.x, a.y);
    await page.mouse.click(b.x, b.y);
    await expect(layer).toHaveAttribute('data-tool', 'cursor');
    await expect.poll(() => drawingsOf(page, 'trend')).toBe(1);
    await expect(page.getByTestId('drawing-d1')).toHaveAttribute('data-selected', 'true');
    await page.screenshot({ path: `${SHOTS}/trend-drawn.png` });

    // a press on the line selects it, and a drag moves it: its start x changes by the drag
    const before = await firstX(page, 'd1');
    const mid = await at(chart, 0.45, 0.425);
    await page.mouse.move(mid.x, mid.y);
    await page.mouse.down();
    await page.mouse.move(mid.x + 30, mid.y + 10, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => firstX(page, 'd1')).toBeGreaterThan(before + 10);

    // the Delete key removes the selected drawing
    await page.keyboard.press('Delete');
    await expect.poll(() => drawingsOf(page, 'trend')).toBe(0);

    // a horizontal line is drawn with Alt+H and survives a reload
    await page.mouse.move(mid.x, mid.y);
    await page.keyboard.press('Alt+h');
    await expect(layer).toHaveAttribute('data-tool', 'hline');
    await page.mouse.click(mid.x, mid.y);
    await expect.poll(() => drawingsOf(page, 'hline')).toBe(1);
    // the save goes out after a short pause; the reload reads the server's copy
    await page.waitForTimeout(1500);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-game', 'ready', { timeout: 30_000 });
    const chart2 = page.getByTestId('price-chart').first();
    await expect(chart2).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => drawingsOf(page, 'hline'), { timeout: 30_000 }).toBe(1);
    await page.screenshot({ path: `${SHOTS}/hline-after-reload.png` });
  });

  test('the cursor tool leaves the chart free: a press on empty plot still reaches the chart', async ({ page }) => {
    onlyIn('desktop');
    await page.setViewportSize({ width: 1440, height: 900 });
    await boot(page);
    const chart = page.getByTestId('price-chart').first();
    await expect.poll(async () => Number((await chart.getAttribute('data-candles')) ?? 0), { timeout: 30_000 }).toBeGreaterThan(0);
    const layer = page.getByTestId('drawing-layer');
    await expect(layer).toHaveCSS('pointer-events', 'none');
    const p = await at(chart, 0.5, 0.5);
    await page.mouse.click(p.x, p.y);
    await expect.poll(() => drawingsOf(page, 'trend')).toBe(0);
  });
});
