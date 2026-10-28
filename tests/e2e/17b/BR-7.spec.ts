// UI card 7 (17B BRK-B) Broker price chart, end to end against the production build, its mock feed and the mock
// history (history.ts, build-gated hooks ?history=bad|flaky|hold, window.__quayHistory, window.__quayChart).
// BR-7-01 lazy chunk + bundle, -02 requests per tab, -05 options = Studio literals in 4 palettes + hc, -06 20 live
// ticks with zero layout shift, -07 tag = ticker.last and no brass, -08 halted band, reduced motion, -09 table + axe,
// -11 states and Retry, -12 layout at 1440 / 520 / 390 x 1.0 / 2.0, cb / hc baselines, FR.
// Shots: SHOTS=1 or BR_SHOTS_DIR (as BR-6). The cb / hc chart baselines are committed under __screenshots__/BR-7.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { SPEC_TABLE } from "../../unit/shell/paletteTable";
import { boot, setTextScale } from "../shell/helpers";
import { openBrokerPaused } from "./openPaused";
import { pinHtml } from "./pin";
import { FIRST_LOAD_BUDGET_KB, PLOT_EXCLUDE_CAP_KB, firstLoadBytes, watchScripts } from "./plotChunk";
import { SPEC_COLOUR } from "./specColours";

const desktopOnly = (n: string) => test.skip(n !== "desktop", "desktop project only");
const phoneOnly = (n: string) => test.skip(n !== "phone", "phone project only");
const SHOTS = process.env.BR_SHOTS_DIR ?? "tests/e2e/17b/__screenshots__/BR-7";
async function shot(page: Page, state: string, lang = "en") {
  if (!process.env.SHOTS && !process.env.BR_SHOTS_DIR) return;
  mkdirSync(SHOTS, { recursive: true });
  const vp = page.viewportSize()!;
  await page.screenshot({ path: `${SHOTS}/${state}${lang === "en" ? "" : `-${lang}`}-${vp.width}x${vp.height}.png` });
}
const TICK_MS = 5_000;
const color = (page: Page, v: string) => page.evaluate((x) => { const e = document.createElement("i"); e.style.color = x; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; }, v);
const br = (page: Page) => page.locator('[data-testid="broker"]:has([data-testid="br-ticker"]), [data-testid="broker"]:has([data-testid="br-asset-select"] option:checked[value="HALC"])').first();
const chart = (page: Page) => br(page).getByTestId("br-chart");
const tab = (page: Page, r: string) => chart(page).getByTestId("br-chart-ranges").locator(`[data-range="${r}"]`);
const colours = (l: Locator, exclude: string[] = []) => l.evaluate((el, ex) => {
  const out = new Set<string>();
  for (const e of [el, ...el.querySelectorAll("*")]) {
    if (ex.some((id) => e.closest(`[data-testid="${id}"]`))) continue;
    const s = getComputedStyle(e);
    for (const c of [s.color, s.backgroundColor, s.borderTopColor, s.borderLeftColor]) out.add(c);
  }
  return [...out];
}, exclude);
const primaries = (page: Page) => br(page).evaluate((el) => {
  const scope = el.closest(".win, .phone-appview") ?? el;
  return [...scope.querySelectorAll(".btn-primary")].filter((b) => (b as HTMLElement).offsetParent !== null).length;
});
async function hits(l: Locator, min: number) {
  const small: string[] = [];
  for (const c of await l.locator("button").all()) {
    if (!(await c.isVisible())) continue;
    const b = (await c.boundingBox())!;
    if (b.height < min || b.width < Math.min(min, 44)) small.push(`${await c.textContent()} ${b.width}x${b.height}`);
  }
  return small;
}
const overflow = (l: Locator) => l.evaluate((root) => [root, ...root.querySelectorAll("*")]
  .filter((e) => (e as HTMLElement).offsetParent !== null && !e.closest(".br-chart-table") && e.scrollWidth > e.clientWidth + 1)
  .map((e) => `${e.className} ${e.scrollWidth}>${e.clientWidth}`));
