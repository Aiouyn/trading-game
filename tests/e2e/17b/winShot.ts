import { expect, test, type Locator, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { decodePng, differingPixels, encodePng, type Rgba } from "./png";

type Clip = { x: number; y: number; width: number; height: number };

/** A corner square to mask, in whole device pixels. */
type Square = { x: number; y: number; w: number; h: number };

/** An element's border box and its rounded bottom-left radius as drawn (a pill's 999px clamps to half its side; ceil), read in the page. */
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
async function maskSquares(frame: Locator, rounded: Locator | undefined): Promise<Square[]> {
  const own: Rounded[] = await frame.evaluate((el) => {
    const b = el.getBoundingClientRect();
    return el.classList.contains("win") ? [{ x: b.x, y: b.y, width: b.width, height: b.height, r: Math.ceil(Math.min(parseFloat(getComputedStyle(el).borderBottomLeftRadius) || 0, b.width / 2, b.height / 2)) }] : [];
  });
  const controls: Rounded[] = rounded ? await rounded.evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => {
    const b = e.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height, r: Math.ceil(Math.min(parseFloat(getComputedStyle(e).borderBottomLeftRadius) || 0, b.width / 2, b.height / 2)) };
  })) : [];
  return [...own, ...controls].flatMap(cornerSquares);
}

