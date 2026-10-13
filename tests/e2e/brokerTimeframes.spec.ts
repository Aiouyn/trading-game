import { expect, test, type Locator } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { boot, onlyIn } from './shell/support';

/**
 * The Broker chart's timeframes (R-10-5): eleven candle sizes from 1m to 1M, each built from the game's ticks or daily bars and
 * independent of the range. A range preset (1D, 1W, 1M, 1Y, ALL) only moves the visible window. The bottom-right switches set
 * auto, log and percent. Escape closes the indicators menu, and the press that closes it still reaches what it hit.
 * The chart host carries the candle size, the candle count, the visible window and the price scale mode for these checks.
 */

const SHOTS = process.env.CHART_SHOTS ?? 'test-results/chart-timeframes';
const SIZES = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1D', '1W', '1M'] as const;

async function candles(chart: Locator): Promise<number> {
  return Number((await chart.getAttribute('data-candles')) ?? 0);
}

async function windowWidth(chart: Locator): Promise<number> {
  const from = Number(await chart.getAttribute('data-view-from'));
  const to = Number(await chart.getAttribute('data-view-to'));
  return to - from;
}

test.describe('Broker chart timeframes and scale switches', () => {
  test('eleven candle sizes draw from the history, a range only moves the view, and the switches set the scale', async ({ page }) => {
    onlyIn('desktop');
    await page.setViewportSize({ width: 1440, height: 900 });
    mkdirSync(SHOTS, { recursive: true });
    await boot(page);
    const chart = page.getByTestId('price-chart').first();
    await expect(chart).toBeVisible();
    await expect.poll(() => candles(chart), { timeout: 30_000 }).toBeGreaterThan(0);

    // every size is offered on every range (the list does not depend on the range)
    await page.getByTestId('range-1M').click();
    for (const s of SIZES) await expect(page.getByTestId(`interval-${s}`), `size ${s} is offered on 1M`).toBeVisible();

    // each size is selected and draws candles; the finer the size, the more candles the history gives
    const counts: Record<string, number> = {};
    for (const s of SIZES) {
      await page.getByTestId(`interval-${s}`).click();
      await expect(page.getByTestId(`interval-${s}`)).toHaveAttribute('aria-checked', 'true');
      await expect(chart).toHaveAttribute('data-interval', s);
      counts[s] = await candles(chart);
      expect(counts[s], `candles at ${s}`).toBeGreaterThan(0);
    }
    expect(counts['1m']!).toBeGreaterThan(counts['5m']!);
    expect(counts['5m']!).toBeGreaterThan(counts['1h']!);
    expect(counts['1h']!).toBeGreaterThan(counts['4h']!);
    expect(counts['1D']!).toBeGreaterThanOrEqual(counts['1W']!);
    expect(counts['1W']!).toBeGreaterThanOrEqual(counts['1M']!);

    // a range moves the view and keeps the size
    await page.getByTestId('interval-5m').click();
    await page.getByTestId('range-1D').click();
    await expect(page.getByTestId('interval-5m')).toHaveAttribute('aria-checked', 'true');
    const oneDay = await windowWidth(chart);
    await page.getByTestId('range-1W').click();
    await expect(page.getByTestId('interval-5m')).toHaveAttribute('aria-checked', 'true');
    const oneWeek = await windowWidth(chart);
    expect(oneWeek, 'a week shows more candles than a day').toBeGreaterThan(oneDay);
    await page.getByTestId('range-ALL').click();
    expect(await candles(chart), 'the candle count is the same on every range').toBe(counts['5m']);
    await page.screenshot({ path: `${SHOTS}/chart-1440x900-5m-all.png` });

    // the daily sizes: a month of candles at 1M, and the newest candle forms (its close is the live price)
    await page.getByTestId('interval-1M').click();
    await page.getByTestId('range-1Y').click();
    await page.screenshot({ path: `${SHOTS}/chart-1440x900-1M.png` });

    // the scale switches: auto is on at first; the log switch sets a logarithmic scale; percent wins over it
    await page.getByTestId('interval-1h').click();
    await page.getByTestId('range-1W').click();
    await expect(page.getByTestId('auto-axis')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('log-axis').click();
    await expect(page.getByTestId('log-axis')).toHaveAttribute('aria-pressed', 'true');
    await expect(chart).toHaveAttribute('data-price-mode', '1');
    await page.screenshot({ path: `${SHOTS}/chart-1440x900-log.png` });
    await page.getByTestId('pct-axis').click();
    await expect(chart).toHaveAttribute('data-price-mode', '2');
    await expect(page.getByTestId('log-axis')).toHaveAttribute('aria-pressed', 'false');
    await page.getByTestId('pct-axis').click();
    await expect(chart).toHaveAttribute('data-price-mode', '1');
    await page.getByTestId('log-axis').click();
    await expect(chart).toHaveAttribute('data-price-mode', '0');
  });

  test('the indicators menu closes on Escape, and a press elsewhere closes it and still reaches its target', async ({ page }) => {
    onlyIn('desktop');
    await page.setViewportSize({ width: 1440, height: 900 });
    await boot(page);
    const chart = page.getByTestId('price-chart').first();
    await expect.poll(() => candles(chart), { timeout: 30_000 }).toBeGreaterThan(0);

    const menu = page.getByRole('menu', { name: /indicators|Indicateurs/i });
    await page.getByTestId('indicators-menu').click();
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);

    // open again; a click on another control closes the menu and that control still acts
    await page.getByTestId('indicators-menu').click();
    await expect(menu).toBeVisible();
    await page.getByTestId('interval-1h').click();
    await expect(menu).toHaveCount(0);
    await expect(page.getByTestId('interval-1h')).toHaveAttribute('aria-checked', 'true');
    await expect(chart).toHaveAttribute('data-interval', '1h');
  });
});