async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).include('[data-testid="broker"]').analyze();
  return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ")}`);
}
type Req = { assetId: string; res: string; from: number; to: number };
const reqs = (page: Page) => page.evaluate(() => (window as Window & { __quayHistory?: { reqs: Req[] } }).__quayHistory?.reqs ?? []);
type Pt = { time: number; value: number };
const lwc = <T,>(page: Page, k: "chart" | "series" | "line" | "data" | "visible") =>
  page.evaluate((key) => ((window as unknown as { __quayChart?: Record<string, () => unknown> }).__quayChart?.[key]?.() ?? null) as never, k) as Promise<T>;

async function run(page: Page, done: () => Promise<boolean>, ms = 8_000) {
  for (let t = 0; t < ms && !(await done()); t += 250) await page.clock.runFor(250);
  expect(await done()).toBe(true);
}
const state = (page: Page) => chart(page).getAttribute("data-state");
/** Plot drawn: the state says so and the library has the bars. */
async function plotted(page: Page) {
  await run(page, async () => (await state(page)) === "plot" && (await chart(page).getByTestId("br-chart-canvas").count()) > 0
    && ((await lwc<Pt[] | null>(page, "data"))?.length ?? 0) > 0);
  await page.clock.runFor(100); // the library paints on the next frame
}
async function openChart(page: Page, query = "") {
  await openBrokerPaused(page, `/broker?asset=HALC${query}`, br(page));
  await plotted(page);
}
/** Pin html[data-palette] against applyAppearance (as pinHtml does for cb / hc). */
async function pinPalette(page: Page, p: string | null) {
  await page.evaluate((v) => {
    const w = window as Window & { __quayPalette?: string | null };
    const html = document.documentElement;
    if (w.__quayPalette === undefined) new MutationObserver(() => { const x = w.__quayPalette; if (x && html.dataset.palette !== x) html.dataset.palette = x; })
      .observe(html, { attributes: true, attributeFilter: ["data-palette"] });
    w.__quayPalette = v;
    html.dataset.palette = v ?? "ink-brass";
  }, p);
}
/** The Studio literal (17 §7.1 table) for a token in a palette, as computed rgb(). */
const PALETTES = ["ink-brass", "broadsheet", "phosphor", "riviera"] as const;
const lit = (token: string, p: (typeof PALETTES)[number]) => {
  const row = SPEC_TABLE.find((r) => r[0] === token)!;
  const n = Number.parseInt(row[1 + PALETTES.indexOf(p)]!.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};
async function resizeWindow(page: Page, to = 50) {
  const win = page.getByTestId("win-broker").filter({ has: page.getByTestId("br-ticker") }).first();
  const handle = (await win.getByTestId("resize-handle").boundingBox())!;
  await page.mouse.move(handle.x + 5, handle.y + 5);
  await page.mouse.down();
  await page.mouse.move(to, handle.y + 5, { steps: 5 });
  await page.mouse.up();
  return win;
}

test(`BR-7-01 the plot is its own chunk, requested after the Broker mounts; Broker first load <= ${FIRST_LOAD_BUDGET_KB} KB gz`, async ({ page, request }, info) => {
  desktopOnly(info.project.name);
  const seen = await watchScripts(page);
  await boot(page, "/broker?asset=HALC");
  await expect(chart(page)).toBeVisible();
  await expect(chart(page)).toHaveAttribute("data-state", "plot");
  await page.waitForLoadState("networkidle");
  await page.unrouteAll({ behavior: "wait" });
  const zlib = await import("node:zlib");
  const sizes = new Map<string, number>();
  for (const url of seen.keys()) sizes.set(url, zlib.gzipSync(await (await request.get(url)).body()).length);
  const lib = [...seen].filter(([, s]) => s.plot);
  expect(lib, "lightweight-charts is in exactly one chunk").toHaveLength(1);
  const [libUrl, libSeen] = lib[0]!;
  expect(libSeen.broker, "the plot chunk carries no Broker code").toBe(false);
  expect(libSeen.afterMount, "the plot chunk is requested after the Broker's chart section is in the page").toBe(true);
  expect([...seen].filter(([, s]) => s.broker && s.afterMount), "the Broker's own code was all requested before it mounted").toEqual([]);
  // Not in the document's own script tags: the chunk only arrives by the dynamic import.
  const html = await (await request.get("/broker?asset=HALC")).text();
  expect(html.includes(new URL(libUrl).pathname)).toBe(false);
  const all = [...sizes.values()].reduce((s, x) => s + x, 0);
  const first = firstLoadBytes(all - sizes.get(libUrl)!, sizes.get(libUrl)!);   // plot chunk left out up to PLOT_EXCLUDE_CAP_KB, as in S1-20 and the CI step
  console.log(`BR-7-01 broker first load ${(first / 1024).toFixed(1)} KB gz; plot chunk ${(sizes.get(libUrl)! / 1024).toFixed(1)} KB gz; all ${(all / 1024).toFixed(1)} KB gz; cap ${PLOT_EXCLUDE_CAP_KB} KB; budget ${FIRST_LOAD_BUDGET_KB} KB`);
  expect(first).toBeLessThanOrEqual(FIRST_LOAD_BUDGET_KB * 1024);
});

test("BR-7-02 each tab asks the Q3 request (res, from, to, bar count) and plots; All pages <= 5000 from 0", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await openChart(page);
  const plan = { "1H": ["tick", 30, 1], "1D": ["tick", 720, 1], "1W": ["hour", 168, 30], "1Q": ["hour", 2184, 30], "1Y": ["day", 364, 720] } as const;
  const one = await reqs(page);
  expect(one).toHaveLength(1);
  expect(one[0]).toMatchObject({ assetId: "HALC", res: "tick" });
  expect(one[0]!.to - one[0]!.from).toBe(719);
  await expect(tab(page, "1D")).toHaveAttribute("aria-pressed", "true");
  for (const [r, [res, bars, span]] of Object.entries(plan)) {
    const n = (await reqs(page)).length;
    await tab(page, r).click();
    await plotted(page);
    const mine = (await reqs(page)).slice(n);
    expect(mine, r).toHaveLength(1);
    const q = mine[0]!;
    expect(q.res, r).toBe(res);
    expect(q.to % span, r).toBe(0);
    expect(q.from, r).toBe(Math.max(0, q.to - (bars - 1) * span));
    await expect(tab(page, r)).toHaveAttribute("aria-pressed", "true");
    await expect(chart(page)).toHaveAttribute("data-range", r);
    const data = await lwc<Pt[]>(page, "data");
    expect(data.at(-1)!.time, r).toBe(q.to * 120);
    if (r === "1W") await shot(page, "1w");
  }
  const n = (await reqs(page)).length;
  await tab(page, "All").click();
  await plotted(page);
  const all = (await reqs(page)).slice(n);
  expect(all.length).toBeGreaterThanOrEqual(1);
  expect(all[0]).toMatchObject({ res: "day", from: 0 });
  for (const q of all) expect((q.to - q.from) / 720 + 1).toBeLessThanOrEqual(5000);
  for (let i = 1; i < all.length; i++) expect(all[i]!.from).toBe(all[i - 1]!.to + 720);
});

