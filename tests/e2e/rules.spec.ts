import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { clearSheets, goTo, isPhone, register, skipTips, watchErrors } from './helpers';

// Stage 1 rules (docs/UX-REDESIGN.md 1.5): the top bar's labelled Cash and Net worth with the click-through breakdown, the
// fill notice in the toast, and shorting from R0 (cash-secured at 1x, its collateral and borrow fee on the ticket).
// Screenshots go to RULES_SHOTS as rules-<desk1440|phone390>-<state>.png.

const SHOTS = process.env.RULES_SHOTS ?? 'C:/Users/Mathis/AppData/Local/Temp/claude/C--Users-Mathis-Projects-trading-game/3e244d11-2864-4a30-bb85-2a3854d32762/scratchpad/ux/shots-s1';

async function shot(page: Page, state: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/rules-${isPhone(page) ? 'phone390' : 'desk1440'}-${state}.png` });
}

/** Runs one reducer command as the signed-in player, through the store's own action (the same path as the UI). */
async function act(page: Page, cmd: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  return page.evaluate(async (c) => {
    const r = await window.__tg!.state().act(c as never, { silent: true });
    return { ok: r.ok, error: r.error };
  }, cmd);
}

/** Dollars in en-US with cents, the way the figures read on the strip (positive values; the test figures are positive). */
const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

test('the top bar names cash and net worth, the day change is neutral at zero, and net worth opens a breakdown that adds up', async ({ page }) => {
  const errors = watchErrors(page);
  await register(page);
  await skipTips(page);
  await clearSheets(page);
  // the phone's status bar carries the same figures under its own ids (the home widget keeps os-networth)
  const p = isPhone(page) ? 'os-phone-' : 'os-';
  await expect(page.getByTestId(`${p}cash`)).toContainText('Cash');
  const nw = page.getByTestId(`${p}networth`);
  await expect(nw).toContainText('Net worth');
  // nothing traded yet: the day change is exactly zero and reads as a neutral figure
  await expect(page.getByTestId(`${p}today`)).toHaveText('0.00%');
  await expect(page.getByTestId(`${p}today`)).toHaveClass(/text-fg-muted/);
  await nw.click();
  const pop = page.getByTestId('nw-breakdown');
  await expect(pop).toBeVisible();
  await expect(pop.getByTestId('nw-row-cash')).toBeVisible();
  await expect(pop.getByTestId('nw-row-debts')).toBeVisible();
  const figures = await page.evaluate(() => {
    const b = window.__tg!.state().me!.netWorth;
    return { total: b.total, sum: b.cash + b.markets + b.businesses + b.property + b.companies + b.funds + b.tokens + b.lab + b.lifestyle - b.mortgages };
  });
  expect(figures.sum).toBeCloseTo(figures.total, 2);
  await expect(page.getByTestId('nw-total')).toContainText(usd(figures.total));
  await shot(page, 'breakdown');
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a fill reads as a cost and a fee in the toast: "Bought 5 HLCN at ... · cost $... · fee $..."', async ({ page }) => {
  const errors = watchErrors(page);
  await register(page);
  await skipTips(page);
  await clearSheets(page);
  // 5 shares of HLCN is about $887, inside the first-trade 20% cap of the $5,250 starting cash
  expect((await act(page, { type: 'order.place', order: { assetId: 'HLCN', side: 'buy', type: 'market', qty: 5 } })).ok).toBe(true);
  const toasts = page.getByTestId('os-toasts');
  await expect(toasts).toContainText(/Bought 5 HLCN at [\d,.]+ · cost \$[\d,]+\.\d{2} · fee \$\d+\.\d{2}/, { timeout: 15_000 });
  await shot(page, 'fill-toast');
  expect(errors).toEqual([]);
});

test('a new player can short from R0: the ticket shows the collateral held and the borrow fee, and the short opens', async ({ page }) => {
  test.skip(isPhone(page), 'the desktop ticket carries the short terms; the phone sheet is checked by the trading specs');
  const errors = watchErrors(page);
  await register(page);
  await skipTips(page);
  await goTo(page, 'market');
  await expect(page.getByTestId('order-pad')).toBeVisible();
  await page.getByTestId('side-sell').click();
  await page.getByTestId('order-qty').fill('5');
  // Retail may short from R0: the ticket offers the short, not a licence refusal
  await expect(page.getByTestId('order-short-terms')).toBeVisible();
  await expect(page.getByTestId('order-collateral')).toContainText('$');
  await expect(page.getByTestId('order-borrow-fee')).toContainText('a year');
  await expect(page.getByTestId('order-invalid')).toHaveCount(0);
  await expect(page.getByTestId('order-submit')).toBeEnabled();
  await shot(page, 'short-ticket');
  await page.getByTestId('order-submit').click();
  await expect.poll(async () => page.evaluate(() => window.__tg!.state().me!.account?.positions.HLCN?.qty ?? 0), { timeout: 15_000 }).toBe(-5);
  await shot(page, 'short-open');
  expect(errors).toEqual([]);
});
