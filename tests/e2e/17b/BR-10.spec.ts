// UI card 10 (17B BRK-D slice) Broker asset page, end to end against the production build and its mock feed:
// BR-10-02 the Trade | About switch (draft kept, focus), 08 a News row opens that story in Wire, 09 the states,
// 10 the 1440 and 520 window layouts, 11 phone at text scale 1 / 2 with reduced motion, cb / hc and axe. 01, 03-07 and
// 12 are unit tests (tests/unit/17b/BR-10-*). Compared baselines: tests/e2e/17b/__screenshots__/BR-10/<state>-<vw>x<vh>.png
// (desktop frames mask only their r×r corners, winShot.ts); PR shots also go to $BR10_SHOTS_DIR when set.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { bootPaused, intents, setTextScale } from "../shell/helpers";
import { openBrokerPaused } from "./openPaused";
import { pinHtml } from "./pin";
import { winShot } from "./winShot";

const desktopOnly = (n: string) => test.skip(n !== "desktop", "desktop project only");
const phoneOnly = (n: string) => test.skip(n !== "phone", "phone project only");

const brk = (page: Page) => page.getByTestId("broker").first();
const about = (page: Page) => page.getByTestId("br-about");
const tab = (page: Page, k: "overview" | "news") => page.getByTestId(`br-about-tabs-${k}`);
const stories = (page: Page) => page.getByTestId("ap-story");
const frame = (page: Page) => page.locator('[data-testid="win-broker"], [data-testid="phone-appview"]').first();
const shot = (page: Page, state: string) =>
  winShot(page, frame(page), "BR-10", `${state}-${page.viewportSize()!.width}x${page.viewportSize()!.height}.png`, process.env.BR10_SHOTS_DIR);

async function openBroker(page: Page, query = "") {
  await openBrokerPaused(page, `/broker?asset=HALC${query}`, brk(page));
}
/** Run the paused clock in 100 ms steps until `done`, at most 10 s of fake time. */
async function until(page: Page, done: () => Promise<boolean>) {
  for (let t = 0; t < 10_000 && !(await done()); t += 100) await page.clock.runFor(100);
  expect(await done()).toBe(true);
}
async function toAbout(page: Page, root: Page | Locator = page) {
  await root.getByTestId("br-view-about").click();
  await expect(root.getByTestId("br-about")).toBeVisible();
  await page.clock.runFor(100);
}
async function toNews(page: Page) {
  await tab(page, "news").click();
  await until(page, async () => (await page.locator('[data-testid="ap-news"], [data-testid="ap-news-error"]').count()) > 0);
}
const color = (page: Page, v: string) => page.evaluate((x) => { const e = document.createElement("i"); e.style.color = x; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; }, v);
const colours = (l: Locator) => l.evaluate((el) => {
  const out = new Set<string>();
  for (const e of [el, ...el.querySelectorAll("*")]) {
    const s = getComputedStyle(e);
    for (const c of [s.color, s.backgroundColor, s.borderTopColor, s.borderLeftColor, s.borderBottomColor, s.outlineColor]) out.add(c);
  }
  return [...out];
});
/** Never brass on the page; gain / loss only inside the reused quote (`ap-today`). */
async function noBrass(page: Page) {
  const brass = await Promise.all(["var(--acc)", "var(--acc-hi)", "var(--acc-lo)"].map((v) => color(page, v)));
  const seen = await colours(brk(page));
  for (const c of brass) expect(seen, "brass").not.toContain(c);
  const outsideQuote = await about(page).evaluate((el) => {
    const out = new Set<string>();
    for (const e of [el, ...el.querySelectorAll("*")]) if (!e.closest('[data-testid="ap-today"]')) out.add(getComputedStyle(e).color);
    return [...out];
  });
  for (const v of ["var(--gain)", "var(--loss)"]) expect(outsideQuote, v).not.toContain(await color(page, v));
}
/** Every visible button in the Broker at least `min` px tall (and wide, up to 44). */
async function smallTargets(l: Locator, min: number) {
  const small: string[] = [];
  for (const c of await l.locator('button, select, [role="tab"]').all()) {
    if (!(await c.isVisible())) continue;
    const b = (await c.boundingBox())!;
    if (b.height < min || b.width < Math.min(min, 44)) small.push(`${await c.getAttribute("data-testid")} ${b.width}x${b.height}`);
  }
  return small;
}
const overflow = (l: Locator) => l.evaluate((root) => [root, ...root.querySelectorAll("*")]
  .filter((e) => (e as HTMLElement).offsetParent !== null && !e.classList.contains("sr-only") && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== "visible")
  .map((e) => `${e.getAttribute("data-testid") ?? e.className} ${e.scrollWidth}>${e.clientWidth}`));