test("BR-7-05 options = the Studio literals in all 4 palettes; hc: hc line colour, 2 px, grid off; no brass in the chart", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await openChart(page);
  for (const p of PALETTES) {
    await pinPalette(page, p);
    const want = { bg: lit("win", p), text: lit("fg-faint", p), grid: lit("grid", p), cross: lit("line", p), series: lit("fg", p), lastLine: lit("fg-muted", p) };
    await expect.poll(async () => {
      const c = await lwc<{ layout: { background: { color: string }; textColor: string }; grid: { vertLines: { color: string } }; crosshair: { vertLine: { color: string } } }>(page, "chart");
      const s = await lwc<{ color: string }>(page, "series");
      const l = await lwc<{ color: string }>(page, "line");
      return { bg: c.layout.background.color, text: c.layout.textColor, grid: c.grid.vertLines.color, cross: c.crosshair.vertLine.color, series: s.color, lastLine: l.color };
    }, { message: p }).toEqual(want);
    const tag = chart(page).getByTestId("br-chart-tag");
    expect(await tag.evaluate((e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).color])).toEqual([lit("win2", p), lit("fg", p)]);
    expect(await colours(chart(page)), p).not.toContain(lit("acc", p));
    if (p === "broadsheet") await shot(page, "broadsheet");
  }
  await pinPalette(page, "ink-brass");
  await pinHtml(page, "hc", true);
  await expect.poll(async () => (await lwc<{ lineWidth: number }>(page, "series")).lineWidth).toBe(2);
  const c = await lwc<{ grid: { vertLines: { visible: boolean }; horzLines: { visible: boolean } }; crosshair: { vertLine: { color: string } } }>(page, "chart");
  expect([c.grid.vertLines.visible, c.grid.horzLines.visible, c.crosshair.vertLine.color]).toEqual([false, false, SPEC_COLOUR.hcLine]);
  expect(await chart(page).getByTestId("br-chart-canvas").evaluate((e) => [getComputedStyle(e).borderTopWidth, getComputedStyle(e).borderTopColor])).toEqual(["1px", SPEC_COLOUR.fgMuted]);
  await pinHtml(page, "hc", false);
  await expect.poll(async () => (await lwc<{ lineWidth: number }>(page, "series")).lineWidth).toBe(1);
});