async function withCorners<T>(page: Page, frame: Locator, rounded: Locator | undefined, fn: (clip: Clip, mask: Locator[], squares: Square[]) => Promise<T>): Promise<T> {
  const b = (await frame.boundingBox())!;
  const clip = { x: b.x, y: b.y, width: b.width, height: b.height };
  const squares = await maskSquares(frame, rounded);
  if (squares.length === 0) return fn(clip, [], squares);
  await page.evaluate((squares) => {
    for (const { x, y, w, h } of squares) {
      const d = document.createElement("div");
      d.dataset.winshotCorner = "";
      d.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${w}px;height:${h}px;pointer-events:none;z-index:2147483647`;
      document.body.append(d);
    }
  }, squares);
  try {
    return await fn(clip, [page.locator("[data-winshot-corner]")], squares);
  } finally {
    await page.evaluate(() => document.querySelectorAll("[data-winshot-corner]").forEach((d) => d.remove()));
  }
}

/** Where toHaveScreenshot([dir, name]) keeps its baseline (snapshotPath types only `kind` with a single name segment). */
const baselinePath = (dir: string, name: string) => join(dirname(test.info().snapshotPath("_.png", { kind: "screenshot" })), dir, name);

/** The masked capture, with the same options as the toHaveScreenshot config (playwright.config.ts). */
const capture = (page: Page, clip: Clip, mask: Locator[]) => page.screenshot({ clip, mask, animations: "disabled", caret: "hide", scale: "css" });

/**
 * Every RGBA byte of `actual` equals the baseline at `path`. Playwright's comparator skips pixels it classes as antialiased
 * even at threshold 0, and a pixel touching a magenta mask square always looks antialiased, so it alone leaves a 1 px ring
 * round every square unchecked (PR #98 QA round 2: 3 red px there passed 5 shots). Masked pixels are the same magenta in
 * both images, so the masks still hold. With --update-snapshots (all / changed) a differing baseline is rewritten from
 * `actual`, because toHaveScreenshot leaves one that differs only in pixels it skips. On a mismatch the diff (changed
 * pixels red, the rest dimmed), the actual image and the first differing pixels are attached; the check is soft, so every
 * shot of a test reports.
 */
function expectExact(path: string, actual: Buffer, name: string) {
  const info = test.info();
  const update = info.config.updateSnapshots === "all" || info.config.updateSnapshots === "changed";
  expect(existsSync(path), `baseline ${path}`).toBe(true);
  const want = decodePng(readFileSync(path)), got = decodePng(actual);
  const sameSize = want.width === got.width && want.height === got.height;
  const diff = sameSize ? differingPixels(want, got) : [];
  if (sameSize && diff.length === 0) return;
  if (update) { writeFileSync(path, actual); return; }
  const report = sameSize
    ? `${diff.length} px differ; first: ${diff.slice(0, 12).map((p) => {
      const [x, y, i] = [p % got.width, Math.floor(p / got.width), p * 4];
      return `(${x},${y}) ${[...want.data.subarray(i, i + 4)].join(".")} → ${[...got.data.subarray(i, i + 4)].join(".")}`;
    }).join(", ")}`
    : `size ${got.width}x${got.height}, baseline ${want.width}x${want.height}`;
  if (sameSize) {
    const out: Rgba = { width: got.width, height: got.height, data: new Uint8Array(got.data.length) };
    for (let i = 0; i < got.data.length; i += 4) out.data.set([got.data[i]! >> 2, got.data[i + 1]! >> 2, got.data[i + 2]! >> 2, 255], i);
    for (const p of diff) out.data.set([255, 0, 0, 255], p * 4);
    const diffPath = info.outputPath(name.replace(/\.png$/, "-exact-diff.png"));
    writeFileSync(diffPath, encodePng(out));
    void info.attach(`${name} exact diff`, { path: diffPath, contentType: "image/png" });
  }
  void info.attach(`${name} exact actual`, { body: actual, contentType: "image/png" });
  expect.soft(sameSize && diff.length === 0, `${name}: pixel-exact match with the baseline: ${report}`).toBe(true);
}

/**
 * Compare the frame against `__screenshots__/<dir>/<name>`, with toHaveScreenshot and then pixel-exactly (expectExact);
 * also write it to `shotsDir` when given. `rounded`: rounded
 * controls in the frame whose r×r corner squares are masked too.
 */
export async function winShot(page: Page, frame: Locator, dir: string, name: string, shotsDir?: string, rounded?: Locator): Promise<void> {
  await page.mouse.move(0, page.viewportSize()!.height - 1); // no hover tint in a baseline
  await withCorners(page, frame, rounded, async (clip, mask) => {
    await expect(page).toHaveScreenshot([dir, name], { clip, mask });
    const actual = await capture(page, clip, mask);
    expectExact(baselinePath(dir, name), actual, name);
    if (shotsDir) { mkdirSync(shotsDir, { recursive: true }); writeFileSync(`${shotsDir}/${name}`, actual); }
  });
}

/**
 * Independent of maskSquares, read again from the DOM: the squares are exactly the four r×r corners of each rounded box
 * (the `.win` frame, each visible `rounded` control with a radius), each edge widened outward to the pixel grid.
 */
async function expectCornerSquares(frame: Locator, rounded: Locator | undefined, squares: Square[]) {
  type Box = { x: number; y: number; right: number; bottom: number; r: number };
  const own: Box[] = await frame.evaluate((el) => {
    const b = el.getBoundingClientRect();
    return el.classList.contains("win") ? [{ x: b.x, y: b.y, right: b.right, bottom: b.bottom, r: Math.ceil(Math.min(parseFloat(getComputedStyle(el).borderBottomLeftRadius) || 0, b.width / 2, b.height / 2)) }] : [];
  });
  const controls: Box[] = rounded ? await rounded.evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => {
    const b = e.getBoundingClientRect();
    return { x: b.x, y: b.y, right: b.right, bottom: b.bottom, r: Math.ceil(Math.min(parseFloat(getComputedStyle(e).borderBottomLeftRadius) || 0, b.width / 2, b.height / 2)) };
  })) : [];
  const span = (from: number, to: number) => [Math.floor(from), Math.ceil(to) - Math.floor(from)] as const;
  const want = [...own, ...controls].filter((b) => b.r > 0).flatMap((b) => [span(b.x, b.x + b.r), span(b.right - b.r, b.right)].flatMap(([x, w]) =>
    [span(b.y, b.y + b.r), span(b.bottom - b.r, b.bottom)].map(([y, h]) => `${x},${y} ${w}x${h}`)));
  expect(squares.map((q) => `${q.x},${q.y} ${q.w}x${q.h}`).sort(), "mask squares: the r×r corners of each rounded box").toEqual(want.sort());
}

/**
 * The page held still: paint every pixel of the 1 px ring round every mask square (except ring pixels inside another
 * square or outside the frame) in the inverse of its colour, and every one must change the masked capture, and nothing
 * else may; then paint every pixel inside every square, and the capture must not change at all. Pixel-exact, as winShot
 * compares. Returns the counts so the caller can check there was something to test.
 */
export async function expectOnlySquaresMasked(page: Page, frame: Locator, rounded?: Locator): Promise<{ squares: number; ring: number; inside: number }> {
  return withCorners(page, frame, rounded, async (clip, mask, squares) => {
    await expectCornerSquares(frame, rounded, squares);
    for (const v of [clip.x, clip.y, clip.width, clip.height]) expect(Number.isInteger(v), `frame box on whole pixels: ${JSON.stringify(clip)}`).toBe(true);
    const base = decodePng(await capture(page, clip, mask));
    const inSquare = (x: number, y: number) => squares.some((q) => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h);
    const inClip = (x: number, y: number) => x >= clip.x && x < clip.x + clip.width && y >= clip.y && y < clip.y + clip.height;
    const key = (x: number, y: number) => (y - clip.y) * base.width + (x - clip.x);
    const ring = new Map<number, [number, number]>();
    for (const q of squares) {
      for (let x = q.x - 1; x <= q.x + q.w; x++) for (const y of [q.y - 1, q.y + q.h]) ring.set(key(x, y), [x, y]);
      for (let y = q.y; y < q.y + q.h; y++) for (const x of [q.x - 1, q.x + q.w]) ring.set(key(x, y), [x, y]);
    }
    for (const [k, [x, y]] of ring) if (inSquare(x, y) || !inClip(x, y)) ring.delete(k);
    const inside: [number, number][] = squares.flatMap((q) => Array.from({ length: q.w * q.h }, (_, i): [number, number] => [q.x + (i % q.w), q.y + Math.floor(i / q.w)])).filter(([x, y]) => inClip(x, y));
    const paint = async (px: [number, number][]) => {
      const dots = px.map(([x, y]) => { const i = key(x, y) * 4; return [x, y, 255 - base.data[i]!, 255 - base.data[i + 1]!, 255 - base.data[i + 2]!] as const; });
      await page.evaluate((dots) => {
        for (const [x, y, r, g, b] of dots) {
          const d = document.createElement("div");
          d.dataset.winshotDot = "";
          d.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:1px;height:1px;background:rgb(${r},${g},${b});pointer-events:none;z-index:2147483646`;
          document.body.append(d);
        }
      }, dots);
      const changed = differingPixels(base, decodePng(await capture(page, clip, mask)));
      await page.evaluate(() => document.querySelectorAll("[data-winshot-dot]").forEach((d) => d.remove()));
      return changed;
    };
    const ringChanged = new Set(await paint([...ring.values()]));
    const fmt = (k: number) => `(${clip.x + (k % base.width)},${clip.y + Math.floor(k / base.width)})`;
    expect([...ring.keys()].filter((k) => !ringChanged.has(k)).map(fmt), "ring pixels the masked capture missed").toEqual([]);
    expect([...ringChanged].filter((k) => !ring.has(k)).map(fmt), "pixels that changed but weren't painted").toEqual([]);
    expect((await paint(inside)).map(fmt), "pixels inside a square that showed through the mask").toEqual([]);
    return { squares: squares.length, ring: ring.size, inside: inside.length };
  });
}
