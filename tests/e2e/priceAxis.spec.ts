import { expect, test, type Locator } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { boot, onlyIn } from './shell/support';

/**
 * The Broker chart's price and time scales take the mouse as TradingView does: a press and drag on the right price axis
 * scales the price range (drag up stretches the candles, which narrows the range), a wheel step over the axis zooms it, and a
 * double-click on the axis puts it back on auto. A manual scale holds when new ticks arrive. The chart host carries the
 * scale's state for the check (data-price-auto, data-price-from, data-price-to), written after each placement.
 */

const SHOTS = process.env.AXIS_SHOTS ?? 'test-results/price-axis';

type Scale = { auto: string; from: number; to: number };

async function scale(chart: Locator): Promise<Scale> {
  return chart.evaluate((el) => {
    const d = (el as HTMLElement).dataset;
    return { auto: d.priceAuto ?? '', from: Number(d.priceFrom), to: Number(d.priceTo) };
  });
}

/** A point on the right price axis, at the middle of the plot's height: the axis is the strip at the chart's right edge. */
async function axisPoint(chart: Locator): Promise<{ x: number; y: number }> {
  const b = await chart.boundingBox();
  if (!b) throw new Error('the price chart is not drawn');
  return { x: b.x + b.width - 14, y: b.y + b.height / 2 };
}

test.describe('Broker chart price axis (TradingView scale gestures)', () => {
  test('a drag on the price axis zooms the scale, a wheel step zooms it again, and a double-click restores auto', async ({ page }) => {
    onlyIn('desktop');
    await page.setViewportSize({ width: 1440, height: 900 });
    mkdirSync(SHOTS, { recursive: true });
    await boot(page);
    const chart = page.getByTestId('price-chart').first();
    await expect(chart).toBeVisible();
    // the first placement after the history loads: the scale follows the data
    await expect.poll(async () => (await scale(chart)).from, { timeout: 30_000 }).not.toBe(0);
    const start = await scale(chart);
    expect(start.auto).toBe('true');
    const startSpan = start.to - start.from;
    expect(startSpan).toBeGreaterThan(0);
    await page.screenshot({ path: `${SHOTS}/chart-1440x900-before.png` });

    // a press and drag up on the axis: the range narrows (the candles stretch) and the scale is manual
    const at = await axisPoint(chart);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x, at.y - 60, { steps: 6 });
    await page.mouse.move(at.x, at.y - 150, { steps: 10 });
    await page.mouse.up();
    const dragged = await scale(chart);
    expect(dragged.auto, 'a drag takes the scale off auto').toBe('false');
    expect(dragged.to - dragged.from, 'a drag up narrows the visible range').toBeLessThan(startSpan * 0.9);
    await page.screenshot({ path: `${SHOTS}/chart-1440x900-after-drag.png` });

    // a manual scale does not follow new ticks (the world ticks every second in e2e): the range holds for a few ticks
    await page.waitForTimeout(3500);
    const held = await scale(chart);
    expect(held.auto, 'new ticks keep the scale manual').toBe('false');
    expect(held.from, 'new ticks do not snap the low end back').toBe(dragged.from);
    expect(held.to, 'new ticks do not snap the high end back').toBe(dragged.to);

    // a wheel step up over the axis zooms the price scale in (the range narrows again), and the scale stays manual
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(0, -200);
    await expect.poll(async () => {
      const s = await scale(chart);
      return s.to - s.from;
    }).toBeLessThan(dragged.to - dragged.from);
    const wheeled = await scale(chart);
    expect(wheeled.auto).toBe('false');

    // a double-click on the axis resets the scale to auto
    await page.mouse.dblclick(at.x, at.y);
    await expect.poll(async () => (await scale(chart)).auto, { timeout: 5_000 }).toBe('true');
    const reset = await scale(chart);
    expect(reset.to - reset.from, 'the reset shows the auto range again').toBeGreaterThan(wheeled.to - wheeled.from);
    await page.screenshot({ path: `${SHOTS}/chart-1440x900-after-reset.png` });
  });

  test('in percent mode the axis stays on auto: a drag or a wheel step on it does not take the scale off auto', async ({ page }) => {
    onlyIn('desktop');
    await page.setViewportSize({ width: 1440, height: 900 });
    await boot(page);
    const chart = page.getByTestId('price-chart').first();
    await expect.poll(async () => (await scale(chart)).from, { timeout: 30_000 }).not.toBe(0);
    await page.getByTestId('pct-axis').click();
    await expect(page.getByTestId('pct-axis')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await scale(chart)).auto).toBe('true');

    // the percent scale is not dragged (the library keeps it on auto), and a wheel step over it is not a time zoom either
    const at = await axisPoint(chart);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x, at.y - 120, { steps: 8 });
    await page.mouse.up();
    expect((await scale(chart)).auto, 'a drag in percent mode keeps auto').toBe('true');
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(0, -200);
    expect((await scale(chart)).auto, 'a wheel step in percent mode keeps auto').toBe('true');
    await page.screenshot({ path: `${SHOTS}/chart-1440x900-percent.png` });
    await page.getByTestId('pct-axis').click();
  });

  test('the price scale stays on its own axis: a drag on the plot still scrolls time and leaves the price scale alone', async ({ page }) => {
    onlyIn('desktop');
    await page.setViewportSize({ width: 1440, height: 900 });
    await boot(page);
    const chart = page.getByTestId('price-chart').first();
    await expect.poll(async () => (await scale(chart)).from, { timeout: 30_000 }).not.toBe(0);
    const before = await scale(chart);
    const b = await chart.boundingBox();
    if (!b) throw new Error('the price chart is not drawn');
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 3;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 120, cy, { steps: 8 });
    await page.mouse.up();
    const after = await scale(chart);
    expect(after.auto, 'a plot drag does not change the price scale mode').toBe(before.auto);
  });
});
