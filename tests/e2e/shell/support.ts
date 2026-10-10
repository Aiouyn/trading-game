import { expect, test, type Locator, type Page } from '@playwright/test';
import { grant, isPhone, register, skipRankUp, skipTips } from '../helpers';
import { GUTTER, SLOT_FRAC, STRIP_H, fracToRect, workArea, type Rect } from '../../../src/shell/geometry';
import type { ShellWindows } from '../../../src/components/os/e2eHooks';

export { grant, isPhone, skipRankUp, watchErrors } from '../helpers';

/** Shell specs share these helpers. Every spec runs under ?e2e and intro=off (tape-e2e-conventions.md section 1). */

/** Skips the running test unless its project is one of these (the body never runs elsewhere). */
export function onlyIn(...projects: string[]): void {
  test.skip(!projects.includes(test.info().project.name), `runs only in ${projects.join(', ')}`);
}

export const DESKTOPS = ['desktop', 'desktop-1920', 'desktop-1000', 'desktop-900'];
export const WIDE = ['desktop', 'desktop-1920'];

export function viewport(page: Page): { w: number; h: number } {
  const v = page.viewportSize();
  if (v === null) throw new Error('no viewport');
  return { w: v.width, h: v.height };
}

/** Opens a fresh guest, then the same save on the e2e flag with the intro off. Returns the handle. */
export async function boot(page: Page): Promise<string> {
  await page.addInitScript(() => {
    window.__tgE2eAdmin = 'e2e-admin';
  });
  const handle = await register(page);
  await gotoShell(page, '/');
  return handle;
}

/** Loads a path on the e2e flag, waits for the save and the desktop (or phone) to be up. */
export async function gotoShell(page: Page, path: string): Promise<void> {
  const sep = path.includes('?') ? '&' : '?';
  await page.goto(`${path}${sep}e2e&intro=off&seed=tape-shell`);
  await expect(page.locator('html')).toHaveAttribute('data-game', 'ready', { timeout: 30_000 });
  await expect(page.getByTestId(isPhone(page) ? 'os-phone' : 'os-desktop')).toBeVisible();
  await skipTips(page);
}

/** Moves the save to a rank by a grant, then plays the ceremony to its end (the idle hook skips the 10 s wait). */
export async function reachRank(page: Page, handle: string, amount: number): Promise<void> {
  await grant(handle, amount);
  await page.evaluate(() => window.__tg?.e2e?.idle());
  await skipRankUp(page);
}

/** Window ids on screen, as the frames' test ids name them (`win-<id>`, `win-broker-1`, `win-research-<file>`). */
export async function windowIds(page: Page): Promise<string[]> {
  return page
    .locator('[role="dialog"][data-testid^="win-"]')
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.testid ?? '').map((t) => t.slice(4)));
}

export async function brokerIds(page: Page): Promise<string[]> {
  return (await windowIds(page)).filter((id) => /^broker(-\d+)?$/.test(id));
}

export function frame(page: Page, id: string): Locator {
  return page.getByTestId(`win-${id}`);
}

export async function box(page: Page, id: string): Promise<Rect> {
  const b = await frame(page, id).boundingBox();
  if (b === null) throw new Error(`no box for win-${id}`);
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}

/** The expected rect of a slot on the desktop: the work area under the strip, in page coordinates. */
export function slotBox(slot: keyof typeof SLOT_FRAC, vp: { w: number; h: number }, focus = false): Rect {
  const r = fracToRect(SLOT_FRAC[slot], workArea(vp, focus), focus ? 1 : GUTTER);
  return { x: r.x, y: STRIP_H + r.y, w: r.w, h: r.h };
}

export function sameRect(a: Rect, b: Rect, tol = 1.5): boolean {
  return Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.w - b.w) <= tol && Math.abs(a.h - b.h) <= tol;
}