test("BR-7-06 / -07 20 live ticks: last bar updated in place or appended, tag = ticker.last, CLS 0, no new request, Place the only brass", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await openChart(page);
  await page.evaluate(() => {
    const w = window as Window & { __cls?: number };
    w.__cls = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) w.__cls! += e.value; }).observe({ type: "layout-shift" });
  });
  const primariesBefore = await primaries(page);
  const before = (await reqs(page)).length;
  let prev = await lwc<Pt[]>(page, "data");
  let appended = 0, inPlace = 0;
  for (let i = 0; i < 20; i++) {
    await page.clock.runFor(TICK_MS);
    await page.clock.runFor(50);
    const data = await lwc<Pt[]>(page, "data");
    if (data.length === prev.length + 1) { appended++; expect(data.slice(0, -1)).toEqual(prev); }
    else { inPlace++; expect(data.length).toBe(prev.length); expect(data.at(-1)!.time).toBe(prev.at(-1)!.time); expect(data.slice(0, -1)).toEqual(prev.slice(0, -1)); }
    await expect(chart(page).getByTestId("br-chart-tag")).toHaveText((await br(page).getByTestId("br-last").textContent())!);
    prev = data;
  }
  expect(appended + inPlace).toBe(20);
  expect(appended).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as Window & { __cls?: number }).__cls)).toBe(0);
  expect((await reqs(page)).length).toBe(before);
  expect(await primaries(page)).toBe(primariesBefore);
  const acc = await color(page, "var(--acc)");
  expect(await colours(br(page).locator(".br-col-ticket"), ["br-place"])).not.toContain(acc);
  expect(await colours(chart(page))).not.toContain(acc);
  await shot(page, "1d");
});

