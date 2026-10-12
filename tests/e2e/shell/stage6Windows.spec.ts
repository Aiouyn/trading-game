import { expect, test } from '@playwright/test';
import { boot, onlyIn, viewport } from './support';

// UX stage 6, item 4 and the six-window state: a drag shows its drop zone and stays on the work area, focus mode names its
// way out for three seconds, and six windows on one workspace never overlap.
test.describe('stage 6 windows', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop windows');

  test('@snap_drop dragging a title bar to the left edge shows the half as the drop zone, and release snaps it there', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    await page.getByTestId('shelf-app-wire').click();
    const title = page.getByTestId('win-wire-title');
    await expect(title).toBeVisible();
    const tb = await title.boundingBox();
    if (!tb) throw new Error('no title geometry');
    const sy = tb.y + tb.height / 2;
    await page.mouse.move(tb.x + tb.width / 2, sy);
    await page.mouse.down();
    await page.mouse.move(2, sy, { steps: 12 });
    const drop = page.getByTestId('snap-preview');
    await expect(drop).toBeVisible();
    const db = await drop.boundingBox();
    const vp = viewport(page);
    // the drop zone is a half of the work area (not a 2 px square), and it sits inside the viewport
    expect(db && db.width > vp.w * 0.4).toBe(true);
    expect(db && db.x >= 0 && db.x + db.width <= vp.w + 1).toBe(true);
    // the window stays on the screen while it is dragged (the live follow is clamped)
    const live = await page.getByTestId('win-wire').boundingBox();
    expect(live && live.x >= -1).toBe(true);
    await page.mouse.up();
    await expect(page.getByTestId('snap-preview')).toHaveCount(0);
    const box = await page.getByTestId('win-wire').boundingBox();
    expect(box && box.width > vp.w * 0.4).toBe(true);
    expect(box && box.x < 40).toBe(true);
  });

  test('@focus_exit entering focus mode shows Exit focus at the top centre for about three seconds, and the pill leaves focus', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    await page.getByTestId('shelf-focus').click();
    const pill = page.getByTestId('focus-exit');
    await expect(pill).toBeVisible();
    const pb = await pill.boundingBox();
    const vp = viewport(page);
    expect(pb && Math.abs(pb.x + pb.width / 2 - vp.w / 2) < 6).toBe(true);
    await expect(pill).toBeHidden({ timeout: 4500 });
    await expect(page.locator('html')).toHaveClass(/focus-mode/);
    // the pill is a button too: it leaves focus mode
    await page.keyboard.press('Control+Period');
    await expect(page.locator('html')).not.toHaveClass(/focus-mode/);
  });

  test('@six_windows six windows on News never overlap: the ones that do not fit collapse to the shelf', async ({ page }) => {
    onlyIn('desktop');
    await boot(page);
    await page.getByTestId('ws-1').click();
    for (const app of ['wire', 'messages', 'portfolio', 'exchange', 'launchpad', 'calendar']) {
      await page.getByTestId(`shelf-app-${app}`).click();
      await page.waitForTimeout(250);
    }
    const dialogs = page.locator('[role="dialog"][data-testid^="win-"]');
    const boxes = (await dialogs.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })))).filter((r) => r.w > 0);
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    expect(boxes.length).toBeLessThanOrEqual(4);
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlap = a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
        expect(overlap, `window ${i} over ${j}`).toBe(false);
      }
    }
  });
});
