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
