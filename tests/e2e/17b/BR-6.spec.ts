// UI card 6 (17B BR-6) Broker: cancel an open order, end to end against the production build and its mock feed.
// BR-6-06 / 08 engine states come from build-gated mock hooks: ?cancelKeep=STATUS (ack with the order kept), ?partFill=N
// (a partly filled order) and ?cancelGone=1 (a fill takes the order before the cancel settles on an absent id). This spec
// proves the browser side: control and confirm, the cancel
// intent on the fake clock, pending, ack + focus, ack with the order kept, partial fill, absent id, reject, halt and feed states, keyboard, axe, layout at 1440 / 520 / 390,
// cb / hc baselines, reduced motion, FR. Also QA #85 Q1 (no Review on a preview for other inputs) end to end.
// Shots: SHOTS=1 writes them under tests/e2e/17b/__screenshots__/BR-6 (CI); BR_SHOTS_DIR overrides the folder. The cb / hc
// list baselines (toHaveScreenshot) are committed under tests/e2e/17b/__screenshots__/BR-6 and compared on every run.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { pinHtml } from "./pin";
import { boot, setTextScale } from "../shell/helpers";
import { openBrokerPaused } from "./openPaused";

const desktopOnly = (n: string) => test.skip(n !== "desktop", "desktop project only");
const phoneOnly = (n: string) => test.skip(n !== "phone", "phone project only");
const SHOTS = process.env.BR_SHOTS_DIR ?? "tests/e2e/17b/__screenshots__/BR-6";
async function shot(page: Page, state: string, lang = "en") {
  if (!process.env.SHOTS && !process.env.BR_SHOTS_DIR) return;
  mkdirSync(SHOTS, { recursive: true });
  const vp = page.viewportSize()!;
  await page.screenshot({ path: `${SHOTS}/${state}${lang === "en" ? "" : `-${lang}`}-${vp.width}x${vp.height}.png` });
}
const color = (page: Page, v: string) => page.evaluate((x) => { const e = document.createElement("i"); e.style.color = x; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; }, v);
const br = (page: Page) => page.locator('[data-testid="broker"]:has([data-testid="br-ticker"]), [data-testid="broker"]:has([data-testid="br-asset-select"] option:checked[value="HALC"])').first();
const brAny = (page: Page) => page.getByTestId("broker").first();
const place = (page: Page) => page.getByTestId("br-place").first();
const list = (page: Page) => br(page).getByTestId("br-oo");
const rows = (page: Page) => list(page).locator('[data-testid^="br-oo-row-"]');
const cancelBtn = (r: Locator) => r.getByTestId("br-oo-cancel");
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
  for (const c of await l.locator("button").all()) {
    if (!(await c.isVisible())) continue;
    const b = (await c.boundingBox())!;
    if (b.height < min || b.width < Math.min(min, 44)) small.push(`${await c.getAttribute("data-testid")} ${b.width}x${b.height}`);
  }
  return small;
}
const overflow = (l: Locator) => l.evaluate((root) => [root, ...root.querySelectorAll('[data-testid^="br-"]')]
  .filter((e) => (e as HTMLElement).offsetParent !== null && e.scrollWidth > e.clientWidth + 1)
  .map((e) => `${e.getAttribute("data-testid")} ${e.scrollWidth}>${e.clientWidth}`));
type Intent = { kind: string; payload: Record<string, string> };
const cancelIntents = (page: Page) => page.evaluate(() => ((window as Window & { __quayIntents?: () => Intent[] }).__quayIntents?.() ?? []).filter((i) => i.kind === "mkt.order.cancel"));
async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).include('[data-testid="broker"]').analyze();
  return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ")}`);
}
const rowId = async (r: Locator) => (await r.getAttribute("data-testid"))!.replace("br-oo-row-", "");
/** Mask what moves with the tick (placed tick, pending tick) so a baseline compares only the cancel UI. */
const volatile = (page: Page) => [list(page).getByTestId("br-oo-meta"), list(page).getByTestId("br-oo-cancelling")];

