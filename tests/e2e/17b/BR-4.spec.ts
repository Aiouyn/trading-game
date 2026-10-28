// UI card 4 (17B BR-4) Broker market order ticket, end to end against the production build and its mock feed.
// The ticket's own logic (debounce, one intent, payloads, reason copy) is unit tested in tests/unit/17b/BR-4-ticket.test.tsx;
// this spec proves what needs a real browser: computed tokens, hit sizes, axe, the window frame, phone Sheet, text scale, motion.
// Shots: SHOTS=1 writes them under tests/e2e/17b/__screenshots__/BR-4 (CI); BR_SHOTS_DIR overrides the folder.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { boot, intents, setTextScale } from "../shell/helpers";

const desktopOnly = (n: string) => test.skip(n !== "desktop", "desktop project only");
const phoneOnly = (n: string) => test.skip(n !== "phone", "phone project only");
const SHOTS = process.env.BR_SHOTS_DIR ?? "tests/e2e/17b/__screenshots__/BR-4";
async function shot(page: Page, name: string, lang = "en") {
  if (!process.env.SHOTS && !process.env.BR_SHOTS_DIR) return;
  mkdirSync(SHOTS, { recursive: true });
  const vp = page.viewportSize()!;
  await page.screenshot({ path: `${SHOTS}/${name}-${lang}-${vp.width}x${vp.height}.png` });
}
const color = (page: Page, v: string) => page.evaluate((x) => { const e = document.createElement("i"); e.style.color = x; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; }, v);
/** The Broker opened on a fixed asset (the deep link's window, not the Trade layout's picker window). */
const br = (page: Page) => page.locator('[data-testid="broker"]:has([data-testid="br-ticker"])').first();
const brAny = (page: Page) => page.getByTestId("broker").first();

async function open(page: Page, query = "?asset=HALC") {
  await boot(page, `/broker${query}`);
  await expect(br(page)).toHaveAttribute("data-state", "live");
}
async function qty(page: Page, n: string) {
  await br(page).getByTestId("br-qty").fill(n);
  await expect(br(page).getByTestId("br-est")).toBeVisible();
}
async function review(page: Page) {
  await br(page).getByTestId("br-review").click();
  await expect(page.getByTestId("br-place").first()).toBeVisible();
}
const place = (page: Page) => page.getByTestId("br-place").first();
/** Primary buttons in the Broker's own scope (window on desktop, app view + its Sheet on phone), as countPrimaries reads them. */
const primaries = (page: Page) => br(page).evaluate((el) => {
  const scope = el.closest(".win, .phone-appview") ?? el;
  return [...scope.querySelectorAll(".btn-primary")].filter((b) => (b as HTMLElement).offsetParent !== null).length;
});
/** Every computed colour (text, background, border) used inside a locator, minus excluded test ids. */
const colours = (l: Locator, exclude: string[] = []) => l.evaluate((el, ex) => {
  const out = new Set<string>();
  for (const e of [el, ...el.querySelectorAll("*")]) {
    if (ex.some((id) => e.closest(`[data-testid="${id}"]`))) continue;
    const s = getComputedStyle(e);
    for (const c of [s.color, s.backgroundColor, s.borderTopColor, s.borderLeftColor]) out.add(c);
  }
  return [...out];
}, exclude);
async function hits(l: Locator, min: number) {
  const small: string[] = [];
  for (const c of await l.locator("button, input, select").all()) {
    if (!(await c.isVisible())) continue;
    const b = (await c.boundingBox())!;
    if (b.height < min || b.width < Math.min(min, 44)) small.push(`${await c.getAttribute("data-testid")} ${b.width}x${b.height}`);
  }
  return small;
}
async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).include('[data-testid="broker"]').analyze();
  return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ")}`);
}

test("BR-4-01 the deep link opens a real Broker body from its own lazy chunk (no coming-later)", async ({ page }) => {
  const chunks: string[] = [];
  page.on("response", (r) => { if (r.url().includes("/_next/static/chunks/")) chunks.push(r.url()); });
  await open(page);
  expect(chunks.length).toBeGreaterThan(0);
  await expect(page.getByTestId("broker").first().locator("..").getByTestId("coming-later")).toHaveCount(0);
  await shot(page, "empty");
});

