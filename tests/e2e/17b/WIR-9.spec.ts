// UI card 9 (17B WIR-B slice) Wire item detail, end to end against the production build and its mock feed:
// WIR-9-04 Open in Broker, 05 Terminal priced-in, 07 Back / Esc / phone back, 09 states and filings Retry, 10 the 1440
// split and the 520 replace layouts, 11 phone at text scale 1 / 2 with reduced motion, cb / hc and axe. 01-03, 06, 08
// and 12 are unit tests (tests/unit/17b/WIR-9-*). Compared baselines: tests/e2e/17b/__screenshots__/WIR-9/<state>-<vw>x<vh>.png;
// PR shots also go to $WIR9_SHOTS_DIR when set. Desktop frames mask only their r×r corners (winShot.ts).
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { bootPaused, intents, setTextScale } from "../shell/helpers";
import { pinHtml } from "./pin";
import { winShot, winShotBuffer } from "./winShot";

const desktopOnly = (n: string) => test.skip(n !== "desktop", "desktop project only");
const phoneOnly = (n: string) => test.skip(n !== "phone", "phone project only");
const NNBSP = "\u202F";

const wire = (page: Page) => page.getByTestId("wire");
const row = (page: Page, id: string) => page.locator(`[data-testid=wire-row][data-id="${id}"]`);
const openBtn = (page: Page, id: string) => row(page, id).getByTestId("wire-open");
const detail = (page: Page) => page.getByTestId("wire-detail");
const pane = (page: Page) => page.getByTestId("wire-pane");
/** The Wire window (desktop) or the phone app view: the screenshot frame. */
const frame = (page: Page) => page.locator('[data-testid="win-wire"], [data-testid="phone-appview"]').first();

/** Pages already booted on the fake clock: their clock stays paused across a navigation, which starves the next
 *  boot's timers (quay-ready never shows), so a re-boot resumes it first. */
const booted = new WeakSet<Page>();
async function bootWire(page: Page, query = "", loading = false) {
  if (booted.has(page)) await page.clock.resume();
  booted.add(page);
  await bootPaused(page, `/wire${query}`);
  const settled = page.locator(loading ? '[data-testid="wire"][data-state="loading"]' : '[data-testid="wire"]:not([data-state="loading"]), [data-testid="wire-denied"], [data-testid="wire-error"]');
  await expect.poll(async () => { await page.clock.runFor(100); return settled.count(); }, { timeout: 15_000 }).toBe(1);
  await page.clock.runFor(200);
}
/** Phone: Settings (text scale) → Home → Wire, on a paused clock. */
async function bootPhoneWire(page: Page, scale: "1" | "2", query = "") {
  await bootPaused(page, `/settings${query}`);
  await page.clock.resume();
  await setTextScale(page, scale);
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByTestId("icon-wire").click();
  await expect(wire(page)).toHaveAttribute("data-state", "live");
  await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 200));
}
async function open(page: Page, id: string) {
  await openBtn(page, id).click();
  await expect(detail(page)).toHaveAttribute("data-id", id);
  await page.clock.runFor(100);
}
const shot = (page: Page, state: string, l: Locator = frame(page)) =>
  winShot(page, l, "WIR-9", `${state}-${page.viewportSize()!.width}x${page.viewportSize()!.height}.png`, process.env.WIR9_SHOTS_DIR);
const color = (page: Page, v: string) => page.evaluate((x) => { const e = document.createElement("i"); e.style.color = x; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; }, v);
const colours = (l: Locator) => l.evaluate((el) => {
  const out = new Set<string>();
  for (const e of [el, ...el.querySelectorAll("*")]) {
    const s = getComputedStyle(e);
    for (const c of [s.color, s.backgroundColor, s.borderTopColor, s.borderLeftColor, s.borderBottomColor, s.outlineColor]) out.add(c);
  }
  return [...out];
});
async function noBrassGainLoss(page: Page) {
  const seen = await colours(pane(page));
  for (const v of ["var(--acc)", "var(--acc-hi)", "var(--acc-lo)", "var(--gain)", "var(--loss)"]) expect(seen, v).not.toContain(await color(page, v));
}
const overflow = (l: Locator) => l.evaluate((root) => [root, ...root.querySelectorAll("*")]
  .filter((e) => (e as HTMLElement).offsetParent !== null && !e.classList.contains("sr-only") && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== "visible")
  .map((e) => `${e.getAttribute("data-testid") ?? e.className} ${e.scrollWidth}>${e.clientWidth}`));
