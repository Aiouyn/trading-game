// UI card 4 (17B BR-4) Broker market order ticket, end to end against the production build and its mock feed.
// The ticket's own logic (debounce, one intent, payloads, reason copy) is unit tested in tests/unit/17b/BR-4-ticket.test.tsx;
// this spec proves what needs a real browser: computed tokens, hit sizes, axe, the window frame, phone Sheet, text scale, motion.
// Shots: SHOTS=1 writes them under tests/e2e/17b/__screenshots__/BR-4 (CI); BR_SHOTS_DIR overrides the folder.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { boot, intents, setTextScale } from "../shell/helpers";
import { openBrokerPaused } from "./openPaused";

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
/** The last money amount in a row's text, in cents ("Total 16,878.75" -> 1687875). */
async function cents(l: Locator): Promise<number> {
  const m = (await l.innerText()).replace(/\u2212/g, "-").match(/-?[\d,]+\.\d{2}/g);
  expect(m, `no amount in ${await l.innerText()}`).not.toBeNull();
  return Math.round(Number(m!.at(-1)!.replace(/,/g, "")) * 100);
}
const cash = (page: Page) => cents(br(page).locator(".br-cash"));
/** Quant E-96 (2): taker 3 bp, minimum 0.10, half-even to the cent. */
const takerFee = (notional: number) => { const n = notional * 3, q = Math.floor(n / 10_000), r = n - q * 10_000; return Math.max(10, r > 5_000 || (r === 5_000 && q % 2 === 1) ? q + 1 : q); };
const money = (c: number) => (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Fake-clock Broker: boots, then the clock only moves when a test runs it (one feed tick = 5,000 ms). */
async function openPaused(page: Page, query = "?asset=HALC") {
  await openBrokerPaused(page, `/broker${query}`, br(page));
}
async function qtyPaused(page: Page, n: string) {
  await br(page).getByTestId("br-qty").fill(n);
  await page.clock.runFor(400); // the 300 ms preview debounce
  await expect(br(page).getByTestId("br-est")).toBeVisible();
}
const placeIntents = (page: Page) => page.evaluate(() => ((window as Window & { __quayIntents?: () => { kind: string; payload: Record<string, string> }[] }).__quayIntents?.() ?? []).filter((i) => i.kind === "mkt.order.place"));
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

test("BR-4-08/09 fake clock: Enter places one intent with the exact payload, pending tick, cash unchanged until the result tick, exact fill", async ({ page }) => {
  await openPaused(page);
  await qtyPaused(page, "40");
  // Pinned preview arithmetic (QA #84 M7): total = notional + fee + impact; buying power after = cash − total.
  const px = await cents(br(page).getByTestId("br-row-price"));
  const fee = await cents(br(page).getByTestId("br-row-fee")), impact = await cents(br(page).getByTestId("br-row-impact"));
  expect(fee).toBe(takerFee(px * 40));
  expect(await cents(br(page).getByTestId("br-row-total"))).toBe(px * 40 + fee + impact);
  const cash0 = await cash(page);
  expect(await cents(br(page).getByTestId("br-row-bpAfter"))).toBe(cash0 - (px * 40 + fee + impact));
  const tickAtSubmit = (await br(page).getByTestId("br-est-title").innerText()).match(/\d+$/)![0];
  const before = await placeIntents(page);
  await expect(br(page).getByTestId("br-qty")).toBeFocused();
  await page.keyboard.press("Enter"); // Enter in the ticket = Review
  await expect(br(page)).toHaveAttribute("data-phase", "review");
  await page.keyboard.press("Enter"); // Enter in review = Place
  await page.keyboard.press("Enter");
  await place(page).evaluate((el: HTMLElement) => { el.click(); el.click(); }); // a late double click while submitting (phone: Place may sit below the fold)
  const sent = (await placeIntents(page)).slice(before.length);
  expect(sent).toEqual([{ kind: "mkt.order.place", payload: { assetId: "HALC", side: "BUY", type: "market", qty: "40", tif: "day", intentId: sent[0]?.payload.intentId } }]);
  expect(sent[0]!.payload.intentId).toMatch(/^i-\d+$/);
  await expect(br(page)).toHaveAttribute("data-phase", "submitting");
  await expect(page.getByTestId("br-pending").first()).toHaveText(`Pending · tick ${tickAtSubmit}`);
  // The cash line holds until the tick that carries the IntentResult (one 5 s feed tick).
  for (let ms = 0; ms < 6_000 && (await br(page).getByTestId("br-ack").count()) === 0; ms += 500) {
    expect(await cash(page)).toBe(cash0);
    await page.clock.runFor(500);
  }
  await expect(br(page).getByTestId("br-ack")).toHaveAttribute("data-status", "ACCEPTED");
  // The fill is at the result tick's Last; fee and cash follow from it exactly.
  const fillPx = await cents(br(page).getByTestId("br-last"));
  const fillFee = takerFee(fillPx * 40);
  await expect(br(page).getByTestId("br-ack-title")).toHaveText(`Bought 40 HALC at ${money(fillPx)}`);
  await expect(br(page).getByTestId("br-ack-fee")).toHaveText(`Fee ${money(fillFee)}`);
  expect(await cash(page)).toBe(cash0 - fillPx * 40 - fillFee);
  expect(await placeIntents(page)).toHaveLength(before.length + 1);
});

test("BR-4-08 a sell's estimate adds its net proceeds to buying power", async ({ page }) => {
  await openPaused(page);
  await br(page).getByTestId("br-side-sell").click();
  await qtyPaused(page, "40");
  const px = await cents(br(page).getByTestId("br-row-price"));
  const fee = await cents(br(page).getByTestId("br-row-fee")), impact = await cents(br(page).getByTestId("br-row-impact"));
  expect(fee).toBe(takerFee(px * 40));
  const total = await cents(br(page).getByTestId("br-row-total"));
  expect(total).toBe(px * 40 - fee - impact);
  expect(await cents(br(page).getByTestId("br-row-bpAfter"))).toBe((await cash(page)) + total);
});

test("BR-4-08 the reply is held (?replyMs): double click and double Enter on Place still send one order", async ({ page }) => {
  await openPaused(page, "?asset=HALC&replyMs=3000");
  await qtyPaused(page, "40");
  await review(page);
  const before = await intents(page);
  await place(page).dblclick();
  expect(await intents(page), "the double click alone").toBe(before + 1);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  expect(await intents(page), "two Enters on top of it").toBe(before + 1);
  await expect(br(page)).toHaveAttribute("data-phase", "submitting");
  await page.clock.runFor(3_000); // the submit reply
  expect(await intents(page)).toBe(before + 1);
  await page.clock.runFor(5_000); // the result tick
  await expect(br(page).getByTestId("br-ack")).toHaveAttribute("data-status", "ACCEPTED");
  expect(await intents(page)).toBe(before + 1);
  // The double Enter on its own (QA #84): a fresh order, Place focused, two Enters while the reply is held.
  await br(page).getByTestId("br-new").click();
  await qtyPaused(page, "40");
  await review(page);
  await place(page).focus();
  await page.keyboard.press("Enter");
  expect(await intents(page), "the first Enter places").toBe(before + 2);
  await page.keyboard.press("Enter");
  expect(await intents(page), "the second Enter is held").toBe(before + 2);
  await page.clock.runFor(3_000);
  expect(await intents(page)).toBe(before + 2);
});

test("BR-4-08 two clicks and two Enters in one task, before React renders, still send one order", async ({ page }) => {
  await openPaused(page);
  await qtyPaused(page, "40");
  await review(page);
  const before = await intents(page);
  await page.evaluate(() => {
    const b = document.querySelector<HTMLElement>('[data-testid="br-place"]')!, block = document.querySelector('[data-testid="br-review-block"]')!;
    b.click(); b.click();
    const enter = () => block.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    enter(); enter();
  });
  expect(await intents(page)).toBe(before + 1);
  await page.clock.runFor(5_000);
  await expect(br(page).getByTestId("br-ack")).toBeVisible();
  expect(await intents(page)).toBe(before + 1);
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
  expect(await primaries(page)).toBe(0);
  await qty(page, "5");
  expect(await primaries(page)).toBe(0); // BR-4-07 halted
  const acc = await color(page, "var(--acc)"), loss = await color(page, "var(--loss)");
  expect(await colours(br(page).getByTestId("br-ticket"))).not.toContain(loss);
  await review(page);
  expect(await primaries(page)).toBe(1);
  const cols = await colours(br(page).locator(".br-col-ticket"), ["br-place"]);
  expect(cols).not.toContain(acc);
  expect(cols).not.toContain(loss);
  await expect(page.getByTestId("br-queued").first()).toHaveText("Waits for reopen");
  await shot(page, "halted-review");
  const before = await intents(page);
  await place(page).click();
  await expect(br(page).getByTestId("br-ack")).toBeVisible({ timeout: 15_000 });
  expect(await intents(page)).toBe(before + 1);
  await expect(br(page).getByTestId("br-queued")).toHaveText("Waits for reopen");
  await shot(page, "halted-queued");
});

test("BR-4-12 loading, couldn't load + Retry, and stale freezes Place with Updating…", async ({ page }) => {
  await boot(page, "/broker?asset=HALC&feed=loading");
  await expect(brAny(page).getByTestId("br-loading")).toBeVisible();
  await expect(brAny(page)).toHaveAttribute("aria-busy", "true");
  await expect(brAny(page).getByTestId("br-ticket")).toHaveCount(0);
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
  // Back in the ticket while still stale: no primary (BR-4-07) and Review stays disabled.
  await page.getByTestId("br-edit").first().click();
  await expect(br(page)).toHaveAttribute("data-phase", "edit");
  await expect(br(page)).toHaveAttribute("data-state", "stale");
  expect(await primaries(page)).toBe(0);
  await expect(br(page).getByTestId("br-review")).toHaveAttribute("aria-disabled", "true");
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
  // Scale 1.0: nothing in the ticket or its rows scrolls sideways, and the page does not either.
  const overflow = (l: Locator) => l.evaluate((root) => [root, ...root.querySelectorAll('[data-testid^="br-"]')]
    .filter((e) => (e as HTMLElement).offsetParent !== null && e.scrollWidth > e.clientWidth)
    .map((e) => `${e.getAttribute("data-testid")} ${e.scrollWidth}>${e.clientWidth}`));
  expect(await overflow(br(page))).toEqual([]);
  for (const id of ["br-ticket", "br-head", "br-side", "br-qty", "br-row-price", "br-row-fee", "br-row-impact", "br-row-total", "br-row-bpAfter"]) {
    expect(await br(page).getByTestId(id).evaluate((e) => e.scrollWidth <= e.clientWidth), id).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await br(page).getByTestId("br-review").click();
  const sheet = page.getByTestId("br-sheet");
  await expect(sheet).toBeVisible();
  // Measure after the sheet-up entrance (--dur-base) settles.
  await expect.poll(async () => { const b = (await sheet.boundingBox())!; return Math.round(b.y + b.height); }).toBe(844);
  expect(await overflow(sheet)).toEqual([]);
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

test("BR-4 Qty blur (QA #89 note): 'Enter a quantity.' fills its reserved line; the ticket and Review do not move", async ({ page }) => {
  await open(page);
  const ticket = br(page).getByTestId("br-ticket");
  const input = br(page).getByTestId("br-qty");
  const msg = br(page).getByTestId("br-qty-msg");
  const review = br(page).getByTestId("br-review");
  await input.focus();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("");
  await expect(msg).toHaveCount(0);
  const before = { ticket: (await ticket.boundingBox())!, review: (await review.boundingBox())! };
  await input.blur();
  await expect(msg).toHaveText("Enter a quantity.");
  const after = { ticket: (await ticket.boundingBox())!, review: (await review.boundingBox())! };
  expect(after.ticket.height, "ticket height across the blur").toBe(before.ticket.height);
  expect(after.review.y, "Review's y across the blur").toBe(before.review.y);
  await shot(page, "qty-blur");
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

test("BR-4-14 colour-blind recolours Today with the cb pair; high contrast shows segment, input and review borders; reduced motion", async ({ page }, info) => {
  await open(page);
  await qty(page, "40");
  const html = (k: "cb" | "hc", on: boolean) => page.evaluate(([a, b]) => { if (b) document.documentElement.dataset[a] = "1"; else delete document.documentElement.dataset[a]; }, [k, on] as const);
  const fg = (l: Locator) => l.evaluate((e) => getComputedStyle(e).color);
  // Colour-blind: Today takes the cb gain/loss hex (tokens.css, per palette) and keeps its arrow.
  const today = br(page).getByTestId("br-today");
  const dir = await today.getAttribute("data-dir");
  expect(dir, "seed 17 HALC moves on its first tick").not.toBe("flat");
  const tok = dir === "up" ? "--gain" : "--loss";
  const plain = await fg(today);
  expect(plain).toBe(await color(page, `var(${tok})`));
  const palette = await page.evaluate(() => document.documentElement.dataset.palette ?? "");
  const CB = palette === "broadsheet" ? { "--gain": "rgb(8, 101, 122)", "--loss": "rgb(168, 35, 90)" } : { "--gain": "rgb(92, 225, 230)", "--loss": "rgb(255, 92, 138)" };
  await html("cb", true);
  expect(await fg(today)).toBe(CB[tok]);
  expect(CB[tok]).not.toBe(plain);
  await expect(today).toContainText(dir === "up" ? "\u25B2" : "\u25BC");
  // The other direction (QA #84 M9): seed 17 HALC moves one way only, so a sample row (a clone of Today with the opposite
  // direction class) proves the other cb hex too.
  const otherTok = dir === "up" ? "--loss" : "--gain";
  const sample = () => today.evaluate((e, cls) => {
    const s = e.cloneNode(true) as HTMLElement;
    s.classList.remove("gain", "loss");
    s.classList.add(cls);
    s.removeAttribute("data-testid");
    s.dataset.dir = cls === "gain" ? "up" : "down";
    e.parentElement!.append(s);
    const c = getComputedStyle(s).color;
    s.remove();
    return c;
  }, otherTok.slice(2));
  expect(await sample()).toBe(CB[otherTok]);
  await html("cb", false);
  expect(await sample()).toBe(await color(page, `var(${otherTok})`));
  expect(CB[otherTok]).not.toBe(await sample());
  await html("cb", true);
  for (const c of await colours(br(page).getByTestId("br-side"))) expect(Object.values(CB)).not.toContain(c);
  await shot(page, "preview-cb");
  await html("cb", false);
  // High contrast: --line becomes --fg-disabled, so the segment, input and review block borders change to it.
  const line = await color(page, "var(--line)");
  const borders = (ids: string[]) => Promise.all(ids.map((id) => page.getByTestId(id).first().evaluate((e) => {
    const s = getComputedStyle(e); return `${s.borderTopStyle} ${parseFloat(s.borderTopWidth) >= 1} ${s.borderTopColor}`;
  })));
  const ids = ["br-side", "br-qty"];
  expect(await borders(ids)).toEqual(ids.map(() => `solid true ${line}`));
  await html("hc", true);
  const hc = await color(page, "var(--fg-disabled)");
  expect(hc).not.toBe(line);
  expect(await borders(ids)).toEqual(ids.map(() => `solid true ${hc}`));
  await shot(page, "preview-hc");
  if (info.project.name === "desktop") {
    await review(page); // inline review block; on phone the Sheet frames it instead (.qs-body drops the block border)
    expect(await borders(["br-review-block"])).toEqual([`solid true ${hc}`]);
    await html("hc", false);
    expect(await borders(["br-review-block"])).toEqual([`solid true ${line}`]);
  } else {
    await html("hc", false);
    await page.evaluate(() => { document.documentElement.dataset.motion = "reduce"; });
    await br(page).getByTestId("br-review").click();
    expect(await page.getByTestId("br-sheet").evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
  }
});
