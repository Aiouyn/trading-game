import { expect, test } from '@playwright/test';
import { skipTips, watchErrors } from '../helpers';
import { DESKTOPS, WIDE, box, boot, brokerCount, dispatchKey, expectRect, frame, gotoShell, launcher, newBroker, onlyIn, orders, reachRank, slotBox, viewport, windowIds, toastText } from './support';

/** Waits until no window animation runs: a snap, a layout or an open has landed (tape: reduced motion is instant). */
async function settle(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
}

test.describe('window rules', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop windows');

  test('@wm_broker_cap a fifth Broker is refused with a notice and four stay open', async ({ page }) => {
    onlyIn(...DESKTOPS);
    watchErrors(page);
    await boot(page);
    expect(await brokerCount(page)).toBe(1);
    for (let i = 0; i < 3; i++) await newBroker(page);
    await expect.poll(() => brokerCount(page)).toBe(4);
    await newBroker(page);
    await expect(page.getByTestId('os-toasts')).toContainText('4 Brokers are open');
    expect(await brokerCount(page)).toBe(4);
  });

  test('@wm_broker_cap a plain open of another ticker at the cap retargets the least recently used Broker', async ({ page }) => {
    onlyIn(...DESKTOPS);
    await boot(page);
    for (let i = 0; i < 3; i++) await newBroker(page);
    await expect.poll(() => brokerCount(page)).toBe(4);
    const other = await page.evaluate(() => {
      const s = window.__tg!.state();
      return s.config.assets.find((a) => a.id !== s.selected && a.listed !== false)?.id ?? null;
    });
    expect(other).not.toBeNull();
    await launcher(page, other!);
    await page.getByTestId('os-launcher-list').getByRole('option').filter({ hasText: other! }).first().click();
    await expect(page.getByTestId('os-toasts')).toContainText('least recently used');
    expect(await brokerCount(page)).toBe(4);
  });

  test('@wm_one_file_one_window a research file opens one window, and a second open focuses it', async ({ page }) => {
    onlyIn(...DESKTOPS);
    const handle = await boot(page);
    await reachRank(page, handle, 8_000_000);
    await gotoShell(page, '/research/tape-file-1');
    await expect(frame(page, 'research-tape-file-1')).toBeVisible();
    await gotoShell(page, '/research/tape-file-1');
    const research = (await windowIds(page)).filter((id) => id.startsWith('research'));
    expect(research).toEqual(['research-tape-file-1']);
  });

  test('@wm_min_size a free window dragged under its app minimum stops at the minimum', async ({ page }) => {
    onlyIn(...WIDE);
    await boot(page);
    await page.getByTestId('shelf-app-portfolio').click();
    await expect(frame(page, 'portfolio')).toBeVisible();
    await settle(page);
    const grip = await page.getByTestId('win-portfolio-resize-se').boundingBox();
    if (grip === null) throw new Error('no south-east grip');
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x - 900, grip.y - 900, { steps: 12 });
    await page.mouse.up();
    const r = await box(page, 'portfolio');
    // Portfolio: 520 x 220 (apps.ts). The drag asks for far less, so the window stops at its minimum.
    expect(r.w).toBeGreaterThanOrEqual(519);
    expect(r.h).toBeGreaterThanOrEqual(219);
  });

  test('@snap_refused under 1000 px a half that is too narrow for the app is refused and leaves the window still', async ({ page }) => {
    onlyIn('desktop-1000');
    const vp = viewport(page);
    await boot(page);
    await page.getByTestId('shelf-app-portfolio').click();
    await settle(page);
    const before = await box(page, 'portfolio');
    // Portfolio needs 520 px and a right half is 488 px at 1000 wide: the snap is refused (tape: halves refused on min width).
    await dispatchKey(page, { code: 'ArrowRight', key: 'ArrowRight', ctrl: true, shift: true });
    await settle(page);
    expectRect(await box(page, 'portfolio'), before, 0.5);
    // Wire (360 px) fits a right half and snaps to it.
    await page.getByTestId('shelf-app-wire').click();
    await settle(page);
    await dispatchKey(page, { code: 'ArrowRight', key: 'ArrowRight', ctrl: true, shift: true });
    await settle(page);
    expectRect(await box(page, 'wire'), slotBox('R2', vp));
  });

  test('@mode_single_900 at 900 px one window fills the desktop, snaps are refused, and no layout is offered', async ({ page }) => {
    onlyIn('desktop-900');
    const vp = viewport(page);
    await boot(page);
    await settle(page);
    const before = await box(page, 'broker-1');
    expect(before.w).toBeGreaterThan(vp.w - 40);
    await dispatchKey(page, { code: 'ArrowLeft', key: 'ArrowLeft', ctrl: true, shift: true });
    await settle(page);
    expectRect(await box(page, 'broker-1'), before, 0.5);
    await expect(page.getByTestId('shelf-layout')).toHaveCount(0);
    await expect(page.getByTestId('shelf-layout-menu')).toHaveCount(0);
  });

  test('@wm_close_pending_broker closing a Broker with a pending order asks first, and the order survives', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    // the first trade is a market buy: the order-type picker shows once a trade is done (the first trade is simple mode)
    await page.getByTestId('order-qty').fill('1');
    await page.getByTestId('order-submit').click();
    await expect(page.getByTestId('order-type')).toBeVisible({ timeout: 20_000 });
    await skipTips(page);
    const before = (JSON.parse(await orders(page)) as unknown[]).length;
    await page.getByTestId('order-type').selectOption('limit');
    await page.getByTestId('order-qty').fill('1');
    await page.getByTestId('order-limit').fill('1');
    await page.getByTestId('order-submit').click();
    await expect.poll(async () => (JSON.parse(await orders(page)) as unknown[]).length, { timeout: 15_000 }).toBe(before + 1);
    const placed = await orders(page);
    await page.getByTestId('win-broker-1-close').click();
    await expect(page.getByTestId('win-broker-1-confirm')).toBeVisible();
    await expect(frame(page, 'broker-1')).toBeVisible();
    await page.getByTestId('win-broker-1-confirm-yes').click();
    await expect(frame(page, 'broker-1')).toHaveCount(0);
    expect(await orders(page)).toBe(placed);
  });

  test('@wm_broker_cap a refused fifth Broker changes no other window', async ({ page }) => {
    onlyIn(...DESKTOPS);
    await boot(page);
    for (let i = 0; i < 3; i++) await newBroker(page);
    await expect.poll(() => brokerCount(page)).toBe(4);
    const before = await windowIds(page);
    await newBroker(page);
    expect(await windowIds(page)).toEqual(before);
    expect(await toastText(page)).toContain('4 Brokers');
  });
});
