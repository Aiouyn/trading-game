// Broker Bollinger Bands, RSI and VWAP against the production build, real timers, real canvas. Each overlay is turned on
// and off; its drawn points are checked against the same study computed here (independently) from the bars the plot
// shows: through live ticks, a range change (VWAP off on day bars, said so), an asset change and a reload. RSI is a
// pane of its own on a fixed 0..100 scale with 30 / 70 guides, never on the price scale; turning it off removes the
// pane. VWAP restarts each game day and names where its sum starts; signed in it uses executed volume: with nothing
// traded that day it draws nothing and says so, and a market buy gives it a value. Choices are kept per account and
// for the guest, alongside SMA / EMA and a trend line. Pan and zoom still move the plot (in the RSI pane too). Phone
// 390 (touch pan) and the 520 window: every control fits, the legend stays above the plot.
import { mkdirSync } from "node:fs";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

const SHOTS = process.env.IND_SHOTS_DIR ?? "";
async function shot(page: Page, name: string) {
  const buf = await page.screenshot();
  await test.info().attach(name, { body: buf, contentType: "image/png" });
  if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${name}.png` }); }
}
async function register(request: APIRequestContext, baseURL: string, handle: string) {
  const res = await request.post("/api/auth/register", { headers: { origin: baseURL }, data: { handle, password: "local-ind-test" } });
  expect(res.status(), await res.text()).toBe(201);
}
type Pt = { time: number; open: number; high: number; low: number; close: number };
type Vol = { time: number; value: number };
type Line = { key: string; kind: string; pane: number; options: { lineStyle: number; priceFormat: { type: string } }; data: { time: number; value: number }[] };
type H = Record<string, () => unknown>;
const hook = <T,>(page: Page, fn: string) => page.evaluate((k) => ((window as unknown as { __quayChart?: H }).__quayChart?.[k]?.() ?? null) as never, fn) as Promise<T>;
const anyBr = (page: Page) => page.locator('[data-testid="broker"]:has([data-testid="br-ticker"])').first();

// Reference math, written out here: Bollinger = SMA(n) ± 2·σ (population) of the same n closes; RSI = Wilder's, first
// at bar n, flat 50; VWAP = Σ((h+l+c)/3·v)/Σv from each game day's first shown bar (720 ticks a day), none while Σv = 0.
function refLines(kind: string, d: Pt[], v: Vol[], n: number): (number | null)[][] {
  const c = d.map((x) => x.close);
  if (kind === "bb") {
    const up: (number | null)[] = c.map(() => null), lo = up.slice();
    for (let i = n - 1; i < c.length; i++) {
      const w = c.slice(i - n + 1, i + 1), m = w.reduce((a, b) => a + b, 0) / n;
      const sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / n);
      up[i] = m + 2 * sd; lo[i] = m - 2 * sd;
    }
    return [up, lo];
  }
  if (kind === "rsi") {
    const out: (number | null)[] = c.map(() => null);
    let g = 0, l = 0;
    for (let i = 1; i < c.length; i++) {
      const ch = c[i]! - c[i - 1]!, up = Math.max(ch, 0), dn = Math.max(-ch, 0);
      if (i <= n) { g += up / n; l += dn / n; } else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; }
      if (i >= n) out[i] = l === 0 ? (g === 0 ? 50 : 100) : 100 - 100 / (1 + g / l);
    }
    return [out];
  }
  const out: (number | null)[] = [];
  let pv = 0, sv = 0, day = -1;
  d.forEach((b, i) => {
    const dd = Math.floor(b.time / 120 / 720);
    if (dd !== day) { day = dd; pv = 0; sv = 0; }
    const vol = v[i]!.value;
    pv += ((b.high + b.low + b.close) / 3) * vol; sv += vol;
    out.push(sv > 0 ? pv / sv : null);
  });
  return [out];
}
const N: Record<string, number> = { bb: 20, rsi: 14, vwap: 720 };
const STYLE: Record<string, number> = { bb: 3, vwap: 1, rsi: 0 };
/** The drawn overlays are exactly `kinds` (plus any SMA / EMA keys given), each line equal to the reference on the
 *  shown bars, on its pane and style. One read of bars, volume and lines per poll (a tick cannot split it). */
async function drawn(page: Page, kinds: string[], others: string[] = []) {
  await expect.poll(async () => {
    const { d, v, lines } = await page.evaluate(() => {
      const h = (window as unknown as { __quayChart: H }).__quayChart;
      return { d: h.data!() as Pt[], v: h.volume!() as Vol[], lines: h.studies!() as Line[] };
    });
    const want = [...kinds.flatMap((k) => (k === "bb" ? ["bb0", "bb1"] : [`${k}0`])), ...others].sort();
    if (lines.map((l) => l.key).sort().join() !== want.join()) return `keys ${lines.map((l) => l.key)}`;
    for (const k of kinds) {
      const ref = refLines(k, d, v, N[k]!);
      for (let j = 0; j < ref.length; j++) {
        const l = lines.find((x) => x.key === `${k}${j}`)!;
        const pts = ref[j]!.flatMap((x, i) => (x === null ? [] : [{ time: d[i]!.time, value: x }]));
        if (pts.length !== l.data.length) return `${l.key}: ${l.data.length} points, want ${pts.length} of ${d.length}`;
        for (let i = 0; i < pts.length; i++) if (pts[i]!.time !== l.data[i]!.time || Math.abs(pts[i]!.value - l.data[i]!.value) > 1e-9) return `${l.key}[${i}]`;
        if (l.pane !== (k === "rsi" ? 1 : 0)) return `${l.key} pane ${l.pane}`;
        if (l.options.lineStyle !== STYLE[k]) return `${l.key} style ${l.options.lineStyle}`;
        if (k === "rsi" && (l.options.priceFormat.type !== "custom" || l.data.some((p) => p.value < 0 || p.value > 100))) return "rsi scale";
      }
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
const on = (c: Locator, k: string) => c.getByTestId(`br-study-${k}`).getAttribute("aria-pressed");
const states = async (c: Locator) => Object.fromEntries(await Promise.all(["sma", "ema", "bb", "vwap", "rsi"].map(async (k) => [k, await on(c, k)])));
const OFF = { sma: "false", ema: "false", bb: "false", vwap: "false", rsi: "false" };
const flush = (page: Page) => page.evaluate(() => (window as unknown as { __quayFlush?: () => Promise<void> }).__quayFlush?.());
async function closeBrokers(page: Page) {
  const w = page.getByTestId("win-broker");
  for (let i = 0; i < 6 && (await w.count()) > 0; i++) await w.first().getByTestId("win-close").press("Enter");
  await expect(w).toHaveCount(0);
}
async function range(page: Page, c: Locator, r: string) {
  await c.getByTestId("br-chart-ranges").locator(`[data-range="${r}"]`).click();
  await expect(c).toHaveAttribute("data-range", r);
  await expect(c).toHaveAttribute("data-state", "plot", { timeout: 25_000 });
}

test("desktop guest: Bollinger, RSI pane, VWAP on / off; values from the shown bars through ticks, ranges, asset; reload; lines and pan", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop journey");
  test.setTimeout(180_000);
  await page.goto("/broker?asset=HALC");
  let c = await plotted(page, "demo");
  expect(await states(c)).toEqual(OFF);
  // No period picker for p10's fixed settings; each button explains itself.
  for (const k of ["bb", "vwap", "rsi"]) await expect(c.getByTestId(`br-study-${k}-n`)).toHaveCount(0);
  await expect(c.getByTestId("br-study-bb")).toHaveAttribute("title", "Bollinger Bands: the 20-bar average of the closes ± 2 standard deviations");
  await expect(c.getByTestId("br-study-rsi")).toHaveAttribute("title", /0 to 100 in its own pane/);
  await expect(c.getByTestId("br-study-vwap")).toHaveAttribute("title", /\(high \+ low \+ close\) \/ 3 weighted by traded volume, from the start of each game day/);
  // A trend line first (overlays must not touch it).
  const cv0 = (await c.getByTestId("br-chart-canvas").boundingBox())!;
  await c.getByTestId("br-trend-tool").click();
  await page.mouse.click(cv0.x + cv0.width * 0.3, cv0.y + cv0.height * 0.3);
  await page.mouse.click(cv0.x + cv0.width * 0.5, cv0.y + cv0.height * 0.25);
  await expect(page.locator('[data-testid="br-trend-layer"] g.cc-trend')).toHaveCount(1);
  await page.keyboard.press("Escape");

  await c.getByTestId("br-study-bb").click();
  await drawn(page, ["bb"]);
  await expect(c.getByTestId("br-chart-study-bb").locator(".cc-legend-k")).toHaveText("BB 20 ±2σ");
  await expect(c.getByTestId("br-chart-study-bb")).toHaveText(/^BB 20 ±2σ [\d.,]+ \/ [\d.,]+$/);
  await c.getByTestId("br-study-rsi").click();
  await drawn(page, ["bb", "rsi"]);
  const panes = await hook<number[]>(page, "panes");
  expect(panes).toHaveLength(2);
  expect(panes[1]!).toBeGreaterThanOrEqual(48);
  expect(panes[1]!).toBeLessThan(panes[0]!);
  expect((await hook<{ price: number }[]>(page, "guides")).map((g) => g.price)).toEqual([70, 30]);
  // Its scale reads 0..100 with one decimal (the guides' axis labels), never the asset's price format.
  await expect.poll(() => page.evaluate(() => {
    const h = (window as unknown as { __quayChart: H }).__quayChart;
    return (h.rsiScale as () => string[])();
  })).toEqual(["70.0", "30.0"]);
  await expect(c.getByTestId("br-chart-study-rsi")).toHaveText(/^RSI 14 \d{1,3}\.\d$/);
  // Keyboard: Enter toggles VWAP from its button.
  await c.getByTestId("br-study-vwap").focus();
  await page.keyboard.press("Enter");
  expect(await on(c, "vwap")).toBe("true");
  await drawn(page, ["bb", "vwap", "rsi"]);
  // The 1D range spans two game days: the newest bar's sum starts at 00:00 ("day"); the first bar's at the first shown bar.
  await expect(c.getByTestId("br-chart-study-vwap").locator(".cc-legend-k")).toHaveText("VWAP day");
  await c.getByTestId("br-chart-canvas").focus();
  await page.keyboard.press("Home");
  await expect(c.getByTestId("br-chart-study-vwap").locator(".cc-legend-k")).toHaveText(/^VWAP from \d\d:\d\d$/);
  await expect(c.getByTestId("br-chart-live")).toContainText(/BB 20 ±2σ – · VWAP from \d\d:\d\d [\d.,]+ · RSI 14 –$/);
  await page.keyboard.press("End");
  await expect(c.getByTestId("br-chart-live")).toContainText(/BB 20 ±2σ [\d.,]+ \/ [\d.,]+ · VWAP day [\d.,]+ · RSI 14 \d{1,3}\.\d$/);
  await page.keyboard.press("Escape");
  await shot(page, "ind-01-guest-bb-vwap-rsi");

  // Live ticks: the lines follow the replaced / appended bars.
  const t0 = JSON.stringify((await hook<Pt[]>(page, "data")).at(-1));
  await expect.poll(async () => JSON.stringify((await hook<Pt[]>(page, "data")).at(-1)), { timeout: 30_000 }).not.toBe(t0);
  await drawn(page, ["bb", "vwap", "rsi"]);
  // Day bars (1Y): no VWAP (no session inside a day bar), said so; Bollinger and RSI stay.
  await range(page, c, "1Y");
  await drawn(page, ["bb", "rsi"]);
  await expect(c.getByTestId("br-study-vwap-note")).toHaveText("VWAP needs intraday bars; this range has one bar per day.");
  await expect(c.getByTestId("br-chart-study-vwap")).toHaveCount(0);
  await shot(page, "ind-02-guest-1y-no-vwap");
  // 1H (30 bars): every warm-up met; the hour range starts mid-day.
  await range(page, c, "1H");
  await drawn(page, ["bb", "vwap", "rsi"]);
  await expect(c.getByTestId("br-study-vwap-note")).toHaveCount(0);
  await expect(c.getByTestId("br-study-short")).toHaveCount(0);
  await range(page, c, "1W");
  await drawn(page, ["bb", "vwap", "rsi"]);

  // Zoom, then pan with a drag that starts in the RSI pane.
  const cv = (await c.getByTestId("br-chart-canvas").boundingBox())!;
  const v0 = await hook<unknown>(page, "visible");
  await page.mouse.move(cv.x + cv.width * 0.5, cv.y + cv.height * 0.4);
  await page.mouse.wheel(0, -400);
  await expect.poll(() => hook<unknown>(page, "visible")).not.toEqual(v0);
  const v1 = await hook<unknown>(page, "visible");
  await page.mouse.move(cv.x + cv.width * 0.5, cv.y + cv.height * 0.92);
  await page.mouse.down(); await page.mouse.move(cv.x + cv.width * 0.2, cv.y + cv.height * 0.92, { steps: 6 }); await page.mouse.up();
  await expect.poll(() => hook<unknown>(page, "visible")).not.toEqual(v1);
  expect((await hook<unknown[]>(page, "volume")).length).toBeGreaterThan(0);

  // RSI off: its series, guides and pane go.
  await c.getByTestId("br-study-rsi").click();
  await drawn(page, ["bb", "vwap"]);
  expect(await hook<number[]>(page, "panes")).toHaveLength(1);
  expect(await hook<unknown[]>(page, "guides")).toEqual([]);
  await c.getByTestId("br-study-rsi").click();
  await drawn(page, ["bb", "vwap", "rsi"]);

  // Asset change in one Broker (picker): the new asset's bars only.
  await flush(page);
  await closeBrokers(page);
  await page.goto("/broker");
  const picker = page.getByTestId("broker").first();
  await picker.getByTestId("br-asset-select").selectOption("MRDN");
  c = await plotted(page, "demo", picker);
  await drawn(page, ["bb", "vwap", "rsi"]);
  await shot(page, "ind-03-guest-mrdn");
  // Reload: kept; the trend line too.
  await flush(page);
  await closeBrokers(page);
  await page.goto("/broker?asset=HALC");
  c = await plotted(page, "demo");
  expect(await states(c)).toEqual({ ...OFF, bb: "true", vwap: "true", rsi: "true" });
  await drawn(page, ["bb", "vwap", "rsi"]);
  await expect(page.locator('[data-testid="br-trend-layer"] g.cc-trend')).toHaveCount(1);
});

async function buy(page: Page, qty: string) {
  const b = anyBr(page);
  await b.getByTestId("br-side-buy").click();
  await b.getByTestId("br-type-market").click();
  await b.getByTestId("br-qty").fill(qty);
  await expect(b.getByTestId("br-review")).toBeEnabled({ timeout: 10_000 });
  await b.getByTestId("br-review").click();
  await expect(page.getByTestId("br-place").first()).toBeEnabled({ timeout: 12_000 });
  await page.getByTestId("br-place").first().click();
  await expect(b.getByTestId("br-ack")).toBeVisible({ timeout: 10_000 });
}

test("signed in: VWAP of executed volume (none traded: no value, said; a buy gives it one); per account; with SMA", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "desktop journey");
  test.setTimeout(180_000);
  const ctx = await browser.newContext();
  try {
    const stamp = Date.now().toString(36);
    await register(ctx.request, baseURL!, `IndA${stamp}`);
    const page = await ctx.newPage();
    await page.goto("/broker?asset=VRDN");
    let c = await plotted(page, "server");
    expect(await states(c)).toEqual(OFF);
    await c.getByTestId("br-study-sma").click();
    await c.getByTestId("br-study-vwap").click();
    await c.getByTestId("br-study-rsi").click();
    await drawn(page, ["vwap", "rsi"], ["sma0"]);
    // The note says exactly when the reference has no value at the newest bar.
    const idle = async () => {
      const { d, v } = await page.evaluate(() => { const h = (window as unknown as { __quayChart: H }).__quayChart; return { d: h.data!() as Pt[], v: h.volume!() as Vol[] }; });
      return refLines("vwap", d, v, 720)[0]!.at(-1) === null;
    };
    if (await idle()) {
      await expect(c.getByTestId("br-study-vwap-note")).toHaveText(/^VWAP: nothing traded since \d\d:\d\d this game day, so no value yet\.$/);
      await expect(c.getByTestId("br-chart-study-vwap")).toHaveText(/ –$/);
      await shot(page, "ind-04-signed-in-vwap-no-volume");
    }
    // Short server history: RSI 14 says how many bars it needs.
    const have = (await hook<Pt[]>(page, "data")).length;
    if (have < 15) await expect(c.getByTestId("br-study-short").filter({ hasText: "RSI" })).toHaveText(`RSI 14 needs 15 bars; this range has ${have}.`);
    await buy(page, "3");
    await expect.poll(async () => (await hook<Vol[]>(page, "volume")).some((x) => x.value > 0), { timeout: 20_000 }).toBe(true);
    await drawn(page, ["vwap", "rsi"], ["sma0"]);
    await expect.poll(idle, { timeout: 20_000 }).toBe(false);
    await expect(c.getByTestId("br-study-vwap-note")).toHaveCount(0);
    await expect(c.getByTestId("br-chart-study-vwap")).toHaveText(/^VWAP (day|from \d\d:\d\d) [\d.,]+$/);
    await shot(page, "ind-05-signed-in-vwap-after-buy");
    await flush(page);

    // Account B: its own (all off). A again: SMA, VWAP, RSI. The guest: none of A's.
    await register(ctx.request, baseURL!, `IndB${stamp}`);
    await page.reload();
    c = await plotted(page, "server");
    expect(await states(c)).toEqual(OFF);
    const signIn = await ctx.request.post("/api/auth/login", { headers: { origin: baseURL! }, data: { handle: `IndA${stamp}`, password: "local-ind-test" } });
    expect(signIn.status()).toBe(200);
    await page.reload();
    c = await plotted(page, "server");
    expect(await states(c)).toEqual({ ...OFF, sma: "true", vwap: "true", rsi: "true" });
    await drawn(page, ["vwap", "rsi"], ["sma0"]);
    await page.getByTestId("account-chip").first().click();
    await page.getByTestId("account-logout").click();
    await expect(anyBr(page).getByTestId("br-chart").getByTestId("br-chart-source")).toHaveAttribute("data-source", "demo", { timeout: 25_000 });
    await page.getByTestId("win-settings").getByTestId("win-close").click();
    c = await plotted(page, "demo");
    expect(await states(c)).toEqual(OFF);
  } finally {
    await ctx.close();
  }
});

/** Every visible control of the foot inside the chart, none on another, at least `min` px tall; the legend (all
 *  overlay labels) above the plot's canvas. */
async function fits(c: Locator, min: number) {
  expect(await c.evaluate((el, m) => {
    const box = el.getBoundingClientRect(), bad: string[] = [];
    const ctl = [...el.querySelectorAll<HTMLElement>(".br-chart-foot button, .br-chart-foot select")].filter((e) => e.offsetParent).map((e) => ({ id: e.dataset.testid, r: e.getBoundingClientRect() }));
    for (const a of ctl) {
      if (a.r.left < box.left - 0.5 || a.r.right > box.right + 0.5) bad.push(`${a.id} outside`);
      if (a.r.height < m - 0.5) bad.push(`${a.id} ${a.r.height}px`);
      for (const b of ctl) if (a !== b && a.r.left < b.r.right - 0.5 && b.r.left < a.r.right - 0.5 && a.r.top < b.r.bottom - 0.5 && b.r.top < a.r.bottom - 0.5) bad.push(`${a.id} over ${b.id}`);
    }
    const cv = el.querySelector('[data-testid="br-chart-canvas"]')!.getBoundingClientRect();
    for (const s of el.querySelectorAll(".cc-legend, .cc-study")) { const r = s.getBoundingClientRect(); if (r.bottom > cv.top + 0.5 || r.right > box.right + 0.5) bad.push(`label ${s.className} ${r.bottom}/${r.right}`); }
    return bad;
  }, min)).toEqual([]);
}
async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 8) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y }] });
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(400);
}

test("phone 390: all five on by tap, 44 px, fit, legend above the plot, touch pan; kept on reload", async ({ browser }, info) => {
  test.skip(info.project.name !== "phone", "phone project only");
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const page = await ctx.newPage();
    await page.goto("/broker?asset=HALC");
    const c = await plotted(page, "demo");
    for (const k of ["sma", "ema", "bb", "vwap", "rsi"]) await c.getByTestId(`br-study-${k}`).tap();
    await drawn(page, ["bb", "vwap", "rsi"], ["sma0", "ema0"]);
    await c.getByTestId("br-study-rsi").scrollIntoViewIfNeeded();
    await fits(c, 44);
    await c.getByTestId("br-chart-canvas").scrollIntoViewIfNeeded();
    const cv = (await c.getByTestId("br-chart-canvas").boundingBox())!;
    await shot(page, "ind-06-phone-390-all");
    // Zoom in first (so there is room to pan), then a horizontal touch drag pans.
    await c.getByTestId("br-chart-canvas").focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press("+");
    await page.keyboard.press("Escape");
    const v0 = await hook<unknown>(page, "visible");
    await touchDrag(page, { x: cv.x + cv.width * 0.3, y: cv.y + cv.height * 0.4 }, { x: cv.x + cv.width * 0.8, y: cv.y + cv.height * 0.4 });
    await expect.poll(() => hook<unknown>(page, "visible")).not.toEqual(v0);
    await flush(page);
    await page.reload();
    const c2 = await plotted(page, "demo");
    expect(await states(c2)).toEqual({ sma: "true", ema: "true", bb: "true", vwap: "true", rsi: "true" });
    await drawn(page, ["bb", "vwap", "rsi"], ["sma0", "ema0"]);
  } finally {
    await ctx.close();
  }
});

test("the 520 window: all five on, controls fit (≥ 28 px), legend above the plot", async ({ page }, info) => {
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
  for (const k of ["sma", "ema", "bb", "vwap", "rsi"]) await c.getByTestId(`br-study-${k}`).click();
  await drawn(page, ["bb", "vwap", "rsi"], ["sma0", "ema0"]);
  await c.getByTestId("br-study-rsi").scrollIntoViewIfNeeded();
  await fits(c, 28);
  await c.getByTestId("br-chart-canvas").scrollIntoViewIfNeeded();
  await shot(page, "ind-07-window-520-all");
});
