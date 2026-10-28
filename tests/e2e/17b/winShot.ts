import { expect, test, type Locator, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { decodePng, differingPixels, encodePng, type Rgba } from "./png";

type Clip = { x: number; y: number; width: number; height: number };

/** A horizontal run of masked pixels, in whole device pixels (one row high). */
type Run = { x: number; y: number; w: number };

/** An element's border box and its bottom-left radius as drawn (CSS clamps it to half the shorter side), read in the page. */
type Rounded = { x: number; y: number; width: number; height: number; r: number };

/**
 * Half-width of the masked band along each corner arc: a pixel of a corner's r×r box is masked when its centre lies
 * within r ± BAND of the arc centre. The host's corner noise is antialiasing on the arc (a pixel the edge crosses has its
 * centre within √½ ≈ 0.71 of it), so the band covers it with margin and leaves the box's inside (label text) and outside
 * compared.
 */
export const BAND = 1.5;

/**
 * The pixels of the band along the four corner arcs of a rounded box (none when r is 0). A corner's box is widened to the
 * pixel grid, since a control can sit at a fractional offset; the distance is measured from each pixel's centre.
 */
const cornerBand = ({ x, y, width, height, r }: Rounded): [number, number][] => {
  if (r === 0) return [];
  const out: [number, number][] = [];
  for (const [cx, x0] of [[x + r, x], [x + width - r, x + width - r]] as const) {
    for (const [cy, y0] of [[y + r, y], [y + height - r, y + height - r]] as const) {
      for (let py = Math.floor(y0); py < Math.ceil(y0 + r); py++) {
        for (let px = Math.floor(x0); px < Math.ceil(x0 + r); px++) {
          if (Math.abs(Math.hypot(px + 0.5 - cx, py + 0.5 - cy) - r) <= BAND) out.push([px, py]);
        }
      }
    }
  }
  return out;
};

/** Distinct pixels as row runs, so the mask is a few divs per corner and not one per pixel. */
function toRuns(px: [number, number][]): Run[] {
  const sorted = [...new Map(px.map(([x, y]) => [`${y},${x}`, [x, y] as const])).values()].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const runs: Run[] = [];
  for (const [x, y] of sorted) {
    const last = runs.at(-1);
    if (last && last.y === y && last.x + last.w === x) last.w++;
    else runs.push({ x, y, w: 1 });
  }
  return runs;
}

/**
 * The masked pixels of a shot. Rounded corners are antialiased by the host's rasteriser, one or two levels differently
 * between hosts and between page loads (CI's Chromium drew 22 window-corner pixels 1-2 levels off the box's, PR #92 run
 * 40697141021; the BR-10 asset select's left corners went 1 level off on 3 of 5 phone loads, PR #98 QA; the WIR-9 detail
 * kind chip's arcs, PR #98 round 2). So only the band along each corner arc is masked (cornerBand): the `.win` frame's
 * four, and the four of each visible element in `rounded` (rounded controls inside the frame). Every other pixel, the
 * corners' insides (a pill's label) and outsides included, is compared. The phone app view has no rounded corners of its own.
 */
async function maskRuns(frame: Locator, rounded: Locator | undefined): Promise<{ runs: Run[]; corners: number }> {
  const own: Rounded[] = await frame.evaluate((el) => {
    const b = el.getBoundingClientRect();
    return el.classList.contains("win") ? [{ x: b.x, y: b.y, width: b.width, height: b.height, r: Math.min(parseFloat(getComputedStyle(el).borderBottomLeftRadius) || 0, b.width / 2, b.height / 2) }] : [];
  });
  const controls: Rounded[] = rounded ? await rounded.evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => {
    const b = e.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height, r: Math.min(parseFloat(getComputedStyle(e).borderBottomLeftRadius) || 0, b.width / 2, b.height / 2) };
  })) : [];
  const boxes = [...own, ...controls].filter((b) => b.r > 0);
  return { runs: toRuns(boxes.flatMap(cornerBand)), corners: boxes.length * 4 };
}

type Masked = { clip: Clip; mask: Locator[]; runs: Run[]; corners: number };

