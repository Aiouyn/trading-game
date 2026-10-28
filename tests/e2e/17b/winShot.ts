import { expect, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

type Clip = { x: number; y: number; width: number; height: number };

/** A corner square to mask, in whole device pixels. */
type Square = { x: number; y: number; w: number; h: number };

/** An element's border box and its rounded bottom-left radius (ceil), read in the page. */
type Rounded = { x: number; y: number; width: number; height: number; r: number };

/**
 * The four r×r corner squares of a rounded box (none when r is 0), widened to the pixel grid: a control can sit at a
 * fractional offset, and a half-covered pixel would still show the corner's antialiasing through the mask.
 */
const cornerSquares = ({ x, y, width, height, r }: Rounded): Square[] => {
  if (r === 0) return [];
  const snap = (sx: number, sy: number): Square => {
    const [l, t] = [Math.floor(sx), Math.floor(sy)];
    return { x: l, y: t, w: Math.ceil(sx + r) - l, h: Math.ceil(sy + r) - t };
  };
  return [snap(x, y), snap(x + width - r, y), snap(x, y + height - r), snap(x + width - r, y + height - r)];
};

/**
 * Run `fn` with the frame's clip and its corner masks. Rounded corners are antialiased by the host's rasteriser, one or
 * two levels differently between hosts and between page loads (CI's Chromium drew 22 window-corner pixels 1-2 levels off
 * the box's, PR #92 run 40697141021; the BR-10 asset select's left corners went 1 level off on 3 of 5 phone loads, PR #98
 * QA). So only r×r corner squares are masked: the `.win` frame's four, and the four of each visible element in `rounded`
 * (rounded controls inside the frame). Every other pixel, edge rows and columns included, is compared. The phone app view
 * has no rounded corners of its own.
 */
async function withCorners<T>(page: Page, frame: Locator, rounded: Locator | undefined, fn: (clip: Clip, mask: Locator[]) => Promise<T>): Promise<T> {
  const b = (await frame.boundingBox())!;
  const clip = { x: b.x, y: b.y, width: b.width, height: b.height };
  const own: Rounded[] = await frame.evaluate((el) => {
    const b = el.getBoundingClientRect();
    return el.classList.contains("win") ? [{ x: b.x, y: b.y, width: b.width, height: b.height, r: Math.ceil(parseFloat(getComputedStyle(el).borderBottomLeftRadius) || 0) }] : [];
  });
  const controls: Rounded[] = rounded ? await rounded.evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => {
    const b = e.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height, r: Math.ceil(parseFloat(getComputedStyle(e).borderBottomLeftRadius) || 0) };
  })) : [];
  const squares = [...own, ...controls].flatMap(cornerSquares);
  if (squares.length === 0) return fn(clip, []);
  await page.evaluate((squares) => {
    for (const { x, y, w, h } of squares) {
      const d = document.createElement("div");
      d.dataset.winshotCorner = "";
      d.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${w}px;height:${h}px;pointer-events:none;z-index:2147483647`;
      document.body.append(d);
    }
  }, squares);
  try {
    return await fn(clip, [page.locator("[data-winshot-corner]")]);
  } finally {
    await page.evaluate(() => document.querySelectorAll("[data-winshot-corner]").forEach((d) => d.remove()));
  }
}

/**
 * Compare the frame against `__screenshots__/<dir>/<name>`; also write it to `shotsDir` when given. `rounded`: rounded
 * controls in the frame whose r×r corner squares are masked too.
 */
export async function winShot(page: Page, frame: Locator, dir: string, name: string, shotsDir?: string, rounded?: Locator): Promise<void> {
  await page.mouse.move(0, page.viewportSize()!.height - 1); // no hover tint in a baseline
  await withCorners(page, frame, rounded, async (clip, mask) => {
    await expect(page).toHaveScreenshot([dir, name], { clip, mask });
    if (shotsDir) { mkdirSync(shotsDir, { recursive: true }); await page.screenshot({ path: `${shotsDir}/${name}`, clip, mask }); }
  });
}

/** The frame exactly as `winShot` compares it, as a PNG buffer (no baseline). */
export const winShotBuffer = (page: Page, frame: Locator, rounded?: Locator): Promise<Buffer> =>
  withCorners(page, frame, rounded, (clip, mask) => page.screenshot({ clip, mask }));