test("BR-4-02 header: ticker, last, today; asset picker when opened without one", async ({ page }) => {
  await open(page);
  await expect(br(page).getByTestId("br-ticker")).toHaveText("HALC");
  await expect(br(page).getByTestId("br-last")).toHaveText(/^\d[\d,]*\.\d+$/);
  await expect(br(page).getByTestId("br-today")).toHaveText(/[+\u2212]?[\d,.]+ \([+\u2212]?[\d.]+%\)|—/);
  await boot(page, "/broker");
  // The persisted HALC window stays open; the new no-asset window is the one with the picker.
  const sel = page.getByTestId("br-asset-select").first();
  await expect(sel).toBeVisible();
  const opts = await sel.locator("option").allTextContents();
  expect(opts).toEqual([...opts].sort());
});

test("BR-4-04/06 preview rows appear after typing; Review does not submit; Enter in review does not place", async ({ page }) => {
  await open(page);
  const before = await intents(page);
  await qty(page, "40");
  for (const k of ["price", "fee", "impact", "total"]) await expect(br(page).getByTestId(`br-row-${k}`)).toBeVisible();
  await expect(br(page).getByTestId("br-est-title")).toHaveText(/^Estimate · at tick \d+$/);
  await shot(page, "preview");
  await review(page);
  await expect(page.getByTestId("br-action").first()).toHaveText("Buy 40 HALC");
  await expect(place(page)).toHaveAccessibleName("Place order: Buy 40 HALC");
  await page.keyboard.press("Enter");
  expect(await intents(page)).toBe(before);
  await shot(page, "review");
});

test("BR-4-07 one primary: 0 while editing, exactly 1 in review; no --acc outside Place, no --loss in the ticket", async ({ page }) => {
  await open(page);
  expect(await primaries(page)).toBe(0);
  await qty(page, "40");
  expect(await primaries(page)).toBe(0);
  const acc = await color(page, "var(--acc)"), loss = await color(page, "var(--loss)"), gain = await color(page, "var(--gain)");
  expect(await colours(br(page).getByTestId("br-ticket"))).not.toContain(acc);
  const seg = await colours(br(page).getByTestId("br-side"));
  for (const c of [acc, loss, gain]) expect(seg).not.toContain(c);
  await review(page);
  expect(await primaries(page)).toBe(1);
  const ticketCol = br(page).locator(".br-col-ticket");
  const cols = await colours(ticketCol, ["br-place"]);
  expect(cols).not.toContain(acc);
  expect(cols).not.toContain(loss);
});

test("BR-4-08/09 Place sends one intent, shows the pending tick, then the fill; New order focuses the quantity", async ({ page }) => {
  await open(page);
  const before = await intents(page);
  await qty(page, "40");
  await review(page);
  await place(page).dblclick();
  await expect.poll(() => intents(page)).toBe(before + 1);
  // 19 §2.3: the intent stays ACCEPTED; the fill arrives on me.fills and turns the ack into the Bought line.
  await expect(br(page).getByTestId("br-ack")).toHaveAttribute("data-status", "ACCEPTED");
  await expect(br(page).getByTestId("br-ack-title")).toHaveText(/^Bought 40 HALC at [\d,.]+$/, { timeout: 15_000 });
  await expect(br(page).getByTestId("br-ack-fee")).toHaveText(/^Fee [\d,.]+$/);
  expect(await intents(page)).toBe(before + 1);
  await shot(page, "placed");
  await br(page).getByTestId("br-new").click();
  await expect(br(page).getByTestId("br-qty")).toBeFocused();
  await expect(br(page).getByTestId("br-qty")).toHaveValue("");
});