test("BR-7-08 ?halt=HALC: steel band at the live edge + 'Halted' top-left, no --loss; reduced motion: no kinetic pan, no animation", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openChart(page, "&halt=HALC");
  const band = chart(page).getByTestId("br-chart-halt"), label = chart(page).getByTestId("br-chart-halted");
  await expect(band).toBeVisible();
  await expect(label).toHaveText("Halted");
  const steel = await color(page, "var(--steel)");
  expect(await label.evaluate((e) => getComputedStyle(e).color)).toBe(steel);
  expect(await band.evaluate((e) => getComputedStyle(e).backgroundColor)).toMatch(/^color\(srgb |^rgba\(/); // steel at token alpha
  const [b, p, l] = await Promise.all([band.boundingBox(), chart(page).getByTestId("br-chart-canvas").boundingBox(), label.boundingBox()]);
  expect(b!.height).toBeGreaterThan(100);
  expect(p!.x + p!.width - (b!.x + b!.width)).toBeGreaterThan(0); // inside the plot, left of the price scale
  expect(l!.x - p!.x).toBeLessThan(16);
  expect(l!.y - p!.y).toBeLessThan(16);
  expect(await colours(chart(page))).not.toContain(await color(page, "var(--loss)"));
  expect(await colours(chart(page))).not.toContain(await color(page, "var(--acc)"));
  await shot(page, "halted");
  await run(page, async () => (await page.evaluate(() => document.documentElement.dataset.motion)) === "reduce");
  expect((await lwc<{ kineticScroll: { touch: boolean; mouse: boolean } }>(page, "chart")).kineticScroll).toEqual({ touch: false, mouse: false });
  await chart(page).getByTestId("br-chart-canvas").focus();
  await page.keyboard.press("+");
  await page.keyboard.press("ArrowLeft");
  expect(await chart(page).evaluate((el) => document.getAnimations().filter((a) => el.contains((a.effect as KeyframeEffect | null)?.target ?? null)).length)).toBe(0);
});

test("BR-7-09 table: same bar count and last close, newest first; Tab reaches plot, toggle and table; aria-label names first and last close; axe", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await openChart(page);
  const data = await lwc<Pt[]>(page, "data");
  const canvas = chart(page).getByTestId("br-chart-canvas");
  const label = (await canvas.getAttribute("aria-label"))!;
  expect(label).toMatch(/^HALC price, 1D: from [\d,]+\.\d+ to [\d,]+\.\d+$/);
  expect(await canvas.getAttribute("role")).toBe("img");
  await tab(page, "All").focus();
  await page.keyboard.press("Tab");
  await expect(canvas).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(chart(page).getByTestId("br-chart-live")).toHaveText(/^Day \d+ · \d\d:\d\d: close [\d,]+\.\d+$/);
  await page.keyboard.press("Tab");
  await expect(chart(page).getByTestId("br-chart-toggle")).toBeFocused();
  await expect(chart(page).getByTestId("br-chart-toggle")).toHaveText("View as table");
  await page.keyboard.press("Enter");
  const table = chart(page).getByTestId("br-chart-table");
  await expect(table).toBeVisible();
  await expect(chart(page).getByTestId("br-chart-toggle")).toHaveText("View as chart");
  expect(await table.getAttribute("aria-label")).toBe(label);
  await expect(table.locator("tbody tr")).toHaveCount(data.length);
  const lastClose = label.split(" to ")[1]!;
  expect(await table.locator("tbody tr").first().locator("td").nth(3).textContent()).toBe(lastClose);
  expect(lastClose).toBe(new Intl.NumberFormat("en-US", { minimumFractionDigits: 2 }).format(data.at(-1)!.value));
  await expect(table.locator("thead th")).toHaveText(["Time", "Open", "High", "Low", "Close", "Volume"]);
  await expect(chart(page).getByTestId("br-chart-toggle")).toBeFocused();
  await page.keyboard.press("Shift+Tab"); // the table sits in the box, before the toggle
  await expect(table).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(chart(page).getByTestId("br-chart-toggle")).toBeFocused();
  await table.focus();
  await shot(page, "table");
  await page.clock.resume(); // axe runs on timers
  expect(await axe(page)).toEqual([]);
  await chart(page).getByTestId("br-chart-toggle").click();
  await plotted(page);
  expect(await axe(page)).toEqual([]);
});