const outside = (l: Locator) => l.evaluate((root) => {
  const edge = (root.closest(".win, .phone-appview") ?? document.documentElement).getBoundingClientRect().right;
  return [...root.querySelectorAll("*")].filter((e) => (e as HTMLElement).offsetParent !== null && e.getBoundingClientRect().right > edge + 0.5).map((e) => e.getAttribute("data-testid") ?? e.className);
});
async function axe(page: Page) {
  await page.clock.resume();
  const r = await new AxeBuilder({ page }).include('[data-testid="broker"]').analyze();
  await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 200));
  return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ")}`);
}
const rowText = (page: Page, key: string) => page.locator(`[data-testid="ap-row"][data-key="${key}"] dd`).innerText();

test("BR-10-02 Trade | About: Overview by default, focus to the About h2; Trade keeps the draft and focuses the ticker", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await openBroker(page);
  await expect(brk(page)).toHaveAttribute("data-view", "trade");
  await expect(page.getByTestId("br-view-trade")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("br-name")).toHaveText("Halcyon Shipping");
  await page.getByTestId("br-type-limit").click();
  await page.getByTestId("br-price-limit").fill("42.10");
  await page.getByTestId("br-qty").fill("40");
  await toAbout(page);
  await expect(brk(page)).toHaveAttribute("data-view", "about");
  await expect(page.getByTestId("br-about-title")).toBeFocused();
  await expect(about(page)).toHaveAccessibleName("About");
  await expect(tab(page, "overview")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("br-about-panel")).toHaveAttribute("data-tab", "overview");
  await expect(page.getByTestId("br-qty")).toHaveCount(0); // in-place swap: the ticket is gone

  // Tabs: arrows move focus, Enter selects
  await tab(page, "overview").focus();
  await page.keyboard.press("ArrowRight");
  await expect(tab(page, "news")).toBeFocused();
  await expect(tab(page, "overview")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(tab(page, "news")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("br-about-panel")).toHaveAttribute("data-tab", "news");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press(" ");
  await expect(tab(page, "overview")).toHaveAttribute("aria-selected", "true");

  await page.getByTestId("br-view-trade").click();
  await expect(brk(page)).toHaveAttribute("data-view", "trade");
  await expect(page.getByTestId("br-ticker")).toBeFocused();
  await expect(page.getByTestId("br-qty")).toHaveValue("40");
  await expect(page.getByTestId("br-price-limit")).toHaveValue("42.10");
  await expect(page.getByTestId("br-type-limit")).toHaveAttribute("aria-pressed", "true");
});

test("BR-10-10 1440: Overview with HALC's position, News, News empty, halted, hc; targets ≥ 28; no brass; axe; baselines", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await openBroker(page);
  await toAbout(page);
  expect(await rowText(page, "name")).toBe("Halcyon Shipping");
  expect(await rowText(page, "type")).toBe("Stock");
  await expect(page.getByTestId("ap-last")).toHaveText(await page.getByTestId("br-last").innerText());
  await expect(page.getByTestId("ap-position")).toBeVisible();
  await expect(page.getByTestId("ap-halted")).toHaveCount(0);
  expect(await smallTargets(brk(page), 28)).toEqual([]);
  await noBrass(page);
  await shot(page, "overview");
  expect(await axe(page)).toEqual([]);

  await toNews(page);
  await expect(stories(page)).toHaveCount(1);
  await expect(stories(page)).toHaveAttribute("data-id", "n-1");
  await expect(stories(page)).toHaveAccessibleName(`Open in Wire: ${await stories(page).getByTestId("ap-story-hl").textContent()}`);
  expect((await stories(page).boundingBox())!.height).toBeGreaterThanOrEqual(28);
  expect(await smallTargets(brk(page), 28)).toEqual([]);
  await noBrass(page);
  await shot(page, "news");
  expect(await axe(page)).toEqual([]);

  await pinHtml(page, "hc", true);
  await page.clock.runFor(100);
  await noBrass(page);
  await shot(page, "hc");
  expect(await axe(page)).toEqual([]);
  await pinHtml(page, "hc", false);

});

test("BR-10-10 1440: News empty (GX) and halted (?halt=HALC) baselines", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await openBrokerPaused(page, "/broker?asset=GX", brk(page));
  await toAbout(page);
  expect(await rowText(page, "type")).toBe("Index");
  await expect(page.getByTestId("ap-no-position")).toHaveText("You don't hold this asset.");
  await toNews(page);
  await expect(stories(page)).toHaveCount(0);
  await expect(page.getByTestId("ap-news-empty")).toHaveText(/^No stories about GX in your feed yet\.\s*Only recent stories are kept\.$/);
  await noBrass(page);
  await shot(page, "news-empty");
  expect(await axe(page)).toEqual([]);
});

