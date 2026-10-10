import { expect, test } from '@playwright/test';
import { boot, dispatchKey, frame, launcher, newBroker, onlyIn, orders, selectedTicker } from './support';

/** A seeded generator, so a run of random keys is the same on every run. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

test.describe('orders stay untouched by the shell', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop orders');

  test('@shell_never_orders window, layout, focus, launcher and palette actions leave the order list byte identical', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    const before = await orders(page);
    const ticker = await selectedTicker(page);

    await page.getByTestId('shelf-app-wire').click();
    await page.getByTestId('shelf-app-portfolio').click();
    await dispatchKey(page, { code: 'Backquote', key: '`', alt: true });
    await page.keyboard.press('Control+Shift+ArrowLeft');
    await page.keyboard.press('Control+KeyM');
    await page.keyboard.press('Control+Period');
    await page.keyboard.press('Control+Period');
    await launcher(page, ticker);
    await page.keyboard.press('Shift+Enter');
    await newBroker(page);
    await dispatchKey(page, { code: 'KeyW', key: 'w', alt: true });
    await page.getByTestId('shelf-layout').click();
    await page.getByTestId('shelf-app-settings').click();
    await page.getByTestId('palette-picker').getByRole('button', { name: 'Phosphor' }).click();
    await page.getByTestId('palette-picker').getByRole('button', { name: 'Ink & Brass' }).click();
    await expect(frame(page, 'settings')).toBeVisible();

    expect(await orders(page)).toBe(before);
  });

  test('@enter_only_executes random keys with the ticket focused, other than Enter, place no order', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    const before = await orders(page);
    await page.getByTestId('order-qty').click();
    const pool = [
      'Space', 'KeyB', 'KeyS', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyK', 'KeyN', 'KeyW', 'KeyM',
      'Period', 'Backquote', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Escape', 'Backspace',
      'Alt+Digit2', 'Alt+KeyN', 'Control+Period', 'Control+KeyK', 'Control+Shift+ArrowLeft', 'Alt+Backquote',
    ];
    const next = rng(20261010);
    for (let i = 0; i < 300; i++) {
      const k = pool[Math.floor(next() * pool.length)]!;
      await page.keyboard.press(k);
    }
    // Escape may have closed a window or the launcher; the order list is the only thing this checks.
    expect(await orders(page)).toBe(before);
  });
});