test("BR-7-11 ?feed=loading: the skeleton at chart height, busy", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await boot(page, "/broker?asset=HALC&feed=loading");
  const sk = page.getByTestId("br-chart-loading").first();
  await expect(sk).toBeVisible();
  await expect(sk).toHaveAttribute("aria-busy", "true");
  expect((await page.getByTestId("br-chart-box").first().boundingBox())!.height).toBe(240);
  await shot(page, "loading");
});
for (const mode of ["denied", "error"] as const) {
  test(`BR-7-11 ?feed=${mode}: Couldn't load chart + Retry`, async ({ page }, info) => {
    desktopOnly(info.project.name);
    await boot(page, `/broker?asset=HALC&feed=${mode}`);
    const err = page.getByTestId("br-chart-error").first();
    await expect(err).toContainText("Couldn't load chart");
    await expect(page.getByTestId("br-chart-retry").first()).toBeVisible();
    if (mode === "error") await shot(page, "error");
  });
}
test("BR-7-11 ?history=flaky: error, then exactly one request on Retry and the plot", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await openBrokerPaused(page, "/broker?asset=HALC&history=flaky", br(page));
  await run(page, async () => (await state(page)) === "error");
  await expect(chart(page).getByTestId("br-chart-error")).toContainText("Couldn't load chart");
  expect(await lwc(page, "data")).toBeNull();
  const n = (await reqs(page)).length;
  expect(n).toBe(1);
  await chart(page).getByTestId("br-chart-retry").click();
  await plotted(page);
  expect((await reqs(page)).length).toBe(n + 1);
});
test("BR-7-11 ?history=bad: never a partial plot", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await openBrokerPaused(page, "/broker?asset=HALC&history=bad", br(page));
  await run(page, async () => (await state(page)) === "error");
  await expect(chart(page).getByTestId("br-chart-canvas")).toHaveCount(0);
});
test("BR-7-11 ?empty=1: 'No price history yet.' muted, the box keeps its height", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await openBrokerPaused(page, "/broker?asset=HALC&empty=1", br(page));
  await run(page, async () => (await state(page)) === "empty");
  const msg = chart(page).getByTestId("br-chart-empty");
  await expect(msg).toHaveText("No price history yet.");
  expect(await msg.evaluate((e) => getComputedStyle(e).color)).toBe(await color(page, "var(--fg-muted)"));
  expect((await chart(page).getByTestId("br-chart-box").boundingBox())!.height).toBe(240);
});
test("BR-7-11 ?feed=stale: the last plot stays, dimmed, with one 'Updating…'", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await openChart(page, "&feed=stale");
  const box = chart(page).getByTestId("br-chart-box");
  await run(page, async () => (await box.getAttribute("class"))!.includes("stale"), 30_000);
  expect(await box.evaluate((e) => getComputedStyle(e).opacity)).toBe("0.6");
  await expect(chart(page).getByTestId("br-chart-canvas")).toBeVisible();
  // One "Updating…" for the price (frame or chart); open orders keeps its own card-5 line for `me`.
  const updating = await br(page).locator('[data-testid="br-updating"], [data-testid="br-chart-updating"]').count();
  expect(updating).toBe(1);
  await expect(br(page).getByText("Updating…").first()).toBeVisible();
});

test("BR-7-12 1440x900: chart in br-col-head above holdings, 240 px, tabs >= 28 px in one row, no overflow; cb / hc baselines", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await openChart(page);
  const head = br(page).locator(".br-col-head");
  await expect(head.getByTestId("br-chart")).toHaveCount(1);
  const [c, hold] = await Promise.all([chart(page).boundingBox(), head.getByTestId("br-hold").boundingBox()]);
  expect(c!.y + c!.height).toBeLessThanOrEqual(hold!.y);
  expect((await chart(page).getByTestId("br-chart-box").boundingBox())!.height).toBe(240);
  expect(await hits(chart(page), 28)).toEqual([]);
  const ys = new Set(await chart(page).getByTestId("br-chart-ranges").locator("button").evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect().y)));
  expect(ys.size).toBe(1);
  expect(await overflow(br(page))).toEqual([]);
  await pinHtml(page, "cb", true);
  await page.clock.runFor(100);
  await expect(chart(page)).toHaveScreenshot(["BR-7", "cb-1440x900.png"]);
  await pinHtml(page, "cb", false);
  await pinHtml(page, "hc", true);
  await expect.poll(async () => (await lwc<{ lineWidth: number }>(page, "series")).lineWidth).toBe(2);
  await page.clock.runFor(100);
  await expect(chart(page)).toHaveScreenshot(["BR-7", "hc-1440x900.png"]);
  await shot(page, "hc");
  await pinHtml(page, "hc", false);
});

