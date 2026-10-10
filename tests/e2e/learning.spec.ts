import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { goTo, grant, isPhone, noHorizontalOverflow, register, skipRankUp, skipTips, watchErrors } from './helpers';

/**
 * The day-close card (velvet-daily-close.md) opens over the screen when a game day ends, and on the phone it covers the
 * Portfolio tabs. If it is up, Done closes it; either way the caller goes on only once the card has left the screen.
 */
async function dismissCloseCard(page: Page): Promise<void> {
  const card = page.getByTestId('close-card');
  await expect(async () => {
    if (await card.isVisible()) await page.getByTestId('close-done').click({ timeout: 2_000 });
    await expect(card).toHaveCount(0, { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
}

// The learning loop (Phase 3, velvet-trade-journal-replay.md and velvet-research-desk.md): the journal, the analyst and the
// Research Desk, through the real screens.

test('a closed trade lands in the journal as a row, with its replay and its free sentence', async ({ page }) => {
  const errors = watchErrors(page);
  await register(page);
  await skipTips(page);
  if (isPhone(page)) await page.getByTestId('home-app-broker').click();
  await page.getByTestId('order-qty').fill('2');
  await page.getByTestId('order-submit').click();
  await goTo(page, 'portfolio');
  await expect(page.getByTestId('position-HLCN')).toBeVisible({ timeout: 15_000 });
  await dismissCloseCard(page);
  await page.getByTestId('close-HLCN').click();
  await page.getByTestId('close-HLCN-yes').click();
  await expect(page.getByTestId('position-HLCN')).toHaveCount(0, { timeout: 15_000 });
  // a fill toast over the Portfolio tabs (the phone drops them from the top) blocks the click while the pointer rests on it: wait for it to go
  await expect(page.getByTestId('os-toasts')).toBeEmpty({ timeout: 15_000 });
  await dismissCloseCard(page);
  await page.getByTestId('portfolio-tab-journal').click();
  await expect(page.getByTestId('journal')).toBeVisible();
  const row = page.locator('[data-testid^="journal-row-"]').first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText('HLCN');
  // the sentence waits for the trade's day to close, so the row says so until then (never a made-up line)
  await row.click();
  await expect(page.getByTestId('journal-detail')).toBeVisible();
  await expect(page.getByTestId('replay-chart').or(page.getByText('No price history for this trade.'))).toBeVisible();
  // the free sentence: either the pending line or the explained one, never empty and never a raw key or placeholder
  await expect(page.getByTestId('explain-line')).not.toBeEmpty();
  await expect(page.getByTestId('explain-line')).not.toContainText(/[{}@]/);
  await page.getByTestId('journal-back').click();
  await noHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test('hiring an analyst asks for one confirm that says the first week is not refunded, then shows the status', async ({ page }) => {
  const errors = watchErrors(page);
  const handle = await register(page);
  await skipTips(page);
  await grant(handle, 30_000);
  await skipRankUp(page);
  await goTo(page, 'portfolio');
  await page.getByTestId('portfolio-tab-analyst').click();
  await expect(page.getByTestId('analyst-tier-junior')).toBeVisible();
  await page.getByTestId('analyst-tier-senior').click();
  await page.getByTestId('analyst-hire').click();
  await expect(page.getByTestId('analyst').getByText('not refunded')).toBeVisible();
  await page.getByTestId('analyst-hire-confirm').click();
  await expect(page.getByTestId('analyst-status')).toContainText('Senior analyst');
  await expect(page.getByTestId('analyst-status')).toContainText('paid through Day');
  await noHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test('the Research Desk is locked below Operator: no query control is in the DOM', async ({ page }) => {
  await register(page);
  await skipTips(page);
  await page.goto('/research');
  await expect(page.locator('html')).toHaveAttribute('data-game', 'ready', { timeout: 30_000 });
  await expect(page.getByTestId('desk-query-asset')).toHaveCount(0);
  await expect(page.getByTestId('desk-query')).toHaveCount(0);
  await expect(page.getByTestId('desk-run')).toHaveCount(0);
});

test('at Operator the desk opens for a fee; a query clamps to closed days and explains the move', async ({ page }) => {
  const errors = watchErrors(page);
  const handle = await register(page);
  await skipTips(page);
  await grant(handle, 8_000_000);
  await skipRankUp(page);
  await goTo(page, 'research');
  await expect(page.getByTestId('desk-unlock')).toBeVisible();
  await expect(page.getByTestId('desk-query-asset')).toHaveCount(0);
  await page.getByTestId('desk-unlock-run').click();
  await page.getByTestId('desk-unlock-confirm').click();
  await expect(page.getByTestId('desk-query-asset')).toBeVisible();
  await expect(page.getByTestId('desk-session')).toContainText('Session open');
  // typing a day after the last closed one is clamped to the last closed day
  await page.getByTestId('desk-to').fill('99999');
  const to = Number(await page.getByTestId('desk-to').inputValue());
  expect(to).toBeLessThan(99999);
  await page.getByTestId('desk-run').click();
  await expect(page.getByTestId('desk-dossier')).toBeVisible();
  await expect(page.getByTestId('desk-header')).toContainText(`to Day ${to}`);
  await expect(page.getByTestId('desk-memo')).not.toBeEmpty();
  await expect(page.getByTestId('desk-total')).toBeVisible();
  await expect(page.getByTestId('desk-flow-trend')).toBeVisible();
  await expect(page.locator('[data-testid^="desk-file-"]').first()).toBeVisible();
  await noHorizontalOverflow(page);
  expect(errors).toEqual([]);
});