const outside = (l: Locator) => l.evaluate((root) => {
  const edge = (root.closest(".win, .phone-appview") ?? document.documentElement).getBoundingClientRect().right;
  return [...root.querySelectorAll("*")].filter((e) => (e as HTMLElement).offsetParent !== null && e.getBoundingClientRect().right > edge + 0.5).map((e) => e.getAttribute("data-testid") ?? e.className);
});
/** axe-core waits on timers, so the paused clock runs while it scans (take baselines before this). */
async function axe(page: Page) {
  await page.clock.resume();
  const r = await new AxeBuilder({ page }).include('[data-testid="wire"]').analyze();
  await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 200));
  return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ")}`);
}
const height = async (l: Locator) => (await l.boundingBox())!.height;
/** The headline button's hit area is its whole row (::after inset 0): points just inside the row's edges land on it. */
const rowHits = (page: Page, id: string) => row(page, id).evaluate((li) => {
  const r = li.getBoundingClientRect(), b = li.querySelector('[data-testid="wire-open"]')!;
  const pts = [[r.left + 2, r.top + 2], [r.right - 2, r.top + 2], [r.left + 2, r.bottom - 2], [r.right - 2, r.bottom - 2]];
  return pts.every(([x, y]) => document.elementFromPoint(x!, y!) === b);
});
async function resizeTo520(page: Page) {
  const win = page.getByTestId("win-wire").first();
  const handle = (await win.getByTestId("resize-handle").boundingBox())!;
  await page.mouse.move(handle.x + 5, handle.y + 5);
  await page.mouse.down();
  await page.mouse.move(handle.x + 5 - ((await win.boundingBox())!.width - 520), handle.y + 5, { steps: 5 });
  await page.mouse.up();
  await page.clock.runFor(100);
  expect((await win.boundingBox())!.width).toBe(520);
}

test("WIR-9-10 1440: feed and pane side by side; RUMOR record + band, FILING summary; targets ≥ 28; no brass / gain / loss; axe; baselines", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await bootWire(page);
  await expect(wire(page)).toHaveAttribute("data-layout", "split");
  await expect(page.getByTestId("wire-no-selection")).toHaveText("Select a story to read it here.");
  await shot(page, "none");

  await open(page, "n-2");
  await expect(detail(page).getByRole("heading", { level: 2 })).toBeFocused();
  await expect(row(page, "n-2")).toHaveAttribute("aria-current", "true");
  await expect(detail(page)).toHaveAccessibleName(await detail(page).getByTestId("wire-detail-headline").innerText());
  await expect(detail(page).getByTestId("wire-detail-record")).toHaveText("3 of 7 past claims held up");
  await expect(detail(page).getByTestId("wire-detail-band")).toHaveAttribute("data-band", "mixed");
  const f = (await page.getByTestId("wire-feed").boundingBox())!, p = (await pane(page).boundingBox())!;
  expect(f.width).toBeGreaterThanOrEqual(520); // the default 840 window: the feed keeps card 1's wide rows (WIR-1-09)
  expect(p.width).toBeGreaterThanOrEqual(300);
  expect(Math.round((await row(page, "n-2").locator(".wire-row-kind").boundingBox())!.width)).toBe(96);
  expect(p.x).toBeGreaterThanOrEqual(f.x + f.width - 0.5); // side by side
  expect(await pane(page).evaluate((el) => getComputedStyle(el).borderLeftColor)).toBe(await color(page, "var(--line)"));
  for (const id of ["n-1", "n-2"]) {
    expect(await height(row(page, id))).toBeGreaterThanOrEqual(28);
    expect(await rowHits(page, id), id).toBe(true);
  }
  expect(await height(detail(page).getByTestId("wire-open-broker"))).toBeGreaterThanOrEqual(28);
  await noBrassGainLoss(page);
  await shot(page, "rumor");
  expect(await axe(page)).toEqual([]);

  await open(page, "n-3");
  const filing = detail(page).getByTestId("wire-filing");
  await expect(filing).toHaveAttribute("data-state", "live");
  await expect(filing.getByTestId("wire-filing-filer")).toContainText("Northwind Capital");
  await expect(filing.getByTestId("wire-filing-subject")).toContainText("Avalon Bank");
  await expect(filing.getByTestId("wire-filing-field").first()).toContainText(`5.20${NNBSP}%`);
  await expect(filing.getByTestId("wire-filing-field").nth(1)).toContainText("410,000"); // EN grouping (decText); FR NNBSP grouping is unit-tested
  await noBrassGainLoss(page);
  await shot(page, "filing");
  expect(await axe(page)).toEqual([]);

  await pinHtml(page, "hc", true);
  await page.clock.runFor(100);
  expect(await pane(page).evaluate((el) => getComputedStyle(el).borderLeftColor)).toBe(await color(page, "var(--fg-muted)"));
  await noBrassGainLoss(page);
  await shot(page, "hc");
  expect(await axe(page)).toEqual([]);
  await pinHtml(page, "hc", false);
});

