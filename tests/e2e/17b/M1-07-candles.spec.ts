// M1-07: a signed-in player's Broker chart is candles of the server's recorded quotes with volume = executed game
// trades. A market buy shows up once in the volume of its bar; the legend, crosshair keys and table read the same bars;
// a 520 window and a 390 phone keep the axes; a failed history read says so (Retry) instead of plotting a demo; signing
// out swaps to the labelled demo and back without the other feed's bars. Real timers against the production build.
// MRDN only: no other spec trades it, so the volume this spec reads is its own.
import { mkdirSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const ASSET = "MRDN";
const SHOTS = process.env.M107_SHOTS_DIR ?? "";
type Bar = { t: number; o: string; h: string; l: string; c: string; v: string };
type Pt = { time: number; open: number; high: number; low: number; close: number };
type Vol = { time: number; value: number; color: string };

async function shot(page: Page, name: string) {
  const buf = await page.screenshot();
  await test.info().attach(name, { body: buf, contentType: "image/png" });
  if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${name}.png` }); }
}
async function register(request: APIRequestContext, baseURL: string, handle: string) {
  const res = await request.post("/api/auth/register", { headers: { origin: baseURL }, data: { handle, password: "local-candle-test" } });
  expect(res.status(), await res.text()).toBe(201);
}
async function tickNow(request: APIRequestContext): Promise<number> {
  return ((await (await request.get("/api/market")).json()) as { tick: number }).tick;
}
async function serverBars(request: APIRequestContext, from: number, to: number): Promise<Bar[]> {
  const res = await request.get(`/api/market/candles?assetId=${ASSET}&res=tick&from=${from}&to=${to}`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { bars: Bar[] };
  expect(Object.keys(body)).toEqual(["bars"]); // public aggregate only: no account fields
  return body.bars;
}
const lwc = <T,>(page: Page, k: "data" | "volume" | "series") =>
  page.evaluate((key) => ((window as unknown as { __quayChart?: Record<string, () => unknown> }).__quayChart?.[key]?.() ?? null) as never, k) as Promise<T>;
const br = (page: Page) => page.locator('[data-testid="broker"]:has([data-testid="br-ticker"]):has([data-testid="market-tick"])').first();
const guestBr = (page: Page) => page.locator('[data-testid="broker"]:has([data-testid="br-ticker"])').first();
const chart = (page: Page) => br(page).getByTestId("br-chart");

async function plotted(page: Page, source: "server" | "demo", b = br(page)) {
  const c = b.getByTestId("br-chart");
  await expect(c).toHaveAttribute("data-state", "plot", { timeout: 25_000 });
  await expect(c.getByTestId("br-chart-source")).toHaveAttribute("data-source", source);
  await expect.poll(async () => (await lwc<Pt[] | null>(page, "data"))?.length ?? 0, { timeout: 10_000 }).toBeGreaterThan(0);
}
function wellFormed(pts: Pt[]) {
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    expect(p.low).toBeLessThanOrEqual(Math.min(p.open, p.close));
    expect(p.high).toBeGreaterThanOrEqual(Math.max(p.open, p.close));
    if (i > 0) expect(p.time).toBe(pts[i - 1]!.time + 120); // one tick bar per tick, no gaps or repeats
  }
}

/** The OHLCV legend sits above the plot (never over a candle) and inside the chart box, not clipped. */
async function legendClear(page: Page) {
  const c = chart(page);
  const [l, p, b] = await Promise.all([c.getByTestId("br-chart-legend").boundingBox(), c.getByTestId("br-chart-canvas").boundingBox(), c.getByTestId("br-chart-box").boundingBox()]);
  expect(l!.y + l!.height).toBeLessThanOrEqual(p!.y + 0.5);
  expect(l!.y).toBeGreaterThanOrEqual(b!.y - 0.5);
  expect(p!.height).toBeGreaterThanOrEqual(200); // the legend never takes plot height at text scale 1
  expect(await c.getByTestId("br-chart-legend").evaluate((e) => e.scrollHeight <= e.clientHeight + 1 && e.scrollWidth <= e.clientWidth + 1)).toBe(true);
}
/** Table at this width: if it is wider than its region, a real (space-taking) scrollbar shows and Volume scrolls into view. */
async function volumeReachable(page: Page) {
  const region = chart(page).getByTestId("br-chart-table");
  const m = await region.evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth, bar: (e as HTMLElement).offsetHeight - e.clientHeight - 2 }));
  test.info().annotations.push({ type: "table-width", description: JSON.stringify(m) });
  const vol = region.locator("thead th").last();
  await expect(vol).toHaveText("Volume");
  if (m.sw > m.cw) {
    await region.focus();
    for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowRight"); // keyboard scroll in the focusable region
  }
  // Keyboard scrolling may animate (smooth scroll): wait until Volume is fully inside the region.
  await expect.poll(async () => {
    const [r, v] = await Promise.all([region.boundingBox(), vol.boundingBox()]);
    return v!.x >= r!.x - 0.5 && v!.x + v!.width <= r!.x + r!.width + 0.5;
  }, { message: "Volume header reachable by keyboard scroll", timeout: 5_000 }).toBe(true);
  return m;
}

async function buy(page: Page, qty: string) {
  const b = br(page);
  await b.getByTestId("br-side-buy").click();
  await b.getByTestId("br-type-market").click();
  await b.getByTestId("br-qty").fill(qty);
  await expect(b.getByTestId("br-review")).toBeEnabled({ timeout: 10_000 });
  await b.getByTestId("br-review").click();
  await expect(page.getByTestId("br-place").first()).toBeEnabled({ timeout: 12_000 });
  await page.getByTestId("br-place").first().click();
  await expect(b.getByTestId("br-ack")).toBeVisible({ timeout: 10_000 });
}

test("signed-in candles = server quotes, volume = executed trades once; legend, keys, table; failure; sign-out swap", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "desktop journey; the phone test below covers 390");
  test.setTimeout(180_000);
  const ctx = await browser.newContext();
  try {
    const stamp = Date.now().toString(36);
    await register(ctx.request, baseURL!, `Cdl${stamp}`);
    const page = await ctx.newPage();
    await page.goto(`/broker?asset=${ASSET}`);
    await expect(br(page)).toHaveAttribute("data-state", "live", { timeout: 25_000 });
    await plotted(page, "server");
    await expect(chart(page).getByTestId("br-chart-source")).toContainText("Port Avalon quotes · volume: executed trades");

    // A few server ticks so there is more than one recorded bar (the chart appends them live, one per tick).
    await expect.poll(async () => (await lwc<Pt[]>(page, "data")).length, { timeout: 40_000, intervals: [1_000] }).toBeGreaterThanOrEqual(4);
    // The plotted bars are the server's recorded history (from the first sample, not a generated day).
    const t = await tickNow(ctx.request);
    const srv = await serverBars(ctx.request, Math.max(0, t - 719), t);
    const pts = await lwc<Pt[]>(page, "data");
    expect(pts[0]!.time).toBe(srv[0]!.t * 120);
    expect(pts.length).toBeLessThanOrEqual(srv.length + 1);
    wellFormed(pts);
    await legendClear(page);
    if (srv[0]!.t > Math.max(0, t - 719)) await expect(chart(page).getByTestId("br-chart-source")).toContainText("recorded since");
    await shot(page, "m107-01-signed-in-candles");

    // A market buy of 7: the server bar at the fill's tick gains exactly 7, the chart shows it, and nothing doubles.
    await buy(page, "7");
    const ledger = (await (await ctx.request.get("/api/broker/me")).json()) as { fills: { tick: number; qty: string; assetId?: string }[] };
    const fill = ledger.fills.at(-1)!;
    expect(fill.qty).toBe("7");
    const at = (await serverBars(ctx.request, fill.tick, fill.tick))[0]!;
    expect(at.v).toBe("7");
    await expect.poll(async () => (await lwc<Vol[]>(page, "volume")).find((v) => v.time === fill.tick * 120)?.value, { timeout: 15_000 }).toBe(7);
    // A reload rebuilds from the server: still exactly 7 at that tick, the whole history still well-formed.
    await page.reload();
    await plotted(page, "server");
    await expect.poll(async () => (await lwc<Vol[]>(page, "volume")).find((v) => v.time === fill.tick * 120)?.value, { timeout: 15_000 }).toBe(7);
    wellFormed(await lwc<Pt[]>(page, "data"));
    const totalVol = (await lwc<Vol[]>(page, "volume")).reduce((s, v) => s + v.value, 0);
    expect(totalVol).toBe(7);

    // Legend follows the crosshair; keys step bars and announce OHLCV; the table holds the same bar and volume.
    const canvas = chart(page).getByTestId("br-chart-canvas");
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
    const legend = chart(page).getByTestId("br-chart-legend");
    await expect(legend).toContainText(/O\s*[\d,.]+\s*H\s*[\d,.]+\s*L\s*[\d,.]+\s*C\s*[\d,.]+\s*Vol\s*[\d,]+/);
    await shot(page, "m107-02-crosshair-legend");
    await page.mouse.move(0, 0);
    await canvas.focus();
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowLeft");
    await expect(chart(page).getByTestId("br-chart-live")).toHaveText(/open [\d,.]+, high [\d,.]+, low [\d,.]+, close [\d,.]+, volume [\d,]+$/);
    await page.keyboard.press("Tab");
    await expect(chart(page).getByTestId("br-chart-toggle")).toBeFocused();
    await page.keyboard.press("Enter");
    const row = chart(page).getByTestId("br-chart-table").locator(`tr[data-t="${fill.tick}"]`);
    await expect(row.locator('[data-col="volume"]')).toHaveText("7");
    await shot(page, "m107-03-table");
    await volumeReachable(page);
    await shot(page, "m107-03b-table-scrolled");
    await chart(page).getByTestId("br-chart-toggle").focus();
    await page.keyboard.press("Enter"); // back to the chart (toggle still focused)
    await expect(chart(page).getByTestId("br-chart-table")).toHaveCount(0);

    // 520 window: price and time axes still drawn inside the plot, nothing overflows.
    const win = page.getByTestId("win-broker").filter({ has: page.getByTestId("br-ticker") }).first();
    const handle = (await win.getByTestId("resize-handle").boundingBox())!;
    await page.mouse.move(handle.x + 5, handle.y + 5);
    await page.mouse.down();
    await page.mouse.move(50, handle.y + 5, { steps: 5 });
    await page.mouse.up();
    expect((await win.boundingBox())!.width).toBe(520);
    await expect.poll(async () => (await chart(page).getByTestId("br-chart-canvas").boundingBox())!.height).toBe(200); // plot; legend above it
    const narrow = await canvas.evaluate((el) => [...el.querySelectorAll("canvas")].map((c) => c.getBoundingClientRect().width).filter((w) => w > 0));
    expect(narrow.length).toBeGreaterThan(1); // pane + price axis (+ time axis) canvases
    expect(Math.max(...narrow)).toBeLessThan(520);
    await legendClear(page);
    await shot(page, "m107-04-window-520");

    // History read fails (live bar still fine): an error with Retry, never a demo plot; Retry recovers.
    await page.route("**/api/market/candles**", (r) => {
      const q = new URL(r.request().url()).searchParams;
      return q.get("from") !== q.get("to") ? r.fulfill({ status: 503, body: "" }) : r.continue();
    });
    await chart(page).getByTestId("br-chart-ranges").locator('[data-range="1H"]').click();
    await expect(chart(page)).toHaveAttribute("data-state", "error", { timeout: 10_000 });
    await expect(chart(page).getByTestId("br-chart-retry")).toBeVisible();
    await shot(page, "m107-05-history-error");
    await page.unroute("**/api/market/candles**");
    await chart(page).getByTestId("br-chart-retry").click();
    await plotted(page, "server");

    // Sign out in the page: the guest chart is the labelled demo; sign back in: server bars only, no demo bars.
    await page.getByTestId("account-chip").first().click();
    await page.getByTestId("account-logout").click();
    const g = guestBr(page);
    await expect(g.getByTestId("br-chart").getByTestId("br-chart-source")).toHaveAttribute("data-source", "demo", { timeout: 25_000 });
    await expect(g.getByTestId("br-chart").getByTestId("br-chart-source")).toHaveText("Demo history (sample data, not your account)");
    await page.getByTestId("win-settings").getByTestId("win-close").click();
    await expect(g.getByTestId("br-chart")).toHaveAttribute("data-state", "plot");
    await shot(page, "m107-06-signed-out-demo");
    await page.reload();
    const signIn = await ctx.request.post("/api/auth/login", { headers: { origin: baseURL! }, data: { handle: `Cdl${stamp}`, password: "local-candle-test" } });
    expect(signIn.status(), await signIn.text()).toBe(200);
    await page.goto(`/broker?asset=${ASSET}`);
    await plotted(page, "server");
    const t2 = await tickNow(ctx.request);
    const srv2 = await serverBars(ctx.request, Math.max(0, t2 - 719), t2);
    expect((await lwc<Pt[]>(page, "data"))[0]!.time).toBe(srv2[0]!.t * 120);
  } finally {
    await ctx.close();
  }
});

test("phone 390, reduced motion: signed-in candles fit, no animation, table reachable", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "phone project only");
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  try {
    await register(ctx.request, baseURL!, `CdlP${Date.now().toString(36)}`);
    const page = await ctx.newPage();
    await page.goto(`/broker?asset=${ASSET}`);
    await expect(br(page)).toHaveAttribute("data-state", "live", { timeout: 25_000 });
    await plotted(page, "server");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    expect((await chart(page).getByTestId("br-chart-canvas").boundingBox())!.height).toBe(200); // plot; legend above it
    await legendClear(page);
    expect(await chart(page).evaluate((el) => document.getAnimations().filter((a) => el.contains((a.effect as KeyframeEffect | null)?.target ?? null)).length)).toBe(0);
    await chart(page).scrollIntoViewIfNeeded();
    await shot(page, "m107-07-phone-390");
    await chart(page).getByTestId("br-chart-toggle").tap();
    await expect(chart(page).getByTestId("br-chart-table")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await volumeReachable(page);
    await shot(page, "m107-08-phone-table");
  } finally {
    await ctx.close();
  }
});
