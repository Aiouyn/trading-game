import { expect, test, type Page } from '@playwright/test';
import { boot, box, dispatchKey, expectRect, frame, onlyIn, orders, reachRank, windowIds } from './support';

/** The shell's key outcome: the window ids on screen and whether focus mode is on. */
async function outcome(page: Page): Promise<string> {
  const ids = (await windowIds(page)).slice().sort();
  const focus = await page.locator('html').evaluate((h) => h.classList.contains('focus-mode'));
  return JSON.stringify({ ids, focus });
}

test.describe('keyboard', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop keys');

  test('@kbd_azerty_alt_digits on an AZERTY layout, Alt with a digit code opens the shelf apps in order', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    // On AZERTY the digit keys produce accented or symbol keys; the code is still Digit2..Digit4.
    await dispatchKey(page, { code: 'Digit2', key: 'é', alt: true });
    await expect(frame(page, 'portfolio')).toBeVisible();
    await dispatchKey(page, { code: 'Digit3', key: '"', alt: true });
    await expect(frame(page, 'wire')).toBeVisible();
    await dispatchKey(page, { code: 'Digit4', key: "'", alt: true });
    await expect(frame(page, 'messages')).toBeVisible();
  });

  test('@kbd_event_code shortcuts follow event.code, so a different key label does not matter', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    await dispatchKey(page, { code: 'KeyK', key: 'a', ctrl: true });
    await expect(page.getByTestId('os-launcher-input')).toBeFocused();
    await page.keyboard.press('Escape');
    await dispatchKey(page, { code: 'Period', key: ';', ctrl: true });
    await expect(page.locator('html')).toHaveClass(/focus-mode/);
    await dispatchKey(page, { code: 'Period', key: ':', ctrl: true });
    await expect(page.locator('html')).not.toHaveClass(/focus-mode/);
  });

  test('@kbd_text_field_guard in a ticket field no global key acts, and Ctrl Shift Arrow does not snap', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    await page.getByTestId('order-qty').click();
    const ids = await windowIds(page);
    const before = await box(page, 'broker-1');
    for (const k of ['Space', 'KeyB', 'KeyS', 'Digit1', 'Digit4']) await page.keyboard.press(k);
    await page.keyboard.press('Alt+Digit2');
    await page.keyboard.press('Control+Shift+ArrowLeft');
    expect(await windowIds(page)).toEqual(ids);
    expectRect(await box(page, 'broker-1'), before, 0.5);
    await expect(page.locator('html')).not.toHaveClass(/focus-mode/);
  });

  test('@kbd_browser_reserved no binding takes Alt D, Alt E, Alt F, F10, Ctrl L, Ctrl T or Ctrl N', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    const before = await outcome(page);
    for (const k of ['Alt+KeyD', 'Alt+KeyE', 'Alt+KeyF', 'F10', 'Control+KeyL', 'Control+KeyT', 'Control+KeyN']) {
      await page.keyboard.press(k);
    }
    expect(await outcome(page)).toBe(before);
    await expect(page.getByTestId('os-launcher')).toHaveCount(0);
  });

  test('@kbd_browser_reserved Ctrl W and Ctrl Tab are unbound in a browser tab', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    const before = await outcome(page);
    await page.keyboard.press('Control+KeyW');
    await page.keyboard.press('Control+Tab');
    expect(await outcome(page)).toBe(before);
  });

  test.skip('@kbd_browser_reserved Ctrl W and Ctrl Tab are bound in standalone display mode', () => {
    // C-17 and C-18: the standalone (installed) path is not built in V1 (no PWA, no manifest), so the
    // bound-in-standalone half cannot be checked. The tab-mode half above is the live check.
  });

  test('@kbd_cycle Alt Backquote moves the focus to the next window on the workspace, and Shift reverses it', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    await dispatchKey(page, { code: 'Digit2', key: 'é', alt: true });
    await expect(frame(page, 'portfolio')).toHaveClass(/active/);
    // Forward takes the bottom-most window on screen (the stack is z-order: wire, broker, portfolio). Repeated
    // presses visit every window in turn, and Shift steps back to the window before.
    await dispatchKey(page, { code: 'Backquote', key: '`', alt: true });
    await expect(frame(page, 'wire')).toHaveClass(/active/);
    await dispatchKey(page, { code: 'Backquote', key: '`', alt: true });
    await expect(frame(page, 'broker-1')).toHaveClass(/active/);
    // Shift reverses the last step: back to the window the last forward press left (Wire).
    await dispatchKey(page, { code: 'Backquote', key: '`', alt: true, shift: true });
    await expect(frame(page, 'wire')).toHaveClass(/active/);
    await expect(frame(page, 'broker-1')).not.toHaveClass(/active/);
  });

  test('@kbd_same_keypresses_all_ranks the same keys do the same at R0 and at R6', async ({ page, browser }) => {
    onlyIn('desktop');
    const keys = ['Alt+Digit2', 'Alt+KeyN', 'Control+Period', 'Control+Period', 'Alt+Digit3', 'Alt+KeyW'];
    await boot(page);
    for (const k of keys) await page.keyboard.press(k);
    const atR0 = await outcome(page);

    const vp = page.viewportSize() ?? { width: 1440, height: 900 };
    const other = await browser.newPage({ viewport: vp });
    try {
      const handle = await boot(other);
      await reachRank(other, handle, 50_000_000_000);
      for (const k of keys) await other.keyboard.press(k);
      expect(await outcome(other)).toBe(atR0);
      expect(await orders(other)).toBe('[]');
    } finally {
      await other.close();
    }
  });
});
