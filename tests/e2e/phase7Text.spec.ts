import { expect, test, type Page } from '@playwright/test';
import fr from '../../src/i18n/fr.json';
import { goTo, grant, register, skipRankUp, skipTips, watchErrors } from './helpers';

// PHASE 7 (lead-phase7.md P7-3): the generated text in French. The Wire, the close card, the Rivals profile and the
// Research Desk show French prose at desktop and phone, and no English sentence built from the templates.

/** English sentences the templates (src/world/text/roles.ts and the Phase 3 copy) would print: any of them in French is a miss. */
const ENGLISH_STORY = new RegExp([
  '\\b(jumps|rallies|surges|slides|drops|tumbles|sinks|falls|pops|climbs|reopens|halted after|Closing auction|Short squeeze)\\b',
  '\\b(Analysts (are|split|expect|see|lean)|Inflation (runs|cools|in line|lands)|Growth (in line|beats|disappoints|lands)|Economy stronger)\\b',
  '\\b(Whisper|Margin call|Forced selling|Liquidated:|lists on Port Avalon|discloses a stake|Market event|priced in (early|midway|late))\\b',
  '\\b(Your net worth|expired (in the money|worthless)|reconstitutes today|Pension funds rebalance|Port Avalon since|Nobody has met)\\b',
  '\\b(Patience paid|Two partners|Value takes time|rose \\d|fell \\d|from the open of Day)\\b',
].join('|'));

/** Opens the Research Desk for a player (the desk opens at Operator: a grant lifts the rank, as research-desk-hunts does). */
async function openDesk(page: Page, handle: string): Promise<void> {
  await skipTips(page);
  await grant(handle, 8_000_000);
  await skipRankUp(page);
  await goTo(page, 'research');
  await expect(page.getByTestId('desk-unlock')).toBeVisible();
  await page.getByTestId('desk-unlock-run').click();
  await page.getByTestId('desk-unlock-confirm').click();
  await expect(page.getByTestId('desk-query-asset')).toBeVisible();
}

/** Switches the game to French in Settings, as the launchpad spec does (the choice is saved in tg-prefs). */
async function goFrench(page: Page): Promise<void> {
  await goTo(page, 'profile');
  await page.getByTestId('settings-lang-fr').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
}

test('French: the Wire, the Research Desk and the Rivals profile show no English story line', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => { window.__tgE2eAdmin = 'e2e-admin'; });
  const handle = await register(page, 'p7t');
  await goFrench(page);

  // the Wire: every story row is French
  await goTo(page, 'wire');
  const rows = page.getByTestId('wire-row');
  await expect(rows.first()).toBeVisible({ timeout: 20_000 });
  const wire = await rows.allTextContents();
  expect(wire.length).toBeGreaterThan(0);
  for (const line of wire) expect(line, `wire: ${line}`).not.toMatch(ENGLISH_STORY);

  // the Rivals profile: the persona line is French (the card sits in the Market app, under the watchlist)
  await goTo(page, 'market');
  const show = page.getByRole('button', { name: fr['rivals.show'] });
  if (await show.isVisible().catch(() => false)) await show.click();
  const firstRival = page.getByRole('button', { name: new RegExp(fr['rivals.open'].replace('{name}', '.*')) }).first();
  await firstRival.click();
  const persona = page.getByTestId('rival-persona');
  await expect(persona).toBeVisible();
  expect(await persona.textContent()).not.toMatch(ENGLISH_STORY);

  // the Research Desk: the memo and the headlines in the window are French
  await openDesk(page, handle);
  await page.getByTestId('desk-run').click();
  await expect(page.getByTestId('desk-dossier')).toBeVisible();
  const memo = (await page.getByTestId('desk-memo').textContent()) ?? '';
  expect(memo.length).toBeGreaterThan(0);
  expect(memo).not.toMatch(ENGLISH_STORY);
  const heads = page.getByTestId('desk-headlines');
  if (await heads.isVisible().catch(() => false)) {
    for (const line of await heads.locator('li').allTextContents()) expect(line).not.toMatch(ENGLISH_STORY);
  }

  expect(errors).toEqual([]);
});

test('French: the close card lines are French after a game day (desktop and phone)', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => { window.__tgE2eAdmin = 'e2e-admin'; });
  await register(page, 'p7c');
  await skipTips(page);
  await goFrench(page);

  // advance past the next day boundary, as closeCard.spec does (the close runs on the day's last tick)
  const tick = await page.evaluate(() => window.__tg!.state().frame?.tick ?? 0);
  const next = (Math.floor(tick / 720) + 1) * 720;
  await page.evaluate((n) => window.__tg!.advance(n), next - tick);

  const card = page.getByTestId('close-card');
  await expect(card).toBeVisible({ timeout: 25_000 });
  for (const line of await page.getByTestId('close-story').allTextContents()) expect(line).not.toMatch(ENGLISH_STORY);
  const event = page.getByTestId('close-event');
  if (await event.isVisible().catch(() => false)) expect(await event.textContent()).not.toMatch(ENGLISH_STORY);
  expect(await card.textContent()).not.toMatch(ENGLISH_STORY);

  expect(errors).toEqual([]);
});
