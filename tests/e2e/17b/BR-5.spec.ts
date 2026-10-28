// UI card 5 (17B BR-5) Broker limit and stop orders + read-only Open orders, end to end against the production build and its mock feed.
// Drafts, sort, partial rows and the read-only rows are unit tested in tests/unit/17b/BR-5-ticket.test.tsx (the mock never makes
// PARTIAL or PENDING); this spec proves the browser side: review titles and primaries, the resting ack on the fake clock,
// computed colours, list states, layout at 1440 / 520 / 390, text scale, cb / hc, FR.
// Shots: SHOTS=1 writes them under tests/e2e/17b/__screenshots__/BR-5 (CI); BR_SHOTS_DIR overrides the folder.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { boot, bootPaused, intents, setTextScale } from "../shell/helpers";

const desktopOnly = (n: string) => test.skip(n !== "desktop", "desktop project only");
const phoneOnly = (n: string) => test.skip(n !== "phone", "phone project only");
const SHOTS = process.env.BR_SHOTS_DIR ?? "tests/e2e/17b/__screenshots__/BR-5";
async function shot(page: Page, name: string, lang = "en") {
  if (!process.env.SHOTS && !process.env.BR_SHOTS_DIR) return;
  mkdirSync(SHOTS, { recursive: true });
  const vp = page.viewportSize()!;
  await page.screenshot({ path: `${SHOTS}/BR-5-${name}-${lang}-${vp.width}x${vp.height}.png` });
}
const color = (page: Page, v: string) => page.evaluate((x) => { const e = document.createElement("i"); e.style.color = x; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; }, v);
/** The Broker on an asset: opened by the deep link (ticker header) or from Home and picked (asset select header). */
const br = (page: Page) => page.locator('[data-testid="broker"]:has([data-testid="br-ticker"]), [data-testid="broker"]:has([data-testid="br-asset-select"] option:checked[value="HALC"])').first();
const brAny = (page: Page) => page.getByTestId("broker").first();
const place = (page: Page) => page.getByTestId("br-place").first();
const list = (page: Page) => br(page).getByTestId("br-oo");
const rows = (page: Page) => list(page).locator('[data-testid^="br-oo-row-"]');
const primaries = (page: Page) => br(page).evaluate((el) => {
  const scope = el.closest(".win, .phone-appview") ?? el;
  return [...scope.querySelectorAll(".btn-primary")].filter((b) => (b as HTMLElement).offsetParent !== null).length;
});
const colours = (l: Locator) => l.evaluate((el) => {
  const out = new Set<string>();
  for (const e of [el, ...el.querySelectorAll("*")]) {
    const s = getComputedStyle(e);
    for (const c of [s.color, s.backgroundColor, s.borderTopColor, s.borderLeftColor]) out.add(c);
  }
  return [...out];
});
async function hits(l: Locator, min: number) {
  const small: string[] = [];
  for (const c of await l.locator("button, input, select").all()) {
    if (!(await c.isVisible())) continue;
    const b = (await c.boundingBox())!;
    if (b.height < min || b.width < Math.min(min, 44)) small.push(`${await c.getAttribute("data-testid")} ${b.width}x${b.height}`);
  }
  return small;
}
const overflow = (l: Locator) => l.evaluate((root) => [root, ...root.querySelectorAll('[data-testid^="br-"]')]
  .filter((e) => (e as HTMLElement).offsetParent !== null && e.scrollWidth > e.clientWidth + 1)
  .map((e) => `${e.getAttribute("data-testid")} ${e.scrollWidth}>${e.clientWidth}`));
const placeIntents = (page: Page) => page.evaluate(() => ((window as Window & { __quayIntents?: () => { kind: string; payload: Record<string, string> }[] }).__quayIntents?.() ?? []).filter((i) => i.kind === "mkt.order.place"));
async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).include('[data-testid="broker"]').analyze();
  return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ")}`);
}

/** Pause the running fake clock now (re-read and retry: the clock moves between reading and pausing). */
async function pauseNow(page: Page) {
  for (let attempt = 0; ; attempt++) {
    const now = await page.evaluate(() => Date.now());
    try { await page.clock.pauseAt(new Date(now + 100)); return; }
    catch (e) { if (attempt >= 5 || !String(e).includes("past")) throw e; }
  }
}