async function openPaused(page: Page, query = "") {
  await openBrokerPaused(page, `/broker?asset=HALC${query}`, br(page));
}
/** Run the paused clock in 500 ms steps until `done`, at most `ms`. */
async function runUntil(page: Page, done: () => Promise<boolean>, ms = 6_000) {
  for (let t = 0; t < ms && !(await done()); t += 500) await page.clock.runFor(500);
  expect(await done()).toBe(true);
}
/** Place a limit order through the ticket and wait for its resting ack (`settleMs` covers `?replyMs`). */
async function limitOrder(page: Page, limit: string, qty = "40", settleMs = 6_000) {
  await br(page).getByTestId("br-type-limit").click();
  await br(page).getByTestId("br-price-limit").fill(limit);
  await br(page).getByTestId("br-qty").fill(qty);
  await page.clock.runFor(400);
  await expect(br(page).getByTestId("br-est")).toBeVisible();
  await br(page).getByTestId("br-review").click();
  await place(page).evaluate((el: HTMLElement) => el.click()); // phone: Place may sit below the fold
  await runUntil(page, async () => (await br(page).getByTestId("br-ack").count()) > 0, settleMs);
  await br(page).getByTestId("br-new").click();
  // Phone: leaving the ticket's qty field shifts the page (card 4 ticket), so a click that also blurs it lands on the row.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}
/** Cancel → confirm → Yes on a row; returns the order id. */
async function confirmCancel(r: Locator) {
  const id = await rowId(r);
  await cancelBtn(r).click();
  await r.getByTestId("br-oo-yes").click();
  return id;
}

test("BR-6-01 one Cancel per row named by cancelAria, no --acc in its computed colours; the li is no control", async ({ page }) => {
  await openPaused(page);
  await limitOrder(page, "42.10");
  await limitOrder(page, "41.50", "7");
  await expect(rows(page)).toHaveCount(2);
  for (const r of await rows(page).all()) {
    await expect(r.locator("button")).toHaveText(["Cancel"]);
    expect(await r.getAttribute("role")).toBeNull();
  }
  await expect(cancelBtn(rows(page).nth(0))).toHaveAccessibleName("Cancel order: Buy 7 HALC, Limit 41.50");
  await expect(cancelBtn(rows(page).nth(1))).toHaveAccessibleName("Cancel order: Buy 40 HALC, Limit 42.10");
  const acc = await color(page, "var(--acc)");
  await page.mouse.move(0, 0);
  await expect.poll(() => colours(list(page))).not.toContain(acc);
});

test("BR-6-02 confirm: Keep focused; Keep and Esc restore idle with focus on Cancel, nothing logged; a second confirm closes the first", async ({ page }) => {
  await openPaused(page);
  await limitOrder(page, "42.10");
  await limitOrder(page, "41.50", "7");
  const [a, b] = [rows(page).nth(0), rows(page).nth(1)];
  const before = (await cancelIntents(page)).length;
  await cancelBtn(a).click();
  await expect(a.getByTestId("br-oo-keep")).toBeFocused();
  await a.getByTestId("br-oo-keep").click();
  await expect(a.getByTestId("br-oo-ask")).toHaveCount(0);
  await expect(cancelBtn(a)).toBeFocused();
  await cancelBtn(a).click();
  await expect(a.getByTestId("br-oo-keep")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(a.getByTestId("br-oo-ask")).toHaveCount(0);
  await expect(cancelBtn(a)).toBeFocused();
  await expect(br(page)).toBeVisible(); // Esc closed only the confirm
  await cancelBtn(a).click();
  await cancelBtn(b).click();
  await expect(a.getByTestId("br-oo-ask")).toHaveCount(0);
  await expect(cancelBtn(a)).toBeVisible();
  await expect(b.getByTestId("br-oo-keep")).toBeFocused();
  expect(await cancelIntents(page)).toHaveLength(before);
});

test("BR-6-05 a middle row: focus moves to the next row's Cancel", async ({ page }) => {
  await openPaused(page);
  await limitOrder(page, "41.00");
  await limitOrder(page, "42.10");
  await limitOrder(page, "43.20");
  await expect(rows(page)).toHaveCount(3);
  const ids = await Promise.all((await rows(page).all()).map(rowId));
  await confirmCancel(rows(page).nth(1));
  await runUntil(page, async () => (await list(page).getByTestId(`br-oo-row-${ids[1]}`).count()) === 0);
  await expect(cancelBtn(list(page).getByTestId(`br-oo-row-${ids[2]}`))).toBeFocused();
});

test("BR-6-03/04/05 fake clock: Yes logs one cancel (double press too); Cancelling… · tick n; ack removes the row, line, focus next then heading", async ({ page }, info) => {
  await openPaused(page);
  await limitOrder(page, "42.10");
  await limitOrder(page, "41.50", "7");
  await expect(rows(page)).toHaveCount(2);
  await expect(list(page).getByTestId("br-oo-count")).toHaveText("2");
  const [first, second] = [rows(page).nth(0), rows(page).nth(1)];
  await expect(first.getByTestId("br-oo-terms")).toHaveText("Limit 41.50");
  await expect(cancelBtn(first)).toHaveText("Cancel");
  await expect(cancelBtn(first)).toHaveAccessibleName("Cancel order: Buy 7 HALC, Limit 41.50");
  if (info.project.name === "desktop") await shot(page, "idle");
  const id = await rowId(first);
  const keepId = await rowId(second);
  await cancelBtn(first).click();
  await expect(first.getByTestId("br-oo-ask")).toHaveText("Cancel this order?");
  await expect(first.getByTestId("br-oo-keep")).toBeFocused();
  if (info.project.name === "desktop") await shot(page, "confirm");
  const before = await cancelIntents(page);
  await first.getByTestId("br-oo-yes").evaluate((el: HTMLElement) => { el.click(); el.click(); });
  expect((await cancelIntents(page)).slice(before.length)).toEqual([{ kind: "mkt.order.cancel", payload: { orderId: id } }]);
  // BR-6-04: pending until our IntentResult.
  await expect(first).toHaveAttribute("aria-busy", "true");
  await expect(first.getByTestId("br-oo-cancelling")).toHaveText(/^Cancelling… · tick \d+$/);
  await expect(first.getByTestId("br-oo-cancelling")).toHaveAttribute("role", "status");
  await expect(first.locator("button")).toHaveCount(0);
  await expect(first.getByTestId("br-oo-status")).toHaveText("Working");
  if (info.project.name === "desktop") await shot(page, "cancelling");
  // BR-6-05: the next tick's ACCEPTED removes the row.
  await runUntil(page, async () => (await list(page).getByTestId(`br-oo-row-${id}`).count()) === 0);
  await expect(rows(page)).toHaveCount(1);
  await expect(list(page).getByTestId("br-oo-count")).toHaveText("1");
  await expect(list(page).getByTestId("br-oo-line")).toHaveText("Order cancelled: Buy 7 HALC, Limit 41.50");
  await expect(cancelBtn(list(page).getByTestId(`br-oo-row-${keepId}`))).toBeFocused();
  expect(await cancelIntents(page)).toHaveLength(before.length + 1);
  if (info.project.name === "desktop") await shot(page, "after-ack");
  // The last one: focus falls back to the list heading, then "No open orders.".
  await confirmCancel(rows(page).first());
  await expect(list(page).getByTestId("br-oo-line")).toBeEmpty(); // the line clears on the next action in the list
  await runUntil(page, async () => (await rows(page).count()) === 0);
  await expect(list(page).locator("#br-oo-title")).toBeFocused();
  await expect(list(page).getByTestId("br-oo-empty")).toHaveText("No open orders.");
  await expect(list(page).getByTestId("br-oo-line")).toHaveText("Order cancelled: Buy 40 HALC, Limit 42.10");
});

test("BR-6-03 ?replyMs=2000: a re-press while the reply is held finds no control and logs nothing more", async ({ page }) => {
  await openPaused(page, "&replyMs=2000");
  await limitOrder(page, "42.10", "40", 12_000);
  const r = rows(page).first();
  const before = await cancelIntents(page);
  const id = await confirmCancel(r);
  for (let ms = 0; ms < 2_000; ms += 500) {
    await expect(r.locator("button")).toHaveCount(0);
    await r.evaluate((el) => el.querySelectorAll("button").forEach((b) => b.click()));
    await page.clock.runFor(500);
  }
  await runUntil(page, async () => (await rows(page).count()) === 0, 12_000);
  expect((await cancelIntents(page)).slice(before.length)).toEqual([{ kind: "mkt.order.cancel", payload: { orderId: id } }]);
});

const youHold = async (page: Page) => Number((await br(page).getByTestId("br-you-hold").textContent())!.replace(/[^\d]/g, ""));

test("BR-6-06 ?cancelKeep=QUEUED_AUCTION: ACCEPTED with the order still open: the row stays, idle, with the new status; no line", async ({ page }) => {
  await openPaused(page, "&cancelKeep=QUEUED_AUCTION");
  await limitOrder(page, "42.10");
  const r = rows(page).first();
  await expect(r.getByTestId("br-oo-status")).toHaveText("Working");
  const before = await cancelIntents(page);
  const id = await confirmCancel(r);
  await expect(r.getByTestId("br-oo-cancelling")).toBeVisible();
  await runUntil(page, async () => (await r.getByTestId("br-oo-cancelling").count()) === 0);
  expect((await cancelIntents(page)).slice(before.length)).toEqual([{ kind: "mkt.order.cancel", payload: { orderId: id } }]);
  await expect(rows(page)).toHaveCount(1);
  await expect(list(page).getByTestId(`br-oo-row-${id}`)).toHaveAttribute("data-status", "QUEUED_AUCTION");
  await expect(r.getByTestId("br-oo-status")).toHaveText("Waits for reopen");
  await expect(r).not.toHaveAttribute("aria-busy", "true");
  await expect(cancelBtn(r)).toBeEnabled();
  await expect(cancelBtn(r)).not.toHaveAttribute("aria-disabled", "true");
  await expect(r.getByTestId("br-oo-note")).toHaveCount(0);
  await expect(list(page).getByTestId("br-oo-line")).toBeEmpty();
  await expect(list(page).locator("[data-leaving]")).toHaveCount(0);
  await expect(list(page).getByTestId("br-oo-count")).toHaveText("1");
});

test("BR-6-08 ?partFill=18: a row turns partly filled (18 / 40) the tick after it rests, and is removed on ACCEPTED; the 18 filled stay held", async ({ page }) => {
  await openPaused(page, "&partFill=18");
  const held0 = await youHold(page);
  await limitOrder(page, "42.10");
  const r = rows(page).first();
  await expect(r.getByTestId("br-oo-status")).toHaveText("Working"); // rests first; the same row then re-renders on the fill (Q2)
  await expect(r.getByTestId("br-oo-qty")).toHaveText("40");
  await runUntil(page, async () => (await r.getByTestId("br-oo-status").textContent()) !== "Working");
  await expect(r.getByTestId("br-oo-status")).toHaveText("Partly filled");
  await expect(r.getByTestId("br-oo-qty")).toHaveText("18 / 40 filled");
  await expect(cancelBtn(r)).toHaveAccessibleName("Cancel order: Buy 18 / 40 filled HALC, Limit 42.10");
  await expect.poll(() => youHold(page)).toBe(held0 + 18);
  const id = await confirmCancel(r);
  await runUntil(page, async () => (await list(page).getByTestId(`br-oo-row-${id}`).count()) === 0);
  await expect(list(page).getByTestId("br-oo-line")).toHaveText("Order cancelled: Buy 18 / 40 filled HALC, Limit 42.10");
  await expect(list(page).getByTestId("br-oo-empty")).toHaveText("No open orders.");
  await expect(list(page).locator("#br-oo-title")).toBeFocused();
  await page.clock.runFor(2_000);
  expect(await youHold(page), "the filled part stays in holdings").toBe(held0 + 18);
});

test("BR-6-08 ?cancelGone=1: a fill takes the order first (row drops at once, no ghost); the cancel then finds no order: ACCEPTED, no effects, the other row untouched", async ({ page }) => {
  await openPaused(page, "&cancelGone=1");
  const held0 = await youHold(page);
  await limitOrder(page, "42.10");
  await limitOrder(page, "41.50", "7");
  const [gone, other] = [rows(page).nth(1), rows(page).nth(0)];
  const otherId = await rowId(other);
  await expect(gone.getByTestId("br-oo-terms")).toHaveText("Limit 42.10");
  const before = await cancelIntents(page);
  const id = await confirmCancel(gone);
  const row = list(page).getByTestId(`br-oo-row-${id}`);
  const ghost = list(page).getByTestId(`br-oo-leaving-${id}`);
  const line = list(page).getByTestId("br-oo-line");
  // Step the clock: the fill removes the row before any result (empty line), then the ACCEPTED fills the line.
  let leftAt = -1, lineAt = -1;
  for (let t = 0; t < 16_000 && lineAt < 0; t += 250) {
    await page.clock.runFor(250);
    const [rowN, ghostN, text] = [await row.count(), await ghost.count(), (await line.textContent()) ?? ""];
    expect(ghostN, `no ghost of the filled order at ${t} ms`).toBe(0);
    if (rowN === 0 && leftAt < 0) { leftAt = t; expect(text, "no outcome before the IntentResult").toBe(""); }
    if (text !== "") lineAt = t;
  }
  expect(leftAt, "the fill removed the row").toBeGreaterThanOrEqual(0);
  expect(lineAt, "the result came on a later tick than the fill").toBeGreaterThan(leftAt);
  await expect(line).toHaveText("Order cancelled: Buy 40 HALC, Limit 42.10");
  expect((await cancelIntents(page)).slice(before.length)).toEqual([{ kind: "mkt.order.cancel", payload: { orderId: id } }]);
  await expect(rows(page)).toHaveCount(1);
  await expect(list(page).getByTestId(`br-oo-row-${otherId}`).getByTestId("br-oo-status")).toHaveText("Working");
  await expect(list(page).getByTestId(`br-oo-row-${otherId}`).getByTestId("br-oo-qty")).toHaveText("7");
  await expect(cancelBtn(list(page).getByTestId(`br-oo-row-${otherId}`))).toBeFocused();
  await expect.poll(() => youHold(page), "the 40 filled are held").toBe(held0 + 40);
});

test("BR-6-07 ?cancelReject=MKT_X: row stays idle with the code alert; next Cancel clears it", async ({ page }, info) => {
  await openPaused(page, "&cancelReject=MKT_X");
  await limitOrder(page, "42.10");
  const r = rows(page).first();
  await confirmCancel(r);
  await runUntil(page, async () => (await r.getByTestId("br-oo-note").count()) > 0);
  await expect(r.getByTestId("br-oo-note")).toHaveText("Cancel refused (code MKT_X)");
  await expect(r.getByTestId("br-oo-note")).toHaveAttribute("role", "alert");
  await expect(r).toHaveAttribute("data-cancel", "idle");
  await expect(r).not.toHaveAttribute("aria-busy", "true");
  await expect(r.getByTestId("br-oo-status")).toHaveText("Working");
  const note = await r.getByTestId("br-oo-note").evaluate((e) => { const s = getComputedStyle(e); return [s.color, s.borderLeftColor, s.borderLeftWidth]; });
  expect(note).toEqual([await color(page, "var(--fg)"), await color(page, "var(--loss)"), "2px"]);
  if (info.project.name === "desktop") await shot(page, "rejected");
  await cancelBtn(r).click();
  await expect(r.getByTestId("br-oo-note")).toHaveCount(0);
});

test("BR-6-07 ?cancelReject=MKT_HALTED: a mapped code shows its r.* line", async ({ page }) => {
  // Its own page: the mock reads the scenario once per session (useChannel), so a second goto keeps the first one.
  await openPaused(page, "&cancelReject=MKT_HALTED");
  await limitOrder(page, "42.10");
  await confirmCancel(rows(page).first());
  await runUntil(page, async () => (await rows(page).first().getByTestId("br-oo-note").count()) > 0);
  await expect(rows(page).first().getByTestId("br-oo-note")).toHaveText("Trading is halted for this asset.");
});

test("BR-6-09 ?halt=HALC: Cancel is enabled on a Waits-for-reopen row and the cancel is ACCEPTED", async ({ page }) => {
  await openPaused(page, "&halt=HALC");
  await limitOrder(page, "42.10");
  const r = rows(page).first();
  await expect(r.getByTestId("br-oo-status")).toHaveText("Waits for reopen");
  await expect(cancelBtn(r)).not.toHaveAttribute("aria-disabled", "true");
  await confirmCancel(r);
  await runUntil(page, async () => (await rows(page).count()) === 0);
  await expect(list(page).getByTestId("br-oo-line")).toHaveText("Order cancelled: Buy 40 HALC, Limit 42.10");
});

test("BR-6-09 ?feed=stale: Cancel aria-disabled (--fg-disabled) and inert; a row already cancelling keeps its state", async ({ page }) => {
  await openPaused(page, "&feed=stale");
  await limitOrder(page, "42.10");
  await limitOrder(page, "41.50", "7");
  await expect(rows(page)).toHaveCount(2);
  const busy = rows(page).first();
  const idle = rows(page).nth(1);
  await confirmCancel(busy);
  await runUntil(page, async () => (await list(page).getAttribute("data-state")) === "stale", 25_000);
  await expect(busy).toHaveAttribute("aria-busy", "true");
  await expect(busy.getByTestId("br-oo-cancelling")).toBeVisible();
  await expect(cancelBtn(idle)).toHaveAttribute("aria-disabled", "true");
  const disabled = await color(page, "var(--fg-disabled)");
  await expect.poll(() => cancelBtn(idle).evaluate((e) => getComputedStyle(e).color)).toBe(disabled); // .btn transitions colour
  const before = await cancelIntents(page);
  await cancelBtn(idle).evaluate((el: HTMLElement) => el.click());
  await expect(idle.getByTestId("br-oo-confirm")).toHaveCount(0);
  expect(await cancelIntents(page)).toHaveLength(before.length);
});

test("BR-6-09 ?feed=denied|error|loading: no enabled Cancel anywhere (card 5's list states)", async ({ page }) => {
  for (const mode of ["denied", "error", "loading"]) {
    await boot(page, `/broker?asset=HALC&feed=${mode}`);
    await expect(brAny(page).getByTestId(mode === "loading" ? "br-oo-loading" : "br-oo-error")).toBeVisible();
    await expect(brAny(page).locator('[data-testid="br-oo-cancel"]:not([aria-disabled="true"])')).toHaveCount(0);
  }
});

test("BR-6-10 keyboard only: Tab reaches each Cancel, Enter / Space open confirm, Esc undoes; names; axe idle, confirm, rejected", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await openPaused(page, "&cancelReject=MKT_X");
  await limitOrder(page, "42.10");
  await limitOrder(page, "41.50", "7");
  const [a, b] = [rows(page).nth(0), rows(page).nth(1)];
  await a.focus();
  await page.keyboard.press("Tab");
  await expect(cancelBtn(a)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(b).toBeFocused();
  await expect(b).not.toHaveAttribute("role", /.+/);
  await page.keyboard.press("Tab");
  await expect(cancelBtn(b)).toBeFocused();
  await expect(cancelBtn(b)).toHaveAccessibleName("Cancel order: Buy 40 HALC, Limit 42.10");
  const before = await cancelIntents(page);
  for (const k of ["Enter", "Space"]) {
    await page.keyboard.press(k);
    await expect(b.getByTestId("br-oo-keep")).toBeFocused();
    await expect(b.getByTestId("br-oo-keep")).toHaveAccessibleName("Keep order");
    await expect(b.getByTestId("br-oo-yes")).toHaveAccessibleName("Yes, cancel");
    await expect(b.getByTestId("br-oo-confirm")).toHaveAccessibleName("Cancel order: Buy 40 HALC, Limit 42.10");
    await page.keyboard.press("Escape");
    await expect(b.getByTestId("br-oo-confirm")).toHaveCount(0);
    await expect(cancelBtn(b)).toBeFocused();
  }
  // Keep order (keyboard) restores too; opening another row's confirm closes the first.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter"); // on the focused Keep order
  await expect(cancelBtn(b)).toBeFocused();
  await page.keyboard.press("Enter");
  await cancelBtn(a).focus();
  await page.keyboard.press("Enter");
  await expect(list(page).getByTestId("br-oo-confirm")).toHaveCount(1);
  await expect(a.getByTestId("br-oo-keep")).toBeFocused();
  expect(await cancelIntents(page)).toHaveLength(before.length);
  await page.clock.resume(); // axe runs on timers
  expect(await axe(page), "confirm").toEqual([]);
  await page.keyboard.press("Escape");
  expect(await axe(page), "idle").toEqual([]);
  // Yes by keyboard, then the reject.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(a.getByTestId("br-oo-yes")).toBeFocused();
  await page.keyboard.press("Enter");
  expect(await cancelIntents(page)).toHaveLength(before.length + 1);
  await expect(a.getByTestId("br-oo-note")).toHaveText("Cancel refused (code MKT_X)", { timeout: 12_000 });
  expect(await axe(page), "rejected").toEqual([]);
});

test("BR-6-10 axe 0 serious while cancelling (reply held 60 s)", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await openPaused(page, "&replyMs=60000");
  await limitOrder(page, "42.10", "40", 70_000);
  const r = rows(page).first();
  await confirmCancel(r);
  await page.clock.resume();
  await expect(r.getByTestId("br-oo-cancelling")).toBeVisible();
  expect(await axe(page)).toEqual([]);
  await expect(r).toHaveAttribute("aria-busy", "true");
});

test("BR-6-11 1440: Cancel ≥ 28 px, rows one line, no --acc in idle / hover / confirm; cb and hc baselines", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await openPaused(page);
  await limitOrder(page, "42.10");
  await limitOrder(page, "41.50", "7");
  // 1440: the Broker window filled (card 5 BR-5-11), so the list column is wide enough for one-line rows.
  await page.getByTestId("win-broker").filter({ has: page.getByTestId("br-ticker") }).first().getByRole("button", { name: "Fill" }).click();
  const r = rows(page).first();
  const y = (t: string) => r.getByTestId(t).boundingBox().then((x) => x!.y);
  await expect.poll(async () => Math.abs((await y("br-oo-side")) - (await y("br-oo-terms")))).toBeLessThan(2);
  const c = (await cancelBtn(r).boundingBox())!;
  expect(c.height).toBeGreaterThanOrEqual(28);
  const [side, terms] = await Promise.all(["br-oo-side", "br-oo-terms"].map((t) => r.getByTestId(t).boundingBox().then((x) => x!)));
  expect(Math.abs(side.y - terms.y)).toBeLessThan(2);
  expect(c.y).toBeLessThan(terms.y + terms.height); // same line as the row content
  const [acc, gain, line, fg, loss] = await Promise.all(["--acc", "--gain", "--line", "--fg", "--loss"].map((v) => color(page, `var(${v})`)));
  const look = (l: Locator) => l.evaluate((e) => { const s = getComputedStyle(e); return { color: s.color, bg: s.backgroundColor, border: s.borderTopColor }; });
  await page.mouse.move(0, 0);
  await expect.poll(() => look(cancelBtn(r))).toEqual({ color: fg, bg: "rgba(0, 0, 0, 0)", border: line });
  await cancelBtn(r).hover();
  await expect.poll(async () => (await look(cancelBtn(r))).border).toBe(loss);
  for (const v of [acc, gain]) expect(await colours(list(page))).not.toContain(v);
  await cancelBtn(r).click();
  await page.mouse.move(0, 0);
  await expect.poll(() => look(r.getByTestId("br-oo-yes"))).toEqual({ color: loss, bg: "rgba(0, 0, 0, 0)", border: loss });
  await expect.poll(async () => (await look(r.getByTestId("br-oo-keep"))).border).toBe(line);
  expect(await colours(list(page))).not.toContain(acc);
  // cb / hc: compared baselines (committed), with the confirm open on the first row.
  await pinHtml(page, "cb", true);
  const cbLoss = await color(page, "var(--loss)");
  expect(cbLoss, "cb swaps the --loss token").not.toBe(loss);
  await expect.poll(async () => (await look(r.getByTestId("br-oo-yes"))).color).toBe(cbLoss); // paired with its text label, never colour alone
  await expect(list(page)).toHaveScreenshot(["BR-6", "cb-1440x900.png"], { mask: volatile(page) });
  await pinHtml(page, "cb", false);
  await pinHtml(page, "hc", true);
  expect(await r.getByTestId("br-oo-yes").evaluate((e) => getComputedStyle(e).borderTopWidth)).toBe("2px");
  expect(await cancelBtn(rows(page).nth(1)).evaluate((e) => getComputedStyle(e).borderTopWidth)).toBe("2px");
  await expect(list(page)).toHaveScreenshot(["BR-6", "hc-1440x900.png"], { mask: volatile(page) });
  await shot(page, "hc");
  await pinHtml(page, "hc", false);
});