test("BR-10-05 / 10 ?halt=HALC: Trading shows the halted state and the steel Halted chip; baseline", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await openBroker(page, "&halt=HALC");
  await toAbout(page);
  expect(await rowText(page, "trading")).toMatch(/^Halted\s*Halted$/);
  await expect(page.getByTestId("ap-state")).toHaveAttribute("data-state", "HALTED");
  await expect(page.getByTestId("ap-halted")).toHaveText("Halted");
  expect(await page.getByTestId("ap-halted").evaluate((el) => getComputedStyle(el).color)).toBe(await page.getByTestId("br-halted").evaluate((el) => getComputedStyle(el).color));
  await noBrass(page);
  await shot(page, "halted");
  expect(await axe(page)).toEqual([]);
});

test("BR-10-10 the 520 window: About in place, stacked rows, no overflow, targets ≥ 28; baseline", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await openBroker(page);
  const win = page.getByTestId("win-broker").first();
  const handle = (await win.getByTestId("resize-handle").boundingBox())!;
  await page.mouse.move(handle.x + 5, handle.y + 5);
  await page.mouse.down();
  await page.mouse.move(50, handle.y + 5, { steps: 5 });
  await page.mouse.up();
  await page.clock.runFor(100);
  expect((await win.boundingBox())!.width).toBe(520);
  await toAbout(page);
  await expect(page.getByTestId("br-about-title")).toBeFocused();
  await expect(page.getByTestId("phone-appview")).toHaveCount(0);
  expect(await overflow(brk(page))).toEqual([]);
  expect(await outside(brk(page))).toEqual([]);
  expect(await smallTargets(brk(page), 28)).toEqual([]);
  await noBrass(page);
  await shot(page, "window-520-overview");
  await toNews(page);
  expect(await overflow(brk(page))).toEqual([]);
  expect(await axe(page)).toEqual([]);
});

test("BR-10-08 a News row opens that story in Wire (card 9 detail at 1440); no trade intent; another asset's row re-targets the same Wire", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await openBrokerPaused(page, "/broker", brk(page)); // no context: the asset select
  await page.getByTestId("br-asset-select").selectOption("HALC");
  const before = await intents(page);
  await toAbout(page);
  await toNews(page);
  await stories(page).click();
  await expect(page.getByTestId("win-wire")).toHaveCount(1);
  const detail = page.getByTestId("win-wire").getByTestId("wire-detail");
  await until(page, async () => (await detail.count()) === 1);
  await expect(detail).toHaveAttribute("data-id", "n-1");
  await expect(detail).toBeVisible();
  await expect(page.getByTestId("wire")).toHaveAttribute("data-layout", "split");
  await expect(page.locator('[data-testid=wire-row][data-id="n-1"]')).toHaveAttribute("aria-current", "true");
  expect(await intents(page)).toBe(before);

  // ORCA in the same Broker: its row selects n-2 in the same Wire window. Wire is on top and covers the Broker, so the
  // Broker's controls are used from the keyboard (focus + Enter), as a keyboard player would.
  const press = async (l: Locator) => { await l.focus(); await page.keyboard.press("Enter"); };
  await press(page.getByTestId("br-view-trade"));
  await page.getByTestId("br-asset-select").selectOption("ORCA");
  await press(page.getByTestId("br-view-about"));
  await expect(about(page)).toBeVisible();
  await press(tab(page, "news"));
  await until(page, async () => (await page.getByTestId("ap-news").count()) > 0);
  await expect(stories(page)).toHaveAttribute("data-id", "n-2");
  await press(stories(page));
  await until(page, async () => (await detail.getAttribute("data-id")) === "n-2");
  await expect(page.getByTestId("win-wire")).toHaveCount(1);
  expect(await intents(page)).toBe(before);
});

