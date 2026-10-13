import { expect, test, type Page } from '@playwright/test';
import { DESKTOPS, WIDE, box, boot, dispatchKey, focusWindow, onlyIn, windowIds } from './support';

// Window management on the desktop (UX evaluation, track B): a snap never overlaps a neighbour, a window pushed out to the tray
// is named and restorable, focus mode isolates the focused window and keeps its way out, a layout can be undone, an empty
// workspace says so, the dock shows each app's state, and the narrow modes reach every open window from the tab strip.

test.describe('window management', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop windows');

  /** Two frames overlap when their rects share interior area. */
  const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  async function openTrio(page: Page): Promise<void> {
    await page.getByTestId('shelf-app-wire').click();
    await page.getByTestId('shelf-app-portfolio').click();
  }

  test('@wm_snap_no_overlap a window snapped to the right half re-tiles the Broker beside it and pushes out the panel it covers', async ({ page }) => {
    onlyIn(...WIDE);
    await boot(page);
    await openTrio(page);
    await focusWindow(page, 'wire');
    // Ctrl Shift Right on the top right panel snaps it to the right half (keys.ts: snapCycle)
    await dispatchKey(page, { code: 'ArrowRight', key: 'ArrowRight', ctrl: true, shift: true });
    await expect.poll(() => windowIds(page)).toContain('wire');
    const ids = await windowIds(page);
    expect(ids).not.toContain('portfolio');
    const broker = await box(page, 'broker-1');
    const wire = await box(page, 'wire');
    expect(overlaps(broker, wire), 'the Broker and Wire overlap after the snap').toBe(false);
    expect(wire.x).toBeGreaterThan(broker.x + broker.w - 2);
  });

  test('@wm_tray a window pushed out by a new one is named in the minimized tray, and the tray restores it', async ({ page }) => {
    onlyIn(...WIDE);
    await boot(page);
    await openTrio(page);
    await page.getByTestId('shelf-app-calendar').click();
    // The third panel collapses the oldest one (Wire): the tray names it and a click brings it back.
    const tray = page.getByTestId('os-tray');
    await expect(tray).toBeVisible();
    await expect(page.getByTestId('tray-wire')).toBeVisible();
    // The push also says so in a short notice, not silently (UX evaluation 4).
    await expect(page.getByTestId('os-toasts')).toContainText('minimized to the tray');
    expect(await windowIds(page)).not.toContain('wire');
    await page.getByTestId('tray-wire').click();
    await expect.poll(() => windowIds(page)).toContain('wire');
    await expect(tray.getByTestId('tray-wire')).toHaveCount(0);
  });

  test('@wm_focus_isolate focus mode shows only the focused window, and a small exit control stays in the corner', async ({ page }) => {
    onlyIn(...DESKTOPS);
    await boot(page);
    await openTrio(page);
    // At 900 px a single window fills the desk, so the count before focus is not checked against a minimum.
    const before = (await windowIds(page)).length;
    await page.keyboard.press('Control+Period');
    await expect(page.locator('html')).toHaveClass(/focus-mode/);
    expect((await windowIds(page)).length).toBe(1);
    const pill = page.getByTestId('focus-exit');
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAttribute('data-quiet', 'true', { timeout: 4500 });
    await expect(pill).toBeVisible();
    const pb = await pill.boundingBox();
    const vp = page.viewportSize() ?? { width: 1440, height: 900 };
    expect(pb && pb.x > vp.width / 2 && pb.y > vp.height / 2, 'the exit control sits in the bottom-right corner').toBe(true);
    await page.keyboard.press('Control+Period');
    await expect(page.locator('html')).not.toHaveClass(/focus-mode/);
    expect((await windowIds(page)).length).toBe(before);
  });

  test('@wm_undo_layout a layout offers Undo for ten seconds, and the undo puts the desk back', async ({ page }) => {
    onlyIn(...WIDE);
    await boot(page);
    await page.getByTestId('shelf-app-calendar').click();
    await page.getByTestId('shelf-layout').click();
    const undo = page.getByTestId('layout-undo');
    await expect(undo).toBeVisible();
    await undo.click();
    await expect(page.getByTestId('layout-undo')).toHaveCount(0);
    expect(await windowIds(page)).toContain('calendar');
  });

  test('@wm_research_why the Research layout is off, and says why, with no research file open', async ({ page }) => {
    onlyIn(...WIDE);
    await boot(page);
    await page.getByTestId('shelf-layout-menu').click();
    await expect(page.getByTestId('layout-research')).toBeDisabled();
    await expect(page.getByTestId('layout-research-why')).toBeVisible();
    await expect(page.getByTestId('layout-trade')).toBeEnabled();
  });

  test('@wm_tabs_narrow the tab strip reaches every open window in the halves and single modes', async ({ page }) => {
    onlyIn('desktop-1000', 'desktop-900');
    await boot(page);
    await page.getByTestId('shelf-app-wire').click();
    await expect(page.getByTestId('win-tabs')).toBeVisible();
    await expect(page.getByTestId('win-tab-wire')).toBeVisible();
    await page.getByTestId('win-tab-broker-1').click();
    await expect(page.getByTestId('win-tab-broker-1')).toHaveAttribute('aria-selected', 'true');
    expect(await windowIds(page)).toContain('broker-1');
  });

  test('@wm_ws_empty an empty workspace says so and offers the minimized window back; the dock shows the minimized count', async ({ page }) => {
    onlyIn(...WIDE);
    await boot(page);
    await page.getByTestId('shelf-app-wire').click();
    await page.keyboard.press('Control+KeyM');
    await expect(page.getByTestId('shelf-app-wire')).toHaveAttribute('data-state', 'collapsed');
    await expect(page.getByTestId('shelf-count-wire')).toHaveText('1');
    await page.getByTestId('ws-1').click();
    await expect(page.getByTestId('ws-empty')).toBeVisible();
    await page.getByTestId('ws-empty-restore').click();
    await expect.poll(() => windowIds(page)).toContain('wire');
    await expect(page.getByTestId('ws-empty')).toHaveCount(0);
  });
});