type Type = "market" | "limit" | "stop" | "stop_limit";
type Prices = { stop?: string; limit?: string };
/** Fake-clock Broker: one feed tick = 5,000 ms, only when a test runs the clock. */
async function openPaused(page: Page, query = "?asset=HALC") {
  await bootPaused(page, `/broker${query}`);
  await page.clock.runFor(200);
  await expect(br(page)).toHaveAttribute("data-state", "live");
}
/** Pick a type, fill its prices and the quantity, and wait out the 300 ms preview debounce. */
async function ticket(page: Page, type: Type, prices: Prices, qty = "40") {
  await br(page).getByTestId(`br-type-${type}`).click();
  for (const [f, v] of Object.entries(prices)) await br(page).getByTestId(`br-price-${f}`).fill(v);
  await br(page).getByTestId("br-qty").fill(qty);
  await page.clock.runFor(400);
  await expect(br(page).getByTestId("br-est")).toBeVisible();
}
async function review(page: Page) {
  await br(page).getByTestId("br-review").click();
  await expect(place(page)).toBeVisible();
}
/** Place, then run the clock to the result tick (the ack). */
async function placeAndAck(page: Page) {
  await place(page).click();
  for (let ms = 0; ms < 6_000 && (await br(page).getByTestId("br-ack").count()) === 0; ms += 500) await page.clock.runFor(500);
  await expect(br(page).getByTestId("br-ack")).toBeVisible();
}
async function order(page: Page, type: Type, prices: Prices, qty = "40") {
  await ticket(page, type, prices, qty);
  await review(page);
  await placeAndAck(page);
  await br(page).getByTestId("br-new").click();
}

test("BR-5-04 review title per type; one primary only in review; Market keeps card 4's title", async ({ page }) => {
  await openPaused(page);
  await expect(br(page).getByTestId("br-type")).toBeVisible();
  const cases: [Type, Prices, string][] = [
    ["market", {}, "Buy 40 HALC"],
    ["limit", { limit: "42.10" }, "Buy 40 HALC · Limit 42.10"],
    ["stop", { stop: "40.00" }, "Buy 40 HALC · Stop 40.00"],
    ["stop_limit", { stop: "40.00", limit: "39.80" }, "Buy 40 HALC · Stop 40.00 · Limit 39.80"],
  ];
  for (const [type, prices, title] of cases) {
    await ticket(page, type, prices);
    expect(await primaries(page), `${type} edit`).toBe(0);
    if (type === "limit") await shot(page, "limit-edit");
    await review(page);
    await expect(page.getByTestId("br-action").first()).toHaveText(title);
    await expect(place(page)).toHaveAccessibleName(`Place order: ${title}`);
    expect(await primaries(page), `${type} review`).toBe(1);
    if (type === "stop_limit") await shot(page, "stop-limit-review");
    await page.getByTestId("br-edit").first().click();
    await expect(br(page)).toHaveAttribute("data-phase", "edit");
    expect(await primaries(page)).toBe(0);
  }
});

test("BR-5-04 a stale preview disables Place on a limit review", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-27T12:00:00Z") });
  await boot(page, "/broker?asset=HALC&feed=stale");
  await expect(br(page)).toHaveAttribute("data-state", "live");
  await br(page).getByTestId("br-type-limit").click();
  await br(page).getByTestId("br-price-limit").fill("42.10");
  await br(page).getByTestId("br-qty").fill("40");
  await expect(br(page).getByTestId("br-est")).toBeVisible();
  await review(page);
  await expect(place(page)).not.toHaveAttribute("aria-disabled", "true");
  await page.clock.runFor(23_000);
  await expect(br(page)).toHaveAttribute("data-state", "stale");
  await expect(place(page)).toHaveAttribute("aria-disabled", "true");
  const before = await intents(page);
  await place(page).evaluate((el: HTMLElement) => el.click());
  expect(await intents(page)).toBe(before);
});

