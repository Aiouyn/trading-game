import { expect, test } from '@playwright/test';
import { goTo, noHorizontalOverflow, proof, register, skipTips, watchErrors } from './helpers';

// THE PORT AVALON CLOSE (velvet-daily-close.md, Phase 3 B1): a game day's close opens the card for an online player, its
// numbers are the server's, Done remembers the day on the server, and the closes list keeps it.

/** A dollar amount as the card prints it (two decimals, thousands separated, the real minus sign). */
function usd(x: number): string {
  const body = Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${x < 0 ? '−' : ''}$${body}`;
}

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
