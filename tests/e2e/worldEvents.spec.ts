import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN, advanceWorld, worldUrl, clearSheets, goTo, isPhone, noHorizontalOverflow, register, skipTips, watchErrors } from './helpers';

// Phase 6A (velvet-world-events.md, velvet-rivals-board.md): the world event takeover, the banner and its panel, and the
// Rivals board. A forced crash starts one tick after the request (admin.event, a one-day event), so the shared world is quiet
// again at once. This spec advances the shared world, so it runs in the close chain, after the other time-advancing specs.
// Screenshots go to P6_SHOTS (default test-results/p6-shots): the sign-off set is 1440x900 and 390x844, en and fr.

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
  const r = await fetch(`${worldUrl()}/api/admin/event`, {
    method: 'POST', headers: { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' }, body: JSON.stringify({ kind, days }),
  });
  expect(r.status).toBe(200);
  expect((await r.json()).ok).toBe(true);
}

/**
 * Times the takeover from the page itself (performance.now, polled every 20 ms): when it appears, when Close becomes enabled, and
 * when it leaves the DOM. A browser-side clock, so the test does not measure its own round trips.
 */
async function recordTakeover(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __tk?: { appear: number | null; enabled: number | null; gone: number | null } };
    w.__tk = { appear: null, enabled: null, gone: null };
    window.setInterval(() => {
      const el = document.querySelector('[data-testid="event-takeover"]');
      const close = document.querySelector('[data-testid="event-close"]') as HTMLButtonElement | null;
      const now = performance.now();
      const s = w.__tk!;
      if (el && s.appear === null) s.appear = now;
      if (el && close && !close.disabled && s.enabled === null) s.enabled = now;
      if (!el && s.appear !== null && s.gone === null) s.gone = now;
    }, 20);
  });
}

async function takeoverTimes(page: Page): Promise<{ appear: number | null; enabled: number | null; gone: number | null }> {
  return page.evaluate(() => (window as unknown as { __tk: { appear: number | null; enabled: number | null; gone: number | null } }).__tk);
}

test.describe.configure({ mode: 'serial' });

// A forced event lasts a game day (12 real minutes in the e2e world). Every test ends it, even on failure: the next test needs the slot.
test.afterEach(async () => {
  await advanceWorld(2 * DAY);
});

test('a crash onset takes over the desk: Close is inert before one second, live after, and Close ends it at once', async ({ page }) => {
  const errors = watchErrors(page);
  await register(page, 'tk');
  await skipTips(page);
  await clearSheets(page);
  await recordTakeover(page);
  await forceEvent('crash', 1);
  const takeover = page.getByTestId('event-takeover');
  await expect(takeover).toBeVisible({ timeout: 15_000 });
  await expect(takeover).toHaveAttribute('data-kind', 'crash');
  await expect(page.getByTestId('event-headline')).not.toBeEmpty();
  const close = page.getByTestId('event-close');
  // before one second the control is disabled, so a forced click cannot dismiss the takeover
  await expect(close).toBeDisabled();
  await close.click({ force: true, timeout: 300 }).catch(() => undefined);
  await expect(takeover).toBeVisible();
  // from one second in the control is enabled (measured in the page, not by this test's round trips)
  await expect(close).toBeEnabled({ timeout: 3_000 });
  const t = await takeoverTimes(page);
  expect(t.appear).not.toBeNull();
  expect(t.enabled! - t.appear!).toBeGreaterThanOrEqual(950);
  expect(t.enabled! - t.appear!).toBeLessThanOrEqual(1_400);
  // the settled card, the sign-off frame (the card has risen by 1.3 s; a short wait keeps the shot clear of the 3 s self-end)
  await page.waitForTimeout(300);
  await shot(page, 'en-takeover-onset');
  await close.click();
  await expect(takeover).toHaveCount(0);
  const after = await takeoverTimes(page);
  // Close ends it before the three-second self-end
  expect(after.gone! - after.appear!).toBeLessThan(2_900);
  // the banner stays with the event, live, and the takeover does not come back for the same event
  await expect(page.getByTestId('event-banner')).toHaveAttribute('data-state', 'live');
  await page.waitForTimeout(500);
  await expect(takeover).toHaveCount(0);
  expect(errors.filter((e) => !/favicon|ResizeObserver/.test(e))).toEqual([]);
});

