import { expect, type Page } from '@playwright/test';

export const WORLD = `http://localhost:${process.env.E2E_WORLD_PORT ?? 8797}`;
export const ADMIN = 'e2e-admin';

export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;

/** Collect console errors and uncaught exceptions for the whole test. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** Register a fresh guest through the cold open and wait for the world to load. */
export async function register(page: Page, prefix = 'e2e'): Promise<string> {
  const handle = `${prefix}${Math.floor(Math.random() * 1e7)}`.slice(0, 18);
  await page.goto('/');
  await page.getByTestId('onboarding-start').click();
  await page.getByTestId('handle').fill(handle);
  await page.getByTestId('enter-world').click();
  await expect(page.locator('html')).toHaveAttribute('data-game', 'ready', { timeout: 30_000 });
  return handle;
}

export async function grant(handle: string, amount: number): Promise<void> {
  const r = await fetch(`${WORLD}/api/admin/grant`, {
    method: 'POST', headers: { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' }, body: JSON.stringify({ handle, amount }),
  });
  expect(r.status).toBe(200);
}

/**
 * Clears the sheets that can cover an app while the world runs: While You Were Away (after a reload that follows time
 * away, which another spec's admin advance can cause in the shared e2e world) and the daily close card (velvet-daily-close.md).
 * A card that is not there costs nothing.
 *
 * The first-session coach is re-derived from the live world on every tick, so it can vanish between the visibility
 * check and the click. A click that finds nothing to press is not an error here: the loop re-checks what is on screen,
 * and the short click timeout stops a vanished card from holding the test for the full 60 seconds.
 */
export async function clearSheets(page: Page): Promise<void> {
  const quick = { timeout: 2_000 };
  for (let i = 0; i < 4; i++) {
    const tips = page.getByTestId('coach').getByText('Skip tips');
    const back = page.getByText('Back to the desktop');
    const done = page.getByTestId('close-done');
    if (await tips.isVisible().catch(() => false)) await tips.click(quick).catch(() => undefined);
    else if (await back.isVisible().catch(() => false)) await back.click(quick).catch(() => undefined);
    else if (await done.isVisible().catch(() => false)) await done.click(quick).catch(() => undefined);
    else return;
  }
}

/** The desktop shelf tile that opens each old screen (each screen is a window now, Phase 2 step 1). */
const SCREEN_TILE: Record<string, string> = {
  market: 'broker', portfolio: 'portfolio', empire: 'businesses', estate: 'boutique', lab: 'ailab',
  security: 'security', court: 'legal', social: 'messages', wire: 'wire', profile: 'settings',
};

/**
 * Open a screen: a shelf tile on the desktop; on the phone, Home (a tap on the Quay mark) and then the
 * app's home tile (P2-142, P2-143). Home tiles keep the app id, so the same name works on both.
 */
export async function goTo(page: Page, screen: string): Promise<void> {
  const app = SCREEN_TILE[screen] ?? screen;
  await clearSheets(page);
  if (!isPhone(page)) { await page.getByTestId(`shelf-app-${app}`).click(); return; }
  await page.getByTestId('phone-quay').click();
  await page.getByTestId(`home-app-${app}`).click();
}

/** Ends the ceremony on the phone or the desktop: waits for the OS update, then skips it (C-31). */
export async function skipRankUp(page: Page): Promise<void> {
  await expect(page.getByTestId('os-update')).toBeVisible({ timeout: 25_000 });
  await page.getByTestId('os-update-skip').click({ timeout: 5_000 });
  await expect(page.getByTestId('os-update')).toHaveCount(0);
}

export async function noHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

export async function proof(page: Page, name: string): Promise<void> {
  const project = isPhone(page) ? 'phone' : 'desktop';
  await page.screenshot({ path: `test-results/proof/${project}-${name}.png` });
}

export async function skipTips(page: Page): Promise<void> {
  const skip = page.getByTestId('coach').getByText('Skip tips');
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

/**
 * The day-close card (velvet-daily-close.md) opens over the screen when a game day ends, and on the phone it covers the
 * tabs. If it is up, Done closes it; either way the caller goes on only once the card has left the screen. With
 * `appearWithin`, the helper first waits that long for the card to show (it opens a moment after the day step).
 */
export async function dismissCloseCard(page: Page, appearWithin = 0): Promise<void> {
  const card = page.getByTestId('close-card');
  if (appearWithin) await card.waitFor({ state: 'visible', timeout: appearWithin }).catch(() => {});
  await expect(async () => {
    if (await card.isVisible()) await page.getByTestId('close-done').click({ timeout: 2_000 });
    await expect(card).toHaveCount(0, { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
}

/** Backdates a player's account by `ticks` (the admin seam for the account-age rules, admin.age). */
export async function ageAccount(handle: string, ticks: number): Promise<void> {
  const r = await fetch(`${WORLD}/api/admin/age`, {
    method: 'POST', headers: { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' }, body: JSON.stringify({ handle, ticks }),
  });
  expect(r.status).toBe(200);
}

/** Advances the shared world by `ticks`, in the admin route's chunks (at most 20,000 per call). Only for the close-card specs. */
export async function advanceWorld(ticks: number): Promise<void> {
  let left = ticks;
  while (left > 0) {
    const n = Math.min(20_000, left);
    const r = await fetch(`${WORLD}/api/admin/advance?n=${n}`, { method: 'POST', headers: { authorization: `Bearer ${ADMIN}` } });
    expect(r.status).toBe(200);
    left -= n;
  }
}

/**
 * Gives a founder's unlisted company the filed history the IPO rules read (three filed quarters, a filed value at the
 * minimum). The request, the book and the listing stay real. See admin.ipoReady in src/world/company/ipo.ts.
 */
export async function makeIpoReady(handle: string): Promise<void> {
  const r = await fetch(`${WORLD}/api/admin/ipo-ready`, {
    method: 'POST', headers: { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' }, body: JSON.stringify({ handle }),
  });
  expect(r.status).toBe(200);
  expect((await r.json()).ok).toBe(true);
}

/**
 * Drags an app window's south-east corner far up and left, so the window stops at its declared minimum (src/shell/apps.ts),
 * and returns its box. Desktop only: a phone app is full screen.
 */
export async function shrinkWindowToMinimum(page: Page, app: string): Promise<{ width: number; height: number }> {
  const handle = page.getByTestId(`win-${app}-resize-se`);
  const box = await handle.boundingBox();
  if (!box) throw new Error(`no resize handle for the ${app} window`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 900, box.y - 900, { steps: 12 });
  await page.mouse.up();
  const size = await page.getByTestId(`win-${app}`).boundingBox();
  if (!size) throw new Error(`no ${app} window`);
  return { width: size.width, height: size.height };
}

/** Columns of an app window's body that run past its box (0 when the body fits sideways). */
export async function bodySidewaysOverflow(page: Page, app: string): Promise<number> {
  return page.getByTestId(`win-${app}`).evaluate((el) => {
    const body = el.querySelector('.os-win-body');
    return body ? body.scrollWidth - body.clientWidth : 0;
  });
}
