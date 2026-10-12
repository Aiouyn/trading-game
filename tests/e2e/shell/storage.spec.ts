import { expect, test, type Page } from '@playwright/test';
import { boot, box, ensureShellRecord, expectRect, frame, gotoShell, onlyIn, storedShell, windowIds } from './support';
import { watchErrors } from '../helpers';

const ALLOWED_KEYS = ['tg-prefs', 'tg-token', 'tg-device']; // tg-device: the random per-browser id (V1-PRIVACY.md section 4)
/** The fields of ShellState (wm.ts) as saved: window and layout data only. */
const ALLOWED_SHELL_KEYS = ['v', 'wins', 'activeWs', 'focusWs', 'focusRestore', 'layouts', 'shelf', 'vp', 'look'];

async function localKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => Object.keys(window.localStorage));
}

/** Writes a raw value into tg-prefs under this save's shell record (test-only edit of the stored record). */
async function setStoredShell(page: Page, value: unknown): Promise<void> {
  await page.evaluate((v) => {
    const raw = window.localStorage.getItem('tg-prefs');
    const p = raw === null ? {} : (JSON.parse(raw) as { shells?: Record<string, unknown> });
    const id = Object.keys(p.shells ?? {})[0];
    if (id === undefined) throw new Error('no stored shell');
    p.shells = { ...(p.shells ?? {}), [id]: v };
    window.localStorage.setItem('tg-prefs', JSON.stringify(p));
  }, value);
}