export function expectRect(actual: Rect, expected: Rect, tol = 1.5): void {
  expect.soft(Math.abs(actual.x - expected.x), 'x').toBeLessThanOrEqual(tol);
  expect.soft(Math.abs(actual.y - expected.y), 'y').toBeLessThanOrEqual(tol);
  expect.soft(Math.abs(actual.w - expected.w), 'w').toBeLessThanOrEqual(tol);
  expect.soft(Math.abs(actual.h - expected.h), 'h').toBeLessThanOrEqual(tol);
}

/** Focuses a window by clicking its title bar in an empty spot (a click without a drag). */
export async function focusWindow(page: Page, id: string): Promise<void> {
  await page.getByTestId(`win-${id}-title`).click({ position: { x: 60, y: 8 } });
}

/** A keydown with the given event.code. `key` may differ, as on an AZERTY layout (tape: kbd_azerty_alt_digits). */
export async function dispatchKey(page: Page, e: { code: string; key?: string; ctrl?: boolean; shift?: boolean; alt?: boolean }): Promise<void> {
  await page.evaluate((k) => {
    window.dispatchEvent(new KeyboardEvent('keydown', {
      code: k.code, key: k.key ?? '', ctrlKey: !!k.ctrl, shiftKey: !!k.shift, altKey: !!k.alt, bubbles: true, cancelable: true,
    }));
  }, e);
}

/** Toasts on screen, as text. */
export async function toastText(page: Page): Promise<string> {
  return (await page.getByTestId('os-toasts').textContent()) ?? '';
}

/** Opens the launcher with Ctrl K and types into it. */
export async function launcher(page: Page, query: string): Promise<void> {
  await page.keyboard.press('Control+KeyK');
  await expect(page.getByTestId('os-launcher-input')).toBeFocused();
  await page.getByTestId('os-launcher-input').fill(query);
}

/** Opens a new Broker through the launcher's New Broker command (a fresh window, so it counts toward the cap). */
export async function newBroker(page: Page): Promise<void> {
  await launcher(page, 'new broker');
  await page.getByTestId('os-launcher-list').getByRole('option', { name: /New Broker/ }).click();
  await expect(page.getByTestId('os-launcher')).toHaveCount(0);
}

/** The list of order rows as the engine holds them, read through the e2e hook. */
export async function orders(page: Page): Promise<string> {
  return page.evaluate(() => JSON.stringify(window.__tg?.e2e?.orders() ?? null));
}

/** The shell's record for this save, as stored in tg-prefs. Read only. */
export async function storedShell(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('tg-prefs');
    if (raw === null) return null;
    const p = JSON.parse(raw) as { shells?: Record<string, Record<string, unknown>> };
    const id = Object.keys(p.shells ?? {})[0];
    return id === undefined ? null : (p.shells ?? {})[id] ?? null;
  });
}

/** The shell's windows as the reducer holds them (the e2e `windows` hook). The DOM draws only what the layout shows. */
export async function shellWindows(page: Page): Promise<ShellWindows> {
  return page.evaluate(() => window.__tg!.e2e!.windows());
}

/**
 * The Brokers this save holds (open or collapsed). At 1000 and 900 px (halves and single modes) the frames alone
 * undercount the save, so this reads the reducer's windows, not the DOM.
 */
export async function brokerCount(page: Page): Promise<number> {
  return (await shellWindows(page)).wins.filter((w) => w.app === 'broker').length;
}

/**
 * Makes one settled change so the shell record exists in tg-prefs (the shell is saved on settled actions only,
 * so a fresh boot has none until the player acts). Opening or focusing a window is enough.
 */
export async function ensureShellRecord(page: Page): Promise<void> {
  await page.getByTestId('shelf-app-wire').click();
  await expect.poll(() => storedShell(page)).not.toBeNull();
}

/** The ticker the game has selected (the one a new Broker opens on). */
export async function selectedTicker(page: Page): Promise<string> {
  return page.evaluate(() => window.__tg!.state().selected);
}
