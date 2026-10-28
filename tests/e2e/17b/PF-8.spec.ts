// UI card 8 (17B PF-8) Portfolio › Orders: the Broker's Open orders list (card 5 / 6, imported, not copied) and Recent
// fills from me.fills, end to end against the production build and its mock feed. Orders are placed in the Broker
// window and read in the Portfolio window on the same page (one feed): cancel from Portfolio (PF-8-03), the Broker's
// "Bought … at {price}" matched in Recent fills (PF-8-06), Maker / Taker chips and a halted market order (PF-8-07),
// colours (PF-8-08), states (PF-8-09), 1440 / 520 (PF-8-10), phone at text scale 1 / 2 with cb / hc baselines and axe
// (PF-8-11), FR (PF-8-12). The spec's `?reject=` for the cancel is card 6's cancel hook `?cancelReject=` (`?reject=`
// refuses the place, so no order would rest). Shots: SHOTS=1 or PF8_SHOTS_DIR; the cb / hc baselines are committed
// under tests/e2e/17b/__screenshots__/PF-8 and compared on every run.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { boot, setTextScale } from "../shell/helpers";
import { openBrokerPaused } from "./openPaused";
import { pinHtml } from "./pin";
import { SPEC_COLOUR } from "./specColours";

const desktopOnly = (n: string) => test.skip(n !== "desktop", "desktop project only");
const phoneOnly = (n: string) => test.skip(n !== "phone", "phone project only");
const isPhone = (n: string) => n === "phone";
const SHOTS = process.env.PF8_SHOTS_DIR ?? "tests/e2e/17b/__screenshots__/PF-8";
async function shot(page: Page, state: string) {
  if (!process.env.SHOTS && !process.env.PF8_SHOTS_DIR) return;
  mkdirSync(SHOTS, { recursive: true });
  const vp = page.viewportSize()!;
  await page.screenshot({ path: `${SHOTS}/${state}-${vp.width}x${vp.height}.png` });
}
const color = (page: Page, v: string) => page.evaluate((x) => { const e = document.createElement("i"); e.style.color = x; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; }, v);
const br = (page: Page) => page.locator('[data-testid="broker"]:has([data-testid="br-ticker"]), [data-testid="broker"]:has([data-testid="br-asset-select"] option:checked[value="HALC"])').first();
const pf = (page: Page) => page.getByTestId("pf-orders").first();
const oo = (page: Page) => pf(page).getByTestId("br-oo");
const ooRows = (page: Page) => oo(page).locator('[data-testid^="br-oo-row-"]');
const fills = (page: Page) => pf(page).getByTestId("pf-fill");
const cancelBtn = (r: Locator) => r.getByTestId("br-oo-cancel");
const rowId = async (r: Locator) => (await r.getAttribute("data-testid"))!.replace("br-oo-row-", "");
type Intent = { kind: string; payload: Record<string, string> };
const cancelIntents = (page: Page) => page.evaluate(() => ((window as Window & { __quayIntents?: () => Intent[] }).__quayIntents?.() ?? []).filter((i) => i.kind === "mkt.order.cancel"));
const colours = (l: Locator) => l.evaluate((el) => {
  const out = new Set<string>();
  for (const e of [el, ...el.querySelectorAll("*")]) {
    const s = getComputedStyle(e);
    for (const c of [s.color, s.backgroundColor, s.borderTopColor, s.borderLeftColor, s.borderBottomColor]) out.add(c);
  }
  return [...out];
});
const overflow = (l: Locator) => l.evaluate((root) => [root, ...root.querySelectorAll("*")]
  .filter((e) => (e as HTMLElement).offsetParent !== null && !e.classList.contains("sr-only") && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== "visible")
  .map((e) => `${e.getAttribute("data-testid") ?? e.className} ${e.scrollWidth}>${e.clientWidth}`)
  .concat(root.scrollWidth > root.clientWidth + 1 ? [`root ${root.scrollWidth}>${root.clientWidth}`] : []));