test("BR-4-10 rejected for buying power (Edit restores the draft), unknown code, and oversell rejected with MKT_NO_LOCATE copy", async ({ page }) => {
  await open(page, "?asset=HALC&reject=MKT_INSUFFICIENT_BP");
  await qty(page, "40");
  await review(page);
  await place(page).click();
  const ack = br(page).getByTestId("br-ack");
  await expect(ack).toHaveAttribute("data-status", "REJECTED");
  await expect(br(page).getByTestId("br-ack-title")).toHaveText("Order rejected");
  await expect(br(page).getByTestId("br-ack-reason")).toHaveText("Not enough cash for this order.");
  await shot(page, "rejected-bp");
  await br(page).getByTestId("br-ack-edit").click();
  await expect(br(page)).toHaveAttribute("data-phase", "edit");
  await expect(br(page).getByTestId("br-qty")).toHaveValue("40");
  await open(page, "?asset=HALC&reject=ZZ_NEW");
  await qty(page, "40");
  await review(page);
  await place(page).click();
  await expect(br(page).getByTestId("br-ack-title")).toHaveText("Order rejected (ZZ_NEW)");
  await open(page);
  await br(page).getByTestId("br-side-sell").click();
  await qty(page, "999999");
  await expect(br(page).getByTestId("br-qty-msg")).toHaveText("You can't sell more than you hold.");
  await expect(br(page).getByTestId("br-review")).toHaveAttribute("aria-disabled", "true");
  await shot(page, "no-locate");
});

test("BR-4-11 halted: chip in --steel, entry enabled, review and ack say the order waits for the reopen", async ({ page }) => {
  await open(page, "?asset=HALC&halt=HALC");
  const chip = br(page).getByTestId("br-halted");
  await expect(chip).toBeVisible();
  expect(await chip.evaluate((e) => getComputedStyle(e).color)).toBe(await color(page, "var(--steel)"));
  await expect(br(page).getByTestId("br-qty")).toBeEditable();
  await qty(page, "5");
  await review(page);
  await expect(page.getByTestId("br-queued").first()).toHaveText("Waits for reopen");
  await shot(page, "halted-review");
  await place(page).click();
  await expect(br(page).getByTestId("br-ack")).toBeVisible({ timeout: 15_000 });
  await expect(br(page).getByTestId("br-queued")).toHaveText("Waits for reopen");
  await shot(page, "halted-queued");
});

test("BR-4-12 loading, couldn't load + Retry, and stale freezes Place with Updating…", async ({ page }) => {
  for (const mode of ["denied", "error"]) {
    await boot(page, `/broker?asset=HALC&feed=${mode}`);
    await expect(brAny(page).getByTestId("br-error")).toContainText("Couldn't load");
    await expect(brAny(page).getByTestId("br-retry")).toBeVisible();
  }
  await shot(page, "error");
  await page.clock.install({ time: new Date("2026-10-27T12:00:00Z") });
  await open(page, "?asset=HALC&feed=stale");
  await qty(page, "40");
  await review(page);
  await page.clock.runFor(23_000);
  await expect(br(page)).toHaveAttribute("data-state", "stale");
  await expect(br(page).getByTestId("br-updating")).toHaveText("Updating…");
  await expect(place(page)).toHaveAttribute("aria-disabled", "true");
  await shot(page, "stale");
});

test("BR-4-13 desktop window: maximised two columns; dragged to the 520 minimum it is one column and nothing overflows", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await open(page);
  const win = page.getByTestId("win-broker").filter({ has: page.getByTestId("br-ticker") }).first();
  const cols = async () => {
    const [h, t] = await Promise.all([".br-col-head", ".br-col-ticket"].map(async (s) => (await br(page).locator(s).boundingBox())!));
    return t.x >= h.x + h.width ? "two" : t.x === h.x ? "one" : "?";
  };
  await win.getByRole("button", { name: "Fill" }).click();
  await expect.poll(cols).toBe("two");
  await win.getByRole("button", { name: "Fill" }).click();
  const handle = (await win.getByTestId("resize-handle").boundingBox())!;
  await page.mouse.move(handle.x + 5, handle.y + 5);
  await page.mouse.down();
  await page.mouse.move(50, handle.y + 5, { steps: 5 });
  await page.mouse.up();
  // Registry minW is 520 (UI card 4's 520 window, decision a): a real drag stops at 520, under the 640 container
  // breakpoint, so the ticket is one column with nothing overflowing.
  expect((await win.boundingBox())!.width).toBe(520);
  await expect.poll(cols).toBe("one");
  expect(await br(page).evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  expect(await hits(br(page), 28)).toEqual([]);
  await qty(page, "40");
  await shot(page, "window-520");
  await review(page);
  await shot(page, "window-520-review");
});