test("BR-7-12 520 window: chart above the ticket, 200 px, no overflow", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await openChart(page);
  const win = await resizeWindow(page);
  expect((await win.boundingBox())!.width).toBe(520);
  await page.clock.runFor(200);
  await expect.poll(async () => (await chart(page).getByTestId("br-chart-box").boundingBox())!.height).toBe(200);
  const [c, ticket] = await Promise.all([chart(page).boundingBox(), br(page).locator(".br-col-ticket").boundingBox()]);
  expect(c!.y + c!.height).toBeLessThanOrEqual(ticket!.y);
  expect(await hits(chart(page), 28)).toEqual([]);
  expect(await overflow(br(page))).toEqual([]);
  await shot(page, "1d-window-520");
});

for (const scale of ["1", "2"] as const) {
  test(`BR-7-12 phone scale ${scale}: 200 px, tabs >= 44 px${scale === "2" ? " in 2 rows of 3" : ""}, no overflow; table`, async ({ page }, info) => {
    phoneOnly(info.project.name);
    await page.clock.install({ time: new Date("2026-10-21T08:00:00Z") });
    await boot(page, "/settings");
    await setTextScale(page, scale);
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByTestId("icon-broker").click();
    await page.getByTestId("broker").first().getByTestId("br-asset-select").selectOption("HALC");
    await expect(br(page)).toHaveAttribute("data-state", "live");
    const now = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(new Date(now + 1_000));
    await plotted(page);
    expect((await chart(page).getByTestId("br-chart-box").boundingBox())!.height).toBe(200);
    expect(await hits(chart(page), 44)).toEqual([]);
    const ys = [...new Set(await chart(page).getByTestId("br-chart-ranges").locator("button").evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().y))))];
    expect(ys.length).toBe(scale === "2" ? 2 : 1);
    const fits = async () => {
      expect(await overflow(br(page))).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    };
    await fits();
    const [c, ticket] = await Promise.all([chart(page).boundingBox(), br(page).locator(".br-col-ticket").boundingBox()]);
    expect(c!.y + c!.height).toBeLessThanOrEqual(ticket!.y);
    await chart(page).scrollIntoViewIfNeeded();
    await shot(page, `1d-scale-${scale}`);
    await chart(page).getByTestId("br-chart-toggle").tap();
    await expect(chart(page).getByTestId("br-chart-table")).toBeVisible();
    await fits();
    await shot(page, `table-scale-${scale}`);
  });
}

test("BR-7-12 FR: tabs and aria with NNBSP, table headers, empty copy", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await openChart(page, "&locale=fr");
  await expect(chart(page).getByTestId("br-chart-ranges").locator("button")).toHaveText(["1\u202fh", "1\u202fj", "1\u202fsem.", "1\u202ftrim.", "1\u202fan", "Tout"]);
  await expect(chart(page).getByTestId("br-chart-ranges")).toHaveAttribute("aria-label", "Période du graphique");
  expect(await chart(page).getByTestId("br-chart-canvas").getAttribute("aria-label")).toMatch(/^Cours de HALC, 1\u202fj\u202f: de [\d\u202f]+,\d+ à [\d\u202f]+,\d+$/);
  await chart(page).getByTestId("br-chart-toggle").click();
  await expect(chart(page).getByTestId("br-chart-table").locator("thead th")).toHaveText(["Heure", "Ouverture", "Plus haut", "Plus bas", "Clôture", "Volume"]);
  await expect(chart(page).getByTestId("br-chart-toggle")).toHaveText("Voir le graphique");
  await shot(page, "table", "fr");
});