const outside = (page: Page, l: Locator) => l.evaluate((root) => {
  const edge = (root.closest(".win, .phone-appview") ?? document.documentElement).getBoundingClientRect().right;
  return [...root.querySelectorAll("*")].filter((e) => (e as HTMLElement).offsetParent !== null && e.getBoundingClientRect().right > edge + 0.5).map((e) => e.getAttribute("data-testid") ?? e.className);
});
async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).include('[data-testid="pf-orders"]').analyze();
  return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ")}`);
}
async function runUntil(page: Page, done: () => Promise<boolean>, ms = 6_000) {
  for (let t = 0; t < ms && !(await done()); t += 500) await page.clock.runFor(500);
  expect(await done()).toBe(true);
}
async function openPaused(page: Page, query = "") {
  await openBrokerPaused(page, `/broker?asset=HALC${query}`, br(page));
}
/** Ticket → Review → Place → the ack (resting limit, market fill, or a halted market order waiting). */
async function order(page: Page, type: "market" | "limit", qty: string, limit?: string) {
  await br(page).getByTestId(`br-type-${type}`).click();
  if (limit) await br(page).getByTestId("br-price-limit").fill(limit);
  await br(page).getByTestId("br-qty").fill(qty);
  await page.clock.runFor(400);
  await expect(br(page).getByTestId("br-est")).toBeVisible();
  await br(page).getByTestId("br-review").click();
  await br(page).getByTestId("br-place").evaluate((el: HTMLElement) => el.click());
  await runUntil(page, async () => (await br(page).getByTestId("br-ack").count()) > 0);
}
/** The Bought line, once the fill reaches me.fills. */
async function bought(page: Page) {
  const title = br(page).getByTestId("br-ack-title");
  await runUntil(page, async () => /^Bought /.test((await title.textContent()) ?? ""));
  return (await title.textContent())!;
}
async function newOrder(page: Page) {
  await br(page).getByTestId("br-new").click();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}
/** Click `l` once it shows; a lazy app body under Suspense only reveals while the paused clock runs (openPaused.ts). */
async function clickWhenShown(page: Page, l: Locator) {
  await expect.poll(async () => {
    const n = await l.count();
    if (n === 0) await page.clock.runFor(100).catch(() => undefined);
    return n;
  }, { timeout: 10_000, intervals: [50] }).toBeGreaterThan(0);
  await l.click();
}
/** Portfolio › Orders next to the Broker: desktop opens a second window from the shelf; phone goes Home → Portfolio → Orders. */
async function toOrders(page: Page, phone: boolean, state = "live") {
  if (phone) {
    for (let i = 0; i < 3 && (await page.getByTestId("icon-portfolio").count()) === 0; i++) await page.getByTestId("app-back").click();
    await page.getByTestId("icon-portfolio").click();
    await clickWhenShown(page, page.getByTestId("pf-open-orders"));
  } else {
    await page.getByTestId("tile-portfolio").click();
    await clickWhenShown(page, page.getByTestId("win-portfolio").first().getByTestId("pf-tab-orders"));
  }
  await expect.poll(async () => {
    const s = (await pf(page).count()) > 0 ? await pf(page).getAttribute("data-state") : null;
    if (s !== state) await page.clock.runFor(100).catch(() => undefined);
    return s;
  }, { timeout: 10_000, intervals: [50] }).toBe(state);
}
/** Portfolio alone (no Broker), unpaused clock. */
async function openOrdersTab(page: Page, query: string, phone: boolean, state = "live") {
  await boot(page, `/portfolio${query}`);
  if (phone) await page.getByTestId("pf-open-orders").click();
  else await page.getByTestId("win-portfolio").first().getByTestId("pf-tab-orders").click();
  await expect(pf(page)).toHaveAttribute("data-state", state);
}