async function withCorners<T>(page: Page, frame: Locator, rounded: Locator | undefined, fn: (m: Masked) => Promise<T>): Promise<T> {
  const b = (await frame.boundingBox())!;
  const clip = { x: b.x, y: b.y, width: b.width, height: b.height };
  const { runs, corners } = await maskRuns(frame, rounded);
  if (runs.length === 0) return fn({ clip, mask: [], runs, corners });
  await page.evaluate((runs) => {
    for (const { x, y, w } of runs) {
      const d = document.createElement("div");
      d.dataset.winshotCorner = "";
      d.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${w}px;height:1px;pointer-events:none;z-index:2147483647`;
      document.body.append(d);
    }
  }, runs);
  try {
    return await fn({ clip, mask: [page.locator("[data-winshot-corner]")], runs, corners });
  } finally {
    await page.evaluate(() => document.querySelectorAll("[data-winshot-corner]").forEach((d) => d.remove()));
  }
}

/** Where toHaveScreenshot([dir, name]) keeps its baseline (snapshotPath types only `kind` with a single name segment). */
const baselinePath = (dir: string, name: string) => join(dirname(test.info().snapshotPath("_.png", { kind: "screenshot" })), dir, name);

/** The masked capture, with the same options as the toHaveScreenshot config (playwright.config.ts). */
const capture = (page: Page, clip: Clip, mask: Locator[]) => page.screenshot({ clip, mask, animations: "disabled", caret: "hide", scale: "css" });

/** More than one pixel value: a decoder that returned a blank image would otherwise match any blank capture. */
const varied = ({ data }: Rgba) => {
  const px = new Uint32Array(data.buffer, data.byteOffset, data.byteLength / 4);
  return px.some((v) => v !== px[0]);
};

/** How winShot reports the pixel-exact result; the default is a soft expect, so every shot of a test reports. */
export type ExactCheck = (ok: boolean, message: string) => void;
const softCheck: ExactCheck = (ok, message) => expect.soft(ok, message).toBe(true);

/**
 * Every RGBA byte of `actual` equals the baseline at `path`. Playwright's comparator skips pixels it classes as antialiased
 * even at threshold 0, and a pixel touching a magenta mask pixel always looks antialiased, so it alone leaves a 1 px ring
 * round every masked band unchecked (PR #98 QA round 2: 3 red px there passed 5 shots). Masked pixels are the same magenta
 * in both images, so the masks still hold. Both images must decode to more than one pixel value (PR #98 QA round 3: an
 * all-zero decoder passed every shot). With --update-snapshots (all / changed) a differing baseline is rewritten from
 * `actual`, because toHaveScreenshot leaves one that differs only in pixels it skips. On a mismatch the diff (changed
 * pixels red, the rest dimmed), the actual image and the first differing pixels are attached, and `check` gets the report.
 */
function expectExact(path: string, actual: Buffer, name: string, check: ExactCheck) {
  const info = test.info();
  const update = info.config.updateSnapshots === "all" || info.config.updateSnapshots === "changed";
  expect(existsSync(path), `baseline ${path}`).toBe(true);
  const want = decodePng(readFileSync(path)), got = decodePng(actual);
  expect(varied(want), `${name}: the decoded baseline has more than one pixel value`).toBe(true);
  expect(varied(got), `${name}: the decoded capture has more than one pixel value`).toBe(true);
  const sameSize = want.width === got.width && want.height === got.height;
  const diff = sameSize ? differingPixels(want, got) : [];
  if (sameSize && diff.length === 0) return check(true, `${name}: pixel-exact match with the baseline`);
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
  check(false, `${name}: pixel-exact match with the baseline: ${report}`);
}

export type WinShotOptions = {
  /** Also write the capture here. */
  shotsDir?: string | undefined;
  /** Rounded controls in the frame whose corner arc bands are masked too. */
  rounded?: Locator;
  /** Receives the pixel-exact result instead of a soft expect (winShot's own failure test). */
  check?: ExactCheck;
};

/**
 * Compare the frame against `__screenshots__/<dir>/<name>`, with toHaveScreenshot and then pixel-exactly (expectExact),
 * with the corner arc bands masked (maskRuns).
 */
export async function winShot(page: Page, frame: Locator, dir: string, name: string, { shotsDir, rounded, check = softCheck }: WinShotOptions = {}): Promise<void> {
  await page.mouse.move(0, page.viewportSize()!.height - 1); // no hover tint in a baseline
  await withCorners(page, frame, rounded, async ({ clip, mask }) => {
    await expect(page).toHaveScreenshot([dir, name], { clip, mask });
    const actual = await capture(page, clip, mask);
    expectExact(baselinePath(dir, name), actual, name, check);
    if (shotsDir) { mkdirSync(shotsDir, { recursive: true }); writeFileSync(`${shotsDir}/${name}`, actual); }
  });
}

/**
 * Independent of maskRuns, read again from the DOM and tested pixel by pixel: a pixel is masked iff, for some rounded box
 * (the `.win` frame, each visible `rounded` control with a radius), it overlaps one of the box's r×r corners and its centre
 * is within r ± 1.5 of that corner's arc centre.
 */
async function expectBand(frame: Locator, rounded: Locator | undefined, runs: Run[]) {
  type Box = { x: number; y: number; right: number; bottom: number; r: number };
  const own: Box[] = await frame.evaluate((el) => {
    const b = el.getBoundingClientRect();
    return el.classList.contains("win") ? [{ x: b.x, y: b.y, right: b.right, bottom: b.bottom, r: Math.min(parseFloat(getComputedStyle(el).borderBottomLeftRadius) || 0, b.width / 2, b.height / 2) }] : [];
  });
  const controls: Box[] = rounded ? await rounded.evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => {
    const b = e.getBoundingClientRect();
    return { x: b.x, y: b.y, right: b.right, bottom: b.bottom, r: Math.min(parseFloat(getComputedStyle(e).borderBottomLeftRadius) || 0, b.width / 2, b.height / 2) };
  })) : [];
  const want = new Set<string>();
  for (const b of [...own, ...controls].filter((q) => q.r > 0)) {
    for (let py = Math.floor(b.y); py < Math.ceil(b.bottom); py++) {
      for (let px = Math.floor(b.x); px < Math.ceil(b.right); px++) {
        const xs = [px < b.x + b.r ? b.x + b.r : NaN, px + 1 > b.right - b.r ? b.right - b.r : NaN];
        const ys = [py < b.y + b.r ? b.y + b.r : NaN, py + 1 > b.bottom - b.r ? b.bottom - b.r : NaN];
        if (xs.some((cx) => ys.some((cy) => Math.abs(Math.hypot(px + 0.5 - cx, py + 0.5 - cy) - b.r) <= 1.5))) want.add(`${px},${py}`);
      }
    }
  }
  const got = runs.flatMap(({ x, y, w }) => Array.from({ length: w }, (_, i) => `${x + i},${y}`));
  expect(got.length, "mask runs don't overlap").toBe(new Set(got).size);
  expect(got.sort(), "masked pixels: the r ± 1.5 band along each corner arc of each rounded box").toEqual([...want].sort());
}

/**
 * The page held still, pixel-exact as winShot compares: paint every pixel of the 1 px ring round the mask (every unmasked
 * pixel of the frame next to a masked one, so both sides of each band and its ends) in the inverse of its colour, and every
 * one must change the masked capture, and nothing else may; then paint every masked pixel, and the capture must not change
 * at all. For each visible `labels` element, no pixel of its text ink (the pixels that change when its text is made transparent)
 * is masked, and painting the first ink column changes every one of its pixels in the capture. Returns the counts so the
 * caller can check there was something to test.
 */
export async function expectOnlyBandMasked(page: Page, frame: Locator, rounded?: Locator, labels?: Locator): Promise<{ corners: number; masked: number; ring: number; ink: number }> {
  return withCorners(page, frame, rounded, async ({ clip, mask, runs, corners }) => {
    await expectBand(frame, rounded, runs);
    for (const v of [clip.x, clip.y, clip.width, clip.height]) expect(Number.isInteger(v), `frame box on whole pixels: ${JSON.stringify(clip)}`).toBe(true);
    const base = decodePng(await capture(page, clip, mask));
    const key = (x: number, y: number) => (y - clip.y) * base.width + (x - clip.x);
    const inClip = (x: number, y: number) => x >= clip.x && x < clip.x + clip.width && y >= clip.y && y < clip.y + clip.height;
    const masked = new Map<number, [number, number]>();
    for (const { x, y, w } of runs) for (let i = 0; i < w; i++) if (inClip(x + i, y)) masked.set(key(x + i, y), [x + i, y]);
    const ring = new Map<number, [number, number]>();
    for (const [, [x, y]] of masked) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const [nx, ny] = [x + dx, y + dy];
        if (inClip(nx, ny) && !masked.has(key(nx, ny))) ring.set(key(nx, ny), [nx, ny]);
      }
    }
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
      return new Set(changed);
    };
    const fmt = (k: number) => `(${clip.x + (k % base.width)},${clip.y + Math.floor(k / base.width)})`;
    const ringChanged = await paint([...ring.values()]);
    expect([...ring.keys()].filter((k) => !ringChanged.has(k)).map(fmt), "ring pixels the masked capture missed").toEqual([]);
    expect([...ringChanged].filter((k) => !ring.has(k)).map(fmt), "pixels that changed but weren't painted").toEqual([]);
    expect([...await paint([...masked.values()])].map(fmt), "masked pixels that showed through the mask").toEqual([]);
    let ink = 0;
    const plain = decodePng(await capture(page, clip, []));
    for (const el of labels ? await labels.all() : []) {
      if (!(await el.isVisible())) continue;
      const what = await el.evaluate((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join(".")} "${(e.textContent ?? "").trim().slice(0, 24)}"`);
      await el.evaluate((e) => {
        e.setAttribute("data-winshot-ink", "");
        const st = document.createElement("style");
        st.dataset.winshotInk = "";
        st.textContent = "[data-winshot-ink], [data-winshot-ink] * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; }";
        document.head.append(st);
      });
      const blank = decodePng(await capture(page, clip, []));
      await el.evaluate((e) => { e.removeAttribute("data-winshot-ink"); document.querySelectorAll("style[data-winshot-ink]").forEach((s) => s.remove()); });
      const inked = differingPixels(plain, blank).map((k) => [clip.x + (k % plain.width), clip.y + Math.floor(k / plain.width)] as [number, number]);
      expect(inked.length, `${what}: text ink (pixels that change with its text colour)`).toBeGreaterThan(0);
      expect(inked.filter(([x, y]) => masked.has(key(x, y))).map(([x, y]) => fmt(key(x, y))), `${what}: ink pixels under the mask`).toEqual([]);
      const first = Math.min(...inked.map(([x]) => x));
      const column = inked.filter(([x]) => x === first);
      const changed = await paint(column);
      expect(column.map(([x, y]) => key(x, y)).filter((k) => !changed.has(k)).map(fmt), `${what}: first ink column pixels the masked capture missed`).toEqual([]);
      ink += column.length;
    }
    return { corners, masked: masked.size, ring: ring.size, ink };
  });
}
