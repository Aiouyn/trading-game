// Trend lines vs the real browser store (Chromium IndexedDB), through the normal draw / edit / delete paths only.
// Gatekeeper B1 (10e61bf5): a failed read became an empty, writable copy; the next line erased every kept line. B2: two
// tabs of one account each wrote their whole stale copy; the last writer erased the other's lines. Failures are
// INJECTED, explicitly, by an init script that makes the page's drawings read (or write) throw once; nothing else is
// faked. Two tabs = two pages of one browser context (one origin, one IndexedDB). No test hooks used, so this also runs
// against a plain production build (E2E_PORT pointing at a running server).
import { mkdirSync } from "node:fs";
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

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
/** Injected failures (explicit, per tab): the next N drawings reads (readonly get) or writes (put) throw. */
async function injectable(ctx: BrowserContext) {
  await ctx.addInitScript(() => {
    const hit = (k: string) => {
      const n = Number(sessionStorage.getItem(k) ?? 0);
      if (n <= 0) return false;
      sessionStorage.setItem(k, String(n - 1));
      return true;
    };
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (this: IDBObjectStore, key: IDBValidKey | IDBKeyRange) {
      if (typeof key === "string" && key.endsWith(".drawings") && this.transaction.mode === "readonly" && hit("e2eFailDrawingReads")) {
        throw new DOMException("injected read failure", "UnknownError");
      }
      return get.call(this, key);
    };
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (typeof key === "string" && key.endsWith(".drawings") && hit("e2eFailDrawingWrites")) {
        throw new DOMException("injected write failure", "QuotaExceededError");
      }
      return put.call(this, value, key);
    };
  });
}
const failNext = (page: Page, what: "Reads" | "Writes", n = 1) => page.evaluate(([k, v]) => sessionStorage.setItem(k!, v!), [`e2eFailDrawing${what}`, String(n)]);
const flush = (page: Page) => page.evaluate(() => (window as unknown as { __quayFlush?: () => Promise<void> }).__quayFlush?.());

const win = (page: Page, asset: string) => page.getByTestId("win-broker").filter({ has: page.getByTestId("br-ticker").getByText(asset, { exact: true }) });
/** Open `asset` in this tab with only its Broker window (the shell restores the tab's saved windows). */
async function open(page: Page, asset: string, expectTool = true) {
  if (page.url().startsWith("http")) { // leave this tab's windows closed, so the reload restores none of them
    const all = page.getByTestId("win-broker");
    for (let i = 0; i < 6 && (await all.count()) > 0; i++) await all.first().getByTestId("win-close").press("Enter");
    await flush(page);
  }
  await page.goto(`/broker?asset=${asset}`);
  await expect(win(page, asset)).toHaveCount(1, { timeout: 25_000 });
  // Windows stack: close the others from the keyboard (their close buttons may sit under the new window).
  const others = page.getByTestId("win-broker").filter({ hasNot: page.getByTestId("br-ticker").getByText(asset, { exact: true }) });
  for (let i = 0; i < 6 && (await others.count()) > 0; i++) await others.first().getByTestId("win-close").press("Enter");
  await expect(others).toHaveCount(0);
  const chart = win(page, asset).getByTestId("br-chart");
  await expect(chart).toHaveAttribute("data-state", "plot", { timeout: 25_000 });
  await expect(chart.getByTestId("br-chart-source")).toHaveAttribute("data-source", "server");
  if (expectTool) {
    await expect(chart.getByTestId("br-trend-layer")).toBeAttached({ timeout: 10_000 });
    await expect(chart.getByTestId("br-trend-tool")).toBeVisible();
  }
  return chart;
}
type Line = { id: string; a: { t: number; p: number }; b: { t: number; p: number } };
const lines = (page: Page, asset: string) => win(page, asset).locator('[data-testid="br-trend-layer"] g.cc-trend').evaluateAll((gs) => gs.map((g) => {
  const d = (g as SVGElement).dataset;
  return { id: d.id!, a: { t: Number(d.aT), p: Number(d.aP) }, b: { t: Number(d.bT), p: Number(d.bP) } };
})) as Promise<Line[]>;
/** Tap, tap a new line through the tool; returns it (`elsewhere`: lines another tab added, which this tab shows once its
 *  write has settled, since it then shows the device's copy). */