test("BR-5-05 fake clock: Place on a limit sends one intent with limit; the result tick shows the resting ack and a Working row together", async ({ page }) => {
  await openPaused(page);
  await expect(list(page).getByTestId("br-oo-empty")).toHaveText("No open orders.");
  await ticket(page, "limit", { limit: "42,10" });
  await review(page);
  const before = await placeIntents(page);
  await place(page).evaluate((el: HTMLElement) => { el.click(); el.click(); }); // phone: Place may sit below the fold
  const sent = (await placeIntents(page)).slice(before.length);
  expect(sent).toEqual([{ kind: "mkt.order.place", payload: { assetId: "HALC", side: "BUY", type: "limit", qty: "40", limit: "42.10", tif: "day", intentId: sent[0]?.payload.intentId } }]);
  expect(await rows(page).count()).toBe(0);
  // Read ack and list in one evaluate on each step, so "together" means the same committed DOM.
  const snap = () => br(page).evaluate((el) => {
    const r = el.querySelector<HTMLElement>('[data-testid^="br-oo-row-"]');
    return {
      ack: el.querySelector('[data-testid="br-ack-title"]')?.textContent ?? null,
      row: r && { id: r.dataset.testid, terms: r.querySelector('[data-testid="br-oo-terms"]')!.textContent, status: r.querySelector('[data-testid="br-oo-status"]')!.textContent, fresh: r.dataset.fresh ?? null, bg: getComputedStyle(r).backgroundColor },
    };
  });
  let s = await snap();
  for (let ms = 0; ms < 6_000 && s.ack === null; ms += 500) {
    expect(s.row).toBeNull();
    await page.clock.runFor(500);
    s = await snap();
  }
  expect(s.ack).toBe("Order placed. It's in Open orders.");
  expect(s.row).toEqual({ id: expect.stringMatching(/^br-oo-row-o-\d+$/), terms: "Limit 42.10", status: "Working", fresh: "1", bg: await color(page, "var(--win2)") });
  await expect(list(page).getByTestId("br-oo-count")).toHaveText("1");
  await shot(page, "resting-ack");
  expect(await placeIntents(page)).toHaveLength(before.length + 1);
  // Reduced motion: no highlight.
  await page.evaluate(() => { document.documentElement.dataset.motion = "reduce"; });
  expect((await snap()).row!.bg).toBe("rgba(0, 0, 0, 0)");
  await page.evaluate(() => { delete document.documentElement.dataset.motion; });
  // The highlight lasts the one tick its ack lands.
  await page.clock.runFor(5_000);
  await expect(rows(page).first()).not.toHaveAttribute("data-fresh", "1");
});

test("BR-5-08 halted: market Buy rests as Waits for reopen; chips --steel outline, --fg text; no --loss / --acc in the list", async ({ page }, info) => {
  await openPaused(page, "?asset=HALC&halt=HALC");
  await order(page, "limit", { limit: "42.10" });
  await order(page, "stop_limit", { stop: "40.00", limit: "39.80" }, "7");
  await order(page, "market", {}, "5");
  await expect(rows(page)).toHaveCount(3);
  const queued = rows(page).filter({ hasText: "Waits for reopen" });
  await expect(queued).toHaveCount(1);
  await expect(queued.getByTestId("br-oo-terms")).toHaveText("Market");
  await expect(rows(page).getByTestId("br-oo-status")).toHaveText(["Waits for reopen", "Working", "Working"]);
  const steel = await color(page, "var(--steel)"), fg = await color(page, "var(--fg)");
  for (const chip of await rows(page).getByTestId("br-oo-status").all()) {
    expect(await chip.evaluate((e) => { const s = getComputedStyle(e); return [s.borderTopColor, s.color]; })).toEqual([steel, fg]);
  }
  expect(await overflow(list(page))).toEqual([]);
  const cols = await colours(list(page));
  for (const v of ["--loss", "--acc", "--gain"]) expect(cols, v).not.toContain(await color(page, `var(${v})`));
  if (info.project.name === "desktop") await shot(page, "open-orders-3");
});

test("BR-5-09 a rejected limit shows card 4's reject panel; Edit restores type, prices and qty", async ({ page }) => {
  await openPaused(page, "?asset=HALC&reject=MKT_INSUFFICIENT_BP");
  await ticket(page, "stop_limit", { stop: "40.00", limit: "39.80" });
  await review(page);
  await placeAndAck(page);
  await expect(br(page).getByTestId("br-ack")).toHaveAttribute("data-status", "REJECTED");
  await expect(br(page).getByTestId("br-ack-title")).toHaveText("Order rejected");
  await expect(br(page).getByTestId("br-ack-reason")).toHaveText("Not enough cash for this order.");
  await expect(rows(page)).toHaveCount(0);
  await br(page).getByTestId("br-ack-edit").click();
  await expect(br(page)).toHaveAttribute("data-phase", "edit");
  await expect(br(page).getByTestId("br-type-stop_limit")).toHaveAttribute("aria-pressed", "true");
  await expect(br(page).getByTestId("br-price-stop")).toHaveValue("40.00");
  await expect(br(page).getByTestId("br-price-limit")).toHaveValue("39.80");
  await expect(br(page).getByTestId("br-qty")).toHaveValue("40");
});