test("BR-6-11 reduced motion: the removed row leaves with no animation", async ({ page }, info) => {
  desktopOnly(info.project.name);
  // Emulated before load: QuayShell's applyAppearance reads the media query and sets data-motion itself.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openPaused(page);
  await runUntil(page, async () => (await page.evaluate(() => document.documentElement.dataset.motion)) === "reduce");
  await limitOrder(page, "42.10");
  await limitOrder(page, "41.50", "7");
  await cancelBtn(rows(page).first()).click();
  await rows(page).first().getByTestId("br-oo-yes").click();
  await runUntil(page, async () => (await rows(page).count()) === 1);
  const anim = await list(page).evaluate((el) => ({
    running: document.getAnimations().filter((a) => el.contains((a.effect as KeyframeEffect | null)?.target ?? null)).length,
    ghosts: [...el.querySelectorAll<HTMLElement>("[data-leaving]")].filter((g) => getComputedStyle(g).display !== "none").length,
  }));
  expect(anim).toEqual({ running: 0, ghosts: 0 });
});

test("BR-6-11 520 window: rows two lines + a right-aligned actions line; confirm and rejected fit", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await openPaused(page, "&cancelReject=MKT_X");
  await limitOrder(page, "42.10");
  const win = page.getByTestId("win-broker").filter({ has: page.getByTestId("br-ticker") }).first();
  const handle = (await win.getByTestId("resize-handle").boundingBox())!;
  await page.mouse.move(handle.x + 5, handle.y + 5);
  await page.mouse.down();
  await page.mouse.move(50, handle.y + 5, { steps: 5 });
  await page.mouse.up();
  expect((await win.boundingBox())!.width).toBe(520);
  const r = rows(page).first();
  const box = (l: Locator) => l.boundingBox().then((b) => b!);
  await expect.poll(async () => (await box(cancelBtn(r))).y > (await box(r.getByTestId("br-oo-qty"))).y + 4).toBe(true);
  const [row, cb] = [await box(r), await box(cancelBtn(r))];
  expect(row.x + row.width - (cb.x + cb.width)).toBeLessThan(24); // right-aligned
  expect(await hits(list(page), 28)).toEqual([]);
  await cancelBtn(r).click();
  expect(await overflow(list(page))).toEqual([]);
  expect(await hits(list(page), 28)).toEqual([]);
  await shot(page, "confirm-window-520");
  await r.getByTestId("br-oo-yes").click();
  await runUntil(page, async () => (await r.getByTestId("br-oo-note").count()) > 0);
  expect(await overflow(list(page))).toEqual([]);
  await shot(page, "rejected-window-520");
});