test.describe('local storage and saves', () => {
  test('@storage_audit only tg-prefs and tg-token exist in localStorage after a session, on desktop and phone', async ({ page, isMobile }) => {
    onlyIn('desktop', 'phone');
    const errors = watchErrors(page);
    await boot(page);
    if (isMobile) {
      await page.getByTestId('home-app-wire').click();
      await page.getByTestId('phone-back').click();
    } else {
      await page.getByTestId('shelf-app-wire').click();
      await page.getByTestId('shelf-app-settings').click();
      await page.getByTestId('settings-motion-toggle').check();
      await page.getByTestId('settings-motion-toggle').uncheck();
      await page.keyboard.press('Control+Period');
      await page.keyboard.press('Control+Period');
    }
    await gotoShell(page, '/');
    const keys = await localKeys(page);
    for (const k of keys) expect(ALLOWED_KEYS, `unexpected localStorage key ${k}`).toContain(k);
    expect(keys).toContain('tg-prefs');
    expect(keys).toContain('tg-token');
    const session = await page.evaluate(() => Object.keys(window.sessionStorage));
    for (const k of session) expect(['tg-replay-intro']).toContain(k);
    expect(errors).toEqual([]);
  });

  test('@storage_migration the old tycoon.prefs key moves into tg-prefs and the old token key is removed', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    await page.evaluate(() => {
      window.localStorage.setItem('tycoon.prefs', JSON.stringify({ range: '1D' }));
      window.localStorage.setItem('tycoon.token', 'legacy-token');
    });
    await gotoShell(page, '/');
    const keys = await localKeys(page);
    expect(keys).not.toContain('tycoon.prefs');
    expect(keys).not.toContain('tycoon.token');
    for (const k of keys) expect(ALLOWED_KEYS).toContain(k);
  });

  test('@shell_corrupt_field fuzzed shell records load the game with the desktop and the money unchanged', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    await ensureShellRecord(page);
    const cash = await page.evaluate(() => window.__tg!.state().me?.account?.cash ?? null);
    const payloads: unknown[] = [
      'not an object',
      { v: 1, wins: 'nope' },
      { v: 1, wins: Array.from({ length: 50 }, (_, i) => ({ id: `broker-${i + 1}`, app: 'broker', ws: 0, rect: { x: NaN, y: 0, w: 1, h: 1 }, slot: null, state: 'open', filled: false, props: { ticker: 'HLCN' } })), activeWs: 9 },
      { v: 1, wins: [{ id: 'x', app: 'nope' }], activeWs: 'a', layouts: 'x', shelf: [1, 2, 3] },
    ];
    for (const p of payloads) {
      await setStoredShell(page, p);
      await gotoShell(page, '/');
      await expect(page.getByTestId('os-desktop')).toBeVisible();
      const now = await page.evaluate(() => window.__tg!.state().me?.account?.cash ?? null);
      expect(now).toBe(cash);
      await expect.poll(async () => (await windowIds(page)).some((id) => id.startsWith('broker'))).toBe(true);
    }
  });

  test('@shell_save_roundtrip windows, their places and the focus mode survive a reload of the same save', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    await page.getByTestId('shelf-app-wire').click();
    await expect(frame(page, 'wire')).toBeVisible();
    await page.keyboard.press('Control+Period');
    await page.keyboard.press('Control+Period');
    // Focus mode fades for 120 ms and the frames ease into place; measure once nothing is still moving.
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
    const before = await box(page, 'wire');
    await gotoShell(page, '/');
    await expect(frame(page, 'wire')).toBeVisible();
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
    expectRect(await box(page, 'wire'), before, 1);
    expect(await windowIds(page)).toContain('wire');
  });

  test('@shell_write_count dragging a window writes the save once on release, and never while the pointer moves', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    await page.getByTestId('shelf-app-wire').click();
    await expect(frame(page, 'wire')).toBeVisible();
    await page.evaluate(() => {
      const w = window as unknown as { __tgWrites: number };
      w.__tgWrites = 0;
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
        if (k === 'tg-prefs') w.__tgWrites += 1;
        return orig.call(this, k, v);
      };
    });
    const writes = () => page.evaluate(() => (window as unknown as { __tgWrites: number }).__tgWrites);
    const title = await page.getByTestId('win-wire-title').boundingBox();
    if (title === null) throw new Error('no title');
    const x = title.x + 80;
    const y = title.y + title.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    const start = await writes();
    for (let i = 0; i < 30; i++) {
      await page.mouse.move(x + i * 8, y + i * 2);
      await page.waitForTimeout(90);
    }
    expect(await writes()).toBe(start);
    await page.mouse.up();
    await expect.poll(writes).toBe(start + 1);
  });

  test('@prefs_not_in_save the device prefs (palette, motion) never appear in the save record', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    await page.getByTestId('shelf-app-settings').click();
    await page.getByTestId('palette-picker').getByRole('button', { name: 'Broadsheet' }).click();
    await page.getByTestId('settings-motion-toggle').check();
    const shell = await storedShell(page);
    expect(shell).not.toBeNull();
    const text = JSON.stringify(shell);
    expect(text).not.toMatch(/palette|reducedMotion|broadsheet|lang/);
    await page.getByTestId('settings-motion-toggle').uncheck();
    await page.getByTestId('palette-picker').getByRole('button', { name: 'Ink & Brass' }).click();
  });

  test('@shell_no_game_data the stored shell holds window and layout data only: no prices, cash, orders or positions', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    await page.getByTestId('shelf-app-portfolio').click();
    await expect(frame(page, 'portfolio')).toBeVisible();
    await gotoShell(page, '/');
    const shell = await storedShell(page);
    expect(shell).not.toBeNull();
    for (const k of Object.keys(shell ?? {})) expect(ALLOWED_SHELL_KEYS).toContain(k);
    expect(JSON.stringify(shell)).not.toMatch(/"(cash|netWorth|orders|positions|pnl|price)"/i);
  });

  test('@shell_locked_in_save a hand-edited save that holds a locked Research window drops it on load', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    await ensureShellRecord(page);
    const shell = (await storedShell(page)) ?? {};
    const wins = Array.isArray(shell.wins) ? shell.wins : [];
    await setStoredShell(page, {
      ...shell,
      wins: [
        ...wins,
        { id: 'research-tape-edit', app: 'research', ws: 0, rect: { x: 40, y: 40, w: 500, h: 400 }, slot: null, state: 'open', filled: false, props: { fileId: 'tape-edit' } },
      ],
    });
    await gotoShell(page, '/');
    await expect(page.getByTestId('os-desktop')).toBeVisible();
    expect(await windowIds(page)).not.toContain('research-tape-edit');
  });
});
