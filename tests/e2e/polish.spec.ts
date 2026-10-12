import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { clearSheets, goTo, grant, isPhone, noHorizontalOverflow, register, skipTips, watchErrors } from './helpers';
import { reachRank } from './shell/support';

// The Phase 3 polish pass (lead screenshot reviews): plain luck wording, trading-only day and arrival figures, the Research
// Desk market note and GX move, the liquidation line off the chart, neutral fill toasts, a non-blocking toast column, and a
// French smoke test. Each screenshot goes to P3C_SHOTS (default test-results/shots-p3c) at 1440 and 390 wide.

const SHOTS = process.env.P3C_SHOTS ?? 'test-results/shots-p3c';

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${isPhone(page) ? 'phone' : 'desktop'}-${name}.png` });
}

/** Runs one reducer command as the signed-in player, through the store's own action (the same path as the UI). */
async function act(page: Page, cmd: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  return page.evaluate(async (c) => {
    const r = await window.__tg!.state().act(c as never, { silent: true });
    return { ok: r.ok, error: r.error };
  }, cmd);
}

/** The last token of the status-strip figure: the day change in percent (the money part changes on a grant). */
function pctToken(text: string | null): string {
  return (text ?? '').trim().split(/\s+/).pop() ?? '';
}

test('the status strip and the phone widget show the same day change after a grant', async ({ page }) => {
  const errors = watchErrors(page);
  const handle = await register(page);
  await skipTips(page);
  const nw = page.getByTestId('os-networth');
  await expect(nw).toBeVisible();
  const before = await page.evaluate(() => window.__tg!.state().me!.netWorth.total);
  // the day change figure: the strip's own text on the desktop, the widget's today row on the phone
  const todayRow = page.locator('[title*="trading and income only"]').first();
  const pctBefore = pctToken(await todayRow.textContent());

  await grant(handle, 5000);
  await expect.poll(() => page.evaluate(() => window.__tg!.state().me!.netWorth.total), { timeout: 20_000 }).toBeGreaterThan(before + 4_999);

  // the server's day baseline moved with the grant, so today's change is still zero (nothing was traded)
  const today = await page.evaluate(() => {
    const me = window.__tg!.state().me!;
    return { change: me.netWorth.total - me.player.dayStart.netWorth, arrival: me.arrival.change };
  });
  expect(Math.abs(today.change)).toBeLessThan(0.01);
  expect(Math.abs(today.arrival)).toBeLessThan(0.01);
  expect(pctToken(await todayRow.textContent())).toBe(pctBefore);
  await noHorizontalOverflow(page);
  await shot(page, 'strip-after-grant');

  // "since you arrived" starts from the cash the player arrived with, not from the grant: the grant is left out of the change
  const arrival = await page.evaluate(() => window.__tg!.state().me!.arrival);
  expect(arrival.external).toBeGreaterThan(4_999);
  const start = arrival.cash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  await goTo(page, 'portfolio');
  await expect(page.getByTestId('networth-total')).toContainText(`since you arrived with $${start}`);
  await expect(page.getByTestId('networth-total')).toContainText('(0.00%)');
  await page.getByTestId('networth-chart-note').scrollIntoViewIfNeeded();
  await shot(page, 'portfolio-after-grant');
  expect(errors).toEqual([]);
});

test('a fill toast has a neutral icon and the toast column never blocks the content under it', async ({ page }) => {
  const errors = watchErrors(page);
  await register(page);
  await skipTips(page);
  await act(page, { type: 'order.place', order: { assetId: 'HLCN', side: 'buy', type: 'market', qty: 1 } });

  const toast = page.getByTestId('os-toast-1');
  await expect(toast).toHaveAttribute('data-kind', 'fill', { timeout: 20_000 });
  // the icon is the neutral muted colour, not the buy colour on the text (the red X is for errors only)
  const colours = await toast.evaluate((el) => ({
    icon: getComputedStyle(el.querySelector('.os-toast-ic') as HTMLElement).color,
    text: getComputedStyle(el.querySelector('.os-toast-t2') as HTMLElement).color,
  }));
  expect(colours.icon).not.toBe(colours.text);
  // the column takes no pointer events itself; each card takes its own
  expect(await page.getByTestId('os-toasts').evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  expect(await toast.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('auto');
  await shot(page, 'toast-fill');
  expect(errors).toEqual([]);
});

test('a short position shows its liquidation line on the chart, or says where the line is when it is off the chart', async ({ page }) => {
  const errors = watchErrors(page);
  const handle = await register(page);
  await skipTips(page);
  await reachRank(page, handle, 300_000);
  await act(page, { type: 'order.place', order: { assetId: 'HLCN', side: 'sell', type: 'market', qty: 50 } });

  await clearSheets(page);
  await goTo(page, 'broker');
  // a short of 50 at this rank puts the margin line far above the price (thousands of percent), so it is off the chart on every
  // seed the e2e world uses: the note must say so, and the on-chart note must not show
  const off = page.getByTestId('liquidation-off');
  await expect(off).toBeVisible({ timeout: 25_000 });
  await expect(off).toHaveText(/Liquidation line at \$[\d,.]+, [\d,]+% above the price, off this chart/);
  await expect(page.getByTestId('liquidation-note')).toHaveCount(0);
  // the note sits under the chart; bring it into the shot so the picture shows the line and what it means
  await off.scrollIntoViewIfNeeded();
  await shot(page, 'broker-liquidation');
  expect(errors).toEqual([]);
});

test('the Research Desk dossier explains the Market row and shows GX over the same days', async ({ page }) => {
  const errors = watchErrors(page);
  const handle = await register(page);
  await skipTips(page);
  await reachRank(page, handle, 5_100_000);
  await act(page, { type: 'desk.unlock' });
  await goTo(page, 'research');
  await page.getByTestId('desk-query-asset').selectOption('HLCN');
  await page.getByTestId('desk-preset-week').click();
  await page.getByTestId('desk-run').click();
  await expect(page.getByTestId('desk-dossier')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('desk-waterfall')).toBeVisible();
  if (await page.getByTestId('why-row-market').count()) {
    await expect(page.getByTestId('desk-waterfall-note')).toContainText('Market is how much the market-wide factor moved this stock');
  }
  await expect(page.getByTestId('desk-move').locator('xpath=..')).toContainText('GX');
  // the note sits at the foot of the waterfall: centre it so the shot shows the rows and the line together
  await page.getByTestId('desk-waterfall').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await shot(page, 'desk-dossier');
  expect(errors).toEqual([]);
});

test('settings switch the game to French, and the shell and the settings speak it', async ({ page }) => {
  const errors = watchErrors(page);
  await register(page);
  await skipTips(page);
  await goTo(page, 'profile');
  await page.getByTestId('settings-lang-fr').click();
  await expect(page.getByTestId('settings-language')).toContainText('Langue');
  if (!isPhone(page)) {
    await expect(page.getByTestId('os-strip')).toContainText('Marché ouvert');
  }
  await shot(page, 'settings-french');
  // a few strings from the portfolio in French: the arrival line and the chart note (both say what the figures leave out)
  await goTo(page, 'portfolio');
  await expect(page.getByTestId('networth-total')).toContainText('depuis votre arrivée');
  await expect(page.getByTestId('networth-chart-note')).toContainText('La courbe est votre valeur nette, comme l’affiche l’en-tête');
  // back to English so the rest of the run is not in French
  await goTo(page, 'profile');
  await page.getByTestId('settings-lang-en').click();
  await expect(page.getByTestId('settings-language')).toContainText('Language');
  await goTo(page, 'portfolio');
  await expect(page.getByTestId('networth-total')).toContainText('since you arrived');
  expect(errors).toEqual([]);
});

