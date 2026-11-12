// Broker trend lines against the production build, real timers, real canvas. A signed-in player draws a two-point
// line (the plot does not pan meanwhile), selects it, drags an end, deletes it (key and button) and cancels a line in
// progress (Esc and Cancel). The line is checked against the library's own time / price -> pixel mapping after a zoom,
// a pan, new server ticks and a window resize. It is kept on reload, never shows on another asset, for the guest or for
// another account on this device. Phone 390 with touch: tap-tap placing, the end dragged by touch, pan by touch
// outside drawing mode only.
import { mkdirSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const SHOTS = process.env.TREND_SHOTS_DIR ?? "";
async function shot(page: Page, name: string) {
  const buf = await page.screenshot();
  await test.info().attach(name, { body: buf, contentType: "image/png" });
  if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${name}.png` }); }
}
async function register(request: APIRequestContext, baseURL: string, handle: string) {
  const res = await request.post("/api/auth/register", { headers: { origin: baseURL }, data: { handle, password: "local-trend-test" } });
  expect(res.status(), await res.text()).toBe(201);
}
type Hook = { visible: () => { from: number; to: number } | null; data: () => unknown[]; coord: (t: number, p: number) => { x: number | null; y: number | null } };
const hook = <T,>(page: Page, fn: string) => page.evaluate((k) => {
  const h = (window as unknown as { __quayChart?: Record<string, () => unknown> }).__quayChart;
  return (h?.[k]?.() ?? null) as never;
}, fn) as Promise<T>;
const signedBr = (page: Page) => page.locator('[data-testid="broker"]:has([data-testid="br-ticker"]):has([data-testid="market-tick"])').first();
const anyBr = (page: Page) => page.locator('[data-testid="broker"]:has([data-testid="br-ticker"])').first();

async function plotted(page: Page, source: "server" | "demo", br = signedBr(page)) {
  const c = br.getByTestId("br-chart");
  await expect(c).toHaveAttribute("data-state", "plot", { timeout: 25_000 });
  await expect(c.getByTestId("br-chart-source")).toHaveAttribute("data-source", source);
  await expect(c.getByTestId("br-trend-layer")).toBeAttached({ timeout: 10_000 });
  await expect(c.getByTestId("br-trend-tool")).toBeVisible();
}
const lineIds = (page: Page) => page.locator('[data-testid="br-trend-layer"] g.cc-trend').evaluateAll((gs) => gs.map((g) => (g as SVGElement).dataset.id!));
const anchors = (page: Page, id: string) => page.getByTestId(`br-trend-${id}`).evaluate((g) => {
  const d = (g as SVGElement).dataset;
  return { a: { t: Number(d.aT), p: Number(d.aP) }, b: { t: Number(d.bT), p: Number(d.bP) } };
});

/** The drawn line's ends vs the library's own pixel for the same tick and price (within half a pixel). */
async function aligned(page: Page, id: string) {
  const r = await page.evaluate((lid) => {
    const g = document.querySelector<SVGElement>(`[data-testid="br-trend-${lid}"]`)!;
    const l = g.querySelector('[data-testid="br-trend-line"]')!;
    const h = (window as unknown as { __quayChart: Hook }).__quayChart;
    const d = g.dataset;
    return {
      line: ["x1", "y1", "x2", "y2"].map((k) => Number(l.getAttribute(k))),
      lib: [h.coord(Number(d.aT), Number(d.aP)), h.coord(Number(d.bT), Number(d.bP))],
    };
  }, id);
  const [a, b] = r.lib;
  expect(a!.x, "start tick inside the plotted bars").not.toBeNull();
  expect(b!.x, "end tick inside the plotted bars").not.toBeNull();
  const want = [a!.x!, a!.y!, b!.x!, b!.y!];
  for (let i = 0; i < 4; i++) expect(Math.abs(r.line[i]! - want[i]!), `coord ${i}: drawn ${r.line} vs library ${want}`).toBeLessThanOrEqual(0.5);
  return r.line;
}
/** The plot's box, narrowed to the x span of the plotted bars (a short history leaves the left of the plot empty, and
 *  a point there has no bar for the library to map: the layer extends time past the bars, the library does not). */
async function plotBox(page: Page) {
  const b = (await page.getByTestId("br-chart-canvas").first().boundingBox())!;
  const span = await page.evaluate(() => {
    const h = (window as unknown as { __quayChart: Hook }).__quayChart;
    const d = h.data() as { time: number; close: number }[];
    return [h.coord(d[0]!.time / 120, d[0]!.close).x, h.coord(d[d.length - 1]!.time / 120, d[d.length - 1]!.close).x];
  });
  const x0 = Math.max(0, span[0] ?? 0) + 4, x1 = Math.min(b.width - 80, span[1] ?? b.width) - 4; // left of the price axis
  return { x: b.x + x0, y: b.y, width: Math.max(20, x1 - x0), height: b.height };
}

/** Bars recorded, their drawn spacing (px, from the library's own mapping), the widest spacing the chart allows, and how
 *  many bars the plot holds at that widest spacing. */
async function geometry(page: Page) {
  return page.evaluate(() => {
    const h = (window as unknown as { __quayChart: Hook & { chart: () => { timeScale: { maxBarSpacing: number } } } }).__quayChart;
    const d = h.data() as { time: number; close: number }[];
    const v = h.visible()!;
    const max = h.chart().timeScale.maxBarSpacing;
    const x = (i: number) => h.coord(d[i]!.time / 120, d[i]!.close).x ?? NaN;
    const spacing = d.length >= 2 ? x(d.length - 1) - x(d.length - 2) : max;
    return { n: d.length, spacing, max, fitAtMax: ((v.to - v.from) * spacing) / max };
  });
}

test("desktop: draw, select, adjust, delete, cancel; aligned through zoom, pan, ticks, resize; kept per account and asset", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "desktop journey; the phone test covers 390 touch");
  test.setTimeout(240_000);
  const ctx = await browser.newContext();
  try {
    const stamp = Date.now().toString(36) + info.workerIndex; // two workers can start in the same ms (--repeat-each)
    await register(ctx.request, baseURL!, `TrA${stamp}`);
    const page = await ctx.newPage();
    await page.goto("/broker?asset=HALC");
    await plotted(page, "server");
    // Enough recorded bars to zoom and pan: more than the plot holds at its widest bar spacing, plus room to pan. Right
    // after a server start there are a few bars (one per tick), drawn at the widest spacing with the left of the plot
    // empty; a wheel zoom-in then does nothing and the fixed left edge leaves no room to pan (from stuck at -3.25 with
    // 9 bars). The view fits the bars when the page loads, so once there are enough, reload: the fitted bars are
    // narrower than the widest spacing, and a zoom-in has room to widen them.
    await expect.poll(async () => { const g = await geometry(page); return g.n - g.fitAtMax; }, { timeout: 120_000, intervals: [1_000] }).toBeGreaterThanOrEqual(4);
    await page.reload();
    await plotted(page, "server");
    const g0 = await geometry(page);
    expect(g0.spacing, `fitted bar spacing below the widest (${JSON.stringify(g0)})`).toBeLessThan(g0.max - 1);
    const chart = signedBr(page).getByTestId("br-chart");
    const tool = chart.getByTestId("br-trend-tool");
    await expect(tool).toHaveText("Trend line");
    await expect(chart.locator(".br-chart-draw")).toHaveAttribute("title", "Lines are kept on this device only");

    // Press, drag, release while placing: a line, and the plot did not pan under it.
    await tool.click();
    await expect(tool).toHaveAttribute("aria-pressed", "true");
    await expect(tool).toHaveText("Cancel line");
    await expect(chart.getByTestId("br-trend-hint")).toHaveText("Click or tap two points on the chart. Esc cancels.");
    let box = await plotBox(page);
    const before = await hook<{ from: number; to: number }>(page, "visible");
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.6);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.3, { steps: 8 });
    await page.mouse.up();
    expect(await hook<{ from: number; to: number }>(page, "visible")).toEqual(before);
    const first = await lineIds(page); expect(first).toHaveLength(1); const l1 = first[0]!; // ids are random
    await expect(tool).toHaveAttribute("aria-pressed", "false");
    await expect(chart.getByTestId("br-trend-handle-a")).toBeVisible(); // placed = selected
    await aligned(page, l1);
    await shot(page, "tl-01-drawn-selected");

    // Tap, tap draws a second one.
    await tool.click();
    await page.mouse.click(box.x + box.width * 0.05, box.y + box.height * 0.1);
    await expect(chart.getByTestId("br-trend-layer")).toHaveAttribute("data-first", "");
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.15, { steps: 4 });
    await expect(chart.getByTestId("br-trend-draft")).toBeVisible();
    await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.2);
    const two = await lineIds(page); expect(two).toHaveLength(2); expect(two[0]).toBe(l1); const l2 = two[1]!;

    // Cancel a line in progress: Esc, then the Cancel button. Nothing is added either way.
    await tool.click();
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.8);
    await expect(chart.getByTestId("br-trend-layer")).toHaveAttribute("data-first", "");
    await page.keyboard.press("Escape");
    await expect(tool).toHaveAttribute("aria-pressed", "false");
    await expect(chart.getByTestId("br-trend-layer")).not.toHaveAttribute("data-first", "");
    await tool.click();
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.8);
    await tool.click(); // "Cancel line"
    await tool.click();
    await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.75); // a fresh first point, not an end
    await expect(chart.getByTestId("br-trend-layer")).toHaveAttribute("data-first", "");
    await page.keyboard.press("Escape");
    expect(await lineIds(page)).toEqual([l1, l2]);

    // Select l1 by pressing on it, drag its end: only that end moves; the line follows the library's mapping.
    const sel = async (id: string) => {
      const [x1, y1, x2, y2] = await aligned(page, id);
      const c = (await page.getByTestId("br-chart-canvas").first().boundingBox())!; // pane pixels start at the canvas
      await page.mouse.click(c.x + (x1! + x2!) / 2, c.y + (y1! + y2!) / 2);
      await expect(chart.getByTestId(`br-trend-${id}`)).toHaveAttribute("aria-pressed", "true");
    };
    await sel(l1);
    const was = await anchors(page, l1);
    const end = chart.getByTestId("br-trend-handle-b");
    const eb = (await end.boundingBox())!;
    await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2);
    await page.mouse.down();
    await page.mouse.move(eb.x - 60, eb.y + 40, { steps: 6 });
    await page.mouse.up();
    const now = await anchors(page, l1);
    expect(now.a).toEqual(was.a);
    expect(now.b.t).toBeLessThan(was.b.t);
    expect(now.b.p).toBeLessThan(was.b.p);
    await aligned(page, l1);
    await shot(page, "tl-02-end-adjusted");

    // Zoom (wheel) and pan (drag on the plot, away from the lines) outside drawing mode: the chart moves, lines follow.
    box = await plotBox(page);
    const v0 = await hook<{ from: number; to: number }>(page, "visible");
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.9);
    await page.mouse.wheel(0, -400);
    // Zoomed = fewer bars in view. (A new bar also moves "from", so a changed "from" alone does not prove the zoom.)
    const span = (v: { from: number; to: number }) => v.to - v.from;
    await expect.poll(async () => span((await hook<{ from: number; to: number }>(page, "visible"))!)).toBeLessThan(span(v0) - 0.5);
    await aligned(page, l1); await aligned(page, l2);
    const v1 = await hook<{ from: number; to: number }>(page, "visible");
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.95);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.95, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => (await hook<{ from: number; to: number }>(page, "visible"))!.from).not.toBe(v1.from);
    await aligned(page, l1); await aligned(page, l2);
    await shot(page, "tl-03-zoomed-panned");
    // New server ticks: a bar is appended and the price scale may rescale; the lines stay on their tick and price.
    const n0 = (await hook<unknown[]>(page, "data")).length;
    await expect.poll(async () => (await hook<unknown[]>(page, "data")).length, { timeout: 20_000, intervals: [500] }).toBeGreaterThan(n0);
    await aligned(page, l1); await aligned(page, l2);

    // Window resize (520): the plot narrows, the lines are re-mapped.
    const win = page.getByTestId("win-broker").filter({ has: page.getByTestId("br-ticker") }).first();
    const rh = (await win.getByTestId("resize-handle").boundingBox())!;
    const xBefore = (await aligned(page, l1))[2];
    await page.mouse.move(rh.x + 5, rh.y + 5);
    await page.mouse.down();
    await page.mouse.move(50, rh.y + 5, { steps: 5 });
    await page.mouse.up();
    expect((await win.boundingBox())!.width).toBe(520);
    await expect.poll(async () => (await aligned(page, l1))[2]).not.toBe(xBefore);
    await aligned(page, l2);
    await shot(page, "tl-04-window-520");

    // Delete: Delete key on a focused line; the button on a selected one.
    await sel(l2);
    await page.keyboard.press("Delete");
    expect(await lineIds(page)).toEqual([l1]);
    await expect(tool).toBeFocused();
    await sel(l1);
    await chart.getByTestId("br-trend-delete").click();
    expect(await lineIds(page)).toEqual([]);
    await expect(chart.getByTestId("br-trend-delete")).toHaveCount(0);

    // One HALC line to keep; reload: the same line (same anchors), aligned.
    await tool.click();
    box = await plotBox(page);
    await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.3);
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.6);
    const [k] = await lineIds(page); const keep = await anchors(page, k!);
    await page.evaluate(() => (window as unknown as { __quayFlush?: () => Promise<void> }).__quayFlush?.());
    await page.reload();
    await plotted(page, "server");
    expect(await lineIds(page)).toEqual([k]);
    expect(await anchors(page, k!)).toEqual(keep);
    await aligned(page, k!);
    await shot(page, "tl-05-after-reload");

    // Another asset: none of HALC's. A line drawn there stays there. (One Broker window at a time: the shell restores
    // saved windows, and the chart hooks follow the last chart mounted.)
    // The close is a layout change the shell queues to IndexedDB; a page load before it commits restores the closed
    // window next to the new one, and the page-wide line list then holds both windows' lines (a 10x run: MRDN's line
    // listed first on the HALC page). So wait for the save before the next load.
    const closeBroker = async () => {
      await page.getByTestId("win-broker").first().getByTestId("win-close").click();
      await expect(page.getByTestId("win-broker")).toHaveCount(0);
      await page.evaluate(() => (window as unknown as { __quayFlush?: () => Promise<void> }).__quayFlush?.());
    };
    await closeBroker();
    await page.goto("/broker?asset=MRDN");
    await plotted(page, "server");
    expect(await lineIds(page)).toEqual([]);
    await signedBr(page).getByTestId("br-trend-tool").click();
    box = await plotBox(page);
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.7);
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.2);
    const [m] = await lineIds(page); const mrdn = await anchors(page, m!);
    await page.evaluate(() => (window as unknown as { __quayFlush?: () => Promise<void> }).__quayFlush?.());
    await closeBroker();
    await page.goto("/broker?asset=HALC");
    await plotted(page, "server");
    expect(await lineIds(page)).toEqual([k]);
    expect(await anchors(page, k!)).toEqual(keep);

    // Signed out on this device: the guest sees none of the account's lines; a guest line stays the guest's.
    await page.getByTestId("account-chip").first().click();
    await page.getByTestId("account-logout").click();
    const g = anyBr(page);
    await expect(g.getByTestId("br-chart").getByTestId("br-chart-source")).toHaveAttribute("data-source", "demo", { timeout: 25_000 });
    await page.getByTestId("win-settings").getByTestId("win-close").click();
    await plotted(page, "demo", g);
    expect(await lineIds(page)).toEqual([]);
    await g.getByTestId("br-trend-tool").click();
    box = await plotBox(page);
    await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.5);
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5);
    const [gl] = await lineIds(page); const guest = await anchors(page, gl!);
    await shot(page, "tl-06-guest-own-line");
    await page.evaluate(() => (window as unknown as { __quayFlush?: () => Promise<void> }).__quayFlush?.());

    // Another account on this device: none of A's, none of the guest's.
    await register(ctx.request, baseURL!, `TrB${stamp}`);
    await page.reload();
    await plotted(page, "server");
    expect(await lineIds(page)).toEqual([]);
    await shot(page, "tl-07-account-b-none");

    // A again: exactly A's HALC line; MRDN still A's MRDN line.
    const signIn = await ctx.request.post("/api/auth/login", { headers: { origin: baseURL! }, data: { handle: `TrA${stamp}`, password: "local-trend-test" } });
    expect(signIn.status(), await signIn.text()).toBe(200);
    await page.reload();
    await plotted(page, "server");
    expect(await lineIds(page)).toEqual([k]);
    expect(await anchors(page, k!)).toEqual(keep);
    expect(keep).not.toEqual(guest);
    await closeBroker();
    await page.goto("/broker?asset=MRDN");
    await plotted(page, "server");
    expect(await anchors(page, m!)).toEqual(mrdn);
    await shot(page, "tl-08-account-a-again");
  } finally {
    await ctx.close();
  }
});

/** The visible range once it has stopped moving: a touch pan glides on (kinetic scroll) after the finger lifts, so a
 *  read right after the first change is mid-glide (CI 43140479723: from 19.65, 18.78, then 16.73 over 700 ms). Settled =
 *  unchanged over 10 consecutive animation frames. */
async function settledVisible(page: Page) {
  await expect.poll(() => page.evaluate(() => new Promise<boolean>((resolve) => {
    const h = (window as unknown as { __quayChart: Hook }).__quayChart;
    const first = JSON.stringify(h.visible());
    let frames = 0;
    const step = () => {
      if (JSON.stringify(h.visible()) !== first) return resolve(false);
      if (++frames >= 10) return resolve(true);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }))).toBe(true);
  return hook<{ from: number; to: number }>(page, "visible");
}

/** A one-finger touch drag through CDP (Playwright's touchscreen only taps). */
async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 8) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y }] });
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  // Chromium's touch emulation drops the click of a tap sent within a few ms of a drag's end (seen on a bare page with
  // no handlers at all); a finger is never that fast, so pause as one would.
  await page.waitForTimeout(400);
}

test("phone 390 touch: tap-tap a line, drag its end, no pan while placing, pan outside it, 44 px controls", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "phone project only");
  test.setTimeout(150_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    await register(ctx.request, baseURL!, `TrP${Date.now().toString(36)}${info.workerIndex}`);
    const page = await ctx.newPage();
    await page.goto("/broker?asset=HALC");
    await plotted(page, "server");
    await expect.poll(async () => (await hook<unknown[]>(page, "data")).length, { timeout: 60_000, intervals: [1_000] }).toBeGreaterThanOrEqual(8);
    const chart = signedBr(page).getByTestId("br-chart");
    await chart.scrollIntoViewIfNeeded();
    const tool = chart.getByTestId("br-trend-tool");
    expect((await tool.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    // Pan by touch outside drawing mode (after a zoom in, so there is room to pan).
    let box = await plotBox(page);
    await chart.getByTestId("br-chart-canvas").focus();
    await page.keyboard.press("+");
    await page.keyboard.press("Escape");
    const v0 = await hook<{ from: number; to: number }>(page, "visible");
    await touchDrag(page, { x: box.x + box.width * 0.3, y: box.y + box.height * 0.8 }, { x: box.x + box.width * 0.7, y: box.y + box.height * 0.8 });
    await expect.poll(async () => (await hook<{ from: number; to: number }>(page, "visible"))!.from).not.toBe(v0.from);

    // Let the preceding pan's kinetic motion finish before measuring a separate drawing gesture.
    let previous: { from: number; to: number } | null = null;
    await expect.poll(async () => {
      const current = await hook<{ from: number; to: number }>(page, "visible");
      const stable = previous !== null && current.from === previous.from && current.to === previous.to;
      previous = current;
      return stable;
    }, { intervals: [100] }).toBe(true);

    // Placing: a touch drag draws (press-drag-release) and does not pan.
    await tool.tap();
    await expect(tool).toHaveAttribute("aria-pressed", "true");
    const v1 = await settledVisible(page);
    box = await plotBox(page);
    await touchDrag(page, { x: box.x + box.width * 0.25, y: box.y + box.height * 0.7 }, { x: box.x + box.width * 0.6, y: box.y + box.height * 0.3 });
    expect(await hook<{ from: number; to: number }>(page, "visible")).toEqual(v1);
    const one = await lineIds(page); expect(one).toHaveLength(1); const l1 = one[0]!;
    await expect(tool).toHaveAttribute("aria-pressed", "false");
    await aligned(page, l1);

    // Tap, tap.
    await tool.tap();
    await expect(tool).toHaveAttribute("aria-pressed", "true");
    await page.touchscreen.tap(box.x + box.width * 0.2, box.y + box.height * 0.3);
    await expect(chart.getByTestId("br-trend-layer")).toHaveAttribute("data-first", "");
    await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.6);
    const two = await lineIds(page); expect(two).toHaveLength(2); expect(two[0]).toBe(l1); const l2 = two[1]!;
    await aligned(page, l2);
    await shot(page, "tl-09-phone-two-lines");

    // The selected line's end by touch (a 32 px grab circle around the 10 px dot).
    const was = await anchors(page, l2);
    const eb = (await chart.getByTestId("br-trend-handle-b").boundingBox())!;
    await touchDrag(page, { x: eb.x + eb.width / 2 + 6, y: eb.y + eb.height / 2 + 6 }, { x: eb.x - 40, y: eb.y - 30 });
    const now = await anchors(page, l2);
    expect(now.a).toEqual(was.a);
    expect(now.b).not.toEqual(was.b);
    await aligned(page, l2);
    const del = chart.getByTestId("br-trend-delete");
    expect((await del.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await shot(page, "tl-10-phone-end-dragged");
    await del.tap();
    expect(await lineIds(page)).toEqual([l1]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  } finally {
    await ctx.close();
  }
});