for (const scale of ["1", "2"] as const) {
  test(`BR-6-12 phone scale ${scale}: no overflow, 44 px cancel controls, confirm ${scale === "2" ? "stacked" : "side by side"}; cancelling, rejected`, async ({ page }, info) => {
    phoneOnly(info.project.name);
    // Text scale is a session pref: set it, then open the Broker from the Home screen (the scenario rides on the first URL).
    await page.clock.install({ time: new Date("2026-10-21T08:00:00Z") });
    await boot(page, "/settings?cancelReject=MKT_X");
    await setTextScale(page, scale);
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByTestId("icon-broker").click();
    await brAny(page).getByTestId("br-asset-select").selectOption("HALC");
    await expect(br(page)).toHaveAttribute("data-state", "live");
    const now = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(new Date(now + 1_000));
    await limitOrder(page, "42.10");
    const r = rows(page).first();
    await r.scrollIntoViewIfNeeded();
    const fits = async () => {
      expect(await hits(list(page), 44)).toEqual([]);
      expect(await overflow(list(page))).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    };
    await fits();
    const [row, cb] = [(await r.boundingBox())!, (await cancelBtn(r).boundingBox())!];
    expect(cb.width).toBeGreaterThan(row.width * 0.8); // actions line full width
    await shot(page, `idle-scale-${scale}`);
    await cancelBtn(r).click();
    await fits();
    const [keep, yes] = await Promise.all(["br-oo-keep", "br-oo-yes"].map((t) => r.getByTestId(t).boundingBox().then((x) => x!)));
    if (scale === "2") { expect(yes.y).toBeGreaterThanOrEqual(keep.y + keep.height); expect(yes.x).toBe(keep.x); expect(yes.width).toBe(keep.width); }
    else expect(yes.y).toBe(keep.y);
    await shot(page, `confirm-scale-${scale}`);
    await r.getByTestId("br-oo-yes").click();
    await expect(r.getByTestId("br-oo-cancelling")).toBeVisible();
    await fits();
    await shot(page, `cancelling-scale-${scale}`);
    await runUntil(page, async () => (await r.getByTestId("br-oo-note").count()) > 0);
    await expect(r.getByTestId("br-oo-note")).toHaveText("Cancel refused (code MKT_X)");
    await fits();
    await shot(page, `rejected-scale-${scale}`);
  });
}