test("BR-4-14 phone: review in a bottom Sheet with focus trapped, Esc returns to Edit, 44 px hits", async ({ page }, info) => {
  phoneOnly(info.project.name);
  await open(page);
  expect(await hits(br(page), 44)).toEqual([]);
  await qty(page, "40");
  await br(page).getByTestId("br-review").click();
  const sheet = page.getByTestId("br-sheet");
  await expect(sheet).toBeVisible();
  // Measure after the sheet-up entrance (--dur-base) settles.
  await expect.poll(async () => { const b = (await sheet.boundingBox())!; return Math.round(b.y + b.height); }).toBe(844);
  expect((await sheet.boundingBox())!.width).toBe(390);
  expect(await primaries(page)).toBe(1);
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
    expect(await sheet.evaluate((s) => s.contains(document.activeElement))).toBe(true);
  }
  expect(await hits(sheet, 44)).toEqual([]);
  await shot(page, "review-sheet");
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(br(page)).toHaveAttribute("data-phase", "edit");
  await expect(br(page).getByTestId("br-qty")).toHaveValue("40");
});

test("BR-4-14 phone text scale 2: segment stacks, no horizontal overflow, amounts stay on one line", async ({ page }, info) => {
  phoneOnly(info.project.name);
  await boot(page, "/settings");
  await setTextScale(page, "2");
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByTestId("icon-broker").click();
  await expect(brAny(page)).toHaveAttribute("data-state", "live");
  await brAny(page).getByTestId("br-qty").fill("40");
  await expect(brAny(page).getByTestId("br-est")).toBeVisible();
  const [buy, sell] = await Promise.all(["br-side-buy", "br-side-sell"].map(async (id) => (await brAny(page).getByTestId(id).boundingBox())!));
  expect(sell.y).toBeGreaterThan(buy.y);
  expect(sell.x).toBe(buy.x);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const bad = await brAny(page).evaluate((el) => [...el.querySelectorAll(".num, .money")].filter((n) => {
    const e = n as HTMLElement; return e.offsetParent !== null && (e.scrollWidth > e.clientWidth + 1 || e.getClientRects().length > 1);
  }).map((n) => n.textContent));
  expect(bad).toEqual([]);
  await shot(page, "scale-2");
});

test("BR-4-16 FR: labels, NNBSP before % and pb, French action", async ({ page }) => {
  await open(page, "?asset=HALC&locale=fr"); // e2e-only ?locale=fr (mockLocale, QUAY_HOOKS): no locale switch exists yet
  await expect(br(page).getByTestId("br-review")).toHaveText("Vérifier l’ordre");
  await expect(br(page).getByTestId("br-today")).toHaveText(/\u202F%|—/);
  await shot(page, "empty", "fr");
  await qty(page, "40");
  await expect(br(page).getByTestId("br-row-impact")).toHaveText(/\u202Fpb/);
  await shot(page, "preview", "fr");
  await review(page);
  await expect(page.getByTestId("br-action").first()).toHaveText("Acheter 40 HALC");
  await shot(page, "review", "fr");
  await place(page).click();
  await expect(br(page).getByTestId("br-ack-title")).toHaveText(/^Achat de 40 HALC à [\d\u202F,]+$/, { timeout: 15_000 });
  await shot(page, "placed", "fr");
  await br(page).getByTestId("br-new").click();
  await qty(page, "999999");
  await shot(page, "preview-large", "fr");
});

test("BR-4 axe: no serious or critical issues in edit, review and ack", async ({ page }) => {
  await open(page);
  expect(await axe(page)).toEqual([]);
  await qty(page, "40");
  await review(page);
  expect(await axe(page)).toEqual([]);
  await place(page).click();
  await expect(br(page).getByTestId("br-ack")).toBeVisible({ timeout: 15_000 });
  expect(await axe(page)).toEqual([]);
});

test("BR-4 colour-blind and high-contrast modes keep the ticket's tokens; reduced motion drops the Sheet animation", async ({ page }, info) => {
  await open(page);
  await qty(page, "40");
  for (const [k, v] of [["cb", "1"], ["hc", "1"]] as const) {
    await page.evaluate(([a, b]) => { document.documentElement.dataset[a] = b; }, [k, v]);
    await shot(page, `preview-${k}`);
    await page.evaluate((a) => { delete document.documentElement.dataset[a]; }, k);
  }
  if (info.project.name === "phone") {
    await page.evaluate(() => { document.documentElement.dataset.motion = "reduce"; });
    await br(page).getByTestId("br-review").click();
    expect(await page.getByTestId("br-sheet").evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
  }
});