test("BR-5-10 list states: loading, couldn't load + Retry (denied, error), stale Updating…", async ({ page }, info) => {
  await boot(page, "/broker?asset=HALC&feed=loading");
  await expect(brAny(page).getByTestId("br-oo-loading").locator("> *")).toHaveCount(2);
  await expect(brAny(page).getByTestId("br-oo")).toHaveAttribute("aria-busy", "true");
  for (const mode of ["denied", "error"]) {
    await boot(page, `/broker?asset=HALC&feed=${mode}`);
    await expect(brAny(page).getByTestId("br-oo-error")).toContainText("Couldn't load");
    await expect(brAny(page).getByTestId("br-oo-retry")).toBeVisible();
  }
  if (info.project.name === "desktop") await shot(page, "list-error");
  await page.clock.install({ time: new Date("2026-10-27T12:00:00Z") });
  await boot(page, "/broker?asset=HALC&feed=stale");
  await expect(br(page)).toHaveAttribute("data-state", "live");
  await page.clock.runFor(23_000);
  await expect(list(page)).toHaveAttribute("data-state", "stale");
  await expect(list(page).getByTestId("br-oo-updating")).toHaveText("Updating…");
  await expect(list(page).getByTestId("br-oo-empty")).toBeVisible(); // the last body stays
});

test("BR-5-11 desktop: 1440 two columns (list under the header); 520 window one column, 2-line rows, 28 px hits, axe clean", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await openPaused(page);
  await order(page, "limit", { limit: "42.10" });
  await page.clock.resume(); // axe runs on timers
  const win = page.getByTestId("win-broker").filter({ has: page.getByTestId("br-ticker") }).first();
  const box = (s: string) => br(page).locator(s).boundingBox().then((b) => b!);
  await win.getByRole("button", { name: "Fill" }).click();
  await expect.poll(async () => { const [h, t, o] = await Promise.all([".br-col-head", ".br-col-ticket", ".br-col-orders"].map(box)); return t.x >= h.x + h.width && o.x === h.x && o.y >= h.y + h.height; }).toBe(true);
  const oneLine = async () => { const [a, b] = await Promise.all(["br-oo-side", "br-oo-terms"].map((id) => rows(page).first().getByTestId(id).boundingBox().then((x) => x!))); return Math.abs(a.y - b.y) < 2; };
  expect(await oneLine()).toBe(true);
  expect(await axe(page)).toEqual([]);
  await win.getByRole("button", { name: "Fill" }).click();
  const handle = (await win.getByTestId("resize-handle").boundingBox())!;
  await page.mouse.move(handle.x + 5, handle.y + 5);
  await page.mouse.down();
  await page.mouse.move(50, handle.y + 5, { steps: 5 });
  await page.mouse.up();
  expect((await win.boundingBox())!.width).toBe(520);
  await expect.poll(async () => { const [h, t, o] = await Promise.all([".br-col-head", ".br-col-ticket", ".br-col-orders"].map(box)); return h.x === t.x && t.x === o.x && o.y > t.y; }).toBe(true);
  expect(await oneLine()).toBe(false);
  expect(await overflow(br(page))).toEqual([]);
  await ticket(page, "limit", { limit: "42.10" });
  expect(await hits(br(page), 28)).toEqual([]);
  expect(await axe(page)).toEqual([]);
  await shot(page, "window-520-limit");
  await review(page);
  expect(await axe(page)).toEqual([]);
  // Broadsheet review (desktop shot).
  await page.evaluate(() => { document.documentElement.dataset.palette = "broadsheet"; });
  await shot(page, "broadsheet-review");
});