test("BR-6-12 FR: Annuler, NNBSP before : and ?, « » around the code", async ({ page }, info) => {
  await openPaused(page, "&locale=fr&cancelReject=MKT_X");
  await limitOrder(page, "42,10");
  const r = rows(page).first();
  await expect(cancelBtn(r)).toHaveText("Annuler");
  await expect(cancelBtn(r)).toHaveAccessibleName("Annuler l’ordre\u202F: Achat 40 HALC, Limite 42,10");
  await cancelBtn(r).click();
  await expect(r.getByTestId("br-oo-ask")).toHaveText("Annuler cet ordre\u202F?");
  await expect(r.getByTestId("br-oo-keep")).toHaveText("Conserver l’ordre");
  await expect(r.getByTestId("br-oo-yes")).toHaveText("Oui, annuler");
  if (info.project.name === "desktop") await shot(page, "confirm", "fr");
  await r.getByTestId("br-oo-yes").click();
  await expect(r.getByTestId("br-oo-cancelling")).toHaveText(/^Annulation… · tick \d+$/);
  await runUntil(page, async () => (await r.getByTestId("br-oo-note").count()) > 0);
  await expect(r.getByTestId("br-oo-note")).toHaveText("Annulation refusée (code «\u202FMKT_X\u202F»)");
  if (info.project.name === "desktop") await shot(page, "rejected", "fr");
});

