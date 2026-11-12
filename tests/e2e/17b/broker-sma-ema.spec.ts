// Broker SMA / EMA overlays against the production build, real timers, real canvas. The player turns each on and off
// (pointer and keyboard), picks its period and reads which overlay and period is drawn (the pressed button, the period
// select, the legend). The drawn line's points are checked against an SMA / EMA computed here from the bars the plot
// shows (its own data), after live ticks, a range change and an asset change, with exactly the overlays that are on
// (no line left from before). A range shorter than the period draws no line and says so. The choices come back on
// reload, per account and for the guest, and never touch the trend lines. Pan and zoom still move the plot, volume is
// still drawn. Phone 390 (touch) and the 520 window: the controls fit, 44 / 28 px targets, the legend sits above the plot.
import { mkdirSync } from "node:fs";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

const SHOTS = process.env.MA_SHOTS_DIR ?? "";
async function shot(page: Page, name: string) {
  const buf = await page.screenshot();
  await test.info().attach(name, { body: buf, contentType: "image/png" });
  if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${name}.png` }); }
}
async function register(request: APIRequestContext, baseURL: string, handle: string) {
  const res = await request.post("/api/auth/register", { headers: { origin: baseURL }, data: { handle, password: "local-ma-test" } });
  expect(res.status(), await res.text()).toBe(201);
}
type Pt = { time: number; close: number };
type Line = { kind: "sma" | "ema"; options: { lineStyle: number; color: string; lineWidth: number }; data: { time: number; value: number }[] };
const hook = <T,>(page: Page, fn: string) => page.evaluate((k) => {
  const h = (window as unknown as { __quayChart?: Record<string, () => unknown> }).__quayChart;
  return (h?.[k]?.() ?? null) as never;
}, fn) as Promise<T>;
const anyBr = (page: Page) => page.locator('[data-testid="broker"]:has([data-testid="br-ticker"])').first();

// The reference math, written out here (not imported): SMA = mean of the last n closes; EMA seeded with the SMA of
// the first n, then c·k + e·(1−k), k = 2/(n+1). No value before the n-th bar.
function refStudy(kind: "sma" | "ema", closes: number[], n: number): (number | null)[] {
  const out: (number | null)[] = closes.map(() => null);
  if (kind === "sma") { for (let i = n - 1; i < closes.length; i++) out[i] = closes.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n; return out; }
  if (closes.length < n) return out;
  let e = closes.slice(0, n).reduce((a, b) => a + b, 0) / n; out[n - 1] = e;
  for (let i = n; i < closes.length; i++) { e = closes[i]! * (2 / (n + 1)) + e * (1 - 2 / (n + 1)); out[i] = e; }
  return out;
}
/** The drawn overlays, kind -> period, read back from the plot and checked against the shown bars' closes. One read
 *  of both (data and lines) per poll, so a tick between them cannot split the comparison. */
async function drawnMatches(page: Page, want: Record<string, number>) {
  await expect.poll(async () => {
    const { data, lines } = await page.evaluate(() => {
      const h = (window as unknown as { __quayChart: Record<string, () => unknown> }).__quayChart;
      return { data: h.data!() as Pt[], lines: h.studies!() as Line[] };
    });
    const got = Object.fromEntries(lines.map((l) => [l.kind, l.data.length]));
    if (Object.keys(got).sort().join() !== Object.keys(want).sort().join()) return `lines ${JSON.stringify(got)}`;
    for (const l of lines) {
      const ref = refStudy(l.kind, data.map((d) => d.close), want[l.kind]!);
      const pts = ref.flatMap((v, i) => (v === null ? [] : [{ time: data[i]!.time, value: v }]));
      if (pts.length !== l.data.length) return `${l.kind}: ${l.data.length} points, want ${pts.length} of ${data.length} bars`;
      for (let i = 0; i < pts.length; i++) {
        if (pts[i]!.time !== l.data[i]!.time || Math.abs(pts[i]!.value - l.data[i]!.value) > 1e-9) return `${l.kind}[${i}] ${JSON.stringify(l.data[i])} vs ${JSON.stringify(pts[i])}`;
      }
      if (l.options.lineStyle !== (l.kind === "ema" ? 2 : 0)) return `${l.kind} style ${l.options.lineStyle}`;
    }
    return "ok";
  }, { timeout: 15_000 }).toBe("ok");
}
async function plotted(page: Page, source: "server" | "demo", br = anyBr(page)) {
  const c = br.getByTestId("br-chart");
  await expect(c).toHaveAttribute("data-state", "plot", { timeout: 25_000 });
  await expect(c.getByTestId("br-chart-source")).toHaveAttribute("data-source", source);
  await expect(c.getByTestId("br-chart-studies")).toBeVisible({ timeout: 10_000 });
  return c;
}
const pressed = (c: Locator, k: string) => c.getByTestId(`br-study-${k}`).getAttribute("aria-pressed");
const flush = (page: Page) => page.evaluate(() => (window as unknown as { __quayFlush?: () => Promise<void> }).__quayFlush?.());
async function state(c: Locator) {
  return { sma: [await pressed(c, "sma"), await c.getByTestId("br-study-sma-n").inputValue()], ema: [await pressed(c, "ema"), await c.getByTestId("br-study-ema-n").inputValue()] };
}

test("desktop: toggle and period by pointer and keyboard; values from the shown closes through ticks, range, asset; kept per account; lines and pan intact", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "desktop journey; phone and 520 below");
  test.setTimeout(240_000);
  const ctx = await browser.newContext();
  try {
    const page = await ctx.newPage();
    // Guest (demo bars). A trend line first: overlay changes must leave it alone.
    await page.goto("/broker?asset=HALC");
    let c = await plotted(page, "demo");
    expect(await state(c)).toEqual({ sma: ["false", "20"], ema: ["false", "12"] });
    await expect(c.getByTestId("br-chart-studies")).toHaveAttribute("title", "Overlay choices are kept on this device only");
    expect(await hook<Line[]>(page, "studies")).toEqual([]);
    const canvas = (await c.getByTestId("br-chart-canvas").boundingBox())!;
    await c.getByTestId("br-trend-tool").click();
    await page.mouse.click(canvas.x + canvas.width * 0.3, canvas.y + canvas.height * 0.5);
    await page.mouse.click(canvas.x + canvas.width * 0.5, canvas.y + canvas.height * 0.4);
    const trend = await page.locator('[data-testid="br-trend-layer"] g.cc-trend').evaluateAll((gs) => gs.map((g) => (g as SVGElement).dataset.id!));
    expect(trend).toHaveLength(1);
    await page.keyboard.press("Escape");
    const bars = (await hook<Pt[]>(page, "data")).length;
    expect(bars, "the demo 1D range has enough bars for SMA 50 / EMA 26").toBeGreaterThanOrEqual(50);

    // SMA on by pointer: SMA 20, solid; the legend names it and shows its value at the newest bar.
    await c.getByTestId("br-study-sma").click();
    expect(await pressed(c, "sma")).toBe("true");
    await drawnMatches(page, { sma: 20 });
    const leg = c.getByTestId("br-chart-study-sma");
    await expect(leg).toHaveAttribute("data-n", "20");
    await expect(leg.locator(".cc-legend-k")).toHaveText("SMA 20");
    await expect(c.getByTestId("br-chart-study-ema")).toHaveCount(0);
    await expect(c.getByTestId("br-study-short")).toHaveCount(0);
    // EMA period 26 picked: turns it on, dashed.
    await c.getByTestId("br-study-ema-n").selectOption("26");
    expect(await state(c)).toEqual({ sma: ["true", "20"], ema: ["true", "26"] });
    await drawnMatches(page, { sma: 20, ema: 26 });
    await expect(c.getByTestId("br-chart-study-ema").locator(".cc-legend-k")).toHaveText("EMA 26");
    await shot(page, "ma-01-guest-sma20-ema26");

    // Keyboard: Tab reaches the toggle; Space / Enter toggle it; the period select changes by arrow keys.
    await c.getByTestId("br-study-sma").focus();
    await page.keyboard.press("Space");
    expect(await pressed(c, "sma")).toBe("false");
    await drawnMatches(page, { ema: 26 });
    await page.keyboard.press("Enter");
    expect(await pressed(c, "sma")).toBe("true");
    await page.keyboard.press("Tab");
    await expect(c.getByTestId("br-study-sma-n")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(c.getByTestId("br-study-sma-n")).toHaveValue("50");
    await drawnMatches(page, { sma: 50, ema: 26 });
    // The chart's own keyboard cursor reads the overlays at its bar (legend and the spoken line).
    await c.getByTestId("br-chart-canvas").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(c.getByTestId("br-chart-live")).toContainText(/SMA 50 [\d.,]+ · EMA 26 [\d.,]+$/);
    const at = await c.getByTestId("br-chart-legend").getAttribute("data-t");
    const { d, l } = await page.evaluate(() => {
      const h = (window as unknown as { __quayChart: Record<string, () => unknown> }).__quayChart;
      return { d: h.data!() as Pt[], l: h.studies!() as Line[] };
    });
    const sm = l.find((x) => x.kind === "sma")!.data.find((p) => p.time === Number(at) * 120); // 120 s per game tick
    expect(d.some((b) => b.time === sm?.time), "the cursor's bar is a shown bar").toBe(true);
    expect(Number(await c.getByTestId("br-chart-study-sma").getAttribute("data-v"))).toBeCloseTo(sm!.value, 9);
    await page.keyboard.press("Escape");

    // Live ticks: the newest bar replaced / new bars appended; the lines follow the shown closes.
    const t0 = await hook<Pt[]>(page, "data");
    await expect.poll(async () => JSON.stringify((await hook<Pt[]>(page, "data")).at(-1)), { timeout: 30_000 }).not.toBe(JSON.stringify(t0.at(-1)));
    await drawnMatches(page, { sma: 50, ema: 26 });

    // Range change: a short range (1H) has fewer bars than the periods: no line, a truthful message, "–" in the legend.
    await c.getByTestId("br-chart-ranges").locator('[data-range="1H"]').click();
    await expect(c).toHaveAttribute("data-range", "1H");
    await expect(c).toHaveAttribute("data-state", "plot", { timeout: 25_000 });
    const short = (await hook<Pt[]>(page, "data")).length;
    if (short < 26) {
      await drawnMatches(page, { sma: 50, ema: 26 });
      await expect(c.getByTestId("br-study-short")).toHaveText([`SMA 50 needs 50 bars; this range has ${short}.`, `EMA 26 needs 26 bars; this range has ${short}.`]);
      await expect(c.getByTestId("br-chart-study-sma")).toHaveAttribute("data-v", "");
      expect((await hook<Line[]>(page, "studies")).every((l) => l.data.length === 0)).toBe(true);
      await shot(page, "ma-02-guest-short-range");
    } else await drawnMatches(page, { sma: 50, ema: 26 });
    await c.getByTestId("br-chart-ranges").locator('[data-range="1W"]').click();
    await expect(c).toHaveAttribute("data-state", "plot", { timeout: 25_000 });
    await drawnMatches(page, { sma: 50, ema: 26 });
    // Asset change inside one Broker (the picker): the new asset's closes, only the two lines.
    await flush(page);
    await page.getByTestId("win-broker").first().getByTestId("win-close").click();
    await expect(page.getByTestId("win-broker")).toHaveCount(0);
    await page.goto("/broker");
    const picker = page.getByTestId("broker").first();
    await picker.getByTestId("br-asset-select").selectOption("HALC");
    c = await plotted(page, "demo", picker);
    await drawnMatches(page, { sma: 50, ema: 26 });
    const halc = await hook<Pt[]>(page, "data");
    await picker.getByTestId("br-asset-select").selectOption("MRDN");
    c = await plotted(page, "demo", picker);
    await expect.poll(async () => JSON.stringify((await hook<Pt[]>(page, "data")).slice(0, 5))).not.toBe(JSON.stringify(halc.slice(0, 5)));
    await drawnMatches(page, { sma: 50, ema: 26 });
    expect(await hook<Line[]>(page, "studies")).toHaveLength(2);

    // Pan and zoom still move the plot; volume still drawn.
    const cv = (await c.getByTestId("br-chart-canvas").boundingBox())!;
    const v0 = await hook<{ from: number; to: number }>(page, "visible");
    await page.mouse.move(cv.x + cv.width * 0.5, cv.y + cv.height * 0.5);
    await page.mouse.wheel(0, -400);
    await expect.poll(() => hook<{ from: number; to: number }>(page, "visible")).not.toEqual(v0);
    const v1 = await hook<{ from: number; to: number }>(page, "visible");
    await page.mouse.down(); await page.mouse.move(cv.x + cv.width * 0.2, cv.y + cv.height * 0.5, { steps: 6 }); await page.mouse.up();
    await expect.poll(() => hook<{ from: number; to: number }>(page, "visible")).not.toEqual(v1);
    expect((await hook<unknown[]>(page, "volume")).length).toBeGreaterThan(0);
    await shot(page, "ma-03-guest-mrdn-zoomed");

    // Reload: the guest's choices and trend line back.
    await flush(page);
    await page.getByTestId("win-broker").first().getByTestId("win-close").click();
    await expect(page.getByTestId("win-broker")).toHaveCount(0);
    await page.goto("/broker?asset=HALC");
    c = await plotted(page, "demo");
    expect(await state(c)).toEqual({ sma: ["true", "50"], ema: ["true", "26"] });
    await drawnMatches(page, { sma: 50, ema: 26 });
    await expect(page.locator('[data-testid="br-trend-layer"] g.cc-trend')).toHaveCount(1);
    expect(await page.locator('[data-testid="br-trend-layer"] g.cc-trend').evaluateAll((gs) => gs.map((g) => (g as SVGElement).dataset.id!))).toEqual(trend);

    // Account A on this device: its own (none of the guest's). Its server bars are few: EMA 12 says so, no line.
    const stamp = Date.now().toString(36);
    await register(ctx.request, baseURL!, `MaA${stamp}`);
    await page.reload();
    c = await plotted(page, "server");
    expect(await state(c)).toEqual({ sma: ["false", "20"], ema: ["false", "12"] });
    expect(await hook<Line[]>(page, "studies")).toEqual([]);
    await c.getByTestId("br-study-ema").click();
    const have = (await hook<Pt[]>(page, "data")).length;
    await drawnMatches(page, { ema: 12 });
    if (have < 12) await expect(c.getByTestId("br-study-short")).toHaveText(`EMA 12 needs 12 bars; this range has ${have}.`);
    await shot(page, "ma-04-account-a-ema12");
    await flush(page);

    // Account B: its own defaults.
    await register(ctx.request, baseURL!, `MaB${stamp}`);
    await page.reload();
    c = await plotted(page, "server");
    expect(await state(c)).toEqual({ sma: ["false", "20"], ema: ["false", "12"] });
    // A again: EMA 12 on, SMA off.
    const signIn = await ctx.request.post("/api/auth/login", { headers: { origin: baseURL! }, data: { handle: `MaA${stamp}`, password: "local-ma-test" } });
    expect(signIn.status(), await signIn.text()).toBe(200);
    await page.reload();
    c = await plotted(page, "server");
    expect(await state(c)).toEqual({ sma: ["false", "20"], ema: ["true", "12"] });
    await drawnMatches(page, { ema: 12 });
    // Signed out: the guest's choices, as left.
    await page.getByTestId("account-chip").first().click();
    await page.getByTestId("account-logout").click();
    await expect(anyBr(page).getByTestId("br-chart").getByTestId("br-chart-source")).toHaveAttribute("data-source", "demo", { timeout: 25_000 });
    await page.getByTestId("win-settings").getByTestId("win-close").click();
    c = await plotted(page, "demo");
    expect(await state(c)).toEqual({ sma: ["true", "50"], ema: ["true", "26"] });
    await drawnMatches(page, { sma: 50, ema: 26 });
    await expect(page.locator('[data-testid="br-trend-layer"] g.cc-trend')).toHaveCount(1);
    await shot(page, "ma-05-guest-again");
  } finally {
    await ctx.close();
  }
});

/** Every visible control in the foot inside the chart, none overlapping another, each at least `min` px tall; the
 *  legend (overlay values) above the plot's canvas, never on it. */
async function fits(c: Locator, min: number) {
  const r = await c.evaluate((el, m) => {
    const box = el.getBoundingClientRect();
    const ctl = [...el.querySelectorAll<HTMLElement>(".br-chart-foot button, .br-chart-foot select")].filter((e) => e.offsetParent).map((e) => ({ id: e.dataset.testid, r: e.getBoundingClientRect() }));
    const bad: string[] = [];
    for (const a of ctl) {
      if (a.r.left < box.left - 0.5 || a.r.right > box.right + 0.5) bad.push(`${a.id} outside`);
      if (a.r.height < m - 0.5) bad.push(`${a.id} ${a.r.height}px`);
      for (const b of ctl) if (a !== b && a.r.left < b.r.right - 0.5 && b.r.left < a.r.right - 0.5 && a.r.top < b.r.bottom - 0.5 && b.r.top < a.r.bottom - 0.5) bad.push(`${a.id} over ${b.id}`);
    }
    const leg = el.querySelector('[data-testid="br-chart-legend"]')!.getBoundingClientRect();
    const cv = el.querySelector('[data-testid="br-chart-canvas"]')!.getBoundingClientRect();
    if (leg.bottom > cv.top + 0.5) bad.push(`legend ${leg.bottom} over canvas ${cv.top}`);
    const studies = [...el.querySelectorAll(".cc-study")].map((s) => s.getBoundingClientRect());
    for (const s of studies) if (s.bottom > cv.top + 0.5 || s.right > box.right + 0.5) bad.push(`study label ${s.bottom}/${s.right}`);
    return bad;
  }, min);
  expect(r).toEqual([]);
}

test("phone 390 touch: tap toggles and the period, 44 px targets, everything fits; legend above the plot; pan by touch", async ({ browser }, info) => {
  test.skip(info.project.name !== "phone", "phone project only");
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const page = await ctx.newPage();
    await page.goto("/broker?asset=HALC");
    const c = await plotted(page, "demo");
    await c.getByTestId("br-study-sma").tap();
    await c.getByTestId("br-study-ema").tap();
    await c.getByTestId("br-study-ema-n").selectOption("26");
    expect(await state(c)).toEqual({ sma: ["true", "20"], ema: ["true", "26"] });
    await drawnMatches(page, { sma: 20, ema: 26 });
    await c.getByTestId("br-study-sma").scrollIntoViewIfNeeded();
    await fits(c, 44);
    await shot(page, "ma-06-phone-390-both");
    await flush(page);
    await page.reload();
    const c2 = await plotted(page, "demo");
    expect(await state(c2)).toEqual({ sma: ["true", "20"], ema: ["true", "26"] });
    await drawnMatches(page, { sma: 20, ema: 26 });
  } finally {
    await ctx.close();
  }
});

test("the 520 window: overlay controls fit, ≥ 28 px, legend above the plot", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop window only");
  test.setTimeout(120_000);
  await page.goto("/broker?asset=HALC");
  const win = page.getByTestId("win-broker").first();
  const c = await plotted(page, "demo");
  const handle = (await win.getByTestId("resize-handle").boundingBox())!;
  await page.mouse.move(handle.x + 5, handle.y + 5);
  await page.mouse.down();
  await page.mouse.move(50, handle.y + 5, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await win.boundingBox())!.width).toBe(520);
  await c.getByTestId("br-study-sma").click();
  await c.getByTestId("br-study-ema-n").selectOption("26");
  await drawnMatches(page, { sma: 20, ema: 26 });
  await c.getByTestId("br-study-ema").scrollIntoViewIfNeeded();
  await fits(c, 28);
  await shot(page, "ma-07-window-520-both");
});