test("BR-10-09 states: stale dims with Updating…; denied / error: Couldn't load, no switch; loading skeleton; news error → Retry; news loading; unknown asset", async ({ page }, info) => {
  desktopOnly(info.project.name);
  const booted = { v: false };
  const reboot = async (query: string, settled: Locator) => {
    if (booted.v) await page.clock.resume();
    booted.v = true;
    await bootPaused(page, query);
    await until(page, async () => (await settled.count()) > 0);
  };
  await reboot("/broker?asset=HALC&feed=stale", page.locator('[data-testid="broker"][data-state="live"]'));
  await toAbout(page);
  await expect.poll(async () => { await page.clock.runFor(5000); return brk(page).getAttribute("data-state"); }, { timeout: 15_000 }).toBe("stale");
  await expect(page.getByTestId("br-updating")).toHaveText("Updating…");
  await expect(page.getByTestId("ap-overview")).toBeVisible();

  for (const mode of ["denied", "error"] as const) {
    await reboot(`/broker?asset=HALC&feed=${mode}`, page.getByTestId("br-error"));
    await expect(page.getByTestId("br-error").getByRole("alert")).toHaveText("Couldn't load");
    await expect(page.getByTestId("br-view-about")).toHaveCount(0);
  }
  await reboot("/broker?asset=HALC&feed=loading", page.getByTestId("br-loading"));
  await expect(brk(page)).toHaveAttribute("aria-busy", "true");
  await expect(page.getByTestId("br-view-about")).toHaveCount(0);

  await reboot("/broker?asset=HALC&news=error", page.locator('[data-testid="broker"][data-state="live"]'));
  await toAbout(page);
  await toNews(page);
  const err = page.getByTestId("ap-news-error");
  await expect(err.getByRole("alert")).toHaveText("Couldn't load");
  await expect(brk(page)).toHaveAttribute("data-state", "live"); // ticker / me untouched
  await err.getByTestId("ap-news-retry").click();
  await until(page, async () => (await page.getByTestId("ap-news").count()) === 1);
  await expect(stories(page)).toHaveAttribute("data-id", "n-1");

  await reboot("/broker?asset=HALC&news=loading", page.locator('[data-testid="broker"][data-state="live"]'));
  await toAbout(page);
  await tab(page, "news").click();
  await page.clock.runFor(500);
  await expect(page.getByTestId("ap-news-loading")).toHaveAttribute("aria-busy", "true");
  await expect(page.getByTestId("ap-news-loading")).toHaveAccessibleName(/./);

  // The layout persists across boots, so the HALC Broker is still there and NOPE opens a second one: scope to it.
  const nope = page.getByTestId("win-broker").filter({ has: page.getByRole("heading", { level: 2, name: "NOPE" }) });
  await reboot("/broker?asset=NOPE", nope.locator('[data-testid="broker"][data-state="live"]'));
  await toAbout(page, nope);
  await expect(nope.getByTestId("ap-unknown")).toHaveText("Details for this asset aren't available.");
  await expect(nope.getByTestId("ap-row")).toHaveCount(0);
});

for (const scale of ["1", "2"] as const) {
  test(`BR-10-11 phone scale ${scale}: About pushed, titled HALC, back "Back to trade", targets ≥ 44, no overflow, no motion, axe${scale === "1" ? ", cb / hc baselines" : ""}`, async ({ page }, info) => {
    phoneOnly(info.project.name);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await bootPaused(page, "/settings");
    await setTextScale(page, scale);
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByTestId("icon-broker").click();
    await until(page, async () => (await page.getByTestId("br-asset-select").count()) === 1);
    await page.getByTestId("br-asset-select").selectOption("HALC");
    await until(page, async () => (await brk(page).getAttribute("data-state")) === "live");
    const appTitle = await page.getByTestId("app-title").innerText();
    await expect(page.getByTestId("br-asset-select").locator("option:checked")).toHaveText("HALC · Halcyon Shipping");
    await toAbout(page);
    await expect(page.getByTestId("app-title")).toHaveText("HALC");
    await expect(page.getByTestId("app-back")).toHaveAccessibleName("Back to trade");
    await expect(page.getByTestId("br-about-title")).toBeFocused();
    await expect(page.getByTestId("br-view-about")).toHaveCount(0); // the shell bar is the way back
    expect(await smallTargets(frame(page), 44)).toEqual([]);
    expect((await page.getByTestId("app-back").boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await overflow(frame(page))).toEqual([]);
    expect(await outside(brk(page))).toEqual([]);
    const motion = await about(page).evaluate((el) => [el, ...el.querySelectorAll("*")].flatMap((e) => {
      const s = getComputedStyle(e);
      return [s.animationName !== "none" ? `${e.className} anim ${s.animationName}` : "", parseFloat(s.transitionDuration) > 0.011 ? `${e.className} ${s.transitionProperty} ${s.transitionDuration}` : ""].filter(Boolean);
    }));
    expect(motion).toEqual([]);
    await noBrass(page);
    await shot(page, `phone-overview-${scale}`);
    expect(await axe(page)).toEqual([]);
    await toNews(page);
    expect((await stories(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await overflow(frame(page))).toEqual([]);
    await shot(page, `phone-news-${scale}`);
    expect(await axe(page)).toEqual([]);
    if (scale === "1") {
      for (const k of ["cb", "hc"] as const) {
        await pinHtml(page, k, true);
        await page.clock.runFor(100);
        await noBrass(page);
        await shot(page, `phone-${k}`);
        expect(await axe(page)).toEqual([]);
        await pinHtml(page, k, false);
      }
    }
    await page.getByTestId("app-back").click();
    await expect(page.getByTestId("app-title")).toHaveText(appTitle);
    await expect(brk(page)).toHaveAttribute("data-view", "trade");
    await expect(page.getByTestId("br-asset-select")).toBeFocused();
  });
}
