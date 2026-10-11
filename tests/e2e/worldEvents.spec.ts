import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN, WORLD, advanceWorld, clearSheets, goTo, isPhone, noHorizontalOverflow, register, skipTips, watchErrors } from './helpers';

// Phase 6A (velvet-world-events.md, velvet-rivals-board.md): the world event takeover, the banner and its panel, and the
// Rivals board. A forced crash starts at the next day boundary (admin.event, a one-day event so the shared world is quiet
// again at once). This spec advances the shared world, so it runs in the close chain, after the other time-advancing specs.
// Screenshots go to P6_SHOTS (default test-results/p6-shots): the lead's sign-off set is 1440x900 and 390x844, en and fr.

const SHOTS = process.env.P6_SHOTS ?? 'test-results/p6-shots';
const DAY = 720;
/** Game-day style words that must never appear on a rival element (the no-leak rule). */
const STYLE_WORDS = /\b(value|momentum|degen|crypto|rebalance|holdings|style)\b/i;

function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  const project = isPhone(page) ? 'phone' : 'desktop';
  return page.screenshot({ path: `${SHOTS}/${project}-${name}.png` }).then(() => undefined);
}

async function forceEvent(kind: 'crash' | 'bubble' | 'crisis' | 'flash', days = 1): Promise<void> {
  const r = await fetch(`${WORLD}/api/admin/event`, {
    method: 'POST', headers: { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' }, body: JSON.stringify({ kind, days }),
  });
  expect(r.status).toBe(200);
  expect((await r.json()).ok).toBe(true);
}

test.describe.configure({ mode: 'serial' });

// A forced event lasts a game day (12 real minutes in the e2e world). Every test ends it, even on failure: the next test needs the slot.
test.afterEach(async () => {
  await advanceWorld(2 * DAY);
});

test('a crash onset takes over the desk, and Close is live from one second', async ({ page }) => {
  const errors = watchErrors(page);
  await register(page, 'tk');
  await skipTips(page);
  await clearSheets(page);
  await forceEvent('crash', 1);
  const takeover = page.getByTestId('event-takeover');
  await expect(takeover).toBeVisible({ timeout: 15_000 });
  await expect(takeover).toHaveAttribute('data-kind', 'crash');
  await expect(page.getByTestId('event-headline')).not.toBeEmpty();
  const close = page.getByTestId('event-close');
  await expect(close).toBeDisabled();
  // a click before one second does nothing
  await close.click({ force: true }).catch(() => undefined);
  await expect(takeover).toBeVisible();
  const seen = Date.now();
  await expect(close).toBeEnabled({ timeout: 2_000 });
  // the takeover is skippable from one second in (it measures from its own start, so the wait is about a second)
  expect(Date.now() - seen).toBeGreaterThanOrEqual(400);
  // the sign-off frame is the settled card, about 2.2 s in (the headline lands at 0.9–2.4 s); Close is still live
  await page.waitForTimeout(1_100);
  await shot(page, 'en-takeover-onset');
  await close.click({ timeout: 1_000 }).catch(() => undefined);
  await expect(takeover).toHaveCount(0);
  // the banner stays with the event, live, and the takeover never comes back for the same event
  await expect(page.getByTestId('event-banner')).toHaveAttribute('data-state', 'live');
  expect(errors.filter((e) => !/favicon|ResizeObserver/.test(e))).toEqual([]);
});

test('the banner opens the event panel, and the Rivals board lists the funds beside you', async ({ page }) => {
  const errors = watchErrors(page);
  await register(page, 'bn');
  await skipTips(page);
  await clearSheets(page);
  if (!isPhone(page)) await page.setViewportSize({ width: 900, height: 800 });
  await forceEvent('crash', 1);
  const banner = page.getByTestId('event-banner');
  await expect(banner).toBeVisible({ timeout: 15_000 });
  // the takeover covers the desk for three seconds after the onset: wait for it to come, then for it to go
  await expect(page.getByTestId('event-takeover')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('event-takeover')).toHaveCount(0, { timeout: 10_000 });
  // a click can land while the banner settles: retry until the panel is up (the panel is read once it opens)
  await expect(async () => {
    await banner.click();
    await expect(page.getByTestId('event-panel')).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByTestId('event-headline')).not.toBeEmpty();
  await shot(page, 'en-banner-panel');
  await page.getByTestId('event-close').click();
  await expect(page.getByTestId('event-panel')).toHaveCount(0);
  await noHorizontalOverflow(page);

  await goTo(page, 'market');
  const board = page.getByTestId('rivals-board');
  await board.scrollIntoViewIfNeeded();
  await expect(board).toBeVisible({ timeout: 15_000 });
  for (const id of ['hale', 'pinn', 'vetch']) await expect(page.getByTestId(`rival-row-${id}`)).toBeVisible();
  await expect(page.getByTestId('you-row')).toBeVisible();
  // no rival element names a style, a holding or a rebalance
  const text = await board.innerText();
  expect(text).not.toMatch(STYLE_WORDS);
  await shot(page, 'en-rivals-board');
  await page.getByTestId('rival-row-pinn').click();
  const profile = page.getByTestId('rival-profile');
  await expect(profile).toBeVisible();
  await expect(profile).not.toContainText(STYLE_WORDS);
  await shot(page, 'en-rivals-profile');
  await noHorizontalOverflow(page);
  expect(errors.filter((e) => !/favicon|ResizeObserver/.test(e))).toEqual([]);
});

test('in French, the takeover and the Rivals board read in French', async ({ page }) => {
  await register(page, 'fr');
  await skipTips(page);
  await goTo(page, 'profile');
  await page.getByTestId('settings-lang-fr').click();
  await clearSheets(page);
  await forceEvent('bubble', 1);
  const takeover = page.getByTestId('event-takeover');
  await expect(takeover).toBeVisible({ timeout: 15_000 });
  await expect(takeover).toHaveAttribute('data-kind', 'bubble');
  await expect(page.getByTestId('event-positions')).toHaveText('Voir mes positions');
  await shot(page, 'fr-takeover-bubble');
  await expect(page.getByTestId('event-close')).toBeEnabled({ timeout: 3_000 });
  await page.getByTestId('event-close').click();
  await goTo(page, 'market');
  const board = page.getByTestId('rivals-board');
  await board.scrollIntoViewIfNeeded();
  await expect(board).toContainText('Rivaux');
  await shot(page, 'fr-rivals-board');
});
