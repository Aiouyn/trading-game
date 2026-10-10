import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { goTo, isPhone, noHorizontalOverflow, proof, register, skipTips, watchErrors } from './helpers';

// THE PORT AVALON CLOSE (velvet-daily-close.md, Phase 3 B1): a game day's close opens the card for an online player, its
// numbers are the server's, Done remembers the day on the server, and the closes list keeps it.

/** A dollar amount as the card prints it (two decimals, thousands separated, the real minus sign). */
function usd(x: number): string {
  const body = Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${x < 0 ? '−' : ''}$${body}`;
}

// The luck card's plain wording (Phase 3 polish): the screenshot folder and the store action the luck test uses.
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

// Both tests advance the shared world by a game day: they run one after the other, never side by side.
test.describe.configure({ mode: 'serial' });

test('the close card opens after a game day, its numbers match the server, and Done keeps it in the closes list', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => { window.__tgE2eAdmin = 'e2e-admin'; });
  await register(page);
  await skipTips(page);

  // advance past the next day boundary (the close runs on a day's last tick, after the net worth refresh)
  const tick = await page.evaluate(() => window.__tg!.state().frame?.tick ?? 0);
  const next = (Math.floor(tick / 720) + 1) * 720;
  await page.evaluate((n) => window.__tg!.advance(n), next - tick);

  const card = page.getByTestId('close-card');
  await expect(card).toBeVisible({ timeout: 25_000 });
  await noHorizontalOverflow(page);

  // the card reads the server's close, to the cent
  const server = await page.evaluate(() => window.__tg!.state().me!.trading.closes[0]!);
  await expect(page.getByTestId('close-masthead')).toHaveText(`Day ${server.day + 1}`);
  const headline = Math.abs(server.nwChange) < 1
    ? 'A flat day.'
    : `${server.nwChange > 0 ? 'Up' : 'Down'} ${usd(Math.abs(server.nwChange))} today.`;
  await expect(page.getByTestId('close-headline')).toHaveText(headline);
  const ghosts = (await page.getByTestId('close-ghosts').textContent()) ?? '';
  for (const v of [server.ghosts.basket, server.ghosts.random, server.ghosts.momentum, server.ghosts.player]) {
    expect(ghosts).toContain(usd(v));
  }
  await proof(page, 'close-card');

  // Done closes it for good: the server holds the seen day (the ack carries the view), so a reload does not bring it back
  await page.getByTestId('close-done').click();
  await expect(card).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__tg!.state().me?.trading.closeSeenDay ?? null), { timeout: 10_000 }).toBe(server.day);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-game', 'ready', { timeout: 30_000 });
  await skipTips(page);
  // a reload after time away opens While You Were Away first; closing it counts the close as seen (the digest replaces it)
  const back = page.getByText('Back to the desktop');
  if (await back.isVisible().catch(() => false)) await back.click();
  await expect(page.getByTestId('close-card')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__tg!.state().me?.trading.closeSeenDay ?? null), { timeout: 10_000 }).toBe(server.day);

  // the closes list keeps it, and its row reopens the card
  await goTo(page, 'portfolio');
  await expect(page.getByTestId('closes-history')).toBeVisible();
  await skipTips(page);

  // the luck or skill panel: three ghosts at the same close, and with no trades the percentile is replaced by its branch
  const bench = await page.evaluate(() => window.__tg!.state().me!.trading.benchmark!);
  await expect(page.getByTestId('luck-skill')).toBeVisible();
  await expect(page.getByTestId('ghost-line')).toHaveCount(3);
  await expect(page.getByTestId('ghost-line').nth(0).getByTestId('ghost-value')).toHaveText(usd(bench.basket));
  await expect(page.getByTestId('ghost-line').nth(1).getByTestId('ghost-value')).toHaveText(usd(bench.random));
  await expect(page.getByTestId('ghost-line').nth(2).getByTestId('ghost-value')).toHaveText(usd(bench.momentum));
  await expect(page.getByTestId('ghost-you')).toContainText(usd(bench.player));
  await expect(page.getByTestId('ghost-percentile')).toContainText('No trades yet');
  await expect(page.getByTestId('luck-no-trades')).toBeVisible();
  await noHorizontalOverflow(page);
  await proof(page, 'portfolio-luck');

  await page.getByTestId(`close-row-${server.day}`).click();
  await expect(page.getByTestId('close-card')).toBeVisible();
  await page.getByTestId('close-done').click();
  await expect(page.getByTestId('close-card')).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('the luck card says where you stand in plain words, and its label stays on one line', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  // the day advance goes through the admin route, which the page needs the token for (as in closeCard.spec.ts)
  await page.addInitScript(() => { window.__tgE2eAdmin = 'e2e-admin'; });
  await register(page);
  await skipTips(page);
  await act(page, { type: 'order.place', order: { assetId: 'HLCN', side: 'buy', type: 'market', qty: 3 } });

  // advance past the next day boundary so the ghosts have a close to show
  const tick = await page.evaluate(() => window.__tg!.state().frame?.tick ?? 0);
  const next = (Math.floor(tick / 720) + 1) * 720;
  await page.evaluate((n) => window.__tg!.advance(n), next - tick);
  await goTo(page, 'portfolio');

  await expect(page.getByTestId('luck-skill')).toBeVisible({ timeout: 25_000 });
  // the first close puts the ghosts on the record; the card reads them once it lands
  await expect.poll(() => page.evaluate(() => window.__tg!.state().me?.trading.benchmark ?? null), { timeout: 25_000 }).not.toBeNull();
  const bench = await page.evaluate(() => window.__tg!.state().me!.trading.benchmark!);
  const standing = page.getByTestId('ghost-percentile');
  if (bench.noTrades) {
    await expect(standing).toContainText('No trades yet');
  } else {
    await expect(standing).toContainText(/Behind all three ghosts so far|Ahead of [123] of 3 ghosts|Ahead of all three ghosts/);
    // no bare number stands in for the standing
    await expect(page.getByTestId('ghost-percentile-value')).not.toHaveText(/^\s*-?\d+\s*$/);
  }
  const label = standing.locator('span.whitespace-nowrap').first();
  await expect(label).toHaveText('You and the ghosts');
  expect(await label.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe('nowrap');
  await noHorizontalOverflow(page);
  await standing.evaluate((el) => el.closest('[data-testid="luck-skill"]')?.scrollIntoView({ block: 'start' }));
  await shot(page, 'portfolio-luck');
  expect(errors).toEqual([]);
});