for (const scale of ["1", "2"] as const) {
  test(`BR-5-12 phone scale ${scale}: no horizontal overflow, 44 px controls${scale === "2" ? ", segment stacked" : ""}; review Sheet; list`, async ({ page }, info) => {
    phoneOnly(info.project.name);
    // Text scale is a session pref (not persisted across a reload): set it, then open the Broker from the Home screen.
    await page.clock.install({ time: new Date("2026-10-21T08:00:00Z") });
    await boot(page, "/settings");
    await setTextScale(page, scale);
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByTestId("icon-broker").click();
    await brAny(page).getByTestId("br-asset-select").selectOption("HALC");
    await expect(br(page)).toHaveAttribute("data-state", "live");
    await pauseNow(page);
    await ticket(page, "stop_limit", { stop: "40.00", limit: "39.80" });
    const opts = br(page).getByTestId("br-type").locator("button");
    const [first, last] = await Promise.all([opts.first().boundingBox(), opts.last().boundingBox()]);
    if (scale === "2") { expect(last!.y).toBeGreaterThan(first!.y); expect(last!.x).toBe(first!.x); }
    else expect(last!.y).toBe(first!.y);
    expect(await hits(br(page), 44)).toEqual([]);
    expect(await overflow(br(page))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    if (scale === "1") await shot(page, "limit-edit");
    await br(page).getByTestId("br-review").click();
    const sheet = page.getByTestId("br-sheet");
    await expect(sheet).toBeVisible();
    await page.clock.runFor(400); // the sheet-up entrance (--dur-base) on the paused clock
    await expect.poll(async () => { const b = (await sheet.boundingBox())!; return Math.round(b.y + b.height); }).toBe(844);
    expect(await overflow(sheet)).toEqual([]);
    expect(await hits(sheet, 44)).toEqual([]);
    if (scale === "1") await shot(page, "review-sheet");
    await placeAndAck(page);
    await br(page).getByTestId("br-new").click();
    await expect(rows(page)).toHaveCount(1);
    const row = rows(page).first();
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await overflow(list(page))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await row.scrollIntoViewIfNeeded();
    await shot(page, `open-orders-scale-${scale}`);
    if (scale === "1") {
      const html = (k: "cb" | "hc", on: boolean) => page.evaluate(([a, b]) => { if (b) document.documentElement.dataset[a] = "1"; else delete document.documentElement.dataset[a]; }, [k, on] as const);
      const chipOf = () => row.getByTestId("br-oo-status").evaluate((e) => [getComputedStyle(e).borderTopColor, getComputedStyle(e).color]);
      const plainChip = await chipOf();
      await html("cb", true);
      expect(await chipOf()).toEqual(plainChip); // chips carry no colour meaning
      await shot(page, "open-orders-cb");
      await html("cb", false);
      await html("hc", true);
      expect(await row.evaluate((e) => getComputedStyle(e).borderBottomColor)).toBe(await color(page, "var(--fg-muted)"));
      expect(await br(page).getByTestId("br-price-limit").evaluate((e) => getComputedStyle(e).borderTopColor)).toBe(await color(page, "var(--fg-disabled)"));
      await shot(page, "open-orders-hc");
    }
  });
}

test("BR-5-12 phone empty list: No open orders. in --fg-muted", async ({ page }, info) => {
  phoneOnly(info.project.name);
  await boot(page, "/broker?asset=HALC&empty=1");
  await expect(br(page)).toHaveAttribute("data-state", "live");
  const empty = list(page).getByTestId("br-oo-empty");
  await expect(empty).toHaveText("No open orders.");
  expect(await empty.evaluate((e) => getComputedStyle(e).color)).toBe(await color(page, "var(--fg-muted)"));
  await empty.scrollIntoViewIfNeeded();
  await shot(page, "empty-list");
});

test("BR-5-12 FR: accepts 42,10 and sends 42.10; Limite terms; NNBSP before : and %", async ({ page }, info) => {
  await openPaused(page, "?asset=HALC&locale=fr");
  await expect(br(page).getByTestId("br-type-limit")).toHaveText("Limite");
  await expect(br(page).getByTestId("br-today")).toHaveText(/\u202F%|—/);
  await ticket(page, "limit", { limit: "42,10" });
  await expect(br(page).getByTestId("br-kind")).toHaveText("Limite · Jour");
  await shot(page, "limit-edit", "fr");
  await review(page);
  await expect(page.getByTestId("br-action").first()).toHaveText("Acheter 40 HALC · Limite 42,10");
  await expect(place(page)).toHaveAccessibleName("Passer l’ordre\u202F: Acheter 40 HALC · Limite 42,10");
  await shot(page, "review", "fr");
  const before = await placeIntents(page);
  await placeAndAck(page);
  expect((await placeIntents(page)).slice(before.length).map((i) => i.payload.limit)).toEqual(["42.10"]);
  await expect(br(page).getByTestId("br-ack-title")).toHaveText("Ordre passé. Il figure dans les ordres en cours.");
  await expect(rows(page).first().getByTestId("br-oo-terms")).toHaveText("Limite 42,10");
  await expect(rows(page).first().getByTestId("br-oo-status")).toHaveText("Actif");
  if (info.project.name === "desktop") await shot(page, "resting-ack", "fr");
});