async function drawLine(page: Page, asset: string, k: number, elsewhere: Line[] = []) {
  const chart = win(page, asset).getByTestId("br-chart");
  const tool = chart.getByTestId("br-trend-tool");
  await tool.scrollIntoViewIfNeeded();
  const c = (await chart.getByTestId("br-chart-canvas").boundingBox())!;
  const before = await lines(page, asset);
  await tool.click();
  await page.mouse.click(c.x + c.width * (0.45 + 0.04 * k), c.y + c.height * (0.25 + 0.05 * k));
  await page.mouse.click(c.x + c.width * (0.62 + 0.03 * k), c.y + c.height * (0.55 - 0.04 * k));
  const known = new Set([...before, ...elsewhere].map((l) => l.id));
  const added = async () => (await lines(page, asset)).filter((l) => !known.has(l.id));
  await expect.poll(async () => (await added()).length).toBe(1);
  return (await added())[0]!;
}
/** Select `id` from the keyboard (lines are focusable buttons; focus selects: lines drawn on a short history overlap,
 *  so a press could pick another one) and drag its end b 40 px left with the pointer. */
async function moveEnd(page: Page, asset: string, id: string) {
  const chart = win(page, asset).getByTestId("br-chart");
  await chart.getByTestId(`br-trend-${id}`).focus();
  await expect(chart.getByTestId(`br-trend-${id}`)).toHaveAttribute("aria-pressed", "true");
  const e = (await chart.getByTestId("br-trend-handle-b").boundingBox())!;
  await page.mouse.move(e.x + e.width / 2, e.y + e.height / 2);
  await page.mouse.down();
  await page.mouse.move(e.x - 40, e.y + 20, { steps: 5 });
  await page.mouse.up();
}
/** Select `id` from the keyboard and delete it with the Delete line button. */
async function deleteLine(page: Page, asset: string, id: string) {
  const chart = win(page, asset).getByTestId("br-chart");
  await chart.getByTestId(`br-trend-${id}`).focus();
  await expect(chart.getByTestId(`br-trend-${id}`)).toHaveAttribute("aria-pressed", "true");
  await chart.getByTestId("br-trend-delete").click();
  await expect(chart.getByTestId(`br-trend-${id}`)).toHaveCount(0);
}
const sorted = (l: Line[]) => [...l].sort((x, y) => x.id.localeCompare(y.id));