test('without a click the takeover ends by itself at about three seconds, and the banner stays', async ({ page }) => {
  await register(page, 'ts');
  await skipTips(page);
  await clearSheets(page);
  await recordTakeover(page);
  await forceEvent('bubble', 1);
  await expect(page.getByTestId('event-takeover')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('event-takeover')).toHaveCount(0, { timeout: 8_000 });
  const t = await takeoverTimes(page);
  const span = t.gone! - t.appear!;
  expect(span).toBeGreaterThanOrEqual(2_700);
  expect(span).toBeLessThanOrEqual(3_600);
  await expect(page.getByTestId('event-banner')).toHaveAttribute('data-kind', 'bubble');
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
  // the band shades the chart window from the onset (the price chart is on the Market app)
  await goTo(page, 'market');
  await expect(page.getByTestId('event-band').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('event-band').first()).toContainText(/crash|Crash|krach|Krach/i);
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
  // the rivals board sits in the Broker's Asset tab (the dock)
  await page.getByTestId('dock-tab-asset').click();
  const board = page.getByTestId('rivals-board');
  await board.scrollIntoViewIfNeeded();
  await expect(board).toBeVisible({ timeout: 15_000 });
  for (const id of ['hale', 'pinn', 'vetch']) await expect(page.getByTestId(`rival-row-${id}`)).toBeVisible();
  await expect(page.getByTestId('you-row')).toBeVisible();
  // no rival element names a style, a holding or a rebalance
  const text = await board.innerText();
  expect(text).not.toMatch(STYLE_WORDS);
  await shot(page, 'en-rivals-board');
  // a tips toast can sit over the lower part of the board on the phone: dismiss it, so the card is not hidden under it
  for (const b of await page.getByRole('button', { name: /^(Not now|Plus tard)$/ }).all()) await b.click().catch(() => undefined);
  await page.getByTestId('rival-row-pinn').click();
  const profile = page.getByTestId('rival-profile');
  await expect(profile).toBeVisible();
  await expect(profile).not.toContainText(STYLE_WORDS);
  // the profile card is the subject of the frame: scrolled into view, the page shot and the card's own shot
  await profile.scrollIntoViewIfNeeded();
  await shot(page, 'en-rivals-profile');
  await profile.screenshot({ path: `${SHOTS}/${isPhone(page) ? 'phone' : 'desktop'}-en-rivals-profile-card.png` });
  await noHorizontalOverflow(page);
  expect(errors.filter((e) => !/favicon|ResizeObserver/.test(e))).toEqual([]);
});

test('in French, the takeover reads in French (headline, label, the See my positions button), and the Rivals board too', async ({ page }) => {
  await register(page, 'fr');
  await skipTips(page);
  await goTo(page, 'profile');
  await page.getByTestId('settings-lang-fr').click();
  await clearSheets(page);
  await recordTakeover(page);
  await forceEvent('bubble', 1);
  const takeover = page.getByTestId('event-takeover');
  await expect(takeover).toBeVisible({ timeout: 15_000 });
  await expect(takeover).toHaveAttribute('data-kind', 'bubble');
  await expect(page.getByTestId('event-positions')).toHaveText('Voir mes positions');
  await expect(page.getByTestId('event-takeover')).toContainText('Événement de marché');
  // the headline is the French copy, not the engine's English line
  const headline = await page.getByTestId('event-headline').innerText();
  expect(headline).not.toMatch(/Everyone is a genius|Euphoria sweeps|The melt-up/);
  await expect(page.getByTestId('event-close')).toBeEnabled({ timeout: 3_000 });
  await page.waitForTimeout(1_200);
  await shot(page, 'fr-takeover-bubble');
  await page.getByTestId('event-close').click();
  await goTo(page, 'market');
  // the rivals board sits in the Broker's Asset tab (the dock)
  await page.getByTestId('dock-tab-asset').click();
  const board = page.getByTestId('rivals-board');
  await board.scrollIntoViewIfNeeded();
  await expect(board).toContainText('Rivaux');
  await shot(page, 'fr-rivals-board');
});