test("Q1 (QA #85) a price edit hides the old estimate and disables Review until the preview for the new price lands, also under the per-tick cap", async ({ page }) => {
  await openPaused(page);
  const review = br(page).getByTestId("br-review");
  const est = br(page).getByTestId("br-est");
  const pending = br(page).getByTestId("br-est-pending");
  await br(page).getByTestId("br-type-limit").click();
  await br(page).getByTestId("br-price-limit").fill("42.10");
  await br(page).getByTestId("br-qty").fill("40");
  await page.clock.runFor(400);
  await expect(est).toBeVisible();
  await expect(review).not.toHaveAttribute("aria-disabled", "true");
  // Inside the debounce: no estimate for the old price, Review disabled, "Refreshing estimate…".
  await br(page).getByTestId("br-price-limit").fill("41.00");
  await expect(est).toHaveCount(0);
  await expect(pending).toBeVisible();
  await expect(review).toHaveAttribute("aria-disabled", "true");
  await page.clock.runFor(400);
  await expect(est).toBeVisible();
  await expect(pending).toHaveCount(0);
  await expect(review).not.toHaveAttribute("aria-disabled", "true");
  // Per-tick cap (5): wait for a tick (the shown estimate is re-requested on it), then make 6 edits inside that tick.
  const at = await br(page).getByTestId("br-est-title").textContent();
  await runUntil(page, async () => (await br(page).getByTestId("br-est-title").textContent()) !== at);
  const title = await br(page).getByTestId("br-est-title").textContent();
  for (const p of ["41.01", "41.02", "41.03", "41.04", "41.05", "41.06"]) {
    await br(page).getByTestId("br-price-limit").fill(p);
    await page.clock.runFor(350);
  }
  // The cap refused the last edits: no estimate, Review disabled, still the same tick.
  await expect(est).toHaveCount(0);
  await expect(pending).toBeVisible();
  await expect(review).toHaveAttribute("aria-disabled", "true");
  await review.evaluate((el: HTMLElement) => el.click());
  await expect(place(page)).toHaveCount(0);
  // Next tick: the deferred request goes out and its preview (for 41.06) enables Review.
  await runUntil(page, async () => (await est.count()) > 0);
  await expect(br(page).getByTestId("br-est-title")).not.toHaveText(title!);
  await expect(review).not.toHaveAttribute("aria-disabled", "true");
  await review.click();
  await expect(page.getByTestId("br-action").first()).toHaveText("Buy 40 HALC · Limit 41.06");
});
