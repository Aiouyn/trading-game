import { mkdirSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { goTo, grant, isPhone, noHorizontalOverflow, proof, register, skipRankUp, skipTips, watchErrors } from './helpers';

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

test('the close is a toast after a game day, the Wire card matches the server, and the close stays in the Wire and the list', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => { window.__tgE2eAdmin = 'e2e-admin'; });
  await register(page);
  await skipTips(page);

  // advance past the next day boundary (the close runs on a day's last tick, after the net worth refresh)
  const tick = await page.evaluate(() => window.__tg!.state().frame?.tick ?? 0);
  const next = (Math.floor(tick / 720) + 1) * 720;
  await page.evaluate((n) => window.__tg!.advance(n), next - tick);

  // UX stage 2: the close is a non-blocking toast; its click opens the Wire, where the card is
  const toast = page.locator('[data-testid^="os-toast-"][data-kind="close"]');
  await expect(toast).toBeVisible({ timeout: 25_000 });
  await noHorizontalOverflow(page);
  await toast.click();
  const card = page.getByTestId('close-card');
  await expect(card).toBeVisible();

  // the card reads the server's close, to the cent
  const server = await page.evaluate(() => window.__tg!.state().me!.trading.closes[0]!);
  await expect(page.getByTestId('close-masthead')).toHaveText(`Day ${server.day + 1}`);
  // the headline counts trading alone (price moves, realized P&L, fees); the narrator (Phase 7) picks one of 8 phrasings per kind of day by a stable hash: accept any of them, with the trading amount
  const en = JSON.parse(readFileSync('src/i18n/en.json', 'utf8')) as Record<string, string>;
  const move = Math.abs(server.trading) < 1 ? 'flat' : server.trading > 0 ? 'up' : 'down';
  const headlines = Array.from({ length: 8 }, (_, i) => en[`txt.narr.head.${move}.${i}`]!.replace('{amount}', usd(Math.abs(server.trading))));
  expect(headlines).toContain((await page.getByTestId('close-headline').textContent())?.trim());
  const ghosts = (await page.getByTestId('close-ghosts').textContent()) ?? '';
  for (const v of [server.ghosts.basket, server.ghosts.random, server.ghosts.momentum, server.ghosts.player]) {
    expect(ghosts).toContain(usd(v));
  }
  await proof(page, 'close-card');

  // the server holds the seen day (the ack carries the view), so a reload does not bring the toast back
  await expect.poll(() => page.evaluate(() => window.__tg!.state().me?.trading.closeSeenDay ?? null), { timeout: 10_000 }).toBe(server.day);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-game', 'ready', { timeout: 30_000 });
  await skipTips(page);
  // a reload after time away opens While You Were Away first; closing it counts the close as seen (the digest replaces it)
  const back = page.getByText('Back to the desktop');
  if (await back.isVisible().catch(() => false)) await back.click();
  await expect(page.locator('[data-kind="close"]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__tg!.state().me?.trading.closeSeenDay ?? null), { timeout: 10_000 }).toBe(server.day);

  // the closes list keeps it, and its row shows the card in the Wire
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

  expect(errors).toEqual([]);
});

test('a day close whose toast has left is still marked, and the mark leads to the card', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await page.addInitScript(() => { window.__tgE2eAdmin = 'e2e-admin'; });
  await register(page);
  await skipTips(page);

  const tick = await page.evaluate(() => window.__tg!.state().frame?.tick ?? 0);
  const next = (Math.floor(tick / 720) + 1) * 720;
  await page.evaluate((n) => window.__tg!.advance(n), next - tick);

  // the toast shows for its hold and leaves on its own; the close stays unread until the Wire has shown it
  const toast = page.locator('[data-testid^="os-toast-"][data-kind="close"]');
  await expect(toast).toBeVisible({ timeout: 25_000 });
  await expect(toast).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId('close-card')).toHaveCount(0);

  if (isPhone(page)) {
    // the phone has no bell: the Wire's tile carries the mark, and opening the Wire shows the card
    await expect(page.getByTestId('home-app-wire-close')).toBeAttached();
    await goTo(page, 'wire');
  } else {
    // the bell carries the mark; its item opens that day's card in the Wire
    const bell = page.getByTestId('os-bell');
    await expect(bell).toHaveAttribute('data-close-unread', 'true');
    await bell.click();
    await page.getByTestId('bell-close-item').first().click();
  }
  await expect(page.getByTestId('close-card')).toBeVisible();
  // the Wire read the close: the mark is gone
  await expect.poll(() => page.evaluate(() => window.__tg!.state().closeUnread), { timeout: 10_000 }).toBeNull();
  if (!isPhone(page)) await expect(page.getByTestId('os-bell')).not.toHaveAttribute('data-close-unread');
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

test('the journal waterfall shows GX over the trade\'s days next to its parts', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await page.addInitScript(() => { window.__tgE2eAdmin = 'e2e-admin'; });
  const handle = await register(page);
  await skipTips(page);
  // a Junior analyst (the parts need one), then a round trip inside today: both fills are on the same game day
  await grant(handle, 30_000);
  await skipRankUp(page);
  await goTo(page, 'portfolio');
  await page.getByTestId('portfolio-tab-analyst').click();
  await page.getByTestId('analyst-tier-junior').click();
  await page.getByTestId('analyst-hire').click();
  await page.getByTestId('analyst-hire-confirm').click();
  await expect(page.getByTestId('analyst-status')).toContainText('Junior analyst');
  await act(page, { type: 'order.place', order: { assetId: 'HLCN', side: 'buy', type: 'market', qty: 3 } });
  // a market order fills at the next tick: the buy has to fill before the sell can close it
  await page.evaluate(() => window.__tg!.advance(2));
  await act(page, { type: 'order.place', order: { assetId: 'HLCN', side: 'sell', type: 'market', qty: 3 } });

  // the trade's day has to close before the journal can explain it: advance past the next day boundary
  const tick = await page.evaluate(() => window.__tg!.state().frame?.tick ?? 0);
  const next = (Math.floor(tick / 720) + 1) * 720;
  await page.evaluate((n) => window.__tg!.advance(n), next - tick);

  await goTo(page, 'portfolio');
  // the burst of notices (fills, a tip, achievements, the close) shows two at a time, each for its full hold, so the column drains in turn
  await expect(page.getByTestId('os-toasts')).toBeEmpty({ timeout: 40_000 });
  await page.getByTestId('portfolio-tab-journal').click();
  const row = page.locator('[data-testid^="journal-row-"]').first();
  await expect(row).toBeVisible({ timeout: 25_000 });
  await row.click();
  await expect(page.getByTestId('explain-line')).toBeVisible({ timeout: 25_000 });
  // GX is given as a percent over the same days as the waterfall, and the waterfall carries its Market note when it has a Market row
  await expect(page.getByTestId('journal-gx')).toContainText(/^GX [+−-]?\d+\.\d{2}% over the same days$/);
  await expect(page.getByTestId('why-waterfall')).toBeVisible();
  await page.getByTestId('journal-gx').evaluate((el) => el.closest('[data-testid="journal-detail"]')?.scrollIntoView({ block: 'start' }));
  await shot(page, 'journal-gx');
  expect(errors).toEqual([]);
});