test("PF-8-01 three tabs; arrows cycle; the panel is named by its tab", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await openOrdersTab(page, "", false);
  const win = page.getByTestId("win-portfolio").first();
  await expect(win.getByRole("tab")).toHaveText(["Overview", "Positions", "Orders"]);
  await expect(win.getByRole("tabpanel")).toHaveAccessibleName("Orders");
  await win.getByRole("tab", { name: "Orders" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(win.getByRole("tab", { name: "Overview" })).toBeFocused();
  await expect(win.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(win.getByRole("tab", { name: "Orders" })).toHaveAttribute("aria-selected", "true");
});

test("PF-8-03 Cancel from Portfolio: one mkt.order.cancel {orderId}, Cancelling…, the row leaves both lists", async ({ page }, info) => {
  const phone = isPhone(info.project.name);
  await openPaused(page);
  await order(page, "limit", "40", "42.10");
  await newOrder(page);
  await order(page, "limit", "7", "41.50");
  await newOrder(page);
  await toOrders(page, phone);
  await expect(ooRows(page)).toHaveCount(2);
  const first = ooRows(page).first();
  await expect(cancelBtn(first)).toHaveAccessibleName("Cancel order: Buy 7 HALC, Limit 41.50");
  const id = await rowId(first);
  const before = await cancelIntents(page);
  await cancelBtn(first).click();
  await expect(first.getByTestId("br-oo-keep")).toBeFocused();
  await first.getByTestId("br-oo-yes").evaluate((el: HTMLElement) => { el.click(); el.click(); });
  expect((await cancelIntents(page)).slice(before.length)).toEqual([{ kind: "mkt.order.cancel", payload: { orderId: id } }]);
  await expect(first.getByTestId("br-oo-cancelling")).toHaveText(/^Cancelling… · tick \d+$/);
  await expect(first).toHaveAttribute("aria-busy", "true");
  await shot(page, `cancelling${phone ? "" : "-desktop"}`);
  await runUntil(page, async () => (await oo(page).getByTestId(`br-oo-row-${id}`).count()) === 0);
  await expect(ooRows(page)).toHaveCount(1);
  await expect(oo(page).getByTestId("br-oo-line")).toHaveText("Order cancelled: Buy 7 HALC, Limit 41.50");
  if (!phone) await expect(br(page).getByTestId(`br-oo-row-${id}`)).toHaveCount(0); // the Broker window's list too
  expect(await cancelIntents(page)).toHaveLength(before.length + 1);
});

test("PF-8-03 ?cancelReject=MKT_X from Portfolio: the row stays idle with card 6's code alert", async ({ page }, info) => {
  const phone = isPhone(info.project.name);
  await openPaused(page, "&cancelReject=MKT_X");
  await order(page, "limit", "40", "42.10");
  await newOrder(page);
  await toOrders(page, phone);
  const r = ooRows(page).first();
  await cancelBtn(r).click();
  await r.getByTestId("br-oo-yes").click();
  await runUntil(page, async () => (await r.getByTestId("br-oo-note").count()) > 0);
  await expect(r.getByTestId("br-oo-note")).toHaveText("Cancel refused (code MKT_X)");
  await expect(r.getByTestId("br-oo-note")).toHaveAttribute("role", "alert");
  await expect(r).toHaveAttribute("data-cancel", "idle");
  const note = await r.getByTestId("br-oo-note").evaluate((e) => { const s = getComputedStyle(e); return [s.color, s.borderLeftColor]; });
  expect(note).toEqual([await color(page, "var(--fg)"), await color(page, "var(--loss)")]);
  await shot(page, `rejected${phone ? "" : "-desktop"}`);
});

test("PF-8-06 / 07 a market Buy in Broker: Recent fills shows it at the Bought price, Taker; a part fill reads Maker", async ({ page }, info) => {
  const phone = isPhone(info.project.name);
  await openPaused(page, "&partFill=18");
  await order(page, "market", "40");
  const line = await bought(page);
  const price = line.match(/^Bought 40 HALC at ([\d,.]+)$/)![1]!;
  await newOrder(page);
  await order(page, "limit", "40", "30.00"); // rests; 18 fill the tick after
  await newOrder(page);
  await toOrders(page, phone);
  await runUntil(page, async () => (await fills(page).count()) === 2);
  await expect(pf(page).getByTestId("pf-fills-count")).toHaveText("2");
  const [maker, taker] = [fills(page).nth(0), fills(page).nth(1)]; // newest first
  await expect(taker.getByTestId("pf-fill-liq")).toHaveText("Taker");
  await expect(maker.getByTestId("pf-fill-liq")).toHaveText("Maker");
  if (phone) {
    await expect(taker.getByTestId("pf-fill-qtyat")).toHaveText(`40 @ ${price}`);
    await expect(maker.getByTestId("pf-fill-qtyat")).toHaveText("18 @ 30.00");
  } else {
    await expect(taker.getByTestId("pf-fill-price")).toHaveText(price);
    await expect(taker.getByTestId("pf-fill-qty")).toHaveText("40");
    await expect(maker.getByTestId("pf-fill-price")).toHaveText("30.00");
  }
  await expect(taker).toHaveAttribute("aria-label", new RegExp(`^Buy 40 HALC at ${price.replace(/\./g, "\\.")}, fee [\\d,.]+ [A-Z]+, Taker, tick \\d+$`));
  await expect(ooRows(page).first().getByTestId("br-oo-status")).toHaveText("Partly filled");
  await shot(page, phone ? "fills" : "fills-desktop");
});

test("PF-8-07 ?halt=HALC: a market order is not filled; it waits in Open orders as 'Waits for reopen'", async ({ page }, info) => {
  const phone = isPhone(info.project.name);
  await openPaused(page, "&halt=HALC");
  await order(page, "market", "10");
  await newOrder(page);
  await toOrders(page, phone);
  await page.clock.runFor(10_000);
  await expect(ooRows(page)).toHaveCount(1);
  await expect(ooRows(page).first().getByTestId("br-oo-status")).toHaveText("Waits for reopen");
  await expect(fills(page)).toHaveCount(0);
  await expect(pf(page).getByTestId("pf-fills-empty")).toHaveText("No trades yet.");
});

test("PF-8-08 Orders panel colours: no --acc / --gain; --loss only in card 6's confirm; no primary button", async ({ page }, info) => {
  const phone = isPhone(info.project.name);
  await openPaused(page);
  await order(page, "market", "40");
  await bought(page);
  await newOrder(page);
  await order(page, "limit", "40", "42.10");
  await newOrder(page);
  await toOrders(page, phone);
  await runUntil(page, async () => (await fills(page).count()) === 1);
  const [acc, gain, loss] = await Promise.all(["--acc", "--gain", "--loss"].map((v) => color(page, `var(${v})`)));
  await page.mouse.move(0, 0);
  const idle = await colours(pf(page));
  for (const c of [acc, gain, loss]) expect(idle).not.toContain(c);
  const chip = fills(page).first().getByTestId("pf-fill-liq");
  expect(await chip.evaluate((e) => [getComputedStyle(e).color, getComputedStyle(e).borderTopColor])).toEqual([await color(page, "var(--fg)"), await color(page, "var(--steel)")]);
  await cancelBtn(ooRows(page).first()).click();
  await page.mouse.move(0, 0);
  const confirm = await colours(pf(page));
  for (const c of [acc, gain]) expect(confirm).not.toContain(c);
  const yes = ooRows(page).first().getByTestId("br-oo-yes");
  expect(await yes.evaluate((e) => getComputedStyle(e).color)).toBe(loss);
  const outsideConfirm = await pf(page).evaluate((root, l) => [root, ...root.querySelectorAll("*")]
    .filter((e) => !e.closest("[data-testid=br-oo-yes]"))
    .filter((e) => { const s = getComputedStyle(e); return [s.color, s.borderTopColor, s.backgroundColor].includes(l); }).length, loss);
  expect(outsideConfirm).toBe(0);
  expect(await pf(page).evaluate((el) => [...(el.closest(".win, .phone-appview") ?? el).querySelectorAll(".btn-primary")].filter((b) => (b as HTMLElement).offsetParent !== null).length)).toBe(0);
});

test("PF-8-09 ?empty=1: 'No open orders.' and 'No trades yet.'", async ({ page }, info) => {
  await openOrdersTab(page, "?empty=1", isPhone(info.project.name));
  await expect(oo(page).getByTestId("br-oo-empty")).toHaveText("No open orders.");
  await expect(pf(page).getByTestId("pf-fills-empty")).toHaveText("No trades yet.");
  await expect(pf(page).getByRole("button")).toHaveCount(0);
  await shot(page, "empty");
});

test("PF-8-09 states: loading skeletons; denied / error one Retry; stale one Updating…", async ({ page }, info) => {
  const phone = isPhone(info.project.name);
  await openOrdersTab(page, "?feed=loading", phone, "loading");
  await expect(pf(page)).toHaveAttribute("aria-busy", "true");
  await expect(pf(page).getByTestId("pf-orders-skel-row")).toHaveCount(6);
  await shot(page, "loading");
  for (const mode of ["denied", "error"]) {
    await openOrdersTab(page, `?feed=${mode}`, phone, mode);
    await expect(pf(page).getByTestId("pf-orders-error")).toHaveText("Couldn't loadRetry");
    await expect(pf(page).getByRole("alert")).toHaveText("Couldn't load");
    await expect(pf(page).getByRole("button", { name: "Retry" })).toHaveCount(1);
    await expect(pf(page).getByRole("button")).toHaveCount(1);
    if (mode === "error") await shot(page, "error");
  }
  await page.clock.install({ time: new Date("2026-10-27T12:00:00Z") });
  await openOrdersTab(page, "?feed=stale", phone);
  await page.clock.runFor(23_000);
  await expect(pf(page)).toHaveAttribute("data-state", "stale");
  await expect(pf(page).getByText("Updating…")).toHaveCount(1);
  await shot(page, "stale");
});

test("PF-8-10 1440: 7 column headers, rows ≥ 28 px; the 520 window: 2-line rows; no overflow", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await openPaused(page);
  await order(page, "market", "40");
  await bought(page);
  await newOrder(page);
  await order(page, "limit", "40", "42.10");
  await newOrder(page);
  await toOrders(page, false);
  await runUntil(page, async () => (await fills(page).count()) === 1);
  const win = page.getByTestId("win-portfolio").first();
  expect((await win.boundingBox())!.width).toBeGreaterThanOrEqual(640);
  await expect(pf(page).getByTestId("pf-fills")).toHaveAttribute("data-layout", "table");
  await expect(pf(page).locator("thead th")).toHaveText(["Side", "Asset", "Qty", "Price", "Fee", "Type", "Tick"]);
  for (const r of [...await fills(page).all(), ...await ooRows(page).all()]) expect((await r.boundingBox())!.height).toBeGreaterThanOrEqual(28);
  expect((await cancelBtn(ooRows(page).first()).boundingBox())!.height).toBeGreaterThanOrEqual(28);
  expect(await overflow(pf(page))).toEqual([]);
  await shot(page, "table");
  const handle = (await win.getByTestId("resize-handle").boundingBox())!;
  await page.mouse.move(handle.x + 5, handle.y + 5);
  await page.mouse.down();
  await page.mouse.move(50, handle.y + 5, { steps: 5 });
  await page.mouse.up();
  expect((await win.boundingBox())!.width).toBe(520);
  await expect(pf(page).getByTestId("pf-fills")).toHaveAttribute("data-layout", "rows-2");
  for (const r of await fills(page).all()) await expect(r.locator(".pf-fill-line")).toHaveCount(2);
  expect(await overflow(pf(page))).toEqual([]);
  expect(await outside(page, pf(page))).toEqual([]);
  await shot(page, "window-520");
});

for (const scale of ["1", "2"] as const) {
  test(`PF-8-11 phone scale ${scale}: nav row and Cancel ≥ 44, fills ${scale === "2" ? "3" : "2"} lines, no overflow, axe${scale === "1" ? ", cb / hc baselines" : ""}`, async ({ page }, info) => {
    phoneOnly(info.project.name);
    await page.clock.install({ time: new Date("2026-10-21T08:00:00Z") });
    await boot(page, "/settings");
    await setTextScale(page, scale);
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByTestId("icon-portfolio").click();
    const nav = page.getByTestId("pf-open-orders");
    await expect(nav).toBeVisible();
    expect((await nav.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.getByTestId("app-back").click();
    await page.getByTestId("icon-broker").click();
    await page.getByTestId("broker").first().getByTestId("br-asset-select").selectOption("HALC");
    await expect(br(page)).toHaveAttribute("data-state", "live");
    const now = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(new Date(now + 1_000));
    await order(page, "market", "40");
    await bought(page);
    await newOrder(page);
    await order(page, "limit", "40", "42.10");
    await newOrder(page);
    await toOrders(page, true);
    await runUntil(page, async () => (await fills(page).count()) === 1);
    await expect(page.getByTestId("app-title")).toHaveText("Orders");
    await expect(page.getByTestId("app-back")).toHaveAttribute("aria-label", "Back to Portfolio");
    await expect(pf(page).getByTestId("pf-fills")).toHaveAttribute("data-layout", scale === "2" ? "rows-3" : "rows-2");
    for (const r of await fills(page).all()) {
      await expect(r.locator(".pf-fill-line")).toHaveCount(scale === "2" ? 3 : 2);
      expect((await r.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    expect((await cancelBtn(ooRows(page).first()).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    expect(await overflow(pf(page))).toEqual([]);
    expect(await outside(page, pf(page))).toEqual([]);
    await shot(page, `phone-scale-${scale}`);
    await page.clock.resume(); // axe runs on timers
    expect(await axe(page)).toEqual([]);
    if (scale !== "1") return;
    await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 1_000));
    const mask = [pf(page).getByTestId("br-oo-meta"), pf(page).getByTestId("pf-fill-tick")];
    await pinHtml(page, "cb", true);
    await expect(pf(page)).toHaveScreenshot(["PF-8", "cb-390x844.png"], { mask });
    await shot(page, "cb");
    await pinHtml(page, "cb", false);
    await pinHtml(page, "hc", true);
    await expect.poll(() => fills(page).first().evaluate((e) => getComputedStyle(e).borderBottomColor)).toBe(SPEC_COLOUR.fgMuted);
    await expect(pf(page)).toHaveScreenshot(["PF-8", "hc-390x844.png"], { mask });
    await shot(page, "hc");
    await pinHtml(page, "hc", false);
  });
}

test("PF-8-12 FR: Ordres, NNBSP grouping, fee with NNBSP before ':' in the row's name", async ({ page }, info) => {
  const phone = isPhone(info.project.name);
  await openPaused(page, "&locale=fr");
  await order(page, "market", "1200");
  const title = br(page).getByTestId("br-ack-title");
  await runUntil(page, async () => /^Achat|^Acheté/.test((await title.textContent()) ?? ""));
  await newOrder(page);
  await toOrders(page, phone);
  await runUntil(page, async () => (await fills(page).count()) === 1);
  const f = fills(page).first();
  await expect(f.getByTestId("pf-fill-liq")).toHaveText("Preneur");
  await expect(f.getByTestId(phone ? "pf-fill-qtyat" : "pf-fill-qty")).toHaveText(phone ? /^1\u202F200 @ [\d\u202F]+,\d\d$/ : "1\u202F200");
  await expect(f).toHaveAttribute("aria-label", /^Achat 1\u202F200 HALC à [\d\u202F]+,\d\d, frais\u202F: [\d\u202F]+,\d\d [A-Z]+, Preneur, tick \d+$/);
  if (phone) await expect(page.getByTestId("app-title")).toHaveText("Ordres");
  else await expect(page.getByTestId("win-portfolio").first().getByRole("tab", { name: "Ordres" })).toHaveAttribute("aria-selected", "true");
  expect(await overflow(pf(page))).toEqual([]);
  await shot(page, phone ? "fr" : "fr-desktop");
});