test.describe("trend lines vs the browser's store", () => {
  test.beforeEach(({ isMobile }) => { test.skip(isMobile, "desktop project; storage is not layout"); });
  test.setTimeout(180_000);

  test("B1: a failed read offers Retry (no tool, nothing written); after Retry a new line keeps every kept line", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await injectable(ctx);
    try {
      await register(ctx.request, baseURL!, `TsA${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`);
      const page = await ctx.newPage();
      // Kept: two HALC lines, one MRDN line, drawn as a player does.
      await open(page, "HALC");
      const h1 = await drawLine(page, "HALC", 0), h2 = await drawLine(page, "HALC", 1);
      await flush(page);
      await open(page, "MRDN");
      const m1 = await drawLine(page, "MRDN", 0);
      await flush(page);
      // Reload on VRDN with the next drawings read failing.
      await failNext(page, "Reads");
      const chart = await open(page, "VRDN", false);
      await expect.soft(chart.getByTestId("br-trend-error")).toHaveText("Your saved lines could not be read on this device.");
      await expect.soft(chart.getByTestId("br-trend-tool")).toHaveCount(0);
      if (await chart.getByTestId("br-trend-retry").count()) await chart.getByTestId("br-trend-retry").scrollIntoViewIfNeeded();
      await shot(page, "st-01-read-failed-retry");
      const retry = chart.getByTestId("br-trend-retry");
      if (await retry.count()) await retry.click();
      await expect(chart.getByTestId("br-trend-tool")).toBeVisible();
      await expect(chart.getByTestId("br-trend-error")).toHaveCount(0);
      const v1 = await drawLine(page, "VRDN", 0);
      await flush(page);
      await open(page, "HALC");
      expect(sorted(await lines(page, "HALC"))).toEqual(sorted([h1, h2]));
      await open(page, "MRDN");
      expect(await lines(page, "MRDN")).toEqual([m1]);
      await open(page, "VRDN");
      expect(await lines(page, "VRDN")).toEqual([v1]);
      await shot(page, "st-02-after-retry-all-kept");
    } finally { await ctx.close(); }
  });

  test("B1: a read that keeps failing stays unavailable, and a reload later shows the kept lines", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await injectable(ctx);
    try {
      await register(ctx.request, baseURL!, `TsR${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`);
      const page = await ctx.newPage();
      await open(page, "HALC");
      const h1 = await drawLine(page, "HALC", 0);
      await flush(page);
      await failNext(page, "Reads", 2);
      const chart = await open(page, "HALC", false);
      await expect(chart.getByTestId("br-trend-error")).toBeVisible();
      await chart.getByTestId("br-trend-retry").click();
      await expect(chart.getByTestId("br-trend-error")).toBeVisible(); // failed again: still no tool
      await expect(chart.getByTestId("br-trend-tool")).toHaveCount(0);
      expect(await lines(page, "HALC")).toEqual([]);
      await open(page, "HALC");
      expect(await lines(page, "HALC")).toEqual([h1]);
    } finally { await ctx.close(); }
  });

  test("B2: two tabs of one account; different assets, same asset, edits and a delete: nothing committed is lost or brought back", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      await register(ctx.request, baseURL!, `TsT${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`);
      const a = await ctx.newPage(), b = await ctx.newPage();
      // Both tabs read the (empty) device before either saves.
      await open(a, "HALC");
      await open(b, "MRDN");
      const ha = await drawLine(a, "HALC", 0); await flush(a);
      const mb = await drawLine(b, "MRDN", 0); await flush(b); // B's copy predates A's HALC line
      await open(a, "HALC");
      expect(await lines(a, "HALC")).toEqual([ha]);
      await open(a, "MRDN");
      expect(await lines(a, "MRDN")).toEqual([mb]);

      // Same asset: both on HALC, each adds its own line from a copy without the other's.
      await open(a, "HALC"); await open(b, "HALC");
      const h2 = await drawLine(a, "HALC", 1); await flush(a);
      const h3 = await drawLine(b, "HALC", 2, [h2]); await flush(b);
      expect(new Set([ha.id, h2.id, h3.id]).size).toBe(3);
      expect(sorted(await lines(b, "HALC"))).toEqual(sorted([ha, h2, h3])); // B shows the device's copy after its write
      await shot(b, "st-03-two-tabs-same-asset-tab-b");

      // A deletes ha; B (still showing ha, read before) edits h3's end, then ha's end: ha stays deleted, both edits kept.
      await open(a, "HALC"); await open(b, "HALC");
      await deleteLine(a, "HALC", ha.id); await flush(a);
      expect((await lines(b, "HALC")).map((l) => l.id)).toContain(ha.id); // B's copy is stale
      await moveEnd(b, "HALC", h3.id); await flush(b);
      const h3b = (await lines(b, "HALC")).find((l) => l.id === h3.id)!;
      expect(h3b.b).not.toEqual(h3.b);
      expect((await lines(b, "HALC")).map((l) => l.id)).not.toContain(ha.id); // now shows the device's copy
      await open(a, "HALC");
      await moveEnd(a, "HALC", h2.id); await flush(a);
      const h2a = (await lines(a, "HALC")).find((l) => l.id === h2.id)!;
      await open(a, "HALC");
      expect(sorted(await lines(a, "HALC"))).toEqual(sorted([h2a, h3b]));
      await open(b, "HALC");
      expect(sorted(await lines(b, "HALC"))).toEqual(sorted([h2a, h3b]));
      await open(b, "MRDN");
      expect(await lines(b, "MRDN")).toEqual([mb]);
      await shot(b, "st-04-two-tabs-after-delete-and-edits");
    } finally { await ctx.close(); }
  });

  test("a failed write is taken back and said so; the next change is kept", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await injectable(ctx);
    try {
      await register(ctx.request, baseURL!, `TsW${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`);
      const page = await ctx.newPage();
      const chart = await open(page, "HALC");
      const h1 = await drawLine(page, "HALC", 0); await flush(page);
      await failNext(page, "Writes");
      const tool = chart.getByTestId("br-trend-tool");
      const c = (await chart.getByTestId("br-chart-canvas").boundingBox())!;
      await tool.click();
      await page.mouse.click(c.x + c.width * 0.5, c.y + c.height * 0.7);
      await page.mouse.click(c.x + c.width * 0.7, c.y + c.height * 0.4);
      await expect(chart.getByTestId("br-trend-unsaved")).toHaveText("Your last line change was not kept on this device.");
      await expect.poll(() => lines(page, "HALC")).toEqual([h1]);
      await chart.getByTestId("br-trend-unsaved").scrollIntoViewIfNeeded();
      await shot(page, "st-05-write-failed-taken-back");
      const h2 = await drawLine(page, "HALC", 2); await flush(page);
      await expect(chart.getByTestId("br-trend-unsaved")).toHaveCount(0);
      await open(page, "HALC");
      expect(sorted(await lines(page, "HALC"))).toEqual(sorted([h1, h2]));
    } finally { await ctx.close(); }
  });
});
