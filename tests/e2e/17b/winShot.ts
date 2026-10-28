import { expect, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

type Clip = { x: number; y: number; width: number; height: number };

/**
 * Run `fn` with the frame's clip and its corner masks. A `.win` frame's rounded corners are antialiased against the
 * desktop by the host's rasteriser (CI's Chromium drew 22 corner pixels 1-2 levels off the box's, PR #92 run
 * 40697141021), so only the four r×r corner squares are masked; every other pixel, the top and bottom edge rows
 * included, is compared. The phone app view has no rounded corners: nothing is masked.
 */
async function withCorners<T>(page: Page, frame: Locator, fn: (clip: Clip, mask: Locator[]) => Promise<T>): Promise<T> {
  const r = await frame.evaluate((el) => (el.classList.contains("win") ? Math.ceil(parseFloat(getComputedStyle(el).borderBottomLeftRadius) || 0) : 0));
  const b = (await frame.boundingBox())!;
  const clip = { x: b.x, y: b.y, width: b.width, height: b.height };
  if (r === 0) return fn(clip, []);
  await page.evaluate(({ b, r }) => {
    for (const [x, y] of [[b.x, b.y], [b.x + b.width - r, b.y], [b.x, b.y + b.height - r], [b.x + b.width - r, b.y + b.height - r]]) {
      const d = document.createElement("div");
      d.dataset.winshotCorner = "";
      d.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${r}px;height:${r}px;pointer-events:none;z-index:2147483647`;
      document.body.append(d);
    }
  }, { b, r });
  try {
    return await fn(clip, [page.locator("[data-winshot-corner]")]);
  } finally {
    await page.evaluate(() => document.querySelectorAll("[data-winshot-corner]").forEach((d) => d.remove()));
  }
}

/** Compare the frame against `__screenshots__/<dir>/<name>`; also write it to `shotsDir` when given. */
export async function winShot(page: Page, frame: Locator, dir: string, name: string, shotsDir?: string): Promise<void> {
  await page.mouse.move(0, page.viewportSize()!.height - 1); // no hover tint in a baseline
  await withCorners(page, frame, async (clip, mask) => {
    await expect(page).toHaveScreenshot([dir, name], { clip, mask });
    if (shotsDir) { mkdirSync(shotsDir, { recursive: true }); await page.screenshot({ path: `${shotsDir}/${name}`, clip, mask }); }
  });
}

/** The frame exactly as `winShot` compares it, as a PNG buffer (no baseline). */
export const winShotBuffer = (page: Page, frame: Locator): Promise<Buffer> =>
  withCorners(page, frame, (clip, mask) => page.screenshot({ clip, mask }));