test("winShot: the mask covers only the corner squares, so a 1 px change on the bottom edge row is caught", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await bootWire(page);
  const f = frame(page);
  const base = await winShotBuffer(page, f);
  const dot = (x: number, y: number) => page.evaluate(([x, y]) => {
    const d = document.createElement("div");
    d.id = "edge-dot";
    d.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:1px;height:1px;background:rgb(255,0,0);z-index:2147483646`;
    document.body.append(d);
  }, [x, y] as const);
  const undot = () => page.evaluate(() => document.getElementById("edge-dot")?.remove());
  const b = (await f.boundingBox())!;
  const r = await f.evaluate((el) => Math.ceil(parseFloat(getComputedStyle(el).borderBottomLeftRadius)));
  expect(r).toBeGreaterThan(0);
  for (const [x, y] of [[b.x + r + 1, b.y + b.height - 1], [b.x + b.width / 2, b.y + b.height - 1], [b.x + b.width - r - 2, b.y], [b.x, b.y + r + 1]]) {
    await dot(x!, y!);
    expect((await winShotBuffer(page, f)).equals(base), `edge pixel ${x},${y}`).toBe(false);
    await undot();
  }
  await dot(b.x, b.y + b.height - 1); // inside the bottom-left corner square: masked
  expect((await winShotBuffer(page, f)).equals(base)).toBe(true);
  await undot();
});

test("WIR-9-05 ?tier=terminal: priced-in band + as-of in the detail; ?tier=free: no priced-in section", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await bootWire(page, "?tier=terminal");
  await open(page, "n-1");
  const priced = detail(page).getByTestId("wire-detail-priced");
  await expect(priced.getByTestId("wire-priced-band")).toBeVisible();
  await expect(priced.getByTestId("wire-asof")).toHaveText(/^as of /);
  await shot(page, "terminal");
  await bootWire(page, "?tier=free");
  await open(page, "n-1");
  await expect(detail(page).getByTestId("wire-detail-priced")).toHaveCount(0);
  await expect(detail(page).getByTestId("wire-priced-band")).toHaveCount(0);
});

test("WIR-9-04 Open in Broker on n-1 opens the Broker on HALC; no trade intent", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await bootWire(page);
  const before = await intents(page);
  await open(page, "n-1");
  const go = detail(page).getByTestId("wire-open-broker");
  await expect(go).toHaveAccessibleName("Open HALC in Broker");
  await go.click();
  await expect(page.getByTestId("win-broker")).toHaveCount(1);
  await page.clock.resume(); // the lazy Broker chunk reveals on timers
  await expect(page.getByTestId("win-broker").getByTestId("br-ticker")).toHaveText("HALC");
  await go.evaluate((b: HTMLElement) => b.click()); // again (the Broker window now covers it): focuses, never a second Broker
  await page.waitForTimeout(300);
  await expect(page.getByTestId("win-broker")).toHaveCount(1);
  expect(await intents(page)).toBe(before);
});

test("WIR-9-07 desktop: Esc closes the split pane and returns focus to the row; the 520 window replaces the feed, Back returns to it", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await bootWire(page);
  await open(page, "n-2");
  await page.keyboard.press("Escape");
  await expect(detail(page)).toHaveCount(0);
  await expect(openBtn(page, "n-2")).toBeFocused();
  await expect(row(page, "n-2")).not.toHaveAttribute("aria-current", "true");

  await resizeTo520(page);
  await expect(wire(page)).toHaveAttribute("data-layout", "single");
  await open(page, "n-3");
  await expect(page.getByTestId("wire-feed")).toBeHidden();
  const back = detail(page).getByTestId("wire-back");
  await expect(back).toHaveText("Back to Wire");
  expect(await height(back)).toBeGreaterThanOrEqual(28);
  await expect(detail(page).getByTestId("wire-detail-bar-title")).toHaveText("Filing");
  for (const b of [back, detail(page).getByTestId("wire-open-broker")]) expect(await height(b)).toBeGreaterThanOrEqual(28);
  expect(await overflow(wire(page))).toEqual([]);
  expect(await outside(wire(page))).toEqual([]);
  await noBrassGainLoss(page);
  await shot(page, "window-520");
  await back.click();
  await expect(page.getByTestId("wire-feed")).toBeVisible();
  await expect(openBtn(page, "n-3")).toBeFocused();
  await open(page, "n-1");
  await page.keyboard.press("Escape");
  await expect(openBtn(page, "n-1")).toBeFocused();
});

test("WIR-9-09 ?feed= states; an open detail dims under stale; filings loading skeleton, error → Retry resyncs filings", async ({ page }, info) => {
  desktopOnly(info.project.name);
  for (const mode of ["denied", "error"] as const) {
    await bootWire(page, `?feed=${mode}`);
    await expect(page.getByTestId(`wire-${mode}`)).toBeVisible();
    await expect(page.getByTestId("wire-open")).toHaveCount(0);
  }
  await bootWire(page, "?feed=loading", true);
  await expect(page.getByTestId("wire-open")).toHaveCount(0);

  await bootWire(page, "?feed=stale");
  // stale is a missed-tick timeout (staleAfterMs = 2.25 ticks): advance the paused clock a tick at a time until it lands
  await expect.poll(async () => { await page.clock.runFor(5000); return wire(page).getAttribute("data-state"); }, { timeout: 15_000 }).toBe("stale");
  await open(page, "n-2");
  await expect(detail(page)).toHaveAttribute("data-stale", "1");
  await expect(detail(page).getByTestId("wire-detail-headline")).toBeVisible();

  await bootWire(page, "?filings=loading");
  await open(page, "n-3");
  await expect(detail(page).getByTestId("wire-filing")).toHaveAttribute("data-state", "loading");
  await expect(detail(page).getByTestId("wire-filing")).toHaveAttribute("aria-busy", "true");
  await expect(detail(page).locator(".wire-filing-skel")).toHaveCount(1);

  await bootWire(page, "?filings=error");
  await open(page, "n-3");
  const filing = detail(page).getByTestId("wire-filing");
  await expect(filing).toHaveAttribute("data-state", "error");
  await expect(filing.getByRole("alert")).toHaveText("Couldn't load");
  await expect(wire(page)).toHaveAttribute("data-state", "live"); // news untouched
  await filing.getByTestId("wire-filing-retry").click();
  await expect.poll(async () => { await page.clock.runFor(100); return filing.getAttribute("data-state"); }, { timeout: 10_000 }).toBe("live");
  await expect(filing.getByTestId("wire-filing-filer")).toContainText("Northwind Capital");
});

for (const scale of ["1", "2"] as const) {
  test(`WIR-9-11 phone scale ${scale}: pushed screen titled with the kind, targets ≥ 44, no overflow, no motion, axe${scale === "1" ? ", cb / hc baselines" : ", filing baseline"}; WIR-9-07 phone back`, async ({ page }, info) => {
    phoneOnly(info.project.name);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await bootPhoneWire(page, scale);
    expect(await height(row(page, "n-2"))).toBeGreaterThanOrEqual(44);
    expect(await rowHits(page, "n-2")).toBe(true);
    await open(page, "n-2");
    await expect(page.getByTestId("app-title")).toHaveText("Rumor");
    await expect(page.getByTestId("app-back")).toHaveAccessibleName("Back to Wire");
    await expect(page.getByTestId("wire-feed")).toBeHidden();
    await expect(detail(page).getByTestId("wire-back")).toHaveCount(0); // the shell bar is the back
    await expect(detail(page).getByRole("heading", { level: 2 })).toBeFocused();
    for (const b of [page.getByTestId("app-back"), detail(page).getByTestId("wire-open-broker")]) expect(await height(b)).toBeGreaterThanOrEqual(44);
    expect(await overflow(frame(page))).toEqual([]);
    expect(await outside(wire(page))).toEqual([]);
    const motion = await pane(page).evaluate((el) => [el, ...el.querySelectorAll("*")].flatMap((e) => {
      const s = getComputedStyle(e);
      return [s.animationName !== "none" ? `${e.className} anim ${s.animationName}` : "", parseFloat(s.transitionDuration) > 0.011 ? `${e.className} ${s.transitionProperty} ${s.transitionDuration}` : ""].filter(Boolean);
    }));
    expect(motion).toEqual([]);
    await noBrassGainLoss(page);
    await shot(page, `phone-scale-${scale}`);
    expect(await axe(page)).toEqual([]);
    if (scale === "1") {
      await pinHtml(page, "cb", true);
      await page.clock.runFor(100);
      await noBrassGainLoss(page);
      await shot(page, "cb");
      await pinHtml(page, "cb", false);
      await pinHtml(page, "hc", true);
      await page.clock.runFor(100);
      await noBrassGainLoss(page);
      await shot(page, "hc");
      expect(await axe(page)).toEqual([]);
      await pinHtml(page, "hc", false);
    }
    await page.getByTestId("app-back").click();
    await expect(page.getByTestId("app-title")).toHaveText("Wire");
    await expect(detail(page)).toHaveCount(0);
    await expect(openBtn(page, "n-2")).toBeFocused();
    if (scale === "2") {
      await open(page, "n-3");
      await expect(page.getByTestId("app-title")).toHaveText("Filing");
      await expect(detail(page).getByTestId("wire-filing")).toHaveAttribute("data-state", "live");
      expect(await overflow(frame(page))).toEqual([]);
      await shot(page, "phone-filing-2");
      expect(await axe(page)).toEqual([]);
    }
  });
}
